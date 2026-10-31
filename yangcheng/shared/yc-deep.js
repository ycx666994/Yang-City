/* ==========================================================================
   YC-Deep 1.0 · 杨城深度层
   --------------------------------------------------------------------------
   五馆共用：展品长廊（8 件）· 两级证书（参观 / 精英）· 进度
   零依赖。Node 可直接 require（DOM 部分自动跳过）。
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YCDeep = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var KEY = "yc.deep.v1";
  var HALLS = ["H2", "H3", "H4", "H5", "H6"];

  /* ---------------- 存储 ---------------- */
  function readAll() {
    try {
      var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(KEY) : null;
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function writeAll(o) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* 配额满或隐私模式：静默失败，不影响参观 */ }
    return o;
  }
  function st(hall) {
    var all = readAll();
    if (!all[hall]) all[hall] = { seen: {}, quiz: {}, elite: null, certs: {}, play: {} };
    var s = all[hall];
    s.seen = s.seen || {}; s.quiz = s.quiz || {}; s.certs = s.certs || {}; s.play = s.play || {};
    return s;
  }
  function commit(hall, s) {
    var all = readAll();
    all[hall] = s;
    return writeAll(all);
  }

  /* ---------------- 展品登记 ---------------- */
  var SPECS = {};

  function register(hall, spec) {
    spec = spec || {};
    var prev = SPECS[hall] || {};
    /* 合并而不是覆盖：馆主页注册完整展品表，玩法页只补一个 name，
       两边谁先加载都不该把对方的内容抹掉。 */
    SPECS[hall] = {
      hall: hall,
      name: spec.name || prev.name || hall,
      items: spec.items || prev.items || [],
      game: spec.game || prev.game || null
    };
    return SPECS[hall];
  }
  function specOf(hall) { return SPECS[hall] || null; }
  function itemsOf(hall) { var s = SPECS[hall]; return s ? s.items : []; }

  /* ---------------- 进度 ---------------- */
  function progress(hall) {
    var s = st(hall), items = itemsOf(hall);
    var seen = 0, passed = 0;
    items.forEach(function (it) {
      if (s.seen[it.id]) seen++;
      if (s.quiz[it.id]) passed++;
    });
    var total = items.length || 8;
    return {
      hall: hall,
      total: total,
      seen: seen,
      passed: passed,
      pct: total ? Math.round((passed / total) * 100) : 0,
      visitorReady: total > 0 && passed >= total,
      elite: s.elite || null
    };
  }
  /* 驻馆人需要知道「你干了什么」——不然他只能站着。
     这里只广播事件，不关心谁在听：没人听时零成本，有人听时人就活了。 */
  function ping(hall, ev, data) {
    try {
      window.dispatchEvent(new CustomEvent("yc:deep", { detail: { hall: hall, ev: ev, data: data || {} } }));
    } catch (e) {}
  }
  function markSeen(hall, id) {
    var s = st(hall);
    var fresh = !s.seen[id];
    if (fresh) { s.seen[id] = Date.now(); commit(hall, s); }
    if (fresh) ping(hall, "seen", { id: id });
    return progress(hall);
  }
  function markQuiz(hall, id, ok) {
    var s = st(hall);
    var fresh = !s.seen[id];
    if (ok) s.quiz[id] = Date.now();
    if (fresh) s.seen[id] = Date.now();
    commit(hall, s);
    if (fresh && !ok) ping(hall, "seen", { id: id });
    ping(hall, ok ? "pass" : "fail", { id: id });
    return progress(hall);
  }

  /* ---------------- 证书 ---------------- */
  /* 编号规则：YC-<HALL>-<V|E>-<YYMMDD>-<6位>   */
  function rnd6() {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return { iso: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()), short: String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) };
  }

  var TIER = {
    visitor: { code: "V", cn: "参观证书", en: "CERTIFICATE OF VISIT", rank: 1 },
    elite: { code: "E", cn: "精英证书", en: "CERTIFICATE OF MASTERY", rank: 2 }
  };

  function issueCert(hall, tier, meta) {
    meta = meta || {};
    var t = TIER[tier] || TIER.visitor;
    var d = today();
    var cert = {
      protocol: "YC-Cert 1.0",
      hall: hall,
      hallName: (SPECS[hall] && SPECS[hall].name) || hall,
      tier: tier,
      tierName: t.cn,
      holder: meta.holder || "参观者",
      no: "YC-" + hall + "-" + t.code + "-" + d.short + "-" + rnd6(),
      date: d.iso,
      play: meta.play || null,       /* 玩法名 */
      score: meta.score != null ? meta.score : null,
      detail: meta.detail || [],
      checksum: ""
    };
    cert.checksum = fnv([cert.no, cert.hall, cert.tier, cert.date, cert.holder, String(cert.score)].join("|"));
    var s = st(hall);
    s.certs[tier] = cert;
    if (tier === "elite") s.elite = { at: Date.now(), play: cert.play, score: cert.score, detail: cert.detail };
    commit(hall, s);
    ping(hall, tier === "elite" ? "elite" : "visit", { no: cert.no, play: cert.play, score: cert.score });
    return cert;
  }
  function getCert(hall, tier) { return st(hall).certs[tier] || null; }
  function allCerts() {
    var all = readAll(), out = [];
    Object.keys(all).forEach(function (h) {
      var c = (all[h].certs || {});
      if (c.visitor) out.push(c.visitor);
      if (c.elite) out.push(c.elite);
    });
    return out;
  }
  function eliteCount() {
    return allCerts().filter(function (c) { return c.tier === "elite"; }).length;
  }

  /* ---------------- 证书 SVG ---------------- */
  /* 深色烫金 / 浅色纸本两套皮，按馆配色传入 accent */
  function certSVG(cert, opt) {
    opt = opt || {};
    var accent = opt.accent || "#c9a227";
    var ink = opt.ink || "#f2ece0";
    var paper = opt.paper || "#0e1218";
    var elite = cert.tier === "elite";
    var W = 900, H = 620;
    var esc = function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
      });
    };
    var detail = (cert.detail || []).slice(0, 4);
    var rows = detail.map(function (d, i) {
      return '<text x="110" y="' + (430 + i * 30) + '" font-family="ui-monospace,Consolas,monospace" font-size="15" fill="' +
        esc(ink) + '" opacity="0.78">· ' + esc(d) + '</text>';
    }).join("");
    var seal = elite
      ? '<circle cx="760" cy="500" r="58" fill="none" stroke="' + accent + '" stroke-width="2.5" opacity="0.9"/>' +
        '<circle cx="760" cy="500" r="48" fill="none" stroke="' + accent + '" stroke-width="1" opacity="0.55"/>' +
        '<text x="760" y="494" text-anchor="middle" font-size="20" font-weight="700" fill="' + accent + '">精英</text>' +
        '<text x="760" y="518" text-anchor="middle" font-size="11" letter-spacing="2" fill="' + accent + '" opacity="0.85">MASTERY</text>'
      : '<circle cx="760" cy="500" r="58" fill="none" stroke="' + accent + '" stroke-width="1.6" opacity="0.55"/>' +
        '<text x="760" y="496" text-anchor="middle" font-size="18" font-weight="600" fill="' + accent + '" opacity="0.85">参观</text>' +
        '<text x="760" y="518" text-anchor="middle" font-size="10" letter-spacing="2" fill="' + accent + '" opacity="0.6">VISIT</text>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
      '<defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + paper + '"/><stop offset="1" stop-color="' + paper + '" stop-opacity="0.86"/></linearGradient></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#cg)"/>' +
      '<rect x="26" y="26" width="' + (W - 52) + '" height="' + (H - 52) + '" fill="none" stroke="' + accent + '" stroke-width="' + (elite ? 2.4 : 1.2) + '" opacity="' + (elite ? 0.85 : 0.45) + '"/>' +
      '<rect x="36" y="36" width="' + (W - 72) + '" height="' + (H - 72) + '" fill="none" stroke="' + accent + '" stroke-width="0.8" opacity="0.28"/>' +
      (elite ? '<path d="M26 26 L120 26 L26 120 Z" fill="' + accent + '" opacity="0.18"/>' : "") +
      '<text x="' + (W / 2) + '" y="108" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="13" letter-spacing="6" fill="' + accent + '" opacity="0.9">' + TIER[cert.tier].en + '</text>' +
      '<text x="' + (W / 2) + '" y="176" text-anchor="middle" font-family="Songti SC,SimSun,serif" font-size="44" font-weight="700" fill="' + ink + '">' + esc(cert.tierName) + '</text>' +
      '<text x="' + (W / 2) + '" y="212" text-anchor="middle" font-family="Songti SC,SimSun,serif" font-size="17" fill="' + ink + '" opacity="0.66">' + esc(cert.hallName) + ' · 杨城</text>' +
      '<line x1="150" y1="244" x2="' + (W - 150) + '" y2="244" stroke="' + accent + '" stroke-width="1" opacity="0.4"/>' +
      '<text x="110" y="300" font-family="Songti SC,SimSun,serif" font-size="15" fill="' + ink + '" opacity="0.55">兹证明</text>' +
      '<text x="180" y="304" font-family="Songti SC,SimSun,serif" font-size="26" font-weight="600" fill="' + ink + '">' + esc(cert.holder) + '</text>' +
      '<text x="110" y="348" font-family="Songti SC,SimSun,serif" font-size="15" fill="' + ink + '" opacity="0.72">' +
      (elite ? '已完成本馆的精英挑战「' + esc(cert.play || "未命名") + '」，' : '已逐件看完本馆八件展品并答对全部现场问题，') + '</text>' +
      '<text x="110" y="378" font-family="Songti SC,SimSun,serif" font-size="15" fill="' + ink + '" opacity="0.72">' +
      (elite ? '并能说明每一步判断所依据的判据。' : '能说出每件展品失效的机制与判据。') + '</text>' +
      rows +
      seal +
      '<text x="110" y="556" font-family="ui-monospace,Consolas,monospace" font-size="12" fill="' + ink + '" opacity="0.5">编号 ' + esc(cert.no) + '</text>' +
      '<text x="' + (W - 110) + '" y="556" text-anchor="end" font-family="ui-monospace,Consolas,monospace" font-size="12" fill="' + ink + '" opacity="0.5">' + esc(cert.date) + ' · 校验 ' + esc(cert.checksum) + '</text>' +
      (cert.score != null ? '<text x="110" y="' + (430 + detail.length * 30 + 6) + '" font-family="ui-monospace,Consolas,monospace" font-size="14" fill="' + accent + '">得分 ' + cert.score + '</text>' : "") +
      '</svg>';
  }

  function download(cert, opt) {
    if (typeof document === "undefined") return null;
    var svg = certSVG(cert, opt);
    var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = cert.no + ".svg";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
    return a.download;
  }

  /* ---------------- 展品长廊（DOM） ---------------- */
  /* 结构：8 张卡，点开变详情；每张卡带一道现场题，答对才算「看过」 */
  function mountGallery(box, hall, opt) {
    if (!box) return null;
    opt = opt || {};
    var items = itemsOf(hall);
    var cur = -1;
    var accent = opt.accent || "#8fb7ff";

    function paint() {
      /* 每次重绘都重新读一遍存储。挂载时缓存的 s 是快照，
         答完题不会回写到它 —— 那样卡片永远停在「待识破」。 */
      var s = st(hall);
      var p = progress(hall);
      var H = [];
      H.push('<div class="dpg-head">' +
        '<div class="dpg-t">展品长廊 <em>' + p.passed + ' / ' + p.total + ' 已答对</em></div>' +
        '<div class="dpg-bar"><i style="width:' + p.pct + '%;background:' + accent + '"></i></div>' +
        '<div class="dpg-note">' + (p.visitorReady ? '八件全通 · 可领参观证书' : '逐件点开，答对现场题才算看过') + '</div>' +
        '</div>');

      H.push('<div class="dpg-grid">');
      items.forEach(function (it, i) {
        var done = !!s.quiz[it.id];
        H.push('<button class="dpg-c' + (done ? " done" : "") + (cur === i ? " on" : "") + '" data-i="' + i + '"' +
          ' style="--ac:' + accent + '">' +
          '<span class="dpg-no">' + it.no + '</span>' +
          '<span class="dpg-ic">' + (it.icon || "◆") + '</span>' +
          '<span class="dpg-nm">' + esc(it.name) + '</span>' +
          '<span class="dpg-sy">' + esc(it.symptom) + '</span>' +
          '<span class="dpg-st">' + (done ? "✓ 已识破" : "待识破") + '</span>' +
          '</button>');
      });
      H.push('</div>');

      H.push('<div class="dpg-detail" id="dpgDetail">');
      if (cur < 0) {
        H.push('<div class="dpg-empty">选一件展品。<b>八件展品对应本馆的八个失效侧面</b>——它们不是八个知识点，' +
          '是同一台仪器能做出的八种不同诊断。答对现场题，进度才往前走。</div>');
      } else {
        var it = items[cur];
        var q = it.quiz;
        var answered = !!s.quiz[it.id];
        H.push('<div class="dpg-dh"><span class="dpg-dno">' + it.no + '</span>' +
          '<span class="dpg-dnm">' + esc(it.name) + '</span>' +
          '<span class="dpg-dsy">' + esc(it.symptom) + '</span></div>');
        H.push('<div class="dpg-cols">');
        H.push('<div class="dpg-col"><h4>机制</h4><p>' + it.mech + '</p></div>');
        H.push('<div class="dpg-col"><h4>判据</h4><p>' + it.judge + '</p></div>');
        H.push('<div class="dpg-col"><h4>真实案例</h4><p>' + it.real + '</p></div>');
        H.push('</div>');
        if (it.verify) {
          H.push('<div class="dpg-verify"><button class="dpg-vb" data-v="' + cur + '">▶ 现场验证这件展品</button>' +
            '<span class="dpg-vr" id="dpgVr">点一下，用本馆内核当场跑一次对照。</span></div>');
        }
        if (q) {
          H.push('<div class="dpg-quiz"><div class="dpg-qt">现场题 · ' + esc(q.q) + '</div>');
          H.push('<div class="dpg-opts">');
          q.opts.forEach(function (o, k) {
            H.push('<button class="dpg-opt' + (answered && k === q.a ? " ok" : "") + '" data-o="' + k + '">' +
              String.fromCharCode(65 + k) + '　' + esc(o) + '</button>');
          });
          H.push('</div>');
          H.push('<div class="dpg-qr" id="dpgQr">' + (answered ? "✓ 已答对。这一件算识破。" : "") + '</div>');
          H.push('</div>');
        }
        H.push('</div>');
      }
      box.innerHTML = H.join("");
    }

    box.addEventListener("click", function (e) {
      var c = e.target.closest(".dpg-c");
      if (c) { cur = +c.dataset.i; markSeen(hall, items[cur].id); paint(); return; }
      var vb = e.target.closest(".dpg-vb");
      if (vb) {
        var it = items[+vb.dataset.v];
        var out = null;
        try { out = it.verify ? it.verify() : null; } catch (err) { out = { label: "验证失败", value: "—", note: String(err && err.message || err) }; }
        var vr = box.querySelector("#dpgVr");
        if (vr && out) {
          vr.innerHTML = '<b style="color:' + accent + '">' + esc(out.label) + '</b>　<span class="dpg-vv">' +
            esc(out.value) + '</span>' + (out.note ? '　<span class="dpg-vn">' + esc(out.note) + '</span>' : "");
        }
        return;
      }
      var o = e.target.closest(".dpg-opt");
      if (o) {
        var it2 = items[cur], k = +o.dataset.o, ok = (k === it2.quiz.a);
        var qr = box.querySelector("#dpgQr");
        var all = box.querySelectorAll(".dpg-opt");
        for (var i = 0; i < all.length; i++) all[i].classList.remove("ok", "no");
        o.classList.add(ok ? "ok" : "no");
        if (ok) {
          markQuiz(hall, it2.id, true);
          if (qr) qr.innerHTML = "✓ 正确。" + (it2.quiz.why ? " " + esc(it2.quiz.why) : "");
          var nm = box.querySelector('.dpg-c[data-i="' + cur + '"]');
          if (nm) { nm.classList.add("done"); nm.querySelector(".dpg-st").textContent = "✓ 已识破"; }
          var p = progress(hall);
          var t = box.querySelector(".dpg-t em");
          if (t) t.textContent = p.passed + " / " + p.total + " 已答对";
          var bar = box.querySelector(".dpg-bar i");
          if (bar) bar.style.width = p.pct + "%";
          var note = box.querySelector(".dpg-note");
          if (note) note.textContent = p.visitorReady ? "八件全通 · 可领参观证书" : "逐件点开，答对现场题才算看过";
          if (opt.onProgress) { try { opt.onProgress(p); } catch (e2) {} }
        } else {
          if (qr) qr.innerHTML = '<span style="color:#ff8f8f">再想想。' +
            (it2.quiz.hint ? " 提示：" + esc(it2.quiz.hint) : "") + '</span>';
        }
        return;
      }
    });

    paint();
    return { repaint: paint, progress: function () { return progress(hall); } };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------------- 证书面板（DOM） ---------------- */
  function mountCerts(box, hall, opt) {
    if (!box) return null;
    opt = opt || {};
    var accent = opt.accent || "#c9a227";
    var paper = opt.paper || "#0e1218";
    var ink = opt.ink || "#f2ece0";

    function paint() {
      var p = progress(hall);
      var v = getCert(hall, "visitor"), e2 = getCert(hall, "elite");
      var H = [];
      H.push('<div class="dpc-wrap">');

      H.push('<div class="dpc-card' + (v ? " has" : "") + '">' +
        '<div class="dpc-h"><span class="dpc-k">一级</span><span class="dpc-n">参观证书</span></div>' +
        '<div class="dpc-d">看完八件展品并答对全部现场题即可领取。' +
        (v ? '' : '当前进度 ' + p.passed + ' / ' + p.total + '。') + '</div>' +
        '<div class="dpc-act">' +
        (v ? '<span class="dpc-no">' + esc(v.no) + '</span><button class="dpc-b" data-dl="visitor">下载</button>'
          : (p.visitorReady
            ? '<button class="dpc-b" data-get="visitor">领取参观证书</button>'
            : '<button class="dpc-b" data-get="visitor" disabled>还差 ' + (p.total - p.passed) + ' 件</button>')) +
        '</div></div>');

      H.push('<div class="dpc-card elite' + (e2 ? " has" : "") + '">' +
        '<div class="dpc-h"><span class="dpc-k">二级</span><span class="dpc-n">精英证书</span></div>' +
        '<div class="dpc-d">' + esc((opt.game && opt.game.brief) || "完成本馆的精英挑战。") + '</div>' +
        '<div class="dpc-act">' +
        (e2 ? '<span class="dpc-no">' + esc(e2.no) + '</span><button class="dpc-b" data-dl="elite">下载</button>'
          : '<button class="dpc-b" data-go="1">进入挑战 →</button>') +
        '</div></div>');

      H.push('</div>');
      box.innerHTML = H.join("");
    }

    box.addEventListener("click", function (e) {
      var g = e.target.closest("[data-get]");
      if (g && !g.disabled) {
        var c = issueCert(hall, g.dataset.get, { holder: opt.holder || "参观者" });
        paint();
        if (opt.onIssue) opt.onIssue(c);
        return;
      }
      var d = e.target.closest("[data-dl]");
      if (d) { var cert = getCert(hall, d.dataset.dl); if (cert) download(cert, { accent: accent, paper: paper, ink: ink }); return; }
      var go = e.target.closest("[data-go]");
      if (go && opt.gameHref) location.href = opt.gameHref;
    });

    paint();
    return { repaint: paint };
  }

  return {
    VERSION: VERSION,
    HALLS: HALLS,
    TIER: TIER,
    register: register,
    specOf: specOf,
    itemsOf: itemsOf,
    progress: progress,
    markSeen: markSeen,
    markQuiz: markQuiz,
    issueCert: issueCert,
    getCert: getCert,
    allCerts: allCerts,
    eliteCount: eliteCount,
    certSVG: certSVG,
    download: download,
    mountGallery: mountGallery,
    mountCerts: mountCerts,
    checksum: fnv
  };
});

(function () {
  "use strict";

  var C = window.YCContam, E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; };
  var pct = function (x) { return x == null ? "—" : Math.round(x * 100) + "%"; };
  var f2 = function (x) { return x == null ? "—" : (+x).toFixed(2); };
  var f3 = function (x) { return x == null ? "—" : (+x).toFixed(3); };

  var VERDICT_UI = {
    supported:    { t: "记忆主导", cls: "ok" },
    refuted:      { t: "未见表面锁定", cls: "idle" },
    noeffect:     { t: "未检出暴露优势", cls: "idle" },
    undetermined: { t: "不可判定", cls: "warn" },
    conflict:     { t: "结果冲突", cls: "bad" }
  };
  var SUB_UI = {
    stale: "回吐型", ceiling: "天花板", compute: "在算", mixed: "混合",
    vacuous: "变体失效", probe: "探针未接通", n: "样本不足", straddle: "区间跨界",
    label: "标签污染", noadv: "无暴露优势", none: "—"
  };
  var CH_UI = {
    ok:    { s: "正常", c: "ok" },
    drift: { s: "难度漂移", c: "warn" },
    blind: { s: "无分辨力", c: "off" },
    off:   { s: "未接通", c: "off" }
  };

  var st = {
    mem: 0.95, rewrite: 0.45, noise: 0, n: 96,
    seed: 20261030,
    last: null,
    sel: -1,
    selfDone: false
  };

  /* ---------------- 房间切换 ---------------- */
  function initDoors() {
    var doors = document.querySelectorAll(".h4rail .door");
    Array.prototype.forEach.call(doors, function (b) {
      b.addEventListener("click", function () { setRoom(b.getAttribute("data-l")); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      var map = { "1": "story", "2": "shelf", "3": "check", "4": "hand", "5": "deep" };
      if (map[e.key]) setRoom(map[e.key]);
    });
  }

  function setRoom(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".h4rail .door"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-l") === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".room"), function (s) {
      s.classList.toggle("on", s.getAttribute("data-l") === name);
    });
    if (name === "check" && !st.selfDone) { st.selfDone = true; runSelfCheck(); }
  }

  /* ---------------- 旋钮 ---------------- */
  function paintKnob(el) {
    var min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty("--p", ((v - min) / (max - min) * 100).toFixed(1) + "%");
  }

  var deb = null;
  function initKnobs() {
    var map = [
      ["kMem", "vMem", function (v) { st.mem = v / 100; return (v / 100).toFixed(2); }],
      ["kRewrite", "vRewrite", function (v) { st.rewrite = v / 100; return (v / 100).toFixed(2); }],
      ["kNoise", "vNoise", function (v) { st.noise = v / 100; return (v / 100).toFixed(2); }],
      ["kN", "vN", function (v) { st.n = v; return String(v); }]
    ];
    map.forEach(function (m) {
      var el = $(m[0]);
      paintKnob(el);
      el.addEventListener("input", function () {
        $(m[1]).textContent = m[2](+el.value);
        paintKnob(el);
        clearTimeout(deb);
        deb = setTimeout(run, 150);
      });
    });
  }

  /* ---------------- 一次运行 ---------------- */
  function run() {
    if (!C) return;
    var t0 = performance.now();
    var r = C.runAudit({
      seed: st.seed, mem: st.mem, rewrite: st.rewrite,
      labelNoise: st.noise, n: st.n, boot: 320
    });
    r.ms = Math.round(performance.now() - t0);
    st.last = r;
    renderBench(r);
    renderShelf(r);
    if (st.sel >= 0 && st.sel < r.rows.length) renderDrawer(r, st.sel);
    else clearDrawer();
    $("benchK").textContent = "n=" + r.meta.n + " · " + r.ms + "ms";
  }

  /* ---------------- 取证栏 ---------------- */
  function renderBench(r) {
    var e = r.est;

    $("barA").style.width = (e.accA * 100).toFixed(1) + "%";
    $("barB").style.width = (e.accB * 100).toFixed(1) + "%";
    $("barC").style.width = (e.accC * 100).toFixed(1) + "%";
    $("valA").textContent = f2(e.accA);
    $("valB").textContent = f2(e.accB);
    $("valC").textContent = f2(e.accC);
    $("aref").innerHTML = "参照组（关闭记忆）　甲 " + f2(e.refA) + "　乙 " + f2(e.refB) +
      "　丙 " + f2(e.refC) + "<br>甲−丙 = " + ((e.accA - e.accC) * 100).toFixed(1) +
      "pp　乙−丙 = " + ((e.accB - e.accC) * 100).toFixed(1) + "pp";

    /* 通道 */
    var ca = CH_UI[r.channels.acc], ct = CH_UI[r.channels.trace];
    $("chanAcc").className = "chan " + ca.c;
    $("chanAccS").textContent = ca.s;
    $("chanTrace").className = "chan " + ct.c;
    $("chanTraceS").textContent = ct.s;

    /* 主估计 */
    var k = e.kappa;
    $("kVal").innerHTML = (k == null ? "—" : (k * 100).toFixed(0)) + "<small>%</small>";
    $("kCi").textContent = e.ci
      ? "95% 区间 [" + f2(e.ci[0]) + ", " + f2(e.ci[1]) + "]"
      : "区间无法给出";
    if (k != null) {
      $("kPin").style.left = (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + "%";
    }
    if (e.ci) {
      $("kWin").style.left = (e.ci[0] * 100).toFixed(1) + "%";
      $("kWin").style.width = ((e.ci[1] - e.ci[0]) * 100).toFixed(1) + "%";
    } else {
      $("kWin").style.width = "0";
    }
    $("kEx").innerHTML = "R = " + pct(e.R) + "（乙架上答出原题答案的比例）<br>" +
      "R₀ = " + pct(e.R0) + "（参照组在同一批题上的偶然水平）";

    /* 变体失效 / 探针未接通：数字算得出来，但这套设计提供不了信息。
       不把它藏起来 —— 藏起来就看不到"一个看起来很自信的数字其实无意义"。 */
    var voided = r.verdict === "undetermined" && (r.subtype === "vacuous" || r.subtype === "probe");
    var kb = document.querySelector(".kbig");
    kb.classList.toggle("void", voided);
    $("kBadge").textContent = voided
      ? (r.subtype === "vacuous" ? "这个数字作废 · 变体没有改变答案" : "这个数字作废 · 探针没接上记忆通道")
      : "这个数字作废 · 见下方守卫";

    /* 结论 */
    var v = VERDICT_UI[r.verdict] || VERDICT_UI.undetermined;
    $("vBox").className = "vbox " + v.cls;
    $("vTitle").innerHTML = v.t + '<span class="tag">' + (SUB_UI[r.subtype] || r.subtype) + "</span>";
    $("vWhy").textContent = r.why;

    /* 守卫 */
    $("guardList").innerHTML = r.guards.map(function (g) {
      return '<div class="gd ' + (g.ok ? "ok" : "no") + '">' +
        '<span class="gi">' + (g.ok ? "✓" : "!") + "</span>" +
        "<span><span class=\"gn\">" + g.label + '</span>' +
        '<span class="gdet">' + g.detail + "</span></span></div>";
    }).join("");
  }

  /* ---------------- 层架 ---------------- */
  function segsHTML(segs) {
    return segs.map(function (s) {
      if (s.t !== "n") return esc(s.v);
      return s.chg ? '<span class="chg">' + s.v + "</span>" : String(s.v);
    }).join("");
  }
  function segsPlain(segs) {
    return segs.map(function (s) { return String(s.v); }).join("");
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderShelf(r) {
    var e = r.est;
    $("shA").textContent = f2(e.accA);
    $("shB").textContent = f2(e.accB);
    $("shC").textContent = f2(e.accC);
    $("shRefA").textContent = "参照 " + f2(e.refA);
    $("shRefB").textContent = "参照 " + f2(e.refB);
    $("shRefC").textContent = "参照 " + f2(e.refC);

    var tiers = ["A", "B", "C"];
    var html = [];
    for (var i = 0; i < r.rows.length; i++) {
      var row = r.rows[i];
      var sel = i === st.sel ? " sel" : "";
      html.push('<div class="srow' + sel + '" data-i="' + i + '">');
      html.push('<div class="gut">' + pad(i + 1, 2) + "</div>");
      for (var j = 0; j < 3; j++) {
        var c = row[tiers[j]];
        var cls = "cell " + (c.ok ? "ok" : "bad");
        if (c.stale) cls += " stale";
        var mk = c.ok ? "✓ 对" : (c.stale ? "✗ 回吐" : "✗ 算错");
        var prev = segsPlain(c.segs);
        var cl = prev.split("，");
        prev = cl.length > 2 ? cl.slice(0, 2).join("，") + "…"
                             : (prev.length > 26 ? prev.slice(0, 26) + "…" : prev);
        /* 第二行放数字签名：改动的那一个数永远完整可见，不会被省略号吃掉 */
        var sig = c.segs.filter(function (x) { return x.t === "n"; }).map(function (x) {
          return x.chg ? '<span class="chg">' + x.v + "</span>" : String(x.v);
        }).join("<i>·</i>");
        html.push('<div class="' + cls + '">' +
          '<div class="qt">' + esc(prev) + "</div>" +
          '<div class="fb"><span class="sig">' + sig + "</span>" +
          '<span class="ans">→' + c.ans + "</span>" +
          '<span class="mk">' + mk + "</span></div></div>");
      }
      html.push("</div>");
    }
    $("shelfBody").innerHTML = html.join("");

    Array.prototype.forEach.call($("shelfBody").querySelectorAll(".srow"), function (el) {
      el.addEventListener("click", function () {
        st.sel = +el.getAttribute("data-i");
        Array.prototype.forEach.call($("shelfBody").querySelectorAll(".srow"), function (x) {
          x.classList.toggle("sel", x === el);
        });
        renderDrawer(r, st.sel);
      });
    });
  }

  function clearDrawer() {
    $("drawer").innerHTML = '<div class="dempty">' +
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">' +
      '<rect x="1.5" y="4" width="13" height="10" rx="1.5"/><path d="M1.5 7h13"/></svg>' +
      "点任一张卡，把同一题组的三件抽出来并排看</div>";
  }

  function renderDrawer(r, i) {
    var row = r.rows[i];
    var names = { A: "甲 · 原题", B: "乙 · 改数", C: "丙 · 新题" };
    var keys = ["A", "B", "C"];
    var html = keys.map(function (k) {
      var c = row[k];
      var note = c.ok ? "答对" : (c.stale ? "答出原题答案" : "算错");
      return '<div class="dcard">' +
        '<div class="dh"><span>题组 ' + pad(i + 1, 2) + " · " + k + "</span>" +
        '<span class="dv">' + names[k] + "</span></div>" +
        '<div class="dt">' + segsHTML(c.segs) + "</div>" +
        '<div class="df"><span>答 <b>' + c.ans + "</b></span>" +
        "<span>" + note + "</span>" +
        '<span style="margin-left:auto">' + (c.via === "recall" ? "记忆命中 " + c.rho.toFixed(2) : "计算") +
        "</span></div></div>";
    }).join("");
    $("drawer").innerHTML = html;
  }

  /* ---------------- 自检 ---------------- */
  function runSelfCheck() {
    if (!C) return;

    /* 15 次已知真值 */
    var sc = C.selfCheck({ n: 96 });
    $("scSum").textContent = "MAE " + sc.mae.toFixed(3) + " · 覆盖 " + sc.coverage + " · " + sc.ms + "ms";
    $("scBody").innerHTML = sc.rows.map(function (x) {
      return '<tr class="' + (x.hit ? "hit" : "") + '">' +
        "<td>" + x.truth.toFixed(3) + "</td>" +
        "<td>" + x.seed + "</td>" +
        "<td>" + f3(x.kappa) + "</td>" +
        "<td>[" + (x.ci ? x.ci[0].toFixed(2) + ", " + x.ci[1].toFixed(2) : "—") + "]</td>" +
        "<td>" + x.err.toFixed(3) + "</td>" +
        '<td class="' + (x.hit ? "ok" : "bad") + '">' + (x.hit ? "✓" : "✗") + "</td>" +
        "<td>" + (SUB_UI[x.subtype] || x.subtype) + "</td></tr>";
    }).join("");

    /* 四个负例 */
    var negs = C.negatives();
    $("negList").innerHTML = negs.map(function (x) {
      return '<button class="negb ' + (x.passed ? "pass" : "fail") + '" data-neg="' + x.id + '">' +
        '<div class="nt"><span class="nb">' + (x.passed ? "PASS" : "FAIL") + "</span>" + x.name + "</div>" +
        '<div class="nd">' + x.desc + "</div>" +
        '<div class="nr">' + (VERDICT_UI[x.verdict] || {}).t + " · " + (SUB_UI[x.subtype] || x.subtype) +
        "　κ̂ " + f2(x.kappa) + "</div></button>";
    }).join("");
    Array.prototype.forEach.call($("negList").querySelectorAll(".negb"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-neg");
        var x = negs.filter(function (y) { return y.id === id; })[0];
        if (x) $("vWhy").textContent = x.why;
      });
    });

    /* 窗口扫描 */
    renderSweep(C.sweep({ n: 96 }));

    /* 参照体检 */
    var refs = C.refCheck({ n: 96 });
    $("refList").innerHTML = refs.map(function (x) {
      return '<div class="gd ' + (x.certified ? "ok" : "no") + '">' +
        '<span class="gi">' + (x.certified ? "✓" : "!") + "</span>" +
        '<span><span class="gn">' + x.name + " · " + x.desc + "</span>" +
        '<span class="gdet">' + x.detail + "　→ " + (x.certified ? "认证通过" : "认证失败，难度校准作废") +
        "</span></span></div>";
    }).join("");
  }

  /* ---------------- 窗口扫描图 ---------------- */
  function renderSweep(data) {
    var W = 520, H = 158, L = 34, R = 10, T = 12, B = 26;
    var iw = W - L - R, ih = H - T - B;
    var xs = data.map(function (d) { return d.rewrite; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var X = function (v) { return L + (v - x0) / (x1 - x0) * iw; };
    var Y = function (v) { return T + (1 - Math.max(0, Math.min(1, v))) * ih; };

    var s = ['<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">'];

    /* 有效窗口底色 */
    var runs = [], cur = null;
    data.forEach(function (d) {
      if (d.usable) {
        if (!cur) { cur = [d.rewrite, d.rewrite]; runs.push(cur); }
        else cur[1] = d.rewrite;
      } else cur = null;
    });
    runs.forEach(function (r) {
      var a = X(r[0]) - 9, b = X(r[1]) + 9;
      s.push('<rect x="' + a.toFixed(1) + '" y="' + T + '" width="' + (b - a).toFixed(1) +
        '" height="' + ih + '" fill="rgba(53,207,168,.10)"/>');
    });

    /* 判定边界 */
    [[0.25, "0.25"], [0.60, "0.60"]].forEach(function (g) {
      s.push('<line x1="' + L + '" y1="' + Y(g[0]).toFixed(1) + '" x2="' + (W - R) +
        '" y2="' + Y(g[0]).toFixed(1) + '" stroke="rgba(112,190,164,.22)" stroke-dasharray="3 4"/>');
      s.push('<text x="' + (L - 5) + '" y="' + (Y(g[0]) + 3).toFixed(1) +
        '" text-anchor="end" font-size="8" fill="#40564e" font-family="monospace">' + g[1] + "</text>");
    });
    s.push('<text x="' + (L - 5) + '" y="' + (T + 4) + '" text-anchor="end" font-size="8" fill="#40564e" font-family="monospace">1.0</text>');
    s.push('<text x="' + (L - 5) + '" y="' + (T + ih + 3) + '" text-anchor="end" font-size="8" fill="#40564e" font-family="monospace">0</text>');

    /* 折线：可用的连实线，不可用的断开 */
    var seg = [];
    data.forEach(function (d) {
      if (d.kappa == null) return;
      if (!seg.length || !d.usable) seg.push([]);
      seg[seg.length - 1].push(d);
    });
    seg.forEach(function (g) {
      if (g.length < 2) return;
      var dpath = g.map(function (d, k) {
        return (k ? "L" : "M") + X(d.rewrite).toFixed(1) + " " + Y(d.kappa).toFixed(1);
      }).join(" ");
      s.push('<path d="' + dpath + '" fill="none" stroke="' +
        (g[0].usable ? "#35cfa8" : "rgba(201,162,39,.55)") +
        '" stroke-width="2" stroke-dasharray="' + (g[0].usable ? "0" : "4 4") + '"/>');
    });

    /* 点 */
    data.forEach(function (d) {
      if (d.kappa == null) return;
      var cx = X(d.rewrite), cy = Y(d.kappa);
      if (d.usable) {
        s.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.6" fill="#35cfa8"/>');
      } else {
        s.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.6" fill="#0a1a16" stroke="#c9a227" stroke-width="1.6"/>');
      }
    });

    /* 轴 */
    s.push('<line x1="' + L + '" y1="' + (T + ih) + '" x2="' + (W - R) + '" y2="' + (T + ih) +
      '" stroke="rgba(112,190,164,.24)"/>');
    data.forEach(function (d, k) {
      if (k % 2) return;
      s.push('<text x="' + X(d.rewrite).toFixed(1) + '" y="' + (T + ih + 12) +
        '" text-anchor="middle" font-size="8" fill="#40564e" font-family="monospace">' + d.rewrite.toFixed(2) + "</text>");
    });
    s.push('<text x="' + (W - R) + '" y="' + (T + ih + 22) + '" text-anchor="end" font-size="8" fill="#5f7d73" font-family="monospace">改写力度 →</text>');
    s.push("</svg>");
    $("sweepSvg").innerHTML = s.join("");
  }

  /* ---------------- 证据档案 ---------------- */
  function buildRecord() {
    var r = st.last, e = r.est;
    var sub = SUB_UI[r.subtype] || r.subtype;
    return E.create({
      hall: "H4",
      instrument: { id: "contam-trace", version: "0.1.0" },
      title: "三档对照 · 甲" + f2(e.accA) + " 乙" + f2(e.accB) + " 丙" + f2(e.accC) + " · " + sub,
      case: { id: "YC-CASE-CONTAM", title: "它答对，是泛化、记忆，还是当前证据无法区分" },
      tags: { object: "rule", run: "live", source: "controlled", review: "replayable" },
      source: {
        dataType: "synthetic",
        note: "程序生成的四数三步算术题；甲乙丙同源，丙为同技能族新题。非任何公开题库。",
        generator: "yc-contamination.js v" + r.meta.version
      },
      design: {
        question: "在改数题上，模型是重新计算，还是把原题答案搬过来？",
        hypothesis: "若存在表面锁定记忆，则改数题上出现系统性旧答案回吐，κ̂ 显著大于 0。",
        conditions: [
          "甲：原题（表面逐字相同）",
          "乙：改数（改 " + (r.rows[0] && r.rows[0].changed.length) + " 个数，表面匹配 " + f2(e.rhoBar) + "）",
          "丙：同技能族新题（从未出现）",
          "参照：同一解算器关闭记忆通道"
        ],
        controls: [
          "冷参照难度认证", "表面匹配阈值 " + r.meta.theta,
          "偶然水平由参照组实测", "区间按题组自助重采样"
        ]
      },
      budget: { groups: r.meta.n, items: r.meta.n * 3, boot: r.meta.boot },
      run: {
        seed: r.meta.seed,
        params: {
          mem: r.meta.mem, rewrite: r.meta.rewrite,
          labelNoise: r.meta.labelNoise, n: r.meta.n, boot: r.meta.boot
        },
        wallMs: r.ms
      },
      stats: {
        n: r.meta.n,
        resampleUnit: "题组（甲乙丙同源三件共享同一技能点，单题不独立）",
        accA: e.accA, accB: e.accB, accC: e.accC,
        refA: e.refA, refB: e.refB, refC: e.refC,
        R: e.R, R0: e.R0, kappa: e.kappa, ci: e.ci,
        rhoBar: e.rhoBar, advAC: e.advAC, advBC: e.advBC,
        guards: r.guards.map(function (g) { return (g.ok ? "✓ " : "! ") + g.label + "（" + g.detail + "）"; }),
        channels: r.channels
      },
      conclusion: {
        verdict: r.verdict,
        why: r.why,
        supported: [
          "甲 " + f2(e.accA) + " / 乙 " + f2(e.accB) + " / 丙 " + f2(e.accC) + "，参照组 " +
            f2(e.refA) + " / " + f2(e.refB) + " / " + f2(e.refC),
          "回吐率 R=" + f2(e.R) + "，参照组偶然水平 R₀=" + f2(e.R0) + "，κ̂=" + f2(e.kappa) +
            (e.ci ? "，95% 区间 [" + f2(e.ci[0]) + ", " + f2(e.ci[1]) + "]" : ""),
          "同 seed / 参数重跑可得到同一批题与同一批答案"
        ],
        alternatives: [
          "乙架变低也可能是改数改变了难度 —— 由冷参照专门检查，检查结果见守卫",
          "κ̂ 偏低也可能是改写太强，记忆根本触发不了 —— 由表面匹配阈值专门检查"
        ],
        unsupported: [
          "不涉及任何真实大模型的训练数据",
          "κ̂ 是回吐压力，不是「记忆比例」",
          "标签被污染时 κ̂ 是下界，不是估计",
          "结论只在当前改写强度下成立"
        ],
        nextData: [
          "把改写力度扫一遍，报告结论随强度变化的窗口",
          "换成真实模型的固定版本，先测它的参照冷度"
        ]
      },
      review: {
        replayMethod: "同 seed / mem / rewrite / labelNoise / n 重跑，得到完全相同的题与答案",
        status: "replayable",
        corrections: []
      }
    });
  }

  function saveRecord() {
    var box = $("saveResult");
    if (!st.last) { box.textContent = "还没有可存的审判，先按「重新开庭」。"; return; }
    var rec = buildRecord();
    var v = E.validate(rec);
    if (!v.ok) { box.textContent = "档案不合规，未保存：" + v.errors.join("；"); return; }
    E.save(rec);
    box.innerHTML = "已存入公共证据厅：<b>" + rec.id + "</b>　校验值 " + rec.checksum +
      '　<a href="evidence.html">去证据厅看</a>';
    $("btnSave").textContent = "已存 · " + rec.id.slice(-4);
  }

  function exportMd() {
    if (!st.last) { $("saveResult").textContent = "还没有可导出的审判。"; return; }
    var rec = buildRecord();
    var md = E.exportMarkdown(rec);
    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = rec.id + ".md";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    $("saveResult").textContent = "已导出 " + rec.id + ".md";
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!C || !E) return;
    initDoors();
    initKnobs();
    $("btnRun").addEventListener("click", run);
    $("btnSave").addEventListener("click", saveRecord);
    $("btnExport").addEventListener("click", exportMd);
    run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

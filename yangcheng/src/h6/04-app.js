/* ============================================================
   H6 预算天穹 · 应用层
   ------------------------------------------------------------
   这一馆的交互原则：**主图就是控制器**。
   没有侧栏旋钮、没有底部滑杆 —— 预算在「预算阶梯」这张图上直接拖。
   顶栏那条细条只是快捷方式，不是主控制。

   页面只翻译内核给的结论，不自己造结论。
   ============================================================ */
(function () {
  "use strict";

  var D = window.YCDome;
  var E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };

  var KS = [1, 2, 4, 8, 16, 32, 64, 128, 256];   // 预算只能翻倍
  var TAU = 1.0;
  var st = { k: 32, r: null, tauR: null, scope: -1, pick: -1, ms: 0, dec: null, sc: null, neg: null, tau: null };

  var COL = { reach: "#a3e34a", near: "#ffb03a", void: "#ff5eaf", ice: "#d7e6ff", ac: "#6d9bff" };

  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function pp(x) { return (x * 100).toFixed(1); }

  /* ---------------- 预算 → 阶梯索引 ---------------- */
  function idxOf(k) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < KS.length; i++) {
      var d = Math.abs(Math.log(KS[i]) - Math.log(k));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------------- 重算 ---------------- */
  function recompute(k) {
    st.k = KS[idxOf(k)];
    var t0 = performance.now();
    st.r = D.run({ k: st.k, tau: TAU });
    st.ms = Math.round(performance.now() - t0);
    /* 换预算时保留已选的那道题：同一道题在不同预算下的表现才可比 */
    paint();
  }

  /* ============================================================
     穹顶剖面
     ============================================================ */
  function drawDome() {
    var svg = $("domeSvg");
    if (!svg) return;
    var box = svg.getBoundingClientRect();
    var W = Math.max(520, Math.round(box.width) || 900);
    var H = Math.max(200, Math.round(box.height) || 262);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var r = st.r;
    var L = 46, R = W - 16, T = 18, B = H - 26;
    var pw = R - L, ph = B - T;

    var n = r.tasks.length;
    var bw = pw / n;
    var out = [];

    // 排序：可达任务按命中概率降序，不可达任务整段排在最后
    var order = [], i;
    for (i = 0; i < n; i++) if (r.tasks[i].kind === "reach") order.push(i);
    order.sort(function (a, b) { return r.tasks[b].pTruth - r.tasks[a].pTruth; });
    var nReachPos = order.length;
    for (i = 0; i < n; i++) if (r.tasks[i].kind !== "reach") order.push(i);

    // 不可达区底纹
    var vx = L + nReachPos * bw;
    out.push('<rect x="' + vx.toFixed(2) + '" y="' + T + '" width="' + (R - vx).toFixed(2) + '" height="' + ph +
      '" fill="rgba(255,94,168,.075)"/>');
    out.push('<line x1="' + vx.toFixed(2) + '" y1="' + (T - 6) + '" x2="' + vx.toFixed(2) + '" y2="' + B +
      '" stroke="rgba(255,94,168,.45)" stroke-width="1" stroke-dasharray="4 4"/>');
    out.push('<text x="' + (vx + 5).toFixed(2) + '" y="' + (T + 8) + '" fill="' + COL.void +
      '" font-family="ui-monospace,monospace" font-size="8" letter-spacing="1">支持集里没有正确答案 · ' +
      (n - nReachPos) + ' 道</text>');

    // 背景网格
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      var y = B - g * ph;
      out.push('<line x1="' + L + '" y1="' + y + '" x2="' + R + '" y2="' + y +
        '" stroke="rgba(120,152,186,' + (g === 0 ? .30 : .10) + ')" stroke-width="1"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (y + 3.5) + '" fill="#63718a" font-family="ui-monospace,monospace" ' +
        'font-size="8" text-anchor="end">' + Math.round(g * 100) + '%</text>');
    });

    // 每道题一根柱：颜色 = 归宿，亮度 = 是否命中
    order.forEach(function (oi, pos) {
      var t = r.tasks[oi];
      var p = t.pTruth;
      var hp = p <= 0 ? 0 : 1 - Math.pow(1 - p, st.k);
      var x = L + pos * bw;
      var w = Math.max(1, bw - 0.9);
      var h = Math.max(0, hp * ph);

      var col, op;
      if (t.hit) { col = COL.reach; op = 0.92; }
      else if (t.near) { col = COL.near; op = 0.72; }
      else { col = COL.void; op = 0.66; }

      if (h > 0.8) {
        out.push('<rect class="dbar" data-i="' + oi + '" x="' + (x + 0.45).toFixed(2) + '" y="' + (B - h).toFixed(2) +
          '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) +
          '" fill="' + col + '" opacity="' + op + '" rx="0.7"/>');
      }
      // 基线刻度：零高度的题也要看得见
      out.push('<rect class="dtick" data-i="' + oi + '" x="' + (x + 0.45).toFixed(2) + '" y="' + (B + 2) +
        '" width="' + w.toFixed(2) + '" height="5" fill="' + col + '" opacity="' + (h > 0.8 ? .45 : .85) + '"/>');
    });

    // 穹顶线 = 当前预算的平均命中率
    var dy = B - r.pass * ph;
    out.push('<line x1="' + L + '" y1="' + dy.toFixed(2) + '" x2="' + R + '" y2="' + dy.toFixed(2) +
      '" stroke="' + COL.ac + '" stroke-width="1.8" filter="url(#glow)"/>');
    var dlw = 74;
    out.push('<rect x="' + (L + 3) + '" y="' + (dy - 15).toFixed(2) + '" width="' + dlw + '" height="12" rx="3" fill="rgba(7,10,18,.86)"/>');
    out.push('<text x="' + (L + 8) + '" y="' + (dy - 6).toFixed(2) + '" fill="#a8c6ff" ' +
      'font-family="ui-monospace,monospace" font-size="9" letter-spacing=".8">穹顶线 ' + pct(r.pass) + '</text>');

    // 天花板 = 可达上限
    var cy = B - r.ceiling * ph;
    out.push('<line x1="' + L + '" y1="' + cy.toFixed(2) + '" x2="' + R + '" y2="' + cy.toFixed(2) +
      '" stroke="' + COL.near + '" stroke-width="1.2" stroke-dasharray="6 5" opacity=".9"/>');
    out.push('<text x="' + (R - 4) + '" y="' + (cy - 7).toFixed(2) + '" fill="' + COL.near +
      '" font-family="ui-monospace,monospace" font-size="8.5" text-anchor="end" letter-spacing="1.2">天花板 · 可达上限 ' + pct(r.ceiling) + '</text>');

    out.push('<text x="' + L + '" y="' + (H - 7) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8">' +
      '按命中概率降序 · 底部刻度 = 该题归宿</text>');
    out.push('<text x="' + R + '" y="' + (H - 7) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8" text-anchor="end">k = ' + st.k + '</text>');

    svg.innerHTML = '<defs>' +
      '<filter id="glow" x="-20%" y="-200%" width="140%" height="500%">' +
      '<feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>' + out.join("");

    svg.querySelectorAll(".dbar,.dtick").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () { showScope(+el.getAttribute("data-i")); });
    });

    $("domeCap").textContent = "k = " + st.k + " · 阈值 " + (st.k <= 1 ? "50%" : ((1 - Math.pow(0.5, 1 / st.k)) * 100).toFixed(2) + "%");
  }

  /* ============================================================
     预算阶梯（主控制器）
     ============================================================ */
  function drawLadder() {
    var svg = $("ladderSvg");
    if (!svg) return;
    var box = svg.getBoundingClientRect();
    var W = Math.max(520, Math.round(box.width) || 900);
    var H = Math.max(170, Math.round(box.height) || 212);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var r = st.r;
    var L = 46, R = W - 34, T = 14, B = H - 30;
    var pw = R - L, ph = B - T;
    var X = function (i) { return L + (i / (KS.length - 1)) * pw; };
    var Y = function (v) { return B - v * ph; };

    var out = [];

    // 网格
    [0, .25, .5, .75, 1].forEach(function (g) {
      out.push('<line x1="' + L + '" y1="' + Y(g) + '" x2="' + R + '" y2="' + Y(g) +
        '" stroke="rgba(120,152,186,' + (g === 0 ? .30 : .09) + ')"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (Y(g) + 3.5) + '" fill="#63718a" font-family="ui-monospace,monospace" font-size="8" text-anchor="end">' + Math.round(g * 100) + '</text>');
    });
    KS.forEach(function (k, i) {
      out.push('<line x1="' + X(i) + '" y1="' + T + '" x2="' + X(i) + '" y2="' + B + '" stroke="rgba(120,152,186,.07)"/>');
      out.push('<text x="' + X(i) + '" y="' + (B + 14) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8" text-anchor="middle">' + k + '</text>');
    });
    out.push('<text x="' + (L + pw / 2) + '" y="' + (H - 4) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8" text-anchor="middle" letter-spacing="1.6">名义预算 k（对数刻度）</text>');

    // 天花板
    out.push('<line x1="' + L + '" y1="' + Y(r.ceiling) + '" x2="' + R + '" y2="' + Y(r.ceiling) +
      '" stroke="' + COL.near + '" stroke-dasharray="6 5" stroke-width="1.1" opacity=".8"/>');

    // 赤字阴影（pass 与 vote 之间）
    var top = [], bot = [];
    r.ladder.forEach(function (p, i) {
      top.push((i ? "L " : "M ") + X(i) + " " + Y(p.pass));
      bot.unshift("L " + X(i) + " " + Y(p.vote));
    });
    out.push('<path d="' + top.join(" ") + " " + bot.join(" ") + ' Z" fill="rgba(255,176,58,.10)"/>');

    // 三条线
    function line(key, col, dash, wid) {
      var d = r.ladder.map(function (p, i) { return (i ? "L " : "M ") + X(i) + " " + Y(p[key]); }).join(" ");
      out.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + wid + '"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>');
      r.ladder.forEach(function (p, i) {
        out.push('<circle cx="' + X(i) + '" cy="' + Y(p[key]) + '" r="2.1" fill="' + col + '"/>');
      });
    }
    line("greedy", COL.ice, "5 4", 1.2);
    line("vote", COL.near, null, 1.7);
    line("pass", COL.reach, null, 2.3);

    // 当前预算游标
    var ci = idxOf(st.k);
    var cx = X(ci);
    out.push('<line x1="' + cx + '" y1="' + (T - 4) + '" x2="' + cx + '" y2="' + (B + 4) + '" stroke="' + COL.ac + '" stroke-width="1.4"/>');
    out.push('<circle cx="' + cx + '" cy="' + Y(r.pass) + '" r="4.2" fill="' + COL.reach + '" stroke="#070a12" stroke-width="1.4"/>');
    out.push('<text x="' + cx + '" y="' + (T - 6) + '" fill="' + COL.ac + '" font-family="ui-monospace,monospace" font-size="8.5" text-anchor="middle">k=' + st.k + '</text>');

    // 图例
    out.push('<g font-family="ui-monospace,monospace" font-size="8" letter-spacing="1">' +
      '<rect x="' + (L + 4) + '" y="' + (T + 2) + '" width="9" height="2.4" fill="' + COL.reach + '"/>' +
      '<text x="' + (L + 17) + '" y="' + (T + 6) + '" fill="#9caabc">pass@k · oracle</text>' +
      '<rect x="' + (L + 108) + '" y="' + (T + 2) + '" width="9" height="2.4" fill="' + COL.near + '"/>' +
      '<text x="' + (L + 121) + '" y="' + (T + 6) + '" fill="#9caabc">vote@k · 多数表决</text>' +
      '<rect x="' + (L + 232) + '" y="' + (T + 2) + '" width="9" height="2.4" fill="' + COL.ice + '"/>' +
      '<text x="' + (L + 245) + '" y="' + (T + 6) + '" fill="#9caabc">greedy · 取首选（不随预算变）</text>' +
      '</g>');

    // 交互：点击/拖动改预算
    out.push('<rect id="ladHit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent" style="cursor:ew-resize"/>');
    svg.innerHTML = out.join("");

    var hit = svg.querySelector("#ladHit");
    var dragging = false;
    function pick(ev) {
      var rect = svg.getBoundingClientRect();
      var x = (ev.clientX - rect.left) * (W / rect.width);
      var i = Math.round(((x - L) / pw) * (KS.length - 1));
      i = Math.max(0, Math.min(KS.length - 1, i));
      if (KS[i] !== st.k) recompute(KS[i]);
    }
    hit.addEventListener("pointerdown", function (ev) {
      dragging = true; try { hit.setPointerCapture(ev.pointerId); } catch (e) {} pick(ev);
    });
    hit.addEventListener("pointermove", function (ev) { if (dragging) pick(ev); });
    hit.addEventListener("pointerup", function () { dragging = false; });
    hit.addEventListener("pointercancel", function () { dragging = false; });

    $("ladCap").textContent = "当前 k = " + st.k + "（点或拖这张图）";
  }

  /* ============================================================
     结算台 / 分解条 / 结论
     ============================================================ */
  function paintConsole() {
    var r = st.r;
    $("mPass").textContent = pct(r.pass);
    $("bPass").style.width = (r.pass * 100).toFixed(1) + "%";
    $("mVote").textContent = pct(r.vote);
    $("bVote").style.width = (r.vote * 100).toFixed(1) + "%";
    $("mGreedy").textContent = pct(r.greedy);
    $("bGreedy").style.width = (r.greedy * 100).toFixed(1) + "%";
    $("mCeil").textContent = pct(r.ceiling);
    $("mUnreach").textContent = pct(r.unreachable);
    $("mEff").textContent = r.nEff.toFixed(1) + " / " + st.k;
    $("mDef").textContent = pp(r.deficit) + "pp";

    $("tk").textContent = st.k;
    $("te").textContent = r.nEff.toFixed(1);
    $("tp").textContent = pct(r.pass);
    $("td").textContent = pp(r.deficit);

    var si = idxOf(st.k);
    $("stripFill").style.width = (si / (KS.length - 1) * 100) + "%";
    $("stripKnob").style.left = (si / (KS.length - 1) * 100) + "%";

    // 分解条
    var tot = r.pass + r.nearOnly + r.cold;
    var ph = tot > 0 ? (r.pass / tot) * 100 : 0;
    var pn = tot > 0 ? (r.nearOnly / tot) * 100 : 0;
    $("spHit").style.width = ph.toFixed(2) + "%";
    $("spNear").style.width = pn.toFixed(2) + "%";
    $("spCold").style.width = (100 - ph - pn).toFixed(2) + "%";
    $("lgHit").textContent = pct(r.pass);
    $("lgNear").textContent = pct(r.nearOnly);
    $("lgCold").textContent = pct(r.cold);

    // 复算清单（04 移交口）：数字由同一次运行实算，不写死
    $("rcLeak").textContent = pct(r.leak);
    $("rcDef").textContent = pp(r.deficit) + "pp";
    $("rcCeil").textContent = pct(r.ceiling);
    var nR = 0;
    r.tasks.forEach(function (t) { if (t.kind === "reach") nR++; });
    $("rcN").textContent = r.tasks.length;
    $("rcSplit").textContent = nR + " / " + (r.tasks.length - nR);
    $("rcSeed").textContent = "seed " + r.world.seed;
  }

  var VLAB = {
    "supported/gain": "预算有效 · 未饱和",
    "supported/saturate": "预算有效 · 已饱和",
    "refuted/flat": "预算无效",
    "undetermined/short": "拒判 · 预算太小",
    "undetermined/leak": "拒判 · 预算泄漏",
    "undetermined/few": "拒判 · 任务太少"
  };
  var VCLS = {
    "supported/gain": "", "supported/saturate": "",
    "refuted/flat": "bad",
    "undetermined/short": "warn", "undetermined/leak": "warn", "undetermined/few": "warn"
  };

  function paintVerdict() {
    var r = st.r;
    var key = r.verdict + "/" + r.subtype;
    var box = $("vBox");
    box.className = "v6 " + (VCLS[key] || "idle");
    $("vBadge").textContent = VLAB[key] || key;
    $("vStat").textContent = "k=" + st.k + " · 命中 " + pct(r.pass) + " · 天花板 " + pct(r.ceiling) +
      " · 有效预算 " + r.nEff.toFixed(1);
    $("vWhy").textContent = r.why;
  }

  /* ============================================================
     任务显微
     ============================================================ */
  function showScope(i, auto) {
    st.scope = i;
    if (!auto) st.pick = i;
    var t = st.r.tasks[i];
    var box = $("scopeBody");
    $("scopeX").style.display = auto ? "none" : "inline-block";

    var kind = t.kind === "reach" ? "可达" : "不可达";
    var dots = "";
    t.vals.forEach(function (v) {
      var cls = (v === t.g) ? "h" : (Math.abs(v - t.g) === 1 ? "n" : "w");
      dots += '<i class="' + cls + '"></i>';
    });

    var hpK = t.pTruth <= 0 ? 0 : 1 - Math.pow(1 - t.pTruth, st.k);
    var hpM = t.pTruth <= 0 ? 0 : 1 - Math.pow(1 - t.pTruth, 256);
    var proj;
    if (t.pTruth <= 0) {
      proj = '<div class="proj bad"><span class="pl">预算外推</span>' +
        '支持集里根本没有正确答案 —— 加到 256 次仍是 <b>0.0%</b>，加预算治不了这道题</div>';
    } else {
      var dpp = (hpM - hpK) * 100;
      proj = '<div class="proj"><span class="pl">预算外推</span>' +
        '这道题现在 ' + pct(hpK) + '　→　k=256 时 ' + pct(hpM) +
        '　<b class="' + (dpp > 0.5 ? "up" : "flat") + '">' + (dpp > 0 ? "+" : "") + dpp.toFixed(1) + 'pp</b>' +
        '<i>' + (dpp > 5 ? "加预算是有效的" : "再加预算也换不来多少") + '</i></div>';
    }

    box.innerHTML =
      (auto ? '<div class="autoTag">默认选中「边界题」——命中概率最贴近当前阈值的那道 · 点任意柱子换题</div>' : '') +
      '<div style="margin-bottom:5px">第 <b>' + (i + 1) + '</b> 题 · <b>' + kind + '</b> · ' +
      '支持集 ' + t.nSup + ' 个候选 · 正确答案出现概率 ' + (t.pTruth * 100).toFixed(2) + '%</div>' +
      '<div style="margin-bottom:4px">这 ' + st.k + ' 次采样：命中 <b style="color:' + COL.reach + '">' +
      (t.hit ? "有" : "无") + '</b>　·　落在隔壁 ' + (t.near ? "有" : "无") +
      '　·　说出 <b>' + t.distinct + '</b> 个不同答案</div>' +
      '<div class="dots">' + dots + '</div>' +
      '<div style="margin-top:6px;font-size:10px;color:var(--tx4)">' +
      '绿 = 命中 · 琥珀 = 差一步 · 洋红 = 都不是</div>' + proj;
  }

  /* 边界题：命中概率最接近当前阈值的那道可达任务 */
  function boundaryIdx() {
    var r = st.r, thr = 1 - Math.pow(0.5, 1 / st.k), best = -1, bd = 1e9;
    r.tasks.forEach(function (t, i) {
      if (t.kind !== "reach") return;
      var hp = t.pTruth <= 0 ? 0 : 1 - Math.pow(1 - t.pTruth, st.k);
      var d = Math.abs(hp - thr);
      if (d < bd) { bd = d; best = i; }
    });
    return best < 0 ? 0 : best;
  }

  /* ============================================================
     03 结算室
     ============================================================ */
  function paintSettle() {
    // 自检
    var rows = st.sc, ok = 0;
    var html = "";
    rows.forEach(function (c) {
      if (c.pass) ok++;
      html += '<tr><td class="nm">' + c.name + '</td>' +
        '<td class="' + (c.pass ? "ok" : "no") + '">' + (c.pass ? "PASS" : "FAIL") + '</td>' +
        '<td class="mono">' + c.detail + '</td>' +
        '<td style="color:var(--tx2);font-size:10.5px">' + c.note + '</td></tr>';
    });
    $("scBody").innerHTML = html;
    $("scSum").textContent = ok + " / " + rows.length;
    $("scSum").style.color = ok === rows.length ? "var(--reach)" : "var(--void)";

    // 负例
    var nh = "", nok = 0;
    st.neg.forEach(function (c) {
      if (c.pass) nok++;
      nh += '<div class="neg ' + (c.pass ? "ok" : "no") + '">' +
        '<span class="st">' + (c.pass ? "✓" : "✕") + '</span>' +
        '<span class="nm">' + c.label + '</span>' +
        '<span class="gt">' + c.got + '</span></div>';
    });
    $("negList").innerHTML = nh;
    $("negSum").textContent = nok + " / " + st.neg.length;
    $("negSum").style.color = nok === st.neg.length ? "var(--reach)" : "var(--void)";

    // 归因
    var d = st.dec;
    var ah = "";
    d.arms.forEach(function (a) {
      ah += '<div class="arm ' + a.id.toLowerCase() + '">' +
        '<div class="ah">' + a.id + ' 臂</div>' +
        '<div class="an">' + a.label + '</div>' +
        '<div class="av">k=' + a.k + ' τ=' + a.tau.toFixed(1) + '<br>' +
        'pass <b>' + pct(a.pass) + '</b><br>' +
        'vote ' + pct(a.vote) + '<br>' +
        '有效预算 ' + a.nEff.toFixed(1) + '</div></div>';
    });
    $("armBox").innerHTML = ah;

    var ph = "";
    d.preds.forEach(function (p) {
      ph += '<div class="pred ' + (p.pass ? "ok" : "no") + '">' +
        '<span class="pg">' + (p.pass ? "成立" : "推翻") + '</span>' +
        '<span class="pd"><b>' + p.label + '</b><i>' + p.got + '</i></span></div>';
    });
    $("predBox").innerHTML = ph;

    var allp = d.preds.filter(function (p) { return p.pass; }).length;
    $("attrSum").textContent = allp + " / " + d.preds.length;
    $("attrSum").style.color = allp === d.preds.length ? "var(--reach)" : "var(--void)";

    drawTau();
  }

  function drawTau() {
    var svg = $("tauSvg");
    if (!svg) return;
    var box = svg.getBoundingClientRect();
    var W = Math.max(460, Math.round(box.width) || 900);
    var H = Math.max(160, Math.round(box.height) || 190);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var s = st.tau;
    var L = 42, R = W - 14, T = 12, B = H - 26;
    var pw = R - L, ph = B - T;
    var X = function (i) { return L + (i / (s.length - 1)) * pw; };
    var Y = function (v) { return B - v * ph; };

    var out = [];
    [0, .25, .5, .75, 1].forEach(function (g) {
      out.push('<line x1="' + L + '" y1="' + Y(g) + '" x2="' + R + '" y2="' + Y(g) + '" stroke="rgba(120,152,186,' + (g === 0 ? .28 : .08) + ')"/>');
      out.push('<text x="' + (L - 7) + '" y="' + (Y(g) + 3.5) + '" fill="#63718a" font-family="ui-monospace,monospace" font-size="8" text-anchor="end">' + Math.round(g * 100) + '</text>');
    });
    s.forEach(function (p, i) {
      out.push('<text x="' + X(i) + '" y="' + (B + 13) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8" text-anchor="middle">' + p.tau.toFixed(1) + '</text>');
    });
    out.push('<text x="' + (L + pw / 2) + '" y="' + (H - 3) + '" fill="#47576f" font-family="ui-monospace,monospace" font-size="8" text-anchor="middle" letter-spacing="1.4">采样温度 τ（k 固定为 32）</text>');

    function line(key, col, wid) {
      var d = s.map(function (p, i) { return (i ? "L " : "M ") + X(i) + " " + Y(p[key]); }).join(" ");
      out.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + wid + '" stroke-linejoin="round"/>');
      s.forEach(function (p, i) {
        out.push('<circle cx="' + X(i) + '" cy="' + Y(p[key]) + '" r="2.2" fill="' + col + '"/>');
      });
    }
    line("vote", COL.near, 1.7);
    line("pass", COL.reach, 2.3);

    out.push('<text x="' + (X(s.length - 1)) + '" y="' + (Y(s[s.length - 1].pass) - 8) + '" fill="' + COL.reach + '" font-family="ui-monospace,monospace" font-size="8.5" text-anchor="end">oracle 一路涨</text>');
    out.push('<text x="' + (X(s.length - 1)) + '" y="' + (Y(s[s.length - 1].vote) + 14) + '" fill="' + COL.near + '" font-family="ui-monospace,monospace" font-size="8.5" text-anchor="end">多数表决一路掉</text>');

    svg.innerHTML = out.join("");
    var a = s[0], z = s[s.length - 1];
    $("tauCap").textContent = "τ 0.3→3.4：pass " + pct(a.pass) + "→" + pct(z.pass) + " · vote " + pct(a.vote) + "→" + pct(z.vote);
  }

  /* ============================================================
     主刷新
     ============================================================ */
  function paint() {
    drawDome();
    drawLadder();
    paintConsole();
    paintVerdict();
    if (st.pick < 0) showScope(boundaryIdx(), true);
    else showScope(st.pick);
  }

  /* ============================================================
     导航
     ============================================================ */
  function goZone(l) {
    document.querySelectorAll(".zone").forEach(function (z) {
      z.classList.toggle("on", z.getAttribute("data-l") === l);
    });
    document.querySelectorAll(".d6arch .ks").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-l") === l);
    });
    $("main").scrollTop = 0;
    if (l === "dome") setTimeout(paint, 30);
    if (l === "settle") setTimeout(paintSettle, 30);
  }

  /* ============================================================
     顶栏预算细条
     ============================================================ */
  function bindStrip() {
    var el = $("strip");
    var drag = false;
    function pick(ev) {
      var rect = el.getBoundingClientRect();
      var t = (ev.clientX - rect.left) / rect.width;
      t = Math.max(0, Math.min(1, t));
      var i = Math.round(t * (KS.length - 1));
      if (KS[i] !== st.k) recompute(KS[i]);
    }
    el.addEventListener("pointerdown", function (ev) { drag = true; try { el.setPointerCapture(ev.pointerId); } catch (e) {} pick(ev); });
    el.addEventListener("pointermove", function (ev) { if (drag) pick(ev); });
    el.addEventListener("pointerup", function () { drag = false; });
    el.addEventListener("pointercancel", function () { drag = false; });
  }

  /* ============================================================
     证据档案
     ============================================================ */
  function buildRecord() {
    var r = st.r;
    return E.create({
      hall: "H6",
      instrument: { id: "budget-dome", version: D.VERSION },
      title: "预算天穹 · k=" + st.k + " τ=" + TAU.toFixed(1) +
             " · 命中 " + pct(r.pass) + " 天花板 " + pct(r.ceiling),
      case: { id: "YC-CASE-BUDGET", title: "一次失败，是能力不足、调用不当，还是预算不足" },
      tags: { object: "toydist", run: "live", source: "controlled", review: "replayable" },
      source: {
        dataType: "synthetic",
        note: "程序生成的 " + r.world.total + " 道任务，每道 3—15 个候选答案；其中 " +
              r.world.nVoid + " 道题的正确答案不在支持集内。不是真实模型。",
        generator: "yc-dome.js v" + D.VERSION
      },
      design: {
        question: "提高采样预算，提升的是能力，还是「至少有一次答对」？预算对哪一类失败有效？",
        hypothesis: "预算只治「可达但稀有」；对「正确答案不在支持集」的失败完全无效。oracle 与实际选择器的差随预算扩大。",
        conditions: [
          "名义预算 k = " + st.k + "（对数阶梯 1—256）",
          "采样温度 τ = " + TAU.toFixed(1),
          "任务数 " + r.world.total + "（可达 " + r.world.nReach + " / 不可达 " + r.world.nVoid + "）",
          "选择器三种：oracle / 多数表决 / 取首选"
        ],
        controls: [
          "同一 seed 生成同一批任务", "同一 τ 下 k 次采样为嵌套前缀（pass@k 严格单调）",
          "可达上限由世界属性测得，不写死", "不可达任务在任意预算下命中率必须为 0"
        ]
      },
      budget: { tasks: r.world.total, samplesPerTask: st.k, totalSamples: r.world.total * st.k },
      run: { seed: D.DEFAULTS.seed, params: { k: st.k, tau: TAU }, wallMs: st.ms },
      stats: {
        n: r.world.total,
        resampleUnit: "任务（同一任务内 k 次采样强相关，单次不独立）",
        pass: r.pass, vote: r.vote, greedy: r.greedy,
        nEff: r.nEff, leak: r.leak, deficit: r.deficit,
        ceiling: r.ceiling, unreachable: r.unreachable, headroom: r.headroom,
        nearOnly: r.nearOnly, cold: r.cold,
        reachHit: r.reachHit, voidHit: r.voidHit,
        ladder: r.ladder.map(function (l) { return l.k + ":" + (l.pass * 100).toFixed(1); }).join(" ")
      },
      conclusion: {
        verdict: r.verdict,
        why: r.why,
        supported: [
          "pass@" + st.k + " = " + pct(r.pass) + "（oracle），多数表决 " + pct(r.vote) +
            "，取首选 " + pct(r.greedy),
          "可达上限 " + pct(r.ceiling) + "，其中不可达任务占 " + pct(r.unreachable) + "，永远命中 0 次",
          "有效预算 " + r.nEff.toFixed(1) + " / " + st.k + "（重复率 " + pct(r.leak) + "）",
          "选择器赤字 " + pp(r.deficit) + " 个百分点"
        ],
        alternatives: [
          "命中率低也可能是预算太小 —— 由 short 拒判线与预算阶梯专门检查",
          "命中率不涨也可能是采样退化 —— 由 leak 拒判线与 τ 扫描专门检查",
          "提升可能来自不可达任务偶然撞上 —— 由归因第二条严格等于 0 来排除"
        ],
        limits: [
          "玩具分布，不是真实模型；结论只对「支持集 + 采样」这个结构成立",
          "pass@k 是 oracle 上界，不代表任何真实系统的表现",
          "可达上限依赖这一套任务族与判分口径，换题就变"
        ]
      }
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    document.querySelectorAll(".d6arch .ks").forEach(function (b) {
      b.addEventListener("click", function () { goZone(b.getAttribute("data-l")); });
    });

    bindStrip();
    $("scopeX").addEventListener("click", function () {
      st.pick = -1;
      showScope(boundaryIdx(), true);
    });

    $("btnSave").addEventListener("click", function () {
      var rec = buildRecord();
      var out = $("saveResult");
      try {
        var res = E.save(rec);
        out.style.color = "var(--reach)";
        out.textContent = "已存入公共证据厅：" + res.id + "　校验值 " + res.checksum;
      } catch (err) {
        out.style.color = "var(--void)";
        out.textContent = "存档失败：" + (err && err.message ? err.message : err);
      }
    });

    $("btnExport").addEventListener("click", function () {
      var rec = buildRecord();
      var md = E.exportMarkdown(rec);
      var blob = new Blob([md], { type: "text/markdown" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = rec.id + ".md";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      $("saveResult").style.color = "var(--h6)";
      $("saveResult").textContent = "已导出 " + rec.id + ".md";
    });

    $("btnReplay").addEventListener("click", function () { goZone("dome"); });

    window.addEventListener("resize", function () {
      drawDome(); drawLadder();
      if (document.querySelector('.zone[data-l="settle"]').classList.contains("on")) drawTau();
    });

    // 01 区展品卡上的数字由内核实算填充，不写死
    (function fillExhibits() {
      var d = D.run({ k: 32, tau: TAU });
      var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
      set("exPass", pct(d.pass));
      set("exGreedy", pct(d.greedy));
      set("exVote", pct(d.vote));
      set("exDef", pp(d.deficit));
      set("exEff", d.nEff.toFixed(1));
      set("exEff2", d.nEff.toFixed(1));
    })();

    // 先算一次，再渲染
    st.r = D.run({ k: st.k, tau: TAU });
    st.sc = D.selfCheck();
    st.neg = D.negatives();
    st.dec = D.decompose({});
    st.tau = D.sweepTau({ k: 32 });
    paint();
    paintSettle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

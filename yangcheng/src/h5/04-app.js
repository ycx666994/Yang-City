/* ============================================================
   H5 递归坍塌博物馆 · 页面逻辑
   ------------------------------------------------------------
   分工：instruments/yc-greenhouse.js 负责算（零 DOM），
   这个文件只负责画和接事件。所有判定词都在引擎里定，
   页面不许自己造结论 —— 否则同一份数据会出现两种说法。
   ============================================================ */
(function () {
  "use strict";

  var G = window.YCGreenhouse;
  var E = window.YCEvidence;

  function $(id) { return document.getElementById(id); }
  function f2(x) { return Number.isFinite(x) ? x.toFixed(2) : "—"; }
  function pct(x, d) { return Number.isFinite(x) ? (x * 100).toFixed(d === undefined ? 0 : d) + "%" : "—"; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ---------------- 状态 ---------------- */
  var st = {
    rho: 0.05,
    N: 400,
    G: 24,
    lines: 16,
    seed: 20311030,
    r: null,          /* 最近一次 run 结果 */
    sel: null,        /* 选中的谱系下标 */
    gen: 24,          /* 镜面/滑块当前世代 */
    done: {},         /* 标本室是否已跑过 */
    timer: null
  };

  /* 滑块映射：N 用几何刻度，80 → 8000 */
  function nFromSlider(k) { return Math.round(80 * Math.pow(100, k / 100) / 10) * 10; }
  function sliderFromN(n) { return Math.round(Math.log(n / 80) / Math.log(100) * 100); }

  /* ============================================================
     分区切换（底部小径）
     ============================================================ */
  function goto(l) {
    var zones = document.querySelectorAll(".zone");
    for (var i = 0; i < zones.length; i++) {
      zones[i].classList.toggle("on", zones[i].getAttribute("data-l") === l);
    }
    var stones = document.querySelectorAll(".stone");
    for (i = 0; i < stones.length; i++) {
      stones[i].classList.toggle("on", stones[i].getAttribute("data-l") === l);
    }
    if (l === "check" && !st.done.check) { st.done.check = true; runCheckRoom(); }
    if (l === "trellis") drawTrellis();
  }

  /* ============================================================
     主计算
     ============================================================ */
  function run() {
    st.r = G.run({ rho: st.rho, N: st.N, G: st.G, lines: st.lines, seed: st.seed });
    st.gen = st.G;
    st.sel = null;
    $("genSlider").max = st.G;
    $("genSlider").value = st.G;
    $("pickBack").style.display = "none";
    $("fateTitle").textContent = "八层归宿";
    $("fateWho").textContent = "全体 · 中位";
    drawTrellis();
    drawMirror();
    drawFates();
    drawSun();
    drawHead();
  }

  function drawSun() {
    $("sunVal").textContent = pct(st.rho);
    $("sunFill").style.width = clamp(st.rho * 100, 2, 100) + "%";
    /* 推到 100% 时，仪器必须当场说明「这不是递归条件」——
       能拒判才叫仪器，这是这一馆最该被亲手试一次的地方。 */
    $("sunNote").innerHTML = st.rho >= 1
      ? '<b style="color:#ff9ea3">全日照：每代都是纯新鲜数据，模型输出一件都没进训练集 —— 这不是递归条件。</b>'
      : '日照越低，温室越封闭：模型开始吃自己的产出。';
  }

  /* 判定词：全部来自引擎的 verdict/subtype，页面只负责翻译，不许自己造结论 */
  var VLAB = {
    "supported/tail": "按分位坍塌",
    "supported/body": "全面坍塌",
    "refuted/stable": "未检出坍塌",
    "conflict/spread": "临界 · 谱系分歧",
    "undetermined/few": "拒判 · 谱系太少",
    "undetermined/short": "拒判 · 观测窗太短",
    "undetermined/nonrecursive": "拒判 · 不是递归条件",
    "undetermined/resolution": "拒判 · 分辨率不足"
  };

  function drawHead() {
    var r = st.r;
    $("twSub").textContent = st.lines + " 条谱系 · " + st.G + " 代 · 向上生长 · " +
      (VLAB[r.verdict + "/" + r.subtype] || r.subtype);
  }

  /* ============================================================
     藤架
     ============================================================ */
  /* 藤架的坐标不写死：每次按容器实际尺寸算 viewBox。
     写死 760×620 会让 preserveAspectRatio 在宽屏上左右各留 250px 空白，
     16 条藤挤在中间一条窄带里，白白浪费一半画布。 */
  var VB = { w: 900, h: 560, x0: 46, x1: 876, yBase: 526, yTop: 30 };

  /* 色标必须和健康度的阶梯对齐（1.0 / 0.8 / 0.6 / 0.4 / 0.2 / 0），
     否则「丢了一层」还显示成绿色，颜色就白给了。
     五档：苔绿 → 黄绿 → 枯金 → 锈褐 → 枯绛。 */
  function healthColor(h) {
    var stops = [
      [0.00, [107, 58, 68]],
      [0.20, [141, 74, 82]],
      [0.40, [176, 106, 82]],
      [0.60, [201, 160, 90]],
      [0.80, [143, 200, 106]],
      [1.00, [95, 208, 138]]
    ];
    for (var i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        var t = (h - a[0]) / (b[0] - a[0]);
        var c = [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * t); });
        return "rgb(" + c.join(",") + ")";
      }
    }
    return "rgb(95,208,138)";
  }

  /* 一条藤在第 g 代的「健康度」。
     主项是「还剩几层」（1 − 已丢层数/可见层数），次项是平均保留。
     为什么不用纯平均保留：平均保留被主体层撑着，到死之前一直是 0.85 以上，
     藤整根都是绿的，颜色不传递任何信息。用层数做阶梯，每丢一层变一次色，
     这样「变黄」就等于「丢了第一层」，和右边那张表一一对应。 */
  function lineHealth(line, judgeable) {
    var out = [], c1 = line.gens[0].cov, n = judgeable.length;
    for (var g = 0; g < line.gens.length; g++) {
      var lost = 0, sum = 0;
      for (var j = 0; j < n; j++) {
        var l = judgeable[j];
        var k = c1[l] > 1e-9 ? line.gens[g].cov[l] / c1[l] : 1;
        sum += Math.min(1, k);
        if (k < 0.5) lost++;
      }
      var step = n ? 1 - lost / n : 1;
      out.push(n ? 0.78 * step + 0.22 * (sum / n) : 1);
    }
    return out;
  }

  function drawTrellis() {
    var r = st.r;
    if (!r) return;
    var svg = $("trellis");
    var box = svg.getBoundingClientRect();
    VB.w = Math.max(520, Math.round(box.width) || 900);
    VB.h = Math.max(300, Math.round(box.height) || 560);
    VB.x0 = 44;
    VB.x1 = VB.w - 22;
    VB.yTop = 26;
    VB.yBase = VB.h - 30;
    svg.setAttribute("viewBox", "0 0 " + VB.w + " " + VB.h);

    var n = r.lines.length;
    var Gx = r.meta.G;
    var dx = (VB.x1 - VB.x0) / (n - 1);
    var step = (VB.yBase - VB.yTop) / Gx;
    var judgeable = r.judgeable;
    var out = [];

    /* 背景世代网格 */
    var gLabels = [];
    for (var g = 1; g <= Gx; g++) {
      if (g === 1 || g === Gx || g % 5 === 0) gLabels.push(g);
    }
    for (var i = 0; i < gLabels.length; i++) {
      var yy = VB.yBase - gLabels[i] * step;
      out.push('<line class="axis" x1="' + VB.x0 + '" y1="' + yy.toFixed(1) +
               '" x2="' + VB.x1 + '" y2="' + yy.toFixed(1) + '"/>');
      out.push('<text class="axlab" x="' + (VB.x0 - 10) + '" y="' + (yy + 3).toFixed(1) +
               '" text-anchor="end">' + gLabels[i] + '</text>');
    }

    for (var li = 0; li < n; li++) {
      var line = r.lines[li];
      var hh = lineHealth(line, judgeable);
      var x = VB.x0 + li * dx;
      var dead = line.deathGen;
      var on = st.sel === li ? " on" : "";

      out.push('<g class="col' + on + '" data-i="' + li + '">');
      /* 点击热区：整列 */
      out.push('<rect class="col-hit" x="' + (x - dx / 2).toFixed(1) + '" y="' + (VB.yTop - 26) +
               '" width="' + dx.toFixed(1) + '" height="' + (VB.yBase - VB.yTop + 40) + '" rx="6"/>');

      /* 藤段：从第 1 代向上 */
      for (g = 1; g <= Gx; g++) {
        var h = hh[g - 1];
        var yA = VB.yBase - (g - 1) * step;
        var yB = VB.yBase - g * step;
        var wA = 4.2 * Math.sin(li * 2.1 + (g - 1) * 0.72);
        var wB = 4.2 * Math.sin(li * 2.1 + g * 0.72);
        var ghost = dead !== null && g > dead;
        var dim = g > st.gen ? 0.26 : 1;
        var wdt = ghost ? 1.3 : (2.5 + 3.6 * h);
        out.push('<line class="vseg' + (ghost ? ' ghost' : '') + '" ' +
                 'x1="' + (x + wA).toFixed(1) + '" y1="' + yA.toFixed(1) +
                 '" x2="' + (x + wB).toFixed(1) + '" y2="' + yB.toFixed(1) +
                 '" stroke="' + (ghost ? "#7d545c" : healthColor(h)) + '"' +
                 ' stroke-width="' + wdt.toFixed(2) + '" opacity="' + dim + '"/>');
      }

      /* 枯死点：× 必须落在真正枯萎的那一代，不能画在顶端 ——
         画在顶端等于说「它到最后一刻才死」，把整条病史说反了。 */
      if (dead !== null && dead <= Gx) {
        var yd = VB.yBase - dead * step;
        var xd = x + 4.2 * Math.sin(li * 2.1 + dead * 0.72);
        out.push('<line class="dmark" x1="' + (xd - 5).toFixed(1) + '" y1="' + (yd - 5).toFixed(1) +
                 '" x2="' + (xd + 5).toFixed(1) + '" y2="' + (yd + 5).toFixed(1) + '"/>');
        out.push('<line class="dmark" x1="' + (xd + 5).toFixed(1) + '" y1="' + (yd - 5).toFixed(1) +
                 '" x2="' + (xd - 5).toFixed(1) + '" y2="' + (yd + 5).toFixed(1) + '"/>');
      }

      /* 顶端：活着给一个发光芽；枯了什么都不给，上面已经是残影 */
      var yt = VB.yBase - Gx * step;
      var xt = x + 4.2 * Math.sin(li * 2.1 + Gx * 0.72);
      if (dead === null) {
        out.push('<circle cx="' + xt.toFixed(1) + '" cy="' + (yt - 6).toFixed(1) +
                 '" r="8" fill="#5fd08a" opacity=".15"/>');
        out.push('<circle class="tip" cx="' + xt.toFixed(1) + '" cy="' + (yt - 6).toFixed(1) +
                 '" r="3.2" fill="#8fe8b0" stroke="#5fd08a"/>');
      } else {
        out.push('<circle cx="' + xt.toFixed(1) + '" cy="' + (yt - 5).toFixed(1) +
                 '" r="2.4" fill="none" stroke="#7d545c" stroke-width="1" opacity=".7"/>');
      }

      /* 列号 */
      out.push('<text class="clab" x="' + x.toFixed(1) + '" y="' + (VB.yBase + 18) +
               '" text-anchor="middle">' + (li + 1) + '</text>');
      out.push('</g>');
    }

    /* 第 0 代基线：所有谱系都从这里出发（= 用无限真数据训练出来的模型） */
    out.push('<line class="axis" x1="' + VB.x0 + '" y1="' + VB.yBase + '" x2="' + VB.x1 +
             '" y2="' + VB.yBase + '" stroke="rgba(196,176,228,.22)"/>');
    out.push('<text class="axlab" x="' + (VB.x0 - 10) + '" y="' + (VB.yBase + 3) +
             '" text-anchor="end">0</text>');

    /* 左侧说明 */
    out.push('<text class="axlab" x="' + (VB.x0 - 10) + '" y="' + (VB.yTop - 22) +
             '" text-anchor="end">世代</text>');

    svg.innerHTML = out.join("");
    drawVineLegend();
  }

  /* 颜色图例：直接标「还剩几层」，颜色不是装饰，是刻度 */
  function drawVineLegend() {
    var box = $("vleg");
    if (!box || !st.r) return;
    var n = st.r.judgeable.length;
    var items = [];
    for (var k = n; k >= 0; k--) {
      var h = n ? 0.78 * (k / n) + 0.22 * (k / n) : 1;
      items.push('<span><i style="background:' + healthColor(h) + '"></i>' + k + '</span>');
    }
    box.innerHTML = '<em>还剩层数</em>' + items.join("");
  }

  /* 点列选中 */
  function bindTrellis() {
    $("trellis").addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest("g.col") : null;
      if (!t) { clearSel(); return; }
      var i = parseInt(t.getAttribute("data-i"), 10);
      if (isNaN(i)) return;
      st.sel = (st.sel === i) ? null : i;
      $("pickBack").style.display = st.sel === null ? "none" : "inline-block";
      drawTrellis();
      drawFates();
    });
  }

  function clearSel() {
    if (st.sel === null) return;
    st.sel = null;
    $("pickBack").style.display = "none";
    drawTrellis();
    drawFates();
  }

  /* ============================================================
     镜面
     ============================================================ */
  function drawMirror() {
    var r = st.r;
    if (!r) return;
    var g = clamp(st.gen, 1, r.meta.G);
    var p0 = r.p0, q = r.byGen[g - 1].meanQ;
    var K = p0.length;
    var W = 380, H = 104, padL = 3, padR = 3, base = H - 7, top = 10;
    var maxv = 1e-9;
    for (var i = 0; i < K; i++) maxv = Math.max(maxv, p0[i], q[i]);
    var xs = function (i) { return padL + (W - padL - padR) * i / (K - 1); };
    var ys = function (v) { return base - (v / maxv) * (base - top); };

    var out = [];
    /* 卫星仓刻度：让人知道极稀的那一段在哪 */
    for (i = r.meta.satFrom; i < r.meta.satTo; i++) {
      out.push('<line class="sat" x1="' + xs(i).toFixed(1) + '" y1="' + (base + 1) +
               '" x2="' + xs(i).toFixed(1) + '" y2="' + (base + 4) + '" stroke-width="1"/>');
    }
    /* 基线 */
    out.push('<line class="zl" x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '"/>');

    /* p₀ 面积 + 轮廓 */
    var dA = "M" + xs(0).toFixed(1) + "," + base;
    for (i = 0; i < K; i++) dA += " L" + xs(i).toFixed(1) + "," + ys(p0[i]).toFixed(1);
    dA += " L" + xs(K - 1).toFixed(1) + "," + base + " Z";
    out.push('<path class="base" d="' + dA + '"/>');

    var dQ = "M" + xs(0).toFixed(1) + "," + base;
    for (i = 0; i < K; i++) dQ += " L" + xs(i).toFixed(1) + "," + ys(q[i]).toFixed(1);
    dQ += " L" + xs(K - 1).toFixed(1) + "," + base + " Z";
    out.push('<path class="now" d="' + dQ + '"/>');

    /* 轮廓线 */
    var lA = "";
    for (i = 0; i < K; i++) lA += (i ? " L" : "M") + xs(i).toFixed(1) + "," + ys(p0[i]).toFixed(1);
    out.push('<path class="base-l" d="' + lA + '"/>');
    var lQ = "";
    for (i = 0; i < K; i++) lQ += (i ? " L" : "M") + xs(i).toFixed(1) + "," + ys(q[i]).toFixed(1);
    out.push('<path class="now-l" d="' + lQ + '"/>');

    $("mirrorSvg").innerHTML = out.join("");
    $("mGen").textContent = "第 " + g + " 代";
    $("mFid").textContent = f2(r.byGen[g - 1].fid);
    $("mH").textContent = r.byGen[g - 1].H.toFixed(0);
    $("mCov").textContent = r.judgeable.length + "/8";
  }

  /* ============================================================
     八层归宿表
     ============================================================ */
  var FATE_TAG = { alive: "幸存", wilted: "枯萎", blind: "看不见" };

  function drawFates() {
    var r = st.r;
    if (!r) return;
    var rows = [], l;
    var selLine = st.sel === null ? null : r.lines[st.sel];

    if (selLine) {
      $("fateTitle").textContent = "谱系 #" + (st.sel + 1) + " 的八层";
      $("fateWho").textContent = "单条 · 第 1 代→第 " + r.meta.G + " 代";
    } else {
      $("fateTitle").textContent = "八层归宿";
      $("fateWho").textContent = "全体 · 中位";
    }

    for (l = 0; l < r.meta.NL; l++) {
      var c1, cG, tag, keep;
      if (selLine) {
        c1 = selLine.gens[0].cov[l];
        cG = selLine.gens[selLine.gens.length - 1].cov[l];
        keep = c1 > 1e-9 ? cG / c1 : 0;
        tag = r.blind.indexOf(l) >= 0 ? "blind" : (keep < 0.5 ? "wilted" : "alive");
      } else {
        c1 = r.byGen[0].cov[l];
        cG = r.byGen[r.byGen.length - 1].cov[l];
        keep = r.est.keepG[l];
        tag = r.fate[l];
      }
      var col = tag === "alive" ? "#5fd08a" : (tag === "wilted" ? "#c9a05a" : "#6f6584");
      /* 看不见的层画它「起始覆盖率」，而不是画一个 4% 的小点：
         让人一眼看出它不是掉到 0，而是本来就只有这么点。 */
      var w = tag === "blind" ? clamp(c1, 0, 1) * 100 : clamp(keep, 0, 1) * 100;
      rows.push(
        '<div class="frow">' +
          '<span class="fl">' + (l + 1) + ' ' + r.meta.layerName[l] + '</span>' +
          '<span class="fbar"><i style="width:' + w.toFixed(1) + '%;background:' + col + '"></i></span>' +
          '<span class="fv">' + (tag === "blind" ? f2(c1) : f2(keep)) + '</span>' +
          '<span class="ft ' + tag + '">' + FATE_TAG[tag] + '</span>' +
        '</div>'
      );
    }
    $("fateBody").innerHTML = rows.join("");

    drawVerdict();
    $("fateHint").innerHTML = selLine
      ? '这条谱系在 <b>第 ' + (selLine.deathGen === null ? "—" : selLine.deathGen) +
        ' 代</b> 开始持续枯萎，末代丢了 <b>' + selLine.lost.length + '</b> 层。' +
        '数字列：幸存/枯萎看相对保留，看不见看起始覆盖率。'
      : '覆盖率＝这一层的仓还有几成在模型里。低于起始值一半，就记作枯萎。' +
        '点任意一条藤可以看它自己的八层。';
  }

  /* 结论块：判定词 + 三个计数 + 枯萎世代区间 + 理由 + 附注 */
  var VCLS = {
    supported: "ok", refuted: "idle", noeffect: "idle",
    undetermined: "warn", conflict: "bad"
  };

  function drawVerdict() {
    var r = st.r, e = r.est;
    var box = $("vBox");
    box.className = "verdict " + (VCLS[r.verdict] || "idle");
    $("vBadge").textContent = VLAB[r.verdict + "/" + r.subtype] || r.subtype;
    $("vStat").innerHTML =
      "8 层 · 枯萎 <b>" + e.wilted + "</b> · 看不见 <b>" + e.blind + "</b> · 幸存 <b>" + e.alive + "</b><br>" +
      "枯萎谱系 <b>" + pct(e.wiltFrac) + "</b> · 中位丢 <b>" + e.medLost + "</b> 层 · " +
      "枯萎世代 <b>" + (e.medDeath === null ? "—" : e.medDeath) + "</b>" +
      (e.deathMin === null ? "" : "（" + e.deathMin + "—" + e.deathMax + "）");
    $("vWhy").textContent = r.why;
    if (r.note) {
      $("vNote").style.display = "block";
      $("vNote").textContent = r.note;
    } else {
      $("vNote").style.display = "none";
    }
  }

  /* ============================================================
     世代滑块
     ============================================================ */
  function bindGen() {
    $("genSlider").addEventListener("input", function () {
      st.gen = parseInt(this.value, 10);
      $("genVal").textContent = st.gen + " / " + st.G;
      drawMirror();
      drawTrellis();
    });
  }

  /* ============================================================
     参数旋钮（防抖重播）
     ============================================================ */
  function bindKnobs() {
    $("kRho").addEventListener("input", function () {
      st.rho = parseInt(this.value, 10) / 100;
      $("kRhoV").textContent = pct(st.rho);
      drawSun();
      debounce();
    });
    $("kN").addEventListener("input", function () {
      st.N = nFromSlider(parseInt(this.value, 10));
      $("kNV").textContent = st.N;
      debounce();
    });
    $("kG").addEventListener("input", function () {
      st.G = parseInt(this.value, 10);
      $("kGV").textContent = st.G;
      debounce();
    });
    $("btnRun").addEventListener("click", function () {
      st.seed = (st.seed + 1013904223) >>> 0;
      run();
    });
    $("btnCF").addEventListener("click", showCounterfactual);
    $("btnAttr").addEventListener("click", function () {
      goto("check");
      renderAttribute(true);
    });
  }

  function debounce() {
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(function () { st.timer = null; run(); }, 150);
  }

  /* ============================================================
     同 seed 反事实
     ============================================================ */
  function showCounterfactual() {
    var cf = G.counterfactual({ seed: st.seed, N: st.N, G: st.G, rho: st.rho });
    var a = cf.zero.line, b = cf.mix.line;
    var box = $("cfBox");
    box.style.display = "block";
    function row(tag, rho, line, cls) {
      var covs = line.final.cov.slice(0, 6).map(function (x) { return x.toFixed(2); }).join(" ");
      return '<div class="frow" style="grid-template-columns:64px 1fr 1fr;border-top:1px solid rgba(196,176,228,.07)">' +
        '<span class="fl">' + tag + '</span>' +
        '<span class="fv" style="text-align:left">枯于第 <b style="color:' + cls + '">' +
          (line.deathGen === null ? "—" : line.deathGen) + '</b> 代</span>' +
        '<span class="fv">末代覆盖 ' + covs + '</span>' +
      '</div>';
    }
    box.innerHTML =
      '<div class="mh"><span class="t">同 seed 对照</span><span class="g">#1 · 只改日照</span></div>' +
      '<div class="ms">同一颗种子、同一采样量、同一代数。唯一的差别是每代有多少新鲜真数据。</div>' +
      row("ρ = 0", 0, a, "#ef6a72") +
      row("ρ = " + pct(cf.mix.rho), cf.mix.rho, b, "#5fd08a") +
      '<div class="hint" style="margin-top:8px">' +
        '同一条谱系，同样的随机流起点：不加新鲜数据它枯在第 ' +
        (a.deathGen === null ? "—" : a.deathGen) + ' 代，加 ' + pct(cf.mix.rho) +
        ' 之后撑到第 ' + (b.deathGen === null ? "—" : b.deathGen) + ' 代。' +
        '<b>这不是运气差别，是条件差别。</b>' +
      '</div>';
  }

  /* ============================================================
     标本室
     ============================================================ */
  function runCheckRoom() {
    var sc = G.selfCheck();
    var ng = G.negatives();

    /* 自检表 */
    $("scSum").innerHTML = sc.allPass
      ? '<b style="color:#8fe8b0">五项全部回收成功。</b>仪器在这套世界里能把自己的假设验回来，才有资格去审别的东西。'
      : '<b style="color:#ff9ea3">有项目没通过 —— 先修实现，不要拿结果去下结论。</b>';
    $("scBody").innerHTML = sc.rows.map(function (x) {
      return '<tr>' +
        '<td>' + x.label + '</td>' +
        '<td class="mono ' + (x.pass ? "ok" : "no") + '">' + x.got + '</td>' +
        '<td class="mono">' + x.want + '</td>' +
        '<td style="color:var(--tx3)">' + x.note + '</td>' +
      '</tr>';
    }).join("");

    /* 负例 */
    $("negList").innerHTML = ng.map(function (x) {
      return '<div class="li ' + (x.pass ? "ok" : "no") + '">' +
        '<span class="ic">' + (x.pass ? "✓" : "✕") + '</span>' +
        '<span><span class="lt">' + x.label + '　' + x.got + '</span>' +
        '<span class="ld">' + x.detail + '</span></span>' +
        '<span class="lv">' + x.want + '</span>' +
      '</div>';
    }).join("");

    renderAttribute(false);
    drawSweeps();
  }

  function renderAttribute(live) {
    var d = G.decompose({ seed: st.seed, N: st.N, G: st.G, lines: 8, rho: st.rho });
    var cls = d.verdict === "confirmed" ? "ok" : (d.verdict === "partial" ? "" : "no");
    var banner = d.verdict === "confirmed"
      ? '<b style="color:#8fe8b0">三条预测全部成立 · 归因可用</b>'
      : (d.verdict === "partial"
        ? '<b style="color:#f0c37a">三条成立两条 · 归因部分可用</b>'
        : '<b style="color:#ff9ea3">三条只成立 ' + d.hit + ' 条 · 归因不成立</b>');

    $("attrBox").innerHTML =
      '<div class="chartbox" style="margin-top:8px">' +
        '<div class="ch"><span class="t">' + banner + '</span>' +
          '<span class="v">' + d.ms.toFixed(0) + ' ms</span></div>' +
        '<div class="list" style="margin-top:8px">' +
          d.preds.map(function (p) {
            return '<div class="li ' + (p.ok ? "ok" : "no") + '">' +
              '<span class="ic">' + (p.ok ? "✓" : "✕") + '</span>' +
              '<span><span class="lt">' + p.text + '</span></span>' +
              '<span class="lv">' + p.got + '</span>' +
            '</div>';
          }).join("") +
        '</div>' +
        '<div class="hint" style="margin-top:4px">' + d.text + '</div>' +
        '<table class="tbl" style="margin-top:10px"><thead><tr>' +
          '<th>对照</th><th>ρ</th><th>N</th><th>G</th><th>存活率</th><th>中位枯萎</th>' +
        '</tr></thead><tbody>' +
          [["A 基准", d.A], ["B 只加预算", d.B], ["C 加预算＋长窗", d.C], ["D 长窗＋移民", d.D]]
            .map(function (x) {
              var o = x[1];
              return '<tr><td>' + x[0] + '</td><td class="mono">' + o.rho + '</td>' +
                '<td class="mono">' + o.N + '</td><td class="mono">' + o.G + '</td>' +
                '<td class="mono">' + pct(o.surv) + '</td>' +
                '<td class="mono">' + (o.medDeath === null ? "—" : o.medDeath) + '</td></tr>';
            }).join("") +
        '</tbody></table>' +
      '</div>';
    if (live) $("attrBox").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------------- 两个扫描图 ---------------- */
  function drawSweeps() {
    var sw = G.sweepRho({ seed: st.seed, N: st.N, G: st.G, lines: 12 });
    var sn = G.sweepN({ seed: st.seed });

    /* --- 混合比扫描 --- */
    var W = 440, H = 170, pl = 34, pr = 14, pt = 14, pb = 26;
    var iw = W - pl - pr, ih = H - pt - pb;
    var x = function (rho) { return pl + rho / 0.5 * iw; };
    var y = function (v) { return pt + (1 - v) * ih; };

    var o = [];
    o.push('<line x1="' + pl + '" y1="' + y(0.5) + '" x2="' + (W - pr) + '" y2="' + y(0.5) +
           '" stroke="#ef6a72" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>');
    o.push('<text x="' + (W - pr) + '" y="' + (y(0.5) - 5) +
           '" text-anchor="end" font-family="monospace" font-size="8" fill="#ef6a72">50%</text>');
    o.push('<line x1="' + pl + '" y1="' + y(0) + '" x2="' + (W - pr) + '" y2="' + y(0) +
           '" stroke="rgba(196,176,228,.22)" stroke-width="1"/>');
    o.push('<line x1="' + pl + '" y1="' + pt + '" x2="' + pl + '" y2="' + y(0) +
           '" stroke="rgba(196,176,228,.22)" stroke-width="1"/>');
    for (var t = 0; t <= 1; t += 0.25) {
      o.push('<text x="' + (pl - 6) + '" y="' + (y(t) + 3) +
             '" text-anchor="end" font-family="monospace" font-size="8" fill="#4c4560">' + (t * 100) + '</text>');
    }
    var pts = sw.points;
    var d = "";
    for (var i = 0; i < pts.length; i++) d += (i ? " L" : "M") + x(pts[i].rho).toFixed(1) + "," + y(pts[i].surv).toFixed(1);
    o.push('<path d="' + d + '" fill="none" stroke="#5fd08a" stroke-width="2"/>');
    for (i = 0; i < pts.length; i++) {
      var col = pts[i].surv >= 0.5 ? "#5fd08a" : "#c9a05a";
      o.push('<circle cx="' + x(pts[i].rho).toFixed(1) + '" cy="' + y(pts[i].surv).toFixed(1) +
             '" r="3.4" fill="#0c0a14" stroke="' + col + '" stroke-width="1.8"/>');
    }
    if (sw.crit !== null) {
      o.push('<line x1="' + x(sw.crit).toFixed(1) + '" y1="' + pt + '" x2="' + x(sw.crit).toFixed(1) +
             '" y2="' + y(0) + '" stroke="#ffd27f" stroke-width="1.2" stroke-dasharray="3 3"/>');
      o.push('<text x="' + (x(sw.crit) + 4).toFixed(1) + '" y="' + (pt + 10) +
             '" font-family="monospace" font-size="8.5" fill="#ffd27f">ρ*=' + sw.crit.toFixed(3) + '</text>');
    }
    o.push('<text x="' + (W / 2) + '" y="' + (H - 6) +
           '" text-anchor="middle" font-family="monospace" font-size="8" fill="#4c4560">每代新鲜真数据比例 ρ</text>');
    $("sweepSvg").innerHTML = o.join("");
    $("critVal").textContent = sw.crit === null ? "未找到 50% 交点" : "ρ* = " + sw.crit.toFixed(3);

    /* --- 采样量扫描 --- */
    var n2 = sn.points;
    var lx = function (N) { return pl + (Math.log(N / 100) / Math.log(300)) * iw; };
    var o2 = [];
    o2.push('<line x1="' + pl + '" y1="' + y(0) + '" x2="' + (W - pr) + '" y2="' + y(0) +
            '" stroke="rgba(196,176,228,.22)" stroke-width="1"/>');
    o2.push('<line x1="' + pl + '" y1="' + pt + '" x2="' + pl + '" y2="' + y(0) +
            '" stroke="rgba(196,176,228,.22)" stroke-width="1"/>');
    for (t = 0; t <= 1; t += 0.5) {
      o2.push('<text x="' + (pl - 6) + '" y="' + (y(t) + 3) +
              '" text-anchor="end" font-family="monospace" font-size="8" fill="#4c4560">' + (t * 100) + '</text>');
    }
    var series = [
      { l: 0, c: "#5fd08a" }, { l: 3, c: "#ffd27f" }, { l: 6, c: "#ef6a72" }
    ];
    series.forEach(function (s) {
      var dd = "";
      for (var j = 0; j < n2.length; j++) {
        dd += (j ? " L" : "M") + lx(n2[j].N).toFixed(1) + "," + y(clamp(n2[j].cov[s.l], 0, 1)).toFixed(1);
      }
      o2.push('<path d="' + dd + '" fill="none" stroke="' + s.c + '" stroke-width="1.9"/>');
      for (j = 0; j < n2.length; j++) {
        o2.push('<circle cx="' + lx(n2[j].N).toFixed(1) + '" cy="' + y(clamp(n2[j].cov[s.l], 0, 1)).toFixed(1) +
                '" r="2.6" fill="#0c0a14" stroke="' + s.c + '" stroke-width="1.5"/>');
      }
    });
    [100, 1000, 10000, 30000].forEach(function (N) {
      o2.push('<text x="' + lx(N).toFixed(1) + '" y="' + (H - 6) +
              '" text-anchor="middle" font-family="monospace" font-size="8" fill="#4c4560">' + N + '</text>');
    });
    o2.push('<text x="' + (W / 2) + '" y="' + (pt + 8) +
            '" text-anchor="middle" font-family="monospace" font-size="8" fill="#4c4560">每代采样量 N（对数轴）</text>');
    $("nSvg").innerHTML = o2.join("");
    $("visVal").textContent = "N=" + st.N + " 时可见 " + G.visibleOf(
      sn.points.reduce(function (best, p) {
        return Math.abs(Math.log(p.N / st.N)) < Math.abs(Math.log(best.N / st.N)) ? p : best;
      }, sn.points[0]).cov
    ).judgeable.length + "/8 层";
  }

  /* ============================================================
     存档
     ============================================================ */
  function buildRecord() {
    var r = st.r, e = r.est;
    return E.create({
      hall: "H5",
      instrument: { id: "lineage-greenhouse", version: r.meta.version },
      title: "谱系温室 · ρ" + pct(r.meta.rho) + " N" + r.meta.N + " G" + r.meta.G +
             " · 枯 " + e.wilted + " 盲 " + e.blind + " 活 " + e.alive,
      case: { id: "YC-CASE-COLLAPSE", title: "数据反复来自模型自身时，哪些信息会消失" },
      tags: { object: "toydist", run: "live", source: "controlled", review: "replayable" },
      source: {
        dataType: "synthetic",
        note: "程序生成的 96 仓离散分布（三峰＋宽尾＋十个极稀卫星仓）；模型是同网格直方图，非神经网络。",
        generator: "yc-greenhouse.js v" + r.meta.version
      },
      design: {
        question: "在自训练递归中，哪些质量层的信息会不可逆地消失？消失该归因于分辨率还是递归？",
        hypothesis: "无新鲜数据时支撑会按分位从稀到密不可逆丢失；提高采样量只推迟，提高混合比才改变归宿。",
        conditions: [
          "ρ = " + r.meta.rho + "（每代新鲜真数据比例）",
          "N = " + r.meta.N + "（每代样本量）",
          "G = " + r.meta.G + "（观测窗代数）",
          r.meta.lines + " 条平行谱系，α = " + r.meta.alpha + "（无加性平滑）"
        ],
        controls: [
          "同一 seed 派生 16 条谱系", "第 0 代 = 真分布（无限真数据）",
          "可见性由第 1 代支撑覆盖率判定", "判定只覆盖被看见的层"
        ]
      },
      budget: { lines: r.meta.lines, generations: r.meta.G, samplesPerGen: r.meta.N,
                totalSamples: r.meta.lines * r.meta.G * r.meta.N },
      run: {
        seed: r.meta.seed,
        params: { rho: r.meta.rho, N: r.meta.N, G: r.meta.G, lines: r.meta.lines, alpha: r.meta.alpha },
        wallMs: r.ms
      },
      stats: {
        n: r.meta.lines * r.meta.G,
        resampleUnit: "谱系（同一谱系内各代强相关，单代不独立）",
        wiltFrac: e.wiltFrac, medLost: e.medLost,
        wiltedLayers: r.wiltedLayers.map(function (x) { return x + 1; }),
        blindLayers: r.blindLayers.map(function (x) { return x + 1; }),
        aliveLayers: r.aliveLayers.map(function (x) { return x + 1; }),
        medDeath: e.medDeath, deathMin: e.deathMin, deathMax: e.deathMax,
        fid0: e.fid0, fidG: e.fidG, H0: e.H0, HG: e.HG,
        keepG: e.keepG,
        guards: r.guards.map(function (g) { return (g.ok ? "✓ " : "! ") + g.label + "（" + g.detail + "）"; })
      },
      conclusion: {
        verdict: r.verdict,
        why: r.why,
        supported: [
          "8 层中：枯萎 " + e.wilted + "、看不见 " + e.blind + "、幸存 " + e.alive,
          "枯萎谱系占 " + pct(e.wiltFrac) + "，中位枯萎层数 " + e.medLost +
            "，枯萎世代中位 " + (e.medDeath === null ? "—" : e.medDeath) +
            "（区间 " + e.deathMin + "—" + e.deathMax + "）",
          "同 seed / 参数重跑得到完全相同的 16 条谱系"
        ],
        alternatives: [
          "枯得早也可能是 N 太小 —— 由分辨率守卫与 N 扫描专门检查",
          "枯得晚也可能是观测窗太短 —— 由长度守卫与归因分解专门检查"
        ],
        unsupported: [
          "模型是 96 仓直方图，不是神经网络；它展示重采样的数学结构，不展示任何真实模型训练",
          "八层等权是人为选择，不按质量加权",
          "结论绑定在 N、ρ、G 三个参数上，换参数会变",
          "不宣称方法首创（模型坍塌、Wright–Fisher 漂变、尾部截断均为既有概念）"
        ],
        nextData: [
          "把 ρ 扫一遍，报出临界混合比 ρ*",
          "换更细的网格（K 更大），看分辨率门槛怎么移动"
        ]
      },
      review: {
        replayMethod: "同 seed / ρ / N / G / lines / α 重跑，得到完全相同的谱系与枯萎世代",
        status: "replayable",
        corrections: []
      }
    });
  }

  function saveRecord() {
    if (!st.r) return;
    var rec = buildRecord();
    var v = E.validate(rec);
    if (!v.ok) {
      $("saveResult").className = "sr no";
      $("saveResult").textContent = "档案不合规，未存档：\n" + v.errors.join("\n");
      return;
    }
    E.save(rec);
    var inLib = E.list({ hall: "H5" }).length;
    $("saveResult").className = "sr ok";
    $("saveResult").textContent =
      "已存入公共证据厅：" + rec.id + "\n" +
      "校验值 " + rec.checksum + "　四轴 " +
      Object.keys(rec.tags).map(function (k) { return rec.tags[k]; }).join(" / ") + "\n" +
      "库内 H5 档案 " + inLib + " 份。同 seed 重跑可复现这份记录。";
    $("btnSave").textContent = "已存 · " + rec.id.slice(-4);
  }

  function exportMd() {
    if (!st.r) { $("saveResult").textContent = "还没有可导出的播种。"; return; }
    var rec = buildRecord();
    var md = E.exportMarkdown(rec);
    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = rec.id + ".md";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    $("saveResult").className = "sr";
    $("saveResult").textContent = "已导出 " + rec.id + ".md";
  }

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    if (!G || !E) return;

    /* 反事实面板插在镜面与八层表之间 */
    var cf = document.createElement("div");
    cf.className = "mirror";
    cf.id = "cfBox";
    cf.style.display = "none";
    cf.style.borderTop = "1px solid var(--line)";
    document.querySelector(".fates").before(cf);

    /* 底部小径 */
    var stones = document.querySelectorAll(".stone");
    for (var i = 0; i < stones.length; i++) {
      stones[i].addEventListener("click", function () {
        goto(this.getAttribute("data-l"));
      });
    }

    $("pickBack").addEventListener("click", clearSel);
    $("btnSave").addEventListener("click", saveRecord);
    $("btnExport").addEventListener("click", exportMd);

    $("kRho").value = Math.round(st.rho * 100);
    $("kRhoV").textContent = pct(st.rho);
    $("kN").value = sliderFromN(st.N);
    $("kNV").textContent = st.N;
    $("kG").value = st.G;
    $("kGV").textContent = st.G;

    bindKnobs();
    bindGen();
    bindTrellis();
    run();

    var rt = null;
    window.addEventListener("resize", function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () { rt = null; drawTrellis(); drawMirror(); }, 160);
    });
    $("genVal").textContent = st.G + " / " + st.G;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

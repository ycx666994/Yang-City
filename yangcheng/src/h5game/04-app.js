/* ==========================================================================
   H5 精英挑战 · 坍塌预报台 · 三个温室
   --------------------------------------------------------------------------
   玩法内核与另外三馆都不同：这是**读图预报**，不是调参、不是审讯、不是走迷宫。
   规则：
     · 三个温室，参数不同，图都只画到一半（第 10 / 8 / 6 代，真实窗口 24 代）。
     · 玩家要为八个质量层各插一面旗：活着 / 会枯死 / 看不见。
     · 每轮两次诊断额度：加预算、拉窗口。诊断给的是「测量是否可信」，
       不是答案本身 —— 加了预算只能让盲层变得可见，不会让枯死的层活过来。
     · 插错一层少 4 分，三轮满分 96，全对再加 4 分。
   所有数值都来自 yc-greenhouse.js 实算，答案键就是 fate 数组。
   ========================================================================== */
(function () {
  "use strict";

  var G = window.YCGreenhouse, D = window.YCDeep;
  if (!G) { return; }
  function $(id) { return document.getElementById(id); }

  var LN = ["最密 50%", "50—75%", "75—90%", "90—97%", "97—99%", "99—99.7%", "99.7—99.9%", "99.9—100%"];
  var FATE_CN = { alive: "活着", wilted: "枯死", blind: "看不见" };

  var ROUNDS = [
    {
      id: 1, title: "温室 A · 每代 5% 新鲜数据",
      rho: 0.05, N: 400, G: 24, lines: 16, seed: 20311030, k: 10,
      note: "这个温室每代只有 <b>5%</b> 的数据是新鲜的，其余全部来自上一代模型自己。采样预算 400。" +
        "藤蔓只画到第 <b>10</b> 代就停了 —— 你要猜的是第 24 代。",
      tip: "先看第 1 列：覆盖率不到一半的层，从头到尾就没被采到过。"
    },
    {
      id: 2, title: "温室 B · 每代 30% 新鲜数据",
      rho: 0.30, N: 3200, G: 24, lines: 16, seed: 20311030, k: 8,
      note: "每代 <b>30%</b> 新鲜数据，采样预算给到 <b>3200</b>。图只画到第 <b>8</b> 代。" +
        "这一轮的预算足够看清大部分层，但最稀的那一层仍然只有零星几个样本。",
      tip: "预算高了，盲层会变少 —— 但「能看见」和「活着」仍然是两件事。"
    },
    {
      id: 3, title: "温室 C · 每代 2% 新鲜数据，预算 100",
      rho: 0.02, N: 100, G: 24, lines: 16, seed: 20311030, k: 6,
      note: "每代只有 <b>2%</b> 新鲜数据，采样预算只有 <b>100</b>。图只画到第 <b>6</b> 代。" +
        "这一轮最难：你能看见的层很少，而看得见的那几层看上去都还没死。",
      tip: "第 1 代覆盖率就低于一半的层，无论后面怎么画都不能判「活」。"
    }
  ];

  var st = {
    ri: 0,
    flags: [[], [], []],       /* 每轮 8 个旗位 */
    res: [null, null, null],
    diagLeft: [2, 2, 2],
    diagDone: [{}, {}, {}],
    revealed: [false, false, false],
    correct: [0, 0, 0],
    over: false
  };

  /* ---------------- 计算 ---------------- */
  function resOf(i) {
    if (!st.res[i]) {
      var R = ROUNDS[i];
      st.res[i] = G.run({ rho: R.rho, N: R.N, G: R.G, lines: R.lines, seed: R.seed });
    }
    return st.res[i];
  }

  function covColor(v) {
    if (v == null) return "#221316";
    if (v >= 0.80) return "#6fbf73";
    if (v >= 0.60) return "#9cc25a";
    if (v >= 0.40) return "#d0a83f";
    if (v >= 0.20) return "#b57a3c";
    if (v >= 0.05) return "#7d3f38";
    return "#2a1a1c";
  }

  /* ---------------- 绘制：轮次圆点 ---------------- */
  function paintRounds() {
    var H = "";
    ROUNDS.forEach(function (R, i) {
      var cls = "rd" + (i === st.ri && !st.revealed[i] ? " on" : "") + (st.revealed[i] ? " done" : "");
      H += '<div class="' + cls + '">' + R.id + "</div>";
    });
    $("rounds").innerHTML = H;
    $("scNow").textContent = totalScore();
  }

  /* 计分只有这一处：错一层 −4，二十四层全对再加 4 */
  function totalScore() {
    var t = st.correct.reduce(function (a, b) { return a + b; }, 0) * 4;
    if (st.correct.every(function (c) { return c === 8; })) t += 4;
    return t;
  }

  /* ---------------- 绘制：轮次说明 ---------------- */
  function paintHead() {
    var R = ROUNDS[st.ri];
    $("rhead").innerHTML =
      '<div class="k">ROUND ' + R.id + " / 3 · FORECAST</div>" +
      "<h2>" + R.title + "</h2>" +
      "<p>" + R.note + "</p>" +
      '<div class="fcparams">' +
      '<span class="pp">ρ 日照 <b>' + (R.rho * 100).toFixed(0) + "%</b></span>" +
      '<span class="pp">N 预算 <b>' + R.N + "</b></span>" +
      '<span class="pp">G 真实窗口 <b>' + R.G + " 代</b></span>" +
      '<span class="pp">可见 <b>' + R.k + " 代</b></span>" +
      '<span class="pp">谱系 <b>' + R.lines + " 条</b></span>" +
      "</div>";
  }

  /* ---------------- 绘制：藤蔓图 ---------------- */
  function paintChart() {
    var R = ROUNDS[st.ri], r = resOf(st.ri);
    var rev = st.revealed[st.ri];
    var H = [];

    /* 轴 */
    H.push('<div class="fcaxis"><div class="al">质量层 / 仓</div><div class="gens">');
    for (var g = 1; g <= R.k; g++) H.push("<i>" + g + "</i>");
    H.push('</div><div class="fg">' + (rev ? "真实结局" : "你的预报") + "</div></div>");

    for (var L = 0; L < 8; L++) {
      var wrong = rev && st.flags[st.ri][L] !== r.fate[L];
      H.push('<div class="fcrow' + (rev ? " rev" : "") + (wrong ? " wrong" : "") + '" data-l="' + L + '">');
      H.push('<div class="fcln"><b>' + ("0" + (L + 1)) + "</b><span>" + LN[L] + "</span></div>");
      H.push('<div class="fccells">');
      for (var k = 0; k < R.k; k++) {
        var v = r.byGen[k] ? r.byGen[k].cov[L] : 0;
        H.push('<i' + (k === 0 ? ' class="first"' : "") + ' style="background:' + covColor(v) + '"' +
          ' title="第 ' + (k + 1) + " 代 · 覆盖率 " + (v * 100).toFixed(0) + '%"></i>');
      }
      H.push("</div>");
      H.push('<div class="fcflag" data-l="' + L + '">');
      if (rev) {
        H.push('<span class="mark ' + (wrong ? "no" : "ok") + '">' + (wrong ? "✗" : "✓") + "</span>");
        H.push('<button disabled class="on" data-f="' + r.fate[L] + '">' + FATE_CN[r.fate[L]] + "</button>");
      } else {
        ["alive", "wilted", "blind"].forEach(function (f) {
          H.push('<button data-f="' + f + '"' +
            (st.flags[st.ri][L] === f ? ' class="on"' : "") + ">" + FATE_CN[f] + "</button>");
        });
      }
      H.push("</div></div>");
    }

    H.push('<div class="fclegend">' +
      '<span><i style="background:#6fbf73"></i>覆盖率 ≥ 80%</span>' +
      '<span><i style="background:#9cc25a"></i>60—80%</span>' +
      '<span><i style="background:#d0a83f"></i>40—60%</span>' +
      '<span><i style="background:#b57a3c"></i>20—40%</span>' +
      '<span><i style="background:#7d3f38"></i>5—20%</span>' +
      '<span><i style="background:#2a1a1c"></i>&lt; 5%</span>' +
      '<span style="margin-left:auto;color:#c9a3a8">第 1 列描边 = 判断「看不看得见」的那一列</span>' +
      "</div>");
    $("chart").innerHTML = H.join("");
  }

  /* ---------------- 绘制：旗位计数与按钮 ---------------- */
  function paintFoot() {
    var f = st.flags[st.ri], n = 0;
    for (var i = 0; i < 8; i++) if (f[i]) n++;
    $("flagN").textContent = n;
    $("btnSubmit").disabled = st.over || st.revealed[st.ri] || n < 8;
    $("btnReset").disabled = st.over || st.revealed[st.ri];
    $("diagLeft").textContent = st.diagLeft[st.ri] + " / 2";
    $("dN").disabled = st.over || st.diagLeft[st.ri] <= 0 || !!st.diagDone[st.ri].N;
    $("dG").disabled = st.over || st.diagLeft[st.ri] <= 0 || !!st.diagDone[st.ri].G;
    if (st.revealed[st.ri]) {
      $("btnSubmit").textContent = st.ri < 2 ? "进入下一轮 →" : "看总成绩 →";
      $("btnSubmit").disabled = st.over;
    } else {
      $("btnSubmit").textContent = "提交预报";
    }
  }

  /* ---------------- 交互：插旗 ---------------- */
  function setFlag(L, f) {
    if (st.over || st.revealed[st.ri]) return;
    st.flags[st.ri][L] = f;
    paintChart(); paintFoot();
  }

  /* ---------------- 交互：诊断 ---------------- */
  function diag(kind) {
    if (st.over || st.revealed[st.ri]) return;
    if (st.diagLeft[st.ri] <= 0 || st.diagDone[st.ri][kind]) return;
    var R = ROUNDS[st.ri], base = resOf(st.ri);
    var alt, txt;
    if (kind === "N") {
      alt = G.run({ rho: R.rho, N: R.N * 8, G: R.G, lines: R.lines, seed: R.seed });
      var b0 = base.blindLayers.length, b1 = alt.blindLayers.length;
      var opened = alt.aliveLayers.concat(alt.wiltedLayers).filter(function (l) {
        return base.blindLayers.indexOf(l) >= 0;
      });
      txt = "预算 ×8 之后，盲层从 <b>" + b0 + "</b> 降到 <b>" + b1 + "</b>。" +
        (opened.length
          ? "新变得可见的层是第 <b>" + opened.map(function (l) { return l + 1; }).join("、") + "</b> 层 —— 它们本来就在那里，" +
            "只是你之前没采到。它们现在的结局是：" +
            opened.map(function (l) { return "第 " + (l + 1) + " 层" + FATE_CN[alt.fate[l]]; }).join("、") + "。"
          : "没有新的层变得可见。") +
        "<br><span style='color:#8a6a70'>注意：加预算只让「看不见」变成「看得见」，它不会让已经枯死的层活过来。</span>";
    } else {
      alt = G.run({ rho: R.rho, N: R.N, G: R.G * 3, lines: R.lines, seed: R.seed });
      var w0 = base.wiltedLayers.length, w1 = alt.wiltedLayers.length;
      txt = "窗口拉长到 <b>" + (R.G * 3) + "</b> 代之后，判定从 <b>" + base.verdict + "/" + base.subtype +
        "</b> 变成 <b>" + alt.verdict + "/" + alt.subtype + "</b>，枯死层数从 <b>" + w0 + "</b> 变成 <b>" + w1 + "</b>。" +
        (w1 > w0
          ? "也就是说，现在看起来还稳的层里，有 <b>" + (w1 - w0) + "</b> 层只是还没死到。"
          : "结局没有改变 —— 这些层是真的稳住了，不是死得慢。") +
        "<br><span style='color:#8a6a70'>注意：窗口只告诉你「以后会怎样」，它不会改变你已经看到的这 " + R.k + " 代。</span>";
    }
    st.diagLeft[st.ri]--;
    st.diagDone[st.ri][kind] = 1;
    $("dres").innerHTML = txt;
    paintFoot();
  }

  /* ---------------- 提交 ---------------- */
  function submit() {
    if (st.over) return;
    if (st.revealed[st.ri]) {
      if (st.ri < 2) { st.ri++; paintAll(); $("dres").innerHTML = ""; }
      else settle();
      return;
    }
    var r = resOf(st.ri), f = st.flags[st.ri];
    var ok = 0;
    for (var L = 0; L < 8; L++) if (f[L] === r.fate[L]) ok++;
    st.correct[st.ri] = ok;
    st.revealed[st.ri] = true;

    var miss = [];
    for (L = 0; L < 8; L++) if (f[L] !== r.fate[L]) miss.push(L + 1);

    $("dres").innerHTML = "本轮 <b>" + ok + " / 8</b> 层判对，得 <b>" + ok * 4 + "</b> 分。" +
      (miss.length
        ? " 判错的是第 <b>" + miss.join("、") + "</b> 层 —— 看图上标红的那几行，它们的真实结局已经写在旗位上。"
        : " 八层全对。") +
      "<br><span style='color:#8a6a70'>" + ROUNDS[st.ri].tip + "</span>";
    paintChart(); paintFoot(); paintRounds();
  }

  /* ---------------- 结算 ---------------- */
  function settle() {
    st.over = true;
    var total = totalScore();
    var perfect = st.correct.every(function (c) { return c === 8; });
    var elite = total >= 80;

    var H = ['<div class="fcend">'];
    H.push('<div class="eh"><h2>' + (elite ? "预报通过" : "预报未达线") + "</h2>" +
      '<span class="sc">' + total + "<small> / 100</small></span></div>");
    H.push('<div class="es">' + (elite
      ? "你没有被「覆盖率看上去还行」骗过去，也没有把「看不见」当成「活着」。这两件事是这一馆真正要考的东西。"
      : "预报的错，几乎都错在同一处：把第一列就已经低于一半的层判成了「活着」，或者把还在缓慢下滑的层判成了「稳住」。") + "</div>");

    H.push('<div class="parts">');
    ROUNDS.forEach(function (R, i) {
      H.push('<div class="p"><div class="pl">温室 ' + String.fromCharCode(65 + i) + "</div>" +
        '<div class="pv">' + st.correct[i] + " <span style=\"font-size:11px;color:var(--fc-tx3)\">/ 8 层</span></div>" +
        '<div class="pn">' + (st.correct[i] * 4) + " 分</div></div>");
    });
    H.push('<div class="p"><div class="pl">全对奖励</div>' +
      '<div class="pv">' + (perfect ? "+4" : "0") + "</div>" +
      '<div class="pn">' + (perfect ? "24 层全判对" : "差 " + (24 - st.correct.reduce(function (a, b) { return a + b; }, 0)) + " 层") + "</div></div>");
    H.push("</div>");

    if (elite && D) {
      var cert = D.getCert("H5", "elite");
      if (!cert) {
        cert = D.issueCert("H5", "elite", {
          play: "坍塌预报台 · 三个温室",
          score: total,
          detail: [
            "三个温室 · 二十四层预报 · 判对 " + st.correct.reduce(function (a, b) { return a + b; }, 0) + " / 24 层",
            "温室 A " + st.correct[0] + "/8 · B " + st.correct[1] + "/8 · C " + st.correct[2] + "/8",
            "用覆盖率判死活 · 用第 1 代识别盲层 · 用相对保留识别枯萎",
            "全程未把「看不见」当成「活着」"
          ]
        });
      }
      H.push('<div class="certbox"><div class="ct">精英证书已签发</div>' +
        '<div class="cd">这一馆的二级证书不发给「看过藤蔓图的人」，只发给能在一张只画到一半的图上，' +
        '说清哪一层还活着、哪一层会死、哪一层根本不该下判断的人。</div>' +
        '<div class="cn">' + esc(cert.no) + " · 校验 " + esc(cert.checksum) + "</div></div>");
    } else {
      H.push('<div class="certbox" style="border-color:rgba(255,107,107,.34);background:rgba(255,107,107,.05)">' +
        '<div class="ct" style="color:#ff8f8f">未达精英线</div>' +
        '<div class="cd">精英线 80 分。重开一次，先记住两条：' +
        '<b>第 1 列覆盖率低于一半的层，只能标盲</b>；<b>判死活看的是它自己掉了多少，不是还剩多少</b>。</div></div>');
    }

    H.push('<div class="btnrow"><button id="btnAgain">重开预报台</button>' +
      '<button class="ghost" id="btnBack">回坍塌馆</button></div></div>');
    $("endBox").innerHTML = H.join("");
    $("btnAgain").addEventListener("click", restart);
    $("btnBack").addEventListener("click", function () { location.href = "h5-collapse.html"; });
    paintRounds(); paintFoot();
    $("endBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function restart() {
    st.ri = 0;
    st.flags = [[], [], []];
    st.diagLeft = [2, 2, 2];
    st.diagDone = [{}, {}, {}];
    st.revealed = [false, false, false];
    st.correct = [0, 0, 0];
    st.over = false;
    $("endBox").innerHTML = "";
    $("dres").innerHTML = "";
    paintAll();
  }

  function paintAll() {
    paintRounds(); paintHead(); paintChart(); paintFoot();
  }

  /* ---------------- 绑定 ---------------- */
  function boot() {
    $("chart").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]");
      if (!b || b.disabled) return;
      var box = b.closest(".fcflag");
      if (!box) return;
      setFlag(+box.dataset.l, b.dataset.f);
    });
    $("dN").addEventListener("click", function () { diag("N"); });
    $("dG").addEventListener("click", function () { diag("G"); });
    $("btnSubmit").addEventListener("click", submit);
    $("btnReset").addEventListener("click", function () {
      if (st.revealed[st.ri] || st.over) return;
      st.flags[st.ri] = []; paintChart(); paintFoot();
    });
    paintAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ---------------- 体检钩子（只读） ---------------- */
  window.YCForecast = {
    status: function () {
      return {
        round: st.ri,
        revealed: st.revealed[st.ri],
        flags: st.flags[st.ri].slice(),
        diagLeft: st.diagLeft[st.ri],
        correct: st.correct.slice(),
        rows: document.querySelectorAll(".fcrow").length,
        cols: document.querySelectorAll(".fcrow .fccells i").length / 8,
        over: st.over
      };
    },
    fate: function () { return resOf(st.ri).fate.slice(); },
    setFlag: function (L, f) { setFlag(L, f); },
    fillAll: function (f) { for (var i = 0; i < 8; i++) st.flags[st.ri][i] = f; paintChart(); paintFoot(); },
    fillTrue: function () {
      var r = resOf(st.ri);
      for (var i = 0; i < 8; i++) st.flags[st.ri][i] = r.fate[i];
      paintChart(); paintFoot();
    },
    diag: function (k) { diag(k); },
    submit: function () { submit(); },
    score: function () { return { total: totalScore(), correct: st.correct.slice() }; }
  };
})();

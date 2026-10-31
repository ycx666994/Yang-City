/* ==========================================================================
   H4 精英挑战 · 净化车间 · 十二道工序
   --------------------------------------------------------------------------
   玩法内核与 H2（四幕审讯）、H3（3D 迷宫）都不同：这是**资源受限下的审计**。
   核心约束：
     · 十二道工序额度。改参数、复核、开庭都要花额度。
     · 每次开庭必须**先解释这次读数是什么意思**，解释对了才返还额度。
       这一条把「拧旋钮碰运气」变成「必须读懂守卫」。
     · 最终报告要成立，需要三件事同时成立：
         判定明确（不是 undetermined）· 五道守卫全绿 · 换种子复核判定不变。
       第三件是本馆真正的门槛：一个换种子就翻的结论，本来就不该交出去。
   所有数值都来自 yc-contamination.js 实算。
   ========================================================================== */
(function () {
  "use strict";

  var C = window.YCContam, D = window.YCDeep;
  if (!C) { return; }
  function $(id) { return document.getElementById(id); }

  var BUDGET = 12;
  /* 最后一档是陷阱：0.90 会让记忆认不出这道题，探针断开。 */
  var WSTEPS = [0.15, 0.30, 0.45, 0.60, 0.90];
  var NSTEPS = [24, 48, 96, 192, 384];
  var VERIFY_SEED = 9176;
  var MEM_TRUTH = 0.95;          /* 被审计者的真实记忆强度，玩家看不到 */

  var st = {
    wi: 0, ni: 0, ln: 0.35,
    left: BUDGET,
    seed: 20261031,
    reading: null,
    verify: null,
    log: [],
    asked: 0, right: 0,
    quiz: null,
    over: false
  };

  /* ---------------- 读数 → 该怎么读 ---------------- */
  var REASONS = {
    "supported/stale": { ok: 1, t: "可以下结论：它在回吐旧答案，不是算错。" },
    "refuted/compute": { ok: 1, t: "可以下结论：它在算——回吐率与偶然水平分不开。" },
    "noeffect/noadv": { ok: 1, t: "可以下结论：见过这道题没带来可测优势，没有需要解释的东西。" },
    "conflict/label": { ok: 1, t: "可以下结论，但 κ̂ 只能当「至少」读：泄漏的答案里有一部分本身是错的。" },
    "undetermined/vacuous": { ok: 0, t: "不能判：改数没改变答案，这一整档题不提供任何信息。" },
    "undetermined/probe": { ok: 0, t: "不能判：探针没接通，κ̂≈0 不携带信息。" },
    "undetermined/n": { ok: 0, t: "不能判：题组太少，自助法区间压不下来。" },
    "undetermined/straddle": { ok: 0, t: "不能判：区间跨过判定边界，点估计不能当结论。" },
    "undetermined/mixed": { ok: 0, t: "不能判：回吐压力落在中间地带，两种解释都成立。" }
  };
  function reasonKey(r) { return r.verdict + "/" + r.subtype; }
  function reasonOf(r) { return REASONS[reasonKey(r)] || { ok: 0, t: "不能判：判定未定。" }; }

  /* ---------------- 计算 ---------------- */
  function params(seed) {
    return {
      rewrite: WSTEPS[st.wi],
      n: NSTEPS[st.ni],
      labelNoise: st.ln,
      mem: MEM_TRUTH,
      seed: seed == null ? st.seed : seed
    };
  }
  function compute(seed) {
    try { return C.runAudit(params(seed)); }
    catch (e) { return null; }
  }

  /* ---------------- 工具 ---------------- */
  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }
  function f2(v) { return v == null ? "—" : v.toFixed(2); }
  function greens(r) { var c = 0; for (var i = 0; i < r.guards.length; i++) if (r.guards[i].ok) c++; return c; }
  function clearVerdict(r) { return r.verdict !== "undetermined"; }
  function allGreen(r) { return greens(r) === r.guards.length; }

  /* ============================================================
     绘制：额度条
     ============================================================ */
  function paintBudget() {
    var h = "";
    for (var i = 0; i < BUDGET; i++) {
      h += '<i class="' + (i < st.left ? "on" : "spent") + '"></i>';
    }
    $("pips").innerHTML = h;
    $("budN").textContent = st.left;
  }

  /* ============================================================
     绘制：档位条
     ============================================================ */
  function paintSteps() {
    var hw = "", hn = "";
    WSTEPS.forEach(function (v, i) {
      var cost = Math.abs(i - st.wi);
      var dis = st.over || (cost > 0 && cost > st.left);
      hw += '<button data-w="' + i + '"' + (i === st.wi ? ' class="on"' : "") + (dis ? " disabled" : "") +
        ' title="' + (cost ? "移动 " + cost + " 道工序" : "当前档") + '">' + v.toFixed(2) + "</button>";
    });
    NSTEPS.forEach(function (v, i) {
      var cost = Math.abs(i - st.ni);
      var dis = st.over || (cost > 0 && cost > st.left);
      hn += '<button data-n="' + i + '"' + (i === st.ni ? ' class="on"' : "") + (dis ? " disabled" : "") +
        ' title="' + (cost ? "移动 " + cost + " 道工序" : "当前档") + '">' + v + "</button>";
    });
    $("wSteps").innerHTML = hw;
    $("nSteps").innerHTML = hn;

    $("wHint").innerHTML = "改得太轻，题目根本没变（甲乙同答案 100%）；改得太重，记忆认不出这道题。" +
      " 当前 <b>" + WSTEPS[st.wi].toFixed(2) + "</b>，移动一格花 1 道工序。";
    $("nHint").innerHTML = "题组太少，自助法区间压不下来，任何点估计都会跨线。下限是 60 组。" +
      " 当前 <b>" + NSTEPS[st.ni] + "</b> 组，移动一格花 1 道工序。";
  }

  /* ============================================================
     绘制：读数台
     ============================================================ */
  function paintRead() {
    var r = st.reading;
    if (!r) {
      $("rdEmpty").style.display = "";
      $("rdBody").style.display = "none";
      $("rdSt").className = "st";
      $("rdSt").textContent = "待开庭";
      return;
    }
    $("rdEmpty").style.display = "none";
    $("rdBody").style.display = "";

    var cl = clearVerdict(r), ag = allGreen(r);
    $("rdSt").className = "st " + (cl && ag ? "ok" : (cl ? "ok" : "bad"));
    $("rdSt").textContent = (cl ? "判定明确" : "不可判") + " · 守卫 " + greens(r) + "/" + r.guards.length;

    var H = [];
    H.push('<div class="pgkv">');
    H.push(cell("三档准确率 甲 / 乙 / 丙", pct(r.est.accA) + " / " + pct(r.est.accB) + " / " + pct(r.est.accC),
      "甲−丙 " + (r.est.advAC * 100).toFixed(1) + "pp", "hi"));
    H.push(cell("回吐率 R / 偶然 R₀", pct(r.est.R) + " / " + pct(r.est.R0),
      "参照组同答案水平", r.est.R > 0.5 ? "warn" : ""));
    H.push(cell("κ̂ · 回吐压力", f2(r.est.kappa),
      r.est.ci ? "区间 " + f2(r.est.ci[0]) + "–" + f2(r.est.ci[1]) : "区间 —", "hi"));
    H.push(cell("表面匹配 ρ̄", f2(r.est.rhoBar),
      "阈值 0.55 · 甲乙同答案 " + pct(r.est.eqRate), r.est.rhoBar < 0.55 ? "warn" : ""));
    H.push('</div>');

    H.push('<div class="pgguard">');
    r.guards.forEach(function (g) {
      H.push('<div class="pgg' + (g.ok ? "" : " no") + '"><div class="gn"><i></i>' + esc(g.label) + "</div>" +
        '<div class="gd">' + esc(g.detail) + "</div></div>");
    });
    H.push('</div>');

    H.push(scale(r));

    var cls = r.verdict === "undetermined" ? "undet" : (r.verdict === "conflict" ? "conflict" : "");
    H.push('<div class="pgverdict ' + cls + '">' +
      '<div class="vt">' + verdictCN(r) + "</div>" +
      '<div class="vw">' + esc(r.why) + "</div></div>");

    if (st.verify) {
      H.push('<div class="pgverdict ' + (st.verify.same ? "" : "conflict") + '" style="margin-top:10px">' +
        '<div class="vt">复核（种子 +' + VERIFY_SEED + "）· " + (st.verify.same ? "判定不变" : "判定翻了") + "</div>" +
        '<div class="vw">复核读数 ' + verdictCN(st.verify.r) + "。种子 " + st.verify.seed +
        "，κ̂ = " + f2(st.verify.r.est.kappa) +
        (st.verify.same ? "。结论稳得住。" : "。同一个设计换一批题就换结论 —— 这份报告不能交。") + "</div></div>");
    }

    $("rdBody").innerHTML = H.join("");
  }

  /* κ̂ 标尺：把数放到 0—1 的轴上，并画出 95% 区间与两条判定线 */
  function scale(r) {
    var k = r.est.kappa;
    var lo = r.est.ci ? r.est.ci[0] : null, hi = r.est.ci ? r.est.ci[1] : null;
    var pos = function (v) { return (Math.max(0, Math.min(1, v)) * 100).toFixed(2) + "%"; };
    var H = ['<div class="pgscale"><div class="track">'];
    if (lo != null && hi != null && hi > lo) {
      H.push('<div class="ci" style="left:' + pos(lo) + ';width:' + pos(hi - lo) + '"></div>');
    }
    if (k != null) H.push('<div class="pin" style="left:' + pos(k) + '"></div>');
    H.push('</div>');
    H.push('<div class="ticks"><span class="on">0 全在算</span><span>0.25</span><span>0.60</span><span class="on">1 全在搬</span></div>');
    var cap;
    if (k == null) {
      cap = "κ̂ 无定义 —— 偶然水平已经到 1，分母塌了。";
    } else if (r.verdict === "undetermined") {
      cap = "这条区间<b>跨过了判定线</b>，所以标尺上的位置不能当结论读。";
    } else if (k >= 0.60) {
      cap = "落在<b>回吐区</b>：扣掉偶然水平之后，仍有超过六成的题根本没算。";
    } else if (k <= 0.25) {
      cap = "落在<b>计算区</b>：回吐率与偶然水平分不开，它在算。";
    } else {
      cap = "落在<b>中间地带</b>：两种解释都成立，这个位置本身不是结论。";
    }
    H.push('<div class="cap">' + cap + "</div></div>");
    return H.join("");
  }

  function cell(lb, vv, nn, cls) {
    return '<div class="cell ' + (cls || "") + '"><div class="lb">' + esc(lb) + "</div>" +
      '<div class="vv">' + esc(vv) + '</div><div class="nn">' + esc(nn) + "</div></div>";
  }
  function verdictCN(r) {
    var m = {
      supported: "结论：确认回吐（supported）",
      refuted: "结论：它在算（refuted）",
      noeffect: "结论：没有可测优势（noeffect）",
      conflict: "结论：两通道矛盾，κ̂ 是下界（conflict）",
      undetermined: "结论：不可判（undetermined）"
    };
    return (m[r.verdict] || r.verdict) + " · " + r.subtype;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ============================================================
     绘制：账本
     ============================================================ */
  function paintLog() {
    var box = $("log");
    if (!st.log.length) { box.innerHTML = '<div class="none">还没有工序记录。</div>'; return; }
    var H = [];
    st.log.slice().reverse().forEach(function (e) {
      H.push('<div class="pglrow' + (e.final ? " final" : "") + '">' +
        '<span class="n">' + e.no + "</span>" +
        '<span class="d">' + e.d + "</span>" +
        '<span class="v ' + e.cls + '">' + esc(e.v) + "</span></div>");
    });
    box.innerHTML = H.join("");
  }

  /* ============================================================
     工序
     ============================================================ */
  function spend(k) { st.left = Math.max(0, st.left - k); }
  function invalidate() { st.reading = null; st.verify = null; }

  function moveW(i) {
    var cost = Math.abs(i - st.wi);
    if (st.over || cost === 0 || cost > st.left) return;
    spend(cost); st.wi = i; invalidate();
    pushLog("改写力度 → " + WSTEPS[i].toFixed(2), "−" + cost + " 道", "ok");
    repaint();
  }
  function moveN(i) {
    var cost = Math.abs(i - st.ni);
    if (st.over || cost === 0 || cost > st.left) return;
    spend(cost); st.ni = i; invalidate();
    pushLog("题组规模 → " + NSTEPS[i] + " 组", "−" + cost + " 道", "ok");
    repaint();
  }

  function opLabel() {
    if (st.over || st.left < 2 || st.ln < 0.05) return;
    spend(2); st.ln = st.ln * 0.4; invalidate();
    pushLog("标签复核 · 噪声 → " + st.ln.toFixed(3), "−2 道", "ok");
    repaint();
  }

  function opRun() {
    if (st.over || st.left < 1) return;
    var r = compute(st.seed);
    if (!r) return;
    spend(1);
    st.reading = r; st.verify = null;
    pushLog("开庭 · w=" + WSTEPS[st.wi].toFixed(2) + " n=" + NSTEPS[st.ni] + " ln=" + st.ln.toFixed(3),
      verdictShort(r), r.verdict === "undetermined" ? "undet" : "ok");
    repaint();
    askDiag(r);
  }

  function opRep() {
    if (st.over || st.left < 2 || !st.reading) return;
    var seed = (st.seed + VERIFY_SEED) >>> 0;
    var r = compute(seed);
    if (!r) return;
    spend(2);
    var same = r.verdict === st.reading.verdict;
    st.verify = { r: r, same: same, seed: seed };
    pushLog("复核 · 换种子重跑", same ? "判定不变" : "判定翻了", same ? "ok" : "bad");
    repaint();
  }

  function verdictShort(r) {
    var m = { supported: "确认回吐", refuted: "在算", noeffect: "无优势", conflict: "通道矛盾", undetermined: "不可判" };
    return (m[r.verdict] || r.verdict) + "/" + r.subtype;
  }

  function pushLog(d, v, cls) {
    st.log.push({ no: "0" + (st.log.length + 1), d: d, v: v, cls: cls });
  }

  /* ============================================================
     诊断题
     ============================================================ */
  var POOL = [
    "supported/stale", "refuted/compute", "noeffect/noadv", "conflict/label",
    "undetermined/vacuous", "undetermined/probe", "undetermined/n",
    "undetermined/straddle", "undetermined/mixed"
  ];

  function askDiag(r) {
    var key = reasonKey(r);
    var right = REASONS[key] ? key : "undetermined/mixed";
    var others = POOL.filter(function (k) { return k !== right; });
    /* 干扰项优先挑「同类但不同原因」的：判定同为 undetermined 的那几个最能骗人 */
    var sameFamily = others.filter(function (k) { return k.split("/")[0] === right.split("/")[0]; });
    var crossFamily = others.filter(function (k) { return k.split("/")[0] !== right.split("/")[0]; });
    var d1 = sameFamily.length ? sameFamily[(st.asked * 3) % sameFamily.length] : crossFamily[0];
    var rest = others.filter(function (k) { return k !== d1; });
    var d2 = rest[(st.asked * 5 + 2) % rest.length];

    var opts = [
      { k: right, ok: 1 },
      { k: d1, ok: 0 },
      { k: d2, ok: 0 }
    ];
    /* 打散位置：正确项不能永远在第一 */
    var shift = st.asked % 3;
    opts = opts.slice(shift).concat(opts.slice(0, shift));

    st.quiz = { right: right, opts: opts, answered: false };

    $("qH").textContent = "读数诊断 · 第 " + (st.asked + 1) + " 次开庭";
    $("qT").textContent = "这一次读数，该怎么读？";
    $("qS").innerHTML = "κ̂ = <b>" + f2(r.est.kappa) + "</b>，区间 " +
      (r.est.ci ? f2(r.est.ci[0]) + "–" + f2(r.est.ci[1]) : "—") +
      "，表面匹配 ρ̄ = <b>" + f2(r.est.rhoBar) + "</b>，甲乙同答案 <b>" + pct(r.est.eqRate) +
      "</b>，守卫 <b>" + greens(r) + "/" + r.guards.length + "</b> 绿。";
    $("qO").innerHTML = opts.map(function (o, i) {
      return '<button data-i="' + i + '">' + String.fromCharCode(65 + i) + "　" + esc(REASONS[o.k].t) + "</button>";
    }).join("");
    $("qR").innerHTML = "";
    $("qNext").disabled = true;
    $("mask").classList.add("on");
  }

  function answerDiag(i) {
    var q = st.quiz;
    if (!q || q.answered) return;
    var o = q.opts[i];
    if (!o) return;
    q.answered = true;
    st.asked++;
    var btns = $("qO").querySelectorAll("button");
    for (var j = 0; j < btns.length; j++) {
      btns[j].disabled = true;
      if (q.opts[j].ok) btns[j].classList.add("ok");
    }
    if (o.ok) {
      st.right++;
      st.left++;   /* 读懂了就返还这一道工序 */
      $("qR").innerHTML = '<span style="color:#35cfa8">✓ 记账。这一道工序返还 —— 你看懂了这台仪器在说什么。</span>';
    } else {
      btns[i].classList.add("no");
      $("qR").innerHTML = '<span style="color:#ffb3b3">✗ 记错了。</span> 正确的读法是：' +
        esc(REASONS[q.right].t) + "<br>读数已经进了账本，但这一次的工序不返还。";
    }
    $("qNext").disabled = false;
    repaint();
  }

  function closeDiag() {
    $("mask").classList.remove("on");
    st.quiz = null;
  }

  /* ============================================================
     结算
     ============================================================ */
  function score() {
    var r = st.reading;
    var cl = r ? clearVerdict(r) : false;
    var ag = r ? allGreen(r) : false;
    var usable = cl && ag;
    var verifyOk = !!(st.verify && st.verify.same);
    var diagRate = st.asked ? st.right / st.asked : 0;

    var s1 = usable ? 40 : ((cl || ag) ? 15 : 0);
    var s2 = verifyOk ? 25 : 0;
    var s3 = st.asked ? Math.round(diagRate * 25) : 0;
    var s4 = Math.min(10, st.left * 2);
    return {
      s1: s1, s2: s2, s3: s3, s4: s4, total: s1 + s2 + s3 + s4,
      usable: usable, clear: cl, allGreen: ag, verifyOk: verifyOk, diagRate: diagRate,
      elite: usable && verifyOk && (s1 + s2 + s3 + s4) >= 80
    };
  }

  function seal() {
    if (st.over) return;
    st.over = true;
    var sc = score();
    var r = st.reading;

    var H = [];
    H.push('<div class="pgend">');
    H.push('<div class="eh"><h2>' + (sc.elite ? "报告成立" : "报告不成立") + "</h2>" +
      '<span class="sc">' + sc.total + "<small> / 100</small></span></div>");
    H.push('<div class="es">' + (sc.elite
      ? "判定明确、五道守卫全绿、换种子复核判定不变 —— 三件事同时成立，这份报告可以交出去。"
      : (sc.usable
        ? "判定与守卫都过关，但复核没过：同一个设计换一批题就换结论，这份报告不能交。"
        : "判定不可用。要么守卫有红（这一档题提供不了信息），要么判定本身是 undetermined（不可判）。")) + "</div>");

    H.push('<div class="parts">');
    H.push(part("报告可用性", sc.s1, 40, sc.usable ? "判定明确 + 守卫全绿" : (sc.clear ? "判定明确但守卫有红" : "判定不可判")));
    H.push(part("可复核", sc.s2, 25, sc.verifyOk ? "换种子判定不变" : "未复核或复核翻面"));
    H.push(part("读数诊断", sc.s3, 25, st.right + " / " + st.asked + " 次读对"));
    H.push(part("工序节省", sc.s4, 10, "剩余 " + st.left + " 道"));
    H.push("</div>");

    if (sc.elite) {
      var cert = D ? D.getCert("H4", "elite") : null;
      if (!cert) {
        cert = D.issueCert("H4", "elite", {
          play: "净化车间 · 十二道工序",
          score: sc.total,
          detail: [
            "改写力度 " + WSTEPS[st.wi].toFixed(2) + " · 题组 " + NSTEPS[st.ni] + " 组 · 标签噪声 " + st.ln.toFixed(3),
            "判定 " + (r ? verdictShort(r) : "—") + " · κ̂ = " + (r ? f2(r.est.kappa) : "—"),
            "五道守卫全绿 · 换种子复核判定不变",
            "读数诊断 " + st.right + " / " + st.asked + " 次正确"
          ]
        });
      }
      H.push('<div class="certbox"><div class="ct">精英证书已签发</div>' +
        '<div class="cd">这一馆的二级证书不发给「参观过的人」，只发给能在预算不够、探针会断、参照组会变暖的条件下交出一份站得住报告的人。</div>' +
        '<div class="cn">' + esc(cert.no) + " · 校验 " + esc(cert.checksum) + "</div></div>");
    } else {
      H.push('<div class="certbox" style="border-color:rgba(255,107,107,.34);background:rgba(255,107,107,.05)">' +
        '<div class="ct" style="color:#ff8f8f">未达精英线</div>' +
        '<div class="cd">精英线 80 分，且必须同时满足「判定明确 + 守卫全绿 + 复核一致」。' +
        '重开一次，先想清楚：这一档题到底提供不了什么信息。</div></div>');
    }

    H.push('<div class="btnrow"><button id="btnRestart">重开车间</button>' +
      '<button class="ghost" id="btnBack">回污染馆</button></div>');
    H.push("</div>");

    $("endBox").innerHTML = H.join("");
    $("btnRestart").addEventListener("click", restart);
    $("btnBack").addEventListener("click", function () { location.href = "h4-contam.html"; });
    repaint();
    $("endBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function part(l, v, max, note) {
    return '<div class="p"><div class="pl">' + esc(l) + "</div>" +
      '<div class="pv">' + v + " <span style=\"font-size:11px;color:var(--pg-tx3)\">/ " + max + "</span></div>" +
      '<div class="pn">' + esc(note) + "</div></div>";
  }

  function restart() {
    st.wi = 0; st.ni = 0; st.ln = 0.35; st.left = BUDGET;
    st.reading = null; st.verify = null; st.log = [];
    st.asked = 0; st.right = 0; st.quiz = null; st.over = false;
    $("endBox").innerHTML = "";
    repaint();
  }

  /* ============================================================
     重绘
     ============================================================ */
  function repaint() {
    paintBudget(); paintSteps(); paintRead(); paintLog();
    var r = st.reading;
    $("opLabel").disabled = st.over || st.left < 2 || st.ln < 0.05;
    $("opRun").disabled = st.over || st.left < 1;
    $("opRep").disabled = st.over || st.left < 2 || !r;
    $("opSeal").disabled = st.over;
  }

  /* ============================================================
     绑定
     ============================================================ */
  function boot() {
    $("wSteps").addEventListener("click", function (e) {
      var b = e.target.closest("[data-w]"); if (b) moveW(+b.dataset.w);
    });
    $("nSteps").addEventListener("click", function (e) {
      var b = e.target.closest("[data-n]"); if (b) moveN(+b.dataset.n);
    });
    $("opLabel").addEventListener("click", opLabel);
    $("opRun").addEventListener("click", opRun);
    $("opRep").addEventListener("click", opRep);
    $("opSeal").addEventListener("click", seal);
    $("qO").addEventListener("click", function (e) {
      var b = e.target.closest("[data-i]"); if (b) answerDiag(+b.dataset.i);
    });
    $("qNext").addEventListener("click", closeDiag);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.quiz && st.quiz.answered) closeDiag();
    });
    repaint();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ---------------- 体检钩子（只读） ---------------- */
  window.YCPurge = {
    status: function () {
      return {
        left: st.left, wi: st.wi, ni: st.ni, ln: st.ln,
        verdict: st.reading ? st.reading.verdict : null,
        subtype: st.reading ? st.reading.subtype : null,
        greens: st.reading ? greens(st.reading) : 0,
        guards: st.reading ? st.reading.guards.length : 0,
        asked: st.asked, right: st.right,
        verify: st.verify ? { same: st.verify.same, verdict: st.verify.r.verdict } : null,
        over: st.over
      };
    },
    /* 直接设定参数（探针用，绕过工序消耗） */
    set: function (o) {
      if (o.wi != null) st.wi = o.wi;
      if (o.ni != null) st.ni = o.ni;
      if (o.ln != null) st.ln = o.ln;
      if (o.left != null) st.left = o.left;
      invalidate(); repaint();
    },
    run: function () { opRun(); },
    rep: function () { opRep(); },
    answer: function (i) { answerDiag(i); },
    rightAnswer: function () {
      if (!st.quiz) return -1;
      for (var i = 0; i < st.quiz.opts.length; i++) if (st.quiz.opts[i].ok) return i;
      return -1;
    },
    seal: function () { seal(); },
    score: function () { return score(); }
  };
})();

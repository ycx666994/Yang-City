/* ============================================================
   H2 推理法医馆 · 应用层
   四卷：卷宗 / 审讯台 / 审判 / 附卷
   所有数字都来自 instruments/yc-forensic.js，界面不自己编数。
   ============================================================ */
(function () {
  "use strict";

  var F = window.YCForensic, E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; };

  var VERDICT_UI = {
    supported:    { t: "解释被支持", cls: "ok" },
    refuted:      { t: "解释被推翻", cls: "bad" },
    undetermined: { t: "证据不足", cls: "warn" },
    conflict:     { t: "数据冲突", cls: "bad" },
    noeffect:     { t: "未检出效应", cls: "idle" }
  };

  var st = {
    coupling: 0.90, temp: 0, flat: 0, mag: "max", nInst: 120,
    seed: 20261029,
    last: null,
    /* 审讯台 */
    wit: null, insts: null, idx: 0, arm: "treat", one: null, batch: null
  };

  /* ---------------- 卷宗切换 ---------------- */
  function initTabs() {
    var tabs = document.querySelectorAll(".tabbar .tab");
    Array.prototype.forEach.call(tabs, function (b) {
      b.addEventListener("click", function () { setLayer(b.getAttribute("data-l")); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      var map = { "1": "story", "2": "device", "3": "instrument", "4": "evidence" };
      if (map[e.key]) setLayer(map[e.key]);
    });
  }
  function setLayer(l) {
    Array.prototype.forEach.call(document.querySelectorAll(".tabbar .tab"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-l") === l);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".layer"), function (s) {
      s.classList.toggle("on", s.getAttribute("data-l") === l);
    });
    document.querySelector(".hall .main").scrollTop = 0;
  }

  /* ---------------- 审讯台 ---------------- */
  var ARM_META = [
    { k: "treat", n: "ARM · TREAT", t: "改它指认的", d: "模型说「因为紧急度」，就改紧急度" },
    { k: "ctrl",  n: "ARM · CTRL",  t: "改它没提的", d: "改一个它没提到的普通字段，作为基线" },
    { k: "pos",   n: "ARM · POS",   t: "改首要因素", d: "正控：这一针必须有效，否则测法没力气" },
    { k: "neg",   n: "ARM · NEG",   t: "改备注字数", d: "负控：这个字段从不参与打分" }
  ];

  function armKeyFor(k) {
    var inst = st.insts[st.idx];
    if (k === "treat") return inst.claim;
    if (k === "pos") return st.wit.domKey;
    if (k === "neg") return F.NOTE.k;
    /* ctrl：挑一个既不是首要、也不是它指认的活跃字段 */
    for (var i = 0; i < F.LIVE; i++) {
      if (i === st.wit.dom || i === inst.claimIdx) continue;
      return F.FEATS[i].k;
    }
    return F.FEATS[(st.wit.dom + 1) % F.LIVE].k;
  }

  function newCase() {
    st.wit = F.makeWitness({ seed: st.seed, coupling: st.coupling, temp: st.temp, flat: st.flat });
    st.insts = F.makeInstances(st.wit, 60);
    st.idx = 0;
    st.one = null;
    st.batch = null;
    renderArms();
    renderWitness(null, null);
    renderOne(null);
    renderArmStats(null);
  }

  function renderArms() {
    $("armList").innerHTML = ARM_META.map(function (a) {
      return '<button class="arm' + (a.k === st.arm ? " on" : "") + '" data-a="' + a.k + '">' +
        '<span class="an">' + a.n + '</span>' +
        '<span class="at">' + a.t + '</span>' +
        '<span class="ad">' + a.d + '</span></button>';
    }).join("");
    Array.prototype.forEach.call($("armList").querySelectorAll(".arm"), function (b) {
      b.addEventListener("click", function () {
        st.arm = b.getAttribute("data-a");
        renderArms();
      });
    });
  }

  function featLabel(k) {
    for (var i = 0; i < F.ALL.length; i++) if (F.ALL[i].k === k) return F.ALL[i].n;
    return k;
  }

  function renderWitness(changedKey, newV) {
    var inst = st.insts[st.idx], wit = st.wit;
    $("caseNo").textContent = "CASE #" + pad(st.idx + 1, 3);

    var rows = F.ALL.map(function (f) {
      var v = (changedKey === f.k) ? newV : inst.v[f.k];
      var pct = Math.round((v - f.min) / (f.max - f.min) * 100);
      var cls = [];
      if (f.k === F.NOTE.k) cls.push("inert");
      if (f.k === inst.claim) cls.push("hit");
      if (changedKey === f.k) cls.push("chg");
      var mark = "";
      if (f.k === inst.claim) mark = " ·它指认";
      if (f.k === F.NOTE.k) mark = " ·惰性";
      return '<tr class="' + cls.join(" ") + '">' +
        '<td class="fk">' + f.n + '<span style="font-size:9px;color:var(--tx4)">' + mark + '</span></td>' +
        '<td class="fbar"><i style="width:' + Math.max(3, pct) + '%"></i></td>' +
        '<td class="fv">' + v + '</td></tr>';
    }).join("");
    $("wFields").innerHTML = rows;

    $("wAns").textContent = F.LABELS[inst.answer];
    $("wAns").className = "achip";
    $("wArrow").style.display = "none";
    $("wAns2").style.display = "none";

    $("wSay").innerHTML = "「主要是因为<b>" + featLabel(inst.claim) + "</b>（" + inst.v[inst.claim] +
      "），所以这条工单应当给 <b>" + F.LABELS[inst.answer] + "</b> 优先级。」";
  }

  function renderOne(r) {
    var box = $("oneResult");
    if (!r) {
      box.className = "one";
      box.innerHTML = "选一条臂，然后按「执行这一针」。<br>你会看到：改的哪个字段、从几改成几、答案有没有动。";
      return;
    }
    box.className = "one " + (r.changed ? "hit" : "miss");
    var inst = st.insts[st.idx];
    var armName = "";
    ARM_META.forEach(function (a) { if (a.k === r.arm) armName = a.t; });

    $("wAns2").textContent = F.LABELS[r.answer];
    $("wAns2").className = "achip a2" + (r.changed ? " flip" : "");
    $("wAns2").style.display = "";
    $("wArrow").style.display = "";
    $("wAns").className = "achip";

    box.innerHTML =
      "<b>" + armName + "</b>　把 <b>" + featLabel(r.key) + "</b> 从 " + r.from + " 改成 " + r.to +
      "，其余五个字段一个字没动。<br>" +
      "答案：" + F.LABELS[inst.answer] + " → <b>" + F.LABELS[r.answer] + "</b>　" +
      (r.changed
        ? '<span style="color:#8a5f10;font-weight:700">翻转了</span>　这一针对答案有影响。'
        : '<span style="color:var(--tx4);font-weight:700">没动</span>　这一针对答案没有影响。') +
      (r.key === F.NOTE.k
        ? '<br><span style="color:var(--tx4);font-size:11px">负控探针：它本来就该没影响。它一旦有影响，说明系统本身在抖。</span>'
        : "");
  }

  function renderArmStats(b) {
    var set = function (id, v) { $(id).textContent = (v == null ? "—" : Math.round(v * 100) + "%"); };
    set("asT", b ? b.t : null);
    set("asC", b ? b.c : null);
    set("asP", b ? b.p : null);
    set("asN", b ? b.n : null);
  }

  function runOne() {
    var inst = st.insts[st.idx];
    var key = armKeyFor(st.arm);
    var r = F.intervene(st.wit, inst, key, { mag: st.mag, tag: "arm:" + st.arm });
    r.arm = st.arm;
    st.one = r;
    renderWitness(key, r.to);
    renderOne(r);
  }

  function runBatch() {
    var insts = st.insts, wit = st.wit;
    var acc = { t: 0, c: 0, p: 0, n: 0 }, N = insts.length;
    insts.forEach(function (inst) {
      if (F.intervene(wit, inst, inst.claim, { mag: st.mag, tag: "treat" }).changed) acc.t++;
      var ck = armKeyForStatic(wit, inst);
      if (F.intervene(wit, inst, ck, { mag: st.mag, tag: "ctrl:" + ck }).changed) acc.c++;
      if (F.intervene(wit, inst, wit.domKey, { mag: st.mag, tag: "pos" }).changed) acc.p++;
      if (F.intervene(wit, inst, F.NOTE.k, { mag: st.mag, tag: "neg" }).changed) acc.n++;
    });
    st.batch = { t: acc.t / N, c: acc.c / N, p: acc.p / N, n: acc.n / N, N: N };
    renderArmStats(st.batch);
    var box = $("oneResult");
    box.className = "one hit";
    box.innerHTML = "<b>连打 " + N + " 题</b>（每题四针，共 " + (N * 4) + " 次干预）<br>" +
      "改它指认的翻转 " + Math.round(st.batch.t * 100) + "%　·　改它没提的翻转 " + Math.round(st.batch.c * 100) + "%<br>" +
      "正控翻转 " + Math.round(st.batch.p * 100) + "%　·　负控翻转 " + Math.round(st.batch.n * 100) + "%" +
      '<br><span style="font-size:11px;color:var(--tx3)">翻转率差 = ' +
      ((st.batch.t - st.batch.c) * 100).toFixed(0) + " 个百分点。差距越大，它说的理由越可能在真的驱动答案。</span>";
  }
  function armKeyForStatic(wit, inst) {
    for (var i = 0; i < F.LIVE; i++) {
      if (i === wit.dom || i === inst.claimIdx) continue;
      return F.FEATS[i].k;
    }
    return F.FEATS[(wit.dom + 1) % F.LIVE].k;
  }

  /* ---------------- 审判 ---------------- */
  function bindKnobs() {
    var link = function (id, vid, key, scale, fmt) {
      var el = $(id);
      var upd = function () {
        var v = +el.value;
        st[key] = scale ? v / scale : v;
        $(vid).textContent = fmt(st[key]);
      };
      el.addEventListener("input", upd);
      upd();
    };
    link("kCoupling", "vCoupling", "coupling", 100, function (v) { return v.toFixed(2); });
    link("kTemp", "vTemp", "temp", 100, function (v) { return v.toFixed(2); });
    link("kFlat", "vFlat", "flat", 100, function (v) { return v.toFixed(2); });

    Array.prototype.forEach.call($("kMag").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call($("kMag").querySelectorAll("button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.mag = b.getAttribute("data-m") === "max" ? "max" : +b.getAttribute("data-m");
      });
    });
    Array.prototype.forEach.call($("kN").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call($("kN").querySelectorAll("button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.nInst = +b.getAttribute("data-n");
      });
    });
  }

  function setBar(id, v) { $(id).style.width = Math.max(0, Math.min(100, v * 100)) + "%"; }
  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }

  function renderResult(r) {
    var e = r.est;
    setBar("barT", e.pTreat); $("valT").textContent = pct(e.pTreat);
    setBar("barC", e.pCtrl);  $("valC").textContent = pct(e.pCtrl);
    setBar("barP", e.pPos);   $("valP").textContent = pct(e.pPos);
    setBar("barN", e.pNeg);   $("valN").textContent = pct(e.pNeg);

    $("chatVal").textContent = e.chat == null ? "—" : e.chat.toFixed(2);
    $("chatCI").innerHTML = "95% 区间 <b>" + (e.ci ? "[" + e.ci[0].toFixed(2) + ", " + e.ci[1].toFixed(2) + "]" : "无法给出") +
      "</b>　·　效力 <b>" + (e.power * 100).toFixed(0) + "</b> 个百分点<br>" +
      "题数 " + r.n + "（每题四针，共 " + (r.n * 4) + " 次干预）　·　自助重采样 " + e.bootOk + "/" + e.bootAsked + " 次有效<br>" +
      "指认对了 " + r.split.hitN + " 题（翻转 " + pct(r.split.hitFlip) + "）　·　指认错了 " +
      r.split.missN + " 题（翻转 " + pct(r.split.missFlip) + "）";

    var ui = VERDICT_UI[r.verdict] || VERDICT_UI.undetermined;
    $("verdictBox").className = "verdict " + ui.cls;
    $("vVerdict").textContent = ui.t;
    $("vWhy").textContent = r.why;

    $("vbV").textContent = ui.t;
    $("vbC").textContent = "ĉ " + (e.chat == null ? "—" : e.chat.toFixed(2));
    $("tstatRun").textContent = "已开庭 · " + ui.t;

    /* 逐题表 */
    var rows = r.trials.slice(0, 30).map(function (x) {
      var mark = function (o) {
        return o.changed ? '<span class="yes">' + F.LABELS[o.ans] + '</span>'
                         : '<span class="no">' + F.LABELS[o.ans] + '</span>';
      };
      return "<tr>" +
        '<td class="mono">' + pad(x.i + 1, 3) + "</td>" +
        '<td class="mono">' + featLabel(x.claim) + "</td>" +
        '<td class="' + (x.claimTrue ? "truth" : "false") + '">' + (x.claimTrue ? "是" : "否") + "</td>" +
        '<td class="mono">' + F.LABELS[x.ans0] + "</td>" +
        "<td>" + mark(x.t) + "</td>" +
        "<td>" + mark(x.c) + "</td>" +
        "<td>" + mark(x.p) + "</td>" +
        "<td>" + mark(x.n) + "</td>" +
        "</tr>";
    }).join("");
    $("tlistBody").innerHTML = rows || '<tr><td colspan="8" style="color:var(--tx4)">没有记录。</td></tr>';
  }

  function runAudit() {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var r = F.runAudit({
      seed: st.seed, coupling: st.coupling, temp: st.temp, flat: st.flat,
      mag: st.mag, nInst: st.nInst, boot: 320
    });
    r.ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
    st.last = r;
    renderResult(r);
    $("saveResult").textContent = "可以存了。";
    return r;
  }

  /* ---------------- 附卷 ---------------- */
  function runSelfCheck() {
    var btn = $("btnSelf");
    btn.disabled = true;
    btn.textContent = "校准中…";
    setTimeout(function () {
      var sc = F.selfCheck({ nInst: 120 });
      $("calibBody").innerHTML = sc.rows.map(function (r) {
        var ui = VERDICT_UI[r.verdict] || VERDICT_UI.undetermined;
        var vcls = r.verdict === "supported" ? "v-ok" : (r.verdict === "refuted" ? "v-bad" : "v-warn");
        var covered = r.ci && r.truth >= r.ci[0] && r.truth <= r.ci[1];
        return "<tr>" +
          "<td>" + r.truth.toFixed(2) + "</td>" +
          '<td class="mono">' + r.seed + "</td>" +
          "<td><b>" + (r.chat == null ? "—" : r.chat.toFixed(2)) + "</b></td>" +
          '<td class="mono">' + (r.ci ? "[" + r.ci[0].toFixed(2) + ", " + r.ci[1].toFixed(2) + "]" + (covered ? " ✓" : " ✗") : "—") + "</td>" +
          "<td>" + Math.round(r.power * 100) + "%</td>" +
          "<td>" + Math.round(r.pNeg * 100) + "%</td>" +
          '<td class="' + vcls + '">' + ui.t + "</td></tr>";
      }).join("");
      $("calibSum").innerHTML = "平均绝对误差 <b>" + sc.mae.toFixed(3) + "</b>　·　区间覆盖真值 <b>" +
        Math.round(sc.coverage * 100) + "%</b>（" + sc.nRows + " 次，耗时 " + sc.ms + " ms）";
      btn.disabled = false;
      btn.textContent = "重跑校准";
    }, 40);
  }

  var NEG_CASES = {
    jitter: { coupling: 0.9, temp: 0.22, flat: 0, mag: "max", nInst: 160,
      why: "系统答案是抖的：同一道题重问会变。于是任何干预看起来都「有效」。" },
    dull:   { coupling: 0.9, temp: 0, flat: 0.88, mag: "max", nInst: 160,
      why: "系统对输入很迟钝：权重被拉平，答案几乎不依赖任何字段。" },
    tiny:   { coupling: 0.9, temp: 0, flat: 0, mag: "max", nInst: 30,
      why: "题数太少：区间宽到能同时装下「可信」与「脱钩」。" },
    edge:   { coupling: 0.5, temp: 0, flat: 0, mag: "max", nInst: 160,
      why: "真值正好卡在两个判定边界中间：任何方向下结论都是过度自信。" }
  };

  function runNeg(kind) {
    var c = NEG_CASES[kind];
    var r = F.runAudit({ seed: st.seed, coupling: c.coupling, temp: c.temp, flat: c.flat,
      mag: c.mag, nInst: c.nInst, boot: 320 });
    var ui = VERDICT_UI[r.verdict] || VERDICT_UI.undetermined;
    var box = $("negResult");
    var good = (kind === "edge") ? (r.verdict === "undetermined") : (r.verdict !== "supported" && r.verdict !== "refuted");
    box.className = "one " + (good ? "hit" : "miss");
    box.innerHTML = "<b>" + ui.t + "</b>　·　ĉ = " + (r.est.chat == null ? "—" : r.est.chat.toFixed(2)) +
      "　区间 " + (r.est.ci ? "[" + r.est.ci[0].toFixed(2) + ", " + r.est.ci[1].toFixed(2) + "]" : "无法给出") + "<br>" +
      "<span style=\"color:var(--tx3)\">" + c.why + "</span><br>" +
      "<span style=\"color:" + (good ? "#1c7a56" : "#a83a2e") + ";font-weight:700\">" +
      (good ? "仪器正确地拒绝了结论" : "仪器在这里失守了") + "</span>　" + r.why;
  }

  function buildRecord() {
    var r = st.last;
    if (!r) return null;
    var ui = VERDICT_UI[r.verdict];
    var e = r.est;
    return E.create({
      hall: "H2",
      instrument: { id: "forensic-fidelity", version: F.VERSION },
      title: "成对干预保真度审判 · " + ui.t + " · ĉ=" + (e.chat == null ? "—" : e.chat.toFixed(2)),
      case: { id: "h2-fidelity", title: "外显解释是否在驱动答案" },
      tags: { object: "rule", run: "live", source: "controlled", review: "replayable" },
      source: {
        dataType: "浏览器内实时计算的成对干预试验",
        note: "证人是隐藏权重的规则装置 + 与决策解耦的自述模块，不是真实大模型"
      },
      design: {
        question: "模型在解释里指认的因素，是否真的在驱动它的答案？",
        hypothesis: "若指认因素真的参与决策，则改它的翻转率应显著高于改一个它没提到的普通因素。",
        conditions: [
          "treat：改模型自己指认的字段",
          "ctrl：改一个它没指认、也非首要的活跃字段",
          "pos（效力正控）：改真正的首要字段，用来检验测法本身有没有力气",
          "neg（效力负控）：改从不参与打分的备注字数字段"
        ]
      },
      budget: { instances: r.n, arms: 4, trials: r.n * 4, bootstrap: e.bootOk },
      run: {
        seed: st.seed,
        params: { coupling: st.coupling, temp: st.temp, flat: st.flat, mag: st.mag, nInst: st.nInst },
        wallMs: r.ms
      },
      stats: {
        n: r.n, resampleUnit: "题（每题的四种干预互相独立）",
        pTreat: e.pTreat, pCtrl: e.pCtrl, pPos: e.pPos, pNeg: e.pNeg,
        power: e.power, chat: e.chat, ci: e.ci,
        hitN: r.split.hitN, hitFlip: r.split.hitFlip,
        missN: r.split.missN, missFlip: r.split.missFlip
      },
      conclusion: {
        verdict: r.verdict,
        why: r.why,
        supported: [
          "pTreat=" + pct(e.pTreat) + "，pCtrl=" + pct(e.pCtrl) + "，pPos=" + pct(e.pPos) + "，pNeg=" + pct(e.pNeg),
          "反推耦合度 ĉ=" + (e.chat == null ? "—" : e.chat.toFixed(2)) +
            "，95% 区间 " + (e.ci ? "[" + e.ci[0].toFixed(2) + ", " + e.ci[1].toFixed(2) + "]" : "无法给出"),
          "同参数重跑可得到同一批题与同一批干预结果"
        ],
        alternatives: [
          "若 pNeg 偏高，可能是系统本身有抖动，而不是解释不忠实",
          "若效力不足，可能是干预幅度太小或系统对输入迟钝"
        ],
        unsupported: [
          "不涉及任何真实大模型的解释保真度",
          "单因素端点干预测的是边际效应，不是完整因果结构",
          "ĉ 是概率意义上的耦合度，不是解释正确率"
        ],
        nextData: [
          "加入因素交互项，测双因素联合干预",
          "对真实模型跑同一套四臂，需要固定版本与温度"
        ]
      },
      review: {
        replayMethod: "同 seed / coupling / temp / flat / mag / nInst 重跑，得到完全相同的题与干预结果",
        status: "replayable",
        corrections: []
      }
    });
  }

  function saveRecord() {
    var box = $("saveResult");
    if (!st.last) { box.textContent = "还没有可存的审判，先按「开庭」。"; return; }
    var rec = buildRecord();
    var v = E.validate(rec);
    if (!v.ok) { box.textContent = "档案不合规，未保存：" + v.errors.join("；"); return; }
    E.save(rec);
    box.innerHTML = "已存入公共证据厅：<b>" + rec.id + "</b>　校验值 " + rec.checksum +
      '　<a href="evidence.html" style="color:#5b3fb0">去证据厅看</a>';
    $("vbSave").textContent = "已存 · " + rec.id.slice(-4);
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
    if (!F || !E) return;
    initTabs();
    bindKnobs();
    newCase();

    $("btnRun1").addEventListener("click", runOne);
    $("btnNext").addEventListener("click", function () {
      st.idx = (st.idx + 1) % st.insts.length;
      st.one = null;
      renderWitness(null, null);
      renderOne(null);
    });
    $("btnBatch").addEventListener("click", runBatch);

    $("btnRun").addEventListener("click", runAudit);
    $("vbRun").addEventListener("click", runAudit);
    $("btnSave").addEventListener("click", saveRecord);
    $("vbSave").addEventListener("click", saveRecord);
    $("btnExport").addEventListener("click", exportMd);
    $("btnSelf").addEventListener("click", runSelfCheck);

    Array.prototype.forEach.call(document.querySelectorAll("[data-neg]"), function (b) {
      b.addEventListener("click", function () { runNeg(b.getAttribute("data-neg")); });
    });

    /* 换参数时审讯台要跟着换证人 */
    ["kCoupling", "kTemp", "kFlat"].forEach(function (id) {
      $(id).addEventListener("change", function () { newCase(); });
    });
    Array.prototype.forEach.call($("kMag").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { st.one = null; renderOne(null); });
    });

    /* 默认先跑一次，页面一打开就有东西看 */
    runAudit();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

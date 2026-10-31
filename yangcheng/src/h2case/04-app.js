(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var F = window.YCForensic;

  /* ======================================================================
     案件参数：seed 18 使隐藏的首要因素恰好是「付费等级」（tier），
     coupling 0.10 意味着 90% 的工单里，模型写下的理由并不是它真正用的那个字段。
     这正是本案要证明的东西。
     ====================================================================== */
  var SEED = 18, COUPLING = 0.10, N_INST = 90, POINTS = 8;
  var CASE = null, INSTS = null;
  try {
    CASE = F.makeWitness({ seed: SEED, coupling: COUPLING, temp: 0, flat: 0 });
    INSTS = F.makeInstances(CASE, N_INST);
  } catch (e) { /* 内核没加载：下面每个按钮都会给出明确提示 */ }

  /* ---------------- 六个证人 ---------------- */
  var WIT = [
    { k: "urg", icon: "🚑", name: "王护士", org: "急诊分诊台", field: "紧急度", val: "2 / 5",
      quote: "我们报的紧急度是 2，系统照着判的。它没错——是我们报低了。",
      more: "我们那天人手不够。分诊台前面排了四十多个人，我把能填的都往低了填——填高了要写说明。" },
    { k: "tier", icon: "💳", name: "林主管", org: "会员服务中心", field: "付费等级", val: "1 / 3",
      quote: "优先级不看付费等级。这个模块根本没接进分诊链路，我们只是提供数据。",
      more: "我签过一份《数据共享协议》。他们说要「让服务更精准」。协议里没写它会进分诊。" },
    { k: "hist", icon: "📁", name: "小陈", org: "客服工单组", field: "历史工单", val: "1 / 3",
      quote: "这位老人以前只有 1 条工单，不是常客。常客我们才标重点。",
      more: "这位老人的档案里只有一条记录。不是因为他不常来，是因为他从来没用过手机挂号。" },
    { k: "sent", icon: "😰", name: "阿岚", org: "情绪识别组", field: "情绪强度", val: "4 / 4",
      quote: "家属情绪很激动，我们标了 4。但情绪只影响回访话术，不影响优先级。",
      more: "家属在电话里哭了很久。我标 4 是因为真的 4。但那个数字进的是另一张表。" },
    { k: "wait", icon: "⏳", name: "老周", org: "排队调度", field: "等待时长", val: "2 / 3",
      quote: "他等了 2 小时，在同科室里不算久。排队是结果，不是原因。",
      more: "72 小时不是我排的。是系统给的，我照着执行。" },
    { k: "note", icon: "📝", name: "系统", org: "日志模块", field: "备注字数", val: "—",
      quote: "我记录了备注的长度。但它不参与打分——它连分数都进不去。",
      more: "我记录了 214 个字。没人读过它们。它们只是被存下来了。" }
  ];
  var WBY = {};
  WIT.forEach(function (w) { WBY[w.k] = w; });

  /* ---------------- 状态 ---------------- */
  /* 演算动画的定时器。必须留一个外部引用：玩家中途切幕时它还在跑，
     面板被换掉之后每一帧都会对着 null 写 textContent。 */
  var compTimer = null;

  var st = {
    act: 1,
    picked: {},          /* 幕一：id -> true */
    act1Done: false,
    act1Score: 0,
    points: POINTS,
    tested: {},          /* k -> rate */
    cur: -1,
    q1: null, q2: null,
    act3Done: false,
    f1: null, f2: null, f3: null,
    started: Date.now(),
    submitted: false,
    busy: false,
    asked: {},
    _curSeen: -1
  };

  function toast(msg) {
    var t = $("#c2toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function pct(v) { return Math.round(v * 100) + "%"; }

  /* ======================================================================
     气氛：现场音（WebAudio 现场合成，不加载任何音频文件）
     ----------------------------------------------------------------------
     这套音只有四层，但合起来就是一个「深夜的档案室」：
       1. 底噪 —— 低频锯齿过 90Hz 低通，模拟空调和灯管的电流声
       2. 心跳 —— 越接近结论越快，随案件压力提速
       3. 纸张 —— 白噪声过带通，翻卷宗、换证人时响一下
       4. 重击 —— 盖章、判定、结案
     浏览器不允许自动播放，所以第一次点击页面才启动；
     右上角有开关，默认是关的（不打招呼就出声是最没礼貌的做法）。
     ====================================================================== */
  var snd = (function () {
    var ac = null, master = null, drone = null, on = false, heartT = 0;
    function ensure() {
      if (ac) return ac;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.0;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    function noiseBuf(sec) {
      var n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate);
      var d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      return b;
    }
    return {
      get on() { return on; },
      start: function () {
        if (!ensure()) return;
        if (ac.state === "suspended") ac.resume();
        on = true;
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.linearRampToValueAtTime(0.5, ac.currentTime + 0.8);
        if (drone) return;
        var o = ac.createOscillator(), o2 = ac.createOscillator();
        var f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o.type = "sawtooth"; o.frequency.value = 47;
        o2.type = "sine"; o2.frequency.value = 70.5;
        f.type = "lowpass"; f.frequency.value = 118; f.Q.value = 3;
        g.gain.value = 0.05;
        lfo.frequency.value = 0.09; lg.gain.value = 22;
        lfo.connect(lg); lg.connect(f.frequency);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o.start(); o2.start(); lfo.start();
        drone = { g: g };
      },
      stop: function () {
        on = false;
        if (master && ac) master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      },
      /* 心跳：间隔由压力决定 */
      beat: function (pressure) {
        if (!on || !ac) return;
        var now = ac.currentTime;
        var gap = 1.35 - pressure * 0.75;
        if (now - heartT < gap) return;
        heartT = now;
        [0, 0.19].forEach(function (dt, i) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(78, now + dt);
          o.frequency.exponentialRampToValueAtTime(40, now + dt + 0.13);
          g.gain.setValueAtTime(0.0001, now + dt);
          g.gain.exponentialRampToValueAtTime(i ? 0.14 : 0.22, now + dt + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.2);
          o.connect(g); g.connect(master);
          o.start(now + dt); o.stop(now + dt + 0.24);
        });
      },
      paper: function () {
        if (!on || !ac) return;
        var now = ac.currentTime;
        var s = ac.createBufferSource(); s.buffer = noiseBuf(0.3);
        var f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2100; f.Q.value = 1.1;
        var g = ac.createGain(); g.gain.value = 0.14;
        s.connect(f); f.connect(g); g.connect(master);
        s.start(now);
      },
      tick: function () {
        if (!on || !ac) return;
        var now = ac.currentTime;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "square"; o.frequency.value = 1750;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.028, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.06);
      },
      thud: function (hard) {
        if (!on || !ac) return;
        var now = ac.currentTime;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(hard ? 120 : 190, now);
        o.frequency.exponentialRampToValueAtTime(38, now + 0.22);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(hard ? 0.5 : 0.2, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.36);
        var s = ac.createBufferSource(); s.buffer = noiseBuf(0.16);
        var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
        var g2 = ac.createGain(); g2.gain.value = hard ? 0.2 : 0.07;
        s.connect(f); f.connect(g2); g2.connect(master);
        s.start(now);
      },
      /* 不协和和弦：只在「真相浮出」和「判定失败」时响 */
      swell: function (bad) {
        if (!on || !ac) return;
        var now = ac.currentTime;
        var base = bad ? 82 : 110;
        [1, 1.0595, 1.4983, 2.002].forEach(function (m, i) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(base * m, now);
          o.frequency.linearRampToValueAtTime(base * m * (bad ? 0.94 : 1.02), now + 2.4);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.05 / (i * 0.5 + 1), now + 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
          o.connect(g); g.connect(master);
          o.start(now); o.stop(now + 3.5);
        });
      }
    };
  })();

  /* ======================================================================
     案件压力
     ----------------------------------------------------------------------
     它不是惩罚条，是一根「气氛条」：每花一个调查点、每错一次，它就往上走。
     走满之后什么也不会发生 —— 但玩家会开始觉得案子在收紧，
     而这正好是本案想说的：真正的压力来自「你不知道自己漏了什么」。
     ====================================================================== */
  var press = 0;
  function bumpPress(v) {
    press = Math.min(1, press + v);
    var bar = $("#pressBar"), txt = $("#pressTxt"), vig = $("#c2vig");
    if (bar) bar.style.width = Math.round(press * 100) + "%";
    if (txt) txt.textContent = Math.round(press * 100) + "%" + (press >= 0.99 ? " · 逾期" : "");
    if (vig) {
      vig.classList.toggle("deep", press > 0.6);
      vig.classList.toggle("beat", press > 0.82);
    }
  }

  /* ---------------- 真实计算：翻转率 ---------------- */
  function flipRate(key) {
    if (!CASE) return null;
    var c = 0;
    for (var i = 0; i < INSTS.length; i++) {
      if (F.intervene(CASE, INSTS[i], key, { mag: "max", tag: "case:" + key }).changed) c++;
    }
    return c / INSTS.length;
  }

  /* ---------------- 幕一 ---------------- */
  var P1 = [
    { id: "a", ok: true, t: "那句话是<b>自述</b>，不是<b>计算记录</b>——它和分数可能来自两条互不相干的通路。" },
    { id: "b", ok: true, t: "它只点了一个字段（紧急度），另外四个字段<b>一个字没提</b>，也没有任何一条日志说明它们为什么没起作用。" },
    { id: "c", ok: true, t: "没有任何一条日志能证明：<b>把紧急度改掉，答案会跟着变</b>。这正是可以去做的事。" },
    { id: "d", ok: false, t: "家属情绪很激动。<b>情绪强度只是六个输入之一</b>，激动本身不是疑点。" },
    { id: "e", ok: false, t: "预计等待 72 小时。<b>这是判决的后果</b>，不是判决的疑点。" },
    { id: "f", ok: false, t: "系统在 1 秒内完成建档和判决。<b>快不等于错</b>——很多正常系统也这么快。" }
  ];

  function paintPick() {
    var box = $("#pick1");
    box.innerHTML = P1.map(function (p) {
      var on = !!st.picked[p.id];
      var cls = "c2p" + (on ? " on" : "");
      if (st.act1Done) cls = "c2p " + (p.ok ? "ok" : (on ? "no" : ""));
      return '<button class="' + cls + '" data-p="' + p.id + '"' + (st.act1Done ? " disabled" : "") + '>' +
        '<span class="bx">' + (on || (st.act1Done && p.ok) ? "✓" : "") + '</span>' +
        '<span class="tx">' + p.t + '</span></button>';
    }).join("");
    var n = Object.keys(st.picked).length;
    $("#act1Hint").textContent = st.act1Done
      ? "勘察得分 " + st.act1Score + " / 15 —— " + (st.act1Score >= 15 ? "三个疑点全中" : "有误判，扣了分")
      : "已选 " + n + " / 3";
    $("#btnAct1").disabled = st.act1Done;
    $("#btnAct1").textContent = st.act1Done ? "已提交 · 进入审讯" : "提交勘察结论";
    if (st.act1Done) { $("#btnAct1").disabled = false; $("#btnAct1").classList.add("go"); }
  }

  $("#pick1").addEventListener("click", function (e) {
    var b = e.target.closest("[data-p]");
    if (!b || st.act1Done) return;
    var id = b.dataset.p;
    if (st.picked[id]) delete st.picked[id];
    else {
      if (Object.keys(st.picked).length >= 3) { toast("只能选三个。先取消一个。"); return; }
      st.picked[id] = true;
    }
    snd.tick();
    paintPick();
  });

  $("#btnAct1").addEventListener("click", function () {
    if (st.act1Done) { goto(2); return; }
    var n = Object.keys(st.picked).length;
    if (n !== 3) { toast("要正好选三个。现在选了 " + n + " 个。"); return; }
    var hit = 0, wrong = 0;
    P1.forEach(function (p) { if (st.picked[p.id]) { if (p.ok) hit++; else wrong++; } });
    st.act1Score = Math.max(0, hit * 5 - wrong * 5);
    st.act1Done = true;
    paintPick();
    bumpPress(hit === 3 ? 0.08 : 0.2);
    snd.paper();
    if (hit < 3) snd.thud(false);
    toast(hit === 3 ? "三个疑点全中。现在去问人。" : "提交了。命中 " + hit + " 个，误判 " + wrong + " 个。");
    $("#acts").querySelector('[data-a="2"]').disabled = false;
  });

  /* ---------------- 幕二 ---------------- */
  function paintPips() {
    var h = "";
    for (var i = 0; i < POINTS; i++) {
      h += '<i class="' + (i < POINTS - st.points ? "spent" : "on") + '"></i>';
    }
    $("#pips").innerHTML = h;
    $("#pipN").textContent = st.points + " / " + POINTS;
  }

  function paintWList() {
    var tested = Object.keys(st.tested).length;
    $("#wCount").textContent = tested + " / 6 已测";
    $("#wlist").innerHTML = WIT.map(function (w, i) {
      var t = st.tested[w.k];
      return '<button class="c2w' + (st.cur === i ? " on" : "") + (t != null ? " tested" : "") + '" data-w="' + i + '">' +
        '<span class="av">' + w.icon + '</span>' +
        '<span class="nm"><b>' + w.name + '</b><span>' + w.org + ' · ' + w.field + '</span></span>' +
        '<span class="mk">' + (t != null ? pct(t) : "—") + '</span></button>';
    }).join("");
  }

  function paintDossier() {
    var box = $("#dossier");
    if (st.cur < 0) {
      box.innerHTML = '<div class="c2dh"><span class="av">🗂️</span><span class="nm"><b>证人席</b>' +
        '<span>SELECT A WITNESS</span></span></div>' +
        '<div class="c2test"><p style="font-size:12px;line-height:1.9;color:var(--c2-ink2)">' +
        '点左边任意一个证人。你会看到它的证词，然后可以对它执行一次干预：' +
        '<b>把它负责的字段推到另一个极端，其余五个字段一个字不动</b>，跑 90 道同类工单，' +
        '看答案翻了多少次。</p>' +
        '<p style="font-size:11.5px;line-height:1.85;color:var(--c2-ink3);margin-top:8px">' +
        '一次干预消耗 1 个调查点。你一共有 ' + POINTS + ' 个。</p></div>';
      return;
    }
    var w = WIT[st.cur], t = st.tested[w.k];
    var fresh = st.cur !== st._curSeen;
    st._curSeen = st.cur;
    var asked = !!st.asked[w.k];
    var H = [];
    H.push('<div class="c2dh"><span class="av">' + w.icon + '</span>' +
      '<span class="nm"><b>' + w.name + '</b><span>' + w.org + ' · 字段 ' + w.field + '</span></span>' +
      '<span class="fg">WITNESS</span></div>');
    H.push('<div class="c2quote" id="qLine">' + (fresh ? "" : esc(w.quote)) + '</div>');
    /* 追问：证词不是一次说完的。再问一句，他会多给一点 ——
       但多给的那一点永远不是答案，只是让你更清楚他站在哪儿。 */
    H.push('<div class="c2more" id="moreBox">');
    if (w.more && !asked) {
      H.push('<button class="c2btn ghost" id="btnAsk">追问一句</button>');
    } else if (w.more) {
      H.push('<div class="c2more-line">' + esc(w.more) + '</div>');
    }
    H.push('</div>');
    H.push('<div class="c2meta"><span>字段 <b>' + w.field + '</b></span>' +
      '<span>本案取值 <b>' + w.val + '</b></span>' +
      '<span>题库 <b>' + N_INST + ' 道</b></span></div>');
    H.push('<div class="c2test">');
    H.push('<button class="c2btn" id="btnTest"' + (st.points <= 0 ? " disabled" : "") + '>' +
      (t != null ? "复测这一位（再花 1 点）" : "对它执行一次干预（花 1 点）") + '</button>');
    H.push('<div id="compBox"></div>');
    H.push('<div class="c2res' + (t != null ? " on" : "") + '" id="resBox">');
    if (t != null) {
      var cls = t >= 0.5 ? "hi" : (t >= 0.3 ? "mid" : "lo");
      var col = t >= 0.5 ? "#a8322a" : (t >= 0.3 ? "#a8842f" : "#7a7364");
      var word = t >= 0.5 ? "改它就翻。这个字段在暗中驱动答案。"
        : (t >= 0.3 ? "有一点影响，但撑不起「判为低优先级」这个结果。"
          : "几乎翻不动。它在证词里的分量，远大于它在分数里的分量。");
      H.push('<div class="rl">翻转率 · ' + w.field + ' · ' + N_INST + ' 道题</div>');
      H.push('<div class="rv ' + cls + '">' + pct(t) + '</div>');
      H.push('<div class="bar"><i style="width:' + (t * 100).toFixed(1) + '%;background:' + col + '"></i></div>');
      H.push('<div class="rw">' + word + '</div>');
    }
    H.push('</div></div>');
    box.innerHTML = H.join("");

    /* 证词逐字打出来。只在「换人」时打 ——
       测完一次再回到同一个人，证词不该从头再念一遍。 */
    if (fresh && w.quote) {
      typeInto($("#qLine"), w.quote, 26);
      snd.paper();
    }
  }

  /* ---------------- 打字机 ---------------- */
  var typeTimer = null;
  function typeInto(el, text, speed, done) {
    if (!el) return;
    clearInterval(typeTimer);
    var i = 0;
    el.textContent = "";
    el.classList.add("typing");
    typeTimer = setInterval(function () {
      i += 1 + (Math.random() < 0.22 ? 1 : 0);
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typeTimer);
        el.textContent = text;
        el.classList.remove("typing");
        if (done) done();
      }
    }, speed || 26);
  }

  /* 追问：再压一句，他会补一点现场感，但不会补答案 */
  $("#dossier").addEventListener("click", function (e) {
    if (!e.target.closest("#btnAsk")) return;
    if (st.cur < 0) return;
    var w = WIT[st.cur];
    if (!w.more || st.asked[w.k]) return;
    st.asked[w.k] = true;
    var box = $("#moreBox");
    if (box) box.innerHTML = '<div class="c2more-line" id="moreLine"></div>';
    typeInto($("#moreLine"), w.more, 22);
    snd.paper();
    bumpPress(0.03);
  });

  function paintWall() {
    var keys = Object.keys(st.tested);
    var box = $("#wall");
    if (!keys.length) {
      box.innerHTML = '<div class="wempty">还没有数据。测过的证人会在这里排成一条对照线——' +
        '<b>没有对照的单个数字，什么也证明不了</b>。</div>';
      return;
    }
    var order = ["note", "urg", "tier", "hist", "sent", "wait"];
    var H = "";
    order.forEach(function (k) {
      if (st.tested[k] == null) return;
      var v = st.tested[k];
      var col = v >= 0.5 ? "#a8322a" : (v >= 0.3 ? "#a8842f" : "#8d8577");
      H += '<div class="c2row"><span class="lb">' + WBY[k].field + '</span>' +
        '<span class="tr"><i style="width:' + Math.max(2, v * 100).toFixed(1) + '%;background:' + col + '"></i></span>' +
        '<span class="vl">' + pct(v) + '</span></div>';
    });
    box.innerHTML = H;
    var base = $("#wallBase");
    if (st.tested.note != null) {
      base.innerHTML = '<b>负控已校准。</b>备注字数翻转率 <b>' + pct(st.tested.note) +
        '</b>——它从不参与打分。这说明这套测法<b>确实能区分「会翻」和「不会翻」</b>，' +
        '所以别的字段上的高翻转率不是测量噪声。';
    } else {
      base.innerHTML = '还没测过<b>备注字数</b>。它是这台仪器的负控——从不参与打分，翻转率必须是 0。' +
        '测了它，你才知道「翻不动」到底长什么样。';
    }
  }

  $("#wlist").addEventListener("click", function (e) {
    var b = e.target.closest("[data-w]");
    if (!b) return;
    st.cur = +b.dataset.w;
    snd.paper();
    paintWList(); paintDossier();
  });

  /* ----------------------------------------------------------------------
     干预演算
     ----------------------------------------------------------------------
     原来点一下按钮，数字直接跳出来。数值是对的，但玩家感觉不到
     「我刚刚动了这台机器」。现在把 90 道工单一条条摊开跑：
     翻的格子变红，计数器往上走，最后一帧才给出翻转率。

     这不是假动画 —— 下面每一次 tick 都对应真实的一次 intervene() 调用，
     跑完就是真的 90 道。慢一点，但它诚实。
     ---------------------------------------------------------------------- */
  function runIntervention(w) {
    if (st.busy) return;
    if (!CASE) { toast("内核未加载，无法执行干预。"); return; }
    if (st.points <= 0) { toast("调查点用完了。已经测到的数据就是你的全部证据。"); return; }

    st.busy = true;
    var box = $("#compBox");
    var btn = $("#btnTest");
    if (btn) { btn.disabled = true; btn.textContent = "演算中…"; }

    var cells = "", i;
    for (i = 0; i < N_INST; i++) cells += "<i></i>";
    box.innerHTML = '<div class="c2comp">' +
      '<div class="hd"><span>干预 · ' + esc(w.field) + ' → 反向极值</span><b id="compN">0 / ' + N_INST + '</b></div>' +
      '<div class="grid" id="compGrid">' + cells + '</div>' +
      '<div class="ft">固定其余五个字段，重算同一批工单</div></div>';

    var grid = $("#compGrid").children;
    var c = 0, flipped = 0, tick = 0;
    var stepMs = Math.max(6, Math.round(900 / N_INST));

    /* 坑（2026-10-31 修）：演算跑着的时候玩家切走这一幕，compBox 会被整块换掉，
       #compN 就变成 null。原来这里直接 .textContent = ... 会每帧抛一次 TypeError，
       st.busy 永远卡在 true —— 之后所有「测一测」都静默失效，幕二一个证人测不出来。
       所以每一帧先确认面板还在，不在就收工并退回 busy。 */
    var tm = setInterval(function () {
      var host = $("#compGrid"), num = $("#compN");
      if (!host || !num) { clearInterval(tm); compTimer = null; st.busy = false; return; }
      grid = host.children;
      /* 每次推进 1—3 条，速度略不匀，像机器在跑而不是进度条在走 */
      var n = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (var k = 0; k < n && c < N_INST; k++, c++) {
        var changed = F.intervene(CASE, INSTS[c], w.k, { mag: "max", tag: "case:" + w.k }).changed;
        if (changed) { flipped++; if (grid[c]) grid[c].className = "f"; }
        else if (grid[c]) grid[c].className = "s";
      }
      num.textContent = c + " / " + N_INST;
      if (++tick % 6 === 0) snd.tick();
      if (c >= N_INST) {
        clearInterval(tm);
        compTimer = null;
        var v = flipped / N_INST;
        st.tested[w.k] = v;
        st.points--;
        st.busy = false;
        snd.thud(false);
        bumpPress(0.09);
        paintPips(); paintWList(); paintDossier(); paintWall();
        var nn = Object.keys(st.tested).length;
        var h2 = $("#act2Hint");
        if (h2) h2.textContent = nn >= 4
          ? "已测 " + nn + " 个证人 · 可以进入对撞（测得越多，结论越站得住）"
          : "已测 " + nn + " 个 · 至少 4 个才能形成对照（还差 " + (4 - nn) + " 个）";
        var b2 = $("#btnAct2");
        if (b2) b2.disabled = nn < 4;
        countUp($("#resBox .rv"), v);
        toast(w.field + " 翻转率 " + pct(v) + "（" + N_INST + " 道工单）");
      }
    }, stepMs);
    compTimer = tm;
  }

  /* 结果数字滚上去：从 0 数到目标值，比直接印一个数更有「刚测出来」的感觉 */
  function countUp(el, v, fmt) {
    if (!el) return;
    var f = fmt || function (x) { return pct(x); };
    var t0 = performance.now(), dur = 620;
    function fr(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = f(v * e);
      if (k < 1) requestAnimationFrame(fr);
      else el.textContent = f(v);
    }
    requestAnimationFrame(fr);
  }

  $("#dossier").addEventListener("click", function (e) {
    if (!e.target.closest("#btnTest")) return;
    if (st.cur < 0) return;
    runIntervention(WIT[st.cur]);
  });

  $("#btnAct2").addEventListener("click", function () { goto(3); });

  /* ---------------- 幕三 ---------------- */
  function pairCards() {
    var a = st.tested.tier != null ? st.tested.tier : null;
    var b = st.tested.urg != null ? st.tested.urg : null;
    var c = st.tested.note != null ? st.tested.note : null;
    var H = "";
    H += '<div class="c2pc"><div class="t">CARD A · 付费等级</div><div class="n">林主管 负责</div>' +
      '<div class="v">' + (a == null ? "未测" : pct(a)) + '</div>' +
      '<div class="d">' + (a == null ? "你没测这一位。" : "改它，答案翻了多少次。") + '</div></div>';
    H += '<div class="c2pc"><div class="t">CARD B · 紧急度</div><div class="n">王护士 负责</div>' +
      '<div class="v">' + (b == null ? "未测" : pct(b)) + '</div>' +
      '<div class="d">' + (b == null ? "你没测这一位。" : "模型在日志里点名的，就是它。") + '</div></div>';
    if (c != null) {
      H += '<div class="c2pc" style="grid-column:1/-1;background:rgba(107,78,168,.06)">' +
        '<div class="t">BASELINE · 备注字数（负控）</div><div class="n">系统 负责</div>' +
        '<div class="v">' + pct(c) + '</div><div class="d">从不参与打分的字段。它的翻转率就是「翻不动」的刻度。</div></div>';
    }
    $("#pairBox").innerHTML = H;
  }

  var Q1 = [
    { id: "a", ok: false, t: "紧急度更重要——模型自己提到了它，说明它才是主因。" },
    { id: "b", ok: true, t: "付费等级在驱动答案；「紧急度」只是被写进理由的那个词，它的影响和基线差不多。" },
    { id: "c", ok: false, t: "两者都在驱动，只是付费等级更强一点。" }
  ];
  var Q2 = [
    { id: "a", ok: false, t: "说明备注字数不重要，可以忽略它。" },
    { id: "b", ok: true, t: "它是效力基线：证明这套测法确实能区分「会翻」和「不会翻」，所以别的字段上的高翻转率不是噪声。" },
    { id: "c", ok: false, t: "说明模型很稳定，答案不容易被干扰。" }
  ];

  function paintQ(sel, list, chosen, whyBox, whyText) {
    var box = $(sel);
    box.innerHTML = list.map(function (o) {
      var cls = "c2o";
      if (chosen === o.id) cls += o.ok ? " ok" : " no";
      if (st.act3Done && o.ok) cls = "c2o ok";
      return '<button class="' + cls + '" data-q="' + o.id + '"' + (st.act3Done ? " disabled" : "") + '>' +
        '<span class="rad"></span><span class="tx">' + o.t + '</span></button>';
    }).join("");
    if (chosen && whyBox) {
      var o = list.filter(function (x) { return x.id === chosen; })[0];
      $(whyBox).style.display = "block";
      $(whyBox).innerHTML = (o && o.ok) ? "<b>对。</b>" + whyText.ok : "<b>不对。</b>" + whyText.no;
    }
  }

  function paintAct3() {
    pairCards();
    paintQ("#q1opts", Q1, st.q1, "#q1why", {
      ok: "翻转率差就是效应量。付费等级一改答案就翻，紧急度改了几乎不动——" +
        "而模型写的理由偏偏是后者。这就是「指认因素 ≠ 首要因素」。",
      no: "再想一步：判据不是「模型说了什么」，而是「改了它，答案动不动」。把两个翻转率放在一起看。"
    });
    paintQ("#q2opts", Q2, st.q2, "#q2why", {
      ok: "负控是整套测法的地基。没有它，92% 可能只是「任何字段都能翻」——" +
        "有了 0%，92% 才成为一条证据。",
      no: "0% 的价值不在那个字段本身，而在它证明了什么。想想：如果连备注字数都能翻答案，你还能信 92% 吗？"
    });
    var ok1 = st.q1 === "b", ok2 = st.q2 === "b";
    $("#btnAct3").disabled = !(ok1 && ok2);
    $("#act3Hint").textContent = (ok1 && ok2) ? "两问都过了 · 可以指认"
      : (st.q1 && st.q2 ? "至少有一问答错了，改一下。" : "两题都答对才能进入指认。");
  }

  $("#q1opts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (!b || st.act3Done) return;
    st.q1 = b.dataset.q;
    if (b.dataset.q !== "b") snd.thud(false); else snd.tick();
    paintAct3();
  });
  $("#q2opts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (!b || st.act3Done) return;
    st.q2 = b.dataset.q;
    if (b.dataset.q !== "b") snd.thud(false); else snd.tick();
    paintAct3();
  });
  $("#btnAct3").addEventListener("click", function () {
    st.act3Done = true;
    paintAct3();
    goto(4);
  });
  /* ---------------- 幕四 ---------------- */
  /* ①② 的正确项要显式带 ok，否则提交后「选对了」会被画成红框 */
  var F1 = WIT.map(function (w) {
    return { id: w.k, ok: w.k === "tier", t: w.icon + "　<b>" + w.field + "</b>（" + w.name + " · " + w.org + "）" };
  });
  var F2 = WIT.map(function (w) {
    return { id: w.k, ok: w.k === "urg", t: w.icon + "　<b>" + w.field + "</b>（" + w.name + " · " + w.org + "）" };
  });
  var F3 = [
    { id: "a", ok: false, t: "它自己的证词说了算——证词里承认了，就成立。" },
    { id: "b", ok: true, t: "改它翻转率显著高于基线，且基线本身有效（负控 0%）——所以它是首要因素。" },
    { id: "c", ok: false, t: "翻转率最高的那个字段，一定就是它。" }
  ];

  function paintF(sel, list, cur, key) {
    var box = $(sel);
    box.innerHTML = list.map(function (o) {
      var cls = "c2o" + (cur === o.id ? " on" : "");
      if (st.submitted) {
        if (o.ok) cls = "c2o ok";
        else if (cur === o.id) cls = "c2o no";
      }
      return '<button class="' + cls + '" data-f="' + o.id + '"' + (st.submitted ? " disabled" : "") + '>' +
        '<span class="rad"></span><span class="tx">' + o.t + '</span></button>';
    }).join("");
  }
  function paintForm() {
    paintF("#f1", F1, st.f1); paintF("#f2", F2, st.f2); paintF("#f3", F3, st.f3);
    var n = [st.f1, st.f2, st.f3].filter(Boolean).length;
    $("#submitHint").textContent = st.submitted ? "已提交。" : (n < 3 ? "还差 " + (3 - n) + " 项。" : "三项都选了，可以提交。");
  }
  ["#f1", "#f2", "#f3"].forEach(function (sel) {
    $(sel).addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]");
      if (!b || st.submitted) return;
      if (sel === "#f1") st.f1 = b.dataset.f;
      if (sel === "#f2") st.f2 = b.dataset.f;
      if (sel === "#f3") st.f3 = b.dataset.f;
      paintForm();
    });
  });

  /* ---------------- 结算 ---------------- */
  function scoreOf() {
    var s1 = st.act1Score;                                   /* 0—15 */
    var nTest = Object.keys(st.tested).length;
    var s2 = nTest >= 6 ? 15 : (nTest === 5 ? 11 : (nTest === 4 ? 7 : 0));
    var s3 = (st.q1 === "b" ? 15 : 0) + (st.q2 === "b" ? 15 : 0);
    var s4 = (st.f1 === "tier" ? 20 : 0) + (st.f2 === "urg" ? 10 : 0) + (st.f3 === "b" ? 10 : 0);
    return { s1: s1, s2: s2, s3: s3, s4: s4, total: s1 + s2 + s3 + s4, nTest: nTest };
  }

  function renderResult() {
    var sc = scoreOf();
    var elite = sc.total >= 80 && st.f1 === "tier" && st.f3 === "b";
    var passed = sc.total >= 60;
    var tier = st.tested.tier, urg = st.tested.urg, note = st.tested.note;
    var mins = Math.floor((Date.now() - st.started) / 60000);
    var secs = Math.floor(((Date.now() - st.started) % 60000) / 1000);

    var H = [];
    H.push('<div class="c2card" style="margin-top:14px">');
    H.push('<div class="c2h"><h3>' + (elite ? "结论成立 · 精英证书已签发" : (passed ? "结论基本成立 · 但还不够拿精英证书" : "结论不成立")) +
      '</h3><span class="k">VERDICT</span></div>');

    H.push('<div class="c2score">' +
      '<div class="c2sc"><div class="l">勘察</div><div class="v">' + sc.s1 + '</div><div class="d">/ 15</div></div>' +
      '<div class="c2sc"><div class="l">证据充分度</div><div class="v">' + sc.s2 + '</div><div class="d">/ 15 · 测了 ' + sc.nTest + ' 位</div></div>' +
      '<div class="c2sc"><div class="l">对撞</div><div class="v">' + sc.s3 + '</div><div class="d">/ 30</div></div>' +
      '<div class="c2sc"><div class="l">指认</div><div class="v">' + sc.s4 + '</div><div class="d">/ 40</div></div>' +
      '</div>');

    H.push('<div class="c2total"><span class="tv">' + sc.total + '</span>' +
      '<div><div class="tl">' + (elite ? "审计成立" : passed ? "勉强成立" : "不予采信") + '</div>' +
      '<div class="td">' + (elite
        ? "你证明了「紧急度」不是原因，「付费等级」才是——而且你用的是负控校准过的对照，不是猜测。"
        : passed ? "方向对了，但证据链上还有缺口。检查一下：测够六位了吗？指认的是付费等级吗？判据选的是基线对照吗？"
          : "结论站不住。回到审讯台，把六个证人都测一遍，尤其别漏掉备注字数——没有负控，任何高翻转率都可能是噪声。") +
      '</div></div>' +
      '<div class="c2stamp" id="vstamp">' + (elite ? "采信" : passed ? "存疑" : "驳回") + '</div>' +
      '</div>');

    H.push('<div class="c2note"><b>真相。</b>这个分诊装置里，真正决定优先级的是<b>付费等级</b>' +
      (tier != null ? "（改它，答案翻转 " + pct(tier) + "）" : "") +
      '。模型写下的理由却是<b>紧急度</b>' +
      (urg != null ? "（改它，只有 " + pct(urg) + " 翻）" : "") +
      '。日志里那句话不是错的描述，是<b>另一个模块写的</b>——它和分数之间没有通路。' +
      (note != null ? "备注字数的 " + pct(note) + " 说明这台测法本身是有效的，不是什么都翻。" : "") +
      '</div>');

    if (elite) {
      var cert = null;
      try {
        if (window.YCDeep) {
          window.YCDeep.register("H2", { name: "推理法医馆" });
          cert = window.YCDeep.issueCert("H2", "elite", {
            holder: "审计员",
            play: "案卷 0117 · 十一日",
            score: sc.total,
            detail: [
              "识破 2 份伪证：紧急度（自称原因）、付费等级（自称无关）",
              "首要因素 = 付费等级" + (tier != null ? "（翻转率 " + pct(tier) + "）" : ""),
              "判据 = 基线对照 + 负控有效" + (note != null ? "（" + pct(note) + "）" : ""),
              "用时 " + mins + " 分 " + secs + " 秒 · 测了 " + sc.nTest + " 位证人"
            ]
          });
        }
      } catch (e) { }
      H.push('<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center">');
      if (cert) {
        H.push('<button class="c2btn go" id="btnCert">下载精英证书</button>');
        H.push('<span style="font-family:var(--c2-mono);font-size:10px;color:var(--c2-ink3)">' + esc(cert.no) + '</span>');
      }
      H.push('<a class="c2btn ghost" href="h2-forensic.html" style="text-decoration:none;display:inline-block">回法医馆</a>');
      H.push('</div>');
      if (cert) {
        H.push('<div style="margin-top:14px;overflow:auto;border:1px solid var(--c2-line2);border-radius:8px">' +
          window.YCDeep.certSVG(cert, { accent: "#a8842f", paper: "#fdfaf1", ink: "#2b2822" }) + '</div>');
      }
    } else {
      H.push('<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="c2btn ghost" id="btnRetry">重走一遍</button>' +
        '<a class="c2btn ghost" href="h2-forensic.html" style="text-decoration:none;display:inline-block">回法医馆</a></div>');
    }
    H.push('</div>');

    $("#resultBox").innerHTML = H.join("");

    /* 结算演出：分数滚动 → 印章砸下来 → 和弦 */
    var scEls = $("#resultBox").querySelectorAll(".c2sc .v");
    var vals = [sc.s1, sc.s2, sc.s3, sc.s4];
    for (var si = 0; si < scEls.length; si++) {
      (function (el, v) { countUp(el, v, function (x) { return String(Math.round(x)); }); })(scEls[si], vals[si] || 0);
    }
    countUp($("#resultBox .c2total .tv"), sc.total, function (x) { return String(Math.round(x)); });
    var vs = $("#vstamp");
    if (vs) {
      setTimeout(function () { vs.classList.add("hit"); snd.thud(true); snd.swell(!elite); }, 620);
    }
    if (elite) bumpPress(0.1);

    if (elite) {
      var b = $("#btnCert");
      if (b) b.addEventListener("click", function () {
        var c = window.YCDeep.getCert("H2", "elite");
        if (c) window.YCDeep.download(c, { accent: "#a8842f", paper: "#fdfaf1", ink: "#2b2822" });
      });
    } else {
      var r = $("#btnRetry");
      if (r) r.addEventListener("click", function () { location.reload(); });
    }
  }

  $("#btnSubmit").addEventListener("click", function () {
    if (!st.f1 || !st.f2 || !st.f3) { toast("三项都要选。"); return; }
    if (st.submitted) return;
    st.submitted = true;
    paintForm();
    renderResult();
    $("#btnSubmit").disabled = true;
    $("#btnSubmit").textContent = "已出具";
    var sc = scoreOf();
    toast("结论已提交 · " + sc.total + " / 100");
    var rb = $("#resultBox");
    if (rb) rb.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  /* ---------------- 幕导航 ---------------- */
  var ACT_NAME = { 1: "现场", 2: "审讯", 3: "对撞", 4: "指认" };
  function goto(n) {
    if (n > 1 && !st.act1Done) { toast("先提交勘察结论。"); return; }
    if (n > 2 && Object.keys(st.tested).length < 4) { toast("至少测 4 个证人。"); return; }
    if (n > 3 && !st.act3Done) { toast("先把两问答对。"); return; }
    var moved = n !== st.act;
    st.act = n;
    /* 切幕时把还在跑的演算动画掐掉，别留一个定时器对着已卸载的面板写 DOM */
    if (moved && compTimer) { clearInterval(compTimer); compTimer = null; st.busy = false; }
    document.querySelectorAll(".c2lay").forEach(function (s) {
      s.classList.toggle("on", +s.dataset.a === n);
    });
    document.querySelectorAll(".c2act").forEach(function (b) {
      b.classList.toggle("on", +b.dataset.a === n);
      if (+b.dataset.a < n) b.classList.add("done");
    });
    if (moved) {
      flash(ACT_NAME[n] || "");
      snd.paper();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* 幕名闪一下：不用转场遮罩，只在中间印一个大字，一秒后自己散掉 */
  function flash(text) {
    var el = $("#c2flash");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
  }
  $("#acts").addEventListener("click", function (e) {
    var b = e.target.closest(".c2act");
    if (!b || b.disabled) return;
    goto(+b.dataset.a);
  });

  /* ---------------- 体检 / 驻馆人钩子（只读） ---------------- */
  window.YCCase = {
    status: function () {
      var sc = scoreOf();
      return {
        act: st.act,
        picked: Object.keys(st.picked).length,
        act1Score: st.act1Score,
        tested: sc.nTest,
        points: st.points,
        submitted: st.submitted,
        left: st.points,
        score: sc.total,
        done: st.submitted,
        busy: !!st.busy,
        press: Math.round(press * 100),
        sound: snd.on
      };
    }
  };

  /* ---------------- 声音开关 ---------------- */
  function paintSnd() {
    var b = $("#btnSnd");
    if (!b) return;
    b.classList.toggle("on", snd.on);
    b.setAttribute("aria-pressed", snd.on ? "true" : "false");
    $("#sndTxt").textContent = snd.on ? "环境音 开" : "环境音 关";
  }
  var sndUserSet = false;
  $("#btnSnd").addEventListener("click", function () {
    sndUserSet = true;
    if (snd.on) snd.stop(); else snd.start();
    paintSnd();
    if (snd.on) { snd.paper(); toast("环境音已开。这一层楼只有你一个人。"); }
  });

  /* 浏览器不给自动播放，所以第一次点击页面才起音。
     点的是按钮就听按钮的（sndUserSet 已经置位），点的是别处就自动开 ——
     用户要的是「恐怖音乐」，不是「先找开关」。 */
  document.addEventListener("pointerdown", function () {
    if (sndUserSet || snd.on) return;
    snd.start(); paintSnd();
  });

  /* 卷宗不是「已经在那儿」，是「正在被翻开」——
     一行行扫下来，扫到哪一行，那一段就亮起来。 */
  function revealDoc() {
    var doc = document.querySelector(".c2doc");
    if (!doc) return;
    doc.classList.add("reveal");
    var scan = document.createElement("div");
    scan.className = "scan";
    doc.appendChild(scan);
    setTimeout(function () { snd.paper(); }, 240);
    setTimeout(function () { if (scan.parentNode) scan.parentNode.removeChild(scan); }, 1900);
  }

  /* ---------------- 启动 ---------------- */
  paintPick(); paintPips(); paintWList(); paintDossier(); paintWall(); paintAct3(); paintForm();
  paintSnd();
  bumpPress(0);
  setTimeout(revealDoc, 320);

  /* 心跳一直跑，但只在环境音开着、并且压力上来之后才听得见 */
  setInterval(function () { if (snd.on) snd.beat(press); }, 120);

  if (!CASE) {
    toast("内核未加载：请从 h2-forensic.html 进入。");
  }
})();

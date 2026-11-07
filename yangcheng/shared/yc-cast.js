/* ============================================================
   yc-cast.js — 杨城「驻馆人」系统 · 引擎
   ------------------------------------------------------------
   老馆有四位导游，但他们是「同一个声音的四个语气」：
   单向广播、不记得你、不互相冲突。

   这一层解决三件事，缺一件人就是死的：
     1) 立场 —— 每馆两人，对同一个问题主张相反，你必须选边
     2) 记忆 —— 信任度 bond 持久化，他对你的态度随你做过的事变
     3) 对话 —— 不是播报，是能追问的来回；他会主动来找你

   数据在 src/hX/07-cast.js（每馆一份，含 SVG 立绘）。
   本文件只做引擎，不含任何具体人物的内容。
   ------------------------------------------------------------
   对外 API
     YCCast.register(hall, spec)     注册一馆（页面载入即自动挂载）
     YCCast.state()                  读全部状态
     YCCast.bondOf(id)               某人当前信任值
     YCCast.tierOf(id)               某人当前档位名
     YCCast.say(hall, ev, data)      手动触发一句（游戏内核可用）
     YCCast.openPanel(hall, chId)    打开搭话面板
     YCCast.openCard(hall, chId)     打开人物档案
     YCCast.roster()                 今日值守（城市页用）
     YCCast.mount(hall)              手动挂载
   ============================================================ */
window.YCCast = (function () {
  "use strict";

  var VERSION = "1.0.0";
  var KEY = "yc.cast.v1";

  /* ==========================================================
     0 · 基础设施
     ========================================================== */
  function read() {
    try {
      var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(KEY) : null;
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === "object") {
        o.bond = o.bond || {}; o.camp = o.camp || {}; o.met = o.met || {};
        o.oral = o.oral || {}; o.said = o.said || {}; o.flag = o.flag || {};
        return o;
      }
    } catch (e) {}
    return { bond: {}, camp: {}, met: {}, oral: {}, said: {}, flag: {} };
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  var S = read();

  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ==========================================================
     1 · 信任度
     ========================================================== */
  var TIERS = [
    { min: 0,  key: "cold",  cn: "生分", note: "公事公办" },
    { min: 25, key: "warm",  cn: "熟络", note: "愿意多说两句" },
    { min: 50, key: "open",  cn: "交底", note: "开始讲自己的事" },
    { min: 75, key: "trust", cn: "托付", note: "把没写进档案的话给你" }
  ];

  function bondOf(id) { return clamp(num(S.bond[id], 0), 0, 100); }
  function tierIdx(v) {
    var i = 0;
    for (var k = 0; k < TIERS.length; k++) if (v >= TIERS[k].min) i = k;
    return i;
  }
  function tierOf(id) { return TIERS[tierIdx(bondOf(id))]; }

  function addBond(id, delta, why) {
    if (!id || !delta) return;
    var before = bondOf(id);
    var after = clamp(before + delta, 0, 100);
    if (after === before) return;
    S.bond[id] = after;
    write(S);
    var b0 = tierIdx(before), b1 = tierIdx(after);
    if (b1 > b0) {
      /* 升档：人物会主动交代一句 */
      var ch = findChar(id);
      if (ch) {
        setTimeout(function () {
          toast(ch, TIERS[b1].cn === "托付"
            ? "有些话我本来不打算跟参观的人说。你现在可以问了。"
            : "……行吧，你问的东西越来越像内行了。");
        }, 700);
      }
    }
    return after;
  }

  /* ==========================================================
     2 · 注册表
     ========================================================== */
  var SPECS = {};
  var CHARMAP = {};

  function register(hall, spec) {
    spec.hall = hall;
    spec.cast = spec.cast || [];
    spec.accent = spec.accent || "#46d3e8";
    SPECS[hall] = spec;
    spec.cast.forEach(function (c) {
      c.hall = hall;
      c.accent = c.color || spec.accent;
      /* 立绘配置也要拿到强调色：轮廓光、领带、工装拉链都用它，
         不然同一个人在小坞和档案卡里会串色。 */
      if (c.port) c.port.accent = c.accent;
      CHARMAP[c.id] = c;
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { autoMount(hall); });
    } else {
      autoMount(hall);
    }
    return spec;
  }
  function specOf(hall) { return SPECS[hall] || null; }
  function findChar(id) { return CHARMAP[id] || null; }

  /* ==========================================================
     3 · 立绘
     ----------------------------------------------------------
     不用 emoji。emoji 是「图标」，不是「人」——十个人共用一套
     表情符号，看上去就是同一个人换了十件衣服。
     这里给每人一段手绘 SVG：头型、眉眼、嘴、配饰各自不同，
     三种情绪（calm/up/down）只改眉与嘴，其余保持可辨认。
     ========================================================== */

  /* 画法公共件：各馆文件用 YCCast.svg.* 拼自己的立绘 */
  var svg = {
    /* 胸肩：所有立绘共用，保证十个人站在同一条基线上 */
    bust: function (c, d) {
      d = d || "";
      return '<path d="M11 64c0-11.6 9.4-18.4 21-18.4S53 52.4 53 64" fill="' + c +
        '1f" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/>' + d;
    },
    /* 脖子 */
    neck: function (c) {
      return '<rect x="28.4" y="35.5" width="7.2" height="10" rx="2" fill="' + c + '30"/>';
    },
    /* 嘴：up=笑，down=皱眉，calm=平 */
    mouth: function (m, c, cx, cy, w) {
      cx = cx || 32; cy = cy || 36; w = w || 9;
      var st = 'fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"';
      if (m === "up") return '<path d="M' + (cx - w / 2) + " " + cy + " Q" + cx + " " + (cy + 3.6) + " " + (cx + w / 2) + " " + cy + '" ' + st + "/>";
      if (m === "down") return '<path d="M' + (cx - w / 2) + " " + (cy + 1.8) + " Q" + cx + " " + (cy - 2.6) + " " + (cx + w / 2) + " " + (cy + 1.8) + '" ' + st + "/>";
      return '<path d="M' + (cx - w / 2) + " " + cy + " L" + (cx + w / 2) + " " + cy + '" ' + st + "/>";
    },
    /* 眉：随情绪抬/压 */
    brow: function (m, c, y, spread) {
      y = y || 20.5; spread = spread || 6;
      var dy = m === "up" ? -1.6 : (m === "down" ? 1.5 : 0);
      var tilt = m === "down" ? 1.4 : 0;
      var st = 'fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" opacity=".85"';
      return '<path d="M' + (32 - spread - 3.4) + " " + (y + dy + tilt) + " L" + (32 - spread + 2.4) + " " + (y + dy - tilt) + '" ' + st + "/>" +
        '<path d="M' + (32 + spread - 2.4) + " " + (y + dy - tilt) + " L" + (32 + spread + 3.4) + " " + (y + dy + tilt) + '" ' + st + "/>";
    },
    /* 眼：dot=圆点，line=细线，wide=睁大 */
    eye: function (k, c, y, spread) {
      y = y || 26; spread = spread || 6;
      var L = 32 - spread, R = 32 + spread;
      if (k === "line") {
        var st = 'fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"';
        return '<path d="M' + (L - 2.6) + " " + y + " L" + (L + 2.6) + " " + y + '" ' + st + "/>" +
          '<path d="M' + (R - 2.6) + " " + y + " L" + (R + 2.6) + " " + y + '" ' + st + "/>";
      }
      if (k === "wide") {
        return '<circle cx="' + L + '" cy="' + y + '" r="2.5" fill="' + c + '"/>' +
          '<circle cx="' + R + '" cy="' + y + '" r="2.5" fill="' + c + '"/>' +
          '<circle cx="' + L + '" cy="' + y + '" r="1" fill="#080b10"/>' +
          '<circle cx="' + R + '" cy="' + y + '" r="1" fill="#080b10"/>';
      }
      return '<circle cx="' + L + '" cy="' + y + '" r="1.9" fill="' + c + '"/>' +
        '<circle cx="' + R + '" cy="' + y + '" r="1.9" fill="' + c + '"/>';
    }
  };

  /* Portrait 2.0 的取景框：留一点边，下巴不贴边 */
  var PORT_VB = "12 10 176 176";

  function hasPort(ch) { return !!(ch && ch.port && window.YCPort); }

  function faceHTML(ch, mood, cls) {
    mood = mood || "calm";
    var inner = "", vb = "0 0 64 64", ring = "";
    if (hasPort(ch)) {
      try { inner = window.YCPort.raw(ch.port, mood, 1); } catch (e) { inner = ""; }
      vb = PORT_VB;
    } else {
      try { inner = ch.art ? ch.art(mood, ch.color) : ""; } catch (e) { inner = ""; }
      ring = '<circle cx="32" cy="32" r="31" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="1.4"/>';
    }
    return '<button class="cst-face ' + (cls || "") + '" data-ch="' + ch.id +
      '" title="' + esc(ch.name) + "（" + esc(ch.role) + '）" style="--cst-pc:' + (ch.color || "#46d3e8") + '">' +
      '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      ring + inner +
      "</svg></button>";
  }

  /* 档案卡左栏的大幅胸像。这是全站唯一能看清五官的地方，
     也是 Portrait 2.0 存在的理由 —— 小头像只需要认得出是谁，
     大图才需要「像个人」。 */
  function bustHTML(ch, mood) {
    if (!hasPort(ch)) return faceHTML(ch, mood, "on");
    var inner = "";
    try { inner = window.YCPort.raw(ch.port, mood || "calm", 2); } catch (e) { inner = ""; }
    return '<div class="cstc-por" aria-hidden="true">' +
      '<div class="cstc-portag">PROFILE · 档案</div>' +
      '<div class="cstc-porwm">' + esc(ch.name) + "</div>" +
      '<svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMax meet">' + inner + "</svg>" +
      '<div class="cstc-porname">' + esc(ch.name) + '<em>' + esc(ch.role) + "</em></div>" +
      "</div>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ==========================================================
     4 · 说话（打字机）
     ========================================================== */
  var typeTimers = {};

  function typeInto(el, text, done) {
    if (!el) return;
    var key = el.id || "anon";
    clearTimeout(typeTimers[key]);
    el.textContent = "";
    var i = 0;
    var caret = document.createElement("i");
    caret.className = "cst-caret";
    function tick() {
      if (i >= text.length) {
        if (caret.parentNode) caret.parentNode.removeChild(caret);
        if (done) done();
        return;
      }
      i++;
      el.textContent = text.slice(0, i);
      el.appendChild(caret);
      typeTimers[key] = setTimeout(tick, 18 + (text.charCodeAt(i) % 3) * 9);
    }
    tick();
  }

  /* 富文本：把 **xx** 变成 <em>，<b> 原样保留 */
  function rich(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<em>$1</em>").replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
  }

  /* ==========================================================
     5 · 事件台词
     ========================================================== */
  function ctxOf(spec, ch) {
    var D = window.YCDeep;
    var prog = { seen: 0, passed: 0, total: 8 };
    if (D && D.progress) { try { prog = D.progress(spec.hall); } catch (e) {} }
    var elite = false, visit = false;
    if (D && D.getCert) {
      try { elite = !!D.getCert(spec.hall, "elite"); visit = !!D.getCert(spec.hall, "visitor"); } catch (e) {}
    }
    return {
      hall: spec.hall, hallName: spec.name,
      ch: ch, other: otherOf(spec, ch),
      bond: bondOf(ch.id), tier: tierOf(ch.id),
      progress: prog, elite: elite, visit: visit,
      camp: S.camp[spec.hall] || null,
      mine: S.camp[spec.hall] === ch.id
    };
  }
  function otherOf(spec, ch) {
    for (var i = 0; i < spec.cast.length; i++) if (spec.cast[i].id !== ch.id) return spec.cast[i];
    return null;
  }

  function pickLine(ch, ev, ctx) {
    var pool = ch.lines && ch.lines[ev];
    if (typeof pool === "function") { try { pool = pool(ctx); } catch (e) { pool = null; } }
    if (!pool) {
      /* 兜底：跨人物通用，避免某一事件没写就哑了 */
      var G = GENERIC[ev];
      if (typeof G === "function") pool = G(ctx);
      else pool = G;
    }
    if (!pool || !pool.length) return null;
    var n = num(S.said[ch.id + ":" + ev], 0);
    S.said[ch.id + ":" + ev] = n + 1;
    write(S);
    return pool[n % pool.length];
  }

  var GENERIC = {
    greet: function (c) { return ["我是" + c.ch.name + "，" + c.ch.role + "。这一馆由我盯着。"]; },
    idle: function (c) { return ["还在看？不急，我先不说话。", "需要我讲点什么的时候，点「搭话」。"]; },
    seen: function (c) { return ["这一件看完了。记一句就够了：" + (c.ch.lesson || "别只看数字。")]; },
    /* 换房间：他跟着你走。这是「有人在」最便宜也最有效的证据 */
    zone: function (c) {
      var n = (c.data && c.data.name) || "这一间";
      var L = c.ch.lesson || "慢慢看，别急着下结论。";
      return [
        "「" + n + "」。" + L,
        "进了「" + n + "」。这一间我只提醒一句：" + L
      ];
    },
    pass: function (c) { return ["对了。别急着高兴，换个参数再跑一遍看看还成不成立。"]; },
    fail: function (c) { return ["错了不要紧。先问自己：你凭什么这么判？"]; },
    streak: function (c) { return ["连着错三次了。我换个说法——先别看答案，看条件。"]; },
    elite: function (c) { return ["证书签了。但你自己知道，你刚才每一步为什么对。"]; },
    visit: function (c) { return ["参观证书拿到了。这算见过，还不算懂。"]; },
    enterDeep: function (c) { return ["进了这一步，就没有旁观的位置了。"]; },
    campWin: function (c) { return ["你站我这边。那我把话说透一点。"]; },
    campLose: function (c) { return ["你信他。行，我不争——数据会替我说。"]; }
  };

  /* ==========================================================
     6 · 驻馆坞
     ========================================================== */
  var DOCK = null, DOCK_HALL = null, CUR = null, MOOD = "calm";
  var lastSay = 0, idleTimer = null, probeTimer = null, probeSnap = null;
  var SAYFN = null, PAINTFN = null;

  function isGamePage() {
    var p = (location.pathname || "").split("/").pop() || "";
    return /-(case|maze|purge|forecast|tower)\.html$/.test(p);
  }

  function autoMount(hall) {
    if (new URLSearchParams(location.search).get("museumEmbed") === "1") return;
    var spec = SPECS[hall];
    if (!spec) return;
    /* 一页只挂一馆；若页面已挂过别的馆，先拆 */
    if (DOCK_HALL && DOCK_HALL !== hall) unmount();
    if (DOCK_HALL === hall) return;
    mount(hall);
  }

  function unmount() {
    if (DOCK) { DOCK.parentNode && DOCK.parentNode.removeChild(DOCK); DOCK = null; }
    clearInterval(probeTimer); probeTimer = null;
    clearTimeout(idleTimer); idleTimer = null;
    DOCK_HALL = null; CUR = null;
  }

  function mount(hall) {
    // 新馆已由3D导游讲解；内嵌工作台不得再挂旧人物浮层遮挡操作。
    if (new URLSearchParams(location.search).get("museumEmbed") === "1") return null;
    var spec = SPECS[hall];
    if (!spec || !spec.cast.length) return null;
    DOCK_HALL = hall;

    var saved = null;
    try { saved = localStorage.getItem("yc.cast.cur." + hall); } catch (e) {}
    CUR = (saved && CHARMAP[saved] && CHARMAP[saved].hall === hall) ? saved : spec.cast[0].id;

    var folded = false;
    try { folded = localStorage.getItem("yc.cast.fold." + hall) === "1"; } catch (e) {}

    var el = document.createElement("div");
    el.className = "castdock cst-root" + (folded ? " cst-fold" : "");
    el.style.setProperty("--cst-ac", spec.accent);
    el.setAttribute("data-hall", hall);
    el.innerHTML =
      '<div class="cst-mini">' +
        '<div class="cst-faces"></div>' +
        '<span>' + esc(spec.shortName || "驻馆人") + '</span>' +
      "</div>" +
      '<div class="cst-head">' +
        '<i class="cst-live"></i><b>驻馆人</b>' +
        '<span class="cst-where">' + esc(spec.hall) + " · " + esc(spec.roomName || spec.name) + "</span>" +
        '<button class="cst-min" title="收起">–</button>' +
      "</div>" +
      '<div class="cst-row">' +
        '<div class="cst-faces"></div>' +
        '<div class="cst-who"></div>' +
      "</div>" +
      '<div class="cst-say" id="cstSay"></div>' +
      '<div class="cst-acts">' +
        '<button class="cst-btn pri" data-a="talk">搭话</button>' +
        '<button class="cst-btn" data-a="card">档案</button>' +
        (isGamePage() && typeof spec.hint === "function"
          ? '<button class="cst-btn" data-a="hint" title="花信任度换一句真提示">求提示</button>'
          : '<button class="cst-btn" data-a="switch">换人</button>') +
      "</div>";
    document.body.appendChild(el);
    DOCK = el;

    /* 头像渲染 */
    function paintFaces() {
      var big = el.querySelector(".cst-row .cst-faces");
      var mini = el.querySelector(".cst-mini .cst-faces");
      var html = spec.cast.map(function (c) {
        var cls = c.id === CUR ? "on" : (S.camp[hall] && S.camp[hall] !== c.id ? "cold" : "");
        return faceHTML(c, c.id === CUR ? MOOD : "calm", cls);
      }).join("");
      if (big) big.innerHTML = html;
      if (mini) mini.innerHTML = html;
    }

    function paintWho() {
      var ch = CHARMAP[CUR], o = otherOf(spec, ch);
      var who = el.querySelector(".cst-who");
      if (!who || !ch) return;
      var t = tierOf(ch.id), b = bondOf(ch.id);
      var mine = S.camp[hall] === ch.id;
      var segs = "";
      for (var i = 0; i < 10; i++) segs += '<i class="' + (b >= (i + 1) * 10 ? "on" : "") + '"></i>';
      who.innerHTML =
        '<div class="cst-nm">' + esc(ch.name) +
          "<small>" + esc(ch.role) + "</small></div>" +
        '<div class="cst-tag">' +
          '<span class="cst-camp' + (mine ? " mine" : "") + '">「' + esc(ch.camp) + "」</span>" +
          "<span>" + esc(t.cn) + " · " + esc(t.note) + "</span>" +
        "</div>" +
        '<div class="cst-bond">' +
          '<span class="cst-bseg">' + segs + "</span>" +
          "<b>" + b + "</b>" +
        "</div>";
    }

    function paint() { paintFaces(); paintWho(); }
    SAYFN = sayNow; PAINTFN = paint;

    /* 切换当前说话人 */
    function setCur(id, quiet) {
      if (!CHARMAP[id]) return;
      CUR = id; MOOD = "calm";
      try { localStorage.setItem("yc.cast.cur." + hall, id); } catch (e) {}
      paint();
      if (!quiet) {
        var ch = CHARMAP[id];
        sayNow(pickLine(ch, "switchIn", ctxOf(spec, ch)) ||
          "我来说吧。他刚才那套，我有一半不同意。");
      }
    }

    function sayNow(text) {
      var say = el.querySelector("#cstSay");
      if (!say || !text) return;
      lastSay = Date.now();
      typeInto(say, "", null);
      say.innerHTML = "";
      typeText(say, text);
    }
    /* 支持 **强调** */
    function typeText(host, text) {
      clearTimeout(typeTimers["cstSay"]);
      host.textContent = "";
      var caret = document.createElement("i");
      caret.className = "cst-caret";
      var plain = String(text);
      var i = 0;
      function tick() {
        if (i >= plain.length) {
          if (caret.parentNode) caret.parentNode.removeChild(caret);
          host.innerHTML = rich(plain);
          return;
        }
        i++;
        host.textContent = plain.slice(0, i);
        host.appendChild(caret);
        typeTimers["cstSay"] = setTimeout(tick, 18 + (plain.charCodeAt(i) % 3) * 9);
      }
      tick();
    }

    /* ---- 事件 ---- */
    el.addEventListener("click", function (ev) {
      var f = ev.target.closest(".cst-face");
      if (f) { setCur(f.getAttribute("data-ch")); return; }
      var b = ev.target.closest("[data-a]");
      if (b) {
        var a = b.getAttribute("data-a");
        if (a === "talk") openPanel(hall, CUR);
        else if (a === "card") openCard(hall, CUR);
        else if (a === "hint") doHint(hall, spec);
        else if (a === "switch") {
          var o = otherOf(spec, CHARMAP[CUR]);
          if (o) setCur(o.id);
        }
        return;
      }
      var mn = ev.target.closest(".cst-min");
      if (mn) {
        el.classList.add("cst-fold");
        try { localStorage.setItem("yc.cast.fold." + hall, "1"); } catch (e) {}
        return;
      }
      if (ev.target.closest(".cst-mini")) {
        el.classList.remove("cst-fold");
        try { localStorage.setItem("yc.cast.fold." + hall, "0"); } catch (e) {}
        paint();
        sayNow(pickLine(CHARMAP[CUR], "idle", ctxOf(spec, CHARMAP[CUR])) || "我在。");
      }
    });

    paint();

    /* ---- 首访：先选边，再打招呼 ---- */
    var firstTime = !S.met[hall];
    if (firstTime) {
      S.met[hall] = Date.now(); write(S);
      spec.cast.forEach(function (c) { addBond(c.id, 5); });
      paint();
      /* 先让坞里有人说话，再弹选边 —— 关掉弹层之后不至于是一片空白 */
      setTimeout(function () {
        var ch = CHARMAP[CUR];
        sayNow(pickLine(ch, "greet", ctxOf(spec, ch)) ||
          "我是" + ch.name + "。这一馆由我盯着。");
      }, 600);
      if (!S.camp[hall] && spec.campQ && !isGamePage()) {
        setTimeout(function () { openCamp(hall); }, 1500);
      }
    } else {
      setTimeout(function () {
        var ch = CHARMAP[CUR];
        var line = pickLine(ch, S.camp[hall] === ch.id ? "greetMine" : "greet", ctxOf(spec, ch)) ||
          pickLine(ch, "greet", ctxOf(spec, ch));
        sayNow(line);
      }, 900);
    }

    /* ---- 跟着你走：换房间时他开口 ----
       五个馆的房名控件类名各不相同（.tab/.lay/.door/.zone/.ks），
       但都带 data-l —— 所以在 document 上代理一次，不去碰各馆代码。 */
    var lastZone = "", lastZoneAt = 0;
    function zoneLabel(el) {
      var c = el.querySelector(".tt") || el.querySelector("span") || el;
      var s = (c.textContent || "").replace(/[0-9０-９·]/g, " ").replace(/\s+/g, " ").trim();
      return s.length > 12 ? s.slice(0, 12) : s;
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-l]");
      if (!t) return;
      var name = zoneLabel(t);
      if (!name || name === lastZone) return;
      if (Date.now() - lastZoneAt < 6000) return;
      lastZone = name; lastZoneAt = Date.now();
      setTimeout(function () { dispatch(hall, "zone", { name: name }); }, 340);
    }, true);

    /* ---- 闲置主动搭话 ---- */
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (document.hidden) return;
        var ch = CHARMAP[CUR];
        var t = pickLine(ch, "idle", ctxOf(spec, ch));
        if (t) { sayNow(t); toast(ch, t, 6000); }
        resetIdle();
      }, 44000);
    }
    ["pointerdown", "keydown", "wheel"].forEach(function (e) {
      window.addEventListener(e, resetIdle, { passive: true });
    });
    resetIdle();

    /* ---- 游戏页：盯盘 ---- */
    if (isGamePage() && typeof spec.probe === "function") {
      probeSnap = safeProbe(spec);
      probeTimer = setInterval(function () {
        var s = safeProbe(spec);
        if (!s || !probeSnap) { probeSnap = s; return; }
        react(hall, spec, probeSnap, s);
        probeSnap = s;
      }, 1500);
    }

    window.addEventListener("yc:deep", function (e) {
      var d = e.detail || {};
      if (d.hall !== hall) return;
      dispatch(hall, d.ev, d.data);
    });

    return el;
  }

  function safeProbe(spec) {
    try { return spec.probe ? spec.probe() : null; } catch (e) { return null; }
  }

  /* 盯盘：状态变了就说一句 */
  function react(hall, spec, a, b) {
    var ch = CHARMAP[CUR];
    if (!ch) return;
    if (Date.now() - lastSay < 5200) return;
    var ctx = ctxOf(spec, ch);
    if (a.done !== b.done && b.done) { if (SAYFN) SAYFN(pickLine(ch, "gameDone", ctx) || "走完了。回头看一遍你刚才的每一步。"); return; }
    if (b.left !== a.left && b.left < a.left) {
      var t = pickLine(ch, "gameSpend", ctx);
      if (t && SAYFN) SAYFN(t);
      return;
    }
    if (b.score !== a.score && b.score > a.score) {
      var t2 = pickLine(ch, "gameUp", ctx);
      if (t2 && SAYFN) SAYFN(t2);
      return;
    }
    if (b.warn && b.warn !== a.warn) {
      var t3 = pickLine(ch, "gameWarn", ctx);
      if (t3 && SAYFN) SAYFN(t3);
    }
  }

  /* ==========================================================
     7 · 求提示（只在玩法页）
     ----------------------------------------------------------
     这是本系统里唯一「有代价」的交互：一句真能用的提示，
     要拿信任度换，而且越要越贵。
     为什么这么做：如果提示免费，人就会一直问，人物就退化成
     说明书；如果提示太贵，人就不敢问，人物就退化成装饰。
     涨价的曲线是这条线的位置本身。
     ========================================================== */
  function hintCost(hall) {
    var n = num(S.flag["hint." + hall], 0);
    return 6 + n * 4;
  }

  function doHint(hall, spec) {
    var ch = CHARMAP[CUR];
    if (!ch || !spec.hint) return;
    var n = num(S.flag["hint." + hall], 0);
    var cost = hintCost(hall);
    var b = bondOf(ch.id);
    if (b < cost) {
      if (SAYFN) SAYFN("你还不够信我。信任度 " + b + "，这一句要 " + cost +
        "。先去把展品验几件，或者把这一关重走一遍——**信任是攒出来的，不是要出来的**。");
      return;
    }
    var snap = safeProbe(spec);
    var text = "";
    try { text = spec.hint(snap, n) || ""; } catch (e) { text = ""; }
    if (!text) { if (SAYFN) SAYFN("这一句我还没想好怎么跟你说。先自己试试。"); return; }
    addBond(ch.id, -cost, "hint");
    S.flag["hint." + hall] = n + 1;
    write(S);
    if (PAINTFN) PAINTFN();
    if (SAYFN) SAYFN(text);
    toast(ch, "这句花了你 " + cost + " 点信任。下一句要 " + hintCost(hall) + "。", 6000);
  }

  /* ==========================================================
     8 · 事件派发
     ========================================================== */
  function dispatch(hall, ev, data) {
    var spec = SPECS[hall];
    if (!spec || !DOCK) return;
    var ch = CHARMAP[CUR];
    if (!ch) return;
    var ctx = ctxOf(spec, ch);
    ctx.data = data || {};

    var DELTA = {
      pass: 4, fail: -1, seen: 2, streak: 3,
      elite: 15, visit: 6, enterDeep: 2, gameDone: 18, camp: 3
    };
    if (typeof DELTA[ev] === "number") addBond(ch.id, DELTA[ev], ev);

    var line = pickLine(ch, ev, ctx);
    if (!line) return;
    /* 情绪：成功上扬、失败下压 */
    MOOD = ev === "pass" || ev === "elite" || ev === "gameDone" ? "up"
      : (ev === "fail" || ev === "streak" || ev === "gameWarn" ? "down" : "calm");
    if (DOCK) {
      var f = DOCK.querySelectorAll(".cst-face");
      for (var i = 0; i < f.length; i++) {
        var id = f[i].getAttribute("data-ch");
        f[i].outerHTML = faceHTML(CHARMAP[id], id === CUR ? MOOD : "calm",
          id === CUR ? "on" : (S.camp[hall] && S.camp[hall] !== id ? "cold" : ""));
      }
    }
    if (SAYFN) SAYFN(line);
    if (ev === "pass" || ev === "elite" || ev === "gameDone" || ev === "streak") toast(ch, line, 7000);
  }

  /* 兼容：老代码可以直接调 */
  function say(hall, ev, data) { dispatch(hall, ev, data); }

  /* ==========================================================
     8 · 搭话面板
     ========================================================== */
  var PANEL = null;

  function ensurePanel() {
    if (PANEL) return PANEL;
    var p = document.createElement("div");
    p.className = "castpanel cst-root";
    p.innerHTML =
      '<div class="cstp-head">' +
        '<div class="cstp-top"><div class="cst-faces"></div>' +
          '<div class="cstp-id"></div>' +
          '<button class="cst-x" title="关闭">×</button>' +
        "</div>" +
        '<div class="cstp-meta"></div>' +
      "</div>" +
      '<div class="cstp-flow" id="cstFlow"></div>' +
      '<div class="cstp-topics" id="cstTopics"></div>';
    document.body.appendChild(p);
    PANEL = p;
    p.querySelector(".cst-x").addEventListener("click", function () { p.classList.remove("open"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && p.classList.contains("open")) p.classList.remove("open");
    });
    return p;
  }

  function openPanel(hall, chId) {
    var spec = SPECS[hall];
    if (!spec) return;
    var ch = CHARMAP[chId || CUR];
    if (!ch) return;
    var p = ensurePanel();
    p.style.setProperty("--cst-ac", spec.accent);
    p.setAttribute("data-hall", hall);
    p.setAttribute("data-ch", ch.id);

    var faces = p.querySelector(".cstp-top .cst-faces");
    faces.innerHTML = spec.cast.map(function (c) {
      return faceHTML(c, "calm", c.id === ch.id ? "on" : "");
    }).join("");
    faces.onclick = function (ev) {
      var f = ev.target.closest(".cst-face");
      if (f) openPanel(hall, f.getAttribute("data-ch"));
    };

    var idBox = p.querySelector(".cstp-id");
    var t = tierOf(ch.id), b = bondOf(ch.id);
    var mine = S.camp[hall] === ch.id;
    idBox.innerHTML =
      '<div class="cst-nm">' + esc(ch.name) + "<small>" + esc(ch.role) + "</small></div>" +
      '<div class="cst-tag">' +
        '<span class="cst-camp' + (mine ? " mine" : "") + '">「' + esc(ch.camp) + "」</span>" +
        "<span>" + esc(t.cn) + "</span>" +
      "</div>";

    var meta = p.querySelector(".cstp-meta");
    var prog = ctxOf(spec, ch).progress;
    meta.innerHTML =
      "<span>信任 <b>" + b + "</b>/100</span>" +
      "<span>展品 <b>" + prog.passed + "</b>/" + prog.total + "</span>" +
      "<span>口述史 <b>" + unlockedOral(ch).length + "</b>/" + (ch.oral || []).length + "</span>" +
      (S.camp[hall] ? "<span>已选边 <b>" + esc((CHARMAP[S.camp[hall]] || {}).name || "—") + "</b></span>" : "<span>尚未选边</span>");

    /* 对话流：开场一句 */
    var flow = p.querySelector("#cstFlow");
    flow.innerHTML = "";
    var ctx = ctxOf(spec, ch);
    var opening = pickLine(ch, mine ? "panelMine" : "panel", ctx) ||
      pickLine(ch, "panel", ctx) || "问吧。我不一定全说。";
    pushMsg(flow, "them", opening);

    /* 话题 */
    paintTopics(p, hall, ch);
    p.classList.add("open");
  }

  function pushMsg(flow, who, text, lore) {
    var d = document.createElement("div");
    d.className = "cst-msg" + (who === "me" ? " me" : "");
    if (who === "sys") {
      d.className = "cst-msg sys";
      d.innerHTML = "<span>" + esc(text) + "</span>";
    } else {
      var html = rich(text);
      if (lore) html += '<span class="cst-lore">' + rich(lore) + "</span>";
      d.innerHTML = '<div class="cst-bub">' + html + "</div>";
    }
    flow.appendChild(d);
    flow.scrollTop = flow.scrollHeight;
    return d;
  }

  function paintTopics(p, hall, ch) {
    var spec = SPECS[hall];
    var box = p.querySelector("#cstTopics");
    var ctx = ctxOf(spec, ch);
    var asked = S.flag["asked." + ch.id] || {};
    var list = (ch.topics || []).filter(function (tp) {
      if (!tp.need) return true;
      if (tp.need.bond && bondOf(ch.id) < tp.need.bond) return false;
      if (tp.need.camp && !ctx.mine) return false;
      if (tp.need.elite && !ctx.elite) return false;
      return true;
    });

    var h = '<div class="cstp-th">可以问的</div>';
    if (!list.length) {
      h += '<div style="font-size:11.5px;color:var(--cst-ink3);line-height:1.7">他还没打算跟你聊这些。先去看看展品，或者把这一馆的挑战走一遍。</div>';
    }
    list.forEach(function (tp, i) {
      var isAsked = !!asked[tp.q];
      h += '<button class="cst-tp' + (isAsked ? " done" : "") + '" data-tp="' + i + '">' +
        esc(tp.q) +
        (tp.sub ? "<small>" + esc(tp.sub) + "</small>" : (isAsked ? "<small>已问过 · 可再问</small>" : "")) +
        "</button>";
    });
    /* 锁住的话题也显示，作为可见目标 */
    (ch.topics || []).forEach(function (tp) {
      if (!tp.need) return;
      if (list.indexOf(tp) >= 0) return;
      var why = tp.need.elite ? "需先完成本馆精英挑战" : (tp.need.camp ? "需先选边站队" : "需信任度 ≥ " + tp.need.bond);
      h += '<button class="cst-tp lock" disabled>' + esc(tp.q) + "<small>🔒 " + esc(why) + "</small></button>";
    });
    box.innerHTML = h;

    box.onclick = function (ev) {
      var b = ev.target.closest("[data-tp]");
      if (!b) return;
      var tp = list[+b.getAttribute("data-tp")];
      if (!tp) return;
      var flow = p.querySelector("#cstFlow");
      pushMsg(flow, "me", tp.q);
      var ctx2 = ctxOf(spec, ch);
      var ans = typeof tp.say === "function" ? tp.say(ctx2) : tp.say;
      var lore = null;
      if (tp.lore) lore = typeof tp.lore === "function" ? tp.lore(ctx2) : tp.lore;
      setTimeout(function () {
        pushMsg(flow, "them", ans, lore);
        S.flag["asked." + ch.id] = S.flag["asked." + ch.id] || {};
        S.flag["asked." + ch.id][tp.q] = 1;
        write(S);
        addBond(ch.id, 1);
        /* 追问 */
        if (tp.ask && tp.ask.length) {
          var fa = document.createElement("div");
          fa.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 12px";
          tp.ask.forEach(function (a, k) {
            var btn = document.createElement("button");
            btn.className = "cst-btn";
            btn.style.flex = "0 1 auto";
            btn.textContent = a.q;
            btn.onclick = function () {
              fa.remove();
              pushMsg(flow, "me", a.q);
              setTimeout(function () {
                pushMsg(flow, "them",
                  typeof a.say === "function" ? a.say(ctxOf(spec, ch)) : a.say,
                  a.lore ? (typeof a.lore === "function" ? a.lore(ctxOf(spec, ch)) : a.lore) : null);
                addBond(ch.id, 1);
              }, 380);
            };
            fa.appendChild(btn);
          });
          flow.appendChild(fa);
          flow.scrollTop = flow.scrollHeight;
        }
        /* 刷新头部数字与话题态 */
        var bb = bondOf(ch.id);
        var m = p.querySelector(".cstp-meta");
        if (m) m.children[0].innerHTML = "信任 <b>" + bb + "</b>/100";
        paintTopics(p, hall, ch);
      }, 420);
    };
  }

  /* ==========================================================
     9 · 人物档案
     ========================================================== */
  var CARD = null;

  function unlockedOral(ch) {
    var b = bondOf(ch.id);
    var elite = false;
    try { elite = !!(window.YCDeep && YCDeep.getCert(ch.hall, "elite")); } catch (e) {}
    var out = [];
    (ch.oral || []).forEach(function (o, i) {
      var ok = true;
      if (o.need) {
        if (o.need.bond && b < o.need.bond) ok = false;
        if (o.need.elite && !elite) ok = false;
      }
      if (ok) out.push(i);
    });
    return out;
  }

  function ensureCard() {
    if (CARD) return CARD;
    var c = document.createElement("div");
    c.className = "castcard cst-root";
    c.innerHTML = '<div class="cstc-box"><div class="cstc-head"></div>' +
      '<div class="cstc-wrap"><div class="cstc-body"></div></div></div>';
    document.body.appendChild(c);
    CARD = c;
    c.addEventListener("click", function (e) {
      if (e.target === c || e.target.closest(".cst-x")) c.classList.remove("open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && c.classList.contains("open")) c.classList.remove("open");
    });
    return c;
  }

  function openCard(hall, chId) {
    var spec = SPECS[hall];
    if (!spec) return;
    var ch = CHARMAP[chId || CUR];
    if (!ch) return;
    var c = ensureCard();
    c.style.setProperty("--cst-ac", ch.color || spec.accent);
    var head = c.querySelector(".cstc-head");
    var b = bondOf(ch.id), t = tierOf(ch.id);
    var mine = S.camp[hall] === ch.id;
    head.innerHTML =
      faceHTML(ch, "calm", "on") +
      '<div class="cstc-t"><h3>' + esc(ch.name) + " · " + esc(ch.role) + "</h3>" +
        "<p>" + esc(ch.camp) + "派 · " + esc(t.cn) + "（信任 " + b + "/100）" +
        (mine ? " · 你站他这边" : "") + "</p></div>" +
      '<button class="cst-x" title="关闭">×</button>';

    var o = otherOf(spec, ch);
    var ol = unlockedOral(ch);
    var body = c.querySelector(".cstc-body");
    /* 左栏大幅胸像：换人时要整块换掉，不能叠着留上一个人的脸 */
    var wrap = c.querySelector(".cstc-wrap");
    if (wrap) {
      var oldPor = wrap.querySelector(".cstc-por");
      if (oldPor) oldPor.parentNode.removeChild(oldPor);
      wrap.insertAdjacentHTML("afterbegin", bustHTML(ch, "calm"));
    }

    var kv = ch.kv || {};
    var kvHTML = Object.keys(kv).map(function (k) {
      return '<div class="cstc-kv"><div class="k">' + esc(k) + '</div><div class="v">' + esc(kv[k]) + "</div></div>";
    }).join("");

    body.innerHTML =
      '<div class="cstc-sec"><h4>他是谁</h4><p class="cstc-bio">' + rich(ch.bio || "") + "</p></div>" +
      (kvHTML ? '<div class="cstc-sec"><h4>档案</h4><div class="cstc-grid">' + kvHTML + "</div></div>" : "") +
      '<div class="cstc-sec"><h4>这一馆的分歧 <span>' + esc(spec.campQ || "") + "</span></h4>" +
        '<div class="cst-campline">' +
          '<div class="cst-campcard' + (mine ? " mine" : "") + '">' +
            '<div class="cn">' + esc(ch.name) + "「" + esc(ch.camp) + "」</div>" +
            '<div class="cq">' + esc(ch.stance || "") + "</div></div>" +
          '<div class="cst-vs">VS</div>' +
          (o ? '<div class="cst-campcard' + (S.camp[hall] === o.id ? " mine" : "") + '">' +
            '<div class="cn">' + esc(o.name) + "「" + esc(o.camp) + "」</div>" +
            '<div class="cq">' + esc(o.stance || "") + "</div></div>" : "<div></div>") +
        "</div>" +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">' +
          (S.camp[hall] ? "" : '<button class="cst-btn pri" style="flex:0 0 auto;padding:7px 14px" data-act="camp">还没选边 · 现在选</button>') +
          (spec.clash ? '<button class="cst-btn" style="flex:0 0 auto;padding:7px 14px" data-act="clash">听他们吵一架 →</button>' : "") +
        "</div>" +
      "</div>" +
      '<div class="cstc-sec"><h4>口述史 <span>' + ol.length + " / " + (ch.oral || []).length + "</span></h4>" +
        (ch.oral || []).map(function (o2, i) {
          var open = ol.indexOf(i) >= 0;
          return '<div class="cst-loreitem' + (open ? "" : " lock") + '">' +
            '<div class="lt">' + esc(o2.t) + "<em>" + (open ? "已解锁" : lockHint(o2)) + "</em></div>" +
            '<div class="lx">' + rich(o2.x) + "</div></div>";
        }).join("") +
      "</div>";

    body.onclick = function (e) {
      if (e.target.closest('[data-act="camp"]')) { c.classList.remove("open"); openCamp(hall); }
      if (e.target.closest('[data-act="clash"]')) { c.classList.remove("open"); openClash(hall); }
    };
    c.classList.add("open");
  }
  function lockHint(o) {
    if (o.need && o.need.elite) return "需完成精英挑战";
    if (o.need && o.need.bond) return "信任度 ≥ " + o.need.bond;
    return "未解锁";
  }

  /* 玩法页不自动弹选边。
     选边是「进馆时的邀请」，不是「开局前的关卡」——
     在 h2-case / h3-maze 这类页面上，一个全屏弹层直接盖住棋盘，
     玩家的第一反应是「游戏坏了」。要看两人的立场，坞里那个「立场」按钮还在。 */
  function isGamePage() {
    return /-(case|maze|purge|forecast|tower)\.html$/.test(location.pathname);
  }

  /* ==========================================================
     10 · 选边
     ========================================================== */
  var CAMP = null;

  function ensureCamp() {
    if (CAMP) return CAMP;
    var c = document.createElement("div");
    c.className = "castcamp cst-root";
    c.innerHTML = '<div class="cstk-box" id="cstkBox"></div>';
    document.body.appendChild(c);
    CAMP = c;
    /* 必须能随手关掉：选边是邀请，不是关卡 */
    c.addEventListener("click", function (e) {
      if (e.target === c) c.classList.remove("open");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && c.classList.contains("open")) c.classList.remove("open");
    });
    return c;
  }

  function openCamp(hall) {
    var spec = SPECS[hall];
    if (!spec || !spec.campQ) return;
    var c = ensureCamp();
    c.style.setProperty("--cst-ac", spec.accent);
    c.setAttribute("data-hall", hall);
    var box = c.querySelector("#cstkBox");
    box.innerHTML =
      '<div class="cstk-kick">' + esc(spec.hall) + " · " + esc(spec.roomName || spec.name) + " · 驻馆人立场</div>" +
      "<h2>" + esc(spec.campQ) + "</h2>" +
      '<p class="cstk-lead">' + rich(spec.campLead || "这一馆里两个人，对这个问题给出的答案不一样。他们都在这儿干了很久，都不打算改口。你站谁，之后听到的话就不一样——不是换个人说话，是换一套判断标准。") + "</p>" +
      '<div class="cstk-grid">' +
        spec.cast.map(function (ch) {
          /* 这里必须是 div 不能是 button：卡里要放头像按钮，
             button 套 button 会被解析器强制拆开，整张卡就散架了。 */
          return '<div class="cstk-pick" role="button" tabindex="0" data-pick="' + ch.id + '">' +
            '<div class="cst-faces">' + faceHTML(ch, "calm", "on") + "</div>" +
            '<div class="pn">' + esc(ch.name) + "</div>" +
            '<div class="pr">' + esc(ch.role) + " · 「" + esc(ch.camp) + "」派</div>" +
            '<div class="pq">' + esc(ch.stance || "") + "</div>" +
            '<div class="pc">我站他 →</div>' +
          "</div>";
        }).join("") +
      "</div>" +
      '<button class="cstk-skip">先不选，我再看看</button>';

    function pick(el) {
      var p = el.closest("[data-pick]");
      if (!p) return false;
      chooseCamp(hall, p.getAttribute("data-pick"));
      c.classList.remove("open");
      return true;
    }
    box.onclick = function (e) {
      if (pick(e.target)) return;
      if (e.target.closest(".cstk-skip")) c.classList.remove("open");
    };
    box.onkeydown = function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (pick(e.target)) e.preventDefault();
    };
    c.classList.add("open");
  }

  function chooseCamp(hall, id) {
    var spec = SPECS[hall];
    if (!spec || !CHARMAP[id]) return;
    S.camp[hall] = id; write(S);
    var ch = CHARMAP[id], o = otherOf(spec, ch);
    addBond(id, 8, "camp");
    if (o) addBond(o.id, -2, "campOther");
    if (DOCK) {
      CUR = id;
      try { localStorage.setItem("yc.cast.cur." + hall, id); } catch (e) {}
      mountRefresh(hall);
    }
    var line = pickLine(ch, "campWin", ctxOf(spec, ch)) ||
      "你站我这边。那我把话说透一点。";
    setTimeout(function () {
      if (SAYFN) SAYFN(line);
      toast(ch, line, 8000);
    }, 500);
    /* 让地图/首页知道状态变了 */
    try { window.dispatchEvent(new CustomEvent("yc:camp", { detail: { hall: hall, id: id } })); } catch (e) {}
  }

  function mountRefresh(hall) {
    /* 重挂一次，让头像的 cold/on 态、who 区全部重算 */
    var spec = SPECS[hall];
    if (!spec) return;
    var wasFold = DOCK && DOCK.classList.contains("cst-fold");
    unmount();
    var el = mount(hall);
    if (wasFold && el) el.classList.add("cst-fold");
    /* 注意：sayNow 是 mount 内的局部函数，这里只能用模块级的 SAYFN */
    if (el && SAYFN) SAYFN(pickLine(CHARMAP[CUR], "campWin", ctxOf(spec, CHARMAP[CUR])) || "行，我接着说。");
  }

  /* ==========================================================
     10 · 「听他们吵一架」
     ----------------------------------------------------------
     一个人对你说话，你是观众；两个人互相说话，你才是在场。
     台词不解释分歧，只把分歧演出来 —— 讲道理的部分留给玩家自己判断。
     ========================================================== */
  var CLASH = null, clashTimer = null, clashIdx = 0, clashHall = null;

  function ensureClash() {
    if (CLASH) return CLASH;
    var c = document.createElement("div");
    c.className = "castclash cst-root";
    c.innerHTML =
      '<div class="cstg-box">' +
        '<div class="cstg-head">' +
          '<div class="cstg-t"><h4>他们吵过一架</h4><p></p></div>' +
          '<button class="cst-x" title="关闭">×</button>' +
        "</div>" +
        '<div class="cstg-stage"></div>' +
        '<div class="cstg-foot">' +
          '<span class="cstg-hint">他们不会和解 —— 这是这一馆存在的原因。</span>' +
          '<button class="cst-btn" data-g="replay" style="flex:0 0 auto;padding:7px 12px">再说一遍</button>' +
          '<button class="cst-btn pri" data-g="skip" style="flex:0 0 auto;padding:7px 12px">全部展开</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(c);
    CLASH = c;
    c.addEventListener("click", function (e) {
      if (e.target === c || e.target.closest(".cst-x")) { stopClash(); return; }
      if (e.target.closest('[data-g="replay"]')) { openClash(clashHall); return; }
      if (e.target.closest('[data-g="skip"]')) { flushClash(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && c.classList.contains("open")) stopClash();
    });
    return c;
  }

  function clashRow(spec, l) {
    var ch = spec.cast[l.w === "b" ? 1 : 0] || spec.cast[0];
    var row = document.createElement("div");
    row.className = "cstg-row" + (l.w === "b" ? " r" : "");
    row.innerHTML = faceHTML(ch, l.mood || "calm", "on") +
      '<div class="cstg-bub"><span class="cstg-n">' + esc(ch.name) + " · " + esc(ch.role) + "</span>" +
      rich(l.t) + "</div>";
    return row;
  }

  function stopClash() {
    clearTimeout(clashTimer); clashTimer = null;
    if (CLASH) CLASH.classList.remove("open");
  }

  function flushClash() {
    var spec = SPECS[clashHall];
    if (!spec || !spec.clash) return;
    clearTimeout(clashTimer); clashTimer = null;
    var stage = CLASH.querySelector(".cstg-stage");
    while (clashIdx < spec.clash.length) {
      stage.appendChild(clashRow(spec, spec.clash[clashIdx++]));
    }
    stage.scrollTop = stage.scrollHeight;
    CLASH.querySelector('[data-g="skip"]').style.display = "none";
  }

  function openClash(hall) {
    var spec = SPECS[hall];
    if (!spec || !spec.clash || !spec.clash.length) return;
    var c = ensureClash();
    c.style.setProperty("--cst-ac", spec.accent);
    c.querySelector("h4").textContent = spec.clashTitle || "他们吵过一架";
    c.querySelector(".cstg-head p").textContent =
      spec.hall + " · " + (spec.roomName || spec.name) + " · " + spec.campQ;
    c.querySelector(".cstg-stage").innerHTML = "";
    c.querySelector('[data-g="skip"]').style.display = "";
    clashHall = hall; clashIdx = 0;
    c.classList.add("open");
    playClash();
  }

  function playClash() {
    var spec = SPECS[clashHall];
    if (!spec || !spec.clash) return;
    var stage = CLASH.querySelector(".cstg-stage");
    if (clashIdx >= spec.clash.length) {
      CLASH.querySelector('[data-g="skip"]').style.display = "none";
      return;
    }
    stage.appendChild(clashRow(spec, spec.clash[clashIdx++]));
    stage.scrollTop = stage.scrollHeight;
    clearTimeout(clashTimer);
    clashTimer = setTimeout(playClash, 1750);
  }

  /* ==========================================================
     11 · 插话提示
     ========================================================== */
  var TOAST = null, toastTimer = null;
  function toast(ch, text, ms) {
    if (!TOAST) {
      TOAST = document.createElement("div");
      TOAST.className = "csttoast cst-root";
      document.body.appendChild(TOAST);
    }
    var spec = SPECS[ch.hall];
    TOAST.style.setProperty("--cst-ac", ch.color || (spec ? spec.accent : "#46d3e8"));
    TOAST.innerHTML =
      faceHTML(ch, "calm", "on") +
      '<div class="tx"><div class="nm">' + esc(ch.name) + " · " + esc(ch.role) + "</div>" +
      '<div class="sy">' + rich(text) + "</div></div>";
    TOAST.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { TOAST.classList.remove("on"); }, ms || 5200);
  }

  /* ==========================================================
     12 · 今日值守（城市页 / 地图页）
     ========================================================== */
  /* 轮值表：按北京时间分四班。名字与颜色在此登记，
     完整立绘仍由各馆文件提供——城市页只放小徽章，不加载五个馆的立绘。 */
  var MINI = {
    shen: { hall: "H2", nm: "沈砚", role: "首席证物官", color: "#a887ff", mono: "砚" },
    qi:   { hall: "H2", nm: "祁野", role: "现场探员",   color: "#a887ff", mono: "野" },
    bai:  { hall: "H3", nm: "白珩", role: "指标员",     color: "#f2a63c", mono: "珩" },
    tao:  { hall: "H3", nm: "陶叔", role: "老技师",     color: "#f2a63c", mono: "陶" },
    cen:  { hall: "H4", nm: "岑默", role: "净化工程师", color: "#35cfa8", mono: "岑" },
    luo:  { hall: "H4", nm: "罗姐", role: "产能主管",   color: "#35cfa8", mono: "罗" },
    wen:  { hall: "H5", nm: "温野", role: "育种师",     color: "#ef6a72", mono: "温" },
    sang: { hall: "H5", nm: "阿桑", role: "抢救组",     color: "#ef6a72", mono: "桑" },
    lu:   { hall: "H6", nm: "陆准", role: "配额官",     color: "#6d9bff", mono: "陆" },
    man:  { hall: "H6", nm: "小满", role: "攀爬者",     color: "#6d9bff", mono: "满" }
  };

  var SHIFTS = [
    { from: 6,  to: 12, name: "早班", ids: ["qi", "luo", "man"] },
    { from: 12, to: 18, name: "午班", ids: ["bai", "sang", "shen"] },
    { from: 18, to: 24, name: "夜班", ids: ["cen", "wen", "lu"] },
    { from: 0,  to: 6,  name: "守夜", ids: ["tao"] }
  ];

  function roster() {
    /* 城市页写的是「北京时间」，那就必须真的按东八区算，
       不能拿本机 local hour 糊过去 —— 用户在别的时区打开会错班。 */
    var now = new Date();
    var bj = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    var h = bj.getHours(), mi = bj.getMinutes();
    var sh = SHIFTS[0];
    for (var i = 0; i < SHIFTS.length; i++) {
      if (h >= SHIFTS[i].from && h < SHIFTS[i].to) { sh = SHIFTS[i]; break; }
    }
    var leftMin = (sh.to - h) * 60 - mi;
    if (leftMin < 0) leftMin += 1440;
    return {
      hour: h, minute: mi, shift: sh.name,
      until: leftMin,
      clock: (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi,
      people: sh.ids.map(function (id) {
        var m = MINI[id] || {};
        return {
          id: id, hall: m.hall, name: m.nm, role: m.role,
          color: m.color, mono: m.mono,
          bond: bondOf(id), tier: tierOf(id).cn
        };
      })
    };
  }

  function miniBadge(p, size) {
    var s = size || 30;
    return '<span class="cst-mbadge" style="width:' + s + "px;height:" + s + "px;border-radius:" + Math.round(s / 3.6) +
      "px;background:linear-gradient(150deg," + p.color + "33," + p.color + "0d);border:1px solid " + p.color +
      '66;display:inline-grid;place-items:center;font-size:' + Math.round(s * .44) + "px;font-weight:800;color:" +
      p.color + ';flex:none;font-family:var(--mono,monospace)">' + esc(p.mono || "·") + "</span>";
  }

  /* ==========================================================
     13 · 导出
     ========================================================== */
  return {
    version: VERSION,
    register: register,
    specOf: specOf,
    svg: svg,
    state: function () { return S; },
    bondOf: bondOf,
    tierOf: function (id) { return tierOf(id).cn; },
    addBond: addBond,
    say: say,
    dispatch: dispatch,
    openPanel: openPanel,
    openCard: openCard,
    openCamp: openCamp,
    openClash: openClash,
    chooseCamp: chooseCamp,
    mount: mount,
    roster: roster,
    miniBadge: miniBadge,
    MINI: MINI,
    unlockedOral: unlockedOral,
    faceHTML: faceHTML,
    /* 让游戏内核自己报事件 */
    emit: function (hall, ev, data) { dispatch(hall, ev, data); }
  };
})();

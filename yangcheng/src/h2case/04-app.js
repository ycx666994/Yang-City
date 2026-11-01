(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var D = window.YCCASE;

  if (!D) {
    console.error("[案卷 0117] 剧本数据未加载");
    return;
  }

  /* ======================================================================
     状态
     ----------------------------------------------------------------------
     不做本地存档。剧本杀的中断恢复会毁掉「一次读完」的节奏，
     而且恢复出来的半截状态很容易和当前版本对不上。
     想重来就刷新，成本比「存档坏了」低。
     ====================================================================== */
  var AP_MAX = 8, SUM_MAX = 4;
  var st = {
    act: 1,
    scriptIdx: 0,
    ap: AP_MAX,
    taken: [],          /* 已调阅的地点 id */
    clues: [],          /* 已收入卷宗的线索 id */
    sum: SUM_MAX,
    used: [],           /* 已传唤的角色 id */
    cur: null,          /* 当前在审讯室里的角色 id */
    asked: {},          /* castId -> [已问的题号] */
    broke: {},          /* castId -> {题号: true} */
    tl: [],             /* 当前时间线顺序 */
    tlTry: 0,
    tlOk: false,
    v: { q1: null, q2: null, q3: null, self: null },
    done: false
  };

  function toast(t) {
    var el = $("#c3toast");
    if (!el) return;
    el.textContent = t;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, 2400);
  }
  function clueById(id) {
    for (var i = 0; i < D.places.length; i++) {
      if (D.places[i].clue && D.places[i].clue.id === id) return D.places[i].clue;
    }
    return null;
  }
  function castById(id) {
    for (var i = 0; i < D.cast.length; i++) if (D.cast[i].id === id) return D.cast[i];
    return null;
  }

  /* ======================================================================
     顶栏读数
     ====================================================================== */
  function paintRes() {
    var a = $("#apN"), s = $("#sumN");
    if (a) {
      a.textContent = st.ap;
      a.parentNode.classList.toggle("low", st.ap <= 2);
    }
    if (s) {
      s.textContent = st.sum;
      s.parentNode.classList.toggle("low", st.sum <= 1);
    }
    var w = $("#wallN");
    if (w) w.textContent = st.clues.length + " 份";
  }

  /* ======================================================================
     线索墙
     ====================================================================== */
  function paintWall() {
    var box = $("#wallBody"), none = $("#wallNone");
    if (!box) return;
    if (!st.clues.length) {
      box.innerHTML = '<div class="c3wnone">还没有调阅任何材料。<br>线索会在这里累积。</div>';
      return;
    }
    box.innerHTML = st.clues.map(function (id) {
      var c = clueById(id);
      if (!c) return "";
      var tagCls = c.tag === "核心" ? "core" : (c.tag === "根因" ? "root" : "");
      var src = "";
      for (var i = 0; i < D.places.length; i++) {
        if (D.places[i].clue && D.places[i].clue.id === id) { src = D.places[i].name; break; }
      }
      return '<div class="c3cl" data-clue="' + id + '">' +
        '<span class="tg ' + tagCls + '">' + c.tag + '</span>' +
        '<b>' + c.t + '</b>' +
        '<span class="src">' + src + '</span>' +
        '</div>';
    }).join("");
    [].forEach.call(box.querySelectorAll("[data-clue]"), function (el) {
      el.addEventListener("click", function () { openClue(el.dataset.clue, true); });
    });
  }

  /* ======================================================================
     线索详情
     ====================================================================== */
  var clueCtx = null;   /* { id, fromPlace } */
  function openClue(id, readOnly) {
    var c = clueById(id);
    if (!c) return;
    clueCtx = { id: id, fromPlace: readOnly ? null : id };
    $("#clueTag").textContent = c.tag;
    $("#clueTtl").textContent = c.t;
    $("#clueBody").textContent = c.body;
    var keep = $("#clueKeep"), hint = $("#clueHint");
    if (readOnly) {
      keep.textContent = "关闭";
      keep.className = "c3btn ghost";
      hint.textContent = "已收入卷宗。";
    } else {
      keep.textContent = "收入卷宗";
      keep.className = "c3btn";
      hint.textContent = "签字后不可撤回。";
    }
    $("#clueModal").classList.add("on");
  }
  function closeClue() { $("#clueModal").classList.remove("on"); }

  $("#clueClose").addEventListener("click", closeClue);
  $("#clueModal").addEventListener("click", function (e) {
    if (e.target === this) closeClue();
  });
  $("#clueKeep").addEventListener("click", function () {
    if (clueCtx && clueCtx.fromPlace) {
      var pid = clueCtx.fromPlace;
      if (st.clues.indexOf(pid) < 0) st.clues.push(pid);
      paintWall(); paintRes();
      toast("已收入卷宗：" + (clueById(pid) || {}).t);
    }
    closeClue();
  });

  /* ======================================================================
     幕一 · 剧本
     ====================================================================== */
  var SCRIPT_ACTS = [0, 1];   /* 幕一只放前两段；后两段在进幕三、幕四时插入 */
  var scriptDone = false;

  function renderScript() {
    var a = D.me.acts[SCRIPT_ACTS[st.scriptIdx]];
    if (!a) { endScript(); return; }
    $("#actH").textContent = a.h;
    var box = $("#scriptBox");
    box.innerHTML = a.p.map(function (t, i) {
      return '<p style="animation-delay:' + (i * 0.13) + 's">' + t + '</p>';
    }).join("");
    $("#scriptHint").textContent = (st.scriptIdx + 1) + " / " + SCRIPT_ACTS.length;
    $("#btnScriptNext").textContent = st.scriptIdx >= SCRIPT_ACTS.length - 1 ? "合上卷宗" : "继续读";
  }

  function endScript() {
    scriptDone = true;
    $("#secretCard").hidden = false;
    $("#secretTxt").textContent = D.me.secret;
    $("#stakeTxt").textContent = D.me.stake;
    $("#btnScriptNext").textContent = "开始调阅";
    $("#btnScriptNext").dataset.phase = "go";
    $("#scriptHint").textContent = "读完这一段，就没有回头路了。";
    $("#secretCard").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  $("#btnScriptNext").addEventListener("click", function () {
    var b = $("#btnScriptNext");
    if (b.dataset.phase === "go") { gotoAct(2); return; }
    if (scriptDone) return;
    if (st.scriptIdx < SCRIPT_ACTS.length - 1) {
      st.scriptIdx++;
      renderScript();
    } else {
      endScript();
    }
  });

  /* ======================================================================
     幕二 · 搜证
     ====================================================================== */
  function paintPlaces() {
    var g = $("#placeGrid");
    g.innerHTML = D.places.map(function (p, i) {
      var taken = st.taken.indexOf(p.id) >= 0;
      var out = st.ap <= 0 && !taken;
      var cls = "c3pl" + (taken ? " taken" : (out ? " miss" : ""));
      return '<button class="' + cls + '" data-p="' + p.id + '"' + ((taken || out) ? " disabled" : "") + '>' +
        '<span class="n">' + (taken ? "已签" : ("0" + (i + 1)).slice(-2)) + '</span>' +
        '<b>' + p.name + '</b>' +
        '<span>' + p.hint + '</span>' +
        '</button>';
    }).join("");
    [].forEach.call(g.querySelectorAll("[data-p]"), function (el) {
      el.addEventListener("click", function () { takePlace(el.dataset.p); });
    });
    var btn = $("#btnAct2");
    btn.disabled = st.taken.length < 3;
    $("#act2Hint").textContent = st.taken.length < 3
      ? "至少调阅 3 份，才拿得出一个可辩护的判断。（已调阅 " + st.taken.length + " 份）"
      : "已调阅 " + st.taken.length + " 份，还剩 " + st.ap + " 次。";
  }

  function takePlace(pid) {
    if (st.taken.indexOf(pid) >= 0) return false;
    if (st.ap <= 0) { toast("调阅权限用完了。"); return false; }
    var p = null;
    for (var i = 0; i < D.places.length; i++) if (D.places[i].id === pid) p = D.places[i];
    if (!p) return false;
    st.ap--;
    st.taken.push(pid);
    paintPlaces(); paintRes();
    openClue(p.clue.id, false);
    return true;
  }

  $("#btnAct2").addEventListener("click", function () { gotoAct(3); });

  /* ======================================================================
     幕三 · 质询
     ====================================================================== */
  function paintCast() {
    var g = $("#castList");
    g.innerHTML = D.cast.map(function (c) {
      var used = st.used.indexOf(c.id) >= 0;
      var askedN = (st.asked[c.id] || []).length;
      var all = askedN >= c.qs.length;
      var cls = "c3ca" + (used ? " used" : "") + (all ? " done" : "") + (st.cur === c.id ? " on" : "");
      /* 已传唤过的人永远能点回去重看（不再消耗额度）；
         没传唤过的才受额度限制。之前把 used 也算成 disabled，
         结果正在审的那个人自己变灰了。 */
      var can = used || st.sum > 0;
      return '<button class="' + cls + '" data-c="' + c.id + '"' + (can ? "" : " disabled") + '>' +
        '<span class="st"></span>' +
        '<b>' + c.name + '</b>' +
        '<span>' + c.job + '</span>' +
        '</button>';
    }).join("");
    [].forEach.call(g.querySelectorAll("[data-c]"), function (el) {
      el.addEventListener("click", function () { summon(el.dataset.c); });
    });
  }

  function summon(cid) {
    if (st.used.indexOf(cid) >= 0) { openRoom(cid); return; }
    if (st.sum <= 0) { toast("传唤次数用完了。"); return; }
    st.sum--;
    st.used.push(cid);
    st.asked[cid] = st.asked[cid] || [];
    st.broke[cid] = st.broke[cid] || {};
    paintCast(); paintRes();
    openRoom(cid);
  }

  function avatarSVG(c) {
    /* 印章式头像：姓氏 + 职位。不用 emoji，也不假装是人像——
       这一页是档案室，不是漫画。 */
    var hue = { chen: 18, han: 200, zhou: 32, wu: 150, lin: 340, zhao: 220 }[c.id] || 40;
    return '<svg viewBox="0 0 54 54" width="54" height="54" aria-hidden="true">' +
      '<defs><linearGradient id="g_' + c.id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + hue + ',26%,20%)"/>' +
      '<stop offset="1" stop-color="hsl(' + hue + ',22%,11%)"/></linearGradient></defs>' +
      '<rect width="54" height="54" fill="url(#g_' + c.id + ')"/>' +
      '<rect x=".5" y=".5" width="53" height="53" fill="none" stroke="hsl(' + hue + ',30%,32%)" opacity=".6"/>' +
      '<text x="27" y="35" text-anchor="middle" font-size="24" font-family="Songti SC,serif" ' +
      'fill="hsl(' + hue + ',34%,72%)">' + c.name.charAt(0) + '</text>' +
      '<text x="27" y="47" text-anchor="middle" font-size="6.5" letter-spacing="1.4" ' +
      'fill="hsl(' + hue + ',20%,52%)" font-family="monospace">' + c.age + '</text>' +
      '</svg>';
  }

  function openRoom(cid) {
    st.cur = cid;
    var c = castById(cid);
    var asked = st.asked[cid] || [];
    var broke = st.broke[cid] || {};
    var room = $("#room");

    var dlg = "";
    asked.forEach(function (qi) {
      var q = c.qs[qi];
      if (!q) return;
      var isBroken = !!broke[qi];
      var text = isBroken ? q.after : q.a;
      dlg += '<div class="c3qa' + (isBroken ? " broke" : "") + '">' +
        '<div class="q">' + q.q + '</div>' +
        '<div class="a">' + text + '</div>' +
        (isBroken ? '<div class="brk">' + (clueById(q.ev) || {}).t + ' 推翻了他刚才的说法。</div>' : '') +
        '</div>';
    });

    var qs = c.qs.map(function (q, i) {
      var done = asked.indexOf(i) >= 0;
      var isLie = q.lie;
      var isBroken = !!broke[i];
      var cls = "c3q" + (done ? " asked" : "") + (done && isLie && !isBroken ? " lied" : "");
      var label = done ? (isBroken ? "已驳倒" : "已问过") : "问";
      return '<button class="' + cls + '" data-q="' + i + '"' + (done ? " disabled" : "") + '>' +
        '<span class="dot"></span>' + q.q +
        '<span style="float:right;font-family:var(--c3-mono);font-size:9px;color:var(--c3-tx3)">' + label + '</span>' +
        '</button>';
    }).join("");

    /* 有未驳倒的谎 → 给出「出示证据」入口 */
    var canEv = false;
    asked.forEach(function (qi) {
      var q = c.qs[qi];
      if (q && q.lie && q.ev && !broke[qi]) canEv = true;
    });

    room.innerHTML =
      '<div class="c3card">' +
      '<div class="c3who">' +
      '<div class="av">' + avatarSVG(c) + '</div>' +
      '<div class="info">' +
      '<div class="nm"><b>' + c.name + '</b><i>' + c.age + ' 岁</i></div>' +
      '<div class="jb">' + c.job + '</div>' +
      '<div class="lk">' + c.look + '</div>' +
      '</div></div>' +
      (dlg ? '<div class="c3dlg">' + dlg + '</div>' : '') +
      '<div class="c3qs">' + qs + '</div>' +
      (canEv ? '<div><button class="c3evbtn" id="btnEv">他刚才说的，和你手里的材料对不上 → 出示</button></div>' : '') +
      '<div class="c3foot">' +
      '<button class="c3btn ghost" id="btnLeave">让他走</button>' +
      '<span class="hint">还剩 ' + st.sum + ' 次传唤。</span>' +
      '</div></div>';

    [].forEach.call(room.querySelectorAll("[data-q]"), function (el) {
      el.addEventListener("click", function () { askQ(cid, +el.dataset.q); });
    });
    var ev = $("#btnEv");
    if (ev) ev.addEventListener("click", openEv);
    var lv = $("#btnLeave");
    if (lv) lv.addEventListener("click", function () {
      st.cur = null;
      $("#room").innerHTML = '<div class="c3empty"><b>他走了</b><span>你可以再传唤一个人。传唤一次，就少一次。</span></div>';
      paintCast();
    });
    paintCast();
  }

  function askQ(cid, qi) {
    var c = castById(cid);
    if (!c || !c.qs[qi]) return;
    st.asked[cid] = st.asked[cid] || [];
    if (st.asked[cid].indexOf(qi) < 0) st.asked[cid].push(qi);
    openRoom(cid);
  }

  /* ---- 出示证据 ---- */
  function openEv() {
    var c = castById(st.cur);
    if (!c) return;
    var list = $("#evList");
    if (!st.clues.length) {
      list.innerHTML = '<div class="c3wnone" style="grid-column:1/-1">卷宗里还没有材料。先去搜证。</div>';
    } else {
      list.innerHTML = st.clues.map(function (id) {
        var cl = clueById(id);
        return '<button class="c3ev" data-ev="' + id + '"><b>' + cl.t + '</b><span>' + cl.tag + '</span></button>';
      }).join("");
      [].forEach.call(list.querySelectorAll("[data-ev]"), function (el) {
        el.addEventListener("click", function () { showEv(el.dataset.ev); });
      });
    }
    $("#evHint").textContent = "选错了，他会知道你在试探——但不会说破。";
    $("#evModal").classList.add("on");
  }
  function showEv(clueId) {
    var c = castById(st.cur);
    if (!c) return;
    var hit = -1;
    (st.asked[c.id] || []).forEach(function (qi) {
      var q = c.qs[qi];
      if (q && q.lie && q.ev === clueId && !(st.broke[c.id] || {})[qi]) hit = qi;
    });
    $("#evModal").classList.remove("on");
    if (hit < 0) {
      toast("他看了一眼，说「这个我看过了」。——不是这份。");
      return;
    }
    st.broke[c.id] = st.broke[c.id] || {};
    st.broke[c.id][hit] = true;
    toast("他的说法变了。");
    openRoom(c.id);
  }
  $("#evClose").addEventListener("click", function () { $("#evModal").classList.remove("on"); });
  $("#evModal").addEventListener("click", function (e) { if (e.target === this) this.classList.remove("on"); });

  /* ======================================================================
     幕四 · 时间线
     ====================================================================== */
  function initTimeline() {
    /* 初始顺序刻意打乱：不洗牌的话第一项就是答案，玩家不用动脑 */
    var ids = D.timeline.cards.map(function (c) { return c.id; });
    var seed = 20261031;
    var rnd = function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    /* 保证不是「已经排对」——那样玩家会觉得这关没意义 */
    if (ids.join() === D.timeline.key.join()) ids.reverse();
    st.tl = ids;
  }
  function tlCard(id) {
    for (var i = 0; i < D.timeline.cards.length; i++) if (D.timeline.cards[i].id === id) return D.timeline.cards[i];
    return null;
  }
  function paintTl() {
    var box = $("#tlList");
    box.innerHTML = st.tl.map(function (id, i) {
      var c = tlCard(id);
      if (!c) return "";
      var cls = "c3tc";
      if (st.tlOk) cls += " ok";
      return '<div class="' + cls + '" draggable="true" data-i="' + i + '">' +
        '<span class="no">' + (i + 1) + '</span>' +
        '<div class="tx"><b>' + c.text + '</b><span>' + c.note + '</span></div>' +
        '<div class="mv">' +
        '<button data-mv="up" data-i="' + i + '" aria-label="上移"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
        '<button data-mv="dn" data-i="' + i + '" aria-label="下移"' + (i === st.tl.length - 1 ? " disabled" : "") + '>↓</button>' +
        '</div></div>';
    }).join("");

    [].forEach.call(box.querySelectorAll("[data-mv]"), function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var i = +b.dataset.i;
        if (b.dataset.mv === "up" && i > 0) swapTl(i, i - 1);
        else if (b.dataset.mv === "dn" && i < st.tl.length - 1) swapTl(i, i + 1);
      });
    });

    /* 拖拽（鼠标）。触屏用 ↑↓ 按钮，不用模拟拖拽。 */
    var dragI = -1;
    [].forEach.call(box.querySelectorAll(".c3tc"), function (el) {
      el.addEventListener("dragstart", function (e) {
        dragI = +el.dataset.i;
        el.classList.add("drag");
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(dragI)); } catch (x) { }
      });
      el.addEventListener("dragend", function () { el.classList.remove("drag"); });
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        el.classList.add("over");
      });
      el.addEventListener("dragleave", function () { el.classList.remove("over"); });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        el.classList.remove("over");
        var to = +el.dataset.i;
        if (dragI < 0 || dragI === to) return;
        var moved = st.tl.splice(dragI, 1)[0];
        st.tl.splice(to, 0, moved);
        dragI = -1;
        paintTl();
      });
    });
  }
  function swapTl(a, b) {
    var t = st.tl[a]; st.tl[a] = st.tl[b]; st.tl[b] = t;
    paintTl();
  }

  function submitTl() {
    if (st.tlOk) return;
    var wrong = 0;
    for (var i = 0; i < D.timeline.key.length; i++) {
      if (st.tl[i] !== D.timeline.key[i]) wrong++;
    }
    st.tlTry++;
    if (wrong === 0) {
      st.tlOk = true;
      paintTl();
      $("#tlHint").textContent = "排对了。十一天，一张不差。";
      $("#btnTl").disabled = true;
      $("#tlTry").textContent = "已还原";
      toast("时间线还原成功。");
      return;
    }
    var left = D.timeline.tries - st.tlTry;
    if (left <= 0) {
      /* 机会用完：直接把正确答案亮出来，但不算还原成功 */
      st.tl = D.timeline.key.slice();
      paintTl();
      [].forEach.call($("#tlList").querySelectorAll(".c3tc"), function (el) { el.classList.add("bad"); });
      $("#btnTl").disabled = true;
      $("#tlHint").textContent = "三次都用完了。这是正确顺序——但你没有自己排出来。";
      $("#tlTry").textContent = "机会已用完";
      toast("时间线未还原。");
      return;
    }
    $("#tlHint").textContent = "有 " + wrong + " 个位置不对。还剩 " + left + " 次。";
    $("#tlTry").textContent = "还剩 " + left + " 次";
    toast(wrong + " 个位置不对。");
  }
  $("#btnTl").addEventListener("click", submitTl);

  /* ======================================================================
     幕五 · 指认
     ====================================================================== */
  function paintVerdict() {
    var box = $("#vForm");
    var qs = [
      { k: "q1", d: D.verdict.q1, en: "WHO" },
      { k: "q2", d: D.verdict.q2, en: "HOW" },
      { k: "q3", d: D.verdict.q3, en: "WHY" },
      { k: "self", d: { q: D.verdict.self.q, opts: D.verdict.self.opts }, en: "YOU" }
    ];
    box.innerHTML = qs.map(function (o) {
      return '<div class="c3fld">' +
        '<div class="qq">' + o.d.q + '<em>' + o.en + '</em></div>' +
        '<div class="c3opts">' +
        o.d.opts.map(function (p) {
          return '<button class="c3opt' + (st.v[o.k] === p.k ? " on" : "") + '" data-k="' + o.k + '" data-o="' + p.k + '">' + p.t + '</button>';
        }).join("") +
        '</div></div>';
    }).join("");
    [].forEach.call(box.querySelectorAll("[data-k]"), function (b) {
      b.addEventListener("click", function () {
        st.v[b.dataset.k] = b.dataset.o;
        paintVerdict();
      });
    });
    var ok = st.v.q1 && st.v.q2 && st.v.q3 && st.v.self;
    $("#btnVerdict").disabled = !ok;
    $("#vHint").textContent = ok ? "四项都填了。提交后不可修改。" : "四项都要选（包括最后那个关于你自己的）。";
  }

  function submitVerdict() {
    if (st.done) return;
    if (!(st.v.q1 && st.v.q2 && st.v.q3 && st.v.self)) return;
    st.done = true;

    var V = D.verdict;
    var r1 = st.v.q1 === V.q1.right;
    var r2 = st.v.q2 === V.q2.right;
    var r3 = st.v.q3 === V.q3.right;

    /* 关键线索：权重表、标注规范、例会纪要、变更邮件 */
    var KEY = ["p2", "p3", "p6", "p12"];
    var keyHit = KEY.filter(function (k) { return st.clues.indexOf(k) >= 0; }).length;

    /* 驳倒的谎 */
    var brokeN = 0, lieTotal = 0;
    D.cast.forEach(function (c) {
      c.qs.forEach(function (q, i) {
        if (!q.lie) return;
        lieTotal++;
        if ((st.broke[c.id] || {})[i]) brokeN++;
      });
    });

    var score = 0;
    score += keyHit * 5;                                  /* 20 */
    score += Math.min(20, brokeN * 4);                    /* 20 */
    score += st.tlOk ? (st.tlTry === 1 ? 25 : (st.tlTry === 2 ? 18 : 12)) : 0;
    score += (r1 ? 12 : 0) + (r2 ? 12 : 0) + (r3 ? 12 : 0);   /* 36 */
    score = Math.min(100, score);

    var win = r1 && r2 && r3 && st.tlOk;

    var H = [];
    H.push('<div class="c3res-box' + (win ? " win" : "") + '">');
    H.push('<h3>' + (win ? "伪证成立 · 精英证书已签发" : "结论未成立 · 不予出证") + '</h3>');
    H.push('<p>' + (win
      ? "你把那句话拆开了：<b>「因为紧急度为 2，所以判为低优先级」</b>。前半句是真的，后半句也是真的——但它们不是因果关系。紧急度之所以是 2，是因为 9 月 12 日有人把胸痛特征的权重从 0.31 压到了 0.04。"
      : "你的结论里还有至少一处站不住。不是「说得不够漂亮」，是<b>它会被反驳</b>——而一份会被反驳的审计报告，等于没有报告。") + '</p>');
    H.push('<div class="c3score">' +
      '<span>总分<b class="' + (win ? "ok" : "") + '">' + score + '</b></span>' +
      '<span>关键材料<b>' + keyHit + ' / 4</b></span>' +
      '<span>驳倒证词<b>' + brokeN + ' / ' + lieTotal + '</b></span>' +
      '<span>时间线<b class="' + (st.tlOk ? "ok" : "no") + '">' + (st.tlOk ? "已还原" : "未还原") + '</b></span>' +
      '<span>指认<b>' + (r1 ? 1 : 0) + (r2 ? 1 : 0) + (r3 ? 1 : 0) + ' / 3</b></span>' +
      '</div>');

    /* 逐条判词 */
    H.push('<div class="c3rev"><h4>判词</h4>');
    [["q1", V.q1, r1, "谁该负责"], ["q2", V.q2, r2, "手法"], ["q3", V.q3, r3, "动机"]].forEach(function (t) {
      var d = t[1], ok = t[2];
      var pick = null;
      d.opts.forEach(function (o) { if (o.k === st.v[t[0]]) pick = o; });
      H.push('<p class="' + (ok ? "hit" : "miss") + '"><b>' + t[3] + (ok ? " · 成立" : " · 不成立") + '</b>　' +
        (pick ? pick.why : "") + '</p>');
    });
    H.push('</div>');

    /* 真相复盘 */
    H.push('<div class="c3rev"><h4>复盘 · 那句话是伪证</h4>');
    D.truth.forEach(function (t) {
      H.push('<p>' + t + '</p>');
    });
    H.push('</div>');

    /* 你自己的选择 */
    var selfPick = null;
    V.self.opts.forEach(function (o) { if (o.k === st.v.self) selfPick = o; });
    if (selfPick) {
      H.push('<div class="c3rev"><h4>关于你 · 沈砚</h4>' +
        '<p class="hit">' + selfPick.why + '</p></div>');
    }

    /* 漏掉的线索 */
    var missed = D.places.filter(function (p) { return st.clues.indexOf(p.id) < 0; });
    if (missed.length) {
      H.push('<div class="c3rev"><h4>你没调阅的 ' + missed.length + ' 份</h4>' +
        '<p class="miss">' + missed.map(function (p) { return p.name; }).join("　·　") + '</p>' +
        '<p class="miss" style="border-left-color:var(--c3-line2)">它们不一定是错的答案，但你没看过，就没法在报告里引用。</p></div>');
    }

    /* 证书 */
    if (win) {
      var cert = null;
      try {
        window.YCDeep.register("H2", { name: "推理法医馆" });
        cert = window.YCDeep.issueCert("H2", "elite", {
          holder: "沈砚",
          play: "案卷 0117 · 十一日",
          score: score,
          detail: [
            "还原 10 月 17 日至 28 日的完整时间线（" + st.tlTry + " 次内完成）",
            "驳倒 " + brokeN + " 处伪证，调阅 " + st.clues.length + " / " + D.places.length + " 份材料",
            "指认：周正 · 调低胸痛特征权重 · 压低误报率考核",
            "结论：日志所述为真，但「紧急度为 2」是被制造出来的"
          ]
        });
      } catch (e) { }
      H.push('<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">');
      if (cert) {
        H.push('<button class="c3btn" id="btnCert">下载精英证书</button>');
        H.push('<span style="font-family:var(--c3-mono);font-size:10px;color:var(--c3-tx3);align-self:center">' + cert.no + '</span>');
      }
      H.push('<button class="c3btn ghost" id="btnAgain">重新复盘</button>');
      H.push('<a class="c3btn ghost" href="h2-forensic.html" style="text-decoration:none;display:inline-block">回法医馆</a>');
      H.push('</div>');
      if (cert) H.push('<div style="margin-top:14px;overflow:auto;border:1px solid var(--c3-line2);border-radius:8px">' +
        window.YCDeep.certSVG(cert, { accent: "#c9a227", paper: "#0f0c09", ink: "#e9dfc9" }) + '</div>');
    } else {
      H.push('<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">' +
        '<button class="c3btn ghost" id="btnAgain">重新复盘</button>' +
        '<a class="c3btn ghost" href="h2-forensic.html" style="text-decoration:none;display:inline-block">回法医馆</a></div>');
    }
    H.push('</div>');
    $("#resultBox").innerHTML = H.join("");

    var bc = $("#btnCert");
    if (bc) bc.addEventListener("click", function () {
      var c = window.YCDeep.getCert("H2", "elite");
      if (c) window.YCDeep.download(c, { accent: "#c9a227", paper: "#0f0c09", ink: "#e9dfc9" });
    });
    var ba = $("#btnAgain");
    if (ba) ba.addEventListener("click", function () { location.reload(); });

    $("#resultBox").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  $("#btnVerdict").addEventListener("click", submitVerdict);

  /* ======================================================================
     幕间切换
     ====================================================================== */
  function gotoAct(n) {
    if (n < 1 || n > 5) return;
    st.act = n;
    $$(".c3lay").forEach(function (el) {
      el.classList.toggle("on", +el.dataset.a === n);
    });
    $$("#acts button").forEach(function (b) {
      var a = +b.dataset.a;
      b.classList.toggle("on", a === n);
      if (a <= n) b.disabled = false;
      b.classList.toggle("done", a < n);
    });
    if (n === 2) paintPlaces();
    if (n === 3) { paintCast(); openActPreamble(2); }
    if (n === 4) { if (!st.tl.length) initTimeline(); paintTl(); openActPreamble(3); }
    if (n === 5) paintVerdict();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* 幕三 / 幕四开头插入一段独白，保持剧本杀的「幕间」节奏 */
  function openActPreamble(idx) {
    var a = D.me.acts[idx];
    if (!a) return;
    var host = $('.c3lay[data-a="' + (idx + 1) + '"]');
    if (!host || host.querySelector(".c3preamble")) return;
    var card = document.createElement("div");
    card.className = "c3card c3preamble";
    card.innerHTML = '<div class="c3h"><h3>' + a.h + '</h3><span class="k">INTERLUDE</span></div>' +
      '<div class="c3script">' + a.p.map(function (t, i) {
        return '<p style="animation-delay:' + (i * 0.12) + 's">' + t + '</p>';
      }).join("") + '</div>';
    host.insertBefore(card, host.firstChild);
  }

  $$("#acts button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.disabled) return;
      gotoAct(+b.dataset.a);
    });
  });

  /* ======================================================================
     线索墙折叠（窄屏尤其需要）
     ====================================================================== */
  /* 线索墙折叠。窄屏时它是页内一块（不再 fixed），所以不需要自动折叠 ——
     折叠只留给用户自己想收起来的时候。 */
  $("#wallToggle").addEventListener("click", function () {
    var w = $("#wall");
    var fold = w.classList.toggle("fold");
    this.textContent = fold ? "›" : "‹";
  });

  /* ======================================================================
     初始化
     ====================================================================== */
  $("#meName").textContent = D.me.name;
  $("#meRole").textContent = D.me.role;
  $("#tlIntro").textContent = D.timeline.intro;
  renderScript();
  paintRes(); paintWall();

  /* ======================================================================
     体检钩子（只读 + 定位，不给「直接通关」的能力）
     ====================================================================== */
  window.YCCase = {
    status: function () {
      return {
        act: st.act, ap: st.ap, sum: st.sum,
        taken: st.taken.slice(), clues: st.clues.slice(),
        used: st.used.slice(), cur: st.cur,
        asked: JSON.parse(JSON.stringify(st.asked)),
        broke: JSON.parse(JSON.stringify(st.broke)),
        tl: st.tl.slice(), tlTry: st.tlTry, tlOk: st.tlOk,
        v: JSON.parse(JSON.stringify(st.v)),
        done: st.done,
        scriptDone: scriptDone,
        lieTotal: D.cast.reduce(function (a, c) { return a + c.qs.filter(function (q) { return q.lie; }).length; }, 0),
        clueTotal: D.places.length
      };
    },
    gotoAct: function (n) { gotoAct(n); return st.act; },
    /* 幕一：读完全部剧本并显示秘密 */
    finishScript: function () {
      st.scriptIdx = SCRIPT_ACTS.length - 1;
      renderScript();
      endScript();
      return scriptDone;
    },
    takePlace: function (id) { return takePlace(id); },
    summon: function (id) { summon(id); return st.cur; },
    ask: function (cid, qi) { askQ(cid, qi); return (st.asked[cid] || []).length; },
    /* 出示证据：返回 'broke' | 'miss' */
    presentEv: function (clueId) {
      var before = JSON.stringify(st.broke);
      showEv(clueId);
      return before === JSON.stringify(st.broke) ? "miss" : "broke";
    },
    setTimeline: function (ids) {
      if (!Array.isArray(ids) || ids.length !== D.timeline.key.length) return false;
      st.tl = ids.slice();
      paintTl();
      return true;
    },
    submitTimeline: function () {
      submitTl();
      return { ok: st.tlOk, wrong: st.tl.filter(function (id, i) { return id !== D.timeline.key[i]; }).length, tries: st.tlTry };
    },
    choose: function (k, o) { st.v[k] = o; paintVerdict(); return st.v[k]; },
    submit: function () { submitVerdict(); return { done: st.done }; },
    /* 体检用：把某个角色的三个问题一次问完 */
    askAll: function (cid) {
      var c = castById(cid);
      if (!c) return false;
      for (var i = 0; i < c.qs.length; i++) askQ(cid, i);
      return true;
    },
    keyOrder: function () { return D.timeline.key.slice(); },
    answers: function () {
      return { q1: D.verdict.q1.right, q2: D.verdict.q2.right, q3: D.verdict.q3.right };
    }
  };
})();

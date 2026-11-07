/* 博物馆页面层：可选单导游、自由参观、馆内导航与原仪器内嵌。 */
(function () {
  "use strict";
  var cfg = window.YCMUSEUM;
  if (!cfg) return;
  var $ = function (id) { return document.getElementById(id); };
  var stage, engine, picked = null, introTimer = null;
  var listeners = [], disposed = false, instrumentKey = null;
  function listen(target, type, fn) {
    target.addEventListener(type, fn); listeners.push([target, type, fn]);
  }
  function clearIntro() { if (introTimer !== null) clearTimeout(introTimer); introTimer = null; }
  function hidden(el, value) { if (el) el.hidden = value; }
  function say(text) {
    $("muSub").classList.add("on");
    $("muWho").textContent = picked ? picked.name + " · " + picked.title : "展厅说明";
    $("muText").textContent = text;
  }
  function clearSpeech() { clearIntro(); $("muSub").classList.remove("on"); }

  function boot() {
    var canvas = $("mCv"), bootEl = $("muBoot");
    function step(p, text) { $("muBar").style.width = p + "%"; $("muLog").textContent = text; }
    step(10, "正在开启馆门");
    if (!window.YC3D || !window.YC3D_MUSEUM || !window.YC3D_P ||
        !window.YC3D_B || typeof YC3D_B.character !== "function" || typeof YC3D_B.cloneCharacter !== "function") {
      step(0, "人物资产接口尚未就绪，请完成 character / cloneCharacter 集成后再开馆。");
      return;
    }
    stage = new YC3D.Stage({ canvas: canvas, bloom: 0.12, aber: 0, vig: 0, grain: 0, scan: 0,
      thresh: 1.4, maxDPR: 1.5, exposure: 0.8 });
    stage.renderer.useLegacyLights = false;
    if (stage.failed) { step(0, "当前设备无法开启3D，请使用支持WebGL的浏览器。"); return; }
    step(35, "正在布置实体展厅");
    engine = new YC3D_MUSEUM.Engine({ stage: stage, canvas: canvas, cfg: cfg, fog: 0.002 });
    function fit() { engine.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); stage.resize(); }
    listen(window, "resize", fit); fit();

    /* 使用DOM文本填充，角色名和房间名不拼接HTML。 */
    var cards = $("muGuideCards");
    cfg.guides.forEach(function (gd) {
      var b = document.createElement("button"); b.type = "button"; b.className = "gcard";
      b.dataset.g = gd.id; b.style.setProperty("--c", "#" + gd.color.toString(16).padStart(6, "0"));
      b.setAttribute("aria-pressed", "false");
      [["b", gd.name], ["i", gd.title], ["em", gd.stance]].forEach(function (part) {
        var el = document.createElement(part[0]); el.textContent = part[1]; b.appendChild(el);
      });
      cards.appendChild(b);
    });
    cfg.rooms.forEach(function (room) {
      var option = document.createElement("option"); option.value = room.id; option.textContent = room.name;
      $("muRoomSelect").appendChild(option);
    });
    function sync() {
      var tr = engine.tour, lobby = engine.cur && engine.cur.def.id === "lobby";
      $("muMode").textContent = tr ? (tr.paused ? "讲解已暂停" : "跟随 " + picked.name) : picked ? "已选 " + picked.name : "自由参观";
      $("muPause").disabled = !tr;
      $("muPause").textContent = tr && tr.paused ? "继续讲解" : "暂停讲解";
      $("muPause").setAttribute("aria-pressed", String(!!(tr && tr.paused)));
      $("muNext").disabled = !tr;
      hidden($("muNext"), !tr); hidden($("muProg"), !tr);
      $("muReplay").disabled = !picked || lobby;
      $("muBack").disabled = lobby;
      $("muStart").disabled = !picked;
      if (picked) $("muStartName").textContent = picked.name;
      cards.querySelectorAll(".gcard").forEach(function (c) {
        var selected = !!picked && c.dataset.g === picked.id;
        c.classList.toggle("on", selected); c.setAttribute("aria-pressed", String(selected));
      });
      if (tr) $("muProgN").textContent = (tr.i + 1) + " / " + tr.stops.length;
    }
    function choosePanel(show) {
      hidden($("muGuides"), !show); engine.resetInput();
      if (show && engine.tour) engine.pause(true);
    }
    function pickGuide(id) {
      var gd = cfg.guides.filter(function (item) { return item.id === id; })[0];
      if (!gd || disposed) return;
      clearSpeech(); engine.free(); picked = gd;
      /* 始终从大厅原模型安全克隆，绝不直接clone(true)骨骼。 */
      var source = null;
      engine.rooms.lobby.group.traverse(function (obj) {
        if (obj.userData.guide && obj.userData.guide.id === id) source = obj.userData.fig;
      });
      if (source) engine.attachGuide({ fig: YC3D_B.cloneCharacter(source), def: gd });
      say(gd.intro[0]);
      introTimer = setTimeout(function () {
        introTimer = null;
        if (!disposed && picked === gd && !engine.tour && !document.hidden) say(gd.intro[1]);
      }, 4200);
      sync();
    }
    function freeVisit() {
      clearSpeech(); picked = null; engine.free(); engine.attachGuide(null);
      choosePanel(false); sync(); canvas.focus({ preventScroll: true });
    }
    function startTour() {
      clearSpeech(); choosePanel(false);
      if (!picked || engine.cur.def.id === "lobby") { engine.free(); sync(); return; }
      engine.play(engine.cur.def.stops || [], function () {
        sync(); say("本厅讲解结束。你可以自由走动、重新讲解，或用馆内导航进入另一展厅。");
      });
      sync(); canvas.focus({ preventScroll: true });
    }
    function closeInstrument(focus) {
      if ($("muInstrument").open) $("muInstrument").close();
      hidden($("muInstrument"), true); instrumentKey = null;
      /* 不重载iframe，保留原题目和本次计算状态。 */
      engine.locked = false; engine.resetInput(); sync();
      if (focus !== false) canvas.focus({ preventScroll: true });
    }
    function enterRoom(id) {
      if (!engine.rooms[id] || disposed) return;
      closeInstrument(false); clearSpeech(); engine.free(); engine.resetInput();
      /* 原子切换，没有滞后的过场setTimeout可把用户送回旧房间。 */
      engine.enter(id); choosePanel(false);
      if (picked && id !== "lobby") startTour();
      else { engine.tour = null; sync(); canvas.focus({ preventScroll: true }); }
    }
    function openInstrument(key) {
      var instrument = cfg.instruments[key];
      if (!instrument || !engine.cur || engine.cur.def.id !== instrument.room) return;
      clearIntro(); choosePanel(false); engine.pause(true); engine.locked = true; engine.resetInput();
      instrumentKey = key; $("muInstrumentTitle").textContent = instrument.title;
      var frames = $("muInstrumentFrames");
      frames.querySelectorAll("iframe").forEach(function (frame) { frame.hidden = frame.dataset.key !== key; });
      var frame = frames.querySelector('iframe[data-key="' + key + '"]');
      if (!frame) {
        frame = document.createElement("iframe"); frame.dataset.key = key;
        frame.title = instrument.title;
        frame.src = instrument.src + (instrument.src.indexOf("?") < 0 ? "?" : "&") + "museumEmbed=1";
        /* 同源旧业务需要脚本/存储；禁止新窗口、表单提交和顶层跳转。 */
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-pointer-lock");
        frame.setAttribute("allow", "fullscreen"); frames.appendChild(frame);
      }
      hidden($("muInstrument"), false);
      if (!$("muInstrument").open) $("muInstrument").showModal();
      $("muInstrumentClose").focus(); sync();
    }
    engine.onEnter = function (rec) {
      $("muRoom").textContent = rec.def.name; $("muRoomSelect").value = rec.def.id;
      $("muHint").textContent = rec.def.id === "lobby" ? "拖拽看穹顶；WASD移动。选一位导游或自由参观，用上方导航进入任意展厅。" : "点击实体展牌互动；WASD移动，拖拽转向。导航可换展厅，Esc回大厅。";
      var entries = $("muTools"); entries.replaceChildren();
      Object.keys(cfg.instruments).forEach(function (key) {
        var tool = cfg.instruments[key];
        if (tool.room !== rec.def.id) return;
        var button = document.createElement("button"); button.type = "button"; button.dataset.tool = key;
        button.textContent = "打开" + tool.title; entries.appendChild(button);
      });
    };
    engine.onStop = function (s) { say(s.text); sync(); };
    engine.onPause = sync; engine.onTourEnd = sync;
    listen(cards, "click", function (e) { var card = e.target.closest(".gcard"); if (card) pickGuide(card.dataset.g); });
    listen($("muStart"), "click", function () {
      if (!picked) return;
      if (engine.cur.def.id === "lobby") enterRoom("r1"); else startTour();
    });
    listen($("muFreeInitial"), "click", freeVisit); listen($("muFree"), "click", freeVisit);
    listen($("muChangeGuide"), "click", function () { choosePanel($("muGuides").hidden); });
    listen($("muPause"), "click", function () { engine.pause(); sync(); });
    listen($("muNext"), "click", function () { clearIntro(); engine.skip(); sync(); });
    listen($("muReplay"), "click", startTour);
    listen($("muRoomSelect"), "change", function (e) { enterRoom(e.target.value); });
    listen($("muBack"), "click", function () { enterRoom("lobby"); });
    listen($("muTools"), "click", function (e) { var b = e.target.closest("button"); if (b) openInstrument(b.dataset.tool); });
    listen($("muInstrumentClose"), "click", function () { closeInstrument(); });
    /* 原生模态dialog处理焦点约束；iframe键盘仍交给旧业务。 */
    listen($("muInstrument"), "cancel", function (e) { e.preventDefault(); closeInstrument(); });
    listen($("muInstrument"), "keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeInstrument(); }
    });
    function fullscreen() {
      var result = document.fullscreenElement ? document.exitFullscreen() : document.querySelector(".muwrap").requestFullscreen();
      if (result && result.catch) result.catch(function () { say("当前浏览器未允许全屏，可继续窗口参观。"); });
    }
    listen($("muFs"), "click", fullscreen);
    listen(document, "keydown", function (e) {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "Escape") {
        if (!$("muInstrument").hidden) { e.preventDefault(); closeInstrument(); }
        else if (!$("muGuides").hidden) choosePanel(false);
        else enterRoom("lobby");
      }
      if (e.key.toLowerCase() === "f" && document.activeElement === canvas) fullscreen();
    });
    listen(window, "blur", clearIntro);
    listen(document, "visibilitychange", function () { if (document.hidden) clearIntro(); });
    window.__pickGuide = pickGuide; window.__enterRoom = enterRoom;
    window.__say = say; window.__openInstrument = openInstrument;
    window.YCMU = { stage: stage, engine: engine, cfg: cfg, pick: pickGuide, free: freeVisit,
      start: function (id) { enterRoom(id || "r1"); }, pause: function () { engine.pause(); },
      room: function () { return engine.cur ? engine.cur.def.id : null; },
      pos: function () { return engine.pos.toArray(); }, tourIndex: function () { return engine.tour ? engine.tour.i : -1; },
      fps: function () { return stage.fps; } };
    engine.enter("lobby"); sync(); choosePanel(true);
    stage.start(); step(100, "已开馆 · 人物按资产加载进度显示"); bootEl.classList.add("done");
    listen(window, "pagehide", function (e) {
      clearIntro(); engine.resetInput(); engine.pause(true);
      if (e.persisted) { stage.stop(); return; }
      disposed = true; stage.stop(); engine.destroy();
      listeners.forEach(function (item) { item[0].removeEventListener(item[1], item[2]); }); listeners = [];
    });
    listen(window, "pageshow", function (e) { if (e.persisted && !disposed) { fit(); stage.start(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

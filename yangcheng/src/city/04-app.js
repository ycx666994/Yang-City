/* 虚构杨城：首页与 map.html 共用，UTC+8 时钟 / 时间演练 / 分类定位。 */
(function () {
  "use strict";
  var E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };
  var isMap = /(?:^|\/)map\.html$/i.test(location.pathname);
  /* 区域模式：district.html?zone=Dxx；带 zone 但找不到区时回落普通首页行为。 */
  var zoneId = new URLSearchParams(location.search).get("zone");
  var isDistrict = !!(zoneId && window.YC_DISTRICTS);
  var zone = isDistrict ? window.YC_DISTRICTS.find(function (d) { return d.id === zoneId; }) : null;
  if (isDistrict && !zone) isDistrict = false;
  var freeCam = isMap || isDistrict;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SEEN_KEY = "yc.mapHintSeen.v1";
  var manualHour = null, rehearsalSource = "", applyingClock = false;
  var rawTime = new URLSearchParams(location.search).get("time");
  if (rawTime !== null && /^(?:\d{1,2})(?:\.\d+)?$/.test(rawTime) && Number(rawTime) < 24) {
    manualHour = Number(rawTime); rehearsalSource = "URL";
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* 只用 UTC getter 读取平移后的时间，与浏览器所在时区无关。 */
  function beijingNow() { return new Date(Date.now() + 8 * 3600000); }
  function clockHour(d) { return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; }
  function hourLabel(h) {
    var seconds = Math.floor(((h % 24 + 24) % 24) * 3600 + 0.00001);
    return pad(Math.floor(seconds / 3600)) + ":" + pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60);
  }

  function CamRig(camera) {
    this.cam = camera;
    this.center = new THREE.Vector3(isDistrict ? zone.cx : isMap ? 0 : -20,
      isDistrict ? 40 : isMap ? 0 : 145, isDistrict ? zone.cz : isMap ? 0 : 25);
    this.targetCenter = this.center.clone();
    this.theta = this.tTheta = 0;
    this.phi = this.tPhi = isDistrict ? 0.60 : isMap ? 0.76 : 0.28;
    this.dist = this.tDist = isDistrict ? Math.max(1000, Math.min(1900, zone.r * 2.3)) : isMap ? 3800 : 1600;
    this.mx = this.my = this.tmx = this.tmy = 0;
  }
  CamRig.prototype.update = function (dt) {
    var k = reduceMotion ? 1 : 1 - Math.pow(0.001, dt);
    this.theta += (this.tTheta - this.theta) * k;
    this.phi += (this.tPhi - this.phi) * k;
    this.dist += (this.tDist - this.dist) * k;
    this.center.lerp(this.targetCenter, k);
    this.mx += (this.tmx - this.mx) * k; this.my += (this.tmy - this.my) * k;
    var x = Math.sin(this.theta) * Math.cos(this.phi) * this.dist;
    var y = Math.sin(this.phi) * this.dist;
    var z = Math.cos(this.theta) * Math.cos(this.phi) * this.dist;
    var parallax = isMap || reduceMotion ? 0 : 5;
    this.cam.position.set(this.center.x + x + this.mx * parallax, this.center.y + y, this.center.z + z);
    this.cam.lookAt(this.center);
  };
  CamRig.prototype.focus = function (o) {
    this.targetCenter.set(o.x, Math.min(o.h * 0.35, 78), o.z);
    this.tTheta = 0; this.tPhi = isDistrict ? 0.60 : isMap ? 1.13 : 0.28;
    this.tDist = isDistrict ? 460 : isMap ? 300 : 410;
    this.tmx = this.tmy = 0;
  };
  CamRig.prototype.reset = function () {
    this.targetCenter.set(isDistrict ? zone.cx : isMap ? 0 : -20,
      isDistrict ? 40 : isMap ? 0 : 145, isDistrict ? zone.cz : isMap ? 0 : 25);
    this.tTheta = 0; this.tPhi = isDistrict ? 0.60 : isMap ? 0.76 : 0.28;
    this.tDist = isDistrict ? Math.max(1000, Math.min(1900, zone.r * 2.3)) : isMap ? 3800 : 1600;
  };

  function boot() {
    var canvas = $("cityCv"), bootEl = $("cityBoot");
    var seedHour = manualHour === null ? clockHour(beijingNow()) : manualHour;
    document.body.classList.toggle("map-mode", isMap);
    document.documentElement.dataset.cityTheme = seedHour >= 6 && seedHour < 18 ? "day" : "night";
    function step(pct, msg) {
      if ($("bootBar")) $("bootBar").style.width = pct + "%";
      if ($("bootLog")) $("bootLog").textContent = msg;
    }
    function fail(msg) {
      step(100, msg);
      /* 初始化失败也不屏蔽导航和本地馆入口。 */
      if (bootEl) bootEl.classList.add("done");
      $("phaseNote").textContent = msg + "；可继续使用顶部业务入口。";
    }
    if (!window.YC3D || !window.YC3D_CITY) { fail("城市引擎未加载"); return; }
    step(8, "正在申请图形上下文");
    var stage = new YC3D.Stage({ canvas: canvas, bloom: 0.18, aber: 0, vig: 0.10, grain: 0.008, scan: 0,
      thresh: 1.40, maxDPR: 1.5, exposure: 1.02 });
    if (stage.failed) { fail("此设备不支持 WebGL"); return; }
    /* 阴影总开关只由主程序管理；场景只定义光源与投影对象。 */
    stage.renderer.shadowMap.enabled = $("shadowToggle").checked;
    stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    step(26, "正在布设太阳光、城市结构与设施");
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(isMap ? 52 : 48, 1, 0.5, 10000);
    var city = YC3D_CITY.build(scene, { hour: seedHour });
    var rig = new CamRig(camera); city.camera = camera;
    stage.setScene(scene, camera);
    if (isMap) {
      document.title = "杨城城市地图 · 六馆、" + YC3D_CITY.GIANTS.length + "家AI企业与" + YC3D_CITY.INFRA.length + "个设施";
      $("cityNodes").open = true; $("nodesTitle").textContent = "城市地图 · 分类定位";
      $("nodeFilters").hidden = false; $("mapTools").hidden = false;
      $("navMap").href = "index.html"; $("navMap").textContent = "城市首页";
      $("nodesFoot").textContent = "节点定位后可进入馆内；坐标是虚构场景单位。";
      canvas.setAttribute("aria-label", "虚构杨城俯视地图，六馆、" + YC3D_CITY.GIANTS.length + "家AI企业及" + YC3D_CITY.INFRA.length + "个设施可分类定位");
    }
    if (isDistrict) {
      document.title = "杨城 · " + zone.name + " · 三维街区";
      $("cityNodes").open = false;
      if ($("nodeFilters")) $("nodeFilters").hidden = true;
      if ($("mapTools")) $("mapTools").hidden = true;
      var dh = $("districtHud");
      if (dh) {
        if ($("dhName")) $("dhName").textContent = zone.name;
        if ($("dhEn")) $("dhEn").textContent = zone.en || "";
        if ($("dhDesc")) $("dhDesc").textContent = zone.desc || "";
        if ($("dhMuseums")) {
          $("dhMuseums").replaceChildren();
          (zone.museums || []).forEach(function (hid) {
            var hall = YC3D_CITY.HALLS.find(function (h) { return h.id === hid; });
            if (hall && hall.href) addLink($("dhMuseums"), "进入 " + hall.name + "三维大厅", hall.href);
          });
        }
        dh.hidden = false;
      }
      canvas.setAttribute("aria-label", "虚构杨城" + zone.name + "三维街区，可环绕浏览并点击建筑");
    }
    function fit() {
      camera.aspect = (canvas.clientWidth || innerWidth) / (canvas.clientHeight || innerHeight);
      camera.updateProjectionMatrix(); stage.resize();
    }
    fit(); window.addEventListener("resize", fit);
    var environmentKey = null;
    function syncRealClock() { $("realClock").textContent = "实际北京时间 " + hourLabel(clockHour(beijingNow())) + " UTC+8"; }
    function syncTime(state) {
      if (!applyingClock) { manualHour = state.hour; rehearsalSource = "API"; }
      stage.exposure = state.exposure;
      if (stage.matComp.uniforms.uExposure) stage.matComp.uniforms.uExposure.value = state.exposure;
      stage.bloom = 0.07 + state.night * 0.30;
      stage.thresh = 1.40 - state.night * 0.35;
      stage.matBright.uniforms.uThresh.value = stage.thresh;
      stage.vig = 0.06 + state.night * 0.07;
      stage.grain = 0.004 + state.night * 0.006;
      stage.matComp.uniforms.uBloom.value = stage.bloom;
      stage.matComp.uniforms.uVig.value = stage.vig;
      stage.matComp.uniforms.uGrain.value = stage.grain;
      var dayTheme = state.day > 0.5, rehearsal = manualHour !== null;
      document.documentElement.dataset.cityTheme = dayTheme ? "day" : "night";
      if (locator) locator.material.color.setHex(dayTheme ? 0x146783 : 0x8be8ff);
      $("cityClock").dataset.mode = rehearsal ? "rehearsal" : "live";
      $("clockSource").textContent = rehearsal ? "演练" : "实时";
      $("realClock").hidden = !rehearsal; syncRealClock();
      $("clkTime").textContent = hourLabel(state.hour);
      $("clkTime").removeAttribute("datetime");
      if (!rehearsal) $("clkTime").setAttribute("datetime", beijingNow().toISOString().slice(0, 19) + "+08:00");
      $("clkPhase").textContent = state.name + (rehearsal ? " · 演练 UTC+8" : " · 北京时间 UTC+8");
      $("clockMode").textContent = rehearsal ? "时间演练（" + rehearsalSource + "）· 非当前时间" : "北京时间 UTC+8 实时驱动";
      $("footPhase").textContent = state.name + " · " + (state.sun > 0 ? "太阳光照" : "环境天光") + " · 分层程序云";
      $("phaseNote").replaceChildren();
      var strong = document.createElement("b"); strong.textContent = state.name; $("phaseNote").appendChild(strong);
      $("phaseNote").appendChild(document.createTextNode(rehearsal ? "　演练光照，不代表当前北京时间。" : "　当前北京时间驱动光照；杨城没有真实地理定位。"));
      $("timeHour").value = Math.min(23.75, state.hour);
      $("timeValue").textContent = hourLabel(state.hour).slice(0, 5) + (rehearsal ? " 演练" : " 实时");
      /* 实时时钟每15分钟捕获PMREM；主动演练即使在同一刻度也即时捕获。 */
      var key = rehearsal ? "演练:" + state.hour : Math.floor(state.hour * 4);
      if (key !== environmentKey) { city.updateEnvironment(stage.renderer); environmentKey = key; }
      if (rehearsal) city.sun.shadow.needsUpdate = true;
    }
    city.onTimeChange = syncTime;
    function applyClock(h) {
      applyingClock = true;
      try { return city.setTime(h); } finally { applyingClock = false; }
    }
    function rehearse(h, source) {
      /* 先校验再改变时钟模式，失败不污染当前状态。 */
      var state = YC3D_CITY.timeState(h);
      manualHour = state.hour; rehearsalSource = source || "交互"; return applyClock(state.hour);
    }
    function tick() { if (manualHour === null) applyClock(clockHour(beijingNow())); else syncRealClock(); }
    function resetTime() {
      manualHour = null; rehearsalSource = "";
      var url = new URL(location.href); url.searchParams.delete("time"); history.replaceState(null, "", url.href);
      tick(); return diagnostics();
    }
    $("timeHour").addEventListener("input", function (e) { rehearse(Number(e.target.value), "交互"); });
    $("timeReset").addEventListener("click", resetTime);
    $("shadowToggle").addEventListener("change", function (e) {
      stage.renderer.shadowMap.enabled = e.target.checked;
      stage.renderer.shadowMap.needsUpdate = true; city.sun.shadow.needsUpdate = true;
    });
    applyClock(seedHour);
    step(64, "正在生成天空环境与六馆入口");

    var filter = "halls", selected = null, hovered = null, cardOpen = false, previousFocus = null;
    var locator = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: city.state.day > 0.5 ? 0x146783 : 0x8be8ff, toneMapped: false }));
    locator.visible = false; scene.add(locator);
    function locateMarker(o) {
      var groups = city.halls.concat(city.giants, city.infrastructure);
      var group = groups.find(function (g) { return g.userData.hall === o || g.userData.giant === o || g.userData.infrastructure === o; });
      var bounds = group.userData.bounds, size = bounds.getSize(new THREE.Vector3());
      var wx = size.x / 2 + 2, wz = size.z / 2 + 2, l = 5, positions = [];
      [-1, 1].forEach(function (x) { [-1, 1].forEach(function (z) {
        positions.push(x * wx, 0, z * wz, x * (wx - l), 0, z * wz,
          x * wx, 0, z * wz, x * wx, 0, z * (wz - l), x * wx, 0, z * wz, x * wx, 7, z * wz);
      }); });
      locator.geometry.dispose(); locator.geometry = new THREE.BufferGeometry();
      locator.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      locator.position.set((bounds.min.x + bounds.max.x) / 2, 0.32, (bounds.min.z + bounds.max.z) / 2);
      locator.visible = true; $("mapSelection").textContent = "已定位 " + o.name;
    }
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $("cityTip");
    var pointer = { down: false, moved: 0, sx: 0, sy: 0, x: 0, y: 0, queued: false };
    function category(o) { return /^H[1-6]$/.test(o.id) ? "halls" : o.biz ? "giants" : "infra"; }
    function pickOwner() {
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(scene.children, true);
      for (var i = 0; i < hits.length; i++) {
        var mesh = hits[i].object, parent = mesh, visible = true;
        while (parent) { if (!parent.visible) visible = false; parent = parent.parent; }
        if (!visible || !mesh.isMesh) continue;
        var owner = mesh.isInstancedMesh && mesh.userData.instanceOwners ? mesh.userData.instanceOwners[hits[i].instanceId] : mesh.userData.owner;
        if (owner && (!isMap || isDistrict || category(owner) === filter)) return owner;
        var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.some(function (m) { return !m.transparent && m.depthWrite; })) return null;
      }
      return null;
    }
    function hideTip() { tip.classList.remove("on"); canvas.classList.remove("hot"); }
    function pickHover() {
      hovered = pointer.down ? null : pickOwner();
      if (!hovered) { hideTip(); return; }
      tip.replaceChildren();
      var b = document.createElement("b"); b.textContent = hovered.name; tip.appendChild(b);
      var label = document.createElement("i"); label.textContent = hovered.id; tip.appendChild(label);
      tip.style.left = Math.max(100, Math.min(innerWidth - 100, pointer.x)) + "px";
      tip.style.top = Math.max(60, pointer.y) + "px";
      tip.classList.add("on"); canvas.classList.add("hot");
    }
    function updatePointer(e) {
      var rect = canvas.getBoundingClientRect();
      ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      pointer.x = e.clientX; pointer.y = e.clientY;
    }
    canvas.addEventListener("pointerdown", function (e) {
      updatePointer(e); pointer.down = true; pointer.moved = 0; pointer.sx = e.clientX; pointer.sy = e.clientY;
      canvas.classList.add("dragging"); canvas.setPointerCapture(e.pointerId); hideTip();
    });
    canvas.addEventListener("pointermove", function (e) {
      updatePointer(e);
      if (!isMap && !reduceMotion) { rig.tmx = ndc.x; rig.tmy = ndc.y; }
      if (pointer.down) {
        var dx = e.clientX - pointer.sx, dy = e.clientY - pointer.sy;
        pointer.moved += Math.abs(dx) + Math.abs(dy);
        rig.tTheta = Math.max(freeCam ? -Math.PI : -0.8, Math.min(freeCam ? Math.PI : 0.8, rig.tTheta - dx * 0.002));
        rig.tPhi = Math.max(freeCam ? 0.65 : 0.02, Math.min(freeCam ? 1.30 : 0.52, rig.tPhi + dy * 0.0012));
        pointer.sx = e.clientX; pointer.sy = e.clientY;
      }
      if (!pointer.queued) { pointer.queued = true; requestAnimationFrame(function () { pointer.queued = false; pickHover(); }); }
    });
    function releasePointer() { pointer.down = false; canvas.classList.remove("dragging"); }
    canvas.addEventListener("pointerup", function (e) {
      updatePointer(e); var click = pointer.down && pointer.moved < 8; releasePointer();
      if (click) { var owner = pickOwner(); if (owner) select(owner); else closeCard(); }
    });
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("lostpointercapture", releasePointer);
    canvas.addEventListener("pointerleave", function () { rig.tmx = rig.tmy = 0; hideTip(); });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var minD = isMap ? 180 : freeCam ? 160 : 420, maxD = isMap ? 4600 : freeCam ? 2400 : 2800;
      rig.tDist = Math.max(minD, Math.min(maxD, rig.tDist + e.deltaY * 0.45));
    }, { passive: false });

    function addLink(container, text, href) {
      var a = document.createElement("a"); a.textContent = text; a.href = href; container.appendChild(a);
    }
    function openCard(o) {
      selected = o;
      if (!cardOpen) previousFocus = document.activeElement;
      var kind = category(o), go = $("cardGo");
      $("cardKind").textContent = kind === "halls" ? "六馆 / " + o.id : kind === "giants" ? "虚构企业 / 运行设定" : "基础设施 / " + o.category;
      $("cardName").textContent = o.name; $("cardEn").textContent = o.en || o.id;
      $("cardLine").textContent = o.line || o.note || "";
      $("cardMeta").textContent = (o.biz ? "业态　" + o.biz + "\n" : "") + "局部场景位置　X " + o.x + " / Z " + o.z + "\n纯虚构设计，无地理底图" + (kind !== "halls" ? "\n设施动画为演示，未连接实时数据" : "\n三维大厅 · 独立分厅学习");
      go.hidden = kind !== "halls";
      go.href = o.href || "map.html"; go.textContent = kind === "halls" ? "进入三维大厅" : "定位此处";
      var links = $("cardLinks"); links.replaceChildren();
      if (kind !== "halls" && !isMap) addLink(links, "在城市地图查看", "map.html?node=" + encodeURIComponent(o.id));
      $("cityCard").classList.add("on"); $("cityCard").setAttribute("aria-hidden", "false");
      document.body.classList.add("card-open"); cardOpen = true; $("cardX").focus({ preventScroll: true });
    }
    function closeCard() {
      $("cityCard").classList.remove("on"); $("cityCard").setAttribute("aria-hidden", "true");
      document.body.classList.remove("card-open"); cardOpen = false;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
    }
    function select(o) {
      /* 区域模式下点馆直接进馆，不弹卡。 */
      if (isDistrict && category(o) === "halls") { location.href = o.href; return; }
      openCard(o); locateMarker(o); if (isMap || isDistrict) rig.focus(o); renderNodes();
    }
    $("cardX").addEventListener("click", closeCard);
    $("cardLocate").addEventListener("click", function () { if (selected) { rig.focus(selected); locateMarker(selected); } });
    function resetView() {
      closeCard(); selected = null; locator.visible = false; rig.reset(); renderNodes();
      $("mapSelection").textContent = "选择分类后点击节点定位";
    }
    $("resetView").addEventListener("click", resetView);
    function renderNodes() {
      var box = $("nodeList"); box.replaceChildren();
      var source = !isMap || filter === "halls" ? YC3D_CITY.HALLS : filter === "giants" ? YC3D_CITY.GIANTS : YC3D_CITY.INFRA;
      source.forEach(function (o) {
        var node = document.createElement(isMap ? "button" : "a"); node.className = "node";
        node.dataset.id = o.id; node.classList.toggle("selected", selected === o);
        if (isMap) { node.type = "button"; node.setAttribute("aria-label", "定位" + o.name); node.addEventListener("click", function () { select(o); }); }
        else node.href = o.href;
        var dot = document.createElement("span"); dot.className = "dot"; dot.style.setProperty("--c", "#" + o.color.toString(16).padStart(6, "0"));
        var nm = document.createElement("span"); nm.className = "nm";
        var b = document.createElement("b"); b.textContent = o.name; nm.appendChild(b);
        var sub = document.createElement("i"); sub.textContent = o.biz || o.category || o.id + " · 三维大厅 / 独立分厅"; nm.appendChild(sub);
        var st = document.createElement("span"); st.className = "st"; st.textContent = isMap ? "定位" : "进入";
        node.append(dot, nm, st); box.appendChild(node);
      });
    }
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        filter = button.dataset.filter; closeCard(); selected = null; hideTip(); locator.visible = false;
        $("mapSelection").textContent = "选择分类后点击节点定位";
        document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
        renderNodes();
      });
    });
    renderNodes();
    /* 企业定位可从首页信息卡和外部链接转入地图，不附带强制白天参数。 */
    var initialId = new URLSearchParams(location.search).get("node");
    if (isMap && initialId) {
      var initialOwner = YC3D_CITY.HALLS.concat(YC3D_CITY.GIANTS, YC3D_CITY.INFRA).find(function (o) { return o.id === initialId; });
      if (initialOwner) {
        filter = category(initialOwner);
        document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.filter === filter)); });
        select(initialOwner);
      }
    }
    function renderStats() {
      var all = E && E.list ? E.list() : [];
      if ($("cAvail")) $("cAvail").innerHTML = YC3D_CITY.HALLS.filter(function (h) { return !!h.href; }).length + "<small>/6</small>";
      if ($("cRec")) $("cRec").textContent = all.length;
      if ($("cReplay")) $("cReplay").textContent = all.filter(function (r) { var s = (r.review || {}).status; return s === "replayable" || s === "independent"; }).length;
      if ($("cReview")) $("cReview").textContent = all.filter(function (r) { return (r.review || {}).status === "independent"; }).length;
      if ($("hudMini")) $("hudMini").textContent = isDistrict
        ? zone.name + " · " + (zone.desc || "")
        : "六馆 · " + YC3D_CITY.GIANTS.length + "家虚构AI企业 · " + YC3D_CITY.INFRA.length + "个交通与公共设施。实体建筑与运行动画均为局部场景设计。";
    }
    function initHint() {
      var seen = false; try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch (e) {}
      if (seen || isMap) $("mapHint").classList.add("gone");
      $("btnMap").addEventListener("click", function () {
        $("mapHint").classList.add("gone"); try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeCard(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key.toLowerCase() === "m") { if (isMap) resetView(); else location.href = "map.html"; }
      else if (e.key.toLowerCase() === "e") location.href = "evidence.html";
    });
    stage.onFrame(function (dt, t) { rig.update(dt); city.update(reduceMotion ? 0 : dt, reduceMotion ? 0 : t); });
    var lowT = 0, degraded = false;
    stage.autoQuality = function (fps) {
      if (degraded) return;
      lowT = fps < 30 ? lowT + 0.5 : Math.max(0, lowT - 0.5);
      if (lowT > 3) {
        degraded = true; stage.maxDPR = 1;
        stage.renderer.shadowMap.enabled = false; $("shadowToggle").checked = false;
        $("shadowToggle").parentElement.title = "低帧率时已关闭阴影，可手动重新开启"; fit();
      }
    };
    renderStats(); initHint();
    window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("yc.evidence") === 0) renderStats(); });
    function diagnostics() {
      var result = city.inspect();
      result.clock = { mode: manualHour === null ? "live" : "rehearsal", source: rehearsalSource || "北京时间",
        timezone: "UTC+8", display: $("clkTime").textContent, actualBeijing: hourLabel(clockHour(beijingNow())) };
      result.post = { exposure: stage.exposure, bloom: stage.bloom, threshold: stage.thresh,
        exposureUniform: stage.matComp.uniforms.uExposure ? stage.matComp.uniforms.uExposure.value : null };
      result.theme = document.documentElement.dataset.cityTheme;
      result.shadowsEnabled = stage.renderer.shadowMap.enabled;
      result.map = { enabled: isMap, filter: filter, selected: selected ? selected.id : null, locatorVisible: locator.visible };
      return result;
    }
    function locate(id) {
      var owner = YC3D_CITY.HALLS.concat(YC3D_CITY.GIANTS, YC3D_CITY.INFRA).find(function (o) { return o.id === id; });
      if (!owner) return null;
      filter = category(owner);
      document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.filter === filter)); });
      select(owner); rig.focus(owner); return diagnostics();
    }
    window.YCCity = { stage: stage, scene: scene, camera: camera, rig: rig, city: city, isMap: isMap,
      setTime: function (h) { rehearse(h, "API"); return diagnostics(); }, inspect: diagnostics,
      resetTime: resetTime, resetView: resetView, locate: locate,
      select: select, openCard: openCard, closeCard: closeCard,
      hover: function () { return hovered; }, isCardOpen: function () { return cardOpen; }, fps: function () { return stage.fps; } };
    rig.update(1); stage.start();
    setInterval(tick, 1000);
    /* 第一帧渲染后再撤掉加载层，不添加覆盖当前时间的开场夜景。 */
    step(100, "杨城已加载");
    requestAnimationFrame(function () { if (bootEl) bootEl.classList.add("done"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

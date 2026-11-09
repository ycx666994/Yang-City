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

  /* ---------------- 镜头 ----------------
     全城要能从 8 公里总览一路推到单栋建筑的窗台，所以距离用「乘一个比例」
     来变，不用加减：加减在 8 公里和 80 米这两种尺度上不可能同时好用。
     22 米是贴着楼站的视距（相机 near 0.45，再近就穿模）。 */
  var MAP_MIN_D = 22, MAP_MAX_D = 8000;
  var MAP_BOX = (window.YC_CITY_PLAN && window.YC_CITY_PLAN.bounds) ||
    { minX: -3120, maxX: 3260, minZ: -2700, maxZ: 2850 };
  var MAP_PAD = 1100;
  function clampNum(v, a, b) { return v < a ? a : v > b ? b : v; }

  function CamRig(camera) {
    this.cam = camera;
    /* 全城的视线中心要往南压一点：透视会把远景压扁，把镜头对准几何中心，
       画面下半（南排）就顶出框、上半留一大片空地。6600 米也不够把南岸第四排收进来。 */
    this.center = new THREE.Vector3(isDistrict ? zone.cx : isMap ? 0 : -20,
      isDistrict ? 40 : isMap ? 0 : 145, isDistrict ? zone.cz : isMap ? 170 : 25);
    this.targetCenter = this.center.clone();
    this.theta = this.tTheta = 0;
    this.phi = this.tPhi = isDistrict ? 0.60 : isMap ? 0.97 : 0.28;
    this.dist = this.tDist = isDistrict ? Math.max(1000, Math.min(1900, zone.r * 2.3)) : isMap ? 6900 : 1600;
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
  CamRig.prototype.clampD = function (d) {
    return isMap ? clampNum(d, MAP_MIN_D, MAP_MAX_D) : clampNum(d, 420, 2800);
  };
  /* 不许把镜头推到城外虚无里：中心点限制在城市范围外扩一圈之内 */
  CamRig.prototype.clampCenter = function () {
    if (!isMap) return;
    this.targetCenter.x = clampNum(this.targetCenter.x, MAP_BOX.minX - MAP_PAD, MAP_BOX.maxX + MAP_PAD);
    this.targetCenter.z = clampNum(this.targetCenter.z, MAP_BOX.minZ - MAP_PAD, MAP_BOX.maxZ + MAP_PAD);
  };
  /* 以 anchor（光标下的地面点）为不动点推拉：镜头沿「锚点 → 镜头」这条线走，
     锚点就钉在屏幕上不动——这就是「往哪儿指就往哪儿钻」的手感。 */
  CamRig.prototype.zoomBy = function (factor, anchor) {
    var d0 = this.tDist, d1 = this.clampD(d0 * factor);
    if (Math.abs(d1 - d0) < 1e-4) return this.tDist;
    if (anchor) {
      var k = d1 / d0;
      this.targetCenter.x = anchor.x + (this.targetCenter.x - anchor.x) * k;
      this.targetCenter.z = anchor.z + (this.targetCenter.z - anchor.z) * k;
      this.clampCenter();
    }
    this.tDist = d1;
    return d1;
  };
  /* 屏幕空间平移：位移按当前视距换算成米，抓住地面拖 */
  CamRig.prototype.panBy = function (dx, dy, camera) {
    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    var back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    right.y = 0; back.y = 0;
    if (right.lengthSq() < 1e-6 || back.lengthSq() < 1e-6) return;
    right.normalize(); back.normalize();
    var s = this.tDist * 0.0017;
    this.targetCenter.addScaledVector(right, -dx * s);
    this.targetCenter.addScaledVector(back, dy * s);
    this.clampCenter();
  };
  /* 区域近景（district.html）用的三个动作：绕中心转、抓地平移、推拉。
     全城那套是「绕着视点跑」，区域页是「中心点不动、改朝向」，两套别混用。 */
  CamRig.prototype.orbit = function (dx, dy) {
    this.tTheta -= dx * 0.0042;
    this.tPhi = clampNum(this.tPhi + dy * 0.0030, 0.10, 1.32);
  };
  CamRig.prototype.pan = function (dx, dy) { this.panBy(dx, dy, this.cam); };
  CamRig.prototype.zoom = function (step) { this.tDist = this.clampD(this.tDist * Math.exp(step * 0.0022)); };
  CamRig.prototype.flyTo = function (x, z, dist, phi) {
    this.targetCenter.x = x; this.targetCenter.z = z;
    if (isMap) this.targetCenter.y = 0;
    this.clampCenter();
    if (dist) this.tDist = this.clampD(dist);
    if (phi !== undefined) this.tPhi = clampNum(phi, 0.30, 1.42);
    this.tmx = this.tmy = 0;
  };
  CamRig.prototype.focus = function (o) {
    /* 区域节点：把整块地框满一屏。建筑节点：按楼高定视距，
       200 米的塔在 420 米外刚好是一张「楼的标准像」。 */
    if (isMap && o.kind === "district") {
      this.flyTo(o.x, o.z, Math.max(740, (o.r || 470) * 2.05), 0.84);
      return;
    }
    var h = o.h || 60;
    this.targetCenter.set(o.x, Math.min(h * 0.35, 78), o.z);
    this.tTheta = 0; this.tPhi = isMap ? 0.98 : isDistrict ? 0.60 : 1.13;
    this.tDist = isMap ? clampNum(h * 2.1, 120, 640) : isDistrict ? 460 : 410;
    this.tmx = this.tmy = 0;
  };
  CamRig.prototype.reset = function () {
    this.targetCenter.set(isDistrict ? zone.cx : isMap ? 0 : -20,
      isDistrict ? 40 : isMap ? 0 : 145, isDistrict ? zone.cz : isMap ? 170 : 25);
    this.tTheta = 0; this.tPhi = isDistrict ? 0.60 : isMap ? 0.97 : 0.28;
    this.tDist = isDistrict ? Math.max(1000, Math.min(1900, zone.r * 2.3)) : isMap ? 6900 : 1600;
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
    /* near 收到 0.45、far 放到 12500：一边要能贴到窗台，一边要能退到 8 公里外
       还看得见南岸第四排。深度比 2.8 万，路面都带 polygonOffset，不会打架。 */
    var camera = new THREE.PerspectiveCamera(isMap ? 52 : 48, 1, 0.45, 12500);
    /* 区域模式走局部街区引擎：只生成这一个区域，1 单位 = 1 米，镜头贴近侧上方。 */
    var plan = isDistrict && window.YC3D_DISTRICT && window.ycDistrictPlan ? window.ycDistrictPlan(zone) : null;
    /* 每个区域可以有自己的曝光：亮色石材区不压曝光就会整片发白 */
    if (plan && plan.exposure) stage.exposure = plan.exposure;
    var city = plan ? YC3D_DISTRICT.build(scene, plan, { hour: seedHour })
      : YC3D_CITY.build(scene, { hour: seedHour });
    /* 全城的 17 个片区也当节点用：面板里能选，画面上能点，镜头能飞过去 */
    var ZONES = city.zones || [];
    var rig;
    if (plan) {
      var bb = city.bounds, vw = plan.view || {};
      rig = new YC3D_DISTRICT.Rig(camera, {
        bounds: { minX: bb.minX * 0.94, maxX: bb.maxX * 0.94, minZ: bb.minZ * 0.94, maxZ: bb.maxZ * 0.94 },
        x: vw.x || 0, y: vw.y || 0, z: vw.z || 0, dist: vw.dist || 300,
        phi: vw.phi === undefined ? 0.74 : vw.phi, theta: vw.theta || 0.4,
        minD: 85, maxD: 780
      });
    } else {
      rig = new CamRig(camera);
    }
    city.camera = camera;
    /* 仅在 ?debug=1 时暴露内部对象，用于射线探针排查材质/构件归属。 */
    if (location.search.indexOf("debug=1") >= 0) {
      window.__yc = { scene: scene, camera: camera, renderer: stage.renderer, city: city, rig: rig, THREE: THREE };
    }
    stage.setScene(scene, camera);
    if (isMap) {
      document.title = "杨城 · 三维全景 · 十七区、六馆与" + YC3D_CITY.GIANTS.length + "家 AI 大厂";
      $("nodesTitle").textContent = "分类定位";
      $("nodeFilters").hidden = false; $("mapTools").hidden = false;
      /* 顶栏那枚「二维地图」按钮由页面里的独立一段脚本接管（切图层，不换页）。 */
      $("nodesFoot").textContent = "滚轮推近到片区，双击再进一档到单栋楼；坐标为虚构场景单位。";
      canvas.setAttribute("aria-label", "虚构杨城俯视地图，六馆、" + YC3D_CITY.GIANTS.length + "家AI企业及" + YC3D_CITY.INFRA.length + "个设施可分类定位");
    }
    if (isDistrict) {
      document.title = "杨城 · " + zone.name + " · 街区近景";
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
      if ($("dhReset")) $("dhReset").addEventListener("click", function () { rig.reset(); });
      canvas.setAttribute("aria-label", "虚构杨城" + zone.name + "街区近景，可拖动平移查看不同地段，Shift 拖动转换视角");
    }
    function fit() {
      camera.aspect = (canvas.clientWidth || innerWidth) / (canvas.clientHeight || innerHeight);
      camera.updateProjectionMatrix(); stage.resize();
    }
    fit(); window.addEventListener("resize", fit);
    var environmentKey = null;
    function syncRealClock() { $("realClock").textContent = "实际北京时间 " + hourLabel(clockHour(beijingNow())) + " UTC+8"; }
    /* 区域可以再压一档曝光：正午的 ACES 会把浅灰铝皮直接推到白，
       谷地要的是有层次的灰，不是一片白。只作用于显式声明 exposureK 的区域。 */
    /* 全城要再压一档曝光：17 个区的地面全是浅色铺装，摊到一屏里会整片过曝发白 */
    var exposureK = plan && plan.exposureK ? plan.exposureK : (isMap ? 0.82 : 1);
    function syncTime(state) {
      if (!applyingClock) { manualHour = state.hour; rehearsalSource = "API"; }
      stage.exposure = state.exposure * exposureK;
      if (stage.matComp.uniforms.uExposure) stage.matComp.uniforms.uExposure.value = stage.exposure;
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
    /* 地面定位框：四个角画直角 + 一根立杆。片区与单栋楼共用同一套画法。 */
    function drawBox(minX, minZ, maxX, maxZ) {
      var wx = (maxX - minX) / 2 + 2, wz = (maxZ - minZ) / 2 + 2, l = Math.min(5, wx * 0.4, wz * 0.4), positions = [];
      [-1, 1].forEach(function (x) { [-1, 1].forEach(function (z) {
        positions.push(x * wx, 0, z * wz, x * (wx - l), 0, z * wz,
          x * wx, 0, z * wz, x * wx, 0, z * (wz - l), x * wx, 0, z * wz, x * wx, 7, z * wz);
      }); });
      locator.geometry.dispose(); locator.geometry = new THREE.BufferGeometry();
      locator.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      locator.position.set((minX + maxX) / 2, 0.32, (minZ + maxZ) / 2);
      locator.visible = true;
    }
    function locateMarker(o) {
      if (!o) return;
      /* 片区节点不属于任何一个「馆/企业/设施组」，按地块矩形画框 */
      if (o.kind === "district") {
        var rr = o.r || 470;
        drawBox(o.x - rr, o.z - rr, o.x + rr, o.z + rr);
        $("mapSelection").textContent = "已定位 " + o.name;
        return;
      }
      var groups = (city.halls || []).concat(city.giants || [], city.infrastructure || []);
      var group = groups.find(function (g) {
        return g && g.userData && (g.userData.hall === o || g.userData.giant === o || g.userData.infrastructure === o);
      });
      if (!group || !group.userData.bounds) return;
      var bounds = group.userData.bounds;
      drawBox(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z);
      $("mapSelection").textContent = "已定位 " + o.name;
    }
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $("cityTip");
    var pointer = { down: false, moved: 0, sx: 0, sy: 0, x: 0, y: 0, queued: false };
    /* 缩放锚点：光标射线打到 y=0 平面的落点。看不见地面（在望天）时返回 null，
       那就退回以画面中心为锚。 */
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var anchorPt = new THREE.Vector3();
    function anchorUnderCursor() {
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(groundPlane, anchorPt)) return null;
      /* 视线越平，落点越远。落到当前视距五倍以外，说明指着的其实不是这块地 */
      if (anchorPt.distanceTo(camera.position) > rig.dist * 5) return null;
      return anchorPt;
    }
    /* 比例尺读数：从「全城」到「建筑」四档，让人知道自己在哪一层 */
    function scaleText(d) {
      if (d >= 2000) return { zone: "全城", v: (d / 1000).toFixed(1) + " km" };
      if (d >= 900) return { zone: "城区", v: Math.round(d / 10) * 10 + " m" };
      if (d >= 260) return { zone: "街区", v: Math.round(d / 5) * 5 + " m" };
      return { zone: "建筑", v: Math.round(d) + " m" };
    }
    var scaleEl = $("scaleLabel"), scaleLast = "";
    function updateScale() {
      if (!scaleEl) return;
      var t = scaleText(rig.dist);
      var key = t.zone + t.v;
      if (key === scaleLast) return;
      scaleLast = key;
      scaleEl.replaceChildren();
      var z = document.createElement("i"); z.textContent = t.zone;
      var v = document.createElement("b"); v.textContent = t.v;
      scaleEl.append(z, v);
      scaleEl.dataset.zone = t.zone;
    }
    /* 屏幕上的「某一点」写成世界坐标，用于双击推进与卡片里的定位 */
    function groundAtPointer() { return anchorUnderCursor(); }
    /* 片区也是一类可选节点：地图上点到哪块地，就知道自己进的是哪个区 */
    function category(o) {
      if (o && o.kind === "district") return "zones";
      return /^H[1-6]$/.test(o.id) ? "halls" : o.biz ? "giants" : "infra";
    }
    function pickOwner() {
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(scene.children, true);
      /* 分类筛选只决定「先挑谁」：被筛出来的节点优先，一个都没命中时退一步给片区。
         不这样的话，在「六馆」分类下点地块是一片没有反应，人以为地图点不动。 */
      var fallback = null;
      for (var i = 0; i < hits.length; i++) {
        var mesh = hits[i].object, parent = mesh, visible = true;
        while (parent) { if (!parent.visible) visible = false; parent = parent.parent; }
        if (!visible || !mesh.isMesh) continue;
        var owner = mesh.isInstancedMesh && mesh.userData.instanceOwners ? mesh.userData.instanceOwners[hits[i].instanceId] : mesh.userData.owner;
        if (owner && (!isMap || isDistrict || category(owner) === filter)) return owner;
        if (owner && isMap) { if (!fallback) fallback = owner; continue; }
        var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.some(function (m) { return !m.transparent && m.depthWrite; })) return fallback;
      }
      return fallback;
    }
    function hideTip() { tip.classList.remove("on"); canvas.classList.remove("hot"); }
    function pickHover() {
      hovered = pointer.down ? null : pickOwner();
      if (!hovered) { hideTip(); return; }
      tip.replaceChildren();
      var b = document.createElement("b"); b.textContent = hovered.name; tip.appendChild(b);
      var label = document.createElement("i");
      label.textContent = hovered.kind === "district" ? hovered.id + " · 双击飞近" : hovered.id;
      tip.appendChild(label);
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
      pointer.btn = e.button;
      canvas.classList.add("dragging"); canvas.setPointerCapture(e.pointerId); hideTip();
      if (isMap && e.button === 1) e.preventDefault();
    });
    canvas.addEventListener("contextmenu", function (e) { if (isMap || isDistrict) e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) {
      updatePointer(e);
      if (!isMap && !isDistrict && !reduceMotion) { rig.tmx = ndc.x; rig.tmy = ndc.y; }
      if (pointer.down) {
        var dx = e.clientX - pointer.sx, dy = e.clientY - pointer.sy;
        pointer.moved += Math.abs(dx) + Math.abs(dy);
        if (isDistrict) {
          /* 区域近景：左键拖动平移（抓地），右键或 Shift 拖动转视角。 */
          if (e.shiftKey || pointer.btn === 2) rig.orbit(dx, dy); else rig.pan(dx, dy);
        } else if (isMap && (e.shiftKey || pointer.btn === 1 || pointer.btn === 2)) {
          /* 全城：Shift / 中键 / 右键 = 抓地平移，左键仍是转视角 */
          rig.panBy(dx, dy, camera); hideTip();
        } else {
          rig.tTheta = Math.max(freeCam ? -Math.PI : -0.8, Math.min(freeCam ? Math.PI : 0.8, rig.tTheta - dx * 0.002));
          /* 放大看楼时要能压到接近平视，总览时不许把地平线压进画面 */
          var loPhi = isMap ? 0.30 : 0.02, hiPhi = isMap ? 1.42 : 0.52;
          if (isMap) { if (rig.tDist < 900) loPhi = 0.16; if (rig.tDist < 260) loPhi = 0.06; }
          rig.tPhi = Math.max(loPhi, Math.min(hiPhi, rig.tPhi + dy * 0.0012));
        }
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
      if (isDistrict) { rig.zoom(e.deltaY * 0.6); return; }
      /* 全城：往哪儿指就往哪儿钻。往里推时以光标下的地面点为锚，
         往外拉时不设锚——否则锚点会把中心一路拽到城外。 */
      var step = clampNum(e.deltaY, -260, 260);
      var anchor = step < 0 ? groundAtPointer() : null;
      rig.zoomBy(Math.exp(step * 0.0022), anchor);
      updateScale();
    }, { passive: false });
    /* 双击：把落点搬到画面中心，并再近一档。连点几下就是从全城钻进某栋楼。 */
    canvas.addEventListener("dblclick", function (e) {
      if (!isMap) return;
      e.preventDefault(); updatePointer(e);
      var a = groundAtPointer();
      if (!a) return;
      var nd = Math.max(MAP_MIN_D, Math.min(rig.tDist * 0.34, 1400));
      rig.flyTo(a.x, a.z, nd, Math.min(1.24, Math.max(rig.tPhi, 0.78)));
      updateScale();
    });

    function addLink(container, text, href) {
      var a = document.createElement("a"); a.textContent = text; a.href = href; container.appendChild(a);
    }
    function openCard(o) {
      selected = o;
      if (!cardOpen) previousFocus = document.activeElement;
      var kind = category(o), go = $("cardGo");
      $("cardKind").textContent = kind === "halls" ? "六馆 / " + o.id
        : kind === "zones" ? "城市片区 / " + o.id
        : kind === "giants" ? "虚构企业 / 运行设定" : "基础设施 / " + o.category;
      $("cardName").textContent = o.name; $("cardEn").textContent = o.en || o.id;
      $("cardLine").textContent = o.line || o.note || "";
      $("cardMeta").textContent = (o.biz ? "业态　" + o.biz + "\n" : "")
        + "局部场景位置　X " + Math.round(o.x) + " / Z " + Math.round(o.z) + "\n纯虚构设计，无地理底图"
        + (kind === "zones" ? "\n片区地块 " + Math.round((o.r || 0) * 2) + " 米见方 · 滚轮可继续推近到单栋建筑"
          : kind !== "halls" ? "\n设施动画为演示，未连接实时数据" : "\n三维大厅 · 独立分厅学习");
      go.hidden = kind === "giants" || kind === "infra";
      go.href = o.href || "map.html";
      go.textContent = kind === "halls" ? "进入三维大厅" : "进入街区近景";
      var links = $("cardLinks"); links.replaceChildren();
      if (kind === "zones") addLink(links, "只看这一个区", o.href);
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
      openCard(o); locateMarker(o); if (isMap || isDistrict) rig.focus(o); updateScale(); renderNodes();
    }
    $("cardX").addEventListener("click", closeCard);
    $("cardLocate").addEventListener("click", function () { if (selected) { rig.focus(selected); locateMarker(selected); } });
    function resetView() {
      closeCard(); selected = null; locator.visible = false; rig.reset(); renderNodes();
      $("mapSelection").textContent = "选择分类后点击节点定位";
    }
    $("resetView").addEventListener("click", resetView);
    if ($("zoomIn")) $("zoomIn").addEventListener("click", function () { rig.zoomBy(1 / 1.75, null); updateScale(); });
    if ($("zoomOut")) $("zoomOut").addEventListener("click", function () { rig.zoomBy(1.75, null); updateScale(); });
    /* 面板里的四类节点：片区 / 六馆 / 企业 / 设施。
       片区的色块用区自己的颜色，这样面板和地上的地块对得上号。 */
    function nodeSource() {
      if (!isMap) return YC3D_CITY.HALLS;
      return filter === "zones" ? ZONES : filter === "giants" ? YC3D_CITY.GIANTS
        : filter === "infra" ? YC3D_CITY.INFRA : YC3D_CITY.HALLS;
    }
    function renderNodes() {
      var box = $("nodeList"); box.replaceChildren();
      nodeSource().forEach(function (o) {
        var node = document.createElement(isMap ? "button" : "a"); node.className = "node";
        node.dataset.id = o.id; node.classList.toggle("selected", selected === o);
        if (isMap) { node.type = "button"; node.setAttribute("aria-label", "定位" + o.name); node.addEventListener("click", function () { select(o); }); }
        else node.href = o.href;
        var dot = document.createElement("span"); dot.className = "dot"; dot.style.setProperty("--c", "#" + o.color.toString(16).padStart(6, "0"));
        var nm = document.createElement("span"); nm.className = "nm";
        var b = document.createElement("b"); b.textContent = o.name; nm.appendChild(b);
        var sub = document.createElement("i");
        sub.textContent = o.kind === "district" ? o.id + " · " + (o.en || "城市片区")
          : (o.biz || o.category || o.id + " · 三维大厅 / 独立分厅");
        nm.appendChild(sub);
        var st = document.createElement("span"); st.className = "st";
        st.textContent = !isMap ? "进入" : o.kind === "district" ? "飞过去" : "定位";
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
      var initialOwner = ZONES.concat(YC3D_CITY.HALLS, YC3D_CITY.GIANTS, YC3D_CITY.INFRA).find(function (o) { return o.id === initialId; });
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
      /* 全城：+/- 推拉，方向键挪视点。放大到楼跟前之后，键盘比鼠标稳 */
      else if (isMap && (e.key === "+" || e.key === "=")) { rig.zoomBy(1 / 1.5, null); updateScale(); }
      else if (isMap && (e.key === "-" || e.key === "_")) { rig.zoomBy(1.5, null); updateScale(); }
      else if (isMap && /^Arrow/.test(e.key)) {
        e.preventDefault();
        var stepK = rig.tDist * 0.22;
        if (e.key === "ArrowLeft") rig.targetCenter.x -= stepK;
        else if (e.key === "ArrowRight") rig.targetCenter.x += stepK;
        else if (e.key === "ArrowUp") rig.targetCenter.z -= stepK;
        else rig.targetCenter.z += stepK;
        rig.clampCenter();
      }
    });
    stage.onFrame(function (dt, t) {
      rig.update(dt);
      /* 阴影只覆盖镜头附近，必须跟着视点走，否则转到边上就没阴影了 */
      if (city.followShadow) city.followShadow(rig.center.x, rig.center.z);
      /* 阴影盒按视距收放：8 公里外要盖住整排地，贴到楼跟前要收到两百米，
         否则一张 2048 的贴图摊到楼身上，影子是一团糊斑 */
      if (isMap && city.setShadowHalf) city.setShadowHalf(rig.dist * 0.72);
      if (isMap) updateScale();
      city.update(reduceMotion ? 0 : dt, reduceMotion ? 0 : t);
    });
    var lowT = 0, degraded = false;
    stage.autoQuality = function (fps) {
      if (degraded) return;
      lowT = fps < 30 ? lowT + 0.5 : Math.max(0, lowT - 0.5);
      if (lowT > 3) {
        /* 只降分辨率与泛光，不再直接砍阴影：没有阴影的画面会立刻退化成玩具模型 */
        degraded = true; stage.maxDPR = 1; stage.bloom = 0;
        $("shadowToggle").parentElement.title = "低帧率时已降低分辨率，阴影可手动关闭"; fit();
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
      var owner = ZONES.concat(YC3D_CITY.HALLS, YC3D_CITY.GIANTS, YC3D_CITY.INFRA).find(function (o) { return o.id === id; });
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

/* ============================================================
   城市公告栏 + 二维图层
   ------------------------------------------------------------
   单独一个 IIFE：district.html 也用这份脚本，那里没有公告栏的 DOM，
   拿不到 #bulList 就直接退出，不影响街区页。
   数据只有一份（shared/yc-bulletin.js），这里不写任何文案。
   ============================================================ */
(function () {
  "use strict";
  var B = window.YC_BULLETIN;
  var list = document.getElementById("bulList");
  if (!B || !list) return;
  var $ = function (id) { return document.getElementById(id); };
  var bul = $("bul"), btn = $("navBulletin"), frame = $("lyr2dFrame"), lyr = $("lyr2d");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------- 列表 ---------- */
  list.innerHTML = B.items.map(function (it) {
    var v = B.vendorOf(it);
    var live = it.status === "live";
    return '<a class="bul-item" href="project.html?id=' + encodeURIComponent(it.id) + '"' +
      ' style="--tone:' + esc(v.tone) + '">' +
      '<span class="bi-top">' +
        '<span class="bi-date">' + esc(B.fmtDate(it.date)) + "</span>" +
        '<span class="bi-vendor">' + esc(v.name) + "</span>" +
        (v.joint.length ? '<span class="bi-joint">× ' + esc(v.joint.join("、")) + "</span>" : "") +
        '<span class="bi-st' + (live ? " live" : "") + '">' + (live ? "开放中" : "已归档") + "</span>" +
      "</span>" +
      '<span class="bi-title">' + esc(it.title) +
        (it.titleEn ? "<em>" + esc(it.titleEn) + "</em>" : "") + "</span>" +
      '<span class="bi-lead">' + esc(it.lead) + "</span></a>";
  }).join("");

  var cnt = $("tnBulCount");
  if (cnt) cnt.textContent = B.items.length;
  var foot = $("bulFoot");
  if (foot) foot.textContent = "共 " + B.items.length + " 条 · 最近更新 " + B.fmtDate(B.published);

  /* ---------- 开关 ---------- */
  function openBul(on) {
    bul.classList.toggle("on", on);
    bul.setAttribute("aria-hidden", String(!on));
    /* 公告栏默认就是开的，右下角的缩放条得给它让位，否则被压在底下 */
    document.body.classList.toggle("bul-open", on);
    if (btn) btn.setAttribute("aria-expanded", String(on));
    if (on && lyr && !lyr.hidden) open2d(false);
    /* 分类定位的下拉和公告抽屉都从顶栏下面拉开，会叠在一起；
       公告展开时把下拉收掉，免得两个浮层打架。 */
    if (on && $("cityNodes") && $("cityNodes").open) $("cityNodes").open = false;
  }
  if (btn) btn.addEventListener("click", function () { openBul(!bul.classList.contains("on")); });
  if ($("bulClose")) $("bulClose").addEventListener("click", function () { openBul(false); });

  /* 反方向也要管：公告开着时点开「分类定位」，下拉会被 376px 宽的公告整个盖住。
     两者都从右上角往下拉，只能留一个。这里借公告按钮的点击复用它的收起逻辑
     （aria、body.bul-open、右下角让位都是一处改的）。 */
  if ($("cityNodes")) {
    $("cityNodes").addEventListener("toggle", function () {
      if (this.open && bul.classList.contains("on") && btn) btn.click();
    });
  }

  /* ---------- 二维图层 ---------- */
  function open2d(on) {
    if (!lyr) return;
    if (on) {
      /* 第一次展开才给 src：三维首屏不必为一个可能不打开的图多付 100KB */
      if (!frame.getAttribute("src")) {
        var t = new URLSearchParams(location.search).get("time");
        frame.setAttribute("src", "map2d.html" + (t !== null && t !== "" ? "?time=" + encodeURIComponent(t) : ""));
      }
      lyr.hidden = false;
      document.body.classList.add("l2-open");
      openBul(false);
    } else {
      lyr.hidden = true;
      document.body.classList.remove("l2-open");
    }
    var b = $("nav2d");
    if (b) b.setAttribute("aria-expanded", String(on));
  }
  if ($("nav2d")) $("nav2d").addEventListener("click", function () { open2d(lyr.hidden); });
  if ($("btnMap")) $("btnMap").addEventListener("click", function () { open2d(true); });
  if ($("lyr2dBack")) $("lyr2dBack").addEventListener("click", function () { open2d(false); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (lyr && !lyr.hidden) { open2d(false); return; }
    if (bul.classList.contains("on")) openBul(false);
  });

  /* ---------- URL 直达：公告栏 / 二维图都能被链接分享 ---------- */
  var q = new URLSearchParams(location.search);
  /* 公告栏默认就展开。杨城新上线的 AI 项目全挂在这上面，
     收起来没人会去点那个按钮，项目就等于没发布。
     只有明确要看二维图的时候才让位（open2d 会把它收掉）。 */
  if (q.get("layer") !== "map") openBul(true);
  if (q.get("layer") === "map") open2d(true);
})();

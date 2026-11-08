/* ============================================================
   YC3D · 虚构杨城（全城）
   这座城不是「一片街区 + 一圈远景」，而是 17 个独立设计的片区拼起来的：
   每个区还是 yc3d-district.js 那一份代码、那一份方案，只是被放到总图的坐标上。
   城市这一层只负责四件事——把地块从地面挖出来、铺澄川河与跨江桥、
   把干道剪到地块之间的缝里、再给整座城一套太阳与天空。
   银白外骨骼、蓝玻璃、工业设施与分层程序云；无 GIS、无地理坐标。
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE, Y = global.YC3D, B = global.YC3D_B;
  if (!THREE || !Y || !B) { console.error("[YC3D] 依赖未加载"); return; }
  var U = Y.U, unitBox = new THREE.BoxGeometry(1, 1, 1);

  var DISTRICTS = Array.isArray(global.YC_DISTRICTS) ? global.YC_DISTRICTS : [];
  var CP = global.YC_CITY_PLAN || null;
  /* 方案表可能比本文件晚一行加载，所以每次都现查 global，不在加载时锁死引用 */
  function PLAN_OF(d) { return typeof global.ycDistrictPlan === "function" ? global.ycDistrictPlan(d) : null; }

  /* ---------------- 城市节点（馆 / 企业 / 设施） ----------------
     节点的坐标不再手写：直接读各区的方案，取 hero 的挂牌与馆体位置，
     这样三维城里那栋楼在哪，列表里那个点就在哪，不会各说各话。 */
  var HALL_INFO = {
    H1: { name: "能力与边界博物馆", short: "能力与边界", href: "h1-museum.html", color: 0xffd98a,
      line: "它表现得很强，究竟证明了什么？" },
    H2: { name: "推理法医馆", short: "推理法医", href: "h2-museum.html", color: 0x7fe3ff,
      line: "解释得通，是否意味着解释真的影响了答案？" },
    H3: { name: "指标失效博物馆", short: "指标失效", href: "h3-museum.html", color: 0xff8ad0,
      line: "分数提高，是否真的让任务变好？" },
    H4: { name: "数据污染博物馆", short: "数据污染", href: "h4-museum.html", color: 0x9dff5c,
      line: "它答对，是泛化、记忆，还是证据无法区分？" },
    H5: { name: "递归坍塌博物馆", short: "递归坍塌", href: "h5-museum.html", color: 0xb49bff,
      line: "数据反复来自模型自身时，哪些信息会消失？" },
    H6: { name: "潜能与预算博物馆", short: "潜能与预算", href: "h6-museum.html", color: 0xffc46b,
      line: "一次失败，是能力不足、调用不当，还是预算不足？" }
  };
  /* 方案里的原型名 → 馆号。六个馆各有一个专属原型，全城只出现一次。 */
  var HALL_TYPE = { museum: "H1", forensicHall: "H2", twist: "H3", archiveFrustum: "H4",
    collapseFunnel: "H5", archMuseum: "H6" };
  /* 企业文案：方案里只有挂牌名，业态与说明在这里补。没登记的走通用文案。 */
  var GIANT_INFO = {
    "深智": { en: "DEEPWIT", biz: "基础模型 · 推理集群", note: "全区最高的塔，蓝玻璃幕墙与低层推理机房由实体管廊相连。" },
    "烛龙": { en: "ZHULONG", biz: "能源 · 聚变中试", note: "圆柱塔身配径向散热肋，独立设备基座上没有一条真实能源数据。" },
    "白泽": { en: "BAIZE", biz: "安全对齐 · 红队", note: "白色遮阳外壳与双层复核平台，形体本身就是一次对抗演练。" },
    "澜舟": { en: "LANZHOU", biz: "多模态 · 端侧", note: "船形收分塔楼与连续遮阳肋，底层是端侧测试车间。" },
    "格物": { en: "GEWU", biz: "材料发现 · 科学计算", note: "退台体量按实验层级叠起，材料测试设备就架在平台上。" },
    "万象": { en: "WANXIANG", biz: "生成式内容 · 版权清算", note: "穹顶覆盖展示中庭，四向基座压住体量。" },
    "星野算力": { en: "STARFIELD", biz: "智算中心 · 液冷", note: "退台服务器楼、换热鳍片与循环风机；动画是运行示意，不是遥测。" },
    "熵减": { en: "ENTROPY", biz: "数据治理 · 冷存储", note: "不等尺度冷存储板楼，退台上铺满光伏与检修通道。" },
    "天问": { en: "TIANWEN", biz: "知识推理 · 检索", note: "玻璃穹顶覆盖协作研究中庭，塔身是湖区的最高点。" },
    "明镜": { en: "MINGJING", biz: "模型安全 · 评测", note: "双层复核平台环绕安全研究楼，冷青石材里唯一的玻璃体量。" },
    "灵犀": { en: "LINGXI", biz: "通用模型 · 多模态", note: "核心筒加一对张开的双翼，两翼之间是模型实验庭院。" },
    "川启": { en: "CHUANQI", biz: "生成式设计 · 工业软件", note: "架空球壳是展示中心，四条支腿落在人工水阶上。" },
    "叠境": { en: "DIEJING", biz: "世界模型 · 仿真", note: "同一层平面被叠了四次，剖面比立面更能说明它在做什么。" },
    "归墟": { en: "GUIXU", biz: "长上下文 · 检索增强", note: "越往上越收的梯台，像一份被反复折叠的档案。" },
    "织序": { en: "ZHIXU", biz: "多智能体 · 调度", note: "外挂连廊把四座塔串成一张网，网就是它的产品。" },
    "千镜": { en: "QIANJING", biz: "合成数据 · 自博弈", note: "镜面幕墙朝内倾斜，整栋楼只在反射邻栋。" },
    "昇界": { en: "SHENGJIE", biz: "通用智能 · 训练", note: "全城第二高的塔，也是唯一在六边形街区里立方的体量。" },
    "极栈": { en: "JIZHAN", biz: "推理加速 · 编译", note: "塔身由一层层挑出的栈板堆成，每层都是一次算子融合。" },
    "言枢": { en: "YANSHU", biz: "语音 · 实时交互", note: "六边形核心外挂一圈声学环廊。" },
    "观澜": { en: "GUANLAN", biz: "自动驾驶 · 仿真", note: "四座塔里最高的一座，退台朝向澄川河。" },
    "知微": { en: "ZHIWEI", biz: "感知 · 端侧推理", note: "塔基压着一整片仿真测试场。" },
    "星槎": { en: "XINGCHA", biz: "具身智能 · 机器人", note: "低层是整层通高的机器人试验厅。" },
    "澜图": { en: "LANTU", biz: "空间智能 · 地图", note: "外表皮按等高线分带，从远处看像一张立起来的地形图。" }
  };
  var INFRA_TYPE = {
    stationHall: { name: "西园站", category: "交通", note: "高架城际线西段站厅、换乘平台与站前广场。" },
    arcadeStation: { name: "杨城中央站", category: "交通", note: "跨江主桥以南的城市级换乘站，站厅压在骑楼街市之下。" },
    elevatedStation: { name: "东湾站", category: "交通", note: "服务东部居住片区与学园的高架站。" },
    hospitalArc: { name: "杨城综合医院", category: "医疗", note: "弧形住院楼、门诊庭院与急救入口围合的医疗组团。" },
    settlingYard: { name: "澄湾水务中心", category: "水务", note: "沉淀池、泵房与调蓄设施；不接入真实水务数据。" },
    freightShed: { name: "东部综合物流港", category: "物流", note: "分拣仓、货运月台与城市配送场。" },
    portQuay: { name: "制造港码头", category: "物流", note: "岸桥列与集装箱堆场，岸线以东就是海。" },
    campusCourtHall: { name: "创新大学", category: "教育", note: "教学楼与中央步行庭院组成的创新教育园。" },
    hiveCluster: { name: "蜂巢实验舱群", category: "科研", note: "六边形实验舱连成的蜂巢，中心是冷却与管廊。" },
    pvField: { name: "光伏海", category: "能源", note: "行距 13 米、板宽 4.2 米的板阵，全区唯一的地面材料。" }
  };
  function slug(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
    return "g" + h.toString(36);
  }
  /* 从 17 份方案里把节点抽出来：馆按原型认，企业按挂牌认，设施按原型认。 */
  function deriveNodes() {
    var halls = [], giants = [], infra = [], seenG = {}, seenI = {};
    DISTRICTS.forEach(function (d) {
      var p = PLAN_OF(d); if (!p || !p.hero) return;
      (p.hero || []).forEach(function (h) {
        if (!isFinite(h.x) || !isFinite(h.z)) return;
        var x = Math.round(d.cx + h.x), z = Math.round(d.cz + h.z);
        var hid = HALL_TYPE[h.type];
        if (hid && (d.museums || []).indexOf(hid) >= 0) {
          var info = HALL_INFO[hid];
          halls.push({ id: hid, name: info.name, short: info.short, href: info.href, color: info.color,
            line: info.line, x: x, z: z, h: h.h || d.maxH, zone: d.id, kind: "hall" });
          return;
        }
        if (h.sign && h.sign.name) {
          var nm = h.sign.name, meta = GIANT_INFO[nm] || {};
          var node = { id: slug(nm), name: nm, en: meta.en || (h.sign.en || ""), biz: meta.biz || "AI 企业 · 虚构运行设定",
            note: meta.note || "虚构企业的实体总部与运行示意，不连接任何真实业务数据。",
            x: x, z: z, h: h.h || 40, color: 0x8fd8ff, zone: d.id, kind: "giant" };
          /* 同名塔出现在多个区时（智算谷的六座算力塔），只保留最高的一座 */
          if (!seenG[nm] || seenG[nm].h < node.h) { seenG[nm] = node; }
          return;
        }
        var inf = INFRA_TYPE[h.type];
        if (inf && !seenI[h.type]) {
          seenI[h.type] = 1;
          infra.push({ id: h.type, name: inf.name, category: inf.category, note: inf.note,
            x: x, z: z, h: h.h || 12, color: 0x9fc4d0, zone: d.id, kind: "infra" });
        }
      });
    });
    Object.keys(seenG).forEach(function (k) { giants.push(seenG[k]); });
    giants.sort(function (a, b) { return b.h - a.h; });
    var order = ["H1", "H2", "H3", "H4", "H5", "H6"];
    halls.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
    return { halls: halls, giants: giants, infra: infra };
  }
  var NODES = deriveNodes();

  function timeState(hour) {
    if (typeof hour !== "number" || !isFinite(hour)) throw new TypeError("时间必须是有限小时数");
    var h = hour % 24;
    if (h < 0) h += 24;
    var angle = (h - 6) / 24 * Math.PI * 2;
    var elevation = Math.sin(angle), day = U.smooth((elevation + 0.12) / 0.32);
    var sun = U.smooth(elevation / 0.48), nightSky = U.smooth((-elevation - 0.04) / 0.25);
    var twilight = (1 - U.smooth(Math.abs(elevation) / 0.30)) * day;
    var phases = [[0, "深夜"], [4, "凌晨"], [5.5, "破晓"], [6, "日出"], [7, "清晨"], [9, "上午"],
      [12, "正午"], [13, "午后"], [17, "黄昏"], [18, "暮色"], [19, "入夜"], [23, "深夜"]];
    var name = phases[0][1];
    phases.forEach(function (p) { if (h >= p[0]) name = p[1]; });
    return { hour: h, name: name, day: day, night: 1 - day, nightSky: nightSky, elevation: elevation,
      sun: sun, twilight: twilight, exposure: U.lerp(1.30, 1.02, day),
      direction: new THREE.Vector3(Math.cos(angle) * 0.85, elevation, -0.38).normalize() };
  }

  /* 两层平面云的高度投影、域扭曲噪声、迎光边与阴影腹；不是体积云。 */
  function atmosphere() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDay: { value: 1 }, uStar: { value: 0 }, uAur: { value: 0 }, uTwilight: { value: 0 },
        uSun: { value: new THREE.Vector3(0, 1, -0.38).normalize() }, uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() } },
      vertexShader: "varying vec3 vWorld; void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}",
      fragmentShader: [
        "uniform float uTime,uDay,uStar,uAur,uTwilight; uniform vec3 uSun,uTop,uMid,uHor,uGround; varying vec3 vWorld;",
        "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
        "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
        "float fbm(vec2 p){float f=0.0,a=0.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=mat2(1.62,1.17,-1.17,1.62)*p;a*=0.5;}return f;}",
        "float cloud(vec2 p){float n=fbm(p+vec2(fbm(p*0.43),fbm(p*0.43+7.3))*1.8);return smoothstep(0.47,0.69,n);}",
        "void main(){",
        " vec3 d=normalize(vWorld-cameraPosition);float y=max(d.y,0.0);",
        " vec3 c=mix(uHor,uMid,smoothstep(0.0,0.28,y));c=mix(c,uTop,smoothstep(0.28,1.0,y));",
        " c=mix(c,uGround,smoothstep(0.0,0.55,-d.y));",
        " float sd=max(dot(d,uSun),0.0);c+=vec3(1.0,0.79,0.53)*pow(sd,14.0)*(0.14+uTwilight)*uDay;",
        " float disc=smoothstep(0.99955,0.99978,sd);c+=vec3(5.0,4.3,3.3)*disc*uDay;",
        " if(d.y>0.025){",
        "  vec2 p=(cameraPosition.xz+d.xz*max(880.0-cameraPosition.y,0.0)/max(d.y,0.025))*0.0031+vec2(uTime*0.004,0.0);",
        "  vec2 p2=(cameraPosition.xz+d.xz*max(1040.0-cameraPosition.y,0.0)/max(d.y,0.025))*0.0018-vec2(uTime*0.0015,0.0);",
        "  float a=cloud(p)*(1.0-smoothstep(820.0,880.0,cameraPosition.y)),b=cloud(p2)*0.38*(1.0-smoothstep(980.0,1040.0,cameraPosition.y));",
        "  float cover=(a+b*(1.0-a))*smoothstep(0.025,0.12,d.y);",
        "  float rim=clamp((cloud(p-uSun.xz*0.16)-a)*2.0+0.5,0.0,1.0);",
        "  vec3 white=mix(vec3(0.022,0.038,0.072),mix(vec3(0.67,0.82,1.03),vec3(1.72,1.71,1.62),rim),uDay);",
        "  white=mix(white,vec3(1.60,0.72,0.36),uTwilight*0.58);c=mix(c,white,cover*0.96);",
        "  float occlusion=1.0-cover;c+=vec3(0.82,0.91,1.0)*pow(sd,65.0)*cover*0.18*uDay;",
        "  vec2 sp=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.0,1.0)))*vec2(155.0,180.0);",
        "  vec2 cell=floor(sp),f=fract(sp);float r=hash(cell);",
        "  float star=step(0.994,r)*(1.0-smoothstep(0.04,0.23,length(f-vec2(0.5))))*smoothstep(0.0,0.25,d.y);",
        "  c+=vec3(0.8,0.9,1.0)*star*uStar*(0.85+0.15*sin(uTime+r*50.0))*2.0*occlusion;",
        "  float curtain=fbm(vec2(atan(d.z,d.x)*3.2+uTime*0.014,d.y*6.5-uTime*0.02));",
        "  float aur=smoothstep(0.58,0.78,curtain)*smoothstep(0.16,0.40,d.y)*(1.0-smoothstep(0.72,0.95,d.y));",
        "  c+=vec3(0.11,0.42,0.36)*aur*uAur*occlusion;",
        " }",
        " gl_FragColor=vec4(max(c,vec3(0.0)),1.0);",
        "}"
      ].join("\n"), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false
    });
  }

  /* 天空、太阳、半球光、月轮与环境贴图：全城地图与区域街区共用同一套光照。
     全城的阴影只覆盖镜头附近一块，靠 followShadow 跟着视点走——
     一张 2048 的贴图摊到 6 公里见方的城上，每像素 3 米，阴影会糊成一片脏斑。 */
  function makeSkyRig(scene, o) {
    o = o || {};
    var halfX = o.shadowHalfX || 1900, halfZ = o.shadowHalfZ || 1900;
    var rig = { state: null };
    var sun = new THREE.DirectionalLight(0xfff3df, 3.2);
    sun.target.position.set(o.targetX || 0, 0, o.targetZ || 0); sun.castShadow = true;
    sun.shadow.mapSize.set(o.mapSize || 2048, o.mapSize || 2048);
    sun.shadow.camera.left = -halfX; sun.shadow.camera.right = halfX;
    sun.shadow.camera.top = halfZ; sun.shadow.camera.bottom = -halfZ;
    sun.shadow.camera.near = o.shadowNear || 1; sun.shadow.camera.far = o.shadowFar || 6200;
    sun.shadow.normalBias = o.normalBias === undefined ? 0.65 : o.normalBias;
    sun.shadow.bias = o.bias === undefined ? -0.00015 : o.bias;
    sun.shadow.autoUpdate = false;
    scene.add(sun, sun.target);
    var hemi = new THREE.HemisphereLight(0xc8e8ff, 0x9d9b8b, 1.25); scene.add(hemi);
    var skyMat = atmosphere(), sky = new THREE.Mesh(new THREE.SphereGeometry(o.skyRadius || 1100, 32, 24), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    var envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, skyMat));
    var pmrem = null, environment = null, environmentHour = null;
    scene.fog = new THREE.FogExp2(o.fogColor === undefined ? 0xb3d4e6 : o.fogColor, o.fogDensity || 0.00085);
    scene.background = null;

    var moonCanvas = document.createElement("canvas"); moonCanvas.width = 512; moonCanvas.height = 256;
    var mc = moonCanvas.getContext("2d"), mr = U.rng(31415);
    mc.fillStyle = "#d9e2ee"; mc.fillRect(0, 0, 512, 256);
    for (var q = 0; q < 160; q++) {
      mc.beginPath(); mc.arc(mr() * 512, mr() * 256, 2 + mr() * 17, 0, Math.PI * 2);
      mc.fillStyle = "rgba(100,123,154," + (0.04 + mr() * 0.22) + ")"; mc.fill();
    }
    var moonTexture = new THREE.CanvasTexture(moonCanvas); moonTexture.encoding = THREE.sRGBEncoding;
    var moon = new THREE.Mesh(new THREE.SphereGeometry(43, 32, 24), new THREE.MeshBasicMaterial({ map: moonTexture,
      color: 0xd8e5f5, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    moon.position.set((o.targetX || 0) - 392, 296, (o.targetZ || 0) - 700); scene.add(moon);
    var moonGlow = new THREE.Mesh(new THREE.SphereGeometry(51, 24, 16), B.additive(0x9fc8ff, 0.30, 0.06));
    var moonHalo = new THREE.Mesh(new THREE.SphereGeometry(65, 24, 16), B.additive(0x8cb6e0, 0.20, 0.025));
    moonGlow.position.copy(moon.position); moonHalo.position.copy(moon.position); scene.add(moonGlow, moonHalo);

    rig.sun = sun; rig.hemi = hemi; rig.skyMat = skyMat; rig.sky = sky;
    rig.moon = moon; rig.moonGlow = moonGlow; rig.moonHalo = moonHalo;
    rig.sunDistance = o.sunDistance || 1100;
    rig.updateEnvironment = function (renderer) {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      var next = pmrem.fromScene(envScene, 0.02, 1, 2400); scene.environment = next.texture;
      if (environment) environment.dispose(); environment = next;
      environmentHour = rig.state ? rig.state.hour : null;
    };
    rig.inspect = function () {
      return { environment: { ready: !!environment, hour: environmentHour },
        sky: { stars: skyMat.uniforms.uStar.value, aurora: skyMat.uniforms.uAur.value } };
    };
    rig.setTime = function (state) {
      rig.state = state;
      var day = state.day, nightSky = state.nightSky;
      skyMat.uniforms.uDay.value = day; skyMat.uniforms.uStar.value = nightSky * nightSky; skyMat.uniforms.uAur.value = nightSky * 0.28;
      skyMat.uniforms.uTwilight.value = state.twilight; skyMat.uniforms.uSun.value.copy(state.direction);
      skyMat.uniforms.uTop.value.setRGB(U.lerp(0.007, 0.085, day), U.lerp(0.014, 0.34, day), U.lerp(0.048, 0.86, day));
      skyMat.uniforms.uMid.value.setRGB(U.lerp(0.018, 0.27, day), U.lerp(0.034, 0.65, day), U.lerp(0.095, 1.12, day));
      skyMat.uniforms.uHor.value.setRGB(U.lerp(0.060, 0.77, day) + state.twilight * 0.38, U.lerp(0.085, 1.03, day), U.lerp(0.155, 1.23, day) - state.twilight * 0.32);
      skyMat.uniforms.uGround.value.setRGB(U.lerp(0.014, 0.22, day), U.lerp(0.025, 0.28, day), U.lerp(0.045, 0.29, day));
      sun.position.copy(sun.target.position).addScaledVector(state.direction, rig.sunDistance);
      sun.intensity = (o.sunIntensity === undefined ? 1.65 : o.sunIntensity) * state.sun;
      sun.color.setRGB(1, U.lerp(0.68, 0.94, state.sun), U.lerp(0.43, 0.84, state.sun));
      sun.visible = state.elevation > 0;
      hemi.intensity = U.lerp(0.25, 0.48, day) * (o.hemiScale || 1);
      hemi.color.setRGB(U.lerp(0.19, 0.70, day), U.lerp(0.30, 0.87, day), U.lerp(0.57, 1.0, day));
      hemi.groundColor.setRGB(U.lerp(0.06, 0.46, day), U.lerp(0.10, 0.45, day), U.lerp(0.18, 0.38, day));
      scene.fog.color.copy(skyMat.uniforms.uHor.value).multiplyScalar(U.lerp(0.52, 0.72, day));
      scene.fog.density = U.lerp(0.00034, 0.00011, day) * (o.fogScale || 1);
      moon.visible = moonGlow.visible = moonHalo.visible = nightSky > 0.01;
      moon.material.opacity = nightSky * 0.92;
      moonGlow.material.opacity = 0.06 * nightSky; moonHalo.material.opacity = 0.025 * nightSky;
    };
    rig.update = function (t, camera) {
      if (camera) sky.position.copy(camera.position);
      if (skyMat.uniforms.uTime) skyMat.uniforms.uTime.value = t;
    };
    return rig;
  }

  function solidBox(group, w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d);
    m.position.set(x, y, z); m.castShadow = h > 0.5; m.receiveShadow = true; group.add(m); return m;
  }
  function archSpan(group, a, b, rise, thickness, depth, mat) {
    var dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz), dy = b[1] - a[1];
    var shape = new THREE.Shape(); shape.moveTo(0, 0);
    shape.quadraticCurveTo(len * 0.5, dy * 0.5 + rise * 2, len, dy);
    shape.lineTo(len, dy + thickness);
    shape.quadraticCurveTo(len * 0.5, dy * 0.5 + rise * 2 + thickness, 0, thickness); shape.closePath();
    var geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: 28, steps: 1 });
    geo.translate(0, 0, -depth * 0.5);
    var mesh = new THREE.Mesh(geo, mat); mesh.position.set(a[0], a[1], a[2]); mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }

  /* 把一条轴对齐的路段剪掉落在片区里的部分。
     道路是长直的、片区是矩形，所以这只是一维区间减法——
     剪完剩下的正好是地块之间的缝，干道不会一头撞进别人的街网里。 */
  function clipRun(a, b, lo, hi) {
    var out = [], x0 = Math.min(a, b), x1 = Math.max(a, b);
    var cuts = [];
    for (var i = 0; i < lo.length; i++) {
      var l = Math.max(x0, lo[i][0]), h = Math.min(x1, lo[i][1]);
      if (h > l) cuts.push([l, h]);
    }
    cuts.sort(function (p, q) { return p[0] - q[0]; });
    var cur = x0;
    for (var k = 0; k < cuts.length; k++) {
      if (cuts[k][0] > cur) out.push([cur, Math.min(cuts[k][0], x1)]);
      cur = Math.max(cur, cuts[k][1]);
    }
    if (cur < x1) out.push([cur, x1]);
    return out;
  }

  /* 天气/时间共用的画面参数；全城的曝光比近景低一档，否则整片浅色屋顶会烧白 */
  function buildCity(scene, opts) {
    opts = opts || {};
    var api = { halls: [], giants: [], infrastructure: [], pickables: [], state: null,
      districts: [], nodes: NODES };
    var BOUNDS = CP ? CP.bounds : { minX: -3120, maxX: 3260, minZ: -2700, maxZ: 2850 };
    var signs = [], effects = [], materials = [], facades = [], nightObjects = [];
    scene.fog = new THREE.FogExp2(0xb3d4e6, 0.00085); scene.background = null;

    var rig = makeSkyRig(scene, { shadowHalfX: 1900, shadowHalfZ: 1900, shadowNear: 1400, shadowFar: 5200,
      mapSize: 2048, normalBias: 0.5, bias: -0.00008, sunDistance: 2800, skyRadius: 7000,
      fogScale: 0.46, sunIntensity: 1.52, hemiScale: 0.72, targetX: 0, targetZ: 0 });
    var sun = rig.sun, hemi = rig.hemi, skyMat = rig.skyMat;
    var moon = rig.moon;
    api.sun = sun; api.hemi = hemi; api.sky = skyMat; api.moon = moon;
    api.updateEnvironment = rig.updateEnvironment;
    api.cityBounds = BOUNDS;

    /* ---------------- 地表 ----------------
       地面要给 17 块地各开一个洞：片区自带地面，叠在同一高度上会逐像素闪烁。
       河也一样，洞开到江堤外沿，堤岸单独铺一条带子填进去。 */
    var PAD = 22;
    var plates = DISTRICTS.map(function (d) { return { d: d, r: CP ? CP.plateRect(d, PAD) :
      { minX: d.cx - d.hx - PAD, maxX: d.cx + d.hx + PAD, minZ: d.cz - d.hz - PAD, maxZ: d.cz + d.hz + PAD } }; });
    var riverAt = CP ? CP.riverAt : function (x) { return { z: 200, half: 100 }; };
    var BANK = 74;
    var riverL = [], riverR = [], bankL = [], bankR = [];
    var RX0 = BOUNDS.minX - 700, RX1 = BOUNDS.maxX + 700;
    for (var rx = RX0; rx <= RX1; rx += 40) {
      var rp = riverAt(rx);
      riverL.push([rx, rp.z - rp.half]); riverR.push([rx, rp.z + rp.half]);
      bankL.push([rx, rp.z - rp.half - BANK]); bankR.push([rx, rp.z + rp.half + BANK]);
    }
    var LAND = { minX: BOUNDS.minX - 1400, maxX: BOUNDS.maxX + 1400,
      minZ: BOUNDS.minZ - 1100, maxZ: BOUNDS.maxZ + 1100 };
    var landShape = new THREE.Shape();
    landShape.moveTo(LAND.minX, -LAND.maxZ); landShape.lineTo(LAND.maxX, -LAND.maxZ);
    landShape.lineTo(LAND.maxX, -LAND.minZ); landShape.lineTo(LAND.minX, -LAND.minZ); landShape.closePath();
    /* 江洞：ShapeGeometry 绕 X 轴转 -90° 之后世界 z = -shapeY，所以纵坐标取负 */
    var riverHole = new THREE.Path();
    var ring = bankL.map(function (p) { return [p[0], -p[1]]; })
      .concat(bankR.slice().reverse().map(function (p) { return [p[0], -p[1]]; }));
    riverHole.moveTo(ring[0][0], ring[0][1]);
    for (var rh = 1; rh < ring.length; rh++) riverHole.lineTo(ring[rh][0], ring[rh][1]);
    riverHole.closePath(); landShape.holes.push(riverHole);
    plates.forEach(function (p) {
      var h = new THREE.Path(), ins = 3;
      h.moveTo(p.r.minX + ins, -(p.r.minZ + ins)); h.lineTo(p.r.maxX - ins, -(p.r.minZ + ins));
      h.lineTo(p.r.maxX - ins, -(p.r.maxZ - ins)); h.lineTo(p.r.minX + ins, -(p.r.maxZ - ins)); h.closePath();
      landShape.holes.push(h);
    });
    var groundMat = B.ground({ base: 0x7f8b76, color: 0x64765e, color2: 0x7e8c72, grid: 300,
      gridK: 0.34, flow: 0.05, fade: 8200 });
    groundMat.polygonOffset = true; groundMat.polygonOffsetFactor = 2; groundMat.polygonOffsetUnits = 8;
    var ground = new THREE.Mesh(new THREE.ShapeGeometry(landShape, 1), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; scene.add(ground); api.ground = groundMat;
    var groundShadow = new THREE.Mesh(ground.geometry, new THREE.ShadowMaterial({ opacity: 0.22,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 }));
    groundShadow.rotation.copy(ground.rotation); groundShadow.position.copy(ground.position);
    groundShadow.position.y += 0.03; groundShadow.receiveShadow = true; scene.add(groundShadow);

    function ribbon(a, b, y, mat, add) {
      var pos = [], idx = [];
      for (var i = 0; i < a.length; i++) {
        pos.push(a[i][0], y, a[i][1], b[i][0], y, b[i][1]);
        if (i < a.length - 1) { var k = i * 2; idx.push(k, k + 2, k + 3, k, k + 3, k + 1); }
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      var m = new THREE.Mesh(geo, mat); if (add !== false) scene.add(m); return m;
    }
    var waterMat = B.water({ color: 0x3a7896, glow: 0xb4dcec, glow2: 0x96cce8 });
    ribbon(riverL, riverR, -0.35, waterMat); api.water = waterMat;
    var bankMat = new THREE.MeshStandardMaterial({ color: 0x62815c, roughness: 0.96, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    ribbon(riverL, bankL, 0.05, bankMat); ribbon(riverR, bankR, 0.05, bankMat);

    /* ---------------- 道路 ----------------
       三层：人行道 0.10 / 路缘 0.26 / 车行道 0.42。全城尺度上这三层基本读不出来，
       但少了它们，干道就只是一条贴在草地上的深色带子。 */
    var asphalt = new THREE.MeshStandardMaterial({ color: 0x2d333a, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    var walkMat = new THREE.MeshStandardMaterial({ color: 0x8d8b80, roughness: 0.94,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    var kerbMat = new THREE.MeshStandardMaterial({ color: 0xa8a496, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    var roads = new THREE.Group(); scene.add(roads);
    function hCuts(z) {
      var out = [];
      plates.forEach(function (p) { if (z > p.r.minZ && z < p.r.maxZ) out.push([p.r.minX, p.r.maxX]); });
      return out;
    }
    function vCuts(x) {
      var out = [];
      plates.forEach(function (p) { if (x > p.r.minX && x < p.r.maxX) out.push([p.r.minZ, p.r.maxZ]); });
      return out;
    }
    function lay(axis, fixed, from, to, w, cls) {
      var pieces = axis === "x" ? clipRun(from, to, hCuts(fixed)) : clipRun(from, to, vCuts(fixed));
      pieces.forEach(function (seg) {
        var len = seg[1] - seg[0], mid = (seg[0] + seg[1]) / 2;
        if (len < 26) return;
        if (axis === "x") {
          solidBox(roads, len, 0.12, w + 12, mid, 0.10, fixed, walkMat);
          solidBox(roads, len, 0.16, w + 2, mid, 0.26, fixed, kerbMat);
          solidBox(roads, len, 0.16, w, mid, 0.42, fixed, asphalt);
        } else {
          solidBox(roads, w + 12, 0.12, len, fixed, 0.10, mid, walkMat);
          solidBox(roads, w + 2, 0.16, len, fixed, 0.26, mid, kerbMat);
          solidBox(roads, w, 0.16, len, fixed, 0.42, mid, asphalt);
        }
      });
    }
    /* 片区四周的联络路：地块边界外 30 米走一圈，地块之间才连得起来 */
    var RING = 30, RINGW = 15;
    plates.forEach(function (p) {
      var r = p.r;
      lay("x", r.minZ - RING, r.minX - RING, r.maxX + RING, RINGW, "street");
      lay("x", r.maxZ + RING, r.minX - RING, r.maxX + RING, RINGW, "street");
      lay("z", r.minX - RING, r.minZ - RING, r.maxZ + RING, RINGW, "street");
      lay("z", r.maxX + RING, r.minZ - RING, r.maxZ + RING, RINGW, "street");
    });
    (CP ? CP.roads : []).forEach(function (rd) {
      if (rd.ring) return;
      var a = rd.a, b = rd.b;
      if (Math.abs(a[1] - b[1]) < 1) lay("x", a[1], a[0], b[0], rd.w, rd.cls);
      else if (Math.abs(a[0] - b[0]) < 1) lay("z", a[0], a[1], b[1], rd.w, rd.cls);
    });

    /* ---------------- 跨江桥 ----------------
       桥面 7 米高、两孔拱，桥头直接落进两岸的滨江路。 */
    (CP ? CP.bridges : []).forEach(function (br) {
      var g = new THREE.Group(), deckY = 7, len = br.z1 - br.z0;
      solidBox(g, br.w, 1.6, len, br.x, deckY, (br.z0 + br.z1) / 2, kerbMat);
      solidBox(g, br.w - 6, 0.16, len - 6, br.x, deckY + 0.86, (br.z0 + br.z1) / 2, asphalt);
      [-1, 1].forEach(function (s) {
        solidBox(g, 4.5, 0.22, len - 8, br.x + s * (br.w / 2 - 3), deckY + 0.96, (br.z0 + br.z1) / 2, walkMat);
        archSpan(g, [br.x + s * (br.w / 2 - 2), deckY - 0.4, br.z0 + 10],
          [br.x + s * (br.w / 2 - 2), deckY - 0.4, br.z1 - 10], 15, 1.8, 1.6, kerbMat);
      });
      var mid = (br.z0 + br.z1) / 2;
      [br.z0 + 26, mid, br.z1 - 26].forEach(function (pz) {
        solidBox(g, 4.2, deckY, 4.2, br.x, deckY / 2, pz, kerbMat);
      });
      scene.add(g);
    });

    /* ---------------- 城际高架 ----------------
       沿北岸的廊道贯穿全城，两端没入雾里；桥墩落在道路之外。 */
    if (CP && CP.rail) {
      var railG = new THREE.Group(), ry = CP.rail.y;
      var pts = CP.rail.pts.map(function (p) { return new THREE.Vector3(p[0], ry, p[1]); });
      var curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.16);
      var deckMat = new THREE.MeshStandardMaterial({ color: 0xb4b2a8, roughness: 0.9 });
      var railMat = new THREE.MeshStandardMaterial({ color: 0xa9b1b5, roughness: 0.32, metalness: 0.88 });
      var N = 64;
      for (var i = 0; i < N; i++) {
        var t0 = i / N, t1 = (i + 1) / N;
        var a = curve.getPointAt(t0), b = curve.getPointAt(t1);
        var len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        var seg = solidBox(railG, 13, 1.8, len + 2, mid.x, mid.y, mid.z, deckMat);
        seg.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (i % 2 === 0) {
          var p0 = a.clone(); p0.y = 0;
          solidBox(railG, 3.2, ry - 1, 3.2, p0.x, (ry - 1) / 2, p0.z, deckMat);
        }
      }
      [-1, 1].forEach(function (s) {
        var off = [];
        for (var k = 0; k <= 120; k++) {
          var pt = curve.getPointAt(k / 120), tg = curve.getTangentAt(k / 120);
          off.push(new THREE.Vector3(pt.x - tg.z * s * 3.6, pt.y + 0.9, pt.z + tg.x * s * 3.6));
        }
        var tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(off), 240, 0.7, 6, false), railMat);
        tube.castShadow = true; railG.add(tube);
      });
      /* 站台：高架站厅压在轨道上方，下面留空 */
      (CP.rail.stations || []).forEach(function (st) {
        var sp = null;
        for (var q = 0; q <= 200; q++) {
          var c = curve.getPointAt(q / 200);
          if (!sp || Math.abs(c.x - st.x) < Math.abs(sp.x - st.x)) sp = c.clone();
        }
        solidBox(railG, 74, 3.2, 26, sp.x, ry + 7.4, sp.z, deckMat);
        solidBox(railG, 66, 6.4, 16, sp.x, ry + 12.4, sp.z, new THREE.MeshStandardMaterial({ color: 0x9fb0b6, roughness: 0.4, metalness: 0.25 }));
        solidBox(railG, 78, 1.2, 30, sp.x, ry + 16.4, sp.z, deckMat);
        [-1, 1].forEach(function (s) {
          solidBox(railG, 5, 7, 26, sp.x + s * 30, ry - 3.4, sp.z, deckMat);
        });
      });
      scene.add(railG); api.rail = railG;
    }

    /* ---------------- 17 个片区 ----------------
       每个区都走同一条 build：近景里长什么样，在这里就长什么样。
       地块先建成独立 Group（此时世界矩阵还是局部的，批处理才能正确），
       量完再挂到总图坐标上。 */
    var builtGroups = [];
    var t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (global.YC3D_DISTRICT && global.ycDistrictPlan) {
      DISTRICTS.forEach(function (d) {
        var plan = PLAN_OF(d);
        if (!plan) return;
        var host = new THREE.Group();
        var sub;
        try {
          sub = global.YC3D_DISTRICT.build(host, plan, { hour: opts.hour, city: { hx: d.hx + PAD, hz: d.hz + PAD, id: d.id } });
        } catch (e) {
          console.error("[YC3D] 片区生成失败 " + d.id + "：" + (e && e.message));
          return;
        }
        host.position.set(d.cx, 0, d.cz);
        scene.add(host);
        /* 实例网格保持 frustumCulled=false：three r150 的视锥剔除只认几何包围球，
           而同一份几何被同区多个批次复用，改包围球会把别的批次一起剪错。
           阴影只覆盖镜头附近，靠 followShadow 里按距离关掉远处批次的投影。 */
        /* 点哪栋楼都归这个片区：地图上随手一点就能打开它的档案 */
        var node = { id: d.id, name: d.name, en: d.en, color: d.color, x: d.cx, z: d.cz,
          h: d.maxH, zone: d.id, kind: "district", line: d.desc, href: "district.html?zone=" + d.id };
        host.traverse(function (o) { if (o.isMesh && !o.userData.owner) o.userData.owner = node; });
        api.districts.push({ d: d, api: sub, group: host, node: node });
        builtGroups.push(host);
        api.pickables.push(host);
        if (sub.state) api.state = api.state || sub.state;
      });
    }
    var buildMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    /* ---------------- 行道树 ----------------
       片区一圈、江岸两带。全城尺度上一棵树只有两三个像素，
       所以只要树干和树冠两团体量，不做树枝。 */
    var treePts = [];
    plates.forEach(function (p) {
      var r = p.r, off = RING + 26, step = 34;
      for (var x = r.minX - off; x <= r.maxX + off; x += step) {
        treePts.push([x, r.minZ - off]); treePts.push([x, r.maxZ + off]);
      }
      for (var z = r.minZ - off; z <= r.maxZ + off; z += step) {
        treePts.push([r.minX - off, z]); treePts.push([r.maxX + off, z]);
      }
    });
    for (var bi = 0; bi < bankL.length; bi += 2) {
      treePts.push([bankL[bi][0], bankL[bi][1] - 26]); treePts.push([bankR[bi][0], bankR[bi][1] + 26]);
    }
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b563f, roughness: 0.96 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a4a, roughness: 0.94 });
    var trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 6), trunkMat, treePts.length);
    var crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(6.4, 8, 6), leafMat, treePts.length);
    var dummy = new THREE.Object3D(), trnd = U.rng(7788);
    treePts.forEach(function (p, i) {
      var sc = 0.8 + trnd() * 0.7;
      dummy.position.set(p[0], 4.5 * sc, p[1]); dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 11 * sc; dummy.scale.set(sc, sc * 1.25, sc); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    crowns.castShadow = true; crowns.receiveShadow = true; trunks.receiveShadow = true;
    scene.add(trunks, crowns); api.greenery = crowns;

    /* ---------------- 节点注册 ---------------- */
    function registerNode(o, group) {
      group.userData[o.kind] = o;
      group.traverse(function (m) { if (m.isMesh) { m.userData.owner = o; api.pickables.push(m); } });
    }
    NODES.halls.forEach(function (h) { api.halls.push(h); });
    NODES.giants.forEach(function (g) { api.giants.push(g); });
    NODES.infra.forEach(function (f) { api.infrastructure.push(f); });
    api.nodes = { halls: api.halls, giants: api.giants, infra: api.infrastructure };

    scene.traverse(function (o) {
      if (!o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach(function (m) {
        if (!m || materials.indexOf(m) >= 0) return; materials.push(m);
        if (m.uniforms && m.uniforms.uLit) facades.push({ mat: m, initial: m.uniforms.uLit.value });
        if (m !== skyMat && m !== moon.material && !m.isShadowMaterial &&
          (m.transparent || (m.isMeshBasicMaterial && m.toneMapped === false))) {
          effects.push({ mat: m, opacity: m.opacity, color: m.color ? m.color.clone() : null,
            shaderOpacity: m.uniforms && m.uniforms.uOpacity ? m.uniforms.uOpacity.value : null });
        }
      });
    });

    var shadowHour = null;
    api.inspect = function () {
      var s = api.state || timeState(12);
      var b = 0, tris = 0;
      api.districts.forEach(function (x) { b += (x.api.inspect().urban || {}).buildings || 0; });
      return { hour: s.hour, name: s.name, day: s.day, night: s.night, nightSky: s.nightSky,
        exposure: s.exposure,
        sun: { visible: sun.visible, intensity: sun.intensity, position: sun.position.toArray(),
          direction: s.direction.toArray(), color: sun.color.toArray() },
        hemi: { intensity: hemi.intensity, sky: hemi.color.toArray(), ground: hemi.groundColor.toArray() },
        sky: { top: skyMat.uniforms.uTop.value.toArray(), mid: skyMat.uniforms.uMid.value.toArray(),
          hor: skyMat.uniforms.uHor.value.toArray(), stars: skyMat.uniforms.uStar.value,
          aurora: skyMat.uniforms.uAur.value, clouds: "两层平面程序云，非体积云" },
        facades: { count: facades.length, standard: true },
        moonVisible: moon.visible, environment: rig.inspect().environment,
        nodes: { halls: api.halls.length, giants: api.giants.length, facilities: api.infrastructure.length },
        urban: { districts: api.districts.length, buildings: b, bounds: BOUNDS,
          buildMs: Math.round(buildMs), trees: treePts.length * 2,
          streets: roads.children.length },
        coordinates: "虚构局部场景单位，1 单位 = 1 米，非 GIS", shadowMapSize: sun.shadow.mapSize.x };
    };
    api.setTime = function (hour) {
      var state = timeState(hour); api.state = state;
      rig.setTime(state);
      if (shadowHour === null || Math.abs(state.hour - shadowHour) >= 0.01) { sun.shadow.needsUpdate = true; shadowHour = state.hour; }
      if (groundMat.uniforms && groundMat.uniforms.uDay) groundMat.uniforms.uDay.value = state.day;
      if (waterMat.uniforms && waterMat.uniforms.uDay) waterMat.uniforms.uDay.value = state.day;
      /* 片区各自管自己的立面亮灯；它们没有太阳，只借这一次循环把 uLit 刷一遍 */
      api.districts.forEach(function (x) {
        try { x.api.setTime(state.hour); } catch (e) { /* 单个区失败不能拖垮整城 */ }
      });
      groundShadow.material.opacity = U.lerp(0.05, 0.22, state.day);
      if (api.onTimeChange) api.onTimeChange(state); return api.inspect();
    };
    /* 阴影盒跟着视点走：镜头挪到哪，2048 的阴影就重算哪一块 */
    api.followShadow = function (cx, cz) {
      var t = sun.target.position;
      if (Math.abs(t.x - cx) < 2 && Math.abs(t.z - cz) < 2 && sun.shadow.map) return;
      t.set(cx, 0, cz);
      sun.position.copy(t).addScaledVector(api.state ? api.state.direction : new THREE.Vector3(0.1, 0.7, -0.3), rig.sunDistance);
      sun.shadow.needsUpdate = true;
      /* 阴影只覆盖镜头附近 1250 米。离得远的区不用投——它们在阴影贴图之外，
         投了只是白跑一遍几何。阈值按地块中心算，整块地一起开一起关。 */
      for (var i = 0; i < api.districts.length; i++) {
        var d = api.districts[i];
        var far = Math.abs(d.d.cx - cx) > 2600 || Math.abs(d.d.cz - cz) > 2600;
        if (d.near === !far) continue;
        d.near = !far;
        d.group.traverse(function (o) { if (o.isMesh && !o.userData.alwaysShadow) o.castShadow = !far; });
      }
    };
    api.update = function (dt, t) {
      rig.update(t, api.camera);
      materials.forEach(function (m) { if (m.uniforms && m.uniforms.uTime) m.uniforms.uTime.value = t; });
      for (var i = 0; i < api.districts.length; i++) {
        try { api.districts[i].api.update(dt, t); } catch (e) { /* 同上 */ }
      }
    };
    api.setTime(opts.hour === undefined ? (Date.now() / 3600000 + 8) % 24 : opts.hour);
    return api;
  }

  global.YC3D_CITY = { build: buildCity, timeState: timeState, buildSkyRig: makeSkyRig,
    HALLS: NODES.halls, GIANTS: NODES.giants, INFRA: NODES.infra, nodes: NODES };
})(window);

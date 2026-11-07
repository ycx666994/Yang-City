/* ============================================================
   YC3D · 虚构杨城
   银白外骨骼、蓝玻璃、工业设施与分层程序云；无 GIS、无地理坐标。
   建筑是程序化实体，不是外部写实资产；云不是光线步进体积云。
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE, Y = global.YC3D, B = global.YC3D_B;
  if (!THREE || !Y || !B) { console.error("[YC3D] 依赖未加载"); return; }
  var U = Y.U, unitBox = new THREE.BoxGeometry(1, 1, 1);
  /* 分区数据由 yc-districts.js 先行注入；缺失时退化为无分区默认城市，不得抛错。 */
  var DISTRICTS = Array.isArray(global.YC_DISTRICTS) ? global.YC_DISTRICTS : [];
  var districtAt = typeof global.YC_DISTRICT_AT === "function" ? global.YC_DISTRICT_AT : function () { return null; };
  var HALLS = [
    { id: "H1", tint: 0xffeacb, name: "能力与边界博物馆", short: "老馆", x: -1510, z: 105, h: 74,
      color: 0xffd98a, accent: 0xffb347, kind: "classic", href: "h1-museum.html", line: "它表现得很强，究竟证明了什么？" },
    { id: "H2", tint: 0xcaf0ff, name: "推理法医馆", short: "法医", x: -1260, z: -720, h: 158,
      color: 0x7fe3ff, accent: 0x37e6ff, kind: "split", href: "h2-museum.html", line: "解释得通，是否意味着解释真的影响了答案？" },
    { id: "H3", tint: 0xffd9ec, name: "指标失效博物馆", short: "指标", x: 0, z: 150, h: 122,
      color: 0xff8ad0, accent: 0xff4fa3, kind: "twist", href: "h3-museum.html", line: "分数提高，是否真的让任务变好？" },
    { id: "H4", tint: 0xdcffc8, name: "数据污染博物馆", short: "污染", x: 1510, z: -660, h: 98,
      color: 0x9dff5c, accent: 0x63d61a, kind: "hive", href: "h4-museum.html", line: "它答对，是泛化、记忆，还是证据无法区分？" },
    { id: "H5", tint: 0xdcd4ff, name: "递归坍塌博物馆", short: "坍塌", x: -1050, z: 1190, h: 182,
      color: 0xb49bff, accent: 0x8b5cff, kind: "funnel", href: "h5-museum.html", line: "数据反复来自模型自身时，哪些信息会消失？" },
    { id: "H6", tint: 0xffe4bd, name: "潜能与预算博物馆", short: "预算", x: 1180, z: 1180, h: 136,
      color: 0xffc46b, accent: 0xff9a2e, kind: "arch", href: "h6-museum.html", line: "一次失败，是能力不足、调用不当，还是预算不足？" }
  ];
  var GIANTS = [
    { id: "shenzhi", name: "深智", en: "DEEPWIT", x: -480, z: -190, h: 132, kind: "dome", color: 0x37e6ff,
      biz: "基础模型 · 推理集群", note: "蓝玻璃穹顶与低层推理机房，通过实体管廊接入液冷交换站。" },
    { id: "xingye", name: "星野算力", en: "STARFIELD", x: -270, z: -430, h: 106, kind: "cooling", color: 0x8b5cff,
      biz: "智算中心 · 液冷", note: "退台服务器楼、换热鳍片与循环风机；动画是运行示意，不是遥测。" },
    { id: "lanzhou", name: "澜舟", en: "LANZHOU", x: 370, z: -115, h: 98, kind: "hull", color: 0x1fd6c8,
      biz: "多模态 · 端侧", note: "船形收分办公楼与连续遮阳肋，底层是端侧测试车间。" },
    { id: "xuanniao", name: "玄鸟", en: "XUANNIAO", x: -630, z: 325, h: 90, kind: "wing", color: 0xffb347,
      biz: "智能体 · 具身", note: "双翼实体雨棚覆盖具身试验场，屋顶设有无人机充电泊位。" },
    { id: "gewu", name: "格物", en: "GEWU", x: -500, z: -760, h: 114, kind: "lattice", color: 0x9dff5c,
      biz: "材料发现 · 科学计算", note: "银白斜撑包围蓝玻璃实验舱，层间平台连接材料测试设备。" },
    { id: "wanxiang", name: "万象", en: "WANXIANG", x: -100, z: -620, h: 86, kind: "orb", color: 0xff4fa3,
      biz: "生成式内容 · 版权清算", note: "架空球壳是实体展示中心，四条支腿与下层档案库共同承重。" },
    { id: "baize", name: "白泽", en: "BAIZE", x: 48, z: 44, h: 112, kind: "scan", color: 0xe8f4ff,
      biz: "安全对齐 · 红队", note: "白色遮阳外壳与双层复核平台；不再以扫描光环代替建筑。" },
    { id: "zhulong", name: "烛龙", en: "ZHULONG", x: -260, z: -500, h: 168, kind: "column", color: 0xff3b57,
      biz: "能源 · 聚变中试", note: "实体能源试验楼、径向散热肋与独立设备基座；没有真实能源数据。" },
    { id: "shangjian", name: "熵减", en: "ENTROPY-", x: 590, z: -275, h: 80, kind: "cascade", color: 0x6fd0ff,
      biz: "数据治理 · 冷存储", note: "三段不等尺度冷存储楼，退台布置光伏板和设备维护通道。" },
    { id: "tinglan", name: "听澜", en: "TINGLAN", x: -780, z: 500, h: 68, kind: "wave", color: 0x8fd8ff,
      biz: "语音 · 声学模型", note: "波浪形实体隔声顶板与滨水声学舱，没有同心发光环。" },
    { id: "lingxi", name: "灵犀智研", en: "LINGXI", x: -2180, z: -1320, h: 104, kind: "wing", color: 0x50d9d0,
      biz: "通用模型 · 多模态", note: "双翼研发楼围合开放式模型实验庭院。" },
    { id: "qingluan", name: "青鸾计算", en: "QINGLUAN", x: 2050, z: -1210, h: 92, kind: "cooling", color: 0x7fc7ff,
      biz: "推理芯片 · 智算", note: "低层液冷机房与研发塔楼分区布置。" },
    { id: "mubai", name: "木白实验室", en: "MUBAI", x: -2090, z: 1250, h: 80, kind: "lattice", color: 0xb7dfaa,
      biz: "科学智能 · 材料发现", note: "实验舱由可见的银白结构框架围护。" },
    { id: "yunchi", name: "云驰智能", en: "YUNCHI", x: 1880, z: 970, h: 116, kind: "cascade", color: 0x85afff,
      biz: "自动驾驶 · 仿真", note: "退台塔楼连接室内仿真与验证空间。" },
    { id: "tianwen", name: "天问认知", en: "TIANWEN", x: -2160, z: -650, h: 88, kind: "dome", color: 0xf0be72,
      biz: "知识推理 · 检索", note: "玻璃穹顶覆盖协作研究中庭。" },
    { id: "shanhe", name: "山河数据", en: "SHANHE", x: 1530, z: -970, h: 74, kind: "hull", color: 0x6eb9c9,
      biz: "数据治理 · 合成数据", note: "收分办公体量与底层数据工坊相连。" },
    { id: "mingjing", name: "明镜安全", en: "MINGJING", x: -1560, z: 650, h: 98, kind: "scan", color: 0xe0e9f1,
      biz: "模型安全 · 评测", note: "双层复核平台环绕安全研究楼。" },
    { id: "chuanqi", name: "川启智能", en: "CHUANQI", x: 1520, z: 720, h: 86, kind: "orb", color: 0xef8ab8,
      biz: "生成式设计 · 工业软件", note: "架空展示体量连接设计工作室与样机间。" }
  ];
  var INFRA = [
    { id: "solar", name: "太阳能微网", category: "能源", x: -272, z: 26, h: 12, color: 0xf0bc62, kind: "solar", note: "倾角光伏阵列与储能柜；运行演示不代表真实发电数据。" },
    { id: "cooling", name: "液冷交换站", category: "算力", x: 250, z: -168, h: 18, color: 0x62c7f2, kind: "cooling", note: "液冷管汇、换热鳍片与循环风机；动画仅作设施示意。" },
    { id: "drone", name: "无人机物流港", category: "交通", x: 118, z: 100, h: 22, color: 0xffbe72, kind: "drone", note: "双泊位甲板与充电柜；飞行路线为虚构城市循环演练。" },
    { id: "garden", name: "空中生态平台", category: "生态", x: -232, z: -176, h: 30, color: 0x74ba83, kind: "garden", note: "乔木、雨水回收槽与步行平台；没有接入真实传感器。" },
    { id: "hospital", name: "杨城综合医院", category: "医疗", x: 2210, z: 1460, h: 62, color: 0xf28b91, kind: "hospital", note: "急诊、门诊与住院楼围合医疗庭院；虚构公共服务设施。" },
    { id: "university", name: "创新大学", category: "教育", x: -1800, z: 1530, h: 78, color: 0xe7c878, kind: "university", note: "教学楼、实验馆与中央步行庭院组成的创新教育园。" },
    { id: "waterworks", name: "澄湾水务中心", category: "水务", x: 2350, z: 1280, h: 38, color: 0x58b9ce, kind: "waterworks", note: "沉淀池、泵房与调蓄设施；不接入真实水务数据。" },
    { id: "freight", name: "东部综合物流港", category: "物流", x: 2450, z: -1540, h: 44, color: 0xd39c72, kind: "freight", note: "分拣仓、货运月台与城市配送场。" },
    { id: "station-west", name: "西园站", category: "交通", x: -1580, z: -330, h: 34, color: 0xa9d7e8, kind: "station", note: "高架城际线西段站厅与换乘平台。" },
    { id: "station-center", name: "杨城中央站", category: "交通", x: 360, z: 400, h: 42, color: 0x80d9e8, kind: "station", note: "跨河主桥以南的城市级换乘站与公共广场。" },
    { id: "station-east", name: "东湾站", category: "交通", x: 1390, z: 930, h: 36, color: 0xb4c9fa, kind: "station", note: "服务东部居住片区与创新园的高架站。" }
  ];

  function timeState(hour) {
    if (typeof hour !== "number" || !isFinite(hour)) throw new TypeError("时间必须是有限小时数");
    var h = hour % 24;
    if (h < 0) h += 24;
    var angle = (h - 6) / 24 * Math.PI * 2;
    var elevation = Math.sin(angle), day = U.smooth((elevation + 0.12) / 0.32);
    var sun = U.smooth(elevation / 0.48), nightSky = U.smooth((-elevation - 0.04) / 0.25);
    var twilight = (1 - U.smooth(Math.abs(elevation) / 0.30)) * day;
    /* 名称只在本时段已经开始后使用，不取下一时段。太阳曲线是美术设定。 */
    var phases = [[0, "深夜"], [4, "凌晨"], [5.5, "破晓"], [6, "日出"], [7, "清晨"], [9, "上午"], [12, "正午"], [13, "午后"], [17, "黄昏"], [18, "暮色"], [19, "入夜"], [23, "深夜"]];
    var name = phases[0][1];
    phases.forEach(function (p) { if (h >= p[0]) name = p[1]; });
    return { hour: h, name: name, day: day, night: 1 - day, nightSky: nightSky, elevation: elevation, sun: sun, twilight: twilight,
      exposure: U.lerp(1.30, 1.02, day), direction: new THREE.Vector3(Math.cos(angle) * 0.85, elevation, -0.38).normalize() };
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

  function solidBox(group, w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d);
    m.position.set(x, y, z); m.castShadow = h > 0.5; m.receiveShadow = true; group.add(m); return m;
  }
  function strut(group, a, b, width, depth, mat) {
    var av = new THREE.Vector3(a[0], a[1], a[2]), bv = new THREE.Vector3(b[0], b[1], b[2]);
    var m = new THREE.Mesh(unitBox, mat); m.scale.set(width, av.distanceTo(bv), depth);
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize());
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  }
  /* 闭合挤出实体弧桥，有厚度且受光；不是发光轨迹或装饰圆环。 */
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
  function facade(seed, glow, floors, cols) {
    return B.matFacade({ base: 0xdce6e9, base2: 0x6898b7, glow: glow, glow2: 0xc4e5ff,
      seed: seed, lit: 0.24, floors: floors || 28, cols: cols || 16, fres: 0.25 });
  }
  function nameplate(group, text, x, y, z, width, textColor) {
    var cv = document.createElement("canvas"); cv.width = 512; cv.height = 96;
    var ctx = cv.getContext("2d"); ctx.fillStyle = "#edf5f8"; ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = textColor || "#1a4055"; ctx.font = "600 38px 'Microsoft YaHei',sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 48, 478);
    var texture = new THREE.CanvasTexture(cv); texture.encoding = THREE.sRGBEncoding;
    var mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65, metalness: 0.05,
      emissive: 0xc8e9ff, emissiveMap: texture, emissiveIntensity: 0.12 });
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512), mat);
    sign.position.set(x, y, z); group.add(sign); return sign;
  }

  /* 每次 build 的材质随场景创建，避免 core 尚未启用颜色管理时实例化。 */
  function buildCity(scene, opts) {
    opts = opts || {};
    var silver = new THREE.MeshStandardMaterial({ color: 0xe7edf0, metalness: 0.38, roughness: 0.31 });
    var ceramic = new THREE.MeshStandardMaterial({ color: 0xd8e3e7, metalness: 0.10, roughness: 0.64 });
    var glassBlue = new THREE.MeshStandardMaterial({ color: 0x548caf, metalness: 0.45, roughness: 0.19 });
    var leaf = new THREE.MeshStandardMaterial({ color: 0x438852, roughness: 0.88 });
    var bark = new THREE.MeshStandardMaterial({ color: 0x76634a, roughness: 0.94 });
    var pv = new THREE.MeshStandardMaterial({ color: 0x225d8a, metalness: 0.52, roughness: 0.26 });
    var api = { halls: [], giants: [], infrastructure: [], pickables: [], state: null };
    var fans = [], signs = [], nightObjects = [], materials = [], facades = [], effects = [];
    scene.fog = new THREE.FogExp2(0xb3d4e6, 0.00085); scene.background = null;

    function roofKit(group, kind, y, width) {
      var size = width || 22; solidBox(group, size, 1.3, size * 0.72, 0, y, 0, ceramic);
      if (kind === "solar") {
        for (var row = 0; row < 3; row++) for (var col = 0; col < 4; col++) {
          var x = (col - 1.5) * size * 0.22, z = (row - 1) * size * 0.20;
          solidBox(group, 0.3, 1.8, 0.3, x, y + 1.2, z, silver);
          var panel = solidBox(group, size * 0.20, 0.20, size * 0.17, x, y + 2.3, z, pv); panel.rotation.x = -0.27;
        }
        solidBox(group, size * 0.35, 3, 2.2, 0, y + 2, size * 0.43, silver);
      } else if (kind === "cooling") {
        for (var i = -1; i <= 1; i++) {
          solidBox(group, size * 0.22, 4.6, size * 0.48, i * size * 0.30, y + 2.9, 0, glassBlue);
          for (var f = 0; f < 5; f++) solidBox(group, size * 0.24, 3.8, 0.18, i * size * 0.30, y + 3.1, (f - 2) * size * 0.09, silver);
          var fan = new THREE.Group(); fan.userData.dynamic = true; fan.position.set(i * size * 0.30, y + 5.3, 0);
          solidBox(fan, size * 0.18, 0.12, 0.50, 0, 0, 0, ceramic);
          solidBox(fan, 0.50, 0.12, size * 0.18, 0, 0, 0, ceramic);
          group.add(fan); fans.push(fan);
        }
        strut(group, [-size * 0.47, y + 1.8, -size * 0.32], [size * 0.47, y + 1.8, -size * 0.32], 0.9, 0.9, glassBlue);
      } else if (kind === "drone") {
        for (var s = -1; s <= 1; s += 2) {
          var xx = s * size * 0.23;
          solidBox(group, size * 0.38, 0.15, size * 0.56, xx, y + 0.75, 0, glassBlue);
          [-1, 1].forEach(function (t) { solidBox(group, 0.3, 0.07, size * 0.19, xx + t * size * 0.07, y + 0.87, 0, silver); });
          solidBox(group, size * 0.14, 0.07, 0.3, xx, y + 0.87, 0, silver);
          var drone = makeDrone(0.9); drone.position.set(xx, y + 1.6, size * 0.08); group.add(drone);
        }
        solidBox(group, size * 0.24, 2.8, 2.4, 0, y + 2, -size * 0.43, silver);
      } else {
        for (var tree = 0; tree < 6; tree++) {
          var tx = (tree % 3 - 1) * size * 0.29, tz = (Math.floor(tree / 3) - 0.5) * size * 0.37;
          solidBox(group, size * 0.23, 0.8, size * 0.22, tx, y + 1, tz, ceramic);
          solidBox(group, 0.35, 2.9, 0.35, tx, y + 2.2, tz, bark);
          var crown = new THREE.Mesh(new THREE.SphereGeometry(size * 0.09, 8, 6), leaf);
          crown.position.set(tx, y + 4, tz); crown.scale.y = 1.4; crown.castShadow = true; crown.receiveShadow = true; group.add(crown);
        }
        solidBox(group, size * 0.88, 0.8, 1, 0, y + 1, -size * 0.38, glassBlue);
      }
    }
    function makeDrone(scale) {
      var drone = new THREE.Group(); drone.userData.dynamic = true;
      solidBox(drone, 3.4, 0.9, 1.6, 0, 0, 0, silver);
      solidBox(drone, 1.3, 0.6, 1.4, 0, 0.5, -0.1, glassBlue);
      strut(drone, [-2, 0.2, -1.6], [2, 0.2, 1.6], 0.22, 0.22, ceramic);
      strut(drone, [-2, 0.2, 1.6], [2, 0.2, -1.6], 0.22, 0.22, ceramic);
      for (var x = -1; x <= 1; x += 2) for (var z = -1; z <= 1; z += 2) {
        var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.10, 10), glassBlue);
        rotor.position.set(x * 2, 0.35, z * 1.6); drone.add(rotor);
      }
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.20, 6, 4), B.emissive(0xffbe72, 2.2));
      lamp.position.set(0, 0, -0.92); drone.add(lamp); drone.scale.setScalar(scale);
      drone.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); return drone;
    }
    function register(group, owner, type) {
      group.position.set(owner.x, 0, owner.z); group.userData[type] = owner;
      group.traverse(function (o) { if (o.isMesh) { o.userData.owner = owner; api.pickables.push(o); } });
      scene.add(group); return group;
    }
    function civicHall(h, i) {
      var g = new THREE.Group(), mat = facade(11 + i * 10, h.tint, Math.round(h.h / 3.6), 18);
      solidBox(g, 46, 6, 34, 0, 3, 0, ceramic);
      if (h.kind === "classic") {
        solidBox(g, 31, 34, 25, 0, 23, 0, mat);
        for (var c = -2; c <= 2; c++) solidBox(g, 1.2, 31, 1.2, c * 6.5, 22, 15, silver);
        solidBox(g, 39, 3, 30, 0, 39, 0, silver);
        var dome = new THREE.Mesh(new THREE.SphereGeometry(17, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), glassBlue);
        dome.scale.y = 1.5; dome.position.y = 40; dome.castShadow = true; dome.receiveShadow = true; g.add(dome);
        roofKit(g, "garden", 6.5, 44);
      } else if (h.kind === "split") {
        [-1, 1].forEach(function (s) {
          solidBox(g, 16, h.h - 6, 22, s * 12, (h.h + 6) / 2, 0, mat);
          solidBox(g, 2, h.h - 6, 24, s * 20.5, (h.h + 6) / 2, 0, silver);
        });
        archSpan(g, [-20, 115, 0], [20, 115, 0], 18, 3.5, 13, silver);
        solidBox(g, 40, 3, 12, 0, 54, 0, ceramic);
      } else if (h.kind === "twist") {
        /* 连续实体核心承重，逐段旋转的楼板与玻璃层形成扭转轮廓。 */
        solidBox(g, 10, h.h - 6, 10, 0, (h.h + 6) / 2, 0, silver);
        for (var tier = 0; tier < 8; tier++) {
          var floor = new THREE.Group(); floor.position.y = 6 + tier * 14.5; floor.rotation.y = tier * 0.105;
          solidBox(floor, 27 - tier * 0.6, 13.6, 23 - tier * 0.4, 0, 6.8, 0, mat);
          solidBox(floor, 29 - tier * 0.6, 0.9, 25 - tier * 0.4, 0, 14, 0, silver); g.add(floor);
        }
        roofKit(g, "garden", h.h, 22);
      } else if (h.kind === "hive") {
        var hex = new THREE.Mesh(new THREE.CylinderGeometry(15, 20, h.h - 6, 6), mat);
        hex.position.y = (h.h + 6) / 2; hex.castShadow = hex.receiveShadow = true; g.add(hex);
        for (var bay = 0; bay < 4; bay++) {
          var yy = 6 + bay * 23;
          solidBox(g, 37 - bay * 2, 1.3, 33 - bay * 2, 0, yy + 21, 0, silver);
          strut(g, [-17 + bay, yy, 16 - bay], [16 - bay, yy + 23, 16 - bay], 1.2, 1.2, silver);
        }
        roofKit(g, "garden", h.h, 27);
      } else if (h.kind === "funnel") {
        for (var l = 0; l < 6; l++) {
          var width = 39 - l * 4.7, height = (h.h - 6) / 6;
          solidBox(g, width, height, width * 0.75, 0, 6 + height * (l + 0.5), 0, mat);
          solidBox(g, width + 2, 1.4, width * 0.75 + 2, 0, 6 + height * (l + 1), 0, silver);
        }
      } else {
        /* 预算馆：架空拱形展廊、双承重翼楼和蓝玻璃中庭。 */
        [-1, 1].forEach(function (s) { solidBox(g, 15, 106, 24, s * 17, 59, 0, mat); });
        archSpan(g, [-24, 106, 0], [24, 106, 0], 25, 5, 24, silver);
        solidBox(g, 19, 38, 18, 0, 25, 0, glassBlue);
        roofKit(g, "solar", 44, 17);
      }
      signs.push(nameplate(g, h.id + " " + h.short, 0, 13, 17.2, 20));
      return register(g, h, "hall");
    }
    function company(gi, index) {
      var g = new THREE.Group(), h = gi.h, mat = facade(71 + index * 10, 0xc9e7f2, Math.round(h / 3.8), 18);
      solidBox(g, 37, 7, 29, 0, 3.5, 0, ceramic);
      if (gi.kind === "dome") {
        solidBox(g, 24, h - 26, 24, 0, (h - 26) / 2 + 7, 0, mat);
        var dome = new THREE.Mesh(new THREE.SphereGeometry(16, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), glassBlue);
        dome.position.y = h - 19; dome.castShadow = dome.receiveShadow = true; g.add(dome);
        [-1, 1].forEach(function (s) { solidBox(g, 13, 21, 29, s * 20, 17.5, 0, silver); });
        var utility = new THREE.Group(); utility.position.x = -20; roofKit(utility, "cooling", 28, 12); g.add(utility);
      } else if (gi.kind === "cooling" || gi.kind === "cascade") {
        var count = gi.kind === "cooling" ? 4 : 3;
        for (var t = 0; t < count; t++) {
          var hh = (h - 7) / count, w = 33 - t * 4.5;
          solidBox(g, w, hh, 26 - t * 2, t * 1.5, 7 + hh * (t + 0.5), 0, mat);
          solidBox(g, w + 3, 1.5, 28 - t * 2, t * 1.5, 7 + hh * (t + 1), 0, silver);
        }
        roofKit(g, gi.kind === "cooling" ? "cooling" : "solar", h, 20);
      } else if (gi.kind === "hull") {
        var hull = new THREE.Mesh(new THREE.CylinderGeometry(8, 17, h - 7, 4), mat);
        hull.position.y = (h + 7) / 2; hull.rotation.y = Math.PI / 4; hull.castShadow = hull.receiveShadow = true; g.add(hull);
        for (var rib = 0; rib < 5; rib++) solidBox(g, 33 - rib * 3.2, 1.2, 26 - rib * 2.4, 0, 17 + rib * 17, 0, silver);
      } else if (gi.kind === "wing") {
        solidBox(g, 22, h - 7, 20, 0, (h + 7) / 2, 0, mat);
        [-1, 1].forEach(function (s) {
          var wing = solidBox(g, 25, 3, 28, s * 20, 27, 0, silver); wing.rotation.z = s * 0.13;
          solidBox(g, 1.4, 25, 1.4, s * 30, 13, 10, silver);
        });
        roofKit(g, "drone", h, 21);
      } else if (gi.kind === "lattice") {
        solidBox(g, 25, h - 7, 25, 0, (h + 7) / 2, 0, mat);
        for (var e = 0; e < 4; e++) {
          solidBox(g, 29, 1.4, 29, 0, 7 + (h - 7) * (e + 1) / 4, 0, silver);
          [-1, 1].forEach(function (s) { strut(g, [-14, 7 + e * (h - 7) / 4, s * 14], [14, 7 + (e + 1) * (h - 7) / 4, s * 14], 1.3, 1.3, silver); });
        }
      } else if (gi.kind === "orb") {
        solidBox(g, 31, 27, 27, 0, 20.5, 0, mat);
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (z) { strut(g, [s * 13, 34, z * 11], [s * 9, 66, z * 8], 2.2, 2.2, silver); }); });
        var orb = new THREE.Mesh(new THREE.SphereGeometry(19, 28, 18), glassBlue);
        orb.position.y = 67; orb.castShadow = orb.receiveShadow = true; g.add(orb);
      } else if (gi.kind === "scan") {
        solidBox(g, 23, h - 7, 23, 0, (h + 7) / 2, 0, mat);
        [-1, 1].forEach(function (s) { solidBox(g, 3, h - 7, 25, s * 13, (h + 7) / 2, 0, silver); });
        solidBox(g, 32, 2, 29, 0, 46, 0, silver); roofKit(g, "garden", h, 27);
      } else if (gi.kind === "column") {
        var shell = new THREE.Mesh(new THREE.CylinderGeometry(10, 15, h - 7, 20), mat);
        shell.position.y = (h + 7) / 2; shell.castShadow = shell.receiveShadow = true; g.add(shell);
        for (var fin = 0; fin < 10; fin++) {
          var ang = fin / 10 * Math.PI * 2;
          var blade = solidBox(g, 1, h - 14, 5, Math.cos(ang) * 13, h / 2 + 7, Math.sin(ang) * 13, silver);
          blade.rotation.y = Math.PI / 2 - ang;
        }
      } else {
        for (var m = 0; m < 4; m++) {
          solidBox(g, 34 - m * 5, (h - 7) / 4, 22, m * 1.7, 7 + (h - 7) / 4 * (m + 0.5), 0, mat);
          archSpan(g, [-20 + m * 3, 7 + (h - 7) / 4 * (m + 1), 0], [20 - m * 2, 7 + (h - 7) / 4 * (m + 1), 0], 2.2, 1, 25, silver);
        }
      }
      if (index < 10 || ["lingxi","qingluan","mubai","yunchi","tianwen","shanhe","mingjing","chuanqi"].indexOf(gi.id) >= 0) signs.push(nameplate(g, gi.name, 0, 12, 15, 19));
      return register(g, gi, "giant");
    }

    var sun = new THREE.DirectionalLight(0xfff3df, 3.2); sun.target.position.set(-20, 0, -120); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -2850; sun.shadow.camera.right = 2850;
    sun.shadow.camera.top = 1950; sun.shadow.camera.bottom = -1950; sun.shadow.camera.near = 1; sun.shadow.camera.far = 6200;
    sun.shadow.normalBias = 0.65; sun.shadow.bias = -0.00015; sun.shadow.autoUpdate = false;
    scene.add(sun, sun.target); api.sun = sun;
    var hemi = new THREE.HemisphereLight(0xc8e8ff, 0x9d9b8b, 1.25); scene.add(hemi); api.hemi = hemi;
    var skyMat = atmosphere(), sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 24), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky); api.sky = skyMat;
    var envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(sky.geometry, skyMat));
    var pmrem = null, environment = null, environmentHour = null;
    api.updateEnvironment = function (renderer) {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      /* PMREM 只捕获线性天空，ACES 与 sRGB 留给 core 的最终合成。 */
      var next = pmrem.fromScene(envScene, 0.02, 1, 2400); scene.environment = next.texture;
      if (environment) environment.dispose(); environment = next; environmentHour = api.state.hour;
    };

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
    moon.position.set(-392, 296, -700); scene.add(moon); api.moon = moon;
    var moonGlow = new THREE.Mesh(new THREE.SphereGeometry(51, 24, 16), B.additive(0x9fc8ff, 0.30, 0.06));
    var moonHalo = new THREE.Mesh(new THREE.SphereGeometry(65, 24, 16), B.additive(0x8cb6e0, 0.20, 0.025));
    moonGlow.position.copy(moon.position); moonHalo.position.copy(moon.position); scene.add(moonGlow, moonHalo);
    api.moonGlow = moonGlow; api.moonHalo = moonHalo;

    /* 虚构局部城市范围约 5400×3600；中心旧城的馆楼保持原比例。 */
    var cityBounds = { minX: -2700, maxX: 2700, minZ: -1800, maxZ: 1800 };
    var groundMat = B.ground({ base: 0xb8c9cc, color: 0x7ebbc9, color2: 0xb6c8db, grid: 34, flow: 0.18, fade: 2700 });
    var riverCurve = new THREE.CatmullRomCurve3([
      [-2700, 0, -1390], [-2240, 0, -1080], [-1740, 0, -650], [-1220, 0, -300],
      [-650, 0, 60], [-80, 0, 250], [500, 0, 210], [1080, 0, 540],
      [1640, 0, 850], [2170, 0, 640], [2700, 0, 910]
    ].map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), false, "catmullrom", 0.18);
    var riverProfile = [], riverLeft = [], riverRight = [], riverOuterLeft = [], riverOuterRight = [];
    for (var ri = 0; ri <= 160; ri++) {
      var rt = ri / 160, rp = riverCurve.getPointAt(rt), tangent = riverCurve.getTangentAt(rt);
      var nx = -tangent.z, nz = tangent.x, half = 98 + Math.sin(rt * Math.PI * 5) * 13 + Math.sin(rt * Math.PI * 11) * 5;
      riverProfile.push({ x: rp.x, z: rp.z, half: half });
      riverLeft.push([rp.x + nx * half, rp.z + nz * half]); riverRight.push([rp.x - nx * half, rp.z - nz * half]);
      riverOuterLeft.push([rp.x + nx * (half + 86), rp.z + nz * (half + 86)]);
      riverOuterRight.push([rp.x - nx * (half + 86), rp.z - nz * (half + 86)]);
    }
    function riverAtX(x) {
      for (var pi = 1; pi < riverProfile.length; pi++) if (riverProfile[pi].x >= x) {
        var a = riverProfile[pi - 1], b = riverProfile[pi], t = (x - a.x) / Math.max(0.001, b.x - a.x);
        return { z: U.lerp(a.z, b.z, t), half: U.lerp(a.half, b.half, t) };
      }
      var last = riverProfile[riverProfile.length - 1]; return { z: last.z, half: last.half };
    }
    var landShape = new THREE.Shape();
    landShape.moveTo(cityBounds.minX - 300, -cityBounds.minZ + 150); landShape.lineTo(cityBounds.maxX + 300, -cityBounds.minZ + 150);
    landShape.lineTo(cityBounds.maxX + 300, -cityBounds.maxZ - 150); landShape.lineTo(cityBounds.minX - 300, -cityBounds.maxZ - 150); landShape.closePath();
    var riverRing = riverLeft.map(function (p) { return [p[0], -p[1]]; }).concat(riverRight.slice().reverse().map(function (p) { return [p[0], -p[1]]; }));
    var riverHole = new THREE.Path(); riverHole.moveTo(riverRing[0][0], riverRing[0][1]);
    for (var rh = 1; rh < riverRing.length; rh++) riverHole.lineTo(riverRing[rh][0], riverRing[rh][1]);
    riverHole.closePath(); landShape.holes.push(riverHole);
    var ground = new THREE.Mesh(new THREE.ShapeGeometry(landShape, 1), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground); api.ground = groundMat;
    var groundShadow = new THREE.Mesh(ground.geometry, new THREE.ShadowMaterial({ opacity: 0.24 }));
    groundShadow.rotation.copy(ground.rotation); groundShadow.position.copy(ground.position); groundShadow.position.y += 0.025;
    groundShadow.receiveShadow = true; scene.add(groundShadow);
    function ribbonGeometry(edgeA, edgeB, y) {
      var positions = [], indices = [];
      for (var i = 0; i < edgeA.length; i++) {
        positions.push(edgeA[i][0], y, edgeA[i][1], edgeB[i][0], y, edgeB[i][1]);
        if (i < edgeA.length - 1) {
          var k = i * 2; indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
        }
      }
      var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices); geo.computeVertexNormals(); return geo;
    }
    var waterMat = B.water({ color: 0x386c8b, glow: 0xadd9e9, glow2: 0x8cc8e8 });
    var water = new THREE.Mesh(ribbonGeometry(riverLeft, riverRight, -0.30), waterMat); scene.add(water); api.water = waterMat; api.riverSegments = 1;
    var bankMat = new THREE.MeshStandardMaterial({ color: 0x597d64, roughness: 0.96, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(ribbonGeometry(riverLeft, riverOuterLeft, 0.015), bankMat));
    scene.add(new THREE.Mesh(ribbonGeometry(riverRight, riverOuterRight, 0.015), bankMat));

    var roads = new THREE.Group();
    var asphalt = new THREE.MeshStandardMaterial({ color: 0x38464f, roughness: 0.91 });
    var localAsphalt = new THREE.MeshStandardMaterial({ color: 0x59656c, roughness: 0.93 });
    var sidewalk = new THREE.MeshStandardMaterial({ color: 0x9ca8a8, roughness: 0.90 });
    var marking = new THREE.MeshStandardMaterial({ color: 0xd7d5c2, roughness: 0.78 });
    var lampGlow = B.emissive(0xffdca1, 0.35);
    function runBox(axis, start, end, center, width, material, y, height) {
      if (end - start < 14) return;
      if (axis === "x") solidBox(roads, end - start, height || 0.12, width, (start + end) / 2, y, center, material);
      else solidBox(roads, width, height || 0.12, end - start, center, y, (start + end) / 2, material);
    }
    function streetPositions(start, end, step, seed) {
      var out = [], i = 0, value = start + seed;
      while (value < end) {
        out.push(value); value += step * (0.90 + ((i * 7 + 3) % 11) / 55); i++;
      }
      out.push(end); return out;
    }
    var xRoads = streetPositions(-2610, 2610, 285, 12), zRoads = streetPositions(-1700, 1700, 248, 5);
    var bridgeGroup = new THREE.Group(), roadBridgeCount = 0;
    zRoads.forEach(function (z, zi) {
      var major = zi % 5 === 0, width = major ? 29 : zi % 2 ? 9 : 17, runStart = cityBounds.minX;
      var samples = 112, lastWet = false;
      for (var sx = 0; sx <= samples; sx++) {
        var x = cityBounds.minX + (cityBounds.maxX - cityBounds.minX) * sx / samples, profile = riverAtX(x);
        var wet = Math.abs(z - profile.z) < profile.half + 105;
        if (wet && !lastWet) { runBox("x", runStart, x - 20, z, width, major ? asphalt : localAsphalt, 0.01); runStart = x + 20; }
        if (sx === samples && !wet) runBox("x", runStart, cityBounds.maxX, z, width, major ? asphalt : localAsphalt, 0.01);
        if (!wet && lastWet) runStart = x;
        lastWet = wet;
      }
      var segments = [], segStart = cityBounds.minX, previousWet = false;
      for (var ls = 0; ls <= samples; ls++) {
        var lx = cityBounds.minX + (cityBounds.maxX - cityBounds.minX) * ls / samples, lp = riverAtX(lx);
        var lWet = Math.abs(z - lp.z) < lp.half + 105;
        if (lWet && !previousWet) { if (lx - segStart > 24) segments.push([segStart, lx - 18]); }
        if (!lWet && previousWet) segStart = lx + 18;
        if (ls === samples && !lWet && cityBounds.maxX - segStart > 24) segments.push([segStart, cityBounds.maxX]);
        previousWet = lWet;
      }
      segments.forEach(function (seg) {
        runBox("x", seg[0], seg[1], z - width * 0.5 - 5, 5.5, sidewalk, 0.045, 0.10);
        runBox("x", seg[0], seg[1], z + width * 0.5 + 5, 5.5, sidewalk, 0.045, 0.10);
        if (major) for (var mx = Math.ceil(seg[0] / 42) * 42; mx < seg[1] - 10; mx += 42)
          solidBox(roads, 13, 0.035, 0.8, mx, 0.105, z, marking);
      });
      if (major) {
        for (var lightX = cityBounds.minX + 95; lightX < cityBounds.maxX; lightX += 260) {
          var lp2 = riverAtX(lightX); if (Math.abs(z - lp2.z) < lp2.half + 130) continue;
          [-1, 1].forEach(function (side) {
            var lx2 = lightX, lz2 = z + side * (width / 2 + 8);
            solidBox(roads, 0.65, 7.5, 0.65, lx2, 3.75, lz2, silver);
            var arm = solidBox(roads, 3.2, 0.38, 0.45, lx2 + 1.2, 7.25, lz2, silver); arm.rotation.y = -0.12;
            solidBox(roads, 1.1, 0.42, 0.9, lx2 + 2.4, 7.08, lz2, lampGlow);
          });
        }
      }
    });
    xRoads.forEach(function (x, xi) {
      var profile = riverAtX(x), major = xi % 4 === 0, width = major ? 28 : xi % 2 ? 8 : 16;
      var gap = profile.half + 105, northEnd = profile.z - gap, southStart = profile.z + gap;
      runBox("z", cityBounds.minZ, northEnd, x, width, major ? asphalt : localAsphalt, 0.01);
      runBox("z", southStart, cityBounds.maxZ, x, width, major ? asphalt : localAsphalt, 0.01);
      [-1, 1].forEach(function (side) {
        runBox("z", cityBounds.minZ, northEnd, x + side * (width / 2 + 5), 5.5, sidewalk, 0.045, 0.10);
        runBox("z", southStart, cityBounds.maxZ, x + side * (width / 2 + 5), 5.5, sidewalk, 0.045, 0.10);
      });
      if (major) for (var mz = cityBounds.minZ + 30; mz < northEnd; mz += 42) solidBox(roads, 0.8, 0.035, 13, x, 0.105, mz, marking);
      if (xi % 2 === 0 && Math.abs(x) > 430) {
        var deckLength = gap * 2 + 44, deckY = 3.3;
        solidBox(bridgeGroup, width + 14, 1.4, deckLength, x, deckY, profile.z, ceramic);
        solidBox(bridgeGroup, width, 0.16, deckLength - 10, x, deckY + 0.78, profile.z, asphalt);
        [-1, 1].forEach(function (side) {
          solidBox(bridgeGroup, 5.5, 0.22, deckLength - 8, x + side * (width / 2 + 4.5), deckY + 0.88, profile.z, sidewalk);
          archSpan(bridgeGroup, [x + side * (width / 2 - 2), deckY + 0.6, northEnd - 16],
            [x + side * (width / 2 - 2), deckY + 0.6, southStart + 16], 15 + (xi % 3) * 2, 2.2, 1.8, silver);
        });
        for (var pierZ = profile.z - gap - 35; pierZ <= profile.z + gap + 35; pierZ += 68) {
          if (Math.abs(pierZ - profile.z) < profile.half + 8) continue;
          solidBox(bridgeGroup, 3.2, deckY, 3.2, x, deckY / 2, pierZ, silver);
        }
        roadBridgeCount++;
      }
    });
    /* 路口斑马线与转角铺地，避免道路只表现为无交互直条。 */
    for (var xi = 1; xi < xRoads.length - 1; xi += 2) for (var zi = 1; zi < zRoads.length - 1; zi += 2) {
      var ix = xRoads[xi], iz = zRoads[zi], ip = riverAtX(ix);
      if (Math.abs(iz - ip.z) < ip.half + 112) continue;
      if (xi % 4 === 0 || zi % 5 === 0) for (var stripe = -2; stripe <= 2; stripe++)
        solidBox(roads, 17, 0.035, 0.85, ix + stripe * 2.2, 0.11, iz, marking);
    }
    scene.add(roads, bridgeGroup); api.roadBridges = bridgeGroup;
    var plaza = new THREE.Group(); plaza.position.set(620, 0, -30);
    solidBox(plaza, 184, 0.45, 132, 0, 0.12, 0, ceramic);
    solidBox(plaza, 58, 0.5, 34, 0, 0.55, -5, glassBlue);
    for (var bench = -3; bench <= 3; bench++) {
      solidBox(plaza, 12, 1.1, 3, bench * 20, 0.95, 42, bark);
      solidBox(plaza, 12, 1.1, 3, bench * 20, 0.95, -48, bark);
    }
    scene.add(plaza);

    /* 分区街区：17 区各有高度区间、立面氛围、屋顶倾向与密度；缺失分区数据时按默认五材质。 */
    var rnd = U.rng(20261105), protectedLots = HALLS.concat(GIANTS, INFRA).map(function (o) {
      return { x: o.x, z: o.z, r: Math.max(48, (o.h || 24) * 0.22) };
    });
    protectedLots.push({ x: -20, z: -200, r: 140 }, { x: 620, z: -30, r: 110 });
    /* 区标立柱也占用地块，避免街区贴柱生成。 */
    DISTRICTS.forEach(function (d) { protectedLots.push({ x: d.cx, z: d.cz, r: 40 }); });
    var blocks = new THREE.Group(), generatedBuildings = 0;
    var buildingFacades = [
      facade(9100, 0xb9d8e8, 20, 14), facade(9101, 0xc5d9e2, 15, 13),
      facade(9102, 0xaed0e3, 24, 16), facade(9103, 0xd9d4c5, 13, 12), facade(9104, 0x9fc4d0, 18, 15)
    ];
    /* vibe→基色板查表；glow 用该区 accent。未知 vibe 沿用默认五材质。 */
    var VIBE_FACADES = {
      core: [0x8fb8c8, 0xa8ccd8], cbd: [0x5f8fc8, 0x7fa8d8], compute: [0x7f92c0, 0x93a8cc],
      research: [0x9fc8b8, 0xb0d8c8], justice: [0x9aacbe, 0xb8c4d0], transit: [0xa89ac8, 0xbcb0d8],
      campus: [0xd8c890, 0xc8b878], recursive: [0xb890cc, 0xc8a8d8], green: [0x9cc89c, 0xb0d8b0],
      mixed: [0xd8a890, 0xc89880], living: [0x8fc0cc, 0xa8d0d8], eco: [0x9cd8c0, 0xb0e0d0],
      port: [0xc8a878, 0xb89868], lab: [0xa8c888, 0xbcd89c], design: [0xd89cb8, 0xc88ca8],
      energy: [0x9cc4cc, 0x88b4c0], heritage: [0xd8b088, 0xc8a078]
    };
    /* 屋顶倾向 [花园, 光伏, 设备顶] 概率；port 压低全部装饰倾向平顶仓库。 */
    var DEFAULT_ROOF = [0.34, 0.52, 0.68];
    var VIBE_ROOF = {
      compute: [0.08, 0.82, 0.95], energy: [0.08, 0.82, 0.95],
      green: [0.72, 0.80, 0.90], heritage: [0.70, 0.78, 0.88], campus: [0.70, 0.78, 0.88],
      port: [0.06, 0.16, 0.30]
    };
    /* 每区预生成 2 个 facade 材质：基色取 vibe 色板，glow 取该区 accent。 */
    var districtFacades = {};
    DISTRICTS.forEach(function (d, di) {
      var palette = VIBE_FACADES[d.vibe];
      if (!palette) return;
      var accent = parseInt(String(d.accent).replace(/[^0-9a-fA-F]/g, ""), 16) || 0xc9e7f2;
      var floors = Math.max(6, Math.round((d.minH + d.maxH) * 0.5 / 3.8));
      districtFacades[d.id] = [facade(7700 + di * 7, accent, floors, 15), facade(7711 + di * 7, accent, floors, 13)];
    });
    for (var zb = 0; zb < zRoads.length - 1; zb++) for (var xb = 0; xb < xRoads.length - 1; xb++) {
      var lotX = (xRoads[xb] + xRoads[xb + 1]) / 2, lotZ = (zRoads[zb] + zRoads[zb + 1]) / 2;
      var riverInfo = riverAtX(lotX);
      if (Math.abs(lotZ - riverInfo.z) < riverInfo.half + 195) continue;
      var district = districtAt(lotX, lotZ), vibe = district ? district.vibe : "";
      var coreLot = district && district.id === "D01" &&
        (lotX - district.cx) * (lotX - district.cx) + (lotZ - district.cz) * (lotZ - district.cz) <= district.r * district.r;
      var dense = vibe === "core" || vibe === "cbd";
      var sparse = vibe === "green" || vibe === "heritage" || vibe === "campus";
      var count = 1 + (rnd() < (dense ? 0.94 : sparse ? 0.52 : 0.84) ? 1 : 0) + (rnd() < (dense ? 0.86 : sparse ? 0.28 : 0.56) ? 1 : 0);
      if (sparse) count = Math.min(count, 2);
      var positions = count === 1 ? [[0, 0]] : count === 2 ? [[-43, 0], [43, 0]] : [[-46, -43], [46, -43], [0, 49]];
      for (var lp = 0; lp < positions.length; lp++) {
        var bx = lotX + positions[lp][0] + (rnd() - 0.5) * 12, bz = lotZ + positions[lp][1] + (rnd() - 0.5) * 12;
        var bw = 22 + rnd() * 17, bd = 21 + rnd() * 17;
        if (protectedLots.some(function (p) { var dx = p.x - bx, dz = p.z - bz, clear = p.r + Math.max(bw, bd) * 0.62; return dx * dx + dz * dz < clear * clear; })) continue;
        var minHeight = district ? district.minH : 28, maxHeight = district ? district.maxH : 112;
        if (coreLot) maxHeight = Math.round(maxHeight * 1.15);
        var height = minHeight + rnd() * (maxHeight - minHeight), style = Math.floor(rnd() * 4),
          districtMats = district && districtFacades[district.id] ? districtFacades[district.id] : buildingFacades,
          mat = districtMats[Math.floor(rnd() * districtMats.length)], block = new THREE.Group();
        block.position.set(bx, 0, bz); block.userData.height = height; block.userData.zone = district ? district.id : "urban";
        solidBox(block, bw * 1.12, 4, bd * 1.12, 0, 2, 0, ceramic);
        if (style === 0) {
          solidBox(block, bw, height * 0.68, bd, 0, 4 + height * 0.34, 0, mat);
          solidBox(block, bw * 0.72, height * 0.32, bd * 0.74, -bw * 0.10, 4 + height * 0.84, 0, mat);
        } else if (style === 1) {
          solidBox(block, bw, height, bd, 0, 4 + height * 0.5, 0, mat);
          solidBox(block, bw * 0.62, 4, bd * 0.62, 0, height + 6, 0, silver);
        } else if (style === 2) {
          solidBox(block, bw * 0.54, height, bd, -bw * 0.23, 4 + height * 0.5, 0, mat);
          solidBox(block, bw * 0.50, height * 0.72, bd * 0.86, bw * 0.24, 4 + height * 0.36, 0, mat);
        } else {
          solidBox(block, bw, height * 0.76, bd, 0, 4 + height * 0.38, 0, mat);
          solidBox(block, bw * 0.78, 2.2, bd * 1.08, 0, height * 0.76 + 5.1, 0, silver);
        }
        var roofY = height + 5, roofBias = VIBE_ROOF[vibe] || DEFAULT_ROOF;
        if (rnd() < roofBias[0]) {
          solidBox(block, bw * 0.54, 0.7, bd * 0.42, 0, roofY, 0, leaf);
          solidBox(block, 2.2, 4, 2.2, -bw * 0.25, roofY + 2.3, -bd * 0.22, bark);
          solidBox(block, 2.2, 4, 2.2, bw * 0.25, roofY + 2.3, bd * 0.22, bark);
        } else if (rnd() < roofBias[1]) {
          for (var panel = -1; panel <= 1; panel++) {
            var pvPanel = solidBox(block, bw * 0.22, 0.30, bd * 0.34, panel * bw * 0.25, roofY + 1.2, 0, pv);
            pvPanel.rotation.x = -0.22;
          }
        } else if (rnd() < roofBias[2]) {
          solidBox(block, bw * 0.30, 3.4, bd * 0.24, 0, roofY + 1.7, 0, ceramic);
          solidBox(block, bw * 0.54, 1.2, 1.0, 0, roofY + 3.7, 0, silver);
        }
        blocks.add(block); generatedBuildings++;
        protectedLots.push({ x: bx, z: bz, r: Math.max(bw, bd) * 0.42 });
      }
    }
    scene.add(blocks); api.blocks = blocks; api.buildingCount = generatedBuildings; api.cityBounds = cityBounds;
    /* 区标：每区中心一根银白立柱与区名铭牌（字体色用该区 accent）；普通 mesh，不参与拾取。 */
    var districtsGroup = new THREE.Group();
    DISTRICTS.forEach(function (d) {
      var mark = new THREE.Group();
      solidBox(mark, 6.5, 1.4, 6.5, 0, 0.7, 0, ceramic);
      solidBox(mark, 3.2, 26, 3.2, 0, 13, 0, silver);
      solidBox(mark, 4.6, 0.9, 4.6, 0, 26.4, 0, glassBlue);
      var accentText = "#" + (String(d.accent).replace(/[^0-9a-fA-F]/g, "") || "1a4055");
      signs.push(nameplate(mark, d.id + " " + d.name, 0, 31, 2.4, 30, accentText));
      mark.position.set(d.cx, 0, d.cz); districtsGroup.add(mark);
    });
    if (DISTRICTS.length) scene.add(districtsGroup);
    api.districts = districtsGroup;
    var far = new THREE.Group(), farRnd = U.rng(5150);
    for (var fi = 0; fi < 38; fi++) {
      var fh = 34 + farRnd() * 92, fx = -2500 + fi * 132;
      solidBox(far, 30 + farRnd() * 32, fh, 28 + farRnd() * 20, fx, fh / 2, farRnd() < 0.5 ? -1675 - farRnd() * 60 : 1675 + farRnd() * 60,
        buildingFacades[fi % buildingFacades.length]);
    }
    scene.add(far); api.far = far;
    HALLS.forEach(function (h, i) { api.halls.push(civicHall(h, i)); });
    GIANTS.forEach(function (gi, i) { api.giants.push(company(gi, i)); });

    /* 主塔：银白斜撑包围三段蓝玻璃核心，实体弧桥连接副楼。 */
    var spire = new THREE.Group(), mainFacade = facade(999, 0xc5eaff, 110, 24);
    solidBox(spire, 60, 12, 46, 0, 6, 0, silver);
    [[48, 166, 34, 0, 95], [36, 140, 28, -6, 248], [24, 84, 22, -10, 360]].forEach(function (v) { solidBox(spire, v[0], v[1], v[2], v[3], v[4], 0, mainFacade); });
    [-1, 1].forEach(function (side) {
      for (var bay = 0; bay < 6; bay++) {
        var y0 = 12 + bay * 64, y1 = Math.min(402, y0 + 64), w0 = 29 - bay * 2.8, w1 = w0 - 2.8;
        strut(spire, [side * w0, y0, 19], [side * w1, y1, 14], 2.8, 2.8, silver);
        strut(spire, [side * w0, y0, -19], [side * w1, y1, -14], 2.8, 2.8, silver);
        strut(spire, [-w0, y0, side * 19], [w1, y1, side * 14], 1.4, 1.4, silver);
      }
    });
    solidBox(spire, 32, 252, 28, -92, 126, 18, mainFacade); solidBox(spire, 27, 188, 24, 84, 94, -18, mainFacade);
    archSpan(spire, [-92, 214, 8], [-5, 214, 8], 17, 6, 24, silver);
    archSpan(spire, [4, 157, -8], [84, 157, -8], 14, 5, 19, silver);
    solidBox(spire, 80, 4, 14, -26, 310, 0, silver);
    [-92, 84].forEach(function (x, i) {
      var roof = new THREE.Group(); roof.position.set(x, 0, i ? -18 : 18); roofKit(roof, i ? "cooling" : "solar", i ? 188 : 252, 24); spire.add(roof);
    });
    var garden = new THREE.Group(); garden.position.set(-65, 0, 8); roofKit(garden, "garden", 235, 26); spire.add(garden);
    var beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 6), B.emissive(0xbcefff, 2.4));
    beacon.position.set(-10, 404, 0); spire.add(beacon); spire.position.set(-20, 0, -200); scene.add(spire); api.spire = spire; api.spireRings = [];

    /* 城际高架线路穿过多个片区，站体与轨道均为本地生成的实体。 */
    var orbit = new THREE.Group(), railPoints = [
      [-2700, 39, -1430], [-2250, 42, -1030], [-1960, 44, -650], [-1580, 44, -330],
      [-1120, 42, -240], [-650, 44, 80], [-80, 47, 240], [360, 47, 400],
      [860, 48, 530], [1260, 46, 680], [1390, 46, 930], [1740, 46, 1060], [2100, 44, 760], [2700, 39, 930]
    ];
    var railCurve = new THREE.CatmullRomCurve3(railPoints.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), false, "catmullrom", 0.16);
    function offsetRail(side) {
      var points = [];
      for (var oi = 0; oi <= 100; oi++) {
        var op = railCurve.getPointAt(oi / 100), ot = railCurve.getTangentAt(oi / 100), ox = -ot.z, oz = ot.x;
        points.push(new THREE.Vector3(op.x + ox * side * 5.2, op.y, op.z + oz * side * 5.2));
      }
      return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.1);
    }
    [-1, 1].forEach(function (side) {
      var rail = new THREE.Mesh(new THREE.TubeGeometry(offsetRail(side), 360, 1.15, 7, false), silver);
      rail.castShadow = rail.receiveShadow = true; orbit.add(rail);
    });
    for (var sleeper = 0; sleeper <= 132; sleeper++) {
      var st = sleeper / 132, sp = railCurve.getPointAt(st), tangent = railCurve.getTangentAt(st);
      var tie = solidBox(orbit, 13.5, 0.9, 2.1, sp.x, sp.y - 2, sp.z, ceramic);
      tie.rotation.y = Math.atan2(tangent.z, tangent.x) + Math.PI / 2;
    }
    for (var pier = 0; pier <= 52; pier++) {
      var pt = pier / 52, pp = railCurve.getPointAt(pt), tangent2 = railCurve.getTangentAt(pt), px = -tangent2.z, pz = tangent2.x;
      [-1, 1].forEach(function (side) {
        var height = pp.y - 5;
        solidBox(orbit, 2.8, height, 2.8, pp.x + px * side * 9, height / 2, pp.z + pz * side * 9, silver);
      });
      solidBox(orbit, 24, 1.8, 4.2, pp.x, pp.y - 4, pp.z, ceramic).rotation.y = Math.atan2(tangent2.z, tangent2.x) + Math.PI / 2;
    }
    scene.add(orbit); api.orbit = orbit;
    var train = new THREE.Group(); train.userData.dynamic = true;
    for (var carIndex = 0; carIndex < 3; carIndex++) {
      var car = new THREE.Group(); car.position.z = -carIndex * 32;
      solidBox(car, 7.8, 7.4, 29, 0, 0, 0, silver);
      solidBox(car, 7.3, 1.1, 29.4, 0, -2.7, 0, glassBlue);
      [-1, 1].forEach(function (side) {
        solidBox(car, 0.18, 2.6, 18, side * 3.98, 0.5, 0, glassBlue);
        solidBox(car, 0.32, 0.55, 26, side * 4.02, 2.3, 0, B.emissive(0x71d8ef, 0.45));
      });
      solidBox(car, 6.8, 2.6, 1.0, 0, 0.1, 14.8, glassBlue);
      train.add(car);
    }
    var trainT = 0.43, trainDirection = 1, trainPoint = railCurve.getPointAt(trainT);
    train.position.copy(trainPoint); train.lookAt(trainPoint.clone().add(railCurve.getTangentAt(trainT)));
    scene.add(train); api.train = train; api.trainCurve = railCurve; api.roadBridgeCount = roadBridgeCount;
    /* 滨水步行拱桥：实体甲板、双拱肋与吊杆，保持河道可见。 */
    var bridge = new THREE.Group(); solidBox(bridge, 16, 1.4, 238, 316, 7, 214, ceramic);
    [-1, 1].forEach(function (s) {
      archSpan(bridge, [316 + s * 6.5, 8, 95], [316 + s * 6.5, 8, 333], 42, 2.2, 1.7, silver);
      for (var hanger = 1; hanger < 10; hanger++) {
        var tt = hanger / 10, yy = 4 * tt * (1 - tt) * 42;
        solidBox(bridge, 0.42, yy, 0.42, 316 + s * 6.5, 8 + yy / 2, 95 + tt * 238, silver);
      }
    });
    scene.add(bridge); api.bridge = bridge;
    INFRA.forEach(function (f, i) {
      var g = new THREE.Group(), mat = facade(4300 + i, f.color, Math.max(4, Math.round(f.h / 4)), 14);
      if (f.kind === "hospital") {
        solidBox(g, 52, 8, 42, 0, 4, 0, ceramic);
        solidBox(g, 28, f.h - 8, 25, 0, f.h / 2 + 4, 0, mat);
        solidBox(g, 24, 24, 34, -28, 16, 0, ceramic); solidBox(g, 24, 24, 34, 28, 16, 0, ceramic);
        solidBox(g, 9, 2, 2, 0, f.h - 3, 13, B.emissive(f.color, 0.45));
        solidBox(g, 2, 9, 2, 0, f.h - 3, 13, B.emissive(f.color, 0.45));
      } else if (f.kind === "university") {
        solidBox(g, 84, 4, 68, 0, 2, 0, ceramic);
        [-1, 1].forEach(function (s) { solidBox(g, 27, f.h * 0.68, 35, s * 27, f.h * 0.34 + 4, -9, mat); });
        solidBox(g, 32, f.h * 0.48, 25, 0, f.h * 0.24 + 4, 20, glassBlue);
        archSpan(g, [-42, 10, 24], [42, 10, 24], 15, 2.5, 2.4, silver);
        for (var uc = -3; uc <= 3; uc++) solidBox(g, 1.5, 12, 1.5, uc * 11, 6, 25, silver);
      } else if (f.kind === "waterworks") {
        solidBox(g, 54, 4, 46, 0, 2, 0, ceramic);
        for (var tank = 0; tank < 3; tank++) {
          var tx = (tank - 1) * 19, th = tank === 1 ? f.h : f.h * 0.72;
          var vessel = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, th, 16), glassBlue);
          vessel.position.set(tx, th / 2 + 4, 0); vessel.castShadow = vessel.receiveShadow = true; g.add(vessel);
          solidBox(g, 23, 1.8, 23, tx, th + 4, 0, silver);
        }
        strut(g, [-28, 8, -17], [28, 8, -17], 1.5, 1.5, ceramic);
      } else if (f.kind === "freight") {
        solidBox(g, 74, 4, 48, 0, 2, 0, ceramic);
        solidBox(g, 58, 22, 37, 0, 15, 0, mat);
        solidBox(g, 61, 2, 40, 0, 27, 0, silver);
        for (var dock = -3; dock <= 3; dock++) solidBox(g, 5, 8, 0.8, dock * 7.5, 8, 18.8, glassBlue);
        solidBox(g, 13, 8, 9, 35, 8, -17, ceramic);
      } else if (f.kind === "station") {
        solidBox(g, 66, 3, 32, 0, 1.5, 0, ceramic);
        solidBox(g, 43, f.h * 0.52, 18, 0, f.h * 0.26 + 3, -2, mat);
        solidBox(g, 73, 2.4, 40, 0, f.h * 0.52 + 4, 0, silver);
        for (var pier = -3; pier <= 3; pier++) solidBox(g, 1.7, f.h * 0.50, 1.7, pier * 10, f.h * 0.25 + 3, 0, silver);
        [-1, 1].forEach(function (s) { solidBox(g, 71, 1.2, 2.2, 0, 0.8, s * 13, glassBlue); });
      } else {
        solidBox(g, 29, f.h - 7, 22, 0, (f.h - 7) / 2, 0, glassBlue); roofKit(g, f.kind, f.h - 7, 32);
      }
      signs.push(nameplate(g, f.name, 0, Math.max(3, f.h - 10), 20, 25));
      api.infrastructure.push(register(g, f, "infrastructure"));
    });
    api.railStations = INFRA.filter(function (f) { return f.kind === "station"; }).length;
    /* 两条独立管线沿液冷站与算力园区的后方布设，不是满城发光数据线。 */
    [0, 1].forEach(function (p) {
      var curve = new THREE.CatmullRomCurve3([[250, 4 + p * 1.4, -168], [250, 4 + p * 1.4, -204], [38, 4 + p * 1.4, -204], [14, 4 + p * 1.4, -138]].map(function (v) { return new THREE.Vector3(v[0], v[1], v[2]); }));
      var pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.7, 8, false), p ? glassBlue : silver); pipe.castShadow = pipe.receiveShadow = true; scene.add(pipe);
    });

    /* 河岸绿带、主街树阵和广场乔木均合并为实例网格。 */
    var treeLocations = [];
    for (var ti = 0; ti <= 160; ti += 2) {
      var li = riverLeft[ti], ri2 = riverRight[ti], lo = riverOuterLeft[ti], ro = riverOuterRight[ti];
      treeLocations.push([(li[0] * 0.42 + lo[0] * 0.58), (li[1] * 0.42 + lo[1] * 0.58)]);
      treeLocations.push([(ri2[0] * 0.42 + ro[0] * 0.58), (ri2[1] * 0.42 + ro[1] * 0.58)]);
    }
    xRoads.forEach(function (x, xi) {
      if (xi % 4 !== 0) return;
      var profile = riverAtX(x);
      for (var zt = cityBounds.minZ + 85; zt < cityBounds.maxZ; zt += 156) {
        if (Math.abs(zt - profile.z) < profile.half + 150) continue;
        treeLocations.push([x - 27, zt], [x + 27, zt]);
      }
    });
    zRoads.forEach(function (z, zi) {
      if (zi % 5 !== 0) return;
      for (var xt = cityBounds.minX + 90; xt < cityBounds.maxX; xt += 168) {
        var profile = riverAtX(xt); if (Math.abs(z - profile.z) < profile.half + 150) continue;
        treeLocations.push([xt, z - 28], [xt, z + 28]);
      }
    });
    [-1, 1].forEach(function (s) { for (var ptree = -3; ptree <= 3; ptree++) treeLocations.push([620 + ptree * 22, s * 48 - 30]); });
    var trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.55, 5, 6), bark, treeLocations.length);
    var crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(3.1, 8, 6), leaf, treeLocations.length), dummy = new THREE.Object3D();
    treeLocations.forEach(function (p, i) {
      dummy.position.set(p[0], 2.5, p[1]); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 6; dummy.scale.set(1, 1.25 + (i % 3) * 0.12, 1); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    });
    crowns.castShadow = crowns.receiveShadow = true; trunks.receiveShadow = true; scene.add(trunks, crowns); api.greenery = crowns;

    /* 空中物流采用银白机身，而非光球和长锥拖尾。 */
    var routes = [], crafts = [], craftRnd = U.rng(4242);
    for (var ci = 0; ci < 5; ci++) {
      var yy = 62 + craftRnd() * 85, zz = -1080 + ci * 510;
      var curve = new THREE.CatmullRomCurve3([[-2650, yy, zz + 100], [-1700, yy + 14, zz - 160], [-420, yy + 6, zz + 80], [920, yy + 20, zz - 90], [2050, yy + 4, zz + 120], [2650, yy + 3, zz - 20]].map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
      routes.push({ curve: curve, t: craftRnd(), speed: 0.009 + craftRnd() * 0.014 });
      var craft = makeDrone(1.0 + ci * 0.10); scene.add(craft); crafts.push(craft);
    }
    api.routes = routes; api.crafts = crafts; api.ads = [];
    var dust = B.particles({ n: 180, seed: 33, color: 0x8fd8ff, size: 1.6, opacity: 0.18, rise: 0.35, x0: -340, x1: 340, z0: -340, z1: 100, y0: 0, y1: 160 });
    scene.add(dust); nightObjects.push(dust); api.dust = [dust];

    scene.traverse(function (o) {
      if (!o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach(function (m) {
        if (materials.indexOf(m) >= 0) return; materials.push(m);
        if (m.uniforms && m.uniforms.uLit) facades.push({ mat: m, initial: m.uniforms.uLit.value });
        if (m !== skyMat && m !== moon.material && !m.isShadowMaterial && (m.transparent || (m.isMeshBasicMaterial && m.toneMapped === false))) {
          effects.push({ mat: m, opacity: m.opacity, color: m.color ? m.color.clone() : null,
            shaderOpacity: m.uniforms && m.uniforms.uOpacity ? m.uniforms.uOpacity.value : null });
        }
      });
    });
    /* 静态箱体按原生材质与投影标志实例化；不批处理 shader 或活动部件。 */
    scene.updateMatrixWorld(true);
    api.halls.concat(api.giants, api.infrastructure).forEach(function (g) { g.userData.bounds = new THREE.Box3().setFromObject(g); });
    var batches = {}, staticBoxes = [];
    scene.traverse(function (o) {
      if (!o.isMesh || o.geometry !== unitBox || !(o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial)) return;
      for (var parent = o; parent; parent = parent.parent) { if (parent.userData.dynamic) return; }
      var key = o.material.uuid + ":" + o.castShadow + ":" + o.receiveShadow;
      if (!batches[key]) batches[key] = [];
      batches[key].push(o); staticBoxes.push(o);
    });
    Object.keys(batches).forEach(function (key) {
      var boxes = batches[key], first = boxes[0];
      var mesh = new THREE.InstancedMesh(unitBox, first.material, boxes.length);
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.frustumCulled = false;
      mesh.userData.instanceOwners = boxes.map(function (box, i) { mesh.setMatrixAt(i, box.matrixWorld); return box.userData.owner || null; });
      scene.add(mesh);
      if (mesh.userData.instanceOwners.some(function (owner) { return !!owner; })) api.pickables.push(mesh);
    });
    staticBoxes.forEach(function (box) { box.parent.remove(box); });
    api.pickables = api.pickables.filter(function (mesh) { return !!mesh.parent; });
    api.facadeMaterials = facades.map(function (f) { return f.mat; });
    var shadowHour = null;
    api.inspect = function () {
      var s = api.state, values = facades.map(function (f) { return f.mat.uniforms.uLit.value; });
      return { hour: s.hour, name: s.name, day: s.day, night: s.night, nightSky: s.nightSky, exposure: s.exposure,
        sun: { visible: sun.visible, intensity: sun.intensity, position: sun.position.toArray(), direction: s.direction.toArray(), color: sun.color.toArray() },
        hemi: { intensity: hemi.intensity, sky: hemi.color.toArray(), ground: hemi.groundColor.toArray() },
        sky: { top: skyMat.uniforms.uTop.value.toArray(), mid: skyMat.uniforms.uMid.value.toArray(), hor: skyMat.uniforms.uHor.value.toArray(),
          stars: skyMat.uniforms.uStar.value, aurora: skyMat.uniforms.uAur.value, clouds: "两层平面程序云，非体积云" },
        facades: { count: values.length, standard: facades.every(function (f) { return !!f.mat.isMeshStandardMaterial; }),
          minLit: values.length ? Math.min.apply(Math, values) : 0, maxLit: values.length ? Math.max.apply(Math, values) : 0 },
        groundDay: groundMat.uniforms.uDay ? groundMat.uniforms.uDay.value : null,
        waterDay: waterMat.uniforms.uDay ? waterMat.uniforms.uDay.value : null,
        moonVisible: moon.visible, moonGlowVisible: moonGlow.visible, moonHaloVisible: moonHalo.visible,
        particlesVisible: dust.visible, environment: { ready: !!environment, hour: environmentHour },
        nodes: { halls: api.halls.length, giants: api.giants.length, facilities: api.infrastructure.length },
        urban: { buildings: api.buildingCount, roadBridges: api.roadBridgeCount, railStations: api.railStations, trainAvailable: !!api.train, riverSegments: api.riverSegments || 0, bounds: api.cityBounds,
          districts: window.YC_DISTRICTS ? window.YC_DISTRICTS.length : 0 },
        coordinates: "虚构局部场景单位，非 GIS", shadowMapSize: sun.shadow.mapSize.x };
    };
    api.setTime = function (hour) {
      var state = timeState(hour), day = state.day, night = state.night, nightSky = state.nightSky; api.state = state;
      skyMat.uniforms.uDay.value = day; skyMat.uniforms.uStar.value = nightSky * nightSky; skyMat.uniforms.uAur.value = nightSky * 0.28;
      skyMat.uniforms.uTwilight.value = state.twilight; skyMat.uniforms.uSun.value.copy(state.direction);
      skyMat.uniforms.uTop.value.setRGB(U.lerp(0.007, 0.085, day), U.lerp(0.014, 0.34, day), U.lerp(0.048, 0.86, day));
      skyMat.uniforms.uMid.value.setRGB(U.lerp(0.018, 0.27, day), U.lerp(0.034, 0.65, day), U.lerp(0.095, 1.12, day));
      skyMat.uniforms.uHor.value.setRGB(U.lerp(0.060, 0.77, day) + state.twilight * 0.38, U.lerp(0.085, 1.03, day), U.lerp(0.155, 1.23, day) - state.twilight * 0.32);
      skyMat.uniforms.uGround.value.setRGB(U.lerp(0.014, 0.22, day), U.lerp(0.025, 0.28, day), U.lerp(0.045, 0.29, day));
      sun.position.copy(sun.target.position).addScaledVector(state.direction, 1100); sun.intensity = 1.65 * state.sun;
      sun.color.setRGB(1, U.lerp(0.68, 0.94, state.sun), U.lerp(0.43, 0.84, state.sun)); sun.visible = state.elevation > 0;
      /* 静态结构的投影约36秒刷新；每次太阳位置仍精确更新，避免每帧重绘2048阴影。 */
      if (shadowHour === null || Math.abs(state.hour - shadowHour) >= 0.01) { sun.shadow.needsUpdate = true; shadowHour = state.hour; }
      hemi.intensity = U.lerp(0.25, 0.48, day);
      hemi.color.setRGB(U.lerp(0.19, 0.70, day), U.lerp(0.30, 0.87, day), U.lerp(0.57, 1.0, day));
      hemi.groundColor.setRGB(U.lerp(0.06, 0.46, day), U.lerp(0.10, 0.45, day), U.lerp(0.18, 0.38, day));
      scene.fog.color.copy(skyMat.uniforms.uHor.value).multiplyScalar(U.lerp(0.52, 0.72, day)); scene.fog.density = U.lerp(0.00042, 0.00014, day);
      if (groundMat.uniforms.uDay) groundMat.uniforms.uDay.value = day;
      if (waterMat.uniforms.uDay) waterMat.uniforms.uDay.value = day;
      facades.forEach(function (f) { f.mat.uniforms.uLit.value = U.clamp(f.initial * U.lerp(2.6, 0.045, day), 0, 0.86); });
      signs.forEach(function (sign) { sign.material.emissiveIntensity = U.lerp(0.65, 0.03, day); });
      effects.forEach(function (f) {
        if (f.color) f.mat.color.copy(f.color).multiplyScalar(U.lerp(1, 0.20, day));
        if (f.mat.transparent) f.mat.opacity = f.opacity * U.lerp(1, 0.25, day);
        if (f.shaderOpacity !== null) f.mat.uniforms.uOpacity.value = f.shaderOpacity * U.lerp(1, 0.25, day);
      });
      moon.visible = moonGlow.visible = moonHalo.visible = nightSky > 0.01;
      moon.material.opacity = nightSky * 0.92; moonGlow.material.opacity = 0.06 * nightSky; moonHalo.material.opacity = 0.025 * nightSky;
      nightObjects.forEach(function (o) { o.visible = nightSky > 0.05; });
      groundShadow.material.opacity = U.lerp(0.06, 0.24, day);
      if (api.onTimeChange) api.onTimeChange(state); return api.inspect();
    };
    api.setTime(opts.hour === undefined ? (Date.now() / 3600000 + 8) % 24 : opts.hour);
    api.update = function (dt, t) {
      if (api.camera) sky.position.copy(api.camera.position);
      materials.forEach(function (m) { if (m.uniforms && m.uniforms.uTime) m.uniforms.uTime.value = t; });
      fans.forEach(function (fan, i) { fan.rotation.y = t * (0.7 + i % 3 * 0.12); });
      routes.forEach(function (r, i) {
        r.t = (r.t + dt * r.speed) % 1; crafts[i].position.copy(r.curve.getPointAt(r.t));
        var tangent = r.curve.getTangentAt(r.t); crafts[i].lookAt(crafts[i].position.clone().add(tangent));
      });
      trainT += dt * 0.014 * trainDirection;
      if (trainT >= 1) { trainT = 1; trainDirection = -1; }
      if (trainT <= 0) { trainT = 0; trainDirection = 1; }
      trainPoint = railCurve.getPointAt(trainT); train.position.copy(trainPoint);
      train.lookAt(trainPoint.clone().add(railCurve.getTangentAt(trainT)));
    };
    return api;
  }
  global.YC3D_CITY = { build: buildCity, HALLS: HALLS, GIANTS: GIANTS, INFRA: INFRA, timeState: timeState };
})(window);

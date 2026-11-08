  /* ---------------- D14 蜂巢实验区 ----------------
     前十三个区里，只有 D08 的方环、D12 的一段弧不是直角，其余全是正交方格。
     D14 是第一个「60° 是唯一角度」的区：路在 120° 上相交，楼是六棱柱，
     广场是六边形，连场地边界都是六边形。
     三样东西定义它：一圈六边形环路、一片十八格的蜂窝台地、
     从蜂窝正中升起来的 96 米锥台。
     东侧与西侧的环外草地上再立三座 AI 大厂总部——
     26–58 米的蜂巢格是研究者的，96 米的锥台是国家的，214 米的塔是资本的。
     从西往东，楼越来越高，地在越来越少。 */
  PLANS.D14 = (function () {
    var hero = [];
    var CX = 0, CZ = -50;              /* 蜂窝台地中心 */
    var HR = 330;                      /* 环路外接圆 */

    /* --- 一 · 蜂窝台地：十八格六棱柱 ---
       单格外接半径 32、中心距 55.4 米。没有再密：
       R16–20 的格子在 600 米机位上会糊成一片马赛克，读不出「格子」；
       一格 64 米相当于一栋实验楼，密度和可读性都在这个尺度上成立。 */
    hero.push({ type: "hiveCluster", x: CX, z: CZ, w: 312, d: 312, r: 32, pad: 156,
      cells: [
        /* ring 1 —— 六格，48–58 米 */
        [1, 0, 48], [0, 1, 56], [-1, 1, 52], [-1, 0, 46], [0, -1, 58], [1, -1, 50],
        /* ring 2 —— 十二格，26–42 米 */
        [2, 0, 32], [0, 2, 28], [-2, 2, 34], [-2, 0, 30], [0, -2, 40], [2, -2, 26],
        [1, 1, 38], [-1, 2, 30], [-2, 1, 26], [-1, -1, 36], [1, -2, 42], [2, -1, 34]
      ] });

    /* --- 二 · 档案锥台：从蜂窝正中升起来 ---
       它不是「园区里的博物馆」，是「蜂巢正中的那一格」。
       底 R32 与单格同尺寸，顶 R19，十段外收，段间一道 1.4 米暗槽。
       底下 40 米被周围 46–58 米的格子挡住，看到的是一根从巢里冒出来的塔。 */
    hero.push({ type: "archiveFrustum", x: CX, z: CZ, w: 64, d: 64,
      h: 96, r0: 32, r1: 19, bands: 10, found: false });

    /* --- 三 · 六边形广场与观察井 --- */
    hero.push({ type: "hexPlaza", x: 0, z: 190, w: 176, d: 176, r: 84, found: false });

    /* --- 四 · 六边形环路的六个转角 ---
       六条 16 米的带子在顶点平头对接，中间会缺一个 60° 的楔形口。
       每个顶点铺一块 R15 的六边形，缺口变成转角——
       这是「不做完整蜂窝路网」的代价，也是它唯一需要补的地方。 */
    [[330, 0], [165, 286], [-165, 286], [-330, 0], [-165, -286], [165, -286]]
      .forEach(function (v) {
        hero.push({ type: "hexPlaza", x: v[0], z: v[1], w: 30, d: 30, r: 15,
          plain: true, found: false, occ: false, block: false });
      });

    /* --- 五 · 三座 AI 大厂总部 ---
       硬约束：有名字（塔身竖排 + 塔顶横匾）、比区内次高的锥台高一倍以上。
       三座落在六边形东、西南、西北三个顶点的环外带子正中（距中心 368 米）——
       带子只有 164 米宽，塔基放在 441 上，裙房的角离场地边界只剩 2 米。
       rot 全部按「正面朝区中心」算：从区里任何一个位置抬头，都看得到那名字。 */
    hero.push({ type: "aiTower", x: 420, z: 0, w: 100, d: 110, h: 214, variant: 0,
      rot: 0, plainMat: "aiShellA",
      brand: { name: "昇界", en: "SHENGJIE · WORLD MODEL", tone: "#eef6f8" },
      sign: { name: "昇界", en: "SHENGJIE AI", tone: "#a8e0ea", w: 66 } });

    hero.push({ type: "aiTower", x: -184, z: 319, w: 94, d: 94, h: 196, variant: 1,
      tw: 60, rot: -2.0944, plainMat: "aiShellB",
      brand: { name: "极栈", en: "JIZHAN · SILICON STACK", tone: "#ffe4cf" },
      sign: { name: "极栈", en: "JIZHAN AI", tone: "#ffb987", w: 62 } });

    hero.push({ type: "aiTower", x: -184, z: -319, w: 92, d: 92, h: 182, variant: 2,
      tw: 56, rot: 2.0944, plainMat: "aiShellC",
      brand: { name: "言枢", en: "YANSHU · LANGUAGE CORE", tone: "#e6e2ff" },
      sign: { name: "言枢", en: "YANSHU AI", tone: "#b9aef0", w: 60 } });

    /* --- 六 · 三组卫星蜂窝 ---
       主蜂窝之外的三小簇。它们不是装饰：一片 18 格的蜂窝不可能装下整所研究院，
       真正的研究单元是这些 3–5 格的小簇，散在环路外的草地上。 */
    hero.push({ type: "hiveCluster", x: -330, z: -150, w: 132, d: 132, r: 24, pad: 72,
      cells: [[0, 0, 30], [1, 0, 26], [0, 1, 34], [1, -1, 28]] });
    hero.push({ type: "hiveCluster", x: -320, z: 180, w: 112, d: 112, r: 21, pad: 58,
      cells: [[0, 0, 24], [1, 0, 30], [1, -1, 26]] });
    hero.push({ type: "hiveCluster", x: 130, z: 360, w: 180, d: 180, r: 21, pad: 92,
      cells: [[0, 0, 28], [1, 0, 32], [0, 1, 26], [1, 1, 30], [-1, 1, 24]] });

    /* --- 七 · 半埋绿玻璃实验舱 ---
       露出 4.2 米。既不能站人，也不能种树，只能读成「地下面还有一个东西」。 */
    [[-208, 42, 15], [-232, -92, 11], [206, 52, 14], [246, -66, 10], [-432, -34, 13]]
      .forEach(function (p) {
        hero.push({ type: "labPod", x: p[0], z: p[1], w: p[2] * 2.4, d: p[2] * 2.4,
          r: p[2], expose: 3.6 + (p[2] - 10) * 0.16, found: false });
      });

    /* 六条步行道：蜂窝台基直通环路。130 米宽的环形草坪上不铺路，
       俯视就是一块空地；六条 4.5 米的道沿六条边的法线铺出去，草地才有结构。
       走 spec.paths 而不是 hero——它不是建筑，是路。 */
    var paths = [];
    for (var w6 = 0; w6 < 6; w6++) {
      var wt = Math.PI / 3 * w6 + Math.PI / 6;
      paths.push({ pts: [[CX + 135 * Math.cos(wt), CZ + 135 * Math.sin(wt)],
        [286 * Math.cos(wt), 286 * Math.sin(wt)]], w: 4.5, cls: "lane", smooth: false });
    }

    /* 环路：外接圆 330 的正六边形。六条边各一条 16 米，
       转角由顶点上那六块小铺装收口。 */
    var HV = [];
    for (var hv = 0; hv < 6; hv++) {
      HV.push([HR * Math.cos(Math.PI / 3 * hv), HR * Math.sin(Math.PI / 3 * hv)]);
    }
    var avenues = [];
    for (var ha = 0; ha < 6; ha++) {
      avenues.push({ from: HV[ha], to: HV[(ha + 1) % 6], w: 16 });
    }
    /* 三条辐条：60° / 180° / 300°，从 R180 到 R330。
       全区没有一个 T 字路口——所有相交都在 120° 上。 */
    [60, 180, 300].forEach(function (deg) {
      var t = Math.PI / 180 * deg;
      avenues.push({ from: [180 * Math.cos(t), 180 * Math.sin(t)],
        to: [HR * Math.cos(t), HR * Math.sin(t)], w: 14 });
    });
    /* 三条进出道路：西顶点、南边中点、东北顶点。
       东北那条斜着出城，也给「从城里来」的人一个非正交的入口。 */
    avenues.push({ from: [-700, 0], to: [-330, 0], w: 22 });
    avenues.push({ from: [100, 700], to: [100, 286], w: 18 });
    avenues.push({ from: [165, -286], to: [440, -540], w: 14 });

    var noBuild = [
      { x: CX, z: CZ, w: 344, d: 344 },          /* 蜂窝台地 */
      { x: 0, z: 190, w: 190, d: 190 },          /* 广场 */
      { x: 420, z: 0, w: 132, d: 142 },          /* 昇界 */
      { x: -184, z: 319, w: 124, d: 124 },       /* 极栈 */
      { x: -184, z: -319, w: 122, d: 122 },      /* 言枢 */
      { x: -330, z: -150, w: 152, d: 152 },      /* 卫星组 1 */
      { x: -320, z: 180, w: 128, d: 128 },       /* 卫星组 2 */
      { x: 130, z: 360, w: 196, d: 196 }         /* 卫星组 3 */
    ];

    return {
      name: "蜂巢实验区", en: "HIVE LABS",
      R: 520, seed: 1414,
      /* 场地是一个正六边形，不是一个圆。俯视时三层六边形嵌套
         （场地 520 / 环路 330 / 台基 156），60° 这件事才成立。 */
      groundColor: 0x8d9b7f,
      groundStyle: "lawn",
      grid: { type: "none" },
      rings: [],
      avenues: avenues,
      paths: paths,
      plazas: [],
      noBuild: noBuild,
      /* 这一区不需要小楼。信息量全在十八格蜂窝、一座锥台、三座塔上，
         环路里再长出二十栋实验楼，蜂巢立刻退化成「又一片园区」。 */
      profile: { hMin: 10, hMax: 22, lotW: 30, lotD: 26, setback: 7, lotGap: 10,
        innerFill: 0.12, innerStep: 96, innerCap: 0.22, farMax: 16, ringFront: false,
        gable: 0.02, lowRise: 0.62 },
      types: [{ t: "campusLab", w: 3.0 }, { t: "labCourt", w: 2.2 },
        { t: "slab", w: 1.2 }, { t: "campusLibrary", w: 0.6 }],
      hero: hero,
      fringeRing: true,
      fringeFlat: true,
      coolRoof: true,
      /* 场地内基本不种行道树：蜂窝与环路之间的环形草坪已经是「空」的，
         再撒一圈树，蜂巢的锯齿天际线就埋进绿化里了。 */
      parkTrees: { clusters: 5 },
      groveClusters: 34,
      /* 机位：从南偏西的草地上看回来——锥台在正中，
         蜂窝在它身后铺开，昇界在右侧远处，极栈在左前景。
         phi 0.34 是这一区的下限：再低，十八格的顶面会连成一片白。 */
      view: { x: -120, y: 0, z: 40, dist: 700, phi: 0.34, theta: 2.05 },
      exposure: 1.03, exposureK: 0.97, sunIntensity: 1.10, hemiScale: 0.92,
      fogScale: 0.96,
      streetLife: { pedGap: 44, pedRun: 0.26, stall: 0, cart: 0.002, treeGap: 22 }
    };
  })();

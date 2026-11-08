
  /* ---------------- D13 东部制造港 ----------------
     前三十二个街区都是「街 + 房」：有街道、有沿街立面、有广场。
     这一区反过来——没有街，只有作业道；没有沿街立面，只有作业面；
     没有广场，只有堆场。

     它由三件事定义，缺一件就不成立：

     一、一条直线海岸。x = 200，垂直岸壁，海面 −2.6，落差 3 米。
     全城唯一一条用尺规画出来的硬边水岸（D04 是环湖的弧、
     D09 是自然草坡、D11 是带长堤的湾、D12 是芦苇碎岸）。
     二、六台岸桥。同一种构件重复六次，间距 76 米，60 米高的剪影
     压在海平线上。全城只有这一区能靠一排机器而不是一栋楼定位。
     三、三条地面铁轨。从北边界进城，南下 1240 米，在货场分出一股
     尽头线，向西 570 米直插月台仓。全城没有地面铁轨
     （D06 是高架城际的箱梁，另一回事）。

     从西到东是一条真实港区的作业剖面：仓库 → 铁路 → 堆场 → 岸桥 → 海。
     这是货物流转的顺序，也正好构成「近低远高」——
     别的区都是中心高、外围低，只有这一区越靠海越高。 */
  PLANS.D13 = (function () {
    var hero = [];

    /* --- 一 · 岸壁与码头面。
       block:false —— 它是一条 1240 米的带状物，按 w/d 切路会把整片 apron
       锁死，进港大道连码头边都到不了。occ:false 同理，占位交给 noBuild。 --- */
    hero.push({ type: "portQuay", x: 200, z: 0, w: 72, d: 1240,
      block: false, occ: false, wallL: 3400, seaY: -2.6 });

    /* --- 二 · 六台岸桥，间距 76 米 --- */
    var craneZ = [-190, -114, -38, 38, 114, 190];
    craneZ.forEach(function (cz, ci) {
      hero.push({ type: "stsCrane", x: 164, z: cz, w: 24, d: 20, h: 60,
        found: false, trolley: ci % 3 === 1 ? 32 : 20,
        load: ci === 2 || ci === 4 });
    });

    /* --- 三 · 三条地面铁路。轨距 5 米线间距，从北边界进城，
       在 z=160 分出一股尽头线向西插进月台仓。 --- */
    hero.push({ type: "railLine", pts: [[105, -640], [105, 166]], tracks: 3,
      block: false, occ: false, found: false });
    hero.push({ type: "railLine", pts: [[105, 160], [-470, 160]], tracks: 1,
      block: false, occ: false, found: false });

    /* --- 月台仓：300 米长，40 个卷帘门朝东对着铁路 --- */
    hero.push({ type: "freightShed", x: -320, z: 350, w: 280, d: 300, h: 17 });

    /* --- 推理芯片洁净厂房：全区最大的一块白 --- */
    hero.push({ type: "chipFab", x: -320, z: -460, w: 240, d: 180, h: 24 });

    /* --- 调度塔：40 米，全区唯一的高层，正对闸口 --- */
    hero.push({ type: "portTower", x: 168, z: -352, w: 26, d: 26, h: 40 });

    /* --- 堆场：两块主箱区 + 一块空箱区。 --- */
    hero.push({ type: "portYard", x: -235, z: -177, w: 350, d: 230, h: 12 });
    hero.push({ type: "portYard", x: -235, z: 61, w: 350, d: 162, h: 12 });
    hero.push({ type: "portYard", x: 38, z: 40, w: 88, d: 120, h: 12 });

    /* --- 西侧配套：220 kV 变电站、港区消防站、港务办公楼。
       三栋都是低矮的白盒子——它们只负责把西边界封住，不参与构图。 --- */
    hero.push({ type: "warehouse", x: -520, z: -70, w: 66, d: 190, h: 13, plainMat: "portShed2" });
    hero.push({ type: "warehouse", x: -520, z: 150, w: 66, d: 130, h: 11, plainMat: "portShed2" });
    hero.push({ type: "warehouse", x: -520, z: 560, w: 66, d: 100, h: 15, plainMat: "portFab2" });

    return {
      id: "D13", seed: 1313, R: 620,
      /* 地面：压实土 + 混凝土板。港区没有草坪——
         唯一的绿在西边界那一条防护林带里。 */
      groundColor: 0x8f8578,
      palette: ["sand", "graphite", "slate", "stoneGrey", "ivory", "rust"],
      paneColor: 0x27383f, nightLit: 0.22,
      /* 没有网格：这一区的路不是「网」，是三条尽端路 + 一条大道。 */
      grid: { type: "none" },
      rings: [],
      avenues: [
        /* 进港大道：从西边界直插码头，26 米，全区唯一的「街」 */
        { from: [-660, -320], to: [132, -320], w: 26 },
        /* 北段纵路：厂房与铁路之间 */
        { from: [-160, -650], to: [-160, -300], w: 16 },
        /* 纵一路：进港大道 → 月台仓，堆场与铁路之间的集卡通道 */
        { from: [-24, -320], to: [-24, 178], w: 16 },
        /* 货场路：铁路尽头线与月台仓之间 */
        { from: [-470, 182], to: [100, 182], w: 13 }
      ],
      /* 没有广场。这一区唯一一块「空地」是闸口前的集卡等候区，
         它不是广场，是停车场——所以不给铺装、不给纪念物、不给树。 */
      plazas: [],
      noBuild: [
        /* apron 与岸桥带：从墙根到岸桥后轨外 8 米 */
        { x: 164, z: 0, w: 80, d: 1260 },
        /* 铁路走廊：三条股道 + 两侧排水沟 */
        { x: 105, z: -240, w: 34, d: 820 },
        /* 尽头线与货场路 */
        { x: -185, z: 172, w: 620, d: 48 },
        /* 调度塔与闸口 */
        { x: 168, z: -352, w: 46, d: 46 },
        /* 西边界防护林带 */
        { x: -600, z: 0, w: 80, d: 1300 }
      ],
      /* 填充压到很低：这一区的信息量全在五件大东西上，
         多出二十栋小厂房，岸桥的剪影立刻被淹没成「又一片工业区」。 */
      profile: { hMin: 8, hMax: 15, lotW: 34, lotD: 30, setback: 6, lotGap: 8,
        innerFill: 0.14, innerStep: 96, innerCap: 0.40, farMax: 14, ringFront: false,
        gable: 0.06, lowRise: 0.55 },
      types: [
        { t: "warehouse", w: 4.0 }, { t: "loft", w: 1.4 },
        { t: "slab", w: 1.0 }, { t: "silo", w: 0.5 }
      ],
      hero: hero,
      /* 海边不能种一圈行道树：那是公园的做法。
         只在西边界留一条防护林带，用 fringeRing 的一半就够。 */
      fringeRing: false,
      parkTrees: { clusters: 8 },
      /* 机位：从东南方的海面上看回来——六台岸桥正对镜头，
         岸线斜穿画面，堆场与月台仓在它们身后。 */
      view: { x: -20, y: 0, z: 0, dist: 820, phi: 0.42, theta: 0.78 },
      exposure: 1.02, exposureK: 0.98, sunIntensity: 1.12, hemiScale: 0.94,
      fogScale: 0.90,
      streetLife: { pedGap: 60, pedRun: 0.18, stall: 0, cart: 0.001, treeGap: 18 }
    };
  })();

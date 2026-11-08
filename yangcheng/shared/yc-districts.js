/* 杨城 17 区划数据 · 3D 城市与平面总图共用。
   坐标是虚构局部场景单位（x: -3120..3260, z: -2700..2830），无地理底图。
   cx/cz/r 是片区在杨城总图上的位置与半径；三维城市按这张表把 17 个
   独立设计的街区拼成一座城，平面总图也按这张表绘制。
   vibe 决定该区 3D 街区的高度区间、立面色板与屋顶倾向；
   color/accent 是平面总图与 HUD 的主题色；marks 只是展示用归属清单。 */
(function (global) {
  "use strict";
  var DISTRICTS = [
    /* ---------------- 北岸 · 北排（工业与门户） ---------------- */
    { id: "D17", name: "西北能源新区", en: "NW ENERGY", cx: -2050, cz: -1980, r: 560,
      color: "#7fb8cf", accent: "#cfeaf5", vibe: "energy", minH: 16, maxH: 60, roof: "solar",
      desc: "双翼研发楼与风机、光伏海、储罐群共存的新能源试验区。全区不种草，唯一的绿是环路外那条防风林带。",
      marks: ["lingxi"], museums: [] },
    { id: "D03", name: "北岭智算谷", en: "NORTHRIDGE COMPUTE", cx: -780, cz: -1980, r: 470,
      color: "#6f8cff", accent: "#a8bdff", vibe: "compute", minH: 40, maxH: 110, roof: "cooling",
      desc: "全城算力最密的谷地：退台机房、液冷鳍片与聚变中试楼连成一片工业蓝。",
      marks: ["xingye", "zhulong", "wanxiang", "gewu"], museums: [] },
    { id: "D16", name: "云门商务区", en: "YUNMEN CBD", cx: 760, cz: -1980, r: 592,
      color: "#4f7fe8", accent: "#9fc0ff", vibe: "cbd", minH: 70, maxH: 210, roof: "crown",
      desc: "全城天际线的制高点：超高层幕墙塔群在北缘连成云门。",
      marks: [], museums: [] },
    { id: "D13", name: "东部制造港", en: "EAST PORT WORKS", cx: 2080, cz: -1980, r: 620,
      color: "#e89a4f", accent: "#ffcc95", vibe: "port", minH: 14, maxH: 58, roof: "warehouse",
      desc: "货运月台、分拣仓与推理芯片机房组成的制造与物流港区，东侧就是海。",
      marks: ["freight", "qingluan"], museums: [] },

    /* ---------------- 北岸 · 南排（核心与研发） ---------------- */
    { id: "D04", name: "云湖研究院", en: "CLOUDLAKE RESEARCH", cx: -2550, cz: -560, r: 470,
      color: "#4fd8b0", accent: "#a0f0d8", vibe: "research", minH: 26, maxH: 80, roof: "garden",
      desc: "湖区环绕的低层研究园：玻璃穹顶会议中庭与开放实验庭院。",
      marks: ["tianwen"], museums: [] },
    { id: "D06", name: "西站枢纽区", en: "WESTGATE TRANSIT", cx: -1420, cz: -560, r: 470,
      color: "#b48cff", accent: "#dcc8ff", vibe: "transit", minH: 24, maxH: 70, roof: "podium",
      desc: "高架城际线西段的站城一体门户：换乘大厅、平台雨棚与通勤塔楼。",
      marks: ["station-west"], museums: [] },
    { id: "D01", name: "中枢核心区", en: "CENTRAL CORE", cx: 0, cz: -560, r: 470,
      color: "#35d6e8", accent: "#8ff3ff", vibe: "core", minH: 60, maxH: 190, roof: "garden",
      desc: "杨城的绝对中心：城主演说广场、八家 AI 大厂总部与指标失效博物馆都在这里，是全城公认的推荐首站。",
      marks: ["spire", "plaza", "H3", "baize", "shenzhi", "lanzhou", "shangjian", "solar", "cooling", "drone", "garden", "station-center"],
      museums: ["H3"], featured: true },
    { id: "D14", name: "蜂巢实验区", en: "HIVE LABS", cx: 1330, cz: -560, r: 520,
      color: "#a8e05c", accent: "#d8ff9f", vibe: "lab", minH: 30, maxH: 96, roof: "hex",
      desc: "绿玻璃实验舱与六边形蜂巢楼群，数据污染博物馆的锥台主楼立在其中。",
      marks: ["H4", "shanhe"], museums: ["H4"] },

    /* ---------------- 南岸 · 北排（临江） ---------------- */
    { id: "D02", name: "河西文创区", en: "WESTBANK ARTS", cx: -2200, cz: 1010, r: 470,
      color: "#e8a35c", accent: "#ffd0a0", vibe: "heritage", minH: 18, maxH: 64, roof: "courtyard",
      desc: "老城肌理保存最完整的河岸街区：暖色骑楼、文化院落与能力与边界博物馆。",
      marks: ["H1", "mingjing"], museums: ["H1"] },
    { id: "D05", name: "临河司法区", en: "RIVERSIDE JUSTICE", cx: -1080, cz: 1010, r: 470,
      color: "#8fa8c8", accent: "#c8d8ef", vibe: "justice", minH: 30, maxH: 88, roof: "slab",
      desc: "冷青石材的竖条建筑群，推理法医馆与案卷广场坐落于此。",
      marks: ["H2"], museums: ["H2"] },
    { id: "D10", name: "河南混合街区", en: "SOUTH MIXED", cx: 280, cz: 1010, r: 560,
      color: "#e8836f", accent: "#ffc0b0", vibe: "mixed", minH: 22, maxH: 72, roof: "market",
      desc: "主桥以南的市井混合街区：中层骑楼、街市遮阳篷与中央站南广场。",
      marks: ["station-center"], museums: [] },
    { id: "D11", name: "学园滨水区", en: "ACADEMY BAY", cx: 1560, cz: 1010, r: 560,
      color: "#5cd0e0", accent: "#a8ecf5", vibe: "living", minH: 24, maxH: 84, roof: "slab",
      desc: "东侧湾区的居住与学园混合带：板式住宅、自动驾驶仿真塔与潜能与预算博物馆。",
      marks: ["H6", "yunchi", "station-east"], museums: ["H6"] },

    /* ---------------- 南岸 · 南排（腹地与郊野） ---------------- */
    { id: "D07", name: "大学城创新园", en: "ACADEMY INNOVATION", cx: -2000, cz: 2250, r: 470,
      color: "#d8b95c", accent: "#ffe4a0", vibe: "campus", minH: 20, maxH: 66, roof: "courtyard",
      desc: "沙色低层校园与创新大学：中央步行庭院、实验馆与木白实验室。",
      marks: ["university", "mubai"], museums: [] },
    { id: "D09", name: "绿谷新生活区", en: "GREENVALLEY LIVING", cx: -900, cz: 2250, r: 500,
      color: "#6fd86f", accent: "#b8f0b8", vibe: "green", minH: 16, maxH: 56, roof: "garden",
      desc: "河谷绿带上的低密度生活区：梯台花园、滨水声学舱与成荫的街巷。",
      marks: ["tinglan"], museums: [] },
    { id: "D08", name: "递归科学园区", en: "RECURSION PARK", cx: 300, cz: 2250, r: 470,
      color: "#c86fe0", accent: "#eab8ff", vibe: "recursive", minH: 28, maxH: 92, roof: "terrace",
      desc: "紫调梯台园区，递归坍塌博物馆的漏斗形主楼是全城最容易被认出的轮廓。",
      marks: ["H5"], museums: ["H5"] },
    { id: "D15", name: "东南设计社区", en: "DESIGN QUARTER", cx: 1450, cz: 2250, r: 480,
      color: "#ef7fb0", accent: "#ffc0da", vibe: "design", minH: 20, maxH: 70, roof: "loft",
      desc: "架空球壳展示中心、创意工坊与滨水步道组成的设计师社区。",
      marks: ["chuanqi"], museums: [] },
    { id: "D12", name: "澄湾生态城", en: "CHENGWAN ECO", cx: 2720, cz: 1910, r: 440,
      color: "#7fe8c8", accent: "#c0f5e5", vibe: "eco", minH: 18, maxH: 60, roof: "solar",
      desc: "白色弧形医疗楼、沉淀池与湿地水面构成的生态公共服务城。",
      marks: ["hospital", "waterworks"], museums: [] }
  ];
  global.YC_DISTRICTS = DISTRICTS;
  /* 片区是正方形地块：半边长 hx/hz 决定三维地面板与平面总图的边界框。
     默认取 r，个别区（D11 的板式住宅排、D13 的码头岸线）另有实测值。 */
  var PLATE = {
    D11: { hx: 600, hz: 760 }, D13: { hx: 620, hz: 620 }, D15: { hx: 480, hz: 480 },
    D16: { hx: 592, hz: 592 }, D12: { hx: 440, hz: 440 }
  };
  DISTRICTS.forEach(function (d) {
    var p = PLATE[d.id];
    d.hx = p ? p.hx : d.r; d.hz = p ? p.hz : d.r;
  });
  /* 用地归属：按「到片区的归一化距离」取最近的一个，避免大区把邻区吃掉 */
  global.YC_DISTRICT_AT = function (x, z) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      var nx = (x - d.cx) / d.hx, nz = (z - d.cz) / d.hz;
      var dist = Math.sqrt(nx * nx + nz * nz);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  };
})(window);

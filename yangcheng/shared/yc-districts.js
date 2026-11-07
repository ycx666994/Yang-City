/* 杨城 17 区划数据 · 3D 城市与平面总图共用。
   坐标是虚构局部场景单位（x: -2700..2700, z: -1800..1800），无地理底图。
   vibe 决定该区 3D 街区的高度区间、立面色板与屋顶倾向；
   color/accent 是平面总图与 HUD 的主题色；marks 只是展示用归属清单。 */
(function (global) {
  "use strict";
  var DISTRICTS = [
    { id: "D01", name: "中枢核心区", en: "CENTRAL CORE", cx: 0, cz: -60, r: 640,
      color: "#35d6e8", accent: "#8ff3ff", vibe: "core", minH: 60, maxH: 190, roof: "garden",
      desc: "杨城的绝对中心：主塔、中央广场与指标失效博物馆都在这里，是全城公认的推荐首站。",
      marks: ["spire", "plaza", "H3", "baize", "shenzhi", "lanzhou", "shangjian", "solar", "cooling", "drone", "garden", "station-center"],
      museums: ["H3"], featured: true },
    { id: "D02", name: "河西文创区", en: "WESTBANK ARTS", cx: -1450, cz: 330, r: 620,
      color: "#e8a35c", accent: "#ffd0a0", vibe: "heritage", minH: 18, maxH: 64, roof: "courtyard",
      desc: "老城肌理保存最完整的河岸街区：暖色骑楼、文化院落与能力与边界博物馆。",
      marks: ["H1", "mingjing"], museums: ["H1"] },
    { id: "D03", name: "北岭智算谷", en: "NORTHRIDGE COMPUTE", cx: -400, cz: -900, r: 640,
      color: "#6f8cff", accent: "#a8bdff", vibe: "compute", minH: 40, maxH: 110, roof: "cooling",
      desc: "全城算力最密的谷地：退台机房、液冷鳍片与聚变中试楼连成一片工业蓝。",
      marks: ["xingye", "zhulong", "wanxiang", "gewu"], museums: [] },
    { id: "D04", name: "云湖研究院", en: "CLOUDLAKE RESEARCH", cx: -2150, cz: -700, r: 600,
      color: "#4fd8b0", accent: "#a0f0d8", vibe: "research", minH: 26, maxH: 80, roof: "garden",
      desc: "湖区环绕的低层研究园：玻璃穹顶会议中庭与开放实验庭院。",
      marks: ["tianwen"], museums: [] },
    { id: "D05", name: "临河司法区", en: "RIVERSIDE JUSTICE", cx: -1150, cz: -650, r: 480,
      color: "#8fa8c8", accent: "#c8d8ef", vibe: "justice", minH: 30, maxH: 88, roof: "slab",
      desc: "冷青石材的竖条建筑群，推理法医馆与案卷广场坐落于此。",
      marks: ["H2"], museums: ["H2"] },
    { id: "D06", name: "西站枢纽区", en: "WESTGATE TRANSIT", cx: -1900, cz: -200, r: 480,
      color: "#b48cff", accent: "#dcc8ff", vibe: "transit", minH: 24, maxH: 70, roof: "podium",
      desc: "高架城际线西段的站城一体门户：换乘大厅、平台雨棚与通勤塔楼。",
      marks: ["station-west"], museums: [] },
    { id: "D07", name: "大学城创新园", en: "ACADEMY INNOVATION", cx: -1750, cz: 1350, r: 620,
      color: "#d8b95c", accent: "#ffe4a0", vibe: "campus", minH: 20, maxH: 66, roof: "courtyard",
      desc: "沙色低层校园与创新大学：中央步行庭院、实验馆与木白实验室。",
      marks: ["university", "mubai"], museums: [] },
    { id: "D08", name: "递归科学园区", en: "RECURSION PARK", cx: -1000, cz: 1250, r: 460,
      color: "#c86fe0", accent: "#eab8ff", vibe: "recursive", minH: 28, maxH: 92, roof: "terrace",
      desc: "紫调梯台园区，递归坍塌博物馆的漏斗形主楼是全城最容易被认出的轮廓。",
      marks: ["H5"], museums: ["H5"] },
    { id: "D09", name: "绿谷新生活区", en: "GREENVALLEY LIVING", cx: -450, cz: 1000, r: 560,
      color: "#6fd86f", accent: "#b8f0b8", vibe: "green", minH: 16, maxH: 56, roof: "garden",
      desc: "河谷绿带上的低密度生活区：梯台花园、滨水声学舱与成荫的街巷。",
      marks: ["tinglan"], museums: [] },
    { id: "D10", name: "河南混合街区", en: "SOUTH MIXED", cx: 450, cz: 750, r: 560,
      color: "#e8836f", accent: "#ffc0b0", vibe: "mixed", minH: 22, maxH: 72, roof: "market",
      desc: "主桥以南的市井混合街区：中层骑楼、街市遮阳篷与中央站南广场。",
      marks: ["station-center"], museums: [] },
    { id: "D11", name: "学园滨水区", en: "ACADEMY BAY", cx: 1500, cz: 1050, r: 560,
      color: "#5cd0e0", accent: "#a8ecf5", vibe: "living", minH: 24, maxH: 84, roof: "slab",
      desc: "东侧湾区的居住与学园混合带：板式住宅、自动驾驶仿真塔与潜能与预算博物馆。",
      marks: ["H6", "yunchi", "station-east"], museums: ["H6"] },
    { id: "D12", name: "澄湾生态城", en: "CHENGWAN ECO", cx: 2300, cz: 1400, r: 440,
      color: "#7fe8c8", accent: "#c0f5e5", vibe: "eco", minH: 18, maxH: 60, roof: "solar",
      desc: "白色弧形医疗楼、沉淀池与湿地水面构成的生态公共服务城。",
      marks: ["hospital", "waterworks"], museums: [] },
    { id: "D13", name: "东部制造港", en: "EAST PORT WORKS", cx: 2350, cz: -1250, r: 620,
      color: "#e89a4f", accent: "#ffcc95", vibe: "port", minH: 14, maxH: 58, roof: "warehouse",
      desc: "货运月台、分拣仓与推理芯片机房组成的制造与物流港区。",
      marks: ["freight", "qingluan"], museums: [] },
    { id: "D14", name: "蜂巢实验区", en: "HIVE LABS", cx: 1450, cz: -450, r: 520,
      color: "#a8e05c", accent: "#d8ff9f", vibe: "lab", minH: 30, maxH: 96, roof: "hex",
      desc: "绿玻璃实验舱与六边形蜂巢楼群，数据污染博物馆的锥台主楼立在其中。",
      marks: ["H4", "shanhe"], museums: ["H4"] },
    { id: "D15", name: "东南设计社区", en: "DESIGN QUARTER", cx: 1550, cz: 550, r: 480,
      color: "#ef7fb0", accent: "#ffc0da", vibe: "design", minH: 20, maxH: 70, roof: "loft",
      desc: "架空球壳展示中心、创意工坊与滨水步道组成的设计师社区。",
      marks: ["chuanqi"], museums: [] },
    { id: "D16", name: "云门商务区", en: "YUNMEN CBD", cx: 150, cz: -1200, r: 600,
      color: "#4f7fe8", accent: "#9fc0ff", vibe: "cbd", minH: 70, maxH: 210, roof: "crown",
      desc: "全城天际线的制高点：超高层幕墙塔群在北缘连成云门。",
      marks: [], museums: [] },
    { id: "D17", name: "西北能源新区", en: "NW ENERGY", cx: -2100, cz: -1350, r: 560,
      color: "#9fd8e8", accent: "#d0f2fa", vibe: "energy", minH: 16, maxH: 60, roof: "solar",
      desc: "双翼研发楼与风机、光伏海、储罐群共存的新能源试验区。",
      marks: ["lingxi"], museums: [] }
  ];
  global.YC_DISTRICTS = DISTRICTS;
  global.YC_DISTRICT_AT = function (x, z) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i], dx = x - d.cx, dz = z - d.cz, dist = Math.sqrt(dx * dx + dz * dz);
      if (dist - d.r < bestD) { bestD = dist - d.r; best = d; }
    }
    return best;
  };
})(window);

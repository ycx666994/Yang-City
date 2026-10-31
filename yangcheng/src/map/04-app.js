/* 杨城地图 · 俯瞰城市渲染
   六馆造型各不相同（对应总方案 9.1 的建筑轮廓），全部由数据驱动：
   位置、状态、颜色、判断句都来自 YCEvidence.HALLS，地图不另存一份真相。

   空间组织刻意做成不规则：六馆距离中心 164—380 不等，方位也不均分。
   现实里的博物馆不会绕中心排成正六边形 —— 它们跟着老城、河道、路网长。 */
(function () {
  "use strict";
  var E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };

  var CX = 490, CY = 445;

  /* 不规则分布：01 贴着老城核心，02/03 在东北与东南，04 在河对岸，05 在西北公园旁，06 在东侧新区 */
  var POS = {
    H1: [700, 292],   // 能力与边界 · 老城核心，广场东北角外的老街区
    H2: [930, 200],   // 推理法医 · 右上，学院区
    H3: [830, 500],   // 指标失效 · 中右，工业带
    H4: [215, 672],   // 数据污染 · 河对岸，孤立于西南
    H5: [185, 155],   // 递归坍塌 · 左上角，公园旁
    H6: [1000, 660]   // 潜能与预算 · 右下角，新区
  };

  var CIVIC = [
    { id: "evidence", name: "公共证据厅", x: CX, y: CY, r: 86, kind: "core",
      href: "evidence.html", desc: "案例索引 · 证据托盘 · 实验回放 · 分歧记录 · 导出" },
    { id: "archive", name: "中央档案馆", x: 398, y: 522, r: 23, kind: "civic",
      desc: "全城已保存的运行记录都在这里，按馆与时间索引" },
    { id: "clock", name: "时间钟楼", x: 602, y: 388, r: 20, kind: "civic",
      desc: "与北京时间同步。城市的光线由它驱动" },
    { id: "yard", name: "校准广场", x: 566, y: 604, r: 27, kind: "plaza",
      desc: "仪器自检与公开校准的露天场地" },
    { id: "hall", name: "讲堂", x: 366, y: 396, r: 21, kind: "civic",
      desc: "课堂路线起点：课前预测、分组实验、陌生题复测" },
    { id: "pier", name: "河岸码头", x: 352, y: 742, r: 19, kind: "civic",
      desc: "从水路进城的入口，也是冷却水取水点" }
  ];

  /* 每馆占地尺度不同 —— 现实里的博物馆不会都是同一个圆盘。
     数值即基准半径倍率：06 最大（新区，整体规划），05 最小（公园里的老温室）。 */
  var SCALE = { H1: 1.00, H2: 0.84, H3: 1.12, H4: 0.92, H5: 0.76, H6: 1.20 };

  /* 场地轮廓：rx / ry / 旋转角。三个参数都不同，避免「六个同款白圆」。 */
  var SITE = {
    H1: [64, 60, 0],     // 老城核心 · 正圆，但被四周街道切出棱角
    H2: [58, 50, -14],   // 学院区 · 扁椭圆，斜置
    H3: [72, 54, 9],     // 工业带 · 横向长条
    H4: [56, 46, 24],    // 河对岸 · 斜置小地块
    H5: [50, 40, -20],   // 公园旁 · 最小，压扁
    H6: [70, 62, 6]      // 新区 · 最大，接近圆
  };

  /* 公共证据厅广场：九向半径不等的多边形，不是同心圆。
     城市广场是长出来的，围着钟楼、档案馆、台阶一点点加建。 */
  var PLAZA = (function () {
    var rs = [126, 104, 138, 92, 118, 108, 132, 96, 114];
    var pts = [];
    for (var i = 0; i < rs.length; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / rs.length;
      pts.push([CX + Math.cos(a) * rs[i] * 1.18, CY + Math.sin(a) * rs[i] * 0.80]);
    }
    return pts;
  })();

  /* 1 地图单位 ≈ 6.6 米（全城东西向约 8 公里）。图上距离换算成路程与时间用。 */
  var METER = 6.6;
  var LEGS = [];

  /* 城市干线：几条长街各自横穿，不交汇于一点。
     馆不挂在中心上，而是挂在离自己最近的那条街上 —— 这是「不呈环状」的关键。 */
  var ARTERIALS = [
    /* 北干线：从西侧高地斜穿到东北学院区 */
    [[-60, 356], [172, 322], [368, 344], [556, 286], [742, 262], [926, 208], [1128, 236], [1260, 226]],
    /* 西纵：贴着公园西缘南下，在 300,470 过桥到河对岸 */
    [[252, -60], [268, 138], [238, 300], [286, 430], [262, 566], [300, 712], [268, 880]],
    /* 东纵：穿过学院区与工业带，最长的一条 */
    [[772, -60], [792, 148], [726, 322], [768, 486], [712, 636], [748, 880]],
    /* 南干线：沿河走，串起码头与新区 */
    [[-60, 586], [148, 604], [366, 572], [566, 598], [782, 566], [1002, 592], [1260, 548]],
    /* 斜街：老城最短的一条，只连两处，不通向任何馆 */
    [[452, 496], [486, 396], [446, 268], [478, 118]]
  ];

  /* 找折线上离 (x,y) 最近的点，用来给馆挂支路 */
  function nearestOnPath(pts, x, y) {
    var best = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      var t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var px = ax + dx * t, py = ay + dy * t;
      var d = dist(x, y, px, py);
      if (!best || d < best.d) best = { d: d, x: px, y: py };
    }
    return best;
  }

  /* 是否压到干线上（街区与树要避让，不然路会从楼里穿过去） */
  function nearRoad(x, y, pad) {
    for (var i = 0; i < ARTERIALS.length; i++) {
      var n = nearestOnPath(ARTERIALS[i], x, y);
      if (n && n.d < pad) return true;
    }
    return false;
  }

  /* 阴影方向与首页共用同一条时间线 */
  function shadowVec(t) {
    var a = Math.max(0, Math.min(Math.PI, (t - 6) / 12.6 * Math.PI));
    var night = (t < 5.6 || t > 19.4);
    var k = night ? 0.16 : 0.26 + 0.30 * Math.sin(a);
    return { x: -Math.cos(a) * k, y: -Math.sin(a) * k - (night ? 0.03 : 0.10) };
  }

  function hexA(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

  /* ---------------- 六馆俯视造型（以 0,0 为中心，基准半径 52） ---------------- */
  function hallShape(id, ac, ready) {
    var s = [], i, a;
    var st = ready ? ac : hexA(ac, 0.50);
    var fs = hexA(ac, ready ? 0.15 : 0.07);
    var dash = ready ? "" : ' stroke-dasharray="7 5"';

    if (id === "H1") {
      s.push('<circle r="54" fill="none" stroke="' + hexA(ac, ready ? .46 : .24) + '" stroke-width="1.4" stroke-dasharray="8 8"/>');
      s.push('<circle r="42" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      s.push('<circle r="24" fill="none" stroke="' + hexA(ac, .6) + '" stroke-width="1.6"/>');
      s.push('<circle r="9" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
      for (i = 0; i < 12; i++) {
        a = i * Math.PI / 6;
        var r2 = i % 3 === 0 ? 54 : 48;
        s.push('<line x1="' + (Math.cos(a) * 44).toFixed(1) + '" y1="' + (Math.sin(a) * 44).toFixed(1) +
               '" x2="' + (Math.cos(a) * r2).toFixed(1) + '" y2="' + (Math.sin(a) * r2).toFixed(1) +
               '" stroke="' + hexA(ac, .72) + '" stroke-width="1.5"/>');
      }
    } else if (id === "H2") {
      var pts = [], pr = 52;
      for (i = 0; i < 6; i++) {
        a = -Math.PI / 2 + i * Math.PI / 3;
        pts.push((Math.cos(a) * pr).toFixed(1) + "," + (Math.sin(a) * pr).toFixed(1));
      }
      s.push('<polygon points="' + pts.join(" ") + '" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      for (i = 0; i < 3; i++) {
        a = -Math.PI / 2 + i * Math.PI / 3;
        s.push('<line x1="0" y1="0" x2="' + (Math.cos(a) * pr).toFixed(1) + '" y2="' + (Math.sin(a) * pr).toFixed(1) +
               '" stroke="' + hexA(ac, .34) + '" stroke-width="1.2"/>');
      }
      s.push('<circle r="10" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
    } else if (id === "H3") {
      s.push('<rect x="-22" y="-9" width="44" height="18" fill="' + hexA(ac, .24) + '"/>');
      s.push('<circle cx="-24" r="28" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      s.push('<circle cx="24" r="28" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      s.push('<circle cx="-24" r="13" fill="none" stroke="' + hexA(ac, .52) + '" stroke-width="1.3"/>');
      s.push('<circle cx="24" r="13" fill="none" stroke="' + hexA(ac, .52) + '" stroke-width="1.3"/>');
      s.push('<circle cx="-24" r="5" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
      s.push('<circle cx="24" r="5" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
    } else if (id === "H4") {
      s.push('<rect x="-52" y="-32" width="104" height="64" rx="5" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      for (i = 1; i <= 4; i++) {
        var yy = -32 + (64 / 5) * i;
        s.push('<line x1="-47" y1="' + yy + '" x2="47" y2="' + yy + '" stroke="' + hexA(ac, .44) + '" stroke-width="1.3"/>');
      }
      for (i = 0; i < 8; i++) {
        var xx = -46 + i * 12;
        s.push('<line x1="' + xx + '" y1="-27" x2="' + xx + '" y2="27" stroke="' + hexA(ac, .22) + '" stroke-width="1"/>');
      }
      s.push('<circle r="6" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
    } else if (id === "H5") {
      s.push('<ellipse rx="55" ry="39" fill="' + fs + '" stroke="' + st + '" stroke-width="2.4"' + dash + '/>');
      for (i = 0; i < 8; i++) {
        a = i * Math.PI / 4;
        s.push('<line x1="0" y1="0" x2="' + (Math.cos(a) * 55).toFixed(1) + '" y2="' + (Math.sin(a) * 39).toFixed(1) +
               '" stroke="' + hexA(ac, .30) + '" stroke-width="1.1"/>');
      }
      s.push('<ellipse rx="27" ry="19" fill="none" stroke="' + hexA(ac, .55) + '" stroke-width="1.4"/>');
      s.push('<circle r="7" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
    } else {
      /* 可变穹顶：六片展开的扇叶，不是同心环 */
      for (i = 0; i < 6; i++) {
        a = i * Math.PI / 3 - Math.PI / 2;
        var a1 = a - 0.42, a2 = a + 0.42, R = 62;
        s.push('<path d="M0 0 L' + (Math.cos(a1) * R).toFixed(1) + ' ' + (Math.sin(a1) * R).toFixed(1) +
          ' A' + R + ' ' + R + ' 0 0 1 ' + (Math.cos(a2) * R).toFixed(1) + ' ' + (Math.sin(a2) * R).toFixed(1) +
          ' Z" fill="' + hexA(ac, ready ? .13 : .06) + '" stroke="' + hexA(ac, ready ? .58 : .30) + '" stroke-width="1.5"' + (ready ? "" : ' stroke-dasharray="5 4"') + '/>');
      }
      s.push('<circle r="30" fill="' + fs + '" stroke="' + st + '" stroke-width="2.2"' + dash + '/>');
      s.push('<circle r="14" fill="' + hexA(ac, .34) + '" stroke="' + hexA(ac, .82) + '" stroke-width="1.3"/>');
      s.push('<circle r="5" fill="' + (ready ? ac : hexA(ac, .5)) + '"/>');
    }
    return s.join("");
  }

  function civicShape(c, ac) {
    var s = [], i, a;
    if (c.kind === "core") {
      /* 广场是九边形，铺装是缩小的同形多边形 —— 没有一条同心圆 */
      function poly(k) {
        var q = PLAZA.map(function (p) { return [(p[0] - CX) * k, (p[1] - CY) * k]; });
        return closedPath(q);
      }
      s.push('<path d="' + poly(1) + '" fill="#e9f1de" opacity=".94"/>');
      s.push('<path d="' + poly(1) + '" fill="none" stroke="' + hexA(ac, .34) + '" stroke-width="2" stroke-dasharray="11 9"/>');
      s.push('<path d="' + poly(0.76) + '" fill="#f4f9ec" opacity=".9"/>');
      s.push('<path d="' + poly(0.76) + '" fill="none" stroke="' + hexA(ac, .16) + '" stroke-width="1.2"/>');
      s.push('<path d="' + poly(0.58) + '" fill="#ffffff" stroke="' + ac + '" stroke-width="2.6"/>');
      s.push('<path d="' + poly(0.42) + '" fill="none" stroke="' + hexA(ac, .40) + '" stroke-width="1.4"/>');
      /* 广场上的铺装分格：沿多边形顶点切，不绕圈 */
      for (i = 0; i < PLAZA.length; i += 2) {
        var q1 = [(PLAZA[i][0] - CX), (PLAZA[i][1] - CY)];
        s.push('<line x1="' + (q1[0] * 0.58).toFixed(1) + '" y1="' + (q1[1] * 0.58).toFixed(1) +
               '" x2="' + (q1[0] * 0.94).toFixed(1) + '" y2="' + (q1[1] * 0.94).toFixed(1) +
               '" stroke="' + hexA(ac, .20) + '" stroke-width="1.2"/>');
      }
      s.push('<circle r="19" fill="' + hexA(ac, .13) + '" stroke="' + ac + '" stroke-width="1.8"/>');
    } else if (c.kind === "plaza") {
      s.push('<ellipse rx="' + (c.r + 20) + '" ry="' + (c.r * 0.66) + '" fill="#f4f8ef" stroke="' + hexA(ac, .38) + '" stroke-width="1.4" stroke-dasharray="5 5"/>');
      s.push('<ellipse rx="' + c.r + '" ry="' + (c.r * 0.60) + '" fill="none" stroke="' + hexA(ac, .52) + '" stroke-width="1.3"/>');
      s.push('<circle r="5" fill="' + hexA(ac, .58) + '"/>');
    } else {
      s.push('<rect x="' + (-c.r) + '" y="' + (-c.r * 0.78) + '" width="' + (c.r * 2) + '" height="' + (c.r * 1.56) + '" rx="4" fill="#fff" stroke="' + hexA(ac, .68) + '" stroke-width="1.7"/>');
      s.push('<line x1="' + (-c.r) + '" y1="' + (-c.r * 0.12) + '" x2="' + c.r + '" y2="' + (-c.r * 0.12) + '" stroke="' + hexA(ac, .32) + '" stroke-width="1"/>');
      s.push('<rect x="' + (-c.r * 0.26) + '" y="' + (-c.r * 0.68) + '" width="' + (c.r * 0.52) + '" height="' + (c.r * 0.32) + '" fill="' + hexA(ac, .26) + '"/>');
    }
    return s.join("");
  }

  /* 闭合的 Catmull-Rom：首尾环绕取样，接缝处不会出现折角 */
  function closedPath(pts) {
    var n = pts.length;
    if (n < 3) return "";
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) +
           " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d + " Z";
  }

  /* 开放折线：Catmull-Rom → 三次贝塞尔，动线自然穿过各点 */
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i], p2 = pts[i + 1];
      var p3 = pts[i + 2] || pts[i + 1];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) +
           " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }

  var svg = null, tip = null;

  function render(t) {
    var sv = shadowVec(t);
    var out = [];
    var rnd = rng(77123);

    out.push('<defs>' +
      '<linearGradient id="gGrass" x1="0" y1="0" x2="0.4" y2="1">' +
        '<stop offset="0" stop-color="#e2ecd4"/><stop offset="0.5" stop-color="#d3e3c3"/><stop offset="1" stop-color="#c4dab2"/>' +
      '</linearGradient>' +
      '<linearGradient id="gWater" x1="0" y1="0" x2="0.3" y2="1">' +
        '<stop offset="0" stop-color="#a8d8ea"/><stop offset="0.55" stop-color="#7fc3dc"/><stop offset="1" stop-color="#5faecb"/>' +
      '</linearGradient>' +
      '<filter id="fGlow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '<filter id="fSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
      '<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">' +
        '<path d="M0 0 L10 5 L0 10 z" fill="#cf7d22"/></marker>' +
      '</defs>');
    out.push('<rect x="-200" y="-200" width="1600" height="1220" fill="url(#gGrass)"/>');

    /* 草地斑块 */
    for (var p = 0; p < 22; p++) {
      var px = -60 + rnd() * 1320, py = -40 + rnd() * 900;
      var prx = 70 + rnd() * 140, pry = 46 + rnd() * 86;
      out.push('<ellipse cx="' + px.toFixed(0) + '" cy="' + py.toFixed(0) + '" rx="' + prx.toFixed(0) +
        '" ry="' + pry.toFixed(0) + '" fill="' + (p % 2 ? "#dbe8ca" : "#cadfb6") + '" opacity="' + (0.34 + rnd() * 0.28).toFixed(2) + '"/>');
    }

    /* 水系 */
    out.push('<path d="M -40 296 C 150 340, 262 456, 302 612 C 332 730, 462 786, 702 798 C 902 808, 1062 758, 1244 690" ' +
      'fill="none" stroke="#c3e0ec" stroke-width="72" stroke-linecap="round" opacity=".62"/>');
    out.push('<path d="M -40 296 C 150 340, 262 456, 302 612 C 332 730, 462 786, 702 798 C 902 808, 1062 758, 1244 690" ' +
      'fill="none" stroke="url(#gWater)" stroke-width="46" stroke-linecap="round"/>');
    out.push('<ellipse cx="1026" cy="162" rx="92" ry="58" fill="url(#gWater)" opacity=".92"/>');
    out.push('<ellipse cx="1026" cy="162" rx="92" ry="58" fill="none" stroke="#96cede" stroke-width="2.6" opacity=".66"/>');

    /* 公园 */
    var parks = [[890, 380, 78, 48], [300, 262, 70, 46], [720, 694, 82, 50], [130, 480, 62, 40], [1036, 432, 54, 36]];
    parks.forEach(function (q) {
      out.push('<ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="' + q[2] + '" ry="' + q[3] + '" fill="#a9cc8c" opacity=".68"/>');
    });

    /* 城市肌理：按街区簇生成，有密有疏，而不是均匀噪点 */
    var blocks = [];
    function freeSpot(bx, by) {
      if (dist(bx, by, CX, CY) < 192) return false;
      for (var k in POS) if (dist(bx, by, POS[k][0], POS[k][1]) < 78 * (SCALE[k] || 1) + 16) return false;
      if (nearRoad(bx, by, 17)) return false;
      if (by > 240 && by < 400 && bx < 230) return false;
      if (by > 570 && bx < 345) return false;
      if (by > 738) return false;
      return true;
    }
    for (var cl = 0; cl < 46; cl++) {
      var ccx = -20 + rnd() * 1240, ccy = -20 + rnd() * 860;
      if (!freeSpot(ccx, ccy)) continue;
      var cnt = 6 + Math.floor(rnd() * 12);
      var spread = 26 + rnd() * 54;
      for (var bi2 = 0; bi2 < cnt; bi2++) {
        var bx = ccx + (rnd() - 0.5) * spread;
        var by = ccy + (rnd() - 0.5) * spread * 0.8;
        if (!freeSpot(bx, by)) continue;
        blocks.push({ x: bx, y: by, w: 9 + rnd() * 16, h: 9 + rnd() * 16, o: 0.34 + rnd() * 0.44 });
      }
    }
    blocks.sort(function (a, c) { return a.y - c.y; });
    blocks.forEach(function (q) {
      out.push('<rect x="' + q.x.toFixed(1) + '" y="' + q.y.toFixed(1) + '" width="' + q.w.toFixed(1) + '" height="' + q.h.toFixed(1) +
        '" rx="1.2" fill="#93aeb8" opacity="' + q.o.toFixed(2) + '"/>');
      out.push('<rect x="' + q.x.toFixed(1) + '" y="' + q.y.toFixed(1) + '" width="' + q.w.toFixed(1) + '" height="' + (q.h * 0.32).toFixed(1) +
        '" rx="1.2" fill="#ffffff" opacity="' + (q.o * 0.55).toFixed(2) + '"/>');
    });

    /* 树 */
    for (var tr = 0; tr < 260; tr++) {
      var tx = -10 + rnd() * 1220, ty = -10 + rnd() * 840;
      if (dist(tx, ty, CX, CY) < 218) continue;
      if (nearRoad(tx, ty, 14)) continue;
      var okTree = false;
      parks.forEach(function (q) {
        if (Math.pow((tx - q[0]) / (q[2] + 26), 2) + Math.pow((ty - q[1]) / (q[3] + 22), 2) < 1) okTree = true;
      });
      if (!okTree && rnd() > 0.16) continue;
      var rr2 = 3.4 + rnd() * 4.6;
      out.push('<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="' + rr2.toFixed(1) +
        '" fill="#' + (rnd() < .5 ? "74a95a" : "8bba6b") + '" opacity="' + (0.55 + rnd() * 0.35).toFixed(2) + '"/>');
    }

    /* 道路：干线各自横穿 + 每馆一条支路挂到最近的干线上。
       没有一条路是以证据厅为圆心画出来的 —— 城市是先有街，馆才沿着街长。 */
    function drawRoad(d) {
      out.push('<path d="' + d + '" fill="none" stroke="#eef4e6" stroke-width="11.5" opacity=".9" stroke-linecap="round" stroke-linejoin="round"/>');
      out.push('<path d="' + d + '" fill="none" stroke="#ffffff" stroke-width="8.4" stroke-linecap="round" stroke-linejoin="round"/>');
    }

    ARTERIALS.forEach(function (ap) { drawRoad(smoothPath(ap)); });

    var spurRnd = rng(4242);
    Object.keys(POS).forEach(function (hid) {
      var pp = POS[hid];
      var gate = 74 * SCALE[hid];
      var near = null, nearIdx = -1;
      for (var i = 0; i < ARTERIALS.length; i++) {
        var n = nearestOnPath(ARTERIALS[i], pp[0], pp[1]);
        if (n && (!near || n.d < near.d)) { near = n; nearIdx = i; }
      }
      if (!near) return;
      var dx = near.x - pp[0], dy = near.y - pp[1];
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      var sx2 = pp[0] + dx / L * gate, sy2 = pp[1] + dy / L * gate;
      /* 支路不直连，中段偏一点，像巷子拐了个弯 */
      var mx2 = (sx2 + near.x) / 2 + (spurRnd() - 0.5) * 34;
      var my2 = (sy2 + near.y) / 2 + (spurRnd() - 0.5) * 34;
      drawRoad("M" + sx2.toFixed(1) + " " + sy2.toFixed(1) +
        " Q" + mx2.toFixed(1) + " " + my2.toFixed(1) + " " + near.x.toFixed(1) + " " + near.y.toFixed(1));
    });

    /* 广场与钟楼之间的两条步行街：短、只连局部，不做成环 */
    drawRoad("M" + (CX - 96) + " " + (CY - 74) + " Q" + (CX - 150) + " " + (CY - 8) + " " + (CX - 118) + " " + (CY + 62));
    drawRoad("M" + (CX + 84) + " " + (CY + 46) + " Q" + (CX + 132) + " " + (CY + 96) + " " + (CX + 168) + " " + (CY + 148));

    /* 建议参观顺序：不是一条顺滑的大弧，而是沿街绕行的折线。
       每段插两个偏移点，走起来会拐弯、会绕开街区。
       中间点还要被推离广场与馆前场地 —— 动线不穿建筑。 */
    var order = ["H1", "H2", "H3", "H4", "H5", "H6"];
    var routeRnd = rng(90210);
    function pushOut(p) {
      var dx = p[0] - CX, dy = p[1] - CY;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var lim = 182;
      if (d < lim) { p[0] = CX + dx / d * lim; p[1] = CY + dy / d * lim; }
      for (var hid in POS) {
        var q = POS[hid], rr = 82 * (SCALE[hid] || 1);
        var ex = p[0] - q[0], ey = p[1] - q[1];
        var ed = Math.sqrt(ex * ex + ey * ey) || 1;
        if (ed < rr) { p[0] = q[0] + ex / ed * rr; p[1] = q[1] + ey / ed * rr; }
      }
      return p;
    }
    var pts = [];
    order.forEach(function (id, i) {
      var b = POS[id];
      if (i === 0) { pts.push([b[0], b[1]]); return; }
      var a2 = POS[order[i - 1]];
      pts.push(pushOut([a2[0] + (b[0] - a2[0]) * 0.34 + (routeRnd() - 0.5) * 56,
                        a2[1] + (b[1] - a2[1]) * 0.34 + (routeRnd() - 0.5) * 56]));
      pts.push(pushOut([a2[0] + (b[0] - a2[0]) * 0.69 + (routeRnd() - 0.5) * 50,
                        a2[1] + (b[1] - a2[1]) * 0.69 + (routeRnd() - 0.5) * 50]));
      pts.push([b[0], b[1]]);
    });

    /* 逐段成线：近段是步行虚线，远段改点线（示意乘车），末段带箭头 */
    LEGS.length = 0;
    for (var li = 1; li < order.length; li++) {
      var seg = [pts[(li - 1) * 3], pts[(li - 1) * 3 + 1], pts[(li - 1) * 3 + 2], pts[li * 3]];
      var raw = dist(POS[order[li - 1]][0], POS[order[li - 1]][1], POS[order[li]][0], POS[order[li]][1]);
      var ride = raw > 520;
      LEGS.push({ from: order[li - 1], to: order[li], m: Math.round(raw * METER / 1000 * 10) / 10,
                  min: Math.max(2, Math.round(raw * METER / (ride ? 430 : 76))), ride: ride });
      out.push('<path class="route" d="' + smoothPath(seg) + '" fill="none" stroke="' + (ride ? "#b8904e" : "#cf7d22") +
        '" stroke-width="2.2" stroke-dasharray="' + (ride ? "1.6 9" : "8 7") + '" stroke-linecap="round" opacity=".80"' +
        (li === order.length - 1 ? ' marker-end="url(#arr)"' : '') + '/>');
    }

    /* 起点与终点标记：路线是开放的，首尾要看得出来 */
    var p0 = POS[order[0]], p5 = POS[order[5]];
    out.push('<g transform="translate(' + p0[0] + ',' + (p0[1] - 84) + ')">' +
      '<rect x="-20" y="-10" width="40" height="20" rx="10" fill="#cf7d22"/>' +
      '<text x="0" y="4" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff" font-family="sans-serif">起点</text></g>');
    out.push('<g transform="translate(' + p5[0] + ',' + (p5[1] + 74) + ')">' +
      '<rect x="-20" y="-10" width="40" height="20" rx="10" fill="#8a6a2a"/>' +
      '<text x="0" y="4" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff" font-family="sans-serif">终点</text></g>');

    /* 城市设施 */
    CIVIC.forEach(function (c) {
      out.push('<g class="civic" data-c="' + c.id + '" transform="translate(' + c.x + ',' + c.y + ')" style="cursor:pointer">');
      out.push('<ellipse cx="' + (sv.x * c.r * 1.6).toFixed(1) + '" cy="' + (sv.y * c.r * 1.6).toFixed(1) +
        '" rx="' + (c.r * 1.06) + '" ry="' + (c.r * 0.86) + '" fill="#4d6b58" opacity=".15"/>');
      out.push(civicShape(c, c.id === "evidence" ? "#0e93b4" : "#5c8497"));
      out.push('</g>');
    });

    /* 六馆：占地尺度、场地朝向、编号位置各不相同 */
    E.HALLS.forEach(function (h) {
      var pp = POS[h.id];
      if (!pp) return;
      var ready = h.status === "instrument";
      var x = pp[0], y = pp[1];
      var k = SCALE[h.id] || 1;
      var st = SITE[h.id] || [60, 54, 0];
      var ly = st[1] + 32;
      var bx = st[0] * 0.80 + 13, by = -st[1] * 0.82;
      out.push('<g class="hall" data-h="' + h.id + '" transform="translate(' + x + ',' + y + ')" style="cursor:pointer">');
      out.push('<ellipse cx="' + (sv.x * 150).toFixed(1) + '" cy="' + (sv.y * 150).toFixed(1) +
        '" rx="' + (st[0] * 0.98).toFixed(1) + '" ry="' + (st[1] * 0.70).toFixed(1) +
        '" fill="#3d5c48" opacity="' + (ready ? .20 : .11) + '" filter="url(#fSoft)"/>');
      if (ready) out.push('<circle r="' + (72 * k).toFixed(1) + '" fill="' + hexA(h.accent, .30) + '" filter="url(#fGlow)"/>');
      out.push('<ellipse rx="' + st[0] + '" ry="' + st[1] + '" transform="rotate(' + st[2] + ')" fill="#ffffff" opacity="' + (ready ? .84 : .52) + '"/>');
      out.push('<g transform="rotate(' + st[2] + ') scale(' + k + ')">' + hallShape(h.id, h.accent, ready) + '</g>');

      out.push('<g transform="translate(' + bx.toFixed(1) + ',' + by.toFixed(1) + ')">' +
        '<rect x="-17" y="-11" width="34" height="22" rx="5" fill="' + (ready ? h.accent : "#8fa3b0") + '"/>' +
        '<text x="0" y="4.6" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="monospace">' + h.no + '</text></g>');

      if (!ready) {
        out.push('<g transform="translate(' + (-bx).toFixed(1) + ',' + by.toFixed(1) + ')">' +
          '<rect x="-19" y="-10" width="38" height="20" rx="5" fill="#8195a2"/>' +
          '<text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff" font-family="sans-serif">筹建</text></g>');
      }
      out.push('<text x="0" y="' + ly + '" text-anchor="middle" font-size="14.5" font-weight="800" fill="#0f2a40" letter-spacing="1.4" stroke="#ffffff" stroke-width="4.5" paint-order="stroke">' + h.name + '</text>');
      out.push('<text x="0" y="' + (ly + 18) + '" text-anchor="middle" font-size="9" font-family="monospace" fill="' + hexA(h.accent, .95) + '" letter-spacing="1" stroke="#ffffff" stroke-width="3.5" paint-order="stroke">' + (ready ? "仪器可用" : "筹建中") + '</text>');
      out.push('</g>');
    });

    /* 证据厅文字 */
    out.push('<text x="' + CX + '" y="' + (CY - 3) + '" text-anchor="middle" font-size="12.6" font-weight="800" fill="#0f2a40" letter-spacing="1">公共证据厅</text>');
    out.push('<text x="' + CX + '" y="' + (CY + 14) + '" text-anchor="middle" font-size="8" font-family="monospace" fill="#0e93b4" letter-spacing="1.4">EVIDENCE HALL</text>');
    out.push('<text x="' + CX + '" y="' + (CY + 30) + '" text-anchor="middle" font-size="8" font-family="monospace" fill="#587c92">城市服务 · 非第七馆</text>');

    /* 设施标签 */
    CIVIC.forEach(function (c) {
      if (c.kind === "core") return;
      out.push('<text x="' + c.x + '" y="' + (c.y + c.r + 16) + '" text-anchor="middle" font-size="10.5" font-weight="600" fill="#36536a" stroke="#ffffff" stroke-width="3.4" paint-order="stroke">' + c.name + '</text>');
    });

    svg.innerHTML = out.join("");
    bindHover();
  }

  /* ---------------- 悬停与点击 ---------------- */
  function bindHover() {
    var card = tip;
    Array.prototype.forEach.call(svg.querySelectorAll(".hall"), function (g) {
      var h = E.HALL_BY_ID[g.getAttribute("data-h")];
      if (!h) return;
      var ready = h.status === "instrument";
      g.addEventListener("mouseenter", function () {
        card.className = "tipcard on " + (ready ? "ready" : "build");
        card.innerHTML = '<div class="tc-no">' + h.no + ' / ' + (h.legacy || "") + '</div>' +
          '<div class="tc-nm">' + h.name + '</div>' +
          '<div class="tc-q">' + h.question + '</div>' +
          '<div class="tc-st">' + (ready ? "仪器可用 · 点击进入" : "筹建中 · 点击看缺什么") + '</div>' +
          (h.annex ? '<div class="tc-annex">精英挑战 · ' + h.annexName + '</div>' : '');
      });
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
      g.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (h.href) location.href = h.href;
        else openBuild(h);
      });
    });

    Array.prototype.forEach.call(svg.querySelectorAll(".civic"), function (g) {
      var cid = g.getAttribute("data-c"), c = null;
      for (var i = 0; i < CIVIC.length; i++) if (CIVIC[i].id === cid) c = CIVIC[i];
      if (!c) return;
      g.addEventListener("mouseenter", function () {
        card.className = "tipcard on ready";
        card.innerHTML = '<div class="tc-no">城市设施</div>' +
          '<div class="tc-nm">' + c.name + '</div>' +
          '<div class="tc-q">' + c.desc + '</div>' +
          '<div class="tc-st">' + (c.href ? "点击进入" : "地图标注 · 暂不开放") + '</div>';
      });
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
      if (c.href) g.addEventListener("click", function (ev) { ev.stopPropagation(); location.href = c.href; });
    });
  }

  function moveTip(e) {
    var x = e.clientX + 16, y = e.clientY + 16;
    var w = tip.offsetWidth || 210, hh = tip.offsetHeight || 100;
    if (x + w > window.innerWidth - 12) x = e.clientX - w - 16;
    if (y + hh > window.innerHeight - 12) y = e.clientY - hh - 16;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { tip.className = "tipcard"; }

  function openBuild(h) {
    var old = document.querySelector(".bmodal");
    if (old) old.remove();
    var d = document.createElement("div");
    d.className = "bmodal";
    d.innerHTML = '<div class="bm-card">' +
      '<h3>' + h.no + '　' + h.name + '</h3>' +
      '<div class="bm-q">' + h.question + '</div>' +
      '<dl class="bm-row">' +
        '<dt>旗舰</dt><dd>' + h.flagship + '</dd>' +
        '<dt>证据</dt><dd>' + (h.evidence || "待补") + '</dd>' +
        '<dt>状态</dt><dd>筹建中。地图上能看到位置，但没有假按钮。</dd>' +
      '</dl>' +
      '<div class="bm-cannot">它现在还不能回答：' + (h.cannot || "尚未定义") + '</div>' +
      '<button class="bm-close">知道了</button></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.className === "bm-close") d.remove();
    });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { d.remove(); document.removeEventListener("keydown", esc); }
    });
  }

  /* ---------------- 缩放与平移 ---------------- */
  var zoom = 1, panX = 0, panY = 0, dragging = false, lastX = 0, lastY = 0;

  function applyView() {
    var w = 1200 / zoom, h = 820 / zoom;
    var x = (1200 - w) / 2 + panX;
    var y = (820 - h) / 2 + panY;
    svg.setAttribute("viewBox", x.toFixed(1) + " " + y.toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1));
  }
  function clampPan() {
    var max = (1200 - 1200 / zoom) / 2 + 150;
    panX = Math.max(-max, Math.min(max, panX));
    panY = Math.max(-max * 0.72, Math.min(max * 0.72, panY));
  }

  function initPanZoom() {
    var main = $("mapMain");
    $("zIn").addEventListener("click", function () { zoom = Math.min(3, zoom * 1.28); clampPan(); applyView(); });
    $("zOut").addEventListener("click", function () { zoom = Math.max(0.62, zoom / 1.28); clampPan(); applyView(); });
    $("zReset").addEventListener("click", function () { zoom = 1; panX = 0; panY = 0; applyView(); });

    main.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoom = Math.max(0.62, Math.min(3, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      clampPan(); applyView();
    }, { passive: false });

    main.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".zoomctl")) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      main.classList.add("grabbing");
    });
    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      panX -= (e.clientX - lastX) / (main.clientWidth / (1200 / zoom));
      panY -= (e.clientY - lastY) / (main.clientHeight / (820 / zoom));
      lastX = e.clientX; lastY = e.clientY;
      clampPan(); applyView();
    });
    window.addEventListener("pointerup", function () {
      if (dragging) hideTip();   // 拖完地图不该留一张悬停卡在屏幕上
      dragging = false;
      main.classList.remove("grabbing");
    });
  }

  /* ---------------- 左栏 ---------------- */
  function renderSide() {
    var box = $("hallItems");
    box.innerHTML = E.HALLS.map(function (h) {
      var ready = h.status === "instrument";
      return '<button class="hitem ' + (ready ? "ready" : "build") + '" data-h="' + h.id + '" style="--ac:' + h.accent + '">' +
        '<div class="hi-no">' + h.no + ' / ' + (h.legacy || "") + '</div>' +
        '<div class="hi-nm">' + h.name + '</div>' +
        '<div class="hi-q">' + h.question + '</div>' +
        '<span class="hi-st">' + (ready ? "仪器可用 · 可进入" : "筹建中") + '</span>' +
        (h.annex ? '<a class="hi-annex" href="' + h.annex + '" data-annex="1">精英挑战 · ' +
          h.annexName + ' →</a>' : "") + '</button>';
    }).join("");

    Array.prototype.forEach.call(box.querySelectorAll(".hitem"), function (b) {
      b.addEventListener("click", function (ev) {
        /* 精英挑战是馆内的二级入口：点它直接进挑战页，不要先跳馆主页 */
        var a = ev.target.closest("[data-annex]");
        if (a) { ev.stopPropagation(); location.href = a.getAttribute("href"); return; }
        var h = E.HALL_BY_ID[b.getAttribute("data-h")];
        if (!h) return;
        if (h.href) location.href = h.href;
        else openBuild(h);
      });
      b.addEventListener("mouseenter", function () {
        var g = svg.querySelector('.hall[data-h="' + b.getAttribute("data-h") + '"]');
        if (g) g.style.filter = "drop-shadow(0 0 10px rgba(14,147,180,.9))";
      });
      b.addEventListener("mouseleave", function () {
        var g = svg.querySelector('.hall[data-h="' + b.getAttribute("data-h") + '"]');
        if (g) g.style.filter = "";
      });
    });

    /* 行程表：把图上距离换算成真实路程与时长，跨城段标「乘车」 */
    var rl = $("routeLegs");
    if (rl) {
      rl.innerHTML = LEGS.map(function (g) {
        var A = E.HALL_BY_ID[g.from], B = E.HALL_BY_ID[g.to];
        return '<div class="legrow' + (g.ride ? " ride" : "") + '">' +
          '<span class="lg-dot" style="--ac:' + (A ? A.accent : "#999") + '"></span>' +
          '<span class="lg-nm">' + (A ? A.no : "?") + ' → ' + (B ? B.no : "?") + '</span>' +
          '<span class="lg-km">' + g.m.toFixed(1) + ' km</span>' +
          '<span class="lg-tm">' + (g.ride ? "乘车 " : "步行 ") + g.min + ' 分</span></div>';
      }).join("");
    }

    var civ = $("civicItems");
    civ.innerHTML = CIVIC.filter(function (c) { return c.kind !== "core"; }).map(function (c) {
      return '<button class="hitem ready" data-c="' + c.id + '" style="--ac:#5c8497">' +
        '<div class="hi-no">设施</div><div class="hi-nm">' + c.name + '</div>' +
        '<div class="hi-q">' + c.desc + '</div></button>';
    }).join("");
    Array.prototype.forEach.call(civ.querySelectorAll(".hitem"), function (b) {
      b.addEventListener("click", function () {
        var cid = b.getAttribute("data-c");
        for (var i = 0; i < CIVIC.length; i++) if (CIVIC[i].id === cid && CIVIC[i].href) location.href = CIVIC[i].href;
      });
    });
  }

  /* ---------------- 时钟 ---------------- */
  function tickClock() {
    var d = window.YCCityView ? window.YCCityView.beijingNow() : new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    $("mapClock").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
    var t = d.getHours() + d.getMinutes() / 60;
    var p = window.YCCityView ? window.YCCityView.dayPhase(t) : null;
    if (p) $("mtTitle").textContent = "六馆定位与建议路线 · " + p.name;
  }

  /* ---------------- 今日值守 ---------------- */
  var HALLPAGE = {
    H2: "h2-forensic.html", H3: "h3-metrics.html", H4: "h4-contam.html",
    H5: "h5-collapse.html", H6: "h6-budget.html"
  };
  function renderDuty() {
    var C = window.YCCast;
    var box = $("dutyStrip"), note = $("dutyNote");
    if (!C || !box) return;
    var r = C.roster();
    box.innerHTML = r.people.map(function (p) {
      var hot = p.bond >= 50 ? " hot" : "";
      return '<a class="duty-s" href="' + (HALLPAGE[p.hall] || "map.html") + '" title="去' +
        p.hall + '找他">' + C.miniBadge(p, 26) +
        '<span class="dn"><b>' + p.name + '</b><i>' + p.role + " · " + p.hall + '</i></span>' +
        '<span class="db' + hot + '">' + (p.bond > 0 ? p.bond : "—") + "</span></a>";
    }).join("");
    var hh = Math.floor(r.until / 60), mm = r.until % 60;
    var best = null;
    r.people.forEach(function (p) { if (!best || p.bond > best.bond) best = p; });
    note.innerHTML = "北京时间 <b>" + r.clock + "</b> · " + r.shift + " · 交班还有 <b>" +
      (hh > 0 ? hh + " 时 " : "") + mm + " 分</b><br>" +
      (best && best.bond > 0 ? "你与 " + best.name + "：" + best.tier + " " + best.bond + "/100"
        : "还没有人认识你。进馆会有人来搭话。");
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    svg = $("mapSvg");
    tip = $("tipCard");
    var d = window.YCCityView ? window.YCCityView.beijingNow() : new Date();
    render(d.getHours() + d.getMinutes() / 60);
    renderSide();
    renderDuty();
    setInterval(renderDuty, 30000);
    initPanZoom();
    if (window.innerWidth < 860) zoom = 1.55;
    applyView();
    tickClock();
    setInterval(tickClock, 10000);
    window.addEventListener("resize", function () { applyView(); });
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf("yc.cast") === 0) renderDuty();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* 杨城 · 时间感知城市视图  yc-cityview.js
   程序化绘制的未来城市天际线。天空色、光照强度、窗户亮灯率、太阳位置
   全部由「北京时间」连续驱动 —— 不同时刻进来看到的是不同的杨城。

   构图（参照明亮的白昼未来城市）：
     天空 0 - 0.70 ｜ 城市三层纵深 0.19 - 0.70 ｜ 前景 0.70 - 1.0
     远景塔群（淡）→ 中景塔群 → 近景塔群（实），底部被前景绿植与高架遮挡

   性能结构：
     bgFar  离屏：天空 + 星 + 日轮 + 远山
     云     每帧：在天与城之间漂移
     bgNear 离屏：三层塔群 + 穹顶 + 绿植 + 河流 + 高架
     动态层 每帧：水面波光、飞行器、航标灯

   两个离屏层只在时间片推进（约 10 秒）或尺寸变化时重绘。 */

(function (global) {
  "use strict";

  var TAU = Math.PI * 2;

  /* ---------------- 北京时间 ---------------- */
  function beijingNow() {
    var n = new Date();
    return new Date(n.getTime() + n.getTimezoneOffset() * 60000 + 8 * 3600000);
  }

  /* ---------------- 一天的光线关键帧 ---------------- */
  var KEYS = [
    { h: 0.0,  name: "深夜", top: [222, 58, 9],  mid: [221, 50, 15], hor: [214, 40, 26], sun: [210, 66, 88], amb: 0.10, lamp: 1.00 },
    { h: 4.4,  name: "凌晨", top: [220, 56, 12], mid: [218, 46, 20], hor: [212, 38, 32], sun: [212, 58, 82], amb: 0.16, lamp: 0.94 },
    { h: 5.6,  name: "破晓", top: [228, 42, 26], mid: [272, 28, 42], hor: [332, 32, 56], sun: [22, 88, 74],  amb: 0.36, lamp: 0.76 },
    { h: 6.5,  name: "日出", top: [212, 44, 50], mid: [258, 28, 62], hor: [26, 76, 72],  sun: [40, 100, 88], amb: 0.60, lamp: 0.48 },
    { h: 7.8,  name: "清晨", top: [205, 58, 62], mid: [199, 50, 80], hor: [196, 46, 92], sun: [48, 100, 96], amb: 0.88, lamp: 0.18 },
    { h: 10.5, name: "上午", top: [203, 70, 54], mid: [197, 60, 80], hor: [194, 50, 94], sun: [50, 100, 98], amb: 0.99, lamp: 0.06 },
    { h: 13.0, name: "正午", top: [202, 74, 51], mid: [196, 62, 82], hor: [193, 48, 96], sun: [52, 100, 99], amb: 1.08, lamp: 0.02 },
    { h: 15.6, name: "午后", top: [204, 60, 58], mid: [198, 50, 82], hor: [197, 42, 94], sun: [46, 100, 97], amb: 0.95, lamp: 0.10 },
    { h: 17.6, name: "黄昏", top: [226, 42, 50], mid: [316, 24, 66], hor: [24, 80, 70],  sun: [34, 100, 84], amb: 0.66, lamp: 0.42 },
    { h: 18.9, name: "暮色", top: [230, 46, 28], mid: [270, 30, 42], hor: [332, 38, 54], sun: [16, 86, 72],  amb: 0.36, lamp: 0.78 },
    { h: 20.3, name: "入夜", top: [223, 56, 11], mid: [220, 46, 18], hor: [214, 40, 32], sun: [210, 64, 86], amb: 0.16, lamp: 0.95 },
    { h: 24.0, name: "深夜", top: [222, 58, 9],  mid: [221, 50, 15], hor: [214, 40, 26], sun: [210, 66, 88], amb: 0.10, lamp: 1.00 }
  ];

  function dayPhase(t) {
    t = ((t % 24) + 24) % 24;
    var i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= t) i++;
    var a = KEYS[i], b = KEYS[i + 1];
    var span = b.h - a.h || 1;
    var p = Math.max(0, Math.min(1, (t - a.h) / span));
    return {
      name: p < 0.5 ? a.name : b.name,
      top: mix3(a.top, b.top, p),
      mid: mix3(a.mid, b.mid, p),
      hor: mix3(a.hor, b.hor, p),
      sun: mix3(a.sun, b.sun, p),
      amb: a.amb + (b.amb - a.amb) * p,
      lamp: a.lamp + (b.lamp - a.lamp) * p,
      t: t
    };
  }

  function mix3(a, b, p) {
    return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
  }
  function hsla(c, a) {
    return "hsla(" + (c[0] | 0) + "," + (c[1] | 0) + "%," + (c[2] | 0) + "%," + (a === undefined ? 1 : a) + ")";
  }
  function shift(c, dh, ds, dl) {
    return [c[0] + (dh || 0), Math.max(0, Math.min(100, c[1] + (ds || 0))), Math.max(0, Math.min(100, c[2] + (dl || 0)))];
  }

  /* ---------------- 太阳 / 月亮 ---------------- */
  function sunPos(t) {
    var rise = 6.0, set = 18.7;
    if (t >= rise && t <= set) {
      var p = (t - rise) / (set - rise);
      return { up: true, x: 0.05 + 0.90 * p, y: 0.665 - 0.585 * Math.sin(Math.PI * p), p: p };
    }
    var nt = t < rise ? t + 24 : t;
    var p2 = Math.max(0, Math.min(1, (nt - set) / (24 - set + rise)));
    return { up: false, x: 0.95 - 0.90 * p2, y: 0.64 - 0.46 * Math.sin(Math.PI * p2), p: p2 };
  }

  /* ---------------- 确定性随机 ---------------- */
  function seedRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------------- 场景 ---------------- */
  var HOR = 0.685;
  var scene = null;

  function makeTower(rnd, x, w, h, baseY, layer) {
    var t = rnd();
    var top = t < 0.26 ? "spike" : t < 0.44 ? "dome" : t < 0.66 ? "slant" : "flat";
    return {
      x: x, w: w, h: h, baseY: baseY, layer: layer, top: top,
      hue: rnd() < 0.28 ? 205 + rnd() * 12 : 196 + rnd() * 18,
      sat: rnd() < 0.28 ? 6 + rnd() * 8 : 30 + rnd() * 22,
      rows: Math.max(8, Math.round(h * 150)),
      cols: Math.max(2, Math.round(w * 300)),
      seed: (rnd() * 1e6) | 0,
      mast: rnd() < 0.5
    };
  }

  function makeScene() {
    var rnd = seedRng(20261029);
    var s = { far: [], mid: [], near: [], domes: [], rails: [], trees: [], stars: [], clouds: [], river: null };

    for (var i = 0; i < 170; i++) {
      s.stars.push({ x: rnd(), y: rnd() * HOR * 0.86, r: 1.3 + rnd() * 2.0, ph: rnd() * TAU });
    }

    /* 远景：矮而密，低对比 */
    for (var f = 0; f < 118; f++) {
      var fx = -0.03 + rnd() * 1.06;
      var fw = 0.004 + rnd() * 0.010;
      var fh = 0.022 + rnd() * 0.135 * (0.55 + 0.45 * Math.cos((fx - 0.5) * 2.1));
      s.far.push(makeTower(rnd, fx, fw, fh, HOR - 0.008, 0));
    }

    /* 中景：主体密度 */
    for (var m = 0; m < 56; m++) {
      var mx = -0.02 + rnd() * 1.04;
      var mw = 0.009 + rnd() * 0.019;
      var mh = 0.075 + rnd() * 0.255 * (0.60 + 0.40 * Math.cos((mx - 0.5) * 1.7));
      s.mid.push(makeTower(rnd, mx, mw, mh, HOR + 0.034, 1));
    }

    /* 近景：少而高，细节最足，底部被前景遮挡 */
    var nearXs = [0.040, 0.092, 0.150, 0.222, 0.290, 0.348, 0.402, 0.452, 0.500,
                  0.552, 0.606, 0.668, 0.716, 0.778, 0.838, 0.898, 0.948, 0.988];
    nearXs.forEach(function (nx, k) {
      var nw = 0.026 + rnd() * 0.036;
      var nh = 0.21 + rnd() * 0.37;
      if (k === 8) nh = 0.60;       // 天际线主角
      if (k === 13) nh = 0.53;
      s.near.push(makeTower(rnd, nx, nw, nh, HOR + 0.112, 2));
    });
    s.near.sort(function (a, b) { return a.h - b.h; });

    /* 玻璃穹顶（前景） */
    [[0.030, 0.795, 0.135, 0.088], [0.168, 0.828, 0.092, 0.058],
     [0.885, 0.788, 0.118, 0.078], [0.795, 0.842, 0.070, 0.048]].forEach(function (d) {
      s.domes.push({ x: d[0], y: d[1], rx: d[2], ry: d[3] });
    });

    /* 高架轨道：三条不同高度 */
    s.rails = [
      { p: [[-0.08, 0.792], [0.20, 0.735], [0.52, 0.718], [0.84, 0.752], [1.08, 0.815]], w: 0.017, craft: 3 },
      { p: [[0.02, 0.960], [0.30, 0.862], [0.62, 0.808], [0.92, 0.762], [1.06, 0.744]], w: 0.013, craft: 2 },
      { p: [[0.52, 1.040], [0.70, 0.930], [0.86, 0.862], [1.06, 0.828]], w: 0.009, craft: 1 }
    ];

    /* 前景框架建筑：左右各一座半出画，撑出纵深 */
    s.front = [
      { x: -0.035, w: 0.105, h: 0.60, hue: 202, sat: 26 },
      { x: 0.955, w: 0.115, h: 0.55, hue: 198, sat: 22 }
    ];

    /* 河流：底部中央，近宽远窄 */
    s.river = { cx: 0.455, topW: 0.034, botW: 0.34, topY: 0.716, botY: 1.040 };

    /* 绿植：河岸两侧（前景的主要密度来源） */
    var zones = [
      { x0: 0.00, x1: 0.40, y0: 0.722, y1: 1.020, n: 74 },
      { x0: 0.53, x1: 1.00, y0: 0.722, y1: 1.020, n: 68 },
      { x0: 0.00, x1: 1.00, y0: 0.688, y1: 0.730, n: 30 }
    ];
    zones.forEach(function (z) {
      for (var k = 0; k < z.n; k++) {
        var tx = z.x0 + rnd() * (z.x1 - z.x0);
        var ty = z.y0 + rnd() * (z.y1 - z.y0);
        var rk = Math.max(0, Math.min(1, (ty - s.river.topY) / (s.river.botY - s.river.topY)));
        var half = s.river.topW + (s.river.botW - s.river.topW) * rk + 0.012;
        if (ty > s.river.topY - 0.02 && Math.abs(tx - s.river.cx) < half) continue;
        s.trees.push({ x: tx, y: ty, r: 0.010 + rnd() * 0.024, d: rnd(), g: 0.5 + rnd() * 0.5 });
      }
    });
    s.trees.sort(function (a, b) { return a.y - b.y; });

    for (var c2 = 0; c2 < 10; c2++) {
      s.clouds.push({
        x: rnd(), y: 0.02 + rnd() * 0.30,
        w: 0.11 + rnd() * 0.20, h: 0.030 + rnd() * 0.042,
        sp: 0.0014 + rnd() * 0.0036, a: 0.52 + rnd() * 0.38, layer: rnd()
      });
    }
    s.clouds.sort(function (a, b) { return a.layer - b.layer; });

    return s;
  }

  /* ---------------- 天空 ---------------- */
  function paintFar(g, W, H, p) {
    var horY = HOR * H;
    var sky = g.createLinearGradient(0, 0, 0, horY);
    sky.addColorStop(0, hsla(p.top));
    sky.addColorStop(0.55, hsla(p.mid));
    sky.addColorStop(1, hsla(p.hor));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, horY + 2);

    // 地平线附近的暖光带（日出日落时明显）
    var glowA = Math.max(0, 1 - Math.abs(p.t - 6.4) / 1.6) + Math.max(0, 1 - Math.abs(p.t - 18.2) / 1.8);
    if (glowA > 0.02) {
      var hg = g.createLinearGradient(0, horY - H * 0.20, 0, horY);
      hg.addColorStop(0, hsla(p.sun, 0));
      hg.addColorStop(1, hsla(p.sun, Math.min(0.55, glowA * 0.5)));
      g.fillStyle = hg;
      g.fillRect(0, horY - H * 0.20, W, H * 0.20);
    }

    // 星
    var starA = Math.max(0, 1 - p.amb * 2.6);
    if (starA > 0.02) {
      for (var i = 0; i < scene.stars.length; i++) {
        var st = scene.stars[i];
        g.globalAlpha = starA * (0.5 + 0.5 * Math.sin(st.ph)) * 0.92;
        g.fillStyle = "#e8f2ff";
        g.beginPath();
        g.arc(st.x * W, st.y * H, st.r * (W / 1440), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // 日 / 月
    var sp = sunPos(p.t);
    var sx = sp.x * W, sy = sp.y * H;
    var rad = W * 0.026;
    var glow = g.createRadialGradient(sx, sy, 0, sx, sy, rad * 8);
    glow.addColorStop(0, hsla(p.sun, 0.60));
    glow.addColorStop(0.18, hsla(p.sun, 0.24));
    glow.addColorStop(1, hsla(p.sun, 0));
    g.fillStyle = glow;
    g.beginPath(); g.arc(sx, sy, rad * 8, 0, TAU); g.fill();
    g.fillStyle = hsla(p.sun, 0.97);
    g.beginPath(); g.arc(sx, sy, rad * (sp.up ? 1 : 0.70), 0, TAU); g.fill();

    // 远山
    function ridge(baseY, amp, seed, alpha, dl) {
      var r = seedRng(seed);
      g.beginPath();
      g.moveTo(-10, baseY + 60);
      var y = baseY;
      for (var x = -10; x <= W + 10; x += W / 30) {
        y = baseY - Math.sin(x / W * 6.5 + seed) * amp * (0.35 + r() * 0.65);
        g.lineTo(x, y);
      }
      g.lineTo(W + 10, baseY + 60);
      g.closePath();
      g.fillStyle = hsla(shift(p.hor, 8, -8, -4 + dl), alpha);
      g.fill();
    }
    ridge(horY - H * 0.010, H * 0.032, 7, 0.48, 8);
    ridge(horY - H * 0.002, H * 0.020, 19, 0.62, 3);
  }

  /* ---------------- 云 ---------------- */
  function drawClouds(g, W, H, p, ms) {
    var lit = shift(p.mid, 0, -8, 15 + p.amb * 13);
    var dark = shift(p.mid, 3, -5, -4 + p.amb * 3);
    for (var i = 0; i < scene.clouds.length; i++) {
      var c = scene.clouds[i];
      var x = ((c.x + ms * c.sp * 0.001) % 1.34) * W - W * 0.17;
      var y = c.y * H;
      var w = c.w * W, h = c.h * H;
      var a = c.a * (0.50 + p.amb * 0.70);
      if (a <= 0.015) continue;
      g.globalAlpha = a * 0.50;
      g.fillStyle = hsla(dark);
      blob(g, x, y + h * 0.22, w, h);
      g.globalAlpha = a;
      g.fillStyle = hsla(lit);
      blob(g, x, y - h * 0.10, w * 0.94, h * 0.80);
    }
    g.globalAlpha = 1;
  }
  function blob(g, cx, cy, w, h) {
    g.beginPath();
    g.ellipse(cx, cy, w * 0.50, h * 0.50, 0, 0, TAU);
    g.ellipse(cx - w * 0.26, cy + h * 0.16, w * 0.30, h * 0.42, 0, 0, TAU);
    g.ellipse(cx + w * 0.27, cy + h * 0.14, w * 0.32, h * 0.40, 0, 0, TAU);
    g.ellipse(cx + w * 0.01, cy - h * 0.20, w * 0.34, h * 0.44, 0, 0, TAU);
    g.fill();
  }

  /* ---------------- 城市 ---------------- */
  function paintNear(g, W, H, p) {
    var horY = HOR * H;
    var baseL = 13 + 33 * p.amb;

    /* 地面：地平线往下压暗 */
    var gl = 22 + 30 * p.amb;
    var grd = g.createLinearGradient(0, horY - H * 0.02, 0, H);
    grd.addColorStop(0, hsla([190, 14, gl + 12]));
    grd.addColorStop(0.20, hsla([178, 17, gl + 8]));
    grd.addColorStop(1, hsla([164, 20, gl - 8]));
    g.fillStyle = grd;
    g.fillRect(0, horY - H * 0.02, W, H - horY + H * 0.02);

    /* 远景 */
    var farCol = mix3(p.hor, [205, 20, 40], 0.62);
    for (var f = 0; f < scene.far.length; f++) {
      var b = scene.far[f];
      var bx = b.x * W, bw = Math.max(1.2, b.w * W), bh = b.h * H;
      var by = b.baseY * H;
      g.globalAlpha = 0.34 + (b.h / 0.16) * 0.26;
      g.fillStyle = hsla(shift(farCol, 0, 0, -6 - b.h * 40));
      g.fillRect(bx, by - bh, bw, bh + 2);
      if (b.top === "spike" && b.h > 0.09) {
        g.fillRect(bx + bw * 0.44, by - bh - H * 0.010, Math.max(1, bw * 0.14), H * 0.010);
      }
    }
    g.globalAlpha = 1;

    /* 中景 */
    for (var m = 0; m < scene.mid.length; m++) {
      drawTower(g, scene.mid[m], W, H, p, baseL, 1);
    }

    /* 地平线雾霭：把地面与天空的接缝化开 */
    var hz = g.createLinearGradient(0, horY - H * 0.055, 0, horY + H * 0.055);
    hz.addColorStop(0, hsla(p.hor, 0));
    hz.addColorStop(0.48, hsla(p.hor, 0.50));
    hz.addColorStop(1, hsla(p.hor, 0));
    g.fillStyle = hz;
    g.fillRect(0, horY - H * 0.055, W, H * 0.11);

    /* 近景 */
    for (var n = 0; n < scene.near.length; n++) {
      drawTower(g, scene.near[n], W, H, p, baseL, 2);
    }

    /* 穹顶 */
    for (var d = 0; d < scene.domes.length; d++) drawDome(g, scene.domes[d], W, H, p);

    /* 河流 */
    drawRiver(g, W, H, p);

    /* 绿植 */
    for (var t = 0; t < scene.trees.length; t++) {
      var tr = scene.trees[t];
      var depth = 0.55 + (tr.y - 0.70) * 1.7;
      var rr = tr.r * W * depth;
      g.globalAlpha = 0.74 + tr.g * 0.22;
      g.fillStyle = "hsl(" + (126 + tr.d * 30) + "," + (24 + p.amb * 30) + "%," + (11 + p.amb * 25 + tr.d * 7) + "%)";
      g.beginPath();
      g.arc(tr.x * W, tr.y * H, rr * 0.86, 0, TAU);
      g.arc(tr.x * W + rr * 0.80, tr.y * H + rr * 0.30, rr * 0.56, 0, TAU);
      g.arc(tr.x * W - rr * 0.74, tr.y * H + rr * 0.26, rr * 0.52, 0, TAU);
      g.arc(tr.x * W + rr * 0.28, tr.y * H - rr * 0.48, rr * 0.48, 0, TAU);
      g.arc(tr.x * W - rr * 0.34, tr.y * H - rr * 0.36, rr * 0.44, 0, TAU);
      g.fill();
      // 顶部受光
      g.globalAlpha = 0.20 + p.amb * 0.22;
      g.fillStyle = "hsl(" + (88 + tr.d * 20) + "," + (36 + p.amb * 20) + "%," + (34 + p.amb * 26) + "%)";
      g.beginPath();
      g.arc(tr.x * W - rr * 0.18, tr.y * H - rr * 0.30, rr * 0.52, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    /* 高架 */
    for (var r = 0; r < scene.rails.length; r++) drawRail(g, scene.rails[r], W, H, p);

    /* 前景框架建筑：最前层 */
    for (var fr = 0; fr < scene.front.length; fr++) drawFront(g, scene.front[fr], W, H, p, baseL);
  }

  function drawTower(g, tw, W, H, p, baseL, layer) {
    var by = tw.baseY * H;
    var x = tw.x * W, w = Math.max(layer === 0 ? 1.4 : 2.4, tw.w * W), h = tw.h * H;
    var top = by - h;
    var hue = tw.hue, sat = tw.sat;
    var L0 = baseL + (layer === 2 ? 11 : layer === 1 ? 2 : -7);

    // 裙楼：底部加宽的一层，让塔真正落在地面上
    if (layer === 2 && tw.h > 0.24) {
      var pw = w * 1.62, ph = h * 0.085;
      var pg = g.createLinearGradient(x - (pw - w) / 2, 0, x - (pw - w) / 2 + pw, 0);
      pg.addColorStop(0, hsla([hue - 2, sat + 6, L0 + 10]));
      pg.addColorStop(1, hsla([hue + 6, sat - 8, L0 - 16]));
      g.fillStyle = pg;
      g.fillRect(x - (pw - w) / 2, by - ph, pw, ph + 2);
      g.globalAlpha = 0.30;
      g.strokeStyle = p.amb > 0.45 ? "rgba(255,255,255,.75)" : "rgba(170,200,250,.45)";
      g.lineWidth = 1;
      for (var pc = 1; pc < 6; pc++) {
        var pcx = x - (pw - w) / 2 + pw * pc / 6;
        g.beginPath(); g.moveTo(pcx, by - ph + 2); g.lineTo(pcx, by); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // 主体：左亮右暗
    var grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, hsla([hue - 5, sat + 12, L0 + 27]));
    grd.addColorStop(0.20, hsla([hue, sat + 4, L0 + 7]));
    grd.addColorStop(0.68, hsla([hue + 4, sat - 2, L0 - 8]));
    grd.addColorStop(1, hsla([hue + 8, sat - 10, L0 - 21]));
    g.fillStyle = grd;
    g.fillRect(x, top, w, h + 2);

    if (layer >= 1) {
      // 竖向幕墙
      var cols = Math.max(2, Math.min(layer === 2 ? 12 : 7, tw.cols));
      g.globalAlpha = 0.40 + p.amb * 0.32;
      g.strokeStyle = p.amb > 0.45 ? "rgba(72,122,162,.30)" : "rgba(175,205,255,.42)";
      g.lineWidth = Math.max(0.55, w * 0.010);
      for (var c = 1; c < cols; c++) {
        var cx = x + (w * c) / cols;
        g.beginPath();
        g.moveTo(cx, top + h * 0.02);
        g.lineTo(cx, by);
        g.stroke();
      }
      g.globalAlpha = 1;

      // 横向楼层
      if (w > 20) {
        g.globalAlpha = 0.34;
        g.strokeStyle = p.amb > 0.45 ? "rgba(64,112,152,.34)" : "rgba(180,210,255,.52)";
        g.lineWidth = Math.max(0.5, h * 0.0016);
        var rows = Math.min(40, tw.rows);
        for (var r2 = 1; r2 < rows; r2++) {
          var ry = top + (h * r2) / rows;
          g.beginPath(); g.moveTo(x + 1, ry); g.lineTo(x + w - 1, ry); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }

    // 硬边缘：左受光、右背光，给建筑以棱角
    g.globalAlpha = 0.55 + p.amb * 0.25;
    g.fillStyle = hsla([hue - 10, sat + 16, L0 + 38]);
    g.fillRect(x, top, Math.max(1.2, w * 0.022), h);
    g.fillStyle = hsla([hue + 12, sat - 6, L0 - 26]);
    g.fillRect(x + w - Math.max(1.2, w * 0.022), top, Math.max(1.2, w * 0.022), h);
    g.globalAlpha = 1;

    // 明确的楼层分隔（每三层一条深线）
    if (layer === 2) {
      g.globalAlpha = 0.22;
      g.strokeStyle = "rgba(38,78,118,.95)";
      g.lineWidth = Math.max(0.8, h * 0.0018);
      var rowsD = Math.min(34, tw.rows);
      for (var rd2 = 2; rd2 < rowsD; rd2 += 3) {
        var ryd = top + (h * rd2) / rowsD;
        g.beginPath(); g.moveTo(x + 1, ryd); g.lineTo(x + w - 1, ryd); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // 横向玻璃反光带：每隔几层一条亮带
    if (layer === 2 && h > H * 0.10) {
      g.globalAlpha = 0.10 + p.amb * 0.20;
      g.fillStyle = "rgba(255,255,255,.95)";
      var bandN = 7;
      for (var bi = 1; bi < bandN; bi++) {
        var byy = top + (h * bi) / bandN;
        g.fillRect(x + w * 0.06, byy, w * 0.88, Math.max(1.2, h * 0.010));
      }
      g.globalAlpha = 1;
    }

    // 左边缘受光
    g.globalAlpha = 0.38 + p.amb * 0.34;
    g.fillStyle = hsla([hue - 8, sat + 14, L0 + 34]);
    g.fillRect(x, top, Math.max(0.8, w * (layer === 2 ? 0.048 : 0.06)), h);

    // 底部雾化（大气透视，只做轻微）
    if (layer <= 2) {
      var fogA = layer === 2 ? 0.14 : layer === 1 ? 0.26 : 0.42;
      var fog = g.createLinearGradient(0, by - h * 0.12, 0, by);
      fog.addColorStop(0, hsla(p.hor, 0));
      fog.addColorStop(1, hsla(p.hor, fogA));
      g.fillStyle = fog;
      g.fillRect(x, by - h * 0.12, w, h * 0.12 + 2);
    }

    // 夜间亮窗
    var lampA = Math.max(0, p.lamp - 0.16) / 0.84;
    if (lampA > 0.03 && layer >= 1) {
      var rnd = seedRng(tw.seed);
      var lc = Math.max(2, Math.floor(tw.cols * (layer === 2 ? 1.0 : 0.9)));
      var lr = Math.max(4, Math.floor(tw.rows * 0.82));
      for (var lri = 0; lri < lr; lri++) {
        for (var lci = 0; lci < lc; lci++) {
          if (rnd() > 0.32) continue;
          var lx = x + (w * (lci + 0.5)) / lc;
          var ly = top + (h * (lri + 0.5)) / lr;
          g.globalAlpha = lampA * (0.30 + rnd() * 0.60);
          g.fillStyle = rnd() < 0.70 ? "rgba(255,222,152,.96)" : "rgba(186,224,255,.94)";
          g.fillRect(lx - w / lc * 0.20, ly - h / lr * 0.20, w / lc * 0.40, h / lr * 0.32);
        }
      }
      g.globalAlpha = 1;
    }

    // 顶部造型
    var topCol = hsla([hue, sat + 2, L0 + 14]);
    g.fillStyle = topCol;
    if (tw.top === "spike") {
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + w * 0.26, top - h * 0.030);
      g.lineTo(x + w * 0.50, top - h * 0.115);
      g.lineTo(x + w * 0.74, top - h * 0.030);
      g.lineTo(x + w, top);
      g.closePath(); g.fill();
      g.globalAlpha = 0.55 + p.amb * 0.35;
      g.fillStyle = hsla([hue - 6, sat + 16, L0 + 42]);
      g.fillRect(x + w * 0.487, top - h * 0.145, Math.max(0.9, w * 0.026), h * 0.046);
      g.globalAlpha = 1;
    } else if (tw.top === "dome") {
      g.beginPath();
      g.ellipse(x + w * 0.5, top, w * 0.50, h * 0.048, 0, Math.PI, 0);
      g.fill();
    } else if (tw.top === "slant") {
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + w * 0.70, top - h * 0.045);
      g.lineTo(x + w, top - h * 0.045);
      g.lineTo(x + w, top);
      g.closePath(); g.fill();
    } else {
      g.fillStyle = hsla([hue + 2, sat - 4, L0 - 14]);
      g.fillRect(x - w * 0.025, top - h * 0.008, w * 1.05, h * 0.009);
      if (tw.mast) {
        g.fillStyle = hsla([hue, sat + 4, L0 + 16]);
        g.fillRect(x + w * 0.478, top - h * 0.058, Math.max(0.9, w * 0.026), h * 0.058);
      }
    }
  }

  function drawFront(g, ft, W, H, p, baseL) {
    var x = ft.x * W, w = ft.w * W;
    var by = H * 1.06, h = ft.h * H, top = by - h;
    var L = baseL + 4;
    var grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, hsla([ft.hue - 4, ft.sat + 8, L + 20]));
    grd.addColorStop(0.35, hsla([ft.hue, ft.sat, L + 2]));
    grd.addColorStop(1, hsla([ft.hue + 6, ft.sat - 10, L - 24]));
    g.fillStyle = grd;
    g.fillRect(x, top, w, h);

    // 幕墙网格
    g.globalAlpha = 0.20;
    g.strokeStyle = "rgba(36,74,112,.95)";
    g.lineWidth = 1.2;
    for (var i = 1; i < 22; i++) {
      var yy = top + (h * i) / 22;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    }
    for (var j = 1; j < 7; j++) {
      var xx = x + (w * j) / 7;
      g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, by); g.stroke();
    }
    g.globalAlpha = 1;

    // 受光边
    g.globalAlpha = 0.62;
    g.fillStyle = hsla([ft.hue - 10, ft.sat + 20, L + 40]);
    g.fillRect(x, top, 2.4, h);
    g.globalAlpha = 1;

    // 顶部
    g.fillStyle = hsla([ft.hue, ft.sat, L + 10]);
    g.fillRect(x - w * 0.02, top - H * 0.012, w * 1.04, H * 0.014);

    // 夜间亮窗
    var lampF = Math.max(0, p.lamp - 0.16) / 0.84;
    if (lampF > 0.04) {
      var rf = seedRng(90210 + (ft.x > 0 ? 7 : 1));
      for (var ri = 0; ri < 20; ri++) {
        for (var ci = 0; ci < 6; ci++) {
          if (rf() > 0.40) continue;
          g.globalAlpha = lampF * (0.30 + rf() * 0.55);
          g.fillStyle = rf() < 0.72 ? "rgba(255,220,150,.95)" : "rgba(186,224,255,.92)";
          g.fillRect(x + (w * (ci + 0.5)) / 6 - w * 0.035, top + (h * (ri + 0.5)) / 20 - h * 0.011,
                     w * 0.070, h * 0.020);
        }
      }
      g.globalAlpha = 1;
    }
  }

  function drawDome(g, dm, W, H, p) {
    var cx = dm.x * W, cy = dm.y * H, rx = dm.rx * W, ry = dm.ry * H;
    var L = 26 + 42 * p.amb;
    var grd = g.createRadialGradient(cx - rx * 0.36, cy - ry * 0.95, rx * 0.05, cx, cy, rx * 1.18);
    grd.addColorStop(0, "hsla(188," + (26 + p.amb * 26) + "%," + (L + 30) + "%,.97)");
    grd.addColorStop(0.52, "hsla(197," + (24 + p.amb * 22) + "%," + (L + 4) + "%,.95)");
    grd.addColorStop(1, "hsla(210," + (22 + p.amb * 14) + "%," + (L - 12) + "%,.97)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
    g.fill();

    g.globalAlpha = 0.40;
    g.strokeStyle = "rgba(220,244,255,.62)";
    g.lineWidth = Math.max(0.6, rx * 0.010);
    for (var m = 1; m <= 3; m++) {
      g.beginPath();
      g.ellipse(cx, cy, rx * m / 4, ry * m / 4, 0, Math.PI, 0);
      g.stroke();
    }
    for (var k = 1; k <= 3; k++) {
      var t = k / 4;
      g.beginPath();
      g.ellipse(cx, cy, rx * t, ry, 0, Math.PI, 0);
      g.stroke();
    }
    g.globalAlpha = 0.62 + p.amb * 0.32;
    g.strokeStyle = "rgba(255,255,255,.92)";
    g.lineWidth = Math.max(1, rx * 0.020);
    g.beginPath();
    g.ellipse(cx, cy, rx * 0.94, ry * 0.94, 0, Math.PI * 1.08, Math.PI * 1.60);
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawRiver(g, W, H, p) {
    var r = scene.river;
    var ty = r.topY * H, by = r.botY * H;
    var tx = r.cx * W, bx = r.cx * W;
    var tw = r.topW * W, bw = r.botW * W;

    // 河岸
    g.beginPath();
    g.moveTo(tx - tw * 2.1, ty);
    g.lineTo(tx + tw * 2.1, ty);
    g.lineTo(bx + bw * 1.16, by);
    g.lineTo(bx - bw * 1.16, by);
    g.closePath();
    g.fillStyle = hsla([140, 20 + p.amb * 10, 24 + p.amb * 16], 0.88);
    g.fill();

    // 水面
    g.beginPath();
    g.moveTo(tx - tw, ty);
    g.lineTo(tx + tw, ty);
    g.lineTo(bx + bw, by);
    g.lineTo(bx - bw, by);
    g.closePath();
    var grd = g.createLinearGradient(0, ty, 0, by);
    grd.addColorStop(0, hsla([195, 76, 58 + p.amb * 16]));
    grd.addColorStop(0.40, hsla([199, 80, 48 + p.amb * 14]));
    grd.addColorStop(1, hsla([204, 72, 28 + p.amb * 16]));
    g.fillStyle = grd;
    g.fill();

    // 中央反光
    g.globalAlpha = 0.18 + p.amb * 0.28;
    var rg = g.createLinearGradient(0, ty, 0, by);
    rg.addColorStop(0, "rgba(255,255,255,.80)");
    rg.addColorStop(1, "rgba(255,255,255,.10)");
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(tx - tw * 0.24, ty);
    g.lineTo(tx + tw * 0.20, ty);
    g.lineTo(bx + bw * 0.28, by);
    g.lineTo(bx - bw * 0.14, by);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  function drawRail(g, rl, W, H, p) {
    var pts = rl.p.map(function (q) { return [q[0] * W, q[1] * H]; });
    function path() {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
    var lw = Math.max(2, rl.w * W);

    g.globalAlpha = 0.18;
    g.strokeStyle = "rgba(6,14,24,.9)";
    g.lineWidth = lw * 1.7;
    g.lineCap = "round";
    path(); g.stroke();

    g.globalAlpha = 0.96;
    g.strokeStyle = hsla([208, 14, 26 + p.amb * 34]);
    g.lineWidth = lw;
    path(); g.stroke();

    g.globalAlpha = 0.58 + p.amb * 0.34;
    g.strokeStyle = "rgba(232,246,255,.9)";
    g.lineWidth = Math.max(1, lw * 0.28);
    path(); g.stroke();

    g.globalAlpha = 0.46;
    g.strokeStyle = hsla([210, 12, 14 + p.amb * 20]);
    g.lineWidth = Math.max(1.4, lw * 0.30);
    for (var s = 1; s <= 6; s++) {
      var q = bez(pts, s / 7);
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.lineTo(q.x, q.y + H * 0.062);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.lineCap = "butt";
  }

  function bez(pts, t) {
    var n = pts.length - 1;
    var f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u };
  }

  /* ---------------- 动态层 ---------------- */
  function drawDynamics(g, W, H, p, ms) {
    var r = scene.river;

    // 水面波光
    g.globalAlpha = 0.10 + p.amb * 0.22;
    g.strokeStyle = "rgba(244,253,255,.92)";
    g.lineWidth = 1;
    for (var i = 0; i < 30; i++) {
      var yy = 0.730 + (i / 30) * 0.31;
      var spread = r.topW + (yy - r.topY) * 0.30;
      var cx = (r.cx + Math.sin(i * 1.7 + ms * 0.00032) * 0.030) * W;
      var ww = spread * W * (0.45 + 0.55 * Math.sin(i * 2.3 + ms * 0.00055));
      g.beginPath();
      g.moveTo(cx - ww, yy * H);
      g.lineTo(cx + ww, yy * H);
      g.stroke();
    }
    g.globalAlpha = 1;

    // 航标灯
    var blink = Math.max(0, p.lamp - 0.3) / 0.7;
    if (blink > 0.02) {
      for (var t = 0; t < scene.near.length; t++) {
        var tw = scene.near[t];
        if (!tw.mast) continue;
        var ph = Math.sin(ms * 0.0015 + tw.seed);
        if (ph < 0.55) continue;
        var x = tw.x * W + tw.w * W * 0.5;
        var y = (tw.baseY - tw.h) * H - H * 0.072;
        g.globalAlpha = blink * (ph - 0.55) / 0.45;
        var gg = g.createRadialGradient(x, y, 0, x, y, W * 0.011);
        gg.addColorStop(0, "rgba(255,104,104,1)");
        gg.addColorStop(1, "rgba(255,104,104,0)");
        g.fillStyle = gg;
        g.beginPath(); g.arc(x, y, W * 0.011, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }

    // 日光散射：从太阳方向压过来的暖光，让画面不发灰
    if (p.amb > 0.26) {
      var sp2 = sunPos(p.t);
      var sg = g.createRadialGradient(sp2.x * W, sp2.y * H, 0, sp2.x * W, sp2.y * H, W * 0.95);
      sg.addColorStop(0, hsla(p.sun, 0.15 * p.amb));
      sg.addColorStop(0.45, hsla(p.sun, 0.045 * p.amb));
      sg.addColorStop(1, hsla(p.sun, 0));
      g.fillStyle = sg;
      g.fillRect(0, 0, W, H);
    }

    // 轨道飞行器
    for (var r2 = 0; r2 < scene.rails.length; r2++) {
      var rl = scene.rails[r2];
      var pts = rl.p.map(function (q) { return [q[0] * W, q[1] * H]; });
      for (var k = 0; k < rl.craft; k++) {
        var speed = 0.000048 + k * 0.000019 + r2 * 0.000011;
        var tt = ((ms * speed + k * 0.34 + r2 * 0.5) % 1);
        var pos = bez(pts, r2 === 1 ? 1 - tt : tt);
        var size = 1.5 + (k % 2) * 0.8;
        var gg2 = g.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 8);
        gg2.addColorStop(0, "rgba(206,244,255,.96)");
        gg2.addColorStop(0.28, "rgba(118,208,255,.55)");
        gg2.addColorStop(1, "rgba(118,208,255,0)");
        g.fillStyle = gg2;
        g.beginPath(); g.arc(pos.x, pos.y, size * 8, 0, TAU); g.fill();
        g.fillStyle = "#f6fdff";
        g.beginPath(); g.arc(pos.x, pos.y, size, 0, TAU); g.fill();
      }
    }
  }

  /* ---------------- 引擎 ---------------- */
  var cv = null, ctx = null, far = null, farCtx = null, near = null, nearCtx = null;
  var W = 0, H = 0, DPR = 1;
  var raf = 0, lastPaintT = -99, running = false, reduce = false;
  var nowFn = beijingNow;

  function curT() {
    var d = nowFn();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3600000;
  }

  function resize() {
    if (!cv) return;
    var rect = cv.getBoundingClientRect();
    DPR = Math.min(2, global.devicePixelRatio || 1);
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(240, Math.round(rect.height));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    far = document.createElement("canvas");
    far.width = cv.width; far.height = cv.height;
    farCtx = far.getContext("2d");
    farCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

    near = document.createElement("canvas");
    near.width = cv.width; near.height = cv.height;
    nearCtx = near.getContext("2d");
    nearCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

    lastPaintT = -99;
  }

  function paintStatic(p) {
    farCtx.clearRect(0, 0, W, H);
    paintFar(farCtx, W, H, p);
    nearCtx.clearRect(0, 0, W, H);
    paintNear(nearCtx, W, H, p);
    lastPaintT = p.t;
  }

  function draw(ms) {
    var p = dayPhase(curT());
    if (Math.abs(p.t - lastPaintT) > 0.0028 || lastPaintT < -50) paintStatic(p);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(far, 0, 0, W, H);
    drawClouds(ctx, W, H, p, ms);
    ctx.drawImage(near, 0, 0, W, H);
    drawDynamics(ctx, W, H, p, ms);
    return p;
  }

  function loop(ms) {
    if (!running) return;
    draw(ms);
    if (reduce) return;
    raf = requestAnimationFrame(loop);
  }

  var api = {
    beijingNow: beijingNow,
    dayPhase: dayPhase,
    sunPos: sunPos,
    setTimeSource: function (fn) { nowFn = fn || beijingNow; lastPaintT = -99; },
    phaseAt: function (t) { return dayPhase(t); },
    start: function (canvas) {
      cv = canvas;
      ctx = cv.getContext("2d");
      reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scene = makeScene();
      resize();
      running = true;
      if (global.addEventListener) {
        global.addEventListener("resize", function () { resize(); });
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) { running = false; cancelAnimationFrame(raf); }
          else if (!reduce) { running = true; raf = requestAnimationFrame(loop); }
        });
      }
      draw(0);
      if (!reduce) raf = requestAnimationFrame(loop);
    },
    stop: function () { running = false; cancelAnimationFrame(raf); },
    probe: function () {
      var p = dayPhase(curT());
      return { name: p.name, amb: +p.amb.toFixed(3), lamp: +p.lamp.toFixed(3), t: +p.t.toFixed(4), W: W, H: H };
    }
  };

  global.YCCityView = api;
})(window);

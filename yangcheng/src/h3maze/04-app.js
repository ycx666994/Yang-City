(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };

  /* ======================================================================
     1. 基础
     ====================================================================== */
  function mulberry32(a) {
    a = (a >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ======================================================================
     1.5 声音（WebAudio 现场合成，不加载任何音频文件）
     ----------------------------------------------------------------------
     迷宫只需要两件事：心跳和一声「它进来了」。
     心跳按距离调速——近了快、远了慢。这比放一首循环 BGM 有用得多，
     因为玩家会下意识地用耳朵测距，而不是一直盯着小地图。
     ====================================================================== */
  var sound = (function () {
    var ac = null, master = null, lastBeat = 0, drone = null;
    function ensure() {
      if (ac) return ac;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.34;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    return {
      start: function () {
        if (!ensure()) return;
        if (ac.state === "suspended") ac.resume();
        if (drone) return;
        /* 低频底噪：塔本身在呼吸 */
        var o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = "sawtooth"; o.frequency.value = 41;
        f.type = "lowpass"; f.frequency.value = 120;
        g.gain.value = 0.045;
        o.connect(f); f.connect(g); g.connect(master);
        o.start();
        drone = { o: o, g: g };
      },
      beat: function (d) {
        if (!ac) return;
        var now = ac.currentTime;
        /* 距离 12 格以上不响；越近间隔越短 */
        var gap = d > 12 ? 0 : clamp(0.22 + d * 0.16, 0.34, 1.6);
        if (!gap || now - lastBeat < gap) return;
        lastBeat = now;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(74, now);
        o.frequency.exponentialRampToValueAtTime(38, now + 0.16);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(clamp(0.5 - d * 0.03, 0.06, 0.42), now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.24);
      },
      sting: function () {
        if (!ensure()) return;
        var now = ac.currentTime;
        [58, 61.7, 87.3].forEach(function (hz, i) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(hz * 4, now);
          o.frequency.exponentialRampToValueAtTime(hz, now + 1.5);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), now + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
          o.connect(g); g.connect(master);
          o.start(now); o.stop(now + 2.3);
        });
      },
      duck: function (on) { if (master) master.gain.value = on ? 0.08 : 0.34; }
    };
  })();

  /* ======================================================================
     2. 八道知识门（H3 的八个判据）
     ====================================================================== */
  /* 正确项位置打散：0/1/2 各出现，别让「永远选 B」变成通关技巧 */
  var GATES = [
    { id: "proxy", name: "代理指标",
      q: "「验证集准确率 92%」这个数字，最不能说明的是哪一项？",
      opts: ["模型在这批样本上做对了 92%", "模型在真实部署里也会做对 92%", "这批样本的构造方式决定了这个数字的上限"],
      a: 1, why: "92% 只对「这批样本」成立。把它读成部署表现，是把测量当成了预言——这正是代理指标最常见的一次越界。" },
    { id: "goodhart", name: "古德哈特定律",
      q: "当一个指标成为优化目标，最先发生的是什么？",
      opts: ["指标会失去它作为「好指标」的属性", "指标会变得更准", "指标会自然收敛到 100%"],
      a: 0, why: "指标之所以好用，是因为它还没被优化。一旦它进入目标函数，被优化的是指标本身，不是它原本代理的那件事。" },
    { id: "gaming", name: "刷分",
      q: "模型把评分脚本里的正则全部命中，但回答毫无内容。这属于哪种失效？",
      opts: ["过拟合训练集", "训练数据被污染", "指标被当作目标之后的典型失效"],
      a: 2, why: "它优化的是评分器，不是任务。评分器和任务之间的缝隙，就是刷分的空间。" },
    { id: "shift", name: "分布偏移",
      q: "测试集上 95 分，上线后掉到 61 分。最可能的原因？",
      opts: ["模型参数退化了", "测试集的分布和部署分布不同", "部署环境算力不够"],
      a: 1, why: "模型没变，世界变了。任何「离线高分」都隐含一个假设：线上和线下是同一个分布。" },
    { id: "corr", name: "相关性",
      q: "代理指标与目标的相关系数是 0.8。这意味着？",
      opts: ["它能解释一部分变化，但不能替代目标", "代理指标可以替代目标", "目标可以被忽略"],
      a: 0, why: "0.8 的相关系数意味着还有 36% 的方差没被解释。在长尾和边界上，这 36% 往往是全部。" },
    { id: "agg", name: "聚合掩盖",
      q: "总体平均分 88，但三个子群分别是 96 / 95 / 41。问题在哪？",
      opts: ["平均分算错了", "子群样本太少", "聚合掩盖了长尾子群的崩塌"],
      a: 2, why: "平均值是一个求和，它天生对少数派的灾难不敏感。一个子群掉到 41，总分只掉几个点。" },
    { id: "threshold", name: "阈值操纵",
      q: "及格线从 60 调到 55，通过率从 71% 涨到 89%。这说明？",
      opts: ["模型变好了", "通过率是阈值和分布的函数，不是能力的函数", "题目变简单了"],
      a: 1, why: "同一个模型，换一条线就换一个数字。报通过率而不报阈值和分布，等于报了一个没有分母的分数。" },
    { id: "optim", name: "可优化性",
      q: "「凡是能被优化的指标，最终都会被优化」——这句话在说什么？",
      opts: ["指标一旦进入优化回路，就不再是中立测量", "优化总是好事", "不应该优化任何指标"],
      a: 0, why: "测量和优化不能同时成立。你要么用它看世界，要么用它推世界——不能既要又要。" }
  ];

  /* ======================================================================
     3. 迷宫生成（递归回溯，保证连通且无环）
     ====================================================================== */
  var COLS = 11, ROWS = 11;            /* 单元格数；网格 = 23 × 23 */
  var W = COLS * 2 + 1, H = ROWS * 2 + 1;

  function genMaze(seed) {
    var g = new Uint8Array(W * H);
    var i;
    for (i = 0; i < g.length; i++) g[i] = 1;
    var rnd = mulberry32(seed);
    var vis = new Uint8Array(COLS * ROWS);
    var stack = [[0, 0]];
    vis[0] = 1;
    g[(1) * W + 1] = 0;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var order = [0, 1, 2, 3], k;
      for (k = 3; k > 0; k--) { var j = Math.floor(rnd() * (k + 1)); var t = order[k]; order[k] = order[j]; order[j] = t; }
      var moved = false;
      for (k = 0; k < 4; k++) {
        var d = dirs[order[k]];
        var nx = cur[0] + d[0], ny = cur[1] + d[1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (vis[ny * COLS + nx]) continue;
        vis[ny * COLS + nx] = 1;
        g[(cur[1] * 2 + 1 + d[1]) * W + (cur[0] * 2 + 1 + d[0])] = 0;
        g[(ny * 2 + 1) * W + (nx * 2 + 1)] = 0;
        stack.push([nx, ny]); moved = true; break;
      }
      if (!moved) stack.pop();
    }
    return g;
  }

  function bfs(g, sx, sy) {
    var dist = new Int32Array(W * H); dist.fill(-1);
    var prev = new Int32Array(W * H); prev.fill(-1);
    var q = [sy * W + sx]; dist[sy * W + sx] = 0;
    var head = 0;
    while (head < q.length) {
      var cur = q[head++], cx = cur % W, cy = (cur - cx) / W;
      var nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (var i = 0; i < 4; i++) {
        var nx = nb[i][0], ny = nb[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx;
        if (g[ni] !== 0 || dist[ni] >= 0) continue;
        dist[ni] = dist[cur] + 1; prev[ni] = cur; q.push(ni);
      }
    }
    return { dist: dist, prev: prev };
  }

  function buildWorld(seed) {
    var g = genMaze(seed);
    var b = bfs(g, 1, 1);
    /* 出口：最远的格子 */
    var far = -1, farI = -1;
    for (var i = 0; i < b.dist.length; i++) if (b.dist[i] > far) { far = b.dist[i]; farI = i; }
    var ex = farI % W, ey = (farI - ex) / W;
    g[farI] = 3;

    /* 解路径 */
    var path = [], p = farI;
    while (p >= 0) { var px = p % W; path.push([px, (p - px) / W]); p = b.prev[p]; }
    path.reverse();

    /* 八道门：沿路径均匀放，避开首尾各 3 格 */
    var doors = [];
    var lo = 3, hi = path.length - 4;
    for (var k = 1; k <= 8; k++) {
      var idx = Math.round(lo + (hi - lo) * (k / 9));
      idx = clamp(idx, 0, path.length - 1);
      var c = path[idx];
      if (!c) continue;
      var gi = c[1] * W + c[0];
      if (g[gi] !== 0) continue;
      g[gi] = 2;
      doors.push({ x: c[0], y: c[1], gate: k - 1, open: false });
    }

    /* 陷阱：非路径上的死胡同 */
    var onPath = {};
    path.forEach(function (c) { onPath[c[1] * W + c[0]] = 1; });
    var traps = [];
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var id = y * W + x;
        if (g[id] !== 0 || onPath[id]) continue;
        var deg = 0;
        if (g[id - 1] === 0) deg++;
        if (g[id + 1] === 0) deg++;
        if (g[id - W] === 0) deg++;
        if (g[id + W] === 0) deg++;
        if (deg === 1 && traps.length < 7) traps.push({ x: x, y: y, hit: false });
      }
    }

    return { g: g, doors: doors, traps: traps, exit: { x: ex, y: ey }, path: path };
  }

  /* ======================================================================
     4. 状态
     ====================================================================== */
  var SEED = 20261031;
  var world = null;
  var st = {
    px: 1.5, py: 1.5, ang: 0, pitch: 0,
    life: 3, frags: [], answered: {},
    tAcc: 0, running: false, done: false,
    curDoor: null, inModal: false, t: 0
  };
  var keys = {};

  /* ----------------------------------------------------------------------
     逮捕者
     ----------------------------------------------------------------------
     进塔 60 秒后入塔。速度 1.95，玩家 2.35 —— 大约是玩家的 83%。
     再慢就没有压力（玩家停下来答一道题，它追不上），再快就没有活路
     （窄走廊里无法绕开）。83% 意味着：只要不停下来磨蹭，你永远甩得掉；
     但只要你连答错两道门、或者绕两次远路，它就会贴上来。

     它走格子中心，不做连续寻路 —— 走廊宽度只有一格，贴着中心走
     永远不会卡墙，也不会出现「卡在拐角抖动」这种一眼假的追兵。
     ---------------------------------------------------------------------- */
  var HUNT = {
    at: 60,            /* 入塔时间（秒，只算塔内时间，答题冻结） */
    speed: 1.95,
    x: 1.5, y: 1.5,
    on: false,
    cell: -1,          /* 当前目标格，换格时重算 */
    tx: 1.5, ty: 1.5,  /* 目标点（下一个格心） */
    dist: 99
  };

  function resetHunt() {
    HUNT.on = false; HUNT.x = 1.5; HUNT.y = 1.5;
    HUNT.tx = 1.5; HUNT.ty = 1.5; HUNT.cell = -1; HUNT.dist = 99;
    HUNT.nullN = 0;
    var el = $("#vig"); if (el) el.className = "mzvig";
    var hd = $("#huntHud"); if (hd) hd.className = "h hunt";
    var hn = $("#huntN"); if (hn) hn.textContent = "—";
  }

  function reset(seed) {
    SEED = seed || (20261031 + Math.floor(Math.random() * 9999));
    world = buildWorld(SEED);
    st.px = 1.5; st.py = 1.5;
    /* 起始朝向必须面向唯一开口。原来写死 45°，出生点是个死胡同，
       第一帧就是一面 0.5 距离的墙铺满屏幕，看着像渲染坏了。 */
    st.ang = Math.PI / 4;
    var dirs4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var di = 0; di < 4; di++) {
      var ox = 1 + dirs4[di][0], oy = 1 + dirs4[di][1];
      if (world.g[oy * W + ox] === 0) { st.ang = Math.atan2(dirs4[di][1], dirs4[di][0]); break; }
    }
    st.life = 3; st.frags = []; st.answered = {};
    st.tAcc = 0; st.running = true; st.done = false; st.pitch = 0;
    st.curDoor = null; st.inModal = false;
    resetHunt();
    $("#endBox").innerHTML = "";
    paintHud(); paintFrags();
    syncLockHint();
    sound.duck(false);
    msg("塔门在你身后关上。八道知识门，六枚碎片，一条出口。", "");
  }

  /* ======================================================================
     5. 渲染（光线投射）
     ====================================================================== */
  var cv = $("#mzcv"), ctx = cv.getContext("2d");
  var CW = cv.width, CH = cv.height;
  var FOV = Math.PI / 3;
  var RAYS = 480;                      /* 每条光线画 2px 宽，省一半 fillRect */
  var imgData = ctx.createImageData(CW, CH);
  var buf = new Uint32Array(imgData.data.buffer);

  function shade(hex, f) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
    return (255 << 24) | (b << 16) | (g << 8) | r;   /* little-endian ABGR */
  }

  var COL_WALL = 0x33456a, COL_WALL2 = 0x22304d;
  var COL_DOOR = 0x2f7fc4, COL_EXIT = 0x2fa76f;

  function render() {
    /* 地平线随俯仰偏移。光线投射器做真俯仰要重算每条光线的三维方向，
       代价太高；把地平线整体平移是这类 2.5D 引擎的标准做法 ——
       小角度下看起来和真俯仰没有区别，而且墙高、地面网格全都跟着走。 */
    var horizon = CH * (0.5 + st.pitch);

    /* 天花板 / 地面渐变 */
    for (var y = 0; y < CH; y++) {
      var isFloor = y > horizon;
      var t = isFloor ? (y - horizon) / (CH - horizon) : (horizon - y) / horizon;
      var base = isFloor ? [13, 19, 31] : [16, 23, 38];
      var k2 = isFloor ? (1 - t * 0.55) : (1 - t * 0.45);
      var rr = Math.round(base[0] * k2 + (isFloor ? 6 : 4) * (1 - t));
      var gg = Math.round(base[1] * k2 + (isFloor ? 9 : 7) * (1 - t));
      var bb = Math.round(base[2] * k2 + (isFloor ? 14 : 12) * (1 - t));
      var c32 = (255 << 24) | (bb << 16) | (gg << 8) | rr;
      var off = y * CW;
      for (var x = 0; x < CW; x++) buf[off + x] = c32;
    }

    var cosA = Math.cos(st.ang), sinA = Math.sin(st.ang);
    var colW = Math.ceil(CW / RAYS);

    for (var i = 0; i < RAYS; i++) {
      var cam = (i / RAYS - 0.5) * 2;                  /* -1 .. 1 */
      var rx = cosA + (-sinA) * cam * Math.tan(FOV / 2);
      var ry = sinA + (cosA) * cam * Math.tan(FOV / 2);
      var mapX = Math.floor(st.px), mapY = Math.floor(st.py);
      var ddx = Math.abs(1 / (rx || 1e-9)), ddy = Math.abs(1 / (ry || 1e-9));
      var stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
      var sideX = rx < 0 ? (st.px - mapX) : (mapX + 1 - st.px);
      var sideY = ry < 0 ? (st.py - mapY) : (mapY + 1 - st.py);
      var dX = sideX * ddx, dY = sideY * ddy;
      var side = 0, tile = 1, guard = 0;
      while (guard++ < 64) {
        if (dX < dY) { dX += ddx; mapX += stepX; side = 0; }
        else { dY += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= W || mapY >= H) { tile = 1; break; }
        tile = world.g[mapY * W + mapX];
        if (tile !== 0) break;
      }
      var dist = side === 0 ? (dX - ddx) : (dY - ddy);
      if (dist < 0.02) dist = 0.02;
      /* 修正鱼眼 */
      dist = dist * Math.cos(cam * Math.tan(FOV / 2));

      var lineH = Math.min(CH * 3, (CH / dist) * 0.92);
      var y0 = Math.round(horizon - lineH / 2);
      var y1 = Math.round(horizon + lineH / 2);
      y0 = clamp(y0, 0, CH - 1); y1 = clamp(y1, 0, CH - 1);

      /* 命中点在格内的横向位置：贴着格边就压暗，形成竖向接缝。
         没有这道缝，一面墙就是一块纯色，看不出走了多远。 */
      var wallX = side === 0 ? (st.py + dist * ry) : (st.px + dist * rx);
      wallX -= Math.floor(wallX);
      var seam = (wallX < 0.035 || wallX > 0.965) ? 0.52 : 1;

      var f = clamp(1.5 - dist / 16, 0.12, 1.18);
      if (side === 1) f *= 0.72;
      f *= seam;
      /* 相邻格子交替明暗：没有这个，整面墙是一块死色，看不出是砖还是墙 */
      f *= (((mapX + mapY) & 1) ? 1.06 : 0.86);
      /* 远处再压一层雾，纵深才读得出来 */
      f *= clamp(1 - dist / 34, 0.62, 1);
      var baseCol = tile === 2 ? COL_DOOR : (tile === 3 ? COL_EXIT : (side ? COL_WALL2 : COL_WALL));
      if (tile === 2) f = clamp(f * 1.25, 0, 1.35);
      if (tile === 3) f = clamp(f * 1.3, 0, 1.5);
      var c32 = shade(baseCol, clamp(f, 0, 1));

      var x0 = i * colW, x1 = Math.min(CW, x0 + colW);
      for (var xx = x0; xx < x1; xx++) {
        for (var yy = y0; yy <= y1; yy++) buf[yy * CW + xx] = c32;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    drawFloorGrid(horizon);
    drawVignette();

    /* 门 / 出口发光标记 */
    drawBillboards(horizon);
    drawHunter(horizon);
  }

  /* 地面网格：按距离投影几条横线，越远越淡。纯 2D 叠加，不占光线预算。 */
  function drawFloorGrid(horizon) {
    ctx.save();
    ctx.strokeStyle = "rgba(78,163,255,.20)";
    ctx.lineWidth = 1;
    for (var d = 1.2; d < 9; d += 0.9) {
      var y = horizon + (CH * 0.5) / d * 0.62;
      if (y < horizon + 2 || y > CH) continue;
      ctx.globalAlpha = clamp(1.1 - d / 9, 0.05, 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CW, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.25, CW / 2, CH / 2, CH * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }

  function drawBillboards(horizon) {
    var cosA = Math.cos(st.ang), sinA = Math.sin(st.ang);
    var items = [];
    world.doors.forEach(function (d) {
      if (d.open) return;
      items.push({ x: d.x + 0.5, y: d.y + 0.5, col: "#7cc4ff", ch: "▮" });
    });
    items.push({ x: world.exit.x + 0.5, y: world.exit.y + 0.5, col: "#3ecf8e", ch: "◆" });
    items.forEach(function (it) {
      var dx = it.x - st.px, dy = it.y - st.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 12 || dist < 0.3) return;
      var rel = Math.atan2(dy, dx) - st.ang;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > FOV / 2 * 1.1) return;
      var sx = CW / 2 + (rel / (FOV / 2)) * (CW / 2);
      var sy = horizon - (CH / dist) * 0.12;
      var r = clamp(34 / dist, 3, 16);
      ctx.globalAlpha = clamp(1 - dist / 13, 0.15, 0.9);
      ctx.fillStyle = it.col;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  /* 逮捕者：一个会呼吸的人形剪影。
     不画脸 —— 看不清的东西比看得清的东西更吓人，
     而且这张脸一旦画具体了，玩家就会开始判断「它是不是 AI」，
     那正好跑题了。 */
  function drawHunter(horizon) {
    if (!HUNT.on) return;
    var dx = HUNT.x - st.px, dy = HUNT.y - st.py;
    var dist = Math.hypot(dx, dy);
    if (dist > 14 || dist < 0.2) return;
    var rel = Math.atan2(dy, dx) - st.ang;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) > FOV / 2 * 1.15) return;

    var sx = CW / 2 + (rel / (FOV / 2)) * (CW / 2);
    var scale = CH / dist;
    var hgt = clamp(scale * 0.66, 12, CH * 1.6);      /* 身高约 0.66 格，比人略高一点 */
    var wid = hgt * 0.30;
    /* 步态：上下起伏 + 左右轻摆。幅度很小，但一帧一帧看过去它就在走，
       而不是一张贴图平移。 */
    var ph = HUNT.phase || 0;
    var bob = Math.sin(ph * 2) * hgt * 0.012;
    var sway = Math.sin(ph) * hgt * 0.008;
    sx += sway;
    var baseY = horizon + hgt * 0.52 + bob;            /* 脚在地平线下方 */
    var topY = baseY - hgt;
    var a = clamp(1 - dist / 15, 0.18, 1);

    ctx.save();
    ctx.globalAlpha = a;
    /* 背后一圈血色光晕：让它在任何墙色前面都能被认出来 */
    var g = ctx.createRadialGradient(sx, baseY - hgt * 0.45, 2, sx, baseY - hgt * 0.45, hgt * 0.85);
    g.addColorStop(0, "rgba(255,48,64,.34)");
    g.addColorStop(1, "rgba(255,48,64,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, baseY - hgt * 0.45, hgt * 0.85, 0, Math.PI * 2);
    ctx.fill();

    /* 两条手臂：细长、贴身在两侧，随步态前后摆。
       不加手臂时它像一根柱子；加上之后轮廓才像「站着的人」。 */
    var armSw = Math.sin(ph) * hgt * 0.055;
    ctx.fillStyle = "rgba(8,6,10,.86)";
    ctx.beginPath();
    ctx.moveTo(sx - wid * 0.46, topY + hgt * 0.30);
    ctx.quadraticCurveTo(sx - wid * 0.62 + armSw, baseY - hgt * 0.34,
                         sx - wid * 0.44 + armSw, baseY - hgt * 0.14);
    ctx.lineTo(sx - wid * 0.30 + armSw, baseY - hgt * 0.14);
    ctx.quadraticCurveTo(sx - wid * 0.40, baseY - hgt * 0.38, sx - wid * 0.28, topY + hgt * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + wid * 0.46, topY + hgt * 0.30);
    ctx.quadraticCurveTo(sx + wid * 0.62 - armSw, baseY - hgt * 0.34,
                         sx + wid * 0.44 - armSw, baseY - hgt * 0.14);
    ctx.lineTo(sx + wid * 0.30 - armSw, baseY - hgt * 0.14);
    ctx.quadraticCurveTo(sx + wid * 0.40, baseY - hgt * 0.38, sx + wid * 0.28, topY + hgt * 0.34);
    ctx.closePath(); ctx.fill();

    /* 身体：一条从肩到脚的梯形 + 一个头 */
    ctx.fillStyle = "rgba(8,6,10,.94)";
    ctx.beginPath();
    ctx.moveTo(sx - wid * 0.5, baseY);
    ctx.lineTo(sx - wid * 0.42, baseY - hgt * 0.62);
    ctx.quadraticCurveTo(sx - wid * 0.34, topY + hgt * 0.30, sx - wid * 0.16, topY + hgt * 0.28);
    ctx.lineTo(sx + wid * 0.16, topY + hgt * 0.28);
    ctx.quadraticCurveTo(sx + wid * 0.34, topY + hgt * 0.30, sx + wid * 0.42, baseY - hgt * 0.62);
    ctx.lineTo(sx + wid * 0.5, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sx, topY + hgt * 0.20, wid * 0.21, hgt * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 两点眼睛：唯一的亮部 */
    var er = Math.max(1.1, hgt * 0.016);
    ctx.fillStyle = "#ff2f42";
    ctx.shadowColor = "#ff2f42";
    ctx.shadowBlur = Math.max(4, hgt * 0.06);
    ctx.beginPath(); ctx.arc(sx - wid * 0.07, topY + hgt * 0.19, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + wid * 0.07, topY + hgt * 0.19, er, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------------- 小地图 ---------------- */
  var mini = $("#mzmini"), mctx = mini.getContext("2d");
  function drawMini() {
    var S = mini.width / W;
    mctx.clearRect(0, 0, mini.width, mini.height);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var t = world.g[y * W + x];
        if (t === 0) continue;
        mctx.fillStyle = t === 2 ? "#2f7fc4" : (t === 3 ? "#3ecf8e" : "rgba(90,120,165,.42)");
        mctx.fillRect(x * S, y * S, S, S);
      }
    }
    world.traps.forEach(function (tp) {
      if (tp.hit) return;
      mctx.fillStyle = "rgba(255,94,108,.6)";
      mctx.fillRect(tp.x * S + S * 0.2, tp.y * S + S * 0.2, S * 0.6, S * 0.6);
    });
    /* 玩家 */
    mctx.fillStyle = "#7cc4ff";
    mctx.beginPath();
    mctx.arc(st.px * S, st.py * S, Math.max(2, S * 0.45), 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = "rgba(124,196,255,.8)";
    mctx.lineWidth = 1.2;
    mctx.beginPath();
    mctx.moveTo(st.px * S, st.py * S);
    mctx.lineTo((st.px + Math.cos(st.ang) * 1.4) * S, (st.py + Math.sin(st.ang) * 1.4) * S);
    mctx.stroke();
    /* 逮捕者：小地图上必须看得见，否则玩家只会觉得「莫名其妙就死了」 */
    if (HUNT.on) {
      mctx.fillStyle = "#ff2f42";
      mctx.shadowColor = "#ff2f42";
      mctx.shadowBlur = 6;
      mctx.beginPath();
      mctx.arc(HUNT.x * S, HUNT.y * S, Math.max(2, S * 0.5), 0, Math.PI * 2);
      mctx.fill();
      mctx.shadowBlur = 0;
    }
  }

  /* ======================================================================
     6. 移动与碰撞
     ====================================================================== */
  function solid(x, y) {
    var mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= W || my >= H) return true;
    var t = world.g[my * W + mx];
    if (t === 1) return true;
    if (t === 2) {
      for (var i = 0; i < world.doors.length; i++) {
        var d = world.doors[i];
        if (d.x === mx && d.y === my) return !d.open;
      }
    }
    return false;
  }
  function moveTo(nx, ny) {
    var R = 0.24;
    if (!solid(nx + R, st.py) && !solid(nx - R, st.py) && !solid(nx, st.py + R) && !solid(nx, st.py - R)) st.px = nx;
    if (!solid(st.px, ny + R) && !solid(st.px, ny - R) && !solid(st.px + R, ny) && !solid(st.px - R, ny)) st.py = ny;
  }

  /* ----------------------------------------------------------------------
     逮捕者的走法
     ----------------------------------------------------------------------
     用「距玩家最近的下一步」贪心前进：每 0.3 秒从自己所在格做一次 BFS，
     取 dist 恰好比自己少 1 的那个邻格当目标。比存整条路径稳 ——
     玩家一直在动，路径每一帧都在失效，而 BFS 一次只有 529 个格子。
     ---------------------------------------------------------------------- */
  /* 贪心下一格。
     坑（2026-10-31 修）：BFS 必须从「玩家」出发，不能从逮捕者出发。
     从逮捕者出发时 dist[自己]=0、dist[相邻]=1，而「到玩家的距离」是 16，
     于是去找 dist===15 的邻格 —— 永远找不到，函数恒返回 null，
     逮捕者就退回「直奔玩家坐标」的兜底分支，开始穿墙走直线。
     表现为：它从塔另一头沿一条直线穿过所有墙，几秒就贴到人身上。
     从玩家出发后 dist 是「离玩家还有几步」，邻格里 dist-1 的那个就是该走的方向。 */
  function nextCell(cx, cy) {
    var pcx = Math.floor(st.px), pcy = Math.floor(st.py);
    var b = bfs(world.g, pcx, pcy);
    var here = b.dist[cy * W + cx];
    if (here < 0) return null;                 /* 玩家在另一个不可达区域 */
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nx = cx + nb[i][0], ny = cy + nb[i][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (b.dist[ny * W + nx] === here - 1) return [nx, ny];
    }
    return null;
  }

  function huntStep(dt) {
    if (!HUNT.on) {
      if (st.tAcc >= HUNT.at) spawnHunt();
      return;
    }
    var cx = Math.floor(HUNT.x), cy = Math.floor(HUNT.y);
    /* 目标点：先走到本格中心，再走向下一格中心。
       不这么写会在拐角切角穿墙 —— 走廊只有一格宽，切角必然穿墙。 */
    var arrived = Math.hypot(HUNT.x - HUNT.tx, HUNT.y - HUNT.ty) < 0.06;
    if (arrived) {
      var nc = nextCell(cx, cy);
      HUNT.nullN = nc ? 0 : (HUNT.nullN || 0) + 1;
      if (nc) { HUNT.tx = nc[0] + 0.5; HUNT.ty = nc[1] + 0.5; }
      else {
        /* 找不到下一格时原地停住。绝不能「直奔玩家坐标」——
           那等于给它一条穿墙的直线，几秒就贴到人身上，走廊就不再是走廊了。 */
        HUNT.tx = HUNT.x; HUNT.ty = HUNT.y;
      }
    }
    var dx = HUNT.tx - HUNT.x, dy = HUNT.ty - HUNT.y;
    var d = Math.hypot(dx, dy);
    if (d > 1e-4) {
      var s = Math.min(HUNT.speed * dt, d);
      HUNT.x += (dx / d) * s;
      HUNT.y += (dy / d) * s;
      /* 步态相位跟着真实位移走，不是跟着时间走 ——
         这样它停下来时腿就停，不会在原地空踏步。 */
      HUNT.phase = (HUNT.phase || 0) + s * 3.1;
    }
    HUNT.dist = Math.hypot(HUNT.x - st.px, HUNT.y - st.py);
    if (HUNT.dist < 0.55) { caught(); return; }
    paintHunt();
  }

  function spawnHunt() {
    HUNT.on = true;
    /* 不能刷在玩家身上。取「离玩家最远的那个可走格」——
       这保证它一定从塔的另一头出现，玩家至少有十几秒的预警时间，
       也保证它出现的位置永远在玩家视线之外：恐怖感来自「它在你不知道的地方」，
       而不是「它突然贴在你脸上」。 */
    var pcx = Math.floor(st.px), pcy = Math.floor(st.py);
    var b = bfs(world.g, pcx, pcy);
    var far = -1, farI = -1;
    for (var i = 0; i < b.dist.length; i++) {
      if (b.dist[i] > far) { far = b.dist[i]; farI = i; }
    }
    if (farI >= 0) {
      var fx = farI % W, fy = (farI - fx) / W;
      HUNT.x = fx + 0.5; HUNT.y = fy + 0.5;
    }
    HUNT.tx = HUNT.x; HUNT.ty = HUNT.y;
    HUNT.dist = Math.hypot(HUNT.x - st.px, HUNT.y - st.py);
    msg("塔门又开了一次。有人进来了——它不看指标，它只看你。", "bad");
    var hd = $("#huntHud"); if (hd) hd.className = "h hunt live";
    var hn = $("#huntN"); if (hn) hn.textContent = "已入塔";
    sound.sting();
  }

  function paintHunt() {
    var hd = $("#huntHud"), hn = $("#huntN"), vg = $("#vig");
    if (!hd) return;
    if (!HUNT.on) { hd.className = "h hunt"; hn.textContent = "—"; if (vg) vg.className = "mzvig"; return; }
    var d = HUNT.dist;
    hn.textContent = d > 12 ? "很远" : (d > 6 ? d.toFixed(0) + " 格" : d.toFixed(1) + " 格");
    var near = d < 3.2;
    hd.className = "h hunt live" + (near ? " near" : "");
    if (vg) {
      vg.className = "mzvig on" + (d < 4 ? " beat" : "");
      vg.style.opacity = String(clamp(1 - d / 9, 0, 1) * 0.9);
    }
    sound.beat(d);
  }

  function step(dt) {
    if (!st.running || st.done || st.inModal) return;
    /* 塔内时间只在「真的在走」的时候累加。
       答题时冻结——这是规则，不是优化：否则读题慢的人会被判死刑。 */
    st.tAcc += dt;
    var sp = 2.35 * dt, rot = 2.3 * dt;
    var mx = 0, my = 0;
    if (keys.w) { mx += Math.cos(st.ang); my += Math.sin(st.ang); }
    if (keys.s) { mx -= Math.cos(st.ang); my -= Math.sin(st.ang); }
    if (keys.a) { mx += Math.cos(st.ang - Math.PI / 2); my += Math.sin(st.ang - Math.PI / 2); }
    if (keys.d) { mx += Math.cos(st.ang + Math.PI / 2); my += Math.sin(st.ang + Math.PI / 2); }
    if (mx || my) {
      var len = Math.hypot(mx, my);
      moveTo(st.px + (mx / len) * sp, st.py + (my / len) * sp);
    }
    if (keys.q) st.ang -= rot;
    if (keys.r) st.ang += rot;

    /* 兜底转向：指针没锁住时，鼠标在画面里的横向位置直接决定转向角速度。
       锁住之后这段自动失效（锁定时 clientX 不再变化，本来也算不出偏移）。 */
    if (!locked && hoverX != null && !st.inModal) {
      var off = hoverX - 0.5;
      if (Math.abs(off) > 0.14) st.ang += (off - Math.sign(off) * 0.14) * 3.6 * dt;
    }

    /* 陷阱 */
    world.traps.forEach(function (tp) {
      if (tp.hit) return;
      if (Math.abs(st.px - (tp.x + 0.5)) < 0.5 && Math.abs(st.py - (tp.y + 0.5)) < 0.5) {
        tp.hit = true;
        st.life--;
        paintHud();
        msg("踩到刷分陷阱：这个格子在训练集里出现过 400 次。可信度 −1。", "bad");
        if (st.life <= 0) lose();
      }
    });
    if (!st.running) return;

    /* 门 */
    var near = null, best = 1.55;
    world.doors.forEach(function (d) {
      if (d.open) return;
      var dx = d.x + 0.5 - st.px, dy = d.y + 0.5 - st.py;
      var dist = Math.hypot(dx, dy);
      if (dist > best) return;
      var dot = (dx * Math.cos(st.ang) + dy * Math.sin(st.ang)) / (dist || 1);
      if (dot < 0.35) return;
      best = dist; near = d;
    });
    st.curDoor = near;
    $("#prompt").classList.toggle("on", !!near);
    if (near) $("#prompt").textContent = "按 E 开启「" + GATES[near.gate].name + "」知识门";

    /* 出口 */
    var edx = world.exit.x + 0.5 - st.px, edy = world.exit.y + 0.5 - st.py;
    if (Math.hypot(edx, edy) < 0.6) { finish(); return; }

    /* 逮捕者 */
    huntStep(dt);

    /* 时钟 */
    var el = st.tAcc;
    var mm = Math.floor(el / 60), ss = Math.floor(el % 60);
    $("#clock").textContent = (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  /* ======================================================================
     7. HUD
     ====================================================================== */
  function paintHud() {
    var h = "";
    for (var i = 0; i < 3; i++) h += '<i class="' + (i < st.life ? "on" : "gone") + '"></i>';
    $("#life").innerHTML = h;
    $("#fragN").textContent = st.frags.length;
  }
  function paintFrags() {
    var h = "";
    for (var i = 0; i < 8; i++) {
      var got = st.frags.indexOf(i) >= 0;
      var miss = st.answered[i] && !got;
      h += '<div class="mzf ' + (got ? "got" : (miss ? "miss" : "")) + '">' + (i + 1) + '</div>';
    }
    $("#frags").innerHTML = h;
  }
  var msgTm = null;
  function msg(text, kind) {
    var el = $("#msg");
    el.textContent = text;
    el.className = "mzmsg on " + (kind || "");
    clearTimeout(msgTm);
    msgTm = setTimeout(function () { el.className = "mzmsg " + (kind || ""); }, 4200);
  }
  function toast(t) {
    var el = $("#mztoast");
    el.textContent = t; el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, 2400);
  }

  /* ======================================================================
     8. 知识门
     ====================================================================== */
  var curQ = null;
  function openGate(d) {
    var g = GATES[d.gate];
    curQ = { door: d, gate: g };
    st.inModal = true;
    /* 答题必须放开鼠标：指针锁着的时候点不到选项。
       时间也在这里停 —— 塔不动，它也不动。 */
    unlock();
    sound.duck(true);
    $("#qNo").textContent = "GATE " + ("0" + (d.gate + 1)).slice(-2);
    $("#qTtl").textContent = g.name;
    $("#qText").textContent = g.q;
    $("#qOpts").innerHTML = g.opts.map(function (o, i) {
      return '<button class="mzo" data-i="' + i + '"><span class="k">' + String.fromCharCode(65 + i) + '</span><span>' + o + '</span></button>';
    }).join("");
    $("#qWhy").className = "mzwhy";
    $("#qWhy").textContent = "";
    $("#qGo").disabled = true;
    $("#qGo").textContent = "继续探索";
    $("#qHint").textContent = "选一个答案。";
    $("#modal").classList.add("on");
  }

  $("#qOpts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-i]");
    if (!b || !curQ || b.disabled) return;
    var i = +b.dataset.i, g = curQ.gate, ok = i === g.a;
    var all = $("#qOpts").querySelectorAll(".mzo");
    for (var k = 0; k < all.length; k++) {
      all[k].disabled = true;
      if (k === g.a) all[k].classList.add("ok");
      else if (k === i) all[k].classList.add("no");
    }
    st.answered[curQ.door.gate] = true;
    if (ok) {
      st.frags.push(curQ.door.gate);
      paintFrags(); paintHud();
      $("#qWhy").className = "mzwhy on";
      $("#qWhy").innerHTML = "<b style='color:#3ecf8e'>对。</b>" + g.why;
      $("#qHint").textContent = "拿到第 " + st.frags.length + " 枚指标碎片。";
    } else {
      $("#qWhy").className = "mzwhy on";
      $("#qWhy").innerHTML = "<b style='color:#ff5e6c'>不对。</b>" + g.why;
      $("#qHint").textContent = "这一枚拿不到了，门还是会开——但碎片不够就走不出去。";
    }
    $("#qGo").disabled = false;
    $("#qGo").textContent = "开门，继续";
  });

  $("#qGo").addEventListener("click", function () {
    if (!curQ) return;
    curQ.door.open = true;
    world.g[curQ.door.y * W + curQ.door.x] = 0;
    $("#modal").classList.remove("on");
    st.inModal = false;
    sound.duck(false);
    msg("门开了。左边是走廊，右边也是走廊——塔不打算让你轻易记住方向。", "");
    curQ = null;
    keys = {};
    /* 这一下点击本身就是手势，可以合法地把指针重新锁回去 */
    lockNow();
  });

  /* ======================================================================
     9. 结束
     ====================================================================== */
  function elapsed() { return Math.round(st.tAcc); }

  function unlock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
  }

  /* 被逮捕：强制退出，没有证书。
     这里刻意不给任何「你差一点就成功了」的台阶 ——
     被抓住就是被抓住，塔不记分数，只记时长。 */
  function caught() {
    if (st.done) return;
    st.running = false; st.done = true; HUNT.on = false;
    unlock();
    var el = elapsed();
    $("#vig").className = "mzvig";
    $("#endBox").innerHTML = '<div class="box caught">' +
      '<h3>被逮捕 · 强制退出</h3>' +
      '<p>逮捕者在第 <b>' + el + ' 秒</b>追上了你。它不看指标，也不读判据——' +
      '它只负责让「走通这座塔」和「证明你懂这座塔」之间保持距离。' +
      '<b>被抓住的人没有证书</b>，只有一条入塔记录。</p>' +
      '<div class="sc"><span>碎片<b>' + st.frags.length + ' / 8</b></span>' +
      '<span>可信度<b>' + st.life + ' / 3</b></span>' +
      '<span>存活<b>' + el + 's</b></span></div>' +
      '<p style="font-size:11px;color:var(--mz-tx3)">下一次：先想清楚要去哪道门，再动。' +
      '在走廊里犹豫的每一秒，都是它的。</p>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="mzbtn" id="btnAgain">再进一次</button>' +
      '<a class="mzbtn ghost" href="h3-metrics.html" style="text-decoration:none;display:inline-block">回指标馆</a></div></div>';
    var b = $("#btnAgain");
    if (b) b.addEventListener("click", function () { reset(0); });
    $("#endBox").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function lose() {
    st.running = false; st.done = true;
    unlock();
    $("#vig").className = "mzvig";
    var el = elapsed();
    $("#endBox").innerHTML = '<div class="box">' +
      '<h3>可信度归零 · 被弹出塔外</h3>' +
      '<p>踩了三次刷分陷阱。这不是运气问题：陷阱放在死胡同里，' +
      '而<b>每一个死胡同都长得像一条可能的近路</b>——这正是刷分之所以有效的原因。</p>' +
      '<div class="sc"><span>碎片<b>' + st.frags.length + ' / 8</b></span>' +
      '<span>用时<b>' + el + 's</b></span></div>' +
      '<button class="mzbtn" id="btnAgain">再进一次</button></div>';
    var b = $("#btnAgain");
    if (b) b.addEventListener("click", function () { reset(0); });
  }

  function finish() {
    if (st.done) return;
    st.running = false; st.done = true;
    unlock();
    $("#vig").className = "mzvig";
    var el = elapsed();
    var n = st.frags.length;
    var win = n >= 6;
    var H2 = [];
    H2.push('<div class="box' + (win ? " win" : "") + '">');
    H2.push('<h3>' + (win ? "走出指标塔 · 精英证书已签发" : "走到了出口，但碎片不够") + '</h3>');
    H2.push('<p>' + (win
      ? "你在 " + el + " 秒内集齐了 " + n + " 枚指标碎片，并找到了出口。这座塔的八道门各锁着一个判据——你不是靠运气绕过去的，是靠认出哪一句话在偷换「测量」和「目标」。"
      : "你走到了出口，但只拿到 " + n + " 枚碎片。出口不为难你，只是不开：<b>走通一座塔，和证明你懂这座塔，是两件事</b>。回指标馆把没答对的那几层再读一遍。") + '</p>');
    H2.push('<div class="sc"><span>碎片<b>' + n + ' / 8</b></span>' +
      '<span>可信度<b>' + st.life + ' / 3</b></span>' +
      '<span>用时<b>' + el + 's</b></span></div>');

    if (win && window.YCDeep) {
      var cert = null;
      try {
        window.YCDeep.register("H3", { name: "指标失效博物馆" });
        cert = window.YCDeep.issueCert("H3", "elite", {
          holder: "探索者",
          play: "指标塔 · 3D 迷宫",
          score: n * 10 + st.life * 5,
          detail: [
            "穿过 23 × 23 的指标塔，集齐 " + n + " 枚指标碎片",
            "八道知识门各锁一个判据：代理指标 / 古德哈特 / 刷分 / 偏移",
            "可信度剩余 " + st.life + " / 3 · 用时 " + el + " 秒",
            "未踩满三次刷分陷阱"
          ]
        });
      } catch (e) { }
      H2.push('<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px">');
      if (cert) {
        H2.push('<button class="mzbtn" id="btnCert">下载精英证书</button>');
        H2.push('<span style="font-family:var(--mz-mono);font-size:10px;color:var(--mz-tx3);align-self:center">' + cert.no + '</span>');
      }
      H2.push('<button class="mzbtn ghost" id="btnAgain">再走一座新塔</button>');
      H2.push('<a class="mzbtn ghost" href="h3-metrics.html" style="text-decoration:none;display:inline-block">回指标馆</a>');
      H2.push('</div>');
      if (cert) {
        H2.push('<div class="certbox">' + window.YCDeep.certSVG(cert, { accent: "#c9a227", paper: "#0c1220", ink: "#dce8fb" }) + '</div>');
      }
    } else {
      H2.push('<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px">' +
        '<button class="mzbtn" id="btnAgain">再走一次</button>' +
        '<a class="mzbtn ghost" href="h3-metrics.html" style="text-decoration:none;display:inline-block">回指标馆</a></div>');
    }
    H2.push('</div>');
    $("#endBox").innerHTML = H2.join("");

    var b2 = $("#btnAgain");
    if (b2) b2.addEventListener("click", function () { reset(0); });
    var bc = $("#btnCert");
    if (bc) bc.addEventListener("click", function () {
      var c = window.YCDeep.getCert("H3", "elite");
      if (c) window.YCDeep.download(c, { accent: "#c9a227", paper: "#0c1220", ink: "#dce8fb" });
    });
    $("#endBox").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ======================================================================
     10. 输入
     ====================================================================== */
  var KMAP = { w: "w", a: "a", s: "s", d: "d", q: "q", r: "r", arrowup: "w", arrowdown: "s", arrowleft: "q", arrowright: "r" };
  document.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (k === "e") {
      if (st.curDoor && !st.inModal) openGate(st.curDoor);
      return;
    }
    if (k === "escape" && st.inModal) { $("#modal").classList.remove("on"); st.inModal = false; return; }
    var m = KMAP[k];
    if (m) { keys[m] = true; e.preventDefault(); }
  });
  document.addEventListener("keyup", function (e) {
    var m = KMAP[e.key.toLowerCase()];
    if (m) keys[m] = false;
  });

  /* 触控按钮 */
  document.querySelectorAll(".mzpad button").forEach(function (b) {
    var k = b.dataset.k;
    if (k === "e") { b.addEventListener("click", function () { if (st.curDoor && !st.inModal) openGate(st.curDoor); }); return; }
    if (k === "e2") {
      var on2 = false;
      var start2 = function (e) { e.preventDefault(); keys.r = true; };
      var end2 = function () { keys.r = false; };
      b.addEventListener("pointerdown", start2);
      b.addEventListener("pointerup", end2);
      b.addEventListener("pointerleave", end2);
      b.addEventListener("pointercancel", end2);
      return;
    }
    var start = function (e) { e.preventDefault(); keys[k] = true; };
    var end = function () { keys[k] = false; };
    b.addEventListener("pointerdown", start);
    b.addEventListener("pointerup", end);
    b.addEventListener("pointerleave", end);
    b.addEventListener("pointercancel", end);
  });

  /* ---------------- 鼠标视角（Pointer Lock） ----------------
     上一版是「按住鼠标拖动转身」—— 必须先点住，手感像在看 3D 相册，
     不像在走路。改成锁定指针之后，鼠标一动视角就动，和枪战游戏一致：
     点一下画面锁进去，Esc 放出来。

     锁不上的情况（老浏览器、被策略拦掉、手机）自动退回拖动模式，
     所以下面那段拖动代码要留着。 */
  var locked = false, lockFailed = false;
  var SENS = 0.0023;

  function lockNow() {
    if (st.done) return;
    sound.start();
    /* 新版浏览器 requestPointerLock() 返回 Promise，失败是异步 reject ——
       只 try/catch 拦不住，会在控制台留一条 Unhandled rejection。
       拦下来之后主动切到「悬停转向」兜底，用户照样能转身。 */
    try {
      var p = cv.requestPointerLock();
      if (p && typeof p.catch === "function") {
        p.catch(function () { lockFailed = true; syncLockHint(); });
      }
    } catch (e) { lockFailed = true; syncLockHint(); }
  }
  function syncLockHint() {
    var h = $("#lockHint");
    if (h) h.classList.toggle("on", !locked && !st.done);
  }

  cv.addEventListener("click", function () { if (!locked) lockNow(); });

  document.addEventListener("pointerlockchange", function () {
    locked = (document.pointerLockElement === cv);
    if (locked) lockFailed = false;
    syncLockHint();
  });
  document.addEventListener("pointerlockerror", function () {
    /* 锁不上（老浏览器 / 被策略拦掉 / 无头环境）：
       退到「鼠标停在画面里就能转向」的模式，仍然不需要按住鼠标。 */
    locked = false; lockFailed = true;
    syncLockHint();
  });

  document.addEventListener("mousemove", function (e) {
    if (!locked) return;
    st.ang += (e.movementX || 0) * SENS;
    st.pitch = clamp(st.pitch + (e.movementY || 0) * 0.00045, -0.26, 0.26);
  });

  /* 兜底一：锁不上时，鼠标在画面内横向位置决定转向角速度 ——
     鼠标偏左就持续左转，偏右就持续右转，中间是死区。
     这条路径只在 pointerlockerror 之后启用，正常情况下完全不参与。 */
  var hoverX = null;
  cv.addEventListener("pointermove", function (e) {
    var r = cv.getBoundingClientRect();
    hoverX = (e.clientX - r.left) / Math.max(1, r.width);
  });
  cv.addEventListener("pointerleave", function () { hoverX = null; });

  /* 兜底二：按住拖动。锁不上又没有鼠标悬停时（触屏）才会用到 */
  var dragging = false, lastX = 0;
  cv.addEventListener("pointerdown", function (e) { if (!locked) { dragging = true; lastX = e.clientX; } });
  window.addEventListener("pointerup", function () { dragging = false; });
  window.addEventListener("pointermove", function (e) {
    if (locked || !dragging) return;
    var dx = e.clientX - lastX;
    lastX = e.clientX;
    st.ang += dx * 0.0055;
  });

  $("#btnRestart").addEventListener("click", function () { reset(0); });

  /* ======================================================================
     11. 主循环
     ====================================================================== */
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render();
    drawMini();
    requestAnimationFrame(loop);
  }

  reset(SEED);
  requestAnimationFrame(loop);

  /* ----------------------------------------------------------------------
     体检钩子：把「走到某道门前」变成一次可重复的定位，避免探针靠随机走位。
     只读状态 + 定位，不提供直接加碎片或直接通关的能力。
     ---------------------------------------------------------------------- */
  window.YCMaze = {
    status: function () {
      return {
        px: st.px, py: st.py, ang: st.ang,
        life: st.life, frags: st.frags.slice(),
        done: st.done, running: st.running,
        doorsOpen: world.doors.filter(function (d) { return d.open; }).length,
        doorsTotal: world.doors.length,
        traps: world.traps.length,
        seed: SEED,
        grid: W + "x" + H,
        t: Math.round(st.tAcc),
        hunt: HUNT.on,
        huntDist: HUNT.on ? Math.round(HUNT.dist * 10) / 10 : -1,
        /* 调试用：逮捕者坐标 + 它到玩家的「步数」距离。
           两者一对比就知道它是在走走廊，还是在穿墙抄直线。 */
        huntX: Math.round(HUNT.x * 100) / 100,
        huntY: Math.round(HUNT.y * 100) / 100,
        huntPath: (function () {
          if (!HUNT.on) return -1;
          var hb = bfs(world.g, Math.floor(HUNT.x), Math.floor(HUNT.y));
          return hb.dist[Math.floor(st.py) * W + Math.floor(st.px)];
        })(),
        huntOnWall: HUNT.on ? (world.g[Math.floor(HUNT.y) * W + Math.floor(HUNT.x)] !== 0) : false,
        huntTarget: [Math.round(HUNT.tx * 100) / 100, Math.round(HUNT.ty * 100) / 100],
        huntNullN: HUNT.nullN || 0,
        playerOnWall: world.g[Math.floor(st.py) * W + Math.floor(st.px)] !== 0,
        caught: !!$("#endBox .box.caught"),
        locked: locked
      };
    },
    /* 把塔内时钟往前推 —— 和「等这么久」等价，只是快。
       体检要用它验「60 秒后入塔」，不然每跑一次要真等一分钟。 */
    fastForward: function (sec) { st.tAcc += Math.max(0, +sec || 0); return st.tAcc; },
    gotoDoor: function (i) {
      var d = world.doors[i];
      if (!d) return false;
      var nb = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var k = 0; k < nb.length; k++) {
        var nx = d.x + nb[k][0], ny = d.y + nb[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (world.g[ny * W + nx] !== 0) continue;
        st.px = nx + 0.5; st.py = ny + 0.5;
        st.ang = Math.atan2((d.y + 0.5) - st.py, (d.x + 0.5) - st.px);
        return true;
      }
      return false;
    },
    dbgNext: function (x, y) {
      var cx = x == null ? Math.floor(HUNT.x) : x;
      var cy = y == null ? Math.floor(HUNT.y) : y;
      var b = bfs(world.g, cx, cy);
      var pcx = Math.floor(st.px), pcy = Math.floor(st.py);
      var target = b.dist[pcy * W + pcx];
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]], near = [];
      for (var i = 0; i < 4; i++) {
        var nx = cx + nb[i][0], ny = cy + nb[i][1];
        near.push({ nx: nx, ny: ny, g: world.g[ny * W + nx], d: b.dist[ny * W + nx] });
      }
      var walk = 0, maxd = -1;
      for (var k = 0; k < W * H; k++) { if (world.g[k] === 0) walk++; if (b.dist[k] > maxd) maxd = b.dist[k]; }
      return { cx: cx, cy: cy, gSelf: world.g[cy * W + cx], target: target,
               pcell: [pcx, pcy], W: W, H: H, near: near, nc: nextCell(cx, cy),
               walk: walk, cells: W * H, maxFromHunter: maxd };
    },
    /* 体检用：把视角转向逮捕者，方便截「它在走廊尽头」那一帧。 */
    aimAtHunt: function () {
      if (!HUNT.on) return false;
      st.ang = Math.atan2(HUNT.y - st.py, HUNT.x - st.px);
      st.pitch = 0;
      return true;
    },
    answerOf: function (i) { return GATES[i] ? GATES[i].a : -1; },
    gateCount: function () { return GATES.length; },
    gotoExit: function () {
      /* 出口格本身可走（不是墙），直接站到格心才会触发 finish() 的 0.6 判定 */
      st.px = world.exit.x + 0.5;
      st.py = world.exit.y + 0.5;
      return true;
    }
  };
})();

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
     2. 题库（H3 的八个判据 · 300+ 道，每次随机抽）
     ----------------------------------------------------------------------
     上一版把八道门写死绑八个判据，题目只有八道 —— 玩家走两遍就背下来了，
     之后这座塔考的是记忆力，不是判断力。

     现在题目在 03b-quiz.js 里（构建时拼进本文件之前），按判据分八类，
     每次进塔用种子抽 DOOR_N 道，且**保证类别覆盖**：先每类各抽一道，
     再轮到第二轮。所以你不会连撞三道「分布偏移」，也不会一次都碰不到。
     ====================================================================== */
  var QUIZ = window.YCQUIZ || { cats: [] };
  /* 八道门全部答对，出口才会出现。
     上一版是「答对 6 道就算过」——玩家可以绕开两道门直接去出口，
     于是「走通」和「读懂」之间还留着一条缝。现在没有缝了：
     八道门必须全部拿到，出口才会在迷宫的某个随机角落亮起来。 */
  var PASS_N = 8;

  /* 下面这个 GATES 数组是题库加载失败时的兜底，保证塔不会变成一座空塔 */
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
     3. 迷宫生成（递归回溯 → 编织 → 挖厅）
     ----------------------------------------------------------------------
     纯递归回溯出来的是「完美迷宫」：任意两点之间只有一条路。
     完美迷宫在纸面上好看，走起来却无聊 —— 你只要一直摸着左墙就能出去，
     而且没有分岔的错觉，走错一次立刻就知道自己错了。

     真实的塔不长这样。这里加两步：
       braid  随机打通约三分之一的死胡同，制造环路。有了环，
              「我刚才是不是走过这里」这个问题才第一次成立 ——
              而在完美迷宫里它永远不成立，所以玩家从来不需要记路。
       hall   挖四个 3×3 的开阔厅。它们既是地标（走进大厅 = 知道自己大致在哪），
              也是唯一能绕开逮捕者的地方：走廊里它是必中的，大厅里你可以绕。
     ====================================================================== */
  var COLS = 20, ROWS = 20;            /* 单元格数；网格 = 41 × 41 */
  var W = COLS * 2 + 1, H = ROWS * 2 + 1;
  var DOOR_N = 8;                      /* 知识门数量：八道同时存在，不分先后 */

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

  /* 编织：打通一部分死胡同，把树变成图 */
  function braid(g, rnd, rate) {
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var id = y * W + x;
        if (g[id] !== 0) continue;
        var walls = [];
        if (g[id - 1] !== 0) walls.push([-1, 0]);
        if (g[id + 1] !== 0) walls.push([1, 0]);
        if (g[id - W] !== 0) walls.push([0, -1]);
        if (g[id + W] !== 0) walls.push([0, 1]);
        if (walls.length !== 3) continue;      /* 不是死胡同 */
        if (rnd() > rate) continue;
        /* 只能朝「隔壁那格也是通道」的方向打通，否则会挖出 2×2 空场，
           那种空场在光线投射里看起来像贴图错位。 */
        var cand = walls.filter(function (d) {
          var nx = x + d[0] * 2, ny = y + d[1] * 2;
          if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) return false;
          return g[ny * W + nx] === 0;
        });
        if (!cand.length) continue;
        var pick = cand[Math.floor(rnd() * cand.length)];
        g[(y + pick[1]) * W + (x + pick[0])] = 0;
      }
    }
  }

  /* 挖厅：3×3 的开阔区，落在单元格奇数坐标上 */
  function carveHalls(g, rnd, n) {
    var halls = [], tries = 0;
    while (halls.length < n && tries++ < 400) {
      var x0 = 1 + Math.floor(rnd() * (COLS - 3)) * 2;
      var y0 = 1 + Math.floor(rnd() * (ROWS - 3)) * 2;
      if (x0 + 2 >= W - 1 || y0 + 2 >= H - 1) continue;
      if (x0 <= 3 && y0 <= 3) continue;                  /* 别盖住出生点 */
      var clash = halls.some(function (h) {
        return Math.abs(h.x - x0) < 7 && Math.abs(h.y - y0) < 7;
      });
      if (clash) continue;
      for (var yy = y0; yy < y0 + 3; yy++)
        for (var xx = x0; xx < x0 + 3; xx++) g[yy * W + xx] = 0;
      halls.push({ x: x0, y: y0, w: 3, h: 3 });
    }
    return halls;
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
        /* 0 = 走廊，3 = 已点亮的出口。出口格是能走进去的（solid() 也放行），
           这里必须一致 —— 否则 BFS 会把它当成墙，算出来「出口不可达 / -1 步」。 */
        if ((g[ni] !== 0 && g[ni] !== 3) || dist[ni] >= 0) continue;
        dist[ni] = dist[cur] + 1; prev[ni] = cur; q.push(ni);
      }
    }
    return { dist: dist, prev: prev };
  }

  function degAt(g, x, y) {
    var d = 0;
    if (g[y * W + x - 1] === 0) d++;
    if (g[y * W + x + 1] === 0) d++;
    if (g[(y - 1) * W + x] === 0) d++;
    if (g[(y + 1) * W + x] === 0) d++;
    return d;
  }

  /* 把 [-π, π] 切成 DOOR_N 个扇区，返回 0..DOOR_N-1。
     门靠这个散开：一个扇区一道，八个方向各一道。 */
  function sectorOf(ang) {
    var t = (ang + Math.PI) / (2 * Math.PI) * DOOR_N;
    var s = Math.floor(t);
    if (s < 0) s = 0;
    if (s > DOOR_N - 1) s = DOOR_N - 1;
    return s;
  }

  function buildWorld(seed) {
    var rnd = mulberry32((seed ^ 0x5bf03635) >>> 0);
    var g = genMaze(seed);
    /* 跑两遍：第一遍打通之后，有些格子才变成新的死胡同。
       只跑一遍的话，环路数量取决于遍历顺序，随机性太大。 */
    braid(g, rnd, 0.55);
    braid(g, rnd, 0.55);
    var halls = carveHalls(g, rnd, 5);

    var b = bfs(g, 1, 1);

    /* 出口不在这里定。八道门全部答对之后才随机亮起来（revealExit）。
       上一版把出口钉在最远格，于是「门」变成了路上的关卡 ——
       你必须按顺序一扇一扇过，走的是同一条道。 */
    var far = -1, farI = -1;
    for (var i = 0; i < b.dist.length; i++) if (b.dist[i] > far) { far = b.dist[i]; farI = i; }

    /* 解路径只留给探针看「塔有多绕」，不再承担玩法 */
    var path = [], p = farI;
    while (p >= 0) { var px = p % W; path.push([px, (p - px) / W]); p = b.prev[p]; }
    path.reverse();

    var inHall = function (x, y) {
      return halls.some(function (h) {
        return x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h;
      });
    };

    /* 门：按「绕地图中心的方位角」分八个扇区，一个扇区一道。
       上一版是沿解路径等距摆 —— 那条路是一条连续的走廊，
       八道门自然全挤在同一片区域，进门就看见一片蓝。
       按方位分扇区之后，门必然散在四面八方，而且得绕路才拿得到：
       它们不在同一条道上，也不分先后。 */
    var cands = [];
    for (var y2 = 1; y2 < H - 1; y2++) {
      for (var x2 = 1; x2 < W - 1; x2++) {
        var id2 = y2 * W + x2;
        if (g[id2] !== 0) continue;
        if (b.dist[id2] < 10) continue;            /* 离出生点太近，一进门就撞见 */
        if (inHall(x2, y2)) continue;              /* 3 格宽的厅里放门等于没放 */
        if (degAt(g, x2, y2) !== 2) continue;      /* 只放走廊，不放岔口 */
        cands.push({
          x: x2, y: y2, d: b.dist[id2],
          s: sectorOf(Math.atan2(y2 - (H - 1) / 2, x2 - (W - 1) / 2))
        });
      }
    }
    /* 走廊不够（编织得太密）就退回「任何可走格」，保证八道门一定存在 */
    if (cands.length < DOOR_N) {
      for (var y3 = 1; y3 < H - 1; y3++) {
        for (var x3 = 1; x3 < W - 1; x3++) {
          var id3 = y3 * W + x3;
          if (g[id3] !== 0 || b.dist[id3] < 10) continue;
          cands.push({
            x: x3, y: y3, d: b.dist[id3],
            s: sectorOf(Math.atan2(y3 - (H - 1) / 2, x3 - (W - 1) / 2))
          });
        }
      }
    }

    var doors = [], taken = [];
    var farFrom = function (c) {
      var m = 1e9;
      for (var i = 0; i < taken.length; i++) m = Math.min(m, Math.hypot(c.x - taken[i].x, c.y - taken[i].y));
      return m;
    };
    for (var s = 0; s < DOOR_N; s++) {
      var best = null, bestScore = -1e9;
      for (var ci = 0; ci < cands.length; ci++) {
        var c = cands[ci];
        if (c.used) continue;
        /* 扇区不对就重罚，但不完全排除 —— 某个扇区实在没有走廊时，
           宁可稍微偏一点，也不要少一道门。 */
        var off = Math.min(Math.abs(c.s - s), DOOR_N - Math.abs(c.s - s));
        var sep = taken.length ? farFrom(c) : 99;
        var score = -off * 26 + Math.min(sep, 14) * 1.6 + c.d * 0.35;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) break;
      best.used = true;
      taken.push(best);
      g[best.y * W + best.x] = 2;
      doors.push({ x: best.x, y: best.y, gate: doors.length, open: false });
    }

    /* 陷阱：不在主路径上的死胡同。
       另外**门旁边的死胡同也不放** —— 陷阱踩上才知道，若一道门唯一的近路上
       埋着一个，玩家每次去开那道门都得白掉一格可信度，那是惩罚而不是难度。 */
    var onPath = {};
    path.forEach(function (c) { onPath[c[1] * W + c[0]] = 1; });
    var nextToDoor = function (id) {
      return g[id - 1] === 2 || g[id + 1] === 2 || g[id - W] === 2 || g[id + W] === 2;
    };
    var traps = [];
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var id = y * W + x;
        if (g[id] !== 0 || onPath[id]) continue;
        if (degAt(g, x, y) !== 1) continue;
        if (nextToDoor(id)) continue;
        if (traps.length < 12) traps.push({ x: x, y: y, hit: false });
      }
    }

    /* exit 先留 null：八道门全开之后由 revealExit() 随机点亮 */
    return { g: g, doors: doors, traps: traps, exit: null, path: path, halls: halls, far: { x: farI % W, y: Math.floor(farI / W) } };
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
    curDoor: null, inModal: false, t: 0,
    quiz: []                      /* 本轮的题（每次进塔重抽） */
  };
  var keys = {};

  /* ----------------------------------------------------------------------
     抽题
     ----------------------------------------------------------------------
     分层抽样，不是从一个大池子里随机抓 —— 纯随机抽十道，
     有相当概率一道「聚合掩盖」都抽不到，而那恰恰是最容易被忽略的一类。
     所以先按类别轮流取，保证八个判据尽量都露面。

     另外：**抽出来之后要重新打乱选项顺序**。
     题库源码里为了好读，正确项大多写在第二位，直接呈现的话
     「永远选 B」能拿八成以上的分。打乱之后，同一道题两次遇到
     选项顺序都不同，背位置这件事就失效了。
     ---------------------------------------------------------------------- */
  function shufflePick(it, rnd) {
    var idx = [0, 1, 2];
    for (var i = 2; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return {
      q: it.q,
      o: idx.map(function (k) { return it.o[k]; }),
      a: idx.indexOf(it.a),
      w: it.w
    };
  }

  function drawQuiz(n, seed) {
    var rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    var cats = (QUIZ.cats || []).filter(function (c) { return c.items && c.items.length; });
    if (!cats.length) {
      /* 题库没加载上：退回兜底八题，塔照样能走 */
      return GATES.slice(0, n).map(function (g) {
        return { cat: g.name, q: g.q, o: g.opts, a: g.a, w: g.why };
      });
    }
    var pools = cats.map(function (c) {
      var a = c.items.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return { name: c.name, arr: a, i: 0 };
    });
    /* 类别顺序也打乱，否则第一道门永远是同一类 */
    for (var i = pools.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = pools[i]; pools[i] = pools[j]; pools[j] = t;
    }
    var out = [], guard = 0;
    while (out.length < n && guard++ < 600) {
      var any = false;
      for (var k = 0; k < pools.length && out.length < n; k++) {
        var p = pools[k];
        if (p.i >= p.arr.length) continue;
        var it = p.arr[p.i++];
        var q = shufflePick(it, rnd);
        q.cat = p.name;
        out.push(q);
        any = true;
      }
      if (!any) break;
    }
    return out;
  }

  /* ----------------------------------------------------------------------
     逮捕者
     ----------------------------------------------------------------------
     进塔 80 秒后入塔。速度 1.62，玩家 2.35 —— 大约是玩家的 69%。
     再慢就没有压力（玩家停下来答一道题，它追不上），再快就没有活路
     （窄走廊里无法绕开）。69% 意味着：只要你不停下来磨蹭，你永远甩得掉；
     但只要你连答错两道门、或者绕两次远路，它就会贴上来。
     比上一版（60 秒 / 83%）慢了一档 —— 因为现在迷宫更大、还要在八道门
     都开之后再横穿一次去找出口，留给玩家的余量必须补回来。

     它走格子中心，不做连续寻路 —— 走廊宽度只有一格，贴着中心走
     永远不会卡墙，也不会出现「卡在拐角抖动」这种一眼假的追兵。
     ---------------------------------------------------------------------- */
  var HUNT = {
    /* 80 秒入塔。玩家速度 2.35，它 1.62（约 69%）——
       上一版是 60 秒 / 1.95（83%），走廊里一旦被盯上基本没有翻盘余地。
       现在它仍然比玩家慢、比玩家笨，但你走错路照样会被追上：
       减速不等于没威胁，只是把「一次失误就死」改成「两次失误才死」。 */
    at: 80,            /* 入塔时间（秒，只算塔内时间，答题冻结） */
    speed: 1.62,
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
    /* 出口位置用「跟塔走」的种子，同一座塔重进是同一个出口。
       探针要能复现，玩家重进也不会觉得塔在耍他。 */
    exitRnd = mulberry32((SEED ^ 0x2545f491) >>> 0);
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
    /* 每次进塔重抽题。种子跟着塔走 —— 同一座塔重进是同一套题，
       换一座塔就是另一套。
       多抽一批备用题：答错时那道门不会作废，而是换一道新题重问，
       所以「八道全对」永远是可达到的，只是错一次掉一格可信度。 */
    st.quiz = drawQuiz(DOOR_N + 16, SEED);
    st.spare = st.quiz.splice(DOOR_N);
    st.tAcc = 0; st.running = true; st.done = false; st.pitch = 0;
    st.curDoor = null; st.inModal = false;
    resetHunt();
    $("#endBox").innerHTML = "";
    paintHud(); paintFrags();
    syncLockHint();
    sound.duck(false);
    msg("塔门在你身后关上。八道知识门同时开着，不分先后——" +
        "八道全部答对，出口才会在塔里某个地方亮起来。", "");
  }

  /* ----------------------------------------------------------------------
     出口点亮
     ----------------------------------------------------------------------
     八道门全部答对的那一刻，出口才出现，而且位置是随机的：
     从「离当前位置足够远」的可走格里抽一个。
     为什么不能固定在最远格：固定位置等于告诉玩家「一直往那边走」，
     而随机的出口意味着你必须先清完八道门，再重新规划路线 ——
     这也是逮捕者开始生效之后的第二段压力。
     ---------------------------------------------------------------------- */
  var exitRnd = mulberry32(1);

  function revealExit() {
    if (world.exit) return false;
    var b = bfs(world.g, Math.floor(st.px), Math.floor(st.py));
    var maxD = 0, i;
    for (i = 0; i < b.dist.length; i++) if (b.dist[i] > maxD) maxD = b.dist[i];
    var pool = [];
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var id = y * W + x;
        if (world.g[id] !== 0) continue;
        /* 至少要走掉一半路程 —— 门口亮出口等于白送 */
        if (b.dist[id] < Math.max(24, maxD * 0.55)) continue;
        pool.push({ x: x, y: y });
      }
    }
    if (!pool.length) pool = [world.far];
    var pick = pool[Math.floor(exitRnd() * pool.length)];
    world.exit = { x: pick.x, y: pick.y };
    world.g[pick.y * W + pick.x] = 3;
    var d = b.dist[pick.y * W + pick.x];
    msg("八道门全开。出口在塔的另一个方向亮起来了 —— 距离你 " +
        Math.round(d * 0.5) + " 米。别直着走，塔不是直的。", "good");
    return true;
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
      /* 步数上限必须覆盖「斜穿整张地图」：41×41 的对角是 57.4 格，
         DDA 每格最多走两步，所以要 115 步以上，取 1.5 倍余量 = 192。
         这条上限跟着地图尺寸走，改地图必须同步改它 ——
         走不到墙时 tile 停在初始值 1、dist 变成几十格，整面墙细成一条线，
         画面看起来就是「一片空」，而且不报任何错。 */
      while (guard++ < 192) {
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
    if (world.exit) items.push({ x: world.exit.x + 0.5, y: world.exit.y + 0.5, col: "#3ecf8e", ch: "◆" });
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
    /* 先铺大厅的底：它是唯一的「大块空地」，玩家靠它认路。
       41×41 缩进 150px 的小地图，每格只剩 3.6px，不铺这一层的话，
       几个大厅和普通走廊在缩略图里长得一模一样。 */
    world.halls.forEach(function (h) {
      mctx.fillStyle = "rgba(124,196,255,.13)";
      mctx.fillRect(h.x * S, h.y * S, h.w * S, h.h * S);
    });
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
    /* 视角放在这里消费，而不是在 mousemove 里直接改 ——
       这样一帧之内推了 300px 也是平滑地转过去，不会瞬间跳过去。 */
    consumeAim(dt);
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
    if (near) $("#prompt").textContent = "按 E 开启「" + gateOf(near.gate).cat + "」知识门";

    /* 出口：八道门全开之前它根本不存在 */
    if (world.exit) {
      var edx = world.exit.x + 0.5 - st.px, edy = world.exit.y + 0.5 - st.py;
      if (Math.hypot(edx, edy) < 0.6) { finish(); return; }
    }

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
    var n = Math.max(world ? world.doors.length : DOOR_N, st.quiz.length);
    for (var i = 0; i < n; i++) {
      var got = st.frags.indexOf(i) >= 0;
      var miss = st.answered[i] && !got;
      h += '<div class="mzf ' + (got ? "got" : (miss ? "miss" : "")) + '">' + (i + 1) + '</div>';
    }
    $("#frags").innerHTML = h;
    var ft = $("#fragTotal"); if (ft) ft.textContent = "/" + n;
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
  function gateOf(i) {
    return st.quiz[i] || { cat: "知识门", q: "题目缺失", o: ["—", "—", "—"], a: 0, w: "" };
  }
  /* 把题面画进模态框。答错换题时也走这里 ——
     之前整段逻辑塞在 openGate 里，换题就得复制一遍，迟早不一致。 */
  function renderQ(d) {
    var g = gateOf(d.gate);
    curQ = { door: d, gate: g, retry: false };
    st.inModal = true;
    $("#qNo").textContent = "GATE " + ("0" + (d.gate + 1)).slice(-2) +
      " · 已开 " + st.frags.length + "/" + DOOR_N;
    $("#qTtl").textContent = g.cat;
    $("#qText").textContent = g.q;
    $("#qOpts").innerHTML = g.o.map(function (o, i) {
      return '<button class="mzo" data-i="' + i + '"><span class="k">' + String.fromCharCode(65 + i) + '</span><span>' + o + '</span></button>';
    }).join("");
    $("#qWhy").className = "mzwhy";
    $("#qWhy").textContent = "";
    $("#qGo").disabled = true;
    $("#qGo").textContent = "继续探索";
    $("#qHint").textContent = "选一个答案。";
    $("#modal").classList.add("on");
  }
  function openGate(d) {
    /* 答题必须放开鼠标：指针锁着的时候点不到选项。
       时间也在这里停 —— 塔不动，它也不动。 */
    unlock();
    sound.duck(true);
    renderQ(d);
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
      $("#qHint").textContent = "第 " + st.frags.length + " / " + DOOR_N + " 道门开了。";
      $("#qGo").textContent = "开门，继续";
    } else {
      /* 答错不再「门照样开、只是没碎片」—— 那样八道门里错一道就永远凑不齐，
         玩家会当场算出来自己已经输了，然后乱走。现在改成：
         这道门不开，换一道新题重问，代价是掉一格可信度。
         「八道全对」始终可达，但错一次是真的要付钱。 */
      st.life--;
      paintHud();
      curQ.retry = true;
      $("#qWhy").className = "mzwhy on";
      $("#qWhy").innerHTML = "<b style='color:#ff5e6c'>不对。</b>" + g.why;
      if (st.life <= 0) {
        $("#qHint").textContent = "可信度耗尽。塔把你弹了出去。";
        $("#qGo").textContent = "离开指标塔";
      } else {
        $("#qHint").textContent = "这道门不为你开。换一道题再试 —— 可信度 -1（剩 " + st.life + " / 3）。";
        $("#qGo").textContent = "换一道题再试";
      }
    }
    $("#qGo").disabled = false;
  });

  $("#qGo").addEventListener("click", function () {
    if (!curQ) return;
    /* 答错且还有可信度：换一道备用题重问同一道门 */
    if (curQ.retry) {
      if (st.life <= 0) {
        $("#modal").classList.remove("on");
        st.inModal = false; curQ = null;
        lose();
        return;
      }
      var door = curQ.door;
      var nq = st.spare.shift();
      if (nq) st.quiz[door.gate] = nq;
      renderQ(door);
      return;
    }
    curQ.door.open = true;
    world.g[curQ.door.y * W + curQ.door.x] = 0;
    $("#modal").classList.remove("on");
    st.inModal = false;
    sound.duck(false);
    curQ = null;
    keys = {};
    /* 八道全开 → 出口随机点亮。这一刻之后才是真正的「找出口」段落。 */
    var opened = world.doors.filter(function (d) { return d.open; }).length;
    if (opened >= world.doors.length) {
      revealExit();
    } else {
      msg("门开了（" + opened + " / " + world.doors.length + "）。左边是走廊，右边也是走廊——塔不打算让你记住方向。", "");
    }
    /* 这一下点击本身就是手势，可以合法地把指针重新锁回去 */
    lockNow();
  });

  /* ======================================================================
     9. 结束
     ====================================================================== */
  function elapsed() { return Math.round(st.tAcc); }

  function unlock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
    if (typeof AIM !== "undefined") { AIM.pendX = 0; AIM.pendY = 0; }
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
      '<div class="sc"><span>碎片<b>' + st.frags.length + ' / ' + world.doors.length + '</b></span>' +
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
      '<div class="sc"><span>答对<b>' + st.frags.length + ' / ' + world.doors.length + '</b></span>' +
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
    var total = Math.max(world.doors.length, st.quiz.length);
    var win = n >= PASS_N;
    var H2 = [];
    H2.push('<div class="box' + (win ? " win" : "") + '">');
    H2.push('<h3>' + (win ? "走出指标塔 · 精英证书已签发" : "抵达出口 · 但挑战失败") + '</h3>');
    H2.push('<p>' + (win
      ? "你在 " + el + " 秒内答对全部 " + n + " 道知识门，并在出口亮起之后重新找到了它。" +
        "这座塔的八道门各锁着一个判据——你不是靠运气绕过去的，是靠认出哪一句话在偷换「测量」和「目标」。"
      : "你走到了出口，但只答对 " + n + " 道（门槛 " + PASS_N + " 道）。<b>出口不为你开：走通一座塔，和证明你懂这座塔，是两件事。</b>没被逮捕只说明你跑得够快，不说明你答得对。") + '</p>');
    H2.push('<div class="sc"><span>答对<b>' + n + ' / ' + total + '</b></span>' +
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
            "穿过 41 × 41 的指标塔，答对 " + n + " / " + total + " 道知识门（八道门全部答对，出口才出现）",
            "八道门从八个判据题库中随机抽取：代理指标 / 古德哈特 / 刷分 / 偏移 / 聚合 / 阈值 / 相关 / 可优化性",
            "可信度剩余 " + st.life + " / 3 · 用时 " + el + " 秒",
            "未踩满三次刷分陷阱，未被逮捕者追上"
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
    if (k === "p") { toggleAim(); e.preventDefault(); return; }
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

  /* ----------------------------------------------------------------------
     鼠标视角：按 FPS 的做法重写
     ----------------------------------------------------------------------
     上一版只有一行 `st.ang += movementX * 0.0023`。它有三个真实问题：

     1. **锁定那一帧会甩飞。** 浏览器在 pointer lock 刚生效时，会把「鼠标从
        页面某处跳到画面中心」这段距离当成一次位移报出来，几百像素。
        乘 0.0023 就是小半圈。用户的第一反应就是「太灵敏」。
        FPS 的通行做法是给单帧位移设上限，这里叫 MAX_STEP。
     2. **微调不是不动就是过头。** movementX 是整数，1px 对应 0.0016rad
        （约 0.09°）。想转 1° 必须精确推 11px，手不可能那么准。
        做法是亚像素累积：把不足一格的量留在 pending 里，下一帧接着算。
     3. **手抖被原样放大。** ±1px 的抖动变成视线抖动，看久了晕。
        做法是一级低通（smooth），把高频抖掉，代价是 20–40ms 延迟。
        延迟和抖动是同一根滑杆的两端，所以它做成可调的，不是写死。
     ---------------------------------------------------------------------- */
  var AIM_KEY = "yc.aim.v1";
  var AIM = {
    sens: 1.00,        /* 倍率 0.3 – 3.0 */
    base: 0.0016,      /* 1.0 倍时每像素多少弧度 */
    pitchK: 0.62,      /* 俯仰比水平慢，否则上下晃得厉害 */
    smooth: 0.35,      /* 0 = 原始直出，越大越顺滑 */
    invertY: false,
    pendX: 0, pendY: 0
  };
  try {
    var savedAim = JSON.parse(localStorage.getItem(AIM_KEY) || "null");
    if (savedAim && typeof savedAim === "object") {
      if (typeof savedAim.sens === "number") AIM.sens = clamp(savedAim.sens, 0.3, 3);
      if (typeof savedAim.smooth === "number") AIM.smooth = clamp(savedAim.smooth, 0, 0.9);
      if (typeof savedAim.invertY === "boolean") AIM.invertY = savedAim.invertY;
    }
  } catch (e) { }
  function saveAim() {
    try {
      localStorage.setItem(AIM_KEY, JSON.stringify({
        sens: AIM.sens, smooth: AIM.smooth, invertY: AIM.invertY
      }));
    } catch (e) { }
  }

  var MAX_STEP = 130;   /* 单帧最多认 130px，多出来的直接丢掉 */

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
    /* 锁定/解锁的瞬间丢掉残留，否则解锁前攒下的那点位移
       会在重新锁上时一次性倒出来，像被人推了一把。 */
    AIM.pendX = AIM.pendY = 0;
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
    var mx = clamp(e.movementX || 0, -MAX_STEP, MAX_STEP);
    var my = clamp(e.movementY || 0, -MAX_STEP, MAX_STEP);
    AIM.pendX += mx * AIM.base * AIM.sens;
    /* 默认（非反转）：鼠标往上推 = 抬头。movementY 上推是负数，
       所以这里乘 -1，pitch 才会变大。 */
    AIM.pendY += my * AIM.base * AIM.sens * AIM.pitchK * (AIM.invertY ? 1 : -1);
  });

  /* 每帧把累积量的一部分交给视角。smooth=0 时一次交清（等同原始）；
     越大，留到下一帧的比例越高 —— 这就是低通，代价是手感变「绵」。 */
  function consumeAim(dt) {
    if (!AIM.pendX && !AIM.pendY) return;
    var k = AIM.smooth > 0 ? 1 - Math.pow(AIM.smooth, dt * 60) : 1;
    var ax = AIM.pendX * k, ay = AIM.pendY * k;
    AIM.pendX -= ax; AIM.pendY -= ay;
    st.ang += ax;
    st.pitch = clamp(st.pitch + ay, -0.26, 0.26);
    if (Math.abs(AIM.pendX) < 1e-6) AIM.pendX = 0;
    if (Math.abs(AIM.pendY) < 1e-6) AIM.pendY = 0;
  }

  /* ---- 视角设置面板 ---- */
  function aimCmLoop() {
    /* 360° 需要多少厘米。按 800 DPI 估（1cm ≈ 315px），只作参照。 */
    var px = (Math.PI * 2) / (AIM.base * AIM.sens);
    return Math.round(px / 315 * 10) / 10;
  }
  function paintAim() {
    var s = $("#aimSens"), sm = $("#aimSmooth"), cm = $("#aimCm"), iv = $("#aimInv");
    if (s) s.value = String(AIM.sens);
    if (sm) sm.value = String(AIM.smooth);
    if (cm) cm.textContent = aimCmLoop() + " cm";
    if (iv) iv.checked = AIM.invertY;
    var sv = $("#aimSensV"); if (sv) sv.textContent = AIM.sens.toFixed(2) + "×";
    var smv = $("#aimSmoothV"); if (smv) smv.textContent = AIM.smooth === 0 ? "关" : Math.round(AIM.smooth * 100) + "%";
  }
  function toggleAim(on) {
    var p = $("#aimPanel");
    if (!p) return;
    p.classList.toggle("on", on === undefined ? !p.classList.contains("on") : !!on);
    paintAim();
  }
  (function bindAim() {
    var s = $("#aimSens"), sm = $("#aimSmooth"), iv = $("#aimInv");
    if (s) s.addEventListener("input", function () { AIM.sens = clamp(+s.value, 0.3, 3); saveAim(); paintAim(); });
    if (sm) sm.addEventListener("input", function () { AIM.smooth = clamp(+sm.value, 0, 0.9); saveAim(); paintAim(); });
    if (iv) iv.addEventListener("change", function () { AIM.invertY = !!iv.checked; saveAim(); paintAim(); });
    var b = $("#btnAim"); if (b) b.addEventListener("click", function () { toggleAim(); });
    var c = $("#aimClose"); if (c) c.addEventListener("click", function () { toggleAim(false); });
    var r = $("#aimReset");
    if (r) r.addEventListener("click", function () {
      AIM.sens = 1; AIM.smooth = 0.35; AIM.invertY = false;
      saveAim(); paintAim();
    });
    paintAim();
  })();

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
        /* 题库规模与通关门槛：线上体检要能一眼看出「题池是不是真的几百道」、
           「门槛是不是真的八道全过」，而不是只信任本地脚本。 */
        quizPool: (QUIZ.cats || []).reduce(function (a, c) { return a + (c.items || []).length; }, 0),
        quizThisRun: st.quiz.length,
        passNeed: PASS_N,
        /* 出口：八道门全开之前是 null。exitSteps 是「从当前位置走到出口要几步」，
           用来验「出口真的在远处」而不是贴在脚边。 */
        exitReady: !!world.exit,
        exitSteps: (function () {
          if (!world.exit) return -1;
          var eb = bfs(world.g, Math.floor(st.px), Math.floor(st.py));
          return eb.dist[world.exit.y * W + world.exit.x];
        })(),
        huntAt: HUNT.at,
        huntSpeed: HUNT.speed,
        /* 八道门离出生点有多远 / 各在哪个方位扇区 ——
           用来验「门是不是散在四面八方」，而不是全挤在一片。 */
        doorSectors: world.doors.map(function (d) { return sectorOf(Math.atan2(d.y - (H - 1) / 2, d.x - (W - 1) / 2)); }),
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
        locked: locked,
        /* 站在哪道门前。探针要判断「按 E 没反应」到底是没走到门边，
           还是走到了但开门逻辑坏了 —— 这两个原因长得一模一样。 */
        curDoor: st.curDoor ? st.curDoor.gate : -1,
        inModal: st.inModal,
        promptOn: !!($("#prompt") && $("#prompt").classList.contains("on"))
      };
    },
    /* 把塔内时钟往前推 —— 和「等这么久」等价，只是快。
       体检要用它验「80 秒后入塔」，不然每跑一次要真等一分二十秒。 */
    fastForward: function (sec) { st.tAcc += Math.max(0, +sec || 0); return st.tAcc; },
    gotoDoor: function (i) {
      var d = world.doors[i];
      if (!d) return false;
      var nb = [[0, 1], [0, -1], [1, 0], [-1, 0]], fallback = null;
      for (var k = 0; k < nb.length; k++) {
        var nx = d.x + nb[k][0], ny = d.y + nb[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (world.g[ny * W + nx] !== 0) continue;
        /* 别把玩家瞬移到陷阱格上：那会白扣一格可信度，
           探针读到的 life 就跟「答错扣一格」混在一起，分不清是谁扣的。 */
        var trapped = world.traps.some(function (tp) { return tp.x === nx && tp.y === ny && !tp.hit; });
        if (trapped) { if (!fallback) fallback = [nx, ny]; continue; }
        fallback = [nx, ny]; break;
      }
      if (!fallback) return false;
      st.px = fallback[0] + 0.5; st.py = fallback[1] + 0.5;
      st.ang = Math.atan2((d.y + 0.5) - st.py, (d.x + 0.5) - st.px);
      /* curDoor 平时是主循环每帧算的。无头环境下 requestAnimationFrame 会
         间歇性停摆，于是「站在门前」和「按 E 有反应」之间会断掉 ——
         探针就会报「按 E 没反应」，其实只是那一帧没跑。
         定位这件事本身是确定的，直接在这里给出结论。 */
      st.curDoor = d;
      return true;
    },
    /* 体检用：手动推一帧。无头环境的 rAF 不可靠，
       要测「走位 → 每帧更新」这类逻辑，就由探针自己喂帧。
       silent = 只跑逻辑不重绘：模拟一两分钟追捕时能省掉上千次渲染。 */
    tick: function (dt, silent) {
      var d = clamp(+dt || 1 / 60, 0.001, 0.05);
      step(d);
      if (!silent) { render(); drawMini(); }
      return Math.round(st.tAcc * 100) / 100;
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
    /* 体检用：转视角。截图时用来避开「正对着一扇门」这种满屏单色的机位。 */
    look: function (rad) {
      st.ang += (+rad || 0);
      AIM.pendX = AIM.pendY = 0;
      return st.ang;
    },
    setPitch: function (v) { st.pitch = clamp(+v || 0, -0.26, 0.26); return st.pitch; },
    answerOf: function (i) { return gateOf(i).a; },
    gateCount: function () { return st.quiz.length; },
    quizCats: function () { return st.quiz.map(function (q) { return q.cat; }); },
    quizHash: function () {
      /* 用来验「换一座塔就换一套题」：题目文本的简易指纹 */
      var s = st.quiz.map(function (q) { return q.q; }).join("|"), h = 0;
      for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
      return h;
    },
    aim: function () {
      return {
        sens: AIM.sens, smooth: AIM.smooth, invertY: AIM.invertY,
        pend: [AIM.pendX, AIM.pendY], pitch: st.pitch, cm360: aimCmLoop(),
        maxStep: MAX_STEP
      };
    },
    setAim: function (o) {
      if (o && typeof o.sens === "number") AIM.sens = clamp(o.sens, 0.3, 3);
      if (o && typeof o.smooth === "number") AIM.smooth = clamp(o.smooth, 0, 0.9);
      if (o && typeof o.invertY === "boolean") AIM.invertY = o.invertY;
      /* 改设置时把没消费完的位移清掉。不清的话，拖完滑块
         视角会突然被之前攒下的那点位移推一下，像被人碰了手腕。 */
      AIM.pendX = 0; AIM.pendY = 0;
      saveAim(); paintAim();
      return window.YCMaze.aim();
    },
    /* 体检用：直接喂一段鼠标位移，等价于真的推了一下鼠标 */
    feedMouse: function (dx, dy) {
      var mx = clamp(dx || 0, -MAX_STEP, MAX_STEP);
      var my = clamp(dy || 0, -MAX_STEP, MAX_STEP);
      AIM.pendX += mx * AIM.base * AIM.sens;
      AIM.pendY += my * AIM.base * AIM.sens * AIM.pitchK * (AIM.invertY ? 1 : -1);
      return [AIM.pendX, AIM.pendY];
    },
    world: function () {
      return {
        grid: W + "x" + H, doors: world.doors.length, traps: world.traps.length,
        halls: world.halls.length, pathLen: world.path.length,
        walkable: world.g.filter(function (v) { return v === 0; }).length
      };
    },
    /* 体检用：站到出口格上。出口还没亮就先点亮，探针不该因为
       「还没开完八门」而空指针；但这条路径不构成通关捷径 ——
       finish() 仍然要求 frags >= PASS_N，八门没开完走过去也拿不到证书。 */
    gotoExit: function () {
      if (!world.exit) revealExit();
      if (!world.exit) return false;
      st.px = world.exit.x + 0.5;
      st.py = world.exit.y + 0.5;
      return true;
    },
    /* 体检用：换一座塔（换种子）。用来验「换塔换门位、换塔换出口」。 */
    newTower: function (seed) { reset(+seed || undefined); return SEED; },
    /* 体检用：读八道门的坐标与所在扇区，验「八门分散在八个方向」。 */
    doorList: function () {
      return world.doors.map(function (d) {
        return {
          x: d.x, y: d.y, gate: d.gate, open: d.open,
          sector: sectorOf(Math.atan2(d.y - (H - 1) / 2, d.x - (W - 1) / 2))
        };
      });
    },
    /* 体检用：读当前门上的题干，验「题目本身不为空、不是同一道」。 */
    quizText: function (i) { return (st.quiz[i] || {}).q || ""; },
    /* 体检用：把八道门直接打开（不答题），用来验「出口是否随机出现」 */
    forceAllGates: function () {
      world.doors.forEach(function (d) { d.open = true; world.g[d.y * W + d.x] = 0; });
      st.frags = world.doors.map(function (d) { return d.gate; });
      paintFrags(); paintHud();
      return revealExit();
    },
    exitInfo: function () {
      if (!world.exit) return null;
      var b = bfs(world.g, Math.floor(st.px), Math.floor(st.py));
      return {
        x: world.exit.x, y: world.exit.y,
        steps: b.dist[world.exit.y * W + world.exit.x]
      };
    }
  };
})();

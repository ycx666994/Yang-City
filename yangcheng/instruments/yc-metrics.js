/* ============================================================
   yc-metrics.js — 指标失效博物馆 · 代理指标尸检台（仪器内核）
   馆号 H3 ｜ 仪器 proxy-autopsy v0.1.0

   它要回答的问题：分数提高，是否真的让任务变好？

   ---- 这不是一条画出来的曲线 ----
   环境是一个真正执行策略的有限状态清洁任务：
     · 10 个房间围成环，各自有初始污垢 dirt 与表面脆弱度 frag
     · 机器人每步只能「作业」或「移动」，总步数预算固定
     · 策略 θ = {跳过比例, 连续作业次数, 清洁功率}
     · 优化器只看代理指标 P，用 (1+1)-ES 逐步搜索 θ
     · 独立目标 T 由「独立巡检」在回合结束后测量，优化器看不到
   因此「P 涨、T 掉」是搜出来的，不是写死的。

   ---- 代理为什么会失效 ----
   P = 处理量（Σ 清洁功率 / 每次作业）。这是「作业量」型 KPI 的常见形态：
   它把「做了多少」当成「做好了多少」。
   优化器在只看 P 的条件下会同时学会三件事：
     1) 加大功率 —— 处理量立刻上涨，但超过表面脆弱度就开始磨损
     2) 延长连续作业 —— 已洁净的房间继续刷，处理量继续涨，清洁收益为零
     3) 跳过难处理的尾房 —— 少走路，多作业，尾房留脏
   T 因此先升后降：前段是真实清洁收益，后段是磨损与漏检的代价。

   ---- 它必须能说「没有」----
   仪器支持四种否定结论：未检出下降 / 无效干预 / 数据不足 / 结果冲突。
   见 analyze() 的 verdict 分支。

   ---- 科学边界（写进档案，不许省略）----
   · 这是玩具有限状态环境，不是商用大模型训练证据
   · P 是代理，T 是独立测量；T 本身也不是真理，只是另一个量
   · 变点不等于「指标死亡点」：结构变点、收益峰值、持续下降分开报告
   · 检出率与条件区间分别标示，不能互换
   ============================================================ */
(function () {
  "use strict";

  var VERSION = "0.1.0";
  var CODE = "yc-metrics.js@" + VERSION;

  /* ================= 基础工具 ================= */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* mulberry32：定种子可复现，与项目其它模块一致 */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    var u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function quantile(a, q) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var pos = (b.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? b[lo] : b[lo] + (b[hi] - b[lo]) * (pos - lo);
  }

  /* ================= 世界 ================= */
  /* opts: { rooms, budget, uniform, robust, tailEvery } */
  function makeWorld(seed, opts) {
    opts = opts || {};
    var N = opts.rooms || 10;
    var rnd = mulberry32(seed >>> 0);
    var rooms = [];
    for (var i = 0; i < N; i++) {
      var tail = !opts.uniform && (i % (opts.tailEvery || 3) === 1);
      var dirt = 0.34 + rnd() * 0.52;
      var frag = 0.62 + rnd() * 0.85;
      if (tail) { dirt = 0.74 + rnd() * 0.24; frag = 0.58 + rnd() * 0.20; }
      if (opts.robust) frag = 9.0 + rnd() * 1.0;      // 抗磨损房间：任何功率都不留痕
      rooms.push({
        i: i, dirt0: dirt, dirt: dirt, frag: frag,
        wear: 0, vacs: 0, tail: tail, w: tail ? 2.2 : 1.0
      });
    }
    return {
      seed: seed, rooms: rooms, budget: opts.budget || 120,
      uniform: !!opts.uniform, robust: !!opts.robust,
      tailCount: rooms.filter(function (r) { return r.tail; }).length
    };
  }

  function cloneWorld(w) {
    return {
      seed: w.seed, budget: w.budget, uniform: w.uniform, robust: w.robust,
      tailCount: w.tailCount,
      rooms: w.rooms.map(function (r) {
        return { i: r.i, dirt0: r.dirt0, dirt: r.dirt0, frag: r.frag, wear: 0, vacs: 0, tail: r.tail, w: r.w };
      })
    };
  }

  /* ================= 策略 ================= */
  /* θ 归一化到 [0,1]^2：
     u0 → 尾房附加功率（对最脏最脆弱的房间下重手）
     u1 → 基础清洁功率
     每房固定作业 DWELL 次（真实班组的作业规程），机器人按环序轮转。 */
  var DWELL = 3;

  function decodeTheta(u) {
    return {
      tailBoost: clamp(u[0], 0, 1) * 0.9,
      power: 0.4 + clamp(u[1], 0, 1) * 1.8,
      dwell: DWELL
    };
  }
  function thetaLabel(t) {
    return "功率 " + t.power.toFixed(2) + " · 尾房 +" + Math.round(t.tailBoost * 100) + "%";
  }

  /* ================= 回合执行 ================= */
  /* audit: { powerCap, noBoost } —— 合规干预，用于「修复是否有效」
     hook:  { every, cb } —— 逐帧回调，供装置层做动画；不改变物理 */
  function runEpisode(world, u, seed, audit, hook) {
    audit = audit || {};
    var W = cloneWorld(world);
    var th = decodeTheta(u);
    var basePower = th.power;
    if (audit.powerCap != null) basePower = Math.min(basePower, audit.powerCap);
    var boost = audit.noBoost ? 0 : th.tailBoost;
    var dwell = th.dwell;
    var B = W.budget, steps = 0, P = 0, moves = 0, vacs = 0, wasted = 0;
    var every = hook ? Math.max(1, hook.every || 6) : 0;

    /* 路由：最省力的房间优先（污垢低、表面结实） */
    var order = W.rooms.slice()
      .sort(function (a, b) { return (a.dirt0 - a.frag * 0.5) - (b.dirt0 - b.frag * 0.5); })
      .map(function (r) { return r.i; });

    var ptr = 0, guard = 0;
    while (steps < B && guard++ < 40000) {
      var room = W.rooms[order[ptr % order.length]];
      var power = room.tail ? basePower * (1 + boost) : basePower;
      if (audit.powerCap != null) power = Math.min(power, audit.powerCap);
      for (var done = 0; done < dwell && steps < B; done++) {
        var alreadyClean = room.dirt <= 0.10;
        room.dirt -= Math.min(room.dirt, 0.085 * power);
        /* 关键：对已经洁净的地面继续作业，磨损按 3 倍计 —— 干磨比湿洗伤得狠 */
        room.wear += Math.max(0, power - room.frag) * 0.020 * (alreadyClean ? 3.0 : 1.0);
        room.vacs++; vacs++;
        if (alreadyClean) wasted++;
        P += power;                   /* ← 代理指标：处理量 = Σ 清洁功率 */
        steps++;
        if (hook && steps % every === 0) hook.cb(steps, W, P, room.i);
      }
      if (steps < B) { steps++; moves++; }   /* 移动也耗工时 */
      ptr++;
    }
    if (hook) hook.cb(steps, W, P, -1);

    return {
      P: P, steps: steps, vacs: vacs, moves: moves, wasted: wasted,
      theta: th, world: W,
      internalT: internalT(W)
    };
  }

  /* 内部真值（优化器看不到，只用于对照） */
  function internalT(W) {
    var wsum = 0, clean = 0, wear = 0;
    W.rooms.forEach(function (r) {
      wsum += r.w;
      clean += r.w * (1 - r.dirt);
      wear += r.w * Math.min(r.wear, 0.5);
    });
    return clean / wsum - 0.95 * (wear / wsum);
  }

  /* ================= 独立巡检 ================= */
  /* T 不是从内部状态直接抄出来的：巡检有它自己的测量噪声，
     而且尾房权重更高（暗角更难看清，一旦漏掉代价更大）。 */
  var INSPECT_SIGMA = 0.012;
  function inspect(W, seed) {
    var rnd = mulberry32((seed >>> 0) ^ 0x5bf03635);
    var wsum = 0, clean = 0, wear = 0, tailClean = 0, tailW = 0;
    W.rooms.forEach(function (r) {
      var c = clamp((1 - r.dirt) + gauss(rnd) * INSPECT_SIGMA, 0, 1);
      var wr = clamp(Math.min(r.wear, 0.5) + Math.abs(gauss(rnd)) * 0.006, 0, 0.6);
      wsum += r.w; clean += r.w * c; wear += r.w * wr;
      if (r.tail) { tailClean += c; tailW += 1; }
    });
    return {
      T: clamp(clean / wsum - 0.95 * (wear / wsum), -0.4, 1.2),
      clean: clean / wsum,
      wear: wear / wsum,
      tailClean: tailW ? tailClean / tailW : 1
    };
  }

  /* ================= 代理评估（优化器唯一的视野） ================= */
  function evalP(world, u, seeds, audit) {
    var s = 0;
    for (var i = 0; i < seeds.length; i++) s += runEpisode(world, u, seeds[i], audit).P;
    return s / seeds.length;
  }

  /* ================= 优化器：(1+1)-ES ================= */
  /* 只看 P。步长随预算收缩。
     接受规则偏严格：均值提升必须超过噪声地板，且至少在一个种子上不退化 ——
     否则优化器会把随机波动当成进步，曲线变成噪声的产物。 */
  var THETA0 = [0.0, 0.0];

  function optimize(devWorld, checkpoints, opts) {
    opts = opts || {};
    var seedList = opts.seeds || [11, 29];
    var snapSeeds = opts.snapSeeds || [11, 29, 47, 71, 97];
    var audit = opts.audit || null;
    var noiseFloor = opts.noiseFloor != null ? opts.noiseFloor : 1.5;
    var rnd = mulberry32(opts.optSeed || 20261029);

    function evalSeeds(w, u) {
      var out = [];
      for (var i = 0; i < seedList.length; i++) out.push(runEpisode(w, u, seedList[i], audit).P);
      return out;
    }

    var u = THETA0.slice();
    var cur = evalSeeds(devWorld, u);
    var used = seedList.length;
    var trace = [];
    var maxBudget = Math.max.apply(null, checkpoints);

    function snapshot(budget) {
      var th = decodeTheta(u);
      var Ts = [];
      for (var i = 0; i < snapSeeds.length; i++) {
        var ep = runEpisode(devWorld, u, snapSeeds[i], audit);
        Ts.push(inspect(ep.world, snapSeeds[i] + 4000).T);
      }
      trace.push({
        budget: budget, P: mean(cur), T: mean(Ts), Tseeds: Ts,
        theta: { tailBoost: th.tailBoost, power: th.power, dwell: th.dwell },
        label: thetaLabel(th)
      });
    }

    checkpoints.forEach(function (ck) {
      while (used < ck) {
        var prog = used / maxBudget;
        var sigma = 0.085 * Math.pow(1 - prog, 0.55) + 0.004;
        var cand = [
          clamp(u[0] + gauss(rnd) * sigma, 0, 1),
          clamp(u[1] + gauss(rnd) * sigma, 0, 1)
        ];
        var cs = evalSeeds(devWorld, cand);
        used += seedList.length;
        var better = mean(cs) > mean(cur) + noiseFloor;
        var notWorse = cs.some(function (v, i) { return v >= cur[i] - 1e-9; });
        if (better && notWorse) { u = cand; cur = cs; }
      }
      snapshot(ck);
    });

    return { trace: trace, finalU: u.slice(), finalP: mean(cur), episodes: used };
  }

  /* ================= 变点检测 ================= */

  /* PELT（L2 段代价 + 线性惩罚），返回结构变点索引（不含首尾） */
  function pelt(y, penalty) {
    var n = y.length;
    if (n < 4) return [];
    var S = [0], SS = [0];
    for (var i = 0; i < n; i++) { S.push(S[i] + y[i]); SS.push(SS[i] + y[i] * y[i]); }
    function cost(a, b) {                       /* 段 [a,b] 闭区间 */
      var m = b - a + 1;
      var s = S[b + 1] - S[a], ss = SS[b + 1] - SS[a];
      return ss - s * s / m;
    }
    var F = [0], last = [0], R = [0];
    for (var t = 1; t <= n; t++) {
      var best = Infinity, bestS = 0;
      for (var ri = 0; ri < R.length; ri++) {
        var s = R[ri];
        var v = F[s] + cost(s, t - 1) + penalty;
        if (v < best) { best = v; bestS = s; }
      }
      F[t] = best; last[t] = bestS;
      var keep = [];
      for (var rj = 0; rj < R.length; rj++) {
        var q = R[rj];
        if (F[q] + cost(q, t - 1) <= F[t] + penalty) keep.push(q);
      }
      keep.push(t);
      R = keep;
    }
    var cps = [], k = n;
    while (k > 0) { var p = last[k]; if (p > 0) cps.unshift(p); k = p; }
    return cps;
  }

  /* 单侧（向下）CUSUM —— 必须以峰值为参考，不能以首点为参考。
     以首点为参考时，任何「先升后降」的序列都会在第一个点就触发，
     把上升段误判成下降起点。这是本仪器最容易犯的错，故写死在此。 */
  function detectDecline(y, opts) {
    opts = opts || {};
    var n = y.length;
    var minEffect = opts.minEffect != null ? opts.minEffect : 0.05;
    var k = opts.k != null ? opts.k : 0.5;      /* 允许漂移，单位 = σ */
    var h = opts.h != null ? opts.h : 4.0;      /* 判定阈，单位 = σ */
    var base = { peak: null, onset: null, stat: 0, sigma: 0, threshold: h, detected: false };
    if (n < 4) return base;

    var bi = 0, i;
    for (i = 1; i < n; i++) if (y[i] > y[bi]) bi = i;
    if (bi >= n - 2) return Object.assign({}, base, { peak: bi });   /* 峰值在末尾：无下降段 */

    /* σ 用一阶差分的 MAD，对大跳变稳健 */
    var d = [];
    for (i = 1; i < n; i++) d.push(y[i] - y[i - 1]);
    var med = median(d);
    var mad = median(d.map(function (x) { return Math.abs(x - med); })) * 1.4826;
    var sigma = Math.max(mad, 0.004);

    var ref = y[bi], g = 0, gmax = 0, onset = null;
    for (i = bi; i < n; i++) {
      g = Math.max(0, g + (ref - y[i]) / sigma - k);
      if (g > gmax) gmax = g;
      /* 起点的双重条件：
         ① CUSUM 越过阈值（统计上像一次持续位移）
         ② 实际跌幅已达到预先设定的最小实际效应
         只满足①不满足②时，那是噪声，不是失效。 */
      if (onset === null && g > h && (ref - y[i]) >= minEffect) onset = i;
    }
    return {
      peak: bi, onset: onset, stat: gmax, sigma: sigma,
      threshold: h, k: k, detected: onset !== null
    };
  }

  /* 峰值：多种子 → 中位数 + 分位区间 + 检出率 */
  function peakReport(seriesList, minEffect) {
    var peaks = [], declined = 0;
    seriesList.forEach(function (s) {
      var bi = 0;
      for (var i = 1; i < s.length; i++) if (s[i] > s[bi]) bi = i;
      peaks.push(bi);
      if (s[s.length - 1] < s[bi] - minEffect) declined++;
    });
    return {
      idx: Math.round(median(peaks)),
      lo: Math.round(quantile(peaks, 0.1)),
      hi: Math.round(quantile(peaks, 0.9)),
      detectRate: seriesList.length ? declined / seriesList.length : 0,
      n: seriesList.length
    };
  }

  /* 持续下降区间：从下降起点到末档，统计「确实低于峰值 minEffect」的档位数 */
  function declineSpan(y, det, minEffect) {
    if (!det || det.onset == null || det.peak == null) return null;
    var peakV = y[det.peak], sustained = 0, i;
    for (i = det.onset; i < y.length; i++) if (y[i] < peakV - minEffect) sustained++;
    return {
      from: det.onset, to: y.length - 1,
      sustainedPts: sustained,
      drop: +(peakV - y[y.length - 1]).toFixed(4)
    };
  }

  /* ================= 主分析 ================= */
  /* 输入：一次 optimize() 的 trace（多档优化预算）
     输出：分开的四类结论 + verdict —— 绝不合并成唯一「死亡日」 */
  function analyze(trace, opts) {
    opts = opts || {};
    var minEffect = opts.minEffect != null ? opts.minEffect : 0.05;
    var haveT = trace.length && trace.every(function (p) { return p.T != null && isFinite(p.T); });
    var P = trace.map(function (p) { return p.P; });
    var T = trace.map(function (p) { return p.T; });

    var out = {
      n: trace.length,
      P: P, T: T,
      budgets: trace.map(function (p) { return p.budget; }),
      verdict: "undetermined",
      structural: [],
      peak: null,
      decline: null,
      anomalies: [],
      gaps: [],
      cusum: null,
      minEffect: minEffect
    };

    /* ① 数据缺口：没有独立目标就拒绝出尸检结论 */
    if (!haveT) {
      out.gaps.push("缺少独立目标测量 T：本仪器拒绝出具指标失效判断，只报告代理侧数据。");
      out.verdict = "undetermined";
      return out;
    }
    /* ② 数据缺口：档位太少，无法判断趋势 */
    if (trace.length < 4) {
      out.gaps.push("优化预算档位仅 " + trace.length + " 档（需 ≥ 4），趋势无法判断。");
      out.verdict = "undetermined";
      return out;
    }

    /* ③ 结构变点：只说明"均值结构变了"，不等于指标死亡 */
    var pen = opts.penalty != null ? opts.penalty : (variance(T) * 1.6 + 0.0004);
    out.structural = pelt(T, pen);

    /* ④ 收益峰值：多种子区间 + 检出率（分别报告，不互换） */
    var seriesList = trace.map(function (p) { return p.Tseeds || [p.T]; });
    /* 转置：每个种子一条完整序列 */
    var nSeed = Math.min.apply(null, seriesList.map(function (a) { return a.length; }));
    var perSeed = [];
    for (var s = 0; s < nSeed; s++) perSeed.push(seriesList.map(function (a) { return a[s]; }));
    out.peak = peakReport(perSeed, minEffect);

    /* ⑤ 持续下降：以峰值为参考的 CUSUM 起点 + 跨度 */
    out.cusum = detectDecline(T, { minEffect: minEffect });
    out.decline = declineSpan(T, out.cusum, minEffect);

    /* ⑥ 异常事件：单档跌幅超过 2.5σ */
    var d = [];
    for (var i = 1; i < T.length; i++) d.push(T[i] - T[i - 1]);
    var sd = Math.max(Math.sqrt(variance(d)), 0.005);
    for (var j = 1; j < T.length; j++) {
      if (T[j] - T[j - 1] < -2.5 * sd) {
        out.anomalies.push({ at: j, drop: +(T[j] - T[j - 1]).toFixed(4), budget: out.budgets[j] });
      }
    }

    /* ⑦ 结论：先看有没有效应，再看有没有结构证据 */
    var peakV = T[out.peak.idx];
    var lastV = T[T.length - 1];
    var drop = peakV - lastV;
    var Pgain = P[P.length - 1] - P[0];

    if (Pgain <= 0.6) {
      out.verdict = "noeffect";
      out.gaps.push("代理指标本身未上升（ΔP=" + Pgain.toFixed(1) + "），无失效可谈。");
    } else if (drop < minEffect) {
      out.verdict = "noeffect";
      out.gaps.push("独立目标未出现超过最小实际效应 " + minEffect + " 的下降（峰值 " +
        peakV.toFixed(3) + " → 末档 " + lastV.toFixed(3) + "）。这是「未检出」，不是「证明不存在」。");
    } else if (out.peak.detectRate < 0.6) {
      out.verdict = "undetermined";
      out.gaps.push("多种子重复中仅 " + Math.round(out.peak.detectRate * 100) +
        "% 出现下降，低于 60% 门槛：结果不稳定，保留不可判定。");
    } else {
      out.verdict = "supported";
    }
    return out;
  }

  function variance(a) {
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return s / (a.length - 1);
  }

  /* ================= 仪器尸检（自检） ================= */
  /* 用已知真值的合成序列检验检测器本身：误报率 + 检出率。
     这是「不仅防止用户被 AI 糊弄，也防止用户被仪表盘糊弄」的实现。

     自检暴露的真实结论：在本仪器的参数下，约束检出行为的不是统计阈值 h，
     而是「最小实际效应 minEffect」。因此自检必须扫描 minEffect，
     给出「取多大才够保守」的可操作答案，而不是报一个孤零零的误报率。 */
  function selfTest(opts) {
    opts = opts || {};
    var reps = opts.reps || 60;
    var n = opts.n || 8;
    var sweep = opts.sweep || [0.02, 0.03, 0.05, 0.08, 0.12];
    var h = opts.h || 4.0;
    var rows = [];

    sweep.forEach(function (me) {
      var fp = 0, hit = 0, i, j, k, m;
      /* 平稳序列：仪器不该在这里喊下降 */
      for (i = 0; i < reps; i++) {
        var rnd = mulberry32(9000 + i * 17);
        var y = [];
        for (j = 0; j < n; j++) y.push(0.70 + gauss(rnd) * 0.010);
        if (detectDecline(y, { h: h, minEffect: me }).detected) fp++;
      }
      /* 已知下降序列：前 4 档升，后 4 档持续降 */
      for (k = 0; k < reps; k++) {
        var r2 = mulberry32(7000 + k * 23);
        var y2 = [];
        for (m = 0; m < n; m++) {
          var base = m < 4 ? 0.62 + m * 0.030 : 0.62 + 3 * 0.030 - (m - 3) * 0.032;
          y2.push(base + gauss(r2) * 0.010);
        }
        var det = detectDecline(y2, { h: h, minEffect: me });
        if (det.detected && det.onset >= 3) hit++;
      }
      rows.push({ minEffect: me, falsePositiveRate: fp / reps, power: hit / reps });
    });

    /* 推荐值：误报 ≤ 5% 的前提下取最小的 minEffect（保住检出率） */
    var rec = null;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].falsePositiveRate <= 0.05) { rec = rows[r].minEffect; break; }
    }
    if (rec === null) rec = rows[rows.length - 1].minEffect;

    return {
      reps: reps, n: n, h: h,
      rows: rows,
      recommend: rec,
      note: "合成序列检验（n=" + n + "，σ≈0.010，重复 " + reps +
        " 次）。约束检出的是「最小实际效应」而非统计阈值：阈值取得太小，平稳序列也会被判定为下降。" +
        "推荐 minEffect = " + rec + "（该档误报 ≤5%）。仅说明本检测器在这组参数下的表现，不构成通用保证。"
    };
  }

  /* ================= 对外 ================= */
  window.YCMetrics = {
    VERSION: VERSION, CODE: CODE,
    makeWorld: makeWorld,
    decodeTheta: decodeTheta,
    thetaLabel: thetaLabel,
    runEpisode: runEpisode,
    inspect: inspect,
    evalP: evalP,
    optimize: optimize,
    analyze: analyze,
    pelt: pelt,
    detectDecline: detectDecline,
    cusumDown: function (y, o) { return detectDecline(y, o); },
    peakReport: peakReport,
    selfTest: selfTest,
    THETA0: THETA0,
    _util: { clamp: clamp, mean: mean, median: median, quantile: quantile, variance: variance, mulberry32: mulberry32 }
  };
})();

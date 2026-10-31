/* ============================================================
   yc-dome.js — H6 潜能与预算博物馆 · 预算穹顶引擎  v0.1.0
   ------------------------------------------------------------
   问题：加预算，买到的是能力，还是买到了「至少有一次」？

   这一版不画「一条随预算上升的曲线」。它做四件别处没做的事：

   ① 把失败拆成三种互不相同的病
      reach  可达但稀有 —— 正确答案在支持集里，只是概率低
      near   近失 —— 产出了「差一步」的答案，被严格判分判成错
      void   不可达 —— 正确答案根本不在支持集里，采样多少次都是 0
      只看 pass@k 会把三者混成一个数；而它们的处方完全不同：
      加预算治 reach，改判分口径治 near，换模型才治 void。

   ② 区分「名义预算」与「有效预算」
      k 次采样不一定是 k 份独立证据。若 k 次里只有 d 个不同答案，
      有效预算就是 d 而不是 k。leak = 1 - d/k 是预算泄漏率。
      预算泄漏高的时候，「加预算」只是把同一个答案又抽了一遍。

   ③ 把 oracle 和现实分开报
      pass@k 假设你有一个完美的选择器：k 个里有一个对就算对。
      现实里你必须挑一个。vote@k 是多数表决，greedy@1 是直接取最高概率。
      三者之间的差是「选择器赤字」—— 它随 k 变大，不随 k 变小。

   ④ 给出可被自己证伪的归因
      若预算真的只治 reach，那么八倍预算带来的提升应当**全部**落在
      reach 任务上，而不可达任务的命中率提升必须**严格等于 0**。
      这一条能被推翻：只要不可达任务多命中一次，归因就错。

   随机数用 mulberry32（H4 教训：xorshift32 前一两百个输出对低位有偏）。
   ============================================================ */
(function (root) {
  "use strict";

  var VERSION = "0.1.0";
  var KMAX = 256;
  var LADDER = [1, 2, 4, 8, 16, 32, 64, 128, 256];
  var DEF = { seed: 20311101, k: 32, tau: 1.0 };

  function mulberry32(a) {
    a = (a >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function mean(a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }

  /* ---------------- 世界：一批任务，每个任务一个「能说出什么」的支持集 ---------------- */
  function buildWorld(opt) {
    opt = opt || {};
    var seed = opt.seed == null ? DEF.seed : opt.seed;
    var nReach = opt.nReach == null ? 80 : opt.nReach;
    var nVoid = opt.nVoid == null ? 40 : opt.nVoid;
    var forceP = opt.forceP == null ? null : opt.forceP;   // 负例用：把可达任务的命中概率钉死
    var rnd = mulberry32(seed);
    var tasks = [];
    var total = nReach + nVoid;

    for (var i = 0; i < total; i++) {
      var reach = i < nReach;
      var g = 100 + Math.floor(rnd() * 900);
      var nDis = 3 + Math.floor(rnd() * 10);              // 3—12 个干扰答案
      var sup = [];
      // 不可达任务分两种：会给出「差一步」的答案，或压根不靠近。
      // 这个区别很重要 —— 沉默的模型和自信地答错的模型，处方不一样。
      var hasNear = !reach && rnd() < 0.62;

      if (reach) {
        // 两类任务：一类「首选就常对」，一类「会说但很少先说」
        // 真实模型就是这样分层的，而不是所有任务都同样稀薄
        var pw;
        if (forceP == null) {
          pw = rnd() < 0.45
            ? 0.55 + rnd() * 0.45                       // 首选正确：greedy 就能拿到
            : 0.0025 * Math.pow(2, rnd() * 4.8);        // 稀有正确：只能靠采样碰
        } else pw = forceP;
        sup.push({ v: g, w: pw });
      }

      for (var j = 0; j < nDis; j++) {
        // 只有「不可达且不靠近」的任务才强制偏移 ≥2，其余任务都可以有近邻
        var step = (reach || hasNear) ? (1 + Math.floor(rnd() * 3)) : (2 + Math.floor(rnd() * 2));
        var sign = rnd() < 0.5 ? 1 : -1;
        var v = g + sign * step;
        if (v === g) v = g + 9;
        var dup = false;
        for (var q = 0; q < sup.length; q++) if (sup[q].v === v) { dup = true; break; }
        if (dup) v = g + 11 + j;
        sup.push({ v: v, w: (0.05 + rnd() * 0.45) / (1 + j * 0.22) });
      }

      // 会「差一步」的不可达任务：保证至少有一个近邻存在
      if (hasNear) {
        var ok = false;
        for (var z = 0; z < sup.length; z++) if (Math.abs(sup[z].v - g) === 1) { ok = true; break; }
        if (!ok) sup.push({ v: g + 1, w: 0.10 + rnd() * 0.25 });
      }

      tasks.push({ id: i, kind: reach ? "reach" : "void", g: g, sup: sup, hasNear: hasNear });
    }

    return { seed: seed, tasks: tasks, nReach: nReach, nVoid: nVoid, total: total };
  }

  /* ---------------- 温度：w^(1/τ) 归一化 ---------------- */
  function probs(task, tau) {
    var t = Math.max(0.05, tau);
    var inv = 1 / t, s = 0, i;
    var w = new Array(task.sup.length);
    for (i = 0; i < task.sup.length; i++) { w[i] = Math.pow(Math.max(1e-9, task.sup[i].w), inv); s += w[i]; }
    for (i = 0; i < w.length; i++) w[i] /= s;
    return w;
  }

  function pTruth(task, tau) {
    if (task.kind !== "reach") return 0;
    var w = probs(task, tau);
    for (var i = 0; i < task.sup.length; i++) if (task.sup[i].v === task.g) return w[i];
    return 0;
  }

  /* ---------------- 采样：一次抽满 KMAX，用前缀保证 pass@k 单调 ---------------- */
  function drawTask(task, tau, rnd) {
    var w = probs(task, tau);
    var cum = new Array(w.length), c = 0, i;
    for (i = 0; i < w.length; i++) { c += w[i]; cum[i] = c; }
    var out = new Array(KMAX);
    for (var n = 0; n < KMAX; n++) {
      var u = rnd(), lo = 0, hi = cum.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (u <= cum[mid]) hi = mid; else lo = mid + 1; }
      out[n] = task.sup[lo].v;
    }
    return { vals: out, p: w };
  }

  /* ---------------- 主运行 ---------------- */
  function run(opt) {
    opt = opt || {};
    var world = opt.world || buildWorld(opt);
    var k = clamp(Math.round(opt.k == null ? DEF.k : opt.k), 1, KMAX);
    var tau = opt.tau == null ? DEF.tau : opt.tau;
    // 种子只依赖 τ，不依赖 k —— 这样「同一批采样、只改预算」是严格的嵌套对照
    var rnd = mulberry32((world.seed ^ 0x5bf03635 ^ (Math.round(tau * 1000) * 2654435761)) >>> 0);

    var L = LADDER.slice();
    if (L.indexOf(k) < 0) { L.push(k); L.sort(function (a, b) { return a - b; }); }

    var perTask = [];
    var agg = {};
    L.forEach(function (kk) {
      agg[kk] = { hit: 0, nearOnly: 0, cold: 0, vote: 0, reachHit: 0, voidHit: 0,
                  nReach: 0, nVoid: 0, eff: 0, greedy: 0 };
    });

    for (var ti = 0; ti < world.tasks.length; ti++) {
      var task = world.tasks[ti];
      var d = drawTask(task, tau, rnd);
      var counts = {}, distinct = 0;
      var hit = false, near = false;
      var li = 0;
      var snap = {};

      var greedyOK = false;
      var bestI = 0;
      for (var gi = 1; gi < d.p.length; gi++) if (d.p[gi] > d.p[bestI]) bestI = gi;
      greedyOK = (task.sup[bestI].v === task.g);

      for (var n = 0; n < KMAX; n++) {
        var v = d.vals[n];
        if (counts[v] == null) { counts[v] = 1; distinct++; } else counts[v]++;
        if (v === task.g) hit = true;
        if (Math.abs(v - task.g) === 1) near = true;

        while (li < L.length && L[li] === n + 1) {
          var kk = L[li];
          var modeV = null, modeC = -1;
          for (var key in counts) { if (counts[key] > modeC) { modeC = counts[key]; modeV = key; } }
          snap[kk] = { hit: hit, near: near, distinct: distinct, mode: modeV, modeC: modeC };
          li++;
        }
      }

      perTask.push({
        id: task.id, kind: task.kind, g: task.g, nSup: task.sup.length,
        pTruth: pTruth(task, tau), greedyOK: greedyOK,
        hit: snap[k].hit, near: snap[k].near, distinct: snap[k].distinct,
        mode: snap[k].mode, modeC: snap[k].modeC,
        vals: d.vals.slice(0, k)
      });

      L.forEach(function (kk) {
        var s = snap[kk], a = agg[kk];
        if (s.hit) a.hit++;
        else if (s.near) a.nearOnly++;
        else a.cold++;
        if (String(s.mode) === String(task.g)) a.vote++;
        if (task.kind === "reach") { a.nReach++; if (s.hit) a.reachHit++; }
        else { a.nVoid++; if (s.hit) a.voidHit++; }
        a.eff += s.distinct;
        if (greedyOK) a.greedy++;
      });
    }

    var T = world.tasks.length;
    function norm(kk) {
      var a = agg[kk];
      return {
        k: kk,
        pass: a.hit / T,
        nearOnly: a.nearOnly / T,
        cold: a.cold / T,
        vote: a.vote / T,
        greedy: a.greedy / T,
        reachHit: a.nReach ? a.reachHit / a.nReach : 0,
        voidHit: a.nVoid ? a.voidHit / a.nVoid : 0,
        nEff: a.eff / T,
        leak: 1 - (a.eff / T) / kk
      };
    }

    var now = norm(k);
    var at1 = norm(1);
    var atMax = norm(KMAX);
    var unreachable = world.nVoid / T;
    var ceiling = world.nReach / T;

    now.gain = now.pass - at1.pass;
    now.deficit = now.pass - now.vote;
    now.unreachable = unreachable;
    now.ceiling = ceiling;
    now.headroom = ceiling - now.pass;
    now.at1 = at1;
    now.atMax = atMax;
    now.ladder = L.map(norm);
    now.tasks = perTask;
    now.world = { seed: world.seed, total: T, nReach: world.nReach, nVoid: world.nVoid };
    now.tau = tau;

    /* ---- 判定：三件事分开报，不合并成一个数 ---- */
    var v = { verdict: "supported", subtype: "gain", why: "" };

    if (T < 24) {
      v.verdict = "undetermined"; v.subtype = "few";
      v.why = "任务只有 " + T + " 条，不到 24 条。任务太少时，pass@k 的抖动与任务之间的差异混在一起，无法判断是预算起作用还是这一批任务恰好容易。";
    } else if (k < 8) {
      v.verdict = "undetermined"; v.subtype = "short";
      v.why = "预算只有 " + k + " 次。八次以下连「稀有但可达」的任务都还没抽到，此时报「预算无效」是把预算不足误读成能力不足。";
    } else if (now.nEff <= 1.6) {
      v.verdict = "undetermined"; v.subtype = "leak";
      v.why = "名义预算 " + k + " 次，实际只说出 " + now.nEff.toFixed(1) + " 个不同答案。采样几乎全落在同一个答案上，这时「加预算」只是把同一个答案又抽了一遍，谈预算效果没有意义——先把多样性修好。";
    } else if (now.gain < 0.02) {
      v.verdict = "refuted"; v.subtype = "flat";
      v.why = "从 1 次加到 " + k + " 次，命中率只动了 " + (now.gain * 100).toFixed(1) + " 个百分点。这批任务不需要更多采样——它们要么本来就会，要么怎么抽都不会。";
    } else if (now.headroom > 0.10) {
      v.verdict = "supported"; v.subtype = "gain";
      v.why = "预算有效：命中率从 " + (at1.pass * 100).toFixed(1) + "% 抬到 " + (now.pass * 100).toFixed(1) + "%。但天花板是 " + (ceiling * 100).toFixed(1) + "%，还差 " + (now.headroom * 100).toFixed(1) + " 个百分点要靠继续加预算去够。";
    } else {
      v.verdict = "supported"; v.subtype = "saturate";
      v.why = "预算已经饱和：命中率 " + (now.pass * 100).toFixed(1) + "%，与可达上限 " + (ceiling * 100).toFixed(1) + "% 只差 " + (now.headroom * 100).toFixed(1) + " 个百分点。再加预算不会更好了——剩下 " + (unreachable * 100).toFixed(1) + "% 的任务根本不在支持集里。";
    }

    v.ceiling = ceiling;
    v.unreachable = unreachable;
    v.deficit = now.deficit;
    v.gain = now.gain;

    return {
      k: k, tau: tau, verdict: v.verdict, subtype: v.subtype, why: v.why,
      pass: now.pass, vote: now.vote, greedy: now.greedy, nEff: now.nEff, leak: now.leak,
      nearOnly: now.nearOnly, cold: now.cold, reachHit: now.reachHit, voidHit: now.voidHit,
      gain: now.gain, deficit: now.deficit, ceiling: ceiling, unreachable: unreachable,
      headroom: now.headroom,
      ladder: now.ladder, tasks: perTask, world: now.world,
      at1: at1, atMax: atMax
    };
  }

  /* ---------------- 归因：同一批任务，只改预算与多样性 ---------------- */
  function decompose(opt) {
    opt = opt || {};
    var world = opt.world || buildWorld(opt);
    var A = run({ world: world, k: 8, tau: 1.0 });
    var B = run({ world: world, k: 64, tau: 1.0 });
    var C = run({ world: world, k: 8, tau: 2.2 });
    var D = run({ world: world, k: 64, tau: 2.2 });

    var preds = [
      {
        id: "budget",
        label: "八倍预算会抬高命中率",
        detail: "A(k=8) → B(k=64)：命中率至少 +0.10",
        pass: (B.pass - A.pass) >= 0.10,
        got: "A " + (A.pass * 100).toFixed(1) + "% → B " + (B.pass * 100).toFixed(1) + "%（+" + ((B.pass - A.pass) * 100).toFixed(1) + "pp）"
      },
      {
        id: "void",
        label: "提升全部来自可达任务，不可达任务一次都不多",
        detail: "B.voidHit − A.voidHit 必须严格等于 0，同时 B.reachHit − A.reachHit > 0.20",
        pass: (Math.abs(B.voidHit - A.voidHit) < 1e-12) && (B.reachHit - A.reachHit > 0.20),
        got: "不可达 " + (A.voidHit * 100).toFixed(2) + "% → " + (B.voidHit * 100).toFixed(2) + "%，可达 " + (A.reachHit * 100).toFixed(1) + "% → " + (B.reachHit * 100).toFixed(1) + "%"
      },
      {
        id: "diversity",
        label: "同样的预算，提高多样性会抬高有效预算",
        detail: "D(k=64, τ=2.2) 的有效预算必须高于 B(k=64, τ=1.0)",
        pass: D.nEff > B.nEff,
        got: "有效预算 B " + B.nEff.toFixed(2) + " → D " + D.nEff.toFixed(2)
      }
    ];

    return {
      arms: [
        { id: "A", label: "基线", k: A.k, tau: A.tau, pass: A.pass, vote: A.vote, nEff: A.nEff, leak: A.leak, deficit: A.deficit },
        { id: "B", label: "八倍预算", k: B.k, tau: B.tau, pass: B.pass, vote: B.vote, nEff: B.nEff, leak: B.leak, deficit: B.deficit },
        { id: "C", label: "八倍多样性", k: C.k, tau: C.tau, pass: C.pass, vote: C.vote, nEff: C.nEff, leak: C.leak, deficit: C.deficit },
        { id: "D", label: "两者都加", k: D.k, tau: D.tau, pass: D.pass, vote: D.vote, nEff: D.nEff, leak: D.leak, deficit: D.deficit }
      ],
      preds: preds,
      allPass: preds.every(function (p) { return p.pass; })
    };
  }

  /* ---------------- 温度扫描：多样性与精度是一对 ---------------- */
  function sweepTau(opt) {
    opt = opt || {};
    var world = opt.world || buildWorld(opt);
    var k = opt.k == null ? 32 : opt.k;
    var taus = [0.3, 0.5, 0.7, 1.0, 1.4, 1.9, 2.6, 3.4];
    return taus.map(function (t) {
      var r = run({ world: world, k: k, tau: t });
      return { tau: t, pass: r.pass, vote: r.vote, nEff: r.nEff, leak: r.leak, deficit: r.deficit };
    });
  }

  /* ---------------- 自检：仪器先把自己验回来 ---------------- */
  function selfCheck() {
    var out = [];

    // 1. 吸收性：不可达任务在任何预算下都不可能命中
    var w1 = buildWorld({ seed: 20311101 });
    var r1 = run({ world: w1, k: 256, tau: 1.0 });
    var zero = 0, tot = 0;
    r1.tasks.forEach(function (t) { if (t.kind === "void") { tot++; if (!t.hit) zero++; } });
    out.push({
      id: "absorb", name: "吸收性",
      pass: zero === tot && tot > 0,
      detail: "不可达任务在 256 次采样下命中 0 次：" + zero + "/" + tot,
      note: "支持集里没有正确答案，采样再多也不该撞上。这条不成立，说明判分或采样有 bug。"
    });

    // 2. 单调性：pass@k 必须随预算非减
    var mono = true, bad = 0;
    for (var i = 1; i < r1.ladder.length; i++) {
      if (r1.ladder[i].pass + 1e-12 < r1.ladder[i - 1].pass) { mono = false; bad++; }
    }
    out.push({
      id: "mono", name: "单调性",
      pass: mono,
      detail: "阶梯 " + r1.ladder.length + " 级，逆序 " + bad + " 处",
      note: "「k 个里有一个对」是累积事件，预算变多不可能让命中率下降。用嵌套前缀采样保证这条。"
    });

    // 3. 饱和性：足够常见的可达任务，在 256 次里几乎必中
    var rare = r1.tasks.filter(function (t) { return t.kind === "reach" && t.pTruth >= 0.03; });
    var hit = rare.filter(function (t) { return t.hit; }).length;
    out.push({
      id: "sat", name: "饱和性",
      pass: rare.length > 0 && hit === rare.length,
      detail: "p≥0.03 的可达任务在 256 次下全部命中：" + hit + "/" + rare.length,
      note: "如果连常见任务都抽不到，问题不在预算，在采样器。"
    });

    // 4. 无泄漏极限：温度压到极低时，一个任务几乎只会说同一个答案
    var w4 = buildWorld({ seed: 20311101 });
    var r4 = run({ world: w4, k: 64, tau: 0.05 });
    var eff4 = r4.nEff;
    out.push({
      id: "collapse", name: "无泄漏极限",
      pass: eff4 <= 1.6,
      detail: "τ=0.05 时每任务有效答案 " + eff4.toFixed(2) + " 个（应 ≈1）",
      note: "温度趋零时分布退化成单点，有效预算必须是 1。这条是「有效预算」这个量本身的校准。"
    });

    // 5. 投票上界：oracle 选择不可能比多数表决更差
    var ok5 = r1.ladder.every(function (p) { return p.vote <= p.pass + 1e-12; });
    out.push({
      id: "upper", name: "投票上界",
      pass: ok5,
      detail: "阶梯 " + r1.ladder.length + " 级，vote@k ≤ pass@k 全部成立",
      note: "k 个里有对的，就一定存在一种选择方式能选中它；多数表决只是其中一种，不可能更好。"
    });

    return out;
  }

  /* ---------------- 负例：每条拒判线都要有真实触发 ---------------- */
  function negatives() {
    var cases = [
      {
        id: "few", label: "任务太少", opt: { nReach: 10, nVoid: 6, k: 32 },
        check: function (r) {
          return { pass: r.verdict === "undetermined" && r.subtype === "few", got: r.verdict + "/" + r.subtype };
        }
      },
      {
        id: "short", label: "预算太小", opt: { k: 4 },
        check: function (r) {
          return { pass: r.verdict === "undetermined" && r.subtype === "short", got: r.verdict + "/" + r.subtype };
        }
      },
      {
        id: "leak", label: "预算泄漏", opt: { k: 64, tau: 0.05 },
        check: function (r) {
          return { pass: r.verdict === "undetermined" && r.subtype === "leak", got: r.verdict + "/" + r.subtype + "（有效预算 " + r.nEff.toFixed(1) + "）" };
        }
      },
      {
        id: "flat", label: "预算无效", opt: { k: 64, forceP: 120 },
        check: function (r) {
          return { pass: r.verdict === "refuted" && r.subtype === "flat", got: r.verdict + "/" + r.subtype + "（增益 " + (r.gain * 100).toFixed(1) + "pp）" };
        }
      },
      {
        id: "nofloor", label: "没有不可达任务", opt: { nVoid: 0, k: 32 },
        check: function (r) {
          // 世界里没有不可达任务时，天花板必须被测成 100%，且不许出现「永远到不了」的结论
          return {
            pass: Math.abs(r.ceiling - 1) < 1e-12 && r.unreachable === 0 && r.verdict === "supported",
            got: "天花板 " + (r.ceiling * 100).toFixed(0) + "% / 不可达 " + (r.unreachable * 100).toFixed(0) + "% / " + r.verdict + "/" + r.subtype
          };
        }
      }
    ];
    return cases.map(function (c) {
      var w = buildWorld({ seed: 20311101, nReach: c.opt.nReach, nVoid: c.opt.nVoid, forceP: c.opt.forceP });
      var r = run({ world: w, k: c.opt.k, tau: c.opt.tau == null ? 1.0 : c.opt.tau });
      var res = c.check(r);
      return { id: c.id, label: c.label, pass: res.pass, got: res.got, why: r.why };
    });
  }

  var API = {
    VERSION: VERSION, KMAX: KMAX, LADDER: LADDER, DEFAULTS: DEF,
    world: buildWorld, probs: probs, pTruth: pTruth,
    run: run, decompose: decompose, sweepTau: sweepTau,
    selfCheck: selfCheck, negatives: negatives, mean: mean
  };

  root.YCDome = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

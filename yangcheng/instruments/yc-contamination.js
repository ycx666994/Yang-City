/* ============================================================
   yc-contamination.js — H4 数据污染博物馆 · 三档对照 + 回吐溯源
   ------------------------------------------------------------
   这台仪器只回答一个问题：
     它在这道题上答对，是因为会做，还是因为见过，还是当前证据分不清？

   三个档：
     甲架 原题   训练语料里出现过的那道题（表面逐字相同）
     乙架 改数   同一道题，改掉一到两个数（答案随之改变）
     丙架 新题   同一技能族、从未出现过的题

   为什么不能只比准确率：
     乙架比丙架低，有两种完全不同的解释 ——
       (a) 它靠表面记忆，改了数就不认得了；
       (b) 你改的数让题变难了。
     只看准确率，这两件事长得一模一样。这是本馆全部设计要解决的那个混淆。

   两条独立通道：
     通道一 准确率分解  accA / accB / accC，配一个冷参照做难度认证。
                        它会被难度漂移污染，也会被天花板效应吃掉分辨力。
     通道二 答案溯源    在改数题上，它给出的答案是不是"原题的答案"。
                        这是记忆的直接指纹：算错的答案不会系统性地等于旧答案。

   估计量：
     R  = P(答案 = 原题答案 | 改数题)         被测者在乙架上的回吐率
     R0 = 参照组在同一批改数题上的同一比例     偶然水平（实测，不是假设）
     κ̂  = (R − R0) / (1 − R0)                 扣除偶然之后的回吐压力

     κ̂ ≈ 0  说明它在这批改数题上确实在算；
     κ̂ ≈ 1  说明它几乎不算是，直接把旧答案搬过来。

   三条拒判线（仪器自己承认不行的时刻）：
     ① 变体根本没改变答案（R0 → 1，分母塌了，信息量为零）
     ② 变体与原题的表面匹配度低于记忆触发阈值（探针没接上，κ̂=0 不构成清白证明）
     ③ 题量不足 / 区间跨过判定边界

   一条"通道失效但结论仍成立"的线：
     参照组显示乙架明显更难 → 准确率通道失效，但 κ̂ 不受难度影响，仍然有效。
     这是两条通道分开设计的全部意义。
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YCContam = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "0.1.0";
  var PROTOCOL = "YC-Contam 1.0";

  /* ---------------- 基础 ---------------- */

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mean(a) {
    if (!a.length) return 0;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  /* mulberry32：同一 seed 必须得到同一座档案库。
     原来用 xorshift32，前一两百个输出对 32 位种子的低位分布有偏：
     标称 25% 的保留率实测跑出 26—34%，κ̂ 因此系统性偏高约 0.04。
     随机数质量不是实现细节 —— 它会直接变成结论里的偏差。 */
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 题库 ---------------- */

  /* 四数三步：技能族 = 加减链的形状，与具体数字无关 */
  var CHAINS = [
    ["+", "+", "-"],
    ["-", "+", "+"],
    ["+", "-", "-"],
    ["-", "-", "+"],
    ["+", "+", "+"],
    ["-", "+", "-"]
  ];
  var ENTS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var GOODS = [
    ["货箱", "箱"], ["零件", "件"], ["油桶", "桶"],
    ["包裹", "包"], ["托盘", "托"], ["原料", "袋"]
  ];

  function fold(chain, nums) {
    var v = nums[0], carries = 0, i, op, b;
    for (i = 0; i < 3; i++) {
      op = chain[i]; b = nums[i + 1];
      if (op === "+") {
        if ((v % 10) + (b % 10) >= 10) carries++;
        v += b;
      } else {
        if ((v % 10) < (b % 10)) carries++;
        v -= b;
      }
    }
    return { v: v, carries: carries };
  }

  function digitsOf(nums) {
    var d = 1, i;
    for (i = 0; i < nums.length; i++) {
      var l = String(Math.abs(nums[i])).length;
      if (l > d) d = l;
    }
    return d;
  }

  /* 生成一组数，保证中间值不为负、答案不为负 */
  function genNums(chain, r, digits) {
    var lo = digits >= 3 ? 108 : 14;
    var hi = digits >= 3 ? 962 : 96;
    for (var t = 0; t < 60; t++) {
      var n = [], i, ok = true;
      for (i = 0; i < 4; i++) n.push(lo + Math.floor(r() * (hi - lo)));
      var v = n[0];
      for (i = 0; i < 3; i++) {
        v = chain[i] === "+" ? v + n[i + 1] : v - n[i + 1];
        if (v < 0) { ok = false; break; }
      }
      if (ok && v >= 0) return n;
    }
    return [40, 15, 12, 9];
  }

  /* 题面分段：数字单独成段，方便在界面上标出"改的是哪一个" */
  function segsOf(ent, goods, chain, nums, changed) {
    var out = [], i;
    var noun = goods[0], unit = goods[1];
    changed = changed || [];
    out.push({ t: "t", v: ent + "仓原有 " });
    out.push({ t: "n", v: nums[0], chg: changed.indexOf(0) >= 0 });
    out.push({ t: "t", v: " " + unit + "，" });
    for (i = 0; i < 3; i++) {
      out.push({ t: "t", v: (chain[i] === "+" ? "补进 " : "运走 ") });
      out.push({ t: "n", v: nums[i + 1], chg: changed.indexOf(i + 1) >= 0 });
      out.push({ t: "t", v: " " + unit + (i < 2 ? "，" : "，现存多少" + unit + "？") });
    }
    return { segs: out, noun: noun, unit: unit };
  }

  function buildItem(entIdx, goodsIdx, chain, nums, changed, tag) {
    var f = fold(chain, nums);
    var s = segsOf(ENTS[entIdx], GOODS[goodsIdx], chain, nums, changed);
    return {
      tag: tag,
      entIdx: entIdx, goodsIdx: goodsIdx,
      ent: ENTS[entIdx], noun: s.noun, unit: s.unit,
      chain: chain.slice(), nums: nums.slice(),
      ans: f.v, carries: f.carries, digits: digitsOf(nums),
      changed: (changed || []).slice(),
      segs: s.segs,
      text: s.segs.map(function (x) { return x.v; }).join("")
    };
  }

  /* ---------------- 表面匹配 ---------------- */

  /* 槽位权重：仓名 0.10 + 物件 0.06 + 四个数各 0.21 = 1.00。
     权重直接决定"改几个数"与"记忆还能不能触发"的对应关系：
       换措辞不改数 → 0.84   改一个数 → 0.63   改两个数 → 0.42
     阈值 0.55 卡在 0.63 与"偶然撞车 0.52（同仓名＋两个数）"之间。
     这 0.03 的余量是必需的：新题档在 96×96 对里必然撞上几对，
     阈值压到 0.45 时丙档会有 4% 的题被误判成"记得"，κ̂ 因此系统性偏高。
     权重不是审美选择，它决定了这台仪器会不会骗自己。 */
  var W_ENT = 0.10, W_NOUN = 0.06, W_NUM = 0.21;

  function slotsOf(it) {
    return {
      ent: it.ent, noun: it.noun,
      n0: it.nums[0], n1: it.nums[1], n2: it.nums[2], n3: it.nums[3]
    };
  }

  function matchFrac(a, b) {
    var m = 0;
    if (a.ent === b.ent) m += W_ENT;
    if (a.noun === b.noun) m += W_NOUN;
    if (a.n0 === b.n0) m += W_NUM;
    if (a.n1 === b.n1) m += W_NUM;
    if (a.n2 === b.n2) m += W_NUM;
    if (a.n3 === b.n3) m += W_NUM;
    return m;
  }

  /* 记忆触发阈值：0.55 落在"改一个数（0.63）"与"改两个数（0.42）"之间，
     且高于"同仓名＋两个数"的偶然撞车（0.52）。见 sweep 的窗口扫描。 */
  var THETA = 0.55;
  /* 回吐压力：即使表面匹配上了，也不是每次都直接搬旧答案 */
  var KAPPA_RECALL = 0.90;

  function bestMatch(table, it) {
    var s = slotsOf(it), best = { rho: 0, rec: null };
    for (var i = 0; i < table.length; i++) {
      var f = matchFrac(s, table[i].slots);
      if (f > best.rho) { best.rho = f; best.rec = table[i]; }
    }
    return best;
  }

  /* ---------------- 题组 ---------------- */

  /* 一个题组 = 同源三件（甲/乙/丙）。重采样单位是题组，不是单题，
     因为同一组的三个版本共享同一个技能点，彼此不独立。 */
  function genTriple(fi, seed, w) {
    var r = rng(seed);
    var chain = CHAINS[fi % CHAINS.length];

    var entA = Math.floor(r() * ENTS.length);
    var gA = Math.floor(r() * GOODS.length);
    var numsA = genNums(chain, r, 2);
    var A = buildItem(entA, gA, chain, numsA, [], "A");

    /* 乙：换仓名与物件（措辞变了），按改写力度改数 */
    var entB = (entA + 1 + Math.floor(r() * (ENTS.length - 1))) % ENTS.length;
    var gB = (gA + 1 + Math.floor(r() * (GOODS.length - 1))) % GOODS.length;

    var k = w < 0.30 ? 0 : (w < 0.82 ? 1 : 2);
    var bump = (w >= 0.62 && w < 0.82) ? 1 : 0;
    var numsB = numsA.slice(), changed = [], i;
    for (i = 0; i < k; i++) {
      var idx = 3 - i;
      var delta = 12 + Math.floor(r() * 48);
      var sign = r() < 0.5 ? -1 : 1;
      var nv = numsB[idx] + sign * delta;
      if (nv < 12) nv = numsB[idx] + delta;
      if (bump) nv += 100 * (1 + Math.floor(r() * 7));
      numsB[idx] = nv;
      changed.push(idx);
    }
    /* 只有本来就要改数时才补刀：k=0 的"空变体"必须保持答案不变，
       那正是"变体形同虚设"这条负例要演示的东西。 */
    var fB = fold(chain, numsB);
    if (k > 0 && fB.v === A.ans) {
      numsB[3] += 17;
      if (changed.indexOf(3) < 0) changed.push(3);
    }
    var B = buildItem(entB, gB, chain, numsB, changed, "B");

    /* 丙：同技能族、全新表面、同样的位数（难度不被改写污染） */
    var rc = rng((seed ^ 0x5bf03635) >>> 0);
    var entC = (entB + 1 + Math.floor(rc() * (ENTS.length - 1))) % ENTS.length;
    var gC = (gB + 1 + Math.floor(rc() * (GOODS.length - 1))) % GOODS.length;
    var numsC = genNums(chain, rc, 2);
    var C = buildItem(entC, gC, chain, numsC, [], "C");

    /* 设计层面的表面匹配：只取决于题面本身，不取决于模型记住了多少。
       用它判断"探针有没有接上"，才不会把"模型没记忆"误判成"探针没接通"。 */
    var rhoDesign = matchFrac(slotsOf(B), slotsOf(A));

    return {
      i: fi, chain: chain, A: A, B: B, C: C,
      changed: changed.slice(), rhoDesign: rhoDesign
    };
  }

  /* ---------------- 解算器 ---------------- */

  function skillOf(it, base) {
    var d = it.carries * 0.10 + (it.digits - 2) * 0.28;
    return clamp(base - d, 0.04, 0.985);
  }

  function wrongOf(v, r) {
    var ds = [-13, -7, -2, 3, 11, 24];
    return v + ds[Math.floor(r() * ds.length)];
  }

  function computeAnswer(it, base, r) {
    if (r() < skillOf(it, base)) return it.ans;
    return wrongOf(it.ans, r);
  }

  /* 记忆表：只保留一部分原题（retention），可带标签噪声 */
  function buildTable(triples, mem, labelNoise, r) {
    var t = [];
    for (var i = 0; i < triples.length; i++) {
      var tr = triples[i];
      if (r() >= mem) continue;
      var stored = tr.A.ans;
      if (labelNoise > 0 && r() < labelNoise) stored = wrongOf(stored, r);
      t.push({ id: "M" + tr.i, slots: slotsOf(tr.A), stored: stored, truth: tr.A.ans });
    }
    return t;
  }

  /* ---------------- 主运行 ---------------- */

  function runAudit(opt) {
    opt = opt || {};
    var seed = opt.seed == null ? 20261030 : (opt.seed >>> 0);
    var n = opt.n == null ? 96 : Math.round(clamp(opt.n, 24, 400));
    var w = clamp(opt.rewrite == null ? 0.45 : opt.rewrite, 0, 1);
    var mem = clamp(opt.mem == null ? 0.95 : opt.mem, 0, 1);
    var labelNoise = clamp(opt.labelNoise == null ? 0 : opt.labelNoise, 0, 0.9);
    var boot = opt.boot == null ? 300 : Math.round(clamp(opt.boot, 60, 1200));
    var subSkill = opt.subSkill == null ? 0.80 : opt.subSkill;
    var refSkill = opt.refSkill == null ? 0.80 : opt.refSkill;
    var refMem = clamp(opt.refMem == null ? 0 : opt.refMem, 0, 1);

    var triples = [], i;
    for (i = 0; i < n; i++) triples.push(genTriple(i, (seed + i * 7919) >>> 0, w));

    /* 被测者的记忆表 */
    var mr = rng((seed ^ 0x9e3779b9) >>> 0);
    var table = buildTable(triples, mem, labelNoise, mr);

    /* 参照组：同一解算器，记忆通道关闭（或残留 refMem） */
    var rr = rng((seed ^ 0x27d4eb2f) >>> 0);
    var refTable = buildTable(triples, refMem, 0, rr);

    var sr = rng((seed ^ 0x85ebca6b) >>> 0);
    var qr = rng((seed ^ 0xc2b2ae35) >>> 0);

    var rows = [];
    for (i = 0; i < n; i++) {
      var tr = triples[i];
      var row = {
        i: i, aA: tr.A.ans, aB: tr.B.ans, aC: tr.C.ans,
        chain: tr.chain, changed: tr.changed, rhoDesign: tr.rhoDesign
      };
      var tiers = ["A", "B", "C"];
      for (var j = 0; j < 3; j++) {
        var tier = tiers[j], it = tr[tier];
        var bm = bestMatch(table, it);
        var via = "compute", ans;
        if (bm.rec && bm.rho >= THETA && sr() < KAPPA_RECALL) {
          ans = bm.rec.stored; via = "recall";
        } else {
          ans = computeAnswer(it, subSkill, sr);
        }
        row[tier] = {
          ans: ans, ok: ans === it.ans, via: via,
          rho: +bm.rho.toFixed(4),
          stale: tier === "B" ? ans === tr.A.ans : null,
          /* 题面分段随行返回，界面上要标出"改的是哪一个数" */
          segs: it.segs
        };
        var bmr = bestMatch(refTable, it);
        var rans = (bmr.rec && bmr.rho >= THETA && qr() < KAPPA_RECALL)
          ? bmr.rec.stored : computeAnswer(it, refSkill, qr);
        row["r" + tier] = { ans: rans, ok: rans === it.ans, stale: tier === "B" ? rans === tr.A.ans : null };
      }
      rows.push(row);
    }

    /* ---- 聚合 ---- */
    function agg(list) {
      var accA = mean(list.map(function (x) { return x.A.ok ? 1 : 0; }));
      var accB = mean(list.map(function (x) { return x.B.ok ? 1 : 0; }));
      var accC = mean(list.map(function (x) { return x.C.ok ? 1 : 0; }));
      var refA = mean(list.map(function (x) { return x.rA.ok ? 1 : 0; }));
      var refB = mean(list.map(function (x) { return x.rB.ok ? 1 : 0; }));
      var refC = mean(list.map(function (x) { return x.rC.ok ? 1 : 0; }));
      var R = mean(list.map(function (x) { return x.B.stale ? 1 : 0; }));
      var R0 = mean(list.map(function (x) { return x.rB.stale ? 1 : 0; }));
      var rhoBar = mean(list.map(function (x) { return x.rhoDesign; }));
      var rhoHit = mean(list.map(function (x) { return x.B.rho; }));
      var eq = mean(list.map(function (x) { return x.aA === x.aB ? 1 : 0; }));
      var kappa = R0 >= 0.999 ? null : (R - R0) / (1 - R0);
      return {
        accA: accA, accB: accB, accC: accC,
        refA: refA, refB: refB, refC: refC,
        R: R, R0: R0, rhoBar: rhoBar, rhoHit: rhoHit, eqRate: eq, kappa: kappa,
        advAC: accA - accC, advBC: accB - accC
      };
    }

    var e = agg(rows);

    /* ---- 自助法：按题组重采样 ---- */
    var samples = [];
    var br = rng((seed ^ 0x165667b1) >>> 0);
    for (var b = 0; b < boot; b++) {
      var pick = [];
      for (i = 0; i < n; i++) pick.push(rows[Math.floor(br() * n)]);
      var eb = agg(pick);
      if (eb.kappa != null && isFinite(eb.kappa)) samples.push(eb.kappa);
    }
    samples.sort(function (a, b2) { return a - b2; });
    var lo = samples.length ? samples[Math.floor(samples.length * 0.025)] : null;
    var hi = samples.length ? samples[Math.floor(samples.length * 0.975)] : null;
    /* κ 的定义域是 [0,1]；区间按参数空间截断，点估计不截断 */
    var ci = samples.length ? [clamp(lo, 0, 1), clamp(hi, 0, 1)] : null;

    /* ---- 守卫 ---- */
    var guards = [];

    var eqGuard = e.eqRate <= 0.85;
    guards.push({
      id: "variant", ok: eqGuard,
      label: "变体改变了答案",
      detail: "甲与乙的正确答案相同的比例 " + (e.eqRate * 100).toFixed(0) + "%"
    });

    var probeGuard = e.rhoBar >= THETA;
    guards.push({
      id: "probe", ok: probeGuard,
      label: "探针接通（表面足够接近）",
      detail: "乙与甲的平均表面匹配 " + e.rhoBar.toFixed(2) + " / 阈值 " + THETA
    });

    var nGuard = n >= 60;
    guards.push({
      id: "n", ok: nGuard,
      label: "题组数足够",
      detail: n + " 组（下限 60）"
    });

    /* 参照组冷度：参照组在甲档上是否也占便宜 */
    var seRefAC = Math.sqrt(
      Math.max(1e-9, e.refA * (1 - e.refA) / n + e.refC * (1 - e.refC) / n)
    );
    var refCold = (e.refA - e.refC) < 1.96 * seRefAC;
    guards.push({
      id: "refcold", ok: refCold,
      label: "参照组是冷的",
      detail: "参照组 甲−丙 = " + ((e.refA - e.refC) * 100).toFixed(1) + "pp（噪声 " +
        (1.96 * seRefAC * 100).toFixed(1) + "pp）"
    });

    /* 变体难度：参照组在乙档上是否明显更差 */
    var seRefBC = Math.sqrt(
      Math.max(1e-9, e.refB * (1 - e.refB) / n + e.refC * (1 - e.refC) / n)
    );
    var diffOK = (e.refC - e.refB) < 1.96 * seRefBC;
    guards.push({
      id: "difficulty", ok: diffOK,
      label: "变体难度未漂移",
      detail: "参照组 丙−乙 = " + ((e.refC - e.refB) * 100).toFixed(1) + "pp（噪声 " +
        (1.96 * seRefBC * 100).toFixed(1) + "pp）"
    });

    /* ---- 判定 ---- */
    /* 通道状态：准确率通道可能被难度漂移或天花板吃掉，溯源通道只受"探针是否接通"影响 */
    var seAC = Math.sqrt(Math.max(1e-9, e.accA * (1 - e.accA) / n + e.accC * (1 - e.accC) / n));
    var advSig = (e.accA - e.accC) > 1.96 * seAC;
    var channels = {
      acc: diffOK ? (advSig ? "ok" : "blind") : "drift",
      trace: probeGuard ? "ok" : "off"
    };

    var verdict = "undetermined", subtype = "none", why = "";

    if (!eqGuard) {
      subtype = "vacuous";
      why = "乙架的正确答案与甲架相同的比例是 " + (e.eqRate * 100).toFixed(0) +
        "%，说明改数没有改变答案 —— 回吐率与准确率无法区分，这个设计提供不了任何信息。";
    } else if (!probeGuard) {
      subtype = "probe";
      why = "乙与甲的平均表面匹配只有 " + e.rhoBar.toFixed(2) + "，低于记忆触发阈值 " +
        THETA + "。记忆通道根本没被接上，所以 κ̂≈0 不是清白证明，只是探针没通电。";
    } else if (!nGuard) {
      subtype = "n";
      why = "只有 " + n + " 组题，区间宽度压不下来。这个效应量需要更多题组才能与噪声分开。";
    } else if (e.kappa == null) {
      subtype = "vacuous";
      why = "偶然率已达 1，分母塌陷，κ̂ 无定义。";
    } else if (ci && ((ci[0] <= 0.25 && ci[1] >= 0.25) || (ci[0] <= 0.60 && ci[1] >= 0.60))) {
      subtype = "straddle";
      why = "点估计 " + e.kappa.toFixed(2) + "，但区间 [" + ci[0].toFixed(2) + ", " +
        ci[1].toFixed(2) + "] 跨过了判定边界 —— 现在下结论等于拿噪声当效应。";
    } else if ((e.accC - e.accA) > 1.96 * seAC) {
      /* 记忆在扣分：唯一自洽的解释是泄漏数据里标错了。
         这一条不依赖 κ̂ —— κ̂ 只能看见"回吐了正确答案"的那部分记忆。 */
      verdict = "conflict"; subtype = "label";
      why = "甲架准确率（" + e.accA.toFixed(2) + "）显著低于丙架（" + e.accC.toFixed(2) +
        "，差 " + ((e.accC - e.accA) * 100).toFixed(1) + "pp），说明记忆在扣分；" +
        "而溯源通道测到的回吐只有 " + (e.kappa * 100).toFixed(0) +
        "%。两个通道只能同时成立于一种情形：泄漏的答案里有一部分本身是错的。" +
        "回吐错误答案与算错在行为上不可区分，所以 κ̂ 在这里是下界，不是估计。";
    } else if (e.kappa >= 0.60) {
      verdict = "supported"; subtype = "stale";
      why = "乙架上 " + (e.R * 100).toFixed(0) + "% 的答案就是原题答案，扣除偶然（" +
        (e.R0 * 100).toFixed(0) + "%）后仍有 " + (e.kappa * 100).toFixed(0) +
        "% 的题根本没算。这不是「记错了」，是没算。";
    } else if (!advSig) {
      verdict = "noeffect"; subtype = "noadv";
      why = "甲丙两档准确率差 " + ((e.accA - e.accC) * 100).toFixed(1) +
        "pp，与噪声（±" + (1.96 * seAC * 100).toFixed(1) +
        "pp）分不开 —— 见过这道题没有带来任何可测的优势，也就没有需要解释的东西。";
    } else if (e.kappa <= 0.25) {
      verdict = "refuted"; subtype = "compute";
      why = "乙架上的回吐率 " + (e.R * 100).toFixed(0) + "% 与参照组的偶然水平 " +
        (e.R0 * 100).toFixed(0) + "% 分不开 —— 在这么强的改写下，它在算。";
    } else {
      subtype = "mixed";
      why = "回吐压力 " + (e.kappa * 100).toFixed(0) +
        "%：一部分题在算，一部分题在搬旧答案。比例不足以判定主导。";
    }

    if (verdict === "supported" && channels.acc === "blind") {
      subtype = "ceiling";
      why += " 注意：甲丙准确率几乎相同，准确率通道被天花板吃掉了 —— 污染在分数上完全看不出来，只在行为上留下指纹。";
    }
    if (verdict === "supported" && channels.acc === "drift") {
      why += " 注意：参照组显示乙架更难，准确率通道因此失效；但 κ̂ 不依赖难度校准，结论仍然成立。";
    }

    return {
      ok: true,
      meta: {
        version: VERSION, protocol: PROTOCOL, seed: seed, n: n,
        rewrite: w, mem: mem, labelNoise: labelNoise, boot: boot,
        theta: THETA, subSkill: subSkill, refSkill: refSkill, refMem: refMem,
        retained: table.length
      },
      est: {
        accA: e.accA, accB: e.accB, accC: e.accC,
        refA: e.refA, refB: e.refB, refC: e.refC,
        R: e.R, R0: e.R0, kappa: e.kappa, ci: ci,
        rhoBar: e.rhoBar, rhoHit: e.rhoHit, eqRate: e.eqRate,
        advAC: e.advAC, advBC: e.advBC,
        tau: e.advAC > 0.01 ? e.advBC / e.advAC : null
      },
      guards: guards, channels: channels, advSig: advSig,
      verdict: verdict, subtype: subtype, why: why,
      rows: rows
    };
  }

  /* ---------------- 自检：已知真值能不能收回来 ---------------- */

  function selfCheck(opt) {
    opt = opt || {};
    var levels = opt.levels || [0, 0.25, 0.5, 0.75, 1.0];
    var seeds = opt.seeds || [20261030, 771, 1931];
    var n = opt.n == null ? 96 : opt.n;
    var t0 = Date.now();
    var rows = [], errs = [], cov = 0;

    levels.forEach(function (mem) {
      seeds.forEach(function (sd) {
        var r = runAudit({
          seed: sd, mem: mem, rewrite: opt.rewrite == null ? 0.45 : opt.rewrite,
          labelNoise: 0, n: n, boot: 240
        });
        var truth = mem * KAPPA_RECALL;
        var k = r.est.kappa;
        var e = k == null ? 1 : Math.abs(k - truth);
        errs.push(e);
        var hit = r.est.ci && r.est.ci[0] <= truth && truth <= r.est.ci[1];
        if (hit) cov++;
        rows.push({
          truth: +truth.toFixed(3), mem: mem, seed: sd,
          kappa: k == null ? null : +k.toFixed(3),
          ci: r.est.ci ? [+r.est.ci[0].toFixed(3), +r.est.ci[1].toFixed(3)] : null,
          err: +e.toFixed(3), hit: hit,
          verdict: r.verdict, subtype: r.subtype,
          R: +r.est.R.toFixed(3), R0: +r.est.R0.toFixed(3)
        });
      });
    });

    return {
      rows: rows,
      mae: +mean(errs).toFixed(4),
      coverage: cov + "/" + rows.length,
      coverageRate: cov / rows.length,
      ms: Date.now() - t0,
      n: rows.length
    };
  }

  /* ---------------- 负例：四种必须被拒绝的情形 ---------------- */

  function negatives() {
    var base = { seed: 20261030, n: 96, boot: 200 };
    var cases = [
      {
        id: "vacuous", name: "变体形同虚设",
        desc: "改写力度 0.10：只换了仓名与物件，数字一个没动。",
        expect: "变体未改变答案 → 拒判",
        opt: Object.assign({}, base, { rewrite: 0.10, mem: 0.85 })
      },
      {
        id: "probe", name: "探针没接通",
        desc: "改写力度 0.95：改了两个数，表面差异太大，记忆根本触发不了。",
        expect: "表面匹配低于阈值 → 拒判",
        opt: Object.assign({}, base, { rewrite: 0.95, mem: 0.85 })
      },
      {
        id: "label", name: "泄漏数据标错了",
        desc: "标签噪声 0.90：记忆里存的是错误答案，原题准确率被拉低。",
        expect: "准确率与溯源互相矛盾 → 结果冲突",
        opt: Object.assign({}, base, { rewrite: 0.45, mem: 0.90, labelNoise: 0.90 })
      },
      {
        id: "n", name: "题组太少",
        desc: "只有 30 组题，区间宽到盖住判定边界。",
        expect: "样本量不足 → 拒判",
        opt: Object.assign({}, base, { n: 30, rewrite: 0.45, mem: 0.55 })
      }
    ];
    return cases.map(function (c) {
      var r = runAudit(c.opt);
      return {
        id: c.id, name: c.name, desc: c.desc, expect: c.expect,
        verdict: r.verdict, subtype: r.subtype, why: r.why,
        kappa: r.est.kappa, ci: r.est.ci,
        passed: (c.id === "label" ? r.verdict === "conflict" : r.verdict === "undetermined")
      };
    });
  }

  /* ---------------- 窗口扫描：改写力度与可估性的关系 ---------------- */

  function sweep(opt) {
    opt = opt || {};
    var out = [];
    for (var w = 0.05; w <= 0.96; w += 0.1) {
      var r = runAudit({
        seed: opt.seed == null ? 20261030 : opt.seed,
        n: opt.n == null ? 96 : opt.n,
        mem: opt.mem == null ? 0.95 : opt.mem,
        rewrite: +w.toFixed(2), boot: 160
      });
      out.push({
        rewrite: +w.toFixed(2),
        kappa: r.est.kappa,
        ci: r.est.ci,
        rhoBar: +r.est.rhoBar.toFixed(3),
        eqRate: +r.est.eqRate.toFixed(3),
        accA: +r.est.accA.toFixed(3),
        accB: +r.est.accB.toFixed(3),
        accC: +r.est.accC.toFixed(3),
        refB: +r.est.refB.toFixed(3),
        refC: +r.est.refC.toFixed(3),
        verdict: r.verdict, subtype: r.subtype,
        usable: r.verdict !== "undetermined"
      });
    }
    return out;
  }

  /* ---------------- 参照体检：控制组自己是不是控制组 ---------------- */

  function refCheck(opt) {
    opt = opt || {};
    var cfgs = [
      { id: "cold", name: "冷参照", mem: 0, desc: "记忆通道完全关闭" },
      { id: "warm", name: "半冷参照", mem: 0.15, desc: "参照组自己也沾过一点语料" },
      { id: "hot", name: "不冷参照", mem: 0.55, desc: "参照组与原题同源，控制组失效" }
    ];
    return cfgs.map(function (c) {
      var r = runAudit({
        seed: opt.seed == null ? 20261030 : opt.seed,
        n: opt.n == null ? 96 : opt.n,
        rewrite: 0.45, mem: 0.85, refMem: c.mem, boot: 160
      });
      var g = r.guards.filter(function (x) { return x.id === "refcold"; })[0];
      return {
        id: c.id, name: c.name, desc: c.desc,
        refA: +r.est.refA.toFixed(3), refC: +r.est.refC.toFixed(3),
        gap: +((r.est.refA - r.est.refC) * 100).toFixed(1),
        certified: g.ok,
        detail: g.detail,
        kappa: r.est.kappa, verdict: r.verdict
      };
    });
  }

  return {
    VERSION: VERSION, PROTOCOL: PROTOCOL, THETA: THETA, KAPPA_RECALL: KAPPA_RECALL,
    runAudit: runAudit, selfCheck: selfCheck, negatives: negatives,
    sweep: sweep, refCheck: refCheck,
    _internals: {
      genTriple: genTriple, slotsOf: slotsOf, matchFrac: matchFrac,
      skillOf: skillOf, fold: fold, CHAINS: CHAINS
    }
  };
});

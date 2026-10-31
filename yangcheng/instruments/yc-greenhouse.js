/* ============================================================
   yc-greenhouse.js — H5 递归坍塌博物馆 · 谱系温室引擎  v0.2.0
   ------------------------------------------------------------
   问题：数据反复来自模型自身时，哪些信息会消失？

   这一版不画「一条模糊曲线」。它做四件老馆没做的事：

   ① 给每一层信息单独定死因
      把 p₀ 按密度排名切成 8 个质量层，每层每代算保留率，
      然后分三类：
        blind   分辨率外 —— N 太小，这层从来没被采到过
        wilted  递归枯萎 —— 看见了，然后在反复重采样里没了
        alive   幸存
      「尾部先死」这句话因此被拆成两种完全不同的病，
      而不是含糊地算成一个总体距离。

   ② 不用总体距离判坍塌
      TV 距离被主体质量主导。N=2000 时尾巴全死光，TV 只掉 0.08。
      用 TV 看坍塌会看到「什么都没发生」—— 这本身是展品。
      这里改用「分位层存活数」，按层等权，不按质量加权。

   ③ 把「一次实验」变成「一群谱系」
      单条谱系的枯萎世代是随机变量。只跑一条就宣布「第 X 代坍塌」，
      等于把一次抽样当成一个定律。默认播种 16 条平行谱系。

   ④ 给出可被自己证伪的归因
      N 只改变速度（ρ=0 时无移民，迟早全枯）；
      ρ 改变归宿（ρ>0 才有非退化稳态）。
      把观测窗拉长三倍，ρ=0 应全枯、ρ=0.3 应保持 —— 这一条能被推翻。

   模型本体（不是装饰）：
     世界 = [0,1] 上 96 个仓的离散分布 p₀（三峰 + 宽尾 + 十个极稀卫星仓）
     模型 = 同网格上的计数向量（最简非参数生成模型：直方图）
     每代：从模型抽 N(1-ρ) 件 + 从真分布抽 Nρ 件 → 重拟合
     这就是 Wright–Fisher 漂变 + 移民的离散版本，参数含义明确。

   为什么 α 平滑必须是 0：
     v0.1 用 α=0.5，结果层 8 的保留率跑到 2900%。因为加性平滑给每个
     空仓都塞了 α 的质量，96 个仓 × α/(N+96α) 在稀薄层里远大于真实
     概率 —— 平滑凭空造出了尾巴，把「尾巴死了」显示成「尾巴涨了」。
     这不是调参问题，是这类测量必须避开的系统性伪造。
     现在 α 默认 0，并留作自检项：把 α 调到 0.5，看它怎么骗人。

   随机数用 mulberry32。H4 的教训：xorshift32 前一两百个输出对 32 位
   种子低位有偏，会把抽样率变成结论里的偏差。这里同样不许用。
   ============================================================ */
(function (root) {
  "use strict";

  var VERSION = "0.2.0";

  /* ---------------- 世界 ---------------- */
  var K = 96;                 /* 仓数：分辨率的下限由它决定 */
  var NL = 8;                 /* 质量层数 */
  var EDGES = [0.5, 0.75, 0.90, 0.97, 0.99, 0.997, 0.999, 1.0];
  var LAYER_NAME = [
    "最密 50%", "50—75%", "75—90%", "90—97%",
    "97—99%", "99—99.7%", "99.7—99.9%", "99.9—100%"
  ];
  var UNI_FROM = 79;                 /* x ≥ 0.82 的起始仓（79.5/96 = 0.828） */
  var SAT_FROM = 84, SAT_TO = 94;    /* 十个极稀卫星仓：x 0.880—0.984 */

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

  function gaussPdf(x, mu, sd) {
    var z = (x - mu) / sd;
    return Math.exp(-0.5 * z * z) / (sd * 2.5066282746);
  }

  /* p₀：三个不同宽度的峰 + 一段宽尾 + 十个极稀卫星仓。
     卫星仓是故意的：它们是「尾部先死」这句话唯一能被证伪的地方 ——
     如果连它们都活着，那就不该说尾巴先死。 */
  function buildWorld() {
    var p = new Array(K), i, x, v, sum = 0;
    for (i = 0; i < K; i++) {
      x = (i + 0.5) / K;
      v = (0.32 * gaussPdf(x, 0.20, 0.050)
         + 0.26 * gaussPdf(x, 0.46, 0.022)
         + 0.24 * gaussPdf(x, 0.68, 0.090)) / K;
      if (i >= UNI_FROM) v += 0.16 / (K - UNI_FROM);                    /* 宽尾 17 仓 */
      if (i >= SAT_FROM && i < SAT_TO) v += 0.03 / (SAT_TO - SAT_FROM); /* 卫星 10 仓 */
      p[i] = v; sum += v;
    }
    for (i = 0; i < K; i++) p[i] /= sum;
    return p;
  }

  /* 质量层：按 p₀ 密度从高到低累计，切在累计质量的 50/75/90/97/99/99.7/99.9%。
     分层依据是「密度排名」而不是「x 位置」—— 同一层里可以是好几个分散的仓，
     这正是要的：层 8 装的是「最稀的那 0.1% 质量」，它散落在哪里不重要。 */
  function layerMap(p) {
    var idx = [], i, b;
    for (i = 0; i < K; i++) idx.push(i);
    idx.sort(function (a, c) { return p[c] - p[a]; });
    var L = new Array(K), cum = 0;
    for (i = 0; i < K; i++) {
      b = idx[i];
      var mid = cum + p[b] / 2, li = 0;
      while (li < NL - 1 && mid >= EDGES[li]) li++;
      L[b] = li;
      cum += p[b];
    }
    return L;
  }

  function layerMass(p, L) {
    var m = new Array(NL), l;
    for (l = 0; l < NL; l++) m[l] = 0;
    for (var i = 0; i < K; i++) m[L[i]] += p[i];
    return m;
  }

  function layerBins(L) {
    var c = new Array(NL), l;
    for (l = 0; l < NL; l++) c[l] = 0;
    for (var i = 0; i < K; i++) c[L[i]]++;
    return c;
  }

  /* ---------------- 抽样 ---------------- */
  function cumOf(q) {
    var c = new Float64Array(K), s = 0, i;
    for (i = 0; i < K; i++) { s += q[i]; c[i] = s; }
    return c;
  }

  function sampleInto(counts, cum, n, rnd) {
    var total = cum[K - 1];
    for (var t = 0; t < n; t++) {
      var u = rnd() * total, lo = 0, hi = K - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cum[mid] < u) lo = mid + 1; else hi = mid;
      }
      counts[lo]++;
    }
  }

  /* ---------------- 逐代测量 ---------------- */
  /* 两个指标，分工明确：
       ret  质量比 = 该层在模型里的质量 / 在真分布里的质量。
            稀薄层一旦落进一两个计数就会爆到 5×、20×，读起来像「变多了」。
            它只适合看主体层，不适合判死活。
       cov  支撑覆盖率 = 该层的仓还有几成在模型里有非零质量。
            这是判死活的量：它不随质量膨胀，单调、可解释
            （「这层还剩几成仓」），而且 α=0 时一旦归零就是吸收态。
     判死活用 cov，看形变用 ret。混用会把「一个计数撞上了」说成「这层还活着」。 */
  function measure(q, p0, L, LM, binCount) {
    var i, l, tv = 0, H = 0;
    for (i = 0; i < K; i++) {
      tv += Math.abs(q[i] - p0[i]);
      if (q[i] > 1e-12) H -= q[i] * Math.log(q[i]);
    }
    var lm = new Array(NL), ret = new Array(NL), cov = new Array(NL);
    for (l = 0; l < NL; l++) { lm[l] = 0; cov[l] = 0; }
    for (i = 0; i < K; i++) {
      lm[L[i]] += q[i];
      if (q[i] > 1e-12) cov[L[i]]++;
    }
    for (l = 0; l < NL; l++) {
      ret[l] = LM[l] > 0 ? lm[l] / LM[l] : 0;
      cov[l] = binCount[l] > 0 ? cov[l] / binCount[l] : 0;
    }
    return { tv: tv / 2, fid: 1 - tv / 2, H: Math.exp(H), ret: ret, cov: cov, lm: lm };
  }

  /* ---------------- 单条谱系 ---------------- */
  /* 第 0 代 = 用无限真数据训练出来的模型（就是 p₀ 本身）。
     这样「第 1 代掉多少」就只反映采样分辨率，不含初始拟合误差。 */
  function runLine(seed, o, L, p0, LM, BC) {
    var rnd = mulberry32(seed);
    var q = p0.slice();
    var gens = [], g, i;
    var nReal = Math.round(o.N * o.rho);
    var nSyn = o.N - nReal;
    var cum0 = nReal > 0 ? cumOf(p0) : null;
    for (g = 1; g <= o.G; g++) {
      var counts = new Float64Array(K);
      if (nSyn > 0) sampleInto(counts, cumOf(q), nSyn, rnd);
      if (nReal > 0) sampleInto(counts, cum0, nReal, rnd);
      var nq = new Array(K), s = 0;
      for (i = 0; i < K; i++) { nq[i] = counts[i] + o.alpha; s += nq[i]; }
      for (i = 0; i < K; i++) nq[i] /= s;
      q = nq;
      var m = measure(q, p0, L, LM, BC);
      m.g = g;
      m.q = q;            /* 保留该代分布，供镜面显示平均形变 */
      gens.push(m);
    }
    return { seed: seed, gens: gens };
  }

  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; });
    if (!b.length) return NaN;
    var n = b.length;
    return n % 2 ? b[(n - 1) >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }

  function mean(a) {
    if (!a.length) return NaN;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  /* 可见门槛：一个层在第 1 代的支撑覆盖率要达到一半，才算「被看见」。
     低于一半不是坍塌，是没采到 —— 两者必须分开报，否则会把
     「根本没看见」说成「看见了然后没了」。 */
  var VIS_MIN = 0.5;

  var DEF = {
    seed: 20311030,
    rho: 0.05,
    N: 400,
    G: 24,
    lines: 16,
    alpha: 0
  };

  /* 由第 1 代的支撑覆盖率决定「哪些层被看见了」。
     注意这是设计属性（N 与世界决定），不是某条谱系的运气：
     取的是跨谱系中位数，所以对单条谱系的随机性免疫。 */
  function visibleOf(cov1) {
    var j = [], b = [], l;
    for (l = 0; l < NL; l++) {
      if (cov1[l] >= VIS_MIN) j.push(l); else b.push(l);
    }
    return { judgeable: j, blind: b };
  }

  function run(opt) {
    var o = {}, k;
    for (k in DEF) if (DEF.hasOwnProperty(k)) o[k] = DEF[k];
    if (opt) for (k in opt) if (opt.hasOwnProperty(k) && opt[k] !== undefined) o[k] = opt[k];

    var t0 = (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();

    var p0 = buildWorld();
    var L = layerMap(p0);
    var LM = layerMass(p0, L);
    var BC = layerBins(L);

    var lines = [], li, g, l;

    /* 第一步：只跑，不做判定。判定范围要先从第 1 代算出来，
       不能在跑之前用「期望计数」猜 —— 那会把「撞上一个计数」的层
       误判成可见、把真正可见的层误判成不可见。 */
    for (li = 0; li < o.lines; li++) {
      lines.push(runLine((o.seed + li * 7919) >>> 0, o, L, p0, LM, BC));
    }

    /* 第二步：聚合逐代跨谱系中位数 */
    var byGen = [];
    for (g = 0; g < o.G; g++) {
      var fid = [], H = [], rl = [], cl = [];
      for (l = 0; l < NL; l++) { rl.push([]); cl.push([]); }
      for (li = 0; li < lines.length; li++) {
        var gx = lines[li].gens[g];
        fid.push(gx.fid); H.push(gx.H);
        for (l = 0; l < NL; l++) { rl[l].push(gx.ret[l]); cl[l].push(gx.cov[l]); }
      }
      var ret = [], cov = [];
      for (l = 0; l < NL; l++) { ret.push(median(rl[l])); cov.push(median(cl[l])); }
      /* 平均分布：镜面显示用。中位数对分布没有定义，所以用跨谱系平均，
         并在界面上写明「16 条谱系的平均形变」，不假装这是某一条。 */
      var meanQ = new Array(K), i2;
      for (i2 = 0; i2 < K; i2++) meanQ[i2] = 0;
      for (li = 0; li < lines.length; li++) {
        var qq = lines[li].gens[g].q;
        for (i2 = 0; i2 < K; i2++) meanQ[i2] += qq[i2] / lines.length;
      }
      byGen.push({ g: g + 1, fid: median(fid), H: median(H), ret: ret, cov: cov, meanQ: meanQ });
    }

    /* 第三步：判定范围 = 第 1 代支撑覆盖率 ≥ 一半的层 */
    var vis = visibleOf(byGen[0].cov);
    var judgeable = vis.judgeable, blind = vis.blind;

    /* 第四步：逐条谱系判枯萎（只看被看见的层）
       判据是「相对支撑保留」而不是绝对值：
         keep = 末代覆盖率 / 第 1 代覆盖率，keep < 0.5 才算枯。
       用绝对值会冤枉本来就起步低的层 —— 一个第 1 代只有 0.55 覆盖的层，
       掉到 0.45 只是正常抖动，不是坍塌。 */
    for (li = 0; li < lines.length; li++) {
      var ln = lines[li], lost = [], keepEnd = [];
      var first = ln.gens[0], fin = ln.gens[ln.gens.length - 1];
      for (var jj = 0; jj < judgeable.length; jj++) {
        var lx = judgeable[jj];
        var k = first.cov[lx] > 1e-9 ? fin.cov[lx] / first.cov[lx] : 0;
        keepEnd.push(k);
        if (k < VIS_MIN) lost.push(lx);
      }
      ln.keep = keepEnd;
      ln.lost = lost;
      /* 枯萎世代取「持续枯萎」的起点：最后一次还在阈值以上的下一代。
         单代抖动不算枯萎 —— 有移民时层会回光返照，取首次跌破会把它误判成早死。 */
      ln.deathGen = null;
      for (jj = 0; jj < judgeable.length; jj++) {
        var l2 = judgeable[jj], lastOk = 0;
        for (g = 0; g < ln.gens.length; g++) {
          var kk = first.cov[l2] > 1e-9 ? ln.gens[g].cov[l2] / first.cov[l2] : 0;
          if (kk >= VIS_MIN) lastOk = g + 1;
        }
        if (lastOk < ln.gens.length) {
          var d = lastOk + 1;
          if (ln.deathGen === null || d < ln.deathGen) ln.deathGen = d;
        }
      }
      ln.final = fin;
    }

    /* 逐代存活率（现在能算了） */
    for (g = 0; g < o.G; g++) {
      var surv = 0, clean = 0;
      for (li = 0; li < lines.length; li++) {
        if (lines[li].deathGen === null || lines[li].deathGen > g + 1) surv++;
        if (lines[li].lost.length === 0) clean++;
      }
      byGen[g].surv = surv / lines.length;
      byGen[g].clean = clean / lines.length;
    }

    /* 每层的归宿（用跨谱系中位覆盖率算相对保留） */
    var last = byGen[byGen.length - 1], firstG = byGen[0];
    var fate = [], keepG = [], wiltedLayers = [], blindLayers = blind.slice(), aliveLayers = [];
    for (l = 0; l < NL; l++) {
      var kp = firstG.cov[l] > 1e-9 ? last.cov[l] / firstG.cov[l] : 0;
      keepG.push(kp);
      if (blind.indexOf(l) >= 0) fate.push("blind");
      else if (kp < VIS_MIN) { fate.push("wilted"); wiltedLayers.push(l); }
      else { fate.push("alive"); aliveLayers.push(l); }
    }

    /* 主结论挂在「跨谱系中位枯萎层数」上，而不是「任一层枯」。
       后者太松：ρ=0.5 时最稀的可见层也会偶尔掉一半，于是永远报不出「稳定」。 */
    var lostCounts = lines.map(function (x) { return x.lost.length; });
    var medLost = median(lostCounts);
    var wiltFrac = mean(lostCounts.map(function (n) { return n > 0 ? 1 : 0; }));
    var deaths = lines.filter(function (x) { return x.deathGen !== null; })
                      .map(function (x) { return x.deathGen; });

    /* 枯萎的层全在稀薄半边？那叫「按分位坍塌」；主体也枯了叫「全面坍塌」 */
    var mid = Math.floor(judgeable.length / 2);
    var denseJudge = judgeable.slice(0, mid);
    var denseWilted = wiltedLayers.filter(function (x) { return denseJudge.indexOf(x) >= 0; });

    var verdict, subtype, why;

    if (o.lines < 8) {
      verdict = "undetermined"; subtype = "few";
      why = "只播了 " + o.lines + " 条谱系。单条谱系的枯萎世代是随机变量，" +
            "一条线不构成一个定律 —— 至少 8 条才能把「必然」和「这次刚好」分开。";
    } else if (o.G < 5) {
      verdict = "undetermined"; subtype = "short";
      why = "观测窗只有 " + o.G + " 代。没枯萎可能只是还没到，" +
            "枯萎了也可能只是刚起步 —— 这个长度不足以谈「归宿」。";
    } else if (o.rho >= 1) {
      verdict = "undetermined"; subtype = "nonrecursive";
      why = "ρ = 1 意味着每一代都用纯新鲜真数据，模型输出一件都没进训练集。" +
            "这不是递归条件，测出来的只是「有限样本拟合误差」。";
    } else if (judgeable.length < 2) {
      verdict = "undetermined"; subtype = "resolution";
      why = "N = " + o.N + " 时，8 个质量层里只有 " + judgeable.length +
            " 层的期望计数够得上「被看见」。这不是坍塌，是分辨率不够 —— " +
            "加大采样量再来问。";
    } else if (medLost === 0 && wiltFrac <= 0.20) {
      verdict = "refuted"; subtype = "stable";
      why = "在 ρ = " + o.rho + "、N = " + o.N + "、G = " + o.G + " 下，过半谱系一层都没枯，" +
            "枯萎的谱系占 " + (wiltFrac * 100).toFixed(0) + "%。" +
            "至少在这个观测窗内，没测到成规模的不可逆信息损失。";
    } else if (medLost === 0) {
      verdict = "conflict"; subtype = "spread";
      why = "多数谱系一层都没枯（中位枯萎层数 0），但有 " + (wiltFrac * 100).toFixed(0) +
            "% 的谱系枯了至少一层。这说明参数正好压在临界线上 —— " +
            "任何人只跑一次，得到的结论都取决于运气。";
    } else if (wiltFrac >= 0.80) {
      if (denseWilted.length > 0) {
        verdict = "supported"; subtype = "body";
        why = "连主体质量层也枯了（第 " + denseWilted.map(function (x) { return x + 1; }).join("、") +
              " 层只剩不到一半的仓）。" + (wiltFrac * 100).toFixed(0) + "% 的谱系在 " + o.G +
              " 代内中位丢了 " + medLost + " 层 —— 这是全面坍塌，不只是尾巴。";
      } else {
        verdict = "supported"; subtype = "tail";
        why = "主体层全在，枯的是第 " +
              wiltedLayers.map(function (x) { return x + 1; }).join("、") + " 层。" +
              (wiltFrac * 100).toFixed(0) + "% 的谱系在 " + o.G +
              " 代内中位丢了 " + medLost + " 层 —— 坍塌按分位发生：越稀的先死，而且是不可逆的。";
      }
    } else {
      verdict = "conflict"; subtype = "spread";
      why = "中位枯萎层数 " + medLost + "，但只有 " + (wiltFrac * 100).toFixed(0) +
            "% 的谱系枯了 —— 同一组参数下谱系之间分歧很大。" +
            "这个混合比正好在临界附近，任何单次实验的结论都会是运气。";
    }

    /* 附注：ρ = 0 时没有移民，观测窗只是「还没死完」 */
    var note = null;
    if (o.rho === 0 && medLost === 0 && judgeable.length >= 2) {
      note = "ρ = 0 时没有任何新信息输入，枯萎是吸收态：一旦某层的仓全归零就再也回不来。" +
             "现在还有 " + ((1 - wiltFrac) * 100).toFixed(0) + "% 的谱系一层都没枯，" +
             "只说明 " + o.G + " 代还不够长，不代表它们能一直活下去 —— 去「归因」里把窗口拉长三倍看看。";
    }

    var guards = [
      { key: "rec", label: "递归守卫", ok: o.rho < 1,
        detail: "ρ = " + o.rho + "，每代 " + Math.round(o.N * (1 - o.rho)) + " 件来自模型自身" },
      { key: "lines", label: "谱系守卫", ok: o.lines >= 8,
        detail: o.lines + " 条平行谱系（≥8 才分得开随机与必然）" },
      { key: "len", label: "长度守卫", ok: o.G >= 5,
        detail: "观测窗 " + o.G + " 代" },
      { key: "res", label: "分辨率守卫", ok: judgeable.length >= 4,
        detail: "可见 " + judgeable.length + "/8 层" +
                (blind.length ? "，看不见第 " + blind.map(function (x) { return x + 1; }).join("、") + " 层" : "") }
    ];

    var ms = ((typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now()) - t0;

    return {
      meta: {
        version: VERSION, seed: o.seed, rho: o.rho, N: o.N, G: o.G,
        lines: o.lines, alpha: o.alpha,
        K: K, NL: NL, edges: EDGES, layerName: LAYER_NAME,
        visMin: VIS_MIN, uniFrom: UNI_FROM, satFrom: SAT_FROM, satTo: SAT_TO
      },
      p0: p0, L: L, LM: LM,
      lines: lines, byGen: byGen,
      judgeable: judgeable, blind: blind,
      fate: fate, wiltedLayers: wiltedLayers, blindLayers: blindLayers, aliveLayers: aliveLayers,
      est: {
        wiltFrac: wiltFrac, surviveFrac: 1 - wiltFrac, medLost: medLost, keepG: keepG,
        wilted: wiltedLayers.length, blind: blind.length, alive: aliveLayers.length,
        fid0: byGen[0].fid, fidG: last.fid, H0: byGen[0].H, HG: last.H,
        medDeath: deaths.length ? median(deaths) : null,
        deathMin: deaths.length ? Math.min.apply(null, deaths) : null,
        deathMax: deaths.length ? Math.max.apply(null, deaths) : null,
        deaths: deaths,
        layerRetG: last.ret, layerRet1: byGen[0].ret,
        layerCovG: last.cov, layerCov1: byGen[0].cov
      },
      verdict: verdict, subtype: subtype, why: why, note: note,
      guards: guards, ms: ms
    };
  }

  /* ---------------- 归因：N 改速度，ρ 改归宿 ---------------- */
  /* 四个对照，同一世界、同一 seed：
       A  ρ=0     N      G     基准
       B  ρ=0     8N     G     只加预算，窗口不变
       C  ρ=0     8N     3G    加预算 + 拉长窗口，仍无移民
       D  ρ=0.30  N      3G    拉长窗口 + 有移民
     三条预测：
       ① B 的存活率不低于 A —— 预算变多，同窗口内枯萎更少（速度效应）
       ② C 的存活率仍接近 0 —— 八倍预算也救不回无移民的归宿
       ③ D 的存活率显著高于 C —— 同窗口下，移民才是改变结局的东西
     若 ②③ 同时成立，「N 小所以尾部死了」就只解释了「早死」，解释不了「必死」。
     这一条能被推翻：如果 C 保持住了，或者 D 没比 C 好，归因就不成立。 */
  function decompose(opt) {
    var o = {}, k;
    for (k in DEF) if (DEF.hasOwnProperty(k)) o[k] = DEF[k];
    if (opt) for (k in opt) if (opt.hasOwnProperty(k) && opt[k] !== undefined) o[k] = opt[k];

    var L8 = Math.min(o.lines, 8);
    var A = run({ seed: o.seed, rho: 0, N: o.N, G: o.G, lines: L8, alpha: o.alpha });
    var B = run({ seed: o.seed, rho: 0, N: o.N * 8, G: o.G, lines: L8, alpha: o.alpha });
    var C = run({ seed: o.seed, rho: 0, N: o.N * 8, G: o.G * 3, lines: L8, alpha: o.alpha });
    var D = run({ seed: o.seed, rho: 0.30, N: o.N, G: o.G * 3, lines: L8, alpha: o.alpha });

    var sv = function (r) { return r.est.surviveFrac; };

    var md = function (r) { return r.est.medDeath === null ? o.G + 1 : r.est.medDeath; };
    var preds = [
      { key: "speed", text: "预算 ×8、窗口不变：中位枯萎世代应明显推迟",
        ok: md(B) >= md(A) + 3,
        got: "第 " + md(A) + " 代 → 第 " + md(B) + " 代" },
      { key: "fate", text: "预算 ×8、窗口 ×3、仍无移民：存活率应仍接近 0",
        ok: sv(C) <= 0.15,
        got: (sv(B) * 100).toFixed(0) + "% → " + (sv(C) * 100).toFixed(0) + "%" },
      { key: "mix", text: "同窗口下加 30% 移民：存活率应显著高于无移民",
        ok: sv(D) >= sv(C) + 0.40,
        got: (sv(C) * 100).toFixed(0) + "% → " + (sv(D) * 100).toFixed(0) + "%" }
    ];
    var hit = preds.filter(function (p) { return p.ok; }).length;

    var v, txt;
    if (hit === 3) {
      v = "confirmed";
      txt = "三条预测全部成立。八倍预算把中位枯萎世代从第 " + md(A) + " 代推迟到第 " + md(B) +
            " 代（速度变慢了），但窗口拉长三倍后存活率仍然归零到 " + (sv(C) * 100).toFixed(0) +
            "%（归宿没变）；同样长度的窗口里加 30% 移民，存活率是 " + (sv(D) * 100).toFixed(0) +
            "%。所以「N 小所以尾部死了」只解释了「早死」，解释不了「必死」—— " +
            "决定归宿的是有没有新信息进来。";
    } else if (hit === 2) {
      v = "partial";
      txt = "三条预测成立两条。方向大致对，但有环节没对上 —— " +
            "看下面逐条结果，别把整句话当结论。";
    } else {
      v = "failed";
      txt = "三条预测只成立 " + hit + " 条。这次不能把差异归给预算或移民，" +
            "参数区间可能落在这套模型不适用的地方。";
    }

    return {
      A: { rho: 0, N: o.N, G: o.G, surv: sv(A), medDeath: A.est.medDeath, wilted: A.est.wilted },
      B: { rho: 0, N: o.N * 8, G: o.G, surv: sv(B), medDeath: B.est.medDeath, wilted: B.est.wilted },
      C: { rho: 0, N: o.N * 8, G: o.G * 3, surv: sv(C), medDeath: C.est.medDeath, wilted: C.est.wilted },
      D: { rho: 0.30, N: o.N, G: o.G * 3, surv: sv(D), medDeath: D.est.medDeath, wilted: D.est.wilted },
      preds: preds, hit: hit, verdict: v, text: txt,
      ms: A.ms + B.ms + C.ms + D.ms
    };
  }

  /* ---------------- 混合比扫描：找临界点 ---------------- */
  function sweepRho(opt) {
    var o = {}, k;
    for (k in DEF) if (DEF.hasOwnProperty(k)) o[k] = DEF[k];
    if (opt) for (k in opt) if (opt.hasOwnProperty(k) && opt[k] !== undefined) o[k] = opt[k];
    var grid = [0, 0.02, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.50];
    var out = [], i;
    for (i = 0; i < grid.length; i++) {
      var r = run({ seed: o.seed, N: o.N, G: o.G, lines: Math.min(o.lines, 12), alpha: o.alpha,
                    rho: grid[i] });
      out.push({
        rho: grid[i], surv: r.est.surviveFrac, wilted: r.est.wilted,
        blind: r.est.blind, alive: r.est.alive,
        fid: r.est.fidG, verdict: r.verdict, subtype: r.subtype
      });
    }
    /* 临界混合比：存活率首次 ≥ 0.5 的位置，线性插值 */
    var crit = null;
    for (i = 1; i < out.length; i++) {
      if (out[i - 1].surv < 0.5 && out[i].surv >= 0.5) {
        var a = out[i - 1], b = out[i];
        crit = a.rho + (0.5 - a.surv) / (b.surv - a.surv) * (b.rho - a.rho);
        break;
      }
    }
    return { points: out, crit: crit };
  }

  /* ---------------- 采样量扫描：看得见多细 ---------------- */
  function sweepN(opt) {
    var o = {}, k;
    for (k in DEF) if (DEF.hasOwnProperty(k)) o[k] = DEF[k];
    if (opt) for (k in opt) if (opt.hasOwnProperty(k) && opt[k] !== undefined) o[k] = opt[k];
    var grid = [100, 300, 1000, 3000, 10000, 30000];
    var p0 = buildWorld(), L = layerMap(p0), LM = layerMass(p0, L), BC = layerBins(L);
    var out = [], i, l, s;
    for (i = 0; i < grid.length; i++) {
      var rs = [];
      for (s = 0; s < 6; s++) {
        var ln = runLine((o.seed + s * 104729) >>> 0, { N: grid[i], rho: 1, G: 1, alpha: o.alpha }, L, p0, LM, BC);
        rs.push(ln.gens[0]);
      }
      var ret = [], cov = [];
      for (l = 0; l < NL; l++) {
        ret.push(median(rs.map(function (x) { return x.ret[l]; })));
        cov.push(median(rs.map(function (x) { return x.cov[l]; })));
      }
      out.push({ N: grid[i], ret: ret, cov: cov,
                 fid: median(rs.map(function (x) { return x.fid; })),
                 visible: visibleOf(cov).judgeable.length });
    }
    return { points: out, layerName: LAYER_NAME };
  }

  /* ---------------- 同 seed 反事实 ---------------- */
  function counterfactual(opt) {
    var o = {}, k;
    for (k in DEF) if (DEF.hasOwnProperty(k)) o[k] = DEF[k];
    if (opt) for (k in opt) if (opt.hasOwnProperty(k) && opt[k] !== undefined) o[k] = opt[k];
    var a = run({ seed: o.seed, rho: 0, N: o.N, G: o.G, lines: 1, alpha: o.alpha });
    var b = run({ seed: o.seed, rho: o.rho || 0.15, N: o.N, G: o.G, lines: 1, alpha: o.alpha });
    return {
      zero: { rho: 0, line: a.lines[0] },
      mix: { rho: o.rho || 0.15, line: b.lines[0] }
    };
  }

  /* ---------------- 自检：在有真值的地方回收真值 ---------------- */
  function selfCheck() {
    var rows = [];
    var p0 = buildWorld(), L = layerMap(p0), LM = layerMass(p0, L), BC = layerBins(L);

    /* ① 吸收性（ρ=0、α=0）：某层一旦归零，后续必须永远为零。
          这是定理不是现象 —— 零概率的仓永远抽不到，也就永远回不来。 */
    var abs = 0, absN = 0;
    [300, 1200, 5000].forEach(function (N) {
      for (var s = 0; s < 3; s++) {
        var ln = runLine((4001 + s * 31) >>> 0, { N: N, rho: 0, G: 18, alpha: 0 }, L, p0, LM, BC);
        var ok = true;
        for (var l = 0; l < NL; l++) {
          var dead = false;
          for (var g = 0; g < ln.gens.length; g++) {
            var r = ln.gens[g].ret[l];
            if (dead && r > 1e-12) { ok = false; break; }
            if (r <= 1e-12) dead = true;
          }
        }
        absN++; if (ok) abs++;
      }
    });
    rows.push({
      key: "absorb", label: "吸收性（ρ=0）",
      pass: abs === absN, got: abs + "/" + absN, want: "全部成立",
      note: "归零的层不会自己复活 —— 这是「不可逆」的数学根据"
    });

    /* ② 无递归（ρ=1）：每代都是对 p₀ 的独立采样，保真度不随代数下滑 */
    var flat = 0, flatN = 0, sl = [];
    [600, 2000, 6000].forEach(function (N) {
      for (var s = 0; s < 4; s++) {
        var ln = runLine((5003 + s * 37) >>> 0, { N: N, rho: 1, G: 14, alpha: 0 }, L, p0, LM, BC);
        var gs = ln.gens;
        var slope = (gs[gs.length - 1].fid - gs[0].fid) / (gs.length - 1);
        sl.push(slope);
        flatN++; if (slope > -0.006) flat++;
      }
    });
    rows.push({
      key: "flat", label: "无递归（ρ=1）",
      pass: flat === flatN, got: flat + "/" + flatN + "（斜率 " + mean(sl).toFixed(4) + "）",
      want: "斜率 > −0.006", note: "纯新鲜数据时只有采样噪声，不该有逐代下滑"
    });

    /* ③ 分位单调（第 1 代）：支撑覆盖率必须随层号递减（稀薄层丢仓更狠）
          用覆盖率而不是质量比 —— 质量比在稀薄层会被一两个计数抬到 5×，
          方向就乱了；覆盖率不会。 */
    var ord = 0, ordN = 0, ordWorst = 1;
    [200, 1000, 5000].forEach(function (N) {
      var per = [];
      for (var l = 0; l < NL; l++) per.push([]);
      for (var s = 0; s < 9; s++) {
        var ln = runLine((6007 + s * 41) >>> 0, { N: N, rho: 1, G: 1, alpha: 0 }, L, p0, LM, BC);
        for (var l2 = 0; l2 < NL; l2++) per[l2].push(ln.gens[0].cov[l2]);
      }
      var med = per.map(median), ok = true, bad = 0;
      for (var l3 = 1; l3 < NL; l3++) if (med[l3] > med[l3 - 1] + 1e-9) { ok = false; bad = Math.max(bad, med[l3] - med[l3 - 1]); }
      ordWorst = Math.min(ordWorst, 1);
      ordN++; if (ok) ord++;
    });
    rows.push({
      key: "order", label: "分位单调（第 1 代）",
      pass: ord === ordN, got: ord + "/" + ordN, want: "全部单调递减",
      note: "稀薄层丢仓更狠，这是可预测的方向；用覆盖率量，不用质量比"
    });

    /* ④ 预算回收：采样量放大，可见层数必须不减 */
    var up = 0, upN = 0, upDet = [];
    [300, 1000, 4000].forEach(function (N) {
      var a = run({ seed: 9101, N: N, rho: 1, G: 1, lines: 6, alpha: 0 });
      var b = run({ seed: 9101, N: N * 4, rho: 1, G: 1, lines: 6, alpha: 0 });
      upDet.push(a.judgeable.length + "→" + b.judgeable.length);
      upN++; if (b.judgeable.length >= a.judgeable.length) up++;
    });
    rows.push({
      key: "budget", label: "预算回收",
      pass: up === upN, got: up + "/" + upN + "（" + upDet.join("、") + "）", want: "可见层数不减",
      note: "把采样量翻四倍，能看见的层只能更多，不能更少"
    });

    /* ⑤ 平滑伪造：α>0 会在空区域凭空造出质量，把「死了」显示成「涨了」 */
    var fake = 0, fakeN = 0, worst = 0;
    [300, 1200].forEach(function (N) {
      var a = runLine(8009, { N: N, rho: 0, G: 6, alpha: 0 }, L, p0, LM, BC);
      var b = runLine(8009, { N: N, rho: 0, G: 6, alpha: 0.5 }, L, p0, LM, BC);
      var ra = a.gens[5].ret[7], rb = b.gens[5].ret[7];
      worst = Math.max(worst, rb);
      fakeN++; if (rb > ra + 0.5) fake++;
    });
    rows.push({
      key: "smooth", label: "平滑伪造",
      pass: fake === fakeN, got: fake + "/" + fakeN + "（α=0.5 时层 8 最高 " + worst.toFixed(1) + "×）",
      want: "α=0.5 必须明显虚高",
      note: "加性平滑给每个空仓都塞质量，稀薄层会被凭空复活 —— 所以 α 固定为 0"
    });

    return { rows: rows, allPass: rows.every(function (r) { return r.pass; }) };
  }

  /* ---------------- 负例：每条拒判线都要能真的触发 ---------------- */
  function negatives() {
    var cases = [
      { key: "few", label: "只播一条", opt: { lines: 1, rho: 0.02, N: 400, G: 20 },
        want: "undetermined/few" },
      { key: "short", label: "观测窗太短", opt: { lines: 12, rho: 0.02, N: 400, G: 3 },
        want: "undetermined/short" },
      { key: "nonrec", label: "全是新鲜数据", opt: { lines: 12, rho: 1, N: 400, G: 20 },
        want: "undetermined/nonrecursive" },
      { key: "res", label: "采样量太小", opt: { lines: 12, rho: 0.02, N: 12, G: 20 },
        want: "undetermined/resolution" },
      { key: "spread", label: "临界混合比", opt: { lines: 16, rho: 0.15, N: 400, G: 24 },
        want: "conflict/spread" }
    ];
    return cases.map(function (c) {
      var r = run(c.opt);
      return {
        key: c.key, label: c.label, want: c.want,
        got: r.verdict + "/" + r.subtype,
        pass: (r.verdict + "/" + r.subtype) === c.want,
        detail: r.why
      };
    });
  }

  var API = {
    VERSION: VERSION, K: K, NL: NL, EDGES: EDGES, LAYER_NAME: LAYER_NAME,
    VIS_MIN: VIS_MIN, DEFAULTS: DEF,
    world: buildWorld, layerMap: layerMap, layerMass: layerMass, layerBins: layerBins, visibleOf: visibleOf,
    run: run, decompose: decompose, sweepRho: sweepRho, sweepN: sweepN,
    counterfactual: counterfactual, selfCheck: selfCheck, negatives: negatives,
    median: median, mean: mean
  };

  root.YCGreenhouse = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

/* H5 标本室 · 展品长廊 + 两级证书
   八件展品的现场验证全部调用 yc-greenhouse.js 实算。 */
(function () {
  "use strict";
  var G = window.YCGreenhouse, D = window.YCDeep;
  if (!D) return;

  var ACCENT = "#ef6a72";

  function pct(v, d) { return v == null ? "—" : (v * 100).toFixed(d === undefined ? 0 : d) + "%"; }
  function f2(v) { return v == null ? "—" : (+v).toFixed(2); }
  function run(o) { return G.run(o || {}); }
  var LN = ["最密 50%", "50—75%", "75—90%", "90—97%", "97—99%", "99—99.7%", "99.7—99.9%", "99.9—100%"];

  /* 统计「首次跌破」与「持续枯萎」的差别 —— 这是第 04 件展品的核心 */
  function relapse(r) {
    var first = 0, sust = 0, gaps = [];
    for (var li = 0; li < r.lines.length; li++) {
      var gs = r.lines[li].gens, c1 = gs[0].cov;
      for (var L = 0; L < 8; L++) {
        if (c1[L] < 0.5) continue;          /* 看不见的层不参与 */
        var f = -1, last = -1, g;
        for (g = 0; g < gs.length; g++) {
          if (gs[g].cov[L] < 0.5 * c1[L] && f < 0) f = g;
          if (gs[g].cov[L] >= 0.5 * c1[L]) last = g;
        }
        if (f < 0) continue;
        first++;
        if (last > f) gaps.push(last - f);
        if (last < gs.length - 1) sust++;
      }
    }
    var avg = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : 0;
    return { first: first, sust: sust, avg: avg };
  }

  var ITEMS = [
    {
      id: "cov", no: "01", icon: "🧮", name: "覆盖率 cov ≠ 质量比 ret",
      symptom: "同一个层，cov 掉了七成，ret 只掉了三成。",
      mech: "支撑覆盖率 cov = 这一层的仓里还有几成在模型中有非零质量；质量比 ret = 这一层占的质量除以它在真分布里该占的质量。稀薄层只要落进一两个计数，ret 就会爆到 5×、20×，读起来像「变多了」。cov 不随质量膨胀，单调、可解释，α=0 时一旦归零就是吸收态。",
      judge: "判死活只看 cov；看形变才看 ret。混用会把「一个计数撞上了」说成「这层还活着」。",
      real: "有人用 ret 判尾部存活，报告写「最稀层质量占比回升 40%」——其实是两个样本撞进了同一个仓。",
      verify: function () {
        var r = run({});
        var g0 = r.byGen[0], gN = r.byGen[r.byGen.length - 1];
        var L = 4;
        return {
          label: "第 5 层 · cov 与 ret 各自掉了多少",
          value: "cov " + pct(g0.cov[L]) + "→" + pct(gN.cov[L]) + "　ret " + f2(g0.ret[L]) + "→" + f2(gN.ret[L]),
          note: "cov 掉 " + pct(1 - gN.cov[L] / g0.cov[L]) + "，ret 只掉 " + pct(1 - gN.ret[L] / g0.ret[L]) + " —— ret 低估了死亡"
        };
      },
      quiz: {
        q: "某一层 cov = 0，ret = 0.04。该怎么读？",
        opts: ["这层还有 4% 的质量，算活着", "这层的仓已经全部空了，0.04 是别处漏过来的零头", "两个数矛盾，无法判断"],
        a: 1,
        why: "cov = 0 是吸收态：这一层的仓一个都不剩。ret 的 0.04 来自数值噪声，不是这一层的质量。",
        hint: "cov 的定义是「还有几成仓」。0 成是什么状态？"
      }
    },
    {
      id: "keep", no: "02", icon: "📉", name: "相对保留 keep",
      symptom: "本来就起步低的层，用绝对值判会被冤枉。",
      mech: "keep = 末代 cov / 第 1 代 cov。它问的是「这一层自己掉了多少」，而不是「还剩多少」。一层从 0.2 掉到 0.12，keep = 0.6，它活着；一层从 1.0 掉到 0.45，keep = 0.45，它死了——尽管绝对值更大。",
      judge: "枯萎 = keep < 0.5。用绝对值会把起步低但稳住的层判成死，把起步高但腰斩的层判成活。",
      real: "报告里写「尾部层覆盖率仍有 45%，未见坍塌」，但那一层第 1 代就是 1.00 —— 它其实已经掉了一半以上。",
      verify: function () {
        var r = run({});
        var k = r.est.keepG;
        return {
          label: "八层的 keep（末代 / 第 1 代）",
          value: k.map(function (v) { return f2(v); }).join(" / "),
          note: "阈值 0.5 · 第 4 层 " + f2(k[3]) + " 刚好在线，第 5 层 " + f2(k[4]) + " 已在线上；绝对 cov 分别是 " +
            pct(r.est.layerCovG[3]) + " 与 " + pct(r.est.layerCovG[4])
        };
      },
      quiz: {
        q: "第 8 层 cov 从 0.20 掉到 0.13，第 1 层从 1.00 掉到 0.52。哪一层更该判枯？",
        opts: ["第 8 层，因为它只剩 13%", "第 1 层，因为它的 keep 是 0.52 之外还掉了近一半，而第 8 层 keep = 0.65 稳住了", "都该判枯"],
        a: 1,
        why: "判死活问的是「它自己掉了多少」。第 8 层 keep = 0.65 活着；第 1 层 keep = 0.52 勉强活着，但绝不是「最危险的那层」。",
        hint: "keep 是比值，不是绝对值。"
      }
    },
    {
      id: "alpha", no: "03", icon: "💧", name: "加性平滑会凭空造出尾巴",
      symptom: "α = 0.5 时，最稀的那层 ret 从 0 涨到 56 倍。",
      mech: "平滑是给每个仓加一个极小常数，防止概率为 0。可一旦这个常数大于稀薄层真实的概率，它就不是「防零」，而是「造数」——每个空仓都被塞进 α 质量，稀薄层的质量凭空变大，于是「尾巴死了」在图上显示成「尾巴涨了」。",
      judge: "自检项「平滑伪造」：把 α 设成 0.5，如果仪器还报「尾巴健康」，它就在说谎。α 必须是 0。",
      real: "某条流水线为了「避免 log(0)」默认加了 1e-5 平滑，结果每次评估都报告尾部多样性上升。",
      verify: function () {
        var a0 = run({ alpha: 0 }), a5 = run({ alpha: 0.5 });
        return {
          label: "α=0 vs α=0.5 · 第 8 层 ret",
          value: f2(a0.est.layerRetG[7]) + " → " + f2(a5.est.layerRetG[7]),
          note: "判定 " + a0.verdict + "/" + a0.subtype + " → " + a5.verdict + "/" + a5.subtype +
            "，枯萎层数 " + a0.wiltedLayers.length + " → " + a5.wiltedLayers.length
        };
      },
      quiz: {
        q: "加了平滑之后，「枯萎层数」从 1 变成 0。这说明？",
        opts: ["平滑救了这些层", "平滑把空仓填上了，仪器已经测不出死亡", "这些层本来就没死，之前是误判"],
        a: 1,
        why: "α 大于稀薄层的真实概率时，每个空仓都被强行塞进质量。死亡被平滑抹平了，不是被治好了。",
        hint: "平滑加进去的质量，是从哪来的？"
      }
    },
    {
      id: "relapse", no: "04", icon: "🕯", name: "回光返照：枯萎世代取「持续」起点",
      symptom: "有移民时，层会先跌下去再涨回来。",
      mech: "只要每代还有一点新鲜数据进来，某一层就可能在跌到阈值以下之后被重新采样回来。于是「第一次跌破」会比真正的死亡早报很多代——默认设置下平均早报 11 代。正确的枯萎世代取「最后一次还在阈值以上的下一代」。",
      judge: "先找「持续枯萎」的起点，再报世代。只报首次跌破，等于把一次抖动当成了死亡。",
      real: "监测面板在第 5 代就报警「尾部已死」，第 10 代它自己涨回来了，运维白忙五天。",
      verify: function () {
        var r = run({ rho: 0.05 });
        var s = relapse(r);
        return {
          label: "16 条谱系 × 可见层 · 两种口径",
          value: "首次跌破 " + s.first + " 处　持续枯萎 " + s.sust + " 处",
          note: "有 " + (s.first - s.sust) + " 处后来涨回去了，平均早报 " + s.avg.toFixed(1) + " 代"
        };
      },
      quiz: {
        q: "某层第 5 代跌破阈值，第 10 代又回到阈值以上。它的枯萎世代是？",
        opts: ["第 5 代", "第 10 代之后，等它再跌破且不再回来", "没有枯萎"],
        a: 1,
        why: "第 5 代只是一次抖动。枯萎世代必须是「最后一次还在阈值以上的下一代」——否则会把回光返照报成死亡。",
        hint: "先问：它后来又回来了吗？"
      }
    },
    {
      id: "blind", no: "05", icon: "🕳", name: "看不见 ≠ 没死",
      symptom: "分辨率不够时，有些层从头到尾就没被采到过。",
      mech: "一个层在第 1 代的支撑覆盖率不到一半，说明这一层根本没被采样看见——它的仓太多太稀，N 个样本落不进去。这种层既不能判活也不能判死，只能标「盲」。把盲层算进「存活」，等于用没看见冒充看见。",
      judge: "分辨率守卫：先算第 1 代有多少层达到 0.5，剩下的全部标盲，且必须在报告里点名。",
      real: "评估报告写「八层全部存活」，实际上其中三层从头到尾零覆盖——它们从来没被测量过。",
      verify: function () {
        var lo = run({ N: 100 }), hi = run({ N: 3200 });
        return {
          label: "N=100 vs N=3200 · 盲层数",
          value: lo.blindLayers.length + " 层 → " + hi.blindLayers.length + " 层",
          note: "N=100 时盲层是第 " + lo.blindLayers.map(function (i) { return i + 1; }).join("、") +
            " 层；加预算只是让它们「变得可见」，不是让它们「活过来」"
        };
      },
      quiz: {
        q: "某层第 1 代覆盖率 0.12，末代 0.10。它算存活吗？",
        opts: ["算，因为覆盖率没怎么掉", "不算，它根本没被看见——该标「盲」而不是「活」", "算死亡，因为覆盖率很低"],
        a: 1,
        why: "0.12 的覆盖率说明这一层在第一代就没采到。没有观测就没有结论，既不能判活也不能判死。",
        hint: "第 1 代的覆盖率说明了什么？"
      }
    },
    {
      id: "budget", no: "06", icon: "⚡", name: "预算只改速度，不改归宿",
      symptom: "采样量 ×8，只是让枯萎晚几代来。",
      mech: "把每代样本从 400 加到 3200，中位枯萎世代从第 5 代推迟到第 8 代——确实变慢了。但把窗口也拉长三倍之后，存活率仍然是 0%。因为每一代用的都是模型自己上一代的产出，稀薄层只要有一次没被采到就永远回不来。",
      judge: "先分「早死」与「必死」。预算能解释早死，解释不了必死。",
      real: "「再加十万条合成数据就好了」——加了，尾部还是死了，只是晚了三代。",
      verify: function () {
        var d = G.decompose({});
        return {
          label: "预算 ×8 · 中位枯萎世代与存活率",
          value: "第 " + d.A.medDeath + " 代 → 第 " + d.B.medDeath + " 代　存活 " + pct(d.A.surv) + " → " + pct(d.B.surv),
          note: "三条预测命中 " + d.hit + "/3 · 归因判定 " + d.verdict
        };
      },
      quiz: {
        q: "预算 ×8 之后枯萎推迟了 3 代，存活率仍是 0。这说明？",
        opts: ["预算没用，可以撤掉", "预算改的是速度不是归宿——决定结局的是有没有新信息进来", "样本还不够多，再加 100 倍就行"],
        a: 1,
        why: "延迟不等于改变。只要没有新鲜数据，任何预算下都是同一个吸收态，只是到达时间不同。",
        hint: "「晚三代死」和「不死」是同一件事吗？"
      }
    },
    {
      id: "immig", no: "07", icon: "🌱", name: "移民改归宿",
      symptom: "同样长的窗口，加 30% 新鲜数据，存活率从 0 变成 100%。",
      mech: "移民 = 每代有一定比例的数据来自真分布，而不是模型自己的产出。它做的是把已经归零的仓重新填上——这是唯一能打破吸收态的东西。注意它改的是归宿，不是速度：加预算让死亡变慢，加移民让死亡不发生。",
      judge: "比较两个条件时，必须让窗口长度相同。窗口一变，「存活」就变成了「还没死到」。",
      real: "同一套流程，只把 5% 的真实数据保留下来，尾部多样性从「第 8 代归零」变成「24 代仍在」。",
      verify: function () {
        var d = G.decompose({});
        return {
          label: "同窗口（72 代）· 无移民 vs 30% 移民",
          value: pct(d.C.surv) + " → " + pct(d.D.surv),
          note: "C = 预算 ×8、无移民；D = 同预算、30% 移民。窗口一样，只有移民不同"
        };
      },
      quiz: {
        q: "「加预算」与「加移民」最关键的区别是？",
        opts: ["加预算更贵", "加预算让死亡变慢，加移民让死亡不发生", "两者等价，只是效率不同"],
        a: 1,
        why: "预算改的是每代抽多少，移民改的是每代抽的是谁。前者推迟吸收态，后者绕开吸收态。",
        hint: "吸收态一旦到达，还能自己出来吗？"
      }
    },
    {
      id: "spread", no: "08", icon: "🌡", name: "临界混合比：判不了也是一种结论",
      symptom: "ρ 在 5% 到 30% 之间时，不同谱系给出相反的结局。",
      mech: "混合比太低，全死；太高，全活。中间有一段，有的谱系活了、有的死了——这不是噪声，是真实的谱系间差异。此时任何单一结论都是错的，仪器必须报 conflict/spread，而不是取平均。",
      judge: "谱系守卫 + 离散度检查。谱系之间结论相反时，拒判，并报出「有多少条活、多少条死」。",
      real: "两篇论文一个说「递归训练会坍塌」一个说「不会」，参数只差一个混合比，都落在临界带里。",
      verify: function () {
        var lo = run({ rho: 0.05 }), mid = run({ rho: 0.15 }), hi = run({ rho: 0.30 });
        return {
          label: "ρ = 0.05 / 0.15 / 0.30 的判定",
          value: lo.verdict + " / " + mid.verdict + " / " + hi.verdict,
          note: "ρ=0.15 时 " + mid.subtype + "：谱系之间结论相反，只能报分歧，不能报平均"
        };
      },
      quiz: {
        q: "同一组参数，8 条谱系活、8 条死。该怎么报？",
        opts: ["报 50% 存活率", "报 conflict：谱系间结论相反，任何单一结论都不成立", "多跑几条谱系取多数"],
        a: 1,
        why: "50% 是两个相反结论的平均，它描述的谱系一条都不存在。这时正确的输出是「分歧」。",
        hint: "平均值能描述「有的全活有的全死」吗？"
      }
    }
  ];

  D.register("H5", {
    name: "递归坍塌博物馆",
    items: ITEMS,
    game: {
      id: "forecast",
      name: "坍塌预报台 · 三个温室",
      page: "h5-forecast.html",
      brief: "看半程藤蔓，为八个质量层各插一面旗：活着、会枯死、还是根本看不见。三轮，插错一层就少一分。",
      rules: "3 轮 × 8 层 · 约 8—12 分钟 · 每轮两次诊断额度"
    }
  });

  function boot() {
    var g = document.getElementById("dpGallery"), c = document.getElementById("dpCerts");
    var certs = null;
    if (c) {
      certs = D.mountCerts(c, "H5", {
        accent: "#ef6a72", paper: "#120a0c", ink: "#f6e6e8",
        gameHref: "h5-forecast.html",
        game: { brief: "看半程藤蔓，为八个质量层各插一面旗：活着、会枯死、还是根本看不见。三轮，插错一层就少一分。" }
      });
    }
    if (g) {
      D.mountGallery(g, "H5", {
        accent: ACCENT,
        onProgress: function () { if (certs) certs.repaint(); }
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

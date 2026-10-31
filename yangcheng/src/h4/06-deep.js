/* H4 房 05 · 展品长廊 + 两级证书
   八件展品的现场验证全部调用 yc-contamination.js 实算，没有一个写死的数字。 */
(function () {
  "use strict";
  var C = window.YCContam, D = window.YCDeep;
  if (!D) return;

  var ACCENT = "#35cfa8";

  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }
  function f2(v) { return v == null ? "—" : v.toFixed(2); }
  function audit(o) { return C.runAudit(o || {}); }
  function guard(r, id) {
    for (var i = 0; i < r.guards.length; i++) if (r.guards[i].id === id) return r.guards[i];
    return null;
  }
  function greens(r) {
    return r.guards.filter(function (g) { return g.ok; }).length;
  }

  var ITEMS = [
    {
      id: "threetier", no: "01", icon: "🗄", name: "三档对照",
      symptom: "甲 / 乙 / 丙 三列不是三种题，是三种证据。",
      mech: "甲架是训练语料里逐字出现过的原题；乙架是同一道题改掉一个数；丙架是同技能族从未出现过的新题。甲减丙是「见过的优势」，乙减丙是「改数之后还活着的优势」。少任何一列，两个差值都无处落脚。",
      judge: "三列必须同时报。只报甲丙的差值，你分不清那是记忆还是这道题本来就简单。",
      real: "某团队只跑「原题 vs 新题」，得到 27 个点的差距，写进报告当污染证据；补上乙架之后发现，差距里有 19 个点来自新题更难。",
      verify: function () {
        var r = audit({ mem: 0.95, rewrite: 0.45, n: 120 });
        return {
          label: "三档准确率 甲 / 乙 / 丙",
          value: pct(r.est.accA) + " / " + pct(r.est.accB) + " / " + pct(r.est.accC),
          note: "甲−丙 = " + (r.est.advAC * 100).toFixed(1) + "pp · 判定 " + r.verdict
        };
      },
      quiz: {
        q: "为什么必须有乙架（改数档）？",
        opts: ["因为改数档的题更多，统计更稳", "因为「记忆」与「这道题更难」在甲丙两档上长得一样，乙架是唯一能分开它们的地方", "因为乙架可以代替参照组"],
        a: 1,
        why: "记忆的特征是「改了一个数，它还是把旧答案交出来」。没有乙架，你只看到一个准确率差，而准确率差有两个解释。",
        hint: "想想「见过」和「会做」在什么条件下会给出同一个准确率。"
      }
    },
    {
      id: "variant", no: "02", icon: "🔧", name: "变体真的变了答案吗",
      symptom: "改数没改到答案，这一整档题就白做了。",
      mech: "把 47 改成 53，如果正确答案从 55 变成 61，那这道题就有了区分力。可如果你改的是进位不影响结果的那个数——正确答案还是 55——那么「它答 55」既可以解释成记忆，也可以解释成算对了。这一档提供不了任何信息。",
      judge: "先算「甲与乙的正确答案相同的比例」。超过 85%，整批数据作废（vacuous），不是效应弱。",
      real: "有人在加法题上只改了个位数，十位进位不变，正确答案 100% 相同；跑出来的 κ̂ 是 0.00，被当成「清白证明」发表。",
      verify: function () {
        var r = audit({ rewrite: 0.03, mem: 0.95, n: 120 });
        return {
          label: "改写力度 0.03 时的判定",
          value: r.verdict + " / " + r.subtype,
          note: "甲乙同答案比例 " + pct(r.est.eqRate) + "（上限 85%）· 守卫 " +
            (guard(r, "variant").ok ? "绿" : "红")
        };
      },
      quiz: {
        q: "改写之后，甲乙两档的正确答案 100% 相同。这说明？",
        opts: ["污染很严重，κ̂ 应该很高", "改数没改到答案，这一档题不提供信息", "模型记住了 96% 的题"],
        a: 1,
        why: "正确答案都没变，「它答对了」与「它搬了旧答案」在行为上完全重合。这不是结论，这是设计失效。",
        hint: "先问：改完之后，正确答案变了吗？"
      }
    },
    {
      id: "trace", no: "03", icon: "🧬", name: "答案溯源",
      symptom: "不看对错，只看它交出来的错误答案是不是旧答案。",
      mech: "算错是随机的，会落到任何一个邻近的数上；搬旧答案是系统性的，永远落在原题那个数上。把乙架上「答案恰好等于甲架答案」的比例统计出来，减去参照组的偶然水平，剩下的就是回吐压力 κ̂。这条通道不依赖难度校准，所以难度漂移也打不垮它。",
      judge: "κ̂ = (R − R₀) / (1 − R₀)。R 是回吐率，R₀ 是参照组的偶然水平。分母是必须的：旧答案本来就有一定概率被蒙中。",
      real: "把 47 改成 53，正确答案 61，它答 55——那不是算错，那是把旧答案原样搬过来了。",
      verify: function () {
        var r = audit({ mem: 0.95, rewrite: 0.45, n: 120 });
        return {
          label: "回吐率 R / 偶然水平 R₀ → κ̂",
          value: pct(r.est.R) + " / " + pct(r.est.R0) + " → " + f2(r.est.kappa),
          note: "区间 [" + f2(r.est.ci && r.est.ci[0]) + ", " + f2(r.est.ci && r.est.ci[1]) + "] · " + r.verdict
        };
      },
      quiz: {
        q: "为什么要减掉 R₀？",
        opts: ["为了让数字好看", "因为旧答案本来就可能被蒙中，不减掉就把偶然当成了记忆", "因为参照组也需要一个 κ̂"],
        a: 1,
        why: "假设什么都不会的参照组也有 8% 的概率把答案蒙成旧答案，那么 R = 8% 时 κ̂ 必须是 0，而不是 0.08。",
        hint: "参照组在这条通道上是什么角色？"
      }
    },
    {
      id: "coldref", no: "04", icon: "❄️", name: "参照组必须真的冷",
      symptom: "控制组自己沾过语料，整个难度校准就废了。",
      mech: "参照组的作用是证明三档难度相当。可如果参照组本身也在训练语料里出现过，它在甲架上也会占便宜，于是「甲比丙高」这件事会被归因成难度——污染造成的差距就这样被解释掉了。而你不会知道，除非你专门去查它。",
      judge: "算参照组的甲−丙，与它自己的抽样噪声比。超出 1.96 倍标准误，说明它不冷，本次校准不成立。",
      real: "论文里写的「未受污染的基线模型」，其实是同一个实验室三个月前训的，而那批语料同源。",
      verify: function () {
        var cold = audit({ refMem: 0, mem: 0.95, n: 120 });
        var warm = audit({ refMem: 0.95, mem: 0.95, n: 120 });
        var g1 = guard(cold, "refcold"), g2 = guard(warm, "refcold");
        return {
          label: "冷参照 vs 被污染的参照",
          value: (g1.ok ? "冷 ✓" : "冷 ✗") + " / " + (g2.ok ? "暖 ✓" : "暖 ✗"),
          note: (g2.detail || "") + " · 参照组一暖，准确率通道就再也证明不了任何事"
        };
      },
      quiz: {
        q: "参照组在甲架上也比丙架高 12 个点。这意味着？",
        opts: ["参照组也被污染过，难度校准失效", "参照组很正常，题本来就该这样", "说明甲架的题更简单，可以放心减"],
        a: 0,
        why: "参照组本该完全没有记忆。它在原题上有优势，只能说明它见过——那它就当不了难度基准。",
        hint: "参照组的设计前提是什么？"
      }
    },
    {
      id: "probe", no: "05", icon: "🔌", name: "探针有没有通电",
      symptom: "κ̂ ≈ 0 有两种原因：它真的在算，或者你根本没测到。",
      mech: "记忆通道只有在「乙架与甲架表面足够接近」时才会被触发。改写力度太大——换了题族、换了叙述、换了单位——记忆根本认不出来，于是回吐率自然接近 0。此时 κ̂ = 0 不是清白证明，是探针没接上。",
      judge: "看乙与甲的平均表面匹配 ρ̄。低于阈值 0.55，直接拒判（probe），不许把 0 写进报告。",
      real: "把「47 加 8」改写成「四十七加八」再改写成「某数加某数」，模型答对率归零，被写成「无污染」。",
      verify: function () {
        var ok = audit({ rewrite: 0.45, mem: 0.95, n: 120 });
        var off = audit({ rewrite: 0.92, mem: 0.95, n: 120 });
        return {
          label: "改写 0.45 vs 0.92 · 表面匹配 ρ̄",
          value: f2(ok.est.rhoBar) + " vs " + f2(off.est.rhoBar),
          note: "改写 0.92 时判定 " + off.verdict + "/" + off.subtype + " · κ̂=" + f2(off.est.kappa) + " 是假的 0"
        };
      },
      quiz: {
        q: "把改写力度调到极大，κ̂ 掉到 0.02。该怎么写结论？",
        opts: ["确认无污染", "拒判——探针没接通，这个 0 不携带信息", "说明记忆很弱，可以降低改写力度再试"],
        a: 1,
        why: "记忆触发不了，回吐率当然接近偶然水平。这时 0 与「测法失效」是同一个数，不能当证据用。",
        hint: "0 有两种来源，仪器能不能分开它们？"
      }
    },
    {
      id: "label", no: "06", icon: "🏷", name: "标签污染让 κ̂ 变成下界",
      symptom: "泄漏进来的答案本身是错的，回吐错误答案与算错分不开。",
      mech: "溯源通道只能看见「它交出了旧答案」这一种记忆。如果语料里的旧答案是错的，那么它记住的是错的、算出来的也可能是错的——两者在行为上完全一致，溯源通道看不见那部分。更糟的是甲架准确率会低于丙架，因为记住的答案是错的。",
      judge: "甲架准确率显著低于丙架时，判 conflict/label。此时 κ̂ 是下界，不是估计，报告里必须写「至少」。",
      real: "题库里的标准答案有一处印错，模型把错误答案背了下来；审计看到「原题准确率比新题低」，先怀疑模型，后才发现是题库。",
      verify: function () {
        var r = audit({ mem: 0.95, labelNoise: 0.6, rewrite: 0.45, n: 160 });
        return {
          label: "标签噪声 0.60 时的判定",
          value: r.verdict + " / " + r.subtype,
          note: "甲 " + pct(r.est.accA) + " vs 丙 " + pct(r.est.accC) + " · κ̂=" + f2(r.est.kappa) + " 只能当「至少」读"
        };
      },
      quiz: {
        q: "甲架准确率反而比丙架低。最自洽的解释是？",
        opts: ["模型在新题上更好", "泄漏的答案里有一部分本身是错的", "题组数量不够"],
        a: 1,
        why: "记忆只会让它重复旧答案。旧答案让它扣分，只能说明旧答案是错的。这时候 κ̂ 是下界。",
        hint: "如果记忆让它变差，那它记住的东西是什么？"
      }
    },
    {
      id: "straddle", no: "07", icon: "📏", name: "区间跨过边界就不许判",
      symptom: "点估计 0.58 看着像「有污染」，区间是 [0.22, 0.83]。",
      mech: "自助法给出的是「同样的题组再抽一次，这个数会落在哪」。区间同时跨过 0.25 与 0.60 两条判定线时，说明这批评据支持不了任何一个结论。加题能把区间收窄，但不能把「没有效应」变成「有效应」。",
      judge: "先看区间，再看点估计。区间跨线 → 拒判（straddle），报告写「证据不足」，不写「倾向于」。",
      real: "30 组题跑出 κ̂=0.61，被写成「确认污染」；扩到 200 组之后落在 0.41，结论翻面。",
      verify: function () {
        var few = audit({ mem: 0.7, n: 60, rewrite: 0.45, seed: 771 });
        var many = audit({ mem: 0.7, n: 240, rewrite: 0.45, seed: 771 });
        function w(r) { return r.est.ci ? (r.est.ci[1] - r.est.ci[0]) : 0; }
        return {
          label: "60 组 vs 240 组的区间宽度",
          value: f2(w(few)) + " → " + f2(w(many)),
          note: "四倍题组把区间收窄了一半，判定仍然是 " + many.verdict + "/" + many.subtype + " —— 收窄不等于改判"
        };
      },
      quiz: {
        q: "点估计 0.58，95% 区间 [0.22, 0.83]。怎么写？",
        opts: ["倾向存在污染", "证据不足——区间跨过两条判定线，不能给结论", "取区间中点 0.52 作为估计"],
        a: 1,
        why: "「倾向于」是最危险的写法：它把一个不成立的推断包装成了谨慎。区间跨线就是没有结论。",
        hint: "区间告诉你的是「再抽一次会落在哪」。"
      }
    },
    {
      id: "undet", no: "08", icon: "⚖️", name: "不可区分也是结论",
      symptom: "「不知道」写进报告，比编一个数更专业。",
      mech: "污染审计的输出不止两种。至少六种：supported（确认回吐）、refuted（在算）、noeffect（没有可解释的优势）、conflict（两通道矛盾）、undetermined（守卫未过）。把最后两种写成「无污染」或「有污染」，都是在编造。",
      judge: "每种判定都要能说清「它为什么是这个」，而且六种都要能真的被触发——只会说「有污染」的仪器没有价值。",
      real: "监管报告里最常见的错误不是算错，是把 undetermined 填成 refuted——因为表格只有两栏。",
      verify: function () {
        var cases = [
          ["正常记忆", { mem: 0.95 }],
          ["无优势", { mem: 0, rewrite: 0.45 }],
          ["探针断开", { rewrite: 0.92 }],
          ["标签污染", { mem: 0.95, labelNoise: 0.6, n: 160 }],
          ["小样本", { mem: 0.6, n: 30 }]
        ];
        var seen = {};
        cases.forEach(function (c) { var r = audit(c[1]); seen[r.verdict + "/" + r.subtype] = 1; });
        var keys = Object.keys(seen);
        return {
          label: "五组参数触发了多少种判定",
          value: keys.length + " 种",
          note: keys.join("　")
        };
      },
      quiz: {
        q: "一份报告只有「有污染 / 无污染」两栏。最大的问题是什么？",
        opts: ["两栏不够美观", "它逼着人把「不可区分」填成两种结论之一，等于系统性地编造", "缺少置信区间"],
        a: 1,
        why: "仪器能给出的判定有六种。表格只有两栏时，多出来的四种会被强行归到最近的一栏——这不是简化，是伪造。",
        hint: "想想探针断开时那个 κ̂=0，会被填进哪一栏。"
      }
    }
  ];

  D.register("H4", {
    name: "数据污染博物馆",
    items: ITEMS,
    game: {
      id: "purge12",
      name: "净化车间 · 十二道工序",
      page: "h4-purge.html",
      brief: "十二次工序额度，把一批被污染的题洗成一份站得住的报告。把改写拉到最大也能让 κ̂ 归零——但那叫假净化。",
      rules: "12 道工序 · 约 8—12 分钟 · 守卫全绿才算真净化"
    }
  });

  function boot() {
    var g = document.getElementById("dpGallery"), c = document.getElementById("dpCerts");
    var certs = null;
    if (c) {
      certs = D.mountCerts(c, "H4", {
        accent: "#35cfa8", paper: "#07120f", ink: "#dff2e9",
        gameHref: "h4-purge.html",
        game: { brief: "十二次工序额度，把一批被污染的题洗成一份站得住的报告。改写拉到最大也能让 κ̂ 归零——但那叫假净化。" }
      });
    }
    if (g) {
      D.mountGallery(g, "H4", {
        accent: ACCENT,
        onProgress: function () { if (certs) certs.repaint(); }
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

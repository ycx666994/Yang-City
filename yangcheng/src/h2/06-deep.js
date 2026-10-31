/* H2 卷 05 · 展品长廊 + 证书
   八件展品的现场验证全部调用本馆内核实算，没有写死的数字。 */
(function () {
  "use strict";
  var F = window.YCForensic, D = window.YCDeep;
  var $ = function (s) { return document.querySelector(s); };
  if (!D) return;

  var ACCENT = "#6b4ea8";
  function pct(v) { return Math.round(v * 100) + "%"; }
  function f2(v) { return (v == null ? "—" : v.toFixed(2)); }
  function audit(o) { return F.runAudit(o || {}); }

  var ITEMS = [
    {
      id: "cheap", no: "01", icon: "💬", name: "理由很便宜",
      symptom: "解释读起来通顺，但它可能根本没参与决策。",
      mech: "生成一段听起来合理的原因，成本远低于真的按这个原因做决定。训练目标里没有「说出的理由必须等于实际的计算路径」这一项，所以「说了什么」和「为什么这么做」是两件可以完全脱钩的事。",
      judge: "不要问它为什么，要<b>改它说的那个字段</b>，看答案动不动。",
      real: "工单分诊模型把「付费等级」写成「紧急度」，审计三个月没人发现。",
      verify: function () {
        var r = audit({ coupling: 0.95, nInst: 120 });
        return {
          label: "当它真的按理由做 · ĉ",
          value: f2(r.est.chat),
          note: "改它指认的多翻 " + Math.round((r.est.pTreat - r.est.pCtrl) * 100) + " 个百分点（真值 c=0.95）"
        };
      },
      quiz: {
        q: "模型给出一段通顺的理由。下面哪一项是这段理由<b>不能</b>证明的？",
        opts: ["模型能生成合乎语法的因果句", "模型真的按这个理由做了决定", "理由里提到的字段确实存在于输入中"],
        a: 1,
        why: "通顺只证明它会写句子。要证明「按这个理由决策」，唯一的办法是改那个字段看答案动不动。",
        hint: "想想这句话是谁写的、写它需要什么成本。"
      }
    },
    {
      id: "posthoc", no: "02", icon: "🪞", name: "事后合理化",
      symptom: "理由是在答案出来之后补的，不是算出来的。",
      mech: "先出分，再写理由——这是很多系统的实际结构。理由模块拿到的只是「答案 + 输入」，它可以挑一个最符合人类直觉的因素写上去，而那个因素和真实计算毫无关系。所以脱钩的解释往往比忠实的解释<b>更好看</b>。",
      judge: "把耦合度压到接近 0，看 ĉ 会不会诚实地掉下去。",
      real: "模型解释「因为这段话含有攻击性」，但把攻击性词全删掉，判定不变。",
      verify: function () {
        var r = audit({ coupling: 0.05, nInst: 120 });
        return {
          label: "耦合度真值 0.05 时反推",
          value: f2(r.est.chat),
          note: "理由与决策几乎完全脱钩，可它写出来仍然通顺——通顺与忠实是两件事"
        };
      },
      quiz: {
        q: "测得 ĉ = 0.05。正确的读法是？",
        opts: ["模型有 5% 的概率把解释写对", "它写的理由和它的决策基本脱钩", "模型的准确率只有 5%"],
        a: 1,
        why: "ĉ 量的是「指认因素恰好是首要因素」的概率，不是解释正确率，更不是任务准确率。",
        hint: "ĉ 的定义里没有「对错」，只有「是不是同一个东西」。"
      }
    },
    {
      id: "claim", no: "03", icon: "🎯", name: "指认因素 ≠ 首要因素",
      symptom: "模型点名的那个字段，和真正起作用的那个，可以是两个。",
      mech: "「指认因素」是模型自己在解释里点名的字段；「首要因素」由隐藏权重决定，审计器看不到，只能靠干预反推。两者重合的概率就是耦合度 c。这两件事被混为一谈，是「解释看起来合理」最大的来源。",
      judge: "分开统计：指认对了的题、指认错了的题，各自的翻转率。",
      real: "同一批题里，指认对时翻转率 97%，指认错时只有 30%——差别不在题，在它有没有指对。",
      verify: function () {
        var r = audit({ coupling: 0.6, nInst: 160 });
        return {
          label: "指认对了 vs 指认错了 · 翻转率",
          value: pct(r.split.hitFlip) + " vs " + pct(r.split.missFlip),
          note: "指对 " + r.split.hitN + " 题 / 指错 " + r.split.missN + " 题，同一批题只差指认"
        };
      },
      quiz: {
        q: "审计发现：指认对了的题，翻转率 97%；指认错了的题，30%。这说明？",
        opts: ["模型的指认有信息量——指对时它确实更可能是主因", "模型在故意骗人", "97% 说明模型 97% 的时候是对的"],
        a: 0,
        why: "指认不是噪声：它和真实首要因素有 60% 的重合。但它也不是证据：剩下 40% 的题里，它指错了。",
        hint: "97% 和 30% 的差别来自哪里——题本身，还是指认？"
      }
    },
    {
      id: "coupling", no: "04", icon: "🔗", name: "耦合度 c",
      symptom: "一个 0 到 1 的数，量的是「说的」和「做的」重合多少。",
      mech: "c = P(模型指认的因素 恰好就是真正的首要因素)。它不是一个可以「感觉」出来的属性，必须用干预反推：ĉ = (改指认的翻转率 − 改没提的翻转率) / (改正控的翻转率 − 改没提的翻转率)。",
      judge: "给真值，看仪器能不能把它收回来——这是仪器自己被审判的方式。",
      real: "c=0.6 不代表「60% 的解释是对的」，而是「指认因素有 60% 的概率就是首要因素」。",
      verify: function () {
        var r = audit({ coupling: 0.4, nInst: 160 });
        return {
          label: "真值 c=0.40 → 反推 ĉ",
          value: f2(r.est.chat),
          note: "95% 区间 [" + f2(r.est.ci[0]) + ", " + f2(r.est.ci[1]) + "] · 判定 " + r.verdict
        };
      },
      quiz: {
        q: "c = 0.6 的正确读法是？",
        opts: ["60% 的解释是对的", "指认因素有 60% 的概率就是首要因素", "模型的置信度是 0.6"],
        a: 1,
        why: "c 是重合概率，不是正确率。它说的是「它指的那个，是不是真的那个」。",
        hint: "把 c 的定义念一遍：P(指认因素 = 首要因素)。"
      }
    },
    {
      id: "arms", no: "05", icon: "🎛️", name: "四种干预臂",
      symptom: "只改一个字段，但改哪个字段决定了这一针打在什么上。",
      mech: "改它指认的（treat）、改它没提的（ctrl）、改真正的首要因素（正控 pos）、改从不参与打分的字段（负控 neg）。四条臂缺一条，ĉ 就没有分母或没有地基。",
      judge: "四条臂必须同时报。只报 treat 的审计，等于没有对照的实验。",
      real: "负控臂翻转率恒为 0——它是整套测法的地基，不是装饰。",
      verify: function () {
        var r = audit({ coupling: 0.7, nInst: 160 });
        return {
          label: "四臂翻转率 T / C / P / N",
          value: pct(r.est.pTreat) + " / " + pct(r.est.pCtrl) + " / " + pct(r.est.pPos) + " / " + pct(r.est.pNeg),
          note: "效力 = 正控 − 对照 = " + f2(r.est.power) + " · ĉ = " + f2(r.est.chat)
        };
      },
      quiz: {
        q: "负控臂（改备注字数）翻转率 0%。它的作用是什么？",
        opts: ["证明备注字数这个字段不重要", "证明这套测法能区分「会翻」和「不会翻」", "证明模型很稳定"],
        a: 1,
        why: "没有 0%，任何高翻转率都可能只是「随便改什么都翻」。负控是让 92% 变成证据的那块地基。",
        hint: "想想如果连备注字数都能翻答案，你还能信别的数字吗？"
      }
    },
    {
      id: "power", no: "06", icon: "📐", name: "效力（分母）",
      symptom: "ĉ 的分母是「正控 − 对照」。分母塌了，数就没有意义。",
      mech: "如果这个系统对输入很迟钝——权重被拉平，改哪个字段都差不多——那么正控和对照的翻转率会几乎相等。此时 ĉ 的分子分母同时趋近 0，算出来的任何数都是噪声除以噪声。",
      judge: "先看效力。效力低于 0.20，直接拒判，不许给 ĉ。",
      real: "一个「怎么改都不变」的系统，最容易被误判成「解释很忠实」——因为什么都测不出来。",
      verify: function () {
        var r = audit({ coupling: 0.9, flat: 0.9, nInst: 160 });
        return {
          label: "把输入拉迟钝后的效力",
          value: f2(r.est.power),
          note: "判定 " + r.verdict + " · " + (r.verdict === "undetermined" ? "仪器自己停手了" : "仍在给数")
        };
      },
      quiz: {
        q: "正控只比对照多翻 6 个百分点。这时应该？",
        opts: ["照常给一个 ĉ，反正有数", "拒判——分母接近 0，ĉ 没有意义", "增加题数就一定能把数救回来"],
        a: 1,
        why: "加题只能缩小抽样噪声，不能把「没有效应」变成「有效应」。分母塌了，样本再多也只是更精确的噪声。",
        hint: "想想 ĉ 的公式：分子分母同时趋近 0 时会怎样。"
      }
    },
    {
      id: "jitter", no: "07", icon: "🌫️", name: "抖动掩盖",
      symptom: "系统自己会随机变答案，于是任何干预都看起来「有效」。",
      mech: "如果同一个问题问两遍答案就不一样，那么「改一个字段之后答案变了」根本不能归因于这个字段。这时负控会先被触发：连从不参与打分的备注字数，改一下答案也变了。",
      judge: "负控一旦不为 0，本次数据整体作废——不是「效应弱」，是「测法失效」。",
      real: "高温度采样的模型，同一个 prompt 三次三个答案。这时做单因素干预，测到的是抖动不是效应。",
      verify: function () {
        var r = audit({ coupling: 0.9, temp: 0.5, nInst: 160 });
        return {
          label: "加入 50% 答案抖动后的判定",
          value: r.verdict,
          note: "负控翻转率 " + pct(r.est.pNeg) + " · " + (r.rule === "conflict" ? "负控被触发，数据不可用" : "规则 " + r.rule)
        };
      },
      quiz: {
        q: "改备注字数，答案也翻了。这说明？",
        opts: ["备注字数其实参与打分", "系统本身有随机抖动，本次数据不可用", "模型在撒谎"],
        a: 1,
        why: "备注字数在设计上不可能参与打分。它翻说明「翻」这个动作本身不干净——所有臂的数据一起作废。",
        hint: "先问：这个字段在设计上有没有可能影响分数？"
      }
    },
    {
      id: "faithful", no: "08", icon: "⚖️", name: "忠实 ≠ 正确",
      symptom: "就算它说的就是它做的，也不代表它做对了。",
      mech: "ĉ = 1 只说明「解释与决策重合」。它完全没有说这个决策是不是好的、是不是符合人类意图的。一个忠实执行坏规则的模型，比一个随机出错的模型更危险，因为它可预测地错。",
      judge: "把「忠实性」和「正确性」当成两个独立的轴，分别报，绝不合并成一个总分。",
      real: "推荐系统忠实地按「停留时长」推荐——它说的和做的一致，于是它忠实地把用户推进标题党。",
      verify: function () {
        var r = audit({ coupling: 1.0, nInst: 160 });
        return {
          label: "完全忠实时的 ĉ",
          value: f2(r.est.chat),
          note: "它说的就是它做的。但做的对不对，这台仪器管不着——那是 H3 的问题"
        };
      },
      quiz: {
        q: "ĉ = 1.00 意味着？",
        opts: ["模型的答案是正确答案", "它说的理由就是它做决定的原因", "模型理解了任务"],
        a: 1,
        why: "ĉ 只测重合，不测对错，更不测理解。忠实与正确是两条独立的轴。",
        hint: "「忠实」这个词本身要求它对齐什么？"
      }
    }
  ];

  D.register("H2", {
    name: "推理法医馆",
    items: ITEMS,
    game: {
      id: "case0117",
      name: "案卷 0117 · 十一日",
      page: "h2-case.html",
      brief: "四幕破案：六个证人各说自己是原因。用干预翻转率证明其中两个在说谎，指认真正的首要因素。",
      rules: "四幕 · 约 8—12 分钟 · 全对可得精英证书"
    }
  });

  function boot() {
    var g = $("#dpGallery"), c = $("#dpCerts");
    var certs = null;
    if (c) {
      certs = D.mountCerts(c, "H2", {
        accent: "#a8842f", paper: "#fdfaf1", ink: "#2b2822",
        gameHref: "h2-case.html",
        game: { brief: "四幕破案：六个证人各说自己是原因。用干预翻转率证明其中两个在说谎，指认真正的首要因素。" }
      });
    }
    if (g) {
      D.mountGallery(g, "H2", {
        accent: ACCENT,
        /* 答对一件就刷新证书面板，否则「可领参观证书」的按钮要等下次进页面才亮 */
        onProgress: function () { if (certs) certs.repaint(); }
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

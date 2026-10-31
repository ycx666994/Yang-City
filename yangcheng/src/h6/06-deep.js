/* H6 复算清单 · 展品长廊 + 两级证书
   八件展品的现场验证全部调用 yc-dome.js 实算。 */
(function () {
  "use strict";
  var Dm = window.YCDome, D = window.YCDeep;
  if (!D) return;

  var ACCENT = "#6d9bff";
  var W = null;
  function world() { if (!W) W = Dm.world({}); return W; }
  function run(o) { o = o || {}; if (!o.world) o.world = world(); return Dm.run(o); }
  function pct(v, d) { return v == null ? "—" : (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function pp(v) { return (v * 100).toFixed(1) + "pp"; }

  var ITEMS = [
    {
      id: "passk", no: "01", icon: "🎲", name: "pass@k 不是能力",
      symptom: "「至少有一次答对」和「它真的会答」之间，差着一整个选择器。",
      mech: "pass@k 的判官是 oracle：它把 k 个答案全看一遍，只要有一个对就算过。可部署时没有 oracle，你得让模型自己选一个交出去——多数表决就是 vote@k。两者之差 deficit = pass@k − vote@k，就是「选」这一步的代价。",
      judge: "报 pass@k 必须同时报 vote@k。只报前者，等于假设存在一个免费的全知裁判。",
      real: "某榜单用 pass@64 报出 78% 的通过率，同一批题多数表决只有 31%——上线后用户看到的是 31%。",
      verify: function () {
        var r = run({ k: 256, tau: 1.0 });
        return {
          label: "k=256 · pass@k 与 vote@k",
          value: pct(r.pass) + " / " + pct(r.vote),
          note: "选择器赤字 " + pp(r.deficit) + " —— 这部分只有 oracle 拿得到"
        };
      },
      quiz: {
        q: "pass@k = 60%，vote@k = 35%。上线后用户大概看到多少？",
        opts: ["60%", "35% 左右，因为没有 oracle 替用户挑", "两者平均 47.5%"],
        a: 1,
        why: "pass@k 假设有人把 k 个答案都看完再挑。真实部署里这一步是模型自己做的，那就是 vote@k。",
        hint: "线上谁来当那个裁判？"
      }
    },
    {
      id: "ceiling", no: "02", icon: "🏛", name: "天花板 = 可达任务占比",
      symptom: "有些任务的支持集里根本没有正确答案，采样多少次都一样。",
      mech: "世界里有 120 条任务，其中 40 条是「不可达」——模型的所有候选答案里都不含真解。它们的 pass 恒为 0，而且不随预算变化。所以 pass@k 的上限不是 100%，是可达任务占比 66.7%。headroom = ceiling − pass 才是「还能靠预算拿到的部分」。",
      judge: "先算 ceiling，再看 pass。pass 已经贴到 ceiling 时，加预算买不到任何东西。",
      real: "团队把预算从 8 次加到 256 次，命中率从 40% 涨到 60% 就再也不动了，剩下的 40% 全是不可达任务。",
      verify: function () {
        var r = run({ k: 256, tau: 1.0 });
        return {
          label: "k=256 的 pass 与天花板",
          value: pct(r.pass) + " / " + pct(r.ceiling),
          note: "还剩 " + pp(r.headroom) + " 的空间；另外 " + pct(r.unreachable) + " 的任务怎么抽都到不了"
        };
      },
      quiz: {
        q: "预算加到 256 次，pass 停在 66.7%。这说明？",
        opts: ["再加大预算就能上去", "已经贴到可达上限，剩下的任务不在支持集里", "温度没调好"],
        a: 1,
        why: "ceiling 由任务集决定，跟采样无关。贴住它之后加预算只会重复抽同一个答案。",
        hint: "天花板是由什么决定的？"
      }
    },
    {
      id: "neff", no: "03", icon: "🔁", name: "名义预算 vs 有效预算",
      symptom: "抽了 256 次，只说出了 8 个不同的答案。",
      mech: "nEff = 平均每条任务说出了几个不同答案。k=256 时它只有 8.2，leak = 1 − nEff/k = 0.97 —— 97% 的采样是重复的。名义预算记在账单上，有效预算才是真正在探索的那部分。",
      judge: "先看 nEff。nEff ≤ 1.6 时直接拒判（leak），因为「加预算」只是在把同一个答案又抽一遍。",
      real: "某推理服务把采样数从 8 提到 64，账单涨了八倍，nEff 从 4.5 只涨到 7.8——多出来的 56 次几乎全在重复。",
      verify: function () {
        var lo = run({ k: 1, tau: 1.0 }), hi = run({ k: 256, tau: 1.0 });
        return {
          label: "k=1 vs k=256 · 有效预算 nEff",
          value: lo.nEff.toFixed(1) + " → " + hi.nEff.toFixed(1),
          note: "预算涨 256 倍，有效预算只涨 8 倍；泄漏率 " + hi.leak.toFixed(2)
        };
      },
      quiz: {
        q: "k 从 8 提到 64，nEff 只从 4.5 涨到 7.8。该怎么读？",
        opts: ["预算没白花，命中率总会涨", "大部分预算是重复采样，真正在探索的只有那 7.8 个", "nEff 不重要，看 pass 就行"],
        a: 1,
        why: "nEff 是「实际探索了几个方向」。它不涨，说明加的钱都花在重复同一个答案上。",
        hint: "leak 的定义是什么？"
      }
    },
    {
      id: "tau", no: "04", icon: "🌡", name: "温度买 pass，卖 vote",
      symptom: "把 τ 调高，pass@k 涨了，vote@k 掉了。",
      mech: "温度改的是分布的平坦程度。τ 越高，稀有答案越容易被抽到，于是 pass@k 变好看；但众数被摊薄，多数表决反而更容易选错。所以 τ 是一个**交换**，不是一个「更好的设置」。",
      judge: "调 τ 时必须同时报 pass 与 vote。只看 pass 调温度，等于在给自己刷榜。",
      real: "为了刷 pass@k，把温度从 1.0 调到 2.6，pass 涨 12 个点，vote 掉 17 个点——上线后全线变差。",
      verify: function () {
        var a = run({ k: 32, tau: 1.0 }), b = run({ k: 32, tau: 2.6 });
        return {
          label: "k=32 · τ 1.0 → 2.6",
          value: "pass " + pct(a.pass) + "→" + pct(b.pass) + "　vote " + pct(a.vote) + "→" + pct(b.vote),
          note: "pass 涨 " + pp(b.pass - a.pass) + "，vote 掉 " + pp(a.vote - b.vote) + " —— 这是一次交换"
        };
      },
      quiz: {
        q: "把 τ 调高之后 pass@k 涨了 12 个点。可以直接上线吗？",
        opts: ["可以，指标变好了", "不行，先看 vote@k 有没有掉——温度买的是多样性，卖的是众数", "可以，只要不超过 3.0"],
        a: 1,
        why: "温度把分布摊平，稀有答案更容易被抽到，但众数变弱。pass 涨、vote 掉是同一个原因的两面。",
        hint: "「抽到过」和「选得对」是同一件事吗？"
      }
    },
    {
      id: "fails", no: "05", icon: "🕳", name: "三种失败，三种处方",
      symptom: "「差一步」和「完全没方向」不是同一种病。",
      mech: "每条任务的 k 次采样只有三种结局：命中（hit）、只出现过近邻（nearOnly）、完全没靠近（cold）。近失说明模型知道方向但选不准，处方是提多样性；冷失败说明它压根没有这个知识，处方是改数据或改结构。混成一个「失败率」，处方就无从下手。",
      judge: "报失败率时拆成 nearOnly 与 cold 两个数，并分开给处方。",
      real: "评测只报「失败 60%」，团队去加采样，加完还是 60%——因为那 60% 里有一半是 cold，采样救不了。",
      verify: function () {
        var r = run({ k: 32, tau: 1.0 });
        return {
          label: "k=32 · 命中 / 近失 / 冷失败",
          value: pct(r.pass) + " / " + pct(r.nearOnly) + " / " + pct(r.cold),
          note: "近失 " + pct(r.nearOnly) + " 可以靠多样性救；冷失败 " + pct(r.cold) + " 只能靠换知识"
        };
      },
      quiz: {
        q: "失败率 60%，其中 nearOnly 40%、cold 20%。先做什么？",
        opts: ["直接加采样预算", "先处理 nearOnly（提多样性），cold 那部分加采样没用", "把温度调到最高"],
        a: 1,
        why: "nearOnly 说明真解被抽到过附近，多采几次有机会撞上；cold 说明支持集里压根没有，采样再多也抽不出来。",
        hint: "两种失败的候选集里，有没有正确答案？"
      }
    },
    {
      id: "short", no: "06", icon: "⏱", name: "八次以下不许判",
      symptom: "k=4 时报「预算无效」，是把预算不足误读成能力不足。",
      mech: "稀有但可达的任务，命中概率可能只有 0.25%。k=4 的时候它几乎不可能被抽到，于是 pass@4 看起来跟 pass@1 一样低。此时报「加预算没用」是错的——你只是还没抽够。所以 k < 8 一律拒判（short）。",
      judge: "先看 k 是否达到 8 次。没达到就写「预算不足」，不写「预算无效」。",
      real: "内部评测用 k=4 得出「增加采样没有收益」，据此砍掉了采样预算；三个月后发现 k=64 时收益是 22 个点。",
      verify: function () {
        var r = run({ k: 4, tau: 1.0 });
        return {
          label: "k=4 时的判定",
          value: r.verdict + " / " + r.subtype,
          note: r.why.slice(0, 60) + "…"
        };
      },
      quiz: {
        q: "k=4 时 pass 与 k=1 几乎一样。结论该写什么？",
        opts: ["加预算无效", "预算不足，无法判断——稀有任务还没被抽到", "模型没有这个能力"],
        a: 1,
        why: "「没测到」和「没有」是两件事。k=4 连稀有任务都还没碰到，任何关于预算效果的结论都不成立。",
        hint: "这个预算下，稀有任务有机会被抽到吗？"
      }
    },
    {
      id: "saturate", no: "07", icon: "🏔", name: "饱和：再加预算不会更好",
      symptom: "headroom ≤ 10 个百分点时，判定从「有效」变成「饱和」。",
      mech: "pass 已经贴到 ceiling 附近时，继续加预算的边际收益趋近 0。这不是「预算无效」（refuted），而是「预算已经用尽了它的作用」（saturate）——两者必须分开报，因为前者意味着别花钱，后者意味着钱花对了、该换方向了。",
      judge: "看 headroom。> 0.10 报 gain（还能靠预算），≤ 0.10 报 saturate（该换方向）。",
      real: "团队把预算从 128 加到 256，pass 涨了 0.2 个点，报告写「预算仍然有效」——其实早就饱和了。",
      verify: function () {
        var mid = run({ k: 32, tau: 1.0 }), top = run({ k: 256, tau: 1.0 });
        return {
          label: "k=32 vs k=256 的判定",
          value: mid.subtype + " / " + top.subtype,
          note: "k=32 headroom " + pp(mid.headroom) + "；k=256 headroom " + pp(top.headroom)
        };
      },
      quiz: {
        q: "k=128 加到 256，pass 涨 0.2 个点。判定该是什么？",
        opts: ["supported/gain，因为涨了", "supported/saturate，因为 headroom 已经很小", "refuted，因为没涨"],
        a: 1,
        why: "涨了但涨不动，是饱和；完全不动，才是无效。两者的处置相反：一个该换方向，一个该停止投入。",
        hint: "「涨了一点」和「一点都不涨」是同一件事吗？"
      }
    },
    {
      id: "six", no: "08", icon: "⚖️", name: "六个判定，不是一条分数",
      symptom: "把这台仪器的输出压成一个百分制，等于把它废掉。",
      mech: "它至少能给出六种判定：supported/gain（预算有效）、supported/saturate（饱和）、refuted/flat（无效）、undetermined/short（预算不足）、undetermined/leak（多样性塌了）、undetermined/few（任务太少）。每一种对应一个完全不同的处置。",
      judge: "报告必须写判定词与它的前提条件，不许写「综合得分 72 分」。",
      real: "监管表格只有「达标 / 不达标」两栏，于是「预算不足」被填成了「不达标」，预算被砍。",
      verify: function () {
        var cases = [
          ["预算有效", { k: 32, tau: 1.0 }],
          ["饱和", { k: 256, tau: 1.0 }],
          ["预算不足", { k: 4, tau: 1.0 }],
          ["任务太少", { k: 32, tau: 1.0, nReach: 10, nVoid: 6 }]
        ];
        var seen = {};
        cases.forEach(function (c) { var r = run(c[1]); seen[r.verdict + "/" + r.subtype] = 1; });
        var keys = Object.keys(seen);
        return {
          label: "四组参数触发了多少种判定",
          value: keys.length + " 种",
          note: keys.join("　")
        };
      },
      quiz: {
        q: "把「预算不足」填进「不达标」栏，会造成什么后果？",
        opts: ["没有后果，只是措辞", "决策会朝反方向走：该加预算的被当成没能力，预算被砍", "表格更整洁"],
        a: 1,
        why: "「预算不足」的处置是加钱，「没能力」的处置是换模型。填错一栏，处置就完全相反。",
        hint: "这两种判定的处方分别是什么？"
      }
    }
  ];

  D.register("H6", {
    name: "潜能与预算博物馆",
    items: ITEMS,
    game: {
      id: "tower10",
      name: "预算塔 · 十层",
      page: "h6-tower.html",
      brief: "十层塔，每层一个指标门槛。每层只能用一次「加倍采样 / 调温 / 检修」，十次机会走完，多一次都没有。",
      rules: "10 层 · 约 8—12 分钟 · 每层一次行动机会"
    }
  });

  function boot() {
    var g = document.getElementById("dpGallery"), c = document.getElementById("dpCerts");
    var certs = null;
    if (c) {
      certs = D.mountCerts(c, "H6", {
        accent: "#6d9bff", paper: "#080d18", ink: "#e2ecff",
        gameHref: "h6-tower.html",
        game: { brief: "十层塔，每层一个指标门槛。每层只能用一次「加倍采样 / 调温 / 检修」，十次机会走完，多一次都没有。" }
      });
    }
    if (g) {
      D.mountGallery(g, "H6", {
        accent: ACCENT,
        onProgress: function () { if (certs) certs.repaint(); }
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* ============================================================
   yc-audit.js — 全城联合复核内核（YC-Audit 0.1）
   零 DOM 依赖，Node 可直接 require；同时挂 window.YCAudit。

   这台仪器不重跑任何馆，只审六份档案之间的关系。它回答四件事：

   ① 能不能并排？  两份档案要能直接比较，必须对象轴 / 运行轴 / 来源轴
                    三轴相同。不同轴只能类比，不能当同一结论的两份证据。
   ② 会不会互相矛盾？把每份档案压成一个「命题签名」（claim key + 方向）。
                    同一 claim 上方向相反 = 真冲突。
   ③ 是不是六个独立证据？按 seed / 代码版本 / 原始出处分组，同组不算独立。
   ④ 哪里是空的？  哪些命题只有一份档案（孤证），哪些馆根本没交档案。

   设计原则（沿用全城约定）：
   · 拒判优先：不足两份、全部同源、全部不可比时，拒绝出具「一致」。
   · 孤证不当共识：只有一份档案支持的命题，标记为孤证，不计入共识。
   · 拒判的档案不贡献冲突：undetermined / noeffect 的档案不进入 decisive 判定，
     否则「没测出来」会被误算成「反对」。
   · 自检必须能跑：五项自检全部基于合成档案，与真实数据无关。
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YCAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "0.1.0";

  /* ---------------- 三轴可比性 ---------------- */
  /* 只有这三轴相同，两份档案的结论才可以直接并排。复核轴不参与：
     它描述「有没有人复算过」，不改变结论本身说的是什么。 */
  var CMP_AXES = ["object", "run", "source"];

  /* ---------------- 六馆命题登记表 ---------------- */
  /* 每馆登记一个主命题：key 是命题标识，polarity 是「该馆主张成立时」的方向。
     verdict = refuted 时方向翻转；undetermined / noeffect 时不贡献方向。
     这张表是这台仪器的知识来源，必须可被审查，所以写死在这里。 */
  var CLAIMS = {
    H1: {
      key: "capability-generality", label: "表现强 = 通用能力",
      pos: "general", neg: "bounded",
      note: "H1 问「它表现得很强，究竟证明了什么」"
    },
    H2: {
      key: "explanation-causal", label: "外显解释真的影响了答案",
      pos: "causal", neg: "posthoc",
      note: "H2 问「解释得通，是否意味着解释真的影响了答案」"
    },
    H3: {
      key: "proxy-validity", label: "代理分数上升 = 任务变好",
      pos: "valid", neg: "invalid",
      note: "H3 问「分数提高，是否真的让任务变好」"
    },
    H4: {
      key: "memorization-dominance", label: "答对来自记忆而非泛化",
      pos: "dominant", neg: "generalization",
      note: "H4 问「它答对，是泛化、记忆，还是无法区分」"
    },
    H5: {
      key: "tail-wilt-cause", label: "尾部消失是递归造成的",
      pos: "recursive", neg: "visibility",
      note: "H5 问「哪些信息会消失，是看不见还是被抹掉」"
    },
    H6: {
      key: "budget-gain-locus", label: "加预算的收益全部来自可达任务",
      pos: "reach-only", neg: "uniform",
      note: "H6 问「失败是能力不足、调用不当，还是预算不足」"
    }
  };

  /* 结论词表：与 YC-Evidence 1.0 对齐 */
  var DECISIVE = { supported: 1, refuted: 1 };

  function dig(o, p) {
    var ks = p.split("."), v = o;
    for (var i = 0; i < ks.length; i++) { if (v == null) return undefined; v = v[ks[i]]; }
    return v;
  }

  /* ---------------- 命题签名 ---------------- */
  /* 把一份档案压成 0 或 1 条 claim。
     0 条 = 这份档案不参与冲突判定（拒判或未检出）。 */
  function claimOf(rec) {
    var hall = rec.hall;
    var spec = CLAIMS[hall];
    if (!spec) return null;
    var v = dig(rec, "conclusion.verdict");
    if (!DECISIVE[v]) {
      return {
        key: spec.key, label: spec.label, hall: hall, id: rec.id,
        dir: null, verdict: v || "undetermined", decisive: false,
        why: "结论为「" + (v || "undetermined") + "」，不贡献方向"
      };
    }
    return {
      key: spec.key, label: spec.label, hall: hall, id: rec.id,
      dir: v === "supported" ? spec.pos : spec.neg,
      verdict: v, decisive: true,
      why: v === "supported" ? "支持「" + spec.label + "」" : "反对「" + spec.label + "」"
    };
  }

  /* ---------------- 可比性 ---------------- */
  function compareAxes(a, b) {
    var diff = [], same = [];
    CMP_AXES.forEach(function (k) {
      var va = dig(a, "tags." + k), vb = dig(b, "tags." + k);
      if (va === vb) same.push(k); else diff.push({ axis: k, a: va, b: vb });
    });
    return { same: same, diff: diff };
  }

  var AXIS_CN = { object: "对象", run: "运行", source: "来源" };
  var AXIS_VAL = {
    object: { rule: "规则装置", toydist: "玩具分布模型", model: "指定真实模型", system: "模型＋工具系统" },
    run: { live: "现场执行", replay: "固定记录回放", story: "仅故事引用" },
    source: { controlled: "自建受控实验", external: "外部论文数据", submitted: "用户提交" }
  };
  function axisVal(k, v) { return (AXIS_VAL[k] && AXIS_VAL[k][v]) || v || "?"; }

  function comparePair(a, b) {
    var c = compareAxes(a, b);
    var base = { a: a.id, b: b.id, hallA: a.hall, hallB: b.hall, diff: c.diff };
    if (c.diff.length === 0) {
      base.level = "comparable";
      base.why = "三轴相同，可以直接并排";
      return base;
    }
    /* 对象轴不同 → 最硬的不比。这不是「有点不一样」，是两件不同的东西。 */
    var objDiff = c.diff.some(function (d) { return d.axis === "object"; });
    if (objDiff) {
      var d0 = c.diff.filter(function (d) { return d.axis === "object"; })[0];
      base.level = "incomparable";
      base.why = "对象轴不同（" + axisVal("object", d0.a) + " vs " + axisVal("object", d0.b) +
        "），结论说的不是同一类对象，不能并排当同一结论的两份证据";
      return base;
    }
    base.level = "analogy";
    base.why = c.diff.map(function (d) {
      return AXIS_CN[d.axis] + "轴不同（" + axisVal(d.axis, d.a) + " vs " + axisVal(d.axis, d.b) + "）";
    }).join("；") + "，只能作类比";
    return base;
  }

  /* ---------------- 同源检测 ---------------- */
  /* 三把钥匙的强度不一样，不能一视同仁：
       seed   —— 强同源。同一个随机流跑出来的，绝对不是两次独立观测。
       code   —— 弱同源。同一份实现，但不同种子仍是不同运行。
       origin —— 最弱。同一出处，可以是完全不同的实验。
     只有 seed 相同才做硬合并；code / origin 相同只做「独立性受限」标注，
     否则同一项目自建的全部档案都会被算成一份，联合复核就永远只剩拒判。 */
  function sourceKeys(rec) {
    var out = [];
    var seed = dig(rec, "run.seed");
    var code = dig(rec, "run.codeVersion");
    var org = dig(rec, "source.origin");
    if (seed != null && seed !== "") out.push({ k: "seed", v: String(seed), hard: true });
    if (code != null && code !== "") out.push({ k: "code", v: String(code), hard: false });
    if (org != null && org !== "") out.push({ k: "origin", v: String(org), hard: false });
    return out;
  }

  var KEY_CN = { seed: "随机种子", code: "代码版本", origin: "原始出处" };

  function groupBySource(recs) {
    var buckets = {};
    recs.forEach(function (r) {
      sourceKeys(r).forEach(function (sk) {
        var k = sk.k + ":" + sk.v;
        (buckets[k] = buckets[k] || { key: sk.k, val: sk.v, hard: sk.hard, ids: [], halls: [] });
        if (buckets[k].ids.indexOf(r.id) < 0) {
          buckets[k].ids.push(r.id);
          buckets[k].halls.push(r.hall);
        }
      });
    });
    return Object.keys(buckets).map(function (k) { return buckets[k]; })
      .filter(function (g) { return g.ids.length > 1; })
      .sort(function (a, b) { return b.ids.length - a.ids.length; });
  }

  /* 独立度：只用 seed 做硬合并。
     返回 effective = 独立观测组数，以及 sharedImpl = 共享实现/出处的组。 */
  function independence(recs, groups) {
    var n = recs.length;
    if (n === 0) return { n: 0, effective: 0, sharedImpl: [], note: "无档案" };

    var hard = groups.filter(function (g) { return g.hard; });
    var idx = {}, parent = [];
    recs.forEach(function (r, i) { idx[r.id] = i; parent.push(i); });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    hard.forEach(function (g) {
      for (var i = 1; i < g.ids.length; i++) {
        if (idx[g.ids[0]] != null && idx[g.ids[i]] != null) uni(idx[g.ids[0]], idx[g.ids[i]]);
      }
    });
    var comp = {};
    for (var i = 0; i < n; i++) comp[find(i)] = (comp[find(i)] || 0) + 1;
    var effective = Object.keys(comp).length;

    var sharedImpl = groups.filter(function (g) { return !g.hard; });

    var note;
    if (effective === 1 && n > 1) note = n + " 份档案共用同一个随机种子，只构成 1 组观测";
    else if (effective < n) note = n + " 份档案里有 " + (n - effective) + " 份与别的档案共用种子";
    else if (sharedImpl.length) note = n + " 份档案各自独立取样，但共享 " + sharedImpl.length + " 项实现或出处";
    else note = "没有检测到同源重复";
    return { n: n, effective: effective, sharedImpl: sharedImpl, note: note };
  }

  /* ---------------- 主复核 ---------------- */
  function audit(records, opt) {
    opt = opt || {};
    var recs = (records || []).filter(function (r) { return r && r.hall; });
    var n = recs.length;

    /* 命题签名 */
    var claims = [];
    recs.forEach(function (r) {
      var c = claimOf(r);
      if (c) claims.push(c);
    });
    var decisiveClaims = claims.filter(function (c) { return c.decisive; });

    /* 可比性矩阵 */
    var pairs = [];
    for (var i = 0; i < n; i++)
      for (var j = i + 1; j < n; j++) pairs.push(comparePair(recs[i], recs[j]));
    var cmp = pairs.filter(function (p) { return p.level === "comparable"; }).length;
    var ana = pairs.filter(function (p) { return p.level === "analogy"; }).length;
    var inc = pairs.filter(function (p) { return p.level === "incomparable"; }).length;

    /* 冲突：同一 claim key 上方向相反 */
    var byKey = {};
    decisiveClaims.forEach(function (c) {
      (byKey[c.key] = byKey[c.key] || []).push(c);
    });
    var conflicts = [], shared = [];
    Object.keys(byKey).forEach(function (k) {
      var g = byKey[k];
      var dirs = {};
      g.forEach(function (c) { (dirs[c.dir] = dirs[c.dir] || []).push(c); });
      var dk = Object.keys(dirs);
      if (dk.length > 1) {
        for (var x = 0; x < dk.length; x++)
          for (var y = x + 1; y < dk.length; y++)
            conflicts.push({
              key: k, label: g[0].label,
              a: dirs[dk[x]][0], b: dirs[dk[y]][0],
              why: dirs[dk[x]][0].hall + " 主张 " + dk[x] + "，而 " + dirs[dk[y]][0].hall + " 主张 " + dk[y]
            });
      }
      if (g.length > 1) shared.push({ key: k, label: g[0].label, claims: g, dirs: dk });
    });

    /* 孤证：只有一份档案覆盖的命题 */
    var claimKeys = Object.keys(CLAIMS).map(function (h) { return CLAIMS[h].key; });
    var covered = {};
    decisiveClaims.forEach(function (c) { (covered[c.key] = covered[c.key] || []).push(c); });
    var orphans = claimKeys.filter(function (k) { return (covered[k] || []).length === 1; })
      .map(function (k) { return { key: k, hall: covered[k][0].hall, label: covered[k][0].label }; });

    /* 同源与独立度 */
    var groups = groupBySource(recs);
    var indep = independence(recs, groups);

    /* 覆盖缺口：哪些馆没有档案 */
    var hallsPresent = {};
    recs.forEach(function (r) { hallsPresent[r.hall] = (hallsPresent[r.hall] || 0) + 1; });
    var gaps = Object.keys(CLAIMS).filter(function (h) { return !hallsPresent[h]; });

    /* ---- 判定：顺序固定，先查「能不能判」，再判「判成什么」 ---- */
    var v = { verdict: "consistent", subtype: "clean", why: "" };

    if (n < 2) {
      v.verdict = "undetermined"; v.subtype = "few";
      v.why = "只有 " + n + " 份档案。联合复核至少要两份 —— " +
        "一份档案谈不上「互相矛盾」，也谈不上「互相印证」。";
    } else if (conflicts.length > 0) {
      /* 冲突排在同源之前：两份同源档案还互相矛盾，是「连仪器都不稳定」，
         比单纯不独立更严重，不能被 dependent 吞掉。 */
      v.verdict = "conflict"; v.subtype = "claim";
      v.why = "检出 " + conflicts.length + " 处命题冲突：" +
        conflicts.map(function (c) { return c.label; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join("；") +
        "。两馆在同一命题上给出相反方向，必须有一份被降级。";
    } else if (indep.effective === 1) {
      v.verdict = "undetermined"; v.subtype = "dependent";
      v.why = n + " 份档案全部共用同一个随机种子。它们不是 " + n +
        " 个独立证据，是一个证据被数了 " + n + " 遍。";
    } else if (cmp === 0) {
      v.verdict = "undetermined"; v.subtype = "incomparable";
      v.why = "没有任何一对档案三轴相同（" + inc + " 对对象轴不同、" + ana + " 对只能类比）。" +
        "把不可比的结论并排说成「互相印证」是最常见的误用。";
    } else if (cmp < pairs.length) {
      v.verdict = "consistent"; v.subtype = "partial";
      v.why = "可比的 " + cmp + " 对之间没有命题冲突；但有 " + (pairs.length - cmp) +
        " 对不能直接并排（" + inc + " 对对象轴不同、" + ana + " 对只能类比）。" +
        "结论只在这 " + cmp + " 对范围内成立。";
    } else {
      v.verdict = "consistent"; v.subtype = "full";
      v.why = "全部 " + pairs.length + " 对档案三轴相同，且没有命题冲突。";
    }

    /* ---- 附加标记：这些不改变主判定，但必须跟着结论一起报 ---- */
    var flags = [];
    if (conflicts.length > 0 && indep.effective < n) {
      flags.push({ k: "sameorigin", t: "同源还矛盾",
        d: "冲突双方只构成 " + indep.effective + " 组独立观测 —— 同一实现下重复跑出相反结论，说明仪器本身不稳定" });
    } else if (indep.effective < n) {
      flags.push({ k: "sameorigin", t: "部分同源",
        d: n + " 份档案只构成 " + indep.effective + " 组独立观测，其余共用种子" });
    } else if (indep.sharedImpl.length) {
      flags.push({ k: "sharedimpl", t: "共享实现",
        d: "各自独立取样，但共享 " + indep.sharedImpl.length + " 项实现或出处（" +
          indep.sharedImpl.map(function (g) { return KEY_CN[g.key] + " " + g.val; }).slice(0, 3).join("、") +
          "）。独立性打折，不等于互不相干" });
    }
    if (orphans.length > 0) {
      flags.push({ k: "orphan", t: "孤证 " + orphans.length + " 项",
        d: "只有一份档案支持的命题不构成共识：" +
          orphans.map(function (o) { return o.hall + "「" + o.label + "」"; }).join("；") });
    }
    if (gaps.length > 0) {
      flags.push({ k: "gap", t: "缺口 " + gaps.length + " 馆",
        d: gaps.join(" / ") + " 没有交档案 —— 这些命题本轮完全没有参与复核" });
    }
    if (inc > 0) {
      flags.push({ k: "incomparable", t: "不可比 " + inc + " 对",
        d: "对象轴不同（规则装置 vs 玩具分布模型），结论不能并排当同一结论的两份证据" });
    }

    return {
      version: VERSION,
      n: n,
      halls: Object.keys(hallsPresent).sort(),
      hallsPresent: hallsPresent,
      gaps: gaps,
      pairs: pairs,
      comparable: cmp, analogy: ana, incomparable: inc,
      claims: claims, decisiveClaims: decisiveClaims,
      shared: shared, conflicts: conflicts, orphans: orphans,
      sources: groups, indep: indep,
      flags: flags,
      verdict: v.verdict, subtype: v.subtype, why: v.why
    };
  }

  /* ---------------- 合成档案（自检与负例用） ---------------- */
  /* 只造联合复核需要的字段，不冒充完整档案。
     默认 origin / code 带 id，保证「不指定就不算同源」——
     否则每个合成档案都同源，自检会全部掉进 dependent，测不到别的分支。 */
  function synth(o) {
    o = o || {};
    var hall = o.hall || "H3";
    var spec = CLAIMS[hall] || CLAIMS.H3;
    var id = o.id || ("SYN-" + hall + "-" + Math.random().toString(16).slice(2, 6));
    return {
      id: id,
      hall: hall,
      title: o.title || "合成档案 " + hall,
      tags: {
        object: o.object || "rule",
        run: o.run || "live",
        source: o.source || "controlled",
        review: o.review || "unreviewed"
      },
      run: { seed: o.seed != null ? o.seed : 1001, codeVersion: o.code || ("code-" + id) },
      source: { origin: o.origin || ("origin-" + id) },
      conclusion: {
        verdict: o.verdict || "supported",
        claimKey: spec.key,
        claimDir: o.dir || null
      }
    };
  }

  /* ---------------- 自检 ---------------- */
  function selfCheck() {
    var out = [];
    function add(name, pass, detail, note) {
      out.push({ name: name, pass: !!pass, detail: detail, note: note });
    }

    /* ① 同源必报：两份 id 不同、种子相同 */
    var a1 = synth({ id: "S1", hall: "H3", seed: 777 });
    var a2 = synth({ id: "S2", hall: "H4", seed: 777 });
    var r1 = audit([a1, a2]);
    add("同源必报",
      r1.indep.effective === 1 && r1.verdict === "undetermined" && r1.subtype === "dependent",
      "独立度 " + r1.indep.effective + " / 判定 " + r1.verdict + "/" + r1.subtype,
      "同种子的两份档案不是两个证据");

    /* ② 异轴必拦：对象轴不同 */
    var b1 = synth({ id: "B1", hall: "H3", object: "rule", seed: 1 });
    var b2 = synth({ id: "B2", hall: "H4", object: "toydist", seed: 2 });
    var r2 = audit([b1, b2]);
    var p2 = r2.pairs[0];
    add("异轴必拦",
      p2 && p2.level === "incomparable" && r2.comparable === 0,
      "配对等级 " + (p2 ? p2.level : "无") + " / 可比 " + r2.comparable,
      "规则装置与玩具分布模型的结论不能直接并排");

    /* ③ 人造冲突必检：同 claim key、相反方向 */
    var c1 = synth({ id: "C1", hall: "H3", seed: 11, verdict: "supported", dir: "valid" });
    var c2 = synth({ id: "C2", hall: "H3", seed: 12, verdict: "refuted", dir: "invalid" });
    var r3 = audit([c1, c2]);
    add("人造冲突必检",
      r3.conflicts.length === 1 && r3.verdict === "conflict",
      "冲突 " + r3.conflicts.length + " / 判定 " + r3.verdict,
      "同一命题方向相反必须判为冲突，不能算「一致」");

    /* ④ 单份不撒谎：只有一份档案时不能报「一致」 */
    var r4 = audit([synth({ id: "D1", hall: "H3", seed: 21 })]);
    add("单份不撒谎",
      r4.verdict === "undetermined" && r4.subtype === "few",
      "判定 " + r4.verdict + "/" + r4.subtype,
      "一份档案谈不上互相矛盾，也谈不上互相印证");

    /* ⑤ 拒判不贡献：undetermined 的档案不得进入冲突判定 */
    var e1 = synth({ id: "E1", hall: "H3", seed: 31, verdict: "supported", dir: "valid" });
    var e2 = synth({ id: "E2", hall: "H3", seed: 32, verdict: "undetermined" });
    var r5 = audit([e1, e2]);
    add("拒判不贡献",
      r5.conflicts.length === 0 && r5.decisiveClaims.length === 1,
      "冲突 " + r5.conflicts.length + " / 参与判定 " + r5.decisiveClaims.length + " 份",
      "「没测出来」不能被算成「反对」");

    return out;
  }

  /* ---------------- 负例：这台仪器能被用坏 ---------------- */
  function negatives() {
    var out = [];
    function add(name, pass, detail, note) {
      out.push({ name: name, pass: !!pass, detail: detail, note: note });
    }

    /* ① 全部同源 → 必须降级为 dependent，而不是报「六重证据」 */
    var same = [];
    for (var i = 0; i < 6; i++)
      same.push(synth({ id: "N1-" + i, hall: ["H1", "H2", "H3", "H4", "H5", "H6"][i], seed: 999, code: "same" }));
    var r1 = audit(same);
    add("六份同源不算六重证据",
      r1.indep.effective === 1 && r1.verdict === "undetermined" && r1.subtype === "dependent",
      "独立度 " + r1.indep.effective + " / " + r1.verdict + "/" + r1.subtype,
      "把种子设成同一个，结论必须从「一致」掉到「不可判定」");

    /* ② 全部不可比 → 必须报 incomparable，而不是报「无冲突」 */
    var inc = [
      synth({ id: "N2-0", hall: "H1", object: "rule", seed: 100 }),
      synth({ id: "N2-1", hall: "H2", object: "toydist", seed: 101 })
    ];
    var r2 = audit(inc);
    add("全部不可比不许报无冲突",
      r2.comparable === 0 && r2.verdict === "undetermined" && r2.subtype === "incomparable",
      "可比 " + r2.comparable + " / " + r2.verdict + "/" + r2.subtype,
      "没有一对能并排时，「没发现冲突」是废话");

    /* ③ 删到一份 → 必须 few */
    var r3 = audit([synth({ id: "N3-0", hall: "H3", seed: 201 })]);
    add("只剩一份必须拒判",
      r3.verdict === "undetermined" && r3.subtype === "few",
      r3.verdict + "/" + r3.subtype, "样本不足时不允许出具联合结论");

    /* ④ 同一份档案自比 → 同源，不是两份证据 */
    var one = synth({ id: "N4-0", hall: "H3", seed: 301 });
    var clone = JSON.parse(JSON.stringify(one));
    clone.id = "N4-1";
    var r4 = audit([one, clone]);
    add("复制自己不算第二份证据",
      r4.indep.effective === 1 && r4.verdict === "undetermined" && r4.subtype === "dependent",
      "独立度 " + r4.indep.effective + " / " + r4.verdict + "/" + r4.subtype,
      "同内容复制品必须被识别为同源");

    /* ⑤ 孤证不当共识 */
    var mix = [
      synth({ id: "N5-0", hall: "H3", seed: 401 }),
      synth({ id: "N5-1", hall: "H4", seed: 402 })
    ];
    var r5 = audit(mix);
    var hasOrphan = r5.flags.some(function (f) { return f.k === "orphan"; });
    add("孤证必须标出",
      r5.orphans.length >= 1 && hasOrphan,
      "孤证 " + r5.orphans.length + " / 标记 " + r5.flags.map(function (f) { return f.k; }).join(","),
      "两份档案各说各的，不能叫「互相印证」");

    /* ⑥ 共享实现只降级不合并：同出处不同种子，仍是独立取样 */
    var s1 = synth({ id: "N6-0", hall: "H3", seed: 501, origin: "same-lab" });
    var s2 = synth({ id: "N6-1", hall: "H4", seed: 502, origin: "same-lab" });
    var r6 = audit([s1, s2]);
    var hasImpl = r6.flags.some(function (f) { return f.k === "sharedimpl"; });
    add("共享出处不合并独立度",
      r6.indep.effective === 2 && hasImpl && r6.verdict !== "undetermined",
      "独立度 " + r6.indep.effective + " / 标记 " + r6.flags.map(function (f) { return f.k; }).join(",") + " / " + r6.verdict,
      "同一出处不等于同一个随机流，不能把两次运行压成一次");

    return out;
  }

  return {
    VERSION: VERSION,
    CLAIMS: CLAIMS,
    CMP_AXES: CMP_AXES,
    audit: audit,
    claimOf: claimOf,
    comparePair: comparePair,
    groupBySource: groupBySource,
    independence: independence,
    synth: synth,
    selfCheck: selfCheck,
    negatives: negatives
  };
});

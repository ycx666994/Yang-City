/* ============================================================
   evidence-app.js — 公共证据厅
   只做索引、呈现、导出。不重新计算、不重新解释任何结论。
   ============================================================ */
(function () {
  "use strict";

  var E = window.YCEvidence;
  var $ = function (id) { return document.getElementById(id); };
  var AXCLS = { object: "o", run: "r", source: "s", review: "v" };
  var cur = null, filter = "all";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function vOf(rec) {
    return E.VERDICTS[E.dig(rec, "conclusion.verdict")] || { t: "?", cls: "idle" };
  }
  function axesHTML(rec) {
    return ["object", "run", "source", "review"].map(function (k) {
      var ax = E.AXES[k], key = E.dig(rec, "tags." + k), o = ax.opts[key];
      return '<span class="ax ax-' + AXCLS[k] + '" title="' + esc(o ? o.d : "") + '">' +
        '<i>' + ax.label + '</i>' + esc(o ? o.t : key) + '</span>';
    }).join("");
  }

  /* ---------------- 列表 ---------------- */
  function renderList() {
    var all = E.list();
    var arr = filter === "all" ? all : all.filter(function (r) { return r.hall === filter; });
    var box = $("evitems");
    $("lsMeta").textContent = "YC-Evidence 1.0 · " + all.length + " 条记录";
    $("rdN").innerHTML = '<span class="dot' + (all.length ? "" : " off") + '"></span><b>' +
      all.length + '</b> 份档案';

    if (!arr.length) {
      box.innerHTML = '<div class="blank" style="border:none;padding:24px 12px"><b>' +
        (all.length ? "这个馆还没有档案" : "还没有档案") + '</b>' +
        (all.length ? "换个筛选条件，或去该馆跑一次实验。" : "去任一可用馆跑一次实验。<br>档案会自动出现在这里，并带上四轴标签。") +
        '</div>';
      return;
    }
    box.innerHTML = "";
    arr.forEach(function (r) {
      var h = E.HALL_BY_ID[r.hall] || { accent: "#63718a", no: r.hall };
      var v = vOf(r);
      var el = document.createElement("div");
      el.className = "evi" + (cur && cur.id === r.id ? " on" : "");
      el.style.borderLeftColor = h.accent;
      el.innerHTML = '<div class="et">' + esc(r.title) + '</div>' +
        '<div class="em"><span style="color:' + h.accent + '">' + h.no + '</span>' +
        '<span class="v ' + v.cls + '">' + v.t + '</span>' +
        '<span>' + esc(r.id.slice(-13)) + '</span></div>';
      el.addEventListener("click", function () {
        cur = r;
        renderList();
        renderDetail(r);
      });
      box.appendChild(el);
    });
  }

  /* ---------------- 详情 ---------------- */
  function renderDetail(rec) {
    if (!rec) return;
    var h = E.HALL_BY_ID[rec.hall] || { accent: "#63718a", name: rec.hallName || rec.hall, no: rec.hall };
    var v = vOf(rec);
    var d = rec.design || {}, s = rec.source || {}, st = rec.stats || {},
      b = rec.budget || {}, rn = rec.run || {}, c = rec.conclusion || {}, rv = rec.review || {};
    var chk = E.checksum(rec);
    var chkOk = chk === rec.checksum;

    var L = [];
    L.push('<div class="evhead">');
    L.push('<div class="k">' + esc(h.no) + ' · ' + esc(h.name) + ' · ' + esc(rec.instrument.id) + ' v' + esc(rec.instrument.version) + '</div>');
    L.push('<h1>' + esc(rec.title) + '</h1>');
    L.push('<div class="meta"><span>ID <b>' + esc(rec.id) + '</b></span>' +
      '<span>创建 <b>' + esc(rec.created.replace("T", " ").slice(0, 19)) + '</b></span>' +
      '<span>校验 <b style="color:' + (chkOk ? "var(--ok)" : "var(--bad)") + '">' +
      (chkOk ? "通过" : "不符") + '</b></span>' +
      (rec.case ? '<span>案件 <b>' + esc(rec.case.title) + '</b></span>' : '') + '</div>');
    L.push('<div class="axes" style="margin-top:10px">' + axesHTML(rec) + '</div>');
    L.push('</div>');

    /* 结论 */
    L.push('<div class="sec" style="border-color:' +
      (v.cls === "ok" ? "rgba(63,208,138,.34)" : v.cls === "bad" ? "rgba(240,85,77,.34)" : "var(--line)") + '">');
    L.push('<div class="st">结论<span class="spacer"></span><span class="tag ' + v.cls + '">' + v.t + '</span></div>');
    if (c.supported && c.supported.length) {
      L.push('<p style="color:var(--tx);font-weight:600">被支持的范围</p><ul class="dd">');
      c.supported.forEach(function (x) { L.push("<li>" + esc(x) + "</li>"); });
      L.push("</ul>");
    }
    if (c.alternatives && c.alternatives.length) {
      L.push('<p style="margin-top:9px;color:var(--tx)">替代解释</p><ul class="dd">');
      c.alternatives.forEach(function (x) { L.push("<li>" + esc(x) + "</li>"); });
      L.push("</ul>");
    }
    if (c.unsupported && c.unsupported.length) {
      L.push('<p style="margin-top:9px;color:#ef8a90">未被支持的推断</p><ul class="dd">');
      c.unsupported.forEach(function (x) { L.push("<li>" + esc(x) + "</li>"); });
      L.push("</ul>");
    }
    if (c.nextData && c.nextData.length) {
      L.push('<p style="margin-top:9px;color:var(--tx)">下一步所需数据</p><ul class="dd">');
      c.nextData.forEach(function (x) { L.push("<li>" + esc(x) + "</li>"); });
      L.push("</ul>");
    }
    L.push("</div>");

    /* 设计与来源 */
    L.push('<div class="sec"><div class="st">设计与来源<span class="spacer"></span>' +
      '<span class="tag ' + (d.preregistered ? "ok" : "warn") + '">' + (d.preregistered ? "预注册" : "探索性") + '</span></div>');
    L.push('<div class="kv">');
    L.push('<dt>问题</dt><dd>' + esc(d.question) + '</dd>');
    L.push('<dt>假设</dt><dd>' + esc(d.hypothesis) + '</dd>');
    L.push('<dt>条件</dt><dd>' + esc((d.conditions || []).join("；")) + '</dd>');
    L.push('<dt>对照</dt><dd>' + esc((d.controls || []).join("；")) + '</dd>');
    L.push('<dt>数据类型</dt><dd>' + esc(s.dataType) + '</dd>');
    L.push('<dt>出处</dt><dd>' + esc(s.origin) + '</dd>');
    L.push('<dt>对象版本</dt><dd>' + esc(s.model) + '</dd>');
    L.push('<dt>接触历史</dt><dd>' + esc(s.contactHistory) + '</dd>');
    L.push('<dt>已知缺失</dt><dd>' + esc(s.knownMissing) + '</dd>');
    L.push('</div></div>');

    /* 统计与预算 */
    L.push('<div class="sec"><div class="st">统计与预算<span class="spacer"></span></div><div class="kv">');
    L.push('<dt>样本量</dt><dd>' + esc(st.n) + '</dd>');
    L.push('<dt>重采样单位</dt><dd>' + esc(st.resampleUnit) + '</dd>');
    L.push('<dt>效应</dt><dd>' + esc(st.effect) + '</dd>');
    L.push('<dt>区间</dt><dd>' + esc(st.interval) + '</dd>');
    L.push('<dt>缺失 / 失败</dt><dd>' + esc(st.missing) + ' / ' + esc(st.failures) + '</dd>');
    L.push('<dt>优化回合</dt><dd>' + esc(b.generate) + '</dd>');
    L.push('<dt>种子</dt><dd>' + esc(rn.seed) + ' · optSeed ' + esc((rn.params || {}).optSeed) + '</dd>');
    L.push('<dt>代码版本</dt><dd>' + esc(rn.codeVersion) + '</dd>');
    L.push('</div></div>');

    /* 复核 */
    L.push('<div class="sec"><div class="st">复核<span class="spacer"></span>' +
      '<span class="tag ' + (rv.status === "independent" ? "ok" : "idle") + '">' + esc(rv.status) + '</span></div>');
    L.push('<p>' + esc(rv.replayMethod || "未填写回放方法") + '</p>');
    if (rv.corrections && rv.corrections.length) {
      L.push('<p style="margin-top:8px;color:var(--warn)">更正与备注：</p><ul class="dd">');
      rv.corrections.forEach(function (x) { L.push("<li>" + esc(x) + "</li>"); });
      L.push("</ul>");
    }
    L.push('<p style="margin-top:9px;font-size:10.5px;color:var(--tx4)">校验值 ' +
      esc(rec.checksum) + ' 只用于发现记录改动，不保证来源真实。</p>');
    L.push('</div>');

    /* 操作 */
    L.push('<div class="sec"><div class="st">操作<span class="spacer"></span></div>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
      '<button class="btn accent" id="btnMd">导出这份档案（Markdown）</button>' +
      '<button class="btn ghost" id="btnDel">删除本地副本</button></div></div>');

    $("evdetail").innerHTML = L.join("");

    $("btnMd").addEventListener("click", function () {
      var blob = new Blob([E.exportMarkdown(rec)], { type: "text/markdown;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = rec.id + ".md";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    });
    $("btnDel").addEventListener("click", function () {
      if (!confirm("删除本地副本 " + rec.id + "？导出过的文件不受影响。")) return;
      E.remove(rec.id);
      cur = null;
      renderList(); renderTray();
      $("evdetail").innerHTML = '<div class="blank"><b>已删除本地副本</b>可以继续选择其他档案。</div>';
    });
  }

  /* ---------------- 证据托盘 ---------------- */
  function renderTray() {
    var cs = E.caseConflicts();
    var all = E.list();
    var byCase = {};
    all.forEach(function (r) {
      if (!r.case) return;
      (byCase[r.case.id] = byCase[r.case.id] || { id: r.case.id, title: r.case.title, recs: [] }).recs.push(r);
    });
    var ids = Object.keys(byCase);
    $("trayTag").textContent = ids.length + " 个案件";

    var box = $("tray");
    if (!ids.length) {
      box.innerHTML = '<p style="color:var(--tx4)">同一案件下，不同馆的结论会在这里并列。当两馆结论相反，标记为「结果冲突」；当一馆被另一馆降级，标记为「降级」。</p>';
      return;
    }
    var H = [];
    ids.forEach(function (cid) {
      var g = byCase[cid];
      var conflict = cs.filter(function (x) { return x.group.id === cid; });
      H.push('<div class="casecard">');
      H.push('<div class="ct">' + esc(g.title) + '</div>');
      H.push('<div class="cs">' + esc(cid) + ' · ' + g.recs.length + ' 份档案' +
        (conflict.length ? ' · <span style="color:#ef8a90">' + (conflict[0].kind === "conflict" ? "结果冲突" : "存在降级") + '</span>' : '') + '</div>');
      H.push('<div class="crows">');
      g.recs.forEach(function (r) {
        var h = E.HALL_BY_ID[r.hall] || { accent: "#63718a", no: r.hall };
        var v = vOf(r);
        H.push('<div class="cr"><i style="background:' + h.accent + '"></i><b>' + h.no + '</b>' +
          '<span class="v ' + v.cls + '" style="color:' +
          (v.cls === "ok" ? "var(--ok)" : v.cls === "bad" ? "var(--bad)" : v.cls === "warn" ? "var(--warn)" : "var(--tx3)") +
          '">' + v.t + '</span></div>');
      });
      H.push('</div></div>');
    });
    if (cs.length) {
      H.push('<div class="warnbox" style="margin-top:8px"><b>分歧记录</b>　' +
        cs.map(function (x) {
          return x.group.title + "：" + (x.kind === "conflict" ? "两馆给出了相反结论" : "有馆把结论降级为不可判定");
        }).join("；") +
        '。分歧不被自动调和——它本身就是结论的一部分。</div>');
    } else {
      H.push('<p style="margin-top:8px;font-size:10.5px;color:var(--tx4)">目前同一案件下没有相反结论。' +
        '注意：没有冲突不等于结论可靠，也可能只是还没有第二个馆复核。</p>');
    }
    box.innerHTML = H.join("");
  }

  /* ============================================================
     全城联合复核台
     ============================================================ */
  var A = window.YCAudit;
  var lastAudit = null, curPair = null;

  /* 把内核输出压成一行人话，避免档案里出现裸 JSON */
  function fmtEst(est) {
    if (!est) return "-";
    var P = function (v) { return (v * 100).toFixed(1) + "%"; };
    var N = function (v) { return (Math.round(v * 1000) / 1000); };
    var out = [];
    if (est.chat != null) {
      out.push("ĉ " + N(est.chat) + (est.ci ? " [" + N(est.ci[0]) + ", " + N(est.ci[1]) + "]" : ""));
      if (est.power != null) out.push("效力 " + N(est.power));
    }
    if (est.kappa != null) {
      out.push("κ̂ " + P(est.kappa) + (est.ci ? " [" + P(est.ci[0]) + ", " + P(est.ci[1]) + "]" : ""));
      if (est.accA != null) out.push("原题/变体/新题 " + P(est.accA) + " / " + P(est.accB) + " / " + P(est.accC));
    }
    if (est.wilted != null) {
      out.push("枯萎 " + est.wilted + " 层 · 看不见 " + est.blind + " 层 · 幸存 " + est.alive + " 层");
    }
    if (est.pass != null) {
      out.push("pass " + P(est.pass) + " · vote " + P(est.vote) + " · 有效预算 " + N(est.nEff));
    }
    if (est.peak != null) {
      out.push("峰值在第 " + est.peak + " 档" + (est.structural ? " · " + est.structural : ""));
    }
    if (!out.length) {
      Object.keys(est).slice(0, 4).forEach(function (k) {
        var v = est[k];
        out.push(k + " " + (typeof v === "number" ? N(v) : v));
      });
    }
    return out.join(" · ");
  }

  /* 五馆内核按需加载：首屏不背这 200K，点按钮时才注入 <script>。
     全部到齐才回调；任何一个失败都如实报出来，不静默降级。 */
  var KERNELS = [
    { file: "instruments/yc-forensic.js", g: "YCForensic" },
    { file: "instruments/yc-contamination.js", g: "YCContam" },
    { file: "instruments/yc-greenhouse.js", g: "YCGreenhouse" },
    { file: "instruments/yc-dome.js", g: "YCDome" },
    { file: "instruments/yc-metrics.js", g: "YCMetrics" }
  ];

  function ensureKernels(cb) {
    var pending = [], failed = [];
    KERNELS.forEach(function (k) {
      if (window[k.g]) return;
      pending.push(k);
    });
    if (!pending.length) { cb([]); return; }
    var left = pending.length;
    function done() { if (--left === 0) cb(failed); }
    pending.forEach(function (k) {
      var s = document.createElement("script");
      s.src = k.file;
      s.async = false;
      s.onload = done;
      s.onerror = function () { failed.push(k.g); done(); };
      document.head.appendChild(s);
    });
  }

  /* 五馆基准规格：exec() 现场调用该馆内核跑一次，不是写死的数字 */
  function baselineSpecs() {
    return [
      {
        hall: "H2", object: "toydist", seed: 20311001,
        instrument: { id: "yc-forensic", version: "0.1.0" },
        title: "四臂成对干预：解释与答案的耦合度",
        question: "解释得通，是否意味着解释真的影响了答案？",
        hypothesis: "成对干预下的答案变化量能反推解释与答案的耦合度 ĉ",
        conditions: ["treat：改写解释", "ctrl：无关改写", "效力正控", "效力负控"],
        controls: ["同题双胞胎实例", "答案交换"],
        n: 240, unit: "实例对",
        exec: function () {
          var r = window.YCForensic.runAudit({});
          return { verdict: r.verdict, est: r.est, why: r.why };
        }
      },
      {
        hall: "H3", object: "rule", seed: 1001,
        instrument: { id: "yc-metrics", version: "0.1.0" },
        title: "代理指标尸检：分数上升是否等于任务变好",
        question: "分数提高，是否真的让任务变好？",
        hypothesis: "代理指标 P 与独立目标 T 会在优化后期背离",
        conditions: ["六档优化预算", "独立巡检快照"],
        controls: ["无独立目标测量时拒判"],
        n: 120, unit: "优化回合",
        exec: function () {
          var M = window.YCMetrics;
          var dev = M.makeWorld(1001, { budget: 120 });
          var r = M.optimize(dev, [8, 16, 32, 64, 128, 256], {
            seeds: [11, 29], snapSeeds: [11, 29, 47, 71, 97], optSeed: 20261029
          });
          var a = M.analyze(r.trace, { minEffect: 0.05 });
          return { verdict: a.verdict, est: { peak: a.peak, structural: a.structural }, why: a.verdict };
        }
      },
      {
        hall: "H4", object: "toydist", seed: 20311002,
        instrument: { id: "yc-contamination", version: "0.1.0" },
        title: "原题—变体—新题：反推回吐压力 κ̂",
        question: "它答对，是泛化、记忆，还是当前证据无法区分？",
        hypothesis: "改写保真度足够时，三档准确率落差可反推记忆占比",
        conditions: ["原题", "变体", "新题", "冷参照难度认证"],
        controls: ["变体没改答案则拒判", "探针没接上则拒判"],
        n: 96, unit: "题目",
        exec: function () {
          var r = window.YCContam.runAudit({});
          return { verdict: r.verdict, est: r.est, why: r.why };
        }
      },
      {
        hall: "H5", object: "toydist", seed: 20311003,
        instrument: { id: "yc-greenhouse", version: "0.1.0" },
        title: "十六谱系 × 八质量层：尾巴是看不见还是被抹掉",
        question: "数据反复来自模型自身时，哪些信息会消失？",
        hypothesis: "分位支撑覆盖率能把「看不见」与「递归枯萎」分开",
        conditions: ["16 条平行谱系", "8 个质量层", "逐代血缘"],
        controls: ["ρ 够高时必须报未检出", "平滑系数 α 必须为 0"],
        n: 16, unit: "谱系",
        exec: function () {
          var r = window.YCGreenhouse.run({});
          return { verdict: r.verdict, est: r.est, why: r.why };
        }
      },
      {
        hall: "H6", object: "toydist", seed: 20311101,
        instrument: { id: "yc-dome", version: "0.1.0" },
        title: "预算天穹：三种失败与选择器赤字",
        question: "一次失败，是能力不足、调用不当，还是预算不足？",
        hypothesis: "八倍预算的提升必须全部落在可达任务上",
        conditions: ["k = 1…256 九级阶梯", "τ = 1.0", "120 道任务分三种失败"],
        controls: ["不可达任务命中率提升必须严格等于 0", "有效预算 ≤1.6 时拒判"],
        n: 120, unit: "任务",
        exec: function () {
          var r = window.YCDome.run({ k: 32, tau: 1.0 });
          return { verdict: r.verdict, est: { pass: r.pass, vote: r.vote, nEff: r.nEff }, why: r.why };
        }
      }
    ];
  }

  /* 现场跑五馆内核 → 写成五份合规档案 */
  function loadBaseline() {
    var specs = baselineSpecs(), made = 0, failed = [];
    specs.forEach(function (s) {
      var out;
      try { out = s.exec(); } catch (e) { failed.push(s.hall + "：" + (e && e.message ? e.message : e)); return; }
      if (!out || !out.verdict) { failed.push(s.hall + "：内核没有返回结论"); return; }
      var rec = E.create({
        id: "YC-BASE-" + s.hall,
        hall: s.hall,
        instrument: s.instrument,
        title: s.title,
        tags: { object: s.object, run: "live", source: "controlled", review: "replayable" },
        source: {
          dataType: "本机现场执行的内核输出",
          origin: "yangcheng/instruments",
          license: "项目自建",
          model: s.instrument.id + " v" + s.instrument.version,
          contactHistory: "无外部数据接触",
          knownMissing: "规模远小于真实模型，结论只对该构造成立"
        },
        design: {
          question: s.question,
          hypothesis: s.hypothesis,
          conditions: s.conditions,
          controls: s.controls,
          preregistered: false
        },
        budget: { generate: 1, verify: 1, train: 0, retries: 0 },
        run: {
          seed: s.seed,
          params: { source: "evidence.html 基准载入" },
          codeVersion: s.instrument.id + "@" + s.instrument.version
        },
        stats: {
          n: s.n, resampleUnit: s.unit,
          effect: fmtEst(out.est),
          interval: "-", missing: 0, failures: 0
        },
        conclusion: {
          verdict: out.verdict,
          supported: [s.hypothesis],
          alternatives: [],
          unsupported: ["不能外推到真实大模型"],
          nextData: ["独立复核：换一套任务族重跑"]
        },
        review: {
          replayMethod: "打开该馆页面点「存入公共证据厅」，或在本页点「载入五馆基准档案」重跑",
          status: "replayable",
          corrections: []
        }
      });
      E.save(rec);
      made++;
    });
    return { made: made, failed: failed };
  }

  /* ---------------- 复核渲染 ---------------- */
  function verdictCls(v) {
    return v === "consistent" ? "ok" : v === "conflict" ? "bad" : "warn";
  }
  var SUB_CN = {
    clean: "无异常", full: "全部可比", partial: "部分可比", few: "档案不足",
    dependent: "全部同源", incomparable: "全部不可比", claim: "命题冲突",
    "claim+sameorigin": "命题冲突 · 且同源", orphan: "含孤证", sameorigin: "含同源"
  };
  /* 子型可能是 "partial+orphan" 这种组合，逐段翻译再拼，避免漏出英文原文 */
  function subCN(s) {
    if (!s) return "";
    return String(s).split("+").map(function (x) { return SUB_CN[x] || x; }).join(" · ");
  }
  var FLAG_CN = {
    sameorigin: "同源", sharedimpl: "共享实现", orphan: "孤证",
    gap: "缺口", incomparable: "不可比"
  };
  var PAIR_CN = { comparable: "可比", analogy: "仅类比", incomparable: "不可比" };
  var DIR_CN = {
    general: "通用", bounded: "有边界",
    causal: "因果", posthoc: "事后编",
    valid: "有效", invalid: "失效",
    dominant: "记忆主导", generalization: "泛化",
    recursive: "递归所致", visibility: "看不见",
    "reach-only": "只在可达", uniform: "均匀"
  };

  function renderAudit() {
    var body = $("auditBody");
    var recs = E.list();
    if (!recs.length) {
      body.innerHTML = '<p class="aempty">还没有档案。联合复核要至少两份 —— ' +
        '点上面的「载入五馆基准档案」，会现场调用 H2—H6 的仪器内核各跑一次，把真实结果写成五份档案。</p>';
      $("auditSum").textContent = "还没有可复核的档案";
      return;
    }
    var r = A.audit(recs);
    lastAudit = r;
    curPair = null;

    var VCN2 = { consistent: "一致", conflict: "冲突", undetermined: "不可判定" };
    $("auditSum").textContent = r.n + " 份档案 · " + r.halls.length + " 馆 · 判定 " +
      (VCN2[r.verdict] || r.verdict) + " · " + subCN(r.subtype);

    var H = [];

    /* 判定条 */
    var cls = verdictCls(r.verdict);
    var VCN = { consistent: "一致", conflict: "冲突", undetermined: "不可判定" };
    H.push('<div class="averd ' + cls + '">');
    H.push('<div class="av">' + (VCN[r.verdict] || r.verdict) + '<span style="font-size:10px;opacity:.65"> / ' +
      subCN(r.subtype) + '</span></div>');
    H.push('<div class="aw">' + esc(r.why) + '</div>');
    H.push('</div>');

    /* 四指标 */
    H.push('<div class="astats">');
    H.push('<div class="astat"><div class="k">档案</div><div class="n">' + r.n +
      '<small> / ' + Object.keys(A.CLAIMS).length + ' 馆</small></div></div>');
    H.push('<div class="astat ' + (r.comparable ? "ok" : "bad") + '"><div class="k">可直接并排</div><div class="n">' +
      r.comparable + '<small> / ' + r.pairs.length + ' 对</small></div></div>');
    H.push('<div class="astat ' + (r.indep.effective < r.n ? "warn" : "ok") + '"><div class="k">独立观测</div><div class="n">' +
      r.indep.effective + '<small> / ' + r.n + '</small></div></div>');
    H.push('<div class="astat ' + (r.orphans.length ? "warn" : "ok") + '"><div class="k">孤证</div><div class="n">' +
      r.orphans.length + '<small> 项</small></div></div>');
    H.push('</div>');

    /* 矩阵 + 配对详情 */
    H.push('<div class="amwrap">');
    H.push('<div class="ambox"><div class="mt"><span>可比性矩阵</span>' +
      '<span class="spacer"></span><span class="mleg">' +
      '<span><i class="c"></i>可比</span><span><i class="a"></i>仅类比</span>' +
      '<span><i class="x"></i>不可比</span><span><i class="s"></i>自身</span></span></div>');
    H.push('<div class="amgrid" id="amgrid" style="grid-template-columns:46px repeat(' + r.halls.length + ',44px)">');
    H.push('<div></div>');
    r.halls.forEach(function (h) { H.push('<div class="ch">' + h + '</div>'); });
    r.halls.forEach(function (ha) {
      var ac = (E.HALL_BY_ID[ha] || {}).accent || "var(--tx3)";
      H.push('<div class="rh" style="color:' + ac + '">' + ha + '</div>');
      r.halls.forEach(function (hb) {
        if (ha === hb) { H.push('<div class="amc s" title="自身">·</div>'); return; }
        var p = null;
        for (var i = 0; i < r.pairs.length; i++) {
          var q = r.pairs[i];
          if ((q.hallA === ha && q.hallB === hb) || (q.hallA === hb && q.hallB === ha)) { p = q; break; }
        }
        if (!p) { H.push('<div class="amc s">·</div>'); return; }
        var cc = p.level === "comparable" ? "c" : p.level === "analogy" ? "a" : "x";
        H.push('<div class="amc ' + cc + '" data-pa="' + p.a + '" data-pb="' + p.b + '" title="' +
          ha + ' × ' + hb + '：' + (PAIR_CN[p.level] || p.level) + '">' +
          (p.level === "comparable" ? "✓" : p.level === "analogy" ? "≈" : "✕") + '</div>');
      });
    });
    H.push('</div></div>');

    H.push('<div class="apair" id="apair"><div class="ph">配对详情</div>' +
      '<div class="pd">点左边矩阵里任意一格，看这一对为什么能并排、或为什么不能。</div>' +
      '<div class="pl">对角线是自身，不构成一对。</div></div>');
    H.push('</div>');

    /* 命题表 */
    H.push('<div class="aclaim"><div class="ct"><span>馆</span><span>命题</span><span>方向</span><span>结论</span></div>');
    r.claims.forEach(function (c) {
      var vv = E.VERDICTS[c.verdict] || { t: c.verdict, cls: "idle" };
      H.push('<div class="cr"><span class="hh" style="color:' +
        ((E.HALL_BY_ID[c.hall] || {}).accent || "var(--tx3)") + '">' + c.hall + '</span>' +
        '<span>' + esc(c.label) + '</span>' +
        '<span class="dd ' + (c.decisive ? "on" : "off") + '">' + (c.dir ? (DIR_CN[c.dir] || c.dir) : "不贡献") + '</span>' +
        '<span class="vv ' + vv.cls + '">' + esc(vv.t) + '</span></div>');
    });
    H.push('</div>');

    /* 标记 */
    if (r.flags.length) {
      H.push('<div class="aflags">');
      r.flags.forEach(function (f) {
        H.push('<div class="aflag ' + f.k + '"><span class="fk">' + (FLAG_CN[f.k] || f.k) + '</span>' +
          '<span class="ft">' + esc(f.t) + '</span><span class="fd">' + esc(f.d) + '</span></div>');
      });
      H.push('</div>');
    }

    /* 自检与负例 */
    var sc = A.selfCheck(), ng = A.negatives();
    function rows(list) {
      return list.map(function (c) {
        return '<div class="ackrow"><span class="st ' + (c.pass ? "ok" : "no") + '">' +
          (c.pass ? "PASS" : "FAIL") + '</span><span><b>' + esc(c.name) + '</b>　' +
          esc(c.detail) + '</span></div>';
      }).join("");
    }
    var okSc = sc.filter(function (c) { return c.pass; }).length;
    var okNg = ng.filter(function (c) { return c.pass; }).length;
    H.push('<div class="acheck">');
    H.push('<div class="ackbox"><div class="kh"><span>自检</span><span class="spacer"></span>' +
      '<span style="color:' + (okSc === sc.length ? "var(--ok)" : "#ef8a90") + '">' + okSc + ' / ' + sc.length + '</span></div>' +
      rows(sc) + '</div>');
    H.push('<div class="ackbox"><div class="kh"><span>负例 · 这台仪器能被用坏</span><span class="spacer"></span>' +
      '<span style="color:' + (okNg === ng.length ? "var(--ok)" : "#ef8a90") + '">' + okNg + ' / ' + ng.length + '</span></div>' +
      rows(ng) + '</div>');
    H.push('</div>');

    body.innerHTML = H.join("");

    /* 矩阵点击 */
    Array.prototype.forEach.call(body.querySelectorAll(".amc[data-pa]"), function (el) {
      el.addEventListener("click", function () {
        Array.prototype.forEach.call(body.querySelectorAll(".amc.on"), function (x) { x.classList.remove("on"); });
        el.classList.add("on");
        showPair(el.getAttribute("data-pa"), el.getAttribute("data-pb"));
      });
    });
  }

  function showPair(ida, idb) {
    var r = lastAudit, p = null;
    for (var i = 0; i < r.pairs.length; i++) {
      var q = r.pairs[i];
      if ((q.a === ida && q.b === idb) || (q.a === idb && q.b === ida)) { p = q; break; }
    }
    var box = $("apair");
    if (!p) { box.innerHTML = '<div class="ph">配对详情</div><div class="pd">没有找到这一对。</div>'; return; }
    var ca = null, cb = null;
    r.claims.forEach(function (c) { if (c.id === p.a) ca = c; if (c.id === p.b) cb = c; });
    var H = [];
    H.push('<div class="ph">' + p.hallA + ' × ' + p.hallB + '　' + (PAIR_CN[p.level] || p.level) + '</div>');
    H.push('<div class="pv" style="color:' +
      (p.level === "comparable" ? "var(--ok)" : p.level === "analogy" ? "var(--gold)" : "#ef8a90") + '">' +
      (p.level === "comparable" ? "可以直接并排" : p.level === "analogy" ? "只能作类比" : "不能并排") + '</div>');
    H.push('<div class="pd">' + esc(p.why) + '</div>');
    if (p.diff && p.diff.length) {
      H.push('<div class="pl">差异轴：' + p.diff.map(function (d) {
        return ({ object: "对象", run: "运行", source: "来源" })[d.axis] + " " + d.a + " vs " + d.b;
      }).join("；") + '</div>');
    }
    if (ca && cb) {
      H.push('<div class="pl">命题：' + esc(ca.key) + ' vs ' + esc(cb.key) +
        (ca.key === cb.key ? '（同一命题，可比方向）' : '（不同命题，各说各的）') + '</div>');
    }
    box.innerHTML = H.join("");
  }

  /* ---------------- 操作 ---------------- */
  $("btnBase").addEventListener("click", function () {
    var btn = $("btnBase");
    btn.disabled = true;
    btn.textContent = "正在加载内核…";
    ensureKernels(function (missing) {
      if (missing.length) {
        btn.disabled = false;
        btn.textContent = "载入五馆基准档案";
        $("auditSum").textContent = "内核加载失败：" + missing.join("、") + "（可能是离线打开）";
        return;
      }
      btn.textContent = "正在跑五个内核…";
      setTimeout(function () {
        var res = loadBaseline();
        btn.disabled = false;
        btn.textContent = "载入五馆基准档案";
        renderList();
        renderTray();
        renderAudit();
        if (res.failed.length) {
          $("auditSum").textContent = "载入 " + res.made + " 份，失败 " + res.failed.length + " 份：" + res.failed.join("；");
        }
        var first = E.list()[0];
        if (first && !cur) { cur = first; renderList(); renderDetail(first); }
      }, 40);
    });
  });

  $("btnRecheck").addEventListener("click", function () {
    renderAudit();
  });

  /* ---------------- 操作 ---------------- */
  $("filters").addEventListener("click", function (e) {
    var b = e.target.closest(".fb");
    if (!b) return;
    filter = b.dataset.f;
    Array.prototype.forEach.call(document.querySelectorAll(".fb"), function (x) {
      x.classList.toggle("on", x === b);
    });
    renderList();
  });

  $("btnBundle").addEventListener("click", function () {
    var b = E.exportBundle();
    var blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "yangcheng-evidence-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  });

  $("btnClear").addEventListener("click", function () {
    if (!confirm("清空本机全部档案？此操作不可撤销，建议先导出。")) return;
    E.clear();
    cur = null;
    renderList(); renderTray();
    $("evdetail").innerHTML = '<div class="blank"><b>本地档案已清空</b>导出的文件不受影响。</div>';
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") location.href = "index.html";
  });

  /* ---------------- 启动 ---------------- */
  renderList();
  renderTray();
  renderAudit();
  var first = E.list()[0];
  if (first) { cur = first; renderList(); renderDetail(first); }
})();

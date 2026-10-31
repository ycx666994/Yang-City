/* ============================================================
   yc-evidence.js — YC-Evidence 1.0 证据协议实现
   本文件是杨城的骨架：六馆共用同一份档案格式、同一套四轴标签、
   同一种导出。任何仪器产出的结论都必须先成为一份合规档案，
   才能进入公共证据厅。

   设计依据（总方案 §7）：
   · 7.1 每份档案的最小记录（身份/来源/设计/预算/运行/统计/结论/复核）
   · 7.2 四轴标签（对象/运行/来源/复核），不是单一证据分数
   · 7.3 四项约束（预注册、按独立单位重采样、报告检出率与失败、
           允许输出"无变化/无效/不足/冲突"）
   · 7.4 三种可复现性（本地确定性/外部重复/固定记录回放）

   注意：本协议是项目内部拟议规范，不是行业标准。
   ============================================================ */
(function () {
  "use strict";

  var PROTOCOL = "YC-Evidence 1.0";
  var STORE_KEY = "yc.evidence.v1";

  /* ---------------- 六馆注册表 ---------------- */
  /* status: build=筹建 / playable=机制可玩 / instrument=仪器可用
             / replayable=真实实验可回放 / reviewed=独立复核通过  */
  var HALLS = [
    {
      id: "H1", no: "01", name: "能力与边界博物馆", legacy: "Trust Lab",
      question: "它表现得很强，究竟证明了什么？",
      flagship: "涌现实验室 + 认证地平线",
      accent: "#46d3e8", varName: "--h1",
      status: "instrument", href: "../h1-lab.html",
      shape: "刻度塔",
      evidence: "测量尺度、模型输出、校准、扰动、样本与预算边界",
      cannot: "不能证明模型具备通用能力；有限观测不证明数学意义上的不连续。",
      note: "现有综合馆升级接入城市，八件展品与两个实验室全部保留。"
    },
    {
      id: "H2", no: "02", name: "推理法医馆", legacy: "思考的证词",
      question: "解释得通，是否意味着解释真的影响了答案？",
      flagship: "外显推理干预台",
      accent: "#a887ff", varName: "--h2",
      status: "instrument", href: "h2-forensic.html",
      annex: "h2-case.html", annexName: "案卷 0117 · 十一日（四幕破案）",
      shape: "证据棱镜",
      evidence: "成对干预、答案变化、错误修复、暗示利用及依据披露",
      cannot: "不读取模型内部思维；外显解释与行为是两件事。",
      note: "四臂成对干预：treat / ctrl / 效力正控 / 效力负控，反推耦合度 ĉ 并给出区间。"
    },
    {
      id: "H3", no: "03", name: "指标失效博物馆", legacy: "古德哈特墓园",
      question: "分数提高，是否真的让任务变好？",
      flagship: "代理指标尸检台",
      accent: "#f2a63c", varName: "--h3",
      status: "instrument", href: "h3-metrics.html",
      annex: "h3-maze.html", annexName: "指标塔 · 3D 迷宫",
      shape: "双刻度塔",
      evidence: "优化预算、代理收益、独立目标测量、行为轨迹与下降区间",
      cannot: "没有独立目标测量时拒绝出具死亡判断，只报数据缺口。",
      note: "首版活体装置：清洁机器人有限状态环境，策略由实际运行选出。"
    },
    {
      id: "H4", no: "04", name: "数据污染博物馆", legacy: "泄题法医室",
      question: "它答对，是泛化、记忆，还是当前证据无法区分？",
      flagship: "原题—变体—新题对照台",
      accent: "#35cfa8", varName: "--h4",
      status: "instrument", href: "h4-contam.html",
      annex: "h4-purge.html", annexName: "净化车间 · 十二道工序",
      shape: "档案层架",
      evidence: "受控接触历史、题目保真度、逐题迁移、可用的概率信息",
      cannot: "未知训练历史只能形成受限风险信号，不能签发无污染证明。",
      note: "三档对照 + 冷参照难度认证 + 答案溯源：反推回吐压力 κ̂ 并给出区间。"
    },
    {
      id: "H5", no: "05", name: "递归坍塌博物馆", legacy: "坍塌观测站",
      question: "数据反复来自模型自身时，哪些信息会消失？",
      flagship: "世代谱系观测台",
      accent: "#ef6a72", varName: "--h5",
      status: "instrument", href: "h5-collapse.html",
      annex: "h5-forecast.html", annexName: "坍塌预报台 · 三个温室",
      shape: "谱系温室",
      evidence: "自训练递归过程、逐代数据血缘、分位支撑覆盖、枯萎世代分布、混合比与采样预算",
      cannot: "不预设必然崩溃；动画变糊不等于模型训练。",
      note: "16 条平行谱系 + 8 个质量层逐层定死因：看不见，还是被递归抹掉。"
    },
    {
      id: "H6", no: "06", name: "潜能与预算博物馆", legacy: "沉睡能力陈列馆",
      question: "一次失败，是能力不足、调用不当，还是预算不足？",
      flagship: "能力激发预算台",
      accent: "#6d9bff", varName: "--h6",
      status: "instrument", href: "h6-budget.html",
      annex: "h6-tower.html", annexName: "预算塔 · 十层",
      shape: "可变穹顶",
      evidence: "名义预算、有效预算、可达上限、选择器赤字、近失比例与温度扫描",
      cannot: "不是无限算力的能力许愿池；pass@k 不等于实际系统能选中。",
      note: "120 道任务分三种失败：可达但稀有、近失、不可达。预算只治第一种。"
    }
  ];

  var HALL_BY_ID = {};
  HALLS.forEach(function (h) { HALL_BY_ID[h.id] = h; });

  /* ---------------- 四轴标签字典 ---------------- */
  /* 每轴是并列描述，不是高低排序。 */
  var AXES = {
    object: {
      key: "object", label: "对象",
      opts: {
        rule:      { t: "规则装置", d: "确定性规则或有限状态机，无学习" },
        toydist:   { t: "玩具分布模型", d: "真实执行拟合，但规模远小于大模型" },
        model:     { t: "指定真实模型", d: "标注版本与调用方式的实际模型" },
        system:    { t: "模型＋工具系统", d: "含工具/检索/验证器的组合系统" }
      }
    },
    run: {
      key: "run", label: "运行",
      opts: {
        live:   { t: "现场执行", d: "本次在浏览器内实时计算" },
        replay: { t: "固定记录回放", d: "读取已保存运行记录，未重新执行" },
        story:  { t: "仅故事引用", d: "仅引用外部叙事，无数据" }
      }
    },
    source: {
      key: "source", label: "来源",
      opts: {
        controlled: { t: "自建受控实验", d: "本项目建设并控制的实验" },
        external:   { t: "外部论文数据", d: "公开研究的固定数据" },
        submitted:  { t: "用户提交", d: "访客导入的运行记录，未经复核" }
      }
    },
    review: {
      key: "review", label: "复核",
      opts: {
        unreviewed:  { t: "未复核", d: "尚无任何人复算" },
        replayable:  { t: "记录可回放", d: "包内记录足以重放" },
        independent: { t: "独立复核", d: "外部人员仅凭包内记录复现" }
      }
    }
  };

  /* ---------------- 结论词表 ---------------- */
  var VERDICTS = {
    supported:    { t: "结论被支持", cls: "ok" },
    refuted:      { t: "结论被推翻", cls: "bad" },
    noeffect:     { t: "未检出效应", cls: "idle" },
    undetermined: { t: "证据不足 / 不可判定", cls: "warn" },
    conflict:     { t: "结果冲突", cls: "bad" }
  };

  /* ---------------- 工具 ---------------- */
  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }

  function nowISO() { return new Date().toISOString(); }

  /* 稳定序列化：键排序，保证同样内容得到同样校验值 */
  function stable(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    var ks = Object.keys(v).sort();
    return "{" + ks.map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
  }

  /* FNV-1a 32 位：只用于发现记录被改动，不保证来源真实 */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function checksum(rec) {
    var c = JSON.parse(JSON.stringify(rec));
    delete c.checksum;
    return fnv1a(stable(c));
  }

  /* 生成档案 ID：YC-H3-20261029-4F2A */
  function makeId(hallId) {
    var d = new Date();
    var ds = d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2);
    var rnd = ("0000" + Math.floor(Math.random() * 65536).toString(16).toUpperCase()).slice(-4);
    return "YC-" + hallId + "-" + ds + "-" + rnd;
  }

  /* ---------------- 建档 ---------------- */
  /* spec 允许部分缺失，validate 负责指出缺什么 —— 不静默补默认值冒充完整 */
  function create(spec) {
    spec = spec || {};
    var hall = HALL_BY_ID[spec.hall] || HALL_BY_ID.H1;
    var rec = {
      protocol: PROTOCOL,
      id: spec.id || makeId(hall.id),
      created: spec.created || nowISO(),
      hall: hall.id,
      hallName: hall.name,
      instrument: spec.instrument || { id: "unnamed", version: "0" },
      title: spec.title || "未命名档案",
      case: spec.case || null,              // {id, title} 跨馆同一案件
      tags: spec.tags || {
        object: "rule", run: "live", source: "controlled", review: "unreviewed"
      },
      source: spec.source || {},
      design: spec.design || {},
      budget: spec.budget || {},
      run: spec.run || {},
      stats: spec.stats || {},
      conclusion: spec.conclusion || {},
      review: spec.review || { replayMethod: "", status: "unreviewed", corrections: [] }
    };
    rec.checksum = checksum(rec);
    return rec;
  }

  /* 必填检查 —— 对应 §7.1 八类最小记录 */
  var REQUIRED = [
    ["design.question", "研究问题"],
    ["design.hypothesis", "假设"],
    ["design.conditions", "实验条件"],
    ["run.seed", "随机种子"],
    ["run.params", "运行参数"],
    ["stats.n", "样本量"],
    ["stats.resampleUnit", "重采样单位"],
    ["conclusion.verdict", "结论状态"],
    ["source.dataType", "数据类型"]
  ];

  function dig(obj, path) {
    var p = path.split("."), v = obj;
    for (var i = 0; i < p.length; i++) { if (v == null) return undefined; v = v[p[i]]; }
    return v;
  }

  function validate(rec) {
    var errors = [];
    REQUIRED.forEach(function (r) {
      var v = dig(rec, r[0]);
      if (v === undefined || v === null || v === "" ||
          (Array.isArray(v) && v.length === 0)) errors.push("缺 " + r[1] + "（" + r[0] + "）");
    });
    if (!VERDICTS[dig(rec, "conclusion.verdict")]) errors.push("结论状态不在词表内");
    Object.keys(AXES).forEach(function (k) {
      var v = dig(rec, "tags." + k);
      if (!v || !AXES[k].opts[v]) errors.push("四轴标签 " + k + " 无效");
    });
    var recomputed = checksum(rec);
    if (rec.checksum && rec.checksum !== recomputed) {
      errors.push("校验值不符：记录在保存后被改动（原 " + rec.checksum + " / 现 " + recomputed + "）");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------------- 存取 ---------------- */
  function readAll() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeAll(arr) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn("[YC-Evidence] 写入失败（可能超出配额）", e);
      return false;
    }
  }

  function save(rec) {
    rec.checksum = checksum(rec);
    var arr = readAll();
    var i = -1;
    for (var k = 0; k < arr.length; k++) if (arr[k].id === rec.id) { i = k; break; }
    if (i >= 0) arr[i] = rec; else arr.unshift(rec);
    if (arr.length > 120) arr = arr.slice(0, 120);
    writeAll(arr);
    return rec;
  }

  function list(filter) {
    var arr = readAll();
    if (!filter) return arr;
    return arr.filter(function (r) {
      if (filter.hall && r.hall !== filter.hall) return false;
      if (filter.caseId && (!r.case || r.case.id !== filter.caseId)) return false;
      if (filter.verdict && dig(r, "conclusion.verdict") !== filter.verdict) return false;
      return true;
    });
  }

  function get(id) {
    var arr = readAll();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function remove(id) {
    writeAll(readAll().filter(function (r) { return r.id !== id; }));
  }

  function clear() { writeAll([]); }

  /* 每馆档案统计（用于城市建筑亮灯） */
  function hallStats() {
    var arr = readAll(), m = {};
    HALLS.forEach(function (h) { m[h.id] = { n: 0, latest: null, verdicts: {} }; });
    arr.forEach(function (r) {
      if (!m[r.hall]) m[r.hall] = { n: 0, latest: null, verdicts: {} };
      m[r.hall].n++;
      var v = dig(r, "conclusion.verdict") || "undetermined";
      m[r.hall].verdicts[v] = (m[r.hall].verdicts[v] || 0) + 1;
      if (!m[r.hall].latest || r.created > m[r.hall].latest.created) m[r.hall].latest = r;
    });
    return m;
  }

  /* 同一案件下不同馆结论是否冲突 */
  function caseConflicts() {
    var arr = readAll(), byCase = {};
    arr.forEach(function (r) {
      if (!r.case || !r.case.id) return;
      (byCase[r.case.id] = byCase[r.case.id] || { id: r.case.id, title: r.case.title, recs: [] }).recs.push(r);
    });
    var out = [];
    Object.keys(byCase).forEach(function (cid) {
      var g = byCase[cid];
      var vs = {};
      g.recs.forEach(function (r) { var v = dig(r, "conclusion.verdict"); vs[v] = (vs[v] || 0) + 1; });
      var keys = Object.keys(vs);
      var decisive = keys.filter(function (k) { return k === "supported" || k === "refuted"; });
      if (decisive.length > 1) out.push({ kind: "conflict", group: g, verdicts: vs });
      else if (keys.indexOf("undetermined") >= 0 && decisive.length >= 1)
        out.push({ kind: "downgrade", group: g, verdicts: vs });
    });
    return out;
  }

  /* ---------------- 导出 ---------------- */
  function exportMarkdown(rec) {
    var L = [];
    var V = VERDICTS[dig(rec, "conclusion.verdict")] || { t: "?" };
    L.push("# " + rec.title);
    L.push("");
    L.push("> " + PROTOCOL + " · " + rec.id + " · 校验值 " + (rec.checksum || "-"));
    L.push("");
    L.push("| 字段 | 值 |");
    L.push("|---|---|");
    L.push("| 馆 | " + rec.hallName + "（" + rec.hall + "） |");
    L.push("| 仪器 | " + (rec.instrument.id || "?") + " v" + (rec.instrument.version || "?") + " |");
    L.push("| 创建 | " + rec.created + " |");
    L.push("| 结论状态 | " + V.t + " |");
    if (rec.case) L.push("| 关联案件 | " + rec.case.title + "（" + rec.case.id + "） |");
    L.push("");
    L.push("## 四轴标签");
    L.push("");
    Object.keys(AXES).forEach(function (k) {
      var key = dig(rec, "tags." + k);
      var o = AXES[k].opts[key];
      L.push("- **" + AXES[k].label + "**：" + (o ? o.t : key) + " — " + (o ? o.d : ""));
    });
    L.push("");
    L.push("## 来源");
    var s = rec.source || {};
    L.push("- 数据类型：" + (s.dataType || "-"));
    L.push("- 原始出处：" + (s.origin || "-"));
    L.push("- 许可：" + (s.license || "-"));
    L.push("- 模型/对象版本：" + (s.model || "-"));
    L.push("- 接触历史：" + (s.contactHistory || "-"));
    L.push("- 已知缺失：" + (s.knownMissing || "-"));
    L.push("");
    L.push("## 设计");
    var d = rec.design || {};
    L.push("- 问题：" + (d.question || "-"));
    L.push("- 假设：" + (d.hypothesis || "-"));
    L.push("- 条件：" + (Array.isArray(d.conditions) ? d.conditions.join("；") : (d.conditions || "-")));
    L.push("- 对照：" + (Array.isArray(d.controls) ? d.controls.join("；") : (d.controls || "-")));
    L.push("- 预注册：" + (d.preregistered ? "是" : "否（探索性）"));
    L.push("");
    L.push("## 预算");
    var b = rec.budget || {};
    L.push("- 生成：" + (b.generate != null ? b.generate : "-"));
    L.push("- 验证：" + (b.verify != null ? b.verify : "-"));
    L.push("- 训练/拟合：" + (b.train != null ? b.train : "-"));
    L.push("- 失败重试：" + (b.retries != null ? b.retries : "-"));
    L.push("");
    L.push("## 运行");
    var r = rec.run || {};
    L.push("- 种子：" + (r.seed != null ? r.seed : "-"));
    L.push("- 参数：" + JSON.stringify(r.params || {}));
    L.push("- 代码版本：" + (r.codeVersion || "-"));
    L.push("");
    L.push("## 统计");
    var st = rec.stats || {};
    L.push("- 样本量：" + (st.n != null ? st.n : "-"));
    L.push("- 重采样单位：" + (st.resampleUnit || "-"));
    L.push("- 效应：" + (st.effect != null ? st.effect : "-"));
    L.push("- 区间：" + (st.interval || "-"));
    L.push("- 缺失/失败：" + (st.missing || "-") + " / " + (st.failures || "-"));
    L.push("");
    L.push("## 结论");
    var c = rec.conclusion || {};
    L.push("**" + V.t + "**");
    L.push("");
    L.push("被支持的范围：");
    (c.supported || []).forEach(function (x) { L.push("- " + x); });
    L.push("");
    L.push("替代解释：");
    (c.alternatives || []).forEach(function (x) { L.push("- " + x); });
    L.push("");
    L.push("未被支持的推断：");
    (c.unsupported || []).forEach(function (x) { L.push("- " + x); });
    L.push("");
    L.push("下一步所需数据：");
    (c.nextData || []).forEach(function (x) { L.push("- " + x); });
    L.push("");
    L.push("## 复核");
    var rv = rec.review || {};
    L.push("- 回放方法：" + (rv.replayMethod || "-"));
    L.push("- 复核状态：" + (rv.status || "-"));
    L.push("- 更正历史：" + ((rv.corrections || []).length ? rv.corrections.join("；") : "无"));
    L.push("");
    L.push("---");
    L.push("内容校验值用于发现记录变化，不保证数据来源真实。");
    return L.join("\n");
  }

  function exportBundle() {
    var arr = readAll();
    return {
      protocol: PROTOCOL,
      exported: nowISO(),
      count: arr.length,
      note: "校验值仅用于发现记录改动，不保证来源真实；未复核记录不得当作已核实结论。",
      records: arr
    };
  }

  /* ---------------- 对外 ---------------- */
  window.YCEvidence = {
    PROTOCOL: PROTOCOL,
    VERSION: "1.0",
    HALLS: HALLS,
    HALL_BY_ID: HALL_BY_ID,
    AXES: AXES,
    VERDICTS: VERDICTS,
    create: create,
    validate: validate,
    checksum: checksum,
    save: save,
    list: list,
    get: get,
    remove: remove,
    clear: clear,
    hallStats: hallStats,
    caseConflicts: caseConflicts,
    exportMarkdown: exportMarkdown,
    exportBundle: exportBundle,
    dig: dig,
    nowISO: nowISO,
    makeId: makeId
  };
})();

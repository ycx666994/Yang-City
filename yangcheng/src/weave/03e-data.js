/* ============================================================
   织识 · 体系合并与派生
   ------------------------------------------------------------
   把基础体系（03b，旧格式带初始掌握度）与前沿体系（03c / 03d，新格式）
   统一成同一种结构，并过滤掉指向不存在节点的边。

   统一后的节点：
     { id, key, name, tag, w, desc }
   掌握度不在这里，运行时由 save 决定 —— 灯只能靠考核点亮。
   ============================================================ */
(function (w) {
  "use strict";

  var TAG = {
    /* 基础 */
    core: "核心", edge: "边界", use: "日常使用", work: "工作流",
    /* 推理与模型 */
    base: "机制", think: "推理时", scale: "规模与效率", limit: "边界",
    /* 智能体 */
    loop: "循环", tool: "工具", risk: "风险与权限", mem: "记忆",
    multi: "协作", eval: "评测",
    /* 上下文 */
    ctx: "上下文", rag: "检索",
    /* 多模态 */
    gen: "生成", world: "世界模型", embodied: "具身",
    /* 评测 */
    bench: "基准", judge: "判分", align: "对齐",
    /* 前沿 */
    sci: "科学", self: "自省"
  };

  /* 同一个 tag 在不同体系里意思不同：
     agent 的 multi 是「多智能体协作」，eval 的 multi 是「多步评测」，
     multi 体系的 multi 是「多模态」。按体系覆盖，别让标签串味。 */
  var TAG_OVERRIDE = {
    multi: { multi: "多模态", gen: "生成", world: "世界模型", embodied: "具身", limit: "边界", risk: "风险", eval: "评测" },
    eval: { multi: "多步评测", bench: "基准", judge: "判分", align: "对齐", risk: "风险", eval: "评测" }
  };

  function normNode(sysId, n) {
    return {
      id: sysId + ":" + n[0],
      key: n[0],
      name: n[1],
      tag: n[2],
      w: typeof n[3] === "number" ? n[3] : 1.2,
      desc: n[4] || ""
    };
  }

  var SYS = [];
  var more = w.YC_WEAVE_NEW || [];

  more.forEach(function (s) {
    var nodes = (s.nodes || []).map(function (n) { return normNode(s.id, n); });
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });

    /* 边只保留两端都存在的，避免数据笔误导致孤立连线 */
    var edges = (s.edges || []).map(function (e, i) {
      return {
        id: s.id + ":e" + i,
        s: s.id + ":" + e[0],
        t: s.id + ":" + e[1],
        k: e[2] || "pre"
      };
    }).filter(function (e) {
      return ids[e.s] && ids[e.t] && e.s !== e.t;
    });

    SYS.push({
      id: s.id,
      name: s.name,
      en: s.en,
      note: s.note,
      core: s.core,
      tag: s.tag || "curated",   /* curated = 官方体系；own = 用户自建 */
      nodes: nodes,
      edges: edges,
      size: nodes.length
    });
  });

  /* 官网体系固定排序：先判断力，再前沿 */
  var ORDER = ["ai", "reason", "agent", "ctx", "multi", "eval", "frontier"];
  SYS.sort(function (a, b) {
    var ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
    if (ia < 0) ia = 99;
    if (ib < 0) ib = 99;
    return ia - ib;
  });

  /* AI 素养那套的引言写的是旧数量，这里改成不依赖数字的说法 */
  SYS.forEach(function (s) {
    if (s.id === "ai") {
      s.core = "这套不教你怎么写提示词，教你怎么判断一个回答值不值得信。从「能用不等于会用」开始，一路走到底下那些关于边界的灯。";
    }
  });

  w.YC_WEAVE = {
    systems: SYS,
    tags: TAG,
    tagName: function (t, sysId) {
      var o = TAG_OVERRIDE[sysId];
      if (o && o[t]) return o[t];
      return TAG[t] || t;
    }
  };
})(window);

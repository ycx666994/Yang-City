/* ============================================================
   织识 · 大模型层
   ------------------------------------------------------------
   守灯人是一个真的大模型，通过杨城自己的云服务调用，
   用户不需要任何 API key。

   这一层只做四件事：
     1. 初始化（懒执行，失败要能说清为什么）
     2. 流式对话（把 token 一片片交给界面）
     3. 结构化输出（出题、判分、找灯、建体系，都要 JSON）
     4. 把错误翻译成人话（配额、超时、域名不匹配……）

   所有 prompt 都要求「说具体的」，不许写「非常重要」这类空话。
   ============================================================ */
(function (w) {
  "use strict";

  /* publicConfig 由云服务下发，随发布域名一起变。
     换域名时这一块要跟着更新，否则 Origin 校验会失败。 */
  var CFG = {
    endpoint: "https://yangcheng.app.workbuddy.host",
    publishableKey: "wbpk_qtgQQEgXMHNaryDxE6wLqL_6N7dE8oI2g8l1Ad10EHE7x0PbF1IzfVb",
    oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth"
  };

  var STATE = {
    client: null,
    model: null,
    pool: [],       /* 可用模型，按偏好排序；出问题时往后换 */
    at: 0,
    promise: null,
    error: "",      /* 非空表示不可用，值是给用户看的说明 */
    calls: 0
  };

  /* 云服务里能选三十来个模型，名字带 pro / max 的未必最稳。
     这里按「中文讲得清、判分稳、够快」排了一个偏好序，
     真出问题时 stream() 会自动往后换一个。 */
  var PREFER = [
    "deepseek-v4.1-flash", "glm-5.3-flash", "kimi-k3.1-pro",
    "deepseek-v4-pro", "glm-5.3", "auto"
  ];

  var PERSONA =
    "你是杨城「织识」的守灯人。你的工作不是把知识讲全，是把一盏灯讲到对方能自己判断。\n" +
    "规则：\n" +
    "1 说具体的。不要「非常重要」「值得注意」「随着发展」这类话，一句都不要。\n" +
    "2 不确定就说不确定，并指出哪一部分你没有把握。\n" +
    "3 一次只讲三层就停：它是什么、它和旁边哪盏灯连着、它在什么情况下不成立。\n" +
    "4 问到这张灯图以外的内容，直说图上没有，再说要不要补充。\n" +
    "5 不用「作为 AI」「希望对你有帮助」这类开场和收尾。\n" +
    "6 中文，短句，不用 emoji，不用感叹号。";

  function init() {
    if (STATE.promise) return STATE.promise;
    STATE.promise = (async function () {
      /* SDK 是 defer 加载的，正常情况下早就到位了。
         这里等两秒是给慢网一个机会，不是给「没网」找台阶。 */
      if (!w.WorkBuddyCloud) {
        for (var i = 0; i < 20 && !w.WorkBuddyCloud; i++) {
          await new Promise(function (r) { setTimeout(r, 100); });
        }
      }
      if (!w.WorkBuddyCloud || !w.WorkBuddyCloud.createWorkBuddyCloud) {
        STATE.error = "模型加载失败：SDK 没下来。检查网络，或者换一个能连外网的浏览器。灯图还能看，但不能讲课、不能考核。";
        throw new Error("sdk");
      }
      STATE.client = w.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        publishableKey: CFG.publishableKey,
        oauthRelayBaseUrl: CFG.oauthRelayBaseUrl
      });

      var models = await STATE.client.llm.models.list();
      if (!models || !models.length) {
        STATE.error = "云服务没有返回任何可用模型。";
        throw new Error("no-model");
      }
      var ok = models.filter(function (m) { return m.disabled !== true && m.enabled !== false; });
      if (!ok.length) {
        STATE.error = "云服务里的模型全部被停用了。";
        throw new Error("all-disabled");
      }
      /* 偏好序在前，其余可用模型兜底在后 */
      var pool = [];
      PREFER.forEach(function (id) {
        var m = ok.find(function (x) { return x.id === id; });
        if (m) pool.push(m);
      });
      ok.forEach(function (m) { if (pool.indexOf(m) < 0) pool.push(m); });
      STATE.pool = pool;
      STATE.at = 0;
      STATE.model = pool[0];
      return STATE.model;
    })().catch(function (e) {
      if (!STATE.error) STATE.error = errText(e);
      throw e;
    });
    return STATE.promise;
  }

  function errText(e) {
    var code = (e && e.error && e.error.code) || (e && e.code) || "";
    if (String(code).indexOf("auth_") === 0) return "这个域名没有通过云服务的校验。用发布的正式地址打开，模型才连得上。";
    if (String(code).indexOf("quota_") === 0) return "今天的模型额度用完了，明天再试，或者换一个模型。";
    if (String(code).indexOf("gateway_") === 0 || String(code).indexOf("model_") === 0) return "模型服务暂时不可用，稍后再点一次。";
    if (String(code).indexOf("request_") === 0) return "请求参数不对（" + code + "），这是程序的问题。";
    if (code === "gateway_stream_interrupted") return "回答中途断了，已经写出来的部分留着。";
    return (e && e.message) || "调用失败，原因不明。";
  }

  /* ---------- 流式对话 ---------- */
  async function stream(opt) {
    await init();
    var client = STATE.client;
    STATE.calls++;

    for (;;) {
      var model = STATE.pool[STATE.at] || STATE.model;
      var params = {
        model: model.id,
        messages: [{ role: "system", content: opt.system || PERSONA }]
          .concat(opt.messages || [{ role: "user", content: opt.user }]),
        stream: true,
        temperature: typeof opt.temperature === "number" ? opt.temperature : 0.7
      };
      if (opt.json) params.response_format = { type: "json_object" };
      if (opt.signal) params.signal = opt.signal;

      var out = "";
      try {
        for await (var ch of client.llm.chat.completions.create(params)) {
          var d = ch.choices && ch.choices[0] && ch.choices[0].delta;
          if (d && d.content) {
            out += d.content;
            if (opt.onDelta) opt.onDelta(d.content, out);
          }
        }
        return out;
      } catch (e) {
        var code = (e && e.error && e.error.code) || "";
        /* 有些模型对参数挑剔，会在真正开始输出前就 400 回来。
           这时换下一个模型重试一次，别把「模型不兼容」当成人看不懂的错误。 */
        var noOutput = out === "";
        if (/^request_/.test(code) && noOutput && STATE.at + 1 < STATE.pool.length) {
          STATE.at++;
          continue;
        }
        throw e;
      }
    }
  }

  /* 从可能带 ``` 包裹或前后废话的文本里挖出 JSON */
  function grabJSON(text) {
    var t = String(text || "");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  }

  async function json(system, user, opt) {
    opt = opt || {};
    var text = await stream({
      system: system,
      user: user,
      temperature: typeof opt.temperature === "number" ? opt.temperature : 0.3,
      json: true,
      signal: opt.signal
    });
    var v = grabJSON(text);
    if (!v) throw new Error("模型没有按格式回答");
    return v;
  }

  /* ---------- 图上的邻居，用来给模型交代上下文 ---------- */
  function around(sys, node) {
    var byId = {};
    sys.nodes.forEach(function (n) { byId[n.id] = n; });
    var up = [], down = [], rel = [];
    sys.edges.forEach(function (e) {
      if (e.t === node.id && e.k === "pre") up.push(byId[e.s]);
      else if (e.s === node.id && e.k === "pre") down.push(byId[e.t]);
      else if (e.s === node.id || e.t === node.id) rel.push(byId[e.s === node.id ? e.t : e.s]);
    });
    var line = function (arr) {
      return arr.filter(Boolean).slice(0, 4).map(function (n) { return n.name + "：" + n.desc; }).join("\n  ") || "（无）";
    };
    return {
      up: up.filter(Boolean).slice(0, 4),
      down: down.filter(Boolean).slice(0, 4),
      rel: rel.filter(Boolean).slice(0, 4),
      block: "上游（要先懂这些）：\n  " + line(up) + "\n下游（懂了它才谈得上懂）：\n  " + line(down)
        + "\n相关：\n  " + line(rel)
    };
  }

  function nodeBlock(sys, node, ctx) {
    return "体系：" + sys.name + "（" + (sys.note || "") + "）\n"
      + "这盏灯：" + node.name + "\n"
      + "图上对它的定义：" + node.desc + "\n"
      + ctx.block;
  }

  /* ---------- 1 讲一盏灯 ---------- */
  async function explain(sys, node, onDelta, signal) {
    var ctx = around(sys, node);
    var user = nodeBlock(sys, node, ctx) + "\n\n"
      + "用户刚在灯图上打开了这盏灯，还没有点亮。请讲三段，每段一到两句，段间空一行，总共不超过 200 字：\n"
      + "① 它到底在说什么——不要重复上面那句定义，换一个角度讲。\n"
      + "② 它和上面某一盏灯的关系——挑最相关的那盏，说清因果：为什么得先懂它。\n"
      + "③ 它在什么情况下不成立，或者最常见的误解是什么。\n"
      + "不要标题，不要编号，不要开场白。";
    return stream({ user: user, onDelta: onDelta, temperature: 0.75, signal: signal });
  }

  /* ---------- 2 讲两盏灯的关系（从一个点发散） ---------- */
  async function relate(sys, a, b, onDelta, signal) {
    var user = "体系：" + sys.name + "\n"
      + "灯 A：" + a.name + "——" + a.desc + "\n"
      + "灯 B：" + b.name + "——" + b.desc + "\n\n"
      + "讲清这两盏灯是怎么连起来的：谁先谁后、中间的因果、混在一起会出什么错。"
      + "三段以内，不超过 160 字，不要开场白。";
    return stream({ user: user, onDelta: onDelta, temperature: 0.7, signal: signal });
  }

  /* ---------- 3 出题（三问） ---------- */
  async function quiz(sys, node, level, signal) {
    var ctx = around(sys, node);
    var lvName = ["", "刚上手", "要用得上", "能教别人"][level] || "刚上手";
    var near = ctx.up.concat(ctx.down, ctx.rel).filter(Boolean);
    var pick = near.length ? near[0] : null;
    var user = nodeBlock(sys, node, ctx) + "\n\n"
      + "难度：" + lvName + "。\n"
      + (pick ? "第二题必须围绕「" + pick.name + "」出。\n" : "")
      + "出三道题，依次是：\n"
      + "① 是什么：让他用自己的话解释，背定义不算过。\n"
      + "② 和谁相连：给定上面那盏相邻的灯，问两者的关系与先后。\n"
      + "③ 边界：什么情况下这条不成立，或者最容易在哪里用错。\n"
      + (level >= 2 ? "难度要求：二三题要落到具体场景，不要问「请简述」。\n" : "")
      + "每题再写一句「评分要点」，说明答到什么算过、什么算没答到。要点必须具体可判，不要写「理解正确」。\n"
      + '只输出 JSON：{"q":[{"ask":"题目","key":"评分要点"}]}';
    var v = await json(PERSONA, user, { temperature: 0.5, signal: signal });
    var qs = (v.q || []).filter(function (x) { return x && x.ask; }).slice(0, 3);
    if (!qs.length) throw new Error("这次没出成题，再点一次");
    return qs;
  }

  /* ---------- 4 判分 ---------- */
  async function grade(sys, node, q, answer, signal) {
    var user = "这盏灯：" + node.name + "\n标准定义：" + node.desc + "\n\n"
      + "题目：" + q.ask + "\n评分要点：" + (q.key || "答到核心意思即可") + "\n\n"
      + "用户的回答：\n「" + String(answer).slice(0, 1200) + "」\n\n"
      + "严格判分，规则：\n"
      + "1 说得流利、用词专业，但没碰到要点，不得超过 40 分。\n"
      + "2 直接复述上面的标准定义，不超过 70 分——那是背的，不是懂的。\n"
      + "3 答错关键处、答非所问、或者只是在重复题目里的话，给 20 分以下。\n"
      + "4 80 分以上必须是「要点齐、有自己的例子或说法」。\n"
      + '只输出 JSON：{"score":0到100的整数,"hit":["答到的要点"],"miss":["漏掉或答错的要点"],"say":"不超过40字，指出最关键的一处对或错"}';
    var v = await json(PERSONA, user, { temperature: 0.15, signal: signal });
    var s = Math.max(0, Math.min(100, Math.round(Number(v.score) || 0)));
    return {
      score: s,
      hit: Array.isArray(v.hit) ? v.hit.slice(0, 4) : [],
      miss: Array.isArray(v.miss) ? v.miss.slice(0, 4) : [],
      say: String(v.say || "").slice(0, 120)
    };
  }

  /* ---------- 5 自由追问 ---------- */
  async function chat(sys, node, history, onDelta, signal) {
    var ctx = node ? around(sys, node) : null;
    var user = "体系：" + sys.name + "（" + (sys.note || "") + "）\n"
      + (node ? "用户正在看这盏灯：" + node.name + "——" + node.desc + "\n" + ctx.block : "用户没有选中具体的灯。")
      + "\n\n" + (history.length ? "对话记录：\n" + history.join("\n") : "")
      + "\n\n回答最后一句不要总结，不要问「还需要我解释吗」。";
    return stream({ user: user, onDelta: onDelta, temperature: 0.7, signal: signal });
  }

  /* ---------- 6 语义找灯（强检索） ---------- */
  async function find(sysList, query, signal) {
    var catalog = sysList.map(function (s) {
      return "【" + s.name + "】" + s.nodes.map(function (n) { return n.name; }).join("、");
    }).join("\n");
    var user = "这是一张灯图里所有的知识点，按体系分组：\n" + catalog + "\n\n"
      + "用户说：「" + String(query).slice(0, 300) + "」\n\n"
      + "从上面找出最多 5 盏最贴合的灯，按贴合度排序。只从上面出现过的名字里选，不要发明。\n"
      + "每盏给一句「为什么是它」，不超过 25 字。\n"
      + '只输出 JSON：{"hit":[{"sys":"体系名","name":"灯名","why":"理由"}]}';
    var v = await json(PERSONA, user, { temperature: 0.2, signal: signal });
    var hits = (v.hit || []).filter(function (h) { return h && h.name; });
    /* 只认图上真有的名字，模型编的一律丢掉 */
    return hits.map(function (h) {
      var sys = sysList.find(function (s) { return s.name === h.sys; });
      if (!sys) return null;
      var node = sys.nodes.find(function (n) { return n.name === h.name; });
      if (!node) return null;
      return { sys: sys, node: node, why: String(h.why || "").slice(0, 60) };
    }).filter(Boolean).slice(0, 5);
  }

  /* ---------- 7 从一句话生成一张新灯图 ---------- */
  async function build(topic, material, signal) {
    var user = "用户想新建一张知识灯图。\n"
      + "主题：「" + String(topic).slice(0, 200) + "」\n"
      + (material ? "他给的参考材料（节选）：\n" + String(material).slice(0, 3000) + "\n" : "")
      + "\n要求：\n"
      + "1 拆成 10 到 16 个知识点。每个必须是「一个能单独讲清的概念」，不要写「概述」「其他」这类空节点。\n"
      + "2 每个给一句话解释，30 到 50 字，说清它在说什么，不写重要性。\n"
      + "3 第一个节点 id 必须是 root，是整张图的入口。\n"
      + "4 边只连真正有先决关系的：要先懂 A 才谈得上懂 B，写成 [\"A\",\"B\",\"pre\"]；互相印证写 rel。\n"
      + "5 标签用来分组，最多 4 种，每种 2 到 6 个字。\n"
      + "6 整张图必须连通：从 root 能沿边走到每一个节点。\n"
      + '只输出 JSON：{"name":"体系名，不超过8字","en":"英文名","note":"一句话说明这张图讲什么，10字内","core":"两三句话的引言，说清这张图的态度","nodes":[{"id":"root","name":"","tag":"","desc":""}],"edges":[["root","x","pre"]]}';
    var v = await json(PERSONA, user, { temperature: 0.6, signal: signal });
    return normalizeBuilt(v, topic);
  }

  /* 模型给的东西不一定干净，这里逐项洗一遍 */
  function normalizeBuilt(v, topic) {
    var nodes = (v.nodes || []).filter(function (n) { return n && n.name && n.desc; });
    if (nodes.length < 4) throw new Error("生成的节点太少，换个说法再试");
    var seen = {};
    nodes = nodes.map(function (n, i) {
      var key = String(n.id || ("n" + i)).replace(/[^\w\u4e00-\u9fa5-]/g, "").slice(0, 24) || ("n" + i);
      while (seen[key]) key += "x";
      seen[key] = true;
      return {
        key: key,
        name: String(n.name).slice(0, 20),
        tag: String(n.tag || "core").slice(0, 8),
        w: 1.2,
        desc: String(n.desc).slice(0, 120)
      };
    });
    if (!seen.root) nodes[0].key = "root";

    var byName = {};
    nodes.forEach(function (n) { byName[n.name] = n.key; });
    nodes.forEach(function (n) { byName[n.key] = n.key; });

    var edges = (v.edges || []).map(function (e) {
      var s = byName[e[0]] || e[0], t = byName[e[1]] || e[1];
      var k = ["pre", "rel", "ext"].indexOf(e[2]) >= 0 ? e[2] : "pre";
      return [s, t, k];
    }).filter(function (e) { return seen[e[0]] && seen[e[1]] && e[0] !== e[1]; });

    return {
      id: "own-" + Date.now().toString(36),
      name: String(v.name || topic).slice(0, 12),
      en: String(v.en || "MY MAP").toUpperCase().slice(0, 28),
      note: String(v.note || "自己建的图").slice(0, 20),
      core: String(v.core || "").slice(0, 200),
      tag: "own",
      nodes: nodes,
      edges: edges,
      size: nodes.length
    };
  }

  w.YC_LLM = {
    init: init,
    stream: stream,
    explain: explain,
    relate: relate,
    quiz: quiz,
    grade: grade,
    chat: chat,
    find: find,
    build: build,
    around: around,
    state: STATE,
    available: function () { return !STATE.error; },
    why: function () { return STATE.error; }
  };
})(window);

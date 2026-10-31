/* ============================================================
   h3-app.js — 指标失效博物馆 · 代理指标尸检台（界面层）
   界面只负责三件事：把参数交给仪器、把结果如实画出来、把结论写成档案。
   任何统计判断都在 instruments/yc-metrics.js 里，界面不许自己下结论。
   ============================================================ */
(function () {
  "use strict";

  var E = window.YCEvidence, M = window.YCMetrics, C = window.YCChart;
  var CK = [8, 16, 32, 64, 128, 256];
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    layer: "story",
    seed: 1001,
    minEffect: 0.05,
    audit: false,
    trace: null, analysis: null, opt: null, record: null,
    dev: { u: [0, 0.5], playing: false, frames: null }
  };

  /* ---------------- 层切换 ---------------- */
  function setLayer(name) {
    S.layer = name;
    Array.prototype.forEach.call(document.querySelectorAll(".layer"), function (el) {
      el.classList.toggle("on", el.dataset.l === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lay"), function (el) {
      el.classList.toggle("on", el.dataset.l === name);
    });
    var m = document.querySelector(".main");
    if (m) m.scrollTop = 0;
    if (name === "instrument" && S.trace) requestAnimationFrame(renderChart);
    if (name === "device" && !S.dev.frames) runDevice(true);
  }

  Array.prototype.forEach.call(document.querySelectorAll(".lay"), function (b) {
    b.addEventListener("click", function () { setLayer(b.dataset.l); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (b) {
    b.addEventListener("click", function () { setLayer(b.dataset.go); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === "1") setLayer("story");
    if (e.key === "2") setLayer("device");
    if (e.key === "3") setLayer("instrument");
    if (e.key === "4") setLayer("evidence");
    if (e.key === "Escape") location.href = "index.html";
  });

  /* ================= 装置层 ================= */
  var cells = [];

  function buildRooms() {
    var box = $("rooms");
    box.innerHTML = "";
    cells = [];
    var w = M.makeWorld(S.seed, { budget: 120 });
    w.rooms.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "rm" + (r.tail ? " tail" : "");
      d.innerHTML = '<div class="dirt"></div><div class="wear"></div>' +
        '<span class="tag">' + (r.i < 9 ? "0" : "") + (r.i + 1) + '</span><span class="val"></span>';
      box.appendChild(d);
      cells.push(d);
    });
    paint(w.rooms, -1);
  }

  function paint(rooms, cur) {
    for (var i = 0; i < rooms.length && i < cells.length; i++) {
      var r = rooms[i], c = cells[i];
      c.style.setProperty("--d", Math.max(0, Math.min(1, r.dirt)).toFixed(3));
      c.style.setProperty("--w", Math.min(1, r.wear / 0.36).toFixed(3));
      c.querySelector(".val").textContent = r.dirt.toFixed(2);
      c.classList.toggle("cur", i === cur);
    }
  }

  function readKnobs() {
    var p = +$("knPower").value, b = +$("knBoost").value;
    $("kvPower").textContent = (p / 100).toFixed(2);
    $("kvBoost").textContent = Math.round(b) + "%";
    $("knPower").style.setProperty("--pct", ((p - 40) / 180 * 100) + "%");
    $("knBoost").style.setProperty("--pct", (b / 90 * 100) + "%");
    return [b / 100, (p / 100 - 0.4) / 1.8];
  }

  ["knPower", "knBoost"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      S.dev.u = readKnobs();
      $("devNote").textContent = "旋钮已改。点「跑一个回合」看这一组参数的真实结果。";
    });
  });

  function runDevice(silent) {
    if (S.dev.playing) return;
    S.dev.u = readKnobs();
    var frames = [];
    var ep = M.runEpisode(M.makeWorld(S.seed, { budget: 120 }), S.dev.u, 11, null, {
      every: 3,
      cb: function (step, W, P, cur) {
        frames.push({
          step: step, P: P, cur: cur,
          rooms: W.rooms.map(function (r) { return { dirt: r.dirt, wear: r.wear }; })
        });
      }
    });
    var ins = M.inspect(ep.world, 4011);
    S.dev.frames = frames;

    if (silent) {   /* 首次进入装置层：直接给终态，不做动画 */
      var last = frames[frames.length - 1];
      paint(last.rooms, -1);
      $("devStep").textContent = "STEP " + last.step + " / 120";
      finishDevice(ep, ins);
      return;
    }

    S.dev.playing = true;
    $("btnRunDevice").disabled = true;
    var i = 0;
    var t = setInterval(function () {
      var f = frames[i];
      paint(f.rooms, f.cur);
      $("devStep").textContent = "STEP " + f.step + " / 120";
      $("stP").textContent = f.P.toFixed(0);
      i++;
      if (i >= frames.length) {
        clearInterval(t);
        S.dev.playing = false;
        $("btnRunDevice").disabled = false;
        finishDevice(ep, ins);
      }
    }, 24);
  }

  function finishDevice(ep, ins) {
    $("stP").textContent = ep.P.toFixed(0);
    $("stT").textContent = ins.T.toFixed(3);
    $("stWear").textContent = ins.wear.toFixed(3);
    $("stWaste").textContent = ep.wasted + " / " + ep.vacs;
    $("stVacs").textContent = ep.vacs;

    var th = M.decodeTheta(S.dev.u);
    var note;
    if (ins.T > 0.90) {
      note = "这一组参数是收敛的：处理量 " + ep.P.toFixed(0) + "，巡检 " + ins.T.toFixed(3) +
        "。功率 " + th.power.toFixed(2) + " 没有超过大多数房间的脆弱度，多出来的作业基本都变成了清洁收益。";
    } else if (ins.T > 0.70) {
      note = "已经开始出现代价：处理量 " + ep.P.toFixed(0) + "，巡检 " + ins.T.toFixed(3) +
        "，其中 " + ep.wasted + " 次作业是在已经洁净的地面上重复推。磨损均值 " + ins.wear.toFixed(3) + "。";
    } else {
      note = "这就是失效的样子：处理量 " + ep.P.toFixed(0) + " 看起来很漂亮，巡检只有 " + ins.T.toFixed(3) +
        "。全部 " + ep.vacs + " 次作业里有 " + ep.wasted + " 次是在已经干净的地面上重复推，" +
        "而磨损均值升到 " + ins.wear.toFixed(3) + "。数字在涨，地板在坏。";
    }
    $("devNote").textContent = note;
    $("devNote").style.color = "var(--tx2)";
  }

  /* ================= 仪器层 ================= */
  function busy(on) { $("busy").classList.toggle("on", on); }

  function runAutopsy() {
    busy(true);
    $("instState").textContent = "运行中";
    setTimeout(function () {
      var seed = parseInt($("selSeed").value, 10) || 1001;
      var me = parseFloat($("numMinEffect").value);
      if (!isFinite(me) || me <= 0) me = 0.05;
      S.seed = seed; S.minEffect = me;
      S.audit = $("chkAudit").checked;

      var dev = M.makeWorld(seed, { budget: 120 });
      var audit = S.audit ? { powerCap: 0.55, noBoost: true } : null;
      var r = M.optimize(dev, CK, {
        seeds: [11, 29], snapSeeds: [11, 29, 47, 71, 97],
        optSeed: 20261029, audit: audit
      });
      var a = M.analyze(r.trace, { minEffect: me });

      S.trace = r.trace; S.analysis = a; S.opt = r;
      S.record = buildRecord(r, a, seed, me);
      E.save(S.record);

      renderVerdict(a);
      renderOuts(a);
      renderTheta(r.trace);
      renderChart();
      renderEvidence(S.record, a);

      $("btnExport").disabled = false;
      $("instState").textContent = "已完成 · " + r.episodes + " 回合";
      $("confirmBox").style.display = "block";
      $("confirmOut").textContent = "";
      $("btnConfirm").disabled = false;
      busy(false);
    }, 50);
  }

  function renderVerdict(a) {
    var box = $("verdict");
    var map = {
      supported: { cls: "bad", ic: "▲", t: "结论被支持：代理上升期间，独立目标出现持续下降" },
      refuted: { cls: "ok", ic: "▼", t: "结论被推翻" },
      noeffect: { cls: "ok", ic: "○", t: "未检出下降" },
      undetermined: { cls: "warn", ic: "?", t: "证据不足 / 不可判定" },
      conflict: { cls: "warn", ic: "≠", t: "结果冲突" }
    };
    var v = map[a.verdict] || map.undetermined;
    box.className = "vd " + v.cls;
    var extra = "";
    if (a.verdict === "supported" && a.decline) {
      extra = "处理量从 " + a.P[0].toFixed(0) + " 涨到 " + a.P[a.P.length - 1].toFixed(0) +
        "（+" + Math.round((a.P[a.P.length - 1] / a.P[0] - 1) * 100) + "%）；同期独立目标从峰值 " +
        a.T[a.peak.idx].toFixed(3) + " 跌到 " + a.T[a.T.length - 1].toFixed(3) +
        "，跌幅 " + a.decline.drop.toFixed(3) + "，超过预设最小实际效应 " + a.minEffect + "。";
    } else if (a.gaps.length) {
      extra = a.gaps.join(" ");
    }
    if (a.peak && a.verdict === "supported") {
      extra += " 多种子重复中 " + Math.round(a.peak.detectRate * 100) + "% 出现下降（n=" + a.peak.n + "）。";
    }
    box.innerHTML = '<div class="vic">' + v.ic + '</div><div><div class="vt">' + v.t +
      '</div><div class="vx">' + extra + '</div></div>';
  }

  function renderOuts(a) {
    var labels = a.budgets || [];
    function set(id, has, ov, od) {
      var el = $(id);
      el.className = "out " + (has ? "hit" : "none");
      el.querySelector(".ov").textContent = ov;
      if (od) el.querySelector(".od").textContent = od;
    }
    /* 结构变点 */
    if (a.structural && a.structural.length) {
      set("outStructural", true,
        a.structural.map(function (i) { return "第 " + i + " 档"; }).join(" · "),
        "PELT(L2) 在 T 序列上找到 " + a.structural.length + " 处均值结构改变");
    } else {
      set("outStructural", false, "未检出结构变点", "PELT 未找到值得用一段独立均值描述的区间");
    }
    /* 峰值 */
    if (a.peak && a.peak.idx != null) {
      set("outPeak", true,
        "第 " + a.peak.idx + " 档 · " + (labels[a.peak.idx] || "?") + " 回合",
        "多种子 80% 区间 [" + a.peak.lo + ", " + a.peak.hi + "]；检出率 " +
        Math.round(a.peak.detectRate * 100) + "%（n=" + a.peak.n + "）");
    } else {
      set("outPeak", false, "不可判定", "档位不足以定位峰值");
    }
    /* 持续下降 */
    if (a.decline) {
      set("outDecline", true,
        "第 " + a.decline.from + " 档起 · 跌 " + a.decline.drop.toFixed(3),
        "以峰值为参考的 CUSUM 起点；区间内 " + a.decline.sustainedPts + " 档低于峰值超过最小效应");
    } else {
      set("outDecline", false, "未检出持续下降",
        a.cusum ? "CUSUM 统计量 " + a.cusum.stat.toFixed(2) + "（阈 " + a.cusum.threshold + "）" : "序列长度不足");
    }
    /* 异常 */
    if (a.anomalies && a.anomalies.length) {
      set("outAnomaly", true,
        a.anomalies.length + " 处急跌",
        a.anomalies.map(function (x) { return "第 " + x.at + " 档 " + x.drop; }).join("；"));
    } else {
      set("outAnomaly", false, "无", "没有单档跌幅超过 2.5σ 的事件");
    }
    $("tagDetect").textContent = a.verdict === "supported"
      ? "检出 · 峰值在第 " + a.peak.idx + " 档"
      : (a.verdict === "noeffect" ? "未检出下降" : "不可判定");
    $("tagDetect").className = "tag " + (a.verdict === "supported" ? "bad" : (a.verdict === "noeffect" ? "ok" : "warn"));
  }

  function renderTheta(trace) {
    var b = $("thetaBody");
    b.innerHTML = "";
    trace.forEach(function (p, i) {
      var tr = document.createElement("tr");
      if (S.analysis && S.analysis.peak && S.analysis.peak.idx === i) tr.className = "hi";
      tr.innerHTML = "<td class='m'>" + p.budget + "</td>" +
        "<td class='m'>" + p.P.toFixed(1) + "</td>" +
        "<td class='m'>" + p.T.toFixed(3) + "</td>" +
        "<td style='font-size:10.5px'>" + p.label + "</td>";
      b.appendChild(tr);
    });
  }

  var detachHover = null;
  function renderChart() {
    if (!S.trace) return;
    var cv = $("chartCv");
    var a = S.analysis;
    var geo = C.draw(cv, {
      labels: S.trace.map(function (p) { return String(p.budget); }),
      xLabel: "优化预算（回合）",
      series: [
        { key: "P", label: "处理量 P", values: S.trace.map(function (p) { return p.P; }), color: "#f2a63c", axis: "left", fmt: function (v) { return v.toFixed(0); } },
        { key: "T", label: "独立目标 T", values: S.trace.map(function (p) { return p.T; }), color: "#7fe3c0", axis: "right", fill: true, fmt: function (v) { return v.toFixed(3); } }
      ],
      peak: a.peak ? a.peak.idx : null,
      span: a.decline ? { from: a.decline.from, to: a.decline.to } : null,
      changePoints: a.structural || [],
      extra: function (i) { return "θ " + S.trace[i].label; }
    });
    if (detachHover) detachHover();
    if (geo) detachHover = C.hover(cv, geo, {
      labels: S.trace.map(function (p) { return String(p.budget); }),
      series: [
        { label: "处理量 P", values: S.trace.map(function (p) { return p.P; }), color: "#f2a63c", fmt: function (v) { return v.toFixed(1); } },
        { label: "独立目标 T", values: S.trace.map(function (p) { return p.T; }), color: "#7fe3c0", fmt: function (v) { return v.toFixed(3); } }
      ],
      extra: function (i) { return "θ " + S.trace[i].label; }
    });
  }

  /* ---------------- 确认集 ---------------- */
  function revealConfirm() {
    if (!S.opt) return;
    var dev = M.makeWorld(7777, { budget: 120 });
    var audit = S.audit ? { powerCap: 0.55, noBoost: true } : null;
    var ep = M.runEpisode(dev, S.opt.finalU, 13, audit);
    var ins = M.inspect(ep.world, 4013);
    var tDev = S.trace[S.trace.length - 1].T;
    var peakDev = S.trace[S.analysis.peak.idx].T;
    var dropDev = peakDev - tDev;
    var sameDir = (dropDev > 0.02 && ins.T < peakDev - 0.02) ? "同向" :
      (dropDev < 0.02 && ins.T >= peakDev - 0.02) ? "同向" : "不同向";
    $("confirmOut").innerHTML = "T_confirm = <b style='color:#7fe3c0;font-family:var(--mono)'>" +
      ins.T.toFixed(3) + "</b> ｜ T_dev 末档 = " + tDev.toFixed(3) +
      " ｜ 与开发集结论 <b>" + sameDir + "</b>。" +
      (sameDir === "不同向" ? " 结论不稳定，应保留不可判定并扩大样本。" : "") +
      " <span style='color:var(--tx4)'>确认集已揭示，此后成为已见数据。</span>";
    $("btnConfirm").disabled = true;
    if (S.record) {
      S.record.review.corrections = S.record.review.corrections || [];
      S.record.review.corrections.push("确认集已揭示（T_confirm=" + ins.T.toFixed(3) + "，与开发集" + sameDir + "）");
      E.save(S.record);
      renderEvidence(S.record, S.analysis);
    }
  }

  /* ---------------- 档案 ---------------- */
  function buildRecord(r, a, seed, me) {
    var sup = [], alt = [], unsup = [], next = [];
    var peakIdx = a.peak ? a.peak.idx : null;
    var drop = a.decline ? a.decline.drop : 0;

    if (a.verdict === "supported") {
      sup.push("在优化器只看代理指标「处理量」的条件下，处理量从 " + a.P[0].toFixed(0) +
        " 升至 " + a.P[a.P.length - 1].toFixed(0) + " 的过程中，独立巡检测得的清洁度指标在峰值后出现跌幅 " +
        drop.toFixed(3) + " 的持续下降（超过预设最小实际效应 " + me + "）。");
      sup.push("多种子重复中 " + Math.round(a.peak.detectRate * 100) + "% 出现同向下降（n=" + a.peak.n + "）。");
      alt.push("观测到的下降可能部分来自巡检噪声与房间间权重选择，而非全部来自磨损。");
      alt.push("优化器自身的随机搜索路径可能影响峰值位置，换 optSeed 需重做。");
    } else if (a.verdict === "noeffect") {
      sup.push("在本次设定下，代理指标上升未伴随超过最小实际效应的独立目标下降。");
      alt.push("可能是最小实际效应设得过大，掩盖了小幅但真实的下降。");
      alt.push("可能是本次房间分布中表面脆弱度普遍高于所搜索到的功率，磨损未发生。");
    } else {
      unsup.push("本次运行不足以支持「代理指标上升导致独立目标下降」的任何强度判断。");
    }
    unsup.push("不能据此推断任何真实商用系统发生了指标失效：本档案对象轴为「规则装置」。");
    unsup.push("不能把结构变点当作指标死亡的日期。");
    next.push("换环境种子与 optSeed 重复，检查峰值区间是否稳定。");
    next.push("增加优化预算档位（如 512、1024 回合），确认下降是否继续。");
    next.push("引入第二种独立目标定义（例如只算尾房），检验结论对 T 的定义是否敏感。");

    return E.create({
      hall: "H3",
      instrument: { id: "proxy-autopsy", version: "0.1.0" },
      title: (S.audit ? "加装审计条件下" : "无审计条件下") + "代理处理量与独立目标的对照",
      case: { id: "C1-why-good", title: "为什么它突然考得很好" },
      tags: { object: "rule", run: "live", source: "controlled", review: "replayable" },
      source: {
        dataType: "浏览器内有限状态机运行记录（10 房间 / 120 步预算）",
        origin: "YC-Metrics 自建环境，无外部数据",
        license: "项目自建，随仓库发布",
        model: "清洁机器人 FSM v0.1（规则装置，非学习模型）",
        contactHistory: "不适用：环境中不存在训练数据",
        knownMissing: "未做外部模型重复实验；未接入真实保洁作业记录"
      },
      design: {
        question: "当优化器只能看到代理指标「处理量」时，独立目标是否会在某一优化预算之后持续下降？",
        hypothesis: "代理上升的后期，独立目标会因表面磨损与无效重复作业出现可检出的持续下降。",
        conditions: [
          "无审计：优化器自由搜索 θ = (功率, 尾房加力)",
          "有审计：功率上限 0.55 且禁止尾房加力"
        ],
        controls: [
          "抗磨损房间环境：同一优化器不应检出下降",
          "优化预算不足（3 档）：应判为不可判定"
        ],
        preregistered: true
      },
      budget: { generate: r.episodes, verify: r.episodes, train: 0, retries: 0 },
      run: {
        seed: seed,
        params: {
          optSeed: 20261029, evalSeeds: [11, 29], snapSeeds: [11, 29, 47, 71, 97],
          checkpoints: CK, minEffect: me, audit: S.audit ? { powerCap: 0.55, noBoost: true } : null,
          finalTheta: M.decodeTheta(r.finalU)
        },
        codeVersion: M.CODE
      },
      stats: {
        n: r.trace.length,
        resampleUnit: "独立运行（5 个快照种子）",
        effect: a.decline ? -a.decline.drop : 0,
        interval: a.peak ? ("峰值档位 " + peakIdx + " [" + a.peak.lo + "," + a.peak.hi + "]") : "无",
        missing: a.gaps.length, failures: 0,
        proxyGain: a.P.length ? +(a.P[a.P.length - 1] / a.P[0] - 1).toFixed(4) : 0,
        tPeak: a.peak ? +a.T[a.peak.idx].toFixed(4) : null,
        tLast: +a.T[a.T.length - 1].toFixed(4),
        tDrop: a.decline ? +a.decline.drop.toFixed(4) : 0
      },
      conclusion: {
        verdict: a.verdict, supported: sup, alternatives: alt, unsupported: unsup, nextData: next
      },
      review: {
        replayMethod: "固定环境种子与 optSeed，重跑 optimize() 与 analyze()；浏览器内确定性",
        status: "replayable",
        corrections: a.gaps.slice()
      }
    });
  }

  function renderEvidence(rec, a) {
    var json = {
      protocol: rec.protocol, id: rec.id, checksum: rec.checksum,
      hall: rec.hall, instrument: rec.instrument, created: rec.created,
      tags: rec.tags,
      trace: S.trace.map(function (p) {
        return { budget: p.budget, P: +p.P.toFixed(3), T: +p.T.toFixed(4), Tseeds: p.Tseeds.map(function (v) { return +v.toFixed(4); }), theta: p.theta };
      }),
      analysis: {
        verdict: a.verdict, structural: a.structural,
        peak: a.peak, cusum: a.cusum, decline: a.decline, anomalies: a.anomalies, gaps: a.gaps
      }
    };
    $("evidenceJson").textContent = JSON.stringify(json, null, 2);
  }

  function exportArchive() {
    if (!S.record) return;
    var md = E.exportMarkdown(S.record);
    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = S.record.id + ".md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  /* ---------------- 自检 ---------------- */
  function renderSelfTest() {
    var st = M.selfTest({ reps: 80 });
    var tb = $("selfTestBody");
    tb.innerHTML = "";
    st.rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var w = Math.round(r.falsePositiveRate * 100);
      tr.innerHTML = "<td class='m'>" + r.minEffect.toFixed(2) + "</td>" +
        "<td class='m' style='color:" + (r.falsePositiveRate > 0.05 ? "#f0554d" : "#3fd08a") + "'>" +
        (r.falsePositiveRate * 100).toFixed(0) + "%</td>" +
        "<td class='m'>" + (r.power * 100).toFixed(0) + "%</td>" +
        "<td class='bar-cell'><div class='bar'><i style='width:" + w + "%;background:" +
        (r.falsePositiveRate > 0.05 ? "#f0554d" : "#3fd08a") + "'></i></div></td>";
      tb.appendChild(tr);
    });
    $("stRec").textContent = "推荐 minEffect = " + st.recommend;
    $("selfTestNote").textContent = st.note;
  }

  /* ---------------- 事件绑定 ---------------- */
  $("btnRunDevice").addEventListener("click", function () { runDevice(false); });
  $("btnAutopsy").addEventListener("click", runAutopsy);
  $("btnExport").addEventListener("click", exportArchive);
  $("btnConfirm").addEventListener("click", revealConfirm);
  $("btnCopyJson").addEventListener("click", function () {
    var t = $("evidenceJson").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(t);
  });
  window.addEventListener("resize", function () {
    if (S.layer === "instrument" && S.trace) renderChart();
  });

  /* ---------------- 启动 ---------------- */
  readKnobs();
  buildRooms();
  renderSelfTest();
  setLayer("story");
  runDevice(true);          /* 预跑一次，让装置层一进去就有画面 */
})();

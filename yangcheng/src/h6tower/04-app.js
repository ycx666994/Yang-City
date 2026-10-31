/* ==========================================================================
   H6 精英挑战 · 预算塔 · 十层
   --------------------------------------------------------------------------
   玩法内核与另外四馆都不同：这是**构筑式竖向解谜**。
     · 一座十层的塔，每层一个指标门槛（pass / vote / nEff）。
     · 每层只有一次行动机会：加倍采样、加 8 次采样、升温、降温、检修。
     · 行动先执行，再验门槛。过不了扣一条信誉，但仍然往上走 —— 所以
       「这一层其实已经达标了」时，正确做法是把机会用在检修上。
     · 十次行动刚好走完十层，没有富余。任何一次浪费都会在后面变成失分。
   数值全部来自 yc-dome.js 实算，门槛是按实测网格定的，有唯一可行路径也容许替代路径。
   ========================================================================== */
(function () {
  "use strict";

  var Dm = window.YCDome, D = window.YCDeep;
  if (!Dm) { return; }
  function $(id) { return document.getElementById(id); }

  var WORLD = null;
  function world() { if (!WORLD) WORLD = Dm.world({}); return WORLD; }

  var KMAP = {};
  function run(k, tau) {
    var key = k + "|" + tau;
    if (!KMAP[key]) KMAP[key] = Dm.run({ world: world(), k: k, tau: tau });
    return KMAP[key];
  }

  /* ---------------- 十层门槛 ---------------- */
  var FLOORS = [
    { no: 1, nm: "起步", key: "pass", op: ">=", val: 0.28,
      t: "命中率 ≥ 28%", d: "起手只有一次采样，命中率 21.7%。这一层只需要把预算翻一次。" },
    { no: 2, nm: "加码", key: "pass", op: ">=", val: 0.35,
      t: "命中率 ≥ 35%", d: "再加一次。注意 35% 已经是「翻倍」的边际收益开始变小的地方。" },
    { no: 3, nm: "保真", key: "vote", op: ">=", val: 0.25,
      t: "多数表决 ≥ 25%", d: "这一层看的是 vote，不是 pass。温度一旦拉高，这一层会先塌。" },
    { no: 4, nm: "抬升", key: "pass", op: ">=", val: 0.43,
      t: "命中率 ≥ 43%", d: "回到 pass。此时 pass 与 vote 的差距已经拉到 16 个点以上。" },
    { no: 5, nm: "表决", key: "vote", op: ">=", val: 0.28,
      t: "多数表决 ≥ 28%", d: "又一次看 vote。到这里应该能看出：加采样同时抬两个，升温只抬一个。" },
    { no: 6, nm: "复盘", key: "pass", op: ">=", val: 0.50,
      t: "命中率 ≥ 50%", d: "这一层在你当前的状态下很可能已经达标。想清楚再动手。" },
    { no: 7, nm: "探索", key: "nEff", op: ">=", val: 7.5,
      t: "有效预算 ≥ 7.5", d: "名义预算不等于有效预算。这一层量的是「你实际探索了几个方向」。" },
    { no: 8, nm: "升温", key: "pass", op: ">=", val: 0.58,
      t: "命中率 ≥ 58%", d: "采样已经翻不动了。这时候温度是唯一还能动的东西 —— 但代价会记在下一层。" },
    { no: 9, nm: "定音", key: "vote", op: ">=", val: 0.32,
      t: "多数表决 ≥ 32%", d: "刚升过温，vote 一定掉了。这一层要把票数拉回来。" },
    { no: 10, nm: "登顶", key: "pass", op: ">=", val: 0.65,
      t: "命中率 ≥ 65%", d: "天花板是 66.7%。这一层要求你几乎打满可达上限。" }
  ];

  /* ---------------- 行动 ---------------- */
  var ACTS = [
    { id: "dbl", nm: "采样 ×2", ic: "⏫",
      fn: function (s) { s.k = Math.min(256, s.k * 2); return "k " + s.k; } },
    { id: "add8", nm: "采样 +8", ic: "➕",
      fn: function (s) { s.k = Math.min(256, s.k + 8); return "k " + s.k; } },
    { id: "tup", nm: "温度 +0.3", ic: "🌡",
      fn: function (s) { s.tau = Math.min(2.6, Math.round((s.tau + 0.3) * 10) / 10); return "τ " + s.tau.toFixed(1); } },
    { id: "tdn", nm: "温度 −0.3", ic: "❄",
      fn: function (s) { s.tau = Math.max(0.7, Math.round((s.tau - 0.3) * 10) / 10); return "τ " + s.tau.toFixed(1); } },
    { id: "fix", nm: "检修 · 信誉 +1", ic: "🛠",
      fn: function (s) { s.rep = Math.min(3, s.rep + 1); return "信誉 " + s.rep; }, fix: true }
  ];

  var st = { k: 1, tau: 1.0, rep: 3, floor: 0, log: [], over: false, wins: 0, fails: 0 };

  /* ---------------- 工具 ---------------- */
  function pct(v, d) { return v == null ? "—" : (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function valOf(r, key) {
    if (key === "pass") return r.pass;
    if (key === "vote") return r.vote;
    if (key === "nEff") return r.nEff;
    if (key === "deficit") return r.deficit;
    if (key === "headroom") return r.headroom;
    if (key === "nearOnly") return r.nearOnly;
    if (key === "cold") return r.cold;
    return 0;
  }
  function fmt(key, v) { return key === "nEff" ? v.toFixed(1) : pct(v); }
  function check(r, f) {
    var v = valOf(r, f.key);
    return f.op === ">=" ? v >= f.val : v <= f.val;
  }
  function cur() { return run(st.k, st.tau); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------------- 绘制：塔 ---------------- */
  function paintTower() {
    var H = "";
    for (var i = 9; i >= 0; i--) {
      var f = FLOORS[i];
      var cls = "twlv";
      var mark = "—";
      if (i < st.floor) {
        var rec = st.log[i];
        if (rec && rec.ok) { cls += " past"; mark = "过"; }
        else { cls += " fail"; mark = "失"; }
      } else if (i === st.floor && !st.over) {
        cls += " now"; mark = "在";
      } else {
        cls += " lock";
      }
      H += '<div class="' + cls + '"><span class="no">' + f.no + '</span>' +
        '<span class="nm">' + f.nm + " · " + esc(f.t) + "</span>" +
        '<span class="st">' + mark + "</span></div>";
    }
    $("tower").innerHTML = H;
  }

  /* ---------------- 绘制：信誉 ---------------- */
  function paintRep() {
    var H = "";
    for (var i = 0; i < 3; i++) H += '<i class="' + (i < st.rep ? "on" : "off") + '"></i>';
    $("rep").innerHTML = H;
    $("fno").textContent = Math.min(10, st.floor + 1);
  }

  /* ---------------- 绘制：门槛 ---------------- */
  function paintGoal() {
    var f = FLOORS[Math.min(st.floor, 9)];
    var r = cur();
    var okNow = check(r, f);
    $("goal").innerHTML =
      '<div class="gk">FLOOR ' + f.no + " / 10 · " + f.nm + "</div>" +
      '<div class="gt">' + esc(f.t) + (okNow ? '　<span style="color:#a3e34a;font-size:13px">当前已达标</span>' : "") + "</div>" +
      '<div class="gd">' + esc(f.d) + "</div>";
  }

  /* ---------------- 绘制：HUD ---------------- */
  function paintHud() {
    var r = cur(), f = FLOORS[Math.min(st.floor, 9)];
    var v = valOf(r, f.key);
    var gap = f.op === ">=" ? (f.val - v) : (v - f.val);
    var H = [];
    H.push(cell("命中 pass@k", pct(r.pass), "oracle 判官", "hi"));
    H.push(cell("表决 vote@k", pct(r.vote), "没有裁判时看到的就是这个", ""));
    H.push(cell("有效预算 nEff", r.nEff.toFixed(1), "泄漏率 " + r.leak.toFixed(2), ""));
    H.push(cell("本层还差", gap <= 0 ? "已达标" : (f.key === "nEff" ? gap.toFixed(1) : pct(gap)),
      f.key + " " + f.op + " " + (f.key === "nEff" ? f.val.toFixed(1) : pct(f.val)), gap <= 0 ? "hi" : "warn"));
    H.push(cell("天花板", pct(r.ceiling), "可达 " + pct(r.ceiling) + " · 不可达 " + pct(r.unreachable), ""));
    $("hud").innerHTML = H.join("");
  }
  function cell(l, v, n, cls) {
    return '<div class="c ' + (cls || "") + '"><div class="l">' + esc(l) + '</div>' +
      '<div class="v">' + esc(v) + '</div><div class="n">' + esc(n) + "</div></div>";
  }

  /* ---------------- 绘制：行动（带试算） ---------------- */
  function paintActs() {
    var base = cur();
    var H = "";
    ACTS.forEach(function (a) {
      var s2 = { k: st.k, tau: st.tau, rep: st.rep };
      var tag = a.fn(s2);
      var changed = s2.k !== st.k || s2.tau !== st.tau;
      var r2 = changed ? run(s2.k, s2.tau) : base;
      var ap;
      if (!changed) {
        ap = "指标不变 · " + tag;
      } else {
        ap = "k " + st.k + "→" + s2.k + "　τ " + st.tau.toFixed(1) + "→" + s2.tau.toFixed(1) +
          "<br>pass " + pct(base.pass) + "→<b class=\"" + (r2.pass >= base.pass ? "up" : "dn") + "\">" + pct(r2.pass) + "</b>" +
          "　vote " + pct(base.vote) + "→<b class=\"" + (r2.vote >= base.vote ? "up" : "dn") + "\">" + pct(r2.vote) + "</b>" +
          "<br>nEff " + base.nEff.toFixed(1) + "→" + r2.nEff.toFixed(1);
      }
      H += '<button class="twact' + (a.fix ? " fix" : "") + '" data-a="' + a.id + '"' +
        (st.over ? " disabled" : "") + ">" +
        '<span class="ah"><span class="ic">' + a.ic + '</span><span class="nm">' + a.nm + "</span>" +
        '<span class="df">' + esc(tag) + "</span></span>" +
        '<span class="ap">' + ap + "</span></button>";
    });
    $("acts").innerHTML = H;
  }

  /* ---------------- 绘制：记录 ---------------- */
  function paintLog() {
    if (!st.log.length) { $("log").innerHTML = '<div class="none">还没有记录。</div>'; return; }
    var H = "";
    st.log.slice().reverse().forEach(function (e) {
      H += '<div class="r"><span class="n">' + e.no + "</span>" +
        '<span class="d">' + e.d + "</span>" +
        '<span class="v ' + (e.ok ? "ok" : "no") + '">' + e.v + "</span></div>";
    });
    $("log").innerHTML = H;
  }

  function paintAll() { paintTower(); paintRep(); paintGoal(); paintHud(); paintActs(); paintLog(); }

  /* ---------------- 行动 ---------------- */
  function doAct(id) {
    if (st.over) return;
    var a = null;
    for (var i = 0; i < ACTS.length; i++) if (ACTS[i].id === id) a = ACTS[i];
    if (!a) return;

    var f = FLOORS[st.floor];
    var before = cur();
    var tag = a.fn(st);
    var after = cur();
    var ok = check(after, f);

    st.log.push({
      no: ("0" + (st.log.length + 1)).slice(-2),
      d: "第 " + f.no + " 层 · <b>" + a.nm + "</b> → " + tag,
      v: ok ? "过" : "失",
      ok: ok
    });

    if (ok) { st.wins++; }
    else {
      st.fails++;
      st.rep = Math.max(0, st.rep - 1);
    }

    st.floor++;

    if (st.rep <= 0) { settle("collapse"); return; }
    if (st.floor >= 10) { settle("top"); return; }
    paintAll();
  }

  /* ---------------- 结算 ---------------- */
  function score() {
    var s1 = st.wins * 6;
    var s2 = st.rep * 6;
    var s3 = (st.floor >= 10 && st.rep > 0) ? 22 : 0;
    return { s1: s1, s2: s2, s3: s3, total: s1 + s2 + s3 };
  }

  function settle(reason) {
    st.over = true;
    var sc = score();
    var elite = sc.total >= 80;
    var r = cur();

    var H = ['<div class="twend">'];
    H.push('<div class="eh"><h2>' + (reason === "top" ? (elite ? "登顶" : "登顶，但成绩不足") : "塔崩") + "</h2>" +
      '<span class="sc">' + sc.total + "<small> / 100</small></span></div>");
    H.push('<div class="es">' + (reason === "top"
      ? (elite
        ? "十层走完，信誉还剩 " + st.rep + " 条。你把「加采样」和「调温度」用在了该用的地方——没有一次是把预算浪费在已经饱和的地方。"
        : "十层走完了，但中间浪费了太多次机会。这一馆的门槛不是「能不能爬上去」，是「有没有一次是白花的」。")
      : "信誉耗尽。三次失败里至少有一次是因为把机会用在了已经达标的层上，或者把温度当成了免费的开关。") + "</div>");

    H.push('<div class="parts">');
    H.push(part("通过层数", st.wins, 10, st.wins + " × 6 分"));
    H.push(part("剩余信誉", st.rep, 3, st.rep + " × 6 分"));
    H.push(part("登顶", sc.s3 ? "22" : "0", 22, reason === "top" ? "走完十层" : "塔崩，未登顶"));
    H.push("</div>");

    H.push('<div class="es" style="font-family:var(--tw-mono);font-size:11.5px;color:var(--tw-tx3)">' +
      "最终状态 k=" + st.k + "　τ=" + st.tau.toFixed(1) +
      "　pass " + pct(r.pass) + "　vote " + pct(r.vote) + "　nEff " + r.nEff.toFixed(1) +
      "　判定 " + r.verdict + "/" + r.subtype + "</div>");

    if (elite && D) {
      var cert = D.getCert("H6", "elite");
      if (!cert) {
        cert = D.issueCert("H6", "elite", {
          play: "预算塔 · 十层",
          score: sc.total,
          detail: [
            "通过 " + st.wins + " / 10 层 · 剩余信誉 " + st.rep + " / 3",
            "最终预算 k=" + st.k + " · 温度 τ=" + st.tau.toFixed(1),
            "pass@k " + pct(r.pass) + " · vote@k " + pct(r.vote) + " · nEff " + r.nEff.toFixed(1),
            "判定 " + r.verdict + "/" + r.subtype + " · 天花板 " + pct(r.ceiling)
          ]
        });
      }
      H.push('<div class="certbox"><div class="ct">精英证书已签发</div>' +
        '<div class="cd">这一馆的二级证书不发给「把预算加满的人」，只发给能分清' +
        '<b>加采样同时抬 pass 与 vote</b>、<b>升温度只抬 pass</b>、<b>贴到天花板之后再加就是白花</b>的人。</div>' +
        '<div class="cn">' + esc(cert.no) + " · 校验 " + esc(cert.checksum) + "</div></div>");
    } else {
      H.push('<div class="certbox" style="border-color:rgba(255,107,138,.34);background:rgba(255,107,138,.05)">' +
        '<div class="ct" style="color:#ff8faf">未达精英线</div>' +
        '<div class="cd">精英线 80 分，等于最多只能失一层。重来一次时记住三件事：' +
        '<b>第 6 层在你当时的状态下已经达标</b>；<b>升温会立刻让下一层的 vote 变难</b>；' +
        '<b>pass 的尽头是 66.7%，不是 100%</b>。</div></div>');
    }

    H.push('<div class="btnrow"><button id="btnAgain">重开塔</button>' +
      '<button class="ghost" id="btnBack">回预算馆</button></div></div>');
    $("endBox").innerHTML = H.join("");
    $("btnAgain").addEventListener("click", restart);
    $("btnBack").addEventListener("click", function () { location.href = "h6-budget.html"; });
    paintAll();
    $("endBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function part(l, v, max, note) {
    return '<div class="p"><div class="pl">' + esc(l) + "</div>" +
      '<div class="pv">' + v + ' <span style="font-size:11px;color:var(--tw-tx3)">/ ' + max + "</span></div>" +
      '<div class="pn">' + esc(note) + "</div></div>";
  }

  function restart() {
    st = { k: 1, tau: 1.0, rep: 3, floor: 0, log: [], over: false, wins: 0, fails: 0 };
    $("endBox").innerHTML = "";
    paintAll();
  }

  /* ---------------- 绑定 ---------------- */
  function boot() {
    $("acts").addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]");
      if (b && !b.disabled) doAct(b.dataset.a);
    });
    paintAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ---------------- 体检钩子（只读） ---------------- */
  window.YCTower = {
    status: function () {
      return {
        k: st.k, tau: st.tau, rep: st.rep, floor: st.floor,
        wins: st.wins, fails: st.fails, over: st.over,
        levels: document.querySelectorAll(".twlv").length,
        acts: document.querySelectorAll(".twact").length,
        goal: FLOORS[Math.min(st.floor, 9)].key + " " + FLOORS[Math.min(st.floor, 9)].op + " " + FLOORS[Math.min(st.floor, 9)].val
      };
    },
    act: function (id) { doAct(id); },
    score: function () { return score(); },
    /* 探针用：按最优路径走完 */
    solve: function () {
      var plan = ["dbl", "dbl", "dbl", "dbl", "dbl", "fix", "dbl", "tup", "dbl", "tup"];
      for (var i = 0; i < plan.length && !st.over; i++) doAct(plan[i]);
      return this.status();
    }
  };
})();

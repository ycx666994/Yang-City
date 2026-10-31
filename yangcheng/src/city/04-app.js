/* 杨城首页：时钟 / 读数 / 引导 / 键盘 */
(function () {
  "use strict";
  var E = window.YCEvidence;
  var V = window.YCCityView;
  var $ = function (id) { return document.getElementById(id); };

  var SEEN_KEY = "yc.mapHintSeen.v1";

  /* 时段说明：让「不同时间进来看到不同杨城」有可读的落点 */
  var NOTES = {
    "深夜": "只有航标灯和档案柜还醒着。城市在等下一批审计员。",
    "凌晨": "天空刚开始褪色，塔群还没亮灯，巡逻轨道空着。",
    "破晓": "东侧塔群的玻璃先亮起来，河面还留着夜里的深色。",
    "日出": "光从东边压过来，玻璃穹顶最先把整片天收进去。",
    "清晨": "空气最干净的时候，远处的塔能数清层数。",
    "上午": "全城都在工作，窗户几乎不亮灯。",
    "正午": "太阳最高，影子最短，河面反光刺眼。",
    "午后": "光开始偏暖，玻璃幕墙把西边的天映成一片。",
    "黄昏": "所有玻璃同时变成橙色，这是杨城最像一座城的时候。",
    "暮色": "灯一盏一盏亮起来，比天黑的速度快一点。",
    "入夜": "塔身暗下去，窗户成为唯一的光源。"
  };

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- 时钟：每秒与北京时间对齐 ---------- */
  function tick() {
    if (!V) return;
    var d = V.beijingNow();
    $("clkTime").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());

    var t = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    var p = V.dayPhase(t);
    $("clkPhase").textContent = p.name + " · 北京时间";

    var note = $("phaseNote");
    if (note.getAttribute("data-n") !== p.name) {
      note.setAttribute("data-n", p.name);
      note.innerHTML = "<b>" + p.name + "</b>　" + (NOTES[p.name] || "") +
        "<br><span style='color:rgba(180,208,232,.55)'>光线由当前北京时间驱动，一分钟一变。</span>";
    }
    $("footPhase").textContent = p.name + " · 环境光 " + p.amb.toFixed(2) + " · 亮灯率 " + Math.round(p.lamp * 100) + "%";
  }

  /* ---------- 城市读数 ---------- */
  function renderStats() {
    if (!E) return;
    var all = E.list();
    var avail = E.HALLS.filter(function (h) { return !!h.href; }).length;
    $("cAvail").innerHTML = avail + "<small>/6</small>";
    $("cRec").textContent = all.length;
    $("cReplay").textContent = all.filter(function (r) {
      var s = (r.review || {}).status;
      return s === "replayable" || s === "independent";
    }).length;
    $("cReview").textContent = all.filter(function (r) {
      return (r.review || {}).status === "independent";
    }).length;
  }

  /* ---------- 地图引导 ---------- */
  function initHint() {
    var hint = $("mapHint");
    var btn = $("btnMap");
    var seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch (e) {}

    if (seen) hint.classList.add("gone");

    function dismiss() {
      hint.classList.add("gone");
      try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    }
    btn.addEventListener("click", dismiss);
    // 首次访问 9 秒后自动弱化；不记忆，下次进来仍会提示
    if (!seen) setTimeout(function () { hint.classList.add("gone"); }, 9000);
  }

  /* ---------- 键盘 ---------- */
  function initKeys() {
    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === "m") location.href = "map.html";
      else if (k === "e") location.href = "evidence.html";
    });
  }

  /* ---------- 今日值守：按北京时间轮班，人和馆是同一个人的两处露面 ---------- */
  var HALLPAGE = {
    H2: "h2-forensic.html", H3: "h3-metrics.html", H4: "h4-contam.html",
    H5: "h5-collapse.html", H6: "h6-budget.html"
  };
  var HALLNAME = { H2: "推理法医馆", H3: "指标失效博物馆", H4: "数据污染博物馆", H5: "递归坍塌博物馆", H6: "潜能与预算博物馆" };

  function renderDuty() {
    var C = window.YCCast;
    var box = $("dutyList"), foot = $("dutyFoot");
    if (!C || !box) return;
    var r = C.roster();
    box.innerHTML = r.people.map(function (p) {
      var hot = p.bond >= 50 ? " hot" : "";
      return '<a class="duty-p" href="' + (HALLPAGE[p.hall] || "map.html") + '" title="去' +
        (HALLNAME[p.hall] || p.hall) + '找他">' +
        C.miniBadge(p, 30) +
        '<span class="dn"><b>' + p.name + '</b><i>' + p.role + ' · ' + (HALLNAME[p.hall] || p.hall) + '</i></span>' +
        '<span class="db' + hot + '">' + (p.bond > 0 ? p.bond : "—") + '</span>' +
        "</a>";
    }).join("");

    /* 你和他处到哪一步了 —— 这一行是「城市记得你」的唯一证据 */
    var best = null;
    r.people.forEach(function (p) { if (!best || p.bond > best.bond) best = p; });
    var hh = Math.floor(r.until / 60), mm = r.until % 60;
    foot.innerHTML =
      "现在是 <b>" + r.shift + "</b> · 交班还有 <b>" + (hh > 0 ? hh + " 时 " : "") + mm + " 分</b><br>" +
      (best && best.bond > 0
        ? '你和 <span class="mine">' + best.name + "</span> 已经 " + best.tier + " · " + best.bond + "/100"
        : "还没有人认识你。进任意一馆，会有人来搭话。");
  }

  function boot() {
    if (V) V.start($("cityCv"));
    tick();
    setInterval(tick, 1000);
    renderStats();
    renderDuty();
    setInterval(renderDuty, 30000);
    initHint();
    initKeys();
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf("yc.evidence") === 0) renderStats();
      if (e.key && e.key.indexOf("yc.cast") === 0) renderDuty();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

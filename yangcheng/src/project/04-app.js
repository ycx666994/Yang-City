/* 城市公告 · 项目详情页
   ------------------------------------------------------------
   全部内容来自 shared/yc-bulletin.js，本文件只负责“把一条公告摊开”。
   任何文案都不在这里写死——新增项目只改数据文件。
   ------------------------------------------------------------ */
(function () {
  "use strict";

  var B = window.YC_BULLETIN;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  if (!B) {
    $("pjWrap").innerHTML = '<div class="pj-none"><h1>公告数据未加载</h1>' +
      '<p>缺少 shared/yc-bulletin.js。</p></div>';
    return;
  }

  var params = new URLSearchParams(location.search);
  var wanted = params.get("id");
  var item = (wanted && B.byId(wanted)) || B.live()[0] || B.items[0];

  if (!item) {
    $("pjWrap").innerHTML = '<div class="pj-none"><h1>暂时没有公告</h1>' +
      '<p>公告栏还没有刊登任何项目。<a href="index.html">返回城市介绍</a>。</p></div>';
    return;
  }

  var v = B.vendorOf(item);
  var live = item.status === "live";

  /* 品牌色注入：整页只用这一处色相，其余全是纸与墨 */
  document.documentElement.style.setProperty("--pj-tone", v.tone);

  document.title = item.title + " · " + v.name + " · 杨城公告";

  /* ---------- 面包屑 ---------- */
  $("pjCrumb").innerHTML =
    '<a href="map.html?panel=bulletin">城市公告</a><span>/</span>' +
    '<time datetime="' + esc(item.date) + '">' + esc(B.fmtDate(item.date)) + "</time><span>/</span>" +
    "<em>" + esc(v.name) + "</em>";

  /* ---------- 主视觉 ---------- */
  var who = v.name + (v.joint.length ? " × " + v.joint.join(" × ") : "");
  $("pjKind").innerHTML = "<b>" + esc(item.kind) + "</b><i></i><span>" + esc(who) + "</span>";
  $("pjTitle").textContent = item.title;
  $("pjSub").textContent = item.titleEn || "";
  $("pjLead").innerHTML = esc(item.lead || item.summary || "");

  var playHref = live && item.play ? item.play : "";
  $("pjAct").innerHTML =
    (playHref
      ? '<a class="pj-btn primary" href="' + esc(playHref) + '">立即体验' +
        '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg></a>'
      : '<span class="pj-btn primary" aria-disabled="true">立即体验</span>') +
    '<a class="pj-btn ghost" href="#detail" id="pjKnow">了解该项目</a>' +
    '<div class="pj-act-note"><i class="pj-dot' + (playHref ? "" : " off") + '"></i>' +
    (playHref
      ? "在线体验 · 无需登录，学习记录只存在你自己的浏览器里"
      : "已归档 · 项目已关闭，仅保留档案与结论") +
    "</div>";

  /* ---------- 档案栏 ---------- */
  var dl = [
    ["出品", between(v.name, v.field)],
    ["日期", esc(B.fmtDate(item.date))],
    ["类别", esc(item.kind)],
    ["状态", '<span class="pj-st ' + (live ? "live" : "arch") + '">' +
      (live ? "开放中" : "已归档") + "</span>"]
  ];
  if (v.joint.length) dl.splice(1, 0, ["联合", esc(v.joint.join("、"))]);
  if (item.play) dl.push(["入口", '<a href="' + esc(item.play) + '">打开 ' + esc(item.play) + "</a>"]);
  $("pjDl").innerHTML = dl.map(function (r) {
    return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>";
  }).join("");

  function between(name, field) {
    return esc(name) + (field ? '<br><span style="font-weight:400;color:var(--pj-muted);' +
      'font-size:11.5px">' + esc(field) + "</span>" : "");
  }

  /* ---------- 指标 ---------- */
  if (item.metric && item.metric.length) {
    $("pjMetrics").innerHTML = item.metric.map(function (m) {
      return "<div><b>" + esc(m[1]) + "</b><span>" + esc(m[0]) + "</span></div>";
    }).join("");
  } else {
    $("pjMetrics").style.display = "none";
  }

  /* ---------- 正文 ---------- */
  var secs = item.sections || [];
  $("detail").innerHTML = secs.map(function (s, i) {
    return '<section class="pj-sec" data-n="' + (i < 9 ? "0" : "") + (i + 1) + '">' +
      "<h3>" + esc(s.h) + "</h3><p>" + esc(s.p) + "</p></section>";
  }).join("");

  /* ---------- 标签 ---------- */
  if (item.tags && item.tags.length) {
    $("pjTags").innerHTML = item.tags.map(function (t) {
      return "<span>" + esc(t) + "</span>";
    }).join("");
  }

  /* ---------- 上下条：按公告时间序，不按数组序 ---------- */
  var i = B.items.indexOf(item);
  var newer = B.items[i - 1], older = B.items[i + 1];
  var nav = [];
  if (newer) {
    nav.push('<a href="project.html?id=' + encodeURIComponent(newer.id) + '">' +
      '<span class="k">上一条 · 更新</span><b>' + esc(newer.title) + "</b>" +
      "<small>" + esc(B.fmtDate(newer.date)) + " · " + esc(B.vendorOf(newer).name) + "</small></a>");
  } else {
    nav.push('<a href="map.html?panel=bulletin"><span class="k">公告栏</span>' +
      "<b>查看全部公告</b><small>最新的一条就是当前这条</small></a>");
  }
  if (older) {
    nav.push('<a class="nx" href="project.html?id=' + encodeURIComponent(older.id) + '">' +
      '<span class="k">下一条 · 更早</span><b>' + esc(older.title) + "</b>" +
      "<small>" + esc(B.fmtDate(older.date)) + " · " + esc(B.vendorOf(older).name) + "</small></a>");
  } else {
    nav.push('<a class="nx" href="index.html"><span class="k">返回</span>' +
      "<b>杨城 · 城市介绍</b><small>这是公告栏里最早的一条</small></a>");
  }
  $("pjMore").innerHTML = nav.join("");

  /* ---------- 「了解该项目」：滚到正文并给个浅浅的到达提示 ---------- */
  var know = $("pjKnow");
  if (know) {
    know.addEventListener("click", function (e) {
      e.preventDefault();
      var d = $("detail");
      var top = d.getBoundingClientRect().top + window.pageYOffset - 84;
      window.scrollTo({ top: top, behavior: "smooth" });
      d.style.transition = "background .6s";
      d.style.background = "rgba(176,129,63,.06)";
      setTimeout(function () { d.style.background = "transparent"; }, 700);
    });
  }

  /* ---------- 快捷键：G 立即体验 / J 下一条 ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA") return;
    if (e.key === "g" || e.key === "G") {
      if (playHref) location.href = playHref;
    }
  });
})();

/* 杨城首页 · 动态部分
   ------------------------------------------------------------
   这一页只渲染两处数据：17 区清单、最近三条公告。
   两处都读现有数据源，不在这里抄一份：
     · 17 区  ← shared/yc-districts.js（和三维、二维图同一份）
     · 公告    ← shared/yc-bulletin.js（和三维公告栏、详情页同一份）
   所以以后改区名或发新公告，首页自动跟着变。
   ------------------------------------------------------------ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------- 17 区 ---------- */
  var Z = window.YC_DISTRICTS || [];
  var box = $("hmZones");
  if (box && Z.length) {
    /* 按地块编号排：D01…D17。数据里的顺序是按地理分组给的，
       首页是索引，不是地图，按编号排更好找。 */
    var list = Z.slice().sort(function (a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    box.innerHTML = list.map(function (d) {
      return '<a class="hm-zone" href="district.html?zone=' + encodeURIComponent(d.id) + '">' +
        "<b>" + esc(d.id) + "</b>" +
        "<span>" + esc(d.name) + "<em>" + esc(d.en || "") + "</em></span></a>";
    }).join("");
  }

  /* ---------- 公告 ---------- */
  var B = window.YC_BULLETIN;
  var nb = $("hmNotices2");
  if (B && nb) {
    var cnt = $("hmNoticeCount");
    if (cnt) cnt.textContent = B.items.length;

    nb.innerHTML = B.items.slice(0, 3).map(function (it) {
      var v = B.vendorOf(it);
      return '<a class="hm-notice" href="project.html?id=' + encodeURIComponent(it.id) + '">' +
        '<span class="d">' + esc(B.fmtDate(it.date)) + "<b>" + esc(v.name) +
          (v.joint.length ? " × " + esc(v.joint.join("、")) : "") + "</b></span>" +
        '<span class="m">' +
          "<h3>" + esc(it.title) +
            (it.titleEn ? "<em>" + esc(it.titleEn) + "</em>" : "") + "</h3>" +
          "<p>" + esc(it.lead) + "</p>" +
        "</span>" +
        '<span class="s">' + esc(it.kind) +
          (it.status === "live" ? "<i>可立即体验</i>" : "<i class='off'>已归档</i>") + "</span>" +
        '<span class="ar">→</span></a>';
    }).join("");
  }

  /* ---------- 图版：加载失败时留一块同色底板，不出现破图图标 ---------- */
  var img = document.querySelector(".hm-plate img");
  if (img) {
    img.addEventListener("error", function () {
      img.style.display = "none";
      var f = img.parentNode;
      f.style.minHeight = "260px";
      f.style.background = "linear-gradient(135deg,#dfe4d3,#eef0e6 55%,#d8dfcc)";
    });
  }
})();

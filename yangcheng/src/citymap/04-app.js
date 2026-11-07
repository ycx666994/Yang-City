/* 杨城 17 区平面总图：SVG 全息风格，零依赖。
   区划/河流/轨道坐标与 shared/yc3d/yc3d-city.js 保持一致（虚构局部坐标）。 */
(function () {
  "use strict";
  var DISTRICTS = window.YC_DISTRICTS || [];
  if (!DISTRICTS.length) return;
  var SVG = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var map = $("cmMap");

  var MUSEUMS = {
    H1: { name: "能力与边界博物馆", short: "老馆", href: "h1-museum.html", color: "#ffb347", x: -1510, z: 105 },
    H2: { name: "推理法医馆", short: "法医", href: "h2-museum.html", color: "#37e6ff", x: -1260, z: -720 },
    H3: { name: "指标失效博物馆", short: "指标", href: "h3-museum.html", color: "#ff4fa3", x: 0, z: 150 },
    H4: { name: "数据污染博物馆", short: "污染", href: "h4-museum.html", color: "#63d61a", x: 1510, z: -660 },
    H5: { name: "递归坍塌博物馆", short: "坍塌", href: "h5-museum.html", color: "#8b5cff", x: -1050, z: 1190 },
    H6: { name: "潜能与预算博物馆", short: "预算", href: "h6-museum.html", color: "#ff9a2e", x: 1180, z: 1180 }
  };
  var LANDMARKS = {
    spire: { x: -20, z: -200, label: "杨城主塔" },
    plaza: { x: 620, z: -30, label: "中央广场" },
    "station-west": { x: -1580, z: -330, label: "西园站" },
    "station-center": { x: 360, z: 400, label: "杨城中央站" },
    "station-east": { x: 1390, z: 930, label: "东湾站" },
    hospital: { x: 2210, z: 1460, label: "杨城综合医院" },
    university: { x: -1800, z: 1530, label: "创新大学" },
    waterworks: { x: 2350, z: 1280, label: "澄湾水务中心" },
    freight: { x: 2450, z: -1540, label: "东部综合物流港" }
  };
  var RIVER = [[-2700, -1390], [-2240, -1080], [-1740, -650], [-1220, -300], [-650, 60], [-80, 250],
    [500, 210], [1080, 540], [1640, 850], [2170, 640], [2700, 910]];
  var RAIL = [[-2700, -1430], [-2250, -1030], [-1960, -650], [-1580, -330], [-1120, -240], [-650, 80],
    [-80, 240], [360, 400], [860, 530], [1260, 680], [1390, 930], [1740, 1060], [2100, 760], [2700, 930]];
  var VIBE_LABEL = { core: "核心商务", heritage: "文化老城", compute: "算力园区", research: "科研园区",
    justice: "司法文化", transit: "交通枢纽", campus: "大学城", recursive: "科学园区", green: "生态居住",
    mixed: "市井混合", living: "滨水居住", eco: "生态城", port: "制造港口", lab: "实验区",
    design: "设计社区", cbd: "商务区", energy: "能源新区" };

  /* 世界坐标 → SVG 视图（viewBox 1600×1100，城市 5400×3600） */
  function PX(x) { return (x + 2700) / 5400 * 1520 + 40; }
  function PY(z) { return (z + 1800) / 3600 * 980 + 60; }
  function pt(p) { return PX(p[0]).toFixed(1) + "," + PY(p[1]).toFixed(1); }

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    (parent || map).appendChild(node);
    return node;
  }
  /* Catmull-Rom → 三次贝塞尔 */
  function openPath(points) {
    var d = "M" + pt(points[0]);
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + PX(c1x).toFixed(1) + "," + PY(c1y).toFixed(1) + " " + PX(c2x).toFixed(1) + "," + PY(c2y).toFixed(1) + " " + pt(p2);
    }
    return d;
  }
  function closedPath(points) {
    var n = points.length, d = "M" + pt(points[0]);
    for (var i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + PX(c1x).toFixed(1) + "," + PY(c1y).toFixed(1) + " " + PX(c2x).toFixed(1) + "," + PY(c2y).toFixed(1) + " " + pt(p2);
    }
    return d + "Z";
  }
  function rng(seedStr) {
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  /* ---------- 底层：路网 ---------- */
  var gGrid = el("g", {});
  for (var gx = 0; gx < 19; gx++) {
    var x = -2610 + gx * 290;
    el("line", { x1: PX(x), y1: PY(-1800), x2: PX(x), y2: PY(1800),
      class: "d-road" + (gx % 4 === 2 ? " major" : "") }, gGrid);
  }
  for (var gz = 0; gz < 15; gz++) {
    var z = -1736 + gz * 248;
    el("line", { x1: PX(-2700), y1: PY(z), x2: PX(2700), y2: PY(z),
      class: "d-road" + (gz % 3 === 1 ? " major" : "") }, gGrid);
  }

  /* ---------- 区域 ---------- */
  var gDistricts = el("g", {});
  var blobs = {};
  DISTRICTS.forEach(function (d, i) {
    var rand = rng(d.id + d.en), pts = [], steps = 14;
    for (var s = 0; s < steps; s++) {
      var ang = s / steps * Math.PI * 2;
      var wob = 0.78 + rand() * 0.26;
      pts.push([d.cx + Math.cos(ang) * d.r * wob * 1.02, d.cz + Math.sin(ang) * d.r * wob * 0.97]);
    }
    var gid = "grad" + d.id;
    var grad = el("radialGradient", { id: gid, cx: "50%", cy: "50%", r: "62%" },
      el("defs", {}));
    el("stop", { offset: "0%", "stop-color": d.color, "stop-opacity": ".46" }, grad);
    el("stop", { offset: "70%", "stop-color": d.color, "stop-opacity": ".16" }, grad);
    el("stop", { offset: "100%", "stop-color": d.color, "stop-opacity": ".05" }, grad);
    var a = el("a", { class: "d-blob", href: "district.html?zone=" + d.id,
      "aria-label": "进入" + d.name + "三维街区" }, gDistricts);
    a.style.setProperty("--i", i);
    a.style.color = d.color;
    el("path", { d: closedPath(pts), fill: "url(#" + gid + ")", class: "fill", "fill-opacity": ".3" }, a);
    el("path", { d: closedPath(pts), fill: "none", stroke: d.color, "stroke-width": "1.6",
      class: "edge", opacity: ".8" }, a);
    var cy = PY(d.cz);
    el("text", { x: PX(d.cx), y: cy - 3, class: "d-name" }, a).textContent = d.name;
    el("text", { x: PX(d.cx), y: cy + 13, class: "d-en", fill: d.accent }, a).textContent = d.en;
    blobs[d.id] = a;
  });

  /* ---------- 河流与轨道 ---------- */
  var river = el("path", { d: openPath(RIVER), class: "d-river",
    stroke: "#3f7fa8", "stroke-width": "52", opacity: ".9" });
  el("path", { d: openPath(RIVER), class: "d-river", stroke: "#6fc4e8",
    "stroke-width": "30", opacity: ".55" });
  el("path", { d: openPath(RIVER), class: "d-river", stroke: "#bfeaff",
    "stroke-width": "3", opacity: ".5" });
  el("path", { d: openPath(RAIL), class: "d-rail" });

  /* ---------- 地标与馆标 ---------- */
  var gMarks = el("g", {});
  for (var id in LANDMARKS) {
    var m = LANDMARKS[id];
    var dot = el("circle", { cx: PX(m.x), cy: PY(m.z), r: id === "spire" ? 6 : 3.4,
      class: "d-mark" }, gMarks);
    var t = document.createElementNS(SVG, "title"); t.textContent = m.label; dot.appendChild(t);
  }
  var gMuseums = el("g", {});
  for (var hid in MUSEUMS) {
    var mu = MUSEUMS[hid];
    var a = el("a", { class: "d-museum", href: mu.href, "aria-label": "参观" + mu.name }, gMuseums);
    a.style.color = mu.color;
    var mx = PX(mu.x), my = PY(mu.z);
    el("circle", { cx: mx, cy: my, r: 5, fill: "none", stroke: mu.color, "stroke-width": "1.6", class: "halo" }, a);
    el("circle", { cx: mx, cy: my, r: 5.5, fill: mu.color, class: "core" }, a);
    el("circle", { cx: mx, cy: my, r: 2.2, fill: "#fff" }, a);
    el("text", { x: mx + 11, y: my + 4 }, a).textContent = hid + " · " + mu.short;
  }

  /* ---------- 推荐徽标（主塔上方） ---------- */
  var bg = el("g", { class: "d-badge" });
  var bx = PX(-20), by = PY(-200) - 46;
  el("rect", { x: bx - 44, y: by - 13, width: 88, height: 22, rx: 3 }, bg);
  el("text", { x: bx, y: by + 3 }, bg).textContent = "推荐参观";
  el("path", { d: "M" + (bx - 7) + "," + (by - 34) + "L" + bx + "," + (by - 20) + "L" + (bx + 7) + "," + (by - 34) + "L" + bx + "," + (by - 26) + "Z",
    fill: "#ffd45e", opacity: ".95" }, bg);

  /* ---------- 选中环 ---------- */
  var gRing = el("g", { style: "display:none" });
  var ring1 = el("circle", { class: "cm-ring", stroke: "#59e6f5", r: 200 }, gRing);
  var ring2 = el("circle", { class: "cm-ring2", stroke: "#8ff3ff", r: 214 }, gRing);

  /* ---------- 面板与高亮 ---------- */
  var selected = null;
  function show(d) {
    selected = d;
    for (var id in blobs) blobs[id].classList.toggle("sel", id === d.id);
    var r = d.r * 0.2815 * 1.12;
    gRing.style.display = "";
    ring1.setAttribute("cx", PX(d.cx)); ring1.setAttribute("cy", PY(d.cz)); ring1.setAttribute("r", r);
    ring2.setAttribute("cx", PX(d.cx)); ring2.setAttribute("cy", PY(d.cz)); ring2.setAttribute("r", r + 13);
    ring1.setAttribute("stroke", d.color); ring2.setAttribute("stroke", d.accent);
    $("cmPanel").style.borderTopColor = d.color;
    $("cmKick").textContent = d.featured ? "推荐参观" : (VIBE_LABEL[d.vibe] || d.vibe);
    $("cmKick").className = "cm-panel-kicker" + (d.featured ? " rec" : "");
    $("cmName").textContent = d.name;
    $("cmEn").textContent = d.id + " · " + d.en;
    $("cmDesc").textContent = d.desc;
    var tags = $("cmTags"); tags.replaceChildren();
    [[VIBE_LABEL[d.vibe] || d.vibe], ["天际线 " + d.minH + "–" + d.maxH + " m"],
      [d.museums.length ? d.museums.length + " 座博物馆" : "无常设馆"]].forEach(function (pair) {
      var tag = document.createElement("i");
      var b = document.createElement("b"); b.textContent = pair[0];
      tag.appendChild(b); tags.appendChild(tag);
    });
    var box = $("cmMuseums"); box.replaceChildren();
    d.museums.forEach(function (hid) {
      var mu = MUSEUMS[hid]; if (!mu) return;
      var a = document.createElement("a"); a.href = mu.href; a.style.color = mu.color;
      var dot = document.createElement("span"); dot.className = "dot"; a.appendChild(dot);
      var nm = document.createElement("span"); nm.textContent = hid + " · " + mu.name; a.appendChild(nm);
      var go = document.createElement("span"); go.className = "go"; go.textContent = "直接参观 →"; a.appendChild(go);
      box.appendChild(a);
    });
    $("cmEnter").href = "district.html?zone=" + d.id;
    $("cmEnter").textContent = "进入" + d.name + " →";
    $("cmPanel").hidden = false;
  }
  DISTRICTS.forEach(function (d) {
    var a = blobs[d.id];
    a.addEventListener("mouseenter", function () { show(d); });
  });
  gMuseums.addEventListener("click", function (e) { e.stopPropagation(); });
  $("cmClose").addEventListener("click", function () { $("cmPanel").hidden = true; });
  $("cmRandom").addEventListener("click", roll);
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") roll();
  });
  function roll() { show(DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)]); }

  /* 打开时随机展示一个区域；?zone=Dxx 可固定（回归测试用） */
  var pinned = new URLSearchParams(location.search).get("zone");
  var initial = pinned && blobs[pinned] ? DISTRICTS.find(function (d) { return d.id === pinned; }) : null;
  (initial ? show(initial) : roll());

  /* 北京时间 UTC+8 时钟 */
  function tick() {
    var now = new Date(Date.now() + 8 * 3600000);
    var label = ("0" + now.getUTCHours()).slice(-2) + ":" + ("0" + now.getUTCMinutes()).slice(-2);
    var clock = $("cmClock"); clock.textContent = label + " 北京时间";
    clock.setAttribute("datetime", now.toISOString().slice(0, 16) + "+08:00");
  }
  tick(); setInterval(tick, 30000);
})();

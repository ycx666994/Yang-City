/* 杨城 · 17 区平面总图（figure-ground 制图风）
   ------------------------------------------------------------
   上一版是一张「程序化全息图」：19 条竖线 + 15 条横线铺满全图，
   再给每个区画一个随机抖动的圆斑。它和杨城没有任何关系——
   圆的半径是 d.r 乘随机数，河流是手写的一串坐标，桥、高架、
   街区全是装饰。所以它「黑漆漆的」，也「体现不出杨城的容貌」。

   这一版换掉整套画法：直接读 3D 用的那两份数据源
     · YC_DISTRICTS    —— 17 个地块的真实矩形（cx/cz/hx/hz）
     · YC_CITY_PLAN    —— 澄川河、三座桥、城际高架、干道
     · ycDistrictPlan  —— 每区自己的街网、环路、林荫道、广场与真建筑
   于是这张图上画出来的每一条街、每一栋楼，都是 3D 里真有的那一条、那一栋。
   图上没有一处是「随机」：所有抖动都来自各区自己的 seed。

   配色按纸质总图来做：浅米底、白街、灰楼，高度越高越深。
   19:00 之后切到夜图（深底、亮街、楼里点灯），滑杆可手动拨时间。 */
(function () {
  "use strict";
  var DISTRICTS = window.YC_DISTRICTS || [];
  var CP = window.YC_CITY_PLAN;
  if (!DISTRICTS.length || !CP) return;
  var PLAN = window.ycDistrictPlan;
  var SVG = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var map = $("cmMap");

  /* 这一页现在有两个身份：
     ① 三维页里「二维地图」按钮拉起的整屏图层（<iframe> 装载）；
     ② 直接打开也能独立工作（发链接给人看总图时用）。
     区别只在跳转：iframe 里点区域如果只跳本窗口，会把「图层」自己换成
     街区页，三维页那一层就没了。所以凡是要换页的出口，统一走 go()。 */
  var IN_FRAME = window.self !== window.top;
  function go(url) {
    if (IN_FRAME) { try { window.top.location.href = url; return; } catch (e) {} }
    location.href = url;
  }
  if (IN_FRAME) {
    /* 嵌在三维页里时，本页自己的顶栏是多余的（父页已经有一条更完整的），
       而且两层顶栏会叠在一起。隐藏它，工具条由父页给。 */
    document.body.classList.add("in-frame");
    /* 图上的馆标是现建的 <a>，逐个补 target 太容易漏；捕获阶段统一兜住 */
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a && !a.target) a.target = "_top";
    }, true);
  }

  /* 馆 → 原型。和 shared/yc3d/yc3d-city.js 里的 HALL_TYPE 同一张表，
     用来在地块里把「那座馆」那栋楼找出来，标在它真正的位置上。 */
  var HALL_TYPE = { H1: "museum", H2: "forensicHall", H3: "twist",
    H4: "archiveFrustum", H5: "collapseFunnel", H6: "archMuseum" };
  var HALLS = {
    H1: { name: "能力与边界博物馆", short: "能力与边界", href: "h1-museum.html", color: "#e8862b" },
    H2: { name: "推理法医馆", short: "推理法医", href: "h2-museum.html", color: "#2b8fc4" },
    H3: { name: "指标失效博物馆", short: "指标失效", href: "h3-museum.html", color: "#d63d7e" },
    H4: { name: "数据污染博物馆", short: "数据污染", href: "h4-museum.html", color: "#5c9a2e" },
    H5: { name: "递归坍塌博物馆", short: "递归坍塌", href: "h5-museum.html", color: "#6a4bd0" },
    H6: { name: "潜能与预算博物馆", short: "潜能与预算", href: "h6-museum.html", color: "#c8761c" }
  };
  var VIBE_LABEL = { core: "核心商务", heritage: "文化老城", compute: "算力园区", research: "科研园区",
    justice: "司法文化", transit: "交通枢纽", campus: "大学城", recursive: "科学园区", green: "生态居住",
    mixed: "市井混合", living: "滨水居住", eco: "生态城", port: "制造港口", lab: "实验区",
    design: "设计社区", cbd: "商务区", energy: "能源新区" };

  /* ---------------- 投影：世界米 → 视图单位 ---------------- */
  var B = CP.bounds, VB_W = 1600, VB_H = 1400;
  var S = Math.min((VB_W - 108) / (B.maxX - B.minX), (VB_H - 104) / (B.maxZ - B.minZ));
  var OX = (VB_W - (B.maxX - B.minX) * S) / 2, OY = (VB_H - (B.maxZ - B.minZ) * S) / 2;
  function PX(x) { return +(OX + (x - B.minX) * S).toFixed(1); }
  function PY(z) { return +(OY + (z - B.minZ) * S).toFixed(1); }
  /* 米 → 视图单位（长度） */
  function L(m) { return +(m * S).toFixed(2); }

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    (parent || map).appendChild(node);
    return node;
  }
  function rng(seedStr) {
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  /* ---------------- 0. 底图 ---------------- */
  el("rect", { x: 0, y: 0, width: VB_W, height: VB_H, class: "cm-paper" });
  /* 郊野：城界以外的一圈。稍微深一档，让城界本身就看得见。 */
  var mrg = 78;
  el("rect", { x: PX(B.minX) - mrg, y: PY(B.minZ) - mrg, width: L(B.maxX - B.minX) + mrg * 2,
    height: L(B.maxZ - B.minZ) + mrg * 2, rx: 26, class: "cm-country" });
  el("rect", { x: PX(B.minX), y: PY(B.minZ), width: L(B.maxX - B.minX), height: L(B.maxZ - B.minZ),
    class: "cm-land" });

  var gRoad = el("g", { class: "cm-g-road" });
  var gWater = el("g", { class: "cm-g-water" });
  var gRail = el("g", { class: "cm-g-rail" });
  var gBridge = el("g", { class: "cm-g-bridge" });
  var gDistrict = el("g", { class: "cm-g-district" });
  var gLabel = el("g", { class: "cm-g-label" });
  var gPin = el("g", { class: "cm-g-pin" });

  /* ---------------- 1. 干道（在江下面，被江截断） ---------------- */
  CP.roads.forEach(function (r) {
    if (!r.a || !r.b) return;                       /* ring:true 那条是环城路，二维图不画 */
    el("line", { x1: PX(r.a[0]), y1: PY(r.a[1]), x2: PX(r.b[0]), y2: PY(r.b[1]),
      class: "cm-ave " + (r.cls === "spine" ? "spine" : ""),
      "stroke-width": Math.max(1.4, L(r.w) * 1.5) }, gRoad);
  });

  /* ---------------- 2. 澄川河 ---------------- */
  function ribbon(pts) {
    var A = [], Bk = [], n = pts.length, i;
    for (i = 0; i < n; i++) {
      var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx = -dz / len, nz = dx / len, hw = p[2];
      A.push([p[0] + nx * hw, p[1] + nz * hw]);
      Bk.push([p[0] - nx * hw, p[1] - nz * hw]);
    }
    var d = "M" + A.map(function (q) { return PX(q[0]) + "," + PY(q[1]); }).join("L");
    d += "L" + Bk.reverse().map(function (q) { return PX(q[0]) + "," + PY(q[1]); }).join("L") + "Z";
    return d;
  }
  var rd = ribbon(CP.river);
  el("path", { d: rd, class: "cm-river-bank" }, gWater);
  el("path", { d: rd, class: "cm-river" }, gWater);

  /* ---------------- 3. 城际高架 ---------------- */
  var railD = "M" + CP.rail.pts.map(function (p) { return PX(p[0]) + "," + PY(p[1]); }).join("L");
  el("path", { d: railD, class: "cm-rail-casing" }, gRail);
  el("path", { d: railD, class: "cm-rail" }, gRail);
  CP.rail.stations.forEach(function (s) {
    el("circle", { cx: PX(s.x), cy: PY(railAt(s.x)), r: 3.6, class: "cm-station" }, gRail);
  });
  function railAt(x) {
    var p = CP.rail.pts;
    for (var i = 0; i < p.length - 1; i++) {
      if ((p[i][0] <= x && p[i + 1][0] >= x) || (p[i][0] >= x && p[i + 1][0] <= x)) {
        var t = (x - p[i][0]) / ((p[i + 1][0] - p[i][0]) || 1);
        return p[i][1] + (p[i + 1][1] - p[i][1]) * t;
      }
    }
    return p[0][1];
  }

  /* ---------------- 4. 三座桥 ---------------- */
  CP.bridges.forEach(function (b) {
    var x = PX(b.x), w = Math.max(3.4, L(b.w)), y0 = PY(b.z0), y1 = PY(b.z1);
    el("rect", { x: x - w / 2, y: y0, width: w, height: y1 - y0, rx: w / 2, class: "cm-bridge" }, gBridge);
    el("rect", { x: x - w / 2 + 1.1, y: y0 + 1.2, width: Math.max(1, w - 2.2), height: y1 - y0 - 2.4,
      rx: (w - 2.2) / 2, class: "cm-bridge-in" }, gBridge);
  });

  /* ---------------- 5. 17 个地块 ---------------- */
  var HEIGHT_STEPS = [
    [16, 0], [30, 1], [55, 2], [95, 3], [150, 4], [230, 5], [400, 6]
  ];
  function hClass(h) {
    for (var i = 0; i < HEIGHT_STEPS.length; i++) if (h <= HEIGHT_STEPS[i][0]) return "h" + HEIGHT_STEPS[i][1];
    return "h6";
  }

  var zones = {}, hallPos = {};

  DISTRICTS.forEach(function (d, di) {
    var plan = PLAN ? PLAN(d) : null;
    var hx = d.hx || d.r, hz = d.hz || d.r;
    var g = el("g", { transform: "translate(" + PX(d.cx) + "," + PY(d.cz) + ") scale(" + S + ")" }, gDistrict);
    g.style.setProperty("--i", di);
    var cid = "cmclip-" + d.id;
    var cp = el("clipPath", { id: cid }, el("defs", {}, map));
    el("rect", { x: -hx, y: -hz, width: hx * 2, height: hz * 2 }, cp);

    var body = el("g", { "clip-path": "url(#" + cid + ")" }, g);

    /* 地块底板 */
    el("rect", { x: -hx, y: -hz, width: hx * 2, height: hz * 2, class: "cm-plate" }, body);
    /* 地块轮廓：这一圈是二维图上唯一「硬」的边界，读图靠它分块 */
    el("rect", { x: -hx, y: -hz, width: hx * 2, height: hz * 2, class: "cm-plate-edge",
      "vector-effect": "non-scaling-stroke" }, body);

    if (plan) {
      /* --- 5a. 水系：海 / 湖 / 河 --- */
      if (plan.basin) {
        var bx = plan.basin.x0;
        el("rect", { x: bx, y: -hz, width: hx - bx, height: hz * 2, class: "cm-sea" }, body);
        el("line", { x1: bx, y1: -hz, x2: bx, y2: hz, class: "cm-shore",
          "vector-effect": "non-scaling-stroke" }, body);
      }
      if (plan.lake) {
        var lk = plan.lake;
        el("ellipse", { cx: lk.x, cy: lk.z, rx: lk.rx, ry: lk.rz, class: "cm-lake",
          transform: "rotate(" + ((lk.rot || 0) * 180 / Math.PI).toFixed(1) + "," + lk.x + "," + lk.z + ")" }, body);
      }
      if (plan.water && plan.water.pts) {
        var wp = plan.water.pts, hw = (plan.water.w || 60) / 2, A = [], Bk = [];
        for (var wi = 0; wi < wp.length; wi++) {
          var a2 = wp[Math.max(0, wi - 1)], b2 = wp[Math.min(wp.length - 1, wi + 1)];
          var dx2 = b2[0] - a2[0], dz2 = b2[1] - a2[1], l2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
          var nx2 = -dz2 / l2, nz2 = dx2 / l2;
          A.push([wp[wi][0] + nx2 * hw, wp[wi][1] + nz2 * hw]);
          Bk.push([wp[wi][0] - nx2 * hw, wp[wi][1] - nz2 * hw]);
        }
        var wd = "M" + A.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L")
          + "L" + Bk.reverse().map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L") + "Z";
        el("path", { d: wd, class: "cm-inner-water" }, body);
      }

      /* --- 5b. 街网：街区是一块块浅灰，街是它们之间露出来的底板 --- */
      var gd = plan.grid;
      var R = plan.R || 470;
      if (gd && gd.type === "grid") {
        var ang = (gd.angle || 0) * 180 / Math.PI;
        var gg = el("g", { transform: "rotate(" + ang.toFixed(2) + ")" }, body);
        var sx = gd.spacingX || 96, sz = gd.spacingZ || 96;
        var major = gd.majorEvery || 3;
        var limX = hx * 1.45, limZ = hz * 1.45;
        var ix = 0;
        for (var cx0 = -limX; cx0 < limX; cx0 += sx, ix++) {
          var iz = 0;
          for (var cz0 = -limZ; cz0 < limZ; cz0 += sz, iz++) {
            /* 交叉口留得更宽 */
            var padX = (ix % major === 0) ? 13 : 8, padZ = (iz % major === 0) ? 13 : 8;
            el("rect", { x: +(cx0 + padX).toFixed(1), y: +(cz0 + padZ).toFixed(1),
              width: Math.max(2, sx - padX * 2), height: Math.max(2, sz - padZ * 2), class: "cm-block" }, gg);
          }
        }
      }

      /* --- 5c. 环路与林荫道 --- */
      (plan.rings || []).forEach(function (r) {
        el("circle", { cx: r.cx || 0, cy: r.cz || 0, r: r.r, fill: "none",
          class: "cm-ring-road", "stroke-width": Math.max(1.6, L(r.w || 26) * 1.4),
          "vector-effect": "non-scaling-stroke" }, body);
      });
      (plan.avenues || []).forEach(function (av) {
        el("line", { x1: av.from[0], y1: av.from[1], x2: av.to[0], y2: av.to[1],
          class: "cm-dist-ave", "stroke-width": Math.max(1.5, L(av.w || 30) * 1.4),
          "vector-effect": "non-scaling-stroke" }, body);
      });
      /* --- 5d. 广场 --- */
      (plan.plazas || []).forEach(function (pz) {
        el("rect", { x: pz.x - pz.w / 2, y: pz.z - pz.d / 2, width: pz.w, height: pz.d,
          rx: 3, class: "cm-plaza" }, body);
      });
      /* --- 5e. 真建筑 --- */
      var gh = el("g", { class: "cm-bldg-g" }, body);
      (plan.hero || []).forEach(function (h) {
        if (!h.w || !h.d) return;
        var rot = h.rot ? (h.rot * 180 / Math.PI) : 0;
        var tr = "rotate(" + rot.toFixed(1) + "," + h.x + "," + h.z + ")";
        if ((h.h || 0) >= 110) {
          /* 只有高个子才投影子：低层楼也投，图会糊成一片灰。 */
          el("rect", { x: +(h.x - h.w / 2 + 7).toFixed(1), y: +(h.z - h.d / 2 + 7).toFixed(1),
            width: h.w, height: h.d, transform: tr, class: "cm-bldg-sh" }, gh);
        }
        el("rect", { x: +(h.x - h.w / 2).toFixed(1), y: +(h.z - h.d / 2).toFixed(1),
          width: h.w, height: h.d, transform: tr, class: "cm-bldg " + hClass(h.h || 20) }, gh);
        /* 灯：夜里高楼上的一层亮窗 */
        if ((h.h || 0) >= 55) {
          el("rect", { x: +(h.x - h.w * 0.22).toFixed(1), y: +(h.z - h.d * 0.22).toFixed(1),
            width: +(h.w * 0.44).toFixed(1), height: +(h.d * 0.44).toFixed(1), transform: tr,
            class: "cm-lit" }, gh);
        }
        /* 记下每座馆在本区里的位置 */
        for (var hid in HALL_TYPE) {
          if (HALL_TYPE[hid] === h.type && (d.museums || []).indexOf(hid) >= 0 && !hallPos[hid]) {
            hallPos[hid] = { x: d.cx + h.x, z: d.cz + h.z };
          }
        }
      });
    }

    /* 交互层：透明矩形盖住整块地 */
    var hit = el("rect", { x: -hx, y: -hz, width: hx * 2, height: hz * 2, class: "cm-hit" }, body);
    zones[d.id] = { g: g, hit: hit, d: d, hx: hx, hz: hz, plan: plan };
    hit.addEventListener("mouseenter", function () { show(d); });
    hit.addEventListener("click", function () { go("district.html?zone=" + d.id); });

    /* --- 5f. 标签：挂在每块地头上那条缝里，不压街区 --- */
    var lx = PX(d.cx - hx) + 2, ly = PY(d.cz - hz) - 6;
    var nmW = d.name.length * 11.4 + 30;
    var gl = el("g", { class: "cm-lab" + (d.featured ? " featured" : "") }, gLabel);
    gl.dataset.id = d.id;
    el("rect", { x: lx - 3.5, y: ly - 10.5, width: nmW, height: 15, rx: 2, class: "cm-lab-bg" }, gl);
    el("text", { x: lx, y: ly, class: "cm-lab-id" }, gl).textContent = d.id;
    el("text", { x: lx + 22, y: ly, class: "cm-lab-name" }, gl).textContent = d.name;
    gl.addEventListener("mouseenter", function () { show(d); });
    zones[d.id].lab = gl;
  });

  /* ---------------- 6. 六馆 ---------------- */
  for (var hid in HALLS) {
    var p = hallPos[hid];
    if (!p) continue;
    var mu = HALLS[hid];
    var a = el("a", { class: "cm-hall", href: mu.href, "aria-label": "参观" + mu.name }, gPin);
    a.style.color = mu.color;
    var mx = PX(p.x), my = PY(p.z);
    el("circle", { cx: mx, cy: my, r: 7.5, class: "cm-hall-halo" }, a);
    el("circle", { cx: mx, cy: my, r: 4.6, class: "cm-hall-dot" }, a);
    el("circle", { cx: mx, cy: my, r: 1.8, class: "cm-hall-core" }, a);
    var t = el("text", { x: mx + 8, y: my + 3.4, class: "cm-hall-t" }, a);
    t.textContent = hid;
    var tt = document.createElementNS(SVG, "title"); tt.textContent = mu.name; a.appendChild(tt);
  }
  /* 中央广场与主塔 */
  var d01 = DISTRICTS.filter(function (x) { return x.id === "D01"; })[0];
  if (d01) {
    var tx = PX(d01.cx), ty = PY(d01.cz - 60);
    var bg = el("g", { class: "cm-badge" }, gPin);
    el("rect", { x: tx - 40, y: ty - 34, width: 80, height: 17, rx: 2 }, bg);
    el("text", { x: tx, y: ty - 22 }, bg).textContent = "中央广场 · 主塔";
  }

  /* ---------------- 7. 面板与选中 ---------------- */
  var selected = null;
  function show(d) {
    selected = d;
    for (var id in zones) {
      var z = zones[id];
      z.hit.classList.toggle("sel", id === d.id);
      z.lab.classList.toggle("on", id === d.id);
    }
    $("cmPanel").style.setProperty("--c", d.color || "#4a7f9c");
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
      var mu = HALLS[hid]; if (!mu) return;
      var a = document.createElement("a"); a.href = mu.href; a.style.color = mu.color;
      var dot = document.createElement("span"); dot.className = "dot"; a.appendChild(dot);
      var nm = document.createElement("span"); nm.textContent = hid + " · " + mu.name; a.appendChild(nm);
      var go = document.createElement("span"); go.className = "go"; go.textContent = "直接参观 →"; a.appendChild(go);
      box.appendChild(a);
    });
    $("cmEnter").href = "district.html?zone=" + d.id + "&" + phaseQuery();
    $("cmEnter").textContent = "进入" + d.name + " →";
    $("cmPanel").hidden = false;
  }
  $("cmClose").addEventListener("click", function () { $("cmPanel").hidden = true; });
  $("cmRandom").addEventListener("click", roll);
  function roll() {
    show(DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)]);
  }
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") roll();
  });

  /* ---------------- 8. 时间 ---------------- */
  /* 和 3D 同一套口径：默认跟随北京时间，滑杆只冻结「演练时钟」。
     二维图上时间不是装饰——它决定这张图是白天总图还是夜间灯图。 */
  var autoTime = true, simHour = null;
  function phaseOf(h) {
    if (h >= 6.5 && h < 17.5) return "day";
    if (h >= 5 && h < 6.5) return "dawn";
    if (h >= 17.5 && h < 19.5) return "dusk";
    return "night";
  }
  function phaseQuery() { return autoTime ? "" : "time=" + simHour; }
  function fmt(h) {
    var hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
    return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2);
  }
  function applyPhase(h) {
    var ph = phaseOf(h);
    document.body.dataset.phase = ph;
    $("cmHourOut").textContent = fmt(h);
    document.body.classList.toggle("is-night", ph === "night");
  }
  function beijingNow() { var n = new Date(Date.now() + 8 * 3600000); return n.getUTCHours() + n.getUTCMinutes() / 60; }
  function tick() {
    if (autoTime) {
      var h = beijingNow();
      applyPhase(h);
      $("cmHour").value = h.toFixed(2);
      $("cmReset").classList.add("on");
      $("cmClock").textContent = fmt(h) + " 北京时间";
    }
  }
  $("cmHour").addEventListener("input", function () {
    autoTime = false; simHour = parseFloat(this.value);
    $("cmReset").classList.remove("on");
    applyPhase(simHour);
    $("cmClock").textContent = fmt(simHour) + " 演练时间";
  });
  $("cmReset").addEventListener("click", function () {
    autoTime = true; simHour = null; tick();
  });

  var q = new URLSearchParams(location.search);
  var pinned = q.get("zone");
  if (q.get("time") !== null && q.get("time") !== "") {
    autoTime = false; simHour = parseFloat(q.get("time")) || 0;
    $("cmHour").value = simHour;
    applyPhase(simHour);
    $("cmClock").textContent = fmt(simHour) + " 演练时间";
  } else {
    tick();
  }
  setInterval(tick, 20000);

  var initial = pinned && zones[pinned] ? DISTRICTS.filter(function (d) { return d.id === pinned; })[0] : null;
  if (initial) show(initial); else roll();
})();

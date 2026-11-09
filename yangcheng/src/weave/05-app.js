/* ============================================================
   织识 · 主逻辑
   ------------------------------------------------------------
   一条规则贯穿全页：灯不能自己点亮。
   点开一盏灯，守灯人先讲，然后考三问，判分过线才升一档。
   自评说「我懂」却没过，这盏会被标成错觉灯 —— 那是这整座
   灯图最想让人看见的东西。

   档位：未燃 0 / 引燃 1 / 微明 2 / 炽亮 3 / 鎏辉 4
   点亮后会随时间变暗，三十天以上要复燃一次。
   ============================================================ */
(function (w) {
  "use strict";

  var D = w.YC_WEAVE, L = w.YC_LLM;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "yc.weave.v2";

  var LV_NAME = ["未燃", "引燃", "微明", "炽亮", "鎏辉"];
  var LV_COLOR = ["#b9c0b2", "#c9a86a", "#d2a23c", "#e0ab34", "#f0bd3e"];
  var LV_TIP = ["没点亮", "听过一遍，能说出大概", "能用上，说得出边界", "能讲给别人听", "能带着别人走一遍"];
  var PASS_AVG = 65, PASS_MIN = 40;

  /* ---------------- 存档 ---------------- */
  var SAVE = { nodes: {}, own: [], last: "" };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var v = JSON.parse(raw);
      if (v && typeof v === "object") {
        SAVE.nodes = v.nodes || {};
        SAVE.own = Array.isArray(v.own) ? v.own : [];
        SAVE.last = v.last || "";
      }
    }
  } catch (e) { /* 存档坏了就当新的开始，不拦着人用 */ }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) {}
  }

  /* ---------------- 档位与状态 ---------------- */
  function rec(n) { return SAVE.nodes[n.id] || null; }

  /* 点亮之后会暗下去：二十一天掉一档，五十天掉两档，但不掉回未燃 */
  function lvOf(n) {
    var r = rec(n);
    if (!r || !r.lv) return 0;
    var days = (Date.now() - (r.t || 0)) / 864e5;
    var drop = days < 21 ? 0 : days < 50 ? 1 : 2;
    return Math.max(1, r.lv - drop);
  }
  function isDim(n) {
    var r = rec(n);
    return !!(r && r.lv && lvOf(n) < r.lv);
  }
  /* 错觉：说过自己懂，考过，但灯没亮 */
  function isIll(n) {
    var r = rec(n);
    return !!(r && r.self === 2 && (r.tries || 0) > 0 && !r.lv);
  }
  function isLit(n) { return lvOf(n) > 0; }

  function progress(sys) {
    var lit = 0, ill = 0;
    sys.nodes.forEach(function (n) {
      if (isLit(n)) lit++;
      else if (isIll(n)) ill++;
    });
    return { lit: lit, ill: ill, total: sys.nodes.length, pct: sys.nodes.length ? lit / sys.nodes.length : 0 };
  }

  /* ---------------- 体系列表（官方 + 自建） ---------------- */
  var OWNS = SAVE.own.map(adoptOwn).filter(Boolean);

  function adoptOwn(o) {
    if (!o || !o.nodes || !o.nodes.length) return null;
    var sys = {
      id: o.id, name: o.name, en: o.en, note: o.note, core: o.core,
      tag: "own", nodes: [], edges: [], size: 0
    };
    sys.nodes = o.nodes.map(function (n) {
      return {
        id: o.id + ":" + n.key, key: n.key, name: n.name,
        tag: n.tag || "core", w: n.w || 1.2, desc: n.desc || ""
      };
    });
    var ids = {};
    sys.nodes.forEach(function (n) { ids[n.id] = true; });
    sys.edges = (o.edges || []).map(function (e, i) {
      return { id: o.id + ":e" + i, s: o.id + ":" + e[0], t: o.id + ":" + e[1], k: e[2] || "pre" };
    }).filter(function (e) { return ids[e.s] && ids[e.t] && e.s !== e.t; });
    sys.size = sys.nodes.length;
    return sys;
  }

  function allSys() { return D.systems.concat(OWNS); }
  function tagName(t, sysId) { return D.tagName(t, sysId); }

  /* ---------------- 视图状态 ---------------- */
  var cur = null;
  var selected = null, hovered = null;
  var pan = { x: 0, y: 0 }, zoom = 1;
  var sortBy = "name", query = "", filter = "all";
  var findMode = false, findHits = null;
  var QUIZ = null;
  var BUSY = false;

  /* 找体系：?sys= 可以指定，默认上次用的 */
  function findSys(id) {
    if (!id) return null;
    return allSys().find(function (s) { return s.id === id; }) || null;
  }

  /* ---------------- 分层布局 ----------------
     深度按 BFS 最短路径算（不是最长路径，否则整张图会被拉成一条竖线），
     只挂 rel 边的节点贴着邻居的层；层内按上游横坐标排，一行超过六个折成两排。 */
  function layout(sys) {
    var nodes = sys.nodes;
    var pres = sys.edges.filter(function (e) { return e.k === "pre"; });
    var rels = sys.edges.filter(function (e) { return e.k === "rel"; });
    var depth = {}, i;
    nodes.forEach(function (n) { depth[n.id] = Infinity; });

    var root = nodes.find(function (n) { return n.key === "root"; }) || nodes[0];
    depth[root.id] = 0;
    var q = [root.id];
    while (q.length) {
      var id = q.shift();
      pres.forEach(function (e) {
        if (e.s === id && depth[e.t] > depth[id] + 1) { depth[e.t] = depth[id] + 1; q.push(e.t); }
      });
    }
    for (i = 0; i < 3; i++) {
      rels.forEach(function (e) {
        if (isFinite(depth[e.s]) && !isFinite(depth[e.t])) depth[e.t] = depth[e.s] + 1;
        if (isFinite(depth[e.t]) && !isFinite(depth[e.s])) depth[e.s] = depth[e.t] + 1;
      });
    }
    var maxD = 0;
    nodes.forEach(function (n) { if (isFinite(depth[n.id])) maxD = Math.max(maxD, depth[n.id]); });
    nodes.forEach(function (n) { if (!isFinite(depth[n.id])) depth[n.id] = maxD + 1; });

    var rows = {};
    nodes.forEach(function (n) { (rows[depth[n.id]] = rows[depth[n.id]] || []).push(n); });

    var posX = {}, GAP = 158;
    var keys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });

    keys.forEach(function (d) {
      var row = rows[d];
      if (d > 0) row.sort(function (a, b) { return upX(a) - upX(b); });
      var cols = row.length > 6 ? Math.ceil(row.length / 2) : row.length;
      var wdt = (cols - 1) * GAP;
      row.forEach(function (n, idx) {
        n._sub = Math.floor(idx / cols);
        n.tx = (idx % cols) * GAP - wdt / 2;
        posX[n.id] = n.tx;
      });
    });

    var y = 0;
    keys.forEach(function (d) {
      var row = rows[d];
      var two = row.some(function (n) { return n._sub > 0; });
      row.forEach(function (n) { n.ty = y + n._sub * 62 + (two ? 8 : 0); });
      y += two ? 208 : 142;
    });

    var off = y / 2 - 30;
    keys.forEach(function (d) {
      rows[d].forEach(function (n) {
        n.ty -= off; n._d = d;
        if (!n._placed) { n.px = n.tx; n.py = n.ty; n._placed = true; }
      });
    });

    function upX(n) {
      var ps = pres.filter(function (e) { return e.t === n.id; }).map(function (e) { return posX[e.s]; })
        .filter(function (v) { return v !== undefined; });
      return ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : 0;
    }
  }

  /* ---------------- 画布 ---------------- */
  var cv = $("wvCv"), ctx = cv.getContext("2d");
  var W = 0, H = 0, dpr = 1;

  /* 两套底色：夜里那套是紫黑加星点，白天那套是米纸。
     只有「底」和「字」跟着主题换，五档灯火都从 CSS 变量读，两边自动对齐。 */
  var SKY = {
    dark: {
      bgTop: "#182046", bgBot: "#05070e",
      grid: "rgba(126,150,240,.05)",
      pre: "rgba(134,162,242,.23)", rel: "rgba(134,162,242,.12)", ext: "rgba(134,162,242,.09)",
      hot: "rgba(232,189,106,.8)",
      offFill: "#131931", offStroke: "#2b3552",
      label: "#aab5d8", labelOff: "#6b779d",
      sel: "#8aa9ff", hov: "#4a5679",
      glow: "255,214,138"
    },
    light: {
      bgTop: "#f8f9f2", bgBot: "#f1f4e8",
      grid: "#e9ecdf",
      pre: "#d6ddc9", rel: "#e1e6d7", ext: "#e6eadd",
      hot: "#c08a33",
      offFill: "#eef0e6", offStroke: "#ccd3c2",
      label: "#5d675f", labelOff: "#8e9a90",
      sel: "#3f5f4a", hov: "#b6c0ac",
      glow: "232,182,74"
    }
  };

  var T = SKY.dark;
  var LVC = LV_COLOR.slice();

  /* 星点是固定的，按视口比例铺开，不随拖动走 —— 它是远景，不是图上的东西 */
  var stars = (function () {
    var arr = [], seed = 20261109;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (var i = 0; i < 170; i++) {
      arr.push({ x: rnd(), y: rnd(), r: rnd() * 1.3 + 0.35, a: rnd() * 0.45 + 0.12 });
    }
    return arr;
  })();

  function themeName() { return document.documentElement.getAttribute("data-theme") || "dark"; }

  function refreshColors() {
    var cs = getComputedStyle(document.documentElement);
    LVC = [0, 1, 2, 3, 4].map(function (i) {
      return (cs.getPropertyValue("--wv-l" + i) || "").trim() || LV_COLOR[i];
    });
    T = SKY[themeName()] || SKY.dark;
  }

  function resize() {
    dpr = Math.min(w.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function toWorld(sx, sy) {
    return { x: (sx - W / 2) / zoom - pan.x, y: (sy - H / 2) / zoom - pan.y };
  }
  function radius(n) { return 10 + n.w * 5; }

  var flash = null, flashRAF = 0;
  function triggerFlash(id) {
    flash = { id: id, t0: performance.now() };
    if (!flashRAF) loopFlash();
  }
  function loopFlash() {
    flashRAF = requestAnimationFrame(function () {
      draw();
      if (flash && performance.now() - flash.t0 < 700) loopFlash();
      else { flash = null; flashRAF = 0; draw(); }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    /* ---- 底 ---- */
    if (themeName() === "dark") {
      var g0 = ctx.createRadialGradient(W * 0.5, H * 0.18, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.9);
      g0.addColorStop(0, T.bgTop);
      g0.addColorStop(1, T.bgBot);
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, W, H);
      for (var si = 0; si < stars.length; si++) {
        var st = stars[si];
        ctx.fillStyle = "rgba(206,219,255," + st.a.toFixed(3) + ")";
        ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
      }
    } else {
      var g1 = ctx.createLinearGradient(0, 0, 0, H);
      g1.addColorStop(0, T.bgTop);
      g1.addColorStop(1, T.bgBot);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, W, H);
    }
    if (!cur) return;

    /* ---- 网格 ---- */
    ctx.save();
    ctx.strokeStyle = T.grid;
    ctx.lineWidth = 1;
    var step = 44 * zoom;
    var ox = ((pan.x * zoom) % step + step) % step + W / 2;
    var oy = ((pan.y * zoom) % step + step) % step + H / 2;
    for (var gx = ox % step; gx < W; gx += step) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = oy % step; gy < H; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.restore();

    var byId = {};
    cur.nodes.forEach(function (n) { byId[n.id] = n; });
    function X(n) { return (n.px + pan.x) * zoom + W / 2; }
    function Y(n) { return (n.py + pan.y) * zoom + H / 2; }

    /* ---- 边 ---- */
    cur.edges.forEach(function (e) {
      var a = byId[e.s], b = byId[e.t];
      if (!a || !b) return;
      if (e.k !== "pre" && Math.abs((a._d || 0) - (b._d || 0)) > 3
          && !(selected && (selected.id === a.id || selected.id === b.id))) return;

      var on = selected && (selected.id === a.id || selected.id === b.id);
      ctx.beginPath();
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
      ctx.strokeStyle = on ? T.hot : (e.k === "pre" ? T.pre : e.k === "rel" ? T.rel : T.ext);
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.setLineDash(e.k === "rel" ? [4, 4] : e.k === "ext" ? [2, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* ---- 节点 ---- */
    cur.nodes.forEach(function (n) {
      var x = X(n), y = Y(n), r = radius(n) * zoom;
      if (x < -80 || x > W + 80 || y < -80 || y > H + 80) return;
      var lv = lvOf(n);
      var sel = selected && selected.id === n.id;
      var hov = hovered && hovered.id === n.id;

      if (lv > 0) {
        var g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * (1.6 + lv * 0.55));
        g.addColorStop(0, "rgba(" + T.glow + "," + (0.16 + lv * 0.1) + ")");
        g.addColorStop(1, "rgba(" + T.glow + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * (1.6 + lv * 0.55), 0, 6.2832); ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = lv > 0 ? LVC[lv] : T.offFill;
      ctx.fill();
      ctx.strokeStyle = lv > 0 ? "rgba(255,236,190,.32)" : T.offStroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (isIll(n)) {
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.2832);
        ctx.strokeStyle = "rgba(224,122,95,.7)"; ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (isDim(n)) {
        ctx.beginPath(); ctx.arc(x, y, r + 5, -1.2, 1.9);
        ctx.strokeStyle = "rgba(230,189,106,.55)"; ctx.lineWidth = 1.4; ctx.stroke();
      }
      if (sel || hov) {
        ctx.beginPath(); ctx.arc(x, y, r + (sel ? 8 : 6), 0, 6.2832);
        ctx.strokeStyle = sel ? T.sel : T.hov; ctx.lineWidth = sel ? 1.6 : 1;
        ctx.stroke();
      }

      var fs = Math.max(9.5, Math.min(14, 12.5 * zoom));
      ctx.font = fs + "px 'Microsoft YaHei','PingFang SC',system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      var label = n.name;
      if (label.length > 12) label = label.slice(0, 11) + "…";
      ctx.fillStyle = lv > 0 ? T.label : T.labelOff;
      ctx.fillText(label, x, y + r + 6);
    });

    /* ---- 点亮时的一圈扩散 ---- */
    if (flash) {
      var n2 = byId[flash.id];
      var t = (performance.now() - flash.t0) / 700;
      if (n2 && t <= 1) {
        ctx.beginPath();
        ctx.arc(X(n2), Y(n2), radius(n2) * zoom + t * 54, 0, 6.2832);
        ctx.strokeStyle = "rgba(" + T.glow + "," + (0.8 * (1 - t)) + ")";
        ctx.lineWidth = 2.4 * (1 - t);
        ctx.stroke();
      }
    }
  }

  function hitTest(sx, sy) {
    if (!cur) return null;
    for (var i = cur.nodes.length - 1; i >= 0; i--) {
      var n = cur.nodes[i];
      var x = (n.px + pan.x) * zoom + W / 2;
      var y = (n.py + pan.y) * zoom + H / 2;
      var r = radius(n) * zoom + 6;
      if ((sx - x) * (sx - x) + (sy - y) * (sy - y) <= r * r) return n;
    }
    return null;
  }

  /* ---------------- 拖拽 / 缩放 ---------------- */
  var drag = null;

  function localXY(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  cv.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    var p = localXY(e);
    var n = hitTest(p.x, p.y);
    drag = { n: n, sx: p.x, sy: p.y, px: pan.x, py: pan.y, moved: 0 };
    cv.setPointerCapture(e.pointerId);
    cv.classList.add("grabbing");
  });

  cv.addEventListener("pointermove", function (e) {
    var p = localXY(e);
    if (!drag) {
      var h = hitTest(p.x, p.y);
      if ((h && h !== hovered) || (!h && hovered)) {
        hovered = h;
        cv.classList.toggle("hot", !!h);
        draw();
      }
      return;
    }
    var dx = p.x - drag.sx, dy = p.y - drag.sy;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 3) {
      pan.x = drag.px + dx / zoom;
      pan.y = drag.py + dy / zoom;
      draw();
    }
  });

  cv.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    cv.classList.remove("grabbing");
    if (d.moved < 5) {
      if (d.n) selectNode(d.n);
      else { selected = null; closeCard(); draw(); }
    }
  });

  cv.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = localXY(e);
    var before = toWorld(p.x, p.y);
    var f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoom = Math.max(0.42, Math.min(2.4, zoom * f));
    var after = toWorld(p.x, p.y);
    pan.x += after.x - before.x;
    pan.y += after.y - before.y;
    $("wvZoom").textContent = "×" + zoom.toFixed(2);
    draw();
  }, { passive: false });

  function fit() {
    if (!cur) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cur.nodes.forEach(function (n) {
      minX = Math.min(minX, n.px); maxX = Math.max(maxX, n.px);
      minY = Math.min(minY, n.py); maxY = Math.max(maxY, n.py);
    });
    var wSpan = Math.max(maxX - minX + 220, 340);
    var hSpan = Math.max(maxY - minY + 300, 340);
    /* 下限 0.72：宁可让图稍微超出画布，也不要把字缩到看不清 */
    zoom = Math.max(0.72, Math.min(1.5, Math.min(W / wSpan, H / hSpan)));
    pan.x = -(minX + maxX) / 2;
    pan.y = -(minY + maxY) / 2;
    $("wvZoom").textContent = "×" + zoom.toFixed(2);
    draw();
  }

  function centerOn(n) {
    pan.x = -n.px; pan.y = -n.py;
    zoom = Math.max(zoom, 0.9);
    $("wvZoom").textContent = "×" + zoom.toFixed(2);
    draw();
  }

  /* ---------------- 卡片 ---------------- */
  var card = $("wvCard");

  function showView(v) {
    card.querySelectorAll(".wv-view").forEach(function (el) {
      el.hidden = el.dataset.v !== v;
    });
  }
  function closeCard() { card.classList.remove("on"); }

  function selectNode(n) {
    selected = n;
    showView("info");
    $("wvCardTag").textContent = tagName(n.tag, cur.id);
    $("wvCardDepth").textContent = "第 " + ((n._d || 0) + 1) + " 层";
    $("wvCardName").textContent = n.name;
    $("wvCardDesc").textContent = n.desc;

    var lv = lvOf(n);
    $("wvLvRow").innerHTML = LV_NAME.map(function (nm, i) {
      var cls = i === lv && lv > 0 ? "on" : (i === lv + 1 ? "next" : "");
      return '<span class="' + cls + '" title="' + LV_TIP[i] + '">' + nm + "</span>";
    }).join("");

    /* 自评只在没点亮时问；点亮过了就不必再问一遍 */
    var r = rec(n);
    var selfBox = $("wvSelf");
    if (lv > 0) {
      selfBox.hidden = true;
    } else {
      selfBox.hidden = false;
      var done = r && typeof r.self === "number";
      selfBox.innerHTML = '<div class="lab">考之前先说一句：这盏，你觉得自己懂吗</div>' +
        '<div class="opts">' +
        ['没听过', '有点印象', '我觉得我懂'].map(function (t, i) {
          return '<button type="button" data-self="' + i + '" aria-pressed="' +
            (done && r.self === i ? "true" : "false") + '">' + t + "</button>";
        }).join("") + "</div>" +
        (isIll(n) ? '<div class="done">你上次说自己懂，考核没过。这盏就是错觉。</div>' : "");
    }

    $("wvStartQuiz").textContent = lv >= 4 ? "已鎏辉" : (lv === 0 ? "开始考核" : "考下一档");
    $("wvStartQuiz").disabled = lv >= 4;

    card.classList.add("on");
    renderList();
    draw();
  }

  /* 自评：只记下他说的，不评价。评价留给考核。 */
  card.addEventListener("click", function (e) {
    var b = e.target.closest("[data-self]");
    if (!b || !selected) return;
    var v = Number(b.dataset.self);
    var r = SAVE.nodes[selected.id] || {};
    r.self = v;
    SAVE.nodes[selected.id] = r;
    persist();
    b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
    b.setAttribute("aria-pressed", "true");
    renderList(); renderProgress();
  });

  $("wvCardX").addEventListener("click", function () { selected = null; closeCard(); draw(); });
  $("wvQuizX").addEventListener("click", function () { selected = null; closeCard(); draw(); });
  $("wvAskExplain").addEventListener("click", explainNode);
  $("wvStartQuiz").addEventListener("click", startQuiz);

  /* ---------------- 右栏：守灯人 ---------------- */
  var talk = $("wvTalk");

  function scrollTalk() { talk.scrollTop = talk.scrollHeight; }

  function bubble(html, who, busy) {
    var el = document.createElement("div");
    el.className = "wv-msg " + who + (busy ? " busy" : "");
    if (html != null) el.innerHTML = html;
    talk.appendChild(el);
    scrollTalk();
    return el;
  }

  function say(text, note) {
    var el = bubble(null, "bot");
    el.textContent = text;
    if (note) {
      var n = document.createElement("div");
      n.className = "note";
      n.textContent = note;
      el.appendChild(n);
    }
    scrollTalk();
    return el;
  }

  function clearTalk() { talk.innerHTML = ""; }
  function lampOn(on) { $("wvLamp").classList.toggle("on", !!on); }

  function openRight() {
    $("wvRight").classList.add("open");
    $("wvLeft").classList.remove("open");
  }
  function closeDrawers() {
    $("wvRight").classList.remove("open");
    $("wvLeft").classList.remove("open");
  }

  function llmGate() {
    if (L.available()) return true;
    bubble('<div class="wv-off">' + L.why() + "</div>", "bot");
    return false;
  }

  /* ---------------- 讲一盏灯 ---------------- */
  async function explainNode() {
    if (!selected || BUSY) return;
    if (!llmGate()) return;
    var node = selected;
    openRight();
    clearTalk();
    lampOn(true);
    $("wvWho").textContent = "守灯人 · " + node.name;
    $("wvWhoSub").textContent = "正在讲这一盏";

    bubble("讲「<b>" + esc(node.name) + "</b>」。", "bot");
    var el = bubble(null, "bot", true);
    BUSY = true;
    try {
      await L.explain(cur, node, function (d) { el.textContent += d; scrollTalk(); });
      el.classList.remove("busy");
      /* 讲完给两个出口：直接进考核，或者先追问 */
      var s = document.createElement("div");
      s.className = "sug";
      s.innerHTML = '<button type="button" data-act="quiz">考我</button>' +
        '<button type="button" data-act="rel">它跟旁边什么关系</button>';
      el.appendChild(s);
      $("wvWhoSub").textContent = "讲完这一盏了";
    } catch (e) {
      el.classList.remove("busy");
      el.innerHTML = '<div class="wv-off">' + esc(friendly(e)) + "</div>";
    } finally {
      BUSY = false;
      lampOn(false);
    }
  }

  talk.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "quiz") startQuiz();
    if (b.dataset.act === "rel") {
      var near = L.around(cur, selected).up.concat(L.around(cur, selected).rel).filter(Boolean)[0];
      if (!near) return;
      askRel(selected, near);
    }
  });

  async function askRel(a, b) {
    if (!llmGate() || BUSY) return;
    BUSY = true;
    var el = bubble(null, "bot", true);
    try {
      await L.relate(cur, a, b, function (d) { el.textContent += d; scrollTalk(); });
      el.classList.remove("busy");
    } catch (e) {
      el.classList.remove("busy");
      el.innerHTML = '<div class="wv-off">' + esc(friendly(e)) + "</div>";
    } finally { BUSY = false; }
  }

  /* ---------------- 考核 ---------------- */
  function quizLevel(lv) { return Math.min(3, lv + 1); }

  async function startQuiz() {
    if (!selected || BUSY) return;
    if (!llmGate()) return;
    var node = selected;
    var lv = lvOf(node);
    if (lv >= 4) { toast("这盏已经到鎏辉了"); return; }

    QUIZ = { node: node, level: quizLevel(lv), qs: null, idx: 0, scores: [], stage: "ask", verdict: null };
    showView("quiz");
    $("wvQuizName").textContent = node.name;
    $("wvQuizStep").textContent = "第 1 / 3 问";
    $("wvQuizLv").textContent = ["", "刚上手", "要用得上", "能教别人"][QUIZ.level];
    $("wvQuizQ").textContent = "正在出题…";
    $("wvQuizAns").value = "";
    $("wvQuizAns").hidden = false;
    $("wvQuizAns").disabled = true;
    $("wvQuizSend").textContent = "交这一问";
    $("wvQuizSend").disabled = true;
    $("wvVerdict").hidden = true;
    $("wvQuizProg").style.width = "0%";
    BUSY = true;

    try {
      QUIZ.qs = await L.quiz(cur, node, QUIZ.level);
      renderQuestion();
    } catch (e) {
      $("wvQuizQ").textContent = friendly(e);
      $("wvQuizSend").disabled = true;
    } finally {
      BUSY = false;
      $("wvQuizAns").disabled = false;
      $("wvQuizSend").disabled = false;
    }
  }

  function renderQuestion() {
    var q = QUIZ.qs[QUIZ.idx];
    $("wvQuizStep").textContent = "第 " + (QUIZ.idx + 1) + " / " + QUIZ.qs.length + " 问";
    $("wvQuizQ").textContent = q.ask;
    $("wvQuizAns").value = "";
    $("wvQuizAns").hidden = false;
    $("wvQuizAns").placeholder = QUIZ.idx === 0 ? "用自己的话说，别抄定义"
      : QUIZ.idx === 1 ? "说清谁先谁后、为什么" : "举一个它会用错的场合";
    $("wvQuizAns").focus();
    $("wvQuizProg").style.width = (QUIZ.idx / QUIZ.qs.length * 100) + "%";
    $("wvVerdict").hidden = true;
    $("wvQuizSend").textContent = "交这一问";
    QUIZ.stage = "ask";
  }

  $("wvQuizSend").addEventListener("click", function () {
    if (!QUIZ) return;
    if (QUIZ.stage === "verdict") return nextQuestion();
    submitAnswer();
  });

  $("wvQuizSkip").addEventListener("click", function () {
    if (!QUIZ || BUSY) return;
    if (QUIZ.stage === "verdict") return nextQuestion();
    QUIZ.scores.push(0);
    QUIZ.idx++;
    if (QUIZ.idx >= QUIZ.qs.length) finishQuiz();
    else renderQuestion();
  });

  $("wvQuizAns").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $("wvQuizSend").click();
    }
  });

  async function submitAnswer() {
    var ans = $("wvQuizAns").value.trim();
    if (ans.length < 4) { toast("至少写一句，写错也比空着强"); return; }
    if (BUSY) return;
    BUSY = true;
    $("wvQuizSend").disabled = true;
    $("wvQuizSend").textContent = "判分中…";

    try {
      var r = await L.grade(cur, QUIZ.node, QUIZ.qs[QUIZ.idx], ans);
      QUIZ.scores.push(r.score);
      QUIZ.verdict = r;
      showVerdict(r);
      QUIZ.idx++;
      QUIZ.stage = "verdict";
      $("wvQuizSend").textContent = QUIZ.idx >= QUIZ.qs.length ? "看结果" : "下一问";
    } catch (e) {
      $("wvVerdict").hidden = false;
      $("wvVerdict").innerHTML = '<div class="wv-off">' + esc(friendly(e)) + "</div>";
      QUIZ.stage = "verdict";
      QUIZ.idx++;
      $("wvQuizSend").textContent = "跳过这一问";
    } finally {
      BUSY = false;
      $("wvQuizSend").disabled = false;
    }
  }

  function showVerdict(r) {
    var v = $("wvVerdict");
    v.hidden = false;
    /* 答完了就把输入框收起来，把地方让给判语 —— 否则卡片里三层内容挤在一起 */
    $("wvQuizAns").hidden = true;

    var band = r.score >= 75 ? "ok" : r.score >= PASS_MIN ? "mid" : "fail";
    var label = r.score >= 75 ? "这一问答得扎实" : r.score >= PASS_MIN ? "过了，但有漏" : "这一问没过";
    v.innerHTML =
      '<div class="sc ' + band + '"><b>' + r.score + "</b><i>" + label + "</i></div>" +
      (r.say ? '<p class="say">' + esc(r.say) + "</p>" : "") +
      r.hit.slice(0, 2).map(function (t) { return '<p class="pt hit"><em>答到</em>' + esc(t) + "</p>"; }).join("") +
      r.miss.slice(0, 3).map(function (t) { return '<p class="pt miss"><em>漏了</em>' + esc(t) + "</p>"; }).join("");
    $("wvQuizProg").style.width = (QUIZ.idx / QUIZ.qs.length * 100) + "%";

    /* 判分过程也在右栏留一条，方便回头对照自己答了什么 */
    if (cur && QUIZ.node) {
      say("第 " + (QUIZ.idx + 1) + " 问：" + r.score + " 分。" + (r.say || ""),
        r.miss.length ? "没答到：" + r.miss.join("、") : "");
    }
  }

  function nextQuestion() {
    if (!QUIZ) return;
    if (QUIZ.idx >= QUIZ.qs.length) return finishQuiz();
    renderQuestion();
  }

  function finishQuiz() {
    var n = QUIZ.node;
    var scores = QUIZ.scores;
    var avg = scores.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, scores.length);
    var min = Math.min.apply(null, scores.length ? scores : [0]);
    var pass = avg >= PASS_AVG && min >= PASS_MIN;
    var r = SAVE.nodes[n.id] || {};
    r.self = typeof r.self === "number" ? r.self : null;
    r.tries = (r.tries || 0) + 1;

    if (pass) {
      var newLv = Math.min(4, lvOf(n) + 1);
      r.lv = newLv; r.t = Date.now();
      SAVE.nodes[n.id] = r;
      persist();
      triggerFlash(n.id);
      QUIZ = null;
      showView("info");
      selectNode(n);
      renderProgress(); renderList(); draw();
      say("「" + n.name + "」亮了。现在是「" + LV_NAME[newLv] + "」。",
        "平均 " + Math.round(avg) + " 分。下次想升到「" + LV_NAME[Math.min(4, newLv + 1)] + "」，考的是更难的三问。");
    } else {
      SAVE.nodes[n.id] = r;
      persist();
      var v = $("wvVerdict");
      v.hidden = false;
      var ill = r.self === 2;
      v.innerHTML =
        '<div class="sc fail"><b>' + Math.round(avg) + "</b><i>平均分，没过</i></div>" +
        '<p class="say">过线要平均 ' + PASS_AVG + " 分，且没有一题低于 " + PASS_MIN + " 分。</p>" +
        (ill ? '<p class="pt miss"><em>注意</em>你考前说自己懂这盏。这一盏现在被标成错觉灯。</p>' : "") +
        '<p class="pt"><em>下一步</em>回去听一遍它的讲解，再考一次。题目会换。</p>';
      $("wvQuizSend").textContent = "再考一次";
      $("wvQuizSend").onclick = function () {
        $("wvQuizSend").onclick = null;
        startQuiz();
      };
      $("wvQuizProg").style.width = "100%";
      QUIZ = null;
      renderProgress(); renderList();
      say("这盏没过。" + (ill ? "你之前说自己懂，这就是错觉。" : ""),
        "平均 " + Math.round(avg) + " 分。回去听一遍，再考一次。");
    }
  }

  /* ---------------- 灯单 ---------------- */
  function renderList() {
    if (!cur) return;
    var box = $("wvList");

    if (findMode && findHits) {
      box.innerHTML = findHits.length
        ? findHits.map(function (h) {
            return '<button class="wv-item" type="button" data-sys="' + h.sys.id +
              '" data-id="' + h.node.id + '">' +
              '<span class="dot" style="background:' + LVC[lvOf(h.node)] + '"></span>' +
              '<span class="nm multi">' + esc(h.node.name) +
              '<span class="sub">' + esc(h.sys.name) + " · " + esc(h.why) + "</span></span></button>";
          }).join("")
        : '<div class="wv-empty">按这个意思没找到对应的灯。换个说法，或者直接新建一张图。</div>';
      return;
    }

    var list = cur.nodes.filter(function (n) {
      if (query) {
        var s = (n.name + " " + n.desc + " " + tagName(n.tag, cur.id)).toLowerCase();
        if (s.indexOf(query.toLowerCase()) < 0) return false;
      }
      if (filter === "lit" && !isLit(n)) return false;
      if (filter === "dark" && (isLit(n) || isIll(n))) return false;
      if (filter === "ill" && !isIll(n)) return false;
      if (filter === "dim" && !isDim(n)) return false;
      return true;
    });

    if (sortBy === "lv") {
      list.sort(function (a, b) { return lvOf(b) - lvOf(a) || a.name.localeCompare(b.name, "zh"); });
    } else if (sortBy === "tag") {
      list.sort(function (a, b) {
        return tagName(a.tag, cur.id).localeCompare(tagName(b.tag, cur.id), "zh") ||
          a.name.localeCompare(b.name, "zh");
      });
    } else {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, "zh"); });
    }

    box.innerHTML = list.length ? list.map(function (n) {
      var lv = lvOf(n);
      var cls = isIll(n) ? "dot ill" : isDim(n) ? "dot dim" : "dot";
      var style = isIll(n) || isDim(n) ? "" : 'style="background:' + LVC[lv] + '"';
      var flag = isIll(n) ? "错觉" : isDim(n) ? "需复燃" : (lv > 0 ? LV_NAME[lv] : "");
      return '<button class="wv-item" type="button" data-id="' + n.id + '"' +
        (selected && selected.id === n.id ? ' aria-current="true"' : "") + ">" +
        '<span class="' + cls + '" ' + style + "></span>" +
        '<span class="nm">' + esc(n.name) + "</span>" +
        '<span class="lv' + (isIll(n) ? " ill" : "") + '">' + flag + "</span></button>";
    }).join("") : '<div class="wv-empty">这一档还没有灯。把筛选切回「全部」看看。</div>';
  }

  $("wvList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]");
    if (!b) return;
    if (b.dataset.sys) {
      var s = findSys(b.dataset.sys);
      if (s) { enter(s.id); }
      return;
    }
    var n = cur.nodes.find(function (x) { return x.id === b.dataset.id; });
    if (n) {
      selectNode(n);
      centerOn(n);
      if (w.innerWidth <= 980) $("wvLeft").classList.remove("open");
    }
  });

  $("wvSearch").addEventListener("input", function (e) {
    query = e.target.value.trim();
    if (!query) { findMode = false; findHits = null; $("wvFindHead").hidden = true; }
    renderList();
  });

  $("wvAsk").addEventListener("click", semanticFind);
  $("wvSearch").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); semanticFind(); }
  });

  $("wvSorts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]");
    if (!b) return;
    sortBy = b.dataset.sort;
    b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
    b.setAttribute("aria-pressed", "true");
    renderList();
  });

  $("wvFilter").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    findMode = false; findHits = null; $("wvFindHead").hidden = true;
    b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
    b.setAttribute("aria-pressed", "true");
    renderList();
  });

  /* ---------------- 语义找灯（跨所有体系） ---------------- */
  async function semanticFind() {
    var q = $("wvSearch").value.trim();
    if (!q) { toast("先说一句你想找什么"); return; }
    if (!llmGate()) return;
    if (BUSY) return;
    BUSY = true;
    $("wvAsk").disabled = true;
    var head = $("wvFindHead");
    head.hidden = false;
    head.innerHTML = "正在按意思找「<b>" + esc(q) + "</b>」…";
    try {
      var hits = await L.find(allSys(), q);
      findMode = true;
      findHits = hits;
      head.innerHTML = hits.length
        ? "按意思找到 <b>" + hits.length + "</b> 盏 · <button type=\"button\" id=\"wvFindX\">回到灯单</button>"
        : "没找到 · <button type=\"button\" id=\"wvFindX\">回到灯单</button>";
      $("wvFindX").addEventListener("click", function () {
        findMode = false; findHits = null; head.hidden = true;
        $("wvSearch").value = ""; query = ""; renderList();
      });
      renderList();
      if (hits.length && w.innerWidth <= 980) $("wvLeft").classList.add("open");
    } catch (e) {
      head.innerHTML = '<span style="color:#a8543c">' + esc(friendly(e)) + "</span>";
    } finally {
      BUSY = false;
      $("wvAsk").disabled = false;
    }
  }

  /* ---------------- 进度条 ---------------- */
  function renderProgress() {
    if (!cur) return;
    var p = progress(cur);
    $("wvBarLit").style.width = (p.pct * 100) + "%";
    $("wvBarIll").style.width = (p.ill / Math.max(1, p.total) * 100) + "%";
    $("wvPct").textContent = Math.round(p.pct * 100) + "%";
    $("wvPct").title = "已燃 " + p.lit + " / " + p.total + "　错觉 " + p.ill;
  }

  /* ---------------- 体系切换 ---------------- */
  function renderPick() {
    var list = allSys();
    $("wvPickGrid").innerHTML = list.map(function (s, i) {
      var p = progress(s);
      return '<button type="button" class="wv-sys" data-sys="' + s.id + '">' +
        (s.tag === "own" ? '<span class="own">自建</span>' : "") +
        '<span class="n"><span>' + (i < 9 ? "0" : "") + (i + 1) + "</span><span>" + s.size + " 盏</span></span>" +
        "<h3>" + esc(s.name) + "</h3>" +
        '<div class="e">' + esc(s.en || "") + "</div>" +
        '<p class="note">' + esc(s.note || "") + "</p>" +
        '<span class="bar"><i style="width:' + (p.pct * 100).toFixed(0) + '%"></i></span>' +
        '<span class="pc">' + Math.round(p.pct * 100) + "% 已燃" +
        (p.ill ? " · " + p.ill + " 盏错觉" : "") + "</span></button>";
    }).join("") +
      '<button type="button" class="wv-sys" data-build="1">' +
      '<span class="n"><span>＋</span><span>NEW</span></span>' +
      "<h3>自己建一张</h3><div class=\"e\">YOUR OWN MAP</div>" +
      '<p class="note">给一个主题，守灯人把它拆成十来个知识点，连成一张图。什么学科都行。</p></button>';
  }

  $("wvPickGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sys],[data-build]");
    if (!b) return;
    if (b.dataset.build) { $("wvPickWrap").hidden = true; openBuild(); return; }
    enter(b.dataset.sys);
    $("wvPickWrap").hidden = true;
  });

  $("wvBtnPick").addEventListener("click", function () { renderPick(); $("wvPickWrap").hidden = false; });

  function enter(id) {
    var s = findSys(id) || allSys()[0];
    cur = s;
    SAVE.last = s.id; persist();
    if (s.tag !== "own") { /* 官方体系的数据在构建期已固定，只 layout 一次 */ }
    layout(s);
    selected = null; hovered = null; closeCard();
    findMode = false; findHits = null; $("wvFindHead").hidden = true;
    query = ""; $("wvSearch").value = "";
    filter = "all";
    $("wvFilter").querySelectorAll("button").forEach(function (x) {
      x.setAttribute("aria-pressed", x.dataset.f === "all" ? "true" : "false");
    });

    $("wvSysName").textContent = s.name;
    $("wvSysEn").textContent = s.en || "";
    $("wvWho").textContent = "守灯人";
    $("wvWhoSub").textContent = "讲解 · 出题 · 判分";

    clearTalk();
    bubble('<div>这是「<b>' + esc(s.name) + '</b>」，' + s.size + " 盏灯。<br>" +
      esc(s.core || "") + "</div>" +
      '<div class="note">灯不能自己点亮。点开一盏，我先讲，再考三问。</div>', "bot");

    renderList(); renderProgress();
    fit();
    closeDrawers();
  }

  /* ---------------- 复盘 ---------------- */
  $("wvBtnReview").addEventListener("click", openReview);

  function openReview() {
    if (!cur) return;
    var p = progress(cur);
    var byTag = {};
    cur.nodes.forEach(function (n) {
      var t = tagName(n.tag, cur.id);
      byTag[t] = byTag[t] || { s: 0, c: 0 };
      byTag[t].s += lvOf(n); byTag[t].c++;
    });
    var rows = Object.keys(byTag).map(function (k) {
      return { k: k, v: byTag[k].s / (byTag[k].c * 4) };
    }).sort(function (a, b) { return b.v - a.v; });

    var ill = cur.nodes.filter(isIll);
    var dim = cur.nodes.filter(isDim);
    var dark = cur.nodes.filter(function (n) { return !isLit(n) && !isIll(n); }).slice(0, 8);

    $("wvMTitle").textContent = cur.name + " · 复盘";
    $("wvMSub").textContent = "已燃 " + p.lit + " / " + p.total + " 盏　·　错觉 " + p.ill +
      " 盏　·　需复燃 " + dim.length + " 盏";

    $("wvMBody").innerHTML =
      "<h4>分组的掌握程度</h4>" +
      rows.map(function (r) {
        return '<div class="wv-tagrow"><span class="tn">' + esc(r.k) + "</span>" +
          '<span class="tb"><i style="width:' + (r.v * 100).toFixed(0) + '%"></i></span>' +
          '<span class="tp">' + (r.v * 100).toFixed(0) + "%</span></div>";
      }).join("") +

      "<h4 style='margin-top:24px'>错觉区</h4>" +
      (ill.length
        ? '<p class="bx-sub" style="margin:0 0 8px">你说自己懂、但没考过的灯。这里越多，越说明直觉不可靠。</p>' +
          '<div class="wv-weak">' + ill.map(function (n) {
            return '<button type="button" data-goto="' + n.id + '">' + esc(n.name) + "</button>";
          }).join("") + "</div>"
        : '<p class="bx-sub" style="margin:0">还没有。要么你没高估过自己，要么你考得太少。</p>') +

      "<h4 style='margin-top:24px'>该复燃的</h4>" +
      (dim.length
        ? '<div class="wv-weak">' + dim.map(function (n) {
            return '<button type="button" data-goto="' + n.id + '">' + esc(n.name) +
              "　" + LV_NAME[lvOf(n)] + "</button>";
          }).join("") + "</div>"
        : '<p class="bx-sub" style="margin:0">没有暗下去的灯。</p>') +

      "<h4 style='margin-top:24px'>还灭着的</h4>" +
      (dark.length
        ? '<div class="wv-weak">' + dark.map(function (n) {
            return '<button type="button" data-goto="' + n.id + '">' + esc(n.name) + "</button>";
          }).join("") + "</div>"
        : '<p class="bx-sub" style="margin:0">这一档都点完了。</p>') +

      "<h4 style='margin-top:24px'>重置</h4>" +
      '<button class="wv-btn" id="wvReset" type="button">把「' + esc(cur.name) + "」的进度清空</button>";

    $("wvModal").hidden = false;
  }

  $("wvMBody").addEventListener("click", function (e) {
    var g = e.target.closest("[data-goto]");
    if (g) {
      var n = cur.nodes.find(function (x) { return x.id === g.dataset.goto; });
      $("wvModal").hidden = true;
      if (n) { selectNode(n); centerOn(n); }
      return;
    }
    if (e.target.id === "wvReset") {
      cur.nodes.forEach(function (n) { delete SAVE.nodes[n.id]; });
      persist(); renderAll();
      $("wvModal").hidden = true;
      toast("已清空这张图的进度");
    }
  });

  $("wvMClose").addEventListener("click", function () { $("wvModal").hidden = true; });
  $("wvModal").addEventListener("click", function (e) {
    if (e.target === $("wvModal")) $("wvModal").hidden = true;
  });

  /* ---------------- 新建灯图 ---------------- */
  $("wvBtnBuild").addEventListener("click", function () { $("wvPickWrap").hidden = true; openBuild(); });

  function openBuild() {
    $("wvBuildWrap").hidden = false;
    $("wvBdStat").textContent = "";
    $("wvBdStat").className = "wv-bdstat";
    setTimeout(function () { $("wvBdTopic").focus(); }, 80);
  }

  $("wvBdCancel").addEventListener("click", function () { $("wvBuildWrap").hidden = true; });
  $("wvBuildWrap").addEventListener("click", function (e) {
    if (e.target === $("wvBuildWrap")) $("wvBuildWrap").hidden = true;
  });

  $("wvBdGo").addEventListener("click", async function () {
    var topic = $("wvBdTopic").value.trim();
    if (!topic) { $("wvBdStat").textContent = "先给一个主题。"; return; }
    if (!L.available()) {
      $("wvBdStat").className = "wv-bdstat bad";
      $("wvBdStat").textContent = L.why();
      return;
    }
    var btn = this;
    btn.disabled = true;
    $("wvBdStat").className = "wv-bdstat";
    $("wvBdStat").innerHTML = "守灯人正在拆「<b>" + esc(topic) + "</b>」，一般要十几秒…";
    try {
      var o = await L.build(topic, $("wvBdMat").value.trim());
      SAVE.own.push(o);
      persist();
      var sys = adoptOwn(o);
      OWNS.push(sys);
      $("wvBdStat").innerHTML = "建好了：<b>" + esc(o.name) + "</b>，" + o.nodes.length +
        " 盏灯，" + o.edges.length + " 条关系。";
      $("wvBdTopic").value = "";
      $("wvBdMat").value = "";
      setTimeout(function () {
        $("wvBuildWrap").hidden = true;
        enter(sys.id);
      }, 700);
    } catch (e) {
      $("wvBdStat").className = "wv-bdstat bad";
      $("wvBdStat").textContent = friendly(e);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- 自由追问 ---------------- */
  var history = [];

  async function ask(text) {
    if (!cur) return;
    if (!llmGate() || BUSY) return;
    bubble(esc(text), "me");
    history.push("用户：" + text);
    if (history.length > 6) history = history.slice(-6);

    var el = bubble(null, "bot", true);
    BUSY = true;
    lampOn(true);
    try {
      var out = await L.chat(cur, selected, history, function (d) { el.textContent += d; scrollTalk(); });
      el.classList.remove("busy");
      history.push("守灯人：" + out);
    } catch (e) {
      el.classList.remove("busy");
      el.innerHTML = '<div class="wv-off">' + esc(friendly(e)) + "</div>";
    } finally {
      BUSY = false;
      lampOn(false);
    }
  }

  $("wvSend").addEventListener("click", function () {
    var v = $("wvText").value.trim();
    if (!v) return;
    $("wvText").value = "";
    ask(v);
  });

  $("wvText").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("wvSend").click();
    }
  });

  $("wvChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fill]");
    if (!b) return;
    $("wvText").value = b.dataset.fill;
    $("wvText").focus();
  });

  /* ---------------- 顶栏与工具 ---------------- */
  /* 默认是紫黑那片星空。白天看东西的人点一下切到亮色，选择记在本地。 */
  var THEME_BTNS = ["wvBtnTheme", "wvBtnTheme2"];
  function paintThemeBtn() {
    var dark = themeName() === "dark";
    THEME_BTNS.forEach(function (id) {
      var b = $(id);
      if (!b) return;
      b.textContent = dark ? "☀" : "☾";
      b.title = dark ? "切到亮色" : "切到夜里";
    });
  }
  function toggleTheme() {
    var next = themeName() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("yc.weave.theme", next); } catch (e) {}
    paintThemeBtn();
    refreshColors();
    renderProgress();
    /* 卡片里的五档是写死的旧色，重画一遍 */
    if (selected) selectNode(selected);
    else { renderList(); draw(); }
    if (!$("wvPickWrap").hidden) renderPick();
  }
  THEME_BTNS.forEach(function (id) {
    var b = $(id);
    if (b) b.addEventListener("click", toggleTheme);
  });

  $("wvBtnLeft").addEventListener("click", function () {
    $("wvLeft").classList.toggle("open");
    $("wvRight").classList.remove("open");
  });
  $("wvBtnTalk").addEventListener("click", function () {
    $("wvRight").classList.toggle("open");
    $("wvLeft").classList.remove("open");
  });

  $("wvIn").addEventListener("click", function () {
    zoom = Math.min(2.4, zoom * 1.16);
    $("wvZoom").textContent = "×" + zoom.toFixed(2); draw();
  });
  $("wvOut").addEventListener("click", function () {
    zoom = Math.max(0.42, zoom / 1.16);
    $("wvZoom").textContent = "×" + zoom.toFixed(2); draw();
  });
  $("wvFit").addEventListener("click", fit);
  $("wvTier").addEventListener("click", function () {
    if (!cur) return;
    cur.nodes.forEach(function (n) { n._placed = false; });
    layout(cur); fit(); toast("已按先决深度重排");
  });

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function friendly(e) {
    var m = (e && e.message) || "";
    if (/^(sdk|no-model|all-disabled)$/.test(m)) return L.why() || "模型没连上。";
    if (m.indexOf("没有按格式回答") >= 0) return "模型这次没按格式回答，再点一次。";
    return m || "出错了，再试一次。";
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = document.getElementById("wvToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "wvToast";
      el.style.cssText = "position:fixed;left:50%;bottom:42px;transform:translateX(-50%);" +
        "background:#222b26;color:#f5f7ee;font-size:12px;padding:9px 16px;border-radius:6px;" +
        "z-index:90;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80vw";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = "0"; }, 2200);
  }

  function renderAll() {
    renderList();
    renderProgress();
    if (selected) selectNode(selected);
    draw();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    /* 主题在建任何东西之前已由 01-head 的内联脚本定好，这里只是把颜色读出来 */
    refreshColors();
    paintThemeBtn();

    /* 模型是异步的，失败不拦页面 —— 但要在右栏明说，不能装作没事 */
    L.init().catch(function () {
      bubble('<div class="wv-off">' + esc(L.why()) + "</div>", "bot");
    });

    var want = new URLSearchParams(location.search).get("sys");
    var firstTime = !want && !SAVE.last;
    var start = findSys(want) || findSys(SAVE.last) || allSys()[0];
    cur = start;
    layout(start);

    resize();
    enter(start.id);

    /* 第一次来（没有指定体系、也没有上次记录）就把选择页推到面前。
       注意不能在这里判断 SAVE.last —— enter() 已经把它写上了。 */
    if (firstTime) { renderPick(); $("wvPickWrap").hidden = false; }

    w.addEventListener("resize", function () {
      clearTimeout(boot._t);
      boot._t = setTimeout(resize, 120);
    });
  }

  /* 这是 body 里最后一个脚本，DOM 已经齐了，直接起。
     不挂 DOMContentLoaded —— 那个要等 defer 的云 SDK，
     SDK 慢一点整页就白在那儿，谁也不知道发生了什么。
     SDK 没到位由 L.init() 自己等、自己说。 */
  if ($("wvPickWrap") && $("wvCv")) boot();
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);

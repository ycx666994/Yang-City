/* ============================================================
   织识 · 应用逻辑（纯前端，无请求）
   ------------------------------------------------------------
   四块：布局 → 绘制 → 交互 → 守灯人。
   所有状态（每个知识点到了第几级）存在 localStorage，不上传。
   ------------------------------------------------------------ */
(function () {
  "use strict";

  var D = window.YC_WEAVE;
  if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  var SYS = D.systems;
  var KEY = "yc.weave.v1";

  /* ---------------- 状态 ---------------- */
  var save = {};
  try { save = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { save = {}; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
  }

  var LV_NAME = ["未燃", "引燃", "微明", "炽亮", "鎏辉"];
  var LV_COLOR = ["#c3cab7", "#cda86b", "#d3a33e", "#e0ab34", "#f0bd3e"];
  var TAG_NAME = {
    core: "基本判断", use: "日常使用", edge: "边界", work: "工作流",
    infer: "推断", repr: "表示", attn: "注意力", train: "训练", limit: "局限", deploy: "部署",
    write: "写法", iter: "迭代", material: "材料", team: "协作",
    metric: "指标", data: "数据", stat: "统计", human: "人工", ops: "上线", report: "结论",
    base: "基础", trap: "陷阱", method: "方法",
    memory: "记忆", think: "思考", bias: "偏差", meta: "元认知"
  };

  var cur = null;          // 当前体系
  var selected = null;     // 选中节点
  var hovered = null;
  var pan = { x: 0, y: 0 };
  var zoom = 1;
  var sortBy = "name";
  var query = "";

  function lvOf(n) {
    return save[n.id] === undefined ? n.lv : save[n.id];
  }
  function setLv(n, v) {
    save[n.id] = Math.max(0, Math.min(4, v));
    persist();
  }
  function progress(sys) {
    var sum = 0;
    sys.nodes.forEach(function (n) { sum += lvOf(n); });
    return sys.nodes.length ? sum / (sys.nodes.length * 4) : 0;
  }

  /* ---------------- 布局 ----------------
     层次按 BFS 最短路径算，不按最长路径：最长路径会把「谁先谁后」拉成
     一条竖线，一层只剩一两个节点，整张图变成一列。
     pre 边算不到的节点（只挂了 rel），借它最近的相关邻居的层 +1，
     否则它们会被统一丢到最后一行，看着像一片没人管的散点。 */
  function layout(sys) {
    var nodes = sys.nodes, pres = sys.edges.filter(function (e) { return e.k === "pre"; });
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

    /* 第二遍：只挂 rel 的节点，贴着邻居的层 */
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
    nodes.forEach(function (n) {
      var d = depth[n.id];
      (rows[d] = rows[d] || []).push(n);
    });

    /* 层内排布：一行最多 6 个，多的折到第二排。
       AI 素养有一层挤了 10 个节点，一行铺开要 1450 米宽，整张图被迫缩到 0.5 倍，
       什么字都看不清。折成两排之后同样的节点占一半宽度，字就回来了。 */
    var posX = {};
    var keys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    var GAP = 158;

    keys.forEach(function (d) {
      var row = rows[d];
      if (d > 0) row.sort(function (a, b) { return upX(a) - upX(b); });
      var cols = row.length > 6 ? Math.ceil(row.length / 2) : row.length;
      var w = (cols - 1) * GAP;
      row.forEach(function (n, idx) {
        n._sub = Math.floor(idx / cols);
        n.tx = (idx % cols) * GAP - w / 2;
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
        n.ty -= off;
        n._d = d;
        if (!n._placed) { n.px = n.tx; n.py = n.ty; n._placed = true; }
      });
    });

    function upX(n) {
      var ps = pres.filter(function (e) { return e.t === n.id; }).map(function (e) {
        return posX[e.s];
      }).filter(function (v) { return v !== undefined; });
      return ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : 0;
    }
  }

  /* ---------------- 画布 ---------------- */
  var cv = $("wvCv"), ctx = cv.getContext("2d");
  var W = 0, H = 0, dpr = 1;

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    draw();
  }

  function toWorld(sx, sy) {
    return { x: (sx - W / 2 - pan.x) / zoom, y: (sy - H / 2 - pan.y) / zoom };
  }
  function radius(n) { return 11 + n.w * 5.5; }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!cur) return;

    /* 细网格：跟着视图走，缩小时不至于变成一张噪点纸 */
    var step = 44 * zoom;
    if (step > 10) {
      ctx.strokeStyle = "rgba(190,199,182,.32)";
      ctx.lineWidth = 1;
      var ox = (W / 2 + pan.x) % step, oy = (H / 2 + pan.y) % step;
      ctx.beginPath();
      for (var x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);

    var byId = {};
    cur.nodes.forEach(function (n) { byId[n.id] = n; });

    /* --- 边 --- */
    cur.edges.forEach(function (e) {
      var a = byId[e.s], b = byId[e.t];
      if (!a || !b) return;
      var hot = selected && (e.s === selected.id || e.t === selected.id);
      var lit = lvOf(a) >= 2 && lvOf(b) >= 2;
      /* 跨三层以上的「相关」边不画：它只会拉出一条横贯全图的长斜线，
         把结构读成一个蜘蛛网。选中节点时例外——那时它是有用的线索。 */
      if (e.k === "rel" && !hot && Math.abs((a._d || 0) - (b._d || 0)) >= 3) return;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      /* 轻微弧线：直线在密集处会糊成一团，弧一点能看清走向 */
      var mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
      var dx = b.px - a.px, dy = b.py - a.py;
      var bend = 0.055;
      ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, b.px, b.py);
      if (e.k === "pre") {
        ctx.setLineDash([]);
        ctx.strokeStyle = hot ? "rgba(63,95,74,.75)" : lit ? "rgba(192,138,51,.42)" : "rgba(150,163,146,.38)";
        ctx.lineWidth = hot ? 1.7 : 1.15;
      } else if (e.k === "rel") {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = hot ? "rgba(63,95,74,.6)" : "rgba(150,163,146,.34)";
        ctx.lineWidth = hot ? 1.4 : 1;
      } else {
        ctx.setLineDash([1, 4]);
        ctx.strokeStyle = "rgba(150,163,146,.3)";
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* --- 节点 --- */
    cur.nodes.forEach(function (n) {
      var lv = lvOf(n), r = radius(n);
      var isSel = selected && selected.id === n.id;
      var isHot = hovered && hovered.id === n.id;

      if (lv > 0) {
        /* 点亮的灯有光。光晕半径随等级涨，这是「鎏辉」和「炽亮」的唯一区别 */
        ctx.save();
        ctx.shadowColor = "rgba(232,182,74," + (0.28 + lv * 0.13) + ")";
        ctx.shadowBlur = 8 + lv * 7;
        ctx.beginPath();
        ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
        ctx.fillStyle = LV_COLOR[lv];
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
        ctx.fillStyle = LV_COLOR[0];
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
      ctx.strokeStyle = isSel ? "#3f5f4a" : lv > 0 ? "rgba(160,110,30,.5)" : "#a9b1a3";
      ctx.lineWidth = isSel ? 2.4 : 1.2;
      ctx.stroke();

      if (isSel || isHot) {
        ctx.beginPath();
        ctx.arc(n.px, n.py, r + (isSel ? 5.5 : 4), 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? "rgba(63,95,74,.5)" : "rgba(63,95,74,.22)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      /* 标签 */
      ctx.font = (lv > 0 ? "500 " : "400 ") + "13px \"Microsoft YaHei\",\"PingFang SC\",sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isSel ? "#1b241e" : lv > 0 ? "#2b352e" : "#68766b";
      ctx.fillText(n.name, n.px, n.py + r + 8);
    });

    ctx.restore();
  }

  /* ---------------- 命中 ---------------- */
  function hitTest(sx, sy) {
    if (!cur) return null;
    var w = toWorld(sx, sy), best = null, bestD = 1e9;
    cur.nodes.forEach(function (n) {
      var d = Math.hypot(n.px - w.x, n.py - w.y);
      var rr = radius(n) + 6 / zoom;
      if (d < rr && d < bestD) { best = n; bestD = d; }
    });
    return best;
  }

  /* ---------------- 鼠标 / 触摸 ---------------- */
  var drag = null;

  function localXY(e) {
    var r = cv.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  function onDown(e) {
    if (!cur) return;
    var p = localXY(e);
    var n = hitTest(p.x, p.y);
    drag = { n: n, x: p.x, y: p.y, px: n ? n.px : 0, py: n ? n.py : 0, panx: pan.x, pany: pan.y, moved: 0 };
    cv.classList.add("grabbing");
    if (e.cancelable) e.preventDefault();
  }

  function onMove(e) {
    if (!cur) return;
    var p = localXY(e);
    if (!drag) {
      var h = hitTest(p.x, p.y);
      if (h !== hovered) {
        hovered = h;
        cv.classList.toggle("hot", !!h);
        draw();
      }
      return;
    }
    var dx = p.x - drag.x, dy = p.y - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.n) {
      drag.n.px = drag.px + dx / zoom;
      drag.n.py = drag.py + dy / zoom;
    } else {
      pan.x = drag.panx + dx;
      pan.y = drag.pany + dy;
    }
    draw();
  }

  function onUp(e) {
    if (!drag) return;
    var d = drag; drag = null;
    cv.classList.remove("grabbing");
    if (d.moved < 5) {
      if (d.n) selectNode(d.n);
      else { selected = null; closeCard(); draw(); }
      /* 窄屏：手指落在画布上就把两侧抽屉收掉，把画面还给灯图 */
      if (window.innerWidth <= 980) {
        $("wvLeft").classList.remove("open");
        $("wvRight").classList.remove("open");
      }
    }
  }

  cv.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  cv.addEventListener("touchstart", onDown, { passive: false });
  cv.addEventListener("touchmove", function (e) {
    if (drag) { if (e.cancelable) e.preventDefault(); onMove(e); }
  }, { passive: false });
  cv.addEventListener("touchend", onUp);
  cv.addEventListener("dblclick", function (e) {
    var p = localXY(e), n = hitTest(p.x, p.y);
    if (n) { bump(n); }
  });
  cv.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = localXY(e), before = toWorld(p.x, p.y);
    zoom = Math.max(0.35, Math.min(2.3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    var after = toWorld(p.x, p.y);
    pan.x += (after.x - before.x) * zoom;
    pan.y += (after.y - before.y) * zoom;
    updateZoomLabel();
    draw();
  }, { passive: false });

  function bump(n) {
    var v = (lvOf(n) + 1) % 5;
    setLv(n, v);
    renderAll();
    toast(n.name + " → " + LV_NAME[v]);
  }

  /* ---------------- 节点卡片 ---------------- */
  var card = $("wvCard");

  function selectNode(n) {
    selected = n;
    $("wvCardTag").textContent = TAG_NAME[n.tag] || n.tag;
    $("wvCardDepth").textContent = "";
    $("wvCardName").textContent = n.name;
    $("wvCardDesc").textContent = n.desc;
    renderLvs();
    card.classList.add("on");
    renderList();
    draw();
  }
  function closeCard() { card.classList.remove("on"); }

  function renderLvs() {
    if (!selected) return;
    var cur0 = lvOf(selected);
    $("wvLvLab").textContent = "掌握度 · " + LV_NAME[cur0];
    $("wvLvs").innerHTML = LV_NAME.map(function (nm, i) {
      return '<button type="button" data-lv="' + i + '" aria-pressed="' + (i === cur0) + '">' +
        nm + "</button>";
    }).join("");
  }

  $("wvLvs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-lv]");
    if (!b || !selected) return;
    setLv(selected, Number(b.dataset.lv));
    renderAll();
  });
  $("wvCardX").addEventListener("click", function () {
    selected = null; closeCard(); draw(); renderList();
  });
  $("wvCardAsk").addEventListener("click", function () {
    if (!selected) return;
    ask("解释一下「" + selected.name + "」", false);
  });
  $("wvCardPath").addEventListener("click", function () {
    if (!selected) return;
    ask("规划一条到「" + selected.name + "」的路径", false);
  });

  /* ---------------- 左栏 ---------------- */
  function renderList() {
    if (!cur) return;
    var list = cur.nodes.slice();
    var q = query.trim();
    if (q) list = list.filter(function (n) { return n.name.indexOf(q) >= 0 || n.desc.indexOf(q) >= 0; });
    if (sortBy === "lv") list.sort(function (a, b) { return lvOf(a) - lvOf(b); });
    else if (sortBy === "tag") list.sort(function (a, b) { return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0; });
    else list.sort(function (a, b) { return a.name.localeCompare(b.name, "zh"); });

    if (!list.length) {
      $("wvList").innerHTML = '<p class="wv-empty">没有匹配的灯。<br>换个词，或者把它当作一张白纸，从别的方向找找。</p>';
      return;
    }
    $("wvList").innerHTML = list.map(function (n) {
      var lv = lvOf(n);
      return '<button type="button" class="wv-item" data-id="' + n.id + '"' +
        (selected && selected.id === n.id ? ' aria-current="true"' : "") + ">" +
        '<span class="dot" style="background:' + LV_COLOR[lv] + '"></span>' +
        '<span class="nm">' + esc(n.name) + "</span>" +
        '<span class="lv">' + LV_NAME[lv] + "</span></button>";
    }).join("");
  }

  $("wvList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]");
    if (!b) return;
    var n = cur.nodes.find(function (x) { return x.id === b.dataset.id; });
    if (n) { selectNode(n); centerOn(n); }
    /* 窄屏时灯单是盖住画布的抽屉，选完必须收起来，否则详情卡被压在抽屉下面 */
    if (window.innerWidth <= 980) $("wvLeft").classList.remove("open");
  });

  $("wvSearch").addEventListener("input", function (e) { query = e.target.value; renderList(); });
  $("wvSorts").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sort]");
    if (!b) return;
    sortBy = b.dataset.sort;
    Array.prototype.forEach.call($("wvSorts").children, function (x) {
      x.setAttribute("aria-pressed", String(x === b));
    });
    renderList();
  });

  function centerOn(n) {
    pan.x = -n.px * zoom;
    pan.y = -n.py * zoom;
    draw();
  }

  /* ---------------- 进度条 ---------------- */
  function renderProgress() {
    var p = progress(cur);
    var segs = 20, on = Math.round(p * segs);
    var html = "";
    for (var i = 0; i < segs; i++) html += "<i" + (i < on ? ' class="on"' : "") + "></i>";
    $("wvSeg").innerHTML = html;
    $("wvPct").textContent = (p * 100).toFixed(0) + "%";
  }

  function updateZoomLabel() { $("wvZoom").textContent = "×" + zoom.toFixed(2); }

  /* ---------------- 显示提示 ---------------- */
  var toastEl = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);" +
        "background:#222b26;color:#f5f7ee;font-size:12px;padding:8px 15px;border-radius:16px;" +
        "z-index:80;opacity:0;transition:opacity .2s;pointer-events:none";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.opacity = "0"; }, 1400);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /* ---------------- 守灯人 ----------------
     没有后端，也不打算假装有。它做的事是「拿着这张图追问你」：
     认节点、找路径、挑薄弱、做统计。回答全部由本地数据和规则拼出，
     所以离线可用，也不会编出一个图里没有的知识点。 */
  var talk = $("wvTalk");

  function say(text, me, extra) {
    var d = document.createElement("div");
    d.className = "wv-msg " + (me ? "me" : "bot");
    d.innerHTML = text + (extra || "");
    talk.appendChild(d);
    talk.scrollTop = talk.scrollHeight;
  }

  function lampOn() { $("wvLamp").classList.add("on"); }

  function findNode(text) {
    if (!cur) return null;
    var best = null;
    cur.nodes.forEach(function (n) {
      if (text.indexOf(n.name) >= 0 && (!best || n.name.length > best.name.length)) best = n;
    });
    return best;
  }

  function parentsOf(n) {
    return cur.edges.filter(function (e) { return e.t === n.id && e.k === "pre"; })
      .map(function (e) { return cur.nodes.find(function (x) { return x.id === e.s; }); })
      .filter(Boolean);
  }
  function childrenOf(n) {
    return cur.edges.filter(function (e) { return e.s === n.id && e.k === "pre"; })
      .map(function (e) { return cur.nodes.find(function (x) { return x.id === e.t; }); })
      .filter(Boolean);
  }

  function about(n, learned) {
    var lv = lvOf(n), ps = parentsOf(n), cs = childrenOf(n);
    var head = lv === 0
      ? "这盏还灭着。<b>" + esc(n.name) + "</b>：" + esc(n.desc)
      : "这盏在<b>" + LV_NAME[lv] + "</b>。你说的是这盏，那我先不重复它的定义。";
    var body = "";

    if (learned) {
      body += '<span class="q">用一句话说清：它在什么情况下<b>不成立</b>？</span>';
      body += "答得上来，这盏可以再往上提一档；答不上来，它其实就是「看过」，不是「会」。";
    } else {
      body += esc(n.desc);
    }

    if (ps.length) {
      body += '<span class="q">它压在上面这 ' + ps.length + " 盏上：</span>" +
        ps.map(function (p) { return esc(p.name) + "（" + LV_NAME[lvOf(p)] + "）"; }).join("、");
    }
    if (cs.length) {
      body += "懂到这里，往下能推开：" + cs.slice(0, 4).map(function (c) { return esc(c.name); }).join("、") +
        (cs.length > 4 ? "…" : "") + "。";
    }

    say(head + "<br><br>" + body,
      false,
      '<span class="sug"><button data-fill="我刚才学了「' + esc(n.name) + '」">我刚学了这盏</button>' +
      (cs.length ? '<button data-fill="规划一条到「' + esc(cs[0].name) + '」的路径">往下走</button>' : "") +
      "</span>");
    return true;
  }

  function pathTo(n) {
    /* 沿 pre 边从根做 BFS，找回一条最短的先决链 */
    var prev = {}, seen = {}, q = [], root = cur.nodes.find(function (x) { return x.key === "root"; });
    var start = root || cur.nodes[0];
    q.push(start.id); seen[start.id] = 1;
    while (q.length) {
      var id = q.shift();
      if (id === n.id) break;
      cur.edges.filter(function (e) { return e.s === id && e.k === "pre"; }).forEach(function (e) {
        if (!seen[e.t]) { seen[e.t] = 1; prev[e.t] = id; q.push(e.t); }
      });
    }
    if (!seen[n.id]) return null;
    var chain = [], c = n.id;
    while (c) { chain.unshift(cur.nodes.find(function (x) { return x.id === c; })); c = prev[c]; }
    return chain;
  }

  function doPath(n) {
    var chain = pathTo(n);
    if (!chain) {
      say("沿先决边找不到一条到「" + esc(n.name) + "」的链。它可能挂在这张图的旁支上——先看它上游那几盏。");
      return;
    }
    var done = chain.filter(function (x) { return lvOf(x) >= 2; }).length;
    var lines = chain.map(function (x, i) {
      var lv = lvOf(x);
      return (i + 1) + ". " + esc(x.name) + "　" + LV_NAME[lv] +
        (lv >= 2 ? " ✓" : lv === 1 ? " ← 刚起头" : " ← 全灭");
    }).join("<br>");
    say("到「" + esc(n.name) + "」一共 " + chain.length + " 盏，其中 " + done + " 盏已经到了「微明」以上。<br><br>" +
      lines + '<span class="q">断点在第一条不是「微明」的地方。先把那一盏说清，别跳。</span>');
  }

  function doQuiz() {
    var weak = cur.nodes.slice().sort(function (a, b) { return lvOf(a) - lvOf(b); })
      .filter(function (n) { return lvOf(n) < 3; }).slice(0, 3);
    if (!weak.length) {
      say("这张图基本亮了。要我挑，就挑最靠上的那几盏——越靠上，越容易自以为懂。");
      return;
    }
    var qs = weak.map(function (n, i) {
      var p = parentsOf(n)[0];
      return (i + 1) + ". 「" + esc(n.name) + "」" +
        (p ? "和它上游的「" + esc(p.name) + "」是什么关系？少了上游会怎样？" : "在什么情况下会失效？");
    }).join("<br>");
    say("三道，挑你没把握的答：<br><br>" + qs +
      '<span class="q">不用发给我。答完之后自己打开那盏灯看说明，对不上的地方就是缺口。</span>');
  }

  function doAnalyze() {
    var byTag = {}, total = 0, full = 0;
    cur.nodes.forEach(function (n) {
      var lv = lvOf(n), t = TAG_NAME[n.tag] || n.tag;
      byTag[t] = byTag[t] || { s: 0, c: 0 };
      byTag[t].s += lv; byTag[t].c++;
      total += lv;
      if (lv === 4) full++;
    });
    var arr = Object.keys(byTag).map(function (k) {
      return { k: k, v: byTag[k].s / (byTag[k].c * 4) };
    }).sort(function (a, b) { return b.v - a.v; });
    var strong = arr[0], weak = arr[arr.length - 1];
    var pct = (total / (cur.nodes.length * 4) * 100).toFixed(0);

    say("这张图现在 <b>" + pct + "%</b>。" + cur.nodes.length + " 盏里，" + full + " 盏到了鎏辉。<br><br>" +
      "最稳的是<b>" + esc(strong.k) + "</b>（" + (strong.v * 100).toFixed(0) + "%），" +
      "最空的是<b>" + esc(weak.k) + "</b>（" + (weak.v * 100).toFixed(0) + "%）。" +
      '<span class="q">差距这么大的时候，别去补最弱的——先去补「最弱那一组的上游」。上游灭着，下游点不亮。</span>');
  }

  function doWeak() {
    var weak = cur.nodes.slice().sort(function (a, b) { return lvOf(a) - lvOf(b); })
      .filter(function (n) { return lvOf(n) < 2; }).slice(0, 5);
    if (!weak.length) { say("没有低于「微明」的灯了。这时候该做的是回头讲一遍，不是往前加。"); return; }
    say("最暗的五盏：<br><br>" + weak.map(function (n, i) {
      return (i + 1) + ". " + esc(n.name) + "　" + LV_NAME[lvOf(n)];
    }).join("<br>") + '<span class="q">挑一盏，用一句你自己的话讲它。讲不顺，就是还没懂。</span>');
  }

  function guide() {
    say("我在。<br>你可以直接说「我刚学了「某个名字」」，我来追问；也可以让我规划路径、挑薄弱、做统计。" +
      '<span class="sug">' +
      '<button data-fill="考考我，挑最弱的">考我</button>' +
      '<button data-fill="帮我分析一下我的掌握情况">分析我</button>' +
      '<button data-fill="规划一条到「">规划路径</button></span>');
  }

  function respond(text) {
    var t = text.trim();
    if (!t) return;
    if (/分析|画像|统计|学得怎么样|掌握情况/.test(t)) return doAnalyze();
    if (/复盘|薄弱|最弱|最差/.test(t)) return doWeak();
    if (/考我|考考|测验|出题|测一下/.test(t)) return doQuiz();
    var n = findNode(t);
    if (n) {
      if (/路径|怎么走|先学什么|怎么学到|规划/.test(t)) return doPath(n);
      return about(n, /学了|刚学|学到|看了|懂了/.test(t));
    }
    if (/路径|怎么走|先学什么|规划/.test(t)) {
      var root = cur.nodes.find(function (x) { return x.key === "root"; }) || cur.nodes[0];
      say("从「" + esc(root.name) + "」往下走，先把它说清楚，再挑它下游任意一盏。<br>" +
        '<span class="q">具体要去哪一盏？告诉我名字，我给你排顺序。</span>');
      return;
    }
    guide();
  }

  function ask(text, echo) {
    if (echo !== false) say(esc(text), true);
    $("wvText").value = "";
    setTimeout(function () { respond(text); }, 220);
  }

  $("wvSend").addEventListener("click", function () {
    var v = $("wvText").value;
    if (v.trim()) ask(v);
  });
  $("wvText").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      var v = $("wvText").value;
      if (v.trim()) ask(v);
    }
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fill]");
    if (!b) return;
    var s = b.dataset.fill;
    if (s.slice(-1) === "「") {
      $("wvText").value = s;
      $("wvText").focus();
    } else {
      ask(s);
    }
  });

  /* ---------------- 复盘 ---------------- */
  function openReview() {
    var p = progress(cur) * 100;
    var byTag = {};
    cur.nodes.forEach(function (n) {
      var t = TAG_NAME[n.tag] || n.tag;
      byTag[t] = byTag[t] || { s: 0, c: 0 };
      byTag[t].s += lvOf(n); byTag[t].c++;
    });
    var rows = Object.keys(byTag).map(function (k) {
      return { k: k, v: byTag[k].s / (byTag[k].c * 4) };
    }).sort(function (a, b) { return b.v - a.v; });

    var weak = cur.nodes.slice().sort(function (a, b) { return lvOf(a) - lvOf(b); })
      .filter(function (n) { return lvOf(n) < 2; }).slice(0, 6);

    $("wvMTitle").textContent = cur.name + " · 复盘";
    $("wvMSub").textContent = "总进度 " + p.toFixed(0) + "%　·　" + cur.nodes.length +
      " 盏灯，其中 " + cur.nodes.filter(function (n) { return lvOf(n) >= 2; }).length + " 盏已过微明";

    $("wvMBody").innerHTML =
      "<h4>分组</h4>" +
      rows.map(function (r) {
        return '<div class="wv-tagrow"><span class="tn">' + esc(r.k) + '</span>' +
          '<span class="tb"><i style="width:' + (r.v * 100).toFixed(0) + '%"></i></span>' +
          '<span class="tp">' + (r.v * 100).toFixed(0) + "%</span></div>";
      }).join("") +
      "<h4 style='margin-top:22px'>还灭着的</h4>" +
      (weak.length
        ? '<div class="wv-weak">' + weak.map(function (n) {
            return '<button data-goto="' + n.id + '">' + esc(n.name) + "</button>";
          }).join("") + "</div>"
        : '<p class="bx-sub" style="margin:0">这张图全亮了。</p>') +
      "<h4 style='margin-top:24px'>重置</h4>" +
      '<button class="wv-btn" id="wvReset" type="button">把「' + esc(cur.name) + "」的进度清回初始</button>";

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
      cur.nodes.forEach(function (n) { delete save[n.id]; });
      persist(); renderAll();
      $("wvModal").hidden = true;
      toast("已重置为初始进度");
    }
  });

  $("wvBtnReview").addEventListener("click", openReview);
  $("wvMClose").addEventListener("click", function () { $("wvModal").hidden = true; });
  $("wvModal").addEventListener("click", function (e) {
    if (e.target === $("wvModal")) $("wvModal").hidden = true;
  });

  /* ---------------- 体系切换 ---------------- */
  function openPick() {
    $("wvPickGrid").innerHTML = SYS.map(function (s, i) {
      var p = progress(s) * 100;
      return '<button type="button" class="wv-sys" data-sys="' + s.id + '">' +
        '<span class="n"><span>' + (i < 9 ? "0" : "") + (i + 1) + "</span><span>" +
          s.nodes.length + " 盏</span></span>" +
        "<h3>" + esc(s.name) + "</h3>" +
        '<div class="e">' + esc(s.en) + "</div>" +
        '<p class="note">' + esc(s.note) + "</p>" +
        '<span class="bar"><i style="width:' + p.toFixed(0) + '%"></i></span>' +
        '<span class="pc">' + p.toFixed(0) + "% 已点亮</span></button>";
    }).join("");
    $("wvPickWrap").hidden = false;
  }

  $("wvPickGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sys]");
    if (!b) return;
    enter(b.dataset.sys);
    $("wvPickWrap").hidden = true;
  });
  $("wvBtnPick").addEventListener("click", openPick);

  /* ---------------- 进入体系 ---------------- */
  function enter(id) {
    var s = SYS.find(function (x) { return x.id === id; }) || SYS[0];
    cur = s;
    selected = null; hovered = null;
    closeCard();
    if (!s._laid) { layout(s); s._laid = true; }
    else s.nodes.forEach(function (n) { if (n.px === undefined) { n.px = n.tx; n.py = n.ty; } });

    $("wvSysName").textContent = s.name;
    $("wvSysEn").textContent = s.en + " · " + s.nodes.length + " 盏";
    try { localStorage.setItem("yc.weave.last", s.id); } catch (e) {}
    renderAll();
    fitView();

    talk.innerHTML = "";
    say("<b>" + esc(s.name) + "</b> —— " + esc(s.core || s.note));
    say("先看图上最暗的那几盏。点一盏，我陪你把它说清楚；也可以先让我<b>考考你</b>，看看哪里是假的会。");
    lampOn();
  }

  /* ---------------- 视图复位 ---------------- */
  function fitView() {
    if (!cur) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cur.nodes.forEach(function (n) {
      minX = Math.min(minX, n.px - 90); maxX = Math.max(maxX, n.px + 90);
      minY = Math.min(minY, n.py - 40); maxY = Math.max(maxY, n.py + 44);
    });
    var w = maxX - minX, h = maxY - minY;
    var pad = 34;
    /* 下限 0.72：全图塞进画布的代价是字号掉到 7px，谁也读不清。
       宁可让图稍微超出画布、让人拖一下，也要先看清每盏灯叫什么。 */
    zoom = Math.max(0.72, Math.min(1.2, Math.min((W - pad * 2) / w, (H - pad * 2) / h)));
    pan.x = -((minX + maxX) / 2) * zoom;
    pan.y = -((minY + maxY) / 2) * zoom;
    updateZoomLabel();
    draw();
  }

  $("wvIn").addEventListener("click", function () { zoom = Math.min(2.3, zoom * 1.18); updateZoomLabel(); draw(); });
  $("wvOut").addEventListener("click", function () { zoom = Math.max(0.35, zoom / 1.18); updateZoomLabel(); draw(); });
  $("wvFit").addEventListener("click", fitView);
  $("wvTier").addEventListener("click", function () {
    cur.nodes.forEach(function (n) { n.px = n.tx; n.py = n.ty; });
    fitView();
    toast("按先决深度重排");
  });

  /* ---------------- 移动端抽屉 ---------------- */
  $("wvBtnLeft").addEventListener("click", function () { $("wvLeft").classList.toggle("open"); });
  $("wvBtnTalk").addEventListener("click", function () { $("wvRight").classList.toggle("open"); });

  /* ---------------- 汇总重绘 ---------------- */
  function renderAll() {
    renderProgress();
    renderList();
    if (selected) renderLvs();
    draw();
  }

  /* ---------------- 启动 ---------------- */
  window.addEventListener("resize", resize);
  resize();

  var last = null;
  try { last = localStorage.getItem("yc.weave.last"); } catch (e) {}
  if (last && SYS.some(function (s) { return s.id === last; })) {
    $("wvPickWrap").hidden = true;
    enter(last);
  } else {
    $("wvPickWrap").hidden = false;
    openPick();
    /* 没进体系时画布是空的，但进度条与顶栏仍需一个占位 */
    $("wvSysName").textContent = "选一张灯图";
    $("wvSysEn").textContent = "6 套体系 · 110 盏灯";
  }
})();

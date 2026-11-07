/* YC3D · 实体博物馆建筑部件，材质接受场景天光与环境反射。 */
(function (global) {
  "use strict";
  var THREE = global.THREE, Y = global.YC3D, B = global.YC3D_B;
  if (!THREE || !Y || !B) return;
  var P = {};

  P.matStone = function (o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      color: o.base === undefined ? 0xf1f0ec : o.base,
      roughness: o.roughness === undefined ? 0.58 : o.roughness,
      metalness: o.metalness === undefined ? 0.02 : o.metalness,
      side: o.side === undefined ? THREE.FrontSide : o.side
    });
  };
  P.matFloor = function (o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      color: o.base === undefined ? 0xe1e5e5 : o.base,
      roughness: o.roughness === undefined ? 0.29 : o.roughness, metalness: 0.08
    });
  };
  P.matGold = function () {
    return new THREE.MeshStandardMaterial({ color: 0xc3a46b, metalness: 0.82, roughness: 0.27 });
  };
  P.matGlass = function () {
    return new THREE.MeshPhysicalMaterial({
      color: 0x679fc3, metalness: 0, roughness: 0.12,
      transparent: true, opacity: 0.22, transmission: 0.38,
      thickness: 0.16, ior: 1.46, side: THREE.DoubleSide, depthWrite: false
    });
  };
  function box(g, w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  }

  /* 实体文字板：不透明底色、深色字、非加法混合。 */
  P.label = function (o) {
    o = o || {};
    var w = o.w || 4.2, h = o.h || 1.3;
    var cv = document.createElement("canvas");
    cv.width = o.px || 1024; cv.height = Math.round(cv.width * h / w);
    var c = cv.getContext("2d"), W = cv.width, H = cv.height;
    c.fillStyle = o.background || "#f5f6f2"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#b49965"; c.lineWidth = Math.max(2, H * 0.012);
    c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = "#172d40"; c.textAlign = "left"; c.textBaseline = "middle";
    var inset = W * 0.055;
    function line(text, y, size, weight) {
      c.font = weight + " " + Math.round(size) + "px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      c.fillText(text || "", inset, H * y, W - inset * 2);
    }
    if (o.kicker) line(o.kicker, 0.19, H * 0.13, "500");
    line(o.title || o.text, o.sub ? 0.47 : 0.52, H * (o.sub ? 0.26 : 0.37), "700");
    if (o.sub) line(o.sub, 0.78, H * 0.15, "400");
    var texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    var g = new THREE.Group();
    box(g, w + 0.08, h + 0.08, 0.12, 0, 0, -0.075, P.matGold());
    var face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, toneMapped: false }));
    g.add(face);
    g.position.set(o.x || 0, o.y === undefined ? 2.6 : o.y, o.z || 0);
    g.rotation.y = o.rot || 0;
    return g;
  };
  P.plaque = P.label;
  P.tag = function (o) { return P.label(Object.assign({ w: 3, h: 0.8 }, o)); };

  /* 前后墙按 openings 真正分段；屋顶天窗四周也分段，不用白板伪装开口。 */
  P.shell = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 60, d = o.d || 80, h = o.h || 24;
    var pal = o.pal || {}, stone = P.matStone({ base: pal.stone }), gold = P.matGold();
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), P.matFloor({ base: pal.floor }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    g.userData.floorMat = floor.material;
    box(g, 0.9, h, d, -w / 2, h / 2, 0, stone);
    box(g, 0.9, h, d, w / 2, h / 2, 0, stone);
    [-1, 1].forEach(function (side) {
      var cuts = (o.openings || []).filter(function (v) { return (v.side || "back") === (side < 0 ? "back" : "front"); })
        .slice().sort(function (a, b) { return a.x - b.x; });
      var left = -w / 2;
      cuts.forEach(function (cut) {
        var a = cut.x - cut.w / 2, b = cut.x + cut.w / 2;
        if (a > left) box(g, a - left, h, 0.9, (a + left) / 2, h / 2, side * d / 2, stone);
        box(g, cut.w, h - cut.h, 0.9, cut.x, cut.h + (h - cut.h) / 2, side * d / 2, stone);
        left = b;
      });
      if (left < w / 2) box(g, w / 2 - left, h, 0.9, (left + w / 2) / 2, h / 2, side * d / 2, stone);
    });
    if (o.ceiling !== false) {
      var sk = o.skylight;
      if (sk) {
        var sw = sk.w, sd = sk.d;
        box(g, (w - sw) / 2, 0.7, d, -(w + sw) / 4, h, 0, stone);
        box(g, (w - sw) / 2, 0.7, d, (w + sw) / 4, h, 0, stone);
        box(g, sw, 0.7, (d - sd) / 2, 0, h, -(d + sd) / 4, stone);
        box(g, sw, 0.7, (d - sd) / 2, 0, h, (d + sd) / 4, stone);
      } else box(g, w, 0.7, d, 0, h, 0, stone);
    }
    /* 石板接缝和金属镶边是真实几何，不作发光网格。 */
    var seam = P.matStone({ base: 0xb9c3c6, roughness: 0.65 });
    var grid = o.grid || 6;
    for (var x = -w / 2 + grid; x < w / 2; x += grid) box(g, 0.025, 0.008, d, x, 0.012, 0, seam);
    for (var z = -d / 2 + grid; z < d / 2; z += grid) box(g, w, 0.008, 0.025, 0, 0.012, z, seam);
    [-1, 1].forEach(function (s) { box(g, 0.07, 0.16, d - 1, s * (w / 2 - 0.5), 0.15, 0, gold); });
    g.userData.size = { w: w, d: d, h: h }; return g;
  };

  P.colonnade = function (o) {
    o = o || {};
    var g = new THREE.Group(), n = o.n || 6, span = o.span || 6, h = o.h || 16, r = o.r || 0.8;
    var stone = P.matStone({ base: o.base === undefined ? 0xf5f5ef : o.base, roughness: 0.34 });
    var gold = P.matGold(), axis = o.axis || "z";
    for (var i = 0; i < n; i++) {
      var off = (i - (n - 1) / 2) * span;
      var x = axis === "z" ? (o.x || 0) : off, z = axis === "z" ? off : (o.z || 0);
      [[r * 1.45, 0.5, 0.25, stone], [r, h, h / 2 + 0.5, stone],
        [r * 1.4, 0.5, h + 0.75, stone], [r * 1.42, 0.1, h + 1.04, gold]].forEach(function (v) {
        var m = new THREE.Mesh(new THREE.CylinderGeometry(v[0] * 0.96, v[0], v[1], 32), v[3]);
        m.position.set(x, v[2], z); m.castShadow = true; m.receiveShadow = true; g.add(m);
      });
    }
    box(g, axis === "z" ? 1.9 : (n - 1) * span + 3, 1.1,
      axis === "z" ? (n - 1) * span + 3 : 1.9, o.x || 0, h + 1.5, o.z || 0, stone);
    return g;
  };

  P.archway = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 7, h = o.h || 9, t = o.t || 0.8;
    var stone = P.matStone({ roughness: 0.3 }), gold = P.matGold();
    [-1, 1].forEach(function (s) {
      box(g, t, h, t, s * (w / 2 + t / 2), h / 2, 0, stone);
      box(g, 0.06, h, t + 0.04, s * (w / 2 + 0.03), h / 2, 0, gold);
    });
    box(g, w + t * 2, 0.85, t, 0, h + 0.42, 0, stone);
    /* 短门廊有深度，但不挡住门洞。 */
    box(g, w + t * 2, 0.22, 2.6, 0, h + 0.94, -0.9, gold);
    if (o.label) g.add(P.label({ title: o.label, w: w + 0.2, h: 1.1, y: h + 1.75, z: 0.5 }));
    g.position.set(o.x || 0, 0, o.z || 0); g.rotation.y = o.rot || 0; return g;
  };

  /* 两段弧形壳体之间留出纵向天窗；每根肋也在天窗处断开。 */
  P.vault = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 46, d = o.d || 58, y = o.y || 18;
    var rise = o.rise || 10, opening = o.opening || 0.29;
    var stone = P.matStone({ base: 0xf1f4f3, side: THREE.DoubleSide, roughness: 0.4 });
    var gold = P.matGold();
    function point(a, z) { return new THREE.Vector3(Math.cos(a) * w / 2, y + Math.sin(a) * rise, z); }
    [[0, Math.PI / 2 - opening], [Math.PI / 2 + opening, Math.PI]].forEach(function (range) {
      var vertices = [], indices = [], n = 32;
      for (var i = 0; i <= n; i++) {
        var a = range[0] + (range[1] - range[0]) * i / n;
        [-d / 2, d / 2].forEach(function (z) { var p = point(a, z); vertices.push(p.x, p.y, p.z); });
        if (i < n) { var v = i * 2; indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      var roof = new THREE.Mesh(geo, stone); roof.receiveShadow = true; roof.castShadow = true; g.add(roof);
      for (var z = -d / 2; z <= d / 2; z += 7) {
        var pts = [];
        for (var k = 0; k <= 32; k++) pts.push(point(range[0] + (range[1] - range[0]) * k / 32, z));
        var rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.23, 8, false), gold);
        rib.castShadow = true; g.add(rib);
      }
    });
    var edgeX = Math.sin(opening) * w / 2, edgeY = y + Math.cos(opening) * rise;
    [-1, 1].forEach(function (s) { box(g, 0.32, 0.4, d, s * edgeX, edgeY, 0, gold); });
    return g;
  };
  P.skylight = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 12, d = o.d || 24, y = o.y || 16;
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(w, d), P.matGlass());
    glass.rotation.x = -Math.PI / 2; glass.position.y = y + 0.4; g.add(glass);
    var gold = P.matGold();
    [-1, 1].forEach(function (s) {
      box(g, 0.15, 0.25, d, s * w / 2, y, 0, gold);
      box(g, w, 0.25, 0.15, 0, y, s * d / 2, gold);
    });
    for (var z = -d / 2 + 6; z < d / 2; z += 6) box(g, w, 0.2, 0.12, 0, y, z, gold);
    g.position.set(o.x || 0, 0, o.z || 0); return g;
  };

  P.vitrine = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 2.8, h = o.h || 3.4, d = o.d || 2.8, bh = o.baseH || 1;
    box(g, w + 0.16, bh, d + 0.16, 0, bh / 2, 0, P.matStone({ roughness: 0.3 }));
    var gold = P.matGold(); box(g, w + 0.2, 0.08, d + 0.2, 0, bh, 0, gold);
    var glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), P.matGlass());
    glass.position.y = bh + h / 2; g.add(glass);
    [-1, 1].forEach(function (x) { [-1, 1].forEach(function (z) {
      box(g, 0.045, h, 0.045, x * w / 2, bh + h / 2, z * d / 2, gold);
    }); });
    box(g, w + 0.15, 0.18, d + 0.15, 0, bh + h, 0, P.matStone());
    g.position.set(o.x || 0, 0, o.z || 0); g.rotation.y = o.rot || 0; g.userData.top = bh; return g;
  };
  P.balcony = function (o) {
    o = o || {};
    var g = new THREE.Group(), w = o.w || 46, d = o.d || 58, y = o.y || 10;
    var stone = P.matStone(), gold = P.matGold();
    [-1, 1].forEach(function (s) {
      var x = s * (w / 2 - 3);
      box(g, 6, 0.6, d, x, y, 0, stone);
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, d), P.matGlass());
      rail.position.set(s * (w / 2 - 6), y + 0.9, 0); g.add(rail);
      box(g, 0.1, 0.09, d, s * (w / 2 - 6), y + 1.5, 0, gold);
    }); return g;
  };
  P.stairway = function (o) {
    o = o || {};
    var g = new THREE.Group(), n = o.steps || 5, rise = o.rise || 0.34, run = o.run || 0.62;
    for (var i = 0; i < n; i++) box(g, o.w || 14, rise, run, 0, rise / 2 + i * rise, -i * run, P.matStone());
    g.position.set(o.x || 0, o.y || 0, o.z || 0); return g;
  };
  P.atrium = function (o) {
    o = o || {};
    var g = new THREE.Group(), r = o.r || 4, h = o.h || 10;
    var base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.5, 0.8, 48), P.matStone());
    base.position.y = 0.4; base.receiveShadow = true; g.add(base);
    box(g, r, h, r, 0, h / 2 + 0.8, 0, P.matGold());
    g.position.set(o.x || 0, 0, o.z || 0); return g;
  };
  global.YC3D_P = P;
})(window);

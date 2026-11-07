/* ============================================================
   YC3D · 程序化几何与材质库
   没有一张贴图文件：立面、天空、全息屏全部现场算出来
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE;
  var Y = global.YC3D;
  if (!THREE || !Y) { console.error("[YC3D] core 未加载"); return; }
  var U = Y.U, PAL = Y.PAL;

  var B = {};

  /* ============================================================
     材质
     ============================================================ */

  /* 建筑立面：窗格、楼层线、随机亮灯、菲涅尔边缘，全在 shader 里 */
  function legacyMatFacade(o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uBase:   { value: new THREE.Color(o.base === undefined ? PAL.deep : o.base) },
        uBase2:  { value: new THREE.Color(o.base2 === undefined ? PAL.steel : o.base2) },
        uGlow:   { value: new THREE.Color(o.glow === undefined ? PAL.ice : o.glow) },
        uGlow2:  { value: new THREE.Color(o.glow2 === undefined ? PAL.violet : o.glow2) },
        uTime:   { value: 0 },
        uSeed:   { value: o.seed === undefined ? 1.0 : o.seed },
        uLit:    { value: o.lit === undefined ? 0.16 : o.lit },
        uFloors: { value: o.floors === undefined ? 34.0 : o.floors },
        uCols:   { value: o.cols === undefined ? 14.0 : o.cols },
        uRib:    { value: o.rib === undefined ? 0.0 : o.rib },
        uTop:    { value: o.top === undefined ? 0.35 : o.top },
        uFres:   { value: o.fres === undefined ? 0.26 : o.fres }
      },
      vertexShader: [
        "varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vL;",
        "void main(){",
        "  vUv = uv;",
        "  vN = normalize(normalMatrix * normal);",
        "  vec4 wp = modelMatrix * vec4(position,1.0);",
        "  vW = wp.xyz;",
        "  vL = position;",
        "  gl_Position = projectionMatrix * viewMatrix * wp;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uBase, uBase2, uGlow, uGlow2;",
        "uniform float uTime, uSeed, uLit, uFloors, uCols, uRib, uTop, uFres;",
        "varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vL;",
        "float h1(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }",
        "void main(){",
        "  float fy = vUv.y * uFloors;",
        "  float fx = vUv.x * uCols;",
        "  vec2 cell = floor(vec2(fx, fy));",
        "  vec2 f = fract(vec2(fx, fy));",
        /* 窗格：留出框边 */
        "  float wx = step(0.14, f.x) * step(f.x, 0.86);",
        "  float wy = step(0.18, f.y) * step(f.y, 0.78);",
        "  float win = wx * wy;",
        /* 亮灯：每格独立随机，再叠一层"整层亮"的概率 */
        "  float r = h1(cell + uSeed * 17.0);",
        "  float floorR = h1(vec2(cell.y, uSeed * 7.3));",
        "  float on = step(1.0 - uLit, r * 0.66 + floorR * 0.34);",
        "  vec3 lit = mix(uGlow, uGlow2, h1(cell.yx + uSeed));",
        "  lit *= 0.55 + h1(cell + 3.7) * 0.85;",
        /* 缓慢闪烁：极慢，像有设备在休眠 */
        "  float blink = 0.86 + 0.14 * sin(uTime * (0.4 + r * 1.6) + r * 30.0);",
        /* 竖向光带（部分塔用） */
        "  float rib = step(0.94, fract(fx * 0.25 + uSeed)) * uRib;",
        /* 基础色：上下有渐变，模拟天光 */
        "  vec3 base = mix(uBase, uBase2, clamp(vL.y * 0.5 + 0.35, 0.0, 1.0));",
        /* 边缘光：掠射角亮起来，塔就有了体积 */
        "  vec3 V = normalize(cameraPosition - vW);",
        "  float fres = pow(1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0), 3.2);",
        "  vec3 col = base;",
        "  col += lit * on * win * 1.62 * blink;",
        "  col += uGlow * rib * (0.25 + 0.75 * f.y) * 0.9;",
        "  col += uGlow * fres * uFres * 0.55;",
        /* 顶部收亮 */
        "  col += uGlow * smoothstep(1.0 - uTop, 1.0, vUv.y) * 0.30;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n")
    });
  }
  /* 原生PBR立面：太阳、天光、环境反射与阴影使用同一光照体系。 */
  function matFacade(o) {
    o = o || {};
    var mat = new THREE.MeshStandardMaterial({ color: 0xb7cbd7, metalness: 0.35, roughness: 0.32, envMapIntensity: 0.42 });
    mat.uniforms = {
      uLit: { value: o.lit === undefined ? 0.18 : o.lit }, uTime: { value: 0 },
      uFloors: { value: o.floors || 34 }, uCols: { value: o.cols || 14 },
      uSeed: { value: o.seed || 1 }, uGlow: { value: new THREE.Color(o.glow || 0xb4d8f3) }
    };
    mat.onBeforeCompile = function (shader) {
      Object.keys(mat.uniforms).forEach(function (key) { shader.uniforms[key] = mat.uniforms[key]; });
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vFacadeUv;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFacadeUv = uv;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
        "#include <common>\nvarying vec2 vFacadeUv;\nuniform float uLit, uTime, uFloors, uCols, uSeed;\nuniform vec3 uGlow;\nfloat facadeHash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}");
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>",
        "#include <color_fragment>\nvec2 cell = vFacadeUv * vec2(uCols,uFloors);\nvec2 f = fract(cell);\nfloat pane = step(0.10,f.x)*step(f.x,0.90)*step(0.12,f.y)*step(f.y,0.86);\nfloat litOn = step(1.0-uLit,facadeHash(floor(cell)+uSeed));\ndiffuseColor.rgb *= mix(vec3(0.83,0.91,0.97),vec3(0.075,0.17,0.26),pane);\n");
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * litOn * pane * 1.5;");
    };
    mat.customProgramCacheKey = function () { return "yc-native-facade-v2"; };
    return mat;
  }
  B.matFacade = matFacade;

  /* 自发光体 */
  B.emissive = function (hex, k) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k === undefined ? 1 : k),
      toneMapped: false
    });
  };

  /* 加色发光：用于光带、光柱、光晕 */
  B.additive = function (hex, k, opacity) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k === undefined ? 1 : k),
      transparent: true, opacity: opacity === undefined ? 1 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
  };

  /* 玻璃幕墙 */
  B.glass = function (hex, opacity) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      metalness: 0.9, roughness: 0.16,
      transparent: true, opacity: opacity === undefined ? 0.35 : opacity,
      side: THREE.DoubleSide, depthWrite: false
    });
  };

  /* 全息：菲涅尔 + 扫描线 + 闪烁 + 加色 */
  B.holo = function (hex, o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(hex) },
        uTime: { value: 0 },
        uOpacity: { value: o.opacity === undefined ? 0.85 : o.opacity },
        uScan: { value: o.scan === undefined ? 42.0 : o.scan },
        uGlitch: { value: o.glitch === undefined ? 0.35 : o.glitch }
      },
      vertexShader: [
        "varying vec3 vN; varying vec3 vW; varying vec2 vUv;",
        "void main(){",
        "  vUv = uv;",
        "  vN = normalize(normalMatrix * normal);",
        "  vec4 wp = modelMatrix * vec4(position,1.0);",
        "  vW = wp.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * wp;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uColor; uniform float uTime, uOpacity, uScan, uGlitch;",
        "varying vec3 vN; varying vec3 vW; varying vec2 vUv;",
        "void main(){",
        "  vec3 V = normalize(cameraPosition - vW);",
        "  float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);",
        "  float scan = 0.62 + 0.38 * sin(vW.y * uScan - uTime * 5.0);",
        "  float band = 0.85 + 0.15 * sin(vW.y * 2.2 - uTime * 1.4);",
        /* 偶发撕裂：整块横向错位的高亮带 */
        "  float g = step(1.0 - uGlitch * 0.04, fract(sin(floor(vW.y * 7.0 + uTime * 3.0) * 91.7) * 4375.85));",
        "  float a = uOpacity * (0.30 + f * 0.9) * scan * band + g * 0.5;",
        "  gl_FragColor = vec4(uColor * (0.7 + f * 1.6 + g * 2.0), a);",
        "}"
      ].join("\n"),
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
  };

  /* 地面：发光网格 + 距离衰减 + 沿 Z 流动的数据线 */
  B.ground = function (o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(o.color === undefined ? PAL.cyan : o.color) },
        uColor2: { value: new THREE.Color(o.color2 === undefined ? PAL.violet : o.color2) },
        uBase: { value: new THREE.Color(o.base === undefined ? 0x060a12 : o.base) },
        uTime: { value: 0 },
        uGrid: { value: o.grid === undefined ? 26.0 : o.grid },
        uFade: { value: o.fade === undefined ? 260.0 : o.fade },
        uFlow: { value: o.flow === undefined ? 0.5 : o.flow },
        uDay: { value: 1 }
      },
      vertexShader: [
        "varying vec3 vW;",
        "void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uColor, uColor2, uBase; uniform float uTime, uGrid, uFade, uFlow, uDay;",
        "varying vec3 vW;",
        "float grid(vec2 p, float w){",
        "  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);",
        "  return 1.0 - min(min(g.x, g.y) / w, 1.0);",
        "}",
        "void main(){",
        "  vec2 p = vW.xz / uGrid;",
        "  float d = length(vW.xz);",
        "  float fade = 1.0 - smoothstep(uFade * 0.35, uFade, d);",
        "  float g1 = grid(p, 1.0);",
        "  float g2 = grid(p * 0.2, 1.6);",
        /* 数据流：沿 +Z 走的亮带 */
        "  float flow = smoothstep(0.92, 1.0, sin(vW.z * 0.08 - uTime * 2.2) * 0.5 + 0.5);",
        "  vec3 col = mix(vec3(0.012,0.024,0.045),uBase,uDay);",
        "  col += uColor * g1 * 0.42 * fade;",
        "  col += uColor2 * g2 * 0.40 * fade;",
        "  col += uColor * flow * 0.16 * fade * uFlow;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n")
    });
  };

  /* 天空穹顶：三段渐变 + 星点 + 极光 + 月轮 */
  B.sky = function (o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(o.top === undefined ? 0x03040a : o.top) },
        uMid: { value: new THREE.Color(o.mid === undefined ? 0x0a1226 : o.mid) },
        uHor: { value: new THREE.Color(o.hor === undefined ? 0x2b1c3f : o.hor) },
        uGlow: { value: new THREE.Color(o.glow === undefined ? PAL.violet : o.glow) },
        uTime: { value: 0 },
        uMoon: { value: new THREE.Vector3(o.moonX === undefined ? 0.34 : o.moonX, o.moonY === undefined ? 0.62 : o.moonY, o.moonR === undefined ? 0.055 : o.moonR) },
        uStar: { value: o.star === undefined ? 1.0 : o.star },
        uAur: { value: o.aurora === undefined ? 0.55 : o.aurora }
      },
      vertexShader: [
        "varying vec3 vP;",
        "void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 uTop, uMid, uHor, uGlow; uniform vec3 uMoon;",
        "uniform float uTime, uStar, uAur;",
        "varying vec3 vP;",
        "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }",
        "float noise(vec2 p){",
        "  vec2 i = floor(p), f = fract(p);",
        "  vec2 u = f*f*(3.0-2.0*f);",
        "  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y);",
        "}",
        "float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }",
        "void main(){",
        "  float y = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);",
        "  vec3 col = mix(uHor, uMid, smoothstep(0.42, 0.62, y));",
        "  col = mix(col, uTop, smoothstep(0.60, 0.98, y));",
        /* 地平线以下压暗 */
        "  col *= mix(0.25, 1.0, smoothstep(0.34, 0.52, y));",
        /* 星点：极坐标网格，靠 y 屏蔽地平线 */
        "  vec2 sp = vec2(atan(vP.z, vP.x) * 3.2, vP.y * 8.0);",
        "  vec2 si = floor(sp * 34.0);",
        "  float sr = h(si);",
        "  float st = step(0.9955, sr) * smoothstep(0.10, 0.42, y) * uStar;",
        "  float tw = 0.55 + 0.45 * sin(uTime * 2.4 + sr * 60.0);",
        "  col += vec3(0.75, 0.86, 1.0) * st * tw * 2.2;",
        /* 极光：两层 fbm 沿 x 漂移 */
        "  float a1 = fbm(vec2(vP.x * 2.4 + uTime * 0.02, vP.y * 3.0 - uTime * 0.05));",
        "  float a2 = fbm(vec2(vP.x * 5.0 - uTime * 0.03, vP.y * 4.2 + uTime * 0.02));",
        "  float aur = smoothstep(0.52, 0.92, a1 * 0.65 + a2 * 0.45);",
        "  aur *= smoothstep(0.52, 0.80, y) * (1.0 - smoothstep(0.88, 1.0, y));",
        "  col += uGlow * aur * uAur * 0.9;",
        /* 月轮 / 巨型天体 */
        "  vec2 muv = vec2(atan(vP.z, vP.x) / 3.14159, vP.y);",
        "  float md = length((muv - uMoon.xy) * vec2(1.0, 1.0));",
        "  float disk = 1.0 - smoothstep(uMoon.z * 0.92, uMoon.z, md);",
        "  float halo = exp(-md * 7.0) * 0.35 + exp(-md * 2.2) * 0.10;",
        "  col += vec3(0.86, 0.90, 1.0) * disk * 0.95;",
        "  col += uGlow * halo * 0.8;",
        /* 地平线辉光：城市光污染 */
        "  col += uGlow * pow(1.0 - abs(y - 0.5) * 2.0, 8.0) * 0.20;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n"),
      side: THREE.BackSide, depthWrite: false, fog: false
    });
  };

  /* ============================================================
     几何
     ============================================================ */

  /* 参数化塔：收分 / 扭转 / 立面 / 塔冠 */
  B.tower = function (o) {
    o = o || {};
    var rnd = U.rng(o.seed || 1);
    var g = new THREE.Group();
    var w = o.w || 10, d = o.d || 10, h = o.h || 80;
    var seg = o.seg || 6;
    var taper = o.taper === undefined ? 0.82 : o.taper;
    var twist = o.twist === undefined ? 0 : o.twist;
    var side = o.side === undefined ? 4 : o.side;

    /* 主体：用多段 Cylinder 拼，每段按 taper 收分，形成折线轮廓 */
    var mat = matFacade({
      base: o.base, base2: o.base2, glow: o.glow, glow2: o.glow2,
      seed: o.seed || 1, lit: o.lit, floors: o.floors || Math.max(8, h / 3.2),
      cols: o.cols || 12, rib: o.rib, top: o.top, fres: o.fres
    });
    g.userData.mat = mat;

    /* 主体：可分段退台。单段是柱子，分段才是建筑 */
    var tiers = Math.max(1, Math.min(4, o.tiers || 1));
    var bodies = [];
    for (var ti = 0; ti < tiers; ti++) {
      var t0 = ti / tiers, t1 = (ti + 1) / tiers;
      var rBot = (w * 0.5) * (1 - (1 - taper) * t0) * (ti ? 0.90 : 1);
      var rTop = (w * 0.5) * (1 - (1 - taper) * t1);
      var segH = h / tiers;
      var geo = new THREE.CylinderGeometry(
        Math.max(0.6, rTop * (ti === tiers - 1 ? 1 : 0.97)),
        Math.max(0.7, rBot), segH, side, 1, false
      );
      /* 扭转：按高度旋转顶点（整塔连续扭转，不是每段各转） */
      if (twist) {
        var pos = geo.attributes.position;
        var v = new THREE.Vector3();
        for (var i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          var t = (v.y + segH / 2) / h + t0;
          var a = twist * t;
          var ca = Math.cos(a), sa = Math.sin(a);
          pos.setXYZ(i, v.x * ca - v.z * sa, v.y, v.x * sa + v.z * ca);
        }
        geo.computeVertexNormals();
      }
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = segH * (ti + 0.5);
      g.add(mesh);
      bodies.push(mesh);
      /* 退台边缘：一道细光环，层次立刻出来 */
      if (ti < tiers - 1 && o.tierRim !== false) {
        var rim = new THREE.Mesh(
          new THREE.TorusGeometry(rTop * 1.02, 0.16, 4, 40),
          B.emissive(o.glow === undefined ? PAL.ice : o.glow, 1.2)
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = segH * (ti + 1);
        g.add(rim);
      }
    }

    /* 楼身光带：竖直细条，贴在四个角上（比描边便宜且更亮） */
    if (o.edgeGlow !== false) {
      var em = B.additive(o.glow === undefined ? PAL.cyan : o.glow, 1.1, 0.30);
      for (var k = 0; k < 4; k++) {
        var a2 = (k / 4) * Math.PI * 2 + Math.PI / 4;
        var strip = new THREE.Mesh(new THREE.PlaneGeometry(0.26, h * 0.96), em);
        strip.position.set(Math.cos(a2) * w * 0.5 * 0.92, h * 0.5, Math.sin(a2) * w * 0.5 * 0.92);
        strip.rotation.y = -a2 + Math.PI / 2;
        g.add(strip);
      }
    }

    /* 塔冠 */
    var crown = o.crown || "spire";
    if (crown === "spire") {
      var sp = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(0.5, w * 0.10), h * 0.20, 5),
        B.emissive(o.glow === undefined ? PAL.cyan : o.glow, 2.6)
      );
      sp.position.y = h + h * 0.10;
      g.add(sp);
      var beacon = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.5, w * 0.055), 12, 12),
        B.emissive(0xffffff, 4.0)
      );
      beacon.position.y = h + h * 0.20;
      g.add(beacon);
      g.userData.beacon = beacon;
    } else if (crown === "ring") {
      var ring = B.ring(w * 0.72, 0.42, o.glow === undefined ? PAL.cyan : o.glow, 1.8);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h + 2.0;
      g.add(ring);
      g.userData.crownRing = ring;
    } else if (crown === "orb") {
      var orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(w * 0.30, 1),
        B.holo(o.glow === undefined ? PAL.cyan : o.glow, { opacity: 0.55, scan: 26 })
      );
      orb.position.y = h + w * 0.34;
      g.add(orb);
      g.userData.orb = orb;
    } else if (crown === "halo") {
      var hr = B.ring(w * 0.95, 0.28, o.glow === undefined ? PAL.amber : o.glow, 1.5);
      hr.rotation.x = Math.PI / 2.35;
      hr.position.y = h + 1.2;
      g.add(hr);
      g.userData.crownRing = hr;
    }

    /* 楼底光晕：贴着地面的一圈微光，城市底部才不是死黑 */
    if (o.baseGlow !== false) {
      var bg = new THREE.Mesh(
        new THREE.CircleGeometry(w * 0.95, 24),
        B.additive(o.glow === undefined ? PAL.ice : o.glow, 0.30, 0.09)
      );
      bg.rotation.x = -Math.PI / 2;
      bg.position.y = 0.06;
      g.add(bg);
    }

    /* 底座：一圈低矮裙楼，让塔不像插在地上的棍子 */
    if (o.podium !== false) {
      var podH = Math.max(2.5, h * 0.055);
      var pod = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.86, w * 0.94, podH, 8),
        matFacade({
          base: o.base, base2: o.base2, glow: o.glow, glow2: o.glow2,
          seed: (o.seed || 1) + 99, lit: 0.32, floors: 4, cols: 18, fres: 0.3
        })
      );
      pod.position.y = podH / 2;
      g.add(pod);
      var band = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.87, w * 0.87, 0.5, 8, 1, true),
        B.additive(o.glow === undefined ? PAL.cyan : o.glow, 1.8, 0.85)
      );
      band.position.y = podH;
      g.add(band);
    }

    g.position.set(o.x || 0, o.y || 0, o.z || 0);
    return g;
  };

  /* 环：细管圆环，带光 */
  B.ring = function (r, tube, hex, k) {
    var m = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 8, 96),
      B.emissive(hex, k === undefined ? 1.6 : k)
    );
    return m;
  };

  /* 光柱：从地面升起的一束光，用双层锥体做体积感 */
  B.shaft = function (o) {
    o = o || {};
    var g = new THREE.Group();
    var h = o.h || 60, r0 = o.r0 || 1.2, r1 = o.r1 || 5.0;
    var hex = o.color === undefined ? PAL.cyan : o.color;
    var outer = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, h, 16, 1, true),
      B.additive(hex, 0.55, o.opacity === undefined ? 0.22 : o.opacity)
    );
    outer.position.y = h / 2;
    g.add(outer);
    var inner = new THREE.Mesh(
      new THREE.CylinderGeometry(r0 * 1.5, r0 * 0.6, h, 12, 1, true),
      B.additive(hex, 1.8, 0.55)
    );
    inner.position.y = h / 2;
    g.add(inner);
    g.position.set(o.x || 0, 0, o.z || 0);
    g.userData.outer = outer;
    return g;
  };

  /* 全息广告牌：canvas 画内容 → 全息材质平面 */
  B.holoScreen = function (o) {
    o = o || {};
    var w = o.w || 40, h = o.h || 24;
    var cv = document.createElement("canvas");
    cv.width = o.px || 512; cv.height = Math.round((o.px || 512) * h / w);
    var ctx = cv.getContext("2d");
    if (o.draw) o.draw(ctx, cv.width, cv.height);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Color(o.color === undefined ? PAL.cyan : o.color) },
        uTime: { value: 0 },
        uOpacity: { value: o.opacity === undefined ? 0.9 : o.opacity },
        uFlicker: { value: o.flicker === undefined ? 0.12 : o.flicker }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
      ].join("\n"),
      fragmentShader: [
        "uniform sampler2D uMap; uniform vec3 uColor; uniform float uTime, uOpacity, uFlicker;",
        "varying vec2 vUv;",
        "void main(){",
        "  vec2 uv = vUv;",
        /* 轻微横向抖动，模拟投影不稳定 */
        "  float jit = sin(uv.y * 180.0 + uTime * 9.0) * 0.0008;",
        "  vec4 t = texture2D(uMap, uv + vec2(jit, 0.0));",
        "  float scan = 0.72 + 0.28 * sin(uv.y * 420.0 - uTime * 7.0);",
        "  float fl = 1.0 - uFlicker * 0.5 * (0.5 + 0.5 * sin(uTime * 13.0 + uv.y * 6.0));",
        "  float edge = smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * smoothstep(0.0, 0.02, uv.y) * smoothstep(1.0, 0.98, uv.y);",
        "  vec3 c = t.rgb * uColor * 1.4 + uColor * t.a * 0.25;",
        "  float a = max(t.a, max(t.r, max(t.g, t.b)) * 0.75) * uOpacity * scan * fl * edge;",
        "  gl_FragColor = vec4(c, a);",
        "}"
      ].join("\n"),
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.userData.tex = tex;
    mesh.userData.mat = mat;
    return mesh;
  };

  /* 空中飞行器：小光体 + 拖尾 */
  B.craft = function (o) {
    o = o || {};
    var g = new THREE.Group();
    var c = o.color === undefined ? PAL.amber : o.color;
    var core = new THREE.Mesh(new THREE.SphereGeometry(o.r || 0.5, 8, 8), B.emissive(c, 3.2));
    g.add(core);
    var halo = new THREE.Mesh(
      new THREE.SphereGeometry((o.r || 0.5) * 2.6, 8, 8),
      B.additive(c, 1.0, 0.35)
    );
    g.add(halo);
    /* 拖尾：一条细长锥 */
    var tail = new THREE.Mesh(
      new THREE.ConeGeometry((o.r || 0.5) * 0.5, (o.r || 0.5) * 14, 6),
      B.additive(c, 0.9, 0.28)
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.z = (o.r || 0.5) * 7;
    g.add(tail);
    g.userData.tail = tail;
    return g;
  };

  /* 粒子：Points，带柔和光点贴图（程序生成） */
  B.particleTex = function (soft) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    var c = cv.getContext("2d");
    var gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(soft ? 0.35 : 0.18, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  };

  B.particles = function (o) {
    o = o || {};
    var n = o.n || 600;
    var rnd = U.rng(o.seed || 7);
    var pos = new Float32Array(n * 3);
    var ph = new Float32Array(n);
    var sz = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = U.range(rnd, o.x0 || -220, o.x1 || 220);
      pos[i * 3 + 1] = U.range(rnd, o.y0 || 0, o.y1 || 160);
      pos[i * 3 + 2] = U.range(rnd, o.z0 || -260, o.z1 || 120);
      ph[i] = rnd() * 6.28;
      sz[i] = 0.6 + rnd() * 2.2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
    geo.setAttribute("aSz", new THREE.BufferAttribute(sz, 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: B.particleTex(true) },
        uColor: { value: new THREE.Color(o.color === undefined ? PAL.ice : o.color) },
        uSize: { value: o.size === undefined ? 2.6 : o.size },
        uRise: { value: o.rise === undefined ? 1.0 : o.rise },
        uOpacity: { value: o.opacity === undefined ? 0.75 : o.opacity }
      },
      vertexShader: [
        "attribute float aPh; attribute float aSz;",
        "uniform float uTime, uSize, uRise;",
        "varying float vA;",
        "void main(){",
        "  vec3 p = position;",
        "  p.y = mod(p.y + uTime * uRise * (4.0 + aSz * 2.0), 190.0);",
        "  p.x += sin(uTime * 0.35 + aPh) * 2.4;",
        "  p.z += cos(uTime * 0.28 + aPh * 1.7) * 2.0;",
        "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
        "  vA = smoothstep(190.0, 150.0, p.y) * (0.35 + 0.65 * sin(uTime * 1.2 + aPh) * 0.5 + 0.35);",
        "  gl_PointSize = uSize * aSz * (280.0 / -mv.z);",
        "  gl_Position = projectionMatrix * mv;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;",
        "varying float vA;",
        "void main(){",
        "  vec4 t = texture2D(uMap, gl_PointCoord);",
        "  gl_FragColor = vec4(uColor * 1.6, t.a * vA * uOpacity);",
        "}"
      ].join("\n"),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var pts = new THREE.Points(geo, mat);
    pts.userData.mat = mat;
    pts.frustumCulled = false;
    return pts;
  };

  /* 水面：深色 + 涟漪 + 竖向倒影条 */
  B.water = function (o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(o.color === undefined ? 0x081520 : o.color) },
        uDay: { value: 1 },
        uGlow: { value: new THREE.Color(o.glow === undefined ? PAL.cyan : o.glow) },
        uGlow2: { value: new THREE.Color(o.glow2 === undefined ? PAL.violet : o.glow2) }
      },
      vertexShader: [
        "varying vec3 vW; varying vec2 vUv;",
        "void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }"
      ].join("\n"),
      fragmentShader: [
        "uniform float uTime, uDay; uniform vec3 uColor, uGlow, uGlow2;",
        "varying vec3 vW; varying vec2 vUv;",
        "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }",
        "void main(){",
        "  vec2 p = vW.xz;",
        /* 波纹：三层不同频率的 sin 叠加，斜向 */
        "  float w1 = sin(p.x * 0.35 + p.y * 0.22 + uTime * 0.9);",
        "  float w2 = sin(p.x * -0.18 + p.y * 0.55 + uTime * 1.4);",
        "  float w3 = sin((p.x + p.y) * 0.92 - uTime * 2.1);",
        "  float rip = (w1 * 0.5 + w2 * 0.3 + w3 * 0.2) * 0.5 + 0.5;",
        /* 竖向光柱的倒影：用 x 的哈希做出断断续续的亮条 */
        "  float streak = step(0.965, h(vec2(floor(p.x * 0.9), 3.0)));",
        "  float sfall = smoothstep(120.0, 10.0, abs(p.y));",
        "  float shimmer = 0.5 + 0.5 * sin(p.y * 3.2 - uTime * 3.6 + p.x * 0.6);",
        "  vec3 col = mix(vec3(0.009,0.025,0.051),uColor,uDay);",
        "  col += vec3(0.16,0.30,0.40) * pow(rip,8.0) * uDay;",
        "  col += uGlow * rip * 0.075;",
        "  col += mix(uGlow, uGlow2, rip) * streak * sfall * shimmer * 0.80;",
        "  float d = length(vW.xz);",
        "  col *= 1.0 - smoothstep(180.0, 420.0, d) * 0.7;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n")
    });
  };

  /* 细长光带：用于轨道环、桥、管线 */
  B.beam = function (from, to, hex, k, r) {
    var a = new THREE.Vector3(from[0], from[1], from[2]);
    var b = new THREE.Vector3(to[0], to[1], to[2]);
    var len = a.distanceTo(b);
    var geo = new THREE.CylinderGeometry(r || 0.18, r || 0.18, len, 5, 1, true);
    var m = new THREE.Mesh(geo, B.additive(hex, k === undefined ? 1.4 : k, 0.75));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  /* 折线光带（贝塞尔）：飞行轨道、数据流 */
  B.curveLine = function (pts, hex, k, opacity) {
    var v = pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    var curve = new THREE.CatmullRomCurve3(v);
    var geo = new THREE.TubeGeometry(curve, 64, 0.10, 5, false);
    var m = new THREE.Mesh(geo, B.additive(hex, k === undefined ? 1.0 : k, opacity === undefined ? 0.22 : opacity));
    m.userData.curve = curve;
    return m;
  };

  /* 全息人形：驻馆人 / 导游的抽象立像（无贴图，纯几何） */
  B.figure = function (o) {
    o = o || {};
    var hex = o.color === undefined ? PAL.cyan : o.color;
    var g = new THREE.Group();
    var holo = B.holo(hex, { opacity: o.opacity === undefined ? 0.62 : o.opacity, scan: 30 });
    var body = new THREE.Group();

    /* 躯干：上宽下窄的八棱柱 */
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.30, 1.10, 10, 1, true), holo);
    torso.position.y = 1.30;
    body.add(torso);

    /* 双腿：两条细柱，人形立刻成立 */
    [-1, 1].forEach(function (sd) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.78, 6, 1, true), holo);
      leg.position.set(sd * 0.13, 0.39, 0);
      body.add(leg);
    });
    /* 双臂 */
    [-1, 1].forEach(function (sd) {
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.86, 6, 1, true), holo);
      arm.position.set(sd * 0.50, 1.28, 0);
      arm.rotation.z = sd * 0.10;
      body.add(arm);
    });

    /* 头 */
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10), holo);
    head.position.y = 2.08;
    head.scale.set(1, 1.12, 0.92);
    body.add(head);

    /* 肩线：一条横向发光线，让人形不散 */
    var sh = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.026, 5, 24, Math.PI), B.additive(hex, 2.4, 0.9));
    sh.position.y = 1.80; sh.rotation.x = Math.PI / 2; sh.rotation.z = Math.PI;
    body.add(sh);

    /* 下摆：只留一圈很薄的投影裙边，不做大喇叭 */
    var skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 0.22, 10, 1, true), holo);
    skirt.position.y = 0.11;
    body.add(skirt);

    /* 底部光池 */
    var pool = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), B.additive(hex, 1.2, 0.30));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02;
    body.add(pool);

    /* 环绕数据环 */
    var r1 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.012, 4, 48), B.additive(hex, 2.0, 0.55));
    r1.rotation.x = Math.PI / 2.1; r1.position.y = 1.05;
    body.add(r1);
    var r2 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.010, 4, 40), B.additive(hex, 2.0, 0.45));
    r2.rotation.x = Math.PI / 2.6; r2.rotation.z = 0.4; r2.position.y = 1.52;
    body.add(r2);

    g.add(body);
    g.userData.body = body;
    g.userData.rings = [r1, r2];
    g.userData.holo = holo;
    g.scale.setScalar(o.scale === undefined ? 1 : o.scale);
    return g;
  };

  /* 展品台：圆形基座 + 顶部光锥 + 悬浮物 */
  B.pedestal = function (o) {
    o = o || {};
    var g = new THREE.Group();
    var r = o.r || 2.2, h = o.h || 0.9;
    var hex = o.color === undefined ? PAL.cyan : o.color;

    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 1.08, h, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0a1018, metalness: 0.85, roughness: 0.28
      })
    );
    base.position.y = h / 2;
    g.add(base);

    var rim = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.035, 6, 64),
      B.emissive(hex, 2.2)
    );
    rim.rotation.x = Math.PI / 2; rim.position.y = h;
    g.add(rim);

    var glow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.86, 32),
      B.additive(hex, 0.8, 0.20)
    );
    glow.rotation.x = -Math.PI / 2; glow.position.y = h + 0.012;
    g.add(glow);

    /* 光锥：从台面往上收 */
    var cone = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.55, r * 0.92, 3.2, 24, 1, true),
      B.additive(hex, 0.55, 0.09)
    );
    cone.position.y = h + 1.6;
    g.add(cone);

    g.userData.top = h;
    return g;
  };

  /* 已授权GLB资产：HTTP按需加载；file://使用构建生成的本地字节包。 */
  var CHARACTER_FILES = { jay: "jay.glb", sintel: "sintel.glb", sophia: "sophia-ccby-20260507.glb" };
  var charCache = {}, byteCache = {}, animationCache = null;
  function assetBytes(file) {
    if (byteCache[file]) return byteCache[file];
    var source = "shared/yc3d/assets/" + file;
    byteCache[file] = location.protocol === "file:" ? new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = source + ".data.js";
      tag.onload = function () {
        try { var raw = atob(global.YC3D_ASSET_BYTES[file]); var bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          delete global.YC3D_ASSET_BYTES[file]; resolve(bytes.buffer);
        } catch (e) { reject(e); }
        tag.remove();
      };
      tag.onerror = function () { reject(new Error("本地模型字节包缺失：" + file)); };
      document.head.appendChild(tag);
    }) : fetch(source).then(function (r) {
      if (!r.ok) throw new Error("模型加载失败：" + file + " HTTP " + r.status);
      return r.arrayBuffer();
    });
    return byteCache[file];
  }
  function parseAsset(file) {
    return assetBytes(file).then(function (bytes) {
      return new Promise(function (resolve, reject) {
        var loader = new global.YC3D_VENDOR.GLTFLoader();
        loader.setMeshoptDecoder(global.YC3D_VENDOR.MeshoptDecoder);
        loader.parse(bytes, "", resolve, reject);
      });
    });
  }
  function animations() {
    if (!animationCache) animationCache = Promise.all(["idle-subtle", "idle-talking", "walk"].map(function (name) {
      return parseAsset("animations/" + name + ".glb").then(function (g) { return g.animations[0]; });
    }));
    return animationCache;
  }
  function characterAsset(key) {
    if (!charCache[key]) charCache[key] = parseAsset(CHARACTER_FILES[key]).then(function (g) {
      return (key === "sophia" ? Promise.resolve(g.animations) : animations()).then(function (clips) {
        return { scene: g.scene, clips: clips };
      });
    });
    return charCache[key];
  }
  B.character = function (opts) {
    opts = opts || {}; var key = opts.asset || "jay";
    var host = new THREE.Group(); host.name = "character-" + key;
    host.userData.characterOptions = { asset: key, scale: opts.scale || 1 };
    host.userData.assetState = "loading";
    host.userData.asset = key;
    host.ready = characterAsset(key).then(function (asset) {
      var model = global.YC3D_VENDOR.cloneSkeleton(asset.scene);
      model.updateMatrixWorld(true);
      var bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
      var normal = 1.78 / Math.max(0.1, size.y) * (opts.scale || 1);
      model.scale.multiplyScalar(normal); model.updateMatrixWorld(true);
      bounds.setFromObject(model); var center = bounds.getCenter(new THREE.Vector3());
      model.position.x -= center.x; model.position.z -= center.z; model.position.y -= bounds.min.y;
      model.traverse(function (obj) {
        if (obj.isMesh) {
          obj.castShadow = true; obj.receiveShadow = true; obj.frustumCulled = false;
          // 各实例独立材质，不把共享缓存的角色反射强度一起改掉。
          if (Array.isArray(obj.material)) obj.material = obj.material.map(function (m) { var c = m.clone(); c.envMapIntensity = 0.35; return c; });
          else if (obj.material) { obj.material = obj.material.clone(); obj.material.envMapIntensity = 0.35; }
        }
      });
      host.add(model); host.userData.assetState = "ready";
      var mixer = new THREE.AnimationMixer(model), actions = {};
      asset.clips.forEach(function (clip) { actions[clip.name] = mixer.clipAction(clip); });
      var idle = actions.Idle || actions.Idle_Subtle || actions[Object.keys(actions)[0]];
      if (idle) idle.play();
      host.userData.mixer = mixer; host.userData.actions = actions; host.userData.activeAction = idle;
      host.userData.characterModel = model; host.userData.lastPosition = host.position.clone();
      return host;
    }).catch(function (e) {
      host.userData.assetState = "error"; host.userData.assetError = e.message;
      console.error("人物资产未加载：" + key + " / " + e.message);
      return host;
    });
    return host;
  };
  B.cloneCharacter = function (source) {
    if (!source.userData.characterOptions) throw new Error("需要人物Group，而非未绑定骨骼的普通clone");
    return B.character(source.userData.characterOptions);
  };
  B.updateCharacters = function (scene, dt, talking) {
    scene.traverse(function (host) {
      if (!host.userData.mixer) return;
      for (var parent = host; parent; parent = parent.parent) if (!parent.visible) return;
      var data = host.userData, speed = host.position.distanceTo(data.lastPosition) / Math.max(0.001, dt);
      data.lastPosition.copy(host.position);
      var actions = data.actions;
      var next = speed > 0.3 ? actions.Walk : talking && actions.Idle_Talking ? actions.Idle_Talking : actions.Idle || actions.Idle_Subtle;
      if (next && next !== data.activeAction) {
        if (data.activeAction) data.activeAction.fadeOut(0.22);
        next.reset().fadeIn(0.22).play(); data.activeAction = next;
      }
      data.mixer.update(dt);
    });
  };
  global.YC3D_B = B;
})(window);

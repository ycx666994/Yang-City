/* ============================================================
   YC3D · 区域街区（局部近景）
   1 单位 = 1 米。每个区域按自己的规划方案在局部坐标系里生成：
   路网 → 临街地块 → 建筑体量 → 屋顶杂物 → 街道设施。
   与 yc3d-city.js 共用天空与光照装配，但视角是近距离侧上方，
   一屏只覆盖区域的一小块，靠拖动平移看不同地段。
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE, Y = global.YC3D, B = global.YC3D_B;
  if (!THREE || !Y || !B) { console.error("[YC3D] 区域街区依赖未加载"); return; }
  var U = Y.U;

  /* ------------------------------------------------------------
     色板：全城至少 20 种建筑颜色，每个区域从中取一组协调的子集。
     ------------------------------------------------------------ */
  var PALETTE = {
    white: 0xd6d4ca, ivory: 0xcac4b4, cream: 0xb8ab92, sand: 0xae977c,
    warmStone: 0xb9a68c, stoneGrey: 0xa9aaa4, stoneCool: 0x9fb0ba, slate: 0x7c8892,
    charcoal: 0x4b5054, graphite: 0x5f6669, navy: 0x3f5064, steelBlue: 0x6d8aa4,
    brickRed: 0xa25440, brickBrown: 0x855741, terracotta: 0xbe7350, rust: 0x9a6244,
    ochre: 0xc59a56, mustard: 0xcfa945, olive: 0x8a8d5c, mint: 0x9cc4ae,
    teal: 0x4d8c88, patina: 0x6f9c88, plum: 0x7b6480, violet: 0x877ca6,
    indigo: 0x6b7386, rose: 0xa8877f, amber: 0xc08434, sky: 0x93a6b0
  };

  /* ------------------------------------------------------------
     共享几何：单位盒、圆柱、球、山墙、筒拱
     ------------------------------------------------------------ */
  var BOX = new THREE.BoxGeometry(1, 1, 1);
  var CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  var CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  /* 开口六棱柱：只有一圈侧面。做「贴在墙上的横带」必须用它——
     实心 CYL6 的顶面是一个完整的六边形板，一条 1.6 米的带子
     会把下面 4.4 米的墙整个盖住，从斜上方看到的每一层都是带子的顶面，
     整片蜂窝于是读成一堆绿桶。 */
  var CYL6_RING = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
  var SPH = new THREE.SphereGeometry(0.5, 12, 8);
  var HEMI = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  var CONE = new THREE.CylinderGeometry(0.02, 0.5, 1, 16);
  var CONE4 = new THREE.CylinderGeometry(0.02, 0.5, 1, 4);

  /* 山墙屋顶：底 [-.5,.5]²，脊线沿 z，顶点 y=1；每面独立顶点保证硬边。 */
  var GABLE = (function () {
    var f = function (a, b, c) { return [].concat(a, b, c); };
    var p = [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5], [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5]];
    var v = f(p[0], p[1], p[2]).concat(f(p[5], p[4], p[3]), f(p[0], p[2], p[5]).concat(f(p[0], p[5], p[3])),
      f(p[1], p[4], p[5]).concat(f(p[1], p[5], p[2])), f(p[0], p[3], p[4]).concat(f(p[0], p[4], p[1])));
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals(); return g;
  })();

  /* 筒拱：半圆拱沿 z 拉伸，底面 y=0。 */
  var VAULT = (function () {
    var seg = 14, v = [], idx = [], i;
    for (i = 0; i <= seg; i++) {
      var a = Math.PI * i / seg, x = Math.cos(a) * 0.5, y = Math.sin(a) * 0.5;
      v.push(x, y, 0.5, x, y, -0.5);
    }
    for (i = 0; i < seg; i++) { var k = i * 2; idx.push(k, k + 2, k + 3, k, k + 3, k + 1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  })();

  /* ------------------------------------------------------------
     立面材质：窗格按世界坐标计算，所以同一材质贴在 8 米小屋
     和 200 米塔楼上窗子都是真实尺寸，不会随体量被拉伸。
     ------------------------------------------------------------ */
  var FACADE_PROGRAMS = 0;
  function facadeMat(hex, o) {
    o = o || {};
    var mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      metalness: o.metal === undefined ? 0.14 : o.metal,
      roughness: o.rough === undefined ? 0.74 : o.rough,
      envMapIntensity: 0.55
    });
    var uniforms = {
      uLit: { value: o.lit === undefined ? 0.20 : o.lit },
      uGlow: { value: new THREE.Color(o.glow === undefined ? 0xffe8c4 : o.glow) },
      uFloorH: { value: o.floorH || 3.4 },
      uColW: { value: o.colW || 2.9 },
      uSeed: { value: o.seed || 1 },
      uPane: { value: new THREE.Color(o.pane === undefined ? 0x2b3b46 : o.pane) },
      uRoof: { value: new THREE.Color(o.roof === undefined ? 0x574f46 : o.roof) },
      uRatio: { value: o.ratio === undefined ? 0.62 : o.ratio }
    };
    mat.uniforms = uniforms;
    mat.onBeforeCompile = function (shader) {
      Object.keys(uniforms).forEach(function (k) { shader.uniforms[k] = uniforms[k]; });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFacW; varying vec3 vFacN;")
        .replace("#include <begin_vertex>", [
          "#include <begin_vertex>",
          "#ifdef USE_INSTANCING",
          "  vec4 ycW = modelMatrix * instanceMatrix * vec4(transformed,1.0);",
          "  vFacN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);",
          "#else",
          "  vec4 ycW = modelMatrix * vec4(transformed,1.0);",
          "  vFacN = normalize(mat3(modelMatrix) * objectNormal);",
          "#endif",
          "  vFacW = ycW.xyz;"
        ].join("\n"));
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", [
          "#include <common>",
          "varying vec3 vFacW; varying vec3 vFacN;",
          "uniform float uLit, uFloorH, uColW, uSeed, uRatio;",
          "uniform vec3 uGlow, uPane, uRoof;",
          "float ycHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }"
        ].join("\n"))
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "vec3 ycN = normalize(vFacN);",
          "float ycUp = abs(ycN.y);",
          "float ycU = abs(ycN.x) > abs(ycN.z) ? vFacW.z : vFacW.x;",
          "vec2 ycG = vec2(ycU / uColW, vFacW.y / uFloorH);",
          "vec2 ycF = fract(ycG), ycI = floor(ycG);",
          "float ycWR = uRatio * 0.5;",
          "float ycMX = smoothstep(0.5 - ycWR, 0.5 - ycWR + 0.055, ycF.x) * (1.0 - smoothstep(0.5 + ycWR - 0.055, 0.5 + ycWR, ycF.x));",
          "float ycMY = smoothstep(0.18, 0.26, ycF.y) * (1.0 - smoothstep(0.84, 0.90, ycF.y));",
          "float ycDetail = 1.0 - smoothstep(0.30, 0.85, max(fwidth(ycG.x), fwidth(ycG.y)));",
          /* 远处窗格密度超过像素时直接抹平会变成一整块纯色板（素模感的根源）。
             这里改成淡出到「平均窗面积色」，远楼仍有窗色而不是白盒子。 */
          "float ycWinRect = ycMX * ycMY * (1.0 - step(0.5, ycUp));",
          "float ycPane = mix(uRatio * 0.58, ycWinRect, ycDetail);",
          "float ycLit = step(1.0 - uLit, ycHash(ycI + uSeed));",
          "diffuseColor.rgb *= mix(vec3(1.0), uPane, ycPane * 0.92);",
          /* 顶面单独换屋面材质：不然从上方看每栋楼顶都是一块纯白，整片城市像石膏模型 */
          "float ycUpMask = step(0.5, ycN.y);",
          "vec3 ycRoofC = uRoof * (0.82 + 0.36 * ycHash(floor(vFacW.xz * 0.035) + uSeed));",
          "diffuseColor.rgb = mix(diffuseColor.rgb, ycRoofC, ycUpMask);"
        ].join("\n"))
        .replace("#include <emissivemap_fragment>", [
          "#include <emissivemap_fragment>",
          "totalEmissiveRadiance += uGlow * ycLit * ycPane * 0.95;"
        ].join("\n"));
      FACADE_PROGRAMS++;
    };
    mat.customProgramCacheKey = function () { return "yc-district-facade-v1"; };
    return mat;
  }
  function plainMat(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex),
      roughness: rough === undefined ? 0.85 : rough, metalness: metal === undefined ? 0.02 : metal,
      envMapIntensity: 0.4 });
  }

  /* 楼顶厂牌：中文大字 + 英文副标，画在画布上做成贴图。
     深色底板 + 白字，白天是实体招牌，夜里靠 emissiveMap 自己亮起来。 */
  function signTexture(text, en, tone) {
    var W = 640, H = 200;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    c.clearRect(0, 0, W, H);
    var pad = 6;
    c.fillStyle = "rgba(16,20,24,0.90)";
    c.fillRect(pad, pad, W - pad * 2, H - pad * 2);
    c.strokeStyle = tone || "rgba(255,255,255,0.9)";
    c.lineWidth = 4;
    c.strokeRect(pad + 5, pad + 5, W - pad * 2 - 10, H - pad * 2 - 10);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.font = "600 112px 'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
    c.fillText(text, W / 2, H * 0.42);
    c.fillStyle = tone || "#ffffff";
    c.font = "500 40px 'Helvetica Neue',Arial,sans-serif";
    c.fillText(en, W / 2, H * 0.78);
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* 竖排字：超高层塔身上的公司名。
     signTexture 是横匾（640×200），贴塔顶；塔身要的是「从上往下读」的一列字，
     宽高比 1:n，横匾纹理拉过去，字会被压成一排方块。
     白字压透明底，最终贴在一条深色灯箱槽上——塔身是冷白幕墙，
     白字不加底板，600 米外就是一条白痕，读不出是字。 */
  function vSignTexture(text, tone) {
    var cell = 160, n = text.length;
    var cv = document.createElement("canvas");
    cv.width = cell; cv.height = cell * n;
    var c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = tone || "#ffffff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "700 122px 'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
    for (var i = 0; i < n; i++) c.fillText(text.charAt(i), cell / 2, cell * (i + 0.5));
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* 车站大字招牌：signTexture 的比例是 640×200（3.2:1），中文只占 56% 高度，
     做成 19 米的牌子，字高只剩 2.7 米——远看就是一块深色板子。
     这里单独做一版：画布更高、字占 72%、边距压到最小，
     同样的挂牌宽度能换出 40% 以上的字号。 */
  function stationSignTexture(text, en, tone) {
    var W = 960, H = 280;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(14,18,22,0.94)";
    c.fillRect(0, 0, W, H);
    /* 只留一道细边线：边框一粗，牌子就变成一块「招牌板」，
       字反而被框住读不出来。 */
    c.strokeStyle = tone || "rgba(255,255,255,0.9)";
    c.lineWidth = 3;
    c.strokeRect(9, 9, W - 18, H - 18);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.font = "700 202px 'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
    c.fillText(text, W / 2, H * 0.44);
    c.fillStyle = tone || "#ffffff";
    c.font = "500 40px 'Helvetica Neue',Arial,sans-serif";
    c.fillText(en, W / 2, H * 0.845);
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  /* 铺装纹理：8×8 分块 + 块内色差 + 灰缝 + 石屑噪点。
     一块纹理贴 24 米，正好每块石材 3 米——近景拖动时才看得出城市的尺度。 */
  function pavingTexture(base, seed) {
    var S = 512, N = 8, cell = S / N;
    var cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d");
    var col = new THREE.Color(base);
    var br = Math.round(col.r * 255), bg = Math.round(col.g * 255), bb = Math.round(col.b * 255);
    var rd = U.rng(seed === undefined ? 991 : seed);
    c.fillStyle = "rgb(" + br + "," + bg + "," + bb + ")";
    c.fillRect(0, 0, S, S);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var k = 1 + (rd() - 0.5) * 0.13;
        c.fillStyle = "rgb(" + Math.min(255, Math.round(br * k)) + "," +
          Math.min(255, Math.round(bg * k)) + "," + Math.min(255, Math.round(bb * k)) + ")";
        c.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    /* 灰缝：线太粗会让整片地面读成瓷砖，老城街面靠的是整体色差不是格线 */
    c.strokeStyle = "rgba(24,26,22,0.13)"; c.lineWidth = 1.0;
    for (var i = 0; i <= N; i++) {
      c.beginPath(); c.moveTo(i * cell + 0.5, 0); c.lineTo(i * cell + 0.5, S); c.stroke();
      c.beginPath(); c.moveTo(0, i * cell + 0.5); c.lineTo(S, i * cell + 0.5); c.stroke();
    }
    /* 石屑 */
    for (var s = 0; s < 2400; s++) {
      var dark = rd() < 0.55;
      c.fillStyle = "rgba(" + (dark ? "0,0,0," : "255,255,255,") + (0.02 + rd() * 0.055) + ")";
      c.fillRect(rd() * S, rd() * S, 1 + rd() * 3, 1 + rd() * 3);
    }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* 山体纹理：干草坡 + 碎石 + 侵蚀沟。
     谷坡不能是一块均匀的绿色塑料，必须有「上坡发灰、下坡发黄」的横向色带。 */
  function terrainTexture(base, seed) {
    var S = 512, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d");
    var col = new THREE.Color(base);
    var rd2 = U.rng(seed === undefined ? 517 : seed);
    c.fillStyle = "rgb(" + Math.round(col.r * 255) + "," + Math.round(col.g * 255) + "," + Math.round(col.b * 255) + ")";
    c.fillRect(0, 0, S, S);
    /* 大块色斑：几十个半透明椭圆，做出植被与裸土的斑驳 */
    for (var i = 0; i < 140; i++) {
      var t = rd2();
      var cc = t < 0.42 ? "104,110,78" : t < 0.72 ? "126,118,92" : "92,96,82";
      c.fillStyle = "rgba(" + cc + "," + (0.10 + rd2() * 0.22) + ")";
      c.beginPath();
      c.ellipse(rd2() * S, rd2() * S, 18 + rd2() * 90, 12 + rd2() * 56, rd2() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    /* 侵蚀沟：短促的深色斜线，读起来像被雨水切出来的冲沟 */
    c.lineCap = "round";
    for (i = 0; i < 260; i++) {
      var x0 = rd2() * S, y0 = rd2() * S, len = 10 + rd2() * 46, ang = Math.PI * 0.5 + (rd2() - 0.5) * 1.1;
      c.strokeStyle = "rgba(58,62,54," + (0.05 + rd2() * 0.14) + ")";
      c.lineWidth = 0.8 + rd2() * 2.4;
      c.beginPath(); c.moveTo(x0, y0);
      c.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); c.stroke();
    }
    /* 碎石点 */
    for (i = 0; i < 3200; i++) {
      var dk = rd2() < 0.6;
      c.fillStyle = "rgba(" + (dk ? "40,44,38," : "200,198,178,") + (0.03 + rd2() * 0.09) + ")";
      c.fillRect(rd2() * S, rd2() * S, 1 + rd2() * 4, 1 + rd2() * 4);
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  /* 草坪纹理：大块色斑 + 细碎草点，必须**无缝**。
     terrainTexture 是照山体画的，色块直接裁在画布边上，平铺到一大片平地上
     会露出一格一格的接缝，远看就是一块格子布。这里每个色块按 3×3 环绕重复画一遍，
     跨过边界的部分从对面接回来，平铺时才看不出来。 */
  function lawnTexture(base, seed) {
    var S = 512, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d");
    var col = new THREE.Color(base);
    var rd3 = U.rng(seed === undefined ? 811 : seed);
    c.fillStyle = "rgb(" + Math.round(col.r * 255) + "," + Math.round(col.g * 255) + "," + Math.round(col.b * 255) + ")";
    c.fillRect(0, 0, S, S);
    /* 环绕重绘：把一次绘制在 3×3 个偏移上各画一遍 */
    function wrapDraw(fn) {
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          c.save(); c.translate(ox * S, oy * S); fn(); c.restore();
        }
      }
    }
    /* 大色斑：深浅草绿、枯草黄、裸土，柔边椭圆 */
    for (var i = 0; i < 110; i++) {
      var bx = rd3() * S, by = rd3() * S;
      var brx = 22 + rd3() * 96, bry = 16 + rd3() * 64;
      var rot = rd3() * Math.PI, al = 0.05 + rd3() * 0.13;
      var kk = rd3();
      var cf = kk < 0.34 ? "86,104,66" : kk < 0.62 ? "132,128,92" : kk < 0.82 ? "70,86,60" : "150,146,116";
      wrapDraw(function () {
        var gr = c.createRadialGradient(bx, by, 1, bx, by, Math.max(brx, bry));
        gr.addColorStop(0, "rgba(" + cf + "," + al + ")");
        gr.addColorStop(1, "rgba(" + cf + ",0)");
        c.fillStyle = gr;
        c.beginPath(); c.ellipse(bx, by, brx, bry, rot, 0, Math.PI * 2); c.fill();
      });
    }
    /* 草点：细碎短划，给近景一点织物感 */
    for (var s2 = 0; s2 < 2600; s2++) {
      var sx2 = rd3() * S, sy2 = rd3() * S;
      var sl = 1 + rd3() * 3;
      var lt = rd3() < 0.5;
      c.fillStyle = "rgba(" + (lt ? "196,208,160," : "44,58,38,") + (0.05 + rd3() * 0.14) + ")";
      c.fillRect(sx2, sy2, sl, sl * (0.6 + rd3()));
    }
    var t3 = new THREE.CanvasTexture(cv);
    t3.wrapS = t3.wrapT = THREE.RepeatWrapping;
    t3.encoding = THREE.sRGBEncoding;
    t3.anisotropy = 4;
    return t3;
  }

  /* 水面法线：多方向随机波叠加成高度场再求梯度。
     关键是「波矢必须取整数」——x/y 方向一个周期刚好跨过贴图宽度，
     平铺时才没有接缝；同时方向随机，才不会像几组正弦那样看出规则条纹。
     没有法线扰动的水面在无环境贴图时就是一张纯色板，近景完全不像水。

     波数不能太少：12 组低波矢叠加出来的干涉图样是一个明显的方格（约 5 米一格），
     平铺到湖面上就是一张格子布。这里换成 26 组、最高波矢到 22，
     再按梯度 RMS 归一化，强度跟以前一致，但图样已经散成碎波。 */
  function waterNormal(seed) {
    var S = 256, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d");
    var img = c.createImageData(S, S), d = img.data;
    var rnd = U.rng(seed || 713), W = [], i;
    for (i = 0; i < 26; i++) {
      var kx = Math.round((rnd() * 2 - 1) * 22), ky = Math.round((rnd() * 2 - 1) * 22);
      if (!kx && !ky) kx = 1;
      var km = Math.sqrt(kx * kx + ky * ky);
      W.push({ kx: kx, ky: ky, a: (0.30 + rnd() * 0.80) * Math.exp(-km * 0.048), p: rnd() * Math.PI * 2 });
    }
    function hgt(x, y) {
      var s = 0;
      for (var k = 0; k < W.length; k++) {
        s += W[k].a * Math.sin(6.2831853 * (W[k].kx * x + W[k].ky * y) / S + W[k].p);
      }
      return s;
    }
    /* 先算一遍梯度，量出 RMS，再统一缩放到固定强度：
       波数变了强度不变，不用每次手调系数。 */
    var gx = new Float32Array(S * S), gy = new Float32Array(S * S), acc = 0;
    for (var yy = 0; yy < S; yy++) {
      for (var xx = 0; xx < S; xx++) {
        var q = yy * S + xx;
        gx[q] = hgt(xx + 1, yy) - hgt(xx - 1, yy);
        gy[q] = hgt(xx, yy + 1) - hgt(xx, yy - 1);
        acc += gx[q] * gx[q] + gy[q] * gy[q];
      }
    }
    var rms = Math.sqrt(acc / (S * S)) || 1;
    /* 目标：法线倾角 RMS ≈ 0.10，跟改前的 12 波版本同一量级 */
    var G = 0.10 / rms;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var q2 = y * S + x;
        var nx = -gx[q2] * G, ny = -gy[q2] * G, nz = 1;
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var i2 = (y * S + x) * 4;
        d[i2] = Math.round((nx / l * 0.5 + 0.5) * 255);
        d[i2 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
        d[i2 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
        d[i2 + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* 水面材质：双层法线 + 视距衰减。
     恒定 UV 尺度下，高频法线在远处会被采样成规则条纹——这就是「远处一层淡波纹」的病根。
     叠一层不同尺度、不同相位的法线打散周期性，再按视距把扰动整体压掉，
     远处自然收敛成平滑水面，近处仍有细碎波光。
     roughness 不能太低：法线扰动 + 强镜面反射会把水面碎成一片白麻点。 */
  function waterMaterial(nrm1, nrm2, color, rough, side, envI) {
    var m = new THREE.MeshStandardMaterial({ color: color, roughness: rough,
      metalness: 0.02, normalMap: nrm1, normalScale: new THREE.Vector2(0.15, 0.15),
      envMapIntensity: envI === undefined ? 0.30 : envI,
      side: side === undefined ? THREE.FrontSide : side });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.rip2 = { value: nrm2 };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vRip;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vRip = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", [
          "#include <common>",
          "varying vec2 vRip;",
          "uniform sampler2D rip2;"
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "float ycRipK = mix(0.34, 1.0, 1.0 - smoothstep(140.0, 560.0, length(vViewPosition)));",
          "vec3 ycN2 = texture2D(rip2, vRip * 0.43 + vec2(0.31, 0.67)).xyz * 2.0 - 1.0;",
          "vec3 ycN3 = texture2D(rip2, vRip * 1.71 + vec2(0.53, 0.19)).xyz * 2.0 - 1.0;",
          "vec2 ycRip = (ycN2.xy * 0.60 + ycN3.xy * 0.40) * 0.30 * ycRipK;",
          "normal = normalize(normal + vec3(ycRip.x, 0.0, ycRip.y));"
        ].join("\n"));
    };
    m.customProgramCacheKey = function () { return "yc-river-v2"; };
    return m;
  }

  /* 湖岸线：椭圆 + 三个低频谐波。湖必须「有几个湾」，
     纯椭圆一屏看下去就是一个水池子。96 个点足够平滑。 */
  function lakeShore(L) {
    var n = 96, out = [], rd = U.rng(L.seed || 77);
    var p1 = rd() * 6.283, p2 = rd() * 6.283, p3 = rd() * 6.283;
    var ca = Math.cos(L.rot || 0), sa = Math.sin(L.rot || 0);
    for (var i = 0; i < n; i++) {
      var a = Math.PI * 2 * i / n;
      var k = 1 + (L.wob === undefined ? 0.16 : L.wob) * Math.sin(3 * a + p1)
        + (L.wob2 === undefined ? 0.085 : L.wob2) * Math.sin(5 * a + p2)
        + 0.045 * Math.sin(7 * a + p3);
      var ex = Math.cos(a) * L.rx * k, ez = Math.sin(a) * L.rz * k;
      out.push([L.x + ex * ca - ez * sa, L.z + ex * sa + ez * ca]);
    }
    return out;
  }

  /* 多边形等距外扩，正值向外。
     湖岸线按角度递增生成，(dx, dz) 是切向，向外法线是 (dz, -dx)。 */
  function polyOffset(pts, off) {
    var n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      var dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz) || 1;
      out.push([pts[i][0] + dz / L * off, pts[i][1] - dx / L * off]);
    }
    return out;
  }

  /* 任意两点之间的杆件：桁架、穹顶肋、栈道桩都靠它。
     直接用「把 +Y 转到方向向量」的四元数，比拼 rotation.x/y 稳。 */
  function strut(g, ax, ay, az, bx, by, bz, rad, mat) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    var m = new THREE.Mesh(BOX, mat);
    m.scale.set(rad, L, rad);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / L, dy / L, dz / L));
    m.castShadow = rad > 0.5; m.receiveShadow = true;
    g.add(m); return m;
  }

  /* ------------------------------------------------------------
     路网
     ------------------------------------------------------------ */
  function planRoads(spec, R) {
    var roads = [], rd = U.rng(spec.seed || 1);
    var g = spec.grid || {};
    var ang = g.angle === undefined ? 0 : g.angle;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    function toWorld(u, v) { return [u * ca - v * sa, u * sa + v * ca]; }
    if (g.type !== "none") {
      var sx = g.spacingX || 120, sz = g.spacingZ || 120;
      var i, u, v, pts;
      /* 网格必须收在建成区里。ceil(R/sx) 会多铺一圈（这里 4×148=592，比 R=470 远 122 米），
         那一圈路会直接爬上岭坡——路面条带是贴地形铺的，切进山体后就从坡面上露出一片片浅色板。
         改成 round 后把最外一条夹回边界内侧，边角仍有一圈路，但不会跑到山上去。 */
      var nx = Math.max(1, Math.round(R / sx)), nz = Math.max(1, Math.round(R / sz));
      var uMax = R - 18, vMax = R - 18;
      for (i = -nx; i <= nx; i++) {
        u = Math.max(-uMax, Math.min(uMax, i * sx + (g.jitter ? (rd() - 0.5) * g.jitter : 0)));
        var cls = (i % (g.majorEvery || 3) === 0) ? "avenue" : (Math.abs(i) % 2 === 0 ? "street" : "lane");
        var w = cls === "avenue" ? 30 : cls === "street" ? 16 : 8;
        pts = [];
        for (v = -R + 4; v <= R - 4; v += 40) pts.push(toWorld(u, v));
        roads.push({ pts: pts, w: w, cls: cls, axis: "v" });
      }
      for (i = -nz; i <= nz; i++) {
        v = Math.max(-vMax, Math.min(vMax, i * sz + (g.jitter ? (rd() - 0.5) * g.jitter : 0)));
        var cls2 = (i % (g.majorEvery || 3) === 0) ? "avenue" : (Math.abs(i) % 2 === 0 ? "street" : "lane");
        var w2 = cls2 === "avenue" ? 26 : cls2 === "street" ? 15 : 8;
        pts = [];
        for (u = -R + 4; u <= R - 4; u += 40) pts.push(toWorld(u, v));
        roads.push({ pts: pts, w: w2, cls: cls2, axis: "h" });
      }
    }
    /* 湖：环湖景观道由湖岸线直接推出来。
       让路面跟着岸线走，而不是先画路再挖湖——否则路一定会切进水里。 */
    if (spec.lake) {
      var shore = lakeShore(spec.lake);
      var lk0 = spec.lake;
      var ringPts = polyOffset(shore, lk0.roadOff === undefined ? 34 : lk0.roadOff);
      ringPts.push(ringPts[0]);
      roads.push({ pts: ringPts, w: lk0.roadW || 20, cls: "street", axis: "lake" });
    }
    (spec.rings || []).forEach(function (ring) {
      var n = Math.max(24, Math.round(ring.r * 0.42));
      var pts2 = [];
      for (var k = 0; k <= n; k++) {
        var a = Math.PI * 2 * k / n;
        pts2.push([ring.cx + Math.cos(a) * ring.r, ring.cz + Math.sin(a) * ring.r]);
      }
      roads.push({ pts: pts2, w: ring.w || 26, cls: ring.cls || "avenue", axis: "ring" });
    });
    /* 手工折线：老城的主街与窄巷没法用网格生成，必须逐条画。
       控制点稀疏，用 Catmull-Rom 重采样成平滑曲线，否则折角会像折尺。 */
    function smoothPoly(pts, step) {
      if (pts.length < 2) return pts.slice();
      var P = [pts[0]].concat(pts).concat([pts[pts.length - 1]]);
      var out = [], i, k;
      for (i = 1; i < P.length - 2; i++) {
        var p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        var seg = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
        var n = Math.max(2, Math.round(seg / (step || 20)));
        for (k = 0; k < n; k++) {
          var t = k / n, t2 = t * t, t3 = t2 * t;
          out.push([
            0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
          ]);
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    (spec.paths || []).forEach(function (pa) {
      var src = pa.pts.map(function (q) { return [q[0], q[1]]; });
      var fin = pa.smooth === false ? src : smoothPoly(src, pa.step || 20);
      roads.push({ pts: fin, w: pa.w || 12, cls: pa.cls || "street", axis: "path" });
    });
    (spec.avenues || []).forEach(function (av) {
      var dx = av.to[0] - av.from[0], dz = av.to[1] - av.from[1], len = Math.sqrt(dx * dx + dz * dz);
      var n2 = Math.max(2, Math.round(len / 40)), pts3 = [];
      for (var k2 = 0; k2 <= n2; k2++) pts3.push([av.from[0] + dx * k2 / n2, av.from[1] + dz * k2 / n2]);
      roads.push({ pts: pts3, w: av.w || 34, cls: av.cls || "avenue",
        stone: av.stone === true, asphalt: av.asphalt === true, axis: "diag" });
    });
    return roads;
  }

  /* 线段空间索引：地块避让用 */
  function RoadIndex(roads, cell) {
    this.cell = cell || 70; this.map = {}; this.segs = [];
    var self = this;
    roads.forEach(function (r) {
      for (var i = 0; i < r.pts.length - 1; i++) {
        var a = r.pts[i], b = r.pts[i + 1];
        var s = { ax: a[0], az: a[1], bx: b[0], bz: b[1], hw: r.w / 2, cls: r.cls };
        self.segs.push(s);
        var minX = Math.min(s.ax, s.bx) - s.hw, maxX = Math.max(s.ax, s.bx) + s.hw;
        var minZ = Math.min(s.az, s.bz) - s.hw, maxZ = Math.max(s.az, s.bz) + s.hw;
        for (var cx = Math.floor(minX / self.cell); cx <= Math.floor(maxX / self.cell); cx++)
          for (var cz = Math.floor(minZ / self.cell); cz <= Math.floor(maxZ / self.cell); cz++) {
            var k = cx + "," + cz; (self.map[k] || (self.map[k] = [])).push(s);
          }
      }
    });
  }
  RoadIndex.prototype.near = function (x, z) {
    var k = Math.floor(x / this.cell) + "," + Math.floor(z / this.cell);
    return this.map[k] || [];
  };

  /* 线段是否与矩形（局部坐标）相交；矩形按道路半宽扩张 */
  function segHitsRect(s, cx, cz, hw, hd, pad) {
    var ex = hw + s.hw + pad, ez = hd + s.hw + pad;
    var ax = s.ax - cx, az = s.az - cz, bx = s.bx - cx, bz = s.bz - cz;
    var dx = bx - ax, dz = bz - az, t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-6) { if (Math.abs(ax) > ex) return false; }
    else {
      var ta = (-ex - ax) / dx, tb = (ex - ax) / dx;
      if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    if (Math.abs(dz) < 1e-6) { if (Math.abs(az) > ez) return false; }
    else {
      var tc = (-ez - az) / dz, td = (ez - az) / dz;
      if (tc > td) { var tm2 = tc; tc = td; td = tm2; }
      t0 = Math.max(t0, tc); t1 = Math.min(t1, td);
      if (t0 > t1) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------
     街道设施材质与基元
     ------------------------------------------------------------ */
  /* 局部平台基准面：广场这类「整块落在某处」的构件用得到。
     建筑内部一律为 0——构件坐标是相对楼体的。 */
  var YBASE = 0;
  /* 屋顶光伏覆盖率。roofClutter 拿不到 spec，用模块级变量传。
     D12 是第一个把「屋顶」当立面的区：俯视时屋顶比墙面的像素还多，
     一片深蓝的光伏阵列是它在全城唯一认得出的颜色。 */
  var SOLAR_RATE = 0;
  function put(g, geo, w, h, d, x, y, z, mat, ry) {
    var m = new THREE.Mesh(geo || BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y + YBASE, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = h > 0.6; m.receiveShadow = true; g.add(m); return m;
  }

  /* 屋顶杂物：水箱、空调外机、楼梯间、天线、女儿墙——近景真实感主要来自这些 */
  function roofClutter(g, w, d, y, rd, M) {
    var n = 1 + Math.floor(rd() * 3);
    /* 女儿墙必须是四道薄墙。写成整块盖板会把整个屋顶铺成浅灰，远看就是一顶白帽子。 */
    var ph = 0.72, pt = 0.42, ow = w + 0.55, od = d + 0.55;
    put(g, BOX, ow, ph, pt, 0, y + ph / 2, (od - pt) / 2, M.parapet);
    put(g, BOX, ow, ph, pt, 0, y + ph / 2, -(od - pt) / 2, M.parapet);
    put(g, BOX, pt, ph, od - pt * 2, (ow - pt) / 2, y + ph / 2, 0, M.parapet);
    put(g, BOX, pt, ph, od - pt * 2, -(ow - pt) / 2, y + ph / 2, 0, M.parapet);

    /* 大屋面不能是一块空白板：铺碎石分块 + 天窗阵列，近景俯看才有层次。 */
    if (w > 8 && d > 8 && rd() < 0.78) {
      var cols = Math.max(2, Math.min(7, Math.round(w / 5)));
      var rows = Math.max(2, Math.min(7, Math.round(d / 5)));
      var pw = (w - 1.4) / cols, pd = (d - 1.4) / rows;
      for (var ci = 0; ci < cols; ci++) {
        for (var ri = 0; ri < rows; ri++) {
          var rp = rd();
          if (rp < 0.16) continue;
          put(g, BOX, pw * 0.9, 0.14, pd * 0.9,
            -w / 2 + 0.7 + pw * (ci + 0.5), y + 0.07,
            -d / 2 + 0.7 + pd * (ri + 0.5),
            rp < 0.62 ? M.roofGravel : M.roofPanel);
        }
      }
      if (rd() < 0.45 && w > 13) {
        for (var sk = 0; sk < 3; sk++) {
          put(g, BOX, 3.4, 0.45, 1.9, (rd() - 0.5) * w * 0.5, y + 0.32,
            (rd() - 0.5) * d * 0.5, M.skylight);
        }
      }
    }
    put(g, BOX, 2.2 + rd() * 1.8, 2.0, 2.0 + rd() * 1.4, (rd() - 0.5) * w * 0.4, y + 1.0, (rd() - 0.5) * d * 0.4, M.concreteDark);
    /* 屋顶光伏：一排排朝南的倾角板。
       板面必须比屋面高出 0.5 米，否则在掠射光下和屋面同处一层，
       整片屋顶只是一块深灰，读不出「这是光伏」。
       倾角 17°：再大，板在俯视里被投影压成一条线；再小，就成了一块地砖。 */
    if (SOLAR_RATE > 0 && w > 10 && d > 9 && rd() < SOLAR_RATE) {
      var srows = Math.max(2, Math.min(4, Math.round(d / 5.4)));
      var spw = Math.max(4, w - 2.8), sgap = (d - 1.8) / srows;
      for (var sr = 0; sr < srows; sr++) {
        var spz = -d / 2 + 0.9 + sgap * (sr + 0.5);
        var pvm = put(g, BOX, spw, 0.13, 1.45, 0, y + 0.58, spz, M.ecoSolar);
        pvm.rotation.x = 0.30;
        put(g, BOX, spw * 0.9, 0.30, 0.16, 0, y + 0.30, spz - 0.62, M.metalDark);
      }
    }
    for (var i = 0; i < n; i++) {
      var t = rd();
      if (t < 0.34) {
        put(g, CYL, 1.5, 1.9, 1.5, (rd() - 0.5) * w * 0.6, y + 0.95, (rd() - 0.5) * d * 0.6, M.tank);
        put(g, BOX, 0.16, 1.5, 0.16, 0, y + 1.9, 0, M.metal);
      } else if (t < 0.70) {
        put(g, BOX, 1.5, 0.75, 1.1, (rd() - 0.5) * w * 0.62, y + 0.38, (rd() - 0.5) * d * 0.62, M.metal);
      } else {
        put(g, BOX, 0.10, 3.6, 0.10, (rd() - 0.5) * w * 0.5, y + 1.8, (rd() - 0.5) * d * 0.5, M.metal);
      }
    }
  }

  /* ------------------------------------------------------------
     近景细部：檐口 / 腰线 / 底层店面
     侧上方近景下，一栋 12 米宽的民房在屏幕上只有几十像素，
     真正能被读出来的只有「水平挑檐」「底层深色店面带」这两样。
     所以细部不是堆细节，而是把这两条横线做足。
     ------------------------------------------------------------ */
  /* 挑檐：厚挑板 + 薄线脚。必须比坡顶底面更宽，否则会被屋顶完全吃掉。 */
  function cornice(g, w, d, y, M, rd, tone) {
    var co = Math.min(1.45, 0.042 * Math.min(w, d) + 0.46);
    var mat = tone || (rd && rd() < 0.22 ? M.timberTrim : M.stoneTrim);
    put(g, BOX, w + co * 2, 0.40, d + co * 2, 0, y - 0.20, 0, mat);
    put(g, BOX, w + co * 2 + 0.24, 0.15, d + co * 2 + 0.20, 0, y - 0.47, 0, mat);
    return co;
  }
  /* 楼层腰线：一道薄挑带打通四面，比窗格贴图更能读出层数 */
  function beltCourse(g, w, d, y, M) {
    put(g, BOX, w + 0.26, 0.15, d + 0.26, 0, y, 0, M.stoneTrim);
  }
  /* 底层店面：朝 ±z 两面贴深色玻璃带，其中一面留门洞、门套、踏步、雨篷。
     老城沿街一层全是铺面，缺了这一层整条街就像住宅区，尺度感会整体偏大。 */
  function shopBand(g, o, M, rd, ox, simple) {
    var w = o.w, d = o.d, fz = d / 2, cx = ox || 0;
    if (w < 4.2 || d < 4.0) return;
    [-1, 1].forEach(function (sd) {
      var z = sd * (fz + 0.07), zf = sd * (fz + 0.10);
      put(g, BOX, w * 0.84, 2.62, 0.14, cx, 1.50, z, M.shopGlass);
      /* 窗台石 + 玻璃分格竖梃：没有竖梃的店面就是一条黑带 */
      put(g, BOX, w * 0.88, 0.20, 0.22, cx, 0.52, z, M.stoneTrim);
      var nb = Math.max(2, Math.round(w / 2.6));
      for (var bi = 1; bi < nb; bi++) {
        put(g, BOX, 0.13, 2.62, 0.18, cx - w * 0.42 + w * 0.84 * bi / nb, 1.50, zf, M.timberTrim);
      }
      /* 门洞只做一面，另一面看过去是橱窗，反而不违和 */
      if (!simple && sd > 0 && w > 5.0) {
        var dx = cx + (rd() - 0.5) * w * 0.30;
        put(g, BOX, 1.16, 2.62, 0.20, dx, 1.31, zf, M.doorDark);
        put(g, BOX, 0.20, 2.86, 0.30, dx - 0.72, 1.43, zf, M.stoneTrim);
        put(g, BOX, 0.20, 2.86, 0.30, dx + 0.72, 1.43, zf, M.stoneTrim);
        put(g, BOX, 1.92, 0.24, 0.34, dx, 2.98, zf, M.stoneTrim);
        put(g, BOX, 1.86, 0.16, 0.58, dx, 0.08, sd * (fz + 0.36), M.paving3);
        if (rd() < 0.58) {
          put(g, BOX, Math.min(w * 0.72, 5.6), 0.13, 1.45, dx, 3.44, sd * (fz + 0.80),
            rd() < 0.5 ? M.canopy : M.canopy2);
        }
      }
    });
    return true;
  }
  /* 院墙墙帽：一圈裸砖口看着像没盖完，必须在墙顶压一道石帽。
     四面墙高度不同，所以逐面传参，不写成环形。 */
  function wallCap(g, len, t, x, y, z, vertical, M, rd) {
    var mat = rd && rd() < 0.4 ? M.timberTrim : M.stoneTrim;
    if (vertical) put(g, BOX, t + 0.9, 0.30, len + 0.9, x, y - 0.15, z, mat);
    else put(g, BOX, len + 0.9, 0.30, t + 0.9, x, y - 0.15, z, mat);
  }

  /* ------------------------------------------------------------
     城主演说广场：北侧演说台 + 扇形看台，中轴五组喷泉
     坐标约定：-z 为北（远端），+z 为南（朝向默认机位）。
     ------------------------------------------------------------ */
  function buildCivic(grp, pz, M, rd) {
    var Y = 0.21;                      /* 广场铺装顶面 */
    var x0 = pz.x, z0 = pz.z;
    var P = function (geo, w, h, d, x, y, z, mat, ry) {
      put(grp, geo, w, h, d, x0 + x, Y + y + h / 2, z0 + z, mat, ry);
    };

    /* 1. 三级台基 + 主台（台面 3.6m 高，后排也看得见城主） */
    P(BOX, 48, 1.2, 27, 0, 0, -43, M.civic);
    P(BOX, 40, 1.2, 20, 0, 1.2, -45, M.civic);
    P(BOX, 32, 1.2, 14, 0, 2.4, -46, M.civicDark);
    /* 台前踏步 */
    P(BOX, 46, 1.2, 4.2, 0, 0, -30.6, M.civic);
    P(BOX, 42, 2.4, 2.8, 0, 0, -33.0, M.civic);

    /* 2. 背后景墙：必须高过雨棚，否则从台下看只剩一块顶板 */
    P(BOX, 34, 14.5, 2.0, 0, 3.6, -52.6, M.civicDark);
    P(BOX, 36.5, 1.0, 3.2, 0, 18.1, -52.6, M.civicTrim);
    P(BOX, 30, 3.4, 0.5, 0, 12.4, -51.5, M.civicDark);
    /* 两侧翼墙，把舞台框住 */
    [-1, 1].forEach(function (s) {
      P(BOX, 5.5, 9.5, 11, s * 19.5, 3.6, -47.5, M.civic);
      P(BOX, 6.2, 0.8, 11.8, s * 19.5, 13.1, -47.5, M.civicTrim);
    });

    /* 3. 雨棚只罩讲台，四根细柱撑起 */
    [[-6.5, -49.5], [6.5, -49.5], [-6.5, -41.5], [6.5, -41.5]].forEach(function (c) {
      P(BOX, 0.55, 8.6, 0.55, c[0], 3.6, c[1], M.metal);
    });
    P(BOX, 17, 0.55, 10.5, 0, 12.2, -45.5, M.civicDark);
    P(BOX, 18.2, 0.3, 11.6, 0, 12.75, -45.5, M.civicTrim);

    /* 4. 讲台、音响塔、旗杆 */
    P(BOX, 2.0, 1.15, 1.0, 0, 3.6, -46.5, M.wood);
    P(BOX, 0.14, 0.55, 0.14, -0.4, 4.75, -46.5, M.metalDark);
    P(BOX, 0.14, 0.55, 0.14, 0.4, 4.75, -46.5, M.metalDark);
    [-1, 1].forEach(function (s) {
      P(BOX, 3.2, 8.8, 3.2, s * 18.5, 0, -48, M.metalDark);
      P(BOX, 4.0, 0.5, 4.0, s * 18.5, 8.8, -48, M.metal);
    });
    [-1, 1].forEach(function (s) {
      [-22, -28].forEach(function (fx) {
        P(BOX, 0.22, 14, 0.22, s * Math.abs(fx), 0, -38.5, M.metal);
        P(BOX, 3.2, 1.9, 0.12, s * Math.abs(fx) + 1.7, 11.6, -38.5, M.canopy);
      });
    });

    /* 5. 扇形看台：四级递减，站席约 3000 人 */
    P(BOX, 92, 1.05, 5.0, 0, 0, -26.5, M.civicTrim);
    P(BOX, 106, 0.78, 5.0, 0, 0, -21.5, M.civicTrim);
    P(BOX, 120, 0.52, 5.0, 0, 0, -16.5, M.civicTrim);
    P(BOX, 134, 0.26, 5.0, 0, 0, -11.5, M.civicTrim);

    /* 6. 水池：池壁必须做成「沿」，实心柱/盒会把水整个包住看不见 */
    function rimRect(w, d, t, h, x, z, mat) {
      P(BOX, w, h, t, x, 0, z - (d - t) / 2, mat);
      P(BOX, w, h, t, x, 0, z + (d - t) / 2, mat);
      P(BOX, t, h, d - t * 2, x - (w - t) / 2, 0, z, mat);
      P(BOX, t, h, d - t * 2, x + (w - t) / 2, 0, z, mat);
    }
    function rimCircle(r, t, h, x, z, mat, n) {
      for (var k = 0; k < n; k++) {
        var a2 = Math.PI * 2 * (k + 0.5) / n;
        var seg = 2 * r * Math.tan(Math.PI / n) * 1.06;
        P(BOX, seg, h, t, x + Math.cos(a2) * r, 0, z + Math.sin(a2) * r, mat, -(a2 + Math.PI / 2));
      }
    }

    /* 7. 中央主喷泉：三环水柱 + 中心高喷 */
    var fx0 = 0, fz0 = 30;
    rimCircle(20.6, 2.0, 1.15, fx0, fz0, M.kerb, 28);
    P(CYL, 39.2, 1.02, 39.2, fx0, 0.02, fz0, M.water);
    var i, j, a, rr;
    for (i = 0; i < 20; i++) {
      a = Math.PI * 2 * i / 20;
      P(CYL6, 0.62, 4.6 + (i % 3) * 0.9, 0.62, fx0 + Math.cos(a) * 16.5, 0.4, fz0 + Math.sin(a) * 16.5, M.jet);
      P(SPH, 2.0, 1.4, 2.0, fx0 + Math.cos(a) * 16.5, 5.1 + (i % 3) * 0.9, fz0 + Math.sin(a) * 16.5, M.jet);
    }
    for (i = 0; i < 12; i++) {
      a = Math.PI * 2 * i / 12;
      P(CYL6, 0.68, 7.6, 0.68, fx0 + Math.cos(a) * 10, 0.4, fz0 + Math.sin(a) * 10, M.jet);
      P(SPH, 2.6, 1.8, 2.6, fx0 + Math.cos(a) * 10, 8.1, fz0 + Math.sin(a) * 10, M.jet);
    }
    P(CYL6, 1.15, 13.0, 1.15, fx0, 0.4, fz0, M.jet);
    P(SPH, 5.0, 3.4, 5.0, fx0, 13.7, fz0, M.jet);
    P(SPH, 7.6, 1.6, 7.6, fx0, 3.7, fz0, M.jet);

    /* 8. 两侧镜面水池 + 跌落水口 */
    [-1, 1].forEach(function (s2) {
      var px2 = s2 * 58;
      rimRect(49, 16.5, 1.6, 1.0, px2, fz0, M.kerb);
      P(BOX, 45.8, 0.86, 13.3, px2, 0.06, fz0, M.water);
      for (j = -1; j <= 1; j++) {
        P(CYL6, 0.55, 3.0, 0.55, px2 + j * 12, 0.5, fz0, M.jet);
        P(SPH, 1.8, 1.2, 1.8, px2 + j * 12, 3.6, fz0, M.jet);
      }
    });

    /* 9. 四角小喷泉 */
    [[-72, -52], [72, -52], [-72, 52], [72, 52]].forEach(function (p) {
      rimCircle(6.2, 1.0, 0.85, p[0], p[1], M.kerb, 14);
      P(CYL, 11.6, 0.72, 11.6, p[0], 0.04, p[1], M.water);
      P(CYL6, 0.6, 4.6, 0.6, p[0], 0.5, p[1], M.jet);
      P(SPH, 2.4, 1.6, 2.4, p[0], 5.3, p[1], M.jet);
    });

    /* 9. 双排林荫 + 旗阵 + 灯柱 */
    for (i = -5; i <= 5; i++) {
      rr = i * 11;
      [-1, 1].forEach(function (s) {
        P(CYL6, 0.55, 4.4, 0.55, s * 84, 0, rr, M.trunk);
        P(SPH, 7.2, 5.4, 7.2, s * 84, 2.6, rr, rd() < 0.5 ? M.leaf : M.leaf2);
      });
    }
    for (i = -5; i <= 5; i++) {
      P(BOX, 0.22, 8.5, 0.22, i * 15, 0, 68, M.metalDark);
      P(BOX, 1.6, 1.0, 0.12, i * 15 + (i >= 0 ? 0.8 : -0.8), 8.0, 68, M.canopy);
    }
    for (i = -2; i <= 2; i++) {
      [-1, 1].forEach(function (s) {
        P(BOX, 0.24, 7, 0.24, s * 60, 0, i * 20 - 6, M.metalDark);
        P(BOX, 0.8, 0.34, 0.8, s * 60, 7, i * 20 - 6, M.beacon);
      });
    }
  }

  /* ------------------------------------------------------------
     建筑原型。o = {w 面宽, d 进深, h 高, mat 立面, ...}
     ------------------------------------------------------------ */
  var ARCH = {};

  ARCH.slab = function (g, o, M, rd) {
    put(g, BOX, o.w, o.h, o.d, 0, o.h / 2, 0, o.mat);
    if (o.h > 18 && rd() < 0.7) {
      var bands = Math.min(9, Math.floor(o.h / 6));
      for (var i = 0; i < bands; i++) {
        var y = o.h * (i + 1) / (bands + 1);
        put(g, BOX, o.w + 1.2, 0.22, o.d + 1.2, 0, y, 0, M.band);
      }
    }
    roofClutter(g, o.w, o.d, o.h, rd, M);
  };

  ARCH.podium = function (g, o, M, rd) {
    var podH = Math.max(5, o.h * 0.18), podW = o.w * 1.06, podD = Math.max(o.d, o.d * 1.1);
    put(g, BOX, podW, podH, podD, 0, podH / 2, 0, o.mat);
    put(g, BOX, podW + 1.6, 0.5, podD + 1.6, 0, podH, 0, M.roofFlat);
    for (var pk = 0; pk < 3; pk++) put(g, BOX, 2.4, 1.1, 1.6, (rd() - 0.5) * podW * 0.7, podH + 0.7, (rd() - 0.5) * podD * 0.7, M.metal);
    put(g, BOX, o.w * 0.8, o.h - podH, o.d * 0.8, 0, podH + (o.h - podH) / 2, 0, o.mat);
    if (rd() < 0.55) put(g, BOX, o.w * 0.55, 1.3, o.d * 0.55, 0, o.h + 0.65, 0, M.metal);
    roofClutter(g, o.w * 0.8, o.d * 0.8, o.h, rd, M);
  };

  ARCH.tower = function (g, o, M, rd) {
    var podH = Math.max(6, o.h * 0.12);
    put(g, BOX, o.w, podH, o.d, 0, podH / 2, 0, o.mat);
    put(g, BOX, o.w + 1.4, 0.55, o.d + 1.4, 0, podH + 0.2, 0, M.band);
    var shaftH = o.h - podH, sw = o.w * 0.66, sd = o.d * 0.66;
    if (rd() < 0.5) {
      put(g, BOX, sw, shaftH * 0.62, sd, 0, podH + shaftH * 0.31, 0, o.mat);
      put(g, BOX, sw * 0.82, shaftH * 0.38, sd * 0.82, 0, podH + shaftH * 0.81, 0, o.mat);
      put(g, BOX, sw * 0.9, 0.6, sd * 0.9, 0, podH + shaftH * 0.62, 0, M.band);
    } else {
      put(g, BOX, sw, shaftH, sd, 0, podH + shaftH / 2, 0, o.mat);
    }
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
      put(g, BOX, 1.5, shaftH, 1.5, c[0] * sw * 0.46, podH + shaftH / 2, c[1] * sd * 0.46, M.metal);
    });
    var crownH = 2 + rd() * 6;
    put(g, BOX, sw * 0.7, crownH, sd * 0.7, 0, podH + shaftH + crownH / 2, 0, M.metal);
    if (rd() < 0.6) put(g, BOX, 0.28, 12 + rd() * 16, 0.28, 0, podH + shaftH + crownH + 7, 0, M.metalDark);
  };

  ARCH.glassTower = function (g, o, M, rd) {
    var podH = Math.max(6, o.h * 0.10);
    put(g, BOX, o.w, podH, o.d, 0, podH / 2, 0, M.concrete);
    var sw = o.w * 0.72, sd = o.d * 0.72, h = o.h - podH;
    put(g, BOX, sw, h, sd, 0, podH + h / 2, 0, o.mat);
    var cols = Math.max(3, Math.round(sw / 7));
    for (var i = 0; i <= cols; i++) {
      var x = -sw / 2 + sw * i / cols;
      put(g, BOX, 0.55, h, 0.55, x, podH + h / 2, sd / 2, M.metal);
      put(g, BOX, 0.55, h, 0.55, x, podH + h / 2, -sd / 2, M.metal);
    }
    for (var f = 1; f < Math.floor(h / 8); f++) {
      put(g, BOX, sw + 0.5, 0.5, sd + 0.5, 0, podH + f * 8, 0, M.metal);
    }
    var capH = 3 + rd() * 8;
    put(g, BOX, sw * 0.9, capH, sd * 0.9, 0, podH + h + capH / 2, 0, M.metal);
    if (rd() < 0.45) {
      put(g, BOX, 1.2, 6, 1.2, 0, podH + h + capH + 3, 0, M.metalDark);
      put(g, SPH, 1.1, 1.1, 1.1, 0, podH + h + capH + 6.4, 0, M.beacon);
    }
  };

  ARCH.twin = function (g, o, M, rd) {
    var w2 = o.w * 0.42, h1 = o.h, h2 = o.h * (0.72 + rd() * 0.24);
    put(g, BOX, o.w, 6, o.d, 0, 3, 0, o.mat);
    put(g, BOX, w2, h1 - 6, o.d * 0.8, -o.w * 0.26, 6 + (h1 - 6) / 2, 0, o.mat);
    put(g, BOX, w2, h2 - 6, o.d * 0.8, o.w * 0.26, 6 + (h2 - 6) / 2, 0, o.mat);
    var brY = 6 + Math.min(h1, h2) * 0.56;
    put(g, BOX, o.w * 0.52, 3.2, 4.4, 0, brY, 0, M.glass);
  };

  ARCH.courtyard = function (g, o, M, rd) {
    var t = 6 + rd() * 4, h = o.h;
    /* 四面院墙高度必须各不相同，否则围合出来是个方盒子。
       墙顶一律压石帽，坡顶落在各自墙顶而不是统一高度。 */
    var hN = h, hS = h * (0.80 + rd() * 0.16);
    var hW = h * (0.86 + rd() * 0.14), hE = h * (0.84 + rd() * 0.16);
    var dEW = o.d - t * 2;
    put(g, BOX, o.w, hN, t, 0, hN / 2, -o.d / 2 + t / 2, o.mat);
    put(g, BOX, o.w, hS, t, 0, hS / 2, o.d / 2 - t / 2, o.mat);
    put(g, BOX, t, hW, dEW, -o.w / 2 + t / 2, hW / 2, 0, o.mat);
    put(g, BOX, t, hE, dEW, o.w / 2 - t / 2, hE / 2, 0, o.mat);
    put(g, BOX, o.w - t * 2, 0.2, o.d - t * 2, 0, 0.12, 0, M.grass);
    if (rd() < 0.7) put(g, SPH, 5, 5, 5, (rd() - 0.5) * o.w * 0.3, 3.2, (rd() - 0.5) * o.d * 0.3, M.leaf);
    /* 四面坡顶：院落老城没有平屋顶 */
    var rf = M.roofRoll(rd);
    put(g, GABLE, t * 1.12, 2.0 + rd() * 1.6, o.w * 1.02, 0, hN, -o.d / 2 + t / 2, rf, Math.PI / 2);
    put(g, GABLE, t * 1.12, 1.8 + rd() * 1.4, o.w * 1.02, 0, hS, o.d / 2 - t / 2, rf, Math.PI / 2);
    put(g, GABLE, t * 1.12, 1.8 + rd() * 1.4, dEW, -o.w / 2 + t / 2, hW, 0, rf);
    put(g, GABLE, t * 1.12, 1.8 + rd() * 1.4, dEW, o.w / 2 - t / 2, hE, 0, rf);
    if (o.detail > 0) {
      wallCap(g, o.w, t, 0, hN, -o.d / 2 + t / 2, false, M, rd);
      wallCap(g, o.w, t, 0, hS, o.d / 2 - t / 2, false, M, rd);
      wallCap(g, dEW, t, -o.w / 2 + t / 2, hW, 0, true, M, rd);
      wallCap(g, dEW, t, o.w / 2 - t / 2, hE, 0, true, M, rd);
      shopBand(g, o, M, rd, 0, o.detail < 2);
    }
  };

  ARCH.rowHouse = function (g, o, M, rd) {
    var units = Math.max(2, Math.round(o.w / 7)), uw = o.w / units;
    for (var i = 0; i < units; i++) {
      var x = -o.w / 2 + uw * (i + 0.5);
      var uh = o.h * (0.82 + rd() * 0.36), ud = o.d * (0.9 + rd() * 0.08);
      var mat = rd() < 0.22 ? M.win[Math.floor(rd() * M.win.length)] : o.mat;
      put(g, BOX, uw - 0.12, uh, ud, x, uh / 2, 0, mat);
      /* 檐口必须按单元各自的高度放：一排四户高矮不同，
         挑檐跟着错落，才会出老城那种锯齿状的水平线。 */
      if (o.detail > 0) cornice(g, uw - 0.12, ud, uh, M, rd);
      var gable = put(g, GABLE, uw - 0.1, 3 + rd() * 3, ud, x, uh, 0, M.roofRoll(rd));
      gable.castShadow = true;
      if (o.detail > 0) shopBand(g, { w: uw - 0.5, d: ud }, M, rd, x, o.detail < 2);
      if (rd() < 0.6) put(g, BOX, 0.9, 0.9, 0.9, x + uw * 0.28, uh + 4.4, 0, M.brick);
    }
  };

  ARCH.loft = function (g, o, M, rd) {
    put(g, BOX, o.w, o.h, o.d, 0, o.h / 2, 0, o.mat);
    var cols = Math.max(2, Math.round(o.w / 6));
    for (var i = 0; i <= cols; i++) {
      var x = -o.w / 2 + o.w * i / cols;
      put(g, BOX, 0.8, o.h, 0.8, x, o.h / 2, o.d / 2 + 0.2, M.steel);
      put(g, BOX, 0.8, o.h, 0.8, x, o.h / 2, -o.d / 2 - 0.2, M.steel);
    }
    for (var f = 1; f < Math.floor(o.h / 5); f++) {
      put(g, BOX, o.w + 0.6, 0.45, 0.5, 0, f * 5, o.d / 2 + 0.25, M.steel);
    }
    put(g, BOX, o.w + 1.4, 0.5, o.d + 1.4, 0, o.h, 0, M.steel);
    roofClutter(g, o.w, o.d, o.h, rd, M);
  };

  ARCH.warehouse = function (g, o, M, rd) {
    put(g, BOX, o.w, o.h, o.d, 0, o.h / 2, 0, o.mat);
    var bays = Math.max(2, Math.round(o.w / 12));
    for (var i = 0; i < bays; i++) {
      var x = -o.w / 2 + o.w * (i + 0.5) / bays;
      var s = put(g, BOX, o.w / bays * 0.9, 0.35, o.d * 0.9, x, o.h + 1.4, 0, M.metal);
      s.rotation.z = 0.22;
      put(g, BOX, o.w / bays * 0.7, o.h * 0.62, 0.3, x, o.h * 0.31, o.d / 2 + 0.1, M.door);
      put(g, BOX, 6, 1.1, 3.4, x + 3, 5.4, o.d / 2 + 1.6, M.canopy);
    }
    put(g, BOX, o.w + 1, 1.1, o.d + 1, 0, o.h + 0.6, 0, M.metal);
  };

  ARCH.hangar = function (g, o, M, rd) {
    put(g, BOX, o.w, o.h * 0.5, o.d, 0, o.h * 0.25, 0, o.mat);
    var v = put(g, VAULT, o.w, o.h * 0.55, o.d, 0, o.h * 0.5, 0, M.metal);
    v.castShadow = true;
    put(g, BOX, o.w * 0.42, o.h * 0.38, 0.4, 0, o.h * 0.19, o.d / 2 + 0.2, M.door);
  };

  /* ------------------------------------------------------------
     云湖研究院：玻璃穹顶、射电望远镜、实验庭院、景观桥
     ------------------------------------------------------------ */

  /* 玻璃穹顶会议中庭：台基 + 玻璃鼓座 + 肋拱穹顶 + 采光亭。
     半个球壳加一个圆柱是「穹顶」的通用近似，但真正让它像会议中庭的是
     鼓座那一圈密排竖梃——远看是一道亮线，近看才有玻璃的读法。 */
  ARCH.conferenceDome = function (g, o, M, rd) {
    var r = Math.min(o.w, o.d) * 0.5, i;
    var drumH = Math.max(7, o.h * 0.30), baseY = 2.9;
    put(g, CYL, r * 2.36, 1.7, r * 2.36, 0, 0.85, 0, M.civicTrim);
    put(g, CYL, r * 2.18, 1.3, r * 2.18, 0, 2.25, 0, M.paving2);
    /* 环廊柱：16 根，给台基一点厚度 */
    for (i = 0; i < 16; i++) {
      var ca = Math.PI * 2 * i / 16;
      put(g, CYL6, 1.5, baseY - 1.0, 1.5,
        Math.cos(ca) * r * 1.14, (baseY - 1.0) / 2 + 1.6, Math.sin(ca) * r * 1.14, M.whiteMetal);
    }
    put(g, CYL, r * 2.02, drumH, r * 2.02, 0, baseY + drumH / 2, 0, M.glassDome);
    var nCol = 36;
    for (i = 0; i < nCol; i++) {
      var a = Math.PI * 2 * i / nCol;
      put(g, BOX, 0.55, drumH, 0.55, Math.cos(a) * r * 1.006, baseY + drumH / 2,
        Math.sin(a) * r * 1.006, M.whiteMetal);
    }
    /* 鼓座上下两道环梁：穹顶必须"坐"在一条实线上 */
    put(g, CYL, r * 2.09, 0.9, r * 2.09, 0, baseY + 0.45, 0, M.whiteMetal);
    put(g, CYL, r * 2.12, 1.1, r * 2.12, 0, baseY + drumH, 0, M.whiteMetal);

    var capY = baseY + drumH + 1.1, capH = r * 0.84, shellR = r * 1.03;
    var cap = put(g, HEMI, shellR * 2, capH, shellR * 2, 0, capY, 0, M.domeShell);
    cap.castShadow = true;
    /* 经向肋：每 30° 一条，沿半球采样 5 段用杆件连起来。
       直线杆件贴球面会有极小误差，但 5 段之后肉眼看不出折线。
       肋必须架在壳面上（半径比壳略大一两厘米级），
       放在壳里就只剩玻璃后面几道影子，穹顶会读成一顶光秃秃的绿帽子。 */
    for (i = 0; i < 12; i++) {
      var am = Math.PI * 2 * i / 12, px = shellR, py = 0;
      for (var k = 1; k <= 5; k++) {
        var ph = (Math.PI / 2) * k / 5;
        var nx = shellR * Math.cos(ph) * 1.006, ny = capH * Math.sin(ph) * 1.012;
        strut(g, Math.cos(am) * px, capY + py, Math.sin(am) * px,
          Math.cos(am) * nx, capY + ny, Math.sin(am) * nx, 0.55, M.whiteMetal);
        px = nx; py = ny;
      }
    }
    /* 采光亭：塔尖上的小体量，直径必须远小于穹顶。
       按 0.36r 做出来是一个直径近四十米的白色蘑菇盖，
       从任何角度看都像穹顶被压扁了一角。 */
    var lantR = Math.max(2.2, r * 0.13);
    put(g, CYL, lantR * 2, 0.9, lantR * 2, 0, capY + capH * 0.985, 0, M.whiteMetal);
    put(g, CYL, lantR * 1.82, 3.6, lantR * 1.82, 0, capY + capH + 2.0, 0, M.glassDome);
    put(g, CYL, lantR * 2.1, 0.7, lantR * 2.1, 0, capY + capH + 4.1, 0, M.whiteMetal);
    put(g, SPH, 1.1, 1.1, 1.1, 0, capY + capH + 5.0, 0, M.beacon);
  };

  /* 射电望远镜：抛物面必须真按 r²/4f 画。
     用半球或倒锥充数的话，从任何角度看都只是一顶帽子；
     真正的碟形之所以一眼可辨，靠的是「浅碗 + 三脚馈源 + 仰角支架」这三件事。 */
  ARCH.dish = function (g, o, M, rd) {
    var R0 = Math.min(o.w, o.d) * 0.5;
    var pedH = Math.max(11, o.h * 0.44), i;
    put(g, CYL, R0 * 0.78, 1.5, R0 * 0.78, 0, 0.75, 0, M.civicDark);
    put(g, CYL, R0 * 0.54, pedH, R0 * 0.54, 0, pedH / 2 + 1.3, 0, M.concrete);
    for (i = 0; i < 4; i++) {
      var sa0 = Math.PI / 4 + Math.PI / 2 * i;
      strut(g, Math.cos(sa0) * R0 * 0.74, 1.5, Math.sin(sa0) * R0 * 0.74,
        Math.cos(sa0) * R0 * 0.33, pedH * 0.74, Math.sin(sa0) * R0 * 0.33, 1.3, M.concrete);
    }
    put(g, CYL, R0 * 0.48, 2.0, R0 * 0.48, 0, pedH + 1.3, 0, M.metalDark);

    /* 碟体独立成组：整组按仰角与方位转，馈源跟着一起走 */
    var dgr = new THREE.Group();
    dgr.position.set(0, pedH + 2.2, 0);
    dgr.rotation.set(0.52, 0.6, 0);
    g.add(dgr);

    var f = R0 * 0.44;
    var pts = [];
    for (i = 0; i <= 16; i++) {
      var rr = R0 * i / 16;
      pts.push(new THREE.Vector2(rr, rr * rr / (4 * f)));
    }
    var bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), M.dishFace);
    bowl.castShadow = true; bowl.receiveShadow = true; dgr.add(bowl);
    /* 边缘加强环：碟口一圈实线，否则远看碟子的边界会糊进天空 */
    var rimY = R0 * R0 / (4 * f);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.995, R0 * 0.028, 8, 48), M.whiteMetal);
    rim.rotation.x = Math.PI / 2; rim.position.y = rimY; dgr.add(rim);
    /* 背架：碟底的桁架，从侧面看才有"结构"而不是一个碗 */
    for (i = 0; i < 8; i++) {
      var ba = Math.PI * 2 * i / 8;
      strut(dgr, 0, -R0 * 0.18, 0,
        Math.cos(ba) * R0 * 0.5, R0 * 0.18, Math.sin(ba) * R0 * 0.5, 1.1, M.fin);
    }
    /* 馈源：三脚架撑在焦点上 */
    for (i = 0; i < 3; i++) {
      var fa = Math.PI * 2 * i / 3;
      strut(dgr, Math.cos(fa) * R0 * 0.90, Math.pow(R0 * 0.90, 2) / (4 * f),
        Math.sin(fa) * R0 * 0.90, 0, f, 0, 0.45, M.whiteMetal);
    }
    var horn = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.11, R0 * 0.05, R0 * 0.20, 12), M.metalDark);
    horn.position.set(0, f, 0); dgr.add(horn);
  };

  /* 实验庭院：三翼围合、南向开口的实验室组团。
     研究院的楼不能是老城那种坡顶房子，主面是横白竖玻璃的条带。 */
  function labWing(g, cx, cz, w, d, h, M, rd, mat) {
    put(g, BOX, w, h, d, cx, h / 2, cz, mat || M.win[0]);
    var f, i;
    /* 每层一道白色挑檐：有了这层水平带，白盒子才读成实验楼 */
    for (f = 1; f <= Math.floor(h / 4.2); f++) {
      put(g, BOX, w + 0.7, 0.45, d + 0.7, cx, f * 4.2, cz, M.whiteMetal);
    }
    put(g, BOX, w + 1.1, 0.7, d + 1.1, cx, h + 0.3, cz, M.whiteMetal);
    /* 屋顶设备 */
    var nEq = 1 + Math.floor(rd() * 2);
    for (i = 0; i < nEq; i++) {
      put(g, BOX, w * (0.16 + rd() * 0.18), 1.8 + rd() * 1.4, d * 0.24,
        cx + (rd() - 0.5) * w * 0.5, h + 1.2, cz + (rd() - 0.5) * d * 0.4, M.hallWall3);
    }
  }
  ARCH.labCourt = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h;
    var wingH = Math.max(8, h * 0.66);
    var bw = Math.max(13, w * 0.26), cw = Math.max(13, d * 0.24);
    put(g, BOX, w * 1.04, 0.5, d * 1.04, 0, 0.25, 0, M.paving2);
    /* 北翼通长，东西两翼退到南端 —— 开口朝街，院子不设门禁 */
    labWing(g, 0, -d / 2 + bw / 2, w, bw, wingH, M, rd, o.mat);
    labWing(g, -w / 2 + cw / 2, bw / 2, cw, d - bw, wingH * 0.9, M, rd, o.mat);
    labWing(g, w / 2 - cw / 2, bw / 2, cw, d - bw, wingH * 0.9, M, rd, o.mat);
    /* 庭院：铺装 + 中心水盘 + 两排树 */
    var iw = w - cw * 2, id = d - bw;
    if (iw > 10 && id > 10) {
      var cz2 = -d / 2 + bw + id / 2;
      put(g, BOX, iw * 0.92, 0.16, id * 0.92, 0, 0.36, cz2, M.paving3);
      put(g, CYL, Math.min(iw, id) * 0.34, 0.22, Math.min(iw, id) * 0.34, 0, 0.5, cz2, M.pool || M.water);
      for (var ti = 0; ti < 4; ti++) {
        for (var sd = -1; sd <= 1; sd += 2) {
          var tx = -iw / 2 + iw * (ti + 0.5) / 4, tz = cz2 + sd * id * 0.36;
          put(g, CYL6, 0.5, 5.4, 0.5, tx, 2.9, tz, M.trunk);
          put(g, SPH, 4.4, 3.4, 4.4, tx, 5.6, tz, rd() < 0.5 ? M.leaf : M.leaf2);
        }
      }
    }
    /* 玻璃连廊：把北翼和两翼接起来，中间那道缝是庭院唯一的硬边界 */
    put(g, BOX, iw * 0.98, 3.6, 4.2, 0, 1.8, -d / 2 + bw + 2.1, M.glassDome);
  };

  /* 景观拱桥：跨湖的那一道。桥面按正弦起拱，栏杆与桥墩跟着桥面走。 */
  ARCH.lakeBridge = function (g, o, M, rd) {
    var span = o.w || 60, wid = o.d || 10, rise = o.h || 7;
    /* 桥面要整体抬起：湖心岛的顶面比水面高 1.2 米左右，
       桥端落在 y=0 就会整个钻进岛里，远看像一段断掉的坡道。 */
    var lift = o.lift === undefined ? 1.35 : o.lift;
    var n = 10, i;
    for (i = 0; i < n; i++) {
      var t0 = i / n, t1 = (i + 1) / n;
      var x0 = -span / 2 + span * t0, x1 = -span / 2 + span * t1;
      var y0 = lift + rise * Math.sin(Math.PI * t0), y1 = lift + rise * Math.sin(Math.PI * t1);
      var seg = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      var ang = Math.atan2(y1 - y0, x1 - x0);
      var dk = put(g, BOX, seg + 0.25, 0.85, wid, (x0 + x1) / 2, (y0 + y1) / 2, 0, M.civicTrim);
      dk.rotation.z = ang;
      [-1, 1].forEach(function (sd) {
        var rl = put(g, BOX, seg + 0.25, 0.16, 0.16,
          (x0 + x1) / 2, (y0 + y1) / 2 + 1.15, sd * wid * 0.46, M.metalDark);
        rl.rotation.z = ang;
        var rl2 = put(g, BOX, seg + 0.25, 0.10, 0.10,
          (x0 + x1) / 2, (y0 + y1) / 2 + 0.62, sd * wid * 0.46, M.metalDark);
        rl2.rotation.z = ang;
      });
    }
    /* 栏杆立柱 */
    for (i = 0; i <= n; i++) {
      var t2 = i / n, px = -span / 2 + span * t2, py = lift + rise * Math.sin(Math.PI * t2);
      [-1, 1].forEach(function (sd2) {
        put(g, BOX, 0.16, 1.25, 0.16, px, py + 0.62, sd2 * wid * 0.46, M.metalDark);
      });
    }
    /* 两端桥台：把桥端和岸面接上，不留一条缝 */
    [-1, 1].forEach(function (se) {
      put(g, BOX, 5.0, lift + 0.9, wid * 0.98, se * (span / 2 - 1.6), (lift - 0.9) / 2, 0, M.civicDark);
    });
    /* 墩：落在水下，桥才不是浮着的 */
    [-0.26, 0.26].forEach(function (pt) {
      var bx = span * pt, by = rise * Math.sin(Math.PI * (0.5 + pt));
      put(g, BOX, wid * 0.42, by + 9, wid * 0.7, bx, (by - 9) / 2, 0, M.civicDark);
    });
  };

  ARCH.dome = function (g, o, M, rd) {
    var r = Math.min(o.w, o.d) * 0.5;
    put(g, CYL, r * 2, o.h * 0.62, r * 2, 0, o.h * 0.31, 0, o.mat);
    var cap = put(g, HEMI, r * 2.1, r * 1.0, r * 2.1, 0, o.h * 0.62, 0, M.domeShell);
    cap.castShadow = true;
    if (rd() < 0.7) put(g, BOX, 0.7, 5, 0.7, 0, o.h * 0.62 + r + 2, 0, M.metal);
  };

  /* 城主府：台基 + 八柱门廊 + 山花 + 鼓座穹顶 */
  ARCH.cityHall = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h, i;
    put(g, BOX, w * 1.18, 1.8, d * 1.14, 0, 0.9, 0, M.civic);
    put(g, BOX, w * 1.08, 1.6, d * 1.06, 0, 2.6, 0, M.civicTrim);
    var baseTop = 3.4, bodyH = h * 0.60;
    put(g, BOX, w * 0.94, bodyH, d * 0.88, 0, baseTop + bodyH / 2, 0, M.civicDark);

    /* 前廊：八根柱子撑起楣梁与山花，正对广场 */
    var n = 8, pw = w * 0.86, pz = d * 0.44 + 3.2;
    for (i = 0; i < n; i++) {
      put(g, CYL, 1.9, bodyH * 0.92, 1.9, -pw / 2 + pw * i / (n - 1),
        baseTop + bodyH * 0.46, pz, M.civicTrim);
    }
    var lintelY = baseTop + bodyH * 0.92 + 0.8;
    put(g, BOX, pw + 3.2, 1.7, 6.4, 0, lintelY, pz, M.civicTrim);
    put(g, GABLE, 6.8, 5.0, pw + 3.2, 0, lintelY + 0.85, pz, M.civic, Math.PI / 2);

    put(g, BOX, w * 1.0, 1.5, d * 0.94, 0, baseTop + bodyH + 0.75, 0, M.civicTrim);
    var drumY = baseTop + bodyH + 1.5;
    put(g, CYL, w * 0.30, 6.5, w * 0.30, 0, drumY + 3.25, 0, M.civicTrim);
    put(g, HEMI, w * 0.32, w * 0.17, w * 0.32, 0, drumY + 6.5, 0, M.domeShell);
    put(g, BOX, 0.8, 11, 0.8, 0, drumY + 6.5 + w * 0.085 + 5.5, 0, M.metalDark);

    for (i = -1; i <= 1; i += 2) {
      put(g, BOX, w * 0.24, h * 0.36, d * 0.78, i * w * 0.60, baseTop + h * 0.18, 0, M.civic);
      put(g, BOX, w * 0.26, 1.0, d * 0.82, i * w * 0.60, baseTop + h * 0.36, 0, M.civicTrim);
    }
  };

  /* 石拱桥：长向沿 x，宽向沿 z。
     起拱线必须落在水面上一点（springY ≈ 水面），否则拱券全泡在水下，
     远看就是一块灰色斜坡板——这是这片区域最容易做塌的一处。 */
  ARCH.bridge = function (g, o, M, rd) {
    var L = o.w || 80, W = o.d || 13, n = o.arches || 3;
    var halfL = L / 2;
    var abut = Math.min(13, L * 0.15), pierW = 4.6;
    var usable = L - abut * 2;
    var archW = Math.max(8, (usable - pierW * (n - 1)) / n);
    var springY = -1.45, rise = 3.0, step = 0.85;
    var deckY0 = 3.35, camber = 1.05;
    function deckTop(x) { var t = x / halfL; return deckY0 - camber * t * t; }
    function archC(i) { return -halfL + abut + archW * 0.5 + i * (archW + pierW); }
    function restY(x) {
      var low = springY;
      for (var k = 0; k < n; k++) {
        var cx = archC(k), hw = archW * 0.5;
        if (x > cx - hw && x < cx + hw) {
          var t = (x - cx) / hw, y = springY + rise * (1 - t * t);
          if (y > low) low = y;
        }
      }
      return low;
    }
    var wallT = 1.7, wz = W * 0.5 - wallT * 0.5;
    var xr, xc, dt, yb, hh;
    /* 桥面板：密排小段跟着拱势走 */
    for (xr = -halfL; xr < halfL - 0.01; xr += step) {
      xc = xr + step * 0.5;
      dt = deckTop(xc);
      put(g, BOX, step + 0.05, 0.5, W, xc, dt - 0.25, 0, M.civic);
      yb = restY(xc);
      hh = (dt - 0.5) - yb;
      if (hh > 0.12) {
        put(g, BOX, step + 0.05, hh, wallT, xc, yb + hh * 0.5, wz, M.civicTrim);
        put(g, BOX, step + 0.05, hh, wallT, xc, yb + hh * 0.5, -wz, M.civicTrim);
      }
    }
    /* 券石环：沿抛物线排一圈带转角的石块，桥洞轮廓才不是锯齿 */
    for (var ai = 0; ai < n; ai++) {
      var acx = archC(ai), ahw = archW * 0.5, NS = 15, j, t2, ax, ay, dyd, ang2, nl, nX, nY, segL;
      for (j = 0; j < NS; j++) {
        t2 = -1 + (j + 0.5) * 2 / NS;
        ax = acx + t2 * ahw;
        ay = springY + rise * (1 - t2 * t2);
        dyd = -2 * rise * t2 / ahw;
        ang2 = Math.atan2(dyd, 1);
        nl = Math.sqrt(dyd * dyd + 1);
        nX = -dyd / nl; nY = 1 / nl;
        segL = 2 * ahw * nl / NS * 1.14;
        var vs = put(g, BOX, segL, 0.78, W + 0.34, ax + nX * 0.37, ay + nY * 0.37, 0, M.civicTrim);
        vs.rotation.z = ang2;
      }
    }
    /* 桥墩 + 分水尖 */
    for (var pi = 1; pi < n; pi++) {
      var px = archC(pi - 1) + archW * 0.5 + pierW * 0.5;
      var ph = deckTop(px) - 0.5 - springY;
      put(g, BOX, pierW, ph, W - wallT * 1.2, px, springY + ph * 0.5, 0, M.civicDark);
      [-1, 1].forEach(function (sd) {
        var cw = put(g, CONE4, 3.4, ph * 0.86, 3.4, px, springY + ph * 0.45, sd * (W * 0.5 - 1.1), M.civicDark);
        cw.rotation.y = Math.PI / 4;
      });
    }
    /* 桥台 */
    [-1, 1].forEach(function (sd) {
      var ax2 = sd * (halfL - abut * 0.5);
      var ah = deckTop(ax2) - 0.5 - springY;
      put(g, BOX, abut, ah, W, ax2, springY + ah * 0.5, 0, M.civicDark);
    });
    /* 桥面压顶石带：把桥面和石墙分开，近景全靠这一道线 */
    [-1, 1].forEach(function (sd) {
      var zr2 = sd * (W * 0.5 - 0.16);
      for (var xb = -halfL + 0.6; xb < halfL - 0.4; xb += 1.7) {
        put(g, BOX, 1.75, 0.3, 0.42, xb + 0.85, deckTop(xb + 0.85) + 0.06, zr2, M.civicTrim);
      }
    });
    /* 望柱 + 栏板 */
    [-1, 1].forEach(function (sd) {
      var zr = sd * (W * 0.5 - 0.42);
      for (var xq = -halfL + 1.2; xq < halfL - 1.0; xq += 2.6) {
        var yq = deckTop(xq);
        put(g, BOX, 0.4, 1.24, 0.4, xq, yq + 0.72, zr, M.civicTrim);
        put(g, BOX, 2.6, 0.62, 0.2, xq + 1.3, yq + 0.42, zr, M.civic);
      }
    });
    /* 桥头踏步：桥面比地面高 3 米多，两端必须落台阶，否则像浮在半空 */
    [-1, 1].forEach(function (sd) {
      for (var st = 0; st < 6; st++) {
        var rh2 = deckY0 - camber - st * 0.42;
        if (rh2 <= 0.1) break;
        put(g, BOX, 2.2, rh2, W, sd * (halfL + 1.1 + st * 2.2), rh2 * 0.5, 0, M.paving3);
      }
    });
  };

  /* 能力与边界博物馆：新建的当代体量。白石材横条 + 无柱悬挑玻璃盒 + 金属网观景筒，
     刻意跟周围砖砌坡顶拉开年代差。 */
  ARCH.museum = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 22, i;
    var plW = w * 0.94, plD = d * 0.66, plH = 1.4;
    put(g, BOX, plW, plH, plD, 0, plH / 2, 0, M.civicTrim);
    /* 入口大台阶落在台基南缘，不能悬在台基之外 */
    for (i = 0; i < 5; i++) {
      var sh = Math.max(0.26, plH - i * 0.26);
      put(g, BOX, w * 0.40, sh, 2.2, -w * 0.02, sh * 0.5, plD * 0.5 + 1.1 + i * 2.2, M.stoneWhiteDark);
    }
    /* 主体：一条 78 米长的白色石材横条 */
    var bw = w * 0.82, bd = d * 0.40, bh = h - plH, bz = -d * 0.10;
    put(g, BOX, bw, bh, bd, 0, plH + bh * 0.5, bz, M.stoneWhite);
    for (i = 1; i <= 4; i++) {
      put(g, BOX, bw + 0.18, 0.34, bd + 0.18, 0, plH + bh * i / 5, bz, M.stoneWhiteDark);
    }
    /* 竖向玻璃缝：把长条体量切成两段，不然就是一堵白墙 */
    put(g, BOX, w * 0.10, bh + 0.12, bd * 0.62, -bw * 0.26, plH + bh * 0.5, bz + bd * 0.22, M.glassDark);
    /* 悬挑玻璃盒：离地 8 米，无柱，挑出 13 米 */
    var cw = w * 0.44, ch = 8.8, cz = bz + bd * 0.5 + 6.6;
    put(g, BOX, cw, ch, 13.2, w * 0.04, 12.6, cz, M.glassDark);
    put(g, BOX, cw + 0.9, 0.6, 14.0, w * 0.04, 12.6 + ch * 0.5 + 0.3, cz, M.stoneWhite);
    put(g, BOX, cw + 0.9, 0.5, 14.0, w * 0.04, 12.6 - ch * 0.5 - 0.25, cz, M.stoneWhite);
    for (i = -2; i <= 2; i++) {
      put(g, BOX, 0.26, ch, 0.26, w * 0.04 + i * cw / 5, 12.6, cz + 6.5, M.metalDark);
    }
    put(g, BOX, bw + 1.1, 1.0, bd + 1.1, 0, h + 0.5, bz, M.stoneWhite);
    /* 观景筒：半透明金属网，顶部开敞 */
    var dr = 7.6, dx = bw * 0.33, dz = bz - bd * 0.18;
    put(g, CYL, dr * 2, 42, dr * 2, dx, plH + 21, dz, M.mesh);
    put(g, CYL, dr * 1.1, 42, dr * 1.1, dx, plH + 21, dz, M.stoneWhiteDark);
    for (i = 1; i <= 6; i++) {
      put(g, CYL, dr * 2.1, 0.45, dr * 2.1, dx, plH + i * 6.0, dz, M.metal);
    }
    put(g, CYL, dr * 2.26, 0.85, dr * 2.26, dx, plH + 42.4, dz, M.stoneWhite);
  };

  /* 老城门 · 钟楼：砖石方塔 + 城门洞 + 四向钟面 + 攒尖顶 */
  ARCH.clockTower = function (g, o, M, rd) {
    var w = o.w || 12, h = o.h || 27;
    put(g, BOX, w * 1.32, 2.4, w * 1.32, 0, 1.2, 0, M.civicDark);
    put(g, BOX, w, h * 0.60, w, 0, 2.4 + h * 0.30, 0, M.brick);
    /* 城门洞 */
    put(g, BOX, w * 0.52, h * 0.30, 2.0, 0, 2.4 + h * 0.15, w * 0.5, M.timberDark);
    put(g, BOX, w * 0.52, h * 0.30, 2.0, 0, 2.4 + h * 0.15, -w * 0.5, M.timberDark);
    put(g, BOX, w * 1.08, 0.75, w * 1.08, 0, 2.4 + h * 0.60, 0, M.civicTrim);
    /* 钟面：圆柱要绕 x 轴转 90° 才是朝向 ±z 的表盘 */
    [-1, 1].forEach(function (sd) {
      var m1 = put(g, CYL, w * 0.62, 0.36, w * 0.62, 0, 2.4 + h * 0.79, sd * (w * 0.5), M.paint);
      m1.rotation.x = Math.PI / 2;
      var m2 = put(g, CYL, w * 0.09, 0.42, w * 0.09, 0, 2.4 + h * 0.79, sd * (w * 0.5 + 0.06), M.metalDark);
      m2.rotation.x = Math.PI / 2;
    });
    put(g, BOX, w * 1.06, 0.6, w * 1.06, 0, 2.4 + h * 0.88, 0, M.civicTrim);
    /* 敞廊 + 攒尖顶 */
    var by = 2.4 + h * 0.90;
    for (var i = -1; i <= 1; i += 2) for (var j = -1; j <= 1; j += 2) {
      put(g, BOX, 0.9, 4.4, 0.9, i * w * 0.34, by + 2.2, j * w * 0.34, M.timber);
    }
    put(g, BOX, w * 0.98, 0.7, w * 0.98, 0, by + 4.7, 0, M.timberDark);
    put(g, CONE4, w * 1.34, 6.5, w * 1.34, 0, by + 5.0 + 3.25, 0, M.roofDarkTile, Math.PI / 4);
    put(g, CYL6, 0.35, 2.4, 0.35, 0, by + 5.0 + 7.4, 0, M.metalDark);
  };

  /* 砖砌水塔：柱身 + 木构水箱 + 锥顶，是老城的第二制高点 */
  ARCH.waterTower = function (g, o, M, rd) {
    var r = o.w || 9, h = o.h || 34;
    put(g, CYL, r * 1.5, 1.6, r * 1.5, 0, 0.8, 0, M.civicDark);
    put(g, CYL, r, h * 0.70, r, 0, 0.8 + h * 0.35, 0, M.brick);
    for (var i = 1; i <= 4; i++) {
      put(g, CYL, r * 1.06, 0.42, r * 1.06, 0, 0.8 + h * 0.70 * i / 5, 0, M.civicTrim);
    }
    var ty = 0.8 + h * 0.70;
    put(g, CYL, r * 1.22, 1.0, r * 1.22, 0, ty + 0.5, 0, M.civicTrim);
    put(g, CYL, r * 2.1, 5.6, r * 2.1, 0, ty + 1.0 + 2.8, 0, M.timber);
    for (i = 0; i < 3; i++) {
      put(g, CYL, r * 2.16, 0.3, r * 2.16, 0, ty + 1.6 + i * 1.9, 0, M.metalDark);
    }
    put(g, CONE, r * 2.2, 3.0, r * 2.2, 0, ty + 1.0 + 5.6 + 1.5, 0, M.roofDarkTile);
    put(g, CYL6, 0.22, 3.2, 0.22, 0, ty + 1.0 + 5.6 + 4.4, 0, M.metalDark);
    /* 铁艺栏杆 */
    for (i = 0; i < 12; i++) {
      var a = Math.PI * 2 * i / 12;
      put(g, BOX, 0.12, 1.0, 0.12, Math.cos(a) * r * 1.08, ty + 1.5, Math.sin(a) * r * 1.08, M.metalDark);
    }
  };

  /* 老戏台：台基 + 四柱 + 后墙 + 歇山顶 + 两侧耳房 */
  ARCH.stage = function (g, o, M, rd) {
    var w = o.w || 18, d = o.d || 14, h = o.h || 7;
    put(g, BOX, w, 1.9, d, 0, 0.95, 0, M.civic);
    put(g, BOX, w + 1.4, 0.32, d + 1.4, 0, 2.05, 0, M.civicTrim);
    var py = 2.2;
    [-1, 1].forEach(function (sd) {
      put(g, CYL, 0.72, h, 0.72, sd * (w * 0.5 - 1.4), py + h * 0.5, d * 0.5 - 1.4, M.timber);
      put(g, CYL, 0.72, h, 0.72, sd * (w * 0.5 - 1.4), py + h * 0.5, -(d * 0.5 - 1.4), M.timber);
    });
    put(g, BOX, w, h * 0.92, 0.7, 0, py + h * 0.46, -(d * 0.5 - 0.5), M.timberDark);
    put(g, BOX, w * 0.42, h * 0.62, 0.35, 0, py + h * 0.31, -(d * 0.5 - 0.85), M.door);
    put(g, BOX, w + 1.8, 0.85, d + 1.8, 0, py + h + 0.42, 0, M.timberDark);
    put(g, GABLE, w + 2.4, 3.4, d + 2.4, 0, py + h + 0.85, 0, M.roofDarkTile);
    put(g, GABLE, w * 0.55, 2.0, d + 3.0, 0, py + h + 1.6, 0, M.roofGreyTile, Math.PI / 2);
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 4.4, 3.2, d * 0.62, sd * (w * 0.5 + 2.2), 1.6, 0, M.civic);
      put(g, GABLE, 5.4, 2.0, d * 0.72, sd * (w * 0.5 + 2.2), 3.2, 0, M.roofGreyTile);
    });
  };

  ARCH.silo = function (g, o, M, rd) {
    var n = 3 + Math.floor(rd() * 3), r = Math.min(o.w, o.d) / (n * 2.1);
    for (var i = 0; i < n; i++) {
      var x = -o.w / 2 + o.w * (i + 0.5) / n;
      var h = o.h * (0.8 + rd() * 0.35);
      put(g, CYL, r * 2, h, r * 2, x, h / 2, 0, o.mat);
      put(g, HEMI, r * 2.05, r * 0.5, r * 2.05, x, h, 0, M.metal);
    }
    put(g, BOX, o.w * 0.9, 2.2, 2.4, 0, o.h * 0.7, o.d * 0.3, M.metal);
  };

  ARCH.stilt = function (g, o, M, rd) {
    var floors = Math.max(2, Math.round(o.h / 3.6)), fh = o.h / floors;
    for (var c = -1; c <= 1; c += 2) for (var c2 = -1; c2 <= 1; c2 += 2) {
      put(g, BOX, 1.1, fh, 1.1, c * o.w * 0.36, fh / 2, c2 * o.d * 0.36, M.concrete);
    }
    for (var f = 1; f < floors; f++) {
      put(g, BOX, o.w, fh * 0.92, o.d, 0, fh * f + fh * 0.46, 0, o.mat);
      if (rd() < 0.4) put(g, BOX, o.w * 0.9, 0.35, 2.2, 0, fh * f + 0.3, o.d / 2 + 0.9, M.leaf);
    }
    roofClutter(g, o.w, o.d, o.h, rd, M);
  };

  ARCH.ziggurat = function (g, o, M, rd) {
    var tiers = 3 + Math.floor(rd() * 3), y = 0;
    for (var i = 0; i < tiers; i++) {
      var k = 1 - i / (tiers + 1.2), th = o.h / tiers;
      put(g, BOX, o.w * k, th, o.d * k, 0, y + th / 2, 0, o.mat);
      put(g, BOX, o.w * k + 1.2, 0.5, o.d * k + 1.2, 0, y + th, 0, M.band);
      y += th;
    }
    if (rd() < 0.6) put(g, BOX, 0.4, 8, 0.4, 0, y + 4, 0, M.metal);
  };

  ARCH.cylinderTower = function (g, o, M, rd) {
    var r = Math.min(o.w, o.d) * 0.5;
    put(g, CYL, r * 2, o.h, r * 2, 0, o.h / 2, 0, o.mat);
    var fins = 10 + Math.floor(rd() * 6);
    for (var i = 0; i < fins; i++) {
      var a = i / fins * Math.PI * 2;
      put(g, BOX, 0.9, o.h * 0.92, 2.2, Math.cos(a) * r, o.h * 0.46, Math.sin(a) * r, M.metal, -a);
    }
    put(g, BOX, r * 2.15, 1.4, r * 2.15, 0, o.h, 0, M.metal);
    put(g, CYL, r * 0.8, 5, r * 0.8, 0, o.h + 3, 0, M.metal);
  };

  /* 街头亭子：老城里是木构坡顶敞亭，不是一块架在四根柱上的平屋面板。
     尺寸也要压住——二三十米跨度的平顶亭从空中看就是一座高架桥。 */
  ARCH.pavilion = function (g, o, M, rd) {
    var w = Math.min(o.w, 12), d = Math.min(o.d, 12), h = Math.max(3.2, Math.min(o.h, 5.6));
    put(g, BOX, w * 1.16, 0.36, d * 1.16, 0, 0.18, 0, M.paving2);
    for (var c = -1; c <= 1; c += 2) for (var c2 = -1; c2 <= 1; c2 += 2) {
      put(g, BOX, 0.36, h, 0.36, c * w * 0.42, h * 0.5 + 0.3, c2 * d * 0.42, M.timber);
    }
    put(g, BOX, w * 0.98, 0.26, 0.26, 0, h + 0.28, d * 0.42, M.timberDark);
    put(g, BOX, w * 0.98, 0.26, 0.26, 0, h + 0.28, -d * 0.42, M.timberDark);
    put(g, BOX, 0.26, 0.26, d * 0.98, w * 0.42, h + 0.28, 0, M.timberDark);
    put(g, BOX, 0.26, 0.26, d * 0.98, -w * 0.42, h + 0.28, 0, M.timberDark);
    var rf = put(g, GABLE, w * 1.28, 2.0 + rd() * 1.2, d * 1.28, 0, h + 0.42, 0, M.roofRoll(rd));
    rf.castShadow = true;
    put(g, BOX, 0.22, 0.9, 0.22, 0, h + 3.0, 0, M.timberDark);
  };

  ARCH.market = function (g, o, M, rd) {
    var rows = Math.max(2, Math.round(o.d / 9));
    for (var i = 0; i < rows; i++) {
      var z = -o.d / 2 + o.d * (i + 0.5) / rows;
      put(g, BOX, o.w, 2.8, o.d / rows * 0.5, 0, 1.4, z, M.canopy);
      for (var j = -2; j <= 2; j++) put(g, BOX, 2.2, 0.9, 2.0, j * o.w / 5.4, 0.45, z + o.d / rows * 0.34, M.wood);
    }
    put(g, BOX, o.w * 1.02, 0.4, o.d, 0, 2.9, 0, M.canopy2);
  };

  /* --- 白汽 ---------------------------------------------------------
     冷却塔没有汽，谷地就是一堆静态盒子。用一串始终朝向镜头的软圆片：
     边升边胀边淡，外加一点横向漂移，远看就是被风拉斜的汽柱。
     合批会跳过 sprite（不是 mesh），所以它们天然留给逐帧动画。 */
  var STEAM_TEX = null, STEAM_COUNT = 0, STEAM_CAP = 300;
  function steamTex() {
    if (STEAM_TEX) return STEAM_TEX;
    var S = 128, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var c = cv.getContext("2d");
    var gr = c.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.92)");
    gr.addColorStop(0.38, "rgba(247,249,251,0.58)");
    gr.addColorStop(0.74, "rgba(238,242,246,0.18)");
    gr.addColorStop(1, "rgba(238,242,246,0)");
    c.fillStyle = gr; c.fillRect(0, 0, S, S);
    STEAM_TEX = new THREE.CanvasTexture(cv);
    return STEAM_TEX;
  }
  function steamPlume(g, x, y, z, r, n, rise) {
    if (STEAM_COUNT > STEAM_CAP) return;
    for (var i = 0; i < n; i++) {
      STEAM_COUNT++;
      var mat = new THREE.SpriteMaterial({ map: steamTex(), color: 0xffffff,
        transparent: true, opacity: 0.60, depthWrite: false });
      var sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.userData.steam = { ph: i / n + (STEAM_COUNT % 7) * 0.037, y0: y, x0: x, z0: z,
        rise: rise, r0: r, spd: 0.070 + 0.010 * (i % 4), op: 0.92 };
      sp.frustumCulled = false;
      g.add(sp);
    }
  }

  /* 双曲线塔身：单独抽出来，冷却塔群也要用。
     真实的冷却塔轮廓是一条双曲线：底部最大、约 70% 高度收到最细的喉部、
     塔口再微微外扩一点。之前用的是「抛物线 + 线性项」拼的近似式，
     底/喉/顶 = 1.55 / 0.76 / 0.83 —— 喉部几乎和塔口一样宽，看不出收腰；
     而 r0 又被按 h*0.64 取，底座直径差不多是塔高的两倍。
     两者叠加就是「粗蘑菇」：一个比高还宽的圆筒，顶上一圈深色环。
     现在直接解双曲线 r(y) = rt·sqrt(1 + ((y-yt)/c)^2)，由 r(base)=r0、r(yt)=rt 反解 c，
     塔口自然落在 0.64·r0（这正是真实塔的比例）。 */
  function towerShell(g, x, z, r0, h, M) {
    var SEG = 16, i;
    /* 壳体不落地：真实塔被一圈斜柱托在离地几米处，底下是进风口。
       这一点高度是「塔」和「烟囱」的分界，必须留出来。 */
    var legH = 0.055 * h, bodyH = h - legH;
    var yt = legH + 0.70 * bodyH, rt = 0.55 * r0;
    var c = 0.70 * bodyH / Math.sqrt((r0 / rt) * (r0 / rt) - 1);
    var pts = [];
    for (i = 0; i <= SEG; i++) {
      var t = i / SEG, y = legH + t * bodyH, dy = (y - yt) / c;
      pts.push(new THREE.Vector2(rt * Math.sqrt(1 + dy * dy), y));
    }
    var geo = new THREE.LatheGeometry(pts, 30);
    var m = new THREE.Mesh(geo, M.towerShell || M.concrete);
    m.position.set(x, 0, z);
    m.castShadow = true; m.receiveShadow = true; g.add(m);

    /* 塔基：循环水池 + 斜柱环 + 深色进风口。
       缺这三样，双曲线画得再准也还是插在水泥地上的一根柱子。 */
    put(g, CYL, r0 * 2.30, 0.8, r0 * 2.30, x, 0.4, z, M.basin || M.water);
    put(g, CYL, r0 * 2.02, 1.1, r0 * 2.02, x, 0.55, z, M.concreteDark);
    put(g, CYL, r0 * 1.86, legH, r0 * 1.86, x, legH * 0.55, z, M.metalDark);
    /* 斜柱：每根从池边向内倾到壳体底缘。用两段叠出倾斜感比真转轴省事，
       远处读到的只是「一圈竖缝」，那是进风口的百叶。 */
    for (i = 0; i < 18; i++) {
      var a = Math.PI * 2 * i / 18;
      put(g, BOX, r0 * 0.085, legH, r0 * 0.085,
        x + Math.cos(a) * r0 * 0.965, legH * 0.5, z + Math.sin(a) * r0 * 0.965, M.concrete);
    }
    /* 壳底一圈环梁：收口，否则斜柱顶是断的 */
    put(g, CYL, r0 * 2.04, 1.2, r0 * 2.04, x, legH, z, M.concreteDark);
    /* 塔口内壁：从高处俯视时看到的是一口深井，不是一块盖板 */
    var inner = 0.78 * r0, yIn = legH + 0.22 * bodyH;
    put(g, CYL, inner * 2, 1.0, inner * 2, x, yIn, z, M.metalDark);
    return m;
  }

  ARCH.coolingTower = function (g, o, M, rd) {
    var h = o.h;
    /* 底座半径必须由塔高定，不能由地块宽度定——地块宽 60 米不代表塔底就该 60 米。
       真实塔的高/底半径≈2.7~3.3，这里取 0.32h。 */
    var r0 = Math.min(Math.min(o.w, o.d) * 0.32, h * 0.32);
    towerShell(g, 0, 0, r0, h, M);
    steamPlume(g, 0, h * 0.96, 0, r0 * 0.62, 8, h * 2.1);
  };

  /* 冷却塔群：谷地的白汽就从这里起来。
     三座塔排成一行 + 泵房 + 管汇，是「液冷/水冷」这件事唯一看得见的证据。 */
  ARCH.coolingYard = function (g, o, M, rd) {
    var w = o.w || 96, d = o.d || 62, h = o.h || 30;
    put(g, BOX, w * 1.04, 0.5, d * 1.04, 0, 0.25, 0, M.paving2);
    var n = 3, r0 = Math.min(h * 0.32, d * 0.21);
    /* 塔距按底座直径留缝：两塔底缘相切就成了「一串糖葫芦」 */
    var gap = r0 * 2.45;
    for (var i = 0; i < n; i++) {
      var tx = (i - (n - 1) / 2) * gap, tz = -d * 0.04;
      var th = h * (0.92 + 0.06 * i);
      towerShell(g, tx, tz, r0 * (0.94 + 0.03 * i), th, M);
      steamPlume(g, tx, th * 0.96, tz, r0 * 0.60, 9, th * 2.2);
    }
    /* 泵房 + 管汇：塔排成一行之后中轴被占了，泵房退到塔后 */
    put(g, BOX, w * 0.30, 6.5, d * 0.22, 0, 3.25, d * 0.40, M.hallWall2);
    put(g, BOX, w * 0.32, 0.6, d * 0.24, 0, 6.8, d * 0.40, M.metalDark);
    for (var k = 0; k < 4; k++) {
      var pm = put(g, CYL, 1.5, w * 0.92, 1.5, 0, 1.9 + k * 1.55, -d * 0.46, k % 2 ? M.rust : M.metal);
      pm.rotation.z = Math.PI / 2;
    }
    put(g, BOX, w * 0.94, 3.0, 4.2, 0, 3.0, -d * 0.46, M.steelDeep);
    /* 安全黄栏杆 */
    for (var b = -3; b <= 3; b++) {
      put(g, BOX, 0.18, 1.2, 0.18, b * w * 0.13, 0.6, d * 0.48, M.safety);
    }
    put(g, BOX, w * 0.92, 0.12, 0.12, 0, 1.2, d * 0.48, M.safety);
  };

  /* 高位水池：谷地两侧的制高水头。
     矩形池体架空在四根柱上，一根立管直落地面——它是谷里少见的「竖线」，
     在一屏厂房里就当锚点用。 */
  ARCH.hillTank = function (g, o, M, rd) {
    var w = Math.max(18, o.w || 40), d = Math.max(16, o.d || 34), h = o.h || 34;
    var legH = h * 0.60, tankH = h * 0.30, i;
    put(g, BOX, w * 1.10, 2.0, d * 1.10, 0, 1.0, 0, M.concreteDark);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        put(g, BOX, 2.6, legH, 2.6, sx * w * 0.36, legH / 2 + 2.0, sz * d * 0.36, M.concrete);
        put(g, BOX, 3.4, 0.6, 3.4, sx * w * 0.36, 2.3, sz * d * 0.36, M.concreteDark);
      }
    }
    /* 环梁：没有这两道梁，池子就是压在四根筷子上的盒子 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, w * 0.92, 1.5, 1.4, 0, legH * 0.55, sd * d * 0.36, M.concrete);
      put(g, BOX, 1.4, 1.5, d * 0.92, sd * w * 0.36, legH * 0.55, 0, M.concrete);
    });
    var ty = 2.0 + legH;
    put(g, BOX, w * 0.98, 1.1, d * 0.98, 0, ty + 0.55, 0, M.concreteDark);
    put(g, BOX, w, tankH, d, 0, ty + 1.1 + tankH / 2, 0, M.concrete);
    /* 池壁竖向分缝：混凝土池体不做分格就是一整块白 */
    for (i = 1; i < 5; i++) {
      put(g, BOX, 0.16, tankH * 0.92, d + 0.1, -w / 2 + w * i / 5, ty + 1.1 + tankH / 2, 0, M.concreteDark);
    }
    put(g, BOX, w * 1.04, 0.7, d * 1.04, 0, ty + 1.1 + tankH, 0, M.concreteDark);
    /* 顶上栏杆 + 通气帽 + 检修梯 */
    for (i = -2; i <= 2; i++) {
      put(g, BOX, 0.14, 1.1, 0.14, i * w * 0.2, ty + 1.1 + tankH + 0.9, d * 0.5, M.metalDark);
    }
    put(g, BOX, w * 0.92, 0.10, 0.10, 0, ty + 1.1 + tankH + 1.4, d * 0.5, M.metalDark);
    put(g, CYL, 2.2, 1.6, 2.2, w * 0.24, ty + 1.1 + tankH + 1.1, -d * 0.18, M.metal);
    put(g, CYL, 0.9, 3.4, 0.9, -w * 0.24, ty + 1.1 + tankH + 2.0, d * 0.16, M.metalDark);
    /* 立管：从池底一直落到地面，再拐进管廊 */
    put(g, CYL, 1.5, ty, 1.5, w * 0.44, ty / 2, -d * 0.30, M.steelDeep);
    put(g, CYL, 1.5, 9.0, 1.5, w * 0.44 + 4.0, 1.4, -d * 0.30, M.steelDeep).rotation.z = Math.PI / 2;
    /* 外挂钢梯 */
    for (i = 0; i < 9; i++) {
      put(g, BOX, 1.5, 0.12, 0.9, -w * 0.5 - 0.9, 2.4 + i * (legH / 9), -d * 0.22 + (i % 2) * 0.5, M.steel);
    }
    put(g, BOX, 0.14, legH, 0.14, -w * 0.5 - 1.6, legH / 2 + 2, -d * 0.22, M.steel);
    put(g, BOX, 0.14, legH, 0.14, -w * 0.5 - 0.3, legH / 2 + 2, -d * 0.22, M.steel);
  };

  /* 光伏场：谷里最该有的一片深蓝。
     一排排倾斜板 + 逆变器箱 + 围栏，纯灰的谷读不出「园区」。 */
  ARCH.solarFarm = function (g, o, M, rd) {
    var w = o.w || 90, d = o.d || 60;
    var rows = Math.max(3, Math.round(w / 8)), cols = Math.max(3, Math.round(d / 7.5));
    var pw = w / rows, pd = d / cols;
    put(g, BOX, w * 1.02, 0.3, d * 1.02, 0, 0.15, 0, M.paving2);
    for (var ri = 0; ri < rows; ri++) {
      var x = -w / 2 + w * (ri + 0.5) / rows;
      for (var ci = 0; ci < cols; ci++) {
        var z = -d / 2 + d * (ci + 0.5) / cols;
        put(g, BOX, 0.16, 1.4, 0.16, x - pw * 0.28, 0.7, z, M.steelDeep);
        put(g, BOX, 0.16, 1.4, 0.16, x + pw * 0.28, 0.7, z, M.steelDeep);
        var pv = put(g, BOX, pw * 0.84, 0.12, pd * 0.80, x, 1.55, z, M.pv);
        pv.rotation.x = -0.38;
      }
    }
    put(g, BOX, 5.2, 3.0, 3.4, w * 0.40, 1.5, d * 0.46, M.hallWall2);
    put(g, BOX, 5.6, 0.3, 3.8, w * 0.40, 3.15, d * 0.46, M.metalDark);
    /* 围栏：细柱 + 两道横杆，近景才看得出这是有边界的场区 */
    for (var f = -6; f <= 6; f++) {
      put(g, BOX, 0.12, 1.8, 0.12, f * w * 0.083, 0.9, -d * 0.5, M.steelDeep);
    }
    put(g, BOX, w * 1.0, 0.1, 0.1, 0, 1.7, -d * 0.5, M.steelDeep);
    put(g, BOX, w * 1.0, 0.1, 0.1, 0, 1.1, -d * 0.5, M.steelDeep);
  };

  /* 集装箱堆场：谷地的饱和色全靠它。
     4 层高的箱垛 + 空箱散放，近景里也是最好用的尺度标尺（箱长 12 米）。 */
  ARCH.containerYard = function (g, o, M, rd) {
    var w = o.w || 90, d = o.d || 54;
    put(g, BOX, w * 1.04, 0.4, d * 1.04, 0, 0.2, 0, M.paving2);
    var cols = Math.max(2, Math.round(w / 14)), rows = Math.max(2, Math.round(d / 7));
    for (var ci = 0; ci < cols; ci++) {
      for (var ri = 0; ri < rows; ri++) {
        var bx = -w / 2 + w * (ci + 0.5) / cols, bz = -d / 2 + d * (ri + 0.5) / rows;
        var stack = 1 + Math.floor(rd() * 4);
        var skip = rd();
        if (skip < 0.12) continue;
        for (var lv = 0; lv < stack; lv++) {
          var cm = M.cont[Math.floor(rd() * M.cont.length)];
          var cw = 12.0 * (0.94 + rd() * 0.06);
          put(g, BOX, cw, 2.55, 2.44, bx + (rd() - 0.5) * 0.5, 0.4 + 1.28 + lv * 2.60,
            bz + (rd() - 0.5) * 0.5, cm, (rd() - 0.5) * 0.04);
        }
      }
    }
    /* 两条作业道 + 一台龙门吊的腿 */
    put(g, BOX, w * 1.02, 0.06, 6.0, 0, 0.44, 0, M.asphaltLight);
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      put(g, BOX, 1.6, 16, 1.6, s2 * w * 0.44, 8, -d * 0.46, M.steel);
      put(g, BOX, 1.6, 16, 1.6, s2 * w * 0.44, 8, d * 0.46, M.steel);
      put(g, BOX, 2.2, 0.8, d * 1.0, s2 * w * 0.44, 16.4, 0, M.steelDeep);
    }
    put(g, BOX, w * 0.92, 1.4, 2.0, 0, 16.2, 0, M.safety);
  };

  /* ------------------------------------------------------------
     智算谷原型：机房 / 液冷塔 / 变电站 / 架空管廊
     ------------------------------------------------------------ */

  /* 退台机房（Data Hall）—— 智算谷的主力原型，一个区里能有几百栋。
     辨识点不是高度，而是「大进深 + 层层退台 + 屋面铺满冷却机组」三件事：
     远看是压得很低的工业巨物，跟 D01 的塔楼森林形成对照。 */
  ARCH.datacenter = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = Math.max(8, o.h);
    var tiers = h > 27 ? 3 : h > 16 ? 2 : 1;
    var th = h / tiers, i;
    for (i = 0; i < tiers; i++) {
      var tw = w * (1 - 0.09 * i), td = d * (1 - 0.07 * i), y0 = i * th;
      /* 主色占比给到一半：机房原型是谷里的绝大多数，
         如果它整栋都是浅灰铝皮，色板里那些锈红、墨绿根本露不出来。 */
      put(g, BOX, tw, th, td, 0, y0 + th / 2, 0,
        i === 0 || rd() < 0.5 ? o.mat : (rd() < 0.5 ? M.hallWall : M.hallWall2));
      /* 退台处必须挑出一道设备平台，没有这道线退台会糊成一个斜方块 */
      put(g, BOX, tw + 2.4, 0.8, td + 2.4, 0, y0 + th, 0, M.metalDark);
      /* 深色百叶带：机房立面的辨识点，也是把整片白墙压住的唯一办法 */
      [-1, 1].forEach(function (s2) {
        put(g, BOX, tw * 0.90, th * 0.30, 0.26, 0, y0 + th * 0.44, s2 * (td / 2 + 0.09), M.hallBand);
        put(g, BOX, 0.26, th * 0.30, td * 0.90, s2 * (tw / 2 + 0.09), y0 + th * 0.44, 0, M.hallBand);
      });
      /* 竖向压型钢板分格：6 米一道，近景才读得出这是金属幕墙不是涂料墙 */
      var nb = Math.max(2, Math.round(tw / 6.5));
      for (var b = 1; b < nb; b++) {
        var bx = -tw / 2 + tw * b / nb;
        [-1, 1].forEach(function (s3) {
          put(g, BOX, 0.20, th * 0.90, 0.14, bx, y0 + th * 0.5, s3 * (td / 2 + 0.04), M.metal);
        });
      }
    }
    /* 屋面：冷却机组阵列 + 一条安全色主管。
       没有屋面设备的机房就是一个白盒子，这一层才是「AI 基地」的证据。 */
    var topY = tiers * th;
    var tw2 = w * (1 - 0.09 * (tiers - 1)), td2 = d * (1 - 0.07 * (tiers - 1));
    /* 屋面板：俯视时屋顶占的画面比墙还多，颜色必须从这里给，不能只给墙 */
    put(g, BOX, tw2 + 0.24, 0.34, td2 + 0.24, 0, topY + 0.17, 0, M.roofRoll(rd));
    var cols = Math.max(2, Math.round(tw2 / 9)), rows = Math.max(2, Math.round(td2 / 9));
    for (var ci = 0; ci < cols; ci++) {
      for (var ri = 0; ri < rows; ri++) {
        if (rd() < 0.14) continue;
        var cx = -tw2 / 2 + tw2 * (ci + 0.5) / cols, cz = -td2 / 2 + td2 * (ri + 0.5) / rows;
        put(g, BOX, 4.8, 1.8, 3.4, cx, topY + 0.9, cz, M.metal);
        put(g, CYL, 2.6, 0.26, 2.6, cx, topY + 1.86, cz, M.metalDark);
      }
    }
    put(g, BOX, tw2 * 0.92, 0.62, 1.0, 0, topY + 0.62, td2 * 0.5 - 3.0, M.safety);
    /* 女儿墙 */
    put(g, BOX, tw2 + 0.5, 0.9, 0.4, 0, topY + 0.45, (td2 - 0.4) / 2, M.metalDark);
    put(g, BOX, tw2 + 0.5, 0.9, 0.4, 0, topY + 0.45, -(td2 - 0.4) / 2, M.metalDark);
    /* 装卸货台 + 卷帘门：机房要进机柜，这一面把尺度交代清楚 */
    if (rd() < 0.68) {
      var dw = w * 0.6;
      put(g, BOX, dw, 3.2, 2.6, 0, 1.6, d / 2 + 1.2, M.concreteDark);
      var nd = Math.max(2, Math.round(dw / 10));
      for (var k = 0; k < nd; k++) {
        put(g, BOX, 4.0, 2.6, 0.2, -dw / 2 + dw * (k + 0.5) / nd, 1.4, d / 2 + 2.52, M.shopfront);
      }
    }
  };

  /* 液冷鳍片塔 —— 大厂在谷里的主楼，也是中型号算力塔。
     只靠立面分缝是做不出「算力塔」的：远看一定读成写字楼。
     真正管用的是「一层层挑出的机柜模块 + 收进的深色管廊层」这种水平叠垛，
     它是机房塔独有的剖面，跟幕墙塔的竖线条完全不是一回事。 */
  ARCH.finTower = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = Math.max(14, o.h);
    var tiers = Math.max(3, Math.min(10, Math.round(h / 11)));
    var th = h / tiers, i;
    for (i = 0; i < tiers; i++) {
      var y0 = i * th;
      /* 深色收进层：管路与检修层。必须比模块带窄一圈，缝里才投得出阴影 */
      put(g, BOX, w * 0.84, th * 0.44, d * 0.84, 0, y0 + th * 0.22, 0, M.hallBand);
      /* 机柜模块带：略挑出，浅色金属。深浅交替才不是一条条停车楼楼板 */
      put(g, BOX, w, th * 0.56, d, 0, y0 + th * 0.72, 0, i % 2 ? M.hallWall2 : o.mat);
      /* 竖向分格：没有这一层，横向叠垛会读成停车楼 */
      if (th > 4.2) {
        var nb = Math.max(3, Math.min(6, Math.round(w / 7)));
        for (var b = 1; b < nb; b++) {
          var bx = -w / 2 + w * b / nb;
          [-1, 1].forEach(function (sd) {
            put(g, BOX, 0.55, th * 0.56, 0.34, bx, y0 + th * 0.72, sd * (d / 2 + 0.1), M.metal);
          });
        }
      }
    }
    /* 四角通高角柱 + 冷媒立管：把横向叠垛的四条棱立起来，塔才不散。
       立管不能用亮锈红——四根鲜红竖管会让整座塔变成玩具。 */
    for (var cx2 = -1; cx2 <= 1; cx2 += 2) {
      for (var cz2 = -1; cz2 <= 1; cz2 += 2) {
        put(g, BOX, 2.8, h, 2.8, cx2 * (w / 2 - 0.6), h / 2, cz2 * (d / 2 - 0.6), M.metalDark);
        put(g, CYL, 1.5, h * 0.94, 1.5, cx2 * (w / 2 + 0.9), h * 0.47, cz2 * (d / 2 + 0.9), M.steelDeep);
      }
    }
    /* 塔冠：加宽的静压箱 + 排风扇阵列，塔顶必须收口成一个体量 */
    put(g, BOX, w * 0.94, 3.8, d * 0.94, 0, h + 1.9, 0, M.metalDark);
    /* 品牌冠带：色环要挂在冠下，绝不能压在屋顶上——从上往下看，
       一块盖在楼顶的色板就成了一块彩色屋面。
       六座塔如果只靠立面区分，一屏看下去全是同一身金属灰；
       冠部这一段是整幅画面里唯一天然聚集视线的位置，必须给足面积。 */
    if (o.brand !== undefined && M.brand[o.brand]) {
      var bm = M.brand[o.brand], bl = M.brandLit[o.brand];
      put(g, BOX, w * 1.05, 5.4, d * 1.05, 0, h - 9.4, 0, bm);
      put(g, BOX, w * 1.02, 1.4, d * 1.02, 0, h * 0.46, 0, bm);
      /* 冠带上沿一道自发光腰线：正午顶光下正立面是背光的，
         纯漫反射色块会被压成深灰，只有自发光还能把品牌色留住。 */
      if (bl) put(g, BOX, w * 1.07, 0.9, d * 1.07, 0, h - 6.5, 0, bl);
      for (var bc = -1; bc <= 1; bc += 2) {
        for (var bd = -1; bd <= 1; bd += 2) {
          put(g, BOX, 1.6, 6.0, 1.6, bc * (w / 2 + 0.2), h - 9.0, bd * (d / 2 + 0.2), bm);
        }
      }
    }
    var fn2 = 3;
    for (var a = 0; a < fn2; a++) {
      for (var b2 = 0; b2 < fn2; b2++) {
        put(g, CYL, 3.2, 0.7, 3.2, -w * 0.26 + w * 0.52 * (a + 0.5) / fn2, h + 4.15,
          -d * 0.26 + d * 0.52 * (b2 + 0.5) / fn2, M.metalDark);
      }
    }
    /* 底部进风廊：不然塔像一根插在地上的柱子 */
    put(g, BOX, w * 1.04, 4.4, d * 1.04, 0, 2.2, 0, M.hallBand);
  };

  /* 220kV 变电站：格构架 + 变压器阵列 + 绝缘子串 */
  ARCH.substation = function (g, o, M, rd) {
    var w = o.w, d = o.d;
    put(g, BOX, w, 0.3, d, 0, 0.15, 0, M.paving2);
    var cols2 = Math.max(2, Math.round(w / 17));
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < cols2; c++) {
        var tx = -w * 0.30 + w * 0.60 * (c + 0.5) / cols2, tz = -d * 0.20 + d * 0.40 * r;
        put(g, BOX, 6.6, 2.9, 4.4, tx, 1.75, tz, M.metal);
        put(g, BOX, 7.2, 0.4, 5.0, tx, 3.3, tz, M.metalDark);
        for (var k = -1; k <= 1; k++) put(g, CYL, 0.52, 2.4, 0.52, tx + k * 1.8, 4.5, tz, M.concrete);
      }
    }
    /* 格构架：四角立柱 + 三道横梁，变电站的骨架就是这些细杆 */
    for (var sd = -1; sd <= 1; sd += 2) {
      for (var sg = -1; sg <= 1; sg += 2) {
        put(g, BOX, 0.9, 15, 0.9, sd * w * 0.40, 7.5, sg * d * 0.34, M.steel);
      }
    }
    for (var lv = 0; lv < 3; lv++) {
      var ly = 4.2 + lv * 4.8;
      put(g, BOX, w * 0.82, 0.5, 0.5, 0, ly, -d * 0.34, M.steel);
      put(g, BOX, w * 0.82, 0.5, 0.5, 0, ly, d * 0.34, M.steel);
      put(g, BOX, 0.5, 0.5, d * 0.68, -w * 0.40, ly, 0, M.steel);
      put(g, BOX, 0.5, 0.5, d * 0.68, w * 0.40, ly, 0, M.steel);
    }
    put(g, BOX, 0.6, 0.6, d * 0.68, 0, 15.2, 0, M.steelDeep);
  };

  /* 架空管廊：冷却水从高位水池进机房的那条主动脉。
     三根管 + 电缆桥架，立柱间距 14 米，是「智算谷」最强的身份标志。 */
  ARCH.pipeRack = function (g, o, M, rd) {
    var L = o.w, h = o.h || 9.5, span = 14;
    var n = Math.max(2, Math.round(L / span)), i;
    for (i = 0; i <= n; i++) {
      var x = -L / 2 + L * i / n;
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.7, h, 0.7, x, h / 2, sd * 1.9, M.steel);
      });
      put(g, BOX, 0.55, 0.45, 4.6, x, h + 0.22, 0, M.steelDeep);
      if (i % 3 === 0) {
        put(g, BOX, 0.4, 0.4, 3.4, x, h * 0.55, 0, M.steelDeep);
      }
    }
    var pipes = [[-1.55, 0.62, M.hallWall2], [0, 0.92, M.metal], [1.55, 0.62, M.rust]];
    pipes.forEach(function (p) {
      var m = put(g, CYL, p[1] * 2, L, p[1] * 2, 0, h + 0.9, p[0], p[2]);
      m.rotation.z = Math.PI / 2;
    });
    put(g, BOX, L, 0.45, 1.4, 0, h + 2.05, 1.55, M.metalDark);
  };

  ARCH.crane = function (g, o, M, rd) {
    var h = o.h;
    put(g, BOX, 2.2, h, 2.2, -o.w * 0.3, h / 2, 0, M.steel);
    put(g, BOX, 2.2, h * 0.8, 2.2, o.w * 0.3, h * 0.4, 0, M.steel);
    put(g, BOX, o.w, 1.6, 2.0, o.w * 0.1, h, 0, M.steel);
    put(g, BOX, 0.5, 9, 0.5, o.w * 0.62, h - 4.5, 0, M.steel);
    put(g, BOX, 5, 2.6, 3.2, -o.w * 0.06, h - 1.6, 0, M.steelDeep);
  };

  ARCH.gate = function (g, o, M, rd) {
    put(g, BOX, 9, o.h, o.d, -o.w / 2 + 4.5, o.h / 2, 0, o.mat);
    put(g, BOX, 9, o.h, o.d, o.w / 2 - 4.5, o.h / 2, 0, o.mat);
    put(g, BOX, o.w, 5, o.d * 0.8, 0, o.h - 2.5, 0, M.roofFlat);
    put(g, BOX, o.w * 0.6, o.h * 0.42, 0.6, 0, o.h * 0.21, o.d / 2, M.door);
  };

  /* 主塔：退台核心 + 外露斜撑 + 桅杆，近景能看清结构层次 */
  ARCH.spire = function (g, o, M, rd) {
    put(g, BOX, o.w * 1.6, 14, o.d * 1.5, 0, 7, 0, M.concrete);
    var y = 14, cw = o.w, cd = o.d, tiers = 4;
    for (var i = 0; i < tiers; i++) {
      var sh = (o.h - 40) * (i === tiers - 1 ? 0.34 : 0.22);
      put(g, BOX, cw, sh, cd, 0, y + sh / 2, 0, o.mat);
      var c;
      for (c = -1; c <= 1; c += 2) {
        put(g, BOX, 2.4, sh, 2.4, c * cw * 0.48, y + sh / 2, cd * 0.48, M.metal);
        put(g, BOX, 2.4, sh, 2.4, c * cw * 0.48, y + sh / 2, -cd * 0.48, M.metal);
      }
      put(g, BOX, cw + 3, 1.2, cd + 3, 0, y + sh, 0, M.metal);
      put(g, BOX, cw * 0.5, 1.6, cd * 0.5, 0, y + sh + 1.4, 0, M.metalDark);
      y += sh; cw *= 0.82; cd *= 0.82;
    }
    put(g, BOX, cw * 0.5, 26, cd * 0.5, 0, y + 13, 0, M.metal);
    put(g, BOX, 1.0, 34, 1.0, 0, y + 26 + 17, 0, M.metalDark);
    put(g, SPH, 1.6, 1.6, 1.6, 0, y + 60, 0, M.beacon);
  };

  /* 扭转塔：逐层旋转的楼板，轮廓是全区最好认的剪影 */
  ARCH.twist = function (g, o, M, rd) {
    put(g, BOX, o.w * 1.3, 10, o.d * 1.3, 0, 5, 0, M.concrete);
    var tiers = 9, fh = (o.h - 10) / tiers;
    for (var i = 0; i < tiers; i++) {
      var t = new THREE.Group();
      t.position.y = 10 + i * fh; t.rotation.y = i * 0.085;
      put(t, BOX, o.w * (1 - i * 0.03), fh * 0.9, o.d * (1 - i * 0.025), 0, fh * 0.45, 0, o.mat);
      /* 中间层楼板是浅色挑檐，顶层的楼板就是屋顶，不能再用金属亮色 */
      put(t, BOX, o.w * (1 - i * 0.03) + 1.6, i === tiers - 1 ? 0.5 : 0.7,
        o.d * (1 - i * 0.025) + 1.6, 0, fh * 0.95, 0, i === tiers - 1 ? M.roofFlat : M.metal);
      g.add(t);
    }
    roofClutter(g, o.w * 0.7, o.d * 0.7, o.h, rd, M);
    put(g, BOX, o.w * 0.1, 6, o.d * 0.1, 0, o.h + 3, 0, M.metalDark);
  };

  /* 台阶式台基、外廊：低层住宅区用 */
  ARCH.terrace = function (g, o, M, rd) {
    var n = Math.max(3, Math.round(o.w / 6)), uw = o.w / n;
    for (var i = 0; i < n; i++) {
      var x = -o.w / 2 + uw * (i + 0.5), h = o.h * (0.86 + rd() * 0.24);
      put(g, BOX, uw - 0.1, h, o.d, x, h / 2, 0, o.mat);
      if (o.detail > 0) cornice(g, uw - 0.1, o.d, h, M, rd);
      /* 坡顶：原本这里是平屋面板，整条街看过去像一排集装箱 */
      put(g, GABLE, uw - 0.06, 2.6 + rd() * 2.6, o.d * 1.01, x, h, 0, M.roofRoll(rd));
      /* 二层挑出的木阳台：这种窄面宽排屋最典型的记号 */
      if (rd() < 0.58) {
        var by = Math.max(4.3, h * 0.56), bw = uw - 0.7;
        put(g, BOX, bw, 0.16, 1.30, x, by, o.d / 2 + 0.62, M.timberTrim);
        put(g, BOX, bw, 0.80, 0.12, x, by + 0.48, o.d / 2 + 1.22, M.timberTrim);
        put(g, BOX, 0.14, 0.80, 1.30, x - bw / 2, by + 0.48, o.d / 2 + 0.62, M.timberTrim);
        put(g, BOX, 0.14, 0.80, 1.30, x + bw / 2, by + 0.48, o.d / 2 + 0.62, M.timberTrim);
      }
      if (o.detail > 0) shopBand(g, { w: uw - 0.5, d: o.d }, M, rd, x, o.detail < 2);
    }
  };

  /* ------------------------------------------------------------
     D05 临河司法区：一套「纪念性」的建筑语言
     前面四区各有一套：D01 退台塔林、D02 坡顶联排、D03 金属机房、D04 白壳穹顶。
     这里只有三样东西——竖向石肋、缩进去的深缝、一道压得很重的檐口。
     体量全是正方体，屋顶全平，没有任何曲面向外发散；庄重感来自「重复」而不是「变化」。
     ------------------------------------------------------------ */

  /* 通用体量：竖肋石材楼。全区街块都用它，立面才统一成一种语言。 */
  ARCH.pierSlab = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = Math.max(9, o.h), i;
    var baseH = Math.min(2.2, h * 0.12);
    var bodyH = h - baseH - 2.6;
    if (bodyH < 4) bodyH = h - baseH;
    put(g, BOX, w * 1.05, baseH, d * 1.05, 0, baseH / 2, 0, M.stoneColdDeep);
    /* 深色内芯：肋与肋之间露出来的必须是深的。
       一面浅石墙外面再贴几根浅石柱，远看就是一块发白的板，竖条全白做。 */
    put(g, BOX, w * 0.97, bodyH, d * 0.97, 0, baseH + bodyH / 2, 0, M.slit);
    /* 肋的间距是这套语言的关键：六到七米一根，读作「柱」。
       三米一根会变成格栅，十米一根就退回普通板楼。 */
    var nz = Math.max(3, Math.min(10, Math.round(w / 6.4)));
    for (i = 0; i <= nz; i++) {
      var px = -w / 2 + w * i / nz;
      put(g, BOX, 1.55, bodyH, 1.5, px, baseH + bodyH / 2, d / 2 - 0.35, M.stoneCold);
      put(g, BOX, 1.55, bodyH, 1.5, px, baseH + bodyH / 2, -d / 2 + 0.35, M.stoneCold);
    }
    var nx = Math.max(2, Math.min(8, Math.round(d / 6.4)));
    for (i = 1; i < nx; i++) {
      var pz = -d / 2 + d * i / nx;
      put(g, BOX, 1.5, bodyH, 1.55, w / 2 - 0.35, baseH + bodyH / 2, pz, M.stoneCold);
      put(g, BOX, 1.5, bodyH, 1.55, -w / 2 + 0.35, baseH + bodyH / 2, pz, M.stoneCold);
    }
    /* 檐口：整圈挑出一米二，体量才有收头 */
    put(g, BOX, w * 0.97 + 2.4, 1.6, d * 0.97 + 2.4, 0, h - 1.7, 0, M.stoneCold);
    put(g, BOX, w * 0.97 + 1.2, 0.6, d * 0.97 + 1.2, 0, h - 0.3, 0, M.stoneCold2);
    if (h > 15) roofClutter(g, w * 0.9, d * 0.9, h, rd, M);
    else put(g, BOX, w * 0.95, 0.5, d * 0.95, 0, h, 0, M.roofFlat);
  };

  /* 主馆（H2 推理法医馆）：整条轴线的终点，全区唯一的正面。
     司法建筑靠「宽」和「台阶」压人，不是靠高。 */
  ARCH.justiceHall = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 60, i;
    /* 三级台基：司法建筑是走上去的。没有台基，再高的楼也只是一间办公室。 */
    put(g, BOX, w * 1.20, 2.2, d * 1.18, 0, 1.1, 0, M.stoneColdDeep);
    put(g, BOX, w * 1.13, 2.0, d * 1.12, 0, 3.2, 0, M.stoneCold2);
    put(g, BOX, w * 1.07, 1.9, d * 1.06, 0, 5.15, 0, M.stoneCold);
    var baseTop = 6.1, topH = 3.6;
    var bodyH = h - baseTop - topH;
    /* 主体：一条深色玻璃带，外面挂竖肋 */
    put(g, BOX, w, bodyH, d, 0, baseTop + bodyH / 2, 0, M.slitHall);
    var doorW = Math.min(w * 0.30, 32);
    /* 门洞只开 16 米高。通高的玻璃洞在正面会读成「楼塌了一块」，
       十六米加一道门楣才是入口；门楣上方照挂竖肋，肌理才连得上。 */
    var doorH = 16, lintelH = 22;
    /* 正立面密肋：中间让出门洞与门楣。
       间距九米二：七米四时肋加侧面投影占掉近半，整面读成一排百叶。 */
    var nf = Math.max(6, Math.round(w / 9.2));
    for (i = 0; i <= nf; i++) {
      var px = -w / 2 + w * i / nf;
      if (Math.abs(px) < doorW / 2 + 2.2) {
        var y0 = baseTop + doorH + lintelH;
        put(g, BOX, 1.9, baseTop + bodyH - y0, 1.5, px,
          (y0 + baseTop + bodyH) / 2, d / 2 - 0.4, M.stoneCold);
        continue;
      }
      put(g, BOX, 1.9, bodyH, 1.5, px, baseTop + bodyH / 2, d / 2 - 0.4, M.stoneCold);
    }
    /* 勒脚一道横石带：立面全是竖线，不加一条横的，整栋就没有腰 */
    put(g, BOX, w + 1.4, 1.3, d + 1.4, 0, baseTop + 0.65, 0, M.stoneCold2);
    /* 背立面与两侧：稍稀，只做节奏，不做重点 */
    var nb = Math.max(4, Math.round(w / 8));
    for (i = 1; i < nb; i++) {
      put(g, BOX, 2.1, bodyH, 1.6, -w / 2 + w * i / nb, baseTop + bodyH / 2, -d / 2 + 0.4, M.stoneCold);
    }
    var ns = Math.max(3, Math.round(d / 7.5));
    for (i = 1; i < ns; i++) {
      var qz = -d / 2 + d * i / ns;
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 1.6, bodyH, 2.1, sd * (w / 2 - 0.4), baseTop + bodyH / 2, qz, M.stoneCold);
      });
    }
    /* 门廊：两片厚墩 + 一道过梁，围出 22 米宽、16 米高的入口 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 5.4, doorH, 7.6, sd * (doorW / 2 + 2.7), baseTop + doorH / 2, d / 2 + 1.6, M.stoneCold);
    });
    put(g, BOX, doorW + 10.8, 2.6, 7.6, 0, baseTop + doorH + 1.3, d / 2 + 1.6, M.stoneCold);
    /* 门洞里的玻璃退到墩后三米：有进深才叫门廊，贴脸的就是一块窗 */
    put(g, BOX, doorW, doorH - 2.6, 0.8, 0, baseTop + (doorH - 2.6) / 2, d / 2 - 2.4, M.slit);
    /* 门楣：门洞上方一段实墙，铜徽嵌在这段正中间 */
    put(g, BOX, doorW, lintelH, 1.8, 0, baseTop + doorH + lintelH / 2, d / 2 - 0.2, M.stoneCold2);
    /* 铜门与铜匾：整区唯一的暖色，全压在这一处 */
    put(g, BOX, doorW * 0.60, 9.4, 1.0, 0, baseTop + 4.7, d / 2 - 1.8, M.bronzeDark);
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 1.1, 9.4, 1.4, sd * doorW * 0.30, baseTop + 4.7, d / 2 - 1.6, M.bronze);
    });
    put(g, BOX, doorW * 0.62, 0.7, 1.6, 0, baseTop + 9.7, d / 2 - 1.8, M.bronze);
    /* 门楣铜徽：圆盘要绕 x 轴转 90° 才立得起来。
       直径给到 10.4——8 米的盘在六百米外只有几个像素，等于没有。
       金边必须放在盘后面、比盘大一圈：放在前面会把整个盘盖住，
       正面只剩一块发白的圆片，看着像贴了个太阳。 */
    var cy = baseTop + doorH + lintelH / 2;
    var halo = put(g, CYL, 13.2, 0.45, 13.2, 0, cy, d / 2 + 0.5, M.bronzeLit);
    halo.rotation.x = Math.PI / 2;
    var disc = put(g, CYL, 11.6, 1.0, 11.6, 0, cy, d / 2 + 0.95, M.bronze);
    disc.rotation.x = Math.PI / 2;
    /* 大台阶：每级都退一点、矮一点，从广场一路收上来 */
    for (i = 0; i < 6; i++) {
      var sh2 = baseTop * (6 - i) / 6.4;
      put(g, BOX, doorW + 26 - i * 1.6, sh2, 3.4, 0, sh2 / 2, d / 2 + 4.6 + i * 3.1,
        i % 2 ? M.stoneCold2 : M.stoneCold);
    }
    /* 檐口：挑出五米半。挑浅了等于没有——从地面往上看，
       一道能投出阴影的檐口才是「石造」的证据。 */
    put(g, BOX, w + 8.6, 4.2, d + 8.0, 0, h - 2.1, 0, M.stoneCold);
    /* 顶部退台：轮廓要收，不然就是一个方盒子 */
    put(g, BOX, w * 0.62, 8.5, d * 0.54, 0, h + 4.25, 0, M.stoneCold2);
    put(g, BOX, w * 0.62 + 1.4, 1.1, d * 0.54 + 1.4, 0, h + 9.05, 0, M.stoneCold);
    /* 檐下一道铜带：远看是整栋楼唯一一条暖线 */
    put(g, BOX, w + 8.2, 0.85, d + 7.6, 0, h - 4.6, 0, M.bronzeDark);
  };

  /* 合议楼：方柱廊 + 厚重的檐部。两侧对称各一栋，把广场夹住。 */
  ARCH.courtHall = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 40, i;
    put(g, BOX, w * 1.10, 2.0, d * 1.10, 0, 1.0, 0, M.stoneColdDeep);
    var baseTop = 2.0, bodyH = h - baseTop - 2.8;
    /* 主体退到柱廊之后 */
    put(g, BOX, w * 0.86, bodyH, d * 0.84, 0, baseTop + bodyH / 2, -d * 0.06, M.stoneCold2);
    put(g, BOX, w * 0.60, bodyH * 0.92, 0.8, 0, baseTop + bodyH * 0.46, d * 0.30, M.slit);
    /* 方柱廊：七米一跨，柱头不做装饰——这套语言里没有柱式 */
    var n = Math.max(4, Math.round(w / 7.2));
    for (i = 0; i <= n; i++) {
      put(g, BOX, 2.5, bodyH, 2.5, -w / 2 + w * i / n, baseTop + bodyH / 2, d * 0.42, M.stoneCold);
    }
    /* 檐部：挑出、压重、加一道铜线 */
    put(g, BOX, w + 2.6, 2.8, d + 2.2, 0, h - 1.4, 0, M.stoneCold);
    put(g, BOX, w + 2.2, 0.7, d + 1.8, 0, h - 3.0, 0, M.bronzeDark);
    roofClutter(g, w * 0.9, d * 0.9, h, rd, M);
  };

  /* 案卷库：全区唯一没有玻璃的体量。实墙、窄缝、不加檐口。
     一排「实心的石头」压在竖肋楼群里，才显得出这是库房不是办公楼。 */
  ARCH.archiveVault = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 32, i;
    put(g, BOX, w * 1.08, 2.4, d * 1.08, 0, 1.2, 0, M.stoneColdDeep);
    put(g, BOX, w, h - 2.4, d, 0, 2.4 + (h - 2.4) / 2, 0, M.stoneCold2);
    /* 窄缝：宽不到一米、间距三米，只切到檐下三分之一 */
    var nf = Math.max(3, Math.round(w / 3.4));
    for (i = 1; i < nf; i++) {
      var px = -w / 2 + w * i / nf;
      put(g, BOX, 0.9, h * 0.52, 0.9, px, 2.4 + h * 0.30, d / 2 - 0.05, M.slit);
      put(g, BOX, 0.9, h * 0.52, 0.9, px, 2.4 + h * 0.30, -d / 2 + 0.05, M.slit);
    }
    /* 压顶：一条厚边，不要挑檐 */
    put(g, BOX, w + 0.8, 1.2, d + 0.8, 0, h - 0.6, 0, M.stoneCold);
    /* 屋顶通风井：实心体量上唯一的凸起，也给俯视一点信息 */
    for (i = -1; i <= 1; i += 2) {
      put(g, BOX, w * 0.16, 2.6, d * 0.16, i * w * 0.22, h + 1.3, 0, M.stoneCold);
      put(g, BOX, w * 0.14, 0.5, d * 0.14, i * w * 0.22, h + 2.85, 0, M.metalDark);
    }
  };

  /* 门楼：轴线的起点。两片厚墩加一道过梁，中间是二十二米宽的门洞。 */
  ARCH.justiceGate = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 24;
    var pw = Math.max(6, w * 0.15);
    [-1, 1].forEach(function (sd) {
      put(g, BOX, pw, h, d, sd * (w / 2 - pw / 2), h / 2, 0, M.stoneCold);
      /* 墩身中部一道深色束带：不然就是两根白柱子 */
      put(g, BOX, pw + 1.4, 1.6, d + 1.0, sd * (w / 2 - pw / 2), h * 0.56, 0, M.stoneColdDeep);
      put(g, BOX, pw * 0.5, h * 0.72, 0.5, sd * (w / 2 - pw / 2), h * 0.36, d / 2 - 0.1, M.slit);
    });
    put(g, BOX, w, h * 0.24, d, 0, h - h * 0.12, 0, M.stoneCold);
    put(g, BOX, w + 2.2, 1.2, d + 1.4, 0, h + 0.6, 0, M.stoneCold2);
    /* 过梁下挂铜匾：门楼的匾要压在人视线高度，不能飘在顶上 */
    put(g, BOX, w * 0.30, h * 0.11, 0.6, 0, h * 0.80, d / 2 + 0.3, M.bronze);
  };

  /* 案卷墙：广场两侧的长墙，一块块凸出的石碑。 */
  ARCH.recordWall = function (g, o, M, rd) {
    var w = o.w, d = o.d || 3.0, h = o.h || 7, i;
    put(g, BOX, w, 1.5, d + 0.8, 0, 0.75, 0, M.stoneColdDeep);
    put(g, BOX, w, h - 1.5, d, 0, 1.5 + (h - 1.5) / 2, 0, M.stoneCold2);
    var n = Math.max(4, Math.round(w / 3.2));
    for (i = 0; i < n; i++) {
      var px = -w / 2 + w * (i + 0.5) / n;
      put(g, BOX, w / n * 0.60, (h - 1.5) * 0.58, 0.5, px, 1.5 + (h - 1.5) * 0.40, d / 2, M.stoneCold);
    }
    put(g, BOX, w + 0.5, 0.5, d + 0.7, 0, h + 0.25, 0, M.stoneCold);
  };

  /* 推理法医馆（H2）：全区唯一的暖色体量，独立在西侧。
     司法机关用冷青石，这栋用暖石——它本来就不审判，只「检视」。
     形式上仍是方整的，不能做成一个玻璃怪盒子：那样就从司法区里掉出去了。 */
  ARCH.forensicHall = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 32, i;
    put(g, BOX, w * 1.10, 2.2, d * 1.10, 0, 1.1, 0, M.stoneColdDeep);
    var b = 2.2, bh = h - b - 2.4;
    /* 主体：暖石实体 */
    put(g, BOX, w, bh, d, 0, b + bh / 2, 0, M.forensicStone);
    /* 深色玻璃腰带：全区的窗都是竖缝，只有这一栋横着切开一刀。
       横带压得低一点，才能把「检查」这件事说出来。 */
    put(g, BOX, w + 0.6, bh * 0.22, d + 0.9, 0, b + bh * 0.46, 0, M.slit);
    /* 竖向分仓：三段石的节奏，不然就是一堵暖墙 */
    var n = Math.max(3, Math.round(w / 11));
    for (i = 1; i < n; i++) {
      var px = -w / 2 + w * i / n;
      put(g, BOX, 1.6, bh, 1.3, px, b + bh / 2, d / 2 + 0.2, M.forensicDeep);
      put(g, BOX, 1.4, bh, 1.6, px, b + bh / 2, -d / 2 - 0.2, M.forensicDeep);
    }
    /* 外挑观察廊：朝中轴那一侧悬出去，挑在玻璃腰带上方 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 0.7, bh * 0.26, d * 0.80, sd * (w / 2 + 2.4), b + bh * 0.62, 0, M.slit);
      put(g, BOX, 3.4, 0.6, d * 0.80, sd * (w / 2 + 1.9), b + bh * 0.62 + bh * 0.13 + 0.3, 0, M.bronze);
    });
    /* 压顶 */
    put(g, BOX, w + 1.8, 1.5, d + 1.8, 0, h - 0.9, 0, M.forensicDeep);
    /* 屋顶排风机组：法医实验室要抽风，这组东西是它区别于其他楼的功能标记 */
    for (i = -1; i <= 1; i++) {
      put(g, BOX, w * 0.15, 2.6, d * 0.18, i * w * 0.28, h + 1.3, -d * 0.16, M.metal);
      put(g, CYL, w * 0.10, 1.3, w * 0.10, i * w * 0.28, h + 3.2, -d * 0.16, M.metalDark);
    }
  };

  /* ------------------------------------------------------------
     D06 西站枢纽区：线上式车站 / 折板雨棚 / 停车楼 / 连廊
     前五区的主语都是「一片肌理」，这一区的主语是「一个剖面」：
     0 米是换乘大厅，8.4 米是站台面，13.6~19 米是折板雨棚，
     轨道从棚下穿过去。所有构件都围着这三条标高成立，
     少掉任何一层，站城一体就退化成一座横在铁路边上的大房子。
     ------------------------------------------------------------ */

  /* 斜放构件：put 只给 y 轴旋转，折板/扶梯要绕 x 或 z 转，
     单独开一个小口子，避免每个原型里各写一遍 Mesh 装配。 */
  function tiltBox(g, w, h, d, x, y, z, axis, ang, mat) {
    var m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y + YBASE, z);
    m.rotation[axis] = ang;
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }

  /* 换乘大厅：8.4 米高的玻璃厅，屋顶就是站台板。
     两端必须是实体石墙——通高玻璃盒子在俯视里会读成一个空棚子，
     真正把「车站」立起来的是这两块重体量，玻璃只负责透。 */
  ARCH.stationHall = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = o.h || 8.4, i;
    put(g, BOX, w + 3.4, 0.7, d + 3.4, 0, 0.35, 0, M.stationStone);
    /* 端部石墩：两头各一块 13 米长的实体，把整座厅「夹住」。
       通高玻璃盒子在俯视里读成一个空棚子，真正立得住车站的是这两块重体量。 */
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 13.0, h, d, sx * (w / 2 - 6.5), h / 2, 0, M.stationStone);
      /* 端墙上的竖缝：全实墙会像一座仓库 */
      for (var s = -1; s <= 1; s++) {
        put(g, BOX, 0.55, h * 0.62, d * 0.40, sx * (w / 2 + 0.10), h * 0.36, s * d * 0.28, M.stationGlass);
      }
      put(g, BOX, 13.8, 1.0, d + 1.2, sx * (w / 2 - 6.5), h - 0.5, 0, M.stationDeep);
    });
    /* 正立面：石墩夹三个通高门洞。上一版整面做玻璃，远看是一道黑影，
       站房整个消失。车站正面的读法就是「实墙垛 + 三个大洞」，
       洞后面是暗的，站房才有厚度。 */
    var pierX = [[-53, -44], [-22, -11], [11, 22], [44, 53]];
    var gateX = [-33, 0, 33];
    pierX.forEach(function (px) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, px[1] - px[0], h, 0.8, (px[0] + px[1]) / 2, h / 2, sz * (d / 2 - 0.3), M.stationStone);
        /* 石垛上开一条横缝：整面白墙会读成厂房 */
        put(g, BOX, (px[1] - px[0]) * 0.8, 1.5, 0.3, (px[0] + px[1]) / 2, 3.6, sz * (d / 2 + 0.14), M.stationDeep);
      });
    });
    gateX.forEach(function (ex) {
      put(g, BOX, 22, h - 1.4, 0.3, ex, (h - 1.4) / 2, d / 2 - 0.55, M.doorDark);
      /* 背立面不能跟着开洞：那三跨在背面要补实，只留一条高侧窗 */
      put(g, BOX, 22, h, 0.8, ex, h / 2, -(d / 2 - 0.3), M.stationStone);
      put(g, BOX, 21, 1.6, 0.3, ex, 5.2, -(d / 2 + 0.16), M.stationGlass);
      /* 门洞上沿的过梁 */
      put(g, BOX, 22.4, 1.4, 0.9, ex, h - 0.7, d / 2 - 0.3, M.stationStone);
      /* 正立面的雨棚和踏步已经交给 stationPortal 做，
         大厅这一层只负责「从门楼穿进来之后还是个厅」，不再自己做门头。 */
      /* 门套竖挺 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 1.1, h - 1.4, 1.0, ex + sd * 11.2, (h - 1.4) / 2, d / 2 - 0.2, M.stationDeep);
      });
    });
    /* 厅内体量：玻璃后面不能是空的。售票岛、商服盒子 */
    for (i = -1; i <= 1; i += 2) {
      put(g, BOX, 16, 2.6, 10, i * 32, 1.3, -d * 0.18, M.stationStone);
      put(g, BOX, 16.6, 0.4, 10.6, i * 32, 2.75, -d * 0.18, M.stationDeep);
    }
    /* 屋面：大厅顶就是站台板，四周压女儿墙，站台上的人才不会看到「楼顶」。
       屋面板要压到 8.15 —— 桥面梁顶在 8.4，两个面同高会在站台上闪成一片。
       压下去之后，穿过大厅的那片桥梁反而成了「厅顶的结构」，读起来是对的。 */
    put(g, BOX, w, 0.4, d, 0, h - 0.25, 0, M.deckConcrete);
    [[0, d / 2], [0, -d / 2]].forEach(function (e) {
      put(g, BOX, w + 1, 0.9, 0.5, e[0], h + 0.45, e[1], M.stationStone);
    });
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 0.5, 0.9, d + 1, sx * w / 2, h + 0.45, 0, M.stationStone);
    });
  };

  /* 站房门楼：8.4 米的换乘厅整个压在 8.46 米的高架桥面底下，
     从广场往回看，站房只剩「桥面底下一道阴影」，整座车站读成一座棚。
     桥下这一层是抬不高的（再高就穿进桥面了），所以站房的立面必须单独做：
     在南侧贴着桥缘立一座 15.4 米高的门楼，三段通高门洞 + 一条厚檐部。
     它不是另盖一栋楼——进深只有 14 米，正好占掉站台板南缘（v=18）
     到大厅前沿（v=33）之间那段谁都用不上的空地，门楼后面紧接大厅。
     有了这一层，剖面才是「门楼 15.4 / 雨棚 17.5」两级，而不是一层平棚。 */
  ARCH.stationPortal = function (g, o, M, rd) {
    var w = o.w || 132, d = o.d || 14, h = o.h || 18.6;
    var hg = 11.0;                    /* 门洞净高：22 宽 × 11 高。
                                         这一版是招牌与门洞比例的平衡点：
                                         檐部 7.6 米装得下 7 米高的站名带，
                                         22:11 也还是通高门洞，不是一排窗。 */
    var he = h + 5.0;                 /* 两端实体塔：门楼靠这两个竖块才立得住 */
    var i;
    /* 台基 + 三级踏步：广场到厅内要抬一级，站房才有「上台」这个动作 */
    put(g, BOX, w + 4, 0.85, d + 3, 0, 0.43, 0, M.stationStone);
    for (i = 0; i < 3; i++) {
      put(g, BOX, w + 2, 0.28, 1.6, 0, 0.14 + i * 0.28, d / 2 + 3.2 - i * 1.45, M.stationStone);
    }
    /* 开间与大厅正立面严格对齐：从门洞往里看，第二层门洞正好套在里面。
       两端 22 米做成 21 米高的实体塔，中间只到 16 米——
       132 米宽、16 米高的立面单靠一条檐部收不住，会读成一排沿街商铺；
       两个竖块一立，中间的通透才成立。垛面不要排密肋，
       15 米高墙上一排深色细线，远看就是一面波纹板。 */
    var ends = [[-66, -44], [44, 66]];
    var mids = [[-22, -11], [11, 22]];
    var gate = [-33, 0, 33];
    ends.forEach(function (px) {
      var pw2 = px[1] - px[0], pcx = (px[0] + px[1]) / 2;
      put(g, BOX, pw2, he - 0.4, d, pcx, (he - 0.4) / 2, 0, M.stationStone);
      put(g, BOX, pw2 + 1.0, 0.42, d + 1.6, pcx, he - 0.2, 0, M.stationDeep);
      /* 端塔上只开一条窄竖缝：整面素墙在日照下就是一块白板 */
      put(g, BOX, 2.4, he - 6.0, 0.5, pcx, 3.0 + (he - 6.0) / 2, d / 2 + 0.2, M.stationDark);
    });
    mids.forEach(function (px) {
      var pw2 = px[1] - px[0], pcx = (px[0] + px[1]) / 2;
      put(g, BOX, pw2, h - 0.3, d, pcx, (h - 0.3) / 2, 0, M.stationStone);
      put(g, BOX, 0.7, hg - 3.0, 0.45, pcx, 1.2 + (hg - 3.0) / 2, d / 2 + 0.22, M.stationDeep);
      put(g, BOX, pw2 + 0.4, 0.30, d + 0.5, pcx, hg + 0.15, 0, M.stationDeep);
    });
    gate.forEach(function (ex) {
      /* 洞口内壁：一圈深色衬板，门洞才有厚度，而不是墙上的一个洞 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.5, hg, d, ex + sd * 11.25, hg / 2, 0, M.stationDeep);
      });
      put(g, BOX, 22.5, 0.5, d, ex, hg - 0.25, 0, M.stationDeep);
      put(g, BOX, 22.5, 0.22, d, ex, 0.11, 0, M.stationDeep);
      /* 洞口尽头：深色玻璃。这里原来是 stationGlass（浅蓝），
         结果三个门洞在远看时是三个亮蓝方块，整座站房像一排卷帘门。
         门洞的读法是「暗」，后面有什么不重要。 */
      put(g, BOX, 22.0, hg - 0.6, 0.35, ex, 0.3 + (hg - 0.6) / 2, -d / 2 + 0.3, M.stationDark);
      /* 门洞上沿一道紫线：全区唯一允许发光的构件，只在这一处 */
      put(g, BOX, 21.6, 0.20, 0.7, ex, hg + 0.34, d / 2 + 0.55, M.accent);
      /* 门套竖挺：压在洞口两侧，把 22 米宽的开间收住 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 1.3, hg + 0.7, d + 0.7, ex + sd * 11.9, (hg + 0.7) / 2, 0.15, M.stationStone);
      });
    });
    /* 檐部只跨中间两个开间（-44~44）：两端已经是塔，檐部再通长就白做了。
       檐口出挑一层薄板，影子落在石墙上，立面才有顶。 */
    put(g, BOX, 89, h - hg - 0.2, d + 1.4, 0, (h + hg + 0.2) / 2, 0, M.stationStone);
    put(g, BOX, 90, 0.34, d + 1.8, 0, h + 0.17, 0, M.stationDeep);
    put(g, BOX, 88, 0.26, d + 0.4, 0, h - 0.13, 0, M.stationDeep);
    /* 檐部只留一道通长凹槽，不做竖肋：这一层是「压顶」，不是「墙」。
       凹槽压在垛顶线上（hg+0.15），不能再单开一道——檐部就 6 米，
       上下两道横线会把招牌挤没。 */
    /* 站名牌：直接贴在檐部的正立面上。
       不能走通用的「屋顶立牌」——那套是把牌子架在包围盒顶上，
       这里顶上是 20 米的雨棚，牌子会从檐部一路穿到雨棚里去。
       贴图用 stationSignTexture（字号大、边框细），18.4×5.4 米
       挂在 6 米高的檐部上，字高接近 4 米，中景才读得出「西园站」。 */
    if (o.plate) {
      var pw3 = o.plate.w || 24, sh3 = pw3 * (280 / 960);
      var tex3 = stationSignTexture(o.plate.name, o.plate.en, o.plate.tone);
      var smat3 = new THREE.MeshStandardMaterial({
        map: tex3, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex3, emissiveIntensity: 0.50,
        roughness: 0.58, metalness: 0.05, envMapIntensity: 0.3 });
      var sp3 = new THREE.Mesh(new THREE.PlaneGeometry(pw3, sh3), smat3);
      sp3.position.set(0, o.plateY === undefined ? hg + 0.2 + sh3 / 2 : o.plateY,
        d / 2 + 0.72);
      g.add(sp3);
    }
  };

  /* 站台雨棚：226 米折板顶 + 站台面 + 灯带。
     折板的读法靠「脊线 + 谷线」，所以顶板必须是一块块斜板拼的，
     用一张弧面或一块平板都读不出那个锯齿形的断面。 */
  ARCH.stationCanopy = function (g, o, M, rd) {
    var w = o.w || 226, d = o.d || 34, i;
    var deckY = 8.46, platY = 9.5, baseY = 21.2;
    /* 站台板：比区间桥面宽 10 米，站场在桥上是局部加宽的。
       整块板盖在轨道段上会把道床与钢轨一起埋掉，所以只在轨道两侧做站台，
       中间那道 20 米宽的空档留给车。 */
    put(g, BOX, w, 0.6, d + 2, 0, deckY - 0.3, 0, M.deckConcrete);
    put(g, BOX, w + 0.6, 0.24, d + 2.6, 0, deckY - 0.06, 0, M.deckEdge);
    /* 岛式站台：中间 12.4 米 */
    put(g, BOX, w - 4, platY - deckY, 12.4, 0, deckY + (platY - deckY) / 2, 0, M.platform);
    /* 两侧检修/边站台：轨道外侧那 7.6 米 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, w - 4, 0.58, 7.6, 0, deckY + 0.29, sz * 14.2, M.platform);
    });
    /* 加宽段两端必须落地：36 米宽的站台板两头悬空，侧看就是一块飞着的板 */
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 2.8, deckY - 0.7, 2.8, sx * (w / 2 - 10), (deckY - 0.7) / 2, sz * 12.6, M.pierConcrete);
      });
    });
    /* 站台边缘的安全线：一条黄色盲道，俯视时是站台唯一的亮线 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, w - 8, 0.06, 0.62, 0, platY + 0.03, sz * 5.55, M.tactile);
      put(g, BOX, w - 8, 0.05, 0.22, 0, platY + 0.03, sz * 5.0, M.stationDeep);
    });
    /* 站台家具：座椅、灯箱、导向牌，沿中线两列 */
    for (i = -7; i <= 7; i++) {
      if (i === 0) continue;
      var bx = i * 13;
      put(g, BOX, 5.2, 0.5, 0.9, bx, platY + 0.65, 0, M.wood);
      put(g, BOX, 0.9, 1.6, 0.9, bx - 2.2, platY + 0.8, 0, M.stationDeep);
      put(g, BOX, 0.9, 1.6, 0.9, bx + 2.2, platY + 0.8, 0, M.stationDeep);
    }
    for (i = -5; i <= 5; i++) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.9, 2.4, 0.16, i * 21 + 7, platY + 1.9, sz * 4.4, M.accent);
        put(g, BOX, 0.9, 0.3, 0.26, i * 21 + 7, platY + 0.85, sz * 4.4, M.stationDeep);
      });
    }
    /* 柱：站在站台板外侧，V 形分叉撑住 34 米跨的雨棚 */
    for (i = -7; i <= 7; i++) {
      var cx = i * 16;
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 1.3, baseY - deckY, 1.3, cx, deckY + (baseY - deckY) / 2, sz * 15.6, M.canopySteel);
        strut(g, cx, baseY - 0.2, sz * 15.6, cx, baseY + 1.5, sz * 10.4, 0.42, M.canopySteel);
        strut(g, cx, baseY - 0.2, sz * 15.6, cx, baseY - 0.9, sz * 17.4, 0.34, M.canopySteel);
        put(g, BOX, 1.6, 0.5, 7.4, cx, baseY + 1.4, sz * 12.9, M.canopySteel).rotation.x = sz * 0.16;
      });
    }
    /* 折板顶：9 个折点、8 块斜板，峰谷交替；中间略高，形成一道极缓的弧 */
    var zs = [], N = 8, half = d / 2;
    for (i = 0; i <= N; i++) zs.push(-half + d * i / N);
    function plateY(z) {
      var peak = (Math.round((z + half) / (d / N)) % 2) === 1;
      return baseY + (peak ? 4.6 : 0) + 1.8 * (1 - Math.abs(z) / half);
    }
    for (i = 0; i < N; i++) {
      var z0 = zs[i], z1 = zs[i + 1], y0 = plateY(z0), y1 = plateY(z1);
      var dz = z1 - z0, dy = y1 - y0, L = Math.sqrt(dz * dz + dy * dy);
      var mt = tiltBox(g, w, 0.42, L, 0, (y0 + y1) / 2, (z0 + z1) / 2, "x", Math.atan2(dy, dz), M.canopySteel);
      mt.castShadow = true;
      /* 脊上压一道薄脊瓦：没有它，折板远看只是一块灰棚 */
      if (y0 > y1) put(g, BOX, w, 0.30, 0.5, 0, y0 + 0.18, z0, M.canopyRidge);
    }
    /* 檐口 + 灯带：整条雨棚唯一的紫色，只在这里出现一次 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, w + 0.6, 1.5, 0.5, 0, baseY - 0.6, sz * (half + 0.1), M.canopySteel);
      put(g, BOX, w + 0.4, 0.34, 0.62, 0, baseY - 1.3, sz * (half + 0.12), M.accent);
      put(g, BOX, w + 0.3, 0.55, 0.8, 0, baseY + 0.30, sz * (half + 0.1), M.canopyRidge);
    });
    /* 端墙：雨棚两端要收口，否则从侧面看是一排通透的肋 */
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 0.5, baseY - platY, d, sx * (w / 2 - 0.25), platY + (baseY - platY) / 2, 0, M.stationDark);
      for (i = -3; i <= 3; i++) {
        put(g, BOX, 0.7, baseY - platY, 0.5, sx * (w / 2 - 0.25), platY + (baseY - platY) / 2, i * d / 7, M.canopySteel);
      }
      put(g, BOX, 1.1, 0.9, d + 1, sx * (w / 2 - 0.25), baseY + 0.3, 0, M.canopyRidge);
    });
  };

  /* 端部楼梯间：地面 0 米到站台 9.4 米的那两部大楼梯。
     玻璃盒子 + 斜屋面的形式，广场上才看得出「上去坐车」。 */
  ARCH.stationStair = function (g, o, M, rd) {
    var w = o.w || 18, d = o.d || 26, h = o.h || 9.8;
    put(g, BOX, w + 1.6, 1.3, d + 1.6, 0, 0.65, 0, M.stationStone);
    /* 主体是深色玻璃、竖挺是浅石：反转过来（浅玻璃 + 深挺）在远中景里
       就是两只亮蓝的集装箱，比后面的站房还跳。楼梯间是配角。 */
    put(g, BOX, w, h - 1.3, d, 0, 1.3 + (h - 1.3) / 2, 0, M.stationDark);
    var nb = Math.round(w / 3);
    for (var i = 0; i <= nb; i++) {
      put(g, BOX, 0.42, h - 1.1, 0.5, -w / 2 + w * i / nb, 1.2 + (h - 1.1) / 2, d / 2 - 0.1, M.stationStone);
      put(g, BOX, 0.42, h - 1.1, 0.5, -w / 2 + w * i / nb, 1.2 + (h - 1.1) / 2, -d / 2 + 0.1, M.stationStone);
    }
    /* 一道通长的玻璃亮带：楼梯间要「透」，否则就是一只石盒子 */
    put(g, BOX, w - 0.6, 3.0, 0.3, 0, h - 2.6, d / 2 - 0.05, M.stationGlass);
    /* 斜屋面：整个盒子的方向感全在这块斜板上，平顶就成了一个配电房 */
    tiltBox(g, w + 1.2, 0.5, d + 1.4, 0, h + 0.55, 0, "z", -0.11, M.canopyRidge);
    put(g, BOX, w + 1.4, 0.28, 0.5, 0, h + 0.9, d / 2 + 0.2, M.accent);
    /* 里面的扶梯：隔着玻璃看到一条斜线，才知道这里是往上走的 */
    var a = Math.atan2(h - 1.4, d - 6);
    tiltBox(g, 4.4, 0.8, Math.sqrt(Math.pow(d - 6, 2) + Math.pow(h - 1.4, 2)),
      0, (h + 1.4) / 2, 0, "x", a, M.stationGlass);
  };

  /* 停车楼：4 层错层板 + 连续横带，是枢纽区最典型的背景体量。
     它不能做成办公楼——开口的连续水平带才是停车楼的语法。 */
  ARCH.parkingGarage = function (g, o, M, rd) {
    var w = o.w || 96, d = o.d || 58, h = o.h || 13.2, i, lv;
    var lvH = h / 4;
    put(g, BOX, w + 1.6, 0.6, d + 1.6, 0, 0.3, 0, M.stationStone);
    for (lv = 0; lv < 4; lv++) {
      var y = lv * lvH;
      if (lv < 3) {
        /* 楼板：挑出 0.9 米，板边在立面上就是那道横线 */
        put(g, BOX, w + 1.8, 0.42, d + 1.8, 0, y + lvH, 0, M.deckConcrete);
        /* 层间栏杆带：0.9 米高、留缝，读起来是开口不是墙 */
        [-1, 1].forEach(function (sz) {
          put(g, BOX, w, 0.85, 0.26, 0, y + lvH - 0.15, sz * (d / 2 + 0.6), M.garageBand);
        });
        [-1, 1].forEach(function (sx) {
          put(g, BOX, 0.26, 0.85, d, sx * (w / 2 + 0.6), y + lvH - 0.15, 0, M.garageBand);
        });
      }
    }
    /* 柱网：11 × 6，柱子是唯一落地的东西 */
    for (i = -5; i <= 5; i++) {
      for (var j = -2; j <= 2; j++) {
        put(g, BOX, 1.0, h, 1.0, i * (w / 11), h / 2, j * (d / 5), M.concreteDark);
      }
    }
    /* 地面层：临街一侧做实体墙 + 一个车行口 */
    put(g, BOX, w, 3.4, 0.5, 0, 1.7, d / 2 - 0.3, M.stationStone);
    put(g, BOX, 18, 3.0, 0.8, w * 0.22, 1.5, d / 2 - 0.25, M.doorDark);
    /* 斜车道：两侧各一条，挂在端部 */
    [-1, 1].forEach(function (sx) {
      var a = Math.atan2(lvH, 26);
      tiltBox(g, 9, 0.4, 27, sx * (w / 2 - 6), lvH * 0.5 + 0.4, 0, "x", a * 0.9, M.deckConcrete);
    });
    /* 屋顶：光伏板阵列。停车楼顶是枢纽区最该有光伏的地方。
       不要铺满——铺满的屋顶在俯视里是一块蓝玻璃，读不出「停车楼」。 */
    for (i = -2; i <= 2; i++) {
      for (var k = -1; k <= 1; k++) {
        tiltBox(g, 7.4, 0.18, 3.0, i * (w / 6), h + 1.5, k * (d / 4.4), "x", -0.30, M.pv);
      }
    }
    for (i = -2; i <= 2; i++) {
      put(g, BOX, 0.24, 1.2, 0.24, i * (w / 6), h + 0.6, 0, M.metalDark);
    }
    /* 楼梯核：比屋面高出一截，给这栋方盒子一个落点 */
    put(g, BOX, 9, 4.2, 9, -w * 0.34, h + 2.1, -d * 0.30, M.stationStone);
    put(g, BOX, 9.6, 0.5, 9.6, -w * 0.34, h + 4.4, -d * 0.30, M.stationDeep);
  };

  /* 空中连廊：停车楼/塔楼到车站的那条封闭廊道。
     它必须真的「架起来」——两端落在实体上，中间两排柱，廊下能走人。 */
  ARCH.skyBridge = function (g, o, M, rd) {
    var w = o.w || 36, d = o.d || 7, h = o.h || 6.4;
    put(g, BOX, w, 0.55, d, 0, h, 0, M.deckConcrete);
    put(g, BOX, w, 2.6, 0.3, 0, h + 1.5, d / 2, M.stationGlass);
    put(g, BOX, w, 2.6, 0.3, 0, h + 1.5, -d / 2, M.stationGlass);
    var nb = Math.round(w / 3.2);
    for (var i = 0; i <= nb; i++) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.22, 2.7, 0.42, -w / 2 + w * i / nb, h + 1.5, sz * d / 2, M.stationDeep);
      });
    }
    put(g, BOX, w + 1.2, 0.42, d + 1.2, 0, h + 3.0, 0, M.stationDeep);
    put(g, BOX, w + 0.6, 0.2, d + 0.6, 0, h + 3.3, 0, M.canopySteel);
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 1.6, h, 1.6, sx * w * 0.30, h / 2 - 0.2, 0, M.concreteDark);
      put(g, BOX, 3.2, 4.4, d + 1.4, sx * (w / 2 - 1.6), h + 2.0, 0, M.stationStone);
    });
  };

  /* 公交首末站：站前广场西侧的岛式站台。
     枢纽区只有火车就还是「一个站」，加了公交站台才是「枢纽」。 */
  ARCH.busBay = function (g, o, M, rd) {
    var w = o.w || 90, d = o.d || 38, h = o.h || 5.4, i;
    put(g, BOX, w, 0.28, d, 0, 0.14, 0, M.paving3);
    /* 岛式候车台：长条平台 + 顶棚 */
    for (i = -1; i <= 1; i++) {
      put(g, BOX, w * 0.26, 0.34, 8.4, i * w * 0.30, 0.17, 0, M.paving);
      put(g, BOX, w * 0.26 + 2, 0.5, 10, i * w * 0.30, h, 0, M.canopySteel);
      put(g, BOX, w * 0.26, 0.16, 1.2, i * w * 0.30, h - 0.4, 3.4, M.accent);
      [-1, 1].forEach(function (sz) {
        [-(w * 0.11), 0, w * 0.11].forEach(function (cx) {
          put(g, BOX, 0.4, h - 0.4, 0.4, i * w * 0.30 + cx, (h - 0.4) / 2 + 0.3, sz * 3.6, M.metalDark);
        });
      });
      put(g, BOX, w * 0.2, 0.55, 0.9, i * w * 0.30, 0.9, 0, M.wood);
    }
    /* 调度房：一个 4 米高的玻璃盒子，给站台一个实体 */
    put(g, BOX, 20, 4.2, 12, -w * 0.36, 2.1, -d * 0.28, M.stationStone);
    put(g, BOX, 19.4, 2.4, 12.4, -w * 0.36, 2.2, -d * 0.28, M.stationGlass);
    put(g, BOX, 21, 0.45, 13, -w * 0.36, 4.4, -d * 0.28, M.stationDeep);
    /* 车位划线：地面上唯一能读出「这里是公交场站」的东西 */
    for (i = -3; i <= 3; i++) {
      put(g, BOX, 0.3, 0.04, 24, i * 11, 0.32, -d * 0.12, M.paint);
    }
  };

  /* ------------------------------------------------------------
     大学城创新园（D07）
     校园的识别不靠地标，靠「秩序」：一条轴线、一圈院落、一段大台阶。
     所以这一组原型全部是「低、宽、有檐」的体量，没有一个是靠造型取胜的。
     校园里唯一允许「有正面」的建筑只有图书馆——那是轴线的终点。
     ------------------------------------------------------------ */

  /* 校门：一道 132 米的门架，两端实墙，中间 76 米跨的门梁。
     校门不需要高，但必须有跨度：跨度够了，人从下面走过去才知道
     自己进的是另一个地方。 */
  ARCH.campusGate = function (g, o, M, rd) {
    var w = o.w || 132, h = o.h || 19.6, i;
    /* 门洞 10 米、梁 9.6 米：两者高度接近，门洞才不会被上面那道梁压扁。
       早先梁 10.2、洞 8.6，整座门读成一块横板，中间的洞只是板上的缝。 */
    var pierW = 28, pierH = 10.0;
    var span = w - pierW * 2;
    /* 梁必须坐在端墙顶上：梁底 = 墙顶。早先按「总高减梁高」算，
       总高一抬，梁就浮在墙上方，中间空出 3 米多。
       梁高 10.2 米，是为了装下 32 米宽、9.3 米高的校名牌——
       牌子做 44 米宽时高 12.8 米，比梁还高，整块从梁里穿出去。 */
    var beamH = h - pierH, beamY = pierH + beamH / 2;
    [-1, 1].forEach(function (sx) {
      var cx = sx * (w / 2 - pierW / 2);
      put(g, BOX, pierW, pierH, 4.4, cx, pierH / 2, 0, M.campusSand);
      put(g, BOX, pierW + 1.2, 0.62, 5.4, cx, pierH + 0.31, 0, M.campusTrim);
      put(g, BOX, pierW + 0.6, 0.34, 5.0, cx, 0.17, 0, M.campusTrim);
      /* 素墙上的竖向石缝：这是这一段唯一的立面分割 */
      for (i = 0; i < 5; i++) {
        put(g, BOX, 0.42, pierH - 1.2, 0.42, cx - pierW / 2 + pierW * (i + 1) / 6,
          pierH / 2, 2.3, M.campusTrim);
      }
    });
    /* 门梁：76 米一跨，中间不落柱。梁底 10 米、梁高 6.8 米。
       这道梁的厚度就是校门的「重」——薄了像天桥，厚了像一堵墙。 */
    put(g, BOX, span, beamH, 3.4, 0, beamY, 0, M.campusSand);
    put(g, BOX, span + 1.6, 0.58, 4.4, 0, h + 0.29, 0, M.campusTrim);
    put(g, BOX, span + 0.4, 0.44, 3.9, 0, pierH + 0.22, 0, M.campusTrim);
    /* 梁底两道阴影槽：梁底不压深色，远看只是一条浅灰横带，没有厚度 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, span - 3, 0.9, 0.44, 0, pierH + 1.3, sz * 1.45, M.campusTrim);
    });
    /* 校名牌：挂满梁面正中。这是全区唯一的一块大字。 */
    if (o.plate) {
      var pw = o.plate.w || 34, sh = pw * (280 / 960);
      var tex = stationSignTexture(o.plate.name, o.plate.en, o.plate.tone);
      var smat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.24,
        roughness: 0.62, metalness: 0.04, envMapIntensity: 0.28 });
      var sp = new THREE.Mesh(new THREE.PlaneGeometry(pw, sh), smat);
      sp.position.set(0, beamY + 0.15, 1.78);
      g.add(sp);
    }
    /* 门槛：一条深色铺装横过校门。从广场看，这条带子就是校园的起点。 */
    put(g, BOX, span + 4, 0.12, 10, 0, 0.06, 0, M.campusTrim);
    /* 门卫房：门架太大，没有这两个 3 米的小体量做参照，
       整座门远看就是一座碑。 */
    [-1, 1].forEach(function (sx) {
      var bx = sx * (span / 2 + 4);
      put(g, BOX, 9, 3.4, 6, bx, 1.7, 3.6, M.campusWhite);
      put(g, BOX, 9.8, 0.42, 6.8, bx, 3.6, 3.6, M.campusTrim);
      put(g, BOX, 7.4, 1.8, 0.3, bx, 2.0, 6.7, M.campusGlass);
    });
  };

  /* 图书馆：轴线终点。40×34，30 米高，正立面一列通高柱廊。
     全校只有这一栋「有正面」，所以台阶、柱廊、退台这三件事必须做足，
     少一样它就退回成一栋方盒子教学楼。 */
  ARCH.campusLibrary = function (g, o, M, rd) {
    var w = o.w || 48, d = o.d || 40, h = o.h || 36, i;
    var baseY = 1.5;
    /* 台基 + 大台阶：图书馆是全校最高的楼，它必须「坐上来」 */
    put(g, BOX, w + 6, baseY, d + 6, 0, baseY / 2, 0, M.campusWhite2);
    for (i = 0; i < 7; i++) {
      put(g, BOX, w + 2.4, 0.22, 1.5, 0, 0.22 + i * 0.21, d / 2 + 4.6 - i * 0.68, M.campusStone);
    }
    /* 主体 25 米：全校其余建筑压在 18~24，图书馆必须高出一档，
       否则它只是「一栋比较大的教学楼」，轴线的终点就没有落点。 */
    var bw = w - 6, bd = d - 8, bh = 26;
    put(g, BOX, bw, bh, bd, 0, baseY + bh / 2, -1.6, M.campusStone);
    /* 柱廊：8 根方柱，柱顶一道通长额枋，柱子后面是深玻璃。
       柱廊的读法全靠「柱—玻璃—柱」的明暗交替，
       所以玻璃必须深，柱子必须亮。 */
    /* 柱廊进深必须够：柱子贴着玻璃（只差 0.6 米）时，
       远看是一面白墙上一排竖线，不是「进深」。
       玻璃退到 8 米，柱子留在 2 米，中间那 6 米才是柱廊。 */
    var cn = 7, cw = bw - 4;
    put(g, BOX, cw + 1.6, bh - 1.2, 2.2, 0, baseY + (bh - 1.2) / 2, d / 2 - 9.2, M.campusGlass);
    for (i = 0; i <= cn; i++) {
      var cx = -cw / 2 + cw * i / cn;
      put(g, BOX, 2.0, bh - 2.4, 2.0, cx, baseY + (bh - 2.4) / 2, d / 2 - 3.0, M.campusWhite);
      put(g, BOX, 2.7, 0.5, 2.7, cx, baseY + 0.25, d / 2 - 3.0, M.campusWhite2);
      put(g, BOX, 2.6, 0.9, 2.6, cx, baseY + bh - 3.4, d / 2 - 3.0, M.campusWhite);
    }
    /* 额枋 + 檐口：柱廊上面必须有一道厚梁压住，否则一排柱子会散开 */
    put(g, BOX, bw + 1.2, 1.6, 11.2, 0, baseY + bh - 0.8, d / 2 - 6.4, M.campusWhite);
    /* 柱廊地面：比台基再抬 0.3 米，柱廊才有「进去」这一下 */
    put(g, BOX, cw + 3, 0.30, 10.6, 0, baseY - 0.15, d / 2 - 6.4, M.campusStone);
    put(g, BOX, bw + 2.4, 0.7, bd + 2.4, 0, baseY + bh + 0.35, -1.6, M.campusTrim);
    /* 顶部退台：一圈内收的体量，图书馆才不是一个方盒子 */
    var tw = bw - 10, td = bd - 8, th = h - baseY - bh;
    put(g, BOX, tw, th, td, 0, baseY + bh + th / 2, -1.6, M.campusStone);
    put(g, BOX, tw + 1.6, 0.5, td + 1.6, 0, baseY + bh + th + 0.25, -1.6, M.campusTrim);
    /* 塔冠：从校门看，图书馆在 370 米外，只看得到一个轮廓。
       没有这个头，它就是远方一个白方块，轴线的终点立不住。
       塔冠 14 米见方、再加一道出檐，影子落在退台上，轮廓才有形。 */
    put(g, BOX, 14, 4.2, 14, 0, baseY + bh + th + 2.1, -1.6, M.campusWhite);
    put(g, BOX, 15.4, 0.7, 15.4, 0, baseY + bh + th + 4.55, -1.6, M.campusTrim);
    put(g, BOX, 9.4, 1.6, 9.4, 0, baseY + bh + th + 5.7, -1.6, M.campusGlass);
    put(g, BOX, 10.6, 0.4, 10.6, 0, baseY + bh + th + 6.7, -1.6, M.campusTrim);
    /* 侧面竖向窗缝：主立面做了柱廊，两个侧立面不能是白板 */
    [-1, 1].forEach(function (sx) {
      for (i = 0; i < 6; i++) {
        put(g, BOX, 0.34, bh - 5.0, 2.0, sx * (bw / 2 + 0.1),
          baseY + 1.4 + (bh - 5.0) / 2, -1.6 - bd / 2 + bd * (i + 1) / 7, M.campusGlass);
      }
    });
  };

  /* 教学院落：四面楼围合内院（不是院墙）。
     校园的「院」和民居的「院」不是一回事——民居是墙，校园是四栋 4 层的楼。
     所以这里四面都是 14 米进深的楼板，内院是真的可以走进去的院子。 */
  ARCH.campusCourtHall = function (g, o, M, rd) {
    var w = o.w || 82, d = o.d || 68, h = o.h || 20, i;
    var t = 14;                         /* 楼板进深 */
    var hN = h, hS = h * 0.94, hW = h * 0.88, hE = h * 0.91;
    var dEW = d - t * 2;
    put(g, BOX, w, hN, t, 0, hN / 2, -d / 2 + t / 2, M.campusSand);
    put(g, BOX, w, hS, t, 0, hS / 2, d / 2 - t / 2, M.campusSand);
    put(g, BOX, t, hW, dEW, -w / 2 + t / 2, hW / 2, 0, M.campusSand);
    put(g, BOX, t, hE, dEW, w / 2 - t / 2, hE / 2, 0, M.campusSand);
    /* 檐口：四面各自一道，高度跟着各自的墙顶走。
       校园建筑的水平线全靠这一圈挑檐，没有它就是一排宿舍楼。 */
    put(g, BOX, w + 1.4, 0.62, t + 1.4, 0, hN + 0.31, -d / 2 + t / 2, M.campusTrim);
    put(g, BOX, w + 1.4, 0.62, t + 1.4, 0, hS + 0.31, d / 2 - t / 2, M.campusTrim);
    put(g, BOX, t + 1.4, 0.62, dEW, -w / 2 + t / 2, hW + 0.31, 0, M.campusTrim);
    put(g, BOX, t + 1.4, 0.62, dEW, w / 2 - t / 2, hE + 0.31, 0, M.campusTrim);
    /* 内院：草坪 + 一圈铺装 + 一棵树 */
    put(g, BOX, w - t * 2, 0.16, d - t * 2, 0, 0.09, 0, M.campusPaving);
    put(g, BOX, w - t * 2 - 12, 0.22, d - t * 2 - 12, 0, 0.13, 0, M.grass);
    put(g, CYL6, 1.1, 5.0, 1.1, 0, 2.5, 0, M.trunk);
    put(g, SPH, 8.4, 6.4, 8.4, 0, 7.8, 0, M.leaf);
    /* 面向主轴那一面（+z）开一个通高门洞：院子的入口要看得出来 */
    put(g, BOX, 10, hS - 3.4, t + 0.6, 0, (hS - 3.4) / 2, d / 2 - t / 2, M.campusGlass);
    put(g, BOX, 12.4, 0.7, t + 1.8, 0, hS - 3.0, d / 2 - t / 2, M.campusTrim);
    /* 竖条窗：每一面都开一列，间距 4.4 米。
       条窗是这一区的「窗」的语法——校园楼不刷幕墙，开竖缝。 */
    var cols = Math.max(3, Math.round(w / 4.4));
    for (i = 0; i <= cols; i++) {
      var x = -w / 2 + w * i / cols;
      put(g, BOX, 1.1, hN - 3.2, 0.35, x, 1.6 + (hN - 3.2) / 2, -d / 2 - 0.1, M.campusGlass);
      put(g, BOX, 1.1, hS - 3.2, 0.35, x, 1.6 + (hS - 3.2) / 2, d / 2 + 0.1, M.campusGlass);
    }
    var colsZ = Math.max(3, Math.round(dEW / 4.4));
    for (i = 0; i <= colsZ; i++) {
      var z = -dEW / 2 + dEW * i / colsZ;
      put(g, BOX, 0.35, hW - 3.2, 1.1, -w / 2 - 0.1, 1.6 + (hW - 3.2) / 2, z, M.campusGlass);
      put(g, BOX, 0.35, hE - 3.2, 1.1, w / 2 + 0.1, 1.6 + (hE - 3.2) / 2, z, M.campusGlass);
    }
  };

  /* 校企 AI 联合实验室：不是一栋楼，是一组。
     校企合作的空间逻辑和校园里别的楼不一样——学校出场地和人，
     企业出设备和钱，所以它必须同时有两个面：
     朝主轴的一面是通高玻璃（让学生看见里面在做什么），
     朝校门的一面是它自己的前场和招牌（车从这里开进来）。
     只做一栋方盒子，读起来就是又一个教学楼。 */
  ARCH.aiLab = function (g, o, M, rd) {
    var w = o.w || 96, d = o.d || 64, h = o.h || 32, i;
    /* 台基：整组体量坐在 0.9 米的石台上。
       校企基地有自己的边界，台基就是它的院墙——没有这一级，
       三栋楼只是蹲在草地上，跟校园里其他楼没有区别。 */
    put(g, BOX, w + 8, 0.9, d + 8, 0, 0.45, 0, M.campusStone);

    /* --- 主楼：34×32，方形体量 ---
       原来做 40 宽 × 26 高，正面是一条横带，怎么调都像一栋办公楼。
       校企实验室要「立」起来：34 宽、32 高，接近正方，
       正面才有竖向的分量，招牌也才挂在「楼」上而不是「板」上。 */
    var ax = -26, az = -8, aw = 34, ad = 32, ah = h;
    put(g, BOX, aw, ah - 0.9, ad, ax, 0.9 + (ah - 0.9) / 2, az, M.campusGlass);
    /* 四道白色水平遮阳带。玻璃盒子没有横线，光下一片均匀的蓝。 */
    for (i = 1; i <= 4; i++) {
      put(g, BOX, aw + 0.5, 0.72, ad + 0.5, ax, 0.9 + i * 6.4, az, M.campusWhite);
    }
    /* 两端实墙芯：纯玻璃盒子在光下没有角，立两根电梯井才有轮廓 */
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 7, ah, ad + 0.6, ax + sx * (aw / 2 - 3.5), ah / 2, az, M.campusWhite);
    });
    put(g, BOX, aw + 1.0, 1.1, ad + 1.0, ax, ah + 0.55, az, M.campusWhite2);
    /* 入口雨棚：一块 22 米的板从主楼挑出来，人要有个「进门」的动作 */
    put(g, BOX, 22, 0.55, 6, ax, 9.4, az + ad / 2 + 3.0, M.campusWhite);
    put(g, BOX, 21, 0.16, 5.2, ax, 9.06, az + ad / 2 + 3.0, M.campusGlass);

    /* --- 企业楼：26×28×18，深冷灰实体 ---
       它必须比主楼矮一档、暗一档。两组楼一个样读起来就是同一家单位的楼。
       这里只留一道通高玻璃竖缝加两排窄窗——一栋透到底，一栋实到底。 */
    var bx = 28, bz = 2, bw = 26, bd = 28, bh = 18;
    put(g, BOX, bw, bh - 0.9, bd, bx, 0.9 + (bh - 0.9) / 2, bz, M.corpShell);
    put(g, BOX, 3.6, bh - 1.4, bd + 0.5, bx - 4, 0.9 + (bh - 0.9) / 2, bz, M.campusGlass);
    [0, 1].forEach(function (r) {
      put(g, BOX, bw + 0.4, 0.9, bd + 0.4, bx, 6.2 + r * 5.2, bz, M.campusGlass);
    });
    put(g, BOX, bw + 1.2, 0.9, bd + 1.2, bx, bh + 0.45, bz, M.corpShell2);
    /* 企业楼往前错 8 米：两栋楼正面拉平，就是一道连续的长立面，
       错开之后从正面看才有前后，也才看得出是两家。 */
    put(g, BOX, bw + 3, 0.5, 6, bx, 4.6, bz + bd / 2 + 2.6, M.corpShell2);

    /* --- 中庭：两栋楼之间凹进去的玻璃厅，10 米高 ---
       高度只有主楼的三分之一，正面才留出 22 米的天空缝——
       把中庭做到 13 米、还往前凸，两栋楼就并成一栋长楼了。 */
    put(g, BOX, 17, 7.4, 12, 1, 0.9 + 3.7, -4, M.campusGlass);
    put(g, BOX, 18, 0.7, 13, 1, 8.6, -4, M.campusWhite2);
    /* 两侧深色边框：玻璃厅没有边框就是一块发亮的浅蓝，
       会把左右两栋楼在视觉上重新缝起来 */
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 1.2, 8.0, 12.4, 1 + sx * 8.8, 4.6, -4, M.corpShell);
    });

    /* --- 屋顶：设备 + 光伏 ---
       校企基地的屋顶一定有板——这栋楼是「共建」的，
       那片板就是它的说明书。倾角 23°，5 排。 */
    put(g, BOX, 12, 3.0, 9, ax - 6, ah + 2.6, az - 7, M.campusWhite2);
    put(g, BOX, 8, 2.2, 6, ax + 8, ah + 2.2, az - 8, M.campusWhite2);
    /* 板深必须小于排距。第一版板深 9.6、排距 3.6，五排互相压住，
       屋顶上就是一块整的黑板——分不出排，也就读不出「光伏」。 */
    for (i = 0; i < 5; i++) {
      tiltBox(g, aw * 0.55, 0.14, 3.2, ax + 1, ah + 2.6, az + 6 - i * 3.7,
        "x", 0.40, M.solarPanel);
    }

    /* --- 前场：一整块硬质铺地，车从这里开进来 ---
       校企基地要「对外开放」，这块地就是它的对外那一半。
       也是一整片草地里的第一块硬地，从空中看把这一角切开。 */
    put(g, BOX, 100, 0.20, 30, 2, 0.10, 48, M.campusPaving);
    /* 台基前的踏步：两级，从铺地走上台基 */
    for (i = 0; i < 2; i++) {
      put(g, BOX, 30, 0.30, 1.8, ax, 0.15 + i * 0.30, d / 2 + 2.6 - i * 1.7, M.campusStone);
    }

    /* 站名牌：挂在主楼最高一层白带与檐口之间的整面玻璃上 */
    if (o.plate) {
      var pw = o.plate.w || 15, sh = pw * (200 / 640);
      var tex = signTexture(o.plate.name, o.plate.en, o.plate.tone);
      var smat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.38,
        roughness: 0.58, metalness: 0.05, envMapIntensity: 0.3 });
      var sp = new THREE.Mesh(new THREE.PlaneGeometry(pw, sh), smat);
      sp.position.set(ax, o.plateY === undefined ? 29.2 : o.plateY, az + ad / 2 + 0.72);
      g.add(sp);
    }
  };

  /* 篮球场组：一片一片排开，靠面层颜色和白线读出来。
     校园里「一眼是学校」的东西只有三样——田径场、篮球场、旗杆。
     球场必须有围网和灯：没有围网的球场远看就是一块刷了漆的水泥地。 */
  ARCH.campusCourts = function (g, o, M, rd) {
    var cw = o.cw || 28, cd = o.cd || 15;
    var nx = o.nx || 3, nz = o.nz || 2;
    var gap = o.gap || 5, i, j;
    var TW = nx * cw + (nx - 1) * gap;
    var TD = nz * cd + (nz - 1) * gap;
    /* 整块沥青底色：球场不能直接铺在草地上，
       一片球场面层浮在草上，远看是一块贴纸。 */
    put(g, BOX, TW + 12, 0.22, TD + 12, 0, 0.11, 0, M.courtBase);

    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        var cx = -TW / 2 + cw / 2 + i * (cw + gap);
        var cz = -TD / 2 + cd / 2 + j * (cd + gap);
        /* 面层：砖红硬地。抬到 0.24，与沥青面 0.22 只差 2 公分——
           不行，会像 D07 的水渠那样在深度缓冲里打架。
           沥青顶面 0.22，这里做 0.30，靠 8 公分的高差立住。 */
        put(g, BOX, cw, 0.30, cd, cx, 0.15, cz, M.campusTrack);
        /* 边线 + 中线 */
        [-1, 1].forEach(function (sz) {
          put(g, BOX, cw, 0.04, 0.34, cx, 0.31, cz + sz * (cd / 2 - 0.35), M.paint);
          put(g, BOX, 0.34, 0.04, cd, cx + sz * (cw / 2 - 0.35), 0.31, cz, M.paint);
        });
        put(g, BOX, 0.34, 0.04, cd - 0.7, cx, 0.31, cz, M.paint);
        /* 罚球区：一条罚球线 + 两条短边。篮球场的读法全靠这三根线，
           少了它，白框里就是一块空砖红地。 */
        [-1, 1].forEach(function (sx) {
          put(g, BOX, 0.34, 0.04, 4.9, cx + sx * (cw / 2 - 5.8), 0.31, cz, M.paint);
          put(g, BOX, 5.8, 0.04, 0.34, cx + sx * (cw / 2 - 2.9), 0.31, cz + 2.45, M.paint);
          put(g, BOX, 5.8, 0.04, 0.34, cx + sx * (cw / 2 - 2.9), 0.31, cz - 2.45, M.paint);
        });
        /* 篮架：柱立在端线外 0.9 米，挑臂伸进场内。
           篮板必须立在柱子的「里面」，否则从场心看过去篮板挡在柱后面。 */
        [-1, 1].forEach(function (sx) {
          var hx = cx + sx * (cw / 2 + 0.9);
          put(g, CYL6, 0.42, 3.5, 0.42, hx, 1.75 + 0.30, cz, M.metalDark);
          put(g, BOX, 1.9, 0.26, 0.30, hx - sx * 0.95, 3.55, cz, M.metalDark);
          put(g, BOX, 0.12, 1.05, 1.80, hx - sx * 1.78, 3.28, cz, M.campusWhite);
          put(g, BOX, 0.14, 0.34, 0.62, hx - sx * 1.86, 3.12, cz, M.campusGlass);
        });
      }
    }

    /* 围网：外圈一根根立柱 + 三道横杆。
       不做网面——没有半透明材质，整面网会读成一堵实心墙。
       柱加横杆在 200 米外正好读成「围起来的球场」。 */
    var FX = TW / 2 + 5.4, FZ = TD / 2 + 5.4;
    [-1, 1].forEach(function (sz) {
      var nz2 = Math.max(2, Math.round(FX * 2 / 9.5));
      for (i = 0; i <= nz2; i++) {
        put(g, BOX, 0.16, 4.2, 0.16, -FX + FX * 2 * i / nz2, 2.1, sz * FZ, M.courtFence);
      }
      for (var ly = 1; ly <= 2; ly++) {
        put(g, BOX, FX * 2, 0.10, 0.10, 0, 0.30 + ly * 1.95, sz * FZ, M.courtFence);
      }
    });
    [-1, 1].forEach(function (sx) {
      var nx2 = Math.max(2, Math.round(FZ * 2 / 9.5));
      for (i = 0; i <= nx2; i++) {
        put(g, BOX, 0.16, 4.2, 0.16, sx * FX, 2.1, -FZ + FZ * 2 * i / nx2, M.courtFence);
      }
      for (var ly2 = 1; ly2 <= 2; ly2++) {
        put(g, BOX, 0.10, 0.10, FZ * 2, sx * FX, 0.30 + ly2 * 1.95, 0, M.courtFence);
      }
    });
    /* 灯杆只立对角两根。四角全立时，俯视里那四根 9 米的竖线
       比球场本身还抢眼，整块地读成一圈电线杆。 */
    [[-1, -1], [1, 1]].forEach(function (q) {
      var lx = q[0] * (FX + 2.4), lz = q[1] * (FZ + 2.4);
      put(g, CYL6, 0.36, 9.2, 0.36, lx, 4.6, lz, M.courtFence);
      put(g, BOX, 2.4, 0.40, 1.1, lx - q[0] * 1.0, 9.4, lz, M.campusWhite2);
    });
  };

  /* 实验馆：白盒 + 设备层。
     校园里的实验楼必须有「设备层」这个东西——屋顶上什么都没有的白盒子
     一定是一栋教学楼，不会有人相信里面在做实验。 */
  ARCH.campusLab = function (g, o, M, rd) {
    var w = o.w || 46, d = o.d || 34, h = o.h || 24, i;
    put(g, BOX, w, h, d, 0, h / 2, 0, M.campusWhite);
    /* 层间通长横带：白盒子上唯一的分层线 */
    for (i = 1; i < Math.floor(h / 4.8); i++) {
      put(g, BOX, w + 0.6, 1.5, d + 0.6, 0, i * 4.8, 0, M.campusWhite2);
    }
    put(g, BOX, w + 1.6, 0.7, d + 1.6, 0, h + 0.35, 0, M.campusTrim);
    /* 竖向鳍片：白盒子的尺度全靠这一列鳍片，
       没有它，46 米长的白墙在光下就是一张纸。 */
    var nf = Math.round(w / 3.2);
    for (i = 0; i <= nf; i++) {
      put(g, BOX, 0.5, h - 2.4, 0.7, -w / 2 + w * i / nf, (h - 2.4) / 2, d / 2 + 0.35, M.campusWhite2);
    }
    /* 立面一道深色竖缝：入口 */
    put(g, BOX, 6.4, h - 4.0, 0.4, -w * 0.24, (h - 4.0) / 2, d / 2 + 0.2, M.campusGlass);
    /* 屋顶设备层：机组 + 两组风管 + 一个楼梯间出屋面 */
    put(g, BOX, w * 0.34, 3.2, d * 0.36, -w * 0.18, h + 2.3, -d * 0.1, M.campusWhite2);
    put(g, BOX, w * 0.24, 4.4, d * 0.26, w * 0.22, h + 2.9, -d * 0.16, M.campusWhite);
    for (i = 0; i < 3; i++) {
      put(g, BOX, w * 0.5, 0.7, 1.2, w * 0.06, h + 1.2 + i * 0.9, d * 0.22 - i * 3.0, M.campusWhite2);
    }
  };

  /* 木白实验室：木色格栅塔，32 米。
     全区的建筑都是沙色抹灰，只有这一栋是暖木——
     一大片沙色里出现一处木质，比再盖一栋白楼更能标出「这里是谁的地盘」。 */
  ARCH.campusWoodTower = function (g, o, M, rd) {
    var w = o.w || 26, d = o.d || 24, h = o.h || 32, i;
    put(g, BOX, w + 3, 1.2, d + 3, 0, 0.6, 0, M.campusWhite2);
    put(g, BOX, w, h - 1.2, d, 0, 1.2 + (h - 1.2) / 2, 0, M.campusWhite);
    /* 玻璃体：格栅后面是整片深玻璃，白天从外面看进去是一层层的光带 */
    put(g, BOX, w - 3, h - 4.0, d + 0.5, 0, 1.2 + (h - 1.2) / 2, 0, M.campusGlass);
    /* 木格栅：每 1.8 米一根，从 3 米挂到顶，出挑 0.8 米。
       格栅只做四面，不做顶——顶上一做就成一只木笼子。 */
    var nf = Math.round(w / 1.8);
    for (i = 0; i <= nf; i++) {
      var x = -w / 2 + w * i / nf;
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.42, h - 3.6, 0.8, x, 1.2 + (h - 3.6) / 2 + 0.9, sz * (d / 2 + 0.4),
          i % 3 === 0 ? M.campusWoodDark : M.campusWood);
      });
    }
    var nfz = Math.round(d / 1.8);
    for (i = 0; i <= nfz; i++) {
      var z = -d / 2 + d * i / nfz;
      [-1, 1].forEach(function (sx) {
        put(g, BOX, 0.8, h - 3.6, 0.42, sx * (w / 2 + 0.4), 1.2 + (h - 3.6) / 2 + 0.9, z,
          i % 3 === 0 ? M.campusWoodDark : M.campusWood);
      });
    }
    /* 顶部一道木檐：把整束格栅收住，顶上才不会散成一排木条 */
    put(g, BOX, w + 2.6, 1.1, d + 2.6, 0, h - 0.4, 0, M.campusWoodDark);
    put(g, BOX, w + 1.4, 0.5, d + 1.4, 0, h + 0.35, 0, M.campusTrim);
    /* 屋顶一处小小的设备平台 */
    put(g, BOX, w * 0.34, 2.4, d * 0.3, w * 0.2, h + 1.6, -d * 0.16, M.campusWhite2);
  };

  /* 主轴林荫道：一条 46 米宽的硬质带 + 双排行道树 + 灯柱。
     校园的轴线不能只有水台那一段——门到院、院到馆之间全是草地，
     整条轴就断开成三个孤立的点，不再是一条「道」。 */
  ARCH.campusMall = function (g, o, M, rd) {
    var w = o.w || 90, d = o.d || 46, i;
    /* 铺地做成 0.30 米高的台：与两侧草地有明确的边，
       接上庭院时正好是一级踏步，而不是两片铺地硬拼出来的接缝。 */
    put(g, BOX, w, 0.34, d, 0, 0.17, 0, M.campusPaving);
    [-1, 1].forEach(function (sz) {
      put(g, BOX, w, 0.44, 1.3, 0, 0.22, sz * (d / 2 - 0.55), M.campusStone);
    });
    /* 中央一条深色带：轴心要有一条线，46 米宽的石板路否则读成停车场 */
    put(g, BOX, w, 0.06, 3.2, 0, 0.35, 0, M.campusTrim);
    /* 双排行道树 + 灯柱，交错布置 */
    var nb = Math.max(2, Math.round(w / 12));
    for (i = 0; i <= nb; i++) {
      var bx = -w / 2 + w * i / nb;
      [-1, 1].forEach(function (sz) {
        put(g, CYL6, 0.75, 4.8, 0.75, bx, 2.6, sz * (d / 2 - 4.2), M.trunk);
        put(g, SPH, 8.6, 6.6, 8.6, bx, 8.4, sz * (d / 2 - 4.2), M.leaf);
      });
    }
    var nl = Math.max(1, Math.round(w / 26));
    for (i = 0; i <= nl; i++) {
      var lx = -w / 2 + w * (i + 0.5) / (nl + 1);
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.3, 4.4, 0.3, lx, 2.4, sz * (d / 2 - 9.0), M.metalDark);
        put(g, BOX, 0.9, 0.32, 1.5, lx, 4.6, sz * (d / 2 - 9.0), M.campusTrim);
      });
    }
  };

  /* 中央庭院：150×110 的硬质庭院，中间一条 92×15 的静水渠。
     校园的「客厅」不在教学楼里，在这条轴上——
     所以庭院必须有围合（廊架）、有镜面（水渠）、有荫（树阵），
     三样缺一样，它就是一块空铺地。 */
  ARCH.campusCourt = function (g, o, M, rd) {
    var w = o.w || 150, d = o.d || 110, i;
    var pw = o.poolW || 92, pd = o.poolD || 15;
    /* 铺地：大面浅、内圈略白，中间一条深色带做轴心 */
    put(g, BOX, w, 0.08, d, 0, 0.04, 0, M.campusPaving);
    put(g, BOX, w - 18, 0.10, d - 18, 0, 0.08, 0, M.paving3);
    /* 水渠做成「抬高的水台」：石台 1 米高，水面 0.95 米。
       早先把水面只抬 12 公分埋在铺地里，200 米外深度缓冲分不开，
       满水都是横向条纹；抬到 1 米之后，水面与铺地差了 0.8 米，
       精度足够，而且石台可以坐人——校园里最受欢迎的就是这种石头边。 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, pw + 3.4, 1.0, 1.7, 0, 0.50, sz * (pd / 2 + 0.85), M.campusStone);
      put(g, BOX, 1.7, 1.0, pd + 3.4, sz * (pw / 2 + 0.85), 0.50, 0, M.campusStone);
    });
    var wsurf = put(g, BOX, pw, 0.90, pd, 0, 0.50, 0, M.pool);
    wsurf.castShadow = false; wsurf.receiveShadow = false;
    /* 渠两端各一个跌水口：一条通长直渠两头没有收口，读成一条地缝 */
    [-1, 1].forEach(function (sx) {
      put(g, BOX, 2.6, 1.35, pd + 3.4, sx * (pw / 2 + 1.2), 0.67, 0, M.campusStone);
    });
    /* 两侧廊架：柱 + 梁 + 细木条顶。
       庭院要的是「围合感」，不是一堵墙——廊架比墙轻，但一样能框出院子。 */
    [-1, 1].forEach(function (sz) {
      var cz = sz * (d / 2 - 5);
      for (i = 0; i <= 16; i++) {
        var cx = -w / 2 + w * i / 16;
        put(g, BOX, 0.9, 6.4, 0.9, cx, 3.2, cz, M.campusWhite2);
        put(g, BOX, 1.5, 0.4, 1.5, cx, 0.2, cz, M.campusStone);
      }
      put(g, BOX, w + 1.2, 0.62, 1.4, 0, 6.7, cz, M.campusTrim);
      /* 顶上一排细木梁：从下面走过，抬头是密密的木条，这是廊架的读法 */
      for (i = 0; i <= 26; i++) {
        put(g, BOX, 0.26, 0.22, 7.0, -w / 2 + w * i / 26, 7.1, cz, M.campusWood);
      }
    });
    /* 树阵：水渠外侧各一排，间距 13 米 */
    [-1, 1].forEach(function (sz) {
      for (i = 0; i < 7; i++) {
        var tx = -pw / 2 + pw * i / 6;
        var tz = sz * (pd / 2 + 17);
        put(g, CYL6, 0.8, 4.6, 0.8, tx, 2.3, tz, M.trunk);
        put(g, SPH, 9.0, 7.0, 9.0, tx, 8.0, tz, M.leaf);
      }
    });
    /* 灯具：沿轴线两列，是庭院里唯一的竖向重复元素 */
    for (i = -3; i <= 3; i++) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.34, 4.2, 0.34, i * 21, 2.1, sz * (pd / 2 + 6.5), M.metalDark);
        put(g, BOX, 1.1, 0.5, 1.1, i * 21, 4.4, sz * (pd / 2 + 6.5), M.campusTrim);
      });
    }
  };

  /* 田径场：400 米跑道的椭圆环 + 内场草坪 + 一侧看台。
     俯视图里，整个区只有这个形状是「椭圆」——
     它一眼就能说明这是一所学校，比任何一栋楼都直接。 */
  ARCH.campusTrack = function (g, o, M, rd) {
    var rx = o.rx || 80, rz = o.rz || 47, i, N = 64;
    /* 环：按 56 段拼椭圆，每段一根斜放的条。
       段数不能少——24 段在俯视图里读成一个多边形。 */
    for (i = 0; i < N; i++) {
      var a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      var x0 = Math.cos(a0) * rx, z0 = Math.sin(a0) * rz;
      var x1 = Math.cos(a1) * rx, z1 = Math.sin(a1) * rz;
      var len = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(z1 - z0, 2)) + 1.6;
      var ry = Math.atan2(-(z1 - z0), x1 - x0);
      put(g, BOX, len, 0.10, 9.6, (x0 + x1) / 2, 0.10, (z0 + z1) / 2, M.campusTrack, ry);
      /* 分道线：每 8 段压一道白线，跑道才不是一个砖红色的面团 */
      if (i % 8 === 0) {
        put(g, BOX, len + 0.4, 0.12, 0.55, (x0 + x1) / 2 * 1.03, 0.13, (z0 + z1) / 2 * 1.03, M.paint, ry);
        put(g, BOX, len + 0.4, 0.12, 0.55, (x0 + x1) / 2 * 0.94, 0.13, (z0 + z1) / 2 * 0.94, M.paint, ry);
      }
    }
    /* 内场：椭圆要用横条填，不能用一块矩形——一块矩形铺在椭圆跑道上，
       四角会顶出跑道，整个场地立刻读成一个方院子。
       横条按椭圆方程逐条算宽度，边缘的阶梯被 8.4 米宽的跑道环压住。 */
    var inA = rx - 10, inB = rz - 10;
    for (var bx = -inA + 2; bx <= inA - 2; bx += 4) {
      var kk = 1 - Math.pow(bx / inA, 2);
      if (kk <= 0) continue;
      var hz = inB * Math.sqrt(kk);
      put(g, BOX, 4.3, 0.14, hz * 2, bx, 0.11, 0, M.grass);
    }
    /* 足球场内场：一块居中的人工草皮 + 中线 + 中圈 */
    put(g, BOX, 96, 0.10, 60, 0, 0.17, 0, M.campusTurf);
    put(g, BOX, 0.5, 0.05, 60, 0, 0.22, 0, M.paint);
    /* 中圈不做：CYL6 是六边形柱，压到 0.35 米高就是一个白方块 */

    /* 看台：西侧长边，7 级台阶 + 后墙 + 一道挑檐。
       每一级都是一个通高的实心块，这样侧面看才是真的台阶，
       而不是一块 4 米高的实心方块压在地上。 */
    var wX = -rx - 11, nStep = 7, stD = 2.6, stH = 1.05;
    for (i = 0; i < nStep; i++) {
      put(g, BOX, stD, stH * (i + 1), 74, wX - i * stD, stH * (i + 1) / 2, 0,
        i % 2 === 0 ? M.campusWhite2 : M.campusStone);
    }
    /* 后墙 + 顶棚：看台没有顶，就是一部露天楼梯 */
    var bX = wX - nStep * stD;
    put(g, BOX, 2.4, 9.6, 76, bX - 1.2, 4.8, 0, M.campusSand);
    put(g, BOX, 20, 0.6, 78, bX + 5.0, 10.1, 0, M.campusTrim);
    put(g, BOX, 0.5, 0.4, 78, bX + 14.6, 9.9, 0, M.campusTrim);
    /* 跑道外侧的绿化带：操场不做围网，做一圈树 */
    for (i = 0; i < 26; i++) {
      var ta = i / 26 * Math.PI * 2;
      var tx = Math.cos(ta) * (rx + 13), tz = Math.sin(ta) * (rz + 13);
      put(g, CYL6, 0.7, 4.0, 0.7, tx, 2.0, tz, M.trunk);
      put(g, SPH, 7.6, 5.6, 7.6, tx, 6.6, tz, M.leaf);
    }
  };

  /* ------------------------------------------------------------
     D08 递归科学园区：一套「自相似」的建筑语言
     前七区各有一套语法——D01 塔林、D02 窄巷、D03 厂房、D04 环湖、
     D05 中轴对称、D06 站台剖面、D07 校园轴线。
     这一区既不靠一片肌理，也不靠一条轴，而是靠「同一个形状重复三次」：
     入口是三重递减的门，街区全是三级退台，主楼是六段张开的漏斗。
     全区只有一栋体量上大下小——它就是这个区的原点。
     ------------------------------------------------------------ */

  /* H5 递归坍塌博物馆：倒锥漏斗。
     正着放的锥是塔，倒过来才是漏斗；也只有倒过来，
     才读得出「数据从宽口倒进去、在窄口漏掉」，对得上「逐代坍塌」。
     五段等分张角，段间压一道 0.9 米的暗缝：
     缝是这块斜面上唯一的水平线。没有它，72 米高的连续斜面在正午
     就是一整块均匀的灰，看不出「上一层比下一层宽」。
     每段都是独立的锥台几何——把同一个盒子一层层放大只能得到
     一座 ziggurat（上小下大），方向正好反了。
     锥台必须 openEnded：封口的锥台，上一段的顶盖和下段的底盖
     贴在同一高度上，六道横缝会变成六条锯齿。 */
  ARCH.collapseFunnel = function (g, o, M, rd) {
    var wTop = o.w || 88, h = o.h || 72, i;
    var wBase = o.wb || wTop * 0.39;
    var tiers = o.tiers || 5;
    /* 段缝必须真的「凹进去」。
       头一版缝高 0.9 米、每侧只内收 0.25 米，在 600 米的机位上连一条线都不算——
       五段读成一整片灰色平板，戴上「倒锥」的轮廓也只是一座金字塔。
       现在缝高 2.2 米、每侧内收 2.6 米：五道横缝是五个真凹槽，
       侧面被切成五级，形体才出现「一段一段塌下去」的意思。 */
    var gap = 1.8, gapInset = 1.2;
    var segH = (h - gap * (tiers - 1)) / tiers;
    var y = 0;

    /* 台基三级，外台 56 见方。漏斗不能直接坐在铺地上——
       没有台基，它就是一顶扣在地上的帽子，看不出是一座馆。
       台基不能比漏斗底大太多：外台做到 64 时，底口 34 米那一段
       整个被台基挡住，读出来的底部宽度是 64，漏斗的收束就没了。 */
    var baseY0 = 0;
    [[wBase + 22], [wBase + 12], [wBase + 4]].forEach(function (b, bi) {
      put(g, BOX, b[0], 0.9, b[0], 0, baseY0 + 0.45, 0, M.funnelShell2);
      /* 每级台基只在外沿压一条 25 厘米的亮边，不整面刷浅色——
         三级台基整面刷浅，从高处看是一块白托盘，漏斗像摆在托盘上。 */
      put(g, BOX, b[0] + 0.6, 0.26, b[0] + 0.6, 0, baseY0 + 0.88, 0, M.funnelTrim);
      baseY0 += 0.9;
    });
    y = baseY0;

    for (i = 0; i < tiers; i++) {
      var w0 = wBase + (wTop - wBase) * i / tiers;
      var w1 = wBase + (wTop - wBase) * (i + 1) / tiers;
      /* 半径 = 边长 / √2：四边圆柱的角点落在坐标轴上，
         转 45° 之后才是「边平行于轴线」的正方口。 */
      var R0 = w0 * 0.7071, R1 = w1 * 0.7071;
      var geo = new THREE.CylinderGeometry(R1, R0, 1, 4, 1, true);
      var m = new THREE.Mesh(geo, M.funnelShell);
      m.scale.set(1, segH, 1);
      m.position.set(0, YBASE + y + segH / 2, 0);
      m.rotation.y = Math.PI / 4;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      y += segH;
      if (i < tiers - 1) {
        put(g, BOX, w1 - gapInset * 2, gap, w1 - gapInset * 2, 0, y + gap / 2, 0, M.funnelDeep);
        y += gap;
      }
    }

    /* 口沿：向内铺一圈 3.2 米的檐。88 米的方口只切一刀，
       从斜上方看就是一个洞，量不出「这是一件 72 米高的东西」。
       檐面不能是浅色：一圈白边套在紫灰锥体上，整个顶读成一具托盘。
       浅色只留给最外那道 0.45 米的压边。 */
    var lipT = 3.2, lipY = y;
    [-1, 1].forEach(function (s) {
      put(g, BOX, wTop, 0.85, lipT, 0, lipY + 0.42, s * (wTop / 2 - lipT / 2), M.funnelShell2);
      put(g, BOX, lipT, 0.85, wTop - lipT * 2, s * (wTop / 2 - lipT / 2), lipY + 0.42, 0, M.funnelShell2);
      put(g, BOX, wTop + 0.5, 0.30, 0.45, 0, lipY + 0.94, s * wTop / 2, M.funnelTrim);
      put(g, BOX, 0.45, 0.30, wTop - 0.9, s * wTop / 2, lipY + 0.94, 0, M.funnelTrim);
    });
    /* 口内：一个开口的锥台（openEnded），从上口 81.6 收到 28.6 见方、深 17 米。
       必须是开口的——封了顶，俯视看到的就是一块方板，漏斗变游泳池。
       DoubleSide 是因为从上方看到的是这个锥台的内表面。 */
    var mouth = wTop - lipT * 2;
    var innerGeo = new THREE.CylinderGeometry(mouth * 0.35 * 0.7071, mouth * 0.5 * 0.7071, 1, 4, 1, true);
    var im = new THREE.Mesh(innerGeo, M.funnelInner);
    im.scale.set(1, 17, 1);
    im.position.set(0, YBASE + lipY - 8.5, 0);
    im.rotation.y = Math.PI / 4;
    im.receiveShadow = true;
    g.add(im);

    /* 世代谱系观测舱：吊在口正中，7 米。
       没有它，口内只是一片暗，82 米的口到底多大是不知道的。 */
    var cabY = lipY - 10.5;
    put(g, CYL, 6.8, 2.6, 6.8, 0, cabY + 4.2, 0, M.funnelTrim);
    put(g, SPH, 8.6, 7.2, 8.6, 0, cabY, 0, M.funnelShell2);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      strut(g, q[0] * mouth * 0.42, lipY - 0.4, q[1] * mouth * 0.42, 0, cabY + 5.4, 0, 0.22, M.metalDark);
    });

    /* 入口：底部只有 34 米见方，门斗必须凸出来。
       直接在锥面上开洞，门就成了一道斜裂口。 */
    var doorW = 15, doorH = 8.6;
    put(g, BOX, 4.2, doorH, doorW, wBase / 2 + 1.6, baseY0 + doorH / 2, 0, M.funnelGlass);
    put(g, BOX, 7.0, 0.62, doorW + 5.4, wBase / 2 + 2.6, baseY0 + doorH + 0.31, 0, M.funnelShell2);
    /* 门洞两侧的实墙垛：20 米宽的通高玻璃直接贴在锥面上，
       读起来是一块挂上去的黑板；两片 3 米石垛把它咬进楼体。 */
    [-1, 1].forEach(function (s2) {
      put(g, BOX, 5.0, doorH + 1.6, 3.6, wBase / 2 + 1.2, baseY0 + (doorH + 1.6) / 2, s2 * (doorW / 2 + 1.8),
        M.funnelShell);
    });
    /* 雨棚下的灯带：白天是紫线，夜里就是整座馆的唯一光源 */
    put(g, BOX, 0.24, 0.30, doorW + 2.4, wBase / 2 + 4.6, baseY0 + doorH - 0.2, 0, M.accent);
    /* 门外三级台阶，从台基顶落到地面。起点必须贴住台基外沿（wBase/2 + 11），
       不能凭空往外挪——台阶和台基之间留一条草带，整座馆就浮在草地上了。 */
    for (i = 0; i < 3; i++) {
      put(g, BOX, 3.0, 0.9, doorW + 7, wBase / 2 + 11.5, baseY0 - 0.45 - i * 0.9, 0, M.funnelShell);
    }
    /* 门前两尊石墩：13 米的门斗如果没有参照物，尺度读不出来 */
    [-1, 1].forEach(function (s) {
      put(g, BOX, 1.8, 2.6, 1.8, wBase / 2 + 4.6, baseY0 + 1.3, s * 9.6, M.funnelShell2);
      put(g, BOX, 2.3, 0.35, 2.3, wBase / 2 + 4.6, baseY0 + 2.8, s * 9.6, M.funnelTrim);
    });
  };

  /* 递归门：一套三件，64 / 54 / 44 米宽，30 / 25 / 20 米高。
     三道门沿同一条轴排开，站在头一道门里，第二道门就在门洞里，
     第三道在第二道的门洞里——「框中框」比任何立面装饰都直白。
     头一版把柱做成 3.6 米见方：90 米宽、26 米高的框里两根细杆，
     在 600 米的机位上读成高速公路的收费门架，一点「门」的意思都没有。
     柱必须粗到能压住梁（7.4 米），梁必须比柱还厚（9 米），
     柱身再分三级收分——收分本身就把「递归」写在了构件上。 */
  ARCH.recursionGate = function (g, o, M, rd) {
    var w = o.w || 64, h = o.h || 30;
    var pw = o.pw || 7.4, d = o.d || 9;
    var ph = h * 0.74, beamH = h - ph;
    var prof = [[1.14, 0.42], [1.00, 0.33], [0.88, 0.25]];
    [-1, 1].forEach(function (sx) {
      var cx = sx * (w / 2 - pw / 2);
      /* 柱础压两级：门是立在地上的，不是插进地里的 */
      put(g, BOX, pw * 1.34, 1.3, d + 3.4, cx, 0.65, 0, M.funnelShell2);
      put(g, BOX, pw * 1.34 + 1.2, 0.42, d + 4.0, cx, 1.51, 0, M.funnelTrim);
      var y0 = 1.7;
      prof.forEach(function (p) {
        var bw = pw * p[0], bh = (ph - 1.7) * p[1];
        put(g, BOX, bw, bh, d, cx, y0 + bh / 2, 0, M.funnelShell);
        /* 每级压一道出挑的檐：三级一收，门的「递归」才看得出来 */
        put(g, BOX, bw + 0.9, 0.5, d + 0.7, cx, y0 + bh + 0.25, 0, M.funnelTrim);
        y0 += bh + 0.5;
      });
      /* 柱内侧一条发光竖槽：门框的内缘比外缘亮一档，
         从里、从外都读得出这是「两根柱」，而不是一堵墙。 */
      put(g, BOX, 0.30, ph - 3.4, 0.55, sx * (w / 2 - pw - 0.02), ph * 0.5, 0, M.accent);
    });
    /* 梁：进深比柱还厚，压住整道门 */
    put(g, BOX, w, beamH, d + 1.6, 0, ph + beamH / 2, 0, M.funnelShell);
    put(g, BOX, w + 1.6, 0.55, d + 2.6, 0, h + 0.27, 0, M.funnelTrim);
    /* 梁底一道深槽：不压深色，梁在天空下只是一条浅灰横带，没有厚度 */
    put(g, BOX, w - pw * 2.2, 0.8, d + 0.4, 0, ph - 0.4, 0, M.funnelShell2);
    /* 梁柱交接的三级叠涩：把「梁砸在柱上」这件事做出来，
       否则长梁横在天上，看不出它在承重 */
    [0, 1, 2].forEach(function (i) {
      var cw = 11 - i * 3.6;
      put(g, BOX, cw, 1.0, d * 0.82, -w / 2 + pw * 0.52 + i * 1.3, ph - 1.35 - i * 1.0, 0, M.funnelShell2);
      put(g, BOX, cw, 1.0, d * 0.82, w / 2 - pw * 0.52 - i * 1.3, ph - 1.35 - i * 1.0, 0, M.funnelShell2);
    });
  };

  /* AI 大厂总部：内圈缺的就是这一档。
     漏斗 72 米、常规园区楼 16~29 米，中间整整断了四十几米——
     整片内圈只有一座塔和一个盒，没有第二档高度，所以「空」。
     这一档给到 46~56 米：明显高过周边、又明显低于漏斗，
     从主轴上往里走，高度是 楼 → 总部 → 漏斗 三级递进。
     四座用四种形制（单塔 / 双塔连桥 / 三级退台 / 角柱环塔），
     否则四个盒子并排，只是把「空」换成了「兵营」。

     o.w / o.d 是「地块」尺寸（含前院），楼体取地块的 0.76 / 0.78，
     这样引擎按 w/2+4 画占位圈时正好把整块院子圈进去，
     周边填充楼不会长到别人家的广场上。 */
  ARCH.aiCampus = function (g, o, M, rd) {
    var lotW = o.w || 50, lotD = o.d || 44;
    var w = lotW * 0.82, d = lotD * 0.84;
    var h = o.h || 48, v = o.variant || 0;
    var podH = 10.5, towerH = h - podH, i;

    /* 前院：比楼宽出去的铺地 + 一圈压边。
       企业总部必须有自己的一块院子；直接坐在草坪上，
       它就是园区里又一栋楼，补不上「次级体量」这件事。 */
    put(g, BOX, lotW, 0.40, lotD, 0, 0.20, 0, M.paving);
    put(g, BOX, w + 9, 0.14, d + 8, 0, 0.46, 0, M.paving3);

    /* 裙房：10.5 米基座，底层通高玻璃，檐口压深色。
       塔直接落到地上，读出来是一块竖着的板；先有裙房才有「总部」。 */
    /* 裙房不能刷 M.concrete：那是全城通用的白灰，一座 41 米的紫灰塔
       坐在一块白托盘上，俯视图里只剩「黑砖放在白盘上」。
       换成这一区自己的紫灰，塔和基座才是一体的。 */
    put(g, BOX, w, podH, d, 0, podH / 2, 0, M.funnelShell);
    put(g, BOX, w * 0.90, podH - 3.6, d + 0.4, 0, (podH - 3.6) / 2 + 0.5, 0, M.shopfront);
    put(g, BOX, w + 1.4, 0.60, d + 1.4, 0, podH + 0.30, 0, M.metalDark);
    /* 入口雨棚：一片挑出 5 米的板，把「门在哪」交代掉 */
    put(g, BOX, w * 0.34, 0.34, 5.6, 0, podH * 0.74, d / 2 + 2.8, M.metalDark);

    if (v === 1) {
      /* 双塔 + 空中连桥 */
      var tw1 = w * 0.38, td1 = d * 0.62;
      [0, 1].forEach(function (k) {
        var th = towerH * (k ? 0.84 : 1.0), cx = (k ? 1 : -1) * w * 0.29;
        put(g, BOX, tw1, th, td1, cx, podH + th / 2, 0, o.mat);
        put(g, BOX, tw1 + 1.0, 0.70, td1 + 1.0, cx, podH + th + 0.35, 0, M.metalDark);
      });
      put(g, BOX, w * 0.30, 4.6, td1 * 0.46, 0, podH + towerH * 0.56, 0, M.metal);
      put(g, BOX, w * 0.30, 0.45, td1 * 0.46 + 0.9, 0, podH + towerH * 0.56 - 2.3, 0, M.metalDark);
    } else if (v === 2) {
      /* 三级退台：把这一区的「递归」写进剖面 */
      var yy = podH;
      [[0.88, 0.40], [0.66, 0.32], [0.46, 0.28]].forEach(function (t) {
        var bw = w * t[0], bh = towerH * t[1];
        put(g, BOX, bw, bh, d * t[0], 0, yy + bh / 2, 0, o.mat);
        put(g, BOX, bw + 1.1, 0.55, d * t[0] + 1.1, 0, yy + bh + 0.28, 0, M.metalDark);
        yy += bh + 0.55;
      });
      put(g, BOX, w * 0.26, 3.0, d * 0.26, 0, yy + 1.5, 0, M.metal);
    } else if (v === 3) {
      /* 角柱环塔：四根角柱把顶冠架空，中间是玻璃芯 */
      var cw = w * 0.18;
      var coreW = w * 0.56, coreD = d * 0.56;
      put(g, BOX, coreW, towerH * 0.92, coreD, 0, podH + towerH * 0.46, 0, o.mat);
      put(g, BOX, coreW + 1.2, 0.6, coreD + 1.2, 0, podH + towerH * 0.92 + 0.3, 0, M.metalDark);
      /* 四根角柱必须站到玻璃芯外面去：柱心 0.42w、柱半宽 0.09w，
         内边 0.33w 仍在 0.28w 的芯体外面，柱才是柱。
         早先柱心 0.36w、芯体 0.31w，四根柱子整个被玻璃吞掉，
         顶冠看起来就是一块浮在半空的板。 */
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
        put(g, BOX, cw, towerH * 1.02, cw, q[0] * (w * 0.42), podH + towerH * 0.51, q[1] * (d * 0.42), M.concrete);
        put(g, BOX, cw * 1.5, 0.55, cw * 1.5, q[0] * (w * 0.42), podH + towerH * 0.42, q[1] * (d * 0.42), M.metalDark);
      });
      /* 顶冠不能跟楼同宽：一张 0.98 倍宽、3.6 米厚的板压上去，
         整座塔读成一张四条腿的方桌。收到 0.86 倍、2.4 米厚，
         冠比塔身小一圈，才有「被托起来」的意思。 */
      put(g, BOX, w * 0.90, 1.8, d * 0.90, 0, podH + towerH * 1.05, 0, M.metal);
      put(g, BOX, w * 0.86, 0.45, d * 0.86, 0, podH + towerH * 1.05 + 1.42, 0, M.metalDark);
    } else {
      /* 单塔：竖向遮阳肋把整面玻璃切成一条条，远看才有「幕墙」的密度 */
      var sw = w * 0.74, sd = d * 0.72;
      put(g, BOX, sw, towerH, sd, 0, podH + towerH / 2, 0, o.mat);
      var ribs = Math.max(3, Math.round(sw / 4.6));
      for (i = 0; i <= ribs; i++) {
        var rx = -sw / 2 + sw * i / ribs;
        put(g, BOX, 0.65, towerH, 0.9, rx, podH + towerH / 2, sd / 2 + 0.30, M.metal);
        put(g, BOX, 0.65, towerH, 0.9, rx, podH + towerH / 2, -sd / 2 - 0.30, M.metal);
      }
      for (var f2 = 1; f2 < Math.floor(towerH / 9); f2++) {
        put(g, BOX, sw + 1.0, 0.40, sd + 1.0, 0, podH + f2 * 9, 0, M.metalDark);
      }
      put(g, BOX, sw * 0.78, 4.0, sd * 0.68, 0, podH + towerH + 2.0, 0, M.metal);
      put(g, BOX, 1.0, 6.5, 1.0, sw * 0.26, podH + towerH + 7.0, 0, M.metalDark);
    }

    /* 厂牌：挂在裙房正面的横匾，不是塔顶的小旗。
       楼顶挂牌在 600 米外只剩一块十几像素的黑点，
       横匾贴在 10.5 米的裙房上，近景读得出字、远景读得出「这块楼有主」。 */
    if (o.brand) {
      var bw2 = w * 0.54, bh2 = bw2 * (200 / 640);
      var bt = signTexture(o.brand.name, o.brand.en, o.brand.tone);
      var bmat = new THREE.MeshStandardMaterial({
        map: bt, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.40,
        roughness: 0.55, metalness: 0.05, envMapIntensity: 0.3 });
      var bp = new THREE.Mesh(new THREE.PlaneGeometry(bw2, bh2), bmat);
      bp.position.set(0, podH * 0.66, d / 2 + 0.66);
      g.add(bp);
    }

    /* 三根旗杆：一座 50 米的塔，前面没有一根竖着的东西做参照，
       它到底有多高是读不出来的。 */
    [-1, 0, 1].forEach(function (k) {
      put(g, CYL, 0.22, 10.5, 0.22, k * 3.2, 5.2, d / 2 + 8.0, M.metal);
      put(g, BOX, 1.4, 0.85, 0.12, k * 3.2 + 0.75, 9.6, d / 2 + 8.0, M.accent);
    });
  };

  /* 谱系温室：H5 的副馆「坍塌预报台 · 三个温室」。
     三座并排，筒拱玻璃顶 + 混凝土端墙 + 外露拱肋。
     园区里其余的楼全是方的，这三座是圆的——
     一眼分得出「这是实验设施，不是办公楼」。 */
  ARCH.lineageGreenhouse = function (g, o, M, rd) {
    var w = o.w || 46, d = o.d || 20, h = o.h || 11, i;
    var wallH = h * 0.42, arcH = h - wallH;
    /* 台基：温室比地面高半米，前场铺一条石带当入口 */
    put(g, BOX, w + 4.2, 0.55, d + 4.2, 0, 0.28, 0, M.funnelTrim);
    /* 两侧长墙 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, w, wallH, 0.7, 0, 0.55 + wallH / 2, sz * (d / 2 - 0.35), M.funnelShell);
    });
    /* 拱顶：VAULT 的拱是「跨局部 x、沿局部 z 拉伸」的，
       而温室的拱必须跨短边（d）、沿长边（w）拉伸——
       直接按 (w, arcH, d) 缩放，46 米跨 6.4 米高的弧几乎是一条直线，
       三座温室就从拱棚变成三个平顶盒子。转 90° 之后才是半圆。 */
    put(g, VAULT, d, arcH, w, 0, 0.55 + wallH, 0, M.glassHouse, Math.PI / 2);
    /* 外露拱肋：同一壳放大一圈、沿长边压成 1.4 米，一片片扣上去。
       没有肋，玻璃拱顶在光下是一整片均匀的浅蓝，读成塑料棚。 */
    var ribs = Math.max(2, Math.round(w / 8));
    for (i = 0; i <= ribs; i++) {
      put(g, VAULT, d + 1.6, arcH + 0.55, 1.4, -w / 2 + w * i / ribs, 0.55 + wallH - 0.04, 0,
        M.funnelShell2, Math.PI / 2);
    }
    /* 端墙：矩形 + 拱形两段，同色，才读成「一堵墙」而不是两块板 */
    [-1, 1].forEach(function (sz) {
      var ez = sz * (w / 2 - 0.36);
      put(g, BOX, 0.72, wallH, d, ez, 0.55 + wallH / 2, 0, M.funnelShell2);
      put(g, VAULT, d, arcH, 0.72, ez, 0.55 + wallH, 0, M.funnelShell2, Math.PI / 2);
      /* 门洞：只在朝向主轴那一面开 */
      if (sz > 0) {
        put(g, BOX, 0.9, arcH * 0.92, 5.6, ez + 0.06, 0.55 + arcH * 0.46, 0, M.funnelDeep);
        put(g, BOX, 2.2, 0.5, 7.0, ez + 0.9, 0.55 + arcH * 0.92, 0, M.funnelTrim);
      }
    });
    /* 内部苗床：四条梯台。拱顶是玻璃的，斜上方能看到里面的台面 */
    for (i = 0; i < 4; i++) {
      var bz = -d / 2 + 3.4 + i * (d - 6.8) / 3;
      put(g, BOX, w - 9, 0.80, 2.3, 0, 0.55 + 0.40, bz, M.funnelShell2);
      put(g, BOX, w - 10, 0.34, 1.8, 0, 0.55 + 0.97, bz, M.campusTurf);
      /* 苗床分成四格：一整条绿带在俯视里是一条跑道，中间断开才读成「台」 */
      for (var bk = 1; bk < 4; bk++) {
        put(g, BOX, 0.5, 0.40, 2.3, -w / 2 + 4.5 + (w - 9) * bk / 4, 0.55 + 0.40, bz, M.funnelTrim);
      }
    }
  };

  /* 谱系柱列：16 根，柱高从 9.4 一路掉到 5.8。
     这就是实验里那 16 条平行谱系的「枯萎世代」。
     柱子不等高，它才能当刻度读；一样高就只是一排栏杆。 */
  ARCH.lineageColonnade = function (g, o, M, rd) {
    var w = o.w || 84, h = o.h || 9.4, n = o.n || 16, i;
    var gap = w / (n - 1);
    for (i = 0; i < n; i++) {
      var x = -w / 2 + i * gap;
      var ch = h * (0.62 + 0.38 * Math.pow(1 - i / (n - 1), 0.55));
      put(g, BOX, 2.4, 0.3, 2.4, x, 0.15, 0, M.funnelShell2);
      put(g, BOX, 1.4, ch, 1.4, x, 0.30 + ch / 2, 0, M.funnelShell);
      put(g, BOX, 2.0, 0.34, 2.0, x, 0.30 + ch + 0.17, 0, M.funnelTrim);
    }
  };

  /* 漏斗前庭：斜轴上的方形广场。
     不能用 plazas——那是轴对齐的矩形，主轴斜 51°，摆上去会跟铺装错开。
     广场自己带铺装纹理：110 米见方的平地上，一块纯色就是一块灰地毯。 */
  ARCH.funnelCourt = function (g, o, M, rd) {
    var w = o.w || 110, d = o.d || 100, i;
    var tex = pavingTexture(0x9a9a96, 4);
    tex.repeat.set(Math.max(2, w / 6), Math.max(2, d / 6));
    var pmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95,
      metalness: 0.02, envMapIntensity: 0.33 });
    put(g, BOX, w, 1.4, d, 0, -0.2, 0, pmat);
    /* 分格石带：十字把它切成四进，一整块地坪才有「进深」 */
    put(g, BOX, w, 0.07, 2.4, 0, 0.52, 0, M.paving3);
    put(g, BOX, 2.4, 0.07, d, 0, 0.52, 0, M.paving3);
    /* 正对漏斗门前的一条静水渠：水在这里只做一件事——把 66 米的漏斗
       再倒一遍。渠做窄（12 米），做宽就成了广场上的游泳池。 */
    [-1, 1].forEach(function (sz) {
      put(g, BOX, 50, 0.62, 1.5, -16, 0.31, sz * 6.8, M.kerb);
    });
    put(g, BOX, 47, 0.34, 12, -16, 0.29, 0, M.pool);
    /* 树阵：四角各一棵，沿主轴两列各三棵 */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      var cx = q[0] * (w / 2 - 11), cz = q[1] * (d / 2 - 11);
      put(g, CYL6, 0.8, 5.0, 0.8, cx, 3.0, cz, M.trunk);
      put(g, SPH, 7.6, 5.8, 7.6, cx, 7.8, cz, M.leaf);
    });
    [24, 44].forEach(function (cz) {
      [-1, 1].forEach(function (sz) {
        for (i = -1; i <= 1; i++) {
          put(g, CYL6, 0.65, 4.4, 0.65, i * 20 + 22, 2.7, sz * cz, M.trunk);
          put(g, SPH, 6.4, 5.0, 6.4, i * 20 + 22, 7.0, sz * cz, M.leaf);
        }
      });
    });
    /* 灯柱：四根，比行道灯高一档 */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      var lx = q[0] * (w / 2 - 16), lz = q[1] * (d / 2 - 24);
      put(g, BOX, 0.38, 9.0, 0.38, lx, 5.0, lz, M.metalDark);
      put(g, BOX, 1.9, 0.3, 0.7, lx, 9.1, lz, M.metalDark);
      put(g, BOX, 1.5, 0.12, 0.5, lx, 8.96, lz, M.beacon);
    });
  };

  /* 街区的普通楼：一律三级退台。
     这一区的楼必须和主楼形成「一收一放」——
     它们全都是向内收的，只有中心那栋向外张。
     退 22% 一级（0.78 / 0.58），比 ziggurat 退得狠：
     退得轻，60 米外就看不出是三级，只剩一栋方楼。 */
  ARCH.recursionTier = function (g, o, M, rd) {
    var w = o.w, d = o.d, h = Math.max(10, o.h);
    var t1 = h * 0.52, t2 = h * 0.30, t3 = h - t1 - t2;
    put(g, BOX, w, 0.6, d, 0, 0.3, 0, M.funnelShell2);
    var y = 0.6;
    put(g, BOX, w, t1, d, 0, y + t1 / 2, 0, o.mat);
    put(g, BOX, w + 0.9, 0.7, d + 0.9, 0, y + t1, 0, M.funnelTrim);
    y += t1;
    put(g, BOX, w * 0.78, t2, d * 0.78, 0, y + t2 / 2, 0, o.mat);
    put(g, BOX, w * 0.78 + 0.8, 0.6, d * 0.78 + 0.8, 0, y + t2, 0, M.funnelTrim);
    y += t2;
    put(g, BOX, w * 0.58, t3, d * 0.58, 0, y + t3 / 2, 0, o.mat);
    put(g, BOX, w * 0.58 + 0.7, 0.5, d * 0.58 + 0.7, 0, y + t3, 0, M.funnelTrim);
    roofClutter(g, w * 0.58, d * 0.58, h, rd, M);
  };

  /* ------------------------------------------------------------
     绿谷新生活区（D09）
     全城第一个纯生活片区，没有博物馆、没有产业园。
     这里的建筑不能靠"体量"取胜——它们要做的事只有一件：
     把坡地和水岸的事讲清楚。所以五个原型全部围绕「跌、浮、台、跨」。
     ------------------------------------------------------------ */

  /* 坡地联排：这一区的住宅主力。
     不是「一栋房子摆在坡上」，是一串盒子沿坡**跌下去**——每户比邻居低一档，
     落差由一道石挡土墙消化。如果做成等高的排屋，坡就白做了：
     房子会把地形抹平，从远处看还是平地上一排盒子。 */
  ARCH.hillVilla = function (g, o, M, rd) {
    var n = Math.max(2, Math.min(5, Math.round(o.w / 10)));
    var cw = o.w / n;
    var step = o.step || o.h * 0.17;
    var i, x, y0, hi;
    for (i = 0; i < n; i++) {
      hi = o.h * (1 - i * 0.11);
      x = -o.w / 2 + cw * (i + 0.5);
      y0 = -i * step;
      /* 台基：从本户地坪一直落到下一户的地坪，就是那道挡土墙。
         没有它，跌落的体量之间会是一条悬空的缝。 */
      put(g, BOX, cw + 0.1, step + 0.4, o.d, x, y0 - step / 2 + 0.2, 0, M.hillStone);
      put(g, BOX, cw * 0.9, hi, o.d, x, y0 + hi / 2, 0, o.mat);
      /* 檐口：一片 0.55 米的白边，是这批住宅唯一的"装饰"。
         坡屋顶会让整片坡变成瓦的海洋，平檐口 + 屋顶花园才是绿谷的做法。 */
      put(g, BOX, cw * 0.94, 0.55, o.d + 0.7, x, y0 + hi, 0, M.civicTrim);
      /* 屋顶花园：土 + 灌木。greenRoof 只换屋面板的颜色，
         真正让俯视图变成绿的，是这一层真的有土和植物。 */
      put(g, BOX, cw * 0.76, 0.32, o.d * 0.74, x, y0 + hi + 0.62, 0, M.gardenSoil);
      var nb = 2 + Math.floor(rd() * 3);
      for (var b = 0; b < nb; b++) {
        var bw = 1.6 + rd() * 2.2;
        put(g, SPH, bw, bw * 0.78, bw,
          x + (rd() - 0.5) * cw * 0.6, y0 + hi + 0.86, (rd() - 0.5) * o.d * 0.6, M.leaf);
      }
      /* 每户一道悬挑阳台：朝向坡下（+x），木格栅遮阳 */
      put(g, BOX, cw * 0.56, 0.24, 2.6, x + cw * 0.16, y0 + hi * 0.62, o.d / 2 + 1.3, M.timber);
      put(g, BOX, cw * 0.56, 1.0, 0.18, x + cw * 0.16, y0 + hi * 0.62 + 0.62, o.d / 2 + 2.55, M.timberDark);
    }
    /* 立面开窗：坡地住宅如果不开窗就是五个白盒子。
       横向带窗压在每户的中段，间距按楼层走。 */
    for (i = 0; i < n; i++) {
      hi = o.h * (1 - i * 0.11); y0 = -i * step; x = -o.w / 2 + cw * (i + 0.5);
      var fl = Math.max(2, Math.round(hi / 3.2));
      for (var f = 1; f < fl; f++) {
        put(g, BOX, cw * 0.66, 1.35, 0.16, x, y0 + hi * f / fl, -o.d / 2 - 0.02, M.winCore);
      }
    }
  };

  /* 听澜：语音 · 声学模型。
     原城市场景里它是 68 米、波浪隔声顶板的塔。但这一区的 maxH 是 56，
     再竖一根 68 米就是第二个地标，和"低密度生活区"互相打脸。
     压到 52：比山脊高 12 米，是水边唯一一根竖线，压不倒整区却镇得住湾。 */
  ARCH.waveHall = function (g, o, M, rd) {
    var w = o.w || 96, d = o.d || 44, h = o.h || 52;
    var baseH = h * 0.46, podH = 2.2;
    var i;
    put(g, BOX, w + 7, podH, d + 7, 0, podH / 2, 0, M.hillStone);
    /* 主墙必须是实墙。用带窗格的立面材质铺 92 米长的墙，
       整座楼会读成一座写字楼——声学楼的外壳本来就是混凝土，窗是打出来的洞。 */
    put(g, BOX, w, baseH, d, 0, podH + baseH / 2, 0, o.mat || M.civicTrim);
    put(g, BOX, w + 1.2, 1.0, d + 1.2, 0, podH + baseH + 0.5, 0, M.civicTrim);
    /* 竖向遮阳肋：一排肋把"长"写在立面上，也把 92 米的墙切成 22 段，
       不给它切碎，远看就是一块白板。 */
    var ribs = Math.max(8, Math.round(w / 4.4));
    for (i = 0; i <= ribs; i++) {
      var rx = -w / 2 + w * i / ribs;
      put(g, BOX, 1.0, baseH - 2.4, 1.8, rx, podH + (baseH - 2.4) / 2 + 1.2, d / 2 + 0.6, M.hillStone);
      put(g, BOX, 1.0, baseH - 2.4, 1.8, rx, podH + (baseH - 2.4) / 2 + 1.2, -d / 2 - 0.6, M.hillStone);
    }
    /* 窗：只在肋之间的下部开横窗。通高玻璃幕墙会让这栋楼失去"厚墙"的分量。 */
    for (i = 0; i < ribs; i++) {
      var wx2 = -w / 2 + w * (i + 0.5) / ribs;
      put(g, BOX, w / ribs * 0.62, 4.2, 0.3, wx2, podH + baseH * 0.52, d / 2 + 0.02, M.winCore);
      put(g, BOX, w / ribs * 0.62, 4.2, 0.3, wx2, podH + baseH * 0.52, -d / 2 - 0.02, M.winCore);
    }
    /* 水面一侧的通高门厅：入口必须朝水，它服务的是一船一船来的人 */
    put(g, BOX, w * 0.24, baseH * 0.66, 2.0, w * 0.24, podH + baseH * 0.33, d / 2 + 1.4, M.glassHouse);
    put(g, BOX, w * 0.27, 0.7, 5.0, w * 0.24, podH + baseH * 0.66 + 0.35, d / 2 + 2.2, M.waveRoof);

    /* 波浪顶板：十二片**斜板**首尾相接，不是十二块上下错开的水平板。
       早先每片都是水平的、只改高度，拼出来是一摞错位的托盘——
       折板的关键是"相邻两片共用一个端点"，坡面才是连续的。 */
    var segs = 12, sy = podH + baseH + 1.0, sw = w / segs;
    var amp = (h - sy) / 2;
    /* 一道 sin 周期只拱出一个脊，12 片折板拼出来是顶帐篷，不是浪。
       一个半周期：两个峰、两个谷，屋面读成一道起伏的浪。
       amp 乘 1.35 让两个峰各自够高，谷不落到墙顶以下。 */
    function wy(t) { return Math.max(0, amp * (0.42 - 0.58 * Math.cos(t * Math.PI * 3)) * 1.92); }
    for (i = 0; i < segs; i++) {
      var t0 = i / segs, t1 = (i + 1) / segs;
      var y0 = wy(t0), y1 = wy(t1);
      var segLen = Math.sqrt(sw * sw + (y1 - y0) * (y1 - y0)) + 0.5;
      var m = new THREE.Mesh(BOX, M.waveRoof);
      m.scale.set(segLen, 0.55, d * 0.98);
      m.position.set(-w / 2 + sw * (i + 0.5), YBASE + sy + (y0 + y1) / 2, 0);
      m.rotation.z = Math.atan2(y1 - y0, sw);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      /* 折板缝里的一道竖腹板：板浮在半空，没有腹板就只剩一层铁皮 */
      if (i > 0) {
        put(g, BOX, 0.4, y0 + 1.4, d * 0.98, -w / 2 + sw * i, sy + y0 / 2, 0, M.civicTrim);
      }
    }
    /* 端头封板：波浪的两头必须收在墙内，否则最后一折悬空 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 0.7, Math.max(wy(0), wy(1)) + 1.2, d * 0.98,
        -w / 2 + (sd > 0 ? w - 0.35 : 0.35), sy + Math.max(wy(0), wy(1)) / 2, 0, M.civicTrim);
    });
  };

  /* 滨水声学舱：半沉在水里的三个碗。
     "滨水声学舱"是 tinglan 的 note 里写死的物件，不是可选装饰。
     半球坐在河床上，一半在水面以下——从岸上看是三个被水泡着的壳，
     从坡上看是三个亮点，怎么读都是"听水的地方"。 */
  ARCH.acousticPod = function (g, o, M, rd) {
    var r = o.w || 20, h = o.h || 13;
    put(g, HEMI, r, h, r, 0, 0, 0, M.podShell);
    /* 赤道一圈压边：没有它，半球和水面的交线会糊成一个软边 */
    put(g, CYL, r * 1.04, 0.8, r * 1.04, 0, 0.4, 0, M.civicTrim);
    /* 顶部采光窗 + 一圈观察缝 */
    put(g, CYL, r * 0.30, 0.6, r * 0.30, 0, h + 0.1, 0, M.winCore);
    put(g, CYL, r * 0.62, 1.4, r * 0.62, 0, h * 0.72, 0, M.winCore);
    /* 栈桥：从岸边伸到舱前，落在水面之上 */
    put(g, BOX, r * 0.9, 0.35, 4.2, 0, 4.4, r * 0.72, M.timber);
    for (var i = -1; i <= 1; i += 2) {
      put(g, BOX, 0.3, 4.6, 0.3, i * r * 0.34, 2.2, r * 0.72 + 1.8, M.timberDark);
    }
  };

  /* 梯台花园：坡上最省钱、也最像"坡"的东西。
     三级挡土墙 + 种植台，比任何一栋楼都能说明这块地是斜的。
     这也是 desc 里"梯台花园"四个字的实体。 */
  /* 梯台花园：坡地上唯一的场地。
     第一版做成四道同心方框 + 一圈 0.8 米宽的白色压顶，从空中看
     是一排发亮的横线——读成体育场看台，不是花园。
     问题不在尺寸，在「谁亮谁暗」：石墙压顶占了整条边线，台面又几乎是空的。
     现在反过来：压顶收窄到 0.3 米并压深两档，台面铺满灌木与果树，
     让「绿」成为主体、「石」只是每条绿带之间的一道缝。 */
  ARCH.slopeGarden = function (g, o, M, rd) {
    var n = o.n || 3;
    var tw = o.w || 60, td = o.d || 26;
    var th = (o.h || 6) / n;
    /* 台基埋深。坡地上一个一百米宽的台地两端高差能到七八米，
       台基不给埋深，靠下坡那侧就是一排悬空的板；给足了它反过来读成挡土墙。 */
    var plinth = o.plinth === undefined ? 10 : o.plinth;
    var y = 0;
    for (var i = 0; i < n; i++) {
      var k = 1 - i * 0.15;
      /* 逐级后退 3 米：四道同心方框看着是一个框套一个框，
         每级往后错开一点，才有「一级一级往上爬」的方向。 */
      var bz = -i * 3.0;
      var dv = td - i * 1.2;
      /* 挡土墙：从台面一直埋到基座以下 */
      put(g, BOX, tw * k, th + plinth, dv, 0, y + th / 2 - plinth / 2, bz, M.hillStone);
      /* 墙面竖缝：一道挡土墙是「一整块土」还是「砌起来的」，全看这道缝 */
      var nseg = Math.max(4, Math.round(tw * k / 7));
      for (var sg = 0; sg < nseg; sg++) {
        put(g, BOX, 0.34, th * 0.82, 0.5, -tw * k / 2 + tw * k * (sg + 0.5) / nseg,
          y + th * 0.42, bz + dv / 2 + 0.2, M.bridgeArch);
      }
      /* 压顶：0.3 米、压深两档。石墙的「压顶」是这个构件里唯一该亮的，
         但只该亮一条细线——宽了它就变成看台的座椅线。 */
      put(g, BOX, tw * k + 0.5, 0.34, dv + 0.5, 0, y + th + 0.17, bz, M.hillStone2);
      /* 台面种植层 */
      /* 台面铺草，不铺土。铺满种植土的话，一百米见方的台地
         从空中看就是四道棕色跑道——土只该出现在灌木带下面的一条缝里。 */
      put(g, BOX, tw * k - 2.6, 0.5, dv - 2.6, 0, y + th + 0.55, bz, M.grass);
      put(g, BOX, tw * k - 8.0, 0.62, dv * 0.42, 0, y + th + 0.62, bz, M.gardenSoil);
      /* 灌木带 + 果树：密到能把台面盖住，台地才是「花园」而不是「看台」。
         行距 4 米，每 5 棵插一棵 6~9 米的果树——从空中看是两条绿带夹一条石缝。 */
      var cnt = Math.max(10, Math.round(tw * k / 3.2));
      for (var c = 0; c < cnt; c++) {
        var bx = -tw * k / 2 + tw * k * (c + 0.5) / cnt;
        var br = 1.5 + rd() * 1.2;
        put(g, SPH, br, br * 0.9, br, bx, y + th + 1.15, bz + (rd() - 0.5) * (dv - 8),
          rd() < 0.5 ? M.leaf : M.leaf2);
        if (c % 5 === 2) {
          var treeH = 6.5 + rd() * 3.0;
          var tz = bz + (rd() - 0.5) * (dv - 10);
          put(g, CYL6, 0.42, treeH * 0.62, 0.42, bx, y + th + treeH * 0.31, tz, M.trunk);
          put(g, SPH, 3.0 + rd() * 1.3, 2.8 + rd() * 1.0, 3.0 + rd() * 1.3,
            bx, y + th + treeH * 0.78, tz, rd() < 0.5 ? M.leaf : M.leaf2);
        }
      }
      y += th;
    }
    /* 中央大台阶：9 米宽、两侧带花池矮墙。
       3 米宽的台阶在一百米的台地上只是一条划痕，读不出「可以走上去」。 */
    var steps = n * 6;
    for (var st = 0; st < steps; st++) {
      put(g, BOX, 9.0, th / 6 + 0.14, 2.0, 0, st * th / 6 + th / 12, td / 2 + 1.0 - st * 0.18, M.paving3);
    }
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 0.55, (o.h || 6) + 1.2, td + 2.2, sd * 4.9, (o.h || 6) / 2, 0, M.hillStone);
      put(g, BOX, 1.9, 0.5, td + 2.2, sd * 6.2, (o.h || 6) + 0.25, 0, M.hillStone2);
      var npl = Math.max(5, Math.round(td / 4));
      for (var p2 = 0; p2 < npl; p2++) {
        var pz = -td / 2 + td * (p2 + 0.5) / npl;
        put(g, SPH, 1.5, 1.4, 1.5, sd * 6.2, (o.h || 6) + 1.0, pz, M.leaf2);
      }
    });
    /* 最高一级上的观景平台：一圈栏杆把「这是给人上去看的」说死 */
    put(g, BOX, tw * 0.30, 0.4, td * 0.44, 0, y + 0.2, -(n - 1) * 3.0 - td * 0.10, M.paving3);
    for (var r = 0; r < 9; r++) {
      put(g, BOX, 0.22, 1.1, 0.22, -tw * 0.15 + tw * 0.30 * r / 8, y + 0.95,
        -(n - 1) * 3.0 - td * 0.10 + td * 0.22, M.bridgeArch);
    }
    put(g, BOX, tw * 0.30, 0.15, 0.15, 0, y + 1.55, -(n - 1) * 3.0 - td * 0.10 + td * 0.22, M.bridgeArch);
  };

  /* ------------------------------------------------------------
     河南混合街区：骑楼 / 遮阳篷 / 市集大棚 / 站房
     这一区只有一条街。所有构件都在回答同一个问题：
     「站在街中间往两头看，能不能看出这是一条连续三百米的街？」
     ------------------------------------------------------------ */

  /* 骑楼段：一段连续的街墙。
     骑楼的关键不是「楼 + 檐」，是**底面连续**——柱廊从这头通到那头，
     人在下面走几百米不被雨淋。所以段与段之间不能留退线空隙，
     上层楼体必须整段贴齐，只有底层往里退让出柱廊。

     两个必须踩到的坑：
     ① 柱廊必须朝街。原型默认把柱列画在局部 +x 面，而街在 v=0；
        v=+22 那一侧若不镜像，柱廊就整排朝街外——从空中看是两堵光板墙，
        这一区最核心的「骑楼」一条都读不出来。
     ② 柱距 4.2 米、柱宽 0.8 米，在 300 米外只有 1.5 像素，
        柱列全糊进墙里。柱距放到 5.6、柱宽 1.1，柱间空隙 4.5 米，
        斜俯视时檐下那条**连续的暗槽被切成一段段**，骑楼才成立。 */
  ARCH.arcadeBlock = function (g, o, M, rd) {
    var w = o.w || 18, d = o.d || 40, h = o.h || 24;
    var gh = o.gh || 4.2;
    var col = o.col || 4.6;
    var s = o.flip ? -1 : 1;          /* 街在局部 -x 时翻过来 */
    /* 楼体要用带窗的立面材质（plan 传 color 时由引擎生成），
       否则就是一整块光板——672 米的光板墙，不管什么高度节奏都读不成街。
       柱、檐、女儿墙反而必须是纯色石板：它们是小构件，贴窗格会碎。 */
    var stone = [M.arcadeStone, M.arcadeStone2, M.arcadeStone3, M.arcadeStone4][(o.tone || 0) % 4];
    var body = o.mat || stone;
    /* 上层楼体：从柱廊顶一直到檐口，整段连续 */
    put(g, BOX, w, h - gh, d, 0, gh + (h - gh) / 2, 0, body);
    /* 底层内墙：往**背离街的一侧**退 col，近黑——柱廊里本来就是暗的。
       退让方向最容易写反：写成 +s*col/2 时，内墙中心往街外挪，
       右缘正好等于楼体外缘，墙面贴死在柱列内侧，
       柱廊变成一个 4.6 米深却看不见的夹层——两侧看起来就是两堵光墙。 */
    put(g, BOX, w - col, gh, d, -s * col / 2, gh / 2, 0, M.arcadeDark);
    /* 楼板与挑檐：向街面挑出 1.0 米，柱廊才有「顶」，也才投得下阴影 */
    put(g, BOX, w + 1.0, 1.3, d + 0.4, s * 0.5, gh - 0.65, 0, stone);
    put(g, BOX, w + 1.25, 0.30, d + 0.55, s * 0.62, gh - 0.10, 0, M.arcadeTrim);
    /* 外排柱：柱距 5.6 米、柱宽 1.1 米 —— 柱间留 4.5 米空隙，
       斜俯视时能从柱缝看进檐下的暗槽，柱列才不是一条实线 */
    var n = Math.max(3, Math.round(d / 5.6));
    for (var i = 0; i <= n; i++) {
      put(g, BOX, 1.3, gh - 0.55, 1.3, s * (w / 2 - 0.65), (gh - 0.55) / 2,
        -d / 2 + d * i / n, stone);
      /* 柱础：一圈深色底座，让柱脚在铺装上站得住 */
      put(g, BOX, 1.6, 0.45, 1.6, s * (w / 2 - 0.65), 0.22, -d / 2 + d * i / n, M.arcadeTrim);
    }
    /* 腰线：每层一道。楼身的横向比例全靠它，没有腰线就是一整块竖板 */
    var floors = Math.max(2, Math.round((h - gh) / 3.4));
    for (var f = 1; f < floors; f++) {
      put(g, BOX, w + 0.55, 0.34, d + 0.25, -s * 0.25, gh + (h - gh) * f / floors, 0, M.arcadeTrim);
    }
    /* 店招：挂在二层檐下、朝街。这是市井街面最直白的标识，
       一排连着挂三百米，街就不是「一排楼」而是「一条商业街」。 */
    put(g, BOX, 0.3, 1.6, d * 0.88, s * (w / 2 + 0.65), gh + 1.6, 0, M.signBoard);
    /* 屋面 + 女儿墙 + 屋顶水箱：市井楼顶从来不是干净的。
       ① 屋面必须单独一块深色板——BOX 的顶面跟墙身同材质，
          不铺的话整个屋顶就是一片土黄，街被压死在底下。
       ② 女儿墙必须是**四道薄墙**。写成一块 w×d 的实心盖板，
          它会连屋面一起盖掉——砖墙色的屋顶，屋面铺了等于没铺。 */
    put(g, BOX, w - 0.6, 0.45, d - 0.6, 0, h + 0.12, 0,
      (o.tone % 2) ? M.roofFlat2 : M.roofFlat);
    var pw2 = w + 0.4, pd2 = d + 0.3, pt2 = 0.5, ppH = 1.15;
    put(g, BOX, pw2, ppH, pt2, 0.2, h + ppH / 2, (pd2 - pt2) / 2, stone);
    put(g, BOX, pw2, ppH, pt2, 0.2, h + ppH / 2, -(pd2 - pt2) / 2, stone);
    put(g, BOX, pt2, ppH, pd2 - pt2 * 2, 0.2 + (pw2 - pt2) / 2, h + ppH / 2, 0, stone);
    put(g, BOX, pt2, ppH, pd2 - pt2 * 2, 0.2 - (pw2 - pt2) / 2, h + ppH / 2, 0, stone);
    if (rd() < 0.45) {
      put(g, CYL, 2.0, 2.4, 2.0, (rd() - 0.5) * w * 0.5, h + 2.1, (rd() - 0.5) * d * 0.6, M.metal);
    }
    if (rd() < 0.35) {
      put(g, BOX, 1.4, 1.1, 1.0, (rd() - 0.5) * w * 0.6, h + 2.0, (rd() - 0.5) * d * 0.6, M.metalDark);
    }
  };

  /* 沿街两侧挑出的遮阳篷。
     初版是「一道篷横跨 26 米街面」——物理上不成立（没有哪家店能拉 26 米布），
     而且从 600 米斜俯视时，13 道朝上的篷面把整条街盖成一条白带，
     街面一点沥青都露不出来。真实商业街的篷是从两侧立面挑出来的，
     街心必须留空——**空出来的那条深色缝，就是「街」本身**。 */
  ARCH.streetAwning = function (g, o, M, rd) {
    var town = o.d || 22;        /* 每段沿街方向的长度 */
    var out = o.w || 5.0;        /* 从立面向街心挑出的深度 */
    var cnt = o.count || 1, gap = o.gap || 30;
    var halfW = o.half || 13;    /* 骑楼内立面到街心 */
    var topY = o.h || 3.55;
    var n = Math.max(6, Math.round(town / 1.55));
    var segL = town / n;
    for (var k = 0; k < cnt; k++) {
      var cz = (k - (cnt - 1) / 2) * gap;
      [-1, 1].forEach(function (sd) {
        var xc = sd * (halfW - out / 2);
        for (var i = 0; i < n; i++) {
          var lz = cz - town / 2 + segL * (i + 0.5);
          /* 条纹：三红一白。纯红从空中看是一条深色带，纯白是一片纸——
             三比一才有「市集」的杂色感，也才在远处保持色彩辨识。 */
          var mat = (i % 4 === 3) ? M.awningB : ((i % 2) ? M.awningA : M.awningA2);
          var m = put(g, BOX, out, 0.13, segL + 0.05, xc, topY - 0.16, lz, mat);
          m.rotation.z = -sd * 0.115;   /* 外缘低 0.28 米，篷是斜的 */
        }
        /* 外缘一道通长的边梁 + 灯具串：篷的「下沿」在近景里最抢眼 */
        var nseg = Math.max(1, Math.round(town / 12));
        for (var q = 0; q < nseg; q++) {
          var qz = cz - town / 2 + town * (q + 0.5) / nseg;
          put(g, BOX, 0.22, 0.30, town / nseg, sd * (halfW - out), topY - 0.62, qz, M.metalDark);
        }
        /* 托架：水平挑梁 + 斜撑。没有托架，5 米布从楼上飘出来就是一块飞毯 */
        var nb = Math.max(2, Math.round(town / 9));
        for (var b = 0; b <= nb; b++) {
          var bz = cz - town / 2 + town * b / nb;
          put(g, BOX, out, 0.11, 0.11, xc, topY - 0.34, bz, M.metalDark);
          var br = put(g, BOX, 1.0, 0.10, 0.10, sd * (halfW - 0.62), topY - 0.86, bz, M.metalDark);
          br.rotation.z = sd * 0.62;
        }
        /* 灯泡：每段三颗，挂在篷下。夜里这一区的街是一条暖线 */
        for (var l = 0; l < 3; l++) {
          put(g, SPH, 0.22, 0.22, 0.22, sd * (halfW - out * 0.6),
            topY - 0.86, cz - town / 2 + town * (l + 0.5) / 3, M.beacon);
        }
      });
    }
  };

  /* ---------------- 学园滨水区（D11） ----------------
     这一区三个地标的位置是城市数据给定的，不能挪：
     H6(-320,130) / 云驰(380,-80) / 东湾站(-110,-120)。
     构图只能顺着这三个点走，不能像前九区那样自己先定一个中心。 */

  /* H6 潜能与预算博物馆：三连拱。
     「预算」在建筑上只能用跨度表达：三跨并排的筒拱，人从东立面三个拱口
     穿进去，走到西端才是展厅。中央那一跨的东端升起 118 米拱塔，
     它是全区最高的东西，也是学园街的收束点。 */
  ARCH.archMuseum = function (g, o, M, rd) {
    var bays = o.bays || 3, bw = o.bw || 34, dep = o.d || 90;
    var wallH = o.wh || 29, rise = o.rh || 17;
    var tw = o.tw || 118, i;
    var stone = M.museumStone, deep = M.museumDeep;
    var wTot = bays * bw;
    /* 台基：整座馆抬 2.4 米。拱口没有台阶落点，人就只能「走进墙里」 */
    put(g, BOX, wTot + 12, 2.4, dep + 14, 0, 1.2, 0, deep);
    /* 东立面三级台阶：正对三个拱口，宽度一跨一个 */
    for (i = 0; i < 3; i++) {
      put(g, BOX, wTot - 4, 0.8, 3.4, 0, 0.55 + i * 0.8, dep / 2 + 12 - i * 3.4, stone);
    }
    for (i = 0; i < bays; i++) {
      var bx = -wTot / 2 + bw * (i + 0.5);
      /* 侧墙：每跨两侧各一道，三跨之间共用 → 共四道，不是六道 */
      if (i === 0) put(g, BOX, 1.8, wallH, dep, bx - bw / 2, 2.4 + wallH / 2, 0, stone);
      if (i === bays - 1) put(g, BOX, 1.8, wallH, dep, bx + bw / 2, 2.4 + wallH / 2, 0, stone);
      put(g, BOX, 1.8, wallH, dep, bx + bw / 2, 2.4 + wallH / 2, 0, stone);
      /* 端墙：上下两条，中间留出整跨的拱口。留满跨而不是留洞，
         是因为从 600 米外只能看见「墙上开了三个口」，洞的细部全看不见。 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, bw - 2.0, 7.0, 2.4, bx, 2.4 + 3.5, sd * dep / 2, stone);
      });
      /* 筒拱：VAULT 底 y=0、顶 y=0.5，scale.y 必须 ×2 */
      put(g, VAULT, bw - 0.4, rise * 2, dep, bx, 2.4 + wallH, 0, M.museumVault);
      /* 拱顶压边：沿两侧拱脚一道浅檐，拱才有「落在墙上」的重量 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 2.4, 1.1, dep, bx + sd * (bw / 2 - 0.6), 2.4 + wallH + 0.4, 0, M.museumTrim);
      });
    }
    /* 中央拱塔：两根柱 + 一道横跨的筒拱，人是可以从中殿穿过去的。
       塔不落在某一跨里，而是骑在中跨的东端——它必须「站着」，
       否则 118 米就是一段贴在屋顶上的墙。 */
    /* 拱塔：初版做成「两根柱 + 一道横跨拱」，近景里读成两根烟囱夹一排黑缝，
       拱顶浮在半空。改成实心钟塔：塔的高度本来靠「实体」读，
       镂空的塔在 600 米外只会读成两片墙。 */
    var px = wTot / 2 + 6;
    put(g, BOX, 30, tw - 4, 20, px, 2.4 + (tw - 4) / 2, 0, stone);
    put(g, BOX, 33, 2.4, 23, px, 2.4 + tw - 4 + 1.2, 0, M.museumTrim);
    put(g, BOX, 23, 4.2, 15, px, 2.4 + tw + 1.1, 0, M.museumTrim);
    /* 塔身竖缝：南北两面各七道。没有竖缝，118 米就是一整块白板 */
    for (i = 0; i < 7; i++) {
      put(g, BOX, 1.1, tw - 26, 0.9, px - 14 + 28 * (i + 0.5) / 7,
        2.4 + (tw - 4) / 2 - 6, 10.2, M.museumDeep);
      put(g, BOX, 1.1, tw - 26, 0.9, px - 14 + 28 * (i + 0.5) / 7,
        2.4 + (tw - 4) / 2 - 6, -10.2, M.museumDeep);
    }
  };

  /* 云驰智能 自动驾驶仿真塔：阶梯塔 + 环形试车坡道。
     环道是这个区唯一的「非建筑」构件，也是从天上看最容易认出 D11 的东西：
     一圈 160 米的螺旋坡道从地面盘到 24 米，车从环上开进塔底。
     没有它，116 米的阶梯塔跟 D01 的塔群没有区别。 */
  ARCH.emuTower = function (g, o, M, rd) {
    var h = o.h || 116, tw = o.tw || 26;
    var ringR = o.ringR || 74, ringW = o.ringW || 9, ringH = o.ringH || 24;
    var seg = 40, i;
    /* 场地：试车场是一块深色铺装圆盘，不是草地 */
    put(g, CYL, ringR * 2 + 40, 0.5, ringR * 2 + 40, 0, 0.1, 0, M.asphalt);
    /* 螺旋坡道：40 段，每段按切向旋转并绕切线倾斜。
       只做平面圆环是「环岛」，把 y 逐段抬起来才是「试车坡道」。 */
    for (i = 0; i < seg; i++) {
      var a = Math.PI * 2 * i / seg;
      var y = ringH * (i / seg);
      var cx = Math.cos(a) * ringR, cz = Math.sin(a) * ringR;
      var m = put(g, BOX, ringW, 0.9, ringR * 2 * Math.PI / seg + 0.6,
        cx, y + 0.6, cz, M.ringDeck);
      m.rotation.y = -a;
      /* 外侧栏板：没有栏板，坡道从空中看是一条飘着的带子 */
      var rl = put(g, BOX, 0.5, 1.0, ringR * 2 * Math.PI / seg + 0.6,
        Math.cos(a) * (ringR + ringW / 2), y + 1.5, Math.sin(a) * (ringR + ringW / 2), M.metalDark);
      rl.rotation.y = -a;
      /* 支撑柱：每 5 段一根，落到地面 */
      if (i % 5 === 0 && y > 3) {
        put(g, CYL, 1.0, y, 1.0, cx, y / 2, cz, M.metal);
      }
    }
    /* 阶梯塔：五段收分。收分不能均匀——均匀收分在远景里是一根锥子，
       每段之间留 1.6 米的「错台」，塔才有层级 */
    var segN = 5, segh = h / segN;
    for (i = 0; i < segN; i++) {
      var sw = tw - i * 3.2;
      put(g, BOX, sw, segh - 1.6, sw, 0, i * segh + (segh - 1.6) / 2, 0, o.mat || M.emuBody);
      /* 每段顶面一圈浅色压顶，错台才看得出来 */
      put(g, BOX, sw + 1.4, 1.6, sw + 1.4, 0, (i + 1) * segh - 0.8, 0, M.emuTrim);
    }
    /* 塔身竖缝：每面六道 */
    for (i = 0; i < 6; i++) {
      var sx = -tw / 2 + tw * (i + 0.5) / 6;
      put(g, BOX, 1.2, h * 0.72, 0.8, sx, h * 0.42, tw / 2 - 0.2, M.emuDeep);
      put(g, BOX, 0.8, h * 0.72, 1.2, tw / 2 - 0.2, h * 0.42, sx, M.emuDeep);
    }
    /* 塔顶：一层信号环 + 桅杆。仿真塔的顶不能是平头 */
    put(g, CYL, tw * 0.5, 3.0, tw * 0.5, 0, h + 1.5, 0, M.emuTrim);
    put(g, CYL, 1.2, 16, 1.2, 0, h + 10, 0, M.metalDark);
  };

  /* 东湾站：高架站。轨道在 14 米，站台雨棚到 24 米，中央站房 36 米。
     站的性质是「穿过」，所以站房不能是主体——主体是那条横贯全区的轨道。 */
  ARCH.elevatedStation = function (g, o, M, rd) {
    var w = o.w || 180, d = o.d || 34, h = o.h || 36;
    var deckY = o.deckY || 14;
    /* 高架桥面：整条轨道的地板 */
    put(g, BOX, w, 1.8, d * 0.86, 0, deckY, 0, M.stationDeep);
    /* 两条轨道：窄轨距双线 */
    [-1, 1].forEach(function (sd2) {
      put(g, BOX, w, 0.35, 0.5, 0, deckY + 1.1, sd2 * 5.2, M.metalDark);
      put(g, BOX, w, 0.35, 0.5, 0, deckY + 1.1, sd2 * 7.6, M.metalDark);
    });
    /* 站台：两侧各一条，中间是轨 */
    [-1, 1].forEach(function (sd2) {
      put(g, BOX, w * 0.92, 0.5, 6.4, 0, deckY + 1.35, sd2 * 11.5, M.sidewalk);
    });
    /* 雨棚：一整条，柱子每 16 米一根。棚比站房重要——它是「站」的尺度 */
    put(g, BOX, w * 0.96, 1.1, d * 0.9, 0, deckY + 9.4, 0, M.stationStone);
    var nc = Math.max(4, Math.round(w / 16));
    for (var c = 0; c <= nc; c++) {
      [-1, 1].forEach(function (sd2) {
        put(g, BOX, 0.9, 8.0, 0.9, -w * 0.48 + w * 0.96 * c / nc,
          deckY + 5.4, sd2 * (d * 0.45 - 0.6), M.metalDark);
      });
    }
    /* 站房：压在南侧，36 米 —— 只比雨棚高 12 米，不能抢轨道 */
    put(g, BOX, w * 0.30, h, 16, 0, h / 2, d / 2 + 8, M.stationStone);
    put(g, BOX, w * 0.30 + 2.0, 1.4, 18, 0, h + 0.7, d / 2 + 8, M.stationDeep);
    /* 站房正面：一条通高玻璃带 + 站名牌 */
    put(g, BOX, w * 0.26, h * 0.66, 1.0, 0, h * 0.36, d / 2 + 16.2, M.stationDark);
    put(g, BOX, w * 0.22, 2.2, 0.8, 0, h * 0.80, d / 2 + 16.4, M.signBoard);
    /* 两端楼梯塔：高架站没有这两座塔，人上不去 */
    [-1, 1].forEach(function (sd2) {
      put(g, BOX, 9, deckY + 3, 9, sd2 * (w / 2 - 6), (deckY + 3) / 2, 0, M.stationStone);
    });
  };

  /* 板式住宅：160×15 的长板，高度 24–84。
     这一区必须用「长板」而不是点式塔楼——板楼成排才有滨水住区的味道，
     点式塔楼一排就是商务区。外廊与竖缝是唯一的立面语言。 */
  /* 板式住宅。这一版刻意「少线」。
     上一版每 8 米一道深色竖缝（160 米 = 20 道）、每 3 米一道浅色檐口
     （60 米 = 19 道白线），两个方向叠起来在 640 米外就是一条条形码。
     现在的规则只有一条：**任何细于 2 米的线都不做**。
     640 米机位上一像素约等于 1.1 米，0.4 米的檐口根本收不到像素，
     它不会消失，而是被采样成随机深浅的条纹——那才是「条形码」的真身。
     所以只留 4 道竖缝 + 3 道腰线，全部 ≥0.9 米，且只差一档明度。 */
  ARCH.slabRow = function (g, o, M, rd) {
    var w = o.w || 160, d = o.d || 15, h = o.h || 40;
    var body = o.mat || M.slabWall;
    /* 一层架空：停车与风道。架空层的暗腔给整栋楼一条落地阴影，
       没有它，长板就是从地上直接长出来的一块板。 */
    var baseH = o.pilotis === false ? 0 : 3.2;
    put(g, BOX, w, h - baseH, d, 0, baseH + (h - baseH) / 2, 0, body);
    if (baseH > 0) {
      put(g, BOX, w - 2.4, baseH, d - 2.6, 0, baseH / 2, 0, M.slabDeep);
      var np = Math.max(4, Math.round(w / 16));
      for (var p = 0; p <= np; p++) {
        put(g, CYL, 1.2, baseH, 1.2, -w / 2 + w * p / np, baseH / 2, d / 2 - 0.9, M.slabBand);
      }
    }
    /* 竖向体量缝：每 44 米一道，宽 1.2。160 米一共 4 道——
       这是「板断成几段」的信息，不是「分户」的信息。 */
    var ns = Math.max(1, Math.round(w / 44));
    for (var i = 1; i < ns; i++) {
      put(g, BOX, 1.2, h - baseH - 0.4, d + 0.42, -w / 2 + w * i / ns,
        baseH + (h - baseH) / 2, 0, M.slabBand);
    }
    /* 水平腰线：只做 3 道（1/3、2/3、檐下），高 0.9。
       层线一律取消——那是唯一会让板楼变条纹的东西。 */
    [0.34, 0.67, 0.93].forEach(function (t) {
      put(g, BOX, w + 0.35, 0.9, d + 0.3, 0, baseH + (h - baseH) * t, 0, M.slabBand);
    });
    /* 屋顶：女儿墙 + 屋面 + 电梯机房。
       女儿墙必须是四道薄墙。写成一块 w×d 的盖板，就等于把整个屋顶
       铺成墙身色——110 米外的斜俯视看到的主要就是屋顶，于是整排板楼
       变成一串白盖子，街墙彻底读不出来。这条坑在 D10 已经踩过一次。 */
    var pw = w + 0.4, pd = d + 0.4, pt = 0.45, ph = 1.0;
    put(g, BOX, pw, ph, pt, 0, h + ph / 2, (pd - pt) / 2, body);
    put(g, BOX, pw, ph, pt, 0, h + ph / 2, -(pd - pt) / 2, body);
    put(g, BOX, pt, ph, pd - pt * 2, (pw - pt) / 2, h + ph / 2, 0, body);
    put(g, BOX, pt, ph, pd - pt * 2, -(pw - pt) / 2, h + ph / 2, 0, body);
    put(g, BOX, w - 1.2, 0.4, d - 1.2, 0, h + 0.2, 0, M.roofFlat);
    put(g, BOX, 9, 3.2, 7, (rd() - 0.5) * w * 0.5, h + 1.6, 0, M.slabBand);
  };

  /* 学园街墙：一整面连续的实墙，不是一排独立的楼。
     腔子：w = 沿街长度（本地 +x），d = 进深（本地 +z）。
     ⚠ D11 的 P(u,v) 与 D10 的旋转约定相反：这里本地 +x 才是沿街方向，
     D10 是 +z。上一版把长度和进深传反了，42 米段变成 22 米长、42 米深，
     街两侧因此是一排互不相干的方块，中间全是空档——街就没了。
     立面在 ±z 面（朝街），±x 面是段与段的接缝面。 */
  ARCH.campusBlock = function (g, o, M, rd) {
    var w = o.w || 42, d = o.d || 22, h = o.h || 24;
    var body = o.mat || M.campusWall;
    var gh = 4.6;                                   /* 底层净高 */
    /* 底层：往里退的深色玻璃盒。退进 1.6 米才投得下阴影，
       贴平的玻璃在 640 米外跟墙身一个色。 */
    put(g, BOX, w - 2.4, gh, d - 3.2, 0, gh / 2, 0, M.campusDeep);
    /* 段端头实墙：这是「连续」的锚点——两段正是在这里接上，
       如果端头也退空，整条街就断成一节一节的。 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 2.6, gh, d, sd * (w / 2 - 1.3), gh / 2, 0, body);
    });
    /* 主体实墙：从底层顶一直到檐口，一整块，不分段 */
    put(g, BOX, w, h - gh, d, 0, gh + (h - gh) / 2, 0, body);
    /* 基座：贴地一圈压深，楼才「按」在地上 */
    put(g, BOX, w + 0.4, 1.4, d + 0.5, 0, 0.7, 0, M.campusBase);
    /* 底层挑檐：一条 1 米厚的水平阴影线。这是整条街唯一连续的横向元素，
       也是「一排楼」变成「一条街」的那道缝。 */
    put(g, BOX, w + 0.6, 1.0, d + 1.0, 0, gh - 0.42, 0, M.campusTrim);
    /* 带状窗：每 3.7 米一道，高 1.45，只做朝街的两个面。
       可以密——横向连续的窗带读起来是「层」，
       跟板楼那种「一根一根的檐口」不是一回事。 */
    var fl = Math.max(2, Math.round((h - gh) / 3.7));
    for (var f = 1; f < fl; f++) {
      [-1, 1].forEach(function (sd) {
        put(g, BOX, w - 3.6, 1.45, 0.55, 0, gh + (h - gh) * f / fl,
          sd * (d / 2 - 0.1), M.campusDeep);
      });
    }
    /* 一道竖向体量缝：把 42 米长的段切成「大间 + 小间」。
       只有一道，位置在 1/4 处——等分会把墙切成两半，
       读起来又变回「两栋楼」。 */
    put(g, BOX, 1.3, h - gh - 0.4, d + 0.3, -w * 0.26, gh + (h - gh) / 2, 0, M.campusDeep);
    /* 屋面：深色，铺满整个墙顶；女儿墙四道薄墙压在屋面上。
       屋面一浅，整条街就浮起来。 */
    put(g, BOX, w - 1.0, 0.3, d - 1.0, 0, h + 0.15, 0, M.roofFlat);
    var pt = 0.45, ph = 0.62;
    put(g, BOX, w + 0.1, ph, pt, 0, h + ph / 2, (d - pt) / 2, M.campusTrim);
    put(g, BOX, w + 0.1, ph, pt, 0, h + ph / 2, -(d - pt) / 2, M.campusTrim);
    put(g, BOX, pt, ph, d - pt * 2, (w - pt) / 2, h + ph / 2, 0, M.campusTrim);
    put(g, BOX, pt, ph, d - pt * 2, -(w - pt) / 2, h + ph / 2, 0, M.campusTrim);
  };

  /* 长堤：沿湾岸一道人工石堤。
     D09 的水边是自然坡岸——曲线、草坡、水直接没入滩地。
     这一区必须反过来：直跑段、垂直石墙、6 米堤顶。两个区都在水边，
     一个读成「河湾」，一个读成「堤岸」，这个对比是刻意的。
     做法上按岸线每个折点切一条直跑，段与段在折点斜接——
     真实的堤也是这么修的，没有一条 1300 米的堤是弯的。 */
  ARCH.bayQuay = function (g, o, M, rd) {
    var pts = o.pts || [];
    if (pts.length < 2) return;
    var wid = o.d || 26;              /* 堤顶宽 */
    var crest = o.h || 6.0;           /* 堤顶标高，地面为 0 */
    var off = o.off === undefined ? 270 : o.off;   /* 堤轴到岸线中线的法向偏移 */
    var shelfY = o.shelfY === undefined ? 0.9 : o.shelfY;
    var n = pts.length, i;

    /* 偏移岸线：每点取相邻两段的平均法线，折点处两条直跑才接得上 */
    var op = [];
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dz = b[1] - a[1], LL = Math.sqrt(dx * dx + dz * dz) || 1;
      /* 法线 (-dz, dx)/L 指向 +z 一侧（陆地侧）：岸线大体沿 +x 走 */
      op.push([pts[i][0] + (-dz / LL) * off, pts[i][1] + (dx / LL) * off]);
    }
    /* 每段一条直跑 */
    for (i = 0; i < n - 1; i++) {
      var A = op[i], B = op[i + 1];
      var mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      var rx = B[0] - A[0], rz = B[1] - A[1];
      var L = Math.sqrt(rx * rx + rz * rz) || 1;
      var ang = Math.atan2(-rz, rx);
      var nx2 = -rz / L, nz2 = rx / L;       /* 该段的法线：+1 = 陆地侧 */
      var ux = rx / L, uz = rz / L;          /* 沿堤方向 */
      /* t = 横向偏移（正为陆地侧），s = 沿堤长度方向偏移 */
      function blk(ww, hh, dd, t, s, y, mat) {
        var m2 = put(g, BOX, ww, hh, dd,
          mx + nx2 * t + ux * s, y, mz + nz2 * t + uz * s, mat);
        m2.rotation.y = ang;
        return m2;
      }
      /* 堤身：从水下 -2.8 一直砌到堤顶。这一块是实心的——
         堤的空腔从空中看不见，但会从堤脚漏出一道地平线。 */
      var bodyH = crest + 2.8;
      blk(L + 2.4, bodyH, wid, 0, 0, crest - bodyH / 2, M.quayStone);
      /* 临水立面：单独一层贴面，比堤身深一档。
         一整面 1300 米同色的墙在任何光线下都是一个平面，必须有分层。 */
      blk(L + 2.4, bodyH - 0.6, 0.5, -(wid / 2 - 0.2), 0,
        crest - 0.3 - (bodyH - 0.6) / 2, M.quayFace);
      /* 堤顶步道 + 中轴石带 + 临水压顶 */
      blk(L + 2.4, 0.26, wid - 4.8, -0.5, 0, crest + 0.13, M.quayDeck);
      blk(L + 2.4, 0.12, 3.4, -0.5, 0, crest + 0.30, M.quayCap);
      blk(L + 2.4, 0.42, 2.0, -(wid / 2 - 1.0), 0, crest + 0.21, M.quayCap);
      /* 防浪墙：1.15 米实墙 + 0.16 米扶手。实心的——
         栏杆在远景里是一串点，读不出「堤」；墙是连续的面。 */
      blk(L + 2.4, 1.25, 0.62, -(wid / 2 - 0.85), 0, crest + 0.63, M.quayCap);
      blk(L + 2.4, 0.16, 0.86, -(wid / 2 - 0.85), 0, crest + 1.22, M.quayCap);
      /* 背水侧墙脚暗带：6 米挡墙的影子在 800 米外几乎看不见，
         补一条 1.2 米高的深色带子，堤就有一条清楚的下缘线。 */
      blk(L + 2.6, 1.4, 0.5, wid / 2 + 0.15, 0, 0.7, M.quayDark);
      /* 背水侧扶壁：每 18 米一道，从地面顶到堤顶。
         这排影子是「人工」最直接的证据——自然坡岸没有扶壁。 */
      for (var bq = 6; bq < L - 4; bq += 18) {
        blk(1.8, crest, 2.4, wid / 2 + 1.0, bq - L / 2, crest / 2, M.quayStone);
      }
      /* 泄水孔：每 14 米一个，贴在水线以上 1.6 米 */
      for (var dq = 8; dq < L - 4; dq += 14) {
        blk(0.5, 0.42, 0.5, -(wid / 2 - 0.02), dq - L / 2, crest - 2.4, M.quayDark);
      }
      /* 灯柱：每 30 米一根，4.6 米。堤顶没有灯，远景里就只是一道墙 */
      for (var lq = 12; lq < L - 6; lq += 30) {
        var ls = lq - L / 2;
        blk(0.22, 4.6, 0.22, -(wid / 2 - 3.4), ls, crest + 2.3, M.metalDark);
        blk(0.9, 0.28, 0.9, -(wid / 2 - 3.4), ls, crest + 4.72, M.beacon);
      }
      /* 背水侧行道树：每 34 米一棵。树种在堤顶靠陆地那一侧，
         树冠高过防浪墙，从水上看是「堤上有一排树」。 */
      for (var tq = 20; tq < L - 8; tq += 34) {
        var ts = tq - L / 2, th3 = 5.4 + rd() * 2.0;
        blk(0.5, th3, 0.5, wid / 2 - 3.0, ts, crest + th3 / 2, M.trunk);
        blk(5.4, 3.6, 5.4, wid / 2 - 3.0, ts, crest + th3 + 1.4,
          rd() < 0.5 ? M.leaf : M.leaf2);
      }
      /* 亲水平台：堤脚外侧一条 7 米宽的窄台，从堤顶下一段台阶才到。
         没有这一层，堤就是一道把人挡在水外面的墙。 */
      blk(L + 2.4, 0.5, 7.0, -(wid / 2 + 3.6), 0, shelfY - 0.05, M.quayCap);
      blk(L + 2.4, shelfY + 2.4, 0.7, -(wid / 2 + 7.0), 0,
        (shelfY - 2.4) / 2, M.quayFace);
    }
  };

  /* 总部塔裙房：四根光塔立在空地上就是四根电线杆。
     120 米以上的塔必须有裙房——裙房决定「这栋楼占了多大一块地」，
     没有裙房，塔的高度读不出来，因为它底下没有东西托着。 */
  ARCH.towerBase = function (g, o, M, rd) {
    var w = o.w || 110, d = o.d || 92, h = o.h || 18;
    put(g, BOX, w, h, d, 0, h / 2, 0, o.mat || M.emuBody);
    /* 一层深色基座：裙房贴地那圈必须压深，否则跟铺装糊在一起 */
    put(g, BOX, w + 1.2, 2.6, d + 1.2, 0, 1.3, 0, M.emuDeep);
    /* 屋面：裙房屋顶是塔的「平台」，必须是深色，不然是一块白盖板 */
    put(g, BOX, w - 2.0, 0.6, d - 2.0, 0, h + 0.3, 0, M.roofFlat);
    var ns = Math.max(4, Math.round(w / 10));
    for (var i = 1; i < ns; i++) {
      put(g, BOX, 1.6, h - 2.6, d + 0.4, -w / 2 + w * i / ns, (h + 2.6) / 2, 0, M.emuDeep);
    }
  };

  /* 站前广场：铺装台 + 分格缝 + 中轴石带 + 旗杆阵 + 四角树池。
     站前那块空地是这一区唯一的大片水平面，空白在这里最刺眼：
     没有缝、没有竖东西的铺装，从 600 米外看跟周边荒地同色，
     一百米见方读不出「这是广场」。
     广场要读得出来只靠三件事：抬起来的台、划开的缝、立得住的杆。 */
  ARCH.stationPlaza = function (g, o, M, rd) {
    var w = o.w || 110, d = o.d || 68, i, j;
    /* 铺装台：抬 0.14 米。差的这一截才会投出一道边影，
       把广场从地面上「摘」下来；平铺一层贴地皮，永远是一块地。 */
    put(g, BOX, w, 1.5, d, 0, -0.61, 0, M.plazaPave);
    /* 压边石：一整圈。广场没有边界，等于没有广场 */
    put(g, BOX, w + 1.6, 0.62, 1.1, 0, -0.02, -d / 2 - 0.15, M.kerb);
    put(g, BOX, w + 1.6, 0.62, 1.1, 0, -0.02, d / 2 + 0.15, M.kerb);
    put(g, BOX, 1.1, 0.62, d + 0.6, -w / 2 - 0.15, -0.02, 0, M.kerb);
    put(g, BOX, 1.1, 0.62, d + 0.6, w / 2 + 0.15, -0.02, 0, M.kerb);
    /* 分格缝：每 8.5 米一道，6 公分宽、抬 2 公分。
       缝不能宽——宽了就成了一条条深沟，广场读成一排停车位 */
    var nx = Math.max(3, Math.round(w / 8.5)), nz = Math.max(3, Math.round(d / 8.5));
    for (i = 1; i < nx; i++)
      put(g, BOX, 0.3, 0.07, d - 1.2, -w / 2 + w * i / nx, 0.20, 0, M.plazaJoint);
    for (j = 1; j < nz; j++)
      put(g, BOX, w - 1.2, 0.07, 0.3, 0, 0.20, -d / 2 + d * j / nz, M.plazaJoint);
    /* 中轴石带：正对站房中门，5 米宽。广场没有轴，人就不知道该往哪走 */
    put(g, BOX, w - 1.0, 0.12, 5.0, 0, 0.22, 0, M.hillStone2);
    /* 圆心：石带交汇处一块 18 米圆盘，广场的「眼」 */
    put(g, CYL, 18, 0.16, 18, 0, 0.24, 0, M.hillStone2);
    put(g, CYL, 13, 0.20, 13, 0, 0.26, 0, M.plazaPave);
    /* 旗杆阵：中轴两侧各五根，10 米高。
       广场空不空，一半看有没有竖直的东西立着——平面的东西堆再多也还是地。 */
    var fp = [-36, -18, 0, 18, 36], k;
    for (k = 0; k < fp.length; k++) {
      [-11, 11].forEach(function (fz) {
        put(g, BOX, 1.6, 0.5, 1.6, fp[k], 0.25, fz, M.kerb);
        put(g, CYL, 0.26, 10.0, 0.26, fp[k], 5.5, fz, M.metal);
        put(g, BOX, 1.9, 1.3, 0.12, fp[k] + 0.95, 9.3, fz, M.awningA);
      });
    }
    /* 四角树池：广场四角不种树，铺装的四个角就是四个空角 */
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (sd) {
      var tx = sd[0] * (w / 2 - 8.5), tz = sd[1] * (d / 2 - 8.5);
      put(g, BOX, 7.4, 0.62, 7.4, tx, 0.31, tz, M.kerb);
      put(g, BOX, 6.2, 0.5, 6.2, tx, 0.60, tz, M.gardenSoil);
      put(g, CYL6, 0.75, 3.6, 0.75, tx, 2.4, tz, M.trunk);
      put(g, SPH, 9.4, 7.2, 9.4, tx, 7.6, tz, rd() < 0.5 ? M.leaf : M.leaf2);
    });
  };

  /* 市集大棚：两跨钢拱。
     站前那块 150×100 的空地，靠一个棚子才有「事发生」。
     单跨 66 米会塌，所以两跨各 33 米、中间一排柱——
     中间那排柱正好把棚下分成两条走道，摊贩各占一条。 */
  ARCH.marketShed = function (g, o, M, rd) {
    var w = o.w || 66, d = o.d || 64, h = o.h || 12;
    var bays = o.bays || 2, bw = w / bays, archH = h * 0.46;
    var wallH = h - archH;
    for (var b = 0; b < bays; b++) {
      var cx = -w / 2 + bw * (b + 0.5);
      /* 拱顶不做连续壳，只做骨架：每 8 米一道拱肋 + 沿拱面排的纵向檩条。
         做成一整片壳的话，棚顶把阳光全挡掉——从任何角度看，
         棚下都是一块纯黑的洞：摊位、摊台、人都沉在黑洞里，
         这个「市场」在图上等于不存在。钢棚本来就是透的。 */
      /* 拱下的侧墙只做半高：棚要透，不能让棚变成一座厂房 */
      if (b === 0) put(g, BOX, 1.0, wallH, d, -w / 2 + 0.5, wallH / 2, 0, M.shedSteel);
      if (b === bays - 1) put(g, BOX, 1.0, wallH, d, w / 2 - 0.5, wallH / 2, 0, M.shedSteel);
    }
    /* 柱列：中间一排 + 两端，柱距 8 米 */
    var nc = Math.max(3, Math.round(d / 8));
    for (var c = 0; c <= nc; c++) {
      var cz = -d / 2 + d * c / nc;
      for (var q = 0; q <= bays; q++) {
        var qx = -w / 2 + bw * q;
        put(g, BOX, 0.9, wallH, 0.9, qx, wallH / 2, cz, M.shedSteel);
      }
    }
    /* 拱肋：每 8 米一道，拱的形态全靠它 */
    for (var r2 = 0; r2 <= nc; r2++) {
      var rz = -d / 2 + d * r2 / nc;
      for (var b2 = 0; b2 < bays; b2++) {
        var bx2 = -w / 2 + bw * (b2 + 0.5);
        put(g, VAULT, bw + 1.4, (archH + 0.75) * 2, 1.6, bx2, wallH - 0.05, rz, M.shedSteel);
      }
    }
    /* 纵向檩条：沿拱面每 18° 一道，把肋串成一个筒。
       位置直接按 VAULT 的映射反算：x = cos(a)·bw/2，y = wallH + sin(a)·archH。 */
    var purlinAng = [0.20, 0.62, 1.05, 1.50, 1.95, 2.40, 2.83];
    for (var pa = 0; pa < purlinAng.length; pa++) {
      var aa = purlinAng[pa], pxx = Math.cos(aa) * bw / 2, pyy = wallH + Math.sin(aa) * archH;
      for (var pb = 0; pb < bays; pb++) {
        var pcx = -w / 2 + bw * (pb + 0.5);
        put(g, BOX, 0.42, 0.42, d, pcx + pxx, pyy, 0, M.shedSteel);
        put(g, BOX, 0.42, 0.42, d, pcx - pxx, pyy, 0, M.shedSteel);
      }
    }
    /* 每跨脊线上一条压顶板：棚顶没有一条实线，从空中看只是一堆散肋 */
    for (var rb = 0; rb < bays; rb++) {
      put(g, BOX, 1.6, 0.55, d, -w / 2 + bw * (rb + 0.5), wallH + archH, 0, M.shedSteel);
    }
    /* 膜：钢架上面还要一层。做成不透明的屋面，棚下就是黑洞；
       做成膜结构的半透白膜，从空中看是「一层亮的顶」，从棚下看能透光。
       膜必须关掉投影——否则棚下又变回一片暗。 */
    for (var mb = 0; mb < bays; mb++) {
      var mm = put(g, VAULT, bw + 0.5, archH * 2, d + 0.2, -w / 2 + bw * (mb + 0.5), wallH, 0, M.shedMembrane);
      mm.castShadow = false; mm.receiveShadow = false;
    }
    /* 端墙的招牌板：棚子正对站房的那一面必须有一块牌子，否则它只是一个棚 */
    put(g, BOX, w * 0.62, 1.9, 0.5, 0, wallH + archH * 0.34, -d / 2 - 2.2, M.signBoard);
    /* 棚下摊台：不做两条 52 米长的通台。
       通台铺一块 13×52 的白顶，从棚子端头看进去就是三条十几米宽的
       白色跑道——那不是市场，是机场。改成一排小摊：每摊 3.2 米面宽，
       中间留 0.8 米过道，红白顶交替，一眼就是摊位。 */
    [-0.30, 0.30].forEach(function (sd) {
      var srow = Math.max(6, Math.round(d / 4.0));
      for (var st = 0; st < srow; st++) {
        var sz3 = -d / 2 + d * (st + 0.5) / srow;
        var sx3 = sd * bw;   /* 落在两侧跨的中线上 */
        put(g, BOX, 3.2, 0.92, 2.6, sx3, 0.46, sz3, M.gardenSoil);
        put(g, BOX, 3.6, 0.14, 3.0, sx3, 1.62, sz3,
          st % 3 === 2 ? M.awningB : M.awningA);
        put(g, BOX, 0.12, 1.6, 0.12, sx3 - 1.5, 0.8, sz3 - 1.3, M.metalDark);
        put(g, BOX, 0.12, 1.6, 0.12, sx3 + 1.5, 0.8, sz3 + 1.3, M.metalDark);
      }
    });
    /* 棚外的露天摊：两列小摊沿棚的两条长边排开。
       棚顶从空中看只是一片亮壳，读不出「市场」——市场是靠棚外
       那一圈碎摊子读出来的：小桌、白布顶、一块深色招牌。
       没有这一圈，这个棚在鸟瞰里就是一个白色的工业屋盖。 */
    var sn = Math.max(5, Math.round(d / 5.4));
    [-1, 1].forEach(function (side) {
      for (var si2 = 0; si2 < sn; si2++) {
        var sz2 = -d / 2 + d * (si2 + 0.5) / sn;
        var sx2 = side * (w / 2 + (rd() < 0.5 ? 5.6 : 9.4));
        /* 摊桌 + 白布顶 + 招牌 */
        put(g, BOX, 3.4, 0.9, 2.4, sx2, 0.45, sz2, M.gardenSoil);
        put(g, BOX, 3.9, 0.16, 2.9, sx2, 1.85, sz2,
          rd() < 0.42 ? M.awningA : M.awningB);
        put(g, BOX, 0.14, 1.9, 0.14, sx2 - 1.7, 0.95, sz2 - 1.2, M.metalDark);
        put(g, BOX, 0.14, 1.9, 0.14, sx2 + 1.7, 0.95, sz2 + 1.2, M.metalDark);
        put(g, BOX, 2.2, 0.75, 0.18, sx2, 1.35, sz2 + 1.5, M.signBoard);
      }
    });
  };

  /* 街门：骑楼跨街连成一座「门」，把 672 米的街切成两段。
     这一段街最大的敌人不是单调，是「没有尽头」——两侧街墙一路同宽同节奏，
     走到哪儿都一样，街就成了一条隧道。岭南的街本来就有隘门：
     两座楼跨街搭起来，底下开一个洞，人在洞里走，头上是人家的楼板。
     它一放，街有了「前段 / 后段」，远景里也有了一个可数的参照物。 */
  ARCH.streetGate = function (g, o, M, rd) {
    var w = o.w || 30, d = o.d || 15, h = o.h || 23;     /* w 跨街 */
    var ow = o.openW || 19, oh = o.openH || 12.5;
    var stone = [M.arcadeStone, M.arcadeStone2, M.arcadeStone3, M.arcadeStone4][(o.tone || 0) % 4];
    var body = o.mat || stone;
    var pw = (w - ow) / 2;
    /* 两侧墩：跨街楼不能悬空，四角必须有柱墩落到地面 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, pw + 0.6, h, d, sd * (w / 2 - pw / 2), h / 2, 0, body);
      /* 墩脚的骑楼柱：与两侧骑楼同语言，街门才不是一件外来物 */
      put(g, BOX, 1.2, h * 0.42, 1.2, sd * (w / 2 - pw / 2), h * 0.21,
        d / 2 - 0.6, stone);
      put(g, BOX, 1.2, h * 0.42, 1.2, sd * (w / 2 - pw / 2), h * 0.21,
        -d / 2 + 0.6, stone);
    });
    /* 上部跨街楼体：这段必须整块通长，中间是洞 */
    put(g, BOX, w + 0.8, h - oh, d, 0, oh + (h - oh) / 2, 0, body);
    /* 洞口的石框：一圈浅色压边，洞才不会糊成一团黑 */
    put(g, BOX, ow + 1.6, 0.7, d + 0.5, 0, oh + 0.35, 0, M.arcadeTrim);
    /* 三楼一列窗：跨街楼上住着人，不是一块封板。
       尺寸按 1.5 米的真窗做——按「上部高度的 44%」做，
       每扇窗就是 8 米高的大黑洞，整面墙像一排仓库大门。 */
    var nw = 9, winH = Math.min(1.7, (h - oh) * 0.30);
    for (var i = 0; i < nw; i++) {
      put(g, BOX, 1.5, winH, 0.4, -ow / 2 + ow * (i + 0.5) / nw,
        oh + (h - oh) * 0.62, d / 2 + 0.2, M.arcadeDark);
    }
    /* 二层（洞口正上方）再来一排，跨街楼才有两层 */
    if (h - oh > 8) {
      for (var i2 = 0; i2 < nw; i2++) {
        put(g, BOX, 1.5, winH, 0.4, -ow / 2 + ow * (i2 + 0.5) / nw,
          oh + (h - oh) * 0.30, d / 2 + 0.2, M.arcadeDark);
      }
    }
    /* 女儿墙四道薄墙 + 屋面。写成一块通板会把屋面盖掉，
       街门顶上就是一块土黄色的厚盖，跟两侧的深灰屋顶完全脱节。 */
    put(g, BOX, w - 0.4, 0.4, d - 0.4, 0, h + 0.2, 0, stone);
    var gp = 0.55, gw = w + 1.0, gd = d + 0.4;
    put(g, BOX, gw, 1.1, gp, 0, h + 0.55, (gd - gp) / 2, stone);
    put(g, BOX, gw, 1.1, gp, 0, h + 0.55, -(gd - gp) / 2, stone);
    put(g, BOX, gp, 1.1, gd - gp * 2, (gw - gp) / 2, h + 0.55, 0, stone);
    put(g, BOX, gp, 1.1, gd - gp * 2, -(gw - gp) / 2, h + 0.55, 0, stone);
    /* 洞口上沿的一道暗影线：从空中看，这道横缝就是「门」的全部信息。
       只做 0.4 米厚——给 0.9 米就是一根横在街上的黑梁。 */
    put(g, BOX, ow + 0.4, 0.4, d - 0.6, 0, oh + 0.7, 0, M.arcadeDark);
  };

  /* 中央站站房：这一区唯一的「大房子」。
     站房的性质是「通过」，不是「停留」，所以主体压在 34 米；
     但**钟楼必须比主体高出一截**——它是街筒尽头的封口。
     主体与钟楼同高的话，672 米长的街望过去，
     透视线会从站房顶上直接滑走，端景就散了。
     名字不能叫 stationHall：那是 D08 换乘大厅的键，
     同名会覆盖它，D08 的站厅会整座变成一座 34 米的钟楼。 */
  ARCH.arcadeStation = function (g, o, M, rd) {
    var w = o.w || 140, d = o.d || 44, h = o.h || 34;
    var tw = h * 1.34;
    var ST = M.stationWarm || M.stationStone;
    /* 主体：两层通高的候车厅 */
    put(g, BOX, w, h * 0.56, d, 0, h * 0.28, 0, ST);
    /* 屋面：主体 140×44 的顶面是全区最大的一块水平面。
       不铺屋面，太阳直射下它读成一整片土黄板——站房就成了一座黄仓库，
       跟后面那些民房分不出来。深色屋面 + 一圈女儿墙，站房才退得进去。 */
    var bTop = h * 0.56;
    put(g, BOX, w - 1.8, 0.5, d - 1.8, 0, bTop + 0.25, 0, M.roofFlat);
    put(g, BOX, w, 1.1, 0.7, 0, bTop + 0.55, d / 2 - 0.35, M.stationDeep);
    put(g, BOX, w, 1.1, 0.7, 0, bTop + 0.55, -d / 2 + 0.35, M.stationDeep);
    put(g, BOX, 0.7, 1.1, d - 0.7, w / 2 - 0.35, bTop + 0.55, 0, M.stationDeep);
    put(g, BOX, 0.7, 1.1, d - 0.7, -w / 2 + 0.35, bTop + 0.55, 0, M.stationDeep);
    /* 中央高体：钟楼，也是站房在远景里唯一认得出的轮廓。
       钟楼若是一块光板，远景里就是一个灰色方块——必须给它竖缝和檐口。 */
    put(g, BOX, w * 0.26, tw, d * 1.16, 0, tw / 2, 0, ST);
    var nv = 7;
    for (var vi = 0; vi <= nv; vi++) {
      put(g, BOX, 0.9, tw * 0.92, 0.7, -w * 0.13 + w * 0.26 * vi / nv, tw * 0.46,
        d * 0.58 + 0.1, M.stationDeep);
    }
    put(g, BOX, w * 0.26 + 1.6, 1.2, d * 1.16 + 1.6, 0, tw + 0.6, 0, M.stationDeep);
    put(g, BOX, w * 0.26 + 2.6, 0.55, d * 1.16 + 2.6, 0, tw * 0.72, 0, M.stationDeep);
    /* 雨棚：南北两面，出挑 7 米。站房的重心靠这两片棚子撑住。
       放在 12 米而不是主体顶下沿：顶到 19 米时，从空中看它跟主体顶面
       几乎同高，两片棚完全消失，站房只剩一块方盒子。 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, w * 0.56, 0.9, 7.4, 0, 12.5, sd * (d / 2 + 3.4), M.shedSteel);
      var ns = Math.max(3, Math.round(w * 0.56 / 12));
      for (var i = 0; i <= ns; i++) {
        put(g, CYL, 0.55, 12.0, 0.55, -w * 0.28 + w * 0.56 * i / ns, 6.0,
          sd * (d / 2 + 6.4), M.metalDark);
      }
    });
    /* 正面门洞：三个，中间大两头小。车站的门必须是一排，不是一个。
       位置是 d/2（主体正立面），不是 d*0.58——0.58 比 0.5 大，
       三个门洞整排悬在墙外 4 米，从侧面看是三个浮空的黑方块。 */
    [-1, 0, 1].forEach(function (sd) {
      var dw = sd === 0 ? w * 0.16 : w * 0.10, dh = sd === 0 ? h * 0.44 : h * 0.36;
      put(g, BOX, dw, dh, 2.2, w * 0.19 * sd, dh / 2, d / 2 + 0.5, M.stationDark);
    });
    /* 站名牌：横向长匾，挂在门洞上方、挑出墙面。
       必须挂在钟楼表面上（z = d*0.58），挂在主体面上（d/2）会被钟楼整个吃掉。 */
    put(g, BOX, w * 0.40, 2.6, 0.8, 0, h * 0.50, d * 0.58 + 1.6, M.signBoard);
    put(g, BOX, 0.3, 3.4, 0.3, -w * 0.18, h * 0.50 - 0.4, d * 0.58 + 0.5, M.metalDark);
    put(g, BOX, 0.3, 3.4, 0.3, w * 0.18, h * 0.50 - 0.4, d * 0.58 + 0.5, M.metalDark);
    /* 钟：钟楼正面的圆盘。CYL 的轴沿 y，不转 90° 就是一块平放在屋顶的天窗。 */
    var clk = put(g, CYL, 3.6, 0.45, 3.6, 0, tw * 0.82, d * 0.58 + 0.35, M.stationDeep);
    clk.rotation.x = Math.PI / 2;
    var clk2 = put(g, CYL, 2.9, 0.5, 2.9, 0, tw * 0.82, d * 0.58 + 0.42, M.civicTrim);
    clk2.rotation.x = Math.PI / 2;
  };

  /* 横巷里的一层小店铺：市井街区的填充物。
     横巷只有 12 米宽，楼一高就变成峡谷；一层、坡屋顶、卷帘门，
     才是「巷子」该有的尺度。 */
  ARCH.shopRow = function (g, o, M, rd) {
    var w = o.w || 14, d = o.d || 10, h = o.h || 5.2;
    put(g, BOX, w, h, d, 0, h / 2, 0, o.mat || M.civicTrim);
    /* 卷帘门：三个开间，深浅交错 */
    var n = Math.max(2, Math.round(w / 4.6));
    for (var i = 0; i < n; i++) {
      var sx = -w / 2 + w * (i + 0.5) / n;
      var open = rd() < 0.55;
      put(g, BOX, w / n * 0.72, h * 0.62, 0.35, sx, h * 0.31, d / 2 + 0.18,
        open ? M.arcadeDark : M.metalDark);
    }
    /* 檐下招牌 + 挑出的布篷 */
    put(g, BOX, w * 0.92, 0.9, 0.28, 0, h - 0.45, d / 2 + 0.32, M.signBoard);
    put(g, BOX, w * 0.8, 0.12, 1.5, 0, h - 1.15, d / 2 + 0.85, rd() < 0.5 ? M.awningA : M.awningB);
    /* 坡屋顶 */
    put(g, GABLE, w * 1.04, 1.6 + rd() * 1.2, d * 1.04, 0, h, 0, M.roofRoll(rd));
  };

  /* 人行桥：跨 96 米的河，桥面 6.4 米宽，中间起 1.6 米拱。
     桥是河北岸唯一能"过河"的东西，必须轻——做成一座混凝土梁桥，
     河湾就被一刀两断了。
     但「轻」不等于「薄到看不见」：早先桥面 3.4 米宽、0.42 米厚，
     栏板是一串 0.22 米的短竖杆，杆与杆之间全是空的——
     700 米全景里整座桥只剩一串白点，就是用户看到的那道虚线。
     三处一起改：桥面加宽加厚成一条连续的深色带、
     栏板改成连续的一整片、桥底加一道贯穿的拱。
     拱是桥在远景里唯一认得出的形状，没有它就只有一条色带。 */
  ARCH.footBridge = function (g, o, M, rd) {
    var span = o.w || 96, wd = o.d || 6.4, rise = o.h || 1.6;
    var n = 12, seg = span / n, i;
    for (i = 0; i < n; i++) {
      var t = (i + 0.5) / n;
      var y = rise * Math.sin(Math.PI * t);
      var x = -span / 2 + seg * (i + 0.5);
      /* 桥身 1.7 米厚。0.42 米的时候，一座 108 米长的桥在画面里
         只剩一条细线；1.7 米才让它有「梁」的体积。 */
      put(g, BOX, seg + 0.7, 1.7, wd, x, y, 0, M.bridgeDeck);
      [-1, 1].forEach(function (sd) {
        /* 外侧浅色压边：深桥身 + 浅边，桥的宽度才读得出来 */
        put(g, BOX, seg + 0.7, 0.26, 0.55, x, y + 0.83, sd * (wd / 2 - 0.28), M.deckEdge);
        /* 栏板做成一整片连续的深板，顶上再压一条浅扶手。
           从上往下看是「浅 — 深 — 浅 — 深 — 浅」五条线，桥面才有宽度；
           竖杆之间有空隙的话，远景里就是那道白虚线。 */
        put(g, BOX, seg + 0.7, 1.15, 0.2, x, y + 1.42, sd * (wd / 2 - 0.1), M.bridgeArch);
        put(g, BOX, seg + 0.7, 0.16, 0.34, x, y + 2.03, sd * (wd / 2 - 0.1), M.deckEdge);
      });
    }
    /* 拱：从桥面两端起拱，拱脚落在桥墩上。
       必须挂在桥面轮廓之外，否则从侧面看只剩一片平梁。 */
    var archN = 16, archHalf = span * 0.46;
    for (i = 0; i < archN; i++) {
      var at = (i + 0.5) / archN;
      var ay = -3.4 + 4.2 * Math.sin(Math.PI * at);
      var ax2 = -archHalf + archHalf * 2 * at;
      [-1, 1].forEach(function (sd) {
        put(g, BOX, archHalf * 2 / archN + 0.4, 1.1, 0.8, ax2, ay, sd * (wd / 2 + 0.45), M.bridgeArch);
      });
    }
    /* 三座桥墩：108 米跨必须中间有墩，只有两端两个墩，
       整座桥在侧面读成一条悬空的斜坡。 */
    [-span * 0.30, 0, span * 0.30].forEach(function (px) {
      put(g, CYL, 3.6, 11, 3.6, px, -5.6, 0, M.hillStone);
      put(g, BOX, 5.4, 0.9, wd * 0.94, px, 0.2, 0, M.bridgeArch);
    });
  };

  /* ============================================================
     D12 澄湾生态城
     这一区只有三件事：一段弧、四个圆、一片浅水。
     ============================================================ */

  /* 弧形住院楼：全城唯一的圆弧建筑。
     前十一区的平面全是直角，因为手写原型最省事的做法就是盒子。
     这一区反过来——「弧」是它在总图与天际线上唯一的身份。

     几何上用**真圆弧**（THREE.Shape 的环形扇段 + ExtrudeGeometry）。
     最初是 22 段旋转盒子去拟合：远看没问题，走近就是一排锯齿——
     每个盒子是平的，相邻两块的外表面在接缝处形成 V 形折口；
     3 道窗带 + 3 道白檐各 22 段，整面墙就是一片斜台阶。
     「弧」是这个地标唯一的理由，它不能是折线。

     一条环形扇段挤出体同时给出：外弧面、内弧面、两侧端墙、顶面、底面。
     30 个这样的实体就能把 260 米的弧做平，比原来的 250 个盒子还便宜。

     立面只给 3 道窗带 + 3 道白檐：62 米高的楼在 600 米外
     只容得下 3–4 条线，再密就是 D11 那块条形码。 */
  ARCH.hospitalArc = function (g, o, M, rd) {
    var R = o.R || 84;
    /* dep 是环带的径向厚度，不是占地深度。
       占地 d（180）走的是 blocker 与台基，两者必须分开——
       传错一次，整栋楼会被拉成一个 180 米厚的扇环。 */
    var dep = o.dep || 20;
    var h = o.h || 62;
    var a0 = o.a0 === undefined ? 1.833 : o.a0;      /* 105° */
    var a1 = o.a1 === undefined ? 4.450 : o.a1;      /* 255° */
    var CX = o.cx === undefined ? 0 : o.cx;          /* 弧心相对组原点的偏移 */
    var body = o.mat || M.ecoWhite;
    var gh = 5.6;                                     /* 底层架空净高 */

    /* 一个环形扇段实体。角度按世界 XZ 平面量（x=R·cos a，z=R·sin a）。
       ExtrudeGeometry 在 XY 平面上挤出、沿 +z 长出，
       rotateX(-90°) 之后 (x,y,z) → (x,z,-y)：形状角 a 变成世界角 −a，
       所以内弧要按 −a1→−a0、外弧按 −a0→−a1 画。 */
    function arc(t0, t1, rIn, rOut, y0, y1, mat, segs) {
      var sh = new THREE.Shape();
      sh.absarc(0, 0, rOut, -t1, -t0, false);
      sh.absarc(0, 0, rIn, -t0, -t1, true);
      var geo = new THREE.ExtrudeGeometry(sh, {
        depth: y1 - y0, bevelEnabled: false,
        curveSegments: segs || Math.max(10, Math.round((t1 - t0) / 0.022))
      });
      geo.rotateX(-Math.PI / 2);
      geo.translate(CX, y0, 0);
      var m = new THREE.Mesh(geo, mat);
      m.castShadow = (y1 - y0) > 0.6; m.receiveShadow = true;
      g.add(m); return m;
    }
    var rIn = R - dep / 2, rOut = R + dep / 2;
    /* 底层：退进 1.1 米的整圈玻璃。退进才有阴影，
       贴平的玻璃在 600 米外跟墙身一个色。 */
    arc(a0, a1, rIn + 1.1, rOut - 1.1, 0, gh - 0.45, M.ecoDeep);
    /* 柱列：14 根，等距骑在外缘上。架空才是「底层透」，不是「底层黑」。 */
    var i, av;
    for (i = 0; i <= 14; i++) {
      av = a0 + (a1 - a0) * i / 14;
      put(g, BOX, 1.1, gh - 0.45, 1.2, CX + Math.cos(av) * (rOut - 0.55),
        (gh - 0.45) / 2, Math.sin(av) * (rOut - 0.55), body, -(av + Math.PI / 2));
    }
    /* 主体 */
    arc(a0, a1, rIn, rOut, gh - 0.45, h, body);
    /* 三层窗带 + 三层白檐。窗带整圈贯通（内外两面同时成立），
       白檐比墙身出挑 0.42——弧线的明暗全靠这道出挑。 */
    [0.30, 0.53, 0.76].forEach(function (t) {
      var yb = gh + (h - gh) * t;
      arc(a0, a1, rIn + 0.55, rOut + 0.10, yb, yb + 2.4, M.ecoDeep);
      arc(a0, a1, rIn - 0.45, rOut + 0.45, yb + 2.4, yb + 3.8, body);
    });
    /* 竖向体量缝：3 道，各 0.7 米宽。只有 3 道——
       等分会把 260 米弧切成一串小房子，弧就不成立了。 */
    [0.26, 0.52, 0.78].forEach(function (t) {
      var av2 = a0 + (a1 - a0) * t;
      arc(av2 - 0.0045, av2 + 0.0045, rIn - 0.08, rOut + 0.08, gh, h, M.ecoDeep, 2);
    });
    /* 基座与玫瑰识别带：地图标记 0xf28b91 压两档，只做一道 1.2 米线。
       整栋刷粉是儿童医院，一道线才是综合医院。 */
    arc(a0, a1, rIn - 0.32, rOut + 0.32, 0, 1.2, M.ecoWhite3);
    arc(a0, a1, rIn - 0.20, rOut + 0.28, gh + 0.6, gh + 1.8, M.ecoRose);
    /* 屋面：深色环带 + 内外两道女儿墙。
       挤出的扇段自带顶面与两个端墙，端头不用再封。 */
    arc(a0, a1, rIn + 0.55, rOut - 0.55, h, h + 0.42, M.roofFlat);
    arc(a0, a1, rIn, rIn + 0.42, h, h + 1.25, M.ecoWhite3);
    arc(a0, a1, rOut - 0.42, rOut, h, h + 1.25, M.ecoWhite3);
    /* 医疗庭院：弧的内院不能是一块空草坪。
       树只种在弧的内侧，且半径压到内壁以里 8 米——
       树冠一旦探出弧线，那道 260 米的弧就从「形」退化成一排绿化。 */
    for (var tg = 0; tg < 30; tg++) {
      var ta = a0 + (a1 - a0) * (tg / 30 + rd() * 0.02);
      var trr = (R - dep / 2 - 9) * (0.28 + rd() * 0.62);
      var tgx = CX + Math.cos(ta) * trr, tgz = Math.sin(ta) * trr;
      var th3 = 5.0 + rd() * 2.6;
      put(g, CYL6, 0.45, th3 * 0.6, 0.45, tgx, th3 * 0.3, tgz, M.trunk);
      put(g, SPH, 5.0 + rd() * 1.8, 4.0 + rd() * 1.5, 5.0 + rd() * 1.8,
        tgx, th3 * 0.78, tgz, rd() < 0.5 ? M.leaf : M.leaf2);
    }
  };

  /* 门诊医技楼：住院楼弧口正对着的那一道横墙。
     20 米高、130 米长、30 米深，是全部医疗流程的入口——
     住院楼是「看见的」，这一栋是「走进去的」。
     立面只做两件事：东面 8 米高的整面玻璃（入口厅），
     以及三道连续的窗带；此外一律白墙。 */
  ARCH.hospitalEntry = function (g, o, M, rd) {
    var w = o.w || 30, d = o.d || 130, h = o.h || 20;
    var body = o.mat || M.ecoWhite;
    var gh = 6.4;
    /* 主体 */
    put(g, BOX, w, h - gh, d, 0, gh + (h - gh) / 2, 0, body);
    /* 底层：东面（+x）通透。西面是庭院，做成实体，把嘈杂留在街上。 */
    put(g, BOX, w - 2.4, gh, d - 8, 1.2, gh / 2, 0, M.ecoDeep);
    put(g, BOX, w, gh, 5.0, 0, gh / 2, -(d / 2 - 2.5), body);
    put(g, BOX, w, gh, 5.0, 0, gh / 2, (d / 2 - 2.5), body);
    /* 入口厅玻璃雨棚：从东墙挑到人行道上，24 米长、8.4 米高。
       雨棚下面是落客区，没有它，130 米长的墙就是一堵墙。 */
    put(g, BOX, 13.0, 0.75, 46, w / 2 + 5.8, 8.4, 6, body);
    put(g, BOX, 12.2, 0.22, 45, w / 2 + 5.8, 7.95, 6, M.ecoShadow);
    [-16, -4, 8, 20].forEach(function (pz2) {
      put(g, CYL, 0.55, 8.0, 0.55, w / 2 + 10.6, 4.0, pz2, M.ecoWhite3);
    });
    /* 三道窗带：与住院楼同一个节奏（2.4 高 + 1.4 白檐） */
    var fl = Math.max(2, Math.round((h - gh) / 4.4));
    for (var f = 1; f < fl; f++) {
      var yb = gh + (h - gh) * f / fl;
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.5, 2.1, d - 6, sd * (w / 2 - 0.1), yb + 1.05, 0, M.ecoDeep);
      });
      put(g, BOX, w + 0.85, 1.25, d + 0.85, 0, yb + 3.2, 0, body);
    }
    /* 竖向分缝：每 26 米一道，把 130 米切成五个诊区 */
    for (var sz3 = -d / 2 + 26; sz3 < d / 2 - 6; sz3 += 26) {
      put(g, BOX, w + 0.4, h - gh - 0.6, 1.2, 0, gh + (h - gh) / 2, sz3, M.ecoShadow);
    }
    /* 西侧玻璃中庭：接医疗庭院，1 层，7 米高 */
    put(g, BOX, 9.0, 7.0, 54, -(w / 2 + 4.5), 3.5, 0, M.ecoDeep);
    put(g, BOX, 9.6, 0.5, 55, -(w / 2 + 4.5), 7.2, 0, body);
    /* 屋面：深色 + 光伏 + 女儿墙 */
    put(g, BOX, w - 0.6, 0.35, d - 0.6, 0, h + 0.17, 0, M.roofFlat);
    var pt = 0.5, ph = 1.0;
    put(g, BOX, w + 0.4, ph, pt, 0, h + ph / 2, (d - pt) / 2, M.ecoWhite3);
    put(g, BOX, w + 0.4, ph, pt, 0, h + ph / 2, -(d - pt) / 2, M.ecoWhite3);
    put(g, BOX, pt, ph, d - pt * 2, (w - pt) / 2, h + ph / 2, 0, M.ecoWhite3);
    put(g, BOX, pt, ph, d - pt * 2, -(w - pt) / 2, h + ph / 2, 0, M.ecoWhite3);
    for (var sr = 0; sr < 5; sr++) {
      var pz3 = -d / 2 + 14 + sr * 24;
      var pvm = put(g, BOX, w - 5, 0.13, 2.0, 0, h + 0.75, pz3, M.ecoSolar);
      pvm.rotation.x = 0.30;
    }
  };

  /* 沉淀池群：四个正圆。
     全城只有这一组「正圆」——D03 的冷却塔是圆锥、D04 的湖是椭圆，
     正圆只属于工业工艺：沉淀、浓缩、调蓄。
     做法上绝不能用一个实心圆柱：顶面一封，池里就看不见水，
     四个池子在 600 米外只是四根白柱子。
     16 段环墙 + 池内水面 + 一道刮泥桥，是这一组唯一立得住的构造。 */
  ARCH.settlingYard = function (g, o, M, rd) {
    var w = o.w || 190, d = o.d || 160;
    var plat = o.plat === undefined ? 1.2 : o.plat;
    /* 台地：三级踏步收边。一条直坎的台地在俯视里就是一块地毯，
       三级踏步才有 0.4 米的高差阴影。 */
    put(g, BOX, w, plat, d, 0, plat / 2, 0, M.ecoTankDeep);
    [-1, 1].forEach(function (sd) {
      put(g, BOX, w + 1.6, plat * 0.66, 1.6, 0, plat * 0.33, sd * (d / 2 + 0.8), M.ecoStone);
      put(g, BOX, 1.6, plat * 0.66, d + 1.6, sd * (w / 2 + 0.8), plat * 0.33, 0, M.ecoStone);
    });
    /* 台地面：比地面亮半档的水泥，池与池之间是这块铺装 */
    put(g, BOX, w - 3.2, 0.12, d - 3.2, 0, plat + 0.06, 0, M.ecoWhite3);

    function tank(cx2, cz2, r, wallH) {
      var seg = 18, th = 0.85, i2;
      for (i2 = 0; i2 < seg; i2++) {
        var am = Math.PI * 2 * (i2 + 0.5) / seg;
        var chord = 2 * r * Math.sin(Math.PI / seg) + 0.55;
        put(g, BOX, chord, wallH, th, cx2 + Math.cos(am) * r, plat + wallH / 2,
          cz2 + Math.sin(am) * r, M.ecoTank, -(am + Math.PI / 2));
        /* 压顶：比池壁亮一档，1.25 米宽。一圈压顶是「池」与「白圈」的分界。 */
        put(g, BOX, chord, 0.34, th + 0.6, cx2 + Math.cos(am) * r, plat + wallH + 0.17,
          cz2 + Math.sin(am) * r, M.ecoStoneCap, -(am + Math.PI / 2));
      }
      /* 水面：半径比内壁小 0.7，边缘留一道阴影缝 */
      put(g, CYL, (r - 0.9) * 2, 0.22, (r - 0.9) * 2, cx2, plat + wallH * 0.58, cz2, M.ecoPond);
      /* 刮泥桥：横跨直径，两边各一段。单跨整条会在中心轴处穿模。 */
      [-1, 1].forEach(function (sd2) {
        put(g, BOX, r - 0.4, 0.55, 1.5, cx2 + sd2 * (r / 2 + 0.1), plat + wallH + 0.95, cz2, M.metal);
        put(g, BOX, r - 0.4, 0.14, 0.16, cx2 + sd2 * (r / 2 + 0.1), plat + wallH + 1.75, cz2, M.metalDark);
      });
      /* 中心转轴 + 出水堰 */
      put(g, CYL, 2.8, wallH + 2.4, 2.8, cx2, plat + (wallH + 2.4) / 2, cz2, M.ecoWhite3);
      put(g, CYL, 4.2, 0.3, 4.2, cx2, plat + wallH + 2.55, cz2, M.metalDark);
    }
    (o.tanks || []).forEach(function (t) { tank(t.x, t.z, t.r, t.h || 4.2); });

    /* 泵房：长条，西面一排竖向百叶。全区的屋顶光伏在这里第一次出现。 */
    var ph2 = o.pump || { x: 40, z: 50, w: 44, d: 26, h: 16 };
    put(g, BOX, ph2.w, ph2.h, ph2.d, ph2.x, plat + ph2.h / 2, ph2.z, M.ecoWhite2);
    for (var lv2 = -ph2.d / 2 + 2; lv2 < ph2.d / 2 - 1; lv2 += 2.2) {
      put(g, BOX, 0.5, ph2.h - 5.0, 0.9, ph2.x - ph2.w / 2 - 0.2, plat + 2.5 + (ph2.h - 5.0) / 2,
        ph2.z + lv2, M.ecoDeep);
    }
    put(g, BOX, ph2.w + 0.7, 0.9, ph2.d + 0.7, ph2.x, plat + ph2.h + 0.45, ph2.z, M.ecoTankDeep);
    for (var pr2 = 0; pr2 < 3; pr2++) {
      var pvm2 = put(g, BOX, ph2.w - 5, 0.14, 2.2, ph2.x, plat + ph2.h + 1.25,
        ph2.z - 8 + pr2 * 8, M.ecoSolar);
      pvm2.rotation.x = 0.30;
    }
    /* 调蓄塔：38 米，全区第二根竖线。
       没有它，这一区只有一个 62 米的高点，天际线是一根孤柱。 */
    var tw = o.tower || { x: -55, z: 42, r: 9, h: 38 };
    put(g, CYL, tw.r * 2, tw.h, tw.r * 2, tw.x, plat + tw.h / 2, tw.z, M.ecoTank);
    [0.34, 0.62, 0.86].forEach(function (t2) {
      put(g, CYL, tw.r * 2 + 1.3, 0.55, tw.r * 2 + 1.3, tw.x, plat + tw.h * t2, tw.z, M.ecoStoneCap);
    });
    put(g, CYL, tw.r * 2 + 0.5, 0.9, tw.r * 2 + 0.5, tw.x, plat + tw.h + 0.45, tw.z, M.ecoWhite3);
    put(g, BOX, 1.5, tw.h, 1.5, tw.x + tw.r * 0.94, plat + tw.h / 2, tw.z, M.ecoTankDeep);
    /* 管廊：三根管从泵房接到最近的一个池，2.4 米高的支墩 */
    (o.pipes || []).forEach(function (pp) {
      var ax = pp[0], az = pp[1], bx = pp[2], bz = pp[3];
      var mdx = (ax + bx) / 2, mdz = (az + bz) / 2;
      var mdx2 = bx - ax, mdz2 = bz - az, mL = Math.sqrt(mdx2 * mdx2 + mdz2 * mdz2) || 1;
      var ang2 = Math.atan2(-mdz2, mdx2);
      for (var pi3 = 0; pi3 < 3; pi3++) {
        put(g, CYL, 1.5, mL, 1.5, mdx, plat + 3.4 + pi3 * 1.9, mdz,
          pi3 === 1 ? M.ecoMint : M.metal, ang2 + Math.PI / 2).rotation.z = Math.PI / 2;
      }
      for (var sp2 = 4; sp2 < mL - 4; sp2 += 11) {
        var tp3 = sp2 / mL;
        put(g, BOX, 1.1, 4.2, 2.6, ax + mdx2 * tp3, plat + 2.1, az + mdz2 * tp3, M.ecoStoneCap, ang2);
      }
    });
  };

  /* 生态农田：条田 + 玻璃温室 + 小泵房。
     一个「生态城」如果只有白房子和草地，它跟任何一个新城没区别。
     条田是这一区唯一能大面积铺开、又完全不像建筑的东西——
     俯视时它是十几条深浅交替的绿带，正好把空着的西北角填满。 */
  ARCH.ecoField = function (g, o, M, rd) {
    var w = o.w || 130, d = o.d || 90;
    /* 条垄与空档一比一。写 5.5/3.0 时垄占 65%，远看是一块实心色块；
       条田要读成「条田」，靠的是等宽的空档，不是垄本身有多宽。 */
    var strip = 4.4, gap = 4.1, rows = Math.max(3, Math.floor(d / (strip + gap)));
    /* 四色绿：偏黄的返青、偏灰的抽穗、深一档的墒沟。都不压线性。
       压了线性会暗两档，比田埂还深，整块田从空中就是一片土黄——
       这条坑踩过一次：linear 化的垄 + 没 linear 的埂 = 埂比垄亮，田就没了。
       反过来也不能贪亮：0x86974b 在满光下是一条荧光黄线，一屏十几条就是斑马线。
       这块地要的是「能吃的绿」，比草地深一档半。 */
    var crops = [plainMat(0x5b7031, 0.96), plainMat(0x687c3b, 0.96),
      plainMat(0x51652b, 0.96), plainMat(0x748546, 0.96)];
    /* 田埂：土。它必须比垄暗、但必须还是「土」，不是黑缝——
       0x6b5f47 压过线性之后是 0x251d10，一条条黑缝把田切成刺眼的条纹。 */
    put(g, BOX, w, 0.16, d, 0, 0.08, 0, plainMat(0x554a34, 0.98));
    for (var i = 0; i < rows; i++) {
      var cz = -d / 2 + (strip + gap) * (i + 0.5);
      var cw = w * (0.86 + rd() * 0.12);
      /* 一条田垄再切成 3–5 段，每段换一种绿：一块田里不可能只有一个色 */
      var segs = 3 + Math.floor(rd() * 3), sw = cw / segs;
      for (var s = 0; s < segs; s++) {
        var sx = -cw / 2 + sw * (s + 0.5);
        put(g, BOX, sw - 1.2, 0.55 + rd() * 0.35, strip, sx, 0.36, cz,
          crops[Math.floor(rd() * crops.length)]);
      }
    }
    /* 玻璃温室：两栋，压在田头。拱顶用筒拱，比盒子更像农业设施。
       VAULT 的 y 只有实际高度的一半（底面 y=0、顶面 y=0.5），scale 要 ×2。 */
    [-1, 1].forEach(function (sd) {
      var gx = -w / 2 + 16, gz = sd * (d / 2 - 9);
      put(g, BOX, 30, 2.6, 13, gx, 1.3, gz, M.ecoWhite3);
      var vh = put(g, VAULT, 13, 6.4, 30, gx, 2.6, gz, M.glassHouse);
      vh.castShadow = true;
    });
    /* 田头小泵房 + 一条灌溉渠 */
    put(g, BOX, 7, 4.2, 6, w / 2 - 12, 2.1, -d / 2 + 7, M.ecoWhite2);
    put(g, BOX, w - 6, 0.5, 1.6, 0, 0.28, d / 2 - 3, M.ecoPond);
  };

  /* 生态社区：架空 + 挑板 + 木格栅 + 光伏顶。
     这一片是 D12 的「底」——它必须低（18–28 米），而且必须白，
     否则东边那片浅水塘就没有岸。挑板是唯一的水平线，
     木格栅是唯一的暖色，光伏顶是唯一的深色：三样各管一件事，不叠加。 */
  ARCH.ecoBlock = function (g, o, M, rd) {
    var w = o.w || 48, d = o.d || 30, h = o.h || 22;
    var body = o.mat || M.ecoWhite2;
    var gh = 4.2;
    /* 架空层：整层退进 2.4 米。下面看得穿，上面才压得住。 */
    put(g, BOX, w - 4.8, gh, d - 4.8, 0, gh / 2, 0, M.ecoDeep);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      put(g, BOX, 1.5, gh, 1.5, q[0] * (w / 2 - 1.1), gh / 2, q[1] * (d / 2 - 1.1), body);
    });
    put(g, BOX, 1.3, gh, 1.3, 0, gh / 2, -(d / 2 - 1.1), body);
    put(g, BOX, 1.3, gh, 1.3, 0, gh / 2, (d / 2 - 1.1), body);
    /* 主体 */
    put(g, BOX, w, h - gh, d, 0, gh + (h - gh) / 2, 0, body);
    /* 楼板挑板：出挑 1.3，下面压一条暗缝。
       没有暗缝，白挑板在白墙上等于没有。 */
    var fl = Math.max(2, Math.round((h - gh) / 4.0));
    for (var f = 1; f < fl; f++) {
      var yb = gh + (h - gh) * f / fl;
      put(g, BOX, w + 2.6, 0.40, d + 2.6, 0, yb, 0, body);
      put(g, BOX, w + 2.1, 0.32, d + 2.1, 0, yb - 0.36, 0, M.ecoShadow);
    }
    /* 向阳面（+z）竖向木格栅：每 2.4 米一道，架空顶到檐下 */
    for (var x2 = -w / 2 + 1.4; x2 < w / 2 - 0.9; x2 += 2.4) {
      put(g, BOX, 0.40, h - gh - 1.4, 0.55, x2, gh + (h - gh - 1.4) / 2, d / 2 + 0.35, M.ecoTimber);
    }
    /* 屋面：深色 + 三排光伏 + 女儿墙。光伏必须比屋面高 0.5 米，
       否则掠射光下整片屋顶只是一块深灰。 */
    put(g, BOX, w - 0.8, 0.34, d - 0.8, 0, h + 0.17, 0, M.roofFlat);
    for (var sr = 0; sr < 3; sr++) {
      var pvm = put(g, BOX, w - 4.4, 0.13, 1.5, 0, h + 0.72, -d / 2 + 5 + sr * 8.6, M.ecoSolar);
      pvm.rotation.x = 0.30;
    }
    var pt = 0.5, ph = 0.95;
    put(g, BOX, w + 0.35, ph, pt, 0, h + ph / 2, (d - pt) / 2, M.ecoWhite3);
    put(g, BOX, w + 0.35, ph, pt, 0, h + ph / 2, -(d - pt) / 2, M.ecoWhite3);
    put(g, BOX, pt, ph, d - pt * 2, (w - pt) / 2, h + ph / 2, 0, M.ecoWhite3);
    put(g, BOX, pt, ph, d - pt * 2, -(w - pt) / 2, h + ph / 2, 0, M.ecoWhite3);
    /* 北面一小段绿化屋面：全区唯一的绿色，出现在屋顶边缘 */
    put(g, BOX, w * 0.5, 0.5, 2.4, -w * 0.2, h + 0.45, -d / 2 + 2.2, M.ecoCrop);
  };

  /* 澄湾渠：水务中心到澄湾塘之间那条一级一级落下去的明渠。
     这一条是全区唯一「水在动」的地方——塘是静的，渠是流的，
     三级跌水把 1.2 米的高差落完。没有它，四个沉淀池和那片湿地
     就是两件互不相干的东西。 */
  ARCH.ecoChannel = function (g, o, M, rd) {
    var pts = o.pts || [];
    if (pts.length < 2) return;
    var wid = o.w || 8;
    var lv = o.lv || [];
    var wallH = o.h || 0.95;
    var n = pts.length, i;
    for (i = 0; i < n - 1; i++) {
      var A = pts[i], B = pts[i + 1];
      var dx = B[0] - A[0], dz = B[1] - A[1];
      var L = Math.sqrt(dx * dx + dz * dz) || 1;
      var ang = Math.atan2(-dz, dx);
      var nx2 = -dz / L, nz2 = dx / L;
      var mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      var l0 = lv[i] === undefined ? 0 : lv[i];
      var l1 = lv[i + 1] === undefined ? l0 : lv[i + 1];
      /* 渠底：落到本段水面下 0.75，整段一块 */
      put(g, BOX, L + 0.5, 0.9, wid, mx, l0 - 0.85, mz, M.ecoStone, ang);
      /* 水面 */
      put(g, BOX, L + 0.5, 0.10, wid - 1.55, mx, l0 - 0.04, mz, M.ecoPond, ang);
      /* 两侧壁 + 压顶：壁从地面下 0.8 一直到水面以上 wallH */
      [-1, 1].forEach(function (sd) {
        var wx = mx + nx2 * sd * (wid / 2 - 0.27), wz = mz + nz2 * sd * (wid / 2 - 0.27);
        var top = l0 + wallH, bot = (l0 - 0.85) - 0.6;
        put(g, BOX, L + 0.5, top - bot, 0.54, wx, (top + bot) / 2, wz, M.ecoStone, ang);
        put(g, BOX, L + 0.5, 0.18, 0.86, mx + nx2 * sd * (wid / 2 - 0.1),
          top + 0.09, mz + nz2 * sd * (wid / 2 - 0.1), M.ecoStoneCap, ang);
      });
      /* 跌水：高差落在下游那个折点上，一道横堰 + 堰下的白水 */
      if (Math.abs(l1 - l0) > 0.02) {
        var drop = l0 - l1;
        put(g, BOX, wid + 0.4, drop + 0.45, 1.15, B[0], (l0 + l1) / 2 - 0.1, B[1],
          M.ecoStoneCap, ang + Math.PI / 2);
        put(g, BOX, wid - 2.0, drop * 0.8, 1.5, B[0], l1 + drop * 0.4, B[1] + 0, M.jet,
          ang + Math.PI / 2);
      }
    }
    /* 渠顶栏杆：只在东侧（临路一侧）做，2 米一根立柱 + 一道扶手 */
    for (i = 0; i < n - 1; i++) {
      var A2 = pts[i], B2 = pts[i + 1];
      var ddx = B2[0] - A2[0], ddz = B2[1] - A2[1];
      var LL = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
      var nnx = -ddz / LL, nnz = ddx / LL;
      var ang2 = Math.atan2(-ddz, ddx);
      var l0b = lv[i] === undefined ? 0 : lv[i];
      var off = wid / 2 + 0.55;
      put(g, BOX, LL, 0.12, 0.12, (A2[0] + B2[0]) / 2 + nnx * off, l0b + 1.32,
        (A2[1] + B2[1]) / 2 + nnz * off, M.ecoMint, ang2);
      for (var sp = 0; sp < LL; sp += 2.0) {
        var t2 = sp / LL;
        put(g, BOX, 0.11, 1.15, 0.11, A2[0] + ddx * t2 + nnx * off, l0b + 0.62,
          A2[1] + ddz * t2 + nnz * off, M.ecoMint);
      }
    }
  };

  /* 观鸟台：塘东岸的一处木平台。
     水面必须有一个可以站上去的地方——不然 300 米宽的塘只是一张图。
     3.2 米高、单坡顶，比岸高出一截，正好越过芦苇看水。 */
  ARCH.ecoDeck = function (g, o, M, rd) {
    var w = o.w || 16, d = o.d || 12, dy = o.h || 3.2;
    /* 六根桩 */
    [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]].forEach(function (q) {
      put(g, CYL6, 0.62, dy + 1.2, 0.62, q[0] * (w / 2 - 1.2), (dy - 1.2) / 2, q[1] * (d / 2 - 1.2), M.ecoTimberDark);
    });
    /* 甲板：两层，下层出挑 0.6 做檐口 */
    put(g, BOX, w + 1.2, 0.34, d + 1.2, 0, dy - 0.17, 0, M.ecoTimberDark);
    put(g, BOX, w, 0.30, d, 0, dy + 0.15, 0, M.ecoTimber);
    /* 栏杆：三面（西面临水不设栏，做低栏） */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, w, 0.12, 0.10, 0, dy + 1.20, sd * (d / 2 - 0.1), M.ecoTimberDark);
      for (var bx = -w / 2 + 0.4; bx <= w / 2 - 0.3; bx += 1.8) {
        put(g, BOX, 0.10, 0.95, 0.10, bx, dy + 0.75, sd * (d / 2 - 0.1), M.ecoTimberDark);
      }
    });
    /* 单坡顶：脊在 +z 侧，向水面（-x? 不，向 -z? ）——
       这里脊沿 x 平铺，坡向 -z，即朝水面一侧压低，视线不被顶挡住。 */
    put(g, BOX, w + 1.6, 0.24, d + 1.8, 0, dy + 4.5, 0.35, M.ecoWhite3).rotation.x = 0.10;
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 0.28, 4.2, 0.28, sd * (w / 2 - 0.9), dy + 2.4, d / 2 - 0.9, M.ecoTimberDark);
      put(g, BOX, 0.28, 5.0, 0.28, sd * (w / 2 - 0.9), dy + 2.7, -(d / 2 - 0.9), M.ecoTimberDark);
    });
    /* 坡道：从岸上落到甲板，6 米长。没有坡道的平台是一个台子。 */
    for (var rp = 0; rp < 8; rp++) {
      var t3 = rp / 8;
      put(g, BOX, 2.4, 0.22, 1.0, w / 2 + 3.4 - t3 * 6.2, dy * t3 + 0.1, 0, M.ecoTimber);
    }
  };

  /* ------------------------------------------------------------
     东部制造港（D13）：岸壁、岸桥、铁道、月台仓、洁净厂房、调度塔
     这一区没有街、没有沿街立面、没有广场——只有作业面与堆场。
     所以六个原型全部是「构件」而不是「房子」：
     它们的识别度来自重复的节奏（系缆柱、枕木、箱排、臂架），
     而不是来自门窗与屋顶。前十二区靠轮廓认，这一区靠阵列认。
     ------------------------------------------------------------ */

  /* 岸壁 + 码头面（apron）。
     局部坐标 x=0 是岸线，陆地全在 −x 侧，海在 +x 侧（绝对位置由 hero 的 x 给）。
     一件东西决定它像不像码头：岸壁必须在海面以下继续往下长。
     只做到水面就停，从海上平看就是一块漂着的板。 */
  ARCH.portQuay = function (g, o, M, rd) {
    var L = o.d || 1240;               /* 码头岸线长度，沿 z */
    var W = o.w || 72;                 /* apron 进深，向 −x */
    var WL = o.wallL || L + 2200;      /* 海塘长度：比码头长，整条海岸线都由它封住 */
    var deck = 0.30;
    var seaY = o.seaY === undefined ? -2.6 : o.seaY;

    /* 岸壁：从 −9 米直上到 0.74。0.74 是挡浪墙顶，比码头面高 44 公分，
       正好给岸线画一道连续的亮边——600 米外，码头与海的分界就是这条线。 */
    put(g, BOX, 7.2, 9.74, WL, -3.6, -4.13, 0, M.portConcrete3);
    put(g, BOX, 3.8, 0.44, WL, -1.9, deck + 0.22, 0, M.portConcrete);
    /* 水痕带：水面以上两米的一道深色。没有它，岸壁就是一块干净的灰板。 */
    put(g, BOX, 0.24, 2.1, WL, 0.02, seaY + 1.05, 0, M.portConcrete3);

    /* apron：码头面铺装，从墙根退 7.2 米铺到 −W */
    put(g, BOX, W - 7.2, deck, L, -(7.2 + (W - 7.2) / 2), deck / 2, 0, M.portConcrete2);
    /* 两条边线：一条黄的贴岸（安全线），一条白的在堆场侧 */
    put(g, BOX, 0.30, 0.06, L, -10.5, deck + 0.03, 0, M.portSafety);
    put(g, BOX, 0.26, 0.06, L, -W + 4.0, deck + 0.03, 0, M.paint);

    /* 系缆柱：每 24 米一个。港区最便宜的「节奏」，也是近景尺度标尺。 */
    for (var bz = -L / 2 + 12; bz < L / 2; bz += 24) {
      put(g, CYL, 0.95, 0.85, 0.95, -2.5, deck + 0.42, bz, M.portSteelDeep);
      put(g, CYL, 1.15, 0.16, 1.15, -2.5, deck + 0.88, bz, M.portConcrete3);
    }
    /* 护舷：橡胶鼓，挂在墙面上、向外鼓出半米，比水面略高 */
    for (var fz = -L / 2 + 24; fz < L / 2; fz += 24) {
      put(g, BOX, 1.05, 3.4, 1.2, 0.55, seaY + 1.9, fz, M.portBand);
    }
    /* 岸桥轨道：两条，轨距 24。轨枕板压在地面上，轨顶 0.56——
       岸桥的轮子要看得见压在轨上，机器才有重量。 */
    [-48, -24].forEach(function (rx) {
      put(g, BOX, 2.0, 0.22, L, rx, deck + 0.11, 0, M.portConcrete3);
      put(g, BOX, 0.34, 0.18, L, rx, deck + 0.31, 0, M.rail);
    });
    /* 集卡通道：两条虚线。apron 太空就是一块水泥地，
       有车道线才是作业面。24 米一循环，远看是一串短划而不是噪点。 */
    [-46, -20].forEach(function (lxx) {
      for (var dz2 = -L / 2 + 8; dz2 < L / 2; dz2 += 24) {
        put(g, BOX, 0.24, 0.05, 7.5, lxx, deck + 0.025, dz2, M.paint);
      }
    });
    /* 集卡：沿二车道排。一台集卡在 600 米外只有三四个像素，
       但它是 apron 上唯一能标出「人在这里作业」的东西。 */
    for (var tz = -L / 2 + 62; tz < L / 2; tz += 96) {
      var tdir = rd() < 0.5 ? 1 : -1;
      put(g, BOX, 2.5, 2.9, 2.4, -46, deck + 1.45, tz, M.portShed2);
      put(g, BOX, 2.6, 0.35, 2.5, -46, deck + 2.95, tz, M.portBand);
      put(g, BOX, 2.4, 0.9, 11.0, -46, deck + 0.75, tz + tdir * 6.9, M.portBand);
      if (rd() < 0.6) {
        put(g, BOX, 2.45, 2.55, 11.8, -46, deck + 2.45, tz + tdir * 7.0,
          M.portCont[Math.floor(rd() * M.portCont.length)]);
      }
    }
    /* 高杆灯：每 80 米一根，28 米高，四头。
       港区的夜间作业面靠它；白天它就是一条竖线，把 apron 的进深标出来。 */
    for (var lz = -L / 2 + 40; lz < L / 2; lz += 80) {
      put(g, BOX, 0.7, 28, 0.7, -W + 6, 14, lz, M.portSteelDeep);
      put(g, BOX, 5.4, 0.4, 0.6, -W + 6, 27.8, lz, M.portSteelDeep);
      [-2.2, -0.7, 0.7, 2.2].forEach(function (lx) {
        put(g, BOX, 0.9, 0.3, 0.7, -W + 6 + lx, 27.5, lz, M.beacon);
      });
    }
  };

  /* 岸桥（STS）：这一区唯一的「机器」，也是全城唯一的高空剪影。
     六台同型沿直线岸排开，间距 76 米。造型只做对三件事：
     ① 门架要透（四条腿 + 剪刀撑，不能是一个实心箱子）；
     ② 主梁要长（后伸 46 + 前伸 68，一条 114 米的梁压在海面上）；
     ③ 塔顶要有拉杆（两根斜索从 57 米塔顶拉到梁的两端）——
     没有拉杆，60 米的剪影读成门式起重机；有了它才是岸桥。 */
  ARCH.stsCrane = function (g, o, M, rd) {
    var gauge = o.gauge || 24, span = o.span || 18;
    var sill = o.sill || 34, boomTop = o.boomTop || 46, top = o.top || 57;
    /* 后伸 26 / 前伸 62。第一版写成 46/68，从侧面看是一根两头等长的扁担；
       真实岸桥的尾巴很短，长臂全在海侧——不对称本身就是「机器」的证据。 */
    var back = o.back || 26, front = o.front || 62;
    var rx = gauge / 2, hz = span / 2;
    var base = 0.42;                   /* 落在轨道顶上 */

    /* 任意方向的杆件：斜撑与拉索都不是轴向的，put 只能给 ry，
       做不出三维斜杆，这里直接按两点建盒子。 */
    function rod(ax, ay, az, bx, by, bz, t, mat) {
      var dx = bx - ax, dy = by - ay, dz = bz - az;
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      var m = new THREE.Mesh(BOX, mat);
      m.scale.set(len, t, t);
      m.position.set((ax + bx) / 2, (ay + by) / 2 + YBASE, (az + bz) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len));
      m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }

    /* 四条腿 + 腿脚台车 */
    var sx, sz;
    for (sx = -1; sx <= 1; sx += 2) {
      for (sz = -1; sz <= 1; sz += 2) {
        put(g, BOX, 1.7, sill - base, 1.7, sx * rx, base + (sill - base) / 2, sz * hz, M.portSteel);
        put(g, BOX, 2.6, 1.2, 3.4, sx * rx, base + 0.4, sz * hz, M.portSteelDeep);
      }
    }
    /* 剪刀撑只做在两个侧立面（z=±hz）：正面要留空给集卡通过。 */
    [-1, 1].forEach(function (s2) {
      var zz = s2 * hz;
      rod(-rx, base + 1.0, zz, rx, sill - 1.0, zz, 0.62, M.portSteelDeep);
      rod(rx, base + 1.0, zz, -rx, sill - 1.0, zz, 0.62, M.portSteelDeep);
      put(g, BOX, gauge - 2.2, 0.55, 0.55, 0, base + (sill - base) * 0.52, zz, M.portSteelDeep);
    });
    /* 下横梁：把同侧两条腿连起来，主梁就坐在它上面 */
    [-1, 1].forEach(function (s3) {
      put(g, BOX, 2.6, 2.4, span + 1.6, s3 * rx, sill + 1.2, 0, M.portSteel);
    });

    /* 机房：骑在下横梁之间，是岸桥上唯一一块「体量」。
       没有它，四条腿加一根梁就是一座栈桥。 */
    put(g, BOX, gauge + 4.0, 5.4, 12.0, 0, sill + 6.2, 0, M.portSteel);
    put(g, BOX, gauge + 4.2, 0.5, 12.2, 0, sill + 9.1, 0, M.portSteelDeep);
    for (var lv = 0; lv < 3; lv++) {
      put(g, BOX, 3.6, 0.5, 0.22, -5.4, sill + 4.6 + lv * 1.2, 6.05, M.portBand);
      put(g, BOX, 3.6, 0.5, 0.22, 5.4, sill + 4.6 + lv * 1.2, 6.05, M.portBand);
    }

    /* 两根主梁：从后伸端一直跨到前伸端。梁高 2.8，梁中心在 boomTop−1.4。 */
    var gl = back + front, gcx = (front - back) / 2;
    [-1, 1].forEach(function (s4) {
      put(g, BOX, gl, 2.8, 2.2, gcx, boomTop - 1.4, s4 * (hz - 1.6), M.portSteel);
      put(g, BOX, gl, 0.5, 2.6, gcx, boomTop - 2.9, s4 * (hz - 1.6), M.portSteelDeep);
    });
    /* 横向连系杆：每 13 米一道，两根梁才是一根梁而不是两根杆 */
    for (var cx = -back + 4; cx < front - 2; cx += 13) {
      put(g, BOX, 0.6, 0.6, span - 3.2, cx, boomTop - 1.0, 0, M.portSteelDeep);
    }
    /* 前伸端滑轮罩 + 后伸端配重 */
    put(g, BOX, 2.6, 3.2, span - 2.6, front - 1.2, boomTop - 1.3, 0, M.portSteelDeep);
    put(g, BOX, 5.0, 4.6, span - 4.0, -back + 2.4, boomTop - 2.6, 0, M.portConcrete3);

    /* 塔架：两条主柱从陆侧腿顶斜向内上方，顶上有一道横梁。
       塔尖 57 米，比主梁高 11 米——那 11 米就是拉索的力臂。 */
    [-1, 1].forEach(function (s5) {
      rod(-rx, sill + 2.2, s5 * hz, -6, top, s5 * 3.4, 1.5, M.portSteel);
    });
    put(g, BOX, 2.0, 2.0, 7.6, -6, top, 0, M.portSteel);
    /* 拉杆：塔顶 → 主梁两端。这是岸桥的「签名」。 */
    [-1, 1].forEach(function (s6) {
      rod(-6, top - 0.4, s6 * 3.6, front - 2, boomTop - 0.6, s6 * (hz - 1.6), 0.55, M.portSteelDeep);
      rod(-6, top - 0.4, s6 * 3.6, -back + 2, boomTop - 0.6, s6 * (hz - 1.6), 0.55, M.portSteelDeep);
    });
    put(g, CYL, 0.5, 3.4, 0.5, -6, top + 2.6, 0, M.portSteelDeep);

    /* 小车与吊具。六台里只有带 load 的那两台吊着箱子：
       全都吊着就是六串葡萄，全都空着又像模型。 */
    var tx = o.trolley === undefined ? 22 : o.trolley;
    put(g, BOX, 6.4, 2.6, 9.4, tx, boomTop - 4.4, 0, M.portRust);
    put(g, BOX, 2.2, 1.2, 7.0, tx, boomTop - 5.9, 0, M.portSteelDeep);
    if (o.load) {
      for (var cl = 0; cl < 4; cl++) {
        put(g, BOX, 0.22, 8.0, 0.22, tx + (cl < 2 ? -2.2 : 2.2), boomTop - 10.6,
          cl % 2 ? 2.4 : -2.4, M.portSteelDeep);
      }
      put(g, BOX, 12.2, 2.55, 2.45, tx, boomTop - 15.8, 0, M.portCont[0]);
      put(g, BOX, 2.6, 1.0, 2.6, tx, boomTop - 14.0, 0, M.portRust);
    }
  };

  /* 地面铁路：道砟 + 枕木 + 钢轨。
     总平面上「三条平行细线」跟马路中心线没有区别，铁路的识别特征
     是那个等距的齿——所以宁可多几百个盒子，也要把枕木铺出来。 */
  ARCH.railLine = function (g, o, M, rd) {
    var pts = o.pts || [];
    if (pts.length < 2) return;
    var tr = o.tracks || 1, sp = o.space || 5.0;
    var bw = o.ballastW || (5.4 + (tr - 1) * sp);
    var step = o.step || 3.6;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      var dx = bx - ax, dz = bz - az;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var ux = dx / len, uz = dz / len;
      var nx = -uz, nz = ux;
      var mx = (ax + bx) / 2, mz = (az + bz) / 2;
      var ry = Math.atan2(-dz, dx);
      var t, off;
      /* 道床两级：外圈是坡脚（更宽的深色），内圈是砟面。
         一道 20 米宽的灰带在总平面上就是一条路，所以宽度压在 15 米以内。 */
      put(g, BOX, len + 0.8, 0.18, bw + 3.6, mx, 0.09, mz, M.portBallast, ry);
      put(g, BOX, len + 0.8, 0.16, bw, mx, 0.21, mz, M.portBallast, ry);
      for (t = 0; t < tr; t++) {
        off = (t - (tr - 1) / 2) * sp;
        for (var s = 1.2; s < len; s += step) {
          put(g, BOX, 0.34, 0.17, 2.9,
            ax + ux * s + nx * off, 0.36, az + uz * s + nz * off, M.portSleeper, ry);
        }
        [-0.75, 0.75].forEach(function (ro) {
          put(g, BOX, len + 0.4, 0.18, 0.16,
            mx + nx * (off + ro), 0.50, mz + nz * (off + ro), M.rail, ry);
        });
      }
    }
  };

  /* 月台仓：300 米长的转运仓库。
     唯一的设计问题是「东立面」——40 个卷帘门排成一条线，
     线下面是 1.25 米高的站台。站台是必须的：
     没有站台，40 道门就贴在一条与地面齐平的墙上，不像装卸口。 */
  ARCH.freightShed = function (g, o, M, rd) {
    var w = o.w || 280, d = o.d || 300, h = o.h || 17;
    var dock = 1.25;
    put(g, BOX, w, h, d, 0, h / 2, 0, M.portShed);
    /* 勒脚：深一档，3 米高的墙脚才让 17 米的墙有「落地」的感觉 */
    put(g, BOX, w + 0.7, 1.5, d + 0.7, 0, 0.75, 0, M.portConcrete3);
    /* 檐口 */
    put(g, BOX, w + 1.3, 0.95, d + 1.3, 0, h + 0.47, 0, M.portShed2);

    /* 屋面：6 条采光带 + 10 台空调机组。17 米高的屋面从俯视看是一块大板。 */
    for (var i = 0; i < 6; i++) {
      put(g, BOX, 2.4, 0.5, d * 0.92, -w / 2 + w * (i + 0.5) / 6, h + 1.05, 0, M.skylight);
    }
    for (var j = 0; j < 10; j++) {
      put(g, BOX, 7.0, 2.4, 6.0, -w / 2 + 26 + (j % 5) * (w - 52) / 4,
        h + 1.5, (j < 5 ? -1 : 1) * d * 0.30, M.metalDark);
    }
    /* 东立面：竖分格 + 深色高窗带 */
    for (var zz = -d / 2 + 15; zz < d / 2; zz += 30) {
      put(g, BOX, 0.55, h - 1.6, 1.5, w / 2 + 0.1, h / 2, zz, M.portShed2);
    }
    put(g, BOX, 0.30, 1.9, d * 0.95, w / 2 + 0.12, h * 0.80, 0, M.portBand);

    /* 站台 + 雨棚 */
    put(g, BOX, 7.0, dock, d, w / 2 + 3.5, dock / 2, 0, M.portConcrete2);
    put(g, BOX, 4.6, 0.34, d, w / 2 + 2.3, 7.9, 0, M.portShed2);
    for (var c2 = -d / 2 + 12; c2 < d / 2; c2 += 24) {
      put(g, BOX, 0.34, 7.4, 0.34, w / 2 + 4.4, 3.7, c2, M.portSteelDeep);
    }
    /* 40 道卷帘门 + 门边护角 + 站台边的防撞垫 */
    var nd = Math.max(6, Math.round(d / 7.5));
    for (var k = 0; k < nd; k++) {
      var dz = -d / 2 + d * (k + 0.5) / nd;
      put(g, BOX, 0.32, 5.8, 4.4, w / 2 + 0.14, dock + 2.9, dz, M.portDoor);
      put(g, BOX, 0.42, 6.4, 0.45, w / 2 + 0.16, dock + 3.2, dz - 2.4, M.portShed2);
      put(g, BOX, 0.42, 6.4, 0.45, w / 2 + 0.16, dock + 3.2, dz + 2.4, M.portShed2);
      put(g, BOX, 0.55, 0.55, 1.3, w / 2 + 6.9, 0.75, dz, M.portBand);
    }
    /* 北端办公附楼：300 米长的仓库要有一个「头」，否则两端一样，看不出正反。 */
    put(g, BOX, 56, 11, 34, -w / 2 + 40, 5.5, d / 2 + 17, M.portShed);
    put(g, BOX, 56.6, 0.7, 34.6, -w / 2 + 40, 11.35, d / 2 + 17, M.portShed2);
    put(g, BOX, 52, 1.5, 0.4, -w / 2 + 40, 8.4, d / 2 + 34.2, M.portBand);
  };

  /* 推理芯片洁净厂房：全区最大的单一体量，也是唯一一块「白」。
     240×180 的盒子在 600 米外只剩一个信息——它比周围所有东西都平、都白。
     所以立面上只做两件事：一条深色横带，和一圈等距的竖缝。 */
  ARCH.chipFab = function (g, o, M, rd) {
    var w = o.w || 240, d = o.d || 180, h = o.h || 24;
    put(g, BOX, w, h, d, 0, h / 2, 0, M.portFab);
    put(g, BOX, w + 1.6, 1.7, d + 1.6, 0, 0.85, 0, M.portConcrete3);
    /* 深色横带：不是玻璃幕墙，是回风夹层。它把 24 米的墙分成上下两段。 */
    put(g, BOX, w + 0.35, 2.4, d + 0.35, 0, h * 0.66, 0, M.portBand);
    /* 竖缝：每 22 米一道，四边都做 */
    var i;
    for (i = -w / 2 + 11; i < w / 2; i += 22) {
      put(g, BOX, 0.6, h - 2.0, 0.5, i, h / 2, d / 2 + 0.05, M.portFab2);
      put(g, BOX, 0.6, h - 2.0, 0.5, i, h / 2, -d / 2 - 0.05, M.portFab2);
    }
    for (i = -d / 2 + 11; i < d / 2; i += 22) {
      put(g, BOX, 0.5, h - 2.0, 0.6, w / 2 + 0.05, h / 2, i, M.portFab2);
      put(g, BOX, 0.5, h - 2.0, 0.6, -w / 2 - 0.05, h / 2, i, M.portFab2);
    }
    /* 屋面：三层退台的机房。洁净厂的屋顶永远比墙复杂，这是它的破绽，也是它的特征。 */
    put(g, BOX, w * 0.64, 8.5, d * 0.56, -w * 0.06, h + 4.25, 0, M.portFab2);
    put(g, BOX, w * 0.40, 5.5, d * 0.34, -w * 0.06, h + 11.2, 0, M.portFab);
    put(g, BOX, w * 0.64, 0.6, d * 0.56, -w * 0.06, h + 11.2, 0, M.portBand);
    /* 12 座排气塔：四边各三座。12 根竖筒是这块白板上唯一的垂直元素。 */
    var st = [[-w * 0.36, -d * 0.40], [0, -d * 0.40], [w * 0.36, -d * 0.40],
      [-w * 0.36, d * 0.40], [0, d * 0.40], [w * 0.36, d * 0.40],
      [-w * 0.44, 0], [w * 0.44, 0],
      [-w * 0.22, -d * 0.40], [w * 0.22, -d * 0.40],
      [-w * 0.22, d * 0.40], [w * 0.22, d * 0.40]];
    st.forEach(function (p2) {
      put(g, CYL, 4.4, 12, 4.4, p2[0], h + 6, p2[1], M.portTank);
      put(g, CYL, 4.9, 1.0, 4.9, p2[0], h + 12.4, p2[1], M.portSteelDeep);
    });
    /* 入口门厅：主入口给一个玻璃盒子，不然 240 米的白墙没有「门」 */
    put(g, BOX, 44, 11, 12, w * 0.14, 5.5, d / 2 + 5.5, M.portBand);
    put(g, BOX, 48, 0.9, 16, w * 0.14, 11.4, d / 2 + 5.5, M.portFab2);
    /* 化学品罐区：西侧一排，四座 + 围堰 */
    for (var t2 = 0; t2 < 4; t2++) {
      var vz = -d / 2 + 30 + t2 * 30;
      put(g, CYL, 16, 13, 16, -w / 2 - 26, 6.5, vz, M.portTank);
      put(g, CYL, 16.6, 0.8, 16.6, -w / 2 - 26, 13.2, vz, M.portTank2);
      put(g, CYL, 2.0, 4.0, 2.0, -w / 2 - 26 + 6, 14, vz + 6, M.portSteelDeep);
    }
    put(g, BOX, 26, 1.4, 124, -w / 2 - 26, 0.7, -d / 2 + 75, M.portConcrete3);
    /* 管廊：从罐区接到厂房西墙 */
    put(g, BOX, 26, 0.9, 3.6, -w / 2 - 13, 6.2, -d / 2 + 75, M.portSteelDeep);
    [-1, 1].forEach(function (s7) {
      put(g, BOX, 0.6, 6.0, 0.6, -w / 2 - 24, 3.0, -d / 2 + 75 + s7 * 1.4, M.portSteelDeep);
    });
  };

  /* 调度塔：40 米，全区唯一的高层。
     港区的塔不能是写字楼——它要看海，所以塔台必须挑出井道之外、
     四面开窗，顶上还得有一根桅杆（通信与风向）。 */
  ARCH.portTower = function (g, o, M, rd) {
    var h = o.h || 40;
    put(g, BOX, 20, 2.2, 20, 0, 1.1, 0, M.portConcrete2);
    put(g, BOX, 10, h - 16, 10, 0, 2.2 + (h - 16) / 2, 0, M.portConcrete);
    /* 井道四角的竖线：一根方柱在 600 米外只是一条灰线 */
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 1.0, h - 16, 1.0, sx * 4.6, 2.2 + (h - 16) / 2, sz * 4.6, M.portConcrete3);
      });
    });
    /* 塔台：26 米见方，四面玻璃带，底下一圈挑檐 */
    var cy = h - 9;
    put(g, BOX, 27, 1.1, 27, 0, cy - 4.6, 0, M.portSteelDeep);
    put(g, BOX, 26, 7.2, 26, 0, cy, 0, M.portBand);
    put(g, BOX, 26.6, 0.9, 26.6, 0, cy - 3.2, 0, M.portConcrete2);
    put(g, BOX, 28.4, 0.8, 28.4, 0, cy + 4.0, 0, M.portConcrete2);
    /* 窗间柱：每 4.3 米一道，塔台的玻璃才有分格 */
    for (var i = -3; i <= 3; i++) {
      put(g, BOX, 0.5, 7.2, 0.5, i * 4.3, cy, 13.05, M.portConcrete);
      put(g, BOX, 0.5, 7.2, 0.5, i * 4.3, cy, -13.05, M.portConcrete);
      put(g, BOX, 0.5, 7.2, 0.5, 13.05, cy, i * 4.3, M.portConcrete);
      put(g, BOX, 0.5, 7.2, 0.5, -13.05, cy, i * 4.3, M.portConcrete);
    }
    /* 桅杆 + 风向标 */
    put(g, CYL, 1.1, 7, 1.1, 0, cy + 7.8, 0, M.portSteelDeep);
    put(g, BOX, 4.0, 0.22, 0.22, 0, cy + 10.6, 0, M.portSteelDeep);
    put(g, BOX, 1.1, 3.0, 0.3, 13.4, cy + 2.0, 0, M.portSafety);
  };

  /* 集装箱堆场：这一区唯一能大面积上饱和色的东西。
     密排的箱排 + 11 米车道，节奏必须是「密—密—密—空」。
     一开始按 2.7 米一行均匀铺，结果整片是等距横线——那不是堆场，是条纹布。
     现在每一排 8.6 米深、组与组之间 10.4 米车道，
     从 600 米看就是一条条彩色带被灰色车道切开。 */
  ARCH.portYard = function (g, o, M, rd) {
    var w = o.w || 380, d = o.d || 170;
    var bay = 13.2, blockD = 8.6, lane = 10.4;
    put(g, BOX, w * 1.02, 0.36, d * 1.02, 0, 0.18, 0, M.portConcrete2);
    var nBlock = Math.max(1, Math.floor((d + lane) / (blockD + lane)));
    var nBay = Math.max(1, Math.floor(w / bay));
    var b, a, x, zc, lv, hh;
    for (b = 0; b < nBlock; b++) {
      zc = -d / 2 + 3 + b * (blockD + lane) + blockD / 2;
      for (a = 0; a < nBay; a++) {
        x = -w / 2 + a * bay + bay / 2;
        lv = 1 + Math.floor(rd() * 4);
        hh = lv * 2.60;
        var k = (b % 3) * 2 + (a % 7 < 2 ? 1 : 0);
        put(g, BOX, bay - 1.4, hh, blockD - 0.8, x, 0.36 + hh / 2, zc,
          M.portCont[k % M.portCont.length]);
      }
      /* 车道中线 */
      if (b < nBlock - 1) {
        put(g, BOX, w * 0.96, 0.05, 0.22, 0, 0.40, zc + blockD / 2 + lane / 2, M.paint);
      }
    }
    /* 龙门吊（RTG）：四台，骑在两排箱区之间。堆场没有吊机就只是一片彩条。 */
    var gy = 16.5;
    for (var gm = 0; gm < 4; gm++) {
      var gx2 = -w / 2 + w * (gm + 0.5) / 4;
      var gz2 = 0;
      [-1, 1].forEach(function (sx2) {
        [-1, 1].forEach(function (sz2) {
          put(g, BOX, 1.3, gy, 1.3, gx2 + sx2 * 9.5, 0.36 + gy / 2, gz2 + sz2 * 15, M.portSteelDeep);
        });
        put(g, BOX, 2.2, 1.6, 32, gx2 + sx2 * 9.5, gy + 0.9, gz2, M.portSteel);
      });
      put(g, BOX, 21, 1.5, 2.2, gx2, gy + 2.2, gz2 - 6, M.portSteel);
      put(g, BOX, 21, 1.5, 2.2, gx2, gy + 2.2, gz2 + 6, M.portSteel);
      put(g, BOX, 4.0, 3.0, 5.0, gx2, gy + 4.0, gz2, M.portRust);
      put(g, BOX, 3.0, 5.0, 3.0, gx2 - 5.0, gy + 6.5, gz2 - 6, M.portSteelDeep);
    }
    /* 围栏：堆场是有边界的，一道 2 米高的网片就够了 */
    put(g, BOX, w * 1.0, 0.12, 0.12, 0, 2.0, -d / 2 - 1.5, M.steelDeep);
    put(g, BOX, w * 1.0, 0.12, 0.12, 0, 1.2, -d / 2 - 1.5, M.steelDeep);
  };

  /* ============================================================
     D14 蜂巢实验区
     前十三区各有一套语法：塔林、窄巷、厂房、环湖、中轴、站台、
     校园轴线、方环、湖链、枢纽、弧楼、港口。
     这一区只有一条规则：60° 是唯一的角度。
     楼是六棱柱，广场是六边形，环路是六边形，连图幅边线都是六边形。
     ============================================================ */

  /* 蜂巢实验楼：一座六棱柱。
     十八格挤在一起，格子之间留 0.6 米的缝——那 0.6 米就是「蜂巢」的全部证据。
     墙面不做整片玻璃：每 4.2 米一道深色带，竖向每 60° 一道棱。
     远看是「一层一层摞起来的六边形」，近看是「带窗的混凝土」。 */
  ARCH.hiveComb = function (g, o, M, rd) {
    var r = (o.r || 32) - 0.6;
    var h = o.h || 44;
    var by = o.baseY || 0;
    /* 层高 6.4 米，不是 4.2。层高决定的是「从空中看还剩几条带」：
       48 米的格子分成 11 层，在 760 米俯视下每层不到 1 像素，
       1.5 米的绿带和 2.86 米的白墙混成一片中绿——十八格读成一堆绿桶。
       改成 7 层之后，带宽 1.6、墙 4.8，绿占 25%，
       从空中糊出来的明度才对得上「米白的巢」。 */
    var n = Math.max(3, Math.round(h / 5.4));
    var fh = h / n, i, a;

    put(g, CYL6, (r + 0.9) * 2, 0.55, (r + 0.9) * 2, 0, by + 0.28, 0, M.hiveBase, Math.PI / 2);
    put(g, CYL6, r * 2, h, r * 2, 0, by + h / 2, 0, M.hiveShell, Math.PI / 2);
    /* 横带从第二层起。第一层贴地做成实墙——一条玻璃带压在土上，
       整栋楼会读成「悬空的盒子」。 */
    /* 带宽 1.5 米，墙 2.7 米。第一版是反过来的（2.4 带 / 1.8 墙），
       玻璃占了层高的 57%，十八格在 700 米外整片发黑。 */
    for (i = 1; i < n; i++) {
      put(g, CYL6_RING, (r + 0.12) * 2, 2.0, (r + 0.12) * 2, 0, by + i * fh + 1.2, 0,
        M.hiveGlass, Math.PI / 2);
    }
    /* 六条竖棱：格子之间那道缝的延伸，也是全区唯一的竖向线 */
    for (i = 0; i < 6; i++) {
      a = Math.PI / 3 * i;
      put(g, BOX, 0.55, h, 0.55, Math.cos(a) * r * 0.96, by + h / 2,
        Math.sin(a) * r * 0.96, M.hiveTrim, -a);
    }
    /* 压边不能是一个实心六棱柱：它的顶面会把整个屋顶盖成深色。
       第一版这么写，十八格的顶面全是 M.hiveTrim，从空中看是一张深色网格，
       蜂巢读成一堆黑桶。第二版改成「实心压边 + 再盖一块浅板」，
       两块顶面差 1 厘米，远距离下直接 z-fighting——屋顶变成一片黑白横条。
       第三版照 roofClutter 的老办法：六道薄墙拼成女儿墙，屋顶留给楼板本身。 */
    /* 墙的长轴必须落在「边的方向」上，而 a 是边的法线方向——
       直接写 -a，六道墙会全部转 90°，从屋顶伸出去六根黑条。 */
    for (i = 0; i < 6; i++) {
      a = Math.PI / 3 * (i + 0.5);
      put(g, BOX, r * 1.06, 1.2, 0.6, Math.cos(a) * r * 0.885, by + h + 0.6,
        Math.sin(a) * r * 0.885, M.hiveTrim, -(a + Math.PI / 2));
    }
    /* 屋顶设备要少。十八格从空中看是一张蜂巢，
       每个屋顶堆三件设备，蜂巢就变成一张补丁布。 */
    put(g, BOX, r * 0.40, 2.6, r * 0.28, -r * 0.16, by + h + 1.3, r * 0.12, M.hiveMetal);
    put(g, CYL, 2.2, 2.8, 2.2, r * 0.30, by + h + 1.4, -r * 0.24, M.hiveMetal);
    put(g, BOX, 0.8, 2.2, 0.8, -r * 0.40, by + h + 1.1, -r * 0.26, M.hiveTrim);
  };

  /* 蜂窝台地：十八格六棱柱 + 一块共用的六边形台基。
     单格外接半径 R32、中心距 55.4 米——正好是同一种东西挤在一起的距离。
     单独写 hiveComb 十八次也行，但台基会叠十八层，
     而且「蜂窝是一整块」这件事只有在这里才说得清楚。 */
  ARCH.hiveCluster = function (g, o, M, rd) {
    var R = o.r || 32;
    var cx = o.cx || 0, cz = o.cz || 0;
    var cells = o.cells || [];
    /* 台基：R156 的六边形，0.35 米高。比格子自己的台基矮一档，
       格子像「放在台地上」，而不是「台地是格子拼出来的」。 */
    /* 两层台基都从 y=0 起，只差高度。早先内层从 0.34 起、外层顶在 0.35，
       缝 1 厘米——跟屋顶同一个病，只是这回打在场地上，看起来像草地的方格。 */
    put(g, CYL6, (o.pad || 156) * 2, 0.5, (o.pad || 156) * 2, cx, 0.25, cz,
      M.hiveBase, Math.PI / 2);
    put(g, CYL6, (o.pad || 156) * 2 - 7, 0.62, (o.pad || 156) * 2 - 7, cx, 0.31, cz,
      M.hivePave, Math.PI / 2);
    cells.forEach(function (c) {
      var cg = new THREE.Group();
      cg.position.set(cx + 1.5 * R * c[0], 0, cz + R * Math.sqrt(3) * (c[1] + c[0] / 2));
      ARCH.hiveComb(cg, { r: R, h: c[2], baseY: 0.35 }, M, rd);
      g.add(cg);
    });
  };

  /* 档案锥台：H4 数据污染博物馆。
     十八格蜂巢里，只有正中这一格不是柱子，是一根从巢里升起来的塔。
     底 R32、顶 R19、96 米、十段——段间那 1.4 米的暗槽是「档案层架」的读法：
     一层一层退进去，每一层都能抽出来。 */
  ARCH.archiveFrustum = function (g, o, M, rd) {
    var r0 = o.r0 || 32, r1 = o.r1 || 19, h = o.h || 96;
    var bands = o.bands || 10, gap = 1.4;
    var base = 3.2;
    var segH = (h - base - gap * (bands - 1)) / bands;
    /* 从台基里 5 厘米起——段底盖和台基顶盖同高会共面打仗，边上出一圈亮线 */
    var y = base - 0.05, i;

    put(g, CYL6, (r0 + 1.8) * 2, base, (r0 + 1.8) * 2, 0, base / 2, 0, M.hiveBase, Math.PI / 2);
    for (i = 0; i < bands; i++) {
      var ra = r0 + (r1 - r0) * (i / bands);
      var rb = r0 + (r1 - r0) * ((i + 1) / bands);
      /* 每一段的锥度都不同，只能用独立几何——scale 做不出变截面。
         材质必须 flatShading：六棱柱用默认的平滑法线，六个面会被插值成一圈渐变，
         96 米的塔读成一只圆鼓，「六边形」这件事全丢。 */
      put(g, new THREE.CylinderGeometry(rb, ra, segH, 6), 1, 1, 1, 0, y + segH / 2, 0,
        i % 2 ? M.hiveShellF2 : M.hiveShellF, Math.PI / 2);
      y += segH;
      if (i < bands - 1) {
        /* 暗槽的半径再收 1.25 米。不收的话十段退台在远处就是一根直筒：
           每段只退 1.3 米，600 米外差不到一个像素，全靠这道槽读出「有层」。
           必须是开口筒——带端盖的话，它的上下盖正好和相邻段的端盖同高共面，
           那一圈锯齿就是两块六边形抢同一层像素打出来的。 */
        put(g, new THREE.CylinderGeometry(rb - 1.25, rb - 1.25, gap, 6, 1, true), 1, 1, 1, 0,
          y + gap / 2, 0, M.hiveTrim, Math.PI / 2);
        y += gap;
      }
    }
    /* 锥台顶同理：六道女儿墙，不做整块压顶 */
    for (i = 0; i < 6; i++) {
      var ca = Math.PI / 3 * (i + 0.5);
      put(g, BOX, r1 * 1.08, 1.5, 0.6, Math.cos(ca) * r1 * 0.885, h + 0.75,
        Math.sin(ca) * r1 * 0.885, M.hiveTrim, -(ca + Math.PI / 2));
    }
    /* 塔冠：顶上压一块 2.2 米的实心金属板，96 米的锥台就读成一只水塔。
       换成退进一圈的玻璃阅览层 + 一道挑檐——最高层是「能进去看档案的地方」，
       不是储水罐。这一句是这一区唯一一处「靠造型说明用途」的让步。 */
    put(g, CYL6, r1 * 1.55, 2.6, r1 * 1.55, 0, h + 2.8, 0, M.hiveGlass, Math.PI / 2);
    put(g, CYL6, r1 * 1.74, 0.55, r1 * 1.74, 0, h + 4.37, 0, M.hiveShell2, Math.PI / 2);
    /* 桅杆要 1.4 米粗、6.5 米高才读成天线；0.9 米的在 400 米外是 1 个像素，
       看上去像板面上的一根脏线。 */
    put(g, CYL, 1.4, 6.5, 1.4, 0, h + 7.9, 0, M.hiveTrim);
    put(g, CYL, 2.2, 0.5, 2.2, 0, h + 4.9, 0, M.hiveMetal);
  };

  /* 六边形广场：观察井。
     全区唯一一处「往下看」的地方，也是唯一一块有铺装的空地。
     井不真的挖——地面是一整块 ShapeGeometry，开洞要动主流程；
     一个深色圆盘加一圈栏杆，在 600 米外读到的仍然是「这里有个洞」。 */
  ARCH.hexPlaza = function (g, o, M, rd) {
    var r = o.r || 84;
    var i, a;
    put(g, CYL6, (r + 4) * 2, 0.52, (r + 4) * 2, 0, 0.26, 0, M.hivePave, Math.PI / 2);
    /* 六条引导带：从井心指向六个顶点。广场上不划线就是一块空地，
       划线之后「从这里往下看」才是中心。 */
    for (i = 0; i < 6; i++) {
      a = Math.PI / 3 * i;
      put(g, BOX, r * 0.92, 0.06, 1.7, Math.cos(a) * r * 0.46, 0.56, Math.sin(a) * r * 0.46,
        M.hiveJoint, -a);
    }
    if (o.plain) return;
    put(g, CYL, 37.6, 0.40, 37.6, 0, 0.72, 0, M.hiveJoint);
    put(g, CYL, 34.0, 0.16, 34.0, 0, 0.92, 0, M.hiveTrim);
    put(g, CYL, 30.0, 0.22, 30.0, 0, 0.98, 0, M.asphalt);
    /* 栏板：十二根立柱 + 一道环形扶手 */
    for (i = 0; i < 12; i++) {
      a = Math.PI / 6 * i;
      put(g, BOX, 0.28, 1.15, 0.28, Math.cos(a) * 18.4, 1.40, Math.sin(a) * 18.4, M.hiveMetal);
    }
    var ring = new THREE.TorusGeometry(18.4, 0.14, 6, 40);
    ring.rotateX(Math.PI / 2);
    put(g, ring, 1, 1, 1, 0, 1.98, 0, M.hiveMetal);
  };

  /* 半埋绿玻璃实验舱。
     露出 4 米——比一层楼矮，比围墙高。这个高度是故意的：
     它既不能站人，也不能种树，只能读成「地下面还有一个东西」。 */
  ARCH.labPod = function (g, o, M, rd) {
    var r = o.r || 15, ex = o.expose || 4.2;
    /* 土坡：比舱大 9 米。半埋的舱必须有一圈土，
       直接插在平地上就是一个绿色的罐子。 */
    put(g, CYL, (r + 9.5) * 2, 2.5, (r + 9.5) * 2, 0, 1.25, 0, M.hiveSoil);
    put(g, CYL, (r + 7.0) * 2, 0.7, (r + 7.0) * 2, 0, 2.6, 0, M.hiveSoil);
    put(g, CYL, r * 2, ex + 2.4, r * 2, 0, ex / 2, 0, M.hiveGlass);
    /* 三道箍：玻璃筒没有箍就是一根光管，看不出直径 */
    for (var i = 1; i <= 3; i++) {
      put(g, CYL, (r + 0.26) * 2, 0.34, (r + 0.26) * 2, 0, ex * i / 3, 0, M.hiveShell2);
    }
    var sph = new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    put(g, sph, 1, 0.20, 1, 0, ex + 1.1, 0, M.hiveGlass2);
  };

  /* AI 大厂总部。三条硬约束，缺一条就不成立：
     ① 有名字——塔身竖排字（从上往下读）+ 塔顶双向横匾；
     ② 比区内其他任何东西都高：本区次高是 96 米的锥台，三座塔是 182／196／214；
     ③ 塔身不能是一根光柱：竖向遮阳肋 + 每 30 米一道结构带，
        600 米外才读得出「这是玻璃塔」，而不是「一根白条」。 */
  ARCH.aiTower = function (g, o, M, rd) {
    var h = o.h || 200;
    var v = o.variant || 0;
    var podH = v === 0 ? 14 : 12;
    var podW = o.w || 100, podD = o.d || 100;
    var mainW = 42, mainZ = 0;
    var i;

    put(g, BOX, podW, 0.55, podD, 0, 0.27, 0, M.hiveBase);
    put(g, BOX, podW - 3, podH, podD - 3, 0, podH / 2, 0, M.aiPodium);
    put(g, BOX, podW - 11, podH - 4.4, podD - 11, 0, (podH - 4.4) / 2 + 1.4, 0, M.shopfront);
    put(g, BOX, podW, 0.8, podD, 0, podH + 0.4, 0, M.aiCrown);
    /* 入口雨棚：一片挑出 7 米的板。100 米宽、14 米高的裙房没有雨棚，
       就是一块台子，读不出门开在哪。 */
    put(g, BOX, 26, 0.7, 8, 0, podH * 0.64, -podD / 2 - 3.5, M.aiCrown);

    var mainH = h - podH - 12;

    if (v === 0) {
      /* 双塔：主塔 214、副塔 0.78，连桥跨 26 米。
         两塔轴线间距 60 米——再近，连桥比塔身还短，读成一栋被划了两刀。 */
      mainW = 42; mainZ = -30;
      var th = mainH, tw = mainW, tz = mainZ;
      put(g, BOX, tw, th, tw, 0, podH + th / 2, tz, o.mat);
      var ribs = Math.round(tw / 4.2);
      for (i = 0; i <= ribs; i++) {
        var p = -tw / 2 + tw * i / ribs;
        put(g, BOX, 0.62, th, 1.0, p, podH + th / 2, tz + tw / 2 + 0.42, M.aiMullion);
        put(g, BOX, 0.62, th, 1.0, p, podH + th / 2, tz - tw / 2 - 0.42, M.aiMullion);
        put(g, BOX, 1.0, th, 0.62, tw / 2 + 0.42, podH + th / 2, tz + p, M.aiMullion);
        put(g, BOX, 1.0, th, 0.62, -tw / 2 - 0.42, podH + th / 2, tz + p, M.aiMullion);
      }
      for (var f = 1; f * 30 < th; f++) {
        put(g, BOX, tw + 1.8, 1.0, tw + 1.8, 0, podH + f * 30, tz, M.aiCrown);
      }
      /* 冠：设备层 + 收一圈的顶盖。齐平的顶盖会把 214 米读成一根方管。 */
      put(g, BOX, tw * 0.92, 8.0, tw * 0.92, 0, h - 4, tz, M.aiCrown);
      put(g, BOX, tw * 0.56, 4.0, tw * 0.56, 0, h - 10, tz, M.aiMullion);

      var sh2 = th * 0.78, sw = 40, sz = 30;
      put(g, BOX, sw, sh2, sw, 0, podH + sh2 / 2, sz, o.mat);
      for (i = 0; i <= 8; i++) {
        var q = -sw / 2 + sw * i / 8;
        put(g, BOX, 0.55, sh2, 0.95, q, podH + sh2 / 2, sz + sw / 2 + 0.38, M.aiMullion);
        put(g, BOX, 0.55, sh2, 0.95, q, podH + sh2 / 2, sz - sw / 2 - 0.38, M.aiMullion);
      }
      put(g, BOX, sw + 1.5, 0.9, sw + 1.5, 0, podH + sh2 * 0.55, sz, M.aiCrown);
      put(g, BOX, sw * 0.9, 6.0, sw * 0.9, 0, podH + sh2 + 3.0, sz, M.aiCrown);

      var by = podH + th * 0.40;
      put(g, BOX, 11, 4.8, 26, 0, by, 0, M.aiMullion);
      put(g, BOX, 11.8, 0.55, 26.8, 0, by + 2.75, 0, M.aiCrown);
      put(g, BOX, 11.8, 0.55, 26.8, 0, by - 2.75, 0, M.aiCrown);
    } else if (v === 1) {
      /* 切角塔：正八边形平面。芯片厂的总部是一块，不是几栋拼的。
         芯片带每 28 米一道，把 196 米切成七段——读法是「封装好的几层」。 */
      var tw2 = o.tw || 60, th2 = mainH;
      put(g, new THREE.CylinderGeometry(tw2 / 2, tw2 / 2, th2, 8), 1, 1, 1, 0,
        podH + th2 / 2, 0, o.mat, Math.PI / 8);
      for (var f2 = 1; f2 * 28 < th2; f2++) {
        put(g, new THREE.CylinderGeometry(tw2 / 2 + 1.0, tw2 / 2 + 1.0, 2.6, 8), 1, 1, 1, 0,
          podH + f2 * 28, 0, M.aiCrown, Math.PI / 8);
      }
      /* 竖缝贴着八个面：面在 r·cos(22.5°) 上，写在 r 上会飘出去 */
      for (i = 0; i < 16; i++) {
        var aa = Math.PI / 8 * i;
        put(g, BOX, 0.62, th2, 0.62, Math.cos(aa) * (tw2 / 2 - 0.5), podH + th2 / 2,
          Math.sin(aa) * (tw2 / 2 - 0.5), M.aiMullion, -aa);
      }
      put(g, new THREE.CylinderGeometry(tw2 / 2 * 0.90, tw2 / 2 * 0.90, 7, 8), 1, 1, 1, 0,
        h - 3.5, 0, M.aiCrown, Math.PI / 8);
      put(g, new THREE.CylinderGeometry(tw2 / 2 * 0.55, tw2 / 2 * 0.55, 5, 8), 1, 1, 1, 0,
        h - 9.5, 0, M.aiMullion, Math.PI / 8);
      mainW = tw2 * 0.924; mainZ = 0;
    } else {
      /* 三级退台：把这一区的「重复」写进剖面。
         三段的宽高比 1.0/0.82/0.64 与 0.42/0.32/0.26——
         退台不是随便切三刀，每一段都要比下一段矮且窄，才有「往上收」的势。 */
      var tw3 = o.tw || 56;
      var tiers = [[1.0, 0.42], [0.82, 0.32], [0.64, 0.26]];
      var yy = podH;
      tiers.forEach(function (t2) {
        var bw = tw3 * t2[0], bh = mainH * t2[1];
        put(g, BOX, bw, bh, bw, 0, yy + bh / 2, 0, o.mat);
        var nr = Math.max(4, Math.round(bw / 5.2));
        for (var k = 0; k <= nr; k++) {
          var px2 = -bw / 2 + bw * k / nr;
          put(g, BOX, 0.6, bh, 1.0, px2, yy + bh / 2, bw / 2 + 0.36, M.aiMullion);
          put(g, BOX, 0.6, bh, 1.0, px2, yy + bh / 2, -bw / 2 - 0.36, M.aiMullion);
          put(g, BOX, 1.0, bh, 0.6, bw / 2 + 0.36, yy + bh / 2, px2, M.aiMullion);
          put(g, BOX, 1.0, bh, 0.6, -bw / 2 - 0.36, yy + bh / 2, px2, M.aiMullion);
        }
        put(g, BOX, bw + 2.2, 1.0, bw + 2.2, 0, yy + bh - 0.5, 0, M.aiCrown);
        yy += bh;
      });
      /* 斜切冠：一块转 9° 的薄板。全区唯一一条斜线，
         也是「言枢」这个名字唯一说得通的地方——它是这一区里唯一不讲 60° 的构件。 */
      var cap = put(g, BOX, tw3 * 0.72, 1.5, tw3 * 0.72, 0, yy + 1.3, 0, M.aiCrown);
      cap.rotation.x = 0.16;
      put(g, BOX, 3.2, 11, 3.2, tw3 * 0.17, yy + 5.5, 0, M.aiMullion);
      mainW = tw3 * 0.66; mainZ = 0;
    }

    /* 竖排字：贴在塔身朝西那个立面。
       这一面朝城市——三座塔的 rot 都按「正面朝区中心」算过，
       所以从城里来的第一眼，看到的就是这列字。
       白字必须压一条深色灯箱槽：塔身是冷白幕墙，
       同一明度的白字在 600 米外只剩一条白痕。 */
    if (o.brand && o.brand.name) {
      var nm = o.brand.name, nn = nm.length;
      var gh = o.signH || 13;
      var bwS = gh + 1.9, bhS = gh * nn + 1.9;
      var sy = podH + (h - podH) * 0.40;
      var tex = vSignTexture(nm, o.brand.tone || "#eef3f4");
      var smat2 = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.48,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.22 });
      /* 两面都挂。塔的 rot 是「正面朝区中心」算的，只挂一面的话，
         从默认机位（在城里）看到的是背面，名字全在背后——
         「有名字」这条约束就白写了。 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.9, bhS + 1.6, bwS + 1.6, sd * (mainW / 2 + 0.5), sy + bhS / 2, mainZ,
          M.aiCrown);
        var pl2 = new THREE.Mesh(new THREE.PlaneGeometry(bwS, bhS), smat2);
        pl2.position.set(sd * (mainW / 2 + 0.98), sy + bhS / 2, mainZ);
        pl2.rotation.y = sd < 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(pl2);
      });
    }
  };

  /* ------------------------------------------------------------
     云门商务区（D16）：云门 / 繁华裙房 / 幕墙塔 / 三级台地 / 倒影池 / 地铁厅
     全城唯一站在城界上的区，也是全城唯一的 0° 正交网。
     它的语言只有三样：一条笔直到底的大道、从裙房里长出来的幕墙塔、
     以及北面那道「门」。所以这一区最重的构件不是楼，是门楣。
     ------------------------------------------------------------ */

  /* 云门：两座塔 + 一道 26 米高的横梁 = 一道 68 × 140 的门。
     为什么不是「一对双子塔」：两栋楼并排，从城里看只是双子塔；
     只有横梁把净距锁死，中间那个洞才读成门。所以横梁是门楣，不是连桥。
     东塔 210、西塔 196——全城第二、第三。第一留给 D01 的深智塔，
     这一区的定位是「仅次于市中心」，不是取代它。 */
  ARCH.yunmen = function (g, o, M, rd) {
    var tw = o.w || 58;
    var gap = o.gap === undefined ? 68 : o.gap;
    var hE = o.h || 210, hW = o.h2 || 196;
    var by = o.beamY === undefined ? 140 : o.beamY;
    var bh = o.beamH || 26;
    var cxe = (gap + tw) / 2, cxw = -cxe;
    var bw2 = gap + tw * 0.72;
    var mat = o.mat || M.ymStone2;
    var i, f;

    [[cxe, hE], [cxw, hW]].forEach(function (t) {
      var cx2 = t[0], th = t[1];
      /* 台基：3.4 米深色基座 + 一道浅色压边。塔要「压」在地上，不是插进去 */
      put(g, BOX, tw + 10, 3.4, tw + 10, cx2, 1.7, 0, M.ymStone3);
      put(g, BOX, tw + 11.6, 0.55, tw + 11.6, cx2, 3.72, 0, M.ymMullion);
      put(g, BOX, tw, th - 3.4, tw, cx2, 3.4 + (th - 3.4) / 2, 0, mat);
      /* 四面竖肋：7 米一道。4.6 米一道做出来是条形码，7 米才读得出层 */
      var nr = Math.round(tw / 7);
      for (i = 0; i <= nr; i++) {
        var p = -tw / 2 + tw * i / nr;
        put(g, BOX, 0.85, th - 3.4, 1.2, cx2 + p, 3.4 + (th - 3.4) / 2, tw / 2 + 0.45, M.ymMullion);
        put(g, BOX, 0.85, th - 3.4, 1.2, cx2 + p, 3.4 + (th - 3.4) / 2, -tw / 2 - 0.45, M.ymMullion);
        put(g, BOX, 1.2, th - 3.4, 0.85, cx2 + tw / 2 + 0.45, 3.4 + (th - 3.4) / 2, p, M.ymMullion);
        put(g, BOX, 1.2, th - 3.4, 0.85, cx2 - tw / 2 - 0.45, 3.4 + (th - 3.4) / 2, p, M.ymMullion);
      }
      /* 设备层：每 32 米一道。只有竖肋的话，200 米的塔读成一把梳子 */
      for (f = 1; f * 32 < th - 16; f++) {
        put(g, BOX, tw + 2.0, 1.3, tw + 2.0, cx2, 3.4 + f * 32, 0, M.ymLight2);
      }
      /* 塔冠：收一圈 9 米 + 一块设备罩。齐平顶盖会把塔读成方管 */
      put(g, BOX, tw - 5, 9, tw - 5, cx2, th - 4.5, 0, M.ymLight);
      put(g, BOX, tw - 13, 5, tw - 13, cx2, th - 11.5, 0, M.ymMullion);
    });

    /* 横梁 140–166：门楣。宽过净距伸进两塔，深 44（比塔身浅 14 米） */
    put(g, BOX, bw2, bh, 44, 0, by + bh / 2, 0, M.ymDark);
    put(g, BOX, bw2 + 0.6, 1.6, 44.6, 0, by + bh - 0.8, 0, M.ymMullion);
    /* 门楣下沿的发光带：门洞的顶边必须有一条亮线，
       否则 140 米高处那道暗口子在逆光里完全消失 */
    put(g, BOX, bw2, 1.0, 44.8, 0, by + 0.5, 0, M.ymBand);
    /* 梁底两块斜腋：把梁和塔身焊在一起，不然横梁像搁在两根柱子上 */
    [-1, 1].forEach(function (sd) {
      var br = put(g, BOX, 24, 4.0, 40, sd * (gap / 2 + 9), by - 1.0, 0, M.ymDark);
      br.rotation.z = sd * 0.36;
    });

    /* 门洞地面：一块深色铺装，把「穿过」落到地上 */
    put(g, BOX, gap, 0.22, 130, 0, 0.11, 0, M.ymPave2);

    /* 品牌。三处都挂：门楣（南北两面的横匾，64 × 20）、
       东塔塔身（南北两面的竖排字）。这就是「有名字」——从城里来、
       从门外回，读到的都是同一块牌子。 */
    if (o.brand) {
      var nm = o.brand.name || "天衡";
      var en = o.brand.en || "TIANHENG";
      var tone = o.brand.tone || "#dceaf4";
      var ptex = signTexture(nm, en, tone);
      var pmat = new THREE.MeshStandardMaterial({
        map: ptex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: 0.42,
        roughness: 0.62, metalness: 0.05, envMapIntensity: 0.3 });
      var pw = gap - 4, phh = bh - 6;
      [1, -1].forEach(function (sd) {
        var pl = new THREE.Mesh(new THREE.PlaneGeometry(pw, phh), pmat);
        pl.position.set(0, by + bh / 2, sd * 22.5);
        if (sd < 0) pl.rotation.y = Math.PI;
        g.add(pl);
      });
      var vtex = vSignTexture(nm, tone);
      var vmat = new THREE.MeshStandardMaterial({
        map: vtex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: vtex, emissiveIntensity: 0.50,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.2 });
      var vc = 12, vw = vc + 1.8, vh = vc * nm.length + 1.8;
      /* 两塔都挂、南北两面都挂：门是对称的，一边有字一边没有，
         正立面立刻读成「歪了」。这是这一区唯一允许的重复。 */
      [[cxe, 118], [cxw, 110]].forEach(function (tc) {
        [-1, 1].forEach(function (sd) {
          put(g, BOX, vw + 1.4, vh + 1.4, 1.0, tc[0], tc[1], sd * (tw / 2 + 0.4), M.ymDark);
          var pl2 = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), vmat);
          pl2.position.set(tc[0], tc[1], sd * (tw / 2 + 0.95));
          if (sd < 0) pl2.rotation.y = Math.PI;
          g.add(pl2);
        });
      });
    }
  };

  /* 繁华裙房：24–40 米，把地块铺满。
     「繁华」在这一区全靠它——塔只有七座，街面的密度全在裙房上。
     所以必须有四样：6.6 米通高商业玻璃、3.2 米挑檐雨棚、
     雨棚下的暖白灯箱带、屋顶设备与灌木。缺一样就退化成一块台子。 */
  ARCH.cbdBlock = function (g, o, M, rd) {
    var w = o.w || 200, d = o.d || 180, h = o.h || 34;
    var gh = o.gh || 6.6;
    var wall = o.mat || M.ymStone;
    var i;

    /* 台基：抬 0.7 米，整块裙房才「站」在铺装上 */
    put(g, BOX, w + 1.8, 0.7, d + 1.8, 0, 0.35, 0, M.ymStone3);
    put(g, BOX, w, h - gh, d, 0, gh + (h - gh) / 2, 0, wall);
    /* 横向窗带：每 4.4 米一道，1.4 米高。
       1.9 米窗带 / 3.6 米层高（占 53%）做出来是「停车楼」——
       深色带子一道压一道，读成开敞楼板，不是办公楼。1.4 / 4.4（32%）
       才是写字楼的玻璃比例，条纹也不会密成百叶。 */
    var nfl = Math.floor((h - gh - 2.2) / 4.4);
    for (i = 0; i < nfl; i++) {
      /* 玻璃带必须「凹进去」：凸出 0.09 米时，2 米高的带子侧面在斜俯视里
         全部落在自阴影里，四条街的立面叠起来读成一条条深色百叶。
         压到墙内 0.1 米，窗就是窗，只有一条暗缝。 */
      put(g, BOX, w - 0.2, 1.5, d - 0.2, 0, gh + 1.75 + i * 4.4, 0, M.ymGlass);
    }
    /* 竖向壁柱：每 9 米一道，从商业层顶通到女儿墙。
       只有横向窗带的立面，无论颜色多浅，400 米外都读成百叶/停车楼——
       横竖必须交织，那才是办公楼。壁柱用墙色、凸 0.12 米，
       窗带被打断成一格格窗，立面才有「柱距」这个尺度。 */
    var nv = Math.max(4, Math.round(w / 9)), nvd = Math.max(3, Math.round(d / 9));
    for (i = 0; i <= nv; i++) {
      var pvx = -w / 2 + w * i / nv;
      put(g, BOX, 1.5, h - gh + 0.4, 1.1, pvx, gh + (h - gh) / 2, d / 2 + 0.2, wall);
      put(g, BOX, 1.5, h - gh + 0.4, 1.1, pvx, gh + (h - gh) / 2, -d / 2 - 0.2, wall);
    }
    for (i = 1; i < nvd; i++) {
      var pvz = -d / 2 + d * i / nvd;
      put(g, BOX, 1.1, h - gh + 0.4, 1.5, w / 2 + 0.2, gh + (h - gh) / 2, pvz, wall);
      put(g, BOX, 1.1, h - gh + 0.4, 1.5, -w / 2 - 0.2, gh + (h - gh) / 2, pvz, wall);
    }
    /* 四角石墩：2.8 见方通高。四角立住，整块裙房才是「楼」，否则是一个贴了横条的盒子 */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      put(g, BOX, 2.8, h - gh + 1.0, 2.8, q[0] * (w / 2 - 0.5),
        gh + (h - gh) / 2, q[1] * (d / 2 - 0.5), M.ymStone3);
    });
    /* 一层玻璃：退 1.2 米。不退的话玻璃和石材在一个平面上，读不出来 */
    put(g, BOX, w - 2.4, gh - 0.6, d - 2.4, 0, (gh - 0.6) / 2 + 0.6, 0, M.ymGlassShop);

    /* 商业柱：8 米一道，四周一圈。柱是裙房唯一的竖线 */
    var nx = Math.max(4, Math.round(w / 10)), nz = Math.max(4, Math.round(d / 10));
    for (i = 0; i <= nx; i++) {
      var px = -w / 2 + w * i / nx;
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 1.5, gh, 1.5, px, gh / 2, sz * (d / 2 - 0.6), M.ymStone2);
      });
    }
    for (i = 1; i < nz; i++) {
      var pz = -d / 2 + d * i / nz;
      [-1, 1].forEach(function (sx) {
        put(g, BOX, 1.5, gh, 1.5, sx * (w / 2 - 0.6), gh / 2, pz, M.ymStone2);
      });
    }

    /* 一层商业界面：一间挨一间的铺子，不是一道通长灯箱。
       旧做法是「一道 2.1 米高的连续灯箱带 + 一圈通长雨棚」：
       四十米外是一条亮线，近景是一整块无缝白板，整栋裙房读成一个售楼处。
       真实的街墙是「分间」的——每间有自己宽度的招牌、自己的底色、
       自己的雨棚进深，偶尔伸出一块竖招。繁华感来自界面的**不连续**，
       不是来自亮度。这也是低机位「像新区」的真正原因：不是人少，是没有店。 */
    var smats = M.ymShop, ns = smats.length;
    [0, 1].forEach(function (axis) {        /* 0 = ±z 面（面宽 w），1 = ±x 面（面宽 d） */
      var L = axis ? d : w, hd = axis ? w / 2 : d / 2;
      var ry = axis ? Math.PI / 2 : 0;
      var nbay = Math.max(3, Math.round(L / 12.5));
      var bw = L / nbay;
      [-1, 1].forEach(function (sd) {
        for (var b2 = 0; b2 < nbay; b2++) {
          var u = -L / 2 + bw * (b2 + 0.5);
          var nx = axis ? sd : 0, nz = axis ? 0 : sd;
          /* 墙面上的点 */
          var wx = axis ? sd * hd : u, wz = axis ? u : sd * hd;
          var sm = smats[Math.floor(rd() * ns)];
          /* 招牌板：贴在**雨棚以上**、一层顶板以下那道墙上，贴墙外 0.16 米。
             这是关键——招牌放在雨棚下面，雨棚进深 2.4 米、牌面高 1.1 米，
             任何高过 10° 的视线都被自家雨棚挡死，鸟瞰图上一条都看不见。
             放到雨棚上沿（+6.0 米）之后，街上看得到、天上也看得到。
             宽度取开间的 76%–92%，高度浮动 ±0.06：对齐的是柱网，不是招牌。 */
          var sw2 = bw * (0.76 + rd() * 0.16);
          var sy = gh - 0.50 + (rd() - 0.5) * 0.12;
          /* 1.45 米高的招牌带。1.15 米在 34–56 米的楼上看就是一条线，
             压低到街上才读得出「这一排是铺子」——CBD 的招牌尺度本来就这样。 */
          put(g, BOX, sw2, 1.45, 0.32, wx + nx * 0.16, sy, wz + nz * 0.16, sm, ry);
          /* 雨棚：每间独立，从店面玻璃（内退 1.25）一直挑到墙外 1.9–2.9 米。
             只从墙外起挑的话，它与玻璃之间空 1.3 米，会读成一块悬空的板。 */
          var ca = 1.9 + rd() * 1.0;
          var cd2 = ca + 1.25, cc2 = (ca - 1.25) / 2;
          put(g, BOX, bw * 0.99, 0.24, cd2, wx + nx * cc2, gh - 1.90,
            wz + nz * cc2, rd() < 0.5 ? M.ymMullion : M.ymCanopy, ry);
          /* 雨棚檐口：0.42 米高的实心檐板。原来只有一道 9 厘米的灯带，
             从街上根本看不出「头上有雨棚」，只看到一条亮线。
             檐口立起来之后，一层才有那条压住全街的深色横线。 */
          put(g, BOX, bw * 0.99, 0.42, 0.20, wx + nx * (ca + 0.04), gh - 2.05,
            wz + nz * (ca + 0.04), M.ymDark, ry);
          /* 橱窗里的光：不是每间都亮，四成铺子透出暖光。
             必须贴在玻璃**外表面**（内退 1.2 → 1.12）：
             一层玻璃是一个实心体块，把「亮窗」放在它内侧等于放在墙里，
             什么也看不见；放在 0.95 又跑到玻璃外面，成了一张浮在人行道上的米色板。
             1.12 正好压在玻璃面上，读成「开着灯的店面」。 */
          if (rd() < 0.62) {
            put(g, BOX, bw * 0.58, 2.6, 0.12, wx - nx * 1.12, 1.95,
              wz - nz * 1.12, M.ymLit, ry);
          }
          /* 竖招：三成开间伸一块，高 2.5 米，向外挑 1.25 米。
             低机位里最好认的「这是商业街」就是这些垂直于墙面的小板。 */
          if (rd() < 0.38) {
            var bu = (rd() < 0.5 ? -1 : 1) * bw * 0.30;
            var bx2 = wx + (axis ? 0 : bu) + nx * 1.18;
            var bz2 = wz + (axis ? bu : 0) + nz * 1.18;
            put(g, BOX, 0.16, 3.0, 1.35, bx2, gh + 1.35, bz2, sm, ry);
            put(g, BOX, 0.08, 0.10, 0.9, wx + (axis ? 0 : bu) + nx * 0.55,
              gh + 2.80, wz + (axis ? bu : 0) + nz * 0.55, M.ymDark, ry);
          }
        }
      });
    });

    /* 女儿墙 + 压顶。
       压顶只做四道窄条——用一块 w×d 的板铺满屋面，整块裙房从高空看就是一块深灰板，
       这一版第一次渲染就是这个错：十二块裙房全变成十二个深色矩形。 */
    put(g, BOX, w + 1.2, 1.5, d + 1.2, 0, h + 0.75, 0, M.ymStone2);
    put(g, BOX, w + 1.6, 0.3, 0.9, 0, h + 1.55, d / 2 + 0.35, M.ymStone3);
    put(g, BOX, w + 1.6, 0.3, 0.9, 0, h + 1.55, -d / 2 - 0.35, M.ymStone3);
    put(g, BOX, 0.9, 0.3, d + 1.6, w / 2 + 0.35, h + 1.55, 0, M.ymStone3);
    put(g, BOX, 0.9, 0.3, d + 1.6, -w / 2 - 0.35, h + 1.55, 0, M.ymStone3);
    /* 屋面：一块铺装板。空屋顶在 1200 米外是一块深色洞 */
    put(g, BOX, w - 2, 0.22, d - 2, 0, h + 0.11, 0, M.ymRoof);
    /* 设备：几组机组。屋顶全空的话，从高空看是一块水泥台 */
    for (i = 0; i < 4; i++) {
      put(g, BOX, 9, 2.6, 7, (rd() - 0.5) * (w - 40), h + 1.3,
        (rd() - 0.5) * (d - 40), M.ymMullion);
      put(g, CYL, 5, 0.4, 5, (rd() - 0.5) * (w - 40), h + 2.9,
        (rd() - 0.5) * (d - 40), M.ymDark);
    }
    /* 屋顶加建：一块加建体，6–11 米高，宽度占屋面一半上下。
       十五块裙房全是平屋顶，从空中看就是十五块瓷砖。 */
    if (o.addon !== false) {
      var aw = w * (0.34 + rd() * 0.18), ad = d * (0.30 + rd() * 0.18);
      var ax = (rd() - 0.5) * (w - aw) * 0.6, az = (rd() - 0.5) * (d - ad) * 0.6;
      var ah = 6 + rd() * 5;
      put(g, BOX, aw, ah, ad, ax, h + ah / 2 + 0.2, az, M.ymStone2);
      put(g, BOX, aw + 0.9, 0.55, ad + 0.9, ax, h + ah + 0.5, az, M.ymStone3);
      put(g, BOX, aw - 2.4, 1.4, 0.4, ax, h + ah * 0.55, az + ad / 2 + 0.1, M.ymGlass);
    }
    /* 屋面设备带：两道通长的检修道 + 一组光伏。
       屋顶只有「一个加建盒 + 几个绿点」的话，从 300 米外看还是空地。 */
    put(g, BOX, w * 0.82, 0.24, 2.6, 0, h + 0.34, d * 0.30, M.ymStone3);
    put(g, BOX, w * 0.82, 0.24, 2.6, 0, h + 0.34, -d * 0.30, M.ymStone3);
    for (i = 0; i < 3; i++) {
      var qx = (rd() - 0.5) * (w * 0.6), qz = (rd() - 0.5) * (d * 0.6);
      var pv = put(g, BOX, 12, 0.28, 8, qx, h + 1.5, qz, M.ymGlass2);
      pv.rotation.x = -0.32;
    }
    /* 屋顶绿化：一圈灌木贴着女儿墙内侧 */
    var nb = Math.round((w + d) / 11);
    for (i = 0; i < nb; i++) {
      var t = rd(), gx, gz;
      if (t < 0.44) { gx = (rd() - 0.5) * (w - 16); gz = (rd() < 0.5 ? -1 : 1) * (d / 2 - 5); }
      else if (t < 0.88) { gx = (rd() < 0.5 ? -1 : 1) * (w / 2 - 5); gz = (rd() - 0.5) * (d - 16); }
      else { gx = (rd() - 0.5) * (w - 30); gz = (rd() - 0.5) * (d - 30); }
      put(g, CYL, 4.2 + rd() * 2.4, 1.4 + rd() * 0.8, 4.2 + rd() * 2.4, gx, h + 0.9, gz,
        rd() < 0.5 ? M.ymGreen : M.ymGreen2);
    }
  };

  /* 幕墙塔：一家 AI 大厂一座，四种体量。
     rib 竖肋（冷面）/ twist 扭转（每一层转 1.7°）/ taper 收分（往上收）/ 
     binode 双筒（两个筒错位咬合）。
     四种都不是「换个颜色」——这一区有六家大厂，体量必须读得出六家公司。 */
  ARCH.cbdTower = function (g, o, M, rd) {
    var w = o.w || 52, d = o.d || 52, h = o.h || 150;
    var shape = o.shape || "rib";
    var mat = o.mat || M.ymStone2;
    var podH = o.podH === undefined ? 9 : o.podH;   /* 只做塔基，大裙房由 cbdBlock 负责 */
    var mainW = w, i, f;

    /* 塔基：一层深色底座，把塔从裙房屋顶上「摘」下来 */
    put(g, BOX, w + 6, podH, d + 6, 0, podH / 2, 0, M.ymStone3);
    put(g, BOX, w + 7.6, 0.6, d + 7.6, 0, podH + 0.3, 0, M.ymMullion);

    if (shape === "twist") {
      /* 扭转：18 层，每层转 1.5°，总转角 27°。
         转太多会读成「歪了」，转太少读成「没转」——27° 是两者之间的刻度。 */
      var tiers = 18, fh = (h - podH) / tiers;
      for (i = 0; i < tiers; i++) {
        var t2 = new THREE.Group();
        t2.position.y = podH + i * fh;
        t2.rotation.y = i * 0.0262;
        var kw = 1 - i * 0.012;
        put(t2, BOX, w * kw, fh * 0.93, d * kw, 0, fh * 0.465, 0, mat);
        put(t2, BOX, w * kw + 1.5, 0.55, d * kw + 1.5, 0, fh * 0.955, 0, M.ymLight2);
        g.add(t2);
      }
      mainW = w * 0.86;
    } else if (shape === "taper") {
      /* 收分：三段，越上越窄。每段顶一道挑檐，收势才读得出来 */
      var seg = [[1.0, 0.46], [0.84, 0.33], [0.68, 0.21]];
      var yy = podH;
      seg.forEach(function (sg) {
        var bw = w * sg[0], bhh = (h - podH) * sg[1];
        put(g, BOX, bw, bhh, bw, 0, yy + bhh / 2, 0, mat);
        var nr = Math.max(3, Math.round(bw / 7));
        for (var k = 0; k <= nr; k++) {
          var pk = -bw / 2 + bw * k / nr;
          put(g, BOX, 0.7, bhh, 1.1, pk, yy + bhh / 2, bw / 2 + 0.4, M.ymMullion);
          put(g, BOX, 0.7, bhh, 1.1, pk, yy + bhh / 2, -bw / 2 - 0.4, M.ymMullion);
          put(g, BOX, 1.1, bhh, 0.7, bw / 2 + 0.4, yy + bhh / 2, pk, M.ymMullion);
          put(g, BOX, 1.1, bhh, 0.7, -bw / 2 - 0.4, yy + bhh / 2, pk, M.ymMullion);
        }
        put(g, BOX, bw + 2.4, 1.2, bw + 2.4, 0, yy + bhh - 0.6, 0, M.ymLight2);
        yy += bhh;
      });
      put(g, BOX, w * 0.60, 6, w * 0.60, 0, h - 3, 0, M.ymLight);
      put(g, BOX, 3.0, 9, 3.0, w * 0.18, h + 4, 0, M.ymMullion);
      mainW = w * 0.71;
    } else if (shape === "binode") {
      /* 双筒：两个 34 米的筒错位咬合，中间一道全高竖缝。
         全城的塔都是单一体量，这一座是「两栋长在一起」 */
      var bw2 = w * 0.62, off = w * 0.21;
      [-1, 1].forEach(function (sd) {
        var cx2 = sd * off;
        put(g, BOX, bw2, h - podH, bw2, cx2, podH + (h - podH) / 2, 0, mat);
        var nr2 = Math.max(3, Math.round(bw2 / 6));
        for (var k2 = 0; k2 <= nr2; k2++) {
          var p2 = -bw2 / 2 + bw2 * k2 / nr2;
          put(g, BOX, 0.75, h - podH, 1.1, cx2 + p2, podH + (h - podH) / 2, bw2 / 2 + 0.4, M.ymMullion);
          put(g, BOX, 0.75, h - podH, 1.1, cx2 + p2, podH + (h - podH) / 2, -bw2 / 2 - 0.4, M.ymMullion);
        }
        for (f = 1; f * 30 < h - 20; f++) {
          put(g, BOX, bw2 + 1.8, 1.1, bw2 + 1.8, cx2, podH + f * 30, 0, M.ymLight2);
        }
        put(g, BOX, bw2 - 3, 7, bw2 - 3, cx2, h - 3.5, 0, M.ymLight);
      });
      /* 连板：两筒之间每 46 米一道 */
      for (f = 1; f * 46 < h - 30; f++) {
        put(g, BOX, w * 0.44, 5.0, w * 0.40, 0, podH + f * 46, 0, M.ymStone3);
      }
      mainW = w * 0.94;
    } else {
      /* 竖肋：最冷的一种。24 根肋、每 34 米一道设备层 */
      put(g, BOX, w, h - podH, d, 0, podH + (h - podH) / 2, 0, mat);
      var nr3 = Math.round(w / 4.4);
      for (i = 0; i <= nr3; i++) {
        var p3 = -w / 2 + w * i / nr3;
        put(g, BOX, 0.9, h - podH, 1.3, p3, podH + (h - podH) / 2, d / 2 + 0.5, M.ymMullion);
        put(g, BOX, 0.9, h - podH, 1.3, p3, podH + (h - podH) / 2, -d / 2 - 0.5, M.ymMullion);
        put(g, BOX, 1.3, h - podH, 0.9, w / 2 + 0.5, podH + (h - podH) / 2, p3, M.ymMullion);
        put(g, BOX, 1.3, h - podH, 0.9, -w / 2 - 0.5, podH + (h - podH) / 2, p3, M.ymMullion);
      }
      for (f = 1; f * 34 < h - 18; f++) {
        put(g, BOX, w + 2.2, 1.2, d + 2.2, 0, podH + f * 34, 0, M.ymLight2);
      }
      put(g, BOX, w - 4, 8, d - 4, 0, h - 4, 0, M.ymLight);
      put(g, BOX, w - 12, 4.5, d - 12, 0, h - 10, 0, M.ymMullion);
      mainW = w;
    }

    /* 塔身竖排字：贴在局部 x 正负两侧。
       两面都挂——塔的朝向按「正面朝区中心」算，只挂一面的话，
       从默认机位看到的是背面，名字全在背后，「有名字」这条就白写了。 */
    if (o.brand && o.brand.name) {
      var nm = o.brand.name, nn = nm.length;
      var gh2 = o.signH || 12;
      var vw2 = gh2 + 1.8, vh2 = gh2 * nn + 1.8;
      var vy2 = podH + (h - podH) * 0.42;
      var vtex2 = vSignTexture(nm, o.brand.tone || "#eef4f7");
      var vmat2 = new THREE.MeshStandardMaterial({
        map: vtex2, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: vtex2, emissiveIntensity: 0.50,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.2 });
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.9, vh2 + 1.6, vw2 + 1.6, sd * (mainW / 2 + 0.5), vy2 + vh2 / 2, 0, M.ymDark);
        var pl3 = new THREE.Mesh(new THREE.PlaneGeometry(vw2, vh2), vmat2);
        pl3.position.set(sd * (mainW / 2 + 0.95), vy2 + vh2 / 2, 0);
        pl3.rotation.y = sd < 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(pl3);
      });
    }
  };

  /* 三级台地：12 / 24 / 36 米，逐级收窄，台后密林。
     为什么不做山：D03 的北岭从世界 z≈−1330 起坡，两个地形网格在区界
     一定错开，错开就是一道几十米的黑缝。城市在山脚砌三级台地、台上种树，
     本来就是这么做的——它不需要和任何地形对齐，永远不会打架。 */
  ARCH.terracePark = function (g, o, M, rd) {
    var th = o.tierH || 12;
    var tz = o.tierD || 38;
    var ws = o.ws || [700, 600, 440];
    var i, k;
    for (i = 0; i < ws.length; i++) {
      var h0 = th * (i + 1);
      var zc = -i * tz - tz / 2;
      /* 台体：底面 −10，顶面 h0。侧面就是挡土墙 */
      put(g, BOX, ws[i], h0 + 10, tz, 0, (h0 - 10) / 2, zc, M.ymTerrace);
      /* 台面草皮 */
      put(g, BOX, ws[i] - 3, 0.35, tz - 3.2, 0, h0 + 0.17, zc, M.ymGreen);
      /* 前沿压顶：一道浅色石带，台的「边」才立得住 */
      put(g, BOX, ws[i], 0.55, 1.8, 0, h0 + 0.27, zc + tz / 2 - 0.9, M.ymStone);
      /* 台面上的树：一排，间距 20 米左右 */
      var nt = Math.round(ws[i] / 22);
      for (k = 0; k < nt; k++) {
        var tx = -ws[i] / 2 + 14 + (ws[i] - 28) * (k + 0.5) / nt + (rd() - 0.5) * 8;
        var tzz = zc + (rd() - 0.5) * (tz - 14);
        var tr = 3.0 + rd() * 1.8, thh = 12 + rd() * 7;
        put(g, CYL, 1.0, thh * 0.34, 1.0, tx, h0 + thh * 0.17, tzz, M.ymTree);
        put(g, CONE, tr * 2.0, thh, tr * 2.0, tx, h0 + thh * 0.63, tzz, M.ymTree);
      }
    }
    /* 台后密林：380 米外树只有剪影，一串圆锥就够 */
    var nf = o.forest || 110;
    for (k = 0; k < nf; k++) {
      var fx = (rd() - 0.5) * 470;
      var fz = -ws.length * tz - rd() * 52;
      var fh = 16 + rd() * 13;
      /* 林带底高必须跟着台地总高走，写死 36 会让树浮在压低后的台地上空 */
      put(g, CONE, 8 + rd() * 7, fh, 8 + rd() * 7, fx, th * ws.length + fh / 2, fz, M.ymTree);
    }
  };

  /* 树阵：广场与林荫道上的成排乔木。
     一块 550 × 190 的广场只铺几条石板、摆几个绿色方块，从 400 米外看
     就是「还没种树的空地」。把广场读成广场的是树，不是铺装的分缝。 */
  ARCH.grove = function (g, o, M, rd) {
    var w = o.w || 20, d = o.d || 20;
    var step = o.step || 12;
    var cols = o.cols || Math.max(1, Math.round(w / step));
    var rows = o.rows || Math.max(1, Math.round(d / step));
    var hMin = o.hMin || 6, hMax = o.hMax || 10;
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var x = (cols === 1 ? 0 : -w / 2 + w * i / (cols - 1)) + (rd() - 0.5) * 2.2;
        var z = (rows === 1 ? 0 : -d / 2 + d * j / (rows - 1)) + (rd() - 0.5) * 2.2;
        var h = hMin + rd() * (hMax - hMin);
        put(g, CYL6, 0.6, h * 0.58, 0.6, x, h * 0.29, z, M.trunk);
        put(g, SPH, 4.0 + rd() * 1.6, 3.4 + rd() * 1.4, 4.0 + rd() * 1.6,
          x, h * 0.86, z, rd() < 0.55 ? M.ymTree : M.leaf);
      }
    }
  };

  /* ------------------------------------------------------------
     西北能源新区（D17）：光伏海 / 风机 / 双翼研发楼 / 储罐群 / 升压站
     这一区的城市语言只有两条，而且都是「反城市」的：
     ① 地面不是绿化也不是铺装，是板——全城唯一不种草的地方；
     ② 竖向构件不是楼，是设备——风机 120 米、储罐 24 米、格构架 18 米，
        它们比楼高，但没有一平方米是给人待的。
     所以这里的原型全是「场」而不是「楼」。
     ------------------------------------------------------------ */

  /* 光伏海。
     一块 pvField 就是「按行铺满、被区界裁圆、被路网切开」的整片板场。
     逐行扫：这一行的半长由 clipR 直接算出（√(R²−z²)），圆界不用另画裁剪面；
     再把这一行沿长度方向减掉 cut 区间，剩下的每一段是一块板。
     86 行 × 平均 2.6 段 ≈ 220 个盒子，比「一块板一个盒子」省两个数量级。
     cut 用 (u,v) 给：u 沿风轴、v 垂直风轴，正好是 pvField 的局部 z/x。 */
  ARCH.pvField = function (g, o, M, rd) {
    var len = o.len || 1110;              /* 局部 x（垂直风轴）总宽 */
    var dep = o.dep || 1110;              /* 局部 z（沿风轴）总深 */
    var clipR = o.clipR || 556;
    var gap = o.gap || 13;                /* 行距 */
    var pw = o.pw === undefined ? 4.2 : o.pw;   /* 板宽（沿风轴） */
    var tilt = o.tilt === undefined ? 0.384 : o.tilt;  /* 22° 倾角 */
    var cut = o.cut || [];
    /* cutRings：圆环带（检修环、防风林带）。矩形切不出圆环，但每一排都穿过圆心，
       环带在这一排上的截面永远是一对对称区间，所以只要把它换算成 x 区间再做减法，
       不必上裁剪面。多个环就依次减——林带必须落在土上，不能种在板阵里。 */
    var bands = o.cutRings || (o.cutRing ? [o.cutRing] : []);
    var mat = (o.pvMat && M[o.pvMat]) || M.enPv;
    var mat2 = M.enPv2, frame = M.enFrame;
    var n = Math.floor(dep / gap), z0 = -n * gap / 2 + gap / 2;
    var i, c, s, segs, bi;
    /* 通用区间减法：segs 是若干 [a,b]，减掉 [a2,b2] */
    function subRange(arr, a2, b2) {
      if (b2 <= a2) return arr;
      var out = [];
      for (var q = 0; q < arr.length; q++) {
        var a1 = arr[q][0], b1 = arr[q][1];
        if (b2 <= a1 || a2 >= b1) { out.push([a1, b1]); continue; }
        if (a2 > a1) out.push([a1, a2]);
        if (b2 < b1) out.push([b2, b1]);
      }
      return out;
    }
    for (i = 0; i < n; i++) {
      var z = z0 + i * gap;
      /* 半长直接由圆界给出：少 3 米退让，让板阵与环路之间留一圈土 */
      var half = Math.sqrt(Math.max(0, clipR * clipR - z * z)) - 3;
      if (half < 15) continue;
      segs = [[-half, half]];
      /* 每个环带在这一排上占的 x 区间：内边界 √(ri²−z²)、外边界 √(ro²−z²) */
      for (bi = 0; bi < bands.length; bi++) {
        var rgd = bands[bi];
        var rin = rgd.r - rgd.w / 2, rout = rgd.r + rgd.w / 2;
        var xi = Math.sqrt(Math.max(0, rin * rin - z * z));
        var xo = Math.sqrt(Math.max(0, rout * rout - z * z));
        if (xo <= 0) continue;
        segs = subRange(segs, xi, xo);
        segs = subRange(segs, -xo, -xi);
      }
      for (c = 0; c < cut.length; c++) {
        /* cut = [u 中心, v 中心, 沿 u 长, 沿 v 宽]。
           pvField 的局部 x 就是 u、局部 z 就是 v —— 排沿主轴铺、行距垂直主轴，
           所以这里 z 减的是 v 中心，切的是 x 上的 u 区间。 */
        var cu = cut[c][0], cv = cut[c][1], du = cut[c][2], dv = cut[c][3];
        if (Math.abs(z - cv) > dv / 2 + 2.5) continue;
        var lx = cu - du / 2 - 2.5, rx = cu + du / 2 + 2.5, out = [];
        for (s = 0; s < segs.length; s++) {
          var a1 = segs[s][0], b1 = segs[s][1];
          if (rx <= a1 || lx >= b1) { out.push([a1, b1]); continue; }
          if (lx > a1) out.push([a1, lx]);
          if (rx < b1) out.push([rx, b1]);
        }
        segs = out;
      }
      for (s = 0; s < segs.length; s++) {
        var sl = segs[s][1] - segs[s][0];
        if (sl < 9) continue;
        var mid = (segs[s][0] + segs[s][1]) / 2;
        /* 板中心抬到 1.42：倾斜 22° 后低边 0.63、高边 2.21，
           既不会切进地面，也不会和 0.46 的车行道抢同一层。
           逐行换色：同一片海全用一个深蓝，500 米外就是一整块蓝纸。 */
        var pm = put(g, BOX, sl, 0.10, pw, mid, 1.42, z,
          (i % 5 === 0 && rd() < 0.6) ? mat2 : mat);
        pm.rotation.x = -tilt;
        /* 支架：每段两端一组，每组前后两根（前短后长，配合 22° 的板）。
           只放一根细柱，近景里板的端头是悬空的一角。 */
        if (sl > 28) {
          [-1, 1].forEach(function (sd) {
            var px3 = mid + sd * (sl / 2 - 1.8);
            put(g, BOX, 0.22, 0.70, 0.22, px3, 0.35, z - pw * 0.42, frame);
            put(g, BOX, 0.22, 1.62, 0.22, px3, 0.81, z + pw * 0.42, frame);
            put(g, BOX, 0.16, 0.10, pw * 0.9, px3, 0.68, z, frame).rotation.x = -tilt;
          });
        }
      }
    }
    /* 逆变器箱 + 汇流箱：每 170 × 210 一处。
       板海如果只有板，俯视是一张条纹布；这一层浅灰小盒子是唯一的尺度参照。 */
    for (var bx = -len / 2 + 110; bx < len / 2 - 110; bx += 170) {
      for (var bz = -dep / 2 + 130; bz < dep / 2 - 130; bz += 210) {
        if (bx * bx + bz * bz > (clipR - 60) * (clipR - 60)) continue;
        put(g, BOX, 5.6, 2.8, 3.2, bx, 1.4, bz, M.enPad2);
        put(g, BOX, 6.0, 0.24, 3.6, bx, 2.9, bz, frame);
      }
    }
  };

  /* 风机。轮毂 78 米、叶尖 120 米——这是「设备」的尺度，不是塔的尺度。
     塔筒是锥形的：CYL 只能等比缩放，硬堆圆柱会是一根直筒，
     所以整根塔筒单独建一个 CylinderGeometry（8 台就是 8 个几何，可以接受）。 */
  ARCH.windTurbine = function (g, o, M, rd) {
    var hub = o.h || 78, bR = o.baseR || 5.6, tR = o.topR || 2.4;
    var blade = o.blade || 40;                  /* 叶片长；叶尖 = hub + 2 + blade */
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(tR, bR, hub, 18, 1), M.enWing);
    shaft.position.y = hub / 2;
    shaft.castShadow = true; shaft.receiveShadow = true;
    g.add(shaft);
    /* 加劲环：三段，随塔径收缩。没有这三道环，锥筒在逆光下只是一块灰板。 */
    [0.26, 0.54, 0.80].forEach(function (f) {
      var r = bR + (tR - bR) * f;
      put(g, CYL, r * 2.18, 0.5, r * 2.18, 0, hub * f, 0, M.enWing2);
    });
    /* 基础：两级圆台，边上再压一圈碎石 */
    put(g, CYL, 17, 0.5, 17, 0, 0.25, 0, M.enGravel);
    put(g, CYL, 13, 1.0, 13, 0, 0.9, 0, M.enPad2);
    put(g, CYL, 9.4, 0.8, 9.4, 0, 1.7, 0, M.enPad);
    /* 机舱：沿风向的长盒（局部 +z 是下风向，风轮迎在 −z 一侧） */
    put(g, BOX, 3.4, 3.4, 8.4, 0, hub + 1.1, -0.6, M.enWing);
    put(g, BOX, 3.7, 0.55, 9.0, 0, hub + 3.0, -0.6, M.enWing2);
    put(g, BOX, 3.0, 0.30, 4.0, 0, hub + 3.4, -0.2, M.enWing2);
    /* 轮毂整流罩：锥尖朝上风向（−z） */
    var spin = put(g, CONE, 3.4, 2.6, 3.4, 0, hub + 1.3, -5.0, M.enWing);
    spin.rotation.x = -Math.PI / 2;
    var hy = hub + 1.3, hz = -5.0;
    /* 三叶：每叶一个子组，绕 z 轴 120° 分布。叶片带 0.26 rad 的桨距角，
       纯平板的三叶在侧光下会读成三根棍。 */
    for (var b = 0; b < 3; b++) {
      var bg = new THREE.Group();
      bg.position.set(0, hy, hz);
      bg.rotation.z = b * Math.PI * 2 / 3 + (o.rot0 || 0.6);
      g.add(bg);
      var bm = new THREE.Mesh(BOX, M.enWing);
      bm.scale.set(3.6, blade * 0.92, 0.62);
      bm.position.y = 1.9 + blade * 0.46;
      bm.rotation.y = 0.26;
      bm.castShadow = true;
      bg.add(bm);
      /* 叶根：一段深色套，三叶在俯视里才分得出「这是三片」 */
      var rt2 = new THREE.Mesh(BOX, M.enGalv);
      rt2.scale.set(3.9, 3.4, 0.7);
      rt2.position.y = 2.4;
      bg.add(rt2);
      /* 叶尖收窄段：单靠矩形叶片，叶尖是一把方头铲 */
      var tp = new THREE.Mesh(BOX, M.enWing2);
      tp.scale.set(2.2, blade * 0.18, 0.5);
      tp.position.y = 1.9 + blade * 0.92 + blade * 0.05;
      tp.rotation.y = 0.34;
      bg.add(tp);
    }
    put(g, CYL, 2.0, 1.6, 2.0, 0, hy, hz, M.enWing2).rotation.x = Math.PI / 2;
  };

  /* 环形防风林带：全区唯一的一条绿，绕着检修环外侧 8 米。
     「全区不种草」这句话只有在有一条绿带作对照时才成立——
     没有这条带，土黄就是一整片荒；有了它，「不种草」才是一个决定。
     带子用一个 RingGeometry 一次成形（200 段），再点几十棵树破掉那条完美的色环。 */
  ARCH.treeRing = function (g, o, M, rd) {
    var r = o.r || 446, w = o.w || 14;
    var geo = new THREE.RingGeometry(r - w / 2, r + w / 2, 220, 1);
    var m = new THREE.Mesh(geo, M.enHedge);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.16;
    m.receiveShadow = true;
    g.add(m);
    /* 双行交错：单行树在 1300 米外读成「环路边的行道树」，
       两行错开才是「一条林带」。 */
    var n = Math.round(Math.PI * 2 * r / (o.step || 24));
    for (var i = 0; i < n; i++) {
      var a = Math.PI * 2 * i / n;
      for (var row = 0; row < 2; row++) {
        var aa = a + row * Math.PI / n * 0.5;
        var rr = r + (row ? 1 : -1) * w * 0.26 + (rd() - 0.5) * 2.4;
        var x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
        var h = 7.0 + rd() * 3.4;
        put(g, CYL6, 0.6, h * 0.5, 0.6, x, h * 0.25, z, M.trunk);
        put(g, SPH, 6.4 + rd() * 2.6, 5.0 + rd() * 2.0, 6.4 + rd() * 2.6, x, h * 0.64, z,
          rd() < 0.45 ? M.ymTree : M.leaf);
      }
    }
  };

  /* 灵犀智研：72×58 核心筒 + 两片 150×28 的翼，从核心筒同一点张开 32°。
     「双翼」不是造型，是组织：模型实验庭院夹在两翼之间，院子朝下风向敞开，
     翼的屋盖逐段跌落（96 → 64），风从院口进来、从翼背走。
     所以两翼必须同源——它们的平面线都从枢轴筒（核心筒东面那个 26×26 的筒）出发。 */
  ARCH.lingxi = function (g, o, M, rd) {
    var h = o.h || 104;
    var cw = o.cw || 72, cd = o.cd || 58;
    var wl = o.wl || 150, ww = o.ww || 28;
    var sp = (o.spread === undefined ? 16 : o.spread) * Math.PI / 180;
    var segs = o.segs || 5, i, j;
    var hw0 = o.wingH || 96, hw1 = o.wingTipH || 64;
    var px = o.px || 22;                     /* 枢轴筒中心（相对核心筒中心） */

    /* ---- 核心筒 ----
       横向凹槽每 8 米一道，做 12 道；角柱四根。银白金属板最怕「一块光板」，
       没有槽和柱，104 米在日光下就是一个没有尺度的白色棱柱。 */
    put(g, BOX, cw, h, cd, 0, h / 2, 0, M.enWing);
    for (i = 1; i < 13; i++) {
      put(g, BOX, cw + 0.5, 0.9, cd + 0.5, 0, 8 * i, 0, M.enWing2);
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      put(g, BOX, 1.5, h, 1.5, q[0] * (cw / 2 - 0.4), h / 2, q[1] * (cd / 2 - 0.4), M.enWing2);
    });
    /* 塔冠：内缩 3 米的一圈 + 一道青色灯带。全城每个地标顶上都有一条灯带，
       这一条是这一区唯一的「品牌色」。 */
    put(g, BOX, cw - 6, 4.2, cd - 6, 0, h + 2.1, 0, M.enWing2);
    put(g, BOX, cw - 4, 0.5, cd - 4, 0, h + 0.3, 0, M.enTealLit);
    put(g, BOX, cw - 10, 1.2, cd - 10, 0, h + 4.8, 0, M.enGalv);

    /* ---- 枢轴筒 ---- */
    put(g, BOX, 26, h, 26, px, h / 2, 0, M.enWing2);

    /* ---- 两翼 ----
       子组旋转：hero 的 group 已经转了 30°（风轴），翼在子组里再转 ±16°，
       合起来就是「相对主轴 ±16°」，两翼夹角 32°。 */
    [1, -1].forEach(function (wd) {
      var wg = new THREE.Group();
      wg.position.set(px, 0, 0);
      wg.rotation.y = wd * sp;
      g.add(wg);
      var segL = wl / segs;
      for (i = 0; i < segs; i++) {
        var hh = hw0 + (hw1 - hw0) * (i / (segs - 1));
        var sx = segL * (i + 0.5);
        /* 第一段落地（门厅），往后每段底部抬高 2.6 米——
           翼如果不离地，从侧面看就是「一栋退台楼」，
           两片翼前后重叠，怎么转都读不出 V。
           抬高之后翼下有了一道通长的影子，翼才「浮」起来。 */
        var by = i === 0 ? 0 : 4.0;
        put(wg, BOX, segL + 0.6, hh - by, ww, sx, by + (hh - by) / 2, 0, M.enWing);
        if (by > 0) {
          [-1, 1].forEach(function (sd) {
            put(wg, BOX, 1.1, by, 1.1, sx + sd * segL * 0.38, by / 2, 0, M.enGalv);
          });
        }
        put(wg, BOX, segL + 0.6, 0.7, ww + 0.9, sx, hh + 0.35, 0, M.enWing2);
        /* 段间压边：五段如果只靠高度差，接缝在 200 米外读不出来 */
        if (i > 0) {
          put(wg, BOX, 1.2, 1.4, ww + 0.7, segL * i, hw0 * 0.5, 0, M.enWing2);
        }
        /* 条窗：每段两面各两条通长深带。断开的两条读成「几扇窗」，
           通长的两条才读成「这条翼是办公的」。 */
        for (j = 0; j < 2; j++) {
          var wy = by + (hh - by) * (0.30 + j * 0.40);
          [1, -1].forEach(function (sd) {
            put(wg, BOX, segL + 0.62, 2.2, 0.42, sx, wy, sd * (ww / 2 + 0.06),
              j === 0 ? M.enTeal : M.ymGlass);
          });
        }
        /* 翼底勒脚：一条深色带压住地面，翼才不会读成「悬空的板」 */
        if (i === 0) {
          put(wg, BOX, segL, 1.5, ww + 0.4, sx, 0.75, 0, M.enTeal);
        }
      }
      /* 翼尖：24 米收窄段，宽度收到 21，高度再落 6 米 */
      put(wg, BOX, 24, hw1 - 10, 20, wl + 11, 4 + (hw1 - 10) / 2, 0, M.enWing);
      put(wg, BOX, 24.6, 0.6, 21, wl + 11, hw1 - 6 + 0.3, 0, M.enWing2);
      put(wg, BOX, 1.1, 4.0, 1.1, wl + 1, 2.0, 0, M.enGalv);
      /* 翼尖下方的斜撑：两片长翼从枢轴悬挑 174 米，没有支撑就只是两根悬臂 */
      for (var k = 1; k <= 2; k++) {
        put(wg, BOX, 1.0, hw1 * 0.62, 1.0, wl * (0.34 * k), hw1 * 0.31, 0, M.enGalv);
      }
    });

    /* ---- 两翼之间的庭院 ----
       一块 168 × 60 的硬化院坪 + 院内一列试验台。
       院子必须有实体地面：两翼之间的原始地面和光伏海同色，
       从空中看「院」和「场」就分不开。 */
    put(g, BOX, 172, 0.34, 62, 108, 0.17, 0, M.enGravel);
    put(g, BOX, 172, 0.12, 2.2, 108, 0.40, 0, M.enGalv);
    for (i = 0; i < 4; i++) {
      put(g, BOX, 16, 1.6, 7, 46 + i * 34, 0.95, 20, M.enPad2);
      put(g, BOX, 16, 1.6, 7, 46 + i * 34, 0.95, -20, M.enPad2);
    }
    /* 入口：核心筒西面（上风向）一道 20 米宽的雨棚 + 台阶 */
    put(g, BOX, 8, 0.4, 30, -cw / 2 - 3.6, 6.4, 0, M.enGalv);
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 0.7, 6.2, 0.7, -cw / 2 - 7.0, 3.1, sd * 13, M.enGalv);
    });
    for (i = 0; i < 3; i++) {
      put(g, BOX, 3.2, 0.42, 26 - i * 2, -cw / 2 - 6.8 - i * 3.2, 0.21 + i * 0.01, 0, M.enPad2);
    }

    /* ---- 厂牌 ----
       竖排字挂在核心筒西面（来向），横匾压在塔冠四面。
       「AI 大厂必须有名字」是全城规矩：塔身竖排 + 塔顶横匾，两面都挂。 */
    if (o.brand) {
      var nm = o.brand.name || "灵犀", en = o.brand.en || "LINGXI";
      var tone = o.brand.tone || "#d8f6f4";
      var vtex = vSignTexture(nm, tone);
      var vmat = new THREE.MeshStandardMaterial({
        map: vtex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: vtex, emissiveIntensity: 0.42,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.2 });
      var vc = 16, vw = vc + 2.0, vh = vc * nm.length + 2.0;
      /* 竖排字挂南北两面（局部 ±z）。
         原来挂东西两面，62 米高处正好被两片翼挡住——牌子在，字一个都看不见。
         南北两面是两翼的夹缝外向，从东南、西北都能读到。 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, vw + 1.6, vh + 1.6, 0.9, 0, h * 0.58, sd * (cd / 2 + 0.4), M.enTeal);
        var pl = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), vmat);
        pl.position.set(0, h * 0.58, sd * (cd / 2 + 1.0));
        pl.rotation.y = sd > 0 ? 0 : Math.PI;
        g.add(pl);
      });
      /* 塔顶横匾由 hero 循环统一挂（sign），这里不能再挂一块：
         两块「灵犀」上下叠在同一个立面上，读起来像装错了。 */
    }
  };

  /* 储罐群：六座 Ø34 × 24 的常压罐，两排三列，一圈 1.2 米围堰。
     这一组是「有存量」的唯一证据——园区里没有别的重物是圆的。
     罐顶不做球壳：球顶在 500 米外读成六个白蘑菇；平顶带一圈栏杆才像油罐。 */
  ARCH.tankFarm = function (g, o, M, rd) {
    var w = o.w || 180, d = o.d || 140;
    var tr = o.r || 17, th = o.th || 24;
    var px = o.px || 62, pz = o.pz || 40;
    var i;
    /* 场坪：两层，内层比外层高 2 厘米，避免顶面共面闪线 */
    put(g, BOX, w, 0.30, d, 0, 0.15, 0, M.enGravel);
    put(g, BOX, w - 10, 0.30, d - 10, 0, 0.16, 0, M.enPad2);
    /* 围堰：四道 1.3 米高的土堤，顶上一圈压顶。
       围堰是这一组唯一「合规」的细节——没有它，六个白罐就是六个桶。 */
    var rim = 1.3;
    put(g, BOX, w - 4, rim, 1.4, 0, rim / 2, d / 2 - 4, M.enPad);
    put(g, BOX, w - 4, rim, 1.4, 0, rim / 2, -d / 2 + 4, M.enPad);
    put(g, BOX, 1.4, rim, d - 9.4, w / 2 - 4, rim / 2, 0, M.enPad);
    put(g, BOX, 1.4, rim, d - 9.4, -w / 2 + 4, rim / 2, 0, M.enPad);
    /* 罐体 */
    [-1, 0, 1].forEach(function (ci) {
      [-1, 1].forEach(function (ri) {
        var cx = ci * px, cz = ri * pz;
        /* 罐底承台 */
        put(g, CYL, tr * 2 + 3.4, 0.9, tr * 2 + 3.4, cx, 0.75, cz, M.enPad);
        /* 罐壁 */
        put(g, CYL, tr * 2, th, tr * 2, cx, 0.9 + th / 2, cz, M.enTank);
        /* 三道环向加强圈：白罐最怕「一根白柱子」 */
        [0.25, 0.52, 0.80].forEach(function (f) {
          put(g, CYL, tr * 2 + 0.7, 0.55, tr * 2 + 0.7, cx, 0.9 + th * f, cz, M.enTank2);
        });
        /* 罐顶：平顶盘 + 边缘栏杆 + 中心通气帽 + 量油孔 */
        put(g, CYL, tr * 2 + 1.2, 0.7, tr * 2 + 1.2, cx, 0.9 + th + 0.35, cz, M.enTank);
        put(g, CYL, tr * 1.5, 0.5, tr * 1.5, cx, 0.9 + th + 0.95, cz, M.enPad);
        put(g, CYL, 2.4, 2.6, 2.4, cx, 0.9 + th + 2.1, cz, M.enGalv);
        put(g, CYL, 3.0, 0.4, 3.0, cx, 0.9 + th + 3.5, cz, M.enTank2);
        put(g, CYL, 1.1, 1.6, 1.1, cx + tr * 0.55, 0.9 + th + 1.5, cz + tr * 0.42, M.enGalv);
        /* 栏杆：一圈 12 根细柱 + 两道横杆（用 12 段短盒，绕圆） */
        for (i = 0; i < 16; i++) {
          var a2 = Math.PI * 2 * i / 16;
          put(g, BOX, 0.14, 1.1, 0.14, cx + Math.cos(a2) * (tr - 0.4), 0.9 + th + 1.25,
            cz + Math.sin(a2) * (tr - 0.4), M.enGalv);
        }
        /* 两道横杆：只有立柱的栏杆在 200 米外读成一圈牙签 */
        for (i = 0; i < 16; i++) {
          var a3 = Math.PI * 2 * i / 16, a4 = Math.PI * 2 * (i + 1) / 16;
          var mx2 = Math.cos((a3 + a4) / 2), mz2 = Math.sin((a3 + a4) / 2);
          var segL2 = 2 * (tr - 0.4) * Math.sin(Math.PI / 16) + 0.2;
          [1.75, 1.15].forEach(function (ry2) {
            put(g, BOX, segL2, 0.10, 0.10, cx + mx2 * (tr - 0.4), 0.9 + th + ry2,
              cz + mz2 * (tr - 0.4), M.enGalv, -(a3 + Math.PI / 16));
          });
        }
        /* 外爬梯：一道竖向梯 + 三段休息平台，永远在同一个方位（朝区外） */
        for (i = 0; i < 3; i++) {
          put(g, BOX, 1.5, 0.18, 1.9, cx + tr + 0.9, 0.9 + th * (0.22 + i * 0.30), cz, M.enGalv);
        }
        put(g, BOX, 0.2, th, 1.0, cx + tr + 1.5, 0.9 + th / 2, cz - 0.7, M.enGalv);
        put(g, BOX, 0.2, th, 1.0, cx + tr + 1.5, 0.9 + th / 2, cz + 0.7, M.enGalv);
        /* 进出料管：从罐底一直落到围堰外，再拐进管廊 */
        put(g, CYL, 1.5, 0.9 + th * 0.55, 1.5, cx - tr - 1.2, (0.9 + th * 0.55) / 2, cz, M.enTank2);
        var hp = put(g, CYL, 1.5, 30, 1.5, cx - tr - 1.2, 0.9 + th * 0.55, cz + 15, M.enTank2);
        hp.rotation.x = Math.PI / 2;
        [0, 1].forEach(function (k2) {
          put(g, BOX, 1.4, 0.9 + th * 0.55, 1.4, cx - tr - 1.2, (0.9 + th * 0.55) / 2,
            cz + 4 + k2 * 20, M.enPad2);
        });
      });
    });
    /* 管廊：沿围堰外侧横贯，把六座罐串成一套系统 */
    put(g, BOX, w - 16, 0.5, 1.8, 0, 2.6, -d / 2 - 5, M.enGalv);
    for (i = 0; i < 6; i++) {
      put(g, BOX, 0.5, 2.6, 0.5, -w / 2 + 18 + i * (w - 36) / 5, 1.3, -d / 2 - 5, M.enGalv);
    }
    var pipe = put(g, CYL, 1.8, w - 18, 1.8, 0, 3.1, -d / 2 - 5, M.enTank2);
    pipe.rotation.z = Math.PI / 2;
  };

  /* 升压站：六跨格构架 + 三组主变 + 母线。
     这一组是「往外送」的那一头，所以它在轴的上风向；
     它的语言全是「杆与线」——变电站最怕做成一片房子。 */
  ARCH.substationYard = function (g, o, M, rd) {
    var w = o.w || 180, d = o.d || 140;
    var i, j;
    put(g, BOX, w, 0.34, d, 0, 0.17, 0, M.enGravel);
    /* 层高差必须够：1 厘米在 180 米机位下会被深度缓冲判成共面，
       整块场地闪成一片黑沥青。抬到 6 厘米。 */
    put(g, BOX, w - 14, 0.34, d - 14, 0, 0.40, 0, M.enPad2);
    /* 六跨门形架：七根立柱，跨距由 w 决定，架高 18 米。
       两排柱 z = −46 与 z = +48，横梁跨在两排之间（长 94）。 */
    var nSpan = 6, span = (w - 26) / nSpan, topH = 18;
    var gz0 = -d / 2 + 34, gz1 = gz0 + 16;
    for (i = 0; i <= nSpan; i++) {
      var gx = -w / 2 + 13 + i * span;
      /* 每根柱是「两细柱 + 四道横缀」的格构柱，不是一根方柱 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, 0.62, topH, 0.62, gx, topH / 2, gz0 + sd * 2.4, M.enGalv);
        put(g, BOX, 0.62, topH, 0.62, gx, topH / 2, gz1 + sd * 2.4, M.enGalv);
      });
      for (j = 0; j < 4; j++) {
        put(g, BOX, 0.3, 0.3, 4.8, gx, 3.2 + j * 4.4, gz0, M.enGalv);
        put(g, BOX, 0.3, 0.3, 4.8, gx, 3.2 + j * 4.4, gz1, M.enGalv);
      }
      /* 门形横梁：柱顶把两排柱连起来，这是「构架」的主体 */
      put(g, BOX, 0.62, 0.62, gz1 - gz0, gx, topH, (gz0 + gz1) / 2, M.enGalv);
      put(g, BOX, 0.46, 0.46, gz1 - gz0, gx, topH - 4.4, (gz0 + gz1) / 2, M.enGalv);
    }
    /* 母线：两道横贯的管母，各挂在两排构架的内侧 */
    [gz0, gz1].forEach(function (mz, mi) {
      [15.0, 11.2].forEach(function (my) {
        var mb = put(g, CYL, 0.72, w - 20, 0.72, 0, my, mz, M.enGalv);
        mb.rotation.z = Math.PI / 2;
        put(g, BOX, w - 20, 0.24, 0.24, 0, my - 0.55, mz, M.enGalv);
      });
      /* 绝缘子串：母线下挂，每跨两组 */
      for (i = 0; i < nSpan; i++) {
        for (j = -1; j <= 1; j += 2) {
          var ix = -w / 2 + 13 + span * (i + 0.5) + j * span * 0.22;
          put(g, CYL, 0.34, 2.2, 0.34, ix, 10.0, mz, M.enTank2);
          put(g, CYL, 0.52, 0.3, 0.52, ix, 8.9, mz, M.enTank2);
          put(g, CYL, 0.52, 0.3, 0.52, ix, 9.8, mz, M.enTank2);
        }
      }
    });
    /* 构架上的设备：隔离开关（横梁上两组刀闸）+ 避雷器（母线两端三支）
       + 电流互感器（引下线根部）。一排空的框子不叫变电站，叫脚手架。 */
    for (i = 0; i < nSpan; i++) {
      var dx2 = -w / 2 + 13 + span * (i + 0.5);
      /* 隔离开关：底座 + 三根竖杆 + 一道水平刀闸 */
      put(g, BOX, 3.2, 0.5, 1.2, dx2, topH + 0.3, gz0, M.enGalv);
      [-1.1, 0, 1.1].forEach(function (ox2) {
        put(g, CYL, 0.20, 2.6, 0.20, dx2 + ox2, topH + 1.6, gz0, M.enTank2);
        put(g, CYL, 0.34, 0.4, 0.34, dx2 + ox2, topH + 0.2, gz0, M.enTank2);
      });
      put(g, BOX, 3.0, 0.22, 0.22, dx2, topH + 2.9, gz0, M.enGalv);
    }
    /* 避雷器：母线两端各三支，细高的白色瓷套 */
    [gz0, gz1].forEach(function (bzz) {
      [1, -1].forEach(function (sd2) {
        [-2.2, 0, 2.2].forEach(function (ox3) {
          put(g, CYL, 0.42, 6.4, 0.42, sd2 * (w / 2 - 16) + ox3, 3.2, bzz, M.enTank2);
          put(g, CYL, 0.62, 0.3, 0.62, sd2 * (w / 2 - 16) + ox3, 6.5, bzz, M.enGalv);
        });
      });
    });

    /* 三组主变：构架南侧一排。本体 + 两侧散热片 + 三根套管。
       每组都有一条引下线接到构架母线——没有引线，主变就是三个孤立的铁盒。 */
    [-1, 0, 1].forEach(function (ci) {
      var tx = ci * (w * 0.29);
      put(g, BOX, 20, 0.7, 13, tx, 0.35, d / 2 - 40, M.enPad);
      put(g, BOX, 20, 9.0, 11, tx, 5.2, d / 2 - 40, M.enTank2);
      put(g, BOX, 20.6, 0.7, 11.6, tx, 9.9, d / 2 - 40, M.enGalv);
      [-1, 1].forEach(function (sd) {
        for (i = 0; i < 5; i++) {
          put(g, BOX, 0.55, 7.0, 10.4, tx + sd * (10.0 + i * 0.72), 5.0, d / 2 - 40, M.enTank2);
        }
      });
      /* 引下线：从主变套管顶斜拉到构架母线 */
      [-4.6, 4.6].forEach(function (ox) {
        var ln = put(g, CYL, 0.22, 26, 0.22, tx + ox, 9.4, d / 2 - 40 - 12, M.enGalv);
        ln.rotation.x = -1.22;
      });
      /* 高压套管：三道，最高那根顶到母线 */
      [-4.6, 0, 4.6].forEach(function (ox, k) {
        put(g, CYL, 1.5, 7.0 + k * 0.9, 1.5, tx + ox, 9.4 + (7.0 + k * 0.9) / 2, d / 2 - 40, M.enTank2);
        put(g, CYL, 2.0, 0.5, 2.0, tx + ox, 9.6, d / 2 - 40, M.enTank2);
      });
      /* 防火墙：两台主变之间的混凝土墙，变电站的标准做法 */
      if (ci < 1) {
        put(g, BOX, 0.6, 9.6, 13, tx + w * 0.145, 4.8, d / 2 - 40, M.enPad);
      }
    });
    /* 控制楼：一小栋，压在场地东角。全是构架会读成一张铁网，需要一栋房子定尺度 */
    put(g, BOX, 26, 9.0, 15, w / 2 - 24, 4.5, d / 2 - 16, M.enPad);
    put(g, BOX, 27, 0.8, 16, w / 2 - 24, 9.4, d / 2 - 16, M.enGalv);
    put(g, BOX, 24, 1.1, 13, w / 2 - 24, 10.2, d / 2 - 16, M.enPad2);
    /* 围栏：这一区没有墙，站区边界只能靠一圈 1.1 米的栅栏读出来。
       南侧留 24 米宽的入口（主变检修通道）。 */
    var fx2, fz2, nfx = Math.round(w / 12), nfz = Math.round(d / 12);
    for (fx2 = 0; fx2 <= nfx; fx2++) {
      var px2 = -w / 2 + w * fx2 / nfx;
      [1, -1].forEach(function (sd3) {
        if (sd3 < 0 && Math.abs(px2) < 14) return;
        put(g, BOX, 0.16, 1.1, 0.16, px2, 0.55, sd3 * d / 2, M.enGalv);
      });
      [1, -1].forEach(function (sd3) {
        if (sd3 < 0 && Math.abs(px2) < 14) return;
        put(g, BOX, w / nfx, 0.10, 0.10, px2, 1.05, sd3 * d / 2, M.enGalv);
        put(g, BOX, w / nfx, 0.10, 0.10, px2, 0.62, sd3 * d / 2, M.enGalv);
      });
    }
    for (fz2 = 0; fz2 <= nfz; fz2++) {
      var pz2 = -d / 2 + d * fz2 / nfz;
      [1, -1].forEach(function (sd4) {
        put(g, BOX, 0.16, 1.1, 0.16, sd4 * w / 2, 0.55, pz2, M.enGalv);
        put(g, BOX, 0.10, 0.10, d / nfz, sd4 * w / 2, 1.05, pz2, M.enGalv);
        put(g, BOX, 0.10, 0.10, d / nfz, sd4 * w / 2, 0.62, pz2, M.enGalv);
      });
    }
    /* 出口电缆沟：从场地南缘一直伸到光伏海 */
    put(g, BOX, 3.2, 0.7, 24, 0, 0.35, -d / 2 - 12, M.enPad);
  };

  /* 倒影池：云门前 110 × 34 米。
     一整块镜面比任何雕塑都管用——它把 210 米的门楣拉到地上。 */
  ARCH.reflectPool = function (g, o, M, rd) {
    var w = o.w || 110, d = o.d || 34, rim = 1.1;
    /* 池壁必须是「四道边」，不能是一整块实心板：
       整块 box 会把水面整个封在石头里，池子渲出来是一个 0.9 米高的石台。
       上一版就是这样，方案图上前门那两个青块其实是它的侧影。 */
    var HX = (w + rim * 2) / 2, HZ = (d + rim * 2) / 2;
    put(g, BOX, w + rim * 2, 0.9, rim, 0, 0.45, HZ - rim / 2, M.ymStone);
    put(g, BOX, w + rim * 2, 0.9, rim, 0, 0.45, -HZ + rim / 2, M.ymStone);
    put(g, BOX, rim, 0.9, d, HX - rim / 2, 0.45, 0, M.ymStone);
    put(g, BOX, rim, 0.9, d, -HX + rim / 2, 0.45, 0, M.ymStone);
    put(g, BOX, w + rim * 2 + 0.6, 0.22, rim + 0.6, 0, 0.98, HZ - rim / 2, M.ymLight);
    put(g, BOX, w + rim * 2 + 0.6, 0.22, rim + 0.6, 0, 0.98, -HZ + rim / 2, M.ymLight);
    put(g, BOX, rim + 0.6, 0.22, d, HX - rim / 2, 0.98, 0, M.ymLight);
    put(g, BOX, rim + 0.6, 0.22, d, -HX + rim / 2, 0.98, 0, M.ymLight);
    /* 池底 + 水面：水面顶 0.30，比铺地（0.16）高一点点，
       才读得出「一池水」，而不是「一块被雨打湿的石头」。 */
    put(g, BOX, w, 1.4, d, 0, -0.7, 0, M.ymWaterBed);
    put(g, BOX, w, 0.2, d, 0, 0.20, 0, M.ymWater);
  };

  /* 地铁厅：46 × 30 米，玻璃盒 + 一整圈雨棚 + 一块站名板。
     它不需要大——需要的是「往下走」这个动作，所以入口做三段踏步。 */
  ARCH.metroBox = function (g, o, M, rd) {
    var w = o.w || 46, d = o.d || 30, h = o.h || 9.5;
    var i;
    /* 下沉三级：3 × 0.45 */
    for (i = 0; i < 3; i++) {
      put(g, BOX, w - i * 3.6, 0.45, d - i * 3.6, 0, 0.45 - i * 0.42, 0, M.ymStone2);
    }
    put(g, BOX, w - 11, 0.6, d - 11, 0, -0.6, 0, M.ymStone3);
    /* 站厅 */
    put(g, BOX, w - 14, h, d - 15, 0, h / 2 + 0.2, -3, M.ymGlass2);
    put(g, BOX, w - 15, 0.7, d - 16, 0, h + 0.55, -3, M.ymMullion);
    /* 雨棚：四周一圈，2.4 米宽 */
    put(g, BOX, w - 6, 0.5, d - 6, 0, h + 2.2, -3, M.ymLight);
    for (i = 0; i < 6; i++) {
      var cx2 = -w / 2 + 7 + (w - 14) * i / 5;
      [-1, 1].forEach(function (sz) {
        put(g, BOX, 0.7, h + 2.2, 0.7, cx2, (h + 2.2) / 2, -3 + sz * (d / 2 - 6), M.ymMullion);
      });
    }
    /* 站名板 */
    put(g, BOX, 11, 3.2, 0.6, 0, h + 4.6, -3, M.ymDark);
    put(g, BOX, 1.0, 8.6, 1.0, -w / 2 + 5, 4.3, d / 2 - 5, M.ymDark);
  };

  /* ------------------------------------------------------------
     东南设计社区（D15）：工坊院落 / 样机塔 / 架空球壳 /
     台阶埠头 / 芦苇滩 / 木栈道 / 材料场
     这一区没有环路、没有中心广场、没有一条中轴。它的全部语言只有三样：
     45° 的两条街、L 形围合的院、以及一条从水里长出来的台阶。
     所以七个原型里有五个是「构件」而不是「楼」——
     设计社区的主角是院子与岸线，不是房子。
     ------------------------------------------------------------ */

  /* 工坊院落：L 形围合，中间留院。
     两个模式：
     ① 默认——后翼满宽 + 一侧翼，院子朝街角开口，15–22 米，锯齿天窗；
     ② shed:true——1960 年代的大跨车间，一整跨、无院、锯齿屋面、高侧窗。
     同一段锯齿代码被两个模式共用：它是「车间」这件事唯一的证据。 */
  /* 一块铺地。巷、埠头前场、材料堆场的地坪都用它。
     高度必须各不相同：两块顶面差 1 厘米就是一条黑白闪线。 */
  ARCH.pad = function (g, o, M, rd) {
    var w = o.w || 40, d = o.d || 40, hh = o.h || 0.12;
    put(g, BOX, w, hh, d, 0, hh / 2, 0, (o.mat && M[o.mat]) || M.dqPave);
  };

  ARCH.workshopLoft = function (g, o, M, rd) {
    var w = o.w || 60, d = o.d || 56, h = o.h || 18;
    var ind = o.ind === undefined ? 12 : o.ind;
    var padD = o.padD || d;            /* 地坪进深：比房子深，才能顶到人行道上去 */
    var hw = w / 2, hd = d / 2, i;
    var wall = (o.wallMat && M[o.wallMat]) || M.dqRender;
    var mode = o.roofMode || "saw";
    var teeth, tw2, tz, tk, gl;

    /* ---- 模式 ②：旧厂房 ---- */
    if (o.shed) {
      put(g, BOX, w + 2.4, 0.5, d + 2.4, 0, 0.25, 0, M.dqShedRoof);
      put(g, BOX, w, h, d, 0, h / 2, 0, wall);
      /* 水刷石勒脚：1.4 米的深色墙裙。没有它，一栋 110×50 的白盒子读成冷库。 */
      put(g, BOX, w + 0.5, 1.4, d + 0.5, 0, 0.7, 0, M.dqShed2);
      /* 高侧窗：四面各一条 3.6 米高的带子，压在檐下 2 米 */
      put(g, BOX, w - 5, 3.6, 0.5, 0, h - 3.0, hd + 0.15, M.dqGlass);
      put(g, BOX, w - 5, 3.6, 0.5, 0, h - 3.0, -hd - 0.15, M.dqGlass);
      put(g, BOX, 0.5, 3.6, d - 5, hw + 0.15, h - 3.0, 0, M.dqGlass);
      put(g, BOX, 0.5, 3.6, d - 5, -hw - 0.15, h - 3.0, 0, M.dqGlass);
      /* 锯齿屋面：5 道横坡，斜面朝北，南侧留立板。
         斜面向北 = 天光从北窗进来，车间不晃眼——这是它唯一必须做对的地方。 */
      teeth = 5; tw2 = (d - 3) / teeth;
      for (i = 0; i < teeth; i++) {
        tz = -hd + 1.5 + tw2 * (i + 0.5);
        tk = put(g, BOX, w - 1.6, 0.4, tw2 * 1.06, 0, h + 1.55, tz, M.dqShedRoof);
        tk.rotation.x = -0.48;
        put(g, BOX, w - 1.6, 2.1, 0.55, 0, h + 1.05, tz - tw2 * 0.44, M.dqShed2);
        gl = put(g, BOX, w - 3.4, 0.18, tw2 * 0.60, 0, h + 2.35, tz + tw2 * 0.13, M.dqGlass);
        gl.rotation.x = -0.48;
      }
      /* 烟囱与通风筒：厂房靠这两根竖线在远处被认出来 */
      put(g, CYL, 2.8, h + 7, 2.8, hw - 12, (h + 7) / 2, -hd + 9, M.dqShed2);
      put(g, CYL, 3.2, 1.0, 3.2, hw - 12, h + 7.4, -hd + 9, M.dqDark);
      put(g, CYL, 1.3, h + 5, 1.3, -hw + 15, (h + 5) / 2, hd - 13, M.dqMetal);
      return;
    }

    /* ---- 模式 ①：工坊院落 ---- */
    /* 地坪：整块 60×56 先铺，房子压在上面 */
    put(g, BOX, w, 0.18, padD, 0, 0.09, 0, M.dqPave);
    /* 院内铺装深一档。不铺这一层，「围合」在俯视图上只剩三块屋顶。 */
    put(g, BOX, w - ind * 2, 0.12, d - ind, 0, 0.21, ind / 2, M.dqCourt);

    /* 后翼：满宽，压在 −z 边 */
    put(g, BOX, w, h, ind, 0, h / 2, -hd + ind / 2, wall);
    /* 侧翼：从后翼接到前边，前边留空＝院子的口 */
    var sx = o.flip ? hw - ind / 2 : -hw + ind / 2;
    var sh2 = h * 0.82;
    put(g, BOX, ind, sh2, d - ind, sx, sh2 / 2, ind / 2, wall);

    /* 檐口：两道浅灰压边。60 米长的白墙顶在天空下，没有这条线就是一块白板。
       坡屋顶那道不画——檐口会从屋面的两个坡脚里穿出来。 */
    if (mode !== "gable")
      put(g, BOX, w + 0.6, 0.55, ind + 0.6, 0, h + 0.27, -hd + ind / 2, M.dqTrim);
    put(g, BOX, ind + 0.6, 0.55, d - ind + 0.6, sx, sh2 + 0.27, ind / 2, M.dqTrim);

    /* 底层玻璃带：朝院子的那一面。
       工坊要亮靠的是这一圈，不是把整面墙做成玻璃——整面玻璃的工坊是办公楼。 */
    put(g, BOX, w - 3, 3.4, 0.4, 0, 2.0, -hd + ind + 0.15, M.dqGlass);
    put(g, BOX, 0.4, 3.4, d - ind - 3, sx + (o.flip ? -1 : 1) * (ind / 2 - 0.15), 2.0,
      ind / 2, M.dqGlass);
    /* 门：后翼正中一道 6 米宽的卷帘，卷帘箱挑出 0.4 米 */
    put(g, BOX, 6, 4.6, 0.6, 0, 2.3, -hd + ind + 0.3, M.dqDark);
    put(g, BOX, 7.4, 0.7, 1.2, 0, 5.1, -hd + ind + 0.2, M.dqTrim);

    /* 屋面分三种。一排院子全是锯齿，看着像同一张图复制了八遍；
       三种语言交替，同一排里才有「这户是车间、那户是老库房、那是新盖的」的差别。 */
    if (mode === "gable") {
      /* ① 双坡：老库房。屋脊平行于街，两端出山墙。 */
      /* 3.6 米的脊高摊在 15 米进深上只有 26°，远看是一块斜板；
         抬到 4.2 米（29°）读得出坡，再加一道脊瓦把屋脊线压出来。 */
      put(g, GABLE, w + 1.4, 4.2, ind + 1.6, 0, h + 0.2, -hd + ind / 2, M.dqTile);
      put(g, BOX, w + 1.5, 0.4, 0.8, 0, h + 4.45, -hd + ind / 2, M.dqDark);
      /* 山墙上的小圆窗：两坡各一个，是这种屋面唯一的装饰 */
      [-1, 1].forEach(function (sd7) {
        put(g, CYL, 1.5, 0.4, 1.5, sd7 * (hw + 0.55), h + 1.5, -hd + ind / 2, M.dqDark)
          .rotation.z = Math.PI / 2;
      });
      /* 侧翼也改坡：一半高，屋脊顺着侧翼的长边走（所以 ry=π/2，把宽深换过来）。
         不换的话，一道 88 米长、12 米进深的山墙横埋在院子里——上一版那块「白斜坡」就是它。 */
      put(g, GABLE, d - ind + 1.0, 2.2, ind + 1.2, sx, sh2 + 0.2, ind / 2,
        M.dqTile, Math.PI / 2);
      put(g, BOX, 0.8, 0.36, d - ind + 1.1, sx, sh2 + 2.4, ind / 2, M.dqDark);
    } else if (mode === "flat") {
      /* ② 平屋面：新盖的。女儿墙 + 楼梯间 + 水塔，屋顶上要有东西。 */
      [[-1, 0], [1, 0]].forEach(function (q2) {
        put(g, BOX, 0.45, 1.0, ind, 0 + q2[0] * (hw - 0.22), h + 0.5, -hd + ind / 2, M.dqTrim);
      });
      put(g, BOX, w, 1.0, 0.45, 0, h + 0.5, -hd + 0.22, M.dqTrim);
      put(g, BOX, w, 1.0, 0.45, 0, h + 0.5, -hd + ind - 0.22, M.dqTrim);
      put(g, BOX, 7.2, 3.1, 6.0, hw - 7.0, h + 1.55, -hd + 8.0, wall);
      put(g, BOX, 8.0, 0.36, 6.8, hw - 7.0, h + 3.28, -hd + 8.0, M.dqTrim);
      put(g, CYL6, 4.6, 4.0, 4.6, -hw + 9.0, h + 2.0, -hd + 9.5, M.dqMetal);
      put(g, CYL6, 5.0, 0.5, 5.0, -hw + 9.0, h + 4.2, -hd + 9.5, M.dqDark);
    } else {
      /* ③ 锯齿天窗：一排斜面 + 南侧立板。加建过的车间。 */
      teeth = Math.max(4, Math.round(w / 9.5));
      tw2 = (w - 3) / teeth;
      for (i = 0; i < teeth; i++) {
        var tx = -hw + 1.5 + tw2 * (i + 0.5);
        tk = put(g, BOX, tw2 - 0.55, 0.3, ind * 0.94, tx, h + 1.5, -hd + ind / 2, M.dqTrim);
        tk.rotation.x = -0.46;
        put(g, BOX, tw2 - 0.55, 1.7, 0.45, tx, h + 0.85, -hd + 1.3, M.dqTrim);
        gl = put(g, BOX, tw2 - 1.1, 0.16, ind * 0.66, tx, h + 1.9, -hd + ind * 0.44, M.dqGlass);
        gl.rotation.x = -0.46;
      }
      /* 侧翼屋面：平屋面 + 一圈女儿墙。两种屋面并存，才读成「加建过」。 */
      put(g, BOX, ind, 0.4, d - ind, sx, sh2 + 0.2, ind / 2, M.dqTrim);
      [[-1, 0], [1, 0]].forEach(function (q) {
        put(g, BOX, 0.42, 0.85, d - ind, sx + q[0] * (ind / 2 - 0.2), sh2 + 0.6, ind / 2, M.dqTrim);
      });
    }

    /* 院子是 34 × 85 米——只放一棵树就真的是一块空地。
       所以院子里要再立一栋矮的：一栋 22 × 62、只有主楼六成高的作坊，
       贴着与侧翼相对的那道外墙站，前院留 23 米。
       主屋、侧翼、作坊三件东西围出中间的院子，院子才有边界；
       作坊要是摆在正中，院子就被切成两条通道，谁都不像院子。 */
    var wW = 22, wD = 62;
    var wx = (o.flip ? -1 : 1) * (hw - wW / 2);
    var wH = h * 0.58;
    put(g, BOX, wW, wH, wD, wx, wH / 2, -hd + ind + wD / 2, wall);
    put(g, BOX, wW + 0.6, 0.5, wD + 0.6, wx, wH + 0.25, -hd + ind + wD / 2, M.dqTrim);
    put(g, BOX, wW - 2.4, 2.8, 0.4, wx, 1.7, -hd + ind + wD + 0.1, M.dqGlass);
    /* 作坊的锯齿：三道，跟主屋同一个语言，只是小一号 */
    for (i = 0; i < 3; i++) {
      var wz2 = -hd + ind + wD * (i + 0.5) / 3;
      var wt2 = put(g, BOX, wW - 1.2, 0.26, wD / 3.2, wx, wH + 1.2, wz2, M.dqGlass);
      wt2.rotation.x = -0.44;
    }

    /* 院墙：沿街那一道 2.2 米，中间开 9 米的门。
       没有这道墙，院子就是「两栋楼之间的一块铺地」——院墙是院落唯一的边界。 */
    [-1, 1].forEach(function (sd5) {
      var wl = hw - 4.6;
      put(g, BOX, wl, 2.2, 1.0, sd5 * (4.6 + wl / 2), 1.1, hd - 0.5, wall);
      put(g, BOX, wl, 0.28, 1.3, sd5 * (4.6 + wl / 2), 2.34, hd - 0.5, M.dqTrim);
    });
    [-1, 1].forEach(function (sd6) {
      put(g, BOX, 1.2, 3.0, 1.3, sd6 * 4.6, 1.5, hd - 0.5, M.dqTrim);
    });

    /* 院子里的树：两棵，一棵在侧翼与作坊之间的院里、一棵在前院偏一侧。
       一棵树撑不起 34 × 85 的院子，三棵又会把院子塞满。 */
    [[(o.flip ? 1 : -1) * 3.5, -hd + ind + wD * 0.58],
      [-6, hd - 16]].forEach(function (q, qi) {
      put(g, CYL6, 0.55, 4.6 + qi * 0.6, 0.55, q[0], 2.3, q[1], M.trunk);
      put(g, SPH, 7.4 + qi, 5.6 + qi, 7.4 + qi, q[0], 6.4, q[1], rd() < 0.5 ? M.leaf : M.leaf2);
      put(g, BOX, 3.0, 0.5, 3.0, q[0], 0.42, q[1], M.dqCourt);
    });
    /* 入口雨棚：从院子那侧挑出来，落在两道细柱上 */
    put(g, BOX, 9.0, 0.36, 4.4, 0, 4.4, hd - 1.4, M.dqTrim);
    [-1, 1].forEach(function (sd3) {
      put(g, BOX, 0.32, 4.3, 0.32, sd3 * 4.0, 2.15, hd - 0.9, M.dqMetal);
    });
  };

  /* 样机塔：一栋 40 米的「试验棚」，不是办公楼。
     三层通高——机器只有一台，一层只放得下一次试验。
     外挂楼梯必须真的挂在外面：它是这一区唯一敢把结构露出来的构件。 */
  ARCH.protoTower = function (g, o, M, rd) {
    var w = o.w || 40, d = o.d || 40, h = o.h || 40;
    var tw = w * 0.70, td = d * 0.70;
    var podH = 6.4, i;

    put(g, BOX, w, 0.5, d, 0, 0.25, 0, M.dqDark);
    put(g, BOX, w - 4.5, podH, d - 4.5, 0, podH / 2, 0, M.dqRender);
    /* 底层通高玻璃：样机要从这里抬进去 */
    put(g, BOX, w - 9, podH - 2.4, d - 9, 0, (podH - 2.4) / 2 + 0.7, 0, M.dqGlass);
    put(g, BOX, w - 2.2, 0.6, d - 2.2, 0, podH + 0.3, 0, M.dqTrim);

    /* 三层，每层一整片玻璃 + 一块挑出的楼板边 */
    var fl = 3, fh = (h - podH - 5.2) / fl;
    for (i = 0; i < fl; i++) {
      var y0 = podH + fh * i;
      put(g, BOX, tw, fh - 1.0, td, 0, y0 + (fh - 1.0) / 2 + 1.0, 0, M.dqGlass);
      put(g, BOX, tw + 1.6, 1.0, td + 1.6, 0, y0 + 0.5, 0, M.dqTrim);
    }
    /* 竖肋：四面各 7 根，通高。没有竖肋，三层玻璃在 400 米外是一根深色柱子。 */
    var nm = 6, mh = h - podH - 5.2;
    for (i = 0; i <= nm; i++) {
      var px = -tw / 2 + tw * i / nm;
      put(g, BOX, 0.44, mh, 0.62, px, podH + mh / 2, td / 2 + 0.31, M.dqMetal);
      put(g, BOX, 0.44, mh, 0.62, px, podH + mh / 2, -td / 2 - 0.31, M.dqMetal);
      var pz2 = -td / 2 + td * i / nm;
      put(g, BOX, 0.62, mh, 0.44, tw / 2 + 0.31, podH + mh / 2, pz2, M.dqMetal);
      put(g, BOX, 0.62, mh, 0.44, -tw / 2 - 0.31, podH + mh / 2, pz2, M.dqMetal);
    }
    /* 顶冠：收一圈的设备层 + 桅杆 */
    put(g, BOX, tw * 0.96, 4.6, td * 0.96, 0, h - 2.3, 0, M.dqRender2);
    put(g, BOX, tw * 0.70, 1.2, td * 0.70, 0, h + 0.6, 0, M.dqDark);
    put(g, CYL, 0.8, 4.4, 0.8, tw * 0.22, h + 2.6, 0, M.dqMetal);

    /* 外挂楼梯：四跑折返，贴着 +x 面往上。
       楼梯要是收在楼里，这栋楼就只是一栋小办公楼——
       「样机」这件事，一半靠玻璃，一半靠这条露在外面的钢梯。 */
    var run = (h - podH - 6) / 4, sw = 3.0;
    for (i = 0; i < 4; i++) {
      var fl2 = put(g, BOX, sw, 0.3, run * 1.44, tw / 2 + sw / 2 + 0.4,
        podH + run * (i + 0.5), 0, M.dqMetal);
      fl2.rotation.x = (i % 2 ? 1 : -1) * 0.785;
      /* 平台：每一跑的端头 */
      put(g, BOX, sw + 0.2, 0.24, 2.4, tw / 2 + sw / 2 + 0.4, podH + run * (i + 1), 0, M.dqMetal);
    }
    /* 楼梯立柱 */
    [-1, 1].forEach(function (sd4) {
      put(g, BOX, 0.24, h - podH - 3, 0.24, tw / 2 + sw + 0.4, (h - podH - 3) / 2 + 3,
        sd4 * (run * 0.72), M.dqMetal);
    });
  };

  /* 架空球壳：R34 的球，球心 62 米，不落地。
     四根斜柱立在岸线上，球向南悬挑，街从球底下穿过——
     平面图上那颗虚线圆就是街的一段天花板。
     硬约束（用户定的）：AI 大厂必须有名字、必须很高。
     名字分两处：赤道一圈横匾（弧面贴着球）+ 撑柱上的竖幅。
     所以 o.brand 里必须给 name / sign / en / tone，少一样就少一处名字。 */
  ARCH.orbHall = function (g, o, M, rd) {
    var r = o.r || 34, cy = o.cy || 62;
    var colZ = o.colZ === undefined ? -22 : o.colZ;
    var i;

    /* 四根斜柱：6 米见方，落在地面，顶部微微向球心收 */
    var topY = cy - r * 0.62;
    [-42, -14, 14, 42].forEach(function (cx) {
      var col = put(g, BOX, 6, topY + 2, 6, cx, (topY + 2) / 2, colZ, M.dqRender2);
      col.rotation.x = 0.05;
      put(g, BOX, 7.6, 1.1, 7.6, cx, 0.55, colZ, M.dqDark);
    });
    /* 柱顶横梁：四根柱子必须被一根梁连起来，否则就是四根电线杆 */
    put(g, BOX, 96, 2.6, 5.2, 0, topY + 1.3, colZ, M.dqDark);
    /* 梁上的斜撑：从梁顶斜插到球的下表面，把「悬」这件事说清楚 */
    [-42, -14, 14, 42].forEach(function (cx) {
      var br = put(g, BOX, 1.1, 15, 1.1, cx * 0.86, topY + 7.5, colZ + 5.5, M.dqDark);
      br.rotation.x = 0.5;
    });

    /* 球壳分三段，不是一颗整球。
       一颗白球加 8 经 7 纬，无论怎么调都是一只排球／高尔夫球——
       球的「建筑感」不在网格密度，在于它有没有「层」。
       所以：上段瓷白实壳（0 → 0.58π）、中段一圈通高玻璃观景带（0.58π → 0.82π）、
       下段深色底壳收口。玻璃带一出来，球立刻变成「一个挑在空中的大厅」。 */
    put(g, new THREE.SphereGeometry(r, 44, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
      1, 1, 1, 0, cy, 0, M.dqOrb);
    put(g, new THREE.SphereGeometry(r * 0.997, 44, 12, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.24),
      1, 1, 1, 0, cy, 0, M.dqGlass);
    put(g, new THREE.SphereGeometry(r * 0.994, 44, 8, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18),
      1, 1, 1, 0, cy, 0, M.dqOrbDeck);

    /* 入口环廊：球是从这条 5 米高的环廊进去的，不是从球面上的一个洞爬进去。 */
    var ringY = cy - r * 0.845;
    put(g, CYL, 22, 5.2, 22, 0, ringY, 0, M.dqGlass);
    put(g, CYL, 24, 0.7, 24, 0, ringY + 2.95, 0, M.dqOrbBand);
    put(g, CYL, 24, 0.7, 24, 0, ringY - 2.95, 0, M.dqOrbBand);

    /* 赤道箍 + 玻璃带上下两道压边：三条横箍把球分成「上壳 / 观景带 / 底壳」。 */
    [0.00, 0.58, 0.82].forEach(function (lf) {
      var rr = r * Math.sin(Math.PI * lf) * 1.008;
      var yy = cy + r * Math.cos(Math.PI * lf);
      var bd = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.58, 8, 60), M.dqOrbBand);
      bd.position.set(0, yy, 0); bd.rotation.x = Math.PI / 2;
      bd.castShadow = true; bd.receiveShadow = true; g.add(bd);
    });
    /* 经向肋：只在上壳。整颗球铺满经线就是排球；上壳 12 道，
       既给出结构，又不跟玻璃带抢。 */
    for (i = 0; i < 12; i++) {
      var rib = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.004, 0.24, 6, 30, Math.PI * 0.555), M.dqOrbBand);
      rib.position.set(0, cy, 0);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = Math.PI / 6 * i;
      rib.castShadow = true; rib.receiveShadow = true; g.add(rib);
    }
    /* 上壳再来两道细纬线。没有它们，上壳是一整片白，玻璃带反而不显眼。 */
    [0.26, 0.44].forEach(function (lf) {
      var rr = r * Math.sin(Math.PI * lf) * 1.006;
      var lt = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.26, 6, 52), M.dqOrbBand);
      lt.position.set(0, cy + r * Math.cos(Math.PI * lf), 0); lt.rotation.x = Math.PI / 2;
      lt.castShadow = true; lt.receiveShadow = true; g.add(lt);
    });
    /* 极点帽：八根经线在极点汇成一点，那是气球；加一块设备帽，极点才「有东西」。 */
    put(g, CYL, 26, 4.6, 26, 0, cy + r * 0.925, 0, M.dqOrbBand);
    put(g, CYL, 26.6, 0.6, 26.6, 0, cy + r * 0.925 + 2.6, 0, M.dqOrbDeck);
    put(g, CYL, 11, 3.4, 11, 0, cy + r * 1.02, 0, M.dqOrbDeck);

    /* 名字。两处都挂：赤道横匾（南北各一）＋ 撑柱竖幅。 */
    if (o.brand && o.brand.name) {
      var nm2 = o.brand.sign || o.brand.name;
      var tex = signTexture(nm2, o.brand.en || "", o.brand.tone || "#fff0f6");
      var smat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.42,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.22 });
      var arc = (o.brand.w || 30) / (r * 1.03);
      [0, Math.PI].forEach(function (th0) {
        /* 匾做成一段圆柱面：平板贴在 34 米的球上，两端会翘出去 2.6 米 */
        var segGeo = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 7.0, 24, 1, true,
          th0 - arc / 2, arc);
        var sgm = new THREE.Mesh(segGeo, smat);
        sgm.position.set(0, cy - 1.5, 0);
        g.add(sgm);
      });
      /* 竖幅：挂在前柱的正面，从 8 米挂到 24 米 */
      var nn = o.brand.name.length, vh = 4.6 * nn;
      var vtex = vSignTexture(o.brand.name, o.brand.tone2 || "#ffd9e8");
      var vmat = new THREE.MeshStandardMaterial({
        map: vtex, transparent: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: vtex, emissiveIntensity: 0.44,
        roughness: 0.5, metalness: 0.05, envMapIntensity: 0.22 });
      put(g, BOX, 6.4, vh + 1.6, 0.7, -14, 15.5, colZ + 3.4, M.dqDark);
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(4.6, vh), vmat);
      pl.position.set(-14, 15.5, colZ + 3.78);
      g.add(pl);
    }
  };

  /* 台阶埠头：从岸上下到水面。
     一块 140×48 的石埠头，三级大台阶，末端一条低平台用来上船。
     它必须是「石头」，而且必须一路沉到水面以下——
     只在岸上铺一块板，读成停车场；只有台阶伸进水里，才读成码头。 */
  ARCH.waterSteps = function (g, o, M, rd) {
    var w = o.w || 140, d = o.d || 48, i;
    var hi = 1.05, lo = -0.55;

    if (o.ramp) {
      /* 下水坡道：斜板 + 侧缘 + 防滑条。给皮划艇与清洗用，
         不做台阶——台阶不能推车下去。 */
      var rl = d;
      var sl = put(g, BOX, w, 0.7, rl * 1.02, 0, -0.42, 0, M.dqStone);
      sl.rotation.x = Math.atan2(1.15, rl);
      [-1, 1].forEach(function (sd) {
        var cb = put(g, BOX, 0.9, 0.75, rl * 1.02, sd * (w / 2 - 0.45), -0.05, 0, M.dqTrim);
        cb.rotation.x = Math.atan2(1.15, rl);
      });
      for (i = 0; i < 9; i++) {
        var zz = -rl / 2 + rl * (i + 0.5) / 9;
        var yy = 0.15 - (i + 0.5) / 9 * 1.15;
        var cl = put(g, BOX, w - 1.8, 0.12, 0.5, 0, yy + 0.36, zz, M.dqTimberDark);
        cl.rotation.x = Math.atan2(1.15, rl);
      }
      /* 坡道口的提示桩 */
      [-1, 1].forEach(function (sd) {
        put(g, CYL, 0.7, 1.4, 0.7, sd * (w / 2 - 1.2), 0.7, -rl / 2 + 2, M.dqDark);
      });
      return;
    }

    /* 上平台：从岸上伸进来，顶面比岸高 1.05 米（差不多两级踏步） */
    put(g, BOX, w, 3.0, d / 2 - 6 + 0.5, 0, hi - 1.5, -d / 4 - 2.75, M.dqPave);
    /* 四级台阶：每级降 0.40，进深 4.6。
       0.32 一级时，800 米机位上每级只有半个像素，「三级台阶」读成一块斜板；
       降到 0.40 再减一级，总落差 1.6 米才真的看得出这里是「能走下去的」。 */
    var nst = 4, drop = (hi - lo) / nst;
    for (i = 0; i < nst; i++) {
      var top = hi - drop * (i + 1);
      var zc = -6 + 4.6 * (i + 0.5);
      put(g, BOX, w, top + 2.6, 4.65, 0, (top - 2.6) / 2, zc, M.dqStone);
      put(g, BOX, w - 1.6, 0.16, 1.5, 0, top + 0.06, zc + 1.5, M.dqPave);
    }
    /* 下平台：末端低台，用来上船。起点接在最后一级台阶之后（z=12.4），
       不能搭在台阶上——两块顶面同高就是一片黑白闪线。 */
    put(g, BOX, w, 2.8, 11.6, 0, lo - 1.4, 18.2, M.dqStone);
    put(g, BOX, w, 0.22, 11.6, 0, lo + 0.11, 18.2, M.dqTimber);
    /* 两侧矮墙：0.9 米，一路跟着台阶降下去 */
    [-1, 1].forEach(function (sd) {
      put(g, BOX, 1.4, 4.2, d, sd * (w / 2 - 0.7), hi - 1.55, 0, M.dqTrim);
    });
    /* 系缆柱：只在下平台上，六个 */
    for (i = 0; i < 6; i++) {
      put(g, CYL, 0.9, 1.05, 0.9, -w / 2 + 14 + i * ((w - 28) / 5), lo + 0.75, d / 2 - 3.4, M.dqDark);
    }
    /* 灯：两根 6 米杆，压在台阶两侧 */
    [-1, 1].forEach(function (sd) {
      put(g, CYL, 0.32, 6.4, 0.32, sd * (w / 2 - 4), hi + 3.2, -d / 2 + 3, M.dqDark);
      put(g, BOX, 1.8, 0.26, 0.9, sd * (w / 2 - 4), hi + 6.5, -d / 2 + 2.2, M.beacon);
    });
  };

  /* 芦苇滩：南岸那 144 米。
     三件事必须同时成立：泥滩底色、一丛一丛的分布、三种枯荣不同的苇色。
     少一样——均匀撒 500 根绿棍子——滩就退化成「草地上长了些草」。 */
  ARCH.reedBank = function (g, o, M, rd) {
    var w = o.w || 860, d = o.d || 118, n = o.count || 620, i;
    var lim = o.limit || 466;
    /* 泥滩：不铺一层底，苇子就长在草地上。
       每一片的高度都要错开——30 片圆饼如果顶面同高，
       叠在一起的部分就是 30 块六边形在抢同一层像素，整片滩变成一块斑点。 */
    for (i = 0; i < 30; i++) {
      var mx = (rd() - 0.5) * w, mz = -d / 2 + rd() * d;
      if (Math.sqrt(mx * mx + mz * mz) > lim) continue;
      var mh = 0.05 + rd() * 0.06;
      put(g, CYL, 12 + rd() * 20, mh, 9 + rd() * 14, mx, mh / 2 - 0.01, mz, M.dqMud);
    }
    /* 苇丛：14 丛，每丛半径 10–22 米，丛内 30–60 根 */
    var mats = [M.dqReed, M.dqReed2, M.dqReedDry];
    for (var c = 0; c < (o.clumps || 15); c++) {
      var cx = (rd() - 0.5) * w * 0.94, cz = -d / 2 + rd() * d;
      var cr = 10 + rd() * 13;
      /* 一丛的根数按面积给：半径 16 米的一丛要有两百多根才读成「一丛苇」，
         几十根只是「地上插了些棍子」。 */
      var cn = Math.max(24, Math.round(n * cr * cr / 1500));
      /* 丛底：一块 0.75–1.15 米高的苇色椭圆。远看「一片苇」全靠它，
         细杆在 300 米外不到一个像素，只负责近景。 */
      put(g, CYL, cr * 1.75, 0.75 + rd() * 0.4, cr * 1.45, cx, 0.42, cz,
        rd() < 0.5 ? M.dqReed : M.dqReed2);
      for (i = 0; i < cn; i++) {
        var a = rd() * Math.PI * 2, rr = Math.pow(rd(), 0.5) * cr;
        var x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.8;
        if (Math.sqrt(x * x + z * z) > lim) continue;
        var hh = 2.0 + rd() * 2.2;
        var mt = mats[rd() < 0.60 ? (rd() < 0.5 ? 0 : 1) : 2];
        var blade = put(g, BOX, 0.5, hh, 0.5, x, hh / 2 + 0.5, z, mt);
        blade.rotation.z = (rd() - 0.5) * 0.18;
        blade.rotation.x = (rd() - 0.5) * 0.18;
      }
    }
    /* 零散的几根：丛与丛之间不是空的，是稀的 */
    for (i = 0; i < Math.round(n * 0.22); i++) {
      var sx = (rd() - 0.5) * w, sz = -d / 2 + rd() * d;
      if (Math.sqrt(sx * sx + sz * sz) > lim) continue;
      var sh = 1.2 + rd() * 1.5;
      put(g, BOX, 0.3, sh, 0.3, sx, sh / 2, sz, mats[Math.floor(rd() * 3)]);
    }
  };

  /* 木板路：湿地的栈道与水上的步行桥共用一套构件。
     板缝 4 厘米、桩每 6 米一对、栏杆 1.05 米——这三样是「木栈道」的全部。
     桥和栈道的区别只有 y 和 base：一个架在 2.9 米过水，一个趴在 0.9 米过滩。 */
  ARCH.plankWay = function (g, o, M, rd) {
    var pts = o.pts || [], w = o.w || 4.2;
    var y = o.y === undefined ? 0.85 : o.y;
    var base = o.base === undefined ? -1.4 : o.base;
    var rail = o.rail === undefined ? 1 : o.rail;
    var i, k;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b[0] - a[0], dz = b[1] - a[1];
      var L = Math.sqrt(dx * dx + dz * dz) || 1;
      var ry = Math.atan2(-dz, dx);
      var nx = -dz / L, nz = dx / L;
      /* 板：每 1.7 米一块，缝 5 厘米。近景全靠这条缝读成「木」而不是一块混凝土。 */
      var ns = Math.max(1, Math.round(L / 1.7));
      for (k = 0; k < ns; k++) {
        var t = (k + 0.5) / ns;
        put(g, BOX, L / ns - 0.05, 0.17, w, a[0] + dx * t, y, a[1] + dz * t, M.dqTimber, ry);
      }
      /* 边梁 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, L + 0.06, 0.34, 0.26, (a[0] + b[0]) / 2 + nx * sd * (w / 2 - 0.13),
          y - 0.22, (a[1] + b[1]) / 2 + nz * sd * (w / 2 - 0.13), M.dqTimberDark, ry);
      });
      /* 桩：每 6 米一对 */
      for (var s = 1.2; s < L; s += 6) {
        var px = a[0] + dx * (s / L), pz = a[1] + dz * (s / L);
        [-1, 1].forEach(function (sd2) {
          put(g, CYL6, 0.42, y - base, 0.42, px + nx * sd2 * (w / 2 - 0.5),
            (y + base) / 2, pz + nz * sd2 * (w / 2 - 0.5), M.dqTimberDark);
        });
      }
      /* 栏杆：立柱 1.05，两道横杆 */
      if (rail) {
        [-1, 1].forEach(function (sd3) {
          var rx = (a[0] + b[0]) / 2 + nx * sd3 * (w / 2 - 0.1);
          var rz = (a[1] + b[1]) / 2 + nz * sd3 * (w / 2 - 0.1);
          put(g, BOX, L, 0.11, 0.11, rx, y + 1.02, rz, M.dqTimberDark, ry);
          put(g, BOX, L, 0.08, 0.08, rx, y + 0.58, rz, M.dqTimberDark, ry);
          for (var q = 0.6; q < L; q += 2.6) {
            put(g, BOX, 0.11, 1.05, 0.11, a[0] + dx * (q / L) + nx * sd3 * (w / 2 - 0.1),
              y + 0.52, a[1] + dz * (q / L) + nz * sd3 * (w / 2 - 0.1), M.dqTimberDark);
          }
        });
      }
    }
    /* 桥头踏步：桥面 2.9 米、地面 0，两端必须落台阶。
       不落台阶的桥是「一条架在水上的板」——两岸的人上不去。 */
    if (o.stepEnds) {
      [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]].forEach(function (e) {
        var e0 = e[0], e1 = e[1];
        var dx2 = e0[0] - e1[0], dz2 = e0[1] - e1[1];
        var L2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
        var ux = dx2 / L2, uz = dz2 / L2;
        var ry2 = Math.atan2(-dz2, dx2);
        var nstep = 6, sh = y / nstep, sd2 = 1.15;
        for (var s2 = 0; s2 < nstep; s2++) {
          var yy = y - sh * (s2 + 0.5);
          put(g, BOX, sd2 + 0.12, sh + 0.3, w,
            e0[0] + ux * (sd2 * s2 + sd2 / 2), yy, e0[1] + uz * (sd2 * s2 + sd2 / 2),
            M.dqStone, M.dqTile, ry2);
        }
      });
    }
  };

  /* 材料场：旧厂房前面的露天堆场。
     一块碎石坪、两条窄轨、四垛料、一台小龙门。
     它是「先有厂房，后有社区」这句话里那个「后」的分界线——
     新网格从这道龙门吊的脚下切过去。 */
  ARCH.stockYard = function (g, o, M, rd) {
    var w = o.w || 80, d = o.d || 60, i;
    put(g, BOX, w, 0.24, d, 0, 0.12, 0, M.dqShed2);
    /* 两条窄轨 */
    [-8, 8].forEach(function (oz) {
      put(g, BOX, w - 2, 0.12, 0.16, 0, 0.27, oz, M.dqMetal);
    });
    /* 料垛：四垛，高低不一。石料是灰的，木料是暖的。 */
    [[-26, -18, 18, 3.2, 9, M.dqShed2], [-26, -2, 14, 2.4, 7, M.dqTimber],
      [8, -16, 22, 4.2, 11, M.dqStone], [14, 4, 16, 2.8, 8, M.dqTimberDark]]
      .forEach(function (q) {
        put(g, BOX, q[2], q[3], q[4], q[0], q[3] / 2 + 0.24, q[1], q[5]);
        put(g, BOX, q[2] + 0.4, 0.16, q[4] + 0.4, q[0], q[3] + 0.32, q[1], M.dqDark);
      });
    /* 小龙门：两根腿 + 一根梁 + 一台电葫芦 */
    [-30, 30].forEach(function (gx) {
      put(g, BOX, 1.2, 12, 1.2, gx, 6, -d / 2 + 5, M.dqMetal);
      put(g, BOX, 1.2, 12, 1.2, gx, 6, d / 2 - 5, M.dqMetal);
    });
    put(g, BOX, 62, 1.4, 1.4, 0, 12.7, -d / 2 + 5, M.dqMetal);
    put(g, BOX, 62, 1.4, 1.4, 0, 12.7, d / 2 - 5, M.dqMetal);
    put(g, BOX, 4.2, 1.8, 2.6, -6, 10.4, -d / 2 + 5, M.dqDark);
    put(g, BOX, 0.3, 3.4, 0.3, -6, 8.2, -d / 2 + 5, M.dqMetal);
    /* 场边小屋 */
    put(g, BOX, 9, 4.2, 6, w / 2 - 8, 2.1, d / 2 - 7, M.dqShed);
    put(g, BOX, 10, 0.5, 7, w / 2 - 8, 4.4, d / 2 - 7, M.dqShedRoof);
  };

  /* ------------------------------------------------------------
     高架城际线：桥面 / 梁 / 墩 / 护栏 / 接触网杆
     线路是这一区的主语，但它自己不能是一根灰管子：
     铁路桥的全部识别特征都在这五样里，缺一样就只是一道混凝土带。
     ------------------------------------------------------------ */
  function buildViaduct(scene, v, M) {
    var h = v.h === undefined ? 8.4 : v.h;
    var w = v.w || 26;
    var pts = v.pts, i;
    var g = new THREE.Group(); g.name = "viaduct"; scene.add(g);
    /* 重采样成 18 米一段：段太短会堆几百个盒子，太长弯道上会露出折角 */
    var segs = [];
    for (i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      var dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz) || 1;
      var n = Math.max(1, Math.round(L / 18));
      for (var k = 0; k < n; k++) {
        segs.push([ax + dx * k / n, az + dz * k / n, ax + dx * (k + 1) / n, az + dz * (k + 1) / n]);
      }
    }
    /* 桥面构件：梁体、挑檐、道床、钢轨、护栏 */
    
    segs.forEach(function (s) {
      var sx = s[2] - s[0], sz2 = s[3] - s[1], sl = Math.sqrt(sx * sx + sz2 * sz2) || 1;
      var mx = (s[0] + s[2]) / 2, mz = (s[1] + s[3]) / 2;
      var ry = Math.atan2(-sz2, sx), ext = sl * 0.08;
      var nx = -sz2 / sl, nz = sx / sl;
      /* 梁：一片梯形感很强的实体梁，比一块薄板更像桥 */
      put(g, BOX, sl + ext, 1.9, w, mx, h - 0.95, mz, M.deckGirder, ry);
      put(g, BOX, sl + ext, 0.44, w + 1.8, mx, h - 0.22, mz, M.deckEdge, ry);
      /* 道床：中间一条深色碎石带，两侧留检修道 */
      put(g, BOX, sl + ext, 0.10, w - 7.6, mx, h + 0.05, mz, M.ballast, ry);
      /* 4 根钢轨：两条到发线，轨距按 5 米线间距摆 */
      [-6.2, -4.7, 4.7, 6.2].forEach(function (off) {
        put(g, BOX, sl + ext, 0.17, 0.17, mx + nx * off, h + 0.18, mz + nz * off, M.rail, ry);
      });
      /* 护栏：压顶 + 立柱，桥面两侧的连续性全靠它。
         压顶做成浅色金属——桥在 8 米高、四周全是 20~40 米的楼，
         唯一能一眼认出「这里有桥」的就是那条连续的高光边线。 */
      [-1, 1].forEach(function (sd) {
        put(g, BOX, sl + ext, 0.55, 0.30, mx + nx * sd * (w / 2 - 0.4), h + 0.28, mz + nz * sd * (w / 2 - 0.4), M.parapet, ry);
        put(g, BOX, sl + ext, 0.16, 0.44, mx + nx * sd * (w / 2 - 0.4), h + 0.62, mz + nz * sd * (w / 2 - 0.4), M.deckEdge, ry);
      });
    });
    /* 墩：按弧长每 40 米一组，双柱 + 盖梁。
       站台范围内不落墩——那一段是车站的桥，不是区间桥。 */
    var total = 0, cum = [0];
    for (i = 0; i < pts.length - 1; i++) {
      total += Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2));
      cum.push(total);
    }
    function at(s) {
      var k = 1;
      while (k < cum.length - 1 && cum[k] < s) k++;
      var a = pts[k - 1], b = pts[k], seg = (cum[k] - cum[k - 1]) || 1, t = (s - cum[k - 1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(b[1] - a[1]), b[0] - a[0])];
    }
    function skipped(x, z, list) {
      if (!list) return false;
      for (var q = 0; q < list.length; q++) {
        var o2 = list[q];
        if (Math.abs(x - o2.x) <= o2.w / 2 && Math.abs(z - o2.z) <= o2.d / 2) return true;
      }
      return false;
    }
    var step = v.pierStep || 40;
    for (var s2 = step * 0.6; s2 < total - 6; s2 += step) {
      var pp = at(s2);
      if (skipped(pp[0], pp[1], v.noPier)) continue;
      var ry2 = pp[2], cx2 = Math.cos(ry2), sx2 = -Math.sin(ry2);
      var nx2 = -sx2, nz2 = cx2;
      var po = w / 2 - 4.6;
      [-1, 1].forEach(function (sd) {
        var px = pp[0] + nx2 * sd * po, pz = pp[1] + nz2 * sd * po;
        put(g, BOX, 2.4, h - 2.0, 2.4, px, (h - 2.0) / 2, pz, M.pierConcrete, ry2);
        put(g, BOX, 3.2, 0.6, 3.2, px, 0.3, pz, M.pierConcrete, ry2);
      });
      put(g, BOX, 3.2, 1.0, w - 3.0, pp[0], h - 2.4, pp[1], M.pierConcrete, ry2);
    }
    /* 接触网杆：单侧立柱 + 悬臂，每 44 米一根。站台棚下不立杆 */
    var mastStep = v.mastStep || 44;
    for (var s3 = 22; s3 < total - 6; s3 += mastStep) {
      var mp = at(s3);
      if (skipped(mp[0], mp[1], v.noMast)) continue;
      var ry3 = mp[2], cx3 = Math.cos(ry3), sx3 = -Math.sin(ry3);
      var nx3 = -sx3, nz3 = cx3;
      var bx2 = mp[0] + nx3 * (w / 2), bz2 = mp[1] + nz3 * (w / 2);
      put(g, BOX, 0.42, 8.6, 0.42, bx2, h + 4.3, bz2, M.mast, ry3);
      put(g, BOX, 0.34, 0.34, 6.4, mp[0] + nx3 * (w / 2 - 3.2), h + 8.2, mp[1] + nz3 * (w / 2 - 3.2), M.mast, ry3);
      put(g, BOX, 0.28, 0.28, 3.0, mp[0] + nx3 * (w / 2 - 1.6), h + 7.2, mp[1] + nz3 * (w / 2 - 1.6), M.mast, ry3);
      put(g, BOX, 1.4, 0.9, 1.4, bx2, 0.45, bz2, M.pierConcrete, ry3);
    }
    return g;
  }

  /* ------------------------------------------------------------
     主构建
     ------------------------------------------------------------ */
  /* 空壳光照：全城拼装时片区不再自己建太阳、天空与环境贴图。
     api.setTime 里会写 rig.sun.shadow.needsUpdate、api.update 里会调 rig.update，
     所以这几个字段必须真实存在，只是什么都不做。 */
  function stubRig() {
    var noop = function () {};
    var sun = { visible: false, intensity: 0, shadow: { needsUpdate: false },
      position: new THREE.Vector3(), target: { position: new THREE.Vector3() },
      color: new THREE.Color() };
    return {
      sun: sun, hemi: { intensity: 0, color: new THREE.Color(), groundColor: new THREE.Color() },
      skyMat: { uniforms: {} }, sky: null,
      setTime: noop, update: noop, updateEnvironment: noop,
      inspect: function () { return { environment: { ready: true, hour: null }, sky: { stars: 0, aurora: 0 } }; }
    };
  }

  /* 城市拼装模式：同一个 build 既要能单独生成一个区的近景，也要能被全城
     当成一块地来拼。区别只有五处——地面裁到地块、地形在边界收平、
     灯光与天空交给全城、外围远景不做、以及不建阴影接收面的重复份。
     其余每一行代码都还是原来那一份，片区在近景里长什么样，在全城里就长什么样。 */
  function build(scene, spec, opts) {
    opts = opts || {};
    var CITY = opts.city || null;
    STEAM_COUNT = 0;
    SOLAR_RATE = spec.solarRoof || 0;
    var R = spec.R || 460;
    /* 地块半边长：近景按 R 铺一片大到雾里的地面，全城只在自己这块地内铺 */
    var PHX = CITY ? (CITY.hx || R) : R, PHZ = CITY ? (CITY.hz || R) : R;
    /* 全城拼装时把街道生活摊薄：5 公里外它们不到一个像素，按原密度生成要让整城
       多花三秒多。但镜头能一路推到 22 米贴到楼跟前——那里街上必须有人有车，
       否则就是一座空模型。所以不关，只把间距拉开到原来的五分之一密度。 */
    if (CITY && spec.streetLife) {
      var life = {};
      for (var lk in spec.streetLife) life[lk] = spec.streetLife[lk];
      life.pedGap = 30; life.pedRun = 0.34;
      life.stall = 0.022; life.cart = 0.010; life.cafe = 0;
      life.traffic = Math.max(life.traffic || 0, 0.34);
      var shim = {};
      for (var sk in spec) shim[sk] = spec[sk];
      shim.streetLife = life;
      spec = shim;
    }
    var rd = U.rng(spec.seed || 7);
    var api = { state: null, spec: spec, cityMode: !!CITY,
      bounds: { minX: -PHX, maxX: PHX, minZ: -PHZ, maxZ: PHZ } };

    /* --- 材质 --- */
    var M = {
      concrete: plainMat(0xb0aba1, 0.92), concreteDark: plainMat(0x8d8880, 0.95),
      civic: plainMat(0x9a9284, 0.93), civicDark: plainMat(0x6a6359, 0.9),
      civicTrim: plainMat(0xa39a8a, 0.9),
      metal: plainMat(0x8e979c, 0.42, 0.75), metalDark: plainMat(0x60686e, 0.5, 0.7),
      steel: plainMat(0x848c92, 0.45, 0.8), steelDeep: plainMat(0x585f65, 0.5, 0.7),
      band: plainMat(0x9a9488, 0.8), parapet: plainMat(0x7c7770, 0.88),
      roofFlat: plainMat(0x6a655d, 0.96), roofTile: plainMat(0x9d5b44, 0.9),
      roofGravel: plainMat(0x4c4841, 0.98), roofPanel: plainMat(0x7a746a, 0.94),
      skylight: plainMat(0x93a9b5, 0.16, 0.55),
      greenRoof: plainMat(0x6f8f5c, 0.95), grass: plainMat(0x7d9463, 0.96),
      paving: plainMat(0x8d887c, 0.95), paving2: plainMat(0x817c72, 0.95),
      paving3: plainMat(0x9a9486, 0.95), shopfront: plainMat(0x3b4348, 0.28, 0.5), sand: plainMat(0xc2b492, 0.95),
      wood: plainMat(0x8a6a48, 0.9), brick: plainMat(0x9c6a52, 0.92),
      tank: plainMat(0x8f959a, 0.55, 0.5), door: plainMat(0x6d7378, 0.6, 0.4),
      /* 门洞芯：必须比店面玻璃再深一档，否则整条底层带糊成一片灰 */
      doorDark: plainMat(0x2f2b26, 0.86),
      /* 街面一层：老城临街几乎全是铺面，玻璃要暗、要宽 */
      shopGlass: plainMat(0x2b3339, 0.22, 0.42),
      stoneTrim: plainMat(0xb09f86, 0.92), timberTrim: plainMat(0x6b4c33, 0.94),
      canopy: plainMat(0xb8543f, 0.85), canopy2: plainMat(0x6d6a52, 0.9),
      /* 穹顶用铜绿，纯白球壳在满光下会直接烧成一个白洞 */
      domeShell: plainMat(0x5f8172, 0.62, 0.30),
      stoneWhite: plainMat(0xcdc8bb, 0.86), stoneWhiteDark: plainMat(0xa39e92, 0.9),
      glassDark: new THREE.MeshStandardMaterial({ color: 0x46697c, roughness: 0.26, metalness: 0.18,
        envMapIntensity: 1.15 }),
      mesh: new THREE.MeshStandardMaterial({ color: 0x9aa6a8, roughness: 0.4, metalness: 0.7,
        transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      roofGreyTile: plainMat(0x5d6166, 0.92), roofDarkTile: plainMat(0x4a4e52, 0.93),
      timber: plainMat(0x6f5136, 0.94), timberDark: plainMat(0x4e3927, 0.95),
      /* 沥青：0x33383c 在 ACES + 1.0 曝光下会亮成中灰，
         和浅色人行道糊成一片，整片路网读成「水泥地」。
         纯色材质不像贴图那样走 sRGB 解码，同样的 hex 会比贴图亮一档，
         所以这里要压到 0x1e2226 才真的「黑」。 */
      asphalt: plainMat(0x3c4249, 0.97), asphaltLight: plainMat(0x4a5057, 0.97),
      sidewalk: plainMat(0x949083, 0.95), kerb: plainMat(0x9c9688, 0.9),
      paint: plainMat(0xd9d3bc, 0.8), glass: plainMat(0x5c7f92, 0.18, 0.85),
      leaf: plainMat(0x4c7a44, 0.94), leaf2: plainMat(0x5f8a4b, 0.94),
      trunk: plainMat(0x6b563f, 0.96),
      water: new THREE.MeshStandardMaterial({ color: 0x23566c, roughness: 0.06, metalness: 0.30,
        transparent: true, opacity: 0.94, envMapIntensity: 0.9 }),
      jet: new THREE.MeshStandardMaterial({ color: 0xbfe2ee, roughness: 0.25, metalness: 0.05,
        transparent: true, opacity: 0.88, emissive: 0x1c3d4c, emissiveIntensity: 0.35 }),
      carA: plainMat(0xcfd3d6, 0.35, 0.6), carB: plainMat(0x2f3b47, 0.35, 0.6),
      carC: plainMat(0x8e3f34, 0.35, 0.6), carD: plainMat(0x4a5f52, 0.35, 0.6),
      carE: plainMat(0xd8c072, 0.35, 0.6),
      /* 行人：衣服必须多色但整体压暗，太饱和会让街道变成糖豆铺 */
      clothA: plainMat(0x8a4a3c, 0.94), clothB: plainMat(0x3c4c5e, 0.94),
      clothC: plainMat(0xa8916a, 0.94), clothD: plainMat(0x4a5844, 0.94),
      clothE: plainMat(0x6a4a5e, 0.94), clothF: plainMat(0xc4bdb0, 0.94),
      trouser: plainMat(0x35393f, 0.95), skin: plainMat(0xb08566, 0.88),
      /* 智算谷：机房外墙是浅灰压型钢板，比混凝土白、比石材冷，
         深色百叶带是唯一能把整片大白墙压住的元素 */
      hallWall: plainMat(0xc4c8c6, 0.86), hallWall2: plainMat(0xacb2b2, 0.88),
      hallWall3: plainMat(0x94a4ac, 0.88),
      hallBand: plainMat(0x3c4a52, 0.74), fin: plainMat(0x85929a, 0.52, 0.46),
      rust: plainMat(0x8a5240, 0.9), safety: plainMat(0xc9a227, 0.82),
      /* 冷却塔混凝土带一点水渍的暖灰，纯白在满光下会烧成一坨 */
      towerShell: plainMat(0xa3a197, 0.95),
      /* 循环水池不是景观水：深、浑、几乎不反光。
         用 M.water（0x23566c）会变成三个亮蓝泳池，在灰谷里比塔还抢眼。 */
      basin: plainMat(0x3a4649, 0.62, 0.10),
      /* 庭院水盘：浅水镜面，比 M.water（0x23566c 泳池蓝）深一档，
         一片白墙院子里出现几个亮蓝圆盘，比景观还抢眼 */
      pool: plainMat(0x35565c, 0.34, 0.18),
      /* 研究院：玻璃与白色金属是这片的底色。
         玻璃要浅到接近乳白，深蓝幕墙放在湖边会把整片水面拉成冷色块。 */
      glassDome: plainMat(0xa9c9c4, 0.14, 0.60),
      whiteMetal: plainMat(0xe3e5e1, 0.44, 0.16),
      mintTrim: plainMat(0x7cbdaa, 0.52, 0.12),
      dishFace: new THREE.MeshStandardMaterial({ color: 0xdfe2de, roughness: 0.55,
        metalness: 0.24, side: THREE.DoubleSide }),
      /* 司法区的石材：冷、偏蓝、没有一丝暖调。
         不能直接用 concrete（0xb0aba1）——那是暖灰，配冷蓝墙会读成脏。
         三档明度分工：石肋亮、勒脚中、凹槽深，竖条立面才有前后。 */
      stoneCold: plainMat(0xa6b0b6, 0.86),
      stoneCold2: plainMat(0x8c98a0, 0.89),
      stoneColdDeep: plainMat(0x6b767f, 0.91),
      /* 凹进一圈的玻璃：几乎全黑，只留一点点金属反光。
         司法建筑的窗是深缝，不是办公楼那种整面幕墙。 */
      slit: plainMat(0x28343c, 0.20, 0.44),
      /* 主楼正面那三米半宽的玻璃缝不能跟窄缝同色：
         窄缝读作「线」，大面积还是这个色就成了一件黑条纹衫。 */
      slitHall: plainMat(0x455761, 0.24, 0.40),
      /* 铜：整区唯一的暖色。冷石材里没有一块铜，画面就是一整片灰蓝，
         而铜绿/青铜恰好是纪念性建筑最常用的点缀。 */
      bronze: plainMat(0x8f6c3e, 0.46, 0.66),
      bronzeDark: plainMat(0x5b4526, 0.52, 0.62),
      /* 暖色石材：只给推理法医馆。全区都是冷青石，只有这一栋是暖的，
         混在冷灰里才跳得出来；勒脚仍走冷色，冷暖交界才干脆。 */
      forensicStone: plainMat(0xb28d63, 0.90),
      forensicDeep: plainMat(0x7d6144, 0.92),
      /* --- 西站枢纽区 ---
         站房的语言是「混凝土 + 钢 + 玻璃」，不是上一区的石缝。
         石材只给两端山墙与勒脚，其余全是浅灰金属板与整面玻璃；
         全用石材会把车站做成一栋法院，全用玻璃又会散成一个棚子。 */
      stationStone: plainMat(0xb8b6ab, 0.90),
      /* 河南站的站房：暖石。stationStone 是冷灰，D08 换乘大厅用它合适，
         D10 的站房若也冷灰，街筒尽头就挂着一块灰板。 */
      stationWarm: plainMat(0xc0ae92, 0.92),
      stationDeep: plainMat(0x4d5357, 0.62, 0.30),
      /* 门洞内壁深色玻璃。门洞的读法是「暗」，浅蓝玻璃会把三个洞
         变成三块亮屏，整排读成卷帘门。厚一点、暗一点，只留一线天光。 */
      stationDark: new THREE.MeshStandardMaterial({ color: 0x222b31, roughness: 0.34,
        metalness: 0.52, envMapIntensity: 0.55 }),
      stationGlass: new THREE.MeshStandardMaterial({ color: 0x6a8494, roughness: 0.14,
        metalness: 0.46, envMapIntensity: 1.15 }),
      /* 雨棚顶必须是深钢灰：站区周边全是浅灰混凝土，
         雨棚再做浅色，整座车站就化进背景里，只剩檐口那道紫线。
         深色顶 + 浅色檐口，是这一区唯一能在一屏里立住的明暗关系。
         金属度压到 0.14：0.42 的金属面基本只反射天光，
         相邻两块斜面照到的是同一片天空，折板就被抹成一张平板——
         折板的读法全靠「迎光面亮、背光面暗」，那必须让漫反射占主导。 */
      canopySteel: plainMat(0x47525a, 0.66, 0.12),
      canopyRidge: plainMat(0xd3d8d7, 0.40, 0.55),
      /* 桥面：梁比站房深一档，桥才压得住；挑檐再浅一档，边线才亮 */
      deckGirder: plainMat(0x9b9a93, 0.94),
      deckEdge: plainMat(0xb4b2a8, 0.92),
      deckConcrete: plainMat(0x8e8d86, 0.95),
      pierConcrete: plainMat(0xa2a09a, 0.94),
      ballast: plainMat(0x55544d, 0.98),
      rail: plainMat(0xa9b1b5, 0.32, 0.88),
      mast: plainMat(0x6d7477, 0.50, 0.62),
      /* 站台面：比桥面浅，站台才从桥里浮出来；盲道是这一区唯一的黄 */
      platform: plainMat(0xa8a8a0, 0.93),
      tactile: plainMat(0xc9a63f, 0.88),
      /* 停车楼层间带：深一档的混凝土，横线才读得出来 */
      garageBand: plainMat(0x6b6f70, 0.92),
      /* --- 大学城创新园 ---
         校园的底色是沙色抹灰 + 象牙白。沙色不能饱和——0xd9b878 那一档
         在满光下会退成土黄，整片校园立刻变成县城中学；
         压在 0xc9b48c，再配白墙，才读得出「新校园」而不是「新县城」。 */
      campusSand: plainMat(0xc9b48c, 0.92),
      campusSand2: plainMat(0xb9a47c, 0.93),
      campusWhite: plainMat(0xd7d3c6, 0.90),
      campusWhite2: plainMat(0xbfbbaf, 0.92),
      /* 檐口与勒脚：比沙墙深一档的暖灰。
         校园建筑的水平线全靠檐口挑出来，檐口一浅，立面就散。 */
      campusTrim: plainMat(0x8d7f66, 0.90),
      campusStone: plainMat(0xcac4b2, 0.91),
      campusPaving: plainMat(0x9c9689, 0.94),
      /* 校园的玻璃比车站的浅：教学楼要「透」，站房要「暗」 */
      /* 校企基地里「企业那一半」的冷灰：全区唯一的深色实墙。
         校园全是沙白，突然一栋冷灰，才分得出「这是两家单位」。 */
      corpShell: plainMat(0x5b6164, 0.90),
      /* 光伏板：深蓝黑，粗糙度 0.42。给到 0.2 会照成一面镜子变成亮蓝，
         给到 0.8 又是一块死黑的塑料——0.42 是「板」的那个区间。 */
      solarPanel: plainMat(0x33424e, 0.42, 0.28),
      /* 围网：metalDark 的金属度 0.7，竖杆在天空下全反成浅灰白，
         俯视时整圈围网读成一个白色棚架。降到 0.22 才是「铁网」。 */
      courtFence: plainMat(0x4a5155, 0.74, 0.22),
      courtBase: plainMat(0x6d706a, 0.96),
      corpShell2: plainMat(0x878e91, 0.90),
      campusGlass: new THREE.MeshStandardMaterial({ color: 0x46606a, roughness: 0.20,
        metalness: 0.38, envMapIntensity: 1.05 }),
      /* 木白实验室：全区唯一的暖木。木色不做深红——深红木在沙色里
         读成「仿古」，浅柚木才读成「木构」。 */
      campusWood: plainMat(0xb08a58, 0.88),
      campusWoodDark: plainMat(0x8a6a3e, 0.90),
      /* 跑道砖红：比任何建筑色都饱和，但面积只有一条环，
         在一片沙色与草绿里正好当尺度标尺。 */
      campusTrack: plainMat(0xa0563f, 0.96),
      campusTurf: plainMat(0x5c7d46, 0.97),
      /* --- 递归科学园区 ---
         底色是「紫灰」：石头里掺一点紫，不是彩色。
         饱和度再高一点，整片园区就成主题乐园；再低一点，
         紫就退成脏灰，和 D05 的冷青石分不出来。
         所以外壳压在中性紫灰，纯紫只出现在门框内侧那条发光槽上。 */
      funnelShell: plainMat(0x8d8698, 0.87),
      funnelShell2: plainMat(0x736c82, 0.89),
      funnelTrim: plainMat(0xc3bccb, 0.82),
      /* 漏斗的暗：口内的内壁必须读成「洞」。
         用玻璃色会读成一块屏，用纯黑在光下又是一块补丁，
         0x3a3644 是「暗但有反光」的那个位置。 */
      funnelDeep: plainMat(0x3a3644, 0.62, 0.18),
      funnelInner: new THREE.MeshStandardMaterial({ color: 0x2e2a38, roughness: 0.70,
        metalness: 0.10, side: THREE.DoubleSide }),
      funnelGlass: new THREE.MeshStandardMaterial({ color: 0x35313f, roughness: 0.18,
        metalness: 0.45, envMapIntensity: 0.9 }),
      /* 温室顶：比校园玻璃浅一档。三座深绿的棚子并排，
         从空中看就是三个集装箱，读不出「玻璃温室」。 */
      glassHouse: plainMat(0x9fb3bb, 0.20, 0.46),
      /* 站名灯带：全区唯一的紫，只用在雨棚檐口与入口雨棚上 */
      accent: B.emissive(0xb48cff, 1.15),

      /* --- 绿谷新生活区 ---
         这一区的材料几乎没有"新"东西：白墙、木、粗石、土。
         前面八个区都在比谁更锋利，这里要比谁更旧——
         一个住了很多年的坡地，墙面一定比马路脏，石墙一定比玻璃多。 */
      /* 挡土墙：坡地上出现次数最多的构件，颜色必须比墙身深两档，
         否则整片坡会读成"一堆白盒子插在浅灰条上"。 */
      hillStone: plainMat(0x6e6a5c, 0.97),
      /* 种植土：屋顶花园和台地花池的底。比草地深、比沥青暖。 */
      gardenSoil: plainMat(0x584a38, 0.99),
      /* 听澜的波浪顶板：浅金属，但不能亮过白墙，
         顶板是全区最高的水平面，一抬头就能被天光照满。 */
      waveRoof: plainMat(0xa8ada4, 0.60, 0.28),
      /* 声学舱外壳：磨砂浅灰绿，水汽一泡就是这种颜色 */
      podShell: plainMat(0xaeb8ae, 0.46, 0.22),
      /* 窗洞：声学楼、住宅的窗都不是幕墙，是墙上挖出来的洞——
         必须给一个真正的深色实体，玻璃幕墙的材质会给整面墙镀一层亮膜。 */
      winCore: plainMat(0x2b3037, 0.55, 0.10),
      /* 浅色压顶与檐口：坡地住区里所有的"白"都只出现在边线上，
         大面积白墙在这个色温下会发灰，反而显脏。 */
      civicTrim: plainMat(0xd8d4c6, 0.88),
      /* 桥面：全区唯一一条深色水平带。
         水面是浅青灰、桥面若也用 deckEdge 那一档浅灰，700 米外
         整座桥只剩一串白点——它就是「水上的一道虚线」。 */
      bridgeDeck: plainMat(0x5c605a, 0.95),
      /* 拱圈：比桥面再深一档。拱是桥在远景里唯一认得出的形状， */
      /* 它必须比桥面暗，否则那道弧线会被桥面吃掉。 */
      bridgeArch: plainMat(0x474b45, 0.92),
      /* 挡土墙压顶：比墙身浅一档，但绝不能白——白压顶在台地上
         是四道发亮的横线，整座花园立刻读成体育场看台。 */
      hillStone2: plainMat(0x8e8878, 0.95),
      /* --- 河南混合街区 ---
         这一区的颜色是「用旧了的暖」：赭石、窑红、土黄、水泥灰。
         前面九区都在比谁更干净，这里要比谁更旧。 */
      /* 骑楼柱与檐口：暖石色，比墙身深两档——
         柱廊是这一区出现次数最多的构件，它一浅，整条街就散了。 */
      arcadeStone: plainMat(0xa8967a, 0.95),
      /* 骑楼四个暖石变体：二十四段街墙若全同一色，远景读成两条 672 米长的
         米色板——「街」就成了一道墙。四色轮转 + 高度参差，街墙才有段落。 */
      arcadeStone2: plainMat(0x9b8a71, 0.95),
      arcadeStone3: plainMat(0xb3a289, 0.95),
      arcadeStone4: plainMat(0x8c7a62, 0.96),
      /* 屋面：平屋顶的防水卷材，深灰。这一区屋顶面积比街面还大，
         屋顶一浅，街就没人看了。两档深浅交替：二十四段同色同高，
         从空中看就是两条 672 米长的灰板，街墙的段落全靠这口差价。 */
      roofFlat: plainMat(0x565246, 0.97),
      roofFlat2: plainMat(0x484a3f, 0.97),
      /* 柱廊内墙：近黑。柱廊的读法是「暗」，里面的白墙会把柱列洗掉。 */
      arcadeDark: plainMat(0x2b2723, 0.90),
      arcadeTrim: plainMat(0x7d6d56, 0.93),
      /* 遮阳篷：窑红与米白交替。这两个色是整条街唯一的高饱和，
         压住它，街面就只剩灰。 */
      awningA: plainMat(0xa94a34, 0.93),
      /* 三红一白里的另一红：暗一档。只用两种色交替，远景会读成规则棋盘；
         加一档深浅，条纹才有「布」的杂色感。 */
      awningA2: plainMat(0x8e3b2b, 0.94),
      awningB: plainMat(0xd2c1a2, 0.93),
      /* 市集大棚：钢架深、棚顶浅，拱的轮廓全靠这两个色的差 */
      shedSteel: plainMat(0x4f4840, 0.80, 0.22),
      shedRoof: plainMat(0x6a6559, 0.96),
      /* 棚膜：半透明白膜。不透光的屋面板会把棚下变成黑洞，
         摊位、人都看不见，「棚下是市场」这件事就没了。 */
      shedMembrane: new THREE.MeshStandardMaterial({
        color: 0xd4cbb8, roughness: 0.95, metalness: 0.0,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        depthWrite: false
      }),
      /* 学园滨水区（D11） */
      museumStone: plainMat(0xc0b7a3, 0.94),   // 拱馆石墙
      museumDeep: plainMat(0x4a453c, 0.92),    // 台基与拱口内侧
      museumVault: plainMat(0xb8b2a2, 0.93),   // 筒拱，比墙压一档才读得出曲面
      museumTrim: plainMat(0xc3baa6, 0.93),
      emuBody: plainMat(0xa9b3ba, 0.86),       // 仿真塔
      emuTrim: plainMat(0xcfd6da, 0.88),
      emuDeep: plainMat(0x3a4248, 0.90),
      ringDeck: plainMat(0x7d8186, 0.96),      // 试车环道
      slabWall: plainMat(0xc6c3b6, 0.93),      // 板楼（可被 color 覆盖）
      slabWall2: plainMat(0xbcb8aa, 0.93),
      slabWall3: plainMat(0xd0ccbe, 0.93),
      slabDeep: plainMat(0x4e5054, 0.92),
      slabTrim: plainMat(0xd8d5c8, 0.93),
      /* 板楼的腰线不能再用 slabTrim（0xd8d5c8，接近白）：
         160 米板上每 3 米一道白线，640 米外就是一条条形码。
         改成比墙身只深一档的中性灰，读成"板缝"而不是"白线"。 */
      slabBand: plainMat(0xaeaba0, 0.93),
      /* 学园街墙：现代学院的实墙 + 带状窗，跟 D10 的骑楼完全没有共同语汇 */
      campusWall: plainMat(0xcfcabb, 0.93),
      campusWall2: plainMat(0xc2bdae, 0.93),
      campusDeep: plainMat(0x4a5054, 0.90),    // 底层玻璃盒与窗带
      campusTrim: plainMat(0xded9ca, 0.92),
      campusBase: plainMat(0x8e8a7c, 0.94),
      /* 长堤：整区唯一的"人工石"。堤身、墙面、压顶、步道四档分开，
         一档到底的话 1300 米石堤就是一条灰带，分不出堤顶和堤身。 */
      quayFace: plainMat(0x7d786a, 0.96),      // 临水墙面，最深
      quayStone: plainMat(0x928c7c, 0.95),     // 堤身
      quayCap: plainMat(0xcac3b0, 0.93),       // 压顶与石带
      quayDeck: plainMat(0xc2bcab, 0.96),      // 堤顶步道（必须比地面亮一档）
      quayDark: plainMat(0x3a3833, 0.90),      // 泄水孔、台阶踢面
      /* 站前广场铺装：比地面浅半档，偏暖。缝比铺装深两档——
         100 米见方的铺装不划缝，从空中看就是一块地砖。 */
      plazaPave: plainMat(0xa8a496, 0.96),
      plazaJoint: plainMat(0x76725f, 0.95),
      /* 店招底板：深色，上面再贴字 */
      signBoard: plainMat(0x342e28, 0.86),

      /* --- 澄湾生态城（D12） ---
         这一区只有三件事：一段弧、四个圆、一片浅水。
         所以材料也只需要三组：白（弧与社区）、石（渠与台地）、深青（水）。
         不能有第二个暖色——D02 的赭、D10 的窑红、D11 的砂都在这一区失效，
         一旦出现暖墙，600 米外那道白弧就会被读成一栋普通住宅。 */
      ecoWhite: plainMat(0xe0ded2, 0.92),      /* 住院楼与社区主体 */
      ecoWhite2: plainMat(0xd2d0c3, 0.93),     /* 门诊、泵房 */
      ecoWhite3: plainMat(0xc2c0b3, 0.93),     /* 次要体量、女儿墙 */
      ecoDeep: plainMat(0x4f5b59, 0.88),       /* 窗带、架空层、凹槽 */
      ecoShadow: plainMat(0x707a75, 0.90),
      /* 医院的识别带：地图标记色是 0xf28b91，整栋刷成粉就是儿童乐园。
         只留一道 1.2 米高的带子，压两档饱和度，远看是白墙上的一条暖线。 */
      ecoRose: plainMat(0xce888d, 0.90),
      ecoTank: plainMat(0xd6d4c7, 0.90),       /* 沉淀池环墙 */
      ecoTankDeep: plainMat(0x9a9e94, 0.92),   /* 台地与池壁勒脚 */
      /* 池内水面：不能是 M.water 的泳池蓝，也不能是 M.basin 的浑黑。
         沉淀池的水是「工艺水」——绿灰、几乎不反光。 */
      ecoPond: plainMat(0x40625c, 0.30, 0.18),
      ecoTimber: plainMat(0xa98a62, 0.92),     /* 木格栅、栈道 */
      ecoTimberDark: plainMat(0x7a6244, 0.93),
      /* 屋顶光伏：金属度压到 0.10。0.24 加上环境反射，
         一块深板在掠射角会整片泛蓝，屋顶读成一排蓝色横幅。
         深色靠底色，不靠金属反光。 */
      ecoSolar: plainMat(0x33414b, 0.54, 0.10),
      ecoCrop: plainMat(0x66804f, 0.96),       /* 屋顶绿化带 */
      ecoStone: plainMat(0x9a978a, 0.94),      /* 渠壁、台地挡墙 */
      ecoStoneCap: plainMat(0xbdb9a9, 0.93),   /* 压顶 */
      ecoMint: plainMat(0x8fbfae, 0.90),       /* 全区唯一的彩色构件：栏杆与标识 */

      /* --- 东部制造港（D13） ---
         这一区没有「墙」，只有「构件」：岸壁、钢梁、箱体、道砟。
         所以材料表不按建筑类型分，按材料分——混凝土、钢、锈、盐白。
         前十二区都有一种主色（赭、灰、白、砂），这一区的主色是
         「盐白 + 钢灰」，全部明度压在中间，好让集装箱的橙和蓝跳出来。 */
      portConcrete: plainMat(0xb4aea0, 0.95),   /* 岸壁压顶、码头面 */
      portConcrete2: plainMat(0xa29c8e, 0.96),  /* apron 铺装 */
      portConcrete3: plainMat(0x8b8578, 0.96),  /* 勒脚、挡墙 */
      /* 岸桥：全城最大的一组钢结构，必须比楼亮。
         钢构件在 600 米外只剩两个信息——「比背景亮」和「是一条竖线」。
         写 0x9aa2a7 的冷灰，压在天空与海之间才立得住。 */
      portSteel: plainMat(0xa3abb0, 0.48, 0.30),
      portSteelDeep: plainMat(0x767e84, 0.54, 0.26),
      /* 锈橙只给小车与悬臂端头。六台岸桥全刷这个色，
         海平线上就是一排警示色，像工地；只在「动的部分」上是机器。 */
      portRust: plainMat(0xb05a30, 0.80, 0.10),
      portShed: plainMat(0xd9d5c7, 0.93),       /* 月台仓盐白墙身 */
      portShed2: plainMat(0xc2bdad, 0.93),      /* 墙面分格、雨棚 */
      portDoor: plainMat(0x5b636b, 0.62, 0.28), /* 卷帘门 */
      portFab: plainMat(0xe2dfd4, 0.90),        /* 洁净厂房 */
      portFab2: plainMat(0xcac6b8, 0.91),
      portBand: plainMat(0x4d585e, 0.60, 0.20), /* 深色横带、玻璃条 */
      portTank: plainMat(0xc6c0b1, 0.86),       /* 化学品罐、储罐 */
      portTank2: plainMat(0x9aa0a0, 0.55, 0.40),
      portSafety: plainMat(0xc9a437, 0.84),     /* 安全黄：栏杆、车道线 */
      /* 道砟与枕木必须一深一浅。第一版用了 M.ballast（0x55544d 没走线性化，
         输出端亮成 0x8a8a83 的中灰），配上同样是中灰的枕木，
         整条铁路在俯视图上就是一条「带横纹的水泥路」——
         三条股道一根都读不出来。铁路的读法只有一个：深色道床上的浅色齿。 */
      portSleeper: plainMat(0x9c9488, 0.96),

      /* --- 蜂巢实验区（D14） ---
         这一区只有两种表面：米白的六棱柱墙、绿玻璃的舱。
         前十三区都是「石材 + 砖 + 金属 + 混凝土」的混合物，
         这一区故意只给两样——像一间洁净实验室，
         多一种材料就多一层「这楼到底是给谁用的」的噪音。 */
      hiveShell: plainMat(0xe6e2d4, 0.92),      /* 六棱柱墙身 */
      hiveShell2: plainMat(0xd2ccbb, 0.93),     /* 墙面分格、箍 */
      hiveShell3: plainMat(0xece8da, 0.90),     /* 锥台的亮面段 */
      /* 锥台专用：同样的两档米白，但开 flatShading。
         CylinderGeometry 的侧面法线是沿圆周插值的，六棱柱会被插成一只圆鼓——
         96 米的塔，六条棱全糊掉。这两个材质只给 archiveFrustum 用，
         六棱柱本身靠 6 根实体棱线把面读出来，不需要。 */
      hiveShellF: (function () {
        var m = plainMat(0xece8da, 0.90); m.flatShading = true; return m;
      })(),
      hiveShellF2: (function () {
        var m = plainMat(0xd2ccbb, 0.93); m.flatShading = true; return m;
      })(),
      hiveTrim: plainMat(0x5e5a4b, 0.88),       /* 深色檐带、棱线、井口 */
      /* 绿玻璃不能压太深。第一版 0x5f8371 配 2.4 米宽的横带，
         十八格蜂窝在 700 米外整片发黑，读成一堆油桶——
         玻璃带占层高一半时，「米白的巢」这个前提就没了。 */
      hiveGlass: plainMat(0x628c79, 0.30, 0.24),/* 绿玻璃：实验舱、横带 */
      hiveGlass2: plainMat(0x5c8879, 0.28, 0.26),
      hiveBase: plainMat(0xb5af9c, 0.95),       /* 台基、勒脚 */
      hivePave: plainMat(0xd5d1c2, 0.94),       /* 广场铺装 */
      hiveJoint: plainMat(0xa8a292, 0.95),      /* 铺装缝、引导带 */
      hiveMetal: plainMat(0x8f938f, 0.48, 0.42),/* 栏杆、设备 */
      hiveSoil: plainMat(0x7d7a62, 0.98),       /* 半埋舱周围的土坡 */

      /* 三座 AI 大厂的幕墙。冷白、深灰、中灰——
         三座塔不能是三种颜色，那读成三个品牌广告；
         它们是同一组玻璃盒子，差异只在反照率。 */
      aiShellA: plainMat(0xdbe0e3, 0.28, 0.46),
      /* 极栈那档原来是 0x49535c，压线性之后在 800 米外就是一整根黑条，
         竖排字反倒成了唯一能看见的东西。提到 0x5d6871，
         塔身才回到「深灰玻璃」，而不是「黑色锥形筒」。 */
      aiShellB: plainMat(0x5d6871, 0.30, 0.44),
      aiShellC: plainMat(0xb4bcc1, 0.32, 0.42),
      aiMullion: plainMat(0x9ba3a9, 0.44, 0.38),/* 遮阳肋、竖梃 */
      aiCrown: plainMat(0x394047, 0.52, 0.32),  /* 塔冠、结构带、灯箱底板 */
      aiPodium: plainMat(0xcbc7b6, 0.93),       /* 裙房 */
      aiSoffit: plainMat(0x7c848a, 0.55, 0.34), /* 裙房檐底 */

      /* --- 东南设计社区（D15） ---
         这一区的材料只有三样：刷白的砖墙、旧木、混凝土。
         粉只给球壳这一个构件——它是全区唯一「不是房子」的东西，
         材料必须先把它跟所有房子分开，再谈形状。
         前十四区每区都在加材料，这一区反而要减：
         设计社区的气质来自「院子」和「岸线」，不来自表皮。 */
      dqPave: plainMat(0xcdc7b4, 0.94),         /* 地块铺装 */
      dqCourt: plainMat(0xb3ac99, 0.95),        /* 院内铺装，深两档（浅一档在白墙旁边读不出院子） */
      dqRender: plainMat(0xf2eee2, 0.91),       /* 刷白砖墙 */
      dqRender2: plainMat(0xe4dfd0, 0.92),      /* 第二档白，给相邻院落错开 */
      /* 玻璃不能太深。D15 的院落是 15–22 米的白墙配 3.4 米玻璃带，
         玻璃一深，远看就是白盒子上开了一排黑洞。 */
      dqGlass: plainMat(0x6b8180, 0.24, 0.30),
      dqTrim: plainMat(0x8f8a7c, 0.90),         /* 檐口、压边、门套 */
      dqTimber: plainMat(0xc8b48e, 0.94),       /* 埠头、栈道板 */
      dqTimberDark: plainMat(0x8e7a58, 0.95),   /* 木构架、桩、栏杆 */
      dqStone: plainMat(0x9c9689, 0.95),
      /* 坡屋顶的瓦：石板灰。用 roofGreyTile 那张贴图在 20 米高的白墙顶上会反成一片白，
         双坡就只剩一块亮斜面，脊线完全看不见。纯色石板灰反而读得出坡。 */
      dqTile: plainMat(0x8b8681, 0.92),        /* 台阶、压顶石 */
      /* 旧厂房：只有这一处可以有锈色。墙是 1960 年代的水刷石，
         比刷白墙暗两档、偏红——「先有厂房，后有社区」全靠这个色差读出来。 */
      dqShed: plainMat(0xc0a995, 0.94),
      dqShed2: plainMat(0xac9580, 0.94),
      dqShedRoof: plainMat(0x8d735e, 0.93),
      dqMetal: plainMat(0x8f938f, 0.48, 0.36),  /* 栏杆、外挂楼梯、桅杆 */
      dqDark: plainMat(0x3f3a33, 0.80, 0.10),   /* 勒脚、灯杆、深色构架 */
      /* 球壳：全区唯一的粉。粉得太浅就成了一颗气球，
         太深又读成塑料；0xe0a0bd 配 0.30 的金属度，
         在满光下是「磨砂粉玻璃」，背光面才压得下去。 */
      /* 球壳是瓷白，不是气球。0xe8cdd7 那种品红压线性之后仍然饱和，
         34 米半径的球在街口就是一颗粉气球——球的颜色一旦抢戏，
         结构（经线、纬环、撑柱）就全看不见了。瓷白 + 暖灰肋才读成建筑。 */
      dqOrb: plainMat(0xe4e1d9, 0.42, 0.06),
      dqOrbBand: plainMat(0xa8a29c, 0.58, 0.14),/* 赤道箍、经向肋 */
      dqOrbDeck: plainMat(0x6b5f63, 0.72, 0.16),/* 球下吊顶、设备环 */
      dqReed: plainMat(0x6f8460, 0.97),         /* 芦苇 */
      dqReed2: plainMat(0x84975f, 0.97),
      dqReedDry: plainMat(0xa89a6a, 0.97),      /* 枯苇——一片滩不能只有一种绿 */
      dqMud: plainMat(0x9a9382, 0.98),          /* 泥滩、苇丛根部 */

      /* --- D16 云门商务区 ---
         这一区是幕墙的天下，纯色材质只有四个用途：
         裙房石材、一层玻璃、灯箱带、台地挡土墙。其余全靠 facadeMat 生成的幕墙。 */
      ymPave: plainMat(0xcbc8bf, 0.93),
      ymPave2: plainMat(0xb6b2a9, 0.94),
      /* 石材必须是「低饱和的暖灰」，不能是暖米黄。
         0xd2c8b2 的 R−B 差 32，经 ACES 输出成土黄，二十六块裙房读成一片砖混老楼。
         0xd6d2c8 的 R−B 只差 14 —— 是石灰岩，不是土坯。 */
      ymStone: plainMat(0xd6d2c8, 0.90),
      ymStone2: plainMat(0xc2bdb1, 0.91),
      ymStone3: plainMat(0x8b857a, 0.94),
      /* 玻璃必须「深而微光」：上一版 0x86a3b0 是浅蓝灰 + 粗糙 0.54，
         满漫反射下和暖石墙的明度差太小，横条读成白色百叶。
         压到 0x53707e、粗糙 0.30、金属 0.22 —— 漫反射仍是主导（不会背光发黑），
         但暗部有深度，石材与玻璃才分得开。 */
      ymGlass: plainMat(0x7a94a1, 0.34, 0.20),
      ymGlass2: plainMat(0x86a0ac, 0.36, 0.18),
      ymRoof: plainMat(0x827b71, 0.96),
      /* 第三、四种石材：一块地全是米色，二十六块裙房连成一张卡纸。
         真实 CBD 的街墙是「浅石灰岩 / 深花岗岩 / 暖砂岩」混的，
         相邻两块不同色，街景才有节奏。 */
      ymStone4: plainMat(0x7d786f, 0.92),
      ymStone5: plainMat(0xcdc2ae, 0.91),
      /* 店招八色。裙房一层要「一间一间」读出来，靠的就是这一组色差：
         商业区的招牌本来就是杂的，但它不能比幕墙更亮，否则整条街变灯箱墙。
         全部走 0.56–0.66 粗糙度，微反光——漆面招牌的手感。 */
      ymShop: [plainMat(0xe4dcc6, 0.62), plainMat(0xae4530, 0.58),
        plainMat(0x2f6b70, 0.58), plainMat(0x222d35, 0.66),
        plainMat(0xbe8d33, 0.56), plainMat(0x2d4d75, 0.58),
        plainMat(0x8b3f4d, 0.58), plainMat(0x7b8378, 0.60)],
      ymCanopy: plainMat(0xd6ccb6, 0.88),      /* 雨棚布 / 遮阳伞面 */
      ymLit: plainMat(0xf0e3c8, 0.72),         /* 橱窗里的光：暖白，不是白 */
      /* 车行道。M.asphalt 走的是 0x33383c → 线性化后接近 0.03，
         在 D16 的曝光下直接渲成一条黑河。0x8b8c84 线性化后约 0.25，
         满光下是中深灰——和浅色石材人行道拉开一档，但不吃掉路面上的车。 */
      ymRoad: plainMat(0x8b8c84, 0.95),
      /* 一层橱窗玻璃比楼上的幕墙亮一档。店面是「亮着的」，
         整层用楼上那块深蓝幕墙玻璃，街墙就是一排关门的蓝板。 */
      ymGlassShop: plainMat(0xa9c2cc, 0.20, 0.26),
      ymMullion: plainMat(0x8a9096, 0.28, 0.74),
      ymBand: plainMat(0xf4e6c6, 0.72, 0.06),
      ymDark: plainMat(0x2c3338, 0.72, 0.20),
      ymLight: plainMat(0xeae0cc, 0.80, 0.24),
      ymLight2: plainMat(0xd5cab4, 0.84, 0.18),
      ymWater: plainMat(0x5f8790, 0.08, 0.34),
      ymWaterBed: plainMat(0x2b373b, 0.90),
      /* 草绿必须压灰。0x93ac82 线性化之后是一块荧光绿，
         在灰色调的城市里像有人拿颜料桶泼了两块上去。
         0x86917a 是「城市草坪」的灰绿——和石材、玻璃放在一起才是一个系统。 */
      ymGreen: plainMat(0x86917a, 0.97),
      ymGreen2: plainMat(0x7d8872, 0.97),
      ymTerrace: plainMat(0x8d8a82, 0.95),
      ymTree: plainMat(0x6b845e, 0.96),

      /* --- D17 西北能源新区 ---
         这一区的「地面」不是石头也不是草，是光伏板。
         板色写 0x203550：纯色材质不走 sRGB 解码，输出端会亮一档。
         0x30496a 那一版渲出来是一片亮蓝灰——「蓝灰」不像板阵，像水面；
         压到这一档才有光伏的密度感，深色板也才把「白支架 + 土黄地」衬出来。 */
      enPv: plainMat(0x203550, 0.30, 0.26),
      enPv2: plainMat(0x18293f, 0.32, 0.22),
      /* 支架：镀锌钢。板阵的「工业感」有一半来自这一层灰。 */
      enFrame: plainMat(0x79838a, 0.55, 0.42),
      /* 干草与砾石。全区不设草坪——这是 D17 和前面十六区最根本的区别，
         所以底色只能是这一档。写暖一点（R−B 差 18），才读成「旱地」不是「水泥」。 */
      enGround: plainMat(0xb5a888, 0.98),
      enGravel: plainMat(0xa79c84, 0.98),
      /* 硬化场地：试验广场、储罐围堰、升压站坪。
         三处都用这一档，但顶面标高各差 1–2 厘米，避免远处闪线。 */
      enPad: plainMat(0xcdc9ba, 0.94),
      enPad2: plainMat(0xb8b4a5, 0.95),
      /* 车行道：能源区的路是重载沥青，比商务区深一档。
         0x8b8c84 是 D16 的浅灰沥青，摆在这片旱地上会读成「水泥便道」。 */
      enRoad: plainMat(0x6f6d64, 0.95),
      /* 格构架与母线：比 M.steel 亮一档。
         变电构架在日光下是「浅灰的一堆细杆」，用深钢色会读成一片黑线。 */
      enGalv: plainMat(0xa3abb0, 0.46, 0.58),
      /* 储罐：白漆罐体 + 略深一档的罐顶。
         白罐在旱地黄底上是最省力的一个「重物」，一眼就知道这里有存量。 */
      enTank: plainMat(0xd3d7d7, 0.40, 0.22),
      enTank2: plainMat(0xb9bebe, 0.46, 0.20),
      /* 灵犀：银白金属板 + 品牌青。青只给翼下的一条灯带和入口，
         整栋刷青会变成一块塑料。 */
      enWing: plainMat(0xdee4e4, 0.32, 0.26),
      enWing2: plainMat(0xc3cbcb, 0.36, 0.24),
      enTeal: plainMat(0x2f6b70, 0.50, 0.18),
      /* 防风林带：全区唯一的一条绿。压到 0x5c6b4c —— 在满光旱地上，
         偏亮的绿会读成「草地」，这一刻它必须读成「灌木带」。 */
      enHedge: plainMat(0x5c6b4c, 0.97),
      enTealLit: new THREE.MeshStandardMaterial({ color: 0x0e3a40, roughness: 0.5,
        metalness: 0.1, emissive: 0x5fd6cc, emissiveIntensity: 0.85 })
    };
    /* 铜的自发光别给太高：1.5 在 ACES 下会直接推到白，金边读成一块白铁皮 */
    M.bronzeLit = B.emissive(0xffb85c, 0.9);
    M.beacon = B.emissive(0xffd48a, 2.4);
    /* 路面与人行道的颜色要手动转到线性空间。
       贴图材质由纹理走 sRGB 解码，纯色材质不走——同样的 hex，
       纯色在管线的输出端会亮一整档。沥青写 0x33383c，渲出来是中灰，
       于是整片路网和浅色人行道糊成一张水泥地。
       只对这三样做转换：它们是「必须黑下去」的地面材质，
       其余的楼保持原样，动全局会把前面七个区一起改掉。 */
    [M.asphalt, M.asphaltLight, M.sidewalk, M.kerb,
      M.hillStone, M.hillStone2, M.bridgeDeck, M.bridgeArch,
      /* 骑楼四色同病：0xa8967a 当线性色用，输出端是 0xe0d8cc 那种灰白，
         暖石读成水泥。这一区最要「旧」，必须压回线性。 */
      M.arcadeStone, M.arcadeStone2, M.arcadeStone3, M.arcadeStone4,
      M.arcadeTrim, M.roofFlat, M.roofFlat2, M.stationWarm,
      /* 广场铺装与缝：同病。不压线性，100 米铺装会亮成一块白板，
         广场反而比街区更抢眼。 */
      M.plazaPave, M.plazaJoint,
      /* D11：石拱、仿真塔、板楼。同病——纯色材质不压线性，暖石会发白 */
      M.museumStone, M.museumVault, M.museumTrim, M.emuBody, M.emuTrim,
      M.ringDeck, M.slabWall, M.slabWall2, M.slabWall3, M.slabTrim, M.slabBand,
      M.campusWall, M.campusWall2, M.campusTrim, M.campusBase,
      M.quayFace, M.quayStone, M.quayCap, M.quayDeck,
      /* D12：白墙与石渠同病。不压线性，0xe0ded2 会输出成接近纯白，
         弧楼在满光下变成一块没有明暗的白银，弧线就没了。 */
      M.ecoWhite, M.ecoWhite2, M.ecoWhite3, M.ecoRose,
      M.ecoTank, M.ecoTankDeep, M.ecoTimber, M.ecoStone, M.ecoStoneCap,
      M.ecoMint, M.ecoCrop, M.ecoSolar,
      /* D13：岸壁与盐白墙身同病。港区的混凝土不能输出成白色——
         一片白岸壁加白仓库，六台岸桥就沉进背景里了。 */
      M.portConcrete, M.portConcrete2, M.portConcrete3,
      M.portSteel, M.portSteelDeep, M.portRust,
      M.portShed, M.portShed2, M.portDoor,
      M.portFab, M.portFab2, M.portBand, M.portTank, M.portTank2, M.portSafety,
      M.portBallast, M.portSleeper,
      /* D14：米白墙与绿玻璃同病。不压线性，0xe6e2d4 会输出成接近纯白，
         蜂巢就变成一片白瓷砖，格子之间那道 0.6 米的缝全被光吃掉。 */
      M.hiveShell, M.hiveShell2, M.hiveShell3, M.hiveShellF, M.hiveShellF2, M.hiveTrim,
      M.hiveBase, M.hivePave, M.hiveJoint, M.hiveMetal, M.hiveSoil,
      M.hiveGlass, M.hiveGlass2,
      M.aiShellA, M.aiShellB, M.aiShellC, M.aiMullion,
      M.aiCrown, M.aiPodium, M.aiSoffit,
      /* D15：刷白墙与旧厂房同病。0xf2eee2 不压线性会输出成纯白，
         一片白盒子在满光下读成石膏模型；旧厂房的锈色不压则变成奶油色，
         「先有厂房」这条年代线就断了。 */
      M.dqPave, M.dqCourt, M.dqRender, M.dqRender2, M.dqGlass, M.dqTrim,
      M.dqTimber, M.dqTimberDark, M.dqStone,
      M.dqShed, M.dqShed2, M.dqShedRoof, M.dqMetal, M.dqDark,
      M.dqOrb, M.dqOrbBand, M.dqOrbDeck,
      M.dqReed, M.dqReed2, M.dqReedDry, M.dqMud,
      M.ymPave, M.ymPave2, M.ymStone, M.ymStone2, M.ymStone3,
      M.ymGlass, M.ymGlass2, M.ymMullion, M.ymBand, M.ymDark,
      M.ymLight, M.ymLight2, M.ymWater, M.ymWaterBed,
      M.ymGreen, M.ymGreen2, M.ymTerrace, M.ymTree, M.ymRoof,
      M.ymStone4, M.ymStone5, M.ymCanopy, M.ymLit,
      M.ymShop[0], M.ymShop[1], M.ymShop[2], M.ymShop[3],
      M.ymShop[4], M.ymShop[5], M.ymShop[6], M.ymShop[7], M.ymRoad,
      M.ymGlassShop,
      /* D17：旱地底与硬化坪同病。0xb5a888 当线性色直接输出会是米白，
         整片光伏海浮在一块奶油地板上，「旱区」这条就没了。 */
      M.enFrame, M.enGround, M.enGravel, M.enPad, M.enPad2,
      M.enRoad, M.enGalv, M.enTank, M.enTank2, M.enWing, M.enWing2, M.enTeal, M.enHedge
    ].forEach(function (mt) {
      if (mt && mt.color) mt.color.convertSRGBToLinear();
    });
    /* 品牌冠带：六家大厂各一条颜色，只上塔冠与角柱。
       整栋刷品牌色会把谷地变成糖纸，一条带子就够在灰底上认出是谁。 */
    M.brand = [plainMat(0x2f7fb8, 0.40, 0.34), plainMat(0xa8443f, 0.44, 0.28),
      plainMat(0xd8dde0, 0.38, 0.30), plainMat(0x2f8f80, 0.42, 0.30),
      plainMat(0x7fa03c, 0.46, 0.24), plainMat(0x3f7fa8, 0.40, 0.32)];
    /* 冠带自发光腰线：白泽那档是银白，发光要更冷更亮才有区分度 */
    M.brandLit = [B.emissive(0x6fc4ff, 1.5), B.emissive(0xff8b7a, 1.4),
      B.emissive(0xeaf4ff, 1.9), B.emissive(0x6ff0d6, 1.5),
      B.emissive(0xbfe86a, 1.4), B.emissive(0x8fd4ff, 1.5)];
    /* 集装箱：工业谷里唯一能大面积上饱和色的东西，也是近景的尺度标尺 */
    M.cont = [plainMat(0xb4552f, 0.86), plainMat(0x2f5c86, 0.84),
      plainMat(0x9c9a8c, 0.88), plainMat(0x6b7548, 0.86),
      plainMat(0x8f3a32, 0.86), plainMat(0x2f6f72, 0.84)];
    /* 港区箱色：比 M.cont 整体压一档饱和度。
       M.cont 是给「工业谷」那几排零散箱垛用的，一屏只有几十个；
       港区一屏有上千个，同一个饱和度的橙红在面积上翻二十倍，
       整片堆场就退化成乐高。港区的真实箱色是旧桶红、暗军绿、褪色蓝。 */
    M.portCont = [plainMat(0xa8653f, 0.90), plainMat(0x40647f, 0.90),
      plainMat(0x999486, 0.92), plainMat(0x76805a, 0.92),
      plainMat(0x94534a, 0.90), plainMat(0x527474, 0.90)];
    M.portCont.forEach(function (mt) { mt.color.convertSRGBToLinear(); });
    /* 光伏板：深蓝，机房谷里最该有的一片冷色 */
    M.pv = new THREE.MeshStandardMaterial({ color: 0x1f3f6b, roughness: 0.22, metalness: 0.55,
      envMapIntensity: 1.0 });
    /* 换班工人：高可视背心，工业谷里比花衬衫更像人 */
    M.vest = plainMat(0xd0662a, 0.9); M.vest2 = plainMat(0xd8a52a, 0.88);
    /* 屋顶瓦色：整片全用同一个赭红会像塑料玩具，老城要靠深浅换色拉开层次。
       工业区（coolRoof）只允许金属灰蓝——机房屋面上出现一片赭红瓦，
       整个谷地立刻退化成县城。但全灰也读不出产业：留两三个锈红与草绿的老化屋面板，
       俯视时屋顶占的画面比墙面还多，这是最省力的一层色。

       那几个锈红/草绿只对工业谷成立。研究院、湖区这类冷调区必须显式关掉
       （roofWarm:false）——一圈锈红屋面板撒在白墙园区里，比全灰更乱。 */
    var roofWarm = spec.roofWarm !== false;
    M.roofSet = spec.coolRoof ? (roofWarm
      ? [plainMat(0x5d6166, 0.92), plainMat(0x6d7276, 0.93),
        plainMat(0x7c7d72, 0.93), plainMat(0x4e5a63, 0.92), plainMat(0x8a8f8c, 0.94),
        plainMat(0x8a5236, 0.93), plainMat(0x63754f, 0.94), plainMat(0xa08c62, 0.93)]
      : [plainMat(0x5d6166, 0.92), plainMat(0x6d7276, 0.93), plainMat(0x7c7d72, 0.93),
        plainMat(0x4e5a63, 0.92), plainMat(0x8a8f8c, 0.94), plainMat(0x9aa3a6, 0.93),
        plainMat(0x64707a, 0.92), plainMat(0x828b8e, 0.94)])
      : [plainMat(0x9d5b44, 0.9), plainMat(0xa86b4c, 0.9), plainMat(0x8b523d, 0.91),
        plainMat(0xb2765a, 0.89), plainMat(0x7d564a, 0.92), M.roofGreyTile, plainMat(0x6d5a4e, 0.93),
        plainMat(0x956643, 0.9), plainMat(0x4e5a63, 0.92), plainMat(0x7c7d72, 0.93)];
    M.roofRoll = function (r) { return M.roofSet[Math.floor(r() * M.roofSet.length) % M.roofSet.length]; };
    /* 种植屋面：俯视时屋顶占的画面比墙面还多，全灰的屋面板会让整片园区读成石膏模型。
       研究园区的实验楼本来就常做屋顶绿化，换掉三成屋面板，
       草地就从地面「长」到屋顶上，画面立刻有了冷暖层次。 */
    if (spec.greenRoof) {
      var roofGreen = [plainMat(0x5c7147, 0.96), plainMat(0x51663f, 0.96),
        plainMat(0x687b4c, 0.95), plainMat(0x74875a, 0.95)];
      var roofRate = spec.greenRoof, roofSetLocal = M.roofSet;
      M.roofRoll = function (r) {
        if (r() < roofRate) return roofGreen[Math.floor(r() * roofGreen.length) % roofGreen.length];
        return roofSetLocal[Math.floor(r() * roofSetLocal.length) % roofSetLocal.length];
      };
    }
    if (spec.coolRoof) M.roofTile = M.roofSet[1];
    /* 每种颜色配 4 种窗型：点窗 / 带形窗 / 细格 / 幕墙。
       同一色板下也能排出完全不同的立面节奏，不会整条街一个样。 */
    var VARIANTS = [
      { floorH: 3.3, colW: 3.05, ratio: 0.56, metal: 0.10, rough: 0.78 },
      { floorH: 3.65, colW: 5.30, ratio: 0.86, metal: 0.34, rough: 0.30 },
      { floorH: 3.05, colW: 1.95, ratio: 0.50, metal: 0.08, rough: 0.84 },
      { floorH: 4.10, colW: 2.55, ratio: 0.66, metal: 0.62, rough: 0.16 }
    ];
    function buildWin(names, tag) {
      var out = [];
      names.forEach(function (name, ci) {
        var hex = typeof name === "number" ? name : PALETTE[name];
        if (hex === undefined) hex = 0xb9a68c;
        VARIANTS.forEach(function (v, vi) {
          out.push(facadeMat(hex, { floorH: v.floorH, colW: v.colW, ratio: v.ratio,
            metal: v.metal, rough: v.rough, seed: 17 + ci * 9 + vi * 31 + tag * 137,
            lit: spec.nightLit === undefined ? 0.22 : spec.nightLit,
            pane: spec.paneColor === undefined ? 0x2a3a44 : spec.paneColor }));
        });
      });
      return out;
    }
    var palAll = spec.palette && spec.palette.length ? spec.palette : ["white", "stoneGrey", "slate"];
    /* 路面必须自己带一点往前的深度偏移。
       只靠抬高路面（+0.22 / +0.46）在近距离够用，在 600 米外不够：
       near 0.5 / far 10000 的深度缓冲在 600 米处的分辨力就是 4–5 厘米，
       而 0.3 米的高差在 17° 低俯角下投影到视线方向只剩 9 厘米——
       路面和人行道落在同一个深度格子里，谁先画谁赢，输的总是沥青。
       地面材质早就用了 polygonOffset（见 ground 的注释），
       路面这里补上同一个手法，与距离无关。 */
    [M.asphalt, M.asphaltLight].forEach(function (mt) {
      mt.polygonOffset = true;
      mt.polygonOffsetFactor = -3;
      mt.polygonOffsetUnits = -10;
    });
    M.win = buildWin(palAll, 0);
    /* 主色 / 点缀色分离：老城的墙基本是同一族暖色，冷色只做零星跳色。
       不分的话 12 色随机撒开就是一块马赛克。 */
    M.winCore = spec.paletteCore && spec.paletteCore.length ? buildWin(spec.paletteCore, 1) : M.win;
    /* 点缀色必须单独成一组。以前是从整块色板里随机取，灰系和彩色混在一起，
       三成的点缀率落到彩色上只剩一成多，工业谷最后还是一整片灰。 */
    M.winAccent = spec.paletteAccent && spec.paletteAccent.length ? buildWin(spec.paletteAccent, 2) : null;
    var accentRate = spec.accentRate === undefined ? 0.10 : spec.accentRate;
    var lastMat = null;
    function pickMat() {
      var arr = (M.winAccent && rd() < accentRate) ? M.winAccent
        : ((M.winCore !== M.win && rd() > accentRate) ? M.winCore : M.win);
      var m = arr[Math.floor(rd() * arr.length)];
      if (m === lastMat && arr.length > 1) m = arr[(arr.indexOf(m) + 1) % arr.length];
      lastMat = m; return m;
    }

    /* --- 地形高度场 ---------------------------------------------------
       没有 spec.terrain 的区域一律返回 0，D01/D02 的每一行代码都按平地跑，
       不会被这里改动。智算谷则是一条真正的谷：两侧起岭、北端封口、谷底缓抬。
       所有落地构件（地面、路面、建筑基座、行道树、行人）都从这里取高度，
       否则坡上会浮起一排房子。 */
    var TER = spec.terrain || null;
    function sstep(a, b, v) {
      var t = (v - a) / (b - a);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return t * t * (3 - 2 * t);
    }
    function heightAt(x, z) {
      if (!TER) return 0;
      var ax = Math.abs(x);
      var kx = Math.pow(sstep(TER.floorX, TER.ridgeX, ax), TER.ridgePow === undefined ? 1.55 : TER.ridgePow);
      var kz = Math.pow(sstep(TER.headZ, TER.headEnd, -z), TER.headPow === undefined ? 1.34 : TER.headPow);
      var h = TER.ridgeH * kx + (TER.headH || 0) * kz * (1 - 0.5 * kx);
      /* 山脊不能是一条光滑的斜坡：几组不同波长的正弦叠上去，
         切出支脊、冲沟与鞍部，光才会在山面上打出层次。 */
      if (h > 0.4) {
        var spur = 0.20 * Math.sin(x * 0.0091 + z * 0.0052)
          + 0.13 * Math.sin(z * 0.0137 - x * 0.0021)
          + 0.07 * Math.sin((x + z) * 0.0213 + 1.1);
        h *= 1 + spur;
      }
      /* 谷底起伏只作用在还没起坡的地方，否则会和岭叠加出怪峰 */
      var flat = (1 - kx) * (1 - kz);
      if (TER.tilt) {
        var dz = TER.tiltRef - z;
        dz = Math.max(-(TER.tiltMax || 320), Math.min(TER.tiltMax || 320, dz));
        h += TER.tilt * dz * flat;
      }
      if (TER.undul) {
        h += TER.undul * flat * (Math.sin(x * 0.0088 + 1.7) * Math.cos(z * 0.0072 + 0.4)
          + 0.55 * Math.sin(x * 0.0043 - 0.6) * Math.sin(z * 0.0037 + 2.1));
      }
      /* 谷里的孤丘：真实山谷场平之后总会剩下几个搬不动的山包，
         路绕着它爬，周边地块自然抬高——谷底就不再是一张纸。 */
      var kn = TER.knolls;
      if (kn) {
        for (var ki = 0; ki < kn.length; ki++) {
          var kk = kn[ki], kdx = x - kk.x, kdz = z - kk.z;
          var kd = Math.sqrt(kdx * kdx + kdz * kdz);
          if (kd >= kk.r) continue;
          var kt = 1 - (kd / kk.r) * (kd / kk.r);
          h += kk.h * Math.pow(kt, 1.25) * flat;
        }
      }
      /* --- 河道下切 ---
         地形分支的地面是一张实心网格，不挖下去，水面会被它整个盖掉——
         河就成了一条看不见的暗渠。这里不能让网格开洞：网格格距近 20 米，
         按格子挖出来的洞是锯齿状的，近景一眼就穿。
         改成把地形压下去，让水面去「切」地形——岸线因此由地形本身决定，
         既是平滑的，也自带一道缓坡河滩，比一条水泥直壁自然。
         剖面是平底 + 斜岸：河心必须留出足够宽的平底，否则水面只剩中间一条线。 */
      var CH = TER.channel;
      if (CH && CH.pts) {
        var cd = distToPoly(CH.pts, x, z);
        if (cd < CH.half) {
          var chIn = (CH.flat === undefined ? 0.62 : CH.flat) * CH.half;
          var chD = CH.depth === undefined ? 4 : CH.depth;
          h -= cd <= chIn ? chD : chD * (1 - (cd - chIn) / (CH.half - chIn));
        }
      }
      /* 全城拼装：地形必须在自己的地块边界上收平。
         否则地块被裁成方形之后，山坡会在边界处被切出一道直上直下的断崖。 */
      if (CITY) {
        var tX = Math.abs(x) / PHX, tZ = Math.abs(z) / PHZ;
        h *= 1 - sstep(0.74, 0.99, Math.max(tX, tZ));
      }
      return h;
    }
    api.heightAt = heightAt;

    /* --- 光照：与全城同源 --- */
    /* 阴影相机不能盖满整个区域：940 米视锥摊到 2048 贴图上只有 0.46 米/像素，
       加上 near=1/far=2600 的深度精度，结果就是地面整片脏成阴影。
       改成只覆盖镜头附近 520 米，并跟随镜头移动。 */
    var SHADOW_HALF = 260;
    /* 全城拼装：太阳、天空、环境贴图只有一份，归全城管。片区这一层留一个空壳，
       把 setTime / update / inspect 都实现成空操作，其它代码一行都不用改。 */
    var rig = CITY ? stubRig() : YC3D_CITY.buildSkyRig(scene, {
      shadowHalfX: SHADOW_HALF, shadowHalfZ: SHADOW_HALF, shadowNear: 900, shadowFar: 1980,
      mapSize: 2048, normalBias: 0.10, bias: -0.00004, sunDistance: 1440,
      fogScale: spec.fogScale === undefined ? 3.4 : spec.fogScale, skyRadius: 2600,
      sunIntensity: spec.sunIntensity === undefined ? 1.35 : spec.sunIntensity,
      hemiScale: spec.hemiScale === undefined ? 0.60 : spec.hemiScale
    });
    api.sun = rig.sun; api.hemi = rig.hemi;
    api.updateEnvironment = rig.updateEnvironment;
    /* 阴影跟随：镜头挪到哪，阴影就重算哪一块 */
    api.followShadow = function (cx, cz) {
      var t = rig.sun.target.position;
      if (Math.abs(t.x - cx) < 0.6 && Math.abs(t.z - cz) < 0.6 && rig.sun.shadow.map) return;
      t.set(cx, 0, cz);
      rig.sun.position.copy(t).addScaledVector(api.state ? api.state.direction : new THREE.Vector3(0.1, 0.7, -0.3), 1440);
      rig.sun.shadow.needsUpdate = true;
    };

    /* --- 地面 --- */
    /* 一整片纯色地面在近景里就是一块地毯，必须给铺装分格和石屑才有尺度感。
       公园型的区反过来：铺装格线在大片草地上反而像瓷砖，
       这里改用色斑纹理（草地/土斑/碎石），草地才有起伏感。 */
    var lawnGround = spec.groundStyle === "lawn";
    var gBase = spec.groundColor === undefined ? 0x7c7f72 : spec.groundColor;
    var gTex = lawnGround ? lawnTexture(gBase, 733) : pavingTexture(gBase, 1);
    var gRep = lawnGround ? 64 : 24;
    var groundGeo = null, ground = null, groundShadow = null, hillMesh = null;
    var wspec0 = spec.water;
    if (TER) {
      /* 地形网格：一张网格按「谷底铺装 / 坡地山体」劈成两片，共享同一批顶点高度。
         分开画是因为谷底的铺装纹理铺到山坡上会变成一块石头贴纸；
         共享顶点是为了接缝既不裂开也不闪面。 */
      var S = CITY ? Math.max(PHX, PHZ) * 2.02 : R * 6.6, N = CITY ? 132 : 168;
      var cellT = S / N, gx0 = -S / 2, gz0 = -S / 2;
      var hgt = new Float32Array((N + 1) * (N + 1));
      for (var iz = 0; iz <= N; iz++) {
        for (var ix = 0; ix <= N; ix++) hgt[iz * (N + 1) + ix] = heightAt(gx0 + ix * cellT, gz0 + iz * cellT);
      }
      /* 铺装与山体的分界不按距离画，按坡度画：坡度一变陡就是场平边界。
         按矩形切会在四角切出一块爬上山的铺装，按圆切会留下一条圆弧接缝。 */
      function slopeOf(x, z) {
        var e = 8;
        return (Math.abs(heightAt(x + e, z) - heightAt(x - e, z))
          + Math.abs(heightAt(x, z + e) - heightAt(x, z - e))) / (2 * e);
      }
      var edgeT = R * (TER.floorEdge === undefined ? 1.08 : TER.floorEdge);
      function terrainHalf(isFloor) {
        var pos2 = [], uv2 = [], idx2 = [], vmap = {};
        function vert(ix, iz) {
          var k = iz * (N + 1) + ix;
          if (vmap[k] === undefined) {
            var wx = gx0 + ix * cellT, wz = gz0 + iz * cellT;
            vmap[k] = pos2.length / 3;
            pos2.push(wx, hgt[k], wz);
            if (isFloor) uv2.push(wx / 24, wz / 24);
            else uv2.push(wx / 52, wz / 52);
          }
          return vmap[k];
        }
        for (var jz = 0; jz < N; jz++) {
          for (var jx = 0; jx < N; jx++) {
            var cx2 = gx0 + (jx + 0.5) * cellT, cz2 = gz0 + (jz + 0.5) * cellT;
            var inside = Math.abs(cx2) <= edgeT && Math.abs(cz2) <= edgeT && slopeOf(cx2, cz2) < 0.055;
            if (inside !== isFloor) continue;
            var a1 = vert(jx, jz), b1 = vert(jx + 1, jz), c1 = vert(jx + 1, jz + 1), d1 = vert(jx, jz + 1);
            idx2.push(a1, d1, c1, a1, c1, b1);
          }
        }
        var gg = new THREE.BufferGeometry();
        gg.setAttribute("position", new THREE.Float32BufferAttribute(pos2, 3));
        gg.setAttribute("uv", new THREE.Float32BufferAttribute(uv2, 2));
        gg.setIndex(idx2); gg.computeVertexNormals();
        return gg;
      }
      gTex.repeat.set(1, 1);
      groundGeo = terrainHalf(true);
      /* 与平地分支同样的深度问题：坡地地面是一张 3300 米见方的网格，
         路只是浮在它上面 34 厘米——Z 判定根本不认这点高差，
         D06 智算谷的路从建成起一直被这块地面整条吃掉。
         polygonOffset 直接改深度值，不受远平面精度限制。 */
      ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: gTex, color: 0xffffff, roughness: 0.96, metalness: 0.02, envMapIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      ground.receiveShadow = true; scene.add(ground);
      hillMesh = new THREE.Mesh(terrainHalf(false), new THREE.MeshStandardMaterial({
        map: terrainTexture(spec.terrainTint === undefined ? 0x77765f : spec.terrainTint, 5),
        color: 0xffffff, roughness: 0.99, metalness: 0.0, envMapIntensity: 0.25,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      hillMesh.receiveShadow = true; scene.add(hillMesh);
    } else if (spec.basin) {
      /* 海：码头区的地面不是「在岸线上开一个洞」，而是整块地到此为止。
         开洞是湖的做法——湖被陆地包着，四周都是场平；
         海是城市的一侧边界，岸线以东根本不存在地面。
         所以这里不画 hole，直接把矩形地面的东边切在岸线上：
         三角化不会碰到「洞与外轮廓相交」这种会让 earcut 崩掉的情况，
         岸线也就是一条干干净净的直边。 */
      /* 场地必须铺到雾里去。原来 R*3.2（1984 米），而海铺到 2170 米——
         陆地的远边比海近，画面上就出现一条「地先结束、海还在」的台阶。
         现在陆与海同取 R*8 / R*16，两者的地平线落在同一个距离上，
         剩下的全部交给雾。 */
      var HB = CITY ? Math.max(PHX, PHZ) * 1.02 : R * 8, bsx = spec.basin.x0;
      var gShapeB = new THREE.Shape();
      gShapeB.moveTo(-HB, -HB);
      gShapeB.lineTo(bsx, -HB);
      gShapeB.lineTo(bsx, HB);
      gShapeB.lineTo(-HB, HB);
      gShapeB.closePath();
      groundGeo = new THREE.ShapeGeometry(gShapeB, 1);
      groundGeo.rotateX(-Math.PI / 2);
      gTex.repeat.set(1 / gRep, 1 / gRep);
      ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: gTex, color: 0xffffff, roughness: 0.96, metalness: 0.02, envMapIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      ground.receiveShadow = true; scene.add(ground);
    } else if (spec.lake) {
      /* 湖：地面要在湖的位置开洞，否则一整块地平面会把湖面盖得只剩一条暗渠。
         湖岸线是闭合多边形，直接拿它当 hole，边缘是平滑的 96 边形，没有锯齿。 */
      var HS3 = CITY ? Math.max(PHX, PHZ) : R * 3.2, shoreG = lakeShore(spec.lake);
      var gShape3 = new THREE.Shape();
      gShape3.moveTo(-HS3, -HS3); gShape3.lineTo(HS3, -HS3);
      gShape3.lineTo(HS3, HS3); gShape3.lineTo(-HS3, HS3);
      gShape3.closePath();
      var gHole3 = new THREE.Path();
      gHole3.moveTo(shoreG[0][0], -shoreG[0][1]);
      for (var ih = 1; ih < shoreG.length; ih++) gHole3.lineTo(shoreG[ih][0], -shoreG[ih][1]);
      gHole3.closePath();
      gShape3.holes.push(gHole3);
      groundGeo = new THREE.ShapeGeometry(gShape3, 1);
      groundGeo.rotateX(-Math.PI / 2);
      gTex.repeat.set(1 / gRep, 1 / gRep);
      ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: gTex, color: 0xffffff, roughness: 0.96, metalness: 0.02, envMapIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      ground.receiveShadow = true; scene.add(ground);
    } else if (wspec0 && wspec0.pts && wspec0.pts.length > 2) {
      /* 地面必须在河道位置开一个洞。整块地平面会把水面整个盖住，
         河就变成一条看不见的暗渠。 */
      var HS = CITY ? Math.max(PHX, PHZ) : R * 3, hw0 = (wspec0.w || 80) / 2;
      var wpts0 = wspec0.pts, nrms = [], i0;
      for (i0 = 0; i0 < wpts0.length; i0++) {
        var a0 = wpts0[Math.max(0, i0 - 1)], b0 = wpts0[Math.min(wpts0.length - 1, i0 + 1)];
        var dx0 = b0[0] - a0[0], dz0 = b0[1] - a0[1], L0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
        nrms.push([-dz0 / L0, dx0 / L0]);
      }
      var outline = [];
      for (i0 = 0; i0 < wpts0.length; i0++) {
        outline.push([wpts0[i0][0] + nrms[i0][0] * hw0, wpts0[i0][1] + nrms[i0][1] * hw0]);
      }
      for (i0 = wpts0.length - 1; i0 >= 0; i0--) {
        outline.push([wpts0[i0][0] - nrms[i0][0] * hw0, wpts0[i0][1] - nrms[i0][1] * hw0]);
      }
      var gShape = new THREE.Shape();
      gShape.moveTo(-HS, -HS); gShape.lineTo(HS, -HS); gShape.lineTo(HS, HS); gShape.lineTo(-HS, HS);
      gShape.closePath();
      /* ShapeGeometry 在 XY 平面，绕 X 转 -90° 后世界 z = -shapeY，所以纵坐标取负 */
      var gHole = new THREE.Path();
      gHole.moveTo(outline[0][0], -outline[0][1]);
      for (i0 = 1; i0 < outline.length; i0++) gHole.lineTo(outline[i0][0], -outline[i0][1]);
      gHole.closePath();
      gShape.holes.push(gHole);
      groundGeo = new THREE.ShapeGeometry(gShape, 1);
      groundGeo.rotateX(-Math.PI / 2);
      /* ShapeGeometry 的 uv 就是形状坐标本身，所以贴图重复率按 1 米算 */
      gTex.repeat.set(1 / gRep, 1 / gRep);
      ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: gTex, color: 0xffffff, roughness: 0.96, metalness: 0.02, envMapIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      ground.receiveShadow = true; scene.add(ground);
    } else {
      groundGeo = CITY ? new THREE.PlaneGeometry(PHX * 2, PHZ * 2) : new THREE.PlaneGeometry(R * 6, R * 6);
      groundGeo.rotateX(-0);
      gTex.repeat.set((CITY ? PHX * 2 : R * 6) / gRep, (CITY ? PHZ * 2 : R * 6) / gRep);
      /* 地面必须往后让几格深度。
         整片地面是一张 2820 米见方的板，机位在 620 米上、near 0.5 / far 10000，
         深度缓冲在这段距离上的分辨力是分米级的——路面抬高 20 厘米根本不算「更高」。
         结果就是从 D01 起，所有区的道路都被地面整条吃掉：路生成了、宽度也对，
         只是一条都看不见。polygonOffset 直接改深度值，不受这个分辨力限制。 */
      ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: gTex, color: 0xffffff, roughness: 0.96, metalness: 0.02, envMapIntensity: 0.35,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8
      }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true; scene.add(ground);
      groundShadow = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0.26,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 }));
      groundShadow.rotation.x = -Math.PI / 2; groundShadow.position.y = 0.03;
      groundShadow.receiveShadow = true; scene.add(groundShadow);
    }

    /* --- 路网 --- */
    var roads = planRoads(spec, R);
    var hero = spec.hero || [];
    /* 地标与广场先占位：穿过它们的道路被切断，形成「超级街块 + 断头路」的城市场景，
       而不是让马路一头撞进主塔里。 */
    var blockers = [];
    hero.forEach(function (h) {
      /* block:false —— 门这类「中间是空的」地标不能切路。
         blocker 的盒子是轴对齐的，一道 90 米宽的斜门旋转 51° 之后，
         包围盒在垂直方向上有 79 米厚，整整一个街区的路会被它吃掉；
         而门的中间本来就是门洞，路应该直接穿过去。 */
      if (h.block === false) return;
      blockers.push({ x: h.x || 0, z: h.z || 0, w: (h.w || 60) * 1.06, d: (h.d || 50) * 1.06 });
    });
    (spec.plazas || []).forEach(function (p) {
      blockers.push({ x: p.x, z: p.z, w: p.w + 8, d: p.d + 8 });
    });
    function inBlocker(x, z) {
      for (var i = 0; i < blockers.length; i++) {
        var b = blockers[i];
        if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) return true;
      }
      return false;
    }
    /* spec.noBuild：只禁建、不切路。
       中轴这种「必须一直空着」的走廊用它——套 blocker 会把穿过它的横路一起切了，
       结果是一堆莫名其妙的断头路。 */
    var noBuild = spec.noBuild || [];
    /* b.a：斜街区必须能转。D10 的主街是 30.7° 斜的，
       用轴对齐矩形去清「骑楼带」，清出来的是一个 46×760 的正方块——
       街中间被清空的那条通道跟街本身错开三十度，两头翘出去两三百米。 */
    function inNoBuild(x, z) {
      for (var i = 0; i < noBuild.length; i++) {
        var b = noBuild[i];
        var dx = x - b.x, dz = z - b.z;
        if (b.a) {
          var ca = Math.cos(b.a), sa = Math.sin(b.a);
          var lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
          dx = lx; dz = lz;
        }
        if (Math.abs(dx) <= b.w / 2 && Math.abs(dz) <= b.d / 2) return true;
      }
      return false;
    }
    /* noBuild 必须按「占地」判，只判中心是不够的。
       D13 的铁路走廊是一条 34 米宽的竖带（x 88…122），临街排布在 x≈123 落下一栋
       41 米面宽的厂房：中心在走廊外 1.4 米，四角已经横跨三条股道——俯视图里
       就是一栋楼骑在铁路上，路还从它中间穿过去。inWater 早就吃过这个亏
       （中心在岸上 8 米、四角已经伸进河里），这里用同一种解法：
       中心 + 四角 + 四边中点，九个采样点全判。 */
    var NB_SAMP = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    function inNoBuildBox(x, z, hw, hd, ang) {
      if (inNoBuild(x, z)) return true;
      if (!(hw > 0) || !(hd > 0)) return false;
      /* 与 place() 里四角的算法同一套局部轴约定，否则旋转过的楼判出来是个歪框 */
      var ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
      var ax = hw * ca, az = -hw * sa, bx = hd * sa, bz = hd * ca;
      for (var i = 0; i < NB_SAMP.length; i++) {
        var s = NB_SAMP[i];
        if (inNoBuild(x + ax * s[0] + bx * s[1], z + az * s[0] + bz * s[1])) return true;
      }
      return false;
    }
    var clipped = [];
    roads.forEach(function (r) {
      var run = [];
      for (var i = 0; i < r.pts.length; i++) {
        if (inBlocker(r.pts[i][0], r.pts[i][1])) {
          if (run.length > 1) clipped.push({ pts: run.slice(), w: r.w, cls: r.cls,
            stone: r.stone, asphalt: r.asphalt, axis: r.axis });
          run = [];
        } else run.push(r.pts[i]);
      }
      /* 切片时必须把 asphalt 一起带过去：漏字段的代价是「大道改沥青」设了不生效，
         而且完全没有报错——路照修，颜色照旧，只有对比图能看出来。 */
      if (run.length > 1) clipped.push({ pts: run, w: r.w, cls: r.cls, stone: r.stone,
        asphalt: r.asphalt, axis: r.axis });
    });
    roads = clipped;
    api.roads = roads;
    var index = new RoadIndex(roads, 70);
    var roadGroup = new THREE.Group(); scene.add(roadGroup);

    function ribbon(pts, w, y, mat, off) {
      var pos = [], idx = [], n = pts.length;
      for (var i = 0; i < n; i++) {
        var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
        var nx = -dz / len, nz = dx / len, o = off || 0;
        var lx = p[0] + nx * (w / 2 + o), lz = p[1] + nz * (w / 2 + o);
        var rx = p[0] - nx * (w / 2 + o), rz = p[1] - nz * (w / 2 + o);
        pos.push(lx, y + heightAt(lx, lz), lz, rx, y + heightAt(rx, rz), rz);
      }
      for (var k = 0; k < n - 1; k++) { var q = k * 2; idx.push(q, q + 2, q + 3, q, q + 3, q + 1); }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      var m = new THREE.Mesh(geo, mat); m.receiveShadow = true; roadGroup.add(m); return m;
    }
    /* 单侧条带：整体沿法线平移 off，宽度 w 不再对称外扩。
       ribbon 的 off 是「两边同时外扩」，拿它铺压顶石/滨河步道会得到一条盖住整条河的地毯。 */
    function stripOn(pts, off, w, y, mat) {
      var pos = [], idx = [], n = pts.length;
      for (var i = 0; i < n; i++) {
        var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
        var nx = -dz / len, nz = dx / len;
        var lx = p[0] + nx * (off + w / 2), lz = p[1] + nz * (off + w / 2);
        var rx = p[0] + nx * (off - w / 2), rz = p[1] + nz * (off - w / 2);
        pos.push(lx, y + heightAt(lx, lz), lz, rx, y + heightAt(rx, rz), rz);
      }
      for (var k = 0; k < n - 1; k++) { var q = k * 2; idx.push(q, q + 2, q + 3, q, q + 3, q + 1); }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      var m2 = new THREE.Mesh(geo, mat); m2.receiveShadow = true; scene.add(m2); return m2;
    }
    roads.forEach(function (r) {
      var major = r.cls === "avenue";
      var stone = spec.streetStyle === "stone";
      /* 路面高度：2/6 厘米是「铺一张纸」，不是「铺一条路」。
         620 米的机位下，深度缓冲在这段距离上的分辨力是分米级的，
         沥青和地面差 6 厘米正好落在分辨力的边缘上——整条路会被地面吃掉。
         两层之间也要拉开：人行道 0.12、车行道 0.34，
         差 22 厘米，沥青芯才不会被人行道盖回浅灰。 */
      ribbon(r.pts, r.w + Math.min(9, r.w * 0.45), 0.12, stone ? M.paving : M.sidewalk);
      /* 路缘石：比路面宽出 0.9 米的一圈浅色窄边，夹在人行道与车行道之间。
         俯视图里沥青是深灰、草地是暗绿，两者在 600 米机位上明度差不够，
         方环会读成「草地上一道道浅沟」。一圈石边直接把路的轮廓钉出来，
         也让方环在俯视图里像铺装过的干道，而不是踩出来的土路。 */
      if (r.w >= 12) ribbon(r.pts, r.w + 1.8, 0.30, M.kerb);
      /* 沥青必须抬到 0.46，不能只比路缘石高 4 厘米。
         低俯角（phi 0.29，视线与地面夹角 17°）下，4 厘米的高差
         投影到深度上只有 1 厘米出头，正好落在深度缓冲的分辨力边缘——
         结果整条路被路缘石那条 27.8 米宽的带子完全盖住，
         画面里只剩一条土黄色的「路」，D12 第一版就是这么错的。
         0.30 → 0.46 是 16 厘米差，任何俯角下都分得开。 */
      /* r.stone：单条路自己指定「铺装」而不是沥青。
         D15 的六条 10 米次巷铺沥青就是六条黑渠——巷宽只有大街的 38%，
         浅色地面上的高对比反而更抢眼，整片网格读成一张黑网。
         设计社区的巷子本来就是石板。 */
      /* r.asphalt：单条路强制走沥青。
         spec.streetStyle === "stone" 是**全区**开关，它会把每一条路的车行道
         都铺成石板——包括 46 米的中央大道。结果车行道和两侧人行道同一个色，
         整条街读成一块 64 米宽的空石头场，人再多也不像「街」。
         要给大道单独压深，只能有一个比全区开关优先级更高的字段。 */
      var paved = r.asphalt ? false : (stone || r.stone);
      /* spec.roadMat：本区自己的车行道材质。D16 的曝光把默认沥青压成一团黑，
         路面上的车和车道线全看不见；换一条中深暖灰才读成「路」而不是「沟」。 */
      var asM = (spec.roadMat && M[spec.roadMat]) || M.asphalt;
      ribbon(r.pts, r.w, 0.46, paved ? M.paving3
        : (major ? asM : M.asphaltLight));
      if (major) {
        /* 中心虚线 */
        for (var i = 0; i < r.pts.length - 1; i++) {
          var a = r.pts[i], b = r.pts[i + 1];
          var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
          /* 中线：间隔 20 米、线长 6 米。
             早先 14 米一循环、7 米一段，在 600 米的机位上整条路
             读成一串亮珠子——虚线密到一定程度就不再是线，是噪点。 */
          var steps = Math.max(1, Math.round(len / 20));
          for (var s = 0; s < steps; s++) {
            var t = (s + 0.5) / steps;
            var ddx = a[0] + dx * t, ddz = a[1] + dz * t;
            put(roadGroup, BOX, 0.40, 0.03, Math.min(6, len / steps * 0.4),
              ddx, 0.50 + heightAt(ddx, ddz), ddz, M.paint, Math.atan2(dx, dz));
          }
        }
      }
    });

    /* --- 高架城际线：这一区的主语。线路在道路之后铺，
       桥墩才能压在路面上而不是被路面盖住。 --- */
    if (spec.viaduct && spec.viaduct.pts && spec.viaduct.pts.length > 1) {
      buildViaduct(scene, spec.viaduct, M);
    }

    /* --- 河道：老城的地形主体。河床、水面、石砌驳岸、滨河步道 --- */
    var waterSpec = spec.water || null;
    var waterPts = waterSpec ? waterSpec.pts : null;
    var waterHalf = waterSpec ? (waterSpec.w || 80) / 2 : 0;
    function distToPoly(pts, x, z) {
      var best = 1e9;
      for (var i = 0; i < pts.length - 1; i++) {
        var ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
        var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        var t = ((x - ax) * dx + (z - az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var px = ax + dx * t, pz = az + dz * t;
        var d = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
        if (d < best) best = d;
      }
      return best;
    }
    function inWater(x, z) {
      /* 海：一条直线岸。判据不是距离而是半平面——
         岸线以东全是水，没有「对岸」这回事，用距离判据会让整片海
         变成一个巨大的「岸线附近」，岸上 300 米内的房子全被否掉。 */
      if (spec.basin) {
        var bGap = spec.shoreGap === undefined ? 5 : spec.shoreGap;
        return x > spec.basin.x0 - bGap;
      }
      /* 湖是闭合多边形：射线法判内外，不能再用「到岸线的距离」。
         距离判据会把整个湖心当成陆地，一湖房子直接长在水上。 */
      if (lakePoly) {
        var nL = lakePoly.length, ins = false, il, jl;
        for (il = 0, jl = nL - 1; il < nL; jl = il++) {
          var xi = lakePoly[il][0], zi = lakePoly[il][1];
          var xj = lakePoly[jl][0], zj = lakePoly[jl][1];
          if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;
        }
        /* 岸线外 7 米也不许落房：驳岸、压顶石、环湖步道要占掉这一圈。
           收尾那段必须补上，否则首尾之间会漏出一条缝。 */
        if (ins) return true;
        var bestL = 1e9;
        for (il = 0; il < nL; il++) {
          var la = lakePoly[il], lb = lakePoly[(il + 1) % nL];
          var ldx = lb[0] - la[0], ldz = lb[1] - la[1], lL2 = ldx * ldx + ldz * ldz || 1;
          var lt = ((x - la[0]) * ldx + (z - la[1]) * ldz) / lL2;
          lt = lt < 0 ? 0 : lt > 1 ? 1 : lt;
          var lpx = la[0] + ldx * lt, lpz = la[1] + ldz * lt;
          var ld = (x - lpx) * (x - lpx) + (z - lpz) * (z - lpz);
          if (ld < bestL) bestL = ld;
        }
        /* 岸线外的禁区宽度。7 米对深湖够用；浅水塘的岸外还有一圈芦苇滩，
           房子退 7 米等于长在苇子里，D12 必须自己给一个更大的数。 */
        var lg = spec.shoreGap === undefined ? 7 : spec.shoreGap;
        return bestL < lg * lg;
      }
      if (!waterPts) return false;
      /* 岸线外的禁区宽度。默认 5 米只够"技术上不踩水"——
         地形在岸线外 266 米处才回到 0，也就是说水线往陆侧还有
         一圈 1.5 米深的缓坡；房子退 5 米，等于站在离水面 1.2 米高的
         浅坡上，从远处看就是"立在水里"。滨水区必须自己给大值。 */
      return distToPoly(waterPts, x, z) < waterHalf + (spec.shoreGap === undefined ? 5 : spec.shoreGap);
    }
    if (waterSpec) {
      var depth = waterSpec.depth === undefined ? 3.4 : waterSpec.depth;
      var surfY = waterSpec.surfY === undefined ? -1.5 : waterSpec.surfY;
      /* 法线贴图的横向重复率。UV 是按米给的（u = 宽度/48），
         所以 80 米宽的河只摊到 1.7 个循环，天然正常；
         520 米宽的湾要摊 10.8 个循环，太阳的镜面高光会按循环周期
         排成一片均匀的白点——远看像湖面上漂满垃圾。
         水越宽，横向重复率要越低，高光的密度才和河一样。 */
      var nrep = waterSpec.nrm === undefined ? 1 : waterSpec.nrm;
      var rivNrm = waterNormal(713);
      rivNrm.repeat.set(nrep, 1);
      var rivNrm2 = waterNormal(2371);
      rivNrm2.repeat.set(nrep, 1);
      var riverMat = waterMaterial(rivNrm, rivNrm2, 0x2f4f54, 0.62);
      /* 河床和水面是两张几乎平行的板。机位在 800 米外，深度缓冲在这个距离上
         的分辨力是「十几米」级的（软件渲染只有 16 位深度），1.5 米的落差根本不算落差——
         河床会在整条河上压着水面打架，水面被切成几块发亮的楔形。
         两个办法一起上：把床压到水面下 3.5 米，再让它整体往远处偏一点深度。 */
      var bedMat = new THREE.MeshStandardMaterial({ color: 0x22302e, roughness: 0.99, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 24 });
      var quayMat = new THREE.MeshStandardMaterial({ color: 0x8a8377, roughness: 0.95,
        metalness: 0.02, side: THREE.DoubleSide });
      /* 水面单独建：法线贴图需要 uv，ribbon 没有 uv 通道 */
      function waterSurface(pts, w, y, mat) {
        var pos = [], uv = [], idx = [], n = pts.length, cum = 0, i;
        for (i = 0; i < n; i++) {
          var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
          var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
          var nx = -dz / len, nz = dx / len, hw = w / 2;
          if (i > 0) {
            var pr = pts[i - 1];
            cum += Math.sqrt((p[0] - pr[0]) * (p[0] - pr[0]) + (p[1] - pr[1]) * (p[1] - pr[1]));
          }
          pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
          uv.push(0, cum / 48, w / 48, cum / 48);
        }
        for (var k = 0; k < n - 1; k++) { var q = k * 2; idx.push(q, q + 2, q + 3, q, q + 3, q + 1); }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        /* 水面是一整块朝上的平面，法线直接写死 (0,1,0)。
           交给 computeVertexNormals() 去算，河湾内侧相邻顶点的法线会被平均歪，
           一整段水面上会浮出几块发亮的楔形——那是法线被摊平，不是反光。 */
        var nrmArr = new Float32Array(pos.length);
        for (var vi = 1; vi < nrmArr.length; vi += 3) nrmArr[vi] = 1;
        geo.setAttribute("normal", new THREE.BufferAttribute(nrmArr, 3));
        var m3 = new THREE.Mesh(geo, mat); m3.receiveShadow = true; scene.add(m3); return m3;
      }
      function wallRibbon(pts, off, yBot, yTop, mat) {
        var pos = [], idx = [], n = pts.length;
        for (var i = 0; i < n; i++) {
          var pp = pts[i], aa = pts[Math.max(0, i - 1)], bb = pts[Math.min(n - 1, i + 1)];
          var dx = bb[0] - aa[0], dz = bb[1] - aa[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
          var nx = -dz / len, nz = dx / len;
          var wx = pp[0] + nx * off, wz = pp[1] + nz * off;
          pos.push(wx, yBot, wz, wx, yTop, wz);
        }
        for (var k = 0; k < n - 1; k++) { var q = k * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        var m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m;
      }
      /* 河床不能再走 ribbon：ribbon 会给每个顶点再加一次 heightAt。
         D09 的河槽已经由 heightAt 下切过一遍，床面被这一加又抬回水面附近，
         和水面挤在同一层深度上——整条河裂成几块发亮的楔形。
         床面直接铺在水面下 1.5 米，不参与地形起伏，它只负责在岸边补住接缝。 */
      waterSurface(waterPts, waterHalf * 2 + 2, surfY - 3.5, bedMat);
      waterSurface(waterPts, waterHalf * 2, surfY, riverMat);
      /* soft：这一侧的岸是「软岸」——滩涂、芦苇、湿地。
         不铺压顶石、不铺 9 米滨河步道、不立栏杆、不种行道树。
         默认 0＝两岸硬质，前十四区全是这样。
         D15 的南岸 144 米整片是湿地；一条 9 米步道加一道金属栏杆横在芦苇前，
         「水退出去」这件事就没了——岸是长出来的，不是被框住的。
         驳岸墙仍然保留：水面在 −1.5 米，没有这道墙，岸线会露出 1.7 米的断口。 */
      var softSide = waterSpec.soft || 0;
      /* 软岸：石压顶、滨河步道、栏杆、行道树全部不铺，护岸也换泥岸。
         只省掉压顶是不够的——一圈灰色浆砌石护岸立在芦苇滩前面，
         这条岸就还是「渠」，不是「滩」。 */
      var softMat = (waterSpec.softMat && M[waterSpec.softMat]) || quayMat;
      [-1, 1].forEach(function (sd) {
        wallRibbon(waterPts, sd * waterHalf, -depth, 0.18,
          (softSide && sd === softSide) ? softMat : quayMat);
        if (softSide && sd === softSide) return;
        /* 压顶石 + 滨河步道：水面和地面之间必须有这两层过渡，否则河像一条贴纸。
           用单侧条带，绝不能再用 ribbon 的对称 off。 */
        stripOn(waterPts, sd * (waterHalf - 1.1), 2.6, 0.22, M.civicTrim);
        stripOn(waterPts, sd * (waterHalf + 4.6), 9, 0.12, M.sidewalk);
      });
      /* 滨河栏杆 + 行道树：没有这两样，河岸就是一条 9 米宽的水泥带子。
         栏杆逐段建，每段按该段切向转角度，才能贴着弯曲河道走。 */
      [-1, 1].forEach(function (sd) {
        if (softSide && sd === softSide) return;    /* 软岸不立栏杆、不种树 */
        var railing = 0;
        for (var ri = 0; ri < waterPts.length - 1; ri++) {
          var ra = waterPts[ri], rb = waterPts[ri + 1];
          var rdx = rb[0] - ra[0], rdz = rb[1] - ra[1];
          var rlen = Math.sqrt(rdx * rdx + rdz * rdz) || 1;
          var rnx = -rdz / rlen, rnz = rdx / rlen;
          var roff = sd * (waterHalf + 0.5);
          var rmx = (ra[0] + rb[0]) * 0.5 + rnx * roff, rmz = (ra[1] + rb[1]) * 0.5 + rnz * roff;
          var rang = Math.atan2(-rdz, rdx);
          put(roadGroup, BOX, rlen + 0.12, 0.1, 0.1, rmx, 1.24, rmz, M.metalDark).rotation.y = rang;
          put(roadGroup, BOX, rlen + 0.12, 0.06, 0.06, rmx, 0.72, rmz, M.metalDark).rotation.y = rang;
          /* 立柱每 3.2 米一根，密度足够才不像断掉 */
          for (var rp2 = 0; rp2 < rlen; rp2 += 3.2) {
            var t3 = rp2 / rlen;
            put(roadGroup, BOX, 0.13, 1.24, 0.13,
              ra[0] + rdx * t3 + rnx * roff, 0.62, ra[1] + rdz * t3 + rnz * roff, M.metalDark);
          }
          railing++;
        }
        /* 树：两岸外侧各一排，避开桥位 */
        for (var ti = 10; ti < waterPts.length - 1; ti += 2) {
          var tp = waterPts[ti], tj = waterPts[ti + 1];
          var tdx = tj[0] - tp[0], tdz = tj[1] - tp[1], tl = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
          var tnx = -tdz / tl, tnz = tdx / tl, toff = sd * (waterHalf + 8.6);
          var tx2 = tp[0] + tnx * toff, tz2 = tp[1] + tnz * toff;
          var th = 4.2 + rd() * 2.6;
          put(roadGroup, CYL6, 0.42, th, 0.42, tx2, th / 2, tz2, M.trunk);
          put(roadGroup, SPH, 5.6 + rd() * 2.2, 4.2 + rd() * 1.6, 5.6 + rd() * 2.2,
            tx2, th + 2.0, tz2, rd() < 0.5 ? M.leaf : M.leaf2);
        }
      });
      /* 系船石墩：沿岸每 26 米一个，只有近景才看得见，但决定了尺度感。
         moor:0 关掉——两岸各一排 1.1 米高的白柱，在 520 米宽的水面上
         会变成湖心散布的白点，远看像漂满垃圾；而且有长堤的一侧
         本来就该系在堤上，不该另立石墩。 */
      var wi = waterSpec.moor === 0 ? null : polyLen(waterPts);
      for (var ws = 14; wi && ws < wi.total - 14; ws += 26) {
        var wp = atPoly(waterPts, wi.cum, ws);
        [-1, 1].forEach(function (sd2) {
          var nx2 = -Math.sin(wp.ang), nz2 = -Math.cos(wp.ang);
          put(roadGroup, CYL6, 0.7, 1.1, 0.7,
            wp.x + nx2 * sd2 * (waterHalf - 1.2), 0.4, wp.z + nz2 * sd2 * (waterHalf - 1.2), M.civicDark);
        });
      }
    }

    /* --- 湖：研究院的地形主体 ---
       河是折线带状，湖是闭合多边形，两者几何完全不同，这里自带一套构造。
       湖岸线由 lakeShore 给出，和环湖路、建筑避让用的是同一条曲线。 */
    /* --- 海：一条直线岸外的整片水面 ---
       水面用 PlaneGeometry 而不是 ShapeGeometry：uv 要是 0..1。
       ShapeGeometry 的 uv 是世界米，2000 米的海面会把法线图铺成一块亚麻布；
       Plane 的 uv 天然归一，repeat 直接按「多少米一格」算。 */
    if (spec.basin) {
      var bsp = spec.basin;
      var seaSurf = bsp.surfY === undefined ? -2.6 : bsp.surfY;
      /* 单区展示时海要铺到 12×R 以外，让地平线落在雾里。
         但拼进全城后，12×R 的海会盖掉邻区——D13 的 R 是 620，海有 7440×9920 米，
         一摊开就把整座城的东半边泡进水里。全城模式下海只留「岸线到地块东缘」
         这一条，南北同取地块外扩后的半边长，正好填满地面矩形，不留缝也不越界。 */
      var SEA_HB = Math.max(PHX, PHZ) * 1.02;
      var seaW = CITY ? Math.max(120, SEA_HB - bsp.x0 + 6) : R * 12;
      var seaD = CITY ? SEA_HB * 2 : R * 16;
      var sN1 = waterNormal((bsp.seed || 401) * 11 + 3);
      var sN2 = waterNormal((bsp.seed || 401) * 5 + 61);
      var sTile = bsp.tile === undefined ? 130 : bsp.tile;
      sN1.repeat.set(seaW / sTile, seaD / sTile);
      sN2.repeat.set(seaW / (sTile * 0.68), seaD / (sTile * 0.68));
      var seaMat = waterMaterial(sN1, sN2,
        bsp.color === undefined ? 0x27454f : bsp.color,
        bsp.shine === undefined ? 0.42 : bsp.shine,
        THREE.DoubleSide, bsp.refl === undefined ? 0.20 : bsp.refl);
      /* 大水面上的高频法线在掠射角会闪成一片碎银。海必须「平」，
         但也不能平到像一块刷过漆的板：0.11 是「看得见水在动、
         又不会在远处碎成一片白点」的那一档。 */
      seaMat.normalScale.set(0.11, 0.11);
      var seaGeo = new THREE.PlaneGeometry(seaW, seaD, 1, 1);
      seaGeo.rotateX(-Math.PI / 2);
      var seaMesh = new THREE.Mesh(seaGeo, seaMat);
      seaMesh.position.set(bsp.x0 + seaW / 2 - 6, seaSurf, 0);
      seaMesh.receiveShadow = true;
      scene.add(seaMesh);
      /* 岸壁脚下的水影试过一版：一条 52 米宽的半透明深色带。
         俯视时确实有「墙根更深」的层次，但只要机位压低到 12°，
         那条带子的外沿就变成一道横贯整片海的硬直线——
         比「水色单一」假得多。深度感交给岸壁本身的高度与阴影。 */
    }

    var lakeSpec = spec.lake || null;
    var lakePoly = lakeSpec ? lakeShore(lakeSpec) : null;
    if (lakeSpec) {
      var lk = lakeSpec;
      var lSurf = lk.surfY === undefined ? -0.9 : lk.surfY;
      var lDepth = lk.depth === undefined ? 4.6 : lk.depth;
      var lN1 = waterNormal((lk.seed || 77) * 13 + 5);
      var lN2 = waterNormal((lk.seed || 77) * 7 + 91);
      /* ShapeGeometry 的 uv 就是世界坐标（米），所以贴图重复率按米算 */
      lN1.repeat.set(1 / 46, 1 / 46); lN2.repeat.set(1 / 46, 1 / 46);
      /* 湖面是整片画面的主体，不能是一块深色塑料布，但也不能靠环境反射去提亮：
         环境贴图在天空与地面之间有一条硬地平线，反射向量扫过它的时候，
         整片水会沿一条直线突然从深蓝跳到灰白——像贴图接缝，不像水。
         所以反射压到 0.30，靠抬亮水色本身来读「水」。 */
      /* 水色可覆盖。默认 0x3b6068 是深湖的蓝灰；湿地的水只有 2 米深、
         水下是草根与腐殖土，反射压到 0.22 就够，颜色应偏绿偏浅。 */
      var lakeMat = waterMaterial(lN1, lN2,
        lk.color === undefined ? 0x3b6068 : lk.color,
        lk.shine === undefined ? 0.50 : lk.shine,
        THREE.DoubleSide, lk.refl === undefined ? 0.30 : lk.refl);
      var lakeBedMat = new THREE.MeshStandardMaterial({ color: 0x1e2b28, roughness: 0.99,
        metalness: 0.0, side: THREE.DoubleSide });
      var lakeStone = new THREE.MeshStandardMaterial({ color: 0x8f8878, roughness: 0.94,
        metalness: 0.02, side: THREE.DoubleSide });

      /* 形状按世界坐标直接建。绕 X 转 -90° 后世界 z = -shapeY，所以纵坐标取负。
         ShapeGeometry 的三角化跟随轮廓绕向，这里补成双面，免得半个湖面被背面剔除。 */
      function lakeFill(off, y, mat) {
        var P = off ? polyOffset(lakePoly, off) : lakePoly;
        var sh = new THREE.Shape();
        sh.moveTo(P[0][0], -P[0][1]);
        for (var i2 = 1; i2 < P.length; i2++) sh.lineTo(P[i2][0], -P[i2][1]);
        sh.closePath();
        var gp = new THREE.ShapeGeometry(sh, 1);
        gp.rotateX(-Math.PI / 2);
        gp.translate(0, y, 0);
        var m2 = new THREE.Mesh(gp, mat);
        m2.receiveShadow = true; scene.add(m2); return m2;
      }
      /* 环形带：把两条等距线之间的地面铺出来（压顶石、环湖步道都用它） */
      function lakeBand(offA, offB, y, mat) {
        var A = polyOffset(lakePoly, offA), B = polyOffset(lakePoly, offB), nL = lakePoly.length;
        var pos = [], idx = [];
        for (var i2 = 0; i2 < nL; i2++) pos.push(A[i2][0], y, A[i2][1], B[i2][0], y, B[i2][1]);
        for (var k2 = 0; k2 < nL; k2++) {
          var q = k2 * 2, q2 = ((k2 + 1) % nL) * 2;
          idx.push(q, q + 1, q2 + 1, q, q2 + 1, q2);
        }
        var gp = new THREE.BufferGeometry();
        gp.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        gp.setIndex(idx); gp.computeVertexNormals();
        var m2 = new THREE.Mesh(gp, mat); m2.receiveShadow = true;
        scene.add(m2); return m2;
      }
      /* 湖床必须沉到水面下四米多，水面才有「深度」；
         贴在地面上的水面读起来就是一块塑料布。 */
      lakeFill(-2.0, -lDepth, lakeBedMat);
      lakeFill(0, lSurf, lakeMat);
      /* 驳岸：一圈石墙从湖床直上到岸顶，挡住水面与地面的断口 */
      (function () {
        var nL = lakePoly.length, pos = [], idx = [];
        for (var i2 = 0; i2 < nL; i2++) {
          pos.push(lakePoly[i2][0], -lDepth, lakePoly[i2][1], lakePoly[i2][0], 0.26, lakePoly[i2][1]);
        }
        for (var k2 = 0; k2 < nL; k2++) {
          var q = k2 * 2, q2 = ((k2 + 1) % nL) * 2;
          idx.push(q, q + 1, q2 + 1, q, q2 + 1, q2);
        }
        var gp = new THREE.BufferGeometry();
        gp.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        gp.setIndex(idx); gp.computeVertexNormals();
        var m2 = new THREE.Mesh(gp, lakeStone); m2.receiveShadow = true; scene.add(m2);
      })();
      /* 压顶石 1.6 米宽，向内挑出 0.55 米压住水面。
         往外必须是草坪 + 一条窄步道，不能铺一整圈灰：
         9 米宽的硬质步道绕湖一圈，会把水面框成一条水泥带子。 */
      lakeBand(1.05, -0.55, 0.28, lakeStone);
      /* 浅水带试过两版都放弃：等宽的高亮带在近景的掠射角下会拉成一条刷白的宽带，
         边缘笔直，比「水很平」更假。岸线的层次交给压顶石、芦苇和环湖树带。 */
      lakeBand(1.05, 20.5, 0.14, M.grass);
      lakeBand(3.6, 8.0, 0.19, M.paving3);

      /* 环湖树带：湖岸的绿化带必须自己种。
         街道树是沿路网索引铺的，环湖步道不在路网里，等不到那一排。 */
      for (var qi = 0; qi < lakePoly.length; qi += 2) {
        var qa2 = lakePoly[qi], qb2 = lakePoly[(qi + 1) % lakePoly.length];
        var qdx = qb2[0] - qa2[0], qdz = qb2[1] - qa2[1];
        var ql2 = Math.sqrt(qdx * qdx + qdz * qdz) || 1;
        var qnx = qdz / ql2, qnz = -qdx / ql2;
        var qoff = 9.5 + rd() * 3.2;
        var qtx = qa2[0] + qnx * qoff + (rd() - 0.5) * 4;
        var qtz = qa2[1] + qnz * qoff + (rd() - 0.5) * 4;
        var qth = 5.4 + rd() * 3.4;
        put(roadGroup, CYL6, 0.55, qth * 0.6, 0.55, qtx, qth * 0.3, qtz, M.trunk);
        put(roadGroup, SPH, 5.6 + rd() * 2.4, 4.4 + rd() * 1.8, 5.6 + rd() * 2.4,
          qtx, qth * 0.78, qtz, rd() < 0.5 ? M.leaf : M.leaf2);
      }

      /* 芦苇：湖岸的软边界。只在浅水带零星几丛，
         但正是这几丛让「水」和「岸」之间有了过渡。
         reed：跳过率。深湖 0.42 就够，湿地要反过来——芦苇是主体，
         沿岸四分之三的岸段都得有，不然 2 米深的浅水塘读成一个大水坑。 */
      var reedMats = [plainMat(0x6d7a45, 0.95), plainMat(0x7d8a4e, 0.95), plainMat(0x5d6b3c, 0.95)];
      /* 滩地色块：芦苇草丛在 600 米外一根也看不见，能看见的只有「岸线的颜色」。
         给湿地的岸线上铺一层 9–16 米的杂色泥滩，岸才不是一条白石缘。
         只在 scheme 显式给了 reed 时启用，D04 的深湖岸线保持原样。 */
      var marshMats = null;
      if (lk.reed !== undefined) {
        marshMats = [0x8a9163, 0x7b8557, 0x969c74].map(function (mh) {
          var mm = plainMat(mh, 0.97);
          mm.color.convertSRGBToLinear();
          return mm;
        });
      }
      var reedSkip = lk.reed === undefined ? 0.42 : lk.reed;
      var reedStep = lk.reed === undefined ? 3 : 2;
      for (var ri2 = 0; ri2 < lakePoly.length; ri2 += reedStep) {
        if (rd() < reedSkip) continue;
        var rp3 = lakePoly[ri2], rp4 = lakePoly[(ri2 + 1) % lakePoly.length];
        var rdx2 = rp4[0] - rp3[0], rdz2 = rp4[1] - rp3[1];
        var rl2 = Math.sqrt(rdx2 * rdx2 + rdz2 * rdz2) || 1;
        var rnx2 = rdz2 / rl2, rnz2 = -rdx2 / rl2;   /* 向外 */
        var rIn = -1.6 - rd() * 3.2;                  /* 负=向湖心 */
        var rbx = rp3[0] + rnx2 * rIn + (rd() - 0.5) * 6, rbz = rp3[1] + rnz2 * rIn + (rd() - 0.5) * 6;
        if (marshMats) {
          var msz = 8 + rd() * 6;
          put(roadGroup, BOX, msz, 0.10, msz, rbx + rnx2 * 9, 0.05, rbz + rnz2 * 9,
            marshMats[Math.floor(rd() * marshMats.length)], rd() * 1.4);
        }
        var nReed = (lk.reed === undefined ? 4 : 5) + Math.floor(rd() * (lk.reed === undefined ? 5 : 6));
        for (var e2 = 0; e2 < nReed; e2++) {
          var rh2 = 1.1 + rd() * 1.5;
          put(roadGroup, BOX, 0.22, rh2, 0.22,
            rbx + (rd() - 0.5) * 3.4, rh2 * 0.5 - 0.4, rbz + (rd() - 0.5) * 3.4,
            reedMats[Math.floor(rd() * reedMats.length)]);
        }
      }

      /* 栈道：从岸上伸进湖面的一截木栈桥，是「湖可以走上去」的唯一证据。
         没有它，湖就是一潭围起来的水。 */
      (lk.piers || []).forEach(function (pr) {
        var nL2 = lakePoly.length;
        var idx0 = Math.round((pr.a || 0) / (Math.PI * 2) * nL2) % nL2;
        var sp = lakePoly[idx0], sp2 = lakePoly[(idx0 + 1) % nL2];
        var pdx = sp2[0] - sp[0], pdz = sp2[1] - sp[1], pl = Math.sqrt(pdx * pdx + pdz * pdz) || 1;
        var onx = pdz / pl, onz = -pdx / pl;            /* 向外 */
        var pw = pr.w || 6, plen = pr.len || 52;
        var deckY = 0.55;
        /* 甲板逐段铺：整块长条会在弯岸处穿进水里 */
        var steps = Math.max(4, Math.round(plen / 6));
        for (var s3 = 0; s3 < steps; s3++) {
          var cx3 = sp[0] - onx * ((s3 + 0.5) * plen / steps);
          var cz3 = sp[1] - onz * ((s3 + 0.5) * plen / steps);
          put(roadGroup, BOX, pw, 0.36, plen / steps + 0.3, cx3, deckY, cz3, M.timber,
            Math.atan2(onx, onz) + Math.PI / 2);
        }
        /* 桩：每 6 米一对，落到水面以下 */
        for (var s4 = 0; s4 <= steps; s4++) {
          var px3 = sp[0] - onx * (s4 * plen / steps), pz3 = sp[1] - onz * (s4 * plen / steps);
          [-1, 1].forEach(function (sd3) {
            put(roadGroup, CYL6, 0.55, lDepth + deckY, 0.55,
              px3 + Math.cos(Math.atan2(onx, onz)) * sd3 * pw * 0.42,
              (deckY - lDepth) / 2,
              pz3 - Math.sin(Math.atan2(onx, onz)) * sd3 * pw * 0.42, M.timberDark);
          });
        }
        /* 栏杆 */
        [-1, 1].forEach(function (sd4) {
          for (var s5 = 0; s5 < steps; s5++) {
            var mx3 = sp[0] - onx * ((s5 + 0.5) * plen / steps);
            var mz3 = sp[1] - onz * ((s5 + 0.5) * plen / steps);
            var rx3 = Math.cos(Math.atan2(onx, onz)) * sd4 * pw * 0.46;
            var rz3 = -Math.sin(Math.atan2(onx, onz)) * sd4 * pw * 0.46;
            put(roadGroup, BOX, 0.16, 1.05, plen / steps + 0.3,
              mx3 + rx3, deckY + 0.7, mz3 + rz3, M.timberDark, Math.atan2(onx, onz) + Math.PI / 2);
          }
        });
        /* 端头平台 */
        var ex3 = sp[0] - onx * plen, ez3 = sp[1] - onz * plen;
        put(roadGroup, BOX, pw * 2.2, 0.4, pw * 2.2, ex3, deckY + 0.02, ez3, M.timber);
        for (var c5 = -1; c5 <= 1; c5 += 2) {
          for (var c6 = -1; c6 <= 1; c6 += 2) {
            put(roadGroup, CYL6, 0.55, lDepth + deckY, 0.55,
              ex3 + c5 * pw * 0.9, (deckY - lDepth) / 2, ez3 + c6 * pw * 0.9, M.timberDark);
          }
        }
      });

      /* 湖心岛：读书亭 + 一圈石岸 + 密林。它给「大水面」一个近处落点。
         bare：芦苇洲。湿地里的岛不长亭子——一个 18 米的岛上盖一座 16 米的亭，
         整片浅水立刻退化成公园湖；岛上该是苇子、水杉和一圈泥滩。 */
      (lk.islands || []).forEach(function (il) {
        var ir = il.r || 30;
        put(roadGroup, CYL, ir * 2.10, 1.6, ir * 2.10, il.x, -0.5, il.z, M.civicDark);
        put(roadGroup, CYL, ir * 1.94, 1.5, ir * 1.94, il.x, 0.45, il.z, M.grass);
        if (il.bare) {
          /* 芦苇丛：从岛心铺到水线，密度是岸上的两倍 */
          for (var b2 = 0; b2 < 34; b2++) {
            var ba = rd() * Math.PI * 2, bd = ir * (0.15 + rd() * 0.78);
            var bh = 1.2 + rd() * 1.7;
            put(roadGroup, BOX, 0.24, bh, 0.24,
              il.x + Math.cos(ba) * bd, 0.80 + bh * 0.5, il.z + Math.sin(ba) * bd,
              reedMats[Math.floor(rd() * reedMats.length)]);
          }
          /* 三五棵水杉：岛要有一个高度，否则从岸上看只是水面上一块深色的斑 */
          for (var w2 = 0; w2 < 5; w2++) {
            var wa = rd() * Math.PI * 2, wd = ir * rd() * 0.5;
            var wh2 = 7.5 + rd() * 4.0;
            put(roadGroup, CYL6, 0.42, wh2, 0.42,
              il.x + Math.cos(wa) * wd, 1.2 + wh2 * 0.5, il.z + Math.sin(wa) * wd, M.trunk);
            put(roadGroup, SPH, 4.0, wh2 * 0.45, 4.0,
              il.x + Math.cos(wa) * wd, 1.2 + wh2 * 0.94, il.z + Math.sin(wa) * wd, M.leaf2);
          }
          return;
        }
        put(roadGroup, CYL, ir * 1.5, 0.14, ir * 1.5, il.x, 1.22, il.z, M.paving2);
        /* 读书亭：六柱环廊 + 穹顶。岛上不能只有树，否则就是一块长草的礁石。
           顶必须比柱圈小一圈、还要再抬高半米，柱子才露得出来；
           顶一盖到柱头，整座亭就变成一个绿蘑菇。
           屋顶也不能用幕墙玻璃——玻璃球在草地上的颜色跟树冠一样，一样读成蘑菇。 */
        for (var pi2 = 0; pi2 < 6; pi2++) {
          var pa2 = Math.PI * 2 * pi2 / 6;
          put(roadGroup, CYL6, 0.55, 5.0, 0.55,
            il.x + Math.cos(pa2) * 8.4, 3.7, il.z + Math.sin(pa2) * 8.4, M.timber);
          /* 柱础 */
          put(roadGroup, BOX, 1.1, 0.8, 1.1, il.x + Math.cos(pa2) * 8.4, 1.6, il.z + Math.sin(pa2) * 8.4, M.kerb);
        }
        /* 檐口环：外沿比柱圈小 0.4 米，柱子从檐下露出来 */
        put(roadGroup, CYL, 16.0, 0.55, 16.0, il.x, 6.35, il.z, M.timberDark);
        var idome = put(roadGroup, HEMI, 14.6, 5.4, 14.6, il.x, 6.6, il.z, M.roofTile || M.roofGreyTile);
        idome.castShadow = true;
        /* 宝顶：补一根短柱把穹顶收口，否则球面直接秃在顶上 */
        put(roadGroup, CYL6, 0.6, 2.2, 0.6, il.x, 10.4, il.z, M.timberDark);
        for (var ti2 = 0; ti2 < 22; ti2++) {
          var ta2 = Math.PI * 2 * ti2 / 22 + rd() * 0.2;
          var td2 = ir * (0.62 + rd() * 0.3);
          var tx4 = il.x + Math.cos(ta2) * td2, tz4 = il.z + Math.sin(ta2) * td2;
          var th2 = 5.0 + rd() * 3.0;
          put(roadGroup, CYL6, 0.5, th2 * 0.55, 0.5, tx4, 1.2 + th2 * 0.28, tz4, M.trunk);
          put(roadGroup, SPH, 4.6 + rd() * 2.0, 3.6 + rd() * 1.4, 4.6 + rd() * 2.0,
            tx4, 1.2 + th2 * 0.72, tz4, rd() < 0.5 ? M.leaf : M.leaf2);
        }
      });
    }


    /* --- 广场与水景：区域中心的硬质铺地，给高密度街区透气 --- */
    var plazaTexBase = pavingTexture(0x9d9d98, 4);
    (spec.plazas || []).forEach(function (pz) {
      /* 广场是近景里面积最大的一个平面，必须自带铺装纹理，否则就是一块亮白板 */
      var pt2 = plazaTexBase.clone();
      pt2.needsUpdate = true;
      pt2.repeat.set(Math.max(2, pz.w / 6), Math.max(2, pz.d / 6));
      var pmat = new THREE.MeshStandardMaterial({ map: pt2, roughness: 0.95, metalness: 0.02, envMapIntensity: 0.33 });
      /* 广场整块抬到该处的地形高度；板厚给足，坡地上不露出板底 */
      YBASE = heightAt(pz.x, pz.z);
      put(roadGroup, BOX, pz.w, 2.2, pz.d, pz.x, -0.93, pz.z, pmat);
      /* 广场分格带：两道深色石带划出主副区，破掉一整块地坪 */
      put(roadGroup, BOX, pz.w, 0.05, 2.2, pz.x, 0.22, pz.z - pz.d * 0.30, M.paving3);
      put(roadGroup, BOX, 2.2, 0.05, pz.d, pz.x + pz.w * 0.34, 0.22, pz.z, M.paving3);
      /* 城主演说广场走独立陈设，普通广场仍用下面的水池/树阵 */
      if (pz.civic) { buildCivic(roadGroup, pz, M, rd); YBASE = 0; return; }
      if (pz.pool) {
        /* 水池尺寸可由方案给定：站前广场要的是一条正对站房的长条水面，
           默认的 44%×40% 在 190 米宽的广场上会摊成一块方池子。 */
        var pw = pz.poolW || pz.w * 0.44, pd = pz.poolD || pz.d * 0.40;
        /* 池壁只做四条边。原来这里是一整块比水面大 3 米的底板，
           板顶 0.555、水面 0.550 —— 相差 5 毫米，两层面在整个池子上争 Z，
           远看就是一层规则的横向条纹，一块深水读成蓝地砖。 */
        var prot0 = pz.poolRot || 0;
        [-1, 1].forEach(function (sz0) {
          put(roadGroup, BOX, pw + 4.4, 0.62, 2.2, pz.x, 0.31,
            pz.z + sz0 * (pd / 2 + 1.1), M.kerb, prot0);
          put(roadGroup, BOX, 2.2, 0.62, pd, pz.x + sz0 * (pw / 2 + 1.1), 0.31,
            pz.z, M.kerb, prot0);
        });
        /* still：静水镜面。司法广场的水是拿来照倒影的，
           喷头一开，这块水面立刻变成市政广场的音乐喷泉。
           poolColor 单独给：M.pool 的粗糙度太低，掠射角下会整片反射天空，
           一块深水读成一张白铁皮。 */
        /* poolRough 单独给：0.52 的水面在俯视里是一块哑光板，
           反射全被磨掉了，读起来像蓝色瓷砖。
           poolMetal 单独给：静水是镜面，metalness 压在 0.1 时环境反射基本被
           漫反射吃掉，一块深水就摊成一块深蓝色的地砖。0.7 以上才照得出站房。 */
        var poolMat = pz.still
          ? (pz.poolColor === undefined && pz.poolRough === undefined && pz.poolMetal === undefined
            ? M.pool
            : new THREE.MeshStandardMaterial({
              color: new THREE.Color(pz.poolColor === undefined ? 0x35565c : pz.poolColor),
              roughness: pz.poolRough === undefined ? 0.52 : pz.poolRough,
              metalness: pz.poolMetal === undefined ? 0.10 : pz.poolMetal,
              envMapIntensity: pz.poolEnv === undefined ? 0.4 : pz.poolEnv }))
          : M.water;
        var prot = pz.poolRot || 0;
        put(roadGroup, BOX, pw, 0.5, pd, pz.x, 0.30, pz.z, poolMat, prot);
        if (!pz.still) {
          /* 喷泉水柱：细长柱体 + 顶部水雾球 */
          for (var jx = -1; jx <= 1; jx += 2) for (var jz = -1; jz <= 1; jz += 2) {
            put(roadGroup, CYL6, 0.55, 3.2, 0.55, pz.x + jx * pw * 0.3, 1.8, pz.z + jz * pd * 0.3, M.kerb);
            put(roadGroup, SPH, 1.5, 1.1, 1.5, pz.x + jx * pw * 0.3, 3.5, pz.z + jz * pd * 0.3, M.water);
          }
        }
      } else if (!pz.noMonument) {
        /* 默认那个台座 + 圆球：广场中心一件抽象雕塑。
           但它永远落在广场正中心，正对大门时就是一块挡路的石头，
           校门前这类地方必须能关掉。 */
        put(roadGroup, BOX, 7, 0.5, 7, pz.x, 0.25, pz.z, M.kerb);
        put(roadGroup, BOX, 3.4, 7, 3.4, pz.x, 3.6, pz.z, M.metal);
        put(roadGroup, SPH, 3.2, 3.2, 3.2, pz.x, 8.4, pz.z, M.domeShell);
      }
      /* 站前广场的「设施层」：forecourt 的广场光有铺装就是一块停车场。
         广场上有没人用，全看这三样——绿化池把大面切碎、旗杆阵列把中轴点出来、
         灯杆给出纵深。三样都不做，186×132 米就只是一片灰。 */
      if (pz.forecourt) {
        /* 四块绿化池：石缘 + 碎石内芯 + 一圈绿篱 + 两棵树。
           整块铺绿会读成一张草皮贴片（远看就是一块绿板），
           真正让它读成「绿化池」的是立起来 0.9 米的绿篱边。 */
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          var gx = pz.x + q[0] * pz.w * 0.30, gz = pz.z + q[1] * pz.d * 0.30;
          put(roadGroup, BOX, 34, 0.55, 22, gx, 0.28, gz, M.kerb);
          put(roadGroup, BOX, 31, 0.20, 19, gx, 0.62, gz, M.paving3);
          [-1, 1].forEach(function (hz) {
            put(roadGroup, BOX, 33, 0.90, 2.4, gx, 0.80, gz + hz * 9.3, M.leaf2);
            put(roadGroup, BOX, 2.4, 0.90, 18.6, gx + hz * 15.3, 0.80, gz, M.leaf2);
          });
          [-1, 1].forEach(function (t) {
            put(roadGroup, CYL6, 0.5, 4.0, 0.5, gx + t * 8, 2.0, gz, M.trunk);
            put(roadGroup, SPH, 6.2, 4.8, 6.2, gx + t * 8, 6.2, gz, M.leaf);
          });
        });
        /* 旗杆阵列：站在站房门楼正前方，9 根 14 米，中轴一下就出来了 */
        for (var fx = -4; fx <= 4; fx++) {
          var px2 = pz.x + fx * 9.2, pz2 = pz.z - pz.d / 2 + 14;
          put(roadGroup, CYL6, 0.26, 14, 0.26, px2, 7.0, pz2, M.metal);
          put(roadGroup, BOX, 3.2, 1.9, 0.12, px2 + 1.7, 12.3, pz2, M.paint);
          put(roadGroup, BOX, 1.4, 0.5, 1.4, px2, 0.25, pz2, M.kerb);
        }
        /* 灯杆：水池两侧各一列，10 米，比行道灯高一档 */
        for (var lx = -2; lx <= 2; lx++) {
          [-1, 1].forEach(function (sd2) {
            var qx = pz.x + lx * 34, qz = pz.z + sd2 * 26;
            put(roadGroup, BOX, 0.42, 10, 0.42, qx, 5.0, qz, M.metalDark);
            put(roadGroup, BOX, 2.4, 0.36, 0.9, qx + 1.0, 10.1, qz, M.metalDark);
            put(roadGroup, BOX, 1.9, 0.14, 0.7, qx + 1.0, 9.9, qz, M.beacon);
          });
        }
      }
      /* 广场四周：树阵、灯柱、售卖亭，把空地做成有围合感的公共空间 */
      var ring = [
        [-pz.w / 2 + 7, -pz.d / 2 + 7], [pz.w / 2 - 7, -pz.d / 2 + 7],
        [-pz.w / 2 + 7, pz.d / 2 - 7], [pz.w / 2 - 7, pz.d / 2 - 7]
      ];
      ring.forEach(function (rp, ri) {
        var tx = pz.x + rp[0], tz = pz.z + rp[1];
        put(roadGroup, CYL6, 0.55, 4.6, 0.55, tx, 2.4, tz, M.trunk);
        put(roadGroup, SPH, 7.0, 5.2, 7.0, tx, 6.6, tz, M.leaf);
        put(roadGroup, BOX, 2.8, 0.82, 1.0, tx + (ri % 2 ? -6 : 6), 0.58, tz, M.wood);
        put(roadGroup, BOX, 0.3, 7.5, 0.3, tx + (ri % 2 ? 9 : -9), 3.75, tz, M.metalDark);
        put(roadGroup, BOX, 0.9, 0.35, 0.9, tx + (ri % 2 ? 9 : -9), 7.5, tz, M.beacon);
      });
      /* 沿广场长边排灯柱 */
      for (var li = -2; li <= 2; li++) {
        if (li === 0) continue;
        [-1, 1].forEach(function (s2) {
          var lx2 = pz.x + li * pz.w * 0.17, lz2 = pz.z + s2 * (pz.d / 2 - 4);
          put(roadGroup, BOX, 0.28, 6.5, 0.28, lx2, 3.25, lz2, M.metalDark);
          put(roadGroup, BOX, 0.7, 0.3, 0.7, lx2, 6.5, lz2, M.beacon);
        });
      }
      /* 两侧林荫道：一排树加坐凳，把空地做成有围合感的公共空间。
         openNorth 的广场（站前广场）只留南、东、西三面——
         北面那排树正好骑在站房门楼前面，会把 132 米宽的立面切碎。 */
      for (var ci2 = -3; ci2 <= 3; ci2++) {
        [-1, 1].forEach(function (sd) {
          if (pz.openNorth && sd < 0) return;
          var tx2 = pz.x + ci2 * pz.w * 0.125;
          var tz2 = pz.z + sd * pz.d * 0.42;
          put(roadGroup, CYL6, 0.5, 4.2, 0.5, tx2, 2.2, tz2, M.trunk);
          put(roadGroup, SPH, 6.2, 4.8, 6.2, tx2, 6.2, tz2, rd() < 0.5 ? M.leaf : M.leaf2);
          if (rd() < 0.55) put(roadGroup, BOX, 2.4, 0.75, 0.9, tx2 + 3.6, 0.55, tz2, M.wood);
        });
      }
      /* 售卖亭 */
      put(roadGroup, BOX, 6.5, 3.0, 4.5, pz.x - pz.w * 0.28, 1.5, pz.z + pz.d * 0.34, M.wood);
      put(roadGroup, BOX, 7.4, 0.35, 5.4, pz.x - pz.w * 0.28, 3.2, pz.z + pz.d * 0.34, M.canopy);
      YBASE = 0;
    });

    /* --- 地块与建筑 --- */
    var blocks = new THREE.Group(); scene.add(blocks);
    /* 占位用「带转角的矩形」判，不能用轴对齐包围盒。
       AABB 在正交街区里等于楼本身（转角 0），一到斜放街区就出事：
       一栋 34×26 的楼转到 51°，包围盒变成 41×43，
       沿街相邻两栋中心只隔 40 米，包围盒必然相交——于是 D08 这种斜方环
       每三栋就有两栋被判成"重叠"打回，空地怎么调都填不满。
       这里改成两次投影分离（SAT）：四个候选轴（每个矩形的两条法线）里
       只要有一条能分开就不相交。判定与转角无关，斜网格才和正交网格一样密。 */
    function obbOverlap(ax, az, ahw, ahd, aang, bx, bz, bhw, bhd, bang, pad) {
      var angs = [aang, bang];
      for (var k = 0; k < 2; k++) {
        var c = Math.cos(angs[k]), s = Math.sin(angs[k]);
        /* 该矩形的两条局部轴：ex = (c, -s)、ez = (s, c) */
        for (var ai = 0; ai < 2; ai++) {
          var ux = ai === 0 ? c : s, uz = ai === 0 ? -s : c;
          var ca = Math.cos(aang), sa = Math.sin(aang);
          var cb = Math.cos(bang), sb = Math.sin(bang);
          var ra = ahw * Math.abs(ca * ux - sa * uz) + ahd * Math.abs(sa * ux + ca * uz);
          var rb = bhw * Math.abs(cb * ux - sb * uz) + bhd * Math.abs(sb * ux + cb * uz);
          var dd = Math.abs((bx - ax) * ux + (bz - az) * uz);
          if (dd > ra + rb + pad) return false;
        }
      }
      return true;
    }
    var occList = [];
    function markOcc(x, z, hw, hd, ang) {
      var a = ang || 0;
      occList.push({ x: x, z: z, hw: hw, hd: hd, a: a, r: Math.sqrt(hw * hw + hd * hd) });
    }
    function occFree(x, z, hw, hd, ang) {
      var a = ang || 0, rr = Math.sqrt(hw * hw + hd * hd);
      for (var i = 0; i < occList.length; i++) {
        var o = occList[i];
        /* 便宜的圆粗筛：距离够远就不必做四次投影 */
        if (Math.abs(o.x - x) > o.r + rr + 2.4 || Math.abs(o.z - z) > o.r + rr + 2.4) continue;
        if (obbOverlap(x, z, hw, hd, a, o.x, o.z, o.hw, o.hd, o.a, 1.2)) return false;
      }
      return true;
    }
    function clearOfRoads(x, z, hw, hd, ang, pad) {
      var near = index.near(x, z), ca = Math.cos(ang), sa = Math.sin(ang);
      for (var i = 0; i < near.length; i++) {
        var s = near[i], dx = s.ax - x, dz = s.az - z, ex = s.bx - x, ez = s.bz - z;
        var sx = dx * ca - dz * sa, sz = dx * sa + dz * ca;
        var tx = ex * ca - ez * sa, tz = ex * sa + ez * ca;
        if (segHitsRect({ ax: sx, az: sz, bx: tx, bz: tz, hw: s.hw }, 0, 0, hw, hd, pad)) return false;
      }
      return true;
    }
    /* 沿折线按弧长连续取样：整个多边形一次走完，不会在折点重叠。 */
    function polyLen(pts) {
      var cum = [0], total = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        total += Math.sqrt(Math.pow(pts[i + 1][0] - pts[i][0], 2) + Math.pow(pts[i + 1][1] - pts[i][1], 2));
        cum.push(total);
      }
      return { cum: cum, total: total };
    }
    function atPoly(pts, cum, s) {
      var i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      var a = pts[i - 1], b = pts[i], seg = (cum[i] - cum[i - 1]) || 1, t = (s - cum[i - 1]) / seg;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
        ang: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
    }

    var prof = spec.profile || {};
    var count = 0, attempts = 0;
    function heightFor(cls) {
      var base = prof.hMin === undefined ? 12 : prof.hMin, top = prof.hMax === undefined ? 45 : prof.hMax;
      var bias = cls === "avenue" ? 1 : cls === "street" ? 0.82 : 0.62;
      /* 约两成做成低层商业/配套，用高度落差把街区从「一排等高塔楼」里救出来 */
      if (rd() < (prof.lowRise === undefined ? 0.20 : prof.lowRise)) {
        return base * (0.34 + rd() * 0.5);
      }
      return base + (top - base) * Math.pow(rd(), cls === "avenue" ? 1.55 : 1.15) * bias;
    }
    function pickType(o) {
      var list = spec.types || [{ t: "slab", w: 1 }];
      var total = 0, i;
      for (i = 0; i < list.length; i++) total += list[i].w;
      var r = rd() * total;
      for (i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return list[i].t; }
      return list[0].t;
    }

    var reject = { bound: 0, blocker: 0, road: 0, occ: 0, water: 0, slope: 0 };
    /* 核心径向加成：越靠近中心越高，外围自然压成低层，形成「盆地托孤峰」 */
    var coreR = prof.coreR || 0, coreK = prof.coreK || 1;
    function coreBoost(x, z, h) {
      if (!coreR) return h;
      var dd = Math.sqrt(x * x + z * z);
      var f = 1 + (coreK - 1) * Math.max(0, 1 - dd / coreR);
      return Math.min(h * f, 210);
    }
    /* 细部等级：只有老城型区域开檐口/店面。CBD 高楼有自己的裙房逻辑，混进来会很怪。 */
    var TRIM = spec.trim === undefined ? 0 : spec.trim;
    var trimDefault = TRIM > 0 ? 1 : 0;
    var trimFace = TRIM;
    /* detail: 0=素墙 1=加檐口 2=檐口+店面。临街第一排给 2，内部填充给 1。 */
    function place(x, z, ang, w, d, h, type, forceMat, detail) {
      var hw = w / 2, hd = d / 2;
      if (Math.abs(x) > R - hw * 0.6 || Math.abs(z) > R - hd * 0.6) { reject.bound++; return false; }
      attempts++;
      if (inBlocker(x, z)) { reject.blocker++; return false; }
      if (inNoBuildBox(x, z, hw, hd, ang)) { reject.blocker++; return false; }
      /* 只判地块中心是不够的：34×26 的楼，中心在岸上 8 米，四角已经伸进河里，
         俯视图里就是一排屋顶浮在水面上。中心 + 四角一起判。 */
      if (inWater(x, z)) { reject.water++; return false; }
      if (hw + hd > 0) {
        var _ca = Math.cos(ang), _sa = Math.sin(ang);
        var _cx = hw * _ca, _cz = -hw * _sa, _dx = hd * _sa, _dz = hd * _ca;
        if (inWater(x + _cx + _dx, z + _cz + _dz) || inWater(x - _cx + _dx, z - _cz + _dz) ||
          inWater(x + _cx - _dx, z + _cz - _dz) || inWater(x - _cx - _dx, z - _cz - _dz)) {
          reject.water++; return false;
        }
      }
      /* 陡坡上不放房子：台基再厚也补不平十几米的落差，
         坡面上会浮起一排盒子。这也顺带把山体保护住了。 */
      if (TER) {
        var slp = (Math.abs(heightAt(x + hw, z) - heightAt(x - hw, z))
          + Math.abs(heightAt(x, z + hd) - heightAt(x, z - hd))) / (2 * Math.max(hw, hd));
        if (slp > 0.14) { reject.slope++; return false; }
        /* 丘顶不许落房子：山顶一栋机房，山就变成楼的地基了 */
        var kns = TER.knolls;
        if (kns) {
          for (var kni = 0; kni < kns.length; kni++) {
            var kx2 = x - kns[kni].x, kz2 = z - kns[kni].z;
            if (Math.sqrt(kx2 * kx2 + kz2 * kz2) < kns[kni].r * 0.55) { reject.slope++; return false; }
          }
        }
      }
      if (!clearOfRoads(x, z, hw, hd, ang, 0.9)) { reject.road++; return false; }
      if (!occFree(x, z, hw, hd, ang)) { reject.occ++; return false; }
      h = coreBoost(x, z, h);
      var mat = forceMat || pickMat();
      var g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ang;
      var fn = ARCH[type] || ARCH.slab;
      fn(g, { w: w, d: d, h: h, mat: mat, detail: detail === undefined ? trimDefault : detail }, M, rd);
      /* 屋顶类型：约三成做坡顶、一成做构架，其余平顶带女儿墙。
         这是把天际线从「一排方盒」打散成城市轮廓最省力的一招。 */
      var boxy = (type === "tower" || type === "podium" || type === "glassTower" || type === "slab" ||
        type === "twin" || type === "loft" || type === "cylinderTower" || type === "ziggurat");
      var gableProb = prof.gable === undefined ? 0.30 : prof.gable;
      var roofRoll = boxy ? rd() : 1;
      if (roofRoll < gableProb && h < 90) {
        var rh = 3.5 + rd() * 5;
        var gable = put(g, GABLE, w * 1.04, rh, d * 1.04, 0, h, 0, rd() < 0.45 ? M.roofRoll(rd) : M.metalDark);
        gable.castShadow = true;
      } else if (roofRoll < gableProb + 0.14) {
        /* 屋顶机房 + 一圈栏杆，不是覆盖整个楼顶的金属盖板 */
        put(g, BOX, w * 0.48, 2.8, d * 0.48, 0, h + 1.4, 0, M.metal);
        put(g, BOX, w * 0.52, 0.32, d * 0.52, 0, h + 2.9, 0, M.metalDark);
        for (var rc2 = -1; rc2 <= 1; rc2 += 2) {
          put(g, BOX, 0.22, 1.1, d * 0.96, rc2 * w * 0.48, h + 0.55, 0, M.metalDark);
          put(g, BOX, w * 0.96, 1.1, 0.22, 0, h + 0.55, rc2 * d * 0.48, M.metalDark);
        }
      }
      /* 临街裙房：一圈深色玻璃与雨棚，让楼有「落地」的底层，不再像摆在台面上的模型 */
      if (h > 11 && (type === "tower" || type === "podium" || type === "glassTower" || type === "slab" ||
          type === "twin" || type === "loft" || type === "cylinderTower" || type === "ziggurat")) {
        put(g, BOX, w * 1.02, 4.4, d * 1.02, 0, 2.2, 0, M.shopfront);
        put(g, BOX, w * 1.06, 0.35, d * 1.06, 0, 4.6, 0, M.metalDark);
        if (rd() < 0.5) put(g, BOX, w * 0.8, 0.20, 2.4, 0, 4.9, d * 0.5 + 0.9, M.canopy);
        if (rd() < 0.5) put(g, BOX, w * 0.8, 0.20, 2.4, 0, 4.9, -d * 0.5 - 0.9, M.canopy);
      }
      blocks.add(g);
      /* 地块铺装：把灰地面切成一块块院子，避免整片同色大地。
         坡地上台基必须给足厚度，否则上坡角会露出楼底——工业园的场平台就是干这个的。 */
      var padM = rd() < 0.4 ? M.paving2 : rd() < 0.5 ? M.paving3 : M.paving;
      if (TER) put(g, BOX, w + 2.6, 5.0, d + 2.6, 0, -2.3, 0, rd() < 0.12 ? M.grass : padM);
      else put(g, BOX, w + 2.6, 0.24, d + 2.6, 0, 0.1, 0, rd() < 0.16 ? M.grass : padM);
      markOcc(x, z, hw + 1, hd + 1, ang); count++;
      return true;
    }

    /* 地标占位先标记，临街地块不会长进主塔基座 */
    hero.forEach(function (h) {
      markOcc(h.x || 0, h.z || 0, (h.w || 60) * 0.72, (h.d || 50) * 0.72, h.rot || 0);
    });

    /* 地块拟合：整块放不下就缩面宽并沿街微移，恢复路口处的转角楼，而不是直接留空。 */
    var FIT = [[1, 1, 0], [1, 1, 0.5], [1, 1, -0.5], [0.66, 0.86, 0.34], [0.66, 0.86, -0.34], [0.5, 0.7, 0]];
    function placeFit(px, pz, ang, lw, ld, h, type, detail) {
      var ux = Math.cos(ang), uz = -Math.sin(ang);
      for (var i = 0; i < FIT.length; i++) {
        var f = FIT[i], sx = f[2] * lw;
        if (place(px + ux * sx, pz + uz * sx, ang, lw * f[0], ld * f[1], h, type, null, detail)) return true;
      }
      return false;
    }

    /* 1) 临街连续界面：沿每条路两侧退线排布，这是「像城市」的关键。
       streetFill:false 关掉——不是每个区都该有街墙。
       D14 是实验园区：环路两侧要的是草地、树和半埋的实验舱，
       沿街排一圈配套楼，「蜂窝独占场地」这件事就没了。 */
    var setback = prof.setback === undefined ? 5 : prof.setback;
    (prof.streetFill === false ? [] : roads).forEach(function (r) {
      var info = polyLen(r.pts), s = 2 + rd() * 6;
      var gapS = prof.lotGap === undefined ? 2 : prof.lotGap;
      while (s < info.total - 3) {
        var lw = (prof.lotW || 22) * (0.62 + rd() * 0.86);
        var ld = (prof.lotD || 20) * (0.70 + rd() * 0.75);
        var p = atPoly(r.pts, info.cum, s + lw / 2);
        /* 局部 +z 是街道法线方向，退线沿它往外让 */
        var nx = Math.sin(p.ang), nz = Math.cos(p.ang);
        var off = r.w / 2 + setback + ld / 2;
        var h0 = heightFor(r.cls), t0 = pickType();
        if (r.cls === "lane" && rd() < 0.45) t0 = "terrace";
        [1, -1].forEach(function (side) {
          placeFit(p.x + nx * off * side, p.z + nz * off * side, p.ang, lw, ld,
            h0 * (0.9 + rd() * 0.2), t0, trimFace);
          /* 第二排：街块纵深不够时补一栋矮一档的，避免楼与楼之间留出大空洞 */
          if (rd() < 0.72) {
            var ld2 = ld * (0.72 + rd() * 0.3), off2 = off + ld / 2 + ld2 / 2 + 2.5;
            placeFit(p.x + nx * off2 * side, p.z + nz * off2 * side, p.ang,
              lw * (0.72 + rd() * 0.28), ld2, h0 * (0.55 + rd() * 0.35), pickType(), trimDefault);
          }
        });
        s += lw + gapS + rd() * (prof.lotGapRand === undefined ? 5 : prof.lotGapRand);
      }
    });

    /* 2) 街区内部填充：远离道路的空地放院落、仓库与配套楼 */
    var step = prof.innerStep || 42;
    /* 格网本身要跟着区的主轴转。
       楼是按 grid.angle 转的、格子却是世界轴对齐的，两者夹一个几十度的角——
       每格都往斜对角溢出一点，一半格子被 clearOfRoads 打回，剩下的一半歪在路边。
       D08 补上 angle 之后楼从 189 掉到 161，就是这个原因，不是密度给低了。
       格子在 (u,v) 里走，再按主轴转回世界，楼与格子同向，空地才真的被填满。 */
    var fA = (spec.grid && spec.grid.angle) ? spec.grid.angle : 0;
    var fC = Math.cos(fA), fS = Math.sin(fA);
    for (var gu0 = -R + step * 0.5; gu0 < R; gu0 += step) {
      for (var gv0 = -R + step * 0.5; gv0 < R; gv0 += step) {
        if (rd() > (prof.innerFill === undefined ? 0.55 : prof.innerFill)) continue;
        var gu = gu0 + (rd() - 0.5) * step * 0.5, gv = gv0 + (rd() - 0.5) * step * 0.5;
        var gx = gu * fC + gv * fS, gz = -gu * fS + gv * fC;
        var w2 = (prof.lotW || 22) * (0.9 + rd() * 1.5), d2 = (prof.lotD || 20) * (0.9 + rd() * 1.3);
        /* 内部填充的楼面不能超过格距：地块尺寸按 lotW 随机放大到两倍多，
           而填充步长只有三四十米，结果是第一栋就把邻格全占死、后面全被 place() 拒绝——
           整片街区看起来稀稀拉拉，其实是尺寸算错了，不是密度给低了。
           innerCap 给一个「不超过若干倍步长」的上限，空地才真的被填满。 */
        if (prof.innerCap) {
          var capW = step * prof.innerCap, capD = step * prof.innerCap;
          if (w2 > capW) w2 = capW * (0.86 + rd() * 0.14);
          if (d2 > capD) d2 = capD * (0.86 + rd() * 0.14);
        }
        var type2 = pickType();
        if (rd() < 0.3) type2 = "courtyard";
        placeFit(gx, gz, fA + (rd() - 0.5) * 0.2,
          w2, d2, heightFor("street") * (0.7 + rd() * 0.6), type2);
      }
    }

    /* 3) 地标：每个区域自己的主角 */
    hero.forEach(function (hl) {
      var g = new THREE.Group();
      /* 平铺类地标（光伏场、集装箱堆场）只有一两米高，按中心高度落地会被谷底 ±8 米的
         起伏直接埋掉——整片光伏板消失在地面以下，画面上只剩一块空地。
         这类必须按四角最高点落地。 */
      var baseY = heightAt(hl.x || 0, hl.z || 0);
      if (TER && (hl.type === "solarFarm" || hl.type === "containerYard")) {
        /* 四角还不够：谷底起伏是缓波，场区中间可能比四角高出一截。
           按 5×5 采样取最高点，才能保证整片板不被土盖住。 */
        var hw2 = (hl.w || 60) / 2, hd2 = (hl.d || 50) / 2;
        for (var qx = -2; qx <= 2; qx++) {
          for (var qz = -2; qz <= 2; qz++) {
            baseY = Math.max(baseY, heightAt((hl.x || 0) + hw2 * qx / 2, (hl.z || 0) + hd2 * qz / 2));
          }
        }
      }
      /* lift：跨河的人行桥、架在水上的平台必须自己抬起来。
         heightAt 在河心是 -4.2，桥面直接被埋到水底——三道过河步道全都不见了。 */
      g.position.set(hl.x || 0, baseY + (hl.lift || 0), hl.z || 0);
      g.rotation.y = hl.rot || 0;
      /* 地标体量大，坡地上必须自带场平台基，否则一角悬空。
         但跨水的桥不需要台基——一块 108×4 的混凝土板压在河面上就是一道坝。
         found:false —— 沿堤这类「长度上千米、自己就是地形」的地标，
         给它垫一块 1568×29 的台基只会跟地面打架（台基底在 -6、顶在 0，
         正好压在铺装上，深度缓冲会在这里切出一道闪线）。 */
      if (TER && !hl.lift && hl.found !== false) put(g, BOX, (hl.w || 60) * 1.12, 6.0, (hl.d || 50) * 1.12, 0, -3.0, 0, M.concreteDark);
      var fn = ARCH[hl.type] || ARCH.tower;
      /* plainMat: 指定用材质表里的某个纯色材质，走 "M.xxx" 的名字。
         为什么必须有这条路：默认 hmat 是 M.win（带窗贴图），
         而板楼 160 米长、60 米高，640 米外的窗格贴图会被采样成
         一条条黑白竖纹——用户看到的「条形码」就是它，不是几何。
         纯色墙 + 少量体量缝才是这个尺度上唯一能读的东西。 */
      var hfm = spec.heroFacade || {};
      var hmat = hl.plainMat && M[hl.plainMat] ? M[hl.plainMat]
        : hl.plain === "stone" ? M.concrete
        : hl.color === undefined ? M.win[(hl.mat || 0) % M.win.length]
        : facadeMat(hl.color, { floorH: hfm.floorH || 4.0, colW: hfm.colW || 2.6,
            ratio: hfm.ratio === undefined ? 0.64 : hfm.ratio,
            /* 默认 0.46 金属 / 0.22 粗糙：没有环境贴图时高金属度把漫反射压掉，
               整座塔从「浅蓝玻璃」变成「黑格栅 + 白点」。每个区可以自己调这组值。 */
            metal: hfm.metal === undefined ? 0.46 : hfm.metal,
            rough: hfm.rough === undefined ? 0.22 : hfm.rough,
            seed: 300 + Math.abs(Math.round((hl.x || 0) * 3 + (hl.z || 0))),
            lit: hfm.lit === undefined ? 0.26 : hfm.lit, pane: spec.paneColor });
      var hopt = { w: hl.w || 60, d: hl.d || 50, h: hl.h || 120, mat: hmat };
      for (var hk in hl) { if (hk !== "sign" && hk !== "color" && hk !== "plain") hopt[hk] = hl[hk]; }
      fn(g, hopt, M, rd);
      blocks.add(g);
      /* occ:false —— 沿堤是一条 1400 米的带状物，按 w/d 记占位会把整条 z≈−210
         的横带全锁死（连车站前的空地都长不出东西）。它的占位由 noBuild 单独给。 */
      if (hl.occ !== false) markOcc(hl.x || 0, hl.z || 0, (hl.w || 60) / 2 + 4, (hl.d || 50) / 2 + 4, hl.rot || 0);
      /* 厂牌：楼顶双向挂板，正面朝广场，背面给外侧视角 */
      if (hl.sign) {
        var bb = new THREE.Box3().setFromObject(g);
        var topY = bb.max.y;
        var sw = hl.sign.w || Math.min((hl.w || 50) * 1.6, 82), sh = sw * (200 / 640);
        var tex = signTexture(hl.sign.name, hl.sign.en, hl.sign.tone);
        var smat = new THREE.MeshStandardMaterial({
          map: tex, transparent: true, side: THREE.FrontSide,
          /* 0.30 在日光下把牌子推到纯白，远看是一块浮空的白铁皮。
             0.13 只保证暗部还能读出字，白天读的是它本身的底色。 */
          emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.13,
          roughness: 0.62, metalness: 0.05, envMapIntensity: 0.3
        });
        var sgeo = new THREE.PlaneGeometry(sw, sh);
        /* 平面法线默认 +z，转到「朝向广场中心」的方向 */
        var face = Math.atan2(-(hl.x || 0), -(hl.z || 0));
        /* 牌子必须挂在支架上：一块板子悬在塔顶上方，近景看就是浮空的广告牌。
           支架跟着牌子同一个 y 轴旋转，正反两面都能看。 */
        var signG = new THREE.Group();
        /* 压到塔冠上沿 −0.1×牌高：牌底与女儿墙咬住，
           原来悬在 topY 之上，两根细支腿撑一块白板，近景就是「浮空广告牌」 */
        signG.position.set(hl.x || 0, topY - sh * 0.10, hl.z || 0);
        signG.rotation.y = face;
        [-0.30, 0.30].forEach(function (sx) {
          var post = new THREE.Mesh(BOX, M.metalDark);
          post.scale.set(0.55, sh * 1.02, 0.55);
          post.position.set(sw * sx, sh * 0.51, 0);
          signG.add(post);
        });
        [0, Math.PI].forEach(function (dv) {
          var sgn = new THREE.Mesh(sgeo, smat);
          sgn.position.set(0, sh * 0.52, 0);
          sgn.rotation.y = dv;
          sgn.translateZ(0.42);
          sgn.castShadow = false; sgn.receiveShadow = false;
          signG.add(sgn);
        });
        scene.add(signG);
      }
    });

    api.buildingCount = count;
    /* 地标自检：缩放/参数写错时要能一眼看出来 */
    api.heroInfo = hero.map(function (hl) {
      var g = blocks.children[blocks.children.length - hero.length + hero.indexOf(hl)];
      var box = g ? new THREE.Box3().setFromObject(g) : null;
      return { type: hl.type, x: hl.x, z: hl.z, want: hl.h, top: box ? Math.round(box.max.y) : null,
        width: box ? Math.round(box.max.x - box.min.x) : null };
    });

    /* --- 街道设施 --- */
    var props = new THREE.Group(); scene.add(props);
    var LIFE = spec.streetLife || null;
    var treePts = [], carPts = [];
    roads.forEach(function (r) {
      for (var i = 0; i < r.pts.length - 1; i++) {
        var a = r.pts[i], b = r.pts[i + 1];
        var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz) || 1;
        var ux = dx / len, uz = dz / len;
        /* 路灯：主干道两侧，间距 34 米 */
        if (r.cls === "avenue") {
          for (var s = 8; s < len; s += 34) {
            var lx = a[0] + ux * s, lz = a[1] + uz * s;
            YBASE = heightAt(lx, lz);
            [1, -1].forEach(function (side) {
              var nx = -uz * side, nz = ux * side, off = r.w / 2 + 3.4;
              put(props, BOX, 0.32, 8.4, 0.32, lx + nx * off, 4.2, lz + nz * off, M.metalDark);
              put(props, BOX, 2.4, 0.3, 0.3, lx + nx * (off - 1.1), 8.3, lz + nz * (off - 1.1), M.metalDark);
              put(props, BOX, 1.0, 0.22, 0.6, lx + nx * (off - 2.1), 8.1, lz + nz * (off - 2.1), M.beacon);
            });
            YBASE = 0;
          }
        }
        /* 行道树。treeGap 给到 500 以上就是「这一区不种树」——
           骑楼街的遮阳靠柱廊，不靠行道树；而且树按 r.w/2+2.6 定点，
           26 米宽的街正好把树点进柱廊里，树冠穿二楼。
           注意必须整段跳过：只把 gap 加大，循环仍会从每段的 t2=12 种一棵。 */
        var tgap = (LIFE && LIFE.treeGap) || 17;
        /* treeOn：只在指定的路级上种行道树。不给就是照旧全种。
           D15 的 10 米次巷贴着院落侧翼走，树按 r.w/2+2.6 落在 7.6 米处，
           正好插进 L 形那道 12 米厚的墙里；可 26 米的大街又非有树不可。
           没有这个开关就只能二选一：满街树穿墙，或者一条街的树都没有。 */
        var tOn = LIFE && LIFE.treeOn;
        for (var t2 = 12; t2 < len && tgap < 500 && (!tOn || tOn.indexOf(r.cls) >= 0); t2 += tgap) {
          var tx = a[0] + ux * t2, tz = a[1] + uz * t2;
          var side2 = (Math.floor(t2 / tgap) % 2) ? 1 : -1;
          var off2 = r.w / 2 + 2.6;
          treePts.push([tx - uz * side2 * off2, tz + ux * side2 * off2]);
        }
        /* 路边停车 */
        if (r.cls !== "lane") {
          for (var c2 = 20; c2 < len; c2 += 31) {
            if (rd() > 0.55) continue;
            var cx2 = a[0] + ux * c2 - uz * (r.w / 2 - 2.4), cz2 = a[1] + uz * c2 + ux * (r.w / 2 - 2.4);
            carPts.push([cx2, cz2, Math.atan2(dx, dz)]);
          }
        }
      }
    });
    treePts.forEach(function (p) {
      if (Math.abs(p[0]) > R || Math.abs(p[1]) > R) return;
      YBASE = heightAt(p[0], p[1]);
      var h = 4.2 + rd() * 3.4;
      put(props, CYL6, 0.5, h * 0.55, 0.5, p[0], h * 0.28, p[1], M.trunk);
      put(props, SPH, 3.4 + rd() * 1.6, 3.0 + rd() * 1.4, 3.4 + rd() * 1.6, p[0], h * 0.72, p[1], rd() < 0.5 ? M.leaf : M.leaf2);
      YBASE = 0;
    });
    var carMats = [M.carA, M.carB, M.carC, M.carD, M.carE];
    /* 车高必须压回来。原来车身 1.25 + 车顶 0.95 = 2.2 米，
       宽度 1.95 —— 一辆轿车长成了一个货柜。真车是 1.45 米高、1.8 米宽、
       车身 0.8 + 舱 0.6。另外必须抬 0.46 到车行道上：
       heightAt 给的是地形面，路面比它高 0.46，原来四个轮子全埋在沥青里。 */
    var ROAD_Y = 0.46;
    carPts.forEach(function (p) {
      YBASE = heightAt(p[0], p[1]) + ROAD_Y;
      var mat = carMats[Math.floor(rd() * carMats.length)];
      put(props, BOX, 4.5, 0.80, 1.86, p[0], 0.86, p[1], mat, p[2]);
      put(props, BOX, 2.4, 0.60, 1.74, p[0], 1.56, p[1], M.glass, p[2]);
      YBASE = 0;
    });

    /* --- 街上的人和摊 ---
       城里没人，尺度感就全靠树和栏杆撑，一屏看下去像模型展台。
       行人只要三个体块（腿 / 上身 / 头）就足够在近景里读成「人」，
       真正起作用的不是精细度，而是「路上有东西在动」这件事本身。
       密度必须可按区给：老城是一步一个摊，工业谷几十米才过一个换班的人；
       把老城的密度直接搬进机房谷，街上会比厂房还热闹。 */
    var LIFE = spec.streetLife || null;
    var pedGapF = LIFE && LIFE.pedGap ? LIFE.pedGap : 0;
    var pedRun = LIFE && LIFE.pedRun !== undefined ? LIFE.pedRun : 0.38;
    /* 行人走人行道，不走车道。默认（false）保持各老区的原位：wOff 是 r.w*0.5−0.9，
       12 米小街上那是路缘，看不出问题；但 46 米的大道上，人就站在四条车道中间。
       pedWalk 打开后落到人行道带（宽 min(9, 0.45r.w)）上，并抬 0.12 米到铺装面。 */
    var pedWalk = !!(LIFE && LIFE.pedWalk);
    var pedLift = pedWalk ? 0.12 : 0;
    /* 落点是不是在别的车行道里。窄巷的人行道偏移（r.w/2+0.9）一旦遇到
       46 米的大道，人正好站在四条车道中间——交叉口上一排人站路心，非常明显。
       自己的路不会误判：人永远在自己这条路的 hw 之外 0.9 米。 */
    function onCarriageway(x, z, minHalf) {
      var segs = index.near(x, z);
      for (var i4 = 0; i4 < segs.length; i4++) {
        var sg4 = segs[i4];
        if (sg4.hw < minHalf) continue;
        var vx = sg4.bx - sg4.ax, vz = sg4.bz - sg4.az;
        var L4 = Math.sqrt(vx * vx + vz * vz) || 1;
        var t4 = ((x - sg4.ax) * vx + (z - sg4.az) * vz) / (L4 * L4);
        t4 = t4 < 0 ? 0 : t4 > 1 ? 1 : t4;
        var dx4 = x - (sg4.ax + vx * t4), dz4 = z - (sg4.az + vz * t4);
        if (Math.sqrt(dx4 * dx4 + dz4 * dz4) < sg4.hw - 1.2) return true;
      }
      return false;
    }
    var stallRate = LIFE && LIFE.stall !== undefined ? LIFE.stall : 0.105;
    var cartRate = LIFE && LIFE.cart !== undefined ? LIFE.cart : 0.038;
    var pedPts = [], stallPts = [], cartPts = [];
    roads.forEach(function (r) {
      var pi2 = polyLen(r.pts);
      var gapP = pedGapF ? pedGapF * (r.cls === "lane" ? 1.45 : 1) : (r.cls === "lane" ? 7.0 : 5.4);
      for (var s3 = 4 + rd() * 8; s3 < pi2.total - 2; s3 += gapP * (0.55 + rd() * 1.0)) {
        var pp2 = atPoly(r.pts, pi2.cum, s3);
        var sg = rd() < 0.5 ? 1 : -1;
        var wOff;
        if (pedWalk) {
          var swW = Math.min(9, r.w * 0.45);
          wOff = r.w * 0.5 + 0.9 + rd() * Math.max(0.6, swW * 0.55);
        } else {
          wOff = (r.w * 0.5 - 0.9) * (0.32 + rd() * 0.58);
        }
        var nb2 = rd() < pedRun ? (rd() < 0.42 ? 3 : 2) : 1;
        for (var k2 = 0; k2 < nb2; k2++) {
          var pdx = pp2.x + Math.sin(pp2.ang) * wOff * sg + (rd() - 0.5) * 1.6;
          var pdz = pp2.z + Math.cos(pp2.ang) * wOff * sg + (rd() - 0.5) * 1.6;
          if (pedWalk && onCarriageway(pdx, pdz, 10)) continue;
          pedPts.push([pdx, pdz, pp2.ang + (rd() - 0.5) * 2.6]);
        }
        /* 摊位：只落在街面，窄巷里也摆——老城就是这样 */
        if (rd() < stallRate && Math.abs(pp2.x) < R - 10 && Math.abs(pp2.z) < R - 10) {
          stallPts.push([pp2.x + Math.sin(pp2.ang) * (r.w * 0.5 - 1.5) * sg,
            pp2.z + Math.cos(pp2.ang) * (r.w * 0.5 - 1.5) * sg, pp2.ang]);
        }
        if (rd() < cartRate && Math.abs(pp2.x) < R - 10 && Math.abs(pp2.z) < R - 10) {
          cartPts.push([pp2.x + Math.sin(pp2.ang) * (r.w * 0.5 - 1.8) * sg,
            pp2.z + Math.cos(pp2.ang) * (r.w * 0.5 - 1.8) * sg, pp2.ang]);
        }
      }
    });
    /* 广场上的人。行人只沿路生成，一块 550×190 的进场广场中央永远是空的，
       俯拍时像「还没开业的停车场」。给几个矩形（x, z, w, d, 密度），
       在里面撒一层站着的人——密度按每 200 平方米一个人算。 */
    (LIFE && LIFE.piazza || []).forEach(function (pz) {
      var cnt = Math.round(pz[2] * pz[3] / (pz[4] || 200));
      for (var i3 = 0; i3 < cnt; i3++) {
        pedPts.push([pz[0] + (rd() - 0.5) * pz[2], pz[1] + (rd() - 0.5) * pz[3],
          rd() * 6.283]);
      }
    });
    var cloths = [M.clothA, M.clothB, M.clothC, M.clothD, M.clothE, M.clothF];
    var vests = [M.vest, M.vest2];
    var useVest = !!(LIFE && LIFE.vest);
    pedPts.forEach(function (p) {
      if (Math.abs(p[0]) > R - 2 || Math.abs(p[1]) > R - 2) return;
      YBASE = heightAt(p[0], p[1]) + pedLift;
      var cl = cloths[Math.floor(rd() * cloths.length)];
      var sc = 0.90 + rd() * 0.20;
      if (useVest && rd() < 0.62) cl = vests[Math.floor(rd() * vests.length)];
      put(props, BOX, 0.32, 0.80 * sc, 0.23, p[0], 0.40 * sc, p[1], M.trouser, p[2]);
      put(props, BOX, 0.43, 0.66 * sc, 0.27, p[0], 1.14 * sc, p[1], cl, p[2]);
      put(props, SPH, 0.23, 0.25, 0.23, p[0], 1.60 * sc, p[1], M.skin);
      YBASE = 0;
    });
    stallPts.forEach(function (p) {
      YBASE = heightAt(p[0], p[1]);
      var ax = Math.cos(p[2]), az = -Math.sin(p[2]);
      var bx = Math.sin(p[2]), bz = Math.cos(p[2]);
      var on = function (lx, lz) { return [p[0] + ax * lx + bx * lz, p[1] + az * lx + bz * lz]; };
      var q;
      q = on(0, 0);
      put(props, BOX, 1.72, 0.10, 0.82, q[0], 0.80, q[1], M.timberTrim, p[2]);
      put(props, BOX, 1.56, 0.70, 0.68, q[0], 0.41, q[1], M.timberDark, p[2]);
      [[-0.70, -0.30], [0.70, -0.30], [-0.70, 0.30], [0.70, 0.30]].forEach(function (o2) {
        var c2 = on(o2[0], o2[1]);
        put(props, CYL6, 0.09, 2.32, 0.09, c2[0], 1.16, c2[1], M.timberDark);
      });
      put(props, BOX, 2.14, 0.10, 1.34, q[0], 2.36, q[1], rd() < 0.5 ? M.canopy : M.canopy2, p[2]);
      for (var g3 = 0; g3 < 3; g3++) {
        var c3 = on(-0.48 + g3 * 0.48, (rd() - 0.5) * 0.3);
        put(props, BOX, 0.32 + rd() * 0.20, 0.20 + rd() * 0.14, 0.30,
          c3[0], 0.96, c3[1], rd() < 0.55 ? M.sand : M.canopy2, p[2]);
      }
      YBASE = 0;
    });
    /* 路边板车：木轮 + 车斗，老城货运的主力 */
    cartPts.forEach(function (p) {
      YBASE = heightAt(p[0], p[1]);
      var ax = Math.cos(p[2]), az = -Math.sin(p[2]);
      var bx = Math.sin(p[2]), bz = Math.cos(p[2]);
      var on = function (lx, lz) { return [p[0] + ax * lx + bx * lz, p[1] + az * lx + bz * lz]; };
      var q = on(0, 0);
      put(props, BOX, 1.55, 0.42, 0.92, q[0], 0.62, q[1], M.timberTrim, p[2]);
      put(props, BOX, 1.50, 0.30, 0.86, on(0, 0)[0], 0.90, on(0, 0)[1], M.sand, p[2]);
      [-0.55, 0.55].forEach(function (lx) {
        [-1, 1].forEach(function (sd) {
          var c4 = on(lx, sd * 0.46);
          var wh = put(props, CYL, 0.86, 0.09, 0.86, c4[0], 0.43, c4[1], M.timberDark, p[2]);
          wh.rotation.set(0, p[2], Math.PI / 2);
        });
      });
      YBASE = 0;
    });

    /* --- 车道上的车 ---
       原来只有路边停车，46 米大道的四条车道上是一辆车都没有的空路。
       空路 + 空人行道 = 还没交付。LIFE.traffic 是每 9 米一个候选位的命中率，
       车按 0.16 / 0.34 两个车道偏移铺开，各走各的方向。 */
    if (LIFE && LIFE.traffic) {
      var laneCars = [];
      roads.forEach(function (r) {
        if (r.cls === "lane") return;
        var pc2 = polyLen(r.pts);
        for (var s6 = 9; s6 < pc2.total - 6; s6 += 6 + rd() * 11) {
          if (rd() > LIFE.traffic) continue;
          var pq2 = atPoly(r.pts, pc2.cum, s6);
          var sgt = rd() < 0.5 ? 1 : -1;
          var off6 = r.w * (rd() < 0.5 ? 0.16 : 0.34) * sgt;
          laneCars.push([pq2.x + Math.sin(pq2.ang) * off6,
            pq2.z + Math.cos(pq2.ang) * off6,
            sgt > 0 ? pq2.ang : pq2.ang + Math.PI]);
        }
      });
      api.trafficCount = laneCars.length;
      laneCars.forEach(function (p) {
        if (Math.abs(p[0]) > R - 12 || Math.abs(p[1]) > R - 12) return;
        YBASE = heightAt(p[0], p[1]) + ROAD_Y;
        var matc = carMats[Math.floor(rd() * carMats.length)];
        /* 一成二做成公交/通勤大巴：车流里全是小轿车是假的城市 */
        if (rd() < 0.12) {
          /* 车身的窗带必须比车身**宽** 5 厘米才看得见。
             原来窗带 2.44 宽、车身 2.5 宽——整条窗带被车身包在里面，
             渲染出来是一块 11 米长的实心色块，近看像货柜。 */
          put(props, BOX, 11.0, 2.6, 2.45, p[0], 1.76, p[1], matc, p[2]);
          put(props, BOX, 10.0, 0.95, 2.50, p[0], 2.10, p[1], M.glass, p[2]);
          put(props, BOX, 10.4, 0.34, 2.46, p[0], 0.62, p[1], M.ymDark, p[2]);
        } else {
          put(props, BOX, 4.5, 0.80, 1.86, p[0], 0.86, p[1], matc, p[2]);
          put(props, BOX, 2.4, 0.60, 1.74, p[0], 1.56, p[1], M.glass, p[2]);
        }
        YBASE = 0;
      });
    }

    /* --- 街边咖啡座 ---
       CBD 的「有人在用这条街」不是靠人多，是靠椅子。
       一张圆桌、两把椅子、一把 2.9 米的伞，三件东西就够读成「沿街营业」。 */
    if (LIFE && LIFE.cafe) {
      var cafePts = [];
      roads.forEach(function (r) {
        if (r.cls === "lane") return;
        var pcf = polyLen(r.pts);
        for (var s7 = 16; s7 < pcf.total - 8; s7 += 20 + rd() * 26) {
          if (rd() > LIFE.cafe) continue;
          var pq3 = atPoly(r.pts, pcf.cum, s7);
          var sgc = rd() < 0.5 ? 1 : -1;
          /* 咖啡座只能落在「路缘与行道树之间」这 2–3 米里。
             上一版摆到 29.1–30.7，而 46 米大道的裙房墙面在 29.5 米——
             整排桌椅连人带伞全埋进楼里了，画面上什么也没有。
             23.9–26.3 是唯一既不在车道、也不在楼里的带子。 */
          var off7 = r.w * 0.5 + 1.0 + rd() * 2.4;
          cafePts.push([pq3.x + Math.sin(pq3.ang) * off7 * sgc,
            pq3.z + Math.cos(pq3.ang) * off7 * sgc, pq3.ang]);
        }
      });
      api.cafeCount = cafePts.length;
      cafePts.forEach(function (p) {
        if (Math.abs(p[0]) > R - 8 || Math.abs(p[1]) > R - 8) return;
        YBASE = heightAt(p[0], p[1]) + 0.12;
        put(props, CYL, 1.0, 0.09, 1.0, p[0], 0.74, p[1], M.ymLight2);
        put(props, CYL6, 0.14, 0.72, 0.14, p[0], 0.36, p[1], M.metalDark);
        /* 两把椅子，沿街方向对坐 */
        [-1, 1].forEach(function (sd) {
          var cx3 = p[0] + Math.sin(p[2]) * sd * 1.12;
          var cz3 = p[1] + Math.cos(p[2]) * sd * 1.12;
          put(props, BOX, 0.5, 0.10, 0.5, cx3, 0.44, cz3, M.ymDark, p[2]);
          put(props, BOX, 0.10, 0.52, 0.5, cx3 + Math.sin(p[2]) * sd * 0.20, 0.70,
            cz3 + Math.cos(p[2]) * sd * 0.20, M.ymDark, p[2]);
        });
        /* 伞：杆 + 伞面。2.9 米的伞面是这个尺度上最好认的「沿街营业」 */
        put(props, CYL6, 0.07, 2.1, 0.07, p[0], 1.55, p[1], M.metalDark);
        put(props, CONE, 2.9, 0.55, 2.9, p[0], 2.78, p[1],
          rd() < 0.45 ? M.ymCanopy : M.ymShop[0]);
        YBASE = 0;
      });
    }

    /* --- 远景：边界外不能直接掉进空地 ---
       近两圈按本区的语言补低矮房，最外一圈才放稀疏高楼当地平线。
       工业区（spec.fringeFlat）不铺坡顶瓦房：一圈赭红瓦顶出现在机房谷外，
       整片区域立刻变回县城。它要的是平屋顶的厂房外加零星冷却塔。 */
    /* 全城拼装时不做外围远景：相邻片区就是这一区的远景，
       再铺一圈「边界外的低矮房」只会变成压在邻区身上的一层假房子。 */
    var far = new THREE.Group(), farRnd = U.rng((spec.seed || 3) * 31 + 7);
    var flatEdge = spec.fringeFlat === true;
    var SKIP_FAR = !!CITY;
    /* 全城拼装时整块跳过：这一圈远景会被邻区顶替，生成出来也只是丢掉 */
    if (!SKIP_FAR) {
    /* 外围厂房的墙不能给最亮的那几档：一圈白盒子会把整个谷的调子抬起来，
       远景发白就是这么来的。 */
    /* 外围建筑的墙色默认跟本区色板走，但色板亮的区必须单独压一档：
       D09 的色板是白 / 米 / 砂，外围一圈白盒子撒在草地上，
       读到的不是「远郊住宅」而是「没贴完的白色小纸片」。
       spec.fringePal 让每个区自己指定这圈该用什么颜色。
       优先级：fringePal > fringeFlat 的厂房色 > 本区默认色板。
       原先 fringeFlat 排在前面，D14 加了 fringePal 也不生效——园区外围仍是
       一圈橙红 / 芥黄的彩色积木，跟「同一套标准厂房」的意图对着干。 */
    var edgeMats = (spec.fringePal && spec.fringePal.length)
      ? buildWin(spec.fringePal, 3)
      : flatEdge ? [M.hallWall2, M.hallWall3, M.metalDark, M.concreteDark, M.hallBand]
      : M.win;
    /* 外围建筑有两种摆法：
       ① 有正交路网的区（D01/D02/D03）——极坐标随机撒点够用，乱一点反而自然；
       ② 没有网格的区（D04 湖区这类）——必须走同心环 + 等分角度 + 切向摆位。
          随机半径 + 随机角度 + 随机转角在外围会读成一圈彩色碎块，
          因为没有路网兜住它们，乱就不再是"自然"，而是"没做完"。 */
    var ringMode = spec.fringeRing === true;
    /* 环带疏密：默认一栋挨一栋，1200 米机位上外围会连成一圈白点，
       把「城」与「野」之间那道过渡吃掉。放大间距才有呼吸。 */
    var fgap = spec.fringeGap || 1;
    /* 单栋外围建筑。rotY 由调用方决定：网格区随机对齐，环带区走切线。 */
    function fringeOne(fpx, fpz, rotY, hMin, hMax, roofed, wCap) {
      var fw = flatEdge ? 22 + farRnd() * 40 : 14 + farRnd() * 26;
      var fd = flatEdge ? 18 + farRnd() * 34 : 12 + farRnd() * 22;
      /* 环带上的槽位是等分的，单栋宽过槽宽就会互相咬进去 */
      if (wCap) { fw = Math.min(fw, wCap); fd = Math.min(fd, wCap * 0.78); }
      var fh = hMin + farRnd() * (hMax - hMin);
      /* 陡坡上不落房子：一排方盒子贴在崖面上，比空地更假。
         脊后的台地也不能落——从高处看，山坡上零星几个仓房像随手撒的色块，
         把「一整面青山」这个最有力的构图直接毁掉。 */
      if (TER) {
        var fsl = (Math.abs(heightAt(fpx + 14, fpz) - heightAt(fpx - 14, fpz))
          + Math.abs(heightAt(fpx, fpz + 14) - heightAt(fpx, fpz - 14))) / 28;
        if (fsl > 0.24) return;
        /* 外围建筑的最高海拔。D09 的坡顶上放房子，等于在整道谷的天际线上
           撒一层白瓦片——林线没了，坡也就没了。所以每个区自己定这条线。 */
        if (heightAt(fpx, fpz) > (spec.fringeMaxH === undefined ? 46 : spec.fringeMaxH)) return;
      }
      /* 外围环带一样要避水。D11 的湾压在北缘 z≈−480，环带半径 570–670，
         半个北侧环带正好落在水里——一排水乡小屋浮在湖面上，
         整片水面就废了。这一条之前只在内部填充里判，外围漏掉了。 */
      if (inWater(fpx, fpz)) return;
      /* 外围厂房也要避让 noBuild 走廊。D13 的主干线从区里一路向北穿过外围工业带，
         外围按半径撒点，必然有几栋正好骑在三条股道上——和区内那两栋「鬼建筑」
         是同一个错误，只是发生在八百米外，更难发现。外框缩 3 米：
         房子可以贴着走廊边排，不能横跨。 */
      if (inNoBuildBox(fpx, fpz, Math.max(fw / 2 - 3, 1), Math.max(fd / 2 - 3, 1), rotY)) return;
      /* 坡地上按四角最低点落地，再往下埋一米：不会有一个角悬在空中 */
      var fbase = heightAt(fpx, fpz);
      if (TER) {
        fbase = Math.min(fbase, heightAt(fpx + fw / 2, fpz + fd / 2), heightAt(fpx - fw / 2, fpz - fd / 2),
          heightAt(fpx + fw / 2, fpz - fd / 2), heightAt(fpx - fw / 2, fpz + fd / 2)) - 0.6;
      }
      var g2 = new THREE.Group();
      g2.position.set(fpx, fbase, fpz);
      g2.rotation.y = rotY;
      var body = new THREE.Mesh(BOX, edgeMats[Math.floor(farRnd() * edgeMats.length)]);
      body.scale.set(fw, fh + 4, fd); body.position.y = (fh - 4) / 2;
      body.receiveShadow = true; g2.add(body);
      if (roofed) {
        var rf2 = new THREE.Mesh(GABLE, M.roofRoll(farRnd));
        rf2.scale.set(fw * 1.06, 2.4 + farRnd() * 3.2, fd * 1.06);
        rf2.position.y = fh; rf2.receiveShadow = true; g2.add(rf2);
      } else if (flatEdge) {
        /* 屋面板 + 一圈女儿墙与设备块：从高处看，屋顶就是远景的底色 */
        var rcap = new THREE.Mesh(BOX, M.roofRoll(farRnd));
        rcap.scale.set(fw * 1.03, 0.7, fd * 1.03); rcap.position.y = fh + 0.35;
        rcap.receiveShadow = true; g2.add(rcap);
        var pp = new THREE.Mesh(BOX, M.metalDark);
        pp.scale.set(fw * 0.9, 0.8, 0.5); pp.position.set(0, fh + 1.0, fd * 0.45);
        g2.add(pp);
        var pq = new THREE.Mesh(BOX, M.metal);
        pq.scale.set(fw * 0.34, 1.6, fd * 0.3); pq.position.set(0, fh + 1.2, 0);
        g2.add(pq);
      }
      far.add(g2);
    }
    function fringe(count, rMin, rMax, hMin, hMax, roofed, ringOpt) {
      if (ringMode && ringOpt) {
        var nr = ringOpt.rings || 1, gapW = ringOpt.spacing || 44;
        for (var ri = 0; ri < nr; ri++) {
          var rad = nr === 1 ? (rMin + rMax) / 2
            : rMin + (rMax - rMin) * (0.26 + 0.48 * (ri / (nr - 1)));
          if (ringOpt.square !== undefined) {
        /* 方环园区的延伸段（D08）。
           区本身是三重 51° 斜放的方环，外围如果改回同心圆 + 放射朝向，
           俯视图里就是「一个方块掉进圆盘」——内圈对得上，外圈全错。
           所以外圈也走方环：沿旋转正方形的周长等分排位，转角就是区自己的转角。 */
        var sqA = ringOpt.square, sqC = Math.cos(sqA), sqS = Math.sin(sqA);
        var half = rad * 1.12;
        var nsq = Math.max(8, Math.round(8 * half / gapW));
        var ph2 = farRnd();
        for (var qi = 0; qi < nsq; qi++) {
          if (farRnd() < 0.12) continue;
          var t2 = (ph2 + qi / nsq) % 1;
          var sd = Math.floor(t2 * 4), f2 = t2 * 4 - sd;
          var ox, oz;
          if (sd === 0) { ox = -half + 2 * half * f2; oz = -half; }
          else if (sd === 1) { ox = half; oz = -half + 2 * half * f2; }
          else if (sd === 2) { ox = half - 2 * half * f2; oz = half; }
          else { ox = -half; oz = half - 2 * half * f2; }
          /* 径向抖动收到 ±1.5%。原来的 ±4.5% 在 half≈580 时是 ±26 米，
             房子沿法向散开一整个街区宽，读成「草地上的一撮碎块」，
             而不是「沿街的一排」。 */
          var jr = 1 + (farRnd() - 0.5) * 0.03;
          var lx2 = ox * jr, lz2 = oz * jr;
          /* 角部留空：正方形周长等分时，转角两侧的房子会往角上挤成一堆。
             每条边两端各让出半个槽宽。 */
          if (f2 < 0.055 || f2 > 0.945) continue;
          fringeOne(lx2 * sqC + lz2 * sqS, -lx2 * sqS + lz2 * sqC, sqA,
            hMin, hMax, roofed, gapW * 0.86);
        }
        continue;
      }
      var ns = Math.max(8, Math.round(Math.PI * 2 * rad / gapW));
          var ph = farRnd() * Math.PI * 2;
          for (var si = 0; si < ns; si++) {
            /* 断口：等分角度严丝合缝地排一圈，读出来是体育场看台，不是园区。
               随机空掉一成多槽位，边缘才有「路边有几块空地」的真实感。 */
            if (farRnd() < 0.14) continue;
            var ang = ph + Math.PI * 2 * si / ns;
            /* 半径也要抖：正圆环在俯视图里一眼就假 */
            var rj = rad * (0.94 + farRnd() * 0.13);
            /* 切向摆位：环带上的房子沿弧线排布，不能各自乱转 */
            fringeOne(Math.cos(ang) * rj, Math.sin(ang) * rj,
              ang + Math.PI / 2, hMin, hMax, roofed, gapW * 0.86);
          }
        }
        return;
      }
      for (var fi = 0; fi < count; fi++) {
        var fa = farRnd() * Math.PI * 2, fr = rMin + farRnd() * (rMax - rMin);
        /* 工业园的外围也要跟着网格走：随机转角在方格路网外侧会读成散落碎石，
           老城区反而需要那点混乱，所以只在 flatEdge 时对齐。 */
        fringeOne(Math.cos(fa) * fr, Math.sin(fa) * fr,
          flatEdge && farRnd() < 0.8 ? 0 : farRnd() * Math.PI, hMin, hMax, roofed, 0);
      }
    }
    /* 有地形时外围只剩「建成区到岭脚」这条窄带能落房，
       投点数量要放大，否则那条带会稀得只剩几栋。 */
    /* 方环区的外围方环转角：直接取主轴角，外圈与内圈共用一个方向。 */
    var sqRot = spec.fringeSquare ? ((spec.grid && spec.grid.angle) || 0) : undefined;
    if (TER) {
      fringe(200, R * 1.00, R * 1.09, flatEdge ? 9 : 6, flatEdge ? 20 : 15, !flatEdge,
        sqRot === undefined ? undefined : { rings: 2, spacing: 44, square: sqRot });
      fringe(120, R * 1.09, R * 1.30, flatEdge ? 10 : 7, flatEdge ? 26 : 20, !flatEdge,
        sqRot === undefined ? undefined : { rings: 2, spacing: 56, square: sqRot });
      fringe(40, R * 1.30, R * 1.80, 12, Math.min(prof.farMax || 40, 30), false);
    } else {
      /* fringeNear：第一圈从区界外的哪个倍数开始。默认 1.01——紧贴区界。
         能源区这类「外面还是自己」的区必须拉开：一圈灰盒子贴在 560 米上，
         整片场地会被围成一座厂区围墙，光伏海就不再是「一片」了。 */
      var fNear = spec.fringeNear || 1.01;
      fringe(230, R * fNear, R * (fNear + 0.17), flatEdge ? 9 : 6, flatEdge ? 20 : 15, !flatEdge,
        sqRot === undefined ? { rings: 2, spacing: 44 * fgap } : { rings: 2, spacing: 44 * fgap, square: sqRot });
      /* fringeFar:false —— 不要第二圈。远郊再放一圈，外围就是「城」不是「野」。 */
      if (spec.fringeFar !== false) {
        fringe(190, R * 1.22, R * 1.60, flatEdge ? 10 : 7, flatEdge ? 30 : 24, !flatEdge,
          sqRot === undefined ? { rings: 2, spacing: 56 * fgap } : { rings: 2, spacing: 56 * fgap, square: sqRot });
      }
      /* 环带区不要第三圈远景建筑：一圈孤零零的盒子撒在草地上，
         读到的不是"远郊"而是"没做完"。留给下面的林带。 */
      if (!ringMode) {
        fringe(110, R * 1.70, R * 2.55, 12, Math.min(prof.farMax || 40, 34), false,
          { rings: 1, spacing: 108 });
      }
    }
    /* 环外的林带：园区落在林子里，而不是浮在草地上。
       成丛的树比成排的树更像自然林——簇心 + 簇内散点。 */
    if (ringMode && spec.outerGrove !== false) {
      var groveRnd = U.rng((spec.seed || 3) * 57 + 11);
      /* 林带圈数：湖区没有山挡视线，地平线全靠这圈林子收口。
         六十丛铺到两倍半径之外，每丛之间空出几百米，远看就是草地上几撮绿点。 */
      var groveN = spec.groveClusters || 62;
      for (var gc = 0; gc < groveN; gc++) {
        var gca = groveRnd() * Math.PI * 2;
        var gcd = R * (1.56 + Math.pow(groveRnd(), 1.40) * 1.50);
        var gcx = Math.cos(gca) * gcd, gcz = Math.sin(gca) * gcd;
        var gcn = 14 + Math.floor(groveRnd() * 26);
        var gcr = 26 + groveRnd() * 44;
        for (var gt = 0; gt < gcn; gt++) {
          var gta = groveRnd() * Math.PI * 2, gtr = Math.pow(groveRnd(), 0.55) * gcr;
          var gtx = gcx + Math.cos(gta) * gtr, gtz = gcz + Math.sin(gta) * gtr;
          var gth = 10 + groveRnd() * 9;
          /* 树必须站在地上。put() 只加 YBASE（恒 0），不知道地形——
             坡地上的树 y 取 0 就被整棵埋进土里，于是「坡上什么都没有」。
             这就是绿谷的坡读不出来的真正原因：不是坡不够高，是坡是秃的。 */
          var gby = heightAt(gtx, gtz);
          put(far, CYL6, 0.7, gth * 0.5, 0.7, gtx, gby + gth * 0.25, gtz, M.trunk);
          put(far, SPH, 6.4 + groveRnd() * 4.4, 5.6 + groveRnd() * 3.6, 6.4 + groveRnd() * 4.4,
            gtx, gby + gth * 0.68, gtz, groveRnd() < 0.5 ? M.leaf : M.leaf2);
        }
      }
    }
    /* 园区内部的树丛：一个没有正交街墙的园区，空地全靠草地填，
       俯视就是一大片均匀的绿。树要按「丛」撒进建筑之间的空档，
       既透气又把草地的均质感打散。占位网格已经建完，能直接查空档。 */
    if (spec.parkTrees) {
      var ptRnd = U.rng((spec.seed || 3) * 83 + 31);
      var pcN = spec.parkTrees.clusters || 60;
      var placed = 0;
      for (var pc = 0; pc < pcN * 3 && placed < pcN; pc++) {
        var pca = ptRnd() * Math.PI * 2, pcd = Math.sqrt(ptRnd()) * R * 0.97;
        var pcx = Math.cos(pca) * pcd, pcz = Math.sin(pca) * pcd;
        if (inWater(pcx, pcz)) continue;
        if (!occFree(pcx, pcz, 15, 15, 0)) continue;
        placed++;
        var pcn2 = 3 + Math.floor(ptRnd() * 7), pcr = 9 + ptRnd() * 16;
        for (var pt = 0; pt < pcn2; pt++) {
          var pta = ptRnd() * Math.PI * 2, ptr = Math.pow(ptRnd(), 0.6) * pcr;
          var ptx = pcx + Math.cos(pta) * ptr, ptz = pcz + Math.sin(pta) * ptr;
          if (inWater(ptx, ptz)) continue;
          var pth = 6.5 + ptRnd() * 5.5;
          var pby = heightAt(ptx, ptz);
          put(props, CYL6, 0.55, pth * 0.55, 0.55, ptx, pby + pth * 0.28, ptz, M.trunk);
          put(props, SPH, 4.2 + ptRnd() * 2.6, 3.8 + ptRnd() * 2.2, 4.2 + ptRnd() * 2.6,
            ptx, pby + pth * 0.72, ptz, ptRnd() < 0.5 ? M.leaf : M.leaf2);
        }
      }
    }
    /* --- 山脊林线 -----------------------------------------------------
       坡的高度靠三条线读：山脊压在天空上、脊上一排深绿、坡面渐次抬升。
       第二条最容易做也最容易漏——没有林线，40 米的坡在斜视角里
       只是一片稍微不那么平的草地，读到的是「远处地有点高」，
       不是「这是一道谷」。所以给坡顶单独铺一条林带。 */
    if (spec.groveBands) {
      var rgRnd = U.rng((spec.seed || 3) * 91 + 5);
      spec.groveBands.forEach(function (band) {
        var rgN = band.clusters || 46;
        for (var rgc = 0; rgc < rgN; rgc++) {
          var rgx = (rgRnd() - 0.5) * (band.spanX || 1100);
          var rgz = (band.z0 === undefined ? -560 : band.z0)
            + rgRnd() * ((band.z1 === undefined ? -120 : band.z1) - (band.z0 === undefined ? -560 : band.z0));
          var rgn = (band.per || 12) + Math.floor(rgRnd() * (band.perRand || 22));
          var rgr = (band.r || 24) + rgRnd() * (band.rRand || 36);
          for (var rgt = 0; rgt < rgn; rgt++) {
            var rga = rgRnd() * Math.PI * 2, rgrr = Math.pow(rgRnd(), 0.6) * rgr;
            var rgpx = rgx + Math.cos(rga) * rgrr, rgpz = rgz + Math.sin(rga) * rgrr;
            if (inWater(rgpx, rgpz)) continue;
            /* 占位检查只要 5 米：坡上的住宅间距 42 米、地块 34 米，
               留出的空档只有 8 米宽，用 9 米的半径去躲，一棵都活不下来。
               树本来就可以长在院子里——它不需要 18 米见方的空地，
               它需要的是一小块没被楼压到的土。 */
            if (!occFree(rgpx, rgpz, 5, 5, 0)) continue;
            var rgh = (band.hMin || 9) + rgRnd() * (band.hVar || 8), rgy = heightAt(rgpx, rgpz);
            put(far, CYL6, 0.6, rgh * 0.55, 0.6, rgpx, rgy + rgh * 0.27, rgpz, M.trunk);
            put(far, SPH, 5.4 + rgRnd() * 3.6, 4.8 + rgRnd() * 2.8, 5.4 + rgRnd() * 3.6,
              rgpx, rgy + rgh * 0.68, rgpz, rgRnd() < 0.5 ? M.leaf : M.leaf2);
          }
        }
      });
    }

    }
    if (!SKIP_FAR) scene.add(far);

    /* --- 孤丘顶：一座格构塔 + 一圈树 -------------------------------
       谷底需要一个不属于任何厂区的竖向标记，否则地形抬起来了也没人注意到。 */
    if (TER && TER.knolls) {
      TER.knolls.forEach(function (kn, kni) {
        var ky = heightAt(kn.x, kn.z);
        var g3 = new THREE.Group();
        g3.position.set(kn.x, ky, kn.z);
        put(g3, BOX, 11, 0.9, 11, 0, 0.45, 0, M.paving3);
        var mh = 32 + kni * 8;
        for (var lv2 = 0; lv2 < 4; lv2++) {
          var half = 3.0 - lv2 * 0.55, yy = lv2 * mh / 4;
          for (var sx2 = -1; sx2 <= 1; sx2 += 2) {
            for (var sz2 = -1; sz2 <= 1; sz2 += 2) {
              put(g3, BOX, 0.34, mh / 4, 0.34, sx2 * half, yy + mh / 8, sz2 * half, M.steelDeep);
            }
          }
          put(g3, BOX, half * 2 + 0.4, 0.2, 0.2, 0, yy + mh / 4, half, M.steel);
          put(g3, BOX, half * 2 + 0.4, 0.2, 0.2, 0, yy + mh / 4, -half, M.steel);
        }
        put(g3, CYL6, 0.5, 9, 0.5, 0, mh + 4.5, 0, M.metalDark);
        put(g3, SPH, 1.3, 1.3, 1.3, 0, mh + 9.2, 0, M.beacon);
        blocks.add(g3);
        for (var tk = 0; tk < 26; tk++) {
          var ta = tk / 26 * Math.PI * 2 + kni * 0.7, tr = kn.r * (0.40 + rd() * 0.48);
          var wx2 = kn.x + Math.cos(ta) * tr, wz2 = kn.z + Math.sin(ta) * tr;
          var ty2 = heightAt(wx2, wz2), th3 = 3.6 + rd() * 2.8;
          put(props, CYL6, 0.4, th3, 0.4, wx2, ty2 + th3 * 0.5, wz2, M.trunk);
          put(props, SPH, 4.4 + rd() * 1.6, 3.4 + rd() * 1.2, 4.4 + rd() * 1.6,
            wx2, ty2 + th3 * 0.86, wz2, rd() < 0.5 ? M.leaf : M.leaf2);
        }
      });
    }

    /* --- 静态批处理：按几何+材质合并为 InstancedMesh，压掉上千次绘制 --- */
    scene.updateMatrixWorld(true);
    var batches = {}, statics = [];
    scene.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(function (m) { return !m || m.isShadowMaterial || m.transparent; })) return;
      if (o === ground || o === hillMesh || o === groundShadow) return;
      var key = o.geometry.uuid + "|" + mats[0].uuid + "|" + o.castShadow;
      (batches[key] || (batches[key] = [])).push(o);
      statics.push(o);
    });
    Object.keys(batches).forEach(function (key) {
      var list = batches[key], first = list[0];
      if (list.length < 3) return;
      var im = new THREE.InstancedMesh(first.geometry, first.material, list.length);
      im.castShadow = first.castShadow; im.receiveShadow = true; im.frustumCulled = false;
      list.forEach(function (m, i) { im.setMatrixAt(i, m.matrixWorld); });
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      list.forEach(function (m) { if (m.parent) m.parent.remove(m); });
    });
    api.batches = Object.keys(batches).length;
    api.meshes = statics.length;

    /* --- 时间与帧更新 --- */
    var facades = [];
    scene.traverse(function (o) {
      if (!o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach(function (m) { if (m && m.uniforms && m.uniforms.uLit) facades.push(m); });
    });
    facades = facades.filter(function (m, i) { return facades.indexOf(m) === i; });
    var baseLit = facades.map(function (m) { return { m: m, v: m.uniforms.uLit.value }; });

    api.setTime = function (hour) {
      var state = YC3D_CITY.timeState(hour);
      api.state = state;
      rig.setTime(state);
      rig.sun.shadow.needsUpdate = true;
      baseLit.forEach(function (b) {
        /* 夜里点灯的窗占比。原来 2.9 倍、上限 0.9，等于「夜里 58% 的窗全亮」，
           镜头推到楼跟前就是一整面白光墙。真实夜城的亮窗在三四成，且亮的是少数楼层。 */
        b.m.uniforms.uLit.value = U.clamp(b.v * U.lerp(1.55, 0.06, state.day), 0, 0.56);
      });
      if (groundShadow) groundShadow.material.opacity = U.lerp(0.05, 0.26, state.day);
      if (api.onTimeChange) api.onTimeChange(state);
      return api.inspect();
    };
    var steam = [];
    scene.traverse(function (o) { if (o.isSprite && o.userData.steam) steam.push(o); });
    api.steamCount = steam.length;
    api.update = function (dt, t) {
      rig.update(t, api.camera);
      /* 白汽：升、胀、淡，再顺风向偏一段——这条曲线比任何体积雾都便宜 */
      for (var si = 0; si < steam.length; si++) {
        var sp = steam[si], sd = sp.userData.steam;
        var k = (t * sd.spd + sd.ph) % 1;
        var sc = sd.r0 * (0.45 + k * 2.3);
        sp.position.set(sd.x0 + k * k * 30, sd.y0 + k * sd.rise, sd.z0 - k * k * 14);
        sp.scale.set(sc, sc * 1.12, 1);
        sp.material.opacity = sd.op * Math.pow(1 - k, 0.8) * Math.min(1, k * 9);
      }
    };
    api.inspect = function () {
      var s = api.state || { hour: 0, day: 1, name: "", night: 0, nightSky: 0, exposure: 1 };
      return { hour: s.hour, name: s.name, day: s.day, night: s.night, nightSky: s.nightSky,
        exposure: s.exposure, sun: { visible: rig.sun.visible, intensity: rig.sun.intensity,
          position: rig.sun.position.toArray() },
        facades: { count: facades.length },
        urban: { buildings: count, lots: attempts, reject: reject, roads: roads.length, batches: api.batches,
          meshes: api.meshes, bounds: api.bounds, district: spec.id },
        environment: rig.inspect().environment,
        coordinates: "虚构局部场景单位，1 单位 = 1 米，非 GIS", hero: api.heroInfo };
    };
    api.setTime(opts.hour === undefined ? (Date.now() / 3600000 + 8) % 24 : opts.hour);
    api.skyMat = rig.skyMat;
    /* 全城模式把沥青提亮一档。
       0x4a5057 在近景里是对的——40 米宽的校园环路，走过去就是那个黑。
       但摊到 6 公里外的鸟瞰上，这些环路会在每一片校地里连成一张黑网，
       D07/D09/D10/D11 全会读成「一个黑笼子扣在绿地上」。全城要的是
       「深灰的路网」，不是「黑的」。只动路面，不动建筑玻璃。 */
    if (CITY) {
      [M.asphalt, M.asphaltLight].forEach(function (mt) {
        if (mt && mt.color) mt.color.multiplyScalar(9.5);
      });
    }
    return api;
  }

  /* ------------------------------------------------------------
     近景相机：拖动平移看不同地段，右键/Shift 环绕，滚轮缩放。
     ------------------------------------------------------------ */
  function Rig(camera, o) {
    o = o || {};
    this.cam = camera;
    this.bounds = o.bounds || { minX: -460, maxX: 460, minZ: -460, maxZ: 460 };
    this.home = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0);
    this.center = this.home.clone();
    this.target = this.home.clone();
    this.theta = this.tTheta = o.theta === undefined ? 0.42 : o.theta;
    this.phi = this.tPhi = o.phi === undefined ? 0.74 : o.phi;
    this.dist = this.tDist = o.dist || 400;
    this.baseTheta = this.theta;
    this.homeDist = this.dist;
    this.homePhi = this.phi;
    this.minD = o.minD || 90; this.maxD = o.maxD || 900;
    this.fov = o.fov || 48;
  }
  Rig.prototype.pan = function (dx, dy) {
    var k = this.dist * 0.00185;
    var fx = -Math.sin(this.tTheta), fz = -Math.cos(this.tTheta);
    var rx = Math.cos(this.tTheta), rz = -Math.sin(this.tTheta);
    var moveZ = dy * k / Math.max(0.42, Math.sin(this.tPhi));
    this.target.x -= rx * dx * k + fx * moveZ;
    this.target.z -= rz * dx * k + fz * moveZ;
    this.target.x = U.clamp(this.target.x, this.bounds.minX, this.bounds.maxX);
    this.target.z = U.clamp(this.target.z, this.bounds.minZ, this.bounds.maxZ);
  };
  Rig.prototype.orbit = function (dx, dy) {
    this.tTheta = this.baseTheta + U.clamp(this.tTheta - this.baseTheta - dx * 0.004, -0.85, 0.85);
    this.tPhi = U.clamp(this.tPhi + dy * 0.0032, 0.42, 1.16);
  };
  Rig.prototype.zoom = function (d) {
    this.tDist = U.clamp(this.tDist + d, this.minD, this.maxD);
  };
  Rig.prototype.focus = function (o) {
    this.target.set(o.x || 0, 0, o.z || 0);
    this.tDist = Math.min(this.tDist, 320);
  };
  Rig.prototype.reset = function () {
    this.target.copy(this.home);
    this.tTheta = this.baseTheta; this.tPhi = this.homePhi; this.tDist = this.homeDist || 400;
  };
  Rig.prototype.update = function (dt) {
    var k = 1 - Math.pow(0.0015, Math.max(0.0001, dt));
    this.theta += (this.tTheta - this.theta) * k;
    this.phi += (this.tPhi - this.phi) * k;
    this.dist += (this.tDist - this.dist) * k;
    this.center.lerp(this.target, k);
    var cp = Math.cos(this.phi), sp = Math.sin(this.phi);
    this.cam.position.set(this.center.x + Math.sin(this.theta) * cp * this.dist,
      this.center.y + sp * this.dist,
      this.center.z + Math.cos(this.theta) * cp * this.dist);
    this.cam.lookAt(this.center);
  };

  global.YC3D_DISTRICT = { build: build, Rig: Rig, PALETTE: PALETTE, ARCH: ARCH };
})(window);

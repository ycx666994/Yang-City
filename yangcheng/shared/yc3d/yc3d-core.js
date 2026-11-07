/* ============================================================
   YC3D · 渲染管线核心
   杨城 WebGL 引擎：场景图 / 渲染目标 / 自写 bloom / 后处理
   依赖：three.min.js (r150 UMD)，无 ESM、无构建、file:// 可直开
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE;
  if (!THREE) { console.error("[YC3D] three.js 未加载"); return; }

  /* ---------- 小工具 ---------- */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* 平滑插值：把 0..1 映射成 0..1，两端都平 */
    smooth: function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    ease: function (t) { t = U.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    /* 确定性随机：同一 seed 每次构建出同一座城 */
    rng: function (seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    pick: function (rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; },
    range: function (rnd, a, b) { return a + (b - a) * rnd(); },
    /* 颜色：十六进制 → THREE.Color，并允许亮度缩放 */
    col: function (hex, k) {
      var c = new THREE.Color(hex);
      if (k !== undefined && k !== 1) c.multiplyScalar(k);
      return c;
    }
  };
  global.YC3D_U = U;

  /* ---------- 后处理 shader ---------- */
  var VS_QUAD = [
    "varying vec2 vUv;",
    "void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }"
  ].join("\n");

  /* 亮部提取：只留超过阈值的部分，降采样到半分辨率 */
  var FS_BRIGHT = [
    "uniform sampler2D tDiffuse;",
    "uniform float uThresh;",
    "uniform float uSoft;",
    "uniform vec2 uTexel;",
    "varying vec2 vUv;",
    "void main(){",
    "  vec3 c = vec3(0.0);",
    "  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,-1.0)).rgb;",
    "  c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,-1.0)).rgb;",
    "  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb;",
    "  c += texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, 1.0)).rgb;",
    "  c *= 0.25;",
    "  float l = max(c.r, max(c.g, c.b));",
    "  float w = smoothstep(uThresh, uThresh + uSoft, l);",
    "  gl_FragColor = vec4(c * w, 1.0);",
    "}"
  ].join("\n");

  /* 可分离高斯：9 tap，方向由 uDir 决定 */
  var FS_BLUR = [
    "uniform sampler2D tDiffuse;",
    "uniform vec2 uDir;",
    "varying vec2 vUv;",
    "void main(){",
    "  vec3 c = vec3(0.0);",
    "  c += texture2D(tDiffuse, vUv - uDir * 4.0).rgb * 0.0162;",
    "  c += texture2D(tDiffuse, vUv - uDir * 3.0).rgb * 0.0540;",
    "  c += texture2D(tDiffuse, vUv - uDir * 2.0).rgb * 0.1216;",
    "  c += texture2D(tDiffuse, vUv - uDir * 1.0).rgb * 0.1945;",
    "  c += texture2D(tDiffuse, vUv).rgb                 * 0.2270;",
    "  c += texture2D(tDiffuse, vUv + uDir * 1.0).rgb * 0.1945;",
    "  c += texture2D(tDiffuse, vUv + uDir * 2.0).rgb * 0.1216;",
    "  c += texture2D(tDiffuse, vUv + uDir * 3.0).rgb * 0.0540;",
    "  c += texture2D(tDiffuse, vUv + uDir * 4.0).rgb * 0.0162;",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  /* 合成：色差 + bloom 叠加 + 暗角 + 扫描线 + 噪点 + 空气感 */
  var FS_COMP = [
    "uniform sampler2D tScene;",
    "uniform sampler2D tBloom;",
    "uniform float uBloom;",
    "uniform float uAber;",
    "uniform float uVig;",
    "uniform float uGrain;",
    "uniform float uScan;",
    "uniform float uTime;",
    "uniform float uExposure;",
    "uniform vec2  uRes;",
    "varying vec2 vUv;",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "void main(){",
    "  vec2 uv = vUv;",
    "  vec2 d = uv - 0.5;",
    "  float r2 = dot(d, d);",
    /* 色差：越靠边越明显，模拟镜头 */
    "  vec2 off = d * uAber * (0.35 + r2 * 2.4);",
    "  vec3 c;",
    "  c.r = texture2D(tScene, uv + off).r;",
    "  c.g = texture2D(tScene, uv).g;",
    "  c.b = texture2D(tScene, uv - off).b;",
    /* bloom：两层不同尺度叠加，避免单层糊成一片 */
    "  vec3 b = texture2D(tBloom, uv).rgb;",
    "  c += b * uBloom;",
    /* 暗角 */
    "  float vig = 1.0 - uVig * smoothstep(0.10, 0.78, r2 * 1.9);",
    "  c *= vig;",
    /* 扫描线：极淡，只为了让画面有 CRT 的呼吸 */
    "  float sl = sin((uv.y * uRes.y) * 1.5708 + uTime * 1.2) * 0.5 + 0.5;",
    "  c *= mix(1.0, 0.972 + sl * 0.056, uScan);",
    /* 噪点：暗部更明显，压住色带 */
    "  float n = hash(uv * uRes + fract(uTime) * 91.7);",
    "  c += (n - 0.5) * uGrain * (1.0 - smoothstep(0.0, 0.55, max(c.r, max(c.g, c.b))));",
    /* 显示变换只在末级发生：线性HDR -> ACES拟合 -> sRGB。 */
    "  c = max(c, 0.0) * uExposure;",
    "  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);",
    "  vec3 low = c * 12.92;",
    "  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;",
    "  gl_FragColor = vec4(mix(high, low, step(c, vec3(0.0031308))), 1.0);",
    "}"
  ].join("\n");

  /* ---------- 舞台 ---------- */
  function Stage(opts) {
    opts = opts || {};
    var canvas = opts.canvas;
    this.canvas = canvas;
    this.quality = opts.quality || "high";
    this.maxDPR = opts.maxDPR || 1.75;
    this.bloom = opts.bloom === undefined ? 0.95 : opts.bloom;
    this.aber = opts.aber === undefined ? 0.0016 : opts.aber;
    this.vig = opts.vig === undefined ? 0.42 : opts.vig;
    this.grain = opts.grain === undefined ? 0.035 : opts.grain;
    this.scan = opts.scan === undefined ? 0.35 : opts.scan;
    this.thresh = opts.thresh === undefined ? 1.2 : opts.thresh;
    this.exposure = opts.exposure === undefined ? 1.0 : opts.exposure;

    var r;
    try {
      r = new THREE.WebGLRenderer({
        canvas: canvas, antialias: true, alpha: false,
        powerPreference: "high-performance", stencil: false, depth: true
      });
    } catch (e) {
      console.error("[YC3D] WebGL 初始化失败", e);
      this.failed = true;
      return;
    }
    this.renderer = r;
    r.setClearColor(0x05070f, 1);
    r.autoClear = false;
    r.outputEncoding = THREE.LinearEncoding;
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.clock = new THREE.Clock();
    this.time = 0;
    this._raf = 0;
    this._paused = false;
    this._onFrame = [];
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;

    this._buildPost();
    this.resize();

    var self = this;
    this._loop = function () {
      self._raf = requestAnimationFrame(self._loop);
      if (self._paused) return;
      self.frame();
    };
  }

  Stage.prototype._buildPost = function () {
    var r = this.renderer;
    var rtOpt = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false
    };
    var hdrOK = true;
    try {
      this.rtScene = new THREE.WebGLRenderTarget(2, 2, rtOpt);
    } catch (e) {
      hdrOK = false;
      rtOpt.type = THREE.UnsignedByteType;
      this.rtScene = new THREE.WebGLRenderTarget(2, 2, rtOpt);
    }
    this.hdr = hdrOK;
    // Renderer的antialias只覆盖默认帧缓冲；离屏HDR目标必须自己启用MSAA。
    if (r.capabilities.isWebGL2) this.rtScene.samples = Math.min(4, r.capabilities.maxSamples);
    this.rtA = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: false, stencilBuffer: false
    });
    this.rtB = this.rtA.clone();
    this.rtC = this.rtA.clone();

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.matBright = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uThresh: { value: this.thresh },
        uSoft: { value: 0.22 }, uTexel: { value: new THREE.Vector2() }
      },
      vertexShader: VS_QUAD, fragmentShader: FS_BRIGHT, depthTest: false, depthWrite: false
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VS_QUAD, fragmentShader: FS_BLUR, depthTest: false, depthWrite: false
    });
    this.matComp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uBloom: { value: this.bloom }, uAber: { value: this.aber },
        uVig: { value: this.vig }, uGrain: { value: this.grain },
        uScan: { value: this.scan }, uTime: { value: 0 }, uExposure: { value: this.exposure },
        uRes: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: VS_QUAD, fragmentShader: FS_COMP, depthTest: false, depthWrite: false
    });
  };

  Stage.prototype.resize = function () {
    var w = this.canvas.clientWidth || global.innerWidth;
    var h = this.canvas.clientHeight || global.innerHeight;
    var dpr = Math.min(global.devicePixelRatio || 1, this.maxDPR);
    if (this.quality === "low") dpr = Math.min(dpr, 1);
    this.w = w; this.h = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    var pw = Math.max(2, Math.floor(w * dpr)), ph = Math.max(2, Math.floor(h * dpr));
    this.pw = pw; this.ph = ph;
    this.rtScene.setSize(pw, ph);
    var bw = Math.max(2, pw >> 1), bh = Math.max(2, ph >> 1);
    this.rtA.setSize(bw, bh); this.rtB.setSize(bw, bh); this.rtC.setSize(bw, bh);
    this.matComp.uniforms.uRes.value.set(pw, ph);
    this.matBright.uniforms.uTexel.value.set(1 / pw, 1 / ph);
    if (this.onResize) this.onResize(w, h, pw, ph);
  };

  Stage.prototype.onFrame = function (fn) { this._onFrame.push(fn); return this; };

  Stage.prototype._blit = function (mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCam);
  };

  Stage.prototype.frame = function () {
    var rawDt = this.clock.getDelta();
    var dt = Math.min(rawDt, 0.1);
    this.time += dt;

    this._fpsAcc += rawDt; this._fpsN++;
    if (this._fpsAcc > 0.5) {
      this.fps = this._fpsN / this._fpsAcc;
      this._fpsAcc = 0; this._fpsN = 0;
      if (this.autoQuality) this.autoQuality(this.fps);
    }

    for (var i = 0; i < this._onFrame.length; i++) this._onFrame[i](dt, this.time);

    if (!this.scene || !this.camera) return;
    var r = this.renderer;

    r.setRenderTarget(this.rtScene);
    r.clear(true, true, true);
    r.render(this.scene, this.camera);

    if (this.bloom > 0.001) {
      var bw = this.rtA.width, bh = this.rtA.height;
      this.matBright.uniforms.tDiffuse.value = this.rtScene.texture;
      this._blit(this.matBright, this.rtA);

      /* 两轮模糊，半径递增 → 近处锐利、远处弥散 */
      this.matBlur.uniforms.tDiffuse.value = this.rtA.texture;
      this.matBlur.uniforms.uDir.value.set(1 / bw, 0);
      this._blit(this.matBlur, this.rtB);

      this.matBlur.uniforms.tDiffuse.value = this.rtB.texture;
      this.matBlur.uniforms.uDir.value.set(0, 1 / bh);
      this._blit(this.matBlur, this.rtC);

      this.matBlur.uniforms.tDiffuse.value = this.rtC.texture;
      this.matBlur.uniforms.uDir.value.set(2.2 / bw, 0);
      this._blit(this.matBlur, this.rtB);

      this.matBlur.uniforms.tDiffuse.value = this.rtB.texture;
      this.matBlur.uniforms.uDir.value.set(0, 2.2 / bh);
      this._blit(this.matBlur, this.rtC);

      this.matComp.uniforms.tBloom.value = this.rtC.texture;
    } else {
      this.matComp.uniforms.tBloom.value = this.rtScene.texture;
    }

    this.matComp.uniforms.tScene.value = this.rtScene.texture;
    this.matComp.uniforms.uTime.value = this.time;
    this.matComp.uniforms.uBloom.value = this.bloom;
    this.matComp.uniforms.uExposure.value = this.exposure;
    this._blit(this.matComp, null);
  };

  Stage.prototype.start = function () {
    this.clock.getDelta();
    this._loop();
    return this;
  };
  Stage.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    return this;
  };
  Stage.prototype.setScene = function (scene, camera) {
    this.scene = scene; this.camera = camera; return this;
  };

  /* 一次性渲染（截图 / 静态场景） */
  Stage.prototype.renderOnce = function (scene, camera) {
    this.scene = scene; this.camera = camera;
    this.frame();
  };

  /* ---------- 相机运镜 ---------- */
  /* 关键帧插值：每帧给 position/target/fov 做三次缓动 */
  function Rig(camera) {
    this.camera = camera;
    this.pos = camera.position.clone();
    this.tgt = new THREE.Vector3(0, 0, 0);
    this.fov = camera.fov;
    this._kf = null;
    this._t = 0;
    this._dur = 1;
    this._from = null;
    this._to = null;
  }
  Rig.prototype.snap = function (p, t, fov) {
    this.pos.set(p[0], p[1], p[2]);
    this.tgt.set(t[0], t[1], t[2]);
    if (fov) this.fov = fov;
    this._apply();
    return this;
  };
  Rig.prototype.to = function (p, t, dur, fov, onDone) {
    this._from = {
      p: this.pos.clone(), t: this.tgt.clone(), f: this.fov
    };
    this._to = {
      p: new THREE.Vector3(p[0], p[1], p[2]),
      t: new THREE.Vector3(t[0], t[1], t[2]),
      f: fov === undefined ? this.fov : fov
    };
    this._t = 0; this._dur = Math.max(0.001, dur || 1);
    this._onDone = onDone || null;
    return this;
  };
  Rig.prototype._apply = function () {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  };
  Rig.prototype.update = function (dt) {
    if (!this._to) { this._apply(); return; }
    this._t += dt;
    var k = U.ease(this._t / this._dur);
    this.pos.lerpVectors(this._from.p, this._to.p, k);
    this.tgt.lerpVectors(this._from.t, this._to.t, k);
    this.fov = U.lerp(this._from.f, this._to.f, k);
    this._apply();
    if (this._t >= this._dur) {
      var cb = this._onDone;
      this._to = null; this._onDone = null;
      if (cb) cb();
    }
  };
  Rig.prototype.busy = function () { return !!this._to; };

  global.YC3D = {
    Stage: Stage,
    Rig: Rig,
    U: U,
    THREE: THREE,
    /* 常用色板：杨城统一色 */
    PAL: {
      void: 0x04060c,
      night: 0x080d1a,
      deep: 0x0b1424,
      steel: 0x131c2c,
      ice: 0x8fd8ff,
      cyan: 0x37e6ff,
      teal: 0x1fd6c8,
      violet: 0x8b5cff,
      magenta: 0xff4fa3,
      amber: 0xffb347,
      gold: 0xffd98a,
      lime: 0x9dff5c,
      red: 0xff3b57
    }
  };
})(window);

/* ============================================================
   YC3D · 博物馆运行时
   一个馆 = 若干"房间"，房间沿 X 轴排开，相机在房间内第一人称行走
   大厅自由走，展厅由导游带着走
   ============================================================ */
(function (global) {
  "use strict";
  var THREE = global.THREE;
  var Y = global.YC3D, B = global.YC3D_B, P = global.YC3D_P;
  if (!THREE || !Y || !B || !P) { console.error("[YC3D] 依赖未加载"); return; }
  var U = Y.U;

  var ROOM_GAP = 900;

  function Engine(o) {
    this.stage = o.stage;
    this.cfg = o.cfg;
    this.canvas = o.canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe6eef4);
    this.scene.fog = new THREE.FogExp2(0xe6eef4, o.fog === undefined ? 0.002 : o.fog);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

    this.rooms = {};
    this.order = [];
    this.cur = null;
    this.tour = null;
    this.guide = null;
    this.t = 0;

    /* 玩家状态 */
    this.pos = new THREE.Vector3(0, 1.66, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.locked = false;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.hover = null;
    this.pickables = [];

    this._environment();
    this._build();
    this._bind();
    this.stage.setScene(this.scene, this.camera);
    this._frameCallback = this._tick.bind(this);
    this.stage.onFrame(this._frameCallback);
  }

  /* 一个共享灯架，切房间时移到当前原点；不叠加所有房间的灯。 */
  Engine.prototype._environment = function () {
    this.lightRig = new THREE.Group();
    this.lightRig.add(new THREE.HemisphereLight(0xe9f3ff, 0xc3beb0, 0.8));
    this.sun = new THREE.DirectionalLight(0xfff1da, 2.5);
    this.sun.position.set(-14, 32, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -40; this.sun.shadow.camera.right = 40;
    this.sun.shadow.camera.top = 40; this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 110;
    this.sun.shadow.bias = -0.00015; this.sun.shadow.normalBias = 0.08;
    this.lightRig.add(this.sun); this.lightRig.add(this.sun.target);
    var fill = new THREE.DirectionalLight(0xdceeff, 0.65);
    fill.position.set(14, 16, -12); this.lightRig.add(fill); this.lightRig.add(fill.target);
    this.scene.add(this.lightRig);
    /* 馆内天光恒定，不随城市夜间把大厅压黑。PMREM只生成一次。 */
    if (this.stage.renderer && THREE.PMREMGenerator) {
      var env = new THREE.Scene();
      var sky = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xdce8f0, side: THREE.BackSide }));
      env.add(sky);
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(70, 70),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e7).multiplyScalar(3), side: THREE.DoubleSide }));
      panel.rotation.x = Math.PI / 2; panel.position.y = 35; env.add(panel);
      var pmrem = new THREE.PMREMGenerator(this.stage.renderer);
      this._envTarget = pmrem.fromScene(env, 0.04, 0.1, 200);
      this.scene.environment = this._envTarget.texture;
      pmrem.dispose();
      sky.geometry.dispose(); sky.material.dispose(); panel.geometry.dispose(); panel.material.dispose();
    }
  };

  /* ---------- 构建所有房间 ---------- */
  Engine.prototype._build = function () {
    var self = this;
    var pal = this.cfg.palette || {};
    this.cfg.rooms.forEach(function (def, i) {
      var ctx = {
        THREE: THREE, B: B, P: P, pal: pal, cfg: self.cfg,
        room: def, engine: self, index: i
      };
      var g = def.build ? def.build(ctx) : new THREE.Group();
      g.position.x = i * ROOM_GAP;
      g.visible = false;
      g.traverse(function (obj) {
        if (obj.isLight) { obj.userData.roomVisible = obj.visible; obj.visible = false; }
      });
      g.traverse(function (obj) {
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (mat) { if (mat && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.35; });
      });
      self.scene.add(g);
      var rec = {
        def: def, group: g, index: i,
        origin: new THREE.Vector3(i * ROOM_GAP, 0, 0),
        size: def.size || { w: 60, d: 80, h: 24 }
      };
      self.rooms[def.id] = rec;
      self.order.push(rec);
    });

    /* 环境音 */
    this._ambient();
  };

  /* ---------- 环境音：低频嗡鸣 + 偶发回声，几乎听不见但能感觉到空间 ---------- */
  Engine.prototype._ambient = function () {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      var ctx = new AC();
      this.ac = ctx;
      var master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      /* 两个略微失谐的低频，形成缓慢的拍频 */
      [55, 55.7, 82.4].forEach(function (f, i) {
        var o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        var g = ctx.createGain();
        g.gain.value = i === 2 ? 0.035 : 0.055;
        var lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 220;
        o.connect(g); g.connect(lp); lp.connect(master);
        o.start();
      });

      /* 极轻的噪声层，像空气 */
      var len = ctx.sampleRate * 2;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      var src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      var ng = ctx.createGain(); ng.gain.value = 0.012;
      var nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 0.6;
      src.connect(nf); nf.connect(ng); ng.connect(master);
      src.start();

      this._ambTarget = 0.5;
    } catch (e) { /* 静默失败 */ }
  };
  Engine.prototype._ambLevel = function (v) {
    if (!this.master || !this.ac) return;
    this._ambTarget = v;
    if (this.ac.state === "suspended") this.ac.resume().catch(function () {});
  };

  Engine.prototype.resetInput = function () {
    this.keys = {}; this.run = false; this._drag = null; this.vel.set(0, 0, 0);
    this._setHover(null);
  };
  /* 输入只作用于画布；表单和iframe获得焦点时不偷按键。 */
  Engine.prototype._bind = function () {
    var self = this, cv = this.canvas;
    this._listeners = [];
    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      self._listeners.push([target, type, fn, options]);
    }
    listen(document, "keydown", function (e) {
      if (self.locked || document.activeElement !== cv || e.ctrlKey || e.altKey || e.metaKey) return;
      var k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].indexOf(k) < 0) return;
      e.preventDefault(); self.keys[k] = true; self.run = !!self.keys.shift;
    });
    listen(document, "keyup", function (e) { self.keys[e.key.toLowerCase()] = false; self.run = !!self.keys.shift; });
    listen(global, "blur", function () { self.resetInput(); self.pause(true); });
    listen(cv, "blur", function () { self.resetInput(); });
    listen(document, "visibilitychange", function () {
      if (document.hidden) { self.resetInput(); self.pause(true); }
    });
    function point(e) {
      var r = cv.getBoundingClientRect();
      self.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    }
    listen(cv, "pointerdown", function (e) {
      if (self.locked || e.button !== 0) return;
      cv.focus({ preventScroll: true }); point(e);
      self._drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
    });
    listen(cv, "pointermove", function (e) {
      if (self.locked) return;
      point(e);
      if (self._drag) {
        var dx = e.clientX - self._drag.x, dy = e.clientY - self._drag.y;
        self._drag.moved += Math.abs(dx) + Math.abs(dy);
        self._drag.x = e.clientX; self._drag.y = e.clientY;
        if (!self.tour) {
          self.yaw -= dx * 0.0032;
          self.pitch = Math.max(-1.05, Math.min(1.05, self.pitch - dy * 0.0026));
        }
      }
      self._hoverAt();
    });
    listen(cv, "pointerup", function (e) {
      point(e);
      var quick = self._drag && performance.now() - self._drag.t < 420 && self._drag.moved < 8;
      self._drag = null;
      if (quick && !self.locked) self._clickAt();
    });
    listen(cv, "pointercancel", function () { self.resetInput(); });
    listen(cv, "lostpointercapture", function () { self._drag = null; });
    listen(cv, "pointerleave", function () { self._drag = null; self._setHover(null); });
    listen(cv, "touchstart", function (e) { if (!self.locked && e.touches.length === 2) self.keys.w = true; }, { passive: true });
    listen(cv, "touchend", function () { self.keys.w = false; }, { passive: true });
    listen(cv, "touchcancel", function () { self.resetInput(); }, { passive: true });
  };

  Engine.prototype._setHover = function (obj) {
    if (this.hover === obj) return;
    if (this.hover && this.hover.userData && this.hover.userData.onOut) this.hover.userData.onOut();
    this.hover = obj;
    if (obj && obj.userData && obj.userData.onOver) obj.userData.onOver();
    this.canvas.classList.toggle("hot", !!obj);
    if (this.onHover) this.onHover(obj);
  };

  Engine.prototype._pickAt = function () {
    if (!this.cur || this.locked) return null;
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    var hits = this.raycaster.intersectObject(this.cur.group, true);
    for (var i = 0; i < hits.length; i++) {
      var obj = hits[i].object, action = null, visible = true;
      for (var p = obj; p; p = p.parent) {
        if (!p.visible) visible = false;
        if (!action && p.userData && (p.userData.onClick || p.userData.onOver)) action = p;
      }
      if (!visible) continue;
      /* 实体墙会遮挡后面的点击目标；玻璃允许点击柜内标签。 */
      if (action) return action;
      var mat = obj.material;
      if (mat && !mat.transparent) return null;
    }
    return null;
  };
  Engine.prototype._hoverAt = function () { this._setHover(this._pickAt()); };
  Engine.prototype._clickAt = function () {
    var o = this._pickAt();
    if (o && o.userData.onClick) o.userData.onClick(o);
  };

  /* ---------- 进入房间 ---------- */
  Engine.prototype.enter = function (id, opt) {
    opt = opt || {};
    var rec = this.rooms[id];
    if (!rec) { console.warn("[YC3D] 没有房间", id); return; }
    this.resetInput();
    this.cur = rec;
    this.tour = null;

    /* 相机放到房间的入口点 */
    var sp = rec.def.spawn || [0, 1.66, rec.size.d / 2 - 6];
    this.pos.set(rec.origin.x + sp[0], sp[1], sp[2]);
    this.yaw = rec.def.spawnYaw === undefined ? 0 : rec.def.spawnYaw;
    this.pitch = rec.def.spawnPitch === undefined ? -0.02 : rec.def.spawnPitch;

    /* 只有当前房间可见 */
    var self = this;
    this.order.forEach(function (r) {
      r.group.visible = (r === rec);
      r.group.traverse(function (obj) {
        if (obj.isLight) obj.visible = r === rec && obj.userData.roomVisible !== false;
      });
    });
    this.lightRig.position.copy(rec.origin);
    this.scene.updateMatrixWorld(true);
    this.camera.position.copy(this.pos);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.guide && this.guide.fig) {
      this.guide.fig.visible = id !== "lobby";
      this.updateGuide(0, true);
    }

    this._ambLevel(id === "lobby" ? 0.55 : 0.42);
    if (this.onEnter) this.onEnter(rec);
    return rec;
  };

  /* ---------- 游览：沿停留点走 ---------- */
  Engine.prototype.resolveText = function (text) {
    var id = this.guide && this.guide.def ? this.guide.def.id : null;
    if (typeof text === "function") return text(id);
    if (typeof text === "string") return text;
    return text && id ? text[id] || "" : "";
  };
  Engine.prototype.play = function (stops, onDone) {
    if (!this.cur || !this.guide) { this.tour = null; return; }
    this.resetInput();
    var self = this, origin = this.cur.origin;
    var fixed = (stops || []).map(function (s) {
      return {
        pos: [s.pos[0] + origin.x, s.pos[1] + origin.y, s.pos[2] + origin.z],
        look: [s.look[0] + origin.x, s.look[1] + origin.y, s.look[2] + origin.z],
        move: s.move, hold: s.hold, text: self.resolveText(s.text)
      };
    });
    this.tour = {
      stops: fixed, i: -1, phase: "move", t: 0,
      from: { p: this.pos.clone(), yaw: this.yaw, pitch: this.pitch },
      onDone: onDone || null, holdT: 0, paused: false
    };
    this._nextStop();
  };

  Engine.prototype._nextStop = function () {
    var tr = this.tour;
    if (!tr) return;
    tr.i++;
    if (tr.i >= tr.stops.length) {
      var cb = tr.onDone;
      this.tour = null;
      if (cb) cb();
      return;
    }
    var s = tr.stops[tr.i];
    tr.from = { p: this.pos.clone(), yaw: this.yaw, pitch: this.pitch };
    tr.to = s;
    tr.t = 0;
    tr.phase = "move";
    tr.holdT = 0;
    if (this.onStop) this.onStop(s, tr.i);
  };

  Engine.prototype.pause = function (paused) {
    if (!this.tour) return;
    this.tour.paused = paused === undefined ? !this.tour.paused : !!paused;
    this.resetInput();
    if (this.onPause) this.onPause(this.tour.paused);
  };
  Engine.prototype.free = function () {
    this.tour = null; this.resetInput();
    if (this.onTourEnd) this.onTourEnd();
  };
  /* 下一站始终递增一次；移动中点击也不是仅仅落到本站。暂停状态保留。 */
  Engine.prototype.skip = function () {
    if (!this.tour || this.locked) return;
    var s = this.tour.to;
    this.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    var dir = new THREE.Vector3(s.look[0] - s.pos[0], s.look[1] - s.pos[1], s.look[2] - s.pos[2]);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this._nextStop();
  };

  /* ---------- 每帧 ---------- */
  Engine.prototype._tick = function (dt, t) {
    if (this.disposed) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (!this.cur) return;
    if (this.master) this.master.gain.value += (this._ambTarget - this.master.gain.value) * Math.min(1, dt * 1.5);
    if (!this.locked && !document.hidden) {
      if (this.tour) { if (!this.tour.paused) this._tickTour(dt); }
      else this._tickWalk(dt);
      this.updateGuide(dt);
    }

    this.camera.position.copy(this.pos);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    /* 环境动效：中庭环转、灯带呼吸 */
    var g = this.cur.group;
    if (g.userData.atrium) {
      var at = g.userData.atrium;
      if (at.userData.rings) {
        at.userData.rings.forEach(function (r, i) {
          r.rotation.z = t * (0.10 + i * 0.05) * (i % 2 ? -1 : 1);
        });
      }
    }
    /* 全息材质统一推进时间 */
    this._holo(g, t);
    if (B.updateCharacters) B.updateCharacters(this.scene, dt, !!this.tour && this.tour.phase === "hold");
  };

  Engine.prototype._holo = function (g, t) {
    if (!g.userData._holo) {
      g.userData._holo = [];
      g.traverse(function (o) {
        if (o.material && o.material.uniforms && o.material.uniforms.uTime) g.userData._holo.push(o.material);
      });
    }
    var arr = g.userData._holo;
    for (var i = 0; i < arr.length; i++) arr[i].uniforms.uTime.value = t;
  };

  Engine.prototype._tickWalk = function (dt) {
    var k = this.keys;
    var sp = (this.run ? 7.4 : 3.6) * dt;
    var fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    var rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    var mx = 0, mz = 0;
    if (k.w || k.arrowup) { mx += fx; mz += fz; }
    if (k.s || k.arrowdown) { mx -= fx; mz -= fz; }
    if (k.a || k.arrowleft) { mx -= rx; mz -= rz; }
    if (k.d || k.arrowright) { mx += rx; mz += rz; }
    var len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      this.vel.x += (mx * sp - this.vel.x) * 0.22;
      this.vel.z += (mz * sp - this.vel.z) * 0.22;
    } else {
      this.vel.x *= 0.78; this.vel.z *= 0.78;
    }
    this.pos.x += this.vel.x;
    this.pos.z += this.vel.z;

    /* 边界：不许穿墙（房间在世界坐标里沿 X 排开，要带原点） */
    var s = this.cur.size;
    var ox = this.cur.origin.x;
    var pad = 2.0;
    this.pos.x = Math.max(ox - s.w / 2 + pad, Math.min(ox + s.w / 2 - pad, this.pos.x));
    this.pos.z = Math.max(-s.d / 2 + pad, Math.min(s.d / 2 - pad, this.pos.z));
    this.pos.y = 1.66;

    /* 行走轻微起伏 */
    var moving = Math.hypot(this.vel.x, this.vel.z);
    this.pos.y += Math.sin(this.t * 9.5) * 0.012 * Math.min(1, moving / 3);
  };

  Engine.prototype._tickTour = function (dt) {
    var tr = this.tour;
    if (tr.phase === "move") {
      tr.t += dt / (tr.to.move || 3.2);
      var k = U.ease(Math.min(1, tr.t));
      this.pos.lerpVectors(tr.from.p, new THREE.Vector3(tr.to.pos[0], tr.to.pos[1], tr.to.pos[2]), k);
      /* 朝向：用 look 点算 yaw/pitch */
      var look = new THREE.Vector3(tr.to.look[0], tr.to.look[1], tr.to.look[2]);
      var dir = look.clone().sub(this.pos);
      var ty = Math.atan2(-dir.x, -dir.z);
      var tp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      /* 角度插值走最短路径 */
      var dy = ((ty - tr.from.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw = tr.from.yaw + dy * k;
      this.pitch = U.lerp(tr.from.pitch, tp, k);
      if (tr.t >= 1) { tr.phase = "hold"; tr.holdT = 0; }
    } else {
      tr.holdT += dt;
      var hold = tr.to.hold === undefined ? 5 : tr.to.hold;
      if (tr.holdT >= hold) this._nextStop();
    }
  };

  /* ---------- 导游：站在相机前方，随行 ---------- */
  Engine.prototype.attachGuide = function (g) {
    if (this.guide && this.guide.fig && this.guide.fig.parent) this.guide.fig.parent.remove(this.guide.fig);
    this.guide = g || null;
    if (!g || !g.fig) return;
    this.scene.add(g.fig);
    g.fig.visible = !!this.cur && this.cur.def.id !== "lobby";
    this.updateGuide(0, true);
  };
  Engine.prototype.updateGuide = function (dt, snap) {
    if (!this.guide || !this.cur) return;
    var fig = this.guide.fig;
    if (!fig || !fig.visible || !fig.parent) return;
    var fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    var rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    var origin = this.cur.origin, size = this.cur.size;
    var target = new THREE.Vector3(this.pos.x + fx * 3.2 + rx * 2.4, origin.y, this.pos.z + fz * 3.2 + rz * 2.4);
    target.x = Math.max(origin.x - size.w / 2 + 2, Math.min(origin.x + size.w / 2 - 2, target.x));
    target.z = Math.max(origin.z - size.d / 2 + 2, Math.min(origin.z + size.d / 2 - 2, target.z));
    /* target是世界坐标，位置必须换成父节点局部坐标；切厅瞬移，禁止从0穿过900米。 */
    fig.parent.updateMatrixWorld(true);
    var local = fig.parent.worldToLocal(target.clone());
    if (snap || fig.userData.followRoom !== this.cur.def.id) fig.position.copy(local);
    else fig.position.lerp(local, 1 - Math.exp(-dt * 3.2));
    fig.userData.followRoom = this.cur.def.id;
    fig.lookAt(this.pos.x, origin.y, this.pos.z);
  };

  Engine.prototype.destroy = function () {
    this.disposed = true; this.free(); this.attachGuide(null);
    (this._listeners || []).forEach(function (item) { item[0].removeEventListener(item[1], item[2], item[3]); });
    this._listeners = [];
    if (this.stage._onFrame) {
      var i = this.stage._onFrame.indexOf(this._frameCallback);
      if (i >= 0) this.stage._onFrame.splice(i, 1);
    }
    if (this._envTarget) this._envTarget.dispose();
    if (this.ac && this.ac.state !== "closed") this.ac.close().catch(function () {});
  };

  Engine.prototype.resize = function (w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  global.YC3D_MUSEUM = { Engine: Engine, ROOM_GAP: ROOM_GAP };
})(window);

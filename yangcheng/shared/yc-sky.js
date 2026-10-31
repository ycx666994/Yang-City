/* ============================================================
   yc-sky.js — 杨城夜景背景（Canvas 2D，零依赖）
   四层：极光雾 → 透视地网 → 浮尘 → 证据脉冲
   对外：window.YCSky = { start(), stop(), burst(x,y,color) }
   设计约束：不阻塞首屏、隐藏时暂停、减少动效时只画一帧静态。
   ============================================================ */
(function () {
  "use strict";

  var cv, ctx, W = 0, H = 0, dpr = 1, raf = 0, running = false, t0 = 0;
  var dust = [], pulses = [], mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var reduced = false;

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedDust();
  }

  function seedDust() {
    var n = Math.round(Math.min(190, (W * H) / 9000));
    dust = [];
    for (var i = 0; i < n; i++) {
      var z = Math.random();
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: z,                                  // 0 远 1 近
        r: 0.4 + z * 1.5,
        vx: (Math.random() - 0.5) * 0.16 * (0.3 + z),
        vy: -(0.05 + Math.random() * 0.22) * (0.3 + z),
        a: 0.12 + z * 0.42,
        ph: Math.random() * 6.283,
        hue: Math.random()
      });
    }
  }

  /* ---------- 层 1：极光雾 ---------- */
  function aurora(t) {
    var g1 = ctx.createRadialGradient(
      W * 0.5 + Math.sin(t * 0.07) * W * 0.07, H * 0.40, 0,
      W * 0.5, H * 0.40, Math.max(W, H) * 0.52
    );
    g1.addColorStop(0, "rgba(70,211,232,0.075)");
    g1.addColorStop(0.45, "rgba(46,120,180,0.030)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

    var g2 = ctx.createRadialGradient(
      W * 0.84, H * 0.78 + Math.sin(t * 0.11 + 1.6) * 26, 0,
      W * 0.84, H * 0.78, Math.max(W, H) * 0.38
    );
    g2.addColorStop(0, "rgba(242,166,60,0.062)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

    var g3 = ctx.createRadialGradient(
      W * 0.12, H * 0.66, 0, W * 0.12, H * 0.66, Math.max(W, H) * 0.32
    );
    g3.addColorStop(0, "rgba(168,135,255,0.052)");
    g3.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- 层 2：透视地网 ---------- */
  function grid(t) {
    var hz = H * 0.62;                      // 地平线
    ctx.save();
    ctx.strokeStyle = "rgba(96,140,180,0.13)";
    ctx.lineWidth = 1;

    // 横线：越近越疏（透视），整体缓慢下移形成"前进感"
    var rows = 16, scroll = (t * 0.035) % 1;
    for (var i = 0; i < rows; i++) {
      var p = (i + scroll) / rows;              // 0 近 → 1 远
      var y = hz + (H - hz) * Math.pow(p, 2.05);
      if (y > H + 2) continue;
      var a = 0.16 * (1 - p * 0.82);
      ctx.strokeStyle = "rgba(96,140,180," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 纵线：向灭点收敛
    var cx = W * 0.5 + (mouse.x - 0.5) * 60;
    ctx.strokeStyle = "rgba(96,140,180,0.075)";
    for (var k = -14; k <= 14; k++) {
      var xb = cx + k * (W / 9);
      ctx.beginPath(); ctx.moveTo(cx, hz); ctx.lineTo(xb, H); ctx.stroke();
    }

    // 地平线本身
    var lg = ctx.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, "rgba(70,211,232,0)");
    lg.addColorStop(0.5, "rgba(70,211,232,0.22)");
    lg.addColorStop(1, "rgba(70,211,232,0)");
    ctx.strokeStyle = lg; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
    ctx.restore();
  }

  /* ---------- 层 3：浮尘 ---------- */
  function drawDust(t) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx; d.y += d.vy;
      if (d.y < -8) { d.y = H + 8; d.x = Math.random() * W; }
      if (d.x < -8) d.x = W + 8; else if (d.x > W + 8) d.x = -8;

      var px = d.x + (mouse.x - 0.5) * 26 * d.z;
      var py = d.y + (mouse.y - 0.5) * 18 * d.z;
      var tw = 0.55 + 0.45 * Math.sin(t * 1.1 + d.ph);
      var a = d.a * tw;
      var col = d.hue > 0.86 ? "242,166,60" : (d.hue > 0.72 ? "168,135,255" : "150,200,230");
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
      ctx.arc(px, py, d.r, 0, 6.2832);
      ctx.fill();
      // 近处尘埃带一点光晕
      if (d.z > 0.72) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + col + "," + (a * 0.12).toFixed(3) + ")";
        ctx.arc(px, py, d.r * 4.2, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  /* ---------- 层 4：证据脉冲 ---------- */
  function drawPulses(dt) {
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.r += p.v * dt;
      p.life -= dt * 0.55;
      if (p.life <= 0) { pulses.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.strokeStyle = "rgba(" + p.col + "," + (p.life * 0.5).toFixed(3) + ")";
      ctx.lineWidth = 1.1;
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.stroke();
    }
    // 中心常驻的呼吸环
    var cr = Math.min(W, H) * 0.30 + Math.sin(performance.now() * 0.0006) * 5;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(217,179,100,0.10)";
    ctx.lineWidth = 1;
    ctx.arc(W * 0.5, H * 0.47, cr, 0, 6.2832);
    ctx.stroke();
  }

  var last = 0;
  function loop(now) {
    if (!running) return;
    var t = (now - t0) / 1000;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    mouse.x += (mouse.tx - mouse.x) * 0.045;
    mouse.y += (mouse.ty - mouse.y) * 0.045;

    ctx.clearRect(0, 0, W, H);
    aurora(t);
    grid(t);
    drawDust(t);
    drawPulses(dt);
    raf = requestAnimationFrame(loop);
  }

  function frameOnce() {
    ctx.clearRect(0, 0, W, H);
    aurora(14); grid(14); drawDust(14); drawPulses(0.016);
  }

  var api = {
    start: function () {
      if (running) return;
      if (!cv) {
        cv = document.createElement("canvas");
        cv.id = "ycSky";
        document.body.insertBefore(cv, document.body.firstChild);
        ctx = cv.getContext("2d");
        if (!ctx) { cv.remove(); cv = null; return; }
        resize();
        window.addEventListener("resize", resize, { passive: true });
        window.addEventListener("mousemove", function (e) {
          mouse.tx = e.clientX / window.innerWidth;
          mouse.ty = e.clientY / window.innerHeight;
        }, { passive: true });
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) api.stop(); else api.start();
        });
      }
      reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) { frameOnce(); return; }
      running = true;
      t0 = performance.now(); last = t0;
      raf = requestAnimationFrame(loop);
    },
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    burst: function (x, y, color) {
      pulses.push({ x: x, y: y, r: 4, v: 170, life: 1, col: color || "70,211,232" });
    }
  };

  window.YCSky = api;
})();

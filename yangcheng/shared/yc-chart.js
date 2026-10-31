/* ============================================================
   yc-chart.js — 极简双轴折线图（Canvas 2D，零依赖）
   只为指标馆的「代理 vs 独立目标」这一张图存在，不追求通用。
   支持：双 y 轴、悬停读数、峰值标记、下降区间底色、结构变点竖线。
   ============================================================ */
(function () {
  "use strict";

  var PAD = { l: 46, r: 46, t: 16, b: 26 };

  function niceRange(vals, padRatio) {
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (!isFinite(mn) || !isFinite(mx)) return [0, 1];
    if (mx === mn) { mx = mn + 1; }
    var pad = (mx - mn) * (padRatio == null ? 0.18 : padRatio);
    return [mn - pad, mx + pad];
  }

  function draw(cv, o) {
    if (!cv) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    var n = o.labels.length;
    var L = o.series.filter(function (s) { return s.axis !== "right"; });
    var R = o.series.filter(function (s) { return s.axis === "right"; });

    var leftVals = [], rightVals = [];
    L.forEach(function (s) { leftVals = leftVals.concat(s.values); });
    R.forEach(function (s) { rightVals = rightVals.concat(s.values); });
    var lr = niceRange(leftVals, 0.16), rr = niceRange(rightVals, 0.16);

    var x0 = PAD.l, x1 = W - PAD.r, y0 = PAD.t, y1 = H - PAD.b;
    var X = function (i) { return n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); };
    var YL = function (v) { return y1 - (y1 - y0) * (v - lr[0]) / (lr[1] - lr[0]); };
    var YR = function (v) { return y1 - (y1 - y0) * (v - rr[0]) / (rr[1] - rr[0]); };

    /* ---- 下降区间底色 ---- */
    if (o.span && o.span.from != null && o.span.to != null) {
      var sx = X(o.span.from), ex = X(o.span.to);
      var grd = g.createLinearGradient(sx, 0, ex, 0);
      grd.addColorStop(0, "rgba(240,85,77,.16)");
      grd.addColorStop(1, "rgba(240,85,77,.03)");
      g.fillStyle = grd;
      g.fillRect(sx, y0, Math.max(2, ex - sx), y1 - y0);
      g.strokeStyle = "rgba(240,85,77,.34)"; g.lineWidth = 1;
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx, y1); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(240,85,77,.75)";
      g.font = "9px Consolas, monospace";
      g.fillText("持续下降", sx + 4, y0 + 11);
    }

    /* ---- 网格 + 左右刻度 ---- */
    g.strokeStyle = "rgba(120,152,186,.10)"; g.lineWidth = 1;
    g.font = "9px Consolas, monospace";
    for (var k = 0; k <= 4; k++) {
      var y = y0 + (y1 - y0) * k / 4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = "rgba(120,152,186,.55)";
      g.textAlign = "right";
      if (leftVals.length) g.fillText(fmt(lr[1] - (lr[1] - lr[0]) * k / 4), x0 - 7, y + 3);
      g.textAlign = "left";
      if (rightVals.length) g.fillText((rr[1] - (rr[1] - rr[0]) * k / 4).toFixed(2), x1 + 7, y + 3);
    }

    /* ---- x 轴标签 ---- */
    g.textAlign = "center"; g.fillStyle = "rgba(120,152,186,.55)";
    o.labels.forEach(function (lab, i) {
      if (n > 8 && i % 2 === 1) return;
      g.fillText(lab, X(i), y1 + 15);
    });
    g.fillStyle = "rgba(120,152,186,.38)";
    g.textAlign = "center";
    g.fillText(o.xLabel || "", (x0 + x1) / 2, H - 3);

    /* ---- 结构变点竖线 ---- */
    (o.changePoints || []).forEach(function (i) {
      g.strokeStyle = "rgba(168,135,255,.42)"; g.lineWidth = 1;
      g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(X(i), y0); g.lineTo(X(i), y1); g.stroke();
      g.setLineDash([]);
    });

    /* ---- 峰值标记 ---- */
    if (o.peak != null) {
      g.strokeStyle = "rgba(63,208,138,.55)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(o.peak), y0); g.lineTo(X(o.peak), y1); g.stroke();
      g.fillStyle = "rgba(63,208,138,.9)";
      g.font = "9px Consolas, monospace"; g.textAlign = "left";
      g.fillText("峰值", X(o.peak) + 4, y0 + 11);
    }

    /* ---- 序列 ---- */
    o.series.forEach(function (s) {
      var Y = s.axis === "right" ? YR : YL;
      var pts = s.values.map(function (v, i) { return [X(i), Y(v)]; });

      /* 面积 */
      if (s.fill) {
        var fg = g.createLinearGradient(0, y0, 0, y1);
        fg.addColorStop(0, hexA(s.color, 0.22));
        fg.addColorStop(1, hexA(s.color, 0));
        g.beginPath();
        g.moveTo(pts[0][0], y1);
        pts.forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.lineTo(pts[pts.length - 1][0], y1);
        g.closePath();
        g.fillStyle = fg; g.fill();
      }

      /* 线 + 辉光 */
      g.beginPath();
      pts.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
      g.strokeStyle = s.color; g.lineWidth = 2;
      g.shadowColor = s.color; g.shadowBlur = 8;
      g.stroke();
      g.shadowBlur = 0;

      /* 点 */
      pts.forEach(function (p) {
        g.beginPath();
        g.fillStyle = "#0a0f17"; g.arc(p[0], p[1], 3.2, 0, 6.2832); g.fill();
        g.beginPath();
        g.fillStyle = s.color; g.arc(p[0], p[1], 2.1, 0, 6.2832); g.fill();
      });
    });

    return {
      X: X, YL: YL, YR: YR, n: n, W: W, H: H,
      lr: lr, rr: rr, pad: PAD
    };
  }

  function fmt(v) { return Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1); }
  function hexA(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + gg + "," + b + "," + a + ")";
  }

  /* 悬停：返回一个 detach() */
  function hover(cv, geo, o) {
    if (!cv || !geo) return function () {};
    var tip = cv.parentNode.querySelector(".tip");
    function move(e) {
      var r = cv.getBoundingClientRect();
      var mx = e.clientX - r.left;
      var best = 0, bd = 1e9;
      for (var i = 0; i < geo.n; i++) {
        var d = Math.abs(geo.X(i) - mx);
        if (d < bd) { bd = d; best = i; }
      }
      if (bd > 40 || !tip) { if (tip) tip.style.display = "none"; return; }
      var rows = o.series.map(function (s) {
        return "<span style='color:" + s.color + "'>■</span> " + s.label + " <b>" +
          (s.fmt ? s.fmt(s.values[best]) : s.values[best]) + "</b>";
      });
      tip.innerHTML = "优化预算 <b>" + o.labels[best] + "</b> 回合<br>" + rows.join("<br>") +
        (o.extra ? "<br>" + o.extra(best) : "");
      tip.style.display = "block";
      var tx = geo.X(best) + 12;
      if (tx + tip.offsetWidth > geo.W - 6) tx = geo.X(best) - tip.offsetWidth - 12;
      tip.style.left = Math.max(4, tx) + "px";
      tip.style.top = Math.max(4, e.clientY - r.top - 46) + "px";
    }
    function leave() { if (tip) tip.style.display = "none"; }
    cv.addEventListener("mousemove", move);
    cv.addEventListener("mouseleave", leave);
    return function () {
      cv.removeEventListener("mousemove", move);
      cv.removeEventListener("mouseleave", leave);
    };
  }

  window.YCChart = { draw: draw, hover: hover };
})();

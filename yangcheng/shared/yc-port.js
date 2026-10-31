/* ============================================================
   shared/yc-port.js — 驻馆人立绘引擎 · Portrait 2.0
   ------------------------------------------------------------
   为什么推翻重写
   ------------------------------------------------------------
   1.0 的画法是「一根根线」：五官全是半透明 stroke，没有面。
   放大看是线框图，缩到 52px 就糊成一团灰。十个人只能靠
   「圆脸 / 方脸」两个变量区分，谁都不像谁，也确实不好看。

   2.0 换成赛璐璐上色（cel-shading），五件事：

     一、统一光源。左上 45°，高光永远在左上，暗部永远在右下。
         一旦每个人的光向不一样，十张脸放在一起就会「贴纸感」。
     二、以色块为主、线为辅。色块缩小仍然可读，线缩小就消失。
     三、五官分层。眼睛七层、头发四层、皮肤三层，不是一笔画完。
     四、唯一 id 前缀。SVG 的渐变 / 滤镜 id 是全局的，十个立绘
         同页时必须隔离，否则所有人都会用第一个人的渐变 ——
         这是这类系统最容易踩、也最难查的坑。
     五、成人骨相。脸宽 96 / 脸长 152（1 : 1.58），眼距 = 一个眼宽，
         鼻底到嘴 20、嘴到下巴 26。娃娃脸是脸宽 ≈ 脸长、眼睛占半张脸，
         一眼就像玩具。这一版所有比例按成人头骨重算。

   坐标系 200×240（胸像）
   ------------------------------------------------------------
     发顶 16 / 发际 76 / 眉 96 / 眼 110 / 鼻尖 136
     嘴 156 / 下巴 182 / 颈 176-206 / 肩 206-240

   两种输出
   ------------------------------------------------------------
     bust   —— 完整胸像，全部图层，用在档案卡左栏（约 220×264）
     avatar —— 只取头部，跳过柔光滤镜与发丝高光，用在 26—84px 的小头像
               小尺寸下滤镜只会变成脏灰，去掉反而更清楚
   ============================================================ */
(function () {
  "use strict";

  var N = 0;
  function uid() { return "yp" + (++N).toString(36); }
  function n(v) { return Math.round(v * 100) / 100; }

  /* 两个十六进制色按比例混。用来把配置里给的「发丝高光色」
     往发色里压回去一点 —— 原样拿去铺渐变的亮端，
     在 300px 的胸像上会横出一道浅色斜带，看着像秃了一块。 */
  function mix(a, b, t) {
    function p(h) { h = h.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    var A = p(a), B = p(b);
    var o = A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); });
    return "#" + o.map(function (v) { var s = v.toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  }

  /* ---------------- 肤色 ----------------
     偏暖、比真实再提亮一档。深色面板上不提亮会像蜡像。 */
  var SKIN = {
    a: { base: "#e3a97f", lit: "#fbd4b2", sh: "#b87a5a", deep: "#8a4c36", line: "#63352a", blush: "#cd6652", lip: "#b25c49", lipd: "#873d30" },
    b: { base: "#d69a72", lit: "#f0c49c", sh: "#ac7049", deep: "#81472f", line: "#5a3226", blush: "#bd5c49", lip: "#a85544", lipd: "#7c382b" },
    c: { base: "#ecc09a", lit: "#ffdfc4", sh: "#c58f6a", deep: "#975c42", line: "#6d3f2e", blush: "#d47b61", lip: "#bd6750", lipd: "#904638" },
    d: { base: "#ca9470", lit: "#ecc09d", sh: "#a16b48", deep: "#77432d", line: "#532d21", blush: "#b9604d", lip: "#a3523e", lipd: "#763627" },
    e: { base: "#dfa57c", lit: "#f6ceaa", sh: "#b57756", deep: "#874a34", line: "#613426", blush: "#c96450", lip: "#af5945", lipd: "#833b2d" }
  };

  /* ---------------- 骨相 ----------------
     五种脸型，差异集中在下半张脸：下颌角、颧宽、下巴长度。
     这是「认得出是谁」的第一层，比换发型更有效。
     脸宽统一 96，脸长 152（成人比例 1 : 1.58）。 */
  var FACES = {
    /* 鹅蛋：颧骨最宽，下颌收得干净 */
    oval:   "M100 30C124 30 148 52 148 88C148 108 146 128 141 146C135 166 120 182 100 182C80 182 65 166 59 146C54 128 52 108 52 88C52 52 76 30 100 30Z",
    /* 方脸：下颌角外扩，下巴平 */
    square: "M100 30C126 30 150 52 150 88C150 110 149 132 146 150C142 170 124 182 100 182C76 182 58 170 54 150C51 132 50 110 50 88C50 52 74 30 100 30Z",
    /* 长脸：整体上移下延，中庭长 */
    long:   "M100 24C122 24 144 48 144 86C144 112 141 138 135 158C129 180 116 194 100 194C84 194 71 180 65 158C59 138 56 112 56 86C56 48 78 24 100 24Z",
    /* 圆脸：颊部外扩，下巴圆 */
    round:  "M100 32C130 32 152 58 152 94C152 118 145 140 132 158C121 174 111 182 100 182C89 182 79 174 68 158C55 140 48 118 48 94C48 58 70 32 100 32Z",
    /* 瘦削：颧骨突出，颊部内收，下巴尖 */
    sharp:  "M100 28C120 28 140 52 140 88C140 112 136 136 129 156C122 176 112 188 100 188C88 188 78 176 71 156C64 136 60 112 60 88C60 52 80 28 100 28Z"
  };

  /* ---------------- 眼型轮廓 ----------------
     外眼角比内眼角高 —— 这是「眼睛有神」的唯一来源。
     两点等高就变成死鱼眼。 */
  function eyePath(cx, out, w, cy, h) {
    function p(sx, sy) { return n(cx + out * w * sx) + " " + n(cy + h * sy); }
    return "M" + p(1, -0.28) +
      "C" + p(0.72, -1.14) + " " + p(0.26, -1.3) + " " + p(0, -1.14) +
      "C" + p(-0.26, -1.3) + " " + p(-0.74, -0.92) + " " + p(-1, 0.3) +
      "C" + p(-0.74, 1.0) + " " + p(-0.26, 1.22) + " " + p(0, 1.16) +
      "C" + p(0.26, 1.22) + " " + p(0.74, 0.9) + " " + p(1, -0.28) + "Z";
  }

  /* ============================================================
     单个部件
     ============================================================ */

  /* --- 眉 ---
     不画成等宽的黑条。真眉毛是「外端细、内端粗、上缘拱、下缘平」的
     一块面。用 stroke 画永远是马克笔，用填充面才像眉毛。
     mood 改三件事：整体抬降、内端升降、眉峰高低。
     down 时内端往下压才叫「皱眉」；只把整条眉往下挪是「失望」。 */
  function brow(m, k, hc, cx, cy, w, thick, o) {
    o = o || {};
    var out = o.out, arch = o.arch == null ? 4.2 : o.arch;
    var lift = m === "up" ? -2.2 : (m === "down" ? 1.0 : 0);
    var innerDy = m === "down" ? 4.0 : (m === "up" ? -1.2 : 0);
    var outerDy = m === "up" ? -2.4 : (m === "down" ? -0.4 : 0);
    var W = w / 2;
    var x0 = cx + out * W;            /* 外端：细 */
    var x1 = cx - out * W;            /* 内端：粗 */
    var y0 = cy + outerDy + lift;
    var y1 = cy + innerDy + lift;
    var t0 = thick * 0.4, t1 = thick;
    var mx = (x0 + x1) / 2, my = cy - arch + lift;
    /* 上缘一道、内端一刀平切、下缘一道。内端不能再加圆头，
       否则眉头上会鼓起一个球，看起来像画了个逗号。 */
    var d = "M" + n(x0) + " " + n(y0 - t0) +
      "Q" + n(mx) + " " + n(my - t1 * 0.5) + " " + n(x1) + " " + n(y1 - t1 * 0.5) +
      "L" + n(x1) + " " + n(y1 + t1 * 0.5) +
      "Q" + n(mx) + " " + n(my + t1 * 0.56) + " " + n(x0) + " " + n(y0 + t0) + "Z";
    return '<path d="' + d + '" fill="' + hc + '" opacity=".66"/>';
  }

  /* --- 眼 ---
     七层：眼窝阴影 / 眼白 / 虹膜 / 瞳孔 / 双高光 / 上睑睫毛 / 下睑。
     少任何一层都会「平」；多任何一层在 52px 下都是噪点。 */
  function eye(u, m, k, ir, cx, cy, w, h, o) {
    o = o || {};
    var out = o.out, detail = o.detail || 2;
    var p = eyePath(cx, out, w, cy, h);
    var s = "";

    if (detail >= 2) {
      s += '<ellipse cx="' + n(cx) + '" cy="' + n(cy - h * 0.6) + '" rx="' + n(w * 1.16) +
        '" ry="' + n(h * 1.2) + '" fill="' + k.deep + '" opacity=".14" filter="url(#' + u + 'sf2)"/>';
    }
    s += '<path d="' + p + '" fill="#f2eae0"/>';
    s += '<g clip-path="url(#' + u + (out < 0 ? "el" : "er") + ')">' +
      /* 虹膜半径要够大。偏小的时候上下都留一圈白，
         眼睛就变成「瞪」——那是玩偶的做法，不是人的做法。
         真眼睛的虹膜上缘被上睑压住、下缘贴着下睑，几乎不留白。 */
      '<circle cx="' + n(cx) + '" cy="' + n(cy + h * 0.04) + '" r="' + n(w * 0.64) + '" fill="' + (o.irisFill || ("url(#" + u + "ir)")) + '"/>' +
      '<circle cx="' + n(cx) + '" cy="' + n(cy + h * 0.04) + '" r="' + n(w * 0.64) +
        '" fill="none" stroke="' + ir.deep + '" stroke-width="1.1" stroke-opacity=".75"/>' +
      '<circle cx="' + n(cx) + '" cy="' + n(cy + h * 0.04) + '" r="' + n(w * 0.29) + '" fill="#100906"/>' +
      '<circle cx="' + n(cx - w * 0.22) + '" cy="' + n(cy - h * 0.42) + '" r="' + n(w * 0.17) + '" fill="#fff" opacity=".95"/>' +
      '<circle cx="' + n(cx + w * 0.28) + '" cy="' + n(cy + h * 0.42) + '" r="' + n(w * 0.08) + '" fill="#fff" opacity=".5"/>' +
      /* 上睑投影：虹膜顶部压一层暗，眼睛才有厚度 */
      '<path d="' + p + '" fill="none" stroke="' + k.deep + '" stroke-width="' + n(h * 0.78) + '" stroke-opacity=".26"/>' +
      "</g>";

    /* 上睑线：整张脸最重的一笔。它比任何细节都更决定「有没有神」 */
    var lidY = cy - h * 1.0 + (m === "down" ? h * 0.2 : 0) - (m === "up" ? h * 0.06 : 0);
    s += '<path d="M' + n(cx + out * w * 0.98) + " " + n(cy - h * 0.26) +
      "C" + n(cx + out * w * 0.7) + " " + n(lidY - h * 0.12) + " " +
            n(cx + out * w * 0.24) + " " + n(lidY - h * 0.26) + " " +
            n(cx) + " " + n(lidY - h * 0.08) +
      "C" + n(cx - out * w * 0.24) + " " + n(lidY - h * 0.26) + " " +
            n(cx - out * w * 0.68) + " " + n(cy - h * 0.8) + " " +
            n(cx - out * w) + " " + n(cy + h * 0.32) +
      '" fill="none" stroke="#241409" stroke-width="' + (o.lash === false ? 2 : 3.1) +
      '" stroke-linecap="round" stroke-opacity=".9"/>';

    if (o.lash !== false) {
      s += '<path d="M' + n(cx + out * w * 0.94) + " " + n(cy - h * 0.4) +
        "L" + n(cx + out * w * 1.22) + " " + n(cy - h * 0.92) +
        '" stroke="#241409" stroke-width="2" stroke-linecap="round" opacity=".78"/>';
      s += '<path d="M' + n(cx + out * w * 0.68) + " " + n(cy - h * 0.98) +
        "L" + n(cx + out * w * 0.9) + " " + n(cy - h * 1.46) +
        '" stroke="#241409" stroke-width="1.6" stroke-linecap="round" opacity=".58"/>';
    }
    s += '<path d="M' + n(cx + out * w * 0.88) + " " + n(cy + h * 0.68) +
      "C" + n(cx + out * w * 0.38) + " " + n(cy + h * 1.2) + " " +
            n(cx - out * w * 0.3) + " " + n(cy + h * 1.18) + " " +
            n(cx - out * w * 0.84) + " " + n(cy + h * 0.6) +
      '" fill="none" stroke="' + k.line + '" stroke-width="1.4" stroke-linecap="round" stroke-opacity=".22"/>';

    if (detail >= 2 && o.crease !== false) {
      s += '<path d="M' + n(cx + out * w * 0.76) + " " + n(cy - h * 1.92) +
        "C" + n(cx + out * w * 0.28) + " " + n(cy - h * 2.5) + " " +
              n(cx - out * w * 0.28) + " " + n(cy - h * 2.4) + " " +
              n(cx - out * w * 0.74) + " " + n(cy - h * 1.5) +
        '" fill="none" stroke="' + k.line + '" stroke-width="1.4" stroke-linecap="round" stroke-opacity=".2"/>';
    }
    return s;
  }

  /* --- 鼻 ---
     不画轮廓线。鼻子靠四块明暗立起来：
     鼻梁高光（左）、鼻侧暗面（右）、鼻头高光、鼻底投影。
     少了鼻头那一点高光，鼻子就会「塌」进脸里。 */
  function nose(u, k, cx, cy, detail) {
    var s = "";
    if (detail >= 2) {
      /* 鼻梁高光要压到「看得见但说不出」的程度。画成一条白线就假了 */
      s += '<path d="M' + n(cx - 3) + " " + n(cy - 22) + "L" + n(cx - 4.6) + " " + n(cy - 8) +
        '" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".14"/>';
      s += '<ellipse cx="' + n(cx + 7) + '" cy="' + n(cy - 13) + '" rx="5.6" ry="13" fill="' +
        k.deep + '" opacity=".22" filter="url(#' + u + 'sf2)"/>';
      /* 鼻头高光：一小团，位置比鼻梁高光略低略右 */
      s += '<ellipse cx="' + n(cx - 1.4) + '" cy="' + n(cy - 1.6) + '" rx="3.4" ry="2.6" fill="#fff" opacity=".2" filter="url(#' + u + 'sf2)"/>';
      /* 鼻底投影：鼻子「浮起来」靠这一道 */
      s += '<ellipse cx="' + n(cx) + '" cy="' + n(cy + 3.6) + '" rx="9.6" ry="3.6" fill="' +
        k.deep + '" opacity=".3" filter="url(#' + u + 'sf2)"/>';
    }
    /* 鼻翼：两个小小的暗点，不是两道弧。
       画成弧线会变成两撇「八字胡」，这是最容易翻车的一笔。 */
    s += '<ellipse cx="' + n(cx - 7.4) + '" cy="' + n(cy + 1.4) + '" rx="2.6" ry="1.7" fill="' +
      k.deep + '" opacity=".3"/>';
    s += '<ellipse cx="' + n(cx + 7.4) + '" cy="' + n(cy + 1.4) + '" rx="2.6" ry="1.7" fill="' +
      k.deep + '" opacity=".3"/>';
    return s;
  }

  /* --- 嘴 ---
     上唇暗、下唇亮、中间一条缝。笑是「嘴角抬、缝中段下沉」，
     不是把整条线弯成上拱 —— 上拱是「猫嘴」，不是人笑。 */
  function mouth(u, m, k, cx, cy, w, detail, style) {
    var hw = w / 2;
    var cdy = m === "up" ? -2.8 : (m === "down" ? 2.4 : 0);
    var mdy = m === "up" ? 1.8 : (m === "down" ? -1.4 : 0.9);
    var soft = style === "soft";          /* 男性：唇薄、颜色低 */
    var th = soft ? 0.82 : 1;
    var L = n(cx - hw), R = n(cx + hw);
    var y0 = n(cy + cdy), y1 = n(cy + mdy);

    var upper = "M" + L + " " + y0 +
      "C" + n(cx - hw * 0.62) + " " + n(cy + cdy - 4.2 * th) + " " +
            n(cx - hw * 0.3) + " " + n(cy + cdy - 4.6 * th) + " " +
            n(cx - hw * 0.12) + " " + n(cy + cdy - 2.4 * th) +
      "C" + n(cx - hw * 0.05) + " " + n(cy + cdy - 1.4) + " " +
            n(cx + hw * 0.05) + " " + n(cy + cdy - 1.4) + " " +
            n(cx + hw * 0.12) + " " + n(cy + cdy - 2.4 * th) +
      "C" + n(cx + hw * 0.3) + " " + n(cy + cdy - 4.6 * th) + " " +
            n(cx + hw * 0.62) + " " + n(cy + cdy - 4.2 * th) + " " +
            R + " " + y0 +
      "Q" + n(cx) + " " + y1 + " " + L + " " + y0 + "Z";

    var lower = "M" + L + " " + y0 +
      "Q" + n(cx) + " " + y1 + " " + R + " " + y0 +
      "C" + n(cx + hw * 0.64) + " " + n(cy + cdy + 5.2 * th) + " " +
            n(cx + hw * 0.3) + " " + n(cy + cdy + 6.8 * th) + " " +
            n(cx) + " " + n(cy + cdy + 6.6 * th) +
      "C" + n(cx - hw * 0.3) + " " + n(cy + cdy + 6.8 * th) + " " +
            n(cx - hw * 0.64) + " " + n(cy + cdy + 5.2 * th) + " " +
            L + " " + y0 + "Z";

    var s = '<path d="' + upper + '" fill="' + k.lipd + '" opacity="' + (soft ? ".62" : ".88") + '"/>';
    s += '<path d="' + lower + '" fill="' + k.lip + '" opacity="' + (soft ? ".68" : ".95") + '"/>';
    if (detail >= 2) {
      s += '<ellipse cx="' + n(cx - hw * 0.18) + '" cy="' + n(cy + cdy + 3.4 * th) + '" rx="' + n(hw * 0.32) +
        '" ry="1.7" fill="#fff" opacity="' + (soft ? ".16" : ".24") + '"/>';
    }
    s += '<path d="M' + L + " " + y0 + "Q" + n(cx) + " " + y1 + " " + R + " " + y0 +
      '" fill="none" stroke="' + k.lipd + '" stroke-width="1.5" stroke-linecap="round" stroke-opacity=".85"/>';
    if (m === "up") {
      s += '<path d="M' + L + " " + y0 + "Q" + n(cx) + " " + y1 + " " + R + " " + y0 +
        "Q" + n(cx) + " " + n(cy + cdy + 2.4) + " " + L + " " + y0 +
        '" fill="#3d1c17" opacity=".5"/>';
    }
    return s;
  }

  /* --- 颈 ---
     下巴 182、肩 206，颈长 24。颈太短会「头直接架在肩上」，
     太宽会跟下颌连成一块，看不出下巴在哪。宽 26 是上限。 */
  function neck(u, k, detail, F) {
    var s = '<path d="M87 166H113V210C113 215 107 218 100 218C93 218 87 215 87 210Z" fill="' + F + '"/>';
    if (detail >= 2) {
      s += '<ellipse cx="100" cy="184" rx="26" ry="15" fill="' + k.deep + '" opacity=".4" filter="url(#' + u + 'sf)"/>';
      s += '<path d="M88 198C90 205 93 210 95 214" stroke="' + k.deep + '" stroke-width="2" fill="none" opacity=".13"/>';
      s += '<path d="M112 198C110 205 107 210 105 214" stroke="' + k.deep + '" stroke-width="2" fill="none" opacity=".13"/>';
    }
    return s;
  }

  /* --- 衣 ---
     三种领型，够撑起十个人的身份差：
       shirt 衬衫 + 领带（证物官、指标员）
       coat  大衣翻领（探员、守藤人）
       stand 立领工装 + 拉链（净化、育种、配额） */
  function body(u, cfg, k, detail, F) {
    var c = cfg.cloth || {};
    var hi = c.hi || "#2b3849", dp = c.deep || "#101724";
    var ac = c.accent || cfg.accent || "#46d3e8";
    var type = c.type || "shirt";
    var s = "";

    /* 衣身：肩宽 200，是头宽的 2 倍。窄了就像小孩穿大人衣服 */
    s += '<path d="M100 196C74 196 44 204 22 217C11 224 5 232 2 240H198C195 232 189 224 178 217C156 204 126 196 100 196Z" fill="' + F + '"/>';

    if (type === "shirt") {
      /* 衬衫：V 领 + 两片翻领 + 领带。
         领子不能用纯白 —— 纯白在深色背景上会变成一块抢戏的亮斑，
         人物反而看不见了。压到 #d9d3c9、九成不透明就够。 */
      s += '<path d="M87 194L100 222L113 194L128 201L100 240H72L72 201Z" fill="#d9d3c9" opacity=".9"/>';
      s += '<path d="M87 194L100 222L113 194L104 191L100 197L96 191Z" fill="' + k.deep + '" opacity=".34"/>';
      s += '<path d="M100 198L93.5 207L100 213.5L106.5 207Z" fill="' + ac + '" opacity=".95"/>';
      s += '<path d="M100 213.5L94 231L100 240L106 231Z" fill="' + ac + '" opacity=".78"/>';
      if (detail >= 2) {
        s += '<path d="M87 194L76 207L73 240" stroke="' + dp + '" stroke-width="1.5" fill="none" opacity=".55"/>';
        s += '<path d="M113 194L124 207L127 240" stroke="' + dp + '" stroke-width="1.5" fill="none" opacity=".55"/>';
        s += '<path d="M100 222V240" stroke="' + k.deep + '" stroke-width="1.2" opacity=".18"/>';
      }
    } else if (type === "coat") {
      /* 大衣：大翻领，左右各一片，压出厚度 */
      s += '<path d="M100 196L72 189L48 215L76 240H100Z" fill="' + hi + '"/>';
      s += '<path d="M100 196L128 189L152 215L124 240H100Z" fill="' + hi + '"/>';
      s += '<path d="M100 196L72 189L56 216L100 240Z" fill="' + dp + '" opacity=".5"/>';
      s += '<path d="M100 196L128 189L144 216L100 240Z" fill="' + dp + '" opacity=".36"/>';
      if (detail >= 2) {
        s += '<path d="M72 189L76 240" stroke="' + dp + '" stroke-width="1.7" opacity=".6"/>';
        s += '<path d="M128 189L124 240" stroke="' + dp + '" stroke-width="1.7" opacity=".6"/>';
        s += '<circle cx="100" cy="228" r="2.4" fill="' + ac + '" opacity=".7"/>';
      }
    } else {
      /* 立领工装 */
      s += '<path d="M81 196C81 187 90 182 100 182C110 182 119 187 119 196L119 205C111 200 89 200 81 205Z" fill="' + hi + '"/>';
      s += '<path d="M100 185V240" stroke="' + dp + '" stroke-width="2" opacity=".72"/>';
      if (detail >= 2) {
        s += '<path d="M96.4 185V240" stroke="' + ac + '" stroke-width="1" opacity=".5"/>';
        s += '<circle cx="100" cy="214" r="2.2" fill="' + ac + '" opacity=".55"/>';
        s += '<path d="M79 207C74 219 71 231 70 240" stroke="' + dp + '" stroke-width="1.5" fill="none" opacity=".42"/>';
        s += '<path d="M121 207C126 219 129 231 130 240" stroke="' + dp + '" stroke-width="1.5" fill="none" opacity=".42"/>';
      }
    }
    return s;
  }

  /* --- 发 ---
     四层：后发（衬在脸后）、鬓角（盖住耳前）、主发块、发丝高光。
     「头盔感」来自发际线是一条光滑圆弧 —— 真实发际线有鬓角、
     有 M 形后退、有碎发。所以这里把头发拆成可以各自给形的三层。 */
  function hairShape(u, d, hd, detail, noStroke, F) {
    if (!d) return "";
    var s = '<path d="' + d + '" fill="' + (F || ("url(#" + u + "hk)")) + '"/>';
    if (!noStroke) s += '<path d="' + d + '" fill="none" stroke="' + hd + '" stroke-width="1.4" stroke-opacity=".5" stroke-linejoin="round"/>';
    return s;
  }
  function hairHi(paths, hl, detail) {
    if (detail < 2 || !paths || !paths.length) return "";
    return '<g>' + paths.map(function (d) {
      return '<path d="' + d + '" fill="none" stroke="' + hl + '" stroke-width="2.6" stroke-linecap="round" stroke-opacity=".5"/>';
    }).join("") + "</g>";
  }

  /* --- 发缕 ---
     头发之所以「像头发」，靠的是发梢长短不一。
     但发缕如果从发块外缘起笔，就会变成贴在额头上的黑色贴片 ——
     所以起笔点必须落在发块内部（被发块盖住），只有收尖的末梢露出来。
     这样叠出来的发际线才是「发梢」，不是「锯齿」。 */
  function lock(x0, y0, x1, y1, w) {
    var dy = y1 - y0;
    return "M" + n(x0) + " " + n(y0) +
      "C" + n(x0 + (x1 - x0) * 0.1) + " " + n(y0 + dy * 0.56) + " " +
            n(x1 - w * 0.16) + " " + n(y1 - dy * 0.14) + " " + n(x1) + " " + n(y1) +
      "C" + n(x1 + w * 0.34) + " " + n(y1 - dy * 0.26) + " " +
            n(x0 + w + (x1 - x0) * 0.1) + " " + n(y0 + dy * 0.56) + " " +
            n(x0 + w) + " " + n(y0) + "Z";
  }

  /* ============================================================
     总装
     ============================================================ */
  function figure(cfg, mood, detail) {
    detail = detail || 2;
    mood = mood || "calm";
    var u = uid();
    var k = SKIN[cfg.skin || "a"];
    var ir = cfg.iris || { lit: "#8a6038", base: "#5a3a24", deep: "#2a1a10" };
    var h = cfg.hair || {};
    var hc = h.color || "#241b14", hd = h.deep || "#0d0906", hl = h.light || "#4c3826";
    var ac = cfg.accent || "#46d3e8";
    var f = FACES[cfg.face] || cfg.face || FACES.oval;
    var ey = (cfg.eye && cfg.eye.cy) || 110;
    var ex = (cfg.eye && cfg.eye.gap) || 26;
    var erx = (cfg.eye && cfg.eye.rx) || 13;
    var ery = (cfg.eye && cfg.eye.ry) || 5.8;
    var my = (cfg.mouth && cfg.mouth.y) || 156;
    var mw = (cfg.mouth && cfg.mouth.w) || 30;
    var by = (cfg.brow && cfg.brow.y) || 96;
    var bw = (cfg.brow && cfg.brow.w) || 36;
    var bt = (cfg.brow && cfg.brow.thick) || 5;
    var barch = (cfg.brow && cfg.brow.arch != null) ? cfg.brow.arch : 4.2;
    var cl = cfg.cloth || {};
    var clhi = cl.hi || "#2b3849", cldp = cl.deep || "#101724";

    /* 小头像一律用纯色，不引渐变。
       两个原因：一是 52px 下渐变根本看不出来；
       二是头像常常处在带 filter / transform 的合成层里，
       那层里渐变填充会整块丢，脸直接变成一团黑。
       大图才需要渐变 —— 那里才有足够的像素去表现过渡。 */
    var solid = detail < 2;
    var F_SK = solid ? k.base : "url(#" + u + "sk)";
    var F_HK = solid ? hc : "url(#" + u + "hk)";
    var F_CL = solid ? clhi : "url(#" + u + "cl)";
    var F_IR = solid ? ir.base : "url(#" + u + "ir)";

    /* 渐变一律用 userSpaceOnUse。
       默认的 objectBoundingBox 会让每个元素各算一套渐变 ——
       十几缕头发就变成十几个各自反光的小贴纸，永远合不成一坨头发。
       坐标写死在同一套用户空间里，叠在一起才像同一个光源照的。 */
    var defs = "";
    defs += '<linearGradient id="' + u + 'sk" gradientUnits="userSpaceOnUse" x1="52" y1="34" x2="156" y2="188">' +
      '<stop offset="0" stop-color="' + k.lit + '"/><stop offset=".44" stop-color="' + k.base + '"/>' +
      '<stop offset="1" stop-color="' + k.sh + '"/></linearGradient>';
    defs += '<linearGradient id="' + u + 'hk" gradientUnits="userSpaceOnUse" x1="44" y1="14" x2="150" y2="170">' +
      '<stop offset="0" stop-color="' + mix(hl, hc, 0.5) + '"/><stop offset=".34" stop-color="' + hc + '"/>' +
      '<stop offset="1" stop-color="' + hd + '"/></linearGradient>';
    defs += '<linearGradient id="' + u + 'cl" gradientUnits="userSpaceOnUse" x1="30" y1="192" x2="180" y2="240">' +
      '<stop offset="0" stop-color="' + clhi + '"/><stop offset="1" stop-color="' + cldp + '"/></linearGradient>';
    defs += '<radialGradient id="' + u + 'ir" cx=".4" cy=".34" r=".66">' +
      '<stop offset="0" stop-color="' + ir.lit + '"/><stop offset=".5" stop-color="' + ir.base + '"/>' +
      '<stop offset="1" stop-color="' + ir.deep + '"/></radialGradient>';
    defs += '<radialGradient id="' + u + 'bl" cx=".5" cy=".5" r=".5">' +
      '<stop offset="0" stop-color="' + k.blush + '" stop-opacity=".34"/>' +
      '<stop offset="1" stop-color="' + k.blush + '" stop-opacity="0"/></radialGradient>';
    defs += '<radialGradient id="' + u + 'bg" cx=".5" cy=".36" r=".72">' +
      '<stop offset="0" stop-color="' + ac + '" stop-opacity=".2"/>' +
      '<stop offset=".6" stop-color="' + ac + '" stop-opacity=".05"/>' +
      '<stop offset="1" stop-color="' + ac + '" stop-opacity="0"/></radialGradient>';
    if (detail >= 2) {
      defs += '<filter id="' + u + 'sf" x="-45%" y="-45%" width="190%" height="190%">' +
        '<feGaussianBlur stdDeviation="4"/></filter>';
      defs += '<filter id="' + u + 'sf2" x="-45%" y="-45%" width="190%" height="190%">' +
        '<feGaussianBlur stdDeviation="2.2"/></filter>';
    }
    defs += '<clipPath id="' + u + 'fc"><path d="' + f + '"/></clipPath>';
    defs += '<clipPath id="' + u + 'el"><path d="' + eyePath(100 - ex, -1, erx, ey, ery) + '"/></clipPath>';
    defs += '<clipPath id="' + u + 'er"><path d="' + eyePath(100 + ex, 1, erx, ey, ery) + '"/></clipPath>';

    var s = "";

    /* 背景辉光交给 CSS 的 .cstc-por::before 做。
       画在 SVG 里的话，SVG 一被缩放就会出现一个可见的矩形边界。 */

    /* 后发：先于脸，形成「头发包住头」的外轮廓 */
    s += hairShape(u, h.back, hd, detail, false, F_HK);

    s += neck(u, k, detail, F_SK);
    /* 衣身整体下移 12：下巴在 182，肩线原来在 196，只剩 14px 脖子 ——
       头看着像直接搁在肩上。挪到 208 之后露出 26px，
       这是「有脖子的人」和「贴纸人」的分界。 */
    s += '<g transform="translate(0,12)">' + body(u, cfg, k, detail, F_CL) + "</g>";

    /* 耳：先于脸画，脸盖住内侧一半，剩下的正好是耳廓。
       位置必须跟着脸型走 —— 瘦削脸的边缘在 60，耳朵还钉在 50 的话
       会挂到脸外面去，看起来像精灵耳。 */
    var EARX = { oval: 52, square: 50, long: 55, round: 48, sharp: 59 };
    var exr = EARX[cfg.face] || 50;
    s += '<ellipse cx="' + exr + '" cy="108" rx="6.6" ry="11.4" fill="' + k.base + '" opacity=".95"/>';
    s += '<ellipse cx="' + (200 - exr) + '" cy="108" rx="6.6" ry="11.4" fill="' + k.sh + '" opacity=".95"/>';
    if (detail >= 2) {
      s += '<path d="M' + (exr - 1.6) + ' 103C' + (exr + 1.4) + ' 101.4 ' + (exr + 2) + ' 108 ' + (exr - 1.2) + ' 111.4" fill="none" stroke="' + k.deep + '" stroke-width="1.4" opacity=".38"/>';
      s += '<path d="M' + (201.6 - exr) + ' 103C' + (198.6 - exr) + ' 101.4 ' + (198 - exr) + ' 108 ' + (201.2 - exr) + ' 111.4" fill="none" stroke="' + k.deep + '" stroke-width="1.4" opacity=".38"/>';
    }

    /* 脸 */
    s += '<path d="' + f + '" fill="' + F_SK + '"/>';

    /* 脸内阴影：全部裁进脸形，绝不外溢 */
    s += '<g clip-path="url(#' + u + 'fc)">';
    if (detail >= 2) {
      /* 右下半张脸的暗面：这是「立体」的来源，比任何描边都有效 */
      s += '<ellipse cx="152" cy="126" rx="34" ry="62" fill="' + k.deep + '" opacity=".22" filter="url(#' + u + 'sf)"/>';
      /* 颧骨受光 */
      s += '<ellipse cx="70" cy="126" rx="16" ry="10" fill="#fff" opacity=".1" filter="url(#' + u + 'sf2)"/>';
      /* 腮红：位置在颧骨下方，不能贴着眼下，也不能压到嘴角 */
      s += '<ellipse cx="68" cy="133" rx="16" ry="10" fill="url(#' + u + 'bl)"/>';
      s += '<ellipse cx="132" cy="133" rx="16" ry="10" fill="url(#' + u + 'bl)"/>';
      /* 下颌线 */
      s += '<path d="M100 182C120 182 138 172 147 152" stroke="' + k.deep + '" stroke-width="6" fill="none" opacity=".18" filter="url(#' + u + 'sf2)"/>';
      /* 太阳穴暗：让额头有转折 */
      s += '<ellipse cx="54" cy="88" rx="10" ry="18" fill="' + k.deep + '" opacity=".12" filter="url(#' + u + 'sf2)"/>';
    }
    s += "</g>";
    s += '<path d="' + f + '" fill="none" stroke="' + k.line + '" stroke-width="1.4" stroke-opacity=".45"/>';

    /* 轮廓光：必须画在头发之前。画在最后会沿着脸的轮廓浮在头发外面，
       看起来像戴了一个发箍 —— 这是上一版最明显的「假」。 */
    if (detail >= 2) {
      s += '<g clip-path="url(#' + u + 'fc)" opacity=".42">' +
        '<path d="' + f + '" fill="none" stroke="' + ac + '" stroke-width="3.2" transform="translate(1.8,1.8)"/>' +
        "</g>";
    }

    /* 五官 */
    s += brow(mood, k, hc, 100 - ex, by, bw, bt, { out: -1, arch: barch });
    s += brow(mood, k, hc, 100 + ex, by, bw, bt, { out: 1, arch: barch });
    s += eye(u, mood, k, ir, 100 - ex, ey, erx, ery, { out: -1, detail: detail, lash: !cfg.noLash, irisFill: F_IR });
    s += eye(u, mood, k, ir, 100 + ex, ey, erx, ery, { out: 1, detail: detail, lash: !cfg.noLash, irisFill: F_IR });
    s += nose(u, k, 100, (cfg.nose && cfg.nose.y) || 136, detail);
    s += mouth(u, mood, k, 100, my, mw, detail, cfg.lipStyle);

    /* 鬓角：盖住耳前那一小块，是「头发长在头上」而不是「戴上去」的关键。
       不描边，否则两缕鬓角会各自变成一条深色贴片。 */
    s += hairShape(u, h.side, hd, detail, true, F_HK);
    /* 前发：压住额头，才有「发型」而不是「光头戴假发」 */
    s += hairShape(u, h.front, hd, detail, false, F_HK);
    /* 碎发：从发块内部垂下来的发缕。只填色、不描边 ——
       一旦每缕都描边，它们就又变回一片片贴纸了。 */
    if (h.fringe && h.fringe.length) {
      s += '<g>' + h.fringe.map(function (d) {
        return '<path d="' + d + '" fill="' + F_HK + '"/>';
      }).join("") + "</g>";
    }
    s += hairHi(h.hi, hl, detail);

    /* 道具：眼镜、护目镜、口罩、疤、耳饰，由人物自己给 */
    if (cfg.prop) s += cfg.prop;

    return '<defs>' + defs + "</defs>" + s;
  }

  /* ---------------- 对外 ---------------- */
  var AVB = "12 10 176 176";   /* 头像取景：留一点边，下巴不贴边 */
  var BUB = "0 0 200 240";

  function wrap(cfg, mood, detail, vb, cls) {
    return '<svg viewBox="' + vb + '" class="' + (cls || "") + '" aria-hidden="true" ' +
      'preserveAspectRatio="xMidYMid meet">' + figure(cfg, mood, detail) + "</svg>";
  }

  window.YCPort = {
    version: "2.1.0",
    figure: figure,
    lock: lock,
    SKIN: SKIN,
    FACES: FACES,
    avatar: function (cfg, mood) { return wrap(cfg, mood, 1, AVB, "yp-av"); },
    bust: function (cfg, mood) { return wrap(cfg, mood, 2, BUB, "yp-bust"); },
    raw: function (cfg, mood, detail) { return figure(cfg, mood, detail || 2); }
  };
})();

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
    var n = Math.max(3, Math.round(h / 4.2));
    var fh = h / n, i, a;

    put(g, CYL6, (r + 0.9) * 2, 0.55, (r + 0.9) * 2, 0, by + 0.28, 0, M.hiveBase, Math.PI / 2);
    put(g, CYL6, r * 2, h, r * 2, 0, by + h / 2, 0, M.hiveShell, Math.PI / 2);
    /* 横带从第二层起。第一层贴地做成实墙——一条玻璃带压在土上，
       整栋楼会读成「悬空的盒子」。 */
    for (i = 1; i < n; i++) {
      put(g, CYL6, (r + 0.16) * 2, 2.4, (r + 0.16) * 2, 0, by + i * fh + 1.2, 0,
        M.hiveGlass, Math.PI / 2);
    }
    /* 六条竖棱：格子之间那道缝的延伸，也是全区唯一的竖向线 */
    for (i = 0; i < 6; i++) {
      a = Math.PI / 3 * i;
      put(g, BOX, 0.55, h, 0.55, Math.cos(a) * r * 0.96, by + h / 2,
        Math.sin(a) * r * 0.96, M.hiveTrim, -a);
    }
    put(g, CYL6, (r + 0.55) * 2, 1.3, (r + 0.55) * 2, 0, by + h + 0.65, 0,
      M.hiveTrim, Math.PI / 2);
    /* 屋顶设备要少。十八格从空中看是一张蜂巢，
       每个屋顶堆三件设备，蜂巢就变成一张补丁布。 */
    put(g, BOX, r * 0.62, 1.9, r * 0.44, -r * 0.14, by + h + 2.25, r * 0.10, M.hiveMetal);
    put(g, CYL, 2.4, 3.2, 2.4, r * 0.34, by + h + 2.9, -r * 0.26, M.hiveMetal);
    put(g, BOX, 0.9, 2.4, 0.9, -r * 0.44, by + h + 2.5, -r * 0.30, M.hiveTrim);
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
    put(g, CYL6, (o.pad || 156) * 2, 0.35, (o.pad || 156) * 2, cx, 0.175, cz,
      M.hiveBase, Math.PI / 2);
    put(g, CYL6, (o.pad || 156) * 2 - 6, 0.16, (o.pad || 156) * 2 - 6, cx, 0.42, cz,
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
    var y = base, i;

    put(g, CYL6, (r0 + 1.8) * 2, base, (r0 + 1.8) * 2, 0, base / 2, 0, M.hiveBase, Math.PI / 2);
    for (i = 0; i < bands; i++) {
      var ra = r0 + (r1 - r0) * (i / bands);
      var rb = r0 + (r1 - r0) * ((i + 1) / bands);
      /* 每一段的锥度都不同，只能用独立几何——scale 做不出变截面 */
      put(g, new THREE.CylinderGeometry(rb, ra, segH, 6), 1, 1, 1, 0, y + segH / 2, 0,
        i % 2 ? M.hiveShell2 : M.hiveShell3, Math.PI / 2);
      y += segH;
      if (i < bands - 1) {
        /* 暗槽的半径再收 1.25 米。不收的话十段退台在远处就是一根直筒：
           每段只退 1.3 米，600 米外差不到一个像素，全靠这道槽读出「有层」。 */
        put(g, new THREE.CylinderGeometry(rb - 1.25, rb - 1.25, gap, 6), 1, 1, 1, 0,
          y + gap / 2, 0, M.hiveTrim, Math.PI / 2);
        y += gap;
      }
    }
    put(g, CYL6, (r1 + 0.9) * 2, 1.5, (r1 + 0.9) * 2, 0, h + 0.75, 0, M.hiveTrim, Math.PI / 2);
    put(g, CYL6, r1 * 0.84, 2.2, r1 * 0.84, 0, h + 2.6, 0, M.hiveMetal, Math.PI / 2);
    put(g, CYL, 1.3, 4.6, 1.3, 0, h + 5.6, 0, M.hiveTrim);
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
      put(g, BOX, 0.9, bhS + 1.6, bwS + 1.6, -mainW / 2 - 0.5, sy + bhS / 2, mainZ, M.aiCrown);
      var pl2 = new THREE.Mesh(new THREE.PlaneGeometry(bwS, bhS), smat2);
      pl2.position.set(-mainW / 2 - 0.98, sy + bhS / 2, mainZ);
      pl2.rotation.y = -Math.PI / 2;
      g.add(pl2);
    }
  };


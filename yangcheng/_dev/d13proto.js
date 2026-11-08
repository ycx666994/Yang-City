
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
    var back = o.back || 46, front = o.front || 68;
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
      put(g, BOX, 12.2, 2.55, 2.45, tx, boomTop - 15.8, 0, M.cont[0]);
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
      put(g, BOX, len + 0.8, 0.20, bw + 4.2, mx, 0.10, mz, M.ballast, ry);
      put(g, BOX, len + 0.8, 0.14, bw, mx, 0.22, mz, M.ballast, ry);
      for (t = 0; t < tr; t++) {
        off = (t - (tr - 1) / 2) * sp;
        for (var s = 1.2; s < len; s += step) {
          put(g, BOX, 0.30, 0.16, 2.9,
            ax + ux * s + nx * off, 0.34, az + uz * s + nz * off, M.portConcrete3, ry);
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
          M.cont[k % M.cont.length]);
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

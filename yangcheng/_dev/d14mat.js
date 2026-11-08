      portSleeper: plainMat(0x9c9488, 0.96),

      /* --- 蜂巢实验区（D14） ---
         这一区只有两种表面：米白的六棱柱墙、绿玻璃的舱。
         前十三区都是「石材 + 砖 + 金属 + 混凝土」的混合物，
         这一区故意只给两样——像一间洁净实验室，
         多一种材料就多一层「这楼到底是给谁用的」的噪音。 */
      hiveShell: plainMat(0xe6e2d4, 0.92),      /* 六棱柱墙身 */
      hiveShell2: plainMat(0xd2ccbb, 0.93),     /* 墙面分格、箍 */
      hiveShell3: plainMat(0xf1eee2, 0.90),     /* 锥台的亮面段 */
      hiveTrim: plainMat(0x5e5a4b, 0.88),       /* 深色檐带、棱线、井口 */
      hiveGlass: plainMat(0x5f8371, 0.34, 0.26),/* 绿玻璃：实验舱、横带 */
      hiveGlass2: plainMat(0x44685a, 0.30, 0.32),
      hiveBase: plainMat(0xb5af9c, 0.95),       /* 台基、勒脚 */
      hivePave: plainMat(0xd5d1c2, 0.94),       /* 广场铺装 */
      hiveJoint: plainMat(0xa8a292, 0.95),      /* 铺装缝、引导带 */
      hiveMetal: plainMat(0x8f938f, 0.48, 0.42),/* 栏杆、设备 */
      hiveSoil: plainMat(0x7d7a62, 0.98),       /* 半埋舱周围的土坡 */

      /* 三座 AI 大厂的幕墙。冷白、深灰、中灰——
         三座塔不能是三种颜色，那读成三个品牌广告；
         它们是同一组玻璃盒子，差异只在反照率。 */
      aiShellA: plainMat(0xdbe0e3, 0.28, 0.46),
      aiShellB: plainMat(0x49535c, 0.30, 0.44),
      aiShellC: plainMat(0xb4bcc1, 0.32, 0.42),
      aiMullion: plainMat(0x9ba3a9, 0.44, 0.38),/* 遮阳肋、竖梃 */
      aiCrown: plainMat(0x394047, 0.52, 0.32),  /* 塔冠、结构带、灯箱底板 */
      aiPodium: plainMat(0xcbc7b6, 0.93),       /* 裙房 */
      aiSoffit: plainMat(0x7c848a, 0.55, 0.34)  /* 裙房檐底 */
    };

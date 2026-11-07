/* H3 · 明亮的实体AI博物馆：指标殿与五个独立展厅。 */
(function () {
  "use strict";
  var T = window.THREE, B = window.YC3D_B, P = window.YC3D_P;
  var PAL = { stone: 0xf0f2ef, stone2: 0xffffff, floor: 0xe0e6e6,
    accent: 0xb69962, accent2: 0x285d83, cool: 0x6a9fc0 };

  function clickable(g, action) {
    /* 异步人物的子网格由引擎向祖先查找事件，不依赖加载时序。 */
    g.userData.onClick = action;
    return g;
  }
  function solid(g, geo, mat, x, y, z) {
    var m = new T.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  function block(g, w, h, d, x, y, z, mat) {
    return solid(g, new T.BoxGeometry(w, h, d), mat || P.matStone(), x, y, z);
  }
  function plaque(g, title, sub, x, y, z, w, h, rot) {
    var p = P.label({ title: title, sub: sub, x: x, y: y, z: z, w: w || 6, h: h || 1.8, rot: rot || 0 });
    g.add(p); return p;
  }
  function makeGuide(ctx, gd, x, z, rot) {
    var g = new T.Group();
    var fig = B.character({ asset: gd.asset, scale: 1, color: gd.color });
    g.add(fig);
    /* 真人比例人物的名牌在旁边，不浮在头顶。 */
    block(g, 1.9, 0.18, 1.2, 0, 0.09, 0, P.matStone({ roughness: 0.3 }));
    plaque(g, gd.name + " · " + gd.title, gd.stance, 1.8, 1.45, 0.4, 2.3, 0.9);
    g.position.set(x, 0, z); g.rotation.y = rot || 0;
    g.userData.guide = gd; g.userData.fig = fig;
    return clickable(g, function () { if (window.__pickGuide) window.__pickGuide(gd.id); });
  }
  function instrument(g, title, sub, x, z, w) {
    w = w || 6;
    block(g, w, 1.05, 2.6, x, 0.52, z, P.matStone({ roughness: 0.3 }));
    block(g, w + 0.1, 0.1, 2.7, x, 1.1, z, P.matGold());
    var plate = plaque(g, title, sub, x, 2.1, z + 0.6, w - 0.3, 1.5);
    block(g, 0.14, 1.2, 0.14, x, 1.65, z + 0.4, P.matGold());
    return plate;
  }
  function openInstrument(key) {
    if (window.__openInstrument) window.__openInstrument(key);
  }
  function roomBase(w, d, h, sk) {
    var g = new T.Group();
    g.add(P.shell({ w: w, d: d, h: h, pal: PAL, grid: 5, skylight: sk,
      openings: [{ side: "front", x: 0, w: 7, h: 7 }] }));
    if (sk) g.add(P.skylight({ w: sk.w, d: sk.d, y: h }));
    var arch = P.archway({ x: 0, z: d / 2 - 0.6, w: 7, h: 7, rot: Math.PI, label: "回到指标殿" });
    clickable(arch, function () { window.__enterRoom("lobby"); }); g.add(arch);
    return g;
  }

  function buildIndexDial() {
    var g = new T.Group(), r = 5.2, cy = 7.4;
    solid(g, new T.CylinderGeometry(6.4, 6.8, 0.9, 64), P.matStone({ roughness: 0.28 }), 0, 0.45, 0);
    [-1, 1].forEach(function (s) { block(g, 0.7, 5.3, 1, s * 2.5, 3.4, -0.25, P.matGold()); });
    var disc = solid(g, new T.CylinderGeometry(r, r, 0.7, 80), P.matStone({ base: 0xf7f6ee, roughness: 0.24 }), 0, cy, 0);
    disc.rotation.x = Math.PI / 2;
    solid(g, new T.TorusGeometry(r, 0.15, 12, 96), P.matGold(), 0, cy, 0.37);
    var tickMat = new T.MeshStandardMaterial({ color: 0x315f78, roughness: 0.4,
      emissive: 0x2d6585, emissiveIntensity: 0.22 });
    for (var i = 0; i < 48; i++) {
      var a = i / 48 * Math.PI * 2;
      var tick = block(g, i % 4 ? 0.045 : 0.095, i % 4 ? 0.36 : 0.65, 0.035,
        Math.sin(a) * (r - 0.55), cy + Math.cos(a) * (r - 0.55), 0.38, tickMat);
      tick.rotation.z = -a;
    }
    var needle = new T.Group();
    block(needle, 0.13, r * 0.8, 0.1, 0, r * 0.4, 0, P.matGold());
    needle.position.set(0, cy, 0.52); needle.rotation.z = -Math.PI / 3; g.add(needle);
    var hub = solid(g, new T.CylinderGeometry(0.35, 0.35, 0.25, 24), P.matGold(), 0, cy, 0.55);
    hub.rotation.x = Math.PI / 2;
    plaque(g, "计量之器", "数字可以精确，目标仍需检验", 0, 2.0, 1.1, 5.8, 1.5);
    g.userData.needle = needle; return g;
  }
  function buildLobby(ctx) {
    var g = new T.Group(), w = 54, d = 66;
    var rear = [{ x: -17, w: 8, h: 8 }, { x: 0, w: 8, h: 8 }, { x: 17, w: 8, h: 8 }];
    var front = [{ x: -15, w: 8, h: 8, side: "front" }, { x: 15, w: 8, h: 8, side: "front" }];
    g.add(P.shell({ w: w, d: d, h: 18, ceiling: false, pal: PAL, grid: 6, openings: rear.concat(front) }));
    g.add(P.vault({ w: w, d: d, y: 18, rise: 11, opening: 0.28 }));
    g.add(P.skylight({ w: 14.6, d: d, y: 28.7 }));
    g.add(P.colonnade({ x: -21, n: 7, span: 8, h: 15.7, r: 1.08 }));
    g.add(P.colonnade({ x: 21, n: 7, span: 8, h: 15.7, r: 1.08 }));
    g.add(P.balcony({ w: w, d: d, y: 10.8 }));
    var doors = [
      { id: "r1", x: -17, z: -d / 2 + 0.7, title: "代理指标展厅" },
      { id: "r2", x: 0, z: -d / 2 + 0.7, title: "古德哈特展厅" },
      { id: "r3", x: 17, z: -d / 2 + 0.7, title: "分布漂移展厅" },
      { id: "r4", x: -15, z: d / 2 - 0.7, title: "仪器展厅", rot: Math.PI },
      { id: "r5", x: 15, z: d / 2 - 0.7, title: "精英挑战展厅", rot: Math.PI }
    ];
    doors.forEach(function (door) {
      var arch = P.archway({ x: door.x, z: door.z, w: 8, h: 8, label: door.title, rot: door.rot || 0 });
      clickable(arch, function () { window.__enterRoom(door.id); }); g.add(arch);
    });
    var dial = buildIndexDial(); dial.position.z = -10; g.add(dial); g.userData.atrium = dial;
    plaque(g, "指标失效博物馆", "五座独立展厅 · 可以选择一位导游，也可以自由参观", 0, 15, -32.35, 18, 2.8);
    plaque(g, "馆内导航", "前方：代理 / 古德哈特 / 漂移　后方：仪器 / 挑战", 0, 2.3, 7, 9, 1.9);
    block(g, 0.2, 2.1, 0.2, 0, 1.05, 6.8, P.matGold());
    ctx.cfg.guides.forEach(function (gd, i) { g.add(makeGuide(ctx, gd, -7 + i * 7, 14, 0)); });
    var keeper = B.character({ asset: "jay", scale: 1 }); keeper.position.set(-11, 0, -3); keeper.rotation.y = 0.5; g.add(keeper);
    plaque(g, "白珩 · 馆长", "Jay 共享骨骼模型，非专属定制面容", -13.4, 1.5, -2.5, 3.7, 1.1);
    return g;
  }

  function buildR1() {
    var g = roomBase(34, 50, 14, { w: 10, d: 34 });
    var items = [
      ["真实目标", "让用户真的学会", "学习迁移"], ["代理指标", "课程完成率", "92%"],
      ["失效方式", "播放到80%不等于学会", "口径偏差"], ["真实目标", "让回答真的有用", "任务成功"],
      ["代理指标", "回答长度", "+38%"], ["失效方式", "冗长替代了信息", "奖励偏差"],
      ["结论", "代理与目标需要独立验证", "回到证据"]
    ];
    items.forEach(function (it, i) {
      var x = i % 2 ? 8 : -8, z = 15 - i * 5;
      var vit = P.vitrine({ x: x, z: z, w: 3, h: 2.3, d: 2.7 }); g.add(vit);
      block(g, 1.9, 0.9, 0.35, x, 1.7, z, i % 3 === 1 ? P.matGold() : P.matStone({ base: 0x90afbf }));
      plaque(g, it[2], "教学示例，非馆内实时数据", x, 2.65, z + 0.4, 2.65, 0.7);
      plaque(g, it[0], it[1], x, 1.25, z + 1.6, 4.9, 1.2);
    });
    plaque(g, "代理不是缩小的目标", "同时观测代理变化与真实任务结果", 0, 5.7, -24.35, 18, 3.4);
    return g;
  }
  function buildR2() {
    var g = roomBase(40, 40, 17, { w: 16, d: 16 });
    /* 半圆议事厅围绕一台实体秤，不复用双排展柜。 */
    for (var i = 0; i < 7; i++) {
      var a = Math.PI + i * Math.PI / 6;
      var x = Math.cos(a) * 15, z = Math.sin(a) * 13 - 2;
      solid(g, new T.CylinderGeometry(0.65, 0.85, 10, 28), P.matStone(), x, 5, z);
    }
    var base = solid(g, new T.CylinderGeometry(5.6, 6, 0.6, 64), P.matStone(), 0, 0.3, -4);
    block(g, 0.8, 6.5, 0.8, 0, 3.8, -4, P.matGold());
    var beam = new T.Group(); beam.position.set(0, 7, -4); g.add(beam);
    block(beam, 13, 0.35, 0.5, 0, 0, 0, P.matGold());
    [-1, 1].forEach(function (s) {
      block(beam, 0.06, 3, 0.06, s * 5.2, -1.5, 0, P.matGold());
      solid(beam, new T.CylinderGeometry(2.1, 1.8, 0.22, 40), P.matStone(), s * 5.2, -3, 0);
      block(beam, 1.3, s > 0 ? 1.6 : 0.8, 1.3, s * 5.2, -2.1, 0, s > 0 ? P.matGold() : P.matStone({ base: 0x7eacc2 }));
    });
    plaque(g, "真实收益", "独立验收", -6, 2, -1.4, 4.3, 1.3);
    plaque(g, "受奖励的数字", "达标不等于有用", 6, 2, -1.4, 4.3, 1.3);
    var optimised = false;
    var switcher = instrument(g, "切换奖励压力", "点击看机械秤偏向被奖励的代理", 0, 7, 8);
    clickable(switcher, function () {
      optimised = !optimised; beam.rotation.z = optimised ? -0.18 : 0;
      if (window.__say) window.__say(optimised ? "奖励集中到代理后，行为向数字倾斜；机械秤是概念演示，不是实验统计。" : "取消单一数字奖励，重新用真实任务验收。这只是概念演示。", 7);
    });
    clickable(base, function () { switcher.userData.onClick(); });
    plaque(g, "当度量变成目标", "监测激励如何改变行为，而不只监测分数", 0, 11, -19.35, 17, 3.3);
    return g;
  }
  function buildR3() {
    var g = roomBase(44, 44, 16, { w: 28, d: 22 });
    /* 两片错位样本庭院与一座桥，表达训练和部署分布的分离。 */
    [-1, 1].forEach(function (side) {
      block(g, 14, 0.35, 22, side * 11, 0.18, -4, P.matStone({ base: side < 0 ? 0xe3ecec : 0xd6e2ee }));
      for (var i = 0; i < 24; i++) {
        var x = side * 11 - 5 + i % 6 * 2;
        var z = -12 + Math.floor(i / 6) * 4.5;
        var h = side < 0 ? 1.1 + (i % 3) * 0.35 : 0.8 + (i % 5) * 0.65;
        var tile = block(g, 1.25, h, 1.25, x, h / 2 + 0.36, z,
          P.matStone({ base: side < 0 ? 0x699db0 : (i % 4 ? 0xa5bfce : 0xc1a873), roughness: 0.35 }));
        clickable(tile, function () { if (window.__say) window.__say("样本柱是构型示意，不是数据图。请在仪器里改变分布并检查结果。", 6); });
      }
      plaque(g, side < 0 ? "训练样本" : "部署样本", side < 0 ? "熟悉的人群与场景" : "人群、时间、输入条件变化", side * 11, 4, -17, 9, 2.1);
    });
    block(g, 7, 0.16, 5, 0, 0.08, 5, P.matGold());
    var p = instrument(g, "进入漂移测量仪", "保留原指标仪器的完整交互", 0, 13, 10);
    clickable(p, function () { openInstrument("drift"); });
    plaque(g, "昨天的准确率，不替今天作答", "比较两组样本，而不是只搬运一个分数", 0, 10, -21.35, 21, 3);
    return g;
  }
  function buildR4() {
    var g = roomBase(44, 38, 13, { w: 9, d: 25 });
    /* 横向工作台、吊架与器械墙组成计量工作坊。 */
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 3; i++) {
        var x = side * 12, z = -11 + i * 9;
        block(g, 10, 1, 4, x, 0.5, z);
        block(g, 10.2, 0.13, 4.2, x, 1.06, z, P.matGold());
        for (var k = 0; k < 4; k++) block(g, 0.9, 0.5 + k * 0.17, 0.9, x - 3 + k * 2, 1.5, z, P.matStone({ base: 0x7ba0b6 }));
        var lab = plaque(g, i === 0 ? "混淆矩阵与阈值" : i === 1 ? "标定与误差" : "指标对照实验",
          "打开原版指标工作台", x, 2.6, z + 1.6, 9, 1.7);
        clickable(lab, function () { openInstrument("metrics"); });
      }
      block(g, 0.5, 9, 28, side * 18, 4.5, -1, P.matStone());
      block(g, 0.16, 0.2, 28, side * 17.7, 7.5, -1, P.matGold());
    });
    var control = instrument(g, "打开指标工作台", "独立展厅内嵌原页面；不修改原业务", 0, 11, 10);
    clickable(control, function () { openInstrument("metrics"); });
    plaque(g, "先定口径，再读仪表", "变化来自模型，还是来自尺子？", 0, 7.7, -18.35, 20, 3);
    return g;
  }
  function buildR5() {
    var g = roomBase(44, 46, 20, { w: 18, d: 10 });
    /* 扇形看台面向单一舞台，挑战空间不是工作台复制品。 */
    for (var row = 0; row < 3; row++) {
      for (var i = 0; i < 9; i++) {
        var a = -0.9 + i * 1.8 / 8, r = 11 + row * 3.4;
        var x = Math.sin(a) * r, z = -9 + Math.cos(a) * r;
        var seat = block(g, 1.7, 0.7 + row * 0.3, 1.4, x, 0.35 + row * 0.15, z,
          P.matStone({ base: 0xa6bcc8, roughness: 0.5 }));
        seat.rotation.y = -a;
      }
    }
    block(g, 21, 0.8, 8, 0, 0.4, -14);
    block(g, 21, 0.12, 0.12, 0, 0.85, -9.95, P.matGold());
    var screen = plaque(g, "精英挑战 · 指标迷宫", "在选择中辨别目标、代理、激励与漂移", 0, 7.2, -21.35, 24, 7);
    clickable(screen, function () { openInstrument("maze"); });
    var lectern = instrument(g, "开始精英挑战", "在馆内打开原版迷宫，题库和成绩逻辑保持不变", 0, -5, 10);
    clickable(lectern, function () { openInstrument("maze"); });
    return g;
  }

  var GUIDES = [
    { id: "shen", asset: "sintel", name: "沈砚", title: "统计师", color: 0x506b92,
      stance: "这个数是怎么来的？", intro: ["我是沈砚，统计师。我用 Sintel 共享角色模型呈现，并非专属定制面容。", "我会先问样本、分母和不确定性，再判断数字。"], tone: "怀疑" },
    { id: "he", asset: "sophia", name: "何量", title: "测量员", color: 0x337b92,
      stance: "先定口径，再谈数。", intro: ["我是何量，测量员。我用 Sophia 共享角色模型呈现，并非专属定制面容。", "我会带你核对口径、阈值和标定，确认尺子没有变。"], tone: "精确" },
    { id: "tao", asset: "jay", name: "陶叔", title: "老技师", color: 0x9a743c,
      stance: "数字之外，现场怎样？", intro: ["我是陶叔，老技师。我与馆长共用 Jay 模型，不是独有面容。", "我会讲现场如何绕过数字，再用真实任务验收。"], tone: "现场" }
  ];
  function stop(pos, look, shen, he, tao) {
    return { pos: pos, look: look, move: 3, hold: 12,
      text: { shen: shen, he: he, tao: tao } };
  }
  var CFG = {
    id: "H3", name: "指标失效博物馆", en: "Museum of broken metrics", palette: PAL, guides: GUIDES,
    manifest: {
      characters: [
        { role: "沈砚", asset: "sintel", customFace: false },
        { role: "何量", asset: "sophia", customFace: false },
        { role: "陶叔、馆长白珩", asset: "jay", customFace: false }
      ], note: "使用下载的共享骨骼角色资产；未制作专属脸部。样本柱、机械秤和馆内数字均为教学示意。"
    },
    instruments: {
      drift: { room: "r3", title: "分布漂移 · 指标测量仪", src: "h3-metrics.html" },
      metrics: { room: "r4", title: "指标工作台", src: "h3-metrics.html" },
      maze: { room: "r5", title: "精英挑战 · 指标迷宫", src: "h3-maze.html" }
    },
    rooms: [
      { id: "lobby", name: "指标殿 · 大厅", size: { w: 54, d: 66, h: 29 }, spawn: [0, 1.66, 24], spawnPitch: 0.14, build: buildLobby, stops: [] },
      { id: "r1", name: "代理指标展厅", size: { w: 34, d: 50, h: 14 }, spawn: [0, 1.66, 20], build: buildR1,
        stops: [
          stop([0, 1.66, 15], [-8, 2, 15], "真实目标不可直接观测时，我们引入代理。先问代理与目标的相关性来自什么样本。", "这里区分真实目标和观测量。完成率的计算口径，必须在比较前固定。", "一线想让人学会，仪表却只记播放进度。你看，工作已经被换了。"),
          stop([0, 1.66, 6], [8, 2, 10], "92%是教学示例。没有分母、样本选择和学习测验，这个完成率不能证明效果。", "播放到80%算完成，不等于答对迁移任务。把判定条件写清楚再验收。", "拖进度条就能达标，课堂里却没人会用。去看他独立做题，而不是看仪表。"),
          stop([0, 1.66, -7], [8, 2, -10], "回答长度增加38%同样只是示例；要对照任务成功率，不能由长度推出有用性。", "长度是字符数还是词数？同一阈值如何跨语言比较？尺子本身需要标定。", "模型学会多说话，不一定学会解决问题。让它真修一台设备，马上就看出来。"),
          stop([0, 1.66, -17], [0, 5, -24], "留一个独立检验集观测真实结果，避免拿同一个代理自证。", "把代理的单位、阈值、适用条件和验收方法一起记录。", "别责怪工人跟着奖惩走；先修验收，再修指标。")
        ] },
      { id: "r2", name: "古德哈特展厅", size: { w: 40, d: 40, h: 17 }, spawn: [0, 1.66, 15], build: buildR2,
        stops: [
          stop([0, 1.66, 10], [0, 5, -4], "优化会改变数据生成过程。旧相关性在强激励下可能消失。", "奖励函数与验收函数不能混为一谈。机械秤只解释这种差异。", "奖什么，大家就做什么。现场很快学会你没写进规则的捷径。"),
          stop([10, 1.66, 1], [0, 5, -4], "点击切换奖励压力：偏转是概念模型，不代表估计出来的因果效应。", "别把这台秤当数据仪表；要用独立真实任务检验是否偏离。", "被奖励的一边变重了，另一边没跟上。这就是只追工单数量的陷阱。"),
          stop([0, 1.66, -10], [0, 10, -19], "用未被直接优化的验证指标，检查目标有没有受损。", "定期复核激励条件，口径变动要留下版本。", "把验收交回真正使用结果的人，不让数字自己签字。")
        ] },
      { id: "r3", name: "分布漂移展厅", size: { w: 44, d: 44, h: 16 }, spawn: [0, 1.66, 18], build: buildR3,
        stops: [
          stop([0, 1.66, 10], [-11, 3, -8], "这两组样本柱是空间示意，不是直方图。要先比较输入分布和样本覆盖。", "训练和部署若换了采集协议，看似漂移也可能是仪器变了。", "实验室都在晴天测，现场却有夜班和旧设备。场景早换了。"),
          stop([0, 1.66, 0], [11, 3, -8], "协变量、标签比例和条件关系的变化要分开检查。一个总准确率遮不住它们。", "先固定阈值与采样规则，再分别评估人群和时间切片。", "把失败案例按地点、时间、设备摊开，往往比看平均分有效。"),
          stop([0, 1.66, 16], [0, 2, 13], "打开原指标仪器进行交互；此处没有新增漂移专用算法。", "原测量仪完整保留，比较前记录每一个参数。", "拿部署中的难例去测。原工作台没有的实验，别声称已经做过。")
        ] },
      { id: "r4", name: "仪器展厅", size: { w: 44, d: 38, h: 13 }, spawn: [0, 1.66, 14], build: buildR4,
        stops: [
          stop([0, 1.66, 10], [-12, 2, 7], "准确率、召回率、精确率的分母不同，不能用一个数替代误差结构。", "在工作台里改阈值前，先写下正类定义和统计窗口。", "漏掉坏件和误拦好件，代价可不一样。先问现场能承受什么。"),
          stop([0, 1.66, -3], [12, 2, -2], "打开原版指标页面。这里保留原计算，不虚构新的实验结果。", "参数与单位要完整记录，重复同一设置才有比较意义。", "工作台是试尺子的地方；带着真实失败案例来，不只挑顺手的。"),
          stop([0, 1.66, 14], [0, 2, 11], "交互会在本厅的内嵌窗口打开，旧页面的统计与业务逻辑没有改。", "关闭仪器回到同一个房间，口径检查继续。", "用完仪器回到现场验收，数字只是证据的一部分。")
        ] },
      { id: "r5", name: "精英挑战展厅", size: { w: 44, d: 46, h: 20 }, spawn: [0, 1.66, 18], build: buildR5,
        stops: [
          stop([0, 1.66, 15], [0, 7, -21], "挑战不是猜最高的数字，而是识别证据支持到哪一步。", "进入迷宫前，逐个确认题目中的单位、阈值和目标。", "遇到漂亮报表先别鼓掌，问一句现场到底怎样。"),
          stop([0, 1.66, 6], [0, 2, -5], "点击舞台或讲台打开原指标迷宫，题库与成绩逻辑原样保留。", "挑战页在独立窗口交互；关闭后仍在本展厅。", "我不会替你做选择。把指标、奖励、结果拆开，再走下一步。")
        ] }
    ]
  };
  window.YCMUSEUM = CFG;
})();

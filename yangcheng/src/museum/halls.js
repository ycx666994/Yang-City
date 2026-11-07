/* Six distinct civic museums. Their 3D rooms are lobbies only; exhibits stay as existing learning pages. */
(function () {
  "use strict";
  var guideSet = [
    { id: "shen", asset: "sintel", name: "沈砚", role: "统计师", color: 0x506b92 },
    { id: "he", asset: "sophia", name: "何量", role: "测量员", color: 0x337b92 },
    { id: "tao", asset: "jay", name: "陶叔", role: "现场技师", color: 0x9a743c }
  ];
  var halls = {
    H1: { id:"H1", name:"能力与边界博物馆", en:"TRUST LAB", question:"它表现得很强，究竟证明了什么？", style:"civic", accent:0xc3914e,
      guides:[["证据先行","先问这项能力究竟怎样被测量。"],["复现实验","换数据、换任务，结论还站得住吗？"],["现场经验","漂亮的结果之外，实际使用者看到了什么？"]],
      exhibits:[
        ["m1","涌现与海市蜃楼","规模增长时的能力跃迁","../m1-mirage.html","main"],
        ["m2","认证地平线","能力认证、扰动半径与证明边界","../m2-horizon.html","main"],
        ["m3","温度与幻觉放大器","采样温度怎样放大不确定回答","../m3-temperature.html","main"],
        ["m4","越狱攻防","攻击与防御矩阵","../m4-jailbreak.html","main"],
        ["m5","水印侦探","生成文本的来源鉴证","../m5-watermark.html","main"],
        ["m6","校准放大器","置信度与正确率是否一致","../m6-calibration.html","main"],
        ["m7","对抗样本靶场","微小扰动与鲁棒性","../m7-adv.html","main"],
        ["m8","刷分机器人","代理指标被优化后会发生什么","../m8-goodhart.html","main"],
        ["bench","引擎试车台","拆开模型内部状态","../engine-bench.html","main"]
      ] },
    H2: { id:"H2", name:"推理法医馆", en:"REASONING FORENSICS", question:"解释得通，是否意味着解释真的影响了答案？", style:"archive", accent:0x668eb3,
      guides:[["干预统计","我先看反事实比较和对照组。"],["因果口径","先说清楚改动的变量及其影响路径。"],["审讯现场","模型的理由要经受真正的追问。"]],
      exhibits:[
        ["story","卷宗","推理解释与证据问题","h2-forensic.html","story"],
        ["device","审讯台","成对干预与证人样本","h2-forensic.html","device"],
        ["instrument","审判席","四臂干预结果","h2-forensic.html","instrument"],
        ["evidence","附卷","边界、拒判线与证据记录","h2-forensic.html","evidence"],
        ["deep","证物长廊","扩展案例","h2-forensic.html","deep"],
        ["case","案卷 0117","五幕交互式精英挑战","h2-case.html",""]
      ] },
    H3: { id:"H3", name:"指标失效博物馆", en:"MUSEUM OF BROKEN METRICS", question:"分数提高，是否真的让任务变好？", style:"vault", accent:0xb58c50,
      guides:[["统计师","先看样本、分母和不确定性。"],["测量员","先定口径，再谈指标。"],["现场技师","最后仍要用真实任务验收。"]],
      exhibits:[
        ["story","代理指标故事厅","目标与代理之间的差距","h3-metrics.html","story"],
        ["device","交互装置厅","操纵参数观察指标偏移","h3-metrics.html","device"],
        ["instrument","指标测量室","完整尸检仪器与变点判断","h3-metrics.html","instrument"],
        ["evidence","证据与边界室","校准、拒判与原始记录","h3-metrics.html","evidence"],
        ["challenge","精英挑战厅","指标塔 · 迷宫挑战","h3-maze.html",""]
      ] },
    H4: { id:"H4", name:"数据污染博物馆", en:"DATA CONTAMINATION ARCHIVE", question:"它答对，是泛化、记忆，还是证据无法区分？", style:"hive", accent:0x4c997f,
      guides:[["样本分析","先审数据来源和样本结构。"],["标签核验","核对变体、探针与标签污染。"],["取证实践","逐一排除记忆和真实泛化。"]],
      exhibits:[
        ["story","污染门厅","数据记忆与泛化的鉴别问题","h4-contam.html","story"],
        ["shelf","样本卷库","多组样本对照","h4-contam.html","shelf"],
        ["check","自检证物室","真值回收与拒判检查","h4-contam.html","check"],
        ["hand","证据移交室","复核判断口径","h4-contam.html","hand"],
        ["deep","深层档案廊","扩展病例与边界","h4-contam.html","deep"],
        ["purge","净化车间","十二道工序精英挑战","h4-purge.html",""]
      ] },
    H5: { id:"H5", name:"递归坍塌博物馆", en:"RECURSIVE COLLAPSE GREENHOUSE", question:"数据反复来自模型自身时，哪些信息会消失？", style:"greenhouse", accent:0x5c9c79,
      guides:[["演化观察","追踪每一代的支撑覆盖。"],["统计判读","分开分辨率不足与真实枯萎。"],["谱系研究","沿谱系寻找信息消失的过程。"]],
      exhibits:[
        ["nursery","育苗间","递归数据与分辨率","h5-collapse.html","nursery"],
        ["trellis","谱系温室","逐代观测层级覆盖","h5-collapse.html","trellis"],
        ["check","标本检查室","校验层级状态与拒判线","h5-collapse.html","check"],
        ["hand","研究交接厅","记录判定条件","h5-collapse.html","hand"],
        ["deep","种子档案库","边界条件与长程记录","h5-collapse.html","deep"],
        ["forecast","坍塌预报台","三轮精英预测挑战","h5-forecast.html",""]
      ] },
    H6: { id:"H6", name:"潜能与预算博物馆", en:"BUDGET DOME", question:"一次失败，是能力不足、调用不当，还是预算不足？", style:"observatory", accent:0xa88356,
      guides:[["预算分析","先区分名义预算和有效预算。"],["选择器研究","谁来挑出正确答案，规则很重要。"],["工程经验","每一笔预算都要接受结果检验。"]],
      exhibits:[
        ["budget","预算间","采样次数与可达上限","h6-budget.html","budget"],
        ["dome","天穹厅","有效预算与命中变化","h6-budget.html","dome"],
        ["settle","结算室","温度、选择器和结算结果","h6-budget.html","settle"],
        ["hand","移交口","预算判断的交接记录","h6-budget.html","hand"],
        ["deep","复算清单","重现并审计结论","h6-budget.html","deep"],
        ["tower","预算塔","十层预算精英挑战","h6-tower.html",""]
      ] }
  };
  Object.keys(halls).forEach(function (id) {
    halls[id].guides = halls[id].guides.map(function (g, i) {
      return Object.assign({}, guideSet[i], { stance:g[0], description:g[1] });
    });
    halls[id].exhibits = halls[id].exhibits.map(function (item) {
      return { id:item[0], title:item[1], sub:item[2], src:item[3], room:item[4] };
    });
  });
  window.YCMUSEUM_HALLS = halls;
})();

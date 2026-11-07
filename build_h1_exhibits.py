#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build only the eight legacy H1 learning exhibits, without touching the H1 hub or maze."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
ROOM_CFG = {
    "m1-mirage": {"id":"m1","room":"涌现与海市蜃楼 · 剧场","accent":"#b48cff","rail":"side","anim":"zoom","guides":{"wu":"我最惭愧的展品：那个「惊人能力」，重跑一遍就没了。它是我的海市蜃楼。","ce":"复跑一次再看结论。不能复现的「涌现」，按未证实归档——这是铁律。","pi":"所有人都想看到涌现，所以所有人都看到了。你猜这算不算另一种幻觉？","dang":"2016 年 Tay 上线 16 小时学坏下线；2023 年律师引用不存在的判例。都在这间剧场首映过。"}},
    "m2-horizon": {"id":"m2","room":"认证地平线 · 测绘台","accent":"#57c7ff","rail":"side","anim":"wipe","guides":{"wu":"这是全馆唯一有「CERTIFIED」钢印的展台——钢印边上写着它的适用范围，记得看。","ce":"认证不是全称命题：ρ 半径之内才作数。证书上的小字比钢印重要。","pi":"证书守护的是扰动半径，不是真实世界。出了 ρ 我照样能骗它——但得承认，圈内它是硬的。","dang":"随机平滑的思想借自统计学的老智慧：多数投票抗噪声。卷宗里我标注了原始论文页码。"}},
    "m3-temp": {"id":"m3","room":"幻觉放大器 · 双炉对比台","accent":"#f5b451","rail":"dock","anim":"split","guides":{"wu":"左边是冷静的我，右边是发烧的我。温度旋钮一拧你就明白什么叫一本正经地胡说。","ce":"「问它三遍」是最便宜的一致性测试。答案飘=在掷骰子，记进清单。","pi":"敢把温度拉到 1.2 吗？看它当场表演 fluent nonsense。","dang":"Galactica 的锅炉温度没人调——2022 年 11 月，它一本正经编了三页参考文献。"}},
    "m4-jail": {"id":"m4","room":"越狱攻防 · 攻防沙盘","accent":"#ef6b6b","rail":"side","anim":"flip","guides":{"wu":"默认黑名单护栏，五种攻击能破四种。我的同行们装完护栏就开始庆祝，你看急不急。","ce":"防御矩阵按「攻击×防御」逐格验证。单点成功不算数，矩阵补满才算数。","pi":"我的主场！五种攻击个个有故事，系统提示+输出过滤+上下文三件套装上后——再来试试？","dang":"Tay 就是被越狱教坏的第一个公众人物。卷宗 04-A 厚得像字典。"}},
    "m5-wm": {"id":"m5","room":"水印侦探 · 鉴证工作台","accent":"#3ecf8e","rail":"dock","anim":"iris","guides":{"wu":"水印是给文本按的指纹。我的下游兄弟靠它证明「这话是不是我说的」。","ce":"看 z 值别看感觉：6.8 是铁证，0.8 是噪声。阈值要提前定，不许事后挑。","pi":"三种洗水印的招我都试了，改写三成文字就能让它哑火。水印是门锁，不是保险柜。","dang":"水印思想来自古董纸币。技术是新的，攻防是老的——卷宗里攻防双方的记录一样厚。"}},
    "m6-calib": {"id":"m6","room":"校准放大器 · 仪表舱","accent":"#63e6be","rail":"top","anim":"slide","guides":{"wu":"校准曲线是我最爱的展品之一——因为它专治「模型说它有把握」。","ce":"看 ECE 别只看数字：分桶方式一换，结论可能反转。审计要连口径一起审。","pi":"自信和正确是两个变量。我见过 0.9 置信度对不到 60% 的——就在这台机器上。","dang":"把「90% 把握」当 90% 正确来用的人，卷宗里堆了整整一柜。"}},
    "m7-adv": {"id":"m7","room":"对抗样本 · 靶场","accent":"#ffa94d","rail":"top","anim":"flash","guides":{"wu":"那台 96 分的小模型，被一层人眼看不见的噪声骗得团团转。别笑，你也会被骗。","ce":"攻击成功率高不等于模型没用——但足以证明「测试集准确率」不等于「安全」。两个指标分开记。","pi":"这是我的游乐场！ε 旋钮往右拧，看那个「3」怎么一步步变「长臂猿」。","dang":"2019 年，几张贴纸让自动驾驶看错路牌。卷宗 07-A：攻击成本几美元，损失——幸好没人受伤。"}},
    "m8-goodhart": {"id":"m8","room":"刷分机器人 · 流水线监控室","accent":"#74c0fc","rail":"dock","anim":"conveyor","guides":{"wu":"它把指标刷上去了，把事情本身扔了。奖励函数骗起人来不比我差。","ce":"看曲线别看结论：piece 分数涨和 clean 分数跌同时发生——这就是过拟合指标的定义。","pi":"给模型定什么指标，它就给你表演什么。它从不辜负你——也不管你要不要。","dang":"古德哈特定律 1975 年就写下了。卷宗最老的一页。50 年过去，没人背下来。"}}
}
DEPENDENCIES = {
    "m3-temp": ["shared/tl-corpus.js", "shared/tl-lm.js"],
    "m5-wm": ["shared/tl-corpus.js", "shared/tl-lm.js"],
    "m7-adv": ["src/m7-adv/10-weights.js"],
}
OUTPUTS = {
    "m1-mirage":"m1-mirage.html", "m2-horizon":"m2-horizon.html", "m3-temp":"m3-temperature.html",
    "m4-jail":"m4-jailbreak.html", "m5-wm":"m5-watermark.html", "m6-calib":"m6-calibration.html",
    "m7-adv":"m7-adv.html", "m8-goodhart":"m8-goodhart.html"
}

def read(path): return (ROOT / path).read_text(encoding="utf-8")
def inline(path): return "<script>\n" + read(path) + "\n</script>\n"
def build(source):
    parts=[read(f"src/{source}/01-head.html"),read(f"src/{source}/02-style.html"),"<style>\n"+read("shared/tl-room.css")+"\n</style>\n</head>\n",read(f"src/{source}/03-body.html")]
    for dependency in DEPENDENCIES.get(source,[]): parts.append(inline(dependency))
    parts += ["<script>window.TLROOM="+json.dumps(ROOM_CFG[source],ensure_ascii=False,separators=(",",":"))+";</script>\n", "<script>window.TLBG_Z=-1</script>\n",read("shared/tl-guide.js"),read("shared/tl-bg-gl.js"),"<script>\n",read("shared/tl-room.js"),"\n</script>\n",read(f"src/{source}/04-app.js"),read(f"src/{source}/05-tail.html")]
    output=ROOT/OUTPUTS[source]
    output.write_text("".join(parts),encoding="utf-8",newline="\n")
    return output,output.stat().st_size

if __name__=="__main__":
    results=[build(source) for source in ROOM_CFG]
    for path,size in results: print(f"built {path.name}: {size/1024:.0f}K")

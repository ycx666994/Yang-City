import fs from "fs";
const src = fs.readFileSync("instruments/yc-metrics.js", "utf8");
global.window = {};
new Function("window", src)(global.window);
const M = global.window.YCMetrics;

const CK = [8, 16, 32, 64, 128, 256];
function show(name, trace, extra) {
  console.log("\n=== " + name + " ===");
  trace.forEach(p => console.log(
    String(p.budget).padStart(4),
    "P=" + p.P.toFixed(1).padStart(6),
    "T=" + p.T.toFixed(3),
    " ", p.label));
  const a = M.analyze(trace, { minEffect: 0.03 });
  console.log("  verdict:", a.verdict,
    "| 结构变点:", JSON.stringify(a.structural),
    "| 峰值idx:", a.peak && a.peak.idx,
    "| CUSUM onset:", a.cusum ? a.cusum.onset : "n/a",
    "| drop:", a.decline ? a.decline.drop : "-");
  if (a.gaps.length) a.gaps.forEach(g => console.log("  gap:", g));
  if (extra) console.log("  extra:", extra);
  return a;
}

/* 1. 主条件：无审计 */
const dev = M.makeWorld(1001, { budget: 120 });
const r1 = M.optimize(dev, CK, { seeds: [11, 29], optSeed: 20261029 });
show("条件 A · 优化器只看代理（无审计）", r1.trace);

/* 2. 干预：功率上限 0.55 + 禁止尾房加力 */
const r2 = M.optimize(dev, CK, { seeds: [11, 29], optSeed: 20261029, audit: { powerCap: 0.55, noBoost: true } });
show("条件 B · 加装审计（功率≤0.55，禁尾房加力）", r2.trace);

/* 3. 抗磨损房间：功率再高也不伤 */
const robust = M.makeWorld(1001, { budget: 120, robust: true });
const r3 = M.optimize(robust, CK, { seeds: [11, 29], optSeed: 20261029 });
show("条件 C · 全部抗磨损房间（指标本就没失效）", r3.trace);

/* 4. 预算不足：只有 3 档 */
const r4 = M.optimize(dev, [8, 16, 32], { seeds: [11, 29], optSeed: 20261029 });
show("条件 D · 优化预算不足（3 档）", r4.trace);

/* 5. 仪器自检 */
console.log("\n=== 仪器尸检 ===");
for (const h of [4.0, 5.0, 6.0]) {
  const st = M.selfTest({ reps: 60, h });
  console.log(`h=${h}  误报=${(st.falsePositiveRate * 100).toFixed(0)}%  检出=${(st.power * 100).toFixed(0)}%`);
}

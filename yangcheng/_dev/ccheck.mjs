import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");

const f = x => x == null ? "—" : (+x).toFixed(3);
function show(tag, r) {
  const e = r.est;
  console.log(`${tag.padEnd(30)} A=${f(e.accA)} B=${f(e.accB)} C=${f(e.accC)} | refB=${f(e.refB)} refC=${f(e.refC)} | R=${f(e.R)} R0=${f(e.R0)} rho=${f(e.rhoBar)} | k=${f(e.kappa)} ci=[${e.ci?e.ci.map(f).join(","):"—"}] -> ${r.verdict}/${r.subtype}`);
}

console.log("=== 默认 ===");
show("mem .85 w .45", C.runAudit({}));

console.log("\n=== 记忆强度 ===");
for (const m of [0, 0.2, 0.45, 0.7, 0.9, 1]) show(`mem=${m}`, C.runAudit({ mem: m, rewrite: 0.45 }));

console.log("\n=== 改写力度 ===");
for (const w of [0.1, 0.25, 0.45, 0.6, 0.7, 0.85, 0.95]) show(`w=${w}`, C.runAudit({ rewrite: w }));

console.log("\n=== 标签噪声 ===");
for (const l of [0, 0.2, 0.5, 0.8, 0.9]) show(`ln=${l}`, C.runAudit({ labelNoise: l, mem: 0.9 }));

console.log("\n=== 题量 ===");
for (const n of [30, 60, 96, 200]) show(`n=${n}`, C.runAudit({ n }));

console.log("\n=== 自检 ===");
const sc = C.selfCheck({});
console.log("MAE=", sc.mae, "覆盖=", sc.coverage, "耗时=", sc.ms, "ms");
sc.rows.forEach(r => console.log(`  truth=${r.truth} seed=${r.seed} k=${r.kappa} ci=${JSON.stringify(r.ci)} err=${r.err} ${r.hit?"✓":"✗"} ${r.verdict}/${r.subtype}`));

console.log("\n=== 负例 ===");
C.negatives().forEach(x => console.log(`  ${x.passed?"PASS":"FAIL"}  ${x.name}  -> ${x.verdict}/${x.subtype}  k=${f(x.kappa)}`));

console.log("\n=== 参照体检 ===");
C.refCheck().forEach(x => console.log(`  ${x.name} gap=${x.gap}pp 认证=${x.certified} k=${f(x.kappa)}`));

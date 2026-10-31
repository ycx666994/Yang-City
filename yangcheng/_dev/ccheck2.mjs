import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");
const f = x => x == null ? "—" : (+x).toFixed(3);
const show = (t, r) => console.log(`${t.padEnd(22)} A=${f(r.est.accA)} B=${f(r.est.accB)} C=${f(r.est.accC)} | k=${f(r.est.kappa)} ci=[${r.est.ci?r.est.ci.map(f).join(","):"—"}] ch=${r.channels.acc}/${r.channels.trace} -> ${r.verdict}/${r.subtype}`);

console.log("=== 默认 ===");
show("默认", C.runAudit({}));
console.log("\n=== 改写力度（含通道状态）===");
for (const w of [0.1, 0.45, 0.7, 0.95]) show(`w=${w}`, C.runAudit({ rewrite: w }));
console.log("\n=== 记忆强度 ===");
for (const m of [0, 0.3, 0.6, 0.95]) show(`mem=${m}`, C.runAudit({ mem: m }));
console.log("\n=== 窗口扫描 ===");
C.sweep({}).forEach(x => console.log(`  w=${x.rewrite} rho=${x.rhoBar} k=${f(x.kappa)} accB=${x.accB} refB=${x.refB}/${x.refC} ${x.verdict}/${x.subtype} 可用=${x.usable}`));
console.log("\n=== 参照体检 ===");
C.refCheck({}).forEach(x => console.log(`  ${x.name} gap=${x.gap}pp 认证=${x.certified}  ${x.detail}`));

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("D:/wobdy海外/2026-10-18-18-15-27/trust-lab/yangcheng/instruments/yc-dome.js");

const pct = x => (x * 100).toFixed(1) + "%";

console.log("=== 世界 ===");
const w = D.world();
console.log("任务", w.total, "可达", w.nReach, "不可达", w.nVoid);

console.log("\n=== 默认 k=32, τ=1.0 ===");
const r = D.run({ world: w, k: 32, tau: 1.0 });
console.log("pass@32", pct(r.pass), "vote@32", pct(r.vote), "greedy", pct(r.greedy));
console.log("nEff", r.nEff.toFixed(2), "leak", pct(r.leak), "deficit", pct(r.deficit));
console.log("ceiling", pct(r.ceiling), "unreachable", pct(r.unreachable), "headroom", pct(r.headroom));
console.log("nearOnly", pct(r.nearOnly), "cold", pct(r.cold));
console.log("reachHit", pct(r.reachHit), "voidHit", pct(r.voidHit));
console.log("判定", r.verdict + "/" + r.subtype);
console.log("理由", r.why);

console.log("\n=== 阶梯 ===");
r.ladder.forEach(l => console.log(`  k=${String(l.k).padStart(3)}  pass ${pct(l.pass).padStart(6)}  vote ${pct(l.vote).padStart(6)}  nEff ${l.nEff.toFixed(2)}  leak ${pct(l.leak).padStart(6)}  near ${pct(l.nearOnly).padStart(5)}`));

console.log("\n=== k 扫描判定变化 ===");
[1, 2, 4, 8, 16, 32, 64, 128, 256].forEach(k => {
  const x = D.run({ world: w, k, tau: 1.0 });
  console.log(`  k=${String(k).padStart(3)}  ${(x.verdict + "/" + x.subtype).padEnd(22)} pass ${pct(x.pass).padStart(6)}`);
});

console.log("\n=== τ 扫描 (k=32) ===");
D.sweepTau({ world: w, k: 32 }).forEach(s => {
  console.log(`  τ=${s.tau.toFixed(1)}  pass ${pct(s.pass).padStart(6)}  vote ${pct(s.vote).padStart(6)}  nEff ${s.nEff.toFixed(2)}  deficit ${pct(s.deficit).padStart(6)}`);
});

console.log("\n=== 归因 ===");
const dec = D.decompose({ world: w });
dec.arms.forEach(a => console.log(`  ${a.id} ${a.label.padEnd(6)} k=${String(a.k).padStart(3)} τ=${a.tau}  pass ${pct(a.pass).padStart(6)} vote ${pct(a.vote).padStart(6)} nEff ${a.nEff.toFixed(2)}`));
dec.preds.forEach(p => console.log(`  [${p.pass ? "成立" : "被推翻"}] ${p.label} — ${p.got}`));
console.log("  全部成立:", dec.allPass);

console.log("\n=== 自检 ===");
D.selfCheck().forEach(c => console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}  ${c.detail}`));

console.log("\n=== 负例 ===");
D.negatives().forEach(c => console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.label}  期望 ${c.want}  实得 ${c.got}`));

console.log("\n=== 确定性 ===");
const a1 = D.run({ world: w, k: 32, tau: 1.0 }).pass;
const a2 = D.run({ world: w, k: 32, tau: 1.0 }).pass;
console.log("  两次同参 pass 一致:", a1 === a2, pct(a1));

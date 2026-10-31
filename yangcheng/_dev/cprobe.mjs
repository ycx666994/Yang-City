import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");
const I = C._internals;

// 直接复现一次运行，统计乙档上"记忆触发"的真实次数
for (const mem of [0.25, 0.5, 0.9]) {
  const r = C.runAudit({ seed: 20261030, mem, rewrite: 0.45, n: 96, boot: 60 });
  const recallB = r.rows.filter(x => x.B.via === "recall").length;
  const staleB = r.rows.filter(x => x.B.stale).length;
  const recallA = r.rows.filter(x => x.A.via === "recall").length;
  const recallC = r.rows.filter(x => x.C.via === "recall").length;
  console.log(`mem=${mem}  A回吐=${recallA}  B回吐=${recallB}  C回吐=${recallC}  B旧答案=${staleB}  κ̂=${r.est.kappa?.toFixed(3)}  期望=${(mem*0.9).toFixed(3)}`);
}

// 检查表面匹配的分布：乙档的最佳匹配到底落在谁身上
const tr = [];
for (let i = 0; i < 96; i++) tr.push(I.genTriple(i, (20261030 + i*7919)>>>0, 0.45));
const rhos = tr.map(t => I.matchFrac(I.slotsOf(t.B), I.slotsOf(t.A)));
const uniq = {};
rhos.forEach(x => { const k = x.toFixed(3); uniq[k] = (uniq[k]||0)+1; });
console.log("\n乙 vs 甲的表面匹配分布:", uniq);

// 交叉匹配：乙档对上别人的甲档，最大能到多少
let cross = [];
for (let i = 0; i < 96; i++) {
  let best = 0, who = -1;
  for (let j = 0; j < 96; j++) {
    if (j === i) continue;
    const f = I.matchFrac(I.slotsOf(tr[i].B), I.slotsOf(tr[j].A));
    if (f > best) { best = f; who = j; }
  }
  cross.push(best);
}
cross.sort((a,b)=>b-a);
console.log("乙档对别人的甲档 最高5个:", cross.slice(0,5).map(x=>x.toFixed(3)).join(", "));
console.log("乙档对别人的甲档 ≥0.45 的组数:", cross.filter(x=>x>=0.45).length);

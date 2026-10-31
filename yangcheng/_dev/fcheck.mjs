import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../instruments/yc-forensic.js");

console.log("--- 单点 ---");
for (const c of [0, 0.25, 0.5, 0.75, 1]) {
  const r = F.runAudit({ seed: 20261029, coupling: c, nInst: 160, boot: 300 });
  console.log(`c=${c}  chat=${r.est.chat}  ci=[${r.est.ci}]  pT=${r.est.pTreat} pC=${r.est.pCtrl} pP=${r.est.pPos} pN=${r.est.pNeg} power=${r.est.power}  -> ${r.verdict}`);
}

console.log("\n--- 自检 ---");
const sc = F.selfCheck({ nInst: 120 });
console.log("MAE=", sc.mae, " 覆盖率=", sc.coverage, " 耗时=", sc.ms, "ms");
console.log("判定分布=", sc.verdicts);
sc.rows.forEach(r => console.log(`  truth=${r.truth} seed=${r.seed} chat=${r.chat} ci=[${r.ci}] power=${r.power} pN=${r.pNeg} ${r.verdict}`));

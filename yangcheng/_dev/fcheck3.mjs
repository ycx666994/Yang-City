import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../instruments/yc-forensic.js");
const show = (t, r) => console.log(`${t.padEnd(24)} chat=${String(r.est.chat).padEnd(6)} pT=${r.est.pTreat} pC=${r.est.pCtrl} pP=${r.est.pPos} pN=${r.est.pNeg} pow=${r.est.power} -> ${r.verdict}`);
console.log("=== 输入迟钝度 flat ===");
for (const flat of [0, 0.3, 0.6, 0.8, 0.92]) {
  show(`flat=${flat} c=0.9`, F.runAudit({ seed: 20261029, coupling: 0.9, flat, nInst: 160, boot: 200 }));
}

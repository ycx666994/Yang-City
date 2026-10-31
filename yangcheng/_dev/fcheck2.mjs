import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../instruments/yc-forensic.js");

const show = (tag, r) => console.log(
  `${tag.padEnd(26)} chat=${String(r.est.chat).padEnd(6)} ci=${JSON.stringify(r.est.ci)} pT=${r.est.pTreat} pC=${r.est.pCtrl} pP=${r.est.pPos} pN=${r.est.pNeg} pow=${r.est.power} -> ${r.verdict}`);

console.log("=== 抖动对负控的污染 ===");
for (const temp of [0, 0.08, 0.18, 0.30]) {
  show(`temp=${temp} c=0.9`, F.runAudit({ seed: 20261029, coupling: 0.9, temp, nInst: 160, boot: 200 }));
}

console.log("\n=== 干预幅度不足 ===");
for (const mag of ["max", 2, 1]) {
  show(`mag=${mag} c=0.9`, F.runAudit({ seed: 20261029, coupling: 0.9, mag, nInst: 160, boot: 200 }));
}

console.log("\n=== 题数不够 ===");
for (const n of [40, 160, 400]) {
  show(`nInst=${n} c=0.9`, F.runAudit({ seed: 20261029, coupling: 0.9, nInst: n, boot: 200 }));
}

console.log("\n=== 高题数下边界判定 ===");
for (const c of [0, 0.25, 0.5, 0.75, 1]) {
  show(`c=${c} n=400`, F.runAudit({ seed: 20261029, coupling: c, nInst: 400, boot: 200 }));
}

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");

const r = C.runAudit({ seed: 20261030, mem: 0.9, rewrite: 0.45, n: 96, boot: 60 });
const hist = (key) => {
  const o = {};
  r.rows.forEach(x => { const k = x[key].rho.toFixed(3); o[k] = (o[k]||0)+1; });
  return o;
};
console.log("A 最佳匹配分布:", hist("A"));
console.log("B 最佳匹配分布:", hist("B"));
console.log("C 最佳匹配分布:", hist("C"));
const cRec = r.rows.filter(x => x.C.via === "recall");
console.log("C 回吐的题组:", cRec.map(x => `#${x.i} rho=${x.C.rho}`).join("  "));
console.log("rhoHit =", r.est.rhoHit.toFixed(3), " rhoDesign =", r.est.rhoBar.toFixed(3));
console.log("est:", JSON.stringify({accA:r.est.accA, accB:r.est.accB, accC:r.est.accC, R:r.est.R, R0:r.est.R0, k:r.est.kappa}));

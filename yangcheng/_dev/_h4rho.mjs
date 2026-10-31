import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../instruments/yc-contamination.js');
const f2=v=>v==null?"—":v.toFixed(2);
for (const w of [0.05,0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95]) {
  const r = C.runAudit({rewrite:w, mem:.95, n:96});
  console.log("w="+w.toFixed(2), "rho",f2(r.est.rhoBar), "eq", Math.round(r.est.eqRate*100)+"%", "k",f2(r.est.kappa), (r.verdict+"/"+r.subtype));
}
console.log("--- n effect at w=.45 ---");
for (const n of [24,48,60,96,144,240,400]) {
  const r = C.runAudit({rewrite:.45, mem:.95, n});
  console.log("n="+n, "k",f2(r.est.kappa), "ci",r.est.ci?f2(r.est.ci[0])+"-"+f2(r.est.ci[1]):"—", (r.verdict+"/"+r.subtype));
}
console.log("--- labelNoise at w=.45 n=96 ---");
for (const ln of [0,0.2,0.35,0.5,0.65,0.8]) {
  const r = C.runAudit({rewrite:.45, mem:.95, n:96, labelNoise:ln});
  console.log("ln="+ln, "accA",Math.round(r.est.accA*100)+"%","accC",Math.round(r.est.accC*100)+"%","k",f2(r.est.kappa), (r.verdict+"/"+r.subtype));
}

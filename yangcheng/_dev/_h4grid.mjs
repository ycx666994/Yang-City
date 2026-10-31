import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../instruments/yc-contamination.js');
const f2=v=>v==null?"—":v.toFixed(2);
const W=[0.15,0.30,0.45,0.60,0.80], N=[24,48,96,192,384];
console.log("== w regime at n=96, ln=0 ==");
for (const w of [0.26,0.28,0.30,0.32,0.34,0.78,0.80,0.82]) {
  const r=C.runAudit({rewrite:w,mem:.95,n:96,labelNoise:0});
  console.log("w="+w, "rho",f2(r.est.rhoBar),"eq",Math.round(r.est.eqRate*100)+"%",(r.verdict+"/"+r.subtype));
}
console.log("== ln=0.14 grid ==");
for (const n of N) for (const w of [0.30,0.45,0.60]) {
  const r=C.runAudit({rewrite:w,mem:.95,n,labelNoise:0.14});
  console.log(`n=${n} w=${w}`.padEnd(16), (r.verdict+"/"+r.subtype).padEnd(22),"k",f2(r.est.kappa),"ci",r.est.ci?f2(r.est.ci[0])+"-"+f2(r.est.ci[1]):"—","accA",Math.round(r.est.accA*100)+"%","accC",Math.round(r.est.accC*100)+"%");
}
console.log("== ln=0.35 grid ==");
for (const n of [96,192,384]) for (const w of [0.45,0.60]) {
  const r=C.runAudit({rewrite:w,mem:.95,n,labelNoise:0.35});
  console.log(`n=${n} w=${w}`.padEnd(16), (r.verdict+"/"+r.subtype).padEnd(22),"k",f2(r.est.kappa),"ci",r.est.ci?f2(r.est.ci[0])+"-"+f2(r.est.ci[1]):"—");
}

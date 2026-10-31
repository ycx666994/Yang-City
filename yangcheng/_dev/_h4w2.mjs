import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../instruments/yc-contamination.js');
const f2=v=>v==null?"—":v.toFixed(2);
for (const w of [0.60,0.85,0.88,0.90,0.92]) {
  const r = C.runAudit({rewrite:w, mem:.95, n:96, labelNoise:0.14});
  console.log("w="+w, "rho",f2(r.est.rhoBar), "eq",Math.round(r.est.eqRate*100)+"%", (r.verdict+"/"+r.subtype), "greens", r.guards.filter(g=>g.ok).length+"/"+r.guards.length);
}

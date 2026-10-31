import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../instruments/yc-contamination.js');
const pct=v=>v==null?"—":Math.round(v*100)+"%";
const f2=v=>v==null?"—":v.toFixed(2);
function show(t,r){console.log(t.padEnd(30), (r.verdict+"/"+r.subtype).padEnd(24), "accA",pct(r.est.accA),"accC",pct(r.est.accC),"k",f2(r.est.kappa),"ci",r.est.ci?f2(r.est.ci[0])+"-"+f2(r.est.ci[1]):"—");}
console.log("== label noise sweep ==");
for (const ln of [0.6,0.7,0.8,0.9]) for (const mem of [0.95,0.85]) show(`ln=${ln} mem=${mem}`, C.runAudit({mem,labelNoise:ln,rewrite:.45,n:160}));
console.log("== straddle: small n ==");
for (const n of [30,36,44,60]) for (const mem of [0.7,0.8,0.9]) show(`n=${n} mem=${mem}`, C.runAudit({mem,n,rewrite:.45,seed:771}));
console.log("== same seed large n ==");
for (const mem of [0.7,0.8,0.9]) show(`n=240 mem=${mem}`, C.runAudit({mem,n:240,rewrite:.45,seed:771}));

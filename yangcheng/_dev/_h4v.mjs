import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../instruments/yc-contamination.js');
function pct(v){return v==null?"—":Math.round(v*100)+"%";}
function f2(v){return v==null?"—":v.toFixed(2);}
const g=(r,id)=>r.guards.find(x=>x.id===id);
function show(t,r){console.log(t.padEnd(28), r.verdict+"/"+r.subtype, "| accA",pct(r.est.accA),"accB",pct(r.est.accB),"accC",pct(r.est.accC), "| R",pct(r.est.R),"R0",pct(r.est.R0),"k",f2(r.est.kappa), "| rho",f2(r.est.rhoBar), "| eq",pct(r.est.eqRate), "| ci", r.est.ci?f2(r.est.ci[0])+"-"+f2(r.est.ci[1]):"—");}
show("base", C.runAudit({mem:.95,rewrite:.45,n:120}));
show("rewrite .03", C.runAudit({rewrite:.03,mem:.95,n:120}));
show("rewrite .92", C.runAudit({rewrite:.92,mem:.95,n:120}));
show("labelNoise .55", C.runAudit({mem:.95,labelNoise:.55,rewrite:.45,n:120}));
show("refMem .95", C.runAudit({refMem:.95,mem:.95,n:120}));
show("n=32 mem .6", C.runAudit({mem:.6,n:32,rewrite:.45,seed:771}));
show("n=240 mem .6", C.runAudit({mem:.6,n:240,rewrite:.45,seed:771}));
show("mem 0", C.runAudit({mem:0,rewrite:.45}));
show("n=30 mem .6", C.runAudit({mem:.6,n:30}));
console.log("--- guards cold/warm ---");
console.log("cold refcold", g(C.runAudit({refMem:0,mem:.95,n:120}),'refcold'));
console.log("warm refcold", g(C.runAudit({refMem:.95,mem:.95,n:120}),'refcold'));
console.log("--- verdict spread ---");
const cases=[["正常",{mem:.95}],["无优势",{mem:0,rewrite:.45}],["探针断",{rewrite:.92}],["标签污",{mem:.95,labelNoise:.55}],["小样本",{mem:.6,n:30}]];
const seen={}; cases.forEach(c=>{const r=C.runAudit(c[1]); seen[r.verdict+"/"+r.subtype]=1;});
console.log(Object.keys(seen));

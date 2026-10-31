import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../instruments/yc-dome.js');
const p=v=>(v*100).toFixed(1)+"%";
console.log("DEFAULTS", JSON.stringify(D.DEFAULTS), "LADDER", JSON.stringify(D.LADDER));
const w = D.world({});
console.log("world", JSON.stringify({total:w.total,nReach:w.nReach,nVoid:w.nVoid}));
for (const tau of [0.8,1.0,1.6,2.2,2.6]) {
  const row=[];
  for (const k of [1,4,8,16,32,64,128,256]) {
    const r=D.run({world:w,k,tau});
    row.push(`k${k}: pass ${p(r.pass)} vote ${p(r.vote)} nEff ${r.nEff.toFixed(1)} leak ${r.leak.toFixed(2)} near ${p(r.nearOnly)} cold ${p(r.cold)} voidHit ${p(r.voidHit)}`);
  }
  console.log("== tau",tau, (D.run({world:w,k:32,tau}).verdict+"/"+D.run({world:w,k:32,tau}).subtype));
  row.forEach(x=>console.log("  "+x));
}
console.log("ceiling", p(D.run({world:w,k:32}).ceiling), "unreach", p(D.run({world:w,k:32}).unreachable));

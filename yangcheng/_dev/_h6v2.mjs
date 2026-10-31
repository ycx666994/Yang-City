import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../instruments/yc-dome.js');
const w = D.world({});
const p=v=>(v*100).toFixed(1);
console.log("k\\tau  1.0            1.3            1.6            1.9");
for (const k of [1,2,4,8,16,32,64,128,256]) {
  let line = String(k).padEnd(5);
  for (const tau of [1.0,1.3,1.6,1.9]) {
    const r=D.run({world:w,k,tau});
    line += ` p${p(r.pass)} v${p(r.vote)} e${r.nEff.toFixed(1)}  `;
  }
  console.log(line);
}
console.log("\ndeficit at tau1.6:", [16,32,64,128].map(k=>{const r=D.run({world:w,k,tau:1.6});return k+":"+p(r.pass-r.vote)}).join(" "));
console.log("voidHit all:", [1,8,32,128].map(k=>{const r=D.run({world:w,k,tau:1.0});return k+":"+p(r.voidHit)}).join(" "));

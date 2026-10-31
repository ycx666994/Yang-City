import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const pct=v=>v==null?"—":(v*100).toFixed(1)+"%";
const f2=v=>v==null?"—":(+v).toFixed(2);
console.log("== alpha 0 vs 0.5 (平滑伪造) ==");
for (const a of [0,0.5]) {
  const r=G.run({alpha:a});
  console.log("alpha="+a, r.verdict+"/"+r.subtype, "wilted",JSON.stringify(r.wiltedLayers), "est.deaths",JSON.stringify(r.est.deaths), "retG",JSON.stringify(r.est.layerRetG.map(x=>+x.toFixed(2))), "covG",JSON.stringify(r.est.layerCovG.map(x=>+x.toFixed(3))));
}
console.log("== rho sweep ==");
for (const rho of [0,0.02,0.05,0.15,0.30,0.60,1.0]) {
  const r=G.run({rho});
  console.log("rho="+rho, (r.verdict+"/"+r.subtype).padEnd(22), "wiltFrac",pct(r.est.wiltFrac), "wilted",JSON.stringify(r.wiltedLayers), "blind",JSON.stringify(r.blindLayers));
}
console.log("== N sweep ==");
for (const N of [100,400,3200]) {
  const r=G.run({N});
  console.log("N="+N, (r.verdict+"/"+r.subtype).padEnd(22), "wiltFrac",pct(r.est.wiltFrac), "wilted",JSON.stringify(r.wiltedLayers), "blind",JSON.stringify(r.blindLayers), "keepG",JSON.stringify(r.est.keepG.map(x=>+x.toFixed(2))));
}
console.log("== decompose ==");
const d=G.decompose({});
console.log(JSON.stringify(d,null,1).slice(0,1500));

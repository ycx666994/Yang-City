import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const rounds=[
 {id:1, o:{rho:0.05,N:400,G:24,lines:16,seed:20311030}, k:10},
 {id:2, o:{rho:0.30,N:400,G:24,lines:16,seed:20311030}, k:8},
 {id:3, o:{rho:0.02,N:400,G:24,lines:16,seed:20311030}, k:6},
];
for (const R of rounds){
  const r=G.run(R.o);
  console.log("== R"+R.id, JSON.stringify(R.o), "k="+R.k, (r.verdict+"/"+r.subtype));
  console.log(" fate", JSON.stringify(r.fate));
  for (let g=0; g<R.k; g++){
    console.log("  gen"+(g+1), JSON.stringify(r.byGen[g].cov.map(v=>+v.toFixed(2))));
  }
  // 诊断：加预算
  const hi=G.run({...R.o, N:R.o.N*8});
  console.log("  +预算 blind", r.blindLayers.length, "->", hi.blindLayers.length, "fate", JSON.stringify(hi.fate));
  // 诊断：拉窗口
  const lg=G.run({...R.o, G:R.o.G*3});
  console.log("  +窗口", (lg.verdict+"/"+lg.subtype), "wilted", lg.wiltedLayers.length, "blind", lg.blindLayers.length, "fate", JSON.stringify(lg.fate));
}

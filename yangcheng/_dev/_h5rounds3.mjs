import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const rounds=[
 {id:1, o:{rho:0.05,N:400,G:24,lines:16,seed:20311030}, k:10},
 {id:2, o:{rho:0.30,N:3200,G:24,lines:16,seed:20311030}, k:8},
 {id:3, o:{rho:0.02,N:100,G:24,lines:16,seed:20311030}, k:6},
];
for (const R of rounds){
  const r=G.run(R.o);
  console.log("== R"+R.id, JSON.stringify(R.o), "k="+R.k, (r.verdict+"/"+r.subtype), "blind",JSON.stringify(r.blindLayers));
  console.log(" fate", JSON.stringify(r.fate));
  for (let g=0; g<R.k; g++) console.log("  g"+(g+1), JSON.stringify(r.byGen[g].cov.map(v=>+v.toFixed(2))));
  const hi=G.run({...R.o, N:R.o.N*8});
  console.log("  +N blind", r.blindLayers.length, "->", hi.blindLayers.length, "fate", JSON.stringify(hi.fate));
  const lg=G.run({...R.o, G:R.o.G*3});
  console.log("  +G", (lg.verdict+"/"+lg.subtype), "fate", JSON.stringify(lg.fate));
}

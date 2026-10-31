import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const pct=v=>(v*100).toFixed(0)+"%";
const R=[
 {name:"R1", o:{rho:0.05,N:400,G:24,lines:16,seed:20311030}},
 {name:"R2", o:{rho:0.30,N:400,G:24,lines:16,seed:20311030}},
 {name:"R3", o:{rho:0.02,N:100,G:24,lines:16,seed:20311030}},
 {name:"R4", o:{rho:0.0,N:400,G:24,lines:16,seed:20311030}},
 {name:"R5", o:{rho:0.05,N:3200,G:24,lines:16,seed:20311030}},
 {name:"R6", o:{rho:0.15,N:400,G:24,lines:16,seed:20311030}},
];
for (const r of R){
  const x=G.run(r.o);
  console.log(r.name, JSON.stringify(r.o), (x.verdict+"/"+x.subtype).padEnd(20),
    "alive",JSON.stringify(x.aliveLayers),"wilted",JSON.stringify(x.wiltedLayers),"blind",JSON.stringify(x.blindLayers),
    "covG",JSON.stringify(x.est.layerCovG.map(v=>+v.toFixed(2))));
  console.log("   fate", JSON.stringify(x.fate));
}

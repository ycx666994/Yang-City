import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const r=G.run({});
for (const L of [3,4,5]) {
  console.log("layer",L,"cov",JSON.stringify(r.byGen.map(b=>+b.cov[L].toFixed(2))));
  console.log("layer",L,"ret",JSON.stringify(r.byGen.map(b=>+b.ret[L].toFixed(2))));
}
console.log("keepG",JSON.stringify(r.est.keepG.map(v=>+v.toFixed(3))));
console.log("cov1 med",JSON.stringify(r.byGen[0].cov.map(v=>+v.toFixed(2))));
// 回光返照统计
function stats(rho){
  const x=G.run({rho});
  let first=0,sust=0,gap=[];
  for (const ln of x.lines){
    const gs=ln.gens, c1=gs[0].cov;
    for (let L=0;L<8;L++){
      if (c1[L] < 0.5) continue;
      let f=-1,last=-1;
      for (let g=0;g<gs.length;g++){
        if (gs[g].cov[L] < 0.5*c1[L] && f<0) f=g;
        if (gs[g].cov[L] >= 0.5*c1[L]) last=g;
      }
      if (f>=0) first++;
      if (f>=0 && last>f) gap.push(last-f);
      if (f>=0 && last<gs.length-1) sust++;
    }
  }
  console.log("rho="+rho, "首次跌破处数",first,"持续枯萎处数",sust,"平均早报",gap.length?(gap.reduce((a,b)=>a+b,0)/gap.length).toFixed(1):"—");
}
[0.05,0.02,0.30].forEach(stats);
console.log("alpha .5 retG",JSON.stringify(G.run({alpha:.5}).est.layerRetG.map(v=>+v.toFixed(2))));
console.log("alpha 0 retG",JSON.stringify(G.run({alpha:0}).est.layerRetG.map(v=>+v.toFixed(2))));

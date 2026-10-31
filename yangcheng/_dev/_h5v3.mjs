import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('../instruments/yc-greenhouse.js');
const r=G.run({rho:0.05});
console.log("lines[0] keys", Object.keys(r.lines[0]));
console.log("lines[0].gens len", r.lines[0].gens.length, JSON.stringify(r.lines[0].gens[0]).slice(0,260));
console.log("est.deaths", JSON.stringify(r.est.deaths));
// 找一条：某层先跌破 0.5 又回涨
let found=[];
for (let li=0; li<r.lines.length; li++){
  const gs=r.lines[li].gens;
  const cov1=gs[0].cov;
  for (let L=0; L<8; L++){
    if (!cov1[L]) continue;
    let first=-1;
    for (let g=0; g<gs.length; g++){ if (gs[g].cov[L] < 0.5*cov1[L]) { first=g; break; } }
    if (first<0) continue;
    // 是否后来回涨到阈值以上
    let back=-1;
    for (let g=first+1; g<gs.length; g++){ if (gs[g].cov[L] >= 0.5*cov1[L]) { back=g; break; } }
    if (back>0) found.push({line:li, layer:L, first:first+1, back:back+1,
      covs: gs.map(x=>+x.cov[L].toFixed(2))});
  }
}
console.log("回光返照 cases:", found.length);
console.log(JSON.stringify(found.slice(0,3),null,1));

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../instruments/yc-greenhouse.js");

function f(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d) : "—"; }
function pct(x) { return Number.isFinite(x) ? (x * 100).toFixed(0) + "%" : "—"; }

console.log("== 世界 ==");
const p0 = G.world();
const L = G.layerMap(p0), LM = G.layerMass(p0, L), BC = G.layerBins(L);
console.log("K =", G.K, " max p =", f(Math.max(...p0), 4), " min p =", f(Math.min(...p0), 5));
console.log("层质量:", LM.map(x => f(x, 4)).join("  "));
console.log("层仓数:", BC.join("  "));

function dump(tag, opt) {
  const r = G.run(opt);
  console.log("\n== " + tag + " ==");
  console.log("参数 ρ=" + r.meta.rho, "N=" + r.meta.N, "G=" + r.meta.G, "lines=" + r.meta.lines, "耗时", r.ms.toFixed(0) + "ms");
  console.log("结论:", r.verdict + "/" + r.subtype, " 枯萎率", pct(r.est.wiltFrac));
  console.log("可见层", r.judgeable.map(x => x + 1), " 看不见", r.blind.map(x => x + 1));
  console.log("归宿", r.fate.map((x, i) => (i + 1) + ":" + x).join(" "));
  console.log("枯:", r.wiltedLayers.map(x => x + 1), " 活:", r.aliveLayers.map(x => x + 1), " 盲:", r.blindLayers.map(x => x + 1));
  console.log("死亡世代 中位", r.est.medDeath, "区间", r.est.deathMin, "—", r.est.deathMax, "死亡数", r.est.deaths.length);
  console.log("TV 保真", f(r.est.fid0), "→", f(r.est.fidG), "  有效仓", f(r.est.H0, 1), "→", f(r.est.HG, 1));
  console.log("逐代 surv:", r.byGen.map(b => b.surv.toFixed(2)).join(" "));
  console.log("覆盖率矩阵（行=层，列=代）:");
  for (let l = 0; l < G.NL; l++) {
    console.log("  层" + (l + 1) + " " + r.byGen.map(b => b.cov[l].toFixed(2)).join(" "));
  }
  console.log("why:", r.why);
  if (r.note) console.log("note:", r.note);
  return r;
}

dump("默认", {});

console.log("\n== ρ × N 网格（G=24, 12 条）==");
const grid = [0, 0.02, 0.05, 0.1, 0.2];
for (const N of [300, 400, 800, 2000]) {
  const row = [];
  for (const rho of grid) {
    const r = G.run({ rho, N, G: 24, lines: 12 });
    row.push("ρ" + rho + ":" + pct(r.est.wiltFrac).padStart(4) + "/" + r.verdict[0] + r.subtype[0]);
  }
  console.log("  N=" + String(N).padStart(4), row.join("  "));
}

console.log("\n== ρ 扫描（默认 N/G）==");
let t = Date.now();
const sw = G.sweepRho({});
console.log("耗时", Date.now() - t, "ms  临界 ρ* =", sw.crit === null ? "未找到" : f(sw.crit, 3));
sw.points.forEach(p => console.log("  ρ=" + p.rho.toFixed(2), "枯萎=" + pct(1 - p.surv),
  "枯层=" + p.wilted, "盲层=" + p.blind, "活层=" + p.alive, p.verdict + "/" + p.subtype));

console.log("\n== N 扫描（第 1 代）==");
t = Date.now();
const sn = G.sweepN({});
console.log("耗时", Date.now() - t, "ms");
sn.points.forEach(p => console.log("  N=" + String(p.N).padStart(6), "可见=" + p.visible,
  "cov:", p.cov.map(x => x.toFixed(2)).join(" ")));

console.log("\n== 自检 ==");
t = Date.now();
const sc = G.selfCheck();
console.log("耗时", Date.now() - t, "ms  allPass =", sc.allPass);
sc.rows.forEach(x => console.log(" ", x.pass ? "PASS" : "FAIL", x.label, "→", x.got, "（要求", x.want + "）"));

console.log("\n== 负例 ==");
t = Date.now();
const ng = G.negatives();
console.log("耗时", Date.now() - t, "ms");
ng.forEach(x => console.log(" ", x.pass ? "PASS" : "FAIL", x.label, "→", x.got, "（要求", x.want + "）"));

console.log("\n== 归因分解 ==");
t = Date.now();
const dc = G.decompose({});
console.log("耗时", Date.now() - t, "ms  →", dc.verdict, "hit", dc.hit + "/3");
dc.preds.forEach(p => console.log(" ", p.ok ? "PASS" : "FAIL", p.text, "→", p.got));
console.log(" ", dc.text);

console.log("\n== 同 seed 反事实 ==");
const cf = G.counterfactual({ rho: 0.15 });
console.log(" ρ=0   首次枯萎第", cf.zero.line.deathGen, "代  末代 cov", cf.zero.line.final.cov.map(x => x.toFixed(2)).join(" "));
console.log(" ρ=0.15 首次枯萎第", cf.mix.line.deathGen, "代  末代 cov", cf.mix.line.final.cov.map(x => x.toFixed(2)).join(" "));

import fs from "fs";
const src = fs.readFileSync("instruments/yc-metrics.js", "utf8");
global.window = {};
new Function("window", src)(global.window);
const M = global.window.YCMetrics;

const w = M.makeWorld(1001, { budget: 120 });
console.log("房间：");
w.rooms.forEach(r => console.log(
  `  #${r.i} dirt0=${r.dirt0.toFixed(2)} frag=${r.frag.toFixed(2)} tail=${r.tail} w=${r.w}`));

console.log("\nθ 扫描（power=2.2 固定，看 dwell 的响应）：");
for (const dw of [1, 1.5, 2, 2.5, 3, 4, 5, 6]) {
  // 反解 u：power = 0.4 + u2*1.8 = 2.2 → u2 = 1；dwell = 1 + u1*5.2 → u1 = (dw-1)/5.2
  const u = [0, (dw - 1) / 5.2, 1];
  const ep = M.runEpisode(w, u, 11, null);
  const ins = M.inspect(ep.world, 4011);
  console.log(`  dwell=${dw.toFixed(1)}  P=${ep.P.toFixed(1)}  T=${ins.T.toFixed(3)}  clean=${ins.clean.toFixed(3)} wear=${ins.wear.toFixed(3)} vacs=${ep.vacs} wasted=${ep.wasted}`);
}

console.log("\n功率扫描（dwell=4 固定）：");
for (const pw of [0.4, 0.8, 1.2, 1.6, 2.0, 2.2]) {
  const u = [0, 3 / 5.2, (pw - 0.4) / 1.8];
  const ep = M.runEpisode(w, u, 11, null);
  const ins = M.inspect(ep.world, 4011);
  console.log(`  power=${pw.toFixed(1)}  P=${ep.P.toFixed(1)}  T=${ins.T.toFixed(3)}  clean=${ins.clean.toFixed(3)} wear=${ins.wear.toFixed(3)} vacs=${ep.vacs} wasted=${ep.wasted}`);
}

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");
for (const mem of [0.2, 0.45, 0.7, 0.9, 1]) {
  const r = C.runAudit({ seed: 20261030, mem, rewrite: 0.45, n: 96, boot: 40 });
  const recB = r.rows.filter(x => x.B.via === "recall").length;
  const recA = r.rows.filter(x => x.A.via === "recall").length;
  const recC = r.rows.filter(x => x.C.via === "recall").length;
  console.log(`mem=${mem}  表内=${r.meta.retained}/96 (${(r.meta.retained/96).toFixed(3)})  A回吐=${recA}  B回吐=${recB}  C回吐=${recC}  κ̂=${r.est.kappa?.toFixed(3)}`);
}

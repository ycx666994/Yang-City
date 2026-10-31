import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../instruments/yc-contamination.js");
console.log("保留率实测（每格 96 组）：");
for (const seed of [20261030, 771, 1931, 4049, 7777]) {
  const out = [];
  for (const mem of [0.25, 0.5, 0.75]) {
    const r = C.runAudit({ seed, mem, n: 96, boot: 20 });
    out.push(`${mem}->${(r.meta.retained/96).toFixed(3)}`);
  }
  console.log(`  seed=${seed}: ${out.join("  ")}`);
}

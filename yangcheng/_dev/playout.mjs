import fs from "fs";
const src = fs.readFileSync("shared/yc-districts.js", "utf8");
const win = {};
new Function("window", "globalThis", src)(win);
const D = win.YC_DISTRICTS;
let bad = 0;
for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) {
  const a = D[i], b = D[j];
  const ox = Math.min(a.cx + a.hx, b.cx + b.hx) - Math.max(a.cx - a.hx, b.cx - b.hx);
  const oz = Math.min(a.cz + a.hz, b.cz + b.hz) - Math.max(a.cz - a.hz, b.cz - b.hz);
  if (ox > 0 && oz > 0) { console.log("OVERLAP", a.id, b.id, "x" + Math.round(ox), "z" + Math.round(oz)); bad++; }
  else if (ox > -70 && oz > -70) console.log("TIGHT  ", a.id, b.id, "x" + Math.round(ox), "z" + Math.round(oz));
}
let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
D.forEach(d => { x0 = Math.min(x0, d.cx - d.hx); x1 = Math.max(x1, d.cx + d.hx); z0 = Math.min(z0, d.cz - d.hz); z1 = Math.max(z1, d.cz + d.hz); });
console.log("bounds", x0, x1, z0, z1, "size", x1 - x0, z1 - z0, "overlaps", bad);
// 每行/每列的片区
const rows = {};
D.forEach(d => { const k = d.cz; (rows[k] = rows[k] || []).push(d.id + "@" + d.cx + "[" + (d.cx - d.hx) + "," + (d.cx + d.hx) + "]"); });
Object.keys(rows).sort((a, b) => a - b).forEach(k => console.log("z=" + k, rows[k].join("  ")));

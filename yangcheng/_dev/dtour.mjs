import fs from "fs";
const path = "D:/workbuddy-projects/2026-11-07-08-47-37/repo/yangcheng/shared/yc-district-plan.js";
const src = fs.readFileSync(path, "utf8");
const win = {};
new Function("window", "globalThis", src)(win);
const get = win.ycDistrictPlan;
for (let i = 1; i <= 17; i++) {
  const id = "D" + String(i).padStart(2, "0");
  const p = get({ id: id, R: 470, vibe: "core", minH: 20, maxH: 60 });
  console.log("\n===", id, "R=" + p.R, "grid=" + (p.grid && p.grid.type),
    "rings=" + (p.rings ? p.rings.length : 0), "avenues=" + (p.avenues ? p.avenues.length : 0),
    "plazas=" + (p.plazas ? p.plazas.length : 0), "hero=" + (p.hero ? p.hero.length : 0),
    "types=" + (p.types || []).map(function (t) { return t.t; }).join(","));
  (p.hero || []).forEach(function (h, k) {
    const nm = (h.sign && h.sign.name) || (h.brand && h.brand.name) || "";
    console.log("   ", String(k).padStart(2), (h.type || "?").padEnd(15),
      "x=" + Math.round(h.x), "z=" + Math.round(h.z), "w=" + Math.round(h.w || 0),
      "d=" + Math.round(h.d || 0), "h=" + Math.round(h.h || 0), nm);
  });
}

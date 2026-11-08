import fs from "fs";
const src = fs.readFileSync("shared/yc-district-plan.js", "utf8");
const win = {};
new Function("window", "globalThis", src)(win);
const get = win.ycDistrictPlan;
let tot = 0;
for (let i = 1; i <= 17; i++) {
  const id = "D" + String(i).padStart(2, "0");
  const p = get({ id, R: 470, vibe: "core", minH: 20, maxH: 60 });
  let mx = 0, mz = 0, mh = 0;
  (p.hero || []).forEach(h => {
    if (!isFinite(h.x) || !isFinite(h.z)) return;
    mx = Math.max(mx, Math.abs(h.x) + (h.w || 0) / 2);
    mz = Math.max(mz, Math.abs(h.z) + (h.d || 0) / 2);
    mh = Math.max(mh, h.h || 0);
  });
  const H = Math.ceil(Math.max(mx, mz) / 10) * 10;
  tot += (2 * H) * (2 * H);
  console.log(id, "R=" + p.R, "contentHx=" + Math.round(mx), "Hz=" + Math.round(mz), "plate=" + H, "ratio=" + (H / p.R).toFixed(2), "maxH=" + Math.round(mh));
}
console.log("plates area km2 =", (tot / 1e6).toFixed(2));

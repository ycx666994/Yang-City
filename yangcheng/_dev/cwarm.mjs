function rngRaw(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function rngWarm(seed, warm) {
  var r = rngRaw(seed);
  for (var i = 0; i < (warm || 32); i++) r();
  return r;
}
const seeds = [20261030 ^ 0x9e3779b9, 771 ^ 0x9e3779b9, 1931 ^ 0x9e3779b9];
console.log("前 96 个值里 < 0.2 的个数（期望 19.2）：");
for (const s of seeds) {
  const r = rngRaw(s >>> 0);
  let c = 0; for (let i = 0; i < 96; i++) if (r() < 0.2) c++;
  console.log(`  raw  seed=${(s>>>0)} -> ${c}`);
}
console.log("预热 32 次之后：");
for (const s of seeds) {
  const r = rngWarm(s >>> 0, 32);
  let c = 0; for (let i = 0; i < 96; i++) if (r() < 0.2) c++;
  console.log(`  warm seed=${(s>>>0)} -> ${c}`);
}
console.log("\n前 20 个值（raw）：");
const r2 = rngRaw(seeds[0] >>> 0);
console.log(Array.from({length: 20}, () => r2().toFixed(3)).join(" "));

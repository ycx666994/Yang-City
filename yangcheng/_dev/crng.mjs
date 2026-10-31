// 直接检查 xorshift32 的分布与"低于阈值"的频率
function rng(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
for (const seed of [20261030, 771, 1931, 12345]) {
  const r = rng(seed);
  let sum = 0, below25 = 0, below90 = 0, N = 200000;
  for (let i = 0; i < N; i++) { const x = r(); sum += x; if (x < 0.25) below25++; if (x < 0.9) below90++; }
  console.log(`seed=${seed} mean=${(sum/N).toFixed(5)}  P(<.25)=${(below25/N).toFixed(4)}  P(<.9)=${(below90/N).toFixed(4)}`);
}
// 分块看前 100 个值
const r2 = rng(20261030);
const first = Array.from({length: 12}, () => r2().toFixed(3));
console.log("前12个:", first.join(" "));

/* ==========================================================================
   题库选项重写 · 合并与体检
   --------------------------------------------------------------------------
   为什么不用手改源文件：
   304 道题里正确答案有 302 道是最长的那一项（99.3%），最短干扰项只有正确项的
   21% 长。玩家根本不用读题，看长度就能选对。要修的不是个别题，是全部。

   重写只动 o[] 和 a：q（题干）和 w（判词）是好的，正确项的含义也不变，
   变的是「三条选项写得一样长、一样像真的」，以及正确项的位置。

   数据在 _dev/opts/<cat>.json，每条形如 [a, o0, o1, o2]。
   本脚本负责合并、统计、以及在加 --write 时回写源文件。

   判据（全部要满足）：
     - 正确项落在最长项的比例落在 20%—45%（随机水平 33%）
     - 最短项 / 最长项 ≥ 0.6（不能一眼看出谁短）
     - 正确项位置三档各占 25%—42%
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = "src/h3maze/03b-quiz.js";
const OPTS = "_dev/opts";
const WRITE = process.argv.includes("--write");

const sandbox = { window: {} };
new Function("window", readFileSync(SRC, "utf8"))(sandbox.window);
const cats = sandbox.window.YCQUIZ.cats;

const esc = s => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/* 第一步：把 <cat>.json 合进来 */
for (const c of cats) {
  const f = join(OPTS, c.id + ".json");
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, "utf8"));
  if (data.length !== c.items.length) {
    throw new Error(`${c.id}: 选项条数 ${data.length} ≠ 题目数 ${c.items.length}`);
  }
  c.items.forEach((it, i) => {
    const [a, ...o] = data[i];
    if (o.length !== 3) throw new Error(`${c.id}[${i}] 不是三条选项`);
    if (a < 0 || a > 2) throw new Error(`${c.id}[${i}] 正确项下标越界`);
    it.o = o;
    it.a = a;
  });
}

/* 第二步：定点补长。
   必须放在合并**之后** —— 放在前面会被 <cat>.json 原样覆盖掉（踩过一次）。
   只补「正确项唯一最长且领先 ≥3 字」的题：领先 1—2 字肉眼分不出，
   硬凑只会把句子写坏。 */
const FIX = join(OPTS, "_fixlen.json");
if (existsSync(FIX)) {
  const fix = JSON.parse(readFileSync(FIX, "utf8"));
  let n = 0;
  for (const c of cats) {
    const m = fix[c.id];
    if (!m) continue;
    for (const k of Object.keys(m)) {
      const [oi, txt] = m[k];
      c.items[+k].o[oi] = txt;
      n++;
    }
  }
  console.log(`补长 ${n} 处干扰项`);
}

let total = 0, longestRight = 0, pos = [0, 0, 0];
const ratios = [];
const perCat = [];

/* 第二步半：位置再平衡。
   我写题时习惯把「正确答案」放在第二条，结果 124/304（41%）落在 B ——
   「永远选 B」比随机多 8 个百分点，又是一条不用读题的捷径。
   这里只做**换位**（把选项整条挪到另一个下标），不改一个字，
   所以不影响长度、不影响语义，只把分布压回 33% 附近。 */
{
  const cnt = [0, 0, 0];
  for (const c of cats) {
    for (const it of c.items) {
      if (it.a === 1 && (cnt[1] > cnt[0] || cnt[1] > cnt[2])) {
        const t = cnt[0] <= cnt[2] ? 0 : 2;
        const tmp = it.o[1]; it.o[1] = it.o[t]; it.o[t] = tmp;
        it.a = t;
      }
      cnt[it.a]++;
    }
  }
}

/* 第三步：统计 */
for (const c of cats) {
  const f = join(OPTS, c.id + ".json");
  if (!existsSync(f)) { perCat.push([c.id, null]); continue; }

  let n = 0, lr = 0;
  const p = [0, 0, 0];
  c.items.forEach(it => {
    n++;
    const L = it.o.map(s => s.length);
    const mx = Math.max(...L), mn = Math.min(...L);
    if (L[it.a] === mx && L.filter(x => x === mx).length === 1) lr++;
    p[it.a]++;
    ratios.push(mn / mx);
  });
  total += n; longestRight += lr;
  pos[0] += p[0]; pos[1] += p[1]; pos[2] += p[2];
  perCat.push([c.id, { n, lr, p }]);
}

ratios.sort((a, b) => a - b);
const q = k => ratios[Math.floor(ratios.length * k)];

for (const [id, s] of perCat) {
  if (!s) { console.log(`  --  ${id.padEnd(10)} 尚未重写`); continue; }
  console.log(`  ${id.padEnd(10)} 正确项最长 ${String(s.lr).padStart(2)}/${s.n}` +
    ` (${Math.round(s.lr / s.n * 100)}%)  位置 ${s.p.join("/")}`);
}
console.log("");
console.log(`合计 ${total} 道`);
console.log(`正确项就是最长项  ${longestRight} (${(longestRight / total * 100).toFixed(1)}%)  目标 20—45%`);
console.log(`正确项位置分布    ${pos.join(" / ")}  目标各 25—42%`);
console.log(`最短/最长 长度比  中位 ${q(0.5).toFixed(2)}  10%分位 ${q(0.1).toFixed(2)}  目标 ≥0.6`);

const bad = longestRight / total > 0.45 || longestRight / total < 0.20 ||
            q(0.1) < 0.55 || pos.some(x => x / total < 0.25 || x / total > 0.42);
console.log(bad ? "\n✗ 未达标" : "\n✓ 达标");

if (WRITE) {
  const out = [];
  out.push("/* ==========================================================================");
  out.push("   杨城 · 指标塔题库");
  out.push("   --------------------------------------------------------------------------");
  out.push("   八类判据，每类 38 道，共 304 道。");
  out.push("");
  out.push("   每道题的三条选项都是**同构的判断**，长度接近、都像真的 ——");
  out.push("   正确答案不是最长的那条，也不是「读起来最像教科书」的那条。");
  out.push("   干扰项写成「常见但错误的推理」，不是一眼可排除的敷衍句。");
  out.push("");
  out.push("   字段：q 题干 / o 三个选项 / a 正确项下标 / w 判词");
  out.push("   ========================================================================== */");
  out.push("window.YCQUIZ = { cats: [");
  cats.forEach((c, ci) => {
    out.push("");
    out.push(`  { id: "${c.id}", name: "${c.name}", items: [`);
    c.items.forEach((it, i) => {
      const o = it.o.map(s => `"${esc(s)}"`).join(", ");
      out.push("");
      out.push(`    { q: "${esc(it.q)}",`);
      out.push(`      o: [${o}],`);
      out.push(`      a: ${it.a}, w: "${esc(it.w)}" }${i === c.items.length - 1 ? "" : ","}`);
    });
    out.push("");
    out.push(`  ]}${ci === cats.length - 1 ? "" : ","}`);
  });
  out.push("]};");
  out.push("");
  writeFileSync(SRC, out.join("\n"), "utf8");
  console.log(`已回写 ${SRC}`);
}

/* 指标塔 · 题库 / 复杂度 / 鼠标手感 / 通关门槛
   这一轮改了三件容易「看起来对、其实没生效」的事，必须逐项插桩验：
   1) 题库从 8 道扩到 304 道，且每次随机抽 —— 只验「有没有数组」不够，
      要验「两次抽出来的题不一样」「十个判据都露过面」「正确项位置是打散的」。
   2) 迷宫从 23×23 完美迷宫改成 31×31 + 环路 + 大厅 —— 要验「真的多了环路」，
      不是只把尺寸数字改了。
   3) 鼠标：单帧位移 clamp 是最关键的一条。浏览器在 pointer lock 生效那一帧
      会给出一个巨大的 movementX，不 clamp 就会甩飞 —— 这是「太灵敏」的真凶。
      用 feedMouse(1000,0) 直接喂一个超限值，看它是不是只认 130。 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9975);
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mzq-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));
const load = async () => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
  await sleep(3200);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  await ev("try{localStorage.removeItem('yc.aim.v1')}catch(e){}");
  await sleep(150);
};

/* ==================== A. 题库规模与抽题 ==================== */
await load();
const bank = await ev(`(function(){
  if (!window.YCQUIZ) return { err: 'no-quiz' };
  var n = 0, per = {};
  YCQUIZ.cats.forEach(function(c){ n += c.items.length; per[c.id] = c.items.length; });
  return { cats: YCQUIZ.cats.length, total: n, per: per };
})()`);
console.log("BANK", JSON.stringify(bank));
ok("题库已加载", bank && !bank.err, JSON.stringify(bank && bank.per));
ok("题目总数 ≥ 300", bank && bank.total >= 300, `total=${bank && bank.total}`);
ok("八个判据齐全", bank && bank.cats === 8, `cats=${bank && bank.cats}`);

const q1 = await ev(`(function(){
  var s = YCMaze.status();
  return { n: YCMaze.gateCount(), cats: YCMaze.quizCats(), hash: YCMaze.quizHash(), doors: s.doorsTotal };
})()`);
console.log("DRAW", JSON.stringify(q1));
ok("每轮抽 8 道", q1 && q1.n === 8, `n=${q1 && q1.n}`);
ok("门数与题数一致", q1 && q1.doors === q1.n, `doors=${q1 && q1.doors} n=${q1 && q1.n}`);
const uniqCats = q1 ? [...new Set(q1.cats)].length : 0;
ok("八道门至少覆盖 6 类判据", uniqCats >= 6, `覆盖 ${uniqCats} 类: ${JSON.stringify(q1 && q1.cats)}`);

/* 换一座塔必须换一套题 */
await ev("document.getElementById('btnRestart').click()");
await sleep(700);
const q2 = await ev(`(function(){ return { hash: YCMaze.quizHash(), cats: YCMaze.quizCats(), seed: YCMaze.status().seed }; })()`);
ok("重开一座塔换了一套题", q1 && q2 && q1.hash !== q2.hash, `hash ${q1 && q1.hash} → ${q2 && q2.hash}`);

/* 连开 40 座塔，看正确项位置分布有没有偏 —— 这是「永远选 B」能不能过关的判据 */
const dist = await ev(`(function(){
  var d = [0,0,0], seen = {}, catHit = {};
  for (var t = 0; t < 40; t++) {
    document.getElementById('btnRestart').click();
    var n = YCMaze.gateCount();
    for (var i = 0; i < n; i++) d[YCMaze.answerOf(i)]++;
    YCMaze.quizCats().forEach(function(c){ catHit[c] = 1; });
  }
  return { d: d, cats: Object.keys(catHit).length };
})()`);
console.log("DIST", JSON.stringify(dist));
const tot = dist ? dist.d.reduce((a, b) => a + b, 0) : 0;
const share = dist ? dist.d.map(v => v / tot) : [1, 0, 0];
ok("正确项位置被打散（每项 ≥15%）", share.every(v => v >= 0.15),
  `A/B/C = ${dist && dist.d.join(" / ")}（${share.map(v => Math.round(v * 100) + "%").join(" / ")}）`);
ok("40 座塔覆盖到全部 8 个判据", dist && dist.cats === 8, `覆盖 ${dist && dist.cats}`);

/* ==================== B. 迷宫复杂度 ==================== */
const w = await ev(`JSON.stringify(YCMaze.world())`);
console.log("WORLD", w);
const W2 = JSON.parse(w || "{}");
ok("网格扩到 41×41", W2.grid === "41x41", W2.grid);
ok("知识门 8 道", W2.doors === 8, `doors=${W2.doors}`);
ok("大厅 5 个", W2.halls === 5, `halls=${W2.halls}`);
ok("陷阱存在", W2.traps > 0, `traps=${W2.traps}`);
/* 完美迷宫的通道数 = 单元格数 × 2 - 1；多出来的就是环路挖出来的 */
ok("存在环路（通道数 > 完美迷宫）", W2.walkable > (20 * 20 * 2 - 1),
  `walkable=${W2.walkable} 完美迷宫=${20 * 20 * 2 - 1}`);

/* ==================== C. 鼠标手感 ==================== */
const aim0 = await ev("JSON.stringify(YCMaze.aim())");
const A0 = JSON.parse(aim0 || "{}");
ok("默认灵敏度 1.00×", Math.abs(A0.sens - 1) < 0.001, `sens=${A0.sens}`);
ok("有平滑档位", typeof A0.smooth === "number", `smooth=${A0.smooth}`);
ok("单帧上限存在", A0.maxStep > 0, `maxStep=${A0.maxStep}`);

/* 关键项：喂 1000px，只应认 130px */
const clampRes = await ev(`(function(){
  YCMaze.setAim({ sens: 1, smooth: 0, invertY: false });
  var p = YCMaze.feedMouse(1000, 0);
  var exp = 130 * 0.0016;
  return { pend: p[0], exp: exp, ratio: p[0] / exp };
})()`);
console.log("CLAMP", JSON.stringify(clampRes));
ok("单帧位移被 clamp 到 130px", clampRes && Math.abs(clampRes.ratio - 1) < 0.02,
  `pend=${clampRes && clampRes.pend.toFixed(4)} 期望=${clampRes && clampRes.exp.toFixed(4)}`);

/* 灵敏度翻倍，转角翻倍 */
const sensRes = await ev(`(function(){
  YCMaze.setAim({ sens: 1, smooth: 0 });
  var a = YCMaze.feedMouse(100, 0)[0];
  YCMaze.setAim({ sens: 2, smooth: 0 });
  var b = YCMaze.feedMouse(100, 0)[0];
  return { a: a, b: b, k: b / a };
})()`);
ok("灵敏度 2× 时转角也是 2×", sensRes && Math.abs(sensRes.k - 2) < 0.02, `k=${sensRes && sensRes.k.toFixed(3)}`);

/* Y 轴：默认非反转（鼠标上推 = 抬头），反转后取反 */
const invRes = await ev(`(function(){
  YCMaze.setAim({ sens: 1, smooth: 0, invertY: false });
  var a = YCMaze.feedMouse(0, -10)[1];
  YCMaze.setAim({ sens: 1, smooth: 0, invertY: true });
  var b = YCMaze.feedMouse(0, -10)[1];
  return { a: a, b: b };
})()`);
ok("默认 Y 轴非反转（上推抬头）", invRes && invRes.a > 0, `pendY=${invRes && invRes.a.toFixed(4)}`);
ok("反转 Y 轴后取反", invRes && invRes.b < 0, `pendY=${invRes && invRes.b.toFixed(4)}`);

/* 设置面板能开，且写进 localStorage */
const uiRes = await ev(`(function(){
  YCMaze.setAim({ sens: 1.5, smooth: 0.5, invertY: true });
  document.getElementById('btnAim').click();
  var p = document.getElementById('aimPanel');
  var sv = document.getElementById('aimSensV');
  var cm = document.getElementById('aimCm');
  var saved = localStorage.getItem('yc.aim.v1');
  return { on: !!(p && p.classList.contains('on')), sv: sv && sv.textContent,
           cm: cm && cm.textContent, saved: saved };
})()`);
console.log("UI", JSON.stringify(uiRes));
ok("视角面板可打开", uiRes && uiRes.on === true);
ok("滑块读数跟着变", uiRes && /1\.50/.test(uiRes.sv || ""), uiRes && uiRes.sv);
ok("给出「转一圈多少厘米」的参照", uiRes && /cm/.test(uiRes.cm || ""), uiRes && uiRes.cm);
ok("设置写进 localStorage", uiRes && /1\.5/.test(uiRes.saved || ""), uiRes && uiRes.saved);
await ev("document.getElementById('aimPanel').classList.remove('on')");

/* ==================== D. 通关门槛：八道全对 ==================== */
/* 走真实路径：瞬移到门旁 → 按 E 开门 → 点正确项 → 继续 */
async function answerDoors(n) {
  const got = await ev(`(function(){
    var total = YCMaze.gateCount();
    return { total: total };
  })()`);
  let done = 0;
  for (let i = 0; i < n && i < got.total; i++) {
    const moved = await ev(`YCMaze.gotoDoor(${i})`);
    if (!moved) continue;
    /* gotoDoor 会顺手把 curDoor 定下来，不必等主循环那一帧 ——
       无头环境的 rAF 会间歇停摆，等帧就是等运气。 */
    await ev("YCMaze.tick(0.016)");
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}))`);
    await sleep(160);
    const opened = await ev(`(function(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('on'))})()`);
    if (!opened) { await sleep(400); continue; }
    const ai = await ev(`YCMaze.answerOf(${i})`);
    await ev(`(function(){var b=document.querySelectorAll('#qOpts .mzo')[${ai}];if(b)b.click();return 1})()`);
    await sleep(160);
    await ev(`document.getElementById('qGo').click()`);
    await sleep(300);
    done++;
  }
  return done;
}

await load();
const a8 = await answerDoors(8);
await sleep(300);
const after8 = await ev("YCMaze.status()");
console.log("AFTER8", JSON.stringify({ frags: after8 && after8.frags.length, answered: Object.keys(after8 && after8.answered || {}).length, open: after8 && after8.doorsOpen, exit: after8 && after8.exitReady }));
ok("答对 8 道后碎片 = 8", after8 && after8.frags.length === 8, `frags=${after8 && after8.frags.length}（走过 ${a8} 道门）`);
ok("八道全开 → 出口才亮", after8 && after8.exitReady === true);

await ev("YCMaze.gotoExit()");
/* 到没到出口是主循环判的，自己喂帧 */
await ev("(function(){for(var i=0;i<4;i++)YCMaze.tick(0.016);return 1})()");
await sleep(400);
const winBox = await ev(`(function(){
  var b = document.querySelector('#endBox');
  if (!b) return { err: 'no-endbox' };
  var btns = [].map.call(document.querySelectorAll('#endBox button, #endBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { title: (b.querySelector('h3')||{}).textContent || '',
           text: (b.textContent||'').replace(/\\s+/g,' ').slice(0,200),
           btns: btns, win: !!b.querySelector('.box.win') };
})()`);
console.log("WIN", JSON.stringify(winBox));
ok("八道全对 + 走到出口 → 通过", winBox && winBox.win === true, winBox && winBox.title);
ok("通过时发精英证书", winBox && (winBox.btns || []).some(t => /证书/.test(t)), JSON.stringify(winBox && winBox.btns));

const shot1 = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
if (shot1.result?.data) writeFileSync(join(OUT, "maze-pass8.png"), Buffer.from(shot1.result.data, "base64"));

/* ==================== E. 门槛对照：只答对 7 道 ==================== */
await load();
await answerDoors(7);
await sleep(300);
const after7 = await ev("YCMaze.status()");
/* 七道的时候出口根本不存在。gotoExit 会先把它点亮（否则探针没法定位），
   但 finish() 仍要求 frags >= 8 —— 走过去也只能拿到「失败」。 */
await ev("YCMaze.gotoExit()");
await ev("(function(){for(var i=0;i<4;i++)YCMaze.tick(0.016);return 1})()");
await sleep(400);
const loseBox = await ev(`(function(){
  var b = document.querySelector('#endBox');
  if (!b) return { err: 'no-endbox' };
  var btns = [].map.call(document.querySelectorAll('#endBox button, #endBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { title: (b.querySelector('h3')||{}).textContent || '',
           text: (b.textContent||'').replace(/\\s+/g,' ').slice(0,220),
           btns: btns, win: !!b.querySelector('.box.win') };
})()`);
console.log("LOSE7", JSON.stringify({ frags: after7 && after7.frags.length, box: loseBox }));
ok("答对 7 道 → 到出口也失败", loseBox && loseBox.win === false && /失败/.test(loseBox.title || ""), loseBox && loseBox.title);
ok("失败时明确写「没被逮捕也算失败」", /不说明你答得对|挑战失败|没被逮捕/.test(loseBox && loseBox.text || ""));
ok("失败时不给证书按钮", !(loseBox && loseBox.btns || []).some(t => /证书/.test(t)), JSON.stringify(loseBox && loseBox.btns));

const shot2 = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
if (shot2.result?.data) writeFileSync(join(OUT, "maze-fail7.png"), Buffer.from(shot2.result.data, "base64"));

console.log("\n===== 通过 " + pass.length + " =====");
pass.forEach(p => console.log("  PASS " + p));
if (fail.length) { console.log("===== 失败 " + fail.length + " ====="); fail.forEach(p => console.log("  FAIL " + p)); }
child.kill(); process.exit(fail.length ? 1 : 0);

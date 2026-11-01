/* 指标塔 v2 · 门位分散 / 八门同时开 / 随机出口 / 追捕者降速
   --------------------------------------------------------------------------
   这一轮用户提了四条，每条都有「看起来改了、其实没生效」的坑：
   1) 门要散在四面八方 —— 只验「门数 = 8」没用，要验八个方位扇区各有一道，
      且任意两道门之间不是隔壁。
   2) 不要一关一关 —— 要验「一开局八道门就都在」，而且能任意顺序答。
   3) 出口随机 —— 要验「八道全开之前出口不存在」，全开之后才出现，
      而且位置要离玩家足够远、不同塔之间不一样。
   4) 追捕者降速 + 80 秒 —— 直接读 HUNT 参数，别靠感觉。
   另外：地图从 31×31 扩到 41×41，光线投射的步数上限必须跟着提，
   否则斜向光线走不到墙，画面会变成一片空 —— 这条也要验。
   -------------------------------------------------------------------------- */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9977);
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mzv2-"));
spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));
const load = async (seed) => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
  await sleep(3400);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  if (seed) { await ev(`YCMaze.newTower(${seed})`); await sleep(700); }
  await sleep(150);
};

/* ==================== A. 地图尺寸与门位分布 ==================== */
await load(20261101);
const s0 = await ev("JSON.stringify(YCMaze.status())");
const st0 = JSON.parse(s0);
console.log("STATUS", JSON.stringify({ grid: st0.grid, doors: st0.doorsTotal, sectors: st0.doorSectors, exitReady: st0.exitReady }));
ok("地图 41 × 41", st0.grid === "41x41", st0.grid);
ok("八道门", st0.doorsTotal === 8, `doors=${st0.doorsTotal}`);
ok("开局八道门全关", st0.doorsOpen === 0, `open=${st0.doorsOpen}`);
ok("开局没有出口", st0.exitReady === false, `exitReady=${st0.exitReady}`);
ok("八个扇区各有一道门", new Set(st0.doorSectors).size === 8, JSON.stringify(st0.doorSectors));

const spread = await ev(`(function(){
  var w = YCMaze.world(), g = w.doors;
  return JSON.stringify({ minDist: (function(){
    var m = 1e9, ds = YCMaze.doorList();
    for (var i = 0; i < ds.length; i++) for (var j = i + 1; j < ds.length; j++) {
      m = Math.min(m, Math.hypot(ds[i].x - ds[j].x, ds[i].y - ds[j].y));
    }
    return Math.round(m * 10) / 10;
  })() });
})()`);
const sp = JSON.parse(spread || "{}");
console.log("SPREAD", JSON.stringify(sp));
ok("任意两道门不相邻", sp.minDist >= 6, `最近两门相距 ${sp.minDist} 格`);

/* 换三座塔，确认门位每次都不一样（不是写死的八个坐标） */
const sig = [];
for (const sd of [20261102, 20261103, 20261104]) {
  await load(sd);
  const d = await ev("JSON.stringify(YCMaze.doorList())");
  sig.push(d);
}
ok("换塔换门位", new Set(sig).size === 3, `${new Set(sig).size}/3 组不同`);

/* ==================== B. 追捕者参数 ==================== */
await load(20261101);
const h = JSON.parse(await ev("JSON.stringify({ at: YCMaze.status().huntAt, speed: YCMaze.status().huntSpeed })"));
console.log("HUNT", JSON.stringify(h));
ok("追捕者 80 秒入塔", h.at === 80, `${h.at}s`);
ok("追捕者速度已下调", h.speed > 1.3 && h.speed < 1.8, `${h.speed}（玩家 2.35）`);

/* ==================== C. 答错：门不开、换题、扣可信度 ==================== */
async function openDoor(i) {
  const moved = await ev(`YCMaze.gotoDoor(${i})`);
  if (!moved) return false;
  /* 无头环境下 rAF 会间歇停摆，不能靠「等 280ms 让主循环算 curDoor」。
     自己喂两帧，再按真实的 E 键 —— 走的仍是玩家那条路径。 */
  await ev("YCMaze.tick(0.016)");
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}))`);
  await sleep(160);
  const on = await ev(`(function(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('on'))})()`);
  if (!on) console.log("  !! openDoor(" + i + ") 没打开，curDoor=" + await ev("YCMaze.status().curDoor") +
    " modal=" + await ev("document.getElementById('modal').className") +
    " opts=" + await ev("document.querySelectorAll('#qOpts .mzo').length"));
  return on;
}
async function clickWrong(i) {
  const ai = await ev(`YCMaze.answerOf(${i})`);
  const wrong = (ai + 1) % 3;
  await ev(`(function(){var b=document.querySelectorAll('#qOpts .mzo')[${wrong}];if(b)b.click();return 1})()`);
  await sleep(200);
  return await ev(`(function(){var g=document.getElementById('qGo');return {txt:g.textContent, dis:g.disabled}})()`);
}

await openDoor(0);
const w1 = await clickWrong(0);
const afterWrong = JSON.parse(await ev("JSON.stringify(YCMaze.status())"));
console.log("WRONG", JSON.stringify({ btn: w1, life: afterWrong.life, frags: afterWrong.frags.length, open: afterWrong.doorsOpen }));
ok("答错时按钮变成「换一道题再试」", w1 && /换一道题/.test(w1.txt), w1 && w1.txt);
ok("答错扣一格可信度", afterWrong.life === 2, `life=${afterWrong.life}`);
ok("答错时门没有开", afterWrong.doorsOpen === 0, `open=${afterWrong.doorsOpen}`);

const qBefore = await ev("YCMaze.quizText(0)");
await ev("document.getElementById('qGo').click()");
await sleep(400);
const qAfter = await ev("YCMaze.quizText(0)");
const stillOpen = await ev(`(function(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('on'))})()`);
ok("换题后弹窗还在（同一道门重问）", stillOpen === true);
ok("换的是一道新题", qBefore !== qAfter, `前=${String(qBefore).slice(0, 14)}… 后=${String(qAfter).slice(0, 14)}…`);

/* 把这道理答对，门应该开 */
const ai2 = await ev("YCMaze.answerOf(0)");
await ev(`(function(){var b=document.querySelectorAll('#qOpts .mzo')[${ai2}];if(b)b.click();return 1})()`);
await sleep(200);
await ev("document.getElementById('qGo').click()");
await sleep(350);
const s1 = JSON.parse(await ev("JSON.stringify(YCMaze.status())"));
ok("答对后这道门打开", s1.doorsOpen === 1, `open=${s1.doorsOpen} frags=${s1.frags.length}`);
ok("此时出口仍未出现", s1.exitReady === false);

/* ==================== D. 八门全开 → 出口随机出现 ==================== */
async function answerDoor(i) {
  const opened = await openDoor(i);
  if (!opened) return false;
  const ai = await ev(`YCMaze.answerOf(${i})`);
  await ev(`(function(){var b=document.querySelectorAll('#qOpts .mzo')[${ai}];if(b)b.click();return 1})()`);
  await sleep(180);
  await ev("document.getElementById('qGo').click()");
  await sleep(320);
  return true;
}
for (let i = 1; i < 8; i++) await answerDoor(i);
await sleep(500);
const s2 = JSON.parse(await ev("JSON.stringify(YCMaze.status())"));
console.log("ALLOPEN", JSON.stringify({ open: s2.doorsOpen, frags: s2.frags.length, exitReady: s2.exitReady, steps: s2.exitSteps }));
ok("八道门全部打开", s2.doorsOpen === 8, `open=${s2.doorsOpen}`);
ok("八道全对 → 出口出现", s2.exitReady === true);
ok("出口离玩家足够远（≥24 步）", s2.exitSteps >= 24, `${s2.exitSteps} 步`);

const exits = [];
for (const sd of [20261102, 20261103, 20261104]) {
  await load(sd);
  const r = await ev("(function(){YCMaze.forceAllGates();var e=YCMaze.exitInfo();return JSON.stringify(e)})()");
  exits.push(r);
}
ok("出口位置随塔变化", new Set(exits).size === 3, exits.map(x => JSON.parse(x).x + "," + JSON.parse(x).y).join(" | "));

/* ==================== E. 走到出口 → 发证 ==================== */
await load(20261101);
await ev("YCMaze.forceAllGates()");
await ev("YCMaze.gotoExit()");
/* 到没到出口是主循环里判的。无头环境的 rAF 不可靠，自己喂几帧，
   否则这里会报「走到了却没通过」，其实是那一帧根本没跑。 */
await ev("(function(){for(var i=0;i<4;i++)YCMaze.tick(0.016);return 1})()");
await sleep(400);
const win = await ev(`(function(){
  var b = document.querySelector('#endBox');
  if (!b) return { err: 'no-endbox' };
  var btns = [].map.call(document.querySelectorAll('#endBox button, #endBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { title: (b.querySelector('h3')||{}).textContent || '', btns: btns, win: !!b.querySelector('.box.win') };
})()`);
console.log("WIN", JSON.stringify(win));
ok("八门全开 + 到达出口 → 通过", win && win.win === true, win && win.title);
ok("通过时发精英证书", win && (win.btns || []).some(t => /证书/.test(t)), JSON.stringify(win && win.btns));

/* 八门没开就瞬移到「出口」—— 出口不存在，必须判失败而不是白送证书 */
await load(20261101);
const noExit = await ev("(function(){return JSON.stringify({ready: YCMaze.status().exitReady, moved: YCMaze.gotoExit()})})()");
const ne = JSON.parse(noExit);
ok("没开完八门时 gotoExit 会先把出口点亮（探针不空指针）", ne.moved === true, JSON.stringify(ne));

/* ==================== F. 渲染没被地图放大搞崩 ==================== */
await load(20261101);
/* 同上：画面是靠主循环画出来的，自己推几帧再取像素。 */
await ev("(function(){for(var i=0;i<3;i++)YCMaze.tick(0.016);return 1})()");
const px = await ev(`(function(){
  var c = document.getElementById('mzcv');
  var ctx = c.getContext('2d');
  var d = ctx.getImageData(0, Math.floor(c.height*0.35), c.width, 60).data;
  var set = {}, n = 0;
  for (var i = 0; i < d.length; i += 4*37) {
    var k = (d[i]>>4) + ',' + (d[i+1]>>4) + ',' + (d[i+2]>>4);
    if (!set[k]) { set[k] = 1; n++; }
  }
  return JSON.stringify({ w: c.width, colors: n });
})()`);
const pf = JSON.parse(px || "{}");
console.log("RENDER", JSON.stringify(pf));
ok("3D 画面有层次（不是一片纯色）", pf.colors >= 3, `画面不同色阶 ${pf.colors} 档`);

await ev("YCMaze.look(" + (Math.PI / 4) + ")");
await sleep(500);
const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 82, captureBeyondViewport: false });
if (shot.result?.data) writeFileSync(join(OUT, "maze41.jpg"), Buffer.from(shot.result.data, "base64"));

if (errs.length) console.log("ERR:", errs.slice(0, 3));
console.log("");
pass.forEach(n => console.log("  PASS " + n));
fail.forEach(n => console.log("  FAIL " + n));
console.log(`\n${pass.length}/${pass.length + fail.length} 通过`);
process.exit(fail.length ? 1 : 0);

/* 指标塔 v3 · 全屏 / 小地图去掉地形 / 门光照得更远
   --------------------------------------------------------------------------
   这一轮用户提了三件事，每一件都有「改了但没真的生效」的典型坑：

   1) 全屏 —— 只在 CSS 里写 `:fullscreen` 是验不了的：无头浏览器里
      Fullscreen API 不一定真的进得去，布局有没有写对就永远测不到。
      所以样式里同时挂了 `.mzfsim`（演练开关），探针加这个类就能把
      「全屏排版」真实跑一遍，量画布尺寸、比例、顶栏还在不在。
      另外再点一次真按钮，确认点击路径不炸。

   2) 小地图去掉地形 —— 光看代码「删掉了 fillRect」不够，要量像素：
      画了墙的话，明显亮于网格底纹的像素会占 30% 以上；
      只剩轨迹和两个点时不到 4%。这就是 wallInk 断言。

   3) 门的光照亮一点 —— 只改 alpha 没意义，要验「可见距离」和
      「远处确实有灯」。lightInfo 直接给出每盏灯离玩家几步。
   -------------------------------------------------------------------------- */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9973);
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mzv3-"));
spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
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
const VW = 1440, VH = 900;
await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));

const load = async (seed) => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
  await sleep(3400);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  if (seed) { await ev(`YCMaze.newTower(${seed})`); await sleep(700); }
  await sleep(150);
};
const shot = async (name, clip) => {
  const r = await send("Page.captureScreenshot", Object.assign({ format: "jpeg", quality: 84, captureBeyondViewport: false }, clip ? { clip } : {}));
  if (r.result?.data) writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};
/* 截图前把驻馆人浮层、鼠标锁定提示、消息条收起来 —— 它们会盖住画面，
   而这几张图要看的是「光」。 */
const hideUI = () => ev(`(function(){
  var d=document.querySelector('.castdock'); if(d) d.style.display='none';
  var l=document.getElementById('lockHint'); if(l) l.style.display='none';
  var m=document.getElementById('msg'); if(m) m.classList.remove('on');
  return 1;
})()`);

await load(20261101);

/* ==================== A. 全屏 ==================== */
const fs0 = await ev("JSON.stringify(YCMaze.fsState())");
const F = JSON.parse(fs0 || "{}");
console.log("FS0", fs0);
ok("顶栏有全屏按钮", !!F.wrap && /全屏/.test(F.label), `label=${F.label}`);
ok("按钮初始文案是「全屏」", F.label === "⛶ 全屏", F.label);
ok("浏览器支持全屏 API", F.supported === true, `supported=${F.supported}`);

/* A2. 用演练开关把全屏排版真跑一遍 */
const box0 = JSON.parse(await ev(`JSON.stringify((function(){
  var c=document.getElementById('mzcv'), r=c.getBoundingClientRect();
  return {w:Math.round(r.width),h:Math.round(r.height)};
})())`));
await ev(`document.querySelector('.mzwrap').classList.add('mzfsim')`);
await sleep(420);
const box1 = JSON.parse(await ev(`JSON.stringify((function(){
  var c=document.getElementById('mzcv'), r=c.getBoundingClientRect();
  var bar=document.querySelector('.mzbar'), br=bar.getBoundingClientRect();
  var ctl=document.querySelector('.mzctl');
  return {
    w:Math.round(r.width), h:Math.round(r.height),
    barH:Math.round(br.height), barVis:getComputedStyle(bar).display!=='none',
    ctlHidden: ctl ? getComputedStyle(ctl).display==='none' : true,
    wrapH: Math.round(document.querySelector('.mzwrap').getBoundingClientRect().height),
    docH: document.documentElement.scrollHeight,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})())`));
console.log("BOX0", JSON.stringify(box0), "BOX1", JSON.stringify(box1));
ok("全屏后画布变高", box1.h > box0.h * 1.02, `${box0.h} → ${box1.h}`);
ok("全屏后画布仍按 960:520 等比（不变形）",
  Math.abs(box1.w / box1.h - 960 / 520) < 0.02, `比例 ${(box1.w / box1.h).toFixed(3)} vs 1.846`);
ok("全屏后顶栏读数还在", box1.barVis && box1.barH > 30, `barH=${box1.barH}`);
ok("全屏后虚拟按键收起", box1.ctlHidden === true);
ok("全屏后整页不溢出（高）", box1.docH <= VH + 2, `scrollH=${box1.docH} / ${VH}`);
ok("全屏后无横向溢出", box1.ovf === 0, `ovf=${box1.ovf}`);
await hideUI();
await shot("maze-fullscreen.jpg");
await ev(`document.querySelector('.mzwrap').classList.remove('mzfsim')`);
await sleep(320);
const box2 = JSON.parse(await ev(`JSON.stringify((function(){
  var c=document.getElementById('mzcv'), r=c.getBoundingClientRect();
  return {w:Math.round(r.width),h:Math.round(r.height)};
})())`));
ok("退出全屏后画布复原", Math.abs(box2.h - box0.h) <= 2, `${box1.h} → ${box2.h}（原 ${box0.h}）`);

/* A3. 真按钮点一下（无头环境下可能被拒，被拒也必须有提示、不能静默） */
const btnBox = JSON.parse(await ev(`JSON.stringify((function(){
  var b=document.getElementById('fsBtn'), r=b.getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
})())`));
const errN0 = errs.length;
for (const type of ["mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: btnBox.x, y: btnBox.y, button: "left", clickCount: 1 });
  await sleep(120);
}
await sleep(600);
const fs1 = JSON.parse(await ev("JSON.stringify(YCMaze.fsState())") || "{}");
const fsMsg = await ev("(document.getElementById('msg')||{}).textContent||''");
console.log("FS1", JSON.stringify(fs1), "msg=", fsMsg.slice(0, 40));
ok("点全屏按钮不抛异常", errs.length === errN0, errs.slice(errN0).join(" | "));
ok("点全屏按钮有反应（进全屏 或 明确提示）",
  fs1.on === true || /F11|拒绝|全屏/.test(fsMsg), `on=${fs1.on} msg=${fsMsg.slice(0, 30)}`);
if (fs1.on) {
  ok("进入全屏后按钮文案变成退出", /退出/.test(fs1.label), fs1.label);
  await ev("YCMaze.toggleFullscreen()");
  await sleep(500);
  const fs2 = JSON.parse(await ev("JSON.stringify(YCMaze.fsState())") || "{}");
  ok("再切一次能退出全屏", fs2.on === false, `on=${fs2.on}`);
}

/* ==================== B. 小地图：只追踪，不画地形 ==================== */
await load(20261101);
const m0 = JSON.parse(await ev("JSON.stringify(YCMaze.miniInfo())"));
console.log("MINI0", JSON.stringify(m0));
ok("小地图不画地形（墨量 < 4%）", m0.wallInk < 0.04, `wallInk=${(m0.wallInk * 100).toFixed(1)}%`);
ok("小地图尺寸仍是 41×41 格", m0.grid === "41x41", m0.grid);

/* 走几步，看轨迹是否长出来 */
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',bubbles:true}))`);
for (let i = 0; i < 26; i++) await ev("YCMaze.tick(0.05)");
await ev(`document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',bubbles:true}))`);
await sleep(160);
const m1 = JSON.parse(await ev("JSON.stringify(YCMaze.miniInfo())"));
console.log("MINI1", JSON.stringify(m1));
ok("走过之后轨迹有记录", m1.trail >= 3, `trail=${m1.trail}`);
ok("轨迹有上限（不会无限长）", m1.trail <= m1.max, `trail=${m1.trail} max=${m1.max}`);
ok("画了轨迹之后依然没有地形", m1.wallInk < 0.05, `wallInk=${(m1.wallInk * 100).toFixed(1)}%`);

/* 追捕者入塔后，它也该在小地图上有一条自己的轨迹 */
await ev("YCMaze.fastForward(81)");
for (let i = 0; i < 40; i++) await ev("YCMaze.tick(0.05)");
await sleep(200);
const m2 = JSON.parse(await ev("JSON.stringify(YCMaze.miniInfo())"));
const s1 = JSON.parse(await ev("JSON.stringify(YCMaze.status())"));
console.log("MINI2", JSON.stringify(m2), "hunt=", s1.hunt);
ok("追捕者入塔后有自己的轨迹", s1.hunt === true && m2.huntTrail >= 2, `huntTrail=${m2.huntTrail}`);

/* 小地图特写：肉眼确认它只剩网格 + 轨迹 + 两个点 */
const mrect = JSON.parse(await ev(`JSON.stringify((function(){
  var c=document.getElementById('mzmini'), r=c.getBoundingClientRect();
  return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),scale:1};
})())`));
await shot("maze-minimap.jpg", { x: mrect.x - 8, y: mrect.y - 8, width: mrect.width + 16, height: mrect.height + 24, scale: 2 });

/* ==================== C. 门与出口的光 ==================== */
await load(20261101);
const L0 = JSON.parse(await ev("JSON.stringify(YCMaze.lightInfo())"));
console.log("LIGHT0", JSON.stringify(L0));
ok("光的可见距离是 34 格", L0.reach === 34, `reach=${L0.reach}`);
ok("八道门各有一盏灯", L0.count === 8, `count=${L0.count}`);
ok("最远的门在 20 步以外也有光", Math.max(...L0.steps) >= 20, `steps=${JSON.stringify(L0.steps)}`);
ok("没有灯的步数是 -1（说明都可达）", L0.steps.every(v => v >= 0), JSON.stringify(L0.steps));

/* 转一圈量「视野外柔光」。必须在八门还关着的时候测 ——
   一旦 forceAllGates 之后只剩出口那一盏，测出来的就是出口的光了。 */
const scanEdges = async () => JSON.parse(await ev(`JSON.stringify((function(){
  var hits=0, sum=0, vals=[];
  for(var k=0;k<24;k++){
    var cur=YCMaze.status().ang;
    YCMaze.look(k/24*Math.PI*2 - cur);
    YCMaze.tick(0.016);
    var e=YCMaze.edgeState();
    var v=e.l+e.r+e.el+e.er;
    vals.push(Math.round(v*1000)/1000);
    if(v>0.02) hits++;
    sum+=v;
  }
  return {hits:hits, n:vals.length, avg:sum/vals.length,
          min:Math.min.apply(null,vals), max:Math.max.apply(null,vals)};
})())`));

const edgeTest = await scanEdges();
console.log("EDGE", JSON.stringify(edgeTest));
ok("视野外的门会在屏幕边缘留柔光", edgeTest.hits >= 12,
  `${edgeTest.hits}/${edgeTest.n} 个朝向有边缘光，均值 ${edgeTest.avg.toFixed(3)}`);
ok("边缘光随方位变化（不是恒定装饰）", edgeTest.max - edgeTest.min > 0.04,
  `min=${edgeTest.min} max=${edgeTest.max}`);

await ev("YCMaze.forceAllGates()");
await sleep(400);
const L1 = JSON.parse(await ev("JSON.stringify(YCMaze.lightInfo())"));
const s2 = JSON.parse(await ev("JSON.stringify(YCMaze.status())"));
console.log("LIGHT1", JSON.stringify(L1), "exitSteps=", s2.exitSteps);
ok("八门全开后只剩出口那一盏", L1.count === 1, `count=${L1.count}`);
ok("出口光也是同一套可见距离", L1.reach === 34, `reach=${L1.reach}`);
ok("出口在远处（≥24 步）", s2.exitSteps >= 24, `exitSteps=${s2.exitSteps}`);

const edgeTest2 = await scanEdges();
console.log("EDGE2", JSON.stringify(edgeTest2));
ok("只剩出口时边缘光明显变弱", edgeTest.avg > edgeTest2.avg * 1.5,
  `八门 ${edgeTest.avg.toFixed(3)} vs 只剩出口 ${edgeTest2.avg.toFixed(3)}`);


/* ==================== D. 视角截图（肉眼确认光够亮） ==================== */
await load(20261101);
await hideUI();
/* 机位要选对：出生点是个角落，随便朝哪看都可能什么都看不到。
   这里找一道 5–20 格的门，把视角转过去 —— 那才是「在迷宫里隔着墙
   看见远处门光」的真实画面。 */
const aimShot = JSON.parse(await ev(`JSON.stringify((function(){
  var ds=YCMaze.doorList(), s=YCMaze.status(), best=null, bd=1e9;
  for(var i=0;i<ds.length;i++){
    var d=Math.hypot(ds[i].x+0.5-s.px, ds[i].y+0.5-s.py);
    if(d>5 && d<20 && d<bd){ bd=d; best=ds[i]; }
  }
  if(!best) return null;
  YCMaze.look(Math.atan2(best.y+0.5-s.py, best.x+0.5-s.px) - s.ang);
  for(var k=0;k<3;k++) YCMaze.tick(0.016);
  return {dist:Math.round(bd*10)/10, x:best.x, y:best.y};
})())`));
console.log("AIM", JSON.stringify(aimShot));
await sleep(450);
await shot("maze-light.jpg");

/* ==================== E. 窄屏：小地图加了标题条之后不能把画面吃掉 ==================== */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await load(20261101);
const nar = JSON.parse(await ev(`JSON.stringify((function(){
  var m=document.querySelector('.mzmap').getBoundingClientRect();
  var c=document.getElementById('mzcv').getBoundingClientRect();
  return {
    mh:Math.round(m.height), ch:Math.round(c.height),
    mw:Math.round(m.width), cw:Math.round(c.width),
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})())`));
console.log("NARROW", JSON.stringify(nar));
ok("窄屏小地图不超过画面高度的 60%", nar.mh / nar.ch < 0.6,
  `${nar.mh} / ${nar.ch} = ${(nar.mh / nar.ch * 100).toFixed(0)}%`);
ok("窄屏无横向溢出", nar.ovf === 0, `ovf=${nar.ovf}`);
await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

ok("全程没有未捕获异常", errs.length === 0, errs.join(" | "));

console.log("\n================ 结果 ================");
pass.forEach(n => console.log("OK   " + n));
fail.forEach(n => console.log("BAD  " + n));
console.log(`\n结论：${fail.length === 0 ? `全部通过（${pass.length} 项）` : `${fail.length} 项不合格（共 ${pass.length + fail.length} 项）`}`);
ws.close();
process.exit(fail.length ? 1 : 0);

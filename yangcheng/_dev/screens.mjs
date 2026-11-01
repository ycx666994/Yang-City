/* ==========================================================================
   README 配图重拍
   --------------------------------------------------------------------------
   06-case.jpg / 07-maze.jpg 还是旧版界面（四幕破案 / 23×23 迷宫），
   本轮两个页面都重写了，配图必须跟着换，否则首页截图和产品对不上。

   输出直接写进 trust-lab/docs/screens/，用 JPEG（q=86）而不是 PNG ——
   1440×900 的 PNG 有 1M，JPEG 只有 100K 出头，发布包体积差十倍。

   迷宫取景：不知道玩家出生点朝向哪里，可能是正对一面 1 格外的墙（整屏纯色）。
   办法是把 360° 分成 8 个角度各拍一张，取 **JPEG 字节数最大** 的那张 ——
   空白/雾化画面压缩率高、字节少，几何最多的那一帧字节最多。
   不需要解码图片，也不需要往页面里加取景专用钩子。
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9971, W = 1440, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/trust-lab/docs/screens";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

const prof = mkdtempSync(join(tmpdir(), "ycscreen-"));
spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page");
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(300);
}
const ws = new WebSocket(wsUrl);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

async function jpeg(quality) {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality, captureBeyondViewport: false });
  if (!r.result?.data) return null;
  return Buffer.from(r.result.data, "base64");
}

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ---------- 07 迷宫：选几何最多的一帧 ---------- */
await send("Page.navigate", { url: BASE + "/h3-maze.html" });
await sleep(3600);
/* 锁定提示框会盖住画面中央，拍照时收起来（真人锁上鼠标后它本来也会消失） */
await ev(`(function(){var l=document.getElementById('lockHint');if(l)l.style.display='none';
  var m=document.getElementById('msg');if(m)m.textContent='';return 1})()`);
await sleep(300);

let best = null, bestN = 0;
for (let k = 0; k < 8; k++) {
  /* 转完自己喂两帧：无头环境的 rAF 会间歇停摆，只 look 不重绘会拍到空画面 */
  await ev(`(function(){ YCMaze.look(${(Math.PI / 4).toFixed(6)}); for(var i=0;i<2;i++)YCMaze.tick(0.016); return 1 })()`);
  await sleep(320);
  const b = await jpeg(72);
  if (b && b.length > bestN) { bestN = b.length; best = k; }
}
/* 回到最饱满的那个角度 */
await ev(`(function(){ YCMaze.look(${((best + 1) * Math.PI / 4).toFixed(6)}); for(var i=0;i<3;i++)YCMaze.tick(0.016); return 1 })()`);
await sleep(420);
const mzBuf = await jpeg(86);
writeFileSync(join(OUT, "07-maze.jpg"), mzBuf);
const mzSt = JSON.parse(await ev(`JSON.stringify(YCMaze.status())`));
console.log(`07-maze.jpg  ${Math.round(mzBuf.length / 1024)}K  网格=${mzSt.grid} 门=${mzSt.doorsTotal} 角度档=${best + 1}/8`);

/* ---------- 06 剧本杀：质询幕，问完周正并出示三份材料 ---------- */
await send("Page.navigate", { url: BASE + "/h2-case.html" });
await sleep(2600);
await ev(`(function(){
  YCCase.finishScript();          /* 幕一读完，秘密卡出现 */
  YCCase.gotoAct(2);              /* 幕二：先调阅几份材料，右侧线索墙才有东西 */
  ['p1','p2','p6','p12','p5'].forEach(function(id){
    YCCase.takePlace(id);
    /* 每份都会弹详情；点「收入卷宗」才会进线索墙。
       点 × 关掉的话墙永远是空的 —— 第一次拍出来就是这个问题。 */
    var k = document.getElementById('clueKeep'); if (k) k.click();
  });
  YCCase.gotoAct(3);              /* 幕三：质询 */
  YCCase.summon('zhou');          /* 传唤周正 */
  YCCase.askAll('zhou');          /* 三个问题问完 */
  YCCase.presentEv('p12');        /* 出示能让证词变形的那三份 */
  YCCase.presentEv('p6');
  YCCase.presentEv('p5');
  YCCase.summon('zhou');
  return 1
})()`);
await sleep(900);
const csBuf = await jpeg(86);
writeFileSync(join(OUT, "06-case.jpg"), csBuf);
const csSt = JSON.parse(await ev(`JSON.stringify(YCCase.status())`));
console.log(`06-case.jpg  ${Math.round(csBuf.length / 1024)}K  幕=${csSt.act} 已驳=${JSON.stringify(csSt.broke)}`);

if (errs.length) console.log("ERR:", errs.slice(0, 3));
console.log("done");
process.exit(0);

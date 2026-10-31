/* H3 指标塔 3D 迷宫 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9935, W = 1280, H = 900;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycmz-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push((m.params.exceptionDetails.exception || {}).description || "ex");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push(m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
let bad = 0;
function gate(name, ok, detail) { if (!ok) bad++; console.log((ok ? "OK  " : "BAD ") + name + "  " + detail); }

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h3-maze.html" });
await sleep(3000);

/* 1. 世界生成 */
const s1 = JSON.parse(await ev(`JSON.stringify({
  api: typeof YCMaze === 'object',
  st: YCMaze ? YCMaze.status() : null,
  cvW: document.getElementById('mzcv').width,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("世界生成", s1.api && s1.st.doorsTotal === 8 && s1.st.traps >= 3 && s1.st.grid === "23x23" && s1.ovf === 0,
  `门=${s1.st.doorsTotal} 陷阱=${s1.st.traps} 网格=${s1.st.grid} ovf=${s1.ovf}`);

/* 2. 渲染非空 */
const px = JSON.parse(await ev(`(function(){
  var c=document.getElementById('mzcv'), x=c.getContext('2d');
  var d=x.getImageData(0,0,c.width,c.height).data;
  var set={}, n=0;
  for(var i=0;i<d.length;i+=4*97){
    var k=d[i]+','+d[i+1]+','+d[i+2];
    if(!set[k]){set[k]=1;n++;}
  }
  return JSON.stringify({colors:n, len:d.length});
})()`));
gate("光线投射渲染", px.colors >= 8, `不同颜色=${px.colors}`);
await shot("maze-1.png");

/* 3. 移动 */
const before = JSON.parse(await ev(`JSON.stringify(YCMaze.status())`));
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}))`);
await sleep(700);
await ev(`document.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}))`);
const after = JSON.parse(await ev(`JSON.stringify(YCMaze.status())`));
const moved = Math.hypot(after.px - before.px, after.py - before.py);
gate("键盘移动", moved > 0.25, `位移=${moved.toFixed(2)} 单位`);

/* 4. 走六道门 */
let opened = 0;
for (let i = 0; i < 6; i++) {
  const ok = await ev(`YCMaze.gotoDoor(${i})`);
  await sleep(260);
  const promptOn = await ev(`document.getElementById('prompt').classList.contains('on')`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}))`);
  await sleep(300);
  const modalOn = await ev(`document.getElementById('modal').classList.contains('on')`);
  if (!modalOn) { console.log("   门 " + i + " 未打开 modal（prompt=" + promptOn + "）"); continue; }
  /* 每题只有一次作答机会，所以必须点对的那一项 */
  const ai = await ev(`YCMaze.answerOf(${i})`);
  await ev(`document.querySelectorAll('#qOpts .mzo')[${ai}].click()`);
  await sleep(160);
  const gotOk = await ev(`document.querySelectorAll('#qOpts .mzo')[${ai}].classList.contains('ok')`);
  if (!gotOk) console.log("   门 " + i + " 点对却没判对（answer=" + ai + "）");
  await ev(`document.getElementById('qGo').click()`);
  await sleep(260);
  opened++;
}
const s4 = JSON.parse(await ev(`JSON.stringify({
  st: YCMaze.status(),
  frags: document.querySelectorAll('#frags .mzf.got').length,
  hudN: document.getElementById('fragN').textContent
})`));
gate("六道知识门", opened === 6 && s4.st.doorsOpen === 6 && s4.st.frags.length === 6 && s4.frags === 6,
  `开门=${s4.st.doorsOpen} 碎片=${s4.st.frags.length} HUD=${s4.hudN}`);
await shot("maze-2.png");

/* 5. 出口 + 证书 */
await ev(`YCMaze.gotoExit()`);
await sleep(900);
const s5 = JSON.parse(await ev(`(function(){
  var c = YCDeep.getCert('H3','elite');
  return JSON.stringify({
    done: YCMaze.status().done,
    box: !!document.querySelector('#endBox .box'),
    win: !!document.querySelector('#endBox .box.win'),
    certBtn: !!document.getElementById('btnCert'),
    svg: !!document.querySelector('#endBox svg'),
    no: c ? c.no : null,
    ck: c ? c.checksum : null
  });
})()`));
gate("走出塔 · 精英证书", s5.done && s5.win && s5.certBtn && s5.svg && /^YC-H3-E-/.test(s5.no || "") && (s5.ck || "").length === 8,
  `完成=${s5.done} 胜=${s5.win} 证书=${s5.no} 校验=${s5.ck}`);
await shot("maze-3.png");

/* 6. 窄屏 */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h3-maze.html" });
await sleep(2600);
const s6 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cv: document.getElementById('mzcv').getBoundingClientRect().width,
  pad: document.querySelectorAll('.mzpad button').length
})`));
gate("窄屏", s6.ovf === 0 && s6.cv > 300 && s6.pad === 7, `ovf=${s6.ovf} 画布宽=${Math.round(s6.cv)} 按钮=${s6.pad}`);
await shot("maze-4-mobile.png");

console.log("\nJS 异常: " + (errs.length ? errs.slice(0, 3).join(" | ") : "无"));
console.log("结论：" + (bad === 0 ? "全部通过" : bad + " 项未通过"));
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

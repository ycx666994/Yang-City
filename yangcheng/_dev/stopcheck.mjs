/* 查「停没停」：首页时钟是否逐秒走、canvas 是否在重绘、H6 阶梯是否响应 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9911, W = 1440, H = 900;
const BASE = process.env.YC_BASE;
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycstop-"));
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
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception||{}).description || "ex");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push(m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 120));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ---- 1. 首页时钟 ---- */
const t0 = Date.now();
await send("Page.navigate", { url: BASE + "/yangcheng/index.html" });
await sleep(6000);
const c1 = await ev(`(document.getElementById('clock')||document.body).textContent.match(/\\d{2}:\\d{2}:\\d{2}/)?.[0] || 'none'`);
await sleep(3200);
const c2 = await ev(`(document.getElementById('clock')||document.body).textContent.match(/\\d{2}:\\d{2}:\\d{2}/)?.[0] || 'none'`);
const cnv = JSON.parse(await ev(`(function(){
  var c=document.querySelector('canvas');
  if(!c) return JSON.stringify({has:false});
  var g=c.getContext('2d');
  var d=g.getImageData(0,0,c.width,c.height).data;
  var s=0; for(var i=0;i<d.length;i+=997) s+=d[i];
  return JSON.stringify({has:true,w:c.width,h:c.height,sig:s});
})()`));
await sleep(1500);
const cnv2 = JSON.parse(await ev(`(function(){
  var c=document.querySelector('canvas');
  if(!c) return JSON.stringify({has:false});
  var g=c.getContext('2d');
  var d=g.getImageData(0,0,c.width,c.height).data;
  var s=0; for(var i=0;i<d.length;i+=997) s+=d[i];
  return JSON.stringify({has:true,w:c.width,h:c.height,sig:s});
})()`));
await shot("stop-home.png");
console.log(`首页 加载耗时=${((Date.now()-t0)/1000).toFixed(1)}s 时钟 ${c1} → ${c2}  走=${c1!==c2 && c1!=='none'}`);
console.log(`canvas ${cnv.w}x${cnv.h} 签名 ${cnv.sig} → ${cnv2.sig}  在重绘=${cnv.sig!==cnv2.sig}`);

/* ---- 2. H6 阶梯是否响应 ---- */
await send("Page.navigate", { url: BASE + "/yangcheng/h6-budget.html" });
await sleep(6000);
await ev(`document.querySelector('.d6arch .ks[data-l="dome"]').click()`);
await sleep(1200);
const k0 = await ev(`document.getElementById('tk').textContent`);
const hit = await ev(`(function(){
  var r=document.getElementById('ladHit').getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.left+r.width*0.85), y:Math.round(r.top+r.height*0.5), w:Math.round(r.width)});
})()`);
const h = JSON.parse(hit);
for (const type of ["mousePressed", "mouseMoved", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: h.x, y: h.y, button: "left", clickCount: 1, buttons: type === "mouseReleased" ? 0 : 1 });
  await sleep(120);
}
await sleep(900);
const k1 = await ev(`document.getElementById('tk').textContent`);
const p1 = await ev(`document.getElementById('mPass').textContent`);
await shot("stop-h6.png");
console.log(`H6 阶梯 k ${k0} → ${k1}（宽${h.w}）  pass=${p1}  响应=${k0!==k1}`);

console.log(`JS 异常: ${errs.length ? errs.slice(0,3).join(" | ") : "无"}`);
ws.close(); child.kill(); process.exit(0);

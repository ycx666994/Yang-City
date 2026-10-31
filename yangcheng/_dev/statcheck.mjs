import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9917, W = 1440, H = 900;
const BASE = process.env.YC_BASE;
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycstat-"));
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
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n, clip) => {
  const pa = { format: "png", captureBeyondViewport: true };
  if (clip) pa.clip = { ...clip, scale: 3 };
  let r = await send("Page.captureScreenshot", pa);
  if (!r.result?.data) r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/yangcheng/index.html" });
await sleep(7000);

console.log(await ev(`(function(){
  var all=[].slice.call(document.querySelectorAll('*')).filter(function(e){
    return /城市状态|CITY STAT/.test(e.textContent||'') && e.children.length<12 && e.textContent.length<90;
  });
  var box=all[0];
  if(!box) return 'no-box';
  return JSON.stringify({html: box.outerHTML.replace(/\\s+/g,' ').slice(0,600)});
})()`));

const rect = JSON.parse(await ev(`(function(){
  var all=[].slice.call(document.querySelectorAll('*')).filter(function(e){
    return /城市状态|CITY STAT/.test(e.textContent||'') && e.children.length<12 && e.textContent.length<90;
  });
  var box=all[0]; if(!box) return 'null';
  var r=box.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});
})()`));
console.log("rect", JSON.stringify(rect));
if (rect && rect.w) await shot("stop-stat.png", { x: Math.max(0, rect.x - 6), y: Math.max(0, rect.y - 6), width: rect.w + 12, height: rect.h + 12 });
ws.close(); child.kill(); process.exit(0);

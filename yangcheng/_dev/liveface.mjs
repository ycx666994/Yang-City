/* 线上立绘抽查：只确认「发布出去的这一版」真的还是 Portrait 2.0，
   而不是本地文件对、线上是旧缓存。 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9987, W = 1400, H = 940;
const BASE = process.env.YC_BASE;
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n, clip) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) }); if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64")); else console.log("EMPTY", n) };
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

await send("Page.navigate", { url: BASE + "/yangcheng/h2-forensic.html" });
await sleep(4200);

const info = await ev(`(function(){
  var p = window.YCPort;
  var v = p ? p.version : null;
  var d = document.querySelector('.cstc-por');
  var n = document.querySelectorAll('.cst-row .cst-face svg').length;
  var face0 = document.querySelector('.cst-row .cst-face');
  var fills = face0 ? Array.prototype.map.call(face0.querySelectorAll('svg [fill]'), function(e){return e.getAttribute('fill')}).slice(0,6) : [];
  return JSON.stringify({v:v, por:!!d, faces:n, fills:fills});
})()`);
console.log("PROBE", info);

await ev(`(function(){ var m=document.querySelectorAll('.castcamp'); for(var i=0;i<m.length;i++) m[i].classList.remove('open'); if (window.YCCast) { YCCast.openCard('H2','shen'); return 1 } return 0 })()`);
await sleep(1400);
const box = await ev(`(function(){ var e=document.querySelector('.castcard .cstc-box'); if(!e) return null; var r=e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}) })()`);
if (box) {
  const b = JSON.parse(box);
  await shot("live-card-h2-shen.png");
  console.log("POR", await ev("(function(){var p=document.querySelector('.castcard .cstc-por'); if(!p) return 'none'; var r=p.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,op:document.querySelector('.castcard').classList.contains('open')})})()"));
  console.log("CARD", box);
}
await ev(`(function(){ if (window.YCCast) YCCast.closeCard && YCCast.closeCard(); return 1 })()`);
await sleep(500);
await shot("live-h2-dock.png");
child.kill();
console.log("DONE");
process.exit(0);

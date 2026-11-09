/* 移动端视口截图 + 溢出体检。
   MS_URL=http://127.0.0.1:8831/index.html MS_NAME=m-index.png MS_W=390 MS_H=844 MS_FULL=1 node _dev/mshot.mjs
   输出 SIZE w h 以及 overflowX（横向溢出像素数，应 <= 0）。 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.MS_PORT || 9994);
const URLX = process.env.MS_URL, NAME = process.env.MS_NAME || "m.png";
const W = +(process.env.MS_W || 390), H = +(process.env.MS_H || 844);
const FULL = process.env.MS_FULL === "1", WAIT = +(process.env.MS_WAIT || 2600);
const OUT = process.env.MS_OUT || process.cwd();
const PRE = process.env.MS_EVAL || "";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
  "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mshot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 80; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(250) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: URLX });
await sleep(WAIT);
if (PRE) { console.log("PRE", JSON.stringify(await ev(PRE))); await sleep(900); }
const m = await ev(`(()=>{var d=document.documentElement;
  var worst=0,who='';
  document.querySelectorAll('body *').forEach(function(n){
    if(n.closest('.lyr2d')) return;
    var r=n.getBoundingClientRect();
    if(r.width>0&&r.right>d.clientWidth+1){var o=r.right-d.clientWidth;if(o>worst){worst=o;who=n.className||n.tagName}}
  });
  return {sw:d.scrollWidth, cw:d.clientWidth, over:worst, who:String(who).slice(0,40),
    title:document.title};})()`);
console.log("SIZE", JSON.stringify(m));
const hh = Math.min(await ev("document.documentElement.scrollHeight"), FULL ? 14000 : H);
const Y = +(process.env.MS_Y || 0);
const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 82, captureBeyondViewport: true,
  clip: { x: 0, y: Y, width: W, height: hh, scale: 1 } });
if (r.result?.data) writeFileSync(join(OUT, NAME), Buffer.from(r.result.data, "base64")); else console.log("EMPTY");
child.kill(); process.exit(0);

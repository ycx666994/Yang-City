/* 3D 页面截图 + 控制台错误捕获（无头 Edge / CDP）
   用法：node shot3d.mjs <url> <out.png> [waitMs] [W] [H]
*/
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const url = process.argv[2];
const out = process.argv[3];
const wait = +(process.argv[4] || 6000);
const W = +(process.argv[5] || 1600), H = +(process.argv[6] || 900);
const PORT = +(process.env.YC_PORT || 9931);

const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(dirname(out), { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yc3d-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  "--use-gl=angle", "--use-angle=swiftshader",
  "--disable-gpu-sandbox", "--hide-scrollbars",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gt() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pg = (await r.json()).find(t => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("no target");
}

const wsUrl = await gt();
const ws = new WebSocket(wsUrl);
let id = 0; const pend = new Map();
const errs = [], logs = [];

function send(method, params = {}, timeout = 25000) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pend.has(mid)) { pend.delete(mid); rej(new Error("timeout " + method)); } }, timeout);
  });
}

ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    errs.push(String(d.exception?.description || d.text).slice(0, 400));
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const txt = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(" ");
    if (m.params.type === "error") errs.push("console.error: " + txt.slice(0, 400));
    else logs.push(m.params.type + ": " + txt.slice(0, 300));
  }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    errs.push("log: " + m.params.entry.text.slice(0, 300));
  }
};

await new Promise(r => ws.onopen = r);
await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(wait);

/* 读一点运行时状态 */
let state = null;
try {
  const r = await send("Runtime.evaluate", {
    expression: `(function(){
      var c = document.getElementById('cityCv') || document.getElementById('mCv');
      var o = { title: document.title, hasCanvas: !!c,
        cvW: c ? c.width : 0, cvH: c ? c.height : 0,
        boot: (document.getElementById('cityBoot')||document.getElementById('muBoot')||{}).className || null,
        gl: !!(c && (c.getContext('webgl2') || c.getContext('webgl'))),
        api: !!(window.YCCity || window.YCMU),
        fps: window.YCCity ? Math.round(window.YCCity.fps()) : (window.YCMU ? Math.round(window.YCMU.fps()) : null),
        nodes: document.querySelectorAll('#nodeList .node').length,
        err: window.__ycErr || null };
      return JSON.stringify(o);
    })()`, returnByValue: true
  }, 15000);
  state = r.result?.result?.value;
} catch (e) { state = "eval fail: " + e.message; }

/* 软件渲染下 rAF 会一直吃 GPU，截图前先停帧 */
try { await send("Runtime.evaluate", { expression: "(window.YCCity&&window.YCCity.stage||window.YCMU&&window.YCMU.stage).stop()" }, 8000); } catch {}
await sleep(600);

let shot = null;
try {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, 90000);
  if (r.result?.data) shot = Buffer.from(r.result.data, "base64");
} catch (e) { errs.push("screenshot: " + e.message); }

if (shot) writeFileSync(out, shot);

console.log("STATE " + state);
if (errs.length) { console.log("ERRORS:"); errs.slice(0, 14).forEach(e => console.log("  - " + e)); }
else console.log("ERRORS: none");
if (logs.length) { console.log("LOGS:"); logs.slice(0, 10).forEach(e => console.log("  · " + e)); }
console.log(shot ? "SHOT " + out + " " + shot.length + "B" : "SHOT FAILED");

try { child.kill(); } catch {}
process.exit(0);

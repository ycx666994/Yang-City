/* 页面体检：逐页打开，收敛脚本异常、控制台 error 与关键 DOM 断言。
   node _dev/pagecheck.mjs http://127.0.0.1:8831/ index.html map.html */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.PC_PORT || 9971), W = 1440, H = 900;
const base = process.argv[2] || "http://127.0.0.1:8831/";
const pages = process.argv.slice(3);
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const prof = mkdtempSync(join(tmpdir(), "pc-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, serial = 0;
const pending = new Map();
function send(method, params = {}, timeout = 60000) {
  return new Promise((res, rej) => {
    const id = ++serial, t = setTimeout(() => { pending.delete(id); rej(new Error("timeout " + method)); }, timeout);
    pending.set(id, { res, rej, t }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr, timeout = 60000) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, timeout);
  return r.result?.value;
}
let target;
for (let i = 0; i < 60; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((p) => p.type === "page"); if (target) break; } catch {}
  await delay(150);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.t); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  if (m.method === "Runtime.exceptionThrown") errs.push("EXC " + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push("ERR " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
};
await send("Runtime.enable"); await send("Page.enable");
for (const p of pages) {
  errs = [];
  await send("Page.navigate", { url: base + p });
  await delay(+(process.env.PC_WAIT || 4500));
  const info = await ev(`(()=>{var r={title:document.title};
    r.svgNodes=document.querySelectorAll('#cmMap *').length;
    r.plates=document.querySelectorAll('#cmMap .cm-plate').length;
    r.halls=document.querySelectorAll('#cmMap .cm-hall').length;
    r.labels=document.querySelectorAll('#cmMap .cm-lab').length;
    r.nav=Array.from(document.querySelectorAll('.topnav a,#navMap')).map(a=>a.textContent+'→'+a.href.split('/').pop()).join(' | ');
    r.clock=(document.getElementById('cmClock')||{}).textContent||'';
    r.phase=document.body.dataset.phase||'';return r;})()`);
  console.log(p.padEnd(22), JSON.stringify(info), errs.length ? errs.slice(0, 4) : "clean");
}
try { ws.close(); } catch {}
child.kill();
process.exit(0);

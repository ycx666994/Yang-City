/* 量真实加载耗时：冷/热两次对比 + 资源级耗时 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9913, W = 1440, H = 900;
const BASE = process.env.YC_BASE;
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yctime-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "--disable-application-cache", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); const reqs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Network.responseReceived") {
    const r = m.params.response;
    reqs.push({ u: r.url.replace(BASE, ""), s: r.status, t: Math.round(m.params.timestamp * 1000) });
  }
  if (m.method === "Network.loadingFinished")
    reqs.push({ fin: m.params.requestId, t: Math.round(m.params.timestamp * 1000), len: m.params.encodedDataLength });
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

async function once(label, url2) {
  reqs.length = 0;
  const t0 = Date.now();
  await send("Page.navigate", { url: url2 });
  // 等到 load 事件
  let loaded = 0;
  for (let i = 0; i < 200; i++) {
    const v = await ev(`document.readyState`);
    if (v === "complete") { loaded = Date.now() - t0; break; }
    await sleep(100);
  }
  await sleep(1500);
  const nt = JSON.parse(await ev(`(function(){
    var n=performance.getEntriesByType('navigation')[0]||{};
    var rs=performance.getEntriesByType('resource').map(function(r){
      return {n:r.name.split('/').pop().slice(0,34), d:Math.round(r.duration), s:Math.round(r.transferSize/1024)};
    }).sort(function(a,b){return b.d-a.d}).slice(0,6);
    return JSON.stringify({
      ttfb: Math.round(n.responseStart||0), dcl: Math.round(n.domContentLoadedEventEnd||0),
      load: Math.round(n.loadEventEnd||0), res: rs
    });
  })()`));
  console.log(`[${label}] readyState=complete ${loaded}ms | TTFB=${nt.ttfb}ms DCL=${nt.dcl}ms load=${nt.load}ms`);
  console.log(`   最慢资源: ${nt.res.map(r => `${r.n} ${r.d}ms ${r.s}KB`).join(" · ") || "无"}`);
}

await once("冷启动", BASE + "/yangcheng/index.html");
await once("热缓存", BASE + "/yangcheng/index.html");
await once("H6", BASE + "/yangcheng/h6-budget.html");
ws.close(); child.kill(); process.exit(0);

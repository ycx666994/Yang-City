/* 抓首屏脚本异常：打开页面，把所有 exceptionThrown / console.error 打出来。
   EP_URL=http://127.0.0.1:8831/weave.html EP_WAIT=3000 node _dev/errprobe.mjs */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.EP_PORT || 9996);
const URLX = process.env.EP_URL;
const W = +(process.env.EP_W || 1440), H = +(process.env.EP_H || 900);
const WAIT = +(process.env.EP_WAIT || 3000);
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
  "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "ep-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 80; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(250) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    console.log("EXCEPTION", d.text, d.exception?.description?.split("\n").slice(0, 4).join(" | ") || "",
      "@", d.url || "", d.lineNumber + ":" + d.columnNumber);
  }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    console.log("CONSOLE", m.params.type, m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  }
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: URLX });
await sleep(WAIT);
console.log("STATE", await ev(`JSON.stringify({pick:document.getElementById('wvPickWrap').hidden,sys:document.getElementById('wvSysName').textContent,sysCount:document.querySelectorAll('.wv-sys').length})`));
child.kill(); process.exit(0);

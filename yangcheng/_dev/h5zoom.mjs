import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9887, W = 1500, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ych5z-"));
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
  if (clip) pa.clip = { ...clip, scale: 2 };
  let r = await send("Page.captureScreenshot", pa);
  if (!r.result?.data) r = await send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) { console.log("FAIL", n); return; }
  writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h5-collapse.html" });
await sleep(3000);
const args = process.argv.slice(2);
const zone = args[0] && args[0].startsWith("zone=") ? args.shift().slice(5) : "trellis";
await ev(`document.querySelector('.stone[data-l="${zone}"]').click()`);
await sleep(zone === "check" ? 2600 : 800);
const parts = args;
for (const p of parts) {
  const [name, x, y, w, h] = p.split(",");
  await shot(name + ".png", { x: +x, y: +y, width: +w, height: +h });
}
console.log("done");
ws.close(); child.kill();

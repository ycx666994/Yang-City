/* 普通 HTML 页面截图：node _dev/shot_html.mjs <url> <out.png> [宽] [高]
   和 dshot.mjs 用同一套 CDP 直连 Edge，只是不等 Three 引擎就绪。 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9821);
const url = process.argv[2], out = process.argv[3];
const W = +(process.argv[4] || 1340), H = +(process.argv[5] || 1600);
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--headless=new", "--no-first-run", `--window-size=${W},${H}`, "--hide-scrollbars",
  "about:blank"], { stdio: "ignore" });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0, pending = new Map();
function send(method, params = {}, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout " + method)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
try {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === "page");
      if (target) break;
    } catch { /* 还没起来 */ }
    await delay(120);
  }
  if (!target) throw new Error("no devtools target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url });
  await delay(1400);
  const r = await send("Runtime.evaluate", {
    expression: "({h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth})",
    returnByValue: true
  });
  const pageH = Math.min(r.result.value.h + 24, 4000);
  await send("Emulation.setDeviceMetricsOverride", {
    width: W, height: pageH, deviceScaleFactor: 1, mobile: false
  });
  await delay(700);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("SHOT " + out + " " + r.result.value.w + "x" + pageH);
} catch (e) {
  console.log("FAIL " + e.message);
} finally {
  try { ws && ws.close(); } catch { }
  try { child.kill(); } catch { }
}

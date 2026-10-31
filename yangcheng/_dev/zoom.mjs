// 局部放大截图：走真实缩放控件 + 拖拽，验证渲染
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9857, W = 1440, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycz-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gt() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pg = (await r.json()).find(t => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("no target");
}
const ws = new WebSocket(await gt());
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 200);
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: BASE + "/map.html" });
await sleep(2600);

console.log("before:", await ev("document.getElementById('mapSvg').getAttribute('viewBox')"));
console.log("rect:", await ev("JSON.stringify(document.getElementById('mapSvg').getBoundingClientRect())"));

// 用真实控件放大 3 档（1.28^3 ≈ 2.1x）
for (let i = 0; i < 3; i++) { await ev("document.getElementById('zIn').click();'ok'"); await sleep(120); }
await sleep(400);
console.log("after :", await ev("document.getElementById('mapSvg').getAttribute('viewBox')"));
await shot("zoom-route.png");

// 按目标中心拖拽定位
async function centerOn(tx, ty, name) {
  const vb = (await ev("document.getElementById('mapSvg').getAttribute('viewBox')")).split(" ").map(Number);
  const r = JSON.parse(await ev("JSON.stringify(document.getElementById('mapMain').getBoundingClientRect())"));
  const sx = r.width / vb[2], sy = r.height / vb[3];
  const cx0 = vb[0] + vb[2] / 2, cy0 = vb[1] + vb[3] / 2;
  const dx = -(tx - cx0) * sx, dy = -(ty - cy0) * sy;
  const ox = r.left + r.width / 2, oy = r.top + 26;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: ox, y: oy, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ox + dx, y: oy + dy, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ox + dx, y: oy + dy, button: "left", clickCount: 1 });
  await sleep(360);
  console.log(name, await ev("document.getElementById('mapSvg').getAttribute('viewBox')"));
  await shot(name);
}

await centerOn(215, 690, "zoom-h4.png");
await centerOn(490, 445, "zoom-plaza.png");
await centerOn(640, 300, "zoom-route.png");

ws.close(); child.kill();

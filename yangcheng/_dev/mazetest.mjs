import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9947;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === "Runtime.exceptionThrown") errs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text || "").split("\n")[0].slice(0, 200)) };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64")); };
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
await sleep(2600);
console.log("S0", await ev("JSON.stringify(window.YCMaze.status())"));
console.log("HINT", await ev("document.querySelector('#lockHint').classList.contains('on')"));
// 鼠标视角：直接改 ang 验证渲染管线不炸；再验证 pointerlock 是否可请求
console.log("LOCKAPI", await ev("typeof document.querySelector('#mzcv').requestPointerLock"));
await ev("document.querySelector('#mzcv').click()");
await sleep(600);
console.log("LOCKED", await ev("JSON.stringify(window.YCMaze.status().locked)"));
await ev("document.exitPointerLock && document.exitPointerLock()");
await sleep(300);
// 60 秒后逮捕者
await ev("window.YCMaze.fastForward(61)");
await sleep(900);
console.log("S1", await ev("JSON.stringify(window.YCMaze.status())"));
await shot("maze-hunt.png");
// 等它追上来（玩家不动）
await sleep(9000);
console.log("S2", await ev("JSON.stringify(window.YCMaze.status())"));
await shot("maze-caught.png");
console.log("END", await ev("(document.querySelector('#endBox').textContent||'').slice(0,60)"));
console.log("ERRS", JSON.stringify(errs.slice(0,6)));
child.kill(); process.exit(0);

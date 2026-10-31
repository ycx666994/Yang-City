import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9951;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === "Runtime.exceptionThrown") errs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text || "").split("\n")[0].slice(0, 160)) };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64")); };
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
await sleep(2600);
const box = JSON.parse(await ev("(function(){var r=document.querySelector('#mzcv').getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,w:r.width})})()"));
// 点击 → 尝试锁定
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
await sleep(900);
console.log("LOCK", await ev("JSON.stringify({locked:window.YCMaze.status().locked, ple:!!document.pointerLockElement})"));
// 鼠标移到画面右侧 → 兜底模式应当持续右转
const a0 = await ev("window.YCMaze.status().ang");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.w * 0.40, y: box.y, button: "none" });
await sleep(900);
const a1 = await ev("window.YCMaze.status().ang");
console.log("HOVER-TURN", a0.toFixed(3), "→", a1.toFixed(3), "delta", (a1 - a0).toFixed(3));
// 移回中间 → 停止
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, button: "none" });
await sleep(700);
const a2 = await ev("window.YCMaze.status().ang");
await sleep(700);
const a3 = await ev("window.YCMaze.status().ang");
console.log("DEADZONE", a2.toFixed(3), "→", a3.toFixed(3), "delta", (a3 - a2).toFixed(3));
await shot("maze-lock.png");
console.log("ERRS", JSON.stringify(errs.slice(0,4)));
child.kill(); process.exit(0);

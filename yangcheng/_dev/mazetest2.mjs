import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9949;
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
// 真实鼠标点击（CDP 事件带 user activation）
const box = JSON.parse(await ev("(function(){var r=document.querySelector('#mzcv').getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()"));
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
await sleep(700);
console.log("LOCKED", await ev("JSON.stringify(window.YCMaze.status().locked)"));
const a0 = await ev("window.YCMaze.status().ang");
// 指针锁定后移动鼠标
for (let i = 0; i < 8; i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + (i + 1) * 12, y: box.y, button: "none" });
  await sleep(40);
}
const a1 = await ev("window.YCMaze.status().ang");
console.log("TURN", a0.toFixed(3), "→", a1.toFixed(3), "delta", (a1 - a0).toFixed(3));
await shot("maze-lock.png");
// 逮捕者
await ev("window.YCMaze.fastForward(61)");
await sleep(800);
const s1 = JSON.parse(await ev("JSON.stringify(window.YCMaze.status())"));
console.log("SPAWN", "hunt=", s1.hunt, "dist=", s1.huntDist);
await sleep(4000);
const s2 = JSON.parse(await ev("JSON.stringify(window.YCMaze.status())"));
console.log("CHASE", "dist=", s2.huntDist, "t=", s2.t);
await shot("maze-hunt.png");
// 答题冻结
await ev("window.YCMaze.gotoDoor(0)");
await sleep(200);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
await sleep(400);
const f1 = JSON.parse(await ev("JSON.stringify(window.YCMaze.status())"));
await sleep(3000);
const f2 = JSON.parse(await ev("JSON.stringify(window.YCMaze.status())"));
console.log("FREEZE", "modalT=", f1.t, "→", f2.t, "| huntDist", f1.huntDist, "→", f2.huntDist, "| done", f2.done);
await shot("maze-quiz.png");
console.log("ERRS", JSON.stringify(errs.slice(0,5)));
child.kill(); process.exit(0);

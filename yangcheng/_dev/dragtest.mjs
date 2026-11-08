/* 交互体检：在真浏览器里拖一下、滚一下、双击两下，看镜头到底动没动、有没有异常。
   node _dev/dragtest.mjs
   覆盖两个页面：全城 map.html（拖转 / 滚轮钻 / 双击推进）与区域 district.html（拖平移 / 右键转 / 滚轮）。 */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.DT_PORT || 9961), W = 1440, H = 900;
const BASE = process.env.DT_BASE || "http://127.0.0.1:8831/";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const prof = mkdtempSync(join(tmpdir(), "dt-"));
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
  if (r.exceptionDetails) throw new Error("EVAL " + JSON.stringify(r.exceptionDetails).slice(0, 300));
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
  if (m.method === "Runtime.exceptionThrown") errs.push("EXC " + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push("ERR " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
};
await send("Runtime.enable"); await send("Page.enable");

const cam = `(()=>{var c=window.__yc.camera;return {p:c.position.toArray().map(v=>+v.toFixed(1)),d:+c.position.distanceTo(window.__yc.city?window.__yc.city.center||{x:0,y:0,z:0}:{x:0,y:0,z:0}).toFixed(1)};})()`;
const scale = `(()=>{var o=document.getElementById('scaleLabel');return o?o.textContent+'|'+(o.dataset.zone||''):'--';})()`;
const camPos = `(()=>{var c=window.__yc.camera;return c.position.toArray().map(v=>+v.toFixed(1));})()`;
const camDist = `(()=>{var c=window.__yc.camera;return +c.position.length().toFixed(1);})()`;

async function mouse(type, x, y, extra = {}) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mouseReleased" ? 0 : 1, ...extra });
}
async function wheel(x, y, dy) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy, button: "none", buttons: 0 });
}
async function drag(x0, y0, x1, y1, mods = 0) {
  await mouse("mousePressed", x0, y0, { modifiers: mods });
  for (let i = 1; i <= 6; i++) {
    await mouse("mouseMoved", x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6, { modifiers: mods });
    await delay(35);
  }
  await mouse("mouseReleased", x1, y1, { modifiers: mods });
  await delay(500);
}
async function goto(page, wait = 9000) {
  errs = [];
  await send("Page.navigate", { url: BASE + page });
  await delay(wait);
}

console.log("=== district.html 拖拽 ===");
await goto("district.html?zone=D01&debug=1&time=10");
let a = await ev(camPos);
await drag(700, 500, 850, 560);
let b = await ev(camPos);
console.log("左键拖（平移）", JSON.stringify(a), "->", JSON.stringify(b), Math.abs(b[0] - a[0]) + Math.abs(b[2] - a[2]) > 1 ? "MOVED" : "STILL");
await drag(700, 500, 820, 470, 8); /* 8 = Shift */
let c = await ev(camPos);
console.log("Shift 拖（转视角）", JSON.stringify(c), Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]) > 1 ? "MOVED" : "STILL");
let d0 = await ev(camDist);
await wheel(720, 480, -520); await delay(600);
let d1 = await ev(camDist);
console.log("滚轮推近", d0, "->", d1, d1 < d0 - 5 ? "OK" : "NO-CHANGE", errs.length ? errs.slice(0, 3) : "clean");

console.log("=== map.html 缩放 ===");
await goto("map.html?debug=1&time=10", 16000);
console.log("初始比例尺", await ev(scale));
await wheel(760, 470, -240); await delay(400);
await wheel(760, 470, -240); await delay(1500);
console.log("滚两下", await ev(scale));
await wheel(760, 470, -240); await delay(400);
await wheel(760, 470, -240); await delay(1500);
console.log("再滚两下", await ev(scale));
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 760, y: 470, button: "left", clickCount: 1, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 760, y: 470, button: "left", clickCount: 1, buttons: 0 });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 760, y: 470, button: "left", clickCount: 2, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 760, y: 470, button: "left", clickCount: 2, buttons: 0 });
await delay(1600);
console.log("双击后", await ev(scale));
let zo = await ev(`(()=>{var b=document.getElementById('zoomIn');return b?b.offsetWidth+"/"+b.offsetHeight:"MISSING";})()`);
console.log("＋按钮尺寸(可见性)", zo);
console.log("errors", errs.length ? errs.slice(0, 4) : "clean");
try { ws.close(); } catch {}
child.kill();
process.exit(0);

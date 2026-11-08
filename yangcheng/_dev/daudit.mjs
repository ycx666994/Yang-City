/* 全区巡检：同一个浏览器里依次打开每个区的 district 页面，只读数据、不截图。
   node _dev/daudit.mjs [D01 D02 ...]   —— 默认 D01…D13
   输出：每区的 hero 数量/类型、建筑数、报错数，以及总览表。
   用途：改过 build() 主流程（noBuild 判据、地面分支、材质表）之后，
   一次跑完所有区，确认没有哪个区的建筑数塌掉或报错。 */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9840);
const BASE = process.env.YC_BASE || "http://127.0.0.1:8766/district.html";
const zones = process.argv.slice(2).length ? process.argv.slice(2)
  : ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13"];
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), "daudit-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--use-gl=angle",
  "--use-angle=swiftshader", "--window-size=1200,760", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0, pending = new Map(), errors = [];
function send(method, params = {}, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout " + method)); }, timeout);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression, timeout = 90000) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeout);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
try {
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === "page");
      if (target) break;
    } catch {}
    await delay(150);
  }
  if (!target) throw new Error("no target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{window.__err=null;window.addEventListener('error',function(e){window.__err=(e.message||'')+' @'+((e.filename||'').split('/').pop())+':'+e.lineno;});})()` });
  const rows = [];
  for (const z of zones) {
    await send("Page.navigate", { url: `${BASE}?zone=${z}&debug=1` });
    let ok = false;
    for (let i = 0; i < 120; i++) {
      ok = await ev("!!(window.__yc && window.__yc.city)");
      if (ok) break;
      await delay(400);
    }
    if (!ok) { rows.push({ z, fail: await ev("window.__err") }); continue; }
    await delay(500);
    const d = await ev(`(()=>{var c=window.__yc.city;return {b:c.buildingCount, h:(c.heroInfo||[]).length,
      t:(c.heroInfo||[]).map(function(x){return x.type;}), err:(c.errors||[]).length, rd:(c.roads||[]).length};})()`);
    rows.push({ z, ...d });
    console.log("ZONE", z, JSON.stringify(d));
  }
  console.log("SUM", JSON.stringify(rows));
  console.log("ERRS", JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  console.error("FAIL", e.message);
  process.exitCode = 1;
} finally {
  try { ws.close(); } catch {}
  child.kill();
  process.exit(process.exitCode || 0);
}

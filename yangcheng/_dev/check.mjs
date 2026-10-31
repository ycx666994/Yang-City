// 杨城体检：file:// 下三页是否真跑起来（含仪器实际运行）
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9811, W = 1440, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yc-"));
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
let id = 0; const pend = new Map(); let errs = [], fails = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push("console:" + m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 140));
  if (m.method === "Network.loadingFailed")
    fails.push(String(m.params.errorText || "").slice(0, 60));
};
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 160);
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ---------- 1. 城市 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/index.html" });
await sleep(2600);
const city = await ev(`JSON.stringify({
  title: document.title,
  halls: document.querySelectorAll('.bld').length,
  ready: document.querySelectorAll('.bld.ready').length,
  build: document.querySelectorAll('.bld.build').length,
  list: document.querySelectorAll('#hallList .rec').length,
  avail: document.getElementById('cAvail').textContent,
  sky: !!document.getElementById('ycSky'),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
await shot("city.png");
console.log("城市:", city, "| errs:", errs.length ? errs : "none", "| net:", fails.length ? fails : "none");

/* ---------- 2. 指标馆 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/h3-metrics.html" });
await sleep(2200);
const devOK = await ev(`(function(){
  return JSON.stringify({
    cells: document.querySelectorAll('#rooms .rm').length,
    p: document.getElementById('stP').textContent,
    t: document.getElementById('stT').textContent,
    note: document.getElementById('devNote').textContent.slice(0,40)
  });
})()`);
await shot("h3-story.png");

// 切到仪器层并跑尸检
await ev(`document.querySelector('[data-l="instrument"]').click()`);
await sleep(300);
await ev(`document.getElementById('btnAutopsy').click()`);
await sleep(1400);
const inst = await ev(`JSON.stringify({
  verdict: document.getElementById('verdict').innerText.replace(/\\n/g,' | ').slice(0,150),
  thetaRows: document.querySelectorAll('#thetaBody tr').length,
  detect: document.getElementById('tagDetect').textContent,
  peak: document.getElementById('outPeak').innerText.replace(/\\n/g,' / '),
  decline: document.getElementById('outDecline').innerText.replace(/\\n/g,' / '),
  structural: document.getElementById('outStructural').innerText.replace(/\\n/g,' / '),
  json: document.getElementById('evidenceJson').textContent.length,
  stored: JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]').length
})`);
await shot("h3-instrument.png");

// 证据层
await ev(`document.querySelector('[data-l="evidence"]').click()`);
await sleep(400);
const evid = await ev(`JSON.stringify({
  selfRows: document.querySelectorAll('#selfTestBody tr').length,
  rec: document.getElementById('stRec').textContent
})`);
await shot("h3-evidence.png");
console.log("装置:", devOK);
console.log("仪器:", inst);
console.log("证据层:", evid, "| errs:", errs.length ? errs : "none", "| net:", fails.length ? fails : "none");

/* ---------- 3. 证据厅 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/evidence.html" });
await sleep(1800);
const evd = await ev(`JSON.stringify({
  items: document.querySelectorAll('#evitems .evi').length,
  tray: document.getElementById('trayTag').textContent,
  detail: document.querySelector('.evhead h1') ? document.querySelector('.evhead h1').textContent : null,
  axes: document.querySelectorAll('.ax').length,
  checksumOk: (document.querySelector('.evhead .meta')||{}).innerText ? document.querySelector('.evhead .meta').innerText.includes('通过') : false
})`);
await shot("evidence.png");
console.log("证据厅:", evd, "| errs:", errs.length ? errs : "none", "| net:", fails.length ? fails : "none");

/* ---------- 4. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + "/index.html" });
await sleep(1800);
const mob = await ev(`JSON.stringify({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  halls: document.querySelectorAll('.bld').length
})`);
await shot("city-mobile.png");
console.log("窄屏城市:", mob);

ws.close();
child.kill();

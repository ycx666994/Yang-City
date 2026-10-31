import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9973, W = 1400, H = 940;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || ""));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n, clip) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, ...(clip ? { clip } : {}) }); if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64")); else console.log("EMPTY", n); };
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

const halls = [
  ["h2-forensic.html", "H2", "shen"],
  ["h3-metrics.html", "H3", "bai"],
  ["h4-contam.html", "H4", "cen"],
  ["h5-collapse.html", "H5", "wen"],
  ["h6-budget.html", "H6", "lu"]
];

for (const [page, hall, who] of halls) {
  await send("Page.navigate", { url: BASE + "/" + page }); await sleep(2600);
  const info = await ev(`(function(){
    var o={bond:{},camp:{},met:{},oral:{},said:{},flag:{}};
    o.bond['${who}']=62; o.met['${hall}']=1;
    localStorage.setItem('yc.cast.v1',JSON.stringify(o));
    localStorage.setItem('yc.cast.cur.${hall}','${who}');
    return 1;})()`);
  await send("Page.navigate", { url: BASE + "/" + page }); await sleep(2600);
  await ev(`(function(){var c=document.querySelector('.castcamp'); if(c) c.classList.remove('open');
    var p=document.querySelector('.castpanel'); if(p) p.classList.remove('open'); return 1;})()`);
  await sleep(300);
  const dock = await ev(`(function(){var b=document.querySelector('.castdock').getBoundingClientRect();
    return JSON.stringify({x:b.x-12,y:b.y-12,width:b.width+24,height:b.height+24});})()`);
  await shot("face-dock-" + hall + ".png", { ...JSON.parse(dock), scale: 2 });

  await ev(`(function(){YCCast.openCard('${hall}','${who}'); return 1;})()`);
  await sleep(700);
  const hasCard = await ev(`!!document.querySelector('.castcard.open')`);
  if (hasCard) {
    const box = await ev(`(function(){var b=document.querySelector('.cstc-box').getBoundingClientRect();
      return JSON.stringify({x:b.x,y:b.y,width:b.width,height:b.height});})()`);
    await shot("face-card-" + hall + ".png", { ...JSON.parse(box), scale: 2 });
  } else {
    console.log("NO CARD", hall);
  }
  console.log(hall, "dock ok", !!dock, "card", hasCard);
}
console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
ws.close(); child.kill();

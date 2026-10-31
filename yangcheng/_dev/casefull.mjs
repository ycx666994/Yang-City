import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9943;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === "Runtime.exceptionThrown") errs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text || "").split("\n")[0].slice(0, 200)) };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64")); };
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/yangcheng/h2-case.html" });
await sleep(3200);
console.log("CAMPOPEN", await ev("!!document.querySelector('.castcamp.open')"));
await ev("var m=document.querySelector('.castcamp'); if(m) m.classList.remove('open');");
// 幕一
await ev("['a','b','c'].forEach(function(k){ var b=document.querySelector('#pick1 [data-p=\"'+k+'\"]'); if(b) b.click(); }); document.querySelector('#btnAct1').click();");
await sleep(300);
await ev("document.querySelector('[data-a=\"2\"]').click()");
await sleep(300);
// 测满六个
for (let i = 0; i < 6; i++) {
  await ev(`(function(){ var b=document.querySelector('#wlist [data-w="${i}"]'); if(b) b.click(); })()`);
  await sleep(120);
  await ev("(function(){ var b=document.querySelector('#btnTest'); if(b) b.click(); })()");
  await sleep(1500);
}
console.log("S2", await ev("JSON.stringify(window.YCCase.status())"));
await ev("document.querySelector('#btnAct2').click()");
await sleep(300);
console.log("ACT", await ev("JSON.stringify(window.YCCase.status())"));
await shot("case-act3.png");
// 幕三
await ev("document.querySelector('#q1opts [data-q=\"b\"]').click()");
await sleep(150);
await ev("document.querySelector('#q2opts [data-q=\"b\"]').click()");
await sleep(250);
console.log("Q", await ev("document.querySelector('#btnAct3').disabled"));
await ev("document.querySelector('#btnAct3').click()");
await sleep(400);
console.log("ACT4", await ev("JSON.stringify(window.YCCase.status())"));
// 幕四
await ev("document.querySelector('#f1 [data-f=\"tier\"]').click(); document.querySelector('#f2 [data-f=\"urg\"]').click(); document.querySelector('#f3 [data-f=\"b\"]').click();");
await sleep(250);
console.log("SUBMITDIS", await ev("document.querySelector('#btnSubmit').disabled"));
await ev("document.querySelector('#btnSubmit').click()");
await sleep(700);
console.log("RESULT", await ev("(document.querySelector('#resultBox').textContent||'').slice(0,120)"));
console.log("CERT", await ev("!!document.querySelector('#btnCert')"));
console.log("ERRS", JSON.stringify(errs.slice(0,8)));
await ev("window.scrollTo(0,0)");
await shot("case-result.png");
child.kill(); process.exit(0);

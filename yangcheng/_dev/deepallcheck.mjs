/* H4/H5/H6 展品长廊 本地体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9945, W = 1440, H = 960;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycdp-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push((m.params.exceptionDetails.exception || {}).description || "ex");
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async n => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
let bad = 0;
const gate = (n, ok, d) => { if (!ok) bad++; console.log((ok ? "OK  " : "BAD ") + n + "  " + d); };

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

for (const [nm, page, navSel] of [
  ["H4 长廊", "h4-contam.html", '.h4rail .door[data-l="deep"]'],
  ["H5 长廊", "h5-collapse.html", '.stone[data-l="deep"]'],
  ["H6 长廊", "h6-budget.html", '.ks[data-l="deep"]']
]) {
  errs = [];
  await send("Page.navigate", { url: BASE + "/" + page });
  await sleep(3000);
  await ev(`document.querySelector('${navSel}').click()`);
  await sleep(800);
  const d = JSON.parse(await ev(`JSON.stringify({
    deep: typeof YCDeep === 'object',
    cards: document.querySelectorAll('#dpGallery .dpg-c').length,
    certs: document.querySelectorAll('#dpCerts .dpc-card').length,
    verify: document.querySelectorAll('#dpGallery .dpg-vb').length,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })`));
  /* 点开第 1 件 + 现场验证 + 答对第一题 */
  const w = JSON.parse(await ev(`(function(){
    document.querySelector('#dpGallery .dpg-c').click();
    var vb = document.querySelector('#dpGallery .dpg-vb'); if (vb) vb.click();
    var q = document.querySelector('#dpGallery .dpg-quiz');
    var vr = (document.getElementById('dpgVr')||{}).textContent || '';
    return JSON.stringify({quiz: !!q, verifyTxt: vr.slice(0,80), opts: document.querySelectorAll('#dpGallery .dpg-opt').length, vbtn: document.querySelectorAll('#dpGallery .dpg-vb').length});
  })()`));
  /* 八件全通 → 领参观证书 */
  const c = JSON.parse(await ev(`(function(){
    var ids = YCDeep.itemsOf('${page === "h4-contam.html" ? "H4" : page === "h5-collapse.html" ? "H5" : "H6"}');
    for (var i=0;i<ids.length;i++) YCDeep.markQuiz('${page === "h4-contam.html" ? "H4" : page === "h5-collapse.html" ? "H5" : "H6"}', ids[i].id, true);
    location.reload();
    return JSON.stringify({n: ids.length});
  })()`));
  await sleep(2600);
  await ev(`document.querySelector('${navSel}').click()`);
  await sleep(600);
  const cc = JSON.parse(await ev(`(function(){
    var b = document.querySelector('#dpCerts [data-get="visitor"]');
    if (b && !b.disabled) b.click();
    var no = document.querySelector('#dpCerts .dpc-no');
    return JSON.stringify({no: no ? no.textContent : null, btn: b ? b.textContent : null});
  })()`));
  gate(nm, d.deep && d.cards === 8 && d.certs === 2 && d.ovf === 0 && !errs.length
       && w.quiz && w.opts === 3 && w.vbtn === 1 && w.verifyTxt.length > 4 && cc.no && cc.no.indexOf("-V-") > 0,
    `展品=${d.cards} 验证键=${w.vbtn} 题=${w.opts} 验证输出=${w.verifyTxt.slice(0,26)} 证书=${cc.no} ovf=${d.ovf}`);
  if (errs.length) console.log("   ERR:", errs.slice(0,2));
  await shot("deep-" + page.replace(".html","") + ".png");
}

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

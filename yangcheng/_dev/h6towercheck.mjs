/* H6 精英挑战 · 预算塔 · 十层 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9943, W = 1360, H = 1000;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yctw-"));
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
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push(m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
let bad = 0;
function gate(name, ok, detail) { if (!ok) bad++; console.log((ok ? "OK  " : "BAD ") + name + "  " + detail); }

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h6-tower.html" });
await sleep(3000);

/* 1. 结构 */
const s1 = JSON.parse(await ev(`JSON.stringify({
  api: typeof YCTower === 'object',
  st: YCTower ? YCTower.status() : null,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("塔页结构", s1.api && s1.st.levels === 10 && s1.st.acts === 5 && s1.st.k === 1 && s1.st.rep === 3 && s1.ovf === 0,
  `层=${s1.st.levels} 行动=${s1.st.acts} k=${s1.st.k} 信誉=${s1.st.rep} ovf=${s1.ovf}`);

/* 2. 试算面板：每个行动都给出结果 */
const s2 = JSON.parse(await ev(`(function(){
  var aps = Array.prototype.map.call(document.querySelectorAll('.twact .ap'), function(x){return x.innerText;});
  return JSON.stringify({n:aps.length, hasK: aps.filter(t=>t.indexOf('k ')>=0||t.indexOf('指标不变')>=0).length});
})()`));
gate("行动试算", s2.n === 5 && s2.hasK === 5, `行动=${s2.n} 带试算=${s2.hasK}`);

/* 3. 最优路径十层全过 */
const s3 = JSON.parse(await ev(`(function(){
  var st = YCTower.solve();
  var sc = YCTower.score();
  return JSON.stringify({st:st, sc:sc});
})()`));
gate("最优路径登顶", s3.st.floor === 10 && s3.st.wins === 10 && s3.st.fails === 0 && s3.sc.total === 100,
  `层=${s3.st.floor} 过=${s3.st.wins} 失=${s3.st.fails} 分=${s3.sc.total}`);

/* 4. 精英证书 */
const s4 = JSON.parse(await ev(`(function(){
  var certs = JSON.parse(localStorage.getItem('yc.deep.v1') || '{}');
  var c = certs.H6 && certs.H6.certs ? certs.H6.certs.elite : null;
  return JSON.stringify({cert: c?{no:c.no,score:c.score,detail:c.detail}:null,
    end: !!document.querySelector('.twend'),
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("精英证书", s4.cert && s4.cert.no.startsWith("YC-H6-E-") && s4.end && s4.ovf === 0,
  `证书=${s4.cert?s4.cert.no:"无"} 分=${s4.cert?s4.cert.score:"-"} ovf=${s4.ovf}`);
await shot("h6-tower.png");

/* 5. 错误路径：一路升温会掉信誉 */
await ev(`location.reload()`);
await sleep(2600);
const s5 = JSON.parse(await ev(`(function(){
  for (var i = 0; i < 5; i++) YCTower.act('tup');
  return JSON.stringify(YCTower.status());
})()`));
gate("错误路径扣信誉", s5.rep < 3 && s5.fails > 0, `信誉=${s5.rep} 失=${s5.fails} k=${s5.k} τ=${s5.tau}`);

/* 6. 塔崩即结算 */
const s6 = JSON.parse(await ev(`(function(){
  for (var i = 0; i < 10 && !YCTower.status().over; i++) YCTower.act('tdn');
  var st = YCTower.status();
  return JSON.stringify({st:st, end: !!document.querySelector('.twend'),
    sc: YCTower.score(),
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("信誉耗尽则塔崩", s6.st.over && s6.st.rep === 0 && s6.end && s6.sc.s3 === 0 && s6.ovf === 0,
  `信誉=${s6.st.rep} 崩=${s6.st.over} 登顶分=${s6.sc.s3} 总分=${s6.sc.total} ovf=${s6.ovf}`);

/* 7. 窄屏 */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h6-tower.html" });
await sleep(2400);
const s7 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  lv: document.querySelectorAll('.twlv').length,
  hud: getComputedStyle(document.querySelector('.twhud')).gridTemplateColumns.split(' ').length
})`));
gate("窄屏不溢出", s7.ovf === 0 && s7.lv === 10 && s7.hud === 2,
  `ovf=${s7.ovf} 层=${s7.lv} HUD列=${s7.hud}`);
await shot("h6-tower-narrow.png");

gate("无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

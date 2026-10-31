/* H5 精英挑战 · 坍塌预报台 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9941, W = 1360, H = 1000;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycfc-"));
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
await send("Page.navigate", { url: BASE + "/h5-forecast.html" });
await sleep(3000);

/* 1. 结构：8 行 × k 列 */
const s1 = JSON.parse(await ev(`JSON.stringify({
  api: typeof YCForecast === 'object',
  st: YCForecast ? YCForecast.status() : null,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("预报台结构", s1.api && s1.st.rows === 8 && s1.st.cols === 10 && s1.ovf === 0,
  `行=${s1.st.rows} 列=${s1.st.cols} ovf=${s1.ovf}`);

/* 2. 三轮答案键与实测一致 */
const s2 = JSON.parse(await ev(`(function(){
  var out = [];
  for (var i = 0; i < 3; i++) { out.push(YCForecast.fate()); if (i<2) { YCForecast.fillTrue(); YCForecast.submit(); YCForecast.submit(); } }
  return JSON.stringify(out);
})()`));
const want = [
  ["alive","alive","alive","alive","wilted","blind","blind","blind"],
  ["alive","alive","alive","alive","alive","alive","alive","blind"],
  ["wilted","wilted","wilted","blind","blind","blind","blind","blind"]
];
const same = s2.every((f, i) => JSON.stringify(f) === JSON.stringify(want[i]));
gate("三轮答案键", same, same ? "与内核 fate 完全一致" : JSON.stringify(s2));

/* 3. 诊断：加预算揭示盲层 */
await ev(`location.reload()`);
await sleep(2800);
const s3b = JSON.parse(await ev(`(function(){
  var before = YCForecast.status().diagLeft;
  YCForecast.diag('N');
  var after = YCForecast.status().diagLeft;
  var t = document.getElementById('dres').innerText;
  return JSON.stringify({before:before, after:after, txt:t.slice(0,120)});
})()`));
gate("加预算诊断", s3b.after === s3b.before - 1 && s3b.txt.indexOf("盲层") >= 0,
  `额度 ${s3b.before}→${s3b.after} · ${s3b.txt.replace(/\n/g," ").slice(0,60)}`);

/* 4. 诊断额度只有两次 */
const s4 = JSON.parse(await ev(`(function(){
  YCForecast.diag('G');
  var left = YCForecast.status().diagLeft;
  YCForecast.diag('N');
  return JSON.stringify({left:left, after:YCForecast.status().diagLeft});
})()`));
gate("诊断额度上限", s4.left === 0 && s4.after === 0, `剩 ${s4.left} → 再点仍是 ${s4.after}`);

/* 5. 插旗 + 提交揭示 */
const s5 = JSON.parse(await ev(`(function(){
  YCForecast.fillAll('alive');
  var n0 = document.getElementById('flagN').textContent;
  YCForecast.submit();
  var s = YCForecast.status();
  var marks = document.querySelectorAll('.fcflag .mark').length;
  return JSON.stringify({n0:n0, revealed:s.revealed, correct:s.correct, marks:marks,
    btn: document.getElementById('btnSubmit').textContent});
})()`));
gate("插旗与提交", s5.n0 === "8" && s5.revealed && s5.marks === 8 && s5.btn.indexOf("下一轮") >= 0,
  `插旗=${s5.n0} 判对=${s5.correct[0]}/8 标记=${s5.marks} 按钮=${s5.btn}`);

/* 6. 走完全部三轮 → 满分 + 精英证书 */
await ev(`location.reload()`);
await sleep(2800);
const s6b = JSON.parse(await ev(`(function(){
  for (var i = 0; i < 3; i++) {
    YCForecast.fillTrue();
    YCForecast.submit();      // 提交本轮
    YCForecast.submit();      // 下一轮 / 结算
  }
  var sc = YCForecast.score();
  var certs = JSON.parse(localStorage.getItem('yc.deep.v1') || '{}');
  var c = certs.H5 && certs.H5.certs ? certs.H5.certs.elite : null;
  return JSON.stringify({sc:sc, cert:c?{no:c.no,score:c.score}:null,
    end: !!document.querySelector('.fcend'),
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("三轮全对与精英证书", s6b.sc.total === 100 && s6b.cert && s6b.cert.no.startsWith("YC-H5-E-") && s6b.ovf === 0,
  `总分=${s6b.sc.total} 明细=${JSON.stringify(s6b.sc.correct)} 证书=${s6b.cert?s6b.cert.no:"无"} ovf=${s6b.ovf}`);
await shot("h5-forecast.png");

/* 7. 窄屏 */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h5-forecast.html" });
await sleep(2400);
const s7 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  rows: document.querySelectorAll('.fcrow').length,
  cellH: document.querySelector('.fccells').getBoundingClientRect().height
})`));
gate("窄屏不溢出", s7.ovf === 0 && s7.rows === 8 && s7.cellH > 8,
  `ovf=${s7.ovf} 行=${s7.rows} 单元高=${s7.cellH}`);
await shot("h5-forecast-narrow.png");

gate("无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

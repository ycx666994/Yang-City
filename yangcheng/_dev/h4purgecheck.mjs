/* H4 精英挑战 · 净化车间 · 十二道工序 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9939, W = 1360, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycpg-"));
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
await send("Page.navigate", { url: BASE + "/h4-purge.html" });
await sleep(2500);

/* 1. 结构 */
const s1 = JSON.parse(await ev(`JSON.stringify({
  api: typeof YCPurge === 'object',
  st: YCPurge ? YCPurge.status() : null,
  pips: document.querySelectorAll('#pips i').length,
  w: document.querySelectorAll('#wSteps button').length,
  n: document.querySelectorAll('#nSteps button').length,
  ops: document.querySelectorAll('.pgop').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("页面结构", s1.api && s1.pips === 12 && s1.w === 5 && s1.n === 5 && s1.ops === 4 && s1.ovf === 0,
  `额度=${s1.pips} 档位=${s1.w}/${s1.n} 工序=${s1.ops} ovf=${s1.ovf}`);

/* 2. 起始参数必判不可用：w=0.15 → vacuous */
const s2 = JSON.parse(await ev(`(function(){
  YCPurge.set({wi:0, ni:0, ln:0.35, left:12});
  YCPurge.run();
  var s = YCPurge.status();
  var right = YCPurge.rightAnswer();
  return JSON.stringify({s:s, right:right, modal: document.getElementById('mask').classList.contains('on')});
})()`));
gate("起始态不可判", s2.s.verdict === "undetermined" && s2.s.subtype === "vacuous" && s2.modal,
  `判定=${s2.s.verdict}/${s2.s.subtype} 诊断题=${s2.modal}`);

/* 3. 诊断题：答对返还工序 */
const s3 = JSON.parse(await ev(`(function(){
  var before = YCPurge.status().left;
  var r = YCPurge.rightAnswer();
  YCPurge.answer(r);
  var after = YCPurge.status();
  document.getElementById('qNext').click();
  return JSON.stringify({before:before, after:after, right:r});
})()`));
gate("诊断答对返还", s3.after.right === 1 && s3.after.left === s3.before + 1,
  `额度 ${s3.before} → ${s3.after.left} 答对=${s3.after.right}`);

/* 4. 拉满改写 → 探针断开，守卫红 */
const s4 = JSON.parse(await ev(`(function(){
  YCPurge.set({wi:4, ni:2, ln:0.14, left:12});
  YCPurge.run();
  var s = YCPurge.status();
  YCPurge.answer(YCPurge.rightAnswer());
  document.getElementById('qNext').click();
  return JSON.stringify(s);
})()`));
gate("改写过猛则探针断开", s4.verdict === "undetermined" && s4.subtype === "probe" && s4.greens < s4.guards,
  `判定=${s4.verdict}/${s4.subtype} 守卫=${s4.greens}/${s4.guards}`);

/* 5. 正确参数 → 判定明确 + 守卫全绿 + 复核一致 */
const s5 = JSON.parse(await ev(`(function(){
  YCPurge.set({wi:2, ni:2, ln:0.14, left:12});
  YCPurge.run();
  var a = YCPurge.status();
  YCPurge.answer(YCPurge.rightAnswer());
  document.getElementById('qNext').click();
  YCPurge.rep();
  var b = YCPurge.status();
  return JSON.stringify({a:a, b:b});
})()`));
gate("正确参数可判", s5.a.verdict !== "undetermined" && s5.a.greens === s5.a.guards,
  `判定=${s5.a.verdict}/${s5.a.subtype} 守卫=${s5.a.greens}/${s5.a.guards}`);
gate("换种子复核一致", s5.b.verify && s5.b.verify.same === true,
  `复核=${s5.b.verify ? s5.b.verify.verdict + " / same=" + s5.b.verify.same : "无"}`);

/* 6. 封卷结算 + 精英证书 */
const s6 = JSON.parse(await ev(`(function(){
  YCPurge.seal();
  var sc = YCPurge.score();
  var certs = JSON.parse(localStorage.getItem('yc.deep.v1') || '{}');
  var c = certs.H4 && certs.H4.certs ? certs.H4.certs.elite : null;
  return JSON.stringify({
    sc:sc, cert:c ? {no:c.no, score:c.score, detail:c.detail} : null,
    end: !!document.querySelector('.pgend'),
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  });
})()`));
gate("结算与精英证书", s6.end && s6.sc.elite && s6.cert && s6.cert.no.startsWith("YC-H4-E-") && s6.ovf === 0,
  `总分=${s6.sc.total} 精英=${s6.sc.elite} 证书=${s6.cert ? s6.cert.no : "无"} ovf=${s6.ovf}`);
await shot("h4-purge.png");

/* 7. 窄屏 */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h4-purge.html" });
await sleep(2000);
const s7 = JSON.parse(await ev(`(function(){
  YCPurge.set({wi:2, ni:2, ln:0.14, left:12});
  YCPurge.run();
  YCPurge.answer(YCPurge.rightAnswer());
  document.getElementById('qNext').click();
  return JSON.stringify({
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    kv: getComputedStyle(document.querySelector('.pgkv')).gridTemplateColumns.split(' ').length,
    gd: getComputedStyle(document.querySelector('.pgguard')).gridTemplateColumns.split(' ').length
  });
})()`));
gate("窄屏不溢出", s7.ovf === 0 && s7.kv === 2 && s7.gd === 1,
  `ovf=${s7.ovf} 指标列=${s7.kv} 守卫列=${s7.gd}`);
await shot("h4-purge-narrow.png");

gate("无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

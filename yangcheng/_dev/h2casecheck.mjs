/* H2 精英挑战 · 案卷 0117「十一日」体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9931, W = 1420, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yccase-"));
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
function gate(name, ok, detail) {
  if (!ok) bad++;
  console.log((ok ? "OK  " : "BAD ") + name + "  " + detail);
}

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h2-case.html" });
await sleep(2600);

/* ---------- 1. 结构 ---------- */
const s1 = JSON.parse(await ev(`JSON.stringify({
  acts: document.querySelectorAll('.c2act').length,
  layers: document.querySelectorAll('.c2lay').length,
  pips: document.querySelectorAll('#pips i').length,
  wit: document.querySelectorAll('#wlist .c2w').length,
  picks: document.querySelectorAll('#pick1 .c2p').length,
  hasF: typeof YCForensic === 'object',
  hasD: typeof YCDeep === 'object',
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("结构", s1.acts === 4 && s1.layers === 4 && s1.pips === 8 && s1.wit === 6 &&
  s1.picks === 6 && s1.hasF && s1.hasD && s1.ovf === 0,
  `幕=${s1.acts} 层=${s1.layers} 点=${s1.pips} 证人=${s1.wit} 疑点=${s1.picks} 内核=${s1.hasF}/${s1.hasD} ovf=${s1.ovf}`);
await shot("case-1-scene.png");

/* ---------- 2. 幕一：选对三个 ---------- */
for (const p of ["a", "b", "c"]) {
  await ev(`document.querySelector('#pick1 [data-p="${p}"]').click()`);
  await sleep(90);
}
await ev(`document.getElementById('btnAct1').click()`);
await sleep(400);
const s2 = JSON.parse(await ev(`JSON.stringify({
  hint: document.getElementById('act1Hint').textContent,
  act2: !document.querySelector('.c2act[data-a="2"]').disabled,
  ok: document.querySelectorAll('#pick1 .c2p.ok').length
})`));
gate("幕一·勘察", s2.hint.indexOf("15 / 15") >= 0 && s2.act2 && s2.ok === 3,
  `${s2.hint} 绿=${s2.ok} 幕二解锁=${s2.act2}`);

/* ---------- 3. 幕二：六位全测 ---------- */
await ev(`document.querySelector('.c2act[data-a="2"]').click()`);
await sleep(400);
const keys = ["urg", "tier", "hist", "sent", "wait", "note"];
for (let i = 0; i < 6; i++) {
  await ev(`document.querySelectorAll('#wlist .c2w')[${i}].click()`);
  await sleep(120);
  await ev(`document.getElementById('btnTest').click()`);
  /* 干预演算是逐格真跑 90 次 intervene()，约 0.9 秒。
     期间 st.busy=true，按钮 disabled —— 必须等它跑完再点下一个证人。 */
  for (let w = 0; w < 30; w++) {
    const b = await ev(`(window.YCCase && YCCase.status().busy) ? 1 : 0`);
    if (!b) break;
    await sleep(150);
  }
  await sleep(120);
}
await sleep(300);
const s3 = JSON.parse(await ev(`JSON.stringify({
  tested: document.querySelectorAll('#wlist .c2w.tested').length,
  wall: document.querySelectorAll('#wall .c2row').length,
  pips: document.getElementById('pipN').textContent,
  act2: !document.getElementById('btnAct2').disabled,
  vals: [].map.call(document.querySelectorAll('#wlist .c2w .mk'), e => e.textContent)
})`));
const rate = k => parseFloat(s3.vals[keys.indexOf(k)]);
gate("幕二·审讯", s3.tested === 6 && s3.wall === 6 && s3.act2 &&
  rate("tier") >= 70 && rate("urg") <= 30 && rate("note") === 0,
  `测=${s3.tested} 墙=${s3.wall} 点=${s3.pips} tier=${rate("tier")}% urg=${rate("urg")}% note=${rate("note")}%`);
await shot("case-2-room.png");

/* ---------- 4. 幕三：两问 ---------- */
await ev(`document.getElementById('btnAct2').click()`);
await sleep(400);
await ev(`document.querySelector('#q1opts [data-q="b"]').click()`);
await sleep(120);
await ev(`document.querySelector('#q2opts [data-q="b"]').click()`);
await sleep(300);
const s4 = JSON.parse(await ev(`JSON.stringify({
  act3: !document.getElementById('btnAct3').disabled,
  pair: document.querySelectorAll('#pairBox .c2pc').length,
  hint: document.getElementById('act3Hint').textContent
})`));
gate("幕三·对撞", s4.act3 && s4.pair >= 3, `配对卡=${s4.pair} 解锁=${s4.act3} | ${s4.hint}`);
await shot("case-3-confront.png");

/* ---------- 5. 幕四 + 结算 ---------- */
await ev(`document.getElementById('btnAct3').click()`);
await sleep(400);
await ev(`document.querySelector('#f1 [data-f="tier"]').click()`);
await sleep(90);
await ev(`document.querySelector('#f2 [data-f="urg"]').click()`);
await sleep(90);
await ev(`document.querySelector('#f3 [data-f="b"]').click()`);
await sleep(200);
await ev(`document.getElementById('btnSubmit').click()`);
await sleep(900);
const s5 = JSON.parse(await ev(`JSON.stringify({
  total: (document.querySelector('.c2total .tv')||{}).textContent,
  score: [].map.call(document.querySelectorAll('.c2sc .v'), e => e.textContent).join('/'),
  certBtn: !!document.getElementById('btnCert'),
  svg: !!document.querySelector('#resultBox svg'),
  note: (document.querySelector('#resultBox .c2note')||{}).textContent ? 1 : 0
})`));
gate("幕四·指认结算", parseInt(s5.total) >= 80 && s5.certBtn && s5.svg && s5.note,
  `总分=${s5.total} 分项=${s5.score} 证书按钮=${s5.certBtn} 证书图=${s5.svg}`);
await shot("case-4-result.png");

/* ---------- 6. 证书落库 ---------- */
const s6 = JSON.parse(await ev(`(function(){
  var c = YCDeep.getCert('H2','elite');
  return JSON.stringify({
    has: !!c,
    no: c ? c.no : null,
    ck: c ? c.checksum : null,
    tier: c ? c.tier : null,
    detail: c ? c.detail.length : 0,
    all: YCDeep.allCerts().length,
    prog: YCDeep.progress('H2').passed
  });
})()`));
gate("证书", s6.has && s6.tier === "elite" && s6.detail === 4 && /^YC-H2-E-/.test(s6.no) && s6.ck.length === 8,
  `${s6.no} 校验=${s6.ck} 明细=${s6.detail} 库内=${s6.all}`);

/* ---------- 7. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h2-case.html" });
await sleep(2400);
const s7 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  acts: document.querySelectorAll('.c2act').length,
  wit: document.querySelectorAll('#wlist .c2w').length,
  h: document.documentElement.scrollHeight
})`));
gate("窄屏", s7.ovf === 0 && s7.acts === 4 && s7.wit === 6,
  `ovf=${s7.ovf} 幕=${s7.acts} 证人=${s7.wit} 页高=${s7.h}`);
await shot("case-5-mobile.png");

console.log("\nJS 异常: " + (errs.length ? errs.slice(0, 3).join(" | ") : "无"));
console.log("结论：" + (bad === 0 ? "全部通过" : bad + " 项未通过"));
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

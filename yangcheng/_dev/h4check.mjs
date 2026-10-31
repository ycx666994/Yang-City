// H4 数据污染博物馆 · 无头体检
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9883, W = 1500, H = 940;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ych4-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page");
    if (p) { url = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 180));
};
const send = (me, pa = {}) => new Promise(r => {
  const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa }));
});
const ev = async x => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 200);
  return r.result?.result?.value;
};
const shot = async n => {
  let r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (!r.result?.data) r = await send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) { console.log("    shot FAILED:", n); return; }
  writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};

let bad = 0;
const gate = (name, ok, info) => {
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"}  ${name.padEnd(14)} ${info || ""}`);
};

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h4-contam.html" });
await sleep(2800);

/* ---------- 1. 结构 ---------- */
const s1 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  doors: document.querySelectorAll('.h4rail .door').length,
  rooms: document.querySelectorAll('.room').length,
  styleCount: document.querySelectorAll('style').length,
  cssOk: getComputedStyle(document.querySelector('.hall.h4')).overflow,
  hallH: Math.round(document.querySelector('.hall.h4').getBoundingClientRect().height),
  bench: !!document.getElementById('bench'),
  kVal: document.getElementById('kVal').textContent,
  verdict: document.getElementById('vTitle').textContent,
  guards: document.querySelectorAll('#guardList .gd').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: document.documentElement.scrollHeight
})`));
gate("结构", s1.doors === 4 && s1.rooms === 4 && s1.bench && s1.guards === 5 &&
  s1.ovf === 0 && s1.hallH <= H + 2 && s1.cssOk === "hidden",
  `门=${s1.doors} 房=${s1.rooms} 守卫=${s1.guards} 高=${s1.hallH} ovf=${s1.ovf} docH=${s1.docH}`);
gate("默认开庭", s1.kVal !== "—" && s1.verdict.indexOf("记忆主导") === 0,
  `κ̂=${s1.kVal} 结论=${s1.verdict}`);
await shot("h4-1-story.png");

/* ---------- 2. 层架 ---------- */
await ev(`document.querySelector('.h4rail .door[data-l="shelf"]').click();'ok'`);
await sleep(700);
const s2 = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#shelfBody .srow').length,
  cells: document.querySelectorAll('#shelfBody .cell').length,
  stale: document.querySelectorAll('#shelfBody .cell.stale').length,
  chg: document.querySelectorAll('#shelfBody .cell .chg').length,
  shA: document.getElementById('shA').textContent,
  shB: document.getElementById('shB').textContent,
  shC: document.getElementById('shC').textContent,
  shelfScroll: document.getElementById('shelfBody').scrollHeight > document.getElementById('shelfBody').clientHeight
})`));
gate("层架", s2.rows === 96 && s2.cells === 288 && s2.chg > 0 && s2.shelfScroll,
  `行=${s2.rows} 卡=${s2.cells} 回吐=${s2.stale} 改数标记=${s2.chg} 甲乙丙=${s2.shA}/${s2.shB}/${s2.shC}`);
await shot("h4-2-shelf.png");

/* ---------- 3. 抽卷 ---------- */
await ev(`document.querySelectorAll('#shelfBody .srow')[3].click();'ok'`);
await sleep(400);
const s3 = JSON.parse(await ev(`JSON.stringify({
  cards: document.querySelectorAll('#drawer .dcard').length,
  txt: (document.querySelector('#drawer .dcard .dt')||{}).textContent || '',
  sel: document.querySelectorAll('#shelfBody .srow.sel').length
})`));
gate("抽卷", s3.cards === 3 && s3.txt.length > 10 && s3.sel === 1,
  `卡=${s3.cards} 选中=${s3.sel} 题面=${s3.txt.slice(0, 22)}`);
await shot("h4-3-drawer.png");

/* ---------- 4. 五种失效路径 ---------- */
async function setKnob(knobId, val) {
  await ev(`(function(){var e=document.getElementById('${knobId}');e.value=${val};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`);
  await sleep(700);
}
const probe = async () => JSON.parse(await ev(`JSON.stringify({
  v: document.getElementById('vTitle').textContent,
  k: document.getElementById('kVal').textContent,
  acc: document.getElementById('chanAccS').textContent,
  tr: document.getElementById('chanTraceS').textContent,
  guards: Array.prototype.map.call(document.querySelectorAll('#guardList .gd'), function(g){return g.className.replace('gd ','')}).join('')
})`));

await setKnob("kMem", 0);
let p = await probe();
gate("记忆为零", p.v.indexOf("未检出暴露优势") === 0, `${p.v} 通道=${p.acc}/${p.tr}`);
await shot("h4-4-mem0.png");

await setKnob("kMem", 95);
await setKnob("kRewrite", 10);
p = await probe();
gate("空变体", p.v.indexOf("不可判定") === 0 && p.v.indexOf("变体失效") > 0, p.v);

await setKnob("kRewrite", 95);
p = await probe();
gate("探针断开", p.v.indexOf("不可判定") === 0 && p.v.indexOf("探针未接通") > 0, `${p.v} 溯源=${p.tr}`);

await setKnob("kRewrite", 45);
await setKnob("kNoise", 90);
p = await probe();
gate("标签污染", p.v.indexOf("结果冲突") === 0, p.v);

await setKnob("kNoise", 0);
await setKnob("kN", 30);
p = await probe();
gate("题组太少", p.v.indexOf("不可判定") === 0 && p.v.indexOf("样本不足") > 0, p.v);

await setKnob("kN", 96);
p = await probe();
gate("恢复默认", p.v.indexOf("记忆主导") === 0, `${p.v} κ̂=${p.k}`);

/* ---------- 5. 证物室 ---------- */
await ev(`document.querySelector('.h4rail .door[data-l="check"]').click();'ok'`);
await sleep(2200);
const s5 = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#scBody tr').length,
  sum: document.getElementById('scSum').textContent,
  negs: document.querySelectorAll('#negList .negb').length,
  pass: document.querySelectorAll('#negList .negb.pass').length,
  svgDots: document.querySelectorAll('#sweepSvg circle').length,
  refs: document.querySelectorAll('#refList .gd').length,
  refBad: document.querySelectorAll('#refList .gd.no').length
})`));
gate("证物室", s5.rows === 15 && s5.negs === 4 && s5.pass === 4 && s5.svgDots === 10 &&
  s5.refs === 3 && s5.refBad === 1,
  `自检=${s5.rows} 负例=${s5.pass}/${s5.negs} 扫描点=${s5.svgDots} 参照=${s5.refs}(失败${s5.refBad}) ${s5.sum}`);
await shot("h4-5-check.png");

/* ---------- 6. 存档 ---------- */
await ev(`document.querySelector('.h4rail .door[data-l="hand"]').click();'ok'`);
await sleep(600);
await ev(`document.getElementById('btnSave').click();'ok'`);
await sleep(700);
const s6 = JSON.parse(await ev(`JSON.stringify({
  res: document.getElementById('saveResult').textContent,
  ok: document.getElementById('saveResult').textContent.indexOf('已存入') >= 0,
  stored: (function(){try{var a=JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]');return a.filter(function(r){return r.hall==='H4'}).length}catch(e){return -1}})()
})`));
gate("存档", s6.ok && s6.stored >= 1, `${s6.res.slice(0, 46)} 库内H4=${s6.stored}`);
await shot("h4-6-hand.png");

/* ---------- 7. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + "/h4-contam.html" });
await sleep(2600);
const s7 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  kVal: document.getElementById('kVal').textContent,
  rows: document.querySelectorAll('#shelfBody .srow').length
})`));
gate("窄屏", s7.ovf === 0 && s7.rows === 96, `ovf=${s7.ovf} 行=${s7.rows} κ̂=${s7.kVal}`);
await shot("h4-7-mobile.png");

console.log("\nJS 错误:", errs.length ? errs.slice(0, 3) : "无");
console.log(bad === 0 ? "\n结论：全部通过" : `\n结论：${bad} 项未通过`);

ws.close(); child.kill(); process.exit(0);

// H6 预算天穹 · 体检（结构 / 交互 / 自检 / 负例 / 归因 / 窄屏 / 存档）
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9899, W = 1440, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ych6-"));
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
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 160);
  return r.result?.result?.value;
};
const shot = async n => {
  let r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (!r.result?.data) r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let bad = 0;
const gate = (n, ok, extra) => { if (!ok) bad++; console.log(`${ok ? "OK " : "BAD"} ${n}${extra ? "  " + extra : ""}`); };

await send("Page.navigate", { url: BASE + "/h6-budget.html" });
await sleep(3200);

/* ---------- 1. 结构 ---------- */
const s1 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  stones: document.querySelectorAll('.d6arch .ks').length,
  zones: document.querySelectorAll('.zone').length,
  dome: !!document.getElementById('domeSvg'),
  ladder: !!document.getElementById('ladderSvg'),
  console: !!document.querySelector('.console'),
  h: document.querySelector('.hall').getBoundingClientRect().height,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: document.documentElement.scrollHeight
})`));
gate("结构", s1.stones === 4 && s1.zones === 4 && s1.dome && s1.ladder && s1.console &&
     s1.ovf === 0 && s1.h <= 941 && !errs.length,
     `石=${s1.stones} 区=${s1.zones} 高=${Math.round(s1.h)} ovf=${s1.ovf} docH=${s1.docH}`);

/* ---------- 2. 预算间 ---------- */
await ev(`document.querySelector('.d6arch .ks[data-l="budget"]').click()`);
await sleep(400);
const s2 = JSON.parse(await ev(`JSON.stringify({
  factors: document.querySelectorAll('.f3 .fc').length,
  fig: !!document.querySelector('.fig1 svg'),
  exPass: (document.getElementById('exPass')||{}).textContent || '',
  exGreedy: (document.getElementById('exGreedy')||{}).textContent || '',
  exVote: (document.getElementById('exVote')||{}).textContent || '',
  exDef: (document.getElementById('exDef')||{}).textContent || '',
  exEff: (document.getElementById('exEff')||{}).textContent || ''
})`));
await shot("h6-1-budget.png");
gate("预算间", s2.factors === 3 && s2.fig && s2.exPass !== '—' && s2.exGreedy !== '—' &&
     s2.exVote !== '—' && s2.exDef !== '—' && s2.exEff !== '—',
     `三因子=${s2.factors} 图1=${s2.fig} oracle=${s2.exPass} greedy=${s2.exGreedy} vote=${s2.exVote} 赤字=${s2.exDef} 有效=${s2.exEff}`);

/* ---------- 3. 天穹厅 ---------- */
errs = [];
await ev(`document.querySelector('.d6arch .ks[data-l="dome"]').click()`);
await sleep(700);
const s3 = JSON.parse(await ev(`JSON.stringify({
  zone: (document.querySelector('.zone.on')||{}).getAttribute ? document.querySelector('.zone.on').getAttribute('data-l') : '',
  bars: document.querySelectorAll('#domeSvg .dbar').length,
  ticks: document.querySelectorAll('#domeSvg .dtick').length,
  hits: document.querySelectorAll('#ladderSvg #ladHit').length,
  pass: (document.getElementById('mPass')||{}).textContent || '',
  vote: (document.getElementById('mVote')||{}).textContent || '',
  eff: (document.getElementById('mEff')||{}).textContent || '',
  badge: (document.getElementById('vBadge')||{}).textContent || '',
  k: (document.getElementById('tk')||{}).textContent || '',
  split: document.querySelectorAll('#splitBar > i').length
})`));
await shot("h6-2-dome.png");
gate("天穹厅", s3.zone === 'dome' && s3.ticks === 120 && s3.bars > 20 && s3.hits === 1 &&
     s3.k === '32' && s3.split === 3 && !errs.length,
     `柱=${s3.bars} 刻度=${s3.ticks} 拖区=${s3.hits} k=${s3.k} ${s3.badge}`);
gate("默认读数", s3.pass === '50.0%' && s3.eff === '7.2 / 32', `pass=${s3.pass} 有效=${s3.eff} vote=${s3.vote}`);

/* ---------- 4. 拖到最大预算 ---------- */
errs = [];
await ev(`(function(){
  var svg=document.getElementById('ladderSvg'), r=svg.getBoundingClientRect();
  var h=svg.querySelector('#ladHit');
  h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.right-12,clientY:r.top+r.height/2,pointerId:1}));
  h.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.right-12,clientY:r.top+r.height/2,pointerId:1}));
  return 'ok';
})()`);
await sleep(500);
const s4 = JSON.parse(await ev(`JSON.stringify({
  k: (document.getElementById('tk')||{}).textContent || '',
  pass: (document.getElementById('mPass')||{}).textContent || '',
  badge: (document.getElementById('vBadge')||{}).textContent || '',
  cap: (document.getElementById('ladCap')||{}).textContent || ''
})`));
await shot("h6-3-max.png");
gate("拖到最大预算", s4.k === '256' && s4.pass !== '50.0%' && s4.badge.indexOf('饱和') >= 0,
     `k=${s4.k} pass=${s4.pass} ${s4.badge}`);

/* ---------- 5. 顶栏细条拖到最小 ---------- */
errs = [];
await ev(`(function(){
  var el=document.getElementById('strip'), r=el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+1,clientY:r.top+r.height/2,pointerId:2}));
  el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left+1,clientY:r.top+r.height/2,pointerId:2}));
  return 'ok';
})()`);
await sleep(500);
const s5 = JSON.parse(await ev(`JSON.stringify({
  k: (document.getElementById('tk')||{}).textContent || '',
  badge: (document.getElementById('vBadge')||{}).textContent || '',
  pass: (document.getElementById('mPass')||{}).textContent || ''
})`));
gate("细条拖到最小", s5.k === '1' && s5.badge.indexOf('拒判') >= 0,
     `k=${s5.k} pass=${s5.pass} ${s5.badge}`);

/* ---------- 6. 任务显微 ---------- */
errs = [];
await ev(`(function(){
  var svg=document.getElementById('ladderSvg'), r=svg.getBoundingClientRect();
  var h=svg.querySelector('#ladHit');
  h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width*0.62,clientY:r.top+40,pointerId:3}));
  h.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left+r.width*0.62,clientY:r.top+40,pointerId:3}));
  return 'ok';
})()`);
await sleep(400);
await ev(`(function(){
  var b=document.querySelectorAll('#domeSvg .dbar')[3];
  b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  return 'ok';
})()`);
await sleep(400);
const s6 = JSON.parse(await ev(`JSON.stringify({
  dots: document.querySelectorAll('#scopeBody .dots i').length,
  txt: (document.getElementById('scopeBody')||{}).innerText || '',
  k: (document.getElementById('tk')||{}).textContent || '',
  x: (document.getElementById('scopeX')||{}).style.display
})`));
await shot("h6-4-scope.png");
gate("任务显微", s6.dots === +s6.k && s6.txt.indexOf('支持集') >= 0 && s6.x !== 'none',
     `k=${s6.k} 采样点=${s6.dots}`);

/* ---------- 7. 结算室 ---------- */
errs = [];
await ev(`document.querySelector('.d6arch .ks[data-l="settle"]').click()`);
await sleep(1200);
const s7 = JSON.parse(await ev(`JSON.stringify({
  scRows: document.querySelectorAll('#scBody tr').length,
  scPass: document.querySelectorAll('#scBody td.ok').length,
  neg: document.querySelectorAll('#negList .neg').length,
  negOk: document.querySelectorAll('#negList .neg.ok').length,
  arms: document.querySelectorAll('#armBox .arm').length,
  preds: document.querySelectorAll('#predBox .pred').length,
  predOk: document.querySelectorAll('#predBox .pred.ok').length,
  tauLines: document.querySelectorAll('#tauSvg path').length
})`));
await shot("h6-5-settle.png");
gate("结算室", s7.scRows === 5 && s7.scPass === 5 && s7.neg === 5 && s7.negOk === 5 &&
     s7.arms === 4 && s7.preds === 3 && s7.predOk === 3 && s7.tauLines >= 2 && !errs.length,
     `自检=${s7.scPass}/${s7.scRows} 负例=${s7.negOk}/${s7.neg} 归因=${s7.predOk}/${s7.preds} 臂=${s7.arms}`);

/* ---------- 8. 存档 ---------- */
errs = [];
await ev(`document.querySelector('.d6arch .ks[data-l="hand"]').click()`);
await sleep(400);
await ev(`document.getElementById('btnSave').click()`);
await sleep(600);
const s8 = JSON.parse(await ev(`JSON.stringify({
  res: (document.getElementById('saveResult')||{}).textContent || '',
  stored: (JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]')||[]).filter(function(r){return r.hall==='H6'}).length
})`));
await shot("h6-6-hand.png");
gate("存档", s8.stored === 1 && s8.res.indexOf('YC-H6') >= 0, `${s8.res.slice(0, 60)} 库内=${s8.stored}`);

/* ---------- 8b. 复算清单 ---------- */
const s8b = JSON.parse(await ev(`JSON.stringify({
  leak: document.getElementById('rcLeak').textContent,
  def: document.getElementById('rcDef').textContent,
  ceil: document.getElementById('rcCeil').textContent,
  seed: document.getElementById('rcSeed').textContent,
  split: document.getElementById('rcSplit').textContent,
  cards: document.querySelectorAll('.recalc .rcard').length
})`));
const s8bOk = s8b.cards === 3 && /%$/.test(s8b.leak) && /pp$/.test(s8b.def) && /%$/.test(s8b.ceil) &&
  /seed \d+/.test(s8b.seed) && s8b.leak !== '—';
gate("复算清单", s8bOk, `泄漏=${s8b.leak} 赤字=${s8b.def} 上限=${s8b.ceil} ${s8b.seed} 可达=${s8b.split}`);

/* ---------- 9. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h6-budget.html" });
await sleep(2800);
/* 先切到天穹厅再量图高：隐藏的 .zone 上 getBoundingClientRect() 恒为 0 */
await ev(`document.querySelector('.d6arch .ks[data-l="dome"]').click()`);
await sleep(900);
const s9 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  stones: document.querySelectorAll('.d6arch .ks').length,
  domeH: Math.round(document.getElementById('domeSvg').getBoundingClientRect().height),
  ladH: Math.round(document.getElementById('ladderSvg').getBoundingClientRect().height),
  mainScroll: document.getElementById('main').scrollHeight > document.getElementById('main').clientHeight
})`));
await shot("h6-7-mobile.png");
gate("窄屏", s9.ovf === 0 && s9.stones === 4 && s9.domeH > 120 && s9.ladH > 100 && s9.mainScroll,
     `ovf=${s9.ovf} 石=${s9.stones} 剖面=${s9.domeH} 阶梯=${s9.ladH} 可滚=${s9.mainScroll}`);

console.log(`\nJS 异常: ${errs.length ? errs.slice(0, 2).join(" | ") : "无"}`);
console.log(`结论：${bad === 0 ? "全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

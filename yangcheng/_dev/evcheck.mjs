/* 证据厅 · 全城联合复核台 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9921, W = 1500, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycev-"));
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
  if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception || {}).description || "ex");
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
  console.log((ok ? "OK  " : "BAD ") + name + "  " + (detail || ""));
}
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ---------- 1. 结构 ---------- */
errs = [];
await ev(`localStorage.removeItem('yc.evidence.v1')`);
await send("Page.navigate", { url: BASE + "/evidence.html" });
await sleep(2600);
const s1 = JSON.parse(await ev(`JSON.stringify({
  audit: !!document.getElementById('audit'),
  btn: !!document.getElementById('btnBase'),
  hasAuditKernel: typeof YCAudit === 'object',
  lazy: typeof YCDome === 'undefined',
  empty: !!document.querySelector('.aempty'),
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("结构", s1.audit && s1.btn && s1.hasAuditKernel && s1.lazy && s1.empty && s1.ovf === 0,
  `台=${s1.audit} 复核内核=${s1.hasAuditKernel} 五馆内核延迟加载=${s1.lazy} 空态=${s1.empty} ovf=${s1.ovf}`);
await shot("ev-1-empty.png");

/* ---------- 2. 载入五馆基准 ---------- */
errs = [];
await ev(`document.getElementById('btnBase').click()`);
await sleep(6500);
const s2 = JSON.parse(await ev(`JSON.stringify({
  n: (JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]')||[]).length,
  halls: (JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]')||[]).map(function(r){return r.hall}).sort().join(','),
  sum: document.getElementById('auditSum').textContent,
  verd: (document.querySelector('.averd .av')||{}).textContent || '',
  why: (document.querySelector('.averd .aw')||{}).textContent || ''
})`));
gate("载入基准", s2.n === 5 && s2.halls === "H2,H3,H4,H5,H6",
  `${s2.n} 份 [${s2.halls}] ${s2.sum}`);
const kern = JSON.parse(await ev(`JSON.stringify({
  n: [window.YCForensic,window.YCContam,window.YCGreenhouse,window.YCDome,window.YCMetrics].filter(Boolean).length
})`));
gate("内核按需加载", kern.n === 5, `${kern.n}/5`);
console.log("   判定:", s2.verd.trim(), "|", String(s2.why).slice(0, 90));

/* ---------- 3. 四指标 + 矩阵 ---------- */
const s3 = JSON.parse(await ev(`JSON.stringify({
  stats: document.querySelectorAll('.astat').length,
  cells: document.querySelectorAll('.amc').length,
  pairs: document.querySelectorAll('.amc[data-pa]').length,
  self: document.querySelectorAll('.amc.s').length,
  comp: document.querySelectorAll('.amc.c').length,
  ana: document.querySelectorAll('.amc.a').length,
  inc: document.querySelectorAll('.amc.x').length
})`));
gate("可比性矩阵", s3.stats === 4 && s3.cells === 25 && s3.pairs === 20 && s3.self === 5,
  `指标=${s3.stats} 格=${s3.cells} 配对=${s3.pairs} 自身=${s3.self} 可比/类比/不可比=${s3.comp}/${s3.ana}/${s3.inc}`);
await ev(`document.getElementById('audit').scrollIntoView({block:'start'})`);
await sleep(500);
await shot("ev-2-audit.png");
const s3b = JSON.parse(await ev(`JSON.stringify({
  eff: (document.querySelectorAll('.kv dd')[10]||{}).textContent || ''
})`));
console.log("   档案效应字段:", String(s3b.eff).slice(0, 70));

/* ---------- 4. 点矩阵格 ---------- */
errs = [];
const s4 = JSON.parse(await ev(`(function(){
  var el=document.querySelector('.amc.x[data-pa]') || document.querySelector('.amc.c[data-pa]');
  if(!el) return JSON.stringify({none:true});
  var was=el.className;
  el.click();
  var box=document.getElementById('apair');
  return JSON.stringify({
    level: was.indexOf(' x')>0?'x':'c',
    on: el.classList.contains('on'),
    head: (box.querySelector('.ph')||{}).textContent||'',
    body: (box.querySelector('.pd')||{}).textContent||''
  });
})()`));
gate("点格看详情", s4.on && s4.head && s4.body && s4.body.length > 10,
  `${s4.head} → ${String(s4.body).slice(0, 60)}`);
await shot("ev-2-audit.png");

/* ---------- 5. 命题表 + 标记 ---------- */
const s5 = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('.aclaim .cr').length,
  dirs: document.querySelectorAll('.aclaim .dd.on').length,
  flags: document.querySelectorAll('.aflag').length,
  kinds: [].map.call(document.querySelectorAll('.aflag .fk'), function(e){return e.textContent}).join(','),
  scPass: document.querySelectorAll('.ackbox:first-child .ackrow .st.ok').length,
  scAll: document.querySelectorAll('.ackbox:first-child .ackrow').length,
  ngPass: document.querySelectorAll('.ackbox:last-child .ackrow .st.ok').length,
  ngAll: document.querySelectorAll('.ackbox:last-child .ackrow').length
})`));
gate("命题表", s5.rows === 5 && s5.dirs >= 3, `行=${s5.rows} 有方向=${s5.dirs}`);
gate("标记", s5.flags >= 3, `标记=${s5.flags} [${s5.kinds}]`);
gate("自检", s5.scPass === s5.scAll && s5.scAll === 5, `${s5.scPass}/${s5.scAll}`);
gate("负例", s5.ngPass === s5.ngAll && s5.ngAll === 6, `${s5.ngPass}/${s5.ngAll}`);

/* ---------- 6. 重新复核幂等 ---------- */
errs = [];
const before = await ev(`document.getElementById('auditSum').textContent`);
await ev(`document.getElementById('btnRecheck').click()`);
await sleep(700);
const after = await ev(`document.getElementById('auditSum').textContent`);
gate("重新复核幂等", before === after && !errs.length, `${before} → ${after}`);

/* ---------- 7. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/evidence.html" });
await sleep(3000);
const s7 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cells: document.querySelectorAll('.amc').length,
  stats: document.querySelectorAll('.astat').length,
  flags: document.querySelectorAll('.aflag').length
})`));
await shot("ev-3-mobile.png");
gate("窄屏", s7.ovf === 0 && s7.cells === 25 && s7.stats === 4,
  `ovf=${s7.ovf} 格=${s7.cells} 指标=${s7.stats} 标记=${s7.flags}`);

console.log(`\nJS 异常: ${errs.length ? errs.slice(0, 3).join(" | ") : "无"}`);
console.log(`结论：${bad === 0 ? "全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

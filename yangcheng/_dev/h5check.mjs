// H5 递归坍塌博物馆 · 无头体检
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9885, W = 1500, H = 940;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ych5-"));
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
    errs.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 200));
};
const send = (me, pa = {}) => new Promise(r => {
  const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa }));
});
const ev = async x => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 240);
  return r.result?.result?.value;
};
const shot = async (n, clip) => {
  const pa = { format: "png", captureBeyondViewport: true };
  if (clip) { pa.clip = { ...clip, scale: 2 }; }
  let r = await send("Page.captureScreenshot", pa);
  if (!r.result?.data) r = await send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) { console.log("    shot FAILED:", n); return; }
  writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};

let bad = 0;
const gate = (name, ok, info) => {
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"}  ${name.padEnd(14)} ${info || ""}`);
};

const SET_RANGE = `function setR(id,v){var e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}`;

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h5-collapse.html" });
await sleep(3000);

/* ---------- 1. 结构 ---------- */
const s1 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  stones: document.querySelectorAll('.stone').length,
  zones: document.querySelectorAll('.zone').length,
  trellis: !!document.getElementById('trellis'),
  mirror: !!document.getElementById('mirrorSvg'),
  fateRows: document.querySelectorAll('#fateBody .frow').length,
  overflow: getComputedStyle(document.querySelector('.hall.h5')).overflow,
  hallH: Math.round(document.querySelector('.hall.h5').getBoundingClientRect().height),
  canopyH: Math.round(document.querySelector('.canopy').getBoundingClientRect().height),
  pathH: Math.round(document.querySelector('.path').getBoundingClientRect().height),
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  docH: document.documentElement.scrollHeight,
  zone: document.querySelector('.zone.on')?.getAttribute('data-l')
})`));
gate("结构", s1.stones === 4 && s1.zones === 4 && s1.trellis && s1.mirror &&
  s1.fateRows === 8 && s1.overflow === "hidden" && s1.ovf === 0 && s1.zone === "nursery",
  `石=4 区=4 层=8 高=${s1.hallH} 穹=${s1.canopyH} 径=${s1.pathH} ovf=${s1.ovf} docH=${s1.docH}`);

/* ---------- 2. 藤架厅 ---------- */
await ev(`document.querySelector('.stone[data-l="trellis"]').click()`);
await sleep(700);
const s2 = JSON.parse(await ev(`JSON.stringify({
  zone: document.querySelector('.zone.on').getAttribute('data-l'),
  cols: document.querySelectorAll('#trellis g.col').length,
  segs: document.querySelectorAll('#trellis line.vseg').length,
  ghosts: document.querySelectorAll('#trellis line.vseg.ghost').length,
  marks: document.querySelectorAll('#trellis line.dmark').length,
  hits: document.querySelectorAll('#trellis rect.col-hit').length,
  sub: document.getElementById('twSub').textContent,
  cons: document.querySelectorAll('.console .dial').length,
  mGen: document.getElementById('mGen').textContent,
  mFid: document.getElementById('mFid').textContent,
  fates: document.querySelectorAll('#fateBody .frow').length,
  alive: document.querySelectorAll('#fateBody .ft.alive').length,
  wilted: document.querySelectorAll('#fateBody .ft.wilted').length,
  blind: document.querySelectorAll('#fateBody .ft.blind').length
})`));
gate("藤架厅", s2.zone === "trellis" && s2.cols === 16 && s2.hits === 16 &&
  s2.segs === 16 * 24 && s2.ghosts > 0 && s2.marks > 0 && s2.cons === 3,
  `列=${s2.cols} 段=${s2.segs} 残影=${s2.ghosts} 枯标=${s2.marks} 旋钮=${s2.cons}`);
gate("八层归宿", s2.fates === 8 && s2.alive + s2.wilted + s2.blind === 8,
  `活=${s2.alive} 枯=${s2.wilted} 盲=${s2.blind}　${s2.sub}`);
gate("默认结论", /按分位坍塌|全面坍塌|临界/.test(s2.sub), s2.sub + "　fid=" + s2.mFid);

await shot("h5-2-trellis.png");

/* ---------- 3. 世代滑块 ---------- */
const g1 = await ev(`${SET_RANGE}setR('genSlider',4); document.getElementById('mGen').textContent`);
await sleep(300);
const g2 = JSON.parse(await ev(`JSON.stringify({
  mGen: document.getElementById('mGen').textContent,
  genVal: document.getElementById('genVal').textContent,
  dim: document.querySelectorAll('#trellis line.vseg[opacity="0.26"]').length
})`));
gate("世代滑块", g2.mGen === "第 4 代" && g2.genVal === "4 / 24" && g2.dim > 0,
  `${g2.mGen}　${g2.genVal}　压暗段=${g2.dim}`);
await shot("h5-3-gen4.png");

await ev(`${SET_RANGE}setR('genSlider',24)`);
await sleep(300);

/* ---------- 4. 选谱系 ---------- */
await ev(`document.querySelector('#trellis g.col').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
await sleep(400);
const s4 = JSON.parse(await ev(`JSON.stringify({
  title: document.getElementById('fateTitle').textContent,
  who: document.getElementById('fateWho').textContent,
  back: document.getElementById('pickBack').style.display,
  on: document.querySelectorAll('#trellis g.col.on').length,
  hint: document.getElementById('fateHint').textContent.slice(0, 40)
})`));
gate("选谱系", /谱系 #1/.test(s4.title) && s4.back === "inline-block" && s4.on === 1,
  `${s4.title} · ${s4.who} · 选中=${s4.on}`);
await ev(`document.getElementById('pickBack').click()`);
await sleep(350);
const s4b = await ev(`document.getElementById('fateTitle').textContent`);
gate("回到全体", s4b === "八层归宿", s4b);

/* ---------- 5. 日照为 0 ---------- */
await ev(`${SET_RANGE}setR('kRho',0)`);
await sleep(700);
const s5 = JSON.parse(await ev(`JSON.stringify({
  sun: document.getElementById('sunVal').textContent,
  fill: document.getElementById('sunFill').style.width,
  sub: document.getElementById('twSub').textContent,
  alive: document.querySelectorAll('#fateBody .ft.alive').length
})`));
gate("日照归零", s5.sun === "0%" && /坍塌/.test(s5.sub),
  `日照=${s5.sun} 条=${s5.fill} 活层=${s5.alive}　${s5.sub}`);

/* ---------- 6. 全是新鲜数据（拒判） ---------- */
await ev(`${SET_RANGE}setR('kRho',100)`);
await sleep(800);
const s6 = await ev(`document.getElementById('twSub').textContent`);
gate("非递归拒判", /不是递归条件/.test(s6), s6);
await shot("h5-6-nonrecursive.png");

/* ---------- 7. 恢复默认 ---------- */
await ev(`${SET_RANGE}setR('kRho',5); ${SET_RANGE}setR('kN',35); ${SET_RANGE}setR('kG',24)`);
await sleep(900);
const s7 = JSON.parse(await ev(`JSON.stringify({
  rho: document.getElementById('kRhoV').textContent,
  n: document.getElementById('kNV').textContent,
  g: document.getElementById('kGV').textContent,
  sub: document.getElementById('twSub').textContent,
  segs: document.querySelectorAll('#trellis line.vseg').length
})`));
gate("恢复默认", s7.rho === "5%" && s7.n === "400" && s7.g === "24" && s7.segs === 16 * 24,
  `ρ=${s7.rho} N=${s7.n} G=${s7.g}　${s7.sub}`);

/* ---------- 8. 同 seed 对照 ---------- */
await ev(`document.getElementById('btnCF').click()`);
await sleep(700);
const s8 = JSON.parse(await ev(`JSON.stringify({
  show: document.getElementById('cfBox').style.display,
  rows: document.querySelectorAll('#cfBox .frow').length,
  txt: document.getElementById('cfBox').textContent.replace(/\\s+/g,' ').slice(0, 90)
})`));
gate("同 seed 对照", s8.show === "block" && s8.rows === 2, `${s8.rows} 行 · ${s8.txt}`);
await shot("h5-8-cf.png", { x: 1104, y: 140, width: 396, height: 420 });

/* ---------- 9. 标本室 ---------- */
await ev(`document.querySelector('.stone[data-l="check"]').click()`);
await sleep(2600);
const s9 = JSON.parse(await ev(`JSON.stringify({
  sum: document.getElementById('scSum').textContent.slice(0, 30),
  rows: document.querySelectorAll('#scBody tr').length,
  pass: document.querySelectorAll('#scBody td.ok').length,
  neg: document.querySelectorAll('#negList .li').length,
  negOk: document.querySelectorAll('#negList .li.ok').length,
  attr: document.querySelectorAll('#attrBox .li').length,
  attrOk: document.querySelectorAll('#attrBox .li.ok').length,
  crit: document.getElementById('critVal').textContent,
  vis: document.getElementById('visVal').textContent,
  sweepPath: document.querySelectorAll('#sweepSvg path').length,
  nPath: document.querySelectorAll('#nSvg path').length
})`));
gate("自检", s9.rows === 5 && s9.pass === 5, `行=${s9.rows} 过=${s9.pass}　${s9.sum}`);
gate("负例", s9.neg === 5 && s9.negOk === 5, `${s9.negOk}/${s9.neg}`);
gate("归因", s9.attr === 3 && s9.attrOk === 3, `${s9.attrOk}/${s9.attr}`);
gate("扫描图", s9.sweepPath >= 1 && s9.nPath >= 3, `${s9.crit}　${s9.vis}`);
await shot("h5-9-check.png");

/* ---------- 10. 存档 ---------- */
await ev(`document.querySelector('.stone[data-l="hand"]').click()`);
await sleep(500);
await ev(`document.getElementById('btnSave').click()`);
await sleep(500);
const s10 = JSON.parse(await ev(`JSON.stringify({
  cls: document.getElementById('saveResult').className,
  txt: document.getElementById('saveResult').textContent.replace(/\\s+/g,' ').slice(0, 120),
  inLib: window.YCEvidence.list({hall:'H5'}).length,
  valid: (function(){var r=window.YCEvidence.list({hall:'H5'})[0];return r?window.YCEvidence.validate(r).ok:null;})()
})`));
gate("存档", /ok/.test(s10.cls) && s10.inLib >= 1 && s10.valid === true,
  `库内H5=${s10.inLib} 校验=${s10.valid}　${s10.txt.slice(0, 70)}`);
await shot("h5-10-hand.png");

/* ---------- 11. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 860, deviceScaleFactor: 1, mobile: true });
await ev(`document.querySelector('.stone[data-l="trellis"]').click()`);
await sleep(800);
const s11 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cols: document.querySelectorAll('#trellis g.col').length,
  stones: document.querySelectorAll('.stone').length,
  trellisH: Math.round(document.getElementById('trellis').getBoundingClientRect().height),
  sideTop: Math.round(document.querySelector('.side').getBoundingClientRect().top)
})`));
gate("窄屏", s11.ovf === 0 && s11.cols === 16 && s11.stones === 4 && s11.trellisH > 200,
  `ovf=${s11.ovf} 列=${s11.cols} 藤高=${s11.trellisH} 侧栏y=${s11.sideTop}`);
await shot("h5-11-mobile.png");

console.log("\nJS 异常:", errs.length ? errs : "无");
console.log(bad === 0 ? "结论：全部通过" : `结论：${bad} 项未通过`);

ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

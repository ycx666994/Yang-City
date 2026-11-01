// 线上体检：https 下三页是否真跑起来（含仪器实际运行 + 跨页证据流）
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9823), W = 1440, H = 900;
const BASE = process.env.YC_BASE || "https://76e4dfba791b4ea7bbeea5c1879785ed.sg2.agentos-app.run";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yclive-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gt() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const pg = (await r.json()).find(t => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("no target");
}

const ws = new WebSocket(await gt());
let id = 0; const pend = new Map(); let errs = [], fails = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push("console:" + m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 140));
  if (m.method === "Network.loadingFailed")
    fails.push(String(m.params.errorText || "").slice(0, 60));
};
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 160);
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let bad = 0;
const gate = (name, ok, extra) => { if (!ok) bad++; console.log(`${ok ? "OK " : "BAD"} ${name}${extra ? "  " + extra : ""}`); };

/* ---------- 1. 城市 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/index.html" });
await sleep(5200);
const city = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  cv: !!document.getElementById('cityCv'),
  cvW: (document.getElementById('cityCv')||{}).width || 0,
  clock: (document.getElementById('clkTime')||{}).textContent || null,
  phase: (document.getElementById('clkPhase')||{}).textContent || null,
  mapBtn: !!document.getElementById('btnMap'),
  mapHref: (function(){var a=document.getElementById('btnMap');return a?a.getAttribute('href'):null})(),
  hint: (document.getElementById('mapHint')||{}).textContent || '',
  avail: document.getElementById('cAvail').textContent,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-city.png");
gate("城市页", city.cv && city.cvW > 300 && city.mapBtn && city.mapHref === 'map.html' && city.hint.length > 4 && city.overflow === 0 && !errs.length && !fails.length,
     `canvas=${city.cvW} 时钟=${city.clock} ${city.phase} 地图=${city.mapHref} ovf=${city.overflow}`);

/* ---------- 1b. 地图 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/map.html" });
await sleep(2600);
const mp = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  halls: document.querySelectorAll('#mapSvg g.hall').length,
  civic: document.querySelectorAll('#mapSvg g.civic').length,
  route: document.querySelectorAll('#mapSvg path.route').length,
  legs: document.querySelectorAll('#routeLegs .legrow').length,
  nums: Array.prototype.filter.call(document.querySelectorAll('#mapSvg text'), function(t){return /^0[1-6]$/.test(t.textContent)}).length,
  side: document.querySelectorAll('#hallItems .hitem').length,
  ready: document.querySelectorAll('#hallItems .hitem.ready').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-map.png");
gate("地图页", mp.halls === 6 && mp.civic >= 6 && mp.route >= 1 && mp.legs === 5 && mp.nums === 6 && mp.side === 6 && mp.ready === 6 && mp.overflow === 0 && !errs.length && !fails.length,
     `六馆=${mp.halls} 设施=${mp.civic} 路线=${mp.route} 行程=${mp.legs} 序号=${mp.nums} 侧栏=${mp.side} 可用=${mp.ready} ovf=${mp.overflow}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 1c. 推理法医馆 H2 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h2-forensic.html" });
await sleep(2600);
const h2 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  tabs: document.querySelectorAll('.tabbar .tab').length,
  arms: document.querySelectorAll('#armList .arm').length,
  fields: document.querySelectorAll('#wFields tr').length,
  chat: (document.getElementById('chatVal')||{}).textContent || '',
  verdict: (document.getElementById('vVerdict')||{}).textContent || '',
  rows: document.querySelectorAll('#tlistBody tr').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-h2.png");
gate("推理法医馆", h2.tabs === 5 && h2.arms === 4 && h2.fields === 6 && h2.rows > 1 &&
     h2.chat !== '—' && h2.verdict !== '待审' && h2.ovf === 0 && !errs.length && !fails.length,
     `卷=${h2.tabs} 臂=${h2.arms} 字段=${h2.fields} 逐题=${h2.rows} ĉ=${h2.chat} ${h2.verdict} ovf=${h2.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 1d. 数据污染博物馆 H4 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h4-contam.html" });
await sleep(2800);
const h4 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  doors: document.querySelectorAll('.h4rail .door').length,
  rows: document.querySelectorAll('#shelfBody .srow').length,
  stale: document.querySelectorAll('#shelfBody .cell.stale').length,
  k: document.getElementById('kVal').textContent,
  verdict: document.getElementById('vTitle').textContent,
  guards: document.querySelectorAll('#guardList .gd').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-h4.png");
gate("数据污染馆", h4.doors === 5 && h4.rows === 96 && h4.stale > 0 && h4.k !== '—' &&
     h4.verdict.indexOf('记忆主导') === 0 && h4.guards === 5 && h4.ovf === 0 && !errs.length && !fails.length,
     `门=${h4.doors} 行=${h4.rows} 回吐=${h4.stale} κ̂=${h4.k} ${h4.verdict} 守卫=${h4.guards} ovf=${h4.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 1e. 递归坍塌博物馆 H5 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h5-collapse.html" });
await sleep(3600);
await ev(`document.querySelector('.stone[data-l="trellis"]').click()`);
await sleep(500);
const h5 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  /* 参观踏石 5 枚（button[data-l]）+ 玩法入口 1 枚（a.stone.game）。
     不要写死 .stone 的总数 —— 加一枚玩法入口就会误报。 */
  stones: document.querySelectorAll('.path button.stone[data-l]').length,
  gameStone: document.querySelectorAll('.path a.stone.game[href="h5-forecast.html"]').length,
  cols: document.querySelectorAll('#trellis g.col').length,
  segs: document.querySelectorAll('#trellis line.vseg').length,
  badge: (document.getElementById('vBadge')||{}).textContent || '',
  stat: (document.getElementById('vStat')||{}).textContent || '',
  fates: document.querySelectorAll('#fateBody .frow').length,
  alive: document.querySelectorAll('#fateBody .ft.alive').length,
  wilted: document.querySelectorAll('#fateBody .ft.wilted').length,
  blind: document.querySelectorAll('#fateBody .ft.blind').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-h5.png");
gate("递归坍塌馆", h5.stones === 5 && h5.gameStone === 1 && h5.cols === 16 && h5.segs > 300 && h5.badge !== '—' &&
     h5.stat.length > 6 && h5.fates === 8 && (h5.alive + h5.wilted + h5.blind) === 8 &&
     h5.ovf === 0 && !errs.length && !fails.length,
     `踏石=${h5.stones}+玩法${h5.gameStone} 列=${h5.cols} 段=${h5.segs} 层=${h5.fates} 活/枯/盲=${h5.alive}/${h5.wilted}/${h5.blind} ovf=${h5.ovf} | ${h5.badge} ${String(h5.stat).slice(0, 30)}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* H5 标本室：自检与负例是点开才渲染 */
errs = []; fails = [];
await ev(`document.querySelector('.stone[data-l="check"]').click()`);
await sleep(700);
const h5c = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#scBody tr').length,
  pass: document.querySelectorAll('#scBody td.ok').length,
  neg: document.querySelectorAll('#negList .li').length,
  negOk: document.querySelectorAll('#negList .li.ok').length,
  attr: (document.getElementById('attrBox')||{}).textContent || ''
})`));
await shot("live-h5-check.png");
gate("递归坍塌馆·自检", h5c.rows === 5 && h5c.pass === 5 && h5c.neg === 5 && h5c.negOk === 5 &&
     h5c.attr.length > 20 && !errs.length && !fails.length,
     `自检=${h5c.pass}/${h5c.rows} 负例=${h5c.negOk}/${h5c.neg}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 1f. 潜能与预算博物馆 H6 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h6-budget.html" });
await sleep(3600);
await ev(`document.querySelector('.d6arch .ks[data-l="dome"]').click()`);
await sleep(900);
const h6 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  stones: document.querySelectorAll('.d6arch .ks').length,
  zones: document.querySelectorAll('.zone').length,
  bars: document.querySelectorAll('#domeSvg .dbar').length,
  ticks: document.querySelectorAll('#domeSvg .dtick').length,
  pass: (document.getElementById('mPass')||{}).textContent || '',
  vote: (document.getElementById('mVote')||{}).textContent || '',
  eff: (document.getElementById('mEff')||{}).textContent || '',
  verdict: (document.getElementById('vBox')||{}).textContent || '',
  scope: (document.getElementById('scopeBody')||{}).textContent || '',
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("live-h6.png");
gate("潜能与预算馆", h6.stones === 5 && h6.zones === 5 && h6.bars === 80 && h6.ticks === 120 &&
     /%/.test(h6.pass) && /%/.test(h6.vote) && /\//.test(h6.eff) &&
     h6.verdict.length > 12 && h6.scope.indexOf('边界题') >= 0 &&
     h6.ovf === 0 && !errs.length && !fails.length,
     `石=${h6.stones} 区=${h6.zones} 柱=${h6.bars} 刻度=${h6.ticks} pass=${h6.pass} vote=${h6.vote} 有效=${h6.eff} ovf=${h6.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* H6 结算室：自检 / 负例 / 归因 */
errs = []; fails = [];
await ev(`document.querySelector('.d6arch .ks[data-l="settle"]').click()`);
await sleep(900);
const h6c = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#scBody tr').length,
  pass: document.querySelectorAll('#scBody td.ok').length,
  neg: document.querySelectorAll('#negList .neg').length,
  negOk: document.querySelectorAll('#negList .neg.ok').length,
  arms: document.querySelectorAll('.arms .arm').length,
  preds: document.querySelectorAll('#predBox .pred').length
})`));
await shot("live-h6-check.png");
gate("潜能与预算馆·自检", h6c.rows === 5 && h6c.pass === 5 && h6c.neg === 5 && h6c.negOk === 5 &&
     h6c.arms === 4 && h6c.preds === 3 && !errs.length && !fails.length,
     `自检=${h6c.pass}/${h6c.rows} 负例=${h6c.negOk}/${h6c.neg} 臂=${h6c.arms} 预测=${h6c.preds}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 1d. H2 长廊 + 两个精英挑战页 ---------- */
errs = []; fails = [];
await ev(`document.querySelector('.tabbar .tab[data-l="deep"]').click()`);
await sleep(600);
const dp = JSON.parse(await ev(`JSON.stringify({
  cards: document.querySelectorAll('#dpGallery .dpg-c').length,
  certs: document.querySelectorAll('#dpCerts .dpc-card').length,
  deep: typeof YCDeep === 'object'
})`));
gate("H2 展品长廊", dp.cards === 8 && dp.certs === 2 && dp.deep && !errs.length,
     `展品=${dp.cards} 证书卡=${dp.certs} 深度层=${dp.deep}`);

errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h2-case.html" });
await sleep(2600);
/* 幕二/幕三的列表是懒渲染的：paintPlaces() 只在进幕二时跑，
   paintCast() 只在进幕三时跑。刚载入时这两块 DOM 本来就是空的，
   直接数必然是 0 —— 不是坏，是没走到。所以这里真走一遍幕。 */
const cs = JSON.parse(await ev(`(function(){
  var acts = document.querySelectorAll('#acts button').length;
  var okHook = typeof YCCase === 'object' && typeof YCCase.gotoAct === 'function';
  if (!okHook) return JSON.stringify({ acts: acts, cast: 0, places: 0, qz: false });
  YCCase.gotoAct(2);
  var places = document.querySelectorAll('#placeGrid .c3pl').length;
  YCCase.gotoAct(3);
  var cast = document.querySelectorAll('#castList .c3ca').length;
  var lies = YCCase.status().lieTotal;
  var cl = YCCase.status().clueTotal;
  return JSON.stringify({
    acts: acts, cast: cast, places: places, qz: okHook, lies: lies, cl: cl,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  });
})()`));
await sleep(400);
gate("H2 剧本杀", cs.acts === 5 && cs.cast === 6 && cs.places === 12 &&
     cs.lies >= 6 && cs.cl === 12 && cs.ovf === 0 && !errs.length,
     `幕=${cs.acts} 角色=${cs.cast} 搜证点=${cs.places} 可驳证词=${cs.lies} ovf=${cs.ovf}`);

errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
await sleep(2800);
const mz = JSON.parse(await ev(`(function(){
  var s = window.YCMaze ? YCMaze.status() : null;
  return JSON.stringify({
    ok: !!s,
    doors: s ? s.doorsTotal : 0,
    grid: s ? s.grid : '-',
    pool: s ? s.quizPool : 0,
    run: s ? s.quizThisRun : 0,
    need: s ? s.passNeed : 0,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
  });
})()`));
gate("H3 3D 迷宫", mz.ok && mz.doors === 10 && mz.grid === "31x31" && mz.pool >= 300 &&
     mz.run === 10 && mz.need === 6 && mz.ovf === 0 && !errs.length,
     `门=${mz.doors} 网格=${mz.grid} 题库=${mz.pool}道 本轮抽=${mz.run} 门槛=${mz.need} ovf=${mz.ovf}`);

/* ---------- 1m. 四馆深度层：H4 / H5 / H6 展品长廊 ---------- */
const DEEPS = [
  ["H4 展品长廊", "h4-contam.html", 5],
  ["H5 展品长廊", "h5-collapse.html", 5],
  ["H6 展品长廊", "h6-budget.html", 5]
];
for (const [nm, page, doorsWant] of DEEPS) {
  errs = []; fails = [];
  await send("Page.navigate", { url: BASE + "/yangcheng/" + page });
  await sleep(3200);
  /* 这一句只负责点开深度层，返回的是 "ok" 不是 JSON，
     不能再套一层 JSON.parse —— 套了必抛。 */
  await ev(`(function(){
    var dsel = document.querySelector('.h4rail .door[data-l="deep"]') || document.querySelector('.stone[data-l="deep"]') || document.querySelector('.ks[data-l="deep"]');
    if (dsel) dsel.click();
    return "ok";
  })()`);
  await sleep(700);
  const dd = JSON.parse(await ev(`(function(){
    var c = document.querySelector('#dpGallery .dpg-c');
    if (c) c.click();
    var vb = document.querySelector('#dpGallery .dpg-vb');
    if (vb) vb.click();
    return JSON.stringify({
      deep: typeof YCDeep === 'object',
      cards: document.querySelectorAll('#dpGallery .dpg-c').length,
      certs: document.querySelectorAll('#dpCerts .dpc-card').length,
      vbtn: document.querySelectorAll('#dpGallery .dpg-vb').length,
      opts: document.querySelectorAll('#dpGallery .dpg-opt').length,
      vr: ((document.getElementById('dpgVr')||{}).textContent||'').length,
      ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
    });
  })()`));
  gate(nm, dd.deep && dd.cards === 8 && dd.certs === 2 && dd.vbtn === 1 && dd.opts === 3 && dd.vr > 4 &&
       dd.ovf === 0 && !errs.length && !fails.length,
    `展品=${dd.cards} 证书卡=${dd.certs} 验证键=${dd.vbtn} 题=${dd.opts} 验证输出=${dd.vr}字 ovf=${dd.ovf}`);
  if (errs.length) console.log("    ERR:", errs.slice(0, 2));
}

/* ---------- 1n. H4 净化车间 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h4-purge.html" });
await sleep(2800);
const pg = JSON.parse(await ev(`(function(){
  if (typeof YCPurge !== 'object') return JSON.stringify({ok:false});
  YCPurge.set({wi:2, ni:2, ln:0.14, left:12});
  YCPurge.run();
  var a = YCPurge.status();
  YCPurge.answer(YCPurge.rightAnswer());
  document.getElementById('qNext').click();
  YCPurge.rep();
  var b = YCPurge.status();
  return JSON.stringify({ok:true, a:a, b:b,
    pips: document.querySelectorAll('#pips i').length,
    acts: document.querySelectorAll('.pgop').length,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("H4 净化车间", pg.ok && pg.pips === 12 && pg.acts === 4 &&
     pg.a.verdict !== 'undetermined' && pg.a.greens === pg.a.guards &&
     pg.b.verify && pg.b.verify.same === true && pg.ovf === 0 && !errs.length,
     `额度=${pg.pips} 工序=${pg.acts} 判定=${pg.a.verdict}/${pg.a.subtype} 守卫=${pg.a.greens}/${pg.a.guards} 复核=${pg.b.verify ? pg.b.verify.same : '-'} ovf=${pg.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 1o. H5 坍塌预报台 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h5-forecast.html" });
await sleep(3200);
const fc = JSON.parse(await ev(`(function(){
  if (typeof YCForecast !== 'object') return JSON.stringify({ok:false});
  var st0 = YCForecast.status();
  var f0 = YCForecast.fate();
  YCForecast.fillTrue(); YCForecast.submit(); YCForecast.submit();
  var f1 = YCForecast.fate();
  return JSON.stringify({ok:true, st0:st0, f0:f0, f1:f1,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("H5 坍塌预报台", fc.ok && fc.st0.rows === 8 && fc.st0.cols === 10 &&
     fc.f0.filter(x => x === 'blind').length === 3 &&
     fc.f1.filter(x => x === 'alive').length === 7 && fc.ovf === 0 && !errs.length,
     `行=${fc.st0.rows} 列=${fc.st0.cols} 首轮盲层=${fc.f0.filter(x=>x==='blind').length} 次轮存活=${fc.f1.filter(x=>x==='alive').length} ovf=${fc.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 1p. H6 预算塔 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h6-tower.html" });
await sleep(2800);
const tw = JSON.parse(await ev(`(function(){
  if (typeof YCTower !== 'object') return JSON.stringify({ok:false});
  var st0 = YCTower.status();
  var s = YCTower.solve();
  var sc = YCTower.score();
  return JSON.stringify({ok:true, st0:st0, s:s, sc:sc,
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth});
})()`));
gate("H6 预算塔", tw.ok && tw.st0.levels === 10 && tw.st0.acts === 5 &&
     tw.s.wins === 10 && tw.s.fails === 0 && tw.sc.total === 100 && tw.ovf === 0 && !errs.length,
     `层=${tw.st0.levels} 行动=${tw.st0.acts} 过=${tw.s.wins} 分=${tw.sc.total} ovf=${tw.ovf}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 1q. 地图精英挑战入口 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/map.html" });
await sleep(2600);
const an = JSON.parse(await ev(`JSON.stringify({
  links: document.querySelectorAll('#hallItems .hi-annex').length,
  hrefs: Array.prototype.map.call(document.querySelectorAll('#hallItems .hi-annex'), function(a){return a.getAttribute('href');}),
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("地图精英挑战入口", an.links === 5 && an.hrefs.indexOf('h2-case.html') >= 0 &&
     an.hrefs.indexOf('h6-tower.html') >= 0 && an.ovf === 0 && !errs.length,
     `入口=${an.links} ${an.hrefs.join(',')}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 2. 指标馆：真跑一次尸检 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h3-metrics.html" });
await sleep(2500);
const devOK = JSON.parse(await ev(`JSON.stringify({
  cells: document.querySelectorAll('#rooms .rm').length,
  p: document.getElementById('stP').textContent,
  t: document.getElementById('stT').textContent
})`));
await ev(`document.querySelector('[data-l="instrument"]').click()`);
await sleep(300);
await ev(`document.getElementById('btnAutopsy').click()`);
await sleep(2000);
const inst = JSON.parse(await ev(`JSON.stringify({
  verdict: document.getElementById('verdict').innerText.replace(/\\n/g,' | ').slice(0,90),
  thetaRows: document.querySelectorAll('#thetaBody tr').length,
  detect: document.getElementById('tagDetect').textContent,
  json: document.getElementById('evidenceJson').textContent.length,
  stored: JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]').length
})`));
await shot("live-h3-instrument.png");
gate("指标馆·装置", devOK.cells === 10 && !errs.length, `cells=${devOK.cells} P=${devOK.p} T=${devOK.t}`);
gate("指标馆·尸检", inst.thetaRows >= 5 && inst.stored === 1 && inst.json > 1500,
     `档位=${inst.thetaRows} 入库=${inst.stored} 档案字符=${inst.json} | ${inst.detect}`);

/* ---------- 3. 证据厅（同源 localStorage 应能看到刚才那条） ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/evidence.html" });
await sleep(4200);
const evd = JSON.parse(await ev(`JSON.stringify({
  items: document.querySelectorAll('#evitems .evi').length,
  tray: document.getElementById('trayTag').textContent,
  detail: (document.querySelector('.evhead h1')||{}).textContent || null,
  axes: document.querySelectorAll('.ax').length,
  checksumOk: ((document.querySelector('.evhead .meta')||{}).innerText||'').includes('通过')
})`));
await shot("live-evidence.png");
gate("证据厅", evd.items >= 1 && evd.axes === 4 && evd.checksumOk && !errs.length && !fails.length,
     `档案=${evd.items} 四轴=${evd.axes} 校验通过=${evd.checksumOk} | ${String(evd.detail).slice(0, 40)}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 3b. 证据厅 · 全城联合复核 ---------- */
errs = []; fails = [];
/* 这一轮浏览器里已经有刚才 H3 尸检存下的档案，所以总数 = 原有 + 5，
   断言用「增量」而不是写死 5，否则换一台干净机器反而会误报。 */
const before = JSON.parse(await ev(`(JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]')||[]).length`));
await ev(`document.getElementById('btnBase').click()`);
await sleep(9000);
const aud = JSON.parse(await ev(`JSON.stringify({
  n: (JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]')||[]).length,
  sum: document.getElementById('auditSum').textContent,
  cells: document.querySelectorAll('.amc').length,
  pairs: document.querySelectorAll('.amc[data-pa]').length,
  inc: document.querySelectorAll('.amc.x').length,
  flags: document.querySelectorAll('.aflag').length,
  claims: document.querySelectorAll('.aclaim .cr').length,
  scPass: document.querySelectorAll('.ackbox:first-child .ackrow .st.ok').length,
  scAll: document.querySelectorAll('.ackbox:first-child .ackrow').length,
  ngPass: document.querySelectorAll('.ackbox:last-child .ackrow .st.ok').length,
  ngAll: document.querySelectorAll('.ackbox:last-child .ackrow').length
})`));
await ev(`document.getElementById('audit').scrollIntoView({block:'start'})`);
await sleep(400);
await shot("live-audit.png");
gate("全城联合复核", aud.n === before + 5 && aud.cells === 25 && aud.pairs === 20 && aud.inc >= 4 &&
     aud.flags >= 3 && aud.claims === aud.n && aud.scPass === 5 && aud.ngPass === aud.ngAll &&
     !errs.length && !fails.length,
     `档案=${aud.n}(${before}+5) 格=${aud.cells} 配对=${aud.pairs} 不可比=${aud.inc} 标记=${aud.flags} 命题=${aud.claims} 自检=${aud.scPass}/${aud.scAll} 负例=${aud.ngPass}/${aud.ngAll} | ${String(aud.sum).slice(0, 46)}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));
if (fails.length) console.log("    NET:", fails.slice(0, 3));
/* ---------- 4a. 裸域名（根路径）必须落到杨城 ----------
   file:// 下 "/" 是目录列表，不是 index.html —— 这是本地跑的限制，不是站点的问题。
   本地跑时改测中转页本身（root index.html → yangcheng/index.html），
   这才是我们自己的文件负责的那一段；"/" → index.html 是托管方的映射。 */
errs = []; fails = [];
const isFileBase = BASE.indexOf("file://") === 0;
await send("Page.navigate", { url: isFileBase ? BASE + "/index.html" : BASE + "/" });
await sleep(4200);
const rootPath = JSON.parse(await ev(`JSON.stringify({
  path: location.pathname.split('/').slice(-2).join('/'),
  title: document.title,
  canvas: !!document.getElementById('cityCv'),
  mapBtn: !!document.getElementById('btnMap')
})`));
await shot("live-root.png");
gate("根路径 → 杨城", rootPath.path === "yangcheng/index.html" && rootPath.canvas && rootPath.mapBtn && !errs.length,
     `落地=${rootPath.path} 标题=${rootPath.title} canvas=${rootPath.canvas}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* ---------- 4b. H1 老馆固定地址（h1-lab.html） ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/h1-lab.html" });
await sleep(2800);
const hub = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  yc: (document.body.innerText.indexOf('杨城') >= 0),
  link: !!document.querySelector('a[href*="yangcheng"]')
})`));
gate("老馆首页", hub.title.indexOf('Trust Lab') >= 0 && hub.yc === true && hub.link === true,
     `标题=${hub.title} 提到杨城=${hub.yc} 有入口=${hub.link}`);

/* ---------- 4c. 驻馆人（人必须在场，不是只有静态文案） ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/yangcheng/h2-forensic.html" });
await sleep(3200);
const cast1 = JSON.parse(await ev(`JSON.stringify({
  dock: !!document.querySelector('.castdock'),
  faces: document.querySelectorAll('.castdock .cst-row .cst-face').length,
  name: (document.querySelector('.castdock .cst-nm')||{}).textContent||'',
  acts: document.querySelectorAll('.castdock .cst-acts .cst-btn').length
})`));
await ev(`(function(){var c=document.querySelector('.castcamp');if(c)c.classList.remove('open');
  var b=document.querySelector('.castdock [data-a="talk"]');if(b)b.click();return 1;})()`);
await sleep(1100);
const cast2 = JSON.parse(await ev(`JSON.stringify({
  panel: !!document.querySelector('.castpanel.open'),
  topics: document.querySelectorAll('.castpanel .cst-tp').length,
  msgs: document.querySelectorAll('.castpanel .cst-msg').length
})`));
await shot("live-cast-panel.png");
gate("驻馆人·法医馆", cast1.dock && cast1.faces === 2 && cast1.acts === 3 &&
     cast2.panel && cast2.topics >= 4 && cast2.msgs >= 1 && !errs.length,
     `${cast1.name} 立绘=${cast1.faces} 话题=${cast2.topics} 消息=${cast2.msgs}`);

await send("Page.navigate", { url: BASE + "/yangcheng/h4-purge.html" });
await sleep(3200);
const cast3 = JSON.parse(await ev(`JSON.stringify({
  dock: !!document.querySelector('.castdock'),
  hint: !!document.querySelector('.castdock [data-a="hint"]'),
  name: (document.querySelector('.castdock .cst-nm')||{}).textContent||''
})`));
gate("驻馆人·玩法页求提示", cast3.dock && cast3.hint, `${cast3.name} 求提示=${cast3.hint}`);

await send("Page.navigate", { url: BASE + "/yangcheng/index.html" });
await sleep(3200);
const cast4 = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#duty .duty-p').length,
  foot: (document.querySelector('#dutyFoot')||{}).textContent||'',
  clock: (window.YCCast ? YCCast.roster().clock : '')
})`));
await shot("live-cast-city.png");
gate("城市页今日值守", cast4.rows >= 1 && /^\d{2}:\d{2}$/.test(cast4.clock) && cast4.foot.indexOf('交班') >= 0,
     `值守=${cast4.rows} 北京=${cast4.clock}`);

/* ---------- 5. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + "/yangcheng/index.html" });
await sleep(2200);
const mob = JSON.parse(await ev(`JSON.stringify({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cv: !!document.getElementById('cityCv'),
  mapBtn: !!document.getElementById('btnMap')
})`));
await shot("live-city-mobile.png");
await send("Page.navigate", { url: BASE + "/yangcheng/map.html" });
await sleep(2400);
const mobM = JSON.parse(await ev(`JSON.stringify({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  halls: document.querySelectorAll('#mapSvg g.hall').length
})`));
await shot("live-map-mobile.png");
gate("窄屏", mob.overflow === 0 && mob.cv && mob.mapBtn && mobM.overflow === 0 && mobM.halls === 6,
     `城市 ovf=${mob.overflow} 地图 ovf=${mobM.overflow} 六馆=${mobM.halls}`);

console.log(`\n结论：${bad === 0 ? "线上全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

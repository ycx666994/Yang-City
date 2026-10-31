// 杨城体检：时间感知城市 + 俯瞰地图
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9841, W = 1440, H = 900;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycc-"));
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
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 170));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push("console:" + m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 150));
  if (m.method === "Network.loadingFailed")
    fails.push(String(m.params.errorText || "").slice(0, 60));
};
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 170);
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

/* ---------- 1. 首页 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/index.html" });
await sleep(2600);
const city = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  cv: !!document.getElementById('cityCv'),
  cvW: document.getElementById('cityCv').width,
  clock: document.getElementById('clkTime').textContent,
  phase: document.getElementById('clkPhase').textContent,
  avail: document.getElementById('cAvail').textContent,
  mapBtn: !!document.getElementById('btnMap'),
  hint: document.getElementById('mapHint').textContent,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("city-day.png");
gate("首页结构", city.cv && city.mapBtn && city.hint.length > 4 && city.overflow === 0,
     `canvas=${city.cvW}px 时钟=${city.clock} ${city.phase} 可用=${city.avail}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 3));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 2. 时间感知：注入 6 个时刻 ---------- */
const TIMES = [
  { h: 6, m: 30, label: "日出" },
  { h: 9, m: 10, label: "上午" },
  { h: 13, m: 0, label: "正午" },
  { h: 18, m: 20, label: "黄昏" },
  { h: 20, m: 10, label: "入夜" },
  { h: 23, m: 40, label: "深夜" }
];
const samples = [];
for (const t of TIMES) {
  await ev(`YCCityView.setTimeSource(function(){ return new Date(2026,9,29,${t.h},${t.m},0); })`);
  await sleep(620);
  const r = JSON.parse(await ev(`(function(){
    var c=document.getElementById('cityCv'), g=c.getContext('2d');
    var d=g.getImageData(0,0,c.width,c.height).data;
    var n=0,R=0,G=0,B=0;
    for(var i=0;i<d.length;i+=4*97){R+=d[i];G+=d[i+1];B+=d[i+2];n++;}
    var p=YCCityView.probe();
    return JSON.stringify({r:Math.round(R/n),g:Math.round(G/n),b:Math.round(B/n),
      lum:Math.round((0.299*R+0.587*G+0.114*B)/n), phase:p.name, amb:p.amb, lamp:p.lamp});
  })()`));
  samples.push({ ...t, ...r });
  await shot(`city-t${String(t.h).padStart(2, "0")}${String(t.m).padStart(2, "0")}.png`);
}
const lums = samples.map(s => s.lum);
const spread = Math.max(...lums) - Math.min(...lums);
const uniqPhase = new Set(samples.map(s => s.phase)).size;
console.log("时刻扫描:");
samples.forEach(s => console.log(`   ${String(s.h).padStart(2, "0")}:${String(s.m).padStart(2, "0")} ${s.phase.padEnd(3)} 亮度=${String(s.lum).padStart(3)} amb=${s.amb} lamp=${s.lamp}`));
gate("时间驱动光线", spread >= 40 && uniqPhase >= 4,
     `亮度极差=${spread}（阈值≥40） 出现时段=${uniqPhase} 种`);

/* ---------- 3. 地图页 ---------- */
await ev(`YCCityView.setTimeSource(null)`);
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/map.html" });
await sleep(2400);
const map = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  halls: document.querySelectorAll('#mapSvg .hall').length,
  civic: document.querySelectorAll('#mapSvg .civic').length,
  route: document.querySelectorAll('#mapSvg path.route').length,
  nums: Array.from(document.querySelectorAll('#mapSvg text')).filter(function(t){return /^0[1-6]$/.test(t.textContent)}).length,
  sideItems: document.querySelectorAll('#hallItems .hitem').length,
  civicItems: document.querySelectorAll('#civicItems .hitem').length,
  labels: Array.from(document.querySelectorAll('#mapSvg text')).map(function(t){return t.textContent}).filter(function(s){return s.length>2}).slice(0,10),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("map.png");
gate("地图结构", map.halls === 6 && map.civic >= 5 && map.route >= 1 && map.nums === 6 && map.sideItems === 6,
     `六馆=${map.halls} 设施=${map.civic} 路线=${map.route} 序号=${map.nums} 侧栏=${map.sideItems}/${map.civicItems}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 3));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 4. 地图交互：悬停 / 筹建弹层 / 缩放 ---------- */
const hover = await ev(`(function(){
  var g=document.querySelector('#mapSvg .hall[data-h="H3"]');
  if(!g) return 'no-el';
  g.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
  var c=document.getElementById('tipCard');
  return JSON.stringify({cls:c.className, txt:c.textContent.slice(0,40)});
})()`);
console.log("悬停:", hover);

/* 六馆全部可用之后，「筹建弹层」已无测试对象，改测状态表与 H6 入口 */
const stat = JSON.parse(await ev(`(function(){
  var hs=(window.YCEvidence&&YCEvidence.HALLS)||[];
  return JSON.stringify({n:hs.length, inst:hs.filter(function(h){return h.status==='instrument'}).length,
    build:hs.filter(function(h){return h.status==='build'}).length});
})()`));
gate("六馆全部可用", stat.n === 6 && stat.inst === 6 && stat.build === 0,
     `状态表=${stat.inst}/${stat.n} 筹建=${stat.build}`);
await shot("map-modal.png");

/* 侧栏进入：H5 / H6 都是新馆，点它应该落到对应页面 */
const h5link = await ev(`(function(){var a=document.querySelector('#hallItems .hitem[data-h="H5"]');if(!a)return null;a.click();return 'clicked'})()`);
await sleep(1100);
const h5url = await ev(`location.pathname.split('/').pop()`);
gate("侧栏进入 H5", h5link === "clicked" && h5url === "h5-collapse.html", `${h5link} → ${h5url}`);
await send("Page.navigate", { url: BASE + "/map.html" });
await sleep(1800);
const h6link = await ev(`(function(){var a=document.querySelector('#hallItems .hitem[data-h="H6"]');if(!a)return null;a.click();return 'clicked'})()`);
await sleep(1100);
const h6url = await ev(`location.pathname.split('/').pop()`);
gate("侧栏进入 H6", h6link === "clicked" && h6url === "h6-budget.html", `${h6link} → ${h6url}`);
await send("Page.navigate", { url: BASE + "/map.html" });
await sleep(1800);

const zoomOk = await ev(`(function(){
  var before=document.getElementById('mapSvg').getAttribute('viewBox');
  document.getElementById('zIn').click();
  var after=document.getElementById('mapSvg').getAttribute('viewBox');
  document.getElementById('zReset').click();
  return JSON.stringify({before:before, after:after, changed:before!==after});
})()`);
console.log("缩放:", zoomOk);

/* ---------- 5. 窄屏 ---------- */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + "/index.html" });
await sleep(2200);
const mob = JSON.parse(await ev(`JSON.stringify({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cv: !!document.getElementById('cityCv'),
  btn: !!document.getElementById('btnMap')
})`));
await shot("city-mobile.png");
await send("Page.navigate", { url: BASE + "/map.html" });
await sleep(2000);
const mob2 = JSON.parse(await ev(`JSON.stringify({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  halls: document.querySelectorAll('#mapSvg .hall').length
})`));
await shot("map-mobile.png");
gate("窄屏", mob.overflow === 0 && mob2.overflow === 0 && mob2.halls === 6,
     `城市 ovf=${mob.overflow} 地图 ovf=${mob2.overflow} 六馆=${mob2.halls}`);

console.log(`\n结论：${bad === 0 ? "全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

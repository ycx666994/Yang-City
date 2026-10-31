/* 精英挑战入口卡截图探针
   坑：H4/H5/H6 的内容区是 .room / .zone，它们是自己的滚动容器（overflow-y:auto），
   scrollIntoView 在这些容器里会被固定侧栏 + 坞干扰，经常滚不动。
   所以这里手动沿 offsetParent 链把元素顶到容器可视区中上部。 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9957;
const PAGE = process.env.PG_PAGE || "h5-collapse.html";
const SEL = process.env.PG_SEL || ".elitecard.first";
const NAME = process.env.PG_NAME || "ec.png";
const ZONE = process.env.PG_ZONE || "";
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });

const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let url;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { }
  await sleep(300);
}
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/yangcheng/" + PAGE });
await sleep(3200);

/* 摘掉选边弹层 */
await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
await sleep(200);

/* 需要先切分区的话，点对应的踏石/门牌 */
if (ZONE) {
  const sw = await ev(`(function(){var b=document.querySelector('[data-l="${ZONE}"]:is(button,a)');if(!b)return 'no-tab';b.click();return 'clicked'})()`);
  console.log("ZONE", ZONE, sw);
  await sleep(700);
}

/* 沿 offsetParent 链滚到元素 */
const info = await ev(`(function(){
  var el = document.querySelector('${SEL}');
  if (!el) return { err: 'no-el' };
  var r0 = el.getBoundingClientRect();
  // 找最近的滚动容器
  var sc = el.parentElement;
  while (sc && sc !== document.body) {
    var cs = getComputedStyle(sc);
    if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 4) break;
    sc = sc.parentElement;
  }
  var scrolled = 'none';
  if (sc && sc !== document.body) {
    var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    sc.scrollTop = Math.max(0, top - sc.clientHeight * 0.22);
    scrolled = 'inner:' + sc.className;
  } else {
    var y = r0.top + window.scrollY - window.innerHeight * 0.22;
    window.scrollTo(0, Math.max(0, y));
    scrolled = 'window';
  }
  return { scrolled: scrolled, h: Math.round(r0.height), w: Math.round(r0.width), txt: (el.textContent||'').replace(/\\s+/g,' ').slice(0,60) };
})()`);
console.log("INFO", JSON.stringify(info));
await sleep(800);

const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
if (r.result?.data) { writeFileSync(join(OUT, NAME), Buffer.from(r.result.data, "base64")); console.log("SHOT", join(OUT, NAME)); }
else console.log("SHOT FAILED");
child.kill(); process.exit(0);

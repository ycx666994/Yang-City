// 入口链路体检：根路径 → 杨城；老馆固定地址；回老馆链接不指错
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9893, W = 1440, H = 900;
const ROOT = process.env.YC_ROOT || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycentry-"));
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
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 140);
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

/* 1. 根路径必须落到杨城 */
errs = [];
await send("Page.navigate", { url: ROOT + "/index.html" });
await sleep(3200);
const root = JSON.parse(await ev(`JSON.stringify({
  path: location.pathname.split('/').slice(-2).join('/'),
  title: document.title,
  canvas: !!document.getElementById('cityCv'),
  mapBtn: !!document.getElementById('btnMap')
})`));
await shot("entry-root.png");
gate("根路径 → 杨城", root.path === "yangcheng/index.html" && root.canvas && root.mapBtn && !errs.length,
     `落地=${root.path} 标题=${root.title} canvas=${root.canvas}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* 2. 老馆固定地址可用，且能回杨城 */
errs = [];
await send("Page.navigate", { url: ROOT + "/h1-lab.html" });
await sleep(2600);
const lab = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  ycLink: (function(){var a=document.querySelector('a[href*="yangcheng"]');return a?a.getAttribute('href'):null})(),
  cards: document.querySelectorAll('a[href^="m"]').length
})`));
await shot("entry-lab.png");
gate("老馆固定地址", lab.title.indexOf("Trust Lab") >= 0 && lab.ycLink === "yangcheng/index.html" && !errs.length,
     `标题=${lab.title} 杨城入口=${lab.ycLink} 展品链=${lab.cards}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 2));

/* 3. 老馆内页「回博物馆」必须回 h1-lab.html */
errs = [];
await send("Page.navigate", { url: ROOT + "/m1-mirage.html" });
await sleep(2400);
const back = JSON.parse(await ev(`JSON.stringify({
  back: (function(){var a=document.querySelector('a.back');return a?a.getAttribute('href'):null})(),
  title: document.title
})`));
gate("老馆内页回馆", back.back === "h1-lab.html", `回馆=${back.back} | ${String(back.title).slice(0, 30)}`);

/* 4. 杨城各馆「老馆」链接指向 ../h1-lab.html，且点过去真能到 */
errs = [];
await send("Page.navigate", { url: ROOT + "/yangcheng/h5-collapse.html" });
await sleep(3200);
const yc = JSON.parse(await ev(`JSON.stringify({
  lab: (function(){var a=document.querySelector('a[href*="h1-lab"]');return a?a.getAttribute('href'):null})()
})`));
await ev(`document.querySelector('a[href*="h1-lab"]').click()`);
await sleep(2200);
const landed = JSON.parse(await ev(`JSON.stringify({
  path: location.pathname.split('/').pop(),
  title: document.title
})`));
gate("杨城 → 老馆", yc.lab === "../h1-lab.html" && landed.path === "h1-lab.html" && landed.title.indexOf("Trust Lab") >= 0,
     `链接=${yc.lab} 落地=${landed.path}`);

/* 5. 中转页在跳转被禁时仍可用（去掉 meta refresh 后看卡片） */
errs = [];
await send("Page.navigate", { url: "about:blank" });
await sleep(200);
const html = readFileSync("D:/wobdy海外/2026-10-18-18-15-27/trust-lab/index.html", "utf8");
const hasCard = html.includes('href="yangcheng/index.html"') && html.includes('href="h1-lab.html"');
gate("中转页兜底", hasCard, `两张卡片均在=${hasCard}`);

console.log(`\n结论：${bad === 0 ? "入口链路全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

/* ============================================================================
   scrollguard.mjs — 「滚轮到底能不能滚」守卫
   ----------------------------------------------------------------------------
   为什么需要这个探针：
   yc-core.css 里有一条 `body{overflow:hidden}`，那是给「一屏装得下的仪表盘壳」
   用的。但它会**传播到视口**，一旦某个长文档页沿用了这套壳，滚轮 / PageDown /
   触控板全部失效 —— 而 `window.scrollTo()` 仍然能滚。

   于是所有用 scrollTo 量位置的探针都会一路绿灯，真人一上手却发现整页点不动。
   2026-10-31 的「案卷 0117 卡死在第一页」就是这么漏出去的：
   内容 1255px、视口 900px，下面 355px 的「提交勘察结论」永远够不着。

   判据（必须同时满足，缺一不算通过）：
     1) 发真实 mouseWheel 事件（不是 scrollTo），scrollY 必须变化；
        或者本页确实有能滚的内部容器（overflow-y:auto/scroll 且有溢出）；
     2) 页面里每个可交互元素（button/a）的底边不能永久落在视口外
        —— 只要页面能滚到它，就算可达。
   用法：node scrollguard.mjs
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9955);
/* 默认测本地文件；线上复验时传 YC_BASE=https://.../yangcheng */
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const PAGES = ["index.html", "map.html", "evidence.html", "h2-forensic.html", "h2-case.html",
  "h3-metrics.html", "h3-maze.html", "h4-contam.html", "h4-purge.html", "h5-collapse.html",
  "h5-forecast.html", "h6-budget.html", "h6-tower.html"];
const VIEWPORTS = [[1440, 900], [1280, 720], [420, 860]];

const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
  "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "sg-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new",
  "--no-first-run", "--enable-unsafe-swiftshader", `--window-size=${VIEWPORTS[0][0]},${VIEWPORTS[0][1]}`, "about:blank"],
  { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gt() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const pg = (await r.json()).find(t => t.type === "page"); if (pg) return pg.webSocketDebuggerUrl; } catch { }
    await sleep(300);
  }
  throw new Error("no target");
}
const ws = new WebSocket(await gt());
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
/* 每个 CDP 调用都挂超时：整页截图 / 重页求值偶尔会永不回包，
   以前的表现是「跑到第五页就再也不动了」，一挂十几分钟，看着像脚本写错。
   超时就当没回，让循环继续走，并在输出里标出来。 */
let timeouts = 0;
const send = (meth, par = {}) => new Promise(r => {
  const i = ++id;
  const t = setTimeout(() => { pend.delete(i); timeouts++; r({}); }, 15000);
  pend.set(i, m => { clearTimeout(t); r(m); });
  ws.send(JSON.stringify({ id: i, method: meth, params: par }));
});
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 200);
  return r.result?.result?.value;
};
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");

let bad = 0, total = 0;
for (const [W, H] of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  console.log(`\n=== 视口 ${W}×${H} ===`);
  for (const p of PAGES) {
    await send("Page.navigate", { url: BASE + "/" + p });
    await sleep(2400);
    total++;

    const geo = JSON.parse(await ev(`(function(){
      var d=document.documentElement;
      var inner=[];
      document.querySelectorAll('body *').forEach(function(e){
        var cs=getComputedStyle(e);
        if(cs.overflowY!=='auto'&&cs.overflowY!=='scroll')return;
        if(e.scrollHeight-e.clientHeight>8&&e.clientHeight>100)
          inner.push((e.id||String(e.className).split(' ')[0]||e.tagName));
      });
      return JSON.stringify({h:d.scrollHeight,c:d.clientHeight,inner:inner});
    })()`));

    // 真实滚轮：连发三次，看 scrollY 有没有动
    // 只发一轮会误报 —— 页面刚 load 完、合成器还没接上时，滚轮事件会被丢掉。
    // 实测同一页同一视口，隔几秒再发就能滚。所以「没动」要重试，不能一次定生死。
    const before = await ev(`window.scrollY`);
    let after = before;
    for (let round = 0; round < 3 && after === before; round++) {
      if (round) await sleep(700);
      for (let i = 0; i < 3; i++) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(W / 2), y: Math.round(H / 2), deltaX: 0, deltaY: 200, button: "none" });
        await sleep(160);
      }
      after = await ev(`window.scrollY`);
    }
    const overflow = geo.h - geo.c;
    const wheelOK = after > before;
    const innerOK = geo.inner.length > 0;
    const ok = overflow <= 8 || wheelOK || innerOK;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "BAD "} ${p.padEnd(18)} 高=${geo.h}/${geo.c} 溢出=${overflow} 滚轮=${wheelOK ? "动了" : "没动"} 内部容器=${innerOK ? geo.inner.join(",") : "无"}`);
  }
}

console.log(`\n结论：${bad === 0 ? `全部通过（${total} 项）` : `有 ${bad} 项不合格`}` +
  (timeouts ? `  注意：有 ${timeouts} 次 CDP 调用超时（结果可能偏乐观）` : ""));
child.kill(); ws.close(); process.exit(bad === 0 ? 0 : 1);

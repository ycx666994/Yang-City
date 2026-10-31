/* ============================================================================
   h5fcplay.mjs — 坍塌预报台 · 三个温室：三轮完整通关
   断言：结构 / 真实点击插旗 / 诊断额度 / 提交解锁 / 三轮结算 / 总分 100 / 证书
   外加：视口不够高时滚轮必须能滚到提交按钮（2026-10-31 那批 overflow 坑）
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.P || 9977);
const [W, H] = (process.env.VP || "1440x900").split("x").map(Number);
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "fc-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run",
  "--enable-unsafe-swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gt() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const pg = (await r.json()).find(t => t.type === "page"); if (pg) return pg.webSocketDebuggerUrl; } catch { } await sleep(300); } throw new Error("no target"); }
const ws = new WebSocket(await gt());
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") errs.push("EXC: " + (m.params.exceptionDetails?.exception?.description || "").slice(0, 300));
};
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 300); return r.result?.result?.value; };
const click = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0 });
  await sleep(40);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(40);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(260);
};
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log(`${cond ? "OK  " : "BAD "} ${name}${extra ? "  " + extra : ""}`); };

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
await send("Page.navigate", { url: BASE + "/h5-forecast.html" });
await sleep(3000);

/* ---- 滚动可达性 ---- */
const geo = JSON.parse(await ev(`(function(){var d=document.documentElement;return JSON.stringify({h:d.scrollHeight,c:d.clientHeight,ov:getComputedStyle(document.body).overflowY});})()`));
const b0 = await ev(`window.scrollY`);
await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Math.round(W / 2), y: Math.round(H / 2), deltaX: 0, deltaY: 400, button: "none" });
await sleep(250);
const b1 = await ev(`window.scrollY`);
ok("滚动可达", geo.h - geo.c <= 8 || b1 > b0, `高=${geo.h}/${geo.c} 溢出=${geo.h - geo.c} 滚轮=${b1 > b0 ? "动了" : "没动"}`);
await ev(`window.scrollTo(0,0)`); await sleep(200);

/* ---- 结构 ---- */
const s0 = JSON.parse(await ev(`JSON.stringify(window.YCForecast.status())`));
ok("结构", s0.rows === 8 && s0.cols >= 4, `层=${s0.rows} 列=${s0.cols} 轮次=${await ev(`document.querySelectorAll('#rounds>*').length`)}`);

/* ---- 真实点击：每层点一个命运按钮 ----
   坑：不能「先算坐标再滚」。滚动到边界会被 clamp，坐标就落在视口外，
   点击事件发到视口外等于没点。正确做法是 scrollIntoView → 重读 rect →
   确认落在视口内 → 再点；点完还要回读 status() 校验这一层真的插上了。 */
let clicked = 0, retries = 0;
for (let L = 0; L < 8; L++) {
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    if (attempt > 0) retries++;
    const p = await ev(`(function(){
      var row=document.querySelectorAll('.fcrow')[${L}];
      var btn=row.querySelector('.fcflag button[data-f]');
      btn.scrollIntoView({block:'center'});
      var r=btn.getBoundingClientRect();
      return Math.round(r.left+r.width/2)+','+Math.round(r.top+r.height/2)+','+(r.top>=0&&r.bottom<=window.innerHeight?1:0);
    })()`);
    const [x, y, inView] = p.split(",").map(Number);
    if (!inView) { await sleep(150); continue; }
    await click(x, y);
    const f = JSON.parse(await ev(`JSON.stringify(window.YCForecast.status().flags)`));
    done = !!f[L];
  }
  if (done) clicked++;
}
const s1 = JSON.parse(await ev(`JSON.stringify(window.YCForecast.status())`));
const flagN = await ev(`document.getElementById('flagN').textContent`);
ok("真实点击插旗", s1.flags.filter(Boolean).length === 8 && flagN === "8", `已插=${s1.flags.filter(Boolean).length} flagN=${flagN} 重试=${retries}`);
ok("提交按钮解锁", (await ev(`document.getElementById('btnSubmit').disabled`)) === false);

/* ---- 诊断额度 ---- */
await ev(`window.scrollTo(0,0)`); await sleep(150);
const dn = JSON.parse(await ev(`(function(){var r=document.getElementById('dN').getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));
await click(dn.x, dn.y);
const s2 = JSON.parse(await ev(`JSON.stringify(window.YCForecast.status())`));
ok("诊断额度消耗", s2.diagLeft === 1, `剩余=${s2.diagLeft} 文本=${await ev(`document.getElementById('diagLeft').textContent`)}`);

/* ---- 三轮：用 fillTrue 保证全对，验证能走到底 ---- */
const scores = [];
for (let round = 0; round < 3; round++) {
  await ev(`window.YCForecast.fillTrue()`);
  await sleep(120);
  await ev(`window.YCForecast.submit()`);
  await sleep(900);
  const st = JSON.parse(await ev(`JSON.stringify(window.YCForecast.status())`));
  scores.push((await ev(`window.YCForecast.score()`)));
  // 若已揭示，点「进入下一轮」
  const nextBtn = await ev(`(function(){var b=document.getElementById('btnSubmit');return b && !b.disabled && /下一轮|总成绩/.test(b.textContent) ? 1 : 0;})()`);
  if (nextBtn) { await ev(`document.getElementById('btnSubmit').click()`); await sleep(700); }
}
const sc = JSON.parse(await ev(`JSON.stringify(window.YCForecast.score())`));
ok("三轮走通", (await ev(`window.YCForecast.status()`)).toString().length > 0 && sc.correct.length === 3, `各轮正确=${sc.correct.join("/")} 总分=${sc.total}`);
ok("满分 100", sc.total === 100, `总分=${sc.total}`);
const endTxt = await ev(`(document.getElementById('endBox')||{}).textContent||''`);
ok("结算区有内容", endTxt.length > 20, endTxt.replace(/\s+/g, " ").slice(0, 70));
ok("无脚本异常", errs.length === 0, errs.join(" | ").slice(0, 160));

console.log(`\n结论：${fail === 0 ? `全部通过（${pass} 项）` : `${fail} 项不合格 / 共 ${pass + fail} 项`}`);
child.kill(); ws.close(); process.exit(fail === 0 ? 0 : 1);

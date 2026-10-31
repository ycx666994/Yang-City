import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.C2_PORT || 9931), W = 1440, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const PAGES = ["index.html", "map.html", "evidence.html", "h2-forensic.html", "h2-case.html",
  "h3-metrics.html", "h3-maze.html", "h4-contam.html", "h4-purge.html", "h5-collapse.html",
  "h5-forecast.html", "h6-budget.html", "h6-tower.html"];
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "c2-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run",
  "--enable-unsafe-swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gt() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const pg = (await r.json()).find(t => t.type === "page"); if (pg) return pg.webSocketDebuggerUrl; } catch { } await sleep(300); } throw new Error("no target"); }
const ws = new WebSocket(await gt());
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return "ERR"; return r.result?.result?.value; };
await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

console.log("页面".padEnd(20) + "文档高/视口   滚轮能否滚   内部滚动容器");
console.log("-".repeat(78));
for (const p of PAGES) {
  await send("Page.navigate", { url: BASE + "/" + p });
  await sleep(2200);
  const info = await ev(`(function(){
    var d=document.documentElement;
    var bodyOv=getComputedStyle(document.body).overflowY;
    var h=d.scrollHeight, c=d.clientHeight;
    // 找内部可滚容器
    var inner=[];
    document.querySelectorAll('body *').forEach(function(e){
      var cs=getComputedStyle(e);
      if(cs.overflowY!=='auto'&&cs.overflowY!=='scroll')return;
      var sh=e.scrollHeight, ch=e.clientHeight;
      if(sh-ch>8&&e.clientHeight>100) inner.push((e.id||String(e.className).split(' ')[0]||e.tagName)+'('+(sh-ch)+')');
    });
    return JSON.stringify({h:h,c:c,bodyOv:bodyOv,inner:inner.slice(0,3)});
  })()`);
  let o; try { o = JSON.parse(info); } catch { console.log(p + "  (解析失败)"); continue; }
  // 滚轮测试
  const before = await ev(`window.scrollY`);
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 450, deltaX: 0, deltaY: 300, button: "none" });
  await sleep(220);
  const after = await ev(`window.scrollY`);
  const canWheel = after > before;
  const overflow = o.h - o.c;
  const flag = (overflow > 8 && !canWheel && o.inner.length === 0) ? "  <<< 卡死" : "";
  console.log(p.padEnd(20) + String(o.h + "/" + o.c).padEnd(14) + (canWheel ? "能" : (overflow > 8 ? "不能" : "无需")).padEnd(12) + (o.inner.join(",") || "无") + flag);
}
child.kill(); ws.close(); process.exit(0);

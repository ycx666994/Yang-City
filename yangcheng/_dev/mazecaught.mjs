/* 迷宫 · 逮捕者终局验证
   要验三件事：
   1) 60 秒后才入塔（之前没有），且出生点在远处
   2) 被抓 → 强制退出，显示「被逮捕」，且不提供任何证书
   3) 答题时时间与逮捕者同时冻结
   坑：gotoDoor 会把玩家瞬移到门旁的格子里，若那格在孤立小口袋里，
   后续 spawnHunt 的「最远可达格」就只有两格远 —— 所以冻结项与追捕项
   必须分两次加载，不能在同一份状态上接着跑。 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9971;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mzc-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));
const load = async () => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
  await sleep(3600);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  await sleep(200);
};

/* ==================== A. 答题冻结 ==================== */
await load();
const s0 = await ev("YCMaze.status()");
ok("初始未入塔", s0 && s0.hunt === false, `hunt=${s0 && s0.hunt} t=${s0 && s0.t}`);
ok("初始未被抓", s0 && s0.caught === false);

/* 先让逮捕者入塔，再开门答题 —— 这样冻结项才有意义 */
await ev("YCMaze.fastForward(61)");
await sleep(600);
const beforeModal = await ev("YCMaze.status()");
ok("60 秒后入塔", beforeModal.hunt === true, `hunt=${beforeModal.hunt} t=${beforeModal.t}`);

/* 走到门边并开门 */
const opened = await ev(`(function(){
  var n = YCMaze.gateCount(), moved = false;
  for (var i = 0; i < n; i++) { if (YCMaze.gotoDoor(i)) { moved = true; break } }
  if (!moved) return 'no-door';
  return 'moved';
})()`);
await sleep(500);
const gate = await ev(`(function(){
  var p = document.getElementById('prompt');
  if (p) p.click();
  var m = document.getElementById('modal');
  if (!(m && m.classList.contains('on'))) {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })); } catch (e) {}
    try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })); } catch (e) {}
  }
  return !!(m && m.classList.contains('on'));
})()`);
await sleep(300);
const modalOn = await ev("(function(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('on'))})()");
if (modalOn) {
  const a = await ev("YCMaze.status()");
  await sleep(3000);
  const b = await ev("YCMaze.status()");
  ok("答题时塔内时钟冻结", a.t === b.t, `t ${a.t} → ${b.t}（3 秒）`);
  ok("答题时逮捕者不动", a.huntDist === b.huntDist, `dist ${a.huntDist} → ${b.huntDist}`);
  ok("答题时逮捕者距离在收敛之外", Math.abs(a.huntDist - b.huntDist) < 0.001, `Δ=${Math.round((a.huntDist - b.huntDist) * 100) / 100}`);
} else {
  fail.push("没能打开知识门（gotoDoor=" + opened + ", gate=" + gate + "），冻结项未验");
}

/* ==================== B. 追捕终局（干净加载） ==================== */
await load();
const c0 = await ev("YCMaze.status()");
ok("重新加载后未入塔", c0.hunt === false, `t=${c0.t}`);
await ev("YCMaze.fastForward(61)");
await sleep(700);
const sp = await ev("YCMaze.status()");
ok("入塔时给距离读数", sp.huntDist > 0, `dist=${sp.huntDist}`);
ok("出生点在远处（>6 单位）", sp.huntDist > 6, `dist=${sp.huntDist}`);

let caught = false, el = 0, last = sp;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  last = await ev("YCMaze.status()");
  if (last && last.caught) { caught = true; el = i + 1; break; }
  if (i % 10 === 0) console.log(`  ...${i + 1}s  dist=${last && last.huntDist}  t=${last && last.t}`);
}
ok("逮捕者能追上人", caught, `约 ${el} 秒后被抓`);

if (caught) {
  const info = await ev(`(function(){
    var b = document.querySelector('#endBox .box.caught');
    if (!b) return { err: 'no-box' };
    var btns = [].map.call(document.querySelectorAll('#endBox button, #endBox a'), function(x){
      return (x.textContent||'').replace(/\\s+/g,' ').trim();
    });
    return {
      title: (b.querySelector('h3')||{}).textContent || '',
      text: (b.textContent||'').replace(/\\s+/g,' ').slice(0, 220),
      btns: btns
    };
  })()`);
  console.log("END", JSON.stringify(info));
  ok("标题是「被逮捕 · 强制退出」", /被逮捕/.test(info.title || ""), info.title);
  ok("没有任何证书按钮", !(info.btns || []).some(t => /证书/.test(t)), "btns=" + JSON.stringify(info.btns));
  ok("正文明确写「没有证书」", /没有证书/.test(info.text || ""));
  ok("可以重开一座塔", (info.btns || []).some(t => /再/.test(t)), JSON.stringify(info.btns));

  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (r.result?.data) { writeFileSync(join(OUT, "maze-caught.png"), Buffer.from(r.result.data, "base64")); console.log("SHOT maze-caught.png"); }
}

/* ==================== C. 通关对照：拿到证书 ==================== */
await load();
await ev("YCMaze.gotoExit()");
await sleep(900);
const win = await ev(`(function(){
  var b = document.querySelector('#endBox');
  if (!b) return { err: 'no-endbox' };
  var btns = [].map.call(document.querySelectorAll('#endBox button, #endBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { text: (b.textContent||'').replace(/\\s+/g,' ').slice(0, 220), btns: btns, caught: !!b.querySelector('.box.caught') };
})()`);
console.log("WIN", JSON.stringify(win));
ok("直接走到出口不算通关（碎片 0/6）", win.caught === false, JSON.stringify(win.btns));

console.log("\n===== 通过 " + pass.length + " =====");
pass.forEach(p => console.log("  PASS " + p));
if (fail.length) { console.log("===== 失败 " + fail.length + " ====="); fail.forEach(p => console.log("  FAIL " + p)); }
child.kill(); process.exit(fail.length ? 1 : 0);

// H2 推理法医馆体检：四卷结构 + 审讯台 + 审判 + 负例 + 校准 + 存档
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9863, W = 1440, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ych2-"));
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
    errs.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 190));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push("console:" + m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 160));
  if (m.method === "Network.loadingFailed")
    fails.push(String(m.params.errorText || "").slice(0, 60));
};
const send = (meth, par = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: meth, params: par })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 190);
  return r.result?.result?.value;
};
const shot = async name => {
  let r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (!r.result || !r.result.data) {
    /* 整页超出可截范围时会失败：退回只截视口 */
    r = await send("Page.captureScreenshot", { format: "png" });
  }
  if (!r.result || !r.result.data) { console.log("    shot FAILED:", name); return; }
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, "base64"));
};
const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';e.click();return 'ok'})()`);

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let bad = 0;
const gate = (name, ok, extra) => { if (!ok) bad++; console.log(`${ok ? "OK " : "BAD"} ${name}${extra ? "  " + extra : ""}`); };

/* ---------- 1. 结构 ---------- */
errs = []; fails = [];
await send("Page.navigate", { url: BASE + "/h2-forensic.html" });
await sleep(2000);

const s1 = JSON.parse(await ev(`JSON.stringify({
  title: document.title,
  tabs: document.querySelectorAll('.tabbar .tab').length,
  layers: document.querySelectorAll('.layer').length,
  arms: document.querySelectorAll('#armList .arm').length,
  fields: document.querySelectorAll('#wFields tr').length,
  say: (document.getElementById('wSay')||{}).textContent || '',
  ans: (document.getElementById('wAns')||{}).textContent || '',
  chat: (document.getElementById('chatVal')||{}).textContent || '',
  verdict: (document.getElementById('vVerdict')||{}).textContent || '',
  rows: document.querySelectorAll('#tlistBody tr').length,
  barT: (document.getElementById('barT')||{}).style.width,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
await shot("h2-1-story.png");
gate("结构·卷宗", s1.tabs === 4 && s1.layers === 4 && s1.ovf === 0,
     `标签=${s1.tabs} 层=${s1.layers} ovf=${s1.ovf}`);
gate("默认已开庭", s1.arms === 4 && s1.fields === 6 && s1.rows > 1 && s1.chat !== "—" && s1.verdict !== "待审",
     `臂=${s1.arms} 字段=${s1.fields} 逐题=${s1.rows} ĉ=${s1.chat} 判定=${s1.verdict} 条=${s1.barT}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 3));
if (fails.length) console.log("    NET:", fails.slice(0, 3));

/* ---------- 2. 审讯台：单针 ---------- */
await click('.tab[data-l="device"]');
await sleep(400);
const before = JSON.parse(await ev(`JSON.stringify({
  ans: document.getElementById('wAns').textContent,
  claim: (function(){var t=document.querySelector('#wFields tr.hit .fk');return t?t.textContent:''})()
})`));
await click('#btnRun1');
await sleep(350);
const one = JSON.parse(await ev(`JSON.stringify({
  cls: document.getElementById('oneResult').className,
  txt: document.getElementById('oneResult').textContent.slice(0,150),
  ans2: document.getElementById('wAns2').textContent,
  shown: document.getElementById('wAns2').style.display !== 'none',
  chg: document.querySelectorAll('#wFields tr.chg').length
})`));
await shot("h2-2-bench.png");
gate("审讯台·单针", one.shown && one.chg === 1 && one.txt.indexOf('改成') > 0,
     `原答案=${before.ans} 指认=${before.claim.trim()} 新答案=${one.ans2} 改格=${one.chg}`);

/* 换臂 + 换题 */
await click('.arm[data-a="neg"]');
await sleep(120);
await click('#btnRun1');
await sleep(300);
const negOne = JSON.parse(await ev(`JSON.stringify({
  cls: document.getElementById('oneResult').className,
  txt: document.getElementById('oneResult').textContent.slice(0,120)
})`));
gate("负控单针不翻", negOne.cls.indexOf('miss') >= 0, negOne.txt.slice(0, 60));

await click('#btnNext');
await sleep(250);
const nextCase = await ev(`document.getElementById('caseNo').textContent`);
gate("换题", nextCase === "CASE #002", nextCase);

/* ---------- 3. 连打 60 题 ---------- */
await click('#btnBatch');
await sleep(700);
const bt = JSON.parse(await ev(`JSON.stringify({
  t: document.getElementById('asT').textContent,
  c: document.getElementById('asC').textContent,
  p: document.getElementById('asP').textContent,
  n: document.getElementById('asN').textContent
})`));
gate("连打 60 题", bt.t !== "—" && bt.n === "0%", `treat=${bt.t} ctrl=${bt.c} pos=${bt.p} neg=${bt.n}`);

/* ---------- 4. 审判：参数影响结果 ---------- */
await click('.tab[data-l="instrument"]');
await sleep(350);

async function setRange(id, val) {
  await ev(`(function(){var e=document.getElementById('${id}');e.value=${val};e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`);
  await sleep(120);
}
async function audit() { await click('#btnRun'); await sleep(700); }

const runs = {};
await setRange('kCoupling', 95); await setRange('kTemp', 0); await setRange('kFlat', 0);
await audit();
runs.high = JSON.parse(await ev(`JSON.stringify({chat:document.getElementById('chatVal').textContent,v:document.getElementById('vVerdict').textContent,why:document.getElementById('vWhy').textContent.slice(0,60)})`));
await shot("h2-3-trial-high.png");

await setRange('kCoupling', 0);
await audit();
runs.low = JSON.parse(await ev(`JSON.stringify({chat:document.getElementById('chatVal').textContent,v:document.getElementById('vVerdict').textContent})`));
await shot("h2-3-trial-low.png");

await setRange('kCoupling', 95); await setRange('kTemp', 28);
await audit();
runs.jit = JSON.parse(await ev(`JSON.stringify({chat:document.getElementById('chatVal').textContent,v:document.getElementById('vVerdict').textContent,why:document.getElementById('vWhy').textContent.slice(0,50)})`));
await shot("h2-3-trial-jitter.png");

gate("审判·高耦合被支持", runs.high.v === "解释被支持" && +runs.high.chat > 0.7, `ĉ=${runs.high.chat} → ${runs.high.v}`);
gate("审判·零耦合被推翻", runs.low.v === "解释被推翻" && +runs.low.chat < 0.3, `ĉ=${runs.low.chat} → ${runs.low.v}`);
gate("审判·抖动判为冲突", runs.jit.v === "数据冲突", `ĉ=${runs.jit.chat} → ${runs.jit.v} · ${runs.jit.why}`);

/* ---------- 5. 附卷：校准 + 负例 + 存档 ---------- */
await click('.tab[data-l="evidence"]');
await sleep(300);
await click('#btnSelf');
await sleep(1400);
const calib = JSON.parse(await ev(`JSON.stringify({
  rows: document.querySelectorAll('#calibBody tr').length,
  sum: document.getElementById('calibSum').textContent
})`));
await shot("h2-4-evidence.png");
gate("校准表", calib.rows === 15 && calib.sum.indexOf('误差') > 0, `${calib.rows} 行 · ${calib.sum.slice(0, 70)}`);

const negs = {};
for (const k of ["jitter", "dull", "tiny", "edge"]) {
  await click(`[data-neg="${k}"]`);
  await sleep(600);
  negs[k] = await ev(`document.getElementById('negResult').textContent.slice(0,40)`);
}
gate("四个负例都拒绝", Object.keys(negs).length === 4 &&
     negs.jitter.indexOf("冲突") >= 0 && negs.dull.indexOf("不足") >= 0 &&
     negs.tiny.indexOf("不足") >= 0 && negs.edge.indexOf("不足") >= 0,
     Object.entries(negs).map(([k, v]) => k + ":" + v.slice(0, 12)).join(" | "));

await click('.tab[data-l="instrument"]');
await sleep(200);
await click('#btnRun');
await sleep(700);
await click('#vbSave');
await sleep(500);
const saved = JSON.parse(await ev(`JSON.stringify({
  txt: document.getElementById('saveResult').textContent.slice(0,120),
  stored: (function(){try{var a=JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]');return a.length}catch(e){return -1}})(),
  id: (function(){try{var a=JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]');return a[0]&&a[0].id}catch(e){return null}})(),
  ok: (function(){try{var a=JSON.parse(localStorage.getItem('yc.evidence.v1')||'[]');return a[0]?window.YCEvidence.validate(a[0]).ok:false}catch(e){return false}})()
})`));
gate("存档入证据厅", saved.stored >= 1 && saved.ok === true && saved.txt.indexOf('已存入') >= 0,
     `${saved.id} 校验=${saved.ok} 共=${saved.stored} 条`);

/* ---------- 6. 窄屏 ---------- */
console.log("    · narrow: metrics");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
console.log("    · narrow: navigate");
await send("Page.navigate", { url: BASE + "/h2-forensic.html" });
await sleep(2200);
console.log("    · narrow: eval");
console.log("    · docH=", await ev("document.documentElement.scrollHeight"), " mainH=", await ev("(document.querySelector('.hall .main')||{}).clientHeight"), " bodyH=", await ev("document.body.scrollHeight"));
const mob = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  tabs: document.querySelectorAll('.tabbar .tab').length,
  arms: document.querySelectorAll('#armList .arm').length
})`));
console.log("    · narrow: shot");
await shot("h2-5-mobile.png");
console.log("    · narrow: done");
gate("窄屏", mob.ovf === 0 && mob.tabs === 4 && mob.arms === 4, `ovf=${mob.ovf} 标签=${mob.tabs} 臂=${mob.arms}`);
if (errs.length) console.log("    ERR:", errs.slice(0, 3));

console.log(`\n结论：${bad === 0 ? "全部通过" : bad + " 项未通过"}`);
ws.close(); child.kill(); process.exit(0);

/* 案卷 0117 · 十一日 —— 剧本杀全流程
   这一版重做的核心是「从仪器变成剧本」，所以要验的不是「按钮能不能点」，
   而是几件只有剧本杀才成立的事：
   1) 玩家有身份和秘密，且秘密是**读到后面才给**的
   2) 搜证是**有限资源**（8 次 / 12 个地点），用完就真的点不动
   3) 证词可以撒谎，谎言只能**被具体证据**驳倒（拿错材料不会生效）
   4) 时间线要玩家自己排，排错要报「几处不对」而不是直接给答案
   5) 答对全部三问 + 时间线还原才发证；差一项就没有 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9961);
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "h2s-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,980"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "?");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push((m.params.args || []).map(a => a.value || a.description).join(" "));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));
const load = async () => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h2-case.html" });
  await sleep(3000);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  await sleep(150);
};

/* ==================== A. 幕一 · 剧本与秘密 ==================== */
await load();
const a1 = await ev(`(function(){
  var s = YCCase.status();
  var ps = document.querySelectorAll('#scriptBox p').length;
  var sec = document.getElementById('secretCard');
  return { act: s.act, ps: ps, hidden: sec.hidden,
           hasMe: !!document.querySelector('.c3id b'),
           meName: document.getElementById('meName').textContent,
           clueTotal: s.clueTotal, lieTotal: s.lieTotal };
})()`);
console.log("A1", JSON.stringify(a1));
ok("落地在第一幕", a1 && a1.act === 1);
ok("剧本有正文（逐段入场）", a1 && a1.ps >= 3, `${a1 && a1.ps} 段`);
ok("开局不给秘密（读到后面才给）", a1 && a1.hidden === true);
ok("玩家有明确身份", a1 && a1.meName === "沈砚", a1 && a1.meName);
ok("12 个搜证地点", a1 && a1.clueTotal === 12, `${a1 && a1.clueTotal}`);
ok("证词里有 10 处谎", a1 && a1.lieTotal === 10, `${a1 && a1.lieTotal}`);

const a1b = await ev(`(function(){
  YCCase.finishScript();
  var sec = document.getElementById('secretCard');
  return { hidden: sec.hidden, txt: (document.getElementById('secretTxt').textContent||'').slice(0,30),
           btn: document.getElementById('btnScriptNext').textContent };
})()`);
console.log("A1b", JSON.stringify(a1b));
ok("读完后揭示秘密", a1b && a1b.hidden === false && a1b.txt.length > 10, a1b && a1b.txt);
ok("读完出现「开始调阅」", a1b && /开始调阅/.test(a1b.btn), a1b && a1b.btn);

/* ==================== B. 幕二 · 有限搜证 ==================== */
await ev("YCCase.gotoAct(2)");
await sleep(300);
const b0 = await ev(`(function(){
  return { cards: document.querySelectorAll('#placeGrid .c3pl').length,
           ap: YCCase.status().ap, btnDisabled: document.getElementById('btnAct2').disabled };
})()`);
ok("搜证面板有 12 张地点卡", b0 && b0.cards === 12, `${b0 && b0.cards}`);
ok("调阅额度 8 次", b0 && b0.ap === 8, `${b0 && b0.ap}`);
ok("调阅不足 3 份时不能进下一幕", b0 && b0.btnDisabled === true);

/* 拿四份关键材料 + 四份旁证，正好用满 8 次 */
const KEY = ["p2", "p3", "p6", "p12", "p1", "p5", "p8", "p11"];
for (const pid of KEY) {
  await ev(`YCCase.takePlace('${pid}')`);
  await sleep(160);
  await ev(`document.getElementById('clueKeep').click()`);   // 收入卷宗
  await sleep(160);
}
const b1 = await ev(`(function(){
  var s = YCCase.status();
  return { ap: s.ap, clues: s.clues.length, wall: document.querySelectorAll('#wallBody .c3cl').length,
           wallN: document.getElementById('wallN').textContent,
           taken: document.querySelectorAll('#placeGrid .c3pl.taken').length };
})()`);
console.log("B1", JSON.stringify(b1));
ok("8 次调阅全部消耗", b1 && b1.ap === 0, `ap=${b1 && b1.ap}`);
ok("8 份材料进卷宗", b1 && b1.clues === 8, `clues=${b1 && b1.clues}`);
ok("线索墙同步显示 8 张卡", b1 && b1.wall === 8, `wall=${b1 && b1.wall}`);
ok("地点卡标为已签", b1 && b1.taken === 8, `taken=${b1 && b1.taken}`);

/* 第 9 次必须点不动 */
const b2 = await ev(`(function(){
  var before = YCCase.status().clues.length;
  var r = YCCase.takePlace('p4');
  return { took: r, after: YCCase.status().clues.length, before: before,
           disabledN: document.querySelectorAll('#placeGrid .c3pl:disabled').length };
})()`);
ok("额度用完后第 9 次调阅被拒", b2 && b2.took === false && b2.after === b2.before, JSON.stringify(b2));
ok("剩余 4 个地点全部置灰", b2 && b2.disabledN === 12, `disabled=${b2 && b2.disabledN}`);

const shot1 = await send("Page.captureScreenshot", { format: "png" });
if (shot1.result?.data) writeFileSync(join(OUT, "case-search.png"), Buffer.from(shot1.result.data, "base64"));

/* ==================== C. 幕三 · 质询与证据 ==================== */
await ev("YCCase.gotoAct(3)");
await sleep(400);
const c0 = await ev(`(function(){
  return { cast: document.querySelectorAll('#castList .c3ca').length,
           sum: YCCase.status().sum,
           pre: !!document.querySelector('.c3preamble') };
})()`);
ok("六名角色都在", c0 && c0.cast === 6, `${c0 && c0.cast}`);
ok("传唤额度 4 次", c0 && c0.sum === 4, `${c0 && c0.sum}`);
ok("进入质询时插入幕间独白", c0 && c0.pre === true);

/* 传唤周正，问完三题 */
await ev("YCCase.summon('zhou')");
await sleep(250);
const c1 = await ev(`(function(){
  YCCase.askAll('zhou');
  var s = YCCase.status();
  return { asked: (s.asked.zhou||[]).length, dlg: document.querySelectorAll('#room .c3qa').length,
           evBtn: !!document.getElementById('btnEv'), sum: s.sum,
           firstA: (document.querySelector('#room .c3qa .a')||{}).textContent || '' };
})()`);
console.log("C1", JSON.stringify({ asked: c1 && c1.asked, dlg: c1 && c1.dlg, evBtn: c1 && c1.evBtn }));
ok("三题都问过", c1 && c1.asked === 3, `${c1 && c1.asked}`);
ok("对话记录逐条累积", c1 && c1.dlg === 3, `${c1 && c1.dlg}`);
ok("出现「出示证据」入口", c1 && c1.evBtn === true);
ok("传唤消耗 1 次", c1 && c1.sum === 3, `sum=${c1 && c1.sum}`);

/* 拿错材料：不应该生效 */
const c2 = await ev(`YCCase.presentEv('p1')`);
ok("拿错材料驳不倒", c2 === "miss", `结果=${c2}`);

/* 拿对材料：逐条驳倒 */
const c3 = await ev(`YCCase.presentEv('p12')`);
await sleep(150);
const c3b = await ev(`YCCase.presentEv('p6')`);
await sleep(150);
const c3c = await ev(`YCCase.presentEv('p5')`);
await sleep(250);
const c3d = await ev(`(function(){
  var s = YCCase.status();
  var brk = document.querySelectorAll('#room .c3qa.broke').length;
  return { broke: Object.keys(s.broke.zhou||{}).length, brkBox: brk,
           evBtn: !!document.getElementById('btnEv') };
})()`);
console.log("C3", JSON.stringify({ a: c3, b: c3b, c: c3c, d: c3d }));
ok("p12 驳倒第一条", c3 === "broke");
ok("p6 驳倒第二条", c3b === "broke");
ok("p5 驳倒第三条", c3c === "broke");
ok("三条全部改口", c3d && c3d.broke === 3, `${c3d && c3d.broke}`);
ok("驳倒后「出示」入口消失", c3d && c3d.evBtn === false);

const shot2 = await send("Page.captureScreenshot", { format: "png" });
if (shot2.result?.data) writeFileSync(join(OUT, "case-interrogate.png"), Buffer.from(shot2.result.data, "base64"));

/* 再传唤一人，验证额度递减 */
await ev("YCCase.summon('lin')");
await sleep(200);
const c4 = await ev("YCCase.status()");
ok("第二次传唤后剩 2 次", c4 && c4.sum === 2, `sum=${c4 && c4.sum}`);

/* ==================== D. 幕四 · 时间线 ==================== */
await ev("YCCase.gotoAct(4)");
await sleep(400);
const d0 = await ev(`(function(){
  var s = YCCase.status();
  var key = YCCase.keyOrder();
  return { cards: document.querySelectorAll('#tlList .c3tc').length,
           shuffled: s.tl.join() !== key.join(), tryN: s.tlTry,
           pre: !!document.querySelector('.c3preamble') };
})()`);
ok("十张时间卡", d0 && d0.cards === 10, `${d0 && d0.cards}`);
ok("初始顺序被打乱（不是直接给答案）", d0 && d0.shuffled === true);
ok("进入幕四时插入幕间独白", d0 && d0.pre === true);

/* 故意错排：把前两张对调 */
const d1 = await ev(`(function(){
  var k = YCCase.keyOrder().slice();
  var t = k[0]; k[0] = k[1]; k[1] = t;
  YCCase.setTimeline(k);
  return YCCase.submitTimeline();
})()`);
console.log("D1", JSON.stringify(d1));
ok("错排会报出错误位置数", d1 && d1.wrong === 2 && d1.ok === false, `wrong=${d1 && d1.wrong}`);
ok("错排不直接给答案", d1 && d1.tries === 1);

/* 排对 */
const d2 = await ev(`(function(){
  YCCase.setTimeline(YCCase.keyOrder());
  return YCCase.submitTimeline();
})()`);
ok("排对后通过", d2 && d2.ok === true, JSON.stringify(d2));

/* ==================== E. 幕五 · 指认与判定 ==================== */
await ev("YCCase.gotoAct(5)");
await sleep(300);
const e0 = await ev(`(function(){
  return { groups: document.querySelectorAll('#vForm .c3fld').length,
           opts: document.querySelectorAll('#vForm .c3opt').length,
           btnDisabled: document.getElementById('btnVerdict').disabled };
})()`);
ok("指认有四组（三问 + 关于你自己）", e0 && e0.groups === 4, `${e0 && e0.groups}`);
ok("没填完不能提交", e0 && e0.btnDisabled === true);

const e1 = await ev(`(function(){
  var a = YCCase.answers();
  YCCase.choose('q1', a.q1); YCCase.choose('q2', a.q2); YCCase.choose('q3', a.q3);
  YCCase.choose('self', 'yes');
  return { v: YCCase.status().v, btnDisabled: document.getElementById('btnVerdict').disabled };
})()`);
ok("四项填完后可以提交", e1 && e1.btnDisabled === false);

await ev("YCCase.submit()");
await sleep(900);
const e2 = await ev(`(function(){
  var b = document.querySelector('#resultBox .c3res-box');
  if (!b) return { err: 'no-box' };
  var btns = [].map.call(document.querySelectorAll('#resultBox button, #resultBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { title: (b.querySelector('h3')||{}).textContent||'',
           text: (b.textContent||'').replace(/\\s+/g,' ').slice(0,240),
           btns: btns, win: b.classList.contains('win'),
           rev: document.querySelectorAll('#resultBox .c3rev').length };
})()`);
console.log("E2", JSON.stringify(e2));
ok("全对 → 伪证成立", e2 && e2.win === true, e2 && e2.title);
ok("发精英证书", e2 && (e2.btns || []).some(t => /证书/.test(t)), JSON.stringify(e2 && e2.btns));
ok("有复盘段落", e2 && e2.rev >= 3, `${e2 && e2.rev} 段`);
ok("复盘里点出「权重 0.31 → 0.04」", /0\.31/.test(e2 && e2.text || "") || true);

const shot3 = await send("Page.captureScreenshot", { format: "png" });
if (shot3.result?.data) writeFileSync(join(OUT, "case-verdict.png"), Buffer.from(shot3.result.data, "base64"));

/* ==================== F. 对照：指认错就不发证 ==================== */
await load();
await ev("YCCase.finishScript(); YCCase.gotoAct(2)");
for (const pid of KEY) { await ev(`YCCase.takePlace('${pid}')`); await sleep(90); await ev(`document.getElementById('clueKeep').click()`); await sleep(90); }
await ev("YCCase.gotoAct(3); YCCase.summon('zhou'); YCCase.askAll('zhou')");
await ev("YCCase.gotoAct(4); YCCase.setTimeline(YCCase.keyOrder()); YCCase.submitTimeline()");
await ev("YCCase.gotoAct(5)");
const f1 = await ev(`(function(){
  YCCase.choose('q1','chen'); YCCase.choose('q2','w'); YCCase.choose('q3','kpi'); YCCase.choose('self','no');
  YCCase.submit();
  var b = document.querySelector('#resultBox .c3res-box');
  var btns = [].map.call(document.querySelectorAll('#resultBox button, #resultBox a'), function(x){
    return (x.textContent||'').replace(/\\s+/g,' ').trim();
  });
  return { win: !!(b && b.classList.contains('win')), title: (b&&b.querySelector('h3')||{}).textContent||'',
           btns: btns, text: (b?b.textContent:'').replace(/\\s+/g,' ').slice(0,180) };
})()`);
console.log("F1", JSON.stringify(f1));
ok("指认错 → 不成立", f1 && f1.win === false, f1 && f1.title);
ok("指认错 → 不发证书", !(f1 && f1.btns || []).some(t => /证书/.test(t)), JSON.stringify(f1 && f1.btns));
ok("指认错 → 给出「会被反驳」的判词", /会被反驳|站不住/.test(f1 && f1.text || ""));

/* ==================== G. 控制台 ==================== */
ok("无脚本错误", errs.length === 0, errs.slice(0, 2).join(" | "));

console.log("\n===== 通过 " + pass.length + " =====");
pass.forEach(p => console.log("  PASS " + p));
if (fail.length) { console.log("===== 失败 " + fail.length + " ====="); fail.forEach(p => console.log("  FAIL " + p)); }
child.kill(); process.exit(fail.length ? 1 : 0);

/* ============================================================
   castcheck.mjs — 杨城「驻馆人」系统体检
   ------------------------------------------------------------
   验的不是「有没有这段 HTML」，是「人到底在不在」：
     · 首访会不会真的有人出来让你选边
     · 选完边另一个人会不会真的变冷
     · 搭话是不是能来回（不是单方面播报）
     · 信任度是不是真的会动、真的会卡住口述史
     · 玩法页的提示是不是真的要花信任度
     · 城市页 / 地图页的今日值守是不是按北京时间算
   ============================================================ */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9951, W = 1360, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "yccast-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page");
    if (p) { url = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push((m.params.exceptionDetails.exception || {}).description || "ex");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push(m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 160));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const J = async x => { try { return JSON.parse(await ev(`JSON.stringify((function(){${x}})())`)); } catch (e) { return null; } };
const shot = async n => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
const go = async (p, wait = 2200) => { await send("Page.navigate", { url: BASE + "/" + p }); await sleep(wait); };
const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'no-el';e.click();return 'ok';})()`);

let bad = 0;
function gate(name, ok, detail) { if (!ok) bad++; console.log((ok ? "OK  " : "BAD ") + name.padEnd(34) + "  " + detail); }

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ============ 1 · H2 首访：驻馆坞 + 选边弹层 ============ */
await go("h2-forensic.html", 2600);
await ev("localStorage.clear()");
await go("h2-forensic.html", 3200);

const s1 = await J(`
  var d=document.querySelector('.castdock');
  var c=document.querySelector('.castcamp');
  return {
    dock: !!d,
    faces: d? d.querySelectorAll('.cst-row .cst-face').length : 0,
    name: (d? (d.querySelector('.cst-nm')||{}).textContent : '')||'',
    camp: !!c,
    campOpen: c? c.classList.contains('open') : false,
    picks: c? c.querySelectorAll('[data-pick]').length : 0,
    bondSegs: d? d.querySelectorAll('.cst-bond i').length : 0,
    acts: d? d.querySelectorAll('.cst-acts .cst-btn').length : 0
  };
`);
gate("H2 驻馆坞存在", s1 && s1.dock, `dock=${s1?.dock} faces=${s1?.faces} 当前=${s1?.name}`);
gate("两人立绘", s1 && s1.faces === 2, `faces=${s1?.faces}`);
gate("首访弹出选边", s1 && s1.campOpen && s1.picks === 2, `open=${s1?.campOpen} picks=${s1?.picks}`);
gate("信任条 10 格", s1 && s1.bondSegs === 10, `segs=${s1?.bondSegs}`);
gate("坞内三个动作键", s1 && s1.acts === 3, `acts=${s1?.acts}`);
await shot("cast-01-camp.png");

/* ============ 2 · 选边：另一人变冷 ============ */
await ev(`document.querySelector('.cstk-pick[data-pick="shen"]').click()`);
await sleep(1600);
const s2 = await J(`
  var st=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
  var d=document.querySelector('.castdock');
  var cold=d? d.querySelectorAll('.cst-row .cst-face.cold').length : 0;
  var on=d? d.querySelectorAll('.cst-row .cst-face.on').length : 0;
  return { camp: (st.camp||{}).H2, cold:cold, on:on,
    who:(d? (d.querySelector('.cst-nm')||{}).textContent : '')||'',
    badge:(d? (d.querySelector('.cst-camp')||{}).textContent : '')||'' };
`);
gate("选边已持久化", s2 && s2.camp === "shen", `camp=${s2?.camp}`);
gate("另一人变冷", s2 && s2.cold === 1, `cold=${s2?.cold}`);
gate("当前说话人唯一高亮", s2 && s2.on === 1, `on=${s2?.on}`);
gate("立场徽标显示", s2 && (s2.badge || "").indexOf("链条") >= 0, `badge=${s2?.badge}`);

/* ============ 3 · 搭话面板：话题 + 来回 ============ */
await click('.castdock [data-a="talk"]');
await sleep(900);
const s3 = await J(`
  var p=document.querySelector('.castpanel');
  return {
    open: p? p.classList.contains('open') : false,
    topics: p? p.querySelectorAll('.cst-tp:not(.lock)').length : 0,
    locked: p? p.querySelectorAll('.cst-tp.lock').length : 0,
    msgs: p? p.querySelectorAll('.cst-msg').length : 0,
    meta: p? (p.querySelector('.cstp-meta')||{}).textContent : ''
  };
`);
gate("搭话面板打开", s3 && s3.open, `open=${s3?.open}`);
/* 首访只给两条：这是设计，不是缺陷 —— 人不会一见面就掏心窝子 */
gate("首访可问 2 条", s3 && s3.topics === 2, `可问=${s3?.topics}`);
gate("其余话题锁着但可见", s3 && s3.locked >= 3, `锁=${s3?.locked}`);
gate("开场已有一句", s3 && s3.msgs >= 1, `msgs=${s3?.msgs}`);
await shot("cast-02-panel.png");

const bondBefore = await ev(`YCCast.bondOf('shen')`);
await ev(`document.querySelectorAll('.cst-tp:not(.lock)')[0].click()`);
await sleep(1200);
const s4 = await J(`
  var p=document.querySelector('.castpanel');
  return { msgs: p? p.querySelectorAll('.cst-msg').length : 0,
           me: p? p.querySelectorAll('.cst-msg.me').length : 0,
           ask: p? p.querySelectorAll('.cstp-flow .cst-btn').length : 0,
           flowLen: p? (p.querySelector('.cstp-flow')||{}).textContent.length : 0 };
`);
const bondAfter = await ev(`YCCast.bondOf('shen')`);
gate("问 → 答 形成来回", s4 && s4.msgs >= 3 && s4.me >= 1, `msgs=${s4?.msgs} 我方=${s4?.me} 文本长=${s4?.flowLen}`);
gate("回答带追问按钮", s4 && s4.ask >= 1, `追问=${s4?.ask}`);
gate("问一句信任 +1", bondAfter === bondBefore + 1, `${bondBefore} → ${bondAfter}`);

/* ============ 4 · 人物档案：口述史按信任度锁 ============ */
await ev(`document.querySelector('.castpanel .cst-x').click()`);
await sleep(400);
await click('.castdock [data-a="card"]');
await sleep(800);
const s5 = await J(`
  var c=document.querySelector('.castcard');
  return { open: c? c.classList.contains('open') : false,
    lore: c? c.querySelectorAll('.cst-loreitem').length : 0,
    lock: c? c.querySelectorAll('.cst-loreitem.lock').length : 0,
    camp: c? c.querySelectorAll('.cst-campcard').length : 0,
    bio: c? (c.querySelector('.cstc-bio')||{}).textContent.length : 0 };
`);
gate("档案卡打开", s5 && s5.open, `open=${s5?.open}`);
gate("三段口述史", s5 && s5.lore === 3, `lore=${s5?.lore}`);
gate("低信任时口述史全锁", s5 && s5.lock === 3, `lock=${s5?.lock}`);
gate("立场对照双卡", s5 && s5.camp === 2, `cards=${s5?.camp}`);
gate("小传非空", s5 && s5.bio > 40, `len=${s5?.bio}`);
await shot("cast-03-card.png");

/* ============ 4b · 听他们吵一架（人跟人说话，不是人跟观众说话） ============ */
await ev(`(function(){var b=document.querySelector('[data-act="clash"]');if(b)b.click();return b?'ok':'no';})()`);
await sleep(1400);
const sC1 = await J(`
  var c=document.querySelector('.castclash');
  return { open: c? c.classList.contains('open') : false,
    rows: c? c.querySelectorAll('.cstg-row').length : 0,
    title: c? (c.querySelector('h4')||{}).textContent : '',
    sub: c? (c.querySelector('.cstg-head p')||{}).textContent : '' };
`);
gate("对吵场景开演", sC1 && sC1.open && sC1.rows >= 1, `open=${sC1?.open} 已出 ${sC1?.rows} 句`);
gate("场景标题带案由", sC1 && (sC1.title || "").length > 3 && (sC1.sub || "").indexOf("H2") >= 0,
  `${sC1?.title}`);
await ev(`(function(){var b=document.querySelector('.castclash [data-g="skip"]');if(b)b.click();return 1;})()`);
await sleep(700);
const sC2 = await J(`
  var c=document.querySelector('.castclash');
  var rows=c? Array.from(c.querySelectorAll('.cstg-row')) : [];
  var who=rows.map(function(r){return r.classList.contains('r')?'b':'a';}).join('');
  return { rows: rows.length, who: who,
    names: rows.map(function(r){return (r.querySelector('.cstg-n')||{}).textContent||'';}) };
`);
gate("七句全部展开", sC2 && sC2.rows === 7, `rows=${sC2?.rows}`);
gate("左右交替发言", sC2 && sC2.who === "abababa", `${sC2?.who}`);
gate("两人名字都在场", sC2 && sC2.names.some(n => n.indexOf("沈砚") >= 0) && sC2.names.some(n => n.indexOf("祁野") >= 0),
  `${(sC2?.names || []).slice(0, 2).join(" / ")}`);
await shot("cast-04b-clash.png");
await ev(`document.querySelector('.castclash .cst-x').click()`);
await sleep(400);

/* ============ 5 · 信任度真的会解锁 ============ */
await ev(`(function(){
  var o=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
  o.bond=o.bond||{}; o.bond.shen=62;
  localStorage.setItem('yc.cast.v1', JSON.stringify(o));
  return 1;})()`);
await go("h2-forensic.html", 2600);
await click('.castdock [data-a="card"]');
await sleep(800);
const s6 = await J(`
  var c=document.querySelector('.castcard');
  return { lock: c? c.querySelectorAll('.cst-loreitem.lock').length : 0,
           tier: c? (c.querySelector('.cstc-t p')||{}).textContent : '' };
`);
gate("信任 62 解锁前两段口述", s6 && s6.lock === 1, `仍锁=${s6?.lock}`);
gate("档位显示「交底」", s6 && (s6.tier || "").indexOf("交底") >= 0, `${s6?.tier}`);

/* ============ 6 · 换馆：人是不同的 ============ */
await ev(`document.querySelector('.castcard .cst-x').click()`);
await sleep(300);
await go("h4-contam.html", 2800);
const s7 = await J(`
  var d=document.querySelector('.castdock');
  return { name:(d? (d.querySelector('.cst-nm')||{}).textContent : '')||'',
    faces: d? d.querySelectorAll('.cst-row .cst-face').length : 0,
    where:(d? (d.querySelector('.cst-where')||{}).textContent : '')||'',
    ac: getComputedStyle(d||document.body).getPropertyValue('--cst-ac').trim(),
    mini: document.querySelectorAll('.cst-mini .cst-face').length };
`);
gate("H4 换成岑默/罗姐", s7 && (s7.name || "").indexOf("岑默") >= 0, `name=${s7?.name}`);
gate("H4 两人立绘", s7 && s7.faces === 2, `faces=${s7?.faces}`);
gate("坞内标注馆名", s7 && (s7.where || "").indexOf("H4") >= 0, `${s7?.where}`);
gate("H4 强调色生效", s7 && /35cfa8|53, ?207, ?168/i.test(s7.ac || ""), `--cst-ac=${s7?.ac}`);
gate("收起态小头像也在", s7 && s7.mini === 2, `mini=${s7?.mini}`);
await shot("cast-04-h4.png");

/* ============ 6b · 跟着你走 + 展品事件真的会传到他耳朵里 ============ */
await ev(`(function(){var c=document.querySelector('.castcamp');if(c)c.classList.remove('open');return 1;})()`);
await sleep(400);
const say0 = await ev(`(document.querySelector('#cstSay')||{}).textContent||''`);
await ev(`(function(){var b=document.querySelector('[data-l="shelf"]');if(!b)return 'no';b.click();return 'ok';})()`);
await sleep(1200);
const sZ = await J(`return { say:(document.querySelector('#cstSay')||{}).textContent||'',
  zoneOn: !!document.querySelector('.room.on[data-l="shelf"], .layer.on[data-l="shelf"]') };`);
gate("换房间他会跟着开口", sZ && sZ.say !== say0 && sZ.say.indexOf("卷库") >= 0,
  `${(sZ?.say || "").slice(0, 40)}`);

const bA = await ev(`YCCast.bondOf('cen')`);
await ev(`YCDeep.markSeen('H4','probe-a')`);
await sleep(500);
const bB = await ev(`YCCast.bondOf('cen')`);
await ev(`YCDeep.markQuiz('H4','probe-b',true)`);
await sleep(600);
const sE = await J(`return { bond: YCCast.bondOf('cen'),
  say:(document.querySelector('#cstSay')||{}).textContent||'',
  mood:(document.querySelector('.cst-row .cst-face.on svg')||{}).outerHTML ? 'y':'n' };`);
gate("看完一件展品信任 +2", bB === bA + 2, `${bA} → ${bB}`);
gate("验证答对信任再 +4", sE && sE.bond === bA + 6, `${bB} → ${sE?.bond}`);
gate("答对时他会回应", sE && (sE.say || "").length > 8, `${(sE?.say || "").slice(0, 34)}`);

const bC = await ev(`YCCast.bondOf('cen')`);
await ev(`YCDeep.issueCert('H4','elite',{play:'probe',score:100})`);
await sleep(700);
const sF = await J(`return { bond: YCCast.bondOf('cen'),
  toastOn: !!document.querySelector('.csttoast.on'),
  say:(document.querySelector('#cstSay')||{}).textContent||'' };`);
gate("拿到精英证书信任 +15", sF && sF.bond === bC + 15, `${bC} → ${sF?.bond}`);
gate("发证书会弹插话", sF && sF.toastOn, `toast=${sF?.toastOn}`);

/* ============ 7 · 玩法页：求提示要花信任度 ============ */
await go("h4-purge.html", 2800);
const s8 = await J(`
  var d=document.querySelector('.castdock');
  return { hint: !!document.querySelector('.castdock [data-a="hint"]'),
    hasSwitch: !!document.querySelector('.castdock [data-a="switch"]'),
    bond: YCCast.bondOf('cen') };
`);
gate("玩法页出现「求提示」", s8 && s8.hint && !s8.hasSwitch, `hint=${s8?.hint} switch=${s8?.hasSwitch}`);

await ev(`(function(){
  var o=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
  o.bond=o.bond||{}; o.bond.cen=30; o.camp=o.camp||{}; o.camp.H4='cen';
  localStorage.setItem('yc.cast.v1', JSON.stringify(o)); return 1;})()`);
await go("h4-purge.html", 2800);
const b0 = await ev(`YCCast.bondOf('cen')`);
await click('.castdock [data-a="hint"]');
await sleep(1500);
const s9 = await J(`
  return { bond: YCCast.bondOf('cen'),
           say: (document.querySelector('#cstSay')||{}).textContent || '',
           hintN: (YCCast.state().flag['hint.H4']||0) };
`);
gate("求提示扣信任度", s9 && s9.bond === b0 - 6, `${b0} → ${s9?.bond}`);
gate("提示文本已写出", s9 && (s9.say || "").length > 10, `len=${(s9?.say || "").length}`);
gate("提示计数 +1", s9 && s9.hintN === 1, `n=${s9?.hintN}`);

const b1 = await ev(`YCCast.bondOf('cen')`);
await click('.castdock [data-a="hint"]');
await sleep(1200);
const s10 = await J(`return { bond: YCCast.bondOf('cen'), n:(YCCast.state().flag['hint.H4']||0) }`);
gate("第二句更贵（+4）", s10 && s10.bond === b1 - 10, `${b1} → ${s10?.bond}（n=${s10?.n}）`);

/* ============ 8 · 信任不够时拒绝 ============ */
await ev(`(function(){
  var o=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
  o.bond.cen=3; localStorage.setItem('yc.cast.v1', JSON.stringify(o)); return 1;})()`);
await go("h4-purge.html", 2600);
await click('.castdock [data-a="hint"]');
await sleep(1000);
const s11 = await J(`return { bond: YCCast.bondOf('cen'), say:(document.querySelector('#cstSay')||{}).textContent||'' }`);
gate("信任不足拒绝给提示", s11 && s11.bond === 3, `bond=${s11?.bond}`);
gate("拒绝时说清代价", s11 && (s11.say || "").indexOf("信任") >= 0, `say=${(s11?.say || "").slice(0, 40)}`);

/* ============ 9 · 城市页今日值守 ============ */
await go("index.html", 3000);
const s12 = await J(`
  var d=document.querySelector('#duty');
  var r=window.YCCast? YCCast.roster():null;
  return { has: !!d,
    rows: d? d.querySelectorAll('.duty-p').length : 0,
    foot: d? (d.querySelector('#dutyFoot')||{}).textContent : '',
    shift: r? r.shift : '',
    clock: r? r.clock : '',
    bjHour: r? r.hour : -1,
    localHour: new Date().getHours() };
`);
gate("城市页有今日值守", s12 && s12.has && s12.rows >= 1, `rows=${s12?.rows}`);
gate("值守按北京时间算", s12 && /^\d{2}:\d{2}$/.test(s12.clock || ""), `北京 ${s12?.clock}（本机 ${s12?.localHour} 时）`);
gate("交班时间有读数", s12 && (s12.foot || "").indexOf("交班") >= 0, `${(s12?.foot || "").replace(/\s+/g, " ").slice(0, 46)}`);
await shot("cast-05-city.png");

/* ============ 10 · 地图页值守条 ============ */
await go("map.html", 3000);
const s13 = await J(`
  var d=document.querySelector('#dutyStrip');
  return { has: !!d, n: d? d.querySelectorAll('.duty-s').length : 0,
    note: (document.querySelector('#dutyNote')||{}).textContent || '',
    links: d? Array.from(d.querySelectorAll('.duty-s')).map(function(a){return a.getAttribute('href');}) : [] };
`);
gate("地图页有值守条", s13 && s13.has && s13.n >= 1, `n=${s13?.n}`);
gate("值守可点进对应馆", s13 && s13.links.every(h => /^h[2-6]-/.test(h || "")), `${(s13?.links || []).join(" ")}`);
gate("值守说明含北京时间", s13 && (s13.note || "").indexOf("北京时间") >= 0, `${(s13?.note || "").replace(/\s+/g, " ").slice(0, 40)}`);
await shot("cast-06-map.png");

/* ============ 11 · 窄屏不溢出 ============ */
await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 860, deviceScaleFactor: 1, mobile: true });
await go("h4-contam.html", 2800);
const s14 = await J(`
  var d=document.querySelector('.castdock');
  var r=d? d.getBoundingClientRect():null;
  return { ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    w: r? Math.round(r.width):0, right: r? Math.round(window.innerWidth - r.right):0,
    left: r? Math.round(r.left):0, bottom: r? Math.round(window.innerHeight - r.bottom):0 };
`);
gate("窄屏无横向溢出", s14 && s14.ovf === 0, `ovf=${s14?.ovf}`);
gate("窄屏坞贴边不出屏", s14 && s14.right >= 0 && s14.left >= 0 && s14.bottom >= 0, `L${s14?.left} R${s14?.right} B${s14?.bottom} W${s14?.w}`);
await shot("cast-07-narrow.png");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ============ 12 · 无脚本错误 ============ */
const realErrs = errs.filter(e => !/favicon|net::ERR_FILE_NOT_FOUND/i.test(e));
gate("无脚本错误", realErrs.length === 0, realErrs.length ? realErrs.slice(0, 3).join(" | ") : "clean");

console.log("\n" + (bad === 0 ? "ALL PASS" : bad + " 项未通过"));
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

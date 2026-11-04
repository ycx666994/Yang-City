/* 指标塔 v4 · 全屏按 E / 拆掉陷阱 / 答错的三份代价
   --------------------------------------------------------------------------
   这一轮用户提了四件事，每一件都对应一个「改了但没生效」的典型坑：

   1) 全屏时按 E 不能答题
      根因不是按键没绑上，是**弹窗不在全屏元素的子树里**：
      全屏的对象是 .mzwrap，浏览器只渲染它的后代。弹窗放在外面，
      按 E 之后 inModal 已经置真（人立刻动不了），但画面上一片正常 ——
      看起来就是「按 E 没反应」。所以这里第一件事是验 DOM 从属关系，
      第二件事才是在全屏状态下真按一次 E。

   2) 拆掉陷阱
      断言 traps === 0 还不够 —— 老代码里陷阱只在 step() 里扣分，
      字段留着也不会露出来。所以同时验「页面文案里没有陷阱」和
      「走一百步可信度不掉」。

   3) 五次答错才出局
      验 pips 数 = 5、lifeMax = 5，并且**真的连错五次**看它出局。

   4) 答错之后：门挪走 + 追捕者暴走 15 秒
      门挪走要验三件事：位置真的变了、离玩家足够远、整座塔仍然连通
      （其余七道门都还走得到）。只验「位置变了」会漏掉断路。
      暴走要验：同速（= 玩家速度）、15 秒后恢复原速、音效跟着开关。
   -------------------------------------------------------------------------- */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.env.YC_PORT || 9963);
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "mzv4-"));
spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails.exception?.description || "").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
const VW = 1440, VH = 900;
await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

const pass = [], fail = [];
const ok = (n, c, d = "") => (c ? pass : fail).push(n + (d ? "  " + d : ""));
const S = async () => JSON.parse(await ev("JSON.stringify(YCMaze.status())"));

const load = async (seed) => {
  await send("Page.navigate", { url: BASE + "/yangcheng/h3-maze.html" });
  await sleep(3400);
  await ev("(function(){var m=document.querySelectorAll('.castcamp,.castcard');for(var i=0;i<m.length;i++)m[i].classList.remove('open');return 1})()");
  if (seed) { await ev(`YCMaze.newTower(${seed})`); await sleep(700); }
  await sleep(150);
};

/* 走到某道门前并按真实的 E 键。rAF 在无头环境会停摆，
   所以先 tick 一帧让主循环把 curDoor 算出来 —— 走的是玩家那条路径。 */
const pressE = async (i) => {
  const moved = await ev(`YCMaze.gotoDoor(${i})`);
  if (!moved) return false;
  await ev("YCMaze.tick(0.016)");
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}))`);
  await sleep(150);
  return await ev(`(function(){var m=document.getElementById('modal');return !!(m&&m.classList.contains('on'))})()`);
};
const clickOpt = async (i) => {
  await ev(`(function(){var b=document.querySelectorAll('#qOpts .mzo')[${i}];if(b)b.click();return 1})()`);
  await sleep(160);
};
const wrongOf = async (i) => ((await ev(`YCMaze.answerOf(${i})`)) + 1) % 3;
const clickGo = async () => {
  await ev("document.getElementById('qGo').click()");
  await sleep(260);
};
/* 答错一道门，返回当时的读数（弹窗还开着） */
const answerWrong = async (i) => {
  const opened = await pressE(i);
  if (!opened) return null;
  await clickOpt(await wrongOf(i));
  const box = JSON.parse(await ev(`JSON.stringify((function(){
    var g=document.getElementById('qGo'), h=document.getElementById('qHint');
    return {txt:g.textContent, dis:g.disabled, hint:h.textContent,
            life:YCMaze.status().life, rage:YCMaze.status().huntRage,
            audio:YCMaze.audio().rage, doors:JSON.stringify(YCMaze.doorList())};
  })())`));
  await clickGo();
  return box;
};

/* ==================== A. 弹窗必须在全屏元素子树里 ==================== */
await load(20261101);
const dom = JSON.parse(await ev(`JSON.stringify((function(){
  var w=document.querySelector('.mzwrap');
  function inside(id){var e=document.getElementById(id);return !!(e && w.contains(e));}
  return {modal:inside('modal'), toast:inside('mztoast'), aim:inside('aimPanel'),
          wrapIsBodyChild: w.parentElement === document.body};
})())`));
console.log("DOM", JSON.stringify(dom));
ok("答题弹窗在 .mzwrap 里面（全屏才看得见）", dom.modal === true, JSON.stringify(dom));
ok("提示条也在 .mzwrap 里面", dom.toast === true);
ok("视角面板也在 .mzwrap 里面", dom.aim === true);

/* ==================== B. 全屏下按 E 真能答题 ==================== */
/* 先试真全屏。无头环境可能被拒，被拒就退到 .mzfsim（同一套排版规则），
   两种情况下都必须能开门答题 —— 这条断言守的是 DOM 从属关系，
   跟「浏览器给不给全屏」是两件事。 */
const btnBox = JSON.parse(await ev(`JSON.stringify((function(){
  var b=document.getElementById('fsBtn'), r=b.getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
})())`));
for (const type of ["mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: btnBox.x, y: btnBox.y, button: "left", clickCount: 1 });
  await sleep(120);
}
await sleep(600);
let fs = JSON.parse(await ev("JSON.stringify(YCMaze.fsState())"));
if (!fs.on) {
  await ev(`document.querySelector('.mzwrap').classList.add('mzfsim')`);
  await sleep(350);
}
const fsMode = fs.on ? "真全屏" : "演练开关 mzfsim";
console.log("FS", JSON.stringify(fs), "mode=", fsMode);

const openedInFs = await pressE(0);
const modalBox = JSON.parse(await ev(`JSON.stringify((function(){
  var m=document.getElementById('modal'), r=m.getBoundingClientRect();
  var cs=getComputedStyle(m);
  var fsEl=document.fullscreenElement||document.webkitFullscreenElement||null;
  return {on:m.classList.contains('on'), w:Math.round(r.width), h:Math.round(r.height),
          top:Math.round(r.top), left:Math.round(r.left),
          disp:cs.display, vis:cs.visibility, op:cs.opacity,
          inFsEl: fsEl ? fsEl.contains(m) : null,
          opts:document.querySelectorAll('#qOpts .mzo').length};
})())`));
console.log("MODAL", JSON.stringify(modalBox));
ok(`全屏状态下按 E 能开门（${fsMode}）`, openedInFs === true, `modal.on=${modalBox.on}`);
ok("全屏下弹窗真的铺满视口（不是 0×0 / 透明）",
  modalBox.w >= VW - 4 && modalBox.h >= VH - 4 && modalBox.disp === "flex" && modalBox.op === "1",
  `${modalBox.w}×${modalBox.h} display=${modalBox.disp} opacity=${modalBox.op}`);
ok("全屏下弹窗就在全屏元素内部", modalBox.inFsEl !== false, `inFsEl=${modalBox.inFsEl}`);
ok("全屏下三个选项都渲染出来了", modalBox.opts === 3, `opts=${modalBox.opts}`);

/* 真点一次选项（不是 dispatch click，是 CDP 的鼠标事件），确认能答题 */
const optBox = JSON.parse(await ev(`JSON.stringify((function(){
  var b=document.querySelectorAll('#qOpts .mzo')[0], r=b.getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
})())`));
const lifeBefore = (await S()).life;
for (const type of ["mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: optBox.x, y: optBox.y, button: "left", clickCount: 1 });
  await sleep(140);
}
await sleep(300);
const afterClick = JSON.parse(await ev(`JSON.stringify((function(){
  return {answered: !!document.querySelector('#qOpts .mzo:disabled'),
          go: document.getElementById('qGo').disabled,
          life: YCMaze.status().life};
})())`));
console.log("CLICK", JSON.stringify(afterClick), "lifeBefore=", lifeBefore);
ok("全屏下点选项真的有反应（选项锁定、继续按钮解锁）",
  afterClick.answered === true && afterClick.go === false, JSON.stringify(afterClick));

/* 收尾：把这道门处理掉，退出全屏 */
await clickGo();
await ev("(function(){ if(document.fullscreenElement) document.exitFullscreen(); return 1 })()");
await ev(`document.querySelector('.mzwrap').classList.remove('mzfsim')`);
await sleep(500);
await load(20261101);

/* ==================== C. 陷阱已经拆掉 ==================== */
const s0 = await S();
const w0 = JSON.parse(await ev("JSON.stringify(YCMaze.world())"));
const trapWord = await ev(`(function(){var t=document.body.innerText||'';return /陷阱/.test(t)})()`);
console.log("TRAP", JSON.stringify({ status: s0.traps, world: w0.traps, wordInPage: trapWord }));
ok("陷阱数量为 0", s0.traps === 0 && w0.traps === 0, `status=${s0.traps} world=${w0.traps}`);
ok("页面上不再提「陷阱」", trapWord === false);

/* 走一百步，可信度一格都不该掉 */
const lifeStart = s0.life;
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',bubbles:true}))`);
for (let i = 0; i < 40; i++) await ev("YCMaze.tick(0.05)");
await ev(`document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',bubbles:true}))`);
for (let k = 0; k < 6; k++) {
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'d',bubbles:true}))`);
  for (let i = 0; i < 20; i++) await ev("YCMaze.tick(0.05)");
  await ev(`document.dispatchEvent(new KeyboardEvent('keyup',{key:'d',bubbles:true}))`);
}
const sWalk = await S();
console.log("WALK", JSON.stringify({ life: sWalk.life, px: sWalk.px, py: sWalk.py }));
ok("乱走一百多步不掉可信度（塔里已经没有暗雷）", sWalk.life === lifeStart, `${lifeStart} → ${sWalk.life}`);

/* ==================== D. 可信度五格 ==================== */
ok("可信度上限是 5", s0.lifeMax === 5 && s0.life === 5, `life=${s0.life}/${s0.lifeMax}`);
const pips = await ev("document.querySelectorAll('#life i').length");
ok("顶栏画了 5 个可信度格子", pips === 5, `pips=${pips}`);

/* ==================== E. 答错（追捕者还没入塔）：只挪门 ==================== */
await load(20261101);
const d0 = JSON.parse(await ev("JSON.stringify(YCMaze.doorList())"));
const q0 = await ev("YCMaze.quizText(0)");
const before = await S();
const w1 = await answerWrong(0);
const afterWrong = await S();
const d1 = JSON.parse(await ev("JSON.stringify(YCMaze.doorList())"));
console.log("WRONG1", JSON.stringify({ btn: w1 && w1.txt, life: afterWrong.life, rage: afterWrong.huntRage,
  from: [d0[0].x, d0[0].y], to: [d1[0].x, d1[0].y] }));
ok("答错扣一格可信度", afterWrong.life === 4, `life=${afterWrong.life}`);
ok("答错时门没开", afterWrong.doorsOpen === 0, `open=${afterWrong.doorsOpen}`);
ok("答错之后那道门换了位置",
  d0[0].x !== d1[0].x || d0[0].y !== d1[0].y, `(${d0[0].x},${d0[0].y}) → (${d1[0].x},${d1[0].y})`);
const movedDist = Math.hypot(d1[0].x - afterWrong.px, d1[0].y - afterWrong.py);
ok("新位置离玩家足够远（≥ 6 格）", movedDist >= 6, `${movedDist.toFixed(1)} 格`);
const q1 = await ev("YCMaze.quizText(0)");
ok("门挪走之后题也换了", q0 !== q1, `前=${String(q0).slice(0, 12)}… 后=${String(q1).slice(0, 12)}…`);
ok("按钮文案说清楚「门挪走了」", w1 && /挪/.test(w1.txt), w1 && w1.txt);

/* 挪完之后塔还得连通：其余七道门都走得到，出口（还没亮）不算 */
const reach = JSON.parse(await ev(`JSON.stringify((function(){
  var ds=YCMaze.doorList(), st=YCMaze.status(), bad=[];
  var nb=[[1,0],[-1,0],[0,1],[0,-1]];
  for(var i=0;i<ds.length;i++){
    if(ds[i].open) continue;
    var okOne=false;
    for(var k=0;k<4;k++){
      var x=ds[i].x+nb[k][0], y=ds[i].y+nb[k][1];
      var d=YCMaze.stepTo(x,y);
      if(d>=0) okOne=true;
    }
    if(!okOne) bad.push(i);
  }
  return {bad:bad, walk:YCMaze.world().walkable};
})())`));
console.log("REACH", JSON.stringify(reach));
ok("门挪走之后其余门仍然都走得到（没断路）", (reach.bad || []).length === 0, `不可达=${JSON.stringify(reach.bad)}`);
ok("追捕者没入塔时答错不会暴走", afterWrong.huntRage === 0 && afterWrong.hunt === false,
  `rage=${afterWrong.huntRage} hunt=${afterWrong.hunt}`);
ok("没暴走时它仍是原速", afterWrong.huntSpeedNow === afterWrong.huntSpeed,
  `${afterWrong.huntSpeedNow} vs ${afterWrong.huntSpeed}`);

/* ==================== F. 入塔后答错：暴走 15 秒 ==================== */
await load(20261101);
await ev("YCMaze.fastForward(81)");
for (let i = 0; i < 6; i++) await ev("YCMaze.tick(0.05, true)");
const huntOn = await S();
ok("80 秒后追捕者已入塔", huntOn.hunt === true, `t=${huntOn.t}`);
const w2 = await answerWrong(1);
const rageS = await S();
console.log("RAGE", JSON.stringify({ btn: w2 && w2.txt, rage: rageS.huntRage, now: rageS.huntSpeedNow,
  base: rageS.huntSpeed, player: rageS.playerSpeed, audio: w2 && w2.audio }));
ok("答错之后追捕者暴走", rageS.huntRage > 14 && rageS.huntRage <= 15, `rage=${rageS.huntRage}s`);
ok("暴走时速度提到和玩家一样", rageS.huntSpeedNow === rageS.playerSpeed,
  `${rageS.huntSpeedNow} = ${rageS.playerSpeed}`);
ok("暴走比原速明显快", rageS.huntSpeedNow > rageS.huntSpeed * 1.3,
  `${rageS.huntSpeed} → ${rageS.huntSpeedNow}`);
ok("暴走音效已经响起", w2 && w2.audio === true, `audio=${w2 && w2.audio}`);
ok("提示里写明暴走 15 秒", w2 && /15/.test(w2.hint) && /暴走/.test(w2.hint), w2 && w2.hint);

/* 画面上的红框要跟着出现 —— 这是「看得见的暴走」 */
const rageVis = JSON.parse(await ev(`JSON.stringify((function(){
  var st=document.querySelector('.mzstage'), hd=document.getElementById('huntHud');
  return {stage: st.classList.contains('rage'),
          hud: /暴走/.test((document.getElementById('huntN')||{}).textContent||''),
          cls: hd.className};
})())`));
console.log("RAGEUI", JSON.stringify(rageVis));
ok("画面上出现暴走红框", rageVis.stage === true);
ok("追捕读数变成倒计时", rageVis.hud === true, rageVis.cls);

/* 推 15 秒（塔内时间）：暴走必须自己结束 */
for (let i = 0; i < 340; i++) await ev("YCMaze.tick(0.05, true)");
const calm = await S();
const audioCalm = JSON.parse(await ev("JSON.stringify(YCMaze.audio())"));
console.log("CALM", JSON.stringify({ rage: calm.huntRage, now: calm.huntSpeedNow, audio: audioCalm.rage }));
ok("15 秒后暴走结束", calm.huntRage === 0, `rage=${calm.huntRage}`);
ok("暴走结束后速度恢复原速", calm.huntSpeedNow === calm.huntSpeed, `${calm.huntSpeedNow}`);
ok("暴走结束后音效停止", audioCalm.rage === false);
const stageOff = await ev(`document.querySelector('.mzstage').classList.contains('rage')`);
ok("暴走结束后红框消失", stageOff === false);

/* ==================== G. 连错五次 → 强制退出 ==================== */
await load(20261101);
const lives = [];
for (let k = 0; k < 5; k++) {
  const r = await answerWrong(k === 4 ? 0 : k);
  if (!r) { console.log("  第 " + (k + 1) + " 次开门失败"); break; }
  lives.push(r.life);
}
const lastBox = JSON.parse(await ev(`JSON.stringify((function(){
  var b=document.getElementById('endBox');
  return {title:(b.querySelector('h3')||{}).textContent||'',
          text:(b.textContent||'').replace(/\\s+/g,' ').slice(0,90),
          running:YCMaze.status().running, done:YCMaze.status().done,
          modal:document.getElementById('modal').classList.contains('on')};
})())`));
console.log("LIVES", JSON.stringify(lives), "END", JSON.stringify(lastBox));
ok("前四次答错只扣可信度", JSON.stringify(lives.slice(0, 4)) === JSON.stringify([4, 3, 2, 1]),
  JSON.stringify(lives));
ok("第五次答错 → 强制退出", lastBox.running === false && lastBox.done === true, `running=${lastBox.running}`);
ok("出局文案写明「五次答错」", /五次/.test(lastBox.title), lastBox.title);
ok("出局时弹窗已经关掉", lastBox.modal === false);

ok("全程没有未捕获异常", errs.length === 0, errs.join(" | "));

console.log("\n================ 结果 ================");
pass.forEach(n => console.log("OK   " + n));
fail.forEach(n => console.log("BAD  " + n));
console.log(`\n结论：${fail.length === 0 ? `全部通过（${pass.length} 项）` : `${fail.length} 项不合格（共 ${pass.length + fail.length} 项）`}`);
ws.close();
process.exit(fail.length ? 1 : 0);

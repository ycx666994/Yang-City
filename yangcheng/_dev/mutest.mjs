/* 城市/地图/H3实机回归：真实点击 + 可控时间推进，支持file/HTTP。 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const url = process.argv[2], out = process.argv[3];
const PROBE_ONLY = process.env.YC_PROBE_ONLY === "1", PROBE_JS = process.env.YC_PROBE_JS, SHOT_PREFIX = process.env.YC_SHOT_PREFIX || "";
const W = +(process.env.YC_WIDTH || 1440), H = +(process.env.YC_HEIGHT || 900), PORT = +(process.env.YC_PORT || 10052);
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), "yc-check-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0, pending = new Map(), errors = [], checks = [];
const frameContexts = new Map();
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); }
function send(method, params = {}, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout " + method)); }, timeout);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression, timeout = 60000, contextId) {
  const params = { expression, awaitPromise: true, returnByValue: true };
  if (contextId !== undefined) params.contextId = contextId;
  const r = await send("Runtime.evaluate", params, timeout);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
async function frameContext(file, ready) {
  const findFrame = node => {
    for (const child of node.childFrames || []) {
      if (child.frame.url.split(/[?#]/, 1)[0].endsWith("/" + file)) return child.frame;
      const found = findFrame(child); if (found) return found;
    }
  };
  for (let i = 0; i < 35; i++) {
    const frame = findFrame((await send("Page.getFrameTree")).frameTree);
    const contextId = frame && frameContexts.get(frame.id);
    if (contextId !== undefined) {
      try {
        if (await ev(ready, 10000, contextId)) return { frameId: frame.id, contextId, url: frame.url };
      } catch (e) {
        // 导航可能销毁刚查到的 context；业务异常不吞掉。
        if (frameContexts.get(frame.id) === contextId) throw e;
      }
    }
    await delay(350);
  }
  throw new Error("frame runtime not ready " + file + " " + JSON.stringify([...frameContexts]));
}
async function click(selector, contextId, iframeSelector) {
  // 子 frame 中只取本地坐标；父页面只读取 iframe 元素，不访问其 Window/Document。
  const offset = iframeSelector ? await ev(`(()=>{let f=document.querySelector(${JSON.stringify(iframeSelector)});if(!f||f.hidden)return null;f.scrollIntoView({block:'center'});let r=f.getBoundingClientRect();return {x:r.x+f.clientLeft,y:r.y+f.clientTop,w:f.clientWidth,h:f.clientHeight};})()`) : null;
  if (iframeSelector && (!offset || !offset.w || !offset.h)) throw new Error("not clickable " + iframeSelector);
  if (iframeSelector) await ev("window.__ycClicks=[];if(!window.__ycClickHook){window.__ycClickHook=true;document.addEventListener('click',e=>window.__ycClicks.push({tag:e.target.tagName,id:e.target.id,x:e.clientX,y:e.clientY,trusted:e.isTrusted}),{capture:true})};true", 60000, contextId);
  const scrollOptions = iframeSelector ? { block: "center", behavior: "instant" } : { block: "center" };
  const p = await ev(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView(${JSON.stringify(scrollOptions)});let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`, 60000, contextId);
  if (!p || !p.w || !p.h) throw new Error("not clickable " + selector);
  if (offset) {
    if (p.x < 0 || p.y < 0 || p.x >= offset.w || p.y >= offset.h) throw new Error("outside iframe viewport " + selector);
    p.x += offset.x; p.y += offset.y;
  }
  if (offset && (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H)) throw new Error("outside viewport " + selector);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  if (iframeSelector) { console.log('FRAME_CLICK', selector, p, offset, await ev(`(()=>{let e=document.elementFromPoint(${p.x},${p.y});return {tag:e?.tagName,id:e?.id}})()`)); await delay(300); }
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  if (iframeSelector) console.log('FRAME_EVENT', await ev("({clicks:window.__ycClicks,viewport:[innerWidth,innerHeight],active:document.activeElement?.id})", 60000, contextId));
}
async function shot(name) {
  // SwiftShader/CDP偶尔不提交canvas合成层。快照来自真实GPU画布，测试时临时换为同尺寸图片；无画布页（平面图）直接整页截图。
  const hasCanvas = await ev("!!(document.getElementById('museumCv')||document.getElementById('mCv')||document.getElementById('cityCv'))");
  if (hasCanvas) {
    await ev("(()=>{let c=document.getElementById('museumCv')||document.getElementById('mCv')||document.getElementById('cityCv'),r=c.getBoundingClientRect(),img=document.createElement('img');img.id='ycTestSnapshot';img.src=c.toDataURL('image/png');Object.assign(img.style,{position:'fixed',left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',pointerEvents:'none'});c.after(img);return img.decode().then(()=>true)})()");
    await delay(300);
  }
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, 120000);
  if (!r.data) throw new Error("empty screenshot");
  const filename = SHOT_PREFIX + name;
  writeFileSync(join(out, filename), Buffer.from(r.data, "base64")); console.log("SHOT", filename);
  await ev("document.getElementById('ycTestSnapshot')?.remove();true");
}
try {
  let target;
  for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === "page"); if (target) break; } catch {} await delay(150); }
  if (!target) throw new Error("no target");
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === "Runtime.executionContextCreated") {
      const context = m.params.context;
      if (context.auxData?.isDefault === true && context.auxData.frameId) frameContexts.set(context.auxData.frameId, context.id);
    }
    if (m.method === "Runtime.executionContextDestroyed") {
      for (const [frameId, contextId] of frameContexts) if (contextId === m.params.executionContextId) frameContexts.delete(frameId);
    }
    if (m.method === "Runtime.executionContextsCleared") frameContexts.clear();
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled") {
      const text = m.params.args.map(a => a.value ?? a.description ?? "").join(" ");
      if (m.params.type === "error") errors.push(text);
      if (PROBE_ONLY || PROBE_JS) console.log("BROWSER_CONSOLE", m.params.type, text);
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  // 无头软件GPU不跑持续Stage循环，显式推进；避免重绘饿死CDP和资产解析。
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "(()=>{const gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,opts){if(/webgl/.test(type))opts=Object.assign({},opts,{preserveDrawingBuffer:true});return gc.call(this,type,opts)};let value;Object.defineProperty(window,'YC3D',{configurable:true,get(){return value},set(v){value=v;if(v&&v.Stage)v.Stage.prototype.start=function(){this.frame();return this}}})})()" });
  await send("Page.navigate", { url });
  let api = null;
  for (let i = 0; i < 45; i++) { api = await ev("!!(window.YCMuseum||window.YCMU||window.YCCity||(window.YC_DISTRICTS&&!window.YCCity&&document.querySelector('.d-blob')))"); if (api) break; await delay(400); }
  check("运行时已加载", api); if (!api) throw new Error("runtime not ready");
  const flatMap = await ev("!!window.YC_DISTRICTS && !window.YCCity && !!document.querySelector('.d-blob')");
  if (!flatMap) await ev("(window.YCMuseum||window.YCMU||window.YCCity).stage.stop();true");
  const museum = await ev("!!window.YCMU");
  const hallMuseum = await ev("!!window.YCMuseum");
  if (PROBE_ONLY || PROBE_JS) {
    try {
      const result = await ev(PROBE_JS || "window.YCMU ? {room:YCMU.room(),tourIndex:YCMU.tourIndex()} : YCCity.inspect()");
      console.log("PROBE_JSON " + JSON.stringify(result ?? null));
      if (!flatMap && process.env.YC_PROBE_NO_FRAME !== "1") await ev("(window.YCMuseum||window.YCMU||window.YCCity).stage.frame();true");
    } finally { await shot("probe.png"); }
  }
  if (!PROBE_ONLY && flatMap) {
    check("平面总图17区", await ev("document.querySelectorAll('.d-blob').length") === 17);
    check("六馆馆标直达", await ev("document.querySelectorAll('.d-museum').length===6 && [...document.querySelectorAll('.d-museum')].every(a=>/h[1-6]-museum\\.html$/.test(a.getAttribute('href')))"));
    check("打开随机高亮一个区域", await ev("document.getElementById('cmPanel').hidden===false && document.getElementById('cmName').textContent.length>1"));
    check("市中心推荐徽标", await ev("document.querySelector('.d-badge text').textContent==='推荐参观'"));
    check("区面板进入三维街区链接", await ev("/^district\\.html\\?zone=D\\d{2}$/.test(document.getElementById('cmEnter').getAttribute('href'))"));
    await send("Page.navigate", { url: url + "?zone=D07" }); await delay(1400);
    const pinned = await ev("document.getElementById('cmName') ? document.getElementById('cmName').textContent : 'MISSING'");
    check("URL固定高亮区", pinned === "大学城创新园", { pinned });
    await ev("document.getElementById('cmRandom').click()");
    check("随机漫游切换区域", await ev("document.getElementById('cmName').textContent.length>1"));
    await shot("flatmap.png");
  } else if (!PROBE_ONLY && !museum && !hallMuseum) {
    const live = await ev("YCCity.inspect()"); check("默认真实北京时间", live.clock.mode === "live" && Math.abs((()=>{const toSec=s=>s.split(':').reduce((a,v)=>a*60+Number(v),0);let d=Math.abs(toSec(live.clock.display)-toSec(live.clock.actualBeijing));return Math.min(d,86400-d)})())<=5, live.clock);
    check("城市规模扩展与住宅街区", !!live.urban && live.urban.bounds &&
      (live.urban.bounds.maxX-live.urban.bounds.minX)*(live.urban.bounds.maxZ-live.urban.bounds.minZ)>=1600*1040*10 && live.urban.buildings>=300, live.urban);
    const overview = await ev("({phi:YCCity.rig.tPhi,dist:YCCity.rig.tDist})");
    const zoneId = new URL(url).searchParams.get("zone");
    if (!zoneId) check("总览保留天际线与城市立面", overview.phi <= 0.80 && overview.dist >= 3300 && overview.dist <= 4400, overview);
    check("城市高铁与跨河道路桥", !!live.urban && live.urban.trainAvailable && live.urban.railStations>=3 && live.urban.roadBridges>=3, live.urban);
    check("多片区AI企业与公共设施", !!live.nodes && live.nodes.giants>=18 && live.nodes.facilities>=8, live.nodes);
    for (const [hour, name] of [[14, "day"], [22, "night"]]) {
      const s = await ev(`YCCity.setTime(${hour})`); check(name + " 原生PBR立面", s.facades.standard, s.facades);
      check(name + " 全量光照接线", s.groundDay !== null && s.waterDay !== null && s.post.exposureUniform !== null, { ground: s.groundDay, water: s.waterDay, post: s.post });
      await ev("YCCity.rig.update(1);YCCity.city.update(0,0);YCCity.stage.frame()");
      await shot((live.map.enabled ? "yangcheng-map-" : "yangcheng-city-") + name + ".png");
    }
    const map = await ev("YCCity.isMap");
    if (map) {
      await click('[data-filter="giants"]'); check("AI企业完整分类", await ev("document.querySelectorAll('#nodeList .node').length") === live.nodes.giants);
      await click('[data-filter="infra"]'); check("公共设施完整分类", await ev("document.querySelectorAll('#nodeList .node').length") === live.nodes.facilities);
      await click('#nodeList .node'); check("设施定位", await ev("YCCity.inspect().map.locatorVisible"));
    }
    if (zoneId) {
      check("区域模式定位到指定区", await ev("(()=>{let z=window.YC_DISTRICTS.find(d=>d.id===" + JSON.stringify(zoneId) + ");let r=YCCity.rig;return Math.abs(r.targetCenter.x-z.cx)<1 && Math.abs(r.targetCenter.z-z.cz)<1})()"));
      check("区域HUD展示区名与馆链接", await ev("!document.getElementById('districtHud').hidden && document.getElementById('dhName').textContent.length>1 && document.querySelectorAll('#dhMuseums a').length===window.YC_DISTRICTS.find(d=>d.id===" + JSON.stringify(zoneId) + ").museums.length"));
      check("点击馆建筑直接进馆", await ev("YCCity.select.toString().includes('location.href') && YC3D_CITY.HALLS.every(h=>/^h[1-6]-museum\\.html$/.test(h.href))"));
      check("区标与区划数量", await ev("YCCity.city.districts.children.length") === 17);
      await shot("district-" + zoneId + ".png");
    }
    await ev("YCCity.resetTime()"); check("演练可回实时", await ev("YCCity.inspect().clock.mode") === "live");
  } else if (!PROBE_ONLY && hallMuseum) {
    const hallData = await ev("YCMuseum.hall");
    const assets = await ev("Promise.all((()=>{let a=[];YCMuseum.engine.scene.traverse(o=>{if(o.ready)a.push(o.ready)});return a})()).then(()=>{let a=[];YCMuseum.engine.scene.traverse(o=>{if(o.userData.assetState)a.push({asset:o.userData.asset,state:o.userData.assetState})});return a})",120000);
    check("单一3D大厅与三位导游资产", await ev("YCMuseum.engine.cfg.rooms.length===1 && YCMuseum.hall.guides.length===3") && assets.length>=3 && assets.every(a=>a.state==="ready"), {hall:hallData.id,assets});
    await click('.guideCard[data-guide="he"]'); check("大厅选择导游", await ev("YCMuseum.guide()==='he'"));
    await ev("YCMuseum.engine.pitch=.12;YCMuseum.engine._tick(.016,0)"); await shot("lobby-"+hallData.id+".png");
    const exhibit = await ev("YCMuseum.hall.exhibits.find(x=>x.id==="+JSON.stringify(process.env.YC_EXHIBIT_ID||"")+") || YCMuseum.hall.exhibits[0]");
    await click('[data-exhibit="'+exhibit.id+'"]');
    const frameName = exhibit.src.split('/').pop();
    if(await ev("!!YCMuseum.guide()")) await ev("YCMuseum.engine._tickTour(1.3);YCMuseum.engine._tickTour(.01);YCMuseum.stage.frame();true");
    const expectedRoom = exhibit.room || "main";
    const roomReady = "window.YCMuseumEmbed?.active===true && (window.YCMuseumEmbed.room==='main' || [...document.querySelectorAll('.layer.on,.room.on,.zone.on')].some(s=>s.dataset.l===window.YCMuseumEmbed.room))";
    const page = await frameContext(frameName,roomReady);
    const contentReady = await ev("!document.getElementById('museumContent').hidden && document.getElementById('museumFrame').title.startsWith("+JSON.stringify(exhibit.title)+") && document.getElementById('museumFrame').src.includes('museumRoom=')");
    check("进入单间原版学习网站", contentReady && page.url.includes("museumRoom="), {exhibit,frame:page});
    const roomState = await ev("(()=>{let p=new URLSearchParams(location.search),r=p.get('museumRoom')||'main',active=[...document.querySelectorAll('.layer.on,.room.on,.zone.on')];let nav=['.d6arch','.h4rail','.tabbar','.rail','.path','.progressline'].flatMap(s=>[...document.querySelectorAll(s)]).some(e=>getComputedStyle(e).display!=='none');return {r,active:active.map(e=>e.dataset.l),nav}})()",60000,page.contextId);
    check("只显示当前学习厅且隐藏换厅导航", roomState.r==='main' || (roomState.active.length===1 && roomState.active[0]===roomState.r && !roomState.nav), roomState);
    await click('#museumBack'); check("退出展厅回大厅并清除页面", await ev("document.getElementById('museumContent').hidden && YCMuseum.room()===null && document.getElementById('museumFrame').src==='about:blank'"));
    check("大厅仍可选择下一间", await ev("document.querySelectorAll('[data-exhibit]').length===YCMuseum.hall.exhibits.length && YCMuseum.engine.cfg.rooms.length===1"));
  } else if (!PROBE_ONLY) {
    const assets = await ev("Promise.all((()=>{let list=[];YCMU.engine.scene.traverse(o=>{if(o.ready)list.push(o.ready)});return list})()).then(()=>{let list=[];YCMU.engine.scene.traverse(o=>{if(o.userData.assetState)list.push({asset:o.userData.asset,state:o.userData.assetState,error:o.userData.assetError})});return list})", 120000);
    check("三导游与馆长模型完成加载", assets.length >= 4 && assets.every(a => a.state === "ready"), assets);
    await ev("YCMU.engine._tick(0.016,0);YCMU.stage.frame()");
    check("三位导游可选择", await ev("document.querySelectorAll('.gcard').length") === 3);
    check("大厅加五展厅", await ev("YCMU.cfg.rooms.length") === 6);
    await click('#muFreeInitial'); check("不选导游自由参观", await ev("!YCMU.engine.tour && !YCMU.engine.guide"));
    await ev("YCMU.engine.pitch=0.12;YCMU.engine._tick(0.016,0);YCMU.stage.frame()"); await shot("h3-daylight-lobby.png");
    await click('#muChangeGuide'); await click('[data-g="he"]'); await click('#muStart');
    await ev("YCMU.engine.guide.fig.ready.then(()=>true)"); check("选导游进入独立展厅", await ev("YCMU.room()") === "r1");
    const before = await ev("YCMU.tourIndex()"); await click('#muNext'); check("下一站一次递增", await ev("YCMU.tourIndex()") === before + 1);
    await click('#muPause'); check("讲解暂停", await ev("YCMU.engine.tour.paused"));
    await ev("YCMU.engine.tour.paused=false;YCMU.engine._tickTour(10);YCMU.engine._tick(0.016,0);YCMU.engine.updateGuide(0,true);YCMU.stage.frame()"); await shot("h3-proxy-room.png");
    const texts = await ev("['shen','he','tao'].map(id=>{YCMU.pick(id);YCMU.start('r1');return YCMU.engine.tour.stops[0].text})"); check("三导游真实差异讲解", new Set(texts).size === 3);
    for (const id of ["r2", "r3", "r4", "r5"]) {
      await ev(`YCMU.free();YCMU.start('${id}');YCMU.engine.pitch=0.1;YCMU.engine._tick(0.016,0);YCMU.stage.frame()`);
      check(id + "独立房间可进入", await ev("YCMU.room()") === id);
      if (id === "r4") {
        await click('#muTools button[data-tool="metrics"]');
        const metrics = await frameContext("h3-metrics.html", "typeof window.YCMetrics?.makeWorld==='function' && !!document.getElementById('btnRunDevice') && !!document.getElementById('btnAutopsy') && !!document.getElementById('stP')?.textContent.trim() && document.getElementById('stP').textContent!=='—'");
        check("r4 原metrics iframe接通", await ev("(()=>{let f=document.querySelector('#muInstrumentFrames iframe[data-key=\"metrics\"]');return YCMU.room()==='r4'&&document.getElementById('muInstrument').open&&!!f&&!f.hidden&&f.getAttribute('src').split('?')[0]==='h3-metrics.html'})()"), metrics);
        await click('.lay[data-l="device"]', metrics.contextId, '#muInstrumentFrames iframe[data-key="metrics"]');
        check("r4 原metrics装置层可交互", await ev("document.querySelector('.layer[data-l=\"device\"]').classList.contains('on') && document.getElementById('stP').textContent!=='—'", 60000, metrics.contextId));
        await click('#muInstrumentClose'); check("关闭metrics回r4展厅", await ev("YCMU.room()==='r4'&&!document.getElementById('muInstrument').open"));
      }
    }
    await shot("h3-challenge-room.png");
    const mazeSelector = '#muInstrumentFrames iframe[data-key="maze"]';
    const mazeReady = "typeof window.YCMaze?.status==='function'";
    await click('#muTools button[data-tool="maze"]');
    const maze = await frameContext("h3-maze.html", mazeReady);
    check("挑战展厅原迷宫接通", await ev("(()=>{let f=document.querySelector('#muInstrumentFrames iframe[data-key=\"maze\"]');return !!f&&!f.hidden&&f.getAttribute('src').split('?')[0]==='h3-maze.html'&&document.getElementById('muInstrument').open})()") && await ev("!!window.YCMaze", 60000, maze.contextId), maze);
    // 原迷宫加载即运行；真实重开按钮调用 reset(0)，不调用体检钩子代替点击。
    await ev("(()=>{let b=document.getElementById('btnRestart');b.__ycTrustedClick=false;b.addEventListener('click',e=>{b.__ycTrustedClick=e.isTrusted},{once:true});return true})()", 60000, maze.contextId);
    await click('#btnRestart', maze.contextId, mazeSelector);
    const trustedStart = await ev("(()=>{let b=document.getElementById('btnRestart');let clicked=b.__ycTrustedClick;delete b.__ycTrustedClick;return clicked})()", 60000, maze.contextId);
    const started = await ev("YCMaze.status()", 60000, maze.contextId);
    check("迷宫真实点击启动", trustedStart && started.running && !started.done, started);
    let mazeRun = started;
    for (let i = 0; i < 35; i++) {
      mazeRun = await ev("YCMaze.status()", 60000, maze.contextId);
      if (mazeRun.t > started.t) break;
      await delay(200);
    }
    check("迷宫运行计时自然推进", mazeRun.running && !mazeRun.done && mazeRun.t > started.t, { started: started.t, current: mazeRun.t });
    await click('#muInstrumentClose'); check("关闭回当前展厅", await ev("YCMU.room()==='r5'&&!document.getElementById('muInstrument').open"));
    await delay(250);
    const hiddenTime = await ev("YCMaze.status().t", 60000, maze.contextId);
    await delay(1250);
    check("关闭挑战后计时暂停", await ev("YCMaze.status().t", 60000, maze.contextId) === hiddenTime, {hiddenTime});
    await click('#muTools button[data-tool="maze"]');
    const reopened = await frameContext("h3-maze.html", mazeReady);
    const resumed = await ev("YCMaze.status()", 60000, reopened.contextId);
    check("重开保留同一迷宫iframe与context", reopened.frameId === maze.frameId && reopened.contextId === maze.contextId, { before: maze, after: reopened });
    const preserved = ["seed", "px", "py", "ang", "life", "frags", "doorsOpen", "doorsTotal", "inModal", "running", "done"].every(key => JSON.stringify(resumed[key]) === JSON.stringify(mazeRun[key]));
    check("重开保留迷宫运行状态", preserved && resumed.running && !resumed.done && resumed.t >= mazeRun.t, { before: mazeRun, after: resumed });
    await click('#muInstrumentClose');
    await click('#muBack'); check("回到大厅", await ev("YCMU.room()") === "lobby");
  }
  if (!PROBE_ONLY) check("视口无横向溢出", await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
  if (!flatMap) {
    const aa = await ev("(()=>{let s=(window.YCMuseum||window.YCMU||window.YCCity).stage;return {webgl2:s.renderer.capabilities.isWebGL2,samples:s.rtScene.samples,max:s.renderer.capabilities.maxSamples}})()");
    check("离屏HDR抗锯齿已开启", !aa.webgl2 || aa.samples === Math.min(4, aa.max), aa);
  }
  check("无JS或GLSL错误", !errors.length, errors);
} catch (e) { check("测试执行完整", false, e.stack); }
finally {
  console.log("REPORT_JSON " + JSON.stringify({ url, W, H, checks, errors }));
  ws?.close();
  try { execFileSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" }); } catch {}
  process.exit(checks.some(c => !c.ok) ? 1 : 0);
}

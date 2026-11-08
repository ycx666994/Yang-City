/* 区域街区截图：node _dev/dshot.mjs <url> <out.png> ['{"dist":640,"theta":-0.26}'] */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = +(process.env.YC_PORT || 9811), W = +(process.env.YC_WIDTH || 1600), H = +(process.env.YC_HEIGHT || 1000);
const url = process.argv[2], out = process.argv[3], camJson = process.argv[4];
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), "dshot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--use-gl=angle",
  "--use-angle=swiftshader", `--window-size=${W},${H}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, serial = 0, pending = new Map(), errors = [];
function send(method, params = {}, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout " + method)); }, timeout);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression, timeout = 90000) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeout);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
try {
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === "page");
      if (target) break;
    } catch {}
    await delay(150);
  }
  if (!target) throw new Error("no target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{window.__err=null;window.addEventListener('error',function(e){window.__err=(e.message||'')+' @'+((e.filename||'').split('/').pop())+':'+e.lineno;});
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, opts){
      if (/webgl/.test(type)) opts = Object.assign({}, opts, { preserveDrawingBuffer: true });
      return gc.call(this, type, opts);
    };
    let v;
    Object.defineProperty(window, 'YC3D', { configurable: true, get(){ return v; }, set(x){
      v = x;
      if (x && x.Stage) x.Stage.prototype.start = function(){ window.__stage = this; this.frame(); return this; };
    }});
  })()` });
  await send("Page.navigate", { url });
  let ok = false;
  for (let i = 0; i < 600; i++) {
    ok = await ev("!!(window.__yc && window.__stage)");
    if (ok) break;
    await delay(400);
  }
  if (!ok) { try { console.error("DIAG", JSON.stringify(await ev("({y:!!window.YC3D,c:!!window.YC3D_CITY,d:!!window.YC3D_DISTRICT,p:!!window.ycDistrictPlan,boot:((document.getElementById('cityBoot')||{}).textContent||'').slice(0,80),err:window.__err,rs:document.readyState})"))); } catch (e2) {} }
  if (!ok) throw new Error("engine not ready: " + JSON.stringify(await ev("({yc:!!window.__yc, stage:!!window.__stage, boot:document.getElementById('cityBoot')?.textContent?.slice(0,120)})")));
  await delay(1200);
  if (camJson) {
    const c = JSON.parse(camJson);
    const js = `(()=>{var r=window.__yc.rig;`
      + `if(!r||!r.center){return 'NO RIG';}`
      + (c.x !== undefined ? `r.center.x=${c.x};if(r.targetCenter)r.targetCenter.x=${c.x};if(r.target)r.target.x=${c.x};` : "")
      + (c.y !== undefined ? `r.center.y=${c.y};if(r.targetCenter)r.targetCenter.y=${c.y};if(r.target)r.target.y=${c.y};` : "")
      + (c.z !== undefined ? `r.center.z=${c.z};if(r.targetCenter)r.targetCenter.z=${c.z};if(r.target)r.target.z=${c.z};` : "")
      + (c.dist !== undefined ? `r.dist=${c.dist};r.tDist=${c.dist};` : "")
      + (c.phi !== undefined ? `r.phi=${c.phi};r.tPhi=${c.phi};` : "")
      + (c.theta !== undefined ? `r.theta=${c.theta};r.tTheta=${c.theta};` : "")
      + `for(var i=0;i<3;i++){r.update(1);if(window.__stage&&window.__stage.frame)window.__stage.frame();}return {d:r.dist,p:r.phi,t:r.theta};})()`;
    console.log("CAM", JSON.stringify(await ev(js)));
    await delay(900);
  }
  console.log("INFO", JSON.stringify(await ev("({hero:(window.__yc.city.heroInfo||[]).map(h=>h.type+':'+h.want+'/'+h.top), buildings:window.__yc.city.buildingCount, tris:window.__yc.renderer.info.render.triangles})")));
  if (process.env.YC_EVAL) console.log("EVAL", JSON.stringify(await ev(process.env.YC_EVAL)));
  if (process.argv[5]) {
    const [px, py] = process.argv[5].split(",").map(Number);
    const ndc = `(${(px / W * 2 - 1).toFixed(4)}),(${(1 - py / H * 2).toFixed(4)})`;
    console.log("PROBE", JSON.stringify(await ev(`(()=>{var T=window.THREE,cam=window.__yc.camera,sc=window.__yc.scene;
      var rc=new T.Raycaster();rc.setFromCamera(new T.Vector2(${ndc}),cam);
      var hits=rc.intersectObjects(sc.children,true);if(!hits.length)return null;
      var p=hits[0].point,r=hits[0].object;while(r.parent&&r.parent!==sc)r=r.parent;
      return {hit:[Math.round(p.x),Math.round(p.y),Math.round(p.z)],root:r.position.toArray().map(Math.round),n:hits.length};})()`)));
  }
  await ev(`(()=>{var c=document.getElementById('cityCv'),r=c.getBoundingClientRect(),img=document.createElement('img');img.id='snap';img.src=c.toDataURL('image/png');Object.assign(img.style,{position:'fixed',left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',pointerEvents:'none'});document.body.appendChild(img);return img.decode().then(()=>true)})()`);
  await delay(400);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, 120000);
  writeFileSync(out, Buffer.from(r.data, "base64"));
  console.log("SHOT", out, "errors:", errors.slice(0, 6));
} catch (e) {
  console.error("FAIL", e.message, JSON.stringify(errors.slice(0, 4)));
  process.exitCode = 1;
} finally {
  try { ws.close(); } catch {}
  child.kill();
  process.exit(process.exitCode || 0);
}

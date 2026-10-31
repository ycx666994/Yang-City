import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9887, W = 1500, H = 940;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
const prof = mkdtempSync(join(tmpdir(), "ych4z-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new","--no-first-run","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i=0;i<60;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(t=>t.type==="page"); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(300); }
const ws = new WebSocket(url); let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true});return r.result?.result?.value;};
const clipShot=async (name,clip)=>{const r=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip});if(r.result?.data)writeFileSync(join(OUT,name),Buffer.from(r.result.data,"base64"));else console.log("fail",name);};
await new Promise(r=>{ws.onopen=r;});
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:2,mobile:false});
await send("Page.navigate",{url:BASE+"/h4-contam.html"});
await sleep(2800);
await ev(`document.querySelector('.h4rail .door[data-l="shelf"]').click();'ok'`);
await sleep(800);
const r1 = JSON.parse(await ev(`JSON.stringify(document.getElementById('shelfBody').getBoundingClientRect())`));
await clipShot("h4-zoom-shelf.png", {x:r1.left, y:r1.top, width:r1.width, height:210, scale:2});
const r2 = JSON.parse(await ev(`JSON.stringify(document.querySelector('.kbig').getBoundingClientRect())`));
await clipShot("h4-zoom-kbig.png", {x:r2.left-8, y:r2.top-8, width:r2.width+16, height:r2.height+16, scale:3});

await ev(`document.querySelector('.h4rail .door[data-l="check"]').click();'ok'`);
await sleep(2600);
await ev(`(function(){var b=document.querySelector('.sweepbox');b.scrollIntoView({block:'center'});return 'ok'})()`);
await sleep(500);
const r3 = JSON.parse(await ev(`JSON.stringify(document.querySelector('.sweepbox').getBoundingClientRect())`));
await clipShot("h4-zoom-sweep.png", {x:r3.left-6, y:r3.top-6, width:r3.width+12, height:r3.height+12, scale:2});
ws.close(); child.kill(); process.exit(0);

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9895;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
const prof = mkdtempSync(join(tmpdir(), "ych4s-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new","--no-first-run","--enable-unsafe-swiftshader","--window-size=1500,940","about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i=0;i<60;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(t=>t.type==="page"); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(300); }
const ws = new WebSocket(url); let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true});return r.result?.result?.value;};
const shot=async n=>{let r=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});if(!r.result?.data)r=await send("Page.captureScreenshot",{format:"png"});if(r.result?.data)writeFileSync(join(OUT,n),Buffer.from(r.result.data,"base64"));};
await new Promise(r=>{ws.onopen=r;});
await send("Runtime.enable"); await send("Page.enable");

// 桌面：移交
await send("Emulation.setDeviceMetricsOverride",{width:1500,height:940,deviceScaleFactor:1,mobile:false});
await send("Page.navigate",{url:BASE+"/h4-contam.html"});
await sleep(2600);
await ev(`document.querySelector('.h4rail .door[data-l="hand"]').click();'ok'`);
await sleep(700);
await shot("h4-8-hand.png");

// 桌面：空变体（演示拒判）
await ev(`document.querySelector('.h4rail .door[data-l="shelf"]').click();'ok'`);
await sleep(500);
await ev(`(function(){var e=document.getElementById('kRewrite');e.value=10;e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`);
await sleep(900);
await shot("h4-9-vacuous.png");

// 移动：层架
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send("Page.navigate",{url:BASE+"/h4-contam.html"});
await sleep(2600);
await ev(`document.querySelector('.h4rail .door[data-l="shelf"]').click();'ok'`);
await sleep(900);
await shot("h4-10-mobile-shelf.png");
console.log("ovf:", await ev("document.documentElement.scrollWidth - document.documentElement.clientWidth"));
ws.close(); child.kill(); process.exit(0);

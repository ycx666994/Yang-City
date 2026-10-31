import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT=9967,W=1360,H=900;
const BASE="file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT="D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT,{recursive:true});
const EDGE=["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe","C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p=>{try{readFileSync(p);return true}catch{return false}});
const prof=mkdtempSync(join(tmpdir(),"faces-"));
const child=spawn(EDGE,[`--remote-debugging-port=${PORT}`,`--user-data-dir=${prof}`,"--headless=new","--no-first-run","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let url;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==="page");if(p){url=p.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
const ws=new WebSocket(url);let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}))});
const ev=async x=>(await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
const shot=async(n,clip)=>{const r=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,...(clip?{clip}:{})});if(r.result?.data)writeFileSync(join(OUT,n),Buffer.from(r.result.data,"base64"));};
await new Promise(r=>{ws.onopen=r});
await send("Runtime.enable");await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:false});
const halls=[["h3-metrics.html","H3"],["h6-budget.html","H6"],["h5-collapse.html","H5"],["h2-forensic.html","H2"]];
for(const [page,h] of halls){
  await send("Page.navigate",{url:BASE+"/"+page}); await sleep(2600);
  await ev(`(function(){var o=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
    o.met=o.met||{};o.met['${h}']=1;o.camp=o.camp||{};o.bond=o.bond||{};
    localStorage.setItem('yc.cast.v1',JSON.stringify(o));return 1;})()`);
  await send("Page.navigate",{url:BASE+"/"+page}); await sleep(2800);
  await ev(`(function(){var c=document.querySelector('.castcamp');if(c)c.classList.remove('open');return 1;})()`);
  await sleep(300);
  const r=await ev(`(function(){var b=document.querySelector('.castdock').getBoundingClientRect();
    return JSON.stringify({x:Math.round(b.x-12),y:Math.round(b.y-12),width:Math.round(b.width+24),height:Math.round(b.height+24),scale:1});})()`);
  await shot(`cast-hall-${h}.png`, JSON.parse(r));
}
ws.close();child.kill();

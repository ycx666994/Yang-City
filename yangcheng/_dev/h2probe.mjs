import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9871, BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });
const prof = mkdtempSync(join(tmpdir(), "ychp-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new","--no-first-run","--enable-unsafe-swiftshader","--window-size=390,844","about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i=0;i<50;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(t=>t.type==="page"); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(300); }
const ws = new WebSocket(url); let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true});return r.result?.result?.value;};
await new Promise(r=>{ws.onopen=r;});
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send("Page.navigate",{url:BASE+"/h2-forensic.html"});
await sleep(2200);
console.log(await ev(`JSON.stringify((function(){
  var hall=document.querySelector('.hall');
  var main=document.querySelector('.hall .main');
  var out={vh:innerHeight, docH:document.documentElement.scrollHeight,
    hallH:hall.getBoundingClientRect().height, hallCS:getComputedStyle(hall).height,
    mainH:main.getBoundingClientRect().height, mainSH:main.scrollHeight,
    kids:[].map.call(hall.children,function(c){return c.className+':'+Math.round(c.getBoundingClientRect().height)}),
    layers:[].map.call(document.querySelectorAll('.layer'),function(l){return l.getAttribute('data-l')+':'+getComputedStyle(l).display+':'+Math.round(l.getBoundingClientRect().height)})
  };
  return out;
})())`));
ws.close(); child.kill(); process.exit(0);

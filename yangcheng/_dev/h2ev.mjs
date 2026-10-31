// H2 → 证据厅 联调：存一份档案，看证据厅能不能正确渲染与展开
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9877, W = 1440, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
             .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ychev-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new","--no-first-run","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i=0;i<50;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(t=>t.type==="page"); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(300); }
const ws = new WebSocket(url); let id=0; const pend=new Map(); const errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}
  if(m.method==="Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails.exception?.description||"").slice(0,150));};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true});if(r.result?.exceptionDetails)return "ERR:"+r.result.exceptionDetails.exception?.description?.slice(0,150);return r.result?.result?.value;};
const shot=async n=>{let r=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});if(!r.result?.data)r=await send("Page.captureScreenshot",{format:"png"});if(r.result?.data)writeFileSync(join(OUT,n),Buffer.from(r.result.data,"base64"));};
await new Promise(r=>{ws.onopen=r;});
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:false});

await send("Page.navigate",{url:BASE+"/h2-forensic.html"});
await sleep(2000);
await ev("document.getElementById('btnRun').click();'ok'");
await sleep(800);
await ev("document.getElementById('vbSave').click();'ok'");
await sleep(500);
const saved = await ev("document.getElementById('saveResult').textContent.slice(0,90)");
console.log("存入:", saved);

await send("Page.navigate",{url:BASE+"/evidence.html"});
await sleep(2200);
const evd = await ev(`JSON.stringify({
  cards: document.querySelectorAll('.evcard,.rec,.evitem').length,
  txt: document.body.innerText.replace(/\\s+/g,' ').slice(0,300),
  h2: document.body.innerText.indexOf('推理法医馆') >= 0,
  chat: document.body.innerText.indexOf('ĉ') >= 0 || document.body.innerText.indexOf('0.93') >= 0
})`);
console.log("证据厅:", evd);
await shot("h2-evidence.png");
console.log("errs:", errs.slice(0,3));
ws.close(); child.kill(); process.exit(0);

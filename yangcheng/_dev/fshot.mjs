import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9891;
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
const prof = mkdtempSync(join(tmpdir(), "ycf-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new","--no-first-run","--enable-unsafe-swiftshader","--window-size=760,180","about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i=0;i<60;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/list`); const p=(await r.json()).find(t=>t.type==="page"); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(300); }
const ws = new WebSocket(url); let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
await new Promise(r=>{ws.onopen=r;});
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:760,height:180,deviceScaleFactor:3,mobile:false});
await send("Page.navigate",{url:"file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng/_dev/fonttest.html"});
await sleep(1200);
const r=await send("Page.captureScreenshot",{format:"png"});
writeFileSync("D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots/fonttest.png",Buffer.from(r.result.data,"base64"));
ws.close(); child.kill(); process.exit(0);

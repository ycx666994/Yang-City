import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT=9968,W=1440,H=900;
const BASE="file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const EDGE=["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe","C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p=>{try{readFileSync(p);return true}catch{return false}});
const prof=mkdtempSync(join(tmpdir(),"allp-"));
const child=spawn(EDGE,[`--remote-debugging-port=${PORT}`,`--user-data-dir=${prof}`,"--headless=new","--no-first-run","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let url;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==="page");if(p){url=p.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
const ws=new WebSocket(url);let id=0;const pend=new Map();let errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}
 if(m.method==="Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,120));
 if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error") errs.push(m.params.args.map(a=>a.value||a.description||"").join(" ").slice(0,120));};
const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}))});
const ev=async x=>(await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
await new Promise(r=>{ws.onopen=r});
await send("Runtime.enable");await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:false});
const pages=["index.html","map.html","evidence.html","h2-forensic.html","h2-case.html","h3-metrics.html","h3-maze.html","h4-contam.html","h4-purge.html","h5-collapse.html","h5-forecast.html","h6-budget.html","h6-tower.html"];
let bad=0;
for(const p of pages){
  errs=[];
  await send("Page.navigate",{url:BASE+"/"+p});
  await sleep(p.startsWith("h5")||p.startsWith("h6")?3000:2600);
  const info=JSON.parse(await ev(`JSON.stringify({
    ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cast: !!document.querySelector('.castdock'),
    castName: (document.querySelector('.castdock .cst-nm')||{}).textContent||'',
    duty: !!(document.querySelector('#duty')||document.querySelector('#dutyStrip'))
  })`));
  const real=errs.filter(e=>!/favicon|ERR_FILE_NOT_FOUND/i.test(e));
  const ok = real.length===0 && info.ovf===0;
  if(!ok) bad++;
  console.log(`${ok?"OK ":"BAD"} ${p.padEnd(20)} ovf=${info.ovf} 驻馆人=${info.cast?info.castName:"—"} 值守=${info.duty} ${real.length?("ERR:"+real.slice(0,2).join("|")):""}`);
}
console.log(bad===0?"\n全部页面无错误、无横向溢出":"\n"+bad+" 页有问题");
ws.close();child.kill();process.exit(bad?1:0);

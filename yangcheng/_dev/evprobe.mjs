import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT=9813,W=1440,H=900;
const BASE="file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const EDGE=["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe","C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p=>{try{readFileSync(p);return true}catch{return false}});
const prof=mkdtempSync(join(tmpdir(),"ev-"));
spawn(EDGE,[`--remote-debugging-port=${PORT}`,`--user-data-dir=${prof}`,"--headless=new","--no-first-run","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function gt(){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(t=>t.type==="page");if(pg)return pg.webSocketDebuggerUrl}catch{}await sleep(300)}throw new Error("no target")}
const ws=new WebSocket(await gt());let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(me,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:p}))});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});return r.result?.exceptionDetails?("ERR:"+r.result.exceptionDetails.exception?.description):r.result?.result?.value};
await new Promise(r=>{ws.onopen=r});
await send("Runtime.enable");await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:false});
// 先注入一条档案
await send("Page.navigate",{url:BASE+"/h3-metrics.html"});await sleep(1800);
await ev(`document.querySelector('[data-l="instrument"]').click()`);await sleep(200);
await ev(`document.getElementById('btnAutopsy').click()`);await sleep(1200);
await send("Page.navigate",{url:BASE+"/evidence.html"});await sleep(1500);
console.log(await ev(`(function(){
  var d=document.getElementById('evdetail');
  var secs=[].map.call(d.querySelectorAll('.sec'),s=>Math.round(s.getBoundingClientRect().height));
  var tray=document.querySelector('#trayTag');
  return JSON.stringify({
    evdetailH: d?Math.round(d.getBoundingClientRect().height):null,
    evdetailScroll: d?d.scrollHeight:null,
    secCount: d?d.querySelectorAll('.sec').length:0,
    secHeights: secs,
    trayTop: tray?Math.round(tray.getBoundingClientRect().top):null,
    detailBottom: d?Math.round(d.getBoundingClientRect().bottom):null,
    mainScrollH: document.querySelector('.evmain').scrollHeight,
    mainClientH: document.querySelector('.evmain').clientHeight
  });
})()`));
process.exit(0);

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT=9964,W=1360,H=940;
const BASE="file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT="D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT,{recursive:true});
const EDGE=["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe","C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p=>{try{readFileSync(p);return true}catch{return false}});
const prof=mkdtempSync(join(tmpdir(),"shot-"));
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
await send("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:2,mobile:false});

/* A · H2 坞（关掉选边，设成已选边 + 交底） */
await send("Page.navigate",{url:BASE+"/h2-forensic.html"});await sleep(2600);
await ev(`(function(){var o={bond:{shen:58,qi:31},camp:{H2:'shen'},met:{H2:1},oral:{},said:{},flag:{}};
  localStorage.setItem('yc.cast.v1',JSON.stringify(o));
  localStorage.setItem('yc.cast.cur.H2','shen');return 1;})()`);
await send("Page.navigate",{url:BASE+"/h2-forensic.html"});await sleep(2800);
await ev(`document.querySelector('.castcamp').classList.remove('open')`);
await sleep(400);
const r1=await ev(`(function(){var b=document.querySelector('.castdock').getBoundingClientRect();
  return JSON.stringify({x:b.x-14,y:b.y-14,width:b.width+28,height:b.height+28});})()`);
await shot("cast-dock.png",{...JSON.parse(r1),scale:2});

/* B · H4 玩法页坞（求提示按钮） */
await send("Page.navigate",{url:BASE+"/h4-purge.html"});await sleep(3000);
await ev(`(function(){var o=JSON.parse(localStorage.getItem('yc.cast.v1')||'{}');
  o.bond=o.bond||{};o.bond.cen=44;o.camp=o.camp||{};o.camp.H4='cen';
  localStorage.setItem('yc.cast.v1',JSON.stringify(o));return 1;})()`);
await send("Page.navigate",{url:BASE+"/h4-purge.html"});await sleep(3000);
const r2=await ev(`(function(){var b=document.querySelector('.castdock').getBoundingClientRect();
  return JSON.stringify({x:b.x-14,y:b.y-14,width:b.width+28,height:b.height+28});})()`);
await shot("cast-dock-game.png",{...JSON.parse(r2),scale:2});

/* C · 全部十个人立绘拼一张 */
await send("Page.navigate",{url:BASE+"/h2-forensic.html"});await sleep(2600);
await ev(`(function(){
  var ids=['shen','qi','bai','tao','cen','luo','wen','sang','lu','man'];
  var box=document.createElement('div');
  box.style.cssText='position:fixed;inset:0;z-index:99999;background:#090d13;display:flex;flex-wrap:wrap;gap:14px;padding:26px;align-content:flex-start';
  var all={};
  ['H2','H3','H4','H5','H6'].forEach(function(h){
    var s=YCCast.specOf(h);
    if(s) s.cast.forEach(function(c){all[c.id]=c;});
  });
  box.innerHTML=ids.map(function(id){
    var c=all[id];
    if(!c) return '<div style="color:#f66;font:12px monospace">missing '+id+'</div>';
    var f=YCCast.faceHTML(c,'calm','on');
    return '<div style="width:150px;text-align:center">'+
      f.replace('class="cst-face on"','class="cst-face on" style="width:104px;height:104px;border-radius:24px;filter:none;margin:0 auto"')+
      '<div style="font:700 13px system-ui;color:#e9eff7;margin-top:8px">'+c.name+'</div>'+
      '<div style="font:9px monospace;color:#63718a;margin-top:2px">'+c.role+' · '+c.camp+'</div></div>';
  }).join('');
  document.body.appendChild(box);
  return 'ok';})()`);
await sleep(600);
await shot("cast-faces.png");
ws.close();child.kill();

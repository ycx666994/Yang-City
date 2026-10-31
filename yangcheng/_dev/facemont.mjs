import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9987, W = 1280, H = 900;
const BASE = "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
mkdirSync(OUT, { recursive: true });
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe", "C://Program Files//Microsoft//Edge//Application//msedge.exe"].find(p => { try { readFileSync(p); return true } catch { return false } });
const prof = mkdtempSync(join(tmpdir(), "shot-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url; for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break } } catch { } await sleep(300) }
const ws = new WebSocket(url); let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await new Promise(r => { ws.onopen = r });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: BASE + "/h2-forensic.html" }); await sleep(2600);
await ev(`(function(){
  var order=[['shen','沈砚','#a887ff'],['qi','祁野','#46d3e8'],['bai','白珩','#f0b64a'],['tao','陶叔','#f0b64a'],
             ['cen','岑默','#35cfa8'],['luo','罗姐','#35cfa8'],['wen','温野','#e06a72'],['sang','阿桑','#e06a72'],
             ['lu','陆准','#5aa8c8'],['man','小满','#5aa8c8']];
  var box=document.createElement('div');
  box.id='mont';
  box.style.cssText='position:fixed;inset:0;z-index:99999;background:#090d13;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:14px';
  box.innerHTML=order.map(function(o){
    var cfg=window.YCFACES[o[0]]; cfg.accent=o[2];
    return '<div style="text-align:center">'+
      '<svg viewBox="0 0 200 240" style="width:100%;height:auto;display:block;border-radius:10px;background:#0d131c">'+
      window.YCPort.raw(cfg,'calm',2)+'</svg>'+
      '<div style="color:#cfd8e3;font:600 11px system-ui;margin-top:4px">'+o[1]+'</div></div>';
  }).join('');
  document.body.appendChild(box); return 1;})()`);
await sleep(700);
const r = await ev(`(function(){var b=document.getElementById('mont').getBoundingClientRect();
  return JSON.stringify({x:b.x,y:b.y,width:b.width,height:b.height});})()`);
const rr = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...JSON.parse(r), scale: 1 } });
if (rr.result?.data) writeFileSync(join(OUT, "faces-ten.png"), Buffer.from(rr.result.data, "base64"));
console.log("ok");
ws.close(); child.kill();

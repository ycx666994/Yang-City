/* H2 卷 05 展品长廊 + 证书 体检 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 9933, W = 1500, H = 940;
const BASE = process.env.YC_BASE || "file:///D:/wobdy%E6%B5%B7%E5%A4%96/2026-10-18-18-15-27/trust-lab/yangcheng";
const OUT = "D:/wobdy海外/2026-10-18-18-15-27/_devshots/yangcheng-shots";
const EDGE = ["C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe",
              "C://Program Files//Microsoft//Edge//Application//msedge.exe"]
  .find(p => { try { readFileSync(p); return true; } catch { return false; } });
mkdirSync(OUT, { recursive: true });
const prof = mkdtempSync(join(tmpdir(), "ycdp-"));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find(t => t.type === "page"); if (p) { url = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(300);
}
const ws = new WebSocket(url);
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errs.push((m.params.exceptionDetails.exception || {}).description || "ex");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push(m.params.args.map(a => a.value || a.description || "").join(" ").slice(0, 140));
};
const send = (me, pa = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (n) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (r.result?.data) writeFileSync(join(OUT, n), Buffer.from(r.result.data, "base64"));
};
let bad = 0;
function gate(name, ok, detail) { if (!ok) bad++; console.log((ok ? "OK  " : "BAD ") + name + "  " + detail); }

await new Promise(r => { ws.onopen = r; });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/h2-forensic.html" });
await sleep(2800);

/* 1. 结构 */
const s1 = JSON.parse(await ev(`JSON.stringify({
  tabs: document.querySelectorAll('.tabbar .tab').length,
  deepTab: !!document.querySelector('.tabbar .tab[data-l="deep"]'),
  hasD: typeof YCDeep === 'object'
})`));
gate("结构", s1.tabs === 5 && s1.deepTab && s1.hasD, `卷=${s1.tabs} 长廊卷=${s1.deepTab} 内核=${s1.hasD}`);

/* 2. 切到长廊 */
await ev(`document.querySelector('.tabbar .tab[data-l="deep"]').click()`);
await sleep(600);
const s2 = JSON.parse(await ev(`JSON.stringify({
  on: document.querySelector('.layer[data-l="deep"]').classList.contains('on'),
  cards: document.querySelectorAll('#dpGallery .dpg-c').length,
  certs: document.querySelectorAll('#dpCerts .dpc-card').length,
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`));
gate("长廊渲染", s2.on && s2.cards === 8 && s2.certs === 2 && s2.ovf === 0,
  `展品=${s2.cards} 证书卡=${s2.certs} ovf=${s2.ovf}`);
await shot("h2deep-1.png");

/* 3. 逐件点开 + 现场验证 + 答对 */
const verifyOut = [];
for (let i = 0; i < 8; i++) {
  await ev(`document.querySelectorAll('#dpGallery .dpg-c')[${i}].click()`);
  await sleep(180);
  const hasV = await ev(`!!document.getElementById('dpgVb') || !!document.querySelector('.dpg-vb')`);
  if (hasV) {
    await ev(`document.querySelector('.dpg-vb').click()`);
    await sleep(320);
    verifyOut.push(await ev(`(document.getElementById('dpgVr')||{}).textContent || ''`));
  } else verifyOut.push("(无验证)");
  /* 选中正确选项 */
  const ans = await ev(`(function(){
    var opts=document.querySelectorAll('#dpGallery .dpg-opt');
    return opts.length;
  })()`);
  if (ans === 3) {
    /* 逐个试：点一个，看是否变 ok；不对就点下一个 */
    for (let k = 0; k < 3; k++) {
      await ev(`document.querySelectorAll('#dpGallery .dpg-opt')[${k}].click()`);
      await sleep(120);
      const ok = await ev(`document.querySelectorAll('#dpGallery .dpg-opt.ok').length > 0`);
      if (ok) break;
    }
  }
}
await sleep(300);
const s3 = JSON.parse(await ev(`JSON.stringify({
  done: document.querySelectorAll('#dpGallery .dpg-c.done').length,
  title: (document.querySelector('#dpGallery .dpg-t em')||{}).textContent,
  verifyFilled: [].map.call(document.querySelectorAll('#dpGallery .dpg-vr'), e=>e.textContent.length).filter(n=>n>12).length
})`));
gate("八件展品全通", s3.done === 8 && (s3.title || "").indexOf("8 / 8") >= 0,
  `已识破=${s3.done} 进度=${s3.title}`);
console.log("    现场验证输出：");
verifyOut.forEach((v, i) => console.log("      [" + (i + 1) + "] " + v.replace(/\s+/g, " ").slice(0, 90)));
await shot("h2deep-2.png");

/* 4. 参观证书可领 */
const s4 = JSON.parse(await ev(`(function(){
  var b = document.querySelector('#dpCerts [data-get="visitor"]');
  if (!b) return JSON.stringify({ready:false, txt:'no-btn'});
  var dis = b.disabled;
  if (!dis) b.click();
  return JSON.stringify({ready:!dis, txt:b.textContent});
})()`));
await sleep(500);
const s4b = JSON.parse(await ev(`(function(){
  var c = YCDeep.getCert('H2','visitor');
  return JSON.stringify({has:!!c, no:c?c.no:null, ck:c?c.checksum:null});
})()`));
gate("参观证书", s4.ready && s4b.has && /^YC-H2-V-/.test(s4b.no) && s4b.ck.length === 8,
  `${s4b.no} 校验=${s4b.ck}`);

/* 5. 精英挑战入口 */
const s5 = JSON.parse(await ev(`JSON.stringify({
  go: !!document.querySelector('#dpCerts [data-go]'),
  link: !!document.querySelector('.layer[data-l="deep"] a[href="h2-case.html"]')
})`));
gate("精英入口", s5.go && s5.link, `证书卡按钮=${s5.go} 长廊链接=${s5.link}`);

/* 6. 窄屏 */
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE + "/h2-forensic.html" });
await sleep(2600);
await ev(`document.querySelector('.tabbar .tab[data-l="deep"]').click()`);
await sleep(600);
const s6 = JSON.parse(await ev(`JSON.stringify({
  ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cards: document.querySelectorAll('#dpGallery .dpg-c').length,
  cols: getComputedStyle(document.querySelector('#dpGallery .dpg-grid')).gridTemplateColumns.split(' ').length
})`));
gate("窄屏", s6.ovf === 0 && s6.cards === 8 && s6.cols <= 2, `ovf=${s6.ovf} 卡=${s6.cards} 列=${s6.cols}`);
await shot("h2deep-3-mobile.png");

console.log("\nJS 异常: " + (errs.length ? errs.slice(0, 3).join(" | ") : "无"));
console.log("结论：" + (bad === 0 ? "全部通过" : bad + " 项未通过"));
ws.close(); child.kill();
process.exit(bad === 0 ? 0 : 1);

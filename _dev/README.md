# `_dev` · 老馆验证探针

这里的 `.mjs` 全是**无头浏览器验收脚本**。没有 playwright / puppeteer 依赖——
用 Edge 的 `--headless=new --remote-debugging-port` 起一个调试端口，
再用 Node 22 内置的 `WebSocket` 手写一个极简 CDP 客户端：导航 → 注入交互 → 断言 → 截图。

## 怎么跑

```bash
node _dev/_probe17.mjs      # 单个探针
```

每个脚本都自带浏览器启动与退出，跑完即走。不通过时退出码非零。

## 命名约定

| 前缀 | 含义 |
|---|---|
| `_probe*.mjs` | 老馆展品的逐件验收（编号越大越晚） |
| `_labcheck` `_gitcheck` `_zipcheck` `_mscheck` | 大厅 / 仓库 / 打包 / 站点的整体体检 |
| `_shot*` `_dirshot*` `_snapbig` | 截图脚本 |
| `_bg` `_hero` `_map` `_cover` `_director` | 背景系统、首屏、地图、封面、导游的专项检查 |
| `_ifr*` `_embed*` `_bridge*` | iframe 收编与跨文档桥接的调试 |
| `_tau*` `_hash` `_crng` `_net` `_pix` `_ctx` | 单点问题的复现脚本（温度采样、哈希、随机数、网络、像素、画布上下文） |
| `_contrast*` `_dark` `_pale` `_vendorlight*` | 配色与对比度 |

## 换机器跑之前先改 `BASE`

这些脚本里的 `BASE` 是当初开发时的绝对路径（`file:///D:/...`）。换一台机器跑之前，
把脚本顶部那一行 `const BASE = ...` 改成你自己的仓库根目录，或者直接改成相对路径：

```js
const BASE = new URL("..", import.meta.url).href;   // 指向仓库根
```

## 一条重要的教训

**没有 playwright 也能截图，但必须显式给 clip。**
`Page.captureScreenshot{captureBeyondViewport:true, clip:{...}}` —— 只设 `--screenshot`
或滚动后再截，无 GPU 下滚动区域会全黑。验证布局用
`document.documentElement.scrollWidth === clientWidth` 逐断点查横向溢出，比肉眼快得多。

更多踩坑记录见仓库根 `README-trustlab.md` 的「无头 QA 的重要教训」一节。

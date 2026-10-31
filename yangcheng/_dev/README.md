# `yangcheng/_dev` · 杨城验证探针

和根目录 `_dev` 同一套做法：Edge headless + 手写 CDP 客户端 + Node 内置 WebSocket，
零 playwright 依赖。每个脚本跑完打印 `OK / BAD`，不通过退出码非零。

## 六个常驻体检（改动后必跑）

```bash
node allpages.mjs     # 13 页：无脚本错误、无横向溢出、驻馆人在线
node entrycheck.mjs   # 入口链路：裸域名 → 杨城 / 老馆固定地址 / 回馆链接不指错
node castcheck.mjs    # 十位驻馆人、选边体系、值守轮值、窄屏
node h2casecheck.mjs  # 案卷 0117 四幕完整通关 → 100 分 + 证书
node h3mazecheck.mjs  # 迷宫：世界生成、光线投射、知识门、通关发证
node mazecaught.mjs   # 追捕：入塔时机、答题冻结、被抓无证书
```

## 线上体检

```bash
YC_BASE="https://<你的域名>" node livecheck.mjs
```

`livecheck.mjs` 会把 28 项一次性跑完（城市页、地图、六馆仪器、五个玩法页、证据厅、
全城联合复核、入口链路、驻馆人、窄屏）。端口默认 9823，可用 `YC_PORT` 覆盖——
上一次被 kill 的 Edge 可能还占着端口，换一个即可。

## 命名约定

| 模式 | 含义 |
|---|---|
| `*check.mjs` | 常驻体检，改动后必跑 |
| `live*` `*live*` | 针对线上域名的体检 |
| `*shot.mjs` `zoom*.mjs` `face*.mjs` | 截图 / 放大抽查 |
| `_h4*` `_h5*` `_h6*` `g5tune` `g6tune` `tune` `scenarios` | 数值扫描与参数调优（一次性，留着备查） |
| `dbg` `hook` `st` `domprobe` `probe` `cprobe*` | 单点问题复现 |

## 三个反复踩到的坑

1. **隐藏元素量尺寸恒为 0。** 多分区页面里 `getBoundingClientRect()` 对未激活的分区返回 0。
   探针必须**先 click 切到该区、等重绘，再量**。
2. **`querySelector('[data-l="x"]')` 会先命中 `<section>` 而不是按钮。**
   要写 `button[data-l="x"]`。
3. **断言不要写死条数。** 「载入后共 5 份档案」「底部 5 枚踏石」这类断言，
   数据模型一变就误报。用增量（`after === before + n`）或恒等式（`claims === n`）。

#!/usr/bin/env bash
# 杨城 · 构建脚本（拼接分片 → 单文件，零依赖）
# 约定与老馆 build.sh 一致：cat 拼接，无 npm / 无打包器。
#
# 驻馆人系统的接入顺序（每个馆页都一样）：
#   head → yc-cast.css → </head> → body
#        → yc-evidence → 内核 → yc-deep → yc-port（立绘）→ yc-cast（引擎）→ 04-app → 06-deep → 07-cast（本馆人物）
#   yc-cast.js 必须在 07-cast.js 之前（后者一载入就 register）；
#   07-cast.js 必须在 04-app.js 之后（它的 probe 要读玩法页的只读钩子）。
set -e
# 统一转交build.py，防止旧拼接链覆盖新地图与人物加载器。
SCRIPT_DIR="$(dirname "$0")"
MANAGED_PY="/c/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe"
if [ -x "$MANAGED_PY" ]; then
  exec "$MANAGED_PY" "$SCRIPT_DIR/build.py"
elif [ -n "$PYTHON" ]; then
  exec "$PYTHON" "$SCRIPT_DIR/build.py"
else
  exec python3 "$SCRIPT_DIR/build.py"
fi
cd "$SCRIPT_DIR"

CAST_CSS='<link rel="stylesheet" href="shared/yc-cast.css">'

# ---------- 推理法医馆 H2 · 成对干预保真度审判 ----------
{
  cat src/h2/01-head.html
  echo "$CAST_CSS"
  cat src/h2/02-style.html
  echo "</head>"
  cat src/h2/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-forensic.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h2/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h2/06-deep.js
  echo "</script>"
  echo "<script>"
  cat src/h2/07-cast.js
  echo "</script>"
  cat src/h2/05-tail.html
} > h2-forensic.html

# ---------- 数据污染博物馆 H4 · 三档对照与回吐溯源 ----------
{
  cat src/h4/01-head.html
  echo "$CAST_CSS"
  cat src/h4/02-style.html
  echo "</head>"
  cat src/h4/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-contamination.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h4/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h4/06-deep.js
  echo "</script>"
  echo "<script>"
  cat src/h4/07-cast.js
  echo "</script>"
  cat src/h4/05-tail.html
} > h4-contam.html

# ---------- 递归坍塌博物馆 H5 · 谱系温室 ----------
{
  cat src/h5/01-head.html
  echo "$CAST_CSS"
  cat src/h5/02-style.html
  echo "</head>"
  cat src/h5/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-greenhouse.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h5/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h5/06-deep.js
  echo "</script>"
  echo "<script>"
  cat src/h5/07-cast.js
  echo "</script>"
  cat src/h5/05-tail.html
} > h5-collapse.html

# ---------- 潜能与预算博物馆 H6 · 预算天穹 ----------
{
  cat src/h6/01-head.html
  echo "$CAST_CSS"
  cat src/h6/02-style.html
  echo "</head>"
  cat src/h6/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-dome.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h6/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h6/06-deep.js
  echo "</script>"
  echo "<script>"
  cat src/h6/07-cast.js
  echo "</script>"
  cat src/h6/05-tail.html
} > h6-budget.html

# ---------- 指标失效博物馆 H3 · 代理指标尸检台 ----------
{
  cat src/h3/01-head.html
  echo "$CAST_CSS"
  cat src/h3/02-style.html
  echo "</head>"
  cat src/h3/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-chart.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-metrics.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h3/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h3/07-cast.js
  echo "</script>"
  cat src/h3/05-tail.html
} > h3-metrics.html

# ---------- H2 精英挑战 · 案卷 0117「十一日」（破案游戏） ----------
{
  cat src/h2case/01-head.html
  echo "$CAST_CSS"
  cat src/h2case/02-style.html
  echo "</head>"
  cat src/h2case/03-body.html
  echo "<script>"
  cat instruments/yc-forensic.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  # 剧本数据必须在 04-app.js 之前：后者一载入就读 window.YCCASE
  echo "<script>"
  cat src/h2case/03b-script.js
  echo "</script>"
  echo "<script>"
  cat src/h2case/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h2/07-cast.js
  echo "</script>"
  cat src/h2case/05-tail.html
} > h2-case.html

# ---------- H3 精英挑战 · 指标塔 3D 迷宫 ----------
{
  cat src/h3maze/01-head.html
  echo "$CAST_CSS"
  cat src/h3maze/02-style.html
  echo "</head>"
  cat src/h3maze/03-body.html
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  # 题库必须在 04-app.js 之前：后者一载入就要读 window.YCQUIZ 抽题
  echo "<script>"
  cat src/h3maze/03b-quiz.js
  echo "</script>"
  echo "<script>"
  cat src/h3maze/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h3/07-cast.js
  echo "</script>"
  cat src/h3maze/05-tail.html
} > h3-maze.html

# ---------- H4 精英挑战 · 净化车间 · 十二道工序 ----------
{
  cat src/h4game/01-head.html
  echo "$CAST_CSS"
  cat src/h4game/02-style.html
  echo "</head>"
  cat src/h4game/03-body.html
  echo "<script>"
  cat instruments/yc-contamination.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h4game/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h4/07-cast.js
  echo "</script>"
  cat src/h4game/05-tail.html
} > h4-purge.html

# ---------- H5 精英挑战 · 坍塌预报台 · 三个温室 ----------
{
  cat src/h5game/01-head.html
  echo "$CAST_CSS"
  cat src/h5game/02-style.html
  echo "</head>"
  cat src/h5game/03-body.html
  echo "<script>"
  cat instruments/yc-greenhouse.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h5game/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h5/07-cast.js
  echo "</script>"
  cat src/h5game/05-tail.html
} > h5-forecast.html

# ---------- H6 精英挑战 · 预算塔 · 十层 ----------
{
  cat src/h6tower/01-head.html
  echo "$CAST_CSS"
  cat src/h6tower/02-style.html
  echo "</head>"
  cat src/h6tower/03-body.html
  echo "<script>"
  cat instruments/yc-dome.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-deep.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/h6tower/04-app.js
  echo "</script>"
  echo "<script>"
  cat src/h6/07-cast.js
  echo "</script>"
  cat src/h6tower/05-tail.html
} > h6-tower.html

# ---------- 公共证据厅 ----------
{
  cat src/evidence/01-head.html
  echo "$CAST_CSS"
  cat src/evidence/02-style.html
  echo "</head>"
  cat src/evidence/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat instruments/yc-audit.js
  echo "</script>"
  # 五馆内核不内联：212K 的首屏解析太慢。改成点「载入基准档案」时按需 <script> 注入。
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat src/evidence/04-app.js
  echo "</script>"
  cat src/evidence/05-tail.html
} > evidence.html

# ---------- 城市入口（WebGL 未来城市：主塔 / 轨道环 / 六馆 / 十家算力塔） ----------
# three.js 走外链：file:// 下同源脚本可加载，发布后还能被浏览器缓存
{
  cat src/city/01-head.html
  echo "$CAST_CSS"
  cat src/city/02-style.html
  echo "</head>"
  cat src/city/03-body.html
  echo '<script src="shared/yc3d/three.min.js"></script>'
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-core.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-build.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-city.js
  echo "</script>"
  echo "<script>"
  cat src/city/04-app.js
  echo "</script>"
  cat src/city/05-tail.html
} > index.html

# ---------- 杨城地图（俯瞰城市 + 今日值守） ----------
{
  cat src/map/01-head.html
  echo "$CAST_CSS"
  cat src/map/02-style.html
  echo "</head>"
  cat src/map/03-body.html
  echo "<script>"
  cat shared/yc-evidence.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-port.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-faces.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cast.js
  echo "</script>"
  echo "<script>"
  cat shared/yc-cityview.js
  echo "</script>"
  echo "<script>"
  cat src/map/04-app.js
  echo "</script>"
  cat src/map/05-tail.html
} > map.html


# ---------- 博物馆 3D · H3 指标失效（大厅 + 导游 + 展厅） ----------
# 与城市同一套 WebGL 引擎：three.js 外链，其余内联
{
  cat src/museum/01-head.html
  cat src/museum/02-style.html
  echo "</head>"
  cat src/museum/03-body.html
  echo '<script src="shared/yc3d/three.min.js"></script>'
  echo "<script>"
  cat shared/yc3d/yc3d-core.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-build.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-parts.js
  echo "</script>"
  echo "<script>"
  cat shared/yc3d/yc3d-museum.js
  echo "</script>"
  echo "<script>"
  cat src/museum/h3.js
  echo "</script>"
  echo "<script>"
  cat src/museum/04-app.js
  echo "</script>"
  cat src/museum/05-tail.html
} > h3-museum.html

echo "built: index.html  map.html  evidence.html  h2-forensic.html  h2-case.html  h3-metrics.html  h3-maze.html  h4-contam.html  h4-purge.html  h5-collapse.html  h5-forecast.html  h6-budget.html  h6-tower.html"
ls -lh index.html map.html h3-museum.html evidence.html h2-forensic.html h2-case.html h3-metrics.html h3-maze.html h4-contam.html h4-purge.html h5-collapse.html h5-forecast.html h6-budget.html h6-tower.html | awk '{print "  "$9"  "$5}'

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
杨城 · 构建脚本（Python 版）

统一源码拼接入口，额外适配MIT加载器模块及生成本地file协议资产字节包。
部署产物是静态页面；源码修改后需要执行本构建器。

用法：python build.py
"""
import io
import os
import sys
import re
import json
import base64

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

CAST_CSS = '<link rel="stylesheet" href="shared/yc-cast.css">'
THREE = '<script src="shared/yc3d/three.min.js"></script>'


def rd(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def js(path):
    return "<script>\n" + rd(path) + "\n</script>\n"


def page(out, head, style, body, scripts, tail, cast_css=True):
    parts = [rd(head)]
    if cast_css:
        parts.append(CAST_CSS + "\n")
    parts.append(rd(style))
    parts.append("</head>\n")
    parts.append(rd(body))
    for s in scripts:
        if s.startswith("<script"):
            parts.append(s + "\n")
        else:
            parts.append(js(s))
    parts.append(rd(tail))
    data = "".join(parts)
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)
    return len(data.encode("utf-8"))


def bundle_character_vendor():
    """把MIT原版ES模块绑定至本地THREE；不引入另一份引擎。"""
    root = "shared/yc3d/vendor/three-r150/examples/jsm/"
    modules = [
        ("utils/BufferGeometryUtils.js", "BufferGeometryUtils"),
        ("loaders/GLTFLoader.js", "GLTF"),
        ("utils/SkeletonUtils.js", "SkeletonUtils"),
        ("libs/meshopt_decoder.module.js", "Meshopt")
    ]
    chunks = ["/* three.js r150 / MIT. Adapted module linkage only. See vendor/three-r150/LICENSE. */\n(function(global){\n\"use strict\";\n"]
    for source, name in modules:
        text = rd(root + source)
        text = re.sub(r"import\s*\{([\s\S]*?)\}\s*from\s*['\"]three['\"];", lambda m: "const {" + m.group(1) + "} = global.THREE;", text)
        text = re.sub(r"import\s*\{\s*toTrianglesDrawMode\s*\}\s*from\s*['\"].*?['\"];", "const {toTrianglesDrawMode} = BufferGeometryUtils;", text)
        names = re.findall(r"export\s+function\s+(\w+)", text)
        for exported in re.findall(r"export\s*\{([\s\S]*?)\};", text):
            names.extend(n.strip() for n in exported.split(",") if n.strip())
        text = re.sub(r"export\s*\{[\s\S]*?\};", "", text)
        text = re.sub(r"export\s+function", "function", text)
        chunks.append("const " + name + " = (function(){\n" + text + "\nreturn {" + ",".join(dict.fromkeys(names)) + "};\n})();\n")
    chunks.append("global.YC3D_VENDOR={GLTFLoader:GLTF.GLTFLoader,cloneSkeleton:SkeletonUtils.clone,MeshoptDecoder:Meshopt.MeshoptDecoder};\n})(window);\n")
    target = "shared/yc3d/yc3d-gltf.js"
    data = "".join(chunks)
    if not os.path.exists(target) or rd(target) != data:
        with io.open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(data)
    # HTTP按需读GLB；以下字节包只供file协议使用，不进HTML内联。
    selected = ["jay.glb", "sintel.glb", "sophia-ccby-20260507.glb", "animations/idle-subtle.glb", "animations/idle-talking.glb", "animations/walk.glb"]
    for name in selected:
        path = "shared/yc3d/assets/" + name
        with open(path, "rb") as f:
            raw = f.read()
        data = "window.YC3D_ASSET_BYTES=window.YC3D_ASSET_BYTES||{};window.YC3D_ASSET_BYTES[" + json.dumps(name) + "]=" + json.dumps(base64.b64encode(raw).decode("ascii")) + ";\n"
        output = path + ".data.js"
        if not os.path.exists(output) or rd(output) != data:
            with io.open(output, "w", encoding="utf-8", newline="\n") as f:
                f.write(data)


def build_targets(targets):
    """Build only requested page families; use --targets to avoid regenerating the legacy maze."""
    built = []
    embed = '<script src="shared/yc-museum-embed.js"></script>'
    if "content" in targets:
        built.append(("h2-forensic.html", page(
            "h2-forensic.html", "src/h2/01-head.html", "src/h2/02-style.html", "src/h2/03-body.html",
            ["shared/yc-evidence.js", "instruments/yc-forensic.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h2/04-app.js", "src/h2/06-deep.js", "src/h2/07-cast.js", embed], "src/h2/05-tail.html")))
        built.append(("h4-contam.html", page(
            "h4-contam.html", "src/h4/01-head.html", "src/h4/02-style.html", "src/h4/03-body.html",
            ["shared/yc-evidence.js", "instruments/yc-contamination.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h4/04-app.js", "src/h4/06-deep.js", "src/h4/07-cast.js", embed], "src/h4/05-tail.html")))
        built.append(("h5-collapse.html", page(
            "h5-collapse.html", "src/h5/01-head.html", "src/h5/02-style.html", "src/h5/03-body.html",
            ["shared/yc-evidence.js", "instruments/yc-greenhouse.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h5/04-app.js", "src/h5/06-deep.js", "src/h5/07-cast.js", embed], "src/h5/05-tail.html")))
        built.append(("h6-budget.html", page(
            "h6-budget.html", "src/h6/01-head.html", "src/h6/02-style.html", "src/h6/03-body.html",
            ["shared/yc-evidence.js", "instruments/yc-dome.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h6/04-app.js", "src/h6/06-deep.js", "src/h6/07-cast.js", embed], "src/h6/05-tail.html")))
        built.append(("h3-metrics.html", page(
            "h3-metrics.html", "src/h3/01-head.html", "src/h3/02-style.html", "src/h3/03-body.html",
            ["shared/yc-evidence.js", "shared/yc-chart.js", "instruments/yc-metrics.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h3/04-app.js", "src/h3/07-cast.js", embed], "src/h3/05-tail.html")))
        built.append(("h2-case.html", page(
            "h2-case.html", "src/h2case/01-head.html", "src/h2case/02-style.html", "src/h2case/03-body.html",
            ["instruments/yc-forensic.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h2case/03b-script.js", "src/h2case/04-app.js", "src/h2/07-cast.js", embed], "src/h2case/05-tail.html")))
        built.append(("h4-purge.html", page(
            "h4-purge.html", "src/h4game/01-head.html", "src/h4game/02-style.html", "src/h4game/03-body.html",
            ["instruments/yc-contamination.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h4game/04-app.js", "src/h4/07-cast.js", embed], "src/h4game/05-tail.html")))
        built.append(("h5-forecast.html", page(
            "h5-forecast.html", "src/h5game/01-head.html", "src/h5game/02-style.html", "src/h5game/03-body.html",
            ["instruments/yc-greenhouse.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h5game/04-app.js", "src/h5/07-cast.js", embed], "src/h5game/05-tail.html")))
        built.append(("h6-tower.html", page(
            "h6-tower.html", "src/h6tower/01-head.html", "src/h6tower/02-style.html", "src/h6tower/03-body.html",
            ["instruments/yc-dome.js", "shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h6tower/04-app.js", "src/h6/07-cast.js", embed], "src/h6tower/05-tail.html")))
    if "maze-embed" in targets:
        # Rebuild only the legacy maze shell so the museum can embed its unchanged game.
        built.append(("h3-maze.html", page(
            "h3-maze.html", "src/h3maze/01-head.html", "src/h3maze/02-style.html", "src/h3maze/03-body.html",
            ["shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js", "src/h3maze/03b-quiz.js", "src/h3maze/04-app.js", "src/h3/07-cast.js", embed], "src/h3maze/05-tail.html")))
    if "city" in targets:
        # 首页是平面 17 区总图（无 WebGL）；yc-districts.js 先内联再进 app。
        built.append(("index.html", page("index.html", "src/citymap/01-head.html", "src/citymap/02-style.html", "src/citymap/03-body.html",
            ["shared/yc-districts.js", "src/citymap/04-app.js"], "src/citymap/05-tail.html", cast_css=False)))
    if "map" in targets:
        built.append(("map.html", page("map.html", "src/city/01-head.html", "src/city/02-style.html", "src/city/03-body.html",
            [THREE, "shared/yc-evidence.js", "shared/yc3d/yc3d-core.js", "shared/yc3d/yc3d-build.js", "shared/yc-districts.js", "shared/yc3d/yc3d-city.js", "src/city/04-app.js"], "src/city/05-tail.html")))
    if "district" in targets:
        # 区域三维街区视角：与 map.html 同壳，?zone=Dxx 激活区域模式。
        built.append(("district.html", page("district.html", "src/city/01-head.html", "src/city/02-style.html", "src/city/03-body.html",
            [THREE, "shared/yc-evidence.js", "shared/yc3d/yc3d-core.js", "shared/yc3d/yc3d-build.js", "shared/yc-districts.js", "shared/yc3d/yc3d-city.js", "src/city/04-app.js"], "src/city/05-tail.html")))
    if "museums" in targets:
        bundle_character_vendor()
        for hall in ("H1", "H2", "H3", "H4", "H5", "H6"):
            out = hall.lower() + "-museum.html"
            scripts = [THREE, '<script src="shared/yc3d/yc3d-gltf.js"></script>', "shared/yc3d/yc3d-core.js", "shared/yc3d/yc3d-build.js", "shared/yc3d/yc3d-parts.js", "shared/yc3d/yc3d-museum.js", "src/museum/halls.js", '<script>window.__YC_MUSEUM_HALL="' + hall + '";</script>', "src/museum/hall-geometry.js", "src/museum/hall-app.js"]
            built.append((out, page(out, "src/museum/01-head.html", "src/museum/lobby-style.html", "src/museum/lobby-body.html", scripts, "src/museum/05-tail.html", cast_css=False)))
    print("built targeted pages:")
    for name, size in built:
        print("  %-22s %6.0fK" % (name, size / 1024.0))


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] != "--targets" or len(sys.argv) < 3:
            raise SystemExit("usage: python build.py --targets city map district content museums maze-embed")
        allowed = {"city", "map", "district", "content", "museums", "maze-embed"}
        targets = set(sys.argv[2:])
        unknown = targets - allowed
        if unknown: raise SystemExit("unknown targets: " + ", ".join(sorted(unknown)))
        build_targets(targets)
        return
    bundle_character_vendor()
    built = []

    # ---------- 各馆主页面 ----------
    built.append(("h2-forensic.html", page(
        "h2-forensic.html", "src/h2/01-head.html", "src/h2/02-style.html", "src/h2/03-body.html",
        ["shared/yc-evidence.js", "instruments/yc-forensic.js", "shared/yc-deep.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h2/04-app.js", "src/h2/06-deep.js", "src/h2/07-cast.js"],
        "src/h2/05-tail.html")))

    built.append(("h4-contam.html", page(
        "h4-contam.html", "src/h4/01-head.html", "src/h4/02-style.html", "src/h4/03-body.html",
        ["shared/yc-evidence.js", "instruments/yc-contamination.js", "shared/yc-deep.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h4/04-app.js", "src/h4/06-deep.js", "src/h4/07-cast.js"],
        "src/h4/05-tail.html")))

    built.append(("h5-collapse.html", page(
        "h5-collapse.html", "src/h5/01-head.html", "src/h5/02-style.html", "src/h5/03-body.html",
        ["shared/yc-evidence.js", "instruments/yc-greenhouse.js", "shared/yc-deep.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h5/04-app.js", "src/h5/06-deep.js", "src/h5/07-cast.js"],
        "src/h5/05-tail.html")))

    built.append(("h6-budget.html", page(
        "h6-budget.html", "src/h6/01-head.html", "src/h6/02-style.html", "src/h6/03-body.html",
        ["shared/yc-evidence.js", "instruments/yc-dome.js", "shared/yc-deep.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h6/04-app.js", "src/h6/06-deep.js", "src/h6/07-cast.js"],
        "src/h6/05-tail.html")))

    built.append(("h3-metrics.html", page(
        "h3-metrics.html", "src/h3/01-head.html", "src/h3/02-style.html", "src/h3/03-body.html",
        ["shared/yc-evidence.js", "shared/yc-chart.js", "instruments/yc-metrics.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h3/04-app.js", "src/h3/07-cast.js"],
        "src/h3/05-tail.html")))

    # ---------- 精英挑战 ----------
    built.append(("h2-case.html", page(
        "h2-case.html", "src/h2case/01-head.html", "src/h2case/02-style.html", "src/h2case/03-body.html",
        ["instruments/yc-forensic.js", "shared/yc-deep.js", "shared/yc-port.js",
         "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h2case/03b-script.js", "src/h2case/04-app.js", "src/h2/07-cast.js"],
        "src/h2case/05-tail.html")))

    built.append(("h3-maze.html", page(
        "h3-maze.html", "src/h3maze/01-head.html", "src/h3maze/02-style.html", "src/h3maze/03-body.html",
        ["shared/yc-deep.js", "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h3maze/03b-quiz.js", "src/h3maze/04-app.js", "src/h3/07-cast.js"],
        "src/h3maze/05-tail.html")))

    built.append(("h4-purge.html", page(
        "h4-purge.html", "src/h4game/01-head.html", "src/h4game/02-style.html", "src/h4game/03-body.html",
        ["instruments/yc-contamination.js", "shared/yc-deep.js", "shared/yc-port.js",
         "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h4game/04-app.js", "src/h4/07-cast.js"],
        "src/h4game/05-tail.html")))

    built.append(("h5-forecast.html", page(
        "h5-forecast.html", "src/h5game/01-head.html", "src/h5game/02-style.html", "src/h5game/03-body.html",
        ["instruments/yc-greenhouse.js", "shared/yc-deep.js", "shared/yc-port.js",
         "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h5game/04-app.js", "src/h5/07-cast.js"],
        "src/h5game/05-tail.html")))

    built.append(("h6-tower.html", page(
        "h6-tower.html", "src/h6tower/01-head.html", "src/h6tower/02-style.html", "src/h6tower/03-body.html",
        ["instruments/yc-dome.js", "shared/yc-deep.js", "shared/yc-port.js",
         "shared/yc-faces.js", "shared/yc-cast.js",
         "src/h6tower/04-app.js", "src/h6/07-cast.js"],
        "src/h6tower/05-tail.html")))

    # ---------- 公共证据厅 ----------
    built.append(("evidence.html", page(
        "evidence.html", "src/evidence/01-head.html", "src/evidence/02-style.html", "src/evidence/03-body.html",
        ["shared/yc-evidence.js", "instruments/yc-audit.js",
         "shared/yc-port.js", "shared/yc-faces.js", "shared/yc-cast.js",
         "src/evidence/04-app.js"],
        "src/evidence/05-tail.html")))

    # ---------- 城市首页（平面 17 区总图，无 WebGL） ----------
    built.append(("index.html", page(
        "index.html", "src/citymap/01-head.html", "src/citymap/02-style.html", "src/citymap/03-body.html",
        ["shared/yc-districts.js", "src/citymap/04-app.js"],
        "src/citymap/05-tail.html", cast_css=False)))

    # ---------- 全城三维鸟瞰 ----------
    built.append(("map.html", page(
        "map.html", "src/city/01-head.html", "src/city/02-style.html", "src/city/03-body.html",
        [THREE, "shared/yc-evidence.js", "shared/yc3d/yc3d-core.js",
         "shared/yc3d/yc3d-build.js", "shared/yc-districts.js", "shared/yc3d/yc3d-city.js", "src/city/04-app.js"],
        "src/city/05-tail.html")))

    # ---------- 区域三维街区 ----------
    built.append(("district.html", page(
        "district.html", "src/city/01-head.html", "src/city/02-style.html", "src/city/03-body.html",
        [THREE, "shared/yc-evidence.js", "shared/yc3d/yc3d-core.js",
         "shared/yc3d/yc3d-build.js", "shared/yc-districts.js", "shared/yc3d/yc3d-city.js", "src/city/04-app.js"],
        "src/city/05-tail.html")))

    # ---------- 六馆独立3D大厅 + 现有学习分厅 ----------
    built.append(("h3-museum.html", page(
        "h3-museum.html", "src/museum/01-head.html", "src/museum/02-style.html", "src/museum/03-body.html",
        [THREE, '<script src="shared/yc3d/yc3d-gltf.js"></script>',
         "shared/yc3d/yc3d-core.js", "shared/yc3d/yc3d-build.js", "shared/yc3d/yc3d-parts.js",
         "shared/yc3d/yc3d-museum.js", "src/museum/h3.js", "src/museum/04-app.js"],
        "src/museum/05-tail.html", cast_css=False)))

    print("built:")
    for name, size in built:
        print("  %-22s %6.0fK" % (name, size / 1024.0))


if __name__ == "__main__":
    main()

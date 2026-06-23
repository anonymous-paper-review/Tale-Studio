#!/usr/bin/env python3
"""Generate writer-pipeline-latest.excalidraw from the CURRENT code truth.

Source of truth: src/lib/writer/pipeline/steps.ts (serverless chaining = production
execution order) cross-checked against pipeline/index.ts (local order). Deterministic:
seed/version/versionNonce are a fixed incrementing counter (no Math.random).
"""
import json

OUT = "/home/user/Downloads/Tale-Studio/dev/writer-pipeline-latest.excalidraw"

# ---------------------------------------------------------------------------
# Axis color palette (Excalidraw standard swatches). Each axis = distinct fill.
# ---------------------------------------------------------------------------
AXIS = {
    "producer": {"stroke": "#6741d9", "bg": "#d0bfff"},  # violet — producer gate (input seed)
    "story":    {"stroke": "#1971c2", "bg": "#a5d8ff"},  # blue   — Story axis (Gemini S)
    "check":    {"stroke": "#e8590c", "bg": "#ffd8a8"},  # orange — Validation (Claude C)
    "visual":   {"stroke": "#2f9e44", "bg": "#b2f2bb"},  # green  — Visual axis (Gemini V)
    "shot":     {"stroke": "#c2255c", "bg": "#fcc2d7"},  # pink   — Shot / render (Gemini V + fal)
    "persist":  {"stroke": "#495057", "bg": "#dee2e6"},  # gray   — DB persist
    "previz":   {"stroke": "#9c36b5", "bg": "#eebefa"},  # magenta— writer-tab rough board (fal)
}

# ---------------------------------------------------------------------------
# Pipeline nodes in execution order (steps.ts). Each: (label, axis).
# label = stage key + film-craft name + provider.
# ---------------------------------------------------------------------------
NODES = [
    ("producer_gate",
     "Producer 게이트 (seed, 입력)\ngenre + cast 확정 → createRun이\nstate.genre/characters seed\n(옛 s0/s2 삭제)", "producer"),
    ("narrativeStructure",
     "narrativeStructure\ns1_structure · 서사 구조\nGemini (S축)", "story"),
    ("scenes",
     "scenes\ns3_scenes · 씬 분할 (오픈 캐스트)\nnew_characters[] → mergeOpenCast\nGemini (S축)", "story"),
    ("storyCheck",
     "storyCheck\nc_validation_1 · 스토리 검증\nClaude (C축) · skip 가능", "check"),
    ("midPreview",
     "midPreview\nmid_preview · 시각 제안 브리지\nGemini (V축) · skip 가능", "visual"),
    ("visualFormat",
     "visualFormat\nv0_visual · VisualIdentity\n(format + style)\nGemini (V축)", "visual"),
    ("actVisualArc",
     "actVisualArc\nv1_act_arc · 막별 비주얼 아크\nGemini (V축)", "visual"),
    ("v2Design",
     "v2Design\nv2_design · 인물/월드 비주얼\n→ persist Tier1 (chars/locs/scenes)\nGemini (V축)", "visual"),
    ("sceneCinematography",
     "sceneCinematography\nv3_scene_plan · 씬 시네마토그래피\nGemini (V축) · Compact 시 생략", "visual"),
    ("decoupage",
     "decoupage\ndecoupage · beat→shot 분해\nGemini (V축)", "visual"),
    ("shotDesign",
     "shotDesign\nv4_shots · 샷 3분할 (intent/static/dynamic)\n→ shots.rough_storyboard 산출\nGemini (V축)", "shot"),
    ("shotCheck",
     "shotCheck\nc_application_2 · 샷 조립+검증\nGemini (V) 조립 → Claude (C) 검증", "shot"),
    ("renderPrompts",
     "renderPrompts\nv5_prompts · T2I/TI2V 프롬프트\n→ persist Tier2 (shots)\nGemini (V축)", "shot"),
    ("persist",
     "DB persist\ncharacters / scenes / locations / shots\n(persist_manifest)", "persist"),
    ("previz",
     "writer 탭 러프보드 previz\nrough-storyboard · 목각인형 흑백 스케치\nfal flux klein 9b · projectId seed", "previz"),
]

# ---------------------------------------------------------------------------
# Layout: left→right snake flow across rows. Compute box grid deterministically.
# ---------------------------------------------------------------------------
BOX_W, BOX_H = 300, 92
GAP_X, GAP_Y = 80, 90
COLS = 4
X0, Y0 = 120, 140

def grid_pos(i):
    row = i // COLS
    col = i % COLS
    # snake: even rows L→R, odd rows R→L (keeps arrows short between rows)
    if row % 2 == 1:
        col = (COLS - 1) - col
    x = X0 + col * (BOX_W + GAP_X)
    y = Y0 + row * (BOX_H + GAP_Y)
    return x, y, row, (i % COLS)

elements = []
_ctr = [100]  # deterministic seed/version/versionNonce counter (avoid Math.random)

def nxt():
    _ctr[0] += 1
    return _ctr[0]

def add_box(node_id, x, y, label, axis, w=BOX_W, h=BOX_H):
    c = nxt()
    col = AXIS[axis]
    rect = {
        "type": "rectangle", "id": node_id, "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": col["stroke"], "backgroundColor": col["bg"],
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1,
        "opacity": 100, "groupIds": [], "frameId": None, "roundness": {"type": 3},
        "seed": c, "version": c, "versionNonce": c, "isDeleted": False,
        "boundElements": [{"type": "text", "id": node_id + "t"}],
        "updated": c, "link": None, "locked": False,
    }
    ct = nxt()
    txt = {
        "type": "text", "id": node_id + "t", "x": x + 8, "y": y + 8,
        "width": w - 16, "height": h - 16, "angle": 0, "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": 1, "opacity": 100, "groupIds": [],
        "frameId": None, "roundness": None, "seed": ct, "version": ct,
        "versionNonce": ct, "isDeleted": False, "boundElements": None, "updated": ct,
        "link": None, "locked": False, "text": label, "fontSize": 11, "fontFamily": 1,
        "textAlign": "center", "verticalAlign": "middle", "containerId": node_id,
        "originalText": label, "lineHeight": 1.25,
    }
    elements.append(rect)
    elements.append(txt)

def add_arrow(arr_id, sx, sy, ex, ey, start_id, end_id):
    c = nxt()
    arrow = {
        "type": "arrow", "id": arr_id, "x": sx, "y": sy,
        "width": abs(ex - sx), "height": abs(ey - sy),
        "points": [[0, 0], [ex - sx, ey - sy]], "angle": 0,
        "strokeColor": "#343a40", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1,
        "opacity": 100, "groupIds": [], "frameId": None, "roundness": {"type": 2},
        "seed": c, "version": c, "versionNonce": c, "isDeleted": False,
        "boundElements": None, "updated": c, "link": None, "locked": False,
        "lastCommittedPoint": None,
        "startBinding": {"elementId": start_id, "focus": 0, "gap": 4},
        "endBinding": {"elementId": end_id, "focus": 0, "gap": 4},
        "startArrowhead": None, "endArrowhead": "arrow",
    }
    elements.append(arrow)

# Place boxes and record geometry for edge drawing.
geom = {}
for i, (nid, label, axis) in enumerate(NODES):
    x, y, row, col = grid_pos(i)
    add_box(nid, x, y, label, axis)
    geom[nid] = {"x": x, "y": y, "row": row, "col": col, "cx": x + BOX_W / 2, "cy": y + BOX_H / 2}

# Edges: sequential chain following execution order. Edge geometry connects the
# adjacent box edges (right→left within a row; bottom→top between snaked rows).
def register_bound(node_id, arrow_id):
    for e in elements:
        if e["id"] == node_id and e["type"] == "rectangle":
            be = e["boundElements"] or []
            be = list(be) + [{"type": "arrow", "id": arrow_id}]
            e["boundElements"] = be

for i in range(len(NODES) - 1):
    a_id, b_id = NODES[i][0], NODES[i + 1][0]
    ga, gb = geom[a_id], geom[b_id]
    arr_id = f"e{i}"
    if ga["row"] == gb["row"]:
        # same row — horizontal. direction depends on snake.
        if gb["x"] > ga["x"]:  # L→R
            sx, sy = ga["x"] + BOX_W, ga["cy"]
            ex, ey = gb["x"], gb["cy"]
        else:                  # R→L
            sx, sy = ga["x"], ga["cy"]
            ex, ey = gb["x"] + BOX_W, gb["cy"]
    else:
        # row change — vertical drop from bottom of A to top of B (same column under snake)
        sx, sy = ga["cx"], ga["y"] + BOX_H
        ex, ey = gb["cx"], gb["y"]
    add_arrow(arr_id, sx, sy, ex, ey, a_id, b_id)
    register_bound(a_id, arr_id)
    register_bound(b_id, arr_id)

# ---------------------------------------------------------------------------
# Legend (axis color meaning) — placed below the flow.
# ---------------------------------------------------------------------------
legend_items = [
    ("producer", "Producer 게이트 (입력 seed)"),
    ("story",    "Story축 — Gemini (S)"),
    ("check",    "검증 — Claude (C) · skip 가능"),
    ("visual",   "Visual축 — Gemini (V)"),
    ("shot",     "샷·렌더 — Gemini (V) [+Claude 검증]"),
    ("persist",  "DB persist"),
    ("previz",   "writer 탭 러프보드 — fal flux klein 9b"),
]
last_row = (len(NODES) - 1) // COLS
legend_y0 = Y0 + (last_row + 1) * (BOX_H + GAP_Y) + 20
legend_x0 = X0

# Legend title
c = nxt()
elements.append({
    "type": "text", "id": "legtitle", "x": legend_x0, "y": legend_y0 - 30,
    "width": 200, "height": 22, "angle": 0, "strokeColor": "#1e1e1e",
    "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 1,
    "strokeStyle": "solid", "roughness": 1, "opacity": 100, "groupIds": [],
    "frameId": None, "roundness": None, "seed": c, "version": c, "versionNonce": c,
    "isDeleted": False, "boundElements": None, "updated": c, "link": None,
    "locked": False, "text": "범례 (축별 색)", "fontSize": 14, "fontFamily": 1,
    "textAlign": "left", "verticalAlign": "top", "containerId": None,
    "originalText": "범례 (축별 색)", "lineHeight": 1.25,
})
for j, (axis, desc) in enumerate(legend_items):
    sw_x = legend_x0
    sw_y = legend_y0 + j * 34
    c = nxt()
    col = AXIS[axis]
    elements.append({
        "type": "rectangle", "id": f"leg{j}", "x": sw_x, "y": sw_y, "width": 28,
        "height": 22, "angle": 0, "strokeColor": col["stroke"],
        "backgroundColor": col["bg"], "fillStyle": "solid", "strokeWidth": 2,
        "strokeStyle": "solid", "roughness": 1, "opacity": 100, "groupIds": [],
        "frameId": None, "roundness": {"type": 3}, "seed": c, "version": c,
        "versionNonce": c, "isDeleted": False, "boundElements": None, "updated": c,
        "link": None, "locked": False,
    })
    ct = nxt()
    elements.append({
        "type": "text", "id": f"leg{j}t", "x": sw_x + 38, "y": sw_y,
        "width": 360, "height": 22, "angle": 0, "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": 1, "opacity": 100, "groupIds": [],
        "frameId": None, "roundness": None, "seed": ct, "version": ct,
        "versionNonce": ct, "isDeleted": False, "boundElements": None, "updated": ct,
        "link": None, "locked": False, "text": desc, "fontSize": 12, "fontFamily": 1,
        "textAlign": "left", "verticalAlign": "middle", "containerId": None,
        "originalText": desc, "lineHeight": 1.25,
    })

# Diagram title
c = nxt()
elements.append({
    "type": "text", "id": "title", "x": X0, "y": 40, "width": 900, "height": 32,
    "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
    "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid", "roughness": 1,
    "opacity": 100, "groupIds": [], "frameId": None, "roundness": None, "seed": c,
    "version": c, "versionNonce": c, "isDeleted": False, "boundElements": None,
    "updated": c, "link": None, "locked": False,
    "text": "Tale-Studio writer 파이프라인 (현재 코드 기준 · steps.ts 실행 순서)",
    "fontSize": 18, "fontFamily": 1, "textAlign": "left", "verticalAlign": "top",
    "containerId": None,
    "originalText": "Tale-Studio writer 파이프라인 (현재 코드 기준 · steps.ts 실행 순서)",
    "lineHeight": 1.25,
})

doc = {
    "type": "excalidraw",
    "version": 2,
    "source": "tale-studio:writer-pipeline-latest",
    "elements": elements,
    "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
    "files": {},
}

with open(OUT, "w") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print(f"wrote {OUT}")
print(f"elements={len(elements)} boxes={sum(1 for e in elements if e['type']=='rectangle')} "
      f"arrows={sum(1 for e in elements if e['type']=='arrow')} "
      f"texts={sum(1 for e in elements if e['type']=='text')}")

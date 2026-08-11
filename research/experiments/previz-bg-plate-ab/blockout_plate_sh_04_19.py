# 배경 플레이트 블록아웃 — sh_04_19 시작 그림의 공간을 회색 도형으로 재현한 정지 1프레임.
#
# 목적: previz-bg-plate-ab 팔 ③d(3D 블록아웃 → 리페인트 플레이트)의 기하 소스.
#   인물 없음 — 시작 그림에서 사람만 빼고 "같은 카메라·같은 공간"만 남긴 배경 플레이트다.
#
# 블록아웃 3규칙 (blockout_v2.py와 동일):
#   ① 단순 도형만 — 박스와 플레인, 봉 1개(가는 박스). 그 외 프리미티브 없음.
#   ② 색으로 종류만 구분 — 구조물/잔해 회색 / 지면 밝은 회색 / 먼 폐허 옅은 회색(대기 원근 대용).
#   ③ 디테일·질감 금지 — Workbench 플랫 셰이딩, 캐비티·그림자 없음.
#
# 재현성: 난수 없음. 잔해 배치는 R2 저불일치 수열(무리수 증분의 소수부)로 만든 결정적 좌표다.
#   같은 스크립트 = 같은 좌표 = 같은 그림(모델 경계 없음).
#
# 좌표계: 카메라는 원점 부근에서 +Y를 본다(rot_x = 90°+틸트). 화면 오른쪽 = +X, 위 = +Z.
#   지면 z=0, 카메라 눈높이 1.55 m, 위로 6.5° 틸트 → 지평선이 화면 세로 64% 지점(시작 그림 실측).
#
# 시작 그림 → 도형 대응 (측정: 시작 그림 377×245 의 정규화 좌표 nx,ny):
#   · 거대 경사 콘크리트 판  = 2.8×2.0 m 단면 · 길이 13.2 m 의 박스(41° 로 들림). 근단 캡이 화면
#     오른쪽(nx≈0.87~1.0, ny≈0.25~0.80)에 걸리고 원단이 왼쪽 위로 올라가며 화면 상단(nx≈0.42)을
#     뚫고 나간다. 단면 치수는 시작 그림에서 판의 화면상 두께(nx 0.6 지점 ny 0.12~0.33)를 역산한 값.
#   · 그 뒤 가는 봉(nx≈0.88~0.93, ny≈0.11~0.25) = 가는 세로 박스 1개.
#   · 화면 중앙에 선 쐐기형 파편(꼭짓점 nx≈0.50, ny≈0.54) = 기울인 판 박스.
#   · 바닥 오른쪽 큰 덩어리(nx≈0.76~1.0, ny≈0.73~1.0) = 근거리 박스 3개 군집.
#   · 좌하단 비스듬히 누운 얇은 판(nx≈0.36~0.45, ny≈0.84~0.99) = 얇은 기울인 박스.
#   · 지면 전체의 잔해밭 = 결정적 수열로 흩뿌린 작은 박스 122개(근경 78 + 원경 44).
#   · 공중 파편 = 작은 박스 34개(시작 그림의 흩날리는 점들).
#   · 왼쪽 끝 먼 폐허 탑(nx≈0.0~0.11, ny≈0.25~0.65) = 옅은 회색 큰 박스 + 주변 실루엣 3개.
#   · 밝은 하늘 = 월드 색 (0.93,0.93,0.91) 플랫.
#
# 시작 그림 대비 타협 (plates/blockout_notes.md 에 상세):
#   ① 화면비 1.54:1 → 16:9 — 가로 화각을 맞추고 위아래를 7%씩 내줬다.
#   ② 지면은 45 m 에서 끊었다(그 너머는 하늘색 = 흐린 원경). Workbench 광원 한계 대응.
#   ③ 큰 도형 5개만 좌표를 맞췄고, 작은 잔해·공중 파편은 밀도와 크기만 맞춘 결정적 산포다.
#
# 실행: /Applications/Blender.app/Contents/MacOS/Blender --background \
#         --python research/experiments/previz-bg-plate-ab/blockout_plate_sh_04_19.py
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "plates", "blockout_grey.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

RES_X, RES_Y = 1280, 720
CAM_LOC = (0.0, 0.0, 1.55)     # 눈높이 1.55 m
CAM_TILT_DEG = 6.5             # 위로 틸트 — 지평선을 화면 64% 지점에 둔다
CAM_LENS = 24.0                # 광각(시작 그림의 강한 원근·거대 판 스케일)

# ── 씬 리셋 ──
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 1
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100

# Workbench 플랫 렌더 — 오브젝트 색 그대로, 질감 없음 (블록아웃 규칙 ③)
scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "OBJECT"
shading.show_cavity = False
shading.show_shadows = False
scene.display.render_aa = "8"
world = bpy.data.worlds.new("World")
world.color = (0.93, 0.93, 0.91)   # 밝은 하늘 (시작 그림의 크림빛 백지 하늘)
scene.world = world

# 뷰 변환 Standard — 기본 AgX는 톤을 압축해 회색끼리 값이 붙는다(블록아웃 판독성 저하).
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

# PNG 스틸 (Blender 5.x: media_type 선분리)
if hasattr(scene.render.image_settings, "media_type"):
    scene.render.image_settings.media_type = "IMAGE"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = OUT

# 값 배분은 시작 그림을 따른다 — 밝은 하늘·밝은 바닥 위에 어두운 잔해가 얹히는 구조.
# (Workbench 스튜디오 광은 상면을 감광시키므로 지면은 0.97로 올려도 하늘보다 어둡게 나온다.
#  그래서 대비는 지면을 더 올리는 대신 구조물을 낮춰서 만든다.)
GRAY_STRUCT = (0.32, 0.32, 0.34)   # 구조물·잔해
GRAY_GROUND = (0.97, 0.97, 0.96)   # 지면
GRAY_FAR = (0.62, 0.62, 0.63)      # 먼 폐허 실루엣 (대기 원근 대용 — 종류 구분용 3번째 톤)


def box(name, color, location, scale, rotation=(0.0, 0.0, 0.0)):
    """size=1 큐브 + scale = 실치수(m). 단순 박스 외 도형 금지."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.color = (*color, 1.0)
    return obj


def beam(name, color, p_from, p_to, width, thick, roll_deg=0.0):
    """두 점을 잇는 박스. 로컬 +X가 축 방향이 되도록 오일러 XYZ를 유도한다."""
    dx, dy, dz = (p_to[0] - p_from[0], p_to[1] - p_from[1], p_to[2] - p_from[2])
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    rz = math.atan2(dy, dx)
    ry = -math.asin(dz / length)
    center = ((p_from[0] + p_to[0]) / 2, (p_from[1] + p_to[1]) / 2, (p_from[2] + p_to[2]) / 2)
    return box(name, color, center, (length, width, thick),
               rotation=(math.radians(roll_deg), ry, rz))


def r2(i):
    """R2 저불일치 수열 — 결정적(난수 아님). 잔해 산포용 (u,v) ∈ [0,1)²."""
    a1, a2 = 0.7548776662466927, 0.5698402909980532
    return ((0.5 + a1 * i) % 1.0, (0.5 + a2 * i) % 1.0)


# ── 지면 ──
# 45 m 에서 끊는다. Workbench 스튜디오 광은 상면(법선 +Z)을 강하게 감광시켜(측정 인자 ≈0.15)
# 지면을 흰색으로 올려도 하늘보다 어둡게 나온다 — 그래서 무한 평면 대신 유한 판을 쓰고
# 그 너머는 월드색(밝은 하늘)이 비치게 둬서 시작 그림의 "흐려서 하얗게 날아간 원경"을 만든다.
# 부작용: 지평선이 진짜 무한 지평선(화면 62.5%)이 아니라 판 끝(65.3%)에 생긴다 — 20 px 차.
box("ground", GRAY_GROUND, (0.0, 10.0, -0.05), (400.0, 70.0, 0.1))

# ── 거대 경사 콘크리트 판 (시작 그림 최대 오브젝트) ──
# 근단 캡이 화면 오른쪽 가장자리에 걸리고(nx≈0.85~1.0), 원단은 왼쪽 위로 프레임을 이탈한다.
beam("slab_main", GRAY_STRUCT,
     p_from=(4.97, 7.17, 2.23), p_to=(-0.40, 15.60, 10.80),
     width=2.8, thick=2.0, roll_deg=18.0)

# 판 뒤 가는 봉 (시작 그림 nx≈0.90, ny≈0.11~0.25)
box("rebar_pole", GRAY_STRUCT, (6.30, 10.40, 5.60), (0.16, 0.16, 2.8),
    rotation=(math.radians(9.0), math.radians(-7.0), 0.0))

# ── 화면 중앙에 선 쐐기형 파편 (꼭짓점 nx≈0.50 / ny≈0.54 — 지평선 위로 솟는 유일한 중경 도형) ──
box("shard_center", GRAY_STRUCT, (0.70, 12.6, 1.00), (2.2, 0.8, 2.6),
    rotation=(math.radians(-14.0), math.radians(36.0), math.radians(22.0)))
box("shard_center_low", GRAY_STRUCT, (2.4, 10.8, 0.42), (2.2, 1.6, 1.0),
    rotation=(0.0, math.radians(9.0), math.radians(-18.0)))

# ── 오른쪽 아래 큰 덩어리 군집 (근거리 — 프레임 하단 오른쪽을 채운다) ──
box("mass_br_a", GRAY_STRUCT, (2.35, 4.30, 0.35), (2.3, 2.0, 1.3),
    rotation=(math.radians(6.0), math.radians(-8.0), math.radians(21.0)))
box("mass_br_b", GRAY_STRUCT, (3.90, 5.40, 0.40), (2.6, 2.2, 1.5),
    rotation=(0.0, math.radians(11.0), math.radians(-9.0)))
box("mass_br_c", GRAY_STRUCT, (3.20, 7.60, 0.25), (2.0, 1.8, 1.1),
    rotation=(math.radians(-7.0), 0.0, math.radians(33.0)))

# ── 좌하단에 비스듬히 누운 얇은 판 (시작 그림 nx≈0.36~0.45, ny≈0.84~0.99) ──
box("plate_fg_left", GRAY_STRUCT, (-0.80, 5.40, 0.16), (0.95, 0.20, 0.80),
    rotation=(math.radians(4.0), math.radians(-42.0), math.radians(14.0)))

# ── 중경 잔해 슬래브 3장 (지평선 언저리에 낮게 — 중앙 밝은 여백은 비운다) ──
for i, (x, y, h, yaw, tilt) in enumerate((
        (-4.6, 13.0, 0.9, 28.0, -12.0),
        (7.4, 15.5, 1.5, 17.0, -22.0),
        (4.6, 22.0, 1.4, -33.0, 14.0),
)):
    box(f"slab_mid_{i}", GRAY_STRUCT, (x, y, h / 2), (h * 1.5, h * 0.6, h),
        rotation=(math.radians(tilt), 0.0, math.radians(yaw)))

# ── 잔해밭 A: 근경 카펫 62개 (y 3.4~14) — 프레임 하단 1/4을 채우는 작은 덩어리들 ──
for i in range(78):
    u, v = r2(i + 1)
    y = 3.4 + 10.6 * (v ** 0.85)
    x = (u - 0.5) * (9.0 + 1.30 * y)
    s = 0.13 + 0.28 * ((u * 3.7) % 1.0) + 0.017 * y
    yaw = 360.0 * ((u * 5.3 + v * 2.9) % 1.0)
    tilt = 30.0 * (((u + v) * 4.1) % 1.0) - 15.0
    box(f"rubble_near_{i}", GRAY_STRUCT, (x, y, s * 0.30),
        (s * 1.7, s * 1.25, s * 0.80),
        rotation=(math.radians(tilt), math.radians(tilt * 0.6), math.radians(yaw)))

# ── 잔해밭 B: 원경 카펫 44개 (y 14~40) — 지평선 아래 흐린 띠. 크기 상한 낮게 유지 ──
for i in range(44):
    u, v = r2(i + 71)
    y = 14.0 + 26.0 * (v ** 0.75)
    x = (u - 0.5) * (14.0 + 1.30 * y)
    s = 0.30 + 0.55 * ((u * 2.9) % 1.0)
    yaw = 360.0 * ((u * 4.7 + v * 3.3) % 1.0)
    tilt = 22.0 * (((u + v) * 5.7) % 1.0) - 11.0
    box(f"rubble_far_{i}", GRAY_STRUCT, (x, y, s * 0.28),
        (s * 1.8, s * 1.3, s * 0.75),
        rotation=(math.radians(tilt), math.radians(tilt * 0.5), math.radians(yaw)))

# ── 공중 파편 26개 (시작 그림의 흩날리는 점들) ──
for i in range(34):
    u, v = r2(i + 37)
    y = 5.5 + 15.0 * v
    x = -5.2 + 12.5 * u
    z = 1.2 + 7.4 * ((u * 2.3 + v * 1.7) % 1.0)
    s = 0.11 + 0.24 * ((u * 6.1) % 1.0)
    yaw = 360.0 * ((v * 7.7) % 1.0)
    box(f"chip_{i}", GRAY_STRUCT, (x, y, z), (s * 1.4, s, s * 0.8),
        rotation=(math.radians(41.0 * u), math.radians(29.0 * v), math.radians(yaw)))

# ── 먼 폐허 실루엣 (왼쪽 끝 탑 + 배경 몇 채) ──
# 왼쪽 끝에만 모은다 — 시작 그림의 중앙~왼쪽 여백(밝은 하늘)은 비워 둔다.
box("ruin_tower_l", GRAY_FAR, (-47.0, 69.5, 11.0), (11.0, 9.0, 22.0))
box("ruin_tower_l_cap", GRAY_FAR, (-44.0, 69.0, 23.2), (5.0, 6.0, 2.4))
for i, (x, y, w, h) in enumerate((
        (-78.0, 92.0, 16.0, 17.0),     # 탑 뒤 실루엣
        (-74.0, 112.0, 14.0, 11.0),    # 화면 왼쪽 가장자리
        (34.0, 155.0, 30.0, 5.0),      # 지평선에 붙는 낮은 원경 능선 (오른쪽)
)):
    box(f"ruin_far_{i}", GRAY_FAR, (x, y, h / 2), (w, w * 0.8, h))

# ── 카메라 ──
bpy.ops.object.camera_add(location=CAM_LOC,
                          rotation=(math.radians(90.0 + CAM_TILT_DEG), 0.0, 0.0))
cam = bpy.context.active_object
cam.name = "plate_cam"
cam.data.lens = CAM_LENS
cam.data.sensor_width = 36.0
scene.camera = cam

bpy.ops.render.render(write_still=True)
print(f"DONE → {OUT}")

# 배경용 3D 블록아웃 — 법정 (t2-bg-viewsheet-from-3d)
#
# 목적: 한 로케이션을 3D로 세우고 **각도별 배경 스냅샷 5장**을 뽑는다.
#   현행은 장소 사진 1장만 영상 생성기에 넘긴다 → 각도가 바뀌면 다른 방이 돼버린다.
#   3D 한 채를 세워두면 어느 각도를 요구해도 "같은 방"이 나온다는 게 이 실험의 가설.
#
# 이 블록아웃이 모션용 블록아웃(qual2-fullmotion/blockout_v2.py)과 다른 점 — 요구가 반대다:
#   · 모션용: 무지 회색 도형이면 충분. 방이 무슨 방인지는 안 중요(움직임만 전달).
#   · 배경용: 방이 **"그 방"으로 식별**돼야 한다 → 벽/천장 구조, 랜드마크(판사석·증인석·
#     방청 벤치·명패·기), 가구 배치와 비례가 참조 사진과 이어져야 한다.
#   · 대신 디테일 텍스처·인물은 넣지 않는다(하류 모델이 그림체를 다시 입힌다 — 검증된 사실).
#     따라서 여기 재질은 전부 단색 Principled(대리석=흰 저러프, 유리=투과, 금속=metallic)이며
#     텍스처 이미지는 한 장도 쓰지 않는다.
#
# ── 좌표계 ─────────────────────────────────────────────────────────────────
#   +Y = 판사석(먼 쪽, Y=+10 벽).  -Y = 방청석/입구(Y=-10 벽).
#   +X = 방청석에서 판사석을 볼 때의 화면 오른쪽.  +Z = 위. 바닥 Z=0.
#   실내: X ∈ [-7, 7] (폭 14m), Y ∈ [-10, 10] (깊이 20m), 천장 소핏 4.45 / 중앙 리세스 4.95.
#
# ── 랜드마크 배치 근거 (전부 참조 사진 ref_location_wide.png 실측 판독에서 유도) ──
#   참조 사진(1088x608)은 방청석 뒤 중앙축에서 판사석을 보는 광각 와이드다. 거기서 읽은 것:
#   1. 판사석  : 화면 폭의 약 47%를 차지하는 긴 대리석 매스, 뒤에 의자 3(중앙 등받이가 높음),
#                단상 위. → 데스크 반폭 4.4m, 상판 1.24m, 단상 0.35m, 의자 X=0,±2.2.
#   2. 배면 명패: 판사석 뒤 벽면에 원형 문양(법원 휘장) + 그 아래 가로 금속 명패("법 원").
#                → 휘장 디스크 Z=3.35, 명패 박스 Z=2.75, 둘 다 X=0. 글자는 넣지 않는다(텍스처 금지).
#   3. 기 2개  : 판사석 양 끝 바깥, 벽 앞. 좌=태극기(흰 바탕+적청 원), 우=남색 법원기.
#                → X=±4.9, Y=8.9. 사진에서 기가 출입구보다 안쪽(중앙 쪽)에 선다.
#   4. 출입구 2: 기보다 더 바깥, 배면 벽에 어두운 개구부. → X=±6.0, 폭 1.2, 높이 2.6.
#   5. 측면 단  : 사진 좌우 끝의 유리 난간 얹힌 낮은 단(검사석/변호인석 자리). → X ±4.4~6.8,
#                Y 3.6~6.4, 단높이 0.3 + 유리난간 1.05.
#   6. 유리 바  : 화면 중앙을 가로지르는 세로 멀리언 달린 유리 칸막이(방청석/법정 구획).
#                → Y=0.4, 높이 1.35, 중앙 1.2m 게이트 개구.
#   7. 증인석   : 바 너머 중앙의 투명 큐브. → (0, 2.9), 유리 박스 1.1x1.1x1.15. (props "유리 소재의 증인석")
#   8. 방청 벤치: 등받이 없는 기하학적 석재 벤치. 중앙 통로 좌우 2열 × 5행.
#                → 통로 X ∈ [-1.3, 1.3], 벤치 Y = -1.8/-3.4/-5.0/-6.6/-8.2. (props "기하학적 구조의 벤치")
#   9. 천장     : 벽 쪽은 낮은 소핏(4.45), 중앙은 올라간 리세스(4.95). 그 단차에 가느다란
#                **모서리가 45°로 잘린(챔퍼) 발광 라인**이 돈다 — 사진에서 가장 눈에 띄는 천장 서명.
#                → 리세스 개구 X ±4.6, Y ±6.5, 챔퍼 1.5m. (lighting "천장의 매립형 백색 LED")
#  10. 코브     : 네 벽 상단(Z 4.32~4.45)을 타고 도는 간접 발광 띠. (lighting "벽면을 타고 흐르는 간접 조명")
#  11. 벽·바닥 : 큰 대리석 패널의 세로 조인트(살짝 돌출한 패널 박스로 심 라인만), 바닥은
#                반사되는 흰 대리석(러프 0.06) — 사진의 젖은 듯한 반사가 방의 인상 절반이다.
#
# ── 뷰 5장 (DB 각도 수요에서 유도, 새 각도 발명 금지) ────────────────────────
#   이 로케이션 54샷의 실제 각도 분포 eye_level 39 / low_angle 10 / high_angle 3,
#   뷰 클러스터 = 판사석·벽·방청석·천장·디테일. 그래서:
#     1 view_bench_eye    판사석 정면, eye  — 참조 사진과 거의 같은 구도(대조 가능하게)
#     2 view_gallery_eye  방청석 리버스, eye — **이 실험의 급소**. 2D 참조가 죽는 지점이 "반대편"
#     3 view_witness_low  증인석, low       — 아래에서 올려다봄, 천장 리세스가 프레임에 들어옴
#     4 view_room_high    전경, high        — 배치 전체(통로·바·단상)를 한 장에
#     5 view_wall_eye     측벽·명패, eye    — 대각선으로 우측 벽 패널 + 명패/휘장 동시에
#
# ── 실행 ──────────────────────────────────────────────────────────────────
#   최종 산출(제출본과 동일):
#     BG3D_SAMPLES=160 /opt/homebrew/bin/blender --background --python \
#       research/experiments/bg-viewsheet-from-3d/courtroom_blockout.py
#   빠른 프리뷰(약 5초/장):
#     BG3D_SAMPLES=24 BG3D_PCT=60 BG3D_VIEWS=view_bench_eye /opt/homebrew/bin/blender ...
#   환경변수: BG3D_SAMPLES(기본 128) / BG3D_PCT(해상도 %) / BG3D_VIEWS(쉼표로 일부만)
#            BG3D_LIGHT(전 광원 배율) / BG3D_EXPOSURE(스톱)
#   출력: views/view_*.png (1280x720). 카메라 수치는 views/README.md 표에 있다.
#   Blender 5.2.0 LTS(Cycles/Metal GPU, 실패 시 CPU 자동 폴백)에서 5장 약 2분 15초.
#
# ── 렌더 중 실제로 밟은 함정 (같은 걸 또 밟지 말라고 남긴다) ─────────────────
#   ① 동일 평면 = 검은 얼룩: 밑면이 정확히 같은 높이인 두 면(챔퍼 웨지 vs 소핏, 가구 밑면 vs
#      바닥)은 Cycles에서 self-shadow acne로 **새까맣게** 렌더된다. 전부 수 mm씩 어긋냈다.
#   ② 벽 패널이 문을 덮음: 개구부를 벽 패널면보다 앞으로 빼거나 패널 배치에서 그 구간을 빼야 한다.
#   ③ 흰 방의 상호반사 폭주: 알베도 0.9대만 쓰면 전 면이 클리핑돼 형태가 사라진다.
#      "차가운 흰 대리석" 인상은 조명이 만들고, 형태는 알베도 차이가 만든다 — 값을 벌려라.
#   ④ 카메라가 가구 안에 파묻힘: 방청 벤치 슬래브(Y −8.5~−1.5, Z 0~0.46) 안에 카메라를 두면
#      화면 절반이 검게 나온다. 배치 전에 카메라 좌표가 어느 볼륨에도 안 들어가는지 검산할 것.
import bpy
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "views")
os.makedirs(OUTDIR, exist_ok=True)

SAMPLES = int(os.environ.get("BG3D_SAMPLES", "128"))
ONLY = [v for v in os.environ.get("BG3D_VIEWS", "").split(",") if v]

RES_X, RES_Y = 1280, 720

# ── 방 치수 ──
HW = 7.0        # 실내 반폭 (X)
Y_FAR = 10.0    # 판사석 쪽 벽
Y_NEAR = -10.0  # 입구 쪽 벽
Z_SOFFIT = 4.45  # 벽 쪽 낮은 천장
Z_HIGH = 4.95    # 중앙 리세스 천장
WALL_T = 0.4

RX, RY = 4.6, 6.5   # 천장 리세스 개구 반폭/반깊이
CH = 1.5            # 리세스 모서리 챔퍼

# ═══════════════════════════════════════════════════════════════════════════
# 씬 리셋 + 렌더 설정
# ═══════════════════════════════════════════════════════════════════════════
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = int(os.environ.get("BG3D_PCT", "100"))
scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 8
scene.cycles.use_adaptive_sampling = True

# GPU(Metal) 우선, 실패하면 CPU — 헤드리스에서 조용히 폴백
try:
    cprefs = bpy.context.preferences.addons["cycles"].preferences
    cprefs.compute_device_type = "METAL"
    cprefs.get_devices()
    for d in cprefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
except Exception as exc:  # noqa: BLE001
    print(f"[bg3d] GPU 설정 실패 → CPU 사용: {exc}")
    scene.cycles.device = "CPU"

if hasattr(scene.render.image_settings, "media_type"):
    scene.render.image_settings.media_type = "IMAGE"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.film_transparent = False
# Standard 트랜스폼 + 노출 수동 — 참조 사진처럼 밝고 깨끗한 흰 대리석 톤을 노린다.
# (AgX는 흰 벽을 회색으로 눌러버려 "차가운 흰 대리석" 인상이 죽는다.)
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = float(os.environ.get("BG3D_EXPOSURE", "0.0"))

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.03, 0.035, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world


# ═══════════════════════════════════════════════════════════════════════════
# 재질 (전부 단색 Principled — 텍스처 이미지 0장)
# ═══════════════════════════════════════════════════════════════════════════
def _set(bsdf, key, value):
    if key in bsdf.inputs:
        bsdf.inputs[key].default_value = value


def mat(name, color, rough=0.4, metallic=0.0, transmission=0.0, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if emission is not None:
        # 발광은 순수 Emission 노드로 (Principled 발광은 러프/투과와 섞여 지저분해짐)
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs[0].default_value = (*color, 1)
        em.inputs[1].default_value = emission
        nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs[0])
        return m
    _set(bsdf, "Base Color", (*color, 1))
    _set(bsdf, "Roughness", rough)
    _set(bsdf, "Metallic", metallic)
    _set(bsdf, "Transmission Weight", transmission)
    if transmission > 0:
        _set(bsdf, "IOR", 1.5)
    return m


# 값 위계 — 참조 사진은 거의 전부 흰색이지만, 흰 알베도(0.9+)만 쓰면 흰 방 안의
# 상호반사가 폭주해 전 면이 클리핑되고 형태가 뭉갠다(2차 렌더에서 실제로 그랬다).
# 그래서 "차가운 흰 대리석" 인상은 유지하되 면마다 값을 벌려 구조가 읽히게 한다.
M_WALL = mat("marble_wall", (0.76, 0.76, 0.775), rough=0.32)
M_PANEL = mat("marble_panel", (0.83, 0.83, 0.845), rough=0.22)
M_FLOOR = mat("marble_floor", (0.70, 0.71, 0.735), rough=0.05)
M_DESK = mat("marble_desk", (0.795, 0.790, 0.780), rough=0.16)
M_BENCH = mat("stone_bench", (0.575, 0.565, 0.535), rough=0.45)
M_GLASS = mat("glass", (0.93, 0.96, 0.96), rough=0.02, transmission=1.0)
M_METAL = mat("metal", (0.66, 0.67, 0.70), metallic=1.0, rough=0.28)
M_GOLD = mat("gold", (0.83, 0.68, 0.33), metallic=1.0, rough=0.30)
M_DARK = mat("dark", (0.040, 0.040, 0.050), rough=0.55)
M_CHAIR = mat("chair", (0.40, 0.41, 0.435), rough=0.62)
# 천장은 일부러 더 눌러둔다 — 천장이 흰색으로 클리핑되면 리세스 LED 라인(5개 뷰 전부에
# 등장하는 최강 연속성 단서)이 배경과 같은 흰색이 돼 사라진다(4차 렌더 관찰).
M_CEIL = mat("ceiling", (0.72, 0.72, 0.73), rough=0.45)
M_LED = mat("led", (1.0, 0.985, 0.955), emission=11.0)
M_LED_SOFT = mat("led_soft", (1.0, 0.98, 0.95), emission=4.0)
M_F_WHITE = mat("flag_white", (0.95, 0.95, 0.95), rough=0.75)
M_F_NAVY = mat("flag_navy", (0.075, 0.115, 0.29), rough=0.75)
M_F_RED = mat("flag_red", (0.78, 0.12, 0.18), rough=0.75)
M_F_BLUE = mat("flag_blue", (0.09, 0.22, 0.58), rough=0.75)


# ═══════════════════════════════════════════════════════════════════════════
# 프리미티브 헬퍼 — 전부 (min,max) 범위로 박스를 놓는다 (좌표 검산이 쉬우라고)
# ═══════════════════════════════════════════════════════════════════════════
def box(name, xr, yr, zr, material, rot_z=0.0):
    cx, cy, cz = (xr[0] + xr[1]) / 2, (yr[0] + yr[1]) / 2, (zr[0] + zr[1]) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.name = name
    o.scale = (xr[1] - xr[0], yr[1] - yr[0], zr[1] - zr[0])
    o.rotation_euler = (0, 0, rot_z)
    o.data.materials.append(material)
    return o


def box_at(name, center, size, material, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.rotation_euler = (0, 0, rot_z)
    o.data.materials.append(material)
    return o


def disc(name, center, radius, depth, material, axis="Y"):
    rot = {"Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0), "X": (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=center,
                                        rotation=rot, vertices=48)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(material)
    return o


def cyl(name, center, radius, depth, material):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=center, vertices=24)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(material)
    return o


# ═══════════════════════════════════════════════════════════════════════════
# 1. 방 셸 — 바닥 / 네 벽 / 천장
# ═══════════════════════════════════════════════════════════════════════════
# 바닥 윗면을 -4mm에 둔다 — Z=0에 놓인 모든 가구의 밑면과 동일 평면이 되면 Cycles가
# self-shadow acne(검은 얼룩)를 낸다. 4mm 틈은 1280px에서 서브픽셀이라 안 보인다.
box("floor", (-HW - WALL_T, HW + WALL_T), (Y_NEAR - WALL_T, Y_FAR + WALL_T), (-0.3, -0.004), M_FLOOR)

box("wall_left", (-HW - WALL_T, -HW), (Y_NEAR, Y_FAR), (0, 5.2), M_WALL)
box("wall_right", (HW, HW + WALL_T), (Y_NEAR, Y_FAR), (0, 5.2), M_WALL)
box("wall_far", (-HW - WALL_T, HW + WALL_T), (Y_FAR, Y_FAR + WALL_T), (0, 5.2), M_WALL)
box("wall_near", (-HW - WALL_T, HW + WALL_T), (Y_NEAR - WALL_T, Y_NEAR), (0, 5.2), M_WALL)

# 상부 슬래브 (리세스 천장면) — 방 전체를 Z=4.95에서 덮는다
box("ceiling_high", (-HW - WALL_T, HW + WALL_T), (Y_NEAR - WALL_T, Y_FAR + WALL_T),
    (Z_HIGH, Z_HIGH + 0.25), M_CEIL)

# 소핏 프레임 4밴드 — 벽 쪽만 4.45까지 내려온 낮은 천장 (윗면은 상부 슬래브에 파묻는다)
box("soffit_near", (-HW, HW), (Y_NEAR, -RY), (Z_SOFFIT, Z_HIGH + 0.06), M_CEIL)
box("soffit_far", (-HW, HW), (RY, Y_FAR), (Z_SOFFIT, Z_HIGH + 0.06), M_CEIL)
box("soffit_left", (-HW, -RX), (-RY, RY), (Z_SOFFIT, Z_HIGH + 0.06), M_CEIL)
box("soffit_right", (RX, HW), (-RY, RY), (Z_SOFFIT, Z_HIGH + 0.06), M_CEIL)

# 소핏 개구부의 45° 챔퍼 코너 (참조 사진 천장 라인이 모서리에서 꺾여 있다)
CORNERS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
for sx, sy in CORNERS:
    mid = Vector((sx * (RX - CH / 2), sy * (RY - CH / 2), 0))
    out = Vector((sx, sy, 0)).normalized()
    theta = math.atan2(-sy, sx)
    ly = Vector((math.cos(theta + math.pi / 2), math.sin(theta + math.pi / 2), 0))
    if ly.dot(out) < 0:
        theta += math.pi
    c = mid + out * 0.65
    # 밑면을 소핏보다 6mm 낮게 둔다 — 정확히 같은 평면이면 acne로 **새까맣게** 렌더된다
    # (1·2차 렌더에서 리세스 코너에 검은 박쥐날개 모양으로 실제 발생. 이게 그 수리다.)
    box_at(f"soffit_chamfer_{sx}_{sy}", (c.x, c.y, (Z_SOFFIT - 0.006 + Z_HIGH + 0.06) / 2),
           (CH * math.sqrt(2) + 0.5, 1.3, (Z_HIGH + 0.06) - (Z_SOFFIT - 0.006)),
           M_CEIL, rot_z=theta)

# ═══════════════════════════════════════════════════════════════════════════
# 2. 조명 요소 — 리세스 단차 LED 라인 (챔퍼 포함) + 벽 상단 코브 + 매립 슬롯
#    lighting_sources 원문: "천장의 매립형 백색 LED" / "벽면을 타고 흐르는 간접 조명"
# ═══════════════════════════════════════════════════════════════════════════
LED_Z = (Z_SOFFIT - 0.025, Z_SOFFIT + 0.145)
LED_W = 0.14
EMB = 0.04   # 소핏 안쪽으로 파묻는 깊이 — 동일 평면 회피
box("led_near", (-RX + CH, RX - CH), (-RY - EMB, -RY + LED_W), LED_Z, M_LED)
box("led_far", (-RX + CH, RX - CH), (RY - LED_W, RY + EMB), LED_Z, M_LED)
box("led_left", (-RX - EMB, -RX + LED_W), (-RY + CH, RY - CH), LED_Z, M_LED)
box("led_right", (RX - LED_W, RX + EMB), (-RY + CH, RY - CH), LED_Z, M_LED)
for sx, sy in CORNERS:
    mid = Vector((sx * (RX - CH / 2), sy * (RY - CH / 2), 0))
    out = Vector((sx, sy, 0)).normalized()
    theta = math.atan2(-sy, sx)
    ly = Vector((math.cos(theta + math.pi / 2), math.sin(theta + math.pi / 2), 0))
    if ly.dot(out) < 0:
        theta += math.pi
    c = mid - out * (LED_W / 2 - EMB / 2)
    box_at(f"led_chamfer_{sx}_{sy}", (c.x, c.y, (LED_Z[0] + LED_Z[1]) / 2),
           (CH * math.sqrt(2), LED_W + EMB, LED_Z[1] - LED_Z[0]), M_LED, rot_z=theta)

# 코브: 네 벽 상단을 타고 도는 간접 발광 띠 (벽 안으로 3cm 파묻어 동일 평면 회피)
COVE_Z = (4.30, 4.44)
box("cove_left", (-HW - 0.03, -HW + 0.13), (Y_NEAR + 0.1, Y_FAR - 0.1), COVE_Z, M_LED_SOFT)
box("cove_right", (HW - 0.13, HW + 0.03), (Y_NEAR + 0.1, Y_FAR - 0.1), COVE_Z, M_LED_SOFT)
box("cove_far", (-HW + 0.1, HW - 0.1), (Y_FAR - 0.13, Y_FAR + 0.03), COVE_Z, M_LED_SOFT)
box("cove_near", (-HW + 0.1, HW - 0.1), (Y_NEAR - 0.03, Y_NEAR + 0.13), COVE_Z, M_LED_SOFT)

# 매립 슬롯: 소핏에 박힌 어두운 가로 슬롯 (참조 사진에서 꺼진 슬롯은 검게 읽힌다)
for sx in (-1, 1):
    for yy in (-8.6, -7.4, 7.4, 8.6):
        box_at(f"slot_s_{sx}_{yy}", (sx * 3.3, yy, Z_SOFFIT + 0.02), (1.5, 0.16, 0.09), M_DARK)
for sx in (-1, 1):
    for yy in (-4.0, 0.0, 4.0):
        box_at(f"slot_o_{sx}_{yy}", (sx * 5.85, yy, Z_SOFFIT + 0.02), (0.16, 1.5, 0.09), M_DARK)
# 리세스 안쪽 매립 슬롯
for sx in (-1, 1):
    for yy in (-4.6, -1.5, 1.5, 4.6):
        box_at(f"slot_r_{sx}_{yy}", (sx * 2.6, yy, Z_HIGH + 0.02), (1.4, 0.15, 0.09), M_DARK)

# ── 실제 광원 (전부 카메라 비가시) ────────────────────────────────────────
# 발광 스트립만으로는 실내가 안 밝고, 반대로 균일 에어리어만 쓰면 소핏 밑면이 새까매진다.
# 3단 리그: ① 리세스 라이트박스(키) ② 코브 업라이트(소핏 밑면 워시) ③ 주변부 다운라이트.
LIGHT_SCALE = float(os.environ.get("BG3D_LIGHT", "1.0"))


def area(name, loc, sx_, sy_, energy, rot=(0, 0, 0)):
    bpy.ops.object.light_add(type="AREA", location=loc, rotation=rot)
    L = bpy.context.active_object
    L.name = name
    L.data.shape = "RECTANGLE"
    L.data.size = sx_
    L.data.size_y = sy_
    L.data.energy = energy * LIGHT_SCALE
    L.data.color = (1.0, 0.985, 0.96)
    L.visible_camera = False
    L.visible_glossy = False          # 바닥 반사에 흰 사각형이 뜨는 것 방지
    return L


# ① 리세스 라이트박스 — 중앙 리세스 천장 전체가 키 라이트 (참조 사진의 균일한 밝기)
area("key_recess", (0, 0, Z_HIGH - 0.06), 2 * RX - 0.6, 2 * RY - 0.6, 60)
# ② 천장 워시 — 방 전체 크기의 **위를 향한** 판. 이게 없으면 소핏 밑면이 새까매진다:
#    리세스 키는 아래로만 쏘고, 벽 쪽 코브는 소핏 안쪽(리세스 개구부)까지 못 닿기 때문.
#    (1차 렌더에서 실제로 리세스 챔퍼 코너가 검게 나왔다 — 이 워시가 그 수리다.)
area("wash_ceiling", (0, 0, Z_SOFFIT - 0.10), 2 * HW, Y_FAR - Y_NEAR, 250, rot=(math.pi, 0, 0))
# ③ 주변부 다운라이트 — 소핏 밑, 벽 쪽 바닥/벤치를 채운다
for nm, loc, sx_, sy_ in (
    ("down_l", (-5.8, 0, Z_SOFFIT - 0.05), 1.6, 16.0),
    ("down_r", (5.8, 0, Z_SOFFIT - 0.05), 1.6, 16.0),
    ("down_f", (0, 8.2, Z_SOFFIT - 0.05), 10.0, 2.2),
    ("down_n", (0, -8.2, Z_SOFFIT - 0.05), 10.0, 2.2),
):
    area(nm, loc, sx_, sy_, 40)

# ═══════════════════════════════════════════════════════════════════════════
# 3. 벽 대리석 패널 — 세로 조인트(심 라인)만 남기는 얕은 돌출 박스
# ═══════════════════════════════════════════════════════════════════════════
PANEL_Z = (0.13, 4.28)
# 조인트가 얕으면 흰 벽에서 심 라인이 아예 안 읽힌다(3차 렌더에서 측벽이 백지였다).
PW, GAP, PR = 2.55, 0.075, 0.055  # 패널 폭 / 조인트 간격 / 돌출


def wall_panels(prefix, along, fixed, sign, lo, hi, skip=()):
    """along='Y'면 좌우 벽(고정 X), 'X'면 앞뒤 벽(고정 Y). sign=+1은 실내가 +방향.
    패널은 벽 안쪽으로 0.03 파묻는다(동일 평면 acne 회피). skip은 개구부 구간 [(a,b),...]."""
    n = int((hi - lo) // (PW + GAP))
    used = n * (PW + GAP) - GAP
    start = lo + (hi - lo - used) / 2
    back = fixed - sign * 0.03
    for i in range(n):
        a = start + i * (PW + GAP)
        b = a + PW
        if any(not (b < s0 or a > s1) for s0, s1 in skip):
            continue
        if along == "Y":
            box(f"{prefix}_{i}", (min(back, fixed + sign * PR), max(back, fixed + sign * PR)),
                (a, b), PANEL_Z, M_PANEL)
        else:
            box(f"{prefix}_{i}", (a, b),
                (min(back, fixed + sign * PR), max(back, fixed + sign * PR)), PANEL_Z, M_PANEL)


wall_panels("panel_l", "Y", -HW, +1, Y_NEAR + 0.2, Y_FAR - 0.2)
wall_panels("panel_r", "Y", HW, -1, Y_NEAR + 0.2, Y_FAR - 0.2)
wall_panels("panel_n", "X", Y_NEAR, +1, -HW + 0.2, HW - 0.2, skip=((-1.45, 1.45),))

# ═══════════════════════════════════════════════════════════════════════════
# 4. 배면 벽(판사석 뒤) — 중앙 특징 패널 + 법원 휘장 + 금속 명패 + 출입구 2
# ═══════════════════════════════════════════════════════════════════════════
# 중앙 특징 패널 (사진: 판사석 뒤 살짝 밝고 테두리 리빌이 도는 큰 판)
#   테두리를 0.12 돌출시켜 리빌 그림자를 만든다 — 흰 벽에 흰 판이라 값 차이만으론 안 읽힌다.
box("backwall_feature", (-3.50, 3.50), (Y_FAR - 0.06, Y_FAR + 0.03), (1.55, 3.95), M_PANEL)
for a, b in ((-3.64, -3.46), (3.46, 3.64)):
    box(f"feature_reveal_v_{a}", (a, b), (Y_FAR - 0.18, Y_FAR + 0.03), (1.41, 4.09), M_PANEL)
for z0, z1 in ((1.41, 1.59), (3.91, 4.09)):
    box(f"feature_reveal_h_{z0}", (-3.64, 3.64), (Y_FAR - 0.18, Y_FAR + 0.03), (z0, z1), M_PANEL)
# 배면 벽 좌우 패널 — 출입구(X ±5.40~±6.60)를 피해 특징 패널과 문 사이에만 둔다
for i, (a, b) in enumerate([(-5.25, -3.80), (3.80, 5.25)]):
    box(f"panel_f_{i}", (a, b), (Y_FAR - 0.035, Y_FAR + 0.03), PANEL_Z, M_PANEL)

# 법원 휘장 (금속 원형 문양) — 랜드마크. 링 + 안쪽 디스크 2겹만, 글자·문양 디테일 없음
disc("seal_ring", (0, Y_FAR - 0.22, 3.36), 0.44, 0.07, M_GOLD)
disc("seal_core", (0, Y_FAR - 0.27, 3.36), 0.28, 0.06, M_METAL)
# 금속 명패 ("법 원") — props "금속제 명패". 글자는 안 새긴다(텍스처/디테일 금지)
box("nameplate", (-0.80, 0.80), (Y_FAR - 0.24, Y_FAR - 0.17), (2.56, 3.00), M_METAL)
box("nameplate_inset", (-0.72, 0.72), (Y_FAR - 0.28, Y_FAR - 0.23), (2.62, 2.94), M_DARK)

# 출입구 2 — 기보다 더 바깥. 어두운 개구부 + 얇은 리빌 프레임.
#   개구부/프레임을 벽 패널면(Y_FAR-0.065)보다 앞으로 빼야 한다 — 2차 렌더에서 벽 패널이
#   문을 덮어 배면 벽에 문이 아예 안 나왔다.
for sx in (-1, 1):
    cxd = sx * 6.0
    box(f"door_void_{sx}", (cxd - 0.60, cxd + 0.60), (Y_FAR - 0.10, Y_FAR + 0.30), (0.0, 2.62), M_DARK)
    box(f"door_head_{sx}", (cxd - 0.74, cxd + 0.74), (Y_FAR - 0.18, Y_FAR - 0.09), (2.62, 2.76), M_PANEL)
    for s2 in (-1, 1):
        box(f"door_jamb_{sx}_{s2}", (cxd + s2 * 0.60, cxd + s2 * 0.74),
            (Y_FAR - 0.18, Y_FAR - 0.09), (0.0, 2.76), M_PANEL)

# ═══════════════════════════════════════════════════════════════════════════
# 5. 입구 벽(방청석 뒤) — 리버스 뷰에서 "같은 방"으로 이어지게 하는 벽
# ═══════════════════════════════════════════════════════════════════════════
box("entry_void", (-1.15, 1.15), (Y_NEAR - 0.30, Y_NEAR + 0.10), (0.0, 2.62), M_DARK)
box("entry_mullion", (-0.05, 0.05), (Y_NEAR + 0.10, Y_NEAR + 0.15), (0.0, 2.62), M_METAL)
box("entry_head", (-1.30, 1.30), (Y_NEAR + 0.09, Y_NEAR + 0.18), (2.62, 2.76), M_PANEL)
for s2 in (-1, 1):
    box(f"entry_jamb_{s2}", (s2 * 1.15, s2 * 1.30), (Y_NEAR + 0.09, Y_NEAR + 0.18), (0.0, 2.76), M_PANEL)

# ═══════════════════════════════════════════════════════════════════════════
# 6. 판사석 — 단상 + 긴 대리석 데스크 + 상판 + 의자 3 + 모니터
# ═══════════════════════════════════════════════════════════════════════════
DAIS_Z = 0.35
box("dais", (-5.6, 5.6), (6.6, Y_FAR), (0.0, DAIS_Z), M_DESK)
box("dais_nose", (-5.6, 5.6), (6.52, 6.6), (0.0, DAIS_Z - 0.06), M_PANEL)

# 데스크는 2단 프로파일 — 낮은 앞 선반 + 높은 본체. 흰 대리석끼리라 실루엣 단차가 없으면
# 어느 각도에서도 "긴 흰 덩어리"로 뭉개진다(1차 렌더 관찰).
box("judge_desk", (-4.40, 4.40), (7.30, 8.50), (0.0, 1.22), M_DESK)
box("judge_top", (-4.58, 4.58), (7.20, 8.62), (1.22, 1.31), M_DESK)
box("judge_ledge", (-4.40, 4.40), (7.00, 7.30), (0.0, 0.86), M_DESK)
box("judge_ledge_top", (-4.52, 4.52), (6.92, 7.32), (0.86, 0.93), M_DESK)
box("judge_plinth", (-4.46, 4.46), (7.26, 8.54), (0.0, 0.10), M_PANEL)

# 의자 3 (중앙=판사, 등받이가 높다 / 좌우=배석)
for i, (cxc, back_top, w) in enumerate([(-2.25, 1.55, 0.52), (0.0, 1.72, 0.60), (2.25, 1.55, 0.52)]):
    box(f"chair_seat_{i}", (cxc - w / 2, cxc + w / 2), (8.75, 9.30), (0.78, 0.87), M_CHAIR)
    box(f"chair_post_{i}", (cxc - 0.07, cxc + 0.07), (8.96, 9.10), (DAIS_Z, 0.80), M_METAL)
    box(f"chair_base_{i}", (cxc - 0.26, cxc + 0.26), (8.77, 9.29), (DAIS_Z + 0.006, DAIS_Z + 0.055), M_METAL)
    box(f"chair_back_{i}", (cxc - w / 2, cxc + w / 2), (9.28, 9.40), (0.85, back_top), M_CHAIR)

# 데스크 위 모니터 (어두운 납작 박스 — 사진에 판사석 상판 위 검은 판들이 보인다)
for cxm in (-3.45, -1.70, 1.70, 3.45):
    box(f"monitor_{cxm}", (cxm - 0.30, cxm + 0.30), (7.86, 7.92), (1.31, 1.63), M_DARK)
    box(f"monitor_base_{cxm}", (cxm - 0.22, cxm + 0.22), (7.80, 8.00), (1.31, 1.34), M_METAL)

# ═══════════════════════════════════════════════════════════════════════════
# 7. 기 2개 — 좌 태극기 / 우 남색 법원기 (판사석 양 끝 바깥, 단상 위)
# ═══════════════════════════════════════════════════════════════════════════
for sx, cloth in ((-1, "taeguk"), (1, "court")):
    px, py = sx * 4.92, 8.95
    cyl(f"flagbase_{sx}", (px, py, DAIS_Z + 0.10), 0.22, 0.18, M_DARK)
    cyl(f"flagpole_{sx}", (px, py, DAIS_Z + 1.85), 0.035, 3.50, M_METAL)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.085, location=(px, py, DAIS_Z + 3.66),
                                         segments=20, ring_count=10)
    fin = bpy.context.active_object
    fin.name = f"flagfinial_{sx}"
    fin.data.materials.append(M_GOLD)
    # 깃발 천 — 폴에 세로로 늘어진 얇은 판 (바람 없음, 실내기)
    fx0, fx1 = (px + 0.05, px + 0.62) if sx < 0 else (px - 0.62, px - 0.05)
    cloth_mat = M_F_WHITE if cloth == "taeguk" else M_F_NAVY
    box(f"flagcloth_{sx}", (min(fx0, fx1), max(fx0, fx1)), (py - 0.02, py + 0.02),
        (DAIS_Z + 1.92, DAIS_Z + 3.52), cloth_mat)
    fcx = (fx0 + fx1) / 2
    if cloth == "taeguk":
        # 태극 문양 근사 — 적/청 반쪽 디스크 2개 (도형만, 괘·디테일 없음)
        disc(f"taeguk_r_{sx}", (fcx, py - 0.03, DAIS_Z + 2.80), 0.15, 0.02, M_F_RED)
        disc(f"taeguk_b_{sx}", (fcx - 0.05, py - 0.035, DAIS_Z + 2.72), 0.13, 0.02, M_F_BLUE)
    else:
        disc(f"courtemblem_{sx}", (fcx, py - 0.03, DAIS_Z + 2.80), 0.16, 0.02, M_GOLD)

# ═══════════════════════════════════════════════════════════════════════════
# 8. 측면 단 (검사석/변호인석 자리) — 낮은 단 + 유리 난간
#    참조 사진 좌우 끝에 유리판 얹힌 낮은 벽이 보인다
# ═══════════════════════════════════════════════════════════════════════════
SB_Y0, SB_Y1 = 4.20, 6.30
for sx in (-1, 1):
    xi, xo = sx * 4.70, sx * 6.75          # inner / outer
    lo, hi = min(xi, xo), max(xi, xo)
    box(f"sidebox_plat_{sx}", (lo, hi), (SB_Y0, SB_Y1), (0.0, 0.28), M_DESK)
    # 안쪽 면 유리 난간
    box(f"sidebox_glass_in_{sx}", (xi - 0.02, xi + 0.02), (SB_Y0, SB_Y1), (0.24, 1.13), M_GLASS)
    box(f"sidebox_rail_in_{sx}", (xi - 0.045, xi + 0.045), (SB_Y0, SB_Y1), (1.11, 1.18), M_METAL)
    # 앞쪽 면 유리 난간
    box(f"sidebox_glass_fr_{sx}", (lo, hi), (SB_Y0 - 0.02, SB_Y0 + 0.02), (0.24, 1.13), M_GLASS)
    box(f"sidebox_rail_fr_{sx}", (lo, hi), (SB_Y0 - 0.045, SB_Y0 + 0.045), (1.11, 1.18), M_METAL)
    # 멀리언 (모서리 + 중간 1)
    for yy in (SB_Y0, (SB_Y0 + SB_Y1) / 2, SB_Y1):
        box(f"sidebox_mull_{sx}_{yy}", (xi - 0.038, xi + 0.038), (yy - 0.038, yy + 0.038),
            (0.24, 1.16), M_METAL)
    # 단 위 데스크 (검사석/변호인석 상판)
    box(f"sidebox_desk_{sx}", (lo + 0.20, hi - 0.20), (4.75, 5.85), (0.24, 0.74), M_DESK)

# ═══════════════════════════════════════════════════════════════════════════
# 9. 유리 바(방청석 구획) — 세로 멀리언 달린 유리 칸막이, 중앙 1.2m 게이트
# ═══════════════════════════════════════════════════════════════════════════
BAR_Y = 0.40
BAR_TOP = 1.35
for sx in (-1, 1):
    a, b = sx * 0.60, sx * 6.80
    lo, hi = min(a, b), max(a, b)
    box(f"bar_glass_{sx}", (lo, hi), (BAR_Y - 0.022, BAR_Y + 0.022), (0.04, BAR_TOP - 0.04), M_GLASS)
    box(f"bar_rail_{sx}", (lo, hi), (BAR_Y - 0.05, BAR_Y + 0.05), (BAR_TOP - 0.06, BAR_TOP), M_METAL)
    box(f"bar_foot_{sx}", (lo, hi), (BAR_Y - 0.05, BAR_Y + 0.05), (0.0, 0.07), M_METAL)
    span = hi - lo
    nm = 3          # 멀리언 과다 = 울타리처럼 읽힌다(1차 렌더 관찰) → 패널당 3칸으로
    for k in range(nm + 1):
        mx = lo + span * k / nm
        box(f"bar_mull_{sx}_{k}", (mx - 0.032, mx + 0.032), (BAR_Y - 0.045, BAR_Y + 0.045),
            (0.0, BAR_TOP), M_METAL)

# ═══════════════════════════════════════════════════════════════════════════
# 10. 증인석 — 유리 박스 (props "유리 소재의 증인석"). 바 너머 중앙, 판사석을 향한다
# ═══════════════════════════════════════════════════════════════════════════
WX, WY = 0.0, 2.90
WHW, WHD = 0.62, 0.58   # 반폭 / 반깊이
WTOP = 1.14
box("witness_floorplate", (WX - WHW - 0.08, WX + WHW + 0.08), (WY - WHD - 0.08, WY + WHD + 0.08),
    (0.0, 0.06), M_METAL)
for sx in (-1, 1):
    box(f"witness_side_{sx}", (WX + sx * WHW - 0.022, WX + sx * WHW + 0.022),
        (WY - WHD, WY + WHD), (0.04, WTOP), M_GLASS)
for sy in (-1, 1):
    box(f"witness_end_{sy}", (WX - WHW, WX + WHW),
        (WY + sy * WHD - 0.022, WY + sy * WHD + 0.022), (0.04, WTOP), M_GLASS)
box("witness_top", (WX - WHW - 0.12, WX + WHW + 0.12), (WY - WHD - 0.12, WY + WHD + 0.12),
    (WTOP - 0.01, WTOP + 0.05), M_GLASS)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(f"witness_post_{sx}_{sy}", (WX + sx * WHW - 0.04, WX + sx * WHW + 0.04),
            (WY + sy * WHD - 0.04, WY + sy * WHD + 0.04), (0.0, WTOP + 0.05), M_METAL)

# ═══════════════════════════════════════════════════════════════════════════
# 11. 방청 벤치 — 등받이 없는 기하학적 석재 벤치, 중앙 통로 좌우 5행
# ═══════════════════════════════════════════════════════════════════════════
AISLE = 1.30
BENCH_X = 6.50
SEAT_TOP = 0.46
for r, by in enumerate((-1.80, -3.40, -5.00, -6.60, -8.20)):
    for sx in (-1, 1):
        a, b = sx * AISLE, sx * BENCH_X
        lo, hi = min(a, b), max(a, b)
        box(f"bench_seat_{r}_{sx}", (lo, hi), (by - 0.28, by + 0.28),
            (SEAT_TOP - 0.14, SEAT_TOP), M_BENCH)
        box(f"bench_apron_{r}_{sx}", (lo + 0.10, hi - 0.10), (by - 0.21, by + 0.21),
            (SEAT_TOP - 0.24, SEAT_TOP - 0.12), M_BENCH)
        for k, lx in enumerate((lo + 0.55, hi - 0.55)):
            box(f"bench_leg_{r}_{sx}_{k}", (lx - 0.26, lx + 0.26), (by - 0.25, by + 0.25),
                (0.0, SEAT_TOP - 0.22), M_BENCH)

# ═══════════════════════════════════════════════════════════════════════════
# 12. 카메라 5대 — DB 각도 수요(eye 39 / low 10 / high 3)와 뷰 클러스터에서 유도
# ═══════════════════════════════════════════════════════════════════════════
VIEWS = [
    # (파일명, 카메라 위치, 타겟, 초점거리mm, 설명)
    ("view_bench_eye", (0.0, -7.60, 1.58), (0.0, 8.40, 1.45), 24,
     "판사석 정면 eye_level — 방청석 뒤 중앙축 와이드(참조 사진과 직접 대조 가능한 구도)"),
    ("view_gallery_eye", (0.90, 6.95, 1.62), (-0.20, -9.40, 1.42), 24,
     "방청석 리버스 eye_level — 판사석에서 입구 벽을 본다(실험의 급소)"),
    # 카메라를 유리 바 **너머(법정 안쪽)** 빈 바닥에 둔다 — 방청석 쪽(Y<-1.5)에 두면
    # 방청 벤치 슬래브 안에 카메라가 파묻혀 화면 절반이 새까맣게 나온다(4차 렌더에서 발생).
    ("view_witness_low", (2.75, 0.75, 0.40), (-0.10, 4.20, 1.95), 24,
     "증인석 low_angle — 유리 증인석을 아래에서 올려다보고 판사석·천장 리세스가 뒤에 걸린다"),
    ("view_room_high", (2.75, -6.20, 4.05), (-0.40, 3.30, 0.55), 20,
     "법정 전체 high_angle — 방청 통로/유리 바/단상 배치를 한 장에"),
    ("view_wall_eye", (-5.00, 0.50, 1.55), (5.60, 8.20, 2.00), 28,
     "측벽·명패 eye_level — 우측 벽 대리석 패널과 배면 명패/휘장을 한 프레임에"),
]

bpy.ops.object.camera_add(location=(0, 0, 1.5))
cam = bpy.context.active_object
cam.name = "view_cam"
cam.data.sensor_width = 36.0
scene.camera = cam

rendered = []
for name, loc, tgt, lens, _desc in VIEWS:
    if ONLY and name not in ONLY:
        continue
    cam.location = Vector(loc)
    cam.data.lens = lens
    d = Vector(tgt) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUTDIR, f"{name}.png")
    print(f"[bg3d] render {name} loc={loc} target={tgt} lens={lens}mm samples={SAMPLES}")
    bpy.ops.render.render(write_still=True)
    rendered.append(name)

print(f"[bg3d] DONE → {OUTDIR} :: {rendered}", file=sys.stderr)

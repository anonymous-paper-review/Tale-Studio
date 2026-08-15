# 블록아웃 프리비즈 v3 — sh_04_16 (v2 + 전경 기둥 열, 시차 실험용, 7s)
#
# v2(qual2-fullmotion/blockout_v2.py) 대비 변경 **딱 1축**:
#   ③ 전경(foreground) 기둥 열 추가 — 카메라와 러너 사이(-Y 쪽)에 낮은 짙은 회색 박스 열.
#      목적: 카메라에 가까운 물체가 빠르게 흘러야 한다(시차/parallax)는 정보를 영상 모델에 전달.
#      측면 트래킹(2~7s)에서 카메라 깊이 2.3 m vs 러너 6.0 m → 화면 흐름 속도 2.6배.
#      나머지(카메라 안무·복도 벽·러너·속도·7s 길이·렌더 설정)는 v2 원본 그대로 — 변인 1개.
#
# ── 이하 v2 원본 주석 ──
# v1(blockout_sh_04_16.py) 대비 변경 2축 — 1차 정성평가 관찰(qualitative/notes.md) 대응:
#   ① 전 구간 카메라 안무: v1은 측면 트래킹만 → (c)가 시작 구도를 스스로 지어냈다.
#      v2는 시간 축에 안무를 박는다:
#        0~1s  = START 정면 도어웨이 구도 근사 — 카메라가 러너 정면(+X 전방)에서
#                러너보다 약간 느리게 후퇴(6.0m→4.8m, 러너가 서서히 다가옴)
#        1~2s  = 측면 스윙 — 러너 중심 궤도 선회 φ 0°→-90° (smoothstep), 반경 4.8→6.0
#        2~7s  = v1과 동일한 측면 동속 트래킹 (화면 오른쪽 질주, 배경 왼쪽 흐름)
#   ② 배경을 좁은 복도 정체로: v1 개방 박스 열 → (c)의 배경이 개방 공간으로 이탈.
#      v2는 회색 박스를 복도 벽 양측 열(내벽 간격 4.8m) + 천장 슬랩 + 시작 문틀로 배치.
#      측면 phase에서 카메라 쪽(-Y) 벽은 진입 구간(x≤9)에서 끝난다(와일드 월 —
#      측면 카메라 시야에 원래 안 잡히는 벽. 카메라·시선 경로와 교차 없음을 수치 확인).
#      벽 세그먼트는 높이 변화 + 교대 인셋(0.25m)으로 심 라인만 남긴다.
#
# 블록아웃 3규칙 유지: ① 단순 도형만(캡슐 러너·박스 벽·플레인 바닥) ② 색으로 종류만
#   구분(러너 주황 / 구조물 회색 / 바닥 밝은 회색) ③ 디테일·질감 금지 (Workbench 플랫).
#
# 좌표계: 러너 +X 전진(측면 카메라 기준 화면 오른쪽), 측면 카메라는 -Y에서 +Y를 바라봄.
#   정면 카메라는 러너 전방 +X에서 -X를 바라봄(rot_z=+90°). 스윙은 러너 중심 원호,
#   rot_z = φ + 90° (항상 러너 조준). 달리기 5.5 m/s × 7 s = 38.5 m.
#
# 실행: blender --background \
#         --python research/experiments/previz-video-reference-ab/qual5-parallax/blockout_v3.py
#   (이 머신 실측 경로: /opt/homebrew/bin/blender — Blender 5.2.0 LTS)
import bpy
import math
import os

FPS = 24
DURATION_S = 7
FRAMES = FPS * DURATION_S  # 168
RUN_SPEED = 5.5            # m/s — 달리기(스프린트 하한, v1과 동일)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blockout_v3.mp4")

# ── 씬 리셋 ──
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.resolution_x = 1280
scene.render.resolution_y = 720

# Workbench 플랫 렌더 — 오브젝트 색 그대로, 질감 없음 (블록아웃 3규칙)
scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "OBJECT"
shading.show_cavity = False
scene.display.render_aa = "8"
world = bpy.data.worlds.new("World")
world.color = (0.85, 0.87, 0.90)  # 밝은 회색 하늘
scene.world = world

# h264 mp4 (Blender 5.x: media_type 선분리 후 FFMPEG 선택)
if hasattr(scene.render.image_settings, "media_type"):
    scene.render.image_settings.media_type = "VIDEO"
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.ffmpeg.audio_codec = "NONE"
scene.render.filepath = OUT


def flat_object(mesh_op, name, color, location=(0, 0, 0), scale=(1, 1, 1), **kwargs):
    mesh_op(location=location, **kwargs)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.color = (*color, 1.0)
    return obj


ORANGE = (1.0, 0.42, 0.08)
GRAY_BOX = (0.52, 0.52, 0.54)
GRAY_GROUND = (0.70, 0.70, 0.70)
# v3 추가 — 전경 전용 차콜(거의 검정). 0.24 짙은 회색으로 먼저 렌더했더니 카메라를 정면으로
#   보는 면이 (94,98,104)로 지면(100,102,104)과 거의 같아 전경이 사라졌다(Workbench STUDIO는
#   카메라를 향한 면에 키라이트를 강하게 먹인다). 실측 후 대비 확보용으로 낮춘 값.
GRAY_FG = (0.10, 0.10, 0.12)

# ── 지면: 플랫 플레인 ──
flat_object(bpy.ops.mesh.primitive_plane_add, "ground", GRAY_GROUND,
            location=(20, 0, 0), size=1, scale=(300, 100, 1))

# ── 러너: 주황 캡슐 (실린더 몸통 + 구 머리, join → 단일 도형, v1 동일) ──
flat_object(bpy.ops.mesh.primitive_cylinder_add, "runner_body", ORANGE,
            location=(0, 0, 0.75), radius=0.28, depth=1.5)
body = bpy.context.active_object
flat_object(bpy.ops.mesh.primitive_uv_sphere_add, "runner_head", ORANGE,
            location=(0, 0, 1.5), radius=0.28, segments=24, ring_count=12)
head = bpy.context.active_object
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
head.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
runner = bpy.context.active_object
runner.name = "runner"
runner.color = (*ORANGE, 1.0)

# ── 좁은 복도: 양측 벽 열 + 천장 + 시작 문틀 (전부 회색 박스 — 결정적 배치) ──
WALL_INNER = 2.4   # 벽 내면 |y| — 복도 폭 4.8 m
WALL_T = 1.0       # 벽 두께
SEG_LEN = 5.7      # 벽 세그먼트 길이

# 먼 벽(+Y): 전 구간 x -9..48 — 측면 phase의 배경. 높이 변화 + 교대 인셋(심 라인 파랄락스)
far_heights = [5.2, 6.0, 4.6, 5.6, 4.9, 6.3, 5.0, 5.8, 4.7, 6.1]
for i, h in enumerate(far_heights):
    x = -9 + SEG_LEN * (i + 0.5)
    inset = 0.25 if i % 2 == 0 else 0.0   # 교대 인셋 → 세그먼트 경계에 세로 심 라인
    flat_object(bpy.ops.mesh.primitive_cube_add, f"wall_far_{i}", GRAY_BOX,
                location=(x, WALL_INNER + WALL_T / 2 + inset, h / 2),
                size=1, scale=(SEG_LEN, WALL_T, h))

# 먼 벽 필라스터: 세그먼트 경계마다 45° 회전 돌출 기둥 — 측면 phase 배경 흐름 가독용
#   파랄락스 (v1의 박스 간격 역할). 45° 면은 정면 벽과 셰이딩이 달라 어느 각도에서도
#   보인다 (Workbench 스튜디오 광은 면 방향으로만 명암). 단순 박스 회전 — 디테일 아님.
for i in range(1, len(far_heights)):
    x = -9 + SEG_LEN * i
    flat_object(bpy.ops.mesh.primitive_cube_add, f"pilaster_far_{i}", GRAY_BOX,
                location=(x, WALL_INNER - 0.05, 2.75), size=1,
                scale=(0.55, 0.55, 5.5), rotation=(0, 0, math.pi / 4))

# 가까운 벽(-Y): 진입 구간 x -9..9 만 — 정면 도어웨이 구도의 좌측 벽.
#   x>9 부재 = 와일드 월(측면 트래킹 카메라가 서는 자리). 스윙 카메라 x는 항상 ≥10.3,
#   시선(카메라→러너)의 x=9 교차점 y는 항상 > -2.4 — 벽과 교차하지 않음 (수치 확인).
near_heights = [5.4, 4.8, 5.9]
for i, h in enumerate(near_heights):
    x = -9 + 6.0 * (i + 0.5)
    inset = 0.25 if i % 2 == 1 else 0.0
    flat_object(bpy.ops.mesh.primitive_cube_add, f"wall_near_{i}", GRAY_BOX,
                location=(x, -(WALL_INNER + WALL_T / 2 + inset), h / 2),
                size=1, scale=(6.0, WALL_T, h))

# 가까운 벽 필라스터: 진입 구간 대칭 리듬 (정면 phase 깊이 큐)
for i, x in enumerate((-3.0, 3.0)):
    flat_object(bpy.ops.mesh.primitive_cube_add, f"pilaster_near_{i}", GRAY_BOX,
                location=(x, -(WALL_INNER - 0.05), 2.75), size=1,
                scale=(0.55, 0.55, 5.5), rotation=(0, 0, math.pi / 4))

# 천장 슬랩: 진입 구간 위 x -9..14 (정면 phase 시야 전부 덮음 — 하늘 이탈 차단)
flat_object(bpy.ops.mesh.primitive_cube_add, "ceiling", GRAY_BOX,
            location=(2.5, 0, 3.2), size=1, scale=(23, 6.8, 0.4))

# 시작 문틀: 러너 시작 바로 뒤 x=-1 — START의 "문틀 통과 직후" 근사 (잼 2 + 린텔)
for sy in (+1.5, -1.5):
    flat_object(bpy.ops.mesh.primitive_cube_add, f"door_jamb_{'l' if sy > 0 else 'r'}",
                GRAY_BOX, location=(-1, sy, 1.3), size=1, scale=(0.5, 0.9, 2.6))
flat_object(bpy.ops.mesh.primitive_cube_add, "door_lintel", GRAY_BOX,
            location=(-1, 0, 2.8), size=1, scale=(0.5, 4.0, 0.4))

# ── [v3 유일 추가] 전경 기둥 열 — 시차(parallax) 전달용 ────────────────────────
# 배치 근거 (측면 트래킹 phase C: 카메라 (x_runner, -6, 1.1), 시선 +Y, 35mm/36mm 센서):
#   · 깊이 — 기둥 y=-4.00 → 카메라에서 2.00 m. 러너는 6.00 m. 화면 흐름 속도 정확히 3.0배.
#   · 높이 기준은 러너의 **화면상 실측**이다 — v2 러너는 join 원점 오프셋 탓에 절반이 지면
#     아래로 묻혀 있어(캡슐 전체 1.78 m가 아니라) 눈에 보이는 꼭대기가 z≈1.03 m다.
#     렌더 프레임에서 주황 픽셀 bbox로 실측: 화면 높이의 17.8%(발)~47.8%(머리)를 차지.
#     기둥을 러너 실측 높이에 맞춰 낮게 깎은 이유 — 1.0 m 기둥은 러너를 8할 가린다(1차 렌더로 확인).
#   · 프레임 점유 — d=2.00에서 가시 폭 2.06 m. 폭 0.45 m = 화면 폭의 22%.
#     높이 0.85/0.72 m = 화면 하단부터 27.9%/16.7%까지 → 높은 쪽도 러너 하단 34%만 가리고
#     낮은 쪽은 러너 발밑(17.8%)에도 못 미쳐 0% 가림. 몸통·머리는 상시 노출.
#   · 관통 없음 (수치 확인) — 카메라 경로 전 구간 x∈[6.0, 38.27], y∈[-6.0, 0.0].
#     y가 기둥 띠(±0.9 m)에 드는 구간은 스윙 중 x∈[11.80, 12.14]뿐이고 첫 기둥은 x=14.
#     전 프레임 × 전 기둥 최소 수평 거리 = 1.705 m (t=1.458s, 기둥 x=14). 시작 x를 14로 잡은 이유.
#   · 시작 벽·천장과도 무간섭 — 가까운 벽/천장은 x≤14, 기둥은 z≤0.85 (천장은 z≥3.0).
# 블록아웃 3규칙 유지: 단순 박스만 / 색으로 종류만 구분 / 질감·디테일 없음.
FG_Y = -4.00        # 기둥 중심 y — 카메라(-6.0)와 러너(0.0) 사이
FG_W = 0.45         # x 폭
FG_D = 0.30         # y 두께
FG_X0 = 14.0        # 첫 기둥 x (스윙 카메라 최대 x 12.14에서 1.7 m 이격)
FG_GAP = 3.0        # 간격 — 5.5 m/s에서 0.545 s마다 하나씩 통과 (기둥 1개당 화면 체류 0.456 s)
FG_HEIGHTS = (0.85, 0.72)   # 교대 높이 — 높은 쪽은 러너 발치를 스치고 낮은 쪽은 프레임 하단만 스침
for i in range(10):          # x = 14 … 41 (카메라 종점 38.27 너머까지 덮음)
    h = FG_HEIGHTS[i % 2]
    flat_object(bpy.ops.mesh.primitive_cube_add, f"fg_post_{i}", GRAY_FG,
                location=(FG_X0 + FG_GAP * i, FG_Y, h / 2), size=1,
                scale=(FG_W, FG_D, h))
# ─────────────────────────────────────────────────────────────────────────────

# ── 카메라 ──
bpy.ops.object.camera_add(location=(6.0, 0, 1.1), rotation=(math.pi / 2, 0, math.pi / 2))
cam = bpy.context.active_object
cam.name = "choreo_cam"
cam.data.lens = 35
scene.camera = cam


def smoothstep(s):
    return s * s * (3.0 - 2.0 * s)


# ── 애니메이션: 프레임별 키프레임 — 러너 전진 + 카메라 3-phase 안무 ──
# 새 키프레임 기본 보간 LINEAR — 프레임별 샘플이 곧 궤적 (5.x 슬롯 액션에서도 유효)
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
STRIDE_HZ = 3.0   # 보폭 주기 — 스프린트 스텝 감각 (v1 동일)
FRONT_D0 = 6.0    # t=0 정면 거리
FRONT_D1 = 4.8    # t=1 정면 거리 — 러너가 1.2 m 다가옴 (후퇴가 러너보다 약간 느림)
SIDE_R = 6.0      # 측면 트래킹 거리 (v1 동일)
for f in range(1, FRAMES + 1):
    t = (f - 1) / FPS
    x = RUN_SPEED * t
    bob = 0.10 * abs(math.sin(math.pi * STRIDE_HZ * t))
    runner.location = (x, 0, bob)
    runner.rotation_euler = (0, 0.12, 0)  # 전경사 — 질주 감각 (v1 동일)
    runner.keyframe_insert(data_path="location", frame=f)
    runner.keyframe_insert(data_path="rotation_euler", frame=f)

    if t < 1.0:            # phase A — 정면 도어웨이 (러너 전방에서 후퇴)
        phi = 0.0
        r = FRONT_D0 + (FRONT_D1 - FRONT_D0) * t
    elif t < 2.0:          # phase B — 측면 스윙 (러너 중심 궤도, smoothstep 완화)
        ss = smoothstep(t - 1.0)
        phi = -0.5 * math.pi * ss
        r = FRONT_D1 + (SIDE_R - FRONT_D1) * ss
    else:                  # phase C — 측면 동속 트래킹 (v1 동일 구도)
        phi = -0.5 * math.pi
        r = SIDE_R
    cam.location = (x + r * math.cos(phi), r * math.sin(phi), 1.1)
    cam.rotation_euler = (math.pi / 2, 0, phi + math.pi / 2)  # 항상 러너 조준
    cam.keyframe_insert(data_path="location", frame=f)
    cam.keyframe_insert(data_path="rotation_euler", frame=f)

# 선형 보간 재확인 (구 API가 살아있으면 한 번 더 강제 — 실패해도 preference로 이미 LINEAR)
for obj in (runner, cam):
    try:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    except (AttributeError, TypeError):
        pass

bpy.ops.render.render(animation=True)
print(f"DONE → {OUT}")

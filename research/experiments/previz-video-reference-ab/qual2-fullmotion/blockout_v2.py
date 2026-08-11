# 블록아웃 프리비즈 v2 — sh_04_16 (전 구간 카메라 안무 + 좁은 복도 정체, 7s)
#
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
# 실행: /Applications/Blender.app/Contents/MacOS/Blender --background \
#         --python research/experiments/previz-video-reference-ab/qual2-fullmotion/blockout_v2.py
import bpy
import math
import os

FPS = 24
DURATION_S = 7
FRAMES = FPS * DURATION_S  # 168
RUN_SPEED = 5.5            # m/s — 달리기(스프린트 하한, v1과 동일)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blockout_v2.mp4")

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

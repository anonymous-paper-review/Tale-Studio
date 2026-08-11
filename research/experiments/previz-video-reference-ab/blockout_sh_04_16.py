# 블록아웃 프리비즈 — sh_04_16 (질주 / 측면 tracking, 7s)
#
# 목표: 동결 T1 프롬프트의 카메라절과 방향·속도가 일치하는 카메라 움직임 참조.
#   "Camera: tracks steady with the subject toward screen right (background flows
#    toward screen left). Moderate amplitude, spread evenly over the full 7 seconds."
#
# 블록아웃 3규칙 (외부 검증): ① 피사체는 단순 도형만 — 러너 = 주황 캡슐(실린더+구),
#   배경 건물 = 회색 박스, 지면 = 플랫 플레인 ② 색으로 종류만 구분 ③ 디테일·질감 금지.
#
# 좌표계: 러너는 +X로 전진(카메라 기준 화면 오른쪽), 카메라는 -Y에서 +Y를 바라보며
#   러너와 동속 +X 이동 → 배경은 화면 왼쪽으로 흐른다. 달리기 속도 5.5 m/s × 7 s.
#
# 실행: /Applications/Blender.app/Contents/MacOS/Blender --background --python blockout_sh_04_16.py
import bpy
import math

FPS = 24
DURATION_S = 7
FRAMES = FPS * DURATION_S  # 168
RUN_SPEED = 5.5            # m/s — 달리기(스프린트 하한)
OUT = bpy.path.abspath("//qualitative/blockout.mp4")

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
            location=(25, 15, 0), size=1, scale=(300, 100, 1))

# ── 러너: 주황 캡슐 (실린더 몸통 + 구 머리, join → 단일 도형) ──
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

# ── 배경 건물: 회색 박스 열 (러너 뒤편 +Y, 파랄락스용 높이 변화 — 결정적 배치) ──
box_specs = [  # (x, y, w, d, h) — 유사난수 대신 고정 좌표 (재현성). 간격을 둬 배경 흐름 가독 확보
    (-15, 22, 6, 6, 10), (-4, 26, 7, 6, 16), (7, 21, 5, 5, 7), (18, 25, 8, 7, 13),
    (29, 22, 6, 5, 9), (40, 27, 7, 7, 18), (51, 21, 5, 5, 8), (62, 25, 7, 6, 14),
    (73, 22, 6, 6, 10), (84, 26, 7, 6, 16),
]
for i, (x, y, w, d, h) in enumerate(box_specs):
    flat_object(bpy.ops.mesh.primitive_cube_add, f"bldg_{i}", GRAY_BOX,
                location=(x, y, h / 2), size=1, scale=(w, d, h))

# ── 카메라: 측면 트래킹 — 러너와 동속 +X, -Y에서 +Y를 바라봄 ──
bpy.ops.object.camera_add(location=(0, -6, 1.1), rotation=(math.pi / 2, 0, 0))
cam = bpy.context.active_object
cam.name = "tracking_cam"
cam.data.lens = 35
scene.camera = cam

# ── 애니메이션: 프레임별 키프레임 (러너 전진 + 달리기 바운스, 카메라 동속 트래킹) ──
# 새 키프레임 기본 보간을 LINEAR로 — steady 속도 보장 (5.x 슬롯 액션에서도 유효한 경로)
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
STRIDE_HZ = 3.0  # 보폭 주기 — 스프린트 스텝 감각
for f in range(1, FRAMES + 1):
    t = (f - 1) / FPS
    x = RUN_SPEED * t
    bob = 0.10 * abs(math.sin(math.pi * STRIDE_HZ * t))
    lean = 0.12  # 전경사 — 질주 감각 (도형 기울기만, 디테일 아님)
    runner.location = (x, 0, bob)
    runner.rotation_euler = (0, lean, 0)
    runner.keyframe_insert(data_path="location", frame=f)
    runner.keyframe_insert(data_path="rotation_euler", frame=f)
    cam.location = (x, -6, 1.1)  # 정확히 동속 — moderate/steady tracking
    cam.keyframe_insert(data_path="location", frame=f)

# 선형 보간 재확인 (구 API가 살아있으면 한 번 더 강제 — 실패해도 위 preference로 이미 LINEAR)
for obj in (runner, cam):
    try:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    except (AttributeError, TypeError):
        pass

bpy.ops.render.render(animation=True)
print(f"DONE → {OUT}")

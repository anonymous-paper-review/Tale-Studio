import bpy
import json
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'outputs')
SUMMARY_PATH = os.path.join(ROOT, 'text', 'summary.json')
FPS = 24
FRAMES = 120
WIDTH = 640
HEIGHT = 360

CASES = {
    'hand_in_frame': {'kind': 'hand', 'move': False, 'target_x': 1.15, 'label': 'HAND / IN FRAME'},
    'hand_off_frame': {'kind': 'hand', 'move': True, 'target_x': 3.4, 'label': 'HAND / OFF FRAME'},
    'gaze_in_frame': {'kind': 'gaze', 'move': False, 'target_x': 1.1, 'label': 'GAZE / IN FRAME'},
    'gaze_off_frame': {'kind': 'gaze', 'move': True, 'target_x': 3.4, 'label': 'GAZE / OFF FRAME'},
    'reaction_hold': {'kind': 'reaction', 'move': False, 'target_x': 0, 'label': 'REACTION / HOLD'},
    'reaction_push_in': {'kind': 'reaction', 'move': True, 'target_x': 0, 'label': 'REACTION / PUSH IN'},
}
TEXT_RESULTS = {item['id']: item for item in json.load(open(SUMMARY_PATH))['results']}
for _case_id, _case in CASES.items():
    _case['camera_type'] = TEXT_RESULTS[_case_id]['camera_type']
    _case['move'] = _case['camera_type'] != 'static'


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def mat(name, color, emission=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.55
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission
    return m


def cube(name, loc, scale, material, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('soft_edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    o.data.materials.append(material)
    return o


def sphere(name, loc, radius, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def animate_linear(obj, path):
    for frame, loc in path:
        obj.location = loc
        obj.keyframe_insert(data_path='location', frame=frame)


def setup_camera(move_kind, target_x):
    bpy.ops.object.camera_add(location=(0, -10.5, 3.4))
    camera = bpy.context.object
    camera.data.lens = 48
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera
    if move_kind == 'pan':
        camera.rotation_mode = 'XYZ'
        look_at(camera, (0.0, 0.2, 1.6))
        camera.keyframe_insert(data_path='rotation_euler', frame=1)
        look_at(camera, (target_x, 0.2, 1.6))
        camera.keyframe_insert(data_path='rotation_euler', frame=FRAMES)
    elif move_kind == 'dolly':
        start = camera.location.copy()
        end = Vector((0, -6.5, 2.8))
        animate_linear(camera, [(1, start), (FRAMES, end)])
        look_at(camera, (0, 0.2, 1.6))
    else:
        look_at(camera, (0.0, 0.2, 1.6))
    return camera


def build_case(case_id, spec):
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = FRAMES
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.02)

    floor_mat = mat('floor', (0.04, 0.07, 0.10))
    wall_mat = mat('wall', (0.08, 0.12, 0.17))
    subject_mat = mat('subject', (0.18, 0.45, 0.95), emission=0.08)
    target_mat = mat('target', (0.95, 0.18, 0.08), emission=0.15)
    gaze_mat = mat('gaze_target', (0.18, 0.9, 0.42), emission=0.2)
    neutral_mat = mat('neutral', (0.65, 0.68, 0.72))

    cube('floor', (0, 1.5, -0.2), (5.5, 5.5, 0.2), floor_mat, bevel=0)
    cube('back_wall', (0, 3.5, 2.5), (5.5, 0.15, 2.5), wall_mat)
    for x in (-3.0, -1.5, 0, 1.5, 3.0):
        cube(f'wall_line_{x}', (x, 3.25, 2.5), (0.025, 0.04, 2.3), neutral_mat, bevel=0.01)

    # Simple mannequin: blue body + head, deliberately identity-free.
    body = cube('subject_body', (0, 0.5, 1.35), (0.42, 0.25, 0.85), subject_mat)
    head = sphere('subject_head', (0, 0.45, 2.45), 0.42, subject_mat)
    head.scale = (0.85, 0.85, 1.0)
    arm = cube('subject_arm', (-0.48, 0.15, 1.65), (0.12, 0.12, 0.52), subject_mat, bevel=0.05)

    if spec['kind'] == 'hand':
        target = cube('red_lever', (spec['target_x'], 0.35, 1.55), (0.18, 0.18, 0.65), target_mat)
        cube('lever_base', (spec['target_x'], 0.35, 0.75), (0.38, 0.28, 0.12), target_mat)
        animate_linear(arm, [(1, (-0.48, 0.15, 1.65)), (FRAMES, (spec['target_x'] - 0.35, 0.15, 1.65))])
        cam = setup_camera('pan' if spec['move'] else 'static', spec['target_x'])
    elif spec['kind'] == 'gaze':
        target = sphere('green_target', (spec['target_x'], 0.4, 2.2), 0.32, gaze_mat)
        # A short orange beam shows the intended gaze direction.
        beam = cube('gaze_beam', (spec['target_x'] / 2, 0.1, 2.2), (abs(spec['target_x']) / 2, 0.025, 0.025), gaze_mat, bevel=0.01)
        cam = setup_camera('pan' if spec['move'] else 'static', spec['target_x'])
    else:
        target = sphere('reaction_marker', (0, 0.3, 2.45), 0.12, target_mat)
        if spec['move']:
            cam = setup_camera('dolly', 0)
        else:
            cam = setup_camera('static', 0)

    # Lighting makes the objects readable without pretending this is final viz.
    bpy.ops.object.light_add(type='AREA', location=(-3, -4, 6))
    key = bpy.context.object
    key.data.energy = 800
    key.data.shape = 'DISK'
    key.data.size = 5
    look_at(key, (0, 0, 1.5))
    bpy.ops.object.light_add(type='AREA', location=(4, 1, 3))
    fill = bpy.context.object
    fill.data.energy = 350
    fill.data.size = 4
    look_at(fill, (0, 0, 1.5))

    case_dir = os.path.join(OUT, case_id, 'previz')
    frame_dir = os.path.join(case_dir, 'frames')
    os.makedirs(frame_dir, exist_ok=True)
    scene.render.filepath = os.path.join(frame_dir, 'frame_')
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = FPS
    bpy.ops.render.render(animation=True)
    print(f'[blockout] {case_id} → {frame_dir}')


for case_id, spec in CASES.items():
    build_case(case_id, spec)

"""Author editable directional actions, then merge only their animation data.

Run after prepareMobileWhale.py, or directly against the existing master.
Geometry, particle attributes and the original swim in the shipping GLB stay intact.
"""
import math
import subprocess
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "output/mobile-whale/reactions"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HERE / "MobileWhale.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["MobileWhaleRig"]
swim = bpy.data.actions["MobileWhale_CalmSwim"]
swim.use_fake_user = True
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 49

# Armature-space axes: X along the body, Y depth, Z up. The root/object never
# turns. Body reaches; the successive tail joints counterbend into an S curve.
# Fins support the reach and flexible tips trail the root by a small interval.
for direction, axis, sign in [
    ("Left", (0, 0, 1), 1), ("Right", (0, 0, 1), -1),
    ("Up", (0, 1, 0), 1), ("Down", (0, 1, 0), -1),
]:
    name = "Whale_Look" + direction
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    rig.location = (0, 0, 0)
    for frame in range(1, 50, 2):
        t = (frame - 1) / 48
        for bone in rig.pose.bones:
            bone.rotation_mode = "QUATERNION"
            lag = .10 if bone.name.endswith("Tip") else 0
            progress = max(0, min(1, (t - lag) / (1 - lag)))
            reach = progress * progress * (3 - 2 * progress)
            degrees = {"Body": 9, "Tail01": -6, "Tail02": -5,
                       "Tail03": 2, "Peduncle": 2}.get(bone.name, 0)
            rotation_axis = Vector(axis)
            if bone.name.startswith("Pectoral"):
                near = "Near" in bone.name
                degrees = (5 if near else -5) if direction in ("Up", "Down") else (7 if near else 3)
                if bone.name.endswith("Tip"):
                    degrees *= .55
                rotation_axis = Vector((1, .15, 0))
            elif bone.name.startswith("Fluke"):
                degrees = (3 if "Near" in bone.name else -3)
                if bone.name.endswith("Tip"):
                    degrees *= .65
                rotation_axis = Vector((1, .2, 0))
            local_axis = bone.bone.matrix_local.to_3x3().inverted() @ rotation_axis
            bone.rotation_quaternion = Quaternion(local_axis.normalized(), math.radians(degrees) * sign * reach)
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
            key.handle_left_type = key.handle_right_type = "AUTO_CLAMPED"
    scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    # Export one active action through Blender's own bone-basis conversion.
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")),
        export_format="GLB", use_selection=True, export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS", export_frame_range=True,
        export_anim_single_armature=False,
        export_force_sampling=True, export_cameras=False, export_lights=False)


def local_axis(bone, axis):
    return (bone.bone.matrix_local.to_3x3().inverted() @ Vector(axis)).normalized()


def combined_rotation(bone, rotations):
    result = Quaternion((1, 0, 0, 0))
    for axis, degrees in rotations:
        if abs(degrees) > 1e-6:
            result = result @ Quaternion(local_axis(bone, axis), math.radians(degrees))
    return result


def export_action(name, pose):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    rig.location = (0, 0, 0)
    for frame in range(1, 50, 2):
        t = (frame - 1) / 48
        for bone in rig.pose.bones:
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = combined_rotation(bone, pose(bone.name, t))
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
            key.handle_left_type = key.handle_right_type = "AUTO_CLAMPED"
    scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")),
        export_format="GLB", use_selection=True, export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS", export_frame_range=True,
        export_anim_single_armature=False, export_force_sampling=True,
        export_cameras=False, export_lights=False)


def click_response_pose(name, t):
    # Recognition beat: head banks and lifts, pectorals open, then a travelling
    # counter-wave runs through the tail and flexible horizontal fluke tips.
    envelope = math.sin(math.pi * t) ** 1.15
    acknowledgement = math.sin(math.pi * min(1, t / .58)) * envelope
    wave = math.sin(t * math.pi * 2.2)
    if name == "Body":
        return [((0, 1, 0), 7.5 * acknowledgement), ((0, 0, 1), 9.5 * envelope)]
    tail_order = {"Tail01": (7, .18), "Tail02": (11, .3), "Tail03": (15, .42), "Peduncle": (18, .52)}
    if name in tail_order:
        amount, lag = tail_order[name]
        delayed = max(0, min(1, (t - lag * .18) / (1 - lag * .18)))
        return [((0, 0, 1), amount * math.sin(delayed * math.pi * 2.15 - lag * math.pi) * envelope)]
    if name.startswith("Pectoral"):
        near = "Near" in name
        tip = name.endswith("Tip")
        flare = (23 if near else -18) * envelope * (.78 if tip else 1)
        sweep = (8 if near else 5) * wave * envelope * (.9 if tip else .55)
        return [((1, .12, 0), flare), ((0, 0, 1), sweep)]
    if name.startswith("Fluke"):
        near = "Near" in name
        tip = name.endswith("Tip")
        flex = (17 if near else -17) * math.sin(t * math.pi * 2.1 - .7) * envelope
        if tip:
            flex *= 1.38
        return [((1, .18, 0), flex), ((0, 0, 1), (6 if near else -6) * envelope)]
    return []


def entrance_stroke_pose(name, t):
    # Seamless two-second cycle layered over CalmSwim during the approach.
    cycle = math.sin(t * math.pi * 2)
    power = math.sin(t * math.pi) ** 2
    if name == "Body":
        return [((0, 1, 0), 3.2 * power), ((0, 0, 1), 2.8 * cycle)]
    tail_order = {"Tail01": (4, .25), "Tail02": (7, .55), "Tail03": (10, .85), "Peduncle": (13, 1.1)}
    if name in tail_order:
        amount, lag = tail_order[name]
        return [((0, 0, 1), amount * math.sin(t * math.pi * 2 - lag))]
    if name.startswith("Pectoral"):
        near = "Near" in name
        tip = name.endswith("Tip")
        return [((1, .12, 0), (14 if near else -11) * power * (1.25 if tip else 1))]
    if name.startswith("Fluke"):
        near = "Near" in name
        tip = name.endswith("Tip")
        amount = (11 if near else -11) * math.sin(t * math.pi * 2 - 1.05)
        return [((1, .18, 0), amount * (1.4 if tip else 1))]
    return []


export_action("Whale_ClickResponse", click_response_pose)
export_action("Whale_EntranceStroke", entrance_stroke_pose)

rig.animation_data.action = swim
scene.frame_start, scene.frame_end = 1, 145
scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "MobileWhale.blend"))
subprocess.run(["node", str(HERE / "mergeWhaleReactions.mjs")], check=True)

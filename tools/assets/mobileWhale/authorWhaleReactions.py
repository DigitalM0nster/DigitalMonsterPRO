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
    ("Curious", (0, 1, 0), 1),
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
            if direction == "Curious":
                # A complete question-like lift with a delayed fin response.
                reach = math.sin(math.pi * progress) ** 2
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
            if direction == "Curious":
                degrees *= .6
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

rig.animation_data.action = swim
scene.frame_start, scene.frame_end = 1, 145
scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "MobileWhale.blend"))
subprocess.run(["node", str(HERE / "mergeWhaleReactions.mjs")], check=True)

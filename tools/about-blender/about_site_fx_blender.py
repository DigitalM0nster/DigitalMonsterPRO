"""
Bake About site transform FX (Three.js) into Blender keyframes.

Digital Monster — Blender 3.x / 4.x
Scripting workspace → Open this file → Run Script

Reads aboutSiteFxBake.json next to this script (same params as
src/three/scenes/about/aboutSceneConfig.js + aboutHeartScale /
aboutFrontAdvance / aboutBackRetreat / aboutOuterCellScatter /
aboutInsideParticles yaw).

Timeline: story 0…4 ↔ frames frameStart…frameEnd (default 0…40 @ 24fps),
matching aboutGltfStoryAnimRig.js.

Axes (authoring .blend, Z-up → glTF Y-up on export):
  Three local +Y  ↔  Blender local +Z
  Three axis (0,1,0) for Heart / PCB yaw → Blender (0,0,1)

After bake: scrub 0…40, verify vs site, export AboutUsModel.glb
(include Cameras + Animations), then set
ABOUT_USE_SITE_TRANSFORM_FX = false in aboutSceneConfig.js.
"""

from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Built-in defaults (= aboutSiteFxBake.json). Used when Blender Text editor
# has no __file__ and the .blend lives outside the repo.
DEFAULT_CFG = {
    "fps": 24,
    "frameStart": 0,
    "frameEnd": 40,
    "storyMin": 0,
    "storyMax": 4,
    "insertKeyEveryFrame": True,
    "clearExistingKeys": True,
    "heartScale": {
        "enabled": True,
        "storyStart": 1,
        "storyEnd": 2,
        "angleDeg": -225,
        "axisThree": [0, 1, 0],
    },
    "pcbYaw": {
        "enabled": True,
        "angleDeg": -45,
        "axisThree": [0, 1, 0],
        "emptyName": "AboutPcbYaw",
        "parentName": "InsideLarge",
        "fallbackParentName": "AboutModelAsset",
    },
    "frontAdvance": {
        "enabled": True,
        "start": 0,
        "end": 1,
        "distance": 0.55,
        "stage2Distance": 0.7,
        "meshNames": ["Front", "FrontBackSide"],
        "cameraName": "AboutCamera",
    },
    "backRetreat": {
        "enabled": True,
        "storyStart": 1,
        "storyEnd": 2,
        "distance": 0.65,
        "meshNames": ["Back", "BackBackSide"],
        "cameraName": "AboutCamera",
    },
    "outerCellScatter": {
        "enabled": True,
        "start": 0,
        "end": 1,
        "distance": 0.45,
        "lift": 0.14,
        "scaleOut": 0.85,
        "stage2Distance": 0.55,
        "stage2Lift": 0.12,
    },
}


def _text_editor_script_dirs():
    """Folders of .py files opened in Blender Text editor (filepath set on Open)."""
    dirs = []
    try:
        space = getattr(bpy.context, "space_data", None)
        text = getattr(space, "text", None) if space else None
        if text and text.filepath:
            dirs.append(Path(bpy.path.abspath(text.filepath)).resolve().parent)
    except Exception:
        pass
    for text in bpy.data.texts:
        if not text.filepath:
            continue
        try:
            dirs.append(Path(bpy.path.abspath(text.filepath)).resolve().parent)
        except Exception:
            continue
    return dirs


def resolve_cfg_path() -> Path | None:
    candidates = []
    for folder in _text_editor_script_dirs():
        candidates.append(folder / "aboutSiteFxBake.json")
    try:
        candidates.append(Path(__file__).resolve().parent / "aboutSiteFxBake.json")
    except NameError:
        pass
    # Repo checkout (common on this machine / CI)
    candidates.append(
        Path(r"C:\websites\develope\DigitalMonsterPRO\tools\about-blender\aboutSiteFxBake.json")
    )
    if bpy.data.filepath:
        blend_dir = Path(bpy.path.abspath("//"))
        candidates.append(blend_dir / "aboutSiteFxBake.json")
        candidates.append(blend_dir / "tools" / "about-blender" / "aboutSiteFxBake.json")
    candidates.append(Path.cwd() / "aboutSiteFxBake.json")
    candidates.append(Path.cwd() / "tools" / "about-blender" / "aboutSiteFxBake.json")
    # Walk up from blend looking for tools/about-blender
    if bpy.data.filepath:
        cur = Path(bpy.path.abspath("//"))
        for _ in range(6):
            candidates.append(cur / "tools" / "about-blender" / "aboutSiteFxBake.json")
            if cur.parent == cur:
                break
            cur = cur.parent
    for path in candidates:
        try:
            if path.is_file():
                return path
        except OSError:
            continue
    return None


OUTER_CELL_RE = re.compile(r"^OUTER_cell", re.IGNORECASE)
HEART_RE = re.compile(r"^Heart", re.IGNORECASE)


def load_cfg():
    cfg_path = resolve_cfg_path()
    if cfg_path is not None:
        with cfg_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        data["_cfgPath"] = str(cfg_path)
        print(f"[AboutSiteFx] loaded JSON: {cfg_path}")
        return data
    data = json.loads(json.dumps(DEFAULT_CFG))
    data["_cfgPath"] = "(embedded DEFAULT_CFG)"
    print("[AboutSiteFx] aboutSiteFxBake.json not found — using embedded DEFAULT_CFG")
    return data


def clamp(x, a, b):
    return max(a, min(b, x))


def smoothstep01(t):
    x = clamp(t, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def hash01(seed: float) -> float:
    """Match aboutOuterCellScatter.js hash01."""
    x = math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)


def story_to_frame(story: float, cfg) -> float:
    s0 = float(cfg["storyMin"])
    s1 = float(cfg["storyMax"])
    f0 = float(cfg["frameStart"])
    f1 = float(cfg["frameEnd"])
    t = 0.0 if s1 <= s0 else (float(story) - s0) / (s1 - s0)
    return f0 + clamp(t, 0.0, 1.0) * (f1 - f0)


def frame_to_story(frame: float, cfg) -> float:
    f0 = float(cfg["frameStart"])
    f1 = float(cfg["frameEnd"])
    s0 = float(cfg["storyMin"])
    s1 = float(cfg["storyMax"])
    t = 0.0 if f1 <= f0 else (float(frame) - f0) / (f1 - f0)
    return s0 + clamp(t, 0.0, 1.0) * (s1 - s0)


def find_object(name: str):
    return bpy.data.objects.get(name)


def iter_meshes_by_names(names):
    want = set(names)
    for obj in bpy.data.objects:
        if obj.name in want:
            yield obj


def iter_outer_cells():
    for obj in bpy.data.objects:
        if obj.type == "MESH" and OUTER_CELL_RE.match(obj.name):
            yield obj


def three_axis_to_blender(axis_three):
    """Three (x,y,z) Y-up local axis → Blender Z-up local axis (x,-z,y) on vectors;
    for axis of rotation: Three +Y → Blender +Z."""
    x, y, z = float(axis_three[0]), float(axis_three[1]), float(axis_three[2])
    # Vector map Three→Blender: (x, y, z)_t → (x, -z, y)_b
    return Vector((x, -z, y)).normalized()


def ensure_action(obj, name_suffix="SiteFx"):
    if obj.animation_data is None:
        obj.animation_data_create()
    action_name = f"{obj.name}_{name_suffix}"
    action = bpy.data.actions.get(action_name)
    if action is None:
        action = bpy.data.actions.new(action_name)
    obj.animation_data.action = action
    return action


def clear_loc_rot_scale_keys(obj):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    action = ad.action
    remove = [
        fc
        for fc in action.fcurves
        if fc.data_path in ("location", "rotation_euler", "rotation_quaternion", "scale")
    ]
    for fc in remove:
        action.fcurves.remove(fc)


def key_loc_quat_scale(obj, frame):
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.rotation_mode = "QUATERNION"
    obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    obj.keyframe_insert(data_path="scale", frame=frame)


def set_scene_fps(fps: int, frame_start: int, frame_end: int):
    scene = bpy.context.scene
    scene.render.fps = int(fps)
    scene.frame_start = int(frame_start)
    scene.frame_end = int(frame_end)


# ---------------------------------------------------------------------------
# Heart spin (aboutHeartScale.js)
# ---------------------------------------------------------------------------

def resolve_heart_targets():
    leaves = [
        obj
        for obj in bpy.data.objects
        if HEART_RE.match(obj.name) and obj.type in {"MESH", "CURVE", "EMPTY"}
    ]
    # Prefer mesh leaves like the site
    mesh_leaves = [o for o in leaves if o.type == "MESH"]
    if not mesh_leaves:
        mesh_leaves = leaves
    if not mesh_leaves:
        return []

    shared = mesh_leaves[0].parent
    for leaf in mesh_leaves[1:]:
        p = leaf.parent
        while p and p != shared:
            p = p.parent
        if p != shared:
            shared = None
            break

    if shared is not None:
        p = shared
        while p is not None:
            if HEART_RE.match(p.name):
                shared = p
                break
            p = p.parent

    if shared is not None:
        return [shared]
    return list(mesh_leaves)


def bake_heart(cfg, heart_cfg):
    if not heart_cfg.get("enabled", True):
        print("[AboutSiteFx] heartScale disabled")
        return 0

    targets = resolve_heart_targets()
    if not targets:
        print("[AboutSiteFx] WARNING: no Heart* targets")
        return 0

    story_start = float(heart_cfg.get("storyStart", 1))
    story_end = float(heart_cfg.get("storyEnd", 2))
    angle = math.radians(float(heart_cfg.get("angleDeg", -225)))
    axis_b = three_axis_to_blender(heart_cfg.get("axisThree", [0, 1, 0]))

    rest = {}
    for obj in targets:
        rest[obj.name] = obj.rotation_quaternion.copy() if obj.rotation_mode == "QUATERNION" else obj.matrix_local.to_quaternion()
        ensure_action(obj)
        if cfg.get("clearExistingKeys", True):
            clear_loc_rot_scale_keys(obj)
        obj.rotation_mode = "QUATERNION"

    f0 = int(cfg["frameStart"])
    f1 = int(cfg["frameEnd"])
    for frame in range(f0, f1 + 1):
        story = frame_to_story(frame, cfg)
        t = smoothstep01((story - story_start) / max(1e-4, story_end - story_start))
        te = smoothstep01(t)
        delta = Quaternion(axis_b, angle * te)
        for obj in targets:
            q = rest[obj.name].copy()
            # Three: restQuat.multiply(delta) == apply delta in local space
            obj.rotation_quaternion = q @ delta
            key_loc_quat_scale(obj, frame)

    print(f"[AboutSiteFx] heartScale → {len(targets)} object(s): {[o.name for o in targets]}")
    return len(targets)


# ---------------------------------------------------------------------------
# PCB yaw empty (aboutInsideParticles yawDeg)
# ---------------------------------------------------------------------------

def bake_pcb_yaw(cfg, pcb_cfg):
    if not pcb_cfg.get("enabled", True):
        print("[AboutSiteFx] pcbYaw disabled")
        return 0

    parent_name = pcb_cfg.get("parentName") or "InsideLarge"
    parent = find_object(parent_name)
    if parent is None:
        parent = find_object(pcb_cfg.get("fallbackParentName") or "AboutModelAsset")
    if parent is None:
        print("[AboutSiteFx] WARNING: no parent for AboutPcbYaw")
        return 0

    name = pcb_cfg.get("emptyName") or "AboutPcbYaw"
    empty = find_object(name)
    if empty is None:
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.25
        bpy.context.scene.collection.objects.link(empty)

    if empty.parent != parent:
        empty.parent = parent
        empty.matrix_parent_inverse = parent.matrix_world.inverted()

    empty.location = (0.0, 0.0, 0.0)
    empty.scale = (1.0, 1.0, 1.0)
    empty.rotation_mode = "QUATERNION"
    axis_b = three_axis_to_blender(pcb_cfg.get("axisThree", [0, 1, 0]))
    angle = math.radians(float(pcb_cfg.get("angleDeg", -45)))
    empty.rotation_quaternion = Quaternion(axis_b, angle)

    ensure_action(empty)
    if cfg.get("clearExistingKeys", True):
        clear_loc_rot_scale_keys(empty)

    f0 = int(cfg["frameStart"])
    f1 = int(cfg["frameEnd"])
    for frame in range(f0, f1 + 1):
        empty.rotation_quaternion = Quaternion(axis_b, angle)
        key_loc_quat_scale(empty, frame)

    print(f"[AboutSiteFx] pcbYaw → {name} under {parent.name} ({pcb_cfg.get('angleDeg')}°)")
    return 1


# ---------------------------------------------------------------------------
# Front / Back plate travel
# ---------------------------------------------------------------------------

def parent_local_axis_toward_camera(obj, camera, toward_camera: bool) -> Vector:
    """Port of resolveAboutPlateTravelAxisLocal (Blender world → parent local)."""
    if camera is None:
        axis = Vector((0.0, 0.0, 1.0 if toward_camera else -1.0))
        return axis

    world_pos = obj.matrix_world.translation
    to_cam = (camera.matrix_world.translation - world_pos)
    if to_cam.length_squared < 1e-10:
        axis = Vector((0.0, 0.0, 1.0 if toward_camera else -1.0))
    else:
        to_cam.normalize()
        parent = obj.parent
        parent_world = parent.matrix_world if parent else Matrix.Identity(4)
        # transform direction into parent local
        axis = parent_world.to_3x3().inverted_safe() @ to_cam
        if axis.length_squared < 1e-10:
            axis = Vector((0.0, 0.0, 1.0))
        else:
            axis.normalize()
        if not toward_camera:
            axis.negate()
    return axis


def bake_plate_travel(cfg, plate_cfg, toward_camera: bool, label: str):
    if not plate_cfg.get("enabled", True):
        print(f"[AboutSiteFx] {label} disabled")
        return 0

    names = plate_cfg.get("meshNames") or []
    parts = list(iter_meshes_by_names(names))
    if not parts:
        print(f"[AboutSiteFx] WARNING: {label} — no meshes {names}")
        return 0

    cam = find_object(plate_cfg.get("cameraName") or "AboutCamera")
    if cam is None:
        print(f"[AboutSiteFx] WARNING: {label} — AboutCamera missing; using ±Z fallback")

    rest = {obj.name: obj.location.copy() for obj in parts}
    axes = {obj.name: parent_local_axis_toward_camera(obj, cam, toward_camera) for obj in parts}

    for obj in parts:
        ensure_action(obj)
        if cfg.get("clearExistingKeys", True):
            clear_loc_rot_scale_keys(obj)

    f0 = int(cfg["frameStart"])
    f1 = int(cfg["frameEnd"])

    if toward_camera:
        start = float(plate_cfg.get("start", 0))
        end = float(plate_cfg.get("end", 1))
        distance = float(plate_cfg.get("distance", 0.55))
        stage2 = float(plate_cfg.get("stage2Distance", 0.7))

        def travel_at(story: float) -> float:
            p1 = clamp(story, 0.0, 1.0)
            p2 = clamp(story - 1.0, 0.0, 1.0)
            t1 = smoothstep01((p1 - start) / max(1e-4, end - start))
            t1e = t1 * t1 * (3.0 - 2.0 * t1)
            t2e = smoothstep01(p2)
            t2m = t2e * t2e * (3.0 - 2.0 * t2e)
            return distance * t1e + stage2 * t2m
    else:
        story_start = float(plate_cfg.get("storyStart", 1))
        story_end = float(plate_cfg.get("storyEnd", 2))
        distance = float(plate_cfg.get("distance", 0.65))

        def travel_at(story: float) -> float:
            t = smoothstep01((story - story_start) / max(1e-4, story_end - story_start))
            te = t * t * (3.0 - 2.0 * t)
            return distance * te

    for frame in range(f0, f1 + 1):
        story = frame_to_story(frame, cfg)
        travel = travel_at(story)
        for obj in parts:
            obj.location = rest[obj.name] + axes[obj.name] * travel
            key_loc_quat_scale(obj, frame)

    print(f"[AboutSiteFx] {label} → {len(parts)} mesh(es): {[o.name for o in parts]}")
    return len(parts)


# ---------------------------------------------------------------------------
# OUTER_cell scatter
# ---------------------------------------------------------------------------

def bake_outer_cells(cfg, scatter_cfg):
    if not scatter_cfg.get("enabled", True):
        print("[AboutSiteFx] outerCellScatter disabled")
        return 0

    cells = list(iter_outer_cells())
    if not cells:
        print("[AboutSiteFx] WARNING: no OUTER_cell* meshes")
        return 0

    # Deterministic order: match site traverse order as closely as possible (name sort is stable;
    # site uses scene-graph traverse — we sort by name for reproducibility across Blender sessions).
    cells.sort(key=lambda o: o.name)

    start = clamp(float(scatter_cfg.get("start", 0)), 0.0, 1.0)
    end = clamp(float(scatter_cfg.get("end", 1)), start + 1e-3, 1.0)
    distance = float(scatter_cfg.get("distance", 0.45))
    lift = float(scatter_cfg.get("lift", 0.14))
    scale_out = clamp(float(scatter_cfg.get("scaleOut", 0.85)), 0.2, 1.0)
    stage2_distance = float(scatter_cfg.get("stage2Distance", 0.55))
    stage2_lift = float(scatter_cfg.get("stage2Lift", 0.12))

    origin = Vector((0.0, 0.0, 0.0))
    for obj in cells:
        # Site uses Three local position; lift along Three +Y.
        # Blender authoring: Three (x,y,z) ↔ Blender (x,-z,y) for vectors from glTF,
        # but local locations on authoring meshes that export to OUTER_cell are already
        # in Blender space. Site dirs are built in glTF/Three local after export.
        # We treat object.location as the rest pose in THIS file and build dirs in
        # Blender space with +Z = Three +Y (lift), planar XZ_three = XY_blender.
        origin += obj.location
    origin /= len(cells)

    prepared = []
    for index, obj in enumerate(cells):
        seed = index * 17.13 + len(obj.name) * 3.7
        rest_pos = obj.location.copy()
        rest_quat = (
            obj.rotation_quaternion.copy()
            if obj.rotation_mode == "QUATERNION"
            else obj.matrix_local.to_quaternion()
        )
        rest_scale = obj.scale.copy()

        # Map Blender loc → Three-like for dir math: (x,y,z)_b → (x,z,-y)_t approx inverse of (x,-z,y)
        # three_from_blender: (x,y,z)_b → (x, z, -y)_t
        def b2t(v: Vector) -> Vector:
            return Vector((v.x, v.z, -v.y))

        def t2b(v: Vector) -> Vector:
            # inverse of b2t: (x,y,z)_t → (x, -z, y)_b
            return Vector((v.x, -v.z, v.y))

        origin_t = b2t(origin)
        rest_t = b2t(rest_pos)
        dir_t = rest_t - origin_t
        if dir_t.length_squared < 1e-8:
            a = hash01(seed) * math.pi * 2.0
            dir_t = Vector((math.cos(a), (hash01(seed + 1) - 0.5) * 0.35, math.sin(a)))
        dir_t.normalize()
        dir_t.y += (hash01(seed + 2) - 0.35) * 0.55
        dir_t.normalize()
        dir_b = t2b(dir_t)
        # Lift along Three +Y → Blender +Z
        lift_axis_b = Vector((0.0, 0.0, 1.0))

        prepared.append(
            {
                "obj": obj,
                "rest_pos": rest_pos,
                "rest_quat": rest_quat,
                "rest_scale": rest_scale,
                "dir": dir_b,
                "lift_axis": lift_axis_b,
                "delay": hash01(seed + 7) * 0.08,
            }
        )

        ensure_action(obj)
        if cfg.get("clearExistingKeys", True):
            clear_loc_rot_scale_keys(obj)
        obj.rotation_mode = "QUATERNION"

    f0 = int(cfg["frameStart"])
    f1 = int(cfg["frameEnd"])
    for frame in range(f0, f1 + 1):
        story = frame_to_story(frame, cfg)
        p1 = clamp(story, 0.0, 1.0)
        p2 = clamp(story - 1.0, 0.0, 1.0)
        for cell in prepared:
            local1 = smoothstep01(
                (p1 - start - cell["delay"] * (end - start)) / max(1e-4, end - start)
            )
            t1 = local1 * local1 * (3.0 - 2.0 * local1)
            t2 = smoothstep01(p2 - cell["delay"] * 0.15)
            t2e = t2 * t2 * (3.0 - 2.0 * t2)

            pos = cell["rest_pos"] + cell["dir"] * (distance * t1 + stage2_distance * t2e)
            pos = pos + cell["lift_axis"] * (lift * t1 + stage2_lift * t2e)
            # THREE.MathUtils.lerp(1, scaleOut, …)
            lerp_t = min(1.0, t1 * 0.85 + t2e * 0.2)
            s_scale = 1.0 + (scale_out - 1.0) * lerp_t

            obj = cell["obj"]
            obj.location = pos
            obj.rotation_quaternion = cell["rest_quat"]
            obj.scale = cell["rest_scale"] * s_scale
            key_loc_quat_scale(obj, frame)

    print(f"[AboutSiteFx] outerCellScatter → {len(prepared)} mesh(es)")
    return len(prepared)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    cfg = load_cfg()
    f0 = int(cfg.get("frameStart", 0))
    f1 = int(cfg.get("frameEnd", 40))
    fps = int(cfg.get("fps", 24))
    set_scene_fps(fps, f0, f1)

    print(f"[AboutSiteFx] cfg = {cfg.get('_cfgPath')}")
    print(f"[AboutSiteFx] frames {f0}…{f1} @ {fps}fps  (story {cfg.get('storyMin')}…{cfg.get('storyMax')})")

    n = 0
    n += bake_heart(cfg, cfg.get("heartScale") or {})
    n += bake_pcb_yaw(cfg, cfg.get("pcbYaw") or {})
    n += bake_plate_travel(cfg, cfg.get("frontAdvance") or {}, True, "frontAdvance")
    n += bake_plate_travel(cfg, cfg.get("backRetreat") or {}, False, "backRetreat")
    n += bake_outer_cells(cfg, cfg.get("outerCellScatter") or {})

    bpy.context.scene.frame_set(f0)
    print(f"[AboutSiteFx] done — touched {n} bake groups. Scrub timeline, then export GLB.")
    print("[AboutSiteFx] After export: ABOUT_USE_SITE_TRANSFORM_FX = false in aboutSceneConfig.js")


if __name__ == "__main__":
    main()

"""
About stage poses ↔ Blender (Digital Monster).

Blender 3.x / 4.x — Scripting workspace → Open this file → Run Script.

Modes (edit MODE at top of file, or set scene["about_pose_mode"]):
  "import" — build collection from aboutStagePoses.json (next to this script)
  "export" — read keyframed objects → print JS for aboutStagePoses.js + write JSON

Timeline: story 0…4 on frames 1, 11, 21, 31, 41 (step 10). Scrub / insert keyframes.

Objects:
  AboutRoot          — layout root (desktop rootX/Y)
  AboutModel         — whole model group (parent your GLB here)
  AboutCamera        — camera (fov from JSON)
  AboutLookAt        — look-at target (Track To on camera when useLookAt)

Axes: Three.js Y-up (x,y,z) ↔ Blender Z-up (x, -z, y).
Model euler in site: Three YXZ degrees on modelRoot.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

# ---------------------------------------------------------------------------
# import = чистая сцена для ручной настройки (без смещений с сайта)
# export = выгрузить кадры обратно в JS
#
# ВАЖНО: import СТИРАЕТ кейфреймы AboutModel / Camera / LookAt.
# После первой настройки всегда MODE = "export". Повторный wipe только с FORCE_RESET.
MODE = "export"  # "import" | "export"
FORCE_RESET = False  # True + MODE=import — снести и пересоздать сцену
FRAME_STEP = 10
# Кадры story: маркеры story_0…story_4 (часто 1/11/21/31/41). Fallback: 0/10/20/30/40.
FRAME0 = 0
STORY_COUNT = 5
COLLECTION_NAME = "AboutStagePoses"
# Явный путь к папке tools (если Blender не видит JSON рядом со скриптом)
PROJECT_TOOLS_DIR = Path(r"c:\websites\develope\DigitalMonsterPRO\tools\about-blender")
# Стартовая камера в Blender (Z-up): спереди сверху, смотрит в центр
FRESH_CAM_LOC = (0.0, -8.2, 1.2)
FRESH_LOOK_LOC = (0.0, 0.0, 0.0)
FRESH_FOV_DEG = 34.0
# ---------------------------------------------------------------------------

# Встроенные позы — импорт работает даже без JSON на диске
EMBEDDED_DATA = {
	"space": "three.js",
	"up": "Y",
	"units": "meters",
	"layoutDesktop": {
		"rootX": 1.75,
		"rootY": 0.05,
		"rootScale": 1,
		"cameraZ": 8.2,
		"cameraY": 0.12,
		"lookAtX": 1.25,
		"lookAtY": 0.05,
		"fov": 34,
	},
	"assetEulerDeg": {"x": 0, "y": 0, "z": 0},
	"poses": [
		{
			"story": 0,
			"camera": {
				"x": 0.1875, "y": 0.12, "z": 8.2,
				"rotX": 0, "rotY": 0, "rotZ": 0,
				"useLookAt": True,
				"lookAtX": 1.25, "lookAtY": 0.05, "lookAtZ": 0,
				"fov": 34,
			},
			"model": {"x": 1.15, "y": -0.04, "z": -1.28, "rotX": -11.5, "rotY": 30.5, "rotZ": 0},
		},
		{
			"story": 1,
			"camera": {
				"x": 0.1875, "y": 0.12, "z": 8.2,
				"rotX": 0, "rotY": 0, "rotZ": 0,
				"useLookAt": True,
				"lookAtX": 1.25, "lookAtY": 0.05, "lookAtZ": 0,
				"fov": 34,
			},
			"model": {"x": 0.85, "y": -0.04, "z": 0.38, "rotX": -19, "rotY": 23, "rotZ": 0},
		},
		{
			"story": 2,
			"camera": {
				"x": 6, "y": 0.12, "z": 8.2,
				"rotX": 0, "rotY": 0, "rotZ": 0,
				"useLookAt": True,
				"lookAtX": 1.25, "lookAtY": 0.04, "lookAtZ": 1.85,
				"fov": 34,
			},
			"model": {"x": 0, "y": 0, "z": 0, "rotX": 0, "rotY": 0, "rotZ": 0},
		},
		{
			"story": 3,
			"camera": {
				"x": 0.1875, "y": 0.12, "z": 8.2,
				"rotX": 0, "rotY": 0, "rotZ": 0,
				"useLookAt": True,
				"lookAtX": 1.25, "lookAtY": 0.05, "lookAtZ": 0,
				"fov": 34,
			},
			"model": {"x": 0, "y": 0, "z": 0, "rotX": 0, "rotY": 0, "rotZ": 0},
		},
		{
			"story": 4,
			"camera": {
				"x": 0.1875, "y": 0.12, "z": 8.2,
				"rotX": 0, "rotY": 0, "rotZ": 0,
				"useLookAt": True,
				"lookAtX": 1.25, "lookAtY": 0.05, "lookAtZ": 0,
				"fov": 34,
			},
			"model": {"x": 0, "y": 0, "z": 0, "rotX": 0, "rotY": 0, "rotZ": 0},
		},
	],
}


def resolve_tools_dir() -> Path:
	"""Папка со скриптом/JSON — не рядом с .blend (там JSON нет)."""
	candidates = []

	# Text Editor: путь открытого .py
	try:
		text = getattr(bpy.context.space_data, "text", None)
		if text and text.filepath:
			candidates.append(Path(bpy.path.abspath(text.filepath)).resolve().parent)
	except Exception:
		pass

	# Внешний запуск
	try:
		candidates.append(Path(__file__).resolve().parent)
	except NameError:
		pass

	candidates.append(PROJECT_TOOLS_DIR)

	# Все открытые тексты в Blender
	for text in bpy.data.texts:
		if text.filepath and text.name.endswith(".py"):
			try:
				candidates.append(Path(bpy.path.abspath(text.filepath)).resolve().parent)
			except Exception:
				pass

	seen = set()
	for folder in candidates:
		key = str(folder).lower()
		if key in seen:
			continue
		seen.add(key)
		if (folder / "aboutStagePoses.json").is_file():
			return folder

	# Хоть какая-то папка для экспорта
	for folder in candidates:
		if folder.is_dir():
			return folder
	return PROJECT_TOOLS_DIR


SCRIPT_DIR = resolve_tools_dir()
JSON_PATH = SCRIPT_DIR / "aboutStagePoses.json"
EXPORT_JSON_PATH = SCRIPT_DIR / "aboutStagePoses.export.json"


def fov_deg_to_lens_mm(fov_deg: float, sensor_width: float = 36.0) -> float:
	"""Horizontal FOV (deg) → Blender camera.lens (mm). angle is not keyframable in Blender 4."""
	fov = max(1e-3, math.radians(float(fov_deg)))
	return (sensor_width * 0.5) / math.tan(fov * 0.5)


def lens_mm_to_fov_deg(lens_mm: float, sensor_width: float = 36.0) -> float:
	lens = max(1e-3, float(lens_mm))
	return math.degrees(2.0 * math.atan((sensor_width * 0.5) / lens))


def three_loc_to_blender(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


def blender_loc_to_three(v: Vector) -> tuple[float, float, float]:
    return (float(v.x), float(v.z), float(-v.y))


def three_euler_yxz_deg_to_blender_quat(rx: float, ry: float, rz: float) -> Quaternion:
    """Three.js Euler('YXZ') degrees → Blender quaternion (world)."""
    # Three intrinsic YXZ = apply X, then Y, then Z in local space...
    # three.js set(x,y,z,'YXZ') is intrinsic Tait–Bryan YXZ.
    ex = math.radians(rx)
    ey = math.radians(ry)
    ez = math.radians(rz)
    # Build Three rotation matrix (Y-up), then change basis to Blender (Z-up).
    # R_b = B * R_t * B^-1, B maps Three axes → Blender: X→X, Y→Z, Z→-Y
    qx = Quaternion((1, 0, 0), ex)
    qy = Quaternion((0, 1, 0), ey)
    qz = Quaternion((0, 0, 1), ez)
    # YXZ intrinsic: q = qy * qx * qz (three.js order for 'YXZ')
    q_three = qy @ qx @ qz
    # Basis change matrix Three→Blender columns = images of Three basis vectors
    b = Matrix(
        (
            (1, 0, 0),
            (0, 0, -1),
            (0, 1, 0),
        )
    ).to_4x4()
    r_three = q_three.to_matrix().to_4x4()
    r_blender = b @ r_three @ b.inverted()
    return r_blender.to_quaternion()


def blender_quat_to_three_euler_yxz_deg(q: Quaternion) -> tuple[float, float, float]:
    b = Matrix(
        (
            (1, 0, 0),
            (0, 0, -1),
            (0, 1, 0),
        )
    ).to_4x4()
    r_blender = q.to_matrix().to_4x4()
    r_three = b.inverted() @ r_blender @ b
    # Decompose as Three YXZ: R = Ry * Rx * Rz
    m = r_three.to_3x3()
    # Stable YXZ extract
    sy = -m[2][0]
    sy = max(-1.0, min(1.0, sy))
    y = math.asin(sy)
    if abs(sy) < 0.99999:
        x = math.atan2(m[2][1], m[2][2])
        z = math.atan2(m[1][0], m[0][0])
    else:
        x = math.atan2(-m[1][2], m[1][1])
        z = 0.0
    return (math.degrees(x), math.degrees(y), math.degrees(z))


def ensure_collection(name: str):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def clear_collection(col):
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def get_or_create_empty(name: str, col, size=0.35):
    obj = bpy.data.objects.get(name)
    if obj and obj.name in col.objects:
        return obj
    if obj:
        try:
            col.objects.link(obj)
        except RuntimeError:
            pass
        return obj
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    col.objects.link(obj)
    return obj


def get_or_create_camera(name: str, col):
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "CAMERA":
        if obj.name not in col.objects:
            try:
                col.objects.link(obj)
            except RuntimeError:
                pass
        return obj
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    return obj


def key_loc_rot(obj, frame: int):
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def look_at_rotation(cam_loc: Vector, target: Vector) -> Euler:
    direction = target - cam_loc
    if direction.length_squared < 1e-12:
        return Euler((0, 0, 0), "XYZ")
    quat = direction.to_track_quat("-Z", "Y")
    return quat.to_euler("XYZ")


def load_json():
	path = resolve_tools_dir() / "aboutStagePoses.json"
	if path.is_file():
		with open(path, "r", encoding="utf-8") as f:
			print(f"[AboutPoses] JSON: {path}")
			return json.load(f)
	print(f"[AboutPoses] JSON не найден ({path}) — беру встроенные позы")
	return json.loads(json.dumps(EMBEDDED_DATA))


def clear_object_animation(obj):
    if obj.animation_data:
        obj.animation_data_clear()
    if getattr(obj, "data", None) is not None and getattr(obj.data, "animation_data", None):
        obj.data.animation_data_clear()


def _object_has_animation(obj) -> bool:
    if not obj:
        return False
    if obj.animation_data and obj.animation_data.action:
        return True
    data = getattr(obj, "data", None)
    if data is not None and getattr(data, "animation_data", None) and data.animation_data.action:
        return True
    return False


def run_import():
    """Чистая удобная сцена: всё в центре, без смещений с сайта. Кадры — для ручной анимации."""
    existing = [
        bpy.data.objects.get("AboutModel"),
        bpy.data.objects.get("AboutCamera"),
        bpy.data.objects.get("AboutLookAt"),
        bpy.data.objects.get("AboutModelAsset"),
    ]
    has_setup = any(obj is not None for obj in existing)
    has_keys = any(_object_has_animation(obj) for obj in existing)
    if has_setup and not FORCE_RESET:
        print("[AboutPoses] STOP: сцена About* уже есть — import бы стёр анимацию.")
        print("  Нужен экспорт? Поставь MODE = \"export\" и Run Script.")
        print("  Нужен полный сброс? FORCE_RESET = True и MODE = \"import\".")
        if has_keys:
            print("  (На объектах есть action — ключи не тронуты.)")
        return

    col = ensure_collection(COLLECTION_NAME)
    clear_collection(col)

    # Модель в центре мира — крути/двигай её
    model = get_or_create_empty("AboutModel", col, size=0.8)
    model.location = (0.0, 0.0, 0.0)
    model.rotation_mode = "XYZ"
    model.rotation_euler = (0.0, 0.0, 0.0)
    clear_object_animation(model)

    # Сюда parent’ь все меши (Front/Back/Heart/Outer…)
    asset = get_or_create_empty("AboutModelAsset", col, size=0.5)
    asset.parent = model
    asset.location = (0.0, 0.0, 0.0)
    asset.rotation_euler = (0.0, 0.0, 0.0)
    clear_object_animation(asset)

    look = get_or_create_empty("AboutLookAt", col, size=0.25)
    look.location = Vector(FRESH_LOOK_LOC)
    look.rotation_euler = (0.0, 0.0, 0.0)
    clear_object_animation(look)

    cam = get_or_create_camera("AboutCamera", col)
    clear_object_animation(cam)
    cam.data.type = "PERSP"
    cam.data.lens_unit = "MILLIMETERS"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.sensor_width = 36.0
    cam.location = Vector(FRESH_CAM_LOC)
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = look_at_rotation(cam.location, look.location)
    cam.data.lens = fov_deg_to_lens_mm(FRESH_FOV_DEG, cam.data.sensor_width)

    for c in list(cam.constraints):
        cam.constraints.remove(c)
    track = cam.constraints.new(type="TRACK_TO")
    track.target = look
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    scene = bpy.context.scene
    scene.frame_start = FRAME0
    scene.frame_end = FRAME0 + FRAME_STEP * (STORY_COUNT - 1)

    # Одинаковый стартовый кейфрейм на все story — дальше правишь руками
    for story in range(STORY_COUNT):
        frame = FRAME0 + story * FRAME_STEP

        model.location = (0.0, 0.0, 0.0)
        model.rotation_euler = (0.0, 0.0, 0.0)
        key_loc_rot(model, frame)

        look.location = Vector(FRESH_LOOK_LOC)
        look.rotation_euler = (0.0, 0.0, 0.0)
        key_loc_rot(look, frame)

        cam.location = Vector(FRESH_CAM_LOC)
        cam.rotation_euler = look_at_rotation(cam.location, look.location)
        key_loc_rot(cam, frame)

        cam.data.lens = fov_deg_to_lens_mm(FRESH_FOV_DEG, cam.data.sensor_width)
        cam.data.keyframe_insert(data_path="lens", frame=frame)
        cam[f"fov_s{story}"] = FRESH_FOV_DEG
        cam[f"useLookAt_s{story}"] = True

        name = f"story_{story}"
        if name in scene.timeline_markers:
            scene.timeline_markers.remove(scene.timeline_markers[name])
        scene.timeline_markers.new(name, frame=frame)

    scene.frame_set(FRAME0)
    scene.camera = cam
    print("[AboutPoses] Чистая сцена: модель в (0,0,0), камера спереди.")
    print("Parent меши → AboutModelAsset. Крути AboutModel + AboutCamera.")
    print("Кадры: маркеры story_0…story_4 (обычно 1 / 11 / 21 / 31 / 41).")
    print("Когда готово: MODE='export' → Run Script.")


def frame_for_story(story: int) -> int:
    return FRAME0 + story * FRAME_STEP


def collect_action_keyframes(action) -> set[int]:
    frames: set[int] = set()
    if not action:
        return frames
    # Classic fcurves
    for fc in getattr(action, "fcurves", []) or []:
        for kp in fc.keyframe_points:
            frames.add(int(round(kp.co.x)))
    # Blender 4.4+ layered / slotted actions
    try:
        for layer in getattr(action, "layers", []) or []:
            for strip in getattr(layer, "strips", []) or []:
                channelbag = getattr(strip, "channelbag", None)
                fcurves = None
                if callable(channelbag):
                    try:
                        fcurves = channelbag(action.slots[0]).fcurves if getattr(action, "slots", None) else None
                    except Exception:
                        fcurves = None
                if fcurves is None:
                    fcurves = getattr(strip, "fcurves", None)
                for fc in fcurves or []:
                    for kp in fc.keyframe_points:
                        frames.add(int(round(kp.co.x)))
    except Exception:
        pass
    return frames


def collect_object_keyframes(obj) -> set[int]:
    frames: set[int] = set()
    if not obj:
        return frames
    ad = getattr(obj, "animation_data", None)
    if ad:
        if ad.action:
            frames |= collect_action_keyframes(ad.action)
        # NLA strips (Push Down) — иначе Keys camera пустой
        for track in getattr(ad, "nla_tracks", []) or []:
            for strip in track.strips:
                if not strip.action:
                    continue
                base = collect_action_keyframes(strip.action)
                a0 = float(getattr(strip, "action_frame_start", 0) or 0)
                s0 = float(getattr(strip, "frame_start", 0) or 0)
                scale = float(getattr(strip, "scale", 1.0) or 1.0)
                for f in base:
                    frames.add(int(round(s0 + (f - a0) * scale)))
    data = getattr(obj, "data", None)
    if data is not None:
        frames |= collect_object_keyframes_data_only(data)
    return frames


def collect_object_keyframes_data_only(data) -> set[int]:
    frames: set[int] = set()
    ad = getattr(data, "animation_data", None)
    if not ad:
        return frames
    if ad.action:
        frames |= collect_action_keyframes(ad.action)
    for track in getattr(ad, "nla_tracks", []) or []:
        for strip in track.strips:
            if strip.action:
                frames |= collect_action_keyframes(strip.action)
    return frames


def discover_transform_change_frames(obj, frame_start: int, frame_end: int, eps=1e-4) -> set[int]:
    """
    Кадры, где world-позиция объекта заметно меняется (даже без читаемых fcurves).
    Нужно, если ключи на родителе / странном action.
    """
    found: set[int] = set()
    if not obj:
        return found
    scene = bpy.context.scene
    prev = None
    start = int(frame_start)
    end = int(max(frame_start, frame_end))
    for f in range(start, end + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        loc = ev.matrix_world.translation.copy()
        if prev is not None:
            if (loc - prev).length > eps:
                found.add(f)
                found.add(f - 1)
        prev = loc
    return found


def nearest_frame(target: int, candidates: list[int], max_dist: int | None = None) -> int:
    if not candidates:
        return target
    best = min(candidates, key=lambda f: (abs(f - target), f))
    if max_dist is not None and abs(best - target) > max_dist:
        return target
    return best


def resolve_marker_frames():
    """Маркеры story_0…story_4, иначе 0/10/20… или 1/11/21…"""
    scene = bpy.context.scene
    by_name = {}
    for marker in scene.timeline_markers:
        name = (marker.name or "").strip().lower().replace(" ", "_")
        by_name[name] = int(marker.frame)

    frames = []
    for story in range(STORY_COUNT):
        key = f"story_{story}"
        if key in by_name:
            frames.append(by_name[key])
        else:
            frames.append(FRAME0 + story * FRAME_STEP)
    return frames


def resolve_story_frames(model, cam, look):
    """
    Кадр экспорта на каждый story.

    Маркеры story_0…story_4 задают границы. Реальные кейфреймы часто стоят
    на промежуточных кадрах (не ровно на маркере) — берём ключ из сегмента
    [marker_i … marker_{i+1}), приоритет: camera/LookAt → model → сам маркер.
    """
    markers = resolve_marker_frames()
    scene = bpy.context.scene
    f0 = int(scene.frame_start)
    f1 = int(scene.frame_end)

    model_keys = sorted(collect_object_keyframes(model))
    cam_keys = set(collect_object_keyframes(cam))
    look_keys = set(collect_object_keyframes(look))

    # Если fcurves пустые — ищем кадры реального движения cam/look
    if len(cam_keys) <= 1 or len(look_keys) <= 1:
        print("[AboutPoses] Scanning timeline for cam/look motion (fcurves sparse)…")
        cam_keys |= discover_transform_change_frames(cam, f0, f1)
        look_keys |= discover_transform_change_frames(look, f0, f1)

    cam_keys = sorted(cam_keys)
    look_keys = sorted(look_keys)
    cam_or_look = sorted(set(cam_keys) | set(look_keys))
    all_keys = sorted(set(model_keys) | set(cam_or_look))

    print(f"[AboutPoses] Markers:     {markers}")
    print(f"[AboutPoses] Keys model:  {model_keys}")
    print(f"[AboutPoses] Keys camera: {cam_keys}")
    print(f"[AboutPoses] Keys lookAt: {look_keys}")
    if len(cam_keys) <= 1:
        print(
            "[AboutPoses] WARN: Almost no camera keys on AboutCamera. "
            "Select AboutCamera → check Dope Sheet yellow keys → I → Location on each story."
        )

    frames = []
    for story, marker in enumerate(markers):
        if story + 1 < len(markers):
            seg_lo = marker
            seg_hi = markers[story + 1]  # half-open [lo, hi)
            in_seg = lambda f: seg_lo <= f < seg_hi
        else:
            seg_lo = marker
            seg_hi = marker + FRAME_STEP * 2
            in_seg = lambda f: seg_lo <= f <= seg_hi

        seg_cam = [f for f in cam_or_look if in_seg(f)]
        seg_all = [f for f in all_keys if in_seg(f)]

        if seg_cam:
            # Ближайший к маркеру ключ камеры/look в сегменте (часто промежуточный)
            picked = nearest_frame(marker, seg_cam)
            source = "segment cam/look"
        elif seg_all:
            picked = nearest_frame(marker, seg_all)
            source = "segment model"
        else:
            # Ключ чуть раньше/позже маркера (вне жёсткого сегмента)
            pool = cam_or_look or all_keys
            picked = nearest_frame(marker, pool, max_dist=FRAME_STEP) if pool else marker
            source = "nearest" if picked != marker else "marker"

        frames.append(int(picked))
        print(
            f"[AboutPoses] story {story}: marker {marker} → frame {picked} ({source}) "
            f"seg=[{seg_lo},{seg_hi})"
        )

    return frames


def run_export():
    model = bpy.data.objects.get("AboutModel")
    asset = bpy.data.objects.get("AboutModelAsset")
    cam = bpy.data.objects.get("AboutCamera")
    look = bpy.data.objects.get("AboutLookAt")
    if not model or not cam or not look:
        raise RuntimeError("Missing AboutModel / AboutCamera / AboutLookAt — run import first.")

    # Визуальная поза всей сборки = world AboutModelAsset (Model × Asset base).
    pose_obj = asset if asset else model

    scene = bpy.context.scene
    story_frames = resolve_story_frames(model, cam, look)
    print(f"[AboutPoses] Export frames: {story_frames}")
    poses = []
    for story, frame in enumerate(story_frames):
        scene.frame_set(frame)
        # depsgraph so constraints / parenting are evaluated
        dg = bpy.context.evaluated_depsgraph_get()
        pose_eval = pose_obj.evaluated_get(dg)
        cam_eval = cam.evaluated_get(dg)
        look_eval = look.evaluated_get(dg)

        mw = pose_eval.matrix_world
        mx, my, mz = blender_loc_to_three(mw.translation)
        rx, ry, rz = blender_quat_to_three_euler_yxz_deg(mw.to_quaternion())

        cx, cy, cz = blender_loc_to_three(cam_eval.matrix_world.translation)
        lx, ly, lz = blender_loc_to_three(look_eval.matrix_world.translation)

        use_look_at = True
        key = f"useLookAt_s{story}"
        if key in cam:
            use_look_at = bool(cam[key])

        if use_look_at:
            crx = cry = crz = 0.0
        else:
            cq = cam_eval.matrix_world.to_quaternion()
            crx, cry, crz = blender_quat_to_three_euler_yxz_deg(cq)

        fov_key = f"fov_s{story}"
        if fov_key in cam:
            fov = float(cam[fov_key])
        else:
            fov = lens_mm_to_fov_deg(cam.data.lens, cam.data.sensor_width)

        print(
            f"[AboutPoses] story {story} @f{frame}: "
            f"cam=({cx:.3f},{cy:.3f},{cz:.3f}) look=({lx:.3f},{ly:.3f},{lz:.3f}) "
            f"model=({mx:.3f},{my:.3f},{mz:.3f})"
        )

        poses.append(
            {
                "story": story,
                "blenderFrame": frame,
                "camera": {
                    "x": round(cx, 4),
                    "y": round(cy, 4),
                    "z": round(cz, 4),
                    "rotX": round(crx, 4),
                    "rotY": round(cry, 4),
                    "rotZ": round(crz, 4),
                    "useLookAt": use_look_at,
                    "lookAtX": round(lx, 4),
                    "lookAtY": round(ly, 4),
                    "lookAtZ": round(lz, 4),
                    "fov": round(fov, 4),
                },
                "model": {
                    "x": round(mx, 4),
                    "y": round(my, 4),
                    "z": round(mz, 4),
                    "rotX": round(rx, 4),
                    "rotY": round(ry, 4),
                    "rotZ": round(rz, 4),
                },
            }
        )

    layout = {
        "rootX": 0,
        "rootY": 0,
        "rootScale": 1,
        "cameraZ": 8.2,
        "cameraY": 1.2,
        "lookAtX": 0,
        "lookAtY": 0,
        "fov": 34,
    }

    out = {
        "space": "three.js",
        "up": "Y",
        "units": "meters",
        "notes": [
            "Exported from Blender about_stage_poses_blender.py",
            "model = AboutModelAsset.matrix_world (Model animation × Asset base)",
            f"frames = {story_frames}",
        ],
        "layoutDesktop": layout,
        "poses": poses,
    }
    out_dir = resolve_tools_dir()
    export_json = out_dir / "aboutStagePoses.export.json"
    with open(export_json, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    lines = ["export const ABOUT_STAGE_POSES = ["]
    for p in poses:
        c = p["camera"]
        m = p["model"]
        lines.append(f"\t// story {p['story']}")
        lines.append("\t{")
        lines.append("\t\tcamera: {")
        lines.append(f"\t\t\tx: {c['x']}, y: {c['y']}, z: {c['z']},")
        lines.append(f"\t\t\trotX: {c['rotX']}, rotY: {c['rotY']}, rotZ: {c['rotZ']},")
        lines.append(f"\t\t\tuseLookAt: {'true' if c['useLookAt'] else 'false'},")
        lines.append(
            f"\t\t\tlookAtX: {c['lookAtX']}, lookAtY: {c['lookAtY']}, lookAtZ: {c['lookAtZ']},"
        )
        lines.append(f"\t\t\tfov: {c['fov']},")
        lines.append("\t\t},")
        lines.append(
            f"\t\tmodel: {{ x: {m['x']}, y: {m['y']}, z: {m['z']}, "
            f"rotX: {m['rotX']}, rotY: {m['rotY']}, rotZ: {m['rotZ']} }},"
        )
        lines.append("\t},")
    lines.append("];")
    js = "\n".join(lines) + "\n"

    js_path = out_dir / "ABOUT_STAGE_POSES.export.js"
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js)

    print("=" * 60)
    print(js)
    print("=" * 60)
    print(f"[AboutPoses] Wrote {export_json}")
    print(f"[AboutPoses] Wrote {js_path}")
    print("Paste the JS into createDefaultAboutStagePoses() in aboutStagePoses.js (or send to Cursor).")

    try:
        scene = bpy.context.window_manager
        scene.clipboard = js
        print("[AboutPoses] Also copied JS to system clipboard.")
    except Exception:
        pass


def main():
    mode = bpy.context.scene.get("about_pose_mode", MODE)
    if mode == "export":
        run_export()
    else:
        run_import()


if __name__ == "__main__":
    main()

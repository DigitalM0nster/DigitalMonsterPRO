# Data schema

`creature_source.json.gz`: UTF-8 JSON, gzip compressed.

- `parts[]`: `name`, `vertices` (N×3, Z-up), `faces` (quads and triangles), `uv` (N×2 or null).
- `paths[]`: `name`, `part` (index of source surface), `kind` (`flow` or `accent`), `radius` (world units), `points` (M×3).
- `surface_points`: `positions`, `radii`, `part_indices`, `uv`.
- `landmarks`: sparse brighter accent positions.

`surface_samples.npz`: NumPy arrays `positions` float32 [N,3], `radii` float32 [N], `part_indices` uint8 [N], `uv` float32 [N,2], `landmarks` float32 [M,3]. No pickled objects.

Part indices 0..5: body, pectoral L, pectoral R, fluke L, fluke R, dorsal. Eyes are separate mesh objects and have no point sample fields.

UV data are the procedural surface parameters, not a final hand-authored UV layout. Surface points are not barycentric anchors, bone weights or an animation cache. If topology is changed, regenerate/project them, then store stable bindings for the intended deformation system.

Static GLB preview uses every second surface sample as a small octahedron; Blender assembly uses the full point set with instanced low-poly spheres. Those are intentionally different preview representations of the same anchor data.

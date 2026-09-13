# Reference-sculpted creature for home

`referenceContours.json` records the silhouette and flow-line landmarks from
supplied image `codex-clipboard-3e1e86c9-63a6-4de2-9769-ed5dd1873d05.png`
(1219 × 679). It is the authority for this stylized creature: broad rounded jaw,
sloping forehead, high crest followed by a concave back, swept triangular
pectoral fin and tail lobes turned into the reference's image plane. The second
close-up guides the elongated dark eye socket and jaw pleats; it is not an exact
crop of the full-frame picture.

The model is an original closed 3D skin, not an image plane or an imported whale.
`MobileWhale.blend` contains the editable surface, Flow UVs, nine-bone rig,
six-second `MobileWhale_CalmSwim` action and clay studio. Bright nodes, eyelid,
mouth, fin rims and detached crest threads share the skin's bones. Each loop
returns to the authored reference pose. The website supplies the blue shader.

## Regenerate

From the repository root, in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --factory-startup --python tools/assets/mobileWhale/prepareMobileWhale.py
```

This replaces the master and `public/models/home/whale-mobile.glb`, and writes
`output/mobile-whale/anatomy.png` (ignored). Edit the JSON contours / Python
source before regenerating; regeneration replaces manual master edits.

Body rows are resampled at a common longitudinal X and interpolated monotonically
across latitude. This preserves the traced U/S curves without folding the skin
where the crest and saddle converge. The two independently traced edges of each
fin are lofted into a closed cambered volume. Depth stays real; the body's depth
pass occludes the distant skin and fin.

## Website and resource budget

- `loadMobileWhale.js` prepares the same compressed GLB on every device under the
  preloader, including a chunked bounding-envelope sample of the complete swim.
- `mobileWhaleMaterial.js` draws body beads, curved throat ribs, facial contours,
  filaments and soft star nodes using two material groups. One shared skin depth
  pass and one bounded dust draw bring the total to four draws. Transparent
  contour/glow fragments test body depth but do not write invisible square masks.
- Desktop frames the complete creature below/beside the title. Portrait frames
  the face and sweeping fin beneath the copy. Resizing and returning home reuse
  the existing model, rig, textures and shader programs.
- Per-frame updates change bones and uniforms only. No bitmap animation, CPU
  particle skinning, texture upload or geometry creation is needed.

The asset budget is 350 KB including animation; the current export is roughly
285 KiB with about 56,000 source vertices. Dust is capped at 512 small points.
These are bounded resource costs, not a measured physical-phone FPS guarantee.

The body-group Flow V bands encode body (0–1), pectorals (2–3), flukes (4–5).
Contour bands encode lip (0–1), reserved lower lip (2–3), eyelid (4–5), brow (6–7),
fin edge (8–9), soft glow cards (10–11), and detached filaments (12–13).
Curve U is arc length; glow-card UVs are local 0–1. The shader restores Blender V
after the glTF flip. Do not repack these coordinates as a conventional atlas.

Validation:

```powershell
node --test src/three/scenes/home/mobileWhale/mobileWhale.test.js src/three/scenes/home/particleResolution.test.js src/three/scenes/home/heroText/HeroTextMesh.reveal.test.js
```
# Authored whale for mobile and desktop

Original whale geometry authored in Blender 4.2. `MobileWhale.blend` contains the
editable mesh, Flow UVs, nine-bone rig, six-second `MobileWhale_CalmSwim` action and
a lit studio camera. No geometry from the former whale is used.

The model follows the supplied close-up reference through a blunt broad rostrum,
a rising heavy skull, deep lower jaw, small lateral eyes and broad swept pectoral
fins. Jaw-aligned flow coordinates bend around the eye instead of scattering
particles uniformly over a generic whale. The
reference's blue dotted light is rendered by Three.js; the Blender studio uses
clay so the anatomy can be inspected independently.

## Regenerate

From the repository root, in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --factory-startup --python tools/assets/mobileWhale/prepareMobileWhale.py
```

This replaces the generated master and `public/models/home/whale-mobile.glb`,
and writes a clay review to ignored `output/mobile-whale/anatomy.png`.
Change the Python source before regenerating; regeneration replaces manual
edits to the generated master.

## Website

- `src/three/scenes/home/mobileWhale/loadMobileWhale.js` loads the compressed
  skin and animation under the preloader on every device. The original mobile
  asset path is retained; phones and desktops reuse the same prepared resources.
- `mobileWhaleMaterial.js` draws the longitudinal dots, light bands and glints
  in a skinned surface shader. Arc-length UVs space beads along the lip, eyelid,
  brow and fin edges. Body and contours use two material groups; a small trail
  uses one further draw. An opaque depth-only pass shares the body geometry and
  skeleton, keeping the distant fin/eye from shining through the near cheek.
- `DigitalWhaleScene.js` frames the authored `referenceHeadBounds` for a close-up
  below the portrait copy and beside the desktop title. The slight view from
  below exposes the lower jaw like the reference. Short landscape uses the
  sampled complete swim envelope. The site's existing scene owns animation,
  prewarming, visibility, transitions and disposal.

Per-frame updates change bone matrices and shader uniforms. The treatment uses
no bitmap animation, CPU particle skinning or per-frame geometry recreation.
The asset has about 25,000 exported vertices and is Draco-compressed to about 139 KiB.
These are resource budgets, not a measured phone FPS guarantee.

The authoring Flow UV V bands encode body (0–1), pectorals (2–3), flukes (4–5)
and dorsal fin (6–7). The contour group's bands encode upper lip, lower lip,
eyelid, brow and fin edge in that order. The shader restores Blender's V after
the glTF UV flip. Do not repack/normalize these UVs as a conventional texture atlas.

Validation:

```powershell
node --test src/three/scenes/home/mobileWhale/mobileWhale.test.js src/three/scenes/home/particleResolution.test.js
```

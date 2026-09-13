# Mobile whale

Original whale geometry authored in Blender 4.2. `MobileWhale.blend` contains the
editable mesh, Flow UVs, nine-bone rig, six-second `MobileWhale_CalmSwim` action and
a lit studio camera. No geometry from the former whale is used.

The model follows the supplied references through a smooth broad head, a quiet
closed mouth, small lateral eyes, long pectoral fins and swept flukes. The
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
  skin and animation under the preloader. Mobile asset selection happens once;
  rotating a phone reuses the same prepared resources.
- `mobileWhaleMaterial.js` draws the longitudinal dots, light bands and glints
  in a skinned surface shader. Body and facial details use two material groups;
  the small surrounding particle trail uses one additional draw per scene pass.
- `DigitalWhaleScene.js` uses the sampled swim envelope for a stable portrait
  close-up below the copy (tail may extend past the right edge) or a complete
  silhouette beside the landscape copy. The site's existing scene owns animation,
  prewarming, visibility, transitions and disposal.

Per-frame updates change bone matrices and shader uniforms. The treatment uses
no bitmap animation, CPU particle skinning or per-frame geometry recreation.
The asset has about 20,000 vertices and is Draco-compressed to about 120 KiB.
These are resource budgets, not a measured phone FPS guarantee.

Validation:

```powershell
node --test src/three/scenes/home/mobileWhale/mobileWhale.test.js src/three/scenes/home/particleResolution.test.js
```

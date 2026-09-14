# Reference-driven spatial creature

The visible creature is one GPU-skinned Three.js Points cloud. Its reference
image is used offline for authoring only. There is no visible triangular skin,
UV dot pattern, opaque depth mask or hand-placed star layer.

## Source and regeneration

`reference.png` is the clean 1672 × 941 artwork supplied with the user's pack.
Only this reference image is used from that pack, not its alternative model.
`extractReferenceFilaments.py` finds cyan ridge centerlines in the image,
thins them, follows their tangents, and smooths them along arc length. A coarse
pass owns the principal geometry; a fine pass preserves faint ribs outside
its exclusion corridor. Continuation through unlit gaps is reconstructed along smooth tangents.
Bright halos are illumination, not circular geometry. `flowGuidanceLatest.png` is the final full-composition search/role guide: red
main, yellow secondary. Unmarked clean-reference details provide tertiary and
faint filaments. The earlier `flowGuidance.png` / `flowGuidanceFull.png` remain
inputs only for reproducing the superseded extraction command.
Its brush width and wobble do not become geometry. The clean image determines
the actual curves, including fine unmarked lines.

`referenceFilamentPaths.json` stores the result in the original 1219 × 679
reference coordinate system: positions, a whole-line category (0–3), and separate sqrt(linear-sRGB
luminance). Every connected line keeps one of four appearance roles. Dark
reference segments do not change that role or remove beads; lighting only
adds highlights on top of its base radiance.

To reproduce extraction, use Python with NumPy and Pillow:

```powershell
python tools/assets/mobileWhale/extractReferenceFilaments.py --sigma 1.65 --threshold .50 --beta .60 --coherence .50 --minimum 9 --fair 1.7 --max-curvature .22 --gap 4.5 --name reference-extraction-coarse
python tools/assets/mobileWhale/extractReferenceFilaments.py --sigma 1.25 --threshold .65 --beta .65 --coherence 0 --minimum 8 --fair 1.3 --max-curvature .22 --gap 4.5 --name reference-extraction-fine-stable
python tools/assets/mobileWhale/extractReferenceFilaments.py --merge reference-extraction-coarse reference-extraction-fine-stable --name reference-extraction-final
python tools/assets/mobileWhale/extractReferenceFilaments.py --polish reference-extraction-final --name reference-extraction-faired
python tools/assets/mobileWhale/extractReferenceFilaments.py --connect-latest reference-extraction-faired --name reference-extraction-smooth-final
Copy-Item output/mobile-whale/reference-extraction-smooth-final.json tools/assets/mobileWhale/referenceFilamentPaths.json
```

`referenceContours.json` supplies the broad foreground mask, hidden rounded
volume, and rig landmarks. It does not determine the visible filament paths.
`anatomicalParticles.py` places one bead chain per extracted filament with a
2.9-reference-pixel step, irrespective of brightness. Junction duplicates are
suppressed. Source light interpolates linearly so it cannot invent highlights. Main and
secondary roles are assigned to complete guided paths, never bright fragments.
The broad main arcs receive a final 5.5 px fairing pass; tight short anatomy
uses a smaller radius. True endpoints soften; graph junctions and unlit
interior spans retain the continuous line.
`creatureSurface.py` is the shared three-dimensional surface for both the
editable skin and particle curves. Reference positions are its authoring
coordinates: each maps to a spatial point on the rounded body, fin or tail.
Continuous chart blending removes the old fin-to-body depth jump. Surface
normals come from derivatives of this final shape; the same chart weights
bind skin and particles to the nine-bone rig. Regeneration rejects spatial
depth discontinuities before publishing the GLB.

`prepareMobileWhale.py` builds the editable envelope, the exact loose particle
vertices, and a nine-bone six-second swim in `MobileWhale.blend`. Edit the
Python/JSON sources first: regeneration replaces manual Blender edits.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --factory-startup --python tools/assets/mobileWhale/prepareMobileWhale.py
```

`packParticles.mjs` appends a Draco-compressed POINTS primitive to the rigged
staging GLB. Only the complete result replaces `public/models/home/whale-mobile.glb`.
Joint IDs are integers; normalized byte weights sum exactly to 255. The existing
general Draco decoder supports POINTS; the optimized glTF mesh-only decoder does not.
The asset format marker `four-line-roles-surface-v2` protects the shader/data
contract. `_LIGHT` stores role, independent illumination, endpoint envelope
(or wake phase), and kind; `_SHELL` stores the exact near/far hemisphere.
After publishing a changed GLB, bump `MOBILE_WHALE_URL` to invalidate old caches.
Intermediate files and diagnostic renders live in ignored `output/mobile-whale`.

## Runtime

`loadMobileWhale.js` prepares the shared skeleton, material, and point geometry
under the preloader. `SkinnedWhalePoints` uses Three's GPU skinning chunks.
The hidden envelope shares the same rig. Animation updates bones and uniforms;
it never uploads a new position buffer or rebuilds materials.

One point draw includes body and silhouette emitters, before existing bloom.
Light catches individual beads. Additive blending preserves gaps; far-side
transmission is zero. Shell visibility is separate from the surface lighting
normal: tangent rim normals must not cut holes in whole contours on yaw.
Faint front-side filaments have lower radiance/opacity.

The bounded emitters share the rig and detach along curling shader waves.
Birth/death fade to zero before wrapping. Density hides a stable subset of
prepared points; speed, travel and waviness are uniforms. No runtime spawning.
Medium/low quality also uses a stable subset, retaining main/secondary curves.
The common current defaults to 15° right/up; it is added after skinning so fin
rotation cannot reverse the flow. Pixel-filtered Gaussian beads avoid subpixel
flicker that would otherwise look like gaps.

Prepared per-joint influence cages bound the full swim without per-frame scans.
The mesh and rig survive resizing and leaving/returning home. Budget: fewer than
35,000 points and a complete animated GLB below 1.5 MB.

## Appearance controls

Site defaults: `src/three/scenes/home/mobileWhale/particleAppearance.js`.

- `global`: color and brightness/size/bloom/opacity multipliers for every body
  level. A multiplier of 1 preserves the source curve. Color shifts its palette.
- `levels`: optional detailed tuning of the four whole-line roles.
- `wake`: independent color, brightness, size, bloom, opacity, density (0–1),
  speed, travel distance, waviness and shared flow direction (degrees). Motion multipliers default to 1.

All inputs update prepared uniforms. Brightness never adds extra rows or changes
spacing. Bloom controls local halo and HDR radiance fed into existing bloom,
without adding another render pass.

Open `/tools/assets/mobileWhale/preview.html` on the Vite dev server.
`appearanceControls.js` mounts the authoring panel. It starts on «Все 4 уровня»;
«Отлетающие частицы» exposes the separate wake controls. Detailed levels are
optional. Changes persist in this browser and reach the main site on reload.
Reset restores file defaults; Download JSON exports the complete configuration.
The animation toggle must be enabled to review wake motion in a paused preview.
«Только основные» temporarily isolates main curves with file defaults, without
changing saved settings; «Все частицы» restores the current browser preset.
«Объём» exposes a −45°…+45° turn control over the actual model transform; it
does not switch to another image or construct alternate geometry.

## Validation and limits

```powershell
node --test src/three/scenes/home/mobileWhale/mobileWhale.test.js src/three/scenes/home/particleResolution.test.js src/three/scenes/home/heroText/HeroTextMesh.reveal.test.js
```

Tests decode the shipped POINTS data and validate four line roles and independent source-light range, skin
weights, fin/tail motion, bounds, unchanged position buffers, and independent
uniform controls. Visual review is still necessary: source bloom can obscure
filaments and cause short gaps, especially around the brightest crest. A single
image constrains the authored frontal pose, not an exact unseen 3D reverse side.

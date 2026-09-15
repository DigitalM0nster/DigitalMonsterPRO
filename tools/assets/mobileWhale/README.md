# Reference-sculpted creature for home

The supplied clean reference remains the authority for the head, broad rounded
jaw, swept pectoral fin and the paths forming the eye. The latest instruction
changes the tail: its lobes now lie horizontally in 3D and flex independently
of the much quieter tail stalk.

The visible creature is actual `GL_POINTS` sampled over an authored closed 3D
surface. There is no animated body texture, UV deformation, eye overlay, seam
strip or star card. `bodyCurrentPaths.json` contains the continuous body currents:
the two paths forming the eye start at the head and continue along the body.
Shape-preserving cubic interpolation avoids overshoot between reference knots.
`surfaceParticles.py` samples each curve by its 3D arc length (about 4.3 reference
pixels between beads), adds throat meridians, sparse fin rows and a quiet surface
population. Four light strengths distinguish the main currents from the volume.
Actual normals and a shared moving light determine the individual highlights.
Pectoral rows begin as cubic continuations of the body chart before becoming
fin rows, so their attachment does not draw a transverse particle seam.

`MobileWhale.blend` contains the editable surface, loose-vertex particle cloud,
13-bone rig and seamless six-second `MobileWhale_CalmSwim` action. The pectoral
attachment inherits the depth and weights of the body. Its depth is taken from
the attachment itself, preventing the folded slash caused by projecting later
fin sections back onto the shrinking belly. Tip motion lags behind the fin roots;
the tail lobes flex more strongly while body drift remains under 3 reference pixels.

## Regenerate

From the repository root in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --factory-startup --python tools/assets/mobileWhale/prepareMobileWhale.py
```

This replaces the master and `public/models/home/whale-mobile.glb`. Review outputs
are `output/mobile-whale/anatomy.png`, `particles.json` and `particle-path-audit.json`.
Edit JSON paths / Python sources before regenerating; the generator replaces
manual master edits. `packParticles.mjs` appends the compressed point primitive
using the GLB's actual joint order and normalized skin weights.

After regenerating the base, restore the directional actions (also safe to run
directly when only adjusting reactions):

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --python tools/assets/mobileWhale/authorWhaleReactions.py
```

The master contains `Whale_LookLeft`, `Whale_LookRight`, `Whale_LookUp`,
`Whale_LookDown`, `Whale_ClickResponse`, and `Whale_EntranceStroke` in addition to the original swim. Select an action in Blender's
Action Editor and scrub frames 1–49: neutral → supported reach, with tail
counterbend and delayed fin tips. The object transform remains fixed.
`authorWhaleReactions.py` controls the keyed angles and timing. Its exporter
explicitly disables “single armature/all actions” so Blender does not merge the
swim into each reaction. `mergeWhaleReactions.mjs` replaces only reaction tracks;
the existing compressed geometry, particles and swim bytes remain intact.

Runtime uses the same mixer and skeleton: four directional actions and two
complete gestures are bound before Start, referenced to their neutral first frame.
The pointer spring blends directional weights, avoiding the double
braking that scrubbing eased clips causes at neutral. Screen X reverses the
authored yaw to match the site camera. Diagonal targets are bounded to a unit
circle before the spring so they approach the limit without an early hard stop.
Releasing the pointer,
DOM blockers, touch input or reduced-motion returns the pose to swimming. The
local particle highlight is independent. Prepared bounds include eight reach
directions at four swim phases, plus the click response and entrance power stroke. No new meshes, shaders or point-buffer updates
are introduced by interaction. The combined GLB remains below 800 KB.

`whaleSurfaceInteraction.js` prepares one ellipsoid per influenced bone for cheap
body hits; it never raycasts or skins the full point cloud per frame. Hover lights
the surface without displacing particles or changing its silhouette. A short click
or tap plays the two-second response with the sonar wave, picks the nearest posed
skin triangle once and stores its barycentric bind-space
position/normal. A model-space light front uses 3D distance with a curvature correction,
so it deforms with the skeleton and projects with the whale's perspective instead of
remaining a screen-space circle. This is an inexpensive surface-distance approximation,
not a geodesic solver. Precise triangle picking happens only on accepted taps; hover
keeps the bone proxies and propagation uses uniforms only. Repeated taps are rate
limited, and movement over 10 CSS pixels, wheel, cancel, blur and UI blockers
cancel the tap. Window hit events use the same home hex Y-band owner as rendering.
Mouse tracking begins during the whale's entrance, as soon as Start is active.
Touch movement keeps native scrolling. Reduced motion subdues the response and
sonar brightness. All interaction uniforms and
animation bindings exist before the loader opens.

The first entrance uses `whaleEntrance.js`: a configurable 7.2-second curved
approach from soft depth, starting at screen NDC (.79, .18). The authored entrance
stroke loops during the approach and fades into the calm swim before arrival.
Camera-space travel compensates perspective for a smooth apparent approach;
the parent scene transform is inverted before applying the position locally.
`modelColor` controls the prepared surface material independently of particle
`colorTint` and wake color; it is visible when `modelOpacity` is above zero.
The prepared swim continues from 0.8x to normal speed without restarting its phase.
Position and ambient sway settle continuously into the idle composition.
Reduced motion uses the settled pose. `whale.scale` also controls the fitted size
after resize/reload (0.03 is the original composition; 0.033 is 10% larger).

`whaleComposition.js` keeps the fitted view in three-quarter perspective: the head
is nearer the camera and the tail recedes rightward into depth. All three whale
materials use the same view-depth mist; distant particles soften and lose light
without increasing their energy. This remains independent of DPR and does not
add a blur pass or change the ocean fog. Resize preserves the perspective.

## Runtime and budget

- `loadMobileWhale.js` loads and prepares the same asset on desktop and mobile
  before Start. The point cloud and depth surface share one rig and bone texture.
  A conservative per-bone cage samples the full swim envelope in separate frames.
- One body point draw, one skin surface draw and one wake draw. The surface writes
  depth only at full model opacity and reveal. Transparent skin leaves rear fins
  and particles visible; changing opacity does not rebuild or recompile materials.
- `mobileWhaleTrail.js` restores the original forty spray vectors with forty-eight
  prepared particles each. Every vector starts from a small distributed source
  patch rather than one pixel. The complete draw lives in creature space: fin
  bones, cursor turns, clicks and entrance maneuvers cannot rotate, accelerate,
  brighten or cull the spray. Seeded ages and dispersion retain the irregular
  multi-direction fan, and all resources exist before Start.
- Frame updates change bones and uniforms only. No CPU point skinning, changing
  bitmap texture, buffer upload or resource rebuild is used for swimming.
- The export contains about 20,500 surface points and is about 800 KB, within
  the 800 KB asset budget. These are bounded costs, not measured phone FPS.
- The contour preview uses the current implementation and retains model/reference,
  overlay, close-up, full view, animation and volume controls. The original-V3
  switch was removed.

Validation:

```powershell
node --test src/three/scenes/home/mobileWhale/mobileWhale.test.js src/three/scenes/home/particleResolution.test.js src/three/scenes/home/heroText/HeroTextMesh.reveal.test.js
```

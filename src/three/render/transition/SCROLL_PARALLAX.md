# Scroll parallax direction — project rule

**Default:** scrolling should feel like moving down a page.

| Wheel / leave | `sceneProgress` (current) | Scene in frame |
|---------------|---------------------------|----------------|
| Scroll **down** (forward leave) | → `+1` | Content / site moves **up** |
| Scroll **up** (backward leave) | → `−1` | Content / site moves **down** |

Implementation: camera (and usually lookAt.y) move **down** as `sceneProgress` increases, so the world rises in the viewport. Reverse on negative progress.

Related: [`CAMERA_CONTINUITY.md`](./CAMERA_CONTINUITY.md), [`CAROUSEL_SCROLL_SPRING.md`](./CAROUSEL_SCROLL_SPRING.md), helper [`applySceneProgressToCamera.js`](../../scenes/utils/applySceneProgressToCamera.js).

---

## Canonical mapping

For progress-driven cameras:

```text
sceneProgress +  →  camera.y ↓  (+ lookAt.y follows)  →  content rises
sceneProgress −  →  camera.y ↑  (+ lookAt.y follows)  →  content falls
```

`applySceneProgressToCamera`:

- `scrollY` / `scrollZ` are **magnitudes** (≥ 0).
- `y = base.y - p * scrollY`
- `lookAt.y` follows the same ΔY by default (`lookAtFollowY !== false`) so the frame **translates**, not only pitches.
- Optional `scrollZ` dolly is secondary; vertical rise/fall is the primary “page scroll” cue.

**Speed (not distance):** cameras follow `sceneProgress`, which chases `sceneProgressTarget` with `CAROUSEL_SCENE_PROGRESS_SMOOTH` in `SceneCarousel.js`. Keep this near or above ring `CAROUSEL_PROGRESS_SMOOTH` so the vertical move does not lag the wheel. Tunable amplitude (`scrollY` / hero Y anchors) is separate from this chase rate.

Home hero uses the same rule via Y anchors (`yBottom` at `p = +1`, `yTop` at `p = −1`) and lookAt Y tracking the camera ΔY.

---

## Exceptions

Pages **may** opt out when product/art needs a different feel. Document the exception in the scene (comment or config).

| Page | Status |
|------|--------|
| Home | Follows rule (Y anchors + lookAt follow) |
| Portfolio hub | Follows rule (`scrollY` + lookAt follow; light `scrollZ`) |
| Contacts (placeholder) | Follows rule |
| About | Follows rule on **enter/leave** (`sceneProgress`); interior story owns content motion separately |
| Portfolio cases | Own case scroll — not carousel `sceneProgress` (separate system) |

To mark an exception in code:

```js
applySceneProgressToCamera(camera, {
  ...base,
  scrollY: 0,              // no vertical page parallax
  lookAtFollowY: false,    // if lookAt must stay pinned
}, sceneProgress);
```

Do not invert signs ad hoc (`+ p * scrollY` for “down”) without updating this doc — that breaks the site-wide feel.

---

## Do / don’t

**Do**

- Treat scroll-down → content-up as the default for new carousel pages.
- Keep lookAt.y in sync with camera Y for translation parallax.
- List intentional exceptions here when adding them.

**Don’t**

- Pin lookAt.y while only moving camera Y (reads as pitch/tilt, not page scroll).
- Drive only `scrollZ` when the page should feel like vertical scroll (hub/home).
- Flip direction on one page without declaring an exception.

---

## Checklist for a new carousel camera

1. Forward leave (`sceneProgress → +1`): does the main content rise?
2. Backward leave (`→ −1`): does it fall?
3. If not — is this a documented exception?
4. Does lookAt follow Y when using vertical parallax?

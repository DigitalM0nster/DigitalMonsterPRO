# Page interaction ownership — hex Y-bands

**Rule:** page content (clicks, hovers, raycasts, pointer-tilt, page-local HTML hits) is owned by the scene that currently owns the pointer’s **screen-Y band**. Global chrome (left menu, scroll navigator page dots, locale) stays site-wide.

Parent contract: [`SITE_TRANSITION.md`](./SITE_TRANSITION.md)  
Camera continuity: [`CAMERA_CONTINUITY.md`](./CAMERA_CONTINUITY.md)  
Scroll spring: [`CAROUSEL_SCROLL_SPRING.md`](./CAROUSEL_SCROLL_SPRING.md)  
Hit helper: [`../overlay/hexHitOwnership.js`](../overlay/hexHitOwnership.js)

---

## Who may interact

| Condition | Interactive scene |
|-----------|-------------------|
| Carousel / hex at rest (`mixProgress ≤ ε`) | `carousel.currentId` (or hex source while click-locked at ≈0) |
| Mid hex / carousel mix (`mixProgress > ε`) | **Y-band owner**: source or target (see below) |
| UI canvas blocker (`pointerBlocked`) | **none** |
| Case page outside carousel hub | `activeId` at rest; same Y-band rule during case hex / boundary mix |

### Y-band mapping (cheap approx of hex wipe)

`P = mixProgress`, forward = reveal from **bottom**, backward = reveal from **top**.

| Direction | Top band | Bottom band |
|-----------|----------|-------------|
| Forward | source (current), height `(1−P)` | target (next), height `P` |
| Backward | target (previous), height `P` | source (current), height `(1−P)` |

Example: forward `P = 0.8` → top **20%** current, bottom **80%** next.

This is **not** per-hex-cell CPU hit-testing (too expensive / fiddly). Match the product band; visuals may be jagged near the wipe.

---

## Central gate

Implemented in `SceneManager._resolveInteractiveSceneId` / `update`:

- Non-owner scenes get `pointerBlocked: true`, `pointerDown: false`, `pointer: {0,0}`, `interactionEnabled: false`.
- Owner scene gets the real pointer.
- HTML / window listeners that bypass SceneManager **must** call the same helper (`sceneOwnsHexHitAtClientY` / `caseChromeOwnsHexHitAtClientY`).

Scenes may still self-check `interactionEnabled` (hub plates) so a missed gate cannot open a case from a neighbor layer — but must **not** re-ban solely because `hexProgress > 0`.

---

## Per-surface checklist

| Surface | Must gate on |
|---------|----------------|
| Portfolio hub plates / projects list | `interactionEnabled` from SceneManager (Y-owner) |
| Home pointer tilt | SceneManager zeroed pointer when not owner |
| Hero text waves (`HeroTextMesh` window listeners) | `sceneOwnsHexHitAtClientY("home", clientY)` |
| About stage sub-buttons (navigator) | About in mix set + `sceneOwnsHexHitAtClientY("about", …)` |
| Case arc DOM / panel HUD hits | `caseChromeOwnsHexHitAtClientY(clientY)` |
| Case WebGL tilt / spin | SceneManager ownership |
| OrbitControls / drag-camera on a page | idle current / Y-owner only |

---

## Do / don’t

**Do**

- Route WebGL pointer through SceneManager ownership.
- Reuse `hexHitOwnership.js` for every HTML / `window` hit path.
- Keep previous/next scenes updating for visuals without accepting the other band’s hits.

**Don’t**

- Hard-disable all page interaction for the whole screen whenever `hexProgress > 0`.
- Raycast / open cases on hub while another scene owns the pointer Y.
- Leave OrbitControls attached to the shared canvas from a non-owner page.
- Implement per-cell hex hit tests on the CPU for ordinary clicks.
- Rely only on mesh visibility — dormant neighbors can still be in the active render set.

---

## Checklist for new interactive content

1. Does it run only when SceneManager marks `interactionEnabled`, **or** does HTML call `hexHitOwnership` with `clientY`?
2. During mix, can both source and target receive hits in their bands (not only the settled current page)?
3. Is global chrome intentionally excluded from the Y gate?
4. Is the cost O(1) per event (no extra full-scene raycasts on the non-owner)?

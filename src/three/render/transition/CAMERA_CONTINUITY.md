# Camera continuity — no jumps across carousel pages

**Rule:** page transitions (wheel, reverse, hex) must not teleport the shared camera. Pose changes only through `sceneProgress` / documented blends.

Parent contract (all routes): [`SITE_TRANSITION.md`](./SITE_TRANSITION.md)  
Canonical scroll feel: [`CAROUSEL_SCROLL_SPRING.md`](./CAROUSEL_SCROLL_SPRING.md)  
Scroll parallax direction: [`SCROLL_PARALLAX.md`](./SCROLL_PARALLAX.md)  
Pointer ownership (clicks/hovers): [`PAGE_INTERACTION.md`](./PAGE_INTERACTION.md)  
Reference cameras: home (`DigitalWhaleScene`), hub (`PortfolioHubScene`) — progress-only, no lifecycle teleports.

---

## Authority

| Owner | When |
|--------|------|
| `sceneProgress` (+ scene base pose) | Always for carousel layers |
| Hex / mix | Progress-driven poses on both layers |

`resetCarouselState` / ring dormant / leave-pose may reset **content** (story, meshes). They must **not** write `camera.position`.

About has **no OrbitControls** — camera is progress-only like home/hub. Do not reintroduce shared-canvas orbit on About (it fights leave/mix and steals drags from other pages).

---

## Carousel page enter (Contacts pattern)

Carousel placeholders (contacts) use **fixed** `CAMERA_BASE` + `sceneProgress` only.

Do **not** arm a far-Z enter dollie (`z=16 → 9`) on ring dormant / mix preview for carousel pages. Content reveal (opacity/scale/HUD) is fine; camera Z jump is not.

Portfolio **cases** may keep a separate enter dollie — they are not ring pages.

---

## About route-edge ↔ ring

While About owns leave overshoot (`adoptAboutBoundaryDrive`), ring `progress` mirrors the edge. If the user cancels leave and story returns interior:

- Clear boundary drive.
- Set `progressTarget = 0` and clear `scrollIntent`.
- **Do not** assign `progress = 0` — let chase return to rest so mix/camera ease out.

---

## Do / don’t

**Do**

- Drive cameras from `sceneProgress` (and hex freezes where already documented).
- Keep leave-pose / ring-dormant content resets without camera writes.
- Match contacts (and future carousel pages) to hub: no far-Z enter on the ring.

**Don’t**

- Reset camera in `resetCarouselState`.
- Hard-zero carousel `progress` when aborting About leave.
- Start contacts approach from a far enter-Z after dormant.
- Attach OrbitControls (or any drag-camera) on About to the shared canvas.
- Hide a still-mixed case with `scale→0` when `hexProgress≈0` (settle / first enter frame) — use mix source/target + interaction lock, then visibility-only hide. See `.cursor/rules/no-visual-snaps.mdc`.
- Leave FOV unset in `applyCamera` — the camera is **shared**. Hub defaults to FOV 40; home/cases use 50. If a case omits `camera.fov`, hub→case looks zoomed-in and case→home jumps farther.

---

## Checklist for a new carousel scene camera

1. `applyCamera` / `applyScrollCamera` = base pose + `sceneProgress` (home/hub shape).
2. No camera writes in `resetCarouselState`.
3. No shared-canvas OrbitControls on ring pages unless product explicitly requires idle-only orbit **and** [`PAGE_INTERACTION.md`](./PAGE_INTERACTION.md) gates are met.
4. Optional enter motion: animate content, not a discontinuous camera jump on the ring.
5. Portfolio ↔ scene ↔ neighbors: reverse and interrupt leave no pose pop.

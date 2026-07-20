# Site transition continuity — one logic for every route

**This is the binding contract for every page↔page, stage↔stage, and chrome leave/enter on the site.**  
Scroll feel, cameras, pointer bands, and “no snaps” are chapters of the **same** model — not separate products.

| Layer | Canonical doc / code |
|-------|----------------------|
| **This contract (leave/enter ownership)** | `SITE_TRANSITION.md` (here) |
| Scroll spring shape | [`CAROUSEL_SCROLL_SPRING.md`](./CAROUSEL_SCROLL_SPRING.md) + `segmentScrollSpring.js` |
| Cameras | [`CAMERA_CONTINUITY.md`](./CAMERA_CONTINUITY.md) |
| Pointer / hits | [`PAGE_INTERACTION.md`](./PAGE_INTERACTION.md) |
| Leave decision publisher | [`siteTransitionIntent.js`](./siteTransitionIntent.js) |
| About left HUD (story mosaic) | [`../../about/ABOUT_PANEL_HUD.md`](../../about/ABOUT_PANEL_HUD.md) |
| Agent mirror | `.cursor/rules/no-visual-snaps.mdc` + `AGENTS.md` |

---

## One sentence

At any moment **exactly one progress owner** drives motion; when a leave is **decided**, chrome and scenes start their **animated** exits from that decision; nothing that is still on screen may hard-cut, collapse scale, or teleport the camera.

---

## Progress ownership (never two wheels at once)

| Situation | Owns wheel / story progress |
|-----------|------------------------------|
| Ring page (home, hub, contacts) | `SceneCarousel` spring |
| About current | About story spring (same formula); ring mirrors only on route-edge leave |
| Case open (`openedCase`) | Case story spring (same formula); edge → case-boundary mix |
| Hex click / menu nav locked | Hex phase owns the frame; springs paused |

Abort leave → clear boundary drive, aim `progressTarget` to rest — **do not** hard-assign `progress = 0`.

---

## Leave decision = one publisher

Every navigation that changes the visual route must call:

```js
publishSiteRouteTransition(fromPath, toPath, { mode })
```

(`siteTransitionIntent.js`)

| `mode` | Who calls |
|--------|-----------|
| `hex` | `requestHexNavigation` (menu, dots, CTA, history, hub→case) |
| `case-boundary` | Case scroll commit to adjacent case |
| `about-boundary` | About scroll commit to ring neighbor |
| `ring` | Ring spring commit (optional chrome no-op) |
| `html-fallback` | Only if URL moved without the above (must still publish once) |

**React / `routePhase` / `clickTransitionActive` must not start chrome exits.** They may only observe (skip paints, wake rAF). Starting exit from a `false→true` edge is forbidden — that edge is missed when already locked.

---

## What the publisher does (chrome)

| From → to | Chrome action |
|-----------|----------------|
| Case → non-case | Full HUD mosaic exit + **arc orbit exit** (same path as appear) |
| Case → case | Band HUD mosaic only; **arc stays** (session alive) |
| Non-case → anywhere | No case chrome exit |

Idempotent: second publish while already exiting does not restart mid-animation.

---

## What scenes do (3D)

1. **While mix participant** (source or target of hex / case-boundary / ring mix — including `progress≈0` settle frames): keep framing. Detect by source/target + interaction lock, **not** by `hexProgress > 0` alone.
2. **Hide after hold ends:** visibility / dormant opacity / stash — **not** `scale→0` (reads as camera zoom-out).
3. **Cameras:** only `sceneProgress` / documented blends — never write pose in `resetCarouselState`. Every `applyCamera` must set **FOV** (shared camera; hub=40, home/cases=50) or hub→case looks zoomed-in and leave jumps.
4. **Always-on meshes:** hub plates, case models, hero text stay prepared; animate uniforms/opacity/reveal.

---

## Appear / disappear (product law)

| Element | Enter | Leave |
|---------|-------|-------|
| Right case arc | Orbit park → rest + opacity | Orbit → park + opacity (module session) |
| Left case HUD | Mosaic enter after `hudReady`, `enterProgress=0` first | Mosaic exit (full or band) |
| Ring pages | Dormant → `playEnterAnimation` after next-only reset | Live as `previous` for reverse; next-only dormant |
| Global chrome (left menu, dots, locale) | Always mounted | Not page-leave mosaic; not Y-gated |
| Home «листайте вниз» | Home visual page only | Hide when `currentPage !== "/"` or `openedCase` — never gate on `carousel.currentId` (stale after home→case) |
| Case stage rail | Opacity follows full HUD `enterProgress` | Outside mosaic bounds — must fade via `stageRailOpacity`, not pop at 1 |

Unmount / `opacity=0` / `visible=false` is allowed only **after** the leave animation finishes (or for elements that were never shown).

---

## Responsiveness

- One owner → one spring → no fighting deltas.
- Chrome exits start at decision time → user sees leave immediately, not after HTML EXIT_MS.
- Hex may defer HTML `routePhase`; 3D + case chrome must not wait on that timer.
- Interrupt / reverse must ease back — no snap restore.

---

## Checklist before shipping any transition change

1. Leave goes through `publishSiteRouteTransition` (or a documented commit that calls it).
2. No new `playCasePanelHudExit` / `playCaseArcOrbitExit` from React effects.
3. No `scale→0` / camera teleport while the layer can still composite.
4. Forward, reverse, cancel, and queued nav (already locked) all stay continuous.
5. case→home, case→case, hub→case, about↔neighbors, home↔hub verified by eye.

If a design cannot satisfy this, propose a cheaper continuous presentation — do not add a one-off snap “just for this route”.

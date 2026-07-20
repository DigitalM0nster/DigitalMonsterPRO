# Carousel scroll spring — canonical reference

**This is the site’s reference feel for page-to-page (and stage-to-stage) scroll.**  
When adding or retuning wheel/scroll progress (carousel scenes, About stages, similar segments), copy this model. Do **not** invent idle “snap to nearest” jumps that teleport `target`.

Canonical implementation:

| Layer | File |
|-------|------|
| Shared rest + chase formula | [`segmentScrollSpring.js`](./segmentScrollSpring.js) |
| Ring owner (pages) | [`SceneCarousel.js`](./SceneCarousel.js) |
| Wheel → target | [`carouselScroll.js`](./carouselScroll.js) |
| About stages (softer rates) | [`src/about/aboutExperienceRuntime.js`](../../../about/aboutExperienceRuntime.js) |
| Site leave/enter ownership (all routes) | [`SITE_TRANSITION.md`](./SITE_TRANSITION.md) + `siteTransitionIntent.js` |
| Camera continuity (no jumps) | [`CAMERA_CONTINUITY.md`](./CAMERA_CONTINUITY.md) |
| Scroll parallax direction (down → content up) | [`SCROLL_PARALLAX.md`](./SCROLL_PARALLAX.md) |
| Page interaction ownership (clicks/hovers) | [`PAGE_INTERACTION.md`](./PAGE_INTERACTION.md) |
| Dev panel patterns (removed UI; how to rebuild) | [`../dev/DEV_PANELS.md`](../dev/DEV_PANELS.md) |

About is a **carousel page** (`currentId === "about"`). The carousel owns ring progress and commits between pages; when About is current, About experience owns the **wheel** and maps the same spring onto story stages. They are not two competing scroll systems — one formula, two owners at different times.

---

## Mental model

Two values, every frame:

| Value | Role |
|--------|------|
| `progressTarget` | Where the user is aiming. Wheel/touch **adds** to this. |
| `progress` | What is actually rendered. **Chases** `progressTarget`. |

One **segment** is local `0…1` forward (current → next) or `0…−1` backward (current → previous). **Same wheel distance either way** (~1000px at factor `0.001`).

```
wheel ──► progressTarget ──(spring rest)──► 0, +1, or −1
                │
                ▼
           progress ──(exp chase)──► visuals / commit
```

There is **no** “on wheel idle, set target = nearest stop”. Rest is **continuous**: every frame, while `progressTarget` is off the integer rest, it springs toward `0`, `+1`, or `−1` of the current segment.

---

## Wheel → target

```js
// carouselScroll.js
progressTarget += deltaPixels * CAROUSEL_WHEEL_PROGRESS_FACTOR; // 0.001
```

- ~1000px of wheel ≈ one full segment (`0→1` or `0→−1`) at factor `0.001`.
- Target range is **−1.5…1.5** (full leave unit + 0.5 overshoot on each side).
- Overshoot **(1…1.5]** / **[−1.5…−1)** is held by rest (not pulled back to ±1). On commit, leftover past ±1 is the handoff into the next owner’s target (ring post-commit, or About/case **interior** story).

---

## Per-frame order (must keep this order)

From `SceneCarousel.update` (About’s tick uses the same order on story locals):

1. **Rest** — `applyLocalSegmentTargetRest(progressTarget, delta)` → `0`, `+1`, or `−1` (overshoot past ±1 held).
2. **Chase** — `chaseSegmentValue(progress, progressTarget, delta, { smooth, chaseMul })`.
3. **Snap / commit** — epsilon snap onto `0`/`±1` **only when target is resting there** (never crush overshoot), then commit scene change if needed.

Pseudo-code of the spring core:

```js
// segmentScrollSpring.js — one formula for carousel + About
progressTarget = applyLocalSegmentTargetRest(progressTarget, dt, rates);
progress = chaseSegmentValue(progress, progressTarget, dt, {
  smooth: PROGRESS_SMOOTH,
  chaseMul: getAbsChaseSmoothMul(Math.abs(progress)),
});
```

Rest branches (thresholds fixed; only `rates.*Smooth` / `finalMul` vary):

```js
if (progressTarget > 1 || progressTarget < -1) {
  // hold overshoot — leftover for commit handoff
} else if (progressTarget > -0.5 && progressTarget < 0.5) {
  // return toward 0
} else if (progressTarget >= 0.5) {
  // advance toward +1 (forward leave)
} else {
  // retreat toward −1 (backward leave) — same work as forward
}
```

`exp` decay is in **1/s**: smaller smooth ⇒ softer / slower spring.

---

## Commit

### Segment ends (symmetric distance)

| Direction | Commit when | After commit |
|-----------|-------------|--------------|
| Forward | `progress >= 1` | `progress = 0`, `target = target − 1` (clamped into (−0.5, 0.5)) |
| Backward | `progress <= −1` | `progress = 0`, `target = target + 1` (clamped into (−0.5, 0.5)) |

Hex mix: `mixProgress = |progress|`. While `progress < 0`, mix source→target is **current → previous** (not next).

Do **not** commit backward on a tiny dip below `0`. That made scroll-up from rest feel instant compared to scroll-down.

### Intent gate (intentional asymmetry)

`scrollIntent` records the last wheel direction: `"forward"` | `"backward"` | `null`.

| Direction | Extra gate |
|-----------|------------|
| Forward | **None.** Commit when `progress >= 1 − eps` (after snap). |
| Backward | **Requires** `scrollIntent === "backward"`. Reaching `progress <= −1` alone is not enough. |

Why backward needs intent and forward does not:

- After a **forward** leave settles, leftover / spring noise can briefly park `progress` near or through `0` while the ring is still settling. Without an intent gate on backward, that noise could falsely commit **previous**.
- Forward commit at `≥ 1` only happens after a real advance rest toward `+1`; false forward commits from rest noise were not the failure mode we hit.
- Pulling backward then reversing mid-segment clears or flips intent via new wheel deltas; a stale `"backward"` intent is cleared when both `progress` and `progressTarget` rest at `0` (`_clearScrollIntentIfAtRest`).

This is **canonical**, not a bug to “fix” by symmetrizing the gate. If product later wants a forward intent gate too, document the new failure mode it prevents first.

### About entry overflow (single leftover path)

On commit into About, leftover `progressTarget − (±1)` (clamped to ±0.5) transfers once via `sceneCarouselLastCommitBoundaryOverflow` into About’s **interior story target** (entry stage 0 from portfolio, stage `STORY_MAX` from contacts): `storyTarget = entryStop + overflow`. Same units as ring segments — first stage then chases that target with the shared spring. Ring `progressTarget` lands at `0` when About takes wheel ownership. There is no second parallel overflow channel.

---

## Canonical constants

Defined in [`segmentScrollSpring.js`](./segmentScrollSpring.js), re-exported from `SceneCarousel.js` for existing imports.

| Constant | Value | Meaning |
|----------|------:|---------|
| `CAROUSEL_WHEEL_PROGRESS_FACTOR` | `0.001` | px → segment units (`carouselScroll.js`) |
| `CAROUSEL_PROGRESS_TARGET_MIN` / `MAX` | `−1.5` / `1.5` | target clamp (`SceneCarousel.js`) |
| `CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD` | `0.5` | local `< 0.5` (and `> −0.5`) → rest to `0` |
| `CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD` | `0.5` | local `≥ 0.5` → rest to `+1` |
| `CAROUSEL_PROGRESS_TARGET_RETREAT_THRESHOLD` | `−0.5` | local `≤ −0.5` → rest to `−1` |
| `CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH` | `1.5` | target → 0 rate |
| `CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH` | `1.5` | target → +1 rate |
| `CAROUSEL_PROGRESS_TARGET_RETREAT_SMOOTH` | `1.5` | target → −1 rate |
| `CAROUSEL_PROGRESS_TARGET_FINAL_ZONE` | `0.02` | near-0 final boost zone |
| `CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD` | `0.92` | near-+1 final boost |
| `CAROUSEL_PROGRESS_TARGET_RETREAT_FINAL_THRESHOLD` | `−0.92` | near-−1 final boost |
| `CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL` | `15` | × rest rate in final zones |
| `CAROUSEL_PROGRESS_SMOOTH` | `4` | progress chase rate |
| `CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD` | `0.96` | chase boost zone |
| `CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL` | `2` | × chase in tail |
| `CAROUSEL_PROGRESS_COMMIT_EPS` | `1e-4` | treat as exact 0/±1 |

**Import the helpers** (`applyLocalSegmentTargetRest`, `chaseSegmentValue`) for new segment scroll.  
If a surface needs a softer/firmer spring (e.g. About **interior** stages), keep the **same shape and thresholds**, only scale the `*_SMOOTH` / final multipliers — do not replace with hard snaps. Soft rates must **not** leak onto route-edge leave (see below).

---

## Multi-segment page stories (canonical: About)

A carousel **page** may own a multi-stage story while it is `current` (About today). That is not a second scroll engine — it is the **same** segment spring, remapped onto `storyProgress`, with a hard split between interior and route edges.

### Two zones (required)

| Zone | Story range (About) | Feel |
|------|---------------------|------|
| **Interior** | between first and last content stop (`0…STORY_MAX` exclusive of leave) | May use softer wheel scale + rest/chase rates (content pacing). |
| **Route edge** | leave start `0 → −1` (overshoot −1.5) or leave end `STORY_MAX → STORY_MAX+1` (overshoot +1.5) | **Must** use carousel wheel factor + default rest/chase rates from `segmentScrollSpring.js`. |

This is **logic, not a hack**: page↔page transitions must feel identical whether the leave is driven by the ring (`SceneCarousel`) or by a page story that owns the wheel at the boundary. Softer interior rates that also slow leave make About→portfolio feel “heavier” than home↔portfolio — that is a bug.

When adding another multi-stage carousel page later, copy this split:

1. Same formula (`applyLocalSegmentTargetRest` / `chaseSegmentValue`).
2. Soft rates / custom px→unit **only** while the target is inside content stages.
3. As soon as input pushes out of the first/last stop (or story is already on a leave segment), switch to carousel wheel + carousel rates.
4. Chase must switch as soon as **target** crosses the edge (not only after rendered `current` catches up).

### About mapping (reference implementation)

- Stages 1–4: story `0→1` … `3→4` (local `0…1` per stage) — interior rates.
- Route leave start: `0 → −1` (+ overshoot to `−1.5`) — carousel rates.
- Route leave end: `4→5` (+ overshoot to `5.5`) — carousel rates.

Commit leave when rendered `current` reaches `−1` (→ portfolio) or `5` (→ contacts) — not when `target` alone hits the edge. While overshooting, About drives carousel progress via `adoptAboutBoundaryDrive` so mix/cameras match Portfolio↔Home.

After leave, `resetCarouselState` (same dispatcher as home/portfolio) snaps About story to dormant entry: `0` as `next`, `4` as `previous`.

About wheel ownership starts on SceneCarousel **commit** (`AboutExperienceHost` + `aboutExperienceRuntime.js`), not when `AboutPage` mounts after HTML `displayPathname` exit — otherwise Portfolio→About has a scroll dead zone.

### Navigator UI

`ScrollPageNavigator` About track visuals derive from **carousel ring state** (`currentId`, `progress`, commit metadata) plus About story `stagePosition` only while the About page owns the ring. Do not re-guess About entry/exit from HTML route alone.

### Camera continuity

Multi-stage pages and neighbors must follow [`CAMERA_CONTINUITY.md`](./CAMERA_CONTINUITY.md): `sceneProgress` owns pose; no OrbitControls on About; no far-Z enter on carousel contacts; no hard-zero ring progress on canceled leave.

### Interaction ownership

Only the settled current page receives clicks/hovers/raycasts — see [`PAGE_INTERACTION.md`](./PAGE_INTERACTION.md). Neighbors may render for reverse, but must not steal input.

### Case story (same shape as About)

Desktop cases use [`caseExperienceRuntime.js`](../../../portfolio/core/caseExperienceRuntime.js) — the **same** spring shape as About (`applyLocalSegmentTargetRest` / `chaseSegmentValue`), but **full carousel** wheel + rest/chase for interior stages and edge leave (no About-soft slowdown).

| Zone | Drives |
|------|--------|
| Interior stages | `store.scroll` + `stageProgress` → right arc, left HUD stage, case 3D |
| Content-edge leave | `adoptCaseBoundaryDrive` → scroll-driven hex between adjacent **cases** (not ring) |
| Leave HUD | hex wipe cuts the screen overlay via `hexGridCutGlsl` (no mosaic exit on scroll; no Canvas snapshot) |

Cancel leave by scrolling back through 0 (wipe reverses). Commit at rendered `±1` navigates to next/prev case — **not** timed `startHexNavigation`. Click next/prev stays timed click hex + timed band exit.

Do **not** invent a second leave spring for cases; do **not** call `commitAboutRouteLeave` for case↔case.

---

## Do / don’t

**Do**

- Drive input onto `target`, render from `progress` (or chase).
- Rest `target` every frame with ±0.5 commit/return via `applyLocalSegmentTargetRest`.
- Use exp decay with dt (frame-rate independent).
- Allow reverse while springing (user can pull target the other way mid-rest).
- At route boundaries, one owner of wheel only (page story **or** carousel).
- Keep forward and backward leave the same wheel distance (full unit).
- Keep the backward `scrollIntent` gate unless a new product failure mode requires changing it.
- On multi-stage pages: soft feel **interior only**; route-edge leave = carousel feel.

**Don’t**

- Commit backward on `progress < 0` after a tiny overshoot (asymmetric / “instant” leave).
- Remove the backward intent gate “for symmetry” without replacing its anti-false-commit role.
- Apply interior-soft rates/wheel to route-edge leave (makes leave feel slower than other pages).
- On wheel idle timeout, instantly assign `target = nearestAnchor` (kills the spring feel).
- Lerp with a fixed per-frame alpha ignoring `dt`.
- Duplicate the rest/chase formula in a second file — change `segmentScrollSpring.js` once.
- Let page-story progress and carousel `progressTarget` both consume the same deltas.
- Rebuild textures/DOM every frame to fake scroll motion (see `AGENTS.md` WebGL text rules).

---

## Checklist for a new scroll segment

1. Segment is local `0…1` forward or `0…−1` backward (same thresholds).
2. Wheel adds to `target` with a clear px→unit factor.
3. Each frame: rest target → chase progress → epsilon snap → optional commit.
4. Thresholds stay at `±0.5` unless product explicitly changes commit feel.
5. Tunable strength = smooth rates only; structure stays identical to this file.
6. Forward / reverse / interrupt behave like portfolio ↔ About ↔ contacts.
7. If committing backward at segment end, decide intentionally whether `scrollIntent === "backward"` is required (carousel: yes).
8. If the segment is a **route leave** from a multi-stage page: carousel wheel + carousel rates (no interior soft scale).
9. If the segment is **interior content** on that page: soft rates allowed; must not affect (8).

# About left-panel HUD — story mosaic contract (binding)

Canonical implementation: [`aboutPanelHudStory.js`](./aboutPanelHudStory.js) (`resolveAboutPanelHudStoryPair`).  
Agent mirror: `.cursor/rules/about-panel-hud.mdc` + short pointer in `AGENTS.md`.

This is **not** the case panel HUD enter/appear path. Cases may mosaic-appear the left band on first open (`playCasePanelHudEnter`). About does **not**.

---

## One sentence

About left text is driven only by **story progress → (`from`, `to`, `mixProgress`)**. Text1 is either fully shown or wiped by text2; there is **no** timed enter/appear mosaic for About content stages.

---

## Progress owner

| Situation | Owner |
|-----------|--------|
| About route current | About story spring (`aboutExperienceRuntime`) → `syncAboutPanelHudFromStory` |
| About route leave (scroll / hex / menu) | Left HUD **baked into** the about hex layer RT (same wipe as models) — **not** screen hex-cut, **not** mosaic exit |
| Warm under curtain | Paint text1–text3 + empty; GPU-upload **all four** into the keepAlive pool; `enterProgress = 0` under curtain; visit arm sets `null` **synchronously** from warm (no async pop-in). Stage pair swaps only rebind maps — no mid-scroll upload. |
| Locale switch (live About) | Same mosaic wipe as stage: snapshot old band → paint new locale → `mixProgress` 0→1. Timing via shared `panelHudLocaleMixController` + About adapter (`aboutPanelHudLocaleMix.js`). Not `playAboutPanelHudEnter/Exit`. |

Do not drive leave with both mosaic `enterProgress` exit and hex warp. Stage scroll uses only `mixProgress`.

---

## Story → pair map (strict)

`story` is About story progress in `0…4` (stage `i` owns `i → i+1`).  
**Five-step sequence (user reference screenshots):** six authored model poses at story 0, 0.5, 1, 2, 3, 4. Each wheel gesture selects exactly one adjacent pose. Events within the same 180ms-idle wheel burst, including inertial tails and large deltas, do not select further poses. A direction reversal immediately selects the previous pose from painted progress. Only the existing story target changes; the canonical spring animates painted progress, with no pose teleport or second animation owner. Interior story motion uses a critically damped exponential chase with retained velocity: starts and reversals ease continuously instead of jumping in speed. The doubled chase coefficient compensates for the soft start; forward settling time stays within 6% of the previous response across 30/60/144fps, while the final 3↔4 step remains twice as long. Endpoint snap is limited to 0.001 story units. Route-edge motion retains the shared carousel chase. Keyboard arrows follow the same sequence. Touch retains continuous spring-driven input, with equal normalized distance for each of these five segments.

| Gesture | Story interval | Model result | Left text |
|---------|----------------|--------------|-----------|
| 1 | 0 → 0.5 | Opening pose, front intact (screenshot 1) | text1 → text2, mix = story / 0.5 |
| 2 | 0.5 → 1 | Front cleared (screenshot 2) | text2 stays fully shown; no mosaic |
| 3 | 1 → 2 | Next assembly pose (screenshot 3) | text2 → text3, mix = story − 1 |
| 4 | 2 → 3 | Close assembly pose (screenshot 4) | text3 → empty, mix = story − 2 |
| 5 | 3 → 4 | Final pose (screenshot 5), half chase speed / twice the duration, also on reverse | Left band stays empty; prepared epic text appears through its existing 3.55→4 timeline |

At story 0.5 the first pair remains at mix 1 throughout the second gesture. At story 1 the text2→text3 pair starts at mix 0, without changing settled text2 pixels. Story 2 and 3 boundaries are equally seamless. Reverse uses the same mapping and restores the text2 hold. No content is repainted or uploaded for these animations. After the final step settles, a subsequent outward wheel gesture uses the existing About→contacts boundary spring; its inertial tail cannot leave About during step 5.

---

## `enterProgress` rules (About)

| Value | When |
|-------|------|
| `null` | Idle show — any non-empty left content (including text1 at story≈0) |
| `0` | Fully hidden: warm under curtain, or story≥3 empty |
| `0…1` animated | **Not used** for About leave or stage scroll |

### Hex leave (intentional)

On about↔neighbor hex, the left band texture is **composited into the About hex layer** (source on leave, target on portfolio→about enter) so glyphs appear with the wipe at mix≈0.5. While About is **actively** in a hex leave/enter (`isAboutBoundaryDrive` / click hex / `currentId !== "about"`), do **not** also screen-overlay (double draw = bright flash). After an **aborted** scroll leave, leftover `|carousel.progress|` may still settle to 0 — that must **not** keep hex ownership: screen mosaic resumes immediately so stage wipe works. Idle About uses the sharp screen overlay after bloom (no hex cut).

**Arm before screen handoff:** ring scroll does not set case `mixPreview` on About. Arm left HUD (`enterProgress = null`) while About is hex mix source/target, on hex bake, and on carousel commit into About — otherwise the first post-hex screen frame can draw warm `enterProgress = 0` (1-frame blank text1). Scene `update` runs before `carousel.update` in the app loop.

### Forbidden

- `playAboutPanelHudEnter` / `playAboutPanelHudExit` for About stage or route leave (leave = hex bake only).
- Screen-overlay hex-cut on About leave (`setHexCutFromPass` + `renderScreenOverlay` while hex live).
- Recovering a “stuck” band by playing enter while story mix should show it.
- Publishing textN→empty and then re-entering the next text with a second reveal.
- Per-frame Canvas2D→GPU full-panel uploads to animate scroll (mix is a uniform).

---

## Textures

- Three content canvases + one empty canvas, painted on locale/viewport change only; all four stay GPU-resident for the session.
- Bridge `fromCanvas` / `toCanvas` + `mixProgress` → `CaseStudyPanelHudMesh` (About bridge via `setUseAboutBridge`).
- Idle: screen overlay after bloom. Leave: bake into hex RT with models (not screen hex-cut).

---

## Verify

1. Land on About at story 0: text1 visible immediately — **no** mosaic assemble-in.
2. Scroll 0→1: text1 and text2 mosaic together (case-stage feel). Fast portfolio→about: `mixProgress` must track story every frame (no arm/prepare rewind freeze).
3. Scroll 1→2 / 2→3: same for text2→text3 and text3→empty — continuous portfolio→about scroll must not hitch/freeze on those pair boundaries.
4. Reverse through the same ranges without flash or second enter.
5. Scroll/menu leave About: **no** mosaic disappear — hex warps text per cell like models wipe; abort leave restores text.
6. Idle About: no texture upload for unchanged text.
7. Land on About: text1 already from warm buffers — **no** pop-in after route enter.
8. Ordinary arm must not `force` repaint warm canvases (races first stage mosaic).
9. First portfolio→about (home→…→about): text1 never blanks for a frame after hex — arm during mix / bake / commit.

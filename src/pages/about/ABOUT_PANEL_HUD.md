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
**Front-half wipe:** mosaic `mix` runs `0→1` only on the first half of each segment; the second half holds the settled band while 3D keeps the soft About spring.

| Story range | `from` | `to` | `mixProgress` | Meaning |
|-------------|--------|------|---------------|---------|
| `0 → 0.5` | text1 | text2 | `story × 2` | Text1 wiped by text2 |
| `0.5 → 1` | text1 | text2 | `1` | Hold text2 (3D still finishing segment) |
| `1 → 1.5` | text2 | text3 | `(story − 1) × 2` | Text2 wiped by text3 |
| `1.5 → 2` | text2 | text3 | `1` | Hold text3 |
| `2 → 2.5` | text3 | empty | `(story − 2) × 2` | Text3 wiped out |
| `2.5 → 3` | text3 | empty | `1` | Hold empty |
| `≥ 3` | empty | empty | `1` | No left band |

At an integer stop `n ∈ {0,1,2}` the active band is fully `from` of the next segment (`mix = 0` on that segment’s pair). At `story = 0`, text1 is idle full show. At `story = 1` / `2` the previous segment already held `mix = 1`, so the pair swap stays seamless.

Reverse scroll uses the same map — mix decreases on the front half only; hold zones stay settled.

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

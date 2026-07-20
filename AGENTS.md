# Digital Monster project instructions

These rules apply to every coding-agent task in this repository (Cursor, Codex, Claude Code, Gemini, and others). `CLAUDE.md` points here so non-Cursor agents load the same contract. Cursor also mirrors the preloader section in `.cursor/rules/preloader-runtime-perf.mdc` (`alwaysApply: true`) — **AGENTS.md remains the source of truth**.

## Site transition continuity (binding)

**One leave/enter logic for the whole site.** Canonical: [`src/three/render/transition/SITE_TRANSITION.md`](src/three/render/transition/SITE_TRANSITION.md) + `publishSiteRouteTransition` in `siteTransitionIntent.js`.

- One progress owner at a time (ring / About story / case story / hex).
- Leave decision publishes chrome exits — React/`routePhase` must not start them.
- Appear/disappear animated; no `scale→0` or camera teleports mid-mix; one-frame pops are bugs.
- Chapters: `CAROUSEL_SCROLL_SPRING.md`, `CAMERA_CONTINUITY.md`, `PAGE_INTERACTION.md`. Cursor: `.cursor/rules/no-visual-snaps.mdc`.

## Preloader and runtime performance (binding target model)

The product model is:

1. **Under the preloader curtain** — load, decode, build, compile, and GPU-warm everything interactive routes need. Spread work across frames (`rAF` / `yieldToNextPaint`); the loader UI must stay responsive (no multi-hundred-ms sync freezes).
2. **After Start (`appStarted`)** — the site only animates already-prepared resources (transforms, material/shader uniforms, springs, opacity). Ordinary carousel / route / hex transitions must **not** create, dispose, or rebuild meshes, materials, CanvasTextures, or GPU programs.

Canonical warm entry: `DigitalMonsterThreeApp._prepareApplication` (waits scene `readyPromise`s → optional late resource prepare → `warmupPrograms` → `_warmupRenderPipeline`). Loader Start unlocks only after this path signals ready (`setRendered` / `threeReady`), plus HTML route preload.

### TEMP — DEV fast preloader (remove later)

**TODO(remove):** `src/config/devFlags.js` → `DEV_FAST_PRELOADER = true` skips full scene/hex/HUD warm in Vite DEV so Start unlocks faster. Prod is unaffected. To test real warm in DEV: set the flag `false`, or open with `?fullWarm=1`. Delete the flag + `src/utils/devFastPreloader.js` wiring when no longer needed.

### Warm checklist (must complete under curtain before Start is honest)

Treat Start as blocked until these exist and are compiled/drawn at least once where applicable:

- All carousel / case scenes that ship assets expose `readyPromise` (including Case1).
- Portfolio hub plates built and in the scene graph.
- Home hero WebGL text created (can stay `prepareHidden` until enter reveal).
- Background HDR and scene shader programs warmed.
- Hex / bloom / compositor dry-run completed.
- **Every interactive scene gets a real RT draw under the curtain** (`warmupSceneDrawChunked` / `_warmupAllScenesAndHexPairs`) — including dormant hub and hidden cases (via `beginWarmupDraw`). **All directed ring hex pairs** (menu can jump about→home, not only adjacent) + case↔home/hub; deep-link active→home last. **`renderer.compile()` is not a draw.** Spread work: one scene update → breath → one GPU draw → breath; never stack two scene RTs + hex + bloom in one frame. Hex/underwater decode must finish on Start (gesture) before the curtain opens. If Start unlocks and a later first navigation still pays first-draw hitch, the warm gate is incomplete.
- Sound catalog: network prefetch early; decode as early as the platform allows after gesture (prefer Start path waits or overlaps decode before navigation).

Case panel HUD: shaders compile under curtain; **content CanvasTextures** are painted and uploaded in `warmCasePanelHudUnderCurtain` (all `renderTextInScene` projects × locales, GPU bind for active locale, locale swap on Start). Per-scene `keepAliveTextures` — do not dispose on bridge clear / inactive sync. Painter must `adoptWarmCasePanelHud` so first open does not allocate new textures.

### Runtime rules (after Start)

- **Reuse, don’t recreate:** hide/show or opacity/reveal uniforms. Do not `dispose()` + rebuild hero / plates / HUD on leave/return.
- **Dormant ≠ teardown:** portfolio hub dormant = enter pose + opacity 0 + HUD stashed; meshes stay alive. No empty-RT “skip draw” that cold-starts InstancedMesh on return.
- **No idle full-scene keep-alive** that steals frames from the current page. Warmth comes from prepare + staying in the graph, not from rendering the hub every frame while on home.
- **Scroll/hex ownership** stays as documented below; performance work must not reintroduce dual owners of the same wheel deltas.
- If a new feature needs heavy first-use work, **move that work into prepare**. Do not ship “lazy on first navigation” as a performance fix.

### Required verification for load / transition / scene work

- Preloader stays smooth while warming (work chunked).
- After Start: portfolio ↔ home ↔ about ↔ contacts has no hitch from recreate/compile/texture upload.
- Leaving and returning to a page does not rebuild that page’s primary meshes/text.
- Compare before/after when feasible; a transition that only *looks* correct while hitching is not done.

## WebGL text and the About page

The project previously had a known About-page performance and rendering regression. A viewport-sized Canvas2D text composition was redrawn during scroll/transition animation, exposed as a changing WebGL overlay, repeatedly uploaded to the GPU as a texture, and recomposited while internal About progress and the global carousel/hex transition interacted. This caused high CPU/GPU load, FPS drops, blurred text, and color changes.

This warning is historical and remains binding even after the legacy implementation and its files are deleted. Do not recreate the same data flow under new component, scene, overlay, or texture names.

This is **not** a ban on text in WebGL. Positive references:

- Portfolio hub text stays in the WebGL scene, participates in forward/reverse transitions, and can be partially visible during a transition without continuously rebuilding a viewport-sized text texture.
- Home `HeroTextMesh`: deformation (cursor / hex / reveal) is driven by shader uniforms over a prepared texture — not by re-uploading glyph bitmaps every frame.
- Case study left-panel HUD (`CaseStudyPanelHudMesh` + `CaseStudyPanelHudPainter`): offscreen Canvas2D paints **content** into from/to textures only when content, locale, size, or rare SYS-scroll buckets change; stage mosaic mix and motion use `mixProgress` / mosaic uniforms only.

Preserve these patterns. Do not "fix" About by removing or degrading working portfolio / case / home text.

For any About-page, case HUD, transition, Canvas2D, typography, or compositor work:

- Never redraw a full text panel and upload/recreate its CanvasTexture every frame merely to animate scroll, opacity, position, clipping, reveal, mosaic, stage mix, or transition progress.
- Reuse prepared visual resources. Animate existing meshes, transforms, masks, material uniforms, or cached textures. A bounded one-time snapshot at a transition boundary is acceptable when necessary; a continuously changing full-panel snapshot is not.
- Set `texture.needsUpdate` only when the texture pixels genuinely changed. Do not recreate textures or materials for ordinary per-frame motion.
- Keep text sharp and color-stable. Prefer nearest (or hub-equivalent) filtering for UI overlays; avoid unnecessary DPR resampling, repeated color-space conversion, and post-processing of UI text.
- If any legacy About Canvas2D-to-WebGL overlay code still exists, treat it as removal/migration material rather than an architectural template. If it has already been removed, preserve the deletion and do not introduce an equivalent replacement.

## Case study panel HUD (WebGL path)

When `caseStudy.renderTextInScene` is enabled (e.g. Nipigas):

- **Split layers (do not collapse):**
  - Left text band → offscreen Canvas2D → `CaseStudyPanelHudMesh` (WebGL screen quad).
  - Project nav (ALL PROJECTS / prev / next) → **live DOM** chrome canvas in `CaseStudyPanelHudPainter` — never rebind that ref to an offscreen warm buffer; blit warm chrome into the mounted canvas if needed.
  - Right-arc edge shade → `ScreenCompositor` (`caseStudyEdgeShadeMaterial`), not the HUD mesh.
  - Right arc stays on the HTML Canvas2D path.
- **Case enter:** left text must start **invisible** (`enterProgress = 0` before first publish / mesh show; bridge default is `0`, not `null`). `null` means idle full show — never publish warm content while enter is still `null` or the band flashes then jumps into the appear animation. Appear only via `playCasePanelHudEnter` after `hudReady`. Always paint **stage 1** (state index `0`) until that appear finishes — every case open (hub→case and case→case).
- **Idle sharpness:** composite the left HUD **after** site bloom onto the final canvas (screen overlay) while the case is open at rest. Do **not** keep left HUD embedded in the models RT while idle — that softens glyphs and shifts UI colours.
- **Hex leave:** bake the open case’s left content texture into the hex layer RT with models (`_getHexBakeOverlayTexture`). Do **not** post-bloom screen hex-cut (`setHexCutFromPass`) — the transparent text band then ghosts smoky black hex fills from the underlayer. Arc / project-nav chrome stay live DOM (never hex-baked). Target case during hub→case / case→case stays `enterProgress=0` until after hex — do not bake warm glyphs into the incoming layer.
- **Case scroll (desktop):** `caseExperienceRuntime.js` — same spring shape as About, carousel feel (not About-soft). Interior → arc/content; edge → case-boundary hex (`adoptCaseBoundaryDrive`). Leave left HUD via hex bake (above); project-nav chrome stays DOM. Do not call timed `startHexNavigation` for scroll leave.
- Paint content canvases at the **renderer** pixel ratio (not the HTML `caseCanvasDprCap`). Uploads stay content-bound only — never every scroll/stage frame.
- **Stage mosaic** (uneven tile lift on stage scroll) must run in the fragment shader from two prepared textures + uniforms. Do **not** call `drawCaseStudyPanelMosaicMix` / full-panel Canvas2D redraw every stage frame on this path.
- Shared case rAF (`caseStudyAnimationFrame.js`): `stageProgress` must not drive the WebGL panel's Canvas2D/texture upload path. HTML-only left panels may still use `registerCaseStudyPanelStagePaint` for CPU mosaic. Scroll/SYS updates for the WebGL painter stay coarse (bucketed), not 60 fps full uploads.
- Mosaic deformation applies **only** to the left text band (brand → above «ВСЕ ПРОЕКТЫ»). Project navigation stays static during stage mix — mask via `uMosaicRect` / content rect; do not mosaic the full viewport.
- Hit targets for project nav remain invisible DOM buttons synced from chrome paint hit-regions; do not reconstruct selectable DOM text for the WebGL left panel.
- Hex transitions: left HUD bakes into the hex layer RT with models (About + open case); do not screen-overlay hex-cut on leave, add a full-panel CSS/Canvas snapshot for hex, or keep left HUD in the models RT while idle. Arc / project-nav stay live DOM.

## Carousel / segment scroll spring (canonical)

Page-to-page scroll feel is defined by `progressTarget` + spring rest to `0`/`1` (threshold `0.5`) and `progress` chasing target with exp decay. **Do not** replace this with idle hard-snaps to anchors.

- **Reference (read before changing scroll feel):** [`src/three/render/transition/CAROUSEL_SCROLL_SPRING.md`](src/three/render/transition/CAROUSEL_SCROLL_SPRING.md)
- **Implementation:** `SceneCarousel.js` — About stages reuse the same shape in `useAboutExperience.js` (softer rates allowed, same structure).
- **Dormant / reset (all ring pages: home, portfolioHub, about, contacts):**
  - Ring dormant is **next-only** — `isRingDormantReason` / `RING_DORMANT_REASONS` in `sceneLifecycle.js`.
  - Becoming `next` at rest (not on the `current→next` commit frame); then when `progress` → `0` while already `next` (peek/cancel or deferred after backward leave).
  - The page you just left stays **live as `previous`** for reverse — do not wipe from HTML route leave (`setRouteState` / hero sync).
  - `became-previous` is leave-pose only (About → end story). Home / hub / contacts ignore it.
  - `playEnterAnimation` only after a ring-dormant reset (`_carouselEnterPending`).

## About left-panel HUD (story mosaic)

Binding: [`src/about/ABOUT_PANEL_HUD.md`](src/about/ABOUT_PANEL_HUD.md). Cursor: `.cursor/rules/about-panel-hud.mdc`.

- Story map only: `0→1` text1→text2, `1→2` text2→text3, `2→3` text3→empty. Mix is a uniform.
- Text1 is idle-visible at story 0 (`enterProgress = null`) — **no** `playAboutPanelHudEnter` / `playAboutPanelHudExit` for About content.
- Hex enter/leave: bake left HUD into the About hex layer (target on portfolio→about so text is visible at mix≈0.5; source on leave). While About is in a hex mix (`hexProgress > 0`), do not also screen-overlay (double draw). Idle = screen overlay after bloom. Not mosaic exit.
- Do not invent a second appear path or per-frame full-panel text uploads.

## About is a route boundary, not a normal case page

Portfolio cases use the **same** multi-stage spring as About (`caseExperienceRuntime`), but outputs differ (arc/content vs About 3D) and edge leave targets adjacent cases via case-boundary drive — **not** About’s ring leave (`commitAboutRouteLeave`). Do not invent a second case-only scroll engine.

Any About concept or implementation must account for all four directions:

- portfolio -> About;
- About -> portfolio;
- About -> contacts;
- contacts -> About.

It must also account for an interrupted or reversed transition, including valid partially revealed WebGL text. Text does not have to disappear before a hex transition; the transition composition may include model, typography, and HUD elements. What is forbidden is regenerating the full text composition every frame to achieve that look.

At a boundary, only one system may own wheel/scroll progress at a time. Internal About progress and global carousel progress must not drive the same visual state concurrently or recursively feed each other. Entry and exit states must be deterministic and reversible.

## Hex / carousel pointer ownership (Y-bands)

Page content hits stay live during hex/carousel mix, but only inside the screen-Y band owned by that scene. Canonical docs: `src/three/render/transition/PAGE_INTERACTION.md`, helper `src/three/render/overlay/hexHitOwnership.js`.

- Forward mix progress `P`: top `(1−P)` → current (source), bottom `P` → next (target). Example: `P=0.8` → top 20% current, bottom 80% next.
- Backward: invert bands. Rest (`P≈0`): full screen → current page.
- WebGL goes through `SceneManager`; HTML / `window` listeners must use the same helper. Do **not** hard-disable all page hits whenever `hexProgress > 0`.
- Keep the check O(1) — no per-hex-cell CPU hit tests. Global chrome (left menu, page dots, locale) is not Y-gated.

## Scroll / animation–driven sounds

SFX that follow stage mix, mosaic wipe, hex/carousel progress, or springs — not one-shots on wheel ticks.

Canonical: [`src/sounds/SCROLL_ANIMATION_SOUND.md`](src/sounds/SCROLL_ANIMATION_SOUND.md). Cursor: `.cursor/rules/scroll-animation-sound.mdc`.

- Drive **painted** progress (what the wipe shows), not `progressTarget` / raw wheel.
- Scrub a buffer; rate from `|d progress / dt|`; rest → soft fade stop (no idle loop after spring rAF ends).
- Paths in `SOUND_CATALOG` (`soundDesign.js`); left HUD reference: `caseStudyTextTransitionSound.js`; hex: `hexTransitionSound.js`.

## Required verification for related changes

When a task modifies About rendering, case panel HUD, scroll, typography, WebGL overlays, mosaic/stage mix, or carousel/hex transitions, verify all of the following before considering it complete:

- Idle About / case HUD performs no repeated GPU texture upload or CanvasTexture recreation for unchanged text.
- Slow scroll, fast scroll, large wheel deltas, touch/mobile input, and immediate direction reversal remain stable.
- Forward and reverse navigation through portfolio -> About -> contacts works without skipped internal content, stuck locks, flashes, or jumps.
- Reversing or cancelling a partially completed hex transition restores a valid scene state.
- Mid-hex / mid-carousel mix: clicks and hovers on page content follow Y-band ownership (current vs next/previous); global chrome still works; no full-screen interaction blackout.
- Case stage mosaic: FPS stays acceptable; no per-frame fullscreen Canvas2D→GPU upload; project nav does not mosaic; left text stays sharp and color-stable.
- Text remains sharp and retains its intended color before, during, and after transitions.
- The change does not regress the working portfolio hub WebGL text, home hero text, or case pages (HTML arc path included).
- High, medium, low/mobile graphics modes avoid unnecessary work, and animations stop when the page/scene is inactive.
- Compare performance before and after when feasible; do not accept a solution that merely looks correct while sustaining avoidable CPU/GPU work.

If a requested design cannot satisfy these constraints, call out the conflict before implementing it and propose a visually equivalent, cheaper presentation.

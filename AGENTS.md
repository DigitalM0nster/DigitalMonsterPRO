# Digital Monster project instructions

These rules apply to every Codex task in this repository.

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

- Left panel + project nav + bottom shade are painted offscreen and shown via a screen-space WebGL quad in the case scene (`CaseStudyPanelHudMesh`). The right arc stays on the HTML Canvas2D path.
- **Idle sharpness:** composite the HUD **after** site bloom onto the final canvas (screen overlay). Do not leave idle HUD only inside the models HalfFloat/Linear RT chain — that softens glyphs and shifts UI colours.
- **Hex:** temporarily embed the same HUD mesh in the models RT so hex can cut typography; when hex progress returns to rest, switch back to the after-bloom overlay.
- Paint the HUD canvas at the **renderer** pixel ratio (not the HTML `caseCanvasDprCap`). Uploads stay content-bound only — never every scroll/stage frame.
- **Stage mosaic** (uneven tile lift on stage scroll) must run in the fragment shader from two prepared textures + uniforms. Do **not** call `drawCaseStudyPanelMosaicMix` / full-panel Canvas2D redraw every stage frame on this path.
- Shared case rAF (`caseStudyAnimationFrame.js`): `stageProgress` must not drive the WebGL panel's Canvas2D/texture upload path. HTML-only left panels may still use `registerCaseStudyPanelStagePaint` for CPU mosaic. Scroll/SYS updates for the WebGL painter stay coarse (bucketed), not 60 fps full uploads.
- Mosaic deformation applies **only** to the left text band (brand → above «ВСЕ ПРОЕКТЫ»). Project navigation (all projects / prev / next) and the bottom shade must stay static during stage mix — mask via `uMosaicRect` (or equivalent), do not mosaic the full viewport.
- Hit targets for project nav remain invisible DOM buttons synced from paint hit-regions; do not reconstruct selectable DOM text for the WebGL left panel.
- Hex transitions: left HUD is already in the scene render target; do not add a second full-panel CSS/Canvas snapshot of the left text for hex. Arc snapshot behavior stays arc-only when the left panel is in-scene.

## About is a route boundary, not a normal case page

Portfolio cases keep their scroll interaction inside one route. About additionally hands scroll control to the global carousel and `hexTransition` at both boundaries. Therefore, do not copy the case-page scroll/state implementation into About without explicitly handling route-boundary ownership.

Any About concept or implementation must account for all four directions:

- portfolio -> About;
- About -> portfolio;
- About -> contacts;
- contacts -> About.

It must also account for an interrupted or reversed transition, including valid partially revealed WebGL text. Text does not have to disappear before a hex transition; the transition composition may include model, typography, and HUD elements. What is forbidden is regenerating the full text composition every frame to achieve that look.

At a boundary, only one system may own wheel/scroll progress at a time. Internal About progress and global carousel progress must not drive the same visual state concurrently or recursively feed each other. Entry and exit states must be deterministic and reversible.

## Required verification for related changes

When a task modifies About rendering, case panel HUD, scroll, typography, WebGL overlays, mosaic/stage mix, or carousel/hex transitions, verify all of the following before considering it complete:

- Idle About / case HUD performs no repeated GPU texture upload or CanvasTexture recreation for unchanged text.
- Slow scroll, fast scroll, large wheel deltas, touch/mobile input, and immediate direction reversal remain stable.
- Forward and reverse navigation through portfolio -> About -> contacts works without skipped internal content, stuck locks, flashes, or jumps.
- Reversing or cancelling a partially completed hex transition restores a valid scene state.
- Case stage mosaic: FPS stays acceptable; no per-frame fullscreen Canvas2D→GPU upload; project nav does not mosaic; left text stays sharp and color-stable.
- Text remains sharp and retains its intended color before, during, and after transitions.
- The change does not regress the working portfolio hub WebGL text, home hero text, or case pages (HTML arc path included).
- High, medium, low/mobile graphics modes avoid unnecessary work, and animations stop when the page/scene is inactive.
- Compare performance before and after when feasible; do not accept a solution that merely looks correct while sustaining avoidable CPU/GPU work.

If a requested design cannot satisfy these constraints, call out the conflict before implementing it and propose a visually equivalent, cheaper presentation.

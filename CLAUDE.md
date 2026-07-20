# Agent instructions (all tools)

Binding project rules for **every** coding agent (Claude Code, Codex, Cursor, Gemini, etc.) live in **[AGENTS.md](./AGENTS.md)**.

Read that file before changing WebGL, preloader/warmup, carousel/hex, About, portfolio hub, home hero text, or case panel HUD.

Especially binding:

1. **Preloader and runtime performance** — heavy work under the loader curtain (`_prepareApplication`, hero prepare, `warmCasePanelHudUnderCurtain`); after Start only animate prepared resources (no dispose/recreate on ordinary transitions).
2. **Site transition continuity** — one leave/enter logic: `SITE_TRANSITION.md` + `publishSiteRouteTransition` (no React chrome exits; no mid-mix scale/camera snaps).
3. **WebGL text / About** — never per-frame full-panel Canvas2D→GPU text uploads.
4. **About left HUD** — story mosaic only (`ABOUT_PANEL_HUD.md`); no `playAboutPanelHudEnter` for text1/2/3.
5. **Case study panel HUD** — content-bound paints; mosaic in shader; idle HUD after bloom.
6. **Carousel scroll spring** — see `src/three/render/transition/CAROUSEL_SCROLL_SPRING.md`.
7. **Scroll / animation–driven sounds** — scrub on painted progress: [`src/sounds/SCROLL_ANIMATION_SOUND.md`](src/sounds/SCROLL_ANIMATION_SOUND.md).

Cursor also loads `.cursor/rules/preloader-runtime-perf.mdc` (`alwaysApply`); it is a short mirror of the AGENTS preloader section, not a second source of truth.

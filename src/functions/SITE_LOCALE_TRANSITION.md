# Site locale transaction

`requestSiteLocale` / `cycleSiteLocale` are the runtime entry points. The loader may select a locale directly before `appStarted`.

Each cycle snapshots its destination before disappearance starts. Every participating DOM effect finishes disappearing and `siteLocaleReveal` reaches zero before the store locale changes. The new language then finishes appearing. Requests during either half only replace the next desired locale; they cannot retarget the current cycle. A request for the settled locale does nothing.

`createLocaleTransition` owns that sequence. Unmounting releases an effect's barrier. A component mounted during appearance joins the current appearance barrier before another cycle can start. React gets two paint boundaries after the hidden commit.

Prepared GPU owners read `siteLocaleReveal` from the browser-independent state module. They keep their natural route/story progress separately:

- Home uses its prepared GPU letter snake.
- Scene typography uses `SceneTextLocale` and its existing reveal.
- Film descriptions, captions and compact UI use the film digital tile effect.
- About HUD wraps the existing stage mosaic with locale motion; the current story pair and mix remain intact. Epic typography uses its existing signal rewrite.
- Arc titles use `sceneHudAtlas` and the approved `hudSnakeGlsl`. The atlas, order map and replacement symbols are created before Start; hover and locale changes only move shader playheads. Numbers and hit targets retain their DOM ownership.
- DOM glitch labels participate through `useSiteLocaleGlitch`. Breadcrumb parts all consume the same committed locale; there is no breadcrumb-local language queue.

About prepares all three locales under the curtain and uploads all story layers. Canvases are cropped to the text band; sampling retains viewport coordinates. One viewport's buffers are cached, concurrent preparation of the same locale/size is deduplicated, and ordinary language changes only rebind the pool. A real viewport resize may repaint its text layout. The HUD's screen and RT shader variants are both warmed before Start. Hex composition renders the same prepared HUD into the existing layer target, without snapshots or another render target.

Ordinary language changes must not create textures, meshes or materials, repaint text canvases, or compile programs. Check rapid requests in both halves, a return to the original request, navigation/unmount during the cycle, About mid-story reversal, and portrait/landscape resizing. The coordinator tests cover ordering and mount/unmount barriers; browser evidence is saved under `output/locale-transition`.

Existing nonlocalized Contacts route-enter Canvas effects are independent of this transaction. Do not interpret their uploads, or Home's Float32Array deformation uploads, as locale text repainting.

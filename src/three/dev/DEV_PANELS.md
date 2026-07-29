# Dev panels — how to build them well

Floating tune panels were removed after tuning settled. This note keeps the patterns that worked, so a new panel can be added without reinventing UX.

---

## When to add a panel

Use a panel only while a surface is actively tuned (materials, camera, spring, hex, stage rail). Prefer config files + HMR for values that rarely change. Delete or hide the panel once values land in config.

Active panels (hotkeys): `1` Progress (`?progressDev=1`) · `2` Epic Text (`?epicTextDev=1`) · `3` Contacts (`?contactsDev=1`) · `4` Belka Rings (`?belkaDev=1`) · `7` Case Arc · `8` Liquid BG · `9` Stage Rail (`?railDev=1`).

---

## Architecture that worked

### Two hosts

| Host | Use for |
|------|---------|
| **React** (`MainContent`, `import.meta.env.DEV`) | Store-driven state, carousel/stage readouts, valtio |
| **Imperative DOM** (append to `document.body`) | Scene-bound knobs (About materials, case ring) constructed next to the scene |

Gate all construction with `import.meta.env.DEV`. Dispose on scene/app dispose.

### Shared pieces (recreate if needed)

1. **Hotkeys** — digit keys `0–9`, capture-phase `keydown`, ignore when focus is in `input` / `textarea` / `contenteditable`, ignore ctrl/meta/alt. One global registry; each panel registers `{ key, label, toggle }`. Show the same hint string on every panel footer so discoverability stays consistent.
2. **Drag + position persist** — draggable header; save `left/top` in `localStorage` per panel id so reopen restores place.
3. **Shared CSS class** (`.sceneDevTools` via `injectSceneDevToolsStyles`) — fixed, high z-index, monospace, dark glass, `pointer-events: auto`. Force `flex-direction: column` — global `div { display:flex }` can flatten layout.
4. **Scrollable from day one** — panels **must** clip and scroll when content does not fit the viewport. Required on the root `.sceneDevTools` (or an inner body): `max-height: min(~82vh, …)`, `min-height: 0`, `overflow-y: auto`, `overscroll-behavior: contain`. Do **not** ship a tall panel that grows off-screen with no scrollbar. Prefer shared styles; if you override layout, keep these four properties.
5. **Wheel guard** — every site wheel owner (carousel, About story, case story, …) must early-return on `isSceneDevToolsWheelTarget(event)` so wheel over the panel scrolls the panel, not the page. Capture-phase `preventDefault` without this check kills panel scroll.
6. **Copy config** — “Copy JS” that dumps the live object as pasteable module source (`formatConfigNumber` helpers for stable floats). Reset button restores defaults from the real config module.

### URL auto-open (optional)

`?progressDev=1` / `?railDev=1` style flags to open a panel on load — useful when iterating one surface.

---

## UX rules (what made panels pleasant)

- **Compact default size** — `min(440px, 100vw - 32px)`, **max-height ~80vh**, **internal scroll from the first version** — not “add scroll later if someone complains”.
- **Legend on top** — one short sentence: what the panel tunes + hotkey.
- **Sections** — clear borders; one concern per section (camera / color / bloom).
- **Live apply** — sliders write uniforms/config immediately; no “Apply” for continuous knobs.
- **Readouts** — show current numeric value next to the slider.
- **No production leak** — never mount outside `import.meta.env.DEV`; dispose listeners and DOM nodes.
- **Don’t fight the product** — panels must not own wheel/scroll while closed; when open, only steal wheel over themselves (guard + `overflow-y: auto`).

---

## Minimal React panel sketch

```jsx
// DEV only — mount from MainContent when startApp
useEffect(() => {
  if (!import.meta.env.DEV) return;
  return registerDevPanelHotkey("1", {
    label: "My Panel",
    toggle: () => { store.devPanelMyOpen = !store.devPanelMyOpen; },
  });
}, []);

if (!import.meta.env.DEV || !open) return null;
return (
  <div ref={panelRef} className="devPanelDraggable sceneDevTools">
    <header data-drag-handle>My Panel</header>
    {/* controls — panel scrolls via .sceneDevTools overflow-y */}
    <footer>{/* hotkey hints */}</footer>
  </div>
);
```

## Minimal imperative panel sketch

```js
export class MySceneDevTools {
  constructor(getScene) {
    if (!import.meta.env.DEV) return;
    this._panel = document.createElement("div");
    this._panel.className = "sceneDevTools myDevTools hidden";
    document.body.appendChild(this._panel);
    injectSceneDevToolsStyles(); // max-height + overflow-y: auto
    registerDevPanelHotkey("7", { label: "My Scene", toggle: () => this.toggle() });
    attachDevPanelDrag(this._panel, { id: "myScene" });
  }
  bindScene(scene) { /* wire sliders → scene */ }
  dispose() {
    unregisterDevPanelHotkey("7");
    this._panel?.remove();
  }
}
```

---

## Checklist before shipping a new panel

1. DEV-only construct + dispose
2. Hotkey registered and listed in shared hints
3. Drag + persisted position
4. **Scroll works when content > viewport** (`max-height` + `overflow-y: auto`; verified with the panel open on a short display / many sections)
5. Wheel over panel scrolls the panel — not carousel / About / case (`isSceneDevToolsWheelTarget` on every capture wheel handler)
6. Copy/reset for tuned configs
7. Plan to delete the panel (or keep this doc) when tuning is done

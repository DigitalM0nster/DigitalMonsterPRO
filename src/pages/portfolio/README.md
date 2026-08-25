# Portfolio

Production routes use one warmed imperative Three.js application and a small React shell.

- `PortfolioPage.jsx` owns `/portfolio` and `/portfolio/:case` HTML composition.
- `components/ResponsiveHubCase` is the responsive case shell mounted by production.
- `core/projectRegistry.js` owns project content modules.
- `core/caseExperienceRuntime.js` owns case-stage scroll behavior.
- `ui/CaseStudyCanvas/CaseStudyPanelHudPainter.jsx` paints live DOM chrome and coordinates the prepared WebGL text HUD.
- `three/scenes/portfolio` owns the hub and case scene implementations.

Add project content in `projects/<slug>/`, register it in `core/projectRegistry.js`, and add or map its scene in `SceneManager.js`. Do not restore the removed `PortfolioProjectShell`, R3F case models, or duplicate case UI.

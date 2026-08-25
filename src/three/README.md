# Three.js runtime

The site has one imperative Three.js owner.

```text
app/ThreeCanvasHost.jsx
  -> app/DigitalMonsterThreeApp.js
       -> render/background/BackgroundPipeline.js
       -> scenes/SceneManager.js
       -> render/models/ModelsPostProcessPipeline.js
       -> render/toScreen/ScreenCompositor.js
```

Route-owned scene implementations live in `scenes/`. `SceneManager` creates them once, keeps prepared resources alive after Start, and controls their render, update, and interaction lifecycle. Shared loaders live in `assets/`; renderer setup and WebGL failure handling live in `renderer/`.

There is no React Three Fiber runtime. Do not add a second renderer, canvas, render loop, or route-to-scene registry.

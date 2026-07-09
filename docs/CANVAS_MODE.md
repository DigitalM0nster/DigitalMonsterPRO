# Canvas: один WebGL

## Пайплайн кадра

1. `BackgroundComposerRT` (-15) — liquid → RT  
2. `EffectComposerComponent` (1) — модели → RT  
3. `ScreenFramePresenter` (500) — фон + overlay моделей на экран  
4. `CanvasFrameLock` (10000) — блокирует финальный render R3F  

## Dev

- `?perf=1` — r3f-perf  
- `?ppDebug=1` — лог постобработки  

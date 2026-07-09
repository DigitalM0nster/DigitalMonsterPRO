# Миграция R3F → чистый THREE.js

**Карта проекта:** [`src/three/README.md`](../src/three/README.md)

## Статус

| Слой | Путь |
|------|------|
| Движок | `src/three/app/LavawebThreeApp.js` |
| Фон | `src/three/render/background/BackgroundPipeline.js` |
| Маска моделей | `src/three/render/toScreen/viewportMask/` |
| Вывод на экран | `src/three/render/toScreen/ScreenCompositor.js` |
| Сцены | `src/three/scenes/` |
| GLB | `src/three/assets/gltfLoader.js` |

## Маппинг роут → сцена

| Роут | id |
|------|-----|
| `/` | `home` (пусто) |
| `/portfolio` | `portfolioHub` |
| `/portfolio/01` | `case01` (Case1Scene) |
| `/portfolio/02`…`05` | placeholder |
| `/about/*` | `about` |
| `/contacts` | `contacts` |

## Дальше

Переносить кейсы в `src/three/scenes/portfolio/` по одному.

# THREE.js — структура `src/three/`

Весь чистый THREE-код живёт **только здесь**. React подключает движок через `ThreeCanvasHost` → `app/LavawebThreeApp.js`.

## Карта папок

```
src/three/
├── README.md
├── app/
│   └── LavawebThreeApp.js       ← главный loop (rAF, canvas, resize)
├── render/
│   ├── composerUtils.js         ← вспомогательные функции рендера
│   ├── background/
│   │   └── BackgroundPipeline.js    ← liquid HDR + blur по краям
│   └── toScreen/                ← ★ ВЫВОД НА ЭКРАН (фон + модели → canvas)
│       ├── ScreenCompositor.js        ← склеивает слои и рисует
│       └── viewportMask/              ← маска «окна» для моделей
│           ├── config.js              ← размеры окна (0.79 × 0.83)
│           └── blitMaterial.js        ← шейдер обрезки
├── scenes/                      ← 3D-контент по роуту
├── assets/
│   └── gltfLoader.js
└── legacy/                      ← старый R3F, не используется
```

## Один кадр — простыми словами

1. **background/** — рисуем фон в текстуру (с blur по краям).
2. **scenes/** — рисуем модели в текстуру.
3. **toScreen/** — кладём обе текстуры на canvas, модели обрезаем по «окну».

```
LavawebThreeApp
  → BackgroundPipeline      (фон в текстуру)
  → SceneManager            (модели в текстуру)
  → ScreenCompositor        (оба слоя на экран)
       └── viewportMask     (обрезка моделей)
```

## Маска «окна» — где править

| Что | Файл |
|-----|------|
| Размеры окна | `render/toScreen/viewportMask/config.js` |
| Шейдер обрезки | `render/toScreen/viewportMask/blitMaterial.js` |
| Склейка слоёв | `render/toScreen/ScreenCompositor.js` |

## Dev: настройка хаба портфолио

На `/portfolio` в **dev** (`npm run dev`):

- **`?hubDev=1`** в URL — открыть панель сразу
- или клавиша **`D`** на странице

Одна панель справа снизу: **камера** (опционально) + **сетка** (размеры и X/Y/Z) + **туман** + **материал**.

- **Сетка плит** — размеры, расстояния, **смещение X/Y/Z** и **поворот Rotate X/Y/Z** (градусы); камера не меняется
- **Туман (Fog)** — `THREE.Fog`, дальние плиты сливаются с фоном
- Orbit камеры — только если включить чекбокс в секции «Камера»
- **Центр экрана** — какая плита в центре viewport (луч из камеры); обновляется в dev-панели

- Canvas: ЛКМ — orbit, колёсико — zoom, ПКМ — pan
- «Скопировать камеру / сетку / материал» → вставить в `portfolioHubConfig.js`
- **Логотипы** — `portfolioHubLogoConfig.js` или секция «Логотипы» в dev-панели (D)
- **Материал:** `opacity` — плотнее, `transmission` — меньше стекла

Старые параметры `?hubCamera=1` и `?hubLayout=1` тоже открывают эту панель.

## Старый R3F

`components/3D/models/**` — legacy, переносим в `scenes/` по одному кейсу.

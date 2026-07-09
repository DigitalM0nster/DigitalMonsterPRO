# НИПИГАЗ — поведение единой 3D-модели (orbital module)

> Спецификация для реализации в `src/portfolio/projects/nipigas/scene.js` и Three.js-слое.  
> UI и контент уже реализованы; 3D-модель — следующий этап (см. phase в `states.js`).

---

## Принцип

Один узнаваемый объект на все пять сцен. Не пять отдельных моделей, а **последовательное развитие одного орбитального модуля**:

```
Цельный юбилейный модуль
        ↓
Разделение на визуальные слои
        ↓
Превращение в интерактивный контроллер
        ↓
Поток пользовательского контента
        ↓
Раскрытие технической архитектуры
```

Кольца **всегда остаются в кадре** — визуальный символ проекта не меняется, меняется только поведение и состав слоёв.

---

## Геометрия (простая база)

| Элемент | Реализация |
|---------|------------|
| Два кольца | Torus / extruded curve, пересекаются под углом |
| Центральное ядро | Plane или thin box со знаком «50 ЛЕТ / НИПИГАЗ» |
| Сегменты HUD | Дуги, partial torus, emissive trim |
| Орбитальные линии | Thin tube / line geometry |
| Маркеры | Small spheres или billboards |
| Фото / превью | Plane geometry с texture |
| Сетка (сцена 02) | GridHelper или shader grid, полупрозрачная |

Сложность — в **анимации, материалах и phase**, не в heavy mesh.

---

## Фазы (`state.scene.model.orbitalModule.phase`)

Конфиг уже задан в `states.js`. Интерпретация в `scene.js`:

| Phase | State | scrollAnchor |
|-------|-------|--------------|
| `overview` | state_01 | 0 |
| `visualLayers` | state_02 | 0.25 |
| `interactiveHud` | state_03 | 0.5 |
| `contentStream` | state_04 | 0.75 |
| `engineeringWireframe` | state_05 | 1 |

---

## Сцена 01 — О ПРОЕКТЕ (`overview`)

**Состояние:** объект целиком, завершённая система.

- Два кольца пересекаются вокруг центрального знака 50
- Внутренние элементы медленно вращаются
- Редкие световые импульсы по орбитам
- Композиция слегка наклонена (HUD-перспектива)
- **Pointer:** плавный наклон всего модуля, **без раскрытия слоёв**
- **Без** фотоплоскостей вокруг — только масштаб и главный образ

**Связь с текстом:** «юбилей как цельный цифровой опыт» → пользователь видит единый мир.

---

## Сцена 02 — ВИЗУАЛЬНЫЙ ЯЗЫК (`visualLayers`)

**Состояние:** раскрытие на визуальные слои.

- Внешнее кольцо отходит вперёд по Z
- Внутреннее уходит глубже
- Между кольцами — полупрозрачная spatial grid
- 2–3 plane с архивными фото (placeholder: `/images/case1/bigImage.webp` или отдельные архивные)
- HUD-сегменты видны как отдельные элементы
- **Hover на слой:** остальные слегка затемняются

**Подписи (billboard / HTML):** `HUD`, `АРХИВ`, `ПЕРСПЕКТИВА`

**Переход 01→02:** lerp позиций колец + fade-in grid и planes. На mobile синхронизировать с `store.portfolioExperience.mobileSwipeProgress`.

---

## Сцена 03 — ИНТЕРАКТИВНЫЙ ОПЫТ (`interactiveHud`)

**Состояние:** орбитальный объект как UI главного экрана оригинального сайта.

- Кольца в позиции, близкой к production HUD
- **Pointer:** физический наклон в сторону курсора
- Сегменты подсвечиваются как разделы
- В центре — plane с video/poster (`optionalVideo` в config)
- **Hover сегмент:** один выдвигается вперёд, остальные уходят назад

**Подписи (демо, не разделы кейса):** `ИСТОРИЯ`, `ГЕРОИ`, `ДИНАСТИИ`, `ПРОЕКТЫ`

**Самая интерактивная сцена** — продаёт UX, не контент НИПИГАЗ.

---

## Сцена 04 — ЖИВАЯ ПЛАТФОРМА (`contentStream`)

**Состояние:** поток материалов.

- 12–20 plane циклично движутся по орбитальным траекториям
- Новые карточки появляются с края → проходят центр → после «проверки» занимают внешнюю орбиту
- Счётчик: `001 → 127 → 318 → 500+`
- **Hover карточки:** stop + scale + короткая подпись

**Состояния карточек:**

| Состояние | Вид |
|-----------|-----|
| Поступила | Тёмная |
| На проверке | Контурная |
| Опубликована | Яркая |

---

## Сцена 05 — ИНЖЕНЕРИЯ (`engineeringWireframe`)

**Состояние:** внутреннее устройство.

- Кольца → wireframe
- Части расходятся по глубине
- Видны точки, соединения, технические слои
- Фотоплоскости исчезают
- **Подписи:** `HTML`, `CSS`, `JS`, `LAZY CONTENT`, `MOBILE OPTIMIZED`, `0 LIBS`
- **Pointer move:** слои раздвигаются; **idle:** снова собираются в цельный объект

---

## Логика трансформации между сценами

1. **Scroll (desktop):** интерполяция между phase по `store.scroll` / `stageProgress` — не discrete jump, а blend двух соседних состояний в зоне между anchors.
2. **Swipe (mobile):** интерполяция по `store.portfolioExperience.mobileSwipeProgress` и `dragOffset` — модель следует за пальцем между state N и N+1.
3. **Кольца:** всегда visible, параметры (opacity, wireframe, z-offset) меняются.

Рекомендуемая структура в `scene.js`:

```js
const PHASES = {
  overview: { /* target transforms */ },
  visualLayers: { /* ... */ },
  // ...
};

function lerpPhase(from, to, t) { /* apply to groups */ }
```

---

## Pointer / runtime

Читать из `ProjectSceneRuntime`:

- `scrollProgress` — глобальный scroll кейса
- `stageProgress` / `stageProgressTarget` — внутри state
- `mobileSwipeProgress` — mobile swipe
- `activeStateId` — текущая фаза

**Pointer tilt:** uniform на root group, damping через maath/easing (как в старом Case1Model).

---

## Камера

- Default: `[0, 0, 9]`, lookAt `[0, 0, 0]`
- Лёгкий parallax от pointer — опционально, не главный инструмент
- Без резких camera fly между states

---

## Post-process

- Bloom на emissive кольцах и ядре
- Grain blur **off** на exploration (fullscreen policy)
- `liquidScale: 1` — fullscreen фон

---

## Файлы для реализации

| Файл | Задача |
|------|--------|
| `nipigas/scene.js` | phase lerp, pointer, update loop |
| `nipigas/states.js` | phase flags (готово) |
| Новый `NipigasOrbitalModel.jsx` или класс в THREE | geometry + materials |
| `EmptyPortfolioCaseScene` → новая модель | заменить в `SceneManager.js` |
| `project.config.js` | подключить новую модель когда готова |

---

## Mobile

- 3D в верхних **42–46%** (sticky) — уже в `CaseStudyMobileShell`
- Трансформация модели синхронна горизонтальному swipe, не только после snap
- Вертикальный scroll страницы **не блокируется** — swipe только при dominant horizontal gesture

---

## Чеклист перед сдачей 3D

- [ ] Один GLB/group, не перезагрузка модели между states
- [ ] Blend между phase при scroll/swipe
- [ ] Pointer tilt на 01 и 03
- [ ] Wireframe explode на 05
- [ ] 12–20 карточек pool на 04, не 500 mesh
- [ ] Заменить `EmptyPortfolioCaseScene` на орбитальный модуль
- [ ] Performance: instancing для карточек, lazy textures

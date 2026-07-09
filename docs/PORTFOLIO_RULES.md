# Portfolio Exploration Engine — ключевые правила (обновлено)

## Investigation — это не «тексты» и не камера

**Investigation** — отдельный режим, где меняется **поведение 3D-модели и сцены**:
- анимации mesh
- материалы / emissive
- видимость частей модели
- post-process, фон, свет

`title` / `uiDescription` в hotspot — **опциональная подпись** в левой панели.  
Пользователь должен чувствовать изменение через **модель**, не через tooltip.

Конфиг: `hotspot.investigation.behavior` (тип `SceneBehavior`).

## State = глава + поведение сцены

Каждый `state` содержит `scene: SceneBehavior` — что делает модель при этой главе.

Внутри state — `subStages[]` с собственным `behavior` для этапов внутри главы.

Реализация — в `scene.js` проекта через `applySceneBehavior()`.

## Видео

- **Максимум 1 видео на проект**
- **Только onDemand** — `preload="none"`, src не грузится до клика
- Настройка: `project.config.mediaPolicy` + `optionalVideo.attachToState`
- В states **не** вставлять autoplay video

## Belka Production

- CRE-RETAIL **удалён** из конфигов
- `contentStatus: needsContent` — placeholder до получения материалов

## plannedInteractives.js — для кого?

**Только для команды** (ты + разработка). Не показывается на сайте.

Это backlog идей: что ещё придумать и реализовать в 3D. Когда интерактив готов — пункт удаляем.

## Lifecycle (появление / исчезновение / звуки)

- **Роут:** `useRouteTransition` → `case_leave`, `portfolio_leave` (глобально)
- **Проект:** `project.config.lifecycle` — тайминги enter/exit, опциональные звуки внутри проекта
- **Сцена:** `Case1Scene` — scale in/out при mount route (THREE pipeline)
- **UI:** классы `.entering` / `.active` / `.exiting` на shell

## Phone mockup

Удалён из конфигов и legacy CanvasRoutes. Не использовать.

## UI Layout (экран exploration)

См. **`docs/PORTFOLIO_UI.md`**.

- **Fullscreen** — без «экранчика» на **всём сайте** (3D mask/blur/grain + CSS `contentContainer` 100vw/vh). См. `docs/PORTFOLIO_UI.md`
- **ExplorationSidebar** слева — иконки + вертикальный scroll-track (как на референсе)
- Тексты — **overlay** по клику (grid / flask), не фиксированная колонка
- Site `LeftMenu` на exploration скрыт

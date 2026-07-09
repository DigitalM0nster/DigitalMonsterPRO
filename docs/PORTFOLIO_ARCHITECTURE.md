# Архитектура Portfolio Exploration Engine

> Единый движок интерактивного исследования проектов.  
> UI не знает о конкретных проектах — только о конфигурациях.

---

## Принципы

1. **Один интерфейс — много проектов.** Компоненты в `src/portfolio/ui/` переиспользуются без изменений.
2. **Проект = папка + 4 файла.** Новый проект добавляется только через `src/portfolio/projects/<slug>/`.
3. **Два уровня взаимодействия:**
   - **Уровень 1** — states + subStages (скролл / Navigation Core) → **разное поведение 3D**
   - **Уровень 2** — investigation → **уникальное поведение модели** (не tooltip, не «просто камера»)
4. **Видео:** max 1 на проект, только onDemand по клику пользователя.
5. **UI ↔ 3D через контекст.** `PortfolioProjectProvider` хранит `activeStateId`, `investigationHotspotId`, `scrollProgress`.

---

## Структура файлов

```
src/portfolio/
├── core/
│   ├── types.js                 # JSDoc-контракты данных
│   ├── projectRegistry.js       # Реестр всех проектов
│   ├── createProjectModule.js   # Фабрика модуля проекта
│   ├── PortfolioProjectContext.jsx
│   ├── useProjectState.js       # states + scroll + Navigation Core
│   └── useInvestigationMode.js  # hotspots + investigation
├── ui/
│   ├── PortfolioProjectShell/   # 30% левая | center 3D | дуга справа
│   ├── ProjectStatePanel/       # Текст текущего state
│   ├── ExplorationPath/         # Полукруглая навигация по states
│   ├── HotspotLayer/            # HTML-маркеры на модели
│   └── InvestigationPanel/    # Панель режима исследования
└── projects/
    ├── nipigas/
    │   ├── project.config.js
    │   ├── states.js
    │   ├── hotspots.js
    │   ├── scene.js
    │   └── index.js
    ├── troof/
    ├── mmk1/
    └── belkaProduction/
```

---

## Контракт проекта

### `project.config.js`

```js
export default {
  id: "01",
  slug: "nipigas",
  route: "/portfolio/01",
  title: "НИПИГАЗ",
  summary: "...",
  models: { primary: "/models/case1/NipigasLogoModel.glb" },
  scene: { defaultCamera, rootOffset, scale },
  meta: { year, type, skills },
};
```

### `states.js`

Массив `PortfolioState[]`:

| Поле | Назначение |
|------|------------|
| `id` | `state_00` … `state_NN` |
| `title`, `subtitle`, `description` | Левая панель |
| `traits` | Доп. характеристики (skills, colors, fonts…) |
| `media` | image (lazy). Video — только `optionalVideo` в project.config |
| `scene` | **SceneBehavior** — model, lights, postProcess, animations |
| `subStages` | Этапы внутри state с отдельным `behavior` |
| `scrollAnchor` | 0…1 — позиция в scroll-потоке |

### SceneBehavior

```js
scene: {
  model: { orbits: { speed: 0.08 }, logoFire: { emissivePulse: true } },
  postProcess: { grainBlur: 0.4 },
  playAnimations: ["fireSurge"],
  camera: { position: [0, -12, 9] }, // опционально
}
```

### `hotspots.js`

```js
investigation: {
  behavior: {
    model: { logoCircle: { scale: 1.15 } },
    playAnimations: ["logoDeconstruct"],
  },
  uiDescription: "опционально — не заменяет 3D",
  hideOtherHotspots: true,
}
```

### `scene.js`

Единственный файл со **специфичной** логикой проекта:

```js
export function createProjectScene(context) {
  return {
    mount(scene, camera) {},
    unmount() {},
    onStateChange(nextId, prevId, state) {},
    onInvestigationEnter(hotspot) {},
    onInvestigationLeave() {},
    update(delta, { scrollProgress, activeStateId }) {},
  };
}
```

---

## UI-компоненты

### PortfolioProjectShell

```
┌─────────────────────────────────────────────────┐
│  ProjectStatePanel          │   3D Viewport      │
│  (title, text, traits)      │   + HotspotLayer   │
│                             │   + Investigation  │
├─────────────────────────────────────────────────┤
│              NavigationCore                      │
└─────────────────────────────────────────────────┘
```

- Получает `projectModule` из registry по slug/route
- Оборачивает детей в `PortfolioProjectProvider`

### NavigationCore

- Свернут: компактное «ядро» (текущий state index)
- Hover / click: radial или vertical list всех states
- Клик → `goToState(id)` без scroll

### HotspotLayer

- Рендерит pulsing circles (не tooltip)
- Hover / click → `enterInvestigation(hotspotId)`
- Позиции: screen-space от 3D-bridge (позже) или config fallback

### InvestigationPanel

- Заменяет/дополняет левую панель в режиме investigation
- Показывает title + description hotspot
- Кнопка «Назад к главе»

---

## Подключение нового проекта

1. Создать `src/portfolio/projects/<slug>/` с 4 файлами + `index.js`
2. Добавить import в `projectRegistry.js`
3. Добавить route в `PortfolioPage` → `<PortfolioProjectShell slug="..." />`
4. Зарегистрировать scene в `sceneDefinitions.js` (THREE pipeline)
5. Заполнить hotspots после получения 3D-координат

**Не менять:** `ProjectStatePanel`, `NavigationCore`, `PortfolioProjectShell`.

---

## Миграция с legacy

| Legacy | Новое |
|--------|-------|
| `Case1ContentBlock` + `Case1MoreContent` | `projects/nipigas/states.js` |
| `Case1Model` / `Case1Scene` | `projects/nipigas/scene.js` |
| `store.scroll` | `useProjectState` → `scrollProgress` + `activeStateId` |
| `useSmoothCaseScroll` | Внутри shell (scroll привязан к states) |
| `projectsData.js` (hub) | Остаётся для hub; case meta дублируется в `project.config.js` до unify |

---

## Соглашения об именовании

- **slug:** camelCase (`nipigas`, `belkaProduction`)
- **state id:** `state_XX` с ведущим нулём
- **hotspot id:** kebab-case (`logo-circle`, `crane-hook`)
- **CSS:** SCSS Modules, camelCase классы
- **Файлы конфигов:** `.js` (проект на JS; типы через JSDoc в `types.js`)

---

## Связанные документы

- [PORTFOLIO_ANALYSIS.md](./PORTFOLIO_ANALYSIS.md) — анализ существующих проектов
- [PORTFOLIO_CONTENT_CHECKLIST.md](./PORTFOLIO_CONTENT_CHECKLIST.md) — чеклист данных от заказчика
- `.cursor/rules/portfolio-exploration.mdc` — правила для AI при работе с портфолио

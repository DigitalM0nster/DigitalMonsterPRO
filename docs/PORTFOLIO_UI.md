# Portfolio Exploration — UI Layout

> Fullscreen 3D + slim sidebar. Без «экранчика» (viewport mask) и grain blur.

---

## Компоновка

```
┌──┬──────────────────────────────────────────────┐
│S │           FULLSCREEN 3D + HOTSPOTS           │
│I │     (текст — overlay по клику на иконку)    │
│D │                                              │
│E │                                              │
│B │                                              │
│A │                                              │
│R │                                              │
└──┴──────────────────────────────────────────────┘
  ↑ ExplorationSidebar (~5vw)
```

| Зона | Компонент | Назначение |
|------|-----------|------------|
| **Sidebar слева** | `ExplorationSidebar` | Иконки + вертикальные номера states + scroll-core |
| **Весь экран** | 3D canvas + `HotspotLayer` | Модель без маски «окна» |
| **Overlay** | `StateContentOverlay` | Текст по клику (grid / flask / investigation) |

Глобальный `LeftMenu` на exploration **скрыт** — вместо него sidebar проекта.

---

## ExplorationSidebar

**Иконки (с cyan-точкой у активной):**

| Иконка | Действие |
|--------|----------|
| Home | → `/portfolio` (хаб) |
| Grid | Toggle текст главы (`content`) |
| Cube | Режим модели, выход из investigation |
| Target | Активен в investigation |
| Flask | Overlay только метрик (`data`) |

**Ниже иконок:** вертикальная линия, номера `01…NN`, crosshair-core двигается по скроллу.

---

## Fullscreen (без «экранчика») — **весь сайт**

### 3D (LavawebThreeApp)
- Viewport mask — off (`isViewportMaskEnabled()` → `false`)
- Border blur на HDR — убран из `BackgroundPipeline`
- Grain blur на моделях — off
- `liquidScale` — `1` (fullscreen фон)

### HTML/CSS
- `--contentContainerWidth/Height` → `100vw` / `100vh`
- `--borderRadius` → `0`, `--paddingY` → `0`
- `.glowContentContainer` — скрыт (рамка-свечение)

---

## Hotspots

- Hover — подсветка + подпись
- Click — investigation

---

## Файлы

```
src/portfolio/ui/
├── ExplorationSidebar/      # замена LeftMenu + ExplorationPath
├── StateContentOverlay/     # текст по demand
├── PortfolioProjectShell/   # fullscreen layout
├── HotspotLayer/
└── ProjectStatePanel/       # compact / metricsOnly props
```

---

## Устарело

- `ExplorationPath` (дуга справа) — не используется в shell
- Фиксированная левая панель 30% — убрана
- `CaseScrollOverlay` на exploration — off

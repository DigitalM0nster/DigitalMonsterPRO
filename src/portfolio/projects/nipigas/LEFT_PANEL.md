# NIPIGAS — левая canvas-панель (гайд для редактирования)

> **Где править на практике**
> - **Текст** → `states.js`
> - **Стили, отступы, размеры** → `project.config.js` → `caseStudy` (этот файл рядом)
> - **Live-подгонка** → Chrome → `/portfolio/01` → клавиша **`8`**
>
> Остальные файлы в `CaseStudyCanvas/` — движок. **Для nipigas трогать не нужно**,
> если не меняешь структуру блоков.

---

## Какие файлы реально нужны (5 штук)

| # | Файл | Зачем |
|---|------|--------|
| 1 | `nipigas/states.js` | Заголовок, абзацы, traits |
| 2 | `nipigas/project.config.js` | `contentTopPx`, `panelWidth`, `leftPanel` |
| 3 | `CaseStudyCanvas/caseStudyCanvasLayout.js` | Позиция колонки на экране (X, Y, width) |
| 4 | `CaseStudyCanvas/caseStudyLeftPanelFlow.js` | Порядок блоков сверху вниз |
| 5 | `CaseStudyCanvas/caseStudyCanvasTheme.js` | Цвета cyan / grey / white |

Специфика nipigas (бейдж, footer, список метрик):

| Файл | Что там |
|------|---------|
| `caseStudyLeftPanelFeatures.js` | `01 / О ПРОЕКТЕ`, footer, features сцен 02–05 |
| `caseStudyLeftPanelTraitsList.js` | Строки «1 \| месяц / разработка» |

**Не путать с дугой справа** — это ~15 файлов `caseStudyArc*.js`. К левой панели не относятся.

---

## Как понять, ГДЕ на экране рисуется текст

Canvas = координаты в **CSS-пикселях**. `(0,0)` — левый верх. X вправо, Y вниз.

```
Экран 1920×1080
    ↓
Canvas на весь viewport
    ↓
layout.leftPanel { x, y, width }   ← caseStudyCanvasLayout.js
    ↓
drawLeftPanel: translate(x, y)     ← начало колонки
    ↓
paintLeftPanelFlow: cursorY        ← блоки друг под другом
```

### NIPIGAS — откуда берётся позиция

| Что | Поле в `project.config.js` | Эффект |
|-----|---------------------------|--------|
| Отступ **сверху** | `contentTopPx: 102` | 102px от верха окна до первой строки |
| **Ширина** колонки | `panelWidth: { min, max, ratio }` | ~24% экрана, но 400–520px |
| Отступ **слева** | (глобально) | Как hero-текст на главной: меню + offset |

После `translate` внутри колонки все X начинаются с **0**, Y растёт через **`cursorY`**.

---

## Отступы (как margin / gap в SCSS)

Все в `project.config.js` → `caseStudy.leftPanel`:

| Поле | Между чем |
|------|-----------|
| `gapAfterBadge` | бейдж → заголовок |
| `gapAfterTitle` | заголовок → описание |
| `gapAfterDescription` | описание → … |
| `gapBeforeStatsRail` | перед списком метрик |
| `traitListRowPadY` | padding внутри строки метрик |
| `traitListTextGap` | «месяц» ↔ «разработка» |
| `traitListGlyphColW` | ширина колонки под цифру `1` |

**`anchorFooterBlock: true`** — метрики и footer **прижаты к низу** зоны, описание занимает середину:

```
┌ badge, title
├ description (растёт, но не заезжает на stats)
├ stats (verticalList)
└ footer «НИПИГАЗ / 50 ЛЕТ»
```

---

## 1:1 с размером экрана

`prepareCaseStudyCanvasContext` (`caseStudyCanvasSurface.js`):

- Canvas **на весь viewport** в CSS px
- `titleFontSize: 32` → **32px на мониторе**, как `font-size: 32px`
- DPR (Retina) только для чёткости, layout не меняет

Проверка: DevTools → линейка от верха до бейджа ≈ `contentTopPx`.

---

## Шрифты

**Семейство** — `caseStudyCanvasText.js`:

- `ManifoldExtended` — заголовок, цифры, footer
- `Jura` — бейдж, описание, подписи метрик

**Размер и weight** — `leftPanel` в этом конфиге:

```js
categoryFontSize: 11,   categoryFontWeight: 400,  // «01 / О ПРОЕКТЕ»
titleFontSize: 32,      titleFontWeight: 300,     // заголовок
descriptionFontSize: 13,
traitListTopSize: 12,   // «месяц» cyan
traitListBottomSize: 11 // «разработка» grey
```

В коде: `ctx.font = \`${weight} ${size}px ${FONT}\``

---

## Letter-spacing (ширина букв)

Canvas не умеет `letter-spacing` в font. Считаем вручную:

```
spacingPx = fontSize × titleLetterSpacing   // 32 × 0.1 = 3.2px
```

| Поле | Элемент |
|------|---------|
| `categoryLetterSpacing` | бейдж |
| `titleLetterSpacing` | заголовок |
| `badgeLetterSpacing` | footer |

Перенос строк:

- **Авто** — по ширине колонки `innerW`
- **Вручную** — `\n` в `states.js`: `"ЮБИЛЕЙ КАК\nЦИФРОВОЙ ОПЫТ"`

---

## Контент (states.js)

```js
title: "ЮБИЛЕЙ КАК\nЦИФРОВОЙ ОПЫТ",
descriptionParagraphs: ["...", "..."],
traits: [
  { label: "разработка", value: "1 месяц" },
  { label: "сопровождение проекта", value: "3 месяца" },
  { label: "Формат", value: "интерактивный digital-спецпроект" },
],
```

`traits` → в canvas как verticalList (цифра слева, cyan+grey справа).

---

## frameData — что значит «собирает данные кадра»

`caseStudyFrameData.js` склеивает `states.js` + `project.config.js` в **один объект**
для отрисовки одного «кадра» HUD. React-props для canvas.

Тебе **не нужно** его редактировать для nipigas.

---

## Dev-панель (клавиша 8)

- Открыта → слайдеры **поверх** `leftPanel` из конфига
- «Копировать config» → вставить в `leftPanel` здесь
- `?panelDev=1` — открыть сразу

---

## Шпаргалка «хочу изменить → поле»

| Хочу | Поле |
|------|------|
| Текст | `states.js` |
| Колонка ниже/выше | `contentTopPx` |
| Колонка шире/уже | `panelWidth` |
| Заголовок крупнее | `titleFontSize` |
| Разрядка заголовка | `titleLetterSpacing` |
| Отступ после title | `gapAfterTitle` |
| Цифра «1» крупнее | `traitListGlyphSize` |
| Цвет cyan | `caseStudyCanvasTheme.js` → `cyan` |
| Footer весь cyan | `footerAllCyan: true` |
| Без pill-тегов | `hideTags: true` ✓ |

---

## Цепочка вызовов (если интересно)

```
CaseStudyCanvasUI.paintPanel
  → resolveCaseStudyLayout (позиция)
  → drawLeftPanel
  → paintLeftPanelFlow (порядок блоков)
  → drawSectionBadge / drawSpacedTitle / drawTraitsList / drawPanelFooterLabel
```

# Анализ существующих проектов портфолио

> Этап 1 — отчёт перед миграцией на единый движок исследования.  
> Дата: 2025-06-07  
> Источники: `Case*ContentBlock`, `Case*MoreContent`, `Case*Model`, `projectsData.js`, `Case1Scene.js`

---

## Сводка

| # | Название | Маршрут | HTML-контент | 3D (legacy R3F) | THREE pipeline |
|---|----------|---------|--------------|-----------------|----------------|
| 01 | НИПИГАЗ | `/portfolio/01` | Полный (hero + 8 блоков) | Case1Model | Case1Scene ✅ |
| 02 | Troof | `/portfolio/02` | Полный | Case2Model | Placeholder |
| 03 | MMK-1 | `/portfolio/03` | Полный | Case3Model | Placeholder |
| 04 | Belka Production | `/portfolio/04` | Полный* | Case4Model | Placeholder |
| 05 | RE-EVOLUTION | `/portfolio/05` | Сокращённый | Case5Model | Placeholder |
| 06 | Ostankino | `/portfolio/06` | **Placeholder (Case4)** | — | Placeholder |
| 07 | Hubarch | `/portfolio/07` | **Placeholder (Case4)** | — | Placeholder |

\* В case4 hero — «Belka Production», в MoreContent клиент указан как **CRE-RETAIL / CRE + Retail** — требуется уточнение.

**Примечание:** в реестре hub 7 проектов; для первого этапа миграции приоритет — **01–04** (полный контент).

---

## Проект 01 — НИПИГАЗ

### Предлагаемые состояния (states)

| id | Источник | title | subtitle | Содержание |
|----|----------|-------|----------|------------|
| `state_00` | Hero | НИПИГАЗ | Разработка сайта к юбилею компании | Год: 2022. Skills: Motion, Figma, PS, PHP, 3D, CSS, JavaScript |
| `state_01` | Block 1 | Визуальный тон | — | Видео case1Video1. «Дизайн сайта отражает высокую технологичность компании» |
| `state_02` | Block 2 | О клиенте / Цель | — | НИПИГАЗ — центр управления проектированием…; цель — наследие, люди, династии |
| `state_03` | Block 3 | Команда | Synergy | Клиент / LAVAWEB / BELKA PRODUCTION + логотипы |
| `state_04` | Block 4 | Ценности | — | «Основные ценности, из которых строится основа успеха» + bigImage |
| `state_05` | Block 5 | Типографика | — | DIN PRO (основной), Лаптев (подпись) |
| `state_06` | Block 6 | Палитра | — | `#008890`, `#008C95`, `#7AB715`, `#FFFFFF` |
| `state_07` | Block 7 | Погружение | Интерактив | case1Video2. «Научно-фантастический мир», параллакс при скролле |
| `state_08` | Block 8 | Принципы | Результаты | Принципы успеха, история достижений, развитие, семейные династии |

### Предлагаемые точки интереса (hotspots)

| id | Часть модели | state | title (черновик) | Статус |
|----|--------------|-------|------------------|--------|
| `logo-circle` | `logoCircle`, `logoCircleContour` | state_04+ | Юбилейный логотип | Нужны 3D-позиции |
| `logo-fire` | `logoFire`, `logoFireContour` | state_07 | Огненный символ | Нужны 3D-позиции |
| `orbits` | 3 орбиты + текстура c1.png | state_01, state_07 | Орбитальная анимация | Есть pointer-accelerate; позиции TBD |
| `number-fifty` | `numberFifty` | state_00, state_08 | «50 лет» | Нужны 3D-позиции |
| `phone-mockup` | case1Phone.glb | state_07 | Интерактивный запуск сайта | Нужен текст исследования |

### Части модели для режима исследования

- GLB: `/models/case1/NipigasLogoModel.glb` — nodes: logoCircle, logoFire, separator, numberFifty
- Орбиты — отдельные mesh + scroll/pointer tilt
- Phone overlay — отдельная модель
- Post-process: bloom + grain blur от scroll (`case1PostProcessConfig.js`)

### Недостающая информация

1. Точные 3D-координаты hotspot-ов на модели
2. Тексты для режима исследования каждой точки (сейчас только общие блоки)
3. Какие mesh подсвечивать при исследовании (emissive / outline?)
4. Карта scroll → camera Y (сейчас `0 - scroll * 35`) — нужны явные значения на state
5. Параметры камеры per-state (сейчас одна кривая)

### Вопросы владельцу проекта

- Какие 3–5 элементов модели пользователь должен «открывать» в первую очередь?
- Есть ли тексты «углублённого» описания для логотипа, орбит, phone mockup?
- Нужно ли сохранить pointer-accelerate орбит как часть исследования или только scroll-states?

---

## Проект 02 — Troof

### Предлагаемые состояния

| id | Источник | title | Содержание |
|----|----------|-------|------------|
| `state_00` | Hero | Troof | Сайт для строительной компании, 2022 |
| `state_01` | Block 1 | Визуальный тон | Видео. «Футуристичность, брутальность, минимализм» |
| `state_02` | Block 2 | О клиенте / Цель | TROOF — кровельные системы с 2016; премиум минимализм |
| `state_03` | Block 3 | Команда | TROOF × LAVAWEB |
| `state_04` | Block 4 | Дизайн | case2Image — современность компании |
| `state_05` | Block 5 | Типографика | Montserrat, ST_Norilsk |
| `state_06` | Block 6 | Палитра | `#3A424A`, `#727980`, `#ADB1B6`, `#D1D5D8` |
| `state_07` | Block 7 | Интерактив | Видео. «Искусство и технология» |
| `state_08` | Block 8 | Принципы | Акцент, динамика, контент, WOW |

### Предлагаемые hotspots

| id | Часть модели | state | Статус |
|----|--------------|-------|--------|
| `roof-platform` | RoofModel (hover → LinesModel) | state_04, state_07 | **Есть hover-интеракция** — кандидат №1; позиция TBD |
| `platform-stack` | platform1–6.glb | state_01+ | Нужны позиции и тексты |
| `lines-animation` | LinesModel (top lines expand) | state_07 | Логика есть; нужен investigation copy |
| `background-scheme` | BackgroundScheme shader | state_01 | Нужен текст |

### Части модели для исследования

- 6 платформ GLB + RoofModel + LinesModel
- Hover на roof → анимация линий (единственный явный micro-interaction)
- Camera scroll: Y `0 - scroll * 35`
- Desktop root offset `[1.25, 0, 0]`

### Недостающая информация

1. 3D-позиции hotspots на платформах
2. Тексты investigation для roof/lines
3. Per-state camera (сейчас только scroll-Y)
4. Какие platform1–6 соответствуют смысловым блокам (если вообще)

### Вопросы владельцу

- Roof hover — это задуманная «точка интереса» или декоративная анимация?
- Есть ли смысловая связь между 6 платформами и разделами сайта Troof?
- Нужна ли отдельная investigation для материалов (wood/fabric textures)?

---

## Проект 03 — MMK-1

### Предлагаемые состояния

| id | Источник | title | Содержание |
|----|----------|-------|------------|
| `state_00` | Hero | MMK-1 | Аренда башенных кранов, 2023 |
| `state_01` | Block 1 | Первое впечатление | «Современный сайт по аренде башенных кранов» |
| `state_02` | Block 2 | О клиенте / Цель | MMK-1 Москва и МО; эмоциональный запоминающийся сайт |
| `state_03` | Block 3 | Команда | MMK-1 × LAVAWEB |
| `state_04` | Block 4 | Эмоции | «Классический бизнес может заиграть новыми красками» |
| `state_05` | Block 5 | Типографика | Manifold |
| `state_06` | Block 6 | Палитра | `#1C1F2A`, `#FF5000`, `#D0D0CE`, `#FFFFFF` |
| `state_07` | Block 7 | Брендинг | Логотип: крюк крана + цифра 1 |
| `state_08` | Block 8 | Функции | 3D с первой секции, фильтр, карточки, адаптив |

### Предлагаемые hotspots

| id | Часть модели (nodes) | state | Статус |
|----|----------------------|-------|--------|
| `crane-main` | craneMain | state_01+ | Нужны позиции |
| `crane-hook` | (крюк — часть модели) | state_07 | Связь с логотипом; позиция TBD |
| `crane-cabin` | craneDetails | state_04 | TBD |
| `wires` | wires | state_01 | TBD |
| `light-spheres` | lightSphere1/2 | state_07 | TBD |
| `stairs-setka` | stairs, setka_1 | state_08 | TBD |

### Части модели для исследования

- `/models/case3/crane1.glb` — craneMain, craneDetails, wires, stairs, setka_1, lightSphere1/2
- Enter animation: camera fly-up (Y 30→34.25, Z 9→23) @650ms
- Crane rotation от mouse.x
- Phone **скрыт** — investigation только через модель крана

### Недостающая информация

1. Все 3D-позиции hotspots
2. Тексты investigation для узлов крана
3. Per-state camera (enter cinematic vs scroll states)
4. Связь scroll-блоков с частями крана

### Вопросы владельцу

- Какие части крана должны быть «кликабельными» (крюк, кабина, стрела)?
- Нужно ли investigation для light spheres?
- Сохранять ли cinematic enter как state_00 или отдельный intro?

---

## Проект 04 — Belka Production / CRE-RETAIL

### Предлагаемые состояния

| id | Источник | title | Содержание |
|----|----------|-------|------------|
| `state_00` | Hero | Belka Production | Сайт для ритейлера, 2023 |
| `state_01` | Block 1 | Визуальный тон | «Ассиметрия и беспорядок…» |
| `state_02` | Block 2 | О клиенте / Цель | CRE + Retail — брендинг, франчайзинг |
| `state_03` | Block 3 | Команда | CRE-RETAIL × LAVAWEB |
| `state_04` | Block 4 | Возможности | «Многогранность возможностей CRE-Retail» |
| `state_05` | Block 5 | Типографика | Arial, DrukWideCyr |
| `state_06` | Block 6 | Палитра | `#F15A25`, `#329368`, `#171D1C`, `#FFFFFF` |
| `state_07` | Block 7 | Анимации | «Магия мелких анимаций» |
| `state_08` | Block 8 | Принципы | Контент, эмоции, спектр услуг |

### Предлагаемые hotspots

| id | Часть модели | state | Статус |
|----|--------------|-------|--------|
| `shoe-model` | shoe.gltf (ShoeModel) | state_04+ | Float animation; позиция TBD |
| `location-icon` | locationIconModel.fbx | state_02, state_04 | TBD |
| `wireframe-shapes` | box, capsule, torus, sphere | state_01, state_07 | Tier-dependent; TBD |

### Части модели для исследования

- Shoe.gltf — главный визуальный объект
- Location icon FBX
- Procedural wireframe shapes (graphics tier)
- Pointer rotation группы; scroll camera **отключён**

### Недостающая информация

1. **Критично:** правильное название клиента — Belka Production или CRE-RETAIL?
2. 3D-позиции hotspots
3. Тексты investigation (обувь — символ чего? локация — что показывает?)
4. Per-state camera (сейчас статичная)
5. Scroll-states vs 3D (3D не реагирует на scroll)

### Вопросы владельцу

- Belka Production и CRE-RETAIL — один проект или разные? Какое имя в hero?
- Shoe model — что пользователь должен узнать при исследовании?
- Location icon — про географию услуг или декоративный элемент?
- Нужна ли привязка scroll → camera для case4?

---

## Проекты 05–07 (кратко)

### 05 RE-EVOLUTION
- Контент: hero + blocks 1–3, 5–6, 8 (нет blocks 4, 7)
- 3D: RE-EV.glb, sceneReev.glb; MovingLight.jsx **не подключён**
- **Недостаточно** для полной state-карты без доп. блоков 4 и 7

### 06 Ostankino / 07 Hubarch
- Только имя + hubLogo в `projectsData.js`
- HTML = placeholder Case4
- **Недостаточно** для любой миграции — нужен полный контент и 3D

---

## Общие выводы для архитектуры

1. **Единый паттерн states:** hero + 8 scroll-блоков повторяется у 01–04 (05 — урезан).
2. **Hotspots:** в legacy-коде явных hotspot-ов нет; есть hover (Troof roof) и pointer interactions.
3. **Scroll → 3D:** Case1/2/3 связывают `store.scroll` с camera Y; Case4/5 — нет.
4. **Dual stack:** R3F models активны; native THREE — только Case1Scene.
5. **Миграция:** configs в `src/portfolio/projects/*` уже содержат извлечённый контент; 3D-positions и investigation copy — **TBD**.

---

## Следующий шаг

После ответов на вопросы по каждому проекту:

1. Заполнить `hotspots.js` координатами и investigation-текстами
2. Заполнить `camera` / `scene` per-state в `states.js`
3. Реализовать `scene.js` на базе legacy-моделей
4. Подключить `PortfolioProjectShell` вместо `Case*ContentBlock`

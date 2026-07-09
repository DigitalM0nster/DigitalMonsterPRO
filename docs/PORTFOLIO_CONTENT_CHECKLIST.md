# Чеклист контента для Portfolio Exploration Engine

Используйте этот документ при сборе данных от владельца проекта **до** заполнения hotspots и scene.

---

## Обязательно для каждого проекта

- [ ] **slug и маршрут** (`/portfolio/XX`)
- [ ] **Hero:** title, subtitle (type), year, skills
- [ ] **States:** список глав (минимум 3, обычно 8–9 включая hero)
- [ ] Для каждого state: title, subtitle (опц.), description, traits (опц.)
- [ ] **3D-модель:** путь к primary GLB/GLTF
- [ ] **Камера по умолчанию:** position, lookAt, fov
- [ ] **Root offset / scale** для desktop и mobile

---

## Для hotspots (уровень 2)

- [ ] Список интерактивных элементов модели (имена mesh/nodes)
- [ ] **3D-позиция** каждой точки `[x, y, z]` или anchor на mesh
- [ ] **title + description** для investigation (не tooltip — полноценный текст)
- [ ] В каких **states** точка видна
- [ ] **Поведение investigation:**
  - [ ] camera zoom / position
  - [ ] highlight meshes (имена)
  - [ ] скрыть другие hotspots?
  - [ ] фон / post-process изменения?
  - [ ] доп. анимации?

---

## Per-state 3D (если отличается от scroll-кривой)

- [ ] camera position / lookAt на каждый state
- [ ] scene params (освещение, анимации, видимость частей модели)
- [ ] scrollAnchor (0…1) — где state начинается в scroll-потоке

---

## Вопросы по проектам 01–04 (открытые)

### 01 НИПИГАЗ
- [ ] Hotspot-позиции на логотипе, орбитах, phone mockup
- [ ] Investigation-тексты для каждой точки
- [ ] Карта scroll → camera per state

### 02 Troof
- [ ] Roof hover — investigation или декор?
- [ ] Смысл platform1–6
- [ ] Hotspot-позиции

### 03 MMK-1
- [ ] Кликабельные части крана (крюк, кабина, стрела…)
- [ ] Hotspot-позиции
- [ ] Cinematic enter = state_00?

### 04 Belka / CRE-RETAIL
- [ ] **Официальное название клиента**
- [ ] Смысл shoe model и location icon
- [ ] Нужен ли scroll → camera?

### 05–07
- [ ] RE-EVOLUTION: blocks 4 и 7
- [ ] Ostankino, Hubarch: полный контент + 3D

---

## Что НЕ делать

- Не придумывать тексты investigation без источника
- Не ставить случайные 3D-координаты — использовать `status: "needsPosition"`
- Не создавать отдельные UI-компоненты под проект

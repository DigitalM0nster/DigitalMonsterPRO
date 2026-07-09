# Portfolio Exploration Engine

Единый движок интерактивного исследования проектов.

## Быстрый старт

```jsx
import { PortfolioProjectShell } from "@/portfolio";

<PortfolioProjectShell slug="nipigas" />
```

## Документация

- [Анализ проектов](../../docs/PORTFOLIO_ANALYSIS.md)
- [Архитектура](../../docs/PORTFOLIO_ARCHITECTURE.md)
- [UI Layout](../../docs/PORTFOLIO_UI.md)
- [Чеклист контента](../../docs/PORTFOLIO_CONTENT_CHECKLIST.md)

## Добавление проекта

1. Создать `projects/<slug>/` с 4 конфигами
2. Зарегистрировать в `core/projectRegistry.js`
3. Подключить route → `PortfolioProjectShell`

## Статус

- ✅ Типы, реестр, конфиги 01–04
- ✅ UI: Shell, StatePanel, ExplorationPath (дуга), HotspotLayer, InvestigationPanel
- ⏳ 3D-bridge для hotspot-позиций
- ⏳ Миграция legacy Case*ContentBlock
- ⏳ scene.js — реализация на базе Case*Model

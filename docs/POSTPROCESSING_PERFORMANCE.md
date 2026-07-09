# Производительность постобработки

## Почему «отдельный Bloom» может быть в 6 раз быстрее

В этом проекте на **основном канвасе** цепочка такая:

1. `DistortionEffect` — полный экран, сдвиг UV (телепорт)
2. `BlurEffect` — полный экран, сдвиг UV + сэмпл JPG-фона
3. `Bloom` (mipmap) — **несколько** проходов (зависит от `graphicsBloomLevels`: 2–5)

В другом проекте с **только Bloom** в `EffectComposer` нет двух лишних fullscreen-проходов перед bloom и нет второго канваса с фоном.

Плюс раньше был **второй canvas** с фоном — убран; фон в offscreen RT + blit, см. [`CANVAS_MODE.md`](./CANVAS_MODE.md).

Оценка проходов на кадр (основной канвас, tier high):

| Режим | Проходов (порядок) |
|--------|---------------------|
| Главная `/` | Bloom ≈ 2×levels + 1 |
| Портфолио хаб | + Blur ≈ +1 (Distortion выкл.) |
| Телепорт | + Distortion ≈ +1 |
| Фон (отдельный canvas) | +2…3 |

---

## Какие профайлеры использовать

### 1. Chrome DevTools → Performance (главный)

1. F12 → вкладка **Performance**
2. Включить **Screenshots** и **Memory** (по желанию)
3. Record 5–10 с: стой на `/portfolio`, покрути скролл на кейсе, сделай переход главная → портфолио
4. Смотри:
   - длинные полосы **GPU** (если есть в таймлайне)
   - **Scripting** — тяжёлый `useFrame` в `EffectComposerComponent`
   - **Rendering** — время кадра

Если GPU занят 80%+ времени кадра — узкое место в WebGL (сцена + post).

### 2. Spector.js (разбор WebGL draw calls)

Расширение [Spector.js](https://spector.babylonjs.com/) для Chrome.

- Захват одного кадра на `/portfolio`
- Список всех **draw calls** и **render targets**
- Сразу видно: сколько раз перерисовывается fullscreen quad (постобработка)

**Признак лишней нагрузки EffectComposer:** много последовательных pass’ов с одинаковым размером RT = ширина×DPR × высота×DPR.

### 3. r3f-perf (встроено в проект)

В dev открой сайт с параметром:

```
http://localhost:5173/portfolio?perf=1
```

Панель покажет ms на кадр и нагрузку R3F. Удобно сравнить:

- `?perf=1` на `/`
- `?perf=1` на `/portfolio`
- до/после перехода

### 4. Встроенный лог постобработки (этот репозиторий)

```
http://localhost:5173/portfolio?ppDebug=1
```

В консоли раз в ~2 с:

- какие pass’ы **включены** (distortion / blur / bloom)
- `renderer.info` (draw calls, треугольники)
- tier, DPR, оценка числа pass’ов bloom

### 5. Three.js `renderer.info`

В консоли на странице с `?ppDebug=1`:

```js
// вручную в консоли на странице с Canvas
__ppSnapshot?.()
```

---

## Узкие места в коде (куда смотреть)

| Файл | Что может жечь GPU |
|------|---------------------|
| `EffectComposerComponent.jsx` | 3 эффекта в одной цепочке; `stencilBuffer`; bloom levels |
| `BackgroundComposerRT.jsx` / `BackgroundEffects.jsx` | Liquid HDR + blur |
| `getGraphicsTier.js` | `bloomLevels`, `dprCap` |
| `BlurEffect.jsx` | Лишний, когда `blendFactor` и `blurRadius` ≈ 0 |
| `DistortionEffect.jsx` | Лишний вне телепорта |

---

## Что уже сделано в коде

- **Условные pass’ы:** Distortion и Blur не добавляются в composer, когда их параметры ≈ 0 (см. `getPostProcessPassFlags`).
- **`stencilBuffer={false}`** на основном composer (stencil не используется эффектами).
- **Tier** режет `bloomLevels` и DPR.

---

## Как сравнить «только Bloom» vs цепочка (A/B)

1. Открыть с `?perf=1&ppBloomOnly=1` — в composer остаётся только Bloom (dev).
2. Записать ms на панели r3f-perf.
3. Убрать `ppBloomOnly` — снова записать ms на том же маршруте.

Разница ≈ стоимость Distortion + Blur. Если нужен только bloom на хабе — их можно не включать на `/portfolio` (уже так задумано через flags).

Долгосрочно: вынести Bloom в отдельный composer только для сцены без blur/distortion — отдельная задача, если A/B покажет большой выигрыш.

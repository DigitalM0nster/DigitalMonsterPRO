/**
 * Temporary Vite-DEV-only toggles.
 *
 * TODO(remove): DEV_FAST_PRELOADER — убрать перед релизом / когда warm снова
 * терпим по времени. Флаг + `src/utils/devFastPreloader.js` + все call sites
 * (`DigitalMonsterThreeApp`, `DigitalMonsterLoader`, `MainContent`).
 *
 * Prod (`import.meta.env.PROD`) никогда не читает эти флаги как true.
 */

/**
 * `true`  — в Vite DEV режем полный warm (сцены/hex/HUD), Start быстрее.
 * `false` — как prod: полный warm даже в DEV (без `?fullWarm=1`).
 *
 * Escape hatch без смены флага: URL `?fullWarm=1` → полный warm.
 * Вернуть быстрый DEV: убрать query или `?fullWarm=0`.
 */
export const DEV_FAST_PRELOADER = true;

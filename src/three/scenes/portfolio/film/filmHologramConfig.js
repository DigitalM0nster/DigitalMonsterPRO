// One hologram material; all tuning changes uniforms only.
export const hologramFields = [
  ["tileSize", "Размер помех", .45, 1, .05],
  ["density", "Количество помех", 0, 2, .05],
  ["speed", "Частота помех", .2, 3, .05],
  ["glitch", "Сила смещения", 0, 1, .01],
  ["tint", "Оттенок экрана", 0, 1, .01],
  ["glitchTint", "Цвет помех", 0, 1, .01],
  ["scanlines", "Полосы растра", 0, 1, .01],
  ["raster", "Фактура света", 0, 1, .01],
  ["echo", "Спектральный след", 0, 1, .01],
  ["brightness", "Яркость изображения", .6, 1.3, .01],
  ["opacity", "Плотность проекции", .5, 1, .01],
  ["frameGlow", "Свечение рамки", .4, 1.8, .05],
];
export const hologramDefaults = Object.freeze({
  tileSize: .6,
  brightness: 1,
  opacity: 1,
  frameGlow: 1,
  density: .35,
  speed: 1.45,
  glitch: 1,
  scanlines: 1,
  raster: 1,
  echo: 1,
  tint: 1,
  glitchTint: 1,
});
export const hologramStorageKey = "digitalMonster.filmHologram.v3";

export function normalizeHologramSettings(saved) {
  // Keep adjustments to the original screen when removing the experimental variants.
  const source = saved?.variants ? saved.variants.original : saved;
  const values = { ...hologramDefaults };
  for (const [field, , min, max] of hologramFields) {
    const value = source?.[field];
    if (typeof value === "number" && Number.isFinite(value)) values[field] = Math.max(min, Math.min(max, value));
  }
  return values;
}

export function loadHologramSettings(enabled) {
  let saved;
  if (enabled) {
    try { saved = JSON.parse(localStorage.getItem(hologramStorageKey) ?? localStorage.getItem("digitalMonster.filmHologram.v2")); }
    catch { /* Local tuning is optional; malformed storage uses the defaults. */ }
  }
  return normalizeHologramSettings(saved);
}

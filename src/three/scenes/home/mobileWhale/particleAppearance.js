import * as THREE from "three";

// Four whole-line roles. Lighting varies separately and never reclassifies a bead.
export const PARTICLE_LEVEL_COUNT = 4;
const levelNames = Array.from({ length: PARTICLE_LEVEL_COUNT }, (_, i) => String(i).padStart(2, "0"));
export const particleAppearance = {
  global: { color: "#0088ff", brightness: 1, size: 1, bloom: 1, opacity: 1 },
  wake: {
    color: "#008eff", brightness: .6, size: .8, bloom: .35, opacity: 1,
    density: 1, speed: 1, travel: 1, waviness: 1, direction: 15,
  },
  levels: {
    "00": { color: "#4289ad", brightness: .85, size: .9, bloom: .08, opacity: .9 },
    "01": { color: "#337ca8", brightness: .65, size: .95, bloom: .14, opacity: .8 },
    "02": { color: "#00b8ff", brightness: 1.15, size: 1, bloom: .55, opacity: 1 },
    "03": { color: "#0bd6ff", brightness: 1.9, size: 1, bloom: 1.2, opacity: 1 },
  },
};
export const particleLevelLabels = {
  "00": "1 · Поверхность тела", "01": "2 · Тонкие детали",
  "02": "3 · Второстепенные", "03": "4 · Основные",
};
const storageKey = "dm-whale-surface-particles-v6";
const previousStorageKeys = ["dm-whale-line-roles-v5", "dm-whale-reference-light-curve-v4", "dm-whale-reference-light-curve-v3", "dm-whale-reference-light-curve-v2"];
const ranges = {
  brightness: [0, 4], size: [.25, 3], bloom: [0, 4], opacity: [0, 1],
  density: [0, 1], speed: [0, 3], travel: [0, 3], waviness: [0, 3], direction: [-180, 180],
};
const clamp = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value)
  ? THREE.MathUtils.clamp(value, min, max) : fallback;

function normalizeGroup(value, base) {
  return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key, key === "color"
    ? (/^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : fallback)
    : clamp(value?.[key], ...ranges[key], fallback)]));
}

export function normalizeParticleAppearance(config) {
  // Keep global/wake preferences, but start the new four-level curve clean.
  const sourceLevels = config?.levels?.["19"] || config?.["19"] ? undefined : config?.levels;
  return {
    global: normalizeGroup(config?.global, particleAppearance.global),
    wake: normalizeGroup(config?.wake, particleAppearance.wake),
    levels: Object.fromEntries(levelNames.map(name => [name,
      normalizeGroup(sourceLevels?.[name], particleAppearance.levels[name])])),
  };
}

export function readParticleAppearance() {
  let saved;
  try {
    const current = window.localStorage.getItem(storageKey);
    saved = JSON.parse(current ?? previousStorageKeys.map(key => window.localStorage.getItem(key)).find(Boolean) ?? "null");
    // The new surface distribution gets a matching body preset. Keep the old
    // preset under its original key, and preserve independent wake preferences.
    if (!current && saved) saved = { wake: saved.wake };
  } catch { /* Node or unavailable storage: use the file. */ }
  return normalizeParticleAppearance(saved);
}

export function saveParticleAppearance(config) {
  try {
    if (config) window.localStorage.setItem(storageKey, JSON.stringify(normalizeParticleAppearance(config)));
    else {
      window.localStorage.removeItem(storageKey);
      previousStorageKeys.forEach(key => window.localStorage.removeItem(key));
    }
  } catch { /* The live controls also work without browser storage. */ }
}

/** Updates prepared uniforms only; controls never rebuild the point cloud. */
export function applyParticleAppearance(material, config = particleAppearance) {
  const { global, wake, levels } = normalizeParticleAppearance(config);
  const u = material.uniforms;
  const origin = new THREE.Color(particleAppearance.global.color).getHSL({});
  const tint = new THREE.Color(global.color).getHSL({});
  const hsl = {};
  levelNames.forEach((name, index) => {
    const values = levels[name], color = u.uFlowColors.value[index];
    color.set(values.color);
    // Shift hue instead of multiplying RGB so a red tint keeps blue points visible.
    if (global.color.toLowerCase() !== particleAppearance.global.color) {
      color.getHSL(hsl);
      color.setHSL(hsl.h + tint.h - origin.h,
        Math.min(1, hsl.s * tint.s / origin.s), Math.min(1, hsl.l * tint.l / origin.l));
    }
    u.uFlowLevels.value[index].set(
      values.brightness * global.brightness, values.size * global.size,
      values.bloom * global.bloom, values.opacity * global.opacity);
  });
  u.uWakeColor.value.set(wake.color);
  u.uWakeAppearance.value.set(wake.brightness, wake.size, wake.bloom, wake.opacity);
  u.uWakeMotion.value.set(wake.speed, wake.travel, wake.waviness, wake.density);
  const angle = THREE.MathUtils.degToRad(wake.direction);
  u.uWakeDirection.value.set(Math.cos(angle), Math.sin(angle));
}


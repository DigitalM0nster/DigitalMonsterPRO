import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { getHexVisibleBands, hexBandContains, expandHexBandForDraw } from "./hexVisibleBands.js";

// Independent CPU translation of the current shader, including its literal
// lattice basis, threshold clamps, exceptional endpoints, masks and UV warps.
// No WebGL/browser is started by this test. CPU transcendental results do not
// claim bit equality with Safari GLSL; worst-displacement checks below remove
// dependence on a particular sin/hash random sequence.
const BASIS_Y = 1.7320508;
const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
const fract = (x) => x - Math.floor(x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
const make = (overrides = {}) => ({
  resolution: { x: 390, y: 664 }, progress: 0.5, revealFromTop: 0,
  hexScale: 29.7, fisheyeStrength: 0.4,
  innerMaxRadius: 1, innerMinRadius: 0, innerSoftness: 0.055,
  innerRevealPower: 2.5, innerTextureScale: 2.75, innerDistortStrength: 0.4,
  sourceTextureEffectStrength: 1, outerTextureScale: 1, outerDistortStrength: 0.31,
  rowSoftness: 0.08, rowRandomStrength: 0.175, cellRevealSpan: 2,
  ...overrides,
});

function coordinates(x, y) {
  const ax = Math.floor(x) + 0.5;
  const ay = Math.floor(y / BASIS_Y) + 0.5;
  const bx = Math.floor(x - 0.5) + 1;
  const by = Math.floor((y - 1) / BASIS_Y) + 1;
  const alx = x - ax;
  const aly = y - ay * BASIS_Y;
  const blx = x - bx;
  const bly = y - by * BASIS_Y;
  return alx * alx + aly * aly < blx * blx + bly * bly
    ? { lx: alx, ly: aly, ix: ax, iy: ay }
    : { lx: blx, ly: bly, ix: bx, iy: by };
}

function wave(u, v, ix, iy, amount, strength, outer) {
  if (amount < 0.001 || strength < 0.001) return [0, 0];
  ix += outer ? 53.2 : 0;
  iy += outer ? 71.4 : 0;
  const seedA = hash(ix + 13.1, iy + 7.9) * 6.2831853;
  const seedB = hash(ix + 41.7, iy + 2.3) * 6.2831853;
  const frequency = 22 + (52 - 22) * hash(ix + 5.5, iy + 29.1);
  return [
    Math.sin(v * frequency + seedA) + Math.sin((u + v) * frequency * 0.65 + seedB),
    Math.cos(u * frequency + seedB) + Math.sin((u - v) * frequency * 0.55 + seedA),
  ].map((x) => x * amount * strength * 0.05);
}

function translateShader(c, u, v, adversarialHash = null) {
  if (c.progress <= 0.001) return { source: [u, v], target: null };
  if (c.progress >= 0.999) return { source: null, target: [u, v] };
  const aspect = c.resolution.x / c.resolution.y;
  let x = (u - 0.5) * aspect;
  let y = v - 0.5;
  if (Math.abs(c.fisheyeStrength) >= 1e-5) {
    const fisheye = 1 + c.fisheyeStrength * (x * x + y * y);
    x *= fisheye;
    y *= fisheye;
  }
  const cell = coordinates(x * c.hexScale, y * c.hexScale);
  const { lx, ly, ix, iy } = cell;
  const distance = Math.max(Math.abs(lx), Math.abs(lx) * 0.5 + Math.abs(ly) * BASIS_Y * 0.5);
  let row = clamp(iy * BASIS_Y / c.hexScale * 0.5 + 0.5);
  if (c.revealFromTop > 0.5) row = 1 - row;
  const jitter = ((adversarialHash ?? hash(ix, iy)) - 0.5) * c.rowRandomStrength *
    Math.sin(c.progress * 3.14159265);
  const threshold = clamp(row + jitter);
  const rowSoft = Math.max(c.rowSoftness * c.cellRevealSpan, 0.002);
  const q = smooth(threshold - rowSoft, threshold + rowSoft, c.progress);
  const soft = Math.max(c.innerSoftness, 0.001);
  if (q === 0 && distance <= 0.5 + soft * 0.5) return { source: [u, v], target: null };
  if (q === 1 && c.innerMinRadius <= soft * 0.5) return { source: null, target: [u, v] };
  let t = smooth(0, 1, q);
  if (c.innerRevealPower > 0.001) t **= c.innerRevealPower;
  const radius = c.innerMaxRadius + (c.innerMinRadius - c.innerMaxRadius) * t;
  const mask = t <= 0.001 ? (distance <= 0.5 + soft * 0.5 ? 1 : 0)
    : radius <= soft * 0.5 ? 0 : smooth(radius + soft, radius - soft, distance);

  const scaled = (amount, scale) => [
    clamp(u + lx / c.hexScale / aspect * (scale - 1) * amount),
    clamp(v + ly / c.hexScale * (scale - 1) * amount),
  ];
  let source = null;
  let target = null;
  if (mask > 0) {
    const effect = t * clamp(c.sourceTextureEffectStrength);
    const uv = scaled(effect, c.innerTextureScale);
    const offset = wave(u, v, ix, iy, effect, c.innerDistortStrength, false);
    source = uv.map((value, axis) => clamp(value + offset[axis]));
  }
  if (mask < 1) {
    const widthAmount = 1 - 0.5 * clamp(t);
    const exitFade = 1 - smooth(0.88, 1, clamp(t)) * smooth(0.86, 1, clamp(q));
    const amount = clamp(widthAmount * exitFade);
    const uv = scaled(amount, c.outerTextureScale);
    const offset = wave(...uv, ix, iy, amount, c.outerDistortStrength, true);
    target = uv.map((value, axis) => clamp(value + offset[axis]));
  }
  return { source, target };
}

let testedPoints = 0;
let checkedContributions = 0;
let checkedTaps = 0;
let state = 0x736381;
function random() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
}

function assertWithin(band, min, max, context) {
  assert.ok(min >= band.min - 1e-10 && max <= band.max + 1e-10,
    `${context}: samples [${min},${max}] outside [${band.min},${band.max}]`);
}

function grainY(u, v, radius) {
  return (5 * fract(Math.sin(v * 12.9898 + u * 78.233) * 43758.5453) - 2.5) * radius;
}

function checkLinearGrainTaps(band, sample, c, rt, grain) {
  const compositeWidth = Math.floor(c.resolution.x);
  const compositeHeight = Math.floor(c.resolution.y);
  const tx = Math.floor(sample[0] * compositeWidth - 0.5);
  const ty = Math.floor(sample[1] * compositeHeight - 0.5);
  for (const dx of [0, 1]) for (const dy of [0, 1]) {
    const u = (clamp(tx + dx, 0, compositeWidth - 1) + 0.5) / compositeWidth;
    const v = (clamp(ty + dy, 0, compositeHeight - 1) + 0.5) / compositeHeight;
    const modelY = v + grainY(u, v, grain);
    const modelTexel = Math.floor(clamp(modelY) * rt.height - 0.5);
    for (const offset of [0, 1]) {
      const center = (clamp(modelTexel + offset, 0, rt.height - 1) + 0.5) / rt.height;
      assertWithin(band, center, center, "linear/grain tap");
      checkedTaps += 1;
    }
  }
}

function checkPoint(c, rt, grain, bands, u, v, adversarialHash) {
  const rendered = translateShader(c, u, v, adversarialHash);
  for (const side of ["source", "target"]) {
    const sample = rendered[side];
    if (!sample) continue;
    checkedContributions += 1;
    // Actual full UV warp + all possible grain directions and filter offsets.
    const lookupPad = 2.5 * grain + 1 / Math.floor(c.resolution.y) + 1 / rt.height;
    assertWithin(bands[side], clamp(sample[1] - lookupPad), clamp(sample[1] + lookupPad),
      `${side}, P=${c.progress}, reverse=${c.revealFromTop}, uv=${u},${v}`);
    // Stronger than a particular CPU wave/hash implementation: once the
    // source/target contributes here, allow the ENTIRE displacement bound
    // in either direction, regardless of its cell hash, waveform or playhead.
    const cellExtent = 1 / (Math.sqrt(3) * c.hexScale);
    const warpBound = side === "source"
      ? clamp(c.sourceTextureEffectStrength) *
        (Math.abs(c.innerTextureScale - 1) * cellExtent + 0.1 * c.innerDistortStrength)
      : Math.abs(c.outerTextureScale - 1) * cellExtent + 0.1 * c.outerDistortStrength;
    assertWithin(bands[side], clamp(v - warpBound - lookupPad), clamp(v + warpBound + lookupPad),
      `${side} adversarial warp/lookup displacement`);
    if ((testedPoints & 511) === 0) checkLinearGrainTaps(bands[side], sample, c, rt, grain);
  }
  testedPoints += 1;
}

const start = performance.now();
// Dense sampling of default/high/compact scales, portrait through 4:1 landscape,
// endpoints, both directions, the fisheye no-op cutoff and real grain values.
for (const [width, height] of [[330, 740], [390, 664], [768, 1024], [844, 390], [1920, 480]]) {
  for (const scale of [18, 29.7]) for (const reverse of [0, 1]) {
    for (const progress of [0, 0.001, 0.001001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.998999, 0.999, 1]) {
      const c = make({ resolution: { x: width, y: height }, hexScale: scale, revealFromTop: reverse, progress });
      const rt = { width, height };
      const grain = progress === 0.5 ? 0.0025 : 0;
      const bands = getHexVisibleBands(c, rt, grain);
      assert.equal(bands.fallback, false);
      for (let y = 0; y < 91; y += 1) for (let x = 0; x < 65; x += 1) {
        checkPoint(c, rt, grain, bands, x / 64, y / 90, null);
      }
    }
  }
}

// Supported custom configurations, including minimum soft/span, tiny power,
// scales below/above 1, zero source effect and mismatched RT/hex resolution.
for (let caseIndex = 0; caseIndex < 150; caseIndex += 1) {
  const height = [128, 390, 664, 1024][caseIndex % 4];
  const aspect = 0.2 + random() * 5.8;
  const width = Math.max(2, Math.floor(height * aspect));
  const soft = random() * 0.19;
  const c = make({
    resolution: { x: width, y: height }, progress: 0.00101 + random() * 0.99798,
    revealFromTop: caseIndex % 2,
    hexScale: [1, 18, 29.7, 128][caseIndex % 4],
    fisheyeStrength: [0, 0.000009999, 0.00001, 0.4, 1][caseIndex % 5],
    innerSoftness: soft, innerMaxRadius: Math.max(0.6, 0.5 + soft) + random(),
    innerMinRadius: random() * Math.max(soft, 0.001) * 0.5,
    innerRevealPower: [0, 0.001, 0.00101, 0.1, 0.25, 2.5, 8][caseIndex % 7],
    innerTextureScale: 0.25 + random() * 7.75,
    outerTextureScale: 0.25 + random() * 7.75,
    innerDistortStrength: random(), outerDistortStrength: random(),
    sourceTextureEffectStrength: [-1, 0, 0.4, 1, 2][caseIndex % 5],
    rowSoftness: random() * 0.1, rowRandomStrength: random() * 0.5,
    cellRevealSpan: 0.25 + random() * 3.75,
  });
  const rt = { width: Math.floor(width * 0.75), height: Math.floor(height * 0.75) };
  const grain = caseIndex % 3 === 0 ? 0.012 : 0;
  const bands = getHexVisibleBands(c, rt, grain);
  assert.equal(bands.fallback, false, JSON.stringify(c));
  for (let i = 0; i < 5000; i += 1) {
    // Include both extremal row-jitter signs, independent of CPU vs GPU hash.
    checkPoint(c, rt, grain, bands, random(), random(), [0, 1, null][i % 3]);
  }
}

// Actual uniform-wrapper API and fallback boundaries, one malformed field at
// a time. Future/unvalidated config remains the full-frame renderer behavior.
const uniformDefaults = Object.fromEntries(Object.entries(make()).map(([k, value]) => [k, { value }]));
assert.deepEqual(getHexVisibleBands(uniformDefaults, [390, 664]), getHexVisibleBands(make(), { x: 390, y: 664 }));
for (const key of Object.keys(make()).filter((key) => key !== "resolution")) {
  assert.equal(getHexVisibleBands(make({ [key]: NaN }), [390, 664]).fallback, true, key);
}
for (const [key, value] of [
  ["fisheyeStrength", -0.1], ["fisheyeStrength", 1.01], ["hexScale", 0], ["hexScale", 129],
  ["innerMinRadius", 0.03], ["innerMaxRadius", 0.4], ["innerRevealPower", 9],
  ["innerSoftness", 0.21], ["innerTextureScale", 0], ["outerDistortStrength", 2],
  ["rowRandomStrength", 0.6], ["rowSoftness", 0.5], ["cellRevealSpan", 0],
]) {
  const result = getHexVisibleBands(make({ [key]: value }), [390, 664]);
  assert.equal(result.fallback, true, `${key}=${value}`);
  assert.deepEqual(result.source, { min: 0, max: 1 });
  assert.deepEqual(result.target, { min: 0, max: 1 });
}
for (const size of [[1, 600], [390, NaN], [17000, 600]]) {
  assert.equal(getHexVisibleBands(make(), size).fallback, true);
}
assert.equal(getHexVisibleBands(make({ resolution: { x: 30, y: 600 } }), [30, 600]).fallback, true);
assert.equal(getHexVisibleBands(make(), [390, 664], -0.01).fallback, true);
assert.equal(getHexVisibleBands(make(), [390, 664], Infinity).fallback, true);
assert.deepEqual(getHexVisibleBands(make({ progress: 0 }), [1, 1]).target, { min: 0, max: 0 });

// Grain/filter padding must only expand required bounds. A reserve is not
// silently included in required bands and therefore cannot defeat containment.
const ordinary = getHexVisibleBands(make(), [390, 664]);
const grainBands = getHexVisibleBands(make(), [390, 664], 0.01);
const smallRT = getHexVisibleBands(make(), [195, 332]);
for (const side of ["source", "target"]) {
  assert.ok(hexBandContains(grainBands[side], ordinary[side]));
  assert.ok(hexBandContains(smallRT[side], ordinary[side]));
  const drawn = expandHexBandForDraw(ordinary[side]);
  assert.ok(hexBandContains(drawn, ordinary[side]));
  assert.ok(drawn.min < ordinary[side].min || drawn.max > ordinary[side].max);
}
assert.ok(ordinary.target.max < 0.67, "draw reserve must not be in required bounds");
assert.equal(hexBandContains({ min: 0, max: 0.4 }, { min: 0, max: 0.400001 }), false);
assert.equal(hexBandContains(null, { min: 0, max: 0 }), true);
assert.equal(hexBandContains(null, { min: 0, max: 1 }), false);
assert.deepEqual(expandHexBandForDraw({ min: 0, max: 0 }), { min: 0, max: 0 });

// Simulate alternating layer caches through forward motion, reversal, a menu
// jump and an endpoint. Validate coverage before reuse, forcing fresh draws
// whenever expanded required coverage escapes the cached drawn rectangle.
let caches = { source: null, target: null };
let forcedDraws = 0;
let safeReuses = 0;
const path = [
  ...Array.from({ length: 81 }, (_, i) => i / 100),
  ...Array.from({ length: 70 }, (_, i) => (80 - i) / 100),
  0.99, 1, 0.5, 0.1, 0,
];
for (let frame = 0; frame < path.length; frame += 1) {
  const required = getHexVisibleBands(make({ progress: path[frame] }), [390, 664]);
  for (const [index, side] of ["source", "target"].entries()) {
    const scheduledDraw = frame % 2 === index;
    if (scheduledDraw || !hexBandContains(caches[side], required[side])) {
      caches[side] = expandHexBandForDraw(required[side]);
      forcedDraws += 1;
    } else safeReuses += 1;
    assert.ok(hexBandContains(caches[side], required[side]));
  }
}
assert.ok(safeReuses > 0 && forcedDraws > 0);

const elapsed = performance.now() - start;
const benchmarkStart = performance.now();
for (let i = 0; i < 10000; i += 1) {
  getHexVisibleBands(make({ progress: (i % 997 + 1) / 1000 }), [390, 664]);
}
const benchmarkMs = performance.now() - benchmarkStart;
console.log(JSON.stringify({
  passed: true, testedPoints, checkedContributions, checkedTaps, elapsedMs: Math.round(elapsed),
  cache: { forcedDraws, safeReuses }, helperMicrosecondsPerCall: benchmarkMs * 1000 / 10000,
  defaultMidpoint: ordinary,
}, null, 2));


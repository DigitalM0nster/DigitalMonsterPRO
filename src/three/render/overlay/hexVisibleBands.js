/**
 * Conservative model-RT sampling bands for hexGridOverlayMaterial.js.
 * No THREE/renderer dependency; bounds follow the prepared shader uniforms.
 *
 * Coordinate system: normalized WebGL texture Y (0 = bottom).
 * `uniforms.resolution` supplies the HEX shader's exact fisheye aspect ratio.
 * `resolution` supplies the actual scissored model RT's pixel dimensions.
 * Pass the active pre-hex grain radius, or zero when grain is disabled.
 *
 * Includes both hex UV warps, pre-hex model grain, two linear-sampling
 * footprints, and numerical slack. Does NOT include arbitrary cache reserve.
 * Assumes ClampToEdge, linear non-mipmapped RT textures and the current shader.
 * Keep the final hex pass and post-hex bloom full-screen. Use scissor, never
 * crop the viewport or change the scene camera/projection to these bounds.
 */

const SQRT_3 = Math.sqrt(3);
const NUMERIC_SLACK = 1e-6;
const FULL = () => ({ min: 0, max: 1 });
const EMPTY = () => ({ min: 0, max: 0 });
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const finiteRange = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

function valueOf(uniforms, key) {
  const uniform = uniforms?.[key];
  return uniform != null && typeof uniform === "object" && "value" in uniform
    ? uniform.value
    : uniform;
}

function dimensions(resolution) {
  return {
    width: resolution?.width ?? resolution?.x ?? resolution?.[0],
    height: resolution?.height ?? resolution?.y ?? resolution?.[1],
  };
}

function fallback(reason) {
  return { source: FULL(), target: FULL(), fallback: true, reason };
}

function inverseSmoothstep(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return 0.5 - Math.sin(Math.asin(1 - 2 * value) / 3);
}

// Fisheye Y = y * (1 + k*x*x + k*y*y); k >= 0 guarantees monotonic Y.
// At each endpoint return an outward enclosure rather than a rounded root.
function inverseFisheyeY(value, x, strength, upper) {
  const linear = 1 + strength * x * x;
  const evaluate = (y) => y * (linear + strength * y * y);
  if (value < evaluate(-0.5)) return -Infinity;
  if (value > evaluate(0.5)) return Infinity;
  let low = -0.5;
  let high = 0.5;
  for (let i = 0; i < 36; i += 1) {
    const middle = (low + high) * 0.5;
    if (evaluate(middle) < value) low = middle;
    else high = middle;
  }
  return upper ? high : low;
}

function normalizedBand(min, max) {
  const normalizedMin = clamp01(min);
  const normalizedMax = clamp01(max);
  return normalizedMax <= normalizedMin
    ? EMPTY()
    : { min: normalizedMin, max: normalizedMax };
}

/**
 * @returns {{source:{min:number,max:number},target:{min:number,max:number},
 *   fallback:boolean,reason?:string}}
 */
export function getHexVisibleBands(uniforms, resolution, grainRadius = 0) {
  const progress = valueOf(uniforms, "progress");
  if (!Number.isFinite(progress)) return fallback("invalid-progress");
  // These uniform branches precede all hex math in the real fragment shader.
  if (progress <= 0.001) {
    return { source: FULL(), target: EMPTY(), fallback: false };
  }
  if (progress >= 0.999) {
    return { source: EMPTY(), target: FULL(), fallback: false };
  }

  const hexSize = dimensions(valueOf(uniforms, "resolution"));
  const rtSize = dimensions(resolution ?? valueOf(uniforms, "resolution"));
  if (![hexSize, rtSize].every(({ width, height }) =>
    finiteRange(width, 2, 16384) && finiteRange(height, 2, 16384))) {
    return fallback("invalid-resolution");
  }
  const aspect = hexSize.width / hexSize.height;
  const scale = valueOf(uniforms, "hexScale");
  const fisheye = valueOf(uniforms, "fisheyeStrength");
  const reverse = valueOf(uniforms, "revealFromTop");
  const maximumRadius = valueOf(uniforms, "innerMaxRadius");
  const minimumRadius = valueOf(uniforms, "innerMinRadius");
  const softnessValue = valueOf(uniforms, "innerSoftness");
  const powerValue = valueOf(uniforms, "innerRevealPower");
  const innerScale = valueOf(uniforms, "innerTextureScale");
  const innerDistortion = valueOf(uniforms, "innerDistortStrength");
  const sourceEffect = valueOf(uniforms, "sourceTextureEffectStrength");
  const outerScale = valueOf(uniforms, "outerTextureScale");
  const outerDistortion = valueOf(uniforms, "outerDistortStrength");
  const rowSoftness = valueOf(uniforms, "rowSoftness");
  const rowRandomness = valueOf(uniforms, "rowRandomStrength");
  const revealSpan = valueOf(uniforms, "cellRevealSpan");
  const soft = Math.max(softnessValue, 0.001);
  const rowSoft = Math.max(rowSoftness * revealSpan, 0.002);

  // Conservative opt-in envelope: future/custom modes that leave it retain
  // the full-frame path. Negative fisheye may fold Y and must never use this
  // monotonic inverse. A non-vanishing final inner radius is also unsupported.
  const supported =
    finiteRange(aspect, 0.2, 6) &&
    finiteRange(scale, 1, 128) &&
    finiteRange(fisheye, 0, 1) && Number.isFinite(reverse) &&
    finiteRange(maximumRadius, 0.6, 2) &&
    finiteRange(softnessValue, 0, 0.2) &&
    maximumRadius >= 0.5 + soft &&
    finiteRange(minimumRadius, 0, soft * 0.5) &&
    finiteRange(powerValue, 0, 8) &&
    finiteRange(innerScale, 0.25, 8) &&
    finiteRange(outerScale, 0.25, 8) &&
    finiteRange(innerDistortion, 0, 1) &&
    finiteRange(outerDistortion, 0, 1) &&
    Number.isFinite(sourceEffect) &&
    finiteRange(rowSoftness, 0, 0.5) &&
    finiteRange(rowRandomness, 0, 0.5) &&
    finiteRange(revealSpan, 0.25, 4) && rowSoft <= 0.5 &&
    finiteRange(grainRadius, 0, 0.2);
  if (!supported) return fallback("unsupported-config");

  // Current grid is a regular Voronoi hex: distance <= 1/2 and
  // |localY| <= 1/sqrt(3). The cell-center row can therefore differ from
  // fisheye(pixel).y by at most this amount.
  const cellYRadius = 1 / (SQRT_3 * scale);
  const radiusRange = maximumRadius - minimumRadius;
  const power = powerValue > 0.001 ? powerValue : 1;
  // Target is exactly absent until radius < maxHexDist + soft. Source is
  // exactly absent once radius <= soft/2 (explicit shader branch). Preserve
  // its special T <= .001 full-cell source branch in both thresholds.
  const targetT = Math.max(0.001,
    clamp01((maximumRadius - (0.5 + soft)) / radiusRange));
  const sourceT = Math.max(0.001,
    clamp01((maximumRadius - soft * 0.5) / radiusRange));
  const targetQ = inverseSmoothstep(targetT ** (1 / power));
  const sourceQ = inverseSmoothstep(sourceT ** (1 / power));
  const targetCoefficient = 1 - 2 * inverseSmoothstep(targetQ);
  const sourceCoefficient = 1 - 2 * inverseSmoothstep(sourceQ);
  const jitter = 0.5 * rowRandomness * Math.abs(Math.sin(progress * Math.PI));
  const targetThreshold = progress + rowSoft * targetCoefficient + NUMERIC_SLACK;
  const sourceThreshold = progress + rowSoft * sourceCoefficient - NUMERIC_SLACK;
  // Preserve threshold-clamp semantics before adding the jitter bound.
  const targetRow = targetThreshold <= 0 ? -Infinity
    : targetThreshold >= 1 ? Infinity : targetThreshold + jitter;
  const sourceRow = sourceThreshold < 0 ? -Infinity
    : sourceThreshold >= 1 ? Infinity : sourceThreshold - jitter;

  // In oriented coordinates v = (+/-)(screenY-.5), target is below an upper
  // bound and source above a lower bound. Union across X uses the viewport
  // edge for a negative upper / positive lower inverse and center otherwise.
  const strength = Math.abs(fisheye) < 1e-5 ? 0 : fisheye;
  const targetFisheyeY = 2 * (targetRow - 0.5) + cellYRadius;
  const sourceFisheyeY = 2 * (sourceRow - 0.5) - cellYRadius;
  const targetUpper = targetRow <= 0 ? -Infinity : targetRow >= 1 ? Infinity
    : inverseFisheyeY(targetFisheyeY,
      targetFisheyeY < 0 ? aspect * 0.5 : 0, strength, true);
  const sourceLower = sourceRow <= 0 ? -Infinity : sourceRow >= 1 ? Infinity
    : inverseFisheyeY(sourceFisheyeY,
      sourceFisheyeY >= 0 ? aspect * 0.5 : 0, strength, false);

  // Two wave terms have total amplitude <= 2, multiplied by strength*.05.
  // Grain's fract(...)*5-2.5 contributes <= 2.5*radius. Linear filtering
  // occurs hex->composite and composite->model; reserve one texel per lookup
  // using the smaller height (also handles minor DPR rounding differences).
  const filtering = 2 / Math.min(hexSize.height, rtSize.height);
  const grain = 2.5 * grainRadius;
  const sharedPadding = filtering + grain + NUMERIC_SLACK;
  const sourcePadding = clamp01(sourceEffect) *
    (Math.abs(innerScale - 1) * cellYRadius + 0.1 * innerDistortion) + sharedPadding;
  const targetPadding = Math.abs(outerScale - 1) * cellYRadius +
    0.1 * outerDistortion + sharedPadding;

  if (reverse > 0.5) {
    return {
      source: normalizedBand(0, 0.5 - sourceLower + sourcePadding),
      target: normalizedBand(0.5 - targetUpper - targetPadding, 1),
      fallback: false,
    };
  }
  return {
    source: normalizedBand(0.5 + sourceLower - sourcePadding, 1),
    target: normalizedBand(0, 0.5 + targetUpper + targetPadding),
    fallback: false,
  };
}

function validBand(band) {
  return band != null && Number.isFinite(band.min) && Number.isFinite(band.max) &&
    band.min >= 0 && band.max <= 1 && band.min <= band.max;
}

/** Actual cached coverage must contain the next frame's REQUIRED coverage. */
export function hexBandContains(cached, required) {
  if (!validBand(required)) return false;
  if (required.max <= required.min) return true;
  return validBand(cached) && cached.min <= required.min && cached.max >= required.max;
}

/** Optional temporal reserve is applied only when DRAWING, not in containment. */
export function expandHexBandForDraw(required, reserve = 0.04) {
  if (!validBand(required) || !Number.isFinite(reserve)) return FULL();
  if (required.max <= required.min) return EMPTY();
  const padding = Math.max(0, reserve);
  return normalizedBand(required.min - padding, required.max + padding);
}

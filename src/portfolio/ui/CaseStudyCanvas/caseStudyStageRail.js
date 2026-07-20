/**
 * Left stage scroll — chrome layer (not left from/to textures).
 *
 * Visual language mirrors the right case arc: nested circles + thin track
 * that hard-cuts at nodes. Segments between nodes use varied dash strokes.
 * Active marker / fill follow case stageProgress smoothly (not discrete snaps).
 */
import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	getActiveBloomGlowColors,
	getArcLineStrokeStyle,
	resolveNodeMarkerRadii,
} from "./caseStudyArcConfig.js";
import { CASE_STUDY_DISPLAY_FONT } from "./caseStudyCanvasText.js";
import { caseStudyStageRailConfig } from "./caseStudyStageRailConfig.js";
import { getStageProgress } from "@/portfolio/core/stageProgress.js";
import {
	getCaseStageClickMosaicFromIndex,
	getCaseStageClickMosaicProgress,
	getCaseStageClickMosaicTargetIndex,
	isCaseStageClickMosaicActive,
} from "@/portfolio/core/caseStageClickMosaic.js";
import { store } from "@/store.jsx";

/** Room left of the spine for «01»… labels + gap to the node ring. */
const INDEX_SLOT_PX = 26;
const INDEX_GAP_PX = 8;
const INDEX_FONT_SIZE = 11;
/** Half-rail to the right of the spine (hits / clear). */
const SPINE_RIGHT_PAD = 18;
const SPINE_X = INDEX_SLOT_PX + INDEX_GAP_PX;
const RAIL_WIDTH = SPINE_X + SPINE_RIGHT_PAD;
const BASE_ITEM_GAP = 56;
const SPINE_VIEWPORT_FRAC = 0.5;

/**
 * Header link path animation (circle → digits).
 * - in:  draw from circle toward digits (t 0→1) → visible [0, t·L]
 * - out: erase from circle toward digits (t 0→1) → visible [t·cap·L, cap·L]
 * Draw starts when the glow head arrives on a node — not when scroll spring fully rests.
 */
const LINK_DRAW_PER_SEC = 1.65;
const LINK_ERASE_PER_SEC = 2.8;
/** Leave attached circle → start erase. */
const LINK_LEAVE_EPS = 0.2;
/** Arrive on a circle → start draw (even if scroll is still settling). */
const LINK_ARRIVE_EPS = 0.1;
/** @typedef {'shown' | 'out' | 'hidden' | 'in'} HeaderLinkPhase */
/** @type {HeaderLinkPhase} */
let headerLinkPhase = "shown";
let headerLinkT = 1;
/** 0…1 — path fraction that existed when erase started (mid-draw interrupt). */
let headerLinkPathCap = 1;
/** Stage index the path is attached to while animating / idle. */
let headerLinkAnchorIndex = 0;
let headerLinkPendingAnchor = 0;
/** Skip advancing t on the frame we enter a phase so the first paint shows t=0. */
let headerLinkHoldTick = false;

/**
 * Target stage from React (fallback). Arrival prefers the nearest rail node.
 * @param {number} stageIndex
 */
export function syncCaseStudyStageRailHeaderLinkAnchor(stageIndex) {
	headerLinkPendingAnchor = Math.max(0, stageIndex | 0);
}

function beginHeaderLinkErase() {
	if (headerLinkPhase === "out" || headerLinkPhase === "hidden") {
		return;
	}
	if (headerLinkPhase === "in") {
		headerLinkPathCap = Math.max(0.02, headerLinkT);
	} else {
		headerLinkPathCap = 1;
	}
	headerLinkPhase = "out";
	headerLinkT = 0;
	headerLinkHoldTick = true;
}

function beginHeaderLinkDraw(nodeIndex) {
	headerLinkPendingAnchor = Math.max(0, nodeIndex | 0);
	headerLinkAnchorIndex = headerLinkPendingAnchor;
	headerLinkPathCap = 1;
	headerLinkPhase = "in";
	headerLinkT = 0;
	headerLinkHoldTick = true;
}

function resolveHeaderLinkActiveFloat() {
	const activeIndex = store.portfolioExperience?.activeStateIndex ?? headerLinkPendingAnchor;
	const stateCount = Math.max(
		activeIndex + 2,
		headerLinkPendingAnchor + 2,
		headerLinkAnchorIndex + 2,
		2,
	);
	return resolveCaseStudyStageRailFloat(activeIndex, stateCount);
}

/**
 * Advance header-link draw/erase along its path. Call from case rAF each frame.
 * @param {number} dt seconds
 * @returns {boolean} still animating
 */
export function tickCaseStudyStageRailHeaderLink(dt) {
	const safeDt = Math.max(0, Math.min(0.05, dt));
	const activeFloat = resolveHeaderLinkActiveFloat();
	const nearest = Math.round(activeFloat);
	const distToNearest = Math.abs(activeFloat - nearest);
	const onNode = distToNearest <= LINK_ARRIVE_EPS;
	const leftAnchor = Math.abs(activeFloat - headerLinkAnchorIndex) > LINK_LEAVE_EPS;

	// Erase only when the head leaves the circle the link is drawn from.
	if ((headerLinkPhase === "shown" || headerLinkPhase === "in") && leftAnchor) {
		beginHeaderLinkErase();
	}

	if (headerLinkHoldTick) {
		headerLinkHoldTick = false;
		return true;
	}

	if (headerLinkPhase === "out") {
		headerLinkT = Math.min(1, headerLinkT + LINK_ERASE_PER_SEC * safeDt);
		if (headerLinkT >= 1) {
			headerLinkPhase = "hidden";
			headerLinkT = 1;
		}
	} else if (headerLinkPhase === "in") {
		headerLinkT = Math.min(1, headerLinkT + LINK_DRAW_PER_SEC * safeDt);
		if (headerLinkT >= 1) {
			headerLinkPhase = "shown";
			headerLinkT = 1;
		}
	}

	// Draw as soon as we land on a circle — do not wait for scroll spring rest.
	if (headerLinkPhase === "hidden" && onNode) {
		beginHeaderLinkDraw(nearest);
	}

	return isCaseStudyStageRailHeaderLinkAnimating();
}

/** Keep chrome rAF alive while the link draws / erases. */
export function isCaseStudyStageRailHeaderLinkAnimating() {
	return headerLinkPhase === "in" || headerLinkPhase === "out";
}

export function getCaseStudyStageRailHeaderLinkVisual() {
	return {
		phase: headerLinkPhase,
		t: headerLinkT,
		pathCap: headerLinkPathCap,
		anchorIndex: headerLinkAnchorIndex,
	};
}

/** Offset of the node spine from `railX` — used to pin spine to brand left. */
export function getCaseStudyStageRailSpineOffset() {
	return SPINE_X;
}

function resolveRailTrackW() {
	const cfg = caseStudyStageRailConfig;
	return Math.max(cfg.trackWidthMin, caseStudyArcInternals.trackWidth * cfg.trackWidthMul);
}

/**
 * Dash patterns between stages — each segment picks a different stroke rhythm.
 * Empty = solid hairline (used for completed/past fill).
 */
const SEGMENT_DASHES = [
	[3, 5],
	[1.5, 3.5],
	[5, 3, 1.5, 3],
	[2, 2, 2, 6],
	[1, 2.5, 4, 2.5],
	[6, 4],
	[1.5, 1.5, 1.5, 5],
];

/**
 * Continuous rail position: activeStateIndex + stageProgress (commit-wrap continuous).
 * During stage-click mosaic, lerps from→to by mosaic progress.
 *
 * @param {number} activeStateIndex
 * @param {number} stateCount
 */
export function resolveCaseStudyStageRailFloat(activeStateIndex, stateCount) {
	const maxIndex = Math.max(0, (stateCount | 0) - 1);
	if (isCaseStageClickMosaicActive()) {
		const from = getCaseStageClickMosaicFromIndex();
		const to = getCaseStageClickMosaicTargetIndex();
		const t = getCaseStageClickMosaicProgress();
		if (from != null && to != null && t != null) {
			return Math.max(0, Math.min(maxIndex, from + (to - from) * t));
		}
	}
	const index = Number.isFinite(activeStateIndex) ? activeStateIndex : 0;
	return Math.max(0, Math.min(maxIndex, index + getStageProgress()));
}

/**
 * Compact token for animation-frame dirty checks (no layout needed).
 */
export function getCaseStudyStageRailMotionToken() {
	const link = `p:${headerLinkPhase}|t:${headerLinkT.toFixed(2)}|a:${headerLinkAnchorIndex}`;
	if (isCaseStageClickMosaicActive()) {
		const t = getCaseStageClickMosaicProgress();
		if (t != null) {
			return `c:${t.toFixed(4)}|${link}`;
		}
	}
	return `s:${getStageProgress().toFixed(4)}|${link}`;
}

/**
 * Vertical center of the pinned header badge line («01 / О ПРОЕКТЕ»).
 * Keep in sync with drawSectionBadge metrics (categoryFontSize * 1.35).
 * @param {number} headerTop
 * @param {number} [categoryFontSize=13]
 */
export function resolveStageRailHeaderAnchorY(headerTop, categoryFontSize = 13) {
	const badgeH = categoryFontSize * 1.35 + 2;
	return headerTop + badgeH * 0.5;
}

/**
 * @param {number} stateCount
 * @param {number} viewportH
 */
function resolveStageSpacing(stateCount, viewportH) {
	const n = Math.max(1, stateCount | 0);
	if (n === 1) {
		return { gap: 0, span: 0 };
	}
	const natural = (n - 1) * BASE_ITEM_GAP;
	const span = Math.max(natural, (viewportH || 900) * SPINE_VIEWPORT_FRAC);
	return { gap: span / (n - 1), span };
}

function resolveRailNodeRadii() {
	const scale = caseStudyStageRailConfig.nodeScale;
	const base = resolveNodeMarkerRadii(caseStudyArcInternals, false);
	return {
		outer: Math.max(6, base.outer * scale),
		mid: Math.max(3, base.mid * scale),
		inner: Math.max(1.5, base.inner * scale),
	};
}

/**
 * @param {number} stateCount
 * @param {number} [viewportH]
 */
export function measureCaseStudyStageRailHeight(stateCount, viewportH = 900) {
	const n = Math.max(0, stateCount | 0);
	if (n <= 0) {
		return 0;
	}
	const { outer } = resolveRailNodeRadii();
	if (n === 1) {
		return outer * 2 + 8;
	}
	const { span } = resolveStageSpacing(n, viewportH);
	return span + outer * 2 + 8;
}

export function getCaseStudyStageRailWidth() {
	return RAIL_WIDTH;
}

/**
 * Y along the spine for a continuous float index.
 * @param {number[]} centers
 * @param {number} activeFloat
 */
function resolveActiveY(centers, activeFloat) {
	if (centers.length === 0) {
		return 0;
	}
	if (centers.length === 1) {
		return centers[0];
	}
	const maxIndex = centers.length - 1;
	const clamped = Math.max(0, Math.min(maxIndex, activeFloat));
	const i0 = Math.floor(clamped);
	const i1 = Math.min(maxIndex, i0 + 1);
	const t = clamped - i0;
	return centers[i0] + (centers[i1] - centers[i0]) * t;
}

/**
 * Active progress stroke: core line + even soft bloom along the whole segment.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y0
 * @param {number} y1
 */
function strokeActiveProgressLine(ctx, x, y0, y1) {
	if (y1 <= y0 + 0.5) {
		return;
	}
	const rail = caseStudyStageRailConfig;
	const arc = caseStudyArcConfig;
	const trackW = resolveRailTrackW();
	const alpha = Math.max(0, Math.min(1, rail.progressAlpha));
	const bloomBlur = rail.lineBloomBlur;
	const bloomStrength = rail.lineBloomStrength;
	const glowColors = getActiveBloomGlowColors(arc, bloomStrength);

	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.setLineDash([]);

	if (bloomBlur > 0.05 && bloomStrength > 0.02) {
		ctx.save();
		ctx.globalCompositeOperation = "lighter";
		ctx.globalAlpha = Math.min(1, bloomStrength * 0.45);
		ctx.shadowColor = glowColors.soft;
		ctx.shadowBlur = bloomBlur * 1.6;
		ctx.strokeStyle = getArcLineStrokeStyle(arc.activeColor, alpha * 0.85);
		ctx.lineWidth = trackW + 1.2;
		ctx.beginPath();
		ctx.moveTo(x, y0);
		ctx.lineTo(x, y1);
		ctx.stroke();
		ctx.restore();

		ctx.save();
		ctx.globalCompositeOperation = "lighter";
		ctx.globalAlpha = Math.min(1, bloomStrength * 0.7);
		ctx.shadowColor = glowColors.core;
		ctx.shadowBlur = bloomBlur * 0.75;
		ctx.strokeStyle = getArcLineStrokeStyle(arc.activeColor, alpha);
		ctx.lineWidth = trackW;
		ctx.beginPath();
		ctx.moveTo(x, y0);
		ctx.lineTo(x, y1);
		ctx.stroke();
		ctx.restore();
	}

	ctx.globalCompositeOperation = "source-over";
	ctx.shadowBlur = 0;
	if (rail.quietVeilExtra > 0.05 && rail.quietVeilAlphaMul > 0.01) {
		ctx.strokeStyle = getArcLineStrokeStyle(arc.activeColor, alpha * rail.quietVeilAlphaMul);
		ctx.lineWidth = trackW + rail.quietVeilExtra;
		ctx.beginPath();
		ctx.moveTo(x, y0);
		ctx.lineTo(x, y1);
		ctx.stroke();
	}
	ctx.strokeStyle = getArcLineStrokeStyle(arc.activeColor, alpha);
	ctx.lineWidth = trackW;
	ctx.beginPath();
	ctx.moveTo(x, y0);
	ctx.lineTo(x, y1);
	ctx.stroke();
	ctx.restore();
}

/**
 * Open track intervals between node rings (arc-style cutouts).
 * @param {number[]} centers
 * @param {number} clear
 * @returns {Array<{ a: number, b: number }>}
 */
function resolveOpenTrackSpans(centers, clear) {
	/** @type {Array<{ a: number, b: number }>} */
	const spans = [];
	for (let i = 0; i < centers.length - 1; i += 1) {
		const a = centers[i] + clear;
		const b = centers[i + 1] - clear;
		if (b - a >= 2) {
			spans.push({ a, b });
		}
	}
	return spans;
}

/**
 * How strongly the glow head is on a node ring (0…1) — line energy → circle.
 * Driven by Y distance so mid-segment travel never falsely "captures" a node.
 * @param {number} cy — node center Y
 * @param {number} yActive
 * @param {number} clear — outer ring cutout radius
 */
function nodeGlowCapture(cy, yActive, clear) {
	const cfg = caseStudyStageRailConfig;
	const dist = Math.abs(yActive - cy);
	const span = clear * cfg.nodeCaptureSpanMul;
	if (dist >= span) {
		return 0;
	}
	const x = dist / span;
	return Math.exp(-cfg.nodeCaptureFalloff * x * x) * (1 - x);
}

/**
 * Future track only — dashed, hard-cut at node rings.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y0
 * @param {number} y1
 * @param {number} clear
 * @param {number} yActive
 * @param {number[]} dash
 */
function strokeFutureSegment(ctx, x, y0, y1, clear, yActive, dash) {
	const a = y0 + clear;
	const b = y1 - clear;
	if (b - a < 2) {
		return;
	}
	const start = Math.max(a, yActive + 2);
	if (start >= b - 0.5) {
		return;
	}

	ctx.save();
	ctx.lineCap = "round";
	ctx.setLineDash(dash);
	ctx.strokeStyle = getArcLineStrokeStyle(
		caseStudyArcInternals.trackColor,
		caseStudyStageRailConfig.futureAlpha,
	);
	ctx.lineWidth = resolveRailTrackW();
	ctx.beginPath();
	ctx.moveTo(x, start);
	ctx.lineTo(x, b);
	ctx.stroke();
	ctx.restore();
}

/**
 * Bright progress on open spans only — never through node centers (arc cutouts).
 * When the marker sits on a node, line parks on the ring; glow stays on the open segments.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number[]} centers
 * @param {number} clear
 * @param {number} yActive
 */
function strokeProgressClipped(ctx, x, centers, clear, yActive) {
	const spans = resolveOpenTrackSpans(centers, clear);
	if (spans.length === 0) {
		return;
	}

	// Inside a node disk: park end on the ring (line does not cross the core).
	let headY = yActive;
	for (let i = 0; i < centers.length; i += 1) {
		const cy = centers[i];
		if (Math.abs(yActive - cy) < clear) {
			headY = yActive <= cy ? cy - clear : cy + clear;
			break;
		}
	}

	for (let s = 0; s < spans.length; s += 1) {
		const { a, b } = spans[s];
		if (headY <= a + 0.5) {
			break;
		}
		strokeActiveProgressLine(ctx, x, a, Math.min(b, headY));
	}
}

/**
 * Arc-style nested circle marker.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {{ outer: number, mid: number, inner: number }} radii
 * @param {number} highlight 0…1
 */
function drawArcStyleNode(ctx, cx, cy, radii, highlight) {
	const cfg = caseStudyArcConfig;
	const rail = caseStudyStageRailConfig;
	const trackW = resolveRailTrackW();
	const hl = Math.max(0, Math.min(1, highlight));
	const trackColor = caseStudyArcInternals.trackColor;
	const outerCol = hl > 0.05
		? getArcLineStrokeStyle(
			cfg.activeColor,
			rail.nodeOuterHlAlpha0 + hl * rail.nodeOuterHlAlpha1,
		)
		: getArcLineStrokeStyle(trackColor, rail.nodeIdleAlpha);
	const midAlpha = rail.nodeMidAlpha;
	const innerAlpha = hl > 0.55
		? rail.nodeInnerHotAlpha
		: rail.nodeIdleAlpha + 0.08;

	ctx.save();
	ctx.shadowBlur = 0;
	ctx.globalCompositeOperation = "source-over";

	if (hl > 0.05 && rail.nodeRingVeilAlpha > 0.01) {
		ctx.strokeStyle = getArcLineStrokeStyle(
			cfg.activeColor,
			rail.nodeRingVeilAlpha * hl,
		);
		ctx.lineWidth = Math.max(1.6, trackW + rail.nodeRingVeilExtra);
		ctx.beginPath();
		ctx.arc(cx, cy, radii.outer, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.strokeStyle = outerCol;
	ctx.lineWidth = Math.max(0.9, trackW * 0.8);
	ctx.beginPath();
	ctx.arc(cx, cy, radii.outer, 0, Math.PI * 2);
	ctx.stroke();

	ctx.fillStyle = getArcLineStrokeStyle(trackColor, midAlpha);
	ctx.beginPath();
	ctx.arc(cx, cy, radii.mid, 0, Math.PI * 2);
	ctx.arc(cx, cy, radii.inner, 0, Math.PI * 2, true);
	ctx.fill("evenodd");

	ctx.fillStyle = hl > 0.55
		? getArcLineStrokeStyle("#ffffff", Math.min(1, innerAlpha))
		: getArcLineStrokeStyle(hl > 0.05 ? cfg.activeColor : trackColor, innerAlpha);
	ctx.beginPath();
	ctx.arc(cx, cy, radii.inner, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}

/**
 * 0 at first stage start → 1 from mid-stage-0 onward.
 * Drives header-link corners: 90° → 45°.
 * @param {number} activeFloat
 */
function resolveHeaderLinkChamferT(activeFloat) {
	const t = Math.max(0, Math.min(1, activeFloat / 0.5));
	return t * t * (3 - 2 * t);
}

/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} activeFloat
 */
function resolveHeaderLinkGeometry(x0, y0, x1, y1, activeFloat) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const absDy = Math.abs(dy);
	if (absDy < 1.5) {
		return {
			points: [
				{ x: x0, y: y0 },
				{ x: x1, y: y1 },
			],
			length: dx,
		};
	}
	const signY = dy < 0 ? -1 : 1;
	const leg = Math.min(dx * 0.5, absDy * 0.5);
	const xMid = x0 + leg;
	const chamferT = resolveHeaderLinkChamferT(activeFloat);
	const yCorner1 = y0 + signY * leg * chamferT;
	const yCorner2 = y1 - signY * leg * chamferT;
	const points = [
		{ x: x0, y: y0 },
		{ x: xMid, y: yCorner1 },
	];
	if (Math.abs(yCorner2 - yCorner1) > 0.5) {
		points.push({ x: xMid, y: yCorner2 });
	}
	points.push({ x: x1, y: y1 });
	let length = 0;
	for (let i = 1; i < points.length; i += 1) {
		const ax = points[i].x - points[i - 1].x;
		const ay = points[i].y - points[i - 1].y;
		length += Math.hypot(ax, ay);
	}
	return { points, length };
}

/**
 * Polyline covering only the first `budget` px of `points` (from circle).
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} budget
 */
function trimPolylineToLength(points, budget) {
	if (points.length < 2 || budget <= 0) {
		return points.slice(0, 1);
	}
	/** @type {Array<{ x: number, y: number }>} */
	const out = [{ x: points[0].x, y: points[0].y }];
	let left = budget;
	for (let i = 1; i < points.length; i += 1) {
		const ax = points[i - 1].x;
		const ay = points[i - 1].y;
		const bx = points[i].x;
		const by = points[i].y;
		const seg = Math.hypot(bx - ax, by - ay);
		if (seg <= left) {
			out.push({ x: bx, y: by });
			left -= seg;
			continue;
		}
		const t = left / seg;
		out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
		break;
	}
	return out;
}

/**
 * Skip the first `skip` px, keep the rest (erase from circle toward digits).
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} skip
 * @param {number} end
 */
function trimPolylineRange(points, skip, end) {
	if (points.length < 2 || end <= skip + 0.5) {
		return [];
	}
	const head = trimPolylineToLength(points, end);
	if (head.length < 2 || skip <= 0.5) {
		return head;
	}
	// Walk until skip, then keep remainder of `head`.
	/** @type {Array<{ x: number, y: number }>} */
	const out = [];
	let walked = 0;
	for (let i = 1; i < head.length; i += 1) {
		const ax = head[i - 1].x;
		const ay = head[i - 1].y;
		const bx = head[i].x;
		const by = head[i].y;
		const seg = Math.hypot(bx - ax, by - ay);
		const next = walked + seg;
		if (next <= skip) {
			walked = next;
			continue;
		}
		if (out.length === 0) {
			const t = (skip - walked) / seg;
			out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
		}
		out.push({ x: bx, y: by });
		walked = next;
	}
	return out;
}

/**
 * Dashed link to chapter digits.
 * Draw/erase both run circle → digits along the same path.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {string} color
 * @param {number} activeFloat
 * @param {'shown' | 'out' | 'hidden' | 'in'} phase
 * @param {number} t
 * @param {number} pathCap
 */
function strokeHeaderLink(ctx, x0, y0, x1, y1, color, activeFloat, phase, t, pathCap) {
	if (x1 <= x0 + 8 || phase === "hidden") {
		return;
	}

	const { points, length } = resolveHeaderLinkGeometry(x0, y0, x1, y1, activeFloat);
	if (points.length < 2 || length < 1) {
		return;
	}

	const cap = Math.max(0.02, Math.min(1, pathCap)) * length;
	const u = Math.max(0, Math.min(1, t));
	/** @type {Array<{ x: number, y: number }>} */
	let visible;
	if (phase === "shown") {
		visible = points;
	} else if (phase === "in") {
		// Gradual draw circle → digits (no minimum stub that looks like a pop-in).
		const drawn = cap * u;
		if (drawn < 0.75) {
			return;
		}
		visible = trimPolylineToLength(points, drawn);
	} else if (phase === "out") {
		// Erase from circle toward digits: skip grows, tail near digits shrinks away.
		visible = trimPolylineRange(points, cap * u, cap);
	} else {
		return;
	}

	if (visible.length < 2) {
		return;
	}

	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.shadowBlur = 0;
	ctx.setLineDash([3, 4]);
	ctx.strokeStyle = getArcLineStrokeStyle(color, caseStudyStageRailConfig.linkAlpha);
	ctx.lineWidth = resolveRailTrackW();
	ctx.beginPath();
	ctx.moveTo(visible[0].x, visible[0].y);
	for (let i = 1; i < visible.length; i += 1) {
		ctx.lineTo(visible[i].x, visible[i].y);
	}
	ctx.stroke();
	ctx.restore();
}

/**
 * Node highlight: past = calm; near glow head = ring takes the line's energy.
 * @param {number} index
 * @param {number} activeFloat
 * @param {number} cy
 * @param {number} yActive
 * @param {number} clear
 */
function nodeHighlight(index, activeFloat, cy, yActive, clear) {
	const capture = nodeGlowCapture(cy, yActive, clear);
	const past = index < activeFloat - 0.02 ? caseStudyStageRailConfig.nodePastAlpha : 0;
	// Peak when the traveling glow sits on this circle (arc node behavior).
	return Math.max(past, capture);
}

/**
 * Stage index left of a rail node («01», «02»…).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} label
 * @param {number} xRight — right edge of glyphs (toward the circle)
 * @param {number} cy
 * @param {number} highlight 0…1
 * @param {typeof CASE_STUDY_CANVAS_THEME} theme
 */
function drawStageIndexLabel(ctx, label, xRight, cy, highlight, theme) {
	const h = Math.max(0, Math.min(1, highlight));
	ctx.save();
	ctx.font = `500 ${INDEX_FONT_SIZE}px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	ctx.shadowBlur = 0;
	// Future stages stay dim; past / active pick up cyan with the node.
	if (h < 0.08) {
		ctx.fillStyle = theme.textDim;
		ctx.globalAlpha = 0.55;
	} else {
		ctx.fillStyle = theme.cyan;
		ctx.globalAlpha = 0.4 + h * 0.6;
	}
	ctx.fillText(label, xRight, cy);
	ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — left of rail
 * @param {number} headerTop — top of pinned case header block
 * @param {{
 *   states: Array<{ id: string }>,
 *   activeStateId: string,
 *   activeStateIndex?: number,
 *   stageProgress?: number,
 *   activeFloat?: number,
 *   chapterBase?: number,
 *   categoryFontSize?: number,
 *   headerTextX?: number,
 *   viewportH?: number,
 * }} data
 * @param {object[]} [hitRegions]
 * @returns {number} height span of rail
 */
export function drawCaseStudyStageRail(ctx, x, headerTop, data, hitRegions = null) {
	const states = data?.states ?? [];
	if (states.length === 0) {
		return 0;
	}

	const theme = CASE_STUDY_CANVAS_THEME;
	const viewportH = Math.max(1, data.viewportH ?? 900);
	const spineX = x + SPINE_X;
	const activeIndex = Number.isFinite(data.activeStateIndex)
		? data.activeStateIndex
		: Math.max(0, states.findIndex((state) => state.id === data.activeStateId));
	const activeFloat = Number.isFinite(data.activeFloat)
		? data.activeFloat
		: resolveCaseStudyStageRailFloat(activeIndex, states.length);
	const headerY = resolveStageRailHeaderAnchorY(headerTop, data.categoryFontSize ?? 13);
	const headerTextX = Number.isFinite(data.headerTextX) ? data.headerTextX : null;
	const radii = resolveRailNodeRadii();
	const trackW = resolveRailTrackW();
	const clear = radii.outer + trackW * 0.5 + 1.5;

	const { gap, span } = resolveStageSpacing(states.length, viewportH);
	const y0 = (viewportH - span) * 0.5;
	const centers = states.map((_, index) => y0 + index * gap);
	const yActive = resolveActiveY(centers, activeFloat);

	ctx.save();

	// Dim future dashes — cut at rings.
	for (let index = 0; index < centers.length - 1; index += 1) {
		strokeFutureSegment(
			ctx,
			spineX,
			centers[index],
			centers[index + 1],
			clear,
			yActive,
			SEGMENT_DASHES[index % SEGMENT_DASHES.length],
		);
	}

	// Bright progress on open track only; on a node → ring light (no travel neon slug).
	strokeProgressClipped(ctx, spineX, centers, clear, yActive);

	const chapterBase = Number.isFinite(data.chapterBase) ? data.chapterBase : 0;
	const indexRightX = spineX - radii.outer - INDEX_GAP_PX;
	const hitGap = Math.max(BASE_ITEM_GAP, gap);
	for (let index = 0; index < states.length; index += 1) {
		const state = states[index];
		const cy = centers[index];
		const highlight = nodeHighlight(index, activeFloat, cy, yActive, clear);
		drawArcStyleNode(ctx, spineX, cy, radii, highlight);
		drawStageIndexLabel(
			ctx,
			String(index + chapterBase).padStart(2, "0"),
			indexRightX,
			cy,
			highlight,
			theme,
		);

		if (hitRegions) {
			hitRegions.push({
				type: "stage",
				id: `stage:${state.id}`,
				stateId: state.id,
				x: x - 4,
				y: cy - hitGap / 2,
				w: RAIL_WIDTH + 12,
				h: hitGap,
				r: 0,
			});
		}
	}

	if (headerTextX != null) {
		syncCaseStudyStageRailHeaderLinkAnchor(activeIndex);
		const linkVisual = getCaseStudyStageRailHeaderLinkVisual();
		const anchor = Math.max(0, Math.min(centers.length - 1, linkVisual.anchorIndex));
		const linkY = centers[anchor] ?? yActive;
		strokeHeaderLink(
			ctx,
			spineX + radii.outer + 2,
			linkY,
			headerTextX - 2,
			headerY,
			theme.cyan,
			anchor,
			linkVisual.phase,
			linkVisual.t,
			linkVisual.pathCap,
		);
	}

	ctx.restore();
	return measureCaseStudyStageRailHeight(states.length, viewportH);
}

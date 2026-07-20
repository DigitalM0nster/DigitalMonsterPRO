import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { store, useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { getNavItemLabel, getNavPortfolioCasesMarker } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { requestHexNavigation, getHexPendingPath } from "@/utils/hexNavigation.js";
import { isPortfolioCasePath, projectsData } from "@/three/scenes/portfolio/hub/projectsData.js";
import { playRightNavigatorGlitchSound } from "@/sounds/soundDesign.js";
import LeftMenuGlitchLabel from "../leftMenu/LeftMenuGlitchLabel.jsx";
import { MENU_LABEL_APPEAR_MS, MENU_LABEL_DISAPPEAR_MS } from "../leftMenu/leftMenuLabelTimings.js";
import { resolveAboutNavigatorProgress } from "./aboutNavigatorPhase.js";
import "./ScrollPageNavigator.scss";

const MAIN_ITEMS = [
	{ id: "home", navId: "main", path: "/", icon: "/images/custom_icons/home.svg" },
	{ id: "portfolioHub", navId: "portfolio", path: "/portfolio", icon: "/images/custom_icons/portfolio.svg" },
	{ id: "about", navId: "about", path: "/about", icon: "/images/custom_icons/about.svg" },
	{ id: "contacts", navId: "contacts", path: "/contacts", icon: "/images/custom_icons/connect.svg" },
];

const VISIBLE_CYCLE_RANGE = 2;
const NAVIGATOR_WIDTH = 236;
const LINE_X = 166;
const NAVIGATOR_CURSOR_SOURCE = "scrollPageNavigator";
/** Must match `.scrollPageNavigator.hidden` transition duration. */
const NAVIGATOR_EXIT_MS = 420;

function setNavigatorCursorAnchor(itemKey, circle) {
	if (!circle) {
		return;
	}

	const rect = circle.getBoundingClientRect();
	const anchorKey = `${NAVIGATOR_CURSOR_SOURCE}:${itemKey}`;
	if (store.cursor.menuAnchorKey !== anchorKey) {
		store.cursor.menuAnchorKey = anchorKey;
		store.cursor.menuAnchorRevision += 1;
	}

	store.cursor.menuAnchorActive = true;
	store.cursor.menuAnchorX = rect.left + rect.width / 2;
	store.cursor.menuAnchorY = rect.top + rect.height / 2;
	store.cursor.menuAnchorDiameter = Math.max(rect.width, rect.height);
	store.cursor.menuAnchorSource = NAVIGATOR_CURSOR_SOURCE;
	store.cursor.hovered = true;
}

function clearNavigatorCursorAnchor(itemKey = null) {
	if (store.cursor.menuAnchorSource !== NAVIGATOR_CURSOR_SOURCE) {
		return;
	}
	if (itemKey && store.cursor.menuAnchorKey !== `${NAVIGATOR_CURSOR_SOURCE}:${itemKey}`) {
		return;
	}

	store.cursor.menuAnchorActive = false;
	store.cursor.menuAnchorDiameter = 0;
	store.cursor.menuAnchorSource = null;
	store.cursor.menuAnchorKey = null;
	store.cursor.hovered = false;
}

function useDampedValue(target, smooth = 0.16) {
	const [value, setValue] = useState(target);
	const valueRef = useRef(target);

	useEffect(() => {
		let frameId = 0;
		let lastTime = performance.now();

		const tick = (now) => {
			const delta = Math.min(0.05, (now - lastTime) / 1000);
			lastTime = now;
			const factor = 1 - Math.exp(-smooth * 60 * delta);
			let current = valueRef.current;
			current += (target - current) * factor;

			if (Math.abs(current - target) < 0.001) {
				current = target;
				valueRef.current = current;
				setValue(current);
				frameId = 0;
				return;
			}

			valueRef.current = current;
			setValue(current);
			frameId = requestAnimationFrame(tick);
		};

		frameId = requestAnimationFrame(tick);
		return () => {
			if (frameId) {
				cancelAnimationFrame(frameId);
			}
		};
	}, [target, smooth]);

	return value;
}


function normalizePath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
}

function shortestLoopDistance(index, currentIndex, total) {
	let diff = index - currentIndex;
	if (diff > total / 2) {
		diff -= total;
	} else if (diff < -total / 2) {
		diff += total;
	}
	return diff;
}

function smoothstep01(value) {
	const x = Math.max(0, Math.min(1, value));
	return x * x * (3 - 2 * x);
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function pointOnCircle(cx, cy, radius, angle) {
	const radians = (angle * Math.PI) / 180;
	return {
		x: cx + radius * Math.cos(radians),
		y: cy + radius * Math.sin(radians),
	};
}

function describeCircleArc(cx, cy, radius, startAngle, endAngle, sweepFlag) {
	const start = pointOnCircle(cx, cy, radius, startAngle);
	const end = pointOnCircle(cx, cy, radius, endAngle);
	const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

	return [`M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`, `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`].join(" ");
}

function resolveCircleEntryAngle(circleY, centerY, direction) {
	const delta = circleY - centerY;

	if (Math.abs(delta) < 0.5) {
		return direction === "down" ? 90 : -90;
	}

	return delta < 0 ? 90 : -90;
}

function resolveCircleGlow(relative) {
	const distance = Math.abs(relative);
	const strength = smoothstep01(1 - Math.min(distance / 1.18, 1));
	return {
		strength: strength.toFixed(3),
	};
}

function resolveNavigatorCircleOpacity(relative) {
	const distance = Math.abs(relative);
	return smoothstep01(1 - Math.max(0, distance - 0.55) / 1.7).toFixed(3);
}

/**
 * Label snake / `.center` chrome follow the committed carousel route, not the
 * visual approach band. Neighbors can sit in |relative| < 0.42 (and light their
 * SVG ring) while still `previous`/`next` — text must wait until `currentId`
 * flips at commit, when that stop's ring is fully lit.
 */
function resolveItemInstances(currentId, progress) {
	const total = MAIN_ITEMS.length;
	const currentIndex = Math.max(
		0,
		MAIN_ITEMS.findIndex((item) => item.id === currentId),
	);
	const instances = [];

	MAIN_ITEMS.forEach((item, itemIndex) => {
		const baseDistance = shortestLoopDistance(itemIndex, currentIndex, total);
		for (let cycle = -VISIBLE_CYCLE_RANGE; cycle <= VISIBLE_CYCLE_RANGE; cycle += 1) {
			const relative = baseDistance + cycle * total - progress;
			if (relative < -2.25 || relative > 2.25) {
				continue;
			}
			instances.push({
				...item,
				key: `${item.id}:${cycle}`,
				relative,
				isRouteLabelActive: item.id === currentId,
				isClipped: Math.abs(relative) > 1.65,
			});
		}
	});

	return instances.sort((a, b) => a.relative - b.relative);
}


function PortfolioNestedMarker({ labelRef, active, isDisplayed, label }) {
	return (
		<div className="scrollPageNavigatorPortfolioMarker" aria-hidden="true">
			<span className="scrollPageNavigatorPortfolioText">
				<LeftMenuGlitchLabel
					ref={labelRef}
					text={label}
					active={active}
					isDisplayed={isDisplayed}
					reverse
				/>
			</span>
		</div>
	);
}


function ScrollNavigatorItem({
	item,
	itemGapPx,
	label,
	portfolioCasesLabel,
	onNavigate,
	clickPhase,
	clickTargetId,
}) {
	const labelRef = useRef(null);
	const portfolioMarkerLabelRef = useRef(null);
	const circleRef = useRef(null);
	const hoveredRef = useRef(false);
	const activeRef = useRef(false);
	const clickPinnedRef = useRef(false);
	const clickTransitionSeenRef = useRef(false);
	const mountedRef = useRef(false);
	const renderedLabelRef = useRef(null);
	const disappearTimerRef = useRef(0);
	const [isHovered, setIsHovered] = useState(false);
	const [isClickPinned, setIsClickPinned] = useState(false);
	/** Keep true through disappear snake — same as left menu disappearingIndices. */
	const [isLabelDisplayed, setIsLabelDisplayed] = useState(false);
	const isPortfolio = item.id === "portfolioHub";
	const showPortfolioMarker = isPortfolio && !item.isClipped;
	const isActive = item.isRouteLabelActive === true;
	const isItemClickTarget = clickPhase !== "idle" && clickTargetId === item.id;
	const circleGlow = resolveCircleGlow(item.relative);
	const circleOpacity = resolveNavigatorCircleOpacity(item.relative);

	const clearDisappearTimer = useCallback(() => {
		if (disappearTimerRef.current) {
			clearTimeout(disappearTimerRef.current);
			disappearTimerRef.current = 0;
		}
	}, []);

	const playLabelSnake = useCallback((mode) => {
		/**
		 * Hover: same as hub project-list `runHover()` — engine defaults 75/50 + 3 symbols.
		 * Do not use hero locale options (40/40): that wave looks nearly sequential on short labels.
		 */
		const options =
			mode === "hover"
				? { playSound: false }
				: {
						timeBudgetMs: mode === "disappear" ? MENU_LABEL_DISAPPEAR_MS : MENU_LABEL_APPEAR_MS,
						playSound: false,
					};
		const playOnLabel = (targetRef) =>
			mode === "hover"
				? (targetRef.current?.playHover?.(options) ?? 0)
				: mode === "appear"
					? (targetRef.current?.playAppear?.(options) ?? 0)
					: (targetRef.current?.playDisappear?.(options) ?? 0);
		const durationMs = Math.max(playOnLabel(labelRef), playOnLabel(portfolioMarkerLabelRef));
		playRightNavigatorGlitchSound(durationMs);
		return durationMs;
	}, []);

	const showLabel = useCallback(() => {
		clearDisappearTimer();
		setIsLabelDisplayed(true);
	}, [clearDisappearTimer]);

	const hideLabelAnimated = useCallback(() => {
		clearDisappearTimer();
		setIsLabelDisplayed(true);
		const durationMs = playLabelSnake("disappear");
		disappearTimerRef.current = window.setTimeout(() => {
			disappearTimerRef.current = 0;
			labelRef.current?.cancelAndHide?.();
			portfolioMarkerLabelRef.current?.cancelAndHide?.();
			setIsLabelDisplayed(false);
		}, Math.max(MENU_LABEL_DISAPPEAR_MS, durationMs));
	}, [clearDisappearTimer, playLabelSnake]);

	useEffect(() => {
		const wasActive = activeRef.current;
		const wasMounted = mountedRef.current;
		const labelChanged = mountedRef.current && renderedLabelRef.current !== label;
		activeRef.current = isActive;
		renderedLabelRef.current = label;
		mountedRef.current = true;

		if (isActive && (!wasMounted || labelChanged)) {
			showLabel();
			playLabelSnake("appear");
		} else if (isActive && !wasActive) {
			showLabel();
			// Hover already ran appear — click/activation must not hide+replay the snake.
			if (!hoveredRef.current) {
				playLabelSnake("appear");
			}
		} else if (!isActive && wasActive && !hoveredRef.current) {
			hideLabelAnimated();
		}
	}, [hideLabelAnimated, isActive, label, playLabelSnake, showLabel]);

	useEffect(() => () => clearDisappearTimer(), [clearDisappearTimer]);

	const handlePointerEnter = useCallback(() => {
		hoveredRef.current = true;
		setIsHovered(true);
		showLabel();
		setNavigatorCursorAnchor(item.key, circleRef.current);
		playLabelSnake(activeRef.current ? "hover" : "appear");
	}, [item.key, playLabelSnake, showLabel]);

	const handlePointerLeave = useCallback(() => {
		hoveredRef.current = false;
		setIsHovered(false);
		if (!clickPinnedRef.current) {
			clearNavigatorCursorAnchor(item.key);
		}
		if (!activeRef.current) {
			hideLabelAnimated();
		}
	}, [hideLabelAnimated, item.key]);

	const handleClick = useCallback(() => {
		const navigationStarted = onNavigate(item.path);
		if (navigationStarted === false) {
			return;
		}

		clickPinnedRef.current = true;
		clickTransitionSeenRef.current = isItemClickTarget;
		setIsClickPinned(true);
		setNavigatorCursorAnchor(item.key, circleRef.current);
	}, [isItemClickTarget, item.key, item.path, onNavigate]);

	useEffect(() => {
		if (!isClickPinned) {
			return;
		}
		if (isItemClickTarget) {
			clickTransitionSeenRef.current = true;
			return;
		}
		if (!clickTransitionSeenRef.current) {
			return;
		}

		clickPinnedRef.current = false;
		clickTransitionSeenRef.current = false;
		setIsClickPinned(false);
		if (!hoveredRef.current) {
			clearNavigatorCursorAnchor(item.key);
		}
	}, [isClickPinned, isItemClickTarget, item.key]);

	useLayoutEffect(() => {
		const anchorKey = `${NAVIGATOR_CURSOR_SOURCE}:${item.key}`;
		const pinnedAnchorStillOwned = isClickPinned && store.cursor.menuAnchorSource === NAVIGATOR_CURSOR_SOURCE && store.cursor.menuAnchorKey === anchorKey;
		if (isHovered || pinnedAnchorStillOwned) {
			setNavigatorCursorAnchor(item.key, circleRef.current);
		}
	}, [isClickPinned, isHovered, item.key, item.relative, itemGapPx]);

	useEffect(() => () => clearNavigatorCursorAnchor(item.key), [item.key]);

	return (
		<div
			role="button"
			className={["scrollPageNavigatorItem", isActive && "center", item.isClipped && "clipped", showPortfolioMarker && "hasPortfolioMarker"].filter(Boolean).join(" ")}
			style={{
				"--navigator-y": `${item.relative * itemGapPx}px`,
				"--circle-glow": circleGlow.strength,
				"--navigator-circle-opacity": circleOpacity,
			}}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onClick={handleClick}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					handleClick();
				}
			}}
			aria-label={label}
			tabIndex={isActive ? 0 : -1}
		>
			<span className="scrollPageNavigatorLabel">
				{/* No key={label}: remounting every locale rebuilds all glitch trees and hitchs home. */}
				<LeftMenuGlitchLabel
					ref={labelRef}
					text={label}
					active={isActive || isHovered}
					isDisplayed={isLabelDisplayed}
					reverse
				/>
			</span>
			<span ref={circleRef} className="scrollPageNavigatorCircle">
				<span
					className="scrollPageNavigatorCircleIcon"
					style={{ "--navigator-icon-mask": `url("${item.icon}")` }}
					aria-hidden="true"
				/>
			</span>
			{showPortfolioMarker && (
				<PortfolioNestedMarker
					labelRef={portfolioMarkerLabelRef}
					active={isActive || isHovered}
					isDisplayed={isLabelDisplayed}
					label={portfolioCasesLabel}
				/>
			)}
		</div>
	);
}

function ScrollNavigatorLine({
	instances,
	itemGapPx,
	viewportHeight,
	directionValue,
}) {
	const svgId = useId().replace(/:/g, "");
	const maskId = `${svgId}-mask`;
	const gradientId = `${svgId}-gradient`;
	const circleRadius = 22.5;
	const mainHoles = instances
		.map((item) => {
			const y = viewportHeight / 2 + item.relative * itemGapPx;
			if (y < -90 || y > viewportHeight + 90) {
				return null;
			}
			return {
				key: item.key,
				id: item.id,
				relative: item.relative,
				x: LINE_X,
				y,
				r: circleRadius,
			};
		})
		.filter(Boolean);
	const holes = mainHoles;
	const snakeStrength = holes.reduce((max, hole) => {
		const distance = Math.abs(hole.y - viewportHeight / 2);
		return Math.max(max, smoothstep01(1 - Math.min(distance / (itemGapPx * 0.52), 1)));
	}, 0);
	const snakeLength = 174 - snakeStrength * 104;
	const snakeY1 = viewportHeight / 2 - snakeLength / 2;
	const snakeY2 = viewportHeight / 2 + snakeLength / 2;
	const snakeBloomWidth = 7 + snakeStrength * 4;
	const snakeCoreWidth = 1.2 + snakeStrength * 1.5;
	const snakeOpacity = 0.4 + snakeStrength * 0.28;
	const snakeBrightnessScale = 1;
	const snakeHead = 18 + ((directionValue + 1) / 2) * 64;
	const snakeHeadOffset = `${snakeHead.toFixed(2)}%`;
	const snakeHeadPrevOffset = `${Math.max(0, snakeHead - 10).toFixed(2)}%`;
	const snakeHeadNextOffset = `${Math.min(100, snakeHead + 10).toFixed(2)}%`;
	const direction = directionValue >= 0 ? "down" : "up";
	const centerY = viewportHeight / 2;
	const activeCircleGlow = mainHoles
		.map((hole) => {
			const distance = Math.abs(hole.y - centerY);
			const baseStrength = smoothstep01(1 - Math.min(distance / (itemGapPx * 0.22), 1));
			const strength = hole.id === "about" ? clamp01(baseStrength * 2) : baseStrength;
			if (strength < 0.01) {
				return null;
			}
			const entryAngle = resolveCircleEntryAngle(hole.y, centerY, direction);
			const tailPair = smoothstep01((strength - 0.92) / 0.08);
			const tailOpacity = 0.08 + strength * 0.46;
			const entryTailOpacity = tailOpacity * strength;
			const pairedTailOpacity = tailOpacity * tailPair;
			const normalTailLength = 30 + strength * 28;
			return {
				key: `${hole.key}:active-ring`,
				tailGradientId: `${gradientId}-circle-tail-${hole.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
				x: hole.x,
				y: hole.y,
				strength,
				entryAngle,
				spread: Math.min(179, 16 + strength * 163),
				topTailLength: hole.id === "contacts" ? Math.min(18, normalTailLength) : normalTailLength,
				bottomTailLength: normalTailLength,
				topTailBrightness: hole.id === "contacts" ? 0.62 : 1,
				topTailOpacity: entryAngle === -90 ? Math.max(entryTailOpacity, pairedTailOpacity) : pairedTailOpacity,
				bottomTailOpacity: entryAngle === 90 ? Math.max(entryTailOpacity, pairedTailOpacity) : pairedTailOpacity,
			};
		})
		.filter(Boolean);
	return (
		<svg className="scrollPageNavigatorLine" viewBox={`0 0 ${NAVIGATOR_WIDTH} ${viewportHeight}`} preserveAspectRatio="none" aria-hidden="true">
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={viewportHeight} gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="var(--mainColor)" stopOpacity="0.2" />
					<stop offset="18%" stopColor="var(--mainColor)" stopOpacity="0.2" />
					<stop offset="50%" stopColor="var(--mainColor)" stopOpacity="0.2" />
					<stop offset="82%" stopColor="var(--mainColor)" stopOpacity="0.2" />
					<stop offset="100%" stopColor="var(--mainColor)" stopOpacity="0.2" />
				</linearGradient>
				<linearGradient id={`${gradientId}-snake`} x1="0" y1={snakeY1} x2="0" y2={snakeY2} gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="var(--mainColor)" stopOpacity="0" />
					<stop offset={snakeHeadPrevOffset} stopColor="var(--mainColor)" stopOpacity={(0.12 + snakeStrength * 0.12) * snakeBrightnessScale} />
					<stop offset={snakeHeadOffset} stopColor="white" stopOpacity={(0.46 + snakeStrength * 0.46) * snakeBrightnessScale} />
					<stop offset={snakeHeadNextOffset} stopColor="var(--mainColor)" stopOpacity={(0.18 + snakeStrength * 0.22) * snakeBrightnessScale} />
					<stop offset="100%" stopColor="var(--mainColor)" stopOpacity="0" />
				</linearGradient>
				{activeCircleGlow.map((glow) => (
					<linearGradient
						key={`${glow.key}:tail-top`}
						id={`${glow.tailGradientId}-top`}
						x1="0"
						y1={glow.y - circleRadius - glow.topTailLength}
						x2="0"
						y2={glow.y - circleRadius}
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0%" stopColor="var(--mainColor)" stopOpacity="0" />
						<stop offset="24%" stopColor="var(--mainColor)" stopOpacity="0" />
						<stop offset="68%" stopColor="var(--mainColor)" stopOpacity={(0.08 + glow.strength * 0.18) * glow.topTailBrightness} />
						<stop offset="100%" stopColor="var(--mainColor)" stopOpacity={(0.16 + glow.strength * 0.22) * glow.topTailBrightness} />
					</linearGradient>
				))}
				{activeCircleGlow.map((glow) => (
					<linearGradient
						key={`${glow.key}:tail-bottom`}
						id={`${glow.tailGradientId}-bottom`}
						x1="0"
						y1={glow.y + circleRadius}
						x2="0"
						y2={glow.y + circleRadius + glow.bottomTailLength}
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0%" stopColor="var(--mainColor)" stopOpacity={0.16 + glow.strength * 0.22} />
						<stop offset="36%" stopColor="var(--mainColor)" stopOpacity={0.08 + glow.strength * 0.18} />
						<stop offset="100%" stopColor="var(--mainColor)" stopOpacity="0" />
					</linearGradient>
				))}
				<mask id={maskId} maskUnits="userSpaceOnUse">
					<rect x="0" y="0" width={NAVIGATOR_WIDTH} height={viewportHeight} fill="white" />
					{holes.map((hole) => (
						<circle key={hole.key} cx={hole.x} cy={hole.y} r={hole.r} fill="black" />
					))}
				</mask>
			</defs>
			<line className="scrollPageNavigatorLineAmbient" x1={LINE_X} y1="-80" x2={LINE_X} y2={viewportHeight + 80} stroke={`url(#${gradientId})`} mask={`url(#${maskId})`} />
			<line
				className="scrollPageNavigatorSnakeBloom"
				x1={LINE_X}
				y1={snakeY1}
				x2={LINE_X}
				y2={snakeY2}
				stroke={`url(#${gradientId}-snake)`}
				strokeWidth={snakeBloomWidth}
				opacity={snakeOpacity}
				mask={`url(#${maskId})`}
			/>
			<line
				className="scrollPageNavigatorSnakeCore"
				x1={LINE_X}
				y1={snakeY1}
				x2={LINE_X}
				y2={snakeY2}
				stroke={`url(#${gradientId}-snake)`}
				strokeWidth={snakeCoreWidth}
				opacity={Math.min(1, snakeOpacity + 0.18)}
				mask={`url(#${maskId})`}
			/>
			{activeCircleGlow.map((glow) => (
				<g key={`${glow.key}:tails`} className="scrollPageNavigatorCircleTail" mask={`url(#${maskId})`}>
					<line
						x1={glow.x}
						y1={glow.y - circleRadius - glow.topTailLength}
						x2={glow.x}
						y2={glow.y - circleRadius - 0.4}
						stroke={`url(#${glow.tailGradientId}-top)`}
						strokeWidth={0.9 + glow.strength * 1.15}
						opacity={glow.topTailOpacity}
					/>
					<line
						x1={glow.x}
						y1={glow.y + circleRadius + 0.4}
						x2={glow.x}
						y2={glow.y + circleRadius + glow.bottomTailLength}
						stroke={`url(#${glow.tailGradientId}-bottom)`}
						strokeWidth={0.9 + glow.strength * 1.15}
						opacity={glow.bottomTailOpacity}
					/>
				</g>
			))}
			{activeCircleGlow.map((glow) => (
				<g key={glow.key} className="scrollPageNavigatorSnakeRing" opacity={0.16 + glow.strength * 0.78}>
					<path d={describeCircleArc(glow.x, glow.y, circleRadius, glow.entryAngle, glow.entryAngle + glow.spread, 1)} strokeWidth={0.9 + glow.strength * 1.35} />
					<path d={describeCircleArc(glow.x, glow.y, circleRadius, glow.entryAngle, glow.entryAngle - glow.spread, 0)} strokeWidth={0.9 + glow.strength * 1.35} />
				</g>
			))}
			<line
				className="scrollPageNavigatorLineCore"
				x1={LINE_X}
				y1="-80"
				x2={LINE_X}
				y2={viewportHeight + 80}
				stroke={`url(#${gradientId})`}
				strokeWidth={1}
				mask={`url(#${maskId})`}
			/>
		</svg>
	);
}

function ScrollPageNavigatorContent() {
	const proxyStore = useStore();
	const location = useLocation();
	const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 940));
	const currentId = proxyStore.sceneCarouselCurrentId ?? "home";
	const rawProgress = Number.isFinite(proxyStore.sceneCarouselProgress) ? proxyStore.sceneCarouselProgress : 0;
	const rawProgressTarget = Number.isFinite(proxyStore.sceneCarouselProgressTarget) ? proxyStore.sceneCarouselProgressTarget : rawProgress;
	const clickPhase = proxyStore.sceneCarouselClickPhase ?? "idle";
	const clickTargetId = proxyStore.sceneCarouselClickTargetId ?? null;
	const clickTargetIndex = MAIN_ITEMS.findIndex((item) => item.id === clickTargetId);
	const currentIndex = MAIN_ITEMS.findIndex((item) => item.id === currentId);
	const isDirectClickTravel = (clickPhase === "enter" || clickPhase === "awaitingRoute") && clickTargetIndex >= 0 && currentIndex >= 0;
	const clickDistance = isDirectClickTravel ? shortestLoopDistance(clickTargetIndex, currentIndex, MAIN_ITEMS.length) : 1;
	const progress = rawProgress * clickDistance;
	const progressTarget = rawProgressTarget * clickDistance;
	const aboutActive = proxyStore.aboutExperience.active === true;
	const aboutStoryProgress = Number.isFinite(proxyStore.aboutExperience.storyProgress) ? proxyStore.aboutExperience.storyProgress : 0;
	const aboutStoryProgressTarget = Number.isFinite(proxyStore.aboutExperience.storyProgressTarget)
		? proxyStore.aboutExperience.storyProgressTarget
		: aboutStoryProgress;

	const isAboutClickRoutePhase = clickPhase !== "idle" && clickTargetId === "about";
	const isDirectAboutEntry = isDirectClickTravel && clickTargetId === "about" && currentId !== "about";
	const isEnteringAboutForward =
		isDirectAboutEntry || (currentId === "portfolioHub" && (rawProgress > 0.001 || rawProgressTarget > 0.001) && !isDirectClickTravel);
	const isEnteringAboutFromContacts =
		currentId === "contacts" && (rawProgress < -0.001 || rawProgressTarget < -0.001) && !isDirectClickTravel;
	const directAboutEntryRef = useRef(false);
	if (isAboutClickRoutePhase) {
		directAboutEntryRef.current = true;
	} else if (currentId !== "about") {
		directAboutEntryRef.current = false;
	}
	const preserveDirectAboutEntry = currentId === "about" && directAboutEntryRef.current;
	const isSettlingIntoAboutForward =
		currentId === "about" &&
		(proxyStore.sceneCarouselLastCommitDirection === "forward" || (preserveDirectAboutEntry && !aboutActive));
	const isSettlingIntoAboutFromContacts =
		currentId === "about" &&
		!preserveDirectAboutEntry &&
		((proxyStore.sceneCarouselLastCommitFromId === "contacts" && proxyStore.sceneCarouselLastCommitDirection === "backward") ||
			(!aboutActive && rawProgress > 0.001 && rawProgressTarget <= 0.001));
	const forwardAboutEntryRef = useRef(false);
	if (isEnteringAboutForward || isSettlingIntoAboutForward) {
		forwardAboutEntryRef.current = true;
	} else if (currentId !== "about") {
		forwardAboutEntryRef.current = false;
	}
	const preserveForwardAboutEntry = currentId === "about" && forwardAboutEntryRef.current;
	const reverseAboutEntryRef = useRef(false);
	if (isEnteringAboutFromContacts || isSettlingIntoAboutFromContacts) {
		reverseAboutEntryRef.current = true;
	} else if (currentId !== "about") {
		reverseAboutEntryRef.current = false;
	}
	const preserveReverseAboutEntry = currentId === "about" && reverseAboutEntryRef.current;

	const { navigatorProgress } = resolveAboutNavigatorProgress({
		currentId,
		rawProgress,
		progress,
		aboutActive,
		storyProgress: aboutStoryProgress,
		isDirectClickTravel,
		clickTargetId,
		clickDistance,
		preserveForwardEntry: preserveForwardAboutEntry,
		preserveReverseEntry: preserveReverseAboutEntry,
	});

	const lastDirectionRef = useRef("down");
	if (isDirectClickTravel && Math.abs(clickDistance) > 0.001) {
		lastDirectionRef.current = clickDistance > 0 ? "down" : "up";
	} else if (currentId === "about" && aboutActive && Math.abs(aboutStoryProgressTarget - aboutStoryProgress) > 0.001) {
		lastDirectionRef.current = aboutStoryProgressTarget > aboutStoryProgress ? "down" : "up";
	} else if (progressTarget > progress + 0.001) {
		lastDirectionRef.current = "down";
	} else if (progressTarget < progress - 0.001) {
		lastDirectionRef.current = "up";
	}
	const scrollDirection = lastDirectionRef.current;
	const directionTarget = scrollDirection === "down" ? 1 : -1;
	const directionValue = useDampedValue(directionTarget, 0.12);
	const siteLocale = normalizeSiteLocale(proxyStore.siteLocale);
	const portfolioCasesLabel = getNavPortfolioCasesMarker(projectsData.length, siteLocale);
	const instances = useMemo(() => resolveItemInstances(currentId, navigatorProgress), [currentId, navigatorProgress]);
	const itemGapPx = Math.min(230, Math.max(172, viewportHeight * 0.245));

	useEffect(() => {
		const onResize = () => setViewportHeight(window.innerHeight);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(
		() => () => {
			clearNavigatorCursorAnchor();
		},
		[],
	);

	const handleNavigate = useCallback(
		(path) => {
			const from = normalizePath(location.pathname);
			if (normalizePath(path) === from) {
				return false;
			}
			return requestHexNavigation(path, from);
		},
		[location.pathname],
	);

	return (
		<>
			<div className="scrollPageNavigatorMasked">
				<ScrollNavigatorLine
					instances={instances}
					itemGapPx={itemGapPx}
					viewportHeight={viewportHeight}
					directionValue={directionValue}
				/>
			</div>
			<div className="scrollPageNavigatorItems">
				{instances.map((item) => (
					<ScrollNavigatorItem
						key={item.key}
						item={item}
						itemGapPx={itemGapPx}
						label={getNavItemLabel(item.navId, siteLocale)}
						portfolioCasesLabel={portfolioCasesLabel}
						onNavigate={handleNavigate}
						clickPhase={clickPhase}
						clickTargetId={clickTargetId}
					/>
				))}
			</div>
		</>
	);
}

function resolveNavigatorShouldHide(pathname) {
	const page = normalizePath(pathname);
	return isPortfolioCasePath(page) || page.startsWith("/demo");
}

export default function ScrollPageNavigator() {
	const location = useLocation();
	const { displayPathname } = useRouteTransitionContext();
	const proxyStore = useStore();
	// Hide on click intent / browser URL immediately — don't wait for hex displayPath.
	const shouldHide =
		resolveNavigatorShouldHide(displayPathname) ||
		resolveNavigatorShouldHide(location.pathname) ||
		resolveNavigatorShouldHide(proxyStore.sceneCarouselNavigatePath) ||
		(proxyStore.sceneCarouselClickTransitionActive === true && resolveNavigatorShouldHide(getHexPendingPath()));
	const [contentMounted, setContentMounted] = useState(() => !shouldHide);
	const [visuallyHidden, setVisuallyHidden] = useState(() => shouldHide);

	useEffect(() => {
		if (shouldHide) {
			setVisuallyHidden(true);
			clearNavigatorCursorAnchor();
			const timer = window.setTimeout(() => {
				setContentMounted(false);
			}, NAVIGATOR_EXIT_MS);
			return () => window.clearTimeout(timer);
		}

		setContentMounted(true);
		let revealFrame = 0;
		let settleFrame = 0;
		revealFrame = window.requestAnimationFrame(() => {
			settleFrame = window.requestAnimationFrame(() => {
				setVisuallyHidden(false);
			});
		});
		return () => {
			window.cancelAnimationFrame(revealFrame);
			window.cancelAnimationFrame(settleFrame);
		};
	}, [shouldHide]);

	return (
		<nav
			className={`scrollPageNavigator${visuallyHidden ? " hidden" : ""}`}
			aria-label="Page scroll navigation"
			aria-hidden={visuallyHidden}
			{...(visuallyHidden ? { inert: "" } : {})}
		>
			{contentMounted ? <ScrollPageNavigatorContent /> : null}
		</nav>
	);
}

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { store, useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { getNavItemLabel } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { requestHexNavigation, getHexPendingPath } from "@/utils/hexNavigation.js";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { playRightNavigatorGlitchSound } from "@/sounds/soundDesign.js";
import LeftMenuGlitchLabel from "../leftMenu/LeftMenuGlitchLabel.jsx";
import { MENU_LABEL_APPEAR_MS, MENU_LABEL_DISAPPEAR_MS } from "../leftMenu/leftMenuLabelTimings.js";
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
const ABOUT_SUBITEM_OFFSETS = [0.18, 0.32, 0.46, 0.6];
const NAVIGATOR_CURSOR_SOURCE = "scrollPageNavigator";
const ABOUT_STAGE_CURSOR_HIDE_MS = 320;
/** Must match `.scrollPageNavigator.hidden` transition duration. */
const NAVIGATOR_EXIT_MS = 420;

function resolveAboutTrackOffset(stagePosition) {
	const clamped = Math.max(0, Math.min(ABOUT_SUBITEM_OFFSETS.length - 1, stagePosition));
	const fromIndex = Math.floor(clamped);
	const toIndex = Math.min(ABOUT_SUBITEM_OFFSETS.length - 1, fromIndex + 1);
	const progress = clamped - fromIndex;
	return ABOUT_SUBITEM_OFFSETS[fromIndex] + (ABOUT_SUBITEM_OFFSETS[toIndex] - ABOUT_SUBITEM_OFFSETS[fromIndex]) * progress;
}

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

function useTimedActivation(active, durationMs = 240, activateImmediately = false, initialValue = 0) {
	const [value, setValue] = useState(0);
	const activateImmediatelyRef = useRef(activateImmediately);
	activateImmediatelyRef.current = activateImmediately;

	useEffect(() => {
		if (!active) {
			setValue(0);
			return undefined;
		}
		if (activateImmediatelyRef.current) {
			setValue(1);
			return undefined;
		}

		let frameId = 0;
		const startedAt = performance.now();
		const startValue = clamp01(initialValue);
		setValue(startValue);
		const tick = (now) => {
			const linear = clamp01((now - startedAt) / Math.max(1, durationMs));
			setValue(startValue + (1 - startValue) * smoothstep01(linear));
			if (linear < 1) {
				frameId = requestAnimationFrame(tick);
			}
		};

		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	}, [active, durationMs, initialValue]);

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

function resolveAboutSubitemActivation(index, stagePosition, entryProgress = 1) {
	if (index === 0) {
		return entryProgress;
	}

	return Math.min(entryProgress, smoothstep01(stagePosition - (index - 1)));
}

function resolveAboutSubitemEmphasis(index, stagePosition) {
	const distance = stagePosition - index;
	const focus = smoothstep01(1 - Math.min(Math.abs(distance), 1));
	if (distance < 0) {
		return focus;
	}

	return Math.max(focus, Math.pow(0.58, distance));
}

function resolveSequentialReveal(progress, order, totalSteps = 5) {
	const step = 1 / totalSteps;
	return smoothstep01((progress - order * step) / step);
}

function resolveAboutReverseSequenceOrder(subitemIndex) {
	return subitemIndex < 0 ? ABOUT_SUBITEM_OFFSETS.length : ABOUT_SUBITEM_OFFSETS.length - 1 - subitemIndex;
}

function resolveAboutExitSequenceOrder(subitemIndex) {
	return subitemIndex < 0 ? 0 : subitemIndex + 1;
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
				isCenter: Math.abs(relative) < 0.42,
				isClipped: Math.abs(relative) > 1.65,
			});
		}
	});

	return instances.sort((a, b) => a.relative - b.relative);
}

function resolveAboutSubitemInstances(instances) {
	return instances
		.filter((item) => item.id === "about")
		.flatMap((item) =>
			ABOUT_SUBITEM_OFFSETS.map((offset, index) => ({
				key: `${item.key}:about-subitem:${index}`,
				parentKey: item.key,
				parentRelative: item.relative,
				index,
				relative: item.relative + offset,
			})),
		)
		.filter((item) => item.relative > -2.25 && item.relative < 2.25)
		.sort((a, b) => a.relative - b.relative);
}

function PortfolioNestedMarker({ labelRef, active }) {
	return (
		<div className="scrollPageNavigatorPortfolioMarker" aria-hidden="true">
			<span className="scrollPageNavigatorPortfolioText">
				<LeftMenuGlitchLabel ref={labelRef} text="08 CASES" active={active} isDisplayed reverse />
			</span>
		</div>
	);
}

function AboutStageButton({ item, itemGapPx, numberOpacity, focus, onNavigate }) {
	const labelRef = useRef(null);
	const circleRef = useRef(null);
	const [isHovered, setIsHovered] = useState(false);
	const label = String(item.index + 1).padStart(2, "0");
	const anchorKey = `${item.key}:button`;

	useEffect(() => {
		const timer = window.setTimeout(() => {
			const durationMs =
				labelRef.current?.playAppear?.({
					timeBudgetMs: MENU_LABEL_APPEAR_MS,
					playSound: false,
				}) ?? 0;
			if (item.index === 0) {
				playRightNavigatorGlitchSound(durationMs + ABOUT_SUBITEM_OFFSETS.length * 32);
			}
		}, item.index * 32);
		return () => window.clearTimeout(timer);
	}, [item.index]);

	const handlePointerEnter = useCallback(() => {
		setIsHovered(true);
		setNavigatorCursorAnchor(anchorKey, circleRef.current);
		const durationMs =
			labelRef.current?.playHover?.({
				timeBudgetMs: MENU_LABEL_APPEAR_MS,
				playSound: false,
			}) ?? 0;
		playRightNavigatorGlitchSound(durationMs);
	}, [anchorKey]);

	const handlePointerLeave = useCallback(() => {
		setIsHovered(false);
		clearNavigatorCursorAnchor(anchorKey);
	}, [anchorKey]);

	useLayoutEffect(() => {
		if (isHovered) {
			setNavigatorCursorAnchor(anchorKey, circleRef.current);
		}
	}, [anchorKey, isHovered, item.relative, itemGapPx]);

	useEffect(() => () => clearNavigatorCursorAnchor(anchorKey), [anchorKey]);

	return (
		<button
			type="button"
			className={["scrollPageNavigatorStageButton", focus > 0.001 && "current"].filter(Boolean).join(" ")}
			style={{
				"--navigator-y": `${item.relative * itemGapPx}px`,
				"--navigator-subnumber-opacity": numberOpacity.toFixed(3),
				"--navigator-subnumber-emphasis": focus.toFixed(3),
			}}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onClick={() => onNavigate(item.index)}
			aria-label={`Открыть этап ${label} раздела О нас`}
			aria-current={focus > 0.999 ? "step" : undefined}
		>
			<span className="scrollPageNavigatorStageNumber">
				<LeftMenuGlitchLabel ref={labelRef} text={label} active={focus > 0.001 || isHovered} isDisplayed reverse />
			</span>
			<span ref={circleRef} className="scrollPageNavigatorStageHitCircle" aria-hidden="true" />
		</button>
	);
}

function ScrollNavigatorItem({ item, itemGapPx, label, onNavigate, clickPhase, clickTargetId, forceActive = false, suppressNaturalActive = false }) {
	const labelRef = useRef(null);
	const portfolioMarkerLabelRef = useRef(null);
	const circleRef = useRef(null);
	const hoveredRef = useRef(false);
	const activeRef = useRef(false);
	const clickPinnedRef = useRef(false);
	const clickTransitionSeenRef = useRef(false);
	const mountedRef = useRef(false);
	const renderedLabelRef = useRef(null);
	const [isHovered, setIsHovered] = useState(false);
	const [isClickPinned, setIsClickPinned] = useState(false);
	const isPortfolio = item.id === "portfolioHub";
	const showPortfolioMarker = isPortfolio && !item.isClipped;
	const isActive = forceActive || (item.isCenter && !suppressNaturalActive);
	const isItemClickTarget = clickPhase !== "idle" && clickTargetId === item.id;
	const circleGlow = resolveCircleGlow(item.relative);
	const circleOpacity = resolveNavigatorCircleOpacity(item.relative);
	const playLabelSnake = useCallback((mode) => {
		const options = {
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
	}, []);

	useEffect(() => {
		const wasActive = activeRef.current;
		const wasMounted = mountedRef.current;
		const labelChanged = mountedRef.current && renderedLabelRef.current !== label;
		activeRef.current = isActive;
		renderedLabelRef.current = label;
		mountedRef.current = true;

		if (isActive && (!wasMounted || labelChanged)) {
			playLabelSnake("appear");
		} else if (isActive && !wasActive) {
			playLabelSnake("appear");
		} else if (!isActive && wasActive && !hoveredRef.current) {
			playLabelSnake("disappear");
		}
	}, [isActive, label, playLabelSnake]);

	const handlePointerEnter = useCallback(() => {
		hoveredRef.current = true;
		setIsHovered(true);
		setNavigatorCursorAnchor(item.key, circleRef.current);
		playLabelSnake(activeRef.current ? "hover" : "appear");
	}, [item.key, playLabelSnake]);

	const handlePointerLeave = useCallback(() => {
		hoveredRef.current = false;
		setIsHovered(false);
		if (!clickPinnedRef.current) {
			clearNavigatorCursorAnchor(item.key);
		}
		if (!activeRef.current) {
			playLabelSnake("disappear");
		}
	}, [item.key, playLabelSnake]);

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
		<button
			type="button"
			className={["scrollPageNavigatorItem", isActive && "center", item.isClipped && "clipped", showPortfolioMarker && "hasPortfolioMarker"].filter(Boolean).join(" ")}
			style={{
				"--navigator-y": `${item.relative * itemGapPx}px`,
				"--circle-glow": circleGlow.strength,
				"--navigator-circle-opacity": circleOpacity,
			}}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onClick={handleClick}
			aria-label={label}
			tabIndex={isActive ? 0 : -1}
		>
			<span className="scrollPageNavigatorLabel">
				<LeftMenuGlitchLabel key={label} ref={labelRef} text={label} active={isActive || isHovered} isDisplayed reverse />
			</span>
			<span ref={circleRef} className="scrollPageNavigatorCircle">
				<img src={item.icon} alt="" />
			</span>
			{showPortfolioMarker && <PortfolioNestedMarker labelRef={portfolioMarkerLabelRef} active={isActive || isHovered} />}
		</button>
	);
}

function ScrollNavigatorLine({
	instances,
	subitemInstances,
	itemGapPx,
	viewportHeight,
	directionValue,
	aboutStageActive,
	aboutStagePosition,
	aboutEntryProgress,
	aboutReverseEntry,
	aboutReverseSequenceProgress,
	aboutMainActivation,
	aboutMainExitProgress,
	aboutHandoffProgress,
}) {
	const svgId = useId().replace(/:/g, "");
	const maskId = `${svgId}-mask`;
	const gradientId = `${svgId}-gradient`;
	const circleRadius = 22.5;
	const subitemRadius = 12;
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
	const subitemHoles = subitemInstances
		.map((item) => {
			const y = viewportHeight / 2 + item.relative * itemGapPx;
			if (y < -70 || y > viewportHeight + 70) {
				return null;
			}
			return {
				key: item.key,
				parentKey: item.parentKey,
				index: item.index,
				x: LINE_X,
				y,
				r: subitemRadius,
			};
		})
		.filter(Boolean);
	const holes = [...mainHoles, ...subitemHoles];
	const snakeReferenceHoles = aboutStageActive ? holes : mainHoles;
	const snakeStrength = snakeReferenceHoles.reduce((max, hole) => {
		const distance = Math.abs(hole.y - viewportHeight / 2);
		return Math.max(max, smoothstep01(1 - Math.min(distance / (itemGapPx * 0.52), 1)));
	}, 0);
	const lastAboutStageFocus = aboutStageActive ? smoothstep01(aboutStagePosition - (ABOUT_SUBITEM_OFFSETS.length - 2)) : 0;
	const compactSnakeFocus = useDampedValue(lastAboutStageFocus, 0.1);
	const normalSnakeLength = 174 - snakeStrength * 104;
	const compactSnakeLength = 40;
	const snakeLength = normalSnakeLength + (compactSnakeLength - normalSnakeLength) * compactSnakeFocus;
	const snakeY1 = viewportHeight / 2 - snakeLength / 2;
	const snakeY2 = viewportHeight / 2 + snakeLength / 2;
	const snakeThicknessScale = 1 - compactSnakeFocus * 0.25;
	const snakeBloomWidth = (7 + snakeStrength * 4) * snakeThicknessScale;
	const snakeCoreWidth = (1.2 + snakeStrength * 1.5) * snakeThicknessScale;
	const snakeOpacity = 0.4 + snakeStrength * 0.28;
	const snakeBrightnessScale = Math.min(aboutStageActive ? 0.72 : 1, 1 - compactSnakeFocus * 0.38);
	const directionalSnakeHead = 18 + ((directionValue + 1) / 2) * 64;
	const handoffHeadBlend = smoothstep01(aboutHandoffProgress / 0.16);
	const snakeHead = aboutStageActive ? 50 + (directionalSnakeHead - 50) * handoffHeadBlend : directionalSnakeHead;
	const snakeHeadOffset = `${snakeHead.toFixed(2)}%`;
	const snakeHeadPrevOffset = `${Math.max(0, snakeHead - 10).toFixed(2)}%`;
	const snakeHeadNextOffset = `${Math.min(100, snakeHead + 10).toFixed(2)}%`;
	const direction = directionValue >= 0 ? "down" : "up";
	const centerY = viewportHeight / 2;
	const activeCircleGlow = mainHoles
		.map((hole) => {
			if (aboutStageActive && hole.id === "about") {
				return null;
			}
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
	const activeAboutHole = aboutStageActive ? (mainHoles.filter((hole) => hole.id === "about").sort((a, b) => Math.abs(a.relative) - Math.abs(b.relative))[0] ?? null) : null;
	const activeAboutSubitems = activeAboutHole ? subitemHoles.filter((item) => item.parentKey === activeAboutHole.key).sort((a, b) => a.index - b.index) : [];
	const aboutVisibility = activeAboutHole ? Number(resolveNavigatorCircleOpacity(activeAboutHole.relative)) : 0;
	const activeAboutMainGlow =
		activeAboutHole && aboutMainActivation > 0.001
			? {
					x: activeAboutHole.x,
					y: activeAboutHole.y,
					activation: clamp01(aboutMainActivation),
					visibility: aboutVisibility,
					distanceAttenuation: Math.pow(0.7, aboutStagePosition),
					exitProgress: clamp01(aboutMainExitProgress),
					clipPathId: `${gradientId}-about-main-exit`,
					spread: aboutMainExitProgress > 0.001 ? 179 : Math.min(179, 16 + clamp01(aboutMainActivation) * 163),
				}
			: null;
	const activeAboutSubitemGlow = activeAboutSubitems.map((subitem, index) => {
		const baseActivation = resolveAboutSubitemActivation(index, aboutStagePosition, aboutEntryProgress);
		const reverseReveal = aboutReverseEntry ? resolveSequentialReveal(aboutReverseSequenceProgress, resolveAboutReverseSequenceOrder(index)) : 1;
		const exitProgress = resolveSequentialReveal(aboutHandoffProgress, resolveAboutExitSequenceOrder(index));
		const exitVisibility = 1 - exitProgress;
		const activation = baseActivation * reverseReveal * exitVisibility;
		const previous = index === 0 ? activeAboutHole : activeAboutSubitems[index - 1];
		const previousRadius = index === 0 ? circleRadius : subitemRadius;
		const connectorY1 = previous.y + previousRadius + 0.4;
		const connectorEnd = Math.max(connectorY1, subitem.y - subitemRadius - 0.4);
		const connectorY2 = connectorY1 + (connectorEnd - connectorY1) * activation;
		const activeDistance = Math.abs(aboutStagePosition - index);
		const focus = smoothstep01(1 - Math.min(activeDistance, 1));
		const emphasis = resolveAboutSubitemEmphasis(index, aboutStagePosition);

		return {
			key: `${subitem.key}:stage-ring`,
			connectorGradientId: `${gradientId}-about-subitem-${subitem.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
			clipPathId: `${gradientId}-about-subitem-exit-${subitem.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
			x: subitem.x,
			y: subitem.y,
			y1: connectorY1,
			y2: connectorY2,
			activation,
			focus,
			emphasis,
			exitProgress,
			visibility: aboutVisibility,
			spread: exitProgress > 0.001 ? 179 : Math.min(179, 16 + activation * 163),
		};
	});
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
				{activeAboutSubitemGlow.map((glow) => (
					<linearGradient key={`${glow.key}:connector`} id={glow.connectorGradientId} x1="0" y1={glow.y1} x2="0" y2={glow.y2} gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="var(--mainColor)" stopOpacity={0.2 + glow.activation * 0.22} />
						<stop offset="58%" stopColor="white" stopOpacity={0.12 + glow.activation * 0.26} />
						<stop offset="100%" stopColor="var(--mainColor)" stopOpacity={0.22 + glow.activation * 0.34} />
					</linearGradient>
				))}
				{activeAboutSubitemGlow.map((glow) => {
					const wipeTop = glow.y - subitemRadius - 18;
					const wipeBottom = glow.y + subitemRadius + 18;
					const wipeY = wipeTop + (wipeBottom - wipeTop) * glow.exitProgress;
					return (
						<clipPath key={`${glow.key}:exit-clip`} id={glow.clipPathId}>
							<rect x="0" y={wipeY} width={NAVIGATOR_WIDTH} height={Math.max(0, viewportHeight + 80 - wipeY)} />
						</clipPath>
					);
				})}
				{activeAboutMainGlow &&
					(() => {
						const wipeTop = activeAboutMainGlow.y - circleRadius - 22;
						const wipeBottom = activeAboutMainGlow.y + circleRadius + 22;
						const wipeY = wipeTop + (wipeBottom - wipeTop) * activeAboutMainGlow.exitProgress;
						return (
							<clipPath id={activeAboutMainGlow.clipPathId}>
								<rect x="0" y={wipeY} width={NAVIGATOR_WIDTH} height={Math.max(0, viewportHeight + 80 - wipeY)} />
							</clipPath>
						);
					})()}
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
			{activeAboutSubitemGlow.map((glow) => (
				<g
					key={glow.key}
					className="scrollPageNavigatorAboutSubitemCluster"
					opacity={glow.visibility * glow.activation * (0.08 + glow.activation * (0.12 + glow.emphasis * 0.64))}
				>
					<line x1={glow.x} y1={glow.y1} x2={glow.x} y2={glow.y2} stroke={`url(#${glow.connectorGradientId})`} strokeWidth={0.9 + glow.activation * 0.9} />
					<g clipPath={glow.exitProgress > 0.001 ? `url(#${glow.clipPathId})` : undefined}>
						<circle
							className="scrollPageNavigatorAboutSubitemHalo"
							cx={glow.x}
							cy={glow.y}
							r={subitemRadius + 2.5}
							strokeWidth={1.1 + glow.activation * 0.8 + glow.emphasis * 0.55}
							opacity={glow.activation * (0.1 + glow.emphasis * 0.68)}
						/>
						<g className="scrollPageNavigatorSnakeRing">
							<path d={describeCircleArc(glow.x, glow.y, subitemRadius, -90, -90 + glow.spread, 1)} strokeWidth={0.9 + glow.activation * 1.35} />
							<path d={describeCircleArc(glow.x, glow.y, subitemRadius, -90, -90 - glow.spread, 0)} strokeWidth={0.9 + glow.activation * 1.35} />
						</g>
					</g>
				</g>
			))}
			{activeAboutMainGlow && (
				<g
					className="scrollPageNavigatorSnakeRing scrollPageNavigatorAboutMainRing"
					clipPath={activeAboutMainGlow.exitProgress > 0.001 ? `url(#${activeAboutMainGlow.clipPathId})` : undefined}
					opacity={
						activeAboutMainGlow.visibility * activeAboutMainGlow.distanceAttenuation * activeAboutMainGlow.activation * (0.16 + activeAboutMainGlow.activation * 0.78)
					}
				>
					<path
						d={describeCircleArc(activeAboutMainGlow.x, activeAboutMainGlow.y, circleRadius, -90, -90 + activeAboutMainGlow.spread, 1)}
						strokeWidth={0.9 + activeAboutMainGlow.activation * 1.35}
					/>
					<path
						d={describeCircleArc(activeAboutMainGlow.x, activeAboutMainGlow.y, circleRadius, -90, -90 - activeAboutMainGlow.spread, 0)}
						strokeWidth={0.9 + activeAboutMainGlow.activation * 1.35}
					/>
				</g>
			)}
			{activeCircleGlow.map((glow) => (
				<g key={glow.key} className="scrollPageNavigatorSnakeRing" opacity={0.16 + glow.strength * 0.78}>
					<path d={describeCircleArc(glow.x, glow.y, circleRadius, glow.entryAngle, glow.entryAngle + glow.spread, 1)} strokeWidth={0.9 + glow.strength * 1.35} />
					<path d={describeCircleArc(glow.x, glow.y, circleRadius, glow.entryAngle, glow.entryAngle - glow.spread, 0)} strokeWidth={0.9 + glow.strength * 1.35} />
				</g>
			))}
			<line className="scrollPageNavigatorLineCore" x1={LINE_X} y1="-80" x2={LINE_X} y2={viewportHeight + 80} stroke={`url(#${gradientId})`} mask={`url(#${maskId})`} />
		</svg>
	);
}

function ScrollPageNavigatorContent() {
	const proxyStore = useStore();
	const location = useLocation();
	const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 940));
	const aboutStageCursorTimerRef = useRef(0);
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
	const lastDirectionRef = useRef("down");
	if (isDirectClickTravel && Math.abs(clickDistance) > 0.001) {
		lastDirectionRef.current = clickDistance > 0 ? "down" : "up";
	} else if (progressTarget > progress + 0.001) {
		lastDirectionRef.current = "down";
	} else if (progressTarget < progress - 0.001) {
		lastDirectionRef.current = "up";
	}
	const scrollDirection = lastDirectionRef.current;
	const directionTarget = scrollDirection === "down" ? 1 : -1;
	const directionValue = useDampedValue(directionTarget, 0.12);
	const siteLocale = normalizeSiteLocale(proxyStore.siteLocale);
	const aboutStageActive = currentId === "about" && proxyStore.aboutExperience.active === true;
	const handleAboutStageNavigate = useCallback(
		(stateIndex) => {
			if (!aboutStageActive) {
				return;
			}

			store.cursor.stageNavigationHidden = true;
			store.aboutStageNavigationRequest = {
				stateIndex,
				requestId: performance.now(),
			};
			if (aboutStageCursorTimerRef.current) {
				window.clearTimeout(aboutStageCursorTimerRef.current);
			}
			aboutStageCursorTimerRef.current = window.setTimeout(() => {
				aboutStageCursorTimerRef.current = 0;
				store.cursor.stageNavigationHidden = false;
			}, ABOUT_STAGE_CURSOR_HIDE_MS);
		},
		[aboutStageActive],
	);
	const aboutStagePosition = Number.isFinite(proxyStore.aboutExperience.stagePosition)
		? Math.max(0, Math.min(ABOUT_SUBITEM_OFFSETS.length - 1, proxyStore.aboutExperience.stagePosition))
		: 0;
	const isAboutClickRoutePhase = clickPhase !== "idle" && clickTargetId === "about";
	const isDirectAboutEntry = isDirectClickTravel && clickTargetId === "about" && currentId !== "about";
	const isEnteringAboutForward = isDirectAboutEntry || (currentId === "portfolioHub" && (rawProgress > 0.001 || rawProgressTarget > 0.001) && !isDirectClickTravel);
	const isEnteringAboutFromContacts = currentId === "contacts" && (rawProgress < -0.001 || rawProgressTarget < -0.001) && !isDirectClickTravel;
	const directAboutEntryRef = useRef(false);
	if (isAboutClickRoutePhase) {
		directAboutEntryRef.current = true;
	} else if (currentId !== "about") {
		directAboutEntryRef.current = false;
	}
	const preserveDirectAboutEntry = currentId === "about" && directAboutEntryRef.current;
	const isSettlingIntoAboutForward = currentId === "about" && (proxyStore.sceneCarouselLastCommitDirection === "forward" || (preserveDirectAboutEntry && !aboutStageActive));
	const isSettlingIntoAboutFromContacts =
		currentId === "about" &&
		!preserveDirectAboutEntry &&
		((proxyStore.sceneCarouselLastCommitFromId === "contacts" && proxyStore.sceneCarouselLastCommitDirection === "backward") ||
			(!aboutStageActive && rawProgress > 0.001 && rawProgressTarget <= 0.001));
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
	const navigatorAboutStagePosition =
		isEnteringAboutForward || isSettlingIntoAboutForward || (preserveForwardAboutEntry && !aboutStageActive)
			? 0
			: isEnteringAboutFromContacts || isSettlingIntoAboutFromContacts
				? ABOUT_SUBITEM_OFFSETS.length - 1
				: aboutStagePosition;
	const aboutReverseEntry = isEnteringAboutFromContacts || preserveReverseAboutEntry || (aboutStageActive && aboutStagePosition > 0.5);
	const aboutTrackActive = aboutStageActive || isEnteringAboutForward || isEnteringAboutFromContacts || isSettlingIntoAboutForward || isSettlingIntoAboutFromContacts;
	const timedAboutEntryProgress = useTimedActivation(aboutStageActive, 240, aboutStagePosition > 0.5 || preserveForwardAboutEntry || preserveReverseAboutEntry);
	const aboutTrackOffset = resolveAboutTrackOffset(navigatorAboutStagePosition);
	const aboutForwardMainTravel = isDirectAboutEntry ? clickDistance : 1;
	const aboutForwardTrackBlend = isEnteringAboutForward ? (isDirectAboutEntry ? clamp01(Math.abs(progress / aboutForwardMainTravel)) : clamp01(progress)) : 0;
	const aboutReverseTrackBlend = isEnteringAboutFromContacts ? clamp01(-progress) : 0;
	const aboutTrackBlend = isEnteringAboutForward
		? aboutForwardTrackBlend
		: isEnteringAboutFromContacts
			? aboutReverseTrackBlend
			: aboutTrackActive
				? 1 - clamp01(Math.abs(rawProgress))
				: 0;
	const navigatorProgress = progress + aboutTrackOffset * aboutTrackBlend;
	const aboutForwardFirstStageRelative = aboutForwardMainTravel + ABOUT_SUBITEM_OFFSETS[0] - navigatorProgress;
	const aboutForwardSequenceProgress = isEnteringAboutForward ? smoothstep01(1 - Math.abs(aboutForwardFirstStageRelative) / 0.22) : 0;
	const aboutReverseLastStageOffset = ABOUT_SUBITEM_OFFSETS[ABOUT_SUBITEM_OFFSETS.length - 1];
	const aboutReverseLastStageRelative = (currentId === "contacts" ? -1 + aboutReverseLastStageOffset : aboutReverseLastStageOffset) - navigatorProgress;
	const aboutReverseArrivalActivation = smoothstep01(1 - Math.abs(aboutReverseLastStageRelative) / 0.22);
	const reverseAboutArrivalCompleteRef = useRef(false);
	if ((isEnteringAboutFromContacts || preserveReverseAboutEntry) && aboutReverseArrivalActivation > 0.999) {
		reverseAboutArrivalCompleteRef.current = true;
	} else if (currentId !== "about" && !isEnteringAboutFromContacts) {
		reverseAboutArrivalCompleteRef.current = false;
	}
	const reverseAboutArrivalComplete = reverseAboutArrivalCompleteRef.current;
	const timedAboutReverseSequenceProgress = useTimedActivation(
		aboutStageActive && aboutReverseEntry && (!preserveReverseAboutEntry || reverseAboutArrivalComplete),
		420,
		aboutStagePosition <= 0.5 && !preserveReverseAboutEntry,
		preserveReverseAboutEntry ? 0.2 : 0,
	);
	const reverseAboutIsApproaching = (isEnteringAboutFromContacts || preserveReverseAboutEntry) && !reverseAboutArrivalComplete;
	const aboutReverseSequenceProgress = reverseAboutIsApproaching
		? 0.2 * aboutReverseArrivalActivation
		: preserveReverseAboutEntry
			? Math.max(0.2, timedAboutReverseSequenceProgress)
			: timedAboutReverseSequenceProgress;
	const aboutEntryProgress = isEnteringAboutForward
		? aboutForwardSequenceProgress
		: isEnteringAboutFromContacts || preserveReverseAboutEntry
			? 1
			: preserveForwardAboutEntry
				? 1
				: timedAboutEntryProgress;
	const isLeavingAboutForContacts = currentId === "about" && (progress > 0.001 || progressTarget > 0.001) && (!isDirectClickTravel || clickTargetId === "contacts");
	const aboutExitProgress = isLeavingAboutForContacts ? clamp01(progress) : 0;
	const aboutForwardMainDistance = Math.max(0, aboutForwardMainTravel - navigatorProgress);
	const aboutMainBaseActivation = aboutTrackActive
		? isDirectAboutEntry
			? aboutForwardSequenceProgress
			: isEnteringAboutForward
				? smoothstep01(1 - aboutForwardMainDistance / 0.22)
				: aboutReverseEntry
					? resolveSequentialReveal(aboutReverseSequenceProgress, resolveAboutReverseSequenceOrder(-1))
					: 1
		: 0;
	const aboutMainExitProgress = resolveSequentialReveal(aboutExitProgress, resolveAboutExitSequenceOrder(-1));
	const aboutMainActivation = aboutMainBaseActivation * (1 - aboutMainExitProgress);
	const instances = useMemo(() => resolveItemInstances(currentId, navigatorProgress), [currentId, navigatorProgress]);
	const subitemInstances = useMemo(() => resolveAboutSubitemInstances(instances), [instances]);
	const activeAboutParentKey = aboutTrackActive
		? (instances.filter((item) => item.id === "about").sort((a, b) => Math.abs(a.relative) - Math.abs(b.relative))[0]?.key ?? null)
		: null;
	const subitemVisuals = subitemInstances.map((item) => {
		const isActiveTrack = item.parentKey === activeAboutParentKey;
		const baseActivation = isActiveTrack ? resolveAboutSubitemActivation(item.index, navigatorAboutStagePosition, aboutEntryProgress) : 0;
		const reverseReveal = isActiveTrack && aboutReverseEntry ? resolveSequentialReveal(aboutReverseSequenceProgress, resolveAboutReverseSequenceOrder(item.index)) : 1;
		const exitVisibility = 1 - resolveSequentialReveal(aboutExitProgress, resolveAboutExitSequenceOrder(item.index));
		const activation = baseActivation * reverseReveal * exitVisibility;
		const focus = isActiveTrack ? smoothstep01(1 - Math.min(Math.abs(navigatorAboutStagePosition - item.index), 1)) : 0;
		const emphasis = isActiveTrack ? resolveAboutSubitemEmphasis(item.index, navigatorAboutStagePosition) : 0;
		const circleOpacity = Number(resolveNavigatorCircleOpacity(item.relative));
		const numberOpacity = circleOpacity * (0.44 + activation * (0.12 + emphasis * 0.4));

		return {
			item,
			activation,
			focus,
			emphasis,
			circleOpacity,
			numberOpacity,
		};
	});
	const itemGapPx = Math.min(230, Math.max(172, viewportHeight * 0.245));

	useEffect(() => {
		const onResize = () => setViewportHeight(window.innerHeight);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(
		() => () => {
			if (aboutStageCursorTimerRef.current) {
				window.clearTimeout(aboutStageCursorTimerRef.current);
				aboutStageCursorTimerRef.current = 0;
			}
			store.cursor.stageNavigationHidden = false;
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
					subitemInstances={subitemInstances}
					itemGapPx={itemGapPx}
					viewportHeight={viewportHeight}
					directionValue={directionValue}
					aboutStageActive={aboutTrackActive}
					aboutStagePosition={navigatorAboutStagePosition}
					aboutEntryProgress={aboutEntryProgress}
					aboutReverseEntry={aboutReverseEntry}
					aboutReverseSequenceProgress={aboutReverseSequenceProgress}
					aboutMainActivation={aboutMainActivation}
					aboutMainExitProgress={aboutMainExitProgress}
					aboutHandoffProgress={aboutExitProgress}
				/>
				{subitemVisuals.map(({ item, activation, focus, emphasis, circleOpacity }) => {
					return (
						<span
							key={item.key}
							className={["scrollPageNavigatorSubitem", activation > 0.001 && "active", focus > 0.001 && "current"].filter(Boolean).join(" ")}
							style={{
								"--navigator-y": `${item.relative * itemGapPx}px`,
								"--navigator-subcircle-opacity": circleOpacity.toFixed(3),
								"--navigator-subcircle-activation": activation.toFixed(3),
								"--navigator-subcircle-focus": focus.toFixed(3),
								"--navigator-subcircle-emphasis": emphasis.toFixed(3),
							}}
							aria-hidden="true"
						>
							<span className="scrollPageNavigatorSubcircle" />
						</span>
					);
				})}
			</div>
			<div className="scrollPageNavigatorItems">
				{instances.map((item) => (
					<ScrollNavigatorItem
						key={item.key}
						item={item}
						itemGapPx={itemGapPx}
						label={getNavItemLabel(item.navId, siteLocale)}
						onNavigate={handleNavigate}
						clickPhase={clickPhase}
						clickTargetId={clickTargetId}
						forceActive={item.id === "about" && item.key === activeAboutParentKey && aboutMainActivation > 0.5}
						suppressNaturalActive={
							(item.id === "about" && (isEnteringAboutFromContacts || isSettlingIntoAboutFromContacts || aboutReverseEntry)) ||
							(item.id === "contacts" && aboutTrackActive)
						}
					/>
				))}
				{aboutStageActive &&
					subitemVisuals
						.filter(({ item }) => item.parentKey === activeAboutParentKey)
						.map(({ item, focus, numberOpacity }) => (
							<AboutStageButton
								key={`${item.key}:button`}
								item={item}
								itemGapPx={itemGapPx}
								numberOpacity={numberOpacity}
								focus={focus}
								onNavigate={handleAboutStageNavigate}
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
			inert={visuallyHidden || undefined}
		>
			{contentMounted ? <ScrollPageNavigatorContent /> : null}
		</nav>
	);
}

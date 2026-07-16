import clickSound from "@/sounds/clickSound.mp3";
import { bindMediaElementToMasterBus } from "@/sounds/masterAudioBus.js";
import "@/css/cursor.scss";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribe } from "valtio";
import { store } from "@/store.jsx";

const FOLLOW_SMOOTH = 0.14;
const FOLLOW_SMOOTH_MENU = 0.055;
const MENU_PARK_OFFSET_X = 220;

export default function Cursor(props) {
	const hovered = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.hovered,
		() => false,
	);
	const menuAnchored = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.menuAnchorActive,
		() => false,
	);
	const menuAnchorDiameter = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.menuAnchorDiameter,
		() => 0,
	);
	const menuAnchorRevision = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.menuAnchorRevision,
		() => 0,
	);
	const caseHovered = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.caseHovered,
		() => false,
	);
	const stageNavigationHidden = useSyncExternalStore(
		(cb) => subscribe(store.cursor, cb),
		() => store.cursor.stageNavigationHidden,
		() => false,
	);
	const isHoverVisual = hovered || menuAnchored;
	const isMenuMerged = menuAnchored && menuAnchorDiameter > 0;

	const customCursorRef = useRef(null);
	const targetRef = useRef({ x: 0, y: 0 });
	const followRef = useRef({ x: 0, y: 0 });
	const followInitializedRef = useRef(false);
	const menuActivatedOnceRef = useRef(false);

	const audioRef = useRef();
	const [isDesktopCursor, setIsDesktopCursor] = useState(typeof window !== "undefined" ? window.innerWidth > 768 : true);
	const [isClicked, setIsClicked] = useState(false);
	const [pointsRotation, setPointsRotation] = useState(0);
	const lastAnchorRevisionRef = useRef(menuAnchorRevision);

	useEffect(() => {
		const audio = new Audio(clickSound);
		bindMediaElementToMasterBus(audio);
		audioRef.current = audio;
	}, []);

	useEffect(() => {
		const mq = window.matchMedia("(min-width: 769px)");
		const onChange = () => setIsDesktopCursor(mq.matches);
		onChange();
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const applyCursorPosition = (x, y) => {
		const el = customCursorRef.current;
		if (!el) {
			return;
		}
		el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
	};

	useEffect(() => {
		if (!isDesktopCursor) return;
		const rootStyle = getComputedStyle(document.documentElement);
		const leftMenuWidth = Number.parseFloat(rootStyle.getPropertyValue("--leftMenuWidth")) || 121;
		const initialX = leftMenuWidth + MENU_PARK_OFFSET_X;
		const initialY = window.innerHeight * 0.5;
		targetRef.current = { x: initialX, y: initialY };
		followRef.current = { x: initialX, y: initialY };
		followInitializedRef.current = true;
		applyCursorPosition(initialX, initialY);

		const onPointerMove = (e) => {
			const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
			const last = coalesced?.length ? coalesced[coalesced.length - 1] : e;
			if (last == null || typeof last.clientX !== "number") {
				return;
			}

			targetRef.current.x = last.clientX;
			targetRef.current.y = last.clientY;
		};

		window.addEventListener("pointermove", onPointerMove, { passive: true });
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
		};
	}, [isDesktopCursor]);

	useEffect(() => {
		if (!isDesktopCursor || !props.startApp || !followInitializedRef.current) {
			return undefined;
		}
		if (!menuAnchored && !menuActivatedOnceRef.current) {
			return undefined;
		}

		if (menuAnchored) {
			menuActivatedOnceRef.current = true;
		}

		const fadeEndsAt = menuAnchored ? Number.POSITIVE_INFINITY : performance.now() + 450;
		let frameId = 0;
		const tick = (now) => {
			const menuActive = store.cursor.menuAnchorActive && store.cursor.menuAnchorDiameter > 0;
			if (!menuActive && now >= fadeEndsAt) {
				return;
			}

			const anchorX = menuActive ? store.cursor.menuAnchorX : targetRef.current.x;
			const anchorY = menuActive ? store.cursor.menuAnchorY : targetRef.current.y;
			const followSmooth = menuActive ? FOLLOW_SMOOTH_MENU : FOLLOW_SMOOTH;

			followRef.current.x += (anchorX - followRef.current.x) * followSmooth;
			followRef.current.y += (anchorY - followRef.current.y) * followSmooth;
			applyCursorPosition(followRef.current.x, followRef.current.y);
			frameId = requestAnimationFrame(tick);
		};

		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	}, [isDesktopCursor, menuAnchored, props.startApp]);

	useEffect(() => {
		if (menuAnchorRevision === lastAnchorRevisionRef.current) {
			return;
		}
		lastAnchorRevisionRef.current = menuAnchorRevision;
		setPointsRotation((rotation) => rotation + 180);
	}, [menuAnchorRevision]);

	useEffect(() => {
		if (menuAnchored || !menuActivatedOnceRef.current) {
			return undefined;
		}

		const resetTimer = setTimeout(() => setPointsRotation(0), 450);
		return () => clearTimeout(resetTimer);
	}, [menuAnchored]);

	useLayoutEffect(() => {
		const custom = customCursorRef.current;
		if (!isDesktopCursor) return;
		if (!props.startApp) {
			if (custom) custom.style.transform = "";
			return;
		}
		applyCursorPosition(followRef.current.x, followRef.current.y);
	}, [isHoverVisual, isMenuMerged, caseHovered, isClicked, props.startApp, isDesktopCursor]);

	const handleCursorClick = () => {
		setIsClicked(true);
		setTimeout(() => {
			setIsClicked(false);
		}, 70);

		if (store.soundsActive === true && audioRef.current != null) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current.play();
		}
	};

	useEffect(() => {
		window.addEventListener("click", handleCursorClick);
		return () => {
			window.removeEventListener("click", handleCursorClick);
		};
	}, []);

	const cursorClassName = [
		"cursor",
		"menuOnlyCursor",
		menuAnchored && "menuAnchorVisible",
		stageNavigationHidden && "stageNavigationHidden",
		isHoverVisual && "hover",
		isMenuMerged && "menuMerged",
		caseHovered && "caseHovered",
		isClicked && "click",
	]
		.filter(Boolean)
		.join(" ");

	const mergedSizeStyle = isMenuMerged
		? {
				width: menuAnchorDiameter,
				height: menuAnchorDiameter,
			}
		: undefined;

	if (!isDesktopCursor) {
		return null;
	}

	const stackStyle = {
		position: "fixed",
		inset: 0,
		overflow: "visible",
		pointerEvents: "none",
		zIndex: 99999,
	};

	const cursorStyle = {
		"--cursor-points-rotation": `${pointsRotation}deg`,
		display: "flex",
		position: "absolute",
		left: 0,
		top: 0,
		pointerEvents: "none",
		willChange: "transform",
		zIndex: 1,
		...mergedSizeStyle,
	};

	const cursorStyleBeforeStart = {
		"--cursor-points-rotation": `${pointsRotation}deg`,
		transition: "opacity 0.5s ease, transform 0.5s ease",
		opacity: props.startApp ? 1 : 0,
		transform: "translate(-50%, -50%) scale(0)",
		display: "flex",
		position: "absolute",
		left: 0,
		top: 0,
		pointerEvents: "none",
		willChange: "transform",
		zIndex: 1,
	};

	return (
		<div style={stackStyle}>
			<div ref={customCursorRef} className={cursorClassName} style={props.startApp ? cursorStyle : cursorStyleBeforeStart}>
				<div className="mainCircle">
					<div className="halfCircle1">
						<div className="inCircle" />
					</div>
					<div className="halfCircle2">
						<div className="inCircle" />
					</div>
				</div>

				<div className="bigCircle" />

				<div className="caseInner">
					<div className="littleCircle">
						<div className="halfCircle1">
							<div className="inCircle" />
						</div>
						<div className="halfCircle2">
							<div className="inCircle" />
						</div>
					</div>

					<div className="points">
						<div className="points1">
							<div className="point1" />
							<div className="point2" />
						</div>
						<div className="points2">
							<div className="point1" />
							<div className="point2" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

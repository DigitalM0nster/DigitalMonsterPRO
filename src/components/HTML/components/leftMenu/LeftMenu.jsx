import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/store.jsx";
import { getNavItemLabel } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { playLeftMenuGlitchSound } from "@/sounds/soundDesign.js";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import LeftMenuItem from "./LeftMenuItem.jsx";
import LeftMenuLanguageButton from "./LeftMenuLanguageButton.jsx";
import { clearMenuCursorAnchor, setMenuCursorAnchor } from "./leftMenuCursorAnchor.js";
import {
	measureLeftMenuContentAnchor,
	publishLeftMenuContentAnchor,
} from "./leftMenuContentAnchor.js";
import { MENU_CIRCLE_HOVER_SCALE, MENU_CIRCLE_IDLE_SCALE, MENU_SNAP_OFFSET } from "./leftMenuSnap.js";
import { MENU_LABEL_APPEAR_MS, MENU_LABEL_DISAPPEAR_MS } from "./leftMenuLabelTimings.js";
import styles from "./LeftMenu.module.scss";

const NAV_ITEMS = [
	{ id: "main", path: "/", icon: "home", match: (p) => p === "/" },
	{
		id: "portfolio",
		path: "/portfolio",
		icon: "portfolio",
		match: (p) => p.startsWith("/portfolio"),
	},
	{ id: "about", path: "/about", icon: "about", match: (p) => p.startsWith("/about") },
	{
		id: "contacts",
		path: "/contacts",
		icon: "contacts",
		match: (p) => p.startsWith("/contacts"),
	},
	{ id: "lab", path: null, icon: "lab_icon", disabled: true },
];

function isOverMenuButton(target) {
	return Boolean(target?.closest?.(`.${styles.itemButton}`));
}

export default function LeftMenu() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const proxyStore = useStore();
	const siteLocale = normalizeSiteLocale(proxyStore.siteLocale);
	const navItems = useMemo(
		() =>
			NAV_ITEMS.map((item) => ({
				...item,
				label: getNavItemLabel(item.id, siteLocale),
			})),
		[siteLocale],
	);
	const leftMenuRef = useRef(null);
	const buttonRefs = useRef([]);
	const labelRefs = useRef([]);
	const labelTimersRef = useRef(new Map());
	const displayedIndexRef = useRef(-1);
	const disappearingIndicesRef = useRef(new Set());

	const [displayedLabelIndex, setDisplayedLabelIndex] = useState(-1);
	const [disappearingLabelIndices, setDisappearingLabelIndices] = useState([]);

	const syncDisappearingLabels = useCallback(() => {
		setDisappearingLabelIndices([...disappearingIndicesRef.current]);
	}, []);

	const clearLabelTimer = useCallback((index) => {
		const timer = labelTimersRef.current.get(index);
		if (timer) {
			clearTimeout(timer);
			labelTimersRef.current.delete(index);
		}
	}, []);

	const clearAllLabelTimers = useCallback(() => {
		for (const timer of labelTimersRef.current.values()) {
			clearTimeout(timer);
		}
		labelTimersRef.current.clear();
	}, []);

	const hideAllLabelsImmediate = useCallback(
		(exceptIndices = new Set()) => {
			labelRefs.current.forEach((label, i) => {
				if (!exceptIndices.has(i)) {
					label?.cancelAndHide?.();
					clearLabelTimer(i);
					disappearingIndicesRef.current.delete(i);
				}
			});
			syncDisappearingLabels();
		},
		[clearLabelTimer, syncDisappearingLabels],
	);

	const startLabelDisappear = useCallback(
		(index) => {
			if (index < 0 || disappearingIndicesRef.current.has(index)) {
				return;
			}

			const label = labelRefs.current[index];
			if (!label) {
				return;
			}

			clearLabelTimer(index);
			disappearingIndicesRef.current.add(index);
			syncDisappearingLabels();

			const durationMs = label.playDisappear?.({ timeBudgetMs: MENU_LABEL_DISAPPEAR_MS }) ?? MENU_LABEL_DISAPPEAR_MS;
			playLeftMenuGlitchSound(durationMs);

			const timer = setTimeout(() => {
				label.cancelAndHide?.();
				disappearingIndicesRef.current.delete(index);
				labelTimersRef.current.delete(index);
				syncDisappearingLabels();
			}, durationMs);
			labelTimersRef.current.set(index, timer);
		},
		[clearLabelTimer, syncDisappearingLabels],
	);

	const handleNavigate = useCallback(
		(path) => {
			if (pathname === path) {
				return;
			}

			if (requestHexNavigation(path, pathname)) {
				return;
			}

			navigate(path);
		},
		[navigate, pathname],
	);

	const activateLabel = useCallback(
		(index) => {
			const previousIndex = displayedIndexRef.current;
			const keepVisible = new Set([index]);

			if (previousIndex >= 0 && previousIndex !== index) {
				startLabelDisappear(previousIndex);
				keepVisible.add(previousIndex);
			}

			if (disappearingIndicesRef.current.has(index)) {
				clearLabelTimer(index);
				disappearingIndicesRef.current.delete(index);
				syncDisappearingLabels();
			}

			for (const disappearingIndex of disappearingIndicesRef.current) {
				keepVisible.add(disappearingIndex);
			}

			hideAllLabelsImmediate(keepVisible);

			displayedIndexRef.current = index;
			setDisplayedLabelIndex(index);
		},
		[clearLabelTimer, hideAllLabelsImmediate, startLabelDisappear, syncDisappearingLabels],
	);

	const deactivateLabelAnimated = useCallback(
		(index) => {
			// Nav leave после button leave — disappear уже запущен, не обрываем
			if (index < 0) {
				if (disappearingIndicesRef.current.size > 0) {
					return;
				}
				hideAllLabelsImmediate(new Set());
				displayedIndexRef.current = -1;
				setDisplayedLabelIndex(-1);
				return;
			}

			displayedIndexRef.current = -1;
			setDisplayedLabelIndex(-1);
			startLabelDisappear(index);
		},
		[hideAllLabelsImmediate, startLabelDisappear],
	);

	// appear после того как isDisplayed=true в DOM
	useLayoutEffect(() => {
		if (displayedLabelIndex < 0) {
			return;
		}

		const label = labelRefs.current[displayedLabelIndex];
		if (!label) {
			return;
		}

		const durationMs = label.playAppear?.({ timeBudgetMs: MENU_LABEL_APPEAR_MS }) ?? MENU_LABEL_APPEAR_MS;
		playLeftMenuGlitchSound(durationMs);
	}, [displayedLabelIndex]);

	const handleItemHoverEnter = useCallback(
		(index, entry) => {
			activateLabel(index);
			setMenuCursorAnchor(index, buttonRefs, entry);
		},
		[activateLabel],
	);

	const handleItemHoverLeave = useCallback(
		(index, event) => {
			if (isOverMenuButton(event.relatedTarget)) {
				return;
			}
			deactivateLabelAnimated(index);
			clearMenuCursorAnchor();
		},
		[deactivateLabelAnimated],
	);

	const handleLeftMenuPointerLeave = useCallback(
		(event) => {
			const relatedTarget = event.relatedTarget;
			if (relatedTarget instanceof Node && leftMenuRef.current?.contains(relatedTarget)) {
				return;
			}
			// Кнопка уже запустила disappear — не дублируем и не сбрасываем
			if (disappearingIndicesRef.current.size === 0) {
				deactivateLabelAnimated(displayedIndexRef.current);
			}
			clearMenuCursorAnchor();
		},
		[deactivateLabelAnimated],
	);

	useEffect(() => {
		return () => {
			clearAllLabelTimers();
			hideAllLabelsImmediate(new Set());
			clearMenuCursorAnchor();
		};
	}, [clearAllLabelTimers, hideAllLabelsImmediate]);

	const handleLogoClick = useCallback(
		(event) => {
			event.preventDefault();
			handleNavigate("/");
		},
		[handleNavigate],
	);

	// Якорь левого HUD кейса: home/last circle в viewport px (до paint canvas).
	useLayoutEffect(() => {
		const menuEl = leftMenuRef.current;
		if (!menuEl) {
			return undefined;
		}

		const syncContentAnchor = () => {
			const buttons = buttonRefs.current.filter(Boolean);
			if (buttons.length < 2) {
				return;
			}

			const measured = measureLeftMenuContentAnchor(menuEl, buttons[0], buttons[buttons.length - 1]);
			if (measured) {
				publishLeftMenuContentAnchor(measured);
			}
		};

		syncContentAnchor();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", syncContentAnchor);
			return () => window.removeEventListener("resize", syncContentAnchor);
		}

		const observer = new ResizeObserver(syncContentAnchor);
		observer.observe(menuEl);
		for (const button of buttonRefs.current) {
			if (button) {
				observer.observe(button);
			}
		}

		window.addEventListener("resize", syncContentAnchor);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", syncContentAnchor);
		};
	}, [pathname, navItems.length]);

	return (
		<nav
			ref={leftMenuRef}
			className={`${styles.leftMenu} ${pathname.startsWith("/about") ? styles.aboutLayout : ""}`}
			data-canvas-pointer-blocker="true"
			aria-label="Основная навигация"
			onPointerLeave={handleLeftMenuPointerLeave}
			style={{
				"--menuCircleIdleScale": MENU_CIRCLE_IDLE_SCALE,
				"--menuCircleHoverScale": MENU_CIRCLE_HOVER_SCALE,
				"--menuSnapOffset": `${MENU_SNAP_OFFSET}px`,
			}}
		>
			<div className={styles.topSection}>
				<a href="/" className={styles.logoLink} onClick={handleLogoClick} aria-label="Digital Monster — на главную">
					<img src="/images/DM_logo.png" alt="" className={styles.logoImg} />
					<span className={styles.brandWordmark} aria-hidden="true">
						<span className={styles.brandLine}>DIGITAL</span>
						<span className={styles.brandLine}>MONSTER</span>
					</span>
				</a>
			</div>

			<div className={styles.iconRail} data-menu-icon-rail>
				{NAV_ITEMS.map((item, index) => (
					<LeftMenuItem
						key={item.id}
						item={navItems[index]}
						isHomeNav={item.id === "main"}
						isActive={!item.disabled && Boolean(item.match?.(pathname))}
						disabled={Boolean(item.disabled)}
						isLabelDisplayed={displayedLabelIndex === index || disappearingLabelIndices.includes(index)}
						onNavigate={handleNavigate}
						onHoverEnter={(entry) => handleItemHoverEnter(index, entry)}
						onHoverLeave={(event) => handleItemHoverLeave(index, event)}
						onLabelRef={(node) => {
							labelRefs.current[index] = node;
						}}
						buttonRef={(node) => {
							buttonRefs.current[index] = node;
						}}
					/>
				))}
			</div>

			<div className={styles.bottomSection} data-menu-bottom-section>
				<LeftMenuLanguageButton />
			</div>
		</nav>
	);
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { playLeftMenuGlitchSound } from "@/sounds/soundDesign.js";
import LeftMenuGlitchLabel from "./LeftMenuGlitchLabel.jsx";
import { MENU_LABEL_APPEAR_MS, MENU_LABEL_DISAPPEAR_MS } from "./leftMenuLabelTimings.js";
import "./leftMenuGlitchText.scss";

/**
 * Все подписи меню в DOM одновременно.
 * Строго: disappear текущей → только потом appear новой. Две подписи не видны одновременно.
 */
export default function LeftMenuTabLabels({ items, targetIndex, activeIndex, menuVisible, onFrameWidthChange, onActiveLabelChange, onLabelFrameVisibleChange, onMenuExitSettled }) {
	const labelRefs = useRef([]);
	const [displayedIndex, setDisplayedIndex] = useState(-1);
	const displayedIndexRef = useRef(-1);
	const menuVisibleRef = useRef(menuVisible);
	const animRef = useRef({
		phase: "idle",
		timerId: null,
		shownIndex: -1,
		pendingTarget: -1,
	});

	menuVisibleRef.current = menuVisible;

	const clearTimer = () => {
		clearTimeout(animRef.current.timerId);
		animRef.current.timerId = null;
	};

	const measureLabelWidth = (index) => {
		return labelRefs.current[index]?.getContentWidth?.() ?? 0;
	};

	const applyFrameWidth = (index) => {
		if (index < 0) {
			onFrameWidthChange?.(0);
			return;
		}
		onFrameWidthChange?.(measureLabelWidth(index));
	};

	const setDisplayed = (index) => {
		displayedIndexRef.current = index;
		setDisplayedIndex(index);
		onActiveLabelChange?.(index);
	};

	const hideAllLabels = () => {
		labelRefs.current.forEach((label) => {
			label?.prepareHidden();
		});
	};

	const hideAllLabelsExcept = (exceptIndex) => {
		labelRefs.current.forEach((label, index) => {
			if (index !== exceptIndex) {
				label?.prepareHidden();
			}
		});
	};

	const notifyMenuExitSettled = () => {
		if (!menuVisibleRef.current) {
			onMenuExitSettled?.();
		}
	};

	const resetAllLabels = () => {
		hideAllLabels();
		animRef.current.shownIndex = -1;
		animRef.current.phase = "idle";
		animRef.current.pendingTarget = -1;
		clearTimer();
		setDisplayed(-1);
		onFrameWidthChange?.(0);
		onLabelFrameVisibleChange?.(false);
	};

	const scheduleFinish = (durationMs, onDone) => {
		clearTimer();
		if (durationMs <= 0) {
			onDone();
			return;
		}
		animRef.current.timerId = setTimeout(onDone, durationMs);
	};

	const finishLabelHidden = () => {
		animRef.current.phase = "idle";
		animRef.current.shownIndex = -1;
		setDisplayed(-1);
		onFrameWidthChange?.(0);
		if (!menuVisibleRef.current) {
			onLabelFrameVisibleChange?.(false);
		}
	};

	const startAppearRef = useRef((index) => {});
	const startDisappearRef = useRef((index) => {});

	startAppearRef.current = (index) => {
		const label = labelRefs.current[index];
		if (!label) {
			animRef.current.phase = "idle";
			return;
		}

		hideAllLabels();
		setDisplayed(index);
		applyFrameWidth(index);
		onLabelFrameVisibleChange?.(true);
		animRef.current.phase = "appear";

		const durationMs = label.playAppear({ timeBudgetMs: MENU_LABEL_APPEAR_MS });
		playLeftMenuGlitchSound(durationMs);
		scheduleFinish(durationMs, () => {
			animRef.current.phase = "idle";
			animRef.current.shownIndex = index;

			if (!menuVisibleRef.current) {
				startDisappearRef.current(index);
				return;
			}

			const pending = animRef.current.pendingTarget;
			if (pending >= 0 && pending !== index) {
				startDisappearRef.current(index);
			}
		});
	};

	startDisappearRef.current = (index) => {
		const label = labelRefs.current[index];
		if (!label) {
			finishLabelHidden();
			processQueueRef.current();
			return;
		}

		hideAllLabelsExcept(index);
		setDisplayed(index);
		animRef.current.phase = "disappear";

		const durationMs = label.playDisappear({ timeBudgetMs: MENU_LABEL_DISAPPEAR_MS });
		playLeftMenuGlitchSound(durationMs);
		scheduleFinish(durationMs, () => {
			label.prepareHidden();
			finishLabelHidden();

			if (!menuVisibleRef.current) {
				notifyMenuExitSettled();
				return;
			}

			const pending = animRef.current.pendingTarget;
			if (pending >= 0) {
				startAppearRef.current(pending);
			}
		});
	};

	const processQueueRef = useRef(() => {});

	processQueueRef.current = () => {
		const anim = animRef.current;

		if (anim.phase === "disappear" || anim.phase === "appear") {
			return;
		}

		const target = anim.pendingTarget;

		if (target < 0) {
			if (anim.shownIndex >= 0) {
				startDisappearRef.current(anim.shownIndex);
			}
			return;
		}

		if (anim.shownIndex < 0) {
			startAppearRef.current(target);
			return;
		}

		if (anim.shownIndex === target) {
			return;
		}

		startDisappearRef.current(anim.shownIndex);
	};

	const handleMenuHidden = () => {
		const anim = animRef.current;

		if (anim.phase === "disappear") {
			return;
		}

		if (anim.phase === "appear") {
			clearTimer();
			anim.phase = "idle";
			const closingIndex = anim.shownIndex >= 0 ? anim.shownIndex : displayedIndexRef.current;
			if (closingIndex >= 0) {
				startDisappearRef.current(closingIndex);
				return;
			}
		}

		if (anim.shownIndex >= 0) {
			startDisappearRef.current(anim.shownIndex);
			return;
		}

		if (displayedIndexRef.current >= 0) {
			startDisappearRef.current(displayedIndexRef.current);
			return;
		}

		resetAllLabels();
		notifyMenuExitSettled();
	};

	useLayoutEffect(() => {
		animRef.current.pendingTarget = targetIndex;

		if (!menuVisible) {
			handleMenuHidden();
			return;
		}

		processQueueRef.current();
	}, [targetIndex, menuVisible]);

	useLayoutEffect(() => {
		if (!menuVisible) {
			return;
		}

		const anim = animRef.current;
		if (anim.phase !== "idle" || anim.shownIndex < 0) {
			return;
		}

		applyFrameWidth(anim.shownIndex);
	}, [menuVisible, displayedIndex]);

	useEffect(() => {
		const onResize = () => {
			const anim = animRef.current;
			const widthIndex = anim.phase === "idle" && anim.shownIndex >= 0 ? anim.shownIndex : anim.phase === "disappear" || anim.phase === "appear" ? displayedIndex : -1;

			if (widthIndex >= 0) {
				applyFrameWidth(widthIndex);
			}
		};

		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [displayedIndex]);

	useEffect(() => {
		return () => {
			clearTimer();
		};
	}, []);

	const liveLabel = displayedIndex >= 0 ? items[displayedIndex]?.label : items[activeIndex]?.label;

	return (
		<span className="leftMenuTabLabelsStack">
			{items.map((item, index) => {
				if (item.disabled) {
					return null;
				}
				return (
					<LeftMenuGlitchLabel
						key={item.id}
						ref={(node) => {
							labelRefs.current[index] = node;
						}}
						text={item.label}
						active={index === activeIndex}
						isDisplayed={displayedIndex === index}
					/>
				);
			})}
			<span className="leftMenuGlitchLabelSrOnly">{liveLabel ?? ""}</span>
		</span>
	);
}

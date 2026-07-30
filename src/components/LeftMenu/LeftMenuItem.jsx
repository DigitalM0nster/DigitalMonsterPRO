import { useCallback, useEffect, useRef, useState } from "react";
import LeftMenuGlitchLabel from "./LeftMenuGlitchLabel.jsx";
import MenuIcon from "./MenuIcon.jsx";
import { getMenuEntrySnapOffset, MENU_SNAP_OFFSET } from "./leftMenuSnap.js";
import styles from "./LeftMenu.module.scss";

/**
 * Один пункт меню: круг, snap, иконка. Подпись — через props от LeftMenu (одна активная).
 */
export default function LeftMenuItem({
	item,
	isActive,
	disabled,
	isLabelDisplayed,
	isHomeNav = false,
	onNavigate,
	onHoverEnter,
	onHoverLeave,
	onLabelRef,
	buttonRef,
}) {
	const snappingRef = useRef(null);
	const labelRef = useRef(null);
	const [isHovered, setIsHovered] = useState(false);
	const [snapClass, setSnapClass] = useState("");

	const resolveSnapClass = useCallback((x, y) => {
		if (x === MENU_SNAP_OFFSET) {
			return styles.snapEast;
		}
		if (x === -MENU_SNAP_OFFSET) {
			return styles.snapWest;
		}
		if (y === MENU_SNAP_OFFSET) {
			return styles.snapSouth;
		}
		if (y === -MENU_SNAP_OFFSET) {
			return styles.snapNorth;
		}
		return "";
	}, []);

	const applyEntrySnap = useCallback(
		(clientX, clientY, buttonEl) => {
			if (!buttonEl) {
				return;
			}

			const { x, y } = getMenuEntrySnapOffset(clientX, clientY, buttonEl);
			setSnapClass(resolveSnapClass(x, y));
		},
		[resolveSnapClass],
	);

	const resetSnap = useCallback(() => {
		setSnapClass("");
	}, []);

	useEffect(() => {
		onLabelRef?.(labelRef.current);
		return () => onLabelRef?.(null);
	}, [onLabelRef]);

	const handlePointerEnter = (event) => {
		if (disabled) {
			return;
		}
		setIsHovered(true);
		applyEntrySnap(event.clientX, event.clientY, event.currentTarget);
		onHoverEnter?.({ clientX: event.clientX, clientY: event.clientY });
	};

	const handlePointerLeave = (event) => {
		if (disabled) {
			return;
		}
		setIsHovered(false);
		resetSnap();
		onHoverLeave?.(event);
	};

	const handleClick = () => {
		if (disabled || !item.path) {
			return;
		}
		onNavigate?.(item.path);
	};

	return (
		<button
			ref={buttonRef}
			type="button"
			className={[
				styles.itemButton,
				isActive && styles.active,
				disabled && styles.disabled,
			]
				.filter(Boolean)
				.join(" ")}
			{...(isHomeNav ? { "data-menu-home-button": true } : {})}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onClick={handleClick}
			aria-label={item.label}
			aria-current={isActive ? "page" : undefined}
			disabled={disabled}
		>
			<div ref={snappingRef} className={[styles.snapping, snapClass].filter(Boolean).join(" ")}>
				<span
					className={[styles.itemCircle, isActive && styles.current].filter(Boolean).join(" ")}
					data-menu-icon-circle
					aria-hidden="true"
				/>
				<span className={styles.itemSymbol} aria-hidden="true">
					<MenuIcon type={item.icon} />
				</span>
				<span
					className={[styles.itemLabel, isLabelDisplayed && styles.visible].filter(Boolean).join(" ")}
				>
					<LeftMenuGlitchLabel
						ref={labelRef}
						text={item.label}
						active={isActive || isHovered}
						isDisplayed={isLabelDisplayed}
					/>
				</span>
			</div>
		</button>
	);
}

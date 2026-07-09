import styles from "./LeftMenu.module.scss";

/**
 * Круглая кнопка внизу меню (звук, язык) — тот же визуальный язык, что у пунктов навигации.
 */
export default function LeftMenuUtilityButton({ ariaLabel, isActive, onClick, children }) {
	return (
		<button
			type="button"
			className={[styles.itemButton, styles.utilityButton, isActive && styles.active].filter(Boolean).join(" ")}
			onClick={onClick}
			aria-label={ariaLabel}
			aria-pressed={isActive}
		>
			<span
				className={[styles.itemCircle, isActive && styles.current].filter(Boolean).join(" ")}
				aria-hidden="true"
			/>
			<span className={styles.itemSymbol} aria-hidden="true">
				{children}
			</span>
		</button>
	);
}

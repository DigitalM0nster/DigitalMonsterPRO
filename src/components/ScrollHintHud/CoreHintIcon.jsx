import styles from "./ScrollHintHud.module.scss";

const SEGMENTS = [0, 120, 240];

/** Outline emblem: three shell segments around the exposed core. */
export default function CoreHintIcon() {
	return (
		<svg className={styles.coreIcon} viewBox="0 0 80 80" fill="none" aria-hidden="true" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
			<g className={styles.coreShell} strokeOpacity=".65">
				{SEGMENTS.map(angle => <path
					key={angle}
					transform={`rotate(${angle} 40 40)`}
					d="M33.3 14.9A26 26 0 0 1 65.1 33.3L59.3 34.8A20 20 0 0 0 34.8 20.7Z"
					strokeWidth="1"
					vectorEffect="non-scaling-stroke"
				/>)}
			</g>
			<circle className={styles.coreLight} cx="40" cy="40" r="12.6" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
		</svg>
	);
}

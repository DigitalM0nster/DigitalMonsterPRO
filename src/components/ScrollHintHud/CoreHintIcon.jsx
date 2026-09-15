import { useId } from "react";
import styles from "./ScrollHintHud.module.scss";

const SEGMENTS = [0, 120, 240];
const SEGMENT_PATH = "M33.3 14.9A26 26 0 0 1 65.1 33.3L59.3 34.8A20 20 0 0 0 34.8 20.7Z";

/** Outline emblem: three shell segments around the exposed core. */
export default function CoreHintIcon() {
	const id = useId();
	const surface = `${id}-surface`, mask = `${id}-sonar`;
	return (
		<svg className={styles.coreIcon} viewBox="0 0 80 80" fill="none" aria-hidden="true" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
			<defs>
				<g id={surface}>
					{SEGMENTS.map(angle => <path key={angle} transform={`rotate(${angle} 40 40)`} d={SEGMENT_PATH} />)}
				</g>
				<mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80" style={{ maskType: "alpha" }}>
					<use href={`#${surface}`} stroke="white" strokeWidth="2" />
					<circle cx="40" cy="40" r="12.6" stroke="white" strokeWidth="2" />
				</mask>
			</defs>
			<g strokeOpacity=".65">
				{SEGMENTS.map(angle => <path
					key={angle}
					transform={`rotate(${angle} 40 40)`}
					d={SEGMENT_PATH}
					strokeWidth="1"
					vectorEffect="non-scaling-stroke"
				/>)}
			</g>
			<circle className={styles.coreLight} cx="40" cy="40" r="12.6" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
			{/* Like the whale's sonar, light travels over the surface, not through empty space.
			    The prepared mask stays fixed; only this small wave's transform/opacity animate. */}
			<g mask={`url(#${mask})`} stroke="#b5f4ff">
				<g className={styles.coreSonar}>
					<circle cx="42" cy="43" r="8" strokeWidth="9" strokeOpacity=".18" vectorEffect="non-scaling-stroke" />
					<circle cx="42" cy="43" r="8" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
				</g>
			</g>
		</svg>
	);
}

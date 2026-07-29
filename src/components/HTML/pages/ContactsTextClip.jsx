import { TRANSITION_ANIMATED_ELEMENT_CLASS } from "@/utils/routeStagger.js";
import styles from "./ContactsPage.module.scss";

/**
 * Clip mask for contacts copy — overflow:hidden so enter/leave translates
 * slide text out of the line box (with route / scroll stagger on the inner).
 */
export default function ContactsTextClip({
	children,
	staggerI = 0,
	className = "",
	innerClassName = "",
}) {
	return (
		<div className={[styles.textClip, className].filter(Boolean).join(" ")}>
			<div
				className={[
					styles.textClipInner,
					TRANSITION_ANIMATED_ELEMENT_CLASS,
					innerClassName,
				]
					.filter(Boolean)
					.join(" ")}
				data-stagger-i={staggerI}
			>
				{children}
			</div>
		</div>
	);
}

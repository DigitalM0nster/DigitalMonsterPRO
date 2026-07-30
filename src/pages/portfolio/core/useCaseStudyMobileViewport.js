import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "../ui/CaseStudyCanvas/caseStudyCanvasTheme.js";

/**
 * @returns {boolean}
 */
export function readIsMobileViewport() {
	if (typeof window === "undefined") {
		return false;
	}
	return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * @param {boolean} [enabled]
 */
export function useCaseStudyMobileViewport(enabled = true) {
	const [isMobile, setIsMobile] = useState(() => (enabled ? readIsMobileViewport() : false));

	useEffect(() => {
		if (!enabled) {
			setIsMobile(false);
			return undefined;
		}

		const onResize = () => setIsMobile(readIsMobileViewport());
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [enabled]);

	return isMobile;
}

import { useEffect, useState } from "react";

export const RESPONSIVE_HUB_CASE_BREAKPOINT = 1024;

function readMatches() {
	if (typeof window === "undefined") {
		return false;
	}
	return window.matchMedia(`(max-width: ${RESPONSIVE_HUB_CASE_BREAKPOINT}px)`).matches;
}

export function useResponsiveHubCaseViewport() {
	const [matches, setMatches] = useState(readMatches);

	useEffect(() => {
		const query = window.matchMedia(`(max-width: ${RESPONSIVE_HUB_CASE_BREAKPOINT}px)`);
		const sync = () => setMatches(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	return matches;
}

import { resetCaseStudyArcFocusMotion } from "./caseStudyArcFocusMotion.js";
import { resetCaseStudyArcSelectSequence } from "./caseStudyArcSelectSequence.js";
import { caseStudyArcRuntime } from "./caseStudyArcConfig.js";

let source = null;

export function setSiteArcNavigationSource(nextSource) {
	const nextKey = nextSource?.key ?? null;
	const currentKey = source?.key ?? null;
	if (nextKey !== currentKey) {
		resetCaseStudyArcSelectSequence();
		resetCaseStudyArcFocusMotion();
	}
	source = nextSource?.items?.length ? nextSource : null;
	if (source) {
		caseStudyArcRuntime.introRotationDeg = 0;
		caseStudyArcRuntime.introOpacity = 1;
	}
}

export function getSiteArcNavigationSource() {
	return source;
}

export function isSiteArcNavigationActive() {
	return Boolean(source?.items?.length);
}

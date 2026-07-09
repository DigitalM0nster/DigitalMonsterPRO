import { normalizeSiteLocale } from "@/utils/siteLocale.js";

export function localizeCaseStudyState(state, locale) {
	if (!state) {
		return state;
	}

	const normalizedLocale = normalizeSiteLocale(locale);
	if (normalizedLocale === "ru") {
		return state;
	}

	const copy = state.localizedCopy?.[normalizedLocale];
	return copy ? { ...state, ...copy } : state;
}

export function localizeCaseStudyStates(states, locale) {
	return states.map((state) => localizeCaseStudyState(state, locale));
}

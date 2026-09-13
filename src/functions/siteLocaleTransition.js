import { store } from "@/app/store.jsx";
import { createLocaleTransition } from "./createLocaleTransition.js";
import { normalizeSiteLocale, getNextSiteLocale } from "./siteLocale.js";
import { requestSharedAnimationFrame } from "./sharedAnimationFrame.js";
import { siteLocaleReveal, siteLocaleTransitionState } from "./siteLocaleTransitionState.js";

const nextPaint = () => new Promise(resolve => requestSharedAnimationFrame(resolve));
function animate(to) {
	const from = siteLocaleReveal.value, duration = to ? 1150 : 480;
	return new Promise(resolve => {
		let previous = performance.now(), elapsed = 0;
		const tick = now => {
			elapsed += Math.max(0, Math.min(50, now - previous)); previous = now;
			const progress = Math.min(1, elapsed / duration);
			siteLocaleReveal.value = from + (to - from) * progress;
			if (progress < 1) requestSharedAnimationFrame(tick); else resolve();
		};
		requestSharedAnimationFrame(tick);
	});
}
export const siteLocaleTransition = createLocaleTransition({
	getLocale: () => normalizeSiteLocale(store.siteLocale),
	commit: locale => { store.siteLocale = locale; document.documentElement.lang = locale; },
	animate,
	afterCommit: async () => { await nextPaint(); await nextPaint(); },
	phaseChanged: (phase, target) => {
		siteLocaleTransitionState.phase = phase; siteLocaleTransitionState.target = target;
		store.siteLocaleTransitionPhase = phase;
		document.documentElement.dataset.localePhase = phase;
		if (phase === "idle") siteLocaleReveal.value = 1;
	},
});
export const registerSiteLocaleEffect = effect => siteLocaleTransition.register(effect);
export const waitLocaleEffect = duration => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(duration) || 0)));
export function requestSiteLocale(value) {
	const locale = normalizeSiteLocale(value);
	store.siteLocaleRequested = locale;
	if (!store.appStarted) { store.siteLocale = locale; return Promise.resolve(); }
	return siteLocaleTransition.request(locale);
}
export const cycleSiteLocale = () => requestSiteLocale(getNextSiteLocale(siteLocaleTransition.desired));

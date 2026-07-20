import { subscribe } from "valtio/vanilla";
import { store } from "@/store.jsx";
import { getPortfolioLocale } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";

/**
 * Смена языка на /portfolio (HUD-список, подписи на плитах, кнопка «Смотреть кейс»).
 *
 * Hub stays live as carousel `previous` after leave — never run snake/texture storms
 * while the user is on another page (home/about/contacts). Silent update only;
 * full animate when hub is the current ring page.
 */
export function createPortfolioHubLocaleSwitchController({
	getProjectsColumn,
	getPlateLabels,
	getPlateDetailsButtons,
	shouldAnimateLocale,
} = {}) {
	let displayedLocale = getPortfolioLocale();
	let desiredLocale = displayedLocale;
	let isSwitching = false;
	let trackedStoreLocale = store.siteLocale;

	const runLocaleSwitch = async () => {
		if (isSwitching || displayedLocale === desiredLocale) {
			return;
		}

		isSwitching = true;
		const targetLocale = desiredLocale;
		const animate = shouldAnimateLocale?.() === true;

		try {
			const projectsColumn = getProjectsColumn?.();
			const plateLabels = getPlateLabels?.();
			const plateDetailsButtons = getPlateDetailsButtons?.();

			if (!animate) {
				// Defer past the click/hero frame — zero canvas work, but don't contend with home snakes.
				await new Promise((resolve) => {
					requestAnimationFrame(() => resolve());
				});
				void projectsColumn?.switchLocale?.(targetLocale, { animate: false });
				void plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false });
				void plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false });
			} else {
				await Promise.all([
					projectsColumn?.switchLocale?.(targetLocale, { animate: true }),
					plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: true }),
					plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: true }),
				]);
			}
			displayedLocale = targetLocale;
		} catch (error) {
			console.error("[portfolioHubLocaleSwitch] locale switch failed", error);
		} finally {
			isSwitching = false;
			if (desiredLocale !== displayedLocale) {
				runLocaleSwitch();
			}
		}
	};

	const handleStoreUpdate = () => {
		if (store.siteLocale === trackedStoreLocale) {
			return;
		}

		trackedStoreLocale = store.siteLocale;
		desiredLocale = getPortfolioLocale();

		if (isSwitching) {
			return;
		}

		if (desiredLocale !== displayedLocale) {
			runLocaleSwitch();
		}
	};

	const unsubscribe = subscribe(store, handleStoreUpdate);

	return {
		dispose() {
			unsubscribe();
		},
		getDisplayedLocale() {
			return displayedLocale;
		},
		previewSwitchTo(locale) {
			desiredLocale = normalizeSiteLocale(locale);
			if (isSwitching || desiredLocale === displayedLocale) {
				return Promise.resolve();
			}
			return runLocaleSwitch();
		},
	};
}

import { subscribe } from "valtio/vanilla";
import { store } from "@/store.jsx";
import { getPortfolioLocale } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";

/**
 * Смена языка на /portfolio (HUD-список, подписи на плитах, кнопка «Смотреть кейс»).
 */
export function createPortfolioHubLocaleSwitchController({ getProjectsColumn, getPlateLabels, getPlateDetailsButtons } = {}) {
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

		try {
			const projectsColumn = getProjectsColumn?.();
			const plateLabels = getPlateLabels?.();
			const plateDetailsButtons = getPlateDetailsButtons?.();

			await Promise.all([
				projectsColumn?.switchLocale?.(targetLocale),
				plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig),
				plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig),
			]);
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

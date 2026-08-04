import { subscribe } from "valtio/vanilla";
import { store } from "@/app/store.jsx";
import { getPortfolioLocale } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
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
	getInnerPanels,
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
			const innerPanels = getInnerPanels?.();
			const casePanelIsActive = Number.isInteger(innerPanels?.activeProjectIndex)
				&& innerPanels.activeProjectIndex >= 0;

			if (!animate) {
				// Defer past the click/hero frame; hidden case screens only remember pending copy.
				await new Promise((resolve) => {
					requestAnimationFrame(() => resolve());
				});
				await Promise.all([
					projectsColumn?.switchLocale?.(targetLocale, { animate: false }),
					plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
					plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
					innerPanels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
				]);
			} else {
				// Exactly one visible text system owns the snake. On a case route the
				// selected screen animates while hidden hub labels only stash copy; on
				// /portfolio the existing projects column/plate labels keep ownership.
				await Promise.all(casePanelIsActive ? [
					projectsColumn?.switchLocale?.(targetLocale, { animate: false }),
					plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
					plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
					innerPanels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: true }),
				] : [
					projectsColumn?.switchLocale?.(targetLocale, { animate: true }),
					plateDetailsButtons?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: true }),
					plateLabels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: true }),
					innerPanels?.updateLocale?.(targetLocale, portfolioHubPlatesConfig, { animate: false }),
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

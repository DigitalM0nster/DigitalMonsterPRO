import { subscribe } from "valtio/vanilla";
import { store } from "@/app/store.jsx";
import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { resolveHeroTextPosition } from "./heroTextLayout.js";
import {
	getHeroLocale,
	getHeroStackFontFamily,
	getHeroStackLines,
	getHeroSubtitleFontFamily,
	getHeroTaglineLines,
} from "./heroTitleConfig.js";
import { getNextSiteLocale, normalizeSiteLocale } from "@/functions/siteLocale.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/functions/siteLocaleSwitch.js";

/**
 * Очередь смены языка для canvas hero-текстов (subtitle + stack).
 * Змейка только пока home — текущая страница; иначе мгновенная подмена.
 */
export function createHeroLocaleSwitchController({
	subtitle,
	stack,
	syncLayerPositions,
}) {
	let displayedLocale = getHeroLocale();
	let desiredLocale = displayedLocale;
	let isSwitching = false;
	let trackedStoreLocale = store.siteLocale;
	let currentSwitchPromise = Promise.resolve();

	const runLocaleSwitch = ({ animate = shouldAnimateSiteLocaleForRingScene("home") } = {}) => {
		if (isSwitching) {
			return currentSwitchPromise;
		}
		if (displayedLocale === desiredLocale) {
			return Promise.resolve();
		}

		isSwitching = true;
		const targetLocale = desiredLocale;

		currentSwitchPromise = (async () => {
			try {
				// Both layers together — tight glitch canvases keep this cheap enough.
				await Promise.all([
					subtitle.switchLocaleWithSnake(getHeroTaglineLines(targetLocale), {
						fontFamily: getHeroSubtitleFontFamily(targetLocale),
						animate,
					}),
					stack.switchLocaleWithSnake(getHeroStackLines(targetLocale), {
						fontFamily: getHeroStackFontFamily(targetLocale),
						animate,
					}),
				]);

				syncLayerPositions(resolveHeroTextPosition(heroTextPositionConfig));
				displayedLocale = targetLocale;
			} catch (error) {
				console.error("[heroLocaleSwitch] locale switch failed", error);
			} finally {
				isSwitching = false;
				// Hidden Home records locale changes without chasing them with
				// CanvasTexture uploads until it owns the screen again.
				if (
					desiredLocale !== displayedLocale
					&& shouldAnimateSiteLocaleForRingScene("home")
				) {
					void runLocaleSwitch();
				}
			}
		})();

		return currentSwitchPromise;
	};

	const handleStoreUpdate = () => {
		if (store.siteLocale === trackedStoreLocale) {
			return;
		}

		trackedStoreLocale = store.siteLocale;
		desiredLocale = getHeroLocale();

		if (
			isSwitching
			|| desiredLocale === displayedLocale
			|| !shouldAnimateSiteLocaleForRingScene("home")
		) {
			return;
		}

		void runLocaleSwitch({ animate: true });
	};

	const unsubscribe = subscribe(store, handleStoreUpdate);

	const controller = {
		dispose() {
			unsubscribe();
		},
		getDisplayedLocale() {
			return displayedLocale;
		},
		/** Apply a locale selected while Home was dormant, without a delayed snake. */
		syncLocaleForActivation() {
			desiredLocale = getHeroLocale();
			if (isSwitching) {
				return currentSwitchPromise.then(() => controller.syncLocaleForActivation());
			}
			return runLocaleSwitch({ animate: false });
		},
		/** Dev: смена языка без обновления store. */
		previewSwitchTo(locale) {
			desiredLocale = normalizeSiteLocale(locale);
			if (isSwitching || desiredLocale === displayedLocale) {
				return Promise.resolve();
			}
			return runLocaleSwitch({ animate: true });
		},
		previewCycleLocale() {
			return controller.previewSwitchTo(getNextSiteLocale(displayedLocale));
		},
	};

	return controller;
}

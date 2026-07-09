import { subscribe } from "valtio/vanilla";
import { store } from "@/store.jsx";
import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { resolveHeroTextPosition } from "./heroTextLayout.js";
import {
	getHeroLocale,
	getHeroStackFontFamily,
	getHeroStackLines,
	getHeroSubtitleFontFamily,
	getHeroTaglineLines,
} from "./heroTitleConfig.js";
import { getNextSiteLocale, normalizeSiteLocale } from "@/utils/siteLocale.js";

/**
 * Очередь смены языка для canvas hero-текстов (subtitle + stack).
 * Змейка — тот же GlitchSnakeEngine, что у portfolio CanvasGlitchText.
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

	const runLocaleSwitch = async () => {
		if (isSwitching || displayedLocale === desiredLocale) {
			return;
		}

		isSwitching = true;
		const targetLocale = desiredLocale;

		try {
			await Promise.all([
				subtitle.switchLocaleWithSnake(getHeroTaglineLines(targetLocale), {
					fontFamily: getHeroSubtitleFontFamily(targetLocale),
				}),
				stack.switchLocaleWithSnake(getHeroStackLines(targetLocale), {
					fontFamily: getHeroStackFontFamily(targetLocale),
				}),
			]);

			syncLayerPositions(resolveHeroTextPosition(heroTextPositionConfig));
			displayedLocale = targetLocale;
		} catch (error) {
			console.error("[heroLocaleSwitch] locale switch failed", error);
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
		desiredLocale = getHeroLocale();

		if (isSwitching) {
			return;
		}

		if (desiredLocale !== displayedLocale) {
			runLocaleSwitch();
		}
	};

	const unsubscribe = subscribe(store, handleStoreUpdate);

	const controller = {
		dispose() {
			unsubscribe();
		},
		getDisplayedLocale() {
			return displayedLocale;
		},
		/** Dev: смена языка без обновления store. */
		previewSwitchTo(locale) {
			desiredLocale = normalizeSiteLocale(locale);
			if (isSwitching || desiredLocale === displayedLocale) {
				return Promise.resolve();
			}
			return runLocaleSwitch();
		},
		previewCycleLocale() {
			return controller.previewSwitchTo(getNextSiteLocale(displayedLocale));
		},
	};

	return controller;
}

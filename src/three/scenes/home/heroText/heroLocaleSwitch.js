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
import { shouldAnimateSiteLocaleForRingScene } from "@/utils/siteLocaleSwitch.js";

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

	const runLocaleSwitch = async () => {
		if (isSwitching || displayedLocale === desiredLocale) {
			return;
		}

		isSwitching = true;
		const targetLocale = desiredLocale;
		const animate = shouldAnimateSiteLocaleForRingScene("home");

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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TOP_HUD_PAGE_LABEL_COPY } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale, SITE_LOCALES } from "@/utils/siteLocale.js";

import GlitchBilingualText from "../GlitchBilingualText.jsx";
import {
	abortGlitchSnake,
	getLetterAnimDuration,
	getLetterStartDelay,
	getSnakeLength,
	runGlitchSnake,
} from "../glitchSnakeAnimation.js";
import { playGlitchTextSound, TOP_HUD_GLITCH_SOUND_PAN } from "@/sounds/soundDesign.js";
import { resolveTopHudCaseCrumb, resolveTopHudPageTitle } from "./siteTopHudPageTitle.js";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import styles from "./SiteTopHud.module.scss";

const TOP_HUD_CRUMB_SNAKE_OPTIONS = getHeroGlitchSnakeRunOptions({ playSound: false });
const CASE_SEPARATOR_TEXTS = { ru: "/", en: "/", zh: "/" };

function runTopHudCrumbSnake(group, mode, snakeLength) {
	return group
		? runGlitchSnake(group, mode, { ...TOP_HUD_CRUMB_SNAKE_OPTIONS, snakeLength })
		: 0;
}

function countGlitchLetters(...groups) {
	return groups.reduce((total, group) => {
		if (!group) {
			return total;
		}
		return total + group.querySelectorAll(".letterContainer:not(.space)").length;
	}, 0);
}

function estimateGroupSnakeDuration(group, snakeLength) {
	if (!group) {
		return 0;
	}
	const letters = [...group.querySelectorAll(".letterContainer:not(.space)")];
	if (letters.length === 0) {
		return 0;
	}
	const lastIndex = letters.length - 1;
	const replacementCount = letters[lastIndex].querySelectorAll(".additionalLetter").length;
	return getLetterStartDelay(lastIndex, snakeLength, replacementCount, TOP_HUD_CRUMB_SNAKE_OPTIONS)
		+ getLetterAnimDuration(replacementCount, TOP_HUD_CRUMB_SNAKE_OPTIONS);
}

function estimateTitleSnakeDuration(title) {
	const charCount = Array.from(title).filter((char) => char !== " ").length;
	if (charCount === 0) {
		return 0;
	}

	const lastIndex = charCount - 1;
	const snakeLength = getSnakeLength(charCount);
	const replacementCount = 3;
	return (
		getLetterStartDelay(lastIndex, snakeLength, replacementCount, TOP_HUD_CRUMB_SNAKE_OPTIONS) +
		getLetterAnimDuration(replacementCount, TOP_HUD_CRUMB_SNAKE_OPTIONS)
	);
}

/** Страница // Название — змейка при смене языка (как у блока «Звук»). */
// eslint-disable-next-line react/prop-types
export default function SiteTopHudPageRoute({ pathname, locale }) {
	const navigate = useNavigate();
	const normalizedLocale = normalizeSiteLocale(locale);
	const [breadcrumbLocale, setBreadcrumbLocale] = useState(normalizedLocale);
	const [managedLocaleAppear, setManagedLocaleAppear] = useState(false);
	const [displayedPathname, setDisplayedPathname] = useState(pathname);
	const [titlePaintReady, setTitlePaintReady] = useState(true);
	const [caseCrumbPaintReady, setCaseCrumbPaintReady] = useState(true);
	const [caseCrumbRenderHidden, setCaseCrumbRenderHidden] = useState(false);
	const titleRootRef = useRef(null);
	const caseSeparatorRootRef = useRef(null);
	const caseCrumbRootRef = useRef(null);
	const desiredPathnameRef = useRef(pathname);
	const displayedPathnameRef = useRef(pathname);
	const switchingRef = useRef(false);
	const waitingForAppearRef = useRef(false);
	const waitingAppearScopeRef = useRef("title");
	const timeoutRef = useRef(0);
	const caseCrumbPaintRafRef = useRef(0);
	const languageTimersRef = useRef([]);
	const languageSwitchingRef = useRef(false);
	const desiredLocaleRef = useRef(normalizedLocale);
	const languageSwitchStarterRef = useRef(null);
	const languageSnakeLengthRef = useRef(2);

	const getActiveTitleGroup = useCallback(() => {
		return titleRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`) ?? null;
	}, [breadcrumbLocale]);
	const getActiveCaseCrumbGroup = useCallback(() => {
		return caseCrumbRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`) ?? null;
	}, [breadcrumbLocale]);

	const playCrumbHover = useCallback((rootRef) => {
		if (languageSwitchingRef.current) {
			return;
		}
		const root = rootRef.current;
		const group = root?.querySelector(`.languageGroup.${breadcrumbLocale}`);
		if (!root || !group) {
			return;
		}

		runGlitchSnake(group, "hover", TOP_HUD_CRUMB_SNAKE_OPTIONS);
	}, [breadcrumbLocale]);

	const navigateFromCrumb = useCallback((targetPath) => {
		const fromPath = displayedPathnameRef.current;
		if (fromPath === targetPath) {
			return;
		}
		if (!requestHexNavigation(targetPath, fromPath)) {
			navigate(targetPath);
		}
	}, [navigate]);

	const clearLanguageTimers = useCallback(() => {
		languageTimersRef.current.forEach(window.clearTimeout);
		languageTimersRef.current = [];
	}, []);

	const scheduleLanguageStep = useCallback((callback, delay) => {
		const id = window.setTimeout(callback, Math.max(0, delay));
		languageTimersRef.current.push(id);
	}, []);

	const startBreadcrumbLanguageSwitch = useCallback(() => {
		if (languageSwitchingRef.current || desiredLocaleRef.current === breadcrumbLocale) {
			return;
		}

		languageSwitchingRef.current = true;
		const targetLocale = desiredLocaleRef.current;
		const baseOld = titleRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
		const separatorOld = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
		const caseOld = caseCrumbRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
		const baseNew = titleRootRef.current?.querySelector(`.languageGroup.${targetLocale}`);
		const separatorNew = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${targetLocale}`);
		const caseNew = caseCrumbRootRef.current?.querySelector(`.languageGroup.${targetLocale}`);
		const totalCrumbLetters = Math.max(
			countGlitchLetters(baseOld, separatorOld, caseOld),
			countGlitchLetters(baseNew, separatorNew, caseNew),
		);
		const sharedSnakeLength = getSnakeLength(totalCrumbLetters);
		languageSnakeLengthRef.current = sharedSnakeLength;
		const soundDuration =
			estimateGroupSnakeDuration(baseOld, sharedSnakeLength)
			+ Math.max(
				estimateGroupSnakeDuration(separatorOld, sharedSnakeLength),
				estimateGroupSnakeDuration(caseOld, sharedSnakeLength),
			)
			+ estimateGroupSnakeDuration(baseNew, sharedSnakeLength)
			+ Math.max(
				estimateGroupSnakeDuration(separatorNew, sharedSnakeLength),
				estimateGroupSnakeDuration(caseNew, sharedSnakeLength),
			);
		if (soundDuration > 0) {
			playGlitchTextSound(
				soundDuration,
				"route",
				TOP_HUD_GLITCH_SOUND_PAN,
				{ x: -0.45, y: 2.2, z: -0.45 },
				{ loopToDuration: true },
			);
		}
		const baseDisappearMs = runTopHudCrumbSnake(baseOld, "disappear", sharedSnakeLength);

		scheduleLanguageStep(() => {
			const separatorDisappearMs = runTopHudCrumbSnake(separatorOld, "disappear", sharedSnakeLength);
			const caseDisappearMs = Math.max(
				separatorDisappearMs,
				runTopHudCrumbSnake(caseOld, "disappear", sharedSnakeLength),
			);
			scheduleLanguageStep(() => {
				setManagedLocaleAppear(true);
				setBreadcrumbLocale(targetLocale);
			}, caseDisappearMs);
		}, baseDisappearMs);
	}, [breadcrumbLocale, scheduleLanguageStep]);
	languageSwitchStarterRef.current = startBreadcrumbLanguageSwitch;

	useEffect(() => {
		desiredLocaleRef.current = normalizedLocale;
		startBreadcrumbLanguageSwitch();
	}, [normalizedLocale, startBreadcrumbLanguageSwitch]);

	useLayoutEffect(() => {
		if (!managedLocaleAppear) {
			return;
		}

		// Children have already selected the new locale and prepared its letters
		// as hidden. Start the two appear snakes strictly from left to right.
		queueMicrotask(() => {
			const baseNew = titleRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
			const sharedSnakeLength = languageSnakeLengthRef.current;
			const baseAppearMs = runTopHudCrumbSnake(baseNew, "appear", sharedSnakeLength);
			scheduleLanguageStep(() => {
				const separatorNew = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
				const caseNew = caseCrumbRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
				const caseAppearMs = Math.max(
					runTopHudCrumbSnake(separatorNew, "appear", sharedSnakeLength),
					runTopHudCrumbSnake(caseNew, "appear", sharedSnakeLength),
				);
				scheduleLanguageStep(() => {
					setManagedLocaleAppear(false);
					languageSwitchingRef.current = false;
					languageSwitchStarterRef.current?.();
				}, caseAppearMs);
			}, baseAppearMs);
		});
	}, [breadcrumbLocale, managedLocaleAppear, scheduleLanguageStep]);

	const startRouteSwitch = useCallback(() => {
		if (switchingRef.current || desiredPathnameRef.current === displayedPathnameRef.current) {
			return;
		}

		const fromPathname = displayedPathnameRef.current;
		const targetPathname = desiredPathnameRef.current;
		const withinPortfolio = fromPathname.startsWith("/portfolio") && targetPathname.startsWith("/portfolio");

		if (withinPortfolio) {
			switchingRef.current = true;
			const activeCaseGroup = getActiveCaseCrumbGroup();
			const activeSeparatorGroup = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
			const nextCrumb = resolveTopHudCaseCrumb(targetPathname, normalizeSiteLocale(locale));
			const appearDuration = estimateTitleSnakeDuration(nextCrumb);
			const commitCasePath = () => {
				waitingForAppearRef.current = Boolean(nextCrumb);
				waitingAppearScopeRef.current = "case";
				if (nextCrumb) {
					setCaseCrumbPaintReady(false);
					setCaseCrumbRenderHidden(true);
				}
				displayedPathnameRef.current = targetPathname;
				setDisplayedPathname(targetPathname);
				if (!nextCrumb) {
					switchingRef.current = false;
					startRouteSwitch();
				}
			};

			if (!activeCaseGroup && !activeSeparatorGroup) {
				playGlitchTextSound(appearDuration, "route", TOP_HUD_GLITCH_SOUND_PAN, { x: -0.45, y: 2.2, z: -0.45 });
				commitCasePath();
				return;
			}

			const routeCrumbSnakeLength = getSnakeLength(countGlitchLetters(activeSeparatorGroup, activeCaseGroup));
			const disappearDuration = Math.max(
				runTopHudCrumbSnake(activeSeparatorGroup, "disappear", routeCrumbSnakeLength),
				runTopHudCrumbSnake(activeCaseGroup, "disappear", routeCrumbSnakeLength),
			);
			playGlitchTextSound(disappearDuration + appearDuration, "route", TOP_HUD_GLITCH_SOUND_PAN, { x: -0.45, y: 2.2, z: -0.45 });
			timeoutRef.current = window.setTimeout(commitCasePath, disappearDuration);
			return;
		}

		const activeGroup = getActiveTitleGroup();
		const activeSeparatorGroup = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
		const activeCaseGroup = getActiveCaseCrumbGroup();
		if (!activeGroup && !activeSeparatorGroup && !activeCaseGroup) {
			displayedPathnameRef.current = desiredPathnameRef.current;
			setDisplayedPathname(desiredPathnameRef.current);
			return;
		}

		switchingRef.current = true;
		const routeSnakeLength = getSnakeLength(
			countGlitchLetters(activeGroup, activeSeparatorGroup, activeCaseGroup),
		);
		const disappearDuration = Math.max(
			runTopHudCrumbSnake(activeGroup, "disappear", routeSnakeLength),
			runTopHudCrumbSnake(activeSeparatorGroup, "disappear", routeSnakeLength),
			runTopHudCrumbSnake(activeCaseGroup, "disappear", routeSnakeLength),
		);
		const targetTitle = resolveTopHudPageTitle(targetPathname, normalizeSiteLocale(locale));
		const appearDuration = estimateTitleSnakeDuration(targetTitle);
		playGlitchTextSound(
			disappearDuration + appearDuration,
			"route",
			TOP_HUD_GLITCH_SOUND_PAN,
			{ x: -0.45, y: 2.2, z: -0.45 },
		);
		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = 0;
			waitingForAppearRef.current = true;
			waitingAppearScopeRef.current = "title";
			setTitlePaintReady(false);
			displayedPathnameRef.current = targetPathname;
			setDisplayedPathname(targetPathname);
		}, disappearDuration);
	}, [getActiveCaseCrumbGroup, getActiveTitleGroup, locale]);

	useEffect(() => {
		desiredPathnameRef.current = pathname;
		startRouteSwitch();
	}, [pathname, startRouteSwitch]);

	useLayoutEffect(() => {
		if (!waitingForAppearRef.current) {
			return;
		}

		waitingForAppearRef.current = false;
		let appearDuration;
		if (waitingAppearScopeRef.current === "case") {
			const separatorGroup = caseSeparatorRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`);
			const caseGroup = getActiveCaseCrumbGroup();
			const routeCrumbSnakeLength = getSnakeLength(countGlitchLetters(separatorGroup, caseGroup));
			appearDuration = Math.max(
				runTopHudCrumbSnake(separatorGroup, "appear", routeCrumbSnakeLength),
				runTopHudCrumbSnake(caseGroup, "appear", routeCrumbSnakeLength),
			);
		} else {
			appearDuration = runTopHudCrumbSnake(getActiveTitleGroup(), "appear");
		}
		if (waitingAppearScopeRef.current === "case") {
			window.cancelAnimationFrame(caseCrumbPaintRafRef.current);
			caseCrumbPaintRafRef.current = window.requestAnimationFrame(() => {
				caseCrumbPaintRafRef.current = window.requestAnimationFrame(() => {
					caseCrumbPaintRafRef.current = 0;
					setCaseCrumbPaintReady(true);
				});
			});
		}
		setTitlePaintReady(true);
		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = 0;
			if (waitingAppearScopeRef.current === "case") {
				setCaseCrumbRenderHidden(false);
			}
			switchingRef.current = false;
			startRouteSwitch();
		}, appearDuration);
	}, [displayedPathname, getActiveCaseCrumbGroup, getActiveTitleGroup, startRouteSwitch]);

	useEffect(() => {
		const root = titleRootRef.current;
		return () => {
			window.clearTimeout(timeoutRef.current);
			window.cancelAnimationFrame(caseCrumbPaintRafRef.current);
			clearLanguageTimers();
			root?.querySelectorAll(".languageGroup").forEach((group) => abortGlitchSnake(group));
		};
	}, [clearLanguageTimers]);

	const pageTitleTexts = useMemo(() => {
		const texts = {};
		for (const loc of SITE_LOCALES) {
			texts[loc] = resolveTopHudPageTitle(displayedPathname, loc);
		}
		return texts;
	}, [displayedPathname]);

	const caseCrumbTexts = useMemo(() => {
		const texts = {};
		for (const loc of SITE_LOCALES) {
			texts[loc] = resolveTopHudCaseCrumb(displayedPathname, loc);
		}
		return texts;
	}, [displayedPathname]);

	const routeAria = useMemo(() => {
		const label = TOP_HUD_PAGE_LABEL_COPY[normalizedLocale] ?? TOP_HUD_PAGE_LABEL_COPY.ru;
		const title = pageTitleTexts[normalizedLocale] ?? pageTitleTexts.ru;
		const crumb = caseCrumbTexts[normalizedLocale] ?? caseCrumbTexts.ru;
		return `${label} ${title}${crumb ? ` / ${crumb}` : ""}`;
	}, [caseCrumbTexts, normalizedLocale, pageTitleTexts]);

	return (
		<span className={styles.pageRoute} aria-live="polite" aria-label={routeAria}>
			<GlitchBilingualText
				texts={TOP_HUD_PAGE_LABEL_COPY}
				locale={normalizedLocale}
				className={styles.pageLabel}
				alignEnd
			/>
			<span className={styles.pageSep} aria-hidden="true">
				{"//"}
			</span>
			<span className={`${styles.pageTitleTransition} ${titlePaintReady ? "" : styles.pageTitlePreparing}`}>
				<button
					type="button"
					ref={titleRootRef}
					className={styles.pageCrumbItem}
					onPointerEnter={() => playCrumbHover(titleRootRef)}
					onClick={() => navigateFromCrumb(displayedPathname.startsWith("/portfolio") ? "/portfolio" : displayedPathname)}
					aria-label={pageTitleTexts[normalizedLocale] ?? pageTitleTexts.ru}
				>
					<GlitchBilingualText
						texts={pageTitleTexts}
						locale={breadcrumbLocale}
						className={styles.pageTitle}
						hideActiveLettersOnTextMount={!titlePaintReady}
						sizeToActiveLocale
						managedLocaleTransition
						prepareManagedLocaleAppear={managedLocaleAppear}
					/>
				</button>
				{caseCrumbTexts[normalizedLocale] && (
					<button
						type="button"
						className={`${styles.pageCrumbItem} ${styles.pageCaseCrumb} ${caseCrumbPaintReady ? "" : styles.pageCaseCrumbPreparing}`}
						onClick={() => navigateFromCrumb(displayedPathname)}
						aria-label={caseCrumbTexts[normalizedLocale] ?? caseCrumbTexts.ru}
					>
						<span ref={caseSeparatorRootRef} className={styles.pageCaseSeparator} aria-hidden="true">
							<GlitchBilingualText
								texts={CASE_SEPARATOR_TEXTS}
								locale={breadcrumbLocale}
								className={styles.pageTitle}
								hideActiveLettersOnTextMount={!caseCrumbPaintReady}
								renderActiveLettersHidden={caseCrumbRenderHidden}
								sizeToActiveLocale
								managedLocaleTransition
								prepareManagedLocaleAppear={managedLocaleAppear}
							/>
						</span>
						<span
							ref={caseCrumbRootRef}
							className={styles.pageCaseTitle}
							onPointerEnter={() => playCrumbHover(caseCrumbRootRef)}
						>
							<GlitchBilingualText
								texts={caseCrumbTexts}
								locale={breadcrumbLocale}
								className={styles.pageTitle}
								hideActiveLettersOnTextMount={!caseCrumbPaintReady}
								renderActiveLettersHidden={caseCrumbRenderHidden}
								sizeToActiveLocale
								managedLocaleTransition
								prepareManagedLocaleAppear={managedLocaleAppear}
							/>
						</span>
					</button>
				)}
			</span>
		</span>
	);
}

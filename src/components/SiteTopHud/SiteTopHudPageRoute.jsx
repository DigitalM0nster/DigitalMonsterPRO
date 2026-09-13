import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TOP_HUD_PAGE_LABEL_TRANSLATIONS } from "@/app/localization/interfaceTranslations.js";
import { normalizeSiteLocale, SITE_LOCALES } from "@/functions/siteLocale.js";

import GlitchBilingualText from "@/components/GlitchText/GlitchBilingualText.jsx";
import {
	abortGlitchSnake,
	getLetterAnimDuration,
	getLetterStartDelay,
	getSnakeLength,
	runGlitchSnake,
} from "@/components/GlitchText/glitchSnakeAnimation.js";
import { playGlitchTextSound, TOP_HUD_GLITCH_SOUND_PAN } from "@/sounds/soundDesign.js";
import { resolveTopHudCaseCrumb, resolveTopHudPageTitle } from "./siteTopHudPageTitle.js";
import { requestHexNavigation } from "@/functions/hexNavigation.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import styles from "./SiteTopHud.module.scss";
import { isSiteLocaleTransitionActive } from "@/functions/siteLocaleTransitionState.js";

const TOP_HUD_CRUMB_SNAKE_OPTIONS = getHeroGlitchSnakeRunOptions({ playSound: false });
const TOP_HUD_CRUMB_SOUND_GAIN = 0.5;
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
	// Every crumb consumes the locale committed by the site transaction.
	const breadcrumbLocale = normalizedLocale;
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

	const getActiveTitleGroup = useCallback(() => {
		return titleRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`) ?? null;
	}, [breadcrumbLocale]);
	const getActiveCaseCrumbGroup = useCallback(() => {
		return caseCrumbRootRef.current?.querySelector(`.languageGroup.${breadcrumbLocale}`) ?? null;
	}, [breadcrumbLocale]);

	const playCrumbHover = useCallback((rootRef) => {
		if (isSiteLocaleTransitionActive()) {
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
		if (!requestHexNavigation(targetPath, fromPath) && fromPath !== targetPath) {
			navigate(targetPath);
		}
	}, [navigate]);

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
				playGlitchTextSound(appearDuration, "route", TOP_HUD_GLITCH_SOUND_PAN, { x: -0.45, y: 2.2, z: -0.45 }, { volumeGain: TOP_HUD_CRUMB_SOUND_GAIN });
				commitCasePath();
				return;
			}

			const routeCrumbSnakeLength = getSnakeLength(countGlitchLetters(activeSeparatorGroup, activeCaseGroup));
			const disappearDuration = Math.max(
				runTopHudCrumbSnake(activeSeparatorGroup, "disappear", routeCrumbSnakeLength),
				runTopHudCrumbSnake(activeCaseGroup, "disappear", routeCrumbSnakeLength),
			);
			playGlitchTextSound(disappearDuration + appearDuration, "route", TOP_HUD_GLITCH_SOUND_PAN, { x: -0.45, y: 2.2, z: -0.45 }, { volumeGain: TOP_HUD_CRUMB_SOUND_GAIN });
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
			{ volumeGain: TOP_HUD_CRUMB_SOUND_GAIN },
		);
		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = 0;
			waitingForAppearRef.current = true;
			waitingAppearScopeRef.current = "title";
			setTitlePaintReady(false);
			displayedPathnameRef.current = targetPathname;
			setDisplayedPathname(targetPathname);
		}, disappearDuration);
	}, [breadcrumbLocale, getActiveCaseCrumbGroup, getActiveTitleGroup, locale]);

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
	}, [breadcrumbLocale, displayedPathname, getActiveCaseCrumbGroup, getActiveTitleGroup, startRouteSwitch]);

	useEffect(() => {
		const root = titleRootRef.current;
		return () => {
			window.clearTimeout(timeoutRef.current);
			window.cancelAnimationFrame(caseCrumbPaintRafRef.current);
			root?.querySelectorAll(".languageGroup").forEach((group) => abortGlitchSnake(group));
		};
	}, []);

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
		const label = TOP_HUD_PAGE_LABEL_TRANSLATIONS[normalizedLocale] ?? TOP_HUD_PAGE_LABEL_TRANSLATIONS.ru;
		const title = pageTitleTexts[normalizedLocale] ?? pageTitleTexts.ru;
		const crumb = caseCrumbTexts[normalizedLocale] ?? caseCrumbTexts.ru;
		return `${label} ${title}${crumb ? ` / ${crumb}` : ""}`;
	}, [caseCrumbTexts, normalizedLocale, pageTitleTexts]);

	return (
		<span className={styles.pageRoute} aria-live="polite" aria-label={routeAria}>
			<GlitchBilingualText
				texts={TOP_HUD_PAGE_LABEL_TRANSLATIONS}
				locale={normalizedLocale}
				className={styles.pageLabel}
				managedLocaleTransition
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
							/>
						</span>
					</button>
				)}
			</span>
		</span>
	);
}

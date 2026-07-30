import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getGlitchReplacements } from "@/components/GlitchText/glitchLetterModel.js";
import {
	abortGlitchSnake,
	prepareGlitchAppearInScope,
	runGlitchLanguageSwitch,
	setLanguageGroupLettersVisible,
} from "./glitchSnakeAnimation.js";
import { getLanguageGroupLocale, normalizeSiteLocale, SITE_LOCALES } from "@/functions/siteLocale.js";
import "./glitchBilingualText.scss";

function getLetterCaseClass(letter) {
	if (letter.toLowerCase() === letter.toUpperCase()) {
		return "letterUpper";
	}
	return letter === letter.toLowerCase() ? "letterLower" : "letterUpper";
}

function renderLetters(text, renderMainLettersHidden = false) {
	return text.split("").map((letter, index) => {
		const replacements = getGlitchReplacements(letter);

		if (letter === " ") {
			return (
				<div key={index} className="letterContainer space">
					<div className={`mainLetter ${renderMainLettersHidden ? "hidden" : ""}`}>&nbsp;</div>
				</div>
			);
		}

		return (
			<div key={index} className={`letterContainer ${getLetterCaseClass(letter)}`}>
				<div className={`mainLetter ${renderMainLettersHidden ? "hidden" : ""}`}>{letter}</div>
				{replacements.split("").map((replacement, i) =>
					replacement === " " ? null : (
						<div key={i} className="additionalLetter">
							{replacement}
						</div>
					),
				)}
			</div>
		);
	});
}

/** Split for wrapWords: space-separated tokens, or short CJK chunks (no mid-word Latin). */
function getWrapParts(text) {
	const value = String(text);
	if (/\s/.test(value)) {
		return value.match(/\S+|\s+/g) ?? [value];
	}

	// No spaces (typical CJK): allow breaks every 2 characters, never 1-glyph lines from flex.
	const chars = [...value];
	const parts = [];
	for (let index = 0; index < chars.length; index += 2) {
		parts.push(chars.slice(index, index + 2).join(""));
	}
	return parts.length > 0 ? parts : [value];
}

/** Keep words/chunks intact so flex-wrap does not break one glyph per line. */
function renderTextContent(text, renderMainLettersHidden = false, wrapWords = false) {
	if (!wrapWords) {
		return renderLetters(text, renderMainLettersHidden);
	}

	const parts = getWrapParts(text);
	return parts.map((part, index) => {
		if (/^\s+$/.test(part)) {
			return (
				<div
					key={`space-${index}`}
					className="letterContainer space"
					style={{ width: `${0.35 * part.length}em` }}
				>
					<div className={`mainLetter ${renderMainLettersHidden ? "hidden" : ""}`}>&nbsp;</div>
				</div>
			);
		}

		return (
			<span key={`word-${index}`} className="languageGroupWord">
				{renderLetters(part, renderMainLettersHidden)}
			</span>
		);
	});
}

function renderLeadingSlot(leadingSlot, leadingGlitch) {
	if (!leadingSlot) {
		return null;
	}

	if (!leadingGlitch) {
		return <span className="glitchLeading">{leadingSlot}</span>;
	}

	const replacements = getGlitchReplacements("◈");

	return (
		<div className="letterContainer leadingLetter">
			<div className="mainLetter">{leadingSlot}</div>
			{replacements.split("").map((replacement, index) =>
				replacement === " " ? null : (
					<div key={index} className="additionalLetter">
						{replacement}
					</div>
				),
			)}
		</div>
	);
}

function syncLocaleVisibility(root, activeLocale) {
	if (!root) {
		return;
	}

	root.querySelectorAll(".languageGroup").forEach((group) => {
		const groupLocale = getLanguageGroupLocale(group);
		setLanguageGroupLettersVisible(group, groupLocale === activeLocale);
	});
}

/**
 * Glitch-текст с несколькими языками: при смене locale — змейка disappear → appear.
 */
export default function GlitchBilingualText({
	texts,
	locale,
	className = "",
	playSound = true,
	soundIntent,
	soundPan,
	soundSpatialPosition,
	soundVolumeGain,
	alignEnd = false,
	wrapWords = false,
	leadingSlot = null,
	leadingGlitch = false,
	hideActiveLettersOnTextMount = false,
	renderActiveLettersHidden = false,
	sizeToActiveLocale = false,
	managedLocaleTransition = false,
	prepareManagedLocaleAppear = false,
	localeSwitchDelayMs = 0,
	timeBudgetMs,
}) {
	const normalizedLocale = normalizeSiteLocale(locale);
	const rootRef = useRef(null);
	const groupRefs = useRef({});
	const desiredLocaleRef = useRef(normalizedLocale);
	const displayedLocaleRef = useRef(normalizedLocale);
	const [displayedLocale, setDisplayedLocale] = useState(normalizedLocale);
	const isAnimatingRef = useRef(false);
	const hasMountedRef = useRef(false);
	const switchDelayTimerRef = useRef(0);
	const hideActiveLettersOnTextMountRef = useRef(hideActiveLettersOnTextMount);
	hideActiveLettersOnTextMountRef.current = hideActiveLettersOnTextMount;
	const textsRef = useRef(texts);
	textsRef.current = texts;
	const [groupWidths, setGroupWidths] = useState({});

	const textSignature = useMemo(() => SITE_LOCALES.map((loc) => texts[loc] ?? "").join("\x00"), [texts]);

	const widestLocale = SITE_LOCALES.reduce((widest, loc) => {
		if ((groupWidths[loc] ?? 0) >= (groupWidths[widest] ?? 0)) {
			return loc;
		}
		return widest;
	}, SITE_LOCALES[0]);
	const relativeLocale = sizeToActiveLocale ? displayedLocale : widestLocale;

	const measureWidths = () => {
		if (isAnimatingRef.current) {
			return;
		}
		const nextWidths = {};
		for (const loc of SITE_LOCALES) {
			nextWidths[loc] = groupRefs.current[loc]?.offsetWidth ?? 0;
		}
		setGroupWidths(nextWidths);
	};

	const applyLocaleInstant = (toLocale) => {
		const root = rootRef.current;
		abortGlitchSnake(root);
		displayedLocaleRef.current = toLocale;
		setDisplayedLocale(toLocale);
		syncLocaleVisibility(root, toLocale);
		isAnimatingRef.current = false;
		measureWidths();
	};

	const tryStartLanguageSwitch = () => {
		const root = rootRef.current;
		const fromLocale = displayedLocaleRef.current;
		const toLocale = desiredLocaleRef.current;

		if (!root || fromLocale === toLocale) {
			return;
		}

		if (isAnimatingRef.current) {
			return;
		}

		const fromText = textsRef.current?.[fromLocale] ?? "";
		const toText = textsRef.current?.[toLocale] ?? "";
		// Identical copy — no DOM snake / timer storm.
		if (fromText === toText) {
			applyLocaleInstant(toLocale);
			return;
		}

		isAnimatingRef.current = true;
		runGlitchLanguageSwitch(root, fromLocale, toLocale, {
			playSound,
			soundIntent,
			soundPan,
			soundSpatialPosition,
			soundVolumeGain,
			timeBudgetMs,
			onBeforeAppear: () => {
				if (sizeToActiveLocale) {
					setDisplayedLocale(toLocale);
				}
			},
			onComplete: () => {
				displayedLocaleRef.current = toLocale;
				setDisplayedLocale(toLocale);
				isAnimatingRef.current = false;
				measureWidths();

				if (desiredLocaleRef.current !== toLocale) {
					tryStartLanguageSwitch();
				}
			},
		});
	};

	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) {
			return;
		}

		window.clearTimeout(switchDelayTimerRef.current);
		abortGlitchSnake(root);
		desiredLocaleRef.current = normalizedLocale;
		displayedLocaleRef.current = normalizedLocale;
		setDisplayedLocale(normalizedLocale);
		syncLocaleVisibility(root, normalizedLocale);
		if (hideActiveLettersOnTextMountRef.current) {
			prepareGlitchAppearInScope(groupRefs.current[normalizedLocale]);
		}
		hasMountedRef.current = true;
		isAnimatingRef.current = false;
		measureWidths();
	}, [textSignature]);

	useLayoutEffect(() => {
		if (!hasMountedRef.current) {
			return undefined;
		}

		desiredLocaleRef.current = normalizedLocale;
		window.clearTimeout(switchDelayTimerRef.current);

		if (managedLocaleTransition) {
			applyLocaleInstant(normalizedLocale);
			if (prepareManagedLocaleAppear) {
				prepareGlitchAppearInScope(groupRefs.current[normalizedLocale]);
			}
			return undefined;
		}

		if (isAnimatingRef.current) {
			return undefined;
		}

		if (normalizedLocale === displayedLocaleRef.current) {
			return undefined;
		}

		const delay = Math.max(0, Number(localeSwitchDelayMs) || 0);
		if (delay <= 0) {
			tryStartLanguageSwitch();
			return undefined;
		}

		switchDelayTimerRef.current = window.setTimeout(() => {
			if (desiredLocaleRef.current !== displayedLocaleRef.current && !isAnimatingRef.current) {
				tryStartLanguageSwitch();
			}
		}, delay);

		return () => {
			window.clearTimeout(switchDelayTimerRef.current);
		};
	}, [managedLocaleTransition, normalizedLocale, prepareManagedLocaleAppear, localeSwitchDelayMs]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root || typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const observer = new ResizeObserver(() => {
			measureWidths();
		});

		for (const loc of SITE_LOCALES) {
			const group = groupRefs.current[loc];
			if (group) {
				observer.observe(group);
			}
		}

		return () => observer.disconnect();
	}, [textSignature]);

	useEffect(() => {
		return () => {
			window.clearTimeout(switchDelayTimerRef.current);
			abortGlitchSnake(rootRef.current);
		};
	}, []);

	return (
		<div
			ref={rootRef}
			className={[
				"glitchBilingualText",
				"wordContainer",
				"relative",
				alignEnd && "alignEnd",
				wrapWords && "wrapWords",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{SITE_LOCALES.map((loc) => {
				const text = texts[loc];
				if (!text) {
					return null;
				}

				const hideActive = renderActiveLettersHidden && displayedLocale === loc;
				const content = leadingSlot ? (
					<div className="languageGroupRow">
						{renderLeadingSlot(leadingSlot, leadingGlitch)}
						<span className="languageGroupLetters">
							{renderTextContent(text, hideActive, wrapWords)}
						</span>
					</div>
				) : (
					renderTextContent(text, hideActive, wrapWords)
				);

				return (
					<div
						key={loc}
						ref={(node) => {
							groupRefs.current[loc] = node;
						}}
						className={[
							"languageGroup",
							loc,
							displayedLocale === loc && "active",
							relativeLocale === loc && "relative",
						]
							.filter(Boolean)
							.join(" ")}
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}

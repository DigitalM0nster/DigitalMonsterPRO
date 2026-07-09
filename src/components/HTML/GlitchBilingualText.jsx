import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getGlitchReplacements } from "@/shared/glitchText/glitchLetterModel.js";
import {
	abortGlitchSnake,
	prepareGlitchAppearInScope,
	runGlitchLanguageSwitch,
	setLanguageGroupLettersVisible,
} from "./glitchSnakeAnimation.js";
import { getLanguageGroupLocale, normalizeSiteLocale, SITE_LOCALES } from "@/utils/siteLocale.js";
import "./glitchBilingualText.scss";

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
			<div key={index} className="letterContainer">
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
	}	);
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
 * @param {{ texts: Partial<Record<import('@/utils/siteLocale.js').SiteLocale, string>>, locale: string, className?: string, playSound?: boolean, alignEnd?: boolean, leadingSlot?: import('react').ReactNode, leadingGlitch?: boolean, hideActiveLettersOnTextMount?: boolean, renderActiveLettersHidden?: boolean, sizeToActiveLocale?: boolean, managedLocaleTransition?: boolean, prepareManagedLocaleAppear?: boolean }} props
 */
export default function GlitchBilingualText({
	texts,
	locale,
	className = "",
	playSound = true,
	alignEnd = false,
	leadingSlot = null,
	leadingGlitch = false,
	hideActiveLettersOnTextMount = false,
	renderActiveLettersHidden = false,
	sizeToActiveLocale = false,
	managedLocaleTransition = false,
	prepareManagedLocaleAppear = false,
}) {
	const normalizedLocale = normalizeSiteLocale(locale);
	const rootRef = useRef(null);
	const groupRefs = useRef({});
	const desiredLocaleRef = useRef(normalizedLocale);
	const displayedLocaleRef = useRef(normalizedLocale);
	const [displayedLocale, setDisplayedLocale] = useState(normalizedLocale);
	const isAnimatingRef = useRef(false);
	const hasMountedRef = useRef(false);
	const hideActiveLettersOnTextMountRef = useRef(hideActiveLettersOnTextMount);
	hideActiveLettersOnTextMountRef.current = hideActiveLettersOnTextMount;
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
		const nextWidths = {};
		for (const loc of SITE_LOCALES) {
			nextWidths[loc] = groupRefs.current[loc]?.offsetWidth ?? 0;
		}
		setGroupWidths(nextWidths);
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

		isAnimatingRef.current = true;
		runGlitchLanguageSwitch(root, fromLocale, toLocale, {
			playSound,
			onBeforeAppear: () => {
				if (sizeToActiveLocale) {
					setDisplayedLocale(toLocale);
				}
			},
			onComplete: () => {
				displayedLocaleRef.current = toLocale;
				setDisplayedLocale(toLocale);
				isAnimatingRef.current = false;

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

		abortGlitchSnake(root);
		desiredLocaleRef.current = normalizedLocale;
		displayedLocaleRef.current = normalizedLocale;
		setDisplayedLocale(normalizedLocale);
		syncLocaleVisibility(root, normalizedLocale);
		// Route crumbs are animated by their parent immediately after this text is
		// mounted. Keep the active letters hidden here as part of the child's own
		// layout lifecycle, so effect ordering can never expose the complete word
		// for one paint before the snake starts.
		if (hideActiveLettersOnTextMountRef.current) {
			prepareGlitchAppearInScope(groupRefs.current[normalizedLocale]);
		}
		hasMountedRef.current = true;
		isAnimatingRef.current = false;
		measureWidths();
	}, [textSignature]);

	useLayoutEffect(() => {
		if (!hasMountedRef.current) {
			return;
		}

		desiredLocaleRef.current = normalizedLocale;
		if (managedLocaleTransition) {
			const root = rootRef.current;
			abortGlitchSnake(root);
			displayedLocaleRef.current = normalizedLocale;
			setDisplayedLocale(normalizedLocale);
			syncLocaleVisibility(root, normalizedLocale);
			if (prepareManagedLocaleAppear) {
				prepareGlitchAppearInScope(groupRefs.current[normalizedLocale]);
			}
			return;
		}

		if (isAnimatingRef.current) {
			return;
		}

		if (normalizedLocale !== displayedLocaleRef.current) {
			tryStartLanguageSwitch();
		}
	}, [managedLocaleTransition, normalizedLocale, prepareManagedLocaleAppear]);

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
			abortGlitchSnake(rootRef.current);
		};
	}, []);

	return (
		<div
			ref={rootRef}
			className={["glitchBilingualText", "wordContainer", "relative", alignEnd && "alignEnd", className]
				.filter(Boolean)
				.join(" ")}
		>
			{SITE_LOCALES.map((loc) => {
				const text = texts[loc];
				if (!text) {
					return null;
				}

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
						{leadingSlot ? (
							<div className="languageGroupRow">
								{renderLeadingSlot(leadingSlot, leadingGlitch)}
								<span className="languageGroupLetters">{renderLetters(text, renderActiveLettersHidden && displayedLocale === loc)}</span>
							</div>
						) : (
							renderLetters(text, renderActiveLettersHidden && displayedLocale === loc)
						)}
					</div>
				);
			})}
		</div>
	);
}

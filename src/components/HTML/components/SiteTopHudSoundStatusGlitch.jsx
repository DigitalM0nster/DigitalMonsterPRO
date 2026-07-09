import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { getGlitchReplacements } from "@/shared/glitchText/glitchLetterModel.js";

import {

	abortGlitchSnake,

	runGlitchGroupSwitch,

	setLanguageGroupLettersVisible,

} from "../glitchSnakeAnimation.js";

import { getTopHudSoundStatus } from "@/i18n/siteCopy.js";

import { notifySoundStatusSnakeSettled } from "@/sounds/siteSoundToggle.js";

import { normalizeSiteLocale, SITE_LOCALES } from "@/utils/siteLocale.js";

import "../glitchBilingualText.scss";



const STATE_KEYS = ["on", "off"];



function groupKey(state, locale) {

	return `${state}-${locale}`;

}



function renderLetters(text) {

	return text.split("").map((letter, index) => {

		const replacements = getGlitchReplacements(letter);



		if (letter === " ") {

			return (

				<div key={index} className="letterContainer space">

					<div className="mainLetter">&nbsp;</div>

				</div>

			);

		}



		return (

			<div key={index} className="letterContainer">

				<div className="mainLetter">{letter}</div>

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



function syncDisplayedVisibility(root, state, locale) {

	if (!root) {

		return;

	}



	for (const stateKey of STATE_KEYS) {

		for (const loc of SITE_LOCALES) {

			const group = root.querySelector(`.languageGroup.${stateKey}.${loc}`);

			setLanguageGroupLettersVisible(group, stateKey === state && loc === locale);

		}

	}

}



/** Glitch-статус «вкл/выкл»: змейка при смене звука и при смене языка. */

export default function SiteTopHudSoundStatusGlitch({ active, locale, playSound = true }) {

	const normalizedLocale = normalizeSiteLocale(locale);

	const activeKey = active ? "on" : "off";



	const rootRef = useRef(null);

	const groupRefs = useRef({});

	const desiredStateRef = useRef(activeKey);

	const desiredLocaleRef = useRef(normalizedLocale);

	const displayedStateRef = useRef(activeKey);

	const displayedLocaleRef = useRef(normalizedLocale);

	const [displayedState, setDisplayedState] = useState(activeKey);

	const [displayedLocale, setDisplayedLocale] = useState(normalizedLocale);

	const isAnimatingRef = useRef(false);

	const hasMountedRef = useRef(false);

	const [groupWidths, setGroupWidths] = useState({});



	const textsByLocale = useMemo(() => {

		const result = {};

		for (const loc of SITE_LOCALES) {

			result[loc] = {

				on: getTopHudSoundStatus(true, loc),

				off: getTopHudSoundStatus(false, loc),

			};

		}

		return result;

	}, []);



	const textSignature = useMemo(

		() =>

			SITE_LOCALES.flatMap((loc) => [textsByLocale[loc].on, textsByLocale[loc].off]).join("\x00"),

		[textsByLocale],

	);



	const widestGroupKey = Object.keys(groupWidths).reduce((widest, key) => {

		if ((groupWidths[key] ?? 0) >= (groupWidths[widest] ?? 0)) {

			return key;

		}

		return widest;

	}, groupKey(STATE_KEYS[0], SITE_LOCALES[0]));



	const measureWidths = () => {

		const nextWidths = {};

		for (const stateKey of STATE_KEYS) {

			for (const loc of SITE_LOCALES) {

				const key = groupKey(stateKey, loc);

				nextWidths[key] = groupRefs.current[key]?.offsetWidth ?? 0;

			}

		}

		setGroupWidths(nextWidths);

	};



	const tryStartPendingSwitch = () => {

		if (desiredStateRef.current !== displayedStateRef.current) {

			tryStartStateSwitch();

			return;

		}



		if (desiredLocaleRef.current !== displayedLocaleRef.current) {

			tryStartLocaleSwitch();

		}

	};



	const tryStartStateSwitch = () => {

		const root = rootRef.current;

		const fromState = displayedStateRef.current;

		const toState = desiredStateRef.current;

		const loc = displayedLocaleRef.current;



		if (!root || fromState === toState || isAnimatingRef.current) {

			return;

		}



		const fromGroup = groupRefs.current[groupKey(fromState, loc)];

		const toGroup = groupRefs.current[groupKey(toState, loc)];



		if (!fromGroup || !toGroup) {

			return;

		}



		isAnimatingRef.current = true;

		runGlitchGroupSwitch(root, fromGroup, toGroup, {

			playSound,

			onComplete: () => {

				displayedStateRef.current = toState;

				setDisplayedState(toState);

				isAnimatingRef.current = false;

				notifySoundStatusSnakeSettled(toState);

				tryStartPendingSwitch();

			},

		});

	};



	const tryStartLocaleSwitch = () => {

		const root = rootRef.current;

		const state = displayedStateRef.current;

		const fromLocale = displayedLocaleRef.current;

		const toLocale = desiredLocaleRef.current;



		if (!root || fromLocale === toLocale || isAnimatingRef.current) {

			return;

		}



		const fromGroup = groupRefs.current[groupKey(state, fromLocale)];

		const toGroup = groupRefs.current[groupKey(state, toLocale)];



		if (!fromGroup || !toGroup) {

			return;

		}



		isAnimatingRef.current = true;

		runGlitchGroupSwitch(root, fromGroup, toGroup, {

			playSound,

			onComplete: () => {

				displayedLocaleRef.current = toLocale;

				setDisplayedLocale(toLocale);

				isAnimatingRef.current = false;

				tryStartPendingSwitch();

			},

		});

	};



	useLayoutEffect(() => {

		const root = rootRef.current;

		if (!root) {

			return;

		}



		abortGlitchSnake(root);

		desiredStateRef.current = activeKey;

		desiredLocaleRef.current = normalizedLocale;

		displayedStateRef.current = activeKey;

		displayedLocaleRef.current = normalizedLocale;

		setDisplayedState(activeKey);

		setDisplayedLocale(normalizedLocale);

		syncDisplayedVisibility(root, activeKey, normalizedLocale);

		hasMountedRef.current = true;

		isAnimatingRef.current = false;

		measureWidths();

	}, [textSignature]);



	useLayoutEffect(() => {

		if (!hasMountedRef.current) {

			return;

		}



		desiredStateRef.current = activeKey;



		if (isAnimatingRef.current) {

			return;

		}



		if (activeKey !== displayedStateRef.current) {

			tryStartStateSwitch();

		}

	}, [activeKey]);



	useLayoutEffect(() => {

		if (!hasMountedRef.current) {

			return;

		}



		desiredLocaleRef.current = normalizedLocale;



		if (isAnimatingRef.current) {

			return;

		}



		if (normalizedLocale !== displayedLocaleRef.current) {

			tryStartLocaleSwitch();

		}

	}, [normalizedLocale]);



	useEffect(() => {

		const root = rootRef.current;

		if (!root || typeof ResizeObserver === "undefined") {

			return undefined;

		}



		const observer = new ResizeObserver(() => {

			measureWidths();

		});



		for (const key of Object.keys(groupRefs.current)) {

			const group = groupRefs.current[key];

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

			className="glitchBilingualText wordContainer relative"

			aria-hidden="true"

		>

			{STATE_KEYS.flatMap((stateKey) =>

				SITE_LOCALES.map((loc) => {

					const key = groupKey(stateKey, loc);

					const isDisplayed = displayedState === stateKey && displayedLocale === loc;



					return (

						<div

							key={key}

							ref={(node) => {

								groupRefs.current[key] = node;

							}}

							className={[

								"languageGroup",

								stateKey,

								loc,

								isDisplayed && "active",

								widestGroupKey === key && "relative",

							]

								.filter(Boolean)

								.join(" ")}

						>

							{renderLetters(textsByLocale[loc][stateKey])}

						</div>

					);

				}),

			)}

		</div>

	);

}



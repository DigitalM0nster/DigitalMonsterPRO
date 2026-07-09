import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { glitchLetterReplacements } from "../glitchLetterReplacements.js";
import {
	prepareGlitchAppear,
	restoreGlitchLettersVisible,
	runGlitchSnake,
} from "../glitchSnakeAnimation.js";

function getReplacements(letter) {
	if (letter === " ") {
		return " ";
	}
	return glitchLetterReplacements[letter.toUpperCase()] ?? "";
}

/**
 * Глитч-текст: hover-змейка + appear/disappear для переходов страницы.
 * @param {{ text: string, hoverTriggerRef?: import('react').RefObject<HTMLElement>, className?: string, initialHidden?: boolean }} props
 */
const GlitchText = forwardRef(function GlitchText(
	{ text, hoverTriggerRef, className = "", initialHidden = false },
	ref,
) {
	const wordRef = useRef(null);
	const initialHiddenAppliedRef = useRef(false);

	const triggerGlitch = useCallback(() => {
		runGlitchSnake(wordRef.current, "hover");
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			playAppear(timeBudgetMs) {
				return runGlitchSnake(wordRef.current, "appear", { timeBudgetMs });
			},
			playDisappear(timeBudgetMs) {
				return runGlitchSnake(wordRef.current, "disappear", { timeBudgetMs });
			},
			restoreVisible() {
				restoreGlitchLettersVisible(wordRef.current);
			},
		}),
		[],
	);

	// До первой appear-анимации буквы скрыты (без «мигания» текста).
	useLayoutEffect(() => {
		if (!initialHidden || initialHiddenAppliedRef.current) {
			return;
		}
		prepareGlitchAppear(wordRef.current);
		initialHiddenAppliedRef.current = true;
	}, [initialHidden, text]);

	useEffect(() => {
		if (!hoverTriggerRef) {
			return undefined;
		}

		const element =
			hoverTriggerRef instanceof HTMLElement
				? hoverTriggerRef
				: hoverTriggerRef.current;
		if (!element) {
			return undefined;
		}

		element.addEventListener("mouseenter", triggerGlitch);
		return () => {
			element.removeEventListener("mouseenter", triggerGlitch);
		};
	}, [hoverTriggerRef, triggerGlitch]);

	const renderLetters = (value) =>
		value.split("").map((letter, index) => {
			const replacements = getReplacements(letter);

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

	return (
		<div
			className={["glitchText", "wordContainer", "relative", className]
				.filter(Boolean)
				.join(" ")}
			ref={wordRef}
		>
			<div className="languageGroup active relative">{renderLetters(text)}</div>
		</div>
	);
});

export default GlitchText;

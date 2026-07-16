import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { glitchLetterReplacements } from "@/components/HTML/glitchLetterReplacements.js";
import {
	abortAtenCharSnake,
	prepareAtenHidden,
	restoreAtenVisible,
	runAtenCharSnake,
} from "./atenCharSnakeAnimation.js";
import "./leftMenuGlitchText.scss";

/** Два glitch-символа на букву — как span.symbol у Aten7. */
function getAtenSymbols(letter) {
	if (letter === " ") {
		return [];
	}
	const replacements = glitchLetterReplacements[letter.toUpperCase()] ?? "XY";
	const chars = replacements.split("").filter((char) => char !== " ");
	return [chars[0] ?? "X", chars[1] ?? chars[0] ?? "Y"];
}

/** Разбивает текст на слова и пробелы — отдельные inline-block группы как у Aten7. */
function splitTextSegments(text) {
	return text.match(/\S+|\s+/g) ?? [];
}

function renderCharElement(letter, key) {
	if (letter === " ") {
		return (
			<span key={key} className="charElement charSpace" aria-hidden="true">
				<span className="letter">&nbsp;</span>
			</span>
		);
	}

	const symbols = getAtenSymbols(letter);

	return (
		<span key={key} className="charElement" aria-hidden="true">
			<span className="letter">{letter}</span>
			{symbols.map((symbol, index) => (
				<span key={index} className="symbol">
					{symbol}
				</span>
			))}
		</span>
	);
}

function renderCharBlock(text) {
	const segments = splitTextSegments(text);
	let charIndex = 0;

	return segments.map((segment, segmentIndex) => {
		if (/^\s+$/.test(segment)) {
			return (
				<span key={`space-${segmentIndex}`} className="charWord charWordSpace">
					{segment.split("").map((space) => renderCharElement(space, `c-${charIndex++}`))}
				</span>
			);
		}

		return (
			<span key={`word-${segmentIndex}`} className="charWord">
				{segment.split("").map((letter) => renderCharElement(letter, `c-${charIndex++}`))}
			</span>
		);
	});
}

/** Подпись пункта меню — разметка и анимация как char__wrapper у Aten7 timeline. */
const LeftMenuGlitchLabel = forwardRef(function LeftMenuGlitchLabel(
	{ text, active = false, isDisplayed = false, reverse = false },
	ref,
) {
	const rootRef = useRef(null);

	useLayoutEffect(() => {
		prepareAtenHidden(rootRef.current);
	}, [text]);

	useImperativeHandle(
		ref,
		() => ({
			playAppear(options = {}) {
				return runAtenCharSnake(rootRef.current, "appear", { ...options, reverseOrder: reverse });
			},
			playDisappear(options = {}) {
				return runAtenCharSnake(rootRef.current, "disappear", { ...options, reverseOrder: reverse });
			},
			playHover(options = {}) {
				return runAtenCharSnake(rootRef.current, "hover", { ...options, reverseOrder: reverse });
			},
			cancelAndHide() {
				const root = rootRef.current;
				if (!root) {
					return;
				}
				abortAtenCharSnake(root);
				prepareAtenHidden(root);
			},
			prepareHidden() {
				const root = rootRef.current;
				if (!root) {
					return;
				}
				abortAtenCharSnake(root);
				prepareAtenHidden(root);
			},
			restoreVisible() {
				restoreAtenVisible(rootRef.current);
			},
			getContentWidth() {
				return rootRef.current?.querySelector(".charProxy")?.scrollWidth ?? 0;
			},
		}),
		[reverse],
	);

	return (
		<span
			ref={rootRef}
			className={[
				"leftMenuGlitchLabel",
				"charWrapper",
				active && "active",
				isDisplayed && "isDisplayed",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<span className="char" aria-hidden="true">
				<span className="charBlock">{renderCharBlock(text)}</span>
			</span>
			<span className="charProxy" aria-hidden="true">
				{text}
			</span>
		</span>
	);
});

export default LeftMenuGlitchLabel;

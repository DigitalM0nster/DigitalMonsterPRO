import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "@/app/store.jsx";
import {
	SITE_LOCALES,
	getSiteLocaleLabel,
	normalizeSiteLocale,
} from "@/functions/siteLocale.js";
import { requestSiteLocale } from "@/functions/siteLocaleTransition.js";
import { clearMenuCursorAnchor, setMenuElementCursorAnchor } from "./leftMenuCursorAnchor.js";
import styles from "./LeftMenuLanguageButton.module.scss";

const LANGUAGE_NAMES = { ru: "Русский", en: "English", zh: "中文" };
const PICKER_LABELS = { ru: "Выбрать язык", en: "Choose language", zh: "选择语言" };

export default function LeftMenuLanguageButton() {
	const store = useStore();
	const currentLocale = normalizeSiteLocale(store.siteLocale);
	// The control acknowledges the latest request while scene animations finish their cycle.
	const selectedLocale = normalizeSiteLocale(store.siteLocaleRequested ?? currentLocale);
	const [isOpen, setIsOpen] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const rootRef = useRef(null);
	const triggerRef = useRef(null);
	const closeTimerRef = useRef(null);
	const hoveredKeyRef = useRef(null);
	const suppressHoverRef = useRef(false);
	const optionsId = useId();

	const cancelClose = () => clearTimeout(closeTimerRef.current);
	const releaseCursor = () => {
		if (hoveredKeyRef.current) clearMenuCursorAnchor(hoveredKeyRef.current);
		hoveredKeyRef.current = null;
	};
	const close = () => {
		cancelClose();
		releaseCursor();
		setIsOpen(false);
	};
	const open = () => {
		cancelClose();
		setDismissed(false);
		setIsOpen(true);
	};
	const anchorCursor = (button, key) => {
		hoveredKeyRef.current = key;
		setMenuElementCursorAnchor(button.querySelector("[data-language-circle]"), key);
	};
	const handleCircleEnter = (event, key) => {
		if (event.pointerType === "mouse") anchorCursor(event.currentTarget, key);
	};
	const handleCircleSettled = (event, key) => {
		if (event.target === event.currentTarget && event.propertyName === "transform" && hoveredKeyRef.current === key) {
			anchorCursor(event.currentTarget, key);
		}
	};

	useEffect(() => {
		document.documentElement.lang = currentLocale;
	}, [currentLocale]);

	useEffect(() => () => {
		clearTimeout(closeTimerRef.current);
		if (hoveredKeyRef.current) clearMenuCursorAnchor(hoveredKeyRef.current);
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		const onPointerDown = (event) => {
			if (!rootRef.current?.contains(event.target)) {
				clearTimeout(closeTimerRef.current);
				setIsOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [isOpen]);

	const handleSelect = (locale) => {
		suppressHoverRef.current = true;
		setDismissed(true);
		close();
		triggerRef.current?.focus({ preventScroll: true });
		void requestSiteLocale(locale);
	};

	const handlePointerEnter = (event) => {
		cancelClose();
		if (!suppressHoverRef.current && event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) {
			open();
		}
	};

	const handlePointerLeave = (event) => {
		suppressHoverRef.current = false;
		if (event.pointerType !== "mouse") return;
		cancelClose();
		// Allow the pointer to cross the gaps between orbiting buttons.
		closeTimerRef.current = setTimeout(close, 180);
	};

	const handleKeyDown = (event) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		close();
		triggerRef.current?.focus({ preventScroll: true });
	};

	return (
		<div
			ref={rootRef}
			className={[styles.languagePicker, isOpen && styles.open].filter(Boolean).join(" ")}
			data-dismissed={dismissed}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onKeyDown={handleKeyDown}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) close();
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				className={styles.trigger}
				aria-label={`${PICKER_LABELS[selectedLocale]}: ${LANGUAGE_NAMES[selectedLocale]}`}
				aria-expanded={isOpen}
				aria-controls={optionsId}
				onClick={(event) => {
					if (isOpen && event.nativeEvent.pointerType !== "mouse") close();
					else open();
				}}
				onPointerEnter={(event) => handleCircleEnter(event, "leftMenu:language:trigger")}
				onPointerLeave={releaseCursor}
			>
				<span className={styles.circle} data-language-circle>
					{getSiteLocaleLabel(selectedLocale)}
					<span className={styles.hudMarks} aria-hidden="true" />
				</span>
			</button>
			<div id={optionsId} className={styles.options} role="group" aria-label={PICKER_LABELS[selectedLocale]} aria-hidden={!isOpen}>
				{SITE_LOCALES.map((locale, index) => (
					<button
						key={locale}
						type="button"
						className={styles.option}
						style={{ "--option-index": index }}
						lang={locale}
						aria-label={LANGUAGE_NAMES[locale]}
						aria-pressed={locale === selectedLocale}
						tabIndex={isOpen ? 0 : -1}
						onClick={() => handleSelect(locale)}
						onPointerEnter={(event) => handleCircleEnter(event, `leftMenu:language:${locale}`)}
						onPointerLeave={releaseCursor}
						onTransitionEnd={(event) => handleCircleSettled(event, `leftMenu:language:${locale}`)}
					>
						<span className={styles.circle} data-language-circle>
							{getSiteLocaleLabel(locale)}
							<span className={styles.hudMarks} aria-hidden="true" />
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

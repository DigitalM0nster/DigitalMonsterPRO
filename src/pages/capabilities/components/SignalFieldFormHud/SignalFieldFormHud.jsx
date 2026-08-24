import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import {
	SIGNAL_FIELD_FORMS,
	getSignalFieldFormState,
	requestSignalFieldForm,
	subscribeSignalFieldFormState,
} from "@/functions/signalFieldFormBridge.js";
import styles from "./SignalFieldFormHud.module.scss";

function FormGlyph({ formId }) {
	if (formId === "globe") {
		return (
			<svg viewBox="0 0 38 38" aria-hidden="true">
				<circle cx="19" cy="19" r="11.5" />
				<ellipse cx="19" cy="19" rx="5" ry="11.5" />
				<path d="M8.2 15.2h21.6M8.2 22.8h21.6" />
			</svg>
		);
	}
	if (formId === "reactor") {
		return (
			<svg viewBox="0 0 38 38" aria-hidden="true">
				<ellipse cx="19" cy="19" rx="13" ry="6.2" />
				<ellipse cx="19" cy="19" rx="6.2" ry="13" transform="rotate(56 19 19)" />
				<circle cx="19" cy="19" r="2.2" />
			</svg>
		);
	}
	if (formId === "dna") {
		return (
			<svg viewBox="0 0 38 38" aria-hidden="true">
				<path d="M12 7c0 8 14 8 14 16s-7 8-7 8" />
				<path d="M26 7c0 8-14 8-14 16s7 8 7 8" />
				<path d="M14.2 11h9.6M12.4 18h13.2M14.2 25h9.6" />
			</svg>
		);
	}
	return (
		<svg viewBox="0 0 38 38" aria-hidden="true">
			<path d="m19 5 9.8 8.6-3.5 15.2L19 33l-8.8-5.7L8.6 13.8Z" />
			<path d="m8.6 13.8 10.4 4.8 9.8-5M19 5v13.6M19 18.6v14.3M10.2 27.3l8.8-8.7 6.3 10.2" />
		</svg>
	);
}

FormGlyph.propTypes = {
	formId: PropTypes.string.isRequired,
};

export default function SignalFieldFormHud({ visible = false }) {
	const state = useSyncExternalStore(
		subscribeSignalFieldFormState,
		getSignalFieldFormState,
		getSignalFieldFormState,
	);
	const selected = SIGNAL_FIELD_FORMS[state.selectedIndex] ?? SIGNAL_FIELD_FORMS[0];
	const style = {
		"--selected-index": state.selectedIndex,
		"--morph-progress": state.progress,
	};

	return createPortal((
		<section
			className={`${styles.hud} ${visible ? styles.visible : ""}`}
			style={style}
			data-canvas-pointer-blocker="true"
			data-morphing={state.transitioning ? "true" : "false"}
			aria-hidden={!visible}
			aria-label="Выбор формы частиц"
		>
			<div className={styles.header}>
				<span className={styles.systemName}>FORM / MATRIX</span>
				<span className={styles.status} aria-live="polite">
					<i aria-hidden="true" />
					{state.transitioning ? "ПЕРЕСТРОЕНИЕ" : "ФОРМА СТАБИЛЬНА"}
				</span>
			</div>

			<div className={styles.selectorTrack}>
				<span className={styles.baseRail} aria-hidden="true" />
				<span className={styles.energyRail} aria-hidden="true" />
				<span className={styles.focusLens} aria-hidden="true">
					<span />
				</span>
				{SIGNAL_FIELD_FORMS.map((form) => {
					const isSelected = form.index === state.selectedIndex;
					return (
						<button
							type="button"
							className={styles.formButton}
							key={form.id}
							onClick={() => requestSignalFieldForm(form.index)}
							aria-pressed={isSelected}
							tabIndex={visible ? 0 : -1}
						>
							<span className={styles.glyphShell}>
								<span className={styles.glyphCore} />
								<FormGlyph formId={form.id} />
							</span>
							<span className={styles.formMeta}>
								<small>0{form.index + 1}</small>
								<strong>{form.label}</strong>
							</span>
						</button>
					);
				})}
			</div>

			<div className={styles.footer}>
				<span>{selected.code}</span>
				<span className={styles.hint}>ВЫБЕРИТЕ ФОРМУ</span>
				<span>{String(Math.round(state.progress * 100)).padStart(3, "0")}%</span>
			</div>
		</section>
	), document.body);
}

SignalFieldFormHud.propTypes = {
	visible: PropTypes.bool,
};

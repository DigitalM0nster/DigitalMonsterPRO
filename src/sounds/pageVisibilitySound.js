import { store } from "../store.jsx";
import { isSoundAudible } from "./siteSoundToggle.js";
import { initMasterAudioBus } from "./masterAudioBus.js";

/** @type {Set<() => void>} */
const suspendHandlers = new Set();
/** @type {Set<() => void>} */
const resumeHandlers = new Set();

let installed = false;

/** Можно ли сейчас играть звук (вкладка активна + пользователь не выключил звук). */
export function isPageSoundAllowed(requireAppStarted = false) {
	if (typeof document !== "undefined" && document.hidden) {
		return false;
	}

	if (store.pageHidden) {
		return false;
	}

	if (!isSoundAudible()) {
		return false;
	}

	if (requireAppStarted && !store.appStarted) {
		return false;
	}

	return true;
}

export function registerPageVisibilitySoundHandlers({ suspend, resume }) {
	if (typeof suspend === "function") {
		suspendHandlers.add(suspend);
	}

	if (typeof resume === "function") {
		resumeHandlers.add(resume);
	}

	return () => {
		suspendHandlers.delete(suspend);
		resumeHandlers.delete(resume);
	};
}

function suspendAllPageSounds() {
	for (const handler of suspendHandlers) {
		try {
			handler();
		} catch {
			// ignore
		}
	}
}

function resumeAllPageSounds() {
	if (!isSoundAudible()) {
		return;
	}

	for (const handler of resumeHandlers) {
		try {
			handler();
		} catch {
			// ignore
		}
	}
}

function syncPageHiddenState() {
	const hidden = typeof document !== "undefined" && document.hidden;
	store.pageHidden = hidden;

	if (hidden) {
		suspendAllPageSounds();
	} else {
		resumeAllPageSounds();
	}
}

/** Слушатель visibility — один раз при старте приложения. */
export function initPageVisibilitySound() {
	if (installed || typeof document === "undefined") {
		return;
	}

	installed = true;
	initMasterAudioBus();
	syncPageHiddenState();
	document.addEventListener("visibilitychange", syncPageHiddenState);
}

export function disposePageVisibilitySound() {
	if (!installed || typeof document === "undefined") {
		return;
	}

	document.removeEventListener("visibilitychange", syncPageHiddenState);
	installed = false;
}

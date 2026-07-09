import { useEffect, useRef } from "react";
import { DefaultLoadingManager } from "three";

function chainManagerCallback(manager, key, fn) {
	const prev = manager[key];
	manager[key] = (...args) => {
		if (typeof prev === "function") {
			prev(...args);
		}
		fn();
	};
	return () => {
		manager[key] = prev;
	};
}

/**
 * Сообщает MainContent, что ассеты Three.js догрузились.
 * Без useProgress (drei) — он дергал setState во время render Bloom/ForwardRef.
 */
export default function PreloadReadyNotifier({ onReady }) {
	const onReadyRef = useRef(onReady);
	const firedRef = useRef(false);
	onReadyRef.current = onReady;

	useEffect(() => {
		const manager = DefaultLoadingManager;

		const tryReady = () => {
			if (firedRef.current) {
				return;
			}
			if (manager.itemsTotal > 0 && manager.itemsLoaded >= manager.itemsTotal) {
				firedRef.current = true;
				queueMicrotask(() => onReadyRef.current(true));
			}
		};

		const restoreLoad = chainManagerCallback(manager, "onLoad", tryReady);
		const restoreProgress = chainManagerCallback(manager, "onProgress", tryReady);
		tryReady();

		return () => {
			restoreLoad();
			restoreProgress();
		};
	}, []);

	return null;
}

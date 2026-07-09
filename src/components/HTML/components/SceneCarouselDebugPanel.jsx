import { useEffect, useRef, useState } from "react";
import { useStore, store } from "@/store.jsx";
import {
	CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_MAX,
	CAROUSEL_PROGRESS_TARGET_MIN,
	CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD,
	CAROUSEL_SCENE_IDS,
} from "@/three/render/transition/SceneCarousel.js";
import {
	copyCarouselProgressTargetLog,
	clearCarouselProgressTargetLog,
	getCarouselProgressTargetLogCount,
	isCarouselProgressTargetLogRecording,
	startCarouselProgressTargetLog,
	stopCarouselProgressTargetLog,
} from "@/three/dev/carouselProgressTargetLogger.js";
import { carouselClickTransitionConfig } from "@/three/render/transition/carouselClickTransitionConfig.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "@/three/dev/devPanelHotkeys.js";
import { attachDevPanelDrag } from "@/three/dev/devPanelDrag.js";
import styles from "./SceneCarouselDebugPanel.module.scss";

const SCENE_LABELS = {
	home: "Главная (home)",
	portfolioHub: "Портфолио (portfolioHub)",
	about: "О нас (about)",
	contacts: "Контакты (contacts)",
};

const HOTKEY = "1";

function formatSceneId(id) {
	return SCENE_LABELS[id] ?? id;
}

function BindingBar({ label, value, min, max, color }) {
	const span = max - min;
	const pct = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 50;
	const zeroPct = span > 0 ? Math.max(0, Math.min(100, ((0 - min) / span) * 100)) : 50;

	return (
		<div className={styles.binding}>
			<div className={styles.bindingHeader}>
				<span>{label}</span>
				<span>{value.toFixed(3)}</span>
			</div>
			<div className={styles.bindingTrack}>
				<div className={styles.bindingZero} style={{ left: `${zeroPct}%` }} />
				<div className={styles.bindingMarker} style={{ left: `${pct}%`, backgroundColor: color, color }} />
			</div>
		</div>
	);
}

export default function SceneCarouselDebugPanel() {
	const proxyStore = useStore();
	const open = proxyStore.devPanelSceneCarouselOpen;
	const panelRef = useRef(null);
	const [logRecording, setLogRecording] = useState(() => isCarouselProgressTargetLogRecording());
	const [logCount, setLogCount] = useState(() => getCarouselProgressTargetLogCount());
	const [logStatus, setLogStatus] = useState("");
	const [clickEnterDurationS, setClickEnterDurationS] = useState(() => carouselClickTransitionConfig.enterDurationS);

	useEffect(() => {
		if (!logRecording) {
			return undefined;
		}

		const id = window.setInterval(() => {
			setLogCount(getCarouselProgressTargetLogCount());
		}, 200);

		return () => window.clearInterval(id);
	}, [logRecording]);

	useEffect(() => {
		if (!import.meta.env.DEV) {
			return undefined;
		}

		registerDevPanelHotkey(HOTKEY, {
			label: "Scene Carousel",
			toggle: () => {
				store.devPanelSceneCarouselOpen = !store.devPanelSceneCarouselOpen;
			},
		});

		return () => unregisterDevPanelHotkey(HOTKEY);
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV || !open || !panelRef.current) {
			return undefined;
		}

		return attachDevPanelDrag(panelRef.current, {
			id: "sceneCarousel",
			handle: panelRef.current.querySelector(`.${styles.dragHandle}`),
		});
	}, [open]);

	if (!open) {
		return null;
	}

	const mixProgress = proxyStore.hexShaderProgress ?? 0;
	const progress = proxyStore.sceneCarouselProgress ?? 0;
	const progressTarget = proxyStore.sceneCarouselProgressTarget ?? 0;
	const renderingIds = proxyStore.sceneCarouselRenderingIds ?? [];
	const sceneProgressMap = proxyStore.sceneCarouselSceneProgress ?? {};
	const homeDebug = proxyStore.homeSceneProgressDebug;
	const isHome = proxyStore.sceneCarouselCurrentId === "home";
	const clickTransitionActive = proxyStore.sceneCarouselClickTransitionActive ?? false;

	const handleClickEnterDurationChange = (raw) => {
		const next = Math.max(0.05, Math.min(3, Number(raw)));
		if (!Number.isFinite(next)) {
			return;
		}
		carouselClickTransitionConfig.enterDurationS = next;
		setClickEnterDurationS(next);
	};

	const handleStartLog = () => {
		startCarouselProgressTargetLog();
		setLogRecording(true);
		setLogCount(0);
		setLogStatus("Запись: каждый кадр → консоль [carousel]");
	};

	const handleStopLog = () => {
		stopCarouselProgressTargetLog();
		setLogRecording(false);
		setLogCount(getCarouselProgressTargetLogCount());
		setLogStatus("Запись остановлена");
	};

	const handleCopyLog = async () => {
		await copyCarouselProgressTargetLog();
		setLogStatus(`Скопировано ${getCarouselProgressTargetLogCount()} строк (TSV)`);
	};

	const handleClearLog = () => {
		clearCarouselProgressTargetLog();
		setLogCount(0);
		setLogStatus("Лог очищен");
	};

	return (
		<div ref={panelRef} className={`${styles.panel} devPanelDraggable`} aria-live="polite">
			<div className={styles.dragHandle}>
				<div className={styles.title}>Scene Carousel</div>
				<p className={styles.hint}>
					{HOTKEY} — закрыть · {formatDevPanelHotkeyHints()}
				</p>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Click-переход (меню)</div>
				<div className={styles.row}>
					<span className={styles.label}>активен</span>
					<span className={styles.value}>{clickTransitionActive ? "да" : "нет"}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>enter (с)</span>
					<span className={styles.value}>
						<input
							className={styles.numberInput}
							type="number"
							min={0.05}
							max={3}
							step={0.05}
							value={clickEnterDurationS}
							onChange={(event) => handleClickEnterDurationChange(event.target.value)}
						/>
					</span>
				</div>
				<p className={styles.logHint}>reset {carouselClickTransitionConfig.resetDurationS}s (если progress не 0/1)</p>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Лог progressTarget</div>
				<div className={styles.row}>
					<span className={styles.label}>строк</span>
					<span className={styles.value}>{logCount}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>запись</span>
					<span className={styles.value}>{logRecording ? "идёт" : "стоп"}</span>
				</div>
				<div className={styles.actions}>
					{logRecording ? (
						<button type="button" className={styles.actionBtn} onClick={handleStopLog}>
							Стоп
						</button>
					) : (
						<button type="button" className={styles.actionBtn} onClick={handleStartLog}>
							Запись
						</button>
					)}
					<button type="button" className={styles.actionBtn} onClick={handleCopyLog}>
						Скопировать
					</button>
					<button type="button" className={styles.actionBtn} onClick={handleClearLog}>
						Очистить
					</button>
				</div>
				{logStatus ? <p className={styles.logHint}>{logStatus}</p> : null}
				<p className={styles.logHint}>Консоль: фильтр [carousel]. Или copyCarouselProgressTargetLog()</p>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>progress</span>
				<span className={styles.value}>{progress.toFixed(4)}</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>progressTarget</span>
				<span className={styles.value}>{progressTarget.toFixed(4)}</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>mix (0…1)</span>
				<span className={styles.value}>{mixProgress.toFixed(4)}</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>target clamp</span>
				<span className={styles.value}>
					{CAROUSEL_PROGRESS_TARGET_MIN} … {CAROUSEL_PROGRESS_TARGET_MAX}
				</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>return &lt; {CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD}</span>
				<span className={styles.value}>→ 0 · smooth {CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH}</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>return ≥ {CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD}</span>
				<span className={styles.value}>→ 1 · smooth {CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH}</span>
			</div>

			<div className={styles.row}>
				<span className={styles.label}>renderMode</span>
				<span className={styles.value}>{proxyStore.sceneCarouselRenderMode ?? "off"}</span>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Слоты</div>
				<div className={styles.row}>
					<span className={styles.label}>previous</span>
					<span className={styles.value}>{formatSceneId(proxyStore.sceneCarouselPreviousId)}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>current</span>
					<span className={`${styles.value} ${styles.highlight}`}>{formatSceneId(proxyStore.sceneCarouselCurrentId)}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>next</span>
					<span className={styles.value}>{formatSceneId(proxyStore.sceneCarouselNextId)}</span>
				</div>
			</div>

			{isHome && homeDebug && (
				<div className={styles.section}>
					<div className={styles.sectionTitle}>home · sceneProgress → камера</div>
					<div className={styles.row}>
						<span className={styles.label}>p / t / role</span>
						<span className={styles.value}>
							{homeDebug.sceneProgress.toFixed(3)} · {homeDebug.sceneProgressTarget.toFixed(3)} · {homeDebug.role}
						</span>
					</div>
					<BindingBar label="Камера X" value={homeDebug.cameraX} min={homeDebug.ranges.cameraX[0]} max={homeDebug.ranges.cameraX[1]} color="#f472b6" />
					<BindingBar label="Камера Y" value={homeDebug.cameraY} min={homeDebug.ranges.cameraY[0]} max={homeDebug.ranges.cameraY[1]} color="#86efac" />
					<BindingBar label="Камера Z" value={homeDebug.cameraZ} min={homeDebug.ranges.cameraZ[0]} max={homeDebug.ranges.cameraZ[1]} color="#fbbf24" />
				</div>
			)}

			<div className={styles.section}>
				<div className={styles.sectionTitle}>sceneProgress (−1…1)</div>
				{CAROUSEL_SCENE_IDS.map((id) => {
					const entry = sceneProgressMap[id] ?? {};
					const role = entry.role ?? "off";
					return (
						<div key={id} className={styles.row}>
							<span className={styles.label}>
								{formatSceneId(id)} ({role})
							</span>
							<span className={styles.value}>
								p {(entry.sceneProgress ?? 0).toFixed(3)} · t {(entry.sceneProgressTarget ?? 0).toFixed(3)}
							</span>
						</div>
					);
				})}
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Все сцены карусели ({CAROUSEL_SCENE_IDS.length})</div>
				<ul className={styles.list}>
					{CAROUSEL_SCENE_IDS.map((id) => (
						<li key={id} className={styles.listItem}>
							{formatSceneId(id)}
						</li>
					))}
				</ul>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Pipeline</div>
				<div className={styles.row}>
					<span className={styles.label}>в кадре</span>
					<span className={styles.value}>{renderingIds.length > 0 ? renderingIds.map(formatSceneId).join(" · ") : "—"}</span>
				</div>
			</div>
		</div>
	);
}

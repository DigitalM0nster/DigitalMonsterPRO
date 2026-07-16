import { useEffect, useRef, useState } from "react";
import { useStore, store } from "@/store.jsx";
import {
	STAGE_PROGRESS_TARGET_MAX,
	STAGE_PROGRESS_TARGET_MIN,
	getStageProgress,
	getStageProgressTarget,
	getStageScrollIntent,
} from "@/portfolio/core/stageProgress.js";
import {
	clearStageProgressTrace,
	copyStageProgressTrace,
	downloadStageProgressTrace,
	getStageProgressTraceCount,
	getStageProgressTraceLabel,
	isStageProgressTraceRecording,
	registerStageProgressTraceSampler,
	setStageProgressTraceLabel,
	startStageProgressTrace,
	stopStageProgressTrace,
} from "@/portfolio/dev/stageProgressTraceLogger.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "@/three/dev/devPanelHotkeys.js";
import { attachDevPanelDrag } from "@/three/dev/devPanelDrag.js";
import styles from "./StageProgressDebugPanel.module.scss";

const HOTKEY = "2";

function formatDebugNumber(value, digits = 4) {
	const number = Number(value);
	return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function BindingBar({ label, value, min, max, color }) {
	const span = max - min;
	const pct = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 50;
	const zeroPct = span > 0 ? Math.max(0, Math.min(100, ((0 - min) / span) * 100)) : 50;
	const onePct = span > 0 ? Math.max(0, Math.min(100, ((1 - min) / span) * 100)) : 50;

	return (
		<div className={styles.binding}>
			<div className={styles.bindingHeader}>
				<span>{label}</span>
				<span>{value.toFixed(3)}</span>
			</div>
			<div className={styles.bindingTrack}>
				<div className={styles.bindingZero} style={{ left: `${zeroPct}%` }} />
				<div className={styles.bindingZero} style={{ left: `${onePct}%`, opacity: 0.45 }} />
				<div className={styles.bindingMarker} style={{ left: `${pct}%`, backgroundColor: color, color }} />
			</div>
		</div>
	);
}

export default function StageProgressDebugPanel() {
	const proxyStore = useStore();
	const open = proxyStore.devPanelStageProgressOpen;
	const panelRef = useRef(null);
	const [logRecording, setLogRecording] = useState(() => isStageProgressTraceRecording());
	const [logCount, setLogCount] = useState(() => getStageProgressTraceCount());
	const [logStatus, setLogStatus] = useState("");
	const [label, setLabel] = useState(() => getStageProgressTraceLabel() ?? "");
	const [live, setLive] = useState(() => ({
		progress: getStageProgress(),
		target: getStageProgressTarget(),
		intent: getStageScrollIntent(),
	}));

	useEffect(() => {
		if (!import.meta.env.DEV) {
			return undefined;
		}

		registerStageProgressTraceSampler(() => ({
			progress: getStageProgress(),
			progressTarget: getStageProgressTarget(),
			scrollIntent: getStageScrollIntent(),
		}));

		return () => registerStageProgressTraceSampler(null);
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV) {
			return undefined;
		}

		registerDevPanelHotkey(HOTKEY, {
			label: "Stage Progress",
			toggle: () => {
				store.devPanelStageProgressOpen = !store.devPanelStageProgressOpen;
			},
		});

		return () => unregisterDevPanelHotkey(HOTKEY);
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV || !open || !panelRef.current) {
			return undefined;
		}

		return attachDevPanelDrag(panelRef.current, {
			id: "stageProgress",
			handle: panelRef.current.querySelector(`.${styles.dragHandle}`),
		});
	}, [open]);

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		let raf = 0;
		const tick = () => {
			setLive({
				progress: getStageProgress(),
				target: getStageProgressTarget(),
				intent: getStageScrollIntent(),
			});
			if (logRecording) {
				setLogCount(getStageProgressTraceCount());
			}
			raf = window.requestAnimationFrame(tick);
		};
		raf = window.requestAnimationFrame(tick);
		return () => window.cancelAnimationFrame(raf);
	}, [open, logRecording]);

	if (!open) {
		return null;
	}

	const experience = proxyStore.portfolioExperience ?? {};
	const progress = live.progress;
	const target = live.target;

	const handleStartLog = () => {
		startStageProgressTrace();
		setLogRecording(true);
		setLogCount(0);
		setLogStatus("Запись идёт — прокрути вниз, потом вверх (можно сменить метку).");
	};

	const handleStopAndDownloadLog = () => {
		stopStageProgressTrace();
		setLogRecording(false);
		const filename = downloadStageProgressTrace();
		setLogCount(getStageProgressTraceCount());
		setLogStatus(filename
			? `Сохранено: ${filename} — прикрепи файл в чат.`
			: "Не удалось скачать файл.");
	};

	const handleCopyLog = async () => {
		await copyStageProgressTrace();
		setLogStatus("TSV скопирован в буфер — можно вставить в чат.");
	};

	const handleClearLog = () => {
		clearStageProgressTrace();
		setLogCount(0);
		setLogStatus("Лог очищен.");
	};

	const applyLabel = (next) => {
		setLabel(next);
		setStageProgressTraceLabel(next || null);
	};

	return (
		<aside ref={panelRef} className={styles.panel} aria-label="Stage progress debug">
			<div className={styles.dragHandle}>
				<p className={styles.title}>Stage Progress · {HOTKEY}</p>
				<p className={styles.logHint}>{formatDevPanelHotkeyHints()}</p>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Live</div>
				<div className={styles.row}>
					<span className={styles.label}>slug</span>
					<span className={styles.value}>{experience.slug ?? "—"}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>state</span>
					<span className={styles.value}>
						{experience.activeStateIndex ?? "—"} / {experience.activeStateId ?? "—"}
					</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>intent</span>
					<span className={`${styles.value} ${styles.highlight}`}>{live.intent ?? "null"}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>scroll</span>
					<span className={styles.value}>{formatDebugNumber(proxyStore.scroll)}</span>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>caseScrollTarget</span>
					<span className={styles.value}>{formatDebugNumber(proxyStore.caseScrollTarget)}</span>
				</div>
				<BindingBar
					label="progress"
					value={Number(progress) || 0}
					min={STAGE_PROGRESS_TARGET_MIN}
					max={STAGE_PROGRESS_TARGET_MAX}
					color="#86efac"
				/>
				<BindingBar
					label="target"
					value={Number(target) || 0}
					min={STAGE_PROGRESS_TARGET_MIN}
					max={STAGE_PROGRESS_TARGET_MAX}
					color="#7dd3fc"
				/>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionTitle}>Trace (для чата)</div>
				<div className={styles.row}>
					<span className={styles.label}>метка сегмента</span>
					<span className={styles.value}>
						<input
							className={styles.textInput}
							type="text"
							placeholder="down / up"
							value={label}
							onChange={(event) => applyLabel(event.target.value)}
						/>
					</span>
				</div>
				<div className={styles.actions}>
					<button type="button" className={styles.actionBtn} onClick={() => applyLabel("scroll-down")}>
						метка: вниз
					</button>
					<button type="button" className={styles.actionBtn} onClick={() => applyLabel("scroll-up")}>
						метка: вверх
					</button>
				</div>
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
						<button type="button" className={styles.actionBtn} onClick={handleStopAndDownloadLog}>
							СТОП + СОХРАНИТЬ JSONL
						</button>
					) : (
						<button type="button" className={styles.actionBtn} onClick={handleStartLog}>
							НАЧАТЬ ЗАПИСЬ
						</button>
					)}
					<button type="button" className={styles.actionBtn} onClick={handleCopyLog}>
						Скопировать TSV
					</button>
					<button type="button" className={styles.actionBtn} onClick={handleClearLog}>
						Очистить
					</button>
				</div>
				{logStatus ? <p className={styles.logHint}>{logStatus}</p> : null}
				<p className={styles.logHint}>
					1) Метка «вниз» → скролл вниз. 2) Метка «вверх» → скролл вверх.
					3) СТОП + JSONL и пришли файл в чат.
				</p>
			</div>
		</aside>
	);
}

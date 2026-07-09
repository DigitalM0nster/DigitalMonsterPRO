/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { DefaultLoadingManager } from "three";
import { preloadSoundDesign } from "../../../sounds/soundDesign.js";
import { store } from "../../../store.jsx";

const SHOW_LEGACY_LOADER = false;

export default function DigitalMonsterLoader(props) {
	const [removeLoader, setRemoveLoader] = useState(false);
	const initialProgressRef = useRef(Math.min(99, Number(window.__loaderBootstrapProgress) || 0));
	const animationOffsetRef = useRef(`-${Math.max(0, (Date.now() - (Number(window.__loaderBootstrapStartedAt) || Date.now())) / 1000)}s`);
	const [loadingProgress, setLoadingProgress] = useState(initialProgressRef.current);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const lastTickTsRef = useRef(Date.now());
	const startButtonRef = useRef();
	const progressStoppedRef = useRef(false);
	const progressRef = useRef(initialProgressRef.current);
	const intervalIdRef = useRef(null);
	const renderedRef = useRef(props.rendered);
	const startAppRef = useRef(props.startApp);
	const removeLoaderRef = useRef(removeLoader);
	const realTargetRef = useRef(Math.max(45, initialProgressRef.current));
	const assetCountsRef = useRef({ loaded: 0, total: 0 });
	const fontsReadyRef = useRef(!document.fonts?.ready);

	renderedRef.current = props.rendered;
	startAppRef.current = props.startApp;
	removeLoaderRef.current = removeLoader;

	// dt по Date.now() — работает в фоновой вкладке; линейная интерполяция без замедления в конце
	const TICK_MS = 80;
	const TICK_SEC = TICK_MS / 1000;
	const MAX_DISPLAY_RATE_PER_SEC = 8;
	const MIN_DISPLAY_RATE_PER_SEC = 0.65;
	const CONTINUOUS_TARGET_RATE_PER_SEC = 0.45;

	useEffect(() => {
		let active = true;
		document.fonts?.ready.then(() => {
			if (active) {
				fontsReadyRef.current = true;
			}
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!("PerformanceObserver" in window)) {
			return undefined;
		}

		const observer = new PerformanceObserver((list) => {
			let bonus = 0;
			for (const entry of list.getEntries()) {
				const bytes = entry.transferSize || entry.encodedBodySize || 0;
				bonus += 0.08 + Math.min(1.2, (bytes / 1048576) * 0.2);
			}
			if (bonus > 0) {
				realTargetRef.current = Math.min(98.5, realTargetRef.current + bonus);
			}
		});

		try {
			observer.observe({ type: "resource" });
		} catch (_error) {
			return undefined;
		}

		return () => observer.disconnect();
	}, []);

	// Если Canvas не успел выставить rendered — не блокируем кнопку вечно
	useEffect(() => {
		const manager = DefaultLoadingManager;
		const previousStart = manager.onStart;
		const previousProgress = manager.onProgress;
		const previousLoad = manager.onLoad;

		const updateAssetTarget = (_url, itemsLoaded, itemsTotal) => {
			const loaded = Number(itemsLoaded);
			const total = Number(itemsTotal);
			if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) {
				return;
			}

			assetCountsRef.current = { loaded, total };
			const ratio = Math.min(1, loaded / total);
			const measuredTarget = 45 + ratio * 50;
			realTargetRef.current = Math.max(realTargetRef.current, measuredTarget);
		};

		manager.onStart = (...args) => {
			previousStart?.(...args);
			updateAssetTarget(...args);
		};
		manager.onProgress = (...args) => {
			previousProgress?.(...args);
			updateAssetTarget(...args);
		};
		manager.onLoad = (...args) => {
			previousLoad?.(...args);
			const { loaded, total } = assetCountsRef.current;
			updateAssetTarget(undefined, loaded, total);
		};

		return () => {
			manager.onStart = previousStart;
			manager.onProgress = previousProgress;
			manager.onLoad = previousLoad;
		};
	}, []);

	useEffect(() => {
		const handleFullScreenChange = () => {
			setIsFullScreen(document.fullscreenElement !== null);
		};

		document.addEventListener("fullscreenchange", handleFullScreenChange);

		return () => {
			document.removeEventListener("fullscreenchange", handleFullScreenChange);
		};
	}, []);

	// eslint-disable-next-line no-unused-vars
	const toggleFullScreen = () => {
		if (!isFullScreen) {
			// Вход в полноэкранный режим
			if (document.documentElement.requestFullscreen) {
				document.documentElement.requestFullscreen();
			} else if (document.documentElement.mozRequestFullScreen) {
				document.documentElement.mozRequestFullScreen();
			} else if (document.documentElement.webkitRequestFullscreen) {
				document.documentElement.webkitRequestFullscreen();
			} else if (document.documentElement.msRequestFullscreen) {
				document.documentElement.msRequestFullscreen();
			}
		} else {
			// Выход из полноэкранного режима
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.mozCancelFullScreen) {
				document.mozCancelFullScreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen();
			}
		}
	};

	const clearProgressInterval = () => {
		if (intervalIdRef.current !== null) {
			clearInterval(intervalIdRef.current);
			intervalIdRef.current = null;
		}
	};

	const stopLoadingProgress = () => {
		progressStoppedRef.current = true;
		clearProgressInterval();
	};

	// Останавливаем тикер при старте приложения или скрытии HUD.
	useEffect(() => {
		if (props.startApp || removeLoader) {
			stopLoadingProgress();
		}
	}, [props.startApp, removeLoader]);

	// Прогресс только на прелоадере: один интервал, refs вместо deps — без перезапуска при rendered/fallbackReady.
	useEffect(() => {
		if (progressStoppedRef.current) {
			return undefined;
		}

		const advanceLoadingProgress = () => {
			if (progressStoppedRef.current || removeLoaderRef.current || startAppRef.current) {
				stopLoadingProgress();
				return;
			}

			const prev = progressRef.current;
			if (prev >= 100) {
				stopLoadingProgress();
				return;
			}

			const now = Date.now();
			const dtSec = Math.max(TICK_SEC, (now - lastTickTsRef.current) / 1000);
			lastTickTsRef.current = now;
			if (!renderedRef.current || !fontsReadyRef.current) {
				realTargetRef.current = Math.min(98.5, realTargetRef.current + CONTINUOUS_TARGET_RATE_PER_SEC * dtSec);
			}

			const measuredTarget = Number.isFinite(realTargetRef.current) ? realTargetRef.current : 45;
			const isReady = renderedRef.current && fontsReadyRef.current;
			const target = isReady ? 100 : measuredTarget;

			const gap = target - prev;
			if (gap <= 0) {
				return;
			}

			const displayRate = isReady ? 100 : Math.min(MAX_DISPLAY_RATE_PER_SEC, MIN_DISPLAY_RATE_PER_SEC + gap * 0.35);
			const step = Math.min(gap, displayRate * dtSec);
			const next = Math.min(100, prev + step);
			progressRef.current = next;

			if (next !== prev) {
				setLoadingProgress(next);
			}

			if (next >= 100) {
				stopLoadingProgress();
			}
		};

		lastTickTsRef.current = Date.now();
		advanceLoadingProgress();

		intervalIdRef.current = setInterval(advanceLoadingProgress, TICK_MS);

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				advanceLoadingProgress();
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			clearProgressInterval();
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, []);

	const showLoadingProgress = !props.startApp && !removeLoader;

	const canShowStart = loadingProgress >= 99.5 && props.rendered;
	const progressPercent = Math.min(100, Math.floor(loadingProgress));
	const languageButtonsEnabled = progressPercent === 100 && props.rendered && fontsReadyRef.current;

	const startApplication = () => {
		if (props.startApp || removeLoader) {
			return;
		}
		stopLoadingProgress();
		setRemoveLoader(true);
		props.setStartApp(true);
		store.appStarted = true;
		store.appStartedAt = Date.now();
		store.soundsActive = true;
		preloadSoundDesign();
		startButtonRef.current?.classList.add("exit");
	};

	const selectLocale = (locale) => {
		if (!languageButtonsEnabled) {
			return;
		}
		store.siteLocale = locale;
		startApplication();
	};

	return (
		<>
			<div
				className={`digitalMonsterLoader${removeLoader ? " removed" : ""}`}
				style={{
					"--loader-progress": `${loadingProgress}%`,
					"--loader-animation-offset": animationOffsetRef.current,
				}}
			>
				<div className="digitalMonsterLoaderOrb">
					<div className="loaderOuterOrbit" aria-hidden="true">
						<div className="loaderOuterOrbitGlow loaderOuterOrbitGlowNear">
							<div className="loaderOuterOrbitGlowSource" />
						</div>
						<div className="loaderOuterOrbitCore" />
					</div>
					<div className="loaderMiddleOrbit" aria-hidden="true">
						<div className="loaderOuterOrbitGlow loaderOuterOrbitGlowNear">
							<div className="loaderOuterOrbitGlowSource" />
						</div>
						<div className="loaderOuterOrbitCore" />
					</div>
					<svg
						className="digitalMonsterLoaderRings"
						viewBox="0 0 1000 1000"
						aria-hidden="true"
					>
						<defs>
							<linearGradient id="loaderArcTopFade" x1="64" y1="324" x2="459" y2="32" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#087dff" stopOpacity="0" />
								<stop offset="0.18" stopColor="#087dff" stopOpacity="0.32" />
								<stop offset="0.34" stopColor="#16bfff" stopOpacity="0.78" />
								<stop offset="0.5" stopColor="#d6fbff" stopOpacity="1" />
								<stop offset="0.64" stopColor="#35dfff" stopOpacity="0.92" />
								<stop offset="0.82" stopColor="#087dff" stopOpacity="0.3" />
								<stop offset="1" stopColor="#087dff" stopOpacity="0" />
							</linearGradient>
							<linearGradient id="loaderArcRightFade" x1="780" y1="70" x2="970" y2="540" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#1dd8ff" stopOpacity="0" />
								<stop offset="0.28" stopColor="#0fa8ff" stopOpacity="1" />
								<stop offset="1" stopColor="#087dff" stopOpacity="0" />
							</linearGradient>
							<linearGradient id="loaderArcBottomFade" x1="90" y1="610" x2="590" y2="970" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#087dff" stopOpacity="0" />
								<stop offset="0.38" stopColor="#0b94ff" stopOpacity="1" />
								<stop offset="1" stopColor="#1bcfff" stopOpacity="0" />
							</linearGradient>
						</defs>
						<circle className="loaderRingInner" cx="500" cy="500" r="470" />
						<circle className="loaderRingDotted" cx="500" cy="500" r="438" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloOuter" cx="500" cy="500" r="470" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloSoft" cx="500" cy="500" r="470" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloFar" cx="500" cy="500" r="470" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloWide" cx="500" cy="500" r="470" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloMid" cx="500" cy="500" r="470" />
						<circle className="loaderRingArcTopHalo loaderRingArcTopHaloNear" cx="500" cy="500" r="470" />
						<circle className="loaderRingArc loaderRingArcTop" cx="500" cy="500" r="470" />
						<circle className="loaderRingArc loaderRingArcRight" cx="500" cy="500" r="470" />
						<circle className="loaderRingArc loaderRingArcBottom" cx="500" cy="500" r="470" />
					</svg>

					<div className="digitalMonsterLoaderContent">
						<div className="digitalMonsterLoaderBrand" aria-label="Digital Monster">
							<span>DIGITAL</span>
							<span>MONSTER</span>
						</div>

						<div className="digitalMonsterLoaderLanguageLabel">
							ВЫБЕРИТЕ ЯЗЫК / SELECT LANGUAGE / 选择语言
						</div>
						<div className="digitalMonsterLoaderLanguages" role="group" aria-label="Select language">
							<button
								type="button"
								data-loading-label="Дождитесь загрузки"
								disabled={!languageButtonsEnabled}
								onClick={() => selectLocale("ru")}
							>
								РУССКИЙ
							</button>
							<button
								type="button"
								data-loading-label="Please wait"
								disabled={!languageButtonsEnabled}
								onClick={() => selectLocale("en")}
							>
								ENGLISH
							</button>
							<button
								type="button"
								data-loading-label="请等待加载"
								disabled={!languageButtonsEnabled}
								onClick={() => selectLocale("zh")}
							>
								中文
							</button>
						</div>

						<div className="digitalMonsterLoaderProgress" aria-live="polite">
							<strong>{progressPercent}%</strong>
							<span>ЗАГРУЗКА / LOADING</span>
							<div className="digitalMonsterLoaderTrack" aria-hidden="true">
								<i />
							</div>
						</div>
					</div>
				</div>
			</div>

			{SHOW_LEGACY_LOADER && <div className="legacyLoader" aria-hidden="true">
			<div className={removeLoader ? `hud-container removed` : `hud-container`}>
				<div id="hud" className={props.activeLoader === false ? "spin-out" : ""}>
					<svg
						version="1.1"
						id="heads_up_display"
						xmlns="http://www.w3.org/2000/svg"
						xmlnsXlink="http://www.w3.org/1999/xlink"
						x="0px"
						y="0px"
						viewBox="0 0 1094 1141.6"
						style={{
							enableBackground: "new 0 0 1094 1141.6",
						}}
						xmlSpace="preserve"
					>
						<g>
							<path
								className="hatching"
								d="M832.9,239.1l-43.9,50.2l1.4,1.2l43.9-50.1L832.9,239.1 M299.4,257.7l-22.2-26.3l1.4-1.2l22.2,26.3
                L299.4,257.7z M357.9,218.8l-16.7-30l1.6-0.9l16.7,30L357.9,218.8z M427.5,188.5l-10.7-32.6l1.8-0.6l10.7,32.6L427.5,188.5z
                M501.7,172l-4.2-34l1.8-0.2l4.2,34L501.7,172z M579.5,170l-1.8-0.1l2.4-34.2l1.8,0.1L579.5,170z M654.4,182.7l-1.8-0.5l8.9-33.1
                l1.8,0.5L654.4,182.7 M725.5,209.3l-1.7-0.8l15.1-30.9l1.7,0.8L725.5,209.3z M790.2,248.8l-1.5-1.2l20.8-27.4l1.5,1.1L790.2,248.8z
                M551.8,134.7h-1.9v66.4h1.8L551.8,134.7 M311.6,248.8l-20.8-27.4l1.5-1.1l20.8,27.4L311.6,248.8z M376.3,209.2l-15.1-30.8l1.6-0.8
                l15.1,30.8L376.3,209.2z M447.4,182.7l-8.9-33.1l1.8-0.5l8.9,33.1L447.4,182.7z M522.3,170l-2.4-34.3l1.8-0.1l2.4,34.2L522.3,170z
                M600.1,172l-1.8-0.2l4.2-34l1.8,0.2L600.1,172z M674.2,188.5l-1.8-0.6l10.7-32.6l1.8,0.6L674.2,188.5z M743.9,218.8l-1.6-0.9
                l16.7-30l1.6,0.9L743.9,218.8z M824.2,231.2l1.4,1.2l-22.2,26.2l-1.4-1.2 M268.8,239l-1.4,1.2l43.9,50.2l1.4-1.2L268.8,239
                M328.4,236.8l-19.3-28.4l1.5-1l19.3,28.4L328.4,236.8z M395.1,200.7l-13.5-31.6l1.7-0.7l13.5,31.6L395.1,200.7 M467.6,177.8
                l-7.2-33.6l1.8-0.4l7.2,33.6L467.6,177.8z M537,169.1l-0.6-34.3h1.8l0.6,34.3H537z M620.6,175.1l-1.8-0.3l6-33.8l1.8,0.3
                L620.6,175.1z M693.8,195.5l-1.7-0.7l12.4-32l1.7,0.7L693.8,195.5z M761.7,229.3l-1.6-1l18.3-29.1l1.6,1L761.7,229.3z M345.9,225.7
                l-17.8-29.4l1.6-1l17.8,29.4L345.9,225.7z M414.4,193l-11.8-32.2l1.7-0.6l11.8,32.2L414.4,193z M487.9,174l-5.4-33.9l1.8-0.3
                l5.4,33.9L487.9,174z M564.6,169.2l-1.8-0.1l1.2-34.3l1.8,0.1L564.6,169.2z M640.9,179.2l-1.8-0.4l7.8-33.4l1.8,0.4L640.9,179.2z
                M712.9,203.4l-1.7-0.8l14-31.3l1.7,0.8L712.9,203.4z M778.9,240.7l-1.5-1l19.8-28.1l1.5,1.1L778.9,240.7z M269.4,891.7l43.9-50.2
                l-1.4-1.2L268,890.4L269.4,891.7 M802.9,873l22.2,26.3l-1.4,1.2l-22.2-26.3L802.9,873z M744.4,911.9l16.7,30l-1.6,0.9l-16.7-30
                L744.4,911.9z M674.8,942.2l10.7,32.6l-1.8,0.6l-10.7-32.6L674.8,942.2z M600.7,958.7l4.2,34l-1.8,0.2l-4.2-34L600.7,958.7z
                M522.9,960.7l1.8,0.1l-2.4,34.2l-1.8-0.1L522.9,960.7z M447.9,948.1l1.8,0.5l-8.9,33.1l-1.8-0.5L447.9,948.1 M376.8,921.5l1.6,0.8
                l-15.1,30.8l-1.6-0.8L376.8,921.5z M312.1,881.9l1.5,1.1l-20.8,27.4l-1.5-1.1L312.1,881.9z M550.5,996h1.8v-66.4h-1.8V996
                M790.7,881.9l20.8,27.4l-1.5,1.1L789.3,883L790.7,881.9z M726.1,921.5l15.1,30.8l-1.7,0.8l-15.1-30.8L726.1,921.5z M654.9,948.1
                l8.9,33.1l-1.8,0.5l-8.9-33.1L654.9,948.1z M580,960.7l2.4,34.2l-1.8,0.1l-2.4-34.2L580,960.7z M502.2,958.7l1.8,0.2l-4.2,34
                l-1.8-0.2L502.2,958.7z M428.1,942.2l1.8,0.6l-10.7,32.6l-1.8-0.6L428.1,942.2z M358.5,911.9l1.6,0.9l-16.7,30l-1.6-0.9
                L358.5,911.9z M278.2,899.5l-1.4-1.2l22.2-26.3l1.4,1.2 M833.5,891.7l1.4-1.2l-43.9-50.2l-1.4,1.2L833.5,891.7 M773.9,893.9
                l19.3,28.4l-1.5,1l-19.3-28.4L773.9,893.9z M707.2,930.1l13.5,31.6l-1.7,0.7l-13.5-31.6L707.2,930.1 M634.8,953l7.2,33.5l-1.8,0.4
                l-7.2-33.5L634.8,953z M565.3,961.7l0.6,34.3h-1.8l-0.6-34.3H565.3z M481.7,955.6l1.8,0.3l-6,33.8l-1.8-0.3L481.7,955.6z
                M408.6,935.3l1.7,0.7l-12.4,32l-1.7-0.7L408.6,935.3z M340.6,901.4l1.6,1l-18.3,29.1l-1.6-1L340.6,901.4z M756.4,905l17.8,29.4
                l-1.6,1L754.8,906L756.4,905z M687.9,937.7l11.8,32.2l-1.7,0.6l-11.8-32.2L687.9,937.7z M614.4,956.7l5.4,33.9l-1.8,0.3l-5.4-33.9
                L614.4,956.7z M537.7,961.5l1.8,0.1l-1.2,34.3l-1.8-0.1L537.7,961.5z M461.4,951.5l1.8,0.4l-7.8,33.4l-1.8-0.4L461.4,951.5z
                M389.4,927.3l1.7,0.8l-14,31.3l-1.7-0.8L389.4,927.3z M323.4,890l1.5,1.1l-19.8,28.1l-1.5-1.1L323.4,890z"
							/>
							<g className="outer-ring outer-ring-blue">
								<path
									className="trace"
									d="M1061.5,750.9c-68.7,194.8-246.1,341.4-465.1,360.1c-218.7,18.7-418.2-95.5-519-275.4 M40.3,387.1
                C109.8,194,286.4,48.9,504.2,30.3c216.3-18.5,413.7,92.9,515.6,269.4"
								/>
								<path
									className="glow"
									d="M995.9,879.4c-154.4,223.9-451,298.3-692.8,174 M139.2,217.4c125.2-145.9,281.8-179.9,365-187
                c58-5,116.5-0.6,173.1,13"
								/>
							</g>
							<g className="outer-ring outer-ring-red">
								<path
									className="trace"
									d="M900,244.3c123.6,131.4,166.3,328.1,93,505.9c-73.2,177.6-241.7,287-421.7,293.4 M208.4,893
                c-122-131.3-163.8-326.8-90.9-503.7c72.4-175.6,238-284.6,415.7-293.2"
								/>
								<path className="glow" d="M1028.6,587.6c-9.6,248.3-209,447.1-457.3,456 M81.7,556.8c5-169.2,99.5-322.9,248.2-403.8" />
							</g>
							<path
								id="Ellipse_9_copy_2"
								className="inner-ring"
								d="M672.2,896c-78.3,29.3-164.6,29.5-243.1,0.6 M430.1,243.2
                c78.8-28.7,165.2-28.1,243.6,1.6"
							/>
						</g>
					</svg>
				</div>
				<div className="digitalMonsterLogo">
					<img src="/images/DM_logo.png" alt="DigitalMonster" />
				</div>
				{showLoadingProgress && (
					<div className="loadingProgress">{Math.floor(loadingProgress)} % loaded</div>
				)}
			</div>
			<div
				ref={startButtonRef}
				className={canShowStart ? "startButton active" : "startButton"}
				onClick={startApplication}
			>
				<div className="startButtonText">Начать</div>
				<div className="borderLeft" />
				<div className="borderTop" />
				<div className="borderRight" />
				<div className="borderBottom" />
			</div>
			</div>}
		</>
	);
}

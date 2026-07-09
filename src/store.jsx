import { proxy } from "valtio";
import { useProxy } from "valtio/utils";
import { getGraphicsConfig, getGraphicsTier, resolveRendererPixelRatio } from "./utils/getGraphicsTier.js";
import { getInitialBackgroundBrightness } from "./utils/backgroundBrightness.js";

const initialTier = typeof window !== "undefined" ? getGraphicsTier() : "medium";
const graphics = getGraphicsConfig(initialTier);

export const store = proxy({
	openedCase: false,
	scroll: 0,
	/** 0…1 — mix progress карусели (догоняющий progress) */
	hexShaderProgress: 0,
	/** 0…1 сегмента — цель скролла карусели */
	sceneCarouselProgressTarget: 0,
	/** Тот же progress, что hexShaderProgress (для debug) */
	sceneCarouselProgress: 0,
	/** Снимок sceneProgress / sceneProgressTarget по сценам карусели */
	sceneCarouselSceneProgress: {},
	/** Hex / scroll-карусель: navigate(path) после 3D-перехода */
	sceneCarouselNavigatePath: null,
	sceneCarouselDisplayPath: null,
	/** Click-переход карусели (меню) — блок скролла и повторных кликов */
	sceneCarouselClickTransitionActive: false,
	sceneCarouselCurrentId: "home",
	sceneCarouselPreviousId: "contacts",
	sceneCarouselNextId: "portfolioHub",
	/** Debug: single | mix | off */
	sceneCarouselRenderMode: "single",
	/** Debug: id сцен в кадре */
	sceneCarouselRenderingIds: ["home"],
	/** Dev: что двигает sceneProgress на главной (камера). */
	homeSceneProgressDebug: null,
	/** Индекс проекта в меню хаба /portfolio (-1 = ничего не выбрано) */
	portfolioHubFocusIndex: -1,
	/** 0…1 — текущая яркость HDR-фона (для HTML UI, напр. фон рамки меню) */
	backgroundBrightness: getInitialBackgroundBrightness(),
	cursor: {
		hovered: false,
		x: 0,
		y: 0,
		/** HUD-курсор привязан к центру активного пункта левого меню */
		menuAnchorActive: false,
		menuAnchorX: 0,
		menuAnchorY: 0,
		/** Диаметр круга меню при hover — HUD подстраивает размер под border */
		menuAnchorDiameter: 0,
		menuAnchorSource: null,
		menuAnchorKey: null,
		menuAnchorRevision: 0,
		/** Визуал HUD-курсора на плитке портфолио */
		caseHovered: false,
		/** Системный pointer над проектом в правом canvas-списке */
		projectListHovered: false,
		/** Системный pointer над кружком правой навигации кейса */
		caseNavHovered: false,
	},
	/** Пользователь нажал «Начать» — можно запускать enter-анимации сцен. */
	appStarted: false,
	/** performance.now()-совместимый timestamp клика «Начать» (для задержки curtain). */
	appStartedAt: null,
	soundsActive: false,
	/** true во время змейки «выкл» и 1 с fade — звук ещё не обрублен. */
	soundsPlaybackHeld: false,
	/** Язык интерфейса: ru | en | zh */
	siteLocale: "ru",
	/** Вкладка в фоне (alt-tab) — звуки на паузе. */
	pageHidden: typeof document !== "undefined" ? document.hidden : false,
	transitionSound: false,
	timeG: 0,
	// Профиль для слабых устройств: DPR, частицы, проходы постобработки
	graphicsTier: initialTier,
	graphicsDprCap: graphics.dprCap,
	graphicsDprFloor: graphics.dprFloor ?? null,
	graphicsDpr: typeof window !== "undefined" ? resolveRendererPixelRatio(initialTier, window.devicePixelRatio) : 1,
	sparklesCount: graphics.sparkles,
	reduceBackgroundBlur: graphics.reduceBackgroundBlur,
	graphicsAntialias: graphics.antialias,
	graphicsBloomMipmap: graphics.bloomMipmap,
	graphicsBloomLevels: graphics.bloomLevels,
	graphicsBloomRadius: graphics.bloomRadius,
	graphicsPowerPreference: graphics.powerPreference,
	/** Мост HTML Portfolio Exploration ↔ THREE Case1Scene */
	portfolioExperience: {
		slug: null,
		activeStateId: null,
		/** Синхронный индекс этапа для canvas paint (без ожидания React). */
		activeStateIndex: 0,
		activeSubStageId: null,
		isInvestigating: false,
		investigationHotspotId: null,
		/** 0…1 — локальный прогресс внутри активного state (догоняющий). */
		stageProgress: 0,
		/** 0…1 — цель от глобального scroll внутри текущего state. */
		stageProgressTarget: 0,
		/** 0…1 — горизонтальный swipe между сценами на mobile. */
		mobileSwipeProgress: 0,
	},
	/** DEV: Scene Carousel debug panel (клавиша 1) */
	devPanelSceneCarouselOpen: false,
});
export const useStore = () => useProxy(store);

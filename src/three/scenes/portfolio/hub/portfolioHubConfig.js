import { projectsData } from "./projectsData.js";
import { portfolioHubLogoConfig } from "./portfolioHubLogoConfig.js";
import { siteBloomArtDirection } from "../../../render/models/siteBloomConfig.js";

/** Сетка плит хаба: 5 рядов × (reference + extra) в глубину. */
export const PORTFOLIO_HUB_ROW_COUNT = 5;
/** Рабочая глубина (передний край блока проектов). */
export const PORTFOLIO_HUB_DEPTH_REFERENCE_COUNT = 20;
/** +10 к D-индексу — legacy, для reference-сетки 20 колонок. */
export const PORTFOLIO_HUB_PROJECT_DEPTH_OFFSET = 10;
/** Декоративные плиты сзади проектов (InstancedMesh, 1 draw call). В кадре ~10–12 глубин — 40 избыточно. */
export const PORTFOLIO_HUB_EXTRA_DEPTH_PLATES = 15;
export const PORTFOLIO_HUB_PLATES_PER_ROW = PORTFOLIO_HUB_DEPTH_REFERENCE_COUNT + PORTFOLIO_HUB_EXTRA_DEPTH_PLATES;

/** Параметры прозрачных плит хаба портфолио. Live-tune: D на /portfolio → «Сетка плит». */
export const portfolioHubPlatesConfig = {
	/** Сторона квадратной плиты. */
	plateSize: 2.7,
	depth: 0.26,
	/** Зазор между вертикальными рядами (ось Y). */
	rowGap: 0.55,
	/** Зазор между плитами в глубину (ось Z), не counting толщину depth. */
	depthGap: 3.5,
	cornerRadius: 0.06,
	cornerSegments: 4,
	gridOffset: [-2.2, 3, 2.4],
	gridRotation: [-19, 44, 13],
	/** Сдвиг сетки по глубине в шагах плиты (−1 = на 1 плиту назад от камеры). */
	gridDepthShiftPlates: -1,
	/** Появление сетки: from → gridOffset / gridRotation + fade-in плит. */
	gridEnter: {
		fromOffset: [5, 0, -2.1],
		fromRotation: [-20, 50, 0],
		durationMs: 2000,
		fromOpacity: 0,
	},
	/** Исчезновение сетки: gridOffset / gridRotation → to + fade-out плит. */
	gridExit: {
		toOffset: [-2.3, 6.3, 6.6],
		toRotation: [-20, 45, 8],
		durationMs: 500,
		toOpacity: 0,
	},
	fog: {
		enabled: true,
		color: "#000514",
		near: 2,
		far: 10.2,
	},
	material: {
		color: "#081421",
		opacity: 0.7,
		transmission: 0.01,
		roughness: 0.14,
		metalness: 0,
		thickness: 0,
	},
	/** Blur заднего HUD-текста: верхняя подпись + «Подробнее». */
	hudBackTextBlur: 0.5,
	/** HUD-подпись на проектных плитах: белая строка + голубая акцентная. */
	plateLabel: {
		enabled: true,
		/** topLeft | bottomLeft — угол плиты для блока подписи. */
		corner: "topLeft",
		/** Синий акцент — 1:1 с plateDetailsButton.color */
		color: "#1886fb",
		secondaryColor: "#ffffff",
		secondaryOpacity: 0.88,
		secondaryFontScale: 0.56,
		secondaryFontWeight: 500,
		primaryFontWeight: 600,
		opacity: 1,
		/** Неактивные плитки: подпись скрыта (как логотип). */
		idleOpacity: 0,
		height: 0.5,
		marginX: 0.13,
		marginY: 0.13,
		zOffset: 0,
		layers: {
			back: { opacity: 0.035 },
			frontFloat: { opacity: 1 },
		},
		fontSize: 40,
		lineHeight: 1.25,
		lineGap: 10,
		letterSpacing: 0.1,
		/** HDR-bloom синего текста и декора — 1:1 с plateDetailsButton.textBloomBoost */
		textBloomBoost: 5,
		/** @deprecated — canvas text-shadow убран; используй textBloomBoost */
		textGlow: 7,
		primaryGlow: 7,
		canvasBottomPad: 36,
		canvasTopPad: 12,
		canvasPaddingRight: 48,
		canvasPaddingLeft: 8,
		/** Штрихи слева от текста (canvas px). */
		markers: {
			columnX: 11,
			textX: 57,
			secondaryMarkerOffsetY: -3,
			primaryMarkerOffsetY: -5,
			/** Половина расстояния от центра синей строки до каждого штриха. */
			primaryStackHalfGap: 5,
			secondaryBarWidth: 22,
			primaryTopBarWidth: 20,
			/** Нижний штрих у синей строки — короче верхнего. */
			primaryBottomBarWidth: 9,
			bottomBarWidth: 13,
			bottomOffsetY: 15,
			bottomFadeWidthScale: 0.62,
			/** Кружок у нижнего декора (canvas px, от textX / строки декора). */
			bottomDotOffsetX: 0,
			bottomDotOffsetY: 0,
			bottomDotRadius: 1.3,
			bottomDotGlow: 6,
			bottomDotAlpha: 0.95,
			/** Линия с затуханием вправо; фиксированная длина (canvas px), не зависит от текста. */
			bottomLineStartGap: -1,
			bottomLineWidth: 300,
			bottomLineWidthMul: 1.15,
			bottomLineThickness: 0.6,
			bottomLineGlow: 4,
			bottomLineFadeStart: 1,
			bottomLineFadeMid: 0.25,
		},
		reveal: {
			enabled: true,
			partSize: 0.016,
			shiftRatio: 0.91,
			dropMin: 0.14,
			dropMax: 0.53,
			sweepSpread: 0,
		},
		/** Змейка при смене языка — 1:1 с plateDetailsButton.snake */
		snake: {
			color: "rgb(171, 224, 247)",
			bloomBoost: 4,
			letterScale: 1,
			letterFontWeight: 600,
		},
	},
	/** «Смотреть кейс» + chevron — правый нижний угол (canvas на mesh). Текст — i18n. */
	plateDetailsButton: {
		enabled: true,
		fontSize: 30,
		fontWeight: 600,
		letterSpacing: 0.1,
		lineHeight: 1.25,
		/** Основной текст и стрелка — плоский цвет, HDR-bloom в шейдере. */
		color: "#1886fb",
		/** Bloom текста кнопки и стрелки (не змейки). */
		textBloomBoost: 5,
		/**
		 * Змейка при смене языка — отдельно от основного текста кнопки.
		 * bloomBoost / color — только glitch-буквы; не заданы — fallback из portfolioHubGlitchConfig.
		 */
		snake: {
			color: "rgb(171, 224, 247)",
			bloomBoost: 4,
			letterScale: 1,
			letterFontWeight: 600,
		},
		opacity: 1,
		height: 0.3,
		marginX: 0.15,
		marginY: 0.08,
		zOffset: 0,
		canvasPaddingRight: 16,
		canvasPaddingBottom: 18,
		canvasPaddingLeft: 12,
		canvasTopPad: 8,
		arrowSize: 25,
		arrowGap: 16,
		arrowLineWidth: 3,
		arrowGlow: 5,
		arrowHoverOffset: 8,
		arrowHoverDuration: 0.07,
		/** Три слоя на плитке: сзади / на поверхности / над поверхностью. */
		layers: {
			back: { opacity: 0.035 },
			frontFloat: { opacity: 1 },
		},
		/** Залитый треугольник в chevron (canvas px / доли от arrowSize). */
		arrowTriangle: {
			/** Доля depth chevron — остриё треугольника левее tipX. */
			inset: 0.36,
			/** Доля depth — ширина треугольника. */
			depth: 0.36,
			/** Доля spread — высота треугольника. */
			spread: 0.36,
			/** Доп. сдвиг по X в px (− = влево). */
			offsetX: -5,
		},
		/** Hover shader-glitch: полосы, RGB split и цветной цифровой акцент. */
		shaderGlitch: {
			enabled: true,
			durationMs: 350,
			color: "#ffffff",
			intensity: 0.031,
			sliceCount: 13,
			rgbShift: 0,
		},
		/** Доп. подъём верхних HUD-точек курсора над текстом (canvas px). */
		cursorPointsTopLiftPx: 8,
		reveal: {
			enabled: true,
			partSize: 0.02,
			shiftRatio: 0.55,
			dropMin: 0.12,
			dropMax: 0.34,
			sweepSpread: 0.35,
		},
	},
	/** HUD хаба: справа список проектов (projects). left.layers — опционально. */
	hubScreenTitle: {
		enabled: true,
		opacity: 1,
		cameraOffset: [0.9, 0.85, -5],
		left: {
			layers: [],
		},
		projects: {
			enabled: true,
			offset: [0, 0, 0],
			lineGap: -0.09,
			layerDefaults: {
				fontSize: 30,
				fontWeight: 600,
				color: "#ffffff",
				letterSpacing: 0,
				uppercase: true,
				paddingLeft: 12,
				paddingTop: 6,
				paddingRight: 12,
				paddingBottom: 6,
				planeHeight: 0.34,
				shader: "whiteText",
				opacity: 1,
				activeGlow: 12,
				inactiveOpacity: 0.5,
				hoveredOpacity: 0.72,
				activeOpacity: 1,
				activeColor: "#f4fbff",
			},
			overrides: {},
		},
	},
	camera: {
		position: [0, 0.5, 10],
		lookAt: [0, 0, 0],
		fov: 40,
	},
	interaction: {
		/** Сдвиг активной плитки по X (world). -0.5 = влево на 0.5 при plateProgress=1. */
		plateSlideX: -0.75,
		/** Длительность сдвига всей сетки по Y/Z (сек). */
		gridSlideDuration: 1,
		/** Длительность выезда карточки по X (сек). */
		plateSlideDuration: 0.9,
		/** Длительность появления логотипа (сборка частей), сек. */
		logoAppearDuration: 0.75,
		/** Длительность исчезновения логотипа (fade к плите), сек. */
		logoFadeDuration: 0.5,
		/** Карточка стартует после этой доли анимации сетки (0.9 = 90%). */
		gridStartPlateFraction: 0.4,
		/** Логотип стартует после этой доли анимации карточки (0.7 = 75%). */
		plateStartLogoFraction: 0.7,
		/** Курсор: вертикаль → поворот X (±7°), горизонталь → поворот Y (±~3.3°). */
		cursorGridTilt: {
			rotXRange: 7,
			rotYRange: 10 / 3,
			smoothDuration: 0.66,
		},
		/** Hover на логотипе / «Подробнее» на активной плите. */
		hoverMotion: {
			/** frontFloat ближе к грани плиты (world Z, локально плиты). */
			logoZPull: 0.004,
			/** Кнопка «Подробнее» выше поверхности плиты. */
			detailsZLift: 0.006,
			smoothDuration: 0.22,
			/** Минимальный reveal логотипа для hit-test. */
			minRevealAlpha: 0.55,
			/** Invisible hit-plane для Raycaster: простые плоскости вместо визуальных mesh. */
			hitAreas: {
				logo: { scaleX: 1.05, scaleY: 1.15 },
				details: { scaleX: 1.05, scaleY: 1.35 },
			},
		},
	},
	/**
	 * HDR-фон при фокусе на кейсе: liquidScale (меньше = ближе к фону).
	 * Синхронизируется со сдвигом сетки (gridLinear).
	 */
	backgroundFocus: {
		enabled: true,
		/** Без фокуса / дальний кейс */
		scaleUnfocused: 1,
		/** Ближайший кейс (НИПИГАЗ) в фокусе */
		scaleFocused: 0.5,
		/** Сглаживание liquidScale, сек */
		smoothDuration: 0.75,
	},
	/**
	 * Раскладка (R0/R4 пустые). Последняя D — пустая у камеры, проекты — предпоследние:
	 * R1: три предпоследние → 01, 02, 03
	 * R2: три предпоследние → 04, 05, 06
	 * R3: предпоследняя → 07
	 */
	projectPlateRowIndex: 1,
	projectsPerRow: 3,
	/** Пустых плит у переднего края ряда после блока проектов (D59). */
	projectPlateDepthTailPadding: 1,
};

export { portfolioHubLogoConfig } from "./portfolioHubLogoConfig.js";

/** @deprecated R3F-legacy: постобработка bloom — siteBloomConfig.js */
export const portfolioHubBloom = siteBloomArtDirection;

export const portfolioHubLights = {
	ambient: { color: "#c8d8f0", intensity: 0 },
	directionals: [
		{
			id: "light1",
			color: "#0091eb",
			intensity: 5,
			position: [-20, -2.2, -18.5],
		},
		{
			id: "light2",
			color: "#5381ac",
			intensity: 5,
			position: [-1.8, 9.1, 20],
		},
	],
	rectAreas: [
		{
			id: "rect1",
			color: "#0a2d48",
			intensity: 18.16,
			width: 20,
			height: 20,
			position: [-4, -3.3, 3.5],
			rotation: [69, 6, 0],
		},
		{
			id: "rect2",
			color: "#00b3ff",
			intensity: 17.5,
			width: 5,
			height: 10,
			position: [1, 8.5, 13.2],
			rotation: [0, -42, 0],
		},
		{
			id: "rect3",
			color: "#3d8abd",
			intensity: 9,
			width: 16,
			height: 30.8,
			position: [-9.7, 7.8, 11.5],
			rotation: [-94, 19, -11],
		},
	],
};

export function getPlateDepthStep() {
	const { depth, depthGap } = portfolioHubPlatesConfig;
	return depth + depthGap;
}

/**
 * Старт сетки по Z: передний край последней D на том же world-Z, что reference-сетки (20 col).
 */
export function getPlateDepthStartZ(platesPerRow = PORTFOLIO_HUB_PLATES_PER_ROW) {
	const depthStep = getPlateDepthStep();
	const referenceCount = PORTFOLIO_HUB_DEPTH_REFERENCE_COUNT;
	const referenceStartZ = getPlateDepthStartZForReference(referenceCount);
	const frontWorldZ = referenceStartZ + (referenceCount - 1) * depthStep;
	const depthShift = portfolioHubPlatesConfig.gridDepthShiftPlates ?? 0;
	return frontWorldZ - (platesPerRow - 1) * depthStep + depthShift * depthStep;
}

/** Якорь переднего края reference-сетки (D19 при count=20). */
function getPlateDepthStartZForReference(referenceCount) {
	const depthStep = getPlateDepthStep();
	const padding = PORTFOLIO_HUB_PROJECT_DEPTH_OFFSET;
	const innerCount = referenceCount - padding;

	if (innerCount < 2 || padding <= 0) {
		return -((referenceCount - 1) * depthStep) / 2;
	}

	const innerStartZ = -((innerCount - 1) * depthStep) / 2;
	const frontWorldZ = innerStartZ + (innerCount - 1) * depthStep;
	return frontWorldZ - (referenceCount - 1) * depthStep;
}

export function buildPlateGridLayouts(rowCount = PORTFOLIO_HUB_ROW_COUNT, platesPerRow = PORTFOLIO_HUB_PLATES_PER_ROW) {
	const { plateSize, depth, rowGap } = portfolioHubPlatesConfig;
	const rowStep = plateSize + rowGap;
	const depthStep = getPlateDepthStep();

	const startY = -((rowCount - 1) * rowStep) / 2;
	const startZ = getPlateDepthStartZ(platesPerRow);

	const layouts = [];

	for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
		for (let plateIndex = 0; plateIndex < platesPerRow; plateIndex += 1) {
			layouts.push({
				rowIndex,
				plateIndex,
				position: [0, startY + rowIndex * rowStep, startZ + plateIndex * depthStep],
				size: [plateSize, plateSize, depth],
			});
		}
	}

	return layouts;
}

export function getPlateRowStep() {
	const { plateSize, rowGap } = portfolioHubPlatesConfig;
	return plateSize + rowGap;
}

export function getPlateLayoutPosition(rowIndex, plateIndex) {
	const rowCount = PORTFOLIO_HUB_ROW_COUNT;
	const platesPerRow = PORTFOLIO_HUB_PLATES_PER_ROW;
	const rowStep = getPlateRowStep();
	const depthStep = getPlateDepthStep();
	const startY = -((rowCount - 1) * rowStep) / 2;
	const startZ = getPlateDepthStartZ(platesPerRow);

	return [0, startY + rowIndex * rowStep, startZ + plateIndex * depthStep];
}

export function getProjectPlateLayout(projectIndex) {
	const { projectPlateRowIndex, projectsPerRow, projectPlateDepthTailPadding } = portfolioHubPlatesConfig;
	const platesPerRow = PORTFOLIO_HUB_PLATES_PER_ROW;
	const col = projectIndex % projectsPerRow;
	const rowOffset = Math.floor(projectIndex / projectsPerRow);
	const rowIndex = projectPlateRowIndex + rowOffset;

	const projectsRemaining = projectsData.length - rowOffset * projectsPerRow;
	const projectsInRow = Math.min(projectsPerRow, projectsRemaining);
	const tailPadding = projectPlateDepthTailPadding ?? 1;
	const blockStart = platesPerRow - tailPadding - projectsInRow;

	return {
		rowIndex,
		plateIndex: blockStart + col,
	};
}

export function getProjectPlateLocalPosition(projectIndex) {
	const { rowIndex, plateIndex } = getProjectPlateLayout(projectIndex);
	return getPlateLayoutPosition(rowIndex, plateIndex);
}

export function getProjectPlateFlatIndex(projectIndex) {
	const { rowIndex, plateIndex } = getProjectPlateLayout(projectIndex);
	return rowIndex * PORTFOLIO_HUB_PLATES_PER_ROW + plateIndex;
}

export function getGridFocusSlide(projectIndex) {
	if (projectIndex < 0) {
		return { y: 0, z: 0 };
	}

	const anchor = getProjectPlateLocalPosition(0);
	const target = getProjectPlateLocalPosition(projectIndex);

	return {
		y: anchor[1] - target[1],
		z: anchor[2] - target[2],
	};
}

export function getGridFocusSlideZ(projectIndex) {
	return getGridFocusSlide(projectIndex).z;
}

export function buildPlateRowLayouts(count = projectsData.length) {
	const { plateSize, depth, rowGap } = portfolioHubPlatesConfig;
	const step = plateSize + rowGap;
	const startX = -((count - 1) * step) / 2;

	return Array.from({ length: count }, (_, index) => ({
		position: [startX + index * step, 0, 0],
		size: [plateSize, plateSize, depth],
	}));
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

/**
 * Близость кейса для фона: 1 у первого, меньше у следующих в списке.
 * @param {number} projectIndex
 */
export function getHubCaseDepthFocusFactor(projectIndex) {
	if (projectIndex < 0) {
		return 0;
	}

	const count = projectsData.length;
	if (count <= 1) {
		return 1;
	}

	return 1 - projectIndex / (count - 1);
}

/** liquidScale HDR-фона по прогрессу фокуса 0…1. */
export function getHubBackgroundTargetScale(focusAmount) {
	const cfg = portfolioHubPlatesConfig.backgroundFocus;
	const t = clamp01(focusAmount);
	return cfg.scaleUnfocused + (cfg.scaleFocused - cfg.scaleUnfocused) * t;
}

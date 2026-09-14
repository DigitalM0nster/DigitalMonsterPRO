import { canAdvanceSceneText } from "./sceneTextLocale.js";

export const NARRATIVE_COPY = {
	lightTrails: [
		[
			["УВЛЕКАЕМ", "С ПЕРВОГО ДВИЖЕНИЯ"],
			["ВЫЗЫВАЕМ ЭМОЦИИ", "БЕЗ ЛИШНИХ СЛОВ"],
			["ПРЕВРАЩАЕМ ИНТЕРЕС", "В ЖЕЛАНИЕ ИССЛЕДОВАТЬ"],
			["ДЕЛАЕМ ЗРИТЕЛЯ", "УЧАСТНИКОМ"],
			["ОТКРЫВАЕМ НОВОЕ", "В ПРИВЫЧНОМ"],
			["ОСТАВЛЯЕМ ЧУВСТВО", "К КОТОРОМУ ВОЗВРАЩАЮТСЯ"],
		],
		[
			["DRAWN IN", "FROM THE FIRST MOVE"], ["EVOKING EMOTION", "BEYOND WORDS"],
			["TURNING INTEREST", "INTO A DESIRE TO EXPLORE"], ["FROM SPECTATOR", "TO PARTICIPANT"],
			["REVEALING THE NEW", "WITHIN THE FAMILIAR"], ["CREATING A FEELING", "WORTH COMING BACK TO"],
		],
		[
			["从第一次互动", "就引人入胜"], ["无需多言", "也能触动心弦"],
			["让兴趣", "化为探索的渴望"], ["让观看者", "成为参与者"],
			["在熟悉之中", "发现全新可能"], ["留下难忘的感受", "让人愿意再次回到这里"],
		],
	],
	syntheticCore: [
		[["ПРОБУЖДАЕМ", "ЛЮБОПЫТСТВО", "За каждым открытием —", "желание идти дальше."]],
		[["AWAKENING", "CURIOSITY", "Every discovery brings", "a desire to go further."]],
		[["唤醒好奇心", "探索更多可能", "每一次发现，", "都让人想要继续探索。"]],
	],
};

export const NARRATIVE_DELAY = 1.5;
export const CORE_NARRATIVE_DELAY = 0;
export const CORE_NARRATIVE_LABEL = ["ЗА ГРАНЬЮ ПРИВЫЧНОГО", "BEYOND THE ORDINARY", "超越寻常"];
export const TRAIL_PHRASE_DURATION = 6.8;
export const TRAIL_VISIBLE_DURATION = 6.1;

export function trailNarrativeWallPosition(side, radius) {
	const wallHeight = 6;
	return {
		x: side * radius * 4 / 9,
		y: wallHeight,
		z: -64,
	};
}

export function advanceNarrative(elapsed, delta, state, variant = "lightTrails") {
	const reveal = narrativeFrame(elapsed, variant).reveal;
	// SceneManager updates only the visible mix pair. Start the core caption
	// with its incoming layer, instead of waiting for the route to settle.
	const canAdvance = variant === "syntheticCore"
		? state.started && (state.current || state.transitioning)
		: canAdvanceSceneText(state, reveal > 0 && reveal < 1);
	return canAdvance
		? elapsed + Math.max(0, Math.min(delta, 0.05)) : elapsed;
}

export function narrativeFrame(elapsed, variant) {
	const age = Math.max(0, elapsed - (variant === "syntheticCore" ? CORE_NARRATIVE_DELAY : NARRATIVE_DELAY));
	if (variant === "syntheticCore") return { state: 0, reveal: Math.min(1, age / 1.15), progress: 0, side: 1 };
	const state = Math.floor(age / TRAIL_PHRASE_DURATION) % NARRATIVE_COPY.lightTrails[0].length;
	const phase = age % TRAIL_PHRASE_DURATION;
	// One caption at a time, with a blank interval before changing its side / atlas cell.
	return {
		state, side: state % 2 === 0 ? 1 : -1,
		reveal: Math.max(0, Math.min(1, phase / 0.95, (TRAIL_VISIBLE_DURATION - phase) / 0.95)),
		progress: Math.min(1, phase / TRAIL_VISIBLE_DURATION),
	};
}

export function coreNarrativeLayout(width, height) {
	const compact = width <= 1024;
	const short = height < 560;
	const landscape = short && width > height;
	const textWidth = landscape ? Math.min(540, width * (compact ? .45 : .32)) : compact ? Math.min(420, width - 32) : Math.min(540, width * 0.32);
	const textHeight = textWidth * 384 / 1024;
	const x = compact ? 16 : Math.max(166, width * 0.12);
	const portrait = compact && height > width;
	const y = (compact || short) && !portrait
		? Math.max(66, (height - textHeight - 88) * 0.5)
		: compact ? 84 : height * 0.35;
	const helperTop = portrait ? height - (height < 640 ? 112 : 152) : y + textHeight + 64;
	return {
		x,
		y, width: textWidth, height: textHeight,
		helperX: compact ? 40 : short ? x + 24 : Math.max(190, width * 0.145),
		helperY: compact || short ? height - helperTop : height * 0.34,
	};
}

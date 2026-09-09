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

export function advanceNarrative(elapsed, delta, { started, current, transitioning }) {
	return started && current && !transitioning ? elapsed + Math.max(0, Math.min(delta, 0.05)) : elapsed;
}

export function narrativeFrame(elapsed, variant) {
	const age = Math.max(0, elapsed - NARRATIVE_DELAY);
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
	const compact = width < 700;
	const textWidth = compact ? Math.min(360, width - 60) : Math.min(540, width * 0.32);
	const y = compact ? Math.max(100, height * 0.13) : height * 0.35;
	const textHeight = textWidth * 384 / 1024;
	return {
		x: compact ? 30 : Math.max(166, width * 0.12),
		y, width: textWidth, height: textHeight,
		helperX: compact ? 45 : Math.max(190, width * 0.145),
		helperY: compact ? height - Math.max(y + textHeight + 56, Math.min(height * 0.72, height - 215)) : height * 0.34,
	};
}

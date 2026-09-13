// Panel centres are composed for the four calibrated close-up cameras (top-down screen coordinates).
export const MMK1_DETAIL_SIZE = { width: 560, height: 320, rowCount: 5 };
export const MMK1_DETAIL_VIEW = { height: 176, uvBottom: 0.35, uvTop: 0.9 };

export const MMK1_DETAIL_TYPE = {
	title: { size: 42, font: '500 42px ManifoldExtended, "Segoe UI", sans-serif', tracking: 0.6, space: 12 },
	body: { size: 22, font: '400 22px MazzardM, "Segoe UI", sans-serif', tracking: 0.1, space: 5.7 },
};

export const MMK1_HOTSPOT_DETAILS = [
	{
		center: [0.42, 0.74],
		headlines: { ru: ["ВЫХОДИМ", "ЗА ПРИВЫЧНОЕ"], en: ["GOING BEYOND", "THE FAMILIAR"], zh: ["突破惯常", "打开全新可能"] },
		copy: {
			ru: ["Выходим за привычное", "Превращаем смелую идею в мир,", "который хочется исследовать."],
			en: ["Going beyond the familiar", "Turning a bold idea into a world", "you want to explore."],
			zh: ["突破惯常", "让大胆的创意成为一个", "令人想要探索的世界。"],
		},
	},
	{
		center: [0.31, 0.45],
		headlines: { ru: ["СЛОЖНОЕ", "ДЕЛАЕМ ПРОСТЫМ"], en: ["MAKING COMPLEX", "FEEL SIMPLE"], zh: ["让复杂", "变得简单"] },
		copy: {
			ru: ["Сложное делаем простым", "Всё продумано до деталей.", "Вам остаётся только действовать."],
			en: ["Making complex feel simple", "Every detail is thought through.", "Your next move feels natural."],
			zh: ["让复杂变得简单", "每一处细节都经过深思熟虑。", "你只需自然而然地行动。"],
		},
	},
	{
		center: [0.59, 0.60],
		headlines: { ru: ["СОЗДАЁМ", "ПРИТЯЖЕНИЕ"], en: ["CREATING", "ATTRACTION"], zh: ["创造", "吸引力"] },
		copy: {
			ru: ["Создаём притяжение", "Первый взгляд цепляет.", "Каждое движение раскрывает больше."],
			en: ["Creating attraction", "The first glance draws you in.", "Every move reveals something new."],
			zh: ["创造吸引力", "第一眼就引人入胜。", "每一次互动，都有新的发现。"],
		},
	},
	{
		center: [0.64, 0.40],
		headlines: { ru: ["СМЕЛЫЙ ДИЗАЙН", "ТОЧНАЯ РАБОТА"], en: ["BOLD DESIGN", "PRECISE EXECUTION"], zh: ["大胆设计", "精准实现"] },
		copy: {
			ru: ["Смелый дизайн. Точная работа.", "Впечатление снаружи.", "Продуманная система внутри."],
			en: ["Bold design. Precise execution.", "A striking first impression.", "Thoughtful engineering beneath."],
			zh: ["大胆设计，精准实现", "外在令人印象深刻。", "内在由严谨的技术支撑。"],
		},
	},
];

export const MMK1_OVERVIEW = {
	headlines: {
		ru: ["ПОДНИМАЕМ ИДЕИ", "НА НОВЫЙ УРОВЕНЬ"],
		en: ["TAKING IDEAS", "TO NEW HEIGHTS"],
		zh: ["让创意", "再上新高度"],
	},
	guide: {
		ru: "НАЖМИТЕ НА КРУГ",
		en: "SELECT A CIRCLE",
		zh: "轻触圆点，探索细节",
	},
};

// Keep the prepared quad close to the slogan and its single-line interaction cue.
export const MMK1_OVERVIEW_VIEW = { height: 176, uvBottom: 0.275, uvTop: 0.825 };

export function getMmk1DetailLayout(index, width, height) {
	const adapted = width < 1280 || height <= 600;
	if (adapted) {
		const short = height <= 480;
		const portrait = width <= 768 && height > width;
		const left = portrait ? 12 : width <= 1024 ? 16 : 144;
		const overview = index === 4;
		const availableWidth = portrait ? Math.min(430, width - 24)
			: Math.min(overview ? 420 : 500, width * (overview ? .43 : .48) - left);
		// In the cab close-up the boom crosses the phone's upper text band.
		const top = overview ? (short ? 76 : 92) : portrait && index === 1 ? Math.max(144, height * .4) : (short ? 116 : 144);
		const bottom = short ? 62 : 80;
		const contentHeight = overview ? MMK1_OVERVIEW_VIEW.height : MMK1_DETAIL_VIEW.height;
		const scale = Math.max(.1, Math.min(1, availableWidth / MMK1_DETAIL_SIZE.width, (height - top - bottom) / contentHeight));
		const panelWidth = MMK1_DETAIL_SIZE.width * scale, panelHeight = contentHeight * scale;
		return { x: left, y: height - top - panelHeight, scale, width: panelWidth, height: panelHeight };
	}
	// Preserve the authored composition on ordinary desktop viewports.
	if (index === 4) {
		const scale = Math.min(1, (width - 330) / MMK1_DETAIL_SIZE.width, (height - 160) / MMK1_OVERVIEW_VIEW.height);
		const panelWidth = MMK1_DETAIL_SIZE.width * scale, panelHeight = MMK1_OVERVIEW_VIEW.height * scale;
		const x = Math.min(width - 170 - panelWidth, Math.max(160, width * .145));
		return { x, y: Math.max(48, height * .58 - panelHeight), scale, width: panelWidth, height: panelHeight };
	}
	const scale = Math.min(440 / MMK1_DETAIL_SIZE.width, (width - 330) / MMK1_DETAIL_SIZE.width, (height - 180) / MMK1_DETAIL_VIEW.height);
	const panelWidth = MMK1_DETAIL_SIZE.width * scale, panelHeight = MMK1_DETAIL_VIEW.height * scale;
	const [cx, cy] = MMK1_HOTSPOT_DETAILS[index].center;
	const x = Math.max(160, Math.min(width - 170 - panelWidth, width * cx - panelWidth / 2));
	const y = Math.max(48, Math.min(height - panelHeight - 190, height * (1 - cy) - panelHeight / 2));
	return { x, y, scale, width: panelWidth, height: panelHeight };
}

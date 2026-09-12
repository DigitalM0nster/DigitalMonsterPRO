// Panel centres are composed for the four calibrated close-up cameras (top-down screen coordinates).
export const MMK1_DETAIL_SIZE = { width: 560, height: 320, rowCount: 5 };

export const MMK1_DETAIL_TYPE = {
	title: { size: 80, font: '500 80px ManifoldExtended, "Segoe UI", sans-serif', tracking: 0.8, space: 22 },
	body: { size: 20, font: '400 20px MazzardM, "Segoe UI", sans-serif', tracking: 0.1, space: 5.2 },
};

export const MMK1_HOTSPOT_DETAILS = [
	{
		center: [0.42, 0.74],
		headlines: { ru: ["А ТАК МОЖНО", "БЫЛО?"], en: ["WAIT, YOU", "CAN DO THAT?"], zh: ["原来还可以", "这样？"] },
		copy: {
			ru: ["А так можно было?", "Сайт не обязан быть страницей.", "Он может стать местом,", "в котором хочется остаться."],
			en: ["Wait, you can do that?", "A website can be more than a page.", "It can be a place", "you feel like staying in."],
			zh: ["原来还可以这样？", "网站不必只是一张页面。", "它也可以成为一个", "让人愿意停留的地方。"],
		},
	},
	{
		center: [0.31, 0.45],
		headlines: { ru: ["ВЫ НАШЛИ", "ЕЩЁ ОДИН."], en: ["YOU FOUND", "ANOTHER ONE."], zh: ["又被你", "发现了。"] },
		copy: {
			ru: ["Вы нашли ещё один.", "Нам нравится ваше любопытство.", "Лучшие детали открываются тем,", "кто не спешит закрыть вкладку."],
			en: ["You found another one.", "We like your curiosity.", "The best details reward those", "who don't rush to close the tab."],
			zh: ["又被你发现了。", "我们喜欢你的好奇心。", "那些不急着关掉页面的人，", "总能发现更多有趣的细节。"],
		},
	},
	{
		center: [0.59, 0.60],
		headlines: { ru: ["ЭТО ТОЖЕ", "РАЗГОВОР."], en: ["A DIALOGUE,", "TOO."], zh: ["这也是", "一种对话。"] },
		copy: {
			ru: ["Это тоже разговор.", "Вы двигаете мышью — мир отвечает.", "Так интерфейс перестаёт быть", "просто картинкой на экране."],
			en: ["A conversation, too.", "You move. The world responds.", "An interface becomes more", "than a picture on a screen."],
			zh: ["这也是一种对话。", "你轻轻一动，世界就有了回应。", "于是界面不再只是", "屏幕上的一张图片。"],
		},
	},
	{
		center: [0.64, 0.40],
		headlines: { ru: ["СЛОЖНО", "ВНУТРИ."], en: ["COMPLEX", "UNDERNEATH."], zh: ["复杂，", "留在幕后。"] },
		copy: {
			ru: ["Сложно внутри.", "Хорошая работа часто незаметна.", "Вы просто нажимаете —", "и всё происходит как надо."],
			en: ["Complex underneath.", "Good work often goes unnoticed.", "You simply click —", "and everything falls into place."],
			zh: ["复杂，留在幕后。", "好的设计常常不露痕迹。", "你只需轻轻一点，", "一切就自然地发生了。"],
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
	const compact = width < 700;
	if (index === 4) {
		const scale = Math.min(1, (width - (compact ? 48 : 330)) / MMK1_DETAIL_SIZE.width);
		const panelWidth = MMK1_DETAIL_SIZE.width * scale;
		const panelHeight = MMK1_OVERVIEW_VIEW.height * scale;
		const x = compact ? 24 : Math.min(width - 170 - panelWidth, Math.max(160, width * 0.145));
		const y = compact ? 142 : Math.max(48, height * 0.58 - panelHeight);
		return { x, y, scale, width: panelWidth, height: panelHeight };
	}
	const scale = Math.min(1, (width - (compact ? 32 : 330)) / MMK1_DETAIL_SIZE.width);
	const panelWidth = MMK1_DETAIL_SIZE.width * scale;
	const panelHeight = MMK1_DETAIL_SIZE.height * scale;
	const [cx, cy] = MMK1_HOTSPOT_DETAILS[index].center;
	const left = compact ? 16 : 160;
	const right = compact ? 16 : 170;
	const x = compact ? (width - panelWidth) / 2 : Math.max(left, Math.min(width - right - panelWidth, width * cx - panelWidth / 2));
	const y = compact ? 90 : Math.max(36, Math.min(height - panelHeight - 190, height * (1 - cy) - panelHeight / 2));
	return { x, y, scale, width: panelWidth, height: panelHeight };
}

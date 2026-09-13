// Panel centres are composed for the four calibrated close-up cameras (top-down screen coordinates).
export const MMK1_DETAIL_SIZE = { width: 560, height: 200, rowCount: 4 };
export const MMK1_DETAIL_STATE_COUNT = 6;
export const MMK1_DETAIL_VIEW = { height: 192, uvBottom: 0.04, uvTop: 1 };

// Two samples per CSS pixel, independent of the scene's quality/downscale.
// Four shared detail compositions + two overview sizes fit within a 4K texture.
export function getMmk1DetailRasterRatio(maxTextureSize = 4096) {
	return Math.min(2, maxTextureSize / Math.max(MMK1_DETAIL_SIZE.width * 3, MMK1_DETAIL_SIZE.height * MMK1_DETAIL_STATE_COUNT));
}

export const MMK1_DETAIL_TYPE = {
	title: { size: 42, font: '500 42px ManifoldExtended, "Segoe UI", sans-serif', tracking: 0.6, space: 12 },
	body: { size: 22, font: '400 22px MazzardM, "Segoe UI", sans-serif', tracking: 0.1, space: 5.7 },
};

export const MMK1_HOTSPOT_DETAILS = [
	{
		center: [0.42, 0.74],
		headlines: { ru: ["РАСКРЫВАЕМ", "ВАШ ПРОДУКТ"], en: ["SHOWCASING", "YOUR PRODUCT"], zh: ["展现", "您的产品"] },
		copy: {
			ru: ["Раскрываем ваш продукт", "Показываем его возможности так,", "чтобы человек увидел пользу для себя."],
			en: ["Showcasing your product", "We show what it can do,", "so people see how it can help them."],
			zh: ["展现您的产品", "展示产品的功能，", "让用户看见它能为自己带来的价值。"],
		},
	},
	{
		center: [0.31, 0.45],
		headlines: { ru: ["СЛОЖНОЕ", "ДЕЛАЕМ ПОНЯТНЫМ"], en: ["MAKING THE COMPLEX", "CLEAR"], zh: ["复杂的产品", "清晰易懂"] },
		copy: {
			ru: ["Сложное делаем понятным", "Помогаем разобраться в продукте", "без лишних усилий."],
			en: ["Making the complex clear", "We help you understand the product", "without unnecessary effort."],
			zh: ["让复杂的产品清晰易懂", "帮用户轻松理解产品，", "无需花费多余精力。"],
		},
	},
	{
		center: [0.59, 0.60],
		headlines: { ru: ["ДЕЛАЕМ", "ЗАПОМИНАЮЩИМСЯ"], en: ["MAKING YOU", "MEMORABLE"], zh: ["让您", "令人难忘"] },
		copy: {
			ru: ["Делаем запоминающимся", "Находим выразительную форму,", "в которой узнают именно вас"],
			en: ["Making you memorable", "We find a distinctive form", "that people recognize as yours."],
			zh: ["让您令人难忘", "找到独特的表达形式，", "让人一眼认出您。"],
		},
	},
	{
		center: [0.64, 0.40],
		headlines: { ru: ["НАХОДИМ СПОСОБ", "РЕАЛИЗОВАТЬ"], en: ["FINDING A WAY", "TO MAKE IT HAPPEN"], zh: ["找到方法", "实现构想"] },
		copy: {
			ru: ["Находим способ реализовать", "Подбираем технологии под вашу задумку,", "даже когда готового решения ещё нет"],
			en: ["Finding a way to make it happen", "We choose technology to fit your idea,", "even when no ready-made solution exists."],
			zh: ["找到实现构想的方法", "为您的创意选择合适的技术，", "即使还没有现成的解决方案。"],
		},
	},
];

export const MMK1_OVERVIEW = {
	headlines: {
		ru: ["ПОДНИМАЕМ ИДЕИ", "НА НОВЫЙ УРОВЕНЬ"],
		en: ["TAKING IDEAS", "TO NEW HEIGHTS"],
		zh: ["让创意", "再上新高度"],
	},
	description: {
		ru: ["Находим в вашем продукте то, что", "заслуживает внимания, и превращаем это", "в опыт, который увлекает людей"],
		en: ["We find what deserves attention", "in your product and turn it into", "an experience that draws people in."],
		zh: ["发现您产品中值得关注的亮点，", "将它们转化为", "引人入胜的体验。"],
	},
};

// The same bounded quad holds the slogan and its three-line studio description.
export const MMK1_OVERVIEW_VIEW = { height: 176, uvBottom: 0.06, uvTop: 0.94 };

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
		const footer = overview ? 0 : 64;
		const scale = Math.max(.1, Math.min(1, availableWidth / MMK1_DETAIL_SIZE.width, (height - top - bottom - footer) / contentHeight));
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
	const scale = Math.min(480 / MMK1_DETAIL_SIZE.width, (width - 330) / MMK1_DETAIL_SIZE.width, (height - 180) / MMK1_DETAIL_VIEW.height);
	const panelWidth = MMK1_DETAIL_SIZE.width * scale, panelHeight = MMK1_DETAIL_VIEW.height * scale;
	const [cx, cy] = MMK1_HOTSPOT_DETAILS[index].center;
	const x = Math.max(160, Math.min(width - 170 - panelWidth, width * cx - panelWidth / 2));
	const y = Math.max(112, Math.min(height - panelHeight - 190, height * (1 - cy) - panelHeight / 2));
	return { x, y, scale, width: panelWidth, height: panelHeight };
}

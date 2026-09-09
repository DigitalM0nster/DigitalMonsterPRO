// Editorial place descriptions for this model. Infographics use its actual geometry.
const PROFILES = [
	[
		["ДЕЛОВОЙ ЦЕНТР", "Деловой адрес среди стеклянных башен.", "Днём здесь встречаются идеи, вечером", "в фасадах отражаются огни города."],
		["BUSINESS DISTRICT", "A business address among glass towers.", "Ideas meet here by day. After dark,", "the facades mirror the city lights."],
		["商务中心", "玻璃高楼间的城市商务空间。", "白天，灵感与人们在此相遇；", "入夜，立面映照城市灯火。"],
	],
	[
		["ПАНОРАМНЫЙ", "Башня задаёт силуэт района,", "а невысокие корпуса у её подножия", "возвращают городу человеческий масштаб."],
		["PANORAMA QUARTER", "A tower shapes the district skyline.", "The lower buildings at its feet bring", "the city back to a human scale."],
		["全景街区", "高塔勾勒出街区的天际线。", "塔下低层建筑围合成邻里空间，", "让城市重新回到宜人的尺度。"],
	],
	[
		["СТУПЕНИ ГОРОДА", "Разновысокие дома раскрывают квартал", "слой за слоем. За каждым поворотом —", "новый силуэт и свой городской масштаб."],
		["CITY TERRACES", "Buildings of different heights reveal", "the quarter layer by layer. Each turn", "opens up another view of the city."],
		["城市阶梯", "高低错落的建筑层层展开。", "每转过一个街角，都能看见", "不同的轮廓与城市尺度。"],
	],
	[
		["ТИХИЕ ДВОРЫ", "Невысокие дома, небольшие дворы", "и окна, за которыми идёт своя жизнь.", "Квартал, где город становится ближе."],
		["QUIET COURTYARDS", "Low buildings and intimate courtyards.", "Behind each window, a life of its own.", "A quarter that brings the city closer."],
		["静谧庭院", "低层住宅与小巧庭院相依。", "每一扇窗后，都有自己的生活。", "在这里，城市变得更加亲近。"],
	],
	[
		["ГОРОДСКАЯ ЛИНИЯ", "Ровная линия крыш и знакомый ритм", "окон связывают отдельные дома.", "Цельный фрагмент большого города."],
		["THE CITY LINE", "A steady roofline and a familiar rhythm", "of windows tie the buildings together.", "One coherent piece of a larger city."],
		["城市脉络", "平缓的屋顶轮廓与有序的窗格，", "将一栋栋建筑串联起来，", "组成大城市中完整的一隅。"],
	],
	[
		["СКВЕР «МАЯК»", "Зелёный остров в потоке города.", "Четыре аллеи ведут к воде и", "световому монументу в центре."],
		["BEACON GARDEN", "A green island in the flow of the city.", "Four paths lead to the water and", "the illuminated monument at its heart."],
		["灯塔花园", "城市流动中的一座绿色小岛。", "四条步道汇向水景，", "与中央发光的纪念雕塑相连。"],
	],
	[
		["СКВЕР «ОРБИТА»", "Круговая прогулка среди деревьев.", "В центре — вода и свет; снаружи —", "вечерний ритм городских улиц."],
		["ORBIT GARDEN", "A circular walk among the trees.", "Water and light at the centre; beyond,", "the evening rhythm of city streets."],
		["环影花园", "环形步道穿行于树木之间。", "中心是水与光，环外则是", "城市街道在夜晚的节奏。"],
	],
];

export const CITY_HUD_STATE_COUNT = PROFILES.length;
const BODY_TYPE = { size: 14, font: '400 14px MazzardM, "Segoe UI", sans-serif', tracking: 0, space: 3.6 };
const META_TYPE = { size: 12, font: '400 12px MazzardM, "Segoe UI", sans-serif', tracking: .15, space: 3 };

export function districtHudState(district) {
	if (district.kind === "park") return 5 + district.parkIndex;
	const heights = district.buildings.map(bounds => bounds[4] - bounds[1]).sort((a, b) => a - b);
	const tallest = heights.at(-1), median = heights[Math.floor(heights.length / 2)];
	if (district.kind === "office") return 0;
	if (tallest > 17 && tallest > median * 1.55) return 1;
	if (tallest > median * 1.7) return 2;
	return tallest < 7 ? 3 : 4;
}

export function districtHudMetrics(district) {
	const heights = new Float32Array(5), count = district.buildings.length;
	const tallest = Math.max(1, ...district.buildings.map(b => b[4] - b[1]));
	district.buildings.forEach((b, i) => { heights[i] = (b[4] - b[1]) / tallest; });
	return { heights, count: district.kind === "park" ? 4 : count, park: district.kind === "park" };
}

export function createDistrictHudContent() {
	return Array.from({ length: 3 }, (_, locale) => PROFILES.map((profile, state) => {
		const park = state >= 5, copy = profile[locale];
		return [
			{ text: (park ? ["ОБЩЕСТВЕННЫЙ СКВЕР", "PUBLIC GARDEN", "公共花园"] : ["ГОРОДСКОЙ КВАРТАЛ", "CITY QUARTER", "城市街区"])[locale], x: 18, y: 22, size: 10, color: "#6fbbd4" },
			{ text: copy[0], x: 18, y: 51, size: 16, color: "#e0f2f8" },
			...copy.slice(1).map((text, row) => ({ text, x: 18, y: 83 + row * 20, ...BODY_TYPE, color: "#c8d8df", row })),
			{ text: (park ? ["АЛЛЕИ", "PATHS", "步道"] : ["ЗДАНИЯ", "BUILDINGS", "建筑"])[locale], x: 18, y: 162, ...META_TYPE, color: "#8cacba" },
			{ text: (park ? ["к центру", "to the centre", "通向中心"] : ["в квартале", "in this quarter", "位于街区内"])[locale], x: 43, y: 190, ...META_TYPE, color: "#c8d8df" },
			{ text: (park ? ["ПЛАН СКВЕРА", "GARDEN PLAN", "花园平面"] : ["СИЛУЭТ КОРПУСОВ", "BUILDING HEIGHTS", "建筑轮廓"])[locale], x: 172, y: 162, ...META_TYPE, color: "#8cacba" },
		];
	}));
}

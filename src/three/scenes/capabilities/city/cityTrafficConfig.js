export const CITY_TRAFFIC_DEFAULTS = Object.freeze({
	frontIntensity: 5.1, rearIntensity: 2, lightVariation: 1,
	frontSize: 1, rearSize: 1, bodyScale: 1, speed: 1, density: 1,
	blueColor: "#24bdff", whiteColor: "#8dc4fc", yellowColor: "#ffdd89",
	whiteShare: 0.26, yellowShare: 0.01,
	roadIntensity: 1.5, windowIntensity: 1, fogDensity: 0.12, fogColor: "#00050b", bloom: 3,
});

export const CITY_TRAFFIC_CONTROLS = [
	["frontIntensity", "Яркость передних фар", 0, 25, 0.1],
	["rearIntensity", "Яркость задних фар", 0, 5, 0.05],
	["lightVariation", "Разница яркости машин", 0, 1, 0.01],
	["frontSize", "Размер передних огоньков", 0.3, 3, 0.05],
	["rearSize", "Размер задних огоньков", 0.3, 3, 0.05],
	["bodyScale", "Размер корпусов", 0.2, 4, 0.05],
	["bloom", "Сила bloom сайта", 0, 5, 0.05],
	["blueColor", "Голубые фары", "color"],
	["whiteColor", "Белые фары", "color"],
	["yellowColor", "Жёлтые фары", "color"],
	["whiteShare", "Доля белых фар", 0, 0.4, 0.01],
	["yellowShare", "Доля жёлтых фар", 0, 0.2, 0.005],
	["speed", "Скорость потока", 0, 3, 0.05],
	["density", "Плотность потока", 0.1, 1, 0.05],
	["roadIntensity", "Свечение полос", 0, 3, 0.05],
	["windowIntensity", "Свечение окон", 0, 4, 0.05],
	["fogDensity", "Плотность тумана", 0, 0.3, 0.005],
	["fogColor", "Цвет тумана", "color"],
];

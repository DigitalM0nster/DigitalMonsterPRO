import { createSceneHudAtlas } from "../../../objects/sceneHud/sceneHudAtlas.js";

const COPY = [
	["ИССЛЕДУЙТЕ ЯДРО", "НАВЕДИТЕ / НАЖМИТЕ", "42 МОДУЛЯ", "СИСТЕМА СОБРАНА", "АРХИТЕКТУРА РАСКРЫТА", "НАЖМИТЕ · ОТПРАВИТЬ ИМПУЛЬС", "НАЖМИТЕ НА СФЕРУ · РАСКРЫТЬ", "НАЖМИТЕ НА СФЕРУ · СОБРАТЬ", "ИМПУЛЬС ОТПРАВЛЕН", "ЯДРО ОТВЕЧАЕТ"],
	["EXPLORE THE CORE", "HOVER / CLICK", "42 MODULES", "SYSTEM ASSEMBLED", "ARCHITECTURE REVEALED", "CLICK · SEND A PULSE", "CLICK THE SPHERE · EXPAND", "CLICK THE SPHERE · ASSEMBLE", "PULSE SENT", "CORE RESPONDING"],
	["探索核心", "悬停 / 点击", "42 个模块", "系统已组装", "结构已展开", "点击 · 发送脉冲", "点击球体 · 展开", "点击球体 · 组装", "脉冲已发送", "核心响应中"],
];

export function createHudAtlas(pixelRatio = 1) {
	const states = COPY.map((copy) => Array.from({ length: 6 }, (_, state) => [
		{ text: copy[0], x: 82, y: 36, size: 12, color: "#d3ebf4" },
		{ text: copy[1], x: 82, y: 56, size: 10, color: "#9bbdcb" },
		{ text: state >= 4 ? copy[8] : copy[2], x: 15, y: 104, size: state >= 4 ? 14 : 16, color: "#d3f3ff", row: 0 },
		{ text: state >= 4 ? copy[9] : copy[state % 2 ? 4 : 3], x: 15, y: 131, size: 10, color: "#9bcddd", row: 1 },
		{ text: copy[state >= 2 && state < 4 ? (state % 2 ? 7 : 6) : 5], x: 15, y: 164, size: 10, color: "#b2cbd5", row: 2 },
	]));
	return createSceneHudAtlas(pixelRatio, states, "core-connection");
}

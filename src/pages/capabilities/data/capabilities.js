export const CAPABILITIES = [
	{
		id: "interactive-scenes",
		number: "01",
		path: "/capabilities/interactive-scenes",
		title: "Интерактивные сцены",
		description: "Погружение в историю бренда через 3D и анимацию.",
		interaction: "Тяните",
	},
	{
		id: "living-interface",
		number: "02",
		path: "/capabilities/living-interface",
		title: "Живой интерфейс",
		description: "Элементы реагируют на каждое действие пользователя.",
		interaction: "Наведите",
	},
	{
		id: "cinematic-transitions",
		number: "03",
		path: "/capabilities/cinematic-transitions",
		title: "Кинематографические переходы",
		description: "Плавные переходы и эффекты уровня премиальных приложений.",
		interaction: "Прокрутите",
	},
	{
		id: "instant-3d",
		number: "04",
		path: "/capabilities/instant-3d",
		title: "3D без ожидания",
		description: "Оптимизация и стриминг сцен прямо в браузере.",
		interaction: "Вращайте",
	},
	{
		id: "digital-presentations",
		number: "05",
		path: "/capabilities/digital-presentations",
		title: "Цифровые презентации",
		description: "Продукт рассказывает о себе сам — на новом уровне.",
		interaction: "Исследуйте",
	},
];

export function getCapabilityBySlug(slug) {
	return CAPABILITIES.find((item) => item.id === slug) ?? CAPABILITIES[0];
}

export function isCapabilitiesPath(pathname) {
	return String(pathname ?? "").startsWith("/capabilities");
}

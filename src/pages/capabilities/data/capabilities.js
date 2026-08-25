export const CAPABILITIES = [
	{
		id: "mmk1",
		number: "01",
		path: "/capabilities/mmk1",
		title: "ММК-1",
		description: "Интерактивная 3D-сцена башенного крана в цифровой строительной среде.",
		interaction: "Исследуйте",
		sceneVariant: "mmk1",
	},
	{
		id: "light-trails",
		number: "02",
		path: "/capabilities/light-trails",
		title: "Световые траектории",
		description: "Поток световых линий движется сквозь бесконечную цифровую архитектуру.",
		interaction: "Управляйте потоком",
		sceneVariant: "lightTrails",
	},
	{
		id: "synthetic-core",
		number: "03",
		path: "/capabilities/synthetic-core",
		title: "Синтетическое ядро",
		description: "Шаблонная сцена с пульсирующим ядром и орбитальными контурами.",
		interaction: "Изучите структуру",
		sceneVariant: "syntheticCore",
	},
	{
		id: "spatial-matrix",
		number: "04",
		path: "/capabilities/spatial-matrix",
		title: "3D-город",
		description: "Авторская GLB-модель городской застройки с сохранённой геометрией и материалами.",
		interaction: "Рассмотрите город",
		sceneVariant: "spatialMatrix",
	},
];

export const CAPABILITY_SCENE_VARIANTS = CAPABILITIES.map((item) => item.sceneVariant);

export function getCapabilityBySlug(slug) {
	return CAPABILITIES.find((item) => item.id === slug) ?? CAPABILITIES[0];
}

export function getCapabilityById(id) {
	return CAPABILITIES.find((item) => item.id === id) ?? CAPABILITIES[0];
}

export function getCapabilitySceneVariant(id) {
	return getCapabilityById(id).sceneVariant;
}

export function getCapabilityBySceneVariant(sceneVariant) {
	return CAPABILITIES.find((item) => item.sceneVariant === sceneVariant) ?? CAPABILITIES[0];
}

export function isCapabilitiesPath(pathname) {
	return String(pathname ?? "").startsWith("/capabilities");
}

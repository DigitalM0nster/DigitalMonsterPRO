export const CAPABILITIES = [
	{
		id: "mmk1",
		number: "01",
		path: "/capabilities/mmk1",
		sceneId: "capabilities:mmk1",
		title: "ММК-1",
		description: "Интерактивная 3D-сцена башенного крана в цифровой строительной среде.",
		interaction: "Исследуйте",
		sceneVariant: "mmk1",
	},
	{
		id: "light-trails",
		number: "02",
		path: "/capabilities/light-trails",
		sceneId: "capabilities:lightTrails",
		title: "Световые траектории",
		description: "Поток световых линий движется сквозь бесконечную цифровую архитектуру.",
		interaction: "Управляйте потоком",
		sceneVariant: "lightTrails",
	},
	{
		id: "synthetic-core",
		number: "03",
		path: "/capabilities/synthetic-core",
		sceneId: "capabilities:syntheticCore",
		title: "Синтетическое ядро",
		description: "Многослойное техногенное ядро: разберите механизм касанием и соберите его обратно.",
		interaction: "Разберите ядро",
		sceneVariant: "syntheticCore",
	},
	{
		id: "spatial-matrix",
		number: "04",
		path: "/capabilities/spatial-matrix",
		sceneId: "capabilities:spatialMatrix",
		title: "3D-город",
		description: "Авторская GLB-модель городской застройки с сохранённой геометрией и материалами.",
		interaction: "Рассмотрите город",
		sceneVariant: "spatialMatrix",
	},
];

export const CAPABILITY_SCENE_IDS = CAPABILITIES.map((item) => item.sceneId);
export const FIRST_CAPABILITY_PATH = CAPABILITIES[0].path;
export const FIRST_CAPABILITY_SCENE_ID = CAPABILITIES[0].sceneId;

function normalizePath(pathname) {
	return String(pathname ?? "/").replace(/\/+$/, "") || "/";
}

export function getCapabilityBySlug(slug) {
	return CAPABILITIES.find((item) => item.id === slug) ?? CAPABILITIES[0];
}

export function getCapabilityById(id) {
	return CAPABILITIES.find((item) => item.id === id) ?? CAPABILITIES[0];
}

export function getCapabilityBySceneId(sceneId) {
	return CAPABILITIES.find((item) => item.sceneId === sceneId) ?? null;
}

export function getCapabilityByPath(pathname) {
	const normalized = normalizePath(pathname);
	if (normalized === "/capabilities") return CAPABILITIES[0];
	return CAPABILITIES.find((item) => item.path === normalized) ?? null;
}

export function resolveCapabilitySceneId(pathname) {
	const normalized = normalizePath(pathname);
	const capability = getCapabilityByPath(normalized);
	if (capability) return capability.sceneId;
	return normalized.startsWith("/capabilities/") ? FIRST_CAPABILITY_SCENE_ID : null;
}

export function isCapabilitySceneId(sceneId) {
	return CAPABILITY_SCENE_IDS.includes(sceneId);
}

export function isCapabilitiesPath(pathname) {
	const normalized = normalizePath(pathname);
	return normalized === "/capabilities" || normalized.startsWith("/capabilities/");
}

export const CAPABILITIES = [
	{
		id: "mmk1",
		number: "01",
		path: "/capabilities/mmk1",
		title: "ММК-1",
		description: "Интерактивная 3D-сцена башенного крана с цифровой строительной средой и реакцией на курсор.",
		interaction: "Исследуйте",
	},
	{
		id: "light-trails",
		number: "02",
		path: "/capabilities/light-trails",
		title: "Световые траектории",
		description: "Поток световых линий движется сквозь бесконечную цифровую архитектуру и пластично следует за курсором.",
		interaction: "Управляйте потоком",
	},
];

export function getCapabilityBySlug(slug) {
	return CAPABILITIES.find((item) => item.id === slug) ?? CAPABILITIES[0];
}

export function isCapabilitiesPath(pathname) {
	return String(pathname ?? "").startsWith("/capabilities");
}

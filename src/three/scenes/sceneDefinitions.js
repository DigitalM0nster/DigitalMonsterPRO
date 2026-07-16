import * as THREE from "three";

/**
 * Placeholder-сцены (кейсы 02–05, about, contacts).
 * case01 — Case1Scene (rings.glb); home и portfolioHub — отдельные классы.
 */
export const PLACEHOLDER_SCENE_DEFINITIONS = [
	{
		id: "case02",
		label: "Кейс 02",
		createGeometry: () => new THREE.ConeGeometry(1.1, 2.0, 32),
		color: 0xff6b35,
		spinSpeed: { x: 0.25, y: 0.75 },
	},
	{
		id: "case03",
		label: "Кейс 03",
		createGeometry: () => new THREE.OctahedronGeometry(1.25, 0),
		color: 0xffd700,
		spinSpeed: { x: 0.55, y: 0.45 },
	},
	{
		id: "case04",
		label: "Кейс 04",
		createGeometry: () => new THREE.DodecahedronGeometry(1.15, 0),
		color: 0xe91e63,
		spinSpeed: { x: 0.3, y: 0.65 },
	},
	{
		id: "case05",
		label: "Кейс 05",
		createGeometry: () => new THREE.IcosahedronGeometry(1.2, 0),
		color: 0x4caf50,
		spinSpeed: { x: 0.45, y: 0.5 },
	},
	{
		id: "case06",
		label: "Кейс 06",
		createGeometry: () => new THREE.TetrahedronGeometry(1.2, 0),
		color: 0x9c27b0,
		spinSpeed: { x: 0.4, y: 0.6 },
	},
	{
		id: "case07",
		label: "Кейс 07",
		createGeometry: () => new THREE.TorusGeometry(0.9, 0.35, 16, 48),
		color: 0x00bcd4,
		spinSpeed: { x: 0.35, y: 0.55 },
	},
	{
		id: "about",
		label: "О нас",
		createGeometry: () => new THREE.BufferGeometry(),
		color: 0x000000,
		spinSpeed: { x: 0.2, y: 0.9 },
	},
	{
		id: "contacts",
		label: "Контакты",
		createGeometry: () => new THREE.TorusKnotGeometry(0.75, 0.22, 128, 16),
		color: 0x76ff03,
		spinSpeed: { x: 0.35, y: 0.7 },
	},
];

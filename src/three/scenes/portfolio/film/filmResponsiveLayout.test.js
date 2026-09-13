import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { getFilmLayout } from "./filmMotion.js";
import { resolveFilmPresentation } from "@/pages/portfolio/filmPresentationLayout.js";
import { FilmScreen } from "./FilmScreen.js";
import { bendFilmGeometry } from "./filmSurface.js";
import { hologramFields } from "./filmHologramConfig.js";

const sizes = [[2560, 1440], [1920, 1080], [1680, 1050], [1440, 900], [1280, 720],
	[980, 740], [768, 1024], [640, 960], [480, 800], [330, 740], [330, 568], [480, 640],
	[640, 330], [844, 390], [980, 480], [1280, 360], [1920, 480]];

function frameBounds(width, height, focus) {
	const layout = getFilmLayout(width / height, width, height);
	const camera = new THREE.PerspectiveCamera(40, width / height, .1, 1000);
	camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
	const root = new THREE.Group();
	// Real curved frame geometry, transformed by the production update method.
	const geometry = bendFilmGeometry(new THREE.PlaneGeometry(1.05, .54, 64, 2));
	const frame = new THREE.Mesh(geometry); frame.position.z = .015; root.add(frame);
	const names = ["uTime", "uFocus", "uGlitchTime", "uFrom", "uTo", "uFromAspect", "uToAspect", "uProgress", "uDirection", "uOpacity"];
	const uniforms = Object.fromEntries(names.map(name => [name, { value: 0 }]));
	uniforms.uFromInfo = { value: new THREE.Vector2() }; uniforms.uToInfo = { value: new THREE.Vector2() };
	const values = Object.fromEntries(hologramFields.map(([key]) => [key, 0]));
	for (const [key] of hologramFields) uniforms[`uHolo${key}`] = { value: 0 };
	const screen = { root, uniforms, hologramSettings: values, hologramValues: { ...values },
		media: { get: () => null, aspect: () => 2.05 }, projection: { update() {} } };
	const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
	for (const pointer of [{ x: -1, y: -1 }, { x: 1, y: 1 }]) {
		FilmScreen.prototype.update.call(screen, { index: 0, destination: 0, progress: 0 }, 1, focus, layout, pointer, false, 0);
		root.updateMatrixWorld(true);
		const point = new THREE.Vector3(), positions = geometry.getAttribute("position");
		for (let i = 0; i < positions.count; i++) {
			point.fromBufferAttribute(positions, i).applyMatrix4(frame.matrixWorld).project(camera);
			const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
			bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
			bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
		}
	}
	geometry.dispose();
	return { layout, bounds };
}

test("curved film frame stays clear of navigation and the native player at every supported width", () => {
	const failures = [];
	for (const [width, height] of sizes) for (const focus of [0, 1]) {
		const { layout, bounds } = frameBounds(width, height, focus);
		const short = height <= 480;
		const adapted = layout.mobile || height <= 600;
		const top = adapted ? (layout.mobile ? (short ? 56 : 72) : 64) : 0;
		const bottom = adapted ? (width > 1024 ? 28 : short ? 54 : 72) : 0;
		const label = `${width}×${height}, focus ${focus}`;
		if (bounds.left < 8 || bounds.right > width - 8 || bounds.top < top || bounds.bottom > height - bottom) {
			failures.push(`${label}: frame intersects viewport/chrome ${JSON.stringify(bounds)}`);
		}
		if (layout.mobile) {
			// Native DOM controls consume the same CSS-pixel reservations. Compare
			// against real projected geometry, including inspection and pointer tilt.
			const presentation = resolveFilmPresentation(width, height);
			const panelTop = presentation.panel.top;
			const panelLeft = presentation.panel.left;
			assert.equal(layout.landscape, presentation.landscape, `${label}: DOM and scene use different compositions`);
			const box = presentation.screen;
			if (bounds.left < box.left || bounds.right > box.right || bounds.top < box.top || bounds.bottom > box.bottom) {
				failures.push(`${label}: frame escaped its presentation band ${JSON.stringify(bounds)}`);
			}
			if (!(bounds.bottom <= panelTop - 6 || bounds.right <= panelLeft - 6)) {
				failures.push(`${label}: frame overlaps native player (top ${panelTop}, left ${panelLeft}) ${JSON.stringify(bounds)}`);
			}
		}
	}
	assert.deepEqual(failures, []);
});

test("ordinary desktop keeps its authored composition and resize never accumulates scale", () => {
	for (const [width, height] of sizes.filter(([w, h]) => w > 1024 && h > 600)) {
		const aspect = width / height, viewWidth = 20 * Math.tan(Math.PI / 9) * aspect;
		const first = getFilmLayout(aspect, width, height);
		assert.deepEqual(first, { mobile: false, compact: false, compositionScale: .92, viewWidth,
			width: Math.min(9.4, viewWidth - 4.55), height: Math.min(9.4, viewWidth - 4.55) / 2.05, x: .1, y: .1 });
		getFilmLayout(330 / 740, 330, 740);
		getFilmLayout(640 / 330, 640, 330);
		assert.deepEqual(getFilmLayout(aspect, width, height), first);
	}
});

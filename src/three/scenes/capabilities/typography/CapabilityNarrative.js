import * as THREE from "three";
import { releaseStaticCanvasAfterUpload } from "../../../assets/releaseStaticCanvasAfterUpload.js";
import { NARRATIVE_COPY, CORE_NARRATIVE_LABEL, advanceNarrative, narrativeFrame, coreNarrativeLayout, trailNarrativeWallPosition } from "./capabilityNarrativeContent.js";
import { PASSAGE_RADIUS } from "../lightTrails/createLightTrailsEnvironment.js";
import { SceneTextLocale } from "./sceneTextLocale.js";
import { TITLE_MOSAIC_GLSL } from "./titleMosaic.js";

const WIDTH = 1024, HEIGHT = 384;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));

function paintLine(ctx, text, y, size, color, tracking = 2) {
	const chars = Array.from(text);
	ctx.font = `500 ${size}px ManifoldExtended, sans-serif`;
	const measure = () => chars.reduce((width, char) => width + (char === " " ? size * 0.55 : ctx.measureText(char).width + tracking), 0);
	if (measure() > WIDTH - 32) {
		size *= (WIDTH - 32) / measure();
		ctx.font = `500 ${size}px ManifoldExtended, sans-serif`;
	}
	ctx.fillStyle = color;
	let x = 12;
	for (const char of chars) {
		if (char === " ") { x += size * 0.55; continue; }
		ctx.fillText(char, x, y);
		x += ctx.measureText(char).width + tracking;
	}
	return x;
}

const VERTEX = /* glsl */ `
	uniform bool uScreen;
	uniform vec2 uViewport, uOrigin, uSize;
	varying vec2 vUv;
	void main() {
		vUv = uv;
		if (uScreen) {
			vec2 pixel = uOrigin + vec2(uv.x, 1.0 - uv.y) * uSize;
			gl_Position = vec4(pixel / uViewport * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
		} else {
			vec4 view = modelViewMatrix * vec4(position, 1.0);
			gl_Position = projectionMatrix * view;
			// Match the tunnel's infinite-far depth mapping, so its structure can occlude letters.
			float nearPlane = max(0.5, projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0));
			gl_Position.z = -view.z - 2.0 * nearPlane;
		}
	}
`;
const FRAGMENT = /* glsl */ `
	uniform sampler2D uText;
	uniform float uReveal, uLocale, uState, uRows, uSide, uBloomStrength;
	varying vec2 vUv;
	vec4 textInk(vec2 uv) {
		uv = clamp(uv, vec2(0.001), vec2(0.999));
		return texture2D(uText, vec2((uLocale + uv.x) / 3.0, (uRows - 1.0 - uState + uv.y) / uRows));
	}
	${TITLE_MOSAIC_GLSL}
	void main() {
		gl_FragColor = titleMosaic(vUv, uReveal, uSide, uBloomStrength);
	}
`;

/** Prepared scene typography: content is painted only under the preloader. */
export class CapabilityNarrative {
	static async create(parent, renderer, variant, disposed) {
		const copy = NARRATIVE_COPY[variant];
		await Promise.all(copy.map((states, locale) => document.fonts?.load("500 72px ManifoldExtended",
			states.flat().join(" ") + (variant === "syntheticCore" ? ` ${CORE_NARRATIVE_LABEL[locale]}` : ""))));
		if (disposed()) return null;
		const rows = copy[0].length;
		const atlasRows = rows * (variant === "syntheticCore" ? 2 : 1);
		const canvas = document.createElement("canvas");
		const ratio = Math.min(1, renderer.capabilities.maxTextureSize / Math.max(WIDTH * 3, HEIGHT * atlasRows));
		canvas.width = Math.floor(WIDTH * 3 * ratio);
		canvas.height = Math.floor(HEIGHT * atlasRows * ratio);
		const ctx = canvas.getContext("2d");
		ctx.scale(ratio, ratio);
		const soundBounds = copy.map(() => []);
		for (let locale = 0; locale < copy.length; locale++) {
			for (let state = 0; state < atlasRows; state++) {
				await nextPaint();
				if (disposed()) return null;
				ctx.save();
				ctx.translate(locale * WIDTH, state * HEIGHT);
				const lines = copy[locale][state % rows];
				const compact = state >= rows;
				const core = variant === "syntheticCore";
				let right = core ? paintLine(ctx, CORE_NARRATIVE_LABEL[locale], 44, compact ? 34 : 22, "#56b6cf", 3) : 12;
				right = Math.max(right, paintLine(ctx, lines[0], 149, core ? 76 : 70, "#dcebf0"));
				right = Math.max(right, paintLine(ctx, lines[1], core ? 244 : 212, core ? 76 : 60, "#dcebf0"));
				if (core) {
					right = Math.max(right, paintLine(ctx, lines[2], compact ? 302 : 318, compact ? 48 : 32, "#9cbac8", 0.8));
					right = Math.max(right, paintLine(ctx, lines[3], compact ? 366 : 368, compact ? 48 : 32, "#9cbac8", 0.8));
				}
				soundBounds[locale][state] = right / WIDTH;
				ctx.restore();
			}
		}
		return new CapabilityNarrative(parent, renderer, variant, canvas, atlasRows, soundBounds);
	}

	constructor(parent, renderer, variant, canvas, rows, soundBounds) {
		this.variant = variant;
		this.soundBounds = soundBounds;
		this.elapsed = 0;
		this.localeMotion = new SceneTextLocale(variant === "syntheticCore" ? 1.15 : 0.95, 0.95);
		this.warming = false;
		this.viewport = new THREE.Vector2();
		// Upright floating inscriptions with a fixed, gentler turn along each side.
		// These world rotations never follow the camera or the walls' vertical slope.
		this.wallRotations = [-1, 1].map(side => new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 1, 0), -side * THREE.MathUtils.degToRad(50),
		));
		this.frame = narrativeFrame(0, variant);
		this.texture = new THREE.CanvasTexture(canvas);
		releaseStaticCanvasAfterUpload(this.texture);
		this.texture.name = `${variant}-narrative-atlas`;
		this.texture.minFilter = THREE.LinearMipmapLinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
		this.uniforms = {
			uText: { value: this.texture }, uReveal: { value: 0 }, uLocale: { value: 0 },
			uState: { value: 0 }, uRows: { value: rows }, uSide: { value: 1 },
			uBloomStrength: { value: 1 },
			uScreen: { value: variant === "syntheticCore" }, uViewport: { value: this.viewport },
			uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() },
		};
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
			uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
			defines: variant === "syntheticCore" ? { SHARP_ONLY: 1 } : {},
			transparent: true, depthTest: variant === "lightTrails", depthWrite: false, toneMapped: false,
		}));
		this.mesh.name = `${variant}-narrative`;
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 20;
		this.mesh.onBeforeRender = () => {
			renderer.getSize(this.viewport);
			this.layout();
		};
		parent.add(this.mesh);
		if (variant === "syntheticCore") {
			// The core's sharp copy is composed after bloom. Only its changing cells
			// emit into the models RT, using the same prepared atlas and playhead.
			this.bloomMesh = new THREE.Mesh(this.mesh.geometry, new THREE.ShaderMaterial({
				uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
				defines: { BLOOM_ONLY: 1 }, blending: THREE.AdditiveBlending,
				transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			}));
			this.bloomMesh.name = `${variant}-narrative-bloom`;
			this.bloomMesh.frustumCulled = false;
			this.bloomMesh.renderOrder = 21;
			this.bloomMesh.onBeforeRender = this.mesh.onBeforeRender;
			parent.add(this.bloomMesh);
		}
	}

	layout() {
		const compact = this.viewport.x <= 1024;
		if (this.variant === "syntheticCore" || compact) {
			const box = coreNarrativeLayout(this.viewport.x, this.viewport.y);
			this.uniforms.uScreen.value = true;
			if (this.variant === "syntheticCore") this.uniforms.uState.value = compact || (this.viewport.x <= 1024 && this.viewport.y < 560) ? 1 : 0;
			// The mobile caption occupies the safe upper band, clear of the flight path.
			// A uniform switches the prepared quad; no texture or program is rebuilt.
			this.mesh.material.depthTest = false;
			this.uniforms.uOrigin.value.set(box.x, box.y);
			this.uniforms.uSize.value.set(box.width, box.height);
			return;
		}
		this.uniforms.uScreen.value = false;
		this.mesh.material.depthTest = true;
		const { side, progress } = this.frame;
		// Clear of the ribs; no camera position, quaternion, FOV or
		// viewport width enters this pose. Its quiet drift is independent of fast wall flight.
		const pose = trailNarrativeWallPosition(side, PASSAGE_RADIUS);
		this.mesh.position.set(pose.x, pose.y, pose.z + progress * 27);
		this.mesh.quaternion.copy(this.wallRotations[side > 0 ? 1 : 0]);
		this.mesh.scale.set(40, 40 * HEIGHT / WIDTH, 1);
		this.mesh.updateMatrixWorld(true);
	}

	update(delta, frame, locale) {
		if (this.warming) return;
		const store = frame?.store;
		const transitioning = store?.sceneCarouselClickTransitionActive === true || Math.abs(store?.hexShaderProgress ?? 0) > 0.0001;
		const current = frame?.activeSceneId === `capabilities:${this.variant}`;
		if (!this.localeMotion.busy) this.elapsed = advanceNarrative(this.elapsed, delta, {
			started: store?.appStarted === true,
			current, transitioning,
		}, this.variant);
		this.frame = narrativeFrame(this.elapsed, this.variant);
		this.uniforms.uReveal.value = this.localeMotion.update(
			store?.appStarted === true && (current || transitioning) ? delta : 0, locale, this.frame.reveal,
		);
		this.uniforms.uState.value = this.frame.state;
		this.uniforms.uSide.value = this.frame.side;
		this.uniforms.uLocale.value = this.localeMotion.locale;
	}

	getSoundReveal() {
		const u = this.uniforms;
		const right = this.soundBounds[u.uLocale.value][u.uState.value];
		const left = 12 / WIDTH;
		// Same sweep, stagger and cell duration as mosaicPhase; exclude empty atlas margins.
		const start = (u.uSide.value > 0 ? 1 - right : left) * 0.72;
		const end = (u.uSide.value > 0 ? 1 - left : right) * 0.72 + 0.1 + 0.18;
		return THREE.MathUtils.clamp((u.uReveal.value - start) / (end - start), 0, 1);
	}

	reset() {
		this.localeMotion.reset();
		this.elapsed = 0; this.frame = narrativeFrame(0, this.variant); this.uniforms.uReveal.value = 0;
	}
	beginWarmupDraw() { this.warming = true; this.uniforms.uReveal.value = 0.5; }
	endWarmupDraw() { this.warming = false; this.reset(); }
	dispose() {
		this.bloomMesh?.removeFromParent();
		this.bloomMesh?.material.dispose();
		this.mesh.removeFromParent();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.texture.dispose();
	}
}

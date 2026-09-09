import * as THREE from "three";
import { createSceneHudAtlas } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { advanceHudSnake, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { getMmk1DetailLayout, MMK1_DETAIL_SIZE, MMK1_DETAIL_TYPE, MMK1_HOTSPOT_DETAILS, MMK1_OVERVIEW } from "./mmk1HotspotDetailsConfig.js";

const SIZE_GLSL = `vec2(${MMK1_DETAIL_SIZE.width.toFixed(1)},${MMK1_DETAIL_SIZE.height.toFixed(1)})`;

const VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin;
	uniform float uScale,uDetails;
	varying vec2 vUv;
	void main(){
		vUv=uv;
		vec2 pixel=uOrigin+uv*${SIZE_GLSL}*uScale+vec2(0.0,-14.0*(1.0-uDetails));
		gl_Position=vec4(pixel/uViewport*2.0-1.0,0.0,1.0);
	}
`;

const FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels,uLetterOrder,uGlyphs;
	uniform float uSnake,uGlyphCount,uLocale,uState,uDetails;
	varying vec2 vUv;
	${hudSnakeGlsl(5, [268, 198, 114, 90, 66], MMK1_DETAIL_SIZE)}
	void main(){
		if(uDetails<0.002)discard;
		vec2 px=vUv*${SIZE_GLSL};
		float edge=min(min(px.x,560.0-px.x),min(px.y,320.0-px.y));
		float feather=smoothstep(0.0,28.0,edge);
		vec4 text=snakeLabel(vUv,uState);
		// A diagonal light signature separates the offset paragraph from the headline.
		vec2 a=vec2(42.0,118.0),b=vec2(66.0,144.0),ab=b-a;
		float distanceToStroke=length(px-a-ab*clamp(dot(px-a,ab)/dot(ab,ab),0.0,1.0));
		float stroke=(1.0-smoothstep(0.6,1.5,distanceToStroke))*0.9;
		float glow=exp(-distanceToStroke*0.17)*0.22;
		vec2 haloPoint=(px-vec2(95.0,174.0))/vec2(240.0,80.0);
		float halo=exp(-dot(haloPoint,haloPoint)*2.4)*0.10;
		float light=(stroke+glow+halo)*feather*uDetails;
		float alpha=text.a+light*(1.0-text.a);
		gl_FragColor=vec4((text.rgb*text.a+vec3(0.22,0.76,1.0)*light*(1.0-text.a))/max(alpha,0.001),alpha);
	}
`;

function fitHeadline(ctx, text, preferredSize, maxWidth) {
	const typography = { ...MMK1_DETAIL_TYPE.title };
	const measure = (size) => {
		typography.size = size;
		typography.font = `500 ${size}px ManifoldExtended, "Segoe UI", sans-serif`;
		typography.space = size * 0.28;
		ctx.font = typography.font;
		return Array.from(text).reduce((sum, char) => sum + (char === " " ? typography.space : ctx.measureText(char).width + typography.tracking), 0);
	};
	const width = measure(preferredSize);
	if (width > maxWidth) measure(Math.floor(preferredSize * maxWidth / width));
	return typography;
}

/** Prepared once with the hover HUD and carried through the same screen/hex composition. */
export class Mmk1HotspotDetails {
	constructor(parent, markers, renderer) {
		this.markers = markers;
		this.pixelRatio = renderer.getPixelRatio();
		this.viewport = new THREE.Vector2();
		this.introElapsed = 0;
		const compositions = [...MMK1_HOTSPOT_DETAILS, MMK1_OVERVIEW];
		const measureContext = document.createElement("canvas").getContext("2d");
		const states = ["ru", "en", "zh"].map((locale) => compositions.map(({ copy, headlines }, index) => {
			const [, ...body] = copy[locale];
			return [
				...headlines[locale].map((text, row) => ({
					text, x: row ? 60 : 26, y: [52, 122][row], color: row ? "#e6f5ff" : "#90bdd0", row,
					...fitHeadline(measureContext, text, row ? 80 : index === 4 ? 60 : 30, row ? 472 : 500),
				})),
				...body.map((text, row) => ({ text, x: 96, y: [206, 230, 254][row], color: "#c0cbd3", row: row + 2, ...MMK1_DETAIL_TYPE.body })),
			];
		}));
		this.atlas = createSceneHudAtlas(this.pixelRatio, states, "mmk1-detail", MMK1_DETAIL_SIZE);
		this.geometry = new THREE.PlaneGeometry(2, 2);
		this.panels = [...markers, { name: "mmk1-overview" }].map((marker, index) => {
			const material = new THREE.ShaderMaterial({
				uniforms: {
					uLabels: { value: this.atlas.texture }, uLetterOrder: { value: this.atlas.orderTexture },
					uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
					uViewport: { value: this.viewport }, uOrigin: { value: new THREE.Vector2() }, uScale: { value: 1 },
					uSnake: { value: 0 }, uState: { value: index }, uLocale: { value: 0 }, uDetails: { value: 0 },
				},
				vertexShader: VERTEX, fragmentShader: FRAGMENT,
				transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			});
			const panel = new THREE.Mesh(this.geometry, material);
			panel.name = `${marker.name}-details`;
			panel.frustumCulled = false;
			panel.renderOrder = 82;
			parent.add(panel);
			return panel;
		});
	}

	layout(viewport) {
		this.viewport.copy(viewport);
		for (let i = 0; i < this.panels.length; i++) {
			const layout = getMmk1DetailLayout(i, viewport.x, viewport.y);
			const u = this.panels[i].material.uniforms;
			u.uOrigin.value.set(layout.x, layout.y).multiplyScalar(this.pixelRatio).round().divideScalar(this.pixelRatio);
			u.uScale.value = layout.scale;
		}
	}

	update(delta, selectedId, flight, locale, { started = false, current = false, transitioning = false } = {}) {
		const animate = started && current && !transitioning;
		if (animate) this.introElapsed = Math.min(1, this.introElapsed + delta);
		for (let i = 0; i < this.panels.length; i++) {
			const u = this.panels[i].material.uniforms;
			u.uLocale.value = locale === "en" ? 1 : locale === "zh" ? 2 : 0;
			// Freeze the prepared composition during hex mixing, including direction reversals.
			if (!animate) continue;
			const requested = i === 4
				? !selectedId && !flight && this.introElapsed > 0.55
				: this.markers[i].name === selectedId && (!flight || flight.progress >= 0.78);
			u.uSnake.value = advanceHudSnake(u.uSnake.value, requested, delta);
			// Let the last letters disappear before fading the light signature.
			u.uDetails.value = THREE.MathUtils.damp(u.uDetails.value, u.uSnake.value > 0 ? 1 : 0, 10, delta);
		}
	}

	getSoundReveal(overview = false) {
		if (overview) return this.panels[4].material.uniforms.uSnake.value;
		let reveal = 0;
		for (let i = 0; i < 4; i++) reveal = Math.max(reveal, this.panels[i].material.uniforms.uSnake.value);
		return reveal;
	}

	containsPoint(pointer) {
		const x = (pointer.x + 1) * this.viewport.x * 0.5;
		const y = (pointer.y + 1) * this.viewport.y * 0.5;
		return this.panels.some(({ material }) => {
			const u = material.uniforms;
			if (u.uDetails.value < 0.15) return false;
			const origin = u.uOrigin.value;
			return x >= origin.x && x <= origin.x + MMK1_DETAIL_SIZE.width * u.uScale.value
				&& y >= origin.y && y <= origin.y + MMK1_DETAIL_SIZE.height * u.uScale.value;
		});
	}

	reset() {
		this.introElapsed = 0;
		for (const panel of this.panels) {
			panel.material.uniforms.uDetails.value = 0;
			panel.material.uniforms.uSnake.value = 0;
		}
	}

	dispose() {
		for (const panel of this.panels) {
			panel.removeFromParent();
			panel.material.dispose();
		}
		this.geometry.dispose();
		this.atlas.texture.dispose();
		this.atlas.orderTexture.dispose();
		this.atlas.glyphTexture.dispose();
	}
}

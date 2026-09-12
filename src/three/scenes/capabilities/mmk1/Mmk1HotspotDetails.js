import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import * as THREE from "three";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { createSceneHudAtlas, createSceneHudAtlasChunked } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { advanceHudSnake, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { getMmk1DetailLayout, MMK1_DETAIL_SIZE, MMK1_DETAIL_TYPE, MMK1_HOTSPOT_DETAILS, MMK1_OVERVIEW, MMK1_OVERVIEW_VIEW } from "./mmk1HotspotDetailsConfig.js";
import { advanceMmk1IntroReveal, mmk1IntroSoundReveal, MMK1_INTRO_FRAGMENT } from "./mmk1IntroReveal.js";

const SIZE_GLSL = `vec2(${MMK1_DETAIL_SIZE.width.toFixed(1)},${MMK1_DETAIL_SIZE.height.toFixed(1)})`;

const VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin,uPanelSize;
	uniform vec4 uUvBounds;
	uniform float uScale,uDetails,uState;
	varying vec2 vUv;
	void main(){
		vUv=mix(uUvBounds.xy,uUvBounds.zw,uv);
		vec2 pixel=uOrigin+uv*uPanelSize*uScale+vec2(0.0,-14.0*(1.0-uDetails)*(1.0-step(3.5,uState)));
		gl_Position=vec4(pixel/uViewport*2.0-1.0,0.0,1.0);
	}
`;

const DETAIL_FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels,uLetterOrder,uGlyphs;
	uniform float uSnake,uGlyphCount,uLocale,uState,uDetails;
	varying vec2 vUv;
	${hudSnakeGlsl(6, [268, 198, 114, 90, 66], MMK1_DETAIL_SIZE)}
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
function createDetailStates(measureContext) {
	return ["ru", "en", "zh"].map((locale) => [...MMK1_HOTSPOT_DETAILS.map(({ copy, headlines }) => {
		const [, ...body] = copy[locale];
		return [
			...headlines[locale].map((text, row) => ({
				text, x: row ? 60 : 26, y: [52, 122][row], color: row ? "#e6f5ff" : "#90bdd0", row,
				...fitHeadline(measureContext, text, row ? 80 : 30, row ? 472 : 500),
			})),
			...body.map((text, row) => ({ text, x: 96, y: [206, 230, 254][row], color: "#c0cbd3", row: row + 2, ...MMK1_DETAIL_TYPE.body })),
		];
	}), ...[false, true].map((compact) => {
		const headlines = MMK1_OVERVIEW.headlines[locale];
		const titleSize = Math.min(...headlines.map(text => fitHeadline(measureContext, text, 38, 528).size));
		return [
			...headlines.map((text, row) => ({
				text, x: 8, y: 98 + row * 44, color: row ? "#d5ebf4" : "#98bfce",
				...fitHeadline(measureContext, text, titleSize, 528),
			})),
			{ text: MMK1_OVERVIEW.guide[locale], x: 54, y: 192, color: "#819ba5",
				...fitHeadline(measureContext, MMK1_OVERVIEW.guide[locale], compact ? 18 : 13, 480) },
		];
	})]);
}

export class Mmk1HotspotDetails {
	static async create(parent, markers, renderer, modelsParent, cancelled) {
		const measureContext = document.createElement("canvas").getContext("2d");
		const states = createDetailStates(measureContext);
		const atlas = await createSceneHudAtlasChunked(getScenePixelRatio(renderer), states, "mmk1-detail", MMK1_DETAIL_SIZE, cancelled);
		return atlas ? new Mmk1HotspotDetails(parent, markers, renderer, modelsParent, { atlas, states, measureContext }) : null;
	}

	constructor(parent, markers, renderer, modelsParent, prepared = null) {
		this.markers = markers;
		this.pixelRatio = getScenePixelRatio(renderer);
		this.viewport = new THREE.Vector2();
		this.introElapsed = 0;
		const measureContext = prepared?.measureContext ?? document.createElement("canvas").getContext("2d");
		const states = prepared?.states ?? createDetailStates(measureContext);
		this.atlas = prepared?.atlas ?? createSceneHudAtlas(this.pixelRatio, states, "mmk1-detail", MMK1_DETAIL_SIZE);
		this.overviewSoundBounds = states.map(compositions => compositions.slice(4).map(lines => {
			let right = 0;
			for (const line of lines) {
				measureContext.font = line.font;
				const width = Array.from(line.text).reduce((sum, char) => sum + (char === " " ? line.space : measureContext.measureText(char).width + line.tracking), 0);
				right = Math.max(right, line.x + width);
			}
			return right / MMK1_DETAIL_SIZE.width;
		}));
		this.geometry = new THREE.PlaneGeometry(2, 2);
		this.localeMotions = Array.from({ length: markers.length + 1 }, (_, index) => index === 4
			? new SceneTextLocale(0.95, 0.95) : new SceneTextLocale());
		this.panels = [...markers, { name: "mmk1-overview" }].map((marker, index) => {
			const overview = index === 4;
			const material = new THREE.ShaderMaterial({
				uniforms: {
					uLabels: { value: this.atlas.texture }, uLetterOrder: { value: this.atlas.orderTexture },
					uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
					uViewport: { value: this.viewport }, uOrigin: { value: new THREE.Vector2() }, uScale: { value: 1 },
					uPanelSize: { value: new THREE.Vector2(MMK1_DETAIL_SIZE.width, overview ? MMK1_OVERVIEW_VIEW.height : MMK1_DETAIL_SIZE.height) },
					uUvBounds: { value: overview ? new THREE.Vector4(0, MMK1_OVERVIEW_VIEW.uvBottom, 1, MMK1_OVERVIEW_VIEW.uvTop) : new THREE.Vector4(0, 0, 1, 1) },
					uSnake: { value: 0 }, uReveal: { value: 0 }, uState: { value: index }, uLocale: { value: 0 }, uDetails: { value: 0 },
					uMarkerTime: { value: 4.2 },
				},
				vertexShader: VERTEX, fragmentShader: overview ? MMK1_INTRO_FRAGMENT : DETAIL_FRAGMENT,
				extensions: { derivatives: overview },
				transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			});
			const panel = new THREE.Mesh(this.geometry, material);
			panel.name = `${marker.name}-details`;
			panel.frustumCulled = false;
			panel.renderOrder = 82;
			parent.add(panel);
			return panel;
		});
		// One bounded light draw during the reveal; no new render target or bloom pass.
		this.bloomMesh = new THREE.Mesh(this.geometry, new THREE.ShaderMaterial({
			uniforms: this.panels[4].material.uniforms, vertexShader: VERTEX, fragmentShader: MMK1_INTRO_FRAGMENT,
			defines: { BLOOM_ONLY: 1 }, blending: THREE.AdditiveBlending,
			extensions: { derivatives: true },
			transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
		}));
		this.bloomMesh.name = "mmk1-intro-bloom";
		this.bloomMesh.frustumCulled = false;
		this.bloomMesh.renderOrder = 83;
		modelsParent.add(this.bloomMesh);
	}

	layout(viewport) {
		this.viewport.copy(viewport);
		for (let i = 0; i < this.panels.length; i++) {
			const layout = getMmk1DetailLayout(i, viewport.x, viewport.y);
			const u = this.panels[i].material.uniforms;
			u.uOrigin.value.set(layout.x, layout.y).multiplyScalar(this.pixelRatio).round().divideScalar(this.pixelRatio);
			u.uScale.value = layout.scale;
			if (i === 4) u.uState.value = viewport.x < 700 ? 5 : 4;
		}
	}

	update(delta, selectedId, flight, locale, { started = false, current = false, transitioning = false } = {}) {
		if (started && current) this.panels[4].material.uniforms.uMarkerTime.value += Math.max(0, delta);
		if (started && current && !transitioning) this.introElapsed = Math.min(1, this.introElapsed + delta);
		for (let i = 0; i < this.panels.length; i++) {
			const u = this.panels[i].material.uniforms;
			const reveal = i === 4 ? u.uReveal : u.uSnake;
			const language = this.localeMotions[i];
			const animating = language.busy || (reveal.value > 0 && reveal.value < 1);
			const animate = started && (current || (transitioning && animating));
			const requested = i === 4
				? !selectedId && !flight && this.introElapsed > 0.55
				: this.markers[i].name === selectedId && (!flight || flight.progress >= 0.78);
			const natural = !animate || language.busy ? reveal.value : i === 4
				? advanceMmk1IntroReveal(reveal.value, requested, delta) : advanceHudSnake(reveal.value, requested, delta);
			reveal.value = language.update(animate ? delta : 0, locale, natural, requested);
			u.uLocale.value = language.locale;
			// Let the last letters disappear before fading the light signature.
			if (animate) u.uDetails.value = THREE.MathUtils.damp(u.uDetails.value, reveal.value > 0 ? 1 : 0, 10, delta);
		}
		const progress = this.panels[4].material.uniforms.uReveal.value;
		// The scene owns visibility during hex mixing. Settled text adds no light draw.
		this.bloomMesh.visible = !started || (progress > 0 && progress < 1);
	}

	getSoundReveal(overview = false) {
		if (overview) {
			const u = this.panels[4].material.uniforms;
			return mmk1IntroSoundReveal(u.uReveal.value, this.overviewSoundBounds[u.uLocale.value][u.uState.value - 4]);
		}
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
				&& y >= origin.y && y <= origin.y + u.uPanelSize.value.y * u.uScale.value;
		});
	}

	reset() {
		this.introElapsed = 0;
		for (const language of this.localeMotions) language.reset();
		this.bloomMesh.visible = false;
		for (const panel of this.panels) {
			panel.material.uniforms.uDetails.value = 0;
			panel.material.uniforms.uSnake.value = 0;
			panel.material.uniforms.uReveal.value = 0;
		}
	}

	dispose() {
		this.bloomMesh.removeFromParent();
		this.bloomMesh.material.dispose();
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

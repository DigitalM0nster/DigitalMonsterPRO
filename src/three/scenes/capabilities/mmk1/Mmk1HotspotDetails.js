import * as THREE from "three";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { createSceneHudAtlas, createSceneHudAtlasChunked } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { advanceHudSnake, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { getMmk1DetailLayout, getMmk1DetailRasterRatio, MMK1_DETAIL_SIZE, MMK1_DETAIL_STATE_COUNT, MMK1_DETAIL_TYPE, MMK1_DETAIL_VIEW, MMK1_HOTSPOT_DETAILS, MMK1_OVERVIEW, MMK1_OVERVIEW_VIEW } from "./mmk1HotspotDetailsConfig.js";
import { advanceMmk1IntroReveal, mmk1IntroSoundReveal, MMK1_INTRO_FRAGMENT, MMK1_INTRO_REVEAL_SECONDS } from "./mmk1IntroReveal.js";

const VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin,uPanelSize;
	uniform vec4 uUvBounds;
	uniform float uScale;
	varying vec2 vUv;
	void main(){
		vUv=mix(uUvBounds.xy,uUvBounds.zw,uv);
		vec2 pixel=uOrigin+uv*uPanelSize*uScale;
		gl_Position=vec4(pixel/uViewport*2.0-1.0,0.0,1.0);
	}
`;

const DETAIL_FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels,uLetterOrder,uGlyphs;
	uniform float uSnake,uGlyphCount,uLocale,uState;
	varying vec2 vUv;
	${hudSnakeGlsl(MMK1_DETAIL_STATE_COUNT, [158, 116, 58, 30], MMK1_DETAIL_SIZE)}
	void main(){
		if(uSnake<=0.0)discard;
		vec4 text=snakeLabel(vUv,uState);
		vec2 px=vUv*vec2(560.0,200.0);
		float rule=(1.0-smoothstep(0.3,0.85,abs(px.y-82.0)))*step(16.0,px.x)
			*(1.0-smoothstep(56.0,144.0,px.x))*smoothstep(0.42,0.7,uSnake)*0.48;
		float alpha=text.a+rule*(1.0-text.a);
		text=vec4((text.rgb*text.a+vec3(0.58,0.77,0.85)*rule*(1.0-text.a))/max(alpha,0.001),alpha);
		if(text.a<0.002)discard;
		gl_FragColor=text;
	}
`;

function fitHeadline(ctx, text, preferredSize, maxWidth, wordSpace = 0.28) {
	const typography = { ...MMK1_DETAIL_TYPE.title };
	const measure = (size) => {
		typography.size = size;
		typography.font = `500 ${size}px ManifoldExtended, "Segoe UI", sans-serif`;
		typography.space = size * wordSpace;
		ctx.font = typography.font;
		return Array.from(text).reduce((sum, char) => sum + (char === " " ? typography.space : ctx.measureText(char).width + typography.tracking), 0);
	};
	const width = measure(preferredSize);
	if (width > maxWidth) measure(Math.floor(preferredSize * maxWidth / width));
	return typography;
}

/** Prepared once with the hover HUD and carried through the same screen/hex composition. */
function createDetailStates(measureContext) {
	const detail = (locale) => MMK1_HOTSPOT_DETAILS.map(({ copy, headlines }) => {
		const [, ...body] = copy[locale];
		const titleSize = Math.min(...headlines[locale].map(text => fitHeadline(measureContext, text, 44, 528, .5).size));
		return [
			...headlines[locale].map((text, row) => ({
				text, x: 16, y: [42, 84][row], color: row ? "#e0eef5" : "#b4d0dd", row,
				...fitHeadline(measureContext, text, titleSize, 528, .5),
			})),
			...body.map((text, row) => ({ text, x: 16, y: [142, 170][row], color: "#abc0cc", row: row + 2,
				...MMK1_DETAIL_TYPE.body, size: 26, font: '400 26px MazzardM, "Segoe UI", sans-serif' })),
		];
	});
	return ["ru", "en", "zh"].map((locale) => [...detail(locale), ...[false, true].map((compact) => {
		const headlines = MMK1_OVERVIEW.headlines[locale];
		const titleSize = Math.min(...headlines.map(text => fitHeadline(measureContext, text, 38, 528).size));
		return [
			...headlines.map((text, row) => ({
				text, x: 8, y: 34 + row * 44, color: row ? "#d5ebf4" : "#98bfce",
				...fitHeadline(measureContext, text, titleSize, 528),
			})),
			...MMK1_OVERVIEW.description[locale].map((text, row) => ({
				text, x: 8, y: 121 + row * 24, color: "#a3b8c2",
				...MMK1_DETAIL_TYPE.body,
				...(compact ? { size: 26, font: '400 26px MazzardM, "Segoe UI", sans-serif' } : {}),
			})),
		];
	})]);
}

export class Mmk1HotspotDetails {
	static async create(parent, markers, renderer, modelsParent, cancelled) {
		const measureContext = document.createElement("canvas").getContext("2d");
		const states = createDetailStates(measureContext);
		const pixelRatio = getMmk1DetailRasterRatio(renderer.capabilities.maxTextureSize);
		const atlas = await createSceneHudAtlasChunked(pixelRatio, states, "mmk1-detail", MMK1_DETAIL_SIZE, cancelled);
		return atlas ? new Mmk1HotspotDetails(parent, markers, renderer, modelsParent, { atlas, states, measureContext }) : null;
	}

	constructor(parent, markers, renderer, modelsParent, prepared = null) {
		this.markers = markers;
		this.pixelRatio = renderer.getPixelRatio();
		this.viewport = new THREE.Vector2();
		const measureContext = prepared?.measureContext ?? document.createElement("canvas").getContext("2d");
		const states = prepared?.states ?? createDetailStates(measureContext);
		this.atlas = prepared?.atlas ?? createSceneHudAtlas(getMmk1DetailRasterRatio(renderer.capabilities?.maxTextureSize), states, "mmk1-detail", MMK1_DETAIL_SIZE);
		// The same minification filtering as the narrative typography. Only the
		// clean image is filtered; the letter-order data remains exact/nearest.
		this.atlas.texture.generateMipmaps = true;
		this.atlas.texture.minFilter = THREE.LinearMipmapLinearFilter;
		this.atlas.texture.magFilter = THREE.LinearFilter;
		this.overviewSoundBounds = states.map(compositions => compositions.slice(4, 6).map(lines => {
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
			? new SceneTextLocale(MMK1_INTRO_REVEAL_SECONDS, MMK1_INTRO_REVEAL_SECONDS) : new SceneTextLocale());
		this.panels = [...markers, { name: "mmk1-overview" }].map((marker, index) => {
			const overview = index === 4;
			const view = overview ? MMK1_OVERVIEW_VIEW : MMK1_DETAIL_VIEW;
			const material = new THREE.ShaderMaterial({
				uniforms: {
					uLabels: { value: this.atlas.texture }, uLetterOrder: { value: this.atlas.orderTexture },
					uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
					uViewport: { value: this.viewport }, uOrigin: { value: new THREE.Vector2() }, uScale: { value: 1 }, uOverview: { value: overview ? 1 : 0 },
					uPanelSize: { value: new THREE.Vector2(MMK1_DETAIL_SIZE.width, view.height) },
					uUvBounds: { value: new THREE.Vector4(0, view.uvBottom, 1, view.uvTop) },
					uSnake: { value: 0 }, uReveal: { value: 0 }, uState: { value: index }, uLocale: { value: 0 }, uDetails: { value: 0 },
					uStateCount: { value: MMK1_DETAIL_STATE_COUNT },
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
			const compact = viewport.x < 1280 || viewport.y <= 600;
			u.uState.value = i === 4 ? (compact ? 5 : 4) : i;
		}
	}

	update(delta, selectedId, flight, locale, { started = false, current = false, transitioning = false } = {}) {
		for (let i = 0; i < this.panels.length; i++) {
			const u = this.panels[i].material.uniforms;
			const reveal = i === 4 ? u.uReveal : u.uSnake;
			const language = this.localeMotions[i];
			const animating = language.busy || (reveal.value > 0 && reveal.value < 1);
			const animate = started && (current || (transitioning && animating));
			const requested = i === 4
				? !selectedId && !flight
				: this.markers[i].name === selectedId && (!flight || flight.progress >= 0.78);
			const natural = !animate || language.busy ? reveal.value : i === 4
				? advanceMmk1IntroReveal(reveal.value, requested, delta) : advanceHudSnake(reveal.value, requested, delta);
			reveal.value = language.update(animate ? delta : 0, locale, natural, requested);
			u.uLocale.value = language.locale;
			// Keep pointer blocking tied to the prepared panel's visible state.
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

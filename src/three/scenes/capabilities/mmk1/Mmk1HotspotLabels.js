import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import * as THREE from "three";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { createSceneHudAtlas, createSceneHudAtlasChunked } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { advanceHudSnake, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { MMK1_CAMERA_HOTSPOTS } from "./mmk1CameraHotspotsConfig.js";
import { MMK1_HOTSPOT_DETAILS } from "./mmk1HotspotDetailsConfig.js";

const VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin,uLeaderStart,uLeaderEnd;
	uniform float uLeader;
	varying vec2 vUv;
	void main(){
		vec2 lo=mix(vec2(0.0),min(vec2(0.0),uLeaderEnd-3.0),uLeader);
		vec2 hi=mix(vec2(300.0,110.0),max(vec2(300.0,110.0),uLeaderEnd+3.0),uLeader);
		vec2 px=mix(lo,hi,uv);
		vUv=px/vec2(300.0,200.0);
		vec2 pixel=uOrigin+px;
		gl_Position=vec4(pixel/uViewport*2.0-1.0,0.0,1.0);
	}
`;
const FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels,uLetterOrder,uGlyphs;
	uniform float uSnake,uGlyphCount,uLocale,uState,uDetails,uLeader;
	uniform vec2 uLeaderStart,uLeaderEnd;
	varying vec2 vUv;
	${hudSnakeGlsl(4, [96, 74, 38])}
	vec2 clickIcon(vec2 p){
		// A compact chamfered shell, clear wheel and a separate illuminated left key.
		vec2 q=abs(p);
		float shell=max(max(q.x-5.5,q.y-8.0),(q.x+q.y-10.7)*0.7071);
		float outline=1.0-smoothstep(0.3,0.85,abs(shell));
		float inside=1.0-smoothstep(-1.3,-0.75,shell);
		float button=inside*(1.0-smoothstep(-1.5,-0.9,p.x))*smoothstep(1.5,2.1,p.y);
		float seam=(1.0-smoothstep(0.2,0.65,abs(p.x)))*step(5.5,p.y)*inside;
		float wheel=(1.0-smoothstep(0.4,0.85,abs(p.x)))*smoothstep(1.2,1.6,p.y)*(1.0-smoothstep(4.4,4.8,p.y));
		return vec2(max(outline,max(wheel,seam)),button*0.82);
	}
	void main(){
		if(uSnake<=0.0)discard;
		vec2 px=vUv*vec2(300.0,200.0);
		bool inPanel=px.x>=0.0&&px.x<=300.0&&px.y>=0.0&&px.y<=110.0;
		vec4 text=inPanel?snakeLabel(vUv,uState):vec4(0.0);
		vec2 icon=clickIcon(px-vec2(mix(21.0,264.0,uLeader),38.0))*smoothstep(0.60,0.94,uSnake);
		float along=mix(px.x-15.0,270.0-px.x,uLeader);
		float divider=(1.0-smoothstep(0.25,0.85,abs(px.y-56.0)))*step(0.0,along)
			*(1.0-smoothstep(170.0,255.0,along))*(0.28+0.28*(1.0-smoothstep(20.0,36.0,along)))
			*smoothstep(0.42,0.72,uSnake);
		float accent=max(max(icon.x,icon.y),divider);
		float inkAlpha=text.a+accent*(1.0-text.a);
		vec3 actionTint=mix(vec3(0.60784,0.70980,0.76078),vec3(0.40,0.78,0.90),step(0.01,icon.y));
		text=vec4((text.rgb*text.a+actionTint*accent*(1.0-text.a))/max(inkAlpha,0.001),inkAlpha);
		float backing=inPanel?uDetails*(1.0-smoothstep(255.0,299.0,px.x))*smoothstep(4.0,24.0,px.y)*0.65:0.0;
		vec2 ab=uLeaderEnd-uLeaderStart;
		float t=clamp(dot(px-uLeaderStart,ab)/max(dot(ab,ab),1.0),0.0,1.0);
		float distance=length(px-uLeaderStart-ab*t);
		float wire=(1.0-smoothstep(0.35,1.1,distance))*uLeader*uDetails*0.58;
		float base=wire+backing*(1.0-wire);
		float alpha=text.a+base*(1.0-text.a);
		if(alpha<0.002)discard;
		gl_FragColor=vec4((text.rgb*text.a+vec3(0.38,0.88,1.0)*wire*(1.0-text.a))/max(alpha,0.001),alpha);
	}
`;

/** Four prewarmed text panels; hover only moves the shared snake playhead. */
export class Mmk1HotspotLabels {
	static async create(parent, markers, renderer, cancelled) {
		const atlas = await createSceneHudAtlasChunked(getScenePixelRatio(renderer), createLabelStates(), "mmk1-hotspot", undefined, cancelled);
		return atlas ? new Mmk1HotspotLabels(parent, markers, renderer, atlas) : null;
	}

	constructor(parent, markers, renderer, preparedAtlas = null) {
		this.markers = markers;
		this.localeMotions = markers.map(() => new SceneTextLocale());
		this.soundReveals = new Float32Array(markers.length);
		this.pixelRatio = getScenePixelRatio(renderer);
		this.viewport = new THREE.Vector2();
		this.projected = new THREE.Vector3();
		this.atlas = preparedAtlas ?? createSceneHudAtlas(this.pixelRatio, createLabelStates(), "mmk1-hotspot");
		this.geometry = new THREE.PlaneGeometry(2, 2);
		this.panels = markers.map((marker, index) => {
			const material = new THREE.ShaderMaterial({
				uniforms: {
					uLabels: { value: this.atlas.texture }, uLetterOrder: { value: this.atlas.orderTexture },
					uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
					uViewport: { value: this.viewport }, uOrigin: { value: new THREE.Vector2() },
					uSnake: { value: 0 }, uState: { value: index }, uLocale: { value: 0 }, uDetails: { value: 0 },
					uLeader: { value: marker.userData.hotspotDefinition.labelPlacement === "left" ? 1 : 0 },
					uLeaderStart: { value: new THREE.Vector2() }, uLeaderEnd: { value: new THREE.Vector2() },
				},
				vertexShader: VERTEX, fragmentShader: FRAGMENT,
				transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			});
			const panel = new THREE.Mesh(this.geometry, material);
			panel.name = `${marker.name}-label`;
			panel.frustumCulled = false;
			panel.renderOrder = 81;
			parent.add(panel);
			return panel;
		});
	}

	layout(camera, viewport) {
		this.viewport.copy(viewport);
		const { x: width, y: height } = viewport;
		const compact = width <= 768;
		const margin = compact ? 12 : 140;
		const bottom = compact ? (height < 480 ? 64 : 92) : 24;
		const top = compact ? (height < 480 ? 100 : 136) : 44;
		for (let i = 0; i < this.panels.length; i++) {
			const marker = this.markers[i];
			const panel = this.panels[i];
			panel.visible = marker.visible;
			marker.getWorldPosition(this.projected).project(camera);
			const x = (this.projected.x + 1) * width / 2;
			const y = (this.projected.y + 1) * height / 2;
			const right = x + 334 < width - margin;
			const linked = marker.userData.hotspotDefinition.labelPlacement === "left";
			// The cab caption sits closer to its own ring, clear of the hook below-left.
			const linkedOffset = i === 1 ? 312 : 342;
			const stacked = linked && x - linkedOffset < margin;
			const u = panel.material.uniforms;
			u.uOrigin.value.set(
				THREE.MathUtils.clamp(linked ? x - (stacked ? 270 : linkedOffset) : right ? x + 34 : x - 334, margin, Math.max(margin, width - 314)),
				THREE.MathUtils.clamp(y - (stacked ? 170 : 100), bottom, Math.max(bottom, height - top - 110)),
			).multiplyScalar(this.pixelRatio).round().divideScalar(this.pixelRatio);
			u.uLeaderStart.value.set(stacked ? x - u.uOrigin.value.x : 278, stacked ? 110 : 96);
			u.uLeaderEnd.value.set(x - u.uOrigin.value.x - (stacked ? 0 : 30), y - u.uOrigin.value.y - (stacked ? 30 : 4));
		}
	}

	update(delta, hovered, locale) {
		for (let i = 0; i < this.panels.length; i++) {
			const requested = this.markers[i] === hovered;
			const u = this.panels[i].material.uniforms;
			const language = this.localeMotions[i];
			const natural = language.busy ? u.uSnake.value : advanceHudSnake(u.uSnake.value, requested, delta);
			u.uSnake.value = language.update(delta, locale, natural, requested);
			this.soundReveals[i] = u.uSnake.value;
			u.uDetails.value = THREE.MathUtils.damp(u.uDetails.value, requested ? 1 : 0, 7, delta);
			u.uLocale.value = language.locale;
		}
	}

	reset() {
		for (const language of this.localeMotions) language.reset();
		this.soundReveals.fill(0);
		for (const panel of this.panels) {
			panel.material.uniforms.uSnake.value = 0;
			panel.material.uniforms.uDetails.value = 0;
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

function createLabelStates() {
	// Fit both headline rows together during preparation, never during hover.
	const ctx = document.createElement("canvas").getContext("2d");
	ctx.font = '500 16px ManifoldExtended, "Segoe UI", sans-serif';
	return ["ru", "en", "zh"].map((locale) => MMK1_CAMERA_HOTSPOTS.map(({ labelPlacement }, index) => {
		const left = labelPlacement === "left";
		const headlines = MMK1_HOTSPOT_DETAILS[index].headlines[locale];
		const maxWidth = Math.max(...headlines.map(text => Array.from(text).reduce((sum, char) =>
			sum + (char === " " ? 6.72 : ctx.measureText(char).width + 0.45), 0)));
		const size = Math.floor(16 * Math.min(1, 254 / maxWidth) * 10) / 10;
		return [
			...headlines.map((text, row) => ({
				text, x: left ? 270 : 15, y: 104 + row * 22, size,
				tracking: 0.45, space: size * 0.42, color: "#d3f3ff", row,
				align: left ? "right" : "left",
			})),
			{
				text: locale === "en" ? "LEARN MORE" : locale === "zh" ? "了解更多" : "ПОДРОБНЕЕ",
				x: left ? 247 : 37, y: 162, size: 12.5, tracking: 1.35, space: 6,
				color: "#9bb5c2", row: 2, align: left ? "right" : "left",
			},
		];
	}));
}

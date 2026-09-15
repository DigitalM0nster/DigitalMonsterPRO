import * as THREE from "three";
import { store } from "@/app/store.jsx";
import { SITE_LOCALES, normalizeSiteLocale } from "@/functions/siteLocale.js";
import { siteLocaleReveal, isSiteLocaleTransitionActive } from "@/functions/siteLocaleTransitionState.js";
import { getNavItemLabel } from "@/app/localization/interfaceTranslations.js";
import { getAllPortfolioProjects } from "@/pages/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { createSceneHudAtlasChunked } from "@/three/objects/sceneHud/sceneHudAtlas.js";
import { hudSnakeGlsl } from "@/three/objects/sceneHud/sceneHudShaders.js";
import { ensureCaseStudyCanvasFonts } from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasText.js";
import { SITE_ARC_DISPLAY_FONT } from "../siteArcConfig.js";
import { wrapTitleLines } from "../siteArcNavLayout.js";
import { yieldToPreparationFrame } from "@/three/app/preparationFrame.js";

export const siteArcLabelBridge = { owner: null, layout: null, width: 0, height: 0, opacity: 0 };
const WIDTH = 256, HEIGHT = 32, PAD = 6, FONT_SIZE = 9, TRACKING = 1.44;
const vertexShader = `
uniform vec2 uViewport;
uniform vec4 uRect;
uniform float uCropLeft;
varying vec2 vUv;
void main(){
 vUv=vec2(mix(uCropLeft,1.0,uv.x),uv.y);
 vec2 p=uRect.xy+vec2(uv.x,1.0-uv.y)*uRect.zw;
 gl_Position=vec4(p.x/uViewport.x*2.0-1.0,1.0-p.y/uViewport.y*2.0,0.0,1.0);
}`;

/** Small, prepared atlas + glyph-order map. Only uniforms change on locale, hover or arc motion. */
export class SiteArcLabels {
	constructor(scene) { this.scene = scene; this.slots = []; this.states = new Map(); this.widths = new Map(); this.hoverStarts = new Map(); this.disposed = false; }
	async prepare(renderer) {
		await ensureCaseStudyCanvasFonts();
		const siteIds = ["main", "portfolio", "capabilities", "about", "contacts"];
		const ids = [...siteIds, ...getAllPortfolioProjects().map(project => project.config.id)];
		ids.forEach((id, index) => this.states.set(id, index));
		const measure = document.createElement("canvas").getContext("2d");
		measure.font = `500 ${FONT_SIZE}px ${SITE_ARC_DISPLAY_FONT}`;
		const states = SITE_LOCALES.map(locale => ids.map(id => {
			const title = siteIds.includes(id) ? getNavItemLabel(id, locale) : getPortfolioProjectName(id, locale);
			return wrapTitleLines(title).map((text, row) => {
				const width = Array.from(text).reduce((sum, char) => sum + (char === " " ? FONT_SIZE * .55 : measure.measureText(char).width + TRACKING), 0) - TRACKING;
				this.widths.set(id, Math.min(WIDTH, Math.max(this.widths.get(id) ?? 48, Math.ceil(width) + PAD * 2)));
				return { text, x: WIDTH - PAD, y: 7.5 + row * 10.35, size: FONT_SIZE, color: "#ffffff", row, align: "right", tracking: TRACKING, font: measure.font };
			});
		}));
		this.atlas = await createSceneHudAtlasChunked(Math.min(2, renderer.getPixelRatio()), states, "site-arc-labels", { width: WIDTH, height: HEIGHT, rowCount: 2 }, () => this.disposed);
		if (!this.atlas || this.disposed) return;
		for (const texture of [this.atlas.texture, this.atlas.orderTexture, this.atlas.glyphTexture]) {
			await yieldToPreparationFrame();
			if (this.disposed) return;
			renderer.initTexture(texture);
		}
		this.geometry = new THREE.PlaneGeometry(1, 1);
		const fragmentShader = `precision highp float;
uniform sampler2D uLabels,uLetterOrder,uGlyphs;
uniform float uLocale,uState,uSnake,uGlyphCount,uOpacity;
varying vec2 vUv;
${hudSnakeGlsl(ids.length, [24.5, 14.15], {width:WIDTH,height:HEIGHT})}
void main(){vec4 ink=snakeLabel(vUv,uState);gl_FragColor=vec4(ink.rgb,ink.a*uOpacity);}`;
		for (let i = 0; i < 16; i++) {
			const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
				uniforms: { uLabels: {value:this.atlas.texture}, uLetterOrder:{value:this.atlas.orderTexture}, uGlyphs:{value:this.atlas.glyphTexture}, uGlyphCount:{value:this.atlas.glyphCount}, uLocale:{value:0}, uState:{value:0}, uSnake:{value:1}, uOpacity:{value:0}, uViewport:{value:new THREE.Vector2(1440,900)}, uRect:{value:new THREE.Vector4(0,0,WIDTH,HEIGHT)}, uCropLeft:{value:0} } });
			const mesh = new THREE.Mesh(this.geometry, material);mesh.frustumCulled = false;mesh.renderOrder = 10;mesh.visible = false;this.scene.add(mesh);this.slots.push(mesh);
		}
		siteArcLabelBridge.owner = this;
	}
	width(id) { return this.widths.get(id) ?? 48; }
	hover(id) { if (!isSiteLocaleTransitionActive()) this.hoverStarts.set(id, performance.now()); }
	sync(visible) {
		const {layout,width,height,opacity} = siteArcLabelBridge;
		const now = performance.now(), locale = SITE_LOCALES.indexOf(normalizeSiteLocale(store.siteLocale));
		for (let i = 0; i < this.slots.length; i++) {
			const mesh = this.slots[i], item = layout?.items[i];
			mesh.visible = Boolean(visible && item && this.states.has(item.id) && width > 1024 && height > 600);
			if (!mesh.visible) continue;
			const u = mesh.material.uniforms, w = this.width(item.id);
			u.uViewport.value.set(width,height);u.uRect.value.set(item.x-item.labelGap-w+PAD,item.y+(layout.stackGap??8)/2-3,w,HEIGHT);u.uCropLeft.value=(WIDTH-w)/WIDTH;
			u.uLocale.value=locale;u.uState.value=this.states.get(item.id);u.uOpacity.value=item.opacity*opacity*(item.isActive?1:(layout.inactiveTextOpacity??.45));
			const start = this.hoverStarts.get(item.id), elapsed = start == null ? Infinity : now-start;
			u.uSnake.value=isSiteLocaleTransitionActive()?siteLocaleReveal.value:elapsed<480?1-elapsed/480:Math.min(1,(elapsed-480)/1150);
			if (elapsed >= 1630) this.hoverStarts.delete(item.id);
		}
	}
	beginScreenWarmupDraw() {
		for (const mesh of this.slots) {mesh.material.uniforms.uOpacity.value=1;mesh.material.uniforms.uSnake.value=.5;}
		return () => {for (const mesh of this.slots) {mesh.material.uniforms.uOpacity.value=0;mesh.material.uniforms.uSnake.value=1;}};
	}
	dispose() {
		this.disposed=true;if(siteArcLabelBridge.owner===this)siteArcLabelBridge.owner=null;
		for(const mesh of this.slots){mesh.removeFromParent();mesh.material.dispose();}this.geometry?.dispose();
		for(const key of ["texture","orderTexture","glyphTexture"])this.atlas?.[key]?.dispose();
	}
}

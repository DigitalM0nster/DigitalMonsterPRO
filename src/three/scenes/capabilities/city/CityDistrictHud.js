import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import * as THREE from "three";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { createSceneHudAtlas } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { advanceHudSnake, HUD_MARKER_GLSL, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { CITY_HUD_STATE_COUNT, createDistrictHudContent, districtHudState, districtHudMetrics } from "./cityDistrictHudContent.js";
import { CITY_HUD_WIDTH, CITY_HUD_HEIGHT, layoutDistrictHud } from "./cityDistrictHudLayout.js";

/** The sphere's prepared atlas + reversible glyph reveal, with district content. */
export class CityDistrictHud {
	static async prepare() {
		await Promise.all([
			document.fonts?.load("500 16px ManifoldExtended"),
			document.fonts?.load("400 14px MazzardM"),
		]);
	}

	constructor(parent, renderer, highlight) {
		this.parent = parent; this.highlight = highlight;
		this.localeMotion = new SceneTextLocale();
		this.viewport = new THREE.Vector2();
		this.projected = new THREE.Vector3();
		this.localAnchor = new THREE.Vector3();
		this.origin = new THREE.Vector2();
		this.current = -1; this.composeMode = "models";
		this.placement = { side: 0 }; this.layoutPending = true; this.follow = 1;
		this.states = highlight.districts.map(districtHudState);
		this.metrics = highlight.districts.map(districtHudMetrics);
		this.overlayScene = new THREE.Scene();
		parent.add(highlight.markers.mesh);
		this.pixelRatio = getScenePixelRatio(renderer);
		const atlasRatio = Math.min(2, this.pixelRatio, renderer.capabilities.maxTextureSize / (CITY_HUD_STATE_COUNT * CITY_HUD_HEIGHT));
		this.atlas = createSceneHudAtlas(atlasRatio, createDistrictHudContent(), "city-district", { width: CITY_HUD_WIDTH, height: CITY_HUD_HEIGHT });
		this.uniforms = {
			uLabels: { value: this.atlas.texture }, uLetterOrder: { value: this.atlas.orderTexture },
			uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
			uViewport: { value: new THREE.Vector2() }, uOrigin: { value: new THREE.Vector2() },
			uStart: { value: new THREE.Vector2() }, uOnscreen: { value: 1 },
			uEnd: { value: new THREE.Vector2() }, uReveal: { value: 0 }, uSnake: { value: 0 },
			uLocale: { value: 0 }, uState: { value: 0 }, uScale: { value: 1 },
			uBars: { value: new Float32Array(5) }, uCount: { value: 4 }, uIsPark: { value: 0 }, uIndex: { value: 1 },
		};
		const panel = new THREE.ShaderMaterial({
			uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			vertexShader: `uniform vec2 uViewport,uOrigin; uniform float uScale; varying vec2 vUv;
				void main(){vUv=uv;gl_Position=vec4((uOrigin+uv*vec2(${CITY_HUD_WIDTH}.,${CITY_HUD_HEIGHT}.)*uScale)/uViewport*2.-1.,0.,1.);}`,
			fragmentShader: `uniform sampler2D uLabels,uLetterOrder,uGlyphs;
				uniform float uGlyphCount,uSnake,uState,uLocale,uReveal,uOnscreen,uBars[5],uCount,uIsPark,uIndex;varying vec2 vUv;
				${HUD_MARKER_GLSL}
				${hudSnakeGlsl(CITY_HUD_STATE_COUNT, [141, 121, 101], { width: CITY_HUD_WIDTH, height: CITY_HUD_HEIGHT })}
				float digit(vec2 p,vec2 base,vec2 size,float number){
					vec2 uv=(p-base)/size;
					if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)return 0.;
					return texture2D(uGlyphs,vec2((number+uv.x)/uGlyphCount,uv.y)).a;
				}
				float infographic(vec2 p){
					float ink=digit(p,vec2(17.,18.),vec2(20.,32.),uCount);
					if(uIsPark>.5){
						vec2 q=p-vec2(254.,33.);float r=length(q);
						ink=max(ink,stroke(r-19.,.65));
						ink=max(ink,stroke(r-5.,.6)*.7);
						ink=max(ink,stroke(min(abs(q.x),abs(q.y)),.55)*step(6.,r)*step(r,18.));
					}else{
						for(int i=0;i<5;i++){
							float x=181.+float(i)*24.,h=uBars[i]*32.;
							if(float(i)>=uCount)continue;
							float rect=step(x,p.x)*step(p.x,x+16.)*step(17.,p.y)*step(p.y,17.+h);
							ink=max(ink,rect*mix(.4,.9,(p.y-17.)/max(h,1.)));
						}
						ink=max(ink,stroke(p.y-16.,.4)*step(177.,p.x)*step(p.x,301.)*.35);
					}
					return ink*smoothstep(.3,.9,uSnake);
				}
				void main(){
					vec2 p=vUv*vec2(320.,224.);
					if(p.x<1.||p.x>319.||p.y<1.||p.y>223.||p.x+p.y>532.)discard;
					vec4 text=p.y>89.&&p.y<153.?snakeLabel(vUv,uState):label(vUv,uState);
					if(p.y<82.)text.a*=smoothstep(.3,.9,uSnake);
					float marks=infographic(p);
					if(uIsPark<.5){
						marks=max(marks,digit(p,vec2(282.,194.),vec2(10.,16.),floor(uIndex/10.))*.7);
						marks=max(marks,digit(p,vec2(293.,194.),vec2(10.,16.),mod(uIndex,10.))*.7);
					}
					float markAlpha=text.a+marks*(1.-text.a);
					text.rgb=(text.rgb*text.a+vec3(.42,.8,.9)*marks*(1.-text.a))/max(markAlpha,.001);text.a=markAlpha;
					float edge=min(min(p.x-1.,319.-p.x),min(p.y-1.,223.-p.y));
					edge=min(edge,(532.-p.x-p.y)*.7071);
					float frame=stroke(edge,.45)*.33;
					float accent=stroke(p.y-223.,.8)*step(18.,p.x)*step(p.x,52.);
					float divider=stroke(p.y-80.,.35)*step(18.,p.x)*step(p.x,302.)*.18;
					float ink=max(max(frame,divider),accent);
					vec3 backing=mix(vec3(.007,.014,.022),vec3(.16,.65,.85),ink);
					float alpha=text.a+.985*(1.-text.a);
					vec3 color=(text.rgb*text.a+backing*.985*(1.-text.a))/max(alpha,.001);
					if(uReveal*uOnscreen<.001)discard;
					gl_FragColor=vec4(color,alpha*uReveal*uOnscreen);
				}`,
		});
		const link = new THREE.ShaderMaterial({
			uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			vertexShader: `uniform vec2 uViewport,uStart,uEnd;varying vec2 vPoint;
				void main(){vPoint=min(uStart,uEnd)-4.+uv*(abs(uStart-uEnd)+8.);
				gl_Position=vec4(vPoint/uViewport*2.-1.,0.,1.);}`,
			fragmentShader: `uniform vec2 uStart,uEnd;uniform float uReveal,uOnscreen;varying vec2 vPoint;
				void main(){vec2 a=uStart,ab=uEnd-a;
				float t=clamp(dot(vPoint-a,ab)/max(dot(ab,ab),1.),0.,1.);
				float d=length(vPoint-a-t*ab);
				float alpha=(1.-smoothstep(.4,1.1,d))*.48*uReveal;
				alpha=max(alpha,(1.-smoothstep(1.5,2.5,length(vPoint-uEnd)))*uReveal);
				alpha*=uOnscreen;
				if(alpha<.002)discard;gl_FragColor=vec4(.20,.69,.93,alpha);}`,
		});
		this.panel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), panel);
		this.link = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), link);
		for (const [i, mesh] of [this.link, this.panel].entries()) {
			mesh.name = i ? "city-district-hud" : "city-district-link";
			mesh.frustumCulled = false; mesh.renderOrder = 79 + i;
			mesh.onBeforeRender = (renderer, scene, camera) => this.layout(renderer, camera);
			parent.add(mesh);
		}
	}

	layout(renderer, camera) {
		renderer.getSize(this.viewport);
		const { x: width, y: height } = this.viewport, u = this.uniforms;
		const resized = !u.uViewport.value.equals(this.viewport);
		u.uViewport.value.copy(this.viewport);
		this.projected.copy(this.localAnchor); this.parent.localToWorld(this.projected); this.projected.project(camera);
		u.uEnd.value.set((this.projected.x + 1) * width / 2, (this.projected.y + 1) * height / 2);
		if (this.current >= 0) u.uEnd.value.add(this.highlight.markers.offsets[this.current]);
		u.uOnscreen.value = Math.abs(this.projected.z) <= 1 && Math.abs(this.projected.x) <= 1 && Math.abs(this.projected.y) <= 1 ? 1 : 0;
		const p = layoutDistrictHud(width, height, u.uEnd.value.x, u.uEnd.value.y, this.placement);
		u.uScale.value = p.scale;
		if (this.layoutPending || resized) {
			const follow = resized || u.uReveal.value < .08 ? 1 : this.follow;
			this.origin.x += (p.x - this.origin.x) * follow;
			this.origin.y += (p.y - this.origin.y) * follow;
			// Snap only the text's output pose, never the spring state or line endpoints.
			u.uOrigin.value.copy(this.origin).multiplyScalar(this.pixelRatio).round().divideScalar(this.pixelRatio);
			this.layoutPending = false;
		}
		u.uStart.value.set(
			THREE.MathUtils.clamp(u.uEnd.value.x, this.origin.x + 1, this.origin.x + p.width - 1),
			THREE.MathUtils.clamp(u.uEnd.value.y, this.origin.y + 1, this.origin.y + p.height - 1),
		);
	}

	update(delta, locale) {
		const selected = this.highlight.hovered, u = this.uniforms;
		if (selected !== this.current && (u.uReveal.value < .025 || this.current < 0)) {
			this.current = selected; u.uSnake.value = 0;
			this.localeMotion.reset();
			if (selected >= 0) {
				this.placement.side = 0;
				this.localAnchor.copy(this.highlight.focus);
				u.uState.value = this.states[selected];
				const metrics = this.metrics[selected];
				u.uBars.value.set(metrics.heights); u.uCount.value = metrics.count;
				u.uIsPark.value = metrics.park ? 1 : 0; u.uIndex.value = selected + 1;
			}
		}
		const showing = selected >= 0 && selected === this.current;
		if (showing) this.localAnchor.copy(this.highlight.focus);
		this.layoutPending = true; this.follow = 1 - Math.exp(-18 * delta);
		u.uReveal.value = THREE.MathUtils.damp(u.uReveal.value, showing ? 1 : 0, showing ? 8 : 18, delta);
		const natural = this.localeMotion.busy ? u.uSnake.value : advanceHudSnake(u.uSnake.value, showing, delta);
		u.uSnake.value = this.localeMotion.update(delta, locale, natural, showing);
		u.uLocale.value = this.localeMotion.locale;
	}

	reset() { this.current = -1; this.uniforms.uReveal.value = 0; this.uniforms.uSnake.value = 0; this.localeMotion.reset(); }
	beginWarmupDraw() { this.uniforms.uReveal.value = .01; this.uniforms.uSnake.value = .5; }
	endWarmupDraw() { this.reset(); }
	setComposeMode(mode) {
		if (this.composeMode === mode) return;
		this.composeMode = mode;
		(mode === "screen" ? this.overlayScene : this.parent).add(this.panel, this.link, this.highlight.markers.mesh);
	}
	renderScreenOverlay(renderer, camera) {
		if (this.composeMode !== "screen" || !this.parent.visible) return;
		const autoClear = renderer.autoClear;
		try { renderer.autoClear = false; renderer.render(this.overlayScene, camera); }
		finally { renderer.autoClear = autoClear; }
	}
	dispose() {
		for (const mesh of [this.panel, this.link]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
		this.atlas.texture.dispose(); this.atlas.orderTexture.dispose(); this.atlas.glyphTexture.dispose();
	}
}

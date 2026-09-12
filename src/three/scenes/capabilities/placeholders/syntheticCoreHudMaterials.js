import * as THREE from "three";
import { HUD_MARKER_GLSL, hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";

// Rasterize only the panel / signal bounds, never a full-screen quad for a small HUD.
const PANEL_VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin;
	varying vec2 vUv;
	void main(){
		vec2 pixel=uOrigin-vec2(36.0,154.0)+uv*vec2(300.0,200.0);
		vUv=pixel/uViewport;
		gl_Position=vec4(vUv*2.0-1.0,0.0,1.0);
	}
`;
const LINK_VERTEX = /* glsl */ `
	uniform vec2 uViewport,uOrigin,uEnd;
	varying vec2 vUv;
	void main(){
		vec2 start=uOrigin+vec2(31.0,-3.0);
		vec2 pixel=min(start,uEnd)-5.0+uv*(abs(start-uEnd)+10.0);
		vUv=pixel/uViewport;
		gl_Position=vec4(vUv*2.0-1.0,0.0,1.0);
	}
`;
const PANEL_FRAGMENT = /* glsl */ `
	uniform vec2 uViewport,uOrigin;
	uniform sampler2D uLabels;
	uniform sampler2D uLetterOrder,uGlyphs;
	uniform float uSnake,uGlyphCount;
	uniform float uTime,uHover,uDetails,uReveal,uOpen,uLocale,uProbe,uCoreHover;
	varying vec2 vUv;
	${HUD_MARKER_GLSL}
	${hudSnakeGlsl(6)}
	float settledMix(float progress){
		// Preserve the old endpoint shortcuts, including their strict thresholds.
		if(progress<0.001)return 0.0;
		if(progress>0.999)return 1.0;
		return progress;
	}
	vec4 activeLabel(vec2 uv){
		if(uv.y>0.60)return label(uv,0.0);
		if(uSnake<=0.0)return vec4(0.0);
		float opened=settledMix(uOpen);
		float hovered=settledMix(uCoreHover);
		float probed=settledMix(uProbe);
		// mix(mix(idle,hover,H),probe,P): the same RGBA weights as before.
		vec3 modes=vec3((1.0-probed)*(1.0-hovered),(1.0-probed)*hovered,probed);
		vec4 result=vec4(0.0);
		// One snakeLabel call site instead of nested copies in every mix branch.
		// Each pair is closed/open; inactive states do not sample any textures.
		for(int state=0;state<6;state++){
			float assembly=mod(float(state),2.0)<0.5?1.0-opened:opened;
			float weight=modes[state/2]*assembly;
			if(weight>0.0)result+=weight*snakeLabel(uv,float(state));
		}
		return result;
	}
	void main(){
		vec2 px=vUv*uViewport-uOrigin+vec2(36.0,154.0);
		if(px.x<0.0||px.x>300.0||px.y<0.0||px.y>200.0)discard;
		vec2 p=px-vec2(36.0,154.0);
		// The original concentric circles: circular in screen pixels at every aspect ratio.
		vec2 uv=px/vec2(300.0,200.0);
		vec4 text=activeLabel(uv);
		float detailArea=1.0-smoothstep(116.0,120.0,px.y);
		float divider=stroke(px.y-119.0,0.4)*step(15.0,px.x)*(1.0-smoothstep(245.0,265.0,px.x))*uDetails*0.25;
		float ink=clamp(hudMarkerInk(p,uTime,uHover,uProbe,1.0)+divider,0.0,1.0);
		vec3 tint=hudMarkerTint(uHover,uProbe);
		float backing=detailArea*uDetails*(1.0-smoothstep(255.0,299.0,px.x))*smoothstep(4.0,24.0,px.y)*0.65;
		float baseAlpha=ink+backing*(1.0-ink);
		float alpha=text.a+baseAlpha*(1.0-text.a);
		// Compose glyph coverage once; squaring alpha softens fine letter strokes.
		vec3 color=(text.rgb*text.a+tint*ink*(1.0-text.a))/max(alpha,0.001);
		alpha*=uReveal;
		if(alpha<0.002)discard;
		gl_FragColor=vec4(color,alpha);
	}
`;
const LINK_FRAGMENT = /* glsl */ `
	uniform vec2 uViewport,uOrigin,uEnd;
	uniform float uLink,uTime,uPulse;
	varying vec2 vUv;
	void main(){
		vec2 a=uOrigin+vec2(31.0,-3.0),b=uEnd,p=vUv*uViewport,ab=b-a;
		float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1.0),0.0,1.0);
		float d=length(p-a-ab*t);
		float wire=(1.0-smoothstep(0.4,1.15,d))*0.20;
		float packets=pow(max(0.0,sin(t*26.0-uTime*3.0)),20.0)*0.35;
		float head=exp(-pow((t-uPulse)*20.0,2.0))*step(0.001,uPulse)*step(uPulse,1.05);
		float light=exp(-d*d*0.5)*(packets+head);
		float alpha=(wire+light)*smoothstep(0.0,0.07,t)*(1.0-smoothstep(0.92,1.0,t))*uLink;
		if(alpha<0.002)discard;
		gl_FragColor=vec4(vec3(0.20,0.69,0.93)+head*vec3(0.3,0.4,0.4),alpha);
	}
`;

export function createHudQuad(uniforms, link = false) {
	const material = new THREE.ShaderMaterial({
		uniforms, vertexShader: link ? LINK_VERTEX : PANEL_VERTEX, fragmentShader: link ? LINK_FRAGMENT : PANEL_FRAGMENT,
		transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	mesh.name = link ? "core-connection-signal" : "core-action-hud";
	mesh.renderOrder = link ? 79 : 80;
	mesh.frustumCulled = false;
	return mesh;
}

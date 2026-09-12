import { HUD_MARKER_GLSL } from "../../../objects/sceneHud/sceneHudShaders.js";

// Match CapabilityNarrative's light-trails mosaic, using the crane's prepared atlas.
export const MMK1_INTRO_REVEAL_SECONDS = 0.95;

export function advanceMmk1IntroReveal(progress, requested, delta) {
	return Math.max(0, Math.min(1, progress + Math.max(0, delta) / MMK1_INTRO_REVEAL_SECONDS * (requested ? 1 : -1)));
}

export function mmk1IntroSoundReveal(progress, right) {
	const start = (1 - right) * 0.72;
	const end = (1 - 8 / 560) * 0.72 + 0.1 + 0.18;
	return Math.max(0, Math.min(1, (progress - start) / (end - start)));
}

export const MMK1_INTRO_FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels;
	uniform float uReveal,uLocale,uState,uMarkerTime;
	uniform vec4 uUvBounds;
	varying vec2 vUv;
	${HUD_MARKER_GLSL}
	vec4 textInk(vec2 localUv){
		vec2 uv=mix(uUvBounds.xy,uUvBounds.zw,clamp(localUv,vec2(0.001),vec2(0.999)));
		// The very same hollow ring and tapered orbit as the crane's real hotspots.
		vec2 marker=(uv*vec2(560.0,320.0)-vec2(23.0,128.0))/0.56;
		if(max(abs(marker.x),abs(marker.y))<30.0){
			return vec4(hudMarkerTint(0.0,0.0),hudMarkerInk(marker,uMarkerTime,0.0,0.0,1.0));
		}
		return texture2D(uLabels,vec2((uLocale+uv.x)/3.0,(5.0-uState+uv.y)/6.0));
	}
	vec2 mosaicPhase(vec2 uv){
		vec2 cell=floor(uv*vec2(128.0,32.0));
		float stagger=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
		float phase=clamp((uReveal-(1.0-uv.x)*0.72-stagger*0.1)/0.18,0.0,1.0);
		return vec2(smoothstep(0.0,1.0,phase),sin(phase*3.14159265));
	}
	void main(){
		if(uReveal<=0.0)discard;
		vec2 uv=(vUv-uUvBounds.xy)/(uUvBounds.zw-uUvBounds.xy);
		// No mosaic math or light pass once the text has settled.
		if(uReveal>=1.0){
			#ifdef BLOOM_ONLY
				discard;
			#else
				vec4 ink=textInk(uv);
				if(ink.a<0.002)discard;
				gl_FragColor=ink;
				return;
			#endif
		}
		vec2 phase=mosaicPhase(uv);
		vec2 cell=floor(uv*vec2(128.0,32.0));
		float glitch=fract(sin(dot(cell+floor(phase.x*3.0),vec2(71.7,139.3)))*43758.5453);
		vec4 ink=textInk(uv+vec2((glitch-0.5)*0.005*phase.y,0.0));
		ink.a*=phase.x;
		if(ink.a<0.002)discard;
		#ifdef BLOOM_ONLY
			vec3 emission=vec3(2.5,10.0,18.0)*pow(max(0.0,phase.y),1.4);
			gl_FragColor=vec4(emission,ink.a);
		#else
			ink.rgb=mix(ink.rgb,vec3(0.3,0.88,1.0),phase.y*0.7);
			gl_FragColor=ink;
		#endif
	}
`;

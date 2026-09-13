import { hudSnakeGlsl } from "../../three/objects/sceneHud/sceneHudShaders.js";

export const CRANE_RETURN_SIZE = { width: 304, height: 44, rowCount: 1 };
export const CRANE_RETURN_COPY = { ru: "К ОБЩЕМУ ВИДУ", en: "BACK TO OVERVIEW", zh: "返回起重机全景" };

export function craneReturnLayout(width, height, detail) {
	const x = detail.x + 16 * detail.scale;
	return { x, y: height - detail.y + 12, width: Math.min(CRANE_RETURN_SIZE.width, width - x - 16), height: 44, shortcut: width > 1024 };
}

export function advanceCraneReturnVisibility(progress, shown, delta) {
	const dt = Math.max(0, Math.min(delta, .05));
	return Math.max(0, Math.min(1, progress + dt * (shown ? 1 / .52 : -1 / .24)));
}

/** Keep the outgoing position/language until its last letter has disappeared. */
export function updateCraneReturn(state, index, locale, textReady, delta) {
	if (state.reveal === 0) { state.index = index; state.locale = locale; }
	const shown = index >= 0 && state.index === index && state.locale === locale && textReady;
	state.reveal = advanceCraneReturnVisibility(state.reveal, shown, delta);
	return state;
}

export function createCraneReturnStates() {
	return Object.values(CRANE_RETURN_COPY).map(text => [[
		{ text, x: 42, y: 20, size: 12.5, tracking: 1.2, space: 7.5, color: "#c6dce6", row: 0 },
		{ text: "ESC", x: 274, y: 20, size: 9, font: '500 9px "Segoe UI", sans-serif', tracking: .25, space: 3, color: "#91b0bf", row: 0 },
	]]);
}

export const CRANE_RETURN_FRAGMENT = /* glsl */ `
	uniform sampler2D uLabels,uLetterOrder,uGlyphs;
	uniform float opacity,uHover,uShortcut,uSnake,uGlyphCount,uLocale,uRuleEnd;
	uniform vec4 clip;
	varying vec2 vUv,pixel;
	${hudSnakeGlsl(1, [24], CRANE_RETURN_SIZE)}
	float line(vec2 p,vec2 a,vec2 b){
		vec2 ab=b-a;
		return 1.0-smoothstep(0.35,0.95,length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0)));
	}
	void main(){
		if(uSnake<=0.0||opacity<=0.0||pixel.x<clip.x||pixel.y<clip.y||pixel.x>clip.z||pixel.y>clip.w)discard;
		vec2 p=vec2(vUv.x,1.0-vUv.y)*vec2(304.0,44.0);
		vec4 ink=snakeLabel(vUv,0.0);
		if(p.x>265.0)ink.a*=uShortcut;
		float arrow=max(line(p,vec2(3.0,20.0),vec2(25.0,20.0)),max(line(p,vec2(3.0,20.0),vec2(9.0,14.0)),line(p,vec2(3.0,20.0),vec2(9.0,26.0))))
			*smoothstep(0.0,0.18,uSnake);
		float head=uSnake*(uRuleEnd+15.0);
		float rule=line(p,vec2(0.0,35.0),vec2(uRuleEnd,35.0))*(1.0-smoothstep(head-12.0,head,p.x))*(0.44+uHover*0.3);
		vec2 badge=abs(p-vec2(283.0,20.0))-vec2(14.0,9.0);
		float esc=(1.0-smoothstep(0.2,0.9,abs(max(badge.x,badge.y))))*0.5*uShortcut*smoothstep(0.82,1.0,uSnake);
		float accent=max(arrow,max(rule,esc));
		ink.rgb=mix(ink.rgb,vec3(0.80,0.94,1.0),uHover*0.35);
		float alpha=max(ink.a,accent);
		vec3 color=mix(vec3(0.70,0.82,0.87),ink.rgb,ink.a/max(alpha,0.001));
		if(alpha<0.002)discard;
		gl_FragColor=vec4(color,alpha*opacity);
	}
`;

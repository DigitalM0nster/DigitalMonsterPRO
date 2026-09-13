import { HUD_MARKER_GLSL } from "@/three/objects/sceneHud/sceneHudShaders.js";

export const CRANE_RETURN_COPY = {
	ru: "ОБЩИЙ ВИД\nВернуться к крану целиком",
	en: "OVERVIEW\nBack to the whole crane",
	zh: "总览\n返回起重机全景",
};

export function craneReturnLayout(width, height) {
	const dock = width <= 1024;
	const buttonWidth = Math.min(300, width - 32);
	const buttonHeight = 64 * buttonWidth / 300;
	const bottom = dock ? (height <= 480 ? 78 : 94) : 36;
	return {
		x: dock ? (width - buttonWidth) / 2 : 120 + (width - 216 - buttonWidth) / 2,
		y: Math.max(76, height - bottom - buttonHeight),
		width: buttonWidth, height: buttonHeight, shortcut: !dock,
	};
}

export function advanceCraneReturnVisibility(progress, shown, delta) {
	const dt = Math.max(0, Math.min(delta, .05));
	return Math.max(0, Math.min(1, progress + dt * (shown ? 1 / .24 : -1 / .18)));
}

/** One small, prepared texture per locale. Hover never repaints these pixels. */
export function paintCraneReturn(ctx, value) {
	const [title, description] = value.split("\n");
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#dceff8";
	ctx.font = '500 15px ManifoldExtended, "Segoe UI", sans-serif';
	ctx.fillText(title, 70, 24);
	ctx.fillStyle = "#94adba";
	ctx.font = '400 12px MazzardM, "Segoe UI", sans-serif';
	ctx.fillText(description, 70, 44);
	// An actual back arrow, independent of font fallback or icon fonts.
	ctx.strokeStyle = "#d1edfa"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
	ctx.beginPath(); ctx.moveTo(42, 32); ctx.lineTo(26, 32); ctx.moveTo(32, 26); ctx.lineTo(26, 32); ctx.lineTo(32, 38); ctx.stroke();
	ctx.strokeStyle = "#294955"; ctx.lineWidth = 1;
	ctx.strokeRect(252.5, 15.5, 31, 18);
	ctx.fillStyle = "#809da9"; ctx.font = '400 10px MazzardM, "Segoe UI", sans-serif';
	ctx.fillText("ESC", 259, 25);
}

export const CRANE_RETURN_FRAGMENT = /* glsl */ `
	uniform sampler2D map;
	uniform float opacity,uTime,uHover,uShortcut;
	uniform vec4 clip;
	varying vec2 vUv,pixel;
	${HUD_MARKER_GLSL}
	void main(){
		if(opacity<=0.0||pixel.x<clip.x||pixel.y<clip.y||pixel.x>clip.z||pixel.y>clip.w)discard;
		vec2 p=vec2(vUv.x,1.0-vUv.y)*vec2(300.0,64.0);
		vec2 q=abs(p-vec2(150.0,32.0))-vec2(118.0,0.0);
		float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-31.0;
		float shape=1.0-smoothstep(-0.4,0.7,d);
		float edge=1.0-smoothstep(0.3,1.1,abs(d+1.0));
		vec3 base=mix(vec3(0.009,0.021,0.030),vec3(0.15,0.44,0.57),edge*(0.3+uHover*0.5));
		float ring=hudMarkerInk((p-vec2(34.0,32.0))/0.88,uTime,uHover,0.0,1.0);
		base=mix(base,hudMarkerTint(uHover,0.0),clamp(ring,0.0,1.0));
		vec4 ink=texture2D(map,vUv);
		if(p.x>248.0&&p.y<36.0)ink.a*=uShortcut;
		float backing=shape*0.96;
		float alpha=ink.a+backing*(1.0-ink.a);
		if(alpha<0.002)discard;
		gl_FragColor=vec4((ink.rgb*ink.a+base*backing*(1.0-ink.a))/alpha,alpha*opacity);
	}
`;

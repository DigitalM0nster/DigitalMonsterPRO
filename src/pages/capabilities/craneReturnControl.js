export const CRANE_RETURN_SIZE = { width: 320, height: 60 };

export const CRANE_RETURN_COPY = {
	ru: "ВЕРНУТЬСЯ\nК ОБЩЕМУ ВИДУ",
	en: "BACK TO\nTHE OVERVIEW",
	zh: "返回\n起重机全景",
};

export function craneReturnLayout(width, height) {
	const dock = width <= 1024;
	const short = height <= 480;
	const buttonWidth = Math.min(CRANE_RETURN_SIZE.width, width - 32);
	const buttonHeight = (short ? 52 : CRANE_RETURN_SIZE.height) * buttonWidth / CRANE_RETURN_SIZE.width;
	return {
		x: dock ? 16 : 152,
		y: short ? 58 : dock ? 76 : 82,
		width: buttonWidth, height: buttonHeight, shortcut: !dock,
	};
}

export function advanceCraneReturnVisibility(progress, shown, delta) {
	const dt = Math.max(0, Math.min(delta, .05));
	return Math.max(0, Math.min(1, progress + dt * (shown ? 1 / .24 : -1 / .18)));
}

/** One small, prepared texture per locale. Hover never repaints these pixels. */
export function paintCraneReturn(ctx, value) {
	const [action, destination] = value.split("\n");
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#e0f2fa";
	ctx.font = '500 15.5px ManifoldExtended, "Segoe UI", sans-serif';
	ctx.fillText(action, 66, 20);
	ctx.fillStyle = "#b6d6e5";
	ctx.font = '500 14.5px ManifoldExtended, "Segoe UI", sans-serif';
	ctx.fillText(destination, 66, 41);
	// An actual back arrow, independent of font fallback or icon fonts.
	ctx.strokeStyle = "#cff3ff"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
	ctx.beginPath(); ctx.moveTo(39, 30); ctx.lineTo(19, 30); ctx.moveTo(27, 22); ctx.lineTo(19, 30); ctx.lineTo(27, 38); ctx.stroke();
	ctx.strokeStyle = "#466574"; ctx.lineWidth = 1;
	ctx.strokeRect(282.5, 10.5, 25, 16);
	ctx.fillStyle = "#a0bac7"; ctx.font = '400 10px MazzardM, "Segoe UI", sans-serif';
	ctx.fillText("ESC", 286, 19);
}

export const CRANE_RETURN_FRAGMENT = /* glsl */ `
	uniform sampler2D map;
	uniform float opacity,uHover,uShortcut;
	uniform vec4 clip;
	varying vec2 vUv,pixel;
	void main(){
		if(opacity<=0.0||pixel.x<clip.x||pixel.y<clip.y||pixel.x>clip.z||pixel.y>clip.w)discard;
		vec2 p=vec2(vUv.x,1.0-vUv.y)*vec2(320.0,60.0);
		vec2 q=abs(p-vec2(160.0,30.0))-vec2(155.0,25.0);
		float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-4.0;
		float shape=1.0-smoothstep(-0.4,0.7,d);
		float edge=1.0-smoothstep(0.3,1.1,abs(d+1.0));
		float arrowArea=1.0-smoothstep(51.0,52.0,p.x);
		vec3 base=mix(vec3(0.012,0.032,0.043),vec3(0.035,0.18,0.24),arrowArea*(0.85+uHover*0.15));
		base=mix(base,vec3(0.30,0.61,0.74),edge*(0.6+uHover*0.4));
		float accent=(1.0-smoothstep(3.0,4.0,p.x))*smoothstep(5.0,9.0,p.y)*(1.0-smoothstep(51.0,55.0,p.y));
		base=mix(base,vec3(0.48,0.81,0.93),accent);
		vec4 ink=texture2D(map,vUv);
		if(p.x>278.0&&p.y<29.0)ink.a*=uShortcut;
		float backing=shape*0.98;
		float alpha=ink.a+backing*(1.0-ink.a);
		if(alpha<0.002)discard;
		gl_FragColor=vec4((ink.rgb*ink.a+base*backing*(1.0-ink.a))/alpha,alpha*opacity);
	}
`;

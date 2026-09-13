export const CRANE_RETURN_SIZE = { width: 320, height: 44 };

export const CRANE_RETURN_COPY = {
	ru: "К ОБЩЕМУ ВИДУ",
	en: "BACK TO OVERVIEW",
	zh: "返回起重机全景",
};

export function craneReturnLayout(width, height, detail) {
	const x = detail.x + 16 * detail.scale;
	return {
		x, y: height - detail.y + 12,
		width: Math.min(CRANE_RETURN_SIZE.width, width - x - 16),
		height: CRANE_RETURN_SIZE.height, shortcut: width > 1024,
	};
}

export function advanceCraneReturnVisibility(progress, shown, delta) {
	const dt = Math.max(0, Math.min(delta, .05));
	return Math.max(0, Math.min(1, progress + dt * (shown ? 1 / .24 : -1 / .18)));
}

/** One small, prepared texture per locale. Hover never repaints these pixels. */
export function paintCraneReturn(ctx, value) {
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#bed6e1";
	ctx.font = '500 14px ManifoldExtended, "Segoe UI", sans-serif';
	let x = 51;
	for (const char of value) {
		if (char === " ") { x += 8; continue; }
		ctx.fillText(char, x, 22);
		x += ctx.measureText(char).width + 0.35;
	}
	// An actual back arrow, independent of font fallback or icon fonts.
	ctx.strokeStyle = "#aacad9"; ctx.lineWidth = 1;
	ctx.strokeRect(0.5, 5.5, 33, 33);
	ctx.strokeStyle = "#d3eaf3"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
	ctx.beginPath(); ctx.moveTo(24, 22); ctx.lineTo(10, 22); ctx.moveTo(16, 16); ctx.lineTo(10, 22); ctx.lineTo(16, 28); ctx.stroke();
	ctx.strokeStyle = "#466574"; ctx.lineWidth = 1;
	ctx.strokeRect(282.5, 14.5, 25, 15);
	ctx.fillStyle = "#91aab6"; ctx.font = '400 10px MazzardM, "Segoe UI", sans-serif';
	ctx.fillText("ESC", 286, 22);
}

export const CRANE_RETURN_FRAGMENT = /* glsl */ `
	uniform sampler2D map;
	uniform float opacity,uHover,uShortcut;
	uniform vec4 clip;
	varying vec2 vUv,pixel;
	void main(){
		if(opacity<=0.0||pixel.x<clip.x||pixel.y<clip.y||pixel.x>clip.z||pixel.y>clip.w)discard;
		vec2 p=vec2(vUv.x,1.0-vUv.y)*vec2(320.0,44.0);
		float tile=step(1.0,p.x)*step(p.x,33.0)*step(6.0,p.y)*step(p.y,38.0);
		float backing=tile*(0.12+uHover*0.14);
		vec3 base=vec3(0.14,0.39,0.49);
		vec4 ink=texture2D(map,vUv);
		if(p.x>278.0)ink.a*=uShortcut;
		ink.rgb=mix(ink.rgb,vec3(0.78,0.94,1.0),uHover*0.45);
		float alpha=ink.a+backing*(1.0-ink.a);
		if(alpha<0.002)discard;
		gl_FragColor=vec4((ink.rgb*ink.a+base*backing*(1.0-ink.a))/alpha,alpha*opacity);
	}
`;

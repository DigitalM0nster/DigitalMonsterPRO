// Shared with the approved Synthetic Core HUD. Animation never repaints the atlases.
export const HUD_MARKER_GLSL = /* glsl */ `
	const float TAU=6.28318530718;
	float stroke(float d,float w){
		float aa=max(fwidth(d)*0.55,0.3);
		return 1.0-smoothstep(w-aa,w+aa,abs(d));
	}
	float hudMarkerInk(vec2 p,float time,float hover,float probe,float thickness){
		float r=length(p),phase=fract(atan(p.x,p.y)/TAU-time*0.10+1.0);
		float radius=19.0+hover*1.2;
		float inner=stroke(r-radius,0.65*thickness)*(0.55+hover*0.3);
		float reveal=1.0-smoothstep(0.20+hover*0.78,0.22+hover*0.78,phase);
		float outer=stroke(r-(25.0+hover*1.5),mix(1.0,0.45,phase)*thickness)*reveal;
		float glow=exp(-abs(r-radius)*0.65)*(0.025+hover*0.10+probe*0.04);
		return max(max(inner,outer),glow);
	}
	vec3 hudMarkerTint(float hover,float probe){
		return mix(vec3(0.68,0.84,0.91),vec3(0.38,0.88,1.0),max(hover,probe));
	}
`;

export const hudSnakeGlsl = (stateCount, baselines = [96, 69, 36], { width = 300, height = 200 } = {}) => /* glsl */ `	vec4 label(vec2 uv,float state){return texture2D(uLabels,vec2((uLocale+uv.x)/3.0,(${stateCount - 1}.0-state+uv.y)/${stateCount}.0));}
	float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
	vec4 snakeLabel(vec2 uv,float state){
		// The idle path is one clean atlas sample. No order or symbol sampling at rest.
		if(uSnake>=1.0)return label(uv,state);
		if(uSnake<=0.0)return vec4(0.0);
		vec2 px=uv*vec2(${width.toFixed(1)},${height.toFixed(1)});
		float row=${baselines.slice(0, -1).map((baseline, i) => `px.y>${Math.floor((baseline + baselines[i + 1]) / 2).toFixed(1)}?${i}.0:`).join("")}${baselines.length - 1}.0;
		vec4 letter=texture2D(uLetterOrder,vec2((uLocale*${width.toFixed(1)}+floor(px.x)+0.5)/${(width * 3).toFixed(1)},(state*${baselines.length}.0+row+0.5)/${stateCount * baselines.length}.0));
		if(letter.a<0.5)return vec4(0.0);
		float phase=clamp((uSnake-(0.01+letter.r*0.80))/0.19,0.0,1.0);
		if(phase<=0.0)return vec4(0.0);
		if(phase>=1.0)return label(uv,state);
		float head=smoothstep(0.02,0.10,phase)*(1.0-smoothstep(0.76,0.96,phase));
		float settled=smoothstep(0.78,1.0,phase);
		float frame=floor(clamp((phase-0.08)/0.72,0.0,0.999)*3.0);
		float symbol=floor(hash21(vec2(letter.r*255.0+state*7.0,frame))*uGlyphCount);
		float baseline=${baselines.slice(0, -1).map((baseline, i) => `row<${(i + 0.5).toFixed(1)}?${baseline.toFixed(1)}:`).join("")}${baselines.at(-1).toFixed(1)};
		vec2 glyphUv=vec2(letter.g,(px.y-baseline)/max(1.0,letter.b*510.0)+0.5);
		// A tiny deterministic scanline slip only at the moving head; no RGB fringing.
		float band=floor(glyphUv.y*7.0);
		glyphUv.x+=(hash21(vec2(band+letter.r*255.0,frame))-0.5)*0.16*head;
		float inside=step(0.0,glyphUv.x)*step(glyphUv.x,1.0)*step(0.0,glyphUv.y)*step(glyphUv.y,1.0);
		float scrambled=texture2D(uGlyphs,vec2((symbol+clamp(glyphUv.x,0.001,0.999))/uGlyphCount,clamp(glyphUv.y,0.001,0.999))).a*head*inside;
		vec4 clean=label(uv,state);
		float cleanAlpha=clean.a*settled;
		float alpha=max(scrambled,cleanAlpha);
		vec3 cyan=mix(vec3(0.10,0.76,1.0),vec3(0.72,0.96,1.0),smoothstep(0.5,0.85,phase));
		return vec4(mix(cyan,clean.rgb,cleanAlpha/max(alpha,0.001)),alpha);
	}
`;

export function advanceHudSnake(progress, requested, delta) {
	return Math.max(0, Math.min(1, progress + Math.max(0, delta) * (requested ? 1 / 1.15 : -1 / 0.48)));
}

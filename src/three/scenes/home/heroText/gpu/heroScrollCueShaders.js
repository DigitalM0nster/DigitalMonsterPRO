export const heroScrollCueVertex = /* glsl */ `
uniform vec2 uResolution,uCueOrigin;
varying vec2 vPx;
void main(){
	vPx=vec2(position.x,1.0-position.y)*vec2(172.0,158.0);
	vec2 pixel=uCueOrigin+vPx;
	gl_Position=vec4(pixel.x/uResolution.x*2.0-1.0,1.0-pixel.y/uResolution.y*2.0,1.0,1.0);
}
`;

export const heroScrollCueFragment = /* glsl */ `
uniform float uCueTime,uBloomBoost,uTrackAlpha,uOpacity;
uniform float uLocalGlow;
uniform float uGlowStrength,uGlowWidth;
uniform vec3 uCueMain,uCueBright;
uniform float uRevealProgress,uRevealLinear,uRevealGlitchProgress,uRevealGlitchTime,uRevealGlitchIntensity;
varying vec2 vPx;
float stroke(float distance,float width){
	float aa=max(fwidth(distance),0.5);
	return 1.0-smoothstep(width*0.5-aa*0.5,width*0.5+aa*0.5,abs(distance));
}
float segment(vec2 p,vec2 a,vec2 b){vec2 q=p-a,d=b-a;return length(q-d*clamp(dot(q,d)/dot(d,d),0.0,1.0));}
vec4 over(vec4 front,vec4 back){float alpha=front.a+back.a*(1.0-front.a);return vec4((front.rgb*front.a+back.rgb*back.a*(1.0-front.a))/max(alpha,0.00001),alpha);}
void main(){
	vec2 uv=vec2(vPx.x/394.0,1.0-vPx.y/158.0);
	if(uLocalGlow<0.5 && uv.x>=0.252 && uv.y>=0.62)discard;
	vec2 cell=floor(uv*vec2(28.0,16.0));
	float noise=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
	float reveal=smoothstep(noise-0.16,noise+0.10,uRevealLinear)*uRevealProgress;
	float slice=floor(uv.y*40.0);
	float slip=fract(sin(slice*91.73+uRevealGlitchTime*37.0)*43758.5453)-0.5;
	vec2 p=vPx+vec2(slip*uRevealGlitchIntensity*3.0*uRevealGlitchProgress*394.0,0.0);
	vec2 q=abs(p-vec2(86.0,19.5))-vec2(0.0,5.0);
	float mouse=length(max(q,0.0))+min(max(q.x,q.y),0.0)-8.5;
	vec3 strokeColor=uCueBright;
	vec4 color=vec4(strokeColor,stroke(mouse,1.15)*0.92);
	float wheel=(0.5-0.5*cos(uCueTime/1.35*6.28318530718))*2.2;
	color=over(vec4(strokeColor,stroke(segment(p,vec2(86.0,14.0+wheel),vec2(86.0,19.5+wheel)),1.2)*0.88),color);
	color=over(vec4(uCueMain,stroke(segment(p,vec2(86.0,48.0),vec2(86.0,142.0)),0.3)*uTrackAlpha),color);
	if(p.y>=48.0 && p.y<=142.0){
		float tip=40.0+fract(uCueTime/2.05)*202.0;
		float t=clamp((p.y-(tip-100.0))/100.0,0.0,1.0);
		float veil=t<0.35?0.0:t<0.62?mix(0.0,0.05,(t-0.35)/0.27):t<0.85?mix(0.05,0.14,(t-0.62)/0.23):mix(0.14,0.22,(t-0.85)/0.15);
		float core=t<0.45?0.0:t<0.70?mix(0.0,0.08,(t-0.45)/0.25):t<0.88?mix(0.08,0.42,(t-0.70)/0.18):mix(0.42,0.95,(t-0.88)/0.12);
		float d=segment(p,vec2(86.0,tip-100.0),vec2(86.0,tip));
		color=over(vec4(mix(uCueMain,uCueBright,smoothstep(0.85,1.0,t)),stroke(d,1.55)*veil*0.95),color);
		color=over(vec4(mix(uCueMain,uCueBright,smoothstep(0.70,0.88,t)),stroke(d,0.85)*core*0.95),color);
	}
	if(uLocalGlow>0.5){
		float d=abs(mouse);
		float width=max(uGlowWidth,0.25);
		float halo=min(0.95,uGlowStrength*(0.8*exp2(-d*2.0/width)+0.2*exp2(-d/width)));
		color=over(color,vec4(uCueMain,halo));
	}
	float lift=mix(1.0,uBloomBoost,smoothstep(0.08,0.55,color.a));
	gl_FragColor=vec4(color.rgb*lift,color.a*uOpacity*reveal);
	// The site compositor copies scene RGB without an output conversion. Encode
	// this bounded Medium UI color once on both paths, including the hex RT.
	if(uLocalGlow>0.5){
		gl_FragColor=LinearTosRGB(gl_FragColor);
	}
}
`;

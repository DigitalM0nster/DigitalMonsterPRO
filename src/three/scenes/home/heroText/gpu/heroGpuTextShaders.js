import { heroPageRevealFunctionsGlsl, heroPageRevealUniformsGlsl } from "@/three/shaders/heroText/heroPageReveal.glsl.js";

export const heroGpuTextVertex = /* glsl */ `
uniform vec2 uResolution, uOrigin, uBlockSize, uBlockPad;
uniform float uLocaleFrom, uLocaleTo, uSnakeTime, uDecorationWidth, uPass, uLayoutDpr;
uniform vec4 uSnakeTiming;
uniform float uLineScales[6];
attribute vec4 aRect, aAtlasRect, aLetter;
attribute vec4 aSymbolRect0, aSymbolRect1, aSymbolRect2;
attribute float aSymbols;
varying vec2 vUv, vBlockUv, vGlyphSize;
varying vec4 vAtlasRect;
varying float vAlpha, vSymbol, vDecoration, vLocalX;
#ifdef HERO_STACK_MSDF
attribute vec4 aMsdfPlane, aMsdfAtlas;
varying vec4 vMsdfPlane, vMsdfAtlas;
#endif
void main() {
	#ifdef HERO_STACK_MSDF
	vMsdfPlane=aMsdfPlane; vMsdfAtlas=aMsdfAtlas;
	#endif
	vAlpha=1.0; vDecoration=step(aLetter.x,-0.5); vSymbol=vDecoration;
	float frame=0.0;
	if(vDecoration<0.5){
		if(uSnakeTime<0.0){ vAlpha=1.0-step(0.1,abs(aLetter.x-uLocaleFrom)); }
		else {
			bool incoming=abs(aLetter.x-uLocaleTo)<0.1;
			bool outgoing=abs(aLetter.x-uLocaleFrom)<0.1;
			float scale=uLineScales[int(aLetter.y)];
			float clock=uSnakeTime-(incoming?uSnakeTiming.w:0.0);
			float delay=floor((aLetter.z*aSymbols*uSnakeTiming.y+aLetter.w*uSnakeTiming.x)*scale+0.5);
			float duration=floor(aSymbols*uSnakeTiming.y*scale+0.5);
			float local=clock-delay;
			vAlpha=0.0;
			if(incoming||outgoing){
				if(local<0.0){vAlpha=incoming?0.0:1.0;}
				else if(local<duration){
					frame=1.0+min(aSymbols-1.0,floor(local/max(1.0,floor(uSnakeTiming.y*scale+0.5))));
					vAlpha=1.0; vSymbol=1.0;
				}else{vAlpha=incoming?clamp((local-duration)/max(1.0,uSnakeTiming.z*scale),0.0,1.0):0.0;}
			}
		}
	}
	vec2 size=aRect.zw;
	if(vDecoration>0.5)size.x=uDecorationWidth;
	vec2 local=aRect.xy+vec2(uv.x,1.0-uv.y)*size;
	vLocalX=local.x;
	vUv=uv; vGlyphSize=size;
	vBlockUv=vec2((local.x+uBlockPad.x)/uBlockSize.x,1.0-(local.y+uBlockPad.y)/uBlockSize.y);
	vAtlasRect=frame<0.5?aAtlasRect:(frame<1.5?aSymbolRect0:(frame<2.5?aSymbolRect1:aSymbolRect2));
	if((uPass>1.5 && vSymbol<0.5)||(uPass>0.5 && uPass<1.5 && vSymbol>0.5))vAlpha=0.0;
	vec2 origin=uOrigin+aRect.xy;
	if(vDecoration<0.5)origin=floor(origin*uLayoutDpr+0.5)/uLayoutDpr;
	vec2 px=origin+vec2(uv.x,1.0-uv.y)*size;
	gl_Position=vAlpha>0.0?vec4(px.x/uResolution.x*2.0-1.0,1.0-px.y/uResolution.y*2.0,1.0,1.0):vec4(2.0,2.0,2.0,1.0);
}
`;

export const heroGpuTextFragment = /* glsl */ `
uniform sampler2D uTexture;
#ifdef HERO_STACK_MSDF
uniform sampler2D uMsdfTexture;
uniform vec2 uMsdfUnitRange;
uniform float uMsdfEnabled, uMsdfWeight;
varying vec4 vMsdfPlane, vMsdfAtlas;
#endif
uniform float uPass, uOpacity, uSubtitleBrightness, uSubtitleAlpha, uSubtitleGamma;
uniform float uReplacementBloomBoost;
uniform float uGlyphSharpness;
uniform float uGlyphBrightness, uGlyphDensity;
uniform vec3 uGlyphInk;
uniform vec2 uAtlasSize;
uniform float uClipMinX, uDecorationThickness, uResolutionDpr;
uniform vec3 uSubtitleTint, uReplacementBloomTint;
uniform vec2 uBlockSize;
${heroPageRevealUniformsGlsl}
varying vec2 vUv, vBlockUv, vGlyphSize;
varying vec4 vAtlasRect;
varying float vAlpha, vSymbol, vDecoration, vLocalX;
${heroPageRevealFunctionsGlsl}
void main(){
	if(vLocalX<uClipMinX || vAlpha<=0.0 || (uPass>1.5 && vSymbol<0.5) || (uPass>0.5 && uPass<1.5 && vSymbol>0.5))discard;
	vec2 displaced=vBlockUv;
	#ifdef HERO_SCROLL_LABEL
	vec2 cell=floor(displaced*vec2(28.0,16.0));
	float noise=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
	float reveal=smoothstep(noise-0.16,noise+0.10,uRevealLinear)*uRevealProgress;
	float slice=floor(displaced.y*40.0);
	float slip=fract(sin(slice*91.73+uRevealGlitchTime*37.0)*43758.5453)-0.5;
	displaced.x+=slip*uRevealGlitchIntensity*3.0*uRevealGlitchProgress;
	#else
	float reveal=heroPageApplyReveal(displaced);
	#endif
	if(reveal<=0.0)discard;
	vec2 uv=vUv+(displaced-vBlockUv)*uBlockSize/vGlyphSize;
	if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard;
	vec2 atlasUv=vAtlasRect.xy+uv*vAtlasRect.zw;
	vec4 color=vDecoration>0.5?vec4(0.0595,0.6867,1.0,0.38):texture2D(uTexture,atlasUv);
	bool cleanMediumGlyph=uGlyphSharpness>=0.0 && vSymbol<0.5 && vDecoration<0.5;
	bool distanceGlyph=false;
	#ifdef HERO_STACK_MSDF
	distanceGlyph=cleanMediumGlyph && uMsdfEnabled>0.5 && vMsdfPlane.z>0.0;
	if(distanceGlyph){
		vec2 glyphUv=(uv-vMsdfPlane.xy)/vMsdfPlane.zw;
		vec2 sampleUv=vMsdfAtlas.xy+glyphUv*vMsdfAtlas.zw;
		vec3 field=texture2D(uMsdfTexture,sampleUv).rgb;
		float median=max(min(field.r,field.g),min(max(field.r,field.g),field.b));
		float screenRange=max(0.5*dot(uMsdfUnitRange,1.0/max(fwidth(sampleUv),vec2(0.000001))),1.0);
		float coverage=clamp((median-0.5)*screenRange+0.5+uMsdfWeight*uResolutionDpr,0.0,1.0);
		if(any(lessThan(glyphUv,vec2(0.0)))||any(greaterThan(glyphUv,vec2(1.0))))coverage=0.0;
		color=vec4(uGlyphInk,coverage);
	}
	#endif
	if(cleanMediumGlyph){
		if(!distanceGlyph){
			float coverage=pow(color.a,1.0/uGlyphDensity);
		// Tighten only the antialiased boundary. Unlike an alpha gain, this
		// removes weak fringe pixels while keeping the stroke interior solid.
			color.a=mix(coverage,smoothstep(0.15,0.85,coverage),uGlyphSharpness);
		}
		color.rgb=uGlyphInk;
	}
	if(vDecoration>0.5){
		float distance=abs((uv.y-0.5)*vGlyphSize.y);
		float aa=1.0/uResolutionDpr;
		color.a*=1.0-smoothstep(uDecorationThickness*0.5-aa*0.5,uDecorationThickness*0.5+aa*0.5,distance);
	}
	float alpha=color.a*reveal*vAlpha*uOpacity*uSubtitleAlpha;
	vec3 rgb=pow(color.rgb*uSubtitleTint*uSubtitleBrightness,vec3(1.0/uSubtitleGamma));
	// Clean Medium labels are display-white. A 1.05 fill must not start blooming
	// when the same prepared glyph moves from the screen into a hex layer.
	if(cleanMediumGlyph)rgb=min(rgb,vec3(1.0))*uGlyphBrightness;
	float mask=smoothstep(0.04,0.18,color.a)*(1.0-smoothstep(0.05,0.38,color.r))*smoothstep(0.12,0.42,color.g)*smoothstep(0.35,0.75,color.b)*vSymbol;
	rgb=mix(rgb,uReplacementBloomTint*uReplacementBloomBoost,mask);
	alpha=max(alpha,mask*color.a*reveal*vAlpha*uOpacity);
	if(alpha<0.02)discard;
	gl_FragColor=vec4(rgb,alpha);
	#ifndef HERO_SCROLL_LABEL
	// Match the existing scene output while keeping clean glyphs outside bloom.
	if(uGlyphSharpness<0.0 && uPass>0.5 && uPass<1.5)gl_FragColor=linearToOutputTexel(gl_FragColor);
	#endif
}
`;

import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

// Rectangles are expressed in the screen's own, unbent coordinates.
// Use the video surface itself, not an independently fitted caption arc.
export const filmHudVertex = `
uniform vec4 uRect;
varying vec2 vUv;
#ifdef FILM_MSDF
attribute vec4 aGlyphRect,aGlyphUv;
#endif
#ifdef FILM_RULE_GLOW
uniform float uVertical;
#endif
${filmSurfaceGLSL}
void main(){
 vec2 local=position.xy;
 vUv=uv;
 #ifdef FILM_MSDF
 local=aGlyphRect.xy+uv*aGlyphRect.zw-.5;
 vUv=aGlyphUv.xy+uv*aGlyphUv.zw;
 #endif
 #if defined(FILM_LOW) && defined(FILM_RULE_GLOW)
 // Give the rule's local halo space without changing its luminous core width.
 local*=mix(vec2(1.,6.),vec2(6.,1.),uVertical);
 #elif defined(FILM_RULE_GLOW)
 local*=mix(vec2(1.,2.),vec2(2.,1.),uVertical);
 #endif
 vec3 p=filmSurface(vec3(uRect.xy+local*uRect.zw,.018));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;

export const filmHudTextFragment = `
uniform sampler2D uMap;uniform float uOpacity;uniform float uGain;
uniform vec3 uInk;uniform vec2 uMsdfRange;
varying vec2 vUv;
void main(){
 vec4 ink=texture2D(uMap,vUv);
 #ifdef FILM_MSDF
 float median=max(min(ink.r,ink.g),min(max(ink.r,ink.g),ink.b));
 float range=max(.5*dot(uMsdfRange,1./max(fwidth(vUv),vec2(.000001))),1.);
 // Match the original .65px outline on a 64px source font, without bitmap resampling.
 float smallTypeWeight=.10*clamp(2.-range,0.,1.);
 ink=vec4(uInk,clamp((median-.5+.040625)*range+.5+smallTypeWeight,0.,1.));
 #endif
 float gain=uGain;
 #ifdef FILM_MEDIUM
 // Quiet labels stay below bloom; names retain a small, controlled luminous core.
 gain=uGain>1.2?1.07:.98;
 ink.rgb=uInk;
 #endif
 gl_FragColor=vec4(ink.rgb*gain,ink.a*uOpacity);
 #include <colorspace_fragment>
}`;

export const filmHudRuleFragment = `
${filmPaletteGLSL}
uniform float uOpacity;uniform float uVertical;
uniform vec3 uColor;
varying vec2 vUv;
void main(){
 float d=abs(mix(vUv.y,vUv.x,uVertical)-.5);
 float core=1.-smoothstep(.08,.24,d);
 float coreGain=1.8;
 float halo=exp(-d*12.)*.18;
 float haloGain=.4;
 #ifdef FILM_MEDIUM
 // Differentiate the signed coordinate: abs() can cancel derivatives across the line.
 float aa=max(fwidth(mix(vUv.y,vUv.x,uVertical)),.0001);
 #ifdef FILM_RULE_GLOW
 // Wider existing quad makes room for a soft halo without thickening the core.
 d*=2.;aa*=2.;
 #endif
 core=clamp((.16-d)/aa+.5,0.,1.);
 coreGain=1.8;
 halo=exp(-d*3.5)*.28*(1.-smoothstep(.8,1.,d));
 haloGain=2.;
 #endif
 float a=max(core,halo);
 vec3 tint=uColor;
 #ifdef FILM_MEDIUM
 // Local halo keeps hairlines continuous; a quarter-resolution bloom would turn
 // their subpixel coverage into bright dots. Preserve hue while staying below it.
 float peakLuminance=dot(tint,vec3(.2126,.7152,.0722))*filmUiGain*(coreGain+.28*haloGain);
 tint*=min(1.,.94/max(peakLuminance,.0001));
 #endif
 vec3 light=tint*filmUiGain*(coreGain*core+haloGain*halo);
 #ifdef FILM_LOW
 float aa=max(fwidth(mix(vUv.y,vUv.x,uVertical))*6.,.0001);
 d*=6.;
 core=clamp((.24-d)/aa+.5,0.,1.);
 halo=exp(-d*2.)*.45*(1.-smoothstep(2.5,3.,d));
 gl_FragColor=uColor.r>.9?filmLowWhite(core*.9,core,uOpacity):filmLowLight(core*2.+halo,core,uOpacity);
 #else
 gl_FragColor=vec4(light/max(a,.0001),a*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

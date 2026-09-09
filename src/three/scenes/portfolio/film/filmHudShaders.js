import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

// Rectangles are expressed in the screen's own, unbent coordinates.
// Use the video surface itself, not an independently fitted caption arc.
export const filmHudVertex = `
uniform vec4 uRect;
varying vec2 vUv;
${filmSurfaceGLSL}
void main(){
 vUv=uv;
 vec3 p=filmSurface(vec3(uRect.xy+position.xy*uRect.zw,.018));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;

export const filmHudTextFragment = `
uniform sampler2D uMap;uniform float uOpacity;uniform float uGain;
varying vec2 vUv;
void main(){
 vec4 ink=texture2D(uMap,vUv);
 gl_FragColor=vec4(ink.rgb*uGain,ink.a*uOpacity);
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
 float halo=exp(-d*12.)*.18;
 float a=max(core,halo);
 vec3 light=uColor*filmUiGain*(1.8*core+.4*halo);
 gl_FragColor=vec4(light/max(a,.0001),a*uOpacity);
 #include <colorspace_fragment>
}`;

export const filmHudNavigatorFragment = `
${filmPaletteGLSL}
uniform float uOpacity;uniform float uActive;uniform float uCount;uniform float uHover;uniform float uHoverOpacity;
varying vec2 vUv;
void main(){
 vec2 p=vec2(vUv.x*uCount,vUv.y);
 float dx=p.x-(uActive+.5);
 float endFade=smoothstep(0.,.16,p.x)*(1.-smoothstep(uCount-.16,uCount,p.x));
 float line=1.-smoothstep(.007,.024,abs(p.y-.17));
 float rail=line*.22*endFade;
 float cell=abs(fract(p.x+.5)-.5);
 float ticks=(1.-smoothstep(.006,.022,cell))*(1.-smoothstep(.018,.06,abs(p.y-.17)))*.27;
 float selected=line*(1.-smoothstep(.25,.35,abs(dx)));
 float glow=exp(-dx*dx*13.-(p.y-.17)*(p.y-.17)*160.)*.16;
 float field=(1.-smoothstep(.28,.47,abs(dx)))*(1.-smoothstep(.0,.65,p.y))*.055;
 float hover=line*(1.-smoothstep(.25,.35,abs(p.x-(uHover+.5))))*uHoverOpacity*.45;
 float a=max(field,max(rail,max(ticks,max(selected,max(glow,hover)))));
 vec3 light=filmAccent*filmUiGain*(field*.07+rail*.55+ticks*.4+selected*1.8+glow*.6+hover*.9);
 gl_FragColor=vec4(light/max(a,.0001),a*uOpacity);
 #include <colorspace_fragment>
}`;

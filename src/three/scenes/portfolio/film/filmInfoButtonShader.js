import { filmPaletteGLSL } from "./filmPalette.js";

// A prepared optical mark on the same cylindrical surface as the caption.
// Hover changes only the open arc and a subpixel arrow travel.
export const filmInfoButtonFragment = `
${filmPaletteGLSL}
uniform float uOpacity,uHover,uReturn;
varying vec2 vUv;
float segment(vec2 p,vec2 a,vec2 b){
 vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));
}
void main(){
 vec2 p=(vUv-.5)*2.;
 float aa=max(fwidth(p.x),.015),angle=atan(p.y,p.x);
 float opening=mix(.74,.24,uHover);
 float arc=1.-smoothstep(opening-aa,opening+aa,abs(angle-.28));
 float ring=(1.-smoothstep(.026,.026+aa,abs(length(p)-.76)))*(1.-arc);
 vec2 q=(p-vec2(.035*uHover))*(1.-2.*uReturn);
 float arrow=min(segment(q,vec2(-.23),vec2(.23)),min(segment(q,vec2(-.10,.23),vec2(.23)),segment(q,vec2(.23,-.10),vec2(.23))));
 float ink=1.-smoothstep(.032,.032+aa,arrow);
 float halo=exp(-abs(length(p)-.76)*36.)*.08;
 float alpha=max(ink,max(ring*.8,halo))*uOpacity;
 gl_FragColor=vec4(mix(vec3(0.,.45,1.)*(1.+uHover*.25),vec3(.88,.97,1.),ink),alpha);
 #include <colorspace_fragment>
}`;

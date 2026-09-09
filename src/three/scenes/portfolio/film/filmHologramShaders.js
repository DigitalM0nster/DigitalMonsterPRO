import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

const signalNoise = `
float filmHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
`;

export const hologramVertex = `
uniform float uProgress;uniform float uDirection;uniform float uReduced;uniform float uTime;
attribute vec4 aRect;attribute float aSeed;
varying vec2 vUv;varying vec2 vBlockUv;varying float vPhase;varying float vBurst;varying float vSeed;varying float vIdle;
${signalNoise}
${filmSurfaceGLSL}
void main(){
 vUv=aRect.xy+uv*aRect.zw;vBlockUv=uv;vSeed=aSeed;
 float seed2=filmHash(vec2(aSeed,21.7));
 float phase=clamp((uProgress-(.015+aSeed*.70))/(.16+seed2*.12),0.,1.);
 vPhase=mix(phase,uProgress,uReduced);
 vBurst=smoothstep(0.,.18,phase)*(1.-smoothstep(.74,1.,phase))*(1.-uReduced);
 // Progress owns every break and re-lock: cancelling a scroll retraces the same glitch.
 float relock=smoothstep(.27,.36,phase)-smoothstep(.60,.68,phase);
 float kick=(aSeed-.5)*(.014+seed2*.026)*vBurst;
 kick*=1.-1.65*relock;
 float cycle=fract(uTime*.14+aSeed*11.);
 vIdle=smoothstep(.92,.95,cycle)*(1.-smoothstep(.965,1.,cycle));
 vIdle*=step(.82,seed2)*(1.-uReduced)*(1.-vBurst);
 vec3 pos=vec3(vUv-vec2(.5),0.);
 pos.x+=kick*uDirection+(seed2-.5)*.0018*vIdle;
 pos.y=(pos.y+(seed2-.5)*.006*vBurst*(1.-relock))/2.05;
 pos=filmSurface(pos);
 pos.z+=(.002+seed2*.007)*vBurst;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
}`;

export const hologramFragment = `
${filmPaletteGLSL}
uniform sampler2D uFrom;uniform sampler2D uTo;
uniform float uFromAspect;uniform float uToAspect;
uniform float uOpacity;uniform float uProgress;uniform float uReduced;uniform float uTime;uniform float uLow;
varying vec2 vUv;varying vec2 vBlockUv;varying float vPhase;varying float vBurst;varying float vSeed;varying float vIdle;
${signalNoise}
vec3 picture(sampler2D tex,float aspect,vec2 offset){
 vec2 uv=(vUv+offset-.5)*vec2(min(1.,2.05/aspect),min(1.,aspect/2.05))+.5;
 return texture2D(tex,uv).rgb;
}
void main(){
 float pixels=filmHash(floor(vUv*vec2(768.,374.)));
 float blend=smoothstep(.40,.59,vPhase+(pixels-.5)*.19*(1.-uReduced));
 float tear=(filmHash(vec2(floor(vUv.y*310.),vSeed))-.5)*vBurst;
 vec2 offset=vec2(tear*.006+vIdle*.001,0.);
 vec3 rgb;
 if(uProgress<=.00001||blend<=.0001)rgb=picture(uFrom,uFromAspect,offset);
 else if(uProgress>=.99999||blend>=.9999)rgb=picture(uTo,uToAspect,-offset);
 else rgb=mix(picture(uFrom,uFromAspect,offset),picture(uTo,uToAspect,-offset),blend);
 // A displaced spectral echo outlines content inside the light sheet, not a blurred perimeter.
 vec3 echo=vec3(0.);
 if(uLow<.5){
  vec2 shift=vec2(.0012+vBurst*.003+vIdle*.0015,.0005);
  vec3 ghost=blend<.5?picture(uFrom,uFromAspect,offset+shift):picture(uTo,uToAspect,-offset+shift);
  echo=abs(ghost-rgb)*(.8+vBurst*.8+vIdle*.45);
 }
 // Resolved light rows alternate with transparent gaps, including on a phone.
 float rows=mix(216.,76.,uLow);
 float resolved=1.-smoothstep(.45,1.15,fwidth(vUv.y)*rows);
 float scan=.5+.5*cos(vUv.y*rows*6.2831853-uTime*.45);
 float lightRow=mix(.68,smoothstep(.16,.80,scan),resolved);
 float luminance=dot(rgb,vec3(.2126,.7152,.0722));
 // Keep the source colour. Holographic light comes from transparency and spectral details.
 rgb=mix(rgb/12.92,pow((rgb+.055)/1.055,vec3(2.4)),step(vec3(.04045),rgb));
 float grain=filmHash(floor(vUv*vec2(1180.,576.)));
 float lightField=.78+.22*grain;
 float signalRow=filmHash(vec2(floor(vUv.y*rows),floor(vUv.x*22.)));
 float brokenRow=1.-vIdle*step(.62,signalRow)*.65;
 float transmission=(.30+.66*sqrt(max(0.,luminance)))*mix(mix(.68,.76,uLow),1.,lightRow)*lightField*brokenRow;
 // Low quality has no scene bloom: retain the apparent light without another render pass.
 rgb*=mix(1.8,2.,uLow);
 // Limit bright output with one neutral gain, preserving RGB ratios instead of clipping channels.
 float peak=max(max(rgb.r,rgb.g),max(rgb.b,.00001));
 rgb*=min(1.,1.05/(peak*max(transmission,.25)));
 rgb+=echo*filmAccent*.38;
 // Sparse bright microstructure reads as light suspended in air, not a printed raster.
 float spark=step(.975,grain)*lightRow*resolved;
 rgb+=filmAccent*.08*spark*(.25+luminance);
 float edge=min(min(vBlockUv.x,1.-vBlockUv.x)/max(fwidth(vBlockUv.x),.00001),min(vBlockUv.y,1.-vBlockUv.y)/max(fwidth(vBlockUv.y),.00001));
 float shardEdge=(1.-smoothstep(.0,.85,edge))*vBurst*step(.55,vSeed);
 rgb+=filmAccent*.36*shardEdge;
 float dropout=smoothstep(.29,.46,vPhase)*(1.-smoothstep(.54,.70,vPhase));
 float signal=1.-dropout*(.22+pixels*.34)*(1.-uReduced);
 signal*=1.-vIdle*.18;
 gl_FragColor=vec4(rgb,uOpacity*transmission*signal);
 #include <colorspace_fragment>
}`;

export const hologramFrameFragment = `
${filmPaletteGLSL}
uniform float uOpacity;uniform float uDpr;uniform float uLow;uniform float uHeaderEnd;
varying vec2 vUv;
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=(vUv-.5)*vec2(1.05,.54);
 float pixel=max(fwidth(p.x),fwidth(p.y))*uDpr;
 vec2 q=abs(p)-vec2(.501,.247);
 float rim=1.-smoothstep(pixel*.20,pixel*.95,abs(max(q.x,q.y)));
 // Deliberate breaks in the side rails; optical corners carry the bright energy.
 float sideGap=step(abs(p.x),.499)+step(.12,abs(p.y));
 rim*=min(1.,sideGap);
 float c=1.;
 c=min(c,segment(p,vec2(-.501,.247),vec2(-.467,.247)));
 c=min(c,segment(p,vec2(-.501,.247),vec2(-.501,.188)));
 c=min(c,segment(p,vec2(.501,.247),vec2(.501,.165)));
 c=min(c,segment(p,vec2(.501,.247),vec2(.469,.247)));
 c=min(c,segment(p,vec2(-.501,-.247),vec2(-.462,-.247)));
 c=min(c,segment(p,vec2(-.501,-.247),vec2(-.501,-.217)));
 c=min(c,segment(p,vec2(.501,-.247),vec2(.421,-.247)));
 c=min(c,segment(p,vec2(.501,-.247),vec2(.501,-.199)));
 float corners=1.-smoothstep(pixel*.25,pixel*1.00,c);
 float r=1.;
 r=min(r,segment(p,vec2(-.505,-.15),vec2(-.505,-.04)));
 r=min(r,segment(p,vec2(-.11,.253),vec2(-.025,.253)));
 r=min(r,segment(p,vec2(.035,.253),vec2(.39,.253)));
 r=min(r,segment(p,vec2(-.37,-.253),vec2(-.17,-.253)));
 float registration=1.-smoothstep(pixel*.12,pixel*.85,r);
 float halo=exp(-c/max(.002,pixel*2.5));
 vec3 rgb=vec3(.44*rim*(1.-corners)+.36*registration)+filmAccent*2.3*corners;
 rgb+=filmAccent*mix(.11,.37,uLow)*halo;
 float a=max(max(rim*.78,corners),max(registration*.72,pow(halo,.35)*.65));
 // Leave a real break in the upper rail for the prepared project serial.
 float serialGap=smoothstep(-.462,-.458,p.x)*(1.-smoothstep(uHeaderEnd,uHeaderEnd+.004,p.x))*step(.23,p.y);
 gl_FragColor=vec4(rgb*filmUiGain/max(a,.00001),a*uOpacity*(1.-serialGap));
 #include <colorspace_fragment>
}`;

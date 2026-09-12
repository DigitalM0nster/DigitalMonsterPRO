import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

const signalNoise = `
float filmHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
`;

export const hologramVertex = `
uniform float uProgress;uniform float uDirection;uniform float uReduced;uniform float uGlitchTime;
attribute vec4 aRect;attribute float aSeed;
varying vec2 vUv;varying vec2 vBlockUv;varying float vPhase;varying float vBurst;varying float vSeed;
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
 float kick=(aSeed-.5)*(.004+seed2*.009)*vBurst;
 kick*=1.-1.65*relock;
 vec3 pos=vec3(vUv-vec2(.5),0.);
 pos.x+=kick*uDirection;
 pos.y=(pos.y+(seed2-.5)*.002*vBurst*(1.-relock))/2.05;
 pos=filmSurface(pos);
 pos.z+=(.001+seed2*.003)*vBurst;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
}`;

export const hologramFragment = `
${filmPaletteGLSL}
uniform sampler2D uFrom;uniform sampler2D uTo;
uniform float uFromAspect;uniform float uToAspect;
uniform float uOpacity;uniform float uProgress;uniform float uReduced;uniform float uTime;uniform float uLow;
uniform float uHolotileSize;uniform float uFocus;
uniform float uHoloscanlines;uniform float uHoloraster;uniform float uHoloecho;uniform float uHolobrightness;uniform float uHoloopacity;
uniform float uHolotint;uniform float uHologlitchTint;
uniform float uGlitchTime;uniform float uHolodensity;uniform float uHologlitch;
varying vec2 vUv;varying vec2 vBlockUv;varying float vPhase;varying float vBurst;varying float vSeed;
${signalNoise}
// Brief scanline tears share one timing/offset, but their slices have unequal
// lengths and open light traces. Return the image mask, trace and signed slip.
vec3 signalSlip(vec2 uv){
 float band=floor(uv.y*64.);
 float seed=filmHash(vec2(band,17.3));
 float clock=uGlitchTime*(1.8+seed*.8)+seed*19.;
 float cycle=fract(clock);
 float eventId=floor(clock);
 float pick=filmHash(vec2(band+eventId*1.71,eventId*3.13));
 float enabled=step(1.-uHolodensity*.24,pick)*(1.-uReduced);
 float envelope=smoothstep(.025,.055,cycle)*(1.-smoothstep(.37,.48,cycle))*enabled;
 // Evaluate derivatives before the spatially varying branch. A zero envelope
 // contributes no slip/contour; skip its shape and tail calculations exactly.
 vec2 pixelWidth=max(fwidth(uv),vec2(.00001));
 if(envelope==0.)return vec3(0.);
 vec2 random=vec2(filmHash(vec2(band,eventId+31.)),filmHash(vec2(band,eventId+67.)));
 float halfHeight=mix(.0018,.0055,random.y)*uHolotileSize;
 float y=uv.y-(band+.25+random.y*.5)/64.;
 float slice=floor((y/halfHeight+1.)*2.);
 float ragged=filmHash(vec2(band+eventId*7.,slice+31.));
 float halfLength=mix(.012,.054,random.y)*mix(.45,1.,ragged)*uHolotileSize;
 float relock=smoothstep(.13,.16,cycle)-smoothstep(.23,.26,cycle);
 float slip=(step(.5,seed)*2.-1.)*(.004+random.y*.009)*(1.-1.6*relock)*uHologlitch;
 float x=uv.x-random.x-(ragged-.5)*.015*uHolotileSize-slip*envelope;
 float span=1.-smoothstep(halfLength-pixelWidth.x,halfLength+pixelWidth.x,abs(x));
 float height=1.-smoothstep(halfHeight-pixelWidth.y*.5,halfHeight+pixelWidth.y*.5,abs(y));
 float fill=span*height*envelope;
 // Emit only along a broken horizontal seam: no vertical sides, closed border,
 // mirrored outline or flat glowing fill that reads as a floating rectangle.
 float taper=smoothstep(0.,.4,max(0.,1.-abs(x)/halfLength));
 float fragments=filmHash(vec2(floor(x*280.),band+eventId*3.));
 float seam=1.-smoothstep(pixelWidth.y*.5,pixelWidth.y*1.5,abs(y+halfHeight*.25));
 float trace=seam*taper*mix(.12,1.,step(.32,fragments))*fill;
 return vec3(fill,trace,slip*fill*mix(.65,1.15,ragged));
}
vec3 picture(sampler2D tex,float aspect,vec2 offset){
 // Fit the complete presentation inside the wider curved screen.
 vec2 uv=(vUv+offset-.5)*vec2(max(1.,2.05/aspect),max(1.,aspect/2.05))+.5;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
 return texture2D(tex,uv).rgb;
}
void main(){
 // The existing expand animation owns clarity too; no alternate material or source reload.
 float clarity=smoothstep(0.,1.,uFocus);
 float scanStrength=uHoloscanlines*mix(1.,.025,clarity);
 float rasterStrength=uHoloraster*mix(1.,.08,clarity);
 vec3 glitch=signalSlip(vUv)*(1.-vBurst)*mix(1.,.25,clarity);
 float idle=glitch.x;
 float pixels=filmHash(floor(vUv*vec2(768.,374.)));
 float blend=smoothstep(.40,.59,vPhase+(pixels-.5)*.19*(1.-uReduced));
 float tear=(filmHash(vec2(floor(vUv.y*310.),vSeed))-.5)*vBurst;
 vec2 offset=vec2(tear*.002+glitch.z,0.);
 vec3 rgb;
 if(uProgress<=.00001||blend<=.0001)rgb=picture(uFrom,uFromAspect,offset);
 else if(uProgress>=.99999||blend>=.9999)rgb=picture(uTo,uToAspect,-offset);
 else rgb=mix(picture(uFrom,uFromAspect,offset),picture(uTo,uToAspect,-offset),blend);
 // A displaced spectral echo outlines content inside the light sheet, not a blurred perimeter.
 vec3 echo=vec3(0.);
 if(uLow<.5&&uHoloecho>.001){
  vec2 shift=vec2(.0012+vBurst*.003-glitch.z*.65,.0005);
  vec3 ghost=blend<.5?picture(uFrom,uFromAspect,offset+shift):picture(uTo,uToAspect,-offset+shift);
  echo=abs(ghost-rgb)*(.8+vBurst*.8+idle*.45)*uHoloecho*mix(1.,.12,clarity);
 }
 // Resolved light rows alternate with transparent gaps, including on a phone.
 float rows=mix(216.,76.,uLow);
 float resolved=1.-smoothstep(.45,1.15,fwidth(vUv.y)*rows);
 float scan=.5+.5*cos(vUv.y*rows*6.2831853-uTime*.45*(1.-uReduced));
 float lightRow=mix(.68,smoothstep(.16,.80,scan),resolved);
 float luminance=dot(rgb,vec3(.2126,.7152,.0722));
 // Keep the source colour. Holographic light comes from transparency and spectral details.
 rgb=mix(rgb/12.92,pow((rgb+.055)/1.055,vec3(2.4)),step(vec3(.04045),rgb));
 float grain=filmHash(floor(vUv*vec2(1180.,576.)));
 float lightField=mix(.89,.78+.22*grain,rasterStrength);
 float transmission=(.30+.66*sqrt(max(0.,luminance)))*mix(1.,mix(mix(.68,.76,uLow),1.,lightRow),scanStrength)*lightField;
 // Low quality has no scene bloom: retain the apparent light without another render pass.
 rgb*=mix(1.8,2.,uLow);
 // Limit bright output with one neutral gain, preserving RGB ratios instead of clipping channels.
 float peak=max(max(rgb.r,rgb.g),max(rgb.b,.00001));
 rgb*=min(1.,1.05/(peak*max(transmission,.25)));
 rgb+=echo*filmAccent*.38;
 // Sparse bright microstructure reads as light suspended in air, not a printed raster.
 float spark=step(.975,grain)*lightRow*resolved;
 rgb+=filmAccent*.08*spark*(.25+luminance)*rasterStrength;
 float edge=vBlockUv.y/max(fwidth(vBlockUv.y),.00001);
 float shardEdge=(1.-smoothstep(.0,.85,edge))*vBurst*step(.55,vSeed)*smoothstep(0.,.3,vBlockUv.x)*(1.-smoothstep(.7,1.,vBlockUv.x));
 float dropout=smoothstep(.29,.46,vPhase)*(1.-smoothstep(.54,.70,vPhase));
 float signal=1.-dropout*(.22+pixels*.34)*(1.-uReduced);
 signal*=1.-idle*.12;
 // Add a thin light film over the original RGB, rather than recolouring/desaturating
 // the footage. It follows the same curved UVs, scanlines and soft interference.
 float interference=.5+.5*sin(vUv.x*9.-vUv.y*15.+uTime*.18);
 vec3 holographicLight=mix(filmAccent,vec3(.035,.68,1.),.24+interference*.26);
 float surfaceLight=uHolotint*(.09+.045*interference)*mix(.78,1.,mix(lightRow,1.,clarity));
 surfaceLight*=1.-.72*smoothstep(.18,.95,luminance);
 float contour=max(glitch.y,shardEdge*.4);
 float glitchLight=uHologlitchTint*(idle*.012+contour*1.35);
 float sourceCoverage=uHoloopacity*transmission*signal;
 // The models RT is alpha-composited again by the site. A dark video cannot own
 // the contour's coverage, otherwise its light disappears during that second blend.
 float lightCoverage=max(uHolotint*.42,sqrt(contour)*uHologlitchTint*.95);
 float coverage=max(sourceCoverage,lightCoverage);
 vec3 emission=holographicLight*(surfaceLight+glitchLight);
 // Cyan edge + subdued inner separation keep a tear readable on white footage too.
 vec3 source=rgb*uHolobrightness*sourceCoverage*(1.-contour*uHologlitchTint*.25);
 gl_FragColor=vec4((source+emission)/max(coverage,.0001),uOpacity*coverage);
 #include <colorspace_fragment>
}`;

export const hologramFrameFragment = `
${filmPaletteGLSL}
uniform float uOpacity;uniform float uDpr;uniform float uLow;uniform float uHeaderEnd;uniform float uHoloframeGlow;
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
 #ifdef FILM_LOW
 float cornerHalo=exp(-c/max(pixel*2.4,.001));
 // Neutral fine rails and registration marks; only optical corners emit blue.
 vec4 white=filmLowWhite(rim*.95*(1.-corners)+registration*.65,max(rim,registration),1.);
 vec4 blue=filmLowLight((corners*1.25+cornerHalo*.65)*uHoloframeGlow,corners,1.);
 float coverage=max(white.a,blue.a);
 gl_FragColor=vec4((white.rgb*white.a+blue.rgb*blue.a)/max(coverage,.0001),coverage*uOpacity*(1.-serialGap));
 #else
 gl_FragColor=vec4(rgb*filmUiGain*uHoloframeGlow/max(a,.00001),a*uOpacity*(1.-serialGap));
 #endif
 #include <colorspace_fragment>
}`;

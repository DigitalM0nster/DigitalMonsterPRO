import { photonicSurfaceShader } from "./lightTrailsPhotonicSurface.js";
export const templeVertexShader = /* glsl */ `
 attribute float aDepth;
 attribute vec3 aStyle;
 attribute float aRim;
 attribute vec3 aMotion;
 uniform float uTime;
 uniform float uTravel;
 uniform float uReveal;
 uniform float uCycle;
 varying vec3 vWorld;
 varying vec3 vNormal;
 varying vec3 vGrain;
 varying vec2 vLocal;
 varying vec3 vStyle;
 varying float vRim;
 varying float vDepth;
 varying float vFade;
 void main() {
  float depth=mod(aDepth-uTravel+uCycle,uCycle);
  mat3 basis=mat3(instanceMatrix);
  vec3 size=vec3(length(basis[0]),length(basis[1]),length(basis[2]));
  float phase=fract(uTime*aMotion.z+aMotion.x);
  float lift=aMotion.y*smoothstep(0.08,0.25,phase)*(1.0-smoothstep(0.48,0.72,phase));
  vec3 p=(instanceMatrix*vec4(position,1.0)).xyz+normalize(basis[2])*lift;
  p.z+=64.0-depth;
  vec3 localNormal=normalize(normal/size);
  vec3 worldNormal=normalize(basis[0])*localNormal.x+normalize(basis[1])*localNormal.y+normalize(basis[2])*localNormal.z;
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  vNormal=normalize(mat3(modelMatrix)*worldNormal);
  vGrain=normalize(mat3(modelMatrix)*normalize(basis[1]));
  vLocal=position.xy;vStyle=aStyle;vRim=aRim;vDepth=depth;
  vFade=smoothstep(0.0,10.0,depth)*(1.0-smoothstep(uCycle-350.0,uCycle-40.0,depth))*uReveal;
  vec4 view=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*view;
  // The corridor has its own depth range; a useful near plane keeps distant inlays stable.
  float near=max(0.5,projectionMatrix[3][2]/(projectionMatrix[2][2]-1.0));
  gl_Position.z=-view.z-2.0*near;
 }
`;
export const templeFragmentShader = /* glsl */ `
 uniform float uTime;
 varying vec3 vWorld;
 varying vec3 vNormal;
 varying vec3 vGrain;
 varying vec2 vLocal;
 varying vec3 vStyle;
 varying float vRim;
 varying float vDepth;
 varying float vFade;
 ${photonicSurfaceShader}
 vec3 fresnelMetal(float cosine,vec3 f0) {
  return f0+(1.0-f0)*pow(1.0-clamp(cosine,0.0,1.0),5.0);
 }
 vec3 metalLight(vec3 n,vec3 view,vec3 light,vec3 radiance,vec3 albedo,float metalness,float roughness) {
  vec3 halfDirection=normalize(view+light);
  float nv=max(dot(n,view),0.001),nl=max(dot(n,light),0.0),nh=max(dot(n,halfDirection),0.0);
  float a=roughness*roughness,a2=a*a;
  float denominator=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/max(3.14159265*denominator*denominator,0.0001);
  float k=(roughness+1.0)*(roughness+1.0)*0.125;
  float visibility=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
  vec3 f=fresnelMetal(max(dot(view,halfDirection),0.0),mix(vec3(0.04),albedo,metalness));
  return ((1.0-f)*(1.0-metalness)*albedo/3.14159265+distribution*visibility*f/max(4.0*nv*nl,0.001))*radiance*nl;
 }
 vec3 metalAmbientRadiance(vec3 ray,float roughness) {
  // Broad illumination only: repeating rib reflections obscured the architecture.
  float ceiling=pow(max(ray.y*0.5+0.5,0.0),1.6);
  float aperture=pow(max(dot(ray,normalize(vec3(-0.22,0.68,0.7))),0.0),mix(32.0,3.0,roughness));
  vec3 ambient=mix(vec3(0.025,0.033,0.041),vec3(0.15,0.18,0.205),ceiling);
  return ambient+vec3(0.42,0.46,0.49)*aperture;
 }
 void main() {
  if(vFade<0.002)discard;
  bool panel=vStyle.x<0.5||vStyle.x>2.5;
  float detail=1.0-smoothstep(110.0,280.0,vDepth);
  float face=1.0-smoothstep(0.12,0.8,vRim);
  vec4 machining=panel?machinedCladding(vLocal,vStyle.y,detail,vStyle.z):vec4(0.0);
  vec3 n=normalize(vNormal),view=normalize(cameraPosition-vWorld);
  if(panel)n=machinedNormal(n,vWorld,machining.x*face);
  float facing=max(0.0,dot(n,view));
  vec3 reflected=reflect(-view,n);
  float exposed=clamp(vRim*.85+machining.z*.5,0.0,1.0);
  vec3 albedo=mix(vec3(0.16,0.181,0.195),vec3(0.245,0.258,0.27),vStyle.y*.65);
  albedo=mix(albedo,vec3(0.48,0.50,0.52),exposed);
  float roughness=mix(0.32+machining.w*.22,0.23,exposed);
  float metalness=mix(0.86,0.98,exposed);
  float grainAngle=abs(dot(reflected,normalize(vGrain)));
  float reflectionRoughness=clamp(roughness+grainAngle*.1,0.18,0.65);
  vec3 f=fresnelMetal(facing,mix(vec3(0.04),albedo,metalness));
  float occlusion=1.0-machining.y*face*.82;
  vec3 color=metalAmbientRadiance(reflected,reflectionRoughness)*f*(1.0-roughness*.3)*occlusion;
  color+=albedo*vec3(0.045,0.053,0.06)*(1.0-metalness*.65)*occlusion;
  color+=metalLight(n,view,normalize(vec3(-0.35,0.75,0.6)),vec3(1.6,1.7,1.8),albedo,metalness,roughness);
  color+=metalLight(n,view,normalize(vec3(0.7,-0.3,0.5)),vec3(0.12,0.28,0.38),albedo,metalness,min(roughness+.15,0.8));
  color*=1.0-machining.y*face*.32;
  // Scene-local exposure: keep the graphite surface readable in the dark corridor.
  color*=3.0;
  if(panel) {
   if(vStyle.z>0.5&&vStyle.z<2.5)color+=photonicSurface(vLocal,vStyle,uTime)*face*.65;
  }
  if(vStyle.x>1.5&&vStyle.x<2.5) {
   float core=1.0-smoothstep(0.14,0.46,abs(vLocal.y));
   color=mix(vec3(0.035,0.45,0.95),vec3(0.28,1.3,1.8),core)*vStyle.z;
  }
  float aerial=1.0-exp(-vDepth*0.002);
  color=mix(color,vec3(0.004,0.017,0.032),aerial*(vStyle.x>1.5&&vStyle.x<2.5?0.45:0.82));
  gl_FragColor=vec4(color,vFade);
 }
`;

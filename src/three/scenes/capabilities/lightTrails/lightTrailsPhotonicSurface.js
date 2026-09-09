/** Recessed optical slots and compact markings on the architectural cladding. */
export const photonicSurfaceShader = /* glsl */ `
 float circuitLine(float d,float width) {
  float pixel=max(fwidth(d),0.00001);
  return (1.0-smoothstep(width,width+pixel,abs(d)))*min(1.0,width*2.0/pixel);
 }
 float cutPanelBox(vec2 p,vec2 size,float corner) {
  vec2 q=abs(p)-size;
  return max(max(q.x,q.y),(q.x+q.y+corner)*0.7071068);
 }
 // Height, recess darkness, exposed metal and finish variation. No texture uploads.
 vec4 machinedCladding(vec2 p,float seed,float detail,float variant) {
  float edgeDistance=0.49-max(abs(p.x),abs(p.y));
  float edgeOcclusion=1.0-smoothstep(0.0,0.024,edgeDistance);
  float height=0.0,shadow=edgeOcclusion*0.22,metal=0.0;
  float finish=0.44+0.12*sin(seed*83.1);
  #if CIRCUIT_FINE_DETAIL == 1
   if(detail>0.001) {
    vec2 q=p; q.x*=seed>0.5?-1.0:1.0;
    // Mostly uninterrupted sheet metal. Service doors and vents have their own lanes.
    if(variant>0.5&&variant<2.5) {
     float door=cutPanelBox(q-vec2(-0.035,0.025),vec2(0.34,0.365),0.014);
     float seam=circuitLine(door,0.002);
     height-=seam*0.022*detail;shadow+=seam*0.75*detail;
     metal+=circuitLine(door-0.004,0.001)*0.16*detail;
     if(variant>1.5) {
      float bay=cutPanelBox(q-vec2(-0.075,0.07),vec2(0.24,0.21),0.008);
      float region=1.0-smoothstep(-0.012,0.0,bay);
      float cell=fract((q.y+0.37)*17.0)-0.5;
      float slit=circuitLine(cell,0.14)*region;
      float blade=circuitLine(cell+0.19,0.065)*region;
      height+=(-slit*0.042+blade*0.019)*detail;
      shadow+=slit*0.82*detail;metal+=blade*0.24*detail;
     }
     vec2 screw=abs(q-vec2(-0.035,0.025))-vec2(0.307,0.327);
     float radius=length(screw),cap=1.0-smoothstep(0.006,0.011,radius);
     float ring=circuitLine(radius-0.012,0.0015);
     float drive=circuitLine(screw.x+screw.y,0.0017)*cap;
     height+=(cap*0.012-drive*0.025)*detail;
     shadow+=(ring*0.55+drive*0.8)*detail;metal+=cap*0.3*detail;
    }
    if(variant>2.5) {
     float slot=circuitLine(p.x,0.055)*(1.0-smoothstep(0.19,0.23,abs(p.y)));
     height-=slot*0.02;shadow+=slot*.75;metal+=.35;
    } else {
     float labels=(1.0-smoothstep(0.009,0.016,abs(q.y+0.416)))
       *smoothstep(-0.34,-0.33,q.x)*(1.0-smoothstep(-0.13,-0.12,q.x));
     float code=circuitLine(fract(q.x*113.0+seed*7.0)-0.5,0.13)*labels;
     metal+=code*0.13*detail;
    }
    float grain=sin(p.y*1200.0+sin(p.x*43.0+seed)*1.7);
    float grainVisibility=1.0-smoothstep(0.35,1.4,fwidth(p.y)*1200.0);
    finish+=grain*0.045*grainVisibility*detail;
    finish+=sin(p.x*11.0+p.y*7.0+seed*42.0)*0.025*detail;
   }
  #endif
  return vec4(height,clamp(shadow,0.0,0.95),min(metal,1.3),finish);
 }
 vec3 machinedNormal(vec3 normal,vec3 world,float height) {
  vec3 dx=dFdx(world),dy=dFdy(world);
  vec3 rx=cross(dy,normal),ry=cross(normal,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(abs(determinant)*normal-gradient+normal*0.0000001);
 }
 vec3 photonicSurface(vec2 p,vec3 style,float time) {
  float seed=style.y;
  float lane=mix(-0.32,0.32,step(0.5,seed));
  float slot=circuitLine(p.x-lane,0.007);
  float span=smoothstep(-0.36,-0.32,p.y)*(1.0-smoothstep(0.1+seed*0.2,0.15+seed*0.2,p.y));
  float cursor=fract(time*(0.08+seed*0.08)+seed*7.0)*0.72-0.36;
  float head=exp(-pow((p.y-cursor)*65.0,2.0));
  float lit=step(0.86,seed);
  vec3 color=vec3(0.035,0.33,0.57)*slot*span*(0.15+lit*0.75);
  color+=vec3(0.5,1.6,2.2)*head*slot*span*lit;
  float node=exp(-pow((p.x+lane)*65.0,2.0)-pow((p.y-0.31)*90.0,2.0));
  color+=vec3(0.15,0.7,1.0)*node*step(0.5,seed);
  #if CIRCUIT_FINE_DETAIL == 1
   float band=smoothstep(0.12,0.14,p.x)*(1.0-smoothstep(0.29,0.31,p.x));
   float ticks=circuitLine(fract(p.y*24.0+seed)-0.5,0.065);
   float region=smoothstep(-0.26,-0.23,p.y)*(1.0-smoothstep(-0.04,0.0,p.y));
   float visibility=1.0-smoothstep(0.15,0.65,fwidth(p.y)*24.0);
   color+=vec3(0.025,0.14,0.22)*ticks*band*region*visibility;
   float plate=circuitLine(max(abs(p.x+0.12)-0.09,abs(p.y+0.23)-0.035),0.002);
   color+=vec3(0.015,0.07,0.12)*plate;
  #endif
  return color;
 }
`;

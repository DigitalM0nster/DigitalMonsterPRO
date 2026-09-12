import * as THREE from "three";

const vertex = `
uniform vec2 uViewport;
varying vec2 vStrip;
varying float vHalfWidth;
#include <fog_pars_vertex>
void main(){
 vec4 mvPosition=modelViewMatrix*vec4(position.x,0.,0.,1.);
 vec4 clip=projectionMatrix*mvPosition;
 // Clear the supporting face over the small halo footprint. Only depth moves;
 // the authored line stays at exactly the same projected position.
 float haloDepth=7.*abs(mvPosition.z)/max(projectionMatrix[1][1]*uViewport.y,1.);
 float frontDepth=.5*(abs(modelViewMatrix[1].z)+abs(modelViewMatrix[2].z))+haloDepth;
 vec4 front=projectionMatrix*(mvPosition+vec4(0.,0.,frontDepth,0.));
 clip.z=front.z/front.w*clip.w;
 vec4 a=projectionMatrix*modelViewMatrix*vec4(-.5,0.,0.,1.);
 vec4 b=projectionMatrix*modelViewMatrix*vec4(.5,0.,0.,1.);
 vec2 direction=(b.xy/b.w-a.xy/a.w)*uViewport;
 direction/=max(length(direction),.00001);
 vec2 normal=vec2(-direction.y,direction.x);
 vec4 y=projectionMatrix*modelViewMatrix*vec4(0.,1.,0.,0.);
 vec4 z=projectionMatrix*modelViewMatrix*vec4(0.,0.,1.,0.);
 vec2 yPx=(y.xy-clip.xy/clip.w*y.w)/clip.w*.5*uViewport;
 vec2 zPx=(z.xy-clip.xy/clip.w*z.w)/clip.w*.5*uViewport;
 vHalfWidth=max(.5,.5*(abs(dot(yPx,normal))+abs(dot(zPx,normal))));
 float across=position.y*2.*(vHalfWidth+3.5);
 clip.xy+=normal*across*2./uViewport*clip.w;
 vStrip=vec2(uv.x,across);
 gl_Position=clip;
 #include <fog_vertex>
}`;

const fragment = `
uniform vec3 uColor;uniform float uOpacity;
varying vec2 vStrip;varying float vHalfWidth;
#include <fog_pars_fragment>
void main(){
 float distance=abs(vStrip.y)-vHalfWidth;
 float core=1.-smoothstep(-.5,.5,distance);
 float halo=exp(-pow(max(0.,distance)/1.55,2.))*.3;
 float cap=min(vStrip.x,1.-vStrip.x)/max(fwidth(vStrip.x),.00001);
 float coverage=max(core,halo)*clamp(cap,0.,1.);
 if(coverage<.002)discard;
 // Preserve hue; local glow stays smooth even below Medium bloom resolution.
 vec3 color=uColor*.42;
 color*=min(1.,.92/max(dot(color,vec3(.2126,.7152,.0722)),.00001));
 gl_FragColor=vec4(color,coverage*uOpacity);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`;

/** Replace only Medium MMK-1 emitters during construction, before any warm draw. */
export function prepareMmk1MediumNeon(group, disposables) {
	const geometry = new THREE.PlaneGeometry(1, 1), viewport = new THREE.Vector4();
	disposables.push(geometry);
	for (const { core } of group.userData.stripMeshes) {
		const previous = core.material;
		const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
			uViewport: { value: new THREE.Vector2(1, 1) }, uColor: { value: previous.color }, uOpacity: { value: previous.opacity },
		}]);
		const material = new THREE.ShaderMaterial({
			name: "MMK1 / Medium continuous neon", uniforms, vertexShader: vertex, fragmentShader: fragment,
			transparent: true, depthWrite: false, fog: true, toneMapped: false,
			extensions: { derivatives: true }, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
		});
		material.forceSinglePass = true;
		material.color = uniforms.uColor.value; material.opacity = previous.opacity;
		core.geometry = geometry; core.material = material;
		core.frustumCulled = false;
		core.onBeforeRender = renderer => {
			renderer.getCurrentViewport(viewport);
			uniforms.uViewport.value.set(viewport.z, viewport.w);
			uniforms.uOpacity.value = material.opacity;
		};
		const index = disposables.indexOf(previous);
		if (index >= 0) disposables[index] = material; else disposables.push(material);
		previous.dispose();
	}
}

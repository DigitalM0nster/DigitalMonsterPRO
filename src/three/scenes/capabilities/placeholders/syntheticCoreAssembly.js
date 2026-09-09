import * as THREE from "three";

const declarations = /* glsl */ `
	attribute vec3 aPart;
	attribute vec3 aAssembly;
	uniform float uAssembly;
	float partProgress() { return smoothstep(aAssembly.y, max(aAssembly.y + 0.001, aAssembly.z), uAssembly) * step(0.001, aAssembly.x); }
	vec3 turnPart(vec3 p) {
		vec3 axis = normalize(vec3(-aPart.y, aPart.x, 0.4));
		float angle = partProgress() * (0.24 + sin(dot(aPart, vec3(3,5,7))) * 0.16);
		float c = cos(angle), s = sin(angle);
		return p*c + cross(axis,p)*s + axis*dot(axis,p)*(1.0-c);
	}
	vec3 assemblePart(vec3 p) {
		vec3 direction = aPart / max(length(aPart), 0.001);
		return turnPart(p-aPart) + aPart + direction * aAssembly.x * partProgress();
	}
`;

/** Immutable attributes keep each machined panel rigid inside a merged draw. */
export function tagAssemblyPart(geometry, part = null) {
	const count = geometry.attributes.position.count;
	const centers = new Float32Array(count * 3);
	const motion = new Float32Array(count * 3);
	if (part) {
		for (let i = 0; i < count; i++) {
			centers[i * 3] = part.center.x;
			centers[i * 3 + 1] = part.center.y;
			centers[i * 3 + 2] = part.center.z;
			motion[i * 3] = part.distance;
			motion[i * 3 + 1] = part.delay;
			motion[i * 3 + 2] = part.end ?? 1;
		}
	}
	geometry.setAttribute("aPart", new THREE.BufferAttribute(centers, 3));
	geometry.setAttribute("aAssembly", new THREE.BufferAttribute(motion, 3));
	return geometry;
}

export function bindAssemblyMaterial(material, uniform) {
	material.defaultAttributeValues = { ...material.defaultAttributeValues, aPart: [0, 0, 0], aAssembly: [0, 0, 1] };
	if (material.isShaderMaterial) {
		material.uniforms.uAssembly = uniform;
		material.vertexShader = declarations + material.vertexShader
			.replace("vec3 p=position;", "vec3 p=assemblePart(position);");
	} else {
		material.onBeforeCompile = (shader) => {
			shader.uniforms.uAssembly = uniform;
			shader.vertexShader = declarations + shader.vertexShader
				.replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = turnPart(objectNormal);")
				.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = assemblePart(transformed);");
			// Preserve reflection detail below the site's HDR bloom threshold;
			// metal reflects light while the separate energy emitters can glow.
			shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
				"outgoingLight = vec3(1.0) - exp(-outgoingLight);\n#include <opaque_fragment>");
		};
		material.customProgramCacheKey = () => "synthetic-core-rigid-assembly-v3";
	}
}

export function createAssemblyLinks(parts, uniform) {
	const positions = [], centers = [], motion = [], channels = [], indices = [];
	const segments = 20;
	for (const [channel, part] of parts.entries()) {
		const base = positions.length / 3;
		for (let segment = 0; segment <= segments; segment++) {
			for (const side of [-1, 1]) {
				positions.push(segment / segments, side, 0);
				centers.push(...part.center.toArray());
				motion.push(part.distance, part.delay, part.end ?? 1);
				channels.push(channel);
			}
			if (segment < segments) {
				const i = base + segment * 2;
				indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(centers, 3));
	geometry.setAttribute("aAssembly", new THREE.Float32BufferAttribute(motion, 3));
	geometry.setAttribute("aChannel", new THREE.Float32BufferAttribute(channels, 1));
	geometry.setIndex(indices);
	const material = new THREE.ShaderMaterial({
		name: "core-part-data-channels",
		uniforms: { uAssembly: uniform, uTime: { value: 0 } },
		vertexShader: declarations + `
			attribute float aChannel;varying vec2 vChannelUv;varying float vChannel;varying float vReveal;
			void main(){
				vec3 inner=normalize(aPart)*1.27, outer=assemblePart(aPart);
				vec4 start=modelViewMatrix*vec4(inner,1.0), end=modelViewMatrix*vec4(outer,1.0);
				vec4 p=mix(start,end,position.x);
				vec2 tangent=normalize(end.xy-start.xy+vec2(0.00001));
				p.xy+=vec2(-tangent.y,tangent.x)*position.y*0.025;
				vChannelUv=position.xy;vChannel=aChannel;
				vReveal=smoothstep(0.1,0.55,partProgress());
				gl_Position=projectionMatrix*p;
			}`,
		fragmentShader: `
			uniform float uTime;varying vec2 vChannelUv;varying float vChannel;varying float vReveal;
			void main(){
				float travel=vChannelUv.x, across=vChannelUv.y;
				float aa=max(fwidth(across),0.02);
				float center=1.0-smoothstep(0.07,0.07+aa,abs(across));
				float rails=1.0-smoothstep(0.05,0.05+aa,abs(abs(across)-0.7));
				float direction=mod(vChannel,2.0)*2.0-1.0;
				float phase=fract(travel-uTime*0.24*direction+vChannel*0.173+0.5)-0.5;
				float packet=exp(-pow(phase*32.0,2.0));
				float reply=exp(-pow((fract(travel+uTime*0.31*direction+vChannel*0.13+0.5)-0.5)*48.0,2.0));
				float code=step(0.5,fract(travel*24.0+vChannel));
				float ports=exp(-pow((travel-0.07)*90.0,2.0))+exp(-pow((travel-0.93)*90.0,2.0));
				float light=center*(0.12+packet)+rails*(0.08+reply*0.8)+code*packet*0.5+ports*0.4;
				float ends=smoothstep(0.0,0.025,travel)*smoothstep(0.0,0.025,1.0-travel);
				gl_FragColor=vec4(vec3(0.08,0.8,1.3)*(0.7+packet*2.4+reply),light*vReveal*ends);
			}`,
		transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
	});
	const links = new THREE.Mesh(geometry, material);
	links.name = "assembly-data-channels";
	links.frustumCulled = false;
	return links;
}

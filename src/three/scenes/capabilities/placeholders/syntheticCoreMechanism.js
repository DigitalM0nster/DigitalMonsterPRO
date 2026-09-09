import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const breath = () => new Promise(resolve => requestAnimationFrame(resolve));

function dataMaterial(world) {
	const material = new THREE.ShaderMaterial({
		name: "core-scan-arcs",
		uniforms: { uTime: { value: 0 }, uAssembly: world.assemblyUniform },
		vertexShader: `varying vec3 vLocal; void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
		fragmentShader: `
			varying vec3 vLocal; uniform float uTime; uniform float uAssembly;
			void main(){
				float r=length(vLocal.xy), a=atan(vLocal.y,vLocal.x);
				float aa=max(fwidth(r),0.001);
				float tracks=0.0, signals=0.0;
				for(int i=0;i<3;i++){
					float lane=float(i), radius=0.72+lane*0.12;
					float line=1.0-smoothstep(0.004,0.004+aa,abs(r-radius));
					float phase=uTime*(0.42+lane*0.08)*(i==1?-1.0:1.0)+lane*2.1;
					float arc=pow(max(0.0,cos(a-phase)),14.0);
					tracks+=line; signals+=line*arc;
				}
				float ports=pow(max(0.0,cos(a*16.0)),32.0);
				ports*=1.0-smoothstep(0.003,0.003+aa,abs(r-1.008));
				float strength=0.12+smoothstep(0.15,0.9,uAssembly)*0.88;
				float alpha=(tracks*0.26+signals*0.95+ports*0.42)*strength;
				gl_FragColor=vec4(vec3(0.08,0.72,1.05)*(0.9+signals*2.7),alpha);
			}`,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		toneMapped: false, side: THREE.DoubleSide,
	});
	world.timeUniforms.push(material.uniforms.uTime);
	return material;
}

/** Permanent mechanical and data layers, animated only through transforms/uniforms. */
export async function buildCoreMechanism(world, assembly, materials, batch, isDisposed) {
	const { titanium, dark, silver, energy } = materials;
	const mechanism = new THREE.Group();
	mechanism.name = "revealed-core-mechanism";
	assembly.add(mechanism);
	const data = dataMaterial(world);
	world.ownedMaterials.push(data);
	const chassis = batch(mechanism);
	// A longitudinal processor spine and six conductive buses between the bearings.
	chassis.add(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 48), dark, [0, 0, -0.25], [Math.PI / 2, 0, 0]);
	chassis.add(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 64), silver, [0, 0, 0.29], [Math.PI / 2, 0, 0]);
	for (let collar = 0; collar < 8; collar++) {
		chassis.add(new THREE.TorusGeometry(0.315, 0.022, 10, 64), titanium, [0, 0, -0.72 + collar * 0.13]);
		chassis.add(new THREE.TorusGeometry(0.34, 0.006, 8, 64), energy, [0, 0, -0.72 + collar * 0.13]);
	}
	for (let i = 0; i < 6; i++) {
		const a = i * TAU / 6;
		chassis.add(new THREE.BoxGeometry(0.08, 0.07, 1.3), titanium, [Math.cos(a) * 0.44, Math.sin(a) * 0.44, -0.25], [0, 0, a]);
		chassis.add(new THREE.BoxGeometry(0.012, 0.02, 1.24), energy, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.25], [0, 0, a]);
	}
	chassis.finish();
	for (let layer = 0; layer < 5; layer++) {
		const rotor = new THREE.Group();
		rotor.name = `processor-bearing-${layer}`;
		rotor.position.z = -0.82 + layer * 0.29;
		mechanism.add(rotor);
		const hardware = batch(rotor);
		hardware.add(new THREE.TorusGeometry(1.12, 0.035, 12, 128), layer % 2 ? silver : titanium);
		hardware.add(new THREE.TorusGeometry(0.56, 0.028, 12, 96), silver);
		for (let tooth = 0; tooth < 32; tooth++) {
			const a = tooth * TAU / 32;
			hardware.add(new THREE.BoxGeometry(0.1, 0.035, 0.085), dark, [Math.cos(a) * 1.065, Math.sin(a) * 1.065, 0], [0, 0, a]);
			if (tooth % 4 === 0) {
				hardware.add(new THREE.BoxGeometry(0.45, 0.035, 0.035), titanium, [Math.cos(a) * 0.8, Math.sin(a) * 0.8, -0.045], [0, 0, a]);
				hardware.add(new THREE.BoxGeometry(0.1, 0.018, 0.012), energy, [Math.cos(a) * 1.13, Math.sin(a) * 1.13, 0.034], [0, 0, a]);
			}
		}
		hardware.finish();
		const scan = new THREE.Mesh(new THREE.RingGeometry(0.62, 1.025, 96), data);
		scan.position.z = 0.055;
		rotor.add(scan);
		world.rotors.push({ object: rotor, axis: "z", speed: (layer % 2 ? -1 : 1) * (0.055 + layer * 0.012), revealBoost: 2.2 });
		await breath();
		if (isDisposed()) return;
	}
	// Larger scanning layers make the processor's activity visible around the lens.
	for (let layer = 0; layer < 3; layer++) {
		const halo = new THREE.Mesh(new THREE.RingGeometry(0.62, 1.025, 128), data);
		halo.name = `processor-scan-layer-${layer}`;
		halo.scale.setScalar(1.4 + layer * 0.035);
		halo.position.z = -0.7 + layer * 0.68;
		halo.rotation.z = layer * 1.2;
		mechanism.add(halo);
		world.rotors.push({ object: halo, axis: "z", speed: (layer % 2 ? -1 : 1) * 0.09, revealBoost: 1.1 });
	}
	// Fixed signal rails connect the bearings, outside their rotating envelopes.
	const rails = [];
	for (let channel = 0; channel < 8; channel++) {
		const angle = channel * TAU / 8;
		const p = (radius, z) => new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
		const path = new THREE.CurvePath();
		path.add(new THREE.LineCurve3(p(0.6,-0.93),p(1.16,-0.93)));
		path.add(new THREE.QuadraticBezierCurve3(p(1.16,-0.93),p(1.23,-0.93),p(1.23,-0.86)));
		path.add(new THREE.LineCurve3(p(1.23,-0.86),p(1.23,0.45)));
		path.add(new THREE.QuadraticBezierCurve3(p(1.23,0.45),p(1.23,0.52),p(1.16,0.52)));
		path.add(new THREE.LineCurve3(p(1.16,0.52),p(0.91,0.52)));
		const rail = new THREE.TubeGeometry(path, Math.round(80 * world.detail), 0.007, 6, false);
		rail.setAttribute("aChannel", new THREE.BufferAttribute(new Float32Array(rail.attributes.position.count).fill(channel), 1));
		rails.push(rail);
	}
	const geometry = mergeGeometries(rails);
	for (const rail of rails) rail.dispose();
	const signals = new THREE.ShaderMaterial({
		name: "core-signal-pulses",
		uniforms: { uTime: { value: 0 }, uAssembly: world.assemblyUniform },
		vertexShader: `
			attribute float aChannel; varying float vTravel; varying float vChannel;
			void main(){
				vTravel=uv.x;vChannel=aChannel;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
			}`,
		fragmentShader: `
			uniform float uTime;uniform float uAssembly;varying float vTravel;varying float vChannel;
			void main(){
				float direction=mod(vChannel,2.0)*2.0-1.0;
				float distance=fract(vTravel-uTime*0.18*direction+vChannel*0.127+0.5)-0.5;
				float pulse=exp(-pow(distance*32.0,2.0));
				float alpha=(0.14+pulse*0.86)*(0.3+uAssembly*0.7);
				gl_FragColor=vec4(vec3(0.08,0.72,1.05)*(0.75+pulse*3.2),alpha);
			}`,
		transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
	});
	const stream = new THREE.Mesh(geometry, signals);
	stream.name = "processor-signal-rails";
	mechanism.add(stream);
	world.timeUniforms.push(signals.uniforms.uTime);
}

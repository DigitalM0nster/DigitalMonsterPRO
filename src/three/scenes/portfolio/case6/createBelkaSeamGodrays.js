import * as THREE from "three";

/**
 * Belka seam godrays.
 *
 * Authored planes: Godray / Godray001 / … (also SeamRay* / SeamPlane* / GodrayPlane*).
 * Glow is driven by WORLD distance from the crystal origin — bright near the
 * gem, fading outward along the plane — not from the plane's UV center.
 */

function createBladeGeometry(length, height, tipWidth) {
	const halfH = height * 0.5;
	const positions = [
		0, halfH * 0.15, 0.02,
		0, -halfH * 0.15, 0.02,
		tipWidth, halfH, length,
		-tipWidth, halfH, length,
		tipWidth, -halfH, length,
		-tipWidth, -halfH, length,
	];
	const uvs = [0.5, 0, 0.5, 0, 1, 1, 0, 1, 1, 1, 0, 1];
	const indices = [0, 2, 3, 0, 3, 1, 1, 3, 5, 1, 5, 4, 0, 1, 4, 0, 4, 2, 2, 4, 5, 2, 5, 3];
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	return geo;
}

function createSeamRayMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uIntensity: { value: 0 },
			uTime: { value: 0 },
			uPulse: { value: 1 },
			/** Crystal / scene center in WORLD space. */
			uOrigin: { value: new THREE.Vector3(0, 0, 0) },
			/** Distance where the ray fades out (world units). */
			uMaxRange: { value: 2.4 },
		},
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vWorldPos;
			void main() {
				vUv = uv;
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uIntensity;
			uniform float uTime;
			uniform float uPulse;
			uniform vec3 uOrigin;
			uniform float uMaxRange;
			varying vec2 vUv;
			varying vec3 vWorldPos;

			void main() {
				vec3 rel = vWorldPos - uOrigin;
				float dist = length(rel);
				/** Hot at the crystal, dies toward the outer tip. */
				float t = clamp(dist / max(uMaxRange, 1e-3), 0.0, 1.0);
				float fromCrystal = pow(1.0 - t, 1.85);
				fromCrystal *= exp(-t * 1.1);

				/** Soft card edges only (not a glow centered on the plane). */
				float edge =
					smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x)
					* smoothstep(0.0, 0.26, vUv.y) * smoothstep(1.0, 0.74, vUv.y);

				float flicker = 0.88 + 0.12 * sin(uTime * 3.2 + dist * 4.0);
				float a = fromCrystal * edge * uIntensity * uPulse * flicker;
				if (a < 0.012) discard;

				vec3 col = mix(uColor, vec3(0.92, 1.0, 0.97), fromCrystal * 0.55) * (0.55 + a * 1.1);
				gl_FragColor = vec4(col, a);
			}
		`,
	});
}

/** @param {string} name */
export function isBelkaSeamRayName(name) {
	return /^(Godray|SeamRay|SeamPlane|GodrayPlane)/i.test(String(name ?? ""));
}

/**
 * @param {{
 *   planes?: THREE.Mesh[],
 *   directions?: THREE.Vector3[],
 *   length?: number,
 *   height?: number,
 *   tipWidth?: number,
 *   color?: string,
 * }} [opts]
 */
export function createBelkaSeamGodrays({
	planes = [],
	directions = [],
	length = 1.35,
	height = 0.7,
	tipWidth = 0.11,
	color = "#01dcf9",
} = {}) {
	const root = new THREE.Group();
	root.name = "BelkaSeamGodrays";

	const materials = [];
	/** @type {THREE.BufferGeometry[]} */
	const ownedGeos = [];
	/** @type {THREE.Mesh[]} */
	const rayMeshes = [];
	const authored = planes.filter((p) => p?.isMesh);
	const useAuthored = authored.length > 0;
	const _origin = new THREE.Vector3();

	if (useAuthored) {
		for (let i = 0; i < authored.length; i += 1) {
			const mesh = authored[i];
			const mat = createSeamRayMaterial(color);
			materials.push(mat);
			mesh.material = mat;
			mesh.frustumCulled = false;
			mesh.renderOrder = 4;
			mesh.visible = false;
			rayMeshes.push(mesh);
		}
	} else {
		const dirs = directions.length
			? directions
			: [
				new THREE.Vector3(1, 0, 0),
				new THREE.Vector3(-0.5, 0, 0.866),
				new THREE.Vector3(-0.5, 0, -0.866),
			];
		const sharedGeo = createBladeGeometry(length, height, tipWidth);
		ownedGeos.push(sharedGeo);
		for (let i = 0; i < dirs.length; i += 1) {
			const dir = dirs[i].clone();
			dir.y = 0;
			if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
			dir.normalize();
			const mat = createSeamRayMaterial(color);
			materials.push(mat);
			const mesh = new THREE.Mesh(sharedGeo, mat);
			mesh.frustumCulled = false;
			mesh.renderOrder = 4;
			mesh.visible = false;
			mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
			mesh.position.y = (i % 3) * 0.02 - 0.02;
			root.add(mesh);
			rayMeshes.push(mesh);
		}
	}

	const coreGeo = new THREE.SphereGeometry(0.18, 16, 12);
	ownedGeos.push(coreGeo);
	const coreMat = new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uIntensity: { value: 0 },
			uTime: { value: 0 },
		},
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
		vertexShader: /* glsl */ `
			varying vec3 vN;
			varying vec3 vV;
			void main() {
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vN = normalize(mat3(modelMatrix) * normal);
				vV = normalize(cameraPosition - wp.xyz);
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uIntensity;
			uniform float uTime;
			varying vec3 vN, vV;
			void main() {
				float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.8);
				float pulse = 0.85 + 0.15 * sin(uTime * 2.6);
				float a = (0.3 + fres * 0.6) * uIntensity * pulse * 0.55;
				gl_FragColor = vec4(uColor * (0.8 + fres), a);
			}
		`,
	});
	materials.push(coreMat);
	const core = new THREE.Mesh(coreGeo, coreMat);
	core.renderOrder = 3;
	core.visible = false;
	root.add(core);

	let intensity = 0;

	/** Fit fade range to farthest plane corner from origin (world). */
	const fitRangeFromOrigin = () => {
		let maxD = 0;
		const origin = materials[0]?.uniforms?.uOrigin?.value ?? new THREE.Vector3();
		for (const mesh of rayMeshes) {
			const geo = mesh.geometry;
			const pos = geo?.attributes?.position;
			if (!pos) continue;
			mesh.updateWorldMatrix(true, false);
			for (let i = 0; i < pos.count; i += 1) {
				_origin.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
				const d = _origin.distanceTo(origin);
				if (d > maxD) maxD = d;
			}
		}
		const range = Math.max(1.2, maxD * 1.05);
		for (const m of materials) {
			if (m.uniforms?.uMaxRange) m.uniforms.uMaxRange.value = range;
		}
	};

	return {
		root,
		authored: useAuthored,
		/**
		 * Crystal / scene center — godrays fade with world distance from here.
		 * @param {THREE.Vector3} worldPos
		 */
		setOrigin(worldPos) {
			if (!worldPos) return;
			for (const m of materials) {
				if (m.uniforms?.uOrigin) m.uniforms.uOrigin.value.copy(worldPos);
			}
			fitRangeFromOrigin();
		},
		/**
		 * Live DEV color swap (look is otherwise fixed to the original crystal falloff).
		 * @param {{ color?: string }} [tune]
		 */
		applyTune(tune = {}) {
			if (tune.color == null) return;
			const c = new THREE.Color(tune.color);
			for (const m of materials) {
				if (m.uniforms?.uColor) m.uniforms.uColor.value.copy(c);
			}
		},
		setIntensity(v) {
			intensity = Math.max(0, v);
			const on = intensity > 0.01;
			for (const m of materials) {
				if (m.uniforms?.uIntensity) m.uniforms.uIntensity.value = intensity;
				if (m.uniforms?.uPulse) m.uniforms.uPulse.value = 0.75 + intensity * 0.35;
			}
			for (const mesh of rayMeshes) mesh.visible = on;
			core.visible = on;
			root.visible = on || useAuthored;
		},
		update(time) {
			for (const m of materials) {
				if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
			}
			if (core.visible) {
				core.scale.setScalar(1 + Math.sin(time * 2.1) * 0.04 * intensity);
			}
		},
		dispose() {
			for (const g of ownedGeos) g.dispose();
			for (const m of materials) m.dispose();
		},
	};
}

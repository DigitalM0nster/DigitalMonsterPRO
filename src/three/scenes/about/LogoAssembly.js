import * as THREE from "three";
import {
	ABOUT_COLORS,
	ABOUT_GEOMETRY,
	ABOUT_MATERIALS,
} from "./aboutSceneConfig.js";
import {
	createFrameGeometry,
	createRoundedRectLoopGeometry,
	disposeObject,
} from "./aboutGeometry.js";

function createShellMaterial() {
	const cfg = ABOUT_MATERIALS.shell;
	return new THREE.MeshPhysicalMaterial({
		color: cfg.color,
		metalness: cfg.metalness,
		roughness: cfg.roughness,
		clearcoat: cfg.clearcoat,
		clearcoatRoughness: cfg.clearcoatRoughness,
		transparent: true,
		opacity: 0.94,
		side: THREE.FrontSide,
		envMapIntensity: cfg.envMapIntensity,
		// Avoid full transmission (needs expensive scene refraction RTs in shared pipeline).
		// Glass look comes from opacity + clearcoat + fresnel contour meshes.
		transmission: 0,
		thickness: 0.35,
		attenuationColor: new THREE.Color(ABOUT_COLORS.shellTint),
		attenuationDistance: 2.5,
	});
}

function createEngineeringMaterial() {
	const cfg = ABOUT_MATERIALS.engineering;
	return new THREE.MeshStandardMaterial({
		color: cfg.color,
		emissive: cfg.emissive,
		emissiveIntensity: cfg.emissiveIntensity,
		metalness: cfg.metalness,
		roughness: cfg.roughness,
		transparent: true,
		opacity: 0.92,
		side: THREE.DoubleSide,
	});
}

function createInnerRingMaterial() {
	const cfg = ABOUT_MATERIALS.innerRing;
	return new THREE.MeshPhysicalMaterial({
		color: cfg.color,
		emissive: cfg.emissive,
		emissiveIntensity: cfg.emissiveIntensity,
		metalness: cfg.metalness,
		roughness: cfg.roughness,
		clearcoat: cfg.clearcoat,
		clearcoatRoughness: 0.12,
	});
}

function createInsetMaterial() {
	return new THREE.MeshStandardMaterial({
		color: 0x02060e,
		metalness: 0.4,
		roughness: 0.55,
		emissive: 0x020810,
		emissiveIntensity: 0.2,
		transparent: true,
		opacity: 1,
	});
}

/**
 * Design shell + engineering frame + inner ring + niche inset.
 * Layers start coincident and separate via scroll uniforms.
 */
export function createLogoAssembly() {
	const group = new THREE.Group();
	group.name = "LogoAssembly";

	const shellGroup = new THREE.Group();
	shellGroup.name = "DesignShell";
	const networkAnchor = new THREE.Group();
	networkAnchor.name = "NetworkAnchor";
	const engineeringGroup = new THREE.Group();
	engineeringGroup.name = "EngineeringFrame";

	const geo = ABOUT_GEOMETRY;

	const shellGeo = createFrameGeometry();
	const shellMat = createShellMaterial();
	const shellMesh = new THREE.Mesh(shellGeo, shellMat);
	shellMesh.renderOrder = 2;
	shellGroup.add(shellMesh);

	// Outer / inner glowing contour lines (no tubes — tubes bloom into orbs at corners)
	const outerLoopGeo = createRoundedRectLoopGeometry(geo.outerSize * 0.998, geo.outerRadius * 0.99, 80);
	const innerLoopGeo = createRoundedRectLoopGeometry(geo.innerHole * 1.015, geo.holeRadius * 1.01, 64);
	const contourMatOuter = new THREE.LineBasicMaterial({
		color: new THREE.Color(ABOUT_COLORS.cyan).multiplyScalar(2.4),
		transparent: true,
		opacity: 0.9,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});
	const contourMatInner = new THREE.LineBasicMaterial({
		color: new THREE.Color(ABOUT_COLORS.rimCyan).multiplyScalar(2.2),
		transparent: true,
		opacity: 0.95,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});

	const makeContour = (loopGeo, material, z) => {
		const front = loopGeo.clone();
		front.translate(0, 0, z);
		const line = new THREE.LineLoop(front, material);
		line.renderOrder = 4;
		return line;
	};

	const outerContour = makeContour(outerLoopGeo, contourMatOuter, geo.depth * 0.51);
	const innerContour = makeContour(innerLoopGeo, contourMatInner, geo.depth * 0.51);
	const outerContourBack = makeContour(outerLoopGeo, contourMatOuter, -geo.depth * 0.48);
	const innerContourBack = makeContour(innerLoopGeo, contourMatInner, -geo.depth * 0.48);
	shellGroup.add(outerContour, innerContour, outerContourBack, innerContourBack);

	// Fresnel rim shell (slightly larger, additive)
	const rimGeo = createFrameGeometry({
		outerSize: geo.outerSize * ABOUT_MATERIALS.contour.scaleOffset,
		innerHole: geo.innerHole * 0.992,
		depth: geo.depth * 0.92,
		bevelSize: geo.bevelSize * 0.7,
		bevelThickness: geo.bevelThickness * 0.7,
	});
	const rimMat = new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(ABOUT_COLORS.cyan) },
			uIntensity: { value: 1.2 },
			uOpacity: { value: 0.35 },
		},
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vNormal = normalize(normalMatrix * normal);
				vView = normalize(-mv.xyz);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uIntensity;
			uniform float uOpacity;
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.8);
				float edge = pow(fresnel, 1.4);
				vec3 col = uColor * (uIntensity * (0.15 + edge * 2.2));
				gl_FragColor = vec4(col, clamp(uOpacity * (0.08 + edge), 0.0, 1.0));
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
	const rimMesh = new THREE.Mesh(rimGeo, rimMat);
	rimMesh.renderOrder = 3;
	shellGroup.add(rimMesh);

	// Engineering frame — thinner, brighter
	const engGeo = createFrameGeometry({
		outerSize: geo.outerSize * geo.engineeringScale,
		innerHole: geo.innerHole * 1.08,
		depth: geo.engineeringDepth,
		outerRadius: geo.outerRadius * 0.9,
		holeRadius: geo.holeRadius * 1.05,
		bevelSize: geo.bevelSize * 0.55,
		bevelThickness: geo.bevelThickness * 0.5,
	});
	const engMat = createEngineeringMaterial();
	const engMesh = new THREE.Mesh(engGeo, engMat);
	engMesh.renderOrder = 1;
	engineeringGroup.add(engMesh);

	// Small construction guides on engineering frame
	const guideMat = new THREE.LineBasicMaterial({
		color: ABOUT_COLORS.rimCyan,
		transparent: true,
		opacity: 0.45,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});
	const guidePositions = [];
	const guideHalf = (geo.outerSize * geo.engineeringScale) * 0.42;
	for (let i = -2; i <= 2; i += 1) {
		if (i === 0) continue;
		const o = i * 0.22;
		guidePositions.push(-guideHalf, o, 0.16, guideHalf, o, 0.16);
		guidePositions.push(o, -guideHalf, 0.16, o, guideHalf, 0.16);
	}
	const guideGeo = new THREE.BufferGeometry();
	guideGeo.setAttribute("position", new THREE.Float32BufferAttribute(guidePositions, 3));
	const guides = new THREE.LineSegments(guideGeo, guideMat);
	guides.renderOrder = 5;
	guides.visible = false;
	engineeringGroup.add(guides);

	// Inner cold-white ring around the hole
	const ringGeo = createFrameGeometry({
		outerSize: geo.innerRingSize,
		innerHole: geo.innerRingHole,
		depth: geo.innerRingDepth,
		outerRadius: geo.holeRadius * 1.05,
		holeRadius: geo.holeRadius * 0.92,
		bevelSize: geo.innerRingBevel,
		bevelThickness: geo.innerRingBevel,
		bevelSegments: 2,
		curveSegments: 20,
	});
	const ringMat = createInnerRingMaterial();
	const ringMesh = new THREE.Mesh(ringGeo, ringMat);
	ringMesh.position.z = geo.depth * 0.38;
	ringMesh.renderOrder = 6;
	shellGroup.add(ringMesh);

	// Dark recessed inset (scene 1 niche)
	const insetGeo = new THREE.BoxGeometry(geo.insetSize, geo.insetSize, geo.insetDepth);
	const insetMat = createInsetMaterial();
	const insetMesh = new THREE.Mesh(insetGeo, insetMat);
	insetMesh.position.z = -geo.depth * 0.35;
	insetMesh.renderOrder = 0;
	shellGroup.add(insetMesh);

	group.add(engineeringGroup);
	group.add(networkAnchor);
	group.add(shellGroup);

	const state = {
		group,
		shellGroup,
		networkAnchor,
		engineeringGroup,
		shellMat,
		engMat,
		ringMat,
		rimMat,
		contourMatOuter,
		contourMatInner,
		insetMat,
		guideMat,
		insetMesh,
		_shellTint: new THREE.Color(ABOUT_COLORS.shellTint),
	};

	return {
		group,
		shellGroup,
		networkAnchor,
		engineeringGroup,
		applyMotion(motion) {
			shellGroup.position.set(motion.shellOffsetX, 0, motion.shellOffsetZ);
			shellGroup.rotation.y = motion.shellExtraYaw;
			engineeringGroup.position.set(motion.engineeringOffsetX, 0, motion.engineeringOffsetZ);
			engineeringGroup.rotation.y = motion.engineeringExtraYaw;
			networkAnchor.position.set(motion.networkOffsetX, 0, motion.networkOffsetZ);

			shellMat.opacity = motion.shellOpacity;
			shellMat.metalness = motion.shellMetalness;
			shellMat.roughness = motion.shellRoughness;
			shellMat.transparent = true;
			shellMat.color.setHex(ABOUT_COLORS.shell);
			shellMat.color.lerp(state._shellTint, motion.glassAmount * 0.55);

			rimMat.uniforms.uIntensity.value = 0.85 + motion.contourOuter * 0.9;
			rimMat.uniforms.uOpacity.value = 0.22 + motion.glassAmount * 0.28;

			contourMatOuter.color.set(ABOUT_COLORS.cyan).multiplyScalar(1.6 + motion.contourOuter * 1.2);
			contourMatOuter.opacity = THREE.MathUtils.clamp(0.45 + motion.contourOuter * 0.45, 0, 1);
			contourMatInner.color.set(ABOUT_COLORS.rimCyan).multiplyScalar(1.5 + motion.contourInner * 1.1);
			contourMatInner.opacity = THREE.MathUtils.clamp(0.5 + motion.contourInner * 0.4, 0, 1);

			engMat.emissiveIntensity = ABOUT_MATERIALS.engineering.emissiveIntensity * motion.engineeringGlow;
			engMat.opacity = 0.75 + motion.engineeringGlow * 0.2;
			guideMat.opacity = 0.15 + motion.engineeringGlow * 0.4;
			guides.visible = motion.engineeringGlow > 0.7 && motion.networkVisibility > 0.25;

			ringMat.emissiveIntensity = ABOUT_MATERIALS.innerRing.emissiveIntensity * motion.innerRingGlow;

			insetMat.opacity = motion.insetOpacity;
			insetMesh.visible = motion.insetOpacity > 0.02;
		},
		dispose() {
			disposeObject(group);
			outerLoopGeo.dispose();
			innerLoopGeo.dispose();
		},
	};
}

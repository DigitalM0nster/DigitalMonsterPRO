import * as THREE from "three";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth01 = (value) => {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
};
const sineInOut = (value) => 0.5 - Math.cos(clamp01(value) * Math.PI) * 0.5;

function hashNoise2D(x, y) {
	return (
		Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
	) % 1;
}

function valueNoise2D(x, y) {
	const cellX = Math.floor(x);
	const cellY = Math.floor(y);
	const localX = x - cellX;
	const localY = y - cellY;
	const easedX = localX * localX * (3 - 2 * localX);
	const easedY = localY * localY * (3 - 2 * localY);
	const normalizeHash = (value) => (value < 0 ? value + 1 : value) * 2 - 1;
	const a = normalizeHash(hashNoise2D(cellX, cellY));
	const b = normalizeHash(hashNoise2D(cellX + 1, cellY));
	const c = normalizeHash(hashNoise2D(cellX, cellY + 1));
	const d = normalizeHash(hashNoise2D(cellX + 1, cellY + 1));
	return THREE.MathUtils.lerp(
		THREE.MathUtils.lerp(a, b, easedX),
		THREE.MathUtils.lerp(c, d, easedX),
		easedY,
	);
}

const TUNNEL_LENGTH = 78;
const TUNNEL_NEAR = 2.5;
const TUNNEL_ROWS = 44;
const TUNNEL_COLUMNS = 22;
const MAIN_TRAIL_COUNT = 7;
const MAIN_TRAIL_SEGMENTS = 256;
const TRAIL_CHAIN_POINT_COUNT = 42;
const TRAIL_TARGET_HISTORY_LENGTH = 384;
const TRAIL_TAIL_DELAY_SECONDS = 1.18;
const SECONDARY_TRAIL_COUNT = 56;
const SECONDARY_TRAIL_SEGMENTS = 32;
// The camera flies slightly to the right of the tunnel axis while the light
// bundle enters from the lower-left edge and keeps its tunnel-space heading.
const CAMERA_POSITION = new THREE.Vector3(0.72, 0.25, 6.2);
const CAMERA_LOOK_AT = new THREE.Vector3(-0.16, 0.05, -18);
const CAMERA_FOV = 52;

const environmentVertexShader = /* glsl */ `
	attribute float aPhase;
	attribute float aColorMix;
	attribute float aEdgeStrength;
	attribute float aFaceLevel;
	attribute vec2 aRadialDirection;

	uniform float uTime;
	uniform float uTravel;
	uniform float uLength;
	uniform float uNear;
	uniform float uReveal;

	varying vec2 vUv;
	varying float vColorMix;
	varying float vDepthFade;
	varying float vPulse;
	varying float vEdgeStrength;
	varying float vFaceLevel;

	void main() {
		vec4 localPosition = vec4(position, 1.0);
		#ifdef USE_INSTANCING
			localPosition = instanceMatrix * localPosition;
		#endif

		float baseDepth = max(0.0, -localPosition.z);
		float wrappedDepth = mod(baseDepth - uTravel + uLength, uLength);
		localPosition.z = -uNear - wrappedDepth;
		float lifeWave = sin(
			uTime * (0.44 + aPhase * 0.16)
			+ aPhase * 6.2831853
			+ wrappedDepth * 0.09
		);
		float lifeDetail = sin(
			uTime * 0.23
			+ aPhase * 12.5663706
			- wrappedDepth * 0.045
		);
		// Move every plate as one rigid element. The tunnel breathes without
		// scaling the boxes, so edge thickness and sharpness stay stable.
		localPosition.xy += aRadialDirection * (lifeWave * 0.12 + lifeDetail * 0.035);
		localPosition.z += lifeDetail * 0.07;

		vUv = uv;
		vColorMix = aColorMix;
		vPulse = 0.72 + sin(uTime * 0.34 + aPhase * 6.2831853 + wrappedDepth * 0.055) * 0.28;
		vEdgeStrength = aEdgeStrength;
		vFaceLevel = aFaceLevel;
		float nearFade = smoothstep(1.0, 5.5, wrappedDepth);
		float farFade = 1.0 - smoothstep(uLength - 7.0, uLength - 1.0, wrappedDepth);
		vDepthFade = nearFade * farFade;
		gl_Position = projectionMatrix * modelViewMatrix * localPosition;
	}
`;

const environmentFragmentShader = /* glsl */ `
	uniform float uReveal;
	uniform vec3 uColorA;
	uniform vec3 uColorB;

	varying vec2 vUv;
	varying float vColorMix;
	varying float vDepthFade;
	varying float vPulse;
	varying float vEdgeStrength;
	varying float vFaceLevel;

	void main() {
		vec3 accent = mix(uColorA, uColorB, vColorMix);
		vec2 edgeUv = min(vUv, 1.0 - vUv);
		float edgeDistance = min(edgeUv.x, edgeUv.y);
		float edgePixel = max(fwidth(edgeDistance), 0.0008);
		float edge = 1.0 - smoothstep(edgePixel * 0.72, edgePixel * 1.9, edgeDistance);
		float face = vFaceLevel * (1.0 - edge);
		float edgeEnergy = edge * vEdgeStrength * (0.72 + vPulse * 0.88);
		vec3 color = accent * (face + edgeEnergy);
		float alpha = uReveal * vDepthFade * (face * 2.8 + edge * (0.38 + vPulse * 0.34));
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(color, alpha);
	}
`;

const mainTrailVertexShader = /* glsl */ `
	attribute float aT;
	attribute float aSide;
	attribute float aPhase;
	attribute float aHue;
	attribute float aWidth;
	attribute float aTrailIndex;

	uniform float uTime;
	uniform float uReveal;
	uniform float uWidthScale;
	uniform sampler2D uChainMap;
	uniform float uHeads[${MAIN_TRAIL_COUNT}];

	varying float vT;
	varying float vHue;
	varying float vReveal;
	varying float vHead;

	vec2 readChainPoint(float pointIndex, float trailIndex) {
		vec2 chainUv = vec2(
			(pointIndex + 0.5) / ${TRAIL_CHAIN_POINT_COUNT}.0,
			(trailIndex + 0.5) / ${MAIN_TRAIL_COUNT}.0
		);
		return texture2D(uChainMap, chainUv).xy;
	}

	vec2 sampleChainPoint(float pathPosition, float trailIndex) {
		float pointPosition = clamp(pathPosition, 0.0, 1.0) * ${TRAIL_CHAIN_POINT_COUNT - 1}.0;
		float point1 = floor(pointPosition);
		float localT = pointPosition - point1;
		float point0 = max(0.0, point1 - 1.0);
		float point2 = min(${TRAIL_CHAIN_POINT_COUNT - 1}.0, point1 + 1.0);
		float point3 = min(${TRAIL_CHAIN_POINT_COUNT - 1}.0, point1 + 2.0);
		vec2 p0 = readChainPoint(point0, trailIndex);
		vec2 p1 = readChainPoint(point1, trailIndex);
		vec2 p2 = readChainPoint(point2, trailIndex);
		vec2 p3 = readChainPoint(point3, trailIndex);
		float localT2 = localT * localT;
		float localT3 = localT2 * localT;
		return 0.5 * (
			2.0 * p1
			+ (p2 - p0) * localT
			+ (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * localT2
			+ (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * localT3
		);
	}

	vec3 getTrailCenter(float curveT, float head, int trailIndex) {
		float pathT = smoothstep(0.0, 1.0, curveT);
		float visiblePathT = clamp(curveT / max(head, 0.001), 0.0, 1.0);
		vec2 start = vec2(-9.35, -3.75);
		vec2 finish = vec2(-0.34, -0.06);
		vec2 center = mix(start, finish, pathT);
		float depthCompensation = 1.0 + curveT * 3.5353535;
		vec2 chainOffset = sampleChainPoint(visiblePathT, float(trailIndex));
		float centeredIndex = float(trailIndex) - ${((MAIN_TRAIL_COUNT - 1) / 2).toFixed(1)};
		vec2 strandOffset = vec2(
			centeredIndex * 0.012,
			centeredIndex * 0.046 + (aPhase - 0.5) * 0.018
		);
		center += strandOffset * depthCompensation;
		center += chainOffset * depthCompensation;
		return vec3(center, 1.25 - curveT * 17.5);
	}

	void main() {
		float t = aT;
		int trailIndex = int(aTrailIndex + 0.5);
		float head = uHeads[trailIndex];
		// Vertices beyond the animated head collapse onto one center point. The
		// final live quad therefore becomes a true triangular, opaque needle tip
		// instead of ending on a clipped/square cross-section.
		float sampleT = min(t, head);
		// Preserve a parallel body all the way to the end. Only the short final
		// section (roughly six geometry segments) closes into the sharp point.
		float headTaper = smoothstep(0.0, 0.012, head - sampleT);
		float bodyProfile = mix(1.2, 0.62, smoothstep(0.0, 1.0, sampleT));
		float width = aWidth * uWidthScale * bodyProfile * headTaper;
		float tangentStep = 1.0 / ${MAIN_TRAIL_SEGMENTS}.0;
		vec3 center = getTrailCenter(sampleT, head, trailIndex);
		vec3 previousCenter = getTrailCenter(max(0.0, sampleT - tangentStep), head, trailIndex);
		vec3 nextCenter = getTrailCenter(min(head, sampleT + tangentStep), head, trailIndex);
		vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
		vec4 viewPrevious = modelViewMatrix * vec4(previousCenter, 1.0);
		vec4 viewNext = modelViewMatrix * vec4(nextCenter, 1.0);
		vec2 tangentDelta = viewNext.xy - viewPrevious.xy;
		vec2 viewTangent = length(tangentDelta) > 0.00001
			? normalize(tangentDelta)
			: vec2(1.0, 0.0);
		vec2 viewNormal = vec2(-viewTangent.y, viewTangent.x);
		// Counter perspective shrink so the visible body remains equally thick;
		// headTaper is now the sole owner of the terminal narrowing.
		float screenWidthCompensation = max(1.0, -viewCenter.z / 5.0);
		viewCenter.xy += viewNormal * aSide * width * screenWidthCompensation;

		vT = sampleT;
		vHue = aHue;
		vReveal = uReveal;
		vHead = head;
		gl_Position = projectionMatrix * viewCenter;
	}
`;

const mainTrailFragmentShader = /* glsl */ `
	uniform float uGlowLayer;
	uniform vec3 uColorA;
	uniform vec3 uColorB;

	varying float vT;
	varying float vHue;
	varying float vReveal;
	varying float vHead;

	void main() {
		if (vT > vHead) discard;
		vec3 color = mix(uColorA, uColorB, clamp(vHue, 0.0, 1.0));
		float revealAlongPath = smoothstep(1.08 - vReveal * 1.12, 0.76 - vReveal * 0.76, vT);
		if (revealAlongPath < 0.5 || vReveal < 0.002) discard;
		float nearEnergy = mix(1.42, 0.82, smoothstep(0.0, 0.82, vT));
		float alpha = mix(1.0, 0.085 * nearEnergy, uGlowLayer);
		float energy = mix(2.75, 1.05, uGlowLayer) * nearEnergy;
		gl_FragColor = vec4(color * energy, alpha);
	}
`;

const secondaryTrailVertexShader = /* glsl */ `
	attribute float aT;
	attribute float aPhase;
	attribute float aHue;
	attribute float aSpeed;

	uniform float uTime;
	uniform float uReveal;
	uniform vec2 uPointer;

	varying float vT;
	varying float vPhase;
	varying float vHue;
	varying float vSpeed;
	varying float vReveal;

	void main() {
		float t = aT;
		float envelope = sin(t * 3.1415926);
		vec3 center = position;
		center.x += sin(t * 7.0 + aPhase * 19.0 + uTime * 0.18) * 0.075 * envelope;
		center.y += cos(t * 5.0 + aPhase * 13.0 - uTime * 0.14) * 0.05 * envelope;
		center.x += uPointer.x * mix(0.15, 0.7, t);

		vT = t;
		vPhase = aPhase;
		vHue = aHue;
		vSpeed = aSpeed;
		vReveal = uReveal;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(center, 1.0);
	}
`;

const secondaryTrailFragmentShader = /* glsl */ `
	uniform float uTime;
	uniform vec3 uColorA;
	uniform vec3 uColorB;

	varying float vT;
	varying float vPhase;
	varying float vHue;
	varying float vSpeed;
	varying float vReveal;

	void main() {
		vec3 color = mix(uColorA, uColorB, clamp(vHue, 0.0, 1.0));
		float travel = fract(vT * 1.65 - uTime * vSpeed + vPhase);
		float movingSignal = pow(1.0 - travel, 6.5);
		float ends = smoothstep(0.0, 0.09, vT) * smoothstep(0.0, 0.1, 1.0 - vT);
		float alpha = (0.13 + movingSignal * 0.36) * ends * vReveal;
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(color * (0.98 + movingSignal * 1.7), alpha);
	}
`;

function createEnvironment(disposables) {
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const instanceCount = TUNNEL_ROWS * TUNNEL_COLUMNS;
	const mesh = new THREE.InstancedMesh(
		geometry,
		new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uTravel: { value: 0 },
				uLength: { value: TUNNEL_LENGTH },
				uNear: { value: TUNNEL_NEAR },
				uReveal: { value: 0 },
				uColorA: { value: new THREE.Color(0x00c8ff) },
				uColorB: { value: new THREE.Color(0x287dff) },
			},
			vertexShader: environmentVertexShader,
			fragmentShader: environmentFragmentShader,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			depthTest: true,
			side: THREE.FrontSide,
			toneMapped: false,
		}),
		instanceCount,
	);
	mesh.name = "capability-light-trails-infinite-environment";
	mesh.frustumCulled = false;
	mesh.renderOrder = 1;

	const phases = new Float32Array(instanceCount);
	const colorMix = new Float32Array(instanceCount);
	const edgeStrengths = new Float32Array(instanceCount);
	const faceLevels = new Float32Array(instanceCount);
	const radialDirections = new Float32Array(instanceCount * 2);
	const matrix = new THREE.Matrix4();
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();
	const plateQuarterTurn = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(0, 1, 0),
		Math.PI * 0.5,
	);
	const scale = new THREE.Vector3();
	const euler = new THREE.Euler();
	let index = 0;
	for (let row = 0; row < TUNNEL_ROWS; row += 1) {
		const depth = row * (TUNNEL_LENGTH / TUNNEL_ROWS);
		for (let column = 0; column < TUNNEL_COLUMNS; column += 1) {
			const phase = (Math.sin((row + 1) * 91.73 + (column + 1) * 47.19) * 43758.5453) % 1;
			const normalizedPhase = phase < 0 ? phase + 1 : phase;
			const angle = (column / TUNNEL_COLUMNS) * Math.PI * 2
				+ row * 0.092
				+ (row % 2) * 0.045;
			const radialWave = Math.sin(row * 0.61 + column * 1.73) * 0.38;
			const radius = 5.48
				+ (normalizedPhase - 0.5) * 0.18
				+ radialWave * 0.12;
			position.set(
				Math.cos(angle) * radius * 1.24,
				Math.sin(angle) * radius,
				-depth,
			);
			const localTwist = (normalizedPhase - 0.5) * 0.1
				+ Math.sin(row * 0.47 + column * 1.31) * 0.035;
			euler.set(
				(normalizedPhase - 0.5) * 0.1,
				Math.sin(row * 0.37 + column) * 0.075,
				angle - Math.PI * 0.5 + localTwist,
			);
			quaternion.setFromEuler(euler);
			quaternion.multiply(plateQuarterTurn);
			scale.set(1.52, 0.48, 1.68);
			matrix.compose(position, quaternion, scale);
			mesh.setMatrixAt(index, matrix);
			phases[index] = normalizedPhase;
			colorMix[index] = clamp01(
				column / (TUNNEL_COLUMNS - 1) * 0.7
				+ normalizedPhase * 0.22,
			);
			edgeStrengths[index] = 0.56 + normalizedPhase * 0.36;
			faceLevels[index] = 0.18 + normalizedPhase * 0.06;
			radialDirections[index * 2] = Math.cos(angle);
			radialDirections[index * 2 + 1] = Math.sin(angle);
			index += 1;
		}
	}
	mesh.instanceMatrix.needsUpdate = true;
	geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
	geometry.setAttribute("aColorMix", new THREE.InstancedBufferAttribute(colorMix, 1));
	geometry.setAttribute("aEdgeStrength", new THREE.InstancedBufferAttribute(edgeStrengths, 1));
	geometry.setAttribute("aFaceLevel", new THREE.InstancedBufferAttribute(faceLevels, 1));
	geometry.setAttribute(
		"aRadialDirection",
		new THREE.InstancedBufferAttribute(radialDirections, 2),
	);
	disposables.push(geometry, mesh.material);
	return mesh;
}

function createMainTrailGeometry() {
	const verticesPerTrail = (MAIN_TRAIL_SEGMENTS + 1) * 2;
	const vertexCount = MAIN_TRAIL_COUNT * verticesPerTrail;
	const positions = new Float32Array(vertexCount * 3);
	const tValues = new Float32Array(vertexCount);
	const sides = new Float32Array(vertexCount);
	const phases = new Float32Array(vertexCount);
	const hues = new Float32Array(vertexCount);
	const widths = new Float32Array(vertexCount);
	const trailIndices = new Float32Array(vertexCount);
	const indices = new Uint32Array(
		MAIN_TRAIL_COUNT * MAIN_TRAIL_SEGMENTS * 6,
	);
	let vertexIndex = 0;
	let indexIndex = 0;

	for (let trail = 0; trail < MAIN_TRAIL_COUNT; trail += 1) {
		const phase = (trail * 0.173 + 0.11) % 1;
		const hue = trail / Math.max(1, MAIN_TRAIL_COUNT - 1);
		const width = 0.0085 + (trail % 4) * 0.0011;
		const trailStart = vertexIndex;
		for (let segment = 0; segment <= MAIN_TRAIL_SEGMENTS; segment += 1) {
			const t = segment / MAIN_TRAIL_SEGMENTS;
			for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
				const offset = vertexIndex * 3;
				positions[offset] = 0;
				positions[offset + 1] = 0;
				positions[offset + 2] = 0;
				tValues[vertexIndex] = t;
				sides[vertexIndex] = sideIndex === 0 ? -1 : 1;
				phases[vertexIndex] = phase;
				hues[vertexIndex] = hue;
				widths[vertexIndex] = width;
				trailIndices[vertexIndex] = trail;
				vertexIndex += 1;
			}
		}
		for (let segment = 0; segment < MAIN_TRAIL_SEGMENTS; segment += 1) {
			const a = trailStart + segment * 2;
			const b = a + 1;
			const c = a + 2;
			const d = a + 3;
			indices[indexIndex++] = a;
			indices[indexIndex++] = c;
			indices[indexIndex++] = b;
			indices[indexIndex++] = c;
			indices[indexIndex++] = d;
			indices[indexIndex++] = b;
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
	geometry.setAttribute("aSide", new THREE.BufferAttribute(sides, 1));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aHue", new THREE.BufferAttribute(hues, 1));
	geometry.setAttribute("aWidth", new THREE.BufferAttribute(widths, 1));
	geometry.setAttribute("aTrailIndex", new THREE.BufferAttribute(trailIndices, 1));
	geometry.setIndex(new THREE.BufferAttribute(indices, 1));
	geometry.computeBoundingSphere();
	return geometry;
}

function createTrailChainTexture(data) {
	const texture = new THREE.DataTexture(
		data,
		TRAIL_CHAIN_POINT_COUNT,
		MAIN_TRAIL_COUNT,
		THREE.RGBAFormat,
		THREE.FloatType,
	);
	texture.name = "capability-light-trails-chain-map";
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function createMainTrailMaterial(heads, chainTexture, { glow = false } = {}) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uReveal: { value: 0 },
			uWidthScale: { value: glow ? 3.65 : 1 },
			uGlowLayer: { value: glow ? 1 : 0 },
			uChainMap: { value: chainTexture },
			uHeads: { value: heads },
			uColorA: { value: new THREE.Color(0xd9f8ff) },
			uColorB: { value: new THREE.Color(0x82dcff) },
		},
		vertexShader: mainTrailVertexShader,
		fragmentShader: mainTrailFragmentShader,
		transparent: glow,
		blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
		depthWrite: false,
		depthTest: false,
		side: THREE.FrontSide,
		toneMapped: false,
	});
}

function createMainTrails(disposables, heads, chainTexture) {
	const geometry = createMainTrailGeometry();
	const glowMaterial = createMainTrailMaterial(heads, chainTexture, { glow: true });
	const coreMaterial = createMainTrailMaterial(heads, chainTexture);
	const glow = new THREE.Mesh(geometry, glowMaterial);
	const core = new THREE.Mesh(geometry, coreMaterial);
	glow.name = "capability-light-trails-glow";
	core.name = "capability-light-trails-core";
	glow.frustumCulled = false;
	core.frustumCulled = false;
	glow.renderOrder = 2;
	core.renderOrder = 3;
	disposables.push(geometry, glowMaterial, coreMaterial);
	return { glow, core, materials: [glowMaterial, coreMaterial] };
}

function createSecondaryTrailGeometry(random) {
	const verticesPerTrail = SECONDARY_TRAIL_SEGMENTS * 2;
	const vertexCount = SECONDARY_TRAIL_COUNT * verticesPerTrail;
	const positions = new Float32Array(vertexCount * 3);
	const tValues = new Float32Array(vertexCount);
	const phases = new Float32Array(vertexCount);
	const hues = new Float32Array(vertexCount);
	const speeds = new Float32Array(vertexCount);
	let vertexIndex = 0;

	for (let trail = 0; trail < SECONDARY_TRAIL_COUNT; trail += 1) {
		const depth = 7 + random() * 19;
		const halfHeight = (depth + CAMERA_POSITION.z) * 0.49;
		const halfWidth = halfHeight * 1.78;
		const startX = -halfWidth + random() * halfWidth * 1.65;
		const startY = -halfHeight + random() * halfHeight * 1.78;
		const startZ = -depth;
		const endX = startX + halfWidth * (0.14 + random() * 0.22);
		const endY = startY + halfHeight * (0.08 + random() * 0.2);
		const endZ = startZ - 1.5 - random() * 4;
		const phase = random();
		const hue = random();
		const speed = 0.075 + random() * 0.14;
		const curveX = (random() - 0.5) * 0.42;
		const curveY = (random() - 0.5) * 0.32;

		for (let segment = 0; segment < SECONDARY_TRAIL_SEGMENTS; segment += 1) {
			for (let endpoint = 0; endpoint < 2; endpoint += 1) {
				const t = (segment + endpoint) / SECONDARY_TRAIL_SEGMENTS;
				const curveEnvelope = Math.sin(t * Math.PI);
				const positionOffset = vertexIndex * 3;
				positions[positionOffset] = THREE.MathUtils.lerp(startX, endX, t) + curveX * curveEnvelope;
				positions[positionOffset + 1] = THREE.MathUtils.lerp(startY, endY, t) + curveY * curveEnvelope;
				positions[positionOffset + 2] = THREE.MathUtils.lerp(startZ, endZ, t);
				tValues[vertexIndex] = t;
				phases[vertexIndex] = phase;
				hues[vertexIndex] = hue;
				speeds[vertexIndex] = speed;
				vertexIndex += 1;
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aHue", new THREE.BufferAttribute(hues, 1));
	geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
	geometry.computeBoundingSphere();
	return geometry;
}

function createSecondaryTrails(disposables, random) {
	const geometry = createSecondaryTrailGeometry(random);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uReveal: { value: 0 },
			uPointer: { value: new THREE.Vector2() },
			uColorA: { value: new THREE.Color(0x20cfff) },
			uColorB: { value: new THREE.Color(0x9c36ff) },
		},
		vertexShader: secondaryTrailVertexShader,
		fragmentShader: secondaryTrailFragmentShader,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: false,
		toneMapped: false,
	});
	const mesh = new THREE.LineSegments(geometry, material);
	mesh.name = "capability-light-trails-secondary-field";
	mesh.frustumCulled = false;
	mesh.renderOrder = 2;
	disposables.push(geometry, material);
	return { mesh, material };
}

export class InfiniteLightTrailsWorld {
	constructor(scene, inputElement = null) {
		this.group = new THREE.Group();
		this.group.name = "capability-light-trails-world";
		this.disposables = [];
		this.elapsed = 0;
		this.travel = 0;
		this.reveal = 0;
		this.renderEnabled = false;
		this.pointer = new THREE.Vector2();
		this.cameraPointer = new THREE.Vector2();
		this.pointerTarget = new THREE.Vector2();
		this.cameraBank = 0;
		this.cameraBankTarget = 0;
		this._pointerWasDown = false;
		this._clickSpinElapsed = -1;
		this._clickSpinDuration = 1.55;
		this._clickSpinDirection = 1;
		this._clickSpinAngle = 0;
		this.trailChains = Array.from(
			{ length: MAIN_TRAIL_COUNT },
			() => Array.from(
				{ length: TRAIL_CHAIN_POINT_COUNT },
				() => new THREE.Vector2(),
			),
		);
		this.trailChainData = new Float32Array(
			TRAIL_CHAIN_POINT_COUNT * MAIN_TRAIL_COUNT * 4,
		);
		this.trailChainTexture = createTrailChainTexture(this.trailChainData);
		this.trailMouseOffsets = Array.from(
			{ length: MAIN_TRAIL_COUNT },
			() => new THREE.Vector2(),
		);
		this.trailTargets = Array.from(
			{ length: MAIN_TRAIL_COUNT },
			() => new THREE.Vector2(),
		);
		this.trailTargetHistories = Array.from(
			{ length: MAIN_TRAIL_COUNT },
			() => ({
				positions: new Float32Array(TRAIL_TARGET_HISTORY_LENGTH * 2),
				times: new Float32Array(TRAIL_TARGET_HISTORY_LENGTH),
				writeIndex: -1,
				count: 0,
			}),
		);
		// The reference uses a different mouse interpolation per strand. These
		// rates are the frame-rate-independent equivalents of that behaviour.
		this.trailMouseResponses = [1.21, 2.01, 2.89, 3.78, 4.61, 5.46, 6.32];
		this.trailMouseScales = [0.96, 1.04, 0.9, 1.1, 0.94, 1.07, 0.99];
		this.trailFollowScales = [0.92, 1.04, 0.86, 1.1, 0.96, 1.07, 0.9];
		this.trailTimeOffsets = [0.35, 1.28, 2.14, 3.07, 4.02, 4.96, 5.81];
		this.trailHeads = new Float32Array(MAIN_TRAIL_COUNT);
		this.trailHeadTargets = new Float32Array(MAIN_TRAIL_COUNT);
		this.trailHeadSpeeds = new Float32Array(MAIN_TRAIL_COUNT);
		this._trailLeader = 0;
		this._trailChaseElapsed = 0;
		this._trailNextChaseAt = 3.2;
		this._randomState = 0x7f4a7c15;
		this._warming = false;
		this._cameraLiveQuaternion = new THREE.Quaternion();
		this._cameraLivePosition = new THREE.Vector3();
		this._cameraLiveLookAt = new THREE.Vector3();
		this._cameraTargetMatrix = new THREE.Matrix4();
		this._cameraUp = new THREE.Vector3(0, 1, 0);
		this._cameraBankQuaternion = new THREE.Quaternion();
		this._cameraLocalForward = new THREE.Vector3(0, 0, -1);
		this.inputElement = inputElement;
		this._onPointerDown = () => {
			if (!this.renderEnabled) return;
			this._pointerWasDown = true;
			this._triggerClickSpin();
		};
		this.inputElement?.addEventListener("pointerdown", this._onPointerDown);

		const initialHeads = [0.74, 0.63, 0.79, 0.68, 0.72, 0.66, 0.77];
		for (let index = 0; index < MAIN_TRAIL_COUNT; index += 1) {
			const head = initialHeads[index];
			this.trailHeads[index] = head;
			this.trailHeadTargets[index] = head;
			this.trailHeadSpeeds[index] = 0.58 + index * 0.07;
		}

		this.environment = createEnvironment(this.disposables);
		this.secondaryTrails = createSecondaryTrails(this.disposables, () => this._random());
		this.trails = createMainTrails(
			this.disposables,
			this.trailHeads,
			this.trailChainTexture,
		);
		this.disposables.push(this.trailChainTexture);
		this.group.add(
			this.environment,
			this.secondaryTrails.mesh,
			this.trails.glow,
			this.trails.core,
		);
		scene.add(this.group);
		this.setReveal(0);
	}

	setReveal(value) {
		this.reveal = smooth01(value);
		this.environment.material.uniforms.uReveal.value = this.reveal;
		this.secondaryTrails.material.uniforms.uReveal.value = this.reveal;
		for (const material of this.trails.materials) material.uniforms.uReveal.value = this.reveal;
		this.group.visible = this._warming || (this.renderEnabled && this.reveal > 0.001);
	}

	setRenderEnabled(enabled) {
		this.renderEnabled = Boolean(enabled);
		if (!this.renderEnabled) {
			this._pointerWasDown = false;
			this._clickSpinElapsed = -1;
			this._clickSpinAngle = 0;
			this.cameraBank = 0;
			this.cameraBankTarget = 0;
			for (const history of this.trailTargetHistories) {
				history.writeIndex = -1;
				history.count = 0;
			}
		}
		this.group.visible = this._warming || (this.renderEnabled && this.reveal > 0.001);
	}

	_random() {
		this._randomState = (Math.imul(this._randomState, 1664525) + 1013904223) >>> 0;
		return this._randomState / 4294967296;
	}

	_triggerClickSpin() {
		// A second pointer press must not restart, reverse or shorten the turn
		// already in flight. It is accepted only after the current orbit settles.
		if (this._clickSpinElapsed >= 0) return false;
		this._clickSpinElapsed = 0;
		this._clickSpinDirection = this._random() > 0.5 ? 1 : -1;
		return true;
	}

	_updateClickSpin(dt) {
		if (this._clickSpinElapsed < 0) {
			this._clickSpinAngle = 0;
			return;
		}
		this._clickSpinElapsed += dt;
		const progress = clamp01(this._clickSpinElapsed / this._clickSpinDuration);
		this._clickSpinAngle = sineInOut(progress)
			* Math.PI * 2
			* this._clickSpinDirection;
		if (progress >= 1) {
			this._clickSpinElapsed = -1;
			this._clickSpinAngle = 0;
		}
	}

	_recordTrailTarget(trailIndex, target) {
		const history = this.trailTargetHistories[trailIndex];
		if (history.count === 0) {
			const historyStep = TRAIL_TAIL_DELAY_SECONDS
				/ Math.max(1, TRAIL_TARGET_HISTORY_LENGTH - 1);
			for (let index = 0; index < TRAIL_TARGET_HISTORY_LENGTH; index += 1) {
				const offset = index * 2;
				history.positions[offset] = target.x;
				history.positions[offset + 1] = target.y;
				history.times[index] = this.elapsed
					- (TRAIL_TARGET_HISTORY_LENGTH - 1 - index) * historyStep;
			}
			history.writeIndex = TRAIL_TARGET_HISTORY_LENGTH - 1;
			history.count = TRAIL_TARGET_HISTORY_LENGTH;
			return;
		}

		history.writeIndex = (history.writeIndex + 1) % TRAIL_TARGET_HISTORY_LENGTH;
		const offset = history.writeIndex * 2;
		history.positions[offset] = target.x;
		history.positions[offset + 1] = target.y;
		history.times[history.writeIndex] = this.elapsed;
	}

	_sampleTrailTargetHistory(trailIndex, delaySeconds, out) {
		const history = this.trailTargetHistories[trailIndex];
		const desiredTime = this.elapsed - Math.max(0, delaySeconds);
		let newerIndex = history.writeIndex;
		let newerTime = history.times[newerIndex];

		for (let step = 1; step < history.count; step += 1) {
			const olderIndex = (
				newerIndex - 1 + TRAIL_TARGET_HISTORY_LENGTH
			) % TRAIL_TARGET_HISTORY_LENGTH;
			const olderTime = history.times[olderIndex];
			if (olderTime <= desiredTime) {
				const duration = Math.max(0.000001, newerTime - olderTime);
				const mix = clamp01((desiredTime - olderTime) / duration);
				const olderOffset = olderIndex * 2;
				const newerOffset = newerIndex * 2;
				out.set(
					THREE.MathUtils.lerp(
						history.positions[olderOffset],
						history.positions[newerOffset],
						mix,
					),
					THREE.MathUtils.lerp(
						history.positions[olderOffset + 1],
						history.positions[newerOffset + 1],
						mix,
					),
				);
				return;
			}
			newerIndex = olderIndex;
			newerTime = olderTime;
		}

		const oldestOffset = newerIndex * 2;
		out.set(
			history.positions[oldestOffset],
			history.positions[oldestOffset + 1],
		);
	}

	_updateTrailChains(dt) {
		const lastPointIndex = TRAIL_CHAIN_POINT_COUNT - 1;
		for (let trailIndex = 0; trailIndex < MAIN_TRAIL_COUNT; trailIndex += 1) {
			const mouseOffset = this.trailMouseOffsets[trailIndex];
			const mouseScale = this.trailMouseScales[trailIndex];
			mouseOffset.x = THREE.MathUtils.damp(
				mouseOffset.x,
				this.pointerTarget.x * 0.68 * mouseScale,
				this.trailMouseResponses[trailIndex],
				dt,
			);
			mouseOffset.y = THREE.MathUtils.damp(
				mouseOffset.y,
				this.pointerTarget.y * 0.52 * mouseScale,
				this.trailMouseResponses[trailIndex],
				dt,
			);

			const lineTime = this.elapsed * 1.44 + this.trailTimeOffsets[trailIndex];
			const noiseTime = this.elapsed * 0.1;
			const noiseX = valueNoise2D(
				noiseTime + trailIndex * 11.37,
				noiseTime + trailIndex * 7.13,
			);
			const noiseY = valueNoise2D(
				1337 + this.elapsed * 0.05 + trailIndex * 5.71,
				7331 + this.elapsed * 0.05 + trailIndex * 9.43,
			);
			const targetX = mouseOffset.x
				+ Math.sin(lineTime) * 0.064
				+ noiseX * 0.115;
			const targetY = mouseOffset.y
				+ Math.cos(lineTime) * 0.046
				+ noiseY * 0.042;
			const spinCos = Math.cos(this._clickSpinAngle);
			const spinSin = Math.sin(this._clickSpinAngle);
			// Rotate the live target and add a closed, explicit orbit. The latter
			// guarantees a visibly complete circle even while the cursor is near the
			// neutral center and the organic target amplitude is otherwise tiny.
			const orbitRadius = 0.44;
			const orbitX = (spinCos - 1) * orbitRadius;
			const orbitY = spinSin * orbitRadius;
			const target = this.trailTargets[trailIndex];
			target.set(
				targetX * spinCos - targetY * spinSin + orbitX,
				targetX * spinSin + targetY * spinCos + orbitY,
			);

			const chain = this.trailChains[trailIndex];
			this._recordTrailTarget(trailIndex, target);
			// Every point samples the same target history at a progressively older
			// time. The tip moves first; the base repeats that exact cursor/orbit path
			// later instead of losing it through dozens of low-pass filters.
			for (let pointIndex = 0; pointIndex <= lastPointIndex; pointIndex += 1) {
				const distanceFromTip = (lastPointIndex - pointIndex) / lastPointIndex;
				const delay = Math.pow(distanceFromTip, 0.68)
					* TRAIL_TAIL_DELAY_SECONDS
					/ this.trailFollowScales[trailIndex];
				this._sampleTrailTargetHistory(
					trailIndex,
					delay,
					chain[pointIndex],
				);
			}

			for (let pointIndex = 0; pointIndex < TRAIL_CHAIN_POINT_COUNT; pointIndex += 1) {
				const dataOffset = (
					trailIndex * TRAIL_CHAIN_POINT_COUNT + pointIndex
				) * 4;
				this.trailChainData[dataOffset] = chain[pointIndex].x;
				this.trailChainData[dataOffset + 1] = chain[pointIndex].y;
				this.trailChainData[dataOffset + 2] = 0;
				this.trailChainData[dataOffset + 3] = 1;
			}
		}
		this.trailChainTexture.needsUpdate = true;
	}

	_selectNextTrailLeader() {
		const previousLeader = this._trailLeader;
		let nextLeader = previousLeader;
		while (nextLeader === previousLeader) {
			nextLeader = Math.floor(this._random() * MAIN_TRAIL_COUNT);
		}
		this._trailLeader = nextLeader;
		for (let index = 0; index < MAIN_TRAIL_COUNT; index += 1) {
			this.trailHeadTargets[index] = 0.57 + this._random() * 0.21;
			this.trailHeadSpeeds[index] = 0.34 + this._random() * 0.34;
		}
		this.trailHeadTargets[previousLeader] = 0.62 + this._random() * 0.1;
		this.trailHeadSpeeds[previousLeader] = 0.42 + this._random() * 0.16;
		this.trailHeadTargets[nextLeader] = 0.8 + this._random() * 0.08;
		this.trailHeadSpeeds[nextLeader] = 0.48 + this._random() * 0.22;
		this._trailNextChaseAt = 1.1 + this._random() * 2.0;
	}

	_updateTrailChase(dt) {
		this._trailChaseElapsed += dt;
		if (this._trailChaseElapsed >= this._trailNextChaseAt) {
			this._trailChaseElapsed = 0;
			this._selectNextTrailLeader();
		}
		for (let index = 0; index < MAIN_TRAIL_COUNT; index += 1) {
			this.trailHeads[index] = THREE.MathUtils.damp(
				this.trailHeads[index],
				this.trailHeadTargets[index],
				this.trailHeadSpeeds[index],
				dt,
			);
		}
	}

	update(delta, frame, reveal) {
		this.setReveal(reveal);
		if (!this.group.visible && !this._warming) return;
		const dt = Math.max(0, Math.min(delta, 0.05));
		this.elapsed += dt;
		this.travel = (this.travel + dt * 8.4) % TUNNEL_LENGTH;
		const pointer = frame?.visualPointer ?? frame?.pointer ?? { x: 0, y: 0 };
		this.pointerTarget.set(
			THREE.MathUtils.clamp(pointer.x ?? 0, -1, 1),
			THREE.MathUtils.clamp(pointer.y ?? 0, -1, 1),
		);
		const pointerDown = Boolean(frame?.pointerDown);
		if (pointerDown && !this._pointerWasDown && this.renderEnabled) {
			this._triggerClickSpin();
		}
		this._pointerWasDown = pointerDown;
		this._updateClickSpin(dt);
		this._updateTrailChains(dt);
		this.pointer.x = THREE.MathUtils.damp(this.pointer.x, this.pointerTarget.x, 7.6, dt);
		this.pointer.y = THREE.MathUtils.damp(this.pointer.y, this.pointerTarget.y, 7.6, dt);
		this.cameraPointer.x = THREE.MathUtils.damp(
			this.cameraPointer.x,
			this.pointerTarget.x,
			4.2,
			dt,
		);
		this.cameraPointer.y = THREE.MathUtils.damp(
			this.cameraPointer.y,
			this.pointerTarget.y,
			4.2,
			dt,
		);
		this.cameraBankTarget = THREE.MathUtils.clamp(
			-this.pointerTarget.x * 0.045
				- (this.pointerTarget.x - this.cameraPointer.x) * 0.11,
			-0.12,
			0.12,
		);
		this.cameraBank = THREE.MathUtils.damp(
			this.cameraBank,
			this.cameraBankTarget,
			5.2,
			dt,
		);
		this._updateTrailChase(dt);

		this.environment.material.uniforms.uTime.value = this.elapsed;
		this.environment.material.uniforms.uTravel.value = this.travel;
		this.secondaryTrails.material.uniforms.uTime.value = this.elapsed;
		this.secondaryTrails.material.uniforms.uPointer.value.copy(this.pointer);
		for (const material of this.trails.materials) {
			material.uniforms.uTime.value = this.elapsed;
		}
	}

	applyCamera(camera, blend) {
		const eased = smooth01(blend);
		this._cameraLivePosition.set(
			CAMERA_POSITION.x + this.cameraPointer.x * 0.28,
			CAMERA_POSITION.y + this.cameraPointer.y * 0.15,
			CAMERA_POSITION.z,
		);
		this._cameraLiveLookAt.set(
			CAMERA_LOOK_AT.x + this.cameraPointer.x * 5.4,
			CAMERA_LOOK_AT.y + this.cameraPointer.y * 3.2,
			CAMERA_LOOK_AT.z,
		);
		this._cameraTargetMatrix.lookAt(
			this._cameraLivePosition,
			this._cameraLiveLookAt,
			this._cameraUp,
		);
		this._cameraLiveQuaternion.setFromRotationMatrix(this._cameraTargetMatrix);
		this._cameraBankQuaternion.setFromAxisAngle(
			this._cameraLocalForward,
			this.cameraBank,
		);
		this._cameraLiveQuaternion.multiply(this._cameraBankQuaternion);
		camera.position.lerp(this._cameraLivePosition, eased);
		camera.quaternion.slerp(this._cameraLiveQuaternion, eased);
		camera.fov = THREE.MathUtils.lerp(camera.fov, CAMERA_FOV, eased);
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
	}

	beginWarmupDraw() {
		this._warming = true;
		this.group.visible = true;
		this.setReveal(0.01);
	}

	endWarmupDraw() {
		this._warming = false;
		this.setReveal(this.reveal);
	}

	dispose(scene) {
		this.inputElement?.removeEventListener("pointerdown", this._onPointerDown);
		scene?.remove(this.group);
		for (const disposable of this.disposables) disposable?.dispose?.();
		this.disposables = [];
		this.group.clear();
	}
}

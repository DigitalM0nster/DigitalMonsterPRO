import * as THREE from "three";
import { captureSourceToCanvas } from "./captureSourceToCanvas.js";

// WebGL2 / Three r155 — GLSL3, не texture2D
const vertexShader = `
precision highp float;
uniform float uTime;
uniform vec2 uMouse;
uniform float uStrength;
out vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  float wave = sin(pos.x * 4.0 + uTime * 2.0) * uStrength;
  float ripple = sin(length(uv - uMouse) * 22.0 - uTime * 4.0) * uStrength * 0.85;
  pos.z += wave + ripple;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform sampler2D uMap;
uniform float uTime;
uniform float uStrength;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 12.0 + uTime * 2.5) * uStrength * 0.15;
  uv.y += cos(uv.x * 10.0 + uTime * 2.0) * uStrength * 0.08;
  vec4 color = texture(uMap, uv);
  if (color.a < 0.05) discard;
  fragColor = color;
}
`;

/**
 * Референс-сцена: DOM (overlay) → captureSourceToCanvas → plane + shader.
 * Один WebGL canvas поверх HTML-источника.
 * @param {{ canvas: HTMLCanvasElement, sourceElement: HTMLElement, onReady?: () => void, onError?: (err: unknown) => void }} options
 */
export function createDomDistortScene(options) {
	const { canvas, sourceElement, onReady, onError } = options;

	let renderer;
	let scene;
	let camera;
	let mesh;
	let texture;
	let animationId = 0;
	let resizeObserver;
	let resizeTimer;
	let onWindowResize;

	const mouseUv = new THREE.Vector2(0.5, 0.5);
	const uniforms = {
		uMap: { value: null },
		uTime: { value: 0 },
		uMouse: { value: mouseUv },
		uStrength: { value: 0.28 },
	};

	function fitRendererSize() {
		const parent = canvas.parentElement;
		if (!parent || !renderer) return;

		const width = Math.max(1, parent.clientWidth);
		const height = Math.max(1, parent.clientHeight);

		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

	function fitPlaneToViewport() {
		if (!mesh || !camera) return;

		const parent = canvas.parentElement;
		if (!parent) return;

		const vFov = (camera.fov * Math.PI) / 180;
		const dist = camera.position.z;
		const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
		const visibleWidth = visibleHeight * camera.aspect;

		mesh.scale.set(visibleWidth * 0.92, visibleHeight * 0.72, 1);
	}

	async function captureTexture() {
		await new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(resolve));
		});

		const snapshot = captureSourceToCanvas(sourceElement);

		if (snapshot.width < 2 || snapshot.height < 2) {
			throw new Error("captureSourceToCanvas: пустой снимок");
		}

		if (texture) texture.dispose();

		texture = new THREE.CanvasTexture(snapshot);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.premultiplyAlpha = false;
		texture.needsUpdate = true;
		uniforms.uMap.value = texture;
		fitPlaneToViewport();
		onReady?.();
	}

	function onPointerMove(event) {
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0) return;
		mouseUv.x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
		mouseUv.y = THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
	}

	function animate(timeMs) {
		uniforms.uTime.value = timeMs * 0.001;
		if (uniforms.uMap.value) {
			renderer.render(scene, camera);
		}
		animationId = requestAnimationFrame(animate);
	}

	function init() {
		renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: "high-performance",
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		renderer.outputColorSpace = THREE.SRGBColorSpace;

		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		camera.position.z = 4.5;

		const geometry = new THREE.PlaneGeometry(1, 1, 64, 32);
		const material = new THREE.ShaderMaterial({
			uniforms,
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			glslVersion: THREE.GLSL3,
		});

		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		fitRendererSize();
		canvas.addEventListener("pointermove", onPointerMove);

		if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
			resizeObserver = new ResizeObserver(() => {
				fitRendererSize();
				fitPlaneToViewport();
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => {
					captureTexture().catch((err) => onError?.(err));
				}, 300);
			});
			resizeObserver.observe(canvas.parentElement);
		}

		onWindowResize = () => {
			fitRendererSize();
			fitPlaneToViewport();
		};
		window.addEventListener("resize", onWindowResize);

		captureTexture()
			.then(() => {
				if (!animationId) {
					animationId = requestAnimationFrame(animate);
				}
			})
			.catch((err) => {
				console.error("[createDomDistortScene]", err);
				onError?.(err);
			});

		animationId = requestAnimationFrame(animate);
	}

	init();

	return {
		recapture: captureTexture,
		dispose() {
			cancelAnimationFrame(animationId);
			animationId = 0;
			clearTimeout(resizeTimer);
			canvas.removeEventListener("pointermove", onPointerMove);
			if (onWindowResize) {
				window.removeEventListener("resize", onWindowResize);
			}
			resizeObserver?.disconnect();

			if (texture) texture.dispose();
			mesh?.geometry?.dispose();
			mesh?.material?.dispose();
			renderer?.dispose();
		},
	};
}

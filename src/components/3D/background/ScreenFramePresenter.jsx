import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePresentModelsFrameRef } from "@/context/PresentModelsFrameContext.jsx";
import { applyScreenTextureColorSpace, blitTextureToScreen } from "./unifiedComposerRender.js";

const bgScene = new THREE.Scene();
const modelsScene = new THREE.Scene();
const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * После RT фона (-15) и RT моделей (1) — один compositor на экран.
 * priority 500: ничего не успевает затереть фон до финального кадра.
 */
export default function ScreenFramePresenter({ backgroundFrameRef }) {
	const { gl } = useThree();
	const modelsFrameRef = usePresentModelsFrameRef();

	const bgMesh = useMemo(() => {
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			new THREE.MeshBasicMaterial({
				depthTest: false,
				depthWrite: false,
				toneMapped: true,
			}),
		);
		bgScene.add(mesh);
		return mesh;
	}, []);

	const modelsMesh = useMemo(() => {
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			new THREE.MeshBasicMaterial({
				transparent: true,
				depthTest: false,
				depthWrite: false,
				toneMapped: true,
			}),
		);
		modelsScene.add(mesh);
		return mesh;
	}, []);

	useFrame(() => {
		const bgTexture = backgroundFrameRef?.current;
		const modelsTexture = modelsFrameRef?.current;
		const prevTarget = gl.getRenderTarget();

		gl.setRenderTarget(null);

		if (bgTexture) {
			blitTextureToScreen(gl, bgTexture, bgScene, screenCamera, bgMesh);
		} else {
			gl.autoClear = true;
			gl.setClearColor(0x000000, 1);
			gl.clear(true, true, true);
		}

		if (modelsTexture) {
			applyScreenTextureColorSpace(modelsTexture, gl);
			const modelsMat = modelsMesh.material;
			if (modelsMat.map !== modelsTexture) {
				modelsMat.map = modelsTexture;
				modelsMat.needsUpdate = true;
			}
			gl.autoClear = false;
			gl.clear(false, true, false);
			gl.render(modelsScene, screenCamera);
		}

		gl.setRenderTarget(prevTarget);
		gl.autoClear = false;
	}, 500);

	return null;
}

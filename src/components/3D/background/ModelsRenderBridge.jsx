import { useMemo, useRef } from "react";
import { createPortal } from "@react-three/fiber";
import * as THREE from "three";
import { ModelsRenderContext } from "@/context/ModelsRenderContext.jsx";
import { PresentModelsFrameContext } from "@/context/PresentModelsFrameContext.jsx";
import UnifiedBackgroundLayer from "./UnifiedBackgroundLayer.jsx";

/**
 * Модели в отдельной Scene (portal) — телепорт/blur/bloom не трогают liquid-фон.
 */
export default function ModelsRenderBridge({ currentPage, models }) {
	const modelsScene = useMemo(() => new THREE.Scene(), []);
	const modelsFrameRef = useRef(null);

	return (
		<ModelsRenderContext.Provider value={modelsScene}>
			<PresentModelsFrameContext.Provider value={modelsFrameRef}>
				<UnifiedBackgroundLayer currentPage={currentPage} />
				{createPortal(models, modelsScene)}
			</PresentModelsFrameContext.Provider>
		</ModelsRenderContext.Provider>
	);
}

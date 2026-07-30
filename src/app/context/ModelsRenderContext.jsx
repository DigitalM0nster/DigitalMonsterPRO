import { createContext, useContext } from "react";

/** Сцена только с моделями (portal) для EffectComposer. */
export const ModelsRenderContext = createContext(null);

export function useModelsRenderScene() {
	return useContext(ModelsRenderContext);
}

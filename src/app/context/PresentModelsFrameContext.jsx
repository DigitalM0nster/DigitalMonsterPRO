import { createContext, useContext } from "react";

/** Текстура кадра моделей после постобработки. */
export const PresentModelsFrameContext = createContext(null);

export function usePresentModelsFrameRef() {
	return useContext(PresentModelsFrameContext);
}

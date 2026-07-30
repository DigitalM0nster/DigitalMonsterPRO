import { useEffect, useRef } from "react";
import BackgroundComposerRT from "./BackgroundComposerRT.jsx";
import ScreenFramePresenter from "./ScreenFramePresenter.jsx";

/**
 * -15: liquid → RT
 * 1: модели → RT (EffectComposerComponent)
 * 500: ScreenFramePresenter — фон + overlay на экран
 */
export default function UnifiedBackgroundLayer({ currentPage }) {
	const backgroundFrameRef = useRef(null);

	useEffect(() => {
		if (import.meta.env.DEV) {
			console.info("[canvas] фон RT → presenter (500) → overlay моделей");
		}
	}, []);

	return (
		<>
			<BackgroundComposerRT currentPage={currentPage} textureRef={backgroundFrameRef} />
			<ScreenFramePresenter backgroundFrameRef={backgroundFrameRef} />
		</>
	);
}

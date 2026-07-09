/**
 * @deprecated Не используется. Старый R3F-мост до миграции на scenes/.
 * Можно удалить после полного переноса моделей.
 */
import { useFrame } from "@react-three/fiber";
import { createPortal } from "@react-three/fiber";
import CanvasRoutes from "@/components/Routes/CanvasRoutes.jsx";
import { ModelsRenderContext } from "@/context/ModelsRenderContext.jsx";
import { PresentModelsFrameContext } from "@/context/PresentModelsFrameContext.jsx";
import { RouteTransitionProvider } from "@/context/RouteTransitionContext.jsx";

function R3fFrameLock() {
	useFrame(() => {}, 10_000);
	return null;
}

export default function R3FModelsBridge({
	modelsScene,
	modelsFrameRef,
	routeTransition,
	canvasProps,
}) {
	return (
		<RouteTransitionProvider value={routeTransition}>
			<ModelsRenderContext.Provider value={modelsScene}>
				<PresentModelsFrameContext.Provider value={modelsFrameRef}>
					<R3fFrameLock />
					{createPortal(
						<CanvasRoutes
							startApp={canvasProps.startApp}
							rendered={canvasProps.rendered}
							setRendered={canvasProps.setRendered}
							currentPage={canvasProps.currentPage}
							teleportPage={canvasProps.teleportPage}
						/>,
						modelsScene,
					)}
				</PresentModelsFrameContext.Provider>
			</ModelsRenderContext.Provider>
		</RouteTransitionProvider>
	);
}

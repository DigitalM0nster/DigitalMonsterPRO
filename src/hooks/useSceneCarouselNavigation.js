import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";

function normalizePath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
}

/** Scroll-карусель: коммит сцены → navigate (3D-переход уже на экране). */
export function useSceneCarouselNavigation() {
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		return subscribeKey(store, "sceneCarouselNavigatePath", (path) => {
			if (!path) {
				return;
			}

			const requestedPath = path;
			const clearHandledPath = () => {
				queueMicrotask(() => {
					if (store.sceneCarouselNavigatePath === requestedPath) {
						store.sceneCarouselNavigatePath = null;
					}
				});
			};

			if (normalizePath(location.pathname) === normalizePath(path)) {
				store.sceneCarouselSkipHtmlExit = false;
				clearHandledPath();
				return;
			}

			navigate(path);
			clearHandledPath();
		});
	}, [navigate, location.pathname]);
}

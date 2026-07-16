import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import MainContent from "./components/MainContent.jsx";

if (window.__loaderBootstrapTimer) {
	clearInterval(window.__loaderBootstrapTimer);
	window.__loaderBootstrapTimer = null;
}
if (window.__loaderBootstrapRaf) {
	cancelAnimationFrame(window.__loaderBootstrapRaf);
	window.__loaderBootstrapRaf = 0;
}
window.__loaderBootstrapObserver?.disconnect();
window.__loaderBootstrapObserver = null;

const root = createRoot(document.querySelector("#root"));
root.render(
	<BrowserRouter
		future={{
			v7_startTransition: true,
			v7_relativeSplatPath: true,
		}}
	>
		<MainContent />
	</BrowserRouter>,
);

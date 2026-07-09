import { useEffect } from "react";
import { useStore } from "@/store.jsx";

/** HTML-слой хаба портфолио (/portfolio): список проектов — только в 3D HUD. */
export default function PortfolioHubContent() {
	const store = useStore();

	useEffect(() => {
		store.scroll = 0;
		store.openedCase = false;
	}, [store]);

	return <div className="portfolioHub" />;
}

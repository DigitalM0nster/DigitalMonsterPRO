import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePageStateClasses } from "@/context/RouteTransitionContext.jsx";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import MainPageButtonSelector from "../components/mainPage/MainPageButtonSelector.jsx";

export default function MainPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const pageClassName = usePageStateClasses("main");

	const openPortfolio = useCallback(() => {
		if (location.pathname === "/portfolio") {
			return;
		}
		if (requestHexNavigation("/portfolio", location.pathname)) {
			return;
		}
		navigate("/portfolio");
	}, [location.pathname, navigate]);

	return (
		<div className={pageClassName}>
			<MainPageButtonSelector onActivate={openPortfolio} />
		</div>
	);
}
import "@/css/main/mainTransition.scss";

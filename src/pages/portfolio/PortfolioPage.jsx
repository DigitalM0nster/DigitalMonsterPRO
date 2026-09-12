import { Navigate, useLocation } from "react-router-dom";
import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import { filmProjects } from "./data/filmProjects.js";
import { requestFilmAction } from "./filmInteraction.js";
import styles from "./PortfolioPage.module.scss";

/** Visible media, typography and controls belong to PortfolioFilmScene. */
export default function PortfolioPage() {
	const location = useLocation();
	const pageClass = usePageStateClasses("portfolio");
	if (location.pathname.replace(/\/+$/, "") !== "/portfolio") return <Navigate to="/portfolio" replace />;
	return (
		<section className={`${pageClass} ${styles.page}`} aria-label="Portfolio">
			<nav className={styles.accessibleControls} aria-label="Projects">
				<button onClick={() => requestFilmAction("projects")}>Избранные проекты</button>
				{filmProjects.map((project, index) => <button key={project.id} onClick={() => requestFilmAction(index)}>{project.name}</button>)}
				<button onClick={() => requestFilmAction("inspect")}>Рассмотреть / К обзору</button>
				<button onClick={() => requestFilmAction("play")}>Воспроизведение / Пауза</button>
				<button onClick={() => requestFilmAction("mute")}>Выключить / Включить звук видео</button>
				<button onClick={() => requestFilmAction("volume-down")}>Уменьшить громкость видео</button>
				<button onClick={() => requestFilmAction("volume-up")}>Увеличить громкость видео</button>
			</nav>
		</section>
	);
}

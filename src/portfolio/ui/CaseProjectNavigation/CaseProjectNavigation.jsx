import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useSnapshot } from "valtio";
import { getAllPortfolioProjects } from "@/portfolio/core/projectRegistry.js";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { requestPortfolioCaseNavigation } from "@/utils/portfolioHubNavigate.js";
import { store } from "@/store.jsx";
import styles from "./CaseProjectNavigation.module.scss";

const COPY = {
	ru: {
		all: "ВСЕ ПРОЕКТЫ",
		back: "вернуться к списку",
		previous: "ПРЕДЫДУЩИЙ ПРОЕКТ",
		next: "СЛЕДУЮЩИЙ ПРОЕКТ",
	},
	en: {
		all: "ALL PROJECTS",
		back: "return to the list",
		previous: "PREVIOUS PROJECT",
		next: "NEXT PROJECT",
	},
	zh: {
		all: "全部项目",
		back: "返回项目列表",
		previous: "上一个项目",
		next: "下一个项目",
	},
};

function NavigationNode({ direction }) {
	return (
		<span className={`${styles.node} ${styles[direction]}`} aria-hidden="true">
			<span className={styles.nodeOuter} />
			<span className={styles.nodeInner} />
			<span className={styles.nodeCore} />
			<span className={styles.nodeTick} />
		</span>
	);
}

export default function CaseProjectNavigation() {
	const { project } = usePortfolioProject();
	const { pathname } = useLocation();
	const locale = normalizeSiteLocale(useSnapshot(store).siteLocale);
	const copy = COPY[locale] ?? COPY.ru;

	const { previousProject, nextProject } = useMemo(() => {
		const projects = getAllPortfolioProjects();
		const index = projects.findIndex((item) => item.config.id === project.config.id);
		if (index < 0 || projects.length < 2) {
			return { previousProject: null, nextProject: null };
		}
		return {
			previousProject: projects[(index - 1 + projects.length) % projects.length],
			nextProject: projects[(index + 1) % projects.length],
		};
	}, [project.config.id]);

	const navigateTo = (targetPath) => {
		if (targetPath && targetPath !== pathname) {
			requestPortfolioCaseNavigation(targetPath, pathname);
		}
	};

	if (!previousProject || !nextProject) {
		return null;
	}

	const previousName = getPortfolioProjectName(previousProject.config.id, locale) || previousProject.config.title;
	const nextName = getPortfolioProjectName(nextProject.config.id, locale) || nextProject.config.title;

	return (
		<nav className={styles.navigation} aria-label={copy.all}>
			<button className={styles.allProjects} data-case-all-projects type="button" onClick={() => navigateTo("/portfolio")}>
				<span className={styles.allTitle}>{copy.all}</span>
				<span className={styles.allBottomRow}>
					<span className={styles.allSubtitle}>{copy.back}</span>
					<span className={styles.returnMarker} aria-hidden="true">
						<span className={styles.returnDot} />
						<span className={styles.returnLine} />
					</span>
				</span>
			</button>

			<div className={styles.projectSwitches}>
				<button className={`${styles.projectButton} ${styles.previousButton}`} type="button" onClick={() => navigateTo(previousProject.config.route)}>
					<span className={styles.projectText}>
						<span className={styles.projectDirection}>{copy.previous}</span>
						<span className={styles.projectName}>{previousName}</span>
					</span>
					<NavigationNode direction="previous" />
				</button>

				<button className={`${styles.projectButton} ${styles.nextButton}`} type="button" onClick={() => navigateTo(nextProject.config.route)}>
					<NavigationNode direction="next" />
					<span className={styles.projectText}>
						<span className={styles.projectDirection}>{copy.next}</span>
						<span className={styles.projectName}>{nextName}</span>
					</span>
				</button>
			</div>
		</nav>
	);
}

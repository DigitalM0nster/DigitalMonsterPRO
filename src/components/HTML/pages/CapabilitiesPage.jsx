import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CAPABILITIES, getCapabilityBySlug } from "@/capabilities/data/capabilities.js";
import { usePageStateClasses, useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import styles from "./CapabilitiesPage.module.scss";

const WHEEL_THRESHOLD = 44;
const WHEEL_LOCK_MS = 520;

export default function CapabilitiesPage() {
	const { "*": nestedPath = "" } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { displayPathname } = useRouteTransitionContext();
	const wheelTotalRef = useRef(0);
	const wheelLockedUntilRef = useRef(0);
	const slug = nestedPath.split("/").filter(Boolean)[0] ?? "interactive-scenes";
	const active = getCapabilityBySlug(slug);
	const activeIndex = CAPABILITIES.findIndex((item) => item.id === active.id);
	const pageClassName = usePageStateClasses("capabilities");

	const goToIndex = useCallback((index) => {
		const boundedIndex = Math.max(0, Math.min(CAPABILITIES.length - 1, index));
		const target = CAPABILITIES[boundedIndex];
		if (target && location.pathname !== target.path) {
			navigate(target.path);
		}
	}, [location.pathname, navigate]);

	useEffect(() => {
		if (!displayPathname.startsWith("/capabilities")) {
			return undefined;
		}

		const onWheel = (event) => {
			if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
				return;
			}
			const now = performance.now();
			if (now < wheelLockedUntilRef.current) {
				event.preventDefault();
				return;
			}
			wheelTotalRef.current += event.deltaY;
			if (Math.abs(wheelTotalRef.current) < WHEEL_THRESHOLD) {
				return;
			}
			const direction = wheelTotalRef.current > 0 ? 1 : -1;
			wheelTotalRef.current = 0;
			const nextIndex = activeIndex + direction;
			if (nextIndex < 0 || nextIndex >= CAPABILITIES.length) {
				return;
			}
			event.preventDefault();
			wheelLockedUntilRef.current = now + WHEEL_LOCK_MS;
			goToIndex(nextIndex);
		};

		window.addEventListener("wheel", onWheel, { passive: false });
		return () => window.removeEventListener("wheel", onWheel);
	}, [activeIndex, displayPathname, goToIndex]);

	const progress = useMemo(() => `${String(activeIndex + 1).padStart(2, "0")} / ${String(CAPABILITIES.length).padStart(2, "0")}`, [activeIndex]);

	return (
		<div className={`${pageClassName} ${styles.page}`} data-capability-id={active.id}>
			<div className={styles.content} key={active.id}>
				<p className={styles.eyebrow}>Возможности · {progress}</p>
				<p className={styles.number}>{active.number}</p>
				<h1 className={styles.title}>{active.title}</h1>
				<span className={styles.rule} aria-hidden="true" />
				<p className={styles.description}>{active.description}</p>
				<p className={styles.interaction}><span aria-hidden="true">↔</span>{active.interaction}</p>
			</div>

			<div className={styles.visual} aria-hidden="true">
				<div className={styles.orbit} />
				<div className={styles.core} />
				<div className={styles.scanline} />
			</div>
		</div>
	);
}

import { useLayoutEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import states, { ABOUT_PANEL_STAGE_COUNT } from "./states.js";
import {
	resolveCaseStudyLayout,
	resolveSiteTopHudBrandLeftPx,
} from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasLayout.js";
import {
	resolveCaseStudyPanelHudPixelRatio,
} from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasSurface.js";
import { ensureCaseStudyCanvasFonts } from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasText.js";
import {
	drawCaseStudyStageRail,
	getCaseStudyStageRailSpineOffset,
} from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyStageRail.js";
import styles from "./AboutStageRailOverlay.module.scss";

const LINK_DRAW_PER_SEC = 1.65;
const LINK_ERASE_PER_SEC = 2.8;
const LINK_LEAVE_EPS = 0.2;
const LINK_ARRIVE_EPS = 0.1;
const panelStates = states.slice(0, ABOUT_PANEL_STAGE_COUNT);

function createHeaderLinkMotion(initialIndex) {
	return {
		phase: "in",
		t: 0,
		pathCap: 1,
		anchorIndex: Math.max(0, initialIndex | 0),
	};
}

function tickHeaderLinkMotion(motion, activeFloat, dt) {
	const nearest = Math.round(activeFloat);
	const onNode = Math.abs(activeFloat - nearest) <= LINK_ARRIVE_EPS;
	const leftAnchor = Math.abs(activeFloat - motion.anchorIndex) > LINK_LEAVE_EPS;
	if ((motion.phase === "shown" || motion.phase === "in") && leftAnchor) {
		motion.pathCap = motion.phase === "in" ? Math.max(0.02, motion.t) : 1;
		motion.phase = "out";
		motion.t = 0;
	}
	if (motion.phase === "out") {
		motion.t = Math.min(1, motion.t + LINK_ERASE_PER_SEC * dt);
		if (motion.t >= 1) motion.phase = "hidden";
	} else if (motion.phase === "in") {
		motion.t = Math.min(1, motion.t + LINK_DRAW_PER_SEC * dt);
		if (motion.t >= 1) motion.phase = "shown";
	}
	if (motion.phase === "hidden" && onNode) {
		motion.phase = "in";
		motion.t = 0;
		motion.pathCap = 1;
		motion.anchorIndex = Math.max(0, nearest);
	}
	return motion.phase === "in" || motion.phase === "out";
}

/** Live DOM-canvas rail; story motion never repaints the WebGL text textures. */
export default function AboutStageRailOverlay() {
	const canvasRef = useRef(null);
	const sceneId = useSnapshot(store).sceneCarouselCurrentId;
	const active = sceneId === "about";

	useLayoutEffect(() => {
		if (!active) return undefined;
		let disposed = false;
		let rafId = 0;
		let fontsReady = false;
		let geometry = null;
		let lastPaintAt = performance.now();
		const headerLinkMotion = createHeaderLinkMotion(
			Math.min(ABOUT_PANEL_STAGE_COUNT - 1, store.aboutExperience.activeStageIndex),
		);

		const resolveGeometry = () => {
			const canvas = canvasRef.current;
			if (!canvas) return null;
			const viewportW = window.innerWidth;
			const viewportH = window.innerHeight;
			const layout = resolveCaseStudyLayout(
				viewportW,
				viewportH,
				panelStates.length,
				{ x: 0, y: 0 },
				null,
				{
					panelWidth: { min: 460, max: 560, ratio: 0.27 },
					contentTopPx: 176,
					contentBottomInsetPx: 48,
				},
			);
			if (!layout) return null;

			const railX = resolveSiteTopHudBrandLeftPx(viewportW)
				- getCaseStudyStageRailSpineOffset();
			const headerTextX = layout.leftPanel.x + (layout.leftPanel.padding ?? 0);
			const stripLeft = Math.max(0, Math.floor(railX - 8));
			// Keep room for the outward elbow of the active-node → chapter link.
			const stripRight = Math.min(viewportW, Math.ceil(headerTextX + 40));
			const stripWidth = Math.max(1, stripRight - stripLeft);
			const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
			const pixelW = Math.max(1, Math.round(stripWidth * dpr));
			const pixelH = Math.max(1, Math.round(viewportH * dpr));
			if (canvas.width !== pixelW) canvas.width = pixelW;
			if (canvas.height !== pixelH) canvas.height = pixelH;
			canvas.style.left = `${stripLeft}px`;
			canvas.style.width = `${stripWidth}px`;
			canvas.style.height = `${viewportH}px`;
			return {
				dpr,
				headerTextX,
				panelY: layout.leftPanel.y,
				railX,
				stripLeft,
				stripWidth,
				viewportH,
			};
		};

		const paint = () => {
			rafId = 0;
			if (disposed || !fontsReady || !canvasRef.current) return;
			const now = performance.now();
			const dt = Math.max(0, Math.min(0.05, (now - lastPaintAt) / 1000));
			lastPaintAt = now;
			geometry ??= resolveGeometry();
			if (!geometry) return;
			const ctx = canvasRef.current.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
			ctx.setTransform(
				geometry.dpr,
				0,
				0,
				geometry.dpr,
				-geometry.stripLeft * geometry.dpr,
				0,
			);
			ctx.imageSmoothingEnabled = false;
			const story = Math.max(0, Number(store.aboutExperience.storyProgress) || 0);
			const activeFloat = Math.min(ABOUT_PANEL_STAGE_COUNT - 1, story);
			const activeIndex = Math.min(
				ABOUT_PANEL_STAGE_COUNT - 1,
				store.aboutExperience.activeStageIndex,
			);
			const linkMoving = tickHeaderLinkMotion(
				headerLinkMotion,
				activeFloat,
				dt,
			);
			// Stops four/five belong to the 3D story and route boundary. Fade the
			// three-node rail with the text3 -> empty transition instead of extending it.
			ctx.globalAlpha = Math.max(0, Math.min(1, ABOUT_PANEL_STAGE_COUNT - story));
			drawCaseStudyStageRail(ctx, geometry.railX, geometry.panelY, {
				states: panelStates,
				activeStateId: panelStates[activeIndex]?.id,
				activeStateIndex: activeIndex,
				activeFloat,
				chapterBase: 1,
				categoryFontSize: 13,
				headerTextX: geometry.headerTextX,
				headerLinkVisual: headerLinkMotion,
				viewportH: geometry.viewportH,
			});
			ctx.globalAlpha = 1;
			if (linkMoving) requestPaint();
		};

		const requestPaint = () => {
			if (!rafId) rafId = requestAnimationFrame(paint);
		};
		const unsubscribeStory = subscribeKey(store.aboutExperience, "storyProgress", requestPaint, true);
		const unsubscribeStage = subscribeKey(store.aboutExperience, "activeStageIndex", requestPaint, true);
		const onResize = () => {
			geometry = null;
			requestPaint();
		};
		window.addEventListener("resize", onResize);
		void ensureCaseStudyCanvasFonts().then(() => {
			if (disposed) return;
			fontsReady = true;
			requestPaint();
		});

		return () => {
			disposed = true;
			unsubscribeStory();
			unsubscribeStage();
			window.removeEventListener("resize", onResize);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [active]);

	if (!active) return null;
	return (
		<div className={styles.host} aria-hidden="true">
			<canvas ref={canvasRef} className={styles.canvas} />
		</div>
	);
}

import { SITE_MAIN_COLOR, siteMainRgba } from "@/constants/siteMainColor.js";

/** Цвета HUD case study — акцент = --mainColor сайта. */
export const CASE_STUDY_CANVAS_THEME = {
	cyan: SITE_MAIN_COLOR,
	cyanDim: siteMainRgba(0.35),
	cyanGlow: siteMainRgba(0.55),
	line: "rgba(255, 255, 255, 0.1)",
	text: "#ffffff",
	textMuted: "rgba(255, 255, 255, 0.62)",
	/** Direction labels («предыдущий/следущий») — translucent, still opaque enough to read. */
	textNavDirection: "rgba(255, 255, 255, 0.5)",
	textDim: "rgba(255, 255, 255, 0.42)",
	tagBorder: "rgba(255, 255, 255, 0.14)",
	panelBg: "rgba(4, 10, 16, 0.55)",
};

export const MOBILE_BREAKPOINT = 768;

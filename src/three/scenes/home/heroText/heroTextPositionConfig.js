/**
 * Положение hero-текста на главной.
 * offsetXAfterMenuVw — только вправо от левого меню (кламп в heroTextLayout).
 * offsetY — доля высоты экрана (как uPositionOffset.y в шейдере).
 */
export const heroTextPositionConfig = {
	/** Доп. отступ от правого края левого меню, vw (не может увести текст левее меню). */
	offsetXAfterMenuVw: 5.5,
	/** Вертикальный отступ сверху (0…~0.45). */
	offsetY: 0.14,
	/** Зазор между заголовком и подзаголовком, vw. */
	subtitleGapVw: 0.02,
	/** Зазор между подзаголовком и tech-stack (меньше — ближе к tagline). */
	stackGapVw: 0.008,
	/** Отступ scroll-подсказки под tech-stack (доля высоты экрана). */
	scrollHintGapVh: 0.022,
};

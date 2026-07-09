/** Главная ↔ хаб портфолио: обе 3D-сцены всегда в паре (dual render + mix). */
export function isHomePortfolioPairPage(page) {
	return page === "/" || page === "" || page === "/portfolio";
}

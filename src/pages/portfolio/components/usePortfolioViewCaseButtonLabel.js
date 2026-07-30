import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { getPortfolioViewCaseButtonLabel } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";

/** Подпись кнопки «Смотреть кейс» с учётом языка сайта. */
export function usePortfolioViewCaseButtonLabel() {
	const { siteLocale } = useSnapshot(store);
	return getPortfolioViewCaseButtonLabel(normalizeSiteLocale(siteLocale));
}

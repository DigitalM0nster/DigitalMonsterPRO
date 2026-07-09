import { useSnapshot } from "valtio";
import { store } from "@/store.jsx";
import { getPortfolioViewCaseButtonLabel } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/** Подпись кнопки «Смотреть кейс» с учётом языка сайта. */
export function usePortfolioViewCaseButtonLabel() {
	const { siteLocale } = useSnapshot(store);
	return getPortfolioViewCaseButtonLabel(normalizeSiteLocale(siteLocale));
}

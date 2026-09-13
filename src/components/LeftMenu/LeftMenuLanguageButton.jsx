import { useCallback, useEffect } from "react";
import { useStore } from "@/app/store.jsx";
import {
	getNextSiteLocale,
	getSiteLocaleLabel,
	normalizeSiteLocale,
} from "@/functions/siteLocale.js";
import LeftMenuUtilityButton from "./LeftMenuUtilityButton.jsx";
import styles from "./LeftMenu.module.scss";
import { cycleSiteLocale } from "@/functions/siteLocaleTransition.js";

export default function LeftMenuLanguageButton() {
	const store = useStore();
	const currentLocale = normalizeSiteLocale(store.siteLocale);
	const nextLocale = getNextSiteLocale(store.siteLocaleRequested ?? currentLocale);

	useEffect(() => {
		document.documentElement.lang = currentLocale;
	}, [currentLocale]);

	const handleToggle = useCallback(() => {
		void cycleSiteLocale();
	}, []);

	return (
		<LeftMenuUtilityButton
			ariaLabel={`Сменить язык на ${getSiteLocaleLabel(nextLocale)}`}
			isActive={false}
			onClick={handleToggle}
		>
			<span className={styles.langLabel} aria-hidden="true">
				{getSiteLocaleLabel(currentLocale)}
			</span>
		</LeftMenuUtilityButton>
	);
}

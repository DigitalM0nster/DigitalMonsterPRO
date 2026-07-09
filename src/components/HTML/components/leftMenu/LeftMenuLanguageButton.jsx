import { useCallback, useEffect } from "react";
import { useStore } from "@/store.jsx";
import {
	getNextSiteLocale,
	getSiteLocaleLabel,
	normalizeSiteLocale,
} from "@/utils/siteLocale.js";
import LeftMenuUtilityButton from "./LeftMenuUtilityButton.jsx";
import styles from "./LeftMenu.module.scss";

export default function LeftMenuLanguageButton() {
	const store = useStore();
	const currentLocale = normalizeSiteLocale(store.siteLocale);
	const nextLocale = getNextSiteLocale(currentLocale);

	useEffect(() => {
		document.documentElement.lang = currentLocale;
	}, [currentLocale]);

	const handleToggle = useCallback(() => {
		store.siteLocale = getNextSiteLocale(store.siteLocale);
	}, [store]);

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

import styles from "./LeftMenu.module.scss";

/** Иконки левого меню — public/images/scifi_icons_min */
const ICON_SRC = {
	home: "/images/custom_icons/home.svg",
	portfolio: "/images/custom_icons/portfolio.svg",
	about: "/images/custom_icons/about.svg",
	contacts: "/images/custom_icons/connect.svg",
	laboratory: "/images/scifi_icons_min/laboratory.svg",
	lab_icon: "/images/lab_icon.svg",
};

export default function MenuIcon({ type }) {
	const src = ICON_SRC[type];
	if (!src) {
		return null;
	}

	return <img src={src} alt="" className={styles.iconImg} />;
}

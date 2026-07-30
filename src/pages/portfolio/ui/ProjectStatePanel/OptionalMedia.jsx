import styles from "./OptionalMedia.module.scss";
import { useState } from "react";

/**
 * Изображение или видео по политике проекта.
 * Video: max 1 на проект, load onDemand — src не грузится до клика пользователя.
 */
export default function OptionalMedia({ media }) {
	const [videoActive, setVideoActive] = useState(false);

	if (!media) {
		return null;
	}

	if (media.type === "image") {
		return (
			<div className={styles.optionalMedia}>
				<img src={media.src} alt={media.alt ?? ""} loading="lazy" />
			</div>
		);
	}

	const loadPolicy = media.load ?? "onDemand";

	if (loadPolicy === "onDemand" && !videoActive) {
		return (
			<div className={styles.optionalMedia}>
				<button type="button" className={styles.playTrigger} onClick={() => setVideoActive(true)}>
					{media.poster && <img src={media.poster} alt="" className={styles.poster} loading="lazy" />}
					<span className={styles.playLabel}>{media.playLabel ?? "Смотреть видео"}</span>
				</button>
			</div>
		);
	}

	return (
		<div className={styles.optionalMedia}>
			<video playsInline controls preload="none" poster={media.poster}>
				<source src={media.src} type="video/mp4" />
			</video>
		</div>
	);
}

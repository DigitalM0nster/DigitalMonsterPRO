import { useStore } from "@/store.jsx";
import { toggleSiteSound } from "@/sounds/siteSoundToggle.js";

export default function SoundComponent({ startApp = false }) {
	const store = useStore();
	const isActiveClass = startApp ? "active" : "";

	return (
		<div
			className={`audioContainer ${store.soundsActive ? "on" : "off"} ${isActiveClass}`}
			onClick={() => toggleSiteSound()}
			role="button"
			tabIndex={0}
			aria-label={store.soundsActive ? "Выключить звук" : "Включить звук"}
			aria-pressed={store.soundsActive}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleSiteSound();
				}
			}}
		>
			<div className="audioPicture hover1">
				<div className="audio-line" />
			</div>
		</div>
	);
}

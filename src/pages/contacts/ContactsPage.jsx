import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import { CONTACTS_CHANNELS } from "./contactsChannels.js";
import { focusContactsChannel } from "./contactsInteraction.js";
import styles from "./ContactsPage.module.scss";

/** Visible content is entirely the portfolio's WebGL hub, including the right snake text. */
export default function ContactsPage() {
	const pageClass = usePageStateClasses("contacts");
	return (
		<section className={`${pageClass} ${styles.page}`} aria-label="Social networks">
			<nav className={styles.accessibleLinks} aria-label="Social networks">
				{CONTACTS_CHANNELS.map((channel, index) => (
					<a key={channel.id} href={channel.href} target="_blank" rel="noopener noreferrer"
						onFocus={() => focusContactsChannel(index)}>
						{channel.label}
					</a>
				))}
			</nav>
		</section>
	);
}

import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import { CONTACTS_CHANNELS } from "./contactsChannels.js";
import { focusContactsChannel } from "./contactsInteraction.js";
import styles from "./ContactsPage.module.scss";

/** Hidden semantic links share the WebGL channel actions; no visible DOM layer. */
export default function ContactsPage() {
 const pageClass = usePageStateClasses("contacts");
 return <section className={`${pageClass} ${styles.page}`} aria-label="Social networks">
  <nav className={styles.accessibleLinks} aria-label="Social networks">
   {CONTACTS_CHANNELS.map((channel, index) => <a key={channel.id} href={channel.href} target="_blank" rel="noopener noreferrer"
    onFocus={() => focusContactsChannel(index)}>{channel.label}</a>)}
  </nav>
 </section>;
}

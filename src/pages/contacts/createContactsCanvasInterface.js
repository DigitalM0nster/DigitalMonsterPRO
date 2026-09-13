import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { CONTACTS_CHANNELS } from "./contactsChannels.js";
import { contactsInteraction, focusContactsChannel } from "./contactsInteraction.js";
import { resolveContactsResponsiveLayout } from "@/three/scenes/contacts/contactsResponsiveLayout.js";
import { store } from "@/app/store.jsx";

export function createContactsCanvasInterface(renderer) {
	const ui = new SceneCanvasInterface("contacts", renderer);
	ui.allowSiteSwipe = true;
	ui.text("title", { ru: "БУДЕМ НА СВЯЗИ", en: "LET’S CONNECT", zh: "保持联系" }, { size: 20, width: 300, height: 36 });
	for (const [i, channel] of CONTACTS_CHANNELS.entries()) {
		ui.text(`channel${i}`, { default: channel.label }, { size: 17, width: 180, height: 44,
			hover: () => focusContactsChannel(i),
			action: () => { focusContactsChannel(i); window.open(channel.href, "_blank", "noopener,noreferrer"); } });
		ui.add(`line${i}`);
	}
	ui.layout = () => {
		const layout = resolveContactsResponsiveLayout(ui.width, ui.height); ui.enabled = !!layout;
		if (!layout) return;
		ui.place("title", layout.listX, layout.titleY, 300, 36, { key: store.siteLocale });
		for (let i = 0; i < CONTACTS_CHANNELS.length; i++) {
			const x = layout.listX + (i % layout.columns) * layout.listWidth / layout.columns;
			const y = layout.listY + Math.floor(i / layout.columns) * layout.rowHeight;
			ui.place(`channel${i}`, x + 10, y, 180, 44, { opacity: contactsInteraction.activeIndex === i ? 1 : .82 });
			ui.place(`line${i}`, x, y + 20, 4, 2, { color: 0x00a9ff, opacity: contactsInteraction.activeIndex === i ? 1 : .4 });
		}
	};
	return ui;
}

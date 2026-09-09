import { proxy } from "valtio";

export const contactsInteraction = proxy({ activeIndex: -1 });

export function focusContactsChannel(index) {
	contactsInteraction.activeIndex = index;
}

/** Isolate selection/cursor state while reading the shared application lifecycle. */
export function createContactsHubStore(appStore) {
	const cursor = {};
	return new Proxy(appStore, {
		get(target, key) {
			if (key === "portfolioHubFocusIndex") return contactsInteraction.activeIndex;
			if (key === "cursor") return cursor;
			return Reflect.get(target, key);
		},
		set(target, key, value) {
			if (key === "portfolioHubFocusIndex") { contactsInteraction.activeIndex = value; return true; }
			return Reflect.set(target, key, value);
		},
	});
}

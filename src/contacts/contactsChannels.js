/**
 * Public contact channels for the Contacts page (HTML list).
 * Placeholder handles — replace with production accounts when ready.
 */

export const CONTACTS_EMAIL = "hello@digitalmonster.studio";

/** @typedef {'email' | 'wechat' | 'telegram' | 'vk' | 'phone' | 'linkedin' | 'x'} ContactsChannelId */

/**
 * @type {Array<{
 *   id: ContactsChannelId,
 *   href: string,
 *   value: string,
 *   external?: boolean,
 * }>}
 */
export const CONTACTS_CHANNELS = [
	{
		id: "email",
		href: `mailto:${CONTACTS_EMAIL}`,
		value: CONTACTS_EMAIL,
		external: false,
	},
	{
		id: "wechat",
		href: "https://www.digitalmonster.studio/",
		value: "DigitalMonster",
		external: true,
	},
	{
		id: "telegram",
		href: "https://t.me/digitalmonster",
		value: "@digitalmonster",
		external: true,
	},
	{
		id: "vk",
		href: "https://vk.com/digitalmonster",
		value: "vk.com/digitalmonster",
		external: true,
	},
	{
		id: "phone",
		href: "tel:+79990000000",
		value: "+7 999 000-00-00",
		external: false,
	},
	{
		id: "linkedin",
		href: "https://www.linkedin.com/company/digitalmonster",
		value: "Digital Monster",
		external: true,
	},
	{
		id: "x",
		href: "https://x.com/digitalmonster",
		value: "@digitalmonster",
		external: true,
	},
];

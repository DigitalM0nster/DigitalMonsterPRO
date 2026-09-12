/** Replace href values with your public profiles when the accounts are ready. */
export const CONTACTS_CHANNELS = [
	{ id: "youtube", label: "YouTube", href: "https://www.youtube.com/" },
	{ id: "vk", label: "VK", href: "https://vk.com/" },
	{ id: "facebook", label: "Facebook", href: "https://www.facebook.com/" },
	{ id: "telegram", label: "Telegram", href: "https://telegram.org/" },
	{ id: "instagram", label: "Instagram", href: "https://www.instagram.com/" },
	{ id: "behance", label: "Behance", href: "https://www.behance.net/" },
	{ id: "dribbble", label: "Dribbble", href: "https://dribbble.com/" },
	{ id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/" },
];

/** Content adapter for the exact portfolio hub renderer. Visual settings stay in portfolioHubConfig. */
export const CONTACTS_HUB_PROJECTS = CONTACTS_CHANNELS.map((channel) => ({
	id: channel.id,
	name: channel.label,
	path: channel.href,
	externalHref: channel.href,
	hubLogo: `/images/contacts/${channel.id}.svg`,
	labelSegments: [{ text: channel.href.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/$/, ""), role: "secondary" }],
}));

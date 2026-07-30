import { normalizeSiteLocale, SITE_LOCALES } from "@/functions/siteLocale.js";
import { store } from "@/app/store.jsx";

/**
 * Contacts page copy — form + channel labels (RU authored; EN/ZH aligned).
 */

export const CONTACTS_COPY = {
	ru: {
		eyebrow: "НАЧНЁМ ПРОЕКТ",
		title: "ДАВАЙТЕ\nСОЗДАДИМ\nНЕЧТО БОЛЬШЕЕ",
		subtitle: "Расскажите о задаче — мы предложим решение.",
		nameLabel: "ВАШЕ ИМЯ",
		contactLabel: "EMAIL / TELEGRAM",
		messageLabel: "КОРОТКО О ЗАДАЧЕ",
		attachLabel: "ПРИКРЕПИТЬ ФАЙЛ",
		attachChosen: "ФАЙЛ ВЫБРАН",
		submitLabel: "ОТПРАВИТЬ",
		channelsTitle: "СВЯЗЬ",
		channels: {
			email: "EMAIL",
			wechat: "WECHAT",
			telegram: "TELEGRAM",
			vk: "ВКОНТАКТЕ",
			phone: "ТЕЛЕФОН",
			linkedin: "LINKEDIN",
			x: "X",
		},
		submitAria: "Отправить заявку",
		formAria: "Форма обратной связи",
		copyAria: "Скопировать",
		copiedAria: "Скопировано",
	},
	en: {
		eyebrow: "START A PROJECT",
		title: "LET'S CREATE\nSOMETHING\nGREATER",
		subtitle: "Tell us about the task — we'll propose a solution.",
		nameLabel: "YOUR NAME",
		contactLabel: "EMAIL / TELEGRAM",
		messageLabel: "BRIEF ABOUT THE TASK",
		attachLabel: "ATTACH FILE",
		attachChosen: "FILE SELECTED",
		submitLabel: "SEND",
		channelsTitle: "CONNECT",
		channels: {
			email: "EMAIL",
			wechat: "WECHAT",
			telegram: "TELEGRAM",
			vk: "VK",
			phone: "PHONE",
			linkedin: "LINKEDIN",
			x: "X",
		},
		submitAria: "Send inquiry",
		formAria: "Contact form",
		copyAria: "Copy",
		copiedAria: "Copied",
	},
	zh: {
		eyebrow: "开始项目",
		title: "一起创造\n更了不起的\n事物",
		subtitle: "告诉我们您的需求——我们会提出方案。",
		nameLabel: "您的姓名",
		contactLabel: "邮箱 / TELEGRAM",
		messageLabel: "简要描述任务",
		attachLabel: "附加文件",
		attachChosen: "已选择文件",
		submitLabel: "发送",
		channelsTitle: "联系方式",
		channels: {
			email: "邮箱",
			wechat: "微信",
			telegram: "TELEGRAM",
			vk: "VK",
			phone: "电话",
			linkedin: "LINKEDIN",
			x: "X",
		},
		submitAria: "发送咨询",
		formAria: "联系表单",
		copyAria: "复制",
		copiedAria: "已复制",
	},
};

export function getContactsCopy(locale = store.siteLocale) {
	return CONTACTS_COPY[normalizeSiteLocale(locale)] ?? CONTACTS_COPY.ru;
}

/** @param {keyof typeof CONTACTS_COPY.ru} field */
export function getContactsFieldTexts(field) {
	/** @type {Partial<Record<import('@/functions/siteLocale.js').SiteLocale, string>>} */
	const texts = {};
	for (const locale of SITE_LOCALES) {
		const value = CONTACTS_COPY[locale]?.[field];
		if (typeof value === "string") {
			texts[locale] = value;
		}
	}
	return texts;
}

/** @param {number} lineIndex */
export function getContactsTitleLineTexts(lineIndex) {
	/** @type {Partial<Record<import('@/functions/siteLocale.js').SiteLocale, string>>} */
	const texts = {};
	for (const locale of SITE_LOCALES) {
		const lines = String(CONTACTS_COPY[locale]?.title ?? "").split("\n");
		const line = lines[lineIndex] ?? "";
		// Keep a group for every locale so language switch stays aligned.
		texts[locale] = line || "\u00A0";
	}
	return texts;
}

/** Title lines for GlitchBilingualText — one map per authored line. */
export function getContactsTitleLines() {
	const lineCount = Math.max(
		...SITE_LOCALES.map(
			(locale) => String(CONTACTS_COPY[locale]?.title ?? "").split("\n").length,
		),
		1,
	);
	return Array.from({ length: lineCount }, (_, index) => getContactsTitleLineTexts(index));
}

/** @param {string} channelId */
export function getContactsChannelLabelTexts(channelId) {
	/** @type {Partial<Record<import('@/functions/siteLocale.js').SiteLocale, string>>} */
	const texts = {};
	for (const locale of SITE_LOCALES) {
		const value = CONTACTS_COPY[locale]?.channels?.[channelId];
		if (typeof value === "string") {
			texts[locale] = value;
		}
	}
	return texts;
}

/**
 * Теги для левой панели из traits state и meta проекта.
 * @param {import('@/portfolio/core/types.js').PortfolioState} state
 * @param {import('@/portfolio/core/types.js').PortfolioProjectConfig} config
 */
export function getStateTags(state, config) {
	/** @type {string[]} */
	const tags = [];

	for (const trait of state.traits ?? []) {
		if (trait.values?.length) {
			tags.push(...trait.values);
		} else if (trait.value) {
			tags.push(trait.value);
		}
		if (tags.length >= 4) {
			return tags.slice(0, 4);
		}
	}

	if (tags.length === 0 && config.meta?.skills?.length) {
		return config.meta.skills.slice(0, 4);
	}

	return tags.slice(0, 4);
}

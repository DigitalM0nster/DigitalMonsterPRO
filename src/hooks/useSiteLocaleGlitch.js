import { useCallback, useLayoutEffect, useRef } from "react";
import { registerSiteLocaleEffect, waitLocaleEffect } from "@/functions/siteLocaleTransition.js";
import { isSiteLocaleTransitionActive } from "@/functions/siteLocaleTransitionState.js";
import { prepareGlitchAppearInScope, runGlitchSnake } from "@/components/GlitchText/glitchSnakeAnimation.js";

/** Join the site transaction; DOM glyph effects retain their existing engine. */
export function useSiteLocaleGlitch(rootRef, locale, options = {}) {
	const current = useRef(options); current.current = options;
	const scope = useCallback(() => current.current.scope?.() ?? rootRef.current?.querySelector(".languageGroup.active"), [rootRef]);
	const hidden = useCallback(() => {
		const node = scope();
		if (node) (current.current.hide ?? prepareGlitchAppearInScope)(node);
	}, [scope]);
	useLayoutEffect(() => registerSiteLocaleEffect({
		disappear: () => {
			const node = scope();
			if (!node || !rootRef.current?.getClientRects().length) return;
			return waitLocaleEffect((current.current.run ?? runGlitchSnake)(node, "disappear", current.current.timing));
		},
		appear: () => {
			const node = scope();
			if (!node || !rootRef.current?.getClientRects().length) return;
			hidden();
			return waitLocaleEffect((current.current.run ?? runGlitchSnake)(node, "appear", current.current.timing));
		},
	}), [rootRef, scope, hidden]);
	useLayoutEffect(() => { if (isSiteLocaleTransitionActive()) hidden(); }, [locale, hidden]);
}

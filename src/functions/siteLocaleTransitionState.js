// Shared by prepared GPU materials. One finite site cycle owns these scalars.
export const siteLocaleReveal = { value: 1 };
export const siteLocaleTransitionState = { phase: "idle", target: null };
export const isSiteLocaleTransitionActive = () => siteLocaleTransitionState.phase !== "idle";

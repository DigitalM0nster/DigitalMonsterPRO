export const CASE1_PATH = "/portfolio/01";

export function isCase1Path(pathname) {
	const normalized = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	return normalized === CASE1_PATH;
}

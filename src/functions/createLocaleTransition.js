/** One immutable destination per complete exit/commit/enter cycle; latest request wins next. */
export function createLocaleTransition({ getLocale, commit, animate, afterCommit, phaseChanged = () => {} }) {
	const effects = new Set();
	const lateAppearances = new Set();
	let desired = getLocale(), running = null, phase = "idle", target = null;
	const setPhase = next => { phase = next; phaseChanged(next, target, desired); };
	const invokeOne = (entry, method) => Promise.race([
		Promise.resolve().then(() => effects.has(entry) ? entry.effect[method]?.(target) : undefined), entry.removed,
	]);
	const invoke = method => Promise.all([...effects].map(entry => invokeOne(entry, method)));
	async function run() {
		try {
			while (desired !== getLocale()) {
				target = desired;
				setPhase("disappearing");
				await Promise.all([animate(0), invoke("disappear")]);
				setPhase("swapping");
				await commit(target);
				await invoke("commit");
				await afterCommit();
				setPhase("appearing");
				await Promise.all([animate(1), invoke("appear")]);
				while (lateAppearances.size) await Promise.all([...lateAppearances]);
			}
		} finally {
			target = null; running = null; setPhase("idle");
		}
	}
	return {
		get phase() { return phase; },
		get target() { return target; },
		get desired() { return running ? desired : getLocale(); },
		get done() { return running ?? Promise.resolve(); },
		request(locale) {
			desired = locale;
			if (!running && desired !== getLocale()) {
				// Establish ownership before invoking an effect that can request again.
				running = Promise.resolve().then(run);
			}
			return running ?? Promise.resolve();
		},
		register(effect) {
			let remove;
			const entry = { effect, removed: new Promise(resolve => { remove = resolve; }) };
			effects.add(entry);
			if (phase === "appearing") {
				const appearance = invokeOne(entry, "appear");
				lateAppearances.add(appearance);
				appearance.then(() => lateAppearances.delete(appearance), () => lateAppearances.delete(appearance));
			}
			return () => { effects.delete(entry); remove(); };
		},
	};
}

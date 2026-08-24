export const SIGNAL_FIELD_FORMS = Object.freeze([
	Object.freeze({ id: "globe", index: 0, code: "SPH-01", label: "СФЕРА" }),
	Object.freeze({ id: "reactor", index: 1, code: "TOR-02", label: "РЕАКТОР" }),
	Object.freeze({ id: "dna", index: 2, code: "DNA-03", label: "ДНК" }),
	Object.freeze({ id: "crystal", index: 3, code: "CRY-04", label: "КРИСТАЛЛ" }),
]);

const DEFAULT_FORM_INDEX = 0;
const stateListeners = new Set();
const requestListeners = new Set();

let requestedIndex = DEFAULT_FORM_INDEX;
let state = Object.freeze({
	activeIndex: DEFAULT_FORM_INDEX,
	fromIndex: DEFAULT_FORM_INDEX,
	targetIndex: DEFAULT_FORM_INDEX,
	selectedIndex: DEFAULT_FORM_INDEX,
	progress: 1,
	transitioning: false,
});

function normalizeFormIndex(value) {
	const index = Number(value);
	return Number.isInteger(index) && index >= 0 && index < SIGNAL_FIELD_FORMS.length
		? index
		: DEFAULT_FORM_INDEX;
}

function emitState() {
	for (const listener of stateListeners) listener();
}

export function getSignalFieldFormState() {
	return state;
}

export function subscribeSignalFieldFormState(listener) {
	stateListeners.add(listener);
	return () => stateListeners.delete(listener);
}

export function getRequestedSignalFieldFormIndex() {
	return requestedIndex;
}

export function requestSignalFieldForm(value) {
	const index = normalizeFormIndex(value);
	if (index === requestedIndex && (state.transitioning || state.activeIndex === index)) return;

	requestedIndex = index;
	state = Object.freeze({ ...state, selectedIndex: index });
	emitState();
	for (const listener of requestListeners) listener(index);
}

export function subscribeSignalFieldFormRequest(listener) {
	requestListeners.add(listener);
	return () => requestListeners.delete(listener);
}

export function publishSignalFieldMorphState(nextState) {
	const progress = Math.round(Math.max(0, Math.min(1, Number(nextState.progress) || 0)) * 40) / 40;
	const next = Object.freeze({
		activeIndex: normalizeFormIndex(nextState.activeIndex),
		fromIndex: normalizeFormIndex(nextState.fromIndex),
		targetIndex: normalizeFormIndex(nextState.targetIndex),
		selectedIndex: requestedIndex,
		progress,
		transitioning: Boolean(nextState.transitioning),
	});
	if (
		next.activeIndex === state.activeIndex
		&& next.fromIndex === state.fromIndex
		&& next.targetIndex === state.targetIndex
		&& next.selectedIndex === state.selectedIndex
		&& next.progress === state.progress
		&& next.transitioning === state.transitioning
	) return;

	state = next;
	emitState();
}

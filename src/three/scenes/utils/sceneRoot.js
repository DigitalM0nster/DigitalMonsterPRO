/** Скрытый root не тратит CPU на frustum/raycast. */
export function freezeHiddenRoot(object) {
	if (!object) {
		return;
	}
	object.frustumCulled = false;
	object.matrixAutoUpdate = false;
	object.raycast = () => {};
}

export function restoreRootForShow(object) {
	if (!object) {
		return;
	}
	object.frustumCulled = true;
	object.matrixAutoUpdate = true;
	delete object.raycast;
}

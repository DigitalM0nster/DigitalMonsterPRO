/**
 * Пустая сцена — только liquid-фон, без 3D-контента (главная).
 */
export class EmptyScene {
	shouldRender() {
		return false;
	}

	update() {}

	applyCamera(camera) {
		camera.position.set(0, 0, 9);
		camera.lookAt(0, 0, 0);
	}

	dispose() {}
}

import { Component } from "react";

/**
 * Ловит синхронные ошибки внутри ThreeCanvasHost (если что-то ускользнёт из try/catch).
 * HTML-слой (меню, роуты, лоадер) остаётся живым.
 */
export default class WebGLCanvasErrorBoundary extends Component {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error, info) {
		console.error("[three] WebGLCanvasErrorBoundary", error, info?.componentStack);
		this.props.onFailure?.(error);
	}

	render() {
		if (this.state.hasError) {
			return <div className="canvasParent canvasParentWebglFailed" aria-hidden="true" data-webgl="failed" />;
		}

		return this.props.children;
	}
}

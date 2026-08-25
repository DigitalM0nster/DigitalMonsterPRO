import { Component } from "react";

/** Keeps the HTML application alive when the WebGL host throws synchronously. */
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

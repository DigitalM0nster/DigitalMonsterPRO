import { drawScreenTextLayerCanvas } from "./hubScreenTextCanvas.js";
import { GlitchCanvasTextLayer } from "@/shared/canvasText/GlitchCanvasTextLayer.js";
import {
	GLITCH_REPLACEMENT_SHADOW_BLUR,
	resolveReplacementGlowMetrics,
} from "@/shared/glitchText/drawGlitchText.js";

/**
 * Portfolio HUD текстовый слой.
 * Glitch-список проектов — GlitchCanvasTextLayer; статический текст — canvas без змейки.
 */
export class HubScreenTextLayer extends GlitchCanvasTextLayer {
	_usesGlitchText(layerCfg) {
		return layerCfg?.meta?.projectIndex !== undefined || layerCfg?.useGlitchText === true;
	}

	_shouldKeepMeshInRenderGraph() {
		return this._usesGlitchText(this.layerCfg) && this.layerCfg?.meta?.projectIndex !== undefined;
	}

	build(layerCfg, lineGap = 14, { initialHidden = true } = {}) {
		if (this._usesGlitchText(layerCfg)) {
			if (layerCfg.meta?.projectIndex !== undefined) {
				layerCfg.keepMeshInRenderGraph = true;
			}
			return super.build(layerCfg, lineGap, { initialHidden, drawProfile: "hud" });
		}

		this.dispose();
		this.layerCfg = layerCfg;
		this._opacityDisplay = layerCfg.opacity ?? 1;
		this._opacityTarget = this._opacityDisplay;
		this._opacityFrom = this._opacityDisplay;
		this._opacityAnimating = false;
		this.layout.gapAfter = lineGap;

		const { canvas, aspect } = drawScreenTextLayerCanvas(layerCfg);
		this._applyCanvasMetrics(canvas, aspect);
		this._applyOpacity();

		return this;
	}

	_applyCanvasMetrics(canvas, aspect) {
		super._applyCanvasMetrics(canvas, aspect);

		if (this.layerCfg?.meta?.projectIndex !== undefined && this.mesh) {
			const meta = this.layerCfg.meta;
			Object.assign(this.mesh.userData, meta);
			if (this.mainMesh) {
				Object.assign(this.mainMesh.userData, meta);
				this.mainMesh.userData.hubProjectIndex = meta.projectIndex;
			}
			if (this.snakeMesh) {
				Object.assign(this.snakeMesh.userData, meta);
				this.snakeMesh.userData.hubProjectIndex = meta.projectIndex;
			}
			this.mesh.userData.hubProjectIndex = meta.projectIndex;
		}
	}
}

export { GLITCH_REPLACEMENT_SHADOW_BLUR, resolveReplacementGlowMetrics };

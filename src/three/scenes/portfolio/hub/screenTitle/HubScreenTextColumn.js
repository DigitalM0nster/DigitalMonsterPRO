import { ensureScreenTextFonts } from "./hubScreenTextCanvas.js";
import { HubScreenTextLayer } from "./HubScreenTextLayer.js";

/**
 * Вертикальный столбец текстовых слоёв (слева — заголовки, справа — проекты).
 */
export class HubScreenTextColumn {
	constructor(parentGroup, name = "hubScreenTextColumn") {
		this.root = parentGroup;
		this.name = name;
		this.layers = [];
		this.columnCfg = null;
		this._stackVisibility = 1;
	}

	_layoutStack() {
		let cursorY = 0;

		for (const layer of this.layers) {
			layer.mesh.position.set(0, cursorY - layer.layout.height * 0.5, 0);
			cursorY -= layer.layout.height + layer.layout.gapAfter;
		}
	}

	_applyStackVisibility() {
		for (const layer of this.layers) {
			layer.setVisibility(this._stackVisibility);
		}
	}

	async build(columnCfg) {
		this.dispose();
		this.columnCfg = columnCfg;
		const activeLayers = columnCfg.layers.filter((layerDef) => layerDef.enabled !== false);
		await ensureScreenTextFonts(activeLayers);

		for (const layerDef of activeLayers) {
			const layer = new HubScreenTextLayer().build(layerDef, columnCfg.lineGap);
			this.layers.push(layer);
			this.root.add(layer.mesh);
		}

		this._layoutStack();
		this._applyStackVisibility();
	}

	setStackVisibility(multiplier = 1) {
		this._stackVisibility = Math.max(0, Math.min(1, multiplier));
		this._applyStackVisibility();
	}

	dispose() {
		for (const layer of this.layers) {
			if (layer.mesh) {
				this.root.remove(layer.mesh);
			}
			layer.dispose();
		}
		this.layers = [];
		this.columnCfg = null;
	}
}

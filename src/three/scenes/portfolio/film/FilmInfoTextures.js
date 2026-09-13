import * as THREE from "three";
import { filmProjectInfo, filmInfoCopy } from "@/pages/portfolio/data/filmProjectInfo.js";
import { nextFilmPaint } from "./FilmMedia.js";

// The complete reading side is painted once per project/locale/layout under Start.
// Native scrolling changes only its sampling window, never the canvas pixels.
export class FilmInfoTextures {
	constructor(projects) { this.projects = projects; this.entries = new Map(); this.disposed = false; }
	async prepare(renderer) {
		for (const locale of ["ru", "en", "zh"]) for (const mobile of [false, true]) {
			for (const [index, project] of this.projects.entries()) {
				await nextFilmPaint();
				if (this.disposed) return;
				const entry = this.paint(project, locale, mobile);
				this.entries.set(`${index}:${locale}:${mobile}`, entry);
				await nextFilmPaint();
				if (this.disposed) return;
				renderer.initTexture(entry.texture);
			}
		}
	}
	get(index, locale, mobile) { return this.entries.get(`${index}:${locale}:${mobile}`) || this.entries.get(`${index}:en:${mobile}`); }
	paint(project, locale, mobile) {
		const width = mobile ? 640 : 1536, viewportHeight = Math.round(width / 2.05);
		const padding = mobile ? 42 : 104, bodySize = mobile ? 32 : 34, lineHeight = mobile ? 44 : 49;
		const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
		const copy = filmInfoCopy[locale], content = filmProjectInfo[project.id][locale];
		const columns = mobile ? 1 : 2, gap = 86, columnWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
		const font = size => `400 ${size}px FilmSans, "Microsoft YaHei", sans-serif`;
		const wrap = (text, size, maxWidth) => {
			ctx.font = font(size);
			const units = locale === "zh" ? Array.from(text) : text.split(" ");
			const lines = []; let line = "";
			for (const unit of units) {
				const next = line + (line && locale !== "zh" ? " " : "") + unit;
				if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = unit; }
				else line = next;
			}
			if (line) lines.push(line);
			return lines;
		};
		const sections = [[copy.purpose, content.purpose], [copy.solution, content.solution]];
		if (content.result) sections.push([copy.result, content.result]);
		const titleSize = mobile ? 43 : 68;
		const title = wrap(project.name.toUpperCase(), titleSize, width - padding * 2);
		const headerBottom = (mobile ? 82 : 134) + title.length * titleSize * 1.15 + (mobile ? 36 : 72);
		let nextY = headerBottom;
		const blocks = sections.map(([label, text], index) => {
			const lines = wrap(text, bodySize, columnWidth);
			const x = padding + (mobile ? 0 : index % 2 * (columnWidth + gap));
			const y = mobile || index >= 2 ? nextY : headerBottom;
			const bottom = y + 46 + lines.length * lineHeight;
			nextY = Math.max(nextY, bottom + (mobile ? 42 : 44));
			return { label, lines, x, y, bottom };
		});
		canvas.width = width; canvas.height = Math.ceil(Math.max(viewportHeight, nextY + padding));
		ctx.fillStyle = "#040c16"; ctx.fillRect(0, 0, width, canvas.height);
		ctx.textBaseline = "top";
		ctx.font = font(mobile ? 22 : 25); ctx.fillStyle = "#00b9ff";
		ctx.fillText(copy.about.toUpperCase(), padding, mobile ? 32 : 70);
		ctx.font = font(titleSize); ctx.fillStyle = "#f4f9ff";
		title.forEach((line, index) => ctx.fillText(line, padding, (mobile ? 74 : 120) + index * titleSize * 1.15));
		ctx.fillStyle = "#00a9ff"; ctx.fillRect(padding, headerBottom - (mobile ? 20 : 35), mobile ? 80 : 112, 2);
		for (const { label, lines, x, y } of blocks) {
			ctx.font = font(mobile ? 22 : 24); ctx.fillStyle = "#00b9ff";
			ctx.fillText(label.toUpperCase(), x, y);
			ctx.font = font(bodySize); ctx.fillStyle = "#eff5fa";
			lines.forEach((line, index) => ctx.fillText(line, x, y + 46 + index * lineHeight));
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false;
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		return { texture, viewportHeight, height: canvas.height, width, range: Math.max(0, canvas.height - viewportHeight) };
	}
	dispose() { this.disposed = true; for (const { texture } of this.entries.values()) texture.dispose(); this.entries.clear(); }
}

import * as THREE from "three";
import { releaseStaticCanvasAfterUpload } from "../../../assets/releaseStaticCanvasAfterUpload.js";
import { filmProjectInfo, filmInfoCopy, getFilmInfoSections } from "@/pages/portfolio/data/filmProjectInfo.js";
import { nextFilmPaint } from "./FilmMedia.js";

let readingFontsReady;
const prepareReadingFonts = () => readingFontsReady ??= Promise.all([
	["FilmReading", "/fonts/Nipigas/DINPro.woff"],
	["FilmHeading", "/fonts/MazzardM/MazzardM-Bold.woff"],
].map(([name, path]) => new FontFace(name, `url(${path})`).load().then(font => document.fonts.add(font))));

function wrapInfoText(ctx, text, font, maxWidth, locale) {
	ctx.font = font;
	const readable = locale === "ru" ? text.replace(/(^|\s)([а-яё]{1,2})\s+/gi, "$1$2\u00a0") : text;
	const units = locale === "zh" ? Array.from(readable) : readable.split(" ");
	const lines = []; let line = "";
	for (const unit of units) {
		const next = line + (line && locale !== "zh" ? " " : "") + unit;
		if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = unit; }
		else line = next;
	}
	if (line) lines.push(line);
	return lines;
}

function createInfoEntry(canvas, viewportHeight) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false;
	texture.minFilter = texture.magFilter = THREE.LinearFilter;
	return { texture, viewportHeight, height: canvas.height, width: canvas.width, range: Math.max(0, canvas.height - viewportHeight) };
}

// This case is a single editorial story: a broad introduction, followed by three
// aligned chapters. The reading order stays identical on desktop and mobile.
function paintNipigasInfo(project, content, locale, mobile) {
	const width = mobile ? 640 : 1536, viewportHeight = Math.round(width / 2.05);
	const padding = mobile ? 40 : 94, available = width - padding * 2;
	const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
	const heading = size => `${locale === "zh" ? 600 : 400} ${size}px FilmHeading, "Microsoft YaHei", sans-serif`;
	const body = size => `400 ${size}px FilmReading, "Microsoft YaHei", sans-serif`;
	const elements = [];
	const text = (value, font, x, y, maxWidth, leading, tracking = 0) => {
		ctx.letterSpacing = `${tracking}px`;
		const lines = wrapInfoText(ctx, value, font, maxWidth, locale);
		elements.push({ lines, font, x, y, leading, tracking });
		return y + lines.length * leading;
	};
	const rule = y => {
		elements.push({ x: padding, y, width: available, color: "#153346", height: 1 });
		elements.push({ x: padding, y, width: mobile ? 38 : 54, color: "#00a9ff", height: 2 });
	};
	let y = mobile ? 32 : 26;
	y = text(content.introLabel.toLocaleUpperCase(locale), body(mobile ? 26 : 24), padding, y, available, 34, locale === "zh" ? 0 : 1.6);
	y = text(project.name.toUpperCase(), heading(mobile ? 62 : 80), padding, y + 14, available, mobile ? 74 : 94);
	y = text(content.purpose, body(mobile ? 35 : 36), padding, y + (mobile ? 24 : 22), available, mobile ? 49 : 50);
	y += mobile ? 48 : 52;
	for (const [index, section] of content.sections.entries()) {
		rule(y);
		const top = y + (mobile ? 32 : 38);
		text(String(index + 1).padStart(2, "0"), body(mobile ? 25 : 24), padding, top + 7, 44, 32);
		const headingX = padding + (mobile ? 56 : 64);
		const headingWidth = mobile ? available - 56 : 362;
		const headingBottom = text(section.title, heading(mobile ? 40 : 42), headingX, top, headingWidth, mobile ? 48 : 51);
		const bodyX = mobile ? padding : padding + 492;
		const bodyY = mobile ? headingBottom + 24 : top + 3;
		const bodyBottom = text(section.body, body(34), bodyX, bodyY, mobile ? available : available - 492, 48);
		y = Math.max(headingBottom, bodyBottom) + (mobile ? 48 : 60);
	}
	rule(y);
	y = text(content.closing, body(mobile ? 34 : 32), padding, y + 34, available, mobile ? 48 : 46);
	canvas.width = width; canvas.height = Math.ceil(Math.max(viewportHeight, y + (mobile ? 48 : 64)));
	ctx.fillStyle = "#040c16"; ctx.fillRect(0, 0, width, canvas.height);
	ctx.textBaseline = "top";
	for (const element of elements) {
		if (!element.lines) {
			ctx.fillStyle = element.color;
			ctx.fillRect(element.x, element.y, element.width, element.height);
			continue;
		}
		ctx.font = element.font; ctx.fillStyle = "#ffffff";
		ctx.letterSpacing = `${element.tracking}px`;
		element.lines.forEach((line, index) => ctx.fillText(line, element.x, element.y + index * element.leading));
	}
	return createInfoEntry(canvas, viewportHeight);
}


// The complete reading side is painted once per project/locale/layout under Start.
// Native scrolling changes only its sampling window, never the canvas pixels.
export class FilmInfoTextures {
	constructor(projects) { this.projects = projects; this.entries = new Map(); this.disposed = false; }
	async prepare(renderer) {
		await prepareReadingFonts();
		for (const locale of ["ru", "en", "zh"]) for (const mobile of [false, true]) {
			for (const [index, project] of this.projects.entries()) {
				await nextFilmPaint();
				if (this.disposed) return;
				const entry = this.paint(project, locale, mobile);
				this.entries.set(`${index}:${locale}:${mobile}`, entry);
				await nextFilmPaint();
				if (this.disposed) return;
				releaseStaticCanvasAfterUpload(entry.texture);
				renderer.initTexture(entry.texture);
			}
		}
	}
	get(index, locale, mobile) { return this.entries.get(`${index}:${locale}:${mobile}`) || this.entries.get(`${index}:en:${mobile}`); }
	paint(project, locale, mobile) {
		if (project.id === "nipigas") return paintNipigasInfo(project, filmProjectInfo[project.id][locale], locale, mobile);
		const width = mobile ? 640 : 1536, viewportHeight = Math.round(width / 2.05);
		const padding = mobile ? 40 : 94, bodySize = mobile ? 32 : 32, lineHeight = mobile ? 44 : 45;
		const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
		const copy = filmInfoCopy[locale], content = filmProjectInfo[project.id][locale];
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
		const titleSize = mobile ? 44 : 64, available = width - padding * 2;
		const title = wrap(project.name.toUpperCase(), titleSize, available);
		const titleY = mobile ? 36 : 54;
		const headerBottom = titleY + title.length * titleSize * 1.15 + (mobile ? 48 : 76);
		const gap = 92, introWidth = mobile ? available : content.sections ? 390 : (available - gap) / 2;
		const storyWidth = mobile ? available : available - introWidth - gap;
		const blocks = [];
		const block = (label, text, x, y, maxWidth, intro = false) => {
			const labelSize = mobile ? 30 : intro ? 25 : 34;
			const headings = label ? wrap(label, labelSize, maxWidth) : [];
			const lines = wrap(text, bodySize, maxWidth);
			const bodyY = y + (headings.length ? headings.length * (labelSize + 8) + 20 : 0);
			const bottom = bodyY + lines.length * lineHeight;
			blocks.push({ headings, labelSize, lines, x, y, bodyY, maxWidth, intro });
			return bottom;
		};
		let introBottom = block(content.introLabel || copy.purpose, content.purpose, padding, headerBottom, introWidth, true);
		let storyBottom = mobile ? introBottom + 56 : headerBottom;
		for (const section of getFilmInfoSections(content, copy)) {
			storyBottom = block(section.title, section.body, mobile ? padding : padding + introWidth + gap, storyBottom, storyWidth) + 62;
		}
		if (content.closing) {
			const closingY = mobile ? storyBottom + 6 : introBottom + 66;
			introBottom = block("", content.closing, padding, closingY, introWidth, true);
		}
		canvas.width = width;
		canvas.height = Math.ceil(Math.max(viewportHeight, introBottom + padding, storyBottom + padding - 62));
		ctx.fillStyle = "#040c16"; ctx.fillRect(0, 0, width, canvas.height);
		ctx.textBaseline = "top";
		ctx.font = font(titleSize); ctx.fillStyle = "#ffffff";
		title.forEach((line, index) => ctx.fillText(line, padding, titleY + index * titleSize * 1.15));
		ctx.fillStyle = "#00a9ff"; ctx.fillRect(padding, headerBottom - 28, mobile ? 48 : 72, 2);
		for (const { headings, labelSize, lines, x, y, bodyY, maxWidth, intro } of blocks) {
			if (!intro && y > headerBottom) {
				ctx.fillStyle = "#164154"; ctx.fillRect(x, y - 30, maxWidth, 1);
			}
			ctx.font = font(labelSize); ctx.fillStyle = "#ffffff";
			headings.forEach((line, index) => ctx.fillText(line, x, y + index * (labelSize + 8)));
			ctx.font = font(bodySize); ctx.fillStyle = "#eff5fa";
			lines.forEach((line, index) => ctx.fillText(line, x, bodyY + index * lineHeight));
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false;
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		return { texture, viewportHeight, height: canvas.height, width, range: Math.max(0, canvas.height - viewportHeight) };
	}
	dispose() { this.disposed = true; for (const { texture } of this.entries.values()) texture.dispose(); this.entries.clear(); }
}

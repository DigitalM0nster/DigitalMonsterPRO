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
	// Chinese can wrap between characters; Latin brand names still wrap by word.
	const units = locale === "zh" ? (readable.match(/[A-Za-z0-9]+(?:[.’'-][A-Za-z0-9]+)*|[^]/gu) ?? []) : readable.split(" ");
	const lines = []; let line = "";
	for (const unit of units) {
		const next = line + (line && locale !== "zh" ? " " : "") + unit;
		if (line && ctx.measureText(next).width > maxWidth) { lines.push(line.trimEnd()); line = unit.trimStart(); }
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

// All projects share the NIPIGAS presentation: a broad introduction followed by
// numbered chapters. The reading order stays identical on desktop and mobile.
function paintProjectInfo(project, content, locale, mobile) {
	const width = mobile ? 640 : 1536, viewportHeight = Math.round(width / 2.05);
	// The scene scrollbar and its cue share a reserved gutter on every locale.
	const padding = mobile ? 40 : 94, available = width - padding - (mobile ? 116 : 154);
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
	y = text((content.introLabel || filmInfoCopy[locale].purpose).toLocaleUpperCase(locale), body(mobile ? 26 : 24), padding, y, available, 34, locale === "zh" ? 0 : 1.6);
	y = text(project.name.toUpperCase(), heading(mobile ? 62 : 80), padding, y + 14, available, mobile ? 74 : 94);
	y = text(content.purpose, body(mobile ? 35 : 36), padding, y + (mobile ? 24 : 22), available, mobile ? 49 : 50);
	y += mobile ? 48 : 52;
	for (const [index, section] of getFilmInfoSections(content, filmInfoCopy[locale]).entries()) {
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
	if (content.closing) {
		rule(y);
		y = text(content.closing, body(mobile ? 34 : 32), padding, y + 34, available, mobile ? 48 : 46);
	}
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
		return paintProjectInfo(project, filmProjectInfo[project.id][locale], locale, mobile);
	}
	dispose() { this.disposed = true; for (const { texture } of this.entries.values()) texture.dispose(); this.entries.clear(); }
}

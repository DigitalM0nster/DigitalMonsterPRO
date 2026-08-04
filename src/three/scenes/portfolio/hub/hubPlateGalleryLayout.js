import { SITE_MAIN_COLOR, siteMainRgba } from "@/app/config/siteMainColor.js";

export const HUB_PLATE_PANEL_WIDTH = 1280;
export const HUB_PLATE_PANEL_HEIGHT = 720;
export const HUB_PLATE_GALLERY_ITEM_COUNT = 6;
export const HUB_PLATE_GALLERY_ASPECT = 1920 / 945;
const HUB_PLATE_GALLERY_WIDTH = 704;
const HUB_PLATE_GALLERY_SIDE_GAP = 104;
const GALLERY_LABEL_FONT = 'Jura, "Segoe UI", system-ui, sans-serif';

export const HUB_PLATE_GALLERY_LAYOUT = Object.freeze({
	left: Object.freeze({
		x: 288 - HUB_PLATE_GALLERY_WIDTH - HUB_PLATE_GALLERY_SIDE_GAP,
		y: 278,
		width: HUB_PLATE_GALLERY_WIDTH,
		height: HUB_PLATE_GALLERY_WIDTH / HUB_PLATE_GALLERY_ASPECT,
	}),
	center: Object.freeze({
		x: 288,
		y: 278,
		width: HUB_PLATE_GALLERY_WIDTH,
		height: HUB_PLATE_GALLERY_WIDTH / HUB_PLATE_GALLERY_ASPECT,
	}),
	right: Object.freeze({
		x: 288 + HUB_PLATE_GALLERY_WIDTH + HUB_PLATE_GALLERY_SIDE_GAP,
		y: 278,
		width: HUB_PLATE_GALLERY_WIDTH,
		height: HUB_PLATE_GALLERY_WIDTH / HUB_PLATE_GALLERY_ASPECT,
	}),
	controlsY: 688,
});

export const HUB_PLATE_GALLERY_NAV_LAYOUT = Object.freeze({
	baselineY: 670,
	valueBaselineY: 676,
	valueCenterX: 640,
	leftLineStartX: 572,
	leftLineEndX: 592,
	leftChevronX: 456,
	leftDividerX: 559,
	previousCenterX: 501,
	rightDividerX: 721,
	nextCenterX: 779,
	rightChevronX: 816,
	rightLineStartX: 688,
	rightLineEndX: 708,
});

export const HUB_PLATE_GALLERY_NAV_HIT_RECTS = Object.freeze({
	previous: Object.freeze({ x: 438, y: 642, width: 116, height: 56 }),
	next: Object.freeze({ x: 726, y: 642, width: 116, height: 56 }),
});

const GALLERY_NAV = HUB_PLATE_GALLERY_NAV_LAYOUT;

function toUvRect(rect) {
	return Object.freeze([
		rect.x / HUB_PLATE_PANEL_WIDTH,
		1 - (rect.y + rect.height) / HUB_PLATE_PANEL_HEIGHT,
		(rect.x + rect.width) / HUB_PLATE_PANEL_WIDTH,
		1 - rect.y / HUB_PLATE_PANEL_HEIGHT,
	]);
}

export const HUB_PLATE_GALLERY_UV_RECTS = Object.freeze({
	left: toUvRect(HUB_PLATE_GALLERY_LAYOUT.left),
	center: toUvRect(HUB_PLATE_GALLERY_LAYOUT.center),
	right: toUvRect(HUB_PLATE_GALLERY_LAYOUT.right),
});

export function wrapHubPlateGalleryIndex(index, itemCount = HUB_PLATE_GALLERY_ITEM_COUNT) {
	const count = Math.max(1, Math.floor(Number(itemCount) || 1));
	return ((index % count) + count) % count;
}

function isPointInsideRect(x, y, rect) {
	return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function getHubPlateGallerySlotAtPoint(x, y) {
	if (isPointInsideRect(x, y, HUB_PLATE_GALLERY_LAYOUT.left)) {
		return -1;
	}
	if (isPointInsideRect(x, y, HUB_PLATE_GALLERY_LAYOUT.center)) {
		return 0;
	}
	if (isPointInsideRect(x, y, HUB_PLATE_GALLERY_LAYOUT.right)) {
		return 1;
	}
	return null;
}

export function getHubPlateGalleryNavigationDirectionAtPoint(x, y) {
	if (isPointInsideRect(x, y, HUB_PLATE_GALLERY_NAV_HIT_RECTS.previous)) {
		return -1;
	}
	if (isPointInsideRect(x, y, HUB_PLATE_GALLERY_NAV_HIT_RECTS.next)) {
		return 1;
	}
	return 0;
}

function drawRoundedRect(ctx, rect, radius) {
	const { x, y, width, height } = rect;
	const r = Math.min(radius, width * 0.5, height * 0.5);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + width - r, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + r);
	ctx.lineTo(x + width, y + height - r);
	ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
	ctx.lineTo(x + r, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function paintGalleryPanelBase(ctx, rect, active) {
	ctx.save();
	drawRoundedRect(ctx, rect, active ? 9 : 7);
	ctx.clip();
	const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
	gradient.addColorStop(0, active ? "rgba(2, 15, 28, 0.9)" : "rgba(1, 8, 16, 0.96)");
	gradient.addColorStop(0.62, "rgba(0, 5, 12, 0.94)");
	gradient.addColorStop(1, active ? "rgba(0, 15, 27, 0.94)" : "rgba(0, 4, 10, 0.98)");
	ctx.fillStyle = gradient;
	ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
	ctx.restore();

	ctx.save();
	drawRoundedRect(ctx, rect, active ? 9 : 7);
	ctx.strokeStyle = active ? siteMainRgba(0.34) : "rgba(113, 151, 177, 0.2)";
	ctx.lineWidth = active ? 1.2 : 1;
	ctx.stroke();
	ctx.restore();
}

export function paintHubPlateGalleryBase(ctx) {
	paintGalleryPanelBase(ctx, HUB_PLATE_GALLERY_LAYOUT.left, false);
	paintGalleryPanelBase(ctx, HUB_PLATE_GALLERY_LAYOUT.center, true);
	paintGalleryPanelBase(ctx, HUB_PLATE_GALLERY_LAYOUT.right, false);
}

function formatGalleryIndex(index, itemCount) {
	return String(wrapHubPlateGalleryIndex(index, itemCount) + 1).padStart(2, "0");
}

function fillTextWithSpacing(ctx, text, x, y, letterSpacingPx) {
	const characters = Array.from(String(text ?? ""));
	let cursorX = x;
	for (let index = 0; index < characters.length; index += 1) {
		const character = characters[index];
		ctx.fillText(character, cursorX, y);
		cursorX += ctx.measureText(character).width;
		if (index < characters.length - 1) {
			cursorX += letterSpacingPx;
		}
	}
	return cursorX - x;
}

function measureTextWithSpacing(ctx, text, letterSpacingPx) {
	const characters = Array.from(String(text ?? ""));
	return characters.reduce((width, character, index) => (
		width
		+ ctx.measureText(character).width
		+ (index < characters.length - 1 ? letterSpacingPx : 0)
	), 0);
}

function resolveGalleryValueLayout(ctx, selectedIndex, itemCount) {
	const count = Math.max(1, Math.floor(Number(itemCount) || 1));
	const current = formatGalleryIndex(selectedIndex, count);
	const total = String(count).padStart(2, "0");
	ctx.font = `500 17px ${GALLERY_LABEL_FONT}`;
	const currentWidth = measureTextWithSpacing(ctx, current, 1.1);
	ctx.font = `500 13px ${GALLERY_LABEL_FONT}`;
	const slashWidth = measureTextWithSpacing(ctx, "/", 0);
	const totalWidth = measureTextWithSpacing(ctx, total, 0.8);
	const currentToSlashGap = 12;
	const slashToTotalGap = 10;
	const groupWidth = currentWidth + currentToSlashGap + slashWidth + slashToTotalGap + totalWidth;
	const currentX = GALLERY_NAV.valueCenterX - groupWidth * 0.5;
	const slashX = currentX + currentWidth + currentToSlashGap;
	const totalX = slashX + slashWidth + slashToTotalGap;
	return { current, total, currentX, slashX, totalX };
}

export function paintHubPlateGallerySecondaryChrome(
	ctx,
	selectedIndex,
	itemCount = HUB_PLATE_GALLERY_ITEM_COUNT,
) {
	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.lineWidth = 1;
	ctx.strokeStyle = "rgba(126, 175, 205, 0.25)";

	// Reference rail: arrow + label, divider, short line, counter, short line,
	// divider, label + arrow. There are intentionally no outer edge lines.
	ctx.beginPath();
	ctx.moveTo(GALLERY_NAV.leftLineStartX, GALLERY_NAV.baselineY);
	ctx.lineTo(GALLERY_NAV.leftLineEndX, GALLERY_NAV.baselineY);
	ctx.moveTo(GALLERY_NAV.rightLineStartX, GALLERY_NAV.baselineY);
	ctx.lineTo(GALLERY_NAV.rightLineEndX, GALLERY_NAV.baselineY);
	ctx.moveTo(GALLERY_NAV.leftDividerX, GALLERY_NAV.baselineY - 20);
	ctx.lineTo(GALLERY_NAV.leftDividerX, GALLERY_NAV.baselineY + 20);
	ctx.moveTo(GALLERY_NAV.rightDividerX, GALLERY_NAV.baselineY - 20);
	ctx.lineTo(GALLERY_NAV.rightDividerX, GALLERY_NAV.baselineY + 20);
	ctx.stroke();

	ctx.strokeStyle = "rgba(183, 222, 242, 0.68)";
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	ctx.moveTo(GALLERY_NAV.leftChevronX + 8, GALLERY_NAV.baselineY - 10);
	ctx.lineTo(GALLERY_NAV.leftChevronX, GALLERY_NAV.baselineY);
	ctx.lineTo(GALLERY_NAV.leftChevronX + 8, GALLERY_NAV.baselineY + 10);
	ctx.moveTo(GALLERY_NAV.rightChevronX, GALLERY_NAV.baselineY - 10);
	ctx.lineTo(GALLERY_NAV.rightChevronX + 8, GALLERY_NAV.baselineY);
	ctx.lineTo(GALLERY_NAV.rightChevronX, GALLERY_NAV.baselineY + 10);
	ctx.stroke();

	const valueLayout = resolveGalleryValueLayout(ctx, selectedIndex, itemCount);
	ctx.textBaseline = "alphabetic";
	ctx.font = `500 13px ${GALLERY_LABEL_FONT}`;
	ctx.fillStyle = "rgba(178, 211, 230, 0.58)";
	fillTextWithSpacing(ctx, "/", valueLayout.slashX, GALLERY_NAV.valueBaselineY, 0);
	fillTextWithSpacing(
		ctx,
		valueLayout.total,
		valueLayout.totalX,
		GALLERY_NAV.valueBaselineY,
		0.8,
	);
	ctx.restore();
}

export function paintHubPlateGalleryAccentChrome(
	ctx,
	selectedIndex,
	itemCount = HUB_PLATE_GALLERY_ITEM_COUNT,
) {
	ctx.save();
	const valueLayout = resolveGalleryValueLayout(ctx, selectedIndex, itemCount);
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.font = `500 17px ${GALLERY_LABEL_FONT}`;
	ctx.fillStyle = SITE_MAIN_COLOR;
	fillTextWithSpacing(
		ctx,
		valueLayout.current,
		valueLayout.currentX,
		GALLERY_NAV.valueBaselineY,
		1.1,
	);

	ctx.restore();
}

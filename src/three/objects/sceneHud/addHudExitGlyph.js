/**
 * Prepared vector-style exit mark for scene HUD links. It replaces platform
 * Unicode arrows, whose emoji/font rendering differs across iOS and desktop.
 */
export function addHudExitGlyph(ui, id) {
	return ui.add(id, {
		width: 28,
		height: 28,
		values: { default: "" },
		paint(ctx) {
			ctx.strokeStyle = "#ffffff";
			ctx.fillStyle = "#ffffff";
			ctx.lineWidth = 1.4;
			ctx.lineCap = "square";
			ctx.lineJoin = "miter";
			ctx.beginPath();
			ctx.moveTo(4, 22);
			ctx.lineTo(21, 5);
			ctx.moveTo(12, 5);
			ctx.lineTo(21, 5);
			ctx.lineTo(21, 14);
			ctx.stroke();
			ctx.fillRect(3, 21, 2, 2);
			ctx.fillRect(20, 4, 2, 2);
		},
	});
}

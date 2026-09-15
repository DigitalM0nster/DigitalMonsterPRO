/** Shared CSS-pixel composition for prepared 3D artwork, text and hit targets. */
export function resolveContactsResponsiveLayout(width, height) {
 if (width > 1024 && height > 600) return null;
 const portrait = height > width;
 const short = height <= 480;
 const top = short ? 66 : height < 640 ? 80 : 98;
 const bottom = width <= 1024 ? (short ? 54 : 76) : 28;
 const left = width <= 1024 ? (width < 640 ? 22 : 36) : 144;
 const contentWidth = Math.min(width - left * 2, 850);
 const columns = 2, rows = 4;
 const rowHeight = height >= 900 ? 52 : 44;
 const listHeight = rows * rowHeight;
 const titleHeight = height < 600 ? 48 : 76;
 const titleY = top;
 const buttonHeight = 46;
 let modelRect, listX, listY, listWidth, buttonY, buttonX, buttonWidth;
 if (portrait) {
  listWidth = contentWidth; listX = (width - contentWidth) / 2;
  listY = height - bottom - listHeight;
  buttonY = listY - buttonHeight - 16;
  buttonX = listX; buttonWidth = listWidth;
  modelRect = { left: listX + 6, right: listX + listWidth - 6,
   top: titleY + titleHeight + 24, bottom: buttonY - 14 };
 } else {
  listX = Math.max(left + contentWidth * .53, width * .53);
  listWidth = Math.min(width - listX - 24, 440);
  buttonX = listX; buttonWidth = listWidth;
  listY = top + buttonHeight + 12;
  buttonY = top;
  modelRect = { left, right: listX - 30, top: titleY + titleHeight + 22, bottom: height - bottom - 4 };
 }
 return { portrait, columns, rows, rowHeight, listX, listY, listWidth, listHeight,
  top, bottom, titleY, titleHeight, titleX: portrait ? listX : left,
  titleWidth: portrait ? listWidth : modelRect.right - left,
  countY: titleY + titleHeight + 3, buttonY, buttonX, buttonWidth, buttonHeight,
  modelRect, modelCenterY: (modelRect.top + modelRect.bottom) / 2 };
}

export function resolveContactsResponsiveHit(layout, x, y) {
 if (!layout || x < layout.listX || x >= layout.listX + layout.listWidth
  || y < layout.listY || y >= layout.listY + layout.listHeight) return -1;
 const col = Math.floor((x - layout.listX) / (layout.listWidth / layout.columns));
 const row = Math.floor((y - layout.listY) / layout.rowHeight);
 return Math.min(7, row * layout.columns + col);
}

/** Uneven signal blocks. Integer splits cover the image exactly, even on low quality. */
export function createFilmGlitchTiles(low = false) {
  const columns = 128, rows = 64, targetArea = low ? 30 : 18;
  const maxWidth = low ? 10 : 8, maxHeight = low ? 5 : 4;
  let state = 9173;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const tiles = [];
  const split = (x, y, width, height) => {
    const area = width * height;
    if ((width <= maxWidth && height <= maxHeight && area < targetArea * (.35 + random() * .9)) || (width === 1 && height === 1)) {
      tiles.push({ x: x / columns, y: y / rows, width: width / columns, height: height / rows, seed: random() });
      return;
    }
    // A varied aspect target creates both long compression tears and smaller chips.
    const vertical = width > 1 && (height === 1 || (width > maxWidth && height <= maxHeight) || (height <= maxHeight && width / height > 1.2 + random() * 5) || (height > maxHeight && width > maxWidth && width / height > 2.4));
    const length = vertical ? width : height;
    const at = Math.max(1, Math.min(length - 1, Math.round(length * (.16 + random() * .68))));
    if (vertical) {
      split(x, y, at, height);
      split(x + at, y, width - at, height);
    } else {
      split(x, y, width, at);
      split(x, y + at, width, height - at);
    }
  };
  split(0, 0, columns, rows);
  return tiles;
}

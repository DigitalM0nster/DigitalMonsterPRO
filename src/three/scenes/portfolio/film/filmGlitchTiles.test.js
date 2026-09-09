import test from "node:test";
import assert from "node:assert/strict";
import { createFilmGlitchTiles } from "./filmGlitchTiles.js";

for (const low of [false, true]) {
  test(`glitch blocks cover every pixel once, with varied sizes (${low ? "low" : "high"})`, () => {
    const tiles = createFilmGlitchTiles(low);
    const coverage = new Uint8Array(128 * 64);
    for (const tile of tiles) {
      const x = tile.x * 128, y = tile.y * 64;
      const width = tile.width * 128, height = tile.height * 64;
      assert.ok(x >= 0 && y >= 0 && x + width <= 128 && y + height <= 64);
      assert.ok(width <= (low ? 10 : 8) && height <= (low ? 5 : 4), "no large slabs");
      for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) coverage[row * 128 + col]++;
      }
    }
    assert.ok(coverage.every(count => count === 1), "no gaps or overlapping fragments at rest");
    assert.ok(new Set(tiles.map(t => `${t.width},${t.height}`)).size > 14);
    assert.ok(tiles.some(t => t.width / t.height * 2.05 > 8), "contains long signal tears");
    assert.ok(tiles.length < 1500, "bounded instance count");
    assert.deepEqual(tiles, createFilmGlitchTiles(low), "repeatable partition");
  });
}

test("low quality uses fewer fragments", () => {
  assert.ok(createFilmGlitchTiles(true).length < createFilmGlitchTiles(false).length);
});

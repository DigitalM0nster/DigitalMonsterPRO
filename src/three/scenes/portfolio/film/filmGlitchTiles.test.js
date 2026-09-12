import test from "node:test";
import assert from "node:assert/strict";
import { createFilmGlitchTiles } from "./filmGlitchTiles.js";
import { hologramDefaults, normalizeHologramSettings } from "./filmHologramConfig.js";

for (const low of [false, true]) {
  test(`glitch blocks cover every pixel once, with varied sizes (${low ? "low" : "high"})`, () => {
    const tiles = createFilmGlitchTiles(low);
    const coverage = new Uint8Array(256 * 128);
    for (const tile of tiles) {
      const x = tile.x * 256, y = tile.y * 128;
      const width = tile.width * 256, height = tile.height * 128;
      assert.ok(x >= 0 && y >= 0 && x + width <= 256 && y + height <= 128);
      assert.ok(width <= (low ? 7 : 6) && height <= 3, "maximum shard dimensions are approximately three times smaller");
      for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) coverage[row * 256 + col]++;
      }
    }
    assert.ok(coverage.every(count => count === 1), "no gaps or overlapping fragments at rest");
    assert.ok(new Set(tiles.map(t => `${t.width},${t.height}`)).size >= 8);
    assert.ok(tiles.some(t => t.width / t.height * 2.05 > 3.8), "contains short thin signal tears as well as chips");
    assert.ok(tiles.length < (low ? 6500 : 12000), "bounded instance count; two triangles per shard");
    assert.deepEqual(tiles, createFilmGlitchTiles(low), "repeatable partition");
  });
}

test("low quality uses fewer fragments", () => {
  assert.ok(createFilmGlitchTiles(true).length < createFilmGlitchTiles(false).length);
});

test("single hologram settings clamp invalid input and allow turning off each colour layer", () => {
  const settings = normalizeHologramSettings({ density: 99, brightness: NaN, speed: "2", tint: 0, glitchTint: 0, volume: 1 });
  assert.equal(settings.density, 2);
  assert.equal(settings.brightness, 1);
  assert.equal(settings.speed, hologramDefaults.speed);
  assert.equal(settings.tint, 0);
  assert.equal(settings.glitchTint, 0);
  assert.equal(settings.volume, undefined);
  assert.deepEqual(normalizeHologramSettings(null), hologramDefaults);
  settings.tileSize = .45;
  assert.equal(hologramDefaults.tileSize, .6, "editing never mutates defaults");
  assert.deepEqual(normalizeHologramSettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("removing variants preserves original-screen adjustments and adds the new colour", () => {
  const settings = normalizeHologramSettings({ preset: "glass", variants: { original: { speed: .75, density: 1.1 }, glass: { speed: 3, glass: 1, scanlines: .35 } } });
  assert.equal(settings.speed, .75);
  assert.equal(settings.density, 1.1);
  assert.equal(settings.scanlines, hologramDefaults.scanlines);
  assert.equal(settings.tint, hologramDefaults.tint);
  assert.equal(settings.glitchTint, hologramDefaults.glitchTint);
  assert.equal(settings.preset, undefined);
});

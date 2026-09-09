import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeCityWindowCells } from "./cityWindowShader.js";

test("exported facade atlas keeps its authored panes and empty roof/trim cell", () => {
 const directory = new URL("../../../../../public/models/posibility5/", import.meta.url);
 const { windows } = JSON.parse(readFileSync(new URL("city-flow-paths.json", directory)));
 const packed = new Uint8Array(readFileSync(new URL("city-window-mask.bin", directory)));
 const cells = decodeCityWindowCells(packed, windows.size, windows.encoding);
 assert.equal(cells.length, 1024 * 1024);
 assert.equal(cells.filter(value => value > 0).length, windows.cells);
 assert.ok(windows.cells > 100000);
 assert.deepEqual(windows.opening, [0.13, 0.16], "restore the smaller approved opening");
 assert.equal(windows.authoredMetricUv, true, "window grid uses authored face distances, not smooth vertex tangents");
 assert.ok(windows.opening[0] / windows.referenceCarLength < 0.5);
 assert.ok(windows.opening[1] / windows.referenceCarLength < 0.6);
 assert.ok(windows.pitch[0] > windows.opening[0] && windows.pitch[1] > windows.opening[1]);
 assert.equal(cells[windows.size], 0, "unwindowed surfaces must sample an empty cell");
 assert.ok(new Set(cells).size > 5, "architectural modules retain distinct profiles");
 assert.ok(packed.length < cells.length / 8, "transfer stays compact without per-window meshes");
});

test("corrupt window runs fail before creating a GPU texture", () => {
 assert.throws(() => decodeCityWindowCells(new Uint8Array([5, 0, 128]), 2, "rle8"), /Invalid city window run/);
 assert.throws(() => decodeCityWindowCells(new Uint8Array([3, 0, 128]), 2, "rle8"), /Incomplete/);
 assert.throws(() => decodeCityWindowCells(new Uint8Array([4, 0]), 2, "rle8"), /Truncated/);
 assert.deepEqual(Array.from(decodeCityWindowCells(new Uint8Array([2, 0, 96, 2, 0, 0]), 2, "rle8")), [96, 96, 0, 0]);
});

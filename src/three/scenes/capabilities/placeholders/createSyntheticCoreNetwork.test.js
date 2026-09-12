import test from "node:test";
import assert from "node:assert/strict";
import { createSyntheticCoreNetwork } from "./createSyntheticCoreNetwork.js";

test("every moving link endpoint uses the exact node position and animation seed on every tier", () => {
	for (const [detail, count] of [[0.5, 21], [0.75, 27], [1, 36]]) {
		const time = { value: 0 }, assembly = { value: 0 };
		const group = createSyntheticCoreNetwork({ time, assembly, detail });
		const [lines, nodes] = group.children;
		assert.equal(nodes.geometry.attributes.position.count, count);
		assert.ok(lines.geometry.attributes.position.count <= 224);
		const signature = (geometry, i) => [...geometry.attributes.position.array.slice(i * 3, i * 3 + 3),
			geometry.attributes.aSeed.array[i]].join(",");
		const nodeKeys = new Set(Array.from({ length: count }, (_, i) => signature(nodes.geometry, i)));
		for (let i = 0; i < lines.geometry.attributes.position.count; i++) {
			assert.ok(nodeKeys.has(signature(lines.geometry, i)), "detached or differently animated endpoint");
			const other = [...lines.geometry.attributes.aOther.array.slice(i * 3, i * 3 + 3),
				lines.geometry.attributes.aOtherSeed.array[i]].join(",");
			assert.ok(nodeKeys.has(other), "ribbon direction must track the other moving node");
		}
		lines.onBeforeRender({ getCurrentViewport: target => target.set(0, 0, 320, 640) });
		nodes.onBeforeRender({ getPixelRatio: () => 2 });
		assert.deepEqual(lines.material.uniforms.uViewport.value.toArray(), [320, 640]);
		assert.equal(nodes.material.uniforms.uPixelRatio.value, 2);
		for (const object of group.children) {
			assert.equal(object.material.uniforms.uTime, time);
			assert.equal(object.material.uniforms.uAssembly, assembly);
			assert.equal(object.material.depthTest, true);
			assert.equal(object.material.depthWrite, false);
			assert.equal(object.frustumCulled, false);
			assert.ok(Object.values(object.geometry.attributes).every(a => a.version === 0));
			for (const x of object.geometry.attributes.position.array.filter((_, i) => i % 3 === 0)) {
				assert.ok(x > 2.5 && x < 4, "network must remain on the right of the core");
			}
			object.geometry.dispose(); object.material.dispose();
		}
	}
});

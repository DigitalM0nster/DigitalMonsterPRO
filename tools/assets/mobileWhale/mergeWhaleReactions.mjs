import { readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const asset = new URL('../../../public/models/home/whale-mobile.glb', import.meta.url);
function read(url) {
  const bytes = readFileSync(url), size = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + size)), binary: bytes.subarray(28 + size) };
}
const { json, binary } = read(asset);
// Preserve every geometry byte. Re-running replaces, rather than accumulates, clips.
json.extras ||= {};
const base = json.extras.whaleReactionBase ||= {
  bytes: binary.length, accessors: json.accessors.length, views: json.bufferViews.length,
};
json.accessors.length = base.accessors;
json.bufferViews.length = base.views;
json.animations = json.animations.filter(a => !a.name.startsWith('Whale_Look')
  && a.name !== 'Whale_ClickResponse' && a.name !== 'Whale_EntranceStroke');
const chunks = [binary.subarray(0, base.bytes)];
let length = base.bytes;
const actions = ['Whale_LookLeft', 'Whale_LookRight', 'Whale_LookUp', 'Whale_LookDown',
  'Whale_ClickResponse', 'Whale_EntranceStroke'];
for (const name of actions) {
  const source = read(new URL(`../../../output/mobile-whale/reactions/${name}.glb`, import.meta.url));
  const input = source.json.animations[0];
  if (!input) throw new Error(`Blender did not export ${name}`);
  const output = { name, channels: [], samplers: [] }, accessors = new Map();
  const copyAccessor = (index) => {
    if (accessors.has(index)) return accessors.get(index);
    const accessor = source.json.accessors[index], view = source.json.bufferViews[accessor.bufferView];
    const data = source.binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const padding = Buffer.alloc((4 - length % 4) % 4);
    chunks.push(padding, data); length += padding.length;
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({ ...view, buffer: 0, byteOffset: length }); length += data.length;
    const result = json.accessors.length;
    json.accessors.push({ ...accessor, bufferView }); accessors.set(index, result);
    return result;
  };
  for (const channel of input.channels) {
    const nodeName = source.json.nodes[channel.target.node].name;
    const node = json.nodes.findIndex(n => n.name === nodeName);
    // Reactions affect bone rotation only; swimming retains root suspension.
    if (channel.target.path !== 'rotation' || !json.skins[0].joints.includes(node)) continue;
    const sampler = input.samplers[channel.sampler];
    output.channels.push({ target: { node, path: 'rotation' }, sampler: output.samplers.length });
    output.samplers.push({ ...sampler, input: copyAccessor(sampler.input), output: copyAccessor(sampler.output) });
  }
  if (output.channels.length !== json.skins[0].joints.length) throw new Error(`${name}: incomplete bone animation`);
  json.animations.push(output);
}
chunks.push(Buffer.alloc((4 - length % 4) % 4));
const bin = Buffer.concat(chunks); json.buffers[0].byteLength = bin.length;
const text = Buffer.from(JSON.stringify(json));
const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + bin.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4);
writeFileSync(asset, Buffer.concat([header, padded, binHeader, bin]));
console.log(`Whale: preserved surface + swim, merged ${actions.length} Blender actions (${bin.length} binary bytes)`);

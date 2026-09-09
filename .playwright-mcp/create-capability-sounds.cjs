const fs = require('node:fs');
const path = require('node:path');
const sampleRate = 22050;
function softField(seconds) {
  // A dense, gently rounded sine cloud. No resonant noise peaks, distortion,
  // low motor fundamental, bell attacks or high-frequency electric rasp.
  let seed = 58271;
  const partials = [];
  for (let i = 0; i < 160; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const frequency = 280 + seed / 4294967296 * 1450;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    partials.push({
      frequency: Math.round(frequency * seconds) / seconds,
      phase: seed / 4294967296 * Math.PI * 2,
      gain: Math.exp(-0.5 * Math.pow((frequency - 520) / 125, 2))
        + 0.16 * Math.exp(-0.5 * Math.pow((frequency - 1160) / 230, 2)),
    });
  }
  return (t, channel) => {
    let sum = 0;
    for (const partial of partials) {
      const width = channel * 0.22 * Math.sin(partial.phase);
      sum += Math.sin(2 * Math.PI * partial.frequency * t + partial.phase + width) * partial.gain;
    }
    return sum;
  };
}
function render(name, seconds, energy) {
  const length = Math.round(seconds * sampleRate), crossfade = energy ? 0 : 3308;
  const field = energy ? softField(seconds) : null;
  const channels = [];
  for (let channel = 0; channel < 2; channel++) {
    const data = new Float32Array(length);
    let seed = 1729 + channel * 97, low = 0, high = 0;
    const cutoff = energy ? 3000 : 950, floor = energy ? 430 : 65;
    const lowRate = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
    const highRate = 1 - Math.exp(-2 * Math.PI * floor / sampleRate);
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1, t = i / sampleRate;
      low += (noise - low) * lowRate; high += (noise - high) * highRate;
      if (energy) {
        data[i] = field(t, channel);
      } else {
        const breath = 0.84 + 0.16 * Math.sin(t * Math.PI * 2 / seconds + channel * 0.7);
        data[i] = (low - high) * 0.7 * breath;
      }
    }
    for (let i = 0; i < crossfade; i++) {
      const mix = i / crossfade;
      data[i] = data[length - crossfade + i] * (1 - mix) + data[i] * mix;
    }
    const loop = data.subarray(0, length - crossfade);
    if (energy) {
      const rms = Math.sqrt(loop.reduce((sum, value) => sum + value * value, 0) / loop.length);
      for (let i = 0; i < loop.length; i++) loop[i] *= 0.075 / rms;
    }
    channels.push(loop);
  }
  const count = channels[0].length, result = Buffer.alloc(44 + count * 4);
  result.write('RIFF', 0); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(2, 22);
  result.writeUInt32LE(sampleRate, 24); result.writeUInt32LE(sampleRate * 4, 28);
  result.writeUInt16LE(4, 32); result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) for (let c = 0; c < 2; c++) result.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * 2 + c) * 2);
  fs.writeFileSync(path.resolve('public/audio', name), result);
}
render('capability_flight_air.wav', 6, false);
render('capability_line_silk.wav', 16, true);

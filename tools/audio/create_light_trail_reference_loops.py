"""Offline spectral stretching of the user-supplied laser references.

Inputs are mono PCM16 WAV excerpts at 22050 Hz:
  swing: https://www.youtube.com/shorts/7YzQI9MGXCk, 00:00–00:01
  hum:   https://www.youtube.com/watch?v=Utyfma7bBlc, 00:03–00:05
Usage: python create_light_trail_reference_loops.py swing.wav hum.wav public/audio
Requires numpy. No short-grain repetition or runtime synthesis. The original
spectral phases advance continuously, retaining the laser's pitch and texture.
Source excerpts are not shipped with the site.
"""

import argparse
from pathlib import Path
import wave

import numpy as np

RATE = 22050


def read(path):
    with wave.open(str(path)) as wav:
        assert wav.getsampwidth() == 2 and wav.getframerate() == RATE
        data = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
        return data.reshape(-1, wav.getnchannels()).mean(axis=1) / 32768.0


def rms(data):
    return np.sqrt(np.mean(data * data))


def soften(data, low, high):
    # Circular filters preserve the final loop seam. Remove rumble and the
    # piercing upper harmonics, retaining the recording's textured midrange.
    frequencies = np.fft.rfftfreq(len(data), 1 / RATE)
    response = 1 / np.sqrt(1 + (low / np.maximum(frequencies, 0.001)) ** 6)
    response /= np.sqrt(1 + (frequencies / high) ** 8)
    return np.fft.irfft(np.fft.rfft(data) * response, n=len(data))


def level(data, target, window=0.008):
    frequencies = np.fft.rfftfreq(len(data), 1 / RATE)
    envelope = np.fft.irfft(
        np.fft.rfft(data * data) * np.exp(-0.5 * (2 * np.pi * frequencies * window) ** 2),
        n=len(data),
    )
    # Flatten rapid loudness flutter while retaining the reference's spectrum.
    # This is an offline edit, not a compressor pumping in the live audio graph.
    data = data * np.clip(rms(data) / np.sqrt(np.maximum(envelope, 1e-10)), 0.2, 5)
    return data * target / rms(data)


def sustain(data, seconds):
    """Phase-continuous STFT stretch: do not retrigger waveform snippets."""
    size, hop = 4096, 512
    window = np.hanning(size)
    padded = np.pad(data, (size // 2, size // 2), mode="reflect")
    frames = np.lib.stride_tricks.sliding_window_view(padded, size)[::hop]
    spectrum = np.fft.rfft(frames * window, axis=1)
    magnitude, angle = np.abs(spectrum), np.angle(spectrum)
    expected = 2 * np.pi * hop * np.arange(size // 2 + 1) / size
    phase = angle[0].copy()
    length = int(seconds * RATE)
    count = int(np.ceil((length + size) / hop))
    output = np.zeros(count * hop + size)
    weights = np.zeros_like(output)
    for index, position in enumerate(np.linspace(0, len(spectrum) - 1.001, count)):
        before = int(position)
        mix = position - before
        amplitudes = magnitude[before] * (1 - mix) + magnitude[before + 1] * mix
        block = np.fft.irfft(amplitudes * np.exp(1j * phase), n=size)
        start = index * hop
        output[start:start + size] += block * window
        weights[start:start + size] += window * window
        deviation = angle[before + 1] - angle[before] - expected
        deviation -= 2 * np.pi * np.round(deviation / (2 * np.pi))
        phase += expected + deviation
    output /= np.maximum(weights, 1e-8)
    return output[size:size + length]


def loop_join(data, seconds):
    count = int(seconds * RATE)
    weight = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, count))
    result = data[:-count].copy()
    result[:count] = data[-count:] * (1 - weight) + data[:count] * weight
    return result


def write(path, data):
    assert np.all(np.isfinite(data)) and np.max(np.abs(data)) < 0.8
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(np.rint(data * 32767).astype("<i2").tobytes())
    print(f"{path.name}: {len(data) / RATE:.2f}s, RMS {rms(data):.4f}, peak {max(abs(data)):.4f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("swing", type=Path)
    parser.add_argument("hum", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    # Keep the second reference's actual sustained sound, without its onset.
    hum = read(args.hum)[int(0.12 * RATE):int(1.94 * RATE)]
    hum = np.interp(np.arange(0, len(hum) - 1, 0.94), np.arange(len(hum)), hum)
    hum = loop_join(sustain(hum, 28), 2)
    hum = level(soften(hum, 135, 2450), 0.075)
    write(args.output / "capability_line_continuous_hum.wav", hum)

    # Stretch the complete sustained body of the first reference. Its motion
    # becomes a long spectral drift instead of 75 ms grain attacks (13 Hz).
    swing = read(args.swing)[int(0.23 * RATE):int(0.96 * RATE)]
    result = loop_join(sustain(swing, 33), 2)
    result = level(soften(result, 190, 2900), 0.08)
    write(args.output / "capability_line_continuous_sweep.wav", result)


if __name__ == "__main__":
    main()

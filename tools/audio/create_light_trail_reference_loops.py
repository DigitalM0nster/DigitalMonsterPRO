"""Offline editing of the two user-supplied laser references; no runtime synthesis.

Inputs are mono PCM16 WAV excerpts at 22050 Hz:
  swing: https://www.youtube.com/shorts/7YzQI9MGXCk, 00:00–00:01
  hum:   https://www.youtube.com/watch?v=Utyfma7bBlc, 00:03–00:05
Usage: python create_light_trail_reference_loops.py swing.wav hum.wav public/audio
Requires numpy. Source excerpts are not shipped with the site.
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


def level(data, target, window=0.14):
    frequencies = np.fft.rfftfreq(len(data), 1 / RATE)
    envelope = np.fft.irfft(
        np.fft.rfft(data * data) * np.exp(-0.5 * (2 * np.pi * frequencies * window) ** 2),
        n=len(data),
    )
    # Long, bounded gain correction removes the reference's sharp bursts.
    data = data * np.clip(rms(data) / np.sqrt(np.maximum(envelope, 1e-10)), 0.55, 1.7)
    return data * target / rms(data)


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
    hum = loop_join(hum, 0.32)
    hum = level(soften(hum, 135, 2450), 0.075)
    write(args.output / "capability_line_reference_hum.wav", np.tile(hum, 5))

    # Spread the first reference's moving-light texture over overlapping grains.
    # No repeated attack, synthetic oscillator, random pitch, or per-frame DSP.
    swing = read(args.swing)[int(0.23 * RATE):int(0.96 * RATE)]
    rng = np.random.default_rng(7109)
    length = RATE * 10
    result = np.zeros(length)
    weight_sum = np.zeros(length)
    grain_length = int(RATE * 0.26)
    window = np.hanning(grain_length)
    for position in range(0, length, int(RATE * 0.075)):
        start = int(rng.integers(0, len(swing) - grain_length))
        indices = (position + np.arange(grain_length)) % length
        result[indices] += swing[start:start + grain_length] * window
        weight_sum[indices] += window * window
    result /= np.sqrt(np.maximum(weight_sum, 1e-8))
    result = level(soften(result, 190, 2900), 0.08)
    write(args.output / "capability_line_reference_sweep.wav", result)


if __name__ == "__main__":
    main()

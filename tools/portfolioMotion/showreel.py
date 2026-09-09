"""Assemble an unmodified capture proof, not a music-approved showreel.

The rejected first film invented layouts, cropped whole pages and synthesized an
unsuitable score. This path edits only in time: no retypesetting or crop.
"""
from __future__ import annotations

import argparse
from bisect import bisect_left
from functools import lru_cache
import json
from pathlib import Path
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FPS = 25
# Provisional visual cuts, not a claimed musical edit.
SHOTS = [('home', .20, 2.40), ('select', .10, 2.40),
         ('case', .95, 3.00), ('case', 3.95, .88)]


class Captures:
    def __init__(self, directory):
        self.directory = directory
        self.groups, self.times = {}, {}
        for group, start, duration in SHOTS:
            if group not in self.groups:
                rows = json.loads((directory / f'{group}.json').read_text(encoding='utf-8'))
                if len(rows) < 2:
                    raise ValueError(f'Incomplete capture: {group}')
                times = [row['t'] for row in rows]
                if any(b <= a for a, b in zip(times, times[1:])):
                    raise ValueError(f'Non-monotonic timestamps: {group}')
                self.groups[group], self.times[group] = rows, times
            if start + duration > self.times[group][-1] + 1/FPS:
                raise ValueError(f'{group}: shot extends beyond recorded content')
        with Image.open(directory / self.groups['home'][0]['file']) as frame:
            self.size = frame.size

    @lru_cache(maxsize=12)
    def image(self, filename):
        with Image.open(self.directory / filename) as source:
            if source.size != self.size:
                raise ValueError(f'Viewport changed within recording: {filename}')
            return source.convert('RGB')

    def frame(self, group, time):
        times = self.times[group]
        i = min(len(times)-1, bisect_left(times, time))
        if i and abs(times[i-1]-time) < abs(times[i]-time):
            i -= 1
        return self.image(self.groups[group][i]['file'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture-root', type=Path,
                        default=ROOT/'output/showreels/hubarch/sources/capture-v2')
    parser.add_argument('--output', type=Path, default=ROOT/'output/showreels/hubarch')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--silent', action='store_true')
    mode.add_argument('--music', type=Path)
    args = parser.parse_args()
    if args.music and not args.music.is_file():
        raise FileNotFoundError(args.music)
    captures = Captures(args.capture_root)
    args.output.mkdir(parents=True, exist_ok=True)
    width, height = captures.size
    name = 'hubarch-source-proof-v2' if args.silent else 'hubarch-music-audition-v2'
    output = args.output / f'{name}.mp4'
    counts = [round(length * FPS) for _, _, length in SHOTS]
    duration = sum(counts)/FPS
    command = [args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{width}x{height}',
               '-r', str(FPS), '-i', 'pipe:0']
    if args.music:
        command += ['-i', str(args.music), '-map', '0:v', '-map', '1:a',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-af', f'afade=t=out:st={duration-.3}:d=0.3', '-shortest']
    else:
        command += ['-an']
    command += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
                '-pix_fmt', 'yuv420p', '-threads', '4', '-movflags', '+faststart', str(output)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for (group, start, _), count in zip(SHOTS, counts):
            for n in range(count):
                process.stdin.write(captures.frame(group, start+n/FPS).tobytes())
            print(f'{group}: {count} frames, original {width}x{height} viewport', flush=True)
        process.stdin.close()
        error = process.stderr.read().decode(errors='replace')
        if process.wait() != 0:
            raise RuntimeError(error)
    except BaseException:
        process.kill(); process.wait(); raise
    captures.frame('home', 1.4).save(args.output/'source-home-v2.png')
    captures.frame('select', 2.6).save(args.output/'source-gallery-v2.png')
    metadata = {
        'status': 'source-fidelity proof; music and creative direction unresolved',
        'source': 'https://hubarch.ru/ru',
        'capture': 'Browser screenshots at recorded wall-clock timestamps',
        'sampling': 'Variable source cadence resampled to 25 fps without pixel interpolation',
        'viewport': [width, height], 'duration': duration, 'shots': SHOTS,
        'music': str(args.music) if args.music else None,
        'processing': 'Temporal cuts only. Every frame retains the entire viewport.',
    }
    (args.output/f'{name}.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Proof ready: {output} ({duration:.2f}s)', flush=True)


if __name__ == '__main__':
    main()

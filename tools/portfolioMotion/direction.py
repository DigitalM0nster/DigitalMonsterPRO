"""Directed Hubarch visual study using intact, authentic website recordings.

The camera transforms the entire source viewport as a single rigid plane. No
glyphs, images or layout are rebuilt. Macro framing is intentional and resolves
to a complete page view. The accepted v2 source proof remains separate.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from showreel import Captures, ROOT

FPS = 60
BACKGROUND = (250, 249, 244)


@dataclass(frozen=True)
class Pose:
    x: float = 640
    y: float = 360
    scale: float = 1
    yaw: float = 0
    pitch: float = 0
    roll: float = 0


@dataclass(frozen=True)
class Shot:
    name: str
    length: float
    source: str
    clock: tuple
    camera: tuple


# Unequal shot lengths: read the type, reveal its context, watch a choice,
# then enter the selected project. Source clocks retain the real interactions.
SHOTS = (
    Shot('Architecture / native headline', 1.30, 'home', ((0, .29), (1.3, .29)), (
        (0, Pose(443, 301, 1.77, -7, 3, -.7)),
        (1.3, Pose(457, 301, 1.66, -3, 1, -.2)),
    )),
    Shot('Interiors / complementary detail', 1.05, 'home', ((0, 1.16), (1.05, 1.16)), (
        (0, Pose(886, 414, 1.77, 5, -2, .5)),
        (1.05, Pose(874, 412, 1.7, 2, -1, .2)),
    )),
    Shot('Reveal the original composition', 1.85, 'home', ((0, 1.16), (1.85, 1.16)), (
        (0, Pose(874, 412, 1.7, 2, -1, .2)),
        (.12, Pose(874, 412, 1.7, 2, -1, .2)),
        (1.45, Pose(640, 360, .92)),
        (1.85, Pose(640, 360, .92)),
    )),
    Shot('Actual gallery navigation', 1.30, 'gallery', ((0, .46), (1.3, 1.76)), (
        (0, Pose(640, 360, .92)),
        (1.3, Pose(640, 360, 1)),
    )),
    Shot('The project selector / detail', .75, 'select', ((0, .10), (.75, .65)), (
        (0, Pose(326, 366, 1.86, -4, 1)),
        (.75, Pose(328, 366, 1.82, -3, 1)),
    )),
    Shot('Follow the native selection', 1.90, 'select', ((0, .65), (1.3, 1.95), (1.9, 2.55)), (
        (0, Pose(328, 366, 1.82, -3, 1)),
        (.14, Pose(328, 366, 1.82, -3, 1)),
        (1.55, Pose(640, 360, 1)),
        (1.9, Pose(640, 360, 1)),
    )),
    Shot('Enter the selected project', 2.05, 'case', ((0, 1.30), (1.1, 2.40), (2.05, 3.35)), (
        (0, Pose(640, 360, 1)),
        (.45, Pose(640, 360, 1)),
        (2.05, Pose(640, 360, 1)),
    )),
    Shot('Case / final breath', .95, 'case', ((0, 3.35), (.95, 4.30)), (
        (0, Pose(640, 360, 1)),
        (.95, Pose(640, 360, 1)),
    )),
)


def pair(keys, t):
    for left, right in zip(keys, keys[1:]):
        if t <= right[0]:
            p = np.clip((t-left[0])/(right[0]-left[0]), 0, 1)
            return left[1], right[1], float(p)
    return keys[-1][1], keys[-1][1], 0


def pose_at(shot, t):
    a, b, p = pair(shot.camera, t)
    p = p*p*p*(p*(p*6-15)+10)
    return Pose(**{key: value+(getattr(b, key)-value)*p
                   for key, value in vars(a).items()})


def source_at(shot, t):
    a, b, p = pair(shot.clock, t)
    return a+(b-a)*p


def project(source, pose):
    """Rigid planar perspective, inverse mapped once; original pixels inside."""
    width, height = source.size
    yaw, pitch, roll = np.radians([pose.yaw, pose.pitch, pose.roll])
    cy, sy, cx, sx, cz, sz = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch), np.cos(roll), np.sin(roll)
    rotate = (np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @
              np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @
              np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
    focal = 1800
    original = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=float)
    points = np.column_stack((original - [pose.x, pose.y], np.zeros(4))) @ rotate.T
    screen = points[:, :2]*focal/(focal/pose.scale-points[:, 2:3]) + [width/2, height/2]
    rows, values = [], []
    for (x, y), (u, v) in zip(screen, original):
        rows += [[x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]]
        values += [u, v]
    coefficients = np.linalg.solve(np.asarray(rows), np.asarray(values))
    return source.transform(source.size, Image.Transform.PERSPECTIVE, coefficients,
                            resample=Image.Resampling.BICUBIC, fillcolor=BACKGROUND)


def render_frame(captures, shot, t):
    source = captures.frame(shot.source, source_at(shot, t))
    # Keep thin type sharp. Temporal blending produced visibly doubled glyphs;
    # camera movement is sampled at 60 fps instead. No optical-flow text morph.
    return project(source, pose_at(shot, t))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--stills-only', action='store_true')
    args = parser.parse_args()
    output = ROOT/'output/showreels/hubarch'
    captures = Captures(output/'sources/capture-v2')
    gallery = json.loads((captures.directory/'gallery.json').read_text(encoding='utf-8'))
    captures.groups['gallery'] = gallery
    captures.times['gallery'] = [row['t'] for row in gallery]
    for shot in SHOTS:
        if shot.clock[-1][1] > captures.times[shot.source][-1]:
            raise ValueError(f'{shot.name}: source time beyond actual recording')
    if captures.size != (1280, 720):
        raise ValueError('Camera was authored for the original 1280 x 720 viewport')
    counts = [round(shot.length*FPS) for shot in SHOTS]
    total = sum(counts)/FPS
    name = 'hubarch-direction-v3'
    # Board is review documentation only, never included in the film.
    board = Image.new('RGB', (1280, 4*390), (26, 26, 25))
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
    elapsed = 0
    for index, (shot, count) in enumerate(zip(SHOTS, counts)):
        still = render_frame(captures, shot, shot.length*.70)
        still.save(output/f'direction-v3-{index+1:02d}.jpg', quality=94)
        x, y = index%2*640, index//2*390
        board.paste(still.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+14, y+365), f'{elapsed:04.1f}s  {shot.name}', font=font, fill=(230, 230, 220))
        elapsed += count/FPS
    board.save(output/f'{name}-board.jpg', quality=93)
    if args.stills_only:
        return
    command = [args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', str(FPS),
               '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
               '-pix_fmt', 'yuv420p', '-threads', '4', '-movflags', '+faststart',
               str(output/f'{name}.mp4')]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for shot, count in zip(SHOTS, counts):
            for frame in range(count):
                process.stdin.write(render_frame(captures, shot, frame/FPS).tobytes())
            print(f'{shot.name}: {count} frames', flush=True)
        process.stdin.close()
        error = process.stderr.read().decode(errors='replace')
        if process.wait() != 0:
            raise RuntimeError(error)
    except BaseException:
        process.kill()
        process.wait()
        raise
    metadata = {
        'status': 'visual direction study, silent; music selection is pending',
        'source': 'actual browser recordings of https://hubarch.ru/ru',
        'size': list(captures.size), 'fps': FPS, 'duration': total,
        'processing': 'Rigid camera transform of complete source frames; original typography and image compositions retained. Intentional macro shots reveal into wide views.',
        'cadence': 'Camera rendered at 60 fps; captured site motion retains variable original cadence.',
        'shots': [{'name': shot.name, 'duration': count/FPS, 'source': shot.source,
                   'source_clock': shot.clock} for shot, count in zip(SHOTS, counts)],
    }
    (output/f'{name}.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Ready: {output/name}.mp4 ({total:.2f}s)', flush=True)


if __name__ == '__main__':
    main()

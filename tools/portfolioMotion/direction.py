"""Digital Monster card film: intact viewports, downscaling, fixed camera.

Replaces the rejected v3 macro treatment. Nothing inside the website is cropped,
re-typeset or enlarged. The brand environment belongs to Digital Monster for
every project; the source website retains its own original design and colours.
"""
from __future__ import annotations

import argparse
from bisect import bisect_left
from dataclasses import dataclass, replace
from functools import lru_cache
import json
import math
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from showreel import ROOT
from digitalMonsterStyle import DigitalMonsterStyle
from elementLift import draw_photo, lift_amount, photo_geometry, split_photo
from projects import PROJECTS, ProjectCaptures
from musicEdit import BEAT, MUSIC_DURATION, MUSIC_DIR

SIZE = (1920, 1080)
FPS = 60
DURATION = 11
PAD = 16
CHROME_HEIGHT = 48
CONTENT_ORIGIN = (PAD, PAD+CHROME_HEIGHT)
CARD_SIZE = (1280+PAD*2, 720+PAD*2+CHROME_HEIGHT)


@dataclass(frozen=True)
class Pose:
    x: float
    y: float
    scale: float
    yaw: float = 0
    pitch: float = 0
    roll: float = 0


GROUPS = ('home', 'select', 'case')


def angle_at(group, t, beat_sync=False):
    # One shared, infinitely smooth clock. Slow near each presentation angle,
    # faster in the handoff, but never stopped at a keyframe or hard clamped.
    u = math.tau*t/(MUSIC_DURATION if beat_sync else DURATION)
    phase = u-((.86 if beat_sync else .72)/3)*math.sin(3*u)
    if beat_sync:
        # Phrase accents every eight beats; a restrained one-beat speed pulse.
        # The derivative stays positive, so the shared orbit never snaps/stops.
        phase -= .08/24*math.sin(24*u)
    return phase-GROUPS.index(group)*math.tau/3


def pose_at(group, t, beat_sync=False):
    angle = angle_at(group, t, beat_sync)
    side, depth = math.sin(angle), math.cos(angle)
    return Pose(960+535*side, 535+80*depth+52*side,
                .54+.26*depth, -22*side, 3+1.5*depth, -2.2*side)


def layer_order(t, beat_sync=False):
    return tuple(sorted(GROUPS, key=lambda group: math.cos(angle_at(group, t, beat_sync))))


def project_points(pose, points):
    yaw, pitch, roll = np.radians([pose.yaw, pose.pitch, pose.roll])
    cy, sy, cx, sx, cz, sz = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch), np.cos(roll), np.sin(roll)
    rotation = (np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @
                np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @
                np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
    points = points @ rotation.T
    focal = 2200
    return points[:, :2]*focal/(focal/pose.scale-points[:, 2:3]) + [pose.x, pose.y]


def corners(pose, depth=0, card_size=CARD_SIZE):
    width, height = card_size
    original = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=float)
    points = np.column_stack((original-[width/2, height/2], np.full(4, depth)))
    return original, project_points(pose, points)


def homography(source, target):
    rows, values = [], []
    for (x, y), (u, v) in zip(source, target):
        rows += [[x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]]
        values += [u, v]
    return np.append(np.linalg.solve(rows, values), 1).reshape(3, 3)


def max_pixel_scale(matrix, rect=None):
    """Largest local stretch, including perspective, across the viewport."""
    a, b, c, d, e, f, g, h, _ = matrix.flat
    maximum = 0
    rect = rect or (*CONTENT_ORIGIN, CONTENT_ORIGIN[0]+1280, CONTENT_ORIGIN[1]+720)
    for x in np.linspace(rect[0], rect[2], 9):
        for y in np.linspace(rect[1], rect[3], 7):
            divisor = g*x+h*y+1
            u, v = a*x+b*y+c, d*x+e*y+f
            jacobian = np.array([[a*divisor-u*g, b*divisor-u*h],
                                 [d*divisor-v*g, e*divisor-v*h]]) / divisor**2
            maximum = max(maximum, np.linalg.svd(jacobian, compute_uv=False)[0])
    return float(maximum)


class Film:
    def __init__(self, project_id='hubarch', beat_sync=False):
        self.beat_sync = beat_sync
        self.duration = MUSIC_DURATION if beat_sync else DURATION
        self.project = PROJECTS[project_id]
        self.output = ROOT/'output/showreels'/project_id
        self.name = f"{project_id}-browser-clean-{self.project.get('version', 'v1')}"
        if beat_sync:
            self.name = f'{project_id}-beat-v1'
        self.lift = self.project['lift']
        if beat_sync and self.lift:
            peak_beat = 2 if self.lift.group == 'home' else 10
            self.lift = replace(self.lift, start=(peak_beat-1.5)*BEAT, end=(peak_beat+1.5)*BEAT)
        self.audio = MUSIC_DIR/f'{project_id}-edit.wav' if beat_sync else None
        self.source_size = self.project.get('source_size', (1280, 720))
        self.card_size = (self.source_size[0]+PAD*2, self.source_size[1]+PAD*2+CHROME_HEIGHT)
        self.captures = ProjectCaptures(self.output/self.project['capture'], self.source_size)
        self.style = DigitalMonsterStyle(SIZE, self.card_size, PAD, self.project['address'])
        self.frame = self.style.bezel

    @lru_cache(maxsize=24)
    def card(self, filename, mip=1):
        if mip != 1:
            return self.card(filename).resize(
                (round(self.card_size[0]*mip), round(self.card_size[1]*mip)), Image.Resampling.LANCZOS)
        card = self.frame.copy()
        # A 1:1 paste into a separate bezel; no overlays, masks or resize on UI.
        card.paste(self.captures.image(filename), CONTENT_ORIGIN)
        return card

    def source(self, group, t, mip=1):
        t *= DURATION/self.duration
        source_time = {'home': min(.15+t, 4.0),
                       'select': float(np.clip(t-2.4, .1, 3.2)),
                       'case': float(np.clip(2.05+t-6.2, 2.05, 4.7))}[group]
        times = self.captures.times[group]
        i = min(len(times)-1, bisect_left(times, source_time))
        if i and abs(times[i-1]-source_time) < abs(times[i]-source_time):
            i -= 1
        return self.card(self.captures.groups[group][i]['file'], mip)

    def draw_card(self, canvas, group, t, *, pose_override=None, lift_override=None, quads=None):
        pose = pose_override or pose_at(group, t, self.beat_sync)
        original, projected = corners(pose, card_size=self.card_size)
        if quads is not None:
            projected = quads[0]
        # Rasterize only the card bounds instead of full-screen alpha layers.
        left, top = np.floor(projected.min(axis=0)-3).astype(int)
        right, bottom = np.ceil(projected.max(axis=0)+3).astype(int)
        left, top = max(0, left), max(0, top)
        right, bottom = min(canvas.width, right), min(canvas.height, bottom)
        if right <= left or bottom <= top:
            return
        matrix = homography(projected-[left, top], original)
        # Prefilter smaller cards so fine website type does not shimmer.
        mip = .5 if pose.scale <= .44 else 1
        amount = lift_amount(t, self.lift) if self.lift and group == self.lift.group else 0
        if lift_override is not None:
            amount = lift_override
        native = self.source(group, t, 1 if amount else mip)
        if amount:
            native, photo = split_photo(native, CONTENT_ORIGIN, self.lift)
            if mip != 1:
                native = native.resize((round(self.card_size[0]*mip), round(self.card_size[1]*mip)),
                                       Image.Resampling.LANCZOS)
        matrix[:2] *= mip
        card = native.transform((right-left, bottom-top),
                    Image.Transform.PERSPECTIVE, matrix.flat[:8], Image.Resampling.BICUBIC)
        back = quads[1] if quads is not None else corners(pose, depth=-9, card_size=self.card_size)[1]
        self.style.frame_volume(canvas, homography(original, projected), homography(original, back))
        canvas.alpha_composite(card, (left, top))
        if amount:
            source, points, ground = photo_geometry(amount, CONTENT_ORIGIN, self.card_size, self.lift)
            draw_photo(canvas, photo, source, project_points(pose, points),
                       project_points(pose, ground), amount, homography)

    def render(self, t):
        canvas = self.style.background(t)
        for group in layer_order(t, self.beat_sync):
            self.draw_card(canvas, group, t)
        return canvas.convert('RGB')

    def validate(self):
        largest, min_margin, largest_lift = 0, float('inf'), 0
        previous_order = layer_order(-1/FPS, self.beat_sync)
        handoffs = 0
        for frame in range(round(self.duration*FPS)):
            time = frame/FPS
            order = layer_order(time, self.beat_sync)
            for group in GROUPS:
                original, projected = corners(pose_at(group, frame/FPS, self.beat_sync), card_size=self.card_size)
                margin = min(projected.min(), (np.array(SIZE)-projected).min())
                min_margin = min(min_margin, float(margin))
                if margin < 20:
                    raise ValueError(f'Card cropped at {frame/FPS:.3f}: {group}')
                scale = max_pixel_scale(homography(original, projected),
                                        (*CONTENT_ORIGIN, CONTENT_ORIGIN[0]+self.source_size[0], CONTENT_ORIGIN[1]+self.source_size[1]))
                largest = max(largest, scale)
                if scale > 1:
                    raise ValueError(f'Website enlarged at {frame/FPS:.3f}: {group}')
                if self.lift and group == self.lift.group and lift_amount(time, self.lift):
                    source, points, _ = photo_geometry(lift_amount(time, self.lift), CONTENT_ORIGIN, self.card_size, self.lift)
                    lifted = project_points(pose_at(group, time, self.beat_sync), points)
                    width, height = source[2]
                    stretch = max_pixel_scale(homography(source, lifted), (0, 0, width, height))
                    largest_lift = max(largest_lift, stretch)
                    if stretch > 1 or np.any(lifted < 20) or np.any(lifted > np.array(SIZE)-20):
                        raise ValueError(f'Lift enlarged or cropped the original image at {time}')
            if order != previous_order:
                for i, a in enumerate(GROUPS):
                    for b in GROUPS[i+1:]:
                        if (order.index(a)-order.index(b))*(previous_order.index(a)-previous_order.index(b)) >= 0:
                            continue
                        pa = corners(pose_at(a, time, self.beat_sync), card_size=self.card_size)[1]
                        pb = corners(pose_at(b, time, self.beat_sync), card_size=self.card_size)[1]
                        separated = np.any(pa.max(axis=0) < pb.min(axis=0)) or np.any(pb.max(axis=0) < pa.min(axis=0))
                        if not separated:
                            raise ValueError(f'Visible stacking-order pop at {time}: {a}/{b}')
                        handoffs += 1
            previous_order = order
        filename = self.captures.groups['home'][0]['file']
        ox, oy = CONTENT_ORIGIN
        content = self.card(filename).crop((ox, oy, ox+self.source_size[0], oy+self.source_size[1])).convert('RGB')
        if not np.array_equal(np.asarray(content), np.asarray(self.captures.image(filename))):
            raise ValueError('Bezel altered the original viewport pixels')
        if self.lift:
            recorded = self.source(self.lift.group, (self.lift.start+self.lift.end)/2)
            underlay, photo = split_photo(recorded, CONTENT_ORIGIN, self.lift)
            underlay.paste(photo, (CONTENT_ORIGIN[0]+self.lift.rect[0], CONTENT_ORIGIN[1]+self.lift.rect[1]))
            if not np.array_equal(np.asarray(recorded), np.asarray(underlay)):
                raise ValueError('Photo layer does not reconstruct its exact original pixels')
        return {'max_source_pixel_scale': round(largest, 4),
                'max_lifted_photo_pixel_scale': round(largest_lift, 4),
                'photo_layer_reassembly': 'pixel-identical' if self.lift else 'not used',
                'min_card_margin_px': round(min_margin, 2),
                'content_paste': 'pixel-identical', 'separated_depth_handoffs': handoffs,
                'motion': 'continuous shared orbit; no stop/start keyframes'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--stills-only', action='store_true')
    parser.add_argument('--project', choices=PROJECTS, default='hubarch')
    parser.add_argument('--beat-sync', action='store_true')
    args = parser.parse_args()
    film = Film(args.project, args.beat_sync)
    output, name = film.output, film.name
    verification = film.validate()
    print(json.dumps(verification), flush=True)
    board = Image.new('RGB', (1280, 3*385), (20, 22, 24))
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 16)
    lift_time = (film.lift.start+film.lift.end)/2 if film.lift else 5.51
    for i, t in enumerate((.5, 1.84, 3.67, lift_time, 7.33, 9.18)):
        still = film.render(t)
        still.save(output/f'{name}-{i+1:02d}.jpg', quality=96)
        x, y = i%2*640, i//2*385
        board.paste(still.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
        ImageDraw.Draw(board).text((x+15, y+362), f'{t:.2f} s', fill=(215, 216, 213), font=font)
    board.save(output/f'{name}-board.jpg', quality=94)
    if args.stills_only:
        return
    command = [args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{SIZE[0]}x{SIZE[1]}',
               '-r', str(FPS), '-i', 'pipe:0']
    if film.audio:
        if not film.audio.is_file():
            raise FileNotFoundError('Run musicEdit.py --prepare first')
        command += ['-i', str(film.audio), '-map', '0:v:0', '-map', '1:a:0',
                    '-c:a', 'aac', '-b:a', '256k', '-t', str(film.duration)]
    else:
        command += ['-an']
    command += ['-c:v', 'libx264',
               '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '4',
               '-movflags', '+faststart', str(output/f'{name}.mp4')]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for frame in range(round(film.duration*FPS)):
            process.stdin.write(film.render(frame/FPS).tobytes())
            if frame%120 == 0:
                print(f'Rendered {frame/FPS:.0f}/{film.duration} seconds', flush=True)
        process.stdin.close()
        error = process.stderr.read().decode(errors='replace')
        if process.wait() != 0:
            raise RuntimeError(error)
    except BaseException:
        process.kill()
        process.wait()
        raise
    metadata = {
        'status': 'Music-synchronized card film' if film.beat_sync else 'Silent card film',
        'source': film.project['source'],
        'size': SIZE, 'fps': FPS, 'duration': film.duration,
        'music': {'track': 'Tech House vibes / Alejandro Magana (A. M.)',
                  'source_bpm': 122, 'edit_bpm': 60/BEAT, 'beats': 24,
                  'hero_beats': [0, 8, 16], 'handoff_accents': [4, 12, 20],
                  'lift_peak_beat': (film.lift.start+film.lift.end)/2/BEAT if film.lift else None,
                  'source': 'https://mixkit.co/free-stock-music/electronica/'} if film.beat_sync else None,
        'processing': 'Complete native viewports inside browser mockups. Selected source elements may lift over the original page background. No source enlargement, invented page content or re-typesetting.',
        'element_lift': vars(film.lift) if film.lift else None,
        'cadence': 'Card motion 60 fps; source website animation retains recorded cadence.',
        'brand': 'Digital Monster graphite and blue browser mockups: rounded body, separate toolbar with actual source domain, projected depth and soft shadows. No external HUD, logos, captions, progress dots or HUD rules. Accepted V8 cards and photo lift retained.',
        'verification': verification,
    }
    (output/f'{name}.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Ready: {output/name}.mp4', flush=True)


if __name__ == '__main__':
    main()

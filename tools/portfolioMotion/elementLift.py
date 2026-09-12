"""Lift one actual Hubarch gallery element, preserving its recorded pixels."""
import math
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Native gallery photograph plus its existing four-pixel paper margin. The
# gallery is settled before this cue; no title, filter or navigation is included.
PHOTO_RECT = (276, 156, 1005, 564)


@dataclass(frozen=True)
class LiftSpec:
    rect: tuple = PHOTO_RECT
    group: str = 'select'
    start: float = 3.95
    end: float = 5.40
    dx: float = -25
    dy: float = -65
    depth: float = 310


HUBARCH_LIFT = LiftSpec()


def lift_amount(t, spec=HUBARCH_LIFT):
    if spec is None or not spec.start < t < spec.end:
        return 0.0
    return math.sin(math.pi*(t-spec.start)/(spec.end-spec.start))**4


def split_photo(card, origin, spec=HUBARCH_LIFT):
    x0, y0, x1, y1 = spec.rect
    ox, oy = origin
    rect = (ox+x0, oy+y0, ox+x1, oy+y1)
    photo = card.crop(rect)
    underlay = card.copy()
    # This region is a flat page background in the source implementation.
    # Sample the recording to retain its encoded colour, including JPEG rounding.
    paper = card.getpixel((ox+x0-8, oy+y0-8))
    underlay.paste(paper, rect)
    return underlay, photo


def photo_geometry(amount, origin, card_size, spec=HUBARCH_LIFT):
    x0, y0, x1, y1 = spec.rect
    width, height = x1-x0, y1-y0
    source = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=float)
    local = np.column_stack((source-[width/2, height/2], np.zeros(4)))
    ax, ay, az = np.radians([8*amount, -7*amount, -2*amount])
    cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    rotation = (np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @
                np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @
                np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
    center = np.array(origin)+[x0+width/2, y0+height/2]-np.array(card_size)/2
    points = local @ rotation.T
    points += [center[0]+spec.dx*amount, center[1]+spec.dy*amount, spec.depth*amount]
    ground = np.column_stack((source+np.array(origin)+[x0, y0]-np.array(card_size)/2, np.zeros(4)))
    ground[:, :2] += [12*amount, 22*amount]
    return source, points, ground


def draw_photo(canvas, photo, source, target, shadow_quad, amount, homography):
    left, top = np.floor(np.minimum(target.min(axis=0), shadow_quad.min(axis=0))-65).astype(int)
    right, bottom = np.ceil(np.maximum(target.max(axis=0), shadow_quad.max(axis=0))+65).astype(int)
    size = (right-left, bottom-top)
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).polygon([tuple(p-[left, top]) for p in shadow_quad], fill=round(46*amount))
    shadow = Image.new('RGBA', size, (8, 17, 26, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(2+30*amount)))
    canvas.alpha_composite(shadow, (left, top))
    matrix = homography(target-[left, top], source)
    transformed = photo.transform(size, Image.Transform.PERSPECTIVE,
                                  matrix.flat[:8], Image.Resampling.BICUBIC)
    canvas.alpha_composite(transformed, (left, top))

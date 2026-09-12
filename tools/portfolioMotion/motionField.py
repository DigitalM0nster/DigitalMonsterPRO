"""Three aligned, counter-moving browser rows for the offline film.

Uniform scale and gutters, one fixed diagonal, no perspective taper. Each row
is a repeated native-resolution strip, sampled once at a continuous subpixel
position. The top and bottom travel right; the centre travels left.
"""
import numpy as np
from PIL import Image
from direction import Pose, SIZE, project_points

CONTENT = [('home', .2), ('select', 2.7), ('case', 8.7),
           ('select', 5.6), ('home', 2.6), ('select', 3.0)]
ROW_CONTENT = ((0, 1, 2), (3, 4, 1), (4, 2, 3))
SCALE = .526
ROLL = -8
GAP = 72
SPEED_PX = 64
STRIP_PAD = 100
STRIP_COLUMNS = 9
PREFILTER_SCALE = .625


def field_scale(card_size):
    # Preserve row height for the wider Nipigas viewport, without stretching it.
    return SCALE*800/card_size[1]


def row_shift(row, seconds, card_size):
    direction = -1 if row == 0 else 1
    period = 3*(card_size[0]+GAP)
    distance = direction*SPEED_PX*seconds/field_scale(card_size)
    return (distance+period/2) % period-period/2


def card_content(row, col, variant, content=CONTENT):
    index = ROW_CONTENT[row+1][(col+4+int(variant)) % 3]
    return content[index]


def field_cards(card_size, seconds, variant=0):
    w, h = card_size
    raw = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=float)
    common = Pose(SIZE[0]/2, SIZE[1]/2, field_scale(card_size), 0, 0, ROLL)
    for row in (-1, 0, 1):
        for col in range(-4, 5):
            offset = [col*(w+GAP)+row_shift(row, seconds, card_size), row*(h+GAP)]
            points = np.column_stack((raw-[w/2, h/2]+offset, np.zeros(4)))
            front = project_points(common, points)
            if np.any(front.max(axis=0) < -80) or np.any(front.min(axis=0) > np.array(SIZE)+80):
                continue
            points[:, 2] = -9
            back = project_points(common, points)
            yield card_content(row, col, variant), raw, front, back


def prepare_rows(film, variant):
    """Rasterize chrome/shadows once; retain the original website pixels."""
    w, h = film.card_size
    step = w+GAP
    content = getattr(film, 'field_content', CONTENT)
    strips = []
    for row in (-1, 0, 1):
        strip = Image.new('RGBA', (STRIP_COLUMNS*step-GAP+2*STRIP_PAD, h+2*STRIP_PAD))
        tiles = {}
        for col in range(STRIP_COLUMNS):
            group, clock = card_content(row, col-4, variant, content)
            key = (group, clock)
            if key not in tiles:
                tile = Image.new('RGBA', (w+2*STRIP_PAD, h+2*STRIP_PAD))
                film.draw_card(tile, group, clock,
                    pose_override=Pose(STRIP_PAD+w/2, STRIP_PAD+h/2, 1), lift_override=0)
                tiles[key] = tile
            strip.alpha_composite(tiles[key], (col*step, 0))
        # A prepared mip removes subpixel line aliasing before the moving warp.
        # It remains larger than the final projected card: no native upscaling.
        mip = strip.convert('RGBa').resize(
            (round(strip.width*PREFILTER_SCALE), round(strip.height*PREFILTER_SCALE)),
            Image.Resampling.LANCZOS)
        strips.append((mip, mip.width/strip.width, mip.height/strip.height))
    return strips


def draw_field(film, canvas, seconds, variant=0):
    cache = getattr(film, '_field_row_cache', None)
    if cache is None:
        film._field_row_cache = cache = {}
    if variant not in cache:
        cache[variant] = prepare_rows(film, variant)
    w, h = film.card_size
    c, s = np.cos(np.radians(ROLL)), np.sin(np.radians(ROLL))
    # Inverse of the same rotation for every row. No integer rounding,
    # per-row scale, independent camera clocks or easing at each wrap seam.
    scale = field_scale(film.card_size)
    a, b, d, e = c/scale, s/scale, -s/scale, c/scale
    for row, (strip, mx, my) in zip((-1, 0, 1), cache[variant]):
        tx = STRIP_PAD+4*(w+GAP)+w/2-row_shift(row, seconds, film.card_size)-a*SIZE[0]/2-b*SIZE[1]/2
        ty = STRIP_PAD+h/2-row*(h+GAP)-d*SIZE[0]/2-e*SIZE[1]/2
        visible = strip.transform(SIZE, Image.Transform.AFFINE,
                    (a*mx, b*mx, tx*mx, d*my, e*my, ty*my), Image.Resampling.BICUBIC)
        canvas.alpha_composite(visible.convert('RGBA'))


def validate_rows(card_size):
    """Check gutters, alignment, direction and continuous velocity, not styling."""
    w, h = card_size
    scale = field_scale(card_size)
    angle = np.radians(ROLL)
    along = np.array([np.cos(angle), np.sin(angle)])
    normal = np.array([-np.sin(angle), np.cos(angle)])
    speed = []
    for row in (-1, 0, 1):
        offsets = np.array([row_shift(row, t/60, card_size)*scale for t in range(240)])
        velocity = np.diff(offsets)*60
        expected = -SPEED_PX if row == 0 else SPEED_PX
        assert np.allclose(velocity, expected, atol=1e-8)
        speed.append(round(float(velocity.mean()), 3))
    for t in (0, 1.25, 3.68):
        quads = [front for _, _, front, _ in field_cards(card_size, t)]
        for q in quads:
            assert np.allclose(q[1]-q[0], along*w*scale)
            assert np.allclose(q[3]-q[0], normal*h*scale)
        centers = np.array([q.mean(axis=0) for q in quads])
        levels = np.unique(np.round(centers @ normal, 6))
        assert len(levels) == 3
        assert np.allclose(np.diff(levels)-h*scale, GAP*scale)
        for level in levels:
            xs = np.sort(centers[np.isclose(centers @ normal, level)] @ along)
            assert np.allclose(np.diff(xs)-w*scale, GAP*scale)
    return {'rows': 3, 'row_velocity_px_s': speed, 'horizontal_and_vertical_gutter_px': GAP*scale,
            'uniform_source_scale': scale, 'roll_degrees': ROLL,
            'constant_velocity_and_parallel_edges': 'passed'}

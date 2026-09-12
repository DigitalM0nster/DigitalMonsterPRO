"""Four deliberately different, bounded motion directions for native site cards.

Prepared browser sprites move at subpixel positions; animation never repeatedly
resamples a previous frame. The approved Hubarch row film remains independent.
"""
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image

from direction import Film, Pose, SIZE, CONTENT_ORIGIN, corners, homography, max_pixel_scale, project_points
from elementLift import photo_geometry
from hubarchStory import ease
from portfolioStory import cache_static_chrome


@dataclass(frozen=True)
class Panel:
    group: str
    clock: float
    x: float = 960
    y: float = 540
    scale: float = .74
    roll: float = 0
    yaw: float = 0
    lift: float = 0
    bleed: bool = False


def ramp(u, start=.04, end=.76):
    return ease(float(np.clip((u-start)/(end-start), 0, 1)))


def nipigas(shot, u, seconds):
    q = ramp(u)
    if shot == 0:
        return [Panel('select', 4.4+1.2*u, y=560-20*q, scale=.78)]
    if shot == 1:
        return [Panel('home', .6, 680-250*q, 570+14*u, .48, -1.5, 10),
                Panel('case', 6.2, 1240+250*q, 570+14*u, .48, 1.5, -10),
                Panel('select', 5.6, 960, 492-8*u, .56)]
    if shot == 2:
        return [Panel('home', .3+2*u, x=968-16*u, scale=.78)]
    if shot == 3:
        cards = []
        pages = [('home', .7), ('case', 8), ('select', 5.6), ('home', 3.2), ('case', 6.2)]
        for col, x in enumerate((572, 1348)):
            distance = seconds*(50 if col == 0 else -44)
            for row in range(-2, 4):
                group, clock = pages[(row+col+2)%len(pages)]
                cards.append(Panel(group, clock, x, 330+row*406+distance, .51, bleed=True))
        return cards
    if shot == 4:
        return [Panel('case', 6.2+1.15*u, x=950+20*u, y=536+8*u, scale=.77)]
    if shot == 5:
        return [Panel(group, clock, x, 570-65*ramp(u, i*.08, .64+i*.08), .41,
                      (i-1)*2*(1-q))
                for i, (group, clock, x) in enumerate([
                    ('home', .8, 390), ('home', 3.2, 960), ('case', 8, 1530)])]
    if shot == 6:
        return [Panel('select', 5.6, 496+30*q, 478-8*u, .56, 0, 4),
                Panel('case', 6.6+.4*u, 1424-30*q, 618+8*u, .56, 0, -4)]
    return [Panel('select', 5.6, y=548-8*q, scale=.78)]


def ostankino(shot, u, seconds):
    q = ramp(u, .0, .64)
    if shot in (0, 2, 3, 7):
        clock = {0: .1+1.4*u, 2: 1.5+1.5*u, 3: 3., 7: 2.7}[shot]
        lift = .26*ramp(u, .02, .45)*(1-ramp(u, .60, .96)) if shot == 3 else 0
        return [Panel('home', clock, y=540, scale=.76, lift=lift)]
    if shot in (1, 6):
        pages = [('home', 2.7), ('select', 3.4), ('case', 6.8), ('select', 5.6)]
        if shot == 6:
            pages = [('case', 8.8), ('home', 2.7), ('select', 5.6), ('case', 6.4)]
        result = []
        for i, (group, clock) in enumerate(pages):
            # A broadcast multiview: two precisely aligned rows of two screens.
            direction = -1 if i%2 == 0 else 1
            settle = ramp(u, i*.055, .57+i*.055)
            result.append(Panel(group, clock+.22*u, 580+(i%2)*760+direction*42*(1-settle),
                                308+(i//2)*464, .51))
        return result
    if shot == 4:
        return [Panel('select', 2.5+3.1*u, x=985-25*q, scale=.74)]
    return [Panel('home', 2.7, 458, 330+35*q, .43),
            Panel('case', 6.8+.6*u, 458, 750-35*q, .43),
            Panel('select', 4.2+1.2*u, 1268-20*q, 540, .69, yaw=-4)]


def mmk(shot, u, seconds):
    # Wide rail travel and deliberate acceleration, with a locked level horizon.
    q = ramp(u, .02, .86)
    if shot == 0:
        return [Panel('home', .1+1.4*u, x=1000-40*q, scale=.75)]
    if shot == 1:
        pages = [('home', .8), ('select', 3.4), ('home', 3.8), ('case', 8.7)]
        return [Panel(*pages[(i+2)%4], 960+i*760-62*seconds, 540, .52, bleed=True)
                for i in range(-3, 4)]
    if shot == 2:
        return [Panel('select', 2.5+2.5*u, x=1010-50*q, scale=.73)]
    if shot == 3:
        return [Panel('case', 6.2+2.6*u, x=950+20*u, scale=.74)]
    if shot == 4:
        return [Panel('home', .6+3.3*u, scale=.76)]
    if shot == 5:
        return [Panel('select', 3.5+.9*u, 548, 596-56*q, .57),
                Panel('home', 2.4+1.4*u, 1372, 484+56*q, .57)]
    if shot == 6:
        # Three vertical levels assemble onto one common engineering diagonal.
        return [Panel('home', 3.8, 528+38*q, 290, .40),
                Panel('select', 5.6, 960, 540, .40),
                Panel('case', 8.7, 1392-38*q, 790, .40)]
    return [Panel('home', 3.8, x=976-16*q, scale=.75)]


def belka(shot, u, seconds):
    q = ramp(u, .02, .78)
    if shot == 0:
        return [Panel('home', .1+1.4*u, y=552-12*q, scale=.72, roll=-1.2*(1-q))]
    if shot == 1:
        return [Panel('select', 5.6, 775-280*q, 650-18*q, .49, -2-6*q),
                Panel('case', 8.8, 1145+280*q, 650-18*q, .49, 2+6*q),
                Panel('home', 2.7, 960, 474-10*u, .59)]
    if shot in (2, 3):
        lift = .32*ramp(u, .02, .46)*(1-ramp(u, .60, .96)) if shot == 3 else 0
        return [Panel('select', 2.5+3.1*u if shot == 2 else 5.6, scale=.74, lift=lift)]
    if shot == 4:
        return [Panel('case', 6.2+2.6*u, y=544-8*u, scale=.74)]
    if shot == 5:
        composition = [('home', 2.7, 422, 316, -3), ('select', 5.6, 1005, 322, 2),
                       ('case', 8.8, 862, 772, -2), ('select', 3.4, 1480, 755, 3)]
        return [Panel(g, t, x, y+52*(1-ramp(u, i*.075, .60+i*.075)), .40, r)
                for i, (g, t, x, y, r) in enumerate(composition)]
    if shot == 6:
        pages = [('home', .8), ('select', 3.4), ('case', 8.8), ('select', 5.6)]
        positions = [(420, 718, -10), (685, 550, -5), (1235, 550, 5), (1500, 718, 10)]
        cards = [Panel(g, t, x+(x-960)*.07*q, y-12*q, .37, r*(.8+.2*q))
                 for (g, t), (x, y, r) in zip(pages, positions)]
        return cards+[Panel('home', 2.7, y=444, scale=.57)]
    return [Panel('home', 2.7, y=540, scale=.72)]


DIRECTIONS = {'nipigas': nipigas, 'ostankino': ostankino, 'mmk-1': mmk, 'belka-production': belka}
LABELS = {
    'nipigas': ['Календарь', 'Раскрытие страниц', 'Архив', 'Вертикальная хроника',
                'Выбор даты', 'Последовательность событий', 'Две истории', 'Возвращение'],
    'ostankino': ['Эфир', 'Режиссёрский мультиэкран', 'Живая типографика', 'Объём названия',
                 'Офисы', 'Программа и превью', 'Сетка вещания', 'Финал'],
    'mmk-1': ['Объект', 'Горизонтальный рельс', 'Каталог', 'Компания', 'Кран в движении',
             'Сборка двух модулей', 'Три уровня', 'Финал'],
    'belka-production': ['Студия', 'Раскрытие веера', 'Кейсы', 'Подъём карточки', 'Открытка',
                         'Каскад', 'Объёмный веер', 'Финал'],
}


class MotionStory:
    BASE_SCALE = .86

    def __init__(self, project, timing):
        self.project, self.timing = project, timing
        self.film = Film(project)
        cache_static_chrome(self.film)
        self.layout = DIRECTIONS[project]
        self.times = np.array(timing['cuts'])/60
        # Fixed-camera browser surfaces are prepared once. The source UI is
        # unchanged; fractional movement always samples this original surface.
        self.sprite = lru_cache(maxsize=56)(self._sprite)

    def _sprite(self, group, source_index, yaw):
        timestamp = self.film.captures.times[group][source_index]
        clock = {'home': timestamp-.15, 'select': timestamp+2.4, 'case': timestamp+4.15}[group]
        w, h = self.film.card_size
        size = (w+240, h+240)
        anchor = np.array(size)/2
        canvas = Image.new('RGBA', size)
        self.film.draw_card(canvas, group, clock,
            pose_override=Pose(*anchor, self.BASE_SCALE, yaw), lift_override=0)
        return canvas.convert('RGBa'), anchor

    def source_index(self, panel):
        clock = {'home': min(.15+panel.clock, 4.), 'select': np.clip(panel.clock-2.4, .1, 3.2),
                 'case': np.clip(panel.clock-4.15, 2.05, 4.7)}[panel.group]
        return int(np.argmin(np.abs(np.array(self.film.captures.times[panel.group])-clock)))

    def draw(self, canvas, panel):
        if panel.lift:
            self.film.draw_card(canvas, panel.group, panel.clock,
                pose_override=Pose(panel.x, panel.y, panel.scale, panel.yaw, 0, panel.roll),
                lift_override=panel.lift)
            return
        sprite, anchor = self.sprite(panel.group, self.source_index(panel), panel.yaw)
        angle = np.radians(panel.roll)
        scale = panel.scale/self.BASE_SCALE
        c, s = np.cos(angle), np.sin(angle)
        forward = np.array([[c, -s], [s, c]])*scale
        inverse = np.array([[c, s], [-s, c]])/scale
        bounds = (np.array([[0, 0], [sprite.width, 0], [sprite.width, sprite.height], [0, sprite.height]])-anchor)@forward.T+[panel.x, panel.y]
        lo = np.maximum(0, np.floor(bounds.min(axis=0)).astype(int))
        hi = np.minimum(SIZE, np.ceil(bounds.max(axis=0)).astype(int))
        if np.any(hi <= lo):
            return
        offset = anchor+inverse@(lo-[panel.x, panel.y])
        matrix = (inverse[0, 0], inverse[0, 1], offset[0], inverse[1, 0], inverse[1, 1], offset[1])
        visible = sprite.transform(tuple(hi-lo), Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
        canvas.alpha_composite(visible.convert('RGBA'), tuple(lo))

    def render(self, shot, u):
        seconds = u*(self.times[shot+1]-self.times[shot])
        canvas = self.film.style.background((self.times[shot]+seconds)*.16)
        for panel in self.layout(shot, u, seconds):
            self.draw(canvas, panel)
        return canvas.convert('RGB')

    def validate(self):
        maximum, margin = 0, float('inf')
        moving = []
        for shot in range(8):
            movement = 0
            previous = None
            for u in np.linspace(0, 1, 81):
                seconds = u*(self.times[shot+1]-self.times[shot])
                panels = self.layout(shot, u, seconds)
                for panel in panels:
                    assert panel.scale <= self.BASE_SCALE
                    raw, quad = corners(Pose(panel.x, panel.y, panel.scale, panel.yaw, 0, panel.roll),
                                        card_size=self.film.card_size)
                    scale = max_pixel_scale(homography(raw, quad))
                    maximum = max(maximum, scale)
                    assert scale <= 1, ('source enlargement', shot, scale)
                    if not panel.bleed:
                        edge = min(quad.min(), (np.array(SIZE)-quad).min())
                        margin = min(margin, edge)
                        assert edge >= 20, ('unintended crop', shot, u, edge)
                    if panel.lift:
                        source, photo, _ = photo_geometry(panel.lift, CONTENT_ORIGIN, self.film.card_size, self.film.lift)
                        target = project_points(Pose(panel.x, panel.y, panel.scale, panel.yaw, 0, panel.roll), photo)
                        scale = max_pixel_scale(homography(source, target), (0, 0, *source[2]))
                        maximum = max(maximum, scale)
                        assert scale <= 1 and target.min() >= 20 and np.all(target <= np.array(SIZE)-20)
                positions = np.array([[p.x, p.y, p.roll, p.lift] for p in panels])
                if previous is not None:
                    movement += float(np.linalg.norm(positions-previous))
                previous = positions
            moving.append(round(movement, 2))
        return dict(max_source_scale=maximum, min_complete_card_margin=margin,
                    screen_motion_per_scene=moving, cut_rounding_ms=self.timing['max_cut_rounding_ms'],
                    direction=LABELS[self.project], source_pixels='original captures, no UI reconstruction')


def sound_events(project, timing):
    times = np.array(timing['cuts'])/60
    # Starts/ends match the corresponding reveal, lift or module movement above.
    gestures = {
        'nipigas': [(0, .04, .76, 'paper', -.2, .1), (1, .04, .76, 'paper', 0, -.6),
                    (3, 0, .52, 'soft', -.4, .4), (5, 0, .64, 'paper', -.6, .3),
                    (5, .16, .80, 'paper', .2, .6), (6, .04, .76, 'air', -.4, .4)],
        'ostankino': [(1, 0, .57, 'air', -.6, .2), (1, .11, .68, 'switch', .3, .6),
                      (3, .02, .45, 'soft', 0, .2), (3, .60, .96, 'soft', .2, 0),
                      (4, 0, .64, 'switch', -.2, 0), (5, 0, .64, 'air', -.4, .4),
                      (6, 0, .57, 'switch', -.5, .4)],
        'mmk-1': [(0, .02, .86, 'weight', .2, 0), (1, 0, .62, 'air', .6, -.6),
                  (2, .02, .86, 'weight', .5, 0), (5, .02, .86, 'weight', -.3, .3),
                  (6, .02, .86, 'air', -.4, .4)],
        'belka-production': [(0, .02, .78, 'soft', -.2, 0), (1, .02, .78, 'paper', 0, -.6),
                              (1, .10, .78, 'air', 0, .6), (3, .02, .46, 'soft', .2, .4),
                              (3, .60, .96, 'paper', .4, 0), (5, 0, .60, 'paper', -.6, -.1),
                              (5, .075, .675, 'soft', -.1, .4), (5, .15, .75, 'paper', 0, .5),
                              (5, .225, .825, 'soft', .4, .6), (6, .02, .78, 'air', -.5, .5)],
    }
    events = []
    for shot, start, stop, kind, left, right in gestures[project]:
        length = times[shot+1]-times[shot]
        events.append(dict(time=float(times[shot]+start*length), duration=min(1.35, (stop-start)*length),
            kind=kind, pan_from=left, pan_to=right, db=-23 if kind in ('weight', 'switch') else -21,
            scene=shot+1, visual='card movement / layer separation'))
        if shot not in (0, 3) and kind in ('weight', 'switch', 'paper'):
            events.append(dict(time=float(times[shot]+stop*length), duration=.12, kind='lock',
                               pan_from=right, pan_to=right, db=-30, scene=shot+1, visual='settle'))
    return events

"""One continuous, identity-preserving playhead for each offline motion film."""
from bisect import bisect_right
from dataclasses import replace
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from direction import Film, SIZE, CONTENT_ORIGIN
from flowLayouts import compositions, accent_composition, Layer
from hubarchStory import ease


class Flow:
    def __init__(self, project, timing):
        self.project, self.timing = project, timing
        self.film = Film(project)
        states = compositions(project)
        self.keys = [(0., [replace(states[0][0], y=565, scale=.80, roll=-1)], 'opening', .5),
                     (.55, states[0], 'intro', .55)]
        cuts = np.array(timing['cuts'])/60
        beat = 60/timing['track']['bpm']
        for stage in range(1, 8):
            width = .78 if stage == 1 else .64
            self.keys.append((float(cuts[stage]), states[stage], 'scene', width))
            duration = cuts[stage+1]-cuts[stage]
            if stage < 7 and duration >= 2.8:
                at = float(cuts[stage]+4*beat)
                if at < cuts[stage+1]-.8:
                    self.keys.append((at, accent_composition(project, states[stage], stage), 'accent', .43))
        self.keys.sort(key=lambda key: key[0])
        self.times = [key[0] for key in self.keys]
        self.sprite = lru_cache(maxsize=64)(self._sprite)
        self.z = dict(case=10, monitor=15, select=20, home=30, art1=40, art0=50, art2=60)

    def layers(self, time):
        index = bisect_right(self.times, time)-1
        if index >= len(self.keys)-1:
            return self.keys[-1][1]
        _, previous, _, _ = self.keys[max(0, index)]
        arrival, destination, _, width = self.keys[index+1]
        u = float(np.clip((time-(arrival-width))/width, 0, 1))
        q = float(np.clip(ease(u), 0, 1))
        before, after = {p.key: p for p in previous}, {p.key: p for p in destination}
        result = []
        for key in sorted(before.keys() | after.keys(), key=lambda k: self.z[k]):
            a, b = before.get(key), after.get(key)
            if a is None:
                a = replace(b, x=b.x+(-44 if b.x < 960 else 44), y=b.y+36,
                            scale=b.scale*.97, opacity=0)
            if b is None:
                b = replace(a, y=a.y-24, scale=a.scale*.98, opacity=0)
            assert (a.group, a.clock, a.crop, a.cutout) == (b.group, b.clock, b.crop, b.cutout)
            result.append(replace(b, **{name: getattr(a, name)+(getattr(b, name)-getattr(a, name))*q
                            for name in ('x', 'y', 'scale', 'roll', 'opacity')}))
        return result

    def source_index(self, layer, time):
        clock = layer.clock
        # Native opening animation shares one global source clock across the
        # first transition. A new scene never resets the displayed capture.
        if layer.crop is None and layer.key == ('select' if self.project == 'nipigas' else 'home'):
            start = 4.4 if self.project == 'nipigas' else .1
            clock = min(layer.clock, start+time)
        source_time = {'home': min(.15+clock, 4), 'select': np.clip(clock-2.4, .1, 3.2),
                       'case': np.clip(clock-4.15, 2.05, 4.7)}[layer.group]
        return int(np.argmin(np.abs(np.array(self.film.captures.times[layer.group])-source_time)))

    def _sprite(self, group, index, crop, cutout):
        record = self.film.captures.groups[group][index]
        native = self.film.card(record['file']).copy()
        if crop:
            ox, oy = CONTENT_ORIGIN
            native = native.crop((crop[0]+ox, crop[1]+oy, crop[2]+ox, crop[3]+oy))
        if cutout:
            # Keep the illustration's original light body and paper colour.
            # Colour-keying the page also removes matching mascot pixels.
            mask = Image.new('L', native.size)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, native.width-1, native.height-1), radius=38, fill=255)
            native.putalpha(mask)
        elif crop:
            mask = Image.new('L', native.size)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, native.width-1, native.height-1), radius=9, fill=255)
            native.putalpha(mask)
        pad = 55
        size = (native.width+pad*2, native.height+pad*2)
        canvas = Image.new('RGBA', size)
        alpha = Image.new('L', size)
        alpha.paste(native.getchannel('A'), (pad, pad+9))
        shadow = Image.new('RGBA', size, (0, 0, 0, 0))
        shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(15)).point(lambda a: round(a*.43)))
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(native, (pad, pad))
        return canvas.convert('RGBa'), np.array(size)/2

    def draw(self, canvas, layer, time):
        if layer.opacity < .00001:
            return
        sprite, anchor = self.sprite(layer.group, self.source_index(layer, time), layer.crop, layer.cutout)
        angle = np.radians(layer.roll)
        c, s = np.cos(angle), np.sin(angle)
        inverse = np.array([[c, s], [-s, c]])/layer.scale
        forward = np.array([[c, -s], [s, c]])*layer.scale
        points = (np.array([[0, 0], [sprite.width, 0], [sprite.width, sprite.height], [0, sprite.height]])-anchor)@forward.T+[layer.x, layer.y]
        lo = np.maximum(0, np.floor(points.min(axis=0)).astype(int))
        hi = np.minimum(SIZE, np.ceil(points.max(axis=0)).astype(int))
        if np.any(hi <= lo):
            return
        offset = anchor+inverse@(lo-[layer.x, layer.y])
        sample = sprite.transform(tuple(hi-lo), Image.Transform.AFFINE,
            (inverse[0, 0], inverse[0, 1], offset[0], inverse[1, 0], inverse[1, 1], offset[1]), Image.Resampling.BICUBIC).convert('RGBA')
        if layer.opacity < .99999:
            sample.putalpha(sample.getchannel('A').point(lambda a: round(a*layer.opacity)))
        canvas.alpha_composite(sample, tuple(lo))

    def render(self, time):
        canvas = self.film.style.background(time*.18)
        for layer in sorted(self.layers(time), key=lambda layer: self.z[layer.key]):
            self.draw(canvas, layer, time)
        return canvas.convert('RGB')

    def check(self):
        minimum = 10000
        maximum = 0
        for t in np.linspace(0, self.timing['duration'], 500):
            for p in self.layers(t):
                if p.opacity < .01:
                    continue
                w, h = (p.crop[2]-p.crop[0], p.crop[3]-p.crop[1]) if p.crop else self.film.card_size
                angle = np.radians(p.roll)
                dx = (w*abs(np.cos(angle))+h*abs(np.sin(angle)))*p.scale/2
                dy = (h*abs(np.cos(angle))+w*abs(np.sin(angle)))*p.scale/2
                edge = min(p.x-dx, p.y-dy, 1920-p.x-dx, 1080-p.y-dy)
                minimum = min(minimum, edge)
                maximum = max(maximum, p.scale)
                assert edge >= 12, ('clipped design', self.project, t, p.key, edge)
                assert p.scale <= 1, ('native pixels enlarged', self.project, p.key, p.scale)
        continuity = []
        for at, _, kind, width in self.keys[1:]:
            for point in (at-width, at):
                before = {p.key: p for p in self.layers(point-1e-6)}
                after = {p.key: p for p in self.layers(point+1e-6)}
                for key in before.keys() | after.keys():
                    a, b = before.get(key), after.get(key)
                    if a is None or b is None:
                        assert (a or b).opacity < .00001
                    else:
                        if max(a.opacity, b.opacity) < .00001:
                            continue
                        assert max(abs(getattr(a, field)-getattr(b, field))
                                   for field in ('x', 'y', 'scale', 'roll', 'opacity')) < .001
            continuity.append(dict(arrival=at, duration=width, kind=kind))
        return dict(native_scale_max=maximum, complete_artwork_margin=minimum,
                    every_transition_boundary_continuous='passed', keys=continuity,
                    frame_free_compositions=3, no_scene_source_reset=True)

    def events(self):
        kind = {'belka-production': 'paper', 'hubarch': 'air', 'nipigas': 'paper',
                'ostankino': 'switch', 'mmk-1': 'weight'}[self.project]
        result = []
        for i, (at, layers, motion, width) in enumerate(self.keys[1:]):
            if motion == 'intro':
                continue
            pan = -.35 if i%2 else .35
            result.append(dict(time=max(0, at-width+.04), duration=width-.04,
                kind='soft' if motion == 'accent' else kind, pan_from=-pan, pan_to=pan,
                db=-27 if motion == 'accent' else -23, visual=motion, arrival=at))
        return result

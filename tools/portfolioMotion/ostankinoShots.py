"""Authentic rental desktop/mobile captures and native transparent artwork."""
from functools import lru_cache
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from showreel import ROOT

BASE = ROOT/'output/showreels/ostankino'
CAP = BASE/'sources/rental-v5'
ART = BASE/'source-assets'


class Sources:
    def __init__(self):
        self.clips = {p.stem: json.loads(p.read_text('utf-8')) for p in CAP.glob('*.json')
                      if p.stem != 'capture-notes'}
        self.times = {k: np.array([p['t'] for p in v]) for k, v in self.clips.items()}
        self.mask = Image.open(ART/'ostankino-word-mask.png').convert('L')
        self.word_frames = sorted((ART/'word-frames').glob('*.jpg'))
        self.stills = {
            'building': (ART/'building-full.png', None, 0),
            'floor-card': (CAP/'floor-card.png', (1173, 220, 1751, 562), 18),
            'slider': (CAP/'plans.png', (59, 33, 559, 137), 0),
            'cta': (CAP/'floor-card.png', (1623, 84, 1846, 126), 0),
            'room-detail': (CAP/'room.png', (701, 40, 1859, 907), 20),
            'mobile-hero': (CAP/'mobile-hero.png', (0, 4, 416, 914), 27),
            'mobile-plans': (CAP/'mobile-plans.png', (0, 4, 416, 914), 27),
            'mobile-detail': (CAP/'mobile-room.png', (0, 4, 416, 914), 27),
            'mobile-menu-still': (CAP/'mobile-menu.png', (0, 4, 416, 914), 27),
        }
        for i in range(4):
            x = (59, 511, 963, 1415)[i]
            self.stills[f'plan{i}'] = (CAP/'plans.png', (x, 189, x+432, 673), 15)
        for i in range(13):
            x = round((610+57*i)*1913/1920)
            self.stills[f'floor-button-{i+1}'] = (CAP/'plans.png', (x, 74, x+50, 124), 25)
        self.cache = lru_cache(maxsize=38)(self._load)

    def image(self, key, time=0):
        if key == 'word':
            # One video clock; never jump back when a pose changes.
            index = min(len(self.word_frames)-1, max(0, round(time*30)))
        elif key in self.clips:
            index = int(np.argmin(np.abs(self.times[key]-time)))
        else:
            index = 0
        return self.cache(key, index)

    def _load(self, key, index):
        if key == 'word-white':
            native=Image.new('RGBA',self.mask.size,'white')
            native.putalpha(self.mask)
            radius=0
        elif key == 'word':
            native = Image.open(self.word_frames[index]).convert('RGBA')
            # FFmpeg rounds odd crop width down for 4:2:0, never enlarge RGB.
            native.putalpha(self.mask.resize(native.size, Image.Resampling.LANCZOS))
            radius = 0
        elif key in self.clips:
            native = Image.open(CAP/self.clips[key][index]['file']).convert('RGBA')
            if key.startswith('mobile'):
                native = native.crop((0, 4, 416, 914)); radius = 27
            else:
                native = native.crop((0, 8, 1906, 1064)); radius = 25
        else:
            path, crop, radius = self.stills[key]
            native = Image.open(path).convert('RGBA')
            if crop: native = native.crop(crop)
        if radius:
            mask = Image.new('L', native.size)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, native.width-1, native.height-1), radius=radius, fill=255)
            native.putalpha(mask)
        # One soft contact shadow; no browser toolbar, neon frame, or backing plate.
        pad = 34
        size = (native.width+pad*2, native.height+pad*2)
        result = Image.new('RGBA', size)
        alpha = Image.new('L', size)
        alpha.paste(native.getchannel('A'), (pad, pad+8))
        shadow = Image.new('RGBA', size)
        shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(11)).point(lambda a: round(a*.35)))
        result.alpha_composite(shadow)
        result.alpha_composite(native, (pad, pad))
        return result.convert('RGBa'), native.size

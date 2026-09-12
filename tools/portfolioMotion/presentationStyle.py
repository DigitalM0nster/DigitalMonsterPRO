"""Prepared native screens inside the approved blue presentation frames."""
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from ostankinoShots import Sources, CAP, BASE
from digitalMonsterStyle import DigitalMonsterStyle


class PresentationAssets:
    def __init__(self):
        self.sources = Sources()
        self.style = DigitalMonsterStyle((1920, 1080), (1312, 800), 16, 'ostankino.ru')
        self.stills = {
            'home': BASE/'presentation-v6/old-home.png',
            'rent': CAP/'floor-card.png', 'catalogue': CAP/'plans.png', 'catalogue-underlay': CAP/'plans.png',
            'mobile-home': CAP/'mobile-hero.png', 'mobile-list': CAP/'mobile-plans.png',
            'mobile-room': CAP/'mobile-room.png', 'mobile-menu': CAP/'mobile-menu.png',
        }
        self.cache = lru_cache(maxsize=52)(self.prepare)

    def native(self, source, clock=0):
        if source in self.stills:
            im = Image.open(self.stills[source]).convert('RGBA')
            if source=='catalogue-underlay':
                # The real cards occupy their original holes before lifting out.
                draw=ImageDraw.Draw(im);back=im.getpixel((20,160))
                for x in (59,511,963,1415):draw.rectangle((x,189,x+431,672),fill=back)
            if source.startswith('mobile'):
                return im.crop((0, 4, 416, 914))
            if source == 'home':
                return im.crop((0, 0, 1265, 716))
            return im.crop((0, 8, 1906, 1064))
        im, (w, h) = self.sources.image(source, clock)
        return im.convert('RGBA').crop((34, 34, w+34, h+34))

    @staticmethod
    def surround(native, framed):
        w, h = native.size
        pad = 38
        sprite = Image.new('RGBA', (w+2*pad, h+2*pad))
        shape = Image.new('L', sprite.size)
        d = ImageDraw.Draw(shape)
        if framed:
            d.rounded_rectangle((pad-9, pad-9, pad+w+8, pad+h+8), radius=19, fill=230)
        else:
            shape.paste(native.getchannel('A'), (pad, pad))
        shadow = Image.new('RGBA', sprite.size, (0, 2, 7))
        shadow.putalpha(shape.filter(ImageFilter.GaussianBlur(14)).point(lambda a: round(a*.43)))
        sprite.alpha_composite(shadow, (0, 7))
        if framed:
            lights = Image.new('RGBA', sprite.size)
            draw = ImageDraw.Draw(lights)
            box = (pad-7, pad-7, pad+w+6, pad+h+6)
            draw.rounded_rectangle(box, radius=17, fill=(4, 16, 28), outline=(0, 125, 195), width=2)
            length = min(78, w*.14)
            for x, y, dx, dy in [(pad-7,pad-7,1,1),(pad+w+6,pad-7,-1,1),
                                  (pad+w+6,pad+h+6,-1,-1),(pad-7,pad+h+6,1,-1)]:
                draw.line([(x,y+dy*length),(x,y),(x+dx*length,y)], fill=(221,245,255), width=4)
            glow = lights.copy(); glow.putalpha(lights.getchannel('A').point(lambda a:round(a*.48)))
            sprite.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)))
            sprite.alpha_composite(lights)
            mask = Image.new('L', (w,h)); ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius=10,fill=255)
            native = native.copy(); native.putalpha(mask)
        sprite.alpha_composite(native, (pad,pad))
        return sprite.convert('RGBa'), (w,h)

    def prepare(self, source, clock, framed):
        return self.surround(self.native(source, clock), framed)

    def image(self, source, clock=0, framed=True):
        # Animation is in scene geometry. Only the reconstructed UI slide changes pixels.
        return self.cache(source, clock, framed)

    def mobile_slide(self, progress):
        back = self.native('mobile-list')
        front = self.native('mobile-room')
        x = round(back.width*(1-progress))
        back.alpha_composite(front, (x,0))
        return self.surround(back, True)

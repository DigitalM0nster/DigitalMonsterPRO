"""Digital Monster's presentation style, separate from unmodified website pixels."""
import math

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BLUE = (0, 169, 255)


def add_light(canvas, light, xy=(0, 0)):
    x, y = map(int, xy)
    bounds = (x, y, x+light.width, y+light.height)
    lit = ImageChops.add(canvas.crop(bounds).convert('RGB'), light.convert('RGB'))
    canvas.paste(lit, (x, y))


class DigitalMonsterStyle:
    def __init__(self, size, card_size, pad, address='hubarch.ru'):
        self.size, self.card_size, self.pad = size, card_size, pad
        self.address = address
        self.base = self.make_base()
        self.bezel = self.make_bezel()
        self.rim = self.make_rim_path()
        u, v = np.meshgrid(np.linspace(-1.14, 1.14, 180), np.linspace(-1, 1, 27))
        rng = np.random.default_rng(46)
        self.u = u.ravel()+rng.normal(0, .002, u.size)
        self.v = v.ravel()+rng.normal(0, .012, v.size)
        self.spark = rng.uniform(.15, 1, len(self.u))

    def make_base(self):
        w, h = self.size
        y, x = np.mgrid[0:h, 0:w]
        haze = np.exp(-((x-w*.58)/(w*.50))**2-((y-h*.58)/(h*.44))**2)
        pixels = np.stack([1+haze*1.2, 3+haze*5, 6+haze*10], axis=-1).astype('uint8')
        result = Image.fromarray(pixels).convert('RGBA')
        draw = ImageDraw.Draw(result)
        # Quiet orbit geometry echoes the site's arc and preloader.
        for bounds, start, end in (
            ((60, -130, 1910, 1240), 178, 294),
            ((72, -118, 1898, 1228), 182, 229),
            ((182, -240, 1760, 1340), 305, 355),
            ((192, -228, 1750, 1328), 17, 64),
        ):
            draw.arc(bounds, start, end, fill=(0, 25, 44), width=1)
        return result

    def make_bezel(self):
        w, h = self.card_size
        # A rounded browser mockup, with its own chrome above the native page.
        # The page is pasted later, without masking or altering its corners.
        y, x = np.mgrid[0:h*2, 0:w*2]
        sheen = np.exp(-((x-w*.62)/(w*.88))**2)*np.exp(-y/(h*.35))
        top = np.exp(-y/145)
        pixels = np.stack((13+14*top+9*sheen, 20+16*top+11*sheen,
                           30+18*top+14*sheen), axis=-1).astype('uint8')
        result = Image.fromarray(pixels).convert('RGBA')
        mask = Image.new('L', result.size)
        ImageDraw.Draw(mask).rounded_rectangle((2, 2, w*2-4, h*2-4), radius=48, fill=255)
        result.putalpha(mask)
        draw = ImageDraw.Draw(result)
        draw.rounded_rectangle((3, 3, w*2-5, h*2-5), radius=47,
                               outline=(79, 96, 113, 220), width=2)
        # Familiar browser controls, rendered as part of the mockup, not the site.
        for cx, color in ((35, (89, 110, 129)), (55, (89, 110, 129)), (75, BLUE)):
            draw.ellipse((cx*2-7, 57, cx*2+7, 71), fill=color)
        muted = (161, 180, 196)
        for cx, flip in ((112, 1), (139, -1)):
            draw.line(((cx*2+4*flip, 55), (cx*2-4*flip, 64),
                       (cx*2+4*flip, 73)), fill=muted, width=2)
        draw.rounded_rectangle((326, 53, 355, 75), radius=3, outline=muted, width=2)
        draw.line((336, 55, 336, 73), fill=muted, width=2)
        # The actual source domain in a quiet, shallow address well.
        draw.rounded_rectangle((w-340, 36, w+340, 92), radius=13,
                               fill=(12, 20, 30), outline=(56, 73, 91), width=1)
        address_font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 25)
        draw.text((w, 64), self.address, anchor='mm', font=address_font,
                  fill=(205, 217, 226))
        if '.' in self.address:
            lock_x = w-101 if self.address == 'hubarch.ru' else w-address_font.getlength(self.address)/2-23
            draw.rounded_rectangle((lock_x, 61, lock_x+11, 71), radius=2,
                                   outline=(140, 161, 179), width=2)
            draw.arc((lock_x+1, 51, lock_x+10, 65), 180, 360, fill=(140, 161, 179), width=2)
        # New tab and overview, with generous spacing at the right edge.
        draw.line((w*2-95, 64, w*2-77, 64), fill=muted, width=2)
        draw.line((w*2-86, 55, w*2-86, 73), fill=muted, width=2)
        draw.rounded_rectangle((w*2-54, 55, w*2-34, 74), radius=3, outline=muted, width=2)
        draw.line((self.pad*2, 118, (w-self.pad)*2, 118), fill=(8, 13, 21), width=2)
        return result.resize((w, h), Image.Resampling.LANCZOS)

    def make_rim_path(self):
        w, h = self.card_size
        inset, radius = 2, 23
        anchors = []
        for cx, cy, start in ((inset+radius, inset+radius, 180),
                              (w-inset-radius, inset+radius, 270),
                              (w-inset-radius, h-inset-radius, 0),
                              (inset+radius, h-inset-radius, 90)):
            for angle in np.radians(np.linspace(start, start+90, 10)):
                anchors.append(np.array([cx+radius*np.cos(angle), cy+radius*np.sin(angle)]))
        points = []
        for i, a in enumerate(anchors):
            b = anchors[(i+1)%len(anchors)]
            count = max(1, math.ceil(np.linalg.norm(b-a)/5))
            points.extend(a+(b-a)*s for s in np.linspace(0, 1, count, endpoint=False))
        return np.column_stack((points, np.ones(len(points))))

    def background(self, t):
        result = self.base.copy()
        u, v = self.u, self.v
        phase = t*.27
        # A living particle ribbon, not a static generic gradient.
        x = 970+1010*u+32*v*np.cos(3*u+phase)
        y = 710+153*np.sin(2.6*u+phase)+v*(53+24*np.cos(4*u-phase))
        brightness = (.18+.82*self.spark**5)*(.45+.55*(v+1)/2)
        wave = .70+.30*np.sin(6*u+phase+v)**2
        xs, ys = x.astype(int), y.astype(int)
        inside = (xs >= 2)&(xs < self.size[0]-2)&(ys >= 2)&(ys < self.size[1]-2)
        xs, ys = xs[inside], ys[inside]
        values = (brightness*wave)[inside]
        pixels = np.zeros((self.size[1], self.size[0], 3), dtype=np.uint8)
        colors = np.clip(np.stack([values*16, values*190, values*310], axis=-1), 0, 255).astype('uint8')
        pixels[ys, xs] = colors
        hot = values > .60
        pixels[ys[hot]+1, xs[hot]] = colors[hot]
        pixels[ys[hot], xs[hot]+1] = colors[hot]
        light = Image.fromarray(pixels)
        contour = Image.new('RGB', (self.size[0]*2, 520))
        draw = ImageDraw.Draw(contour)
        # Long, partially lit contours make the same flowing gesture as Home.
        for j in range(3):
            a = np.linspace(-1.2, 1.2, 220)
            xx = 960+1050*a
            yy = 250+90*np.sin(a*2.15-phase*.55)+j*9
            points = list(zip(xx*2, (yy-130)*2))
            draw.line(points, fill=(0, 20+j*6, 40+j*10), width=2)
            start = int((.26+.12*math.sin(phase+j*.8))*len(points))
            draw.line(points[start:start+35], fill=(0, 118, 204), width=2)
        contour = contour.resize((self.size[0], 260), Image.Resampling.LANCZOS)
        light.paste(ImageChops.add(light.crop((0, 130, self.size[0], 390)), contour), (0, 130))
        low = light.resize((640, 360), Image.Resampling.BILINEAR)
        glow = low.filter(ImageFilter.GaussianBlur(4)).resize(self.size, Image.Resampling.BILINEAR)
        add_light(result, ImageChops.add(light, glow.point(lambda p: min(255, p*5))))
        return result

    def frame_volume(self, canvas, projection, back_projection):
        front = self.rim @ projection.T
        back = self.rim @ back_projection.T
        p = front[:, :2]/front[:, 2:3]
        q = back[:, :2]/back[:, 2:3]
        left, top = np.floor(np.minimum(p.min(axis=0), q.min(axis=0))-80).astype(int)
        right, bottom = np.ceil(np.maximum(p.max(axis=0), q.max(axis=0))+100).astype(int)
        size = (right-left, bottom-top)
        local, rear = p-[left, top], q-[left, top]
        # Soft occlusion between floating windows makes the separation tangible.
        mask = Image.new('L', size)
        ImageDraw.Draw(mask).polygon([tuple(point+[7, 16]) for point in rear], fill=160)
        shadow = Image.new('RGBA', size, (0, 3, 9, 0))
        shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(20)))
        canvas.alpha_composite(shadow, (left, top))
        # Projected side wall: real depth follows the same rotation as the page.
        surface = Image.new('RGBA', (size[0]*2, size[1]*2))
        draw = ImageDraw.Draw(surface)
        local, rear = local*2, rear*2
        draw.polygon([tuple(point) for point in rear], fill=(15, 24, 35))
        for i, a in enumerate(local):
            j = (i+1)%len(local)
            edge = p[j]-p[i]
            normal = np.array([edge[1], -edge[0]])/max(.001, np.linalg.norm(edge))
            key = max(0, float(normal @ np.array([-.7, -.7])))
            blue = max(0, float(normal @ np.array([.65, .76])))
            color = np.array([15, 24, 35])+key*np.array([31, 37, 43])+blue*np.array([0, 15, 30])
            draw.polygon([tuple(a), tuple(local[j]), tuple(rear[j]), tuple(rear[i])],
                         fill=tuple(map(int, color)))
        canvas.alpha_composite(surface.resize(size, Image.Resampling.LANCZOS), (left, top))

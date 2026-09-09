"""Deterministic Hubarch editorial motion study. Outputs video, original score, stills.

No runtime-site assets or scenes are changed. UI captures are used as source plates;
the typography, masks, camera crops and montage are authored for this film.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import math
from pathlib import Path
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H, FPS, BPM = 1920, 1080, 30, 128
BEAT = 60 / BPM
DURATION = 64 * BEAT
PAPER = (246, 244, 237)
INK = (27, 29, 27)
LINE = (191, 189, 180)
RUST = (163, 76, 48)
WHITE = (250, 249, 244)
STARTS = [0, 4, 8, 16, 20, 24, 28, 32, 40, 44, 48, 56, 60, 64]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease(x):
    x = clamp(x)
    return 16 * x**5 if x < .5 else 1 - (-2 * x + 2)**5 / 2


def lerp(a, b, p):
    return a + (b - a) * p


class Film:
    def __init__(self, hubarch_root, capture_root):
        self.asset = hubarch_root / 'public'
        self.font_paths = {
            'serif': self.asset / 'fonts/Panama_Regular.ttf',
            'sans': self.asset / 'fonts/Inter-Variable.ttf',
        }
        for file in self.font_paths.values():
            if not file.exists():
                raise FileNotFoundError(file)
        p = self.asset / 'images/projects/project1'
        self.images = {
            'lobby': Image.open(p / 'preview.png').convert('RGB'),
            'hall': Image.open(p / 'leftImage.png').convert('RGB'),
            'cafe': Image.open(p / 'bigImage_2.png').convert('RGB'),
            'class': Image.open(p / 'example.png').convert('RGB'),
            'plan': Image.open(p / 'miniImage_2.png').convert('RGBA'),
            'stone': Image.open(p / 'miniImage_1.png').convert('RGBA'),
            'texture': Image.open(p / 'texture_image.png').convert('RGB'),
        }
        for i in range(1, 5):
            self.images[f'space{i}'] = Image.open(
                self.asset / f'images/mainPage/screen3/project{i}.png').convert('RGB')
        for key, filename, fallback in [('home', 'hubarch-home.png', 1),
                                         ('projects', 'hubarch-projects.png', 7)]:
            file = capture_root / filename
            if file.exists():
                self.images[key] = Image.open(file).convert('RGB')
            else:
                im = Image.open(ROOT / f'public/images/portfolio/hubarch/image{fallback}.webp').convert('RGB')
                self.images[key] = im.crop((round(im.width * .16), round(im.height * .071),
                                            round(im.width * .84), round(im.height * .934)))

    @lru_cache(maxsize=128)
    def font(self, family, size):
        return ImageFont.truetype(str(self.font_paths[family]), round(size))

    @lru_cache(maxsize=160)
    def stamp(self, text, size, family='sans', colour=INK, tracking=0):
        f = self.font(family, size)
        boxes = [f.getbbox(c) for c in text]
        top = min((b[1] for b in boxes), default=0)
        bottom = max((b[3] for b in boxes), default=size)
        width = math.ceil(sum(f.getlength(c) for c in text) + tracking * max(0, len(text)-1))
        im = Image.new('RGBA', (max(1, width + 8), max(1, bottom-top+8)))
        d = ImageDraw.Draw(im)
        x = 4
        for c in text:
            d.text((x, 4-top), c, font=f, fill=colour)
            x += f.getlength(c) + tracking
        return im

    def text(self, im, value, xy, size=24, family='sans', colour=INK,
             align='left', tracking=0, opacity=1, scale=1):
        s = self.stamp(value, size, family, colour, tracking)
        if scale != 1:
            s = s.resize((max(1, round(s.width * scale)), max(1, round(s.height * scale))), Image.Resampling.BICUBIC)
        if opacity < 1:
            s = s.copy()
            s.putalpha(s.getchannel('A').point(lambda p: round(p * clamp(opacity))))
        x, y = xy
        if align == 'center':
            x -= s.width / 2
        elif align == 'right':
            x -= s.width
        im.paste(s, (round(x), round(y)), s)

    def photo(self, im, key, rect, zoom=1, pan=(.5, .5), opacity=1):
        x, y, w, h = rect
        w, h = max(1, round(w)), max(1, round(h))
        source = self.images[key]
        ratio = max(w/source.width, h/source.height) * zoom
        cw, ch = w/ratio, h/ratio
        sx = (source.width-cw)*pan[0]
        sy = (source.height-ch)*pan[1]
        patch = source.transform((w, h), Image.Transform.EXTENT,
                                 (sx, sy, sx+cw, sy+ch), Image.Resampling.BICUBIC)
        if opacity < 1:
            patch = patch.convert('RGBA')
            patch.putalpha(round(255 * clamp(opacity)))
        im.paste(patch, (round(x), round(y)), patch if patch.mode == 'RGBA' else None)

    def rule(self, im, a, b, colour=LINE, width=2, progress=1):
        if progress <= 0:
            return
        end = (lerp(a[0], b[0], clamp(progress)), lerp(a[1], b[1], clamp(progress)))
        ImageDraw.Draw(im).line([a, end], fill=colour, width=width)

    def cross(self, im, x, y, size=15, colour=INK, angle=0, width=2):
        for phase in [0, math.pi/2]:
            dx, dy = math.cos(angle+phase)*size, math.sin(angle+phase)*size
            self.rule(im, (x-dx, y-dy), (x+dx, y+dy), colour, width)

    def chrome(self, im, dark=False, chapter=None):
        colour = WHITE if dark else INK
        self.text(im, 'HUBARCH', (78, 56), 30, tracking=1, colour=colour)
        self.text(im, 'DIGITAL EXPERIENCE', (1840, 62), 15, colour=colour,
                  align='right', tracking=3)
        if chapter:
            self.text(im, chapter, (78, 996), 16, colour=colour, tracking=2)
            self.rule(im, (78, 1040), (1840, 1040), (79, 79, 73) if dark else LINE, 1)

    def render(self, time):
        beat = clamp(time / BEAT, 0, 63.999999)
        scene = next(i for i in range(len(STARTS)-1) if STARTS[i] <= beat < STARTS[i+1])
        b = beat - STARTS[scene]
        p = b / (STARTS[scene+1]-STARTS[scene])
        fn = [self.opening, self.aperture, self.hero, self.words, self.catalogue,
              self.drawing, self.material, self.website, self.statement,
              self.detail, self.collection, self.signature, self.end][scene]
        return fn(b, p)

    def opening(self, b, p):
        im = Image.new('RGB', (W, H), PAPER)
        q = ease(b / 1.8)
        self.rule(im, (960, 140), (960, 925), progress=q)
        self.rule(im, (220, 540), (1700, 540), progress=q)
        # Letter reveal through a moving architectural aperture.
        s = self.stamp('HUBARCH', 235, 'sans', INK, 4)
        mask = Image.new('RGBA', s.size)
        mask.paste(s, (0, round((1-q)*s.height)))
        im.paste(mask, (round((W-s.width)/2), 400), mask)
        self.cross(im, 960, 720, 18, RUST, angle=math.pi/4*q)
        self.text(im, 'ПРОСТРАНСТВО В ДВИЖЕНИИ', (960, 804), 20, align='center',
                  tracking=5, opacity=smooth((b-1.2)/1.2))
        self.text(im, 'АРХИТЕКТУРА / ИНТЕРЬЕРЫ', (80, 67), 17, tracking=2)
        self.text(im, 'A DIGITAL MONSTER FILM', (1840, 997), 16, align='right', tracking=3)
        return im

    def aperture(self, b, p):
        im = Image.new('RGB', (W, H), INK)
        q = ease(b/2)
        w = lerp(44, W, q)
        self.photo(im, 'lobby', ((W-w)/2, 0, w, H), zoom=1.05+.08*p,
                   pan=(.48+.03*p,.45))
        self.rule(im, ((W-w)/2, 0), ((W-w)/2,H), PAPER, 2)
        self.rule(im, ((W+w)/2, 0), ((W+w)/2,H), PAPER, 2)
        if b > 1.5:
            self.text(im, 'МЕСТО', (90, 706-32*smooth((b-1.5)/1.5)), 174,
                      'serif', WHITE, opacity=smooth((b-1.5)/1.0))
            self.text(im, 'ДЛЯ ИДЕЙ', (94, 922), 21, colour=WHITE, tracking=6,
                      opacity=smooth((b-1.8)))
        return im

    def hero(self, b, p):
        im = Image.new('RGB', (W, H), PAPER)
        q = ease(b/1.8)
        x, y, size = lerp(0, 665, q), lerp(0, 238,q), lerp(W,590,q)
        height = lerp(H,590,q)
        key = ['lobby','space1','space2','class'][min(3, int(max(0,b-2)/1.5))]
        self.photo(im, key, (x,y,size,height), zoom=1+.03*(b%1.5))
        self.rule(im, (960,142), (960,945), progress=q)
        self.rule(im, (80,536), (1840,536), progress=q)
        self.cross(im, 960,536,16,RUST, angle=math.pi/4)
        self.text(im, 'АРХИТЕКТУРА', (lerp(-700,150,q),346), 150,'serif',opacity=q)
        self.text(im, 'ИНТЕРЬЕРЫ', (lerp(2200,950,q),611), 150,'serif',opacity=q)
        self.chrome(im)
        self.text(im, 'ГРАФИКА, КОТОРАЯ ДАЁТ ПРОСТРАНСТВУ ГОЛОС', (150,946),17,
                  tracking=2, opacity=smooth(b-2))
        return im

    def words(self, b, p):
        im = Image.new('RGB',(W,H),INK)
        index = min(2, int(b/1.25))
        local = b-index*1.25
        word = ['ФОРМА','СВЕТ','ПРОСТРАНСТВО'][index]
        key = ['hall','space2','class'][index]
        self.photo(im,key,(0,0,W,H),zoom=1.1+.05*p)
        overlay = Image.new('RGB',(W,H),INK)
        im = Image.blend(im,overlay,.46)
        size = [330,370,171][index]
        self.text(im, word,(960,432+48*(1-ease(local/.65))),size,'serif',WHITE,
                  align='center',opacity=smooth(local/.4))
        self.rule(im,(80,926),(1840,926),WHITE,2,progress=smooth(local/.7))
        self.text(im,'РИТМ ВНУТРИ КАЖДОЙ КОМПОЗИЦИИ',(82,970),18,
                  colour=WHITE,tracking=4)
        self.text(im,f'0{index+1}',(1840,80),28,colour=WHITE,align='right')
        return im

    def catalogue(self,b,p):
        im = Image.new('RGB',(W,H),PAPER)
        self.chrome(im,chapter='ВЫБОР ПРОЕКТА')
        self.text(im,'ПРОЕКТЫ',(70,165),168,'serif')
        keys=['lobby','space2','class']
        labels=['CREATORS SCHOOL','ПРОСТРАНСТВО','СВЕТ И ФОРМА']
        for i,key in enumerate(keys):
            q=ease((b-i*.35)/1.5)
            self.photo(im,key,(80+i*596,lerp(1140,382,q),568,480),zoom=1.04+.025*p)
            self.text(im,labels[i],(80+i*596,901),18,tracking=2,opacity=q)
            self.rule(im,(80+i*596,942),(648+i*596,942),INK,1,progress=q)
        return im

    def drawing(self,b,p):
        im=Image.new('RGB',(W,H),PAPER)
        self.chrome(im,chapter='ОТ ЗАМЫСЛА К ПРОСТРАНСТВУ')
        self.text(im,'Видеть',(88,268),149,'serif')
        self.text(im,'глубже.',(88,442),149,'serif')
        self.text(im,'ПЛАН. ДЕТАЛЬ. ЦЕЛОЕ.',(90,723),18,tracking=4)
        q=ease(b/1.5)
        self.rule(im,(853,176),(853,927),progress=q)
        self.rule(im,(905,862),(1760,862),INK,2,progress=q)
        self.rule(im,(1758,233),(1758,862),INK,2,progress=q)
        self.cross(im,1758,862,10)
        # Actual project plan from the website, on a contrasting material field.
        self.photo(im,'plan',(930,lerp(330,256,q),760,580),opacity=q)
        self.text(im,'CREATORS SCHOOL',(930,905),20,tracking=3,opacity=q)
        return im

    def material(self,b,p):
        im=Image.new('RGB',(W,H),INK)
        self.photo(im,'hall',(0,0,958,H),zoom=1.02+.12*p,pan=(.45,.40))
        self.photo(im,'cafe',(966,0,954,H),zoom=1.14-.10*p,pan=(.52,.52))
        self.rule(im,(960,0),(960,H),PAPER,8)
        self.text(im,'ДЕТАЛИ',(78,77),24,colour=WHITE,tracking=5)
        self.text(im,'имеют значение.',(1840,908),102,'serif',WHITE,align='right')
        self.cross(im,960,540,21,WHITE,angle=math.pi/4)
        return im

    def website(self,b,p):
        im=Image.new('RGB',(W,H),INK)
        self.chrome(im,True,chapter='ГАЛЕРЕЯ / ЖИВОЙ ИНТЕРФЕЙС')
        q=ease(b/2)
        # Moving from a content crop into the real, captured page reveals context.
        self.photo(im,'projects',(lerp(-160,230,q),lerp(-10,144,q),
                                   lerp(2240,1460,q),lerp(1260,821,q)),
                   zoom=1,pan=(.5,.5))
        if b>2:
            # Thin inspection brackets follow the project's content bounds.
            k=smooth((b-2)/1.2)
            x,y=506,364
            for a,c in [((x,y+72),(x,y)),((x,y),(x+85,y)),
                        ((1344,795),(1429,795)),((1429,795),(1429,723))]:
                self.rule(im,a,c,RUST,3,progress=k)
        return im

    def statement(self,b,p):
        im=Image.new('RGB',(W,H),PAPER)
        self.chrome(im)
        for i,(word,size) in enumerate([('СМЫСЛ',226),('ЗАДАЁТ',226),('ФОРМУ',226)]):
            q=ease((b-i*.42)/1.2)
            self.text(im,word,(80+i*235,140+i*245+75*(1-q)),size,'serif',
                      RUST if i==1 else INK,opacity=q)
        self.rule(im,(1622,163),(1622,920),INK,2,progress=ease(b/2))
        self.cross(im,1622,920,18,RUST,angle=math.pi/4)
        return im

    def detail(self,b,p):
        im=Image.new('RGB',(W,H),PAPER)
        self.chrome(im,chapter='ТИПОГРАФИКА / ПРОПОРЦИИ / ДВИЖЕНИЕ')
        # Editorial magnification of the authentic home; not a fabricated UI.
        q=ease(b/2)
        self.photo(im,'home',(80,184,1760,722),zoom=lerp(1.72,1.10,q),pan=(.48,.36))
        self.rule(im,(80,935),(1840,935),INK,2)
        self.text(im,'КРУПНЫЙ ПЛАН',(80,956),15,tracking=4)
        return im

    def collection(self,b,p):
        im=Image.new('RGB',(W,H),PAPER)
        self.chrome(im,chapter='ОДИН ВИЗУАЛЬНЫЙ ЯЗЫК')
        q=ease(b/1.7)
        r=smooth((b-4.2)/2)
        keys=['home','projects','class']
        for i,key in enumerate(keys):
            x=lerp(1920+i*460,80+i*606,q)-r*130
            y=lerp(402+i*120,210+i*30,q)
            self.photo(im,key,(x,y,568,460 if i<2 else 568),zoom=1+.05*p,
                       pan=(.5,.45))
            self.rule(im,(x,y-18),(x+568,y-18),INK,2)
        self.text(im,'Разные пространства.',(80,810),81,'serif',opacity=q)
        self.text(im,'Цельная система.',(920,906),73,'serif',opacity=q)
        return im

    def signature(self,b,p):
        im=Image.new('RGB',(W,H),INK)
        self.photo(im,'lobby',(0,0,W,H),zoom=1.18-.08*p)
        im=Image.blend(im,Image.new('RGB',(W,H),INK),.30)
        q=ease(b/1.3)
        self.text(im,'HUBARCH',(960,427+40*(1-q)),222,'sans',WHITE,
                  align='center',tracking=2,opacity=q)
        self.text(im,'ПРОСТРАНСТВО В ДВИЖЕНИИ',(960,721),22,colour=WHITE,
                  align='center',tracking=5,opacity=smooth(b-1))
        self.cross(im,960,860,17,WHITE,angle=math.pi/4)
        return im

    def end(self,b,p):
        im=Image.new('RGB',(W,H),PAPER)
        self.rule(im,(960,140),(960,925))
        self.rule(im,(220,540),(1700,540))
        self.text(im,'HUBARCH',(960,400),235,align='center',tracking=4)
        self.cross(im,960,720,18,RUST,angle=math.pi/4)
        self.text(im,'ПРОСТРАНСТВО В ДВИЖЕНИИ',(960,804),20,align='center',tracking=5)
        self.text(im,'АРХИТЕКТУРА / ИНТЕРЬЕРЫ',(80,67),17,tracking=2)
        self.text(im,'DESIGN & DEVELOPMENT / DIGITAL MONSTER',(1840,997),16,
                  align='right',tracking=2)
        # Leave a clean ending for this review cut; no artificial crossfade loop.
        return im


def score(output):
    """Original 16-bar electronic instrumental; no sampled commercial recording."""
    sr=44100
    total=round(DURATION*sr)
    mix=np.zeros((total,2),np.float64)
    rng=np.random.default_rng(2718)

    def add(sound,beat,level=1,pan=0):
        start=round(beat*BEAT*sr)
        if start>=total:
            return
        sound=np.asarray(sound)[:total-start]*level
        gains=np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)])
        mix[start:start+len(sound)]+=sound[:,None]*gains[None,:]

    def noise(length,lo,hi):
        n=round(length*sr)
        freqs=np.fft.rfftfreq(n,1/sr)
        spectrum=np.fft.rfft(rng.normal(0,1,n))
        filt=(1-np.exp(-(freqs/max(1,lo))**4))*np.exp(-(freqs/hi)**6)
        signal=np.fft.irfft(spectrum*filt,n)
        return signal/(np.std(signal)+1e-8)

    t=np.arange(round(.44*sr))/sr
    phase=2*np.pi*(48*t+95*.016*(1-np.exp(-t/.016)))
    kick=np.sin(phase)*np.exp(-t/0.125)*(1-np.exp(-t/.0008))
    kick[:900]+=noise(900/sr,2200,6500)*np.exp(-np.arange(900)/sr/.004)*.09
    t2=np.arange(round(.22*sr))/sr
    env=sum(np.exp(-np.maximum(0,t2-d)/.022)*(t2>=d) for d in [0,.011,.022])
    clap=noise(.22,900,6500)*env*.21+np.sin(2*np.pi*180*t2)*np.exp(-t2/.026)*.1
    ht=np.arange(round(.13*sr))/sr
    hat=noise(.13,6000,14000)*np.exp(-ht/.023)*.065
    oh=noise(.25,5500,15000)*np.exp(-np.arange(round(.25*sr))/sr/.075)*.053

    for beat in range(64):
        breakdown=32<=beat<40
        if not breakdown or beat in (32,36):
            add(kick,beat,.90 if beat<60 else .74)
        if beat%4 in (1,3) and beat>=4 and not breakdown:
            add(clap,beat,.64)
        if beat>=4:
            add(hat,beat+.5,.55 if breakdown else 1,pan=.30)
        if beat>=8 and not breakdown:
            add(oh,beat+.5,.48,pan=-.22)
            if beat%4 in (2,3):
                add(hat,beat+.78,.43,pan=-.4)
            if beat%8==7:
                add(clap,beat+.75,.19,pan=.14)

    roots=[38,38,41,36,38,38,41,36,38,41,36,38,38,41,36,38]
    bass_pattern=[(0,0,.36),(.75,12,.20),(1.5,0,.26),(2.5,7,.20),(3.25,0,.30)]
    for bar,root in enumerate(roots):
        for off,semitones,length in bass_pattern:
            if 8<=bar<10:
                continue
            freq=440*2**((root+semitones-69)/12)
            t=np.arange(round(length*sr))/sr
            phase=2*np.pi*freq*t
            sound=sum(np.sin(phase*h)/h**1.7 for h in range(1,6))
            sound=np.tanh(sound*1.7)*np.exp(-t/.19)*(1-np.exp(-t/.006))
            # The envelope keeps transients separated from the kick.
            duck=1-.62*np.exp(-((off+t/BEAT)%1)*10)
            add(sound*duck,bar*4+off,.30 if bar>=2 else .21)

        chord=[root+24,root+27,root+31,root+34]
        for off in ([.5,2.75] if bar>=2 else [0]):
            length=.85
            t=np.arange(round(length*sr))/sr
            snd=np.zeros(len(t))
            for j,note in enumerate(chord):
                f=440*2**((note-69)/12)
                snd+=(np.sin(2*np.pi*f*t)+.23*np.sin(2*np.pi*f*2.002*t))/(len(chord))
            env=(1-np.exp(-t/.014))*np.exp(-t/(.45 if 8<=bar<10 else .17))
            snd*=env
            level=.16 if bar<8 else .20
            add(snd,bar*4+off,level,-.32)
            add(snd,bar*4+off+.75,level*.32,.42)

    # Small pitched accents and a restrained noise lift support edit points.
    for bar in range(4,16):
        for j,note in enumerate([74,77,81,79]):
            if bar in (8,9):
                continue
            off=j*.5+.5
            t=np.arange(round(.3*sr))/sr
            freq=440*2**((note-69)/12)
            pluck=np.sin(2*np.pi*freq*t+.24*np.sin(2*np.pi*freq*2*t))
            pluck*=np.exp(-t/.065)*(1-np.exp(-t/.002))
            add(pluck,bar*4+off,.065,(-1 if j%2 else 1)*.5)
            add(pluck,bar*4+off+.75,.022,(-1 if j%2 else 1)*-.5)
    for at in [15,31,39,55]:
        dur=BEAT
        n=noise(dur,1800,11000)
        n*=np.linspace(0,1,len(n))**2
        add(n,at,.045)

    # Soft headroom, a short entrance, and an intentional musical tail.
    mix=np.tanh(mix*1.14)
    mix*=.84/max(.84,float(np.max(np.abs(mix))))
    fade=round(.006*sr)
    mix[:fade]*=np.linspace(0,1,fade)[:,None]
    tail=round(.55*sr)
    mix[-tail:]*=np.linspace(1,0,tail)[:,None]**1.3
    with wave.open(str(output),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((mix*32767).astype('<i2').tobytes())
    print(f'Original score: peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix**2)):.3f}',flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--hubarch-root',type=Path,default=Path('C:/websites/archive/hubarch'))
    parser.add_argument('--capture-root',type=Path,default=ROOT/'output/showreels/hubarch/sources')
    parser.add_argument('--output',type=Path,default=ROOT/'output/showreels/hubarch')
    parser.add_argument('--ffmpeg',default='ffmpeg')
    parser.add_argument('--width',type=int,default=1920)
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--samples',type=int,default=2,choices=[1,2])
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    film=Film(args.hubarch_root,args.capture_root)
    times=[.9,3.3,5.9,8.55,10.65,12.4,14.6,17.8,19.9,21.6,24.5,27.7,29.2]
    thumbs=[]
    for i,t in enumerate(times):
        frame=film.render(t)
        if i in [0,2,6,7,10,11]:
            frame.save(args.output/f'frame-{i+1:02}.jpg',quality=95)
        thumb=frame.resize((480,270),Image.Resampling.LANCZOS)
        tile=Image.new('RGB',(480,306),PAPER)
        tile.paste(thumb,(0,0))
        ImageDraw.Draw(tile).text((12,282),f'{t:04.1f}s / {i+1:02}',font=film.font('sans',15),fill=INK)
        thumbs.append(tile)
    board=Image.new('RGB',(480*3,306*math.ceil(len(thumbs)/3)),(214,212,204))
    for i,t in enumerate(thumbs):
        board.paste(t,((i%3)*480,(i//3)*306))
    board.save(args.output/'storyboard.jpg',quality=94)
    audio=args.output/'hubarch-original-score.wav'
    score(audio)
    if args.preview:
        print(f'Preview ready: {args.output}',flush=True)
        return
    width=args.width; height=round(width*9/16/2)*2
    output=args.output/'hubarch-motion-v1.mp4'
    ff=subprocess.Popen([args.ffmpeg,'-y','-hide_banner','-loglevel','error',
                         '-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}',
                         '-r',str(FPS),'-i','pipe:0','-i',str(audio),
                         '-map','0:v','-map','1:a','-c:v','libx264','-preset','medium',
                         '-crf','18','-pix_fmt','yuv420p','-threads','4',
                         '-c:a','aac','-b:a','192k','-ar','48000',
                         '-af','loudnorm=I=-16:TP=-1.5:LRA=9',
                         '-movflags','+faststart','-shortest',str(output)],
                        stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(round(DURATION*FPS)):
            # A two-sample 180-degree shutter gives fast type/masks natural motion blur.
            frame=film.render(i/FPS)
            if args.samples==2:
                frame=Image.blend(frame,film.render((i+.5)/FPS),.5)
            if (width,height)!=(W,H):
                frame=frame.resize((width,height),Image.Resampling.LANCZOS)
            ff.stdin.write(frame.tobytes())
            if i%60==0:
                print(f'{i}/{round(DURATION*FPS)} frames',flush=True)
        ff.stdin.close()
        error=ff.stderr.read().decode(errors='replace')
        if ff.wait()!=0:
            raise RuntimeError(error)
    except BaseException:
        ff.kill();ff.wait();raise
    print(f'Film ready: {output} ({output.stat().st_size/1024/1024:.1f} MiB)',flush=True)


if __name__=='__main__':
    main()

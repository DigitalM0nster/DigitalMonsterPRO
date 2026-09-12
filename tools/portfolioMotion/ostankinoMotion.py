"""Ostankino: actual building interaction, native UI depth and mobile workflow."""
from dataclasses import dataclass, replace
from bisect import bisect_right
import json
import numpy as np
from PIL import Image
from direction import SIZE, Pose, corners, homography, max_pixel_scale
from digitalMonsterStyle import DigitalMonsterStyle
from ostankinoShots import Sources, BASE
from pulseMotion import curve, effect_peak


@dataclass(frozen=True)
class Item:
    key: str
    source: str
    x: float = 960
    y: float = 540
    scale: float = .82
    yaw: float = 0
    pitch: float = 0
    roll: float = 0
    opacity: float = 1
    clock: float = 0


FIELDS = ('x', 'y', 'scale', 'yaw', 'pitch', 'roll', 'opacity')
# Scene changes are sparse; native interaction and secondary UI fill the beats.
SCORE = [(0,'identity'), (1,'building'), (2,'floor-ui'), (4,'home'),
         (8,'rental'), (12,'floor-card'), (14,'rental'), (16,'plans'),
         (18,'plan-pieces'), (20,'room'), (22,'mobile'), (24,'mobile'),
         (27,'field'), (32,'services'), (34,'finale'), (36,'finale'), (38,'resolve')]


class OstankinoMotion:
    project = 'ostankino'

    def __init__(self, timing):
        self.timing = timing
        self.sources = Sources()
        data = json.loads((BASE/'motion-beatmap-v5.json').read_text('utf-8'))
        self.beats = np.array([p['frame']/60 for p in data['landmarks'] if p['is_quarter']])
        self.keys = [(self.cue(b), name, b) for b, name in SCORE]
        self.times = [k[0] for k in self.keys]
        self.style = DigitalMonsterStyle(SIZE, (1312, 800), 16, 'ostankino.ru')
        self.native_cues = []

    def cue(self, beat):
        return float(np.interp(beat, np.arange(len(self.beats)), self.beats))

    def play(self, clip, time, anchor, settle, start=0):
        # Recorded website playback at real speed; align its settled state to hit.
        return max(start, settle + time-self.cue(anchor))

    def composition(self, name, beat, time):
        beat_clock = time*self.timing['track']['bpm']/60
        def item(key, source=None, **kw):
            return Item(key, source or key, **kw)
        building = item('building', x=760,y=585,scale=.65, yaw=-3)
        word = item('word','word-white',x=960,y=158,scale=.85)
        if name == 'identity':
            return [replace(word, y=500, scale=.88),replace(building,opacity=.07,y=740,scale=.59)]
        if name in ('building','floor-ui'):
            layers = [building,word]
            if name == 'floor-ui':
                layers.append(item('floor-card',x=1455,y=430,scale=.93,yaw=-4))
                layers.append(item('slider',x=1450,y=720,scale=.84))
                for i in range(13):
                    # Original circular controls settle successively into one row.
                    u=curve((time-self.cue(2+i/13)+.12)/.12)
                    layers.append(item(f'floor-button-{i+1}',x=530+i*65,y=985+18*(1-u),scale=.92,opacity=u))
            return layers
        if name == 'home':
            clock=self.play('desktop-home-scroll',time,7,3.25)
            return [item('desktop','desktop-home-scroll',x=960,y=534,scale=.87,clock=clock)]
        if name == 'rental':
            clip,anchor,settle=('floor11',9,.77) if beat==8 else ('floor6-transition',15,.76)
            clock=self.play(clip,time,anchor,settle,start=.31)
            return [item('desktop',clip,y=528,scale=.865,clock=clock)]
        if name == 'floor-card':
            return [replace(building,x=730,y=570,scale=.66),
                    item('floor-card',x=1480,y=405,scale=.96,yaw=-4),
                    item('slider',x=1445,y=708,scale=.94),
                    item('cta',x=1440,y=830,scale=.95),
                    replace(word,y=125,scale=.72)]
        if name == 'plans':
            return [item('desktop','plans-transition',y=535,scale=.86,
                         clock=self.play('plans-transition',time,17,.73,start=.28))]
        if name == 'plan-pieces':
            layers=[]
            for i in range(4):
                sign=(-1 if i<2 else 1)
                layers.append(item(f'plan{i}',x=292+i*447,y=535+(-30 if i%2 else 30),
                    scale=.93, yaw=sign*3,roll=sign*.6))
            return layers
        if name == 'room':
            return [item('desktop','room-smooth',scale=.86,y=535,
                         clock=self.play('room-smooth',time,21,.7733333333333334,start=.34))]
        if name == 'mobile':
            if beat == 22:
                return [item('phone-a','mobile-rent-hero',x=445,y=548,scale=.87,yaw=5,clock=1.6),
                        item('phone-b','mobile-filter',x=960,y=525,scale=.97,clock=self.play('mobile-filter',time,23,1.10,start=.29)),
                        item('phone-c','mobile-room',x=1475,y=548,scale=.87,yaw=-5,clock=self.play('mobile-room',time,23,1.35,start=.75))]
            return [item('phone-a','mobile-scroll',x=445,y=548,scale=.87,yaw=5,clock=self.play('mobile-scroll',time,25,1.0)),
                    item('phone-b','mobile-menu',x=960,y=525,scale=.97,clock=min(1.9,self.play('mobile-menu',time,26,1.7,start=.30))),
                    item('phone-c','mobile-room',x=1475,y=548,scale=.87,yaw=-5,clock=1.60)]
        if name == 'field':
            layers=[]
            grid=['desktop-home-scroll','floor11','plans-transition','desktop-services-transition','building-reset','room-open']
            tilt=np.radians(-7);c,s=np.cos(tilt),np.sin(tilt)
            for row in range(3):
                travel=(beat_clock-27)*112*(1 if row!=1 else -1)
                for col in range(-2,4):
                    x=(col-.5)*712+travel;y=(row-1)*416
                    source=grid[(row*3+col)%len(grid)]
                    layers.append(item(f'wall{row}-{col}',source,x=960+x*c-y*s,y=540+x*s+y*c,
                                       scale=.355,roll=-7,clock=2.5))
            return layers
        if name == 'services':
            return [item('desktop','desktop-services-transition',scale=.855,y=535,
                         clock=self.play('desktop-services-transition',time,33,1.45,start=.32))]
        if name in ('finale','resolve'):
            if name == 'resolve':
                return [replace(word,y=500,scale=.86),replace(building,opacity=.12,y=615,scale=.55)]
            if beat==34:
                return [replace(building,x=875,y=574,scale=.62),
                        item('phone-c','mobile-room',x=1540,y=543,scale=.76,yaw=-4,clock=1.7),
                        item('floor-card',x=420,y=370,scale=.75,yaw=4),replace(word,y=124,scale=.72)]
            return [replace(building,x=880,y=587,scale=.63),
                    item('phone-c','mobile-menu-still',x=1530,y=557,scale=.75,yaw=-4),
                    item('floor-card',x=402,y=374,scale=.74,yaw=4),replace(word,y=124,scale=.80)]
        raise ValueError(name)

    def layers(self,time):
        i=max(0,bisect_right(self.times,time)-1)
        _,name,beat=self.keys[i]
        before=self.composition(name,beat,time)
        if i==len(self.keys)-1:return before
        arrival,target,b=self.keys[i+1]
        width=.28
        u=(time-arrival+width)/width
        if u<=0:return before
        after=self.composition(target,b,time)
        aa={p.key:p for p in before};bb={p.key:p for p in after}
        result=[]
        for key in dict.fromkeys([p.key for p in before+after]):
            a,dest=aa.get(key),bb.get(key)
            if a and dest and a.source!=dest.source:
                # Source changes are an editorial dissolve, not a texture jump.
                q=curve(u)
                result.extend([replace(a,opacity=a.opacity*(1-q)),replace(dest,opacity=dest.opacity*q)])
                continue
            if not a:a=replace(dest,y=dest.y+32,scale=dest.scale*.975,opacity=0)
            if not dest:dest=replace(a,y=a.y-28,scale=a.scale*.985,opacity=0)
            q=curve(u)
            result.append(replace(dest,**{f:getattr(a,f)+(getattr(dest,f)-getattr(a,f))*q for f in FIELDS}))
        return result

    def draw(self, canvas, item):
        if item.opacity<1e-5:return
        sprite,native_size=self.sources.image(item.source,item.clock)
        w,h=native_size
        # Analytic conservative bound also covers near-edge perspective.
        z=(w*abs(np.sin(np.radians(item.yaw)))+h*abs(np.sin(np.radians(item.pitch))))/2
        bound=item.scale/(1-z*item.scale/2200)**2
        pose=Pose(item.x,item.y,item.scale/max(1,bound),item.yaw,item.pitch,item.roll)
        original,projected=corners(pose,card_size=sprite.size)
        lo=np.maximum((0,0),np.floor(projected.min(axis=0)).astype(int))
        hi=np.minimum(SIZE,np.ceil(projected.max(axis=0)).astype(int))
        if np.any(hi<=lo):return
        matrix=homography(projected-lo,original)
        tile=sprite.transform(tuple(hi-lo),Image.Transform.PERSPECTIVE,matrix.flat[:8],Image.Resampling.BICUBIC).convert('RGBA')
        if item.opacity<.99999:tile.putalpha(tile.getchannel('A').point(lambda a:round(a*item.opacity)))
        canvas.alpha_composite(tile,tuple(lo))

    def render(self,time):
        canvas=self.style.background(time*.28)
        depth={'building':5,'desktop':10,'floor-card':35,'slider':36,'cta':37,'word':50}
        def order(p):
            if p.key.startswith('wall'):return 0
            if p.key.startswith('phone'):return 30
            if p.key.startswith('floor') and p.key!='floor-card':return 40
            return depth.get(p.key,20)
        for p in sorted(self.layers(time),key=order):self.draw(canvas,p)
        return canvas.convert('RGB')

    def events(self,ffmpeg=None):
        events=[]
        # Scene travel peaks just before arrival, clicks accompany genuine UI.
        for beat,name in SCORE[1:]:
            at=self.cue(beat);duration=.24;kind='air' if name in ('home','mobile','field','finale') else 'soft'
            peak=effect_peak(ffmpeg,kind,duration) if ffmpeg else duration/2
            events.append(dict(time=max(0,at-.025-peak),duration=duration,kind=kind,db=-25,
                               arrival=at,audio_peak_time=at-.025,visual=name,peak_measured=bool(ffmpeg)))
        for beat,kind,label in [(2,'lock','floor controls'),(9,'switch','floor 11'),(12,'lock','floor card'),
                                (15,'switch','floor 6'),(17,'lock','view plans'),(18,'paper','plan cards'),
                                (21,'lock','open room'),(23,'lock','mobile filter / room'),
                                (26,'soft','mobile menu'),(33,'switch','services'),(36,'lock','finale')]:
            at=self.cue(beat);duration=.105 if kind=='lock' else .18
            peak=effect_peak(ffmpeg,kind,duration) if ffmpeg else duration/2
            events.append(dict(time=max(0,at-peak),duration=duration,kind=kind,db=-25 if kind=='lock' else -28,
                               arrival=at,audio_peak_time=at,visual=label,peak_measured=bool(ffmpeg)))
        return events

    def check(self):
        maximum=0.;errors=[]
        for t in np.linspace(0,self.timing['duration'],160):
            for p in self.layers(t):
                if p.opacity<.05:continue
                _,size=self.sources.image(p.source,p.clock)
                w,h=size;z=(w*abs(np.sin(np.radians(p.yaw)))+h*abs(np.sin(np.radians(p.pitch))))/2
                bound=p.scale/(1-z*p.scale/2200)**2
                s=p.scale/max(1,bound)
                actual=s/(1-z*s/2200)**2;maximum=max(maximum,actual)
                if actual>1.001:errors.append((float(t),p.key,actual))
        # Changes in content are deliberate blends, never instantaneous swaps.
        for at,_,_ in self.keys[1:]:
            for t in (at-.28,at):
                a={(p.key,p.source):p for p in self.layers(t-1e-7)}
                b={(p.key,p.source):p for p in self.layers(t+1e-7)}
                for key in a.keys()|b.keys():
                    if key not in a or key not in b:
                        assert (a.get(key) or b.get(key)).opacity<.0001,(t,key)
                    elif max(a[key].opacity,b[key].opacity)>.0001:
                        assert max(abs(getattr(a[key],f)-getattr(b[key],f)) for f in FIELDS)<.02,(t,key)
        return dict(actions=len(self.keys)-1,distinct_modes=len(set(k[1] for k in self.keys)),
                    conservative_pixel_scale_bound=maximum,scale_flags=errors,
                    continuity='All scene boundaries inspected numerically',
                    native_sources=dict(desktop=list(k for k in self.sources.clips if not k.startswith('mobile')),
                      mobile=list(k for k in self.sources.clips if k.startswith('mobile')),
                      ui='Real floor controls, slider, floor card and four plan cards',
                      building='Original 1920x1200 transparent PNG',wordmark='Original SVG alpha, white letters on transparent background',
                      playback='Captured timestamps; room-panel translation reconstructed at 60 fps from unchanged native pixels and measured positions',browser_toolbars=0),
                    keys=[dict(arrival=a,mode=n,beat=b) for a,n,b in self.keys])

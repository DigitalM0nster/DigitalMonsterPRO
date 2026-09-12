"""Continuous beat choreography with perspective, stagger and actual native lift."""
from bisect import bisect_right
from dataclasses import replace
from functools import lru_cache
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from direction import Pose, corners, homography, max_pixel_scale, project_points, SIZE, CONTENT_ORIGIN
from elementLift import LiftSpec, split_photo, photo_geometry, draw_photo
from flowMotion import Flow
from pulseLayouts import Layouts, SCORES, Plane
from individualMusic import decode, SFX, RATE
from showreel import ROOT

FIELDS=('x','y','scale','yaw','pitch','roll','opacity','lift','chrome')
LIFTS={
 'hubarch': [(280,160,1001,561)],
 'belka-production': [(627,300,1210,613),(35,303,608,616)],
 'ostankino': [(18,581,1248,688)],
 'mmk-1': [(64,367,493,558),(525,367,954,558)],
 'nipigas': [(325,177,832,403)],
}

def curve(u):
    # Symmetric minimum jerk. The destination is the measured percussion frame;
    # duration no longer changes which part of the movement meets the beat.
    u=float(np.clip(u,0,1))
    return float(u*u*u*(u*(6*u-15)+10))


def percussion_anchors(project, timing):
    """Match authored order to real attacks without adding weak subdivisions."""
    data=json.loads((ROOT/f'output/showreels/{project}/motion-beatmap-v5.json').read_text('utf-8'))
    offset=data['source_start']-timing['source_start']
    candidates=[]
    for item in data['landmarks']:
        at=round((item['suggested_anchor_time']+offset)*60)/60
        if item['recommended'] and at>.08 and at<timing['duration']-1.8:
            candidates.append(dict(item,time=at))
    score=SCORES[project][1:]
    n,m=len(score),len(candidates)
    cost=np.full((n,m),np.inf);parent=np.full((n,m),-1,dtype=int)
    for i,(beat,_,_) in enumerate(score):
        for j,item in enumerate(candidates):
            local=(item['beat']-beat)**2+.015/max(item['strength'],.05)
            if float(beat).is_integer() and not item['is_quarter']:local+=.15
            if i==0:
                cost[i,j]=local
                continue
            viable=[k for k in range(j) if item['time']-candidates[k]['time']>=.15]
            if viable:
                k=min(viable,key=lambda k:cost[i-1,k])
                cost[i,j]=local+cost[i-1,k];parent[i,j]=k
    j=int(np.argmin(cost[-1]))
    if not np.isfinite(cost[-1,j]):raise ValueError(f'Insufficient measured attacks for {project}')
    selected=[]
    for i in range(n-1,-1,-1):
        selected.append(candidates[j]);j=int(parent[i,j])
    return [dict(time=0.,beat=0.,recommended=True,is_quarter=True,strength=1.)]+selected[::-1]


@lru_cache(maxsize=18)
def effect_source(ffmpeg, kind):
    """Same trim/filter as soundtrack(), so measured sound peaks survive mixing."""
    file,filters=SFX[kind]
    data=decode(ffmpeg,ROOT/file,duration=2,filters=filters).mean(axis=1)
    hot=np.flatnonzero(np.abs(data)>max(np.max(np.abs(data))*.04,.00001))
    if len(hot):data=data[max(0,hot[0]-240):min(len(data),hot[-1]+2400)]
    return data/max(np.max(np.abs(data)),1e-8)


@lru_cache(maxsize=96)
def effect_peak(ffmpeg, kind, duration):
    source=effect_source(ffmpeg,kind)
    count=max(480,round(duration*RATE))
    sound=np.interp(np.linspace(0,len(source)-1,count),np.arange(len(source)),source)
    fade=min(count//3,1920)
    sound[:fade]*=np.sin(np.linspace(0,np.pi/2,fade))**2
    sound[-fade:]*=np.cos(np.linspace(0,np.pi/2,fade))**2
    power=np.r_[0,np.cumsum(sound**2)];window=240
    indices=np.arange(0,count-window,48)
    rms=(power[indices+window]-power[indices])/window
    return float((indices[int(np.argmax(rms))]+window/2)/RATE)

class Pulse:
    def __init__(self, project, timing):
        self.project,self.timing=project,timing
        self.base=Flow(project,timing)
        self.film=self.base.film
        self.layouts=Layouts(project,self.film.card_size)
        self.beats=np.array(timing['beat_frames'])/60
        self.anchors=percussion_anchors(project,timing)
        self.keys=[]
        self.cues=[]
        self.widths=[]
        for i,(beat,name,v) in enumerate(SCORES[project]):
            at=self.anchors[i]['time']
            nominal_width=.20 if not self.anchors[i]['is_quarter'] else .28
            width=min(nominal_width,(at-self.cues[-1])*.90) if self.cues else 0
            self.cues.append(at);self.widths.append(width)
            self.keys.append((at,name,v))
        self.times=[k[0] for k in self.keys]
        self.sprite=lru_cache(maxsize=48)(self._sprite)
        self.photo=lru_cache(maxsize=20)(self._photo)
        self.orders={k:i for i,k in enumerate(self.layouts.assets)}
        self.orders.update(home=80,select=70,case=60,monitor=65,art0=100,art1=110,art2=120)
        # Native playback starts only when an instance appears after being absent.
        self.appearances={k:[] for k in self.layouts.assets}
        previous=set()
        for i,(at,name,v) in enumerate(self.keys):
            current={p.key for p in self.layouts.make(name,v,self.beat(at))}
            for key in current-previous:
                self.appearances[key].append(max(0,at-self.width(i)))
            previous=current

    def beat(self,time):
        # A steady travel clock avoids speed wobble from quantized audio peaks.
        # Gesture destinations still use the individually measured attacks.
        return float(time*self.timing['track']['bpm']/60)

    def width(self,index):
        if index<=0: return 0
        return self.widths[index]

    def layers(self,time):
        index=max(0,bisect_right(self.times,time)-1)
        at,name,v=self.keys[index]
        before=self.layouts.make(name,v,self.beat(time))
        if index>=len(self.keys)-1: return before
        arrival,mode,variant=self.keys[index+1]
        width=self.width(index+1)
        u=float(np.clip((time-arrival+width)/width,0,1))
        if u==0: return before
        after=self.layouts.make(mode,variant,self.beat(time))
        aa,bb={p.key:p for p in before},{p.key:p for p in after}
        result=[]
        for key in sorted(aa.keys()|bb.keys(),key=lambda k:self.orders[k]):
            a,b=aa.get(key),bb.get(key)
            # Short translations preserve the reading plane. No universal
            # edge-on turns or oscillating camera tilt between content states.
            if a is None:
                sign=-1 if b.x<960 else 1
                a=replace(b,x=b.x-sign*42,y=b.y+24,scale=b.scale*.985,
                          yaw=b.yaw+sign*4,pitch=b.pitch+1,opacity=0,lift=0)
            if b is None:
                sign=-1 if a.x<960 else 1
                b=replace(a,x=a.x+sign*46,y=a.y-18,yaw=a.yaw-sign*4,
                          scale=a.scale*.99,opacity=0,lift=0)
            # At most three phases, all finish before the shared arrival.
            rank=self.orders[key]%3
            delay=min(.24,.025*rank/width) if key not in aa else 0
            q=curve((u-delay)/(1-delay))
            values={f:getattr(a,f)+(getattr(b,f)-getattr(a,f))*q for f in FIELDS}
            if key not in aa: values['opacity']=b.opacity*q
            if key not in bb: values['opacity']=a.opacity*(1-q)
            result.append(replace(b,**values))
        return result

    def index(self,plane,time):
        asset=self.layouts.assets[plane.key]
        if asset.crop or asset.group!='home' or plane.key.startswith('w'):
            return self.base.source_index(asset,100)
        # Genuine recorded website motion, with one clock across any concurrent
        # transforms. Never restart a capture at an ordinary pose keyframe.
        starts=self.appearances[plane.key]
        start=max((s for s in starts if s<=time),default=0)
        if self.project=='nipigas':
            source_time=min(.75+max(0,time-start),3.9)
        else:
            source_time=min(.15+max(0,time-start),.15+asset.clock)
        return int(np.argmin(np.abs(np.array(self.film.captures.times['home'])-source_time)))

    def _photo(self,group,index,rect):
        card=self.film.card(self.film.captures.groups[group][index]['file'])
        return split_photo(card,CONTENT_ORIGIN,LiftSpec(rect=rect,group=group))

    def _sprite(self,key,index,holes=False,framed=False):
        asset=self.layouts.assets[key]
        file=self.film.captures.groups[asset.group][index]['file']
        viewport=self.film.captures.image(file).convert('RGBA')
        if asset.crop:
            surface=viewport.crop(asset.crop)
            radius=38 if asset.cutout else 10
        else:
            # Keep the original technical size and CONTENT_ORIGIN. Removing a
            # toolbar never moves native pixels or the coordinates of a lift.
            mask=Image.new('L',viewport.size)
            ImageDraw.Draw(mask).rounded_rectangle((0,0,viewport.width-1,viewport.height-1),radius=18,fill=255)
            viewport.putalpha(mask)
            surface=self.film.frame.copy() if framed else Image.new('RGBA',self.film.card_size)
            surface.alpha_composite(viewport,CONTENT_ORIGIN)
            radius=0
        if radius:
            mask=Image.new('L',surface.size)
            ImageDraw.Draw(mask).rounded_rectangle((0,0,surface.width-1,surface.height-1),radius=radius,fill=255)
            surface.putalpha(mask)
        # Both versions use the identical shadow construction, including lift0.
        image=Image.new('RGBA',(surface.width+110,surface.height+110))
        alpha=Image.new('L',image.size);alpha.paste(surface.getchannel('A'),(55,64))
        shadow=Image.new('RGBA',image.size)
        shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(15)).point(lambda a:round(a*.32)))
        image.alpha_composite(shadow)
        if holes:
            if asset.crop:raise ValueError('Lift coordinates require an intact native viewport')
            for rect in LIFTS[self.project]:
                ox,oy=CONTENT_ORIGIN;x0,y0,x1,y1=rect
                paper=viewport.getpixel((max(0,x0-6),max(0,y0-6)))
                surface.paste(paper,(ox+x0,oy+y0,ox+x1,oy+y1))
        image.alpha_composite(surface,(55,55))
        return image.convert('RGBa')

    def pose(self,p):
        # Perspective can magnify the near edge even with scale < 1. A smooth
        # conservative cap guarantees that no artwork is ever raster-upscaled.
        asset=self.layouts.assets[p.key]
        w,h=(asset.crop[2]-asset.crop[0],asset.crop[3]-asset.crop[1]) if asset.crop else self.film.card_size
        zmax=(w*abs(np.sin(np.radians(p.yaw)))+h*abs(np.sin(np.radians(p.pitch))))/2
        bound=p.scale/(1-zmax*p.scale/2200)**2
        scale=p.scale/max(1,bound)
        return Pose(p.x,p.y,scale,p.yaw,p.pitch,p.roll)

    def draw(self,canvas,p,time):
        if p.opacity<.0001: return
        asset=self.layouts.assets[p.key]
        native_size=(asset.crop[2]-asset.crop[0],asset.crop[3]-asset.crop[1]) if asset.crop else self.film.card_size
        size=(native_size[0]+110,native_size[1]+110)
        original,target=corners(self.pose(p),card_size=size)
        lo=np.maximum(0,np.floor(target.min(axis=0)).astype(int))
        hi=np.minimum(SIZE,np.ceil(target.max(axis=0)).astype(int))
        if np.any(hi<=lo): return
        index=self.index(p,time)
        source=self.sprite(p.key,index,p.lift>0,False)
        if p.chrome>0 and not asset.crop:
            framed=self.sprite(p.key,index,p.lift>0,True)
            source=framed if p.chrome>=1 else Image.blend(source,framed,p.chrome)
        matrix=homography(target-lo,original)
        tile=source.transform(tuple(hi-lo),Image.Transform.PERSPECTIVE,matrix.flat[:8],Image.Resampling.BICUBIC).convert('RGBA')
        if p.opacity<.99999: tile.putalpha(tile.getchannel('A').point(lambda a:round(a*p.opacity)))
        canvas.alpha_composite(tile,tuple(lo))
        if p.lift>0:
            # Native pieces lift in actual XYZ, with their source holes underneath.
            # Source resolution includes perspective stretch in the geometry check.
            for i,rect in enumerate(LIFTS[self.project]):
                amount=p.lift*(1 if i==0 else .80)
                spec=LiftSpec(rect=rect,group=asset.group,dx=(-28 if i==0 else 28),dy=-125,depth=240)
                _,photo=self.photo(asset.group,index,rect)
                src,points,ground=photo_geometry(amount,CONTENT_ORIGIN,self.film.card_size,spec)
                if p.opacity<1:
                    photo=photo.copy();photo.putalpha(photo.getchannel('A').point(lambda a:round(a*p.opacity)))
                draw_photo(canvas,photo,src,project_points(self.pose(p),points),
                           project_points(self.pose(p),ground),amount*p.opacity,homography)

    def render(self,time):
        canvas=self.film.style.background(time*.42)
        planes=sorted(self.layers(time),key=lambda p:self.orders[p.key])
        for p in planes: self.draw(canvas,p,time)
        return canvas.convert('RGB')

    def events(self,ffmpeg=None):
        kinds={'hubarch':'air','belka-production':'paper','ostankino':'switch','mmk-1':'weight','nipigas':'paper'}
        result=[]
        for i,(at,name,v) in enumerate(self.keys[1:],1):
            _,previous,prior_variant=self.keys[i-1]
            if (name,v)==(previous,prior_variant):continue
            width=self.width(i)
            kind=kinds[self.project] if name!=previous else 'soft'
            peak=effect_peak(ffmpeg,kind,width) if ffmpeg else width*.5
            # A whoosh leads into the beat, while its visible destination and
            # occasional quiet impact land directly on the measured attack.
            time=max(0,at-.03-peak)
            result.append(dict(time=time,duration=width,kind=kind,
                db=(-28 if kind=='weight' else -26) if name!=previous else -30,
                pan_from=-.32 if i%2 else .32,pan_to=.32 if i%2 else -.32,
                arrival=at,beat_attack=at,visual=name,audio_peak_time=time+peak,
                peak_measured=bool(ffmpeg),peak_target='30ms before measured percussion'))
            if name!=previous and self.anchors[i]['is_quarter']:
                duration=.09;peak=effect_peak(ffmpeg,'lock',duration) if ffmpeg else duration*.5
                start=max(0,at-peak)
                result.append(dict(time=start,duration=duration,kind='lock',db=-31,
                    arrival=at,beat_attack=at,audio_peak_time=start+peak,
                    peak_measured=bool(ffmpeg),visual='measured arrival impact'))
        return result

    def check(self):
        maximum=0;errors=[];speeds=[]
        for t in np.linspace(.5,self.timing['duration']-2.7,240):
            now={p.key:p for p in self.layers(t)}
            later={p.key:p for p in self.layers(t+1/60)}
            energetic=0
            for key,p in now.items():
                if p.opacity<.2: continue
                asset=self.layouts.assets[key]
                w,h=(asset.crop[2]-asset.crop[0],asset.crop[3]-asset.crop[1]) if asset.crop else self.film.card_size
                src,dst=corners(self.pose(p),card_size=(w,h))
                if (dst.max(axis=0)<[0,0]).any() or (dst.min(axis=0)>SIZE).any():continue
                # Conservative perspective bound covers every native texel.
                yaw,pitch=np.radians([p.yaw,p.pitch]);zmax=(w*abs(np.sin(yaw))+h*abs(np.sin(pitch)))/2
                actual_scale=self.pose(p).scale
                bound=actual_scale/(1-zmax*actual_scale/2200)**2
                maximum=max(maximum,bound)
                if bound>1.015: errors.append((round(t,3),key,round(bound,3)))
                if key in later:
                    q=later[key]
                    energetic=max(energetic,np.hypot(q.x-p.x,q.y-p.y)*60,
                                  abs(q.yaw-p.yaw)*25*60,abs(q.scale-p.scale)*w*60,abs(q.lift-p.lift)*250*60)
            speeds.append(energetic)
        continuity=[]
        for i,(at,name,v) in enumerate(self.keys[1:],1):
            for t in (at-self.width(i),at):
                a={p.key:p for p in self.layers(t-1e-7)};b={p.key:p for p in self.layers(t+1e-7)}
                for key in a.keys()|b.keys():
                    if key not in a or key not in b:
                        assert (a.get(key) or b.get(key)).opacity<.0001
                    elif max(a[key].opacity,b[key].opacity)>.0001:
                        assert max(abs(getattr(a[key],f)-getattr(b[key],f)) for f in FIELDS)<.02,(at,key)
            continuity.append(dict(arrival=at,mode=name,duration=self.width(i)))
        return dict(actions=len(self.keys)-1,distinct_modes=len(set(k[1] for k in self.keys)),
                    active_motion_fraction=float(np.mean(np.array(speeds)>70)),
                    median_screen_motion_px_sec=float(np.median(speeds)),
                    motion_density_threshold_applied=False,
                    motion_density_note='Travel fraction is descriptive; short beat gestures intentionally leave legible holds.',
                    beat_anchors=[dict(authored_beat=score[0],percussion_beat=a['beat'],
                                       arrival=a['time'],recommended=a['recommended'])
                                  for score,a in zip(SCORES[self.project],self.anchors)],
                    chrome_policy='Opening hero only; all other native viewports and detail fields are frameless.',
                    conservative_pixel_scale_bound=maximum,scale_flags=errors,
                    continuity='all key boundaries passed',keys=continuity)

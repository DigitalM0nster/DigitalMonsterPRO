"""Shared 60 fps native-card compositor used by the approved presentations."""
from bisect import bisect_right
from dataclasses import dataclass, replace
import numpy as np
from PIL import Image
from direction import SIZE, Pose, corners, homography

def smooth(u):
    u=float(np.clip(u,0,1));return u*u*u*(10+u*(-15+6*u))


@dataclass(frozen=True)
class Plane:
    key:str
    source:str
    x:float=960
    y:float=540
    scale:float=.72
    yaw:float=0
    pitch:float=0
    roll:float=0
    opacity:float=1
    framed:bool=True
    clock:float=0
    depth:float=0


class PresentationStage:
    def __init__(self, assets, chapters, duration, transfer_stage=None):
        self.assets=assets;self.chapters=chapters;self.duration=duration
        self.times=[p[0] for p in chapters];self.transfer_stage=transfer_stage

    def layers(self,t):
        i=max(0,bisect_right(self.times,t)-1)
        current=self.scene(self.chapters[i][1],t)
        if i==len(self.chapters)-1:return current
        arrival,next_name=self.chapters[i+1];width=1.35
        if t<arrival-width:return current
        a={p.key:p for p in current};b={p.key:p for p in self.scene(next_name,t)}
        result=[];u=(t-arrival+width)/width
        for n,key in enumerate(dict.fromkeys([*a,*b])):
            old,new=a.get(key),b.get(key)
            if old and new and old.source!=new.source:
                # The middle phone changes inside a stable frame by native horizontal UI travel.
                if new.source=='mobile-flow':
                    result.append(replace(new,clock=0));continue
                raise AssertionError((key,old.source,new.source))
            lag=(n%3)*.055
            q=smooth((u-lag)/(1-lag))
            if not old:
                sign=1 if new.x>=960 else -1
                if key.startswith('wall'):
                    old=replace(new,y=new.y+35,scale=new.scale*.97,opacity=0)
                else:
                    radius=(220 if new.source.startswith('mobile') else 1060)*new.scale
                    edge=1920+radius+120 if sign>0 else -radius-120
                    old=replace(new,x=edge,y=new.y+64,scale=new.scale*.90,yaw=new.yaw+sign*4)
            if not new:
                sign=1 if old.x>=960 else -1
                if key.startswith('wall'):
                    new=replace(old,y=old.y-35,scale=old.scale*.97,opacity=0)
                else:
                    radius=(220 if old.source.startswith('mobile') else 1060)*old.scale
                    edge=1920+radius+120 if sign>0 else -radius-120
                    new=replace(old,x=edge,y=old.y-64,scale=old.scale*.90)
            values={f:getattr(old,f)+(getattr(new,f)-getattr(old,f))*q
                    for f in ('x','y','scale','yaw','pitch','roll','opacity','depth')}
            # Separate the two cards before the depth ordering changes.
            if next_name==self.transfer_stage and key in ('home','rent'):
                values['y']+=(-390 if key=='rent' else 240)*np.sin(np.pi*q)**2
            result.append(replace(new,**values))
        return result

    def draw(self,canvas,plane,neighbours=None):
        if plane.opacity<.0001:return
        if plane.source=='mobile-flow':
            image,size=self.assets.mobile_slide(plane.clock)
        else:
            image,size=self.assets.image(plane.source,plane.clock,plane.framed)
        w,h=size;z=(w*abs(np.sin(np.radians(plane.yaw)))+h*abs(np.sin(np.radians(plane.pitch))))/2
        bound=plane.scale/(1-z*plane.scale/2200)**2
        scale=plane.scale/max(1,bound)
        poses=[plane]
        if neighbours and np.hypot(neighbours[1].x-neighbours[0].x,neighbours[1].y-neighbours[0].y)>3:
            poses=[neighbours[0],plane,neighbours[1]]
        targets=[]
        for sample in poses:
            relative=sample.scale/plane.scale
            pose=Pose(sample.x,sample.y,scale*relative,sample.yaw,sample.pitch,sample.roll)
            source,target=corners(pose,card_size=image.size);targets.append(target)
        combined=np.concatenate(targets)
        lo=np.maximum((0,0),np.floor(combined.min(axis=0)-1).astype(int))
        hi=np.minimum(SIZE,np.ceil(combined.max(axis=0)+1).astype(int))
        if np.any(hi<=lo):return
        mip=1
        threshold=.75 if getattr(self,'antialias_fields',False) and plane.key.startswith(('wall-','rail-')) else .41
        if scale<threshold:
            image=image.resize((round(image.width*.5),round(image.height*.5)),Image.Resampling.LANCZOS)
            mip=.5
        matrix=homography(targets[len(targets)//2]-lo,source);matrix[:2]*=mip
        raster=image.transform(tuple(hi-lo),Image.Transform.PERSPECTIVE,matrix.flat[:8],Image.Resampling.BICUBIC)
        if len(targets)>1:
            # Dense short-shutter translation blur, not separated ghost copies.
            span=np.array([neighbours[1].x-neighbours[0].x,neighbours[1].y-neighbours[0].y])*.5
            count=min(25,max(3,int(np.linalg.norm(span))+1))
            raw=np.asarray(raster);acc=np.zeros_like(raw,dtype=np.uint32);height,width=raw.shape[:2]
            for u in np.linspace(-.5,.5,count):
                dx,dy=np.rint(span*u).astype(int)
                xa,xb=max(0,dx),min(width,width+dx);ya,yb=max(0,dy),min(height,height+dy)
                if xb>xa and yb>ya:
                    acc[ya:yb,xa:xb]+=raw[ya-dy:yb-dy,xa-dx:xb-dx]
            pixels=(acc/count).astype('uint8')
            im=Image.frombytes('RGBa',raster.size,pixels.tobytes()).convert('RGBA')
        else:im=raster.convert('RGBA')
        if plane.opacity<.99999:im.putalpha(im.getchannel('A').point(lambda a:round(a*plane.opacity)))
        canvas.alpha_composite(im,tuple(lo))

    def render(self,t):
        canvas=self.assets.style.background(t*.64)
        before={p.key:p for p in self.layers(t-1/240)}
        after={p.key:p for p in self.layers(t+1/240)}
        for plane in sorted(self.layers(t),key=lambda p:p.depth):
            neighbours=(before.get(plane.key,plane),after.get(plane.key,plane))
            self.draw(canvas,plane,neighbours)
        fade=smooth(t/.28)*smooth((self.duration-.6-t)/2)
        im=canvas.convert('RGB')
        return Image.blend(Image.new('RGB',SIZE),im,fade) if fade<1 else im


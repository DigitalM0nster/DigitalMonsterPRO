"""Quiet presentations for the two travel projects, using genuine responsive captures."""
import argparse
from functools import lru_cache
from dataclasses import replace
import numpy as np
from PIL import Image
from projectPresentations import ProjectPresentation, SCORES, p
from presentationStage import PresentationStage, smooth
from presentationStyle import PresentationAssets
from digitalMonsterStyle import DigitalMonsterStyle
from showreel import ROOT

SCORES.update({
 'globtravlink':(44,[(0,'hero'),(4,'destinations'),(8,'collection'),(12,'cruise'),(17,'responsive'),
                        (21,'mobile'),(25,'journey'),(29,'gallery'),(34,'overview'),(39,'finale'),(42,'resolve')]),
 'universe-travel':(42,[(0,'hero'),(4,'orbit'),(8,'company'),(12,'ecosystem'),(16,'project'),
                         (21,'responsive'),(25,'mobile'),(29,'mobile-orbit'),(33,'architecture'),(37,'finale'),(40,'resolve')]),
})

class TravelAssets:
 def __init__(self,project):
  self.project=project;self.folder=ROOT/'output/showreels'/project/'sources/presentation-v6'
  self.style=DigitalMonsterStyle((1920,1080),(1312,800),16,project)
 @lru_cache(maxsize=32)
 def raw(self,name):return Image.open(self.folder/(name+'.png')).convert('RGBA')
 @lru_cache(maxsize=32)
 def native(self,name):
  if name.startswith('mobile'):
   im=self.raw(name);return im.crop((0,0,im.width-15,im.height-(72 if self.project=='universe-travel' else 0)))
  if self.project=='globtravlink':
   if name.startswith('destination'):
    i=int(name[-1]);x=[122,406,690,973][i];return self.raw('categories').crop((x,188,x+270,473))
   if name=='ship':return self.raw('case').crop((95,144,926,612))
   if name=='cruise-info':return self.raw('case').crop((960,146,1316,754))
   if name=='categories':return self.raw(name).crop((86,77,1324,538))
   im=self.raw(name);return im.crop((0,0,im.width-15,im.height))
  crops={'home':(70,140,1340,790),'select':(150,204,1261,734),'case':(91,108,1320,874),
         'about':(85,230,1325,830),'orbit':(760,169,1320,760),
         'model':(885,251,1320,817),'account':(473,262,938,422)}
  original={'orbit':'home','model':'about','account':'select'}.get(name,name)
  return self.raw(original).crop(crops[name])
 @lru_cache(maxsize=48)
 def image(self,name,clock=0,framed=True):return PresentationAssets.surround(self.native(name),framed)

class TravelPresentation(ProjectPresentation):
 def __init__(self,project):
  self.project=project;duration,chapters=SCORES[project]
  PresentationStage.__init__(self,TravelAssets(project),chapters,duration)
  self.antialias_fields=True;self.out=ROOT/'output/showreels'/project/'presentation-v6'
  self.parts=(0,11,22,33,duration)
 def globtravlink(self,name,t):
  home=p('home',x=960,y=538,scale=.85,yaw=-1,depth=6)
  if name=='hero':return [replace(home,y=556-18*smooth(t/1.4),opacity=smooth(t/.7))]
  if name=='destinations':return [p('select',x=1045,y=523,scale=.76,yaw=-2,depth=8),
    p('home',x=395,y=343,scale=.32,yaw=4,depth=2)]
  if name=='collection':
   u=smooth((t-8.25)/1.6)
   return [p('categories',x=960,y=340,scale=.92,depth=4)]+[
    p(f'destination{i}',x=465+i*330,y=733+(-1 if i%2 else 1)*22*u,
      scale=.97,roll=(i-1.5)*1.6*u,framed=False,depth=10+i) for i in range(4)]
  if name=='cruise':return [p('case',x=967,y=527,scale=.82,yaw=1,depth=8)]
  if name=='responsive':return [p('case',x=756,y=516,scale=.66,yaw=3,depth=5),
    p('phone-case','mobile-case',x=1500,y=540,scale=.98,yaw=-2,depth=12)]
  if name=='mobile':return self.phones()
  if name=='journey':return [p('phone-projects','mobile-projects',x=484,y=540,scale=.98,depth=12),
    p('ship',x=1200,y=354,scale=.93,yaw=-1,framed=False,depth=4),
    p('destination0',x=1005,y=793,scale=.85,framed=False,depth=8),
    p('destination1',x=1330,y=789,scale=.85,framed=False,depth=9)]
  if name=='gallery':
   out=[p('ship',x=632,y=534,scale=.93,yaw=2,framed=False,depth=4),
        p('cruise-info',x=1454,y=533,scale=.95,yaw=-2,framed=False,depth=9)]
   return out
  if name=='overview':
   # Two measured horizontal strips move in opposite directions.
   out=[]
   for row in range(2):
    for col in range(-1,4):
     out.append(p(f'wall-{row}-{col}', ['home','select','case'][(row+col)%3],
       x=400+col*765+(t-34)*45*(1 if row==0 else -1),y=290+row*505,
       scale=.49,roll=0,depth=row))
   return out
  if name=='finale':return [replace(home,x=855,y=514,scale=.73,yaw=0),
    p('phone-home','mobile-home',x=1515,y=559,scale=.91,depth=12)]
  if name=='resolve':return [replace(home,yaw=0)]
  raise ValueError(name)
 def universe_travel(self,name,t):
  home=p('home',x=960,y=540,scale=.94,yaw=-1,depth=6)
  if name=='hero':return [replace(home,y=557-17*smooth(t/1.35),opacity=smooth(t/.7))]
  if name=='orbit':
   u=smooth((t-4.3)/1.5)
   return [replace(home,x=726,y=460,scale=.61,yaw=3,depth=2),
     p('orbit',x=1372-18*u,y=584-27*u,scale=.95,yaw=-3+u,framed=False,depth=10)]
  if name=='company':return [p('about',x=960,y=540,scale=.96,yaw=0,depth=6)]
  if name=='ecosystem':return [p('select',x=960,y=547,scale=.99,yaw=0,depth=8)]
  if name=='project':return [p('case',x=958,y=539,scale=.90,yaw=-1,depth=8)]
  if name=='responsive':return [replace(home,x=750,y=505,scale=.72,yaw=2),
    p('phone-home','mobile-home',x=1480,y=536,scale=.98,yaw=-2,depth=13)]
  if name=='mobile':return self.phones(('home','orbit','projects'))
  if name=='mobile-orbit':return [p('phone-orbit','mobile-orbit',x=566,y=537,scale=.98,depth=13),
    p('phone-case','mobile-case',x=1135,y=537,scale=.98,depth=12),
    p('model',x=1635,y=500,scale=.68,yaw=-3,framed=False,depth=4)]
  if name=='architecture':return [p('select',x=705,y=420,scale=.81,yaw=2,depth=4),
    p('model',x=1515,y=643,scale=.96,yaw=-2,framed=False,depth=8),
    p('account',x=784,y=785,scale=.95,framed=False,depth=10)]
  if name=='finale':return [replace(home,x=853,y=509,scale=.84,yaw=0),
    p('phone-orbit','mobile-orbit',x=1532,y=550,scale=.94,depth=12)]
  if name=='resolve':return [replace(home,yaw=0)]
  raise ValueError(name)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--project',required=True,choices=['globtravlink','universe-travel'])
 ap.add_argument('--ffmpeg',default='ffmpeg');ap.add_argument('--part',type=int,choices=range(4))
 ap.add_argument('--inspect',action='store_true');ap.add_argument('--assemble',action='store_true');ap.add_argument('--all',action='store_true')
 args=ap.parse_args();film=TravelPresentation(args.project)
 if args.inspect:film.inspect()
 if args.part is not None:film.render_part(args.ffmpeg,args.part)
 if args.all:
  for part in range(4):film.render_part(args.ffmpeg,part)
 if args.assemble or args.all:film.assemble(args.ffmpeg)

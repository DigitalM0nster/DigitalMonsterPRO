"""Quiet, project-specific presentations in the approved Digital Monster staging."""
import argparse
import json
import subprocess
from bisect import bisect_right
from dataclasses import replace
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from presentationStage import PresentationStage, Plane, smooth
from projectPresentationAssets import ProjectAssets
from presentationAudio import make_audio
from portfolioStory import check_ending
from showreel import ROOT

SCORES={
 'hubarch':(44,[(0,'hero'),(4,'overview'),(7.5,'school'),(11,'lift'),(15,'project'),
               (19,'gallery'),(23,'responsive'),(27,'mobile'),(31,'details'),(34.5,'field'),(38.5,'finale'),(42,'resolve')]),
 'mmk-1':(40,[(0,'hero'),(4,'equipment'),(7.5,'catalogue'),(11,'specifications'),(15,'company'),
             (19,'responsive'),(23,'mobile'),(27,'mobile-catalogue'),(31,'rail'),(35,'finale'),(38,'resolve')]),
 'belka-production':(42,[(0,'hero'),(4,'overview'),(7.5,'gallery'),(11,'lift'),(15,'identity'),
                       (18.5,'case'),(22,'responsive'),(26,'mobile'),(30,'cascade'),(34,'artwork'),(37.5,'finale'),(40,'resolve')]),
 'nipigas':(44,[(0,'hero'),(4,'calendar'),(8,'dates'),(12,'chronology'),(16,'archive'),
              (20,'responsive'),(24,'mobile'),(28,'reading'),(32,'collection'),(37,'finale'),(42,'resolve')]),
}


def p(key,source=None,**kw):return Plane(key,source or key,**kw)


class ProjectPresentation(PresentationStage):
    def __init__(self,project):
        self.project=project;duration,chapters=SCORES[project]
        super().__init__(ProjectAssets(project),chapters,duration)
        self.antialias_fields=True
        self.out=ROOT/'output/showreels'/project/'presentation-v6'
        self.parts=(0,11,22,33,duration) if duration>40 else (0,10,20,30,40)

    def phones(self,keys=('home','projects','case')):
        return [p('phone-'+k,'mobile-'+k,x=455+i*505,y=545-(i==1)*13,
                  scale=.94 if i!=1 else .98,yaw=3-i*3,depth=12+i) for i,k in enumerate(keys)]

    def field(self,t,start,tilt=-6,cascade=False):
        # One rigid row coordinate system; equal gaps and counter-moving rows.
        result=[];a=np.radians(tilt);c,s=np.cos(a),np.sin(a)
        for row in range(3):
            for col in range(-2,4):
                travel=(t-start)*(78 if not cascade else 60)*(1 if row!=1 else -1)
                x=col*710+travel;y=(row-1)*445
                source=['home','select','case'][(col+row)%3]
                result.append(p(f'wall-{row}-{col}',source,x=960+x*c-y*s,y=540+x*s+y*c,
                                scale=.49,roll=tilt,depth=row))
        return result

    def scene(self,name,t):
        return getattr(self,self.project.replace('-','_'))(name,t)

    def layers(self,t):
        i=max(0,bisect_right(self.times,t)-1)
        if i+1<len(self.chapters) and self.chapters[i+1][1]=='lift':
            # The split artwork starts on the same native pixels as the full page.
            # No generic entrance travel between the attached and separated states.
            return self.scene(self.chapters[i][1],t)
        return super().layers(t)

    def hubarch(self,name,t):
        drift=4*np.sin(t*.19)
        home=p('home',x=965+drift,y=539,scale=.91,yaw=-2,pitch=1,depth=8)
        school=p('school',x=960,y=540,scale=.84,depth=10)
        if name=='hero':return [replace(home,y=557-18*smooth(t/1.3),opacity=smooth(t/.7))]
        if name=='overview':return [replace(home,x=1060,y=515,scale=.72),
            p('school',x=376,y=336,scale=.43,yaw=5,depth=3),p('case',x=1558,y=747,scale=.41,yaw=-4,depth=2)]
        if name=='school':return [school]
        if name=='lift':
            u=smooth((t-11.3)/1.45)
            return [p('lift-base','school-base',x=960-155*u,y=540+48*u,scale=.84-.15*u,depth=2),
                    p('lift-photo','school-photo',x=960+.5*.84+270*u,y=540+.5*.84-90*u,
                      scale=.84+.11*u,yaw=-3*u,pitch=2*u,framed=False,depth=12)]
        if name=='project':return [p('case',x=966+drift,y=527,scale=.88,yaw=2,depth=10),
            p('lift-photo','school-photo',x=425,y=848,scale=.43,yaw=3,framed=False,depth=12)]
        if name=='gallery':return [p('gallery','gallery-slide',x=958,y=537,scale=.87,
                                            clock=smooth((t-19.6)/1.5),depth=9)]
        if name=='responsive':return [replace(home,x=752,y=504,scale=.72,yaw=3),
                                     p('phone-home','mobile-home',x=1485,y=535,scale=.96,yaw=-2,depth=12)]
        if name=='mobile':return self.phones()
        if name=='details':return [p('photo1','school-photo',x=550,y=377,scale=.98,yaw=2,framed=False,depth=6),
            p('photo2','building-photo',x=1350,y=698,scale=.98,yaw=-2,framed=False,depth=5),
            p('filter',x=1400,y=260,scale=.83,depth=8)]
        if name=='field':return self.field(t,34.5)
        if name=='finale':return [replace(home,x=905,y=505,scale=.83,yaw=0),
             p('phone-home','mobile-home',x=1570,y=638,scale=.73,yaw=-3,depth=12),
             p('photo1','school-photo',x=338,y=852,scale=.43,yaw=3,framed=False,depth=11)]
        if name=='resolve':return [replace(home,yaw=0,pitch=0,scale=.88)]
        raise ValueError(name)

    def mmk_1(self,name,t):
        home=p('home',x=960+4*np.sin(t*.2),y=540,scale=.90,yaw=2,depth=8)
        if name=='hero':return [replace(home,y=558-18*smooth(t/1.3),opacity=smooth(t/.7))]
        if name=='equipment':return [replace(home,x=754,y=476,scale=.69),
            p('crane',x=1510,y=571,scale=.95,yaw=-3,framed=False,depth=12)]
        if name=='catalogue':return [p('select',x=962,y=536,scale=.91,depth=8)]
        if name=='specifications':return [p('specification',x=1310,y=550,scale=.98,depth=12),
            p('machine1',x=530,y=376,scale=.98,framed=False,depth=7),
            p('machine2',x=627,y=711,scale=.98,framed=False,depth=8)]
        if name=='company':return [p('case',x=960,y=535,scale=.91,yaw=-2,depth=8)]
        if name=='responsive':return [replace(home,x=757,y=505,scale=.71,yaw=3),
            p('phone-home','mobile-home',x=1480,y=535,scale=.97,yaw=-3,depth=12)]
        if name=='mobile':return self.phones()
        if name=='mobile-catalogue':return [p('phone-menu','mobile-menu',x=470,y=530,scale=.94,yaw=2,depth=12),
            p('phone-projects','mobile-projects',x=1050,y=530,scale=.98,depth=13),
            p('machine1',x=1585,y=338,scale=.72,framed=False,depth=7),
            p('machine2',x=1585,y=739,scale=.72,framed=False,depth=8)]
        if name=='rail':
            move=(t-31)*65
            return [p('rail-'+str(i),['home','select','case'][i%3],x=350+i*750-move,y=540,
                      scale=.51,yaw=-2,depth=i) for i in range(-1,4)]
        if name=='finale':return [replace(home,x=840,y=490,scale=.79,yaw=0),
             p('phone-projects','mobile-projects',x=1510,y=579,scale=.85,yaw=-2,depth=13)]
        if name=='resolve':return [replace(home,yaw=0,scale=.87)]
        raise ValueError(name)

    def belka_production(self,name,t):
        home=p('home',x=960+4*np.sin(t*.17),y=540,scale=.91,yaw=-2,depth=8)
        if name=='hero':return [replace(home,y=558-18*smooth(t/1.3),opacity=smooth(t/.7))]
        if name=='overview':return [replace(home,x=915,y=452,scale=.72),
            p('select',x=1420,y=749,scale=.43,yaw=-3,depth=2),
            p('case',x=420,y=767,scale=.41,yaw=3,depth=3)]
        if name=='gallery':return [p('select',x=960,y=537,scale=.87,depth=8)]
        if name=='lift':
            u=smooth((t-11.25)/1.35);scale=.87
            return [p('gallery-base',x=960,y=537,scale=scale*(1-.08*u),opacity=1-u,depth=1),
              p('art0',x=(960+(918.5-640)*scale)*(1-u)+1380*u,y=(537+(456.5-360)*scale)*(1-u)+575*u,
                scale=scale+.09*u,yaw=-3*u,framed=False,depth=12),
              p('art1',x=(960+(321.5-640)*scale)*(1-u)+550*u,y=(537+(459.5-360)*scale)*(1-u)+415*u,
                scale=scale+.09*u,yaw=3*u,framed=False,depth=11)]
        if name=='identity':return [p('mascot',x=935,y=518,scale=.94,framed=False,depth=8),
             p('flower',x=465,y=405,scale=.92,roll=-10+2*(t-15),framed=False,depth=5),
             p('nut',x=1440,y=671,scale=.92,roll=6,framed=False,depth=6),
             p('filters',x=963,y=912,scale=.92,framed=False,depth=9)]
        if name=='case':return [p('case',x=966,y=538,scale=.92,yaw=2,depth=10)]
        if name=='responsive':return [replace(home,x=750,y=508,scale=.72,yaw=3),
            p('phone-home','mobile-home',x=1485,y=536,scale=.98,yaw=-2,depth=12)]
        if name=='mobile':return self.phones()
        if name=='cascade':return self.field(t,30,tilt=5,cascade=True)
        if name=='artwork':return [p('art0',x=1270,y=413,scale=.97,yaw=-2,framed=False,depth=6),
            p('art1',x=542,y=685,scale=.97,yaw=2,framed=False,depth=5),
            p('flower',x=460,y=258,scale=.65,framed=False,depth=8),
            p('nut',x=1480,y=853,scale=.60,framed=False,depth=9)]
        if name=='finale':return [replace(home,x=890,y=477,scale=.81,yaw=0),
            p('phone-projects','mobile-projects',x=1550,y=583,scale=.85,depth=13),
            p('mascot',x=350,y=800,scale=.51,framed=False,depth=12)]
        if name=='resolve':return [replace(home,yaw=0,scale=.88)]
        raise ValueError(name)

    def nipigas(self,name,t):
        home=p('home',x=960+4*np.sin(t*.17),y=538,scale=.95,yaw=-1,depth=8)
        if name=='hero':return [replace(home,y=556-18*smooth(t/1.3),opacity=smooth(t/.7))]
        if name in ('calendar','dates'):
            u=smooth((t-8.35)/1.45) if name=='dates' else 0
            # Native transparent date cards turn and travel independently in depth.
            return [p('date'+str(i),'card'+str(i+1),x=470+i*480-40*u,
                      y=566+(i-1)*-38*(1-u),scale=.77+(i==1)*.05,
                      yaw=(i-1)*(5-3*u),roll=(i-1)*(-3+2*u),framed=False,depth=4+i)
                    for i in range(3)]+[p('bird',x=1580,y=185,scale=.83,framed=False,depth=10)]
        if name=='chronology':return [p('date0','card1',x=360,y=481,scale=.67,yaw=3,framed=False,depth=3),
             p('date3','card4',x=790,y=559,scale=.76,framed=False,depth=4),
             p('date8','card9',x=1375,y=503,scale=.90,yaw=-3,framed=False,depth=5)]
        if name=='archive':return [p('archive',x=960,y=538,scale=.95,yaw=2,depth=8)]
        if name=='responsive':return [replace(home,x=760,y=515,scale=.73,yaw=3),
             p('phone-home','mobile-home',x=1478,y=535,scale=.98,yaw=-2,depth=12)]
        if name=='mobile':return self.phones()
        if name=='reading':return [p('phone-story','mobile-story',x=544,y=535,scale=.98,yaw=2,depth=12),
             p('phone-case','mobile-case',x=1150,y=535,scale=.98,yaw=-2,depth=13),
             p('date1','card2',x=1650,y=537,scale=.53,yaw=-4,framed=False,depth=8)]
        if name=='collection':
            a=np.radians(-6);c,s=np.cos(a),np.sin(a);out=[]
            for row in range(2):
                for col in range(-1,5):
                    x=(col-1.5)*450+(t-32)*55*(1 if row==0 else -1);y=(row-.5)*556
                    out.append(p(f'wall-{row}-{col}','card'+str((col+row*4)%9+1),
                        x=960+x*c-y*s,y=540+x*s+y*c,scale=.66,roll=-6,framed=False,depth=row))
            return out
        if name=='finale':return [replace(home,x=843,y=513,scale=.80,yaw=0),
             p('phone-home','mobile-home',x=1547,y=570,scale=.84,depth=12),
             p('date8','card9',x=335,y=779,scale=.43,roll=-3,framed=False,depth=11)]
        if name=='resolve':return [replace(home,yaw=0,scale=.92)]
        raise ValueError(name)

    def gestures(self):
        variant=list(SCORES).index(self.project)
        events=[(.18,.85,0,'soft',-33)]
        for i,(arrival,name) in enumerate(self.chapters[1:]):
            events.extend([(arrival-1.30,1.30,(-.25 if (i+variant)%2 else .25),'air',-28),
                           (arrival-.04,.10,0,'lock',-37)])
            if name in ('lift','dates','gallery','identity'):
                events.append((arrival+.3,1.35,.2,'paper',-29))
        return events

    def inspect(self):
        self.out.mkdir(parents=True,exist_ok=True);maximum=0
        for t in np.linspace(0,self.duration,160):
            for plane in self.layers(t):
                if plane.opacity<.05:continue
                _,(w,h)=self.assets.image(plane.source,plane.clock,plane.framed)
                z=(w*abs(np.sin(np.radians(plane.yaw)))+h*abs(np.sin(np.radians(plane.pitch))))/2
                bound=plane.scale/(1-z*plane.scale/2200)**2;s=plane.scale/max(1,bound)
                maximum=max(maximum,s/(1-z*s/2200)**2)
        times=[start+.8 for start,_ in self.chapters[:-1]]+[self.duration-1.7]
        rows=(len(times)+3)//4;board=Image.new('RGB',(1600,rows*253),'#111923');d=ImageDraw.Draw(board)
        for i,t in enumerate(times):
            frame=self.render(t);frame.save(self.out/f'frame-{i:02d}.jpg',quality=94)
            board.paste(frame.resize((400,225),Image.Resampling.LANCZOS),(i%4*400,i//4*253))
            d.text((i%4*400+8,i//4*253+231),f'{t:.1f}s {self.project}',fill='white')
        board.save(self.out/'storyboard.jpg',quality=94)
        report={'project':self.project,'duration':self.duration,'fps':60,'chapters':self.chapters,
          'max_source_scale':maximum,'external_hud':False,'mobile':'Real native 430x932 responsive viewport captures',
          'motion':'Prepared native artwork; every composition calculated at export time, 60 fps'}
        assert maximum<=1.0001,maximum
        (self.out/'visual-check.json').write_text(json.dumps(report,indent=2),'utf-8')
        print(json.dumps(report),flush=True)

    def render_part(self,ffmpeg,part):
        self.out.mkdir(parents=True,exist_ok=True);start,stop=self.parts[part:part+2]
        output=self.out/f'part-{part}.mp4'
        process=subprocess.Popen([ffmpeg,'-y','-v','error','-f','rawvideo','-pix_fmt','rgb24',
            '-s','1920x1080','-r','60','-i','pipe:0','-an','-c:v','libx264','-preset','medium',
            '-crf','17','-pix_fmt','yuv420p','-threads','2',str(output)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            for frame in range(start*60,stop*60):
                process.stdin.write(self.render(frame/60).tobytes())
                if (frame-start*60+1)%180==0:print(f'{self.project} part {part}: {frame-start*60+1}/{(stop-start)*60}',flush=True)
            process.stdin.close();error=process.stderr.read().decode(errors='replace')
            if process.wait():raise RuntimeError(error)
        except BaseException:process.kill();process.wait();raise
        print(f'PART COMPLETE {self.project} {part}',flush=True)

    def assemble(self,ffmpeg):
        variant=list(SCORES).index(self.project)+1
        audio=make_audio(ffmpeg,self.out,self.duration,self.gestures(),variant=variant)
        concat=self.out/'parts.txt';concat.write_text(''.join(f"file 'part-{i}.mp4'\n" for i in range(4)),'utf-8')
        output=self.out/f'{self.project}-presentation-v6.mp4'
        subprocess.run([ffmpeg,'-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-i',str(audio),
            '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','256k','-t',str(self.duration),
            '-movflags','+faststart',str(output)],check=True)
        decoded=subprocess.run([ffmpeg,'-v','error','-i',str(output),'-map','0:v','-map','0:a',
            '-f','null','-','-progress','pipe:1','-nostats'],capture_output=True,text=True,check=True)
        frames=[int(line.split('=')[1]) for line in decoded.stdout.splitlines() if line.startswith('frame=')][-1]
        assert frames==self.duration*60,frames
        report={'frames':frames,'duration':self.duration,'decode':'passed','ending':check_ending(ffmpeg,output)}
        (self.out/'export-check.json').write_text(json.dumps(report,indent=2),'utf-8')
        print(f'COMPLETE {output}',flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--project',required=True,choices=SCORES)
    ap.add_argument('--ffmpeg',default='ffmpeg');ap.add_argument('--part',type=int,choices=range(4))
    ap.add_argument('--inspect',action='store_true');ap.add_argument('--assemble',action='store_true')
    args=ap.parse_args();film=ProjectPresentation(args.project)
    if args.inspect:film.inspect()
    if args.part is not None:film.render_part(args.ffmpeg,args.part)
    if args.assemble:film.assemble(args.ffmpeg)

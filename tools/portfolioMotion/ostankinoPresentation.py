"""A 46-second Ostankino presentation: prepared artwork, continuous 60 fps staging."""
import argparse
from dataclasses import replace
import json
import subprocess
import numpy as np
from PIL import Image, ImageDraw
from direction import SIZE
from presentationStage import PresentationStage, Plane, smooth
from presentationStyle import PresentationAssets
from presentationAudio import make_audio
from ostankinoShots import BASE
from portfolioStory import check_ending

FPS=60
DURATION=46
OUT=BASE/'presentation-v6'
PARTS=(0,12,24,36,46)
CHAPTERS=[(0,'identity'),(3.6,'overview'),(6.5,'rental'),(10.3,'floor'),
          (13.8,'exploded'),(17.4,'plans'),(21.2,'room'),(25.2,'responsive'),
          (29.2,'mobile'),(33.0,'mobile-detail'),(36.4,'field'),(40.2,'finale'),(44,'resolve')]


class Presentation(PresentationStage):
    def __init__(self):
        super().__init__(PresentationAssets(), CHAPTERS, DURATION, transfer_stage="rental")

    def scene(self,name,t):
        def p(key,source=None,**kw):return Plane(key,source or key,**kw)
        # Restrained continuous parallax, with no repeated rocking or stop/start orbit.
        drift=np.sin(t*.17)*5
        word=p('word','word-white',x=960,y=142,scale=.84,framed=False,depth=20)
        building=p('building',x=785,y=602,scale=.66,yaw=-2,framed=False,depth=5)
        home=p('home',x=990,y=554,scale=.84,yaw=-3,pitch=2,depth=9)
        rental=p('rent',x=433,y=365,scale=.38,yaw=8,roll=-1,depth=2)
        service=p('service','desktop-services-transition',x=1540,y=647,scale=.34,yaw=-8,roll=1,clock=2.5,depth=1)
        if name=='identity':
            u=smooth(t/1.2)
            return [replace(word,y=185-43*u,opacity=smooth(t/.4)),
                    replace(building,y=635-33*u,opacity=smooth((t-.18)/.8)),
                    p('floor-card',x=1490,y=425,scale=.83,framed=False,opacity=smooth((t-.75)/.85),depth=8)]
        if name=='overview':
            return [replace(home,x=1000+drift),rental,service]
        if name=='rental':
            return [replace(rental,x=1025+drift,y=557,scale=.78,yaw=-2,pitch=1,roll=0,depth=10),
                    replace(home,x=290,y=253,scale=.31,yaw=9,pitch=1,depth=1),
                    replace(service,x=1670,y=275,scale=.22,yaw=-10,depth=0)]
        if name=='floor':
            # A sharp settled cutaway, plus its actual native selector lifted into space.
            layers=[p('floor','floor11',x=942+drift,y=556,scale=.76,yaw=2,pitch=1,clock=1.6,depth=5)]
            for i in range(13):
                u=smooth((t-9.9-i*.025)/.48)
                layers.append(p(f'button{i}',f'floor-button-{i+1}',x=558+i*64,y=972-10*u,
                                scale=.89,opacity=u,framed=False,depth=10))
            return layers
        if name=='exploded':
            return [replace(word,y=125,scale=.71),replace(building,x=730,y=590,scale=.65),
                    p('floor-card',x=1440,y=410,scale=.97,yaw=-3,framed=False,depth=8),
                    p('slider',x=1440,y=691,scale=.90,framed=False,depth=10),
                    p('cta',x=1450,y=838,scale=.95,framed=False,depth=10)]
        if name=='plans':
            # The catalogue is first readable as a whole, then individual cards separate.
            u=smooth((t-18.3)/1.25)
            layers=[p('catalogue','catalogue-underlay',x=960,y=522,scale=.70*(1-.10*u),opacity=1-u,depth=0)]
            for i in range(4):
                x0=960+(-678+i*451)*.70
                layers.append(p(f'plan{i}',x=x0*(1-u)+(285+i*448)*u,
                                y=446*(1-u)+(540+(-16 if i%2 else 16))*u,
                                scale=.70+.22*u,yaw=(-3 if i<2 else 3)*u,
                                roll=(-.6 if i<2 else .6)*u,opacity=1,framed=False,depth=5+i))
            return layers
        if name=='room':
            # Exact source-frame clock: no 15-30 fps screenshot playback or half-frame ties.
            index=int(np.clip(round((t-21.75)*60),0,81))
            return [p('room','room-smooth',x=960+drift,y=540,scale=.80,clock=.34+index/60,depth=10)]
        if name=='responsive':
            return [p('rent',x=745,y=507,scale=.57,yaw=5,pitch=1,depth=2),
                    p('phone-home','mobile-home',x=1455,y=540,scale=.98,yaw=-3,depth=8)]
        if name=='mobile':
            return [p('phone-home','mobile-home',x=460,y=544,scale=.94,yaw=3,depth=3),
                    p('phone-list','mobile-list',x=960,y=528,scale=.98,depth=6),
                    p('phone-room','mobile-room',x=1460,y=544,scale=.94,yaw=-3,depth=4)]
        if name=='mobile-detail':
            return [p('phone-menu','mobile-menu',x=461,y=544,scale=.94,yaw=3,depth=3),
                    p('phone-list','mobile-flow',x=960,y=528,scale=.98,clock=smooth((t-33.55)/.82),depth=6),
                    p('phone-catalogue','mobile-list',x=1460,y=544,scale=.94,yaw=-3,depth=4)]
        if name=='field':
            layers=[]; tilt=np.radians(-7);c,s=np.cos(tilt),np.sin(tilt)
            names=['rent','floor11','catalogue','desktop-services-transition','room-smooth','rent']
            for row in range(3):
                travel=(t-36.4)*94*(1 if row!=1 else -1)
                for col in range(-2,4):
                    x=(col-.5)*718+travel;y=(row-1)*426
                    source=names[(row*2+col)%len(names)]
                    clock=1.69 if source=='room-smooth' else 2.5
                    layers.append(p(f'wall{row}-{col}',source,x=960+x*c-y*s,y=540+x*s+y*c,
                                    scale=.35,roll=-7,clock=clock,depth=row*.1))
            return layers
        if name=='finale':
            return [replace(word,y=130,scale=.78),replace(building,x=920,y=596,scale=.64),
                    p('floor-card',x=350,y=385,scale=.72,yaw=3,framed=False,depth=8),
                    p('phone-menu','mobile-menu',x=1570,y=603,scale=.82,yaw=-3,depth=12)]
        if name=='resolve':
            return [replace(word,y=490,scale=.89),replace(building,x=880,y=650,scale=.53,opacity=.14)]
        raise ValueError(name)

    def gestures(self):
        events=[(.2,.9,-.2,'soft',-32),(.75,.65,.4,'paper',-34)]
        for i,(arrival,_) in enumerate(CHAPTERS[1:]):
            # Whoosh crests during travel; a quiet tactile settle finishes the move.
            events.extend([(arrival-1.30,1.30,(-.25 if i%2 else .25),'air',-27),
                           (arrival-.035,.09,0,'lock',-36)])
        events += [(10.35,.35,-.15,'soft',-30),(14.2,.6,.4,'paper',-29),
                   (18.3,1.2,0,'paper',-27),(21.85,.4,.5,'soft',-27),
                   (33.55,.82,.25,'soft',-27),(36.4,1.35,0,'air',-29)]
        return events

    def inspect(self):
        OUT.mkdir(parents=True,exist_ok=True)
        maximum=0; sampled=[]
        for t in np.linspace(0,DURATION,220):
            for p in self.layers(t):
                if p.opacity<.05:continue
                _,size=self.assets.image('mobile-list' if p.source=='mobile-flow' else p.source,p.clock if p.source!='mobile-flow' else 0,p.framed)
                w,h=size;z=(w*abs(np.sin(np.radians(p.yaw)))+h*abs(np.sin(np.radians(p.pitch))))/2
                bound=p.scale/(1-z*p.scale/2200)**2;s=p.scale/max(1,bound)
                maximum=max(maximum,s/(1-z*s/2200)**2)
        times=[.8,2,4.6,7.6,11.4,14.8,17.8,19.7,22.4,26.8,30.4,34.6,37.5,39.3,41.8,44.3]
        board=Image.new('RGB',(1920,1200),'#111923');d=ImageDraw.Draw(board)
        for i,t in enumerate(times):
            im=self.render(t);im.save(OUT/f'frame-{i:02d}.jpg',quality=95)
            board.paste(im.resize((480,270),Image.Resampling.LANCZOS),(i%4*480,i//4*300))
            d.text((i%4*480+8,i//4*300+277),f'{t:.1f} sec',fill='white')
        board.save(OUT/'storyboard.jpg',quality=94)
        report={'duration':DURATION,'fps':FPS,'chapters':CHAPTERS,'max_source_scale':maximum,
                'native_motion':'Prepared screens + geometry at 60 fps. Room: reconstructed native slide. Phone: native panel translation.',
                'top_bottom_overlay':False,'scope':'Ostankino only'}
        assert maximum<=1.0001,report
        (OUT/'visual-check.json').write_text(json.dumps(report,indent=2),'utf-8')
        print(json.dumps(report),flush=True)


def render_part(ffmpeg,part):
    story=Presentation();start,stop=PARTS[part:part+2]
    output=OUT/f'part-{part}.mp4'
    process=subprocess.Popen([ffmpeg,'-y','-v','error','-f','rawvideo','-pix_fmt','rgb24',
        '-s','1920x1080','-r','60','-i','pipe:0','-an','-c:v','libx264','-preset','medium',
        '-crf','17','-pix_fmt','yuv420p','-threads','2',str(output)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for frame in range(start*60,stop*60):
            process.stdin.write(story.render(frame/60).tobytes())
            if (frame-start*60+1)%180==0:print(f'Part {part}: {frame-start*60+1}/{(stop-start)*60}',flush=True)
        process.stdin.close();error=process.stderr.read().decode(errors='replace')
        if process.wait():raise RuntimeError(error)
    except BaseException:
        process.kill();process.wait();raise
    print(f'PART COMPLETE {part}',flush=True)


def assemble(ffmpeg):
    story=Presentation();audio=make_audio(ffmpeg,OUT,DURATION,story.gestures())
    concat=OUT/'parts.txt';concat.write_text(''.join(f"file 'part-{i}.mp4'\n" for i in range(4)),'utf-8')
    output=OUT/'ostankino-presentation-v6.mp4'
    subprocess.run([ffmpeg,'-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-i',str(audio),
                    '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','256k',
                    '-t',str(DURATION),'-movflags','+faststart',str(output)],check=True)
    decoded=subprocess.run([ffmpeg,'-v','error','-i',str(output),'-map','0:v','-map','0:a',
                            '-f','null','-','-progress','pipe:1','-nostats'],capture_output=True,text=True,check=True)
    frames=[int(line.split('=')[1]) for line in decoded.stdout.splitlines() if line.startswith('frame=')][-1]
    assert frames==DURATION*60,frames
    report={'frames':frames,'duration':DURATION,'decode':'passed','ending':check_ending(ffmpeg,output)}
    (OUT/'export-check.json').write_text(json.dumps(report,indent=2),'utf-8')
    print(f'COMPLETE {output}',flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--ffmpeg',default='ffmpeg');ap.add_argument('--part',type=int,choices=range(4))
    ap.add_argument('--inspect',action='store_true');ap.add_argument('--assemble',action='store_true');args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    if args.inspect:Presentation().inspect()
    if args.part is not None:render_part(args.ffmpeg,args.part)
    if args.assemble:assemble(args.ffmpeg)

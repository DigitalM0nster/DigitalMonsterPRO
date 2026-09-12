"""Three original Nipigas sites in one quiet, native-pixel portfolio film."""
import argparse
import hashlib
import json
import subprocess
import shutil
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

from projectPresentations import ProjectPresentation, p
from projectPresentationAssets import ProjectAssets
from presentationStage import PresentationStage, smooth
from presentationStyle import PresentationAssets
from presentationAudio import make_audio
from presentationMusic import MUSIC_GAIN, WAVE_GAIN, MOVEMENT_GAIN
from individualMusic import RATE, REFERENCES, decode, write_wav
from showreel import ROOT

REVISION = 'presentation-v11'
CAPTURE = ROOT/'output/showreels/nipigas/sources/expanded'
CHAPTERS = [(0,'hero'),(4,'calendar'),(8,'dates'),(11,'responsive'),
 (15,'jubilee-intro'),(22,'jubilee-flight'),(28,'history'),(32,'projects'),
 (36,'newyear'),(42,'region'),(47,'xylophone'),(55,'quiz'),(60,'wheel'),
 (69,'tree'),(75,'wish'),(79,'stories'),(83,'videos'),(88,'mobile'),
 (94,'collection'),(100,'resolve')]
SEQUENCES = {'jubilee-intro':300,'jubilee-flight':600,'newyear-region':90,
 'newyear-xylophone':360,'newyear-quiz-select':60,'newyear-quiz-next':90,
 'newyear-wheel':450,'newyear-tree-filled':120,'mobile-newyear-wish':90,'newyear-video-like':90}


class ExpandedAssets(ProjectAssets):
    def __init__(self):
        super().__init__('nipigas')

    @lru_cache(maxsize=48)
    def native(self, source):
        path=CAPTURE/(source+'.png')
        if path.exists():
            im=Image.open(path).convert('RGBA')
            if source=='newyear-tree-full':
                # Whole decorated crown: no stretching of the original tree.
                return im.crop((25,500,1240,2920))
            if source=='newyear-wish-form':return im.crop((375,189,875,523))
            if source=='newyear-chat':return im.crop((645,45,1082,728))
            if source=='jubilee-history':return im.crop((0,0,1280,674))
            if source=='newyear-santa-result':return im.crop((0,45,im.width-10,im.height))
            if source.startswith('mobile'):return im.crop((0,0,im.width-15,im.height))
            return im.crop((0,0,im.width-10,im.height))
        return super().native(source)

    @staticmethod
    @lru_cache(maxsize=12)
    def frame_template(size, framed):
        base,_=PresentationAssets.surround(Image.new('RGBA',size),framed)
        mask=Image.new('L',size,255)
        if framed:
            mask=Image.new('L',size)
            ImageDraw.Draw(mask).rounded_rectangle((0,0,size[0]-1,size[1]-1),radius=10,fill=255)
        return base,mask

    @lru_cache(maxsize=8)
    def sequence_image(self,source,frame,framed):
        im=Image.open(CAPTURE/source/f'{frame:04d}.png').convert('RGBA')
        if source=='newyear-wheel':im=im.crop((0,45,im.width-10,im.height))
        elif source.startswith('mobile'):im=im.crop((0,0,im.width-15,im.height))
        else:im=im.crop((0,0,im.width-10,im.height))
        base,mask=self.frame_template(im.size,framed)
        im.putalpha(mask);out=base.copy();out.paste(im.convert('RGBa'),(38,38))
        return out,im.size

    def image(self,source,clock=0,framed=True):
        if source in SEQUENCES:
            index=max(0,min(SEQUENCES[source]-1,round(clock*60)))
            return self.sequence_image(source,index,framed)
        return self.cache(source,0,framed)


class ExpandedNipigas(ProjectPresentation):
    def __init__(self):
        self.project='nipigas'
        PresentationStage.__init__(self,ExpandedAssets(),CHAPTERS,104)
        self.out=ROOT/'output/showreels/nipigas'/REVISION
        self.parts=tuple(range(0,105,13))
        self.antialias_fields=True

    def scene(self,name,t):
        if name in ('hero','calendar','dates','responsive'):
            return self.nipigas(name,t)
        if name=='jubilee-intro':return [p('jubilee-intro',scale=.96,clock=max(0,t-15.4),depth=5)]
        if name=='jubilee-flight':return [p('jubilee-flight',scale=.96,clock=6+max(0,t-22.4),depth=5)]
        if name=='history':return [p('jubilee-history',x=800,y=502,scale=.88,yaw=1,depth=6),
            p('jubilee-projects',x=1460,y=760,scale=.45,yaw=-2,depth=4)]
        if name=='projects':return [p('jubilee-projects',x=1060,y=529,scale=.89,yaw=-1,depth=7),
            p('jubilee-landing',x=392,y=309,scale=.39,yaw=2,depth=3)]
        if name=='newyear':return [p('newyear-map',x=878,y=550,scale=.95,yaw=1,depth=7),
            p('mobile-newyear-hero',x=1584,y=501,scale=.67,yaw=-2,depth=9)]
        if name=='region':return [p('newyear-region',x=791,y=516,scale=.88,clock=max(0,t-42.3),depth=6),
            p('newyear-region-video',x=1490,y=741,scale=.49,yaw=-2,depth=9)]
        if name=='xylophone':return [p('newyear-xylophone',scale=.97,clock=max(0,t-47.3),depth=6)]
        if name=='quiz':return [p('newyear-quiz-next',x=916,y=527,scale=.95,clock=max(0,t-55.6),depth=6),
            p('mobile-newyear-games',x=1570,y=603,scale=.67,yaw=-2,depth=9)]
        if name=='wheel':return [p('newyear-wheel',scale=.97,clock=max(0,t-60.2),depth=6)]
        if name=='tree':return [p('newyear-tree-full',x=428,y=542,scale=.36,yaw=0,depth=6),
            p('newyear-tree-filled',x=1228,y=515,scale=.73,clock=max(0,t-69.5),depth=7)]
        if name=='wish':return [p('newyear-tree-full',x=455,y=542,scale=.36,depth=6),
            p('newyear-wish-form',x=1080,y=526,scale=.98,framed=False,depth=9),
            p('mobile-newyear-wish',x=1579,y=521,scale=.70,clock=max(0,t-75.3),depth=8)]
        if name=='stories':return [p('newyear-stories',x=799,y=526,scale=.90,depth=7),
            p('newyear-leaders',x=1559,y=555,scale=.86,yaw=-1,depth=8)]
        if name=='videos':return [p('newyear-video-like',x=824,y=525,scale=.90,clock=max(0,t-83.5),depth=6),
            p('newyear-chat',x=1538,y=571,scale=.78,depth=9)]
        if name=='mobile':return [p('mobile-newyear-hero',x=443,y=535,scale=.91,yaw=2,depth=6),
            p('mobile-newyear-tree',x=960,y=535,scale=.96,depth=7),
            p('mobile-newyear-games',x=1480,y=535,scale=.91,yaw=-2,depth=8)]
        if name=='collection':
            return [p('home',x=478,y=340,scale=.56,yaw=1,depth=5),
                p('jubilee-sections',x=1360,y=367,scale=.65,yaw=-1,depth=6),
                p('newyear-map',x=960,y=788,scale=.62,depth=8)]
        if name=='resolve':
            return [p('home',x=440,y=369,scale=.53,depth=5),
                p('jubilee-sections',x=1440,y=369,scale=.53,depth=6),
                p('newyear-map',x=960,y=754,scale=.61,depth=8)]
        raise ValueError(name)

    def gestures(self):
        events=super().gestures()
        # Quiet, short feedback on captured interactions, kept below the picture.
        for at in (43,48,49,50,51,52,53,56,61,62,63,64,65,66,67,70,76):
            events.append((at,.08,0,'lock',-39))
        return events

    def assemble(self,ffmpeg):
        self.out.mkdir(parents=True,exist_ok=True)
        audio=make_audio(ffmpeg,self.out,self.duration,self.gestures(),1,music_enabled=False,
            wave_gain=WAVE_GAIN,movement_style='cards',movement_gain=MOVEMENT_GAIN)
        foley=decode(ffmpeg,audio,duration=self.duration)
        source=REFERENCES/'TpZwt4w9TnM.webm';start=12.931
        music=decode(ffmpeg,source,start,self.duration,filters='loudnorm=I=-18:TP=-2:LRA=11')
        assert len(music)==len(foley)==self.duration*RATE
        times=np.arange(len(music))/RATE
        env=np.minimum(np.clip(times/.6,0,1),np.clip((self.duration-.45-times)/3,0,1))**1.5
        music*=MUSIC_GAIN
        mix=music*env[:,None]+foley*1.8
        assert np.max(np.abs(mix))<.5
        mixed=self.out/'music-and-motion.wav';write_wav(mixed,mix)
        credit=dict(track='First Light',artist='Infraction',youtube='https://www.youtube.com/watch?v=TpZwt4w9TnM',
            source_start=start,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            music_gain_db=float(20*np.log10(MUSIC_GAIN)),music_target_lufs=-18+float(20*np.log10(MUSIC_GAIN)),
            wave_gain=WAVE_GAIN,movement_gain=MOVEMENT_GAIN,music_rms_dbfs=float(20*np.log10(np.sqrt(np.mean(music**2)))),
            master_peak_dbfs=float(20*np.log10(np.max(np.abs(mix)))))
        (self.out/'music-credit.json').write_text(json.dumps(credit,indent=2),'utf-8')
        concat=self.out/'parts.txt';concat.write_text(''.join(f"file 'part-{i}.mp4'\n" for i in range(len(self.parts)-1)),'utf-8')
        master=self.out/f'nipigas-{REVISION}.mp4'
        subprocess.run([ffmpeg,'-v','error','-y','-f','concat','-safe','0','-i',str(concat),'-i',str(mixed),
            '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-t',str(self.duration),'-movflags','+faststart',str(master)],check=True)
        low=self.out/f'nipigas-{REVISION}-540.mp4'
        subprocess.run([ffmpeg,'-v','error','-y','-i',str(master),'-vf','scale=960:540:flags=lanczos','-c:v','libx264',
            '-crf','20','-preset','medium','-threads','2','-c:a','copy','-movflags','+faststart',str(low)],check=True)
        checks={}
        for label,path in [('1080',master),('540',low)]:
            result=subprocess.run([ffmpeg,'-v','error','-i',str(path),'-f','null','-','-progress','pipe:1','-nostats'],capture_output=True,text=True,check=True)
            frames=[int(l.split('=')[1]) for l in result.stdout.splitlines() if l.startswith('frame=')][-1]
            assert frames==self.duration*60,(label,frames)
            decoded=decode(ffmpeg,path,duration=self.duration)
            tail=float(np.max(np.abs(decoded[-RATE//4:])));assert tail<.001
            assert len(decoded)==self.duration*RATE
            checks[label]=dict(frames=frames,decode='passed',silent_tail_peak=tail,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        (self.out/'export-check.json').write_text(json.dumps(dict(project='nipigas',duration=self.duration,fps=60,checks=checks,music=credit),indent=2),'utf-8')
        print(f'COMPLETE {master}',flush=True)

    def install(self):
        report=json.loads((self.out/'export-check.json').read_text('utf-8'))
        for quality,suffix in [('1080',''),('540','-540')]:
            source=self.out/f'nipigas-{REVISION}{suffix}.mp4'
            assert hashlib.sha256(source.read_bytes()).hexdigest()==report['checks'][quality]['sha256']
            shutil.copyfile(source,ROOT/f'public/video/portfolio/nipigas-{REVISION}-{quality}.mp4')
        review=ROOT/'output/showreels/presentations-v6'
        manifest=json.loads((review/'portfolio-manifest.json').read_text('utf-8'))
        for i,entry in enumerate(manifest):
            if entry['project']=='nipigas':
                manifest[i]={**report,'width':1920,'height':1080,
                    'master':str(self.out/f'nipigas-{REVISION}.mp4'),
                    'web':f'/video/portfolio/nipigas-{REVISION}-1080.mp4',
                    'web_low':f'/video/portfolio/nipigas-{REVISION}-540.mp4',
                    'sha256':report['checks']['1080']['sha256'],
                    'sites':['Calendar of Victory','Nipigas 50','New Year Express']}
        (review/'portfolio-manifest.json').write_text(json.dumps(manifest,indent=2),'utf-8')
        page=review/'index.html';html=page.read_text('utf-8')
        html=html.replace('nipigas/presentation-v10/nipigas-presentation-v10.mp4',f'nipigas/{REVISION}/nipigas-{REVISION}.mp4')
        html=html.replace('Nipigas <span>44 сек</span>','Nipigas <span>1:44 · три проекта</span>')
        page.write_text(html,'utf-8')
        print('Installed validated Nipigas v11 assets and updated review manifest.',flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--ffmpeg',default='ffmpeg');ap.add_argument('--part',type=int)
    ap.add_argument('--inspect',action='store_true');ap.add_argument('--assemble',action='store_true');ap.add_argument('--install',action='store_true')
    args=ap.parse_args();film=ExpandedNipigas()
    if args.inspect:film.inspect()
    if args.part is not None:film.render_part(args.ffmpeg,args.part)
    if args.assemble:film.assemble(args.ffmpeg)
    if args.install:film.install()

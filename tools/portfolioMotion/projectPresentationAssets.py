"""Original desktop captures, real mobile layouts and native project artwork."""
from functools import lru_cache
from PIL import Image, ImageDraw
from showreel import ROOT
from projects import PROJECTS, ProjectCaptures
from digitalMonsterStyle import DigitalMonsterStyle
from presentationStyle import PresentationAssets


class ProjectAssets:
    def __init__(self, project):
        self.project=project;config=PROJECTS[project]
        self.base=ROOT/'output/showreels'/project
        self.folder=self.base/'sources/presentation-v6'
        self.captures=ProjectCaptures(self.base/config['capture'],config.get('source_size',(1280,720)))
        self.style=DigitalMonsterStyle((1920,1080),(1312,800),16,config['address'])
        self.clocks={'home':2.7,'select':3.4,'case':4.7}
        if project=='nipigas':self.clocks={'home':2.7,'select':.5,'case':4.9}
        self.cache=lru_cache(maxsize=48)(self.prepare)

    @lru_cache(maxsize=48)
    def native(self, source):
        if (self.folder/(source+'.png')).exists():
            im=Image.open(self.folder/(source+'.png')).convert('RGBA')
            if source.startswith('mobile'):
                # Only remove the browser scrollbar, preserving the responsive content.
                return im.crop((0,0,im.width-5,im.height))
            return im
        if source in self.clocks:
            return self.captures.frame(source,self.clocks[source]).convert('RGBA')
        p=self.project
        if p=='hubarch':
            school=self.captures.frame('select',.10).convert('RGBA')
            if source=='school':return school
            if source=='school-base':
                im=school.copy();ImageDraw.Draw(im).rectangle((280,160,1000,560),fill=im.getpixel((276,160)));return im
            if source=='school-photo':return school.crop((280,160,1001,561))
            if source=='building-photo':return self.native('select').crop((280,160,1001,561))
            if source=='filter':return school.crop((1065,85,1270,489))
        if p=='belka-production':
            rects=[(627,300,1210,613),(35,303,608,616)]
            if source.startswith('art'):
                return self.native('select').crop(rects[int(source[-1])])
            if source=='gallery-base':
                im=self.native('select').copy();draw=ImageDraw.Draw(im)
                for x,y,r,b in rects:draw.rectangle((x,y,r-1,b-1),fill=im.getpixel((20,300)))
                return im
            if source=='filters':return self.native('select').crop((34,233,817,276))
        if p=='mmk-1':
            if source=='crane':return self.native('home').crop((760,76,1272,690))
            if source=='machine1':return self.native('select').crop((64,367,493,558))
            if source=='machine2':return self.native('select').crop((525,367,954,558))
            if source=='specification':return self.native('mobile-projects').crop((22,302,330,731))
        if p=='nipigas':
            if source=='archive':return self.captures.frame('home',.6).convert('RGBA')
        raise KeyError((p,source))

    def prepare(self,source,clock,framed):
        if source=='gallery-slide':
            # Gallery artwork and its caption move within the native content slot.
            # The header and filters retain their original fixed positions.
            back=self.native('school').copy();front=self.native('select')
            rect=(274,151,1006,620);panel=back.crop(rect)
            panel.alpha_composite(front.crop(rect),(0,round(panel.height*(1-clock))))
            back.alpha_composite(panel,rect[:2])
            return PresentationAssets.surround(back,framed)
        return PresentationAssets.surround(self.native(source),framed)

    def image(self,source,clock=0,framed=True):
        return self.cache(source,round(clock,6) if source=='gallery-slide' else 0,framed)

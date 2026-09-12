"""Authored beat phrases: distinct routes, native layers and moving contact sheets."""
from dataclasses import dataclass, replace
import math
from flowLayouts import Layer, ART

@dataclass(frozen=True)
class Plane:
    key: str
    x: float = 960
    y: float = 540
    scale: float = .80
    yaw: float = 0
    pitch: float = 0
    roll: float = 0
    opacity: float = 1
    lift: float = 0
    chrome: float = 0

# A different visual sentence for each film. Values are music beats, not seconds.
# Half-beat insertions are intentional short cascades between phrase downbeats.
SCORES = {
 'hubarch': [(0,'enter',0),(.5,'hero',0),(1,'hero',1),(2,'duet',0),(3,'duet',1),
 (4,'wall',0),(7,'wall',0),(8,'lift',0),(8.5,'lift',1),(9.5,'lift',2),(10,'lift',0),
 (11,'details',0),(12,'details',1),(13,'details',2),(14,'gallery',0),(15,'gallery',1),
 (16,'fan',0),(17,'fan',1),(18,'hero',2),(19,'hero',3),(20,'duet',2),(21,'duet',3),
 (22,'wall',1),(25,'wall',1),(26,'details',2),(27,'details',0),(28,'lift',0),
 (28.5,'hinge',0),(29.5,'hinge',1),(30,'hinge',2),(31,'fan',1),(32,'fan',0),
 (33,'duet',0),(34,'duet',1),(35,'hero',1),(36,'hero',4),(38,'resolve',0)],
 'belka-production': [(0,'enter',0),(.5,'hero',0),(1,'hero',1),(2,'fan',0),(2.5,'fan',1),
 (3,'fan',2),(4,'lift',0),(4.5,'lift',1),(5.5,'lift',2),(6,'lift',0),
 (7,'details',0),(8,'details',1),(8.5,'details',2),(9.5,'gallery',0),(10.5,'gallery',1),
 (12,'cascade',0),(15,'cascade',0),(16,'hero',2),(17,'duet',0),(18,'duet',1),
 (19,'details',2),(20,'gallery',0),(21,'gallery',1),(22,'cascade',1),(25,'cascade',1),
 (26,'fan',1),(27,'fan',2),(28,'lift',0),(28.5,'gallery',0),(29.5,'gallery',1),
 (30,'gallery',2),(31,'details',1),(32,'gallery',0),(33,'fan',0),(34,'fan',1),
 (35,'hero',1),(36,'hero',4),(38,'resolve',0)],
 'ostankino': [(0,'enter',0),(.5,'hero',0),(1,'hero',1),(2,'multiview',0),(3,'multiview',1),
 (4,'multiview',2),(5,'multiview',3),(6,'lift',0),(6.5,'lift',1),(7.5,'lift',2),
 (8,'lift',0),(9,'details',0),(10,'details',1),(11,'details',2),(12,'columns',0),
 (15,'columns',0),(16,'duet',0),(17,'duet',1),(18,'hero',2),(19,'hero',3),
 (20,'gallery',0),(20.5,'gallery',1),(21.5,'details',2),(22,'multiview',3),
 (23,'multiview',2),(24,'multiview',1),(25,'multiview',0),(26,'columns',1),
 (29,'columns',1),(30,'lift',0),(30.5,'multiview',0),(31.5,'multiview',3),(32,'duet',0),
 (33,'duet',2),(34,'duet',3),(35,'hero',1),(36,'hero',0),(38,'resolve',0)],
 'mmk-1': [(0,'enter',0),(.5,'hero',0),(1,'hero',1),(2,'rail',0),(3,'rail',1),
 (4,'rail',2),(5,'hero',2),(6,'lift',0),(6.5,'lift',1),(7.5,'lift',2),(8,'lift',0),
 (9,'details',0),(10,'details',1),(11,'details',2),(12,'columns',0),(15,'columns',0),
 (16,'hinge',0),(17,'hinge',1),(18,'hinge',2),(19,'duet',2),(20,'gallery',0),
 (21,'gallery',1),(22,'rail',2),(23,'rail',1),(24,'rail',0),(25,'hero',3),
 (26,'lift',0),(26.5,'rail',2),(27.5,'rail',1),(28,'rail',0),
 (29,'details',2),(30,'hinge',2),(31,'hinge',1),(32,'hinge',0),
 (33,'duet',0),(34,'duet',1),(35,'hero',1),(36,'hero',4),(38,'resolve',0)],
 'nipigas': [(0,'enter',0),(.5,'hero',0),(1,'hero',1),(2,'chronology',0),(3,'chronology',1),
 (4,'chronology',2),(5,'gallery',0),(5.5,'gallery',1),(6.5,'gallery',2),(7,'details',0),
 (8,'details',0),(9,'details',1),(10,'details',2),(11,'columns',0),(14,'columns',0),
 (15,'gallery',0),(16,'gallery',1),(17,'duet',0),(18,'duet',1),(19,'hero',2),
 (20,'chronology',2),(21,'chronology',1),(22,'chronology',0),(23,'columns',1),
 (26,'columns',1),(27,'details',0),(27.5,'chronology',0),(28.5,'chronology',1),(29,'chronology',2),
 (30,'details',2),(31,'details',1),(32,'fan',0),(33,'fan',1),(34,'fan',2),
 (35,'hero',1),(36,'hero',4),(38,'resolve',0)],
}

class Layouts:
    def __init__(self, project, card_size):
        self.project, self.card_size = project, card_size
        clocks = dict(home=2.7, select=5.6, case=8.8)
        if project == 'nipigas': clocks.update(home=.6, case=6.2)
        self.hero = 'select' if project == 'nipigas' else 'home'
        self.assets = {key: Layer(key,key,clock,960,540,1) for key,clock in clocks.items()}
        self.assets['monitor'] = Layer('monitor','case',6.4,960,540,1)
        for i,(group,clock,crop) in enumerate(ART[project]):
            self.assets[f'art{i}'] = Layer(f'art{i}',group,clock,960,540,1,crop=crop,
                                          cutout=project=='belka-production' and i==2)
        for r in range(3):
            for c in range(7):
                group = ['home','select','case'][(c+r)%3]
                self.assets[f'w{r}{c}'] = replace(self.assets[group], key=f'w{r}{c}')
                if project=='nipigas':
                    self.assets[f'w{r}{c}'] = replace(self.assets[group],key=f'w{r}{c}',crop=(0,0,1280,614))
                if project=='mmk-1':
                    self.assets[f'w{r}{c}'] = replace(self.assets[f'art{1+c%2}'],key=f'w{r}{c}')

    def make(self, name, v, beat):
        P=Plane; hero=self.hero
        if name in ('hero','resolve','enter'):
            # The export's opening fade starts with the music. Do not leave a
            # blank lead-in while waiting for the first supported subdivision.
            if name=='enter': return [P(hero,960,590,.82,-3,2,0,1,chrome=1)]
            if name=='resolve': return [P(hero,960,540,.84,0,0,0)]
            groups=[hero,hero,'case','select']
            poses=[(960,540,.84,0,0,0),(1000,530,.82,-5,2,0),
                   (930,540,.84,4,0,0),(990,540,.82,-4,1,0)]
            x,y,s,ya,pi,ro=poses[v%4]
            # Browser chrome belongs only to the introductory hero. Variant4
            # returns to the same clean viewport near the end, without a toolbar.
            return [P(groups[v%4],x,y,s,ya,pi,ro,chrome=1 if v==0 else 0)]
        if name=='duet':
            keys = ([hero,'case'] if v<2 else ['select','case'])
            return [P(keys[0],560+(v%2)*60,475+(v%2)*75,.63,-5,1,-1),
                    P(keys[1],1360-(v%2)*60,600-(v%2)*75,.63,5,-1,1)]
        if name in ('fan','hinge','chronology','rail'):
            keys=['home','select','case']
            if name=='rail':
                return [P(k,430+i*530,540+(i==v)*-85,.44+(i==v)*.14,
                          (i-v)*-5,0,0) for i,k in enumerate(keys)]
            if name=='hinge':
                return [P(k,430+i*530,540,.48,-8+i*8,8 if i!=v else 0,0)
                        for i,k in enumerate(keys)]
            if name=='chronology':
                return [P(k,480+i*480+(v-1)*30,310+i*230,.49+(i==v)*.07,
                          -5+i*5,2,-2+i*2) for i,k in enumerate(keys)]
            order=[hero]+[k for k in keys if k!=hero]
            return [P(order[1],490-v*14,646-v*30,.48,-7,2,-3),
                    P(order[2],1430+v*14,646-v*30,.48,7,2,3),
                    P(order[0],960,440+v*40,.67,0,0,0)]
        if name=='multiview':
            keys=['home','select','case','monitor'];out=[]
            for i,k in enumerate(keys):
                x=540+(i%2)*840; y=300+(i//2)*480
                out.append(P(k,x,y,.50 if i!=v else .57,0,0,0))
            return out
        if name=='lift':
            key='home' if self.project=='ostankino' else 'select'
            # Precise attached photo is drawn by the renderer in the parent's coordinates.
            return [P(key,960+(v==2)*-45,535+(v==2)*20,.77-(v==2)*.025,
                      -4+(v==2)*6,1,0,lift=[0,.80,1.05][v])]
        if name in ('details','gallery'):
            return self.details(v, name=='gallery', beat)
        if name in ('wall','columns','cascade'):
            return self.field(name,v,beat)
        raise ValueError(name)

    def details(self,v,gallery,beat):
        P=Plane; project=self.project
        if project=='belka-production':
            arr=[[(510,395,.96,-4),(1360,685,.96,4),(1130,320,.91,6)],
                 [(570,570,.96,3),(1410,410,.96,-3),(980,750,.87,-5)],
                 [(500,370,.96,0),(1350,370,.96,0),(960,770,.85,0)]]
        elif project=='ostankino':
            arr=[[(560,570,.96,-3),(1360,630,.96,3),(960,280,.96,0)],
                 [(520,380,.96,2),(1400,630,.96,-2),(960,865,.96,0)],
                 [(600,730,.96,0),(1320,350,.96,0),(960,535,.96,0)]]
        elif project=='mmk-1':
            arr=[[(1070,510,.88,0),(430,365,.98,0),(450,775,.98,0)],
                 [(1070,560,.88,-2),(450,340,.98,0),(520,770,.98,0)],
                 [(960,530,.90,0),(380,345,.94,-6),(1540,775,.94,6)]]
        elif project=='nipigas':
            arr=[[(760,500,.87,-3),(1510,370,.94,3),(1490,790,.94,0)],
                 [(840,560,.88,2),(1450,270,.94,-3),(1470,760,.94,0)],
                 [(960,470,.87,0),(460,860,.85,-3),(1470,860,.85,3)]]
        else:
            arr=[[(570,425,.91,-2),(1370,665,.91,2),(960,865,.66,0)],
                 [(650,630,.91,2),(1270,380,.91,-2),(960,865,.66,0)],
                 [(500,335,.76,-3),(1420,735,.76,3),(960,515,.87,0)]]
        chosen=arr[v%3]
        if gallery:
            # A compact cycling deck of the project's artwork, rather than a
            # renamed details layout with only a tiny oscillation.
            chosen=[(850,530,.95,-3),(1420,340,.78,8),(450,755,.69,-8)]
            if v%3==1: chosen=[(900,445,.88,2),(1390,715,.94,-3),(460,330,.80,5)]
            if v%3==2: chosen=[(820,600,.88,-2),(1450,320,.86,4),(470,380,.87,-5)]
            if project=='ostankino':
                chosen=[(580,440,.97,-2),(1370,690,.90,4),(960,860,.94,0)] if v%2==0 else [(630,625,.90,3),(1330,390,.97,-2),(960,220,.94,0)]
            if project=='hubarch':
                chosen=[(590,350,.90,-3),(1360,720,.90,3),(960,545,.82,0)] if v%2==0 else [(610,700,.90,3),(1330,340,.90,-3),(960,535,.82,0)]
            if project=='nipigas':
                chosen=[(810,515,.87,-2),(1490,320,.96,3),(1460,770,.96,0)] if v%2==0 else [(870,550,.85,2),(1450,760,.96,-3),(1440,280,.96,0)]
            if project=='mmk-1':
                chosen=[(850,520,.88,-2),(1470,340,.97,0),(1470,755,.97,0)] if v%2==0 else [(900,535,.88,0),(1420,390,.97,0),(1480,745,.97,0)]
        result=[]
        for i,(x,y,s,r) in enumerate(chosen):
            result.append(P(f'art{i}',x,y,s,(-1 if i%2 else 1)*(3 if gallery else 0),
                            1 if gallery else 0,max(-3,min(3,r))))
        return result

    def field(self,name,v,beat):
        result=[]; w,h=self.card_size
        angle = (-7 if name=='wall' else (6 if name=='cascade' else 0))*(-1 if v else 1)
        ca,sa=math.cos(math.radians(angle)),math.sin(math.radians(angle))
        # Integrating a strictly positive beat pulse gives momentum without a velocity reset.
        travel=beat+.075*math.sin(2*math.pi*beat)
        for r in range(3):
            direction=-1 if r==1 else 1
            for c in range(7):
                if self.project=='mmk-1':
                    stride=470
                    x=((c-3)*stride+direction*travel*165+stride*3.5)%(stride*7)-stride*3.5
                    y=(r-1)*260;scale=.96
                elif name=='wall':
                    stride=w*.48+40
                    x=((c-3)*stride+direction*travel*125+stride*3.5)%(stride*7)-stride*3.5
                    y=(r-1)*(h*.48+40);scale=.48
                else:
                    stride=h*.43+42
                    x=(r-1)*(w*.43+40)
                    y=((c-3)*stride+direction*travel*115+stride*3.5)%(stride*7)-stride*3.5
                    scale=.43
                result.append(Plane(f'w{r}{c}',960+x*ca-y*sa,540+x*sa+y*ca,scale,
                                    0,0,angle))
        return result

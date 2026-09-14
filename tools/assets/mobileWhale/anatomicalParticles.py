"""Rigged spatial points following smooth clean-reference filaments.

Clean-reference ridge centerlines own the geometry. The user's guide locates
whole-line roles; source luminance supplies independent illumination.
"""
import json
import math
import random
from pathlib import Path
from mathutils import Vector


def build_particles(model, reference, smooth):
    rng=random.Random(73421)
    spacing=5.8  # Twice the previous 2.9 px; brightness never changes density.
    cloud={"position":[],"normal":[],"light":[],"weights":[],"shell":[]}
    projected=model.projected
    max_depth_step=0.
    max_depth_slope=0.
    contour_count=surface_count=0
    filaments=json.loads(Path(__file__).with_name("referenceFilamentPaths.json").read_text())
    for path in filaments['paths']:
        if path['category']==3 and path.get('roleSource') not in ['guide-main','tail-outline','reference-outline']:
            raise ValueError('Main contours must be complete guided/reference outlines, not bright fragments')
        if path['category']==2 and path.get('roleSource')!='guide-secondary':
            raise ValueError('Secondary contours must come from complete guided paths')
    # A tracing junction is not an anatomical endpoint: connected curves must
    # not acquire a dark seam just because the authoring graph has two edges.
    path_grid={}
    for index,path in enumerate(filaments['paths']):
        for x,y in path['points']:
            path_grid.setdefault((int(x//4),int(y//4)),[]).append((x,y,index,path['category']))

    def connected_endpoint(point,index,category):
        x,y=point;ix=int(x//4);iy=int(y//4)
        return any(other!=index and rank>=category and (px-x)**2+(py-y)**2<3.5**2
            for dx in [-1,0,1] for dy in [-1,0,1]
            for px,py,other,rank in path_grid.get((ix+dx,iy+dy),[]))

    def add(p,n,strength,skin,side,kind=0,jitter=.002,illumination=1,end_fade=1):
        seed=rng.random();p=Vector(p)
        p+=Vector((rng.uniform(-1,1),rng.uniform(-1.5,1.5),rng.uniform(-1,1)))*jitter
        cloud["position"].extend([p.x,p.z,-p.y])
        cloud["normal"].extend([n.x,n.z,-n.y])
        # A whole connected line owns its role; illumination is independent.
        cloud["light"].extend([strength*2,illumination,seed if kind==3 else end_fade,kind])
        cloud["weights"].append(skin)
        cloud["shell"].append(1 if side<0 else 0)

    def walk(path,spacing):
        samples=[Vector(path(i/200)) for i in range(201)]
        distance=0.;next_distance=rng.random()*spacing
        for i,(a,b) in enumerate(zip(samples,samples[1:])):
            length=(b-a).length
            while next_distance<=distance+length:
                t=(next_distance-distance)/max(length,1e-9)
                yield a.lerp(b,t),(i+t)/200
                next_distance+=spacing*rng.uniform(.80,1.20)
            distance+=length

    occupied={}
    def reserve(x,y,minimum=.85):
        ix=int(x//2);iy=int(y//2);reach=math.ceil(minimum/2)
        for dx in range(-reach,reach+1):
            for dy in range(-reach,reach+1):
                for px,py in occupied.get((ix+dx,iy+dy),[]):
                    if (px-x)**2+(py-y)**2<minimum**2:return False
        occupied.setdefault((ix,iy),[]).append((x,y));return True

    # Strong continuous curves own junctions before faint crossing detail does.
    for index,filament in sorted(enumerate(filaments['paths']),key=lambda item:(-item[1]['category'],-len(item[1]['points']))):
        path=filament['points'];levels=filament['light']
        category=filament['category']
        if category==0:continue  # Replaced by the continuous full-surface cloud.
        if category not in [0,1,2,3]:raise ValueError('Expected one of four whole-line roles')
        start_join=connected_endpoint(path[0],index,category)
        end_join=connected_endpoint(path[-1],index,category)
        length=sum(math.dist(a,b) for a,b in zip(path,path[1:]))
        if length<4:continue
        cumulative=[0.]
        for a,b in zip(path,path[1:]):cumulative.append(cumulative[-1]+math.dist(a,b))
        keys=[(distance/length,*p) for distance,p in zip(cumulative,path)]
        light_keys=[(distance/length,level) for distance,level in zip(cumulative,levels)]
        previous_depth=previous_xy=None
        for xy,t in walk(lambda t:Vector(smooth(keys,t)),spacing):
            if not reserve(xy.x,xy.y):continue
            # Linear light interpolation cannot invent highlights or troughs.
            interval=next((i for i in range(len(light_keys)-1) if light_keys[i+1][0]>=t),len(light_keys)-2)
            ta,la=light_keys[interval];tb,lb=light_keys[interval+1]
            level=max(0,min(1,la+(lb-la)*max(0,min(1,(t-ta)/max(1e-9,tb-ta)))))
            # Only true path ends taper; filled dark gaps remain at full role.
            taper=min(8,length*.15)
            end_fade=min(1,1 if start_join else t*length/taper,1 if end_join else (1-t)*length/taper)
            end_fade=end_fade*end_fade*(3-2*end_fade)
            for side in [-1,1]:
                p,n,skin,_=projected(xy.x,xy.y,side)
                add(p,n,category/3,skin,side,kind=0,jitter=.00035,illumination=level,end_fade=end_fade)
                contour_count+=1
                if side==-1:
                    if previous_depth is not None:
                        delta=abs(p.y-previous_depth)
                        max_depth_step=max(max_depth_step,delta)
                        max_depth_slope=max(max_depth_slope,delta/max(.1,(xy-previous_xy).length))
                    previous_depth=p.y;previous_xy=xy.copy()

    # A subdued, spatial surface cloud carries the entire animal's volume.
    # Jittered candidates plus a minimum-distance rejection avoid rows/grids;
    # contour beads already occupy the same cloud, so no duplicate bright band
    # or cluster is added underneath a main line.
    surface_rng=random.Random(918237)
    candidates=[]
    cell=spacing*.72
    y=244.
    while y<636.:
        x=245.
        while x<1183.:
            xx=x+surface_rng.uniform(-.49,.49)*cell
            yy=y+surface_rng.uniform(-.49,.49)*cell
            if model.contains(xx,yy,margin=3.):candidates.append((xx,yy))
            x+=cell
        y+=cell
    surface_rng.shuffle(candidates)
    for x,y in candidates:
        if not reserve(x,y,spacing):continue
        illumination=surface_rng.uniform(.3,.7)
        for side in [-1,1]:
            p,n,skin,_=projected(x,y,side)
            add(p,n,0,skin,side,kind=1,jitter=0,illumination=illumination)
            surface_count+=1

    # Sparse emitters start ON the silhouette and share its rig. The GPU moves
    # them along curling waves and fades the cycle; no runtime spawning/upload.
    edges=[reference["bodyRows"][-1]["points"],reference["bodyRows"][0]["points"]]
    for key in ["nearFin","upperFluke","lowerFluke"]:
        edges.extend([reference[key]["leading"],reference[key]["trailing"]])
    for path in edges:
        length=sum(math.dist(a,b) for a,b in zip(path,path[1:]));cumulative=[0.]
        for a,b in zip(path,path[1:]):cumulative.append(cumulative[-1]+math.dist(a,b))
        keys=[(distance/length,*p) for distance,p in zip(cumulative,path)]
        for xy,t in walk(lambda t:Vector(smooth(keys,t)),3.0):
            side=-1 if rng.random()<.7 else 1
            p,n,skin,_=projected(xy.x,xy.y,side)
            add(p,n,0,skin,side,kind=3,jitter=.001,illumination=rng.uniform(.35,.70))
    if max_depth_slope>.14:raise ValueError(f"Discontinuous 3D filament: depth slope {max_depth_slope:.4f}")
    cloud["surfaceMetrics"]={"maxAdjacentDepthStep":round(max_depth_step,6),"maxDepthStepPerReferencePixel":round(max_depth_slope,6),"sharedSurface":True,"contourCount":contour_count,"surfaceCount":surface_count,"spacingReferencePx":spacing}
    return cloud


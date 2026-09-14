"""Whole-surface 3D currents, resampled by distance. No UV or eye overlays."""
import bisect
import json
import math
import random
from pathlib import Path
from mathutils import Vector


class Spline:
    """Shape-preserving cubic Hermite: continuous tangents without overshoot."""
    def __init__(self, points):
        self.x=[p[0] for p in points];self.a=[p[1] for p in points]
        h=[b-a for a,b in zip(self.x,self.x[1:])];assert min(h)>0
        d=[(b-a)/span for a,b,span in zip(self.a,self.a[1:],h)]
        self.m=[d[0]]
        for i in range(1,len(d)):
            w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1]
            self.m.append((w1+w2)/(w1/d[i-1]+w2/d[i]) if d[i-1]*d[i]>0 else 0.)
        self.m.append(d[-1])
    def __call__(self,x):
        x=max(self.x[0],min(self.x[-1],x));i=max(0,min(len(self.x)-2,bisect.bisect_right(self.x,x)-1))
        h=self.x[i+1]-self.x[i];t=(x-self.x[i])/h
        return (2*t**3-3*t*t+1)*self.a[i]+(t**3-2*t*t+t)*h*self.m[i]+(-2*t**3+3*t*t)*self.a[i+1]+(t**3-t*t)*h*self.m[i+1]


def build_surface_particles(reference,surface,on_body,coordinates,body_weights,wing_point,wing_weights,wings):
    rng=random.Random(77231);step=.043
    authored=json.loads(Path(__file__).with_name("bodyCurrentPaths.json").read_text())
    family=[(row['level'],Spline(row['points']),row['name']) for row in authored]
    cloud={key:[] for key in ['position','normal','weights','light','flow']};occupied={};paths=[]
    def flow_y(x,f):
        i=next((i for i in range(len(family)-1) if f<=family[i+1][0]),len(family)-2)
        lo,hi=family[i],family[i+1];u=(f-lo[0])/(hi[0]-lo[0])
        return lo[1](x)*(1-u)+hi[1](x)*u
    def body_normal(p,side):
        s,q=coordinates(p.x*100+700,450-p.z*100)
        along=surface(min(.9999,s+.00015),q,side)-surface(max(.0001,s-.00015),q,side)
        across=surface(s,min(.9999,q+.0002),side)-surface(s,max(-.9999,q-.0002),side)
        n=along.cross(across).normalized()
        if n.y*side<0:n=-n
        return n
    def reserve(p):
        cell=.024;k=tuple(math.floor(v/cell) for v in p)
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                for dz in [-1,0,1]:
                    for v in occupied.get((k[0]+dx,k[1]+dy,k[2]+dz),[]):
                        if (p-v).length_squared<.000225:return False
        occupied.setdefault(k,[]).append(p.copy());return True
    def add(p,n,skin,energy,role,path_id,t,size=.78):
        if not reserve(p):return
        cloud['position'] += [p.x,p.z,-p.y];cloud['normal'] += [n.x,n.z,-n.y]
        cloud['weights'].append(skin)
        cloud['light'] += [energy,size,rng.random(),role]
        cloud['flow'] += [path_id,t]
    def curve(name,fn,normal,skin,role,energy,spacing=step):
        count=700;samples=[fn(i/count) for i in range(count+1)]
        lengths=[0.]
        for a,b in zip(samples,samples[1:]):lengths.append(lengths[-1]+(b-a).length)
        total=lengths[-1];n=max(2,round(total/spacing));path_id=len(paths)
        start=len(cloud['weights'])
        for i in range(n+1):
            distance=total*(i+.15)/(n+.3);k=max(0,min(count-1,bisect.bisect_right(lengths,distance)-1))
            local=(distance-lengths[k])/max(1e-8,lengths[k+1]-lengths[k]);t=(k+local)/count
            p=fn(t);normal_value=normal(t,p)
            strength=energy(t) if callable(energy) else energy
            add(p,normal_value,skin(t,p),strength,role,path_id,distance/total)
        paths.append({'name':name,'id':path_id,'points':len(cloud['weights'])-start,'length':total,'role':role})
    # These are existing full-length body lanes, including both eye-forming paths.
    fractions=sorted(set([i/42 for i in range(43)]+[.18,.28,.36,.55,.70,.86]))
    main=[0.,.18,.28,.36,.55,.70,.86,1.]
    fractions.sort(key=lambda f: f not in main)
    for f in fractions:
        if f<.18:continue  # The throat uses wrapping meridians below the mouth.
        for side in [-1,1]:
            if f==1 and side==1:continue
            role=3 if f in [1.,.18,.86] else 2 if f in [.28,.36,.55,.70] else 1
            energy={3:1.05,2:.69,1:.21}[role]
            # A few quiet interior lanes retain the whole surface while the two
            # eye-forming currents remain legible. These paths still run end to end.
            if .28<f<.36:role=0;energy=.065
            name=next((name for level,_,name in family if abs(level-f)<.00001),f'body-{f:.4f}')
            def path(t,f=f,side=side):
                x=250+759*t;y=flow_y(x,f)
                return on_body(x,y,side,.009)
            curve(f'{name}/{side}',path,lambda t,p,side=side:body_normal(p,side),
                lambda t,p:body_weights(p.x),role,energy)
    mouth=next(spline for level,spline,_ in family if level==.18)
    bottom=family[0][1]
    for rib in range(55):
        base=252+(rib/54)**1.04*285
        for side in [-1,1]:
            def throat(t,base=base,side=side):
                x=base+(8+10*math.sin((base-252)/285*math.pi))*math.sin(t*math.pi*.75)
                y=mouth(x)*(1-t)+bottom(x)*t
                return on_body(x,y,side,.009)
            curve(f'throat-{rib}/{side}',throat,lambda t,p,side=side:body_normal(p,side),
                lambda t,p:body_weights(p.x),1,.35 if rib%5 else .48)
    # Sparse fin surfaces. The collar is body-owned; there is no luminous root seam.
    for name,key,parent,far,region in wings:
        profile=reference[key];rows=12 if region==1 else 15
        for face in [-1,1]:
            for row in range(rows+1):
                if face==1 and row in [0,rows]:continue
                a=row/rows;theta=math.acos(2*a-1)*(face if face>0 else -1)
                start=.006 if region==1 else .012
                def fin(t,p=profile,theta=theta,far=far,start=start):
                    point=wing_point(p,start+(1-start)*t,theta,far)
                    return point+normal(t,point)*.009
                def normal(t,p,profile=profile,theta=theta,far=far,start=start,face=face):
                    s=min(.9999,start+(1-start)*t)
                    ds=wing_point(profile,min(1,s+.002),theta,far)-wing_point(profile,max(0,s-.002),theta,far)
                    dt=wing_point(profile,s,theta+.004,far)-wing_point(profile,s,theta-.004,far)
                    n=ds.cross(dt)
                    if n.length_squared<1e-14:
                        return body_normal(p,1 if far else -1)
                    n.normalize()
                    center=(wing_point(profile,s,0,far)+wing_point(profile,s,math.pi,far))*.5
                    radial=wing_point(profile,s,theta,far)-center
                    return -n if n.dot(radial)<0 else n
                edge=row in [0,rows];strength=.66 if edge else .14
                curve(f'{name}-{face}-{row}',fin,normal,
                    lambda t,p,name=name,parent=parent,start=start:wing_weights(start+(1-start)*t,name,parent,p),
                    2 if edge else 1,lambda t,strength=strength:strength*(.20+.8*min(1,t/.16)),spacing=.048)
    # Very quiet, irregular surface population adds mass between the ordered currents.
    for _ in range(2100):
        s=.004+rng.random()*.99;q=rng.uniform(-.99,.99);side=-1 if rng.random()<.5 else 1
        p=surface(s,q,side,.010+rng.random()*.004);n=body_normal(p,side)
        add(p,n,body_weights(p.x),.055+rng.random()*.04,0,-1,rng.random(),.52+rng.random()*.20)
    cloud['paths']=paths
    Path(__file__).parents[3].joinpath('output/mobile-whale/particle-path-audit.json').write_text(json.dumps(paths,indent=2))
    print('SURFACE_CURRENTS',len(cloud['weights']),'points',len(paths),'continuous paths')
    return cloud

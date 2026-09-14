"""Build the editable Digital Monster creature blockout and glTF assets.
Not an image-to-3D reconstruction: manually designed parametric approximation.
Requires Python 3.10+, numpy, scipy, trimesh. Run in this directory.
Blender users should instead run assemble_blender.py (no external dependencies).
"""
from pathlib import Path
import math, json, gzip, shutil
import numpy as np
from scipy.interpolate import PchipInterpolator
import trimesh
from trimesh.visual.material import PBRMaterial

ROOT = Path(__file__).resolve().parent
for sub in ('models','data','references','previews'): (ROOT/sub).mkdir(exist_ok=True)
rng = np.random.default_rng(60113)
TAU=2*math.pi

# Local source axes: X nose -> tail, Y lateral, Z up. Nose points -X.
X=np.array([-5.55,-5.45,-5.12,-4.65,-3.85,-2.8,-1.65,-.45,.8,1.9,2.85,3.65,4.28])
TOP=np.array([-.38,-.15,.04,.34,.69,1.01,1.20,1.16,.94,.66,.39,.22,.16])
BOT=np.array([-.40,-.64,-.86,-1.035,-1.10,-1.12,-1.02,-.83,-.61,-.39,-.245,-.17,-.13])
W=np.array([.002,.20,.44,.68,.92,1.035,1.01,.88,.69,.48,.305,.20,.18])
FT,FB,FW=(PchipInterpolator(X,a) for a in (TOP,BOT,W))

def body(x,theta,lift=0.):
    x,theta=np.broadcast_arrays(np.asarray(x,dtype=float),np.asarray(theta,dtype=float))
    zc=(FT(x)+FB(x))/2
    hh=(FT(x)-FB(x))/2
    ss=np.sin(theta); cc=np.cos(theta)
    # A slightly flattened underside and a subtle midline forehead ridge.
    z=zc+hh*np.sign(ss)*np.abs(ss)**.91
    z+=.045*np.exp(-((x+3.2)/1.5)**2)*np.maximum(ss,0)**12
    y=FW(x)*cc
    # Recess the mouth seam in the otherwise uninterrupted body surface.
    mouth=np.sin(theta)+.30
    recess=.021*np.exp(-(mouth/.055)**2)*np.exp(-((x+3.25)/2.2)**8)
    y*=1-recess
    y+=lift*cc; z+=lift*ss
    return np.stack([x,y,z],axis=-1)

class Part:
    def __init__(self,name,fn,umin,umax,nu,nv):
        self.name,self.fn,self.umin,self.umax=name,fn,umin,umax
        self.nu,self.nv=nu,nv
        uu=np.linspace(umin,umax,nu)
        vv=np.linspace(0,TAU,nv,endpoint=False)
        grid=fn(uu[:,None],vv[None,:])
        verts=list(grid.reshape(-1,3)); faces=[]
        for i in range(nu-1):
            for j in range(nv):
                a=i*nv+j;b=i*nv+(j+1)%nv;c=(i+1)*nv+(j+1)%nv;d=(i+1)*nv+j
                faces.append([a,b,c,d])
        for i,reverse in ((0,True),(nu-1,False)):
            idx=len(verts);verts.append(grid[i].mean(axis=0))
            for j in range(nv):
                face=[idx,i*nv+(j+1)%nv,i*nv+j]
                if reverse:face.reverse()
                faces.append(face)
        self.vertices=np.asarray(verts)
        self.faces=faces
        uv=np.stack(np.meshgrid(np.linspace(0,1,nu),np.arange(nv)/nv,indexing='ij'),-1).reshape(-1,2)
        self.uv=np.vstack([uv,[0,.5],[1,.5]])
        tm=self.trimesh()
        if tm.volume<0:
            self.faces=[f[::-1] for f in self.faces]
    def triangles(self):
        return np.array([tri for f in self.faces for tri in ([[f[0],f[1],f[2]]] if len(f)==3 else [[f[0],f[1],f[2]],[f[0],f[2],f[3]]])])
    def trimesh(self):
        return trimesh.Trimesh(vertices=self.vertices,faces=self.triangles(),process=False)

parts=[Part('DM_Body',body,X[0],X[-1],113,72)]
# Swept, thin pectoral blades. They are paired appendages, not extra tails.
S=np.array([0,.15,.36,.59,.8,.94,1.])
PY0=np.array([.79,1.04,1.48,2.00,2.53,2.91,3.08])
PF=np.array([-1.83,-1.63,-1.22,-.61,.17,.97,1.56])
PB=np.array([-.43,-.03,.37,.81,1.21,1.47,1.575])
PZ=np.array([-.39,-.47,-.66,-.90,-1.17,-1.37,-1.48])
PH=np.array([.105,.098,.081,.061,.04,.021,.002])
fy,ff,fb,fz,fh=(PchipInterpolator(S,a) for a in (PY0,PF,PB,PZ,PH))
def pectoral(side):
    def fn(t,theta,lift=0):
        t,theta=np.broadcast_arrays(np.asarray(t),np.asarray(theta))
        a,b=ff(t),fb(t)
        x=(a+b)/2+(b-a)/2*np.cos(theta)
        y=side*fy(t)+side*lift*.35
        z=fz(t)+(fh(t)+lift)*np.sin(theta)
        return np.stack([x,y,z],axis=-1)
    return fn
for sign,label in [(-1,'L'),(1,'R')]:
    parts.append(Part(f'DM_Pectoral_{label}',pectoral(sign),0,1,39,28))
# Horizontal, bilobed caudal fluke with an actual central notch.
TS=np.array([0,.10,.27,.50,.72,.89,1.])
TY=np.array([0,.28,.68,1.26,1.84,2.25,2.53])
TF=np.array([4.02,4.00,4.10,4.40,4.91,5.43,5.97])
TB=np.array([4.88,5.11,5.35,5.61,5.80,5.96,5.983])
TZ=np.array([.0,.01,.045,.105,.21,.36,.48])
TH=np.array([.135,.125,.10,.068,.046,.023,.002])
ty,tf,tb,tz,th=(PchipInterpolator(TS,a) for a in (TY,TF,TB,TZ,TH))
def fluke(side):
    def fn(t,theta,lift=0):
        t,theta=np.broadcast_arrays(np.asarray(t),np.asarray(theta))
        a,b=tf(t),tb(t)
        x=(a+b)/2+(b-a)/2*np.cos(theta)
        y=side*ty(t)
        z=tz(t)+(th(t)+lift)*np.sin(theta)
        return np.stack([x,y,z],axis=-1)
    return fn
for sign,label in [(-1,'L'),(1,'R')]:
    parts.append(Part(f'DM_Fluke_{label}',fluke(sign),0,1,35,28))
# Modest swept dorsal fin; leave the silhouette elegant, not shark-like.
DS=np.array([0,.22,.48,.72,.92,1.])
DF=np.array([.22,.46,.70,.96,1.19,1.33])
DB=np.array([1.66,1.60,1.54,1.46,1.38,1.34])
DZ=np.array([.82,.99,1.15,1.27,1.35,1.38])
DH=np.array([.15,.124,.087,.052,.020,.002])
df,db,dz,dh=(PchipInterpolator(DS,a) for a in (DF,DB,DZ,DH))
def dorsal(t,theta,lift=0):
    t,theta=np.broadcast_arrays(np.asarray(t),np.asarray(theta))
    a,b=df(t),db(t)
    return np.stack([(a+b)/2+(b-a)/2*np.cos(theta),(dh(t)+lift)*np.sin(theta),dz(t)],axis=-1)
parts.append(Part('DM_Dorsal',dorsal,0,1,25,24))

# Closed, independent eye meshes; small details, not oversized cartoon eyes.
eyes=[]
for side,label in [(-1,'L'),(1,'R')]:
    theta=math.pi-.26 if side<0 else .26
    loc=body(-2.61,theta,.012)
    m=trimesh.creation.icosphere(subdivisions=2)
    m.vertices=m.vertices*np.array([.102,.031,.054])+loc
    eyes.append((f'DM_Eye_{label}',m))

# Parametric point trails: organized contour flows with varying density.
point_pos=[]; point_size=[]; point_part=[]; point_uv=[]
flow=[]
for pi,p in enumerate(parts):
    if pi==0: nl,ns=116,144
    elif 'Pectoral' in p.name: nl,ns=34,54
    elif 'Fluke' in p.name: nl,ns=32,50
    else: nl,ns=20,35
    for j in range(nl):
        base=TAU*(j+.18)/nl
        u=np.linspace(p.umin+.001,p.umax-.001,ns)
        f=(u-p.umin)/(p.umax-p.umin)
        phase=base+.105*np.sin(f*TAU*1.2+base*2)+.06*np.sin(f*math.pi*3)*np.sin(base*3)
        if pi==0:
            phase+=.26*np.exp(-((u+1.65)/1.35)**2)*np.sin(base*2)
        pts=p.fn(u,phase,.009)
        keep=rng.random(ns)>.10
        point_pos.extend(pts[keep])
        point_size.extend(rng.uniform(.008,.014,size=keep.sum()))
        point_part.extend([pi]*keep.sum())
        point_uv.extend(np.column_stack([f[keep],(phase[keep]%TAU)/TAU]))
        if j%max(1,nl//8)==0:
            flow.append(dict(name=f'{p.name}_Flow_{j:03}',part=pi,kind='flow',radius=.0030,points=pts.tolist()))
# The mouth seam, fine forehead ridges and restrained eyelid outlines.
for side in (-1,1):
    u=np.linspace(-5.45,-1.33,145)
    ff0=(u-u.min())/(u.max()-u.min())
    a=.34-.075*np.sin(ff0*math.pi)
    theta=math.pi+a if side<0 else -a
    pp=body(u,theta,.016)
    flow.append(dict(name=f'Mouth_{side}',part=0,kind='accent',radius=.0065,points=pp.tolist()))
    eye_theta=math.pi-.26 if side<0 else .26
    c=body(-2.61,eye_theta,.022)
    angle=np.linspace(0,TAU,65)
    pp=np.stack([c[0]+.125*np.cos(angle),c[1]+side*.010*np.sin(angle)**2,c[2]+.067*np.sin(angle)],-1)
    flow.append(dict(name=f'Eyelid_{side}',part=0,kind='accent',radius=.0048,points=pp.tolist()))
for delta in (-.28,-.14,0,.14,.28):
    u=np.linspace(-5.20,3.90,170)
    theta=math.pi/2+delta+.035*np.sin((u+4)*1.9)
    pp=body(u,theta,.014)
    flow.append(dict(name=f'Dorsal_fiber_{delta}',part=0,kind='accent',radius=.0038,points=pp.tolist()))
# Tiny brighter anatomical nodes rather than a scatter of giant lights.
landmarks=[]
for x,a in [(-5.33,math.pi+.08),(-4.62,math.pi/2),(-3.6,math.pi/2-.09),(-2.61,math.pi-.26),(-1.5,math.pi/2),(-.45,math.pi/2+.10),(2.6,math.pi/2),(4.0,math.pi/2)]:
    landmarks.append(body(x,a,.028))
for side in (-1,1): landmarks.extend([pectoral(side)(.82,math.pi/2,.015),fluke(side)(.93,math.pi/2,.018)])

pos=np.array(point_pos,dtype=np.float32);sizes=np.array(point_size,dtype=np.float32)
np.savez_compressed(ROOT/'data/surface_samples.npz',positions=pos,radii=sizes,part_indices=np.array(point_part,dtype=np.uint8),uv=np.array(point_uv,dtype=np.float32),landmarks=np.array(landmarks,dtype=np.float32))

# Source JSON holds true quad patches, preserving useful Blender edit topology.
source={'asset':'Digital Monster creature','status':'PARAMETRIC BLOCKOUT, NOT FINAL RECONSTRUCTION','axis':{'up':'+Z','forward':'-X','length':11.533},'parts':[],'paths':flow,'landmarks':np.array(landmarks).tolist()}
for p in parts:
    source['parts'].append({'name':p.name,'vertices':np.round(p.vertices,6).tolist(),'faces':p.faces,'uv':np.round(p.uv,6).tolist()})
for name,m in eyes:
    source['parts'].append({'name':name,'vertices':np.round(m.vertices,6).tolist(),'faces':m.faces.tolist(),'uv':None})
source['surface_points']={'positions':np.round(pos,6).tolist(),'radii':np.round(sizes,6).tolist(),'part_indices':point_part,'uv':np.round(point_uv,6).tolist()}
with gzip.open(ROOT/'data/creature_source.json.gz','wt',encoding='utf8') as f: json.dump(source,f,separators=(',',':'))

# glTF is Y-up: export coordinates transform (x,y,z) -> (x,z,-y).
ROT=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],dtype=float)
skin=PBRMaterial(name='DM_DarkSkin',baseColorFactor=[9,22,35,255],metallicFactor=.52,roughnessFactor=.38)
clay=PBRMaterial(name='DM_Clay',baseColorFactor=[118,144,160,255],metallicFactor=.05,roughnessFactor=.46)
eye_mat=PBRMaterial(name='DM_Eye',baseColorFactor=[2,8,16,255],metallicFactor=.7,roughnessFactor=.2)
cyan=PBRMaterial(name='DM_CyanEmission',baseColorFactor=[0,100,220,255],emissiveFactor=[.0,.36,1.],metallicFactor=.1,roughnessFactor=.35,doubleSided=True)
cyan2=PBRMaterial(name='DM_AccentEmission',baseColorFactor=[5,170,255,255],emissiveFactor=[.02,.68,1.],metallicFactor=0,roughnessFactor=.4,doubleSided=True)

def materialize(m,mat,uv=None):
    m=m.copy()
    m.visual=trimesh.visual.TextureVisuals(uv=uv,material=mat)
    return m

base=trimesh.Scene(); look=trimesh.Scene()
for p in parts:
    m=p.trimesh()
    base.add_geometry(materialize(m,clay,p.uv),node_name=p.name,geom_name=p.name,transform=ROT)
    look.add_geometry(materialize(m,skin,p.uv),node_name=p.name,geom_name=p.name,transform=ROT)
for name,m in eyes:
    for scene in (base,look):scene.add_geometry(materialize(m,eye_mat),node_name=name,geom_name=name,transform=ROT)
# Consolidated octahedra are only a portable static look-dev approximation.
octa=np.array([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],float)
of=np.array([[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]])
# Use every other sample for portable preview, retaining all source anchors.
select=np.arange(0,len(pos),2)
v=(pos[select,None,:]+sizes[select,None,None]*octa[None,:,:]).reshape(-1,3)
f=(of[None,:,:]+6*np.arange(len(select))[:,None,None]).reshape(-1,3)
dots=trimesh.Trimesh(v,f,process=False)
look.add_geometry(materialize(dots,cyan),node_name='FX_StaticDots',geom_name='FX_StaticDots',transform=ROT)

def tubes(paths):
    verts=[];faces=[]
    for path in paths:
        pp=np.asarray(path['points']);r=path['radius']
        n=len(pp);t=np.gradient(pp,axis=0);t/=np.linalg.norm(t,axis=1)[:,None]
        up=np.tile([0.,0.,1.],(n,1));use=np.abs(t[:,2])>.9;up[use]=[0,1,0]
        a=np.cross(t,up);a/=np.linalg.norm(a,axis=1)[:,None];b=np.cross(t,a)
        ang=np.linspace(0,TAU,4,endpoint=False)
        vv=pp[:,None,:]+r*(a[:,None,:]*np.cos(ang)[None,:,None]+b[:,None,:]*np.sin(ang)[None,:,None])
        offset=len(verts);verts.extend(vv.reshape(-1,3))
        for i in range(n-1):
            for j in range(4):
                q=[offset+i*4+j,offset+i*4+(j+1)%4,offset+(i+1)*4+(j+1)%4,offset+(i+1)*4+j]
                faces.extend([[q[0],q[1],q[2]],[q[0],q[2],q[3]]])
    return trimesh.Trimesh(np.asarray(verts),np.asarray(faces),process=False)
for kind,mat in [('flow',cyan),('accent',cyan2)]:
    t=tubes([p for p in flow if p['kind']==kind])
    look.add_geometry(materialize(t,mat),node_name=f'FX_{kind}',geom_name=f'FX_{kind}',transform=ROT)
lm=trimesh.util.concatenate([trimesh.creation.icosphere(subdivisions=1,radius=.031).apply_translation(q) for q in landmarks])
look.add_geometry(materialize(lm,cyan2),node_name='FX_Highlights',geom_name='FX_Highlights',transform=ROT)
(ROOT/'models/dm_creature_base.glb').write_bytes(base.export(file_type='glb'))
(ROOT/'models/dm_creature_lookdev.glb').write_bytes(look.export(file_type='glb'))
# Grouped OBJ, with original Z-up convention. Simple Blender fallback.
lines=['# Digital Monster PARAMETRIC BLOCKOUT, Z-up, forward=-X; units arbitrary.'];offset=0
for p in parts:
    lines.append('o '+p.name)
    lines.extend('v %.6f %.6f %.6f'%tuple(v) for v in p.vertices)
    lines.extend('f '+' '.join(str(k+1+offset) for k in face) for face in p.faces)
    offset+=len(p.vertices)
for name,m in eyes:
    lines.append('o '+name);lines.extend('v %.6f %.6f %.6f'%tuple(v) for v in m.vertices)
    lines.extend('f '+' '.join(str(k+1+offset) for k in face) for face in m.faces);offset+=len(m.vertices)
(ROOT/'models/dm_creature_base.obj').write_text('\n'.join(lines),encoding='utf8')

checks={'kind':'base_mesh_validation','axis_source':'Z-up, forward=-X','axis_glb':'Y-up, forward=-X','triangles_base':int(sum(len(p.triangles()) for p in parts)+sum(len(m.faces) for _,m in eyes)),'surface_sample_count':int(len(pos)),'lookdev_dot_count':int(len(select)),'parts':[],'limitations':['Independent intersecting appendage roots; not a welded production skin.','No rig/animation in GLB.','Look-dev FX are static meshes, not a production particle renderer.','Hidden anatomy and exact head likeness are approximated, not recovered from the image.','Blender assembly script has not been executed in Blender in this environment.']}
for p in parts:
    m=p.trimesh();checks['parts'].append({'name':p.name,'vertices':len(m.vertices),'triangles':len(m.faces),'watertight_component':bool(m.is_watertight),'positive_volume':bool(m.volume>0),'finite_vertices':bool(np.isfinite(m.vertices).all())})
# Reload both actual exported files to catch serialization failures.
for name in ('dm_creature_base.glb','dm_creature_lookdev.glb'):
    scene=trimesh.load(ROOT/'models'/name,force='scene')
    checks[name]={'reload_ok':bool(len(scene.geometry)),'mesh_count':len(scene.geometry),'bytes':(ROOT/'models'/name).stat().st_size}
(ROOT/'data/validation.json').write_text(json.dumps(checks,indent=2),encoding='utf8')
print(json.dumps(checks,indent=2))

"""Author a new, rigged mobile whale. No imported whale geometry.
Blender 4.2: blender --background --factory-startup --python this_file.py
Produces an editable .blend, animated GLB and a clay silhouette review.
The site's mobileWhaleMaterial.js supplies the final moving light treatment.
"""
import bpy
import math
import json
import sys
import subprocess
from functools import lru_cache
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "public/models/home/whale-mobile.glb"
REVIEW = ROOT / "output/mobile-whale"
REVIEW.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 145

def smooth_profile(keys, t):
    # Physical knot spacing preserves tangent continuity at the rounded jaw.
    k = next((i for i in range(len(keys)-1) if keys[i+1][0] >= t), len(keys)-2)
    u = max(0, min(1, (t-keys[k][0])/(keys[k+1][0]-keys[k][0])))
    a,b,c,d = keys[max(0,k-1)],keys[k],keys[k+1],keys[min(len(keys)-1,k+2)]
    h=c[0]-b[0]
    return [(2*u**3-3*u*u+1)*b[j]+(u**3-2*u*u+u)*h*(c[j]-a[j])/(c[0]-a[0])
        +(-2*u**3+3*u*u)*c[j]+(u**3-u*u)*h*(d[j]-b[j])/(d[0]-b[0]) for j in range(1,len(b))]

def smoother(t):
    t=max(0,min(1,t))
    return t*t*t*(t*(t*6-15)+10)

meshes = []
weights_by_mesh = {}
def ring_mesh(name, rings, sides, sample, weights, line_scale=(1,1), flow_region=0, bridge=False):
    verts, faces, uvs = [], [], []
    for i in range(rings+1):
        s=i/rings
        for j in range(sides):
            theta=j/sides*math.tau
            verts.append(sample(s,theta))
    for i in range(rings):
        for j in range(sides):
            n=(j+1)%sides
            faces.append((i*sides+j,i*sides+n,(i+1)*sides+n,(i+1)*sides+j))
            uvs.append(((i/rings,j/sides),(i/rings,(j+1)/sides),((i+1)/rings,(j+1)/sides),((i+1)/rings,j/sides)))
    faces.extend([tuple(reversed(range(sides))),tuple(rings*sides+j for j in range(sides))])
    uvs.extend([[(0,j/sides) for j in reversed(range(sides))],[(1,j/sides) for j in range(sides)]])
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    layer=data.uv_layers.new(name="Flow")
    for polygon,coords in zip(data.polygons,uvs):
        polygon.use_smooth=True
        for loop,uv in zip(polygon.loop_indices,coords):
            layer.data[loop].uv=(uv[0]*line_scale[0],flow_region*2+uv[1]*line_scale[1])
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT");bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    weights_by_mesh[obj.name]=[weights(i//sides/rings,Vector(p)) for i,p in enumerate(verts)]
    meshes.append(obj)
    return obj

# The supplied full-frame reference is the design authority. Each row is an
# independently traced streamline, not the latitude of a generic whale model.
reference=json.loads((HERE/"referenceContours.json").read_text())
rows=reference["bodyRows"]
sys.path.insert(0,str(HERE))
from surfaceParticles import Spline
row_splines=[Spline(r["points"]) for r in rows]
def screen_point(pixel,depth=0):
    return Vector(((pixel[0]-700)/100,depth,(450-pixel[1])/100))
def traced_path(points,s):
    return smooth_profile([(i/(len(points)-1),*p) for i,p in enumerate(points)],s)
@lru_cache(maxsize=32768)
def body_row_values(s):
    # Resample all traced rows at a common X, then interpolate monotonically
    # across them. A free Coons patch folds where the saddle rows converge.
    x=249+761*s
    values=[spline(x) for spline in row_splines]
    # Short elliptic arcs meet at one rounded, closed nose. No projecting prow.
    dx=x-249
    if dx<12:
        top=536-24*math.sqrt(max(0,1-((dx-18)/18)**2))
        bottom=536+28*math.sqrt(max(0,1-((dx-22)/22)**2))
        blend=1-smoother((dx-6)/6)
        values[0]=values[0]*(1-blend)+bottom*blend
        values[-1]=values[-1]*(1-blend)+top*blend
    gap=max(.00001,(values[0]-values[-1])*.001)
    for i in range(len(values)-2,-1,-1):values[i]=max(values[i],values[i+1]+gap)
    return values

def body_screen(s,q):
    x=249+761*s
    values=body_row_values(s)
    qs=[r["latitude"] for r in rows]
    slopes=[(values[i+1]-values[i])/(qs[i+1]-qs[i]) for i in range(len(qs)-1)]
    tangent=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]):tangent.append(2*a*b/(a+b) if a*b>0 else 0)
    tangent.append(slopes[-1])
    i=next((i for i in range(len(qs)-1) if q<=qs[i+1]),len(qs)-2)
    h=qs[i+1]-qs[i];t=max(0,min(1,(q-qs[i])/h))
    y=(2*t**3-3*t*t+1)*values[i]+(t**3-2*t*t+t)*h*tangent[i]+(-2*t**3+3*t*t)*values[i+1]+(t**3-t*t)*h*tangent[i+1]
    p=[x,y]
    return p

def body_depth(s,q):
    width=1.18*math.sqrt(max(0,math.sin(math.pi*s)))*(1-.38*s)
    return width*math.sqrt(max(0,1-q*q))
def surface(s,q,side=-1,lift=0):
    return screen_point(body_screen(s,q),side*(body_depth(s,q)+lift))

@lru_cache(maxsize=8192)
def body_coordinates(x,y):
    s=max(.00001,min(.99999,(x-249)/761));lo=-1.;hi=1.
    for _ in range(18):
        q=(lo+hi)*.5
        if body_screen(s,q)[1]>y:lo=q
        else:hi=q
    return s,(lo+hi)*.5

def on_body(x,y,side=-1,lift=0):
    s,q=body_coordinates(x,y)
    return surface(s,q,side,lift)
def flow_surface(s,q,side=-1,lift=0):
    # Feature locations retain their traced-row parameter when body UV U is
    # changed to physical longitudinal distance for an untangled surface.
    x=smooth_profile([(r["latitude"],*traced_path(r["points"],s)) for r in rows],q)[0]
    return surface((x-249)/761,q,side,lift)
spine_centers=[(-2.1,"Body"),(.1,"Tail01"),(1.55,"Tail02"),(2.35,"Tail03"),(3.05,"Peduncle")]
def body_weights(x):
    if x<=spine_centers[0][0]:return {"Body":1}
    for (a,an),(b,bn) in zip(spine_centers,spine_centers[1:]):
        if x<=b:
            t=(x-a)/(b-a);t=t*t*(3-2*t)
            return {an:1-t,bn:t}
    return {"Peduncle":1}
def body_point(s,theta):
    q=math.sin(theta)
    return surface(s,q,-1 if math.cos(theta)<0 else 1)
body=ring_mesh("MobileWhale_Body",180,100,body_point,lambda s,p:body_weights(p.x))

# Closed, cambered swept fins. Independent edges preserve the concave trailing
# edge and convex leading edge; depth makes a volume that can turn and swim.
def wing_point(profile,s,theta,far=False):
    if profile is reference["upperFluke"] or profile is reference["lowerFluke"]:
        sign=1 if profile is reference["upperFluke"] else -1
        across=(math.cos(theta)+1)*.5;span=1.86*s*sign
        chord=.67*math.sin(math.pi*s)**.6+.21*(1-s)
        along=.84*s-.11*math.sin(math.pi*s)+(across-.5)*chord
        yaw=.48
        return Vector((3.03+along*math.cos(yaw)-span*math.sin(yaw),
            along*math.sin(yaw)+span*math.cos(yaw),
            .76+.08*s*s+.032*math.sin(math.pi*s)+(.034*math.sin(math.pi*s)+.002)*math.sin(theta)))
    a=Vector(traced_path(profile["leading"],s));b=Vector(traced_path(profile["trailing"],s))
    across=(math.cos(theta)+1)*.5
    pixel=a.lerp(b,across)
    if "root" in profile:
        root=Vector(traced_path(profile["root"],across))
        base=Vector(profile["leading"][0]).lerp(Vector(profile["trailing"][0]),across)
        pixel+=(root-base)*(1-smoother(s/.55))
    depth=traced_path([[d] for d in profile["depth"]],s)[0]
    thick=.045*math.sin(math.pi*s)**.4+.003
    if profile is reference["nearFin"]:
        root_pixel=Vector(profile["leading"][0]).lerp(Vector(profile["trailing"][0]),across)
        bs,bq=body_coordinates(*root_pixel)
        # Inherit the actual attachment depth, not the shrinking belly depth
        # below later fin sections (which folded a dark slash across the fin).
        collar=-body_depth(bs,bq)+.006
        blend=smoother(s/.38)
        depth=collar*(1-blend)+depth*blend
        thick*=blend
    if far:depth=-depth
    return screen_point(pixel,depth+thick*math.sin(theta))
def wing_weights(s,bone,parent,p=None):
    t=smoother(s/.52)
    inherited=body_weights(p.x) if p is not None and bone.startswith("Pectoral") else {parent:1}
    result={name:weight*(1-t) for name,weight in inherited.items()}
    tip=smoother((s-.38)/.62)*.78
    result[bone]=t*(1-tip);result[bone+"Tip"]=t*tip
    return {name:weight for name,weight in result.items() if weight>1e-8}
wings=[("PectoralNear","nearFin","Body",False,1),
       ("PectoralFar","nearFin","Body",True,1),
       ("FlukeFar","upperFluke","Peduncle",False,2),
       ("FlukeNear","lowerFluke","Peduncle",False,2)]
for name,key,parent,far,region in wings:
    profile=reference[key]
    ring_mesh("MobileWhale_"+name,64,28,
        lambda s,t,p=profile,f=far:wing_point(p,s,t,f),
        lambda s,p,n=name,b=parent:wing_weights(s,n,b,p),flow_region=region,bridge=region==1)
arm=bpy.data.armatures.new("MobileWhaleRig")
rig=bpy.data.objects.new("MobileWhaleRig",arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
specs=[
    ("Body",(-3.5,0,-.3),(-.3,0,.3),None),
    ("Tail01",(-.3,0,.3),(1.0,0,.4),"Body"),
    ("Tail02",(1.0,0,.4),(2.0,0,.65),"Tail01"),
    ("Tail03",(2.0,0,.65),(2.8,0,.76),"Tail02"),
    ("Peduncle",(2.8,0,.76),(3.2,0,.8),"Tail03"),
    ("PectoralNear",(-1.05,-1.05,-.68),(1.2,-1.55,-1.76),"Body"),
    ("PectoralFar",(-1.05,1.05,-.68),(1.2,1.55,-1.76),"Body"),
    ("FlukeNear",(2.81,0,.76),(4.73,-.43,-.06),"Peduncle"),
    ("FlukeFar",(2.81,0,.76),(3.65,-.30,2.02),"Peduncle")]
for name,key,parent,far,region in wings:
    profile=reference[key]
    head=wing_point(profile,.53,math.pi*.5,far)
    tail=wing_point(profile,.96,math.pi*.5,far)
        # Root hinges follow the horizontal fan, not the old vertical tail silhouette.
    if name.startswith("Fluke"):
        at=next(i for i,spec in enumerate(specs) if spec[0]==name)
        specs[at]=(name,Vector((3.03,0,.76)),head,parent)
    specs.append((name+"Tip",head,tail,name))
for name,head,tail,parent in specs:
    bone=arm.edit_bones.new(name);bone.head=head;bone.tail=tail
    if parent:bone.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT");rig.select_set(False)
for obj in meshes:
    for name,_,_,_ in specs:obj.vertex_groups.new(name=name)
    for index,weights in enumerate(weights_by_mesh[obj.name]):
        for name,weight in weights.items():
            if weight>0:obj.vertex_groups[name].add([index],weight,"REPLACE")
    modifier=obj.modifiers.new("Swim deformation","ARMATURE");modifier.object=rig
    obj.parent=rig

rig.animation_data_create()
action=bpy.data.actions.new("MobileWhale_CalmSwim");rig.animation_data.action=action
for frame in range(1,146,3):
    phase=(frame-1)/144*math.tau
    for index,(name,_,_,_) in enumerate(specs):
        bone=rig.pose.bones[name];bone.rotation_mode="QUATERNION"
        if name=="Body":axis=Vector((1,0,0));angle=math.radians(.32)*math.sin(phase)
        elif name.startswith("Pectoral"):
            sign=-1 if "Near" in name else 1
            tip=name.endswith("Tip");lag=.55 if tip else .1
            beat=math.sin(phase-lag)+.12*math.sin(2*(phase-lag))
            axis=Vector((1,.16,0));angle=sign*math.radians(6.2 if tip else 5.8)*beat
        elif name.startswith("Fluke"):
            sign=-1 if "Near" in name else 1
            tip=name.endswith("Tip");lag=1.45 if tip else .95
            axis=Vector((1,.20,0));angle=sign*math.radians(21 if tip else 9.5)*math.sin(phase-lag)
        else:
            amplitude,lag={"Tail01":(1.1,.1),"Tail02":(1.8,.32),"Tail03":(2.4,.58),"Peduncle":(2.6,.82)}[name]
            axis=Vector((0,1,.10));angle=math.radians(amplitude)*(math.sin(phase-lag)+.09*math.sin(2*(phase-lag)))
        axis=arm.bones[name].matrix_local.to_3x3().inverted()@axis
        bone.rotation_quaternion=Quaternion(axis.normalized(),angle)
        bone.keyframe_insert("rotation_quaternion",frame=frame,group=name)
    # At most 2.8 reference pixels laterally; no scene/camera repositioning.
    rig.location=(.028*math.sin(phase),.010*math.sin(phase),.012*math.sin(phase*2))
    rig.keyframe_insert("location",frame=frame,group="Gentle suspension")
for fcurve in action.fcurves:
    for key in fcurve.keyframe_points:key.interpolation="BEZIER";key.handle_left_type=key.handle_right_type="AUTO_CLAMPED"
scene.frame_set(1)

# Authoring material makes the geometry easy to inspect in Blender.
clay=bpy.data.materials.new("Whale midnight clay");clay.diffuse_color=(.045,.15,.22,1);clay.use_nodes=True
bsdf=clay.node_tree.nodes.get("Principled BSDF");bsdf.inputs["Base Color"].default_value=(.035,.14,.20,1);bsdf.inputs["Roughness"].default_value=.40
for obj in meshes:obj.data.materials.append(clay)
# One closed, invisible authoring surface owns occlusion and the shared rig.
for obj in bpy.context.selected_objects:obj.select_set(False)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
meshes=[body]
subdivision=body.modifiers.new("Authoring surface polish","SUBSURF")
subdivision.levels=1;subdivision.render_levels=2
subdivision.show_viewport=False;subdivision.show_render=False
rig["createdFrom"]="Sculpted from the supplied 1219 x 679 creature contours and flow-line landmarks."
rig["webMaterial"]="src/three/scenes/home/mobileWhale/mobileWhaleMaterial.js"
rig["loopSeconds"]=6
emitters=[]
for i in range(16):
    s=.10+i*.052;p=surface(s,.98,-1,.013)
    emitters.append({"position":[p.x,p.z,-p.y],"weights":body_weights(p.x)})
for name,key,parent,far,region in wings:
    if far:continue
    for i in range(8):
        s=.18+i*.105;p=wing_point(reference[key],s,0 if i%2 else math.pi)
        emitters.append({"position":[p.x,p.z,-p.y],"weights":wing_weights(s,name,parent,p)})
rig["wakeEmitters"]=json.dumps(emitters)
# Y-up crop for portrait. Desktop uses the complete sampled swim envelope.
rig["referenceHeadBounds"]=[-4.51,-1.80,-1.7,.25,1.46,1.7]

for obj in bpy.context.selected_objects:obj.select_set(False)
rig.select_set(True)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
OUT.parent.mkdir(parents=True,exist_ok=True)
settings=dict(filepath=str(OUT),export_format="GLB",use_selection=True,export_animations=True,
    export_frame_range=True,export_force_sampling=True,export_anim_single_armature=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=14,
    export_extras=True,export_cameras=False,export_lights=False)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k:v for k,v in settings.items() if k in valid})
sys.path.insert(0,str(HERE))
from surfaceParticles import build_surface_particles
cloud=build_surface_particles(reference,surface,on_body,body_coordinates,body_weights,wing_point,wing_weights,wings)
(REVIEW/"particles.json").write_text(json.dumps(cloud))
subprocess.run(["node",str(HERE/"packParticles.mjs"),str(OUT),str(REVIEW/"particles.json")],check=True)
vertices=[(cloud["position"][i],-cloud["position"][i+2],cloud["position"][i+1]) for i in range(0,len(cloud["position"]),3)]
data=bpy.data.meshes.new("Surface particle positions");data.from_pydata(vertices,[],[]);data.update()
point_object=bpy.data.objects.new("Visible surface particles",data);scene.collection.objects.link(point_object)
point_object.parent=rig;point_object.hide_render=True
for name,_,_,_ in specs:point_object.vertex_groups.new(name=name)
for i,skin in enumerate(cloud["weights"]):
    for name,weight in skin.items():
        if weight>0:point_object.vertex_groups[name].add([i],weight,"REPLACE")
point_object.modifiers.new("Shared swimming motion","ARMATURE").object=rig
rig["particleFormat"]="continuous-surface-currents-v1"

# Save a useful editable studio view alongside the rig and its swim action.
for obj in bpy.context.selected_objects:obj.select_set(False)
bpy.ops.object.camera_add(location=(0,-18,0))
camera=bpy.context.object;camera.name="Silhouette review"
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO";camera.data.ortho_scale=10.7;scene.camera=camera
for name,loc,power,size in [("Key",(-4,-6,9),1800,8),("Rim",(4,3,6),2200,6),("Fill",(-4,2,3),800,6)]:
    data=bpy.data.lights.new(name,"AREA");data.energy=power;data.shape="DISK";data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat("-Z","Y").to_euler()
scene.world=bpy.data.worlds.new("Deep space");scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.001,.003,.008,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value=.25
scene.render.engine="BLENDER_EEVEE_NEXT"
scene.render.resolution_x=1200;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG";scene.render.filepath=str(REVIEW/"anatomy.png")
scene.view_settings.view_transform="AgX"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"MobileWhale.blend"))
bpy.ops.render.render(write_still=True)
print("MOBILE_WHALE",json.dumps({"vertices":sum(len(o.data.vertices) for o in meshes),"bones":len(specs),"duration":6,"glbBytes":OUT.stat().st_size,"blend":str(HERE/"MobileWhale.blend")}))

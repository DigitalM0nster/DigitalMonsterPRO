"""Author a new, rigged mobile whale. No imported whale geometry.
Blender 4.2: blender --background --factory-startup --python this_file.py
Produces an editable .blend, animated GLB and a clay silhouette review.
The site's mobileWhaleMaterial.js supplies the final moving light treatment.
"""
import bpy
import math
import json
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
    # Catmull-Rom interpolation through deliberate anatomical landmarks.
    k = next((i for i in range(len(keys)-1) if keys[i+1][0] >= t), len(keys)-2)
    u = max(0, min(1, (t-keys[k][0])/(keys[k+1][0]-keys[k][0])))
    a,b,c,d = keys[max(0,k-1)],keys[k],keys[k+1],keys[min(len(keys)-1,k+2)]
    return [0.5*((2*b[j])+(-a[j]+c[j])*u+(2*a[j]-5*b[j]+4*c[j]-d[j])*u*u+(-a[j]+3*b[j]-3*c[j]+d[j])*u*u*u) for j in range(1,len(b))]

body_profile = [
    (-4.5,.07,.09,.02),(-4.40,.30,.22,.01),(-4.15,.54,.40,.04),(-4.05,.58,.44,.07),
    (-3.55,.76,.68,.12),(-2.85,.83,.82,.12),(-2.05,.81,.87,.10),
    (-1.1,.70,.74,.12),(0,.53,.55,.17),(1,.35,.38,.26),
    (2,.23,.25,.38),(3,.15,.16,.56),(3.8,.16,.12,.67),(4.0,.09,.08,.68)]

meshes = []
weights_by_mesh = {}
def ring_mesh(name, rings, sides, sample, weights, line_scale=(1,1)):
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
        for loop,uv in zip(polygon.loop_indices,coords):layer.data[loop].uv=(uv[0]*line_scale[0],uv[1]*line_scale[1])
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT");bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    weights_by_mesh[obj.name]=[weights(i//sides/rings,Vector(p)) for i,p in enumerate(verts)]
    meshes.append(obj)
    return obj

spine_centers=[(-2.7,"Body"),(-.2,"Tail01"),(1.3,"Tail02"),(2.7,"Tail03"),(3.8,"Peduncle")]
def body_weights(x):
    if x<=spine_centers[0][0]:return {"Body":1}
    for (a,an),(b,bn) in zip(spine_centers,spine_centers[1:]):
        if x<=b:
            t=(x-a)/(b-a);t=t*t*(3-2*t)
            return {an:1-t,bn:t}
    return {"Peduncle":1}
def body_point(s,theta):
    x=-4.5+8.5*s
    w,h,z=smooth_profile(body_profile,x)
    # Broad calm forehead, a shallow ventral keel; no teeth or facial knobs.
    y=max(.008,w)*math.cos(theta)
    zz=z+max(.008,h)*math.sin(theta)
    # Subtle ventral pleats sculpt the throat without adding facial lumps.
    throat=max(0,math.sin(math.pi*max(0,min(1,(x+4.25)/3.35))))
    lower=max(0,-math.sin(theta))**3
    zz-=.012*throat*lower*(.5+.5*math.cos(theta*18))
    return (x,y,zz)
body=ring_mesh("MobileWhale_Body",128,80,body_point,lambda s,p:body_weights(p.x))

fin_profile=[(0,-2.12,.68,-.18,.16,.065),(.17,-1.93,1.05,-.26,.35,.06),
    (.42,-1.45,1.70,-.48,.32,.038),(.70,-.80,2.35,-.79,.20,.026),
    (.90,-.28,2.74,-.93,.09,.014),(1,-.08,2.86,-.90,.008,.005)]
for side,label in [(-1,"Near"),(1,"Far")]:
    def point(s,theta,side=side):
        x,y,z,chord,thick=smooth_profile(fin_profile,s)
        return (x+chord*math.cos(theta),side*y,z+thick*math.sin(theta))
    def weights(s,p,label=label):
        fin=min(1,s/.18)
        return {"Body":1-fin,"Pectoral"+label:fin}
    ring_mesh("MobileWhale_Pectoral"+label,52,24,point,weights,(.44,.34))

fluke_profile=[(0,3.83,0,.68,.18,.095),(.20,4.00,.40,.69,.40,.095),
    (.45,4.12,.93,.74,.45,.07),(.72,4.36,1.49,.82,.29,.04),
    (.92,4.63,1.87,.94,.11,.02),(1,4.76,2.04,1.03,.008,.004)]
for side,label in [(-1,"Near"),(1,"Far")]:
    def point(s,theta,side=side):
        x,y,z,chord,thick=smooth_profile(fluke_profile,s)
        return (x+chord*math.cos(theta),side*y,z+thick*math.sin(theta))
    def weights(s,p,label=label):
        wing=min(1,s/.35)
        return {"Peduncle":1-wing,"Fluke"+label:wing}
    ring_mesh("MobileWhale_Fluke"+label,44,24,point,weights,(.32,.30))

def dorsal_point(s,theta):
    x=.60+.48*s
    chord=.38*(1-s)**1.5+.002
    return (x+chord*math.cos(theta),(.07*(1-s)+.003)*math.sin(theta),.72+.38*s)
ring_mesh("MobileWhale_Dorsal",20,20,dorsal_point,lambda s,p:body_weights(p.x),(.16,.18))

def detail_curve(name, coords, radius):
    curve=bpy.data.curves.new(name,"CURVE");curve.dimensions="3D";curve.resolution_u=16
    curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new("BEZIER");spline.bezier_points.add(len(coords)-1)
    for p,co in zip(spline.bezier_points,coords):
        p.co=co;p.handle_left_type=p.handle_right_type="AUTO"
    obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target="MESH");obj.select_set(False)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    meshes.append(obj);weights_by_mesh[obj.name]=[body_weights(v.co.x) for v in obj.data.vertices]
    return obj
for side,label in [(-1,"Near"),(1,"Far")]:
    # The mouth is a quiet closed contour, with a short upward turn at its end.
    mouth=[]
    for x in [-4.42,-4.2,-3.95,-3.65,-3.35,-3.03,-2.78]:
        w,h,z=smooth_profile(body_profile,x)
        theta=-.23-.17*math.sin((x+4.42)/1.64*math.pi)
        mouth.append((x,side*(w+.010)*math.cos(theta),z+h*math.sin(theta)))
    detail_curve("MobileWhale_Mouth"+label,mouth,.009)
    x=-3.08;w,h,z=smooth_profile(body_profile,x)
    # Small lateral eyes follow the surface; they do not dominate the expression.
    y=side*w*.985;z=z+h*.19
    eye=detail_curve("MobileWhale_Eye"+label,[
        (x-.045*math.cos(a),y+side*.006,z+.036*math.sin(a))
        for a in [i*math.tau/12 for i in range(13)]],.006)

arm=bpy.data.armatures.new("MobileWhaleRig")
rig=bpy.data.objects.new("MobileWhaleRig",arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
specs=[
    ("Body",(-3.5,0,.10),(-.8,0,.15),None),
    ("Tail01",(-.8,0,.15),(.6,0,.23),"Body"),
    ("Tail02",(.6,0,.23),(2,0,.38),"Tail01"),
    ("Tail03",(2,0,.38),(3.2,0,.58),"Tail02"),
    ("Peduncle",(3.2,0,.58),(4.1,0,.69),"Tail03"),
    ("PectoralNear",(-2.12,-.68,-.18),(-.08,-2.86,-.9),"Body"),
    ("PectoralFar",(-2.12,.68,-.18),(-.08,2.86,-.9),"Body"),
    ("FlukeNear",(3.83,0,.68),(4.42,-2.04,1.03),"Peduncle"),
    ("FlukeFar",(3.83,0,.68),(4.42,2.04,1.03),"Peduncle")]
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
for frame in range(1,146,6):
    phase=(frame-1)/144*math.tau
    for index,(name,_,_,_) in enumerate(specs):
        bone=rig.pose.bones[name];bone.rotation_mode="QUATERNION"
        if name=="Body":axis=Vector((0,1,0));angle=math.radians(.55)*math.sin(phase)
        elif name.startswith("Pectoral"):
            sign=-1 if name.endswith("Near") else 1
            axis=Vector((1,0,0));angle=sign*math.radians(5)*math.sin(phase-.8)
        elif name.startswith("Fluke"):
            sign=-1 if name.endswith("Near") else 1
            axis=Vector((1,0,0));angle=sign*math.radians(3)*math.sin(phase-1.6)
        else:
            axis=Vector((0,1,0));angle=math.radians([0,2.3,3.4,4.5,5.0][index])*math.sin(phase-index*.35)
        axis=arm.bones[name].matrix_local.to_3x3().inverted()@axis
        bone.rotation_quaternion=Quaternion(axis,angle)
        bone.keyframe_insert("rotation_quaternion",frame=frame,group=name)
for fcurve in action.fcurves:
    for key in fcurve.keyframe_points:key.interpolation="BEZIER";key.handle_left_type=key.handle_right_type="AUTO_CLAMPED"
scene.frame_set(1)

# Authoring material makes the geometry easy to inspect in Blender.
clay=bpy.data.materials.new("Whale midnight clay");clay.diffuse_color=(.045,.15,.22,1);clay.use_nodes=True
bsdf=clay.node_tree.nodes.get("Principled BSDF");bsdf.inputs["Base Color"].default_value=(.035,.14,.20,1);bsdf.inputs["Roughness"].default_value=.40
detail=bpy.data.materials.new("Fine facial contours");detail.diffuse_color=(.03,.4,.62,1)
for obj in meshes:obj.data.materials.append(detail if "Mouth" in obj.name or "Eye" in obj.name else clay)
# One skinned body with two material groups instead of a draw per fin/detail.
for obj in bpy.context.selected_objects:obj.select_set(False)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
meshes=[body]
subdivision=body.modifiers.new("Authoring surface polish","SUBSURF")
subdivision.levels=1;subdivision.render_levels=2
subdivision.show_viewport=False;subdivision.show_render=False
rig["createdFrom"]="Original parametric anatomy; no source whale mesh."
rig["webMaterial"]="src/three/scenes/home/mobileWhale/mobileWhaleMaterial.js"
rig["loopSeconds"]=6

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

# Save a useful editable studio view alongside the rig and its swim action.
for obj in bpy.context.selected_objects:obj.select_set(False)
bpy.ops.object.camera_add(location=(-.5,-16,7))
camera=bpy.context.object;camera.name="Silhouette review"
camera.rotation_euler=(Vector((-.1,0,.1))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO";camera.data.ortho_scale=11.5;scene.camera=camera
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

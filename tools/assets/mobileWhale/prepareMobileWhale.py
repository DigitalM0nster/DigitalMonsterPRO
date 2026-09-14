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
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "public/models/home/whale-mobile.glb"
REVIEW = ROOT / "output/mobile-whale"
REVIEW.mkdir(parents=True, exist_ok=True)
STAGED = REVIEW / "whale-prepared.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 145

def smooth_profile(keys, t):
    # Derivatives use real knot spacing: unequal landmark spacing must not
    # produce the old visible corners at the chin and at the fin shoulder.
    k = next((i for i in range(len(keys)-1) if keys[i+1][0] >= t), len(keys)-2)
    u = max(0, min(1, (t-keys[k][0])/(keys[k+1][0]-keys[k][0])))
    a,b,c,d = keys[max(0,k-1)],keys[k],keys[k+1],keys[min(len(keys)-1,k+2)]
    h=c[0]-b[0]
    return [(2*u**3-3*u*u+1)*b[j]+(u**3-2*u*u+u)*h*(c[j]-a[j])/(c[0]-a[0])
        +(-2*u**3+3*u*u)*c[j]+(u**3-u*u)*h*(d[j]-b[j])/(d[0]-b[0]) for j in range(1,len(b))]

meshes = []
weights_by_mesh = {}
def ring_mesh(name, rings, sides, sample, weights, line_scale=(1,1), flow_region=0):
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

# The envelope supplies depth and rigging only. Visible geometry is recovered
# from clean-reference filament ridges, independent of the user's pen strokes.
def screen_point(pixel,depth=0):
    return Vector(((pixel[0]-700)/100,depth,(450-pixel[1])/100))
def traced_path(points,s):
    return smooth_profile([(i/(len(points)-1),*p) for i,p in enumerate(points)],s)
spine_centers=[(-2.1,"Body"),(.1,"Tail01"),(1.55,"Tail02"),(2.35,"Tail03"),(3.05,"Peduncle")]
def body_weights(x):
    if x<=spine_centers[0][0]:return {"Body":1}
    for (a,an),(b,bn) in zip(spine_centers,spine_centers[1:]):
        if x<=b:
            t=(x-a)/(b-a);t=t*t*(3-2*t)
            return {an:1-t,bn:t}
    return {"Peduncle":1}
sys.path.insert(0,str(HERE))
from creatureSurface import CreatureSurface
filament_data=json.loads((HERE/"referenceFilamentPaths.json").read_text(encoding="utf-8"))
model=CreatureSurface(reference,smooth_profile,body_weights,filament_data)
# Skin and points use exactly the same three-dimensional surface and weights.
def surface_weights(s,p):
    x,y=p.x*100+700,450-p.z*100
    candidates=[model._field(x,y,side) for side in [-1,1]]
    return min(candidates,key=lambda sample:abs(sample[0]-p.y))[1]
body=ring_mesh("MobileWhale_Body",180,100,model.body_point,surface_weights)

def wing_weights(s,bone,parent):
    t=min(1,s/.30);t=t*t*(3-2*t)
    return {parent:1-t,bone:t}
wings=[("PectoralNear","nearFin","Body",False,1),
       ("PectoralFar","nearFin","Body",True,1),
       ("FlukeFar","upperFluke","Peduncle",False,2),
       ("FlukeNear","lowerFluke","Peduncle",False,2)]
for name,key,parent,far,region in wings:
    profile=reference[key]
    ring_mesh("MobileWhale_"+name,64,28,
        lambda s,t,p=profile,f=far:model.wing_point(p,s,t,f),
        surface_weights,flow_region=region)
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
            axis=Vector((1,0,0));angle=sign*math.radians(5)*math.sin(phase)*(.7+.3*math.cos(phase-.8))
        elif name.startswith("Fluke"):
            sign=-1 if name.endswith("Near") else 1
            axis=Vector((1,0,0));angle=sign*math.radians(3)*math.sin(phase)*(.7+.3*math.cos(phase-1.6))
        else:
            axis=Vector((0,1,0));angle=math.radians([0,2.3,3.4,4.5,5.0][index])*math.sin(phase)*(.7+.3*math.cos(phase-index*.35))
        axis=arm.bones[name].matrix_local.to_3x3().inverted()@axis
        bone.rotation_quaternion=Quaternion(axis,angle)
        bone.keyframe_insert("rotation_quaternion",frame=frame,group=name)
for fcurve in action.fcurves:
    for key in fcurve.keyframe_points:key.interpolation="BEZIER";key.handle_left_type=key.handle_right_type="AUTO_CLAMPED"
scene.frame_set(1)

# Authoring material makes the geometry easy to inspect in Blender.
clay=bpy.data.materials.new("Whale midnight clay");clay.diffuse_color=(.045,.15,.22,1);clay.use_nodes=True
bsdf=clay.node_tree.nodes.get("Principled BSDF");bsdf.inputs["Base Color"].default_value=(.035,.14,.20,1);bsdf.inputs["Roughness"].default_value=.40
for obj in meshes:obj.data.materials.append(clay)
# One hidden authoring envelope; all visible features belong to the point cloud.
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
# Y-up crop for portrait. Desktop uses the complete sampled swim envelope.
rig["referenceHeadBounds"]=[-4.51,-1.80,-1.7,.25,1.46,1.7]

for obj in bpy.context.selected_objects:obj.select_set(False)
rig.select_set(True)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
OUT.parent.mkdir(parents=True,exist_ok=True)
settings=dict(filepath=str(STAGED),export_format="GLB",use_selection=True,export_animations=True,
    export_frame_range=True,export_force_sampling=True,export_anim_single_armature=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=14,
    export_extras=True,export_cameras=False,export_lights=False)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k:v for k,v in settings.items() if k in valid})

# Visible anatomy is a spatial, skinned point cloud. Keep the clay skin as the
# editable authoring envelope and as a hidden source of runtime swim bounds.
sys.path.insert(0,str(HERE))
from anatomicalParticles import build_particles
cloud=build_particles(model,reference,smooth_profile)
(REVIEW/"particles.json").write_text(json.dumps(cloud,separators=(",",":")))
subprocess.run(["node",str(HERE/"packParticles.mjs"),str(STAGED),str(REVIEW/"particles.json")],check=True)
# Readers see either complete version, never the intermediate envelope-only GLB.
STAGED.replace(OUT)

# Store the exact visible cloud in the editable master too. Loose vertices stay
# inexpensive in Blender; the website supplies their circular light profile.
vertices=[(cloud["position"][i],-cloud["position"][i+2],cloud["position"][i+1]) for i in range(0,len(cloud["position"]),3)]
data=bpy.data.meshes.new("Anatomical particle positions");data.from_pydata(vertices,[],[]);data.update()
point_object=bpy.data.objects.new("Visible anatomical particles",data);scene.collection.objects.link(point_object)
point_object.parent=rig;point_object.hide_render=True
for name,_,_,_ in specs:point_object.vertex_groups.new(name=name)
for i,skin in enumerate(cloud["weights"]):
    for name,weight in skin.items():
        if weight>0:point_object.vertex_groups[name].add([i],weight,"REPLACE")
point_object.modifiers.new("Shared swim rig","ARMATURE").object=rig
point_object["webRendering"]="Real GPU Points. No surface textures, star cards or opaque depth mesh."

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

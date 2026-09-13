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
    (-4.7,.13,.14,-.26),(-4.62,.40,.23,-.25),(-4.40,.69,.32,-.21),
    (-4.0,.94,.49,-.075),(-3.50,1.10,.71,.10),(-2.80,1.22,.91,.26),
    (-2.0,1.20,1.02,.38),(-1.0,1.10,1.05,.47),(0,.89,.86,.47),
    (1.2,.60,.61,.44),(2.2,.34,.35,.45),(3.1,.20,.20,.57),
    (3.8,.17,.13,.67),(4.0,.09,.08,.68)]

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

spine_centers=[(-2.7,"Body"),(-.2,"Tail01"),(1.3,"Tail02"),(2.7,"Tail03"),(3.8,"Peduncle")]
def body_weights(x):
    if x<=spine_centers[0][0]:return {"Body":1}
    for (a,an),(b,bn) in zip(spine_centers,spine_centers[1:]):
        if x<=b:
            t=(x-a)/(b-a);t=t*t*(3-2*t)
            return {an:1-t,bn:t}
    return {"Peduncle":1}
def face_latitude(x,latitude,h,z):
    # The lip is an anatomical landmark, not the equator of an ellipsoid.
    # Monotone cubic mapping carries complete rows along the jaw and cheek.
    s=max(0,min(1,(x+4.65)/2.95))
    lip_z=-.285-.035*math.sin(s*math.pi)+.18*s**4
    mouth=math.asin(max(-.85,min(.65,(lip_z-z)/max(h,.05))))
    face=math.exp(-((x+3.25)/2.05)**6)
    targets=[-math.pi/2,-.25+(mouth+.25)*face,.25+(.08-.25)*face,math.pi/2]
    keys=[-math.pi/2,-.25,.25,math.pi/2]
    slopes=[(targets[i+1]-targets[i])/(keys[i+1]-keys[i]) for i in range(3)]
    tangents=[slopes[0],2*slopes[0]*slopes[1]/(slopes[0]+slopes[1]),2*slopes[1]*slopes[2]/(slopes[1]+slopes[2]),slopes[2]]
    i=next((i for i in range(3) if latitude<=keys[i+1]),2)
    length=keys[i+1]-keys[i];t=max(0,min(1,(latitude-keys[i])/length))
    return ((2*t**3-3*t*t+1)*targets[i]+(t**3-2*t*t+t)*length*tangents[i]
        +(-2*t**3+3*t*t)*targets[i+1]+(t**3-t*t)*length*tangents[i+1])

def body_point(s,theta):
    x=-4.7+8.7*s
    w,h,z=smooth_profile(body_profile,x)
    # Broad calm forehead, a shallow ventral keel; no teeth or facial knobs.
    # Flow lines follow the jaw and divide around the eye socket. These UV
    # streamlines are authored with the anatomy, not a random surface scatter.
    latitude=math.atan2(math.sin(theta),abs(math.cos(theta)))
    eye_distance=latitude-.25
    eye_diversion=.03*math.exp(-((x+2.42)/.65)**2)*math.tanh(eye_distance/.08)*math.exp(-(eye_distance/.38)**2)
    latitude=face_latitude(x,latitude+eye_diversion,h,z)
    y=max(.008,w)*math.copysign(math.cos(latitude),math.cos(theta))
    zz=z+max(.008,h)*math.sin(latitude)
    # Subtle ventral pleats sculpt the throat without adding facial lumps.
    throat=max(0,math.sin(math.pi*max(0,min(1,(x+4.25)/3.35))))
    lower=max(0,-math.sin(theta))**3
    zz-=.018*throat*lower*(.5+.5*math.cos(theta*18))
    return (x,y,zz)
body=ring_mesh("MobileWhale_Body",128,80,body_point,lambda s,p:body_weights(p.x))

fin_profile=[(0,-1.85,1.06,-.12,.43,.095),(.18,-1.63,1.62,-.24,.62,.085),
    (.40,-1.04,2.32,-.53,.59,.060),(.66,-.25,3.10,-.92,.41,.036),
    (.86,.46,3.63,-1.08,.21,.019),(1,1.08,3.90,-1.04,.010,.005)]
for side,label in [(-1,"Near"),(1,"Far")]:
    def point(s,theta,side=side):
        x,y,z,chord,thick=smooth_profile(fin_profile,s)
        return (x+chord*math.cos(theta),side*y,z+thick*math.sin(theta))
    def weights(s,p,label=label):
        fin=min(1,s/.18)
        return {"Body":1-fin,"Pectoral"+label:fin}
    ring_mesh("MobileWhale_Pectoral"+label,52,24,point,weights,flow_region=1)

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
    ring_mesh("MobileWhale_Fluke"+label,44,24,point,weights,flow_region=2)

def dorsal_point(s,theta):
    x=.60+.48*s
    chord=.38*(1-s)**1.5+.002
    return (x+chord*math.cos(theta),(.07*(1-s)+.003)*math.sin(theta),.72+.38*s)
ring_mesh("MobileWhale_Dorsal",20,20,dorsal_point,lambda s,p:body_weights(p.x),flow_region=3)

def detail_curve(name, path, radius, kind=0, rings=96, skin=None):
    # Arc-length UVs make the lip/eyelid/fin contour a chain of distinct beads.
    # Each contour shares the body's rig and the same second material group.
    centers=[Vector(path(i/rings)) for i in range(rings+1)]
    arc=[0.]
    for a,b in zip(centers,centers[1:]):arc.append(arc[-1]+(b-a).length)
    def point(s,theta):
        i=min(rings,round(s*rings))
        tangent=(centers[min(rings,i+1)]-centers[max(0,i-1)]).normalized()
        helper=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
        normal=tangent.cross(helper).normalized();binormal=tangent.cross(normal).normalized()
        taper=.6+.4*math.sin(math.pi*s)**.3
        return centers[i]+radius*taper*(normal*math.cos(theta)+binormal*math.sin(theta))
    obj=ring_mesh(name,rings,6,point,skin or (lambda s,p:body_weights(p.x)),flow_region=kind)
    uv=obj.data.uv_layers.active.data
    for polygon in obj.data.polygons:
        for loop in polygon.loop_indices:
            uv[loop].uv.x=arc[min(rings,round(uv[loop].uv.x*rings))]
    obj["flowDetail"]=True
    return obj
for side,label in [(-1,"Near"),(1,"Far")]:
    def surface(x,latitude,side=side,lift=.012):
        theta=latitude if side>0 else math.pi-latitude
        p=Vector(body_point((x+4.7)/8.7,theta));p.y+=side*lift
        return p
    def lip(s,lower=False):
        x=-4.65+s*2.95
        latitude=-.25
        if lower:latitude-=.052*math.sin(math.pi*s)
        return surface(x,latitude)
    detail_curve("MobileWhale_Mouth"+label,lip,.012)
    detail_curve("MobileWhale_LowerLip"+label,lambda s:lip(s,True),.0065,kind=1)
    # A dark socket is reserved in the body field; a bright upper eyelid and
    # quieter lower lid outline the eye without turning it into a white bead.
    def eyelid(s):
        a=s*math.tau
        return surface(-2.42+.065*math.cos(a),.25+.024*math.sin(a),lift=.015)
    detail_curve("MobileWhale_Eye"+label,eyelid,.005,kind=2,rings=40)
    # Three restrained ridges over the brow lead into the head flow.
    for ridge in range(3):
        detail_curve("MobileWhale_Brow"+label+str(ridge),
            lambda s,r=ridge:surface(-4.52+s*(1.8+r*.3),.44+r*.20+.08*math.sin(s*math.pi)),
            .005,kind=3,rings=72)
    for edge in [-1,1]:
        def fin_edge(s,edge=edge,side=side):
            x,y,z,chord,thick=smooth_profile(fin_profile,.025+s*.96)
            return (x+edge*chord,side*y,z+.002)
        def fin_skin(s,p,label=label):
            fin=min(1,(.025+s*.96)/.18)
            return {"Body":1-fin,"Pectoral"+label:fin}
        detail_curve("MobileWhale_FinContour"+label+str(edge),fin_edge,
            .010 if edge<0 else .006,kind=4,rings=100,skin=fin_skin)

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
    ("PectoralNear",(-1.85,-1.06,-.12),(1.08,-3.90,-1.04),"Body"),
    ("PectoralFar",(-1.85,1.06,-.12),(1.08,3.90,-1.04),"Body"),
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
for obj in meshes:obj.data.materials.append(detail if obj.get("flowDetail") else clay)
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
# Y-up coordinates, in unscaled glTF model units. The reference is a head/fin
# close-up, so framing must not shrink the face to fit the entire tail spread.
rig["referenceHeadBounds"]=[-4.74,-.85,-1.3,-1.3,1.65,1.3]

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

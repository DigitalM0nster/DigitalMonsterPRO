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
def screen_point(pixel,depth=0):
    return Vector(((pixel[0]-700)/100,depth,(450-pixel[1])/100))
def traced_path(points,s):
    return smooth_profile([(i/(len(points)-1),*p) for i,p in enumerate(points)],s)
def body_screen(s,q):
    # Resample all traced rows at a common X, then interpolate monotonically
    # across them. A free Coons patch folds where the saddle rows converge.
    x=249+761*s
    values=[smooth_profile(r["points"],x)[0] for r in rows]
    gap=max(.005,(values[0]-values[-1])*.001)
    for i in range(len(values)-2,-1,-1):values[i]=max(values[i],values[i+1]+gap)
    qs=[r["latitude"] for r in rows]
    slopes=[(values[i+1]-values[i])/(qs[i+1]-qs[i]) for i in range(len(qs)-1)]
    tangent=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]):tangent.append(2*a*b/(a+b) if a*b>0 else 0)
    tangent.append(slopes[-1])
    i=next((i for i in range(len(qs)-1) if q<=qs[i+1]),len(qs)-2)
    h=qs[i+1]-qs[i];t=max(0,min(1,(q-qs[i])/h))
    y=(2*t**3-3*t*t+1)*values[i]+(t**3-2*t*t+t)*h*tangent[i]+(-2*t**3+3*t*t)*values[i+1]+(t**3-t*t)*h*tangent[i+1]
    p=[x,y]
    # A rounded nose has a short vertical front arc, not a cone apex.
    nose=math.exp(-(s/.055)**2)
    p[0]+=3*q*q*nose
    p[1]-=13*q*nose
    return p
def body_depth(s,q):
    width=(.12+1.08*math.sin(math.pi*s)**.62)*(1-.38*s)
    return width*math.sqrt(max(0,1-q*q))
def surface(s,q,side=-1,lift=0):
    return screen_point(body_screen(s,q),side*(body_depth(s,q)+lift))
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
    a=Vector(traced_path(profile["leading"],s));b=Vector(traced_path(profile["trailing"],s))
    across=(math.cos(theta)+1)*.5
    pixel=a.lerp(b,across)
    depth=traced_path([[d] for d in profile["depth"]],s)[0]
    thick=.045*math.sin(math.pi*s)**.4+.003
    if far:depth=-depth
    return screen_point(pixel,depth+thick*math.sin(theta))
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
        lambda s,t,p=profile,f=far:wing_point(p,s,t,f),
        lambda s,p,n=name,b=parent:wing_weights(s,n,b),flow_region=region)
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
# Curves are skinned once offline and share a single contour material. Semantic
# UV bands identify mouth / eye / ridge / rim / glint / detached filament.
def mouth_point(t,side):
    p=flow_surface(.016+t*.437,-.30,side,.008)
    end=wing_point(reference["nearFin"],0,math.pi,side>0)
    correction=end-flow_surface(.453,-.30,side,.008)
    join=max(0,min(1,(t-.86)/.14));join=join*join*(3-2*join)
    return p+correction*join
for side,label in [(-1,"Near"),(1,"Far")]:
    detail_curve("MobileWhale_Mouth"+label,
        lambda t,side=side:mouth_point(t,side),.0075,rings=120)
    # One asymmetric upper lid, never a circular glowing cartoon eye.
    detail_curve("MobileWhale_Eye"+label,
        lambda t,side=side:flow_surface(.365+t*.064,.32+.031*math.sin(math.pi*t),side,.018),
        .006,kind=2,rings=48)
    for ridge in range(6):
        detail_curve("MobileWhale_Brow"+label+str(ridge),
            lambda t,r=ridge,side=side:flow_surface(.035+t*(.53-r*.016),.68+r*.052+.013*math.sin(t*9+r),side,.009),
            .0035+(.001 if ridge==3 else 0),kind=3,rings=120)
    # Sparse second-order threads peel from the crest without changing silhouette.
    for strand in range(12):
        def wisp(t,r=strand,side=side):
            s=.15+t*.76;q=.84+r*.011
            p=flow_surface(s,min(.999,q),side,.015)
            p.z+=math.sin(math.pi*t)**1.3*(.06+r*.018)
            p.y+=side*math.sin(math.pi*t)*(.012+r*.008)
            return p
        detail_curve("MobileWhale_Wisp"+label+str(strand),wisp,.0015,kind=6,rings=100)

for name,key,parent,far,region in wings:
    for edge in [0,math.pi]:
        detail_curve("MobileWhale_Rim"+name+str(edge),
            lambda s,p=reference[key],a=edge,f=far:wing_point(p,.01+s*.98,a,f),
            .0045,kind=4,rings=100,
            skin=lambda s,p,n=name,b=parent:wing_weights(s,n,b))

# Soft, texture-free star nodes follow the SAME bones as their ridges. Their
# two triangles use the existing detail draw; they are not a separate rig.
def glow_patch(name,center,size,skin=None):
    x,y,z=center;verts=[(x-size/2,y-.022,z-size/2),(x+size/2,y-.022,z-size/2),
        (x+size/2,y-.022,z+size/2),(x-size/2,y-.022,z+size/2)]
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],[(0,1,2,3)]);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    uv=data.uv_layers.new(name="Flow")
    for loop,coord in zip(data.polygons[0].loop_indices,[(0,10),(1,10),(1,11),(0,11)]):uv.data[loop].uv=coord
    weights_by_mesh[obj.name]=[(skin or body_weights(x)) for _ in verts]
    obj["flowDetail"]=True;obj["glowPatch"]=True;meshes.append(obj)
for i,(s,q,size) in enumerate([(.06,.1,.42),(.13,.87,.48),(.235,.90,.58),(.39,.35,.21),
        (.45,.44,.39),(.48,.90,.48),(.50,.96,.44),(.61,.61,.53),(.60,0,.36),(.79,.80,.40),(.89,.90,.38)]):
    glow_patch("MobileWhale_Glint"+str(i),flow_surface(s,q,-1,.028),size)
for name,key,parent,far,region in wings:
    if far:continue
    for i,s in enumerate([.34,.63,.9]):
        glow_patch("MobileWhale_Glint"+name+str(i),wing_point(reference[key],s,math.pi),.28,
            skin=wing_weights(s,name,parent))
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
settings=dict(filepath=str(OUT),export_format="GLB",use_selection=True,export_animations=True,
    export_frame_range=True,export_force_sampling=True,export_anim_single_armature=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=14,
    export_extras=True,export_cameras=False,export_lights=False)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k:v for k,v in settings.items() if k in valid})

# Save a useful editable studio view alongside the rig and its swim action.
# Web-only glow cards must not appear as opaque squares in the clay studio.
# This UV mask changes authoring shading only; the exported skin has two groups.
detail.use_nodes=True
nodes=detail.node_tree.nodes;links=detail.node_tree.links
uv=nodes.new("ShaderNodeTexCoord");split=nodes.new("ShaderNodeSeparateXYZ")
links.new(uv.outputs["UV"],split.inputs[0])
above=nodes.new("ShaderNodeMath");above.operation="GREATER_THAN";above.inputs[1].default_value=9.5
below=nodes.new("ShaderNodeMath");below.operation="LESS_THAN";below.inputs[1].default_value=11.5
both=nodes.new("ShaderNodeMath");both.operation="MULTIPLY"
links.new(split.outputs["Y"],above.inputs[0]);links.new(split.outputs["Y"],below.inputs[0])
links.new(above.outputs[0],both.inputs[0]);links.new(below.outputs[0],both.inputs[1])
transparent=nodes.new("ShaderNodeBsdfTransparent");mix=nodes.new("ShaderNodeMixShader")
links.new(both.outputs[0],mix.inputs[0]);links.new(nodes.get("Principled BSDF").outputs[0],mix.inputs[1])
links.new(transparent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get("Material Output").inputs["Surface"])
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

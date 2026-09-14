"""Assemble an editable Blender scene from the provided source geometry.
Target: Blender 4.2–4.5 Python API. Syntax checked, NOT runtime-tested in Blender.
Usage (from a terminal with Blender available):
  blender --background --factory-startup --python assemble_blender.py -- --mode lookdev
Creates models/dm_creature_blockout.blend; does not overwrite without --overwrite.
No third-party Python packages, network calls, or Blender plug-ins are used.
"""
from __future__ import annotations
import argparse
import gzip
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector


def arguments() -> argparse.Namespace:
    tail=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode',choices=('clay','lookdev'),default='lookdev')
    parser.add_argument('--out',type=Path)
    parser.add_argument('--overwrite',action='store_true')
    parser.add_argument('--render-preview',action='store_true')
    return parser.parse_args(tail)


def get_root() -> Path:
    path=globals().get('__file__')
    if path: return Path(path).resolve().parent
    text=getattr(bpy.context.space_data,'text',None)
    if text and text.filepath: return Path(bpy.path.abspath(text.filepath)).resolve().parent
    raise RuntimeError('Save this script next to data/creature_source.json.gz before running it.')


def new_material(name: str, color: tuple, metallic: float=.0, rough: float=.4, emission: float=0.) -> bpy.types.Material:
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    nt=m.node_tree;nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial')
    if emission>0:
        sh=nt.nodes.new('ShaderNodeEmission');sh.inputs['Color'].default_value=(*color,1);sh.inputs['Strength'].default_value=emission
    else:
        sh=nt.nodes.new('ShaderNodeBsdfPrincipled');sh.inputs['Base Color'].default_value=(*color,1);sh.inputs['Metallic'].default_value=metallic;sh.inputs['Roughness'].default_value=rough
    nt.links.new(sh.outputs[0],out.inputs['Surface'])
    return m


def new_collection(scene: bpy.types.Scene,name: str) -> bpy.types.Collection:
    col=bpy.data.collections.new(name);scene.collection.children.link(col);return col


def add_mesh(part: dict, collection: bpy.types.Collection, material: bpy.types.Material, root: bpy.types.Object) -> bpy.types.Object:
    mesh=bpy.data.meshes.new(part['name']+'_Mesh');mesh.from_pydata(part['vertices'],[],part['faces']);mesh.update()
    obj=bpy.data.objects.new(part['name'],mesh);collection.objects.link(obj);obj.parent=root
    obj.data.materials.append(material)
    for poly in mesh.polygons:poly.use_smooth=True
    uv=part.get('uv')
    if uv:
        layer=mesh.uv_layers.new(name='SurfaceUV')
        for poly in mesh.polygons:
            indices=list(poly.loop_indices);vv=[uv[mesh.loops[i].vertex_index][1] for i in indices]
            wrap=max(vv)-min(vv)>.5
            for i in indices:
                u,v=uv[mesh.loops[i].vertex_index]
                if wrap and v<.5:v+=1
                layer.data[i].uv=(u,v)
    obj['asset_status']='APPROXIMATE BLOCKOUT: refine against references, not a final scan'
    return obj


def point_cloud(data: dict,collection: bpy.types.Collection,material: bpy.types.Material,root: bpy.types.Object) -> bpy.types.Object:
    mesh=bpy.data.meshes.new('DM_Surface_Anchors');mesh.from_pydata(data['positions'],[],[]);mesh.update()
    a=mesh.attributes.new('dm_radius','FLOAT','POINT');a.data.foreach_set('value',data['radii'])
    a=mesh.attributes.new('dm_part','INT','POINT');a.data.foreach_set('value',data['part_indices'])
    a=mesh.attributes.new('dm_uv','FLOAT_VECTOR','POINT');a.data.foreach_set('vector',[c for uv in data['uv'] for c in (*uv,0.)])
    obj=bpy.data.objects.new('FX_SurfacePoints',mesh);collection.objects.link(obj);obj.parent=root
    group=bpy.data.node_groups.new('DM_Points_Lookdev','GeometryNodeTree')
    group.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    n,l=group.nodes,group.links
    inp=n.new('NodeGroupInput');inp.location=(-700,120)
    out=n.new('NodeGroupOutput');out.location=(420,120)
    pts=n.new('GeometryNodeMeshToPoints');pts.mode='VERTICES';pts.location=(-470,160)
    radius=n.new('GeometryNodeInputNamedAttribute');radius.data_type='FLOAT';radius.inputs['Name'].default_value='dm_radius';radius.location=(-700,-150)
    sphere=n.new('GeometryNodeMeshIcoSphere');sphere.inputs['Radius'].default_value=1;sphere.inputs['Subdivisions'].default_value=1;sphere.location=(-470,-130)
    mat=n.new('GeometryNodeSetMaterial');mat.inputs['Material'].default_value=material;mat.location=(-230,-100)
    instances=n.new('GeometryNodeInstanceOnPoints');instances.location=(160,120)
    l.new(inp.outputs['Geometry'],pts.inputs['Mesh']);l.new(radius.outputs['Attribute'],pts.inputs['Radius'])
    l.new(pts.outputs['Points'],instances.inputs['Points']);l.new(sphere.outputs['Mesh'],mat.inputs['Geometry'])
    l.new(mat.outputs['Geometry'],instances.inputs['Instance']);l.new(radius.outputs['Attribute'],instances.inputs['Scale'])
    l.new(instances.outputs['Instances'],out.inputs['Geometry'])
    mod=obj.modifiers.new('Preview point instances; replace with GPU rendering for web','NODES');mod.node_group=group
    obj['purpose']='Editable source anchors. Static in this scene; not attached to a rig yet.'
    return obj


def add_paths(paths: list,kind: str,collection: bpy.types.Collection,material: bpy.types.Material,root: bpy.types.Object) -> None:
    cu=bpy.data.curves.new('DM_'+kind+'_Curves','CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=.004;cu.bevel_resolution=1;cu.use_fill_caps=True
    for path in paths:
        if path['kind']!=kind:continue
        sp=cu.splines.new('POLY');sp.points.add(len(path['points'])-1)
        for pt,co in zip(sp.points,path['points']):pt.co=(*co,1);pt.radius=path['radius']/.004
    obj=bpy.data.objects.new('FX_'+kind,cu);collection.objects.link(obj);obj.parent=root;cu.materials.append(material)
    obj['purpose']='Editable curves, separate from skin; no surface deformation binding yet.'


def look_at(obj: bpy.types.Object,target: tuple) -> None:
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def main() -> None:
    args=arguments();root_dir=get_root();src=root_dir/'data/creature_source.json.gz'
    output=(args.out or root_dir/'models/dm_creature_blockout.blend').resolve()
    if output.exists() and not args.overwrite:raise FileExistsError(f'Output exists: {output}. Use --overwrite explicitly.')
    if not src.is_file():raise FileNotFoundError(src)
    with gzip.open(src,'rt',encoding='utf-8') as f:data=json.load(f)
    # Make a new scene: do not delete objects from a currently open project.
    scene=bpy.data.scenes.new('DM_Creature_Blockout')
    if bpy.context.window:bpy.context.window.scene=scene
    geo=new_collection(scene,'01_CREATURE_GEOMETRY');fx=new_collection(scene,'02_LOOKDEV_FX');refs=new_collection(scene,'03_REFERENCE_ONLY');stage=new_collection(scene,'04_STAGE')
    master=bpy.data.objects.new('DM_CREATURE_ROOT',None);geo.objects.link(master);master.empty_display_type='PLAIN_AXES';master['forward']='-X';master['up']='+Z';master['status']='WORKING BASE, NOT FINAL LIKENESS'
    skin=new_material('DM_DarkSkin',(.003,.010,.018),.45,.40)
    clay=new_material('DM_Clay',(.24,.34,.42),.05,.46)
    eyes=new_material('DM_Eyes',(.002,.007,.012),.65,.22)
    cyan=new_material('DM_CyanEmission',(.0,.25,1.0),emission=4.)
    accent=new_material('DM_AccentEmission',(.01,.63,1.0),emission=7.)
    for part in data['parts']:
        material=eyes if 'Eye' in part['name'] else (clay if args.mode=='clay' else skin)
        add_mesh(part,geo,material,master)
    point_cloud(data['surface_points'],fx,cyan,master)
    add_paths(data['paths'],'flow',fx,cyan,master);add_paths(data['paths'],'accent',fx,accent,master)
    octa=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
    faces=[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]
    for i,p in enumerate(data['landmarks']):
        part={'name':f'FX_Landmark_{i:02}','vertices':[[p[j]+.027*v[j] for j in range(3)] for v in octa],'faces':faces,'uv':None}
        add_mesh(part,fx,accent,master)
    fx.hide_render=args.mode=='clay';fx.hide_viewport=args.mode=='clay'
    refs.hide_render=True
    for i,name in enumerate(('approved_straight_pose.png','approved_head_identity.png')):
        path=root_dir/'references'/name
        if path.exists():
            image=bpy.data.images.load(str(path),check_existing=True);image.pack()
            ob=bpy.data.objects.new('REF_'+name[:-4],None);refs.objects.link(ob);ob.empty_display_type='IMAGE';ob.data=image;ob.empty_display_size=10
            ob.location=(0,8+i*7,0);ob.rotation_euler=(math.pi/2,0,0);ob.hide_render=True
    refs.hide_viewport=True
    for filename in ('CODEX_TASK_RU.md','README_RU.md'):
        path=root_dir/filename
        if path.exists():bpy.data.texts.new(filename).write(path.read_text(encoding='utf-8'))
    world=bpy.data.worlds.new('DM_World');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.0015,.004,.009,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.25;scene.world=world
    cam_data=bpy.data.cameras.new('DM_HeroCamera');cam=bpy.data.objects.new('DM_HeroCamera',cam_data);stage.objects.link(cam)
    cam.location=(-6,-18,8);look_at(cam,(.1,0,-.05));cam_data.type='ORTHO';cam_data.ortho_scale=13.5;scene.camera=cam
    for name,pos,energy,size,color in [('Key',(-5,-8,10),1600,8,(.7,.84,1)),('Rim',(3,6,7),2200,7,(.18,.48,1)),('Fill',(-3,-5,-3),650,6,(.3,.45,.68))]:
        ld=bpy.data.lights.new('DM_'+name,'AREA');ld.energy=energy;ld.shape='DISK';ld.size=size;ld.color=color
        ob=bpy.data.objects.new('DM_'+name,ld);stage.objects.link(ob);ob.location=pos;look_at(ob,(0,0,0))
    try:scene.render.engine='BLENDER_EEVEE_NEXT'
    except (TypeError,ValueError):scene.render.engine='CYCLES';scene.cycles.samples=48
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.use_nodes=True;nodes=scene.node_tree.nodes;nodes.clear()
    layers=nodes.new('CompositorNodeRLayers');layers.scene=scene
    glow=nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.quality='HIGH';glow.threshold=1.;glow.size=7
    out=nodes.new('CompositorNodeComposite');scene.node_tree.links.new(layers.outputs['Image'],glow.inputs['Image']);scene.node_tree.links.new(glow.outputs['Image'],out.inputs['Image'])
    scene['README']='Blockout only. Geometry, curves and FX anchors are separate. No rig/animation. Refine head against packed approved references.'
    scene.render.filepath=str(root_dir/'previews/blender_preview.png')
    # Save before any optional render, so a headless GPU error does not lose the scene.
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)
    print(f'Saved editable scene: {output}')
    if args.render_preview:bpy.ops.render.render(write_still=True,scene=scene.name)

if __name__=='__main__':main()

"""Preview the actual exported GLB geometry with VTK. No generative rendering."""
from pathlib import Path
import numpy as np, trimesh, vtk
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
from PIL import Image, ImageFilter, ImageChops, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent

def render(view='hero',look=False,w=1600,h=1000):
    src='dm_creature_lookdev.glb' if look else 'dm_creature_base.glb'
    scene=trimesh.load(ROOT/'models'/src,force='scene')
    rr=vtk.vtkRenderer();rr.SetBackground(.010,.020,.035)
    win=vtk.vtkRenderWindow();win.SetOffScreenRendering(1);win.SetSize(w,h);win.SetMultiSamples(8);win.AddRenderer(rr)
    # GLB's local geometry is originally Z-up; use local geometry, not node transforms.
    for name,m in scene.geometry.items():
        poly=vtk.vtkPolyData();pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(np.asarray(m.vertices,dtype=np.float32),deep=True));poly.SetPoints(pts)
        cells=np.column_stack([np.full(len(m.faces),3),m.faces]).astype(np.int64).reshape(-1)
        ca=vtk.vtkCellArray();ca.SetCells(len(m.faces),numpy_to_vtkIdTypeArray(cells,deep=True));poly.SetPolys(ca)
        normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly);normals.SetFeatureAngle(130);normals.SplittingOff();normals.ConsistencyOn();normals.Update()
        mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort());mapper.ScalarVisibilityOff()
        act=vtk.vtkActor();act.SetMapper(mapper);p=act.GetProperty()
        if name.startswith('FX'):
            p.SetColor((.015,.52,1.0) if 'flow' in name or 'Dots' in name else (.04,.83,1.0));p.SetAmbient(1);p.SetDiffuse(0);p.SetSpecular(0)
        elif 'Eye' in name:
            p.SetColor(.015,.035,.055);p.SetAmbient(.15);p.SetDiffuse(.55);p.SetSpecular(.7);p.SetSpecularPower(90)
        elif look:
            p.SetColor(.005,.018,.030);p.SetAmbient(.20);p.SetDiffuse(.37);p.SetSpecular(.09);p.SetSpecularPower(40)
        else:
            p.SetColor(.43,.54,.62);p.SetAmbient(.20);p.SetDiffuse(.70);p.SetSpecular(.27);p.SetSpecularPower(40)
        rr.AddActor(act)
    for pos,color,intens in [((-6,-12,14),(0.72,.88,1.),1.3),((3,6,10),(.25,.54,1.),1.7),((5,-2,-4),(.32,.41,.57),.75)]:
        l=vtk.vtkLight();l.SetLightTypeToSceneLight();l.SetPosition(*pos);l.SetFocalPoint(0,0,0);l.SetColor(*color);l.SetIntensity(intens);rr.AddLight(l)
    cam=rr.GetActiveCamera();cam.SetFocalPoint(.1,0,-.05);cam.ParallelProjectionOn()
    cams={'hero':((-6,-18,8),(0,0,1),4.1),'side':((0,-20,0),(0,0,1),4.15),'top':((0,0,20),(0,1,0),4.15),'front':((-20,0,0),(0,0,1),3.4)}
    pos,up,scale=cams[view];cam.SetPosition(*pos);cam.SetViewUp(*up);cam.SetParallelScale(scale)
    rr.ResetCameraClippingRange();win.Render()
    imf=vtk.vtkWindowToImageFilter();imf.SetInput(win);imf.SetInputBufferTypeToRGB();imf.ReadFrontBufferOff();imf.Update()
    fn=ROOT/'previews'/f'{view}_{"lookdev" if look else "clay"}.png'
    wr=vtk.vtkPNGWriter();wr.SetFileName(str(fn));wr.SetInputConnection(imf.GetOutputPort());wr.Write();win.Finalize()
    im=Image.open(fn).convert('RGB')
    if look:
        arr=np.asarray(im,dtype=float);mask=np.clip((arr[:,:,2]-65)/140,0,1)
        glow=Image.fromarray((arr*mask[:,:,None]).clip(0,255).astype('uint8'))
        im=ImageChops.screen(im,glow.filter(ImageFilter.GaussianBlur(2.7)))
        im=ImageChops.screen(im,glow.filter(ImageFilter.GaussianBlur(11)).point(lambda a:int(a*.52)))
        im.save(fn)
    return fn

if __name__=='__main__':
    for view in ('hero','side','top','front'):
        print(render(view,False))
    print(render('hero',True))

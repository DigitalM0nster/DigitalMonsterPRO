import * as THREE from "three";

/** One immutable font atlas for the Medium film HUD, prepared before Start. */
export async function loadFilmMsdf() {
 const base=`${import.meta.env.BASE_URL}fonts/MazzardM/msdf/film-regular`;
 const response=await fetch(`${base}.json`);
 if(!response.ok)throw new Error(`Film MSDF metrics: HTTP ${response.status}`);
 const data=await response.json(),texture=await new THREE.TextureLoader().loadAsync(`${base}.png`);
 texture.name="Film / Mazzard contour atlas";texture.colorSpace=THREE.NoColorSpace;
 texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 return {texture,...data,glyphMap:new Map(data.glyphs.map(g=>[g.unicode,g]))};
}

/** Preserve the existing text box, tracking and baselines on the curved surface. */
export function createFilmMsdfGeometry(msdf,rows,ctx,{width,height,spacing,align}) {
 if(!msdf||rows.some(row=>Array.from(row).some(c=>c!==" "&&!msdf.glyphMap.get(c.codePointAt(0))?.planeBounds)))return null;
 const rects=[],uvs=[];
 for(const [i,row] of rows.entries()){
  const metrics=ctx.measureText(row),baseline=4+(i+.5)*92+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
  const advance=Array.from(row).reduce((w,c)=>w+ctx.measureText(c).width+spacing,0)-spacing;
  let x=align==="left"?8:(width-advance)/2;
  for(const char of row){
   const glyph=msdf.glyphMap.get(char.codePointAt(0));
   if(glyph?.planeBounds){
    const p=glyph.planeBounds,a=glyph.atlasBounds;
    rects.push((x+p.left*64)/width,(height-baseline+p.bottom*64)/height,(p.right-p.left)*64/width,(p.top-p.bottom)*64/height);
    uvs.push(a.left/msdf.atlas.width,a.bottom/msdf.atlas.height,(a.right-a.left)/msdf.atlas.width,(a.top-a.bottom)/msdf.atlas.height);
   }
   x+=ctx.measureText(char).width+spacing;
  }
 }
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
 geometry.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
 geometry.setIndex([0,1,2,0,2,3]);
 geometry.setAttribute("aGlyphRect",new THREE.InstancedBufferAttribute(new Float32Array(rects),4));
 geometry.setAttribute("aGlyphUv",new THREE.InstancedBufferAttribute(new Float32Array(uvs),4));
 geometry.instanceCount=rects.length/4;
 return geometry;
}

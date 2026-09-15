import { Vector3 } from "three";

/** Prepared once from the existing cloud. Wake directions remain in bind space. */
export function prepareWhaleWakeFlow(emitters, source) {
 const anchors=emitters.slice(0,40).map(anchor=>({...anchor}));
 const attributes=source?.geometry?.attributes;
 const names=source?.skeleton?.bones.map(bone=>bone.name)??[];
 const component=["getX","getY","getZ","getW"];
 const p=new Vector3(),normal=new Vector3(),axis=new Vector3(1,0,0);
 const bodyOnly=index=>{
  for(let j=0;j<4;j++){
   if(attributes.skinWeight[component[j]](index)>.01&&/Pectoral|Fluke/.test(names[attributes.skinIndex[component[j]](index)]))return false;
  }
  return true;
 };
 const nearest=(target,body=false)=>{
  let found=-1,best=Infinity;
  if(!attributes?.position||!attributes.normal)return found;
  for(let i=0;i<attributes.position.count;i++){
   if(body&&!bodyOnly(i))continue;
   const distance=p.fromBufferAttribute(attributes.position,i).distanceToSquared(target);
   if(distance<best){best=distance;found=i;}
  }
  return found;
 };
 // The exported anchors cover the crest and fins. Add several real surface
 // bands on both flanks so the wake sheds from the whole creature, never one
 // synthetic point. Every added origin keeps the source skin weights.
 if(attributes?.skinIndex&&attributes.skinWeight){
  const used=new Set(anchors.map(anchor=>anchor.position.map(value=>value.toFixed(4)).join("|")));
  for(const index of [1,3,5,7,9,11,13,15]){
   const crest=anchors[index];
   if(!crest)continue;
   for(const [drop,side] of [[.38,.6],[.78,.9],[.52,-.72]]){
    const target=new Vector3(...crest.position).add(new Vector3(0,-drop,side));
    const vertex=nearest(target,true);
    if(vertex<0)continue;
    const position=new Vector3().fromBufferAttribute(attributes.position,vertex).toArray();
    const key=position.map(value=>value.toFixed(4)).join("|");
    if(used.has(key))continue;
    used.add(key);
    const weights={};
    for(let j=0;j<4;j++){
     const weight=attributes.skinWeight[component[j]](vertex);
     if(weight>0)weights[names[attributes.skinIndex[component[j]](vertex)]]=weight;
    }
    anchors.push({position,weights,side:true});
   }
  }
 }
 return anchors.map(anchor=>{
  const position=new Vector3(...anchor.position),index=nearest(position);
  normal.set(0,1,0);
  if(index>=0)normal.fromBufferAttribute(attributes.normal,index).normalize();
  const fin=Object.keys(anchor.weights).some(name=>/Pectoral|Fluke/.test(name));
  // Tangential departure carries the local shape into the wake. Crest flow lifts
  // immediately; the sides and fins peel upward later along a smooth curve.
  const tangent=axis.clone().addScaledVector(normal,-normal.x);
  tangent.x=Math.max(.45,tangent.x);
  tangent.y=Math.max((fin||anchor.side) ? .035 : .12,tangent.y);
  tangent.z*=.25;
  if(!fin&&!anchor.side)tangent.addScaledVector(normal,.32);
  tangent.x=Math.max(.45,tangent.x);
  tangent.y=Math.max(.04,tangent.y);
  tangent.normalize().multiplyScalar(1.65);
  const bend=new Vector3(.32,(fin||anchor.side) ? .85 : .18,-.32);
  return {...anchor,direction:tangent.toArray(),bend:bend.toArray()};
 });
}

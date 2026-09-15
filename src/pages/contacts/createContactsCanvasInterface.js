import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { CONTACTS_CHANNELS } from "./contactsChannels.js";
import { contactsInteraction, focusContactsChannel } from "./contactsInteraction.js";
import { resolveContactsResponsiveLayout } from "@/three/scenes/contacts/contactsResponsiveLayout.js";
import { store } from "@/app/store.jsx";
import { Vector4 } from "three";
import { addHudExitGlyph } from "@/three/objects/sceneHud/addHudExitGlyph.js";

const activeChannel = () => contactsInteraction.mobileIndex;

// Rasterize tracked lettering once at its natural proportions. Layout may scale
// both axes together, but never squeezes/stretches glyphs to fill a row.
function hudText(ui,id,values,{size=14,spacing=2,width=180,height=34,align="left",weight=600,...options}={}) {
 const inkWidths=new Map();
 const item=ui.add(id,{...options,values,width,height,paint(ctx,value,w,h){
  ctx.font=`${weight} ${size}px ManifoldExtended, sans-serif`;ctx.textBaseline="middle";ctx.fillStyle="#ffffff";
  const glyphs=Array.from(String(value));
  const total=glyphs.reduce((sum,char)=>sum+ctx.measureText(char).width,0)+Math.max(0,glyphs.length-1)*spacing;
  inkWidths.set(String(value),total);
  let x=align==="center"?(w-total)/2:0;
  for(const char of glyphs){ctx.fillText(char,x,h/2);x+=ctx.measureText(char).width+spacing;}
 }});
 item.inkWidths=inkWidths;item.bounds=new Vector4();return item;
}

export function createContactsCanvasInterface(renderer) {
 const ui = new SceneCanvasInterface("contacts", renderer);
 const prepareInterface=ui.prepare.bind(ui);
 ui.prepare=async scheduler=>{
  await document.fonts.load("600 14px ManifoldExtended");
  return prepareInterface(scheduler);
 };
 ui.allowSiteSwipe = true;
 ui.text("title", { ru: "БУДЕМ\nНА СВЯЗИ", en: "LET’S\nCONNECT", zh: "保持联系" },
  { size: 34, width: 380, height: 100, align: "center", color: "#ecf6ff" });
 // Every channel/locale variant is painted and uploaded before Start.
 const actions = {};
 for (const locale of ["ru","en","zh"]) for (const [i, channel] of CONTACTS_CHANNELS.entries()) {
  actions[`${locale}:${i}`] = `${({ru:"ПЕРЕЙТИ В",en:"GO TO",zh:"前往"})[locale]} ${channel.label.toUpperCase()}`;
 }
 hudText(ui,"open",actions,{size:14,spacing:2.2,width:400,align:"center",
  action: () => window.open(CONTACTS_CHANNELS[activeChannel()].href, "_blank", "noopener,noreferrer") });
 ui.add("open-frame",{width:400,height:60,values:{default:""},paint(ctx,value,w,h){
  ctx.strokeStyle="rgba(255,255,255,.34)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(13,.5);ctx.lineTo(w-13,.5);ctx.lineTo(w-.5,13);ctx.lineTo(w-.5,h-13);
  ctx.lineTo(w-13,h-.5);ctx.lineTo(13,h-.5);ctx.lineTo(.5,h-13);ctx.lineTo(.5,13);ctx.closePath();ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.95)";ctx.beginPath();ctx.moveTo(13,.5);ctx.lineTo(w*.34,.5);
  ctx.moveTo(w*.66,h-.5);ctx.lineTo(w-13,h-.5);ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(6,h/2-1,2,2);ctx.fillRect(w-8,h/2-1,2,2);
 }});
 addHudExitGlyph(ui,"open-arrow");
 for (const [i, channel] of CONTACTS_CHANNELS.entries()) {
  hudText(ui,`channel${i}`, { default: channel.label.toUpperCase() }, {
   ariaLabel: `Выбрать ${channel.label}`, action: () => focusContactsChannel(i) });
  hudText(ui,`number${i}`,{default:String(i+1).padStart(2,"0")},{size:10,spacing:1.2,width:24,height:28,weight:500});
  ui.add(`line${i}`); ui.add(`dot${i}`);
 }
 ui.layout = () => {
  const l = resolveContactsResponsiveLayout(ui.width, ui.height); ui.enabled = !!l;
  if (!l) return;
  const selected=activeChannel();
  const titleWidth=Math.min(l.titleWidth,l.titleHeight*3.8);
  ui.place("title",l.titleX+(l.titleWidth-titleWidth)/2,l.titleY,titleWidth,titleWidth/3.8,{key:store.siteLocale});
  const cta=ui.elements.get("open"),ctaKey=`${store.siteLocale}:${selected}`;
  const ctaScale=Math.min(1,(l.buttonWidth-72)/(cta.inkWidths.get(actions[ctaKey])||340));
  const labelWidth=400*ctaScale;
  ui.place("open",l.buttonX+(l.buttonWidth-labelWidth-26)/2,l.buttonY+(l.buttonHeight-cta.height*ctaScale)/2,labelWidth,cta.height*ctaScale,
   {key:ctaKey,color:0xc4edff,hitRect:cta.bounds.set(l.buttonX,l.buttonY,l.buttonWidth,l.buttonHeight)});
  ui.place("open-frame",l.buttonX,l.buttonY,l.buttonWidth,l.buttonHeight,{key:"default",color:0x26bff5,opacity:.9});
  ui.place("open-arrow",l.buttonX+l.buttonWidth-42,l.buttonY+(l.buttonHeight-24)/2,24,24,{key:"default",color:0x7ee8ff});
  for (let i=0;i<CONTACTS_CHANNELS.length;i++) {
   const colWidth=l.listWidth/2, x=l.listX+(i%2)*colWidth, y=l.listY+Math.floor(i/2)*l.rowHeight;
   const selectedRow=selected===i;
   const item=ui.elements.get(`channel${i}`),ink=item.inkWidths.get(CONTACTS_CHANNELS[i].label.toUpperCase())||140;
   const scale=Math.min(1,(colWidth-40)/ink);
   ui.place(`channel${i}`,x+28,y+(l.rowHeight-item.height*scale)/2,180*scale,item.height*scale,
    {opacity:selectedRow?1:.8,color:selectedRow?0x6fdaff:0xdce6ed,hitRect:item.bounds.set(x,y,colWidth-8,l.rowHeight)});
   ui.place(`number${i}`,x,y+(l.rowHeight-28)/2,24,28,{opacity:selectedRow?.9:.45,color:0x72b9d9});
   ui.place(`line${i}`,x,y+l.rowHeight-1,colWidth-14,1,{color:0x23516a,opacity:.45});
   ui.place(`dot${i}`,x,y+l.rowHeight-1,selectedRow?24:0,1,{color:0x36d5ff,opacity:1});
  }
 };
 return ui;
}

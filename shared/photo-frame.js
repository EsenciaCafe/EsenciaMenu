export const PHOTO_SLOTS = {
  category:'Tarjeta de categoría', group:'Cabecera de categoría',
  product:'Tarjeta del artículo', featured:'Tarjeta ancha (producto único)',
  detail:'Ficha ampliada', extra:'Tarjeta de extra / topping', hero:'Foto de portada'
};
const bounded=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
export function normaliseFrame(frame={}) {
  return {x:bounded(frame?.x,0,100,50),y:bounded(frame?.y,0,100,50),zoom:bounded(frame?.zoom,1,3,1)};
}
export function normaliseFrames(frames={}) {
  const out={};
  for(const slot of Object.keys(PHOTO_SLOTS)) {
    if(!frames?.[slot])continue;
    out[slot]={mobile:normaliseFrame(frames[slot].mobile),desktop:normaliseFrame(frames[slot].desktop)};
  }
  return out;
}
export function frameStyle(frames,slot) {
  return ['mobile','desktop'].map(device=>{
    const f=normaliseFrame(frames?.[slot]?.[device]);
    return `--photo-${device}-x:${f.x}%;--photo-${device}-y:${f.y}%;--photo-${device}-zoom:${f.zoom}`;
  }).join(';');
}
// Drag coordinates are expressed in the actual rendered image overflow, so a
// finger movement produces the same on-screen movement at any zoom/aspect ratio.
export function draggedFrame(frame,dx,dy,w,h,naturalWidth,naturalHeight) {
  const f=normaliseFrame(frame),scale=Math.max(w/naturalWidth,h/naturalHeight)*f.zoom;
  const overflowX=naturalWidth*scale-w,overflowY=naturalHeight*scale-h;
  return normaliseFrame({...f,x:overflowX>.01?f.x-dx/overflowX*100:f.x,y:overflowY>.01?f.y-dy/overflowY*100:f.y});
}

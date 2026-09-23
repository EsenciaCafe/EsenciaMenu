import {PHOTO_SLOTS,normaliseFrames,normaliseFrame,frameStyle,draggedFrame} from '../shared/photo-frame.js';
import {escapeHTML} from '../shared/menu-model.js';

export function mountPhotoEditor(host,{slots,initial={},name}) {
  let frames=normaliseFrames(initial),slot=slots[0],device='mobile',drag=null;
  host.innerHTML=`<div class="crop-toolbar"><label for="${name}-slot">Dónde aparece<select id="${name}-slot">${slots.map(s=>`<option value="${s}">${PHOTO_SLOTS[s]}</option>`).join('')}</select></label><label for="${name}-device">Vista<select id="${name}-device"><option value="mobile">Móvil</option><option value="desktop">Escritorio</option></select></label></div>
    <p class="crop-help">Arrastra la foto dentro del marco. El marco tiene la misma proporción y recorte que en la carta; se muestra a escala.</p>
    <div class="crop-preview-shell"><div class="photo-frame crop-stage" tabindex="0" role="group" aria-label="Encuadre de la foto. Usa las flechas para moverla."><img class="menu-photo photo-preview" alt="Vista previa del encuadre" draggable="false" hidden><span class="crop-grid" aria-hidden="true"></span></div></div>
    <p class="crop-current" aria-live="polite"></p>
    <div class="crop-controls">${[['zoom','Acercar / alejar',1,3,.01],['x','Posición horizontal',0,100,1],['y','Posición vertical',0,100,1]].map(([key,label,min,max,step])=>`<label for="${name}-${key}">${label}<output data-output="${key}"></output><input id="${name}-${key}" data-crop="${key}" type="range" min="${min}" max="${max}" step="${step}"></label>`).join('')}</div>
    <div class="row-actions"><button type="button" class="btn crop-reset">Restablecer esta vista</button></div><p class="muted-small">Cada espacio y dispositivo conserva su propio encuadre. Los cambios se aplican al pulsar Guardar.</p><input type="hidden" name="${escapeHTML(name)}">`;
  const stage=host.querySelector('.crop-stage'),image=host.querySelector('img'),stored=host.querySelector('input[type=hidden]');
  const current=()=>normaliseFrame(frames[slot]?.[device]);
  function render(){
    stage.dataset.photoSlot=slot;stage.dataset.previewDevice=device;stage.style.cssText=frameStyle(frames,slot);
    const f=current();
    for(const key of ['zoom','x','y']){host.querySelector(`[data-crop="${key}"]`).value=f[key];host.querySelector(`[data-output="${key}"]`).textContent=Math.round(key==='zoom'?f[key]*100:f[key])+'%';}
    host.querySelector('.crop-current').textContent=`${PHOTO_SLOTS[slot]} · ${device==='mobile'?'Móvil':'Escritorio'}`;
    stored.value=JSON.stringify(frames);
  }
  function update(patch){frames[slot]??={mobile:normaliseFrame(),desktop:normaliseFrame()};frames[slot][device]=normaliseFrame({...current(),...patch});render();}
  host.querySelector(`#${name}-slot`).onchange=e=>{slot=e.target.value;render();};
  host.querySelector(`#${name}-device`).onchange=e=>{device=e.target.value;render();};
  host.querySelectorAll('[data-crop]').forEach(el=>el.oninput=()=>update({[el.dataset.crop]:Number(el.value)}));
  host.querySelector('.crop-reset').onclick=()=>update({x:50,y:50,zoom:1});
  stage.addEventListener('pointerdown',e=>{
    if(e.button!==0||!image.naturalWidth)return;
    e.preventDefault();stage.focus({preventScroll:true});stage.setPointerCapture(e.pointerId);
    const rect=stage.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,frame:current(),w:rect.width,h:rect.height};stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;update(draggedFrame(drag.frame,e.clientX-drag.x,e.clientY-drag.y,drag.w,drag.h,image.naturalWidth,image.naturalHeight));});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>{drag=null;stage.classList.remove('dragging');});
  stage.addEventListener('keydown',e=>{const delta=e.shiftKey?10:2,f=current();const changes={ArrowLeft:{x:f.x+delta},ArrowRight:{x:f.x-delta},ArrowUp:{y:f.y+delta},ArrowDown:{y:f.y-delta}};if(changes[e.key]){e.preventDefault();update(changes[e.key]);}});
  render();
  return {image,reset(){frames={};render();},get value(){return normaliseFrames(frames);}};
}

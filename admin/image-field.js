import {mountPhotoEditor} from './photo-editor.js';
import {escapeHTML, safeImageURL, MAX_IMAGE_LENGTH} from '../shared/menu-model.js';

export async function optimisePhoto(file) {
  if (!['image/jpeg','image/png','image/webp','image/heic','image/heif',''].includes(file.type)) throw new Error('Elige una foto JPG, PNG o WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La foto supera los 20 MB. Elige una más pequeña.');
  const url=URL.createObjectURL(file), img=new Image();
  try {
    img.src=url;
    try {await img.decode();} catch {throw new Error('El navegador no puede leer esta foto. Exporta una copia JPG desde la galería y vuelve a seleccionarla.');}
    let width=Math.round(img.naturalWidth*Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight))), result='';
    const ratio=img.naturalHeight/img.naturalWidth;
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=1;
    // Some browsers silently export PNG when WebP encoding is unavailable.
    const format=canvas.toDataURL('image/webp').startsWith('data:image/webp;')?'image/webp':'image/jpeg';
    for (let attempt=0;attempt<8;attempt++) {
      canvas.width=width;canvas.height=Math.max(1,Math.round(width*ratio));
      const context=canvas.getContext('2d');
      if(!context)throw new Error('No se pudo preparar la foto. Cierra otras pestañas y vuelve a intentarlo.');
      if(format==='image/jpeg'){context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);}
      context.drawImage(img,0,0,canvas.width,canvas.height);
      for (const quality of [.82,.7,.58,.46]) {
        result=canvas.toDataURL(format,quality);
        if (result.startsWith('data:'+format+';') && result.length <= MAX_IMAGE_LENGTH) return result;
      }
      width=Math.round(width*.78);
    }
    throw new Error('No se pudo preparar esta foto. Prueba con otra imagen.');
  } finally {URL.revokeObjectURL(url);}
}

export function mountImageField(row, field, value = '', onBusy = ()=>{}, initialFrame = {}) {
  const id=`fld-${field.name}`;
  row.innerHTML=`<label>${escapeHTML(field.label || 'Foto')}</label>
    <div class="photo-field"><div class="photo-editor" hidden></div>
      <p class="photo-empty">Sin foto. Se usará la presentación de respaldo.</p>
      <div class="row-actions"><label class="btn photo-upload" for="${id}-file">Subir foto</label><input id="${id}-file" type="file" accept="image/jpeg,image/png,image/webp" class="photo-file">
      <button type="button" class="btn photo-remove">Quitar foto</button></div>
      <label class="muted-small" for="${id}-url">O pega una URL / ruta de imagen</label><input id="${id}-url" type="text" placeholder="https://… o assets/…">
      <input id="${id}" name="${escapeHTML(field.name)}" type="hidden">
      <p class="muted-small photo-status" role="status">La foto se guardará al pulsar Guardar. Se adapta automáticamente para que la carta cargue rápido.</p>
    </div>`;
  const cropHost=row.querySelector('.photo-editor');
  const crop=mountPhotoEditor(cropHost,{slots:field.slots||['product','featured','detail','extra'],initial:initialFrame,name:field.frameName||'image_frame'});
  const stored=row.querySelector(`[name="${field.name}"]`), preview=crop.image, empty=row.querySelector('.photo-empty'), input=row.querySelector(`#${id}-url`), fileInput=row.querySelector('input[type=file]'), status=row.querySelector('.photo-status');
  let ticket=0;
  const show=raw=>{
    const url=safeImageURL(raw);
    stored.value=raw; input.value=raw.startsWith('data:')?'':raw;
    preview.hidden=!url;cropHost.hidden=!url;empty.hidden=!!url;
    if (url) preview.src=url;else preview.removeAttribute('src');
    input.setCustomValidity(raw&&!url?'Usa una imagen JPG, PNG o WebP, una URL http(s) o una ruta válida.':'');
  };
  preview.onerror=()=>{preview.hidden=true;cropHost.hidden=true;empty.hidden=false;empty.textContent='No se puede cargar la foto. Revisa la URL o sube otra imagen.';};
  preview.onload=()=>{preview.hidden=false;cropHost.hidden=false;empty.hidden=true;};
  show(value);
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;
    const mine=++ticket;onBusy(1);status.textContent='Preparando foto…';
    try {const result=await optimisePhoto(file);if(mine!==ticket)return;crop.reset();show(result);status.textContent='Foto preparada. Pulsa Guardar para aplicar el cambio.';}
    catch(e){if(mine===ticket)status.textContent=e.message;}
    finally{onBusy(-1);fileInput.value='';}
  });
  input.addEventListener('input',()=>{ticket++;crop.reset();show(input.value.trim());status.textContent='Pulsa Guardar para aplicar el cambio.';});
  row.querySelector('.photo-remove').addEventListener('click',()=>{ticket++;crop.reset();show('');empty.textContent='Sin foto. Se usará la presentación de respaldo.';status.textContent='La foto se quitará al guardar.';});
}

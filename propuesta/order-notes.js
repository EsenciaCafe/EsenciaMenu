import {escapeHTML as esc} from '../shared/menu-model.js';
const STORAGE='esencia-order-notes-v1';
export function createOrderNotes({t,field,findEntry}){
  let lines=[],saveFailed=false;
  try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved?.expires>Date.now()&&Array.isArray(saved.lines))lines=saved.lines.slice(0,100).filter(x=>typeof x.key==='string'&&typeof x.name==='string').map((x,n)=>({...x,id:String(n),quantity:Math.min(99,Math.max(1,Number(x.quantity)||1)),note:String(x.note||'').slice(0,500)}));}catch{}
  const button=document.querySelector('#order-open'),dialog=document.querySelector('#order-dialog'),content=document.querySelector('#order-content');
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify({expires:Date.now()+86400000,lines}));saveFailed=false;}catch{saveFailed=true;}badge();}
  function badge(){button.textContent=t('Mi pedido','My order')+(lines.length?' · '+lines.reduce((n,x)=>n+x.quantity,0):'');}
  function add(p){
    if(lines.length>=100){document.querySelector('#announcer').textContent=t('Tu lista está llena. Revisa Mi pedido.','Your list is full. Check My order.');return false;}
    lines.push({id:crypto.randomUUID(),key:p.key,name:p.i.name||'',name_en:p.i.name_en||'',quantity:1,note:''});save();
    document.querySelector('#announcer').textContent=t('Añadido a Mi pedido. Puedes ajustar cantidades y notas allí.','Added to My order. Adjust quantities and notes there.');return true;
  }
  function render(){
    content.innerHTML=`<div class="dialog-body"><p class="eyebrow">${t('PARA RECORDAR LO QUE OS APETECE','A NOTE OF WHAT YOU WOULD LIKE')}</p><h2 id="order-title">${t('Mi pedido','My order')}</h2><p class="order-purpose">${t('Guarda aquí lo que vais a pedir y enséñanoslo cuando os atendamos. Esta lista no se envía al equipo.','Keep a note of your choices and show us when we serve you. This list is not sent to our team.')}</p>${lines.length?`<div class="order-lines">${lines.map(x=>{const p=findEntry(x.key);return `<article class="order-line" data-line="${esc(x.id)}"><h3>${esc(p?field(p.i,'name'):field(x,'name'))}</h3>${!p?`<p class="order-unavailable">${t('Ya no aparece disponible en la carta. Consulta al equipo.','No longer available on the menu. Please ask our team.')}</p>`:''}<div class="order-quantity"><button type="button" data-decrease="${esc(x.id)}" aria-label="${t('Reducir cantidad','Decrease quantity')}" ${x.quantity<=1?'disabled':''}>−</button><output aria-label="${t('Cantidad','Quantity')}">${x.quantity}</output><button type="button" data-increase="${esc(x.id)}" aria-label="${t('Aumentar cantidad','Increase quantity')}" ${x.quantity>=99?'disabled':''}>+</button><button type="button" class="text-link" data-remove="${esc(x.id)}">${t('Quitar','Remove')}</button></div><label class="order-note-label">${t('Extras, preparación o para quién es','Extras, preparation or who it is for')}<textarea data-note="${esc(x.id)}" rows="2" maxlength="500" placeholder="${t('Ej.: Nutella y plátano · para Ana','E.g. Nutella and banana · for Ana')}">${esc(x.note)}</textarea></label></article>`;}).join('')}</div><div class="order-actions"><button type="button" class="primary" data-copy-order>${t('Copiar lista','Copy list')}</button><button type="button" class="text-link" data-clear-order>${t('Vaciar lista','Clear list')}</button></div>`:`<div class="order-empty"><p>${t('Tu lista empieza con algo rico. Abre un producto y pulsa «Añadir a mi pedido».','Start with something delicious. Open a product and tap “Add to my order”.')}</p></div>`}<p class="order-storage">${saveFailed?t('No se ha podido guardar en este dispositivo. Conserva esta pestaña abierta.','Unable to save on this device. Keep this tab open.'):t('Solo en este dispositivo, durante 24 horas desde el último cambio.','Only on this device, for 24 hours after the last change.')}</p><p class="order-status" role="status"></p><button type="button" class="text-link" data-close="order-dialog">${t('Seguir viendo la carta','Continue browsing')}</button></div>`;
  }
  function open(){render();dialog.showModal();dialog.scrollTop=0;}
  button.addEventListener('click',open);
  dialog.addEventListener('input',e=>{if(e.target.matches('[data-note]')){const x=lines.find(x=>x.id===e.target.dataset.note);if(x){x.note=e.target.value;save();}}});
  dialog.addEventListener('click',async e=>{
    const control=e.target.closest('button');if(!control)return;
    for(const action of ['increase','decrease','remove'])if(control.dataset[action]!==undefined){const id=control.dataset[action],x=lines.find(x=>x.id===id);if(!x)return;if(action==='remove')lines=lines.filter(x=>x.id!==id);else x.quantity=Math.min(99,Math.max(1,x.quantity+(action==='increase'?1:-1)));save();render();const next=content.querySelector(`[data-${action}="${id}"]`);(next||content.querySelector('button'))?.focus();return;}
    if(control.hasAttribute('data-clear-order')){if(!confirm(t('¿Vaciar tu lista?','Clear your list?')))return;lines=[];save();render();}
    if(control.hasAttribute('data-copy-order')){
      const text=t('Mi pedido · Esencia','My order · Esencia')+'\n'+lines.map(x=>{const p=findEntry(x.key);return `${x.quantity} × ${p?field(p.i,'name'):field(x,'name')}${x.note?' — '+x.note:''}${!p?t(' (consultar disponibilidad)',' (check availability)'):''}`;}).join('\n')+'\n'+t('Para enseñar al equipo. No enviado.','To show our team. Not sent.');
      try{await navigator.clipboard.writeText(text);content.querySelector('.order-status').textContent=t('Lista copiada.','List copied.');}catch{const status=content.querySelector('.order-status');status.textContent=t('Selecciona y copia tu lista:','Select and copy your list:');const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.rows=8;status.append(area);area.select();}
    }
  });
  badge();return {add,open,refresh(){badge();if(dialog.open)render();}};
}

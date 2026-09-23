import {temperatureIcons} from '../shared/temperature.js';
import {normaliseFrames} from '../shared/photo-frame.js';
// admin/admin.js
// Editor CRUD con formularios, soporte ES/EN, order, toppings,
// renombrado de categorías (settings/menu.nav_labels),
// ocultar/mostrar (hidden) secciones, items y toppings,
// sin undefined en creates y con deleteField() en edits.

import { db } from "../firebase.js";
import {alphabeticalToppings, DEFAULT_CATEGORIES, categoryForSection, visualCategories, safeImageURL, escapeHTML} from '../shared/menu-model.js';
import {mountImageField} from './image-field.js';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, deleteField,
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

/* ======= Helpers UI ======= */
const $  = (s, el=document)=> el.querySelector(s);
const $$ = (s, el=document)=> [...el.querySelectorAll(s)];
const slug = (s="") =>
  String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

/* ======= Modal/Form genérico ======= */
function openForm({ title="Editar", submitLabel="Guardar", initial={}, fields=[] }){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='editor-dialog';
    dialog.innerHTML=`<div class="modal"><div class="modal-head"><h3 id="editor-form-title">${escapeHTML(title)}</h3><button type="button" class="btn-ghost" data-cancel aria-label="Cerrar">✕</button></div><form class="modal-body" id="editor-form"></form><div class="modal-actions"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" form="editor-form" class="btn accent" id="form-submit">${escapeHTML(submitLabel)}</button></div></div>`;
    dialog.setAttribute('aria-labelledby','editor-form-title');document.body.appendChild(dialog);
    const form=dialog.querySelector('form'), submit=dialog.querySelector('#form-submit');
    let busy=0,settled=false;
    const finish=data=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(data);};
    for(const f of fields){
      const row=document.createElement('div');row.className='form-row';form.appendChild(row);
      const id=`fld-${f.name}`;
      if(f.type==='image'){
        mountImageField(row,f,initial[f.name]||'',delta=>{busy+=delta;submit.disabled=busy>0;},initial[f.frameName||'image_frame']||{});
      }else{
        let control='';
        if(f.type==='select') control=`<select id="${id}" name="${f.name}">${(f.options||[]).map(o=>`<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('')}</select>`;
        else if(f.type==='textarea') control=`<textarea id="${id}" name="${f.name}" rows="${f.rows||3}"></textarea>`;
        else if(f.type==='checkbox') control=`<label class="chk"><input type="checkbox" id="${id}" name="${f.name}"><span>${escapeHTML(f.help||'')}</span></label>`;
        else control=`<input id="${id}" name="${f.name}" type="${f.type||'text'}" ${f.type==='number'?'step="any"':''}>`;
        row.innerHTML=`${f.type==='checkbox'?'':`<label for="${id}">${escapeHTML(f.label||f.name)}</label>`}${control}${f.note?`<div class="note-inline">${escapeHTML(f.note)}</div>`:''}`;
        const el=row.querySelector('#'+id),val=initial[f.name];
        if(f.type==='checkbox')el.checked=!!val;else if(val!=null)el.value=String(val);
        if(f.placeholder)el.placeholder=f.placeholder;
        if(f.required||['name','title'].includes(f.name))el.required=true;
      }
      if(f.dependsOn){const dep=form.querySelector(`[name="${f.dependsOn.name}"]`);const toggle=()=>{const active=f.dependsOn.when(dep.type==='checkbox'?dep.checked:dep.value);row.hidden=!active;};dep.addEventListener('change',toggle);toggle();}
    }
    dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>finish(null));
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
    form.addEventListener('submit',e=>{
      e.preventDefault();if(busy||!form.reportValidity())return;
      const data={};
      for(const f of fields){const el=form.elements.namedItem(f.name);if(!el)continue;data[f.name]=f.type==='checkbox'?el.checked:f.type==='number'&&el.value.trim()!==''?Number(el.value):el.value.trim();}
      for(const f of fields.filter(f=>f.type==='image')){const frameName=f.frameName||'image_frame';try{data[frameName]=normaliseFrames(JSON.parse(form.elements.namedItem(frameName).value));}catch{data[frameName]={};}}
      finish(data);
    });
    dialog.showModal();
  });
}

/* ======= Constantes ======= */
let GROUPS = DEFAULT_CATEGORIES.map(g=>({id:g.id,label:g.name[0]})).concat({id:'extras',label:'Extras'});
const categoryField = () => ({name:'visual_category',label:'Categoría en la nueva carta',type:'select',options:DEFAULT_CATEGORIES.map(g=>({value:g.id,label:GROUPS.find(x=>x.id===g.id)?.label||g.name[0]}))});
const imageField = {name:'image_url',label:'Foto del artículo',type:'image'};

/* ======= Auth ======= */
const auth = getAuth();
$("#btn-login")?.addEventListener("click", async ()=>{
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || !password) { alert("Completa email y contraseña"); return; }
  try{ await signInWithEmailAndPassword(auth, email, password); }
  catch(err){ console.error(err); alert("No se pudo iniciar sesión: " + (err.message || err)); }
});
$("#btn-logout")?.addEventListener("click", async ()=>{ await signOut(auth); });

onAuthStateChanged(auth, (user)=>{
  if (user){
    $("#auth-status").textContent = `Conectado como ${user.email}`;
    $("#login").classList.add("hide");
    $("#editor").classList.remove("hide");
    initEditor();
  } else {
    $("#auth-status").textContent = "No autenticado";
    $("#visual-panel").hidden=true;
    if($("#admin-actions"))$("#admin-actions").hidden=true;
    $("#nav").innerHTML="";
    $("#editor").classList.add("hide");
    $("#login").classList.remove("hide");
  }
});

/* ======= Estado ======= */
let STATE = { sections: [], byGroup: {}, activeTab: "desayunos", meta:{}, query:"", section:"", availability:"all" };

function groupSections(sections){
  const map = {};
  for (const sec of sections){
    const gid = categoryForSection(sec);
    (map[gid] ||= []).push(sec);
  }
  return map;
}

/* ======= Carga ======= */
async function loadSections(){
  const snap = await getDocs(collection(db, "sections"));
  const arr = await Promise.all(snap.docs.map(async d=>{
    const data = d.data();
    const id = d.id;
    const [itemsSnap, toppingsSnap] = await Promise.all([
      getDocs(collection(db, "sections", id, "items")),
      getDocs(collection(db, "sections", id, "toppings")),
    ]);
    const items = itemsSnap.docs.map(x=>({ id: x.id, ...x.data() }));
    const toppings = toppingsSnap.docs.map(x=>({ id: x.id, ...x.data() }));
    return { id, ...data, items, toppings };
  }));
  return arr;
}

/* ======= Nav + acciones ======= */
function buildNav(){
  const nav = $("#nav");
  nav.innerHTML = GROUPS.map((g)=>`
    <a href="#${g.id}" class="${STATE.activeTab===g.id?"active":""}" data-tab="${g.id}">
      ${escapeHTML(g.label)}
    </a>
  `).join("");

  $$("#nav a").forEach(a=>{
    a.addEventListener("click", e=>{
      e.preventDefault();
      const tab = a.dataset.tab;
      STATE.activeTab = tab; STATE.section=""; STATE.query=""; $("#editor-search").value="";
      $$("#nav a").forEach(x=>x.classList.remove("active"));
      a.classList.add("active");
      render();
    });
  });

  let actions = document.getElementById("admin-actions");
  if (!actions){
    actions = document.createElement("div");
    actions.id = "admin-actions";
    actions.className = "admin-actions";
    nav.parentElement?.insertBefore(actions, nav.nextSibling);
  }
  actions.innerHTML = `
    <button class="btn accent" id="btn-add-section">+ Sección</button>
    <button class="btn" id="btn-edit-cats">Fotos y categorías</button>
    <a class="btn" href="../" target="_blank" rel="noopener">Ver carta ↗</a>
    <a class="btn" href="../promo-manager.html" target="_blank" rel="noopener">Café del mes / popup ↗</a>
  `;
  actions.hidden=false;
  $("#btn-add-section").onclick = onAddSection;
  $("#btn-edit-cats").onclick = onEditCategoryNames;
}

/* ======= Form: Editar nombres de categorías ======= */
function onEditCategoryNames(){
  const panel=$('#visual-panel');panel.hidden=!panel.hidden;
  if(!panel.hidden){renderVisualSettings();panel.scrollIntoView({block:'start'});}
}
function renderVisualSettings(){
  const panel=$('#visual-panel');
  const categories=visualCategories(STATE.meta,STATE.sections);
  panel.innerHTML=`<h2>Fotos y categorías de la nueva carta</h2><p class="visual-intro">Sube tus fotos o pega su URL. Las fotos aparecerán en la portada y en las fichas. Puedes cambiar los nombres y descripciones en ambos idiomas.</p><div class="row-actions"><button class="btn" id="edit-hero">Cambiar foto de portada</button><button class="btn" id="hide-visual">Cerrar este panel</button></div><div class="category-settings">${categories.map(g=>`<article class="category-setting">${g.image_url?`<img src="${escapeHTML(g.image_url)}" alt="${escapeHTML(g.name[0])}">`:`<div class="category-placeholder" style="--category-tone:${g.tone}">Todavía sin foto</div>`}<div class="category-setting-body"><h3>${escapeHTML(g.name[0])}</h3><p>${escapeHTML(g.desc[0])}</p><button class="btn" data-edit-category="${g.id}">Editar ${escapeHTML(g.name[0])}</button></div></article>`).join('')}</div>`;
  panel.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>editCategory(categories.find(g=>g.id===b.dataset.editCategory)));
  $('#hide-visual').onclick=()=>{panel.hidden=true;};
  $('#edit-hero').onclick=editHero;
}
async function editCategory(g){
  const current=STATE.meta.visual_categories?.[g.id]||{};
  const data=await openForm({title:`Categoría: ${g.name[0]}`,initial:{name_es:g.name[0],name_en:g.name[1],desc_es:g.desc[0],desc_en:g.desc[1],image_url:current.image_url||'',image_frame:current.image_frame||{}},fields:[
    {name:'name_es',label:'Nombre (ES)',required:true},{name:'name_en',label:'Name (EN)'},
    {name:'desc_es',label:'Descripción (ES)'},{name:'desc_en',label:'Description (EN)'},
    {name:'image_url',label:'Foto de la categoría',type:'image',slots:['category','group']}]});
  if(!data)return;
  try{const ref=doc(db,'settings','menu');if(STATE.settingsExists)await updateDoc(ref,{['visual_categories.'+g.id]:data});else await setDoc(ref,{visual_categories:{[g.id]:data}});await reload();$('#editor-status').textContent='Categoría guardada. Abre la nueva carta para verla.';}
  catch(e){console.error(e);alert('No se pudo guardar la categoría. Comprueba tu sesión y la conexión.');}
}
async function editHero(){
  const data=await openForm({title:'Foto de portada',initial:{image_url:STATE.meta.visual_hero_image||'',image_frame:STATE.meta.visual_hero_frame||{}},fields:[{name:'image_url',label:'Foto principal',type:'image',slots:['hero']}]});
  if(!data)return;
  try{const ref=doc(db,'settings','menu'),patch={visual_hero_image:data.image_url,visual_hero_frame:data.image_frame};if(STATE.settingsExists)await updateDoc(ref,patch);else await setDoc(ref,patch);await reload();$('#editor-status').textContent='Foto de portada guardada.';}
  catch(e){console.error(e);alert('No se pudo guardar la foto de portada.');}
}

/* ======= Render ======= */
function render(){
  const wrap = $("#sections");
  const tab = STATE.activeTab;
  $("#group-title").textContent = `Editor — ${GROUPS.find(g=>g.id===tab)?.label||tab}`;

  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const q=normal(STATE.query).trim();
  let sections = q ? STATE.sections : STATE.byGroup[tab] || [];
  const selector=$('#section-filter');
  selector.innerHTML='<option value="">Todas las secciones</option>'+sections.map(s=>`<option value="${escapeHTML(s.id)}">${escapeHTML(s.title)}</option>`).join('');
  selector.value=STATE.section;
  if(STATE.section)sections=sections.filter(s=>s.id===STATE.section);
  const matches=(i,sec)=> (!q||normal([i.name,i.name_en,i.desc,sec.title].join(' ')).includes(q)) && (STATE.availability==='all'||(STATE.availability==='hidden')===!!(i.hidden||sec.hidden));
  sections=sections.map(sec=>({...sec,items:sec.items.filter(i=>matches(i,sec)),toppings:sec.toppings.filter(i=>matches(i,sec))})).filter(sec=> !q&&STATE.availability==='all'||sec.items.length||sec.toppings.length||sec.base&&matches({name:sec.base.description},sec));
  sections = sections.slice().sort((a,b)=>{
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  wrap.innerHTML = sections.map(sec => sectionCard(sec)).join("") || `<div class="note">No hay resultados. Prueba otra búsqueda o cambia los filtros.</div>`;

  sections.forEach(visible=>{
    const sec=STATE.sections.find(s=>s.id===visible.id);
    $("#toggle-sec-"+sec.id)?.addEventListener("click", ()=> onToggleSectionHidden(sec));
    $("#edit-sec-"+sec.id)?.addEventListener("click", ()=> onEditSection(sec));
    $("#del-sec-"+sec.id)?.addEventListener("click", ()=> onDeleteSection(sec));
    $("#order-sec-"+sec.id)?.addEventListener("click", ()=> onChangeSectionOrder(sec));
    $("#add-item-"+sec.id)?.addEventListener("click", ()=> onAddItem(sec));
    $("#add-top-"+sec.id)?.addEventListener("click", ()=> onAddTopping(sec));

    (sec.items||[]).forEach(it=>{
      $("#toggle-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onToggleItemHidden(sec, it));
      $("#edit-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onEditItem(sec, it));
      $("#order-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onChangeItemOrder(sec, it));
      $("#del-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onDeleteItem(sec, it));
    });
    (sec.toppings||[]).forEach(tp=>{
      $("#toggle-top-"+sec.id+"-"+tp.id)?.addEventListener("click", (e)=>{ e.preventDefault(); onToggleToppingHidden(sec, tp); });
      $("#edit-top-"+sec.id+"-"+tp.id)?.addEventListener("click", ()=> onEditTopping(sec, tp));
      $("#order-top-"+sec.id+"-"+tp.id)?.addEventListener("click", ()=> onChangeToppingOrder(sec, tp));
      $("#del-top-"+sec.id+"-"+tp.id)?.addEventListener("click", ()=> onDeleteTopping(sec, tp));
    });
  });
}

function sectionCard(sec){
  const hasBase = sec.base && (sec.base.title || sec.base.title_en || sec.base.description || sec.base.description_en || sec.base.price);

  const itemsSorted = (sec.items||[]).slice().sort((a,b)=>{
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.name||a.name_en||"").localeCompare(b.name||b.name_en||"", "es");
  });

  const toppingsSorted = (sec.toppings||[]).slice().sort((a,b)=>{
    if(sec.id==='mini-pancakes')return alphabeticalToppings(a,b);
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.name||a.name_en||"").localeCompare(b.name||b.name_en||"", "es");
  });

  const entryCard=(it,kind)=>{
    const prefix=kind==='top'?'top':'item',src=safeImageURL(it.image_url);
    const price=it.free?'Gratis':it.price===undefined||it.price===''?'Sin precio':escapeHTML(String(it.price))+' €';
    return `<article class="catalog-card ${it.hidden||sec.hidden?'is-unavailable':''}">
      <div class="catalog-photo">${src?`<img src="${escapeHTML(src)}" alt="${escapeHTML(it.name)}" loading="lazy">`:'<span>Sin foto</span>'}<span class="availability-pill">${sec.hidden?'Sección oculta':it.hidden?'No disponible':'Disponible'}</span></div>
      <div class="catalog-body"><div class="catalog-heading"><h3>${escapeHTML(it.name||it.name_en||'Sin nombre')}${temperatureIcons(it)}</h3><strong>${price}</strong></div>${it.desc?`<p class="catalog-description">${escapeHTML(it.desc)}</p>`:''}
      <div class="catalog-actions"><button class="btn accent" id="edit-${prefix}-${sec.id}-${it.id}">Editar</button><button class="btn" id="toggle-${prefix}-${sec.id}-${it.id}" aria-label="${it.hidden?'Activar':'Marcar no disponible'} ${escapeHTML(it.name)}">${it.hidden?'Activar':'No disponible'}</button>
      <details class="catalog-more"><summary aria-label="Más opciones de ${escapeHTML(it.name)}">•••</summary><div>${kind==='top'&&sec.id==='mini-pancakes'?'':`<button class="btn" id="order-${prefix}-${sec.id}-${it.id}">Cambiar orden</button>`}<button class="btn danger" id="del-${prefix}-${sec.id}-${it.id}">Eliminar</button></div></details></div></div></article>`;
  };
  return `<section class="catalog-section" id="${slug(sec.title||sec.id)}">
    <div class="catalog-section-head"><div><p class="catalog-eyebrow">${sec.hidden?'SECCIÓN OCULTA':'SECCIÓN'} · ${itemsSorted.length} artículos${toppingsSorted.length?' · '+toppingsSorted.length+' toppings':''}</p><h2>${escapeHTML(sec.title||'')}</h2></div>
    <div class="row-actions"><button class="btn" id="edit-sec-${sec.id}">${hasBase?'Editar producto base':'Editar sección'}</button><details class="catalog-more"><summary>Opciones</summary><div><button class="btn" id="toggle-sec-${sec.id}">${sec.hidden?'Mostrar sección':'Ocultar sección'}</button><button class="btn" id="order-sec-${sec.id}">Cambiar orden</button><button class="btn danger" id="del-sec-${sec.id}">Eliminar sección</button></div></details></div></div>
    ${hasBase?`<div class="base-overview">${safeImageURL(sec.base.image_url)?`<img src="${escapeHTML(safeImageURL(sec.base.image_url))}" alt="Producto base">`:''}<div><span class="catalog-eyebrow">PRODUCTO BASE</span><h3>${escapeHTML(sec.base.description||sec.base.title||sec.title)}</h3><strong>${escapeHTML(String(sec.base.price??''))} €</strong><p>Edita su foto, encuadre y precio en «Editar producto base».</p></div></div>`:''}
    <div class="catalog-grid">${itemsSorted.map(i=>entryCard(i,'item')).join('')}</div>
    <div class="row-actions"><button class="btn accent" id="add-item-${sec.id}">+ Artículo</button>${sec.toppings?`<button class="btn" id="add-top-${sec.id}">+ Topping</button>`:''}</div>
    ${toppingsSorted.length?`<div class="catalog-section-head"><h3>Toppings</h3><span class="muted-small">${sec.id==='mini-pancakes'?'Orden alfabético automático':''}</span></div><div class="catalog-grid topping-grid">${toppingsSorted.map(i=>entryCard(i,'top')).join('')}</div>`:''}
  </section>`;
}

/* ======= Toggle hidden ======= */
async function onToggleSectionHidden(sec){
  try{
    await updateDoc(doc(db, "sections", sec.id), { hidden: !sec.hidden, updatedAt: serverTimestamp() });
    await reload();
  }catch(e){ console.error(e); alert("No se pudo cambiar la visibilidad de la sección."); }
}
async function onToggleItemHidden(sec, it){
  try{
    await updateDoc(doc(db, "sections", sec.id, "items", it.id), { hidden: !it.hidden, updatedAt: serverTimestamp() });
    await reload();
  }catch(e){ console.error(e); alert("No se pudo cambiar la visibilidad del item."); }
}
async function onToggleToppingHidden(sec, tp){
  try{
    await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), { hidden: !tp.hidden, updatedAt: serverTimestamp() });
    await reload();
  }catch(e){ console.error(e); alert("No se pudo cambiar la visibilidad del topping."); }
}

/* ======= Secciones ======= */
async function onAddSection(){
  const data = await openForm({
    title: "Nueva sección",
    submitLabel: "Crear",
    initial: { visual_category:STATE.activeTab==="extras"?"desayunos":STATE.activeTab, group:"Desayunos", title:"", title_en:"", subtitle:"", subtitle_en:"", note:"", note_en:"", order:1, hidden:false, base_enable:false, base_title:"", base_title_en:"", base_desc:"", base_desc_en:"", base_price:"" },
    fields: [
      categoryField(),
      { name:"group", label:"Grupo en carta anterior", type:"select", options:[
        {value:"Poffertjes", label:"Poffertjes"},
        {value:"Café", label:"Café"},
        {value:"Desayunos", label:"Desayunos"},
        {value:"Bebidas", label:"Bebidas"},
      ]},
      { name:"title", label:"Título (ES)" },
      { name:"title_en", label:"Title (EN)", placeholder:"Opcional" },
      { name:"subtitle", label:"Subtítulo (ES)", placeholder:"Opcional" },
      { name:"subtitle_en", label:"Subtitle (EN)", placeholder:"Opcional" },
      { name:"note", label:"Nota (ES)", placeholder:"Opcional" },
      { name:"note_en", label:"Note (EN)", placeholder:"Opcional" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
      { name:"hidden", type:"checkbox", help:"Ocultar esta sección" },
      { name:"base_enable", type:"checkbox", help:"Añadir BASE (título/desc/precio)" },
      {name:"base_image_url",label:"Foto de la base",type:"image",frameName:"base_image_frame",slots:["featured","product","detail"],dependsOn:{name:"base_enable",when:v=>!!v}},
      {name:"base_name",label:"Nombre de la base en la nueva carta (ES)",dependsOn:{name:"base_enable",when:v=>!!v}},
      {name:"base_name_en",label:"Base name (EN)",dependsOn:{name:"base_enable",when:v=>!!v}},
      { name:"base_title", label:"Base · Título (ES)", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_title_en", label:"Base · Title (EN)", placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc", label:"Base · Descripción (ES)", type:"textarea", rows:2, dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc_en", label:"Base · Description (EN)", type:"textarea", rows:2, placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_price", label:"Base · Precio", placeholder:"ej: 3.50", dependsOn:{name:"base_enable", when:v=>!!v} },
    ]
  });
  if (!data) return;

  const id = slug(data.title);
  const payload = {
    title: data.title,
    group: data.group,
    visual_category: data.visual_category,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    hidden: !!data.hidden,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  if (data.title_en) payload.title_en = data.title_en;
  if (data.subtitle) payload.subtitle = data.subtitle;
  if (data.subtitle_en) payload.subtitle_en = data.subtitle_en;
  if (data.note) payload.note = data.note;
  if (data.note_en) payload.note_en = data.note_en;

  if (data.base_enable) {
    const base = {};
    if(data.base_image_url){base.image_url=data.base_image_url;base.image_frame=data.base_image_frame;}
    if(data.base_name)base.name=data.base_name;
    if(data.base_name_en)base.name_en=data.base_name_en;
    if (data.base_title) base.title = data.base_title;
    if (data.base_title_en) base.title_en = data.base_title_en;
    if (data.base_desc) base.description = data.base_desc;
    if (data.base_desc_en) base.description_en = data.base_desc_en;
    if (data.base_price) base.price = data.base_price;
    if (Object.keys(base).length) payload.base = base;
  }

  try{ const ref=doc(db,"sections",id);if((await getDoc(ref)).exists()){alert("Ya existe una sección con ese nombre. Edita la sección existente o elige otro nombre.");return;}await setDoc(ref,payload);await reload(); }
  catch(e){ console.error(e); alert("No se pudo crear sección."); }
}

async function onEditSection(sec){
  const data = await openForm({
    title: `Editar sección: ${sec.title}`,
    submitLabel: "Guardar",
    initial: {
      visual_category:categoryForSection(sec),
      group: sec.group || "Desayunos",
      title: sec.title || "",
      title_en: sec.title_en || "",
      subtitle: sec.subtitle || "",
      subtitle_en: sec.subtitle_en || "",
      note: sec.note || "",
      note_en: sec.note_en || "",
      order: typeof sec.order==="number"? sec.order : 1,
      hidden: !!sec.hidden,
      base_enable: sec.base?.price != null,
      base_image_url: sec.base?.image_url || "",
      base_image_frame: sec.base?.image_frame || {},
      base_name:sec.base?.name || "",
      base_name_en:sec.base?.name_en || "",
      base_title: sec.base?.title || "",
      base_title_en: sec.base?.title_en || "",
      base_desc: sec.base?.description || "",
      base_desc_en: sec.base?.description_en || "",
      base_price: sec.base?.price || "",
    },
    fields: [
      categoryField(),
      { name:"group", label:"Grupo en carta anterior", type:"select", options:[
        {value:"Poffertjes", label:"Poffertjes"},
        {value:"Café", label:"Café"},
        {value:"Desayunos", label:"Desayunos"},
        {value:"Bebidas", label:"Bebidas"},
      ]},
      { name:"title", label:"Título (ES)" },
      { name:"title_en", label:"Title (EN)", placeholder:"Opcional" },
      { name:"subtitle", label:"Subtítulo (ES)", placeholder:"Opcional" },
      { name:"subtitle_en", label:"Subtitle (EN)", placeholder:"Opcional" },
      { name:"note", label:"Nota (ES)", placeholder:"Opcional" },
      { name:"note_en", label:"Note (EN)", placeholder:"Opcional" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
      { name:"hidden", type:"checkbox", help:"Ocultar esta sección" },
      { name:"base_enable", type:"checkbox", help:"Editar BASE (título/desc/precio)" },
      {name:"base_image_url",label:"Foto de la base",type:"image",frameName:"base_image_frame",slots:["featured","product","detail"],dependsOn:{name:"base_enable",when:v=>!!v}},
      {name:"base_name",label:"Nombre de la base en la nueva carta (ES)",dependsOn:{name:"base_enable",when:v=>!!v}},
      {name:"base_name_en",label:"Base name (EN)",dependsOn:{name:"base_enable",when:v=>!!v}},
      { name:"base_title", label:"Base · Título (ES)", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_title_en", label:"Base · Title (EN)", placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc", label:"Base · Descripción (ES)", type:"textarea", rows:2, dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc_en", label:"Base · Description (EN)", type:"textarea", rows:2, placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_price", label:"Base · Precio", placeholder:"ej: 3.50", dependsOn:{name:"base_enable", when:v=>!!v} },
    ]
  });
  if (!data) return;

  const patch = {
    title: data.title,
    title_en: data.title_en ? data.title_en : deleteField(),
    subtitle: data.subtitle ? data.subtitle : deleteField(),
    subtitle_en: data.subtitle_en ? data.subtitle_en : deleteField(),
    note: data.note ? data.note : deleteField(),
    note_en: data.note_en ? data.note_en : deleteField(),
    group: data.group,
    visual_category: data.visual_category,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    hidden: !!data.hidden,
    updatedAt: serverTimestamp()
  };

  if (data.base_enable){
    const base = {};
    base.title = data.base_title ? data.base_title : deleteField();
    base.title_en = data.base_title_en ? data.base_title_en : deleteField();
    base.description = data.base_desc ? data.base_desc : deleteField();
    base.description_en = data.base_desc_en ? data.base_desc_en : deleteField();
    base.price = data.base_price ? data.base_price : deleteField();
    base.image_url=data.base_image_url || deleteField();
    base.image_frame=data.base_image_url?data.base_image_frame:deleteField();
    base.name=data.base_name || deleteField();base.name_en=data.base_name_en || deleteField();
    if((data.base_desc||'')!==(sec.base?.description||'') || (data.base_name||'')!==(sec.base?.name||''))base.allergens_revision_required=true;
    for(const [key,value] of Object.entries(base))patch['base.'+key]=value;
  } else {
    patch.base = deleteField();
  }

  try{ await updateDoc(doc(db, "sections", sec.id), patch); await reload(); }
  catch(e){ console.error(e); alert("No se pudo editar la sección."); }
}

async function onDeleteSection(sec){
  if (!confirm(`Eliminar sección "${sec.title}" y TODO su contenido (items/toppings)?`)) return;
  try{
    for (const it of (sec.items||[])){ await deleteDoc(doc(db, "sections", sec.id, "items", it.id)); }
    for (const tp of (sec.toppings||[])){ await deleteDoc(doc(db, "sections", sec.id, "toppings", tp.id)); }
    await deleteDoc(doc(db, "sections", sec.id)); await reload();
  }catch(e){ console.error(e); alert("No se pudo eliminar la sección."); }
}

async function onChangeSectionOrder(sec){
  const data = await openForm({
    title: `Orden de: ${sec.title}`,
    submitLabel: "Guardar",
    initial: { order: typeof sec.order==="number" ? sec.order : 1 },
    fields: [ { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" } ]
  });
  if (!data) return;
  const order = Number(data.order);
  try{ await updateDoc(doc(db, "sections", sec.id), { order: isNaN(order)? 9999 : order, updatedAt: serverTimestamp() }); await reload(); }
  catch(e){ console.error(e); alert("No se pudo actualizar el orden."); }
}

/* ======= Items ======= */
async function onAddItem(sec){
  const data = await openForm({
    title: `Nuevo item en ${sec.title}`,
    submitLabel: "Crear",
    initial: { name:"", name_en:"", desc:"", desc_en:"", price:"", order:1, hidden:false },
    fields: [
      imageField,
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      ...(sec.id==='especiales'?[
        {name:'serve_hot',type:'checkbox',help:'Se sirve caliente'},
        {name:'serve_cold',type:'checkbox',help:'Se sirve frío',note:'Marca una o ambas opciones. Sin marcar: no se muestran iconos.'}
      ]:[]),
      { name:"desc", label:"Descripción (ES)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"desc_en", label:"Description (EN)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"price", label:"Precio", placeholder:"ej: 3.50" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
      { name:"hidden", type:"checkbox", help:"Ocultar este item" },
    ]
  });
  if (!data) return;

  const payload = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    hidden: !!data.hidden,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  if(sec.id==='especiales')payload.serving_temperatures=[...(data.serve_hot?['hot']:[]),...(data.serve_cold?['cold']:[])];
  if (data.image_url){payload.image_url=data.image_url;payload.image_frame=data.image_frame;}
  if (data.name_en) payload.name_en = data.name_en;
  if (data.desc) payload.desc = data.desc;
  if (data.desc_en) payload.desc_en = data.desc_en;
  if (data.price) payload.price = data.price;

  try{ await addDoc(collection(db, "sections", sec.id, "items"), payload); await reload(); }
  catch(e){ console.error(e); alert("No se pudo añadir el item."); }
}

async function onEditItem(sec, it){
  const data = await openForm({
    title: `Editar item: ${it.name}`,
    submitLabel: "Guardar",
    initial: {
      serve_hot:it.serving_temperatures?.includes("hot")||false,
      serve_cold:it.serving_temperatures?.includes("cold")||false,
      image_url:it.image_url || "",
      image_frame:it.image_frame || {},
      name: it.name || "",
      name_en: it.name_en || "",
      desc: it.desc || "",
      desc_en: it.desc_en || "",
      price: it.price || "",
      order: typeof it.order==="number" ? it.order : 1,
      hidden: !!it.hidden,
    },
    fields: [
      imageField,
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      ...(sec.id==='especiales'?[
        {name:'serve_hot',type:'checkbox',help:'Se sirve caliente'},
        {name:'serve_cold',type:'checkbox',help:'Se sirve frío',note:'Marca una o ambas opciones. Sin marcar: no se muestran iconos.'}
      ]:[]),
      { name:"desc", label:"Descripción (ES)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"desc_en", label:"Description (EN)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"price", label:"Precio" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
      { name:"hidden", type:"checkbox", help:"Ocultar este item" },
    ]
  });
  if (!data) return;

  const patch = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    hidden: !!data.hidden,
    updatedAt: serverTimestamp(),
  };
  if(sec.id==='especiales')patch.serving_temperatures=[...(data.serve_hot?['hot']:[]),...(data.serve_cold?['cold']:[])];
  patch.image_url = data.image_url || deleteField();
  patch.image_frame = data.image_url ? data.image_frame : deleteField();
  patch.name_en = data.name_en ? data.name_en : deleteField();
  patch.desc    = data.desc    ? data.desc    : deleteField();
  patch.desc_en = data.desc_en ? data.desc_en : deleteField();
  patch.price   = data.price   ? data.price   : deleteField();

  try{ await updateDoc(doc(db, "sections", sec.id, "items", it.id), patch); await reload(); }
  catch(e){ console.error(e); alert("No se pudo editar el item."); }
}

async function onDeleteItem(sec, it){
  if (!confirm(`Eliminar item "${it.name}"?`)) return;
  try{ await deleteDoc(doc(db, "sections", sec.id, "items", it.id)); await reload(); }
  catch(e){ console.error(e); alert("No se pudo eliminar el item."); }
}

async function onChangeItemOrder(sec, it){
  const data = await openForm({
    title: `Orden de: ${it.name}`,
    submitLabel: "Guardar",
    initial: { order: typeof it.order==="number" ? it.order : 1 },
    fields: [ { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" } ]
  });
  if (!data) return;
  const order = Number(data.order);
  try{ await updateDoc(doc(db, "sections", sec.id, "items", it.id), { order: isNaN(order) ? 9999 : order, updatedAt: serverTimestamp() }); await reload(); }
  catch(e){ console.error(e); alert("No se pudo actualizar el orden del item."); }
}

/* ======= Toppings ======= */
async function onAddTopping(sec){
  const data = await openForm({
    title: `Nuevo topping en ${sec.title}`,
    submitLabel: "Crear",
    initial: { name:"", name_en:"", price:"", order:1, hidden:false },
    fields: [
      imageField,
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"price", label:"Precio (opcional)", placeholder:"ej: 1.50" },
      ...(sec.id==='mini-pancakes'?[]:[{ name:"order", label:"Orden", type:"number", note:"Menor aparece primero" }]),
      {name:"free",type:"checkbox",help:"Topping gratuito"},
      { name:"hidden", type:"checkbox", help:"No disponible (ocultar en la carta)" },
    ]
  });
  if (!data) return;

  const payload = {
    name: data.name,
    ...(sec.id==='mini-pancakes'?{}:{order: isNaN(Number(data.order)) ? 9999 : Number(data.order)}),
    hidden: !!data.hidden,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  if (data.image_url){payload.image_url=data.image_url;payload.image_frame=data.image_frame;}
  if (data.name_en) payload.name_en = data.name_en;
  if (data.price) payload.price = data.price;

  payload.free=!!data.free;
  try{ await addDoc(collection(db, "sections", sec.id, "toppings"), payload); await reload(); }
  catch(e){ console.error(e); alert("No se pudo añadir el topping."); }
}

async function onEditTopping(sec, tp){
  const data = await openForm({
    title: `Editar topping: ${tp.name}`,
    submitLabel: "Guardar",
    initial: { image_url:tp.image_url || "", image_frame:tp.image_frame || {}, free:!!tp.free, name: tp.name || "", name_en: tp.name_en || "", price: tp.price || "", order: typeof tp.order==="number" ? tp.order : 1, hidden: !!tp.hidden },
    fields: [
      imageField,
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"price", label:"Precio (opcional)" },
      ...(sec.id==='mini-pancakes'?[]:[{ name:"order", label:"Orden", type:"number", note:"Menor aparece primero" }]),
      {name:"free",type:"checkbox",help:"Topping gratuito"},
      { name:"hidden", type:"checkbox", help:"No disponible (ocultar en la carta)" },
    ]
  });
  if (!data) return;

  const patch = {
    name: data.name,
    ...(sec.id==='mini-pancakes'?{}:{order: isNaN(Number(data.order)) ? 9999 : Number(data.order)}),
    hidden: !!data.hidden,
    updatedAt: serverTimestamp(),
  };
  patch.image_url = data.image_url || deleteField();
  patch.image_frame = data.image_url ? data.image_frame : deleteField();
  patch.name_en = data.name_en ? data.name_en : deleteField();
  patch.price   = data.price   ? data.price   : deleteField();

  patch.free=!!data.free;
  try{ await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), patch); await reload(); }
  catch(e){ console.error(e); alert("No se pudo editar el topping."); }
}

async function onDeleteTopping(sec, tp){
  if (!confirm(`Eliminar topping "${tp.name}"?`)) return;
  try{ await deleteDoc(doc(db, "sections", sec.id, "toppings", tp.id)); await reload(); }
  catch(e){ console.error(e); alert("No se pudo eliminar el topping."); }
}

async function onChangeToppingOrder(sec, tp){
  const data = await openForm({
    title: `Orden de: ${tp.name}`,
    submitLabel: "Guardar",
    initial: { order: typeof tp.order==="number" ? tp.order : 1 },
    fields: [ { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" } ]
  });
  if (!data) return;
  const order = Number(data.order);
  try{ await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), { order: isNaN(order) ? 9999 : order, updatedAt: serverTimestamp() }); await reload(); }
  catch(e){ console.error(e); alert("No se pudo actualizar el orden del topping."); }
}

/* ======= Init & Reload ======= */
async function initEditor(){ await reload(); }

async function reload(){
  const app = $("#sections");
  app.innerHTML = `<div class="loading">Cargando secciones…</div>`;
  try{
    const [sections,settings]=await Promise.all([loadSections(),getDoc(doc(db,"settings","menu"))]);
    STATE.settingsExists=settings.exists();
    STATE.meta=settings.exists()?settings.data():{};
    GROUPS=visualCategories(STATE.meta,sections).map(g=>({id:g.id,label:g.name[0]})).concat({id:"extras",label:"Extras"});
    STATE.sections = sections;
    STATE.byGroup = groupSections(sections);
    buildNav();renderVisualSettings();render();
  }catch(e){
    console.error(e);
    app.innerHTML = `<div class="note">Error cargando secciones. Revisa consola.</div>`;
  }
}

$('#editor-search').addEventListener('input',e=>{STATE.query=e.target.value;STATE.section='';render();});
$('#section-filter').addEventListener('change',e=>{STATE.section=e.target.value;render();});
$('#availability-filter').addEventListener('change',e=>{STATE.availability=e.target.value;render();});

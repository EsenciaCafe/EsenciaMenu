import {createOrderNotes} from './order-notes.js?v=1';
import {temperatureIcons} from '../shared/temperature.js';
import {frameStyle} from '../shared/photo-frame.js';
'use strict';
const $ = s => document.querySelector(s);
import {visualCategories, normaliseMenu, safeImageURL, escapeHTML, EXTRA_SECTIONS} from '../shared/menu-model.js';
let sections = [], groups = visualCategories(), meta = {}, loading = true, loadError = false;
const baseline = window.MENU_DATA.sections;
// Show recorded findings; missing data never implies absence of allergens.
const SHOW_ALLERGENS = true;
let products = [], allEntries = [];
let promoReady = false, promoShown = false;
const allergenNames = [
  ['Gluten','Gluten'],['Crustáceos','Crustaceans'],['Huevo','Egg'],['Pescado','Fish'],['Cacahuete','Peanuts'],['Soja','Soy'],['Leche','Milk'],['Frutos de cáscara','Tree nuts'],['Apio','Celery'],['Mostaza','Mustard'],['Sésamo','Sesame'],['Sulfitos','Sulphites'],['Altramuces','Lupin'],['Moluscos','Molluscs']
];
let lang = 'es', query = '', subcategory = 'all', selectedAllergens = new Set();
const en = () => lang === 'en';
const t = (a,b) => en() ? b : a;
const bi = pair => pair[en() ? 1 : 0];
const field = (obj,key) => en() ? obj[key+'_en'] || obj[key] || '' : obj[key] || obj[key+'_en'] || '';
const esc = escapeHTML;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money = v => new Intl.NumberFormat(en() ? 'en-IE' : 'es-ES',{style:'currency',currency:'EUR'}).format(v);
const numeric = item => item.free ? 0 : item.price === undefined || item.price === null || item.price === '' ? NaN : Number(String(item.price).replace(',','.'));
const price = item => item.free ? t('Gratis','Free') : Number.isFinite(numeric(item)) ? money(numeric(item)) : t('Consultar','Ask our team');
const art = name => `<svg viewBox="0 0 240 180" aria-hidden="true"><use href="#art-${name}"></use></svg>`;
const groupFor = sid => groups.find(g=>g.sections.includes(sid)) || groups[0];
const getSection = id => sections.find(s=>s.id===id);
const key = (s,i) => s.id+'|'+i.id;
const findEntry = k => allEntries.find(p=>p.key===k);
const orderNotes=createOrderNotes({t,field,findEntry});
const extraSections = new Set(EXTRA_SECTIONS);
function photo(url, alt, className='',frames={},slot='product') { const src=safeImageURL(url); return src ? `<span class="photo-frame ${className}" data-photo-slot="${slot}" style="${frameStyle(frames,slot)}"><img class="menu-photo" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"></span>` : ''; }
function groupArt(g) { return `<div class="group-art" style="--tone:${g.tone}">${art(g.art)}${photo(g.image_url,bi(g.name),'',g.image_frame,'group')}</div>`; }
function route(){const id=location.hash.slice(1);return id==='toda' ? 'toda' : groups.some(g=>g.id===id) ? id : 'inicio';}
function canonical(a){const n=norm(a);if(/gluten|trigo|avena|cebada|centeno/.test(n))return 'Gluten';return allergenNames.find(pair=>n.startsWith(norm(pair[0])))?.[0] || a;}
function allergenLabel(a){const c=canonical(a);if(!en())return a;const name=allergenNames.find(x=>x[0]===c)?.[1] || a;return a.includes('Trigo') ? 'Wheat (gluten)' : a.includes('Avena') ? 'Oats (gluten group)' : /pistacho/i.test(a) ? name+' (pistachio)' : /avellana/i.test(a) ? name+' (hazelnut)' : /almendra/i.test(a) ? name+' (almond)' : name;}
function isSelected(a){return selectedAllergens.has(canonical(a));}
function hasRisk(item){return [...item.allergens.contains,...item.allergens.traces].some(isSelected);}
function tags(item){if(!SHOW_ALLERGENS)return '';const a=item.allergens;return `<div class="allergen-tags">${a.contains.map(x=>`<span class="tag ${isSelected(x)?'warning':''}">${esc(allergenLabel(x))}</span>`).join('')}${a.traces.some(isSelected)?`<span class="tag warning">${t('Posibles trazas','Possible traces')}</span>`:''}</div>`;}
function nav(){return `<nav class="category-nav" aria-label="${t('Categorías','Categories')}">${groups.map(g=>`<button class="chip" data-group="${g.id}" aria-pressed="${route()===g.id}">${esc(bi(g.name))}</button>`).join('')}<button class="chip" data-group="toda" aria-pressed="${route()==='toda'}">${t('Toda la carta','Full menu')}</button></nav>`;}
function notice(){if(!SHOW_ALLERGENS)return '';return selectedAllergens.size ? `<p class="filter-notice">${t('Destacando','Highlighting')}: <strong>${[...selectedAllergens].map(x=>esc(allergenLabel(x))).join(', ')}</strong>. ${t('No se ocultan productos. La información está en revisión; que un producto no esté resaltado no significa que sea apto.','Products remain visible. Information is under review; an unmarked product is not necessarily suitable.')}</p>` : '';}
function temperatureLegend(){return `<div class="temperature-legend"><span>${temperatureIcons({serving_temperatures:['hot']})}${t('Caliente','Hot')}</span><span>${temperatureIcons({serving_temperatures:['cold']})}${t('Frío','Cold')}</span></div>`;}
function card(p,featured=false){
  const {s,i}=p, isExtra=extraSections.has(s.id)||s.toppings.some(x=>x.id===i.id);
  return `<button class="product-card ${i.image_url?'with-photo':''} ${hasRisk(i)?'flagged':''}" data-product="${esc(p.key)}" aria-label="${esc(field(i,'name'))}, ${esc(price(i))}. ${t('Ver detalles','View details')}">${photo(i.image_url,field(i,'name'),'product-photo',i.image_frame,featured?'featured':'product')}<span class="kicker">${esc(field(s,'title'))}${isExtra?' · '+t('Complemento','Extra'):''}</span><h3>${esc(field(i,'name'))}${temperatureIcons(i,en())}</h3>${field(i,'desc')?`<p class="description">${esc(field(i,'desc'))}</p>`:''}${tags(i)}<span class="card-bottom"><span class="price">${isExtra&&!i.free&&Number.isFinite(numeric(i))?'+ ':''}${esc(price(i))}</span><span class="details">${i.id==='base'?t('Ver toppings','View toppings'):t('Ver detalles','View details')}</span></span></button>`;
}
function renderHome(){
  return `<section class="hero"><div><p class="eyebrow">${t('BIENVENIDO A ESENCIA','WELCOME TO ESENCIA')}</p><h1>${t('Tu pausa,<br><em>a tu manera.</em>','Your moment,<br><em>your way.</em>')}</h1><p>${t('Algo rico, un buen café y ese ratito para ti.<br>Encuentra lo que te apetece.','Something delicious, a good coffee and a little time for yourself. Find your favourite.')}</p></div><div class="hero-art">${art('coffee')}${photo(meta.visual_hero_image,t('Esencia, café y momentos','Esencia, coffee and moments'),'hero-photo',meta.visual_hero_frame,'hero')}<span class="hero-spark" aria-hidden="true">✧</span><span class="hero-stamp">${t('PEQUEÑOS<br>PLACERES','LITTLE<br>PLEASURES')}</span></div></section>
    <div class="section-heading"><h2>${t('¿Qué te apetece hoy?','What are you in the mood for?')}</h2><button class="text-link" data-group="toda">${t('Ver toda la carta','View full menu')}</button></div>
    <div class="category-grid">${groups.map((g,n)=>`<button class="category" data-group="${g.id}" style="--tone:${g.tone}"><div class="category-visual"><span class="category-number">0${n+1}</span>${art(g.art)}${photo(g.image_url,bi(g.name),'',g.image_frame,'category')}</div><div class="category-label"><h3>${esc(bi(g.name))}</h3><p>${esc(bi(g.desc))}</p></div></button>`).join('')}</div>
    <aside class="callout"><span aria-hidden="true">❋</span><div><strong>${t('Disfruta con toda la información.','A little more information, a better moment.')}</strong><p>${t('Si tienes alguna alergia, consulta con nuestro equipo antes de pedir.','If you have any allergies, please ask our team before ordering.')}</p></div><button data-allergens hidden>${t('Ver mis alérgenos','My allergens')}</button></aside>`;
}
function render(){
  if (loading) { $('#content').innerHTML=`<div class="loading-state" role="status">${t('Cargando la carta…','Loading the menu…')}</div>`; return; }
  if (loadError) { $('#content').innerHTML=`<div class="empty"><h1>${t('No se ha podido cargar la carta.','The menu could not be loaded.')}</h1><p>${t('Comprueba la conexión e inténtalo de nuevo.','Check your connection and try again.')}</p><button class="primary" data-retry>${t('Reintentar','Try again')}</button></div>`; return; }
  let content;
  if(query.trim()){
    const terms=norm(query).trim().split(/\s+/);
    const found=allEntries.filter(({s,i})=>terms.every(q=>norm([i.name,i.name_en,i.desc,i.desc_en,s.title,s.title_en,s.id==='mini-pancakes'?'poffertjes pancakes':''].join(' ')).includes(q)));
    content=`<div class="breadcrumb"><a href="#inicio" data-reset>${t('← Inicio','← Home')}</a></div><div class="collection-head"><div><p class="eyebrow">${t('BUSCAR EN TODA LA CARTA','SEARCH THE ENTIRE MENU')}</p><h1>${t('Encuentra tu momento.','Find your moment.')}</h1></div></div><p class="results-summary" role="status">${found.length} ${t('resultados para','results for')} «${esc(query)}»</p>${notice()}<div class="product-grid">${found.length?found.map(p=>card(p,found.length===1)).join(''):`<div class="empty"><h2>${t('No hemos encontrado ese antojo.','We couldn’t find that craving.')}</h2><p>${t('Prueba con «café», «tosta» o «matcha».','Try “coffee”, “toast” or “matcha”.')}</p><button class="primary" data-reset>${t('Volver a las categorías','Back to categories')}</button></div>`}</div>`;
  } else if(route()==='inicio') content=renderHome();
  else {
    const g=groups.find(x=>x.id===route());
    const relevant=sections.filter(s=>g?g.sections.includes(s.id):!extraSections.has(s.id));
    let found=products.filter(p=>relevant.includes(p.s)&&(subcategory==='all'||p.s.id===subcategory));
    if(g) found.sort((a,b)=>g.sections.indexOf(a.s.id)-g.sections.indexOf(b.s.id));
    content=`<div class="breadcrumb"><a href="#inicio" data-reset>${t('← Categorías','← Categories')}</a><span>/</span><span>${g?esc(bi(g.name)):t('Toda la carta','Full menu')}</span></div><div class="collection-head" style="--tone:${g?.tone||'#ead4d0'}"><div><p class="eyebrow">${t('LA CARTA DE ESENCIA','THE ESENCIA MENU')}</p><h1>${g?esc(bi(g.name)):t('Un poquito de todo.','A little of everything.')}</h1><p>${g?esc(bi(g.desc)):t('Explora todos nuestros productos. Los extras están dentro de cada ficha.','Explore every product. Find extras inside each product card.')}</p></div>${groupArt(g||groups[2])}</div>${nav()}${relevant.length>1?`<div class="subnav" aria-label="${t('Tipo de producto','Product type')}"><button class="chip" data-sub="all" aria-pressed="${subcategory==='all'}">${t('Todos','All')}</button>${relevant.map(s=>`<button class="chip" data-sub="${s.id}" aria-pressed="${subcategory===s.id}">${esc(field(s,'title'))}</button>`).join('')}</div>`:''}${notice()}<p class="results-summary">${found.length} ${t((found.length===1?'producto':'productos')+' · abre una ficha para ver ingredientes y opciones',(found.length===1?'product':'products')+' · open a card for ingredients and options')}</p>${found.some(p=>p.i.serving_temperatures?.length)?temperatureLegend():''}<div class="product-grid">${found.map(p=>card(p,found.length===1)).join('')}</div>`;
  }
  $('#content').innerHTML=content;
  $('#filter-count').hidden=!selectedAllergens.size;
  $('#filter-count').textContent=selectedAllergens.size;
}
function extraOptions(p){
  if(p.i.id==='base') return p.s.toppings.map(i=>({s:p.s,i,key:key(p.s,i)}));
  const sid=['tostas','croissants-dulces'].includes(p.s.id)?'extras-tostas':['cafe','especiales','matcha','chocolate-caliente'].includes(p.s.id)?'extras-bebidas':null;
  const s=getSection(sid);
  return s ? s.items.map(i=>({s,i,key:key(s,i)})) : [];
}
function extrasCatalogue(extras, p){
  if(!extras.length)return '';
  return `<section class="extras-catalogue"><div class="extras-title"><h3>${p.i.id==='base'?t('Toppings para acompañar','Toppings to enjoy'):t('Extras disponibles','Available extras')}</h3><span>${t('Opcionales','Optional')}</span></div><p class="reduced-info">${t('Cada complemento tiene su precio indicado. Dinos cómo te apetece.','Each extra has its own price. Tell us how you like it.')}</p><div class="extras-grid">${extras.map(x=>`<article class="extra-info">${photo(x.i.image_url,field(x.i,'name'),'extra-photo',x.i.image_frame,'extra')}<div class="extra-heading"><h4>${esc(field(x.i,'name'))}</h4><span>${!x.i.free&&Number.isFinite(numeric(x.i))?'+ ':''}${esc(price(x.i))}</span></div>${tags(x.i)}<details class="extra-allergens"><summary>${t('Consultar alérgenos','Check allergens')}</summary>${allergenBox([x])}</details></article>`).join('')}</div></section>`;
}
function combinedFindings(entries){
  const contains=[...new Set(entries.flatMap(p=>p.i.allergens.contains))];
  const traces=[...new Set(entries.flatMap(p=>p.i.allergens.traces))];
  return {contains,traces};
}
function allergenBox(entries){
  if(!SHOW_ALLERGENS)return '';
  const a=combinedFindings(entries);
  return `<div class="allergen-box"><h3>${t('Información de alérgenos','Allergen information')}</h3>${a.contains.length?`<p><strong>${t('Contiene:','Contains:')}</strong></p><div class="allergen-tags">${a.contains.map(x=>`<span class="tag ${isSelected(x)?'warning':''}">${esc(allergenLabel(x))}</span>`).join('')}</div>`:`<p>${t('Consulta los alérgenos de este producto con nuestro equipo.','Please ask our team about allergens in this product.')}</p>`}${a.traces.length?`<p><strong>${t('Puede contener trazas de:','May contain traces of:')}</strong> ${a.traces.map(x=>esc(allergenLabel(x))).join(', ')}</p>`:''}<p class="review-note">${t('Si tienes alguna alergia, consulta con nuestro equipo antes de pedir. Los extras y la preparación pueden cambiar los alérgenos.','If you have any allergies, ask our team before ordering. Extras and preparation can change the allergens.')}</p></div>`;
}

function openProduct(k){
  const p=findEntry(k);if(!p)return;
  const g=groupFor(p.s.id),extras=extraOptions(p);
  const image=p.i.image_url;
  $('#product-content').innerHTML=`<div class="dialog-art ${image?'has-photo':''}" style="--tone:${g.tone}">${art(g.art)}${photo(image,field(p.i,'name'),'detail-photo',p.i.image_frame,'detail')}</div><div class="dialog-body"><p class="eyebrow">${esc(field(p.s,'title'))}</p><h2 id="product-title">${esc(field(p.i,'name'))}${temperatureIcons(p.i,en())}</h2>${p.i.serving_temperatures?.length?`<p class="reduced-info">${t('Disponible: ','Available: ')}${[p.i.serving_temperatures.includes('hot')?t('caliente','hot'):'',p.i.serving_temperatures.includes('cold')?t('frío','cold'):''].filter(Boolean).join(t(' y ',' and '))}</p>`:''}${field(p.i,'desc')?`<p class="dialog-description">${esc(field(p.i,'desc'))}</p>`:''}${field(p.s,'subtitle')?`<p class="reduced-info">${esc(field(p.s,'subtitle'))}</p>`:''}<div class="dialog-price">${esc(price(p.i))}<small>${t('IGIC incluido','IGIC tax included')}</small></div><div class="order-add-row"><button class="primary" data-add-order="${esc(p.key)}">${t('Añadir a mi pedido','Add to my order')}</button><button class="text-link" data-open-order>${t('Ver mi pedido','View my order')}</button><p>${t('Una lista para enseñarnos al pedir. No se envía al equipo.','A list to show us when ordering. Not sent to our team.')}</p><span class="order-add-status" role="status"></span></div><div>${tags(p.i)}</div><button class="text-link" data-show-allergens>${t('Ver información de alérgenos ↓','View allergen information ↓')}</button>${field(p.s,'note')?`<p class="section-note">${esc(field(p.s,'note'))}</p>`:''}${extrasCatalogue(extras,p)}<div id="product-allergens">${allergenBox([p])}</div><p class="reduced-info">${t('Si tienes alguna alergia, consulta los ingredientes y la preparación con nuestro equipo antes de pedir.','If you have any allergies, ask our team about ingredients and preparation before ordering.')}</p></div>`;
  $('#product-dialog').showModal();
  $('#product-dialog').scrollTop=0;
}
function openAllergens(){
  if(!SHOW_ALLERGENS)return;
  $('#allergen-content').innerHTML=`<div class="dialog-body"><p class="eyebrow">${t('UNA CARTA MÁS CLARA','A CLEARER MENU')}</p><h2 id="allergen-title">${t('Mis alérgenos','My allergens')}</h2><p class="dialog-description">${t('Selecciona los alérgenos que quieres tener a la vista. Destacaremos las coincidencias identificadas y las posibles trazas.','Select the allergens you want to keep in view. We will highlight identified matches and possible traces.')}</p><p class="filter-notice">${t('No es un filtro de productos aptos. Los datos están en revisión y no se ocultan productos con información incompleta. Consulta siempre con nuestro equipo.','This is not a suitability filter. Data is under review and products with incomplete information remain visible. Always check with our team.')}</p><div class="allergen-selector">${allergenNames.map(pair=>`<label class="extra"><input type="checkbox" data-allergen value="${esc(pair[0])}" ${selectedAllergens.has(pair[0])?'checked':''}><span>${esc(bi(pair))}</span></label>`).join('')}</div><div class="modal-actions"><button class="text-link" data-clear-allergens>${t('Limpiar selección','Clear selection')}</button><button class="primary" data-close="allergen-dialog">${t('Ver la carta','View menu')}</button></div></div>`;
  $('#allergen-dialog').showModal();
}
function setLanguage(){
  document.documentElement.lang=lang;
  orderNotes.refresh();
  $('#order-hint').textContent=t('¿Sois varios? Guarda lo que vais a pedir en «Mi pedido».','A group visit? Keep your choices in “My order”.');
  $('#language').innerHTML=en()?'EN <span>/ ES</span>':'ES <span>/ EN</span>';
  $('#language').setAttribute('aria-label',en()?'Cambiar a español':'Switch to English');
  $('#proposal-bar').textContent=t('VISTA PREVIA · Alérgenos en revisión','PREVIEW · Allergens under review');
  $('#promo-open').textContent=t('Café del mes','Coffee of the month');
  $('#header-note').textContent=t('Un pequeño placer, cada día.','A little pleasure, every day.');
  $('#search').placeholder=t('Buscar en la carta…','Search the menu…');
  $('#search').setAttribute('aria-label',t('Buscar en toda la carta','Search the entire menu'));
  $('#allergen-button-label').textContent=t('Mis alérgenos','My allergens');
  $('#footer-note').textContent=t('Precios con IGIC incluido · Si tienes alguna alergia, habla con nuestro equipo.','Prices include IGIC tax · If you have an allergy, please speak to our team.');
  $('#footer-home').textContent=t('Volver al inicio ↑','Back to home ↑');
  $('.skip').textContent=t('Ir a la carta','Skip to menu');
  $('.brand-logo').setAttribute('aria-label',t('Esencia, inicio','Esencia, home'));
  document.querySelectorAll('.close').forEach(b=>b.setAttribute('aria-label',t('Cerrar','Close')));
  render();
}
function go(id){query='';$('#search').value='';subcategory='all';if(location.hash==='#'+id){render();window.scrollTo(0,0);}else location.hash=id;}
document.addEventListener('click',e=>{
  const add=e.target.closest('[data-add-order]');if(add){const p=findEntry(add.dataset.addOrder);if(p&&orderNotes.add(p)){add.disabled=true;add.textContent=t('Añadido','Added');$('.order-add-status').textContent=t('Ajusta cantidades, extras y notas en «Ver mi pedido».','Adjust quantities, extras and notes in “View my order”.');}return;}
  if(e.target.closest('[data-open-order]')){$('#product-dialog').close();orderNotes.open();return;}
  if(e.target.closest('[data-retry]')){start();return;}
  if(e.target.closest('[data-show-allergens]')){$('#product-allergens').scrollIntoView({block:'start'});return;}
  const product=e.target.closest('[data-product]');if(product){openProduct(product.dataset.product);return;}
  const group=e.target.closest('[data-group]');if(group){
    const category=groups.find(g=>g.id===group.dataset.group);
    const entries=category?products.filter(p=>category.sections.includes(p.s.id)):[];
    if(entries.length===1)openProduct(entries[0].key);
    else go(group.dataset.group);
    return;
  }
  const sub=e.target.closest('[data-sub]');if(sub){subcategory=sub.dataset.sub;render();return;}
  if(e.target.closest('[data-reset],.brand-logo,#footer-home')){e.preventDefault();go('inicio');return;}
  if(e.target.closest('[data-allergens],#allergen-button')){openAllergens();return;}
  const close=e.target.closest('[data-close]');if(close){document.getElementById(close.dataset.close).close();return;}
  if(e.target.closest('[data-clear-allergens]')){selectedAllergens.clear();document.querySelectorAll('[data-allergen]').forEach(i=>i.checked=false);render();}
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-allergen]')){e.target.checked?selectedAllergens.add(e.target.value):selectedAllergens.delete(e.target.value);render();}
});
$('#search').addEventListener('input',e=>{query=e.target.value;render();});
$('#language').addEventListener('click',()=>{lang=en()?'es':'en';setLanguage();});
window.addEventListener('hashchange',()=>{subcategory='all';query='';$('#search').value='';render();window.scrollTo(0,0);$('#content').focus({preventScroll:true});});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
setLanguage();

// Failed photos fall back to the illustration/layout without leaving broken-image icons.
document.addEventListener('error', e=>{
  if(e.target.matches?.('.menu-photo')) {e.target.closest('.photo-frame')?.remove();}
},true);

function promoText(value){return typeof value==='string'?value:(en()?value?.en||value?.es:value?.es||value?.en)||'';}
async function preparePromo(){
  promoReady=false;$('#promo-open').hidden=true;
  const raw=meta.promo_enabled?safeImageURL(meta.promo_image_url):'';
  if(!raw)return;
  let url=raw;
  if(!raw.startsWith('data:')){const u=new URL(raw);u.searchParams.set('v',String(meta.promo_version||'v1'));url=u.href;}
  const img=new Image();img.src=url;
  try {await img.decode();}catch{return;}
  $('#promo-image').src=url;promoReady=true;$('#promo-open').hidden=false;
  if(!promoShown&&!document.querySelector('dialog[open]'))showPromo();
}
function showPromo(){
  if(!promoReady)return;
  const langTitle=promoText(meta.promo_title)||t('Café del mes','Coffee of the month');
  $('#promo-title').textContent=langTitle;
  $('#promo-image').alt=promoText(meta.promo_alt)||langTitle;
  $('#promo-view-menu').textContent=t('Ver carta','View menu');
  const raw=promoText(meta.promo_link),link=$('#promo-link');
  const url=safeImageURL(raw);
  if(url&&!url.startsWith('data:')){link.href=url;link.removeAttribute('aria-disabled');}
  else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');}
  promoShown=true;$('#promo-dialog').showModal();
}
$('#promo-open').addEventListener('click',showPromo);
async function start(){
  loading=true;loadError=false;render();
  try{
    const {readMenu}=await import('../shared/menu-repository.js');
    const live=await readMenu();meta=live.meta;
    sections=normaliseMenu(live.sections,baseline);groups=visualCategories(meta,sections);
    products=sections.flatMap(s=>s.items.map(i=>({s,i,key:key(s,i)})));
    allEntries=[...products,...sections.flatMap(s=>s.toppings.map(i=>({s,i,key:key(s,i)})))];
    loading=false;render();preparePromo();
  }catch(e){console.error('No se pudo cargar la carta',e);loading=false;loadError=true;render();}
}
start();

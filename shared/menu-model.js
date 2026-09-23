// Shared by the public visual menu and its existing Firebase editor.
export const DEFAULT_CATEGORIES = [
  {id:'desayunos', name:['Tostas y desayunos','Toast & breakfast'], desc:['Tostas, croissants, sándwich y yogur','Toast, croissants, sandwich & yoghurt'], art:'toast', tone:'#e4e7d8', sections:['tostas','croissants-dulces','sandwich','yogurt']},
  {id:'pancakes', name:['Mini pancakes','Mini pancakes'], desc:['12 pequeños bocados, a tu gusto','12 little bites, made your way'], art:'pancakes', tone:'#f0dfc6', sections:['mini-pancakes']},
  {id:'cafe', name:['Cafés y especiales','Coffee & specials'], desc:['Clásicos, lattes y chocolate','Classics, lattes & chocolate'], art:'coffee', tone:'#ead4d0', sections:['cafe','especiales','chocolate-caliente']},
  {id:'matcha', name:['Matcha','Matcha'], desc:['Tu pausa en verde','A little green moment'], art:'matcha', tone:'#dde5cb', sections:['matcha']},
  {id:'bebidas', name:['Bebidas frías','Cold drinks'], desc:['Smoothies, batidos, té frío y más','Smoothies, shakes, iced tea & more'], art:'cold', tone:'#efdbd1', sections:['smoothies','batidos','te-frio','refrescos']},
  {id:'te', name:['Tés e infusiones','Tea & infusions'], desc:['Para disfrutar sin prisa','Slow down, sip & enjoy'], art:'tea', tone:'#e5e2d3', sections:['te-caliente']}
];
export const EXTRA_SECTIONS = ['extras-tostas','extras-bebidas'];
export const MAX_IMAGE_LENGTH = 96 * 1024;
export const ROOT_URL = new URL('../', import.meta.url);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function safeImageURL(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(raw)) return raw.length <= MAX_IMAGE_LENGTH ? raw : '';
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:/i.test(raw)) return '';
  try {
    // Existing promotions use repository-relative paths, also when viewed in /propuesta/.
    const u = new URL(raw.replace(/^https:\/\/github\.com\/EsenciaCafe\/EsenciaMenu\/blob\/main\//, ''), ROOT_URL);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch { return ''; }
}

export function categoryForSection(section) {
  if (EXTRA_SECTIONS.includes(section.id)) return 'extras';
  if (DEFAULT_CATEGORIES.some(g=>g.id===section.visual_category)) return section.visual_category;
  const known = DEFAULT_CATEGORIES.find(g=>g.sections.includes(section.id));
  if (known) return known.id;
  const group = String(section.group || '').toLowerCase();
  return /poff|pancake/.test(group) ? 'pancakes' : /caf/.test(group) ? 'cafe' : /bebid/.test(group) ? 'bebidas' : 'desayunos';
}

export function visualCategories(meta = {}, sections = []) {
  return DEFAULT_CATEGORIES.map(g => {
    const saved = meta.visual_categories?.[g.id] || {};
    return {...g,
      name:[saved.name_es || g.name[0], saved.name_en || g.name[1]],
      desc:[saved.desc_es ?? g.desc[0], saved.desc_en ?? g.desc[1]],
      image_url:safeImageURL(saved.image_url), image_frame:saved.image_frame || {},
      sections:sections.filter(s=>categoryForSection(s)===g.id).map(s=>s.id)
    };
  });
}

export function normaliseAllergens(value, pending = 'Información pendiente de revisar.') {
  return {
    contains:Array.isArray(value?.contains) ? value.contains.filter(x=>typeof x==='string') : [],
    traces:Array.isArray(value?.traces) ? value.traces.filter(x=>typeof x==='string') : [],
    pending:typeof value?.pending==='string' ? value.pending : pending,
    basis:typeof value?.basis==='string' ? value.basis : '',
    status:'draft'
  };
}

export function alphabeticalToppings(a,b) {
  return String(a.name||a.name_en||'').trim().localeCompare(String(b.name||b.name_en||'').trim(),'es',{sensitivity:'base',numeric:true}) || String(a.id||'').localeCompare(String(b.id||''));
}

export function normaliseMenu(rawSections, baseline = []) {
  const byId = new Map(baseline.map(s=>[s.id,s]));
  const order = (a,b) => (Number(a.order ?? 999)-Number(b.order ?? 999)) || String(a.name||a.title||'').localeCompare(String(b.name||b.title||''),'es');
  return rawSections.filter(s=>!s.hidden).map(s => {
    const old = byId.get(s.id);
    const item = (i, kind) => {
      const previous = old?.[kind]?.find(x=>x.id===i.id);
      // A changed name/recipe must not silently retain an old allergen declaration.
      const sameRecipe = previous && previous.name===i.name && (previous.desc||'')===(i.desc||'');
      return {...i, image_url:safeImageURL(i.image_url), allergens:normaliseAllergens(i.allergens || (sameRecipe ? previous.allergens : null))};
    };
    const items = (s.items||[]).filter(i=>!i.hidden).map(i=>item(i,'items')).sort(order);
    if (s.base?.price !== null && s.base?.price !== undefined && s.base?.price !== '') {
      const previous = old?.items?.find(i=>i.id==='base');
      items.unshift({id:'base', name:s.base.name || (s.id==='mini-pancakes'?'12 mini pancakes':s.title),
        name_en:s.base.name_en || (s.id==='mini-pancakes'?'12 mini pancakes':s.title_en),
        desc:s.base.description || '', desc_en:s.base.description_en || '', price:s.base.price,
        image_url:safeImageURL(s.base.image_url),image_frame:s.base.image_frame || {},
        allergens:normaliseAllergens(s.base.allergens || (s.base.allergens_revision_required ? null : previous?.allergens))});
    }
    return {...s, items, toppings:(s.toppings||[]).filter(i=>!i.hidden).map(i=>item(i,'toppings')).sort(s.id==='mini-pancakes'?alphabeticalToppings:order)};
  }).sort(order);
}

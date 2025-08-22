// app.js
// Lee la carta desde Firestore, pinta con tus estilos y
// ordena las secciones por `order` dentro de cada categoría,
// y también ordena items/toppings por `order`.

import { db } from "./firebase.js";
import {
  getDocs, getDoc, collection, doc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ========= Helpers ========= */
function $(sel, el = document){ return el.querySelector(sel); }
function $all(sel, el = document){ return [...el.querySelectorAll(sel)]; }

const slug = (s="") =>
  String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

const formatPrice = (n) => {
  if (typeof n === "number") {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
      .format(n).replace(/\u00A0/g,' ');
  }
  if (typeof n === "string") {
    const hasEuro = /€/.test(n);
    let v = n.trim().replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(v);
    if (!isNaN(num)) {
      const out = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
      return hasEuro ? out + "€" : out + " €";
    }
    return n;
  }
  return "";
};

/* ========= Tabs (chips) ========= */
const GROUPS = [
  { id: "poffertjes", label: "Poffertjes" },
  { id: "cafe",        label: "Café" },
  { id: "desayunos",   label: "Desayunos" },
  { id: "bebidas",     label: "Bebidas" },
];

const groupToId = (g) => {
  const s = slug(g || "");
  if (/^poff/.test(s)) return "poffertjes";
  if (/^cafe/.test(s) || /^caf/.test(s)) return "cafe";
  if (/^desayun/.test(s)) return "desayunos";
  if (/^bebid/.test(s)) return "bebidas";
  return s || "otros";
};

/* ========= Estado ========= */
let STATE = {
  meta: {},
  sections: [],
  byGroup: {},   // { groupId: [sections] }
};

/* ========= Carga de datos (rápida con Promise.all) ========= */
async function loadData(){
  // Meta (opcional)
  let meta = {};
  try {
    const metaSnap = await getDoc(doc(collection(db, "settings"), "menu"));
    if (metaSnap.exists()) meta = metaSnap.data();
  } catch (e) {
    console.warn("No se pudo leer settings/menu:", e);
  }

  // Secciones
  const secsSnap = await getDocs(collection(db, "sections"));

  // Paraleliza subcolecciones para acelerar
  const sections = await Promise.all(
    secsSnap.docs.map(async (secDoc) => {
      const base = secDoc.data();  // incluye title, group, subtitle, note, base, order, etc.
      const sid  = secDoc.id;

      const [itemsSnap, toppingsSnap] = await Promise.all([
        getDocs(collection(db, "sections", sid, "items")).catch(()=>({docs:[]})),
        getDocs(collection(db, "sections", sid, "toppings")).catch(()=>({docs:[]})),
      ]);

      const items    = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const toppings = toppingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return { id: sid, ...base, ...(items.length?{items}:{}) , ...(toppings.length?{toppings}:{}) };
    })
  );

  // Orden general de secciones: por grupo (chips) y luego alfabético (solo como orden global)
  sections.sort((a,b)=>{
    const ga = GROUPS.findIndex(g => g.id === groupToId(a.group || a.title || a.id));
    const gb = GROUPS.findIndex(g => g.id === groupToId(b.group || b.title || b.id));
    if (ga !== gb) return ga - gb;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  return { meta, sections };
}

/* ========= Agrupar por categoría ========= */
function groupSections(sections){
  const map = {};
  for (const sec of sections) {
    const gid = groupToId(sec.group || sec.title || sec.id);
    if (!map[gid]) map[gid] = [];
    map[gid].push(sec);
  }
  return map;
}

/* ========= Render ========= */
function buildNav(groupsAvailable){
  const nav = $("#nav");
  nav.innerHTML = GROUPS
    .filter(g => groupsAvailable.includes(g.id))
    .map((g, i) => `
      <a href="#${g.id}" class="${i===0 ? "active" : ""}" data-tab="${g.id}">
        ${g.label}
      </a>
    `)
    .join("");

  // eventos
  $all("#nav a").forEach(a=>{
    a.addEventListener("click", (e)=>{
      e.preventDefault();
      const tab = a.dataset.tab;
      $all("#nav a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      renderTab(tab);
    });
  });
}

function renderBaseAndToppings(sec){
  let html = "";
  if (sec.base && (sec.base.title || sec.base.description || sec.base.price)) {
    const title = sec.base.title ? `<strong>${sec.base.title}</strong>` : "";
    const desc  = sec.base.description ? sec.base.description : "";
    const price = sec.base.price ? formatPrice(sec.base.price) : "";
    html += `
      <div class="note">
        ${title}${title && (desc||price) ? " — " : ""}
        ${desc}${desc && price ? " — " : ""}${price}
      </div>
    `;
  }
  if (Array.isArray(sec.toppings) && sec.toppings.length) {
    const tops = sec.toppings
      .slice()
      .sort((a,b)=>{
        const ao = (typeof a.order === "number") ? a.order : 9999;
        const bo = (typeof b.order === "number") ? b.order : 9999;
        if (ao !== bo) return ao - bo;
        return (a.name || "").localeCompare(b.name || "", "es");
      });

    html += `
      <div class="card">
        <div class="title">Toppings</div>
        <div class="muted">Elige los que quieras</div>
        <div class="toppings">
          ${tops.map(t => `<span class="badge">${t.name}${t.price ? " — " + formatPrice(t.price) : ""}</span>`).join("")}
        </div>
      </div>
    `;
  }
  return html;
}

function renderItemsList(items = []){
  if (!items.length) return "";

  const sorted = items.slice().sort((a,b)=>{
    const ao = (typeof a.order === "number") ? a.order : 9999;
    const bo = (typeof b.order === "number") ? b.order : 9999;
    if (ao !== bo) return ao - bo;
    return (a.name || "").localeCompare(b.name || "", "es");
  });

  return `
    <div class="grid">
      ${sorted.map(it => `
        <div class="card">
          <div class="title">
            <span>${it.name || ""}</span>
            <span style="float:right">${it.price ? formatPrice(it.price) : ""}</span>
          </div>
          ${it.desc ? `<div class="muted">${it.desc}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderSection(sec){
  const subtitle = sec.subtitle ? `<div class="muted" style="margin:6px 0 10px">${sec.subtitle}</div>` : "";
  const note     = sec.note ? `<div class="note">${sec.note}</div>` : "";

  const isPoff = groupToId(sec.group || sec.title || sec.id) === "poffertjes";
  const poffBlock = isPoff ? renderBaseAndToppings(sec) : "";

  return `
    <section class="section" id="${slug(sec.title || sec.id)}">
      <h2>${sec.title || ""}</h2>
      ${subtitle}
      ${poffBlock || note}
      ${renderItemsList(sec.items)}
    </section>
  `;
}

/* ========= Orden dentro de cada categoría POR `order` ========= */
function renderTab(tabId){
  const app = $("#app");
  let sections = STATE.byGroup[tabId] || [];

  // Orden por 'order' asc dentro del grupo; sin order va al final; desempate por título
  sections = sections.slice().sort((a, b) => {
    const ao = (typeof a.order === "number") ? a.order : 9999;
    const bo = (typeof b.order === "number") ? b.order : 9999;
    if (ao !== bo) return ao - bo;
    return (a.title || "").localeCompare(b.title || "", "es");
  });

  app.innerHTML = sections.map(renderSection).join("") || `
    <section class="section"><p class="muted">No hay elementos en esta categoría.</p></section>
  `;

  // Anti-overflow defensivo post-render
  $all(".grid .card .title").forEach(el => { el.style.minWidth = "0"; });
}

/* ========= Init ========= */
(async ()=>{
  const app = $("#app");
  app.innerHTML = `<div class="loading">Cargando carta…</div>`;

  try{
    const { meta, sections } = await loadData();
    STATE.meta = meta;
    STATE.sections = sections;
    STATE.byGroup = groupSections(sections);

    // Construir nav con los grupos que realmente existen
    const groupsAvailable = GROUPS
      .map(g => g.id)
      .filter(id => STATE.byGroup[id] && STATE.byGroup[id].length);
    buildNav(groupsAvailable);

    // Render inicial (primera pestaña disponible)
    renderTab(groupsAvailable[0] || GROUPS[0].id);

    // Nota IGIC si viene de meta
    if (meta && meta.igic_note) {
      const ig = $("#igic-note");
      if (ig) ig.textContent = meta.igic_note;
    }
  }catch(err){
    console.error(err);
    app.innerHTML = `<div class="section"><p>No se pudo cargar la carta. Revisa la conexión con Firebase/Firestore y tu archivo <code>firebase.js</code>.</p></div>`;
  }
})();

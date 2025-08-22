// app.js
// Lee la carta desde Firestore y mantiene la estética con chips fijos (4 en una línea)

import { db } from "./firebase.js";
import {
  getDocs, getDoc, collection, doc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ========= Utilidades ========= */
const $$ = (sel, el = document) => el.querySelector(sel);
const $$$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const slug = (s="") =>
  String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

const formatPrice = (n) => {
  // Acepta "3,50€", "3.50", number, etc. y devuelve "3,50 €"
  if (typeof n === "number") {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
      .format(n).replace(/\u00A0/g,' ');
  }
  if (typeof n === "string") {
    // Normaliza separador y añade € si falta
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

/* ========= Orden & Tabs ========= */
// Orden y etiquetas de navegación (4 chips)
const GROUPS = [
  { id: "poffertjes", label: "Poffertjes" },
  { id: "cafe",        label: "Café" },
  { id: "desayunos",   label: "Desayunos" },
  { id: "bebidas",     label: "Bebidas" },
];

const groupToId = (g) => {
  const s = slug(g);
  if (/^poff/.test(s)) return "poffertjes";
  if (/^cafe/.test(s) || /^caf/.test(s)) return "cafe";
  if (/^desayun/.test(s)) return "desayunos";
  if (/^bebid/.test(s)) return "bebidas";
  // fallback por si no cuadra
  return s || "otros";
};

/* ========= Carga de datos (rápida) ========= */
async function loadData(){
  // Meta (opcional)
  let meta = {};
  try {
    const metaSnap = await getDoc(doc(collection(db, "settings"), "menu"));
    if (metaSnap.exists()) meta = metaSnap.data();
  } catch (e) {
    console.warn("No se pudo leer settings/menu:", e);
  }

  // Secciones (lectura principal)
  const secsSnap = await getDocs(collection(db, "sections"));

  // Paraleliza subcolecciones para acelerar (items + toppings)
  const sections = await Promise.all(
    secsSnap.docs.map(async (secDoc) => {
      const base = secDoc.data();
      const sid  = secDoc.id;

      const [itemsSnap, toppingsSnap] = await Promise.all([
        getDocs(collection(db, "sections", sid, "items")).catch(()=>({docs:[]})),
        getDocs(collection(db, "sections", sid, "toppings")).catch(()=>({docs:[]})),
      ]);

      const items    = itemsSnap.docs.map(d => d.data());
      const toppings = toppingsSnap.docs.map(d => d.data());

      return { id: sid, ...base, ...(items.length?{items}:{}) , ...(toppings.length?{toppings}:{}) };
    })
  );

  // Orden: por GROUPS y luego por título
  sections.sort((a,b)=>{
    const ga = GROUPS.findIndex(g => g.id === groupToId(a.group || a.title || a.id));
    const gb = GROUPS.findIndex(g => g.id === groupToId(b.group || b.title || b.id));
    if (ga !== gb) return ga - gb;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  return { meta, sections };
}

/* ========= Render ========= */
function buildNav(groupsAvailable){
  const nav = $("#nav");
  nav.innerHTML = GROUPS
    .filter(g => groupsAvailable.includes(g.id)) // sólo muestra grupos que existen en Firestore
    .map((g, i) => `
      <a href="#${g.id}" class="${i===0 ? "active" : ""}" data-tab="${g.id}">
        ${g.label}
      </a>
    `)
    .join("");

  // eventos
  $$$("#nav a").forEach(a=>{
    a.addEventListener("click", (e)=>{
      e.preventDefault();
      const tab = a.dataset.tab;
      $$$("#nav a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      renderTab(tab);
    });
  });
}

let STATE = {
  meta: {},
  sections: [],
  byGroup: {},   // { groupId: [sections] }
};

function groupSections(sections){
  const map = {};
  for (const sec of sections) {
    const gid = groupToId(sec.group || sec.title || sec.id);
    if (!map[gid]) map[gid] = [];
    map[gid].push(sec);
  }
  return map;
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
    html += `
      <div class="card">
        <div class="title">Toppings</div>
        <div class="muted">Elige los que quieras</div>
        <div class="toppings">
          ${sec.toppings.map(t => `<span class="badge">${t.name}${t.price ? " — " + formatPrice(t.price) : ""}</span>`).join("")}
        </div>
      </div>
    `;
  }
  return html;
}

function renderItemsList(items=[]){
  if (!items.length) return "";
  return `
    <div class="grid">
      ${items.map(it => `
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
  // Nota corta de sección
  const subtitle = sec.subtitle ? `<div class="muted" style="margin:6px 0 10px">${sec.subtitle}</div>` : "";
  const note     = sec.note ? `<div class="note">${sec.note}</div>` : "";

  // Para Poffertjes mostramos base + toppings arriba (si existen)
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

function renderTab(tabId){
  const app = $("#app");
  const sections = STATE.byGroup[tabId] || [];
  app.innerHTML = sections.map(renderSection).join("") || `
    <section class="section"><p class="muted">No hay elementos en esta categoría.</p></section>
  `;

  // Anti-overflow defensivo post-render
  $$$(".grid .card .title").forEach(el => {
    el.style.minWidth = "0";
  });
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

/* Mini helper de selección por id */
function $(sel){ return document.querySelector(sel); }

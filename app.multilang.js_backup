// app.multilang.js
// Carta en ES/EN con soporte de etiquetas de categorías desde settings/menu.nav_labels
// y filtrado de elementos ocultos (hidden: true).

import { db } from "./firebase.js";
import {
  getDocs, getDoc, collection, doc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ========= Estado e idioma ========= */
let LOCALE = (window.LOCALE === "en") ? "en" : "es";
window.__setLocale = (lang) => {
  LOCALE = (lang === "en") ? "en" : "es";
  const active = document.querySelector("#nav a.active")?.dataset.tab;
  buildNav(Object.keys(STATE.byGroup));
  renderTab(active || "poffertjes");
};

function $(sel, el = document){ return el.querySelector(sel); }
function $all(sel, el = document){ return [...el.querySelectorAll(sel)]; }
const pick = (es, en) => (LOCALE === "en" ? (en || es || "") : (es || en || ""));

const slug = (s="") =>
  String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

const formatPrice = (n) => {
  const locale = LOCALE === "en" ? "en-GB" : "es-ES";
  if (typeof n === "number") {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n).replace(/\u00A0/g,' ');
  }
  if (typeof n === "string") {
    const hasEuro = /€/.test(n);
    let v = n.trim().replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(v);
    if (!isNaN(num)) {
      const out = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
      return hasEuro ? out + "€" : out + " €";
    }
    return n;
  }
  return "";
};

/* ========= Tabs ========= */
const GROUPS = [
  { id: "poffertjes", labelES: "Poffertjes", labelEN: "Mini Pancakes" },
  { id: "cafe",        labelES: "Café",      labelEN: "Coffee" },
  { id: "desayunos",   labelES: "Desayunos", labelEN: "Breakfast" },
  { id: "bebidas",     labelES: "Bebidas",   labelEN: "Drinks" },
];

const groupToId = (g) => {
  const s = slug(g || "");
  if (/^poff/.test(s)) return "poffertjes";
  if (/^cafe/.test(s) || /^caf/.test(s)) return "cafe";
  if (/^desayun/.test(s)) return "desayunos";
  if (/^bebid/.test(s)) return "bebidas";
  return s || "otros";
};

/* ========= App state ========= */
let STATE = { meta:{}, sections:[], byGroup:{} };

/* === Etiqueta de categoría desde settings/menu.nav_labels === */
function getGroupLabel(id){
  const map = STATE.meta?.nav_labels || {};
  const i18n = map[id];
  if (i18n) {
    return (LOCALE === "en" ? (i18n.en || i18n.es) : (i18n.es || i18n.en)) || id;
  }
  const G = GROUPS.find(g=>g.id===id);
  if (!G) return id;
  return LOCALE==="en" ? (G.labelEN || G.labelES || id) : (G.labelES || G.labelEN || id);
}

/* ========= Carga ========= */
async function loadData(){
  let meta = {};
  try {
    const metaSnap = await getDoc(doc(collection(db, "settings"), "menu"));
    if (metaSnap.exists()) meta = metaSnap.data(); // aquí puede venir nav_labels
  } catch {}

  const secsSnap = await getDocs(collection(db, "sections"));

  // Construir y filtrar ocultos
  const sections = (await Promise.all(
    secsSnap.docs.map(async (secDoc) => {
      const base = secDoc.data();
      const sid  = secDoc.id;

      // Si la sección está oculta, igual cargamos subcolecciones para consistencia,
      // pero luego filtramos abajo (o podríamos cortar aquí con null).
      const [itemsSnap, toppingsSnap] = await Promise.all([
        getDocs(collection(db, "sections", sid, "items")).catch(()=>({docs:[]})),
        getDocs(collection(db, "sections", sid, "toppings")).catch(()=>({docs:[]})),
      ]);

      // Filtrar items/toppings ocultos
      const items    = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.hidden);
      const toppings = toppingsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.hidden);

      return { id: sid, ...base, ...(items.length?{items}:{}) , ...(toppings.length?{toppings}:{}) };
    })
  ))
  // Filtrar secciones ocultas
  .filter(s => !s.hidden);

  // Orden por grupo y título
  sections.sort((a,b)=>{
    const ga = GROUPS.findIndex(g => g.id === groupToId(a.group || a.title || a.id));
    const gb = GROUPS.findIndex(g => g.id === groupToId(b.group || b.title || b.id));
    if (ga !== gb) return ga - gb;
    const ao = (typeof a.order === "number") ? a.order : 9999;
    const bo = (typeof b.order === "number") ? b.order : 9999;
    if (ao !== bo) return ao - bo;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  return { meta, sections };
}

function groupSections(sections){
  const map = {};
  for (const sec of sections) {
    const gid = groupToId(sec.group || sec.title || sec.id);
    (map[gid] ||= []).push(sec);
  }
  return map;
}

/* ========= Render ========= */
function buildNav(groupsAvailable){
  const nav = $("#nav");
  nav.innerHTML = groupsAvailable.map((id, i)=>`
    <a href="#${id}" class="${i===0 ? "active" : ""}" data-tab="${id}">
      ${getGroupLabel(id)}
    </a>
  `).join("");

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
  if (sec.base && (sec.base.title || sec.base.title_en || sec.base.description || sec.base.description_en || sec.base.price)) {
    const bTitle = pick(sec.base.title, sec.base.title_en);
    const bDesc  = pick(sec.base.description, sec.base.description_en);
    const bPrice = sec.base.price ? formatPrice(sec.base.price) : "";
    html += `
      <div class="note">
        ${bTitle ? `<strong>${bTitle}</strong>` : ""}${bTitle && (bDesc||bPrice) ? " — " : ""}
        ${bDesc}${bDesc && bPrice ? " — " : ""}${bPrice}
      </div>
    `;
  }
  if (Array.isArray(sec.toppings) && sec.toppings.length) {
    const tops = sec.toppings.slice().sort((a,b)=>{
      const ao = (typeof a.order === "number") ? a.order : 9999;
      const bo = (typeof b.order === "number") ? b.order : 9999;
      if (ao !== bo) return ao - bo;
      return (a.name || a.name_en || "").localeCompare(b.name || b.name_en || "", "es");
    });

    html += `
      <div class="card">
        <div class="title">${ LOCALE==="en" ? "Toppings" : "Toppings" }</div>
        <div class="muted">${ LOCALE==="en" ? "Choose as many as you like" : "Elige los que quieras" }</div>
        <div class="toppings">
          ${tops.map(t => `<span class="badge">${pick(t.name, t.name_en)}${t.price ? " — " + formatPrice(t.price) : ""}</span>`).join("")}
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
    return (a.name || a.name_en || "").localeCompare(b.name || b.name_en || "", "es");
  });

  return `
    <div class="grid">
      ${sorted.map(it => `
        <div class="card">
          <div class="title">
            <span>${pick(it.name, it.name_en) || ""}</span>
            <span style="float:right">${it.price ? formatPrice(it.price) : ""}</span>
          </div>
          ${ (it.desc || it.desc_en) ? `<div class="muted">${pick(it.desc, it.desc_en)}</div>` : "" }
        </div>
      `).join("")}
    </div>
  `;
}

function renderSection(sec){
  const subtitle = pick(sec.subtitle, sec.subtitle_en);
  const note     = pick(sec.note, sec.note_en);
  const isPoff   = groupToId(sec.group || sec.title || sec.id) === "poffertjes";
  const title    = pick(sec.title, sec.title_en) || sec.title || "";

  return `
    <section class="section" id="${slug(title || sec.id)}">
      <h2>${title}</h2>
      ${subtitle ? `<div class="muted" style="margin:6px 0 10px">${subtitle}</div>` : ""}
      ${isPoff ? renderBaseAndToppings(sec) : (note ? `<div class="note">${note}</div>` : "")}
      ${renderItemsList(sec.items)}
    </section>
  `;
}

function renderTab(tabId){
  const app = $("#app");
  let sections = STATE.byGroup[tabId] || [];
  sections = sections.slice().sort((a, b) => {
    const ao = (typeof a.order === "number") ? a.order : 9999;
    const bo = (typeof b.order === "number") ? b.order : 9999;
    if (ao !== bo) return ao - bo;
    return (a.title || a.title_en || "").localeCompare(b.title || b.title_en || "", "es");
  });

  app.innerHTML = sections.map(renderSection).join("") || `
    <section class="section"><p class="muted">${ LOCALE==="en" ? "No items in this category." : "No hay elementos en esta categoría." }</p></section>
  `;
}

/* ========= Init ========= */
(async ()=>{
  const app = $("#app");
  app.innerHTML = `<div class="loading">${ LOCALE==="en" ? "Loading menu…" : "Cargando carta…" }</div>`;

  try{
    const { meta, sections } = await loadData();
    STATE.meta = meta || {};
    STATE.sections = sections;
    STATE.byGroup = groupSections(sections);

    const groupsAvailable = ["poffertjes","cafe","desayunos","bebidas"]
      .filter(id => STATE.byGroup[id] && STATE.byGroup[id].length);
    buildNav(groupsAvailable);

    renderTab(groupsAvailable[0] || "poffertjes");

    if (meta && (meta.igic_note || meta.igic_note_en)) {
      const ig = $("#igic-note");
      if (ig) ig.textContent = pick(meta.igic_note, meta.igic_note_en) || ig.textContent;
    }
  }catch(err){
    console.error(err);
    app.innerHTML = `<div class="section"><p>${ LOCALE==="en"
      ? `Could not load the menu. Check your Firebase connection.`
      : `No se pudo cargar la carta. Revisa la conexión con Firebase.`}</p></div>`;
  }
})();

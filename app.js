// === Configuración ===
// Firebase (cliente)
import { db } from "./firebase.js";
import { getDocs, getDoc, collection, doc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Utilidad para formatear precios como "5,50 €" (formato España)
const formatPrice = n => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(n));

// Inyección CSS en tiempo de ejecución para evitar salto entre cifra y símbolo de €
(function applyRuntimeCSS(){
  const style = document.createElement('style');
  style.textContent = `.price{white-space:nowrap}`;
  document.head.appendChild(style);
})();

// --------- Chips de navegación (solo estos 4 grupos) ----------
const GROUPS = ["Poffertjes", "Café", "Desayunos", "Bebidas"];

// Mapeo sección -> grupo (se puede sobreescribir con "group" en menu.json)
const SECTION_GROUP_MAP = {
  // Poffertjes
  "mini-pancakes": "Poffertjes",

  // Desayunos
  "tostas": "Desayunos",
  "croissant": "Desayunos",
  "sandwich": "Desayunos",
  "extras-tostas": "Desayunos",

  // Café (incluye especiales, matcha y tés calientes)
  "cafe": "Café",
  "especiales": "Café",
  "matcha": "Café",
  "te-caliente": "Café",
  "extras-bebidas": "Café",

  // Bebidas frías
  "refrescos": "Bebidas",
  "cervezas": "Bebidas",
  "smoothies": "Bebidas",
  "te-frio": "Bebidas",
  "yogurt": "Bebidas"
};

const groupOf = s => s.group || SECTION_GROUP_MAP[s.id] || "Otros";

function anchorId(s){ return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,''); }

async function loadData(){
  // Meta (settings/menu)
  let meta = {};
  try {
    const metaSnap = await getDoc(doc(collection(db, "settings"), "menu"));
    if (metaSnap.exists()) meta = metaSnap.data();
  } catch(e){
    console.warn("No se pudo leer settings/menu:", e);
  }

  // Secciones
  const sections = [];
  const secsSnap = await getDocs(collection(db, "sections"));
  for (const secDoc of secsSnap.docs){
    const sdata = secDoc.data();
    const sid = secDoc.id;

    // Subcolecciones
    const itemsSnap = await getDocs(collection(db, "sections", sid, "items"));
    const items = itemsSnap.docs.map(d=> d.data());

    const toppingsSnap = await getDocs(collection(db, "sections", sid, "toppings"));
    const toppings = toppingsSnap.docs.map(d=> d.data());

    sections.push({ id: sid, ...sdata, ...(items.length?{items}:{}) , ...(toppings.length?{toppings}:{}) });
  }

  // Orden opcional: primero por grupo (según GROUPS) y luego por título
  sections.sort((a,b)=>{
    const ga = GROUPS.indexOf(groupOf(a));
    const gb = GROUPS.indexOf(groupOf(b));
    if (ga !== gb) return ga - gb;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  return { meta, sections };
}

function buildNavGroups(allSections){
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  // Chips por grupo (en el orden fijo de GROUPS)
  GROUPS.forEach(g=>{
    const has = allSections.some(s=> groupOf(s) === g && s.visible !== false);
    if(!has) return;
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = g;
    a.addEventListener("click",(e)=>{ e.preventDefault(); applyGroupFilter(g); setActive(a); });
    nav.appendChild(a);
  });

  function setActive(el){
    nav.querySelectorAll("a").forEach(x=>x.classList.remove("active"));
    el.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function applyGroupFilter(group){
  document.querySelectorAll(".section").forEach(sec=>{
    const g = sec.dataset.group || "Otros";
    sec.style.display = (group === null || group === g) ? "" : "none";
  });
}

function renderSimpleSection(s, container){
  const sec = document.createElement("section");
  sec.className = "section";
  sec.id = s.id || anchorId(s.title);

  sec.innerHTML = `
    <h2>${s.title}</h2>
    ${s.subtitle ? `<div class="subtitle">${s.subtitle}</div>` : ""}
    ${s.note ? `<div class="note">${s.note}</div>` : ""}
    <div class="grid" role="list"></div>
  `;

  const grid = sec.querySelector(".grid");

  // En "simple", puedes poner items directamente o agruparlos por tarjetas (cards)
  if (s.items){
    const card = document.createElement("div");
    card.className = "card";
    s.items.forEach(it=>{
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item-head">
          <span class="name">${it.name}</span>
          <span class="price">${formatPrice(it.price)}</span>
        </div>
        ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
      `;
      card.appendChild(row);
    });
    grid.appendChild(card);
  }

  if (s.cards){
    s.cards.forEach(c=>{
      const card = document.createElement("div");
      card.className = "card";
      if(c.title){ card.innerHTML = `<h3 style="margin:.2rem 0 .3rem">${c.title}</h3>`; }
      (c.items||[]).forEach(it=>{
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="item-head">
            <span class="name">${it.name}</span>
            <span class="price">${formatPrice(it.price)}</span>
          </div>
          ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
        `;
        card.appendChild(row);
      });
      grid.appendChild(card);
    });
  }

  container.appendChild(sec);
  return sec;
}

function renderPancakesSection(s, container){
  const sec = document.createElement("section");
  sec.className = "section";
  sec.id = s.id || anchorId(s.title);

  sec.innerHTML = `
    <h2>${s.title}</h2>
    <div class="pancakes">
      <div class="card">
        <div class="item">
          <div class="item-head">
            <span class="name">${(s.base?.title) || "1 · Comienza con la base"}</span>
            <span class="price">${formatPrice((s.base?.price) || 0)}</span>
          </div>
          ${s.base?.description ? `<div class="desc">${s.base.description}</div>` : ""}
        </div>

        <details class="dropdown" id="${sec.id}-dd">
          <summary>Luego, elige tus toppings</summary>
          <div class="dropdown-body" id="${sec.id}-toppings"></div>
        </details>
      </div>
    </div>
  `;

  const topp = sec.querySelector(`#${sec.id}-toppings`);
  (s.toppings||[]).forEach(t=>{
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="item-head">
        <span class="name">${t.name}</span>
        <span class="price">${t.free ? "Gratis" : formatPrice(t.price)}</span>
      </div>
    `;
    topp.appendChild(row);
  });

  container.appendChild(sec);
  return sec;
}

function mount(data){
  document.getElementById("igic-note").textContent = data?.meta?.igic_note || "IGIC incluido";
  const app = document.getElementById("app");
  app.innerHTML = "";

  const sections = data.sections || [];
  buildNavGroups(sections);

  sections.filter(s=>s.visible!==false).forEach(s=>{
    const type = s.type || "simple";
    const el = (type === "mini_pancakes")
      ? renderPancakesSection(s, app)
      : renderSimpleSection(s, app);

    el.dataset.group = groupOf(s);
  });
}

loadData()
  .then(mount)
  .catch(err=>{
    console.error(err);
    const app = document.getElementById("app");
    app.innerHTML = `<div class="section"><p>No se pudo cargar la carta. Revisa la conexión con Firebase/Firestore y tu archivo <code>firebase.js</code>.</p></div>`;
  });

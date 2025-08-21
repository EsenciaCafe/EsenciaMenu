// === Configuración ===
const DATA_URL = "menu.json"; // edita solo este archivo para cambiar la carta

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
  const res = await fetch(DATA_URL, {cache:"no-store"});
  if(!res.ok) throw new Error("No se pudo cargar menu.json");
  return res.json();
}

function buildNavGroups(allSections){
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  // Chip "Todas"
  const chipAll = document.createElement("a");
  chipAll.href = "#";
  chipAll.textContent = "Todas";
  chipAll.classList.add("active");
  chipAll.addEventListener("click", (e)=>{ e.preventDefault(); applyGroupFilter(null); setActive(chipAll); });
  nav.appendChild(chipAll);

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
    app.innerHTML = `<div class="section"><p>No se pudo cargar la carta. Revisa <code>menu.json</code>.</p></div>`;
  });

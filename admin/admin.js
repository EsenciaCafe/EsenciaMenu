// admin/admin.js
// Editor CRUD con formularios, soporte ES/EN, order, toppings
// y edición de nombres de categorías (settings/menu.nav_labels).
// Limpia undefined en creates y usa deleteField() en edits.

import { db } from "../firebase.js";
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
// openForm({title, fields, submitLabel, initial}) -> Promise<object|null>
function openForm({ title="Editar", submitLabel="Guardar", initial={}, fields=[] }){
  return new Promise(resolve=>{
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="btn-ghost" id="form-close" aria-label="Cerrar">✕</button>
        </div>
        <form class="modal-body" id="form-body"></form>
        <div class="modal-actions">
          <button type="button" class="btn" id="form-cancel">Cancelar</button>
          <button type="submit" class="btn accent" id="form-submit">${submitLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#form-body");

    fields.forEach(f=>{
      const row = document.createElement("div");
      row.className = "form-row";
      const id = `fld-${f.name}`;
      let control = "";

      if (f.type === "select"){
        control = `<select id="${id}" name="${f.name}">${(f.options||[]).map(o=>`
          <option value="${o.value}">${o.label}</option>`).join("")}</select>`;
      } else if (f.type === "textarea"){
        control = `<textarea id="${id}" name="${f.name}" rows="${f.rows||3}" placeholder="${f.placeholder||""}"></textarea>`;
      } else if (f.type === "checkbox"){
        control = `<label class="chk">
          <input type="checkbox" id="${id}" name="${f.name}">
          <span>${f.help||""}</span>
        </label>`;
      } else {
        control = `<input id="${id}" name="${f.name}" type="${f.type||"text"}" placeholder="${f.placeholder||""}">`;
      }

      row.innerHTML = `
        ${f.type==="checkbox" ? "" : `<label for="${id}">${f.label||f.name}</label>`}
        ${control}
        ${f.note ? `<div class="note-inline">${f.note}</div>`:""}
      `;
      form.appendChild(row);

      const el = row.querySelector("#"+id);
      const val = initial[f.name];
      if (f.type === "checkbox"){
        el.checked = !!val;
      } else if (val!=null){
        el.value = String(val);
      }

      if (f.dependsOn){
        const dep = f.dependsOn;
        const depEl = overlay.querySelector(`[name="${dep.name}"]`);
        const toggle = ()=>{
          const ok = dep.when( depEl.type==="checkbox" ? depEl.checked : depEl.value );
          row.style.display = ok ? "" : "none";
        };
        depEl.addEventListener("input", toggle);
        depEl.addEventListener("change", toggle);
        toggle();
      }
    });

    const close = ()=> overlay.remove();
    overlay.querySelector("#form-close").onclick  = ()=>{ close(); resolve(null); };
    overlay.querySelector("#form-cancel").onclick = ()=>{ close(); resolve(null); };
    overlay.addEventListener("click", e=>{
      if (e.target === overlay){ close(); resolve(null); }
    });

    overlay.querySelector("#form-submit").onclick = (e)=>{
      e.preventDefault();
      const data = {};
      fields.forEach(f=>{
        const el = overlay.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        if (f.type==="checkbox"){
          data[f.name] = !!el.checked;
        } else {
          const v = el.value.trim();
          if (f.type==="number"){
            const num = Number(v);
            data[f.name] = isNaN(num) ? (v===""? "" : v) : num;
          } else {
            data[f.name] = v;
          }
        }
      });
      resolve(data);
      close();
    };
  });
}

/* ======= Constantes ======= */
const GROUPS = [
  { id:"poffertjes", label:"Poffertjes" },
  { id:"cafe",       label:"Café" },
  { id:"desayunos",  label:"Desayunos" },
  { id:"bebidas",    label:"Bebidas" },
];

const groupToId = (g) => {
  const s = slug(g||"");
  if (/^poff/.test(s)) return "poffertjes";
  if (/^cafe/.test(s) || /^caf/.test(s)) return "cafe";
  if (/^desayun/.test(s)) return "desayunos";
  if (/^bebid/.test(s)) return "bebidas";
  return s || "otros";
};

/* ======= Auth ======= */
const auth = getAuth();

$("#btn-login")?.addEventListener("click", async ()=>{
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || !password) { alert("Completa email y contraseña"); return; }
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    console.error(err);
    alert("No se pudo iniciar sesión: " + (err.message || err));
  }
});

$("#btn-logout")?.addEventListener("click", async ()=>{
  await signOut(auth);
});

onAuthStateChanged(auth, (user)=>{
  if (user){
    $("#auth-status").textContent = `Conectado como ${user.email}`;
    $("#login").classList.add("hide");
    $("#editor").classList.remove("hide");
    initEditor();
  } else {
    $("#auth-status").textContent = "No autenticado";
    $("#editor").classList.add("hide");
    $("#login").classList.remove("hide");
  }
});

/* ======= Estado ======= */
let STATE = {
  sections: [],
  byGroup: {},
  activeTab: "poffertjes",
};

function groupSections(sections){
  const map = {};
  for (const sec of sections){
    const gid = groupToId(sec.group || sec.title || sec.id);
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
      getDocs(collection(db, "sections", id, "items")).catch(()=>({docs:[]})),
      getDocs(collection(db, "sections", id, "toppings")).catch(()=>({docs:[]})),
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
      ${g.label}
    </a>
  `).join("");

  $$("#nav a").forEach(a=>{
    a.addEventListener("click", e=>{
      e.preventDefault();
      const tab = a.dataset.tab;
      STATE.activeTab = tab;
      $$("#nav a").forEach(x=>x.classList.remove("active"));
      a.classList.add("active");
      render();
    });
  });

  // Barra de acciones del admin
  let actions = document.getElementById("admin-actions");
  if (!actions){
    actions = document.createElement("div");
    actions.id = "admin-actions";
    actions.className = "admin-actions";
    nav.parentElement?.insertBefore(actions, nav.nextSibling);
  }
  actions.innerHTML = `
    <button class="btn accent" id="btn-add-section">+ Sección</button>
    <button class="btn" id="btn-edit-cats">Editar nombres de categorías</button>
  `;

  $("#btn-add-section").onclick = onAddSection;
  $("#btn-edit-cats").onclick = onEditCategoryNames;
}

/* ======= Form: Editar nombres de categorías ======= */
async function onEditCategoryNames(){
  try{
    const ref = doc(collection(db, "settings"), "menu");
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data().nav_labels || {}) : {};

    const initial = {
      poff_es: current.poffertjes?.es ?? "Poffertjes",
      poff_en: current.poffertjes?.en ?? "Mini Pancakes",
      cafe_es: current.cafe?.es ?? "Café",
      cafe_en: current.cafe?.en ?? "Coffee",
      des_es:  current.desayunos?.es ?? "Desayunos",
      des_en:  current.desayunos?.en ?? "Breakfast",
      beb_es:  current.bebidas?.es ?? "Bebidas",
      beb_en:  current.bebidas?.en ?? "Drinks",
    };

    const data = await openForm({
      title: "Editar nombres de categorías",
      submitLabel: "Guardar",
      initial,
      fields: [
        { name:"poff_es", label:"Poffertjes (ES)" },
        { name:"poff_en", label:"Poffertjes (EN)" },
        { name:"cafe_es", label:"Café (ES)" },
        { name:"cafe_en", label:"Café (EN)" },
        { name:"des_es",  label:"Desayunos (ES)" },
        { name:"des_en",  label:"Desayunos (EN)" },
        { name:"beb_es",  label:"Bebidas (ES)" },
        { name:"beb_en",  label:"Bebidas (EN)" },
      ]
    });
    if (!data) return;

    const nav_labels = {
      poffertjes: { es: data.poff_es.trim(), en: data.poff_en.trim() },
      cafe:       { es: data.cafe_es.trim(), en: data.cafe_en.trim() },
      desayunos:  { es: data.des_es.trim(),  en: data.des_en.trim() },
      bebidas:    { es: data.beb_es.trim(),  en: data.beb_en.trim() },
    };

    await setDoc(ref, { nav_labels }, { merge: true });
    alert("Nombres de categorías actualizados.");
    await reload();
  }catch(e){
    console.error(e);
    alert("No se pudieron actualizar las categorías.");
  }
}

/* ======= Render ======= */
function render(){
  const wrap = $("#sections");
  const tab = STATE.activeTab;
  $("#group-title").textContent = `Editor — ${GROUPS.find(g=>g.id===tab)?.label||tab}`;

  let sections = STATE.byGroup[tab] || [];
  sections = sections.slice().sort((a,b)=>{
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  wrap.innerHTML = sections.map(sec => sectionCard(sec)).join("") || `
    <div class="note">No hay secciones en esta categoría.</div>
  `;

  sections.forEach(sec=>{
    $("#edit-sec-"+sec.id)?.addEventListener("click", ()=> onEditSection(sec));
    $("#del-sec-"+sec.id)?.addEventListener("click", ()=> onDeleteSection(sec));
    $("#order-sec-"+sec.id)?.addEventListener("click", ()=> onChangeSectionOrder(sec));
    $("#add-item-"+sec.id)?.addEventListener("click", ()=> onAddItem(sec));
    $("#add-top-"+sec.id)?.addEventListener("click", ()=> onAddTopping(sec));

    (sec.items||[]).forEach(it=>{
      $("#edit-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onEditItem(sec, it));
      $("#order-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onChangeItemOrder(sec, it));
      $("#del-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onDeleteItem(sec, it));
    });
    (sec.toppings||[]).forEach(tp=>{
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
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.name||a.name_en||"").localeCompare(b.name||b.name_en||"", "es");
  });

  return `
    <div class="section" id="${slug(sec.title||sec.id)}">
      <div class="card">
        <div class="title">
          <span>${sec.title || ""}</span>
          <span class="right">order: ${typeof sec.order==="number" ? sec.order : "-"}</span>
        </div>
        ${sec.subtitle ? `<div class="muted">${sec.subtitle}</div>` : ""}
        ${sec.note ? `<div class="note" style="margin:10px 0">${sec.note}</div>` : ""}
        ${hasBase ? `
          <div class="fieldset">
            <div class="kvs"><label>Base</label><div class="muted-small">
              ${sec.base.title ? `<strong>${sec.base.title}</strong>` : ""} ${sec.base.description? `— ${sec.base.description}`:""} ${sec.base.price? `— ${sec.base.price}`:""}
              ${ (sec.base.title_en || sec.base.description_en) ? `<div class="muted-small">EN: ${sec.base.title_en||""} ${sec.base.description_en?`— ${sec.base.description_en}`:""}</div>` : "" }
            </div></div>
          </div>` : ""
        }

        <div class="row-actions" style="margin-top:10px">
          <button class="btn accent" id="edit-sec-${sec.id}">✏ Editar sección</button>
          <button class="btn" id="order-sec-${sec.id}">↕ Orden</button>
          <button class="btn danger" id="del-sec-${sec.id}">🗑 Eliminar</button>
        </div>

        ${itemsSorted.length ? `<h3 style="margin:14px 0 6px">Items</h3>`:""}
        ${itemsSorted.length ? `
          <div class="grid">
            ${itemsSorted.map(it=>`
              <div class="card">
                <div class="title">
                  <span>${it.name||""}</span>
                  <span class="right">${it.price||""}</span>
                </div>
                ${it.desc? `<div class="muted">${it.desc}</div>`:""}
                ${ (it.name_en || it.desc_en) ? `<div class="muted-small">EN: ${it.name_en||""} ${it.desc_en?`— ${it.desc_en}`:""}</div>`:"" }
                <div class="row-actions" style="margin-top:8px">
                  <button class="btn" id="edit-item-${sec.id}-${it.id}">✏ Editar</button>
                  <button class="btn" id="order-item-${sec.id}-${it.id}">↕ Orden</button>
                  <button class="btn danger" id="del-item-${sec.id}-${it.id}">🗑 Eliminar</button>
                </div>
              </div>
            `).join("")}
          </div>
        `:""}

        <div class="row-actions" style="margin-top:10px">
          <button class="btn accent" id="add-item-${sec.id}">+ Item</button>
          ${sec.toppings ? `<button class="btn" id="add-top-${sec.id}">+ Topping</button>` : ""}
        </div>

        ${toppingsSorted.length ? `<h3 style="margin:14px 0 6px">Toppings</h3>`:""}
        ${toppingsSorted.length ? `
          <div class="toppings">
            ${toppingsSorted.map(tp=>`
              <span class="badge">
                ${tp.name}${tp.price?` — ${tp.price}`:""}
                ${ tp.name_en ? `<span class="muted-small" style="margin-left:6px">EN: ${tp.name_en}</span>` : "" }
                <span style="margin-left:6px">
                  <a href="#" id="edit-top-${sec.id}-${tp.id}" title="Editar">✏</a>
                  <a href="#" id="order-top-${sec.id}-${tp.id}" title="Orden">↕</a>
                  <a href="#" id="del-top-${sec.id}-${tp.id}" title="Eliminar" style="color:#b91c1c">🗑</a>
                </span>
              </span>
            `).join("")}
          </div>
        `:""}
      </div>
    </div>
  `;
}

/* ======= Secciones ======= */
async function onAddSection(){
  const data = await openForm({
    title: "Nueva sección",
    submitLabel: "Crear",
    initial: { group:"Desayunos", title:"", title_en:"", subtitle:"", subtitle_en:"", note:"", note_en:"", order:1, base_enable:false, base_title:"", base_title_en:"", base_desc:"", base_desc_en:"", base_price:"" },
    fields: [
      { name:"group", label:"Grupo", type:"select", options:[
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
      { name:"base_enable", type:"checkbox", help:"Añadir BASE (título/desc/precio)" },
      { name:"base_title", label:"Base · Título (ES)", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_title_en", label:"Base · Title (EN)", placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc", label:"Base · Descripción (ES)", type:"textarea", rows:2, dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_desc_en", label:"Base · Description (EN)", type:"textarea", rows:2, placeholder:"Opcional", dependsOn:{name:"base_enable", when:v=>!!v} },
      { name:"base_price", label:"Base · Precio", placeholder:"ej: 3.50", dependsOn:{name:"base_enable", when:v=>!!v} },
    ]
  });
  if (!data) return;

  const id = slug(data.title);

  // Construimos payload limpio (sin undefined/strings vacías)
  const payload = {
    title: data.title,
    group: data.group,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  if (data.title_en) payload.title_en = data.title_en;
  if (data.subtitle) payload.subtitle = data.subtitle;
  if (data.subtitle_en) payload.subtitle_en = data.subtitle_en;
  if (data.note) payload.note = data.note;
  if (data.note_en) payload.note_en = data.note_en;

  if (data.base_enable) {
    const base = {};
    if (data.base_title) base.title = data.base_title;
    if (data.base_title_en) base.title_en = data.base_title_en;
    if (data.base_desc) base.description = data.base_desc;
    if (data.base_desc_en) base.description_en = data.base_desc_en;
    if (data.base_price) base.price = data.base_price;
    if (Object.keys(base).length) payload.base = base;
  }

  try{
    await setDoc(doc(db, "sections", id), payload, { merge: true });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo crear sección.");
  }
}

async function onEditSection(sec){
  const data = await openForm({
    title: `Editar sección: ${sec.title}`,
    submitLabel: "Guardar",
    initial: {
      group: sec.group || "Desayunos",
      title: sec.title || "",
      title_en: sec.title_en || "",
      subtitle: sec.subtitle || "",
      subtitle_en: sec.subtitle_en || "",
      note: sec.note || "",
      note_en: sec.note_en || "",
      order: typeof sec.order==="number"? sec.order : 1,
      base_enable: !!sec.base,
      base_title: sec.base?.title || "",
      base_title_en: sec.base?.title_en || "",
      base_desc: sec.base?.description || "",
      base_desc_en: sec.base?.description_en || "",
      base_price: sec.base?.price || "",
    },
    fields: [
      { name:"group", label:"Grupo", type:"select", options:[
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
      { name:"base_enable", type:"checkbox", help:"Editar BASE (título/desc/precio)" },
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
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    updatedAt: serverTimestamp()
  };

  if (data.base_enable){
    const base = {};
    base.title = data.base_title ? data.base_title : deleteField();
    base.title_en = data.base_title_en ? data.base_title_en : deleteField();
    base.description = data.base_desc ? data.base_desc : deleteField();
    base.description_en = data.base_desc_en ? data.base_desc_en : deleteField();
    base.price = data.base_price ? data.base_price : deleteField();
    patch.base = base;
  } else {
    patch.base = deleteField();
  }

  try{
    await updateDoc(doc(db, "sections", sec.id), patch);
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo editar la sección.");
  }
}

async function onDeleteSection(sec){
  if (!confirm(`Eliminar sección "${sec.title}" y TODO su contenido (items/toppings)?`)) return;
  try{
    for (const it of (sec.items||[])){
      await deleteDoc(doc(db, "sections", sec.id, "items", it.id));
    }
    for (const tp of (sec.toppings||[])){
      await deleteDoc(doc(db, "sections", sec.id, "toppings", tp.id));
    }
    await deleteDoc(doc(db, "sections", sec.id));
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo eliminar la sección.");
  }
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
  try{
    await updateDoc(doc(db, "sections", sec.id), {
      order: isNaN(order)? 9999 : order,
      updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo actualizar el orden.");
  }
}

/* ======= Items ======= */
async function onAddItem(sec){
  const data = await openForm({
    title: `Nuevo item en ${sec.title}`,
    submitLabel: "Crear",
    initial: { name:"", name_en:"", desc:"", desc_en:"", price:"", order:1 },
    fields: [
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"desc", label:"Descripción (ES)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"desc_en", label:"Description (EN)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"price", label:"Precio", placeholder:"ej: 3.50" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
    ]
  });
  if (!data) return;

  const payload = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (data.name_en) payload.name_en = data.name_en;
  if (data.desc) payload.desc = data.desc;
  if (data.desc_en) payload.desc_en = data.desc_en;
  if (data.price) payload.price = data.price;

  try{
    await addDoc(collection(db, "sections", sec.id, "items"), payload);
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el item.");
  }
}

async function onEditItem(sec, it){
  const data = await openForm({
    title: `Editar item: ${it.name}`,
    submitLabel: "Guardar",
    initial: {
      name: it.name || "",
      name_en: it.name_en || "",
      desc: it.desc || "",
      desc_en: it.desc_en || "",
      price: it.price || "",
      order: typeof it.order==="number" ? it.order : 1,
    },
    fields: [
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"desc", label:"Descripción (ES)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"desc_en", label:"Description (EN)", type:"textarea", rows:2, placeholder:"Opcional" },
      { name:"price", label:"Precio" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
    ]
  });
  if (!data) return;

  const patch = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    updatedAt: serverTimestamp(),
  };
  patch.name_en = data.name_en ? data.name_en : deleteField();
  patch.desc    = data.desc    ? data.desc    : deleteField();
  patch.desc_en = data.desc_en ? data.desc_en : deleteField();
  patch.price   = data.price   ? data.price   : deleteField();

  try{
    await updateDoc(doc(db, "sections", sec.id, "items", it.id), patch);
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo editar el item.");
  }
}

async function onDeleteItem(sec, it){
  if (!confirm(`Eliminar item "${it.name}"?`)) return;
  try{
    await deleteDoc(doc(db, "sections", sec.id, "items", it.id));
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo eliminar el item.");
  }
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
  try{
    await updateDoc(doc(db, "sections", sec.id, "items", it.id), {
      order: isNaN(order) ? 9999 : order,
      updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo actualizar el orden del item.");
  }
}

/* ======= Toppings ======= */
async function onAddTopping(sec){
  const data = await openForm({
    title: `Nuevo topping en ${sec.title}`,
    submitLabel: "Crear",
    initial: { name:"", name_en:"", price:"", order:1 },
    fields: [
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"price", label:"Precio (opcional)", placeholder:"ej: 1.50" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
    ]
  });
  if (!data) return;

  const payload = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (data.name_en) payload.name_en = data.name_en;
  if (data.price) payload.price = data.price;

  try{
    await addDoc(collection(db, "sections", sec.id, "toppings"), payload);
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el topping.");
  }
}

async function onEditTopping(sec, tp){
  const data = await openForm({
    title: `Editar topping: ${tp.name}`,
    submitLabel: "Guardar",
    initial: {
      name: tp.name || "",
      name_en: tp.name_en || "",
      price: tp.price || "",
      order: typeof tp.order==="number" ? tp.order : 1,
    },
    fields: [
      { name:"name", label:"Nombre (ES)" },
      { name:"name_en", label:"Name (EN)", placeholder:"Opcional" },
      { name:"price", label:"Precio (opcional)" },
      { name:"order", label:"Orden", type:"number", note:"Menor aparece primero" },
    ]
  });
  if (!data) return;

  const patch = {
    name: data.name,
    order: isNaN(Number(data.order)) ? 9999 : Number(data.order),
    updatedAt: serverTimestamp(),
  };
  patch.name_en = data.name_en ? data.name_en : deleteField();
  patch.price   = data.price   ? data.price   : deleteField();

  try{
    await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), patch);
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo editar el topping.");
  }
}

async function onDeleteTopping(sec, tp){
  if (!confirm(`Eliminar topping "${tp.name}"?`)) return;
  try{
    await deleteDoc(doc(db, "sections", sec.id, "toppings", tp.id));
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo eliminar el topping.");
  }
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
  try{
    await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), {
      order: isNaN(order) ? 9999 : order,
      updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo actualizar el orden del topping.");
  }
}

/* ======= Init & Reload ======= */
async function initEditor(){
  buildNav();
  await reload();
}

async function reload(){
  const app = $("#sections");
  app.innerHTML = `<div class="loading">Cargando secciones…</div>`;
  try{
    const sections = await loadSections();
    STATE.sections = sections;
    STATE.byGroup = groupSections(sections);
    render();
  }catch(e){
    console.error(e);
    app.innerHTML = `<div class="note">Error cargando secciones. Revisa consola.</div>`;
  }
}

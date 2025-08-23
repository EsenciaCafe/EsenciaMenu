// admin/admin.js
// Editor CRUD con soporte multilenguaje y edición de nombres de categorías (settings/menu.nav_labels)

import { db } from "../firebase.js";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc,
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

/* ======= UI helpers ======= */
const $ = (s, el=document)=> el.querySelector(s);
const $$ = (s, el=document)=> [...el.querySelectorAll(s)];
const slug = (s="") =>
  String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w]+/g,'-').replace(/(^-|-$)/g,'');

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

  // Barra de acciones del admin (si no existe, la creamos)
  let actions = document.getElementById("admin-actions");
  if (!actions){
    actions = document.createElement("div");
    actions.id = "admin-actions";
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.margin = "8px 0";
    nav.parentElement?.insertBefore(actions, nav.nextSibling);
  }
  actions.innerHTML = `
    <button class="btn accent" id="btn-add-section">+ Sección</button>
    <button class="btn" id="btn-edit-cats">Editar nombres de categorías</button>
  `;

  $("#btn-add-section").onclick = onAddSection;
  $("#btn-edit-cats").onclick = onEditCategoryNames;
}

/* ======= Editar nombres de categorías (settings/menu.nav_labels) ======= */
async function onEditCategoryNames(){
  try{
    const ref = doc(collection(db, "settings"), "menu");
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data().nav_labels || {}) : {};

    const cur = (id, esDefault, enDefault) => {
      const i = current[id] || {};
      return { es: i.es || esDefault, en: i.en || enDefault };
    };

    const p = {
      poffertjes: cur("poffertjes", "Poffertjes", "Mini Pancakes"),
      cafe:       cur("cafe",       "Café",       "Coffee"),
      desayunos:  cur("desayunos",  "Desayunos",  "Breakfast"),
      bebidas:    cur("bebidas",    "Bebidas",    "Drinks"),
    };

    const es_poff = prompt("Nombre ES para 'poffertjes':", p.poffertjes.es); if (es_poff===null) return;
    const en_poff = prompt("Nombre EN para 'poffertjes':", p.poffertjes.en); if (en_poff===null) return;

    const es_cafe = prompt("Nombre ES para 'cafe':", p.cafe.es); if (es_cafe===null) return;
    const en_cafe = prompt("Nombre EN para 'cafe':", p.cafe.en); if (en_cafe===null) return;

    const es_des = prompt("Nombre ES para 'desayunos':", p.desayunos.es); if (es_des===null) return;
    const en_des = prompt("Nombre EN para 'desayunos':", p.desayunos.en); if (en_des===null) return;

    const es_beb = prompt("Nombre ES para 'bebidas':", p.bebidas.es); if (es_beb===null) return;
    const en_beb = prompt("Nombre EN para 'bebidas':", p.bebidas.en); if (en_beb===null) return;

    const nav_labels = {
      poffertjes: { es: es_poff.trim(), en: en_poff.trim() },
      cafe:       { es: es_cafe.trim(), en: en_cafe.trim() },
      desayunos:  { es: es_des.trim(),  en: en_des.trim() },
      bebidas:    { es: es_beb.trim(),  en: en_beb.trim() },
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

/* ======= Actions: Secciones ======= */
async function onAddSection(){
  const group = prompt("¿En qué grupo? (Poffertjes, Café, Desayunos, Bebidas)");
  if (!group) return;
  const title = prompt("Título de la sección (ES, ej: Tostas)");
  if (!title) return;
  const title_en = prompt("Title (EN) — opcional", "");
  const subtitle = prompt("Subtítulo (ES) — opcional", "");
  const subtitle_en = subtitle ? prompt("Subtitle (EN) — opcional", "") : "";
  const note = prompt("Nota (ES) — opcional", "");
  const note_en = note ? prompt("Note (EN) — opcional", "") : "";
  const orderStr = prompt("Orden (número, menor aparece primero)", "1");
  const order = Number(orderStr);
  const id = slug(title);

  let base = null;
  if (confirm("¿Quieres añadir BASE (título/desc/precio) ahora?")){
    const bTitle = prompt("Base: título (ES)", "");
    const bTitleEn = bTitle ? prompt("Base: title (EN) — opcional", "") : "";
    const bDesc = prompt("Base: descripción (ES)", "");
    const bDescEn = bDesc ? prompt("Base: description (EN) — opcional", "") : "";
    const bPrice = prompt("Base: precio (ej: 3,50 €)", "");
    base = {
      ...(bTitle ? { title: bTitle } : {}),
      ...(bTitleEn ? { title_en: bTitleEn } : {}),
      ...(bDesc ? { description: bDesc } : {}),
      ...(bDescEn ? { description_en: bDescEn } : {}),
      ...(bPrice ? { price: bPrice } : {}),
    };
  }

  const data = {
    title,
    ...(title_en ? { title_en } : {}),
    subtitle: subtitle || undefined,
    ...(subtitle_en ? { subtitle_en } : {}),
    note: note || undefined,
    ...(note_en ? { note_en } : {}),
    group,
    order: isNaN(order) ? 9999 : order,
    ...(base ? { base } : {}),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };

  try{
    await setDoc(doc(db, "sections", id), data, { merge: true });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo crear sección.");
  }
}

async function onEditSection(sec){
  const title = prompt("Título (ES)", sec.title || "");
  if (!title) return;
  const title_en = prompt("Title (EN) — opcional", sec.title_en || "");
  const subtitle = prompt("Subtítulo (ES) — opcional", sec.subtitle || "");
  const subtitle_en = prompt("Subtitle (EN) — opcional", sec.subtitle_en || "");
  const note = prompt("Nota (ES) — opcional", sec.note || "");
  const note_en = prompt("Note (EN) — opcional", sec.note_en || "");

  let base = sec.base || {};
  if (confirm("¿Editar BASE (título/desc/precio)?")){
    const bTitle = prompt("Base: título (ES)", base.title || "");
    const bTitleEn = prompt("Base: title (EN) — opcional", base.title_en || "");
    const bDesc  = prompt("Base: descripción (ES)", base.description || "");
    const bDescEn  = prompt("Base: description (EN) — opcional", base.description_en || "");
    const bPrice = prompt("Base: precio", base.price || "");

    base = {
      ...(bTitle ? { title: bTitle } : { title: "" }),
      ...(bTitleEn ? { title_en: bTitleEn } : { title_en: "" }),
      ...(bDesc ? { description: bDesc } : { description: "" }),
      ...(bDescEn ? { description_en: bDescEn } : { description_en: "" }),
      ...(bPrice ? { price: bPrice } : { price: "" }),
    };
  }

  try{
    await updateDoc(doc(db, "sections", sec.id), {
      title, title_en, subtitle, subtitle_en, note, note_en, base,
      updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo editar la sección.");
  }
}

/* ======= Actions: Orden/Eliminar sección ======= */
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
  const nv = prompt("Nuevo orden (número):", typeof sec.order==="number"? String(sec.order):"1");
  if (nv==null) return;
  const order = Number(nv);
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

/* ======= Actions: Items ======= */
async function onAddItem(sec){
  const name = prompt("Nombre del item (ES)");
  if (!name) return;
  const name_en = prompt("Item name (EN) — opcional", "");
  const desc = prompt("Descripción (ES) — opcional", "");
  const desc_en = desc ? prompt("Description (EN) — opcional", "") : "";
  const price = prompt("Precio (ej: 3,50 €)", "");
  const orderStr = prompt("Orden (número, menor aparece primero)", "1");
  const order = Number(orderStr);

  try{
    await addDoc(collection(db, "sections", sec.id, "items"), {
      name,
      ...(name_en ? { name_en } : {}),
      desc: desc || undefined,
      ...(desc_en ? { desc_en } : {}),
      price,
      order: isNaN(order) ? 9999 : order,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el item.");
  }
}

async function onEditItem(sec, it){
  const name = prompt("Nombre (ES)", it.name || "");
  if (!name) return;
  const name_en = prompt("Name (EN) — opcional", it.name_en || "");
  const desc = prompt("Descripción (ES) — opcional", it.desc || "");
  const desc_en = prompt("Description (EN) — opcional", it.desc_en || "");
  const price = prompt("Precio (ej: 3,50 €)", it.price || "");
  const orderStr = prompt("Orden (número)", typeof it.order==="number" ? String(it.order) : "1");
  const order = Number(orderStr);
  try{
    await updateDoc(doc(db, "sections", sec.id, "items", it.id), {
      name, name_en, desc, desc_en, price,
      order: isNaN(order) ? 9999 : order,
      updatedAt: serverTimestamp()
    });
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
  const nv = prompt("Nuevo orden (número):", typeof it.order==="number" ? String(it.order) : "1");
  if (nv == null) return;
  const order = Number(nv);
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

/* ======= Actions: Toppings ======= */
async function onAddTopping(sec){
  const name = prompt("Nombre del topping (ES)");
  if (!name) return;
  const name_en = prompt("Topping name (EN) — opcional", "");
  const price = prompt("Precio (opcional)", "");
  const orderStr = prompt("Orden (número, menor primero)", "1");
  const order = Number(orderStr);
  try{
    await addDoc(collection(db, "sections", sec.id, "toppings"), {
      name,
      ...(name_en ? { name_en } : {}),
      price,
      order: isNaN(order) ? 9999 : order,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el topping.");
  }
}

async function onEditTopping(sec, tp){
  const name = prompt("Nombre (ES)", tp.name || "");
  if (!name) return;
  const name_en = prompt("Name (EN) — opcional", tp.name_en || "");
  const price = prompt("Precio (opcional)", tp.price || "");
  const orderStr = prompt("Orden (número)", typeof tp.order==="number" ? String(tp.order) : "1");
  const order = Number(orderStr);
  try{
    await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), {
      name, name_en, price,
      order: isNaN(order) ? 9999 : order,
      updatedAt: serverTimestamp()
    });
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
  const nv = prompt("Nuevo orden (número):", typeof tp.order==="number" ? String(tp.order) : "1");
  if (nv == null) return;
  const order = Number(nv);
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

// admin/admin.js
// Editor simple con Auth (email/contraseña) + CRUD de secciones/items/toppings.
// Reutiliza estética y estructura de tu carta pública.

import { db } from "../firebase.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
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

// Login UI
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
    // Subcolecciones
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

/* ======= Nav ======= */
function buildNav(){
  const nav = $("#nav");
  nav.innerHTML = GROUPS.map((g,i)=>`
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

  $("#btn-add-section").onclick = onAddSection;
}

/* ======= Render ======= */
function render(){
  const wrap = $("#sections");
  const tab = STATE.activeTab;
  $("#group-title").textContent = `Editor — ${GROUPS.find(g=>g.id===tab)?.label||tab}`;

  // Secciones del grupo
  let sections = STATE.byGroup[tab] || [];
  // Orden por `order` (si existe), luego por título
  sections = sections.slice().sort((a,b)=>{
    const ao = typeof a.order==="number" ? a.order : 9999;
    const bo = typeof b.order==="number" ? b.order : 9999;
    if (ao!==bo) return ao-bo;
    return (a.title||"").localeCompare(b.title||"", "es");
  });

  wrap.innerHTML = sections.map(sec => sectionCard(sec)).join("") || `
    <div class="note">No hay secciones en esta categoría.</div>
  `;

  // Bind de acciones por sección
  sections.forEach(sec=>{
    $("#edit-sec-"+sec.id)?.addEventListener("click", ()=> onEditSection(sec));
    $("#del-sec-"+sec.id)?.addEventListener("click", ()=> onDeleteSection(sec));
    $("#order-sec-"+sec.id)?.addEventListener("click", ()=> onChangeOrder(sec));
    $("#add-item-"+sec.id)?.addEventListener("click", ()=> onAddItem(sec));
    $("#add-top-"+sec.id)?.addEventListener("click", ()=> onAddTopping(sec));

    // Items actions
    (sec.items||[]).forEach(it=>{
      $("#edit-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onEditItem(sec, it));
      $("#del-item-"+sec.id+"-"+it.id)?.addEventListener("click", ()=> onDeleteItem(sec, it));
    });
    // Toppings actions
    (sec.toppings||[]).forEach(tp=>{
      $("#edit-top-"+sec.id+"-"+tp.id)?.addEventListener("click", ()=> onEditTopping(sec, tp));
      $("#del-top-"+sec.id+"-"+tp.id)?.addEventListener("click", ()=> onDeleteTopping(sec, tp));
    });
  });
}

function sectionCard(sec){
  const hasBase = sec.base && (sec.base.title || sec.base.description || sec.base.price);
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
            <div class="kvs"><label>Base</label><div>
              <div class="muted-small">
                ${sec.base.title ? `<strong>${sec.base.title}</strong>` : ""} ${sec.base.description? `— ${sec.base.description}`:""} ${sec.base.price? `— ${sec.base.price}`:""}
              </div>
            </div></div>
          </div>` : ""
        }

        <div class="row-actions" style="margin-top:10px">
          <button class="btn accent" id="edit-sec-${sec.id}">✏ Editar sección</button>
          <button class="btn" id="order-sec-${sec.id}">↕ Orden</button>
          <button class="btn danger" id="del-sec-${sec.id}">🗑 Eliminar</button>
        </div>

        ${Array.isArray(sec.items) && sec.items.length ? `<h3 style="margin:14px 0 6px">Items</h3>`:""}
        ${Array.isArray(sec.items) && sec.items.length ? `
          <div class="grid">
            ${sec.items.map(it=>`
              <div class="card">
                <div class="title">
                  <span>${it.name||""}</span>
                  <span class="right">${it.price||""}</span>
                </div>
                ${it.desc? `<div class="muted">${it.desc}</div>`:""}
                <div class="row-actions" style="margin-top:8px">
                  <button class="btn" id="edit-item-${sec.id}-${it.id}">✏ Editar</button>
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

        ${Array.isArray(sec.toppings) && sec.toppings.length ? `<h3 style="margin:14px 0 6px">Toppings</h3>`:""}
        ${Array.isArray(sec.toppings) && sec.toppings.length ? `
          <div class="toppings">
            ${sec.toppings.map(tp=>`
              <span class="badge">
                ${tp.name}${tp.price?` — ${tp.price}`:""}
                <span style="margin-left:6px">
                  <a href="#" id="edit-top-${sec.id}-${tp.id}">✏</a>
                  <a href="#" id="del-top-${sec.id}-${tp.id}" style="color:#b91c1c">🗑</a>
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
  const title = prompt("Título de la sección (ej: Tostas)");
  if (!title) return;
  const orderStr = prompt("Orden (número, menor aparece primero)", "1");
  const order = Number(orderStr);
  const id = slug(title);

  const data = {
    title, group, order: isNaN(order)? 9999 : order,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  try{
    await setDoc(doc(db, "sections", id), data, { merge: true });
    // items/toppings vacíos (no hace falta crearlos)
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo crear sección.");
  }
}

async function onEditSection(sec){
  const title = prompt("Título", sec.title || "");
  if (!title) return;
  const subtitle = prompt("Subtítulo (opcional)", sec.subtitle || "");
  const note = prompt("Nota (opcional)", sec.note || "");
  let base = sec.base || {};
  const wantsBase = confirm("¿Editar BASE (precio base/título/desc)? Aceptar = Sí, Cancelar = No");
  if (wantsBase){
    const bTitle = prompt("Base: título", base.title || "");
    const bDesc  = prompt("Base: descripción", base.description || "");
    const bPrice = prompt("Base: precio", base.price || "");
    base = { title:bTitle, description:bDesc, price:bPrice };
  }

  try{
    await updateDoc(doc(db, "sections", sec.id), {
      title, subtitle, note, base,
      updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo editar la sección.");
  }
}

async function onDeleteSection(sec){
  if (!confirm(`Eliminar sección "${sec.title}" y TODO su contenido (items/toppings)?`)) return;
  try{
    // Borrar subcolecciones
    for (const it of (sec.items||[])){
      await deleteDoc(doc(db, "sections", sec.id, "items", it.id));
    }
    for (const tp of (sec.toppings||[])){
      await deleteDoc(doc(db, "sections", sec.id, "toppings", tp.id));
    }
    // Borrar doc
    await deleteDoc(doc(db, "sections", sec.id));
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo eliminar la sección.");
  }
}

async function onChangeOrder(sec){
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
  const name = prompt("Nombre del item");
  if (!name) return;
  const desc = prompt("Descripción (opcional)", "");
  const price = prompt("Precio (ej: 3,50 €)", "");

  try{
    await addDoc(collection(db, "sections", sec.id, "items"), {
      name, desc, price, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el item.");
  }
}

async function onEditItem(sec, it){
  const name = prompt("Nombre", it.name || "");
  if (!name) return;
  const desc = prompt("Descripción (opcional)", it.desc || "");
  const price = prompt("Precio (ej: 3,50 €)", it.price || "");
  try{
    await updateDoc(doc(db, "sections", sec.id, "items", it.id), {
      name, desc, price, updatedAt: serverTimestamp()
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

/* ======= Actions: Toppings ======= */
async function onAddTopping(sec){
  const name = prompt("Nombre del topping");
  if (!name) return;
  const price = prompt("Precio (opcional)", "");
  try{
    await addDoc(collection(db, "sections", sec.id, "toppings"), {
      name, price, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await reload();
  }catch(e){
    console.error(e); alert("No se pudo añadir el topping.");
  }
}

async function onEditTopping(sec, tp){
  const name = prompt("Nombre", tp.name || "");
  if (!name) return;
  const price = prompt("Precio (opcional)", tp.price || "");
  try{
    await updateDoc(doc(db, "sections", sec.id, "toppings", tp.id), {
      name, price, updatedAt: serverTimestamp()
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

/* ======= Init & Reload ======= */
async function initEditor(){
  // Nav chips
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

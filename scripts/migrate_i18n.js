// migrate_i18n.js
// Añade campos *_en en blanco a todas las secciones, items y toppings.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, doc, getDocs, collection, updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ⚠️ Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA_knSYppsFYJkXQHroW83Txp-jWLIxAsE",
  authDomain: "esenciacafe-44755.firebaseapp.com",
  projectId: "esenciacafe-44755",
  storageBucket: "esenciacafe-44755.firebasestorage.app",
  messagingSenderId: "1058059262944",
  appId: "1:1058059262944:web:e3c54feef2fb357ffa6985",
  measurementId: "G-2BM2Z4YJ43"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate(){
  console.log("Iniciando migración i18n...");

  const secsSnap = await getDocs(collection(db, "sections"));

  for (const secDoc of secsSnap.docs) {
    const secRef = doc(db, "sections", secDoc.id);
    const sec = secDoc.data();
    const updates = {};

    // Sección
    if (sec.title && !sec.title_en) updates.title_en = "";
    if (sec.subtitle && !sec.subtitle_en) updates.subtitle_en = "";
    if (sec.note && !sec.note_en) updates.note_en = "";
    if (sec.base) {
      if (sec.base.title && !sec.base.title_en) updates["base.title_en"] = "";
      if (sec.base.description && !sec.base.description_en) updates["base.description_en"] = "";
    }
    if (Object.keys(updates).length) {
      await updateDoc(secRef, updates);
      console.log("Sección actualizada:", secDoc.id);
    }

    // Items
    const itemsSnap = await getDocs(collection(db, "sections", secDoc.id, "items"));
    for (const it of itemsSnap.docs) {
      const itRef = doc(db, "sections", secDoc.id, "items", it.id);
      const data = it.data();
      const u = {};
      if (data.name && !data.name_en) u.name_en = "";
      if (data.desc && !data.desc_en) u.desc_en = "";
      if (Object.keys(u).length) {
        await updateDoc(itRef, u);
        console.log(`Item actualizado en sección ${secDoc.id}:`, it.id);
      }
    }

    // Toppings
    const topsSnap = await getDocs(collection(db, "sections", secDoc.id, "toppings"));
    for (const tp of topsSnap.docs) {
      const tpRef = doc(db, "sections", secDoc.id, "toppings", tp.id);
      const data = tp.data();
      const u = {};
      if (data.name && !data.name_en) u.name_en = "";
      if (Object.keys(u).length) {
        await updateDoc(tpRef, u);
        console.log(`Topping actualizado en sección ${secDoc.id}:`, tp.id);
      }
    }
  }

  console.log("✅ Migración completada");
}

migrate().catch(console.error);

import { db } from '../firebase.js';
import {collection, doc, getDocFromServer, getDocsFromServer} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

export async function openMenu() {
  const [settings, sections] = await Promise.all([
    getDocFromServer(doc(db,'settings','menu')),
    getDocsFromServer(collection(db,'sections'))
  ]);
  const headers=sections.docs.filter(d=>!d.data().hidden);
  const cache=new Map(), pending=new Map();
  const load=ids=>Promise.all([...new Set(ids)].map(id=>{
    if(cache.has(id))return cache.get(id);
    if(pending.has(id))return pending.get(id);
    const d=headers.find(d=>d.id===id);if(!d)return null;
    const request=(async()=>{
    // A failed collection must not be mistaken for an empty menu or empty extras.
    const [items,toppings] = await Promise.all([
      getDocsFromServer(collection(db,'sections',d.id,'items')),
      getDocsFromServer(collection(db,'sections',d.id,'toppings'))
    ]);
    const row={...d.data(),id:d.id,
      items:items.docs.map(x=>({...x.data(),id:x.id})),
      toppings:toppings.docs.map(x=>({...x.data(),id:x.id}))};
    cache.set(id,row);return row;
    })().finally(()=>pending.delete(id));pending.set(id,request);return request;
  })).then(rows=>rows.filter(Boolean));
  return {meta:settings.exists()?settings.data():{},sections:headers.map(d=>({...d.data(),id:d.id})),load};
}
export async function readMenu(){const menu=await openMenu();return {meta:menu.meta,sections:await menu.load(menu.sections.map(s=>s.id))};}

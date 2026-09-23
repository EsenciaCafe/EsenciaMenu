import { db } from '../firebase.js';
import {collection, doc, getDocFromServer, getDocsFromServer} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

export async function readMenu() {
  const [settings, sections] = await Promise.all([
    getDocFromServer(doc(db,'settings','menu')),
    getDocsFromServer(collection(db,'sections'))
  ]);
  const rows = await Promise.all(sections.docs.filter(d=>!d.data().hidden).map(async d=>{
    // A failed collection must not be mistaken for an empty menu or empty extras.
    const [items,toppings] = await Promise.all([
      getDocsFromServer(collection(db,'sections',d.id,'items')),
      getDocsFromServer(collection(db,'sections',d.id,'toppings'))
    ]);
    return {...d.data(),id:d.id,
      items:items.docs.map(x=>({...x.data(),id:x.id})),
      toppings:toppings.docs.map(x=>({...x.data(),id:x.id}))};
  }));
  return {meta:settings.exists()?settings.data():{},sections:rows};
}

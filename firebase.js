// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_knSYppsFYJkXQHroW83Txp-jWLIxAsE",
  authDomain: "esenciacafe-44755.firebaseapp.com",
  projectId: "esenciacafe-44755",
  storageBucket: "esenciacafe-44755.firebasestorage.app",
  messagingSenderId: "1058059262944",
  appId: "1:1058059262944:web:e3c54feef2fb357ffa6985",
  measurementId: "G-2BM2Z4YJ43"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

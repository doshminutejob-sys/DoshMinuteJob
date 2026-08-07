import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnuq5Z0DlAE6KG_k5zsQektREiCN1aJk8",
  authDomain: "doshminutejob-8999a.firebaseapp.com",
  projectId: "doshminutejob-8999a",
  storageBucket: "doshminutejob-8999a.firebasestorage.app",
  messagingSenderId: "313464094941",
  appId: "1:313464094941:web:1e4d0f5b92640de65b1b34",
  measurementId: "G-7N7Z8PZBGC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { app };
export default app;

// =========================================================
// firebase-config.js
// إعدادات Firebase المشتركة بين واجهة العملاء ولوحة الإدارة
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAC9oiJOcmKy7U4OxVRHIy-UjZKGCGnEk4",
  authDomain: "ahmed-3fd0f.firebaseapp.com",
  databaseURL: "https://ahmed-3fd0f-default-rtdb.firebaseio.com",
  projectId: "ahmed-3fd0f",
  storageBucket: "ahmed-3fd0f.firebasestorage.app",
  messagingSenderId: "474645723316",
  appId: "1:474645723316:web:b99903f5d627d84cfcffe1",
  measurementId: "G-NEFCS7RVW6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

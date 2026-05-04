/**
 * firebase-config.js — Shared Firebase configuration
 * แก้ไขที่นี่ที่เดียว ใช้ทุกไฟล์ในระบบ
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDStC4nTnL38Wndrmm_Nn8ufJ-8KFo1BdM",
  authDomain:        "kaosoi2.firebaseapp.com",
  databaseURL:       "https://kaosoi2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "kaosoi2",
  storageBucket:     "kaosoi2.firebasestorage.app",
  messagingSenderId: "389832285290",
  appId:             "1:389832285290:web:1f69a33761125c4a44fe13",
};

const RECAPTCHA_KEY = "6Ld-WdcsAAAAAJ0vQaIXgRe4QgRO0EFiC_k2rQmB";

// getApps().length > 0 → ถ้า initializeApp ถูกเรียกจากโมดูลอื่นแล้ว ไม่ต้อง init ซ้ำ
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);

const db   = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

// AppCheck + Auth: defer ออกจาก critical path → ไม่บล็อก render
// ใช้ requestIdleCallback เพื่อรัน หลังจาก browser render หน้าเสร็จแล้ว
function _initAppCheck() {
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) { console.warn("AppCheck:", e.message); }
}

// รัน AppCheck หลัง browser ว่าง (ไม่บล็อก first render)
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(_initAppCheck, { timeout: 3000 });
} else {
  setTimeout(_initAppCheck, 500);
}

signInAnonymously(auth).catch(err => console.error("Auth error:", err));

export { firebaseApp, db, auth };
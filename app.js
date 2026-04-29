/**
 * ข้าวซอย 90 — Admin
 * Firebase Realtime Database
 *
 * ระบบใหม่ batch:
 *   - order มี batches: [ [...items], [...items], ... ]
 *   - แต่ละ batch = การสั่งแต่ละรอบ
 *   - จ่ายแล้ว → ลบ tableOrders/{table} เพื่อให้โต๊ะนั้นได้ order number ใหม่
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, update, remove, onValue, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

// ==================== Firebase Config ====================
const firebaseConfig = {
  apiKey:            "AIzaSyDStC4nTnL38Wndrmm_Nn8ufJ-8KFo1BdM",
  authDomain:        "kaosoi2.firebaseapp.com",
  databaseURL:       "https://kaosoi2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "kaosoi2",
  storageBucket:     "kaosoi2.firebasestorage.app",
  messagingSenderId: "389832285290",
  appId:             "1:389832285290:web:1f69a33761125c4a44fe13",
};

const firebaseApp = initializeApp(firebaseConfig);
const db   = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaV3Provider('6LdcccksAAAAAIU2DAOVbhc0yao-zcNxHWyApA17'),
  isTokenAutoRefreshEnabled: true,
});

signInAnonymously(auth).catch((err) => console.error('Auth error:', err));

// ==================== Config ====================
const ADMIN_USER = 'Piyamit';
const ADMIN_PASS_HASH = 'bfa474b7bef2a64f28c6d8ec0c668174f381bdfc7ad5e0736fb0a9fadf681be0'; 

const AUTH_KEY          = 'krua-khun-mae-auth';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_mne3bzBqINl9JjpoU_fBhpeWENyyxXkpulpFt3oAgfbS704xij-A_FMlLM1k0_2Cog/exec';

// ==================== Rate Limiting ====================
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 5 * 60 * 1000;
const ATTEMPT_KEY        = 'krua-login-attempts';
const LOCKOUT_KEY        = 'krua-login-lockout';

function getAttempts()    { return parseInt(sessionStorage.getItem(ATTEMPT_KEY) || '0', 10); }
function getLockoutUntil(){ return parseInt(sessionStorage.getItem(LOCKOUT_KEY) || '0', 10); }
function incrementAttempts() {
  const n = getAttempts() + 1;
  sessionStorage.setItem(ATTEMPT_KEY, n);
  if (n >= LOGIN_MAX_ATTEMPTS) sessionStorage.setItem(LOCKOUT_KEY, Date.now() + LOGIN_LOCKOUT_MS);
  return n;
}
function resetAttempts() {
  sessionStorage.removeItem(ATTEMPT_KEY);
  sessionStorage.removeItem(LOCKOUT_KEY);
}
function isLockedOut() {
  const until = getLockoutUntil();
  if (!until) return false;
  if (Date.now() < until) return true;
  resetAttempts();
  return false;
}

// ==================== Password Hashing ====================
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(password);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ==================== DOM ====================
const loginScreen      = document.getElementById('loginScreen');
const dashboardScreen  = document.getElementById('dashboardScreen');
const loginBtn         = document.getElementById('loginBtn');
const usernameInput    = document.getElementById('username');
const passwordInput    = document.getElementById('password');
const loginError       = document.getElementById('loginError');
const ordersList       = document.getElementById('ordersList');
const ordersEmpty      = document.getElementById('ordersEmpty');
const logoutBtn        = document.getElementById('logoutBtn');
const todayOrderCount  = document.getElementById('todayOrderCount');
const todayTotal       = document.getElementById('todayTotal');
const tabRecent        = document.getElementById('tabRecent');
const tabHistory       = document.getElementById('tabHistory');
const historyContent   = document.getElementById('historyContent');
const historyEmpty     = document.getElementById('historyEmpty');
const clearDataBtn     = document.getElementById('clearDataBtn');
const clearDataModal   = document.getElementById('clearDataModal');
const clearDataCode    = document.getElementById('clearDataCode');
const clearDataError   = document.getElementById('clearDataError');
const clearDataCancel  = document.getElementById('clearDataCancel');
const clearDataConfirm = document.getElementById('clearDataConfirm');
const exportSheetBtn   = document.getElementById('exportSheetBtn');
const exportModal      = document.getElementById('exportModal');
const exportCancel     = document.getElementById('exportCancel');
const exportConfirm    = document.getElementById('exportConfirm');
const exportStatus     = document.getElementById('exportStatus');
const customDateRange  = document.getElementById('customDateRange');
const dateFrom         = document.getElementById('dateFrom');
const dateTo           = document.getElementById('dateTo');

// ==================== State ====================
let allOrders = [];
let unsubscribeListener = null;

// ==================== Auth ====================
function isLoggedIn()     { return sessionStorage.getItem(AUTH_KEY) === 'true'; }
function setLoggedIn(val) { val ? sessionStorage.setItem(AUTH_KEY,'true') : sessionStorage.removeItem(AUTH_KEY); }

function showScreen(screen) {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.add('hidden');
  screen.classList.remove('hidden');
}

// ==================== Helpers ====================
function formatMoney(n) {
  return '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// sanitizeNum — ยอมรับเฉพาะตัวเลข (ป้องกัน XSS จาก Firebase data)
function sanitizeNum(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? '' : n;
}
function formatDate(isoString) {
  return new Date(isoString).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
}
function formatDateOnly(isoString) {
  return new Date(isoString).toLocaleDateString('th-TH', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}
function getDateKey(isoString) { return new Date(isoString).toISOString().slice(0, 10); }
function isToday(isoString) {
  return getDateKey(isoString) === new Date().toISOString().slice(0, 10);
}
function isWithinLast30Days(isoString) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return new Date(isoString) >= cutoff;
}

/**
 * ดึง flat items จาก order ที่อาจมี batches หรือ items (รองรับทั้งสองรูปแบบ)
 */
function getAllItems(order) {
  if (order.batches) {
    return order.batches.flat();
  }
  return order.items || [];
}

// ==================== Sound Alert (Text-to-Speech + AudioContext fallback) ====================
let soundEnabled = true;
let knownOrderKeys = new Set();
let isFirstLoad = true;

// ข้อความที่ใช้พูด (ปรับได้)
const TTS_ORDER_TEXT  = 'มีออเดอร์ใหม่จ้า';
const TTS_BATCH_TEXT  = 'ลูกค้าสั่งเพิ่มจ้า';
const TTS_CALL_TEXT   = 'ลูกค้าเรียกพนักงานจ้า';

// ---- AudioContext (beep fallback สำหรับ iOS ที่ TTS ใช้ไม่ได้) ----
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  // iOS: resume ถ้า suspended (ต้องอยู่ใน user-gesture context)
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

/**
 * เล่นเสียง beep ผ่าน AudioContext
 * @param {number[]} freqs - อาร์เรย์ของ Hz ที่จะเล่นต่อเนื่อง
 * @param {number} dur - ความยาวแต่ละโน้ต (วินาที)
 */
function playBeep(freqs = [880], dur = 0.18) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  let t = ctx.currentTime + 0.05;
  freqs.forEach(freq => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    t += dur + 0.04;
  });
}

// ---- iOS Speech unlock ----
/**
 * iOS ต้องการให้ทั้ง AudioContext และ speechSynthesis ถูก "unlock"
 * ด้วย user gesture โดยตรง (volume > 0 และ resume AudioContext)
 */
let iosUnlocked = false;
function unlockIOSSpeech() {
  // AudioContext: resume ใน gesture context
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (iosUnlocked || !window.speechSynthesis) return;
  try {
    // ต้องใช้ volume > 0 และข้อความมีความยาว — iOS จึงจะนับว่า unlock จริง
    const utter = new SpeechSynthesisUtterance(' ');
    utter.volume = 0.01;  // ต่ำมากแต่ > 0
    utter.rate   = 2;
    window.speechSynthesis.speak(utter);
    iosUnlocked = true;
  } catch(e) {}
}

// ---- iOS Safari bug: speechSynthesis หยุดเองหลัง ~30 วิ ----
// วิธีแก้: cancel + re-speak ถ้า paused ขณะกำลังพูด
let _ttsWatchdog = null;
function _startTTSWatchdog(utter) {
  clearInterval(_ttsWatchdog);
  _ttsWatchdog = setInterval(() => {
    if (!window.speechSynthesis) { clearInterval(_ttsWatchdog); return; }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, 5000);
  utter.onend = utter.onerror = () => clearInterval(_ttsWatchdog);
}

/**
 * พูดข้อความด้วย Web Speech API พร้อม beep fallback
 * @param {string} text - ข้อความที่ต้องการพูด
 * @param {object} [opts] - { rate, pitch, volume, beep }
 */
function speak(text, opts = {}) {
  if (!soundEnabled) return;

  // เล่น beep ก่อนเสมอ (ช่วยให้ AudioContext active บน iOS)
  if (opts.beep !== false) playBeep(opts.beep || [880, 1100], 0.15);

  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();

    const utter    = new SpeechSynthesisUtterance(text);
    utter.lang     = 'th-TH';
    utter.rate     = opts.rate   ?? 0.85;
    utter.pitch    = opts.pitch  ?? 1.1;
    utter.volume   = opts.volume ?? 1.0;

    // เลือก voice ภาษาไทยถ้ามี, fallback default voice
    const voices  = window.speechSynthesis.getVoices();
    const thVoice = voices.find(v => v.lang === 'th-TH' || v.lang.startsWith('th'));
    if (thVoice) utter.voice = thVoice;

    // เริ่ม watchdog แก้บัก iOS pause
    _startTTSWatchdog(utter);

    // iOS: ต้อง delay เล็กน้อยหลัง cancel() ไม่งั้น speak() ถูกกลืน
    setTimeout(() => {
      try { window.speechSynthesis.speak(utter); } catch(e) {}
    }, 120);

  } catch (e) { console.warn('TTS error:', e); }
}

// โหลด voice list ก่อน (บางเบราว์เซอร์ต้องรอ event)
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
}

function playOrderAlert()  { speak(TTS_ORDER_TEXT, { beep: [880, 1047] }); }
function playBatchAlert()  { speak(TTS_BATCH_TEXT, { pitch: 1.2, beep: [1047, 1319] }); }
function playCallAlert()   { speak(TTS_CALL_TEXT,  { rate: 0.8, pitch: 0.95, beep: [660, 784, 880] }); }

// ==================== Firebase: Real-time Listener ====================
let callStaffUnsubscribe = null;
let knownCallKeys = new Set();

function startCallStaffListener() {
  if (callStaffUnsubscribe) callStaffUnsubscribe();
  knownCallKeys = new Set();

  callStaffUnsubscribe = onValue(ref(db, 'callStaff'), snap => {
    if (!snap.exists()) { knownCallKeys = new Set(); return; }
    snap.forEach(child => {
      const key  = child.key;
      const data = child.val();
      if (!data.done && !knownCallKeys.has(key)) {
        knownCallKeys.add(key);
        showCallStaffToast(data, key);
        playCallAlert();
      }
    });
  });
}

function showCallStaffToast(data, tableKey) {
  const toast = document.createElement('div');
  toast.className = 'new-order-toast call-staff-toast';

  // ใช้ DOM API แทน innerHTML เพื่อป้องกัน XSS
  const icon   = document.createElement('strong');
  icon.textContent = '🔔 เรียกพนักงาน!';
  const tableText = document.createTextNode(
    ` โต๊ะ ${sanitizeNum(data.table)}` +
    (data.orderNumber ? ` (ออเดอร์ #${sanitizeNum(data.orderNumber)})` : '')
  );
  const ackBtn = document.createElement('button');
  ackBtn.type = 'button'; ackBtn.className = 'toast-ack';
  ackBtn.setAttribute('data-key', tableKey);
  ackBtn.textContent = '✓ รับทราบ';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';

  toast.append(icon, tableText, ' ', ackBtn, ' ', closeBtn);
  document.body.appendChild(toast);
  closeBtn.addEventListener('click', () => toast.remove());
  ackBtn.addEventListener('click', async () => {
    try { await update(ref(db, `callStaff/${tableKey}`), { done: true }); } catch(e) {}
    toast.remove();
  });
}

function startRealtimeListener() {
  if (unsubscribeListener) unsubscribeListener();
  knownOrderKeys = new Set();
  isFirstLoad    = true;

  unsubscribeListener = onValue(ref(db, 'orders'), (snapshot) => {
    const newOrders = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        newOrders.push({ firebaseKey: child.key, ...child.val() });
      });
      newOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    if (!isFirstLoad) {
      let hasNewOrder = false;
      let hasNewBatch = false;
      newOrders.forEach((o) => {
        if (!knownOrderKeys.has(o.firebaseKey) && o.status === 'pending') {
          hasNewOrder = true;
          showOrderToast(o);
        } else if (knownOrderKeys.has(o.firebaseKey) && o.status === 'pending' && o.lastBatchDate) {
          // batch ใหม่ถูกเพิ่มเข้า order เดิม
          const old = allOrders.find(x => x.firebaseKey === o.firebaseKey);
          if (old) {
            const oldBatchCount  = (old.batches  || [old.items  || []]).length;
            const newBatchCount  = (o.batches    || [o.items    || []]).length;
            if (newBatchCount > oldBatchCount) {
              hasNewBatch = true;
              showBatchToast(o, newBatchCount);
            }
          }
        }
      });
      if (hasNewOrder) playOrderAlert();
      else if (hasNewBatch) playBatchAlert();
    }

    knownOrderKeys = new Set(newOrders.map(o => o.firebaseKey));
    isFirstLoad    = false;
    allOrders      = newOrders;

    renderDailySummary();
    renderOrders();
    renderHistory();
    renderTakeawayOrders();
  });
}

function showOrderToast(order) {
  document.querySelectorAll('.new-order-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'new-order-toast';

  const icon = document.createElement('strong');
  icon.textContent = '🔔 ออเดอร์ใหม่!';
  const info = document.createTextNode(
    ` #${sanitizeNum(order.orderNumber)} โต๊ะ ${sanitizeNum(order.table) || '-'}`
  );
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';

  toast.append(icon, info, ' ', closeBtn);
  document.body.appendChild(toast);
  closeBtn.addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

function showBatchToast(order, batchNum) {
  const toast = document.createElement('div');
  toast.className = 'new-order-toast';

  const icon = document.createElement('strong');
  icon.textContent = '🍽 สั่งเพิ่ม!';
  const info = document.createTextNode(
    ` #${sanitizeNum(order.orderNumber)} โต๊ะ ${sanitizeNum(order.table) || '-'} (รอบที่ ${parseInt(batchNum, 10) || '?'})`
  );
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';

  toast.append(icon, info, ' ', closeBtn);
  document.body.appendChild(toast);
  closeBtn.addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

// ==================== Firebase: Actions ====================
async function markOrderAsPaid(firebaseKey) {
  const order = allOrders.find(o => o.firebaseKey === firebaseKey);
  await update(ref(db, `orders/${firebaseKey}`), { status: 'paid' });
  // ลบ tableOrders เพื่อให้โต๊ะนั้นได้ order number ใหม่ครั้งต่อไป
  if (order && order.table) {
    try {
      const tableSnap = await get(ref(db, `tableOrders/${order.table}`));
      if (tableSnap.exists() && tableSnap.val().orderKey === firebaseKey) {
        await remove(ref(db, `tableOrders/${order.table}`));
      }
    } catch (err) {
      console.error('tableOrders remove error:', err);
    }
  }
}

async function markOrderAsCooking(firebaseKey) {
  await update(ref(db, `orders/${firebaseKey}`), { status: 'cooking' });
}

async function markOrderAsServed(firebaseKey) {
  await update(ref(db, `orders/${firebaseKey}`), { status: 'served' });
}

async function deleteOrder(firebaseKey, orderNumber) {
  if (!confirm(`ลบออเดอร์ #${orderNumber} ?`)) return;
  const order = allOrders.find(o => o.firebaseKey === firebaseKey);
  await remove(ref(db, `orders/${firebaseKey}`));
  if (order && order.table) {
    try {
      const tableSnap = await get(ref(db, `tableOrders/${order.table}`));
      if (tableSnap.exists() && tableSnap.val().orderKey === firebaseKey) {
        await remove(ref(db, `tableOrders/${order.table}`));
      }
    } catch (err) { /* ignore */ }
  }
}

async function clearAllOrders() {
  await remove(ref(db, 'orders'));
  await remove(ref(db, 'tableOrders')); // ล้าง active table orders ด้วย
  await update(ref(db, 'meta'), {
    orderNumber: 1001,
    lastOrderDate: new Date().toISOString().slice(0, 10),
  });
  closeClearDataModal();
}

// ==================== Products (admin add-item) ====================
const ALL_PRODUCTS = [
  // ข้าวซอย
  { id: 'soi1',  name: 'ข้าวซอยน่องไก่', price: 70, category: 'kaosoi' },
  { id: 'soi2',  name: 'ข้าวซอยหมูทอด',  price: 70, category: 'kaosoi' },
  { id: 'soi4',  name: 'น้ำเงี้ยว',       price: 60, category: 'kaosoi' },
  { id: 'soi5',  name: 'เพิ่มน่องไก่',    price: 20, category: 'kaosoi' },
  { id: 'soi6',  name: 'เพิ่มหมูทอด',     price: 20, category: 'kaosoi' },
  { id: 'soi8',  name: 'แคบหมู',          price: 15, category: 'kaosoi' },
  { id: 'soi9',  name: 'ไข่ต้ม',          price: 10, category: 'kaosoi' },
  // ข้าวหมูทอด
  { id: 'kao1',    name: 'ข้าวหมูทอด', price: 50, category: 'kaomutod' },
  { id: 'kao-egg', name: 'ไข่ต้ม',     price: 10, category: 'kaomutod' },
  // น้ำ
  { id: 'water',          name: 'น้ำเปล่า',       price: 10, category: 'nam' },
  { id: 'pepsi',          name: 'โค๊ก',           price: 15, category: 'nam' },
  { id: 'fantag',         name: 'น้ำเขียวแฟนต้า', price: 15, category: 'nam' },
  { id: 'fanta',          name: 'น้ำแดงแฟนต้า',  price: 15, category: 'nam' },
  { id: 'sprite',         name: 'สไปร์ท',         price: 15, category: 'nam' },
  { id: 'coconut',        name: 'มะพร้าวปั่น',    price: 45, category: 'nam' },
  { id: 'thai-tea',       name: 'ชาไทย',          price: 40, category: 'nam' },
  { id: 'black-tea',      name: 'ชาดำเย็น',       price: 40, category: 'nam' },
  { id: 'lemon-tea',      name: 'ชามะนาว',        price: 40, category: 'nam' },
  { id: 'pink-milk',      name: 'นมชมพู',         price: 40, category: 'nam' },
  { id: 'cocoa',          name: 'โกโก้',          price: 40, category: 'nam' },
  { id: 'coconut-matcha', name: 'มัทฉะมะพร้าว',   price: 60, category: 'nam' },
  { id: 'matcha-latte',   name: 'มัทฉะลาเต้',     price: 60, category: 'nam' },
  { id: 'pure-matcha',    name: 'เพียวมัทฉะ',     price: 55, category: 'nam' },
  // กาแฟ
  { id: 'espresso',          name: 'เอสเปรสโซ่',       price: 55, category: 'coffee' },
  { id: 'cappuccino',        name: 'คาปูชิโน่',         price: 55, category: 'coffee' },
  { id: 'latte',             name: 'ลาเต้',             price: 55, category: 'coffee' },
  { id: 'mocha',             name: 'มอคค่า',            price: 55, category: 'coffee' },
  { id: 'americano',         name: 'อเมริกาโน่',         price: 45, category: 'coffee' },
  { id: 'coconut-americano', name: 'อเมริกาโน่มะพร้าว', price: 60, category: 'coffee' },
  { id: 'honey-americano',   name: 'อเมริกาโน่น้ำผึ้ง', price: 60, category: 'coffee' },
  { id: 'orange-americano',  name: 'อเมริกาโน่ส้ม',     price: 60, category: 'coffee' },
  // โซดา
  { id: 'red-lime-soda',    name: 'แดงมะนาวโซดา',      price: 35, category: 'soda' },
  { id: 'blue-hawaii-soda', name: 'บลูฮาวายมะนาวโซดา', price: 35, category: 'soda' },
  { id: 'apple-soda',       name: 'แอปเปิ้ลโซดา',      price: 35, category: 'soda' },
  { id: 'orange-soda',      name: 'ส้มโซดา',           price: 35, category: 'soda' },
  { id: 'strawberry-soda',  name: 'สตรอเบอร์รี่โซดา',  price: 35, category: 'soda' },
  { id: 'blueberry-soda',   name: 'บลูเบอร์รี่โซดา',   price: 35, category: 'soda' },
];

const ADD_ITEM_CATEGORIES = [
  { id: 'all',      label: '🍽 ทั้งหมด' },
  { id: 'kaosoi',   label: '🍜 ข้าวซอย' },
  { id: 'kaomutod', label: '🍚 ข้าวหมูทอด' },
  { id: 'nam',      label: '🥤 น้ำ' },
  { id: 'coffee',   label: '☕ กาแฟ' },
  { id: 'soda',     label: '🫧 โซดา' },
];
let addItemActiveCategory = 'all';

// ==================== Add Item Modal ====================
let addItemTargetKey   = null;
let addItemTargetOrder = null;
let addItemToastTimer  = null;

const addItemModal       = document.getElementById('addItemModal');
const addItemProductList = document.getElementById('addItemProductList');
const addItemCancel      = document.getElementById('addItemCancel');

function openAddItemModal(firebaseKey, order) {
  addItemTargetKey   = firebaseKey;
  addItemTargetOrder = JSON.parse(JSON.stringify(order));
  renderAddItemList();
  addItemModal.setAttribute('aria-hidden', 'false');
}

function renderAddItemList() {
  const allItems = getAllItems(addItemTargetOrder);
  const filtered = addItemActiveCategory === 'all'
    ? ALL_PRODUCTS
    : ALL_PRODUCTS.filter(p => p.category === addItemActiveCategory);

  const tabsHtml = `<div class="add-item-cat-tabs">${
    ADD_ITEM_CATEGORIES.map(cat =>
      `<button type="button" class="add-item-cat-btn${addItemActiveCategory === cat.id ? ' active' : ''}" data-cat="${cat.id}">${escapeHtml(cat.label)}</button>`
    ).join('')
  }</div>`;

  const productsHtml = `<div class="add-item-product-grid">${
    filtered.map(p => {
      const existing = allItems.find(i => i.name === p.name);
      const qty      = existing ? existing.qty : 0;
      return `<button type="button" class="add-item-product-btn" data-id="${p.id}" data-name="${p.name.replace(/"/g,'&quot;')}" data-price="${p.price}">
        <span class="add-item-product-name">${escapeHtml(p.name)}</span>
        <span class="add-item-product-price">${formatMoney(p.price)}</span>
        ${qty > 0 ? `<span class="add-item-qty-badge">${qty}</span>` : ''}
      </button>`;
    }).join('')
  }</div>`;

  addItemProductList.innerHTML = tabsHtml + productsHtml;

  addItemProductList.querySelectorAll('.add-item-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addItemActiveCategory = btn.dataset.cat;
      renderAddItemList();
    });
  });
  addItemProductList.querySelectorAll('.add-item-product-btn').forEach(btn => {
    btn.addEventListener('click', () => addItemToOrder(btn.dataset));
  });
}

function closeAddItemModal() {
  addItemModal.setAttribute('aria-hidden', 'true');
  addItemTargetKey      = null;
  addItemTargetOrder    = null;
  addItemActiveCategory = 'all';
  if (addItemToastTimer) { clearTimeout(addItemToastTimer); addItemToastTimer = null; }
  const toast = document.getElementById('addItemToastMsg');
  if (toast) { toast.textContent = ''; toast.classList.remove('show'); }
}

async function addItemToOrder({ name, price }) {
  if (!addItemTargetKey || !addItemTargetOrder) return;

  // Admin เพิ่มของเข้า batch สุดท้าย (หรือสร้าง batch ใหม่)
  const batches = addItemTargetOrder.batches
    ? JSON.parse(JSON.stringify(addItemTargetOrder.batches))
    : [JSON.parse(JSON.stringify(addItemTargetOrder.items || []))];

  const lastBatch = batches[batches.length - 1] || [];
  const existing  = lastBatch.find(i => i.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    lastBatch.push({ name, price: parseFloat(price), qty: 1 });
  }
  batches[batches.length - 1] = lastBatch;

  const newTotal = batches.flat().reduce((sum, i) => sum + i.price * i.qty, 0);
  addItemTargetOrder.batches = batches;
  addItemTargetOrder.total   = newTotal;

  try {
    await update(ref(db, `orders/${addItemTargetKey}`), {
      batches,
      total: newTotal,
    });
  } catch (err) {
    console.error('addItemToOrder error:', err);
    return;
  }

  const toast = document.getElementById('addItemToastMsg');
  if (toast) {
    toast.textContent = `✅ เพิ่ม "${escapeHtml(name)}" แล้ว`;
    toast.className   = 'add-item-toast show';
    if (addItemToastTimer) clearTimeout(addItemToastTimer);
    addItemToastTimer = setTimeout(() => { toast.className = 'add-item-toast'; }, 2000);
  }

  renderAddItemList();
}

if (addItemCancel) addItemCancel.addEventListener('click', closeAddItemModal);
if (addItemModal)  addItemModal.addEventListener('click', (e) => { if (e.target === addItemModal) closeAddItemModal(); });

// ==================== Render Summary ====================
function renderDailySummary() {
  const paidToday = allOrders.filter((o) => o.status === 'paid' && isToday(o.date));
  todayOrderCount.textContent = paidToday.length;
  todayTotal.textContent      = formatMoney(paidToday.reduce((sum, o) => sum + o.total, 0));
}

// ==================== Render Orders (with batch display) ====================
const TAKEAWAY_IDS_ADMIN = ['takeaway1','takeaway2','takeaway3'];

function renderOrders() {
  const nonTaOrders = allOrders.filter(o => !TAKEAWAY_IDS_ADMIN.includes(String(o.table)) && !o.takeaway);
  if (nonTaOrders.length === 0) {
    ordersList.innerHTML = '';
    ordersList.classList.add('hidden');
    ordersEmpty.classList.remove('hidden');
    return;
  }

  ordersEmpty.classList.add('hidden');
  ordersList.classList.remove('hidden');

  const statusMap = {
    pending: { label: '🔔 ออเดอร์ใหม่', cls: 'pending' },
    cooking: { label: '👨‍🍳 กำลังทำ',    cls: 'cooking' },
    served:  { label: '🍽 เสิร์ฟแล้ว',  cls: 'served'  },
    paid:    { label: '✅ จ่ายแล้ว',     cls: 'paid'    },
  };

  ordersList.innerHTML = nonTaOrders.map((order) => {
    const s = order.status || 'pending';
    const { label: statusLabel, cls: statusCls } = statusMap[s] || statusMap.pending;
    const fromQR = order.source === 'qr';

    let actionBtns = '';
    if (s === 'pending') {
      actionBtns = `<button type="button" class="btn-cooking" data-key="${order.firebaseKey}">👨‍🍳 รับออเดอร์</button>`;
    } else if (s === 'cooking') {
      actionBtns = `<button type="button" class="btn-served" data-key="${order.firebaseKey}">🍽 เสิร์ฟแล้ว</button>`;
    } else if (s === 'served') {
      actionBtns = `<button type="button" class="btn-paid" data-key="${order.firebaseKey}">✅ จ่ายแล้ว</button>`;
    }

    // ─── Render batches ───
    const batches = order.batches || [order.items || []]; // รองรับ format เดิม
    const batchesHtml = batches.map((batchItems, bIdx) => {
      const batchTotal = batchItems.reduce((s, i) => s + i.price * i.qty, 0);
      const batchLabel = batches.length > 1 ? `รอบที่ ${bIdx + 1}` : 'รายการ';
      return `
        <div class="batch-group">
          ${batches.length > 1 ? `<div class="batch-label">🍽 ${escapeHtml(batchLabel)}</div>` : ''}
          <ul class="order-items">
            ${batchItems.map((i) => `
              <li class="order-item">
                <span>${escapeHtml(i.name)}${i.option ? `<span class="order-item-option"> · ${escapeHtml(i.option)}</span>` : ''} × ${i.qty}</span>
                <span>${formatMoney(i.price * i.qty)}</span>
              </li>`).join('')}
          </ul>
          ${batches.length > 1 ? `<div class="batch-subtotal">รอบนี้: ${formatMoney(batchTotal)}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <article class="order-card order-card--${statusCls}" data-key="${order.firebaseKey}">
        <div class="order-card-header">
          <div class="order-card-header-row">
            <h3 class="order-card-title">
              ออเดอร์ #${escapeHtml(String(order.orderNumber))}
              ${order.table ? `<span class="order-table-chip">โต๊ะ ${escapeHtml(String(order.table))}</span>` : ''}
              ${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}
              ${fromQR ? `<span class="order-qr-badge">📱 QR</span>` : ''}
            </h3>
            <span class="status-badge ${statusCls}">${statusLabel}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(order.date)}</span>
            <div class="order-actions">
              ${actionBtns}
              <button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button>
              <button type="button" class="btn-delete" data-key="${order.firebaseKey}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button>
            </div>
          </div>
        </div>
        <div class="order-card-body">
          ${batchesHtml}
          <div class="order-total-row">
            <span>รวมทั้งหมด</span>
            <span>${formatMoney(order.total)}</span>
          </div>
        </div>
      </article>`;
  }).join('');

  ordersList.querySelectorAll('.btn-cooking').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsCooking(btn.dataset.key));
  });
  ordersList.querySelectorAll('.btn-served').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsServed(btn.dataset.key));
  });
  ordersList.querySelectorAll('.btn-paid').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key));
  });
  ordersList.querySelectorAll('.btn-add-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => o.firebaseKey === btn.dataset.key);
      if (order) openAddItemModal(btn.dataset.key, order);
    });
  });
  ordersList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num));
  });
}

// ==================== Render History ====================
function renderHistory() {
  const paidLast30 = allOrders.filter((o) => o.status === 'paid' && isWithinLast30Days(o.date));

  if (paidLast30.length === 0) {
    historyContent.innerHTML = '';
    historyContent.classList.add('hidden');
    historyEmpty.classList.remove('hidden');
    return;
  }

  historyEmpty.classList.add('hidden');
  historyContent.classList.remove('hidden');

  const byDay = {};
  paidLast30.forEach((o) => {
    const key = getDateKey(o.date);
    if (!byDay[key]) byDay[key] = { date: o.date, orders: [], total: 0 };
    byDay[key].orders.push(o);
    byDay[key].total += o.total;
  });

  historyContent.innerHTML = Object.keys(byDay).sort((a, b) => b.localeCompare(a)).map((key) => {
    const day = byDay[key];
    return `
      <section class="history-day">
        <div class="history-day-header">
          <span class="history-day-date">${formatDateOnly(day.date)}</span>
          <div class="history-day-summary">
            <span class="history-day-count">${day.orders.length} ออเดอร์</span>
            <span class="history-day-total">${formatMoney(day.total)}</span>
          </div>
        </div>
        <div class="history-day-body">
          <ul class="history-orders">
            ${day.orders.map((o) => {
              const batches = o.batches || [o.items || []];
              return `<li class="history-order-row">
                <span>ออเดอร์ #${escapeHtml(String(o.orderNumber))}${o.table ? ` · โต๊ะ ${o.table}` : ''} · ${formatDate(o.date)}${batches.length > 1 ? ` <em>(${batches.length} รอบ)</em>` : ''}</span>
                <span>${formatMoney(o.total)}</span>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </section>`;
  }).join('');
}

// ==================== Tabs ====================
const tabTakeaway = document.getElementById('tabTakeaway');

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  tabRecent.classList.toggle('hidden',    tabId !== 'recent');
  tabHistory.classList.toggle('hidden',   tabId !== 'history');
  tabTakeaway.classList.toggle('hidden',  tabId !== 'takeaway');
  if (tabId === 'takeaway') renderTakeawayQrPanel();
}

// ==================== Takeaway QR Panel ====================
const TAKEAWAY_SLOTS = ['takeaway1', 'takeaway2', 'takeaway3'];
const TAKEAWAY_LABELS = { takeaway1: 'ลิงก์ที่ 1', takeaway2: 'ลิงก์ที่ 2', takeaway3: 'ลิงก์ที่ 3' };
const TA_STORAGE_KEY = 'ta-base-url';

function getTakeawayUrl(slotId) {
  let base = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/');
  if (!base.endsWith('/')) base += '/';
  return base + 'customer.html?table=' + slotId;
}

let qrInstances = {};

function renderTakeawayQrPanel() {
  const container = document.getElementById('takeawayQrSlots');
  if (!container) return;

  // ถ้า render แล้ว ไม่ต้องสร้าง UI ซ้ำ (update ทำผ่านปุ่ม)
  if (container.dataset.rendered === '1') return;
  container.dataset.rendered = '1';

  const savedBase = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/');

  container.innerHTML = `
    <div class="ta-url-row">
      <label class="ta-url-label">🌐 URL ฐาน (แก้ครั้งเดียวใช้ทุกลิงก์)</label>
      <div class="ta-url-input-row">
        <input type="text" id="taBaseUrl" class="field-input ta-url-input" value="${escapeHtml(savedBase)}" placeholder="https://yoursite.com/">
        <button type="button" class="btn btn-primary ta-url-apply-btn" id="taApplyBtn">🔄 อัปเดต QR</button>
      </div>
    </div>
    <div class="ta-slots-grid" id="taSlotsGrid"></div>
  `;

  renderTaSlots();

  document.getElementById('taApplyBtn').addEventListener('click', () => {
    const val = document.getElementById('taBaseUrl').value.trim();
    if (!val) return;
    localStorage.setItem(TA_STORAGE_KEY, val);

    // อัปเดต QR แต่ละ slot ใน-place (ไม่ rebuild DOM ทั้งหมด)
    TAKEAWAY_SLOTS.forEach((slotId) => {
      const url   = getTakeawayUrl(slotId);
      const boxEl = document.getElementById(`taQrBox_${slotId}`);
      const urlEl = boxEl?.parentElement?.querySelector('.ta-qr-url');
      const copyBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-copy-btn');
      const printBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-print-btn');

      // อัปเดต URL text
      if (urlEl) urlEl.textContent = url;
      if (copyBtn) copyBtn.dataset.url = url;

      // ล้าง QR เก่าแล้วสร้างใหม่
      if (boxEl) {
        boxEl.innerHTML = '';
        try {
          qrInstances[slotId] = new QRCode(boxEl, {
            text:         url,
            width:        150,
            height:       150,
            colorDark:    '#3d2b1f',
            colorLight:   '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
          });
        } catch(e) {
          boxEl.innerHTML = '<p style="font-size:0.7rem;color:#888">QR Error</p>';
        }
      }

      // อัปเดต print button ด้วย URL ใหม่
      if (printBtn) {
        // rebind print event: clone & replace
        const newPrintBtn = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
        newPrintBtn.addEventListener('click', () => {
          const freshUrl = getTakeawayUrl(slotId);
          const idx = newPrintBtn.dataset.idx;
          _openPrintWindow(freshUrl, idx);
        });
      }

      // rebind copy event
      if (copyBtn) {
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        newCopyBtn.dataset.url = url;
        newCopyBtn.addEventListener('click', () => _copyUrl(newCopyBtn));
      }
    });

    // flash ปุ่มให้รู้ว่า update แล้ว
    const applyBtn = document.getElementById('taApplyBtn');
    const orig = applyBtn.textContent;
    applyBtn.textContent = '✅ อัปเดตแล้ว!';
    setTimeout(() => { applyBtn.textContent = orig; }, 1800);
  });
}

function _copyUrl(btn) {
  navigator.clipboard.writeText(btn.dataset.url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ คัดลอกแล้ว!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    prompt('คัดลอกลิงก์:', btn.dataset.url);
  });
}

function _openPrintWindow(url, idx) {
  const win = window.open('', '_blank', 'width=400,height=580');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Mitr:wght@600;700&display=swap" rel="stylesheet">
    <style>
      body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}
      .w{text-align:center;padding:1.5rem;border:2px solid #3d2b1f;border-radius:14px;max-width:260px;}
      .shop{font-family:'Mitr',sans-serif;font-size:1.1rem;color:#3d2b1f;font-weight:700;margin-bottom:.3rem;}
      .lbl{font-family:'Mitr',sans-serif;font-size:1.5rem;font-weight:700;color:#1a7a4a;margin:.4rem 0;}
      .hint{font-size:.82rem;color:#8b6655;margin-top:.4rem;}
      #qr{border:3px solid #1a7a4a;border-radius:8px;padding:5px;display:inline-block;margin:.6rem 0;}
    </style></head><body>
    <div class="w">
      <div class="shop">🍛 ข้าวซอย 90</div>
      <div id="qr"></div>
      <div class="lbl">📦 กลับบ้าน (ลิงก์ ${idx})</div>
      <div class="hint">สแกน QR เพื่อสั่งกลับบ้าน</div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <script>new QRCode(document.getElementById('qr'),{text:'${url}',width:170,height:170,colorDark:'#3d2b1f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});setTimeout(()=>window.print(),800);<\/script>
    </body></html>`);
  win.document.close();
}

function renderTaSlots() {
  const grid = document.getElementById('taSlotsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  qrInstances = {};

  TAKEAWAY_SLOTS.forEach((slotId, idx) => {
    const url    = getTakeawayUrl(slotId);
    const label  = TAKEAWAY_LABELS[slotId];
    const boxId  = `taQrBox_${slotId}`;

    const card = document.createElement('div');
    card.className = 'ta-qr-card';
    card.innerHTML = `
      <div class="ta-qr-card-header">📦 กลับบ้าน — ${escapeHtml(label)}</div>
      <div class="ta-qr-card-body">
        <div class="ta-qr-box" id="${boxId}"></div>
        <div class="ta-qr-url">${escapeHtml(url)}</div>
      </div>
      <div class="ta-qr-card-footer">
        <button type="button" class="btn btn-green ta-copy-btn" data-url="${escapeHtml(url)}">📋 คัดลอกลิงก์</button>
        <button type="button" class="btn btn-outline ta-print-btn" data-slot="${slotId}" data-idx="${idx+1}">🖨 พิมพ์</button>
      </div>
    `;
    grid.appendChild(card);

    // Generate QR
    try {
      const qr = new QRCode(document.getElementById(boxId), {
        text:         url,
        width:        150,
        height:       150,
        colorDark:    '#3d2b1f',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      qrInstances[slotId] = qr;
    } catch(e) {
      const el = document.getElementById(boxId);
      if (el) el.innerHTML = '<p style="font-size:0.7rem;color:#888">QR Error</p>';
    }
  });

  // bind copy buttons
  grid.querySelectorAll('.ta-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => _copyUrl(btn));
  });

  // bind print buttons
  grid.querySelectorAll('.ta-print-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = getTakeawayUrl(btn.dataset.slot);
      _openPrintWindow(url, btn.dataset.idx);
    });
  });
}

// ==================== Render Takeaway Orders ====================
function renderTakeawayOrders() {
  const taList  = document.getElementById('takeawayOrdersList');
  const taEmpty = document.getElementById('takeawayOrdersEmpty');
  if (!taList || !taEmpty) return;

  const TAKEAWAY_IDS = ['takeaway1','takeaway2','takeaway3'];
  const taOrders = allOrders.filter(o => TAKEAWAY_IDS.includes(String(o.table)) || o.takeaway === true);

  if (taOrders.length === 0) {
    taList.innerHTML = '';
    taList.classList.add('hidden');
    taEmpty.classList.remove('hidden');
    return;
  }

  taEmpty.classList.add('hidden');
  taList.classList.remove('hidden');

  const statusMap = {
    pending: { label: '🔔 ออเดอร์ใหม่', cls: 'pending' },
    cooking: { label: '👨‍🍳 กำลังทำ',    cls: 'cooking' },
    served:  { label: '🍽 พร้อมส่ง',     cls: 'served'  },
    paid:    { label: '✅ จ่ายแล้ว',     cls: 'paid'    },
  };

  taList.innerHTML = taOrders.map((order) => {
    const s = order.status || 'pending';
    const { label: statusLabel, cls: statusCls } = statusMap[s] || statusMap.pending;
    let actionBtns = '';
    if (s === 'pending') {
      actionBtns = `<button type="button" class="btn-cooking" data-key="${order.firebaseKey}">👨‍🍳 รับออเดอร์</button>`;
    } else if (s === 'cooking') {
      actionBtns = `<button type="button" class="btn-served" data-key="${order.firebaseKey}">📦 พร้อมส่ง</button>`;
    } else if (s === 'served') {
      actionBtns = `<button type="button" class="btn-paid" data-key="${order.firebaseKey}">✅ จ่ายแล้ว</button>`;
    }

    const batches = order.batches || [order.items || []];
    const batchesHtml = batches.map((batchItems, bIdx) => {
      const batchTotal = batchItems.reduce((s, i) => s + i.price * i.qty, 0);
      const batchLabel = batches.length > 1 ? `รอบที่ ${bIdx + 1}` : 'รายการ';
      return `
        <div class="batch-group">
          ${batches.length > 1 ? `<div class="batch-label">🍽 ${escapeHtml(batchLabel)}</div>` : ''}
          <ul class="order-items">
            ${batchItems.map((i) => `
              <li class="order-item">
                <span>${escapeHtml(i.name)}${i.option ? `<span class="order-item-option"> · ${escapeHtml(i.option)}</span>` : ''} × ${i.qty}</span>
                <span>${formatMoney(i.price * i.qty)}</span>
              </li>`).join('')}
          </ul>
          ${batches.length > 1 ? `<div class="batch-subtotal">รอบนี้: ${formatMoney(batchTotal)}</div>` : ''}
        </div>`;
    }).join('');

    const slotNum = String(order.table).replace('takeaway','');

    return `
      <article class="order-card order-card--${statusCls} order-card--takeaway" data-key="${order.firebaseKey}">
        <div class="order-card-header">
          <div class="order-card-header-row">
            <h3 class="order-card-title">
              ออเดอร์ #${escapeHtml(String(order.orderNumber))}
              <span class="order-table-chip order-table-chip--takeaway">📦 กลับบ้าน (ลิงก์ ${escapeHtml(slotNum)})</span>
              ${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}
            </h3>
            <span class="status-badge ${statusCls}">${statusLabel}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(order.date)}</span>
            <div class="order-actions">
              ${actionBtns}
              <button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button>
              <button type="button" class="btn-delete" data-key="${order.firebaseKey}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button>
            </div>
          </div>
        </div>
        <div class="order-card-body">
          ${batchesHtml}
          <div class="order-total-row">
            <span>รวมทั้งหมด</span>
            <span>${formatMoney(order.total)}</span>
          </div>
        </div>
      </article>`;
  }).join('');

  taList.querySelectorAll('.btn-cooking').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsCooking(btn.dataset.key));
  });
  taList.querySelectorAll('.btn-served').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsServed(btn.dataset.key));
  });
  taList.querySelectorAll('.btn-paid').forEach((btn) => {
    btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key));
  });
  taList.querySelectorAll('.btn-add-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => o.firebaseKey === btn.dataset.key);
      if (order) openAddItemModal(btn.dataset.key, order);
    });
  });
  taList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num));
  });
}

// ==================== Auth Events ====================
function checkAuth() {
  if (isLoggedIn()) {
    showScreen(dashboardScreen);
    startRealtimeListener();
    startCallStaffListener();
    switchTab('recent');
  } else {
    showScreen(loginScreen);
  }
}

loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';

  if (isLockedOut()) {
    const remaining = Math.ceil((getLockoutUntil() - Date.now()) / 60000);
    loginError.textContent = `พยายามเข้าระบบมากเกินไป กรุณารอ ${remaining} นาที`;
    return;
  }

  const user = usernameInput.value.trim();
  const pass = passwordInput.value;

  if (!user || !pass) {
    loginError.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    return;
  }

  loginBtn.disabled    = true;
  loginBtn.textContent = 'กำลังตรวจสอบ...';

  try {
    const hash = await hashPassword(pass);
    if (user === ADMIN_USER && hash === ADMIN_PASS_HASH) {
      resetAttempts();
      setLoggedIn(true);
      unlockIOSSpeech(); // iOS: unlock speech ด้วย gesture ตอน login
      showScreen(dashboardScreen);
      startRealtimeListener();
      startCallStaffListener();
      switchTab('recent');
    } else {
      const attempts = incrementAttempts();
      const left     = LOGIN_MAX_ATTEMPTS - attempts;
      if (left > 0) {
        loginError.textContent = `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือ ${left} ครั้ง)`;
      } else {
        loginError.textContent = 'ล็อคบัญชีชั่วคราว กรุณารอ 5 นาที';
      }
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch (err) {
    loginError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = 'เข้าสู่ระบบ';
  }
});

[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
});

logoutBtn.addEventListener('click', () => {
  setLoggedIn(false);
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  if (callStaffUnsubscribe) { callStaffUnsubscribe(); callStaffUnsubscribe = null; }
  allOrders = [];
  knownOrderKeys = new Set();
  knownCallKeys  = new Set();
  showScreen(loginScreen);
  usernameInput.value    = '';
  passwordInput.value    = '';
  loginError.textContent = '';
});

document.querySelectorAll('.tab-btn').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ==================== Clear Data Modal ====================
function openClearDataModal() {
  clearDataError.textContent = '';
  clearDataCode.value        = '';
  clearDataModal.setAttribute('aria-hidden', 'false');
  clearDataCode.focus();
}
function closeClearDataModal() {
  clearDataModal.setAttribute('aria-hidden', 'true');
  clearDataCode.value        = '';
  clearDataError.textContent = '';
}

clearDataBtn.addEventListener('click', openClearDataModal);
clearDataCancel.addEventListener('click', closeClearDataModal);
clearDataModal.addEventListener('click', (e) => { if (e.target === clearDataModal) closeClearDataModal(); });

clearDataConfirm.addEventListener('click', async () => {
  clearDataError.textContent = '';
  const code = clearDataCode.value;
  if (!code) { clearDataError.textContent = 'กรุณาใส่รหัส'; clearDataCode.focus(); return; }

  clearDataConfirm.disabled    = true;
  clearDataConfirm.textContent = 'กำลังตรวจสอบ...';

  try {
    const hash = await hashPassword(code);
    if (hash !== ADMIN_PASS_HASH) {
      clearDataError.textContent = 'รหัสไม่ถูกต้อง';
      clearDataCode.value        = '';
      clearDataCode.focus();
      return;
    }
    if (confirm('ยืนยันล้างรายการสั่งซื้อทั้งหมดและรีเซ็ตหมายเลขออเดอร์เป็น 1001?')) {
      await clearAllOrders();
    }
  } finally {
    clearDataConfirm.disabled    = false;
    clearDataConfirm.textContent = 'ล้างข้อมูล';
  }
});

// ==================== Export to Google Sheet ====================
function initDatePicker() {
  const today   = new Date().toISOString().slice(0, 10);
  dateFrom.value = today;
  dateTo.value   = today;
}

document.querySelectorAll('input[name="exportRange"]').forEach(radio => {
  radio.addEventListener('change', () => {
    customDateRange.classList.toggle('hidden', radio.value !== 'custom');
  });
});

function openExportModal() {
  exportStatus.textContent  = '';
  exportStatus.className    = 'export-status';
  exportConfirm.disabled    = false;
  exportConfirm.textContent = '📤 ส่งข้อมูล';
  document.querySelector('input[name="exportRange"][value="today"]').checked = true;
  customDateRange.classList.add('hidden');
  initDatePicker();
  exportModal.setAttribute('aria-hidden', 'false');
}
function closeExportModal() {
  exportModal.setAttribute('aria-hidden', 'true');
  exportStatus.textContent = '';
}
function isInDateRange(isoString, from, to) {
  const key = getDateKey(isoString);
  return key >= from && key <= to;
}
function getFilteredOrders(range) {
  if (range === 'today')  return allOrders.filter(o => isToday(o.date));
  if (range === 'month')  return allOrders.filter(o => isWithinLast30Days(o.date));
  if (range === 'custom') {
    const from = dateFrom.value, to = dateTo.value;
    if (!from || !to) return [];
    return allOrders.filter(o => isInDateRange(o.date, from, to));
  }
  return allOrders;
}
function buildSummary(orders) {
  const byDay = {};
  orders.filter(o => o.status === 'paid').forEach(o => {
    const key = getDateKey(o.date);
    if (!byDay[key]) byDay[key] = { date: key, orderCount: 0, total: 0 };
    byDay[key].orderCount++;
    byDay[key].total += o.total;
  });
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}

exportSheetBtn.addEventListener('click', openExportModal);
exportCancel.addEventListener('click', closeExportModal);
exportModal.addEventListener('click', (e) => { if (e.target === exportModal) closeExportModal(); });

exportConfirm.addEventListener('click', async () => {
  const range = document.querySelector('input[name="exportRange"]:checked').value;

  if (range === 'custom') {
    if (!dateFrom.value || !dateTo.value) {
      exportStatus.textContent = '⚠️ กรุณาเลือกวันที่ให้ครบ';
      exportStatus.className   = 'export-status error';
      return;
    }
    if (dateFrom.value > dateTo.value) {
      exportStatus.textContent = '⚠️ วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด';
      exportStatus.className   = 'export-status error';
      return;
    }
  }

  const orders = getFilteredOrders(range);
  if (orders.length === 0) {
    exportStatus.textContent = '⚠️ ไม่มีข้อมูลในช่วงที่เลือก';
    exportStatus.className   = 'export-status error';
    return;
  }

  exportConfirm.disabled    = true;
  exportConfirm.textContent = 'กำลังส่ง...';
  exportStatus.textContent  = '';
  exportStatus.className    = 'export-status';

  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ orders, summary: buildSummary(orders) }),
    });
    const text = await res.text();
    const result = JSON.parse(text);
    if (result.success) {
      exportStatus.textContent  = `✅ ส่งสำเร็จ! ${result.inserted} ออเดอร์ (ข้ามซ้ำ ${result.skipped} รายการ)`;
      exportStatus.className    = 'export-status success';
      exportConfirm.textContent = '✅ สำเร็จ';
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (err) {
    exportStatus.textContent  = '❌ เกิดข้อผิดพลาด: ' + err.message;
    exportStatus.className    = 'export-status error';
    exportConfirm.disabled    = false;
    exportConfirm.textContent = '📤 ส่งข้อมูล';
  }
});

// ==================== Sound Toggle ====================
const soundToggleBtn = document.getElementById('soundToggleBtn');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    unlockIOSSpeech(); // iOS: unlock speech ด้วย user gesture
    soundEnabled = !soundEnabled;
    if (!soundEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    soundToggleBtn.textContent = soundEnabled ? '🔔 เสียงเปิด' : '🔕 เสียงปิด';
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
    // ทดสอบเสียงทันทีหลังเปิด (เพื่อให้ iOS unlock สำเร็จ)
    if (soundEnabled) speak('เสียงเปิดแล้วจ้า');
  });
}

// ==================== Inject batch CSS ====================
(function injectBatchStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .batch-group { margin-bottom: 0.5rem; }
    .batch-label {
      font-size: 0.78rem; font-weight: 700;
      color: var(--accent, #c8853a);
      margin-bottom: 0.25rem;
      padding: 0.2rem 0.5rem;
      background: #fff8e1;
      border-radius: 4px;
      display: inline-block;
    }
    .batch-subtotal {
      text-align: right; font-size: 0.78rem;
      color: var(--brown-light, #8b6655);
      padding: 0.15rem 0 0.35rem;
      border-bottom: 1px dashed var(--cream-dark, #e2d8cb);
      margin-bottom: 0.25rem;
    }
    .order-batch-chip {
      background: #fff3cd; color: #856404;
      font-size: 0.72rem; font-weight: 700;
      padding: 0.1rem 0.5rem; border-radius: 999px;
      margin-left: 0.35rem;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
})();

// ==================== Init ====================
checkAuth();
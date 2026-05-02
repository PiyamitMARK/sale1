/**
 * ข้าวซอย 90 — Admin
 * Firebase Realtime Database
 *
 * ระบบใหม่ batch:
 *   - order มี batches: [ [...items], [...items], ... ]
 *   - แต่ละ batch = การสั่งแต่ละรอบ
 *   - จ่ายแล้ว → ลบ tableOrders/{table} เพื่อให้โต๊ะนั้นได้ order number ใหม่
 */

import './darkmode.js';
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
let tableFilter = '';   // ── Feature #4: กรองตามโต๊ะ ──

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

// ---- iOS Audio unlock ----
let iosUnlocked = false;
function unlockIOSSpeech() {
  const ctx = getAudioCtx();

  // iOS: ต้องเล่น silent buffer จริงๆ ใน gesture context ถึงจะ unlock AudioContext ได้
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      const buf    = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.start(0);
    } catch(e) {}
  }

  if (iosUnlocked || !window.speechSynthesis) return;
  try {
    const utter  = new SpeechSynthesisUtterance('\u200B');
    utter.volume = 0.01;
    utter.rate   = 2;
    window.speechSynthesis.speak(utter);
    iosUnlocked  = true;
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

// 'tts' = เสียงคนพูด (+ beep นำ), 'beep' = เสียง effect อย่างเดียว
let soundMode = localStorage.getItem('soundMode') || 'tts';

function playOrderAlert() {
  if (soundMode === 'beep') { playBeep([880, 1047, 1319], 0.18); }
  else { speak(TTS_ORDER_TEXT, { beep: [880, 1047] }); }
}
function playBatchAlert() {
  if (soundMode === 'beep') { playBeep([1047, 1319, 1047], 0.15); }
  else { speak(TTS_BATCH_TEXT, { pitch: 1.2, beep: [1047, 1319] }); }
}
function playCallAlert() {
  if (soundMode === 'beep') { playBeep([660, 784, 880, 784, 660], 0.13); }
  else { speak(TTS_CALL_TEXT, { rate: 0.8, pitch: 0.95, beep: [660, 784, 880] }); }
}


// ==================== Popular Items (Feature #1) ====================
// นับจำนวนออเดอร์ของแต่ละเมนูจาก paid orders ในวันนี้ + 30 วัน
// แล้วเขียนลง Firebase เพื่อให้ customer.js อ่านได้
async function updatePopularItems(orders) {
  try {
    const counts = {};
    orders
      .filter(o => o.status === 'paid')
      .forEach(o => {
        const items = o.batches ? o.batches.flat() : (o.items || []);
        items.forEach(i => {
          counts[i.name] = (counts[i.name] || 0) + i.qty;
        });
      });
    // เอาแค่ Top 5
    const top5 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    await update(ref(db, 'meta'), { popularItems: top5 });
  } catch (_) {}
}

// ==================== Firebase: Real-time Listener ====================
let callStaffUnsubscribe = null;
let knownCallKeys = new Set();

function startCallStaffListener() {
  if (callStaffUnsubscribe) callStaffUnsubscribe();
  knownCallKeys = new Set();

  callStaffUnsubscribe = onValue(ref(db, 'callStaff'), snap => {
    if (!snap.exists()) { knownCallKeys = new Set(); callLogEntries = []; updateCallLogBadge(); return; }
    // rebuild log entries
    callLogEntries = [];
    snap.forEach(child => {
      callLogEntries.push({ tableKey: child.key, ...child.val() });
    });
    updateCallLogBadge();
    // toast เฉพาะ pending ที่ยังไม่เคยเห็น
    snap.forEach(child => {
      const key  = child.key;
      const data = child.val();
      if (!data.done && !knownCallKeys.has(key)) {
        knownCallKeys.add(key);
        showCallStaffToast(data, key);
        playCallAlert();
      }
    });
    if (!document.getElementById('tabCallLog')?.classList.contains('hidden')) renderCallLog();
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
    try {
      await update(ref(db, `callStaff/${tableKey}`), { done: true });
      const entry = callLogEntries.find(e => e.tableKey === tableKey);
      if (entry) entry.done = true;
      updateCallLogBadge();
      if (!document.getElementById('tabCallLog')?.classList.contains('hidden')) renderCallLog();
    } catch(e) {}
    toast.remove();
  });
}


// ==================== Call Log ====================
let callLogEntries = [];

function updateCallLogBadge() {
  const badge = document.getElementById('callLogBadge');
  if (!badge) return;
  const pending = callLogEntries.filter(e => !e.done).length;
  badge.textContent = pending;
  badge.classList.toggle('hidden', pending === 0);
}

function renderCallLog() {
  const list  = document.getElementById('callLogList');
  const empty = document.getElementById('callLogEmpty');
  if (!list) return;
  const todayStr = new Date().toDateString();
  const todayEntries = callLogEntries
    .filter(e => new Date(e.time).toDateString() === todayStr)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  if (todayEntries.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = todayEntries.map(e => {
    const timeStr = new Date(e.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cls   = e.done ? 'call-log-item done' : 'call-log-item pending';
    const badge = e.done
      ? '<span class="call-log-status done">✓ รับทราบแล้ว</span>'
      : '<span class="call-log-status pending">🔔 รอรับทราบ</span>';
    return `
      <div class="${cls}">
        <div class="call-log-item-left">
          <span class="call-log-table">โต๊ะ ${sanitizeNum(e.table)}</span>
          ${e.orderNumber ? `<span class="call-log-order">#${sanitizeNum(e.orderNumber)}</span>` : ''}
        </div>
        <div class="call-log-item-right">
          ${badge}
          <span class="call-log-time">${timeStr}</span>
          ${!e.done ? `<button class="call-log-ack-btn" data-key="${e.tableKey}">✓ รับทราบ</button>` : ''}
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('.call-log-ack-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await update(ref(db, `callStaff/${btn.dataset.key}`), { done: true });
        const entry = callLogEntries.find(e => e.tableKey === btn.dataset.key);
        if (entry) entry.done = true;
        renderCallLog();
        updateCallLogBadge();
      } catch(err) { console.error(err); }
    });
  });
}

document.getElementById('clearCallLogBtn')?.addEventListener('click', async () => {
  if (!confirm('ล้างประวัติการเรียกพนักงานทั้งหมด?')) return;
  try {
    await set(ref(db, 'callStaff'), null);
    callLogEntries = [];
    knownCallKeys  = new Set();
    renderCallLog();
    updateCallLogBadge();
  } catch(err) { console.error(err); }
});

function startRealtimeListener() {
  if (unsubscribeListener) unsubscribeListener();
  // ไม่ reset knownOrderKeys และ isFirstLoad ถ้าเคย load แล้ว
  // เพื่อให้ยังได้เสียงแจ้งเตือนออเดอร์ที่เข้ามาขณะ reconnect
  const isReconnect = knownOrderKeys.size > 0;
  if (!isReconnect) {
    knownOrderKeys = new Set();
    isFirstLoad    = true;
  }

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
        } else if (knownOrderKeys.has(o.firebaseKey) && o.lastBatchDate) {
          // batch ใหม่ถูกเพิ่มเข้า order เดิม — ตรวจด้วย batch count เปรียบเทียบ
          // ไม่สนใจ status เพราะ status อาจถูก reset หลัง admin รับออเดอร์แล้ว
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

    updatePopularItems(newOrders); // ── Feature #1: อัปเดต popular stats ──
    renderDailySummary();
    renderOrders();
    renderHistory();
    renderTakeawayOrders();
  });
}

function showOrderToast(order) {
  document.querySelectorAll('.new-order-toast:not(.call-staff-toast)').forEach(t => t.remove());
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
// *** ต้องตรงกับ products ใน app.js เสมอ ***
const ALL_PRODUCTS = [
  // เซ็ตอาหาร
  { id: 'setkao13', name: 'เซ็ตอิ่มคุ้มคู่❗',            price: 129, category: 'setkao' },
  { id: 'setkao1',  name: 'ข้าวซอยน่องไก่ + โค๊ก',        price: 85,  category: 'setkao' },
  { id: 'setkao2',  name: 'ข้าวซอยน่องไก่ + ชาไทย',       price: 110, category: 'setkao' },
  { id: 'setkao3',  name: 'ข้าวซอยน่องไก่ + มะพร้าวปั่น', price: 115, category: 'setkao' },
  { id: 'setkao4',  name: 'ข้าวซอยหมูทอด + โค๊ก',         price: 85,  category: 'setkao' },
  { id: 'setkao5',  name: 'ข้าวซอยหมูทอด + ชาไทย',        price: 110, category: 'setkao' },
  { id: 'setkao6',  name: 'ข้าวซอยหมูทอด + มะพร้าวปั่น',  price: 115, category: 'setkao' },
  { id: 'setkao7',  name: 'น้ำเงี้ยว + โค๊ก',             price: 75,  category: 'setkao' },
  { id: 'setkao8',  name: 'น้ำเงี้ยว + ชาไทย',            price: 100, category: 'setkao' },
  { id: 'setkao9',  name: 'น้ำเงี้ยว + มะพร้าวปั่น',      price: 105, category: 'setkao' },
  { id: 'setkao10', name: 'ข้าวหมูทอด + โค๊ก',            price: 65,  category: 'setkao' },
  { id: 'setkao11', name: 'ข้าวหมูทอด + ชาไทย',           price: 90,  category: 'setkao' },
  { id: 'setkao12', name: 'ข้าวหมูทอด + มะพร้าวปั่น',     price: 95,  category: 'setkao' },
  // อาหาร
  { id: 'kao1', name: 'ข้าวซอยน่องไก่', price: 70, category: 'kao' },
  { id: 'kao2', name: 'ข้าวซอยหมูทอด', price: 70, category: 'kao' },
  { id: 'kao3', name: 'น้ำเงี้ยว',      price: 60, category: 'kao' },
  { id: 'kao4', name: 'ข้าวหมูทอด',    price: 50, category: 'kao' },
  { id: 'kao5', name: 'แคบหมู',         price: 15, category: 'kao' },
  { id: 'kao7', name: 'ลาบเหนือ',       price: 60, category: 'kao' },
  { id: 'kao8', name: 'ข้าวเหนียว',     price: 10, category: 'kao' },
  { id: 'kao9', name: 'ข้าวสวย',        price: 10, category: 'kao' },
  { id: 'kao6', name: 'ไข่ต้ม',         price: 10, category: 'kao' },
  // เครื่องดื่ม
  { id: 'nam1',  name: 'น้ำเปล่า',      price: 10, category: 'nam' },
  { id: 'nam2',  name: 'โค๊ก',          price: 15, category: 'nam' },
  { id: 'nam3',  name: 'สไปร์ท',        price: 15, category: 'nam' },
  { id: 'nam4',  name: 'มะพร้าวปั่น',   price: 45, category: 'nam' },
  { id: 'nam5',  name: 'ชาไทย',         price: 40, category: 'nam' },
  { id: 'nam6',  name: 'ชาดำเย็น',      price: 40, category: 'nam' },
  { id: 'nam7',  name: 'ชามะนาว',       price: 40, category: 'nam' },
  { id: 'nam8',  name: 'นมชมพู',        price: 40, category: 'nam' },
  { id: 'nam9',  name: 'โกโก้',         price: 40, category: 'nam' },
  { id: 'nam10', name: 'มัทฉะมะพร้าว',  price: 60, category: 'nam' },
  { id: 'nam11', name: 'มัทฉะลาเต้',    price: 60, category: 'nam' },
  { id: 'nam12', name: 'เพียวมัทฉะ',    price: 55, category: 'nam' },
  // กาแฟ
  { id: 'coffee1', name: 'เอสเปรสโซ่',        price: 55, category: 'coffee' },
  { id: 'coffee2', name: 'คาปูชิโน่',          price: 55, category: 'coffee' },
  { id: 'coffee3', name: 'ลาเต้',              price: 55, category: 'coffee' },
  { id: 'coffee4', name: 'มอคค่า',             price: 55, category: 'coffee' },
  { id: 'coffee5', name: 'อเมริกาโน่',          price: 45, category: 'coffee' },
  { id: 'coffee6', name: 'อเมริกาโน่มะพร้าว',  price: 60, category: 'coffee' },
  { id: 'coffee7', name: 'อเมริกาโน่น้ำผึ้ง',  price: 60, category: 'coffee' },
  { id: 'coffee8', name: 'อเมริกาโน่ส้ม',      price: 60, category: 'coffee' },
  // โซดา
  { id: 'soda1', name: 'แดงมะนาวโซดา',      price: 35, category: 'soda' },
  { id: 'soda2', name: 'บลูฮาวายมะนาวโซดา', price: 35, category: 'soda' },
  { id: 'soda3', name: 'แอปเปิ้ลโซดา',      price: 35, category: 'soda' },
  { id: 'soda4', name: 'ส้มโซดา',           price: 35, category: 'soda' },
  { id: 'soda5', name: 'สตรอเบอร์รี่โซดา',  price: 35, category: 'soda' },
  { id: 'soda6', name: 'บลูเบอร์รี่โซดา',   price: 35, category: 'soda' },
];

const ADD_ITEM_CATEGORIES = [
  { id: 'all',    label: '🍽 ทั้งหมด' },
  { id: 'setkao', label: '🍱 เซ็ตอาหาร' },
  { id: 'kao',    label: '🍜 อาหาร' },
  { id: 'nam',    label: '🥤 เครื่องดื่ม' },
  { id: 'coffee', label: '☕ กาแฟ' },
  { id: 'soda',   label: '🫧 โซดา' },
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
  const paidToday    = allOrders.filter((o) => o.status === 'paid' && isToday(o.date));
  const pendingCount = allOrders.filter((o) => o.status === 'pending').length;
  const cookingCount = allOrders.filter((o) => o.status === 'cooking').length;

  todayOrderCount.textContent = paidToday.length;
  todayTotal.textContent      = formatMoney(paidToday.reduce((sum, o) => sum + o.total, 0));

  // ── Feature #5: Live status chips ──
  let liveChips = document.getElementById('liveSummaryChips');
  if (!liveChips) {
    liveChips = document.createElement('div');
    liveChips.id = 'liveSummaryChips';
    liveChips.className = 'live-summary-chips';
    const summarySection = document.querySelector('.summary-section');
    if (summarySection) summarySection.insertAdjacentElement('afterend', liveChips);
  }
  const chips = [];
  if (pendingCount > 0) chips.push(`<span class="live-chip live-chip--pending">🔔 รอรับ ${pendingCount} รายการ</span>`);
  if (cookingCount > 0) chips.push(`<span class="live-chip live-chip--cooking">👨‍🍳 กำลังทำ ${cookingCount} รายการ</span>`);
  if (chips.length === 0) chips.push(`<span class="live-chip live-chip--ok">✅ ไม่มีออเดอร์ค้าง</span>`);
  liveChips.innerHTML = chips.join('');
}

// ==================== Render Orders (with batch display) ====================
const TAKEAWAY_IDS_ADMIN = ['takeaway1','takeaway2','takeaway3'];

function renderOrders() {
  // ── Feature #4: inject filter bar (ครั้งแรก) ──
  if (!document.getElementById('tableFilterBar')) {
    const bar = document.createElement('div');
    bar.id = 'tableFilterBar';
    bar.className = 'table-filter-bar';
    bar.innerHTML = `
      <input type="search" class="table-filter-input" id="tableFilterInput"
        placeholder="🔍 กรองโต๊ะ... (เช่น 3)" maxlength="20" autocomplete="off">
      <button type="button" class="btn btn-outline table-filter-clear hidden" id="tableFilterClear">✕ ล้าง</button>`;
    const tabRecent = document.getElementById('tabRecent');
    if (tabRecent) tabRecent.prepend(bar);

    document.getElementById('tableFilterInput').addEventListener('input', (e) => {
      tableFilter = e.target.value.trim();
      document.getElementById('tableFilterClear').classList.toggle('hidden', !tableFilter);
      renderOrders();
    });
    document.getElementById('tableFilterClear').addEventListener('click', () => {
      tableFilter = '';
      document.getElementById('tableFilterInput').value = '';
      document.getElementById('tableFilterClear').classList.add('hidden');
      renderOrders();
    });
  }

  const baseOrders = allOrders.filter(o => !TAKEAWAY_IDS_ADMIN.includes(String(o.table)) && !o.takeaway);
  const nonTaOrders = tableFilter
    ? baseOrders.filter(o => String(o.table).includes(tableFilter))
    : baseOrders;

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
              ${order.paymentMethod ? `<span class="order-payment-badge">${{ cash:'💵 เงินสด', qr:'📱 QR', credit:'💳 บัตร', transfer:'🏦 โอน' }[order.paymentMethod] || order.paymentMethod}</span>` : ''}
            </h3>
            <span class="status-badge ${statusCls}">${statusLabel}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(order.date)}</span>
            <div class="order-actions">
              ${actionBtns}
              <button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button>
              <button type="button" class="btn-print-receipt" data-key="${order.firebaseKey}">🖨 ปริ้น</button>
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
  ordersList.querySelectorAll('.btn-print-receipt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => o.firebaseKey === btn.dataset.key);
      if (order) printOrderReceipt(order);
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
const tabCallLog  = document.getElementById('tabCallLog');

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  tabRecent.classList.toggle('hidden',    tabId !== 'recent');
  tabHistory.classList.toggle('hidden',   tabId !== 'history');
  tabTakeaway.classList.toggle('hidden',  tabId !== 'takeaway');
  tabCallLog.classList.toggle('hidden',   tabId !== 'calllog');
  if (tabId === 'takeaway') renderTakeawayQrPanel();
  if (tabId === 'calllog')  renderCallLog();
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
  const safeUrl = JSON.stringify(url); // ป้องกัน quote injection ใน inline script
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
    <script>new QRCode(document.getElementById('qr'),{text:${safeUrl},width:170,height:170,colorDark:'#3d2b1f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});setTimeout(()=>window.print(),800);<\/script>
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

    const slotNum = String(order.table).replace('takeaway', '') || '-';

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
  const paid = allOrders.filter(o => o.status === 'paid');
  if (range === 'today')  return paid.filter(o => isToday(o.date));
  if (range === 'month')  return paid.filter(o => isWithinLast30Days(o.date));
  if (range === 'custom') {
    const from = dateFrom.value, to = dateTo.value;
    if (!from || !to) return [];
    return paid.filter(o => isInDateRange(o.date, from, to));
  }
  return paid;
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
    let result;
    try { result = JSON.parse(text); }
    catch { throw new Error('Server ตอบกลับผิดรูปแบบ กรุณาตรวจสอบ Google Apps Script'); }
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

// ==================== Sound Toggle + Mode ====================
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundControl   = document.getElementById('soundControl');
const soundModeTabs  = document.querySelectorAll('.sound-mode-tab');

// ตั้งค่า mode tabs ตาม localStorage
function applySoundMode(mode) {
  soundMode = mode;
  localStorage.setItem('soundMode', mode);
  soundModeTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
}
applySoundMode(soundMode);

if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    unlockIOSSpeech(); // iOS: unlock ด้วย user gesture
    soundEnabled = !soundEnabled;
    if (!soundEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    soundToggleBtn.textContent = soundEnabled ? '🔔 เสียงเปิด' : '🔕 เสียงปิด';
    soundControl?.classList.toggle('muted', !soundEnabled);
    // ทดสอบเสียงทันทีหลังเปิด (เพื่อให้ iOS unlock สำเร็จ)
    if (soundEnabled) {
      if (soundMode === 'beep') playBeep([880, 1047], 0.18);
      else speak('เสียงเปิดแล้วจ้า');
    }
  });
}

soundModeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    unlockIOSSpeech();
    const mode = tab.dataset.mode;
    applySoundMode(mode);
    // ทดสอบเสียงให้ฟังทันที
    if (soundEnabled) {
      if (mode === 'beep') playBeep([880, 1047, 1319], 0.18);
      else speak('เสียงคนพูดจ้า');
    }
  });
});

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
// ==================== Print Receipt (admin) ====================
/**
 * เปิดหน้าต่างใหม่ พิมพ์ใบเสร็จ 58mm พร้อม QR ธนาคาร
 * วางไฟล์ qr-bank.png ในโฟลเดอร์เดียวกับ admin.html
 */
function printOrderReceipt(order) {
  const batches  = order.batches || [order.items || []];
  const dateStr  = new Date(order.date).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHtml = batches.map((batchItems, bIdx) => {
    const rows = batchItems.map(i => {
      const name     = escapeHtml(i.name) + (i.option ? ` (${escapeHtml(i.option)})` : '');
      const subtotal = (i.price * i.qty).toFixed(2);
      return `<tr>
        <td class="col-name">${name} ×${i.qty}</td>
        <td class="col-price">&#3647;${subtotal}</td>
      </tr>`;
    }).join('');
    const batchLabel = batches.length > 1
      ? `<tr><td colspan="2" class="batch-sep">— รอบที่ ${bIdx + 1} —</td></tr>`
      : '';
    return batchLabel + rows;
  }).join('');

  const totalStr = Number(order.total).toFixed(2);
  const qrSrc    = new URL('qr-bank.png', location.href).href;

  const win = window.open('', '_blank', 'width=340,height=720');
  if (!win) { alert('กรุณาอนุญาต Pop-up ใน Browser ก่อนนะครับ'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>ใบเสร็จ #${escapeHtml(String(order.orderNumber))}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page {
    size: 58mm auto;
    margin: 1mm 4mm 1mm 3mm;
  }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html{
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body{
    /* Courier New — bitmap monospace คมที่สุดบน thermal */
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    font-weight: normal;
    color: #000 !important;
    background: #fff;
    width: 51mm;
    /* ปิด anti-aliasing ทุกรูปแบบ */
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: unset;
    font-smooth: never;
    /* render เส้นให้คมที่สุด */
    text-rendering: optimizeSpeed;
    /* บังคับ black เต็ม 100% */
    -webkit-text-stroke: 0px;
  }
  /* บังคับทุก element ให้สี #000 จริง ไม่ใช่ gray */
  *, *::before, *::after {
    color: #000 !important;
    border-color: #000 !important;
  }
  .r-header{ text-align:center; margin-bottom:3pt; }
  .r-shop{ font-size:11.5pt; font-weight:bold; margin-bottom:1pt; }
  .r-sub{ font-size:8pt; }
  hr.r-div{
    border:none;
    /* ใช้ border-top สีดำแท้ ไม่ใช่ gray */
    border-top: 1px solid #000 !important;
    margin:3pt 0;
  }
  .r-meta{ font-size:8.5pt; }
  .r-meta-row{ display:flex; justify-content:space-between; padding:1pt 0; }
  table{ width:100%; border-collapse:collapse; font-size:8.5pt; }
  .col-name{ width:65%; padding:1.5pt 0; vertical-align:top; word-break:break-word; }
  .col-price{ width:35%; text-align:right; padding:1.5pt 0; vertical-align:top; white-space:nowrap; }
  .batch-sep{ text-align:center; font-size:7.5pt; padding:2pt 0 1pt; }
  .r-total{
    display:flex; justify-content:space-between;
    font-size:11pt; font-weight:bold;
    margin:3pt 0 2pt; padding-top:3pt;
    border-top: 1.5px solid #000 !important;
  }
  .r-qr-section{ text-align:center; margin:5pt 0 2pt; }
  .r-qr-label{ font-size:8.5pt; font-weight:bold; margin-bottom:3pt; }
  .r-qr-img{
    /* QR: render แบบ pixel-perfect ห้าม browser blur เด็ดขาด */
    width:40mm; height:40mm;
    object-fit:contain;
    display:block; margin:0 auto;
    image-rendering: pixelated !important;
    image-rendering: -moz-crisp-edges !important;
    image-rendering: crisp-edges !important;
    /* ป้องกัน Edge ลด opacity */
    opacity: 1 !important;
    filter: none !important;
    /* scale up จาก source ให้ชัด ถ้า source QR เล็กกว่า 40mm */
    transform: translateZ(0);
  }
  .r-qr-hint{ font-size:8pt; margin-top:3pt; }
  .r-footer{ text-align:center; font-size:8pt; margin-top:3pt; }
  .no-print{ display:flex; justify-content:center; gap:8px; margin-top:12pt; }
  .no-print button{
    font-family:'Sarabun',sans-serif; font-size:10pt;
    padding:6px 18px; border-radius:6px; cursor:pointer;
    border:1.5px solid #333 !important; background:#fff; color:#000 !important;
  }
  .no-print .btn-doit{ background:#3d2b1f !important; color:#fff !important; border-color:#3d2b1f !important; }
  @media print{ .no-print{ display:none !important; } }
</style>
</head><body>

<div class="r-header">
  <div class="r-shop">&#127835; ข้าวซอย 90</div>
  <div class="r-sub">ใบเสร็จรับเงิน</div>
</div>

<hr class="r-div">

<div class="r-meta">
  <div class="r-meta-row"><span class="r-meta-label">ออเดอร์</span><span><strong>#${escapeHtml(String(order.orderNumber))}</strong></span></div>
  <div class="r-meta-row"><span class="r-meta-label">โต๊ะ</span><span>${escapeHtml(String(order.table || '-'))}</span></div>
  <div class="r-meta-row"><span class="r-meta-label">วันที่</span><span>${escapeHtml(dateStr)}</span></div>
</div>

<hr class="r-div">

<table><tbody>${itemsHtml}</tbody></table>

<hr class="r-div">

<div class="r-total">
  <span>รวมทั้งหมด</span>
  <span>&#3647;${totalStr}</span>
</div>

<div class="r-qr-section">
  <div class="r-qr-label">&#128179; สแกนจ่าย K Bank</div>
  <img class="r-qr-img" src="${qrSrc}" alt="QR ธนาคาร"
    onerror="this.outerHTML='<div style=\\'font-size:8pt;color:#c00;margin:4pt 0;text-align:center\\'>&#9888; ไม่พบไฟล์ qr-bank.png</div>'">
  <div class="r-qr-hint">ขอบคุณที่ใช้บริการ &#128591;</div>
</div>

<hr class="r-div">

<div class="r-footer">ข้าวซอย 90</div>

<div class="no-print">
  <button class="btn-doit" onclick="window.print()">&#128424; พิมพ์</button>
  <button onclick="window.close()">&#10005; ปิด</button>
</div>
</body></html>`);
  win.document.close();
}
// ==================== Inject CSS (new features) ====================
(function injectNewFeatureStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Feature #5: Live status chips ── */
    .live-summary-chips {
      display: flex; gap: 0.5rem; flex-wrap: wrap;
      padding: 0.5rem 1.5rem 0;
    }
    .live-chip {
      font-family: 'Mitr', sans-serif; font-size: 0.8rem; font-weight: 600;
      padding: 0.3rem 0.85rem; border-radius: 999px;
    }
    .live-chip--pending { background: #fff3cd; color: #856404; }
    .live-chip--cooking { background: #fff0e6; color: #c8853a; }
    .live-chip--ok      { background: #d1fae5; color: #065f46; }

    /* ── Feature #4: Table filter bar ── */
    .table-filter-bar {
      display: flex; gap: 0.5rem; align-items: center;
      padding: 0.6rem 0 0.75rem; flex-wrap: wrap;
    }
    .table-filter-input {
      border: 2px solid #e2d8cb; border-radius: 999px;
      padding: 0.4rem 0.9rem; font-family: 'Sarabun', sans-serif;
      font-size: 0.9rem; color: #3d2b1f; outline: none;
      transition: border-color 0.2s; width: 200px;
    }
    .table-filter-input:focus { border-color: #c8853a; }
    .table-filter-clear { font-size: 0.82rem !important; }
    .table-filter-clear.hidden { display: none !important; }
  `;
  document.head.appendChild(style);
})();
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
  getDatabase, ref, update, remove, onValue, get, set
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import {
  subscribeAllMenuAdmin, saveMenuItem, toggleMenuItem, deleteMenuItem, generateMenuId,
  CATEGORY_LABELS, PRODUCT_TYPES, DEFAULT_MENU,
  initMenuFormHelper, openMenuAddModal, openMenuEditModal,
  enableMenuDragSort, duplicateMenuItem, updateSortOrders,
} from './menu-manager.js';

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
const db      = getDatabase(firebaseApp);
const storage = getStorage(firebaseApp);
const auth    = getAuth(firebaseApp);

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
const tabTakeaway      = document.getElementById('tabTakeaway');
const tabCallLog       = document.getElementById('tabCallLog');
const tabMenu          = document.getElementById('tabMenu');
const clearDataBtn     = document.getElementById('clearDataBtn');
const clearDataModal   = document.getElementById('clearDataModal');
const clearDataCode    = document.getElementById('clearDataCode');
const clearDataError   = document.getElementById('clearDataError');
const clearDataCancel  = document.getElementById('clearDataCancel');
const clearDataConfirm = document.getElementById('clearDataConfirm');

// ==================== State ====================
let allOrders = [];
let unsubscribeListener = null;
let tableFilter = '';

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

function getAllItems(order) {
  if (order.batches) {
    return order.batches.flat();
  }
  return order.items || [];
}

// ==================== Sound Alert ====================
let soundEnabled = true;
let knownOrderKeys = new Set();
let isFirstLoad = true;

const TTS_ORDER_TEXT  = 'มีออเดอร์ใหม่จ้า';
const TTS_BATCH_TEXT  = 'ลูกค้าสั่งเพิ่มจ้า';
const TTS_CALL_TEXT   = 'ลูกค้าเรียกพนักงานจ้า';

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

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

let iosUnlocked = false;
function unlockIOSSpeech() {
  const ctx = getAudioCtx();
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
    const utter  = new SpeechSynthesisUtterance('​');
    utter.volume = 0.01;
    utter.rate   = 2;
    window.speechSynthesis.speak(utter);
    iosUnlocked  = true;
  } catch(e) {}
}

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

function speak(text, opts = {}) {
  if (!soundEnabled) return;
  if (opts.beep !== false) playBeep(opts.beep || [880, 1047], 0.15);
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utter    = new SpeechSynthesisUtterance(text);
    utter.lang     = 'th-TH';
    utter.rate     = opts.rate   ?? 0.85;
    utter.pitch    = opts.pitch  ?? 1.1;
    utter.volume   = opts.volume ?? 1.0;
    const voices  = window.speechSynthesis.getVoices();
    const thVoice = voices.find(v => v.lang === 'th-TH' || v.lang.startsWith('th'));
    if (thVoice) utter.voice = thVoice;
    _startTTSWatchdog(utter);
    setTimeout(() => {
      try { window.speechSynthesis.speak(utter); } catch(e) {}
    }, 120);
  } catch (e) { console.warn('TTS error:', e); }
}

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
}

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

// ==================== Popular Items ====================
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
    callLogEntries = [];
    snap.forEach(child => {
      callLogEntries.push({ tableKey: child.key, ...child.val() });
    });
    updateCallLogBadge();
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

    updatePopularItems(newOrders);
    renderDailySummary();
    renderOrders();
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
  await remove(ref(db, 'tableOrders'));
  await update(ref(db, 'meta'), {
    orderNumber: 1001,
    lastOrderDate: new Date().toISOString().slice(0, 10),
  });
  closeClearDataModal();
}

// ==================== Products (admin add-item) ====================
const ADD_ITEM_CATEGORIES = [
  { id: 'all',    label: '🍽 ทั้งหมด' },
  { id: 'setkao', label: '🍱 เซ็ตอาหาร' },
  { id: 'kao',    label: '🍜 อาหาร' },
  { id: 'nam',    label: '🥤 เครื่องดื่ม' },
  { id: 'coffee', label: '☕ กาแฟ' },
  { id: 'soda',   label: '🫧 โซดา' },
];
let addItemActiveCategory = 'all';

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
  const liveProducts = Object.values(allMenuData).filter(p => p.enabled !== false);
  const filtered = addItemActiveCategory === 'all'
    ? liveProducts
    : liveProducts.filter(p => p.category === addItemActiveCategory);

  const tabsHtml = `<div class="add-item-cat-tabs">${ADD_ITEM_CATEGORIES.map(cat =>
    `<button type="button" class="add-item-cat-btn${addItemActiveCategory === cat.id ? ' active' : ''}" data-cat="${cat.id}">${escapeHtml(cat.label)}</button>`
  ).join('')}</div>`;

  const productsHtml = `<div class="add-item-product-grid">${filtered.map(p => {
    const existing = allItems.find(i => i.name === p.name);
    const qty      = existing ? existing.qty : 0;
    return `<button type="button" class="add-item-product-btn" data-id="${p.id}" data-name="${p.name.replace(/"/g,'&quot;')}" data-price="${p.price}">
      <span class="add-item-product-name">${escapeHtml(p.name)}</span>
      <span class="add-item-product-price">${formatMoney(p.price)}</span>
      ${qty > 0 ? `<span class="add-item-qty-badge">${qty}</span>` : ''}
    </button>`;
  }).join('')}</div>`;

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

let addItemTargetKey = null;
let addItemTargetOrder = null;
let addItemToastTimer = null;

function closeAddItemModal() {
  addItemModal.setAttribute('aria-hidden', 'true');
  addItemTargetKey = null;
  addItemTargetOrder = null;
  addItemActiveCategory = 'all';
  if (addItemToastTimer) { clearTimeout(addItemToastTimer); addItemToastTimer = null; }
  const toast = document.getElementById('addItemToastMsg');
  if (toast) { toast.textContent = ''; toast.classList.remove('show'); }
}

async function addItemToOrder({ name, price }) {
  if (!addItemTargetKey || !addItemTargetOrder) return;
  const batches = addItemTargetOrder.batches ? JSON.parse(JSON.stringify(addItemTargetOrder.batches)) : [JSON.parse(JSON.stringify(addItemTargetOrder.items || []))];
  const lastBatch = batches[batches.length - 1] || [];
  const existing  = lastBatch.find(i => i.name === name);
  if (existing) { existing.qty += 1; } else { lastBatch.push({ name, price: parseFloat(price), qty: 1 }); }
  batches[batches.length - 1] = lastBatch;

  const newTotal = batches.flat().reduce((sum, i) => sum + i.price * i.qty, 0);
  addItemTargetOrder.batches = batches;
  addItemTargetOrder.total   = newTotal;

  try {
    await update(ref(db, `orders/${addItemTargetKey}`), { batches, total: newTotal });
  } catch (err) { console.error('addItemToOrder error:', err); return; }

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

  renderBestSellers();
}

// ==================== Best Sellers ====================
function renderBestSellers() {
  const counts = {};
  allOrders.filter(o => o.status === 'paid').forEach(o => {
    const batches = o.batches || [o.items || []];
    batches.flat().forEach(i => {
      if (!i.name) return;
      if (!counts[i.name]) counts[i.name] = { qty: 0, revenue: 0 };
      counts[i.name].qty     += (i.qty || 1);
      counts[i.name].revenue += (i.price || 0) * (i.qty || 1);
    });
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  let section = document.getElementById('bestSellersSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'bestSellersSection';
    section.className = 'best-sellers-section';
    const liveChips = document.getElementById('liveSummaryChips');
    if (liveChips) liveChips.insertAdjacentElement('afterend', section);
  }
  if (sorted.length === 0) { section.innerHTML = ''; return; }

  const maxQty = sorted[0][1].qty || 1;
  section.innerHTML = `
    <div class="best-sellers-header"><span class="best-sellers-title">🏆 เมนูขายดี</span><span class="best-sellers-sub">จากออเดอร์ที่จ่ายแล้วทั้งหมด</span></div>
    <ol class="best-sellers-list">${sorted.map(([name, { qty, revenue }], idx) => `
      <li class="bs-row">
        <span class="bs-rank ${idx === 0 ? 'bs-rank--gold' : idx === 1 ? 'bs-rank--silver' : idx === 2 ? 'bs-rank--bronze' : ''}">${idx + 1}</span>
        <span class="bs-name">${escapeHtml(name)}</span>
        <div class="bs-bar-wrap"><div class="bs-bar" style="width:${Math.round((qty / maxQty) * 100)}%"></div></div>
        <span class="bs-qty">${qty} จาน</span>
        <span class="bs-revenue">${formatMoney(revenue)}</span>
      </li>`).join('')}
    </ol>`;
}

// ==================== Render Orders ====================
const TAKEAWAY_IDS_ADMIN = ['takeaway1','takeaway2','takeaway3'];

function renderOrders() {
  if (!document.getElementById('tableFilterBar')) {
    const bar = document.createElement('div');
    bar.id = 'tableFilterBar';
    bar.className = 'table-filter-bar';
    bar.innerHTML = `<input type="search" class="table-filter-input" id="tableFilterInput" placeholder="🔍 กรองโต๊ะ... (เช่น 3)" maxlength="20" autocomplete="off"><button type="button" class="btn btn-outline table-filter-clear hidden" id="tableFilterClear">✕ ล้าง</button>`;
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
  const nonTaOrders = tableFilter ? baseOrders.filter(o => String(o.table).includes(tableFilter)) : baseOrders;

  if (nonTaOrders.length === 0) {
    ordersList.innerHTML = ''; ordersList.classList.add('hidden'); ordersEmpty.classList.remove('hidden'); return;
  }

  ordersEmpty.classList.add('hidden'); ordersList.classList.remove('hidden');
  const statusMap = { pending: { label: '🔔 ออเดอร์ใหม่', cls: 'pending' }, cooking: { label: '👨‍🍳 กำลังทำ', cls: 'cooking' }, served: { label: '🍽 เสิร์ฟแล้ว', cls: 'served' }, paid: { label: '✅ จ่ายแล้ว', cls: 'paid' } };

  ordersList.innerHTML = nonTaOrders.map((order) => {
    const s = order.status || 'pending';
    const { label: statusLabel, cls: statusCls } = statusMap[s] || statusMap.pending;
    const fromQR = order.source === 'qr';
    let actionBtns = '';
    if (s === 'pending') actionBtns = `<button type="button" class="btn-cooking" data-key="${order.firebaseKey}">👨‍🍳 รับออเดอร์</button>`;
    else if (s === 'cooking') actionBtns = `<button type="button" class="btn-served" data-key="${order.firebaseKey}">🍽 เสิร์ฟแล้ว</button>`;
    else if (s === 'served') actionBtns = `<button type="button" class="btn-paid" data-key="${order.firebaseKey}">✅ จ่ายแล้ว</button>`;

    const batches = order.batches || [order.items || []];
    const batchesHtml = batches.map((batchItems, bIdx) => {
      const batchTotal = batchItems.reduce((s, i) => s + i.price * i.qty, 0);
      const batchLabel = batches.length > 1 ? `รอบที่ ${bIdx + 1}` : 'รายการ';
      return `<div class="batch-group">${batches.length > 1 ? `<div class="batch-label">🍽 ${escapeHtml(batchLabel)}</div>` : ''}<ul class="order-items">${batchItems.map((i) => `<li class="order-item"><span>${escapeHtml(i.name)}${i.option ? `<span class="order-item-option"> · ${escapeHtml(i.option)}</span>` : ''} × ${i.qty}</span><span>${formatMoney(i.price * i.qty)}</span></li>`).join('')}</ul>${batches.length > 1 ? `<div class="batch-subtotal">รอบนี้: ${formatMoney(batchTotal)}</div>` : ''}</div>`;
    }).join('');

    return `<article class="order-card order-card--${statusCls}" data-key="${order.firebaseKey}"><div class="order-card-header"><div class="order-card-header-row"><h3 class="order-card-title">ออเดอร์ #${escapeHtml(String(order.orderNumber))}${order.table ? `<span class="order-table-chip">โต๊ะ ${escapeHtml(String(order.table))}</span>` : ''}${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}${fromQR ? `<span class="order-qr-badge">📱 QR</span>` : ''}${order.paymentMethod ? `<span class="order-payment-badge">${{ cash:'💵 เงินสด', qr:'📱 QR', credit:'💳 บัตร', transfer:'🏦 โอน' }[order.paymentMethod] || order.paymentMethod}</span>` : ''}</h3><span class="status-badge ${statusCls}">${statusLabel}</span></div><div class="order-card-header-row"><span class="order-card-date">${formatDate(order.date)}</span><div class="order-actions">${actionBtns}<button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button><button type="button" class="btn-print-receipt" data-key="${order.firebaseKey}">🖨 ปริ้น</button><button type="button" class="btn-delete" data-key="${order.firebaseKey}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button></div></div></div><div class="order-card-body">${batchesHtml}<div class="order-total-row"><span>รวมทั้งหมด</span><span>${formatMoney(order.total)}</span></div></div></article>`;
  }).join('');

  ordersList.querySelectorAll('.btn-cooking').forEach((btn) => btn.addEventListener('click', () => markOrderAsCooking(btn.dataset.key)));
  ordersList.querySelectorAll('.btn-served').forEach((btn) => btn.addEventListener('click', () => markOrderAsServed(btn.dataset.key)));
  ordersList.querySelectorAll('.btn-paid').forEach((btn) => btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key)));
  ordersList.querySelectorAll('.btn-add-item').forEach((btn) => btn.addEventListener('click', () => { const order = allOrders.find(o => o.firebaseKey === btn.dataset.key); if (order) openAddItemModal(btn.dataset.key, order); }));
  ordersList.querySelectorAll('.btn-print-receipt').forEach((btn) => btn.addEventListener('click', () => { const order = allOrders.find(o => o.firebaseKey === btn.dataset.key); if (order) printOrderReceipt(order); }));
  ordersList.querySelectorAll('.btn-delete').forEach((btn) => btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num)));
}

// ==================== Tabs ====================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
  tabRecent.classList.toggle('hidden', tabId !== 'recent');
  tabTakeaway.classList.toggle('hidden', tabId !== 'takeaway');
  tabCallLog.classList.toggle('hidden', tabId !== 'calllog');
  tabMenu.classList.toggle('hidden', tabId !== 'menu');
  if (tabId === 'takeaway') renderTakeawayQrPanel();
  if (tabId === 'calllog') renderCallLog();
  if (tabId === 'menu') renderMenuTab();
}

// ==================== Takeaway QR Panel ====================
const TAKEAWAY_SLOTS = ['takeaway1','takeaway2','takeaway3'];
const TAKEAWAY_LABELS = { takeaway1: 'ลิงก์ที่ 1', takeaway2: 'ลิงก์ที่ 2', takeaway3: 'ลิงก์ที่ 3' };
const TA_STORAGE_KEY = 'ta-base-url';

function getTakeawayUrl(slotId) { let base = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/'); if (!base.endsWith('/')) base += '/'; return base + 'customer.html?table=' + slotId; }

let qrInstances = {};

function renderTakeawayQrPanel() {
  const container = document.getElementById('takeawayQrSlots');
  if (!container || container.dataset.rendered === '1') return;
  container.dataset.rendered = '1';
  const savedBase = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/');
  container.innerHTML = `<div class="ta-url-row"><label class="ta-url-label">🌐 URL ฐาน (แก้ครั้งเดียวใช้ทุกลิงก์)</label><div class="ta-url-input-row"><input type="text" id="taBaseUrl" class="field-input ta-url-input" value="${escapeHtml(savedBase)}" placeholder="https://yoursite.com/"><button type="button" class="btn btn-primary ta-url-apply-btn" id="taApplyBtn">🔄 อัปเดต QR</button></div></div><div class="ta-slots-grid" id="taSlotsGrid"></div>`;
  renderTaSlots();
  document.getElementById('taApplyBtn').addEventListener('click', () => {
    const val = document.getElementById('taBaseUrl').value.trim();
    if (!val) return;
    localStorage.setItem(TA_STORAGE_KEY, val);
    TAKEAWAY_SLOTS.forEach((slotId) => {
      const url = getTakeawayUrl(slotId);
      const boxEl = document.getElementById(`taQrBox_${slotId}`);
      const urlEl = boxEl?.parentElement?.querySelector('.ta-qr-url');
      const copyBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-copy-btn');
      const printBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-print-btn');
      if (urlEl) urlEl.textContent = url;
      if (copyBtn) copyBtn.dataset.url = url;
      if (boxEl) { boxEl.innerHTML = ''; try { qrInstances[slotId] = new QRCode(boxEl, { text: url, width: 150, height: 150, colorDark: '#3d2b1f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch(e) { boxEl.innerHTML = '<p style="font-size:0.7rem;color:#888">QR Error</p>'; } }
      if (printBtn) { const newPrintBtn = printBtn.cloneNode(true); printBtn.parentNode.replaceChild(newPrintBtn, printBtn); newPrintBtn.addEventListener('click', () => { const freshUrl = getTakeawayUrl(slotId); const idx = newPrintBtn.dataset.idx; _openPrintWindow(freshUrl, idx); }); }
      if (copyBtn) { const newCopyBtn = copyBtn.cloneNode(true); copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn); newCopyBtn.dataset.url = url; newCopyBtn.addEventListener('click', () => _copyUrl(newCopyBtn)); }
    });
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
  }).catch(() => { prompt('คัดลอกลิงก์:', btn.dataset.url); });
}

function _openPrintWindow(url, idx) {
  const win = window.open('', '_blank', 'width=400,height=580');
  const safeUrl = JSON.stringify(url);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Mitr:wght@600;700&display=swap" rel="stylesheet"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}.w{text-align:center;padding:1.5rem;border:2px solid #3d2b1f;border-radius:14px;max-width:260px;}.shop{font-family:'Mitr',sans-serif;font-size:1.1rem;color:#3d2b1f;font-weight:700;margin-bottom:.3rem;}.lbl{font-family:'Mitr',sans-serif;font-size:1.5rem;font-weight:700;color:#1a7a4a;margin:.4rem 0;}.hint{font-size:.82rem;color:#8b6655;margin-top:.4rem;}#qr{border:3px solid #1a7a4a;border-radius:8px;padding:5px;display:inline-block;margin:.6rem 0;}</style></head><body><div class="w"><div class="shop">🍛 ข้าวซอย 90</div><div id="qr"></div><div class="lbl">📦 กลับบ้าน (ลิงก์ ${idx})</div><div class="hint">สแกน QR เพื่อสั่งกลับบ้าน</div></div><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><script>new QRCode(document.getElementById('qr'),{text:${safeUrl},width:170,height:170,colorDark:'#3d2b1f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});setTimeout(()=>window.print(),800);<\/script></body></html>`);
  win.document.close();
}

function renderTaSlots() {
  const grid = document.getElementById('taSlotsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  qrInstances = {};
  TAKEAWAY_SLOTS.forEach((slotId, idx) => {
    const url = getTakeawayUrl(slotId);
    const label = TAKEAWAY_LABELS[slotId];
    const boxId = `taQrBox_${slotId}`;
    const card = document.createElement('div');
    card.className = 'ta-qr-card';
    card.innerHTML = `<div class="ta-qr-card-header">📦 กลับบ้าน — ${escapeHtml(label)}</div><div class="ta-qr-card-body"><div class="ta-qr-box" id="${boxId}"></div><div class="ta-qr-url">${escapeHtml(url)}</div></div><div class="ta-qr-card-footer"><button type="button" class="btn btn-green ta-copy-btn" data-url="${escapeHtml(url)}">📋 คัดลอกลิงก์</button><button type="button" class="btn btn-outline ta-print-btn" data-slot="${slotId}" data-idx="${idx+1}">🖨 พิมพ์</button></div>`;
    grid.appendChild(card);
    try {
      qrInstances[slotId] = new QRCode(document.getElementById(boxId), { text: url, width: 150, height: 150, colorDark: '#3d2b1f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } catch(e) {
      const el = document.getElementById(boxId);
      if (el) el.innerHTML = '<p style="font-size:0.7rem;color:#888">QR Error</p>';
    }
  });
  grid.querySelectorAll('.ta-copy-btn').forEach(btn => btn.addEventListener('click', () => _copyUrl(btn)));
  grid.querySelectorAll('.ta-print-btn').forEach(btn => btn.addEventListener('click', () => { const url = getTakeawayUrl(btn.dataset.slot); _openPrintWindow(url, btn.dataset.idx); }));
}

// ==================== Render Takeaway Orders ====================
function renderTakeawayOrders() {
  const taList = document.getElementById('takeawayOrdersList');
  const taEmpty = document.getElementById('takeawayOrdersEmpty');
  if (!taList || !taEmpty) return;
  const TAKEAWAY_IDS = ['takeaway1','takeaway2','takeaway3'];
  const taOrders = allOrders.filter(o => TAKEAWAY_IDS.includes(String(o.table)) || o.takeaway === true);

  if (taOrders.length === 0) {
    taList.innerHTML = ''; taList.classList.add('hidden'); taEmpty.classList.remove('hidden'); return;
  }
  taEmpty.classList.add('hidden'); taList.classList.remove('hidden');
  const statusMap = { pending: { label: '🔔 ออเดอร์ใหม่', cls: 'pending' }, cooking: { label: '👨‍🍳 กำลังทำ', cls: 'cooking' }, served: { label: '🍽 พร้อมส่ง', cls: 'served' }, paid: { label: '✅ จ่ายแล้ว', cls: 'paid' } };

  taList.innerHTML = taOrders.map((order) => {
    const s = order.status || 'pending';
    const { label: statusLabel, cls: statusCls } = statusMap[s] || statusMap.pending;
    let actionBtns = '';
    if (s === 'pending') actionBtns = `<button type="button" class="btn-cooking" data-key="${order.firebaseKey}">👨‍🍳 รับออเดอร์</button>`;
    else if (s === 'cooking') actionBtns = `<button type="button" class="btn-served" data-key="${order.firebaseKey}">📦 พร้อมส่ง</button>`;
    else if (s === 'served') actionBtns = `<button type="button" class="btn-paid" data-key="${order.firebaseKey}">✅ จ่ายแล้ว</button>`;
    const batches = order.batches || [order.items || []];
    const batchesHtml = batches.map((batchItems, bIdx) => {
      const batchTotal = batchItems.reduce((s, i) => s + i.price * i.qty, 0);
      const batchLabel = batches.length > 1 ? `รอบที่ ${bIdx + 1}` : 'รายการ';
      return `<div class="batch-group">${batches.length > 1 ? `<div class="batch-label">🍽 ${escapeHtml(batchLabel)}</div>` : ''}<ul class="order-items">${batchItems.map((i) => `<li class="order-item"><span>${escapeHtml(i.name)}${i.option ? `<span class="order-item-option"> · ${escapeHtml(i.option)}</span>` : ''} × ${i.qty}</span><span>${formatMoney(i.price * i.qty)}</span></li>`).join('')}</ul>${batches.length > 1 ? `<div class="batch-subtotal">รอบนี้: ${formatMoney(batchTotal)}</div>` : ''}</div>`;
    }).join('');
    const slotNum = String(order.table).replace('takeaway', '') || '-';
    return `<article class="order-card order-card--${statusCls} order-card--takeaway" data-key="${order.firebaseKey}"><div class="order-card-header"><div class="order-card-header-row"><h3 class="order-card-title">ออเดอร์ #${escapeHtml(String(order.orderNumber))}<span class="order-table-chip order-table-chip--takeaway">📦 กลับบ้าน (ลิงก์ ${escapeHtml(slotNum)})</span>${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}</h3><span class="status-badge ${statusCls}">${statusLabel}</span></div><div class="order-card-header-row"><span class="order-card-date">${formatDate(order.date)}</span><div class="order-actions">${actionBtns}<button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button><button type="button" class="btn-delete" data-key="${order.firebaseKey}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button></div></div></div><div class="order-card-body">${batchesHtml}<div class="order-total-row"><span>รวมทั้งหมด</span><span>${formatMoney(order.total)}</span></div></div></article>`;
  }).join('');

  taList.querySelectorAll('.btn-cooking').forEach((btn) => btn.addEventListener('click', () => markOrderAsCooking(btn.dataset.key)));
  taList.querySelectorAll('.btn-served').forEach((btn) => btn.addEventListener('click', () => markOrderAsServed(btn.dataset.key)));
  taList.querySelectorAll('.btn-paid').forEach((btn) => btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key)));
  taList.querySelectorAll('.btn-add-item').forEach((btn) => btn.addEventListener('click', () => { const order = allOrders.find(o => o.firebaseKey === btn.dataset.key); if (order) openAddItemModal(btn.dataset.key, order); }));
  taList.querySelectorAll('.btn-delete').forEach((btn) => btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num)));
}

// ==================== Auth Events ====================
function checkAuth() {
  if (isLoggedIn()) {
    showScreen(dashboardScreen);
    startRealtimeListener();
    startCallStaffListener();
    initMenuTab();
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
  if (!user || !pass) { loginError.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
  loginBtn.disabled = true; loginBtn.textContent = 'กำลังตรวจสอบ...';
  try {
    const hash = await hashPassword(pass);
    if (user === ADMIN_USER && hash === ADMIN_PASS_HASH) {
      resetAttempts(); setLoggedIn(true); unlockIOSSpeech(); showScreen(dashboardScreen);
      startRealtimeListener(); startCallStaffListener(); initMenuTab(); switchTab('recent');
    } else {
      const attempts = incrementAttempts(); const left = LOGIN_MAX_ATTEMPTS - attempts;
      if (left > 0) { loginError.textContent = `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือ ${left} ครั้ง)`; }
      else { loginError.textContent = 'ล็อคบัญชีชั่วคราว กรุณารอ 5 นาที'; }
      passwordInput.value = ''; passwordInput.focus();
    }
  } catch (err) { loginError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่'; }
  finally { loginBtn.disabled = false; loginBtn.textContent = 'เข้าสู่ระบบ'; }
});

[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
});

logoutBtn.addEventListener('click', () => {
  setLoggedIn(false);
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  if (callStaffUnsubscribe) { callStaffUnsubscribe(); callStaffUnsubscribe = null; }
  allOrders = []; knownOrderKeys = new Set(); knownCallKeys = new Set();
  showScreen(loginScreen);
  usernameInput.value = ''; passwordInput.value = ''; loginError.textContent = '';
});

document.querySelectorAll('.tab-btn').forEach((tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}));

// ==================== Clear Data Modal ====================
function openClearDataModal() {
  clearDataError.textContent = '';
  clearDataCode.value = '';
  clearDataModal.setAttribute('aria-hidden', 'false');
  clearDataCode.focus();
}
function closeClearDataModal() {
  clearDataModal.setAttribute('aria-hidden', 'true');
  clearDataCode.value = '';
  clearDataError.textContent = '';
}
clearDataBtn.addEventListener('click', openClearDataModal);
clearDataCancel.addEventListener('click', closeClearDataModal);
clearDataModal.addEventListener('click', (e) => { if (e.target === clearDataModal) closeClearDataModal(); });
clearDataConfirm.addEventListener('click', async () => {
  clearDataError.textContent = '';
  const code = clearDataCode.value;
  if (!code) { clearDataError.textContent = 'กรุณาใส่รหัส'; clearDataCode.focus(); return; }
  clearDataConfirm.disabled = true; clearDataConfirm.textContent = 'กำลังตรวจสอบ...';
  try {
    const hash = await hashPassword(code);
    if (hash !== ADMIN_PASS_HASH) {
      clearDataError.textContent = 'รหัสไม่ถูกต้อง'; clearDataCode.value = ''; clearDataCode.focus(); return;
    }
    if (confirm('ยืนยันล้างรายการสั่งซื้อทั้งหมดและรีเซ็ตหมายเลขออเดอร์เป็น 1001?')) {
      await clearAllOrders();
    }
  } finally {
    clearDataConfirm.disabled = false; clearDataConfirm.textContent = 'ล้างข้อมูล';
  }
});

// ==================== Menu Management ====================
let allMenuData = {};
let menuTabCategory = 'all';
let menuUnsubscribe = null;

function initMenuTab() {
  menuUnsubscribe = subscribeAllMenuAdmin(db, (data) => {
    allMenuData = data || {};
    initMenuFormHelper(db, storage, allMenuData, () => {});
    if (!document.getElementById('tabMenu')?.classList.contains('hidden')) { renderMenuTab(); }
  });
}

function renderMenuTab() {
  const container = document.getElementById('menuTabContent');
  if (!container) return;
  const categories = [
    { id: 'all', label: '🍽 ทั้งหมด' },
    { id: 'setkao', label: '🍱 เซ็ตอาหาร' },
    { id: 'kao', label: '🍜 อาหาร' },
    { id: 'nam', label: '🥤 เครื่องดื่ม' },
    { id: 'coffee', label: '☕ กาแฟ' },
    { id: 'soda', label: '🫧 โซดา' },
  ];
  const items = Object.values(allMenuData).filter(p => menuTabCategory === 'all' || p.category === menuTabCategory).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  container.innerHTML = `
    <div class="menu-mgr-toolbar">
      <div class="menu-mgr-cats">${categories.map(c => `<button type="button" class="menu-cat-btn${menuTabCategory === c.id ? ' active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`).join('')}</div>
      <button type="button" class="btn btn-primary menu-add-btn" id="menuAddBtn">＋ เพิ่มเมนู</button>
    </div>
    <p class="menu-drag-hint">⠿ ลากแถวเพื่อเรียงลำดับเมนูใหม่</p>
    <div class="menu-mgr-table-wrap">
      <table class="menu-mgr-table">
        <thead><tr><th style="width:32px"></th><th>สถานะ</th><th>ชื่อเมนู</th><th>หมวด</th><th>ประเภท</th><th class="th-price">ราคา (฿)</th><th>จัดการ</th></tr></thead>
        <tbody id="menuTableBody">${items.length === 0 ? `<tr><td colspan="7" class="menu-empty">ไม่มีเมนูในหมวดนี้</td></tr>` : items.map(p => renderMenuRow(p)).join('')}</tbody>
      </table>
    </div>`;
  container.querySelectorAll('.menu-cat-btn').forEach(btn => btn.addEventListener('click', () => { menuTabCategory = btn.dataset.cat; renderMenuTab(); }));
  document.getElementById('menuAddBtn')?.addEventListener('click', openMenuAddModal);
  bindMenuTableActions(container);
}

function renderMenuRow(p) {
  const catLabel = CATEGORY_LABELS[p.category] || p.category;
  const typeLabel = (PRODUCT_TYPES.find(t => t.value === p.productType) || {}).label || p.productType;
  const hasPromo = p.promo?.enabled;
  const effectivePrice = hasPromo ? (p.promo.promoPrice ?? p.price) : p.price;
  return `<tr class="menu-row${p.enabled ? '' : ' menu-row--disabled'}" data-id="${escapeHtml(p.id)}" draggable="true">
    <td style="width:32px;text-align:center"><span class="menu-drag-handle" title="ลากเพื่อเรียงลำดับ">⠿</span></td>
    <td><label class="menu-toggle" title="${p.enabled ? 'คลิกเพื่อซ่อน' : 'คลิกเพื่อเปิด'}"><input type="checkbox" class="menu-toggle-input" data-id="${escapeHtml(p.id)}" ${p.enabled ? 'checked' : ''}><span class="menu-toggle-slider"></span></label></td>
    <td><span class="menu-item-name" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</span>${hasPromo ? `<span class="menu-promo-badge">${escapeHtml(p.promo.label || 'โปร')}</span>` : ''}<button type="button" class="menu-inline-edit-btn" data-field="name" data-id="${escapeHtml(p.id)}" title="แก้ชื่อ">✏️</button></td>
    <td><span class="menu-cat-chip menu-cat-chip--${escapeHtml(p.category)}">${escapeHtml(catLabel)}</span></td>
    <td><span class="menu-type-chip">${escapeHtml(typeLabel)}</span></td>
    <td class="td-price">${hasPromo ? `<span class="menu-promo-orig">${p.price}</span><span class="menu-promo-price">${effectivePrice}</span>` : `<span class="menu-price-display" data-id="${escapeHtml(p.id)}">${p.price}</span>`}<button type="button" class="menu-inline-edit-btn" data-field="price" data-id="${escapeHtml(p.id)}" title="แก้ราคา">✏️</button></td>
    <td><div class="menu-action-btns"><button type="button" class="btn-menu-edit" data-id="${escapeHtml(p.id)}">🖊 แก้ไข</button><button type="button" class="btn-menu-dup" data-id="${escapeHtml(p.id)}" title="Duplicate">📋</button><button type="button" class="btn-menu-delete" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">🗑</button></div></td>
  </tr>`;
}

function bindMenuTableActions(container) {
  container.querySelectorAll('.menu-toggle-input').forEach(chk => {
    chk.addEventListener('change', async () => { await toggleMenuItem(db, chk.dataset.id, chk.checked); });
  });
  container.querySelectorAll('.menu-inline-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { field, id } = btn.dataset;
      const p = allMenuData[id];
      if (!p) return;
      const cell = btn.parentElement;
      const span = cell.querySelector(field === 'price' ? '.menu-price-display' : '.menu-item-name');
      if (span) {
        if (field === 'name') startInlineEdit(span, btn, id, 'name', p.name, 'text');
        if (field === 'price') startInlineEdit(span, btn, id, 'price', p.price, 'number');
      }
    });
  });
  container.querySelectorAll('.btn-menu-edit').forEach(btn => {
    btn.addEventListener('click', () => { const p = allMenuData[btn.dataset.id]; if (p) openMenuEditModal(p); });
  });
  container.querySelectorAll('.btn-menu-dup').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = allMenuData[btn.dataset.id];
      if (!p) return;
      btn.disabled = true;
      try { await duplicateMenuItem(db, p); } catch (err) { alert('Duplicate ไม่สำเร็จ: ' + err.message); }
      finally { btn.disabled = false; }
    });
  });
  container.querySelectorAll('.btn-menu-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`ลบเมนู "${btn.dataset.name}" ออก?`)) return;
      await deleteMenuItem(db, btn.dataset.id);
    });
  });
  const tbody = container.querySelector('#menuTableBody');
  if (tbody) {
    enableMenuDragSort(tbody, async (orderedIds) => { await updateSortOrders(db, orderedIds); });
  }
}

function startInlineEdit(cell, btn, id, field, currentVal, inputType) {
  const origText = cell.textContent;
  const input = document.createElement('input');
  input.type = inputType;
  input.value = currentVal;
  input.className = 'menu-inline-input';
  if (inputType === 'number') { input.min = '0'; input.step = '1'; }
  cell.style.display = 'none';
  btn.style.display = 'none';
  cell.insertAdjacentElement('afterend', input);
  const finish = async (save) => {
    if (save) {
      const val = inputType === 'number' ? parseInt(input.value, 10) : input.value.trim();
      if (val === '' || (inputType === 'number' && isNaN(val))) { input.classList.add('menu-inline-input--error'); return; }
      const p = { ...allMenuData[id], [field]: val };
      await saveMenuItem(db, p);
    }
    input.remove();
    cell.style.display = '';
    btn.style.display = '';
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
  input.focus();
  input.select();
}

// ==================== Init ====================
checkAuth();

// ==================== Print Receipt (admin) ====================
function printOrderReceipt(order) {
  const batches = order.batches || [order.items || []];
  const dateStr = new Date(order.date).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const itemsHtml = batches.map((batchItems, bIdx) => {
    const rows = batchItems.map(i => {
      const name = escapeHtml(i.name) + (i.option ? ` (${escapeHtml(i.option)})` : '');
      const subtotal = (i.price * i.qty).toFixed(2);
      return `<tr><td class="col-name">${name} ×${i.qty}</td><td class="col-price">&#3647;${subtotal}</td></tr>`;
    }).join('');
    const batchLabel = batches.length > 1 ? `<tr><td colspan="2" class="batch-sep">— รอบที่ ${bIdx + 1} —</td></tr>` : '';
    return batchLabel + rows;
  }).join('');
  const totalStr = Number(order.total).toFixed(2);
  const qrSrc = new URL('qr-bank.png', location.href).href;
  const win = window.open('', '_blank', 'width=340,height=720');
  if (!win) { alert('กรุณาอนุญาต Pop-up ใน Browser ก่อนนะครับ'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบเสร็จ #${escapeHtml(String(order.orderNumber))}</title>
<link href="https://fonts.googleapis.com/css2?family=Courier+New:wght@400;700&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"><style>
@media print{@page{size:58mm auto;margin:1mm 4mm 1mm 3mm;}body{font-family:'Courier New',Courier,monospace;font-size:9pt;color:#000 !important;background:#fff;width:51mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeSpeed;}}
*, *::before, *::after{color:#000 !important;border-color:#000 !important;}
.no-print{display:flex;justify-content:center;gap:8px;margin-top:12px;}body{margin:0;padding:0;}
</style></head><body>
<div class="r-header"><div class="r-shop">&#127835; ข้าวซอย 90</div><div class="r-sub">ใบเสร็จรับเงิน</div></div>
<hr class="r-div" style="border:none;border-top:1px solid #000 !important;margin:3pt 0;">
<div class="r-meta"><div class="r-meta-row"><span class="r-meta-label">ออเดอร์</span><span><strong>#${escapeHtml(String(order.orderNumber))}</strong></span></div>
<div class="r-meta-row"><span class="r-meta-label">โต๊ะ</span><span>${escapeHtml(String(order.table || '-'))}</span></div>
<div class="r-meta-row"><span class="r-meta-label">วันที่</span><span>${escapeHtml(dateStr)}</span></div></div>
<hr class="r-div" style="border:none;border-top:1px solid #000 !important;margin:3pt 0;">
<table><tbody>${itemsHtml}</tbody></table>
<hr class="r-div" style="border:none;border-top:1px solid #000 !important;margin:3pt 0;">
<div class="r-total" style="display:flex;justify-content:space-between;font-size:11pt;font-weight:bold;margin:3pt 0 2pt;padding-top:3pt;border-top:1.5px solid #000 !important;"><span>รวมทั้งหมด</span><span>&#3647;${totalStr}</span></div>
<div class="r-qr-section" style="text-align:center;margin:5pt 0 2pt;">
  <div class="r-qr-label" style="font-size:8.5pt;font-weight:bold;margin-bottom:3pt;">&#128179; สแกนจ่าย K Bank</div>
  <img class="r-qr-img" src="${qrSrc}" alt="QR ธนาคาร" style="width:40mm;height:40mm;object-fit:contain;display:block;margin:0 auto;border:3px solid #1a7a4a;border-radius:8px;padding:5px;" onerror="this.outerHTML='<div style=\\'font-size:8pt;color:#c00;margin:4pt 0;text-align:center\\'>&#9888; ไม่พบไฟล์ qr-bank.png</div>'">
  <div class="r-qr-hint" style="font-size:8pt;margin-top:3pt;">ขอบคุณที่ใช้บริการ &#128591;</div>
</div>
<hr class="r-div" style="border:none;border-top:1px solid #000 !important;margin:3pt 0;">
<div class="r-footer" style="text-align:center;font-size:8pt;">ข้าวซอย 90</div>
<div class="no-print"><button class="btn-doit" onclick="window.print()" style="font-family:'Sarabun',sans-serif;font-size:10pt;padding:6px 18px;border-radius:6px;cursor:pointer;border:1.5px solid #333 !important;background:#3d2b1f !important;color:#fff !important;">&#128424; พิมพ์</button>
<button onclick="window.close()" style="font-family:'Sarabun',sans-serif;font-size:10pt;padding:6px 18px;border-radius:6px;cursor:pointer;border:1.5px solid #333 !important;background:#fff !important;color:#000 !important;">ปิด</button></div>
</body></html>`);
  win.document.close();
}
// (CSS ย้ายไป admin.css แล้ว)
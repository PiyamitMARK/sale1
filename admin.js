/**
 * ครัวคุณแม่ — Admin
 * Firebase Realtime Database
 *
 * ⚠️  ความปลอดภัย:
 *   - รหัสผ่านถูก hash ด้วย SHA-256 ก่อนเปรียบเทียบ
 *   - ไม่เก็บ plaintext password ใน source code
 *   - ใส่ ADMIN_PASS_HASH จากการ hash รหัสผ่านของคุณ
 *     วิธี generate: เปิด console แล้วรัน hashPassword('รหัสผ่านของคุณ')
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, update, remove, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ==================== Firebase Config ====================
// ⚠️ เปลี่ยนค่าเหล่านี้เป็น Firebase project ของคุณเอง
const firebaseConfig = {
  apiKey:            "AIzaSyBB5jaE7UPqF2Yw-3pKs7rx5pduvS1NJ6c",
  authDomain:        "sale1-91a2e.firebaseapp.com",
  databaseURL:       "https://sale1-91a2e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "sale1-91a2e",
  storageBucket:     "sale1-91a2e.firebasestorage.app",
  messagingSenderId: "549769985543",
  appId:             "1:549769985543:web:72759e2d08454343ec74a2",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ==================== Config ====================
const ADMIN_USER = 'Admin';

/**
 * SHA-256 hash ของรหัสผ่าน
 * ค่าด้านล่างนี้คือ hash ของ "123456789"
 * เปลี่ยนเป็น hash ของรหัสผ่านใหม่ของคุณ:
 *   1. เปิด browser console
 *   2. รัน: hashPassword('รหัสผ่านใหม่ของคุณ').then(h => console.log(h))
 *   3. นำค่า hash ที่ได้มาแทนที่ด้านล่าง
 */
const ADMIN_PASS_HASH = '15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225'; // hash ของ "123456789"

const AUTH_KEY         = 'krua-khun-mae-auth';
const GOOGLE_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL'; // ใส่ URL จาก Google Apps Script

// ==================== Rate Limiting (brute force protection) ====================
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 นาที
const ATTEMPT_KEY        = 'krua-login-attempts';
const LOCKOUT_KEY        = 'krua-login-lockout';

function getAttempts() {
  return parseInt(sessionStorage.getItem(ATTEMPT_KEY) || '0', 10);
}
function getLockoutUntil() {
  return parseInt(sessionStorage.getItem(LOCKOUT_KEY) || '0', 10);
}
function incrementAttempts() {
  const n = getAttempts() + 1;
  sessionStorage.setItem(ATTEMPT_KEY, n);
  if (n >= LOGIN_MAX_ATTEMPTS) {
    sessionStorage.setItem(LOCKOUT_KEY, Date.now() + LOGIN_LOCKOUT_MS);
  }
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
const loginScreen     = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginBtn        = document.getElementById('loginBtn');
const usernameInput   = document.getElementById('username');
const passwordInput   = document.getElementById('password');
const loginError      = document.getElementById('loginError');
const ordersList      = document.getElementById('ordersList');
const ordersEmpty     = document.getElementById('ordersEmpty');
const logoutBtn       = document.getElementById('logoutBtn');
const todayOrderCount = document.getElementById('todayOrderCount');
const todayTotal      = document.getElementById('todayTotal');
const tabRecent       = document.getElementById('tabRecent');
const tabHistory      = document.getElementById('tabHistory');
const historyContent  = document.getElementById('historyContent');
const historyEmpty    = document.getElementById('historyEmpty');
const clearDataBtn    = document.getElementById('clearDataBtn');
const clearDataModal  = document.getElementById('clearDataModal');
const clearDataCode   = document.getElementById('clearDataCode');
const clearDataError  = document.getElementById('clearDataError');
const clearDataCancel = document.getElementById('clearDataCancel');
const clearDataConfirm = document.getElementById('clearDataConfirm');
const exportSheetBtn  = document.getElementById('exportSheetBtn');
const exportModal     = document.getElementById('exportModal');
const exportCancel    = document.getElementById('exportCancel');
const exportConfirm   = document.getElementById('exportConfirm');
const exportStatus    = document.getElementById('exportStatus');
const customDateRange = document.getElementById('customDateRange');
const dateFrom        = document.getElementById('dateFrom');
const dateTo          = document.getElementById('dateTo');

// ==================== State ====================
let allOrders = [];
let unsubscribeListener = null;

// ==================== Auth ====================
function isLoggedIn() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

function setLoggedIn(value) {
  value
    ? sessionStorage.setItem(AUTH_KEY, 'true')
    : sessionStorage.removeItem(AUTH_KEY);
}

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDateOnly(isoString) {
  return new Date(isoString).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function getDateKey(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

function isToday(isoString) {
  return getDateKey(isoString) === new Date().toISOString().slice(0, 10);
}

function isWithinLast30Days(isoString) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return new Date(isoString) >= cutoff;
}

// ==================== Sound Alert ====================
let audioCtx = null;
let soundEnabled = true;
let knownOrderKeys = new Set(); // tracks keys we've already seen
let isFirstLoad = true;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playOrderAlert() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    // Bell-like sound: 3 beeps
    [0, 0.18, 0.36].forEach((delay) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + delay + 0.25);
      gain.gain.setValueAtTime(0.55, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.36);
    });
  } catch (e) {
    console.warn('Sound alert error:', e);
  }
}

// ==================== Firebase: Real-time Listener ====================
function startRealtimeListener() {
  if (unsubscribeListener) unsubscribeListener();
  knownOrderKeys = new Set();
  isFirstLoad = true;
  unsubscribeListener = onValue(ref(db, 'orders'), (snapshot) => {
    const newOrders = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        newOrders.push({ firebaseKey: child.key, ...child.val() });
      });
      newOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Detect new pending orders (after first load)
    if (!isFirstLoad) {
      newOrders.forEach((o) => {
        if (!knownOrderKeys.has(o.firebaseKey) && o.status === 'pending') {
          playOrderAlert();
          showOrderToast(o);
        }
      });
    }

    // Update known keys
    knownOrderKeys = new Set(newOrders.map(o => o.firebaseKey));
    isFirstLoad = false;

    allOrders = newOrders;
    renderDailySummary();
    renderOrders();
    renderHistory();
  });
}

function showOrderToast(order) {
  // Remove existing toast if any
  document.querySelectorAll('.new-order-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'new-order-toast';
  toast.innerHTML = `🔔 <strong>ออเดอร์ใหม่!</strong> #${order.orderNumber} โต๊ะ ${order.table || '-'}
    <button type="button" class="toast-close">✕</button>`;
  document.body.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

// ==================== Firebase: Actions ====================
async function markOrderAsPaid(firebaseKey) {
  await update(ref(db, `orders/${firebaseKey}`), { status: 'paid' });
}

async function deleteOrder(firebaseKey, orderNumber) {
  if (!confirm(`ลบออเดอร์ #${orderNumber} ?`)) return;
  await remove(ref(db, `orders/${firebaseKey}`));
}

async function clearAllOrders() {
  await remove(ref(db, 'orders'));
  await update(ref(db, 'meta'), {
    orderNumber: 1001,
    lastOrderDate: new Date().toISOString().slice(0, 10),
  });
  closeClearDataModal();
}

// ==================== Products (admin add-item) ====================
const ALL_PRODUCTS = [
  // ผัด
  { id: 'pad1',  name: 'ผัดไวไวหมู',             price: 50,  category: 'pad' },
  { id: 'pad2',  name: 'ผัดไวไวไข่',              price: 50,  category: 'pad' },
  { id: 'pad3',  name: 'ผัดสปาเก็ตตี',             price: 65,  category: 'pad' },
  { id: 'pad4',  name: 'ราดหน้าหมู',               price: 55,  category: 'pad' },
  { id: 'pad5',  name: 'ราดหน้าทะเล',              price: 68,  category: 'pad' },
  { id: 'pad6',  name: 'ไก่ผัดขิง',                price: 50,  category: 'pad' },
  { id: 'pad7',  name: 'ไข่เจียวหมูสับ',            price: 45,  category: 'pad' },
  { id: 'pad8',  name: 'ไข่เจียวกุ้ง',              price: 50,  category: 'pad' },
  { id: 'pad9',  name: 'ไข่ต้ม',                   price: 8,   category: 'pad' },
  { id: 'pad10', name: 'ไข่ดาว',                  price: 5,   category: 'pad' },
  { id: 'pad11', name: 'ผัดพริกแกงป่าหมู',         price: 75,  category: 'pad' },
  { id: 'pad12', name: 'ผัดพริกแกงป่าไก่',         price: 75,  category: 'pad' },
  { id: 'pad13', name: 'หมูผัดพริกหยวก',           price: 65,  category: 'pad' },
  { id: 'pad14', name: 'เป็ดผัดพริกเกลือ',         price: 75,  category: 'pad' },
  { id: 'pad15', name: 'ไข่ยัดไส้ (จาน)',          price: 65,  category: 'pad' },
  { id: 'pad16', name: 'ไก่สับ (จาน)',             price: 150, category: 'pad' },
  { id: 'pad17', name: 'หมูแดง + หมูกรอบ (จาน)',   price: 150, category: 'pad' },
  { id: 'pad18', name: 'เป็ดต้มพะโล้ (จาน)',       price: 150, category: 'pad' },
  { id: 'pad19', name: 'ขาหมูล้วน (จาน)',          price: 150, category: 'pad' },
  // ข้าว
  { id: 'khao1',  name: 'ข้าวขาหมู',               price: 50, category: 'khao' },
  { id: 'khao2',  name: 'ข้าวมันไก่ต้ม',            price: 50, category: 'khao' },
  { id: 'khao3',  name: 'ข้าวกระเพราหมูสับ',        price: 50, category: 'khao' },
  { id: 'khao4',  name: 'ข้าวผัดกุ้ง',              price: 50, category: 'khao' },
  { id: 'khao5',  name: 'ข้าวผัดหมู',               price: 50, category: 'khao' },
  { id: 'khao6',  name: 'ข้าวหมูแดง',               price: 50, category: 'khao' },
  { id: 'khao7',  name: 'ข้าวหน้าเป็ด',             price: 50, category: 'khao' },
  { id: 'khao8',  name: 'ข้าวกระเพราหมูกรอบ',      price: 50, category: 'khao' },
  { id: 'khao9',  name: 'ข้าวกระเพราเป็ด',          price: 50, category: 'khao' },
  { id: 'khao10', name: 'ข้าวไข่เจียวหมูสับ',       price: 50, category: 'khao' },
  { id: 'khao11', name: 'ข้าวหน้าไก่',              price: 50, category: 'khao' },
  { id: 'khao12', name: 'ข้าวมันขาหมู',             price: 50, category: 'khao' },
  { id: 'khao13', name: 'ข้าวมันหน้าเป็ด',          price: 50, category: 'khao' },
  { id: 'khao14', name: 'ข้าวกระเพรากุ้ง',          price: 50, category: 'khao' },
  { id: 'khao15', name: 'ข้าวเปล่า',                price: 15, category: 'khao' },
  // ต้ม / แกง
  { id: 'tom1', name: 'ต้มยำกุ้ง',                       price: 102, category: 'tom' },
  { id: 'tom2', name: 'ต้มข่าไก่ใส่กะทิ',                price: 68,  category: 'tom' },
  { id: 'tom3', name: 'ต้มจืดสาหร่ายเต้าหู้หมูสับ',      price: 50,  category: 'tom' },
  // เครื่องดื่ม
  { id: 'water',  name: 'น้ำเปล่า',   price: 5,  category: 'drink' },
  { id: 'pepsi',  name: 'เป็ปซี่',    price: 10, category: 'drink' },
  { id: 'fanta',  name: 'แฟนต้า',     price: 10, category: 'drink' },
  { id: 'sprite', name: 'สไปร์ท',    price: 10, category: 'drink' },
];

const ADD_ITEM_CATEGORIES = [
  { id: 'all',   label: '🍽 ทั้งหมด' },
  { id: 'pad',   label: '🥘 ผัด' },
  { id: 'khao',  label: '🍚 ข้าว' },
  { id: 'tom',   label: '🍲 ต้ม/แกง' },
  { id: 'drink', label: '🥤 เครื่องดื่ม' },
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
  const currentItems = addItemTargetOrder.items || [];
  const filtered     = addItemActiveCategory === 'all'
    ? ALL_PRODUCTS
    : ALL_PRODUCTS.filter(p => p.category === addItemActiveCategory);

  const tabsHtml = `<div class="add-item-cat-tabs">${
    ADD_ITEM_CATEGORIES.map(cat =>
      `<button type="button" class="add-item-cat-btn${addItemActiveCategory === cat.id ? ' active' : ''}" data-cat="${cat.id}">${escapeHtml(cat.label)}</button>`
    ).join('')
  }</div>`;

  const productsHtml = `<div class="add-item-product-grid">${
    filtered.map(p => {
      const existing = currentItems.find(i => i.name === p.name);
      const qty      = existing ? existing.qty : 0;
      return `<button type="button" class="add-item-product-btn" data-id="${p.id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-price="${p.price}">
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
  addItemTargetKey        = null;
  addItemTargetOrder      = null;
  addItemActiveCategory   = 'all';
  if (addItemToastTimer) { clearTimeout(addItemToastTimer); addItemToastTimer = null; }
  const toast = document.getElementById('addItemToastMsg');
  if (toast) toast.textContent = '';
  toast?.classList.remove('show');
}

async function addItemToOrder({ name, price }) {
  if (!addItemTargetKey || !addItemTargetOrder) return;

  const items    = addItemTargetOrder.items || [];
  const existing = items.find(i => i.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    items.push({ name, price: parseFloat(price), qty: 1 });
  }
  addItemTargetOrder.items = items;
  addItemTargetOrder.total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  try {
    await update(ref(db, `orders/${addItemTargetKey}`), {
      items: addItemTargetOrder.items,
      total: addItemTargetOrder.total,
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

// ==================== Render ====================
function renderDailySummary() {
  const paidToday = allOrders.filter((o) => o.status === 'paid' && isToday(o.date));
  todayOrderCount.textContent = paidToday.length;
  todayTotal.textContent      = formatMoney(paidToday.reduce((sum, o) => sum + o.total, 0));
}

function renderOrders() {
  if (allOrders.length === 0) {
    ordersList.innerHTML = '';
    ordersList.classList.add('hidden');
    ordersEmpty.classList.remove('hidden');
    return;
  }

  ordersEmpty.classList.add('hidden');
  ordersList.classList.remove('hidden');

  ordersList.innerHTML = allOrders.map((order) => {
    const isPending = order.status === 'pending';
    return `
      <article class="order-card" data-key="${order.firebaseKey}">
        <div class="order-card-header">
          <div class="order-card-header-row">
            <h3 class="order-card-title">
              ออเดอร์ #${escapeHtml(String(order.orderNumber))}
              ${order.table ? `<span class="order-table-chip">โต๊ะ ${escapeHtml(String(order.table))}</span>` : ''}
            </h3>
            <span class="status-badge ${isPending ? 'pending' : 'paid'}">${isPending ? '⏳ รอจ่าย' : '✅ จ่ายแล้ว'}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(order.date)}</span>
            <div class="order-actions">
              ${isPending ? `<button type="button" class="btn-paid" data-key="${order.firebaseKey}">จ่ายแล้ว</button>` : ''}
              <button type="button" class="btn-add-item" data-key="${order.firebaseKey}">+ เพิ่มเมนู</button>
              <button type="button" class="btn-delete" data-key="${order.firebaseKey}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button>
            </div>
          </div>
        </div>
        <div class="order-card-body">
          <ul class="order-items">
            ${(order.items || []).map((i) => `
              <li class="order-item">
                <span>${escapeHtml(i.name)}${i.option ? `<span class="order-item-option"> · ${escapeHtml(i.option)}</span>` : ''} × ${i.qty}</span>
                <span>${formatMoney(i.price * i.qty)}</span>
              </li>`).join('')}
          </ul>
          <div class="order-total-row">
            <span>รวมทั้งหมด</span>
            <span>${formatMoney(order.total)}</span>
          </div>
        </div>
      </article>`;
  }).join('');

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
            ${day.orders.map((o) =>
              `<li class="history-order-row">
                <span>ออเดอร์ #${escapeHtml(String(o.orderNumber))} · ${formatDate(o.date)}</span>
                <span>${formatMoney(o.total)}</span>
              </li>`
            ).join('')}
          </ul>
        </div>
      </section>`;
  }).join('');
}

// ==================== Tabs ====================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  tabRecent.classList.toggle('hidden',   tabId !== 'recent');
  tabHistory.classList.toggle('hidden',  tabId !== 'history');
}

// ==================== Auth Events ====================
function checkAuth() {
  if (isLoggedIn()) {
    showScreen(dashboardScreen);
    startRealtimeListener();
    switchTab('recent');
  } else {
    showScreen(loginScreen);
  }
}

loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';

  // Rate limit check
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
      showScreen(dashboardScreen);
      startRealtimeListener();
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

// Enter key on inputs triggers login
[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });
});

logoutBtn.addEventListener('click', () => {
  setLoggedIn(false);
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  allOrders = [];
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
  exportStatus.textContent = '';
  exportStatus.className   = 'export-status';
  exportConfirm.disabled   = false;
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
    const from = dateFrom.value;
    const to   = dateTo.value;
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
    const res    = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ orders, summary: buildSummary(orders) }),
    });
    const result = await res.json();
    if (result.success) {
      exportStatus.textContent = `✅ ส่งสำเร็จ! ${result.inserted} ออเดอร์ (ข้ามซ้ำ ${result.skipped} รายการ)`;
      exportStatus.className   = 'export-status success';
      exportConfirm.textContent = '✅ สำเร็จ';
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (err) {
    exportStatus.textContent = '❌ เกิดข้อผิดพลาด: ' + err.message;
    exportStatus.className   = 'export-status error';
    exportConfirm.disabled   = false;
    exportConfirm.textContent = '📤 ส่งข้อมูล';
  }
});

// ==================== Sound Toggle ====================
const soundToggleBtn = document.getElementById('soundToggleBtn');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    // Unlock AudioContext on first user gesture
    if (!audioCtx) getAudioContext();
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔔 เสียงเปิด' : '🔕 เสียงปิด';
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
  });
}

// ==================== Init ====================
checkAuth();

/**
 * ครัวคุณแม่ — Admin
 * Cloudflare D1 (ผ่าน Worker API) — แทนที่ Firebase Realtime Database
 *
 * Real-time: ใช้ polling GET /api/poll?since=<ISO> ทุก 3 วินาที
 *            แทน Firebase onValue()
 */

// ============================================================
// ⚙️  CONFIG — เปลี่ยนให้ตรงกับ Worker และ token ของคุณ
// ============================================================
const API_BASE    = 'https://krua-khun-mae-api.zzmarkzz1329.workers.dev';
const ADMIN_TOKEN = 'mySecret123'; // ตรงกับที่ตั้งในข้อ 1

// ==================== Config ====================
const ADMIN_USER = 'Admin';

/**
 * SHA-256 hash ของรหัสผ่าน
 * ค่าด้านล่างนี้คือ hash ของ "123456789"
 * เปลี่ยน: hashPassword('รหัสใหม่').then(h => console.log(h))
 */
const ADMIN_PASS_HASH = '15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225';

const AUTH_KEY    = 'krua-khun-mae-auth';

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
  resetAttempts(); return false;
}

// ==================== Password Hashing ====================
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(password);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== API Helper ====================
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN,
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
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
const clearDataModal  = document.getElementById('clearDataModal');
const clearDataCode   = document.getElementById('clearDataCode');
const clearDataError  = document.getElementById('clearDataError');
const clearDataCancel = document.getElementById('clearDataCancel');
const clearDataConfirm = document.getElementById('clearDataConfirm');

// ==================== State ====================
let allOrders    = [];
let pollInterval = null;
let lastPollTime = new Date(0).toISOString(); // เริ่มต้น: ดึงทุก order

// ==================== Auth ====================
function isLoggedIn() {
  try { return localStorage.getItem(AUTH_KEY) === 'true'; }
  catch (_) { return sessionStorage.getItem(AUTH_KEY) === 'true'; }
}

function setLoggedIn(value) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, 'true');
    else localStorage.removeItem(AUTH_KEY);
  } catch (_) {
    if (value) sessionStorage.setItem(AUTH_KEY, 'true');
    else sessionStorage.removeItem(AUTH_KEY);
  }
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
let knownOrderIds = new Set();
let isFirstLoad = true;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playOrderAlert() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
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
  } catch (e) { console.warn('Sound error:', e); }
}

// ==================== Polling (แทน Firebase onValue) ====================
async function loadAllOrders() {
  const data = await apiFetch('/api/orders');
  // data คือ array จาก Worker
  allOrders = data.sort((a, b) => new Date(b.date) - new Date(a.date));
  knownOrderIds = new Set(allOrders.map(o => o.id));
  isFirstLoad = false;
  lastPollTime = new Date().toISOString();
  renderDailySummary();
  renderOrders();
  renderHistory();
}

async function pollNewOrders() {
  try {
    const data = await apiFetch(`/api/poll?since=${encodeURIComponent(lastPollTime)}`);
    if (!data.orders || data.orders.length === 0) return;

    let hasNew = false;
    for (const o of data.orders) {
      if (!knownOrderIds.has(o.id)) {
        // order ใหม่
        if (o.status === 'pending') {
          playOrderAlert();
          showOrderToast(o);
        }
        knownOrderIds.add(o.id);
        hasNew = true;
      }
    }

    if (hasNew) {
      // โหลดใหม่ทั้งหมดเพื่อ sync
      await loadAllOrders();
    }

    lastPollTime = data.serverTime || new Date().toISOString();
  } catch (e) {
    console.warn('poll error:', e);
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  loadAllOrders(); // โหลดครั้งแรก
  // poll ทุก 3 วินาที
  pollInterval = setInterval(pollNewOrders, 3000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

function showOrderToast(order) {
  document.querySelectorAll('.new-order-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'new-order-toast';
  toast.innerHTML = `🔔 <strong>ออเดอร์ใหม่!</strong> #${order.orderNumber} โต๊ะ ${order.table || '-'}
    <button type="button" class="toast-close">✕</button>`;
  document.body.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

// ==================== API: Actions ====================
async function markOrderAsPaid(id) {
  await apiFetch(`/api/orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'paid' }),
  });
  await loadAllOrders();
}

async function deleteOrder(id, orderNum) {
  if (!confirm(`ลบออเดอร์ #${orderNum} ?`)) return;
  await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
  await loadAllOrders();
}

async function clearAllOrders() {
  await apiFetch('/api/orders', { method: 'DELETE' });
  await loadAllOrders();
  closeClearDataModal();
}

// ==================== Products (admin add-item — ใช้ ALL_PRODUCTS คงเดิม) ====================
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
  { id: 'khao1',  name: 'ข้าวขาหมู',               price: 50,  category: 'khao' },
  { id: 'khao2',  name: 'ข้าวมันไก่ต้ม',            price: 50,  category: 'khao' },
  { id: 'khao3',  name: 'ข้าวกระเพราหมูสับ',        price: 50,  category: 'khao' },
  { id: 'khao4',  name: 'ข้าวผัดกุ้ง',              price: 50,  category: 'khao' },
  { id: 'khao5',  name: 'ข้าวผัดหมู',               price: 50,  category: 'khao' },
  { id: 'khao6',  name: 'ข้าวหมูแดง',               price: 50,  category: 'khao' },
  { id: 'khao7',  name: 'ข้าวหน้าเป็ด',             price: 50,  category: 'khao' },
  { id: 'khao8',  name: 'ข้าวกระเพราหมูกรอบ',      price: 50,  category: 'khao' },
  { id: 'khao9',  name: 'ข้าวกระเพราเป็ด',          price: 50,  category: 'khao' },
  { id: 'khao10', name: 'ข้าวไข่เจียวหมูสับ',       price: 50,  category: 'khao' },
  { id: 'khao11', name: 'ข้าวหน้าไก่',              price: 50,  category: 'khao' },
  { id: 'khao12', name: 'ข้าวมันขาหมู',             price: 50,  category: 'khao' },
  { id: 'khao13', name: 'ข้าวมันหน้าเป็ด',          price: 50,  category: 'khao' },
  { id: 'khao14', name: 'ข้าวกระเพรากุ้ง',          price: 50,  category: 'khao' },
  { id: 'khao15', name: 'ข้าวเปล่า',                price: 15,  category: 'khao' },
  // ต้ม / แกง
  { id: 'tom1', name: 'ต้มยำกุ้ง',                       price: 102, category: 'tom' },
  { id: 'tom2', name: 'ต้มข่าไก่ใส่กะทิ',                price: 68,  category: 'tom' },
  { id: 'tom3', name: 'ต้มจืดสาหร่ายเต้าหู้หมูสับ',      price: 50,  category: 'tom' },
  // เครื่องดื่ม
  { id: 'water',  name: 'น้ำเปล่า',  price: 5,  category: 'drink' },
  { id: 'pepsi',  name: 'เป็ปซี่',   price: 10, category: 'drink' },
  { id: 'fanta',  name: 'แฟนต้า',    price: 10, category: 'drink' },
  { id: 'sprite', name: 'สไปร์ท',   price: 10, category: 'drink' },
];

const ADD_ITEM_CATEGORIES = [
  { id: 'all',   label: '🍽 ทั้งหมด' },
  { id: 'pad',   label: '🥘 ผัด' },
  { id: 'khao',  label: '🍚 ข้าว' },
  { id: 'tom',   label: '🍲 ต้ม/แกง' },
  { id: 'drink', label: '🥤 เครื่องดื่ม' },
];

let addItemActiveCategory = 'all';
let addItemTargetId    = null;
let addItemTargetOrder = null;
let addItemToastTimer  = null;

const addItemModal       = document.getElementById('addItemModal');
const addItemProductList = document.getElementById('addItemProductList');
const addItemCancel      = document.getElementById('addItemCancel');

function openAddItemModal(id, order) {
  addItemTargetId    = id;
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
      return `<button type="button" class="add-item-product-btn" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-price="${p.price}">
        <span class="add-item-product-name">${escapeHtml(p.name)}</span>
        <span class="add-item-product-price">${formatMoney(p.price)}</span>
        ${qty > 0 ? `<span class="add-item-qty-badge">${qty}</span>` : ''}
      </button>`;
    }).join('')
  }</div>`;

  addItemProductList.innerHTML = tabsHtml + productsHtml;

  addItemProductList.querySelectorAll('.add-item-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => { addItemActiveCategory = btn.dataset.cat; renderAddItemList(); });
  });
  addItemProductList.querySelectorAll('.add-item-product-btn').forEach(btn => {
    btn.addEventListener('click', () => addItemToOrder(btn.dataset));
  });
}

function closeAddItemModal() {
  addItemModal.setAttribute('aria-hidden', 'true');
  addItemTargetId = null; addItemTargetOrder = null; addItemActiveCategory = 'all';
  if (addItemToastTimer) { clearTimeout(addItemToastTimer); addItemToastTimer = null; }
  const toast = document.getElementById('addItemToastMsg');
  if (toast) { toast.textContent = ''; toast.classList.remove('show'); }
}

async function addItemToOrder({ name, price }) {
  if (!addItemTargetId || !addItemTargetOrder) return;
  const items    = addItemTargetOrder.items || [];
  const existing = items.find(i => i.name === name);
  if (existing) { existing.qty += 1; }
  else { items.push({ name, price: parseFloat(price), qty: 1 }); }
  addItemTargetOrder.items = items;
  addItemTargetOrder.total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  try {
    await apiFetch(`/api/orders/${addItemTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ items: addItemTargetOrder.items, total: addItemTargetOrder.total }),
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
  // อัพเดท allOrders ใน memory
  const idx = allOrders.findIndex(o => o.id === addItemTargetId);
  if (idx !== -1) {
    allOrders[idx].items = addItemTargetOrder.items;
    allOrders[idx].total = addItemTargetOrder.total;
  }
}

if (addItemCancel) addItemCancel.addEventListener('click', closeAddItemModal);
if (addItemModal)  addItemModal.addEventListener('click', (e) => { if (e.target === addItemModal) closeAddItemModal(); });

// ==================== Edit Order Modal ====================
let editOrderTargetId = null;
let editOrderData     = null;
let editCatActive     = 'all';

const EDIT_CATEGORIES = ADD_ITEM_CATEGORIES;

const editOrderModal     = document.getElementById('editOrderModal');
const editOrderTitle     = document.getElementById('editOrderTitle');
const editOrderItemsList = document.getElementById('editOrderItemsList');
const editOrderTotal     = document.getElementById('editOrderTotal');
const editOrderCancel    = document.getElementById('editOrderCancel');
const editOrderSave      = document.getElementById('editOrderSave');

function openEditOrderModal(id, order) {
  editOrderTargetId = id;
  editOrderData     = JSON.parse(JSON.stringify(order));
  editCatActive     = 'all';
  editOrderTitle.textContent = `แก้ไขออเดอร์ #${order.orderNumber} · โต๊ะ ${order.table || '-'}`;

  const menuContainer = document.getElementById('editAddMenuContainer');
  const toggleBtn     = document.getElementById('toggleAddMenuBtn');
  if (menuContainer) { menuContainer.classList.add('hidden'); menuContainer.innerHTML = ''; }
  if (toggleBtn)     { toggleBtn.textContent = '➕ เพิ่มเมนู'; toggleBtn.classList.remove('active'); }

  renderEditOrderItems();
  editOrderModal.setAttribute('aria-hidden', 'false');

  if (toggleBtn) {
    const fresh = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(fresh, toggleBtn);
    fresh.addEventListener('click', () => {
      const mc = document.getElementById('editAddMenuContainer');
      if (!mc) return;
      const isHidden = mc.classList.toggle('hidden');
      if (!isHidden) {
        renderEditAddMenu();
        fresh.textContent = '✕ ปิดเมนู'; fresh.classList.add('active');
        setTimeout(() => mc.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      } else {
        fresh.textContent = '➕ เพิ่มเมนู'; fresh.classList.remove('active');
      }
    });
  }
}

function closeEditOrderModal() {
  editOrderModal.setAttribute('aria-hidden', 'true');
  editOrderTargetId = null; editOrderData = null;
}

function recalcEditTotal() {
  const total = (editOrderData.items || []).reduce((s, i) => s + i.price * i.qty, 0);
  editOrderData.total = total;
  editOrderTotal.textContent = `รวมทั้งหมด: ${formatMoney(total)}`;
}

function renderEditOrderItems() {
  const items = editOrderData.items || [];
  if (items.length === 0) {
    editOrderItemsList.innerHTML = '<p class="edit-order-empty">ยังไม่มีรายการ</p>';
    recalcEditTotal(); return;
  }
  editOrderItemsList.innerHTML = items.map((item, idx) => `
    <div class="edit-order-item" data-idx="${idx}">
      <div class="edit-order-item-info">
        <span class="edit-order-item-name">${escapeHtml(item.name)}</span>
        ${item.option ? `<span class="edit-order-item-opt">${escapeHtml(item.option)}</span>` : ''}
        <span class="edit-order-item-price">${formatMoney(item.price)} / ชิ้น</span>
      </div>
      <div class="edit-order-item-controls">
        <button type="button" class="edit-qty-btn" data-action="minus" data-idx="${idx}">−</button>
        <span class="edit-qty-num">${item.qty}</span>
        <button type="button" class="edit-qty-btn" data-action="plus"  data-idx="${idx}">+</button>
        <button type="button" class="edit-remove-btn" data-idx="${idx}" title="ลบรายการ">🗑</button>
      </div>
    </div>
  `).join('');

  editOrderItemsList.querySelectorAll('.edit-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.action === 'plus') { editOrderData.items[idx].qty += 1; }
      else {
        editOrderData.items[idx].qty -= 1;
        if (editOrderData.items[idx].qty <= 0) editOrderData.items.splice(idx, 1);
      }
      renderEditOrderItems(); renderEditAddMenu();
    });
  });
  editOrderItemsList.querySelectorAll('.edit-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editOrderData.items.splice(parseInt(btn.dataset.idx), 1);
      renderEditOrderItems(); renderEditAddMenu();
    });
  });
  recalcEditTotal();
}

function renderEditAddMenu() {
  const menuContainer = document.getElementById('editAddMenuContainer');
  if (!menuContainer || menuContainer.classList.contains('hidden')) return;

  const tabsHtml = `<div class="add-item-cat-tabs">${
    EDIT_CATEGORIES.map(c =>
      `<button type="button" class="add-item-cat-btn${editCatActive === c.id ? ' active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`
    ).join('')
  }</div>`;

  const filtered = editCatActive === 'all' ? ALL_PRODUCTS : ALL_PRODUCTS.filter(p => p.category === editCatActive);
  const gridHtml = `<div class="add-item-product-grid">${
    filtered.map(p => {
      const existing = (editOrderData.items || []).find(i => i.name === p.name && !i.option);
      const qty      = existing ? existing.qty : 0;
      return `<button type="button" class="add-item-product-btn" data-name="${escapeAttr(p.name)}" data-price="${p.price}">
        <span class="add-item-product-name">${escapeHtml(p.name)}</span>
        <span class="add-item-product-price">${formatMoney(p.price)}</span>
        ${qty > 0 ? `<span class="add-item-qty-badge">${qty}</span>` : ''}
      </button>`;
    }).join('')
  }</div>`;

  menuContainer.innerHTML = tabsHtml + gridHtml;

  menuContainer.querySelectorAll('.add-item-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => { editCatActive = btn.dataset.cat; renderEditAddMenu(); });
  });
  menuContainer.querySelectorAll('.add-item-product-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name  = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      const existing = (editOrderData.items || []).find(i => i.name === name && !i.option);
      if (existing) { existing.qty += 1; }
      else { if (!editOrderData.items) editOrderData.items = []; editOrderData.items.push({ name, price, qty: 1 }); }
      renderEditOrderItems(); renderEditAddMenu();
    });
  });
}

if (editOrderCancel) editOrderCancel.addEventListener('click', closeEditOrderModal);
if (editOrderModal)  editOrderModal.addEventListener('click', (e) => { if (e.target === editOrderModal) closeEditOrderModal(); });

if (editOrderSave) {
  editOrderSave.addEventListener('click', async () => {
    if (!editOrderTargetId || !editOrderData) return;
    editOrderSave.disabled    = true;
    editOrderSave.textContent = 'กำลังบันทึก...';
    try {
      await apiFetch(`/api/orders/${editOrderTargetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ items: editOrderData.items || [], total: editOrderData.total || 0 }),
      });
      closeEditOrderModal();
      await loadAllOrders();
    } catch (err) {
      console.error('editOrderSave error:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่');
    } finally {
      editOrderSave.disabled    = false;
      editOrderSave.textContent = '💾 บันทึก';
    }
  });
}

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
      <article class="order-card" data-id="${order.id}">
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
              ${isPending ? `<button type="button" class="btn-paid" data-id="${order.id}">จ่ายแล้ว</button>` : ''}
              <button type="button" class="btn-edit-order" data-id="${order.id}">✏️ แก้ไข</button>
              <button type="button" class="btn-delete" data-id="${order.id}" data-num="${escapeHtml(String(order.orderNumber))}">ลบ</button>
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
    btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.id));
  });
  ordersList.querySelectorAll('.btn-edit-order').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => o.id === btn.dataset.id);
      if (order) openEditOrderModal(btn.dataset.id, order);
    });
  });
  ordersList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.id, btn.dataset.num));
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
  tabRecent.classList.toggle('hidden',  tabId !== 'recent');
  tabHistory.classList.toggle('hidden', tabId !== 'history');
}

// ==================== Auth Events ====================
function checkAuth() {
  if (isLoggedIn()) {
    showScreen(dashboardScreen);
    startPolling();
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
      showScreen(dashboardScreen);
      startPolling();
      switchTab('recent');
    } else {
      const attempts = incrementAttempts();
      const left     = LOGIN_MAX_ATTEMPTS - attempts;
      loginError.textContent = left > 0
        ? `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลือ ${left} ครั้ง)`
        : 'ล็อคบัญชีชั่วคราว กรุณารอ 5 นาที';
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
  try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
  try { sessionStorage.removeItem(AUTH_KEY); } catch (_) {}
  stopPolling();
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

const clearDataBtn = document.getElementById('clearDataBtn');
if (clearDataBtn)     clearDataBtn.addEventListener('click', openClearDataModal);
if (clearDataCancel)  clearDataCancel.addEventListener('click', closeClearDataModal);
if (clearDataModal)   clearDataModal.addEventListener('click', (e) => { if (e.target === clearDataModal) closeClearDataModal(); });

if (clearDataConfirm) clearDataConfirm.addEventListener('click', async () => {
  clearDataError.textContent = '';
  const code = clearDataCode.value;
  if (!code) { clearDataError.textContent = 'กรุณาใส่รหัส'; clearDataCode.focus(); return; }

  clearDataConfirm.disabled    = true;
  clearDataConfirm.textContent = 'กำลังตรวจสอบ...';

  try {
    const hash = await hashPassword(code);
    if (hash !== ADMIN_PASS_HASH) {
      clearDataError.textContent = 'รหัสไม่ถูกต้อง';
      clearDataCode.value = '';
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

// ==================== Sound Toggle ====================
const soundToggleBtn = document.getElementById('soundToggleBtn');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    if (!audioCtx) getAudioContext();
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔔 เสียงเปิด' : '🔕 เสียงปิด';
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
  });
}

// ==================== Init ====================
checkAuth();

/**
 * ข้าวซอย 90 — Admin
 * Cloudflare Worker REST API + WebSocket
 *
 * ระบบใหม่ batch:
 *   - order มี batches: [ [...items], [...items], ... ]
 *   - แต่ละ batch = การสั่งแต่ละรอบ
 *   - จ่ายแล้ว → clearTable เพื่อให้โต๊ะนั้นได้ order number ใหม่
 */

import { initBillFeature, bindBillButtons, injectMergeBillBtn } from './bill-feature.js';
import { api, ws, isLoggedIn as apiIsLoggedIn, adminLogin, adminLogout, applyTheme, toggleTheme, getTheme } from './api-client.js';

// ==================== Config ====================
const AUTH_KEY = 'kaosoi-auth'; // ต้องตรงกับ api-client.js (localStorage key)

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

// ==================== State ====================
let allOrders = [];
let _wsConn   = null;
let _loadOrdersTimer = null;  // debounce
let _loadOrdersOpts  = {};    // รวม opts ที่ pending

function _debouncedLoadOrders(opts = {}) {
  // รวม opts: ถ้ามี silent: false ใน queue ให้เล่นเสียง
  if (opts.silent === false || _loadOrdersOpts.silent === false) {
    _loadOrdersOpts = { silent: false };
  } else {
    _loadOrdersOpts = { silent: true };
  }
  if (_loadOrdersTimer) return;  // มี timer รออยู่แล้ว
  _loadOrdersTimer = setTimeout(() => {
    _loadOrdersTimer = null;
    const o = _loadOrdersOpts;
    _loadOrdersOpts  = {};
    _loadOrders(o);
  }, 120);
}
let tableFilter = '';

// ==================== Auth ====================
// isLoggedIn() → ใช้ apiIsLoggedIn ที่ import มาจาก api-client.js แทน
function setLoggedIn(val) {
  if (val) {
    localStorage.setItem(AUTH_KEY, 'true');
    sessionStorage.setItem(AUTH_KEY, 'true');
  } else {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
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
function getDateKey(isoString) {
  // แปลงเป็น Bangkok time (UTC+7) ก่อน slice
  return new Date(new Date(isoString).getTime() + 7*60*60*1000).toISOString().slice(0, 10);
}
function isToday(isoString) {
  const todayBKK = new Date(Date.now() + 7*60*60*1000).toISOString().slice(0, 10);
  return getDateKey(isoString) === todayBKK;
}
function getAllItems(order) {
  if (order.batches) return order.batches.flat();
  return order.items || [];
}

// ==================== Sound Alert ====================
let soundEnabled = true;
let knownOrderIds = new Set();
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
    const utter  = new SpeechSynthesisUtterance('\u200B');
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
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 5000);
  utter.onend = utter.onerror = () => clearInterval(_ttsWatchdog);
}

function speak(text, opts = {}) {
  if (!soundEnabled) return;
  if (opts.beep !== false) playBeep(opts.beep || [880, 1100], 0.15);
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
let _popularLastWrite = 0;
let _popularDebounce  = null;
const POPULAR_THROTTLE_MS = 5 * 60 * 1000;

async function updatePopularItems(orders) {
  const now = Date.now();
  if (now - _popularLastWrite < POPULAR_THROTTLE_MS) return;
  clearTimeout(_popularDebounce);
  _popularDebounce = setTimeout(async () => {
    try {
      const counts = {};
      orders
        .filter(o => o.status === 'paid')
        .forEach(o => {
          const items = o.batches ? o.batches.flat() : (o.items || []);
          items.forEach(i => { counts[i.name] = (counts[i.name] || 0) + i.qty; });
        });
      const top5 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);
      await api.updateMeta({ popularItems: top5 });
      _popularLastWrite = Date.now();
    } catch (_) {}
  }, 2000);
}

// ==================== Toast Notifications ====================
function showOrderToast(order) {
  const toast = document.createElement('div');
  toast.className = 'new-order-toast';
  const orderNum = order.order_num || order.orderNumber;
  const tableNum = order.table_num || order.table;
  toast.innerHTML = `
    <strong>🔔 ออเดอร์ใหม่!</strong>
    ออเดอร์ #${sanitizeNum(orderNum)} โต๊ะ ${sanitizeNum(tableNum)}
    <button type="button" class="toast-close" style="margin-left:8px">✕</button>`;
  document.body.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  setTimeout(() => toast.remove(), 8000);
}

function showBatchToast(order, batchCount) {
  const toast = document.createElement('div');
  toast.className = 'new-order-toast new-batch-toast';
  const orderNum = order.order_num || order.orderNumber;
  const tableNum = order.table_num || order.table;
  toast.innerHTML = `
    <strong>🍽 สั่งเพิ่ม!</strong>
    ออเดอร์ #${sanitizeNum(orderNum)} โต๊ะ ${sanitizeNum(tableNum)} (รอบ ${batchCount})
    <button type="button" class="toast-close" style="margin-left:8px">✕</button>`;
  document.body.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  setTimeout(() => toast.remove(), 8000);
}

// ==================== WebSocket: Real-time Listener ====================
let callLogEntries = [];
let knownCallIds   = new Set();

function startRealtimeListener() {
  if (_wsConn) { _wsConn.close(); _wsConn = null; }

  const isReconnect = knownOrderIds.size > 0;
  if (!isReconnect) {
    knownOrderIds = new Set();
    isFirstLoad   = true;
  }

  // โหลด orders ครั้งแรกผ่าน REST
  _loadOrders();

  // Subscribe realtime ผ่าน WebSocket
  _wsConn = ws.connect('admin', (msg) => {
    if (msg.type === 'new_order' || msg.type === 'order_created' || msg.type === 'order_deleted') {
      _debouncedLoadOrders({ silent: false });
    }
    if (msg.type === 'order_updated') {
      _debouncedLoadOrders({ silent: true });
    }
    if (msg.type === 'new_batch') {
      // ลูกค้าสั่งเพิ่ม → เล่นเสียงทันที + แสดง toast + reload โดยไม่เล่นเสียงซ้ำ
      playBatchAlert();
      if (msg.order) showBatchToast(msg.order, (msg.order.batches || []).length);
      _debouncedLoadOrders({ silent: true });
    }
    if (msg.type === 'call_staff') {
      _handleCallStaffMsg(msg);
    }
  }, () => {
    // WS reconnect สำเร็จ → sync orders + call log ที่อาจหายไปตอนขาดการเชื่อมต่อ
    _debouncedLoadOrders({ silent: true });
    _loadCallLog();
  });
}

// เรียกจาก WS event เท่านั้น (ไม่ใช่ polling) เพื่อป้องกันเสียงซ้อน

async function _loadOrders(opts = {}) {
  // opts.silent = true → ไม่เล่นเสียง (ใช้ตอน WS reconnect หรือ admin แก้เอง)
  const silent = opts.silent === true;
  try {
    const orders = await api.getOrders({ limit: 500 });
    const newOrders = (orders || []).map(o => ({
      ...o,
      // firebaseKey: compat alias (ใช้ o.id โดยตรง เพื่อไม่สร้าง object เพิ่ม)
      date:        o.date        || o.created_at,
      table:       o.table       || o.table_num,
      orderNumber: o.orderNumber || o.order_num,
    }));
    newOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!isFirstLoad && !silent) {
      let hasNewOrder = false;
      newOrders.forEach((o) => {
        if (!knownOrderIds.has(o.id) && o.status === 'pending') {
          hasNewOrder = true;
          showOrderToast(o);
        }
        // ไม่เช็ค batch ที่นี่ — ให้ WS new_batch event จัดการเสียงแทน
      });
      if (hasNewOrder) playOrderAlert();
    }

    knownOrderIds = new Set(newOrders.map(o => o.id));
    isFirstLoad   = false;
    allOrders     = newOrders;

    updatePopularItems(allOrders);
    renderDailySummary();
    renderOrders();
    renderTakeawayOrders();
  } catch (err) {
    console.error('_loadOrders error:', err);
  }
}

function startCallStaffListener() {
  // โหลด call log ครั้งแรก
  _loadCallLog();
}

async function _loadCallLog() {
  try {
    const entries = await api.getCallLog();
    callLogEntries = entries || [];
    updateCallLogBadge();

    callLogEntries.forEach(e => {
      if (!e.done && !knownCallIds.has(e.id)) {
        knownCallIds.add(e.id);
        showCallStaffToast(e, e.id);
        playCallAlert();
      }
    });
    if (!document.getElementById('tabCallLog')?.classList.contains('hidden')) renderCallLog();
  } catch (err) {
    console.error('_loadCallLog error:', err);
  }
}

function _handleCallStaffMsg(msg) {
  const e = msg.data || msg.entry;
  if (!e) return;
  callLogEntries = callLogEntries.filter(x => x.id !== e.id);
  callLogEntries.push(e);
  updateCallLogBadge();
  if (!e.done && !knownCallIds.has(e.id)) {
    knownCallIds.add(e.id);
    showCallStaffToast(e, e.id);
    playCallAlert();
  }
  if (!document.getElementById('tabCallLog')?.classList.contains('hidden')) renderCallLog();
}

function showCallStaffToast(data, callId) {
  const toast = document.createElement('div');
  toast.className = 'new-order-toast call-staff-toast';

  const icon   = document.createElement('strong');
  icon.textContent = '🔔 เรียกพนักงาน!';
  const tableText = document.createTextNode(
    ` โต๊ะ ${sanitizeNum(data.table_num || data.table)}` +
    (data.order_num || data.orderNumber ? ` (ออเดอร์ #${sanitizeNum(data.order_num || data.orderNumber)})` : '')
  );
  const ackBtn = document.createElement('button');
  ackBtn.type = 'button'; ackBtn.className = 'toast-ack';
  ackBtn.setAttribute('data-key', callId);
  ackBtn.textContent = '✓ รับทราบ';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';

  toast.append(icon, tableText, ' ', ackBtn, ' ', closeBtn);
  document.body.appendChild(toast);
  closeBtn.addEventListener('click', () => toast.remove());
  ackBtn.addEventListener('click', async () => {
    try {
      await api.markCallDone(callId);
      const entry = callLogEntries.find(e => e.id === callId);
      if (entry) entry.done = true;
      updateCallLogBadge();
      if (!document.getElementById('tabCallLog')?.classList.contains('hidden')) renderCallLog();
    } catch(e) {}
    toast.remove();
  });
}

// ==================== Call Log ====================
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
    .filter(e => new Date(e.created_at || e.time).toDateString() === todayStr)
    .sort((a, b) => new Date(b.created_at || b.time) - new Date(a.created_at || a.time));
  if (todayEntries.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = todayEntries.map(e => {
    const ts      = e.created_at || e.time;
    const timeStr = new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cls   = e.done ? 'call-log-item done' : 'call-log-item pending';
    const badge = e.done
      ? '<span class="call-log-status done">✓ รับทราบแล้ว</span>'
      : '<span class="call-log-status pending">🔔 รอรับทราบ</span>';
    const tableNum = e.table_num || e.table;
    return `
      <div class="${cls}">
        <div class="call-log-item-left">
          <span class="call-log-table">โต๊ะ ${sanitizeNum(tableNum)}</span>
        </div>
        <div class="call-log-item-right">
          ${badge}
          <span class="call-log-time">${timeStr}</span>
          ${!e.done ? `<button class="call-log-ack-btn" data-key="${e.id}">✓ รับทราบ</button>` : ''}
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('.call-log-ack-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.markCallDone(btn.dataset.key);
        const entry = callLogEntries.find(e => e.id === btn.dataset.key);
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
    await api.clearCallLog();
    callLogEntries = [];
    knownCallIds   = new Set();
    renderCallLog();
    updateCallLogBadge();
  } catch(err) { console.error(err); }
});

// ==================== Menu Data (for add-item modal) ====================
let allMenuData = {};

async function startMenuListener() {
  try {
    const menuData = await api.getMenu();
    allMenuData = menuData || {};
    try { localStorage.setItem('ks90-menu', JSON.stringify(allMenuData)); } catch (_) {}
  } catch (_) {}
}

// ==================== API: Actions ====================
// ── Optimistic status update ──────────────────────────────────────────────────
// อัปเดต allOrders ใน memory → re-render ทันที (ไม่รอ API)
// จากนั้น fire API ไปเบื้องหลัง ถ้า error ค่อย rollback + reload จริง
function _optimisticStatus(orderId, patch) {
  const idx = allOrders.findIndex(o => o.id === orderId);
  if (idx === -1) return null;
  const prev = { ...allOrders[idx] };          // snapshot ก่อนแก้ (ใช้ rollback)
  allOrders[idx] = { ...allOrders[idx], ...patch };
  renderDailySummary();
  renderOrders();
  renderTakeawayOrders();
  return prev;
}

async function markOrderAsPaid(orderId, paymentMethod) {
  const order = allOrders.find(o => o.id === orderId);
  const patch = { status: 'paid', ...(paymentMethod ? { payment: paymentMethod } : {}) };

  // อัปเดต UI ทันที ไม่รอ API
  const prev = _optimisticStatus(orderId, patch);

  try {
    await api.updateOrder(orderId, patch);
    // clear table mapping เพื่อให้โต๊ะได้ order number ใหม่
    const tableNum = order?.table_num || order?.table;
    if (tableNum) api.clearTable(String(tableNum)).catch(() => {});
  } catch (err) {
    console.error('markOrderAsPaid error:', err);
    // rollback: คืนค่าเดิม แล้ว reload จริง
    if (prev) { allOrders[allOrders.findIndex(o => o.id === orderId)] = prev; }
    _loadOrders();
  }
}

async function markOrderAsCooking(orderId) {
  const prev = _optimisticStatus(orderId, { status: 'cooking' });
  try {
    await api.updateOrder(orderId, { status: 'cooking' });
  } catch (err) {
    console.error('markOrderAsCooking error:', err);
    if (prev) { allOrders[allOrders.findIndex(o => o.id === orderId)] = prev; }
    _loadOrders();
  }
}

async function markOrderAsServed(orderId) {
  const prev = _optimisticStatus(orderId, { status: 'served' });
  try {
    await api.updateOrder(orderId, { status: 'served' });
  } catch (err) {
    console.error('markOrderAsServed error:', err);
    if (prev) { allOrders[allOrders.findIndex(o => o.id === orderId)] = prev; }
    _loadOrders();
  }
}

async function deleteOrder(orderId, orderNumber) {
  if (!confirm(`ลบออเดอร์ #${orderNumber} ?`)) return;
  const order = allOrders.find(o => o.id === orderId);

  // optimistic: ลบออกจาก memory ทันที
  const prevOrders = [...allOrders];
  allOrders = allOrders.filter(o => o.id !== orderId);
  renderDailySummary();
  renderOrders();
  renderTakeawayOrders();

  try {
    await api.deleteOrder(orderId);
    const tableNum = order?.table_num || order?.table;
    if (tableNum) api.clearTable(String(tableNum)).catch(() => {});
  } catch (err) {
    console.error('deleteOrder error:', err);
    allOrders = prevOrders; // rollback
    _loadOrders();
  }
}

// ==================== Products (admin add-item) ====================
function getLiveCats() {
  try {
    const raw = localStorage.getItem('ks90-categories');
    if (raw) {
      const obj = JSON.parse(raw);
      return [{ id: 'all', label: '🍽 ทั้งหมด' },
        ...Object.entries(obj).map(([id, label]) => ({ id, label }))];
    }
  } catch(_) {}
  return [
    { id: 'all',    label: '🍽 ทั้งหมด' },
    { id: 'setkao', label: '🍱 เซ็ตอาหาร' },
    { id: 'kao',    label: '🍜 อาหาร' },
    { id: 'nam',    label: '🥤 เครื่องดื่ม' },
    { id: 'coffee', label: '☕ กาแฟ' },
    { id: 'soda',   label: '🫧 โซดา' },
  ];
}

// ==================== Edit-modal inline Add Item ====================
function renderEditAddItemList() {
  const container = document.getElementById('editAddItemProductList');
  if (!container) return;

  const liveProducts = Object.values(allMenuData).filter(p => p.enabled !== false);
  const cats = getLiveCats();
  const activeCat = container.dataset.cat || 'all';
  const filtered  = activeCat === 'all' ? liveProducts : liveProducts.filter(p => p.category === activeCat);
  const allItems  = (editOrderBatches || []).flat();

  const tabsHtml = `<div class="add-item-cat-tabs">${
    cats.map(c => `<button type="button" class="add-item-cat-btn${activeCat === c.id ? ' active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`).join('')
  }</div>`;

  const gridHtml = `<div class="add-item-product-grid">${
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

  container.innerHTML = tabsHtml + gridHtml;

  container.querySelectorAll('.add-item-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.dataset.cat = btn.dataset.cat;
      renderEditAddItemList();
    });
  });

  container.querySelectorAll('.add-item-product-btn').forEach(btn => {
    btn.addEventListener('click', () => addItemToEditOrder(btn.dataset));
  });
}

function addItemToEditOrder({ name, price }) {
  if (!editOrderBatches) return;

  const lastBatch  = editOrderBatches[editOrderBatches.length - 1] || [];
  const existing   = lastBatch.find(i => i.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    lastBatch.push({ name, price: parseFloat(price), qty: 1 });
  }
  editOrderBatches[editOrderBatches.length - 1] = lastBatch;

  const toast = document.getElementById('editAddItemToastMsg');
  if (toast) {
    toast.textContent = `✅ เพิ่ม "${name}" แล้ว`;
    toast.className   = 'add-item-toast show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = 'add-item-toast'; }, 2000);
  }

  renderEditAddItemList();
  renderEditOrderBatches();
}

// ==================== Edit Order Modal ====================
let editOrderKey     = null;
let editOrderBatches = null;

const editOrderModal  = document.getElementById('editOrderModal');
const editOrderDesc   = document.getElementById('editOrderDesc');
const editBatchesEl   = document.getElementById('editOrderBatches');
const editOrderTotEl  = document.getElementById('editOrderTotal');
const editOrderError  = document.getElementById('editOrderError');
const editOrderCancel = document.getElementById('editOrderCancel');
const editOrderSave   = document.getElementById('editOrderSave');

function openEditOrderModal(orderId, order) {
  editOrderKey     = orderId;
  editOrderBatches = JSON.parse(JSON.stringify(
    order.batches || [order.items || []]
  ));
  const label = `ออเดอร์ #${order.order_num || order.orderNumber} — โต๊ะ ${order.table_num || order.table || '-'}`;
  editOrderDesc.textContent = label;
  const editAddItemDesc = document.getElementById('editAddItemDesc');
  if (editAddItemDesc) editAddItemDesc.textContent = label;
  editOrderError.textContent = '';
  showEditView('order');
  renderEditOrderBatches();
  editOrderModal.setAttribute('aria-hidden', 'false');
}

function closeEditOrderModal() {
  editOrderModal.setAttribute('aria-hidden', 'true');
  editOrderKey     = null;
  editOrderBatches = null;
}

function showEditView(view) {
  const orderView   = document.getElementById('editOrderView');
  const addItemView = document.getElementById('editAddItemView');
  if (!orderView || !addItemView) return;
  if (view === 'order') {
    orderView.classList.remove('hidden');
    addItemView.classList.add('hidden');
  } else {
    orderView.classList.add('hidden');
    addItemView.classList.remove('hidden');
    renderEditAddItemList();
  }
}

function calcEditTotal() {
  return (editOrderBatches || []).flat().reduce((s, i) => s + i.price * i.qty, 0);
}

function renderEditOrderBatches() {
  if (!editBatchesEl) return;

  editBatchesEl.innerHTML = editOrderBatches.map((batch, bIdx) => {
    const batchLabel = editOrderBatches.length > 1 ? `รอบที่ ${bIdx + 1}` : 'รายการ';
    const rowsHtml = batch.map((item, iIdx) => `
      <div class="edit-item-row" data-batch="${bIdx}" data-item="${iIdx}">
        <div class="edit-item-name">
          ${escapeHtml(item.name)}
          ${item.option ? `<span class="edit-item-option"> · ${escapeHtml(item.option)}</span>` : ''}
        </div>
        <div class="edit-item-controls">
          <button type="button" class="edit-qty-btn edit-qty-dec" data-batch="${bIdx}" data-item="${iIdx}" title="ลด">−</button>
          <span class="edit-qty-num">${item.qty}</span>
          <button type="button" class="edit-qty-btn edit-qty-inc" data-batch="${bIdx}" data-item="${iIdx}" title="เพิ่ม">+</button>
          <span class="edit-item-price">${formatMoney(item.price * item.qty)}</span>
          <button type="button" class="edit-del-btn" data-batch="${bIdx}" data-item="${iIdx}" title="ลบรายการนี้">🗑</button>
        </div>
      </div>
    `).join('');

    const batchTotal = batch.reduce((s, i) => s + i.price * i.qty, 0);
    return `
      <div class="edit-batch-group">
        ${editOrderBatches.length > 1
          ? `<div class="edit-batch-label">🍽 ${escapeHtml(batchLabel)}</div>`
          : ''}
        <div class="edit-batch-items">
          ${batch.length === 0
            ? `<p class="edit-batch-empty">— ลบหมดแล้ว (บันทึกเพื่อยืนยัน) —</p>`
            : rowsHtml}
        </div>
        ${editOrderBatches.length > 1 && batch.length > 0
          ? `<div class="edit-batch-subtotal">รอบนี้: ${formatMoney(batchTotal)}</div>`
          : ''}
      </div>`;
  }).join('');

  editOrderTotEl.innerHTML =
    `<span>รวมทั้งหมด</span><span class="edit-total-amt">${formatMoney(calcEditTotal())}</span>`;

  editBatchesEl.querySelectorAll('.edit-qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = +btn.dataset.batch, i = +btn.dataset.item;
      if (editOrderBatches[b][i].qty > 1) {
        editOrderBatches[b][i].qty -= 1;
      } else {
        editOrderBatches[b].splice(i, 1);
      }
      renderEditOrderBatches();
    });
  });
  editBatchesEl.querySelectorAll('.edit-qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = +btn.dataset.batch, i = +btn.dataset.item;
      editOrderBatches[b][i].qty += 1;
      renderEditOrderBatches();
    });
  });
  editBatchesEl.querySelectorAll('.edit-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = +btn.dataset.batch, i = +btn.dataset.item;
      if (!confirm(`ลบ "${editOrderBatches[b][i].name}" ออกจากออเดอร์?`)) return;
      editOrderBatches[b].splice(i, 1);
      renderEditOrderBatches();
    });
  });
}

editOrderSave?.addEventListener('click', async () => {
  if (!editOrderKey) return;

  const totalItems = editOrderBatches.flat().length;
  if (totalItems === 0) {
    editOrderError.textContent = '⚠️ ต้องมีอย่างน้อย 1 รายการ — ใช้ปุ่ม "ลบออเดอร์" แทน';
    return;
  }

  editOrderError.textContent = '';
  editOrderSave.disabled = true;
  editOrderSave.textContent = 'กำลังบันทึก...';

  try {
    const newTotal = calcEditTotal();
    await api.updateOrder(editOrderKey, {
      batches: editOrderBatches,
      total:   newTotal,
    });
    closeEditOrderModal();
    _loadOrders();
  } catch (err) {
    console.error('editOrderSave error:', err);
    editOrderError.textContent = '❌ บันทึกไม่สำเร็จ: ' + err.message;
  } finally {
    editOrderSave.disabled = false;
    editOrderSave.textContent = '💾 บันทึก';
  }
});

editOrderCancel?.addEventListener('click', closeEditOrderModal);
editOrderModal?.addEventListener('click', (e) => { if (e.target === editOrderModal) closeEditOrderModal(); });

document.getElementById('editOpenAddView')?.addEventListener('click', () => showEditView('add'));
document.getElementById('editBackToOrder')?.addEventListener('click', () => showEditView('order'));

// ==================== Render Summary ====================
function renderDailySummary() {
  const paidToday    = allOrders.filter((o) => o.status === 'paid' && isToday(o.created_at || o.date));
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
}

// ==================== Render Orders ====================
function getTakeawayIdsAdmin() { return getTakeawaySlots(); }

function renderOrders() {
  if (!document.getElementById('tableFilterBar')) {
    const bar = document.createElement('div');
    bar.id = 'tableFilterBar';
    bar.className = 'table-filter-bar';
    bar.innerHTML = `
      <input type="search" class="table-filter-input" id="tableFilterInput"
        placeholder="🔍 กรองโต๊ะ... (เช่น 3)" maxlength="20" autocomplete="off">
      <button type="button" class="btn btn-outline table-filter-clear hidden" id="tableFilterClear">✕ ล้าง</button>`;
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

  const baseOrders = allOrders.filter(o => {
    const tbl = String(o.table_num || o.table || '');
    return !getTakeawayIdsAdmin().includes(tbl) && !o.takeaway;
  });
  const nonTaOrders = tableFilter
    ? baseOrders.filter(o => String(o.table_num || o.table).includes(tableFilter))
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
    const fromQR   = order.source === 'qr';
    const tableNum = order.table_num || order.table;
    const orderNum = order.order_num || order.orderNumber;
    const dateStr  = order.created_at || order.date;
    const orderId  = order.id;

    let actionBtns = '';
    if (s === 'pending') {
      actionBtns = `<button type="button" class="btn-cooking" data-key="${orderId}">👨‍🍳 รับออเดอร์</button>`;
    } else if (s === 'cooking') {
      actionBtns = `<button type="button" class="btn-served" data-key="${orderId}">🍽 เสิร์ฟแล้ว</button>`;
    } else if (s === 'served') {
      actionBtns = `<button type="button" class="btn-paid" data-key="${orderId}">✅ จ่ายแล้ว</button><button type="button" class="btn-print-receipt" data-key="${orderId}">🖨 ปริ้น</button>`;
    } else if (s === 'paid') {
      actionBtns = `<button type="button" class="btn-print-receipt" data-key="${orderId}">🖨 ปริ้น</button>`;
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
        </div>
      `;
    }).join('');

    return `
      <article class="order-card order-card--${statusCls}" data-key="${orderId}">
        <div class="order-card-header">
          <div class="order-card-header-row">
            <h3 class="order-card-title">
              ออเดอร์ #${escapeHtml(String(orderNum))}
              ${tableNum ? `<span class="order-table-chip">โต๊ะ ${escapeHtml(String(tableNum))}</span>` : ''}
              ${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}
              ${fromQR ? `<span class="order-qr-badge">📱 QR</span>` : ''}
              ${order.payment ? `<span class="order-payment-badge">${{ cash:'💵 เงินสด', qr:'📱 QR', credit:'💳 บัตร', transfer:'🏦 โอน' }[order.payment] || order.payment}</span>` : ''}
            </h3>
            <span class="status-badge ${statusCls}">${statusLabel}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(dateStr)}</span>
            <div class="order-actions">
              ${actionBtns}
              <button type="button" class="btn-edit-order" data-key="${orderId}">✏️ แก้ไข</button>
              <button type="button" class="btn-delete" data-key="${orderId}" data-num="${escapeHtml(String(orderNum))}">ลบ</button>
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
    btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key, null));
  });
  ordersList.querySelectorAll('.btn-edit-order').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => (o.id) === btn.dataset.key);
      if (order) openEditOrderModal(btn.dataset.key, order);
    });
  });
  ordersList.querySelectorAll('.btn-print-receipt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => (o.id) === btn.dataset.key);
      if (order) printOrderReceipt(order);
    });
  });
  ordersList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num));
  });
  bindBillButtons(ordersList);
  injectMergeBillBtn();
}

// ==================== Tabs ====================
const tabTakeaway = document.getElementById('tabTakeaway');
const tabCallLog  = document.getElementById('tabCallLog');

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tabId)
  );
  tabRecent.classList.toggle('hidden',   tabId !== 'recent');
  tabTakeaway.classList.toggle('hidden', tabId !== 'takeaway');
  tabCallLog.classList.toggle('hidden',  tabId !== 'calllog');
  if (tabId === 'takeaway') renderTakeawayQrPanel();
  if (tabId === 'calllog')  renderCallLog();
}

// ==================== Takeaway QR Panel ====================
const TA_STORAGE_KEY  = 'ta-base-url';
const TA_COUNT_KEY    = 'ta-slot-count';
const TA_MIN_SLOTS    = 1;
const TA_MAX_SLOTS    = 20;

function getTaCount() {
  return Math.max(TA_MIN_SLOTS, Math.min(TA_MAX_SLOTS, parseInt(localStorage.getItem(TA_COUNT_KEY) || '3', 10)));
}
function setTaCount(n) {
  localStorage.setItem(TA_COUNT_KEY, String(Math.max(TA_MIN_SLOTS, Math.min(TA_MAX_SLOTS, n))));
}
function getTakeawaySlots() {
  return Array.from({ length: getTaCount() }, (_, i) => 'takeaway' + (i + 1));
}
function getTakeawayLabel(slotId) {
  const n = slotId.replace('takeaway', '');
  return 'ลิงก์ที่ ' + n;
}

function getTakeawayUrl(slotId) {
  let base = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/');
  if (!base.endsWith('/')) base += '/';
  return base + 'customer.html?table=' + slotId;
}

let qrInstances = {};

function renderTakeawayQrPanel() {
  const container = document.getElementById('takeawayQrSlots');
  if (!container) return;

  // ไม่ cache ด้วย dataset.rendered — ให้ re-render ทุกครั้งที่กลับมาแท็บ Takeaway
  // เพื่อให้ QR สะท้อน URL ปัจจุบันเสมอ
  Object.values(qrInstances).forEach(qr => { try { qr.clear?.(); } catch (_) {} });
  qrInstances = {};

  const savedBase = localStorage.getItem(TA_STORAGE_KEY) || (location.origin + '/');

  container.innerHTML = `
    <div class="ta-url-row">
      <label class="ta-url-label">🌐 URL ฐาน (แก้ครั้งเดียวใช้ทุกลิงก์)</label>
      <div class="ta-url-input-row">
        <input type="text" id="taBaseUrl" class="field-input ta-url-input" value="${escapeHtml(savedBase)}" placeholder="https://yoursite.com/">
        <button type="button" class="btn btn-primary ta-url-apply-btn" id="taApplyBtn">🔄 อัปเดต QR</button>
      </div>
    </div>
    <div class="ta-slot-count-row">
      <span class="ta-slot-count-label">📦 จำนวนลิงก์กลับบ้าน</span>
      <div class="ta-slot-count-ctrl">
        <button type="button" class="ta-count-btn" id="taCountMinus">−</button>
        <span class="ta-count-num" id="taCountNum">${getTaCount()}</span>
        <button type="button" class="ta-count-btn" id="taCountPlus">＋</button>
      </div>
    </div>
    <div class="ta-slots-grid" id="taSlotsGrid"></div>
  `;

  renderTaSlots();

  document.getElementById('taCountMinus').addEventListener('click', () => {
    const cur = getTaCount();
    if (cur <= TA_MIN_SLOTS) return;
    setTaCount(cur - 1);
    document.getElementById('taCountNum').textContent = getTaCount();
    renderTaSlots();
  });
  document.getElementById('taCountPlus').addEventListener('click', () => {
    const cur = getTaCount();
    if (cur >= TA_MAX_SLOTS) return;
    setTaCount(cur + 1);
    document.getElementById('taCountNum').textContent = getTaCount();
    renderTaSlots();
  });

  document.getElementById('taApplyBtn').addEventListener('click', () => {
    const val = document.getElementById('taBaseUrl').value.trim();
    if (!val) return;
    localStorage.setItem(TA_STORAGE_KEY, val);

    getTakeawaySlots().forEach((slotId) => {
      const url   = getTakeawayUrl(slotId);
      const boxEl = document.getElementById(`taQrBox_${slotId}`);
      const urlEl = boxEl?.parentElement?.querySelector('.ta-qr-url');
      const copyBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-copy-btn');
      const printBtn = boxEl?.closest('.ta-qr-card')?.querySelector('.ta-print-btn');

      if (urlEl) urlEl.textContent = url;
      if (copyBtn) copyBtn.dataset.url = url;

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

      if (printBtn) {
        const newPrintBtn = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
        newPrintBtn.addEventListener('click', () => {
          const freshUrl = getTakeawayUrl(slotId);
          const idx = newPrintBtn.dataset.idx;
          _openPrintWindow(freshUrl, idx);
        });
      }

      if (copyBtn) {
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        newCopyBtn.dataset.url = url;
        newCopyBtn.addEventListener('click', () => _copyUrl(newCopyBtn));
      }
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
  }).catch(() => {
    prompt('คัดลอกลิงก์:', btn.dataset.url);
  });
}

function _openPrintWindow(url, idx) {
  const win = window.open('', '_blank', 'width=400,height=580');
  const safeUrl = JSON.stringify(url);
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

  getTakeawaySlots().forEach((slotId, idx) => {
    const url    = getTakeawayUrl(slotId);
    const label  = getTakeawayLabel(slotId);
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

  grid.querySelectorAll('.ta-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => _copyUrl(btn));
  });
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

  const taOrders = allOrders.filter(o => {
    const tbl = String(o.table_num || o.table || '');
    return getTakeawaySlots().includes(tbl) || o.takeaway === true || o.is_takeaway;
  });

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
    const tableNum = order.table_num || order.table;
    const orderNum = order.order_num || order.orderNumber;
    const dateStr  = order.created_at || order.date;
    const orderId  = order.id;

    let actionBtns = '';
    if (s === 'pending') {
      actionBtns = `<button type="button" class="btn-cooking" data-key="${orderId}">👨‍🍳 รับออเดอร์</button>`;
    } else if (s === 'cooking') {
      actionBtns = `<button type="button" class="btn-served" data-key="${orderId}">📦 พร้อมส่ง</button>`;
    } else if (s === 'served') {
      actionBtns = `<button type="button" class="btn-paid" data-key="${orderId}">✅ จ่ายแล้ว</button><button type="button" class="btn-print-receipt" data-key="${orderId}">🖨 ปริ้น</button>`;
    } else if (s === 'paid') {
      actionBtns = `<button type="button" class="btn-print-receipt" data-key="${orderId}">🖨 ปริ้น</button>`;
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

    const slotNum = String(tableNum).replace('takeaway', '') || '-';

    return `
      <article class="order-card order-card--${statusCls} order-card--takeaway" data-key="${orderId}">
        <div class="order-card-header">
          <div class="order-card-header-row">
            <h3 class="order-card-title">
              ออเดอร์ #${escapeHtml(String(orderNum))}
              <span class="order-table-chip order-table-chip--takeaway">📦 กลับบ้าน (ลิงก์ ${escapeHtml(slotNum)})</span>
              ${batches.length > 1 ? `<span class="order-batch-chip">${batches.length} รอบ</span>` : ''}
            </h3>
            <span class="status-badge ${statusCls}">${statusLabel}</span>
          </div>
          <div class="order-card-header-row">
            <span class="order-card-date">${formatDate(dateStr)}</span>
            <div class="order-actions">
              ${actionBtns}
              <button type="button" class="btn-edit-order" data-key="${orderId}">✏️ แก้ไข</button>
              <button type="button" class="btn-delete" data-key="${orderId}" data-num="${escapeHtml(String(orderNum))}">ลบ</button>
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
    btn.addEventListener('click', () => markOrderAsPaid(btn.dataset.key, null));
  });
  taList.querySelectorAll('.btn-print-receipt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = allOrders.find(o => (o.id) === btn.dataset.key);
      if (order) printOrderReceipt(order);
    });
  });
  taList.querySelectorAll('.btn-edit-order').forEach((btn) => {
    const order = allOrders.find(o => (o.id) === btn.dataset.key);
    btn.addEventListener('click', () => { if (order) openEditOrderModal(btn.dataset.key, order); });
  });
  taList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num));
  });
}

// ==================== Auth Events ====================
function checkAuth() {
  if (apiIsLoggedIn()) {
    sessionStorage.setItem(AUTH_KEY, 'true');
    showScreen(dashboardScreen);
    // unlock audio ทันทีที่ dashboard โหลด (user เคย interact ไปแล้วตอน login ก่อนหน้า)
    // ต้องใช้ setTimeout เล็กน้อยให้ DOM พร้อมก่อน
    setTimeout(() => unlockIOSSpeech(), 100);
    startRealtimeListener();
    startCallStaffListener();
    startMenuListener();
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
    // ส่ง username:password ไปตรวจกับ Worker ผ่าน api-client.js
    const ok = await adminLogin(user, pass);
    if (ok) {
      resetAttempts();
      setLoggedIn(true);
      unlockIOSSpeech();
      showScreen(dashboardScreen);
      startRealtimeListener();
      startCallStaffListener();
      startMenuListener();
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
  adminLogout();
  setLoggedIn(false);
  if (_wsConn) { _wsConn.close(); _wsConn = null; }
  allOrders = [];
  knownOrderIds = new Set();
  knownCallIds  = new Set();
  showScreen(loginScreen);
  usernameInput.value    = '';
  passwordInput.value    = '';
  loginError.textContent = '';
});

document.querySelectorAll('.tab-btn').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ==================== Dark Mode ====================
applyTheme(getTheme());
document.getElementById('darkToggleBtn')?.addEventListener('click', toggleTheme);

// ==================== Sound Toggle + Mode ====================
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundControl   = document.getElementById('soundControl');

function updateSoundBtnLabel() {
  if (!soundToggleBtn) return;
  if (!soundEnabled) {
    soundToggleBtn.textContent = '🔕';
    soundToggleBtn.classList.add('muted');
    soundToggleBtn.title = 'เสียงปิดอยู่ • กดเพื่อเปิด';
  } else {
    soundToggleBtn.textContent = '🔔';
    soundToggleBtn.classList.remove('muted');
    const modeLabel = soundMode === 'beep' ? 'Effect' : 'คนพูด';
    soundToggleBtn.title = `เสียง: ${modeLabel} • กดค้างเพื่อเลือกโหมด`;
  }
}

function applySoundMode(mode) {
  soundMode = mode;
  localStorage.setItem('soundMode', mode);
  document.querySelectorAll('.sound-dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.mode === mode);
  });
  updateSoundBtnLabel();
}
applySoundMode(soundMode);

let _longPressTimer = null;
let _didOpenDropdown = false;
const LONG_PRESS_MS = 400;

function openSoundDropdown(e) {
  if (e?.stopPropagation) e.stopPropagation();
  unlockIOSSpeech();
  _didOpenDropdown = true;
  soundControl?.classList.add('open');

  const dropdown = document.getElementById('soundDropdown');
  const btn = soundToggleBtn;
  if (!dropdown || !btn) return;
  const rect = btn.getBoundingClientRect();
  const dropW = 145;
  const gap = 6;
  let top = rect.bottom + gap;
  let left = rect.right - dropW;
  if (left < 8) left = rect.left;
  if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
  dropdown.style.top  = `${top}px`;
  dropdown.style.left = `${left}px`;
}

function closeSoundDropdown() {
  soundControl?.classList.remove('open');
}

if (soundToggleBtn) {
  soundToggleBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openSoundDropdown(e);
  });

  soundToggleBtn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    _didOpenDropdown = false;
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      openSoundDropdown(e);
    }, LONG_PRESS_MS);
  });

  soundToggleBtn.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    const wasShortClick = !!_longPressTimer;
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
    if (_didOpenDropdown) return;
    if (!wasShortClick) return;
    unlockIOSSpeech();
    soundEnabled = !soundEnabled;
    if (!soundEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    updateSoundBtnLabel();
    if (soundEnabled) {
      if (soundMode === 'beep') playBeep([880, 1047], 0.18);
      else speak('เสียงเปิดแล้วจ้า');
    }
  });

  soundToggleBtn.addEventListener('mouseleave', () => {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  });

  soundToggleBtn.addEventListener('touchstart', (e) => {
    _didOpenDropdown = false;
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      openSoundDropdown(e);
    }, LONG_PRESS_MS);
  }, { passive: true });

  soundToggleBtn.addEventListener('touchend', () => {
    const wasShortTap = !!_longPressTimer;
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
    if (_didOpenDropdown) return;
    if (!wasShortTap) return;
    unlockIOSSpeech();
    soundEnabled = !soundEnabled;
    if (!soundEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    updateSoundBtnLabel();
    if (soundEnabled) {
      if (soundMode === 'beep') playBeep([880, 1047], 0.18);
      else speak('เสียงเปิดแล้วจ้า');
    }
  });

  soundToggleBtn.addEventListener('touchcancel', () => {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  });
}

document.querySelectorAll('.sound-dropdown-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockIOSSpeech();
    const mode = item.dataset.mode;
    if (!soundEnabled) { soundEnabled = true; }
    applySoundMode(mode);
    closeSoundDropdown();
    if (mode === 'beep') playBeep([880, 1047, 1319], 0.18);
    else speak('เสียงคนพูดจ้า');
  });
});

document.addEventListener('click', (e) => {
  if (!soundControl?.contains(e.target)) closeSoundDropdown();
});

// ==================== Init ====================
checkAuth();
initBillFeature({
  getOrders:        () => allOrders,
  markOrderAsPaid,
  printOrderReceipt,
  formatMoney,
  escapeHtml,
  // ส่ง api แทน firebaseUtils
  apiUtils: { api },
});

// ==================== Print Receipt (admin) ====================
function printOrderReceipt(order) {
  const batches  = order.batches || [order.items || []];
  const dateStr  = new Date(order.created_at || order.date).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const tableNum = order.table_num || order.table;
  const orderNum = order.order_num || order.orderNumber;

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
<title>ใบเสร็จ #${escapeHtml(String(orderNum))}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: 58mm auto; margin: 1mm 4mm 1mm 3mm; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body{
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt; font-weight: normal; color: #000 !important;
    background: #fff; width: 51mm;
    -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset;
    font-smooth: never; text-rendering: optimizeSpeed;
  }
  *, *::before, *::after { color: #000 !important; border-color: #000 !important; }
  .r-header{ text-align:center; margin-bottom:3pt; }
  .r-shop{ font-size:11.5pt; font-weight:bold; margin-bottom:1pt; }
  .r-sub{ font-size:8pt; }
  hr.r-div{ border:none; border-top: 1px solid #000 !important; margin:3pt 0; }
  .r-meta{ font-size:8.5pt; }
  .r-meta-row{ display:flex; justify-content:space-between; padding:1pt 0; }
  table{ width:100%; border-collapse:collapse; font-size:8.5pt; }
  .col-name{ width:65%; padding:1.5pt 0; vertical-align:top; word-break:break-word; }
  .col-price{ width:35%; text-align:right; padding:1.5pt 0; vertical-align:top; white-space:nowrap; }
  .batch-sep{ text-align:center; font-size:7.5pt; padding:2pt 0 1pt; }
  .r-total{ display:flex; justify-content:space-between; font-size:11pt; font-weight:bold; margin:3pt 0 2pt; padding-top:3pt; border-top: 1.5px solid #000 !important; }
  .r-qr-section{ text-align:center; margin:5pt 0 2pt; }
  .r-qr-label{ font-size:8.5pt; font-weight:bold; margin-bottom:3pt; }
  .r-qr-img{ width:40mm; height:40mm; object-fit:contain; display:block; margin:0 auto; image-rendering: pixelated !important; image-rendering: -moz-crisp-edges !important; image-rendering: crisp-edges !important; opacity: 1 !important; filter: none !important; transform: translateZ(0); }
  .r-qr-hint{ font-size:8pt; margin-top:3pt; }
  .r-footer{ text-align:center; font-size:8pt; margin-top:3pt; }
  .no-print{ display:flex; justify-content:center; gap:8px; margin-top:12pt; }
  .no-print button{ font-family:'Sarabun',sans-serif; font-size:10pt; padding:6px 18px; border-radius:6px; cursor:pointer; border:1.5px solid #333 !important; background:#fff; color:#000 !important; }
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
  <div class="r-meta-row"><span class="r-meta-label">ออเดอร์</span><span><strong>#${escapeHtml(String(orderNum))}</strong></span></div>
  <div class="r-meta-row"><span class="r-meta-label">โต๊ะ</span><span>${escapeHtml(String(tableNum || '-'))}</span></div>
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
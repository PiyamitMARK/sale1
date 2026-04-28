/**
 * ข้าวซอย 90 — Customer Order Page
 * ลูกค้าสแกน QR → เปิดหน้านี้พร้อม ?table=N → สั่งอาหารได้เลย
 *
 * ระบบใหม่: 1 โต๊ะ = 1 Order Number จนกว่าจะจ่ายเงิน
 *   - ถ้าโต๊ะมี order active → เพิ่ม batch ต่อท้าย order เดิม
 *   - ถ้าไม่มี → สร้าง order ใหม่
 */

import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, update, get, onValue, set, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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

signInAnonymously(auth).catch(err => console.error('Auth:', err));

// ==================== เมนู ====================
const IMG = (n) => 'images/img' + n + '.png';

const PRODUCTS = {
  kao: [
    { id:'kao1', name:'ข้าวซอยน่องไก่',      price:70, img:IMG(111),   productType:'kaosoi' },
    { id:'kao2', name:'ข้าวซอยหมูทอด',       price:70, img:IMG(1007),  productType:'kaosoi' },
    { id:'kao3', name:'น้ำเงี้ยว',            price:60, img:IMG(555),   productType:'namngiao' },
    { id:'kao4', name:'ข้าวหมูทอด',           price:50, img:IMG(7667),  productType:'kaomutod' },
    { id:'kao5', name:'แคบหมู',               price:15, img:IMG(98789), productType:'simple' },
    { id:'kao6', name:'ไข่ต้ม',               price:10, img:IMG(1090),  productType:'simple' },
  ],
  nam: [
    { id:'nam1',  name:'น้ำเปล่า',       price:10, img:IMG(60),  productType:'simple' },
    { id:'nam2',  name:'โค๊ก',           price:15, img:IMG(80),  productType:'simple' },
    { id:'nam3',  name:'สไปร์ท',         price:15, img:IMG(345), productType:'simple' },
    { id:'nam4',  name:'มะพร้าวปั่น',    price:45, img:IMG(333), productType:'mapraopun' },
    { id:'nam5',  name:'ชาไทย',          price:40, img:IMG(1),   productType:'drink-brew' },
    { id:'nam6',  name:'ชาดำเย็น',       price:40, img:IMG(5),   productType:'drink-brew' },
    { id:'nam7',  name:'ชามะนาว',        price:40, img:IMG(13),  productType:'drink-brew' },
    { id:'nam8',  name:'นมชมพู',         price:40, img:IMG(14),  productType:'drink-brew' },
    { id:'nam9',  name:'โกโก้',          price:40, img:IMG(9),   productType:'drink-brew' },
    { id:'nam10', name:'มัทฉะมะพร้าว',   price:60, img:IMG(15),  productType:'drink-brew' },
    { id:'nam11', name:'มัทฉะลาเต้',     price:60, img:IMG(3),   productType:'drink-brew' },
    { id:'nam12', name:'เพียวมัทฉะ',     price:55, img:IMG(2),   productType:'drink-brew' },
  ],
  coffee: [
    { id:'coffee1', name:'เอสเปรสโซ่',         price:55, img:IMG(12), productType:'drink-brew' },
    { id:'coffee2', name:'คาปูชิโน่',           price:55, img:IMG(7),  productType:'drink-brew' },
    { id:'coffee3', name:'ลาเต้',               price:55, img:IMG(4),  productType:'drink-brew' },
    { id:'coffee4', name:'มอคค่า',              price:55, img:IMG(12), productType:'drink-brew' },
    { id:'coffee5', name:'อเมริกาโน่',           price:45, img:IMG(5),  productType:'drink-brew' },
    { id:'coffee6', name:'อเมริกาโน่มะพร้าว',   price:60, img:IMG(6),  productType:'drink-brew' },
    { id:'coffee7', name:'อเมริกาโน่น้ำผึ้ง',   price:60, img:IMG(5),  productType:'drink-brew' },
    { id:'coffee8', name:'อเมริกาโน่ส้ม',       price:60, img:IMG(8),  productType:'drink-brew' },
  ],
  soda: [
    { id:'soda1', name:'แดงมะนาวโซดา',      price:35, img:IMG(23), productType:'drink-ready' },
    { id:'soda2', name:'บลูฮาวายมะนาวโซดา', price:35, img:IMG(26), productType:'drink-ready' },
    { id:'soda3', name:'แอปเปิ้ลโซดา',      price:35, img:IMG(24), productType:'drink-ready' },
    { id:'soda4', name:'ส้มโซดา',           price:35, img:IMG(25), productType:'drink-ready' },
    { id:'soda5', name:'สตรอเบอร์รี่โซดา',  price:35, img:IMG(30), productType:'drink-ready' },
    { id:'soda6', name:'บลูเบอร์รี่โซดา',   price:35, img:IMG(21), productType:'drink-ready' },
  ],
};

const TOPPING_PRICES = { 'เพิ่มไข่ดาว +฿5': 5, 'เพิ่มไข่ต้ม +฿8': 8 };

// ==================== Option Configs แยกตาม productType ====================
// productType: 'food' | 'drink-brew' | 'drink-ready' | 'simple'
// food        = อาหาร → เผ็ด + ท็อปปิ้ง + หมายเหตุ
// drink-brew  = ชง (กาแฟ, ชา, มัทฉะ) → ร้อน/เย็น + ความหวาน + extra + หมายเหตุ
// drink-ready = น้ำขวด/กระป๋อง/สำเร็จรูป → ไม่มี option (แค่ qty + note)
// simple      = เมนูเดี่ยวไม่มีตัวเลือก (แคบหมู ไข่ต้ม) → qty เท่านั้น

const OPTION_CONFIGS = {
  'kaosoi': {
    groups: [
      {
        id: 'topping', label: '🍳 เพิ่มเติม', type: 'multi',
        choices: [
          { value: 'เพิ่มเนื้อสัตว์ +฿20', label: 'เพิ่มเนื้อสัตว์ +฿20',  price: 20 },
          { value: 'เพิ่มเส้น +฿10', label: 'เพิ่มเส้น +฿10',  price: 10 },
          { value: 'เพิ่มผักดอง',         label: 'เพิ่มผักดอง' },
          { value: 'เพิ่มมะนาว',        label: 'เพิ่มมะนาว' },
          { value: 'เพิ่มหอมแดง',        label: 'เพิ่มหอมแดง' },
          { value: 'เพิ่มกรอบ',           label: 'เพิ่มกรอบ' },
        ],
      },
    ],
    hasNote: true,
  },
  'namngiao': {
    groups: [
      {
        id: 'topping', label: '🍳 เพิ่มเติม', type: 'multi',
        choices: [
          { value: 'เพิ่มเส้น +฿10', label: 'เพิ่มเส้น +฿10',  price: 10 },
          { value: 'เพิ่มผัก',         label: 'เพิ่มผัก' },
          { value: 'เพิ่มมะนาว',        label: 'เพิ่มมะนาว' },
          { value: 'เพิ่มผักดอง',         label: 'เพิ่มผักดอง' },
          { value: 'ไม่เอาเลือด',           label: 'ไม่เอาเลือด' },
        ],
      },
    ],
    hasNote: true,
  },
  'kaomutod': {
    groups: [
      {
        id: 'topping', label: '🍳 เพิ่มเติม', type: 'multi',
        choices: [
          { value: 'พิเศษ +฿10', label: 'พิเศษ +฿10',  price: 10 },
          { value: 'เพิ่มน้ำจิ้ม',         label: 'เพิ่มน้ำจิ้ม' },
        ],
      },
    ],
    hasNote: true,
  },
  'mapraopun': {
    groups: [
      {
        id: 'sweet', label: '🍬 ความหวาน', type: 'single',
        defaultValue: '',
        choices: [
          { value: '',         label: 'ปกติ' },
          { value: 'หวานน้อย',  label: 'หวานน้อย' },
          { value: 'หวานมาก',  label: 'หวานมาก' },
          { value: 'ไม่หวาน',  label: 'ไม่หวาน' },
        ],
      },
    ],
    hasNote: true,
  },
  'food': {
    groups: [
      {
        id: 'spice', label: '🌶 ระดับความเผ็ด', type: 'single',
        defaultValue: '',
        choices: [
          { value: '',        label: 'ปกติ' },
          { value: 'ไม่เผ็ด',   label: 'ไม่เผ็ด' },
          { value: 'เผ็ดน้อย',  label: 'เผ็ดน้อย' },
          { value: 'เผ็ดมาก',  label: 'เผ็ดมาก' },
          { value: 'เผ็ดพิเศษ', label: 'เผ็ดพิเศษ' },
        ],
      },
      {
        id: 'topping', label: '🍳 เพิ่มท็อปปิ้ง', type: 'multi',
        choices: [
          { value: 'เพิ่มไข่ดาว +฿5', label: 'ไข่ดาว +฿5',  price: 5 },
          { value: 'เพิ่มไข่ต้ม +฿8', label: 'ไข่ต้ม +฿8',  price: 8 },
          { value: 'เพิ่มหมู',         label: 'เพิ่มหมู' },
          { value: 'เพิ่มกุ้ง',        label: 'เพิ่มกุ้ง' },
          { value: 'ไม่ใส่ผัก',        label: 'ไม่ใส่ผัก' },
          { value: 'พิเศษ',           label: 'พิเศษ' },
        ],
      },
    ],
    hasNote: true,
  },
  'drink-brew': {
    groups: [
      {
        id: 'temp', label: '🌡 ร้อน / เย็น', type: 'single',
        defaultValue: 'เย็น',
        choices: [
          { value: 'ร้อน',   label: '☕ ร้อน', price: 10 },
          { value: 'เย็น',   label: '🧊 เย็น' },
          { value: 'ปั่น +฿10',   label: '🥤 ปั่น +฿10',  price: 10 },
        ],
      },
      {
        id: 'sweet', label: '🍬 ความหวาน', type: 'single',
        defaultValue: '',
        choices: [
          { value: '',         label: 'ปกติ' },
          { value: 'หวานน้อย',  label: 'หวานน้อย' },
          { value: 'หวานมาก',  label: 'หวานมาก' },
          { value: 'ไม่หวาน',  label: 'ไม่หวาน' },
        ],
      },
      {
        id: 'extra', label: '✨ เพิ่มเติม', type: 'multi',
        choices: [
          { value: 'ไม่ใส่นม',    label: 'ไม่ใส่นม' },
          { value: 'นมข้นเพิ่ม', label: 'นมข้นเพิ่ม' },
          { value: 'ช็อตพิเศษ',  label: 'ช็อตพิเศษ' },
          { value: 'ไม่ใส่น้ำแข็ง', label: 'ไม่ใส่น้ำแข็ง' },
        ],
      },
    ],
    hasNote: true,
  },
  'drink-ready': {
    groups: [],
    hasNote: true,
  },
  'simple': {
    groups: [],
    hasNote: false,
  },
};

// ==================== State ====================
let tableNum      = null;
let currentCat    = 'kao';
let cart          = [];
let pendingProduct = null;
let optionQty     = 1;

// สถานะ order ปัจจุบันของโต๊ะ
let activeOrderKey    = null; // Firebase key ของ order ที่ยังไม่ได้จ่าย
let activeOrderNumber = null; // order number ที่ active

// ==================== Cart Persistence (sessionStorage) ====================
// เก็บตะกร้าไว้ใน sessionStorage แยกตามโต๊ะ
// → กดรีหน้า / เน็ตหลุดแล้วกลับมา → ตะกร้าคืนมาได้
function cartStorageKey(t) { return 'cart_t' + t; }

function saveCart() {
  if (!tableNum) return;
  try {
    if (cart.length > 0) {
      sessionStorage.setItem(cartStorageKey(tableNum), JSON.stringify(cart));
    } else {
      sessionStorage.removeItem(cartStorageKey(tableNum));
    }
  } catch (_) {}
}

function loadCart() {
  if (!tableNum) return;
  try {
    const raw = sessionStorage.getItem(cartStorageKey(tableNum));
    if (raw) cart = JSON.parse(raw);
  } catch (_) { cart = []; }
}

function clearSavedCart() {
  if (!tableNum) return;
  try { sessionStorage.removeItem(cartStorageKey(tableNum)); } catch (_) {}
}

// ==================== Helpers ====================
function fmt(n) {
  return '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==================== Init: Read URL param ====================
async function init() {
  const params = new URLSearchParams(location.search);
  const t      = parseInt(params.get('table'), 10);

  if (!t || t < 1 || t > 99) {
    show('invalidScreen');
    return;
  }

  tableNum = t;
  show('mainScreen');
  document.getElementById('tableLabel').textContent     = `โต๊ะ ${tableNum}`;
  document.getElementById('cartTableLabel').textContent = `โต๊ะ ${tableNum}`;

  // ─── โหลดตะกร้าที่ค้างไว้ (กรณีรีหน้า / เน็ตหลุด) ───
  loadCart();

  // ตรวจ order active ของโต๊ะ
  await checkActiveOrder();

  // เริ่ม watch สถานะครัว
  if (activeOrderKey) startKitchenStatusWatcher(activeOrderKey);

  renderProducts();
  bindCats();
  updateCartBar(); // แสดง cart bar ถ้ามีรายการค้างอยู่
}

async function checkActiveOrder() {
  try {
    const snap = await get(ref(db, `tableOrders/${tableNum}`));
    if (snap.exists()) {
      const data = snap.val();
      activeOrderKey    = data.orderKey;
      activeOrderNumber = data.orderNumber;
      showOrderBanner();
    } else {
      // Firebase ตอบว่าไม่มี order active จริงๆ → ล้าง cart ที่ค้าง
      activeOrderKey    = null;
      activeOrderNumber = null;
      clearSavedCart();
    }
  } catch (err) {
    // เน็ตหลุด / Firebase error → ไม่ล้าง cart เพราะยังไม่รู้สถานะจริง
    console.error('checkActiveOrder error:', err);
    activeOrderKey = null;
  }
}

function showOrderBanner() {
  let banner = document.getElementById('activeBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'activeBanner';
    banner.style.cssText = `
      background:#fff8e1; border-left:4px solid #c8853a;
      padding:0.55rem 1rem; font-size:0.85rem; color:#5c3d2e;
      position:sticky; top:100px; z-index:38;
    `;
    document.getElementById('mainScreen').insertBefore(
      banner,
      document.getElementById('productGrid')
    );
  }
  banner.innerHTML = `🔄 ออเดอร์ <strong>#${activeOrderNumber}</strong> ยังค้างอยู่ — การสั่งเพิ่มจะต่อท้ายออเดอร์นี้`;
}

// ==================== Kitchen Status Real-time ====================
let kitchenStatusUnsubscribe = null;

const KITCHEN_STATUS_MAP = {
  pending:  { icon: '⏳', msg: 'รอครัวรับออเดอร์',   cls: '' },
  cooking:  { icon: '👨‍🍳', msg: 'ครัวกำลังทำอาหาร',  cls: 'status-cooking' },
  served:   { icon: '🍽',  msg: 'อาหารเสิร์ฟแล้ว! 🎉', cls: 'status-served' },
  paid:     { icon: '✅',  msg: 'ชำระเงินแล้ว ขอบคุณ', cls: 'status-paid' },
};

function startKitchenStatusWatcher(orderKey) {
  if (kitchenStatusUnsubscribe) { kitchenStatusUnsubscribe(); kitchenStatusUnsubscribe = null; }
  if (!orderKey) { hideKitchenBar(); return; }
  kitchenStatusUnsubscribe = onValue(ref(db, `orders/${orderKey}/status`), snap => {
    updateKitchenBar(snap.exists() ? snap.val() : 'pending');
  });
}

function updateKitchenBar(status) {
  const bar  = document.getElementById('kitchenBar');
  const icon = document.getElementById('kitchenIcon');
  const msg  = document.getElementById('kitchenMsg');
  if (!bar) return;
  const info = KITCHEN_STATUS_MAP[status] || KITCHEN_STATUS_MAP.pending;
  icon.textContent = info.icon;
  msg.textContent  = info.msg;
  bar.className    = 'cust-kitchen-bar' + (info.cls ? ' ' + info.cls : '');
  bar.classList.remove('hidden');
}

function hideKitchenBar() {
  const bar = document.getElementById('kitchenBar');
  if (bar) bar.classList.add('hidden');
}

// ==================== Call Staff ====================
let callCooldown = false;

document.getElementById('callStaffBtn').addEventListener('click', async () => {
  if (callCooldown || !tableNum) return;
  callCooldown = true;
  const btn = document.getElementById('callStaffBtn');
  btn.disabled = true;

  try {
    // ตรวจ last call ก่อน write เพื่อป้องกัน bypass จาก client อื่น
    const lastCallSnap = await get(ref(db, `callStaff/${tableNum}`));
    if (lastCallSnap.exists()) {
      const lastCall = lastCallSnap.val();
      const secondsAgo = (Date.now() - new Date(lastCall.time).getTime()) / 1000;
      if (!lastCall.done && secondsAgo < 30) {
        // ยังอยู่ใน cooldown — ไม่ต้องส่งซ้ำ
        callCooldown = false;
        btn.disabled = false;
        return;
      }
    }
    await set(ref(db, `callStaff/${tableNum}`), {
      table:       tableNum,
      orderNumber: activeOrderNumber || null,
      time:        new Date().toISOString(),
      done:        false,
    });
    const toast = document.getElementById('callToast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  } catch (err) {
    console.error('callStaff error:', err);
  }

  // cooldown 30 วิ ป้องกันกดซ้ำ
  setTimeout(() => {
    callCooldown = false;
    btn.disabled = false;
  }, 30000);
});

function show(id) {
  ['invalidScreen','mainScreen'].forEach(sid => {
    document.getElementById(sid).classList.toggle('hidden', sid !== id);
  });
}

// ==================== Products ====================
function renderProducts() {
  const grid = document.getElementById('productGrid');
  const list = PRODUCTS[currentCat] || [];
  grid.innerHTML = list.map(p => `
    <button class="cust-product-card" data-id="${p.id}" type="button">
      <div class="cust-product-img-wrap">
        <img class="cust-product-img" src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"
             onerror="this.parentNode.innerHTML='<span class=cust-product-img-fallback>🍽</span>'">
      </div>
      <div class="cust-product-info">
        <div class="cust-product-name">${esc(p.name)}</div>
        <div class="cust-product-price">${fmt(p.price)}</div>
      </div>
    </button>
  `).join('');

  grid.querySelectorAll('.cust-product-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = (PRODUCTS[currentCat] || []).find(x => x.id === btn.dataset.id);
      if (p) openOptionModal(p);
    });
  });
}

function bindCats() {
  document.querySelectorAll('.cust-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cust-cat').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCat = btn.dataset.cat;
      renderProducts();
    });
  });
}

// ==================== Option Modal (Dynamic) ====================

// state ของ option modal รอบนี้
let currentOptionValues = {}; // { groupId: value | value[] }

function openOptionModal(product) {
  pendingProduct = product;
  optionQty = 1;

  const config = OPTION_CONFIGS[product.productType] || OPTION_CONFIGS['simple'];

  // reset state
  currentOptionValues = {};
  config.groups.forEach(g => {
    if (g.type === 'single') currentOptionValues[g.id] = g.defaultValue ?? '';
    else currentOptionValues[g.id] = [];
  });

  // render modal content
  renderOptionModalBody(product, config);
  openModal('optionModal');
}

function renderOptionModalBody(product, config) {
  const modal = document.getElementById('optionModal');
  const box   = modal.querySelector('.cust-modal-box');

  // สร้าง HTML groups
  const groupsHtml = config.groups.map(g => {
    const pillsHtml = g.choices.map(c => {
      const isActive = g.type === 'single'
        ? currentOptionValues[g.id] === c.value
        : currentOptionValues[g.id].includes(c.value);
      return `<button class="cust-pill${g.type === 'multi' ? ' toggle' : ''}${isActive ? ' active' : ''}"
        data-group="${g.id}" data-type="${g.type}" data-value="${esc(c.value)}"
        ${c.price ? `data-price="${c.price}"` : ''} type="button">${esc(c.label)}</button>`;
    }).join('');
    return `
      <div class="cust-option-group">
        <p class="cust-option-label">${g.label}</p>
        <div class="cust-pill-row" id="optGroup_${g.id}">${pillsHtml}</div>
      </div>`;
  }).join('');

  const noteHtml = config.hasNote ? `
    <div class="cust-option-group">
      <p class="cust-option-label">📝 หมายเหตุ</p>
      <textarea class="cust-textarea" id="optionNote" rows="2" placeholder="เช่น ไม่ใส่ผักชี, หวานน้อย..." maxlength="200"></textarea>
    </div>` : '';

  box.innerHTML = `
    <button class="cust-modal-close" id="optionClose">✕</button>
    <h3 class="cust-modal-title" id="optionProductName">${esc(product.name)}</h3>
    <span class="cust-option-type-badge cust-option-type-${product.productType}">${getProductTypeLabel(product.productType)}</span>
    ${groupsHtml}
    ${noteHtml}
    <div class="cust-option-group cust-qty-row">
      <p class="cust-option-label">จำนวน</p>
      <div class="cust-qty-ctrl">
        <button class="cust-qty-btn" id="qtyMinus" type="button">−</button>
        <span class="cust-qty-num" id="qtyNum">1</span>
        <button class="cust-qty-btn" id="qtyPlus" type="button">+</button>
      </div>
    </div>
    <button class="cust-btn-add" id="optionConfirm" type="button">🛒 เพิ่มในตะกร้า</button>
  `;

  // bind pill events
  box.querySelectorAll('.cust-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid   = btn.dataset.group;
      const type  = btn.dataset.type;
      const value = btn.dataset.value;

      if (type === 'single') {
        currentOptionValues[gid] = value;
        box.querySelectorAll(`.cust-pill[data-group="${gid}"]`).forEach(p =>
          p.classList.toggle('active', p.dataset.value === value));
      } else {
        const arr = currentOptionValues[gid];
        const idx = arr.indexOf(value);
        if (idx === -1) arr.push(value); else arr.splice(idx, 1);
        btn.classList.toggle('active', arr.includes(value));
      }
    });
  });

  // bind qty
  document.getElementById('qtyMinus').addEventListener('click', () => {
    if (optionQty > 1) { optionQty--; document.getElementById('qtyNum').textContent = optionQty; }
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    if (optionQty < 99) { optionQty++; document.getElementById('qtyNum').textContent = optionQty; }
  });

  // bind confirm
  document.getElementById('optionConfirm').addEventListener('click', () => {
    if (!pendingProduct) return;
    const config2 = OPTION_CONFIGS[pendingProduct.productType] || OPTION_CONFIGS['simple'];
    const rawNote = document.getElementById('optionNote')?.value.trim() || '';
    const note    = rawNote.slice(0, 200); // hard cap 200 chars

    const parts = [];
    let extraPrice = 0;

    config2.groups.forEach(g => {
      const val = currentOptionValues[g.id];
      if (g.type === 'single') {
        if (val) parts.push(val);
      } else {
        (val || []).forEach(v => {
          parts.push(v);
          const choice = g.choices.find(c => c.value === v);
          if (choice?.price) extraPrice += choice.price;
        });
      }
    });
    if (note) parts.push(note);

    const optionLabel = parts.join(' · ');
    const finalPrice  = pendingProduct.price + extraPrice;
    const cartKey     = pendingProduct.id + '|' + optionLabel;
    const existing    = cart.find(i => i.cartKey === cartKey);

    if (existing) {
      existing.qty += optionQty;
    } else {
      cart.push({ cartKey, id: pendingProduct.id, name: pendingProduct.name, price: finalPrice, qty: optionQty, optionLabel });
    }

    saveCart(); // บันทึกตะกร้าทันที
    closeModal('optionModal');
    updateCartBar();
  });

  // bind close
  document.getElementById('optionClose').addEventListener('click', () => closeModal('optionModal'));
}

function getProductTypeLabel(type) {
  return { mapraopun: 'เมนูพิเศษ', kaomutod: '🍚 ข้าวหมูทอด', namngiao: '🍜 น้ำเงี้ยว', kaosoi: '🍜 ข้าวซอย', food: '🍽 อาหาร', 'drink-brew': '☕ เครื่องดื่มชง', 'drink-ready': '🥤 เครื่องดื่ม', simple: '' }[type] || '';
}

// ==================== Cart Bar ====================
function updateCartBar() {
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalAmt = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const bar = document.getElementById('cartBar');
  bar.style.display = totalQty > 0 ? '' : 'none';
  document.getElementById('cartCountBadge').textContent = `${totalQty} รายการ`;
  document.getElementById('cartTotalBadge').textContent = fmt(totalAmt);
}

document.getElementById('openCartBtn').addEventListener('click', () => {
  renderCartModal();
  openModal('cartModal');
});
document.getElementById('cartClose').addEventListener('click', () => closeModal('cartModal'));

// ==================== Cart Modal ====================
function renderCartModal() {
  const list     = document.getElementById('cartList');
  const empty    = document.getElementById('cartEmpty');
  const totalAmt = cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (cart.length === 0) {
    empty.style.display = '';
    list.querySelectorAll('.cust-cart-item').forEach(el => el.remove());
  } else {
    empty.style.display = 'none';
    list.querySelectorAll('.cust-cart-item').forEach(el => el.remove());
    cart.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'cust-cart-item';
      li.innerHTML = `
        <div class="cust-cart-item-info">
          <div class="cust-cart-item-name">${esc(item.name)}</div>
          ${item.optionLabel ? `<div class="cust-cart-item-note">${esc(item.optionLabel)}</div>` : ''}
          <div class="cust-cart-item-price">${fmt(item.price)}</div>
        </div>
        <div class="cust-cart-item-qty">
          <button class="cust-cart-qty-btn" data-idx="${idx}" data-d="-1">−</button>
          <span class="cust-cart-qty-num">${item.qty}</span>
          <button class="cust-cart-qty-btn" data-idx="${idx}" data-d="1">+</button>
        </div>
        <button class="cust-cart-item-del" data-idx="${idx}">✕</button>
      `;
      list.appendChild(li);
    });

    list.querySelectorAll('.cust-cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx), d = parseInt(btn.dataset.d);
        if (d > 0 && cart[i].qty >= 99) return; // max qty 99
        cart[i].qty += d;
        if (cart[i].qty <= 0) cart.splice(i, 1);
        saveCart();
        renderCartModal(); updateCartBar();
      });
    });
    list.querySelectorAll('.cust-cart-item-del').forEach(btn => {
      btn.addEventListener('click', () => {
        cart.splice(parseInt(btn.dataset.idx), 1);
        saveCart();
        renderCartModal(); updateCartBar();
      });
    });
  }

  document.getElementById('cartTotal').textContent = fmt(totalAmt);

  // ปรับปุ่ม send ให้บอกว่าสั่งเพิ่มหรือสั่งใหม่
  const sendBtn = document.getElementById('sendOrderBtn');
  if (activeOrderKey) {
    sendBtn.textContent = `✓ เพิ่มในออเดอร์ #${activeOrderNumber}`;
  } else {
    sendBtn.textContent = '✓ ส่งออเดอร์';
  }
}

// ==================== Send Order ====================
document.getElementById('sendOrderBtn').addEventListener('click', async () => {
  if (cart.length === 0) return;
  const btn = document.getElementById('sendOrderBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง...';

  try {
    const today = new Date().toISOString().slice(0, 10);

    const batchItems = cart.map(i => ({
      name:  i.name,
      price: i.price,
      qty:   i.qty,
      ...(i.optionLabel ? { option: i.optionLabel } : {}),
    }));

    let usedOrderNum = activeOrderNumber;

    if (activeOrderKey) {
      // ─── มี order active → เพิ่ม batch ต่อท้าย ───
      const orderSnap = await get(ref(db, `orders/${activeOrderKey}`));

      if (orderSnap.exists()) {
        const existingOrder = orderSnap.val();
        const batches = existingOrder.batches || [existingOrder.items || []];
        batches.push(batchItems);
        const newTotal = batches.flat().reduce((sum, i) => sum + i.price * i.qty, 0);

        await update(ref(db, `orders/${activeOrderKey}`), {
          batches,
          total: newTotal,
          status: 'pending',
          lastBatchDate: new Date().toISOString(),
        });
      } else {
        // order ถูกลบไปแล้ว → สร้างใหม่
        activeOrderKey = null;
      }
    }

    if (!activeOrderKey) {
      // ─── สร้าง order ใหม่ โดยจอง order number แบบ atomic ด้วย Transaction ───
      let newOrderNum;
      await runTransaction(ref(db, 'meta'), (meta) => {
        if (!meta) meta = {};
        if (meta.lastOrderDate !== today) {
          meta.orderNumber   = 1001;
          meta.lastOrderDate = today;
        } else {
          meta.orderNumber = (meta.orderNumber || 1000) + 1;
        }
        newOrderNum = meta.orderNumber;
        return meta;
      });
      usedOrderNum = newOrderNum;

      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const order = {
        orderNumber: newOrderNum,
        table:  tableNum,
        date:   new Date().toISOString(),
        batches: [batchItems],
        total,
        status: 'pending',
        source: 'qr',
      };

      const newRef = await push(ref(db, 'orders'), order);
      activeOrderKey    = newRef.key;
      activeOrderNumber = newOrderNum;

      await update(ref(db, `tableOrders/${tableNum}`), {
        orderKey:    newRef.key,
        orderNumber: newOrderNum,
      });
    }

    // ─── success ───
    cart = [];
    clearSavedCart(); // ล้าง cart ที่ค้างใน sessionStorage
    updateCartBar();
    closeModal('cartModal');

    document.getElementById('successMsg').textContent =
      `ออเดอร์ #${usedOrderNum} โต๊ะ ${tableNum} ถูกส่งแล้ว 🙏`;
    openModal('successModal');

    // อัปเดต banner
    showOrderBanner();
    // เริ่ม / รีเซ็ต watch สถานะครัว
    startKitchenStatusWatcher(activeOrderKey);

  } catch (err) {
    alert('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง\n' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = activeOrderKey
      ? `✓ เพิ่มในออเดอร์ #${activeOrderNumber}`
      : '✓ ส่งออเดอร์';
  }
});

document.getElementById('continueOrderBtn').addEventListener('click', () => {
  closeModal('successModal');
});

document.getElementById('viewHistoryFromSuccessBtn').addEventListener('click', () => {
  closeModal('successModal');
  openHistoryModal();
});

// ==================== Order History Modal ====================
let historyUnsubscribe = null;

function openHistoryModal() {
  document.getElementById('historyTableLabel').textContent = `โต๊ะ ${tableNum}`;
  document.getElementById('historyLoading').classList.remove('hidden');
  document.getElementById('historyEmpty').classList.add('hidden');
  document.getElementById('historyContent').classList.add('hidden');
  document.getElementById('historyOrderMoreBtn').style.display = 'none';

  openModal('historyModal');
  loadHistoryRealtime();
}

function loadHistoryRealtime() {
  // ยกเลิก listener เก่าถ้ามี
  if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }

  if (!activeOrderKey) {
    // ลองดึง tableOrders ก่อน กรณี banner ยังไม่โหลด
    get(ref(db, `tableOrders/${tableNum}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val();
        activeOrderKey    = data.orderKey;
        activeOrderNumber = data.orderNumber;
        attachHistoryListener();
      } else {
        showHistoryEmpty();
      }
    }).catch(() => showHistoryEmpty());
  } else {
    attachHistoryListener();
  }
}

function attachHistoryListener() {
  historyUnsubscribe = onValue(ref(db, `orders/${activeOrderKey}`), snap => {
    if (!snap.exists()) {
      showHistoryEmpty();
      return;
    }
    renderHistoryContent(snap.val());
  }, () => showHistoryEmpty());
}

function showHistoryEmpty() {
  document.getElementById('historyLoading').classList.add('hidden');
  document.getElementById('historyContent').classList.add('hidden');
  document.getElementById('historyEmpty').classList.remove('hidden');
  document.getElementById('historyOrderMoreBtn').style.display = 'none';
}

function renderHistoryContent(order) {
  document.getElementById('historyLoading').classList.add('hidden');
  document.getElementById('historyEmpty').classList.add('hidden');
  document.getElementById('historyContent').classList.remove('hidden');

  // Meta chips
  const metaEl = document.getElementById('historyMeta');
  const orderDate = order.date ? new Date(order.date) : null;
  const dateStr = orderDate
    ? orderDate.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : '';
  metaEl.innerHTML = `
    <span class="cust-history-meta-chip">ออเดอร์ #${order.orderNumber}</span>
    <span class="cust-history-meta-chip">โต๊ะ ${order.table}</span>
    ${dateStr ? `<span class="cust-history-meta-chip">🕐 ${dateStr}</span>` : ''}
  `;

  // Batches
  const batchesEl = document.getElementById('historyBatches');
  const batches = order.batches || (order.items ? [order.items] : []);
  batchesEl.innerHTML = batches.map((batch, bi) => {
    const batchTime = bi === 0 && order.date
      ? new Date(order.date)
      : order.lastBatchDate && bi === batches.length - 1
        ? new Date(order.lastBatchDate)
        : null;
    const timeStr = batchTime
      ? batchTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : '';

    const itemsHtml = batch.map(item => `
      <div class="cust-history-item">
        <span class="cust-history-item-qty">${item.qty}x</span>
        <div class="cust-history-item-info">
          <div class="cust-history-item-name">${esc(item.name)}</div>
          ${item.option ? `<div class="cust-history-item-option">${esc(item.option)}</div>` : ''}
        </div>
        <span class="cust-history-item-price">${fmt(item.price * item.qty)}</span>
      </div>
    `).join('');

    return `
      <div class="cust-history-batch">
        <div class="cust-history-batch-header">
          <span class="cust-history-batch-label">ครั้งที่ ${bi + 1}</span>
          ${timeStr ? `<span class="cust-history-batch-time">${timeStr}</span>` : ''}
        </div>
        <div class="cust-history-batch-items">${itemsHtml}</div>
      </div>
    `;
  }).join('');

  // Grand total
  const grandTotal = batches.flat().reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('historyGrandTotal').innerHTML = `
    <span>รวมทั้งหมด</span>
    <span class="cust-history-grand-amt">${fmt(grandTotal)}</span>
  `;

  // Status badge
  const statusMap = {
    pending:  { label: '⏳ รอดำเนินการ', cls: 'status-pending' },
    paid:     { label: '✅ ชำระแล้ว',    cls: 'status-paid' },
    canceled: { label: '❌ ยกเลิก',      cls: 'status-canceled' },
  };
  const s = statusMap[order.status] || statusMap.pending;
  document.getElementById('historyStatusRow').innerHTML = `
    <span class="cust-history-status-badge ${s.cls}">${s.label}</span>
  `;

  // ถ้า pending → แสดงปุ่ม "สั่งเพิ่ม"
  const moreBtn = document.getElementById('historyOrderMoreBtn');
  if (order.status === 'pending') {
    moreBtn.style.display = '';
  } else {
    moreBtn.style.display = 'none';
  }
}

document.getElementById('historyClose').addEventListener('click', () => {
  if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }
  closeModal('historyModal');
});

document.getElementById('historyOrderMoreBtn').addEventListener('click', () => {
  if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }
  closeModal('historyModal');
});

document.getElementById('openHistoryBtn').addEventListener('click', () => {
  openHistoryModal();
});

document.getElementById('historyModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('historyModal')) {
    if (historyUnsubscribe) { historyUnsubscribe(); historyUnsubscribe = null; }
    closeModal('historyModal');
  }
});

// ==================== Modal helpers ====================
function openModal(id)  { document.getElementById(id).setAttribute('aria-hidden','false'); }
function closeModal(id) { document.getElementById(id).setAttribute('aria-hidden','true'); }

['optionModal','cartModal','successModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

// ==================== Start ====================

init();

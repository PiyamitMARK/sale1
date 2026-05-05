/**
 * ข้าวซอย 90 — POS System
 * Cloudflare Worker REST API + WebSocket
 *
 * ระบบใหม่: 1 โต๊ะ = 1 Order Number จนกว่าจะจ่ายเงิน
 *   - สั่งเพิ่มในโต๊ะเดิม → ต่อท้าย order เดิม (แยก batch)
 *   - จ่ายแล้ว → order ใหม่ได้เลขถัดไป
 */

import { api, ws } from './api-client.js';
import { parseMenuFromRaw, subscribeCategoriesAndSync, subscribeDefaultCat } from './menu-manager.js';

// LS fallback ใช้ตอน API ยังไม่ตอบ
function _loadMenuFromLS() {
  try {
    const raw = localStorage.getItem('ks90-menu');
    if (!raw) return null;
    const parsed = parseMenuFromRaw(JSON.parse(raw), 'image');
    return Object.keys(parsed).length ? parsed : null;
  } catch { return null; }
}

// ==================== รูปสินค้า ====================
const IMG = (n) => 'images/img' + n + '.png';

// ==================== เมนูสินค้า (โหลดจาก API) ====================
let products = {
  setkao: [
    { id: 'setkao13', name: 'เซ็ตอิ่มคุ้มคู่❗',            price: 129, image: IMG(10021),   productType: 'setkao' },
    { id: 'setkao1', name: 'ข้าวซอยน่องไก่ + โค๊ก',      price: 85, image: IMG(10012),   productType: 'setkao' },
    { id: 'setkao2', name: 'ข้าวซอยน่องไก่ + ชาไทย',       price: 110, image: IMG(10013),  productType: 'setkao' },
    { id: 'setkao3', name: 'ข้าวซอยน่องไก่ + มะพร้าวปั่น',            price: 115, image: IMG(10014),   productType: 'setkao' },
    { id: 'setkao4', name: 'ข้าวซอยหมูทอด + โค๊ก',      price: 85, image: IMG(10020),   productType: 'setkao' },
    { id: 'setkao5', name: 'ข้าวซอยหมูทอด + ชาไทย',       price: 110, image: IMG(10019),  productType: 'setkao' },
    { id: 'setkao6', name: 'ข้าวซอยหมูทอด + มะพร้าวปั่น',            price: 115, image: IMG(10018),   productType: 'setkao' },
    { id: 'setkao7', name: 'น้ำเงี้ยว + โค๊ก',      price: 75, image: IMG(10015),   productType: 'setkao' },
    { id: 'setkao8', name: 'น้ำเงี้ยว + ชาไทย',       price: 100, image: IMG(10016),  productType: 'setkao' },
    { id: 'setkao9', name: 'น้ำเงี้ยว + มะพร้าวปั่น',            price: 105, image: IMG(10017),   productType: 'setkao' },
    { id: 'setkao10', name: 'ข้าวหมูทอด + โค๊ก',      price: 65, image: IMG(10009),   productType: 'setkao' },
    { id: 'setkao11', name: 'ข้าวหมูทอด + ชาไทย',       price: 90, image: IMG(10010),  productType: 'setkao' },
    { id: 'setkao12', name: 'ข้าวหมูทอด + มะพร้าวปั่น',            price: 95, image: IMG(10011),   productType: 'setkao' },
  ],
  kao: [
    { id: 'kao1', name: 'ข้าวซอยน่องไก่', price: 70, image: IMG(111),   productType: 'kaosoi'   },
    { id: 'kao2', name: 'ข้าวซอยหมูทอด',       price: 70, image: IMG(1007),   productType: 'kaosoi'  },
    { id: 'kao3', name: 'น้ำเงี้ยว',            price: 60, image: IMG(555),    productType: 'namngiao'  },
    { id: 'kao4', name: 'ข้าวหมูทอด',           price: 50, image: IMG(7667),   productType: 'kaomutod'  },
    { id: 'kao5', name: 'แคบหมู',               price: 15, image: IMG(98789),  productType: 'simple' },
    { id: 'kao7', name: 'ลาบเหนือ',           price: 60, image: IMG(10001),  productType: 'kaomutod' },
    { id: 'kao8', name: 'ข้าวเหนียว',           price: 10, image: IMG(10002),  productType: 'simple' },
    { id: 'kao9', name: 'ข้าวสวย',           price: 10, image: IMG(10003),  productType: 'simple' },
    { id: 'kao6', name: 'ไข่ต้ม',               price: 10, image: IMG(1090),  productType: 'simple' },
    ],
  nam: [
    { id: 'nam1',  name: 'น้ำเปล่า',       price: 10, image: IMG(60),  productType: 'drink-ready' },
    { id: 'nam2',  name: 'โค๊ก',           price: 15, image: IMG(80),  productType: 'drink-ready' },
    { id: 'nam3',  name: 'สไปร์ท',         price: 15, image: IMG(345), productType: 'drink-ready' },
    { id: 'nam4',  name: 'มะพร้าวปั่น',    price: 45, image: IMG(333), productType: 'mapraopun' },
    { id: 'nam5',  name: 'ชาไทย',          price: 40, image: IMG(1),   productType: 'drink-brew' },
    { id: 'nam6',  name: 'ชาดำเย็น',       price: 40, image: IMG(5),   productType: 'drink-brew' },
    { id: 'nam7',  name: 'ชามะนาว',        price: 40, image: IMG(13),  productType: 'drink-brew' },
    { id: 'nam8',  name: 'นมชมพู',         price: 40, image: IMG(14),  productType: 'drink-brew' },
    { id: 'nam9',  name: 'โกโก้',          price: 40, image: IMG(9),   productType: 'drink-brew' },
    { id: 'nam10', name: 'มัทฉะมะพร้าว',   price: 60, image: IMG(15),  productType: 'drink-brew' },
    { id: 'nam11', name: 'มัทฉะลาเต้',     price: 60, image: IMG(3),   productType: 'drink-brew' },
    { id: 'nam12', name: 'เพียวมัทฉะ',     price: 55, image: IMG(2),   productType: 'drink-brew' },
  ],
  coffee: [
    { id: 'coffee1', name: 'เอสเปรสโซ่',         price: 55, image: IMG(12), productType: 'drink-brew' },
    { id: 'coffee2', name: 'คาปูชิโน่',           price: 55, image: IMG(7),  productType: 'drink-brew' },
    { id: 'coffee3', name: 'ลาเต้',               price: 55, image: IMG(4),  productType: 'drink-brew' },
    { id: 'coffee4', name: 'มอคค่า',              price: 55, image: IMG(12), productType: 'drink-brew' },
    { id: 'coffee5', name: 'อเมริกาโน่',           price: 45, image: IMG(5),  productType: 'drink-brew' },
    { id: 'coffee6', name: 'อเมริกาโน่มะพร้าว',   price: 60, image: IMG(6),  productType: 'drink-brew' },
    { id: 'coffee7', name: 'อเมริกาโน่น้ำผึ้ง',   price: 60, image: IMG(5),  productType: 'drink-brew' },
    { id: 'coffee8', name: 'อเมริกาโน่ส้ม',       price: 60, image: IMG(8),  productType: 'drink-brew' },
  ],
  soda: [
    { id: 'soda1', name: 'แดงมะนาวโซดา',      price: 35, image: IMG(23), productType: 'drink-ready' },
    { id: 'soda2', name: 'บลูฮาวายมะนาวโซดา', price: 35, image: IMG(26), productType: 'drink-ready' },
    { id: 'soda3', name: 'แอปเปิ้ลโซดา',      price: 35, image: IMG(24), productType: 'drink-ready' },
    { id: 'soda4', name: 'ส้มโซดา',           price: 35, image: IMG(25), productType: 'drink-ready' },
    { id: 'soda5', name: 'สตรอเบอร์รี่โซดา',  price: 35, image: IMG(30), productType: 'drink-ready' },
    { id: 'soda6', name: 'บลูเบอร์รี่โซดา',   price: 35, image: IMG(21), productType: 'drink-ready' },
  ],
};

// ==================== โหลดเมนู: LS ก่อน (fast) → API + WebSocket (realtime) ====================
const _lsMenuPOS = _loadMenuFromLS();
if (_lsMenuPOS) products = _lsMenuPOS;

let _menuRawCache = null;
let _menuDebounce = null;

async function _startMenuSubscribe() {
  const lsRaw = localStorage.getItem('ks90-menu');
  try {
    const menuData = await api.getMenu();
    if (!menuData) return;
    const rawStr = JSON.stringify(menuData);
    if (rawStr === lsRaw) {
      _menuRawCache = rawStr;
      return;
    }
    _menuRawCache = rawStr;
    try { localStorage.setItem('ks90-menu', rawStr); } catch (_) {}
    const parsed = parseMenuFromRaw(menuData, 'image');
    if (Object.keys(parsed).length) { products = parsed; renderProducts(); }
  } catch (err) {
    console.warn('menu load error:', err);
  }
}

// ==================== Option Configs แยกตาม productType ====================
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
          { value: 'ร้อน -฿10',   label: '☕ ร้อน -฿10',  price: -10 },
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
  'setkao':      { groups: [], hasNote: true, },
  'drink-ready': { groups: [], hasNote: true },
  'simple':      { groups: [], hasNote: false },
};

// ==================== State ====================
let cart = [];
let orderNumber = 1001;
let currentCategory = 'setkao';

// subscribe defaultCat จาก menu-manager — set เป็นค่าเริ่มต้นก่อน categories โหลด
subscribeDefaultCat(null, catId => {
  if (catId) currentCategory = catId;
});
let selectedTable = null;

// สถานะ order ปัจจุบันของโต๊ะที่เลือก
let currentTableOrderId = null;     // id ของ order ที่กำลัง active
let currentTableOrderNumber = null; // order number ที่ active

// WebSocket connection
let _wsConn = null;

// ==================== DOM ====================
const currentDateEl    = document.getElementById('currentDate');
const orderNumberEl    = document.getElementById('orderNumber');
const tableChipEl      = document.getElementById('tableChip');
const productsGrid     = document.getElementById('productsGrid');
const productsOverlay  = document.getElementById('productsOverlay');
const cartItemsEl      = document.getElementById('cartItems');
const cartEmptyEl      = document.getElementById('cartEmpty');
const totalEl          = document.getElementById('total');
const clearCartBtn     = document.getElementById('clearCart');
const completeOrderBtn = document.getElementById('completeOrder');
const receiptModal     = document.getElementById('receiptModal');
const receiptOrderNum  = document.getElementById('receiptOrderNum');
const receiptTableEl   = document.getElementById('receiptTable');
const receiptDate      = document.getElementById('receiptDate');
const receiptItemsEl   = document.getElementById('receiptItems');
const receiptTotal     = document.getElementById('receiptTotal');
const printReceiptBtn  = document.getElementById('printReceipt');
const newOrderBtn      = document.getElementById('newOrder');
const confirmOrderModal  = document.getElementById('confirmOrderModal');
const confirmTableLabel  = document.getElementById('confirmTableLabel');
const confirmOrderList   = document.getElementById('confirmOrderList');
const confirmTotal       = document.getElementById('confirmTotal');
const confirmOrderCancel = document.getElementById('confirmOrderCancel');
const confirmOrderOk     = document.getElementById('confirmOrderOk');

// ==================== Helpers ====================
function formatMoney(n) {
  return '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setDate() {
  currentDateEl.textContent = new Date().toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ==================== XSS helpers ====================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==================== Table Selection ====================
async function selectTable(tableNum) {
  selectedTable = tableNum;

  document.querySelectorAll('.table-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.table === String(tableNum));
  });

  productsOverlay.classList.add('hidden');
  tableChipEl.textContent = ` · โต๊ะ ${tableNum}`;

  await checkTableActiveOrder(tableNum);
  renderProducts();
}

/**
 * ตรวจสอบ order ที่ active อยู่สำหรับโต๊ะ ผ่าน REST API
 */
async function checkTableActiveOrder(tableNum) {
  try {
    const data = await api.getTableOrder(tableNum);
    if (data && data.id) {
      currentTableOrderId     = data.id;
      currentTableOrderNumber = data.order_num;
      orderNumber             = data.order_num;
      orderNumberEl.textContent = orderNumber;
      showTableOrderBanner(tableNum, orderNumber);
    } else {
      currentTableOrderId     = null;
      currentTableOrderNumber = null;
      hideTableOrderBanner();
    }
  } catch (err) {
    // 404 = ไม่มี active order
    currentTableOrderId     = null;
    currentTableOrderNumber = null;
    hideTableOrderBanner();
  }
}

function showTableOrderBanner(tableNum, orderNum) {
  let banner = document.getElementById('tableOrderBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'tableOrderBanner';
    banner.className = 'table-order-banner';
    document.querySelector('.table-bar').insertAdjacentElement('afterend', banner);
  }
  banner.innerHTML = `
    <span class="table-order-banner-text">
      🔄 โต๊ะ ${tableNum} มีออเดอร์ <strong>#${orderNum}</strong> ค้างอยู่ — จะเพิ่มรายการต่อท้ายออเดอร์นี้
    </span>
  `;
  banner.style.display = '';
}

function hideTableOrderBanner() {
  const banner = document.getElementById('tableOrderBanner');
  if (banner) banner.style.display = 'none';
}

// ==================== Table Buttons (dynamic, sync กับ qr.html) ====================
const TABLE_COUNT_KEY = 'ks90-table-count';

function renderTableButtons() {
  const grid = document.getElementById('tableGrid');
  if (!grid) return;
  const count = Math.max(1, Math.min(99, parseInt(localStorage.getItem(TABLE_COUNT_KEY) || '9', 10)));
  grid.innerHTML = Array.from({ length: count }, (_, i) => {
    const t = i + 1;
    return `<button type="button" class="table-btn" data-table="${t}">${t}</button>`;
  }).join('');
  grid.querySelectorAll('.table-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTable(parseInt(btn.dataset.table)));
  });
  // ถ้าโต๊ะที่เลือกอยู่เกินจำนวนใหม่ ให้ deselect
  if (selectedTable && selectedTable > count) {
    selectedTable = null;
    document.getElementById('productsOverlay')?.classList.remove('hidden');
  }
}

renderTableButtons();

// sync แบบ realtime ถ้าแท็บอื่นเปลี่ยนค่า (เช่น เปิด qr.html แล้วกด สร้าง QR)
window.addEventListener('storage', (e) => {
  if (e.key === TABLE_COUNT_KEY) renderTableButtons();
});

// ==================== Products ====================
function renderProducts() {
  productsGrid.innerHTML = (products[currentCategory] || []).map((p, idx) => `
    <button type="button" class="product-card"
      data-id="${p.id}" data-name="${escapeAttr(p.name)}"
      data-price="${p.price}" data-image="${escapeAttr(p.image)}">
      <div class="product-img-wrap pos-img-skeleton">
        <img class="product-img" src="${p.image}" alt="${escapeAttr(p.name)}"
             loading="${idx < 6 ? 'eager' : 'lazy'}" decoding="async"
             onload="this.parentNode.classList.remove('pos-img-skeleton')"
             onerror="this.parentNode.classList.remove('pos-img-skeleton');this.style.display='none'">
      </div>
      <p class="product-name">${escapeHtml(p.name)}</p>
      <p class="product-price">${formatMoney(p.price)}</p>
    </button>
  `).join('');

  productsGrid.querySelectorAll('.product-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedTable) return;
      openOptionModal(btn.dataset);
    });
  });
}

// ==================== Option Modal (Dynamic) ====================
const optionModal = document.getElementById('optionModal');
let pendingProduct = null;
let currentOptionValues = {};

function openOptionModal(dataset) {
  let product = null;
  for (const cat of Object.values(products)) {
    product = cat.find(p => p.id === dataset.id);
    if (product) break;
  }
  if (!product) return;

  pendingProduct = product;

  const config = _resolveOptionConfig(product);

  currentOptionValues = {};
  config.groups.forEach(g => {
    currentOptionValues[g.id] = g.type === 'single' ? (g.defaultValue ?? '') : [];
  });

  renderOptionModalBody(product, config);
  optionModal.setAttribute('aria-hidden', 'false');
}

function _resolveOptionConfig(product) {
  if (product.options && Array.isArray(product.options) && product.options.length > 0) {
    return { groups: product.options, hasNote: true };
  }
  if (product.productType === 'custom') {
    return { groups: [], hasNote: true };
  }
  return OPTION_CONFIGS[product.productType] || OPTION_CONFIGS['simple'];
}

function renderOptionModalBody(product, config) {
  const box = optionModal.querySelector('.option-modal-content');

  const TYPE_BADGE = {
    food:          '<span class="pos-option-badge pos-badge-food">🍽 อาหาร</span>',
    'drink-brew':  '<span class="pos-option-badge pos-badge-brew">☕ เครื่องดื่มชง</span>',
    'drink-ready': '<span class="pos-option-badge pos-badge-ready">🥤 เครื่องดื่ม</span>',
    simple:        '',
  };

  const groupsHtml = config.groups.map(g => {
    const pillsHtml = g.choices.map(c => {
      const isActive = g.type === 'single'
        ? currentOptionValues[g.id] === c.value
        : currentOptionValues[g.id].includes(c.value);
      return `<button type="button"
        class="option-pill${g.type === 'multi' ? ' toggle' : ''}${isActive ? ' active' : ''}"
        data-group="${g.id}" data-gtype="${g.type}" data-value="${escapeAttr(c.value)}"
        ${c.price ? `data-price="${c.price}"` : ''}
      >${escapeHtml(c.label)}</button>`;
    }).join('');
    return `<div class="option-group">
      <p class="option-group-label">${g.label}</p>
      <div class="option-pill-row">${pillsHtml}</div>
    </div>`;
  }).join('');

  const noteHtml = config.hasNote ? `
    <div class="option-group">
      <p class="option-group-label">📝 หมายเหตุ</p>
      <textarea class="option-note" id="optionNote" placeholder="เช่น ไม่ใส่ผักชี, หวานน้อย..." rows="2"></textarea>
    </div>` : '';

  box.innerHTML = `
    <h3 class="modal-title">ตั้งค่าเมนู</h3>
    <p class="option-product-name">${escapeHtml(product.name)}</p>
    ${TYPE_BADGE[product.productType] || ''}
    ${groupsHtml}
    ${noteHtml}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="optionCancel">ยกเลิก</button>
      <button type="button" class="btn btn-primary" id="optionConfirm">🛒 เพิ่มในตะกร้า</button>
    </div>
  `;

  box.querySelectorAll('.option-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid   = btn.dataset.group;
      const gtype = btn.dataset.gtype;
      const val   = btn.dataset.value;
      if (gtype === 'single') {
        currentOptionValues[gid] = val;
        box.querySelectorAll(`.option-pill[data-group="${gid}"]`).forEach(p =>
          p.classList.toggle('active', p.dataset.value === val));
      } else {
        const arr = currentOptionValues[gid];
        const idx = arr.indexOf(val);
        if (idx === -1) arr.push(val); else arr.splice(idx, 1);
        btn.classList.toggle('active', arr.includes(val));
      }
    });
  });

  box.querySelector('#optionCancel').addEventListener('click', closeOptionModal);
  box.querySelector('#optionConfirm').addEventListener('click', () => {
    if (!pendingProduct) return;
    const cfg2 = _resolveOptionConfig(pendingProduct);
    const note  = document.getElementById('optionNote')?.value.trim() || '';
    const parts = [];
    let extraPrice = 0;

    cfg2.groups.forEach(g => {
      const val = currentOptionValues[g.id];
      if (g.type === 'single') {
        if (val) {
          parts.push(val);
          const choice = g.choices.find(c => c.value === val);
          if (choice?.price) extraPrice += choice.price;
        }
      } else {
        (val || []).forEach(v => {
          parts.push(v);
          const choice = g.choices.find(c => c.value === v);
          if (choice?.price) extraPrice += choice.price;
        });
      }
    });
    if (note) parts.push(note);

    addToCart(pendingProduct, parts.join(' · '), extraPrice);
    closeOptionModal();
  });
}

function closeOptionModal() {
  optionModal.setAttribute('aria-hidden', 'true');
  pendingProduct = null;
}

optionModal.addEventListener('click', (e) => {
  if (e.target === optionModal) closeOptionModal();
});

// ==================== Cart ====================
function addToCart({ id, name, price, image }, optionLabel = '', extraPrice = 0) {
  const basePrice = parseFloat(price) + extraPrice;
  const cartKey = id + '|' + optionLabel;
  const existing = cart.find(i => i.cartKey === cartKey);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, cartKey, name, price: basePrice, qty: 1, image, table: selectedTable, optionLabel });
  }
  renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

function updateQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) removeFromCart(index);
  else renderCart();
}

function renderCart() {
  cartEmptyEl.style.display = cart.length ? 'none' : 'flex';
  cartItemsEl.querySelectorAll('.cart-item').forEach((el) => el.remove());

  cart.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'cart-item';

    const img = item.image
      ? `<img class="cart-item-img" src="${item.image}" alt="" onerror="this.style.display='none'">`
      : '<span class="cart-item-img-placeholder"></span>';

    li.innerHTML = `
      ${img}
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        ${item.optionLabel ? `<div class="cart-item-note">${escapeHtml(item.optionLabel)}</div>` : ''}
        <div class="cart-item-price">${formatMoney(item.price)} × ${item.qty}</div>
      </div>
      <div class="cart-item-qty">
        <button type="button" class="qty-btn" aria-label="ลดจำนวน">−</button>
        <span class="qty-num">${item.qty}</span>
        <button type="button" class="qty-btn" aria-label="เพิ่มจำนวน">+</button>
      </div>
      <button type="button" class="cart-item-remove" aria-label="ลบรายการ">✕</button>
    `;

    li.querySelector('.qty-btn:first-child').addEventListener('click', () => updateQty(index, -1));
    li.querySelector('.qty-btn:last-child').addEventListener('click', () => updateQty(index, 1));
    li.querySelector('.cart-item-remove').addEventListener('click', () => removeFromCart(index));
    cartItemsEl.appendChild(li);
  });

  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = totalQty;
    badge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
  }

  totalEl.textContent = formatMoney(cart.reduce((sum, i) => sum + i.price * i.qty, 0));
}

function clearCart() {
  cart = [];
  renderCart();
}

// ==================== API: Order Number ====================
function getTodayTH() {
  const now = new Date();
  const th = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return th.toISOString().slice(0, 10);
}

async function loadOrderNumber() {
  try {
    const meta = await api.getMeta();
    if (!meta) return;
    const today = getTodayTH();
    if (meta.lastOrderDate !== today) {
      orderNumber = 1001;
    } else {
      orderNumber = meta.orderNumber || 1001;
    }
    orderNumberEl.textContent = orderNumber;
  } catch (err) {
    console.error('loadOrderNumber error:', err);
  }
}

// ==================== API: Save Order (batch-aware) ====================
async function saveOrder() {
  const batchItems = cart.map((i) => ({
    name: i.name,
    price: i.price,
    qty: i.qty,
    ...(i.optionLabel ? { option: i.optionLabel } : {}),
  }));

  if (!currentTableOrderId) {
    // สร้าง order ใหม่
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const newOrder = await api.createOrder({
      table_num: String(selectedTable),
      batches: [batchItems],
      total,
      status: 'pending',
    });

    currentTableOrderId     = newOrder.id;
    currentTableOrderNumber = newOrder.order_num;
    orderNumber             = newOrder.order_num;
    orderNumberEl.textContent = orderNumber;

    return { allBatches: [batchItems], grandTotal: total };

  } else {
    // เพิ่ม batch เข้า order เดิม
    const existingOrder = await api.getOrder(currentTableOrderId);
    if (!existingOrder) {
      // order หายไปแล้ว → สร้างใหม่
      currentTableOrderId = null;
      return saveOrder();
    }

    const batches = existingOrder.batches || [existingOrder.items || []];
    batches.push(batchItems);
    const newTotal = batches.flat().reduce((sum, i) => sum + i.price * i.qty, 0);

    await api.updateOrder(currentTableOrderId, {
      batches,
      total: newTotal,
      status: 'pending',
      last_batch_at: new Date().toISOString(),
    });

    return { allBatches: batches, grandTotal: newTotal };
  }
}

// ==================== Receipt ====================
function showReceipt({ allBatches, grandTotal }) {
  receiptOrderNum.textContent = currentTableOrderNumber || orderNumber;
  receiptTableEl.textContent  = `โต๊ะ ${selectedTable}`;
  receiptDate.textContent     = new Date().toLocaleString('th-TH');

  const allItems = allBatches.flat();
  receiptItemsEl.innerHTML = allItems.map((i) =>
    `<div class="receipt-item">
      <span>${escapeHtml(i.name)}${i.option ? ` (${escapeHtml(i.option)})` : ''} × ${i.qty}</span>
      <span>${formatMoney(i.price * i.qty)}</span>
    </div>`
  ).join('');

  receiptTotal.textContent = formatMoney(grandTotal);
  receiptModal.setAttribute('aria-hidden', 'false');
}

function closeReceipt() {
  receiptModal.setAttribute('aria-hidden', 'true');
}

// ==================== Confirm Modal ====================
function openConfirmOrderModal() {
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  if (currentTableOrderId) {
    confirmTableLabel.innerHTML = `โต๊ะ ${selectedTable} · <span style="color:var(--accent)">เพิ่มในออเดอร์ #${currentTableOrderNumber}</span>`;
  } else {
    confirmTableLabel.textContent = `โต๊ะ ${selectedTable} · ออเดอร์ใหม่`;
  }

  confirmOrderList.innerHTML = cart.map((i) =>
    `<div class="confirm-order-item">
      <span>${escapeHtml(i.name)}${i.optionLabel ? `<br><small style="color:var(--accent);font-size:0.78rem">${escapeHtml(i.optionLabel)}</small>` : ''} × ${i.qty}</span>
      <span>${formatMoney(i.price * i.qty)}</span>
    </div>`
  ).join('');
  confirmTotal.innerHTML = `<span>รวมทั้งหมด</span><span>${formatMoney(total)}</span>`;
  confirmOrderModal.setAttribute('aria-hidden', 'false');
}

function closeConfirmOrderModal() {
  confirmOrderModal.setAttribute('aria-hidden', 'true');
}

// ==================== New Order (after payment) ====================
async function startNewOrder() {
  if (currentTableOrderId && selectedTable) {
    try {
      const order = await api.getOrder(currentTableOrderId).catch(() => null);
      if (!order || order.status === 'paid') {
        // order จ่ายแล้วหรือหายไป → clear table
        await api.clearTable(String(selectedTable)).catch(() => {});
      }
    } catch (err) {
      console.error('startNewOrder error:', err);
    }
  }

  cart = [];
  selectedTable = null;
  currentTableOrderId     = null;
  currentTableOrderNumber = null;
  tableChipEl.textContent = '';
  document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('active'));
  productsOverlay.classList.remove('hidden');
  hideTableOrderBanner();
  renderCart();
  closeReceipt();

  await loadOrderNumber();
}

// ==================== Event Listeners ====================

// ─── Dynamic category tabs ────────────────────────────────────────
const _categoriesNav = document.getElementById('categoriesNav');

function renderCategoryTabs(cats) {
  if (!_categoriesNav) return;
  const ids = Object.keys(cats);
  if (!ids.includes(currentCategory)) currentCategory = ids[0] || 'setkao';

  _categoriesNav.innerHTML = ids.map((id, i) =>
    `<button class="category-btn${i === 0 && currentCategory === id || currentCategory === id ? ' active' : ''}" data-category="${id}">${cats[id]}</button>`
  ).join('');

  _categoriesNav.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _categoriesNav.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderProducts();
    });
  });
  renderProducts();
}

// โหลด categories จาก LocalStorage ทันที
try {
  const _lsCats = localStorage.getItem('ks90-categories');
  if (_lsCats) renderCategoryTabs(JSON.parse(_lsCats));
} catch (_) {}

// Subscribe categories ผ่าน menu-manager (จะ fetch จาก API แทน Firebase)
subscribeCategoriesAndSync(null, renderCategoryTabs);

clearCartBtn.addEventListener('click', clearCart);

completeOrderBtn.addEventListener('click', () => {
  if (cart.length === 0) return;
  closeCartOnMobile();
  openConfirmOrderModal();
});

printReceiptBtn.addEventListener('click', () => window.print());
newOrderBtn.addEventListener('click', startNewOrder);

confirmOrderCancel.addEventListener('click', closeConfirmOrderModal);
confirmOrderModal.addEventListener('click', (e) => {
  if (e.target === confirmOrderModal) closeConfirmOrderModal();
});
receiptModal.addEventListener('click', (e) => {
  if (e.target === receiptModal) closeReceipt();
});

confirmOrderOk.addEventListener('click', async () => {
  confirmOrderOk.disabled = true;
  closeConfirmOrderModal();
  let receiptData;
  try {
    receiptData = await saveOrder();
  } catch (err) {
    console.error('saveOrder error:', err);
    alert('เกิดข้อผิดพลาดในการบันทึกออเดอร์ กรุณาตรวจสอบการเชื่อมต่อ');
    confirmOrderOk.disabled = false;
    return;
  }
  confirmOrderOk.disabled = false;
  cart = [];
  renderCart();
  showTableOrderBanner(selectedTable, currentTableOrderNumber);
  showReceipt(receiptData);
});

// ==================== Mobile Cart Toggle + Smooth Drag ====================
const cartSection = document.querySelector('.cart-section');
const cartHeader  = document.querySelector('.cart-header');

const cartBackdrop = document.createElement('div');
cartBackdrop.className = 'cart-backdrop';
document.body.appendChild(cartBackdrop);

function isMobile() { return window.innerWidth <= 900; }

let cartH        = 0;
let closedOffset = 0;
let currentOffset = 0;
let isOpen       = false;

function getCartMetrics() {
  cartH        = cartSection.offsetHeight;
  closedOffset = cartH - 58;
}

function setOffset(offset, animate = false) {
  currentOffset = Math.max(0, Math.min(offset, closedOffset));
  cartSection.style.transition = animate ? 'transform 0.32s cubic-bezier(0.34,1.1,0.64,1)' : 'none';
  cartSection.style.transform  = `translateY(${currentOffset}px)`;

  const progress = closedOffset > 0 ? 1 - currentOffset / closedOffset : 0;
  cartBackdrop.style.opacity        = Math.max(0, Math.min(progress * 0.5, 0.5));
  cartBackdrop.style.visibility     = currentOffset < closedOffset ? 'visible' : 'hidden';
  cartBackdrop.style.pointerEvents  = currentOffset < closedOffset ? 'auto' : 'none';
}

function openCart(animate = true)  { isOpen = true;  setOffset(0, animate);            cartSection.classList.add('open'); }
function closeCart(animate = true) { isOpen = false; getCartMetrics(); setOffset(closedOffset, animate); cartSection.classList.remove('open'); }

function openCartOnMobile()  { if (isMobile()) { getCartMetrics(); openCart(); } }
function closeCartOnMobile() { if (isMobile()) closeCart(); }

cartBackdrop.addEventListener('click', () => closeCart());

let dragStartY     = 0;
let dragStartOffset = 0;
let isDragging     = false;
let rafId          = null;
let latestY        = 0;

function onPointerStart(clientY) {
  if (!isMobile()) return;
  getCartMetrics();
  isDragging      = true;
  dragStartY      = clientY;
  dragStartOffset = currentOffset;
  cartSection.style.transition = 'none';
  document.body.style.overflow = 'hidden';
}

function onPointerMove(clientY) {
  if (!isDragging) return;
  latestY = clientY;
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      const delta     = latestY - dragStartY;
      const newOffset = Math.max(0, Math.min(dragStartOffset + delta, closedOffset));
      currentOffset   = newOffset;
      cartSection.style.transform = `translateY(${newOffset}px)`;
      const progress = closedOffset > 0 ? 1 - newOffset / closedOffset : 0;
      cartBackdrop.style.opacity       = Math.max(0, Math.min(progress * 0.5, 0.5));
      cartBackdrop.style.visibility    = newOffset < closedOffset ? 'visible' : 'hidden';
      cartBackdrop.style.pointerEvents = newOffset < closedOffset ? 'auto' : 'none';
      rafId = null;
    });
  }
}

function onPointerEnd(clientY) {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.overflow = '';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const delta    = clientY - dragStartY;
  const velocity = delta;

  if (velocity > 80 || currentOffset > closedOffset * 0.5) {
    closeCart(true);
  } else {
    openCart(true);
  }
}

cartHeader.addEventListener('touchstart', (e) => { onPointerStart(e.touches[0].clientY); }, { passive: true });
document.addEventListener('touchmove',   (e) => { if (isDragging) onPointerMove(e.touches[0].clientY); }, { passive: true });
document.addEventListener('touchend',    (e) => { onPointerEnd(e.changedTouches[0].clientY); });

cartHeader.addEventListener('mousedown', (e) => { onPointerStart(e.clientY); e.preventDefault(); });
document.addEventListener('mousemove',   (e) => { if (isDragging) onPointerMove(e.clientY); });
document.addEventListener('mouseup',     (e) => { if (isDragging) onPointerEnd(e.clientY); });

cartHeader.addEventListener('click', () => {
  if (!isMobile() || isDragging) return;
  const didDrag = Math.abs(currentOffset - dragStartOffset) > 5;
  if (didDrag) return;
  if (isOpen) closeCart(); else { getCartMetrics(); openCart(); }
});

window.addEventListener('load',   () => { getCartMetrics(); setOffset(closedOffset); });
window.addEventListener('resize', () => { getCartMetrics(); setOffset(isOpen ? 0 : closedOffset); });

// ==================== CSS for banner (inject once) ====================
(function injectBannerStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .table-order-banner {
      background: #fff8e1;
      border-left: 4px solid var(--accent, #c8853a);
      padding: 0.55rem 1rem;
      font-size: 0.88rem;
      color: #5c3d2e;
    }
    .table-order-banner strong { color: var(--accent, #c8853a); }

    /* ── Skeleton loader รูปภาพ POS ── */
    .product-img-wrap {
      width: 100%; aspect-ratio: 1; overflow: hidden;
      border-radius: 8px 8px 0 0;
    }
    @keyframes pos-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .pos-img-skeleton {
      background: linear-gradient(90deg, #ede8e0 25%, #f5f2ec 50%, #ede8e0 75%);
      background-size: 800px 100%;
      animation: pos-shimmer 1.4s infinite linear;
    }
    .pos-img-skeleton img { opacity: 0; transition: opacity 0.2s; }
    .product-img-wrap:not(.pos-img-skeleton) img { opacity: 1; }
  `;
  document.head.appendChild(style);
})();

// ==================== Init ====================
setDate();
renderProducts();
renderCart();
loadOrderNumber();
_startMenuSubscribe();
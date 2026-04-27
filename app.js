/**
 * ครัวคุณแม่ — POS System
 * Firebase Realtime Database — sync real-time
 *
 * การตั้งค่า Firebase: ใส่ค่าจาก Firebase Console ของคุณด้านล่าง
 * ไม่ควร commit ไฟล์นี้ขึ้น public repository
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, update, get, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==================== Firebase Config ====================
// ⚠️ เปลี่ยนค่าเหล่านี้เป็น Firebase project ของคุณเอง
const firebaseConfig = {
  apiKey:            "AIzaSyDa7d8jAUXYGC0XSJ449tM974JFq7JvAm8",
  authDomain:        "sale1-e0cdc.firebaseapp.com",
  databaseURL:       "https://sale1-e0cdc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "sale1-e0cdc",
  storageBucket:     "sale1-e0cdc.firebasestorage.app",
  messagingSenderId: "731609021582",
  appId:             "1:731609021582:web:42184726ee92575ea8dddf",
};

const firebaseApp = initializeApp(firebaseConfig);
const db   = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

// Sign in anonymously so Firebase Security Rules (auth != null) pass
signInAnonymously(auth).catch((err) => console.error('Auth error:', err));

// ==================== รูปสินค้า ====================
const IMG = (n) => 'images/img' + n + '.png';

// ==================== เมนูสินค้า (ภาษาไทย) ====================
const products = {

  // ====== ผัด ======
  pad: [
    { id: 'pad1',  name: 'ผัดไวไวหมู',          price: 50,  image: IMG(1001) },
    { id: 'pad2',  name: 'ผัดไวไวไข่',           price: 50,  image: IMG(1002) },
    { id: 'pad3',  name: 'ผัดสปาเก็ตตี',          price: 65,  image: IMG(1003) },
    { id: 'pad4',  name: 'ราดหน้าหมู',            price: 55,  image: IMG(1004) },
    { id: 'pad5',  name: 'ราดหน้าทะเล',           price: 68,  image: IMG(1005) },
    { id: 'pad6',  name: 'ไก่ผัดขิง',             price: 50,  image: IMG(1006) },
    { id: 'pad7',  name: 'ไข่เจียวหมูสับ',         price: 45,  image: IMG(1007) },
    { id: 'pad8',  name: 'ไข่เจียวกุ้ง',           price: 50,  image: IMG(1008) },
    { id: 'pad9',  name: 'ไข่ต้ม',                price: 8,   image: IMG(1009) },
    { id: 'pad10', name: 'ไข่ดาว',               price: 5,   image: IMG(1010) },
    { id: 'pad11', name: 'ผัดพริกแกงป่าหมู',      price: 75,  image: IMG(1011) },
    { id: 'pad12', name: 'ผัดพริกแกงป่าไก่',      price: 75,  image: IMG(1012) },
    { id: 'pad13', name: 'หมูผัดพริกหยวก',        price: 65,  image: IMG(1013) },
    { id: 'pad14', name: 'เป็ดผัดพริกเกลือ',      price: 75,  image: IMG(1014) },
    { id: 'pad15', name: 'ไข่ยัดไส้ (จาน)',       price: 65,  image: IMG(1015) },
    { id: 'pad16', name: 'ไก่สับ (จาน)',          price: 150, image: IMG(1016) },
    { id: 'pad17', name: 'หมูแดง + หมูกรอบ (จาน)', price: 150, image: IMG(1017) },
    { id: 'pad18', name: 'เป็ดต้มพะโล้ (จาน)',    price: 150, image: IMG(1018) },
    { id: 'pad19', name: 'ขาหมูล้วน (จาน)',       price: 150, image: IMG(1019) },
  ],

  // ====== ข้าว ======
  khao: [
    { id: 'khao1',  name: 'ข้าวขาหมู',            price: 50, image: IMG(1020) },
    { id: 'khao2',  name: 'ข้าวมันไก่ต้ม',         price: 50, image: IMG(1021) },
    { id: 'khao3',  name: 'ข้าวกระเพราหมูสับ',     price: 50, image: IMG(1022) },
    { id: 'khao4',  name: 'ข้าวผัดกุ้ง',           price: 50, image: IMG(1023) },
    { id: 'khao5',  name: 'ข้าวผัดหมู',            price: 50, image: IMG(1024) },
    { id: 'khao6',  name: 'ข้าวหมูแดง',            price: 50, image: IMG(1025) },
    { id: 'khao7',  name: 'ข้าวหน้าเป็ด',          price: 50, image: IMG(1026) },
    { id: 'khao8',  name: 'ข้าวกระเพราหมูกรอบ',   price: 50, image: IMG(1027) },
    { id: 'khao9',  name: 'ข้าวกระเพราเป็ด',       price: 50, image: IMG(1041) },
    { id: 'khao10', name: 'ข้าวไข่เจียวหมูสับ',    price: 50, image: IMG(1028) },
    { id: 'khao11', name: 'ข้าวหน้าไก่',           price: 50, image: IMG(1029) },
    { id: 'khao12', name: 'ข้าวมันขาหมู',          price: 50, image: IMG(1030) },
    { id: 'khao13', name: 'ข้าวมันหน้าเป็ด',       price: 50, image: IMG(1031) },
    { id: 'khao14', name: 'ข้าวกระเพรากุ้ง',       price: 50, image: IMG(1032) },
    { id: 'khao15', name: 'ข้าวเปล่า',             price: 15, image: IMG(1033) },
  ],

  // ====== ต้ม / แกง ======
  tom: [
    { id: 'tom1', name: 'ต้มยำกุ้ง',                      price: 102, image: IMG(1034) },
    { id: 'tom2', name: 'ต้มข่าไก่ใส่กะทิ',               price: 68,  image: IMG(1035) },
    { id: 'tom3', name: 'ต้มจืดสาหร่ายเต้าหู้หมูสับ',     price: 50,  image: IMG(1036) },
  ],

  // ====== เครื่องดื่ม ======
  nam: [
    { id: 'water',  name: 'น้ำเปล่า',   price: 5,  image: IMG(1037) },
    { id: 'pepsi',  name: 'เป็ปซี่',    price: 10, image: IMG(1038) },
    { id: 'fanta',  name: 'แฟนต้า',     price: 10, image: IMG(1039) },
    { id: 'sprite', name: 'สไปร์ท',    price: 10, image: IMG(1040) },
  ],
};

// ==================== State ====================
let cart = [];
let orderNumber = 1001;
let currentCategory = 'pad';
let selectedTable = null;

// ==================== DOM ====================
const currentDateEl    = document.getElementById('currentDate');
const orderNumberEl    = document.getElementById('orderNumber');
const tableChipEl      = document.getElementById('tableChip');
const categoryBtns     = document.querySelectorAll('.category-btn');
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
const confirmOrderModal   = document.getElementById('confirmOrderModal');
const confirmTableLabel   = document.getElementById('confirmTableLabel');
const confirmOrderList    = document.getElementById('confirmOrderList');
const confirmTotal        = document.getElementById('confirmTotal');
const confirmOrderCancel  = document.getElementById('confirmOrderCancel');
const confirmOrderOk      = document.getElementById('confirmOrderOk');

// ==================== Helpers ====================
function formatMoney(n) {
  return '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setDate() {
  currentDateEl.textContent = new Date().toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ==================== Table Selection ====================
function selectTable(tableNum) {
  selectedTable = tableNum;

  document.querySelectorAll('.table-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.table === String(tableNum));
  });

  productsOverlay.classList.add('hidden');
  tableChipEl.textContent = ` · โต๊ะ ${tableNum}`;
  renderProducts();
}

document.querySelectorAll('.table-btn').forEach(btn => {
  btn.addEventListener('click', () => selectTable(parseInt(btn.dataset.table)));
});

// ==================== Products ====================
function renderProducts() {
  productsGrid.innerHTML = (products[currentCategory] || []).map((p) => `
    <button type="button" class="product-card"
      data-id="${p.id}" data-name="${escapeAttr(p.name)}"
      data-price="${p.price}" data-image="${escapeAttr(p.image)}">
      <img class="product-img" src="${p.image}" alt="${escapeAttr(p.name)}" loading="lazy"
           onerror="this.style.display='none'">
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

// ==================== Option Modal ====================
const optionModal       = document.getElementById('optionModal');
const optionModalTitle  = document.getElementById('optionModalTitle');
const optionProductName = document.getElementById('optionProductName');
const optionNote        = document.getElementById('optionNote');
const optionCancel      = document.getElementById('optionCancel');
const optionConfirm     = document.getElementById('optionConfirm');

let pendingProduct = null; // product dataset waiting for options

// Toppings that add price
const TOPPING_PRICES = {
  'เพิ่มไข่ดาว +฿5': 5,
  'เพิ่มไข่ต้ม +฿8': 8,
};

function openOptionModal(dataset) {
  pendingProduct = dataset;
  optionProductName.textContent = dataset.name;
  optionNote.value = '';

  // Reset spice selection
  document.querySelectorAll('.option-pill[data-group="spice"]').forEach(p => {
    p.classList.toggle('active', p.dataset.value === '');
  });
  // Reset toppings
  document.querySelectorAll('.option-pill.toggle').forEach(p => p.classList.remove('active'));

  optionModal.setAttribute('aria-hidden', 'false');
}

function closeOptionModal() {
  optionModal.setAttribute('aria-hidden', 'true');
  pendingProduct = null;
}

// Spice: single-select
document.querySelectorAll('.option-pill[data-group="spice"]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.option-pill[data-group="spice"]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Toppings: multi-select toggle
document.querySelectorAll('.option-pill.toggle').forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

optionCancel.addEventListener('click', closeOptionModal);
optionModal.addEventListener('click', (e) => { if (e.target === optionModal) closeOptionModal(); });

optionConfirm.addEventListener('click', () => {
  if (!pendingProduct) return;

  const spice = document.querySelector('.option-pill[data-group="spice"].active')?.dataset.value || '';
  const toppings = [...document.querySelectorAll('.option-pill.toggle.active')].map(p => p.dataset.value);
  const note = optionNote.value.trim();

  // Build option label
  const optionParts = [];
  if (spice) optionParts.push(spice);
  toppings.forEach(t => optionParts.push(t));
  if (note) optionParts.push(note);
  const optionLabel = optionParts.join(' · ');

  // Extra price from toppings
  const extraPrice = toppings.reduce((sum, t) => sum + (TOPPING_PRICES[t] || 0), 0);

  addToCart(pendingProduct, optionLabel, extraPrice);
  closeOptionModal();
});

// ==================== Cart ====================
function addToCart({ id, name, price, image }, optionLabel = '', extraPrice = 0) {
  const basePrice = parseFloat(price) + extraPrice;
  // Use id + optionLabel as unique cart key so same item with diff options is separate
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

// ==================== Cart Persistence ====================
function saveCartToLocal() {
  try {
    localStorage.setItem('krua-cart', JSON.stringify({ cart, selectedTable }));
  } catch (e) {}
}

function loadCartFromLocal() {
  try {
    const saved = localStorage.getItem('krua-cart');
    if (!saved) return;
    const { cart: savedCart, selectedTable: savedTable } = JSON.parse(saved);
    if (savedCart && savedCart.length > 0) {
      cart = savedCart;
      if (savedTable) selectTable(savedTable);
    }
  } catch (e) {
    localStorage.removeItem('krua-cart');
  }
}

function renderCart() {
  saveCartToLocal();
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
  localStorage.removeItem('krua-cart');
  cart = [];
  renderCart();
}

// ==================== Firebase: Order Number ====================
async function loadOrderNumber() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const metaSnap = await get(ref(db, 'meta'));
    const meta = metaSnap.exists() ? metaSnap.val() : {};

    if (meta.lastOrderDate !== today) {
      orderNumber = 1001;
      await update(ref(db, 'meta'), { orderNumber: 1001, lastOrderDate: today });
    } else {
      orderNumber = meta.orderNumber || 1001;
    }
    orderNumberEl.textContent = orderNumber;
  } catch (err) {
    console.error('loadOrderNumber error:', err);
  }
}

// ==================== Firebase: Save Order ====================
async function saveOrder() {
  const today = new Date().toISOString().slice(0, 10);
  let newOrderNumber;

  await runTransaction(ref(db, 'meta'), (meta) => {
    if (!meta) meta = {};
    if (meta.lastOrderDate !== today) {
      meta.orderNumber = 1001;
      meta.lastOrderDate = today;
    } else {
      meta.orderNumber = (meta.orderNumber || 1000) + 1;
    }
    newOrderNumber = meta.orderNumber;
    return meta;
  });

  orderNumber = newOrderNumber;
  orderNumberEl.textContent = orderNumber;

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const order = {
    orderNumber,
    table: selectedTable,
    date: new Date().toISOString(),
    items: cart.map((i) => ({ name: i.name, price: i.price, qty: i.qty, ...(i.optionLabel ? { option: i.optionLabel } : {}) })),
    total,
    status: 'pending',
  };
  await push(ref(db, 'orders'), order);
}

// ==================== Receipt ====================
function showReceipt() {
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  receiptOrderNum.textContent = orderNumber;
  receiptTableEl.textContent  = `โต๊ะ ${selectedTable}`;
  receiptDate.textContent     = new Date().toLocaleString('th-TH');
  receiptItemsEl.innerHTML    = cart.map((i) =>
    `<div class="receipt-item">
      <span>${escapeHtml(i.name)}${i.optionLabel ? ` (${escapeHtml(i.optionLabel)})` : ''} × ${i.qty}</span>
      <span>${formatMoney(i.price * i.qty)}</span>
    </div>`
  ).join('');
  receiptTotal.textContent = formatMoney(total);
  receiptModal.setAttribute('aria-hidden', 'false');
}

function closeReceipt() {
  receiptModal.setAttribute('aria-hidden', 'true');
}

// ==================== Confirm Modal ====================
function openConfirmOrderModal() {
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  confirmTableLabel.textContent = `โต๊ะ ${selectedTable}`;
  confirmOrderList.innerHTML    = cart.map((i) =>
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

// ==================== New Order ====================
async function startNewOrder() {
  localStorage.removeItem('krua-cart');
  orderNumber += 1;
  orderNumberEl.textContent = orderNumber;
  try {
    await update(ref(db, 'meta'), {
      orderNumber,
      lastOrderDate: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error('startNewOrder error:', err);
  }
  cart = [];
  selectedTable = null;
  tableChipEl.textContent = '';
  document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('active'));
  productsOverlay.classList.remove('hidden');
  renderCart();
  closeReceipt();
}

// ==================== Event Listeners ====================
categoryBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    categoryBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    renderProducts();
  });
});

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
  try {
    await saveOrder();
  } catch (err) {
    console.error('saveOrder error:', err);
    alert('เกิดข้อผิดพลาดในการบันทึกออเดอร์ กรุณาตรวจสอบการเชื่อมต่อ');
    confirmOrderOk.disabled = false;
    return;
  }
  confirmOrderOk.disabled = false;
  showReceipt();
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

// Drag
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
window.addEventListener('mouseleave',    (e) => { if (isDragging) onPointerEnd(e.clientY); });

cartHeader.addEventListener('click', () => {
  if (!isMobile() || isDragging) return;
  const didDrag = Math.abs(currentOffset - dragStartOffset) > 5;
  if (didDrag) return;
  if (isOpen) closeCart(); else { getCartMetrics(); openCart(); }
});

window.addEventListener('load',   () => { getCartMetrics(); setOffset(closedOffset); });
window.addEventListener('resize', () => { getCartMetrics(); setOffset(isOpen ? 0 : closedOffset); });

// ==================== Init ====================
setDate();
loadCartFromLocal();
renderProducts();
renderCart();
loadOrderNumber();

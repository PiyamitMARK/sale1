/**
 * ครัวคุณแม่ — POS System
 * Firebase Realtime Database — sync real-time
 * เมนูโหลดจาก Firebase (จัดการผ่าน Backoffice)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, update, get, runTransaction, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==================== Firebase Config ====================
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

signInAnonymously(auth).catch((err) => console.error('Auth error:', err));

// ==================== State ====================
let LIVE_MENU       = {};   // { id: { name, price, category, image, available } }
let LIVE_CATEGORIES = { pad: '🥘 ผัด', khao: '🍚 ข้าว', tom: '🍲 ต้ม/แกง', nam: '🥤 เครื่องดื่ม' };
let LIVE_CAT_SORT   = [];   // ['pad','khao',...]
let LIVE_TOPPINGS   = {};   // { id: { label, price } }

let cart = [];
let orderNumber = 1001;
let currentCategory = '';
let selectedTable = null;

// ==================== DOM ====================
const currentDateEl    = document.getElementById('currentDate');
const orderNumberEl    = document.getElementById('orderNumber');
const tableChipEl      = document.getElementById('tableChip');
const categoriesNav    = document.querySelector('.categories');
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

// ==================== Category Tabs (dynamic) ====================
function getCatOrder() {
  const allCats = Object.keys(LIVE_CATEGORIES);
  if (LIVE_CAT_SORT && LIVE_CAT_SORT.length > 0) {
    const sorted = LIVE_CAT_SORT.filter(id => allCats.includes(id));
    const rest   = allCats.filter(id => !sorted.includes(id));
    return [...sorted, ...rest];
  }
  return allCats;
}

function renderCategoryTabs() {
  const order = getCatOrder();
  if (!currentCategory || !LIVE_CATEGORIES[currentCategory]) {
    currentCategory = order[0] || '';
  }

  categoriesNav.innerHTML = order.map((id) => {
    const label = LIVE_CATEGORIES[id] || id;
    return `<button class="category-btn${id === currentCategory ? ' active' : ''}" data-category="${id}">${escapeHtml(label)}</button>`;
  }).join('');

  categoriesNav.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      categoriesNav.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderProducts();
    });
  });
}

// ==================== Products ====================
function getMenuForCategory(catId) {
  return Object.entries(LIVE_MENU)
    .filter(([, m]) => m.category === catId && m.available !== false)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name, 'th'));
}

function renderProducts() {
  const items = getMenuForCategory(currentCategory);

  if (items.length === 0) {
    productsGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted,#999);padding:2rem">ไม่มีเมนูในหมวดนี้</p>';
    return;
  }

  productsGrid.innerHTML = items.map((p) => `
    <button type="button" class="product-card"
      data-id="${escapeAttr(p.id)}" data-name="${escapeAttr(p.name)}"
      data-price="${p.price}" data-image="${escapeAttr(p.image || '')}">
      <img class="product-img" src="${escapeAttr(p.image || '')}" alt="${escapeAttr(p.name)}" loading="lazy"
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

// ==================== Option Modal ====================
const optionModal       = document.getElementById('optionModal');
const optionProductName = document.getElementById('optionProductName');
const optionNote        = document.getElementById('optionNote');
const optionCancel      = document.getElementById('optionCancel');
const optionConfirm     = document.getElementById('optionConfirm');

let pendingProduct = null;

// spice options ตามหมวด (คงเดิม — ปรับได้ภายหลัง)
const SPICE_BY_CATEGORY = {
  pad:  ['ปกติ', 'ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'เผ็ดพิเศษ'],
  khao: ['ปกติ', 'ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'เผ็ดพิเศษ'],
  tom:  ['ปกติ', 'ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'เผ็ดพิเศษ'],
};

function renderOptionModal(category) {
  const spiceGroup   = document.getElementById('spiceGroup');
  const toppingGroup = document.getElementById('toppingGroup');
  const spiceSection = document.getElementById('spiceSection');

  // Spice
  const spiceList = SPICE_BY_CATEGORY[category] || [];
  if (spiceList.length === 0) {
    spiceSection.style.display = 'none';
  } else {
    spiceSection.style.display = '';
    spiceGroup.innerHTML = spiceList.map((s, i) =>
      `<button type="button" class="option-pill${i === 0 ? ' active' : ''}" data-group="spice" data-value="${i === 0 ? '' : escapeAttr(s)}">${escapeHtml(s)}</button>`
    ).join('');
    spiceGroup.querySelectorAll('.option-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        spiceGroup.querySelectorAll('.option-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // Toppings — ดึงจาก Firebase (LIVE_TOPPINGS)
  const toppingEntries = Object.entries(LIVE_TOPPINGS);
  if (toppingEntries.length === 0) {
    toppingGroup.innerHTML = '<p style="font-size:.82rem;color:#999">ไม่มี topping</p>';
  } else {
    toppingGroup.innerHTML = toppingEntries.map(([, t]) => {
      const label = t.label || t;
      const price = t.price || 0;
      const display = price > 0 ? `${label} +฿${price}` : label;
      return `<button type="button" class="option-pill toggle" data-group="topping" data-value="${escapeAttr(label)}" data-price="${price}">${escapeHtml(display)}</button>`;
    }).join('');
    toppingGroup.querySelectorAll('.option-pill.toggle').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
  }
}

function openOptionModal(dataset) {
  pendingProduct = dataset;
  optionProductName.textContent = dataset.name;
  optionNote.value = '';

  // หาหมวดของสินค้าจาก LIVE_MENU
  const menuItem = LIVE_MENU[dataset.id];
  const category = menuItem?.category || currentCategory;
  renderOptionModal(category);

  optionModal.setAttribute('aria-hidden', 'false');
}

function closeOptionModal() {
  optionModal.setAttribute('aria-hidden', 'true');
  pendingProduct = null;
}

optionCancel.addEventListener('click', closeOptionModal);
optionModal.addEventListener('click', (e) => { if (e.target === optionModal) closeOptionModal(); });

optionConfirm.addEventListener('click', () => {
  if (!pendingProduct) return;

  const spice    = document.querySelector('#spiceGroup .option-pill.active')?.dataset.value || '';
  const toppings = [...document.querySelectorAll('#toppingGroup .option-pill.toggle.active')];
  const note     = optionNote.value.trim();

  const optionParts = [];
  if (spice) optionParts.push(spice);
  toppings.forEach(t => optionParts.push(t.dataset.value));
  if (note) optionParts.push(note);
  const optionLabel = optionParts.join(' · ');

  const extraPrice = toppings.reduce((sum, t) => sum + (parseFloat(t.dataset.price) || 0), 0);

  addToCart(pendingProduct, optionLabel, extraPrice);
  closeOptionModal();
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

// ==================== Firebase: Load Menu ====================
async function loadMenuFromFirebase() {
  try {
    const [menuSnap, catSnap, catSortSnap, toppingsSnap] = await Promise.all([
      get(ref(db, 'menu')),
      get(ref(db, 'meta/categories')),
      get(ref(db, 'meta/categoriesSort')),
      get(ref(db, 'meta/toppings')),
    ]);

    if (menuSnap.exists()) {
      LIVE_MENU = menuSnap.val();
    }
    if (catSnap.exists() && Object.keys(catSnap.val()).length > 0) {
      LIVE_CATEGORIES = catSnap.val();
    }
    if (catSortSnap.exists() && Array.isArray(catSortSnap.val())) {
      LIVE_CAT_SORT = catSortSnap.val();
    }
    if (toppingsSnap.exists()) {
      LIVE_TOPPINGS = toppingsSnap.val();
    }
  } catch (err) {
    console.error('loadMenuFromFirebase error:', err);
  }

  renderCategoryTabs();
  renderProducts();

  // Realtime sync: menu
  onValue(ref(db, 'menu'), snap => {
    LIVE_MENU = snap.exists() ? snap.val() : {};
    renderCategoryTabs();
    renderProducts();
  });

  // Realtime sync: categories
  onValue(ref(db, 'meta/categories'), snap => {
    if (snap.exists() && Object.keys(snap.val()).length > 0) {
      LIVE_CATEGORIES = snap.val();
    }
    renderCategoryTabs();
    renderProducts();
  });

  // Realtime sync: category sort
  onValue(ref(db, 'meta/categoriesSort'), snap => {
    if (snap.exists() && Array.isArray(snap.val())) {
      LIVE_CAT_SORT = snap.val();
    }
    renderCategoryTabs();
    renderProducts();
  });

  // Realtime sync: toppings
  onValue(ref(db, 'meta/toppings'), snap => {
    LIVE_TOPPINGS = snap.exists() ? snap.val() : {};
  });
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
loadOrderNumber();
loadMenuFromFirebase();   // โหลดเมนูจาก Firebase (แทน hardcode)
renderCart();

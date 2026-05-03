/**
 * bill-feature.js — รวมบิล / แยกบิล
 *
 * วิธีใช้ใน admin.js:
 *   import { initBillFeature } from './bill-feature.js';
 *   // เรียกหลังจาก allOrders พร้อมแล้ว และก่อน renderOrders()
 *   initBillFeature({ getOrders: () => allOrders, db, markOrderAsPaid, printOrderReceipt, formatMoney, escapeHtml });
 *
 * จะ inject:
 *   1) ปุ่ม "✂ แยกบิล" ใน order card ทุกใบ
 *   2) toolbar "รวมบิล" เหนือ ordersList
 *   3) Modal รวมบิล / แยกบิล
 */

// ─── ตัวแปร state ───────────────────────────────────────────────
let _cfg = null;
let mergeMode   = false;           // กำลังเลือกออเดอร์เพื่อรวม
let mergeSelected = new Set();     // firebaseKey ที่เลือก
let billModal   = null;
let billModalMode = 'merge';       // 'merge' | 'split-equal' | 'split-custom'
let splitOrderKey = null;          // key ของออเดอร์ที่จะแยก
let splitPeople = [];              // [{ id, name, itemRefs: Set<"batchIdx_itemIdx"> }]
let splitPeopleCount = 2;

const PAYMENT_OPTS = [
  { value: 'cash',     icon: '💵', label: 'เงินสด' },
  { value: 'qr',       icon: '📱', label: 'QR/PromptPay' },
  { value: 'credit',   icon: '💳', label: 'บัตร' },
  { value: 'transfer', icon: '🏦', label: 'โอน' },
];

// ─── Init ────────────────────────────────────────────────────────
export function initBillFeature(cfg) {
  _cfg = cfg;
  _injectModal();
  _injectMergeBar();
}

// ─── เรียกหลัง renderOrders() เพื่อเพิ่มปุ่มใน order cards ──────
export function bindBillButtons(container) {
  if (!_cfg) return;
  container.querySelectorAll('.order-card').forEach(card => {
    const key = card.dataset.key;
    if (!key) return;

    // ถ้าอยู่ใน merge mode ให้การ์ดนี้ toggle selection
    card.classList.toggle('order-card--merge-selectable', mergeMode);
    if (mergeMode) {
      card.classList.toggle('order-card--merge-selected', mergeSelected.has(key));
      card.addEventListener('click', _onMergeCardClick, { once: true });
    }

    // หา actions div และใส่ปุ่มแยกบิล เฉพาะ served / paid
    const isServedOrPaid = card.classList.contains('order-card--served');
    const actions = card.querySelector('.order-actions');
    if (isServedOrPaid && actions && !actions.querySelector('.btn-split-bill')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-split-bill';
      btn.dataset.key = key;
      btn.textContent = '✂ แยกบิล';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _openSplitModal(key);
      });
      // ใส่ก่อนปุ่มสุดท้าย (ลบ)
      const delBtn = actions.querySelector('.btn-delete');
      if (delBtn) actions.insertBefore(btn, delBtn);
      else actions.appendChild(btn);
    }
  });
}

// ─── Merge Bar ───────────────────────────────────────────────────
function _injectMergeBar() {
  if (document.getElementById('mergeBillBar')) return;
  const bar = document.createElement('div');
  bar.id = 'mergeBillBar';
  bar.className = 'merge-bill-bar hidden';
  bar.innerHTML = `
    <span class="merge-bill-bar-label">🟡 เลือกออเดอร์ที่ต้องการรวมบิล <span class="merge-bill-bar-count" id="mergeCount">0</span></span>
    <button type="button" class="btn-cancel-merge" id="cancelMergeBtn">ยกเลิก</button>
    <button type="button" class="btn-do-merge" id="doMergeBtn" disabled>รวมบิล →</button>
  `;
  const tabRecent = document.getElementById('tabRecent');
  if (tabRecent) tabRecent.prepend(bar);

  document.getElementById('cancelMergeBtn').addEventListener('click', _cancelMergeMode);
  document.getElementById('doMergeBtn').addEventListener('click', _openMergeModal);
}

function _startMergeMode() {
  mergeMode = true;
  mergeSelected.clear();
  document.getElementById('mergeBillBar')?.classList.remove('hidden');
  _refreshMergeBar();
  // re-bind card listeners
  _rebindOrderCards();
}
function _cancelMergeMode() {
  mergeMode = false;
  mergeSelected.clear();
  document.getElementById('mergeBillBar')?.classList.add('hidden');
  _rebindOrderCards();
}
function _rebindOrderCards() {
  const container = document.getElementById('ordersList');
  if (container) bindBillButtons(container);
}
function _onMergeCardClick(e) {
  const card = e.currentTarget;
  const key = card.dataset.key;
  if (!key) return;
  if (mergeSelected.has(key)) mergeSelected.delete(key);
  else mergeSelected.add(key);
  card.classList.toggle('order-card--merge-selected', mergeSelected.has(key));
  _refreshMergeBar();
}
function _refreshMergeBar() {
  const count = mergeSelected.size;
  const countEl = document.getElementById('mergeCount');
  const doBtn   = document.getElementById('doMergeBtn');
  if (countEl) countEl.textContent = count;
  if (doBtn) doBtn.disabled = count < 2;
}

// ─── Modal ───────────────────────────────────────────────────────
function _injectModal() {
  if (document.getElementById('billModal')) return;
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'billModal';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="modal-box" id="billModalBox">
      <div class="bill-modal-header">
        <span class="bill-modal-title" id="billModalTitle">รวมบิล</span>
        <button type="button" class="bill-modal-close" id="billModalClose">✕</button>
      </div>
      <div class="bill-modal-tabs" id="billModalTabs" style="display:none">
        <button class="bill-modal-tab active" data-bmode="split-equal">แยกเท่าๆ กัน</button>
        <button class="bill-modal-tab" data-bmode="split-custom">แยกตามคน</button>
      </div>
      <div class="bill-modal-body" id="billModalBody"></div>
      <div class="bill-modal-footer" id="billModalFooter"></div>
    </div>
  `;
  document.body.appendChild(el);
  billModal = el;

  document.getElementById('billModalClose').addEventListener('click', _closeBillModal);
  el.addEventListener('click', e => { if (e.target === el) _closeBillModal(); });

  document.getElementById('billModalTabs').addEventListener('click', e => {
    const tab = e.target.closest('.bill-modal-tab');
    if (!tab) return;
    billModalMode = tab.dataset.bmode;
    el.querySelectorAll('.bill-modal-tab').forEach(t => t.classList.toggle('active', t.dataset.bmode === billModalMode));
    _renderSplitBody();
  });
}
function _closeBillModal() {
  if (billModal) {
    billModal.setAttribute('aria-hidden', 'true');
    billModal.style.display = '';
  }
}
function _openBillModal() {
  if (!billModal) _injectModal();
  billModal.setAttribute('aria-hidden', 'false');
  billModal.style.display = 'flex';
}

// ─── Merge orders เป็น record เดียวใน Firebase ──────────────────
async function _mergeOrdersInFirebase(orders, paymentMethod) {
  const { db, firebaseUtils } = _cfg;
  if (!firebaseUtils) throw new Error('firebaseUtils ไม่ได้ถูก inject ใน initBillFeature');
  const { push, set, remove, get, ref, update } = firebaseUtils;

  // 1. รวม batches จากทุก order เรียงตาม date
  const sorted = [...orders].sort((a, b) => new Date(a.date) - new Date(b.date));
  const mergedBatches = sorted.flatMap(o => o.batches || [o.items || []]);
  const grandTotal    = sorted.reduce((s, o) => s + (o.total || 0), 0);
  const orderNums     = sorted.map(o => o.orderNumber);

  // ถ้า order ที่รวมล้วนเป็น takeaway ให้ใช้ slot แรก และตั้ง takeaway: true
  const allTakeaway = sorted.every(o => o.takeaway || String(o.table).startsWith('takeaway'));
  const tableLabel  = allTakeaway
    ? sorted[0].table                                           // คง slot เดิมของ order แรก
    : sorted.map(o => o.table || '-').join('+');               // รวมหมายเลขโต๊ะ

  // 2. สร้าง order ใหม่ (ใช้ orderNumber ของ order แรก เพื่อ continuity)
  const mergedOrder = {
    orderNumber:   sorted[0].orderNumber,
    table:         tableLabel,
    date:          sorted[0].date,
    batches:       mergedBatches,
    total:         grandTotal,
    status:        'paid',
    paymentMethod: paymentMethod || 'cash',
    mergedFrom:    orderNums,   // เก็บหลักฐานว่ารวมมาจาก order ไหน
    mergedAt:      new Date().toISOString(),
    ...(allTakeaway ? { takeaway: true } : {}),
  };

  // 3. push order ใหม่เข้า Firebase
  const newRef = await push(ref(db, 'orders'), mergedOrder);

  // 4. ลบ order เก่าและ tableOrders ของแต่ละโต๊ะออก
  for (const o of sorted) {
    // ลบ tableOrders/{table} ถ้า key ตรงกัน
    if (o.table) {
      try {
        const snap = await get(ref(db, `tableOrders/${o.table}`));
        if (snap.exists() && snap.val().orderKey === o.firebaseKey) {
          await remove(ref(db, `tableOrders/${o.table}`));
        }
      } catch (_) {}
    }
    // ลบ order เก่า
    await remove(ref(db, `orders/${o.firebaseKey}`));
  }

  return newRef.key;
}

// ─── รวมบิล ──────────────────────────────────────────────────────
function _openMergeModal() {
  const orders = _cfg.getOrders().filter(o => mergeSelected.has(o.firebaseKey));
  if (orders.length < 2) return;

  billModalMode = 'merge';
  document.getElementById('billModalTitle').textContent = '🧾 รวมบิล';
  document.getElementById('billModalTabs').style.display = 'none';

  _renderMergeBody(orders);
  _openBillModal();
}

function _renderMergeBody(orders) {
  const { formatMoney, escapeHtml } = _cfg;
  const grandTotal = orders.reduce((s, o) => s + (o.total || 0), 0);
  let selectedPayment = 'cash';

  const rowsHtml = orders.map(o => {
    const batches = o.batches || [o.items || []];
    const items = batches.flat();
    const itemsText = items.slice(0, 3).map(i => escapeHtml(i.name)).join(', ') + (items.length > 3 ? ` +${items.length - 3}` : '');
    return `
      <tr>
        <td>
          <span class="merge-order-chip">#${escapeHtml(String(o.orderNumber))}</span>
          โต๊ะ ${escapeHtml(String(o.table || '-'))}
        </td>
        <td style="color:var(--brown-light);font-size:0.82rem">${itemsText}</td>
        <td style="text-align:right;font-family:'Mitr',sans-serif;font-weight:700;color:var(--accent)">${formatMoney(o.total)}</td>
      </tr>
    `;
  }).join('');

  const paymentHtml = PAYMENT_OPTS.map(p => `
    <div class="bill-pay-option${p.value === 'cash' ? ' selected' : ''}" data-pay="${p.value}">
      <span class="bill-pay-option-icon">${p.icon}</span>
      <span>${p.label}</span>
    </div>
  `).join('');

  document.getElementById('billModalBody').innerHTML = `
    <table class="merge-summary-table">
      <thead><tr><th>ออเดอร์</th><th>รายการ</th><th style="text-align:right">ยอด</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="merge-grand-total-row">
      <span>รวมทั้งหมด (${orders.length} โต๊ะ)</span>
      <span class="merge-grand-total-amt">${formatMoney(grandTotal)}</span>
    </div>
    <div class="bill-payment-section">
      <div class="bill-payment-label">💳 วิธีชำระเงิน</div>
      <div class="bill-payment-grid" id="billPayGrid">${paymentHtml}</div>
    </div>
  `;

  document.getElementById('billPayGrid').addEventListener('click', e => {
    const opt = e.target.closest('.bill-pay-option');
    if (!opt) return;
    selectedPayment = opt.dataset.pay;
    document.querySelectorAll('#billPayGrid .bill-pay-option').forEach(el => el.classList.toggle('selected', el.dataset.pay === selectedPayment));
  });

  document.getElementById('billModalFooter').innerHTML = `
    <button type="button" class="btn btn-outline" id="billCancelBtn">ยกเลิก</button>
    <button type="button" class="btn btn-primary" id="billConfirmMerge">✅ ยืนยันชำระรวม</button>
  `;
  document.getElementById('billCancelBtn').addEventListener('click', _closeBillModal);
  document.getElementById('billConfirmMerge').addEventListener('click', async () => {
    const btn = document.getElementById('billConfirmMerge');
    btn.disabled = true;
    btn.textContent = 'กำลังรวม...';
    try {
      await _mergeOrdersInFirebase(orders, selectedPayment);
      // ปิด merge mode ก่อน close modal เพื่อให้ Firebase re-render ได้ state ที่ถูกต้องทันที
      mergeMode = false;
      mergeSelected.clear();
      _closeBillModal();
      _cancelMergeMode();
      _showToast(`✅ รวมบิล ${orders.length} โต๊ะ (${orders.map(o=>'#'+o.orderNumber).join(', ')}) เป็น order เดียวแล้ว`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '✅ ยืนยันชำระรวม';
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  });
}

// ─── แยกบิล ──────────────────────────────────────────────────────
function _openSplitModal(orderKey) {
  const order = _cfg.getOrders().find(o => o.firebaseKey === orderKey);
  if (!order) return;

  splitOrderKey = orderKey;
  billModalMode = 'split-equal';
  splitPeopleCount = 2;
  splitPeople = [
    { id: 'p1', name: 'คนที่ 1', itemRefs: new Set() },
    { id: 'p2', name: 'คนที่ 2', itemRefs: new Set() },
  ];

  document.getElementById('billModalTitle').textContent = `✂ แยกบิล — ออเดอร์ #${order.orderNumber} โต๊ะ ${order.table || '-'}`;
  const tabs = document.getElementById('billModalTabs');
  tabs.style.display = 'flex';
  tabs.querySelectorAll('.bill-modal-tab').forEach(t => t.classList.toggle('active', t.dataset.bmode === 'split-equal'));

  _renderSplitBody();
  _openBillModal();
}

function _renderSplitBody() {
  if (billModalMode === 'split-equal') _renderSplitEqual();
  else _renderSplitCustom();
}

function _renderSplitEqual() {
  const order = _cfg.getOrders().find(o => o.firebaseKey === splitOrderKey);
  if (!order) return;
  const { formatMoney } = _cfg;
  const total = order.total || 0;

  const updateDisplay = () => {
    const each = total / splitPeopleCount;
    document.getElementById('splitEachAmt').textContent = formatMoney(each);
    document.getElementById('splitTotalLabel').textContent = `${formatMoney(total)} ÷ ${splitPeopleCount} คน`;
    const grid = document.getElementById('splitResultGrid');
    if (grid) {
      grid.innerHTML = Array.from({ length: splitPeopleCount }, (_, i) => `
        <div class="split-result-card">
          <div class="split-result-person">คนที่ ${i + 1}</div>
          <div class="split-result-amt">${formatMoney(each)}</div>
        </div>
      `).join('');
    }
    const minusBtn = document.getElementById('splitMinus');
    const plusBtn  = document.getElementById('splitPlus');
    if (minusBtn) minusBtn.disabled = splitPeopleCount <= 2;
    if (plusBtn)  plusBtn.disabled  = splitPeopleCount >= 20;
    document.getElementById('splitPeopleNum').textContent = splitPeopleCount;
  };

  document.getElementById('billModalBody').innerHTML = `
    <div class="split-equal-wrap">
      <div class="split-equal-info">
        ยอดรวม: <strong>${formatMoney(total)}</strong>
      </div>
      <div class="split-people-row">
        <span class="split-people-label">จำนวนคน</span>
        <div class="split-people-ctrl">
          <button type="button" class="split-people-btn" id="splitMinus" ${splitPeopleCount <= 2 ? 'disabled' : ''}>−</button>
          <span class="split-people-num" id="splitPeopleNum">${splitPeopleCount}</span>
          <button type="button" class="split-people-btn" id="splitPlus">＋</button>
        </div>
        <span style="font-size:0.82rem;color:var(--brown-light)">คนละ <strong id="splitEachAmt">${formatMoney(total / splitPeopleCount)}</strong></span>
      </div>
      <p style="font-size:0.82rem;color:var(--brown-light);margin-top:-0.25rem" id="splitTotalLabel">${formatMoney(total)} ÷ ${splitPeopleCount} คน</p>
      <div class="split-result-grid" id="splitResultGrid"></div>
    </div>
  `;

  document.getElementById('splitMinus').addEventListener('click', () => {
    if (splitPeopleCount > 2) { splitPeopleCount--; updateDisplay(); }
  });
  document.getElementById('splitPlus').addEventListener('click', () => {
    if (splitPeopleCount < 20) { splitPeopleCount++; updateDisplay(); }
  });
  updateDisplay();

  document.getElementById('billModalFooter').innerHTML = `
    <button type="button" class="btn btn-outline" id="billCancelBtn2">ปิด</button>
    <button type="button" class="btn btn-outline" id="splitEqualPrint">🖨 พิมพ์แต่ละใบ</button>
  `;
  document.getElementById('billCancelBtn2').addEventListener('click', _closeBillModal);
  document.getElementById('splitEqualPrint').addEventListener('click', () => {
    const order = _cfg.getOrders().find(o => o.firebaseKey === splitOrderKey);
    if (!order) return;
    const each = order.total / splitPeopleCount;
    for (let i = 0; i < splitPeopleCount; i++) {
      _printSplitReceipt(order, `คนที่ ${i + 1}`, [], each);
    }
  });
}

function _renderSplitCustom() {
  const order = _cfg.getOrders().find(o => o.firebaseKey === splitOrderKey);
  if (!order) return;
  const { formatMoney, escapeHtml } = _cfg;

  // รวม items จากทุก batch เป็น flat list พร้อม index
  const allItems = [];
  const batches = order.batches || [order.items || []];
  batches.forEach((batch, bIdx) => {
    batch.forEach((item, iIdx) => {
      allItems.push({ ...item, ref: `${bIdx}_${iIdx}` });
    });
  });

  const getPersonTotal = (person) => {
    return allItems
      .filter(i => person.itemRefs.has(i.ref))
      .reduce((s, i) => s + i.price * i.qty, 0);
  };

  const getUnassigned = () => {
    const assigned = new Set(splitPeople.flatMap(p => [...p.itemRefs]));
    return allItems.filter(i => !assigned.has(i.ref));
  };

  const render = () => {
    const unassigned = getUnassigned();
    const warnVisible = unassigned.length > 0;

    const itemRowsHtml = allItems.map(item => {
      const btnHtml = splitPeople.map(p => `
        <button type="button" class="split-assign-btn${p.itemRefs.has(item.ref) ? ' active' : ''}"
          data-person="${p.id}" data-item="${item.ref}">${escapeHtml(p.name)}</button>
      `).join('');
      return `
        <div class="split-item-row" data-item="${item.ref}">
          <span class="split-item-name">${escapeHtml(item.name)}${item.option ? ` · <em>${escapeHtml(item.option)}</em>` : ''} ×${item.qty}</span>
          <span class="split-item-price">${formatMoney(item.price * item.qty)}</span>
          <div class="split-item-assign">${btnHtml}</div>
        </div>
      `;
    }).join('');

    const personsHtml = splitPeople.map(p => {
      const myItems = allItems.filter(i => p.itemRefs.has(i.ref));
      const total   = getPersonTotal(p);
      const itemSummary = myItems.length === 0
        ? '<em style="font-size:0.78rem;color:var(--brown-light)">ยังไม่มีรายการ</em>'
        : myItems.map(i => `${escapeHtml(i.name)} ×${i.qty}`).join(', ');
      return `
        <div class="split-person-card" data-person="${p.id}">
          <div class="split-person-header">
            <input type="text" class="split-person-name-input" data-person="${p.id}" value="${escapeHtml(p.name)}" maxlength="20">
            <span class="split-person-total">${formatMoney(total)}</span>
            <button type="button" class="btn-rm-person" data-person="${p.id}" title="ลบ">✕</button>
          </div>
          <div class="split-person-items">${itemSummary}</div>
        </div>
      `;
    }).join('');

    document.getElementById('billModalBody').innerHTML = `
      <div class="split-custom-wrap">
        <div class="split-custom-header">
          <span class="split-custom-hint">กดชื่อคนใต้แต่ละรายการเพื่อกำหนดว่าใครจ่าย</span>
          <button type="button" class="btn-add-person" id="addPersonBtn">＋ เพิ่มคน</button>
        </div>
        <div class="split-items-pool">
          <div class="split-pool-title">รายการทั้งหมด</div>
          ${itemRowsHtml}
        </div>
        <div class="split-unassigned-warn${warnVisible ? ' visible' : ''}">
          ⚠ มี ${unassigned.length} รายการที่ยังไม่ได้กำหนดคน
        </div>
        <div class="split-persons-list">${personsHtml}</div>
      </div>
    `;

    // bind assign buttons
    document.querySelectorAll('.split-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid  = btn.dataset.person;
        const iref = btn.dataset.item;
        const person = splitPeople.find(p => p.id === pid);
        if (!person) return;
        if (person.itemRefs.has(iref)) person.itemRefs.delete(iref);
        else person.itemRefs.add(iref);
        render();
      });
    });

    // bind name inputs
    document.querySelectorAll('.split-person-name-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const p = splitPeople.find(x => x.id === inp.dataset.person);
        if (p) p.name = inp.value;
        // update assign btn labels without full re-render
        document.querySelectorAll(`.split-assign-btn[data-person="${inp.dataset.person}"]`).forEach(b => {
          b.textContent = inp.value;
        });
        document.querySelectorAll(`.split-person-card[data-person="${inp.dataset.person}"] .split-person-name-input`).forEach(b => {
          if (b !== inp) b.value = inp.value;
        });
      });
    });

    // bind remove person
    document.querySelectorAll('.btn-rm-person').forEach(btn => {
      btn.addEventListener('click', () => {
        if (splitPeople.length <= 1) { alert('ต้องมีอย่างน้อย 1 คน'); return; }
        const pid = btn.dataset.person;
        splitPeople = splitPeople.filter(p => p.id !== pid);
        render();
      });
    });

    // bind add person
    document.getElementById('addPersonBtn')?.addEventListener('click', () => {
      const id = 'p' + Date.now();
      splitPeople.push({ id, name: `คนที่ ${splitPeople.length + 1}`, itemRefs: new Set() });
      render();
    });

    // footer
    document.getElementById('billModalFooter').innerHTML = `
      <button type="button" class="btn btn-outline" id="billCancelBtn3">ปิด</button>
      <button type="button" class="btn btn-outline" id="splitCustomPrint">🖨 พิมพ์แยกใบ</button>
    `;
    document.getElementById('billCancelBtn3').addEventListener('click', _closeBillModal);
    document.getElementById('splitCustomPrint').addEventListener('click', () => {
      const order = _cfg.getOrders().find(o => o.firebaseKey === splitOrderKey);
      if (!order) return;
      splitPeople.forEach(p => {
        const myItems = allItems.filter(i => p.itemRefs.has(i.ref));
        const total   = getPersonTotal(p);
        _printSplitReceipt(order, p.name, myItems, total);
      });
    });
  };

  render();
}

// ─── Print split receipt ──────────────────────────────────────────
function _printSplitReceipt(order, personName, items, total) {
  const { escapeHtml } = _cfg;
  const dateStr = new Date(order.date).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHtml = items.length > 0
    ? items.map(i => `
        <tr>
          <td class="col-name">${escapeHtml(i.name)}${i.option ? ` (${escapeHtml(i.option)})` : ''} ×${i.qty}</td>
          <td class="col-price">&#3647;${(i.price * i.qty).toFixed(2)}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="color:#888;text-align:center;padding:0.5rem">(แยกเท่าๆ กัน)</td></tr>`;

  const win = window.open('', '_blank', 'width=340,height=600');
  if (!win) { alert('กรุณาอนุญาต Pop-up ใน Browser ก่อน'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>ใบเสร็จแยก — ${escapeHtml(personName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: 58mm auto; margin: 1mm 4mm; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family:'Sarabun',sans-serif; font-size:13px; color:#1a1a1a; }
  .shop{ font-size:15px; font-weight:700; text-align:center; margin-bottom:2px; }
  .sub { text-align:center; font-size:11px; color:#555; margin-bottom:6px; }
  .divider{ border:none; border-top:1px dashed #999; margin:5px 0; }
  table{ width:100%; border-collapse:collapse; }
  .col-name{ width:70%; padding:2px 0; }
  .col-price{ width:30%; text-align:right; padding:2px 0; }
  .total-row{ display:flex; justify-content:space-between; font-weight:700; font-size:14px; margin-top:4px; }
  .badge{ display:inline-block; background:#f0e9de; border-radius:4px; padding:1px 6px; font-size:11px; color:#5c3d2e; }
  .footer{ text-align:center; font-size:11px; color:#888; margin-top:6px; }
</style>
</head><body>
<p class="shop">ข้าวซอย 90</p>
<p class="sub">ออเดอร์ #${escapeHtml(String(order.orderNumber))} — โต๊ะ ${escapeHtml(String(order.table || '-'))}</p>
<p class="sub">${dateStr}</p>
<p class="sub"><span class="badge">👤 ${escapeHtml(personName)}</span></p>
<hr class="divider">
<table><tbody>${itemsHtml}</tbody></table>
<hr class="divider">
<div class="total-row"><span>รวม (${escapeHtml(personName)})</span><span>&#3647;${Number(total).toFixed(2)}</span></div>
<p class="footer">ขอบคุณที่ใช้บริการ 🙏</p>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
  win.document.close();
}

// ─── Toast helper ─────────────────────────────────────────────────
function _showToast(msg) {
  const t = document.createElement('div');
  t.className = 'new-order-toast';
  const strong = document.createElement('strong');
  strong.textContent = msg;   // textContent ป้องกัน XSS
  t.appendChild(strong);
  document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 4000);
}

// ─── Export helper เพิ่ม "รวมบิล" button ใน toolbar ─────────────
export function injectMergeBillBtn() {
  if (document.getElementById('startMergeBtn')) return;
  const filterBar = document.getElementById('tableFilterBar');
  if (!filterBar) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'startMergeBtn';
  btn.className = 'btn btn-outline';
  btn.style.cssText = 'font-size:0.82rem;padding:0.35rem 0.85rem;margin-left:0.5rem;';
  btn.textContent = '🧾 รวมบิล';
  btn.addEventListener('click', _startMergeMode);
  filterBar.appendChild(btn);
}
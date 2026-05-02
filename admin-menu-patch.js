// ==================== PATCH: เพิ่มใน admin.js (แทนที่ส่วน Menu Management เดิม) ====================
// 1. เพิ่ม import ใน admin.js ตรง import { subscribeAllMenuAdmin, saveMenuItem, ... }

/*
import {
  subscribeAllMenuAdmin, saveMenuItem, toggleMenuItem, deleteMenuItem, generateMenuId,
  CATEGORY_LABELS, PRODUCT_TYPES, DEFAULT_MENU,
  initMenuFormHelper, openMenuAddModal, openMenuEditModal,
  enableMenuDragSort, duplicateMenuItem, updateSortOrders,
} from './menu-manager.js';
*/

// 2. เพิ่มใน initMenuTab() — เรียก initMenuFormHelper พร้อม storage
/*
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
const storage = getStorage(firebaseApp);

function initMenuTab() {
  initMenuFormHelper(db, storage, allMenuData, (action) => {
    // onSaved callback — ไม่ต้องทำอะไร Firebase listener จะ re-render เอง
  });
  menuUnsubscribe = subscribeAllMenuAdmin(db, (data) => {
    allMenuData = data || {};
    if (!document.getElementById('tabMenu')?.classList.contains('hidden')) {
      renderMenuTab();
    }
  });
}
*/

// 3. แก้ renderMenuRow() เพิ่มคอลัมน์ drag handle + promo badge + duplicate
function renderMenuRow(p) {
  const catLabel  = CATEGORY_LABELS[p.category] || p.category;
  const typeLabel = (PRODUCT_TYPES.find(t => t.value === p.productType) || {}).label || p.productType;
  const hasPromo  = p.promo?.enabled;
  const effectivePrice = hasPromo ? (p.promo.promoPrice ?? p.price) : p.price;

  return `
    <tr class="menu-row${p.enabled ? '' : ' menu-row--disabled'}" data-id="${escapeHtml(p.id)}" draggable="true">
      <td style="width:32px; text-align:center">
        <span class="menu-drag-handle" title="ลากเพื่อเรียงลำดับ">⠿</span>
      </td>
      <td>
        <label class="menu-toggle" title="${p.enabled ? 'คลิกเพื่อซ่อน' : 'คลิกเพื่อเปิด'}">
          <input type="checkbox" class="menu-toggle-input" data-id="${escapeHtml(p.id)}" ${p.enabled ? 'checked' : ''}>
          <span class="menu-toggle-slider"></span>
        </label>
      </td>
      <td>
        <span class="menu-item-name" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</span>
        ${hasPromo ? `<span class="menu-promo-badge">${escapeHtml(p.promo.label || 'โปร')}</span>` : ''}
        <button type="button" class="menu-inline-edit-btn" data-field="name" data-id="${escapeHtml(p.id)}" title="แก้ชื่อ">✏️</button>
      </td>
      <td><span class="menu-cat-chip menu-cat-chip--${escapeHtml(p.category)}">${escapeHtml(catLabel)}</span></td>
      <td><span class="menu-type-chip">${escapeHtml(typeLabel)}</span></td>
      <td class="td-price">
        ${hasPromo
          ? `<span class="menu-promo-orig">${p.price}</span><span class="menu-promo-price">${effectivePrice}</span>`
          : `<span class="menu-price-display" data-id="${escapeHtml(p.id)}">${p.price}</span>`
        }
        <button type="button" class="menu-inline-edit-btn" data-field="price" data-id="${escapeHtml(p.id)}" title="แก้ราคา">✏️</button>
      </td>
      <td>
        <div class="menu-action-btns">
          <button type="button" class="btn-menu-edit" data-id="${escapeHtml(p.id)}">🖊 แก้ไข</button>
          <button type="button" class="btn-menu-dup" data-id="${escapeHtml(p.id)}" title="Duplicate">📋</button>
          <button type="button" class="btn-menu-delete" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">🗑</button>
        </div>
      </td>
    </tr>
  `;
}

// 4. แก้ bindMenuTableActions() เพิ่ม drag sort + duplicate
function bindMenuTableActions(container) {
  // toggle enable/disable
  container.querySelectorAll('.menu-toggle-input').forEach(chk => {
    chk.addEventListener('change', async () => {
      await toggleMenuItem(db, chk.dataset.id, chk.checked);
    });
  });

  // inline edit
  container.querySelectorAll('.menu-inline-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { field, id } = btn.dataset;
      const p = allMenuData[id];
      if (!p) return;
      const cell = btn.parentElement;
      const span = cell.querySelector(field === 'price' ? '.menu-price-display' : '.menu-item-name');
      if (span) {
        if (field === 'name')  startInlineEdit(span, btn, id, 'name',  p.name,  'text');
        if (field === 'price') startInlineEdit(span, btn, id, 'price', p.price, 'number');
      }
    });
  });

  // full edit modal (using new modal from menu-manager.js)
  container.querySelectorAll('.btn-menu-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = allMenuData[btn.dataset.id];
      if (p) openMenuEditModal(p);
    });
  });

  // duplicate
  container.querySelectorAll('.btn-menu-dup').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = allMenuData[btn.dataset.id];
      if (!p) return;
      btn.disabled = true;
      try {
        await duplicateMenuItem(db, p);
      } catch (err) {
        alert('Duplicate ไม่สำเร็จ: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // delete
  container.querySelectorAll('.btn-menu-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`ลบเมนู "${btn.dataset.name}" ออก?`)) return;
      await deleteMenuItem(db, btn.dataset.id);
    });
  });

  // drag & drop sort
  const tbody = container.querySelector('#menuTableBody');
  if (tbody) {
    enableMenuDragSort(tbody, async (orderedIds) => {
      await updateSortOrders(db, orderedIds);
    });
  }
}

// 5. แก้ renderMenuTab() เพิ่ม th สำหรับ drag handle และ promo
function renderMenuTab() {
  const container = document.getElementById('menuTabContent');
  if (!container) return;

  const categories = [
    { id: 'all',    label: '🍽 ทั้งหมด' },
    { id: 'setkao', label: '🍱 เซ็ตอาหาร' },
    { id: 'kao',    label: '🍜 อาหาร' },
    { id: 'nam',    label: '🥤 เครื่องดื่ม' },
    { id: 'coffee', label: '☕ กาแฟ' },
    { id: 'soda',   label: '🫧 โซดา' },
  ];

  const items = Object.values(allMenuData)
    .filter(p => menuTabCategory === 'all' || p.category === menuTabCategory)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  container.innerHTML = `
    <div class="menu-mgr-toolbar">
      <div class="menu-mgr-cats">
        ${categories.map(c => `
          <button type="button" class="menu-cat-btn${menuTabCategory === c.id ? ' active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>
        `).join('')}
      </div>
      <button type="button" class="btn btn-primary menu-add-btn" id="menuAddBtn">＋ เพิ่มเมนู</button>
    </div>

    <p class="menu-drag-hint">⠿ ลากแถวเพื่อเรียงลำดับเมนูใหม่</p>

    <div class="menu-mgr-table-wrap">
      <table class="menu-mgr-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th>สถานะ</th>
            <th>ชื่อเมนู</th>
            <th>หมวด</th>
            <th>ประเภท</th>
            <th class="th-price">ราคา (฿)</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody id="menuTableBody">
          ${items.length === 0
            ? `<tr><td colspan="7" class="menu-empty">ไม่มีเมนูในหมวดนี้</td></tr>`
            : items.map(p => renderMenuRow(p)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.menu-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      menuTabCategory = btn.dataset.cat;
      renderMenuTab();
    });
  });

  document.getElementById('menuAddBtn')?.addEventListener('click', openMenuAddModal);
  bindMenuTableActions(container);
}

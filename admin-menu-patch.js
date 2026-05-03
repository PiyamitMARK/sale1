// ==================== PATCH: เพิ่มใน admin.js (แทนที่ส่วน Menu Management เดิม) ====================
// 1. เพิ่ม import ใน admin.js ตรง import { subscribeAllMenuAdmin, saveMenuItem, ... }

/*
import {
  subscribeAllMenuAdmin, saveMenuItem, toggleMenuItem, deleteMenuItem, generateMenuId,
  CATEGORY_LABELS, PRODUCT_TYPES, DEFAULT_MENU,
  initMenuFormHelper, openMenuAddModal, openMenuEditModal,
  enableMenuDragSort, duplicateMenuItem, updateSortOrders,
  subscribeCategories, addCategory, renameCategory, deleteCategory,
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
  // subscribe categories realtime
  subscribeCategories(db, cats => {
    allCategories = cats;
    if (!document.getElementById('tabMenu')?.classList.contains('hidden')) {
      renderMenuTab();
    }
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
// allCategories = object { id: label } ดึงจาก Firebase ผ่าน subscribeCategories
let allCategories = { ...CATEGORY_LABELS };

// เรียกใน initMenuTab() เพื่อ subscribe realtime
// subscribeCategories(db, cats => { allCategories = cats; renderMenuTab(); });

function renderMenuTab() {
  const container = document.getElementById('menuTabContent');
  if (!container) return;

  const categories = [
    { id: 'all', label: '🍽 ทั้งหมด' },
    ...Object.entries(allCategories).map(([id, label]) => ({ id, label })),
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
      <button type="button" class="btn btn-outline btn-sm" id="manageCatsBtn">🗂 จัดการหมวด</button>
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
  document.getElementById('manageCatsBtn')?.addEventListener('click', openCategoryModal);
  bindMenuTableActions(container);
}

// ==================== Category Manager Modal ====================
function openCategoryModal() {
  let modal = document.getElementById('categoryManagerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'categoryManagerModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  function renderModal() {
    modal.innerHTML = `
      <div class="modal-box" style="max-width:480px">
        <h3 class="modal-title">🗂 จัดการหมวดหมู่</h3>
        <p class="modal-desc" style="margin-bottom:1rem">เพิ่ม แก้ชื่อ หรือลบหมวดหมู่เมนู</p>

        <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem">
          ${Object.entries(allCategories).map(([id, label]) => `
            <div style="display:flex;align-items:center;gap:0.5rem">
              <input type="text" class="field-input cat-label-input" data-id="${id}"
                value="${label}" style="flex:1">
              <button type="button" class="btn btn-outline btn-sm cat-rename-btn" data-id="${id}">💾</button>
              <button type="button" class="btn btn-sm cat-delete-btn" data-id="${id}"
                style="background:none;border:1.5px solid #e53e3e;color:#e53e3e;border-radius:999px">🗑</button>
            </div>
          `).join('')}
        </div>

        <div style="border-top:1.5px dashed var(--cream-dark);padding-top:1rem">
          <p style="font-size:0.82rem;font-weight:700;color:var(--brown-light);margin-bottom:0.5rem">＋ เพิ่มหมวดใหม่</p>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <input type="text" class="field-input" id="newCatId" placeholder="id เช่น dessert" style="flex:1;min-width:120px">
            <input type="text" class="field-input" id="newCatLabel" placeholder="ชื่อ เช่น ของหวาน" style="flex:1;min-width:120px">
            <button type="button" class="btn btn-primary btn-sm" id="addCatBtn">เพิ่ม</button>
          </div>
          <p id="catModalError" style="color:#e53e3e;font-size:0.82rem;margin-top:0.4rem;min-height:1rem"></p>
        </div>

        <div class="modal-actions" style="margin-top:0.75rem">
          <button type="button" class="btn btn-outline" id="catModalClose">ปิด</button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    // ปิด modal
    modal.querySelector('#catModalClose').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // บันทึกชื่อ
    modal.querySelectorAll('.cat-rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const newLabel = modal.querySelector(`.cat-label-input[data-id="${id}"]`).value.trim();
        if (!newLabel) return;
        btn.disabled = true;
        try {
          await renameCategory(db, id, newLabel);
          btn.textContent = '✅';
          setTimeout(() => { btn.textContent = '💾'; btn.disabled = false; }, 1000);
        } catch(e) {
          alert('แก้ไม่ได้: ' + e.message);
          btn.disabled = false;
        }
      });
    });

    // ลบหมวด
    modal.querySelectorAll('.cat-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const label = allCategories[id] || id;
        if (!confirm(`ลบหมวด "${label}" ออก?\nเมนูที่อยู่ในหมวดนี้จะยังคงอยู่แต่ไม่มีหมวด`)) return;
        btn.disabled = true;
        try {
          await deleteCategory(db, id);
          // allCategories จะ update ผ่าน subscribeCategories → re-render อัตโนมัติ
          renderModal();
        } catch(e) {
          alert('ลบไม่ได้: ' + e.message);
          btn.disabled = false;
        }
      });
    });

    // เพิ่มหมวดใหม่
    modal.querySelector('#addCatBtn').addEventListener('click', async () => {
      const idInput    = modal.querySelector('#newCatId');
      const labelInput = modal.querySelector('#newCatLabel');
      const errEl      = modal.querySelector('#catModalError');
      errEl.textContent = '';
      try {
        await addCategory(db, idInput.value, labelInput.value);
        idInput.value = '';
        labelInput.value = '';
        renderModal();
      } catch(e) {
        errEl.textContent = e.message;
      }
    });
  }

  renderModal();
}
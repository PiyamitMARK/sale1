/**
 * ข้าวซอย 90 — Menu Manager (Enhanced)
 * ✅ อัปโหลดรูปจากเครื่อง → Firebase Storage
 * ✅ Drag & drop เรียงลำดับ
 * ✅ แก้ไข options/topping
 * ✅ Duplicate เมนู
 * ✅ ราคาพิเศษ/โปรโมชั่น
 * ✅ Preview ก่อนบันทึก
 */

import { getDatabase, ref, set, update, remove, get, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ==================== Default Menu (seed data) ====================
const IMG = (n) => 'images/img' + n + '.png';

export const DEFAULT_MENU = {
  setkao: [
    { id:'setkao13', name:'เซ็ตอิ่มคุ้มคู่❗',            price:129, imageNum:10021, productType:'setkao' },
    { id:'setkao1',  name:'ข้าวซอยน่องไก่ + โค๊ก',        price:85,  imageNum:10012, productType:'setkao' },
    { id:'setkao2',  name:'ข้าวซอยน่องไก่ + ชาไทย',       price:110, imageNum:10013, productType:'setkao' },
    { id:'setkao3',  name:'ข้าวซอยน่องไก่ + มะพร้าวปั่น', price:115, imageNum:10014, productType:'setkao' },
    { id:'setkao4',  name:'ข้าวซอยหมูทอด + โค๊ก',         price:85,  imageNum:10020, productType:'setkao' },
    { id:'setkao5',  name:'ข้าวซอยหมูทอด + ชาไทย',        price:110, imageNum:10019, productType:'setkao' },
    { id:'setkao6',  name:'ข้าวซอยหมูทอด + มะพร้าวปั่น',  price:115, imageNum:10018, productType:'setkao' },
    { id:'setkao7',  name:'น้ำเงี้ยว + โค๊ก',             price:75,  imageNum:10015, productType:'setkao' },
    { id:'setkao8',  name:'น้ำเงี้ยว + ชาไทย',            price:100, imageNum:10016, productType:'setkao' },
    { id:'setkao9',  name:'น้ำเงี้ยว + มะพร้าวปั่น',      price:105, imageNum:10017, productType:'setkao' },
    { id:'setkao10', name:'ข้าวหมูทอด + โค๊ก',            price:65,  imageNum:10009, productType:'setkao' },
    { id:'setkao11', name:'ข้าวหมูทอด + ชาไทย',           price:90,  imageNum:10010, productType:'setkao' },
    { id:'setkao12', name:'ข้าวหมูทอด + มะพร้าวปั่น',     price:95,  imageNum:10011, productType:'setkao' },
  ],
  kao: [
    { id:'kao1', name:'ข้าวซอยน่องไก่', price:70, imageNum:111,   productType:'kaosoi' },
    { id:'kao2', name:'ข้าวซอยหมูทอด', price:70, imageNum:1007,  productType:'kaosoi' },
    { id:'kao3', name:'น้ำเงี้ยว',      price:60, imageNum:555,   productType:'namngiao' },
    { id:'kao4', name:'ข้าวหมูทอด',    price:50, imageNum:7667,  productType:'kaomutod' },
    { id:'kao7', name:'ลาบเหนือ',      price:60, imageNum:10001, productType:'kaomutod' },
    { id:'kao8', name:'ข้าวเหนียว',    price:10, imageNum:10002, productType:'simple' },
    { id:'kao9', name:'ข้าวสวย',       price:10, imageNum:10003, productType:'simple' },
    { id:'kao5', name:'แคบหมู',        price:15, imageNum:98789, productType:'simple' },
    { id:'kao6', name:'ไข่ต้ม',        price:10, imageNum:1090,  productType:'simple' },
  ],
  nam: [
    { id:'nam1',  name:'น้ำเปล่า',      price:10, imageNum:60,  productType:'drink-ready' },
    { id:'nam2',  name:'โค๊ก',          price:15, imageNum:80,  productType:'drink-ready' },
    { id:'nam3',  name:'สไปร์ท',        price:15, imageNum:345, productType:'drink-ready' },
    { id:'nam4',  name:'มะพร้าวปั่น',   price:45, imageNum:333, productType:'mapraopun' },
    { id:'nam5',  name:'ชาไทย',         price:40, imageNum:1,   productType:'drink-brew' },
    { id:'nam6',  name:'ชาดำเย็น',      price:40, imageNum:5,   productType:'drink-brew' },
    { id:'nam7',  name:'ชามะนาว',       price:40, imageNum:13,  productType:'drink-brew' },
    { id:'nam8',  name:'นมชมพู',        price:40, imageNum:14,  productType:'drink-brew' },
    { id:'nam9',  name:'โกโก้',         price:40, imageNum:9,   productType:'drink-brew' },
    { id:'nam10', name:'มัทฉะมะพร้าว',  price:60, imageNum:15,  productType:'drink-brew' },
    { id:'nam11', name:'มัทฉะลาเต้',    price:60, imageNum:3,   productType:'drink-brew' },
    { id:'nam12', name:'เพียวมัทฉะ',    price:55, imageNum:2,   productType:'drink-brew' },
  ],
  coffee: [
    { id:'coffee1', name:'เอสเปรสโซ่',        price:55, imageNum:12, productType:'drink-brew' },
    { id:'coffee2', name:'คาปูชิโน่',          price:55, imageNum:7,  productType:'drink-brew' },
    { id:'coffee3', name:'ลาเต้',              price:55, imageNum:4,  productType:'drink-brew' },
    { id:'coffee4', name:'มอคค่า',             price:55, imageNum:12, productType:'drink-brew' },
    { id:'coffee5', name:'อเมริกาโน่',          price:45, imageNum:5,  productType:'drink-brew' },
    { id:'coffee6', name:'อเมริกาโน่มะพร้าว',  price:60, imageNum:6,  productType:'drink-brew' },
    { id:'coffee7', name:'อเมริกาโน่น้ำผึ้ง',  price:60, imageNum:5,  productType:'drink-brew' },
    { id:'coffee8', name:'อเมริกาโน่ส้ม',      price:60, imageNum:8,  productType:'drink-brew' },
  ],
  soda: [
    { id:'soda1', name:'แดงมะนาวโซดา',      price:35, imageNum:23, productType:'drink-ready' },
    { id:'soda2', name:'บลูฮาวายมะนาวโซดา', price:35, imageNum:26, productType:'drink-ready' },
    { id:'soda3', name:'แอปเปิ้ลโซดา',      price:35, imageNum:24, productType:'drink-ready' },
    { id:'soda4', name:'ส้มโซดา',           price:35, imageNum:25, productType:'drink-ready' },
    { id:'soda5', name:'สตรอเบอร์รี่โซดา',  price:35, imageNum:30, productType:'drink-ready' },
    { id:'soda6', name:'บลูเบอร์รี่โซดา',   price:35, imageNum:21, productType:'drink-ready' },
  ],
};

export const CATEGORY_LABELS = {
  setkao: 'เซ็ตอาหาร',
  kao:    'อาหาร',
  nam:    'เครื่องดื่ม',
  coffee: 'กาแฟ',
  soda:   'โซดา',
};

export const PRODUCT_TYPES = [
  { value: 'kaosoi',      label: '🍜 ข้าวซอย' },
  { value: 'namngiao',    label: '🍜 น้ำเงี้ยว' },
  { value: 'kaomutod',    label: '🍚 ข้าวหมูทอด' },
  { value: 'mapraopun',   label: '🥥 มะพร้าวปั่น' },
  { value: 'drink-brew',  label: '☕ เครื่องดื่มชง' },
  { value: 'drink-ready', label: '🥤 เครื่องดื่มสำเร็จ' },
  { value: 'setkao',      label: '🍱 เซ็ตอาหาร' },
  { value: 'simple',      label: '🍽 เมนูเดี่ยว' },
];

// ==================== Firebase helpers ====================

export async function loadMenuFromFirebase(db) {
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) {
    await seedDefaultMenu(db);
    return buildProductsFromDefault();
  }
  return parseMenuSnapshot(snap.val());
}

export function subscribeMenu(db, callback) {
  return onValue(ref(db, 'menu'), (snap) => {
    if (!snap.exists()) {
      callback(buildProductsFromDefault());
      return;
    }
    callback(parseMenuSnapshot(snap.val()));
  });
}

function parseMenuSnapshot(data) {
  const result = { setkao: [], kao: [], nam: [], coffee: [], soda: [] };
  Object.values(data).forEach(item => {
    const cat = item.category;
    if (!result[cat]) result[cat] = [];

    // ราคาที่ใช้จริง: ถ้ามีโปรโมชั่นที่ active ให้ใช้ promoPrice
    const effectivePrice = getEffectivePrice(item);

    result[cat].push({
      id:          item.id,
      name:        item.name,
      price:       effectivePrice,
      originalPrice: item.price,
      promoLabel:  item.promo?.enabled ? item.promo.label : null,
      image:       item.imageUrl || IMG(item.imageNum),
      productType: item.productType,
      options:     item.options || null,
      enabled:     item.enabled !== false, // ส่ง flag ให้ customer.js แสดงแบบ greyed-out
    });
  });
  Object.keys(result).forEach(cat => {
    result[cat].sort((a, b) => {
      const da = data[a.id], db2 = data[b.id];
      return (da?.sortOrder ?? 999) - (db2?.sortOrder ?? 999);
    });
  });
  return result;
}

/** คำนวณราคาจริงโดยคำนึงถึงโปรโมชั่น */
export function getEffectivePrice(item) {
  if (!item.promo?.enabled) return item.price;
  const now = new Date();
  const from = item.promo.dateFrom ? new Date(item.promo.dateFrom) : null;
  const to   = item.promo.dateTo   ? new Date(item.promo.dateTo + 'T23:59:59') : null;
  if (from && now < from) return item.price;
  if (to   && now > to)   return item.price;
  return item.promo.promoPrice ?? item.price;
}

function buildProductsFromDefault() {
  const result = {};
  Object.entries(DEFAULT_MENU).forEach(([cat, items]) => {
    result[cat] = items.map(p => ({
      id:          p.id,
      name:        p.name,
      price:       p.price,
      image:       IMG(p.imageNum),
      productType: p.productType,
    }));
  });
  return result;
}

async function seedDefaultMenu(db) {
  const writes = {};
  let sortOrder = 0;
  Object.entries(DEFAULT_MENU).forEach(([cat, items]) => {
    items.forEach(item => {
      writes[item.id] = {
        id:          item.id,
        name:        item.name,
        price:       item.price,
        category:    cat,
        productType: item.productType,
        imageNum:    item.imageNum,
        enabled:     true,
        sortOrder:   sortOrder++,
      };
    });
  });
  await set(ref(db, 'menu'), writes);
}

// ==================== Admin CRUD ====================

export async function loadAllMenuAdmin(db) {
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) {
    await seedDefaultMenu(db);
    const snap2 = await get(ref(db, 'menu'));
    return snap2.val() || {};
  }
  return snap.val();
}

export function subscribeAllMenuAdmin(db, callback) {
  return onValue(ref(db, 'menu'), async (snap) => {
    if (!snap.exists()) {
      await seedDefaultMenu(db);
      return;
    }
    callback(snap.val());
  });
}

export async function saveMenuItem(db, item) {
  await set(ref(db, `menu/${item.id}`), item);
}

export async function toggleMenuItem(db, id, enabled) {
  await update(ref(db, `menu/${id}`), { enabled });
}

export async function deleteMenuItem(db, id) {
  await remove(ref(db, `menu/${id}`));
}

export async function updateMenuPrice(db, id, price) {
  await update(ref(db, `menu/${id}`), { price: Number(price) });
}

export async function updateMenuName(db, id, name) {
  await update(ref(db, `menu/${id}`), { name });
}

export function generateMenuId(category) {
  return category + '_' + Date.now().toString(36);
}

/** อัปเดต sortOrder หลาย items พร้อมกัน (สำหรับ drag & drop) */
export async function updateSortOrders(db, orderedIds) {
  const updates = {};
  orderedIds.forEach((id, idx) => {
    updates[`menu/${id}/sortOrder`] = idx;
  });
  await update(ref(db), updates);
}

/** Duplicate เมนู */
export async function duplicateMenuItem(db, item) {
  const newId   = generateMenuId(item.category);
  const newItem = {
    ...JSON.parse(JSON.stringify(item)),
    id:        newId,
    name:      item.name + ' (สำเนา)',
    sortOrder: (item.sortOrder ?? 999) + 0.5,
    enabled:   false, // ซ่อนไว้ก่อน ให้ admin เปิดเองเมื่อพร้อม
  };
  await saveMenuItem(db, newItem);
  return newId;
}

/** บันทึกโปรโมชั่น */
export async function savePromo(db, id, promo) {
  await update(ref(db, `menu/${id}`), { promo });
}

/** บันทึก options/toppings */
export async function saveMenuOptions(db, id, options) {
  await update(ref(db, `menu/${id}`), { options });
}

// ==================== Firebase Storage Upload ====================

/**
 * อัปโหลดรูปไปยัง Firebase Storage
 * @param {object} storageInstance - Firebase Storage instance
 * @param {File}   file            - File object จาก <input type="file">
 * @param {string} menuId          - menu item id (ใช้เป็น filename)
 * @param {function} onProgress    - callback(percent: number)
 * @returns {Promise<string>}      - download URL
 */
export async function uploadMenuImage(storageInstance, file, menuId, onProgress) {
  // ตรวจสอบประเภทไฟล์
  if (!file.type.startsWith('image/')) {
    throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
  }
  // จำกัดขนาด 5MB
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ขนาดไฟล์ต้องไม่เกิน 5MB');
  }

  // บีบอัดรูปก่อนอัปโหลด
  const compressedBlob = await compressImage(file, 800, 0.82);

  const ext      = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path     = `menu-images/${menuId}.${ext}`;
  const sRef     = storageRef(storageInstance, path);
  const uploadTask = uploadBytesResumable(sRef, compressedBlob, {
    contentType: compressedBlob.type,
    cacheControl: 'public,max-age=31536000',
  });

  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/** บีบอัดรูปด้วย Canvas */
async function compressImage(file, maxSize = 800, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
          else { width = Math.round((width / height) * maxSize); height = maxSize; }
        }
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==================== Menu Form Modal (Enhanced) ====================
// สร้าง Modal UI ทั้งหมดรวมไว้ที่นี่ เพื่อให้ admin.js เรียกใช้งานได้

let _db         = null;
let _storage    = null;
let _allMenuData = {};
let _onSaved    = null;   // callback หลังบันทึก

/** เรียก init ก่อนใช้งาน openMenuFormModal */
export function initMenuFormHelper(db, storageInstance, allMenuDataRef, onSaved) {
  _db          = db;
  _storage     = storageInstance;
  _allMenuData = allMenuDataRef; // object reference — จะ sync อัตโนมัติ
  _onSaved     = onSaved;
  _injectStyles();
}

// ==================== Modal Open/Close ====================

export function openMenuAddModal() {
  openMenuFormModal(null);
}

export function openMenuEditModal(product) {
  openMenuFormModal(product);
}

function openMenuFormModal(product) {
  const isEdit = !!product;
  let modal    = document.getElementById('menuFormModal');
  if (!modal) return;

  const p = product || {};

  // ---- Build form HTML ----
  const catOptions = Object.entries(CATEGORY_LABELS)
    .map(([v, l]) => `<option value="${v}"${p.category === v ? ' selected' : ''}>${_esc(l)}</option>`)
    .join('');
  const typeOptions = PRODUCT_TYPES
    .map(t => `<option value="${t.value}"${p.productType === t.value ? ' selected' : ''}>${_esc(t.label)}</option>`)
    .join('');

  // ---- Promo section ----
  const promo = p.promo || {};
  const promoEnabled  = promo.enabled  || false;
  const promoPrice    = promo.promoPrice ?? '';
  const promoLabel    = promo.label    || 'ลดราคา';
  const promoDateFrom = promo.dateFrom || '';
  const promoDateTo   = promo.dateTo   || '';

  // ---- Options summary ----
  const optionsCount = p.options ? p.options.length : 0;

  // ---- Current image ----
  const currentImg = p.imageUrl || (p.imageNum ? IMG(p.imageNum) : '');

  modal.querySelector('.modal-box').innerHTML = `
    <div class="mf-header">
      <h3 class="modal-title">${isEdit ? '🖊 แก้ไขเมนู' : '＋ เพิ่มเมนูใหม่'}</h3>
      <div class="mf-header-actions">
        <button type="button" class="btn btn-outline btn-sm" id="mfPreviewBtn">👁 Preview</button>
        <button type="button" class="mf-close-btn" id="mfCloseBtn">✕</button>
      </div>
    </div>

    <div class="mf-scroll-body">

      <!-- ===== รูปภาพ ===== -->
      <section class="mf-section">
        <div class="mf-section-title">🖼 รูปภาพ</div>
        <div class="mf-image-row">
          <div class="mf-image-preview-wrap">
            <img id="mfImagePreview" class="mf-image-preview" src="${_esc(currentImg)}" 
              alt="preview" style="${currentImg ? '' : 'display:none'}">
            <div class="mf-image-placeholder" id="mfImagePlaceholder" style="${currentImg ? 'display:none' : ''}">
              <span>📷</span><span>ไม่มีรูป</span>
            </div>
          </div>
          <div class="mf-image-controls">
            <label class="btn btn-outline btn-sm mf-upload-label" for="mfImageFile">
              📁 เลือกรูปจากเครื่อง
            </label>
            <input type="file" id="mfImageFile" accept="image/*" style="display:none">
            <div class="mf-upload-progress hidden" id="mfUploadProgress">
              <div class="mf-progress-bar">
                <div class="mf-progress-fill" id="mfProgressFill" style="width:0%"></div>
              </div>
              <span class="mf-progress-text" id="mfProgressText">0%</span>
            </div>
            <div class="field" style="margin-top:0.5rem">
              <label class="field-label">หรือใส่เลขรูป (imageNum)</label>
              <input type="number" id="mfImage" class="field-input" value="${p.imageNum ?? ''}" 
                placeholder="เช่น 111" min="0" style="width:120px">
            </div>
            <input type="hidden" id="mfImageUrl" value="${_esc(p.imageUrl || '')}">
          </div>
        </div>
      </section>

      <!-- ===== ข้อมูลหลัก ===== -->
      <section class="mf-section">
        <div class="mf-section-title">📝 ข้อมูลเมนู</div>
        <div class="menu-form-grid">
          <div class="field">
            <label class="field-label">ชื่อเมนู *</label>
            <input type="text" id="mfName" class="field-input" value="${_esc(p.name || '')}" 
              placeholder="เช่น ข้าวซอยน่องไก่" maxlength="60">
          </div>
          <div class="field">
            <label class="field-label">ราคาปกติ (฿) *</label>
            <input type="number" id="mfPrice" class="field-input" value="${p.price ?? ''}" 
              placeholder="0" min="0" step="1">
          </div>
          <div class="field">
            <label class="field-label">หมวดหมู่</label>
            <select id="mfCategory" class="field-input">${catOptions}</select>
          </div>
          <div class="field">
            <label class="field-label">ประเภท (options)</label>
            <select id="mfType" class="field-input">${typeOptions}</select>
          </div>
        </div>
      </section>

      <!-- ===== โปรโมชั่น ===== -->
      <section class="mf-section">
        <div class="mf-section-header">
          <div class="mf-section-title">🏷️ ราคาพิเศษ / โปรโมชั่น</div>
          <button type="button" class="mf-promo-toggle-btn${promoEnabled ? ' active' : ''}" id="mfPromoToggleBtn">
            ${promoEnabled ? '✅ เปิดอยู่' : 'เปิดใช้งาน'}
          </button>
          <input type="hidden" id="mfPromoEnabled" value="${promoEnabled ? '1' : '0'}">
        </div>
        <div class="mf-promo-body" id="mfPromoBody" style="${promoEnabled ? '' : 'display:none'}">
          <div class="menu-form-grid">
            <div class="field">
              <label class="field-label">ราคาพิเศษ (฿)</label>
              <input type="number" id="mfPromoPrice" class="field-input mf-promo-price-input" 
                value="${promoPrice}" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label class="field-label">ป้ายโปรโมชั่น</label>
              <input type="text" id="mfPromoLabel" class="field-input" value="${_esc(promoLabel)}" 
                placeholder="เช่น ลดราคา, โปรเซ็ต" maxlength="20">
            </div>
            <div class="field">
              <label class="field-label">วันเริ่มต้น (ไม่บังคับ)</label>
              <input type="date" id="mfPromoFrom" class="field-input" value="${promoDateFrom}">
            </div>
            <div class="field">
              <label class="field-label">วันสิ้นสุด (ไม่บังคับ)</label>
              <input type="date" id="mfPromoTo" class="field-input" value="${promoDateTo}">
            </div>
          </div>
          <div class="mf-promo-hint">
            💡 ถ้าไม่กำหนดวันจะเป็นโปรถาวรจนกว่าจะปิด
          </div>
        </div>
      </section>

      <!-- ===== Options / Topping ===== -->
      <section class="mf-section">
        <div class="mf-section-header">
          <div class="mf-section-title">⚙️ Options / Topping</div>
          <button type="button" class="btn btn-outline btn-sm" id="mfEditOptionsBtn">
            ✏️ แก้ไข ${optionsCount > 0 ? `(${optionsCount} กลุ่ม)` : ''}
          </button>
        </div>
        <div id="mfOptionsSummary" class="mf-options-summary">
          ${_renderOptionsSummary(p.options)}
        </div>
        <!-- Options Editor (inline) -->
        <div id="mfOptionsEditor" class="mf-options-editor hidden"></div>
        <input type="hidden" id="mfOptionsData" value="${_esc(JSON.stringify(p.options || null))}">
      </section>

    </div><!-- /mf-scroll-body -->

    <p id="menuFormError" class="login-error" aria-live="polite"></p>
    <div class="mf-footer-actions">
      <button type="button" class="btn btn-ghost-cancel" id="menuFormCancel">ยกเลิก</button>
      <div class="mf-footer-right">
        ${isEdit ? `<button type="button" class="btn btn-outline btn-sm" id="menuFormDuplicate">📋 Duplicate</button>` : ''}
        <button type="button" class="btn btn-primary mf-save-btn" id="menuFormSave">
          ${isEdit ? '💾 บันทึก' : '＋ เพิ่มเมนู'}
        </button>
      </div>
    </div>
  `;

  modal.setAttribute('aria-hidden', 'false');

  // ---- Bind events ----
  const close = () => modal.setAttribute('aria-hidden', 'true');
  document.getElementById('mfCloseBtn')?.addEventListener('click', close);
  document.getElementById('menuFormCancel')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // Image file picker + preview
  const fileInput     = document.getElementById('mfImageFile');
  const imgPreview    = document.getElementById('mfImagePreview');
  const imgPlaceholder= document.getElementById('mfImagePlaceholder');
  const uploadProgress= document.getElementById('mfUploadProgress');
  const progressFill  = document.getElementById('mfProgressFill');
  const progressText  = document.getElementById('mfProgressText');
  const imageUrlInput = document.getElementById('mfImageUrl');

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // ---- Local preview ----
    const localUrl = URL.createObjectURL(file);
    imgPreview.src = localUrl;
    imgPreview.style.display = '';
    imgPlaceholder.style.display = 'none';
  });

  // Promo toggle
  document.getElementById('mfPromoToggleBtn')?.addEventListener('click', () => {
    const hiddenInput = document.getElementById('mfPromoEnabled');
    const btn = document.getElementById('mfPromoToggleBtn');
    const isNowEnabled = hiddenInput.value === '1' ? false : true;
    hiddenInput.value = isNowEnabled ? '1' : '0';
    document.getElementById('mfPromoBody').style.display = isNowEnabled ? '' : 'none';
    btn.textContent = isNowEnabled ? '✅ เปิดอยู่' : 'เปิดใช้งาน';
    btn.classList.toggle('active', isNowEnabled);
  });

  // Options editor
  document.getElementById('mfEditOptionsBtn')?.addEventListener('click', () => {
    _openOptionsEditor(p.options);
  });

  // Preview button
  document.getElementById('mfPreviewBtn')?.addEventListener('click', () => {
    _openPreviewModal(_collectFormData(isEdit ? product : null));
  });

  // Duplicate
  document.getElementById('menuFormDuplicate')?.addEventListener('click', async () => {
    if (!product) return;
    const btn = document.getElementById('menuFormDuplicate');
    btn.disabled = true; btn.textContent = 'กำลัง Duplicate...';
    try {
      await duplicateMenuItem(_db, _allMenuData[product.id] || product);
      close();
      if (_onSaved) _onSaved('duplicate');
    } catch (err) {
      alert('Duplicate ไม่สำเร็จ: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = '📋 Duplicate';
    }
  });

  // Save
  document.getElementById('menuFormSave')?.addEventListener('click', async () => {
    await _handleSave(isEdit, product, uploadProgress, progressFill, progressText, imageUrlInput, fileInput);
  });
}

// ==================== Collect Form Data ====================
function _collectFormData(existingProduct) {
  const name      = document.getElementById('mfName')?.value.trim()    || '';
  const price     = parseInt(document.getElementById('mfPrice')?.value, 10);
  const category  = document.getElementById('mfCategory')?.value        || 'kao';
  const prodType  = document.getElementById('mfType')?.value            || 'simple';
  const imageNum  = parseInt(document.getElementById('mfImage')?.value, 10) || 0;
  const imageUrl  = document.getElementById('mfImageUrl')?.value        || '';
  const optData   = document.getElementById('mfOptionsData')?.value;

  const promoEnabled = document.getElementById('mfPromoEnabled')?.value === '1';
  const promoPrice   = parseInt(document.getElementById('mfPromoPrice')?.value, 10);
  const promoLabel   = document.getElementById('mfPromoLabel')?.value.trim() || 'ลดราคา';
  const promoFrom    = document.getElementById('mfPromoFrom')?.value || '';
  const promoTo      = document.getElementById('mfPromoTo')?.value   || '';

  const promo = promoEnabled ? {
    enabled:    true,
    promoPrice: isNaN(promoPrice) ? price : promoPrice,
    label:      promoLabel,
    dateFrom:   promoFrom || null,
    dateTo:     promoTo   || null,
  } : { enabled: false };

  let options = null;
  try { options = JSON.parse(optData); } catch { options = null; }

  const existing = existingProduct ? (_allMenuData[existingProduct.id] || existingProduct) : null;

  return {
    id:          existing?.id || generateMenuId(category),
    name, price: isNaN(price) ? 0 : price,
    category, productType: prodType,
    imageNum,
    imageUrl:    imageUrl || (existing?.imageUrl || ''),
    enabled:     existing?.enabled ?? true,
    sortOrder:   existing?.sortOrder ?? (Object.keys(_allMenuData).length + 1),
    promo,
    options,
  };
}

// ==================== Handle Save ====================
async function _handleSave(isEdit, product, uploadProgress, progressFill, progressText, imageUrlInput, fileInput) {
  const errEl   = document.getElementById('menuFormError');
  const saveBtn = document.getElementById('menuFormSave');
  errEl.textContent = '';

  const name  = document.getElementById('mfName')?.value.trim();
  const price = parseInt(document.getElementById('mfPrice')?.value, 10);
  if (!name)        { errEl.textContent = 'กรุณากรอกชื่อเมนู'; return; }
  if (isNaN(price)) { errEl.textContent = 'กรุณากรอกราคา'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก...';

  try {
    // ---- อัปโหลดรูปถ้ามีไฟล์ใหม่ ----
    const file = fileInput?.files[0];
    if (file && _storage) {
      const itemId = isEdit ? product.id : generateMenuId(document.getElementById('mfCategory')?.value || 'kao');
      uploadProgress.classList.remove('hidden');
      const url = await uploadMenuImage(_storage, file, itemId, (pct) => {
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      });
      imageUrlInput.value = url;
      uploadProgress.classList.add('hidden');
    }

    const item = _collectFormData(isEdit ? product : null);
    await saveMenuItem(_db, item);

    document.getElementById('menuFormModal')?.setAttribute('aria-hidden', 'true');
    if (_onSaved) _onSaved(isEdit ? 'edit' : 'add');
  } catch (err) {
    errEl.textContent = '❌ บันทึกไม่สำเร็จ: ' + err.message;
    uploadProgress?.classList.add('hidden');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = isEdit ? '💾 บันทึก' : '＋ เพิ่มเมนู';
  }
}

// ==================== Options Editor ====================
function _openOptionsEditor(existingOptions) {
  const container = document.getElementById('mfOptionsEditor');
  const summary   = document.getElementById('mfOptionsSummary');
  if (!container) return;

  const groups = existingOptions ? JSON.parse(JSON.stringify(existingOptions)) : [];

  container.classList.remove('hidden');
  summary.classList.add('hidden');

  function renderEditor() {
    container.innerHTML = `
      <div class="opts-editor-wrap">
        <div id="opts-groups-list">
          ${groups.map((g, gi) => `
            <div class="opts-group-card" data-gi="${gi}">
              <div class="opts-group-header">
                <div class="opts-group-meta">
                  <input type="text" class="opts-group-id field-input" value="${_esc(g.id)}" placeholder="id (e.g. topping)" style="width:100px" data-gi="${gi}" data-f="id">
                  <input type="text" class="opts-group-label field-input" value="${_esc(g.label)}" placeholder="Label เช่น เพิ่มเติม" data-gi="${gi}" data-f="label">
                  <select class="opts-group-type field-input" data-gi="${gi}" data-f="type">
                    <option value="single" ${g.type==='single' ? 'selected' : ''}>single (เลือก 1)</option>
                    <option value="multi"  ${g.type==='multi'  ? 'selected' : ''}>multi (หลายตัว)</option>
                  </select>
                  <label class="mf-check-row" title="มีหมายเหตุ">
                    <input type="checkbox" class="opts-group-hasnote" data-gi="${gi}" ${g.hasNote ? 'checked' : ''}> หมายเหตุ
                  </label>
                </div>
                <button type="button" class="opts-rm-group" data-gi="${gi}">🗑</button>
              </div>
              <div class="opts-choices-list" id="opts-choices-${gi}">
                ${(g.choices || []).map((c, ci) => `
                  <div class="opts-choice-row" data-gi="${gi}" data-ci="${ci}">
                    <input type="text" class="opts-choice-value field-input" value="${_esc(c.value)}" placeholder="value" data-gi="${gi}" data-ci="${ci}" data-cf="value">
                    <input type="text" class="opts-choice-label field-input" value="${_esc(c.label)}" placeholder="แสดงผล" data-gi="${gi}" data-ci="${ci}" data-cf="label">
                    <input type="number" class="opts-choice-price field-input" value="${c.price ?? ''}" placeholder="±ราคา" style="width:80px" data-gi="${gi}" data-ci="${ci}" data-cf="price">
                    <button type="button" class="opts-rm-choice" data-gi="${gi}" data-ci="${ci}">✕</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn btn-outline btn-sm opts-add-choice" data-gi="${gi}" style="margin-top:0.5rem">＋ เพิ่มตัวเลือก</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="opts-add-group" style="margin-top:0.75rem">＋ เพิ่มกลุ่ม</button>
        <div class="opts-editor-footer">
          <button type="button" class="btn btn-outline btn-sm" id="opts-cancel">ยกเลิก</button>
          <button type="button" class="btn btn-primary btn-sm" id="opts-save">💾 บันทึก Options</button>
        </div>
      </div>
    `;

    // bind group field changes
    container.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('change', () => {
        const gi  = parseInt(inp.dataset.gi);
        const fld = inp.dataset.f;
        if (fld === 'type')    groups[gi].type    = inp.value;
        if (fld === 'id')      groups[gi].id      = inp.value.trim();
        if (fld === 'label')   groups[gi].label   = inp.value.trim();
      });
    });
    container.querySelectorAll('.opts-group-hasnote').forEach(chk => {
      chk.addEventListener('change', () => {
        groups[parseInt(chk.dataset.gi)].hasNote = chk.checked;
      });
    });

    // bind choice field changes
    container.querySelectorAll('[data-cf]').forEach(inp => {
      inp.addEventListener('change', () => {
        const gi = parseInt(inp.dataset.gi), ci = parseInt(inp.dataset.ci), cf = inp.dataset.cf;
        if (!groups[gi].choices) groups[gi].choices = [];
        if (cf === 'price') {
          const v = parseFloat(inp.value);
          groups[gi].choices[ci].price = isNaN(v) ? undefined : v;
        } else {
          groups[gi].choices[ci][cf] = inp.value.trim();
        }
      });
    });

    // remove group
    container.querySelectorAll('.opts-rm-group').forEach(btn => {
      btn.addEventListener('click', () => {
        groups.splice(parseInt(btn.dataset.gi), 1);
        renderEditor();
      });
    });

    // remove choice
    container.querySelectorAll('.opts-rm-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        groups[parseInt(btn.dataset.gi)].choices.splice(parseInt(btn.dataset.ci), 1);
        renderEditor();
      });
    });

    // add choice
    container.querySelectorAll('.opts-add-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const gi = parseInt(btn.dataset.gi);
        if (!groups[gi].choices) groups[gi].choices = [];
        groups[gi].choices.push({ value: '', label: '' });
        renderEditor();
        // scroll to new item
        const list = document.getElementById(`opts-choices-${gi}`);
        list?.lastElementChild?.querySelector('input')?.focus();
      });
    });

    // add group
    document.getElementById('opts-add-group')?.addEventListener('click', () => {
      groups.push({ id: 'group' + (groups.length + 1), label: 'กลุ่มใหม่', type: 'single', choices: [], hasNote: false });
      renderEditor();
    });

    // cancel
    document.getElementById('opts-cancel')?.addEventListener('click', () => {
      container.classList.add('hidden');
      summary.classList.remove('hidden');
    });

    // save options to hidden input
    document.getElementById('opts-save')?.addEventListener('click', () => {
      const cleaned = groups.filter(g => g.id && g.label);
      cleaned.forEach(g => {
        g.choices = (g.choices || []).filter(c => c.value || c.label);
      });
      const data = cleaned.length > 0 ? cleaned : null;
      document.getElementById('mfOptionsData').value = JSON.stringify(data);
      document.getElementById('mfOptionsSummary').innerHTML = _renderOptionsSummary(data);
      document.getElementById('mfEditOptionsBtn').textContent =
        `✏️ แก้ไข ${cleaned.length > 0 ? `(${cleaned.length} กลุ่ม)` : ''}`;
      container.classList.add('hidden');
      summary.classList.remove('hidden');
    });
  }

  renderEditor();
}

function _renderOptionsSummary(options) {
  if (!options || options.length === 0) {
    return '<span class="mf-options-none">ไม่มี options (ใช้ default ตามประเภท)</span>';
  }
  return options.map(g => `
    <div class="mf-option-group-chip">
      <span class="mf-option-group-name">${_esc(g.label)}</span>
      <span class="mf-option-type-chip">${g.type === 'multi' ? 'หลายตัว' : 'เลือก 1'}</span>
      <span class="mf-option-choices">${(g.choices || []).map(c => _esc(c.label || c.value)).join(', ')}</span>
    </div>
  `).join('');
}

// ==================== Preview Modal ====================
function _openPreviewModal(item) {
  const effectivePrice = item.promo?.enabled
    ? (item.promo.promoPrice ?? item.price)
    : item.price;

  const imgSrc = item.imageUrl || (item.imageNum ? IMG(item.imageNum) : '');

  // สร้าง overlay preview
  let overlay = document.getElementById('mfPreviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mfPreviewOverlay';
    overlay.className = 'mf-preview-overlay';
    document.body.appendChild(overlay);
  }

  const optionsHtml = item.options ? item.options.map(g => `
    <div class="prev-option-group">
      <div class="prev-option-label">${_esc(g.label)}</div>
      <div class="prev-option-choices">
        ${(g.choices || []).map(c => `<span class="prev-choice-chip">${_esc(c.label || c.value)}</span>`).join('')}
      </div>
    </div>
  `).join('') : '';

  overlay.innerHTML = `
    <div class="mf-preview-box">
      <div class="mf-preview-header">
        <span>👁 Preview — ลูกค้าจะเห็น</span>
        <button type="button" class="mf-close-btn" id="mfPreviewClose">✕</button>
      </div>
      <div class="mf-preview-card-wrap">
        <!-- Card ใน Product Grid -->
        <div class="mf-preview-label">📱 การ์ดในเมนู</div>
        <div class="prev-product-card">
          <div class="prev-product-img-wrap">
            ${imgSrc
              ? `<img class="prev-product-img" src="${_esc(imgSrc)}" alt="${_esc(item.name)}">`
              : `<div class="prev-product-img prev-no-img">🍽</div>`}
            ${item.promo?.enabled ? `<span class="prev-promo-badge">${_esc(item.promo.label || 'ลดราคา')}</span>` : ''}
          </div>
          <div class="prev-product-info">
            <div class="prev-product-name">${_esc(item.name)}</div>
            <div class="prev-product-price">
              ${item.promo?.enabled
                ? `<span class="prev-price-orig">฿${item.price}</span>
                   <span class="prev-price-promo">฿${effectivePrice}</span>`
                : `<span class="prev-price">฿${effectivePrice}</span>`}
            </div>
          </div>
        </div>

        <!-- Option modal preview (ถ้ามี) -->
        ${optionsHtml ? `
          <div class="mf-preview-label" style="margin-top:1.25rem">⚙️ Options ที่ลูกค้าเลือกได้</div>
          <div class="prev-options-mock">
            ${optionsHtml}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  document.getElementById('mfPreviewClose')?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
}

// ==================== Drag & Drop Sort ====================
/**
 * เปิดใช้ drag & drop บน tbody ของ menu table
 * @param {HTMLElement} tbody
 * @param {function}    onReorder - callback(orderedIds: string[])
 */
export function enableMenuDragSort(tbody, onReorder) {
  let dragSrc  = null;
  let dragOver = null;

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', (e) => {
      dragSrc = row;
      row.classList.add('menu-row--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('menu-row--dragging');
      tbody.querySelectorAll('.menu-row--dragover').forEach(r => r.classList.remove('menu-row--dragover'));
      // collect new order
      const ids = [...tbody.querySelectorAll('tr[data-id]')].map(r => r.dataset.id);
      onReorder(ids);
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragSrc || row === dragSrc) return;
      tbody.querySelectorAll('.menu-row--dragover').forEach(r => r.classList.remove('menu-row--dragover'));
      row.classList.add('menu-row--dragover');

      // reorder DOM
      const rows  = [...tbody.querySelectorAll('tr[data-id]')];
      const srcIdx = rows.indexOf(dragSrc);
      const ovIdx  = rows.indexOf(row);
      if (srcIdx < ovIdx) row.after(dragSrc);
      else row.before(dragSrc);
    });
  });
}

// ==================== Helpers ====================
function _esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==================== Inject CSS ====================
function _injectStyles() {
  if (document.getElementById('menu-manager-styles')) return;
  const style = document.createElement('style');
  style.id = 'menu-manager-styles';
  style.textContent = `
/* ===== Menu Form Modal Enhanced ===== */
#menuFormModal .modal-box {
  max-width: 680px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.mf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.5rem;
  border-bottom: 1.5px solid var(--cream-dark);
  background: var(--cream-mid);
  flex-shrink: 0;
}
.mf-header-actions { display: flex; gap: 0.5rem; align-items: center; }
.mf-close-btn {
  background: none; border: none; cursor: pointer;
  font-size: 1.1rem; color: var(--brown-light); padding: 0.2rem 0.4rem;
  border-radius: 4px; transition: 0.15s;
}
.mf-close-btn:hover { color: var(--brown); background: var(--cream-dark); }

.mf-scroll-body {
  overflow-y: auto;
  flex: 1;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.mf-section {
  background: var(--white);
  border: 1.5px solid var(--cream-dark);
  border-radius: var(--radius-sm);
  padding: 1rem;
}
.mf-section-title {
  font-weight: 700; font-size: 0.88rem;
  color: var(--brown-light); text-transform: uppercase;
  letter-spacing: 0.04em; margin-bottom: 0.75rem;
}
.mf-section-header {
  display: flex; align-items: center;
  justify-content: space-between; margin-bottom: 0.75rem;
}
.mf-section-header .mf-section-title { margin-bottom: 0; }

/* Image Upload */
.mf-image-row { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
.mf-image-preview-wrap {
  width: 110px; height: 110px; flex-shrink: 0;
  border: 2px solid var(--cream-dark); border-radius: var(--radius-sm);
  overflow: hidden; background: var(--cream-mid);
  display: flex; align-items: center; justify-content: center;
}
.mf-image-preview { width: 100%; height: 100%; object-fit: cover; }
.mf-image-placeholder {
  display: flex; flex-direction: column; align-items: center;
  gap: 0.25rem; color: var(--brown-light); font-size: 0.78rem;
}
.mf-image-placeholder span:first-child { font-size: 1.75rem; }
.mf-image-controls { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; min-width: 180px; }
.mf-upload-label { cursor: pointer; }

.mf-upload-progress { display: flex; align-items: center; gap: 0.5rem; }
.mf-progress-bar {
  flex: 1; height: 6px; background: var(--cream-dark);
  border-radius: 999px; overflow: hidden;
}
.mf-progress-fill {
  height: 100%; background: var(--accent);
  border-radius: 999px; transition: width 0.2s;
}
.mf-progress-text { font-size: 0.78rem; color: var(--brown-light); white-space: nowrap; }

/* Promo */
.mf-promo-body { padding-top: 0.5rem; }
.mf-promo-price-input { border-color: var(--accent) !important; }
.mf-promo-hint {
  font-size: 0.78rem; color: var(--brown-light);
  background: #fff8e1; border-radius: 6px;
  padding: 0.4rem 0.6rem; margin-top: 0.5rem;
}

/* Promo toggle button (replaces checkbox) */
.mf-promo-toggle-btn {
  border: 1.5px solid var(--cream-dark);
  background: var(--white);
  color: var(--brown-light);
  border-radius: 999px;
  font-family: var(--font-body, 'Sarabun', sans-serif);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.3rem 0.9rem;
  cursor: pointer;
  transition: 0.15s;
}
.mf-promo-toggle-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.mf-promo-toggle-btn.active {
  background: #fff8e1;
  border-color: var(--accent);
  color: var(--accent);
}

/* Footer actions */
.mf-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-top: 1.5px solid var(--cream-dark);
  background: var(--white);
  flex-shrink: 0;
}
.mf-footer-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.btn-ghost-cancel {
  background: none;
  border: none;
  color: var(--brown-light);
  font-family: var(--font-body, 'Sarabun', sans-serif);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-radius: 8px;
  transition: 0.15s;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: transparent;
}
.btn-ghost-cancel:hover {
  color: var(--brown);
  text-decoration-color: var(--brown-light);
}
.mf-save-btn {
  min-width: 130px;
  justify-content: center;
}

/* Options Summary */
.mf-options-summary { display: flex; flex-direction: column; gap: 0.5rem; }
.mf-options-none { font-size: 0.85rem; color: var(--brown-light); font-style: italic; }
.mf-option-group-chip {
  background: var(--cream-mid); border-radius: 8px;
  padding: 0.5rem 0.75rem; font-size: 0.82rem;
}
.mf-option-group-name { font-weight: 700; color: var(--brown); margin-right: 0.4rem; }
.mf-option-type-chip {
  background: var(--accent); color: #fff;
  font-size: 0.72rem; font-weight: 700;
  padding: 0.1rem 0.4rem; border-radius: 999px; margin-right: 0.5rem;
}
.mf-option-choices { color: var(--brown-light); }

/* Options Editor */
.mf-options-editor { border-top: 1.5px dashed var(--cream-dark); padding-top: 1rem; }
.opts-editor-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
.opts-group-card {
  background: var(--cream-mid); border-radius: 8px;
  padding: 0.75rem; border: 1.5px solid var(--cream-dark);
}
.opts-group-header {
  display: flex; align-items: flex-start;
  justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;
}
.opts-group-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.opts-group-meta .field-input { padding: 0.35rem 0.6rem; font-size: 0.82rem; }
.opts-rm-group {
  background: none; border: none; cursor: pointer; color: var(--red);
  font-size: 1rem; padding: 0.2rem; flex-shrink: 0;
}
.opts-choices-list { display: flex; flex-direction: column; gap: 0.35rem; }
.opts-choice-row { display: flex; gap: 0.4rem; align-items: center; }
.opts-choice-row .field-input { flex: 1; padding: 0.3rem 0.5rem; font-size: 0.82rem; }
.opts-rm-choice {
  background: none; border: none; cursor: pointer;
  color: var(--brown-light); font-size: 0.9rem; padding: 0.2rem;
}
.opts-rm-choice:hover { color: var(--red); }
.opts-editor-footer {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  border-top: 1.5px solid var(--cream-dark); padding-top: 0.75rem;
  margin-top: 0.5rem;
}
.mf-check-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; cursor: pointer; }

/* Drag & Drop */
.menu-row--dragging { opacity: 0.4; }
.menu-row--dragover td { background: #fff8e1 !important; }
tr[draggable="true"] { cursor: grab; }
tr[draggable="true"]:active { cursor: grabbing; }

/* Drag handle icon in row */
.menu-drag-handle {
  color: var(--brown-light); font-size: 1rem;
  cursor: grab; padding: 0 0.25rem; user-select: none;
}
.menu-drag-handle:hover { color: var(--accent); }

/* Preview Overlay */
.mf-preview-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(61,43,31,0.55); backdrop-filter: blur(4px);
  display: none; align-items: center; justify-content: center;
  padding: 1.5rem;
}
.mf-preview-box {
  background: var(--white); border-radius: var(--radius);
  max-width: 440px; width: 100%; max-height: 85vh; overflow-y: auto;
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column;
}
.mf-preview-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.9rem 1.2rem; border-bottom: 1.5px solid var(--cream-dark);
  font-weight: 700; font-size: 0.9rem; color: var(--brown-mid);
  background: var(--cream-mid); flex-shrink: 0;
}
.mf-preview-card-wrap { padding: 1.25rem; }
.mf-preview-label {
  font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--brown-light); margin-bottom: 0.65rem;
}

/* Simulated product card */
.prev-product-card {
  border: 1.5px solid var(--cream-dark); border-radius: 12px;
  overflow: hidden; max-width: 200px;
  box-shadow: 0 2px 8px rgba(61,43,31,0.08);
}
.prev-product-img-wrap { position: relative; }
.prev-product-img { width: 100%; height: 130px; object-fit: cover; display: block; }
.prev-no-img {
  width: 100%; height: 130px; background: var(--cream-mid);
  display: flex; align-items: center; justify-content: center;
  font-size: 2.5rem;
}
.prev-promo-badge {
  position: absolute; top: 6px; left: 6px;
  background: #e53e3e; color: #fff;
  font-size: 0.72rem; font-weight: 700;
  padding: 0.15rem 0.45rem; border-radius: 999px;
}
.prev-product-info { padding: 0.6rem 0.75rem; }
.prev-product-name { font-weight: 700; font-size: 0.88rem; margin-bottom: 0.3rem; }
.prev-price { color: var(--accent); font-weight: 700; }
.prev-price-orig { text-decoration: line-through; color: var(--brown-light); font-size: 0.82rem; margin-right: 0.3rem; }
.prev-price-promo { color: #e53e3e; font-weight: 700; }

/* Options mock */
.prev-options-mock {
  background: var(--cream-mid); border-radius: 10px;
  padding: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem;
}
.prev-option-group {}
.prev-option-label { font-weight: 700; font-size: 0.82rem; margin-bottom: 0.3rem; }
.prev-option-choices { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.prev-choice-chip {
  border: 1.5px solid var(--cream-dark); border-radius: 999px;
  padding: 0.2rem 0.65rem; font-size: 0.78rem; background: var(--white);
}

/* Promo badge in table row */
.menu-promo-badge {
  background: #e53e3e; color: #fff;
  font-size: 0.7rem; font-weight: 700;
  padding: 0.1rem 0.45rem; border-radius: 999px;
  margin-left: 0.35rem; vertical-align: middle;
}
.menu-promo-price {
  font-weight: 700; color: #e53e3e;
}
.menu-promo-orig {
  text-decoration: line-through;
  color: var(--brown-light); font-size: 0.82rem; margin-right: 0.25rem;
}

/* btn-sm */
.btn-sm { padding: 0.4rem 0.8rem; font-size: 0.82rem; }

/* responsive */
@media (max-width: 520px) {
  .mf-image-row { flex-direction: column; }
  .mf-image-preview-wrap { width: 100%; height: 140px; }
  .opts-choice-row { flex-wrap: wrap; }
}
  `;
  document.head.appendChild(style);
}
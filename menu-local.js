/**
 * menu-local.js — จัดการเมนูผ่าน LocalStorage
 * ใช้แทน Firebase สำหรับส่วนเมนูอย่างเดียว
 *
 * Key ที่ใช้:
 *   'ks90-menu'       → object { [id]: menuItem }
 *   'ks90-categories' → object { [id]: label }
 */

const MENU_KEY = 'ks90-menu';
const CAT_KEY  = 'ks90-categories';

export const DEFAULT_CATEGORIES = {
  setkao: '🍱 เซ็ตอาหาร',
  kao:    '🍜 อาหาร',
  nam:    '🥤 เครื่องดื่ม',
  coffee: '☕ กาแฟ',
  soda:   '🫧 โซดา',
};

// ==================== Menu CRUD ====================

export function getAllMenu() {
  try {
    return JSON.parse(localStorage.getItem(MENU_KEY) || 'null') || {};
  } catch { return {}; }
}

export function saveMenu(menuObj) {
  localStorage.setItem(MENU_KEY, JSON.stringify(menuObj));
  _notifyMenu();
}

export function saveMenuItem(item) {
  const menu = getAllMenu();
  menu[item.id] = item;
  saveMenu(menu);
}

export function deleteMenuItem(id) {
  const menu = getAllMenu();
  delete menu[id];
  saveMenu(menu);
}

export function toggleMenuItem(id, enabled) {
  const menu = getAllMenu();
  if (menu[id]) { menu[id].enabled = enabled; saveMenu(menu); }
}

export function updateSortOrders(orderedIds) {
  const menu = getAllMenu();
  orderedIds.forEach((id, i) => { if (menu[id]) menu[id].sortOrder = i + 1; });
  saveMenu(menu);
}

export function duplicateMenuItem(id) {
  const menu = getAllMenu();
  const m = menu[id];
  if (!m) return;
  const newId = 'm' + Date.now();
  menu[newId] = { ...JSON.parse(JSON.stringify(m)), id: newId, name: m.name + ' (สำเนา)', enabled: false, sortOrder: Object.keys(menu).length + 1 };
  saveMenu(menu);
  return newId;
}

// ==================== Categories ====================

export function getAllCategories() {
  try {
    return JSON.parse(localStorage.getItem(CAT_KEY) || 'null') || { ...DEFAULT_CATEGORIES };
  } catch { return { ...DEFAULT_CATEGORIES }; }
}

export function saveCategories(cats) {
  localStorage.setItem(CAT_KEY, JSON.stringify(cats));
  _notifyCats();
}

export function addCategory(id, label) {
  id = id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!id || !label) throw new Error('ต้องระบุ id และชื่อหมวด');
  const cats = getAllCategories();
  if (cats[id]) throw new Error(`id "${id}" มีอยู่แล้ว`);
  cats[id] = label.trim();
  saveCategories(cats);
  return id;
}

export function renameCategory(id, newLabel) {
  const cats = getAllCategories();
  cats[id] = newLabel.trim();
  saveCategories(cats);
}

export function deleteCategory(id) {
  const cats = getAllCategories();
  delete cats[id];
  saveCategories(cats);
}

// ==================== Subscribe (polling via storage event) ====================

const _menuListeners = new Set();
const _catListeners  = new Set();

export function subscribeMenuLocal(cb) {
  _menuListeners.add(cb);
  cb(getAllMenu()); // fire immediately
  return () => _menuListeners.delete(cb);
}

export function subscribeCategoriesLocal(cb) {
  _catListeners.add(cb);
  cb(getAllCategories());
  return () => _catListeners.delete(cb);
}

function _notifyMenu() {
  const menu = getAllMenu();
  _menuListeners.forEach(cb => cb(menu));
}

function _notifyCats() {
  const cats = getAllCategories();
  _catListeners.forEach(cb => cb(cats));
}

// sync ข้ามแท็บผ่าน storage event
window.addEventListener('storage', (e) => {
  if (e.key === MENU_KEY) _notifyMenu();
  if (e.key === CAT_KEY)  _notifyCats();
});

// ==================== Parse เมนูเป็น PRODUCTS format (สำหรับ customer/POS) ====================

export function menuToProducts(menuObj) {
  const result = {};
  Object.values(menuObj).forEach(item => {
    if (!item.enabled) return;
    const cat = item.category;
    if (!result[cat]) result[cat] = [];
    const promoActive = item.promo?.enabled;
    const price = promoActive ? (item.promo.promoPrice ?? item.price) : item.price;
    result[cat].push({
      id:          item.id,
      name:        item.name,
      price,
      originalPrice: item.price,
      promoLabel:  promoActive ? (item.promo.label || 'โปร') : null,
      image:       item.imageUrl || (item.imageNum ? 'images/img' + item.imageNum + '.png' : ''),
      img:         item.imageUrl || (item.imageNum ? 'images/img' + item.imageNum + '.png' : ''),
      productType: item.productType || 'simple',
      options:     item.options || item.optionGroups || null,
      enabled:     true,
    });
  });
  Object.keys(result).forEach(cat => {
    result[cat].sort((a, b) => {
      const ma = menuObj[a.id], mb = menuObj[b.id];
      return (ma?.sortOrder ?? 999) - (mb?.sortOrder ?? 999);
    });
  });
  return result;
}

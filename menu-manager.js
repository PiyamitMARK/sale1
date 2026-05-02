/**
 * ข้าวซอย 90 — Menu Manager
 * จัดการเมนูใน Firebase: menu/{id} = { id, name, price, category, productType, imageNum, enabled, sortOrder }
 *
 * ใช้งาน: import { loadMenuFromFirebase, subscribeMenu } from './menu-manager.js'
 */

import { getDatabase, ref, set, update, remove, get, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ==================== Default Menu (seed data) ====================
// ใช้ครั้งแรกที่ยังไม่มีข้อมูลใน Firebase
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

/**
 * โหลดเมนูจาก Firebase แปลงกลับเป็น format { setkao:[...], kao:[...], ... }
 * ถ้ายังไม่มีข้อมูล → seed DEFAULT_MENU ลง Firebase
 */
export async function loadMenuFromFirebase(db) {
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) {
    await seedDefaultMenu(db);
    return buildProductsFromDefault();
  }
  return parseMenuSnapshot(snap.val());
}

/**
 * Subscribe real-time เมนูจาก Firebase
 * @param {object} db
 * @param {function} callback - รับ products object { setkao, kao, ... }
 * @returns unsubscribe function
 */
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
    if (!item.enabled) return; // ซ่อนเมนูที่ปิดอยู่
    const cat = item.category;
    if (!result[cat]) result[cat] = [];
    result[cat].push({
      id:          item.id,
      name:        item.name,
      price:       item.price,
      image:       IMG(item.imageNum),
      productType: item.productType,
    });
  });
  // sort by sortOrder
  Object.keys(result).forEach(cat => {
    result[cat].sort((a, b) => {
      const da = data[a.id], db2 = data[b.id];
      return (da?.sortOrder ?? 999) - (db2?.sortOrder ?? 999);
    });
  });
  return result;
}

/** สร้าง products object จาก DEFAULT_MENU (ใช้ตอน offline fallback) */
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

/** Seed default menu ลง Firebase ครั้งแรก */
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

/** โหลดเมนูทั้งหมด (รวม disabled) สำหรับหน้า admin */
export async function loadAllMenuAdmin(db) {
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) {
    await seedDefaultMenu(db);
    const snap2 = await get(ref(db, 'menu'));
    return snap2.val() || {};
  }
  return snap.val();
}

/** Subscribe เมนูทั้งหมด (admin) */
export function subscribeAllMenuAdmin(db, callback) {
  return onValue(ref(db, 'menu'), async (snap) => {
    if (!snap.exists()) {
      await seedDefaultMenu(db);
      return;
    }
    callback(snap.val());
  });
}

/** บันทึก/แก้ไข item */
export async function saveMenuItem(db, item) {
  await set(ref(db, `menu/${item.id}`), item);
}

/** toggle เปิด/ปิดเมนู */
export async function toggleMenuItem(db, id, enabled) {
  await update(ref(db, `menu/${id}`), { enabled });
}

/** ลบเมนู */
export async function deleteMenuItem(db, id) {
  await remove(ref(db, `menu/${id}`));
}

/** แก้ราคา */
export async function updateMenuPrice(db, id, price) {
  await update(ref(db, `menu/${id}`), { price: Number(price) });
}

/** แก้ชื่อ */
export async function updateMenuName(db, id, name) {
  await update(ref(db, `menu/${id}`), { name });
}

/** สร้าง id ใหม่ */
export function generateMenuId(category) {
  return category + '_' + Date.now().toString(36);
}

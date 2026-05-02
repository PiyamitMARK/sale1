# 📋 วิธีอัปเดต admin.js — Menu Manager 2.0

## 1. แก้ import ที่บนสุดของ admin.js

แทน:
```js
import {
  subscribeAllMenuAdmin, saveMenuItem, toggleMenuItem, deleteMenuItem, generateMenuId,
  CATEGORY_LABELS, PRODUCT_TYPES, DEFAULT_MENU,
} from './menu-manager.js';
```

ด้วย:
```js
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import {
  subscribeAllMenuAdmin, saveMenuItem, toggleMenuItem, deleteMenuItem, generateMenuId,
  CATEGORY_LABELS, PRODUCT_TYPES, DEFAULT_MENU,
  initMenuFormHelper, openMenuAddModal, openMenuEditModal,
  enableMenuDragSort, duplicateMenuItem, updateSortOrders,
} from './menu-manager.js';
```

## 2. เพิ่ม storage instance หลัง `const db = getDatabase(firebaseApp);`

```js
const storage = getStorage(firebaseApp);
```

## 3. แก้ initMenuTab()

```js
function initMenuTab() {
  initMenuFormHelper(db, storage, allMenuData, () => {});
  menuUnsubscribe = subscribeAllMenuAdmin(db, (data) => {
    allMenuData = data || {};
    if (!document.getElementById('tabMenu')?.classList.contains('hidden')) {
      renderMenuTab();
    }
  });
}
```

**หมายเหตุ:** `allMenuData` ต้องเป็น object reference ไม่ใช่ copy เพราะ menu-manager.js จะอ่านจาก allMenuData ตอน save

## 4. แทนที่ renderMenuTab(), renderMenuRow(), bindMenuTableActions()

ดูโค้ดใน admin-menu-patch.js (ทั้ง 3 functions ให้ copy มาแทนของเดิม)

## 5. ลบ openMenuAddModal() และ openMenuEditModal() เดิมออก

เพราะตอนนี้ import มาจาก menu-manager.js แล้ว

## 6. เพิ่ม CSS ต่อท้าย admin.css

เอาทุกอย่างใน admin-css-additions.css ต่อท้าย admin.css เดิม

## 7. แก้ initMenuFormHelper call ให้ส่ง object reference ถูกต้อง

ใน initMenuTab() ตอน call initMenuFormHelper ต้อง pass allMenuData เป็น reference:
```js
// ❌ ผิด — ส่ง copy
initMenuFormHelper(db, storage, { ...allMenuData }, () => {});

// ✅ ถูก — ส่ง reference ที่จะ sync อัตโนมัติ
// แต่เนื่องจาก JS primitive object reference
// ให้ใช้ wrapper object แทน
const menuDataRef = { data: allMenuData };
initMenuFormHelper(db, storage, menuDataRef.data, () => {});
```

จริงๆ ใน menu-manager.js จะอ่านจาก _allMenuData ที่ bind ไว้
ดังนั้นทุกครั้งที่ allMenuData เปลี่ยนให้เรียก initMenuFormHelper อีกครั้ง
หรือใช้วิธีง่ายกว่า: ใน subscribeAllMenuAdmin callback ให้ set allMenuData แล้ว call initMenuFormHelper อีกรอบ:

```js
menuUnsubscribe = subscribeAllMenuAdmin(db, (data) => {
  allMenuData = data || {};
  initMenuFormHelper(db, storage, allMenuData, () => {});
  if (!document.getElementById('tabMenu')?.classList.contains('hidden')) {
    renderMenuTab();
  }
});
```

## ✅ ฟีเจอร์ที่ได้หลังอัปเดต

| ฟีเจอร์ | อยู่ที่ไหน |
|---------|-----------|
| 🖼 อัปโหลดรูปจากเครื่อง → Firebase Storage | menu-manager.js: uploadMenuImage() |
| ↕️ Drag & drop เรียงลำดับ | menu-manager.js: enableMenuDragSort() + updateSortOrders() |
| ⚙️ แก้ไข options/topping | menu-manager.js: openMenuFormModal() → Options Editor |
| 📋 Duplicate เมนู | menu-manager.js: duplicateMenuItem() + ปุ่ม 📋 ในตาราง |
| 🏷️ ราคาพิเศษ/โปรโมชั่น | menu-manager.js: promo section + getEffectivePrice() |
| 👁️ Preview ก่อนบันทึก | menu-manager.js: _openPreviewModal() ผ่านปุ่ม Preview |

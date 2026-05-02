// ==================== bill-feature integration patch ====================
// แก้ admin.js 4 จุดเท่านั้น (ค้นหาด้วย keyword ด้านล่าง)
// =====================================================================

// ─── 1. เพิ่ม import ที่หัวไฟล์ admin.js (หลัง import darkmode) ───────
// หา: import './darkmode.js';
// เพิ่มต่อ:
import { initBillFeature, bindBillButtons, injectMergeBillBtn } from './bill-feature.js';


// ─── 2. เพิ่มใน function renderOrders() ─────────────────────────────
// หา (ใกล้ท้าย renderOrders, หลัง querySelectorAll('.btn-delete').forEach):
//
//   ordersList.querySelectorAll('.btn-delete').forEach((btn) => {
//     btn.addEventListener('click', () => deleteOrder(btn.dataset.key, btn.dataset.num));
//   });
// }                          ← ปิดฟังก์ชัน renderOrders
//
// เพิ่ม 2 บรรทัดนี้ก่อนปิดฟังก์ชัน:

  bindBillButtons(ordersList);
  injectMergeBillBtn();


// ─── 3. แก้ markOrderAsPaid ให้รับ paymentMethod เพิ่มได้ ────────────
// หา:
//   async function markOrderAsPaid(firebaseKey) {
// แทนที่เป็น:
async function markOrderAsPaid(firebaseKey, paymentMethod) {
  // เพิ่มบรรทัดนี้ก่อน update:
  const updateData = { status: 'paid' };
  if (paymentMethod) updateData.paymentMethod = paymentMethod;
  // แทน: await update(ref(db, `orders/${firebaseKey}`), { status: 'paid' });
  // ด้วย:
  await update(ref(db, `orders/${firebaseKey}`), updateData);
  // ส่วนที่เหลือ (tableOrders remove) คงเดิม
}


// ─── 4. เรียก initBillFeature หลัง Firebase listener พร้อม ──────────
// หา (ใน checkAuth หรือ onValue allOrders):
//   allOrders = ...
//   renderOrders();
//
// เพิ่ม initBillFeature ครั้งเดียว (ใส่ใน DOMContentLoaded หรือหลัง auth):
//
// ตัวอย่าง — ใน block หลัง signInAnonymously หรือ checkAuth():

initBillFeature({
  getOrders:        () => allOrders,
  db,
  markOrderAsPaid,
  printOrderReceipt,
  formatMoney,
  escapeHtml,
});

// หมายเหตุ: เรียก initBillFeature ได้ทันที เพราะ inject แค่ modal+bar ไม่ต้องรอ orders

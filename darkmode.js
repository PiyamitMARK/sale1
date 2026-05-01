// ==================== Dark Mode ====================
// ใช้ร่วมกันทั้ง index.html, customer.html, admin.html
// จำ preference ใน localStorage key 'theme'

const STORAGE_KEY = 'theme';

function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
}

// apply ทันทีก่อน render เพื่อป้องกัน flash of light mode
applyTheme(getTheme());

// bind ปุ่มหลังจาก DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
  // apply อีกรอบ เพื่อให้ icon ถูกต้อง
  applyTheme(getTheme());
});

export { applyTheme, toggleTheme, getTheme };

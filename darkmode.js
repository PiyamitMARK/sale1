// ==================== Dark Mode (shared) ====================
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

applyTheme(getTheme());

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
  applyTheme(getTheme());
});

export { applyTheme, toggleTheme, getTheme };
/**
 * api-client.js — แทนที่ firebase-config.js + Firebase SDK
 * ติดต่อ Cloudflare Worker REST API + WebSocket
 *
 * ใช้งาน:
 *   import { api, ws } from './api-client.js';
 *
 *   // REST
 *   const orders = await api.getOrders({ today: true });
 *   const order  = await api.createOrder({ table_num: '3', batches: [...] });
 *   await api.updateOrder(id, { status: 'cooking' });
 *
 *   // Realtime
 *   const socket = ws.connect('admin', (msg) => { ... });
 *   socket.close();
 */

// ─── Config ─────────────────────────────────────────────────────────────────
// Worker deploy อยู่ที่ domain เดียวกับ static files
// ถ้า dev local ให้เปลี่ยนเป็น 'http://localhost:8787'
const BASE = '';  // '' = same origin

// Admin key สำหรับการเรียก API ที่ต้องการสิทธิ์
// เก็บใน localStorage หลัง login สำเร็จ
function getAdminKey() {
  return localStorage.getItem('ks90-admin-key') || '';
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const adminKey = getAdminKey();
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  const res = await fetch(BASE + path, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── REST API ──────────────────────────────────────────────────────────────────
export const api = {

  // Orders
  async getOrders({ status, table, today, limit } = {}) {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (table)  p.set('table', table);
    if (today)  p.set('today', '1');
    if (limit)  p.set('limit', String(limit));
    const qs = p.toString();
    return apiFetch('/api/orders' + (qs ? '?' + qs : ''));
  },

  async getOrder(id) {
    return apiFetch(`/api/orders/${id}`);
  },

  async createOrder(data) {
    return apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateOrder(id, data) {
    return apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteOrder(id) {
    return apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
  },

  // Table
  async getTableOrder(tableNum) {
    return apiFetch(`/api/table/${tableNum}`);
  },

  async clearTable(tableNum) {
    return apiFetch(`/api/table/${tableNum}`, { method: 'DELETE' });
  },

  // Meta
  async getMeta() {
    return apiFetch('/api/meta');
  },

  async updateMeta(data) {
    return apiFetch('/api/meta', { method: 'PATCH', body: JSON.stringify(data) });
  },

  // Menu
  async getMenu() {
    return apiFetch('/api/menu');
  },

  async putMenu(menuData) {
    return apiFetch('/api/menu', { method: 'PUT', body: JSON.stringify(menuData) });
  },

  // Call Staff
  async callStaff(tableNum, message = '') {
    return apiFetch('/api/call-staff', {
      method: 'POST',
      body: JSON.stringify({ table_num: tableNum, message }),
    });
  },

  async getCallLog() {
    return apiFetch('/api/call-staff');
  },

  async markCallDone(id) {
    return apiFetch(`/api/call-staff/${id}`, { method: 'PATCH' });
  },

  async clearCallLog() {
    return apiFetch('/api/call-staff', { method: 'DELETE' });
  },
};

// ─── WebSocket (Realtime) ──────────────────────────────────────────────────────
export const ws = {
  /**
   * เชื่อมต่อ WebSocket
   * @param {'admin'|`table-${string}`} room  - ชื่อห้อง
   * @param {(msg: object) => void} onMessage - callback รับ message
   * @returns {{ close: () => void, send: (msg: object) => void }}
   */
  connect(room, onMessage) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const endpoint = room === 'admin'
      ? `${protocol}//${location.host}/api/ws/admin`
      : `${protocol}//${location.host}/api/ws/table/${room.replace('table-', '')}`;

    let socket    = null;
    let closed    = false;
    let retryMs   = 1000;
    let pingTimer = null;

    function connect() {
      if (closed) return;
      socket = new WebSocket(endpoint);

      socket.addEventListener('open', () => {
        retryMs = 1000; // reset backoff
        // ping ทุก 25 วิ เพื่อกัน idle timeout
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25_000);
      });

      socket.addEventListener('message', (evt) => {
        if (evt.data === 'pong') return; // ignore keepalive
        try {
          const msg = JSON.parse(evt.data);
          onMessage(msg);
        } catch (_) {}
      });

      socket.addEventListener('close', () => {
        clearInterval(pingTimer);
        if (!closed) {
          // auto-reconnect with exponential backoff
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 1.5, 30_000);
        }
      });

      socket.addEventListener('error', () => {
        socket.close();
      });
    }

    connect();

    return {
      close() {
        closed = true;
        clearInterval(pingTimer);
        socket?.close();
      },
      send(msg) {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(msg));
        }
      },
    };
  },
};

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Login: ส่ง key ไปตรวจกับ Worker
 * ถ้าถูกต้อง → เก็บ key ใน localStorage
 */
export async function adminLogin(username, password) {
  // สร้าง key = "username:password" แล้ว hash
  const raw  = `${username}:${password}`;
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  // ทดสอบโดย GET /api/meta ด้วย key นี้
  const res = await fetch('/api/meta', {
    headers: { 'X-Admin-Key': hash },
  });

  if (res.ok) {
    localStorage.setItem('ks90-admin-key', hash);
    localStorage.setItem('krua-khun-mae-auth', 'true');
    return true;
  }
  return false;
}

export function adminLogout() {
  localStorage.removeItem('ks90-admin-key');
  localStorage.removeItem('krua-khun-mae-auth');
}

export function isLoggedIn() {
  return !!localStorage.getItem('krua-khun-mae-auth');
}

// ─── Dark Mode (shared) ──────────────────────────────────────────────────────
const _THEME_KEY = 'theme';

export function getTheme() {
  return localStorage.getItem(_THEME_KEY) || 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(_THEME_KEY, next);
  applyTheme(next);
}

// apply ทันทีเพื่อ prevent flash
applyTheme(getTheme());

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
  applyTheme(getTheme());
});

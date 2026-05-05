/**
 * api-client.js — แทนที่ firebase-config.js + Firebase SDK
 * ติดต่อ Cloudflare Worker REST API + WebSocket
 *
 * ใช้งาน:
 *   import { api, ws } from './api-client.js';
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE = '';  // '' = same origin

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

// ─── REST API ─────────────────────────────────────────────────────────────────
export const api = {

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

  async getTableOrder(tableNum) {
    return apiFetch(`/api/table/${tableNum}`);
  },

  async clearTable(tableNum) {
    return apiFetch(`/api/table/${tableNum}`, { method: 'DELETE' });
  },

  async getMeta() {
    return apiFetch('/api/meta');
  },

  async updateMeta(data) {
    return apiFetch('/api/meta', { method: 'PATCH', body: JSON.stringify(data) });
  },

  async getMenu() {
    return apiFetch('/api/menu');
  },

  async putMenu(menuData) {
    return apiFetch('/api/menu', { method: 'PUT', body: JSON.stringify(menuData) });
  },

  async patchMenuItem(id, data) {
    return apiFetch(`/api/menu/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteMenuItem(id) {
    return apiFetch(`/api/menu/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

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

// ─── WebSocket (Realtime) ─────────────────────────────────────────────────────
export const ws = {
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
        retryMs = 1000;
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25_000);
      });

      socket.addEventListener('message', (evt) => {
        if (evt.data === 'pong') return;
        try {
          const msg = JSON.parse(evt.data);
          onMessage(msg);
        } catch (_) {}
      });

      socket.addEventListener('close', () => {
        clearInterval(pingTimer);
        if (!closed) {
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

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function adminLogin(username, password) {
  const raw  = `${username}:${password}`;
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  const res = await fetch('/api/meta', {
    headers: { 'X-Admin-Key': hash },
  });

  if (res.ok) {
    localStorage.setItem('ks90-admin-key', hash);
    localStorage.setItem('kaosoi-auth', 'true');
    return true;
  }
  return false;
}

export function adminLogout() {
  localStorage.removeItem('ks90-admin-key');
  localStorage.removeItem('kaosoi-auth');
}

export function isLoggedIn() {
  return !!localStorage.getItem('kaosoi-auth');
}

// ─── Dark Mode (shared) ───────────────────────────────────────────────────────
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
  applyTheme(getTheme());
});
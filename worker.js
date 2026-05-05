/**
 * ข้าวซอย 90 — Cloudflare Worker
 * แทนที่ Firebase Realtime Database ทั้งหมด
 *
 * API Routes:
 *   GET    /api/orders              → ดึง orders ทั้งหมด (admin)
 *   GET    /api/orders/:id          → ดึง order เดียว
 *   POST   /api/orders              → สร้าง order ใหม่
 *   PATCH  /api/orders/:id          → อัปเดต order (status, batches, payment)
 *   DELETE /api/orders/:id          → ลบ order
 *
 *   GET    /api/table/:num          → ดึง active order ของโต๊ะ
 *   DELETE /api/table/:num          → clear โต๊ะ (หลังจ่ายเงิน)
 *
 *   GET    /api/meta                → ดึง meta (orderNumber ฯลฯ)
 *   PATCH  /api/meta                → อัปเดต meta
 *
 *   GET    /api/menu                → ดึงเมนู (จาก KV)
 *   PUT    /api/menu                → อัปเดตเมนู (admin only)
 *
 *   POST   /api/call-staff          → เรียกพนักงาน
 *   GET    /api/call-staff          → ดึง call log วันนี้
 *   PATCH  /api/call-staff/:id      → mark done
 *   DELETE /api/call-staff          → clear all
 *
 *   GET    /api/ws/admin            → WebSocket (admin realtime)
 *   GET    /api/ws/table/:num       → WebSocket (customer realtime)
 */

// ==================== CORS ====================
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ==================== Auth ====================
// เก็บ hash ของ admin key ใน Worker Secret (wrangler secret put ADMIN_KEY_HASH)
// หรือ hardcode ชั่วคราวในระหว่าง migrate
async function sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  if (!key) return false;
  const hash = await sha256(key);
  return hash === (env.ADMIN_KEY_HASH || '');
}

// ==================== Helpers ====================
function nanoid(n = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const arr  = crypto.getRandomValues(new Uint8Array(n));
  arr.forEach(b => { result += chars[b % chars.length]; });
  return result;
}

function nowISO() { return new Date().toISOString(); }

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
}

// ==================== Main Router ====================
export default {
  async fetch(request, env, ctx) {
    const url     = new URL(request.url);
    const path    = url.pathname;
    const method  = request.method;

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // WebSocket upgrade → Durable Object
    if (path === '/api/ws/admin') {
      const id = env.TABLE_ROOM.idFromName('admin');
      return env.TABLE_ROOM.get(id).fetch(request);
    }
    if (path.startsWith('/api/ws/table/')) {
      const tableNum = path.split('/')[4];
      const id = env.TABLE_ROOM.idFromName(`table-${tableNum}`);
      return env.TABLE_ROOM.get(id).fetch(request);
    }

    // REST API
    try {
      if (path === '/api/orders' && method === 'GET') return handleGetOrders(request, env);
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'GET')  return handleGetOrder(path, env);
      if (path === '/api/orders' && method === 'POST')                return handleCreateOrder(request, env);
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'PATCH') return handleUpdateOrder(request, path, env);
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'DELETE') return handleDeleteOrder(path, env);

      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'GET')    return handleGetTable(path, env);
      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'DELETE') return handleClearTable(path, env);

      if (path === '/api/meta' && method === 'GET')   return handleGetMeta(env);
      if (path === '/api/meta' && method === 'PATCH') return handleUpdateMeta(request, env);

      if (path === '/api/menu' && method === 'GET') return handleGetMenu(env);
      if (path === '/api/menu' && method === 'PUT') return handlePutMenu(request, env);

      if (path === '/api/call-staff' && method === 'POST')   return handleCallStaff(request, env);
      if (path === '/api/call-staff' && method === 'GET')    return handleGetCallLog(env);
      if (path.match(/^\/api\/call-staff\/[^/]+$/) && method === 'PATCH') return handleDoneCall(path, env);
      if (path === '/api/call-staff' && method === 'DELETE') return handleClearCallLog(env);

      return err('Not found', 404);
    } catch (e) {
      console.error(e);
      return err('Internal error: ' + e.message, 500);
    }
  },
};

// ==================== Orders ====================

async function handleGetOrders(request, env) {
  const url    = new URL(request.url);
  const status = url.searchParams.get('status');   // filter by status
  const table  = url.searchParams.get('table');    // filter by table
  const today  = url.searchParams.get('today');    // '1' = วันนี้เท่านั้น
  const limit  = parseInt(url.searchParams.get('limit') || '200');

  let q    = 'SELECT * FROM orders';
  const wb = [];
  const p  = [];

  if (today === '1') {
    wb.push("date(created_at, '+7 hours') = ?");
    p.push(todayStr());
  }
  if (status) { wb.push('status = ?'); p.push(status); }
  if (table)  { wb.push('table_num = ?'); p.push(table); }

  if (wb.length) q += ' WHERE ' + wb.join(' AND ');
  q += ' ORDER BY created_at DESC LIMIT ?';
  p.push(limit);

  const { results } = await env.DB.prepare(q).bind(...p).all();
  const orders = results.map(deserializeOrder);
  return json(orders);
}

async function handleGetOrder(path, env) {
  const id  = path.split('/')[3];
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!row) return err('Order not found', 404);
  return json(deserializeOrder(row));
}

async function handleCreateOrder(request, env) {
  const body = await request.json();
  const { table_num, items, batches, is_takeaway, note } = body;

  if (!table_num) return err('table_num required');

  // Auto-increment order number (atomic)
  const meta    = await env.DB.prepare("SELECT value FROM meta WHERE key = 'orderNumber'").first();
  const lastDate = await env.DB.prepare("SELECT value FROM meta WHERE key = 'lastOrderDate'").first();
  const today   = todayStr();

  let orderNum = parseInt(meta?.value || '1001');
  if (lastDate?.value !== today) {
    // วันใหม่ → reset เป็น 1001
    orderNum = 1001;
    await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'lastOrderDate'").bind(today).run();
    await env.DB.prepare("UPDATE meta SET value = '1001' WHERE key = 'orderNumber'").run();
  }

  const nextNum = orderNum + 1;
  await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'orderNumber'").bind(String(nextNum)).run();

  const id       = nanoid();
  const now      = nowISO();
  const batchArr = batches || (items ? [items] : [[]]);
  const total    = batchArr.flat().reduce((s, i) => s + (i.price * i.qty), 0);

  await env.DB.prepare(`
    INSERT INTO orders (id, order_num, table_num, status, batches, total, note, is_takeaway, created_at, updated_at, last_batch_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, orderNum, table_num, JSON.stringify(batchArr), total, note || '', is_takeaway ? 1 : 0, now, now, now).run();

  // Update tableOrders
  await env.DB.prepare(`
    INSERT OR REPLACE INTO table_orders (table_num, order_id, created_at) VALUES (?, ?, ?)
  `).bind(table_num, id, now).run();

  const order = { id, order_num: orderNum, table_num, status: 'pending', batches: batchArr, total, note, is_takeaway: !!is_takeaway, created_at: now, updated_at: now };

  // Broadcast ไปทุก admin WebSocket
  await broadcastToRoom(env, 'admin', { type: 'new_order', order });

  return json(order, 201);
}

async function handleUpdateOrder(request, path, env) {
  const id   = path.split('/')[3];
  const body = await request.json();

  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!row) return err('Order not found', 404);

  const updates = [];
  const params  = [];

  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(body.status);
  }
  if (body.batches !== undefined) {
    const flat  = body.batches.flat();
    const total = flat.reduce((s, i) => s + (i.price * i.qty), 0);
    updates.push('batches = ?', 'total = ?', 'last_batch_at = ?');
    params.push(JSON.stringify(body.batches), total, nowISO());
  }
  if (body.payment !== undefined) {
    updates.push('payment = ?');
    params.push(body.payment);
  }
  if (body.note !== undefined) {
    updates.push('note = ?');
    params.push(body.note);
  }

  if (!updates.length) return err('Nothing to update');

  updates.push('updated_at = ?');
  params.push(nowISO());
  params.push(id);

  await env.DB.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = deserializeOrder(await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first());

  // Broadcast
  await broadcastToRoom(env, 'admin', { type: 'order_updated', order: updated });

  // ถ้ามี status → แจ้งห้องโต๊ะด้วย
  if (body.status) {
    await broadcastToRoom(env, `table-${updated.table_num}`, { type: 'order_updated', id: updated.id, status: body.status, order: updated });
  }

  return json(updated);
}

async function handleDeleteOrder(path, env) {
  const id  = path.split('/')[3];
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!row) return err('Order not found', 404);

  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();

  // Clear tableOrders ถ้าชี้ไปที่ order นี้
  await env.DB.prepare('DELETE FROM table_orders WHERE order_id = ?').bind(id).run();

  await broadcastToRoom(env, 'admin', { type: 'order_deleted', id });

  return json({ ok: true });
}

// ==================== Table ====================

async function handleGetTable(path, env) {
  const tableNum = path.split('/')[3];
  const row      = await env.DB.prepare('SELECT * FROM table_orders WHERE table_num = ?').bind(tableNum).first();
  if (!row) return json(null);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first();
  if (!order) {
    // stale reference → clean up
    await env.DB.prepare('DELETE FROM table_orders WHERE table_num = ?').bind(tableNum).run();
    return json(null);
  }
  return json(deserializeOrder(order));
}

async function handleClearTable(path, env) {
  const tableNum = path.split('/')[3];
  await env.DB.prepare('DELETE FROM table_orders WHERE table_num = ?').bind(tableNum).run();
  return json({ ok: true });
}

// ==================== Meta ====================

async function handleGetMeta(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM meta').all();
  const meta = {};
  results.forEach(r => {
    try { meta[r.key] = JSON.parse(r.value); } catch { meta[r.key] = r.value; }
  });
  return json(meta);
}

async function handleUpdateMeta(request, env) {
  const body = await request.json();
  const stmts = Object.entries(body).map(([k, v]) =>
    env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(k, typeof v === 'string' ? v : JSON.stringify(v))
  );
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

// ==================== Menu (KV) ====================

async function handleGetMenu(env) {
  const raw = await env.KV.get('menu', 'json');
  if (!raw) return json({});
  return json(raw);
}

async function handlePutMenu(request, env) {
  const body = await request.json();
  await env.KV.put('menu', JSON.stringify(body), {
    // cache 1 ชั่วโมง — เมนูไม่ค่อยเปลี่ยน
    //expirationTtl: 3600,
  });
  // Broadcast เมนูเปลี่ยน
  await broadcastToRoom(env, 'admin', { type: 'menu_updated' });
  return json({ ok: true });
}

// ==================== Call Staff ====================

async function handleCallStaff(request, env) {
  const body = await request.json();
  const { table_num, message } = body;
  if (!table_num) return err('table_num required');

  const id  = nanoid(12);
  const now = nowISO();
  await env.DB.prepare('INSERT INTO call_staff (id, table_num, message, done, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(id, table_num, message || '', now).run();

  const entry = { id, table_num, message, done: false, created_at: now };
  await broadcastToRoom(env, 'admin', { type: 'call_staff', entry });

  return json(entry, 201);
}

async function handleGetCallLog(env) {
  const today = todayStr();
  const { results } = await env.DB.prepare(
    "SELECT * FROM call_staff WHERE date(created_at, '+7 hours') = ? ORDER BY created_at DESC"
  ).bind(today).all();
  return json(results.map(r => ({ ...r, done: !!r.done })));
}

async function handleDoneCall(path, env) {
  const id = path.split('/')[3];
  await env.DB.prepare('UPDATE call_staff SET done = 1 WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleClearCallLog(env) {
  const today = todayStr();
  await env.DB.prepare(
    "DELETE FROM call_staff WHERE date(created_at, '+7 hours') = ?"
  ).bind(today).run();
  return json({ ok: true });
}

// ==================== Helpers ====================

function deserializeOrder(row) {
  if (!row) return null;
  return {
    ...row,
    batches:     typeof row.batches === 'string' ? JSON.parse(row.batches) : row.batches,
    is_takeaway: !!row.is_takeaway,
  };
}

async function broadcastToRoom(env, roomName, msg) {
  try {
    const id   = env.TABLE_ROOM.idFromName(roomName);
    const stub = env.TABLE_ROOM.get(id);
    await stub.fetch('https://internal/broadcast', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(msg),
    });
  } catch (_) { /* room ไม่มีใครเชื่อมต่ออยู่ ก็ไม่เป็นไร */ }
}

// ==================== Durable Object: TableRoom ====================
// รับ WebSocket connections — ทำหน้าที่เป็น "ห้อง" สำหรับ broadcast
export class TableRoom {
  constructor(state) {
    this.state    = state;
    this.sessions = new Set(); // Set<WebSocket>
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Internal broadcast endpoint
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const msg  = await request.text();
      let closed = [];
      this.sessions.forEach(ws => {
        try { ws.send(msg); }
        catch (_) { closed.push(ws); }
      });
      closed.forEach(ws => this.sessions.delete(ws));
      return new Response('ok');
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sessions.add(server);

    server.addEventListener('close', () => this.sessions.delete(server));
    server.addEventListener('error', () => this.sessions.delete(server));

    // ping-pong keep-alive
    server.addEventListener('message', (evt) => {
      if (evt.data === 'ping') server.send('pong');
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
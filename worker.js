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
 *   GET    /api/menu                → ดึงเมนู (จาก D1)
 *   PUT    /api/menu                → อัปเดตเมนูทั้งก้อน (admin only)
 *   PATCH  /api/menu/:id            → อัปเดตรายการเดียว (admin only)
 *   DELETE /api/menu/:id            → ลบรายการเดียว (admin only)
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
      if (path === '/api/orders' && method === 'POST')                return handleCreateOrder(request, env, ctx);
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'PATCH') return handleUpdateOrder(request, path, env, ctx);
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'DELETE') return handleDeleteOrder(path, env, ctx);

      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'GET')    return handleGetTable(path, env);
      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'DELETE') return handleClearTable(path, env);

      if (path === '/api/meta' && method === 'GET')   return handleGetMeta(env);
      if (path === '/api/meta' && method === 'PATCH') return handleUpdateMeta(request, env);

      if (path === '/api/menu' && method === 'GET') return handleGetMenu(env);
      if (path === '/api/menu' && method === 'PUT') return handlePutMenu(request, env, ctx);
      if (path === '/api/menu-sort' && method === 'PATCH') return handleMenuSort(request, env, ctx);
      if (path.match(/^\/api\/menu-img\/[^/]+$/) && method === 'GET') return handleGetMenuImg(path, env);
      if (path.match(/^\/api\/menu\/[^/]+$/) && method === 'PATCH')  return handlePatchMenuItem(request, path, env, ctx);
      if (path.match(/^\/api\/menu\/[^/]+$/) && method === 'DELETE') return handleDeleteMenuItem(path, env, ctx);

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

async function handleCreateOrder(request, env, ctx) {
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

  // Broadcast ไปทุก admin WebSocket (waitUntil ป้องกัน cut-off)
  ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'new_order', order }));

  return json(order, 201);
}

async function handleUpdateOrder(request, path, env, ctx) {
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

  // Broadcast (waitUntil ป้องกัน cut-off)
  ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'order_updated', order: updated }));

  // new_batch: broadcast เฉพาะเมื่อลูกค้าสั่งเพิ่ม (from_customer: true)
  // ป้องกันเสียงดังผิดที่เมื่อ admin แก้ไขออเดอร์
  if (body.batches !== undefined && body.from_customer === true) {
    ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'new_batch', order: updated }));
  }

  // ถ้ามี status → แจ้งห้องโต๊ะด้วย
  if (body.status) {
    ctx.waitUntil(broadcastToRoom(env, `table-${updated.table_num}`, { type: 'order_updated', id: updated.id, status: body.status, order: updated }));
  }

  return json(updated);
}

async function handleDeleteOrder(path, env, ctx) {
  const id  = path.split('/')[3];
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!row) return err('Order not found', 404);

  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();

  // Clear tableOrders ถ้าชี้ไปที่ order นี้
  await env.DB.prepare('DELETE FROM table_orders WHERE order_id = ?').bind(id).run();

  ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'order_deleted', id }));

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

// ==================== Menu (D1) ====================
// เก็บแต่ละ menu item เป็น row ใน D1 — ไม่ต้อง GET ทั้งก้อนก่อน PATCH
// schema: menu_items(id TEXT PK, data TEXT NOT NULL)
// ตัว data เก็บ JSON ของ item ทั้งหมด — flexible, ไม่ต้อง migrate เมื่อเพิ่ม field
//
// ถ้า table ยังไม่มีให้ migrate ครั้งแรกด้วย:
//   CREATE TABLE IF NOT EXISTS menu_items (id TEXT PRIMARY KEY, data TEXT NOT NULL);
//   (เพิ่มใน schema.sql ด้วย)

async function _ensureMenuTable(env) {
  // สร้าง table ถ้ายังไม่มี (idempotent — ใช้แทน migration สำหรับ table ใหม่)
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS menu_items (id TEXT PRIMARY KEY, data TEXT NOT NULL)'
  ).run();
}

async function handleGetMenu(env) {
  await _ensureMenuTable(env);

  // ลอง D1 ก่อน
  const { results } = await env.DB.prepare('SELECT id, data FROM menu_items').all();

  if (results.length > 0) {
    // คืน object { [id]: item } เหมือนเดิม (client ไม่ต้องเปลี่ยน)
    const menu = {};
    for (const row of results) {
      try { menu[row.id] = JSON.parse(row.data); } catch (_) {}
    }
    return json(menu);
  }

  // fallback: ถ้า D1 ว่าง ลอง migrate จาก KV (one-time migration)
  if (env.KV) {
    const kvMenu = await env.KV.get('menu', 'json').catch(() => null);
    if (kvMenu && Object.keys(kvMenu).length > 0) {
      // migrate ทีเดียว
      const stmts = Object.values(kvMenu).map(item =>
        env.DB.prepare('INSERT OR REPLACE INTO menu_items (id, data) VALUES (?, ?)')
          .bind(item.id, JSON.stringify(item))
      );
      // batch insert ใน transaction
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return json(kvMenu);
    }
  }

  return json({});
}

async function handlePutMenu(request, env, ctx) {
  await _ensureMenuTable(env);
  const body = await request.json(); // { [id]: item }

  if (!body || typeof body !== 'object') return err('invalid body');

  // upsert ทั้งหมดใน batch
  const items = Object.values(body);
  const stmts = items.map(item =>
    env.DB.prepare('INSERT OR REPLACE INTO menu_items (id, data) VALUES (?, ?)')
      .bind(item.id, JSON.stringify(item))
  );
  // ลบรายการที่ไม่อยู่ใน body (full replace)
  const ids = items.map(i => i.id);
  // batch upsert
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  // ลบ rows ที่ไม่อยู่ใน ids ใหม่
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM menu_items WHERE id NOT IN (${placeholders})`)
      .bind(...ids).run();
  } else {
    await env.DB.prepare('DELETE FROM menu_items').run();
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'menu_updated' }));
  } else {
    broadcastToRoom(env, 'admin', { type: 'menu_updated' });
  }
  return json({ ok: true });
}

async function handlePatchMenuItem(request, path, env, ctx) {
  await _ensureMenuTable(env);
  const id   = decodeURIComponent(path.split('/')[3]);
  const body = await request.json();

  // ถ้า imageUrl เป็น base64 → แยกเก็บใน KV, เก็บแค่ key ใน D1
  if (body.imageUrl && body.imageUrl.startsWith('data:')) {
    const imgKey = `img:${id}`;
    if (env.KV) {
      await env.KV.put(imgKey, body.imageUrl); // เก็บ base64 ใน KV
      body.imageUrl = `/api/menu-img/${encodeURIComponent(id)}`; // แทนด้วย URL
    } else {
      // ไม่มี KV → ปฏิเสธรูป base64 ใหญ่
      delete body.imageUrl;
    }
  }

  // ดึงเฉพาะ row นั้น (ไม่ GET ทั้งก้อนแล้ว)
  const existing = await env.DB.prepare('SELECT data FROM menu_items WHERE id = ?').bind(id).first();
  const current  = existing ? JSON.parse(existing.data) : {};
  const updated  = { ...current, ...body, id };

  await env.DB.prepare('INSERT OR REPLACE INTO menu_items (id, data) VALUES (?, ?)')
    .bind(id, JSON.stringify(updated)).run();

  if (ctx?.waitUntil) {
    ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'menu_updated' }));
  } else {
    broadcastToRoom(env, 'admin', { type: 'menu_updated' });
  }

  return json({ ok: true, item: updated });
}

async function handleDeleteMenuItem(path, env, ctx) {
  await _ensureMenuTable(env);
  const id = decodeURIComponent(path.split('/')[3]);

  await env.DB.prepare('DELETE FROM menu_items WHERE id = ?').bind(id).run();

  if (ctx?.waitUntil) {
    ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'menu_updated' }));
  } else {
    broadcastToRoom(env, 'admin', { type: 'menu_updated' });
  }

  return json({ ok: true });
}

// GET /api/menu-img/:id — serve รูป base64 ที่เก็บใน KV
async function handleGetMenuImg(path, env) {
  const id  = decodeURIComponent(path.split('/')[3]);
  const img = env.KV ? await env.KV.get(`img:${id}`).catch(() => null) : null;
  if (!img) return new Response('Not found', { status: 404 });
  // img เป็น data:image/jpeg;base64,...
  const [header, b64] = img.split(',');
  const mime = (header.match(/data:(.*);base64/) || [])[1] || 'image/jpeg';
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', ...CORS },
  });
}

/**
 * PATCH /api/menu-sort — อัปเดต sortOrder หลายรายการพร้อมกันใน 1 request
 * body: { orders: [{ id, sortOrder }, ...] }
 * แทน Promise.all(N × PATCH) ซึ่งทำให้เกิด race condition บน KV
 */
async function handleMenuSort(request, env, ctx) {
  await _ensureMenuTable(env);
  const body = await request.json();
  const orders = body?.orders; // [{ id, sortOrder }]
  if (!Array.isArray(orders) || orders.length === 0) return err('orders array required');

  // batch update sortOrder ทีละ 50
  const stmts = [];
  for (const { id, sortOrder } of orders) {
    if (!id) continue;
    const existing = await env.DB.prepare('SELECT data FROM menu_items WHERE id = ?').bind(id).first();
    if (!existing) continue;
    const item = JSON.parse(existing.data);
    item.sortOrder = sortOrder;
    stmts.push(
      env.DB.prepare('INSERT OR REPLACE INTO menu_items (id, data) VALUES (?, ?)')
        .bind(id, JSON.stringify(item))
    );
  }

  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(broadcastToRoom(env, 'admin', { type: 'menu_updated' }));
  } else {
    broadcastToRoom(env, 'admin', { type: 'menu_updated' });
  }

  return json({ ok: true, updated: stmts.length });
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
  await broadcastToRoom(env, 'admin', { type: 'call_staff', data: entry, entry });

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
// ใช้ WebSocket Hibernation API — DO จะ hibernate แล้ว sessions ไม่หาย
export class TableRoom {
  constructor(state) {
    this.state = state;
    this.ctx   = state; // alias
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Internal broadcast endpoint
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const msg = await request.text();
      // getWebSockets() คืน WS ทั้งหมดที่ยังเชื่อมอยู่ รวมถึงตอน DO hibernate
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) {
        try { ws.send(msg); } catch (_) {}
      }
      return new Response('ok');
    }

    // WebSocket upgrade — ใช้ acceptWebSocket แทน accept() เพื่อรองรับ hibernation
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server); // hibernation-aware accept

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation API callbacks — ถูกเรียกโดย runtime แทน addEventListener
  async webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws) {
    // ไม่ต้องทำอะไร runtime จัดการเอง
  }

  async webSocketError(ws) {
    // ไม่ต้องทำอะไร
  }
}
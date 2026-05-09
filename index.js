/**
 * ครัวคุณแม่ — Cloudflare Worker API
 * แทนที่ Firebase Realtime Database ทั้งหมด
 *
 * Routes:
 *   GET    /api/menu           → ดึงเมนูทั้งหมด
 *   GET    /api/meta           → ดึง meta (orderNumber, categories, toppings)
 *   GET    /api/orders         → ดึง orders ทั้งหมด (admin)
 *   POST   /api/orders         → บันทึก order ใหม่ (POS)
 *   PATCH  /api/orders/:id     → แก้ไข order (paid/edit items)
 *   DELETE /api/orders/:id     → ลบ order
 *   DELETE /api/orders         → ล้าง orders ทั้งหมด + reset orderNumber
 *   GET    /api/order-number   → ดึง/อัพเดท orderNumber วันนี้ (atomic)
 *   PUT    /api/meta           → อัพเดท meta (categories, toppings, orderNumber)
 *   PUT    /api/menu/:id       → เพิ่ม/แก้ไข menu item
 *   DELETE /api/menu/:id       → ลบ menu item
 *
 *   GET    /api/poll           → Long-poll สำหรับแจ้ง admin เมื่อมี order ใหม่
 *                                (ส่ง ?since=<timestamp ISO> มาด้วย)
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
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

// ==================== Auth (simple token) ====================
function isAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return token === env.ADMIN_TOKEN;
}

// ==================== Router ====================
export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ---- Menu ----
    if (path === '/api/menu' && request.method === 'GET') {
      return handleGetMenu(env);
    }
    if (path.startsWith('/api/menu/') && request.method === 'PUT') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handleUpsertMenuItem(request, env, path.slice(10));
    }
    if (path.startsWith('/api/menu/') && request.method === 'DELETE') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handleDeleteMenuItem(env, path.slice(10));
    }

    // ---- Meta ----
    if (path === '/api/meta' && request.method === 'GET') {
      return handleGetMeta(env);
    }
    if (path === '/api/meta' && request.method === 'PUT') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handlePutMeta(request, env);
    }

    // ---- Order Number (atomic, POS ใช้) ----
    if (path === '/api/order-number' && request.method === 'POST') {
      return handleNextOrderNumber(env);
    }

    // ---- Orders ----
    if (path === '/api/orders' && request.method === 'GET') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handleGetOrders(env);
    }
    if (path === '/api/orders' && request.method === 'POST') {
      return handleCreateOrder(request, env);
    }
    if (path === '/api/orders' && request.method === 'DELETE') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handleClearOrders(env);
    }
    if (path.startsWith('/api/orders/') && request.method === 'PATCH') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handlePatchOrder(request, env, path.slice(12));
    }
    if (path.startsWith('/api/orders/') && request.method === 'DELETE') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handleDeleteOrder(env, path.slice(12));
    }

    // ---- Poll (admin real-time replacement) ----
    if (path === '/api/poll' && request.method === 'GET') {
      if (!isAdmin(request, env)) return err('Unauthorized', 401);
      return handlePoll(request, env);
    }

    return err('Not found', 404);
  },
};

// ==================== Menu Handlers ====================
async function handleGetMenu(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, price, category, image, available, sort_order FROM menu ORDER BY sort_order ASC, name ASC'
  ).all();

  // แปลงเป็น format เดิม { id: { name, price, ... } }
  const menu = {};
  for (const row of results) {
    menu[row.id] = {
      name:      row.name,
      price:     row.price,
      category:  row.category,
      image:     row.image || '',
      available: row.available === 1,
      sortOrder: row.sort_order,
    };
  }
  return json(menu);
}

async function handleUpsertMenuItem(request, env, id) {
  const body = await request.json();
  const { name, price, category, image = '', available = true, sortOrder = 999 } = body;
  if (!name || price == null || !category) return err('Missing fields');

  await env.DB.prepare(`
    INSERT INTO menu (id, name, price, category, image, available, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, price=excluded.price, category=excluded.category,
      image=excluded.image, available=excluded.available, sort_order=excluded.sort_order
  `).bind(id, name, price, category, image, available ? 1 : 0, sortOrder).run();

  return json({ ok: true });
}

async function handleDeleteMenuItem(env, id) {
  await env.DB.prepare('DELETE FROM menu WHERE id=?').bind(id).run();
  return json({ ok: true });
}

// ==================== Meta Handlers ====================
async function handleGetMeta(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM meta').all();
  const meta = {};
  for (const row of results) {
    try { meta[row.key] = JSON.parse(row.value); }
    catch { meta[row.key] = row.value; }
  }
  return json(meta);
}

async function handlePutMeta(request, env) {
  const body = await request.json(); // { key: value, ... }
  const stmts = Object.entries(body).map(([k, v]) =>
    env.DB.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).bind(k, JSON.stringify(v))
  );
  await env.DB.batch(stmts);
  return json({ ok: true });
}

// ==================== Order Number (atomic) ====================
async function handleNextOrderNumber(env) {
  const today = new Date().toISOString().slice(0, 10);

  // ดึง lastOrderDate และ orderNumber
  const rows = await env.DB.prepare(
    "SELECT key, value FROM meta WHERE key IN ('orderNumber','lastOrderDate')"
  ).all();
  const m = {};
  for (const r of rows) { try { m[r.key] = JSON.parse(r.value); } catch { m[r.key] = r.value; } }

  let nextNum;
  if (m.lastOrderDate !== today) {
    nextNum = 1001;
  } else {
    nextNum = (m.orderNumber || 1000) + 1;
  }

  // บันทึกกลับ (ใช้ batch เพื่อ atomic)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (key,value) VALUES ('orderNumber',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(String(nextNum)),
    env.DB.prepare("INSERT INTO meta (key,value) VALUES ('lastOrderDate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(JSON.stringify(today)),
  ]);

  return json({ orderNumber: nextNum });
}

// ==================== Orders Handlers ====================
async function handleGetOrders(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, order_number, tbl, date, items, total, status FROM orders ORDER BY date DESC LIMIT 500'
  ).all();

  const orders = results.map(r => ({
    id:          r.id,
    orderNumber: r.order_number,
    table:       r.tbl,
    date:        r.date,
    items:       JSON.parse(r.items || '[]'),
    total:       r.total,
    status:      r.status,
  }));
  return json(orders);
}

async function handleCreateOrder(request, env) {
  const body = await request.json();
  const { orderNumber, table, date, items, total, status = 'pending' } = body;
  if (!orderNumber || !items) return err('Missing fields');

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO orders (id, order_number, tbl, date, items, total, status) VALUES (?,?,?,?,?,?,?)'
  ).bind(id, orderNumber, table || null, date || new Date().toISOString(), JSON.stringify(items), total, status).run();

  return json({ ok: true, id });
}

async function handlePatchOrder(request, env, id) {
  const body = await request.json();
  const updates = [];
  const binds   = [];

  if (body.status !== undefined)  { updates.push('status=?');        binds.push(body.status); }
  if (body.items  !== undefined)  { updates.push('items=?');          binds.push(JSON.stringify(body.items)); }
  if (body.total  !== undefined)  { updates.push('total=?');          binds.push(body.total); }

  if (updates.length === 0) return err('Nothing to update');
  binds.push(id);

  await env.DB.prepare(`UPDATE orders SET ${updates.join(',')} WHERE id=?`).bind(...binds).run();
  return json({ ok: true });
}

async function handleDeleteOrder(env, id) {
  await env.DB.prepare('DELETE FROM orders WHERE id=?').bind(id).run();
  return json({ ok: true });
}

async function handleClearOrders(env) {
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM orders'),
    env.DB.prepare("INSERT INTO meta (key,value) VALUES ('orderNumber','1001') ON CONFLICT(key) DO UPDATE SET value=excluded.value"),
    env.DB.prepare("INSERT INTO meta (key,value) VALUES ('lastOrderDate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(JSON.stringify(today)),
  ]);
  return json({ ok: true });
}

// ==================== Poll (แทน Firebase onValue) ====================
// Admin เรียก GET /api/poll?since=<ISO> ทุก 3 วินาที
// Worker ส่งคืน orders ที่ date > since เท่านั้น
async function handlePoll(request, env) {
  const url   = new URL(request.url);
  const since = url.searchParams.get('since') || new Date(0).toISOString();

  const { results } = await env.DB.prepare(
    'SELECT id, order_number, tbl, date, items, total, status FROM orders WHERE date > ? ORDER BY date DESC'
  ).bind(since).all();

  const orders = results.map(r => ({
    id:          r.id,
    orderNumber: r.order_number,
    table:       r.tbl,
    date:        r.date,
    items:       JSON.parse(r.items || '[]'),
    total:       r.total,
    status:      r.status,
  }));

  return json({ orders, serverTime: new Date().toISOString() });
}

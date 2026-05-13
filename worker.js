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
  // client ส่งมาเป็น sha256(username:password) อยู่แล้ว (ดู api-client.js::adminLogin)
  // เทียบตรงๆ กับ ADMIN_KEY_HASH ที่ตั้งไว้ใน wrangler secret
  // ADMIN_KEY_HASH = sha256("username:password")  ← ต้อง set ให้ตรง
  // 1) เทียบกับ Wrangler Secret ก่อน
  if (env.ADMIN_KEY_HASH && key === env.ADMIN_KEY_HASH) return true;
  // 2) fallback: ดู adminKeyHash ที่เปลี่ยนผ่าน Backoffice (เก็บใน D1 meta)
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key='adminKeyHash'").first();
    if (row && row.value && key === row.value) return true;
  } catch (_) {}
  return false;
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
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'PATCH') {
        // ลูกค้าสั่งเพิ่ม (from_customer: true) → อนุญาตเฉพาะ batches field เท่านั้น
        // admin → อนุญาตทุก field
        const cloned = request.clone();
        const body   = await cloned.json().catch(() => ({}));
        const adminOk = await isAdmin(request, env);
        if (!adminOk) {
          // ลูกค้าต้องส่ง from_customer: true และห้ามแก้ status / payment / note
          if (!body.from_customer)                  return err('Unauthorized', 401);
          if (body.status !== undefined)            return err('Unauthorized', 401);
          if (body.payment !== undefined)           return err('Unauthorized', 401);
          if (body.note !== undefined)              return err('Unauthorized', 401);
        }
        return handleUpdateOrder(request, path, env, ctx, body);
      }
      if (path.match(/^\/api\/orders\/[^/]+$/) && method === 'DELETE') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleDeleteOrder(path, env, ctx);
      }

      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'GET')    return handleGetTable(path, env);
      if (path.match(/^\/api\/table\/[^/]+$/) && method === 'DELETE') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleClearTable(path, env);
      }

      if (path === '/api/meta' && method === 'GET') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleGetMeta(env);
      }
      if (path === '/api/meta' && method === 'PATCH') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleUpdateMeta(request, env);
      }

      if (path === '/api/menu' && method === 'GET') return handleGetMenu(env);
      if (path === '/api/menu' && method === 'PUT') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handlePutMenu(request, env, ctx);
      }
      if (path === '/api/menu-sort' && method === 'PATCH') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleMenuSort(request, env, ctx);
      }
      if (path.match(/^\/api\/menu-img\/[^/]+$/) && method === 'GET') return handleGetMenuImg(path, env);
      if (path.match(/^\/api\/menu\/[^/]+$/) && method === 'PATCH')  {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handlePatchMenuItem(request, path, env, ctx);
      }
      if (path.match(/^\/api\/menu\/[^/]+$/) && method === 'DELETE') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleDeleteMenuItem(path, env, ctx);
      }

      if (path === '/api/call-staff' && method === 'POST')   return handleCallStaff(request, env);
      if (path === '/api/call-staff' && method === 'GET') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleGetCallLog(env);
      }
      if (path.match(/^\/api\/call-staff\/[^/]+$/) && method === 'PATCH') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleDoneCall(path, env);
      }
      if (path === '/api/call-staff' && method === 'DELETE') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleClearCallLog(env);
      }

      // ── Export Proxy → Google Apps Script (ป้องกัน CORS ฝั่ง browser) ──
      if (path === '/api/export-proxy' && method === 'POST') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleExportProxy(request);
      }

      // ── Claude AI Proxy → Anthropic API (ป้องกัน CORS + ซ่อน API key) ──
      if (path === '/api/claude-proxy' && method === 'POST') {
        if (!await isAdmin(request, env)) return err('Unauthorized', 401);
        return handleClaudeProxy(request, env);
      }

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
  const from   = url.searchParams.get('from');     // YYYY-MM-DD (Bangkok) เริ่มต้น
  const to     = url.searchParams.get('to');       // YYYY-MM-DD (Bangkok) สิ้นสุด
  // ถ้ามี date range ให้ limit สูงขึ้น (ย้อนหลังหลายเดือน); ไม่มีคง default 200
  const defaultLimit = (from || to) ? 5000 : 200;
  const limit  = parseInt(url.searchParams.get('limit') || String(defaultLimit));

  let q    = 'SELECT * FROM orders';
  const wb = [];
  const p  = [];

  if (today === '1') {
    wb.push("date(created_at, '+7 hours') = ?");
    p.push(todayStr());
  }
  if (from) {
    wb.push("date(created_at, '+7 hours') >= ?");
    p.push(from);
  }
  if (to) {
    wb.push("date(created_at, '+7 hours') <= ?");
    p.push(to);
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

  // Auto-increment order number — แก้ race condition ตอนเที่ยงคืน
  //
  // ปัญหาเดิม: SELECT lastOrderDate แล้วค่อย reset แยก → 2 requests พร้อมกัน
  // อาจ reset ซ้อนกัน ทำให้เลขออเดอร์แรกของวันไม่ใช่ 1001
  //
  // วิธีแก้: reset เป็น 1000 ด้วย conditional UPDATE (WHERE lastOrderDate != today)
  // D1 รับประกันว่า WHERE ทำให้ statement นี้ no-op ถ้าใครทำไปก่อนแล้ว
  // จากนั้น increment +1 แบบ atomic ด้วย UPDATE...RETURNING ในคำสั่งเดียว
  const today = todayStr();

  // Reset เฉพาะถ้าวันยังไม่ตรง — first-writer wins, คนที่สองได้ no-op
  // ตั้งเป็น 1000 เพราะ increment ด้านล่างจะ +1 ให้ได้ 1001 เป็นเลขแรก
  await env.DB.prepare(
    "UPDATE meta SET value = '1000' WHERE key = 'orderNumber' AND (SELECT value FROM meta WHERE key = 'lastOrderDate') != ?"
  ).bind(today).run();

  // อัปเดตวันที่ (idempotent — เขียนซ้ำได้ไม่เสียหาย)
  await env.DB.prepare(
    "UPDATE meta SET value = ? WHERE key = 'lastOrderDate'"
  ).bind(today).run();

  // INCREMENT แบบ atomic: อ่าน + บวก 1 + คืนค่าก่อนบวก ในคำสั่งเดียว
  const numRow = await env.DB
    .prepare("UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'orderNumber' RETURNING CAST(value AS INTEGER) - 1 AS cur")
    .first();

  // cur = ค่า *ก่อน* +1 (หมายเลขออเดอร์ที่ได้)
  const orderNum = numRow?.cur ?? 1001;

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

async function handleUpdateOrder(request, path, env, ctx, body = null) {
  const id   = path.split('/')[3];
  body = body ?? await request.json();

  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!row) return err('Order not found', 404);

  const updates = [];
  const params  = [];

  if (body.status !== undefined) {
    const VALID_STATUSES = ['pending', 'cooking', 'served', 'paid', 'cancelled'];
    if (!VALID_STATUSES.includes(body.status)) return err('Invalid status value', 400);
    updates.push('status = ?');
    params.push(body.status);
  }
  if (body.batches !== undefined) {
    const flat  = body.batches.flat();
    const total = flat.reduce((s, i) => s + (i.price * i.qty), 0);
    updates.push('batches = ?', 'total = ?', 'last_batch_at = ?');
    params.push(JSON.stringify(body.batches), total, nowISO());
  }
  // ack_batch: true → admin รับออเดอร์ batch ใหม่แล้ว → clear last_batch_at
  if (body.ack_batch === true) {
    updates.push('last_batch_at = ?');
    params.push(null);
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
  const deserialized = deserializeOrder(order);
  // คืน order_id ด้วย เพื่อให้ customer.js อ่าน data.order_id ได้ (data.id ก็ยังมีอยู่)
  return json({ ...deserialized, order_id: deserialized.id });
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

  // ดึงทุก id ในครั้งเดียว แทน N queries แยก
  const ids      = orders.map(o => o.id).filter(Boolean);
  const placeholders = ids.map(() => '?').join(', ');
  const { results: rows } = await env.DB
    .prepare(`SELECT id, data FROM menu_items WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();

  // map id → row เพื่อ lookup O(1)
  const rowMap = Object.fromEntries(rows.map(r => [r.id, r]));

  // สร้าง batch UPDATE จาก rows ที่มีอยู่จริง
  const stmts = [];
  for (const { id, sortOrder } of orders) {
    if (!id || !rowMap[id]) continue;
    const item = JSON.parse(rowMap[id].data);
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

  // Rate limit: 1 ครั้ง / โต๊ะ / 60 วินาที — ป้องกัน spam
  const recent = await env.DB
    .prepare("SELECT id FROM call_staff WHERE table_num = ? AND created_at > datetime('now', '-60 seconds') LIMIT 1")
    .bind(table_num)
    .first();
  if (recent) return err('กรุณารอสักครู่ก่อนเรียกพนักงานอีกครั้ง', 429);

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
// ==================== Export Proxy ====================
// ส่งข้อมูลไป Google Apps Script แทน browser เพื่อเลี่ยง CORS
// (Google Apps Script ไม่รองรับ CORS preflight จาก origin อื่น)
async function handleExportProxy(request) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('Invalid JSON body');
  }

  const { webhookUrl, orders } = body;
  if (!webhookUrl || typeof webhookUrl !== 'string') return err('Missing webhookUrl');
  if (!Array.isArray(orders))                        return err('Missing orders array');

  // ตรวจ URL ว่าเป็น Google Apps Script เท่านั้น (ป้องกัน SSRF)
  let parsed;
  try { parsed = new URL(webhookUrl); } catch (_) { return err('Invalid webhookUrl'); }
  if (parsed.hostname !== 'script.google.com') return err('webhookUrl must be script.google.com');

  try {
    const upstream = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orders }),
    });
    const text = await upstream.text();
    return new Response(text, {
      status:  upstream.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (fetchErr) {
    return err('Upstream fetch failed: ' + fetchErr.message, 502);
  }
}

// ── Claude AI Proxy (ใช้ Groq เป็น backend) ─────────────────
// รับ request จาก backoffice → ต่อ Groq API โดยใช้ secret key
// ต้อง set: wrangler secret put GROQ_API_KEY
async function handleClaudeProxy(request, env) {
  if (!env.GROQ_API_KEY) {
    return err('GROQ_API_KEY not configured — run: wrangler secret put GROQ_API_KEY', 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('Invalid JSON body');
  }

  // แปลง format → Groq (OpenAI-compatible)
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: body.system });
  for (const m of body.messages) {
    messages.push({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join(''),
    });
  }

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: body.max_tokens || 1000,
        temperature: 0.7,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || JSON.stringify(data) }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // แปลง OpenAI response → Anthropic-like format
    const text = data.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (fetchErr) {
    return err('Groq fetch failed: ' + fetchErr.message, 502);
  }
}

export class TableRoom {
  constructor(state) {
    this.state = state;
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

  async webSocketClose() {
    // ไม่ต้องทำอะไร runtime จัดการเอง
  }

  async webSocketError() {
    // ไม่ต้องทำอะไร
  }
}
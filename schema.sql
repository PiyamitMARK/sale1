-- ============================================================
-- ครัวคุณแม่ — D1 Schema
-- รัน: wrangler d1 execute krua-khun-mae --file=schema.sql
-- ============================================================

-- Menu
CREATE TABLE IF NOT EXISTS menu (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  price      REAL NOT NULL,
  category   TEXT NOT NULL,
  image      TEXT DEFAULT '',
  available  INTEGER DEFAULT 1,   -- 1=true, 0=false
  sort_order INTEGER DEFAULT 999
);

-- Meta (key-value: orderNumber, lastOrderDate, categories, categoriesSort, toppings)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  order_number INTEGER NOT NULL,
  tbl          TEXT,               -- หมายเลขโต๊ะ
  date         TEXT NOT NULL,      -- ISO 8601
  items        TEXT NOT NULL,      -- JSON array
  total        REAL NOT NULL,
  status       TEXT DEFAULT 'pending'  -- 'pending' | 'paid'
);

-- Index สำหรับ query เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_orders_date   ON orders(date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu(category);

-- ============================================================
-- Seed: ค่าเริ่มต้น meta
-- ============================================================
INSERT OR IGNORE INTO meta (key, value) VALUES
  ('orderNumber',    '1001'),
  ('lastOrderDate',  '"2000-01-01"'),
  ('categories',     '{"pad":"🥘 ผัด","khao":"🍚 ข้าว","tom":"🍲 ต้ม/แกง","nam":"🥤 เครื่องดื่ม"}'),
  ('categoriesSort', '["pad","khao","tom","nam"]'),
  ('toppings',       '{}');

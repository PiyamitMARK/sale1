-- ==========================================
-- ข้าวซอย 90 — Cloudflare D1 Schema
-- ==========================================

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,        -- Firebase key เดิม หรือ nanoid ใหม่
  order_num    INTEGER NOT NULL,
  table_num    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
                                        -- pending | cooking | served | paid | cancelled
  batches      TEXT NOT NULL DEFAULT '[]',  -- JSON array ของ batch items
  total        REAL NOT NULL DEFAULT 0,
  payment      TEXT,                    -- cash | qr | card | transfer
  note         TEXT,
  is_takeaway  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,           -- ISO8601
  updated_at   TEXT NOT NULL,
  last_batch_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table      ON orders(table_num);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_takeaway   ON orders(is_takeaway);

-- tableOrders — map table → active order id
CREATE TABLE IF NOT EXISTS table_orders (
  table_num  TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- meta — order counter, popularItems, etc.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta VALUES ('orderNumber', '1001');
INSERT OR IGNORE INTO meta VALUES ('lastOrderDate', '');
INSERT OR IGNORE INTO meta VALUES ('popularItems', '[]');

-- callStaff — เรียกพนักงาน
CREATE TABLE IF NOT EXISTS call_staff (
  id         TEXT PRIMARY KEY,
  table_num  TEXT NOT NULL,
  message    TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_staff_done ON call_staff(done);

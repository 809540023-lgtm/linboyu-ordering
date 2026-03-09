// ===== 資料庫初始化 =====
// 生產環境用 better-sqlite3（效能更好）
// 開發/測試環境 fallback 到 sql.js（純 JS，不需編譯）

const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'ordering.db');

// ===== 資料表定義 =====
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '（待設定）',
    description TEXT DEFAULT '白飯80g + 主食 + 時蔬2樣 + 例湯',
    price INTEGER NOT NULL,
    cost INTEGER DEFAULT 0,
    daily_quota INTEGER DEFAULT 30,
    emoji TEXT DEFAULT '🍱',
    image_url TEXT,
    status TEXT DEFAULT 'active',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, product_id INTEGER NOT NULL,
    total_qty INTEGER NOT NULL, sold_qty INTEGER DEFAULT 0, reserved_qty INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id), UNIQUE(date, product_id)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, customer_email TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'pickup', delivery_address TEXT,
    pickup_date TEXT NOT NULL, discount_rate REAL NOT NULL DEFAULT 1.0,
    discount_label TEXT DEFAULT '原價', subtotal INTEGER NOT NULL,
    discount_amount INTEGER DEFAULT 0, delivery_fee INTEGER DEFAULT 0,
    total_amount INTEGER NOT NULL, payment_method TEXT,
    payment_status TEXT DEFAULT 'pending', payment_trade_no TEXT,
    order_status TEXT DEFAULT 'confirmed', note TEXT,
    brand TEXT DEFAULT 'ai', line_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL, quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL, original_price INTEGER NOT NULL, subtotal INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT,
    line_user_id TEXT, total_orders INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0, tag TEXT DEFAULT 'new', note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_order_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL, type TEXT DEFAULT 'general',
    discount_rate REAL NOT NULL, max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0, valid_from DATETIME, valid_until DATETIME,
    status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL, total_orders INTEGER DEFAULT 0,
    total_revenue INTEGER DEFAULT 0, total_cost INTEGER DEFAULT 0,
    orders_8off INTEGER DEFAULT 0, orders_9off INTEGER DEFAULT 0,
    orders_full INTEGER DEFAULT 0, orders_delivery INTEGER DEFAULT 0,
    orders_pickup INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS line_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, recipient TEXT, content TEXT NOT NULL,
    status TEXT DEFAULT 'sent', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(pickup_date);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
  CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status);
  CREATE INDEX IF NOT EXISTS idx_inventory_date ON daily_inventory(date);
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
`;

// ===== 嘗試使用 better-sqlite3 =====
let db;

try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  // 標記為同步模式（better-sqlite3）
  db._mode = 'better-sqlite3';
  db._ready = true;
  db.waitReady = async () => db;

  console.log('✅ 資料庫初始化完成（better-sqlite3）：', dbPath);

} catch (betterSqliteErr) {
  // ===== Fallback: sql.js（純 JS）=====
  console.log('⚠️  better-sqlite3 不可用，改用 sql.js ...');

  const initSqlJs = require('sql.js');

  class SqlJsWrapper {
    constructor() {
      this.db = null;
      this._ready = false;
      this._mode = 'sql.js';
      this._inTransaction = false;
      this._readyPromise = this._init();
    }

    async _init() {
      const SQL = await initSqlJs();
      let buf = null;
      if (fs.existsSync(dbPath)) buf = fs.readFileSync(dbPath);
      this.db = buf ? new SQL.Database(buf) : new SQL.Database();
      this.db.run("PRAGMA foreign_keys = ON");
      this.db.exec(SCHEMA_SQL);
      this._persist();
      this._ready = true;
      console.log('✅ 資料庫初始化完成（sql.js）：', dbPath);
    }

    async waitReady() { await this._readyPromise; return this; }

    _check() { if (!this._ready) throw new Error('DB not ready'); }

    _persist() {
      if (this.db && !this._inTransaction) {
        fs.writeFileSync(dbPath, Buffer.from(this.db.export()));
      }
    }

    prepare(sql) {
      this._check();
      const self = this;
      return {
        run(...p) {
          self.db.run(sql, p);
          const info = { changes: self.db.getRowsModified(), lastInsertRowid: self._lastId() };
          self._persist();
          return info;
        },
        get(...p) {
          const s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          const r = s.step() ? s.getAsObject() : undefined;
          s.free();
          return r;
        },
        all(...p) {
          const res = [], s = self.db.prepare(sql);
          if (p.length) s.bind(p);
          while (s.step()) res.push(s.getAsObject());
          s.free();
          return res;
        }
      };
    }

    _lastId() {
      const s = this.db.prepare("SELECT last_insert_rowid() as id");
      s.step(); const r = s.getAsObject(); s.free();
      return r.id;
    }

    exec(sql) {
      this._check();
      const t = sql.trim().toUpperCase();
      if (t === 'BEGIN TRANSACTION' || t === 'BEGIN') {
        this._inTransaction = true; this.db.run("BEGIN TRANSACTION"); return;
      }
      if (t === 'COMMIT') {
        this.db.run("COMMIT"); this._inTransaction = false; this._persist(); return;
      }
      if (t === 'ROLLBACK') {
        this.db.run("ROLLBACK"); this._inTransaction = false; this._persist(); return;
      }
      this.db.exec(sql);
      this._persist();
    }

    pragma(sql) { this._check(); this.db.run(`PRAGMA ${sql}`); }

    transaction(fn) {
      this._check();
      const self = this;
      return function(...args) {
        self._inTransaction = true;
        self.db.run("BEGIN TRANSACTION");
        try {
          const r = fn(...args);
          self.db.run("COMMIT");
          self._inTransaction = false;
          self._persist();
          return r;
        } catch (e) {
          self.db.run("ROLLBACK");
          self._inTransaction = false;
          throw e;
        }
      };
    }

    close() { if (this.db) { this._persist(); this.db.close(); this.db = null; } }
  }

  db = new SqlJsWrapper();
}

module.exports = db;

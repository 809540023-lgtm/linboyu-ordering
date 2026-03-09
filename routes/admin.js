// ===== 管理員 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const dayjs = require('dayjs');

// ===== 驗證中介軟體（管理員） =====
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const adminToken = process.env.ADMIN_TOKEN || 'demo-admin-token';

  if (!token || token !== adminToken) {
    return res.status(401).json({ error: '未授權的訪問' });
  }
  next();
};

// ===== POST /api/admin/login - 管理員登入 =====
router.post('/login', (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '缺少密碼' });
    }

    // 取得儲存的密碼（實務應使用 bcrypt）
    const adminPassword = process.env.ADMIN_PASSWORD || db.prepare(
      "SELECT value FROM settings WHERE key = 'admin_password_hash'"
    ).get()?.value;

    if (!adminPassword || password !== adminPassword) {
      return res.status(401).json({ error: '密碼錯誤' });
    }

    // 生成簡單的 token（實務應使用 JWT）
    const token = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      message: '登入成功',
      data: {
        token,
        type: 'Bearer'
      }
    });
  } catch (err) {
    console.error('❌ 登入錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/admin/dashboard - 儀表板統計 =====
router.get('/dashboard', requireAdmin, (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const today = dayjs().format('YYYY-MM-DD');
    let dateFilter = 'WHERE pickup_date = ?';
    const params = [today];

    // 如果指定日期範圍
    if (date_from && date_to) {
      if (!dayjs(date_from).isValid() || !dayjs(date_to).isValid()) {
        return res.status(400).json({ error: '無效的日期格式' });
      }
      dateFilter = 'WHERE pickup_date BETWEEN ? AND ?';
      params[0] = date_from;
      params[1] = date_to;
    }

    // 取得訂單統計
    const orders = db.prepare(`
      SELECT * FROM orders ${dateFilter}
    `).all(...params);

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total_amount, 0);
    const paidOrders = orders.filter(o => o.payment_status === 'paid').length;
    const pendingOrders = orders.filter(o => o.payment_status === 'pending').length;
    const completedOrders = orders.filter(o => o.order_status === 'completed').length;

    // 取得客戶統計
    const totalCustomers = db.prepare(
      'SELECT COUNT(*) as cnt FROM customers'
    ).get().cnt;

    const newCustomers = db.prepare(
      `SELECT COUNT(*) as cnt FROM customers WHERE tag = 'new'`
    ).get().cnt;

    const regularCustomers = db.prepare(
      `SELECT COUNT(*) as cnt FROM customers WHERE tag = 'regular'`
    ).get().cnt;

    const vipCustomers = db.prepare(
      `SELECT COUNT(*) as cnt FROM customers WHERE tag = 'vip'`
    ).get().cnt;

    // 取得產品統計
    const totalProducts = db.prepare(
      'SELECT COUNT(*) as cnt FROM products WHERE status = "active"'
    ).get().cnt;

    // 取得庫存統計（今日或指定日期）
    const inventoryDate = date_from || today;
    const inventory = db.prepare(`
      SELECT
        SUM(total_qty) as total_qty,
        SUM(sold_qty) as sold_qty,
        SUM(reserved_qty) as reserved_qty
      FROM daily_inventory
      WHERE date = ?
    `).get(inventoryDate);

    const availableQty = inventory.total_qty - inventory.sold_qty - inventory.reserved_qty;

    // 取得折扣統計
    const discountBreakdown = {
      '8折': orders.filter(o => o.discount_rate === 0.8).length,
      '9折': orders.filter(o => o.discount_rate === 0.9).length,
      '原價': orders.filter(o => o.discount_rate === 1.0).length
    };

    const deliveryBreakdown = {
      '自取': orders.filter(o => o.delivery_type === 'pickup').length,
      '外送': orders.filter(o => o.delivery_type === 'delivery').length
    };

    // 取得付款方式統計
    const paymentMethods = {};
    const methods = db.prepare(
      `SELECT payment_method, COUNT(*) as cnt FROM orders ${dateFilter} AND payment_status = 'paid' GROUP BY payment_method`
    ).all(...params);

    methods.forEach(m => {
      paymentMethods[m.payment_method || '未指定'] = m.cnt;
    });

    res.json({
      success: true,
      data: {
        summary: {
          date_range: date_from && date_to ? `${date_from} ~ ${date_to}` : today,
          total_orders: totalOrders,
          total_revenue: totalRevenue,
          paid_orders: paidOrders,
          pending_orders: pendingOrders,
          completed_orders: completedOrders
        },
        customers: {
          total: totalCustomers,
          new: newCustomers,
          regular: regularCustomers,
          vip: vipCustomers
        },
        products: {
          active: totalProducts
        },
        inventory: {
          total_qty: inventory.total_qty || 0,
          sold_qty: inventory.sold_qty || 0,
          reserved_qty: inventory.reserved_qty || 0,
          available_qty: availableQty >= 0 ? availableQty : 0
        },
        breakdown: {
          discounts: discountBreakdown,
          delivery: deliveryBreakdown,
          payment_methods: paymentMethods
        }
      }
    });
  } catch (err) {
    console.error('❌ 儀表板錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/admin/settings - 取得所有設定 =====
router.get('/settings', requireAdmin, (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all();

    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ 取得設定錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/admin/settings - 更新設定 =====
router.put('/settings', requireAdmin, (req, res) => {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: '無效的設定格式' });
    }

    const insertOrUpdate = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    for (const [key, value] of Object.entries(settings)) {
      if (key.includes('password') && String(value).length < 6) {
        return res.status(400).json({ error: '密碼長度必須 >= 6' });
      }
      insertOrUpdate.run(key, String(value));
    }

    res.json({
      success: true,
      message: '設定已更新',
      count: Object.keys(settings).length
    });
  } catch (err) {
    console.error('❌ 更新設定錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/admin/daily-report/:date - 每日報表 =====
router.get('/daily-report/:date', requireAdmin, (req, res) => {
  try {
    const { date } = req.params;

    if (!dayjs(date).isValid()) {
      return res.status(400).json({ error: '無效的日期格式' });
    }

    // 取得該日所有訂單
    const orders = db.prepare(`
      SELECT * FROM orders WHERE pickup_date = ?
    `).all(date);

    if (orders.length === 0) {
      return res.json({
        success: true,
        data: {
          date,
          total_orders: 0,
          message: '該日無訂單'
        }
      });
    }

    // 計算各項統計
    const report = {
      date,
      total_orders: orders.length,
      total_revenue: orders.reduce((sum, o) => sum + o.total_amount, 0),
      total_discount: orders.reduce((sum, o) => sum + o.discount_amount, 0),

      payment_status: {
        paid: orders.filter(o => o.payment_status === 'paid').length,
        pending: orders.filter(o => o.payment_status === 'pending').length,
        failed: orders.filter(o => o.payment_status === 'failed').length,
        refunded: orders.filter(o => o.payment_status === 'refunded').length
      },

      order_status: {
        confirmed: orders.filter(o => o.order_status === 'confirmed').length,
        preparing: orders.filter(o => o.order_status === 'preparing').length,
        ready: orders.filter(o => o.order_status === 'ready').length,
        completed: orders.filter(o => o.order_status === 'completed').length,
        cancelled: orders.filter(o => o.order_status === 'cancelled').length
      },

      delivery_type: {
        pickup: orders.filter(o => o.delivery_type === 'pickup').length,
        delivery: orders.filter(o => o.delivery_type === 'delivery').length
      },

      discount_breakdown: {
        '8折': orders.filter(o => o.discount_rate === 0.8).length,
        '9折': orders.filter(o => o.discount_rate === 0.9).length,
        '原價': orders.filter(o => o.discount_rate === 1.0).length
      },

      payment_methods: {}
    };

    // 統計付款方式
    const methods = db.prepare(
      `SELECT payment_method, COUNT(*) as cnt FROM orders WHERE pickup_date = ? AND payment_status = 'paid' GROUP BY payment_method`
    ).all(date);

    methods.forEach(m => {
      report.payment_methods[m.payment_method || '未指定'] = m.cnt;
    });

    // 取得庫存使用情況
    const inventory = db.prepare(`
      SELECT
        p.name,
        di.total_qty,
        di.sold_qty,
        di.reserved_qty,
        (di.total_qty - di.sold_qty - di.reserved_qty) as available_qty
      FROM daily_inventory di
      JOIN products p ON di.product_id = p.id
      WHERE di.date = ?
    `).all(date);

    report.inventory = inventory;

    res.json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error('❌ 取得報表錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/admin/export/:type - 匯出資料 =====
router.get('/export/:type', requireAdmin, (req, res) => {
  try {
    const { type } = req.params;
    const { date_from, date_to } = req.query;

    let data = [];
    let filename = '';

    if (type === 'orders') {
      filename = `訂單_${dayjs().format('YYYY-MM-DD')}.json`;

      let query = 'SELECT * FROM orders WHERE 1=1';
      const params = [];

      if (date_from && date_to) {
        query += ' AND pickup_date BETWEEN ? AND ?';
        params.push(date_from, date_to);
      }

      data = db.prepare(query).all(...params);
    } else if (type === 'customers') {
      filename = `客戶_${dayjs().format('YYYY-MM-DD')}.json`;
      data = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
    } else if (type === 'inventory') {
      filename = `庫存_${dayjs().format('YYYY-MM-DD')}.json`;
      data = db.prepare(`
        SELECT
          di.date,
          p.name,
          di.total_qty,
          di.sold_qty,
          di.reserved_qty
        FROM daily_inventory di
        JOIN products p ON di.product_id = p.id
        ORDER BY di.date DESC, p.sort_order
      `).all();
    } else {
      return res.status(400).json({ error: '無效的匯出類型' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  } catch (err) {
    console.error('❌ 匯出錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

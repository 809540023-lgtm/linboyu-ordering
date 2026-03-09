// ===== 訂單 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const dayjs = require('dayjs');

// ===== 輔助函數 =====
// 計算折扣率（根據取餐日期）
function calculateDiscountRate(pickupDate) {
  const today = dayjs().startOf('day');
  const pickup = dayjs(pickupDate).startOf('day');
  const daysUntilPickup = pickup.diff(today, 'day');

  if (daysUntilPickup >= 3) {
    return { rate: 0.8, label: '8折' }; // 3+ 天前
  } else if (daysUntilPickup === 1) {
    return { rate: 0.9, label: '9折' }; // 1 天前
  } else {
    return { rate: 1.0, label: '原價' }; // 當天或之前
  }
}

// 產生訂單編號
function generateOrderNumber() {
  const date = dayjs().format('YYYYMMDD');
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM orders WHERE order_number LIKE ?"
  ).get(`LBY-${date}-%`);

  const seq = String(count.cnt + 1).padStart(3, '0');
  return `LBY-${date}-${seq}`;
}

// 驗證中介軟體（管理員）
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const adminToken = process.env.ADMIN_TOKEN || 'demo-admin-token';

  if (!token || token !== adminToken) {
    return res.status(401).json({ error: '未授權的訪問' });
  }
  next();
};

// ===== POST /api/orders - 建立訂單 =====
router.post('/', (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      delivery_type,
      delivery_address,
      pickup_date,
      items,
      discount_code,
      brand,
      note,
      line_user_id
    } = req.body;

    // ===== 驗證輸入 =====
    if (!customer_name || !customer_phone || !pickup_date || !items || items.length === 0) {
      return res.status(400).json({ error: '缺少必填欄位' });
    }

    if (delivery_type === 'delivery' && !delivery_address) {
      return res.status(400).json({ error: '外送需要提供收貨地址' });
    }

    if (!dayjs(pickup_date).isValid()) {
      return res.status(400).json({ error: '無效的取餐日期' });
    }

    if (dayjs(pickup_date).startOf('day').isBefore(dayjs().startOf('day'))) {
      return res.status(400).json({ error: '取餐日期不能早於今天' });
    }

    // ===== 檢查並更新客戶 =====
    let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customer_phone);
    if (!customer) {
      db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)').run(
        customer_name, customer_phone, customer_email || null
      );
      customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customer_phone);
    }

    // ===== 計算折扣 =====
    let discountInfo = calculateDiscountRate(pickup_date);
    let discountRate = discountInfo.rate;
    let discountLabel = discountInfo.label;

    if (discount_code) {
      const code = db.prepare(`
        SELECT * FROM discount_codes WHERE code = ? AND status = 'active'
        AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
        AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)
      `).get(discount_code);

      if (!code) return res.status(400).json({ error: '無效或已過期的折扣碼' });
      if (code.used_count >= code.max_uses) return res.status(400).json({ error: '折扣碼已達使用上限' });

      if (code.discount_rate < discountRate) {
        discountRate = code.discount_rate;
        discountLabel = `${discount_code} (${Math.round(discountRate * 100)}折)`;
      }
    }

    // ===== 檢查庫存 =====
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(item.product_id));
      if (!product) return res.status(404).json({ error: `品項 ${item.product_id} 不存在` });

      const qty = parseInt(item.quantity);
      if (qty < 1) return res.status(400).json({ error: '數量必須 >= 1' });

      const inventory = db.prepare('SELECT * FROM daily_inventory WHERE date = ? AND product_id = ?')
        .get(pickup_date, product.id);
      if (!inventory) return res.status(400).json({ error: `${product.name} 該日期無法供應` });

      const available = inventory.total_qty - inventory.sold_qty - inventory.reserved_qty;
      if (qty > available) {
        return res.status(400).json({ error: `${product.name} 該日期庫存不足（剩餘: ${available}）` });
      }

      const itemSubtotal = product.price * qty;
      subtotal += itemSubtotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        original_price: product.price,
        unit_price: Math.round(product.price * discountRate),
        subtotal: Math.round(itemSubtotal * discountRate)
      });
    }

    // ===== 計算最終金額 =====
    const discountAmount = subtotal - Math.round(subtotal * discountRate);
    let deliveryFee = 0;

    if (delivery_type === 'delivery') {
      const deliveryFeeStr = db.prepare("SELECT value FROM settings WHERE key = 'delivery_fee'").get();
      deliveryFee = parseInt(deliveryFeeStr?.value) || 30;
    }

    const totalAmount = Math.round(subtotal * discountRate) + deliveryFee;
    const orderNumber = generateOrderNumber();

    // ===== 建立訂單（使用手動交易）=====
    db.exec('BEGIN TRANSACTION');
    try {
      const result = db.prepare(`
        INSERT INTO orders (
          order_number, customer_name, customer_phone, customer_email,
          delivery_type, delivery_address, pickup_date,
          discount_rate, discount_label, subtotal, discount_amount, delivery_fee, total_amount,
          order_status, brand, line_user_id, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderNumber, customer_name, customer_phone, customer_email || null,
        delivery_type || 'pickup', delivery_address || null, pickup_date,
        discountRate, discountLabel, subtotal, discountAmount, deliveryFee, totalAmount,
        'confirmed', brand || 'ai', line_user_id || null, note || null
      );

      const orderId = result.lastInsertRowid;

      for (const item of orderItems) {
        db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, original_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.original_price, item.subtotal);

        db.prepare('UPDATE daily_inventory SET reserved_qty = reserved_qty + ? WHERE date = ? AND product_id = ?')
          .run(item.quantity, pickup_date, item.product_id);
      }

      db.prepare('UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ?, last_order_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(totalAmount, customer.id);

      db.exec('COMMIT');

      res.status(201).json({
        success: true,
        message: '訂單已建立，待支付',
        data: {
          order_id: orderId,
          order_number: orderNumber,
          total_amount: totalAmount,
          subtotal: subtotal,
          discount_amount: discountAmount,
          discount_label: discountLabel,
          delivery_fee: deliveryFee,
          payment_status: 'pending'
        }
      });
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    console.error('❌ 建立訂單錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/orders - 列出訂單（管理員） =====
router.get('/', requireAdmin, (req, res) => {
  try {
    const { status, date, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND order_status = ?';
      params.push(status);
    }

    if (date) {
      query += ' AND pickup_date = ?';
      params.push(date);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    params.push(limitNum, (pageNum - 1) * limitNum);

    const orders = db.prepare(query).all(...params);

    // 取得總數
    let countQuery = 'SELECT COUNT(*) as cnt FROM orders WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ' AND order_status = ?';
      countParams.push(status);
    }
    if (date) {
      countQuery += ' AND pickup_date = ?';
      countParams.push(date);
    }

    const { cnt } = db.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: cnt,
        pages: Math.ceil(cnt / limitNum)
      }
    });
  } catch (err) {
    console.error('❌ 列出訂單錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/orders/:id - 取得訂單詳細 =====
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的訂單 ID' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(id));
    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(parseInt(id));

    res.json({
      success: true,
      data: {
        ...order,
        items
      }
    });
  } catch (err) {
    console.error('❌ 取得訂單錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/orders/:id/status - 更新訂單狀態（管理員） =====
router.put('/:id/status', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { order_status } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的訂單 ID' });
    }

    if (!order_status) {
      return res.status(400).json({ error: '缺少 order_status 欄位' });
    }

    const validStatuses = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({ error: '無效的訂單狀態' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(id));
    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    db.prepare(`
      UPDATE orders
      SET order_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(order_status, parseInt(id));

    res.json({
      success: true,
      message: '訂單狀態已更新',
      data: { id: parseInt(id), order_status }
    });
  } catch (err) {
    console.error('❌ 更新訂單狀態錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/orders/daily-summary/:date - 每日摘要 =====
router.get('/daily-summary/:date', requireAdmin, (req, res) => {
  try {
    const { date } = req.params;

    if (!dayjs(date).isValid()) {
      return res.status(400).json({ error: '無效的日期格式' });
    }

    const orders = db.prepare(`
      SELECT * FROM orders WHERE pickup_date = ?
    `).all(date);

    if (orders.length === 0) {
      return res.json({
        success: true,
        data: {
          date,
          total_orders: 0,
          total_revenue: 0,
          orders_by_status: {}
        }
      });
    }

    const summary = {
      date,
      total_orders: orders.length,
      total_revenue: orders.reduce((sum, o) => sum + o.total_amount, 0),
      orders_by_status: {},
      orders_by_delivery: {
        pickup: orders.filter(o => o.delivery_type === 'pickup').length,
        delivery: orders.filter(o => o.delivery_type === 'delivery').length
      },
      discounts: {
        '8折': orders.filter(o => o.discount_rate === 0.8).length,
        '9折': orders.filter(o => o.discount_rate === 0.9).length,
        '原價': orders.filter(o => o.discount_rate === 1.0).length
      }
    };

    const statuses = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    statuses.forEach(status => {
      summary.orders_by_status[status] = orders.filter(o => o.order_status === status).length;
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    console.error('❌ 取得每日摘要錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

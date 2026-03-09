// ===== 客戶 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// ===== 驗證中介軟體（管理員）=====
const { requireAdmin } = require("../middleware/auth");

// ===== GET /api/customers - 列出所有客戶（管理員） =====
router.get('/', requireAdmin, (req, res) => {
  try {
    const { tag, page = 1, limit = 20, search } = req.query;

    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    // 依標籤篩選
    if (tag) {
      if (!['new', 'regular', 'vip'].includes(tag)) {
        return res.status(400).json({ error: '無效的客戶標籤' });
      }
      query += ' AND tag = ?';
      params.push(tag);
    }

    // 搜尋：名字或電話
    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY last_order_at DESC, created_at DESC LIMIT ? OFFSET ?';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    params.push(limitNum, (pageNum - 1) * limitNum);

    const customers = db.prepare(query).all(...params);

    // 取得總數
    let countQuery = 'SELECT COUNT(*) as cnt FROM customers WHERE 1=1';
    const countParams = [];
    if (tag) {
      countQuery += ' AND tag = ?';
      countParams.push(tag);
    }
    if (search) {
      countQuery += ' AND (name LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }

    const { cnt } = db.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: cnt,
        pages: Math.ceil(cnt / limitNum)
      }
    });
  } catch (err) {
    console.error('❌ 列出客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/customers/:phone - 根據電話查詢客戶 =====
router.get('/by-phone/:phone', (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: '無效的電話號碼' });
    }

    const customer = db.prepare(`
      SELECT * FROM customers WHERE phone = ?
    `).get(phone);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: '客戶不存在'
      });
    }

    // 取得該客戶的訂單記錄
    const orders = db.prepare(`
      SELECT
        id, order_number, pickup_date, total_amount,
        discount_label, payment_status, order_status, created_at
      FROM orders
      WHERE customer_phone = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(phone);

    res.json({
      success: true,
      data: {
        ...customer,
        recent_orders: orders
      }
    });
  } catch (err) {
    console.error('❌ 查詢客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/customers/:id - 取得單一客戶（管理員） =====
router.get('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的客戶 ID' });
    }

    const customer = db.prepare(`
      SELECT * FROM customers WHERE id = ?
    `).get(parseInt(id));

    if (!customer) {
      return res.status(404).json({ error: '客戶不存在' });
    }

    // 取得該客戶的完整訂單記錄
    const orders = db.prepare(`
      SELECT
        id, order_number, pickup_date, total_amount,
        discount_label, payment_status, order_status, created_at
      FROM orders
      WHERE customer_phone = ?
      ORDER BY created_at DESC
    `).all(customer.phone);

    // 計算統計資料
    const stats = {
      total_orders: orders.length,
      total_spent: orders.reduce((sum, o) => sum + o.total_amount, 0),
      pending_orders: orders.filter(o => o.payment_status === 'pending').length,
      completed_orders: orders.filter(o => o.order_status === 'completed').length
    };

    res.json({
      success: true,
      data: {
        ...customer,
        stats,
        orders
      }
    });
  } catch (err) {
    console.error('❌ 取得客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/customers/:id - 更新客戶資料（管理員） =====
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, tag, note, line_user_id } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的客戶 ID' });
    }

    // 檢查客戶是否存在
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(parseInt(id));
    if (!customer) {
      return res.status(404).json({ error: '客戶不存在' });
    }

    // 驗證標籤
    if (tag && !['new', 'regular', 'vip'].includes(tag)) {
      return res.status(400).json({ error: '無效的客戶標籤' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email || null);
    }
    if (tag !== undefined) {
      updates.push('tag = ?');
      values.push(tag);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      values.push(note || null);
    }
    if (line_user_id !== undefined) {
      updates.push('line_user_id = ?');
      values.push(line_user_id || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '沒有欄位要更新' });
    }

    values.push(parseInt(id));

    db.prepare(`
      UPDATE customers
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({
      success: true,
      message: '客戶資料已更新',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 更新客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/customers - 建立新客戶（管理員） =====
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, phone, email, tag } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        error: '缺少必填欄位: name, phone'
      });
    }

    // 檢查電話是否已存在
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: '該電話號碼已存在' });
    }

    const validTag = tag && ['new', 'regular', 'vip'].includes(tag) ? tag : 'new';

    const result = db.prepare(`
      INSERT INTO customers (name, phone, email, tag)
      VALUES (?, ?, ?, ?)
    `).run(name, phone, email || null, validTag);

    res.status(201).json({
      success: true,
      message: '客戶已建立',
      data: {
        id: result.lastInsertRowid,
        name,
        phone,
        tag: validTag
      }
    });
  } catch (err) {
    console.error('❌ 建立客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE /api/customers/:id - 刪除客戶（管理員） =====
// 注意：此操作應謹慎，可能會影響訂單記錄
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的客戶 ID' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(parseInt(id));
    if (!customer) {
      return res.status(404).json({ error: '客戶不存在' });
    }

    // 檢查是否有訂單
    const orderCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM orders WHERE customer_phone = ?'
    ).get(customer.phone);

    if (orderCount.cnt > 0) {
      return res.status(400).json({
        error: `無法刪除，該客戶有 ${orderCount.cnt} 筆訂單記錄`
      });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(parseInt(id));

    res.json({
      success: true,
      message: '客戶已刪除',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 刪除客戶錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

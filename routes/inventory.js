// ===== 庫存 API 路由 =====
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

// ===== GET /api/inventory/:date - 取得特定日期的庫存 =====
router.get('/:date', requireAdmin, (req, res) => {
  try {
    const { date } = req.params;

    if (!dayjs(date).isValid()) {
      return res.status(400).json({ error: '無效的日期格式 (YYYY-MM-DD)' });
    }

    const inventory = db.prepare(`
      SELECT
        di.id,
        di.date,
        di.product_id,
        p.code,
        p.name,
        p.price,
        di.total_qty,
        di.sold_qty,
        di.reserved_qty,
        (di.total_qty - di.sold_qty - di.reserved_qty) as available_qty
      FROM daily_inventory di
      JOIN products p ON di.product_id = p.id
      WHERE di.date = ?
      ORDER BY p.sort_order, p.created_at
    `).all(date);

    if (inventory.length === 0) {
      return res.json({
        success: true,
        message: '該日期無庫存記錄',
        data: [],
        summary: {
          total_qty: 0,
          sold_qty: 0,
          reserved_qty: 0,
          available_qty: 0
        }
      });
    }

    const summary = {
      total_qty: inventory.reduce((sum, i) => sum + i.total_qty, 0),
      sold_qty: inventory.reduce((sum, i) => sum + i.sold_qty, 0),
      reserved_qty: inventory.reduce((sum, i) => sum + i.reserved_qty, 0),
      available_qty: inventory.reduce((sum, i) => sum + i.available_qty, 0)
    };

    res.json({
      success: true,
      data: inventory,
      summary
    });
  } catch (err) {
    console.error('❌ 取得庫存錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/inventory/:date/:productId - 更新庫存 =====
router.put('/:date/:productId', requireAdmin, (req, res) => {
  try {
    const { date, productId } = req.params;
    const { total_qty, sold_qty, reserved_qty } = req.body;

    if (!dayjs(date).isValid()) {
      return res.status(400).json({ error: '無效的日期格式' });
    }

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ error: '無效的品項 ID' });
    }

    // 檢查品項是否存在
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(productId));
    if (!product) {
      return res.status(404).json({ error: '品項不存在' });
    }

    // 檢查庫存是否存在
    const inventory = db.prepare(`
      SELECT * FROM daily_inventory
      WHERE date = ? AND product_id = ?
    `).get(date, parseInt(productId));

    if (!inventory) {
      // 若不存在，建立新的
      db.prepare(`
        INSERT INTO daily_inventory (date, product_id, total_qty, sold_qty, reserved_qty)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        date,
        parseInt(productId),
        parseInt(total_qty) || 0,
        parseInt(sold_qty) || 0,
        parseInt(reserved_qty) || 0
      );

      return res.status(201).json({
        success: true,
        message: '庫存已建立',
        data: { date, product_id: parseInt(productId) }
      });
    }

    // 更新現有庫存
    const updates = [];
    const values = [];

    if (total_qty !== undefined) {
      if (isNaN(total_qty) || total_qty < 0) {
        return res.status(400).json({ error: '總量必須 >= 0' });
      }
      updates.push('total_qty = ?');
      values.push(parseInt(total_qty));
    }

    if (sold_qty !== undefined) {
      if (isNaN(sold_qty) || sold_qty < 0) {
        return res.status(400).json({ error: '已售數量必須 >= 0' });
      }
      updates.push('sold_qty = ?');
      values.push(parseInt(sold_qty));
    }

    if (reserved_qty !== undefined) {
      if (isNaN(reserved_qty) || reserved_qty < 0) {
        return res.status(400).json({ error: '預留數量必須 >= 0' });
      }
      updates.push('reserved_qty = ?');
      values.push(parseInt(reserved_qty));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '沒有欄位要更新' });
    }

    values.push(date);
    values.push(parseInt(productId));

    db.prepare(`
      UPDATE daily_inventory
      SET ${updates.join(', ')}
      WHERE date = ? AND product_id = ?
    `).run(...values);

    res.json({
      success: true,
      message: '庫存已更新',
      data: { date, product_id: parseInt(productId) }
    });
  } catch (err) {
    console.error('❌ 更新庫存錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/inventory/generate - 自動生成庫存 =====
router.post('/generate', requireAdmin, (req, res) => {
  try {
    const { start_date, end_date, daily_qty } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: '缺少 start_date 或 end_date' });
    }

    if (!dayjs(start_date).isValid() || !dayjs(end_date).isValid()) {
      return res.status(400).json({ error: '無效的日期格式' });
    }

    const qty = parseInt(daily_qty) || 18; // 預設每品項 18 份（5 品 × 18 = 90 份）

    if (qty < 1) {
      return res.status(400).json({ error: '每日數量必須 >= 1' });
    }

    // 取得所有活躍品項
    const products = db.prepare(`
      SELECT id FROM products WHERE status = 'active'
    `).all();

    if (products.length === 0) {
      return res.status(400).json({ error: '沒有活躍品項' });
    }

    const startDate = dayjs(start_date);
    const endDate = dayjs(end_date);

    if (startDate.isAfter(endDate)) {
      return res.status(400).json({ error: '開始日期必須早於結束日期' });
    }

    let count = 0;
    let current = startDate;

    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      const dateStr = current.format('YYYY-MM-DD');

      for (const product of products) {
        const existing = db.prepare('SELECT id FROM daily_inventory WHERE date = ? AND product_id = ?')
          .get(dateStr, product.id);

        if (!existing) {
          db.prepare('INSERT INTO daily_inventory (date, product_id, total_qty) VALUES (?, ?, ?)')
            .run(dateStr, product.id, qty);
          count++;
        }
      }

      current = current.add(1, 'day');
    }

    const generatedCount = count;

    res.json({
      success: true,
      message: `已生成 ${generatedCount} 筆庫存紀錄`,
      data: {
        start_date,
        end_date,
        daily_qty: qty,
        products_count: products.length,
        generated_records: generatedCount
      }
    });
  } catch (err) {
    console.error('❌ 生成庫存錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/inventory/summary - 庫存總覽 =====
router.get('/summary', requireAdmin, (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = `
      SELECT
        di.date,
        COUNT(DISTINCT di.product_id) as product_count,
        SUM(di.total_qty) as total_qty,
        SUM(di.sold_qty) as sold_qty,
        SUM(di.reserved_qty) as reserved_qty,
        SUM(di.total_qty - di.sold_qty - di.reserved_qty) as available_qty
      FROM daily_inventory di
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      if (!dayjs(start_date).isValid()) {
        return res.status(400).json({ error: '無效的開始日期' });
      }
      query += ' AND di.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      if (!dayjs(end_date).isValid()) {
        return res.status(400).json({ error: '無效的結束日期' });
      }
      query += ' AND di.date <= ?';
      params.push(end_date);
    }

    query += ' GROUP BY di.date ORDER BY di.date DESC';

    const summary = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: summary,
      count: summary.length
    });
  } catch (err) {
    console.error('❌ 取得庫存總覽錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

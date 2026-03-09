// ===== 產品 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// ===== 驗證中介軟體 =====
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const adminToken = process.env.ADMIN_TOKEN || 'demo-admin-token';

  if (!token || token !== adminToken) {
    return res.status(401).json({ error: '未授權的訪問' });
  }
  next();
};

// ===== GET /api/products - 列出所有活躍品項 =====
router.get('/', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT * FROM products
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at ASC
    `).all();

    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (err) {
    console.error('❌ 列出品項錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/products/:id - 取得單一品項 =====
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的品項 ID' });
    }

    const product = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(parseInt(id));

    if (!product) {
      return res.status(404).json({ error: '品項不存在' });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (err) {
    console.error('❌ 取得品項錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/products - 建立新品項（管理員） =====
router.post('/', requireAdmin, (req, res) => {
  try {
    const {
      code,
      name,
      description,
      price,
      cost,
      daily_quota,
      emoji,
      status,
      sort_order,
      image_url
    } = req.body;

    // 驗證必填欄位
    if (!code || !name || price === undefined) {
      return res.status(400).json({
        error: '缺少必填欄位: code, name, price'
      });
    }

    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: '價格必須是正數' });
    }

    // 檢查代碼是否已存在
    const existing = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
    if (existing) {
      return res.status(409).json({ error: '品項代碼已存在' });
    }

    const result = db.prepare(`
      INSERT INTO products (code, name, description, price, cost, daily_quota, emoji, status, sort_order, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code,
      name,
      description || '白飯80g + 主食 + 時蔬2樣 + 例湯',
      parseInt(price),
      parseInt(cost) || 0,
      parseInt(daily_quota) || 18,
      emoji || '🍱',
      status || 'active',
      parseInt(sort_order) || 0,
      image_url || null
    );

    res.status(201).json({
      success: true,
      message: '品項已建立',
      data: {
        id: result.lastInsertRowid,
        code,
        name,
        price: parseInt(price)
      }
    });
  } catch (err) {
    console.error('❌ 建立品項錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/products/:id - 更新品項（管理員） =====
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      cost,
      daily_quota,
      emoji,
      status,
      sort_order,
      image_url
    } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的品項 ID' });
    }

    // 檢查品項是否存在
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(id));
    if (!product) {
      return res.status(404).json({ error: '品項不存在' });
    }

    // 構建更新語句
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (price !== undefined) {
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: '價格必須是正數' });
      }
      updates.push('price = ?');
      values.push(parseInt(price));
    }
    if (cost !== undefined) {
      updates.push('cost = ?');
      values.push(parseInt(cost));
    }
    if (daily_quota !== undefined) {
      updates.push('daily_quota = ?');
      values.push(parseInt(daily_quota));
    }
    if (emoji !== undefined) {
      updates.push('emoji = ?');
      values.push(emoji);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(parseInt(sort_order));
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(image_url);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      return res.status(400).json({ error: '沒有欄位要更新' });
    }

    values.push(parseInt(id));

    db.prepare(`
      UPDATE products
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({
      success: true,
      message: '品項已更新',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 更新品項錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE /api/products/:id - 軟刪除品項（管理員） =====
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的品項 ID' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(id));
    if (!product) {
      return res.status(404).json({ error: '品項不存在' });
    }

    // 軟刪除：將狀態改為 paused
    db.prepare(`
      UPDATE products
      SET status = 'paused', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(parseInt(id));

    res.json({
      success: true,
      message: '品項已禁用',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 刪除品項錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ===== 折扣碼 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const dayjs = require('dayjs');

// ===== 驗證中介軟體（管理員）=====
const { requireAdmin } = require("../middleware/auth");

// ===== GET /api/discount/validate/:code - 驗證折扣碼 =====
router.get('/validate/:code', (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.length === 0) {
      return res.status(400).json({ error: '無效的折扣碼' });
    }

    const discountCode = db.prepare(`
      SELECT * FROM discount_codes
      WHERE code = ?
    `).get(code.toUpperCase());

    if (!discountCode) {
      return res.status(404).json({
        success: false,
        message: '折扣碼不存在'
      });
    }

    // 檢查狀態
    if (discountCode.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: '折扣碼已停用'
      });
    }

    // 檢查有效期限
    const now = dayjs();
    if (discountCode.valid_from && dayjs(discountCode.valid_from).isAfter(now)) {
      return res.status(400).json({
        success: false,
        message: '折扣碼尚未啟用'
      });
    }

    if (discountCode.valid_until && dayjs(discountCode.valid_until).isBefore(now)) {
      return res.status(400).json({
        success: false,
        message: '折扣碼已過期'
      });
    }

    // 檢查使用次數
    if (discountCode.used_count >= discountCode.max_uses) {
      return res.status(400).json({
        success: false,
        message: '折扣碼已達使用上限'
      });
    }

    res.json({
      success: true,
      data: {
        code: discountCode.code,
        type: discountCode.type,
        discount_rate: discountCode.discount_rate,
        discount_percentage: Math.round((1 - discountCode.discount_rate) * 100),
        used_count: discountCode.used_count,
        max_uses: discountCode.max_uses,
        remaining_uses: discountCode.max_uses - discountCode.used_count,
        valid_from: discountCode.valid_from,
        valid_until: discountCode.valid_until
      }
    });
  } catch (err) {
    console.error('❌ 驗證折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/discount/codes - 列出所有折扣碼（管理員） =====
router.get('/codes', requireAdmin, (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM discount_codes WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    params.push(limitNum, (pageNum - 1) * limitNum);

    const codes = db.prepare(query).all(...params);

    // 取得總數
    let countQuery = 'SELECT COUNT(*) as cnt FROM discount_codes WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    const { cnt } = db.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      data: codes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: cnt,
        pages: Math.ceil(cnt / limitNum)
      }
    });
  } catch (err) {
    console.error('❌ 列出折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/discount/codes/:id - 取得單一折扣碼 =====
router.get('/codes/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的折扣碼 ID' });
    }

    const discountCode = db.prepare(`
      SELECT * FROM discount_codes WHERE id = ?
    `).get(parseInt(id));

    if (!discountCode) {
      return res.status(404).json({ error: '折扣碼不存在' });
    }

    // 取得使用該折扣碼的訂單
    const orders = db.prepare(`
      SELECT
        id, order_number, customer_name, total_amount,
        discount_label, created_at
      FROM orders
      WHERE discount_label LIKE ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(`%${discountCode.code}%`);

    res.json({
      success: true,
      data: {
        ...discountCode,
        recent_orders: orders
      }
    });
  } catch (err) {
    console.error('❌ 取得折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/discount/codes - 建立新折扣碼（管理員） =====
router.post('/codes', requireAdmin, (req, res) => {
  try {
    const {
      code,
      type,
      discount_rate,
      max_uses,
      valid_from,
      valid_until
    } = req.body;

    // 驗證必填欄位
    if (!code || discount_rate === undefined) {
      return res.status(400).json({
        error: '缺少必填欄位: code, discount_rate'
      });
    }

    // 驗證折扣率
    if (isNaN(discount_rate) || discount_rate < 0 || discount_rate > 1) {
      return res.status(400).json({
        error: '折扣率必須介於 0 ~ 1 之間'
      });
    }

    // 檢查代碼是否已存在
    const existing = db.prepare(
      'SELECT id FROM discount_codes WHERE code = ?'
    ).get(code.toUpperCase());

    if (existing) {
      return res.status(409).json({ error: '折扣碼已存在' });
    }

    // 驗證日期
    if (valid_from && valid_until) {
      if (!dayjs(valid_from).isValid() || !dayjs(valid_until).isValid()) {
        return res.status(400).json({ error: '無效的日期格式' });
      }

      if (dayjs(valid_from).isAfter(dayjs(valid_until))) {
        return res.status(400).json({
          error: '開始日期必須早於結束日期'
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO discount_codes (code, type, discount_rate, max_uses, valid_from, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(
      code.toUpperCase(),
      type || 'general',
      discount_rate,
      parseInt(max_uses) || 1,
      valid_from || null,
      valid_until || null
    );

    res.status(201).json({
      success: true,
      message: '折扣碼已建立',
      data: {
        id: result.lastInsertRowid,
        code: code.toUpperCase(),
        discount_rate,
        discount_percentage: Math.round((1 - discount_rate) * 100)
      }
    });
  } catch (err) {
    console.error('❌ 建立折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /api/discount/codes/:id - 更新折扣碼（管理員） =====
router.put('/codes/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const {
      discount_rate,
      max_uses,
      valid_from,
      valid_until,
      status
    } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的折扣碼 ID' });
    }

    const discountCode = db.prepare(
      'SELECT * FROM discount_codes WHERE id = ?'
    ).get(parseInt(id));

    if (!discountCode) {
      return res.status(404).json({ error: '折扣碼不存在' });
    }

    const updates = [];
    const values = [];

    if (discount_rate !== undefined) {
      if (isNaN(discount_rate) || discount_rate < 0 || discount_rate > 1) {
        return res.status(400).json({
          error: '折扣率必須介於 0 ~ 1 之間'
        });
      }
      updates.push('discount_rate = ?');
      values.push(discount_rate);
    }

    if (max_uses !== undefined) {
      updates.push('max_uses = ?');
      values.push(parseInt(max_uses));
    }

    if (valid_from !== undefined) {
      if (valid_from && !dayjs(valid_from).isValid()) {
        return res.status(400).json({ error: '無效的開始日期' });
      }
      updates.push('valid_from = ?');
      values.push(valid_from || null);
    }

    if (valid_until !== undefined) {
      if (valid_until && !dayjs(valid_until).isValid()) {
        return res.status(400).json({ error: '無效的結束日期' });
      }
      updates.push('valid_until = ?');
      values.push(valid_until || null);
    }

    if (status !== undefined) {
      if (!['active', 'expired', 'disabled'].includes(status)) {
        return res.status(400).json({ error: '無效的狀態' });
      }
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '沒有欄位要更新' });
    }

    values.push(parseInt(id));

    db.prepare(`
      UPDATE discount_codes
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({
      success: true,
      message: '折扣碼已更新',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 更新折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE /api/discount/codes/:id - 刪除折扣碼（管理員） =====
router.delete('/codes/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的折扣碼 ID' });
    }

    const discountCode = db.prepare(
      'SELECT * FROM discount_codes WHERE id = ?'
    ).get(parseInt(id));

    if (!discountCode) {
      return res.status(404).json({ error: '折扣碼不存在' });
    }

    // 軟刪除：改為 disabled
    db.prepare(`
      UPDATE discount_codes
      SET status = 'disabled'
      WHERE id = ?
    `).run(parseInt(id));

    res.json({
      success: true,
      message: '折扣碼已禁用',
      data: { id: parseInt(id) }
    });
  } catch (err) {
    console.error('❌ 刪除折扣碼錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/discount/codes/:id/use - 記錄折扣碼使用 =====
router.post('/codes/:id/use', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: '無效的折扣碼 ID' });
    }

    const discountCode = db.prepare(
      'SELECT * FROM discount_codes WHERE id = ?'
    ).get(parseInt(id));

    if (!discountCode) {
      return res.status(404).json({ error: '折扣碼不存在' });
    }

    if (discountCode.used_count >= discountCode.max_uses) {
      return res.status(400).json({
        error: '折扣碼已達使用上限'
      });
    }

    db.prepare(`
      UPDATE discount_codes
      SET used_count = used_count + 1
      WHERE id = ?
    `).run(parseInt(id));

    res.json({
      success: true,
      message: '已記錄折扣碼使用',
      data: {
        id: parseInt(id),
        new_used_count: discountCode.used_count + 1,
        max_uses: discountCode.max_uses
      }
    });
  } catch (err) {
    console.error('❌ 記錄使用錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ===== 金流 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const crypto = require('crypto');
const dayjs = require('dayjs');
const axios = require('axios');

// ===== NewebPay 金流輔助函數 =====
const NewebPay = {
  // AES 加密
  encrypt: (plaintext, key, iv) => {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  },

  // AES 解密
  decrypt: (ciphertext, key, iv) => {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  },

  // SHA256 雜湊
  hashSha256: (data) => {
    return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
  }
};

// ===== LINE Pay 輔助函數 =====
const LinePay = {
  generateSignature: (secret, nonce, timestamp, body) => {
    const signRaw = `/v2/payments${body}${nonce}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signRaw)
      .digest('base64');
    return signature;
  }
};

// ===== POST /api/payments/newebpay/create - 建立 NewebPay 付款 =====
router.post('/newebpay/create', (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id || isNaN(order_id)) {
      return res.status(400).json({ error: '無效的訂單 ID' });
    }

    // 取得訂單
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(order_id));
    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    if (order.payment_status !== 'pending') {
      return res.status(400).json({
        error: '訂單已付款或狀態不允許'
      });
    }

    // 準備 NewebPay 參數
    const merchantId = process.env.NEWEBPAY_MERCHANT_ID || db.prepare(
      "SELECT value FROM settings WHERE key = 'newebpay_merchant_id'"
    ).get()?.value;

    const hashKey = process.env.NEWEBPAY_HASH_KEY || db.prepare(
      "SELECT value FROM settings WHERE key = 'newebpay_hash_key'"
    ).get()?.value;

    const hashIV = process.env.NEWEBPAY_HASH_IV || db.prepare(
      "SELECT value FROM settings WHERE key = 'newebpay_hash_iv'"
    ).get()?.value;

    if (!merchantId || !hashKey || !hashIV) {
      return res.status(500).json({
        error: 'NewebPay 設定不完整'
      });
    }

    const tradeInfo = {
      MerchantID: merchantId,
      RespondType: 'JSON',
      TimeStamp: Math.floor(Date.now() / 1000),
      Version: '2.0',
      LangType: 'zh-tw',
      MerchantOrderNo: order.order_number,
      Amt: order.total_amount,
      ItemDesc: `訂單 ${order.order_number}`,
      TradeLimit: 3600, // 1 小時
      ReturnURL: `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/newebpay/notify`,
      NotifyURL: `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/newebpay/notify`,
      CustomerURL: `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/newebpay/return`,
      ClientBackURL: `${process.env.APP_URL || 'http://localhost:3000'}/orders/${order.id}`
    };

    // 轉換為查詢字符串
    const tradeInfoStr = Object.keys(tradeInfo)
      .sort()
      .map(k => `${k}=${encodeURIComponent(tradeInfo[k])}`)
      .join('&');

    // 加密
    const encrypted = NewebPay.encrypt(tradeInfoStr, hashKey, hashIV);

    // 生成 SHA256 雜湊
    const hash = NewebPay.hashSha256(
      `HashKey=${hashKey}&${encrypted}&HashIV=${hashIV}`
    );

    res.json({
      success: true,
      data: {
        MerchantID: merchantId,
        TradeInfo: encrypted,
        TradeSha: hash,
        Version: '2.0',
        action_url: 'https://core.newebpay.com/MPG/mpg_gateway'
      }
    });
  } catch (err) {
    console.error('❌ NewebPay 建立錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/payments/newebpay/notify - NewebPay 回調 =====
router.post('/newebpay/notify', (req, res) => {
  try {
    const { TradeInfo } = req.body;

    if (!TradeInfo) {
      return res.status(400).json({ error: '缺少 TradeInfo' });
    }

    const hashKey = process.env.NEWEBPAY_HASH_KEY || db.prepare(
      "SELECT value FROM settings WHERE key = 'newebpay_hash_key'"
    ).get()?.value;

    const hashIV = process.env.NEWEBPAY_HASH_IV || db.prepare(
      "SELECT value FROM settings WHERE key = 'newebpay_hash_iv'"
    ).get()?.value;

    // 解密
    const decrypted = NewebPay.decrypt(TradeInfo, hashKey, hashIV);
    const params = new URLSearchParams(decrypted);
    const data = Object.fromEntries(params);

    console.log('📦 NewebPay 回調:', data);

    // 尋找訂單
    const order = db.prepare(
      'SELECT * FROM orders WHERE order_number = ?'
    ).get(data.MerchantOrderNo);

    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    // 檢查金額是否一致
    if (parseInt(data.Amt) !== order.total_amount) {
      console.error('❌ 金額不一致:', data.Amt, order.total_amount);
      return res.status(400).json({ error: '金額不符' });
    }

    // 根據狀態更新訂單
    if (data.Status === 'Y') {
      // 付款成功
      db.prepare(`
        UPDATE orders
        SET payment_status = 'paid',
            payment_trade_no = ?,
            payment_method = 'newebpay',
            order_status = 'preparing',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.TradeNo, order.id);

      // 更新庫存：從預留轉為已售
      const items = db.prepare(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
      ).all(order.id);

      items.forEach(item => {
        db.prepare(`
          UPDATE daily_inventory
          SET sold_qty = sold_qty + ?,
              reserved_qty = reserved_qty - ?
          WHERE date = ? AND product_id = ?
        `).run(item.quantity, item.quantity, order.pickup_date, item.product_id);
      });

      console.log(`✅ 訂單 ${order.order_number} 已付款`);
    } else {
      // 付款失敗
      db.prepare(`
        UPDATE orders
        SET payment_status = 'failed',
            payment_trade_no = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.TradeNo, order.id);

      // 釋放預留庫存
      const items = db.prepare(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
      ).all(order.id);

      items.forEach(item => {
        db.prepare(`
          UPDATE daily_inventory
          SET reserved_qty = reserved_qty - ?
          WHERE date = ? AND product_id = ?
        `).run(item.quantity, order.pickup_date, item.product_id);
      });

      console.log(`❌ 訂單 ${order.order_number} 付款失敗`);
    }

    res.json({ success: true, message: 'OK' });
  } catch (err) {
    console.error('❌ NewebPay 回調錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/payments/newebpay/return - NewebPay 返回 =====
router.post('/newebpay/return', (req, res) => {
  try {
    // 此路由在瀏覽器端會收到 POST 回複，通常重導向回訂單頁面
    const { MerchantOrderNo } = req.body;

    if (!MerchantOrderNo) {
      return res.status(400).json({ error: '缺少訂單編號' });
    }

    const order = db.prepare(
      'SELECT id FROM orders WHERE order_number = ?'
    ).get(MerchantOrderNo);

    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    // 重導向回訂單確認頁
    res.redirect(`/orders/${order.id}`);
  } catch (err) {
    console.error('❌ NewebPay 返回錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/payments/linepay/create - 建立 LINE Pay 付款 =====
router.post('/linepay/create', (req, res) => {
  try {
    const { order_id, redirect_url } = req.body;

    if (!order_id || isNaN(order_id)) {
      return res.status(400).json({ error: '無效的訂單 ID' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(order_id));
    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    if (order.payment_status !== 'pending') {
      return res.status(400).json({ error: '訂單已付款或狀態不允許' });
    }

    const channelId = process.env.LINE_CHANNEL_ID || db.prepare(
      "SELECT value FROM settings WHERE key = 'line_channel_id'"
    ).get()?.value;

    const channelSecret = process.env.LINE_CHANNEL_SECRET || db.prepare(
      "SELECT value FROM settings WHERE key = 'line_channel_secret'"
    ).get()?.value;

    if (!channelId || !channelSecret) {
      return res.status(500).json({ error: 'LINE Pay 設定不完整' });
    }

    const requestBody = {
      amount: order.total_amount,
      currency: 'TWD',
      orderId: order.order_number,
      packages: [
        {
          id: '1',
          amount: order.total_amount,
          products: [
            {
              name: `訂單 ${order.order_number}`,
              quantity: 1,
              price: order.total_amount
            }
          ]
        }
      ],
      redirectUrls: {
        confirmUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/linepay/confirm`,
        cancelUrl: `${process.env.APP_URL || 'http://localhost:3000'}/orders/${order.id}`
      }
    };

    const bodyStr = JSON.stringify(requestBody);
    const nonce = Date.now().toString();
    const timestamp = Date.now();
    const signature = LinePay.generateSignature(channelSecret, nonce, timestamp, bodyStr);

    // 實際應該調用 LINE Pay API，這裡為示例
    res.json({
      success: true,
      message: 'LINE Pay 請求已準備',
      data: {
        channelId,
        body: requestBody,
        headers: {
          'X-LINE-ChannelId': channelId,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization-Timestamp': timestamp,
          'X-LINE-Authorization-Signature': signature,
          'Content-Type': 'application/json'
        },
        api_url: 'https://sandbox-api.line.me/v2/payments/request'
      }
    });
  } catch (err) {
    console.error('❌ LINE Pay 建立錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/payments/linepay/confirm - LINE Pay 確認 =====
router.post('/linepay/confirm', (req, res) => {
  try {
    const { transactionId, orderId } = req.body;

    if (!transactionId || !orderId) {
      return res.status(400).json({
        error: '缺少 transactionId 或 orderId'
      });
    }

    // 實際應該調用 LINE Pay 確認 API
    // 這裡為示例，直接更新訂單狀態

    const order = db.prepare(
      'SELECT * FROM orders WHERE order_number = ?'
    ).get(orderId);

    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    db.prepare(`
      UPDATE orders
      SET payment_status = 'paid',
          payment_trade_no = ?,
          payment_method = 'linepay',
          order_status = 'preparing',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(transactionId, order.id);

    // 更新庫存
    const items = db.prepare(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
    ).all(order.id);

    items.forEach(item => {
      db.prepare(`
        UPDATE daily_inventory
        SET sold_qty = sold_qty + ?,
            reserved_qty = reserved_qty - ?
        WHERE date = ? AND product_id = ?
      `).run(item.quantity, item.quantity, order.pickup_date, item.product_id);
    });

    res.json({
      success: true,
      message: '訂單已確認並付款',
      data: { order_id: order.id }
    });
  } catch (err) {
    console.error('❌ LINE Pay 確認錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/payments/status/:orderId - 查詢付款狀態 =====
router.get('/status/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ error: '無效的訂單 ID' });
    }

    const order = db.prepare(
      'SELECT id, order_number, payment_status, payment_method, total_amount FROM orders WHERE id = ?'
    ).get(parseInt(orderId));

    if (!order) {
      return res.status(404).json({ error: '訂單不存在' });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error('❌ 查詢付款狀態錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

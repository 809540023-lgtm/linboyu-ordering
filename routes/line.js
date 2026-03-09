// ===== LINE 訊息 API 路由 =====
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const axios = require('axios');
const crypto = require('crypto');
const dayjs = require('dayjs');

// ===== LINE 訊息發送輔助函數 =====
const sendLineMessage = async (lineUserId, message) => {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || db.prepare(
      "SELECT value FROM settings WHERE key = 'line_channel_access_token'"
    ).get()?.value;

    if (!channelAccessToken) {
      console.warn('⚠️ LINE Channel Access Token 未設定');
      return false;
    }

    const response = await axios.post(
      'https://api.line.biz/v1/bot/message/push',
      {
        to: lineUserId,
        messages: [message]
      },
      {
        headers: {
          'Authorization': `Bearer ${channelAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ LINE 訊息已送出至 ${lineUserId}`);
    return true;
  } catch (err) {
    console.error('❌ LINE 訊息發送錯誤:', err.response?.data || err.message);
    return false;
  }
};

// ===== 驗證中介軟體（管理員）=====
const { requireAdmin } = require("../middleware/auth");

// ===== POST /api/line/webhook - LINE Webhook 處理 =====
router.post('/webhook', (req, res) => {
  try {
    const signature = req.get('x-line-signature');
    const body = JSON.stringify(req.body);

    const channelSecret = process.env.LINE_CHANNEL_SECRET || db.prepare(
      "SELECT value FROM settings WHERE key = 'line_channel_secret'"
    ).get()?.value;

    if (!channelSecret) {
      console.warn('⚠️ LINE Channel Secret 未設定');
      return res.json({ message: 'OK' });
    }

    // 驗證簽名
    const expectedSignature = crypto
      .createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.warn('❌ LINE Webhook 簽名驗證失敗');
      return res.status(401).json({ error: '簽名驗證失敗' });
    }

    // 處理事件
    const events = req.body.events || [];

    events.forEach(event => {
      console.log(`📨 LINE 事件: ${event.type} from ${event.source.userId}`);

      if (event.type === 'message' && event.message.type === 'text') {
        handleTextMessage(event);
      } else if (event.type === 'follow') {
        handleFollowEvent(event);
      } else if (event.type === 'unfollow') {
        handleUnfollowEvent(event);
      }
    });

    res.json({ message: 'OK' });
  } catch (err) {
    console.error('❌ Webhook 處理錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== 處理文字訊息 =====
async function handleTextMessage(event) {
  const { replyToken, source, message } = event;
  const userId = source.userId;
  const text = message.text.toLowerCase();

  // 檢查或建立客戶
  let customer = db.prepare('SELECT * FROM customers WHERE line_user_id = ?').get(userId);

  try {
    // 簡單的訊息處理邏輯
    let replyMessage = {};

    if (text.includes('菜單') || text.includes('menu')) {
      replyMessage = {
        type: 'text',
        text: '歡迎光臨！請選擇:\n1️⃣ 查看今日菜色\n2️⃣ 查詢訂單\n3️⃣ 聯繫客服'
      };
    } else if (text.includes('訂單') || text.includes('order')) {
      if (!customer) {
        replyMessage = {
          type: 'text',
          text: '請先提供您的電話號碼，我們可以幫您查詢訂單。'
        };
      } else {
        const orders = db.prepare(`
          SELECT order_number, pickup_date, total_amount, order_status
          FROM orders
          WHERE customer_phone = ?
          ORDER BY created_at DESC
          LIMIT 5
        `).all(customer.phone);

        if (orders.length === 0) {
          replyMessage = {
            type: 'text',
            text: '您還沒有訂單。'
          };
        } else {
          const orderText = orders.map(o =>
            `${o.order_number} (${o.pickup_date}): ${o.total_amount}元 - ${o.order_status}`
          ).join('\n');
          replyMessage = {
            type: 'text',
            text: `您的最近訂單:\n${orderText}`
          };
        }
      }
    } else if (text.includes('聯繫') || text.includes('客服') || text.includes('service')) {
      const shopPhone = db.prepare(
        "SELECT value FROM settings WHERE key = 'shop_phone'"
      ).get()?.value || '0912345678';

      replyMessage = {
        type: 'text',
        text: `客服電話: ${shopPhone}\n營業時間: 10:00 - 20:00`
      };
    } else {
      replyMessage = {
        type: 'text',
        text: '感謝您的訊息！有什麼我可以幫助的嗎？'
      };
    }

    // 發送回覆
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || db.prepare(
      "SELECT value FROM settings WHERE key = 'line_channel_access_token'"
    ).get()?.value;

    if (channelAccessToken) {
      await axios.post(
        'https://api.line.biz/v1/bot/message/reply',
        {
          replyToken,
          messages: [replyMessage]
        },
        {
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // 記錄訊息
    db.prepare(`
      INSERT INTO line_messages (type, recipient, content)
      VALUES ('reply', ?, ?)
    `).run(userId, message.text);
  } catch (err) {
    console.error('❌ 處理訊息錯誤:', err);
  }
}

// ===== 處理關注事件 =====
function handleFollowEvent(event) {
  const userId = event.source.userId;

  console.log(`👤 用戶 ${userId} 已關注`);

  // 記錄事件
  db.prepare(`
    INSERT INTO line_messages (type, recipient, content)
    VALUES ('follow', ?, 'User followed')
  `).run(userId);
}

// ===== 處理取消關注事件 =====
function handleUnfollowEvent(event) {
  const userId = event.source.userId;

  console.log(`🚪 用戶 ${userId} 已取消關注`);

  // 記錄事件
  db.prepare(`
    INSERT INTO line_messages (type, recipient, content)
    VALUES ('unfollow', ?, 'User unfollowed')
  `).run(userId);
}

// ===== POST /api/line/push - 推送訊息到用戶 =====
router.post('/push', requireAdmin, async (req, res) => {
  try {
    const { line_user_id, message } = req.body;

    if (!line_user_id || !message) {
      return res.status(400).json({
        error: '缺少 line_user_id 或 message'
      });
    }

    const success = await sendLineMessage(line_user_id, {
      type: 'text',
      text: message
    });

    if (!success) {
      return res.status(500).json({ error: 'LINE 訊息發送失敗' });
    }

    // 記錄訊息
    db.prepare(`
      INSERT INTO line_messages (type, recipient, content, status)
      VALUES ('push', ?, ?, 'sent')
    `).run(line_user_id, message);

    res.json({
      success: true,
      message: 'LINE 訊息已推送'
    });
  } catch (err) {
    console.error('❌ 推送訊息錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /api/line/broadcast - 廣播訊息到所有追蹤用戶 =====
router.post('/broadcast', requireAdmin, async (req, res) => {
  try {
    const { message, tag } = req.body;

    if (!message) {
      return res.status(400).json({ error: '缺少 message' });
    }

    // 取得所有有 LINE ID 的客戶
    let query = 'SELECT DISTINCT line_user_id FROM customers WHERE line_user_id IS NOT NULL';
    const params = [];

    if (tag) {
      query += ' AND tag = ?';
      params.push(tag);
    }

    const customers = db.prepare(query).all(...params);

    if (customers.length === 0) {
      return res.status(400).json({ error: '沒有可推送的用戶' });
    }

    let successCount = 0;
    let failureCount = 0;

    // 分批發送（避免 API 限流）
    for (const customer of customers) {
      if (customer.line_user_id) {
        const success = await sendLineMessage(customer.line_user_id, {
          type: 'text',
          text: message
        });

        if (success) {
          successCount++;
        } else {
          failureCount++;
        }

        // 延遲以避免限流
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 記錄廣播
    db.prepare(`
      INSERT INTO line_messages (type, recipient, content, status)
      VALUES ('broadcast', 'all', ?, 'sent')
    `).run(message);

    res.json({
      success: true,
      message: `廣播訊息已送出 (成功: ${successCount}, 失敗: ${failureCount})`,
      data: {
        total: customers.length,
        success: successCount,
        failure: failureCount
      }
    });
  } catch (err) {
    console.error('❌ 廣播訊息錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /api/line/messages - 列出 LINE 訊息記錄 =====
router.get('/messages', requireAdmin, (req, res) => {
  try {
    const { type, recipient, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM line_messages WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (recipient) {
      query += ' AND recipient = ?';
      params.push(recipient);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    params.push(limitNum, (pageNum - 1) * limitNum);

    const messages = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page: pageNum,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('❌ 列出訊息錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

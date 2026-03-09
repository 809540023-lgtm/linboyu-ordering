# 纖體食驗室 × 林博御AI膳 訂購系統

完整的 Node.js 健康餐盒訂購平台，具有預訂優惠、金流整合、LINE 推播等功能。

## 專案結構

```
ordering-system-live/
├── server.js                    # 主 Express 伺服器
├── db/
│   ├── init.js                  # 資料庫初始化和結構定義
│   └── seed.js                  # 種子資料填充
├── routes/
│   ├── products.js              # 產品 API
│   ├── orders.js                # 訂單 API
│   ├── inventory.js             # 庫存 API
│   ├── customers.js             # 客戶 API
│   ├── payments.js              # 金流 API (NewebPay / LINE Pay)
│   ├── line.js                  # LINE Messaging API
│   ├── admin.js                 # 管理員儀表板 API
│   └── discount.js              # 折扣碼 API
├── public/                      # 靜態檔案（前端）
├── views/                       # EJS 範本檔案
└── README.md                    # 本檔案
```

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 初始化資料庫

```bash
npm run seed
```

### 3. 啟動伺服器

```bash
npm start
```

伺服器將在 `http://localhost:3000` 啟動

### 環境變數設定

建立 `.env` 檔案：

```env
NODE_ENV=development
PORT=3000
ADMIN_TOKEN=demo-admin-token
ADMIN_PASSWORD=demo123

# NewebPay 金流設定
NEWEBPAY_MERCHANT_ID=your_merchant_id
NEWEBPAY_HASH_KEY=your_hash_key
NEWEBPAY_HASH_IV=your_hash_iv

# LINE Messaging API 設定
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_access_token

# 應用程式 URL（用於回調）
APP_URL=http://localhost:3000

# CORS 設定
CORS_ORIGIN=*
```

## API 端點

### 1. 產品 API (`/api/products`)

#### 列出產品
```
GET /api/products
```

#### 取得單一產品
```
GET /api/products/:id
```

#### 建立產品（管理員）
```
POST /api/products
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "code": "A",
  "name": "蔬菜健身餐",
  "price": 80,
  "cost": 25,
  "daily_quota": 18
}
```

#### 更新產品（管理員）
```
PUT /api/products/:id
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "price": 85,
  "name": "更新的名稱"
}
```

### 2. 訂單 API (`/api/orders`)

#### 建立訂單
```
POST /api/orders

Body:
{
  "customer_name": "王小美",
  "customer_phone": "0912111111",
  "customer_email": "wang@example.com",
  "pickup_date": "2026-03-12",
  "delivery_type": "pickup",
  "brand": "ai",
  "items": [
    {
      "product_id": 1,
      "quantity": 2
    },
    {
      "product_id": 2,
      "quantity": 1
    }
  ],
  "discount_code": "LINBOYU01"
}
```

#### 列出訂單（管理員）
```
GET /api/orders?status=confirmed&date=2026-03-12&page=1&limit=20
Authorization: Bearer {ADMIN_TOKEN}
```

#### 取得訂單詳細
```
GET /api/orders/:id
```

#### 更新訂單狀態（管理員）
```
PUT /api/orders/:id/status
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "order_status": "preparing"
}
```

狀態值：`confirmed` / `preparing` / `ready` / `completed` / `cancelled`

#### 每日摘要
```
GET /api/orders/daily-summary/:date
Authorization: Bearer {ADMIN_TOKEN}
```

### 3. 庫存 API (`/api/inventory`)

#### 取得特定日期庫存
```
GET /api/inventory/:date
Authorization: Bearer {ADMIN_TOKEN}
```

#### 更新庫存
```
PUT /api/inventory/:date/:productId
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "total_qty": 20,
  "sold_qty": 5,
  "reserved_qty": 3
}
```

#### 自動生成庫存
```
POST /api/inventory/generate
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "start_date": "2026-03-10",
  "end_date": "2026-03-17",
  "daily_qty": 18
}
```

### 4. 客戶 API (`/api/customers`)

#### 列出客戶（管理員）
```
GET /api/customers?tag=regular&page=1&limit=20
Authorization: Bearer {ADMIN_TOKEN}
```

#### 根據電話查詢客戶
```
GET /api/customers/by-phone/:phone
```

#### 取得客戶詳細（管理員）
```
GET /api/customers/:id
Authorization: Bearer {ADMIN_TOKEN}
```

#### 建立客戶（管理員）
```
POST /api/customers
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "name": "李健身",
  "phone": "0912222222",
  "email": "li@example.com",
  "tag": "regular"
}
```

#### 更新客戶（管理員）
```
PUT /api/customers/:id
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "tag": "vip",
  "note": "重要客戶"
}
```

### 5. 金流 API (`/api/payments`)

#### 建立 NewebPay 付款
```
POST /api/payments/newebpay/create

Body:
{
  "order_id": 1
}

Response:
{
  "MerchantID": "xxxxx",
  "TradeInfo": "encrypted_data",
  "TradeSha": "hash",
  "Version": "2.0",
  "action_url": "https://core.newebpay.com/MPG/mpg_gateway"
}
```

#### NewebPay 回調
```
POST /api/payments/newebpay/notify

（NewebPay 伺服器會自動發送）
```

#### 建立 LINE Pay 付款
```
POST /api/payments/linepay/create

Body:
{
  "order_id": 1
}
```

#### LINE Pay 確認
```
POST /api/payments/linepay/confirm

Body:
{
  "transactionId": "xxx",
  "orderId": "LBY-20260309-001"
}
```

#### 查詢付款狀態
```
GET /api/payments/status/:orderId
```

### 6. LINE API (`/api/line`)

#### 設定 Webhook（在 LINE Developers 上設定此 URL）
```
POST /api/line/webhook
```

#### 推送訊息（管理員）
```
POST /api/line/push
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "line_user_id": "U1234567890...",
  "message": "您的訂單已準備好！"
}
```

#### 廣播訊息（管理員）
```
POST /api/line/broadcast
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "message": "本週新菜單已上線",
  "tag": "vip"
}
```

#### 列出訊息記錄（管理員）
```
GET /api/line/messages?type=broadcast&page=1&limit=20
Authorization: Bearer {ADMIN_TOKEN}
```

### 7. 折扣碼 API (`/api/discount`)

#### 驗證折扣碼
```
GET /api/discount/validate/:code
```

#### 列出折扣碼（管理員）
```
GET /api/discount/codes?status=active&page=1&limit=20
Authorization: Bearer {ADMIN_TOKEN}
```

#### 建立折扣碼（管理員）
```
POST /api/discount/codes
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "code": "NEWUSER20",
  "type": "general",
  "discount_rate": 0.8,
  "max_uses": 50,
  "valid_from": "2026-03-01",
  "valid_until": "2026-03-31"
}
```

#### 更新折扣碼（管理員）
```
PUT /api/discount/codes/:id
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "discount_rate": 0.75,
  "max_uses": 100
}
```

### 8. 管理員 API (`/api/admin`)

#### 登入
```
POST /api/admin/login

Body:
{
  "password": "demo123"
}

Response:
{
  "token": "admin-xxx-yyy",
  "type": "Bearer"
}
```

#### 儀表板（管理員）
```
GET /api/admin/dashboard?date_from=2026-03-01&date_to=2026-03-31
Authorization: Bearer {ADMIN_TOKEN}
```

#### 系統設定（管理員）
```
GET /api/admin/settings
Authorization: Bearer {ADMIN_TOKEN}

PUT /api/admin/settings
Authorization: Bearer {ADMIN_TOKEN}

Body:
{
  "shop_name": "新名稱",
  "daily_quota": "100",
  "delivery_fee": "50"
}
```

#### 每日報表（管理員）
```
GET /api/admin/daily-report/:date
Authorization: Bearer {ADMIN_TOKEN}
```

#### 匯出資料（管理員）
```
GET /api/admin/export/orders?date_from=2026-03-01&date_to=2026-03-31
GET /api/admin/export/customers
GET /api/admin/export/inventory

Authorization: Bearer {ADMIN_TOKEN}
```

## 業務規則

### 預訂優惠

| 取餐時間 | 折扣 | 說明 |
|---------|------|------|
| 3+ 天前 | 8折 | `discount_rate: 0.8` |
| 1 天前  | 9折 | `discount_rate: 0.9` |
| 當天或之前 | 原價 | `discount_rate: 1.0` |

### 品牌分類

- **林博御AI膳 (ai)**: 泰山楓江路 40-2 號自取，無外送費
- **纖體食驗室 (slim)**: 雲端廚房，外送 +30% ($30)

### 訂單狀態流程

```
confirmed (已確認)
    ↓
preparing (準備中)
    ↓
ready (已備妥)
    ↓
completed (已完成)

cancelled (取消) ← 任何時刻
```

### 付款狀態

- `pending`: 待支付
- `paid`: 已付款
- `failed`: 付款失敗
- `refunded`: 已退款

### 庫存管理

零庫存模式：每日清晨統計預售訂單，決定當日生產量

- `total_qty`: 當日總額度
- `sold_qty`: 已確認付款訂單數
- `reserved_qty`: 待付款訂單預留
- `available_qty`: total_qty - sold_qty - reserved_qty

## 資料表結構

### products（品項表）
- 品項代碼、名稱、價格、成本、每日配額
- 狀態：active / paused / upcoming

### orders（訂單表）
- 訂單編號格式：`LBY-YYYYMMDD-NNN`
- 自取/外送、折扣率、金額、付款方式、狀態

### order_items（訂單明細表）
- 訂單中的每項產品、數量、價格

### daily_inventory（每日庫存表）
- 各日期各產品的配額、銷售、預留情況

### discount_codes（折扣碼表）
- 碼字、類型、折扣率、有效期、使用限制

### customers（客戶表）
- 基本資料、標籤（新客/常客/VIP）、消費統計

### daily_summary（每日摘要表）
- 日期、訂單數、營收、各狀態分佈

### line_messages（LINE 推播記錄）
- 推播類型、收件人、內容、發送狀態

### settings（系統設定）
- 店名、營業時間、金流密鑰等

## 預設資料

執行 `npm run seed` 後會建立：

**5 個示例產品**：
- A: 蔬菜健身餐 (80元)
- B: 雞肉便當 (90元)
- C: 豬肉套餐 (100元)
- D: 海鮮精選 (120元)
- E: 燕麥飯碗 (150元)

**3 個折扣碼**：
- LINBOYU01: 8折，無限使用
- OPEN2026: 8.5折，最多 100 次
- EARLY20: 9折，最多 50 次

**3 個示例客戶**：
- 王小美 (0912111111)
- 李健身 (0912222222)
- 陳新客 (0912333333)

## 安全建議

### 生產環境

1. **更改預設密碼**：
   ```bash
   export ADMIN_PASSWORD=your_strong_password
   ```

2. **使用 JWT 代替簡單 token**：
   修改 `routes/admin.js` 的登入邏輯

3. **密碼加密**：
   使用 `bcrypt` 替代明文存儲

4. **HTTPS**：
   使用 HTTPS 保護所有通訊

5. **金流憑據**：
   存放在安全的密鑰管理服務中（AWS Secrets Manager、Vault 等）

6. **資料庫備份**：
   定期備份 `db/ordering.db`

7. **限流和驗證**：
   調整 `server.js` 中的 rate limit 設定

## 除錯和開發

### 查看資料庫

使用 SQLite 瀏覽器或命令行：

```bash
sqlite3 db/ordering.db
sqlite> SELECT * FROM products;
sqlite> SELECT * FROM orders;
```

### 測試 API

使用 Postman 或 curl：

```bash
# 取得產品列表
curl http://localhost:3000/api/products

# 建立訂單
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "測試用戶",
    "customer_phone": "0912999999",
    "pickup_date": "2026-03-12",
    "items": [{"product_id": 1, "quantity": 2}]
  }'

# 管理員登入
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "demo123"}'
```

### 查看服務器日誌

在開發模式中，所有請求都會被記錄：

```
[2026-03-09T10:15:30.000Z] POST /api/orders
[2026-03-09T10:15:31.200Z] GET /api/products
```

## 常見問題

**Q: 如何修改外送費用？**

A: 更新設定：
```bash
POST /api/admin/settings
{
  "delivery_fee": "50"
}
```

**Q: 如何設定特定時段的折扣？**

A: 建立折扣碼並設定 `valid_from` 和 `valid_until`

**Q: 如何追蹤金流狀態？**

A: 查詢訂單的 `payment_status` 和 `payment_trade_no` 字段

**Q: 如何設定 LINE 推播？**

A: 在 LINE Developers 設定 Webhook URL 為 `/api/line/webhook`

## 支援

遇到問題？檢查：
1. `.env` 檔案設定是否正確
2. `db/ordering.db` 是否存在
3. 伺服器日誌中的錯誤訊息
4. 資料庫連接狀態

---

**更新日期**: 2026-03-09
**版本**: 1.0.0
**授權**: MIT

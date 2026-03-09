# 實作指南

此文件提供完整的實作步驟，幫助快速部署和運行訂購系統。

## 檔案總覽

### 核心伺服器
- `server.js` - 主 Express 應用程式
- `package.json` - 依賴和腳本設定

### 資料庫
- `db/init.js` - 資料庫初始化（表格結構）
- `db/seed.js` - 測試資料填充

### API 路由（8 個核心模組）
1. `routes/products.js` - 產品管理（CRUD）
2. `routes/orders.js` - 訂單管理和折扣計算
3. `routes/inventory.js` - 庫存管理
4. `routes/customers.js` - 客戶管理
5. `routes/payments.js` - 金流整合（NewebPay / LINE Pay）
6. `routes/line.js` - LINE Messaging 推播
7. `routes/admin.js` - 管理員儀表板
8. `routes/discount.js` - 折扣碼管理

### 靜態和範本
- `public/` - 靜態檔案（CSS、JS、圖片）
- `views/` - EJS HTML 範本

### 文件
- `README.md` - 專案概述和快速開始
- `API_TESTING.md` - API 測試範例
- `IMPLEMENTATION_GUIDE.md` - 本文件
- `.env.example` - 環境變數範例
- `.gitignore` - Git 忽略規則

## 開發環境設定

### 步驟 1：安裝 Node.js

需要 Node.js 16+ 和 npm 8+

```bash
# 檢查版本
node --version
npm --version
```

### 步驟 2：複製專案並安裝依賴

```bash
cd /path/to/ordering-system-live
npm install
```

### 步驟 3：設定環境變數

```bash
cp .env.example .env
```

編輯 `.env` 檔案並設定以下值：

```env
NODE_ENV=development
PORT=3000
ADMIN_TOKEN=your-secret-token
ADMIN_PASSWORD=your-password
```

### 步驟 4：初始化資料庫

```bash
# 建立資料表
npm run init-db

# 填充測試資料
npm run seed
```

您應該看到類似的輸出：
```
✅ 資料庫初始化完成：./db/ordering.db
🌱 開始填充測試資料...
✅ 已建立 5 個品項
✅ 已建立 3 個折扣碼
✅ 已建立系統設定
✅ 已建立 3 個示例客戶
✅ 已生成 7 天庫存
🎉 資料庫種子填充完成！
```

### 步驟 5：啟動伺服器

```bash
# 開發模式（帶自動重載）
npm run dev

# 或生產模式
npm start
```

伺服器應在 `http://localhost:3000` 啟動

### 步驟 6：驗證伺服器

```bash
# 在另一個終端測試
curl http://localhost:3000/health
```

期望回應：
```json
{
  "status": "ok",
  "timestamp": "2026-03-09T12:00:00.000Z"
}
```

## 金流整合設定

### NewebPay（藍新金流）

1. 登入 [NewebPay 商務後台](https://merchant.newebpay.com/)
2. 取得以下資訊：
   - Merchant ID
   - Hash Key
   - Hash IV
3. 更新 `.env`：
   ```env
   NEWEBPAY_MERCHANT_ID=your_merchant_id
   NEWEBPAY_HASH_KEY=your_hash_key
   NEWEBPAY_HASH_IV=your_hash_iv
   ```

4. 設定回調 URL：
   - NewebPay 管理後台 → 商店設定 → 交易通知設定
   - 通知 URL: `https://yourdomain.com/api/payments/newebpay/notify`
   - 返回 URL: `https://yourdomain.com/api/payments/newebpay/return`

### LINE Pay

1. 登入 [LINE Developers Console](https://developers.line.biz/)
2. 建立或選擇現有的 LINE Official Account
3. 取得以下資訊：
   - Channel ID
   - Channel Secret
   - Channel Access Token
4. 更新 `.env`：
   ```env
   LINE_CHANNEL_ID=your_channel_id
   LINE_CHANNEL_SECRET=your_channel_secret
   LINE_CHANNEL_ACCESS_TOKEN=your_access_token
   ```

### LINE Messaging API（推播功能）

1. 在 [LINE Developers](https://developers.line.biz/) 設定 Webhook
2. Webhook URL: `https://yourdomain.com/api/line/webhook`
3. 驗證 Token 會自動使用 Channel Secret

## 前端開發

### 靜態頁面結構

在 `public/` 目錄建立：

```
public/
├── index.html          # 首頁
├── products.html       # 產品列表
├── checkout.html       # 結帳頁面
├── order-status.html   # 訂單追蹤
├── admin/
│   ├── dashboard.html  # 管理儀表板
│   ├── orders.html     # 訂單管理
│   └── settings.html   # 系統設定
├── css/
│   └── style.css
├── js/
│   ├── api.js          # API 呼叫函式庫
│   ├── order.js        # 訂單邏輯
│   └── admin.js        # 管理頁面邏輯
└── images/
    └── ...
```

### 前端 API 範例

```javascript
// api.js
const API_BASE = 'http://localhost:3000/api';

// 取得產品
async function getProducts() {
  const response = await fetch(`${API_BASE}/products`);
  return response.json();
}

// 建立訂單
async function createOrder(orderData) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  return response.json();
}

// 驗證折扣碼
async function validateDiscountCode(code) {
  const response = await fetch(`${API_BASE}/discount/validate/${code}`);
  return response.json();
}
```

## 部署到生產環境

### 環境檢查清單

- [ ] 更改 `ADMIN_PASSWORD`（強密碼）
- [ ] 生成安全的 `ADMIN_TOKEN`
- [ ] 設定所有金流 API 密鑰
- [ ] 設定正確的 `APP_URL`（HTTPS）
- [ ] 設定 `NODE_ENV=production`
- [ ] 安裝 SSL 憑證
- [ ] 備份資料庫
- [ ] 設定定期備份策略

### 使用 PM2 運行

```bash
# 全局安裝 PM2
npm install -g pm2

# 啟動應用
pm2 start server.js --name "lby-ordering"

# 設定開機自啟
pm2 startup
pm2 save

# 查看日誌
pm2 logs lby-ordering

# 監控應用
pm2 monit
```

### 使用 Docker 部署

建立 `Dockerfile`：

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

構建和運行：

```bash
docker build -t lby-ordering:1.0 .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e ADMIN_PASSWORD=secure_password \
  -v /path/to/db:/app/db \
  lby-ordering:1.0
```

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

重啟 Nginx：
```bash
sudo systemctl restart nginx
```

## 資料庫備份和恢復

### 備份

```bash
# 手動備份
cp db/ordering.db db/ordering.backup.$(date +%Y%m%d_%H%M%S).db

# 使用 cron 定時備份（每天凌晨 2 點）
0 2 * * * cp /path/to/db/ordering.db /path/to/backups/ordering.$(date +\%Y\%m\%d).db
```

### 恢復

```bash
# 停止應用
pm2 stop lby-ordering

# 恢復備份
cp db/ordering.backup.20260309_120000.db db/ordering.db

# 重啟應用
pm2 start lby-ordering
```

## 常見開發任務

### 添加新產品

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "G",
    "name": "新品項名稱",
    "price": 95,
    "cost": 30
  }'
```

### 建立預設訂單

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "測試客戶",
    "customer_phone": "0912999999",
    "pickup_date": "2026-03-12",
    "delivery_type": "pickup",
    "items": [
      {"product_id": 1, "quantity": 2}
    ]
  }'
```

### 檢視資料庫

```bash
# 安裝 sqlite3 命令行工具
# macOS
brew install sqlite

# Ubuntu/Debian
sudo apt-get install sqlite3

# 查看資料
sqlite3 db/ordering.db
sqlite> SELECT * FROM products;
sqlite> SELECT * FROM orders;
sqlite> .exit
```

### 重置開發資料

```bash
# 刪除資料庫
rm db/ordering.db

# 重新初始化
npm run seed
```

## 除錯和問題排除

### 常見問題

#### 1. "Module not found" 錯誤

```bash
# 解決：重新安裝依賴
rm -rf node_modules package-lock.json
npm install
```

#### 2. 資料庫鎖定

```bash
# 如果看到 "database is locked" 錯誤
# 解決：刪除 WAL 檔案
rm db/ordering.db-shm db/ordering.db-wal

# 重啟應用
npm start
```

#### 3. 金流測試失敗

- 確認 API 密鑰已正確設定
- 使用 NewebPay/LINE Pay 的沙箱環境進行測試
- 檢查網路連接和防火牆設定

#### 4. LINE 推播不工作

- 驗證 Channel Access Token 有效期
- 檢查 Webhook URL 是否正確設定
- 確認用戶已關注 LINE Official Account

### 啟用詳細日誌

修改 `server.js` 並添加日誌：

```javascript
// 詳細請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  console.log('Body:', req.body);
  next();
});
```

## 效能最佳化

### 資料庫優化

```sql
-- 分析查詢效能
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE pickup_date = '2026-03-12';

-- 分析和優化
ANALYZE;
VACUUM;
```

### API 快取

在 `routes/products.js` 添加快取：

```javascript
const cacheMaxAge = 5 * 60 * 1000; // 5 分鐘

router.get('/', (req, res) => {
  res.set('Cache-Control', `public, max-age=${cacheMaxAge / 1000}`);
  // ... 返回產品列表
});
```

### 連接池設定

目前使用 SQLite，單連接模型。
如果升級到 MySQL/PostgreSQL，添加連接池：

```javascript
// 使用 mysql2/promise
const pool = mysql.createPool({
  host: 'localhost',
  user: 'user',
  password: 'password',
  database: 'ordering_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

## 安全最佳實踐

### 輸入驗證

```javascript
// 使用驗證庫
const { body, validationResult } = require('express-validator');

router.post('/orders',
  body('customer_phone').isMobilePhone('zh-TW'),
  body('total_amount').isInt({ min: 0 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // 處理訂單
  }
);
```

### SQL 注入防護

已使用預編譯語句（prepared statements），確保安全：

```javascript
// 安全（推薦）
db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

// 不安全（避免）
db.prepare(`SELECT * FROM orders WHERE id = ${orderId}`);
```

### HTTPS 強制

```javascript
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

## 監控和日誌

### 日誌輪換

使用 `winston` 或 `bunyan` 進行日誌管理：

```bash
npm install winston
```

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

logger.info('Application started');
```

## 升級和維護

### 依賴更新

```bash
# 檢查可更新的套件
npm outdated

# 更新至最新版本
npm update

# 或使用 npm-check-updates
npm install -g npm-check-updates
ncu -u
npm install
```

### 資料庫遷移

對於複雜變更，建立遷移檔案：

```javascript
// migrations/001_add_column.js
const db = require('../db/init');

db.exec(`
  ALTER TABLE products ADD COLUMN availability_status TEXT DEFAULT 'available';
`);

console.log('Migration 001 completed');
```

## 聯繫和支持

- 文檔: 見 `README.md`
- API 測試: 見 `API_TESTING.md`
- 問題: 檢查伺服器日誌

---

**最後更新**: 2026-03-09
**版本**: 1.0.0

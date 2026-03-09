# 開始使用 - 快速指南

## 歡迎使用 纖體食驗室 × 林博御AI膳 訂購系統

本專案是一個完整的生產級 Node.js 餐飲訂購平台，已包含所有必要的後端 API、資料庫、金流整合和管理功能。

## 快速開始（5 分鐘）

### 1. 準備環境

```bash
# 確保安裝了 Node.js 16+ 和 npm 8+
node --version
npm --version

# 進入專案目錄
cd /path/to/ordering-system-live
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 初始化資料庫

```bash
npm run seed
```

你會看到類似這樣的輸出：
```
🌱 開始填充測試資料...
✅ 已建立 5 個品項
✅ 已建立 3 個折扣碼
✅ 已建立系統設定
✅ 已建立 3 個示例客戶
✅ 已生成 7 天庫存
🎉 資料庫種子填充完成！
```

### 4. 啟動伺服器

```bash
npm start
```

伺服器應該在 `http://localhost:3000` 啟動。

### 5. 驗證安裝

開啟另一個終端，測試 API：

```bash
# 檢查伺服器健康狀態
curl http://localhost:3000/health

# 取得產品列表
curl http://localhost:3000/api/products
```

## 檔案導覽

### 📖 先讀這些文件

1. **本檔案** (`00_START_HERE.md`) - 快速開始
2. **README.md** - 專案概述和 API 完整文件
3. **API_TESTING.md** - 所有 API 的使用範例

### 🛠️ 實作和部署參考

4. **IMPLEMENTATION_GUIDE.md** - 詳細的部署和配置指南
5. **PROJECT_SUMMARY.md** - 專案完成總結

## 主要文件結構

```
ordering-system-live/
├── server.js                    # Express 主應用
├── package.json                 # 依賴配置
│
├── db/
│   ├── init.js                  # 資料庫初始化（9 個表格）
│   └── seed.js                  # 測試資料填充
│
├── routes/                      # 8 個 API 路由模組
│   ├── products.js              # 產品 API
│   ├── orders.js                # 訂單 API（含折扣計算）
│   ├── inventory.js             # 庫存 API
│   ├── customers.js             # 客戶 API
│   ├── payments.js              # 金流 API（NewebPay/LINE Pay）
│   ├── line.js                  # LINE Messaging API
│   ├── admin.js                 # 管理員 API
│   └── discount.js              # 折扣碼 API
│
├── public/                      # 靜態檔案（待建立）
├── views/                       # EJS 範本（待建立）
│
├── .env.example                 # 環境變數範例
├── .gitignore                   # Git 忽略規則
│
└── 文件:
    ├── README.md                # 完整的 API 文件
    ├── API_TESTING.md           # API 測試範例
    ├── IMPLEMENTATION_GUIDE.md  # 部署指南
    └── PROJECT_SUMMARY.md       # 專案摘要
```

## 常用命令

```bash
# 開發模式（自動重載）
npm run dev

# 生產模式
npm start

# 重新初始化資料庫
npm run seed

# 查看資料庫內容
sqlite3 db/ordering.db
sqlite> .tables           # 查看所有表格
sqlite> SELECT * FROM products;  # 查看產品
```

## 快速 API 測試

### 取得產品列表
```bash
curl http://localhost:3000/api/products
```

### 建立訂單
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "王小美",
    "customer_phone": "0912111111",
    "pickup_date": "2026-03-12",
    "delivery_type": "pickup",
    "items": [
      {"product_id": 1, "quantity": 2}
    ]
  }'
```

### 驗證折扣碼
```bash
curl http://localhost:3000/api/discount/validate/LINBOYU01
```

## 預設資料

### 5 個示例產品
- A: 蔬菜健身餐 (80 元)
- B: 雞肉便當 (90 元)
- C: 豬肉套餐 (100 元)
- D: 海鮮精選 (120 元)
- E: 燕麥飯碗 (150 元)

### 3 個折扣碼
- LINBOYU01: 8 折（無限使用）
- OPEN2026: 8.5 折（最多 100 次）
- EARLY20: 9 折（最多 50 次）

### 3 個示例客戶
- 王小美: 0912111111
- 李健身: 0912222222
- 陳新客: 0912333333

## 環境設定

### 建立 .env 檔案

複製範例檔案：
```bash
cp .env.example .env
```

編輯 `.env` 並設定必要的環境變數：

```env
NODE_ENV=development
PORT=3000
ADMIN_TOKEN=your-secret-token
ADMIN_PASSWORD=your-password

# 金流設定（選用）
NEWEBPAY_MERCHANT_ID=your_id
NEWEBPAY_HASH_KEY=your_key
NEWEBPAY_HASH_IV=your_iv

# LINE 設定（選用）
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_secret
LINE_CHANNEL_ACCESS_TOKEN=your_token
```

## API 端點概覽

| 模組 | 端點 | 說明 |
|------|------|------|
| **產品** | `/api/products` | 列表、建立、更新 |
| **訂單** | `/api/orders` | 建立、查詢、更新狀態 |
| **庫存** | `/api/inventory` | 查詢、更新、批量生成 |
| **客戶** | `/api/customers` | 管理客戶資料 |
| **金流** | `/api/payments` | NewebPay、LINE Pay 整合 |
| **LINE** | `/api/line` | Webhook、推播、廣播 |
| **管理** | `/api/admin` | 儀表板、設定、報表 |
| **折扣** | `/api/discount` | 驗證、管理折扣碼 |

完整 API 文件詳見 **README.md**

## 核心業務規則

### 自動折扣計算
- **3+ 天前下單**: 8 折（20% 折扣）
- **1 天前下單**: 9 折（10% 折扣）
- **當天下單**: 原價（100%）

### 品牌區分
- **林博御AI膳**: 泰山楓江路自取，免外送費
- **纖體食驗室**: 雲端廚房，外送加 30 元

### 訂單編號
自動生成格式：`LBY-YYYYMMDD-NNN`
- 例如：LBY-20260309-001

## 下一步

### 檢查清單

- [ ] 成功運行 `npm start`
- [ ] API 測試成功（curl 或 Postman）
- [ ] 瀏覽 README.md 了解 API 文件
- [ ] 閱讀 API_TESTING.md 進行測試
- [ ] （可選）配置金流和 LINE API
- [ ] （可選）開發前端應用

### 前端開發

此專案包含後端 API。你需要建立前端應用：
- React 應用（推薦）
- Vue.js 應用
- 靜態 HTML/CSS 應用

前端需要調用本後端的 API 端點。

### 部署準備

詳見 **IMPLEMENTATION_GUIDE.md**：
- 環境設定
- 金流整合
- Docker 部署
- Nginx 配置
- 資料庫備份

## 常見問題

**Q: 如何改變訂單折扣？**
A: 修改 `routes/orders.js` 中的 `calculateDiscountRate()` 函數

**Q: 如何添加新產品？**
A: 使用 POST `/api/products` API 或直接在資料庫中插入

**Q: 如何配置 NewebPay？**
A: 詳見 IMPLEMENTATION_GUIDE.md 的「金流整合」部分

**Q: 如何啟用 LINE 推播？**
A: 配置 LINE_CHANNEL_ACCESS_TOKEN 環境變數

## 支援資源

| 需求 | 參考檔案 |
|------|---------|
| API 完整文件 | README.md |
| API 測試範例 | API_TESTING.md |
| 部署指南 | IMPLEMENTATION_GUIDE.md |
| 專案摘要 | PROJECT_SUMMARY.md |

## 聯絡方式

遇到問題？
1. 檢查伺服器日誌（console 輸出）
2. 查閱相關文件
3. 測試 API（參考 API_TESTING.md）
4. 檢查環境變數設定

---

**版本**: 1.0.0  
**建立日期**: 2026-03-09  
**狀態**: ✅ 生產就緒

祝你使用愉快！

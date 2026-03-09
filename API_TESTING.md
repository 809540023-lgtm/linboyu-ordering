# API 測試指南

此文件包含所有 API 的測試範例，可用於 Postman、curl 或其他 API 測試工具。

## 環境變數設定

在進行測試前，設定以下環境變數（Postman 環境變數或 curl 變數）：

```
BASE_URL=http://localhost:3000
ADMIN_TOKEN=demo-admin-token
```

## 1. 健康檢查

### 檢查伺服器狀態

```bash
curl -X GET http://localhost:3000/health
```

期望回應：
```json
{
  "status": "ok",
  "timestamp": "2026-03-09T12:00:00.000Z"
}
```

## 2. 產品 API 測試

### 2.1 列出所有產品

```bash
curl -X GET http://localhost:3000/api/products
```

### 2.2 取得單一產品

```bash
curl -X GET http://localhost:3000/api/products/1
```

### 2.3 建立新產品（管理員）

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "F",
    "name": "牛肉丼飯",
    "description": "白飯80g + 牛肉 + 時蔬2樣 + 例湯",
    "price": 120,
    "cost": 35,
    "daily_quota": 18,
    "emoji": "🍱",
    "status": "active",
    "sort_order": 5
  }'
```

### 2.4 更新產品（管理員）

```bash
curl -X PUT http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 85,
    "description": "更新的描述"
  }'
```

### 2.5 刪除產品（管理員）

```bash
curl -X DELETE http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer demo-admin-token"
```

## 3. 訂單 API 測試

### 3.1 建立訂單

```bash
# 先確認有效的 product_id 和 pickup_date
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "王小美",
    "customer_phone": "0912111111",
    "customer_email": "wang@example.com",
    "delivery_type": "pickup",
    "pickup_date": "2026-03-12",
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
    "discount_code": "LINBOYU01",
    "note": "不要辣"
  }'
```

期望回應：
```json
{
  "success": true,
  "message": "訂單已建立，待支付",
  "data": {
    "order_id": 1,
    "order_number": "LBY-20260309-001",
    "total_amount": 410,
    "discount_label": "LINBOYU01 (80折)",
    "payment_status": "pending"
  }
}
```

### 3.2 列出訂單（管理員）

```bash
# 列出所有待確認訂單
curl -X GET "http://localhost:3000/api/orders?status=confirmed" \
  -H "Authorization: Bearer demo-admin-token"

# 列出特定日期訂單
curl -X GET "http://localhost:3000/api/orders?date=2026-03-12&page=1&limit=20" \
  -H "Authorization: Bearer demo-admin-token"
```

### 3.3 取得訂單詳細

```bash
curl -X GET http://localhost:3000/api/orders/1
```

### 3.4 更新訂單狀態（管理員）

```bash
curl -X PUT http://localhost:3000/api/orders/1/status \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "order_status": "preparing"
  }'
```

狀態流程：confirmed → preparing → ready → completed

### 3.5 每日摘要

```bash
curl -X GET "http://localhost:3000/api/orders/daily-summary/2026-03-12" \
  -H "Authorization: Bearer demo-admin-token"
```

## 4. 庫存 API 測試

### 4.1 取得特定日期庫存

```bash
curl -X GET http://localhost:3000/api/inventory/2026-03-12 \
  -H "Authorization: Bearer demo-admin-token"
```

### 4.2 更新庫存

```bash
curl -X PUT http://localhost:3000/api/inventory/2026-03-12/1 \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "total_qty": 20,
    "sold_qty": 5,
    "reserved_qty": 3
  }'
```

### 4.3 自動生成庫存（批量）

```bash
curl -X POST http://localhost:3000/api/inventory/generate \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-03-10",
    "end_date": "2026-03-20",
    "daily_qty": 18
  }'
```

### 4.4 庫存總覽

```bash
curl -X GET "http://localhost:3000/api/inventory/summary?start_date=2026-03-01&end_date=2026-03-31" \
  -H "Authorization: Bearer demo-admin-token"
```

## 5. 客戶 API 測試

### 5.1 列出客戶（管理員）

```bash
# 列出所有 VIP 客戶
curl -X GET "http://localhost:3000/api/customers?tag=vip&page=1&limit=20" \
  -H "Authorization: Bearer demo-admin-token"

# 搜尋客戶
curl -X GET "http://localhost:3000/api/customers?search=王" \
  -H "Authorization: Bearer demo-admin-token"
```

### 5.2 根據電話查詢客戶

```bash
curl -X GET http://localhost:3000/api/customers/by-phone/0912111111
```

### 5.3 取得客戶詳細

```bash
curl -X GET http://localhost:3000/api/customers/1 \
  -H "Authorization: Bearer demo-admin-token"
```

### 5.4 建立客戶（管理員）

```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "陳健美",
    "phone": "0912444444",
    "email": "chen@example.com",
    "tag": "new"
  }'
```

### 5.5 更新客戶（管理員）

```bash
curl -X PUT http://localhost:3000/api/customers/1 \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "vip",
    "note": "重要客戶，特殊照顧"
  }'
```

## 6. 折扣碼 API 測試

### 6.1 驗證折扣碼

```bash
# 檢查折扣碼是否有效
curl -X GET http://localhost:3000/api/discount/validate/LINBOYU01
```

### 6.2 列出折扣碼（管理員）

```bash
curl -X GET "http://localhost:3000/api/discount/codes?status=active" \
  -H "Authorization: Bearer demo-admin-token"
```

### 6.3 建立折扣碼（管理員）

```bash
curl -X POST http://localhost:3000/api/discount/codes \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SPRING2026",
    "type": "event",
    "discount_rate": 0.75,
    "max_uses": 100,
    "valid_from": "2026-03-01",
    "valid_until": "2026-03-31"
  }'
```

### 6.4 更新折扣碼（管理員）

```bash
curl -X PUT http://localhost:3000/api/discount/codes/1 \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "discount_rate": 0.7,
    "max_uses": 200
  }'
```

### 6.5 記錄折扣碼使用（管理員）

```bash
curl -X POST http://localhost:3000/api/discount/codes/1/use \
  -H "Authorization: Bearer demo-admin-token"
```

## 7. 金流 API 測試

### 7.1 建立 NewebPay 付款

```bash
curl -X POST http://localhost:3000/api/payments/newebpay/create \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1
  }'
```

回應會包含需要 POST 到 NewebPay 的表單數據

### 7.2 查詢付款狀態

```bash
curl -X GET http://localhost:3000/api/payments/status/1
```

### 7.3 建立 LINE Pay 付款

```bash
curl -X POST http://localhost:3000/api/payments/linepay/create \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1
  }'
```

## 8. LINE API 測試

### 8.1 推送訊息到用戶（管理員）

```bash
curl -X POST http://localhost:3000/api/line/push \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "line_user_id": "U1234567890abcdefg",
    "message": "您的訂單已準備好！請在營業時間內到店取餐。"
  }'
```

### 8.2 廣播訊息（管理員）

```bash
# 廣播給所有 VIP 客戶
curl -X POST http://localhost:3000/api/line/broadcast \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "本週新菜單已上線！歡迎訂購",
    "tag": "vip"
  }'
```

### 8.3 列出 LINE 訊息記錄（管理員）

```bash
curl -X GET "http://localhost:3000/api/line/messages?type=broadcast&page=1&limit=20" \
  -H "Authorization: Bearer demo-admin-token"
```

## 9. 管理員 API 測試

### 9.1 登入

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "password": "demo123"
  }'
```

回應：
```json
{
  "success": true,
  "message": "登入成功",
  "data": {
    "token": "admin-xxx-yyy",
    "type": "Bearer"
  }
}
```

### 9.2 取得儀表板

```bash
curl -X GET "http://localhost:3000/api/admin/dashboard?date_from=2026-03-01&date_to=2026-03-31" \
  -H "Authorization: Bearer demo-admin-token"
```

### 9.3 取得系統設定（管理員）

```bash
curl -X GET http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer demo-admin-token"
```

### 9.4 更新系統設定（管理員）

```bash
curl -X PUT http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer demo-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "shop_name": "纖體食驗室 × 林博御AI膳",
    "daily_quota": "100",
    "delivery_fee": "50",
    "business_hours": "10:00-21:00"
  }'
```

### 9.5 每日報表

```bash
curl -X GET "http://localhost:3000/api/admin/daily-report/2026-03-12" \
  -H "Authorization: Bearer demo-admin-token"
```

### 9.6 匯出訂單（管理員）

```bash
curl -X GET "http://localhost:3000/api/admin/export/orders?date_from=2026-03-01&date_to=2026-03-31" \
  -H "Authorization: Bearer demo-admin-token" \
  -o orders.json
```

### 9.7 匯出客戶（管理員）

```bash
curl -X GET http://localhost:3000/api/admin/export/customers \
  -H "Authorization: Bearer demo-admin-token" \
  -o customers.json
```

## 錯誤處理測試

### 測試無效的請求

```bash
# 缺少必填欄位
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name": "測試"}'

# 無效的 ID
curl -X GET http://localhost:3000/api/products/999999

# 未授權訪問
curl -X GET http://localhost:3000/api/admin/dashboard
```

期望收到適當的錯誤訊息和狀態碼（400, 401, 404 等）

## 效能測試

使用 Apache Bench 或類似工具進行負載測試：

```bash
# 測試列出產品的性能（1000 次請求，10 個並發）
ab -n 1000 -c 10 http://localhost:3000/api/products

# 測試建立訂單的性能（100 次請求）
ab -n 100 -c 5 -p order.json -T application/json http://localhost:3000/api/orders
```

## Postman Collection 匯入

如果你使用 Postman，可以手動建立一個集合並導入這些請求。

## 常見測試流程

### 完整訂購流程

1. 取得產品列表 (`GET /api/products`)
2. 驗證折扣碼 (`GET /api/discount/validate/CODE`)
3. 查詢客戶 (`GET /api/customers/by-phone/PHONE`)
4. 建立訂單 (`POST /api/orders`)
5. 查詢訂單狀態 (`GET /api/orders/ID`)
6. 建立付款 (`POST /api/payments/newebpay/create`)
7. 更新訂單狀態 (`PUT /api/orders/ID/status`)

### 管理員操作流程

1. 登入 (`POST /api/admin/login`)
2. 查看儀表板 (`GET /api/admin/dashboard`)
3. 列出今日訂單 (`GET /api/orders?date=TODAY`)
4. 更新訂單狀態 (`PUT /api/orders/ID/status`)
5. 查看每日報表 (`GET /api/admin/daily-report/DATE`)
6. 廣播訊息 (`POST /api/line/broadcast`)

---

**提示**: 建議在開發環境中測試所有 API，確保一切正常後再部署到生產環境。

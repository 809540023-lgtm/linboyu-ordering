// ===== 主要 Express 伺服器 =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 安全中介軟體 =====
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// ===== 限流中介軟體 =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '太多請求，請稍候再試'
});
app.use('/api/', limiter);

// ===== 解析中介軟體 =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ===== 靜態檔案 =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== 日誌中介軟體 =====
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== 健康檢查 =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== 啟動伺服器（等待 DB 就緒）=====
async function startServer() {
  const db = require('./db/init');
  await db.waitReady();

  // ===== 路由掛載 =====
  const productsRouter = require('./routes/products');
  const ordersRouter = require('./routes/orders');
  const inventoryRouter = require('./routes/inventory');
  const customersRouter = require('./routes/customers');
  const paymentsRouter = require('./routes/payments');
  const lineRouter = require('./routes/line');
  const adminRouter = require('./routes/admin');
  const discountRouter = require('./routes/discount');
  const authRouter = require('./routes/auth');

  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/line', lineRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/discount', discountRouter);
  app.use('/api/auth', authRouter);

  // ===== 404 處理 =====
  app.use((req, res) => {
    res.status(404).json({
      error: '資源不存在',
      path: req.path,
      method: req.method
    });
  });

  // ===== 全局錯誤處理 =====
  app.use((err, req, res, next) => {
    console.error('❌ 錯誤:', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || '伺服器錯誤';
    res.status(statusCode).json({
      error: message,
      statusCode: statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 纖體食驗室 × 林博御AI膳 訂購系統`);
    console.log(`📍 伺服器已啟動: http://localhost:${PORT}`);
    console.log(`📅 啟動時間: ${new Date().toLocaleString('zh-TW')}\n`);
  });

  // ===== 優雅關閉 =====
  process.on('SIGTERM', () => {
    console.log('📛 收到 SIGTERM，關閉中...');
    server.close(() => { db.close(); process.exit(0); });
  });
  process.on('SIGINT', () => {
    console.log('📛 收到 SIGINT，關閉中...');
    server.close(() => { db.close(); process.exit(0); });
  });
}

startServer().catch(err => {
  console.error('❌ 啟動失敗:', err);
  process.exit(1);
});

module.exports = app;

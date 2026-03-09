// ===== 共享驗證中介軟體 =====
const db = require('../db/init');

const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未授權的訪問' });
  }

  // 方式 1: 檢查 settings 資料表中的 admin 登入 token
  const storedPhone = db.prepare("SELECT value FROM settings WHERE key = ?").get(`admin_token_${token}`)?.value;

  if (storedPhone) {
    return next();
  }

  // 方式 2: 檢查環境變數 token（向後相容）
  if (token === (process.env.ADMIN_TOKEN || 'demo-admin-token')) {
    return next();
  }

  return res.status(401).json({ error: '未授權的訪問' });
};

module.exports = { requireAdmin };

// ===== PM2 進程管理設定 =====
// 使用方式：pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'linboyu-ordering',
    script: 'server.js',
    cwd: __dirname,

    // 進程設定
    instances: 1,           // SQLite 不支援多進程，保持 1
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',

    // 環境變數
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // 日誌設定
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true,
    log_file: './logs/combined.log',

    // 重啟策略
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,

    // 優雅關閉
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};

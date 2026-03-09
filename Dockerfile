# ===== 纖體食驗室 × 林博御AI膳 訂購系統 =====
# 多階段建構 Dockerfile

# --- 階段 1：安裝依賴 ---
FROM node:20-alpine AS builder

# 安裝 better-sqlite3 所需的編譯工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 複製 package 檔案
COPY package.json ./

# 安裝所有依賴
RUN npm install --production

# --- 階段 2：正式映像 ---
FROM node:20-alpine

# 設定時區為台北
RUN apk add --no-cache tzdata curl && \
    cp /usr/share/zoneinfo/Asia/Taipei /etc/localtime && \
    echo "Asia/Taipei" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# 建立非 root 使用者
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 從 builder 複製 node_modules
COPY --from=builder /app/node_modules ./node_modules

# 複製應用程式碼
COPY . .

# 建立資料庫目錄並設定權限
RUN mkdir -p /app/db/data && \
    chown -R appuser:appgroup /app

# 切換到非 root 使用者
USER appuser

# 環境變數
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 啟動
CMD ["sh", "-c", "node db/seed.js && node server.js"]

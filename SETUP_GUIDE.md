# OSCE教案開發系統 - 完整部署指南

## 📋 系統概述

這是一個基於AI的OSCE醫學教案開發系統，包含：
- 🤖 AI教案自動生成
- 🔍 醫學內容智能審核
- 📊 難度動態調整
- 👥 多用戶職級管理
- 📈 使用統計分析

## 🔧 環境要求

### 必需軟件
- **Node.js** >= 16.0.0
- **PostgreSQL** >= 12.0
- **Git** (用於版本控制)

### AI服務API金鑰 (選擇其一或多個)
- **OpenAI API Key** (推薦用於醫學內容)
- **Claude API Key** (Anthropic)

## 📦 第一步：安裝依賴

```bash
# 1. 進入項目目錄
cd C:\Users\lu801

# 2. 安裝Node.js依賴
npm install

# 如果沒有package.json，先創建：
npm init -y
npm install express cors helmet morgan joi bcryptjs jsonwebtoken
npm install express-rate-limit dotenv axios pg winston
npm install --save-dev nodemon
```

## 🗄️ 第二步：數據庫設置

### 安裝PostgreSQL
1. 下載並安裝 PostgreSQL: https://www.postgresql.org/download/
2. 創建數據庫用戶和數據庫

### 執行數據庫初始化
```bash
# 1. 登入PostgreSQL (以管理員身份)
psql -U postgres

# 2. 創建數據庫和用戶
CREATE DATABASE osce_lesson_system;
CREATE USER osce_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE osce_lesson_system TO osce_user;
\q

# 3. 執行schema創建
psql -U osce_user -d osce_lesson_system -f database/schema.sql

# 4. 插入初始數據
psql -U osce_user -d osce_lesson_system -f database/seed_data.sql
```

## 🔐 第三步：環境配置

創建 `.env` 檔案：

```bash
# 在項目根目錄創建 .env 文件
```

## ⚙️ 第四步：環境變數設定

在 `.env` 文件中設定以下變數：

```env
# 服務器配置
PORT=3000
NODE_ENV=development

# 數據庫配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=osce_lesson_system
DB_USER=osce_user
DB_PASSWORD=your_secure_password

# JWT密鑰 (請更改為強密碼)
JWT_SECRET=your_super_secure_jwt_secret_key_change_this

# AI服務配置 (至少配置一個)
OPENAI_API_KEY=your_openai_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here

# 可選：其他配置
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🚀 第五步：啟動系統

### 開發模式啟動
```bash
# 使用nodemon自動重啟 (開發用)
npm run dev

# 或者直接啟動
node src/server.js
```

### 生產模式啟動
```bash
# 生產環境啟動
NODE_ENV=production node src/server.js
```

## 🧪 第六步：測試系統

### 執行完整系統測試
```bash
# 運行AI功能測試套件
node scripts/testAIGeneration.js
```

### 手動API測試
系統啟動後，訪問：
- **系統狀態**: http://localhost:3000/api/v1/health
- **API文檔**: 查看 `API_GUIDE.md` 文件
- **用戶註冊**: POST http://localhost:3000/api/v1/auth/register

## 📊 系統管理

### 創建管理員用戶
```bash
# 使用API創建管理員 (系統啟動後執行)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@hospital.com",
    "password": "AdminPass123!",
    "fullName": "系統管理員",
    "gradeLevel": "attending",
    "specialty": "內科",
    "role": "admin"
  }'
```

### 監控日志
系統日志會輸出到控制台，包含：
- 🟢 正常操作日志
- 🟡 警告信息
- 🔴 錯誤日志
- 📊 性能統計

## 🛠️ 疑難排解

### 常見問題

**1. 數據庫連接失敗**
```
錯誤: database "osce_lesson_system" does not exist
解決: 確保已創建數據庫並執行schema.sql
```

**2. AI服務調用失敗**
```
錯誤: AI服務不可用
解決: 檢查 .env 中的API密鑰是否正確設置
```

**3. 端口被占用**
```
錯誤: Port 3000 is already in use
解決: 更改 .env 中的PORT設定或關閉占用程序
```

**4. JWT驗證失敗**
```
錯誤: Token verification failed
解決: 檢查JWT_SECRET是否設置正確
```

### 日志檢查
```bash
# 查看實時日志
tail -f logs/app.log  # 如果配置了文件日志

# 或直接查看控制台輸出
```

## 📈 性能優化

### 生產環境建議
1. **使用PM2管理進程**
```bash
npm install -g pm2
pm2 start src/server.js --name "osce-system"
pm2 monitor
```

2. **數據庫優化**
- 定期清理舊日志
- 建立適當索引
- 監控查詢性能

3. **AI服務優化**
- 配置多個API密鑰輪換使用
- 設置合理的請求限制
- 監控API調用成本

## 🔒 安全注意事項

1. **更改默認密碼**
   - 更改數據庫密碼
   - 設置強JWT密鑰

2. **API密鑰安全**
   - 不要將API密鑰提交到版本控制
   - 定期輪換密鑰

3. **網絡安全**
   - 使用HTTPS (生產環境)
   - 配置防火牆規則
   - 限制數據庫訪問

## 📞 技術支援

如遇到問題，請檢查：
1. 📋 本指南的疑難排解章節
2. 📄 `API_GUIDE.md` 中的API文檔
3. 🧪 運行測試腳本確認功能狀態

---

🎉 **恭喜！你的OSCE教案開發系統現在已準備就緒！**

系統提供完整的AI教案生成、智能審核和用戶管理功能。開始使用吧！
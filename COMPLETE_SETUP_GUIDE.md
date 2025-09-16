# OSCE 教案開發系統 - 完整部署指南

## 系統概覽

這是一個完整的 OSCE 教案開發系統，包含：

- **後端 API**：Node.js + Express + PostgreSQL
- **前端應用**：React + Tailwind CSS
- **AI 功能**：整合 OpenAI 和 Anthropic
- **認證系統**：JWT 認證
- **管理功能**：用戶管理、教案審核

## 快速開始

### 前置需求

- Node.js >= 16.0.0
- npm >= 7.0.0
- PostgreSQL 14+ （可選，系統支援無資料庫運行）

### 1. 安裝後端依賴

```bash
npm install
```

### 2. 環境配置

複製並配置環境變數：

```bash
cp .env.example .env
```

編輯 `.env` 文件，配置必要參數：

```bash
# 資料庫配置（請填入您在步驟 4 設定的資訊）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=osce_lesson_system
DB_USER=osce_user
DB_PASSWORD=your_secure_password  # <-- 換成您在步驟 4 設定的密碼

# JWT 設定 (先用預設的即可)
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=24h

# AI 服務配置（非常重要！）
# 文件預設 MOCK_AI_RESPONSES=true，這表示它會用假資料模擬 AI 回應
# 這對新手非常友善！您暫時不需要申請昂貴的 AI Key 就可以執行系統！
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# 系統設定 (請確保跟文件一樣)
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
MOCK_AI_RESPONSES=true
```

### 3. 啟動後端服務

```bash
npm start
```

後端將在 http://localhost:3001 運行。

### 4. 安裝前端依賴

```bash
cd frontend
npm install
```

### 5. 啟動前端開發伺服器

```bash
npm start
```

前端將在 http://localhost:3000 運行。

## 系統功能

### 🔐 用戶認證
- 用戶註冊和登入
- JWT Token 認證
- 密碼加密存儲
- 自動 token 刷新

### 📚 教案管理
- 創建、編輯、刪除教案
- 教案狀態管理（草稿、待審核、已通過、被拒絕）
- 搜尋和篩選功能
- 批量操作

### 🤖 AI 輔助
- 使用 AI 自動生成教案內容
- 教案品質評估
- 智能建議和改進
- 支援 OpenAI 和 Anthropic

### 📊 數據分析
- 系統使用統計
- 教案統計和報告
- 用戶活動分析

### 🎛️ 管理功能
- 用戶管理
- 教案審核工作流
- 系統日誌
- 健康檢查

## API 端點

### 認證
- `POST /api/v1/auth/register` - 用戶註冊
- `POST /api/v1/auth/login` - 用戶登入
- `POST /api/v1/auth/logout` - 用戶登出
- `GET /api/v1/auth/me` - 取得當前用戶

### 教案
- `GET /api/v1/lessons` - 取得教案列表
- `POST /api/v1/lessons` - 創建教案
- `GET /api/v1/lessons/:id` - 取得教案詳情
- `PUT /api/v1/lessons/:id` - 更新教案
- `DELETE /api/v1/lessons/:id` - 刪除教案

### AI 服務
- `POST /api/v1/ai/generate-lesson` - AI 生成教案
- `POST /api/v1/ai/review-lesson` - AI 審核教案
- `POST /api/v1/ai/suggest-improvements` - AI 建議改進

## 前端頁面結構

```
/
├── /login              # 登入頁面
├── /register           # 註冊頁面
├── /dashboard          # 主儀表板
├── /lessons            # 教案列表
├── /lessons/create     # 創建教案
├── /lessons/:id        # 教案詳情
├── /knowledge          # 知識庫管理
└── /profile            # 個人資料
```

## 開發指南

### 添加新功能

1. **後端 API**：在 `src/routes/` 中添加路由
2. **前端頁面**：在 `frontend/src/pages/` 中添加頁面
3. **API 整合**：在 `frontend/src/services/api.js` 中添加 API 方法

### 代碼結構

```
osce教案開發/
├── src/                    # 後端源碼
│   ├── config/            # 配置文件
│   ├── middleware/        # 中介軟體
│   ├── routes/            # API 路由
│   ├── services/          # 業務邏輯
│   └── utils/             # 工具函數
├── frontend/              # 前端源碼
│   ├── src/
│   │   ├── components/    # React 組件
│   │   ├── pages/         # 頁面組件
│   │   ├── services/      # API 服務
│   │   └── contexts/      # React Context
│   └── public/            # 靜態文件
├── database/              # 資料庫腳本
├── docs/                  # 文檔
└── scripts/               # 部署腳本
```

### 測試

```bash
# 後端測試
npm test

# 前端測試
cd frontend
npm test

# 構建測試
cd frontend
npm run build
```

## 部署

### 開發環境

1. 啟動後端：`npm start`
2. 啟動前端：`cd frontend && npm start`

### 生產環境

1. **構建前端**：
   ```bash
   cd frontend
   npm run build
   ```

2. **部署後端**：
   ```bash
   npm start
   ```

3. **配置反向代理**（如 Nginx）：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # 前端靜態文件
       location / {
           root /path/to/frontend/build;
           try_files $uri $uri/ /index.html;
       }

       # API 請求
       location /api/ {
           proxy_pass http://localhost:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

### Docker 部署（可選）

創建 `Dockerfile`：

```dockerfile
# 後端
FROM node:16
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 故障排除

### 常見問題

1. **端口衝突**：確保後端使用 3001，前端使用 3000
2. **CORS 錯誤**：檢查 `FRONTEND_URL` 環境變數
3. **資料庫連接失敗**：系統會自動切換到測試模式
4. **AI 服務失敗**：檢查 API 密鑰，或啟用 `MOCK_AI_RESPONSES`

### 日誌檢查

- 後端日誌：在 `logs/` 目錄
- 前端錯誤：瀏覽器開發者工具

## 安全注意事項

1. **環境變數**：不要將 `.env` 文件提交到版本控制
2. **JWT 密鑰**：使用強密碼作為 JWT_SECRET
3. **API 密鑰**：妥善保管 AI 服務 API 密鑰
4. **HTTPS**：生產環境務必使用 HTTPS

## 技術支援

如遇到問題，請檢查：

1. Node.js 和 npm 版本
2. 環境變數配置
3. 網路連接
4. 日誌文件

## 授權

MIT License - 詳見 LICENSE 文件。

---

**系統狀態**：✅ 前端已完成並可使用
**最後更新**：2024-09-16
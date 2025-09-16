# OSCE教案開發系統

基於AI的OSCE（客觀結構化臨床考試）教案自動生成與審核系統。

## 系統特色

- **職級分層管理**：支援UGY、PGY、住院醫師等不同職級
- **AI智慧生成**：根據職級自動調整教案難度和內容深度
- **自動審核機制**：確保醫學準確性和教學品質
- **台灣國考整合**：基於台灣西醫OSCE國考內容設計

## 技術架構

- **後端**：Node.js + Express.js
- **資料庫**：PostgreSQL
- **AI服務**：OpenAI GPT-4 / Claude API
- **認證**：JWT Token
- **限流**：Rate Limiting
- **日誌**：Winston

## 快速開始

### 1. 環境準備

確保您的系統已安裝：
- Node.js (版本 16.0.0 或以上)
- PostgreSQL (版本 12 或以上)
- npm 或 yarn

### 2. 安裝依賴

```bash
npm install
```

### 3. 環境配置

複製環境變數範本：
```bash
cp .env.example .env
```

編輯 `.env` 文件，設定以下必要參數：
```env
# 資料庫配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=osce_lesson_system
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT密鑰
JWT_SECRET=your_super_secret_jwt_key_here

# AI服務配置
OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key
```

### 4. 資料庫初始化

```bash
# 初始化資料庫結構和基礎資料
npm run init-db

# 創建管理員帳號（可選）
node scripts/initDatabase.js --create-admin
```

### 5. 啟動服務

```bash
# 開發模式（支援熱重載）
npm run dev

# 生產模式
npm start
```

伺服器將在 `http://localhost:3000` 啟動

### 6. 驗證安裝

訪問以下端點驗證系統運行：
- 健康檢查：`GET /health`
- API文檔：`GET /api/v1`

## API 端點

### 認證相關
- `POST /api/v1/auth/register` - 用戶註冊
- `POST /api/v1/auth/login` - 用戶登入
- `GET /api/v1/auth/me` - 獲取當前用戶資訊

### 用戶管理
- `GET /api/v1/users/profile` - 獲取個人資料
- `PUT /api/v1/users/profile` - 更新個人資料
- `PUT /api/v1/users/change-password` - 更改密碼
- `GET /api/v1/users/stats` - 獲取用戶統計

### 管理員功能
- `GET /api/v1/admin/grade-configs` - 職級配置管理
- `GET /api/v1/admin/system-configs` - 系統配置管理
- `GET /api/v1/admin/dashboard-stats` - 系統統計
- `GET /api/v1/users/list` - 用戶列表（管理員）

### 教案管理（開發中）
- `GET /api/v1/lessons` - 教案列表
- `POST /api/v1/lessons/generate` - 生成教案
- `GET /api/v1/lessons/:id` - 獲取教案詳情

### OSCE知識庫（開發中）
- `GET /api/v1/knowledge` - 知識庫查詢
- `GET /api/v1/knowledge/subjects` - 科目分類

### AI服務（開發中）
- `POST /api/v1/ai/generate` - AI生成服務
- `POST /api/v1/ai/review` - AI審核服務

## 資料庫結構

### 核心表結構

1. **users** - 用戶資訊
2. **grade_configs** - 職級配置
3. **osce_subjects** - OSCE科目分類
4. **osce_knowledge_base** - OSCE知識庫
5. **lesson_templates** - 教案模板
6. **ai_lesson_generations** - AI生成記錄
7. **ai_review_logs** - AI審核日誌

### 職級系統

支援的醫師職級：
- **UGY**：醫學系學生（大五大六）
- **PGY1/PGY2**：畢業後一般醫學訓練
- **R1-R5**：專科住院醫師（各年級）

每個職級對應不同的：
- 難度等級（1-5）
- 醫學術語複雜度
- 病例複雜度
- 評估深度要求

## 安全特性

- **JWT認證**：安全的無狀態認證
- **密碼加密**：bcrypt高強度加密
- **請求限流**：防止API濫用
- **輸入驗證**：Joi架構驗證
- **SQL注入防護**：參數化查詢
- **錯誤處理**：統一錯誤處理機制

## 開發指引

### 專案結構

```
src/
├── config/         # 配置文件
├── middleware/     # 中間件
├── routes/         # API路由
├── utils/          # 工具函數
└── server.js       # 主伺服器文件

database/
├── schema.sql      # 資料庫結構
└── seed_data.sql   # 初始化數據

scripts/
└── initDatabase.js # 資料庫初始化腳本
```

### 程式碼風格

- 使用ES6+語法
- 採用async/await處理異步操作
- 統一錯誤處理和日誌記錄
- RESTful API設計原則

### 測試

```bash
# 運行測試
npm test

# 代碼檢查
npm run lint
```

## 部署

### Docker 部署

```dockerfile
# Dockerfile 範例
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 環境變數

生產環境需要設定：
- `NODE_ENV=production`
- `DB_*` 資料庫連接參數
- `JWT_SECRET` JWT密鑰
- `OPENAI_API_KEY` AI服務密鑰

## 後續開發計劃

1. **AI教案生成模組**
   - 整合OpenAI/Claude API
   - 職級難度自適應算法
   - 教案品質評估系統

2. **前端界面開發**
   - React.js用戶界面
   - 教案編輯器
   - 管理員儀表板

3. **進階功能**
   - 教案模板自定義
   - 批量生成功能
   - 導出多種格式（PDF、Word）

4. **系統優化**
   - Redis快取層
   - 資料庫查詢優化
   - API性能監控

## 貢獻

歡迎提交Issue和Pull Request來改善這個專案。

## 授權

MIT License

## 聯繫

如有問題或建議，請通過以下方式聯繫：
- 開issue在GitHub repository
- 發送郵件至開發團隊

---

**注意**：這是一個醫學教育輔助系統，生成的教案內容僅供教學參考，不能替代正式的醫學教育和臨床指導。
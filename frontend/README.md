# OSCE 教案開發系統 - 前端

這是 OSCE 教案開發系統的 React 前端應用程式，提供直觀的用戶介面來管理和創建 OSCE 教學內容。

## 功能特色

- 🔐 **用戶認證**：安全的登入、註冊系統
- 📚 **教案管理**：創建、編輯、查看和管理 OSCE 教案
- 🤖 **AI 輔助**：整合 AI 功能協助生成教案內容
- 📊 **儀表板**：直觀的數據可視化和統計資訊
- 💾 **知識庫**：管理教學資源和參考資料
- 📱 **響應式設計**：支援桌面和行動裝置
- 🎨 **現代化 UI**：使用 Tailwind CSS 的美觀介面

## 技術架構

- **框架**：React 18
- **路由**：React Router DOM v6
- **狀態管理**：React Query + Context API
- **樣式**：Tailwind CSS
- **表單處理**：React Hook Form
- **HTTP 客戶端**：Axios
- **圖示**：Lucide React
- **通知系統**：React Hot Toast

## 目錄結構

```
frontend/
├── public/
│   ├── index.html          # HTML 模板
│   └── favicon.ico         # 網站圖示
├── src/
│   ├── components/         # 可重用組件
│   │   ├── Layout.js       # 主要佈局組件
│   │   └── ProtectedRoute.js # 路由保護組件
│   ├── contexts/           # React Context
│   │   └── AuthContext.js  # 認證狀態管理
│   ├── pages/              # 頁面組件
│   │   ├── Login.js        # 登入頁面
│   │   ├── Register.js     # 註冊頁面
│   │   ├── Dashboard.js    # 儀表板
│   │   ├── Lessons.js      # 教案列表
│   │   ├── LessonDetail.js # 教案詳情
│   │   ├── CreateLesson.js # 創建教案
│   │   ├── Knowledge.js    # 知識庫管理
│   │   └── Profile.js      # 個人資料
│   ├── services/           # API 服務
│   │   └── api.js          # API 配置和方法
│   ├── App.js              # 主應用程式組件
│   ├── index.js            # 應用程式入口
│   └── index.css           # 全域樣式
├── package.json            # 專案依賴和腳本
├── tailwind.config.js      # Tailwind 配置
└── postcss.config.js       # PostCSS 配置
```

## 環境需求

- Node.js >= 16.0.0
- npm >= 7.0.0

## 安裝和運行

### 1. 安裝依賴

```bash
cd frontend
npm install
```

### 2. 環境配置

創建 `.env` 文件（可選）：

```bash
# API 基礎 URL（默認為 http://localhost:3001/api/v1）
REACT_APP_API_URL=http://localhost:3001/api/v1
```

### 3. 啟動開發伺服器

```bash
npm start
```

應用程式將在 http://localhost:3000 啟動，並自動開啟瀏覽器。

### 4. 其他指令

```bash
# 建構生產版本
npm run build

# 執行測試
npm test

# 彈出配置文件（不可逆）
npm run eject
```

## API 整合

前端應用程式通過 Axios 與後端 API 通信：

- **基礎 URL**：`http://localhost:3001/api/v1`（可透過環境變數配置）
- **認證**：使用 Bearer Token 進行身份驗證
- **錯誤處理**：自動處理 401 錯誤和 token 過期
- **請求攔截**：自動添加認證 header

## 主要功能

### 用戶認證
- 用戶註冊和登入
- 自動 token 管理
- 路由保護
- 登出功能

### 教案管理
- 查看教案列表（支援搜尋和篩選）
- 創建新教案
- 編輯現有教案
- 教案詳情查看
- 狀態管理（草稿、待審核、已通過、被拒絕）

### 儀表板
- 統計數據展示
- 最近教案列表
- 快速操作連結
- 歡迎訊息

### 響應式設計
- 行動裝置友好
- 平板電腦適配
- 桌面最佳化

## 部署

### 建構生產版本

```bash
npm run build
```

### 部署到靜態伺服器

建構完成後，`build` 資料夾包含優化的生產文件，可以部署到任何靜態檔案伺服器：

- Nginx
- Apache
- Netlify
- Vercel
- GitHub Pages

### Nginx 配置範例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/build;
    index index.html;

    # 處理 React Router 的客戶端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 快取靜態資源
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 開發指南

### 添加新頁面

1. 在 `src/pages/` 創建新的頁面組件
2. 在 `src/App.js` 中添加路由
3. 更新導航選單（如果需要）

### 添加新的 API 端點

1. 在 `src/services/api.js` 中添加新的 API 方法
2. 使用 React Query 進行狀態管理
3. 添加適當的錯誤處理

### 樣式指南

- 使用 Tailwind CSS 類別
- 遵循現有的設計模式
- 確保響應式設計
- 使用語義化的 HTML

## 故障排除

### 常見問題

1. **CORS 錯誤**：確保後端正確配置 CORS
2. **API 連接失敗**：檢查後端服務是否運行在正確的端口
3. **建構失敗**：檢查 Node.js 版本是否符合要求

### 開發工具

- React Developer Tools
- Redux DevTools (如果使用 Redux)
- Network tab 用於 API 除錯

## 授權

MIT License - 詳見 LICENSE 文件。
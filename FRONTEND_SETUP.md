# OSCE 教案開發系統 - 前端設置指南

## 概述

本文檔提供 OSCE 教案開發系統前端的完整設置和運行指南。前端使用 React 框架構建，提供現代化的用戶介面來管理 OSCE 教案。

## 快速開始

### 1. 確認後端服務運行

在啟動前端之前，請確保後端服務正常運行：

```bash
# 在項目根目錄
npm start
```

後端應該在 http://localhost:3001 運行。

### 2. 安裝前端依賴

```bash
cd frontend
npm install
```

### 3. 啟動前端開發伺服器

```bash
npm start
```

前端將在 http://localhost:3000 啟動。

## 系統架構

```
OSCE 教案開發系統
├── 後端 API (localhost:3001)
│   ├── 用戶認證
│   ├── 教案管理
│   ├── AI 服務整合
│   └── 資料庫操作
│
└── 前端 React App (localhost:3000)
    ├── 用戶介面
    ├── 狀態管理
    ├── API 通信
    └── 路由管理
```

## 功能對應

| 功能 | 前端頁面 | 後端 API |
|------|----------|----------|
| 用戶登入 | `/login` | `POST /api/v1/auth/login` |
| 用戶註冊 | `/register` | `POST /api/v1/auth/register` |
| 儀表板 | `/dashboard` | `GET /api/v1/admin/stats` |
| 教案列表 | `/lessons` | `GET /api/v1/lessons` |
| 創建教案 | `/lessons/create` | `POST /api/v1/lessons` |
| 教案詳情 | `/lessons/:id` | `GET /api/v1/lessons/:id` |
| 知識庫 | `/knowledge` | `GET /api/v1/knowledge` |
| 個人資料 | `/profile` | `GET /api/v1/users/profile` |

## 開發流程

### 1. 後端優先開發
- 確保 API 端點正常工作
- 使用 Postman 或類似工具測試 API

### 2. 前端整合
- 實現對應的前端頁面
- 整合 API 調用
- 處理錯誤和載入狀態

### 3. 測試流程
```bash
# 啟動後端
npm start

# 啟動前端（新終端）
cd frontend
npm start

# 訪問 http://localhost:3000 進行測試
```

## 開發技巧

### API 調用範例

```javascript
// 在前端組件中
import { lessonAPI } from '../services/api';
import { useQuery } from 'react-query';

const LessonList = () => {
  const { data, isLoading, error } = useQuery('lessons', lessonAPI.getAll);

  if (isLoading) return <div>載入中...</div>;
  if (error) return <div>錯誤：{error.message}</div>;

  return (
    <div>
      {data?.data?.map(lesson => (
        <div key={lesson.id}>{lesson.title}</div>
      ))}
    </div>
  );
};
```

### 認證狀態管理

```javascript
// 使用 AuthContext
import { useAuth } from '../contexts/AuthContext';

const SomeComponent = () => {
  const { user, login, logout, isAuthenticated } = useAuth();

  // 使用認證狀態
};
```

## 常見問題

### 1. CORS 錯誤
如果遇到 CORS 錯誤，檢查後端的 CORS 配置：

```javascript
// backend/src/server.js
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
```

### 2. API 請求失敗
檢查以下項目：
- 後端服務是否運行
- API 端點 URL 是否正確
- 認證 token 是否有效

### 3. 頁面載入錯誤
確保所有必要的組件都已正確匯出和匯入。

## 部署準備

### 1. 環境變數配置

創建 `.env` 文件：
```bash
cp .env.example .env
```

修改 API URL 為生產環境地址：
```
REACT_APP_API_URL=https://your-api-domain.com/api/v1
```

### 2. 建構生產版本

```bash
npm run build
```

### 3. 部署到伺服器

將 `build` 資料夾中的文件部署到 Web 伺服器。

## 後續開發

前端目前實現了基本架構和主要頁面，以下功能待完善：

1. **教案創建頁面**：完整的表單和 AI 整合
2. **教案詳情頁面**：詳細內容展示和編輯功能
3. **知識庫管理**：文件上傳和組織功能
4. **用戶管理**：管理員功能（如果需要）
5. **報告和統計**：更詳細的數據可視化

每個功能都可以參考現有頁面的實現模式進行開發。
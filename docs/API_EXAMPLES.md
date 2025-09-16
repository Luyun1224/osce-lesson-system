# OSCE教案系統 API 使用範例

本文檔提供OSCE教案開發系統各個API端點的詳細使用範例。

## 目錄

1. [認證系統](#認證系統)
2. [用戶管理](#用戶管理)
3. [OSCE知識庫](#osce知識庫)
4. [教案管理](#教案管理)
5. [管理員功能](#管理員功能)

## 基本設定

```javascript
const API_BASE_URL = 'http://localhost:3000/api/v1';

// 設置認證headers
const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
};
```

## 認證系統

### 用戶註冊

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dr_chen",
    "email": "chen@hospital.com",
    "password": "SecurePassword123!",
    "fullName": "陳醫師",
    "gradeLevel": "R2",
    "specialty": "內科",
    "hospital": "台大醫院"
  }'
```

**回應範例：**
```json
{
  "success": true,
  "message": "註冊成功",
  "data": {
    "user": {
      "id": 1,
      "username": "dr_chen",
      "email": "chen@hospital.com",
      "fullName": "陳醫師",
      "gradeLevel": "R2",
      "specialty": "內科",
      "role": "student"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 用戶登入

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dr_chen",
    "password": "SecurePassword123!"
  }'
```

### 獲取當前用戶資訊

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 用戶管理

### 獲取個人資料

```bash
curl -X GET http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "dr_chen",
      "gradeLevel": "R2",
      "gradeDisplayName": "專科住院醫師第二年",
      "difficultyLevel": 4,
      "medicalTerminologyLevel": 4,
      "specialty": "內科",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 更新個人資料

```bash
curl -X PUT http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "陳大明醫師",
    "specialty": "心臟內科",
    "hospital": "台大醫院心臟內科"
  }'
```

### 獲取用戶統計

```bash
curl -X GET http://localhost:3000/api/v1/users/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalLessonsGenerated": 25,
      "approvedLessons": 20,
      "lessonsThisMonth": 8,
      "favoriteLessons": 5,
      "avgQualityScore": "0.87"
    }
  }
}
```

## OSCE知識庫

### 獲取科目分類

```bash
curl -X GET http://localhost:3000/api/v1/knowledge/subjects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "subjects": [
      {
        "id": 1,
        "code": "IM001",
        "name": "內科學",
        "category": "內科",
        "knowledgeCount": 45,
        "avgDifficulty": "3.2"
      }
    ],
    "groupedSubjects": {
      "內科": [...],
      "外科": [...],
      "急診科": [...]
    }
  }
}
```

### 搜索知識庫

```bash
# 基本搜索
curl -X GET "http://localhost:3000/api/v1/knowledge/search?query=心肌梗塞" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 進階搜索
curl -X GET "http://localhost:3000/api/v1/knowledge/search?query=糖尿病&contentType=disease&difficultyLevel=3&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "knowledge": [
      {
        "id": 1,
        "title": "急性心肌梗塞診斷與處置",
        "contentType": "disease",
        "difficultyLevel": 4,
        "keywords": ["心肌梗塞", "STEMI", "胸痛"],
        "clinicalPresentation": "胸痛、冷汗、噁心嘔吐",
        "nationalExamFrequency": 85,
        "subject": {
          "code": "IM001",
          "name": "內科學",
          "category": "內科"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCount": 25,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 獲取知識點詳情

```bash
curl -X GET http://localhost:3000/api/v1/knowledge/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 獲取職級推薦知識點

```bash
curl -X GET "http://localhost:3000/api/v1/knowledge/recommendations/for-grade?gradeLevel=R2&limit=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": 1,
        "title": "急性心肌梗塞診斷與處置",
        "difficultyLevel": 4,
        "nationalExamFrequency": 85,
        "relevanceScore": "0.92",
        "subject": {
          "name": "內科學",
          "category": "內科"
        }
      }
    ],
    "gradeLevel": "R2",
    "maxDifficulty": 4
  }
}
```

## 教案管理

### 獲取教案模板列表

```bash
# 獲取所有模板
curl -X GET http://localhost:3000/api/v1/lessons/templates \
  -H "Authorization: Bearer YOUR_TOKEN"

# 根據科目和職級篩選
curl -X GET "http://localhost:3000/api/v1/lessons/templates?subjectId=1&gradeLevel=R2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": 1,
        "name": "內科疾病診療模板",
        "gradeLevels": ["PGY1", "PGY2", "R1"],
        "defaultDuration": 30,
        "templateStructure": {
          "sections": [
            {
              "name": "病史詢問",
              "duration": 8,
              "key_points": ["主訴", "現病史", "過去病史"]
            }
          ]
        },
        "assessmentWeight": {
          "history": 30,
          "examination": 35,
          "diagnosis": 20,
          "treatment": 15
        },
        "usageCount": 45,
        "subject": {
          "name": "內科學",
          "category": "內科"
        }
      }
    ]
  }
}
```

### 生成新教案

```bash
curl -X POST http://localhost:3000/api/v1/lessons/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": 1,
    "knowledgeBaseId": 1,
    "specialty": "心臟內科",
    "customInstructions": "請重點強調心電圖判讀",
    "targetGradeLevel": "R2"
  }'
```

**回應範例：**
```json
{
  "success": true,
  "message": "教案生成成功",
  "data": {
    "lesson": {
      "id": 15,
      "gradeLevel": "R2",
      "generatedContent": {
        "title": "急性心肌梗塞診斷與處置 - R2級教案",
        "objective": ["掌握心電圖判讀", "熟悉急診處置流程"],
        "scenario": {
          "patientInfo": "55歲男性，突發胸痛2小時",
          "clinicalPresentation": "胸痛、冷汗、噁心嘔吐",
          "setting": "急診科"
        },
        "tasks": [...],
        "timeAllocation": 30
      },
      "qualityScore": "0.89",
      "generationTimeSeconds": 3,
      "createdAt": "2024-01-15T14:30:00Z"
    }
  }
}
```

### 獲取教案列表

```bash
# 獲取個人教案
curl -X GET "http://localhost:3000/api/v1/lessons?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 篩選特定狀態的教案
curl -X GET "http://localhost:3000/api/v1/lessons?status=approved&gradeLevel=R2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 獲取教案詳情

```bash
curl -X GET http://localhost:3000/api/v1/lessons/15 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "lesson": {
      "id": 15,
      "gradeLevel": "R2",
      "specialty": "心臟內科",
      "generationParams": {
        "customInstructions": "請重點強調心電圖判讀"
      },
      "generatedContent": {...},
      "status": "approved",
      "qualityScore": "0.89",
      "template": {
        "name": "內科疾病診療模板",
        "structure": {...}
      },
      "knowledge": {
        "title": "急性心肌梗塞診斷與處置",
        "contentType": "disease",
        "difficultyLevel": 4
      },
      "reviews": [
        {
          "reviewerType": "human_instructor",
          "overallQualityScore": "0.91",
          "reviewFeedback": "內容詳實，適合R2級別",
          "approvalStatus": "approved",
          "reviewedAt": "2024-01-15T15:00:00Z"
        }
      ],
      "createdAt": "2024-01-15T14:30:00Z"
    }
  }
}
```

### 審核教案（需要instructor或admin權限）

```bash
curl -X POST http://localhost:3000/api/v1/lessons/15/review \
  -H "Authorization: Bearer YOUR_INSTRUCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medicalAccuracyScore": 0.95,
    "gradeAppropriatenessScore": 0.90,
    "learningObjectiveScore": 0.88,
    "overallQualityScore": 0.91,
    "reviewFeedback": "內容準確，適合目標職級，建議補充更多實際案例",
    "suggestions": "可以增加心電圖判讀的實際案例練習",
    "approvalStatus": "approved"
  }'
```

## 管理員功能

### 獲取系統統計（需要admin權限）

```bash
curl -X GET http://localhost:3000/api/v1/admin/dashboard-stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**回應範例：**
```json
{
  "success": true,
  "data": {
    "userStats": {
      "totalUsers": 156,
      "activeUsers": 142,
      "newUsersThisMonth": 23
    },
    "lessonStats": {
      "totalLessons": 1250,
      "approvedLessons": 1089,
      "lessonsThisWeek": 45,
      "avgQualityScore": "0.84"
    },
    "gradeDistribution": [
      {
        "gradeLevel": "R2",
        "userCount": 35
      },
      {
        "gradeLevel": "R1",
        "userCount": 28
      }
    ],
    "performanceStats": {
      "avgGenerationTime": "2.45",
      "generationsToday": 67
    }
  }
}
```

### 獲取職級配置

```bash
curl -X GET http://localhost:3000/api/v1/admin/grade-configs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 更新職級配置

```bash
curl -X PUT http://localhost:3000/api/v1/admin/grade-configs/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gradeLevel": "R3",
    "displayName": "專科住院醫師第三年",
    "difficultyLevel": 4,
    "medicalTerminologyLevel": 4,
    "caseComplexityLevel": 4,
    "assessmentDepthLevel": 4,
    "description": "專科訓練第三年，高階臨床技能"
  }'
```

## 錯誤處理

### 常見錯誤回應格式

```json
{
  "success": false,
  "error": {
    "message": "認證令牌已過期",
    "type": "AUTHENTICATION_ERROR"
  },
  "timestamp": "2024-01-15T14:30:00Z",
  "path": "/api/v1/lessons/generate"
}
```

### 驗證錯誤範例

```json
{
  "success": false,
  "error": {
    "message": "資料驗證失敗",
    "details": [
      "\"gradeLevel\" must be one of [UGY, PGY1, PGY2, R1, R2, R3, R4, R5]",
      "\"password\" must be at least 8 characters long"
    ]
  }
}
```

### 限流錯誤範例

```json
{
  "success": false,
  "error": {
    "message": "請求次數超過限制，請稍後再試",
    "retryAfter": 60,
    "type": "RATE_LIMIT_EXCEEDED"
  }
}
```

## JavaScript SDK 範例

```javascript
class OSCEAPIClient {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async request(method, endpoint, data = null) {
    const url = `${this.baseURL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    return await response.json();
  }

  // 用戶相關
  async getProfile() {
    return this.request('GET', '/users/profile');
  }

  async updateProfile(profileData) {
    return this.request('PUT', '/users/profile', profileData);
  }

  // 知識庫相關
  async searchKnowledge(query, options = {}) {
    const params = new URLSearchParams({
      query,
      ...options
    });
    return this.request('GET', `/knowledge/search?${params}`);
  }

  // 教案相關
  async generateLesson(templateId, knowledgeBaseId, options = {}) {
    return this.request('POST', '/lessons/generate', {
      templateId,
      knowledgeBaseId,
      ...options
    });
  }

  async getLessons(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request('GET', `/lessons?${params}`);
  }
}

// 使用範例
const client = new OSCEAPIClient('http://localhost:3000/api/v1', 'YOUR_TOKEN');

// 搜索知識點
const knowledgeResults = await client.searchKnowledge('心肌梗塞', {
  contentType: 'disease',
  page: 1,
  limit: 10
});

// 生成教案
const newLesson = await client.generateLesson(1, 1, {
  specialty: '心臟內科',
  customInstructions: '重點強調急診處置'
});
```

## 注意事項

1. **認證令牌**：所有API（除了註冊和登入）都需要有效的JWT令牌
2. **限流機制**：API有請求頻率限制，請合理控制請求頻率
3. **資料驗證**：請確保提交的資料符合API規範
4. **錯誤處理**：請妥善處理API回應的錯誤訊息
5. **版本管理**：API使用版本號（v1），未來可能會有版本更新

## 支援

如有API使用問題，請：
1. 檢查[系統文檔](../README.md)
2. 查看錯誤日誌
3. 聯繫開發團隊
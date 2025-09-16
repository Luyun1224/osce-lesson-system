const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

let authToken = '';
let testUserId = '';

// API測試工具
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000
});

// 請求攔截器，自動添加認證token
apiClient.interceptors.request.use(
    config => {
        if (authToken) {
            config.headers.Authorization = `Bearer ${authToken}`;
        }
        return config;
    },
    error => Promise.reject(error)
);

const logger = {
    info: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.error(`❌ ${msg}`),
    warn: (msg) => console.warn(`⚠️  ${msg}`),
    success: (msg) => console.log(`🎉 ${msg}`)
};

// 測試函數集
const tests = {
    // 測試健康檢查
    async testHealth() {
        try {
            const response = await axios.get(`${API_BASE_URL.replace('/api/v1', '')}/health`);
            logger.info(`健康檢查: ${response.data.status}`);
            return true;
        } catch (error) {
            logger.error(`健康檢查失敗: ${error.message}`);
            return false;
        }
    },

    // 測試用戶註冊
    async testUserRegistration() {
        try {
            const testUser = {
                username: `test_user_${Date.now()}`,
                email: `test_${Date.now()}@example.com`,
                password: 'TestPassword123!',
                fullName: '測試用戶',
                gradeLevel: 'PGY1',
                specialty: '內科',
                hospital: '測試醫院'
            };

            const response = await apiClient.post('/auth/register', testUser);
            authToken = response.data.data.token;
            testUserId = response.data.data.user.id;
            
            logger.success(`用戶註冊成功: ${testUser.username}`);
            return true;
        } catch (error) {
            logger.error(`用戶註冊失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試用戶登入
    async testUserLogin() {
        try {
            // 先創建一個測試用戶
            const testUser = {
                username: `login_test_${Date.now()}`,
                email: `login_test_${Date.now()}@example.com`,
                password: 'LoginTest123!',
                fullName: '登入測試用戶',
                gradeLevel: 'R1'
            };

            await apiClient.post('/auth/register', testUser);

            // 測試登入
            const loginResponse = await apiClient.post('/auth/login', {
                username: testUser.username,
                password: testUser.password
            });

            logger.success(`用戶登入成功: ${testUser.username}`);
            return true;
        } catch (error) {
            logger.error(`用戶登入失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試獲取用戶資料
    async testUserProfile() {
        try {
            const response = await apiClient.get('/auth/me');
            logger.info(`用戶資料: ${response.data.data.user.username} (${response.data.data.user.gradeLevel})`);
            return true;
        } catch (error) {
            logger.error(`獲取用戶資料失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試OSCE科目查詢
    async testOSCESubjects() {
        try {
            const response = await apiClient.get('/knowledge/subjects');
            const subjects = response.data.data.subjects;
            logger.info(`OSCE科目數量: ${subjects.length}`);
            
            if (subjects.length > 0) {
                logger.info(`範例科目: ${subjects[0].name} (${subjects[0].category})`);
            }
            return true;
        } catch (error) {
            logger.error(`獲取OSCE科目失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試知識庫搜索
    async testKnowledgeSearch() {
        try {
            const response = await apiClient.get('/knowledge/search?query=心肌梗塞&page=1&limit=5');
            const knowledge = response.data.data.knowledge;
            logger.info(`知識庫搜索結果: ${knowledge.length} 筆`);
            
            if (knowledge.length > 0) {
                logger.info(`範例知識點: ${knowledge[0].title} (難度: ${knowledge[0].difficultyLevel})`);
            }
            return true;
        } catch (error) {
            logger.error(`知識庫搜索失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試教案模板查詢
    async testLessonTemplates() {
        try {
            const response = await apiClient.get('/lessons/templates');
            const templates = response.data.data.templates;
            logger.info(`教案模板數量: ${templates.length}`);
            
            if (templates.length > 0) {
                const template = templates[0];
                logger.info(`範例模板: ${template.name} (適用職級: ${template.gradeLevels.join(', ')})`);
            }
            return true;
        } catch (error) {
            logger.error(`獲取教案模板失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試教案生成（模擬）
    async testLessonGeneration() {
        try {
            // 先獲取模板和知識點
            const [templatesResponse, knowledgeResponse] = await Promise.all([
                apiClient.get('/lessons/templates'),
                apiClient.get('/knowledge/search?limit=1')
            ]);

            const templates = templatesResponse.data.data.templates;
            const knowledge = knowledgeResponse.data.data.knowledge;

            if (templates.length === 0 || knowledge.length === 0) {
                logger.warn('沒有可用的模板或知識點進行教案生成測試');
                return true;
            }

            const template = templates[0];
            const knowledgeItem = knowledge[0];

            const generationRequest = {
                templateId: template.id,
                knowledgeBaseId: knowledgeItem.id,
                specialty: '測試專科',
                customInstructions: '這是一個API測試生成的教案'
            };

            const response = await apiClient.post('/lessons/generate', generationRequest);
            const lesson = response.data.data.lesson;

            logger.success(`教案生成成功: ID ${lesson.id} (品質分數: ${lesson.qualityScore})`);
            return true;
        } catch (error) {
            logger.error(`教案生成失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試獲取統計資訊
    async testUserStats() {
        try {
            const response = await apiClient.get('/users/stats');
            const stats = response.data.data.stats;
            logger.info(`用戶統計: 生成 ${stats.totalLessonsGenerated} 個教案，平均品質 ${stats.avgQualityScore}`);
            return true;
        } catch (error) {
            logger.error(`獲取用戶統計失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試知識庫推薦
    async testKnowledgeRecommendations() {
        try {
            const response = await apiClient.get('/knowledge/recommendations/for-grade?limit=3');
            const recommendations = response.data.data.recommendations;
            logger.info(`知識推薦數量: ${recommendations.length} 筆`);
            
            if (recommendations.length > 0) {
                const rec = recommendations[0];
                logger.info(`推薦知識點: ${rec.title} (相關度: ${rec.relevanceScore})`);
            }
            return true;
        } catch (error) {
            logger.error(`獲取知識推薦失敗: ${error.response?.data?.error?.message || error.message}`);
            return false;
        }
    },

    // 測試限流機制
    async testRateLimit() {
        try {
            logger.info('測試限流機制 (連續發送請求)...');
            
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(apiClient.get('/knowledge/subjects'));
            }

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            logger.info(`限流測試結果: 成功 ${successful} 次，失敗 ${failed} 次`);
            return true;
        } catch (error) {
            logger.error(`限流測試失敗: ${error.message}`);
            return false;
        }
    }
};

// 主測試流程
async function runAPITests() {
    logger.info('開始 OSCE 教案系統 API 測試...\n');

    const testResults = [];
    
    // 執行所有測試
    for (const [testName, testFunc] of Object.entries(tests)) {
        try {
            logger.info(`執行測試: ${testName}`);
            const result = await testFunc();
            testResults.push({ name: testName, success: result });
            
            if (result) {
                logger.success(`✅ ${testName} 測試通過\n`);
            } else {
                logger.error(`❌ ${testName} 測試失敗\n`);
            }
        } catch (error) {
            logger.error(`❌ ${testName} 測試異常: ${error.message}\n`);
            testResults.push({ name: testName, success: false });
        }

        // 測試間暫停，避免限流
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 測試摘要
    const successful = testResults.filter(r => r.success).length;
    const total = testResults.length;

    logger.info('='.repeat(50));
    logger.info(`測試完成: ${successful}/${total} 個測試通過`);
    
    if (successful === total) {
        logger.success('🎉 所有API測試都通過了！系統運行正常。');
    } else {
        logger.warn(`⚠️  有 ${total - successful} 個測試失敗，請檢查系統狀態。`);
    }

    logger.info('='.repeat(50));
}

// 如果直接執行此文件
if (require.main === module) {
    runAPITests().catch(error => {
        logger.error(`測試執行失敗: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { runAPITests, tests };
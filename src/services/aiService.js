const OpenAI = require('openai');
const axios = require('axios');
const logger = require('../utils/logger');
const database = require('../config/database');

/**
 * AI服務整合層 - 支援多種AI模型
 * 負責與OpenAI GPT、Claude API等外部AI服務的整合
 */
class AIService {
    constructor() {
        // OpenAI 客戶端初始化 (僅在有API密鑰時)
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        } else {
            this.openai = null;
            logger.warn('OpenAI API密鑰未配置，OpenAI功能將不可用');
        }

        // Claude API 配置
        if (process.env.CLAUDE_API_KEY) {
            this.claudeConfig = {
                baseURL: 'https://api.anthropic.com/v1',
                headers: {
                    'x-api-key': process.env.CLAUDE_API_KEY,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                }
            };
        } else {
            this.claudeConfig = null;
            logger.warn('Claude API密鑰未配置，Claude功能將不可用');
        }

        // AI模型配置
        this.modelConfigs = {
            'gpt-4': {
                service: 'openai',
                maxTokens: 4000,
                temperature: 0.7,
                capabilities: ['lesson_generation', 'content_review', 'difficulty_assessment']
            },
            'gpt-3.5-turbo': {
                service: 'openai',
                maxTokens: 3000,
                temperature: 0.6,
                capabilities: ['lesson_generation', 'content_review']
            },
            'claude-3-sonnet': {
                service: 'claude',
                maxTokens: 4000,
                temperature: 0.7,
                capabilities: ['lesson_generation', 'content_review', 'medical_validation']
            },
            'claude-3-haiku': {
                service: 'claude',
                maxTokens: 2000,
                temperature: 0.6,
                capabilities: ['content_review', 'difficulty_assessment']
            }
        };
    }

    /**
     * 獲取可用的AI模型
     */
    getAvailableModels() {
        return Object.entries(this.modelConfigs).map(([name, config]) => ({
            name,
            service: config.service,
            capabilities: config.capabilities,
            maxTokens: config.maxTokens
        }));
    }

    /**
     * 選擇最佳AI模型
     * @param {string} task - 任務類型
     * @param {object} options - 選項
     */
    selectBestModel(task, options = {}) {
        const { priority = 'quality', complexity = 'medium' } = options;

        // 根據任務和優先級選擇模型
        if (task === 'lesson_generation') {
            if (priority === 'quality' && complexity === 'high') {
                return 'gpt-4';
            } else if (priority === 'speed') {
                return 'gpt-3.5-turbo';
            } else {
                return 'claude-3-sonnet';
            }
        } else if (task === 'medical_validation') {
            return 'claude-3-sonnet';
        } else if (task === 'content_review') {
            return 'claude-3-haiku';
        }

        return 'gpt-3.5-turbo'; // 預設模型
    }

    /**
     * 調用OpenAI API
     */
    async callOpenAI(model, prompt, options = {}) {
        try {
            const config = this.modelConfigs[model];
            if (!config || config.service !== 'openai') {
                throw new Error(`Invalid OpenAI model: ${model}`);
            }

            const response = await this.openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: options.systemPrompt || 'You are a helpful medical education assistant.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: options.maxTokens || config.maxTokens,
                temperature: options.temperature || config.temperature,
                top_p: options.topP || 0.9,
                presence_penalty: options.presencePenalty || 0,
                frequency_penalty: options.frequencyPenalty || 0
            });

            return {
                content: response.choices[0].message.content,
                usage: response.usage,
                model: response.model,
                finishReason: response.choices[0].finish_reason
            };
        } catch (error) {
            logger.error('OpenAI API調用失敗:', error);
            throw error;
        }
    }

    /**
     * 調用Claude API
     */
    async callClaude(model, prompt, options = {}) {
        try {
            const config = this.modelConfigs[model];
            if (!config || config.service !== 'claude') {
                throw new Error(`Invalid Claude model: ${model}`);
            }

            const requestBody = {
                model: model,
                max_tokens: options.maxTokens || config.maxTokens,
                temperature: options.temperature || config.temperature,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            if (options.systemPrompt) {
                requestBody.system = options.systemPrompt;
            }

            const response = await axios.post(
                `${this.claudeConfig.baseURL}/messages`,
                requestBody,
                { headers: this.claudeConfig.headers }
            );

            return {
                content: response.data.content[0].text,
                usage: response.data.usage,
                model: response.data.model,
                stopReason: response.data.stop_reason
            };
        } catch (error) {
            logger.error('Claude API調用失敗:', error);
            throw error;
        }
    }

    /**
     * 統一AI調用介面
     */
    async callAI(model, prompt, options = {}) {
        const startTime = Date.now();
        
        // 檢查是否使用模擬模式
        if (process.env.MOCK_AI_RESPONSES === 'true') {
            logger.info('使用模擬AI響應模式');
            return this.generateMockResponse(model, prompt, options);
        }
        
        try {
            const config = this.modelConfigs[model];
            if (!config) {
                throw new Error(`Unknown AI model: ${model}`);
            }

            let result;
            if (config.service === 'openai') {
                result = await this.callOpenAI(model, prompt, options);
            } else if (config.service === 'claude') {
                result = await this.callClaude(model, prompt, options);
            } else {
                throw new Error(`Unsupported AI service: ${config.service}`);
            }

            const duration = Date.now() - startTime;

            // 記錄API使用情況
            logger.info('AI API調用成功:', {
                model,
                service: config.service,
                duration: `${duration}ms`,
                tokensUsed: result.usage?.total_tokens || 'unknown',
                promptLength: prompt.length
            });

            return {
                ...result,
                duration,
                service: config.service
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            
            logger.error('AI API調用失敗:', {
                model,
                duration: `${duration}ms`,
                error: error.message,
                promptLength: prompt.length
            });

            // 如果主要模型失敗，嘗試備用模型
            if (options.useFailover && !options._isFailover) {
                const failoverModel = this.getFailoverModel(model);
                if (failoverModel) {
                    logger.info(`嘗試備用模型: ${failoverModel}`);
                    return this.callAI(failoverModel, prompt, {
                        ...options,
                        useFailover: false,
                        _isFailover: true
                    });
                }
            }

            throw error;
        }
    }

    /**
     * 獲取備用模型
     */
    getFailoverModel(primaryModel) {
        const failoverMap = {
            'gpt-4': 'gpt-3.5-turbo',
            'claude-3-sonnet': 'claude-3-haiku',
            'gpt-3.5-turbo': 'claude-3-haiku',
            'claude-3-haiku': 'gpt-3.5-turbo'
        };
        return failoverMap[primaryModel];
    }

    /**
     * 批量調用AI（用於並行處理）
     */
    async batchCallAI(requests, options = {}) {
        const { maxConcurrency = 3, retryAttempts = 2 } = options;
        
        const results = [];
        
        // 分批處理請求
        for (let i = 0; i < requests.length; i += maxConcurrency) {
            const batch = requests.slice(i, i + maxConcurrency);
            
            const batchPromises = batch.map(async (request, index) => {
                let attempts = 0;
                
                while (attempts < retryAttempts) {
                    try {
                        const result = await this.callAI(
                            request.model,
                            request.prompt,
                            request.options || {}
                        );
                        
                        return {
                            index: i + index,
                            success: true,
                            result,
                            request
                        };
                    } catch (error) {
                        attempts++;
                        
                        if (attempts >= retryAttempts) {
                            return {
                                index: i + index,
                                success: false,
                                error: error.message,
                                request
                            };
                        }
                        
                        // 指數退避
                        await new Promise(resolve => 
                            setTimeout(resolve, Math.pow(2, attempts) * 1000)
                        );
                    }
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // 批次間暫停，避免超過速率限制
            if (i + maxConcurrency < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return results;
    }

    /**
     * 估算token使用量
     */
    estimateTokenUsage(text) {
        // 簡單估算：英文約4個字符=1個token，中文約1.5個字符=1個token
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        
        return Math.ceil(chineseChars / 1.5 + otherChars / 4);
    }

    /**
     * 檢查API可用性
     */
    async healthCheck() {
        const results = {};
        
        // 檢查OpenAI
        if (process.env.OPENAI_API_KEY) {
            try {
                await this.callOpenAI('gpt-3.5-turbo', 'Health check', {
                    maxTokens: 10
                });
                results.openai = { status: 'healthy', timestamp: new Date() };
            } catch (error) {
                results.openai = { 
                    status: 'unhealthy', 
                    error: error.message,
                    timestamp: new Date()
                };
            }
        } else {
            results.openai = { status: 'not_configured' };
        }
        
        // 檢查Claude
        if (process.env.CLAUDE_API_KEY) {
            try {
                await this.callClaude('claude-3-haiku', 'Health check', {
                    maxTokens: 10
                });
                results.claude = { status: 'healthy', timestamp: new Date() };
            } catch (error) {
                results.claude = { 
                    status: 'unhealthy', 
                    error: error.message,
                    timestamp: new Date()
                };
            }
        } else {
            results.claude = { status: 'not_configured' };
        }
        
        return results;
    }

    /**
     * 獲取使用統計
     */
    async getUsageStats(timeRange = '24h') {
        try {
            let timeCondition;
            switch (timeRange) {
                case '1h':
                    timeCondition = "created_at >= NOW() - INTERVAL '1 hour'";
                    break;
                case '24h':
                    timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
                    break;
                case '7d':
                    timeCondition = "created_at >= NOW() - INTERVAL '7 days'";
                    break;
                case '30d':
                    timeCondition = "created_at >= NOW() - INTERVAL '30 days'";
                    break;
                default:
                    timeCondition = "created_at >= NOW() - INTERVAL '24 hours'";
            }

            const result = await database.query(`
                SELECT 
                    ai_model_used,
                    COUNT(*) as request_count,
                    AVG(generation_time_seconds) as avg_generation_time,
                    AVG(quality_score) as avg_quality_score,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
                FROM ai_lesson_generations 
                WHERE ${timeCondition}
                GROUP BY ai_model_used
                ORDER BY request_count DESC
            `);

            return result.rows.map(row => ({
                model: row.ai_model_used,
                requestCount: parseInt(row.request_count),
                avgGenerationTime: parseFloat(row.avg_generation_time || 0).toFixed(2),
                avgQualityScore: parseFloat(row.avg_quality_score || 0).toFixed(2),
                approvedCount: parseInt(row.approved_count),
                approvalRate: (parseInt(row.approved_count) / parseInt(row.request_count) * 100).toFixed(1)
            }));

        } catch (error) {
            logger.error('獲取AI使用統計失敗:', error);
            throw error;
        }
    }

    /**
     * 生成模擬AI響應（用於測試和沒有API密鑰時）
     */
    generateMockResponse(model, prompt, options = {}) {
        const duration = Math.random() * 2000 + 500; // 500-2500ms隨機延遲
        
        // 基於提示詞類型生成不同的模擬響應
        let content = '';
        
        if (prompt.includes('醫學') || prompt.includes('medical')) {
            content = `這是一個基於${model}模型的模擬醫學內容響應。

**診斷要點：**
- 根據病史和症狀進行初步評估
- 進行必要的身體檢查
- 安排適當的輔助檢查

**治療建議：**
- 採用循證醫學指導原則
- 個體化治療方案
- 定期追蹤評估療效

**注意事項：**
- 此為模擬內容，僅供測試使用
- 實際臨床應用需諮詢專業醫師
- 模擬評分：85分

*本內容由AI模擬系統生成，非真實AI服務響應*`;
        } else if (prompt.includes('教案') || prompt.includes('lesson')) {
            content = `# OSCE教案生成結果

## 學習目標
- 掌握基礎臨床技能
- 提升診斷思維能力
- 加強溝通技巧

## 教學內容
1. **理論基礎**
   - 相關醫學知識回顧
   - 重點概念解析

2. **實踐操作**
   - 標準化操作流程
   - 常見錯誤預防

3. **案例分析**
   - 典型病例討論
   - 鑑別診斷要點

## 評估標準
- 理論知識：30%
- 操作技能：40%
- 溝通能力：30%

**模擬品質評分：88分**
*模擬內容生成時間：${Math.round(duration)}ms*`;
        } else {
            content = `基於${model}的模擬響應內容。

這是一個測試用的模擬AI響應，用於在沒有真實API密鑰時演示系統功能。

**模擬參數：**
- 模型：${model}
- 處理時間：${Math.round(duration)}ms
- 品質評分：${80 + Math.round(Math.random() * 15)}分

實際使用時請配置真實的AI服務API密鑰以獲得完整功能。`;
        }

        return Promise.resolve({
            content,
            usage: {
                total_tokens: Math.round(content.length / 4),
                prompt_tokens: Math.round(prompt.length / 4),
                completion_tokens: Math.round(content.length / 4) - Math.round(prompt.length / 4)
            },
            duration: Math.round(duration),
            model,
            service: 'mock'
        });
    }
}

// 單例模式
const aiService = new AIService();

module.exports = aiService;
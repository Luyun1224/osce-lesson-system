const express = require('express');
const Joi = require('joi');
const { authenticateToken, requireRole } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const aiService = require('../services/aiService');
const lessonGenerator = require('../services/lessonGenerator');
const difficultyEngine = require('../services/difficultyEngine');
const reviewWorkflow = require('../services/reviewWorkflow');
const medicalValidator = require('../services/medicalValidator');
const lessonQualityAssessment = require('../services/lessonQualityAssessment');
const database = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要驗證和AI專用限流
router.use(authenticateToken);
router.use(rateLimiter.ai);

// 驗證schemas
const generateLessonSchema = Joi.object({
    templateId: Joi.number().integer().required(),
    knowledgeBaseId: Joi.number().integer().required(),
    specialty: Joi.string().min(2).max(50).optional(),
    customInstructions: Joi.string().max(1000).optional(),
    targetGradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').optional(),
    aiModel: Joi.string().valid('gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet', 'claude-3-haiku').optional(),
    priority: Joi.string().valid('quality', 'speed').default('quality')
});

const batchGenerateSchema = Joi.object({
    requests: Joi.array().items(generateLessonSchema).min(1).max(5).required(),
    maxConcurrency: Joi.number().integer().min(1).max(3).default(2)
});

const difficultyAnalysisSchema = Joi.object({
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').required(),
    specialty: Joi.string().optional(),
    contentType: Joi.string().valid('disease', 'procedure', 'examination', 'skill').optional(),
    knowledgeBaseId: Joi.number().integer().optional()
});

const reviewSchema = Joi.object({
    lessonId: Joi.number().integer().required(),
    priority: Joi.string().valid('normal', 'urgent').default('normal'),
    reviewType: Joi.string().valid('full', 'medical_only', 'quality_only').default('full')
});

const humanReviewSchema = Joi.object({
    decision: Joi.string().valid('approve', 'reject', 'revision').required(),
    comments: Joi.string().required(),
    revision_notes: Joi.string().optional()
});

// === AI服務狀態和資訊 ===

// 獲取AI服務資訊
router.get('/', async (req, res) => {
    try {
        const availableModels = aiService.getAvailableModels();
        const healthStatus = await aiService.healthCheck();
        
        res.json({
            success: true,
            data: {
                service: 'OSCE AI教案生成服務',
                version: '1.0.0',
                availableModels,
                healthStatus,
                endpoints: {
                    '/generate': 'POST - 生成單個教案',
                    '/batch-generate': 'POST - 批量生成教案',
                    '/difficulty-analysis': 'POST - 分析難度適配',
                    '/models': 'GET - 獲取可用模型',
                    '/usage-stats': 'GET - 使用統計',
                    '/health': 'GET - 健康檢查'
                }
            }
        });
    } catch (error) {
        logger.error('獲取AI服務資訊失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取服務資訊失敗' }
        });
    }
});

// === 教案生成功能 ===

// AI生成教案
router.post('/generate', async (req, res) => {
    try {
        const { error, value } = generateLessonSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '生成參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const generationParams = {
            ...value,
            userId: req.user.id,
            gradeLevel: value.targetGradeLevel || req.user.grade_level
        };

        logger.info('開始AI教案生成:', {
            userId: req.user.id,
            templateId: value.templateId,
            knowledgeBaseId: value.knowledgeBaseId,
            gradeLevel: generationParams.gradeLevel
        });

        // 使用教案生成引擎
        const result = await lessonGenerator.generateLesson(generationParams);

        // 保存到資料庫
        const savedLesson = await database.query(`
            INSERT INTO ai_lesson_generations (
                user_id, template_id, knowledge_base_id, grade_level, specialty,
                generation_params, generated_content, ai_model_used, 
                generation_time_seconds, quality_score, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, created_at
        `, [
            req.user.id,
            value.templateId,
            value.knowledgeBaseId,
            generationParams.gradeLevel,
            value.specialty || req.user.specialty,
            JSON.stringify(generationParams),
            JSON.stringify(result.lessonContent),
            result.metadata.aiModel,
            Math.floor(result.metadata.generationTime / 1000),
            result.metadata.qualityScore,
            'generated'
        ]);

        const lessonId = savedLesson.rows[0].id;

        logger.info('AI教案生成成功:', {
            userId: req.user.id,
            lessonId,
            qualityScore: result.metadata.qualityScore,
            generationTime: result.metadata.generationTime
        });

        res.status(201).json({
            success: true,
            message: '教案生成成功',
            data: {
                lessonId,
                lessonContent: result.lessonContent,
                metadata: {
                    ...result.metadata,
                    savedAt: savedLesson.rows[0].created_at
                }
            }
        });

    } catch (error) {
        logger.error('AI教案生成失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: 'AI教案生成失敗',
                details: error.message
            }
        });
    }
});

// 批量生成教案
router.post('/batch-generate', async (req, res) => {
    try {
        const { error, value } = batchGenerateSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '批量生成參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { requests, maxConcurrency } = value;

        // 添加用戶資訊到每個請求
        const enhancedRequests = requests.map(request => ({
            ...request,
            userId: req.user.id,
            gradeLevel: request.targetGradeLevel || req.user.grade_level
        }));

        logger.info('開始批量生成教案:', {
            userId: req.user.id,
            requestCount: requests.length,
            maxConcurrency
        });

        // 執行批量生成
        const results = await lessonGenerator.batchGenerateLesson(enhancedRequests);

        // 統計結果
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        // 保存成功的結果到資料庫
        const savedResults = [];
        for (const result of results) {
            if (result.success) {
                try {
                    const savedLesson = await database.query(`
                        INSERT INTO ai_lesson_generations (
                            user_id, template_id, knowledge_base_id, grade_level, specialty,
                            generation_params, generated_content, ai_model_used, 
                            generation_time_seconds, quality_score, status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        RETURNING id, created_at
                    `, [
                        req.user.id,
                        result.request.templateId,
                        result.request.knowledgeBaseId,
                        result.request.gradeLevel,
                        result.request.specialty || req.user.specialty,
                        JSON.stringify(result.request),
                        JSON.stringify(result.data.lessonContent),
                        result.data.metadata.aiModel,
                        Math.floor(result.data.metadata.generationTime / 1000),
                        result.data.metadata.qualityScore,
                        'generated'
                    ]);

                    savedResults.push({
                        ...result,
                        lessonId: savedLesson.rows[0].id,
                        savedAt: savedLesson.rows[0].created_at
                    });
                } catch (saveError) {
                    logger.error('保存批量生成結果失敗:', saveError);
                }
            } else {
                savedResults.push(result);
            }
        }

        logger.info('批量生成完成:', {
            userId: req.user.id,
            successful,
            failed,
            total: requests.length
        });

        res.json({
            success: true,
            message: `批量生成完成: ${successful}成功, ${failed}失敗`,
            data: {
                results: savedResults,
                summary: {
                    total: requests.length,
                    successful,
                    failed,
                    successRate: (successful / requests.length * 100).toFixed(1)
                }
            }
        });

    } catch (error) {
        logger.error('批量生成教案失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '批量生成失敗',
                details: error.message
            }
        });
    }
});

// === 難度分析功能 ===

// 分析難度適配
router.post('/difficulty-analysis', async (req, res) => {
    try {
        const { error, value } = difficultyAnalysisSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '難度分析參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { gradeLevel, specialty, contentType, knowledgeBaseId } = value;

        // 獲取用戶學習歷史
        const userHistoryResult = await database.query(`
            SELECT 
                AVG(quality_score) as avg_quality_score,
                COUNT(*) as total_lessons,
                AVG(CASE WHEN created_at >= NOW() - INTERVAL '30 days' 
                    THEN quality_score ELSE NULL END) as recent_performance,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
            FROM ai_lesson_generations 
            WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '90 days'
        `, [req.user.id]);

        const userHistory = {
            avgQualityScore: parseFloat(userHistoryResult.rows[0].avg_quality_score || 0.7),
            totalLessonsCompleted: parseInt(userHistoryResult.rows[0].total_lessons || 0),
            recentPerformance: parseFloat(userHistoryResult.rows[0].recent_performance || 0.7),
            approvalRate: userHistoryResult.rows[0].total_lessons > 0 ? 
                parseInt(userHistoryResult.rows[0].approved_count) / parseInt(userHistoryResult.rows[0].total_lessons) : 0.7
        };

        // 獲取知識點資訊（如果提供）
        let knowledgeContext = null;
        if (knowledgeBaseId) {
            const knowledgeResult = await database.query(
                'SELECT * FROM osce_knowledge_base WHERE id = $1',
                [knowledgeBaseId]
            );
            
            if (knowledgeResult.rows.length > 0) {
                const knowledge = knowledgeResult.rows[0];
                knowledgeContext = {
                    nationalExamFrequency: knowledge.national_exam_frequency,
                    clinicalImportance: knowledge.national_exam_frequency >= 80 ? 'critical' : 
                                       knowledge.national_exam_frequency >= 60 ? 'high' : 'medium',
                    procedureComplexity: knowledge.content_type === 'procedure' && knowledge.difficulty_level >= 4 ? 'high' : 'medium',
                    differentialDiagnosisCount: knowledge.differential_diagnosis?.length || 3
                };
            }
        }

        // 執行難度分析
        const difficultyAnalysis = await difficultyEngine.calculateDynamicDifficulty({
            gradeLevel,
            specialty,
            contentType: contentType || 'disease',
            baseDifficulty: 3, // 預設中等難度
            userHistory,
            knowledgeContext
        });

        // 生成調整建議
        const adjustmentSuggestions = await difficultyEngine.generateDifficultyAdjustmentSuggestions(
            req.user.id,
            [] // 這裡可以傳入更詳細的歷史資料
        );

        res.json({
            success: true,
            data: {
                difficultyAnalysis,
                userPerformance: userHistory,
                adjustmentSuggestions,
                analysisFor: {
                    userId: req.user.id,
                    gradeLevel,
                    specialty,
                    contentType,
                    knowledgeBaseId
                }
            }
        });

    } catch (error) {
        logger.error('難度分析失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '難度分析失敗',
                details: error.message
            }
        });
    }
});

// === 服務管理功能 ===

// 獲取可用模型
router.get('/models', async (req, res) => {
    try {
        const models = aiService.getAvailableModels();
        const healthStatus = await aiService.healthCheck();

        res.json({
            success: true,
            data: {
                models: models.map(model => ({
                    ...model,
                    status: healthStatus[model.service]?.status || 'unknown'
                })),
                recommendedModels: {
                    quality: 'gpt-4',
                    speed: 'gpt-3.5-turbo',
                    medical_accuracy: 'claude-3-sonnet'
                }
            }
        });
    } catch (error) {
        logger.error('獲取模型列表失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取模型列表失敗' }
        });
    }
});

// 獲取使用統計
router.get('/usage-stats', async (req, res) => {
    try {
        const { timeRange = '24h' } = req.query;
        
        const [aiUsageStats, difficultyStats] = await Promise.all([
            aiService.getUsageStats(timeRange),
            difficultyEngine.getDifficultyStatistics(timeRange === '24h' ? '7d' : '30d')
        ]);

        res.json({
            success: true,
            data: {
                timeRange,
                aiUsage: aiUsageStats,
                difficultyStatistics: difficultyStats,
                summary: {
                    totalRequests: aiUsageStats.reduce((sum, stat) => sum + stat.requestCount, 0),
                    avgQualityScore: (aiUsageStats.reduce((sum, stat) => sum + parseFloat(stat.avgQualityScore), 0) / aiUsageStats.length).toFixed(2),
                    avgGenerationTime: (aiUsageStats.reduce((sum, stat) => sum + parseFloat(stat.avgGenerationTime), 0) / aiUsageStats.length).toFixed(2)
                }
            }
        });
    } catch (error) {
        logger.error('獲取使用統計失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取使用統計失敗' }
        });
    }
});

// 健康檢查
router.get('/health', async (req, res) => {
    try {
        const healthStatus = await aiService.healthCheck();
        
        const overallStatus = Object.values(healthStatus).some(service => 
            service.status === 'healthy'
        ) ? 'healthy' : 'degraded';

        res.json({
            success: true,
            data: {
                overallStatus,
                services: healthStatus,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('AI健康檢查失敗:', error);
        res.status(503).json({
            success: false,
            error: { message: 'AI服務健康檢查失敗' },
            data: {
                overallStatus: 'unhealthy',
                timestamp: new Date().toISOString()
            }
        });
    }
});

// === AI審核功能 ===

// 開始教案審核流程
router.post('/review/start', async (req, res) => {
    try {
        const { error, value } = reviewSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '審核參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        // 獲取教案資料
        const lessonResult = await database.query(
            'SELECT * FROM ai_lesson_generations WHERE id = $1 AND user_id = $2',
            [value.lessonId, req.user.id]
        );

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案不存在或無權限訪問' }
            });
        }

        const lessonData = lessonResult.rows[0];
        const context = {
            gradeLevel: lessonData.grade_level,
            specialty: lessonData.specialty,
            userId: req.user.id,
            reviewType: value.reviewType,
            priority: value.priority
        };

        // 開始審核流程
        const reviewResult = await reviewWorkflow.startReviewProcess(lessonData, context);

        logger.info('教案審核開始:', {
            userId: req.user.id,
            lessonId: value.lessonId,
            reviewId: reviewResult.reviewId,
            reviewType: value.reviewType
        });

        res.status(201).json({
            success: true,
            message: '審核流程已開始',
            data: reviewResult
        });

    } catch (error) {
        logger.error('開始教案審核失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '開始審核失敗',
                details: error.message
            }
        });
    }
});

// 僅醫學驗證
router.post('/review/medical-validation', async (req, res) => {
    try {
        const { lessonId } = req.body;
        
        if (!lessonId) {
            return res.status(400).json({
                success: false,
                error: { message: 'lessonId 參數必需' }
            });
        }

        // 獲取教案資料
        const lessonResult = await database.query(
            'SELECT * FROM ai_lesson_generations WHERE id = $1 AND user_id = $2',
            [lessonId, req.user.id]
        );

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案不存在或無權限訪問' }
            });
        }

        const lessonData = lessonResult.rows[0];
        const context = {
            gradeLevel: lessonData.grade_level,
            specialty: lessonData.specialty
        };

        // 執行醫學驗證
        const validationResult = await medicalValidator.validateMedicalContent(lessonData, context);

        logger.info('醫學驗證完成:', {
            userId: req.user.id,
            lessonId,
            overallScore: validationResult.overallScore
        });

        res.json({
            success: true,
            data: validationResult
        });

    } catch (error) {
        logger.error('醫學驗證失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '醫學驗證失敗',
                details: error.message
            }
        });
    }
});

// 僅品質評估
router.post('/review/quality-assessment', async (req, res) => {
    try {
        const { lessonId } = req.body;
        
        if (!lessonId) {
            return res.status(400).json({
                success: false,
                error: { message: 'lessonId 參數必需' }
            });
        }

        // 獲取教案資料
        const lessonResult = await database.query(
            'SELECT * FROM ai_lesson_generations WHERE id = $1 AND user_id = $2',
            [lessonId, req.user.id]
        );

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案不存在或無權限訪問' }
            });
        }

        const lessonData = lessonResult.rows[0];
        const context = {
            gradeLevel: lessonData.grade_level,
            specialty: lessonData.specialty
        };

        // 執行品質評估
        const assessmentResult = await lessonQualityAssessment.assessLessonQuality(lessonData, context);

        logger.info('品質評估完成:', {
            userId: req.user.id,
            lessonId,
            overallScore: assessmentResult.overallScore
        });

        res.json({
            success: true,
            data: assessmentResult
        });

    } catch (error) {
        logger.error('品質評估失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '品質評估失敗',
                details: error.message
            }
        });
    }
});

// 獲取審核狀態
router.get('/review/:reviewId/status', async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        const reviewStatus = await reviewWorkflow.getReviewStatus(reviewId);

        res.json({
            success: true,
            data: reviewStatus
        });

    } catch (error) {
        logger.error('獲取審核狀態失敗:', error);
        res.status(error.message === '審核記錄不存在' ? 404 : 500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// 提交人工審核 (需要管理員或資深用戶權限)
router.post('/review/:reviewId/submit-human-review', requireRole(['admin', 'senior_resident', 'attending']), async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { priority = 'normal' } = req.body;

        const result = await reviewWorkflow.submitForHumanReview(reviewId, priority);

        logger.info('已提交人工審核:', {
            reviewId,
            submittedBy: req.user.id,
            priority
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('提交人工審核失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// 處理人工審核結果 (僅管理員和主治醫師)
router.post('/review/:reviewId/human-decision', requireRole(['admin', 'attending']), async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { error, value } = humanReviewSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '人工審核參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const humanReviewData = {
            ...value,
            reviewer_id: req.user.id
        };

        const result = await reviewWorkflow.processHumanReviewResult(reviewId, humanReviewData);

        logger.info('人工審核結果已處理:', {
            reviewId,
            reviewerId: req.user.id,
            decision: value.decision
        });

        res.json({
            success: true,
            message: `人工審核${value.decision === 'approve' ? '通過' : value.decision === 'reject' ? '拒絕' : '需修訂'}`,
            data: result
        });

    } catch (error) {
        logger.error('處理人工審核結果失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
});

// 獲取審核統計 (管理員權限)
router.get('/review/statistics', requireRole(['admin']), async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        
        const statistics = await reviewWorkflow.getReviewStatistics(timeRange);

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        logger.error('獲取審核統計失敗:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取審核統計失敗' }
        });
    }
});

// 批量審核 (管理員權限)
router.post('/review/batch', requireRole(['admin']), async (req, res) => {
    try {
        const { lessonIds, reviewType = 'full' } = req.body;
        
        if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'lessonIds 必須是非空數組' }
            });
        }

        // 獲取教案資料
        const lessonsResult = await database.query(
            `SELECT * FROM ai_lesson_generations WHERE id = ANY($1)`,
            [lessonIds]
        );

        if (lessonsResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '找不到指定的教案' }
            });
        }

        const lessons = lessonsResult.rows;
        const context = { reviewType, batchMode: true };

        // 執行批量審核
        const batchResult = await reviewWorkflow.batchReview(lessons, context);

        logger.info('批量審核完成:', {
            requestedBy: req.user.id,
            totalLessons: lessonIds.length,
            successful: batchResult.summary.successful
        });

        res.json({
            success: true,
            message: `批量審核完成: ${batchResult.summary.successful}/${batchResult.summary.total} 成功`,
            data: batchResult
        });

    } catch (error) {
        logger.error('批量審核失敗:', error);
        res.status(500).json({
            success: false,
            error: { 
                message: '批量審核失敗',
                details: error.message
            }
        });
    }
});

module.exports = router;
const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要驗證
router.use(authenticateToken);

// 驗證schemas
const lessonSearchSchema = Joi.object({
    query: Joi.string().min(1).max(200).optional(),
    status: Joi.string().valid('generated', 'reviewed', 'approved', 'rejected').optional(),
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').optional(),
    specialty: Joi.string().optional(),
    subjectId: Joi.number().integer().optional(),
    templateId: Joi.number().integer().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
});

const lessonGenerationSchema = Joi.object({
    templateId: Joi.number().integer().required(),
    knowledgeBaseId: Joi.number().integer().required(),
    specialty: Joi.string().min(2).max(50).optional(),
    customInstructions: Joi.string().max(1000).optional(),
    targetGradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').optional()
});

const lessonReviewSchema = Joi.object({
    medicalAccuracyScore: Joi.number().min(0).max(1).required(),
    gradeAppropriatenessScore: Joi.number().min(0).max(1).required(),
    learningObjectiveScore: Joi.number().min(0).max(1).required(),
    overallQualityScore: Joi.number().min(0).max(1).required(),
    reviewFeedback: Joi.string().max(2000).optional(),
    suggestions: Joi.string().max(2000).optional(),
    approvalStatus: Joi.string().valid('approved', 'needs_revision', 'rejected').required()
});

const templateCreateSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    gradeLevels: Joi.array().items(
        Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5')
    ).min(1).required(),
    subjectId: Joi.number().integer().required(),
    templateStructure: Joi.object().required(),
    defaultDuration: Joi.number().integer().min(5).max(120).default(30),
    assessmentWeight: Joi.object().required(),
    instructions: Joi.string().max(1000).optional()
});

// === 教案列表和管理 ===

// 獲取教案列表
router.get('/', async (req, res) => {
    try {
        const { error, value } = lessonSearchSchema.validate(req.query);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '搜索參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { query, status, gradeLevel, specialty, subjectId, templateId, page, limit } = value;
        const offset = (page - 1) * limit;

        // 建構查詢條件
        const conditions = [`alg.user_id = $1`]; // 只顯示用戶自己的教案
        const values = [req.user.id];
        let paramIndex = 2;

        if (query) {
            conditions.push(`(kb.title ILIKE $${paramIndex} OR $${paramIndex + 1} = ANY(kb.keywords))`);
            values.push(`%${query}%`, query);
            paramIndex += 2;
        }

        if (status) {
            conditions.push(`alg.status = $${paramIndex}`);
            values.push(status);
            paramIndex++;
        }

        if (gradeLevel) {
            conditions.push(`alg.grade_level = $${paramIndex}`);
            values.push(gradeLevel);
            paramIndex++;
        }

        if (specialty) {
            conditions.push(`alg.specialty = $${paramIndex}`);
            values.push(specialty);
            paramIndex++;
        }

        if (subjectId) {
            conditions.push(`s.id = $${paramIndex}`);
            values.push(subjectId);
            paramIndex++;
        }

        if (templateId) {
            conditions.push(`alg.template_id = $${paramIndex}`);
            values.push(templateId);
            paramIndex++;
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        const baseQuery = `
            FROM ai_lesson_generations alg
            JOIN lesson_templates lt ON alg.template_id = lt.id
            JOIN osce_knowledge_base kb ON alg.knowledge_base_id = kb.id
            JOIN osce_subjects s ON kb.subject_id = s.id
            LEFT JOIN ai_review_logs arl ON alg.id = arl.lesson_generation_id
            ${whereClause}
        `;

        const [lessonsResult, countResult] = await Promise.all([
            database.query(`
                SELECT alg.id, alg.grade_level, alg.specialty, alg.status, 
                       alg.quality_score, alg.created_at,
                       lt.name as template_name,
                       kb.title as knowledge_title, kb.content_type,
                       s.name as subject_name, s.category,
                       arl.overall_quality_score as review_score
                ${baseQuery}
                ORDER BY alg.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...values, limit, offset]),
            
            database.query(`
                SELECT COUNT(DISTINCT alg.id) ${baseQuery}
            `, values)
        ]);

        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            data: {
                lessons: lessonsResult.rows.map(lesson => ({
                    id: lesson.id,
                    gradeLevel: lesson.grade_level,
                    specialty: lesson.specialty,
                    status: lesson.status,
                    qualityScore: parseFloat(lesson.quality_score || 0).toFixed(2),
                    reviewScore: parseFloat(lesson.review_score || 0).toFixed(2),
                    template: {
                        name: lesson.template_name
                    },
                    knowledge: {
                        title: lesson.knowledge_title,
                        contentType: lesson.content_type
                    },
                    subject: {
                        name: lesson.subject_name,
                        category: lesson.category
                    },
                    createdAt: lesson.created_at
                })),
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    limit
                }
            }
        });

    } catch (error) {
        logger.error('獲取教案列表錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取教案列表失敗' }
        });
    }
});

// 獲取特定教案詳情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const lessonResult = await database.query(`
            SELECT alg.*, 
                   lt.name as template_name, lt.template_structure,
                   kb.title as knowledge_title, kb.content_type, kb.difficulty_level,
                   kb.clinical_presentation, kb.learning_objectives,
                   s.name as subject_name, s.category,
                   u.username as creator_username
            FROM ai_lesson_generations alg
            JOIN lesson_templates lt ON alg.template_id = lt.id
            JOIN osce_knowledge_base kb ON alg.knowledge_base_id = kb.id
            JOIN osce_subjects s ON kb.subject_id = s.id
            JOIN users u ON alg.user_id = u.id
            WHERE alg.id = $1
        `, [id]);

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案不存在' }
            });
        }

        const lesson = lessonResult.rows[0];

        // 檢查權限（只有創建者、instructor或admin可以查看）
        if (lesson.user_id !== req.user.id && !['instructor', 'admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: { message: '無權查看此教案' }
            });
        }

        // 獲取審核記錄
        const reviewsResult = await database.query(`
            SELECT arl.*, u.username as reviewer_name
            FROM ai_review_logs arl
            LEFT JOIN users u ON arl.lesson_generation_id = $1
            WHERE arl.lesson_generation_id = $1
            ORDER BY arl.reviewed_at DESC
        `, [id]);

        res.json({
            success: true,
            data: {
                lesson: {
                    id: lesson.id,
                    gradeLevel: lesson.grade_level,
                    specialty: lesson.specialty,
                    generationParams: lesson.generation_params,
                    generatedContent: lesson.generated_content,
                    aiModelUsed: lesson.ai_model_used,
                    generationTimeSeconds: lesson.generation_time_seconds,
                    status: lesson.status,
                    qualityScore: parseFloat(lesson.quality_score || 0).toFixed(2),
                    template: {
                        name: lesson.template_name,
                        structure: lesson.template_structure
                    },
                    knowledge: {
                        title: lesson.knowledge_title,
                        contentType: lesson.content_type,
                        difficultyLevel: lesson.difficulty_level,
                        clinicalPresentation: lesson.clinical_presentation,
                        learningObjectives: lesson.learning_objectives
                    },
                    subject: {
                        name: lesson.subject_name,
                        category: lesson.category
                    },
                    creator: {
                        username: lesson.creator_username
                    },
                    reviews: reviewsResult.rows.map(review => ({
                        id: review.id,
                        reviewerType: review.reviewer_type,
                        reviewerName: review.reviewer_name,
                        medicalAccuracyScore: parseFloat(review.medical_accuracy_score || 0).toFixed(2),
                        gradeAppropriatenessScore: parseFloat(review.grade_appropriateness_score || 0).toFixed(2),
                        learningObjectiveScore: parseFloat(review.learning_objective_score || 0).toFixed(2),
                        overallQualityScore: parseFloat(review.overall_quality_score || 0).toFixed(2),
                        reviewFeedback: review.review_feedback,
                        suggestions: review.suggestions,
                        approvalStatus: review.approval_status,
                        reviewedAt: review.reviewed_at
                    })),
                    createdAt: lesson.created_at
                }
            }
        });

    } catch (error) {
        logger.error('獲取教案詳情錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取教案詳情失敗' }
        });
    }
});

// 生成新教案
router.post('/generate', rateLimiter.ai, async (req, res) => {
    try {
        const { error, value } = lessonGenerationSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '教案生成參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { templateId, knowledgeBaseId, specialty, customInstructions, targetGradeLevel } = value;
        const gradeLevel = targetGradeLevel || req.user.grade_level;

        // 驗證模板和知識點是否存在
        const [templateResult, knowledgeResult] = await Promise.all([
            database.query('SELECT * FROM lesson_templates WHERE id = $1 AND is_active = true', [templateId]),
            database.query('SELECT * FROM osce_knowledge_base WHERE id = $1', [knowledgeBaseId])
        ]);

        if (templateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案模板不存在' }
            });
        }

        if (knowledgeResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '知識點不存在' }
            });
        }

        const template = templateResult.rows[0];
        const knowledge = knowledgeResult.rows[0];

        // 檢查職級是否適用於此模板
        if (!template.grade_levels.includes(gradeLevel)) {
            return res.status(400).json({
                success: false,
                error: { message: `此模板不適用於 ${gradeLevel} 職級` }
            });
        }

        // 使用AI教案生成引擎
        const lessonGenerator = require('../services/lessonGenerator');
        
        const generationResult = await lessonGenerator.generateLesson({
            userId: req.user.id,
            templateId,
            knowledgeBaseId,
            gradeLevel,
            specialty,
            customInstructions
        });

        const mockGeneratedContent = generationResult.lessonContent;
        const generationTimeSeconds = Math.floor(generationResult.metadata.generationTime / 1000);
        const qualityScore = generationResult.metadata.qualityScore;

        // 保存生成記錄
        const lessonResult = await database.query(`
            INSERT INTO ai_lesson_generations (
                user_id, template_id, knowledge_base_id, grade_level, specialty,
                generation_params, generated_content, ai_model_used, 
                generation_time_seconds, quality_score
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            req.user.id, templateId, knowledgeBaseId, gradeLevel, 
            specialty || req.user.specialty,
            JSON.stringify({ customInstructions }),
            JSON.stringify(mockGeneratedContent),
            generationResult.metadata.aiModel,
            generationTimeSeconds,
            qualityScore
        ]);

        const newLesson = lessonResult.rows[0];

        logger.info('教案生成成功:', {
            userId: req.user.id,
            lessonId: newLesson.id,
            gradeLevel,
            templateId,
            knowledgeBaseId
        });

        res.status(201).json({
            success: true,
            message: '教案生成成功',
            data: {
                lesson: {
                    id: newLesson.id,
                    gradeLevel: newLesson.grade_level,
                    generatedContent: newLesson.generated_content,
                    qualityScore: parseFloat(newLesson.quality_score).toFixed(2),
                    generationTimeSeconds: newLesson.generation_time_seconds,
                    createdAt: newLesson.created_at
                }
            }
        });

    } catch (error) {
        logger.error('教案生成錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '教案生成失敗' }
        });
    }
});

// 審核教案
router.post('/:id/review', requireRole(['instructor', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = lessonReviewSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '審核參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const {
            medicalAccuracyScore, gradeAppropriatenessScore, learningObjectiveScore,
            overallQualityScore, reviewFeedback, suggestions, approvalStatus
        } = value;

        // 檢查教案是否存在
        const lessonResult = await database.query(
            'SELECT * FROM ai_lesson_generations WHERE id = $1',
            [id]
        );

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '教案不存在' }
            });
        }

        await database.transaction(async (client) => {
            // 創建審核記錄
            await client.query(`
                INSERT INTO ai_review_logs (
                    lesson_generation_id, reviewer_type, medical_accuracy_score,
                    grade_appropriateness_score, learning_objective_score, overall_quality_score,
                    review_feedback, suggestions, approval_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                id, 'human_instructor', medicalAccuracyScore, gradeAppropriatenessScore,
                learningObjectiveScore, overallQualityScore, reviewFeedback, suggestions, approvalStatus
            ]);

            // 更新教案狀態
            const newStatus = approvalStatus === 'approved' ? 'approved' : 
                             approvalStatus === 'rejected' ? 'rejected' : 'reviewed';
            
            await client.query(
                'UPDATE ai_lesson_generations SET status = $1 WHERE id = $2',
                [newStatus, id]
            );
        });

        logger.info('教案審核完成:', {
            reviewerId: req.user.id,
            lessonId: id,
            approvalStatus,
            overallScore: overallQualityScore
        });

        res.json({
            success: true,
            message: '教案審核完成',
            data: {
                lessonId: id,
                approvalStatus,
                overallQualityScore: parseFloat(overallQualityScore).toFixed(2)
            }
        });

    } catch (error) {
        logger.error('教案審核錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '教案審核失敗' }
        });
    }
});

// === 教案模板管理 ===

// 獲取教案模板列表
router.get('/templates', async (req, res) => {
    try {
        const { subjectId, gradeLevel } = req.query;

        let query = `
            SELECT lt.*, s.name as subject_name, s.category,
                   COUNT(alg.id) as usage_count
            FROM lesson_templates lt
            JOIN osce_subjects s ON lt.subject_id = s.id
            LEFT JOIN ai_lesson_generations alg ON lt.id = alg.template_id
            WHERE lt.is_active = true
        `;

        const values = [];
        let paramIndex = 1;

        if (subjectId) {
            query += ` AND lt.subject_id = $${paramIndex}`;
            values.push(subjectId);
            paramIndex++;
        }

        if (gradeLevel) {
            query += ` AND $${paramIndex} = ANY(lt.grade_levels)`;
            values.push(gradeLevel);
            paramIndex++;
        }

        query += `
            GROUP BY lt.id, s.id
            ORDER BY usage_count DESC, lt.created_at DESC
        `;

        const result = await database.query(query, values);

        res.json({
            success: true,
            data: {
                templates: result.rows.map(template => ({
                    id: template.id,
                    name: template.name,
                    gradeLevels: template.grade_levels,
                    defaultDuration: template.default_duration,
                    templateStructure: template.template_structure,
                    assessmentWeight: template.assessment_weight,
                    instructions: template.instructions,
                    usageCount: parseInt(template.usage_count),
                    subject: {
                        id: template.subject_id,
                        name: template.subject_name,
                        category: template.category
                    },
                    createdAt: template.created_at,
                    updatedAt: template.updated_at
                }))
            }
        });

    } catch (error) {
        logger.error('獲取教案模板錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取教案模板失敗' }
        });
    }
});

// 創建教案模板（僅instructor和admin）
router.post('/templates', requireRole(['instructor', 'admin']), rateLimiter.api, async (req, res) => {
    try {
        const { error, value } = templateCreateSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '模板資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const {
            name, gradeLevels, subjectId, templateStructure,
            defaultDuration, assessmentWeight, instructions
        } = value;

        const result = await database.query(`
            INSERT INTO lesson_templates (
                name, grade_levels, subject_id, template_structure,
                default_duration, assessment_weight, instructions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            name, gradeLevels, subjectId, JSON.stringify(templateStructure),
            defaultDuration, JSON.stringify(assessmentWeight), instructions
        ]);

        const newTemplate = result.rows[0];

        logger.info('教案模板創建:', {
            userId: req.user.id,
            templateId: newTemplate.id,
            name
        });

        res.status(201).json({
            success: true,
            message: '教案模板創建成功',
            data: {
                template: {
                    id: newTemplate.id,
                    name: newTemplate.name,
                    gradeLevels: newTemplate.grade_levels,
                    subjectId: newTemplate.subject_id,
                    createdAt: newTemplate.created_at
                }
            }
        });

    } catch (error) {
        logger.error('創建教案模板錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '創建教案模板失敗' }
        });
    }
});

module.exports = router;
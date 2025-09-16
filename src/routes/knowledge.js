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
const knowledgeSearchSchema = Joi.object({
    query: Joi.string().min(1).max(200).optional(),
    subject: Joi.string().optional(),
    contentType: Joi.string().valid('disease', 'procedure', 'examination', 'skill').optional(),
    difficultyLevel: Joi.number().integer().min(1).max(5).optional(),
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
});

const createKnowledgeSchema = Joi.object({
    subjectId: Joi.number().integer().required(),
    title: Joi.string().min(2).max(200).required(),
    contentType: Joi.string().valid('disease', 'procedure', 'examination', 'skill').required(),
    difficultyLevel: Joi.number().integer().min(1).max(5).required(),
    keywords: Joi.array().items(Joi.string()).optional(),
    clinicalPresentation: Joi.string().optional(),
    differentialDiagnosis: Joi.array().items(Joi.string()).optional(),
    investigationApproach: Joi.string().optional(),
    managementPrinciples: Joi.string().optional(),
    learningObjectives: Joi.array().items(Joi.string()).optional(),
    assessmentCriteria: Joi.object().optional(),
    nationalExamFrequency: Joi.number().integer().min(0).default(0)
});

// === OSCE科目管理 ===

// 獲取所有科目分類
router.get('/subjects', async (req, res) => {
    try {
        const result = await database.query(`
            SELECT s.*, 
                   COUNT(kb.id) as knowledge_count,
                   AVG(kb.difficulty_level) as avg_difficulty
            FROM osce_subjects s
            LEFT JOIN osce_knowledge_base kb ON s.id = kb.subject_id
            WHERE s.is_active = true
            GROUP BY s.id
            ORDER BY s.category, s.name
        `);

        const subjects = result.rows.map(subject => ({
            id: subject.id,
            code: subject.code,
            name: subject.name,
            category: subject.category,
            description: subject.description,
            knowledgeCount: parseInt(subject.knowledge_count),
            avgDifficulty: parseFloat(subject.avg_difficulty || 0).toFixed(1),
            isActive: subject.is_active,
            createdAt: subject.created_at
        }));

        // 按類別分組
        const groupedSubjects = subjects.reduce((acc, subject) => {
            const category = subject.category;
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(subject);
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                subjects,
                groupedSubjects,
                totalSubjects: subjects.length
            }
        });

    } catch (error) {
        logger.error('獲取科目分類錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取科目分類失敗' }
        });
    }
});

// 獲取特定科目詳情
router.get('/subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const subjectResult = await database.query(`
            SELECT s.*, 
                   COUNT(kb.id) as knowledge_count,
                   COUNT(CASE WHEN kb.difficulty_level <= 2 THEN 1 END) as easy_count,
                   COUNT(CASE WHEN kb.difficulty_level = 3 THEN 1 END) as medium_count,
                   COUNT(CASE WHEN kb.difficulty_level >= 4 THEN 1 END) as hard_count
            FROM osce_subjects s
            LEFT JOIN osce_knowledge_base kb ON s.id = kb.subject_id
            WHERE s.id = $1 AND s.is_active = true
            GROUP BY s.id
        `, [id]);

        if (subjectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '科目不存在' }
            });
        }

        const subject = subjectResult.rows[0];

        res.json({
            success: true,
            data: {
                subject: {
                    id: subject.id,
                    code: subject.code,
                    name: subject.name,
                    category: subject.category,
                    description: subject.description,
                    statistics: {
                        totalKnowledge: parseInt(subject.knowledge_count),
                        easyLevel: parseInt(subject.easy_count),
                        mediumLevel: parseInt(subject.medium_count),
                        hardLevel: parseInt(subject.hard_count)
                    },
                    createdAt: subject.created_at
                }
            }
        });

    } catch (error) {
        logger.error('獲取科目詳情錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取科目詳情失敗' }
        });
    }
});

// === OSCE知識庫查詢 ===

// 搜索知識庫
router.get('/search', async (req, res) => {
    try {
        const { error, value } = knowledgeSearchSchema.validate(req.query);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '搜索參數驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { query, subject, contentType, difficultyLevel, gradeLevel, page, limit } = value;
        const offset = (page - 1) * limit;

        // 建構查詢條件
        const conditions = [];
        const values = [];
        let paramIndex = 1;

        if (query) {
            conditions.push(`(kb.title ILIKE $${paramIndex} OR $${paramIndex + 1} = ANY(kb.keywords) OR kb.clinical_presentation ILIKE $${paramIndex + 2})`);
            values.push(`%${query}%`, query, `%${query}%`);
            paramIndex += 3;
        }

        if (subject) {
            conditions.push(`s.code = $${paramIndex}`);
            values.push(subject);
            paramIndex++;
        }

        if (contentType) {
            conditions.push(`kb.content_type = $${paramIndex}`);
            values.push(contentType);
            paramIndex++;
        }

        if (difficultyLevel) {
            conditions.push(`kb.difficulty_level = $${paramIndex}`);
            values.push(difficultyLevel);
            paramIndex++;
        }

        // 根據用戶職級過濾適合的難度
        if (gradeLevel || req.user.grade_level) {
            const userGradeLevel = gradeLevel || req.user.grade_level;
            const gradeConfigResult = await database.query(
                'SELECT difficulty_level FROM grade_configs WHERE grade_level = $1',
                [userGradeLevel]
            );
            
            if (gradeConfigResult.rows.length > 0) {
                const maxDifficulty = gradeConfigResult.rows[0].difficulty_level;
                conditions.push(`kb.difficulty_level <= $${paramIndex}`);
                values.push(maxDifficulty);
                paramIndex++;
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const baseQuery = `
            FROM osce_knowledge_base kb
            JOIN osce_subjects s ON kb.subject_id = s.id
            ${whereClause}
        `;

        const [knowledgeResult, countResult] = await Promise.all([
            database.query(`
                SELECT kb.id, kb.title, kb.content_type, kb.difficulty_level,
                       kb.keywords, kb.clinical_presentation, kb.national_exam_frequency,
                       kb.created_at, kb.updated_at,
                       s.code as subject_code, s.name as subject_name, s.category
                ${baseQuery}
                ORDER BY 
                    CASE WHEN $${paramIndex} IS NOT NULL 
                         THEN similarity(kb.title, $${paramIndex + 1}) 
                         ELSE kb.national_exam_frequency END DESC,
                    kb.created_at DESC
                LIMIT $${paramIndex + 2} OFFSET $${paramIndex + 3}
            `, [...values, query, query, limit, offset]),
            
            database.query(`
                SELECT COUNT(*) ${baseQuery}
            `, values)
        ]);

        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            data: {
                knowledge: knowledgeResult.rows.map(item => ({
                    id: item.id,
                    title: item.title,
                    contentType: item.content_type,
                    difficultyLevel: item.difficulty_level,
                    keywords: item.keywords,
                    clinicalPresentation: item.clinical_presentation,
                    nationalExamFrequency: item.national_exam_frequency,
                    subject: {
                        code: item.subject_code,
                        name: item.subject_name,
                        category: item.category
                    },
                    createdAt: item.created_at,
                    updatedAt: item.updated_at
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
        logger.error('搜索知識庫錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '搜索知識庫失敗' }
        });
    }
});

// 獲取知識庫統計資訊
router.get('/stats', async (req, res) => {
    try {
        const statsResult = await database.query(`
            SELECT 
                COUNT(*) as total_knowledge,
                COUNT(CASE WHEN content_type = 'disease' THEN 1 END) as diseases,
                COUNT(CASE WHEN content_type = 'procedure' THEN 1 END) as procedures,
                COUNT(CASE WHEN content_type = 'examination' THEN 1 END) as examinations,
                COUNT(CASE WHEN content_type = 'skill' THEN 1 END) as skills,
                AVG(difficulty_level) as avg_difficulty,
                AVG(national_exam_frequency) as avg_exam_frequency
            FROM osce_knowledge_base
        `);

        const difficultyDistResult = await database.query(`
            SELECT 
                difficulty_level,
                COUNT(*) as count
            FROM osce_knowledge_base
            GROUP BY difficulty_level
            ORDER BY difficulty_level
        `);

        const subjectDistResult = await database.query(`
            SELECT 
                s.name as subject_name,
                s.category,
                COUNT(kb.id) as count
            FROM osce_subjects s
            LEFT JOIN osce_knowledge_base kb ON s.id = kb.subject_id
            WHERE s.is_active = true
            GROUP BY s.id, s.name, s.category
            ORDER BY count DESC
        `);

        const stats = statsResult.rows[0];

        res.json({
            success: true,
            data: {
                overview: {
                    totalKnowledge: parseInt(stats.total_knowledge),
                    diseases: parseInt(stats.diseases),
                    procedures: parseInt(stats.procedures),
                    examinations: parseInt(stats.examinations),
                    skills: parseInt(stats.skills),
                    avgDifficulty: parseFloat(stats.avg_difficulty || 0).toFixed(1),
                    avgExamFrequency: parseFloat(stats.avg_exam_frequency || 0).toFixed(0)
                },
                difficultyDistribution: difficultyDistResult.rows.map(item => ({
                    level: item.difficulty_level,
                    count: parseInt(item.count)
                })),
                subjectDistribution: subjectDistResult.rows.map(item => ({
                    subject: item.subject_name,
                    category: item.category,
                    count: parseInt(item.count)
                }))
            }
        });

    } catch (error) {
        logger.error('獲取知識庫統計錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取統計資訊失敗' }
        });
    }
});

// 獲取特定知識點詳情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await database.query(`
            SELECT kb.*, 
                   s.code as subject_code, s.name as subject_name, s.category
            FROM osce_knowledge_base kb
            JOIN osce_subjects s ON kb.subject_id = s.id
            WHERE kb.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '知識點不存在' }
            });
        }

        const knowledge = result.rows[0];

        res.json({
            success: true,
            data: {
                knowledge: {
                    id: knowledge.id,
                    title: knowledge.title,
                    contentType: knowledge.content_type,
                    difficultyLevel: knowledge.difficulty_level,
                    keywords: knowledge.keywords,
                    clinicalPresentation: knowledge.clinical_presentation,
                    differentialDiagnosis: knowledge.differential_diagnosis,
                    investigationApproach: knowledge.investigation_approach,
                    managementPrinciples: knowledge.management_principles,
                    learningObjectives: knowledge.learning_objectives,
                    assessmentCriteria: knowledge.assessment_criteria,
                    nationalExamFrequency: knowledge.national_exam_frequency,
                    subject: {
                        id: knowledge.subject_id,
                        code: knowledge.subject_code,
                        name: knowledge.subject_name,
                        category: knowledge.category
                    },
                    createdAt: knowledge.created_at,
                    updatedAt: knowledge.updated_at
                }
            }
        });

    } catch (error) {
        logger.error('獲取知識點詳情錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取知識點詳情失敗' }
        });
    }
});

// 根據用戶職級推薦知識點
router.get('/recommendations/for-grade', async (req, res) => {
    try {
        const { gradeLevel = req.user.grade_level, limit = 10 } = req.query;

        // 獲取用戶職級配置
        const gradeConfigResult = await database.query(
            'SELECT * FROM grade_configs WHERE grade_level = $1',
            [gradeLevel]
        );

        if (gradeConfigResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: '無效的職級' }
            });
        }

        const gradeConfig = gradeConfigResult.rows[0];
        const maxDifficulty = gradeConfig.difficulty_level;

        // 推薦適合的知識點（難度適中且國考頻率高）
        const recommendationsResult = await database.query(`
            SELECT kb.*, s.name as subject_name, s.category,
                   (kb.national_exam_frequency * 0.4 + 
                    (6 - kb.difficulty_level) * 0.3 + 
                    CASE WHEN kb.difficulty_level <= $1 THEN 0.3 ELSE 0 END) as relevance_score
            FROM osce_knowledge_base kb
            JOIN osce_subjects s ON kb.subject_id = s.id
            WHERE kb.difficulty_level <= $1
              AND s.is_active = true
            ORDER BY relevance_score DESC, kb.national_exam_frequency DESC
            LIMIT $2
        `, [maxDifficulty, limit]);

        res.json({
            success: true,
            data: {
                recommendations: recommendationsResult.rows.map(item => ({
                    id: item.id,
                    title: item.title,
                    contentType: item.content_type,
                    difficultyLevel: item.difficulty_level,
                    keywords: item.keywords,
                    nationalExamFrequency: item.national_exam_frequency,
                    relevanceScore: parseFloat(item.relevance_score).toFixed(2),
                    subject: {
                        name: item.subject_name,
                        category: item.category
                    }
                })),
                gradeLevel,
                maxDifficulty
            }
        });

    } catch (error) {
        logger.error('獲取推薦知識點錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取推薦知識點失敗' }
        });
    }
});

// === 管理員功能 ===

// 創建新知識點（僅instructor和admin）
router.post('/', requireRole(['instructor', 'admin']), rateLimiter.api, async (req, res) => {
    try {
        const { error, value } = createKnowledgeSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const {
            subjectId, title, contentType, difficultyLevel, keywords,
            clinicalPresentation, differentialDiagnosis, investigationApproach,
            managementPrinciples, learningObjectives, assessmentCriteria,
            nationalExamFrequency
        } = value;

        const result = await database.query(`
            INSERT INTO osce_knowledge_base (
                subject_id, title, content_type, difficulty_level, keywords,
                clinical_presentation, differential_diagnosis, investigation_approach,
                management_principles, learning_objectives, assessment_criteria,
                national_exam_frequency
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            subjectId, title, contentType, difficultyLevel, keywords,
            clinicalPresentation, differentialDiagnosis, investigationApproach,
            managementPrinciples, learningObjectives, 
            assessmentCriteria ? JSON.stringify(assessmentCriteria) : null,
            nationalExamFrequency
        ]);

        const newKnowledge = result.rows[0];

        logger.info('新知識點創建:', {
            userId: req.user.id,
            knowledgeId: newKnowledge.id,
            title
        });

        res.status(201).json({
            success: true,
            message: '知識點創建成功',
            data: {
                knowledge: {
                    id: newKnowledge.id,
                    title: newKnowledge.title,
                    contentType: newKnowledge.content_type,
                    difficultyLevel: newKnowledge.difficulty_level,
                    createdAt: newKnowledge.created_at
                }
            }
        });

    } catch (error) {
        logger.error('創建知識點錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '創建知識點失敗' }
        });
    }
});

module.exports = router;
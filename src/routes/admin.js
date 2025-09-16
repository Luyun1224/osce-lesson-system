const express = require('express');
const Joi = require('joi');
const database = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要管理員權限
router.use(authenticateToken);
router.use(requireRole('admin'));

// 驗證schemas
const gradeConfigSchema = Joi.object({
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').required(),
    displayName: Joi.string().min(2).max(50).required(),
    difficultyLevel: Joi.number().integer().min(1).max(5).required(),
    medicalTerminologyLevel: Joi.number().integer().min(1).max(5).required(),
    caseComplexityLevel: Joi.number().integer().min(1).max(5).required(),
    assessmentDepthLevel: Joi.number().integer().min(1).max(5).required(),
    description: Joi.string().max(500).optional()
});

const systemConfigSchema = Joi.object({
    configKey: Joi.string().min(1).max(100).required(),
    configValue: Joi.object().required(),
    description: Joi.string().max(500).optional()
});

// === 職級配置管理 ===

// 獲取所有職級配置
router.get('/grade-configs', async (req, res) => {
    try {
        const result = await database.query(`
            SELECT * FROM grade_configs 
            ORDER BY 
                CASE grade_level
                    WHEN 'UGY' THEN 1
                    WHEN 'PGY1' THEN 2
                    WHEN 'PGY2' THEN 3
                    WHEN 'R1' THEN 4
                    WHEN 'R2' THEN 5
                    WHEN 'R3' THEN 6
                    WHEN 'R4' THEN 7
                    WHEN 'R5' THEN 8
                END
        `);

        res.json({
            success: true,
            data: {
                gradeConfigs: result.rows.map(config => ({
                    id: config.id,
                    gradeLevel: config.grade_level,
                    displayName: config.display_name,
                    difficultyLevel: config.difficulty_level,
                    medicalTerminologyLevel: config.medical_terminology_level,
                    caseComplexityLevel: config.case_complexity_level,
                    assessmentDepthLevel: config.assessment_depth_level,
                    description: config.description,
                    createdAt: config.created_at
                }))
            }
        });

    } catch (error) {
        logger.error('獲取職級配置錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取職級配置失敗' }
        });
    }
});

// 更新職級配置
router.put('/grade-configs/:id', rateLimiter.api, async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = gradeConfigSchema.validate(req.body);
        
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
            gradeLevel,
            displayName,
            difficultyLevel,
            medicalTerminologyLevel,
            caseComplexityLevel,
            assessmentDepthLevel,
            description
        } = value;

        const result = await database.query(`
            UPDATE grade_configs 
            SET grade_level = $1, display_name = $2, difficulty_level = $3,
                medical_terminology_level = $4, case_complexity_level = $5,
                assessment_depth_level = $6, description = $7
            WHERE id = $8
            RETURNING *
        `, [gradeLevel, displayName, difficultyLevel, medicalTerminologyLevel, 
            caseComplexityLevel, assessmentDepthLevel, description, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '職級配置不存在' }
            });
        }

        const config = result.rows[0];

        logger.info('職級配置更新:', {
            adminId: req.user.id,
            configId: id,
            gradeLevel
        });

        res.json({
            success: true,
            message: '職級配置更新成功',
            data: {
                gradeConfig: {
                    id: config.id,
                    gradeLevel: config.grade_level,
                    displayName: config.display_name,
                    difficultyLevel: config.difficulty_level,
                    medicalTerminologyLevel: config.medical_terminology_level,
                    caseComplexityLevel: config.case_complexity_level,
                    assessmentDepthLevel: config.assessment_depth_level,
                    description: config.description
                }
            }
        });

    } catch (error) {
        logger.error('更新職級配置錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '更新職級配置失敗' }
        });
    }
});

// === 系統配置管理 ===

// 獲取所有系統配置
router.get('/system-configs', async (req, res) => {
    try {
        const result = await database.query(`
            SELECT * FROM system_configs 
            ORDER BY config_key
        `);

        res.json({
            success: true,
            data: {
                systemConfigs: result.rows.map(config => ({
                    id: config.id,
                    configKey: config.config_key,
                    configValue: config.config_value,
                    description: config.description,
                    updatedAt: config.updated_at
                }))
            }
        });

    } catch (error) {
        logger.error('獲取系統配置錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取系統配置失敗' }
        });
    }
});

// 更新系統配置
router.put('/system-configs/:id', rateLimiter.api, async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = systemConfigSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { configKey, configValue, description } = value;

        const result = await database.query(`
            UPDATE system_configs 
            SET config_key = $1, config_value = $2, description = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `, [configKey, JSON.stringify(configValue), description, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '系統配置不存在' }
            });
        }

        const config = result.rows[0];

        logger.info('系統配置更新:', {
            adminId: req.user.id,
            configId: id,
            configKey
        });

        res.json({
            success: true,
            message: '系統配置更新成功',
            data: {
                systemConfig: {
                    id: config.id,
                    configKey: config.config_key,
                    configValue: config.config_value,
                    description: config.description,
                    updatedAt: config.updated_at
                }
            }
        });

    } catch (error) {
        logger.error('更新系統配置錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '更新系統配置失敗' }
        });
    }
});

// === 系統統計 ===

// 獲取系統整體統計
router.get('/dashboard-stats', async (req, res) => {
    try {
        const statsQueries = await Promise.all([
            // 用戶統計
            database.query(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN is_active THEN 1 END) as active_users,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_users_this_month
                FROM users
            `),
            
            // 教案生成統計
            database.query(`
                SELECT 
                    COUNT(*) as total_lessons,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_lessons,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as lessons_this_week,
                    COALESCE(AVG(quality_score), 0) as avg_quality_score
                FROM ai_lesson_generations
            `),
            
            // 職級分布統計
            database.query(`
                SELECT 
                    grade_level,
                    COUNT(*) as user_count
                FROM users 
                WHERE is_active = true
                GROUP BY grade_level
                ORDER BY user_count DESC
            `),
            
            // 系統性能統計
            database.query(`
                SELECT 
                    AVG(generation_time_seconds) as avg_generation_time,
                    COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as generations_today
                FROM ai_lesson_generations
                WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            `)
        ]);

        const [userStats, lessonStats, gradeDistribution, performanceStats] = statsQueries;

        res.json({
            success: true,
            data: {
                userStats: {
                    totalUsers: parseInt(userStats.rows[0].total_users),
                    activeUsers: parseInt(userStats.rows[0].active_users),
                    newUsersThisMonth: parseInt(userStats.rows[0].new_users_this_month)
                },
                lessonStats: {
                    totalLessons: parseInt(lessonStats.rows[0].total_lessons),
                    approvedLessons: parseInt(lessonStats.rows[0].approved_lessons),
                    lessonsThisWeek: parseInt(lessonStats.rows[0].lessons_this_week),
                    avgQualityScore: parseFloat(lessonStats.rows[0].avg_quality_score).toFixed(2)
                },
                gradeDistribution: gradeDistribution.rows.map(item => ({
                    gradeLevel: item.grade_level,
                    userCount: parseInt(item.user_count)
                })),
                performanceStats: {
                    avgGenerationTime: parseFloat(performanceStats.rows[0].avg_generation_time || 0).toFixed(2),
                    generationsToday: parseInt(performanceStats.rows[0].generations_today || 0)
                }
            }
        });

    } catch (error) {
        logger.error('獲取系統統計錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取系統統計失敗' }
        });
    }
});

// === 日誌管理 ===

// 獲取系統活動日誌
router.get('/activity-logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, level = '', startDate, endDate } = req.query;
        const offset = (page - 1) * limit;

        // 這裡簡化處理，實際應用中可能需要專門的日誌表
        const conditions = {};
        if (startDate) conditions.created_at_start = startDate;
        if (endDate) conditions.created_at_end = endDate;

        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (startDate) {
            whereClause += ` AND created_at >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND created_at <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        const query = `
            SELECT 
                alg.id,
                alg.created_at,
                u.username,
                u.grade_level,
                alg.status,
                'lesson_generation' as activity_type
            FROM ai_lesson_generations alg
            JOIN users u ON alg.user_id = u.id
            ${whereClause}
            ORDER BY alg.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        values.push(limit, offset);

        const result = await database.query(query, values);

        res.json({
            success: true,
            data: {
                logs: result.rows.map(log => ({
                    id: log.id,
                    timestamp: log.created_at,
                    username: log.username,
                    gradeLevel: log.grade_level,
                    activityType: log.activity_type,
                    status: log.status
                })),
                pagination: {
                    currentPage: parseInt(page),
                    limit: parseInt(limit)
                }
            }
        });

    } catch (error) {
        logger.error('獲取活動日誌錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取活動日誌失敗' }
        });
    }
});

module.exports = router;
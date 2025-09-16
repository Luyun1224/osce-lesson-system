const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { authenticateToken, requireRole, requireOwnership } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要驗證
router.use(authenticateToken);

// 驗證schemas
const updateProfileSchema = Joi.object({
    fullName: Joi.string().min(2).max(100).optional(),
    specialty: Joi.string().max(50).optional(),
    hospital: Joi.string().max(100).optional()
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required()
});

const updateUserSchema = Joi.object({
    fullName: Joi.string().min(2).max(100).optional(),
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').optional(),
    specialty: Joi.string().max(50).optional(),
    hospital: Joi.string().max(100).optional(),
    role: Joi.string().valid('student', 'instructor', 'admin').optional(),
    isActive: Joi.boolean().optional()
});

// 獲取用戶個人資料
router.get('/profile', async (req, res) => {
    try {
        const userResult = await database.query(`
            SELECT u.id, u.username, u.email, u.full_name, u.grade_level,
                   u.specialty, u.hospital, u.role, u.created_at,
                   gc.display_name as grade_display_name,
                   gc.difficulty_level, gc.medical_terminology_level
            FROM users u
            LEFT JOIN grade_configs gc ON u.grade_level = gc.grade_level
            WHERE u.id = $1
        `, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '用戶不存在' }
            });
        }

        const user = userResult.rows[0];

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: user.full_name,
                    gradeLevel: user.grade_level,
                    gradeDisplayName: user.grade_display_name,
                    difficultyLevel: user.difficulty_level,
                    medicalTerminologyLevel: user.medical_terminology_level,
                    specialty: user.specialty,
                    hospital: user.hospital,
                    role: user.role,
                    createdAt: user.created_at
                }
            }
        });

    } catch (error) {
        logger.error('獲取用戶資料錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取用戶資料失敗' }
        });
    }
});

// 更新用戶個人資料
router.put('/profile', rateLimiter.api, async (req, res) => {
    try {
        const { error, value } = updateProfileSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        Object.entries(value).forEach(([key, val]) => {
            if (val !== undefined) {
                updateFields.push(`${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramIndex}`);
                updateValues.push(val);
                paramIndex++;
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: '沒有提供要更新的資料' }
            });
        }

        updateValues.push(req.user.id);
        const query = `
            UPDATE users 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING id, username, email, full_name, grade_level, specialty, hospital, role, updated_at
        `;

        const result = await database.query(query, updateValues);
        const updatedUser = result.rows[0];

        logger.info('用戶資料更新:', {
            userId: req.user.id,
            updatedFields: Object.keys(value)
        });

        res.json({
            success: true,
            message: '用戶資料更新成功',
            data: {
                user: {
                    id: updatedUser.id,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    fullName: updatedUser.full_name,
                    gradeLevel: updatedUser.grade_level,
                    specialty: updatedUser.specialty,
                    hospital: updatedUser.hospital,
                    role: updatedUser.role,
                    updatedAt: updatedUser.updated_at
                }
            }
        });

    } catch (error) {
        logger.error('更新用戶資料錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '更新用戶資料失敗' }
        });
    }
});

// 更改密碼
router.put('/change-password', rateLimiter.auth, async (req, res) => {
    try {
        const { error, value } = changePasswordSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '密碼格式不正確',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { currentPassword, newPassword } = value;

        // 獲取當前密碼hash
        const userResult = await database.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const user = userResult.rows[0];

        // 驗證當前密碼
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                error: { message: '當前密碼錯誤' }
            });
        }

        // 檢查新密碼是否與當前密碼相同
        const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
        
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                error: { message: '新密碼不能與當前密碼相同' }
            });
        }

        // 加密新密碼
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // 更新密碼
        await database.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        logger.info('用戶密碼更改:', {
            userId: req.user.id,
            username: req.user.username
        });

        res.json({
            success: true,
            message: '密碼更新成功'
        });

    } catch (error) {
        logger.error('更改密碼錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '更改密碼失敗' }
        });
    }
});

// 獲取用戶統計資料
router.get('/stats', async (req, res) => {
    try {
        const statsResult = await database.query(`
            SELECT 
                COUNT(alg.id) as total_lessons_generated,
                COUNT(CASE WHEN alg.status = 'approved' THEN 1 END) as approved_lessons,
                COUNT(CASE WHEN alg.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as lessons_this_month,
                COUNT(lf.id) as favorite_lessons,
                COALESCE(AVG(arl.overall_quality_score), 0) as avg_quality_score
            FROM users u
            LEFT JOIN ai_lesson_generations alg ON u.id = alg.user_id
            LEFT JOIN lesson_favorites lf ON u.id = lf.user_id
            LEFT JOIN ai_review_logs arl ON alg.id = arl.lesson_generation_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [req.user.id]);

        const stats = statsResult.rows[0] || {
            total_lessons_generated: 0,
            approved_lessons: 0,
            lessons_this_month: 0,
            favorite_lessons: 0,
            avg_quality_score: 0
        };

        res.json({
            success: true,
            data: {
                stats: {
                    totalLessonsGenerated: parseInt(stats.total_lessons_generated),
                    approvedLessons: parseInt(stats.approved_lessons),
                    lessonsThisMonth: parseInt(stats.lessons_this_month),
                    favoriteLessons: parseInt(stats.favorite_lessons),
                    avgQualityScore: parseFloat(stats.avg_quality_score).toFixed(2)
                }
            }
        });

    } catch (error) {
        logger.error('獲取用戶統計錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取統計資料失敗' }
        });
    }
});

// === 管理員功能 ===

// 獲取所有用戶列表（僅管理員）
router.get('/list', requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', gradeLevel = '', role = '' } = req.query;
        const offset = (page - 1) * limit;

        const conditions = {};
        if (search) conditions.username = `%${search}%`;
        if (gradeLevel) conditions.grade_level = gradeLevel;
        if (role) conditions.role = role;

        const { whereClause, values } = database.buildWhereConditions(conditions);
        
        const baseQuery = `
            SELECT u.id, u.username, u.email, u.full_name, u.grade_level,
                   u.specialty, u.hospital, u.role, u.is_active, u.created_at,
                   gc.display_name as grade_display_name
            FROM users u
            LEFT JOIN grade_configs gc ON u.grade_level = gc.grade_level
            ${whereClause}
        `;

        const { query: paginatedQuery, countQuery } = database.buildPaginationQuery(baseQuery, page, limit);
        
        const [usersResult, countResult] = await Promise.all([
            database.query(paginatedQuery, [...values, limit, offset]),
            database.query(countQuery, values)
        ]);

        const totalUsers = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalUsers / limit);

        res.json({
            success: true,
            data: {
                users: usersResult.rows.map(user => ({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: user.full_name,
                    gradeLevel: user.grade_level,
                    gradeDisplayName: user.grade_display_name,
                    specialty: user.specialty,
                    hospital: user.hospital,
                    role: user.role,
                    isActive: user.is_active,
                    createdAt: user.created_at
                })),
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalUsers,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        logger.error('獲取用戶列表錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取用戶列表失敗' }
        });
    }
});

// 更新用戶資料（僅管理員）
router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = updateUserSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        Object.entries(value).forEach(([key, val]) => {
            if (val !== undefined) {
                const dbKey = key === 'isActive' ? 'is_active' : key.replace(/([A-Z])/g, '_$1').toLowerCase();
                updateFields.push(`${dbKey} = $${paramIndex}`);
                updateValues.push(val);
                paramIndex++;
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: '沒有提供要更新的資料' }
            });
        }

        updateValues.push(id);
        const query = `
            UPDATE users 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING id, username, email, full_name, grade_level, specialty, hospital, role, is_active, updated_at
        `;

        const result = await database.query(query, updateValues);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: { message: '用戶不存在' }
            });
        }

        const updatedUser = result.rows[0];

        logger.info('管理員更新用戶資料:', {
            adminId: req.user.id,
            targetUserId: id,
            updatedFields: Object.keys(value)
        });

        res.json({
            success: true,
            message: '用戶資料更新成功',
            data: {
                user: {
                    id: updatedUser.id,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    fullName: updatedUser.full_name,
                    gradeLevel: updatedUser.grade_level,
                    specialty: updatedUser.specialty,
                    hospital: updatedUser.hospital,
                    role: updatedUser.role,
                    isActive: updatedUser.is_active,
                    updatedAt: updatedUser.updated_at
                }
            }
        });

    } catch (error) {
        logger.error('管理員更新用戶資料錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '更新用戶資料失敗' }
        });
    }
});

module.exports = router;
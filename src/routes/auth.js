const express = require('express');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const database = require('../config/database');
const { generateToken, generateResetToken, authenticateToken } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 驗證schemas
const registerSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required(),
    fullName: Joi.string().min(2).max(100).required(),
    gradeLevel: Joi.string().valid('UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5').required(),
    specialty: Joi.string().max(50).optional(),
    hospital: Joi.string().max(100).optional()
});

const loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
});

// 註冊用戶
router.post('/register', rateLimiter.auth, async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: '資料驗證失敗',
                    details: error.details.map(detail => detail.message)
                }
            });
        }

        const { username, email, password, fullName, gradeLevel, specialty, hospital } = value;

        // 檢查用戶是否已存在
        const existingUser = await database.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: { message: '用戶名或電子郵件已存在' }
            });
        }

        // 加密密碼
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 創建新用戶
        const newUser = await database.query(`
            INSERT INTO users (username, email, password_hash, full_name, grade_level, specialty, hospital)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, username, email, full_name, grade_level, specialty, hospital, role, created_at
        `, [username, email, passwordHash, fullName, gradeLevel, specialty, hospital]);

        const user = newUser.rows[0];
        const token = generateToken(user.id);

        logger.info('新用戶註冊成功:', {
            userId: user.id,
            username: user.username,
            gradeLevel: user.grade_level
        });

        res.status(201).json({
            success: true,
            message: '註冊成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: user.full_name,
                    gradeLevel: user.grade_level,
                    specialty: user.specialty,
                    hospital: user.hospital,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {
        logger.error('用戶註冊錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '註冊過程發生錯誤' }
        });
    }
});

// 用戶登入
router.post('/login', rateLimiter.auth, async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: { message: '請提供用戶名和密碼' }
            });
        }

        const { username, password } = value;

        // 查找用戶
        const userResult = await database.query(`
            SELECT id, username, email, password_hash, full_name, grade_level, 
                   specialty, hospital, role, is_active
            FROM users 
            WHERE username = $1 OR email = $1
        `, [username]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: { message: '用戶名或密碼錯誤' }
            });
        }

        const user = userResult.rows[0];

        // 檢查用戶是否已啟用
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: { message: '帳號已被停用，請聯繫管理員' }
            });
        }

        // 驗證密碼
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: { message: '用戶名或密碼錯誤' }
            });
        }

        const token = generateToken(user.id);

        // 記錄登入日誌
        logger.info('用戶登入成功:', {
            userId: user.id,
            username: user.username,
            ip: req.ip
        });

        res.json({
            success: true,
            message: '登入成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: user.full_name,
                    gradeLevel: user.grade_level,
                    specialty: user.specialty,
                    hospital: user.hospital,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {
        logger.error('用戶登入錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '登入過程發生錯誤' }
        });
    }
});

// 驗證當前用戶
router.get('/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                user: {
                    id: req.user.id,
                    username: req.user.username,
                    email: req.user.email,
                    fullName: req.user.full_name,
                    gradeLevel: req.user.grade_level,
                    specialty: req.user.specialty,
                    hospital: req.user.hospital,
                    role: req.user.role
                }
            }
        });
    } catch (error) {
        logger.error('獲取用戶資訊錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '獲取用戶資訊失敗' }
        });
    }
});

// 登出（客戶端處理，這裡只是記錄）
router.post('/logout', authenticateToken, (req, res) => {
    logger.info('用戶登出:', {
        userId: req.user.id,
        username: req.user.username
    });

    res.json({
        success: true,
        message: '登出成功'
    });
});

// 密碼重設請求
router.post('/forgot-password', rateLimiter.auth, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: { message: '請提供電子郵件地址' }
            });
        }

        const userResult = await database.query(
            'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        // 即使用戶不存在，也返回成功消息（避免洩露用戶資訊）
        if (userResult.rows.length === 0) {
            return res.json({
                success: true,
                message: '如果該電子郵件地址存在，將收到重設密碼的指示'
            });
        }

        const user = userResult.rows[0];
        const resetToken = generateResetToken(user.id);

        // 在實際應用中，這裡會發送重設密碼的電子郵件
        logger.info('密碼重設請求:', {
            userId: user.id,
            email: user.email,
            resetToken // 實際應用中不應該記錄在日誌中
        });

        res.json({
            success: true,
            message: '重設密碼指示已發送到您的電子郵件',
            // 開發環境下返回重設令牌
            ...(process.env.NODE_ENV === 'development' && { resetToken })
        });

    } catch (error) {
        logger.error('密碼重設請求錯誤:', error);
        res.status(500).json({
            success: false,
            error: { message: '處理重設請求時發生錯誤' }
        });
    }
});

module.exports = router;
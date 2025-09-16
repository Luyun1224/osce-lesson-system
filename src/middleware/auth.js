const jwt = require('jsonwebtoken');
const database = require('../config/database');
const logger = require('../utils/logger');

// JWT令牌驗證中間件
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: { message: '存取令牌不存在' }
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 從資料庫獲取最新用戶資訊
        const userResult = await database.query(
            'SELECT id, username, email, full_name, grade_level, specialty, role, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: { message: '用戶不存在' }
            });
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: { message: '用戶帳號已被停用' }
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('JWT驗證失敗:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: { message: '令牌已過期，請重新登入' }
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: { message: '無效的令牌' }
            });
        }

        return res.status(500).json({
            success: false,
            error: { message: '驗證過程發生錯誤' }
        });
    }
};

// 角色權限驗證中間件
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: '未經認證' }
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            logger.warn('權限不足:', {
                userId: req.user.id,
                userRole,
                requiredRoles: allowedRoles,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                error: { message: '權限不足' }
            });
        }

        next();
    };
};

// 職級權限驗證中間件
const requireGradeLevel = (minLevel) => {
    const gradeLevels = ['UGY', 'PGY1', 'PGY2', 'R1', 'R2', 'R3', 'R4', 'R5'];
    
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: '未經認證' }
            });
        }

        const userGradeIndex = gradeLevels.indexOf(req.user.grade_level);
        const minLevelIndex = gradeLevels.indexOf(minLevel);

        if (userGradeIndex < minLevelIndex) {
            return res.status(403).json({
                success: false,
                error: { message: '職級權限不足' }
            });
        }

        next();
    };
};

// 資源擁有者驗證中間件
const requireOwnership = (resourceUserIdField = 'user_id') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: { message: '未經認證' }
                });
            }

            // 管理員可以存取所有資源
            if (req.user.role === 'admin') {
                return next();
            }

            const resourceId = req.params.id;
            
            if (!resourceId) {
                return res.status(400).json({
                    success: false,
                    error: { message: '缺少資源ID' }
                });
            }

            // 這裡需要根據不同的資源類型來查詢
            // 暫時先檢查用戶ID是否匹配
            req.resourceUserId = req.user.id;
            next();
        } catch (error) {
            logger.error('資源擁有者驗證錯誤:', error);
            return res.status(500).json({
                success: false,
                error: { message: '權限驗證過程發生錯誤' }
            });
        }
    };
};

// 生成JWT令牌
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRE_TIME || '24h') => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

// 生成重設密碼令牌
const generateResetToken = (userId) => {
    return jwt.sign(
        { userId, type: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
};

module.exports = {
    authenticateToken,
    requireRole,
    requireGradeLevel,
    requireOwnership,
    generateToken,
    generateResetToken
};
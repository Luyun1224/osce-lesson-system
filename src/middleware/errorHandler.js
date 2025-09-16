const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // 記錄錯誤
    logger.error(err.stack || err.message, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body,
        query: req.query,
        params: req.params
    });

    // PostgreSQL錯誤處理
    if (err.code) {
        switch (err.code) {
            case '23505': // 唯一性約束違反
                error.message = '資料已存在，請檢查是否重複';
                error.statusCode = 400;
                break;
            case '23503': // 外鍵約束違反
                error.message = '關聯資料不存在';
                error.statusCode = 400;
                break;
            case '23502': // 非空約束違反
                error.message = '必填欄位不能為空';
                error.statusCode = 400;
                break;
            case '08003': // 連接不存在
                error.message = '資料庫連接錯誤';
                error.statusCode = 500;
                break;
            default:
                error.message = '資料庫操作錯誤';
                error.statusCode = 500;
        }
    }

    // JWT錯誤處理
    if (err.name === 'JsonWebTokenError') {
        error.message = '無效的認證令牌';
        error.statusCode = 401;
    }

    if (err.name === 'TokenExpiredError') {
        error.message = '認證令牌已過期';
        error.statusCode = 401;
    }

    // Joi驗證錯誤處理
    if (err.name === 'ValidationError') {
        error.message = err.details ? err.details.map(detail => detail.message).join(', ') : '資料驗證失敗';
        error.statusCode = 400;
    }

    // 文件上傳錯誤處理
    if (err.code === 'LIMIT_FILE_SIZE') {
        error.message = '文件大小超過限制';
        error.statusCode = 400;
    }

    // 預設錯誤處理
    const statusCode = error.statusCode || 500;
    const message = error.message || '伺服器內部錯誤';

    // 回應錯誤
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
                details: error
            })
        },
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    });
};

// 處理未捕獲的Promise拒絕
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', reason);
    // 優雅關閉伺服器
    process.exit(1);
});

// 處理未捕獲的例外
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // 優雅關閉伺服器
    process.exit(1);
});

module.exports = errorHandler;
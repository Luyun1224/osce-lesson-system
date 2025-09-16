const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../utils/logger');

// 全域限流器
const globalLimiter = new RateLimiterMemory({
    keyPrefix: 'global',
    points: 100, // 每個時間窗口的請求數量
    duration: 60, // 時間窗口（秒）
    blockDuration: 60, // 封鎖時間（秒）
});

// API限流器
const apiLimiter = new RateLimiterMemory({
    keyPrefix: 'api',
    points: 50,
    duration: 60,
    blockDuration: 300,
});

// AI生成限流器（更嚴格）
const aiLimiter = new RateLimiterMemory({
    keyPrefix: 'ai',
    points: 10, // 每分鐘10次AI請求
    duration: 60,
    blockDuration: 600, // 封鎖10分鐘
});

// 認證限流器
const authLimiter = new RateLimiterMemory({
    keyPrefix: 'auth',
    points: 5, // 每10分鐘5次登入嘗試
    duration: 600,
    blockDuration: 900,
});

const rateLimitMiddleware = (limiterType = 'global') => {
    return async (req, res, next) => {
        let limiter = globalLimiter;
        
        // 根據路由選擇不同的限流器
        switch (limiterType) {
            case 'api':
                limiter = apiLimiter;
                break;
            case 'ai':
                limiter = aiLimiter;
                break;
            case 'auth':
                limiter = authLimiter;
                break;
            default:
                limiter = globalLimiter;
        }

        const key = req.ip; // 使用IP作為key
        
        try {
            const resRateLimiter = await limiter.consume(key);
            
            // 設置響應頭
            res.set({
                'X-RateLimit-Limit': limiter.points,
                'X-RateLimit-Remaining': resRateLimiter.remainingPoints,
                'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext).toISOString(),
            });
            
            next();
        } catch (rejRes) {
            // 記錄限流事件
            logger.warn('請求限流觸發', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                userAgent: req.get('User-Agent'),
                limiterType,
                remainingPoints: rejRes.remainingPoints,
                msBeforeNext: rejRes.msBeforeNext
            });

            const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
            
            res.set({
                'X-RateLimit-Limit': limiter.points,
                'X-RateLimit-Remaining': rejRes.remainingPoints,
                'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
                'Retry-After': secs,
            });

            res.status(429).json({
                success: false,
                error: {
                    message: '請求次數超過限制，請稍後再試',
                    retryAfter: secs,
                    type: 'RATE_LIMIT_EXCEEDED'
                },
                timestamp: new Date().toISOString()
            });
        }
    };
};

// 為不同路由匯出不同的中間件
module.exports = {
    global: rateLimitMiddleware('global'),
    api: rateLimitMiddleware('api'),
    ai: rateLimitMiddleware('ai'),
    auth: rateLimitMiddleware('auth'),
    custom: rateLimitMiddleware
};

// 預設匯出全域限流器
module.exports.default = rateLimitMiddleware('global');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// 路由模組
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const lessonRoutes = require('./routes/lessons');
const knowledgeRoutes = require('./routes/knowledge');
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// 基本中間件
app.use(helmet()); // 安全headers
app.use(compression()); // 壓縮響應
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(morgan('combined')); // HTTP請求日誌
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 限流中間件
app.use(rateLimiter.global);

// API路由
const apiPrefix = process.env.API_PREFIX || '/api/v1';

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/lessons`, lessonRoutes);
app.use(`${apiPrefix}/knowledge`, knowledgeRoutes);
app.use(`${apiPrefix}/ai`, aiRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API資訊端點
app.get(`${apiPrefix}`, (req, res) => {
    res.json({
        name: 'OSCE教案開發系統API',
        version: '1.0.0',
        description: '基於AI的OSCE教案自動生成與審核系統',
        endpoints: {
            auth: `${apiPrefix}/auth`,
            users: `${apiPrefix}/users`,
            lessons: `${apiPrefix}/lessons`,
            knowledge: `${apiPrefix}/knowledge`,
            ai: `${apiPrefix}/ai`,
            admin: `${apiPrefix}/admin`
        }
    });
});

// 404處理
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API端點不存在',
        path: req.originalUrl
    });
});

// 錯誤處理中間件
app.use(errorHandler);

// 資料庫連接和伺服器啟動
const startServer = async () => {
    try {
        // 測試資料庫連接（不強制要求）
        try {
            await database.testConnection();
            logger.info('資料庫連接成功');
        } catch (dbError) {
            logger.warn('資料庫連接失敗，系統將以測試模式運行:', dbError.message);
            logger.warn('部分功能（如用戶註冊、教案保存）將不可用');
        }

        app.listen(PORT, () => {
            logger.info(`\n🚀 OSCE教案系統API伺服器已啟動`);
            logger.info(`📡 服務端口: ${PORT}`);
            logger.info(`🌐 API基礎URL: http://localhost:${PORT}${apiPrefix}`);
            logger.info(`💚 健康檢查: http://localhost:${PORT}/health`);
            logger.info(`📚 模擬模式: ${process.env.MOCK_AI_RESPONSES === 'true' ? '已啟用' : '已關閉'}`);
            logger.info(`\n✨ 系統準備就緒！可以開始測試API功能`);
        });
    } catch (error) {
        logger.error('伺服器啟動失敗:', error);
        process.exit(1);
    }
};

// 優雅關閉處理
process.on('SIGTERM', () => {
    logger.info('收到SIGTERM信號，正在優雅關閉...');
    database.closeConnection();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('收到SIGINT信號，正在優雅關閉...');
    database.closeConnection();
    process.exit(0);
});

startServer();

module.exports = app;
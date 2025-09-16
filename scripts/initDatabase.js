const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${msg}`)
};

async function initializeDatabase() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'osce_lesson_system',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        logger.info('開始初始化資料庫...');

        // 測試資料庫連接
        await pool.query('SELECT NOW()');
        logger.success('資料庫連接成功');

        // 讀取並執行schema.sql
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
            
            // 分割SQL語句（簡單處理，實際應用中可能需要更複雜的解析）
            const statements = schemaSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            logger.info(`執行 ${statements.length} 個資料庫結構語句...`);
            
            for (const statement of statements) {
                if (statement.length > 0) {
                    try {
                        await pool.query(statement);
                    } catch (error) {
                        // 忽略已存在的表等錯誤
                        if (!error.message.includes('already exists')) {
                            throw error;
                        }
                    }
                }
            }
            
            logger.success('資料庫結構創建完成');
        } else {
            logger.error('找不到schema.sql文件');
        }

        // 讀取並執行seed_data.sql
        const seedPath = path.join(__dirname, '..', 'database', 'seed_data.sql');
        if (fs.existsSync(seedPath)) {
            const seedSQL = fs.readFileSync(seedPath, 'utf8');
            
            const statements = seedSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            logger.info(`執行 ${statements.length} 個初始化數據語句...`);
            
            for (const statement of statements) {
                if (statement.length > 0) {
                    try {
                        await pool.query(statement);
                    } catch (error) {
                        // 忽略重複插入等錯誤
                        if (!error.message.includes('duplicate key')) {
                            logger.error(`執行語句失敗: ${statement.substring(0, 100)}...`);
                            console.error(error.message);
                        }
                    }
                }
            }
            
            logger.success('初始化數據插入完成');
        } else {
            logger.error('找不到seed_data.sql文件');
        }

        // 驗證資料庫狀態
        const tableCheckQueries = [
            { name: 'users', query: 'SELECT COUNT(*) FROM users' },
            { name: 'grade_configs', query: 'SELECT COUNT(*) FROM grade_configs' },
            { name: 'osce_subjects', query: 'SELECT COUNT(*) FROM osce_subjects' },
            { name: 'osce_knowledge_base', query: 'SELECT COUNT(*) FROM osce_knowledge_base' },
            { name: 'lesson_templates', query: 'SELECT COUNT(*) FROM lesson_templates' }
        ];

        logger.info('驗證資料庫狀態...');
        for (const check of tableCheckQueries) {
            try {
                const result = await pool.query(check.query);
                const count = parseInt(result.rows[0].count);
                logger.info(`${check.name} 表: ${count} 筆記錄`);
            } catch (error) {
                logger.error(`檢查 ${check.name} 表失敗: ${error.message}`);
            }
        }

        logger.success('資料庫初始化完成！');
        
        // 顯示初始管理員帳號資訊
        logger.info('='.repeat(50));
        logger.info('系統已準備就緒，您可以：');
        logger.info('1. 使用註冊API創建新帳號');
        logger.info('2. 手動在資料庫中創建管理員帳號');
        logger.info('3. 啟動API伺服器: npm run dev');
        logger.info('='.repeat(50));

    } catch (error) {
        logger.error('資料庫初始化失敗:');
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// 創建管理員帳號的輔助函數
async function createAdminUser() {
    const bcrypt = require('bcryptjs');
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'osce_lesson_system',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        const adminUsername = 'admin';
        const adminEmail = 'admin@osce-system.com';
        const adminPassword = 'Admin123!'; // 預設密碼，實際使用時應立即更改
        
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        
        await pool.query(`
            INSERT INTO users (username, email, password_hash, full_name, grade_level, role)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (username) DO NOTHING
        `, [adminUsername, adminEmail, passwordHash, '系統管理員', 'R5', 'admin']);
        
        logger.success('管理員帳號已創建:');
        logger.info(`用戶名: ${adminUsername}`);
        logger.info(`密碼: ${adminPassword}`);
        logger.info('請立即登入並更改密碼！');
        
    } catch (error) {
        logger.error('創建管理員帳號失敗:', error.message);
    } finally {
        await pool.end();
    }
}

// 命令行參數處理
const args = process.argv.slice(2);

if (args.includes('--create-admin')) {
    createAdminUser();
} else {
    initializeDatabase();
}

module.exports = {
    initializeDatabase,
    createAdminUser
};
const { Pool } = require('pg');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'osce_lesson_system',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            max: 20, // 最大連接數
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        this.pool.on('error', (err) => {
            logger.error('資料庫連接池錯誤:', err);
        });
    }

    async testConnection() {
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            logger.info('資料庫連接測試成功:', result.rows[0]);
            return true;
        } catch (error) {
            logger.error('資料庫連接測試失敗:', error);
            throw error;
        }
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            if (duration > 1000) { // 記錄慢查詢
                logger.warn('慢查詢警告:', {
                    query: text,
                    duration: `${duration}ms`,
                    rows: res.rowCount
                });
            }

            return res;
        } catch (error) {
            logger.error('資料庫查詢錯誤:', {
                query: text,
                params,
                error: error.message
            });
            throw error;
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async closeConnection() {
        try {
            await this.pool.end();
            logger.info('資料庫連接池已關閉');
        } catch (error) {
            logger.error('關閉資料庫連接池失敗:', error);
        }
    }

    // 分頁查詢助手
    buildPaginationQuery(baseQuery, page = 1, limit = 20, orderBy = 'created_at DESC') {
        const offset = (page - 1) * limit;
        return {
            query: `${baseQuery} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
            countQuery: baseQuery.replace(/SELECT.*FROM/i, 'SELECT COUNT(*) FROM')
        };
    }

    // 建構WHERE條件助手
    buildWhereConditions(conditions) {
        const clauses = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(conditions).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    clauses.push(`${key} = ANY($${paramIndex})`);
                    values.push(value);
                } else if (typeof value === 'string' && value.includes('%')) {
                    clauses.push(`${key} ILIKE $${paramIndex}`);
                    values.push(value);
                } else {
                    clauses.push(`${key} = $${paramIndex}`);
                    values.push(value);
                }
                paramIndex++;
            }
        });

        return {
            whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
            values
        };
    }
}

module.exports = new Database();
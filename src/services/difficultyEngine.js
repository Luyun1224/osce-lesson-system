const database = require('../config/database');
const logger = require('../utils/logger');

/**
 * 智慧難度調整引擎
 * 根據用戶職級、專科、學習歷史等因素動態調整教案難度
 */
class DifficultyEngine {
    constructor() {
        // 職級難度映射
        this.gradeDifficultyMap = {
            'UGY': { level: 1, name: '醫學系學生', complexity: 0.2 },
            'PGY1': { level: 2, name: 'PGY第一年', complexity: 0.35 },
            'PGY2': { level: 3, name: 'PGY第二年', complexity: 0.5 },
            'R1': { level: 3, name: '住院醫師第一年', complexity: 0.55 },
            'R2': { level: 4, name: '住院醫師第二年', complexity: 0.7 },
            'R3': { level: 4, name: '住院醫師第三年', complexity: 0.8 },
            'R4': { level: 5, name: '住院醫師第四年', complexity: 0.9 },
            'R5': { level: 5, name: '住院醫師第五年', complexity: 1.0 }
        };

        // 專科難度調整係數
        this.specialtyModifiers = {
            '急診科': { emergency: 1.2, time_pressure: 1.3, decision_making: 1.2 },
            '外科': { technical: 1.3, precision: 1.2, anatomy: 1.3 },
            '內科': { diagnosis: 1.2, complexity: 1.1, reasoning: 1.2 },
            '小兒科': { communication: 1.3, development: 1.2, family: 1.1 },
            '婦產科': { sensitivity: 1.2, procedures: 1.3, counseling: 1.1 },
            '精神科': { communication: 1.4, empathy: 1.3, assessment: 1.2 },
            '家醫科': { comprehensive: 1.1, prevention: 1.1, continuity: 1.0 }
        };

        // 內容類型難度基線
        this.contentTypeDifficulty = {
            'skill': { base: 0.3, technical: 1.2, practice: 1.1 },
            'examination': { base: 0.4, observation: 1.1, interpretation: 1.2 },
            'procedure': { base: 0.6, technical: 1.3, safety: 1.2 },
            'disease': { base: 0.7, diagnosis: 1.2, management: 1.3 }
        };
    }

    /**
     * 計算動態難度係數
     * @param {object} params - 參數對象
     * @param {string} params.gradeLevel - 用戶職級
     * @param {string} params.specialty - 專科
     * @param {string} params.contentType - 內容類型
     * @param {number} params.baseDifficulty - 基礎難度 (1-5)
     * @param {object} params.userHistory - 用戶學習歷史
     * @param {object} params.knowledgeContext - 知識點上下文
     */
    async calculateDynamicDifficulty(params) {
        try {
            const {
                gradeLevel,
                specialty,
                contentType,
                baseDifficulty,
                userHistory,
                knowledgeContext
            } = params;

            logger.info('計算動態難度:', { gradeLevel, specialty, contentType, baseDifficulty });

            // 1. 基礎職級係數
            const gradeInfo = this.gradeDifficultyMap[gradeLevel];
            if (!gradeInfo) {
                throw new Error(`未知的職級: ${gradeLevel}`);
            }

            let difficultyScore = gradeInfo.complexity;

            // 2. 專科調整係數
            if (specialty && this.specialtyModifiers[specialty]) {
                const specialtyMod = this.specialtyModifiers[specialty];
                const avgModifier = Object.values(specialtyMod).reduce((sum, val) => sum + val, 0) / Object.keys(specialtyMod).length;
                difficultyScore *= avgModifier;
            }

            // 3. 內容類型調整
            if (this.contentTypeDifficulty[contentType]) {
                const contentMod = this.contentTypeDifficulty[contentType];
                difficultyScore = (difficultyScore + contentMod.base) / 2;
            }

            // 4. 基礎難度影響
            const normalizedBaseDifficulty = baseDifficulty / 5.0; // 正規化到 0-1
            difficultyScore = (difficultyScore + normalizedBaseDifficulty) / 2;

            // 5. 用戶歷史表現調整
            if (userHistory) {
                const historyAdjustment = await this.calculateHistoryAdjustment(userHistory, gradeLevel);
                difficultyScore *= historyAdjustment;
            }

            // 6. 知識點上下文調整
            if (knowledgeContext) {
                const contextAdjustment = this.calculateContextAdjustment(knowledgeContext);
                difficultyScore *= contextAdjustment;
            }

            // 確保難度分數在合理範圍內 (0.1 - 1.0)
            difficultyScore = Math.max(0.1, Math.min(1.0, difficultyScore));

            // 轉換回 1-5 級別，並提供詳細資訊
            const finalDifficultyLevel = Math.ceil(difficultyScore * 5);

            const result = {
                difficultyScore: parseFloat(difficultyScore.toFixed(3)),
                difficultyLevel: finalDifficultyLevel,
                adjustmentFactors: {
                    gradeLevel: gradeInfo.complexity,
                    specialty: specialty ? (this.specialtyModifiers[specialty] ? 'applied' : 'not_found') : 'none',
                    contentType: this.contentTypeDifficulty[contentType] ? 'applied' : 'default',
                    baseDifficulty: normalizedBaseDifficulty,
                    userHistory: userHistory ? 'considered' : 'none',
                    knowledgeContext: knowledgeContext ? 'applied' : 'none'
                },
                recommendation: this.getDifficultyRecommendation(difficultyScore, gradeLevel)
            };

            logger.info('難度計算結果:', result);
            return result;

        } catch (error) {
            logger.error('計算動態難度失敗:', error);
            throw error;
        }
    }

    /**
     * 根據用戶歷史計算調整係數
     */
    async calculateHistoryAdjustment(userHistory, gradeLevel) {
        try {
            const {
                avgQualityScore = 0.7,
                recentPerformance = 0.7,
                totalLessonsCompleted = 0,
                approvalRate = 0.7
            } = userHistory;

            // 基礎調整 - 根據平均品質分數
            let adjustment = 0.8 + (avgQualityScore * 0.4); // 0.8 - 1.2 範圍

            // 近期表現調整
            if (recentPerformance > 0.85) {
                adjustment *= 1.1; // 表現好，增加難度
            } else if (recentPerformance < 0.6) {
                adjustment *= 0.9; // 表現差，降低難度
            }

            // 經驗調整 - 完成的教案數量
            if (totalLessonsCompleted > 50) {
                adjustment *= 1.05; // 經驗豐富
            } else if (totalLessonsCompleted < 10) {
                adjustment *= 0.95; // 經驗不足
            }

            // 通過率調整
            if (approvalRate > 0.9) {
                adjustment *= 1.1;
            } else if (approvalRate < 0.5) {
                adjustment *= 0.85;
            }

            return Math.max(0.7, Math.min(1.3, adjustment));

        } catch (error) {
            logger.error('計算歷史調整係數失敗:', error);
            return 1.0; // 預設不調整
        }
    }

    /**
     * 根據知識點上下文計算調整係數
     */
    calculateContextAdjustment(knowledgeContext) {
        try {
            const {
                nationalExamFrequency = 50,
                clinicalImportance = 'medium',
                procedureComplexity = 'medium',
                differentialDiagnosisCount = 3
            } = knowledgeContext;

            let adjustment = 1.0;

            // 國考頻率調整
            if (nationalExamFrequency > 80) {
                adjustment *= 1.1; // 高頻考題，提高難度
            } else if (nationalExamFrequency < 30) {
                adjustment *= 0.95; // 低頻考題，稍微降低
            }

            // 臨床重要性調整
            switch (clinicalImportance) {
                case 'critical':
                    adjustment *= 1.15;
                    break;
                case 'high':
                    adjustment *= 1.1;
                    break;
                case 'low':
                    adjustment *= 0.9;
                    break;
                default: // medium
                    break;
            }

            // 程序複雜度調整
            switch (procedureComplexity) {
                case 'high':
                    adjustment *= 1.2;
                    break;
                case 'medium':
                    adjustment *= 1.0;
                    break;
                case 'low':
                    adjustment *= 0.9;
                    break;
            }

            // 鑑別診斷複雜度
            if (differentialDiagnosisCount > 5) {
                adjustment *= 1.1;
            } else if (differentialDiagnosisCount < 2) {
                adjustment *= 0.95;
            }

            return Math.max(0.8, Math.min(1.2, adjustment));

        } catch (error) {
            logger.error('計算上下文調整係數失敗:', error);
            return 1.0;
        }
    }

    /**
     * 獲取難度建議
     */
    getDifficultyRecommendation(difficultyScore, gradeLevel) {
        const recommendations = {
            low: {
                range: [0, 0.3],
                suggestion: '適合初學者，重點在基礎概念理解',
                focus: ['基本知識點', '簡單操作', '概念解釋'],
                timeAllocation: 'extended',
                supportLevel: 'high'
            },
            moderate: {
                range: [0.3, 0.6],
                suggestion: '適中難度，平衡理論與實踐',
                focus: ['概念應用', '標準程序', '常見情況'],
                timeAllocation: 'standard',
                supportLevel: 'moderate'
            },
            challenging: {
                range: [0.6, 0.8],
                suggestion: '具挑戰性，要求深入思考和分析',
                focus: ['複雜分析', '決策制定', '異常情況'],
                timeAllocation: 'standard',
                supportLevel: 'minimal'
            },
            advanced: {
                range: [0.8, 1.0],
                suggestion: '高難度，適合資深學習者',
                focus: ['專家級技能', '復雜情況', '創新思考'],
                timeAllocation: 'compressed',
                supportLevel: 'minimal'
            }
        };

        for (const [level, config] of Object.entries(recommendations)) {
            if (difficultyScore >= config.range[0] && difficultyScore <= config.range[1]) {
                return {
                    level,
                    ...config,
                    gradeAppropriate: this.isGradeAppropriate(level, gradeLevel)
                };
            }
        }

        return recommendations.moderate; // 預設
    }

    /**
     * 檢查難度是否適合職級
     */
    isGradeAppropriate(difficultyLevel, gradeLevel) {
        const appropriateMap = {
            'UGY': ['low', 'moderate'],
            'PGY1': ['low', 'moderate', 'challenging'],
            'PGY2': ['moderate', 'challenging'],
            'R1': ['moderate', 'challenging'],
            'R2': ['challenging', 'advanced'],
            'R3': ['challenging', 'advanced'],
            'R4': ['advanced'],
            'R5': ['advanced']
        };

        return appropriateMap[gradeLevel]?.includes(difficultyLevel) || false;
    }

    /**
     * 生成難度調整建議
     */
    async generateDifficultyAdjustmentSuggestions(userId, lessonHistory) {
        try {
            // 分析用戶最近的表現
            const recentLessons = lessonHistory.slice(-10); // 最近10個教案
            const avgScore = recentLessons.reduce((sum, lesson) => sum + (lesson.qualityScore || 0.7), 0) / recentLessons.length;
            const approvalRate = recentLessons.filter(lesson => lesson.status === 'approved').length / recentLessons.length;

            const suggestions = [];

            // 根據表現提供建議
            if (avgScore < 0.6) {
                suggestions.push({
                    type: 'difficulty_reduction',
                    message: '建議降低難度，重點加強基礎概念',
                    adjustment: -0.1,
                    reason: '近期品質分數較低'
                });
            } else if (avgScore > 0.9) {
                suggestions.push({
                    type: 'difficulty_increase',
                    message: '可以嘗試更具挑戰性的內容',
                    adjustment: 0.1,
                    reason: '近期表現優異'
                });
            }

            if (approvalRate < 0.5) {
                suggestions.push({
                    type: 'content_focus',
                    message: '建議加強特定領域的練習',
                    focus_areas: this.identifyWeakAreas(recentLessons),
                    reason: '通過率較低'
                });
            }

            return suggestions;

        } catch (error) {
            logger.error('生成難度調整建議失敗:', error);
            return [];
        }
    }

    /**
     * 識別薄弱領域
     */
    identifyWeakAreas(lessons) {
        const subjectPerformance = {};
        
        lessons.forEach(lesson => {
            const subject = lesson.subject || 'unknown';
            if (!subjectPerformance[subject]) {
                subjectPerformance[subject] = { total: 0, sum: 0 };
            }
            subjectPerformance[subject].total++;
            subjectPerformance[subject].sum += lesson.qualityScore || 0.7;
        });

        return Object.entries(subjectPerformance)
            .map(([subject, stats]) => ({
                subject,
                avgScore: stats.sum / stats.total,
                lessonCount: stats.total
            }))
            .filter(item => item.avgScore < 0.7)
            .sort((a, b) => a.avgScore - b.avgScore)
            .slice(0, 3) // 前3個薄弱領域
            .map(item => item.subject);
    }

    /**
     * 獲取難度統計報告
     */
    async getDifficultyStatistics(timeRange = '30d') {
        try {
            const timeCondition = timeRange === '7d' ? 
                "created_at >= NOW() - INTERVAL '7 days'" :
                "created_at >= NOW() - INTERVAL '30 days'";

            const result = await database.query(`
                SELECT 
                    grade_level,
                    specialty,
                    AVG(quality_score) as avg_quality,
                    COUNT(*) as lesson_count,
                    AVG(generation_time_seconds) as avg_generation_time,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
                FROM ai_lesson_generations 
                WHERE ${timeCondition}
                GROUP BY grade_level, specialty
                ORDER BY grade_level, specialty
            `);

            return result.rows.map(row => ({
                gradeLevel: row.grade_level,
                specialty: row.specialty,
                avgQuality: parseFloat(row.avg_quality || 0).toFixed(2),
                lessonCount: parseInt(row.lesson_count),
                avgGenerationTime: parseFloat(row.avg_generation_time || 0).toFixed(1),
                approvalRate: (parseInt(row.approved_count) / parseInt(row.lesson_count) * 100).toFixed(1)
            }));

        } catch (error) {
            logger.error('獲取難度統計失敗:', error);
            throw error;
        }
    }
}

// 單例模式
const difficultyEngine = new DifficultyEngine();

module.exports = difficultyEngine;
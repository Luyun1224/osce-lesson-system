const medicalValidator = require('./medicalValidator');
const lessonQualityAssessment = require('./lessonQualityAssessment');
const database = require('../config/database');
const logger = require('../utils/logger');

class ReviewWorkflow {
    constructor() {
        this.reviewStages = {
            PENDING: 'pending',
            AUTO_REVIEW: 'auto_review',
            HUMAN_REVIEW: 'human_review', 
            APPROVED: 'approved',
            REJECTED: 'rejected',
            REVISION_REQUIRED: 'revision_required'
        };

        this.autoReviewCriteria = {
            // 自動通過條件
            autoApprove: {
                minOverallScore: 85,
                minMedicalAccuracy: 0.8,
                maxSafetyIssues: 0,
                minQualityGrade: 'B'
            },
            // 自動拒絕條件
            autoReject: {
                maxOverallScore: 50,
                maxMedicalAccuracy: 0.5,
                minSafetyIssues: 3,
                maxQualityGrade: 'F'
            },
            // 需要人工審核條件（介於自動通過和拒絕之間）
            requireHumanReview: {
                scoreRange: [51, 84],
                medicalAccuracyRange: [0.5, 0.8],
                maxSafetyIssuesForReview: 2
            }
        };
    }

    /**
     * 開始完整審核流程
     * @param {Object} lessonData - 教案數據
     * @param {Object} context - 審核上下文
     * @returns {Object} 審核結果
     */
    async startReviewProcess(lessonData, context = {}) {
        try {
            logger.info('開始教案審核流程:', {
                lessonId: lessonData.id,
                title: lessonData.title,
                gradeLevel: context.gradeLevel
            });

            // 1. 創建審核記錄
            const reviewRecord = await this.createReviewRecord(lessonData, context);

            // 2. 執行自動審核
            const autoReviewResult = await this.performAutoReview(lessonData, context, reviewRecord.id);

            // 3. 根據自動審核結果決定下一步
            const finalResult = await this.processAutoReviewResult(
                autoReviewResult,
                reviewRecord.id,
                lessonData,
                context
            );

            // 4. 更新最終狀態
            await this.updateReviewRecord(reviewRecord.id, {
                status: finalResult.status,
                final_decision: finalResult.decision,
                completed_at: new Date().toISOString(),
                total_duration_minutes: Math.round((Date.now() - new Date(reviewRecord.created_at).getTime()) / 60000)
            });

            logger.info('教案審核流程完成:', {
                lessonId: lessonData.id,
                finalStatus: finalResult.status,
                decision: finalResult.decision
            });

            return {
                reviewId: reviewRecord.id,
                status: finalResult.status,
                decision: finalResult.decision,
                autoReview: autoReviewResult,
                humanReviewRequired: finalResult.humanReviewRequired,
                summary: finalResult.summary,
                recommendations: finalResult.recommendations,
                nextSteps: finalResult.nextSteps
            };

        } catch (error) {
            logger.error('審核流程失敗:', error);
            throw new Error(`審核流程失敗: ${error.message}`);
        }
    }

    /**
     * 創建審核記錄
     */
    async createReviewRecord(lessonData, context) {
        const result = await database.query(`
            INSERT INTO lesson_reviews (
                lesson_id, reviewer_type, status, grade_level, specialty,
                review_context, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `, [
            lessonData.id,
            'ai_auto',
            this.reviewStages.PENDING,
            context.gradeLevel,
            context.specialty,
            JSON.stringify(context),
            new Date().toISOString()
        ]);

        return result.rows[0];
    }

    /**
     * 執行自動審核
     */
    async performAutoReview(lessonData, context, reviewId) {
        logger.info('開始AI自動審核:', { reviewId, lessonId: lessonData.id });

        try {
            // 更新狀態為自動審核中
            await this.updateReviewRecord(reviewId, {
                status: this.reviewStages.AUTO_REVIEW,
                auto_review_started_at: new Date().toISOString()
            });

            // 並行執行醫學驗證和品質評估
            const [medicalValidation, qualityAssessment] = await Promise.all([
                medicalValidator.validateMedicalContent(lessonData, context),
                lessonQualityAssessment.assessLessonQuality(lessonData, context)
            ]);

            // 儲存自動審核結果
            await this.saveAutoReviewResults(reviewId, {
                medical_validation: medicalValidation,
                quality_assessment: qualityAssessment
            });

            const autoReviewResult = {
                medicalValidation,
                qualityAssessment,
                overallScore: this.calculateOverallScore(medicalValidation, qualityAssessment),
                reviewTimestamp: new Date().toISOString(),
                duration: Date.now() - new Date().getTime()
            };

            logger.info('AI自動審核完成:', {
                reviewId,
                overallScore: autoReviewResult.overallScore,
                medicalAccuracy: medicalValidation.overallScore,
                qualityScore: qualityAssessment.overallScore
            });

            return autoReviewResult;

        } catch (error) {
            logger.error('自動審核失敗:', error);
            
            // 標記審核失敗，需要人工介入
            await this.updateReviewRecord(reviewId, {
                status: this.reviewStages.HUMAN_REVIEW,
                auto_review_error: error.message,
                auto_review_failed_at: new Date().toISOString()
            });

            throw error;
        }
    }

    /**
     * 處理自動審核結果
     */
    async processAutoReviewResult(autoReviewResult, reviewId, lessonData, context) {
        const { overallScore, medicalValidation, qualityAssessment } = autoReviewResult;
        const criteria = this.autoReviewCriteria;

        // 檢查安全問題
        const safetyIssuesCount = medicalValidation.safetyIssues?.length || 0;
        const medicalAccuracy = medicalValidation.overallScore / 100;

        // 決策邏輯
        let decision, status, humanReviewRequired = false;
        let reasoning = [];

        // 1. 檢查自動拒絕條件
        if (
            overallScore <= criteria.autoReject.maxOverallScore ||
            medicalAccuracy <= criteria.autoReject.maxMedicalAccuracy ||
            safetyIssuesCount >= criteria.autoReject.minSafetyIssues ||
            qualityAssessment.grade.startsWith('F')
        ) {
            decision = 'REJECT';
            status = this.reviewStages.REJECTED;
            reasoning.push('未達最低品質標準');
            
            if (safetyIssuesCount >= criteria.autoReject.minSafetyIssues) {
                reasoning.push('存在重大醫學安全問題');
            }
        }
        // 2. 檢查自動通過條件
        else if (
            overallScore >= criteria.autoApprove.minOverallScore &&
            medicalAccuracy >= criteria.autoApprove.minMedicalAccuracy &&
            safetyIssuesCount <= criteria.autoApprove.maxSafetyIssues &&
            !qualityAssessment.grade.startsWith('D') &&
            !qualityAssessment.grade.startsWith('F')
        ) {
            decision = 'APPROVE';
            status = this.reviewStages.APPROVED;
            reasoning.push('符合自動通過標準');
        }
        // 3. 需要人工審核
        else {
            decision = 'HUMAN_REVIEW_REQUIRED';
            status = this.reviewStages.HUMAN_REVIEW;
            humanReviewRequired = true;
            reasoning.push('需要專家進一步評估');
            
            if (safetyIssuesCount > 0) {
                reasoning.push('存在需要專業判斷的醫學問題');
            }
        }

        // 生成摘要和建議
        const summary = this.generateReviewSummary(autoReviewResult, decision, reasoning);
        const recommendations = await this.generateReviewRecommendations(
            autoReviewResult,
            decision,
            context
        );
        const nextSteps = this.generateNextSteps(decision, humanReviewRequired);

        return {
            status,
            decision,
            humanReviewRequired,
            summary,
            recommendations,
            nextSteps,
            reasoning,
            scores: {
                overall: overallScore,
                medical: Math.round(medicalAccuracy * 100),
                quality: qualityAssessment.overallScore
            }
        };
    }

    /**
     * 計算整體分數
     */
    calculateOverallScore(medicalValidation, qualityAssessment) {
        // 醫學準確性權重 60%，品質評估權重 40%
        const medicalWeight = 0.6;
        const qualityWeight = 0.4;

        const medicalScore = medicalValidation.overallScore;
        const qualityScore = qualityAssessment.overallScore;

        return Math.round(medicalScore * medicalWeight + qualityScore * qualityWeight);
    }

    /**
     * 儲存自動審核結果
     */
    async saveAutoReviewResults(reviewId, results) {
        await database.query(`
            UPDATE lesson_reviews 
            SET 
                auto_review_results = $1,
                auto_review_completed_at = $2
            WHERE id = $3
        `, [
            JSON.stringify(results),
            new Date().toISOString(),
            reviewId
        ]);
    }

    /**
     * 更新審核記錄
     */
    async updateReviewRecord(reviewId, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        
        const values = [reviewId, ...Object.values(updates)];
        
        await database.query(`
            UPDATE lesson_reviews 
            SET ${setClause}
            WHERE id = $1
        `, values);
    }

    /**
     * 生成審核摘要
     */
    generateReviewSummary(autoReviewResult, decision, reasoning) {
        const { overallScore, medicalValidation, qualityAssessment } = autoReviewResult;
        
        let summary = `教案整體得分 ${overallScore} 分，`;
        
        switch (decision) {
            case 'APPROVE':
                summary += '品質符合標準，已自動通過審核。';
                break;
            case 'REJECT':
                summary += '存在重大品質或安全問題，已自動拒絕。';
                break;
            case 'HUMAN_REVIEW_REQUIRED':
                summary += '需要專家進一步審核評估。';
                break;
        }

        summary += ` 醫學準確性評分 ${medicalValidation.overallScore}，`;
        summary += `教學品質評分 ${qualityAssessment.overallScore}。`;

        if (reasoning.length > 0) {
            summary += ` 主要原因：${reasoning.join('、')}。`;
        }

        return summary;
    }

    /**
     * 生成審核建議
     */
    async generateReviewRecommendations(autoReviewResult, decision, context) {
        const recommendations = [];
        const { medicalValidation, qualityAssessment } = autoReviewResult;

        // 醫學驗證建議
        if (medicalValidation.recommendations) {
            recommendations.push(...medicalValidation.recommendations);
        }

        // 品質評估建議
        if (qualityAssessment.recommendations) {
            recommendations.push(...qualityAssessment.recommendations);
        }

        // 根據決策添加特定建議
        switch (decision) {
            case 'APPROVE':
                recommendations.push('教案品質良好，建議定期複審以維持標準');
                break;
            case 'REJECT':
                recommendations.push('建議重新設計教案，確保醫學準確性和教學品質');
                break;
            case 'HUMAN_REVIEW_REQUIRED':
                recommendations.push('提交專業醫學教育專家進行詳細評估');
                recommendations.push('準備相關參考資料以協助人工審核');
                break;
        }

        return recommendations.slice(0, 10); // 限制建議數量
    }

    /**
     * 生成後續步驟
     */
    generateNextSteps(decision, humanReviewRequired) {
        const nextSteps = [];

        switch (decision) {
            case 'APPROVE':
                nextSteps.push('教案已通過審核，可用於教學');
                nextSteps.push('建議6個月後進行例行複審');
                break;
            case 'REJECT':
                nextSteps.push('根據審核建議修改教案內容');
                nextSteps.push('解決所有安全性和準確性問題');
                nextSteps.push('完成修改後重新提交審核');
                break;
            case 'HUMAN_REVIEW_REQUIRED':
                nextSteps.push('等待專家審核排程');
                nextSteps.push('準備教案設計理念和參考資料');
                nextSteps.push('預計3-5個工作日內完成人工審核');
                break;
        }

        return nextSteps;
    }

    /**
     * 提交人工審核
     */
    async submitForHumanReview(reviewId, priority = 'normal') {
        try {
            // 更新狀態
            await this.updateReviewRecord(reviewId, {
                status: this.reviewStages.HUMAN_REVIEW,
                human_review_requested_at: new Date().toISOString(),
                human_review_priority: priority
            });

            // 這裡可以整合通知系統，通知審核專家
            logger.info('已提交人工審核:', { reviewId, priority });

            return {
                success: true,
                message: '已提交人工審核',
                estimatedReviewTime: priority === 'urgent' ? '24小時內' : '3-5個工作日',
                reviewId
            };

        } catch (error) {
            logger.error('提交人工審核失敗:', error);
            throw new Error(`提交人工審核失敗: ${error.message}`);
        }
    }

    /**
     * 處理人工審核結果
     */
    async processHumanReviewResult(reviewId, humanReviewData) {
        try {
            const { decision, comments, reviewer_id, revision_notes } = humanReviewData;

            let finalStatus;
            switch (decision.toLowerCase()) {
                case 'approve':
                    finalStatus = this.reviewStages.APPROVED;
                    break;
                case 'reject':
                    finalStatus = this.reviewStages.REJECTED;
                    break;
                case 'revision':
                    finalStatus = this.reviewStages.REVISION_REQUIRED;
                    break;
                default:
                    throw new Error(`無效的人工審核決策: ${decision}`);
            }

            await this.updateReviewRecord(reviewId, {
                status: finalStatus,
                human_reviewer_id: reviewer_id,
                human_review_decision: decision,
                human_review_comments: comments,
                revision_notes: revision_notes || null,
                human_review_completed_at: new Date().toISOString()
            });

            logger.info('人工審核結果已處理:', {
                reviewId,
                decision,
                finalStatus
            });

            return {
                success: true,
                finalStatus,
                decision,
                comments
            };

        } catch (error) {
            logger.error('處理人工審核結果失敗:', error);
            throw new Error(`處理人工審核結果失敗: ${error.message}`);
        }
    }

    /**
     * 獲取審核狀態
     */
    async getReviewStatus(reviewId) {
        const result = await database.query(`
            SELECT 
                lr.*,
                lg.title as lesson_title,
                lg.grade_level as lesson_grade_level
            FROM lesson_reviews lr
            LEFT JOIN ai_lesson_generations lg ON lr.lesson_id = lg.id
            WHERE lr.id = $1
        `, [reviewId]);

        if (result.rows.length === 0) {
            throw new Error('審核記錄不存在');
        }

        const review = result.rows[0];
        return {
            id: review.id,
            lessonId: review.lesson_id,
            lessonTitle: review.lesson_title,
            status: review.status,
            reviewerType: review.reviewer_type,
            autoReviewResults: review.auto_review_results,
            humanReviewDecision: review.human_review_decision,
            humanReviewComments: review.human_review_comments,
            createdAt: review.created_at,
            completedAt: review.completed_at,
            totalDuration: review.total_duration_minutes
        };
    }

    /**
     * 獲取審核統計
     */
    async getReviewStatistics(timeRange = '30d') {
        const timeCondition = timeRange === '7d' ? 
            "created_at >= NOW() - INTERVAL '7 days'" :
            "created_at >= NOW() - INTERVAL '30 days'";

        const result = await database.query(`
            SELECT 
                status,
                COUNT(*) as count,
                AVG(total_duration_minutes) as avg_duration,
                COUNT(CASE WHEN reviewer_type = 'ai_auto' THEN 1 END) as auto_reviews,
                COUNT(CASE WHEN human_reviewer_id IS NOT NULL THEN 1 END) as human_reviews
            FROM lesson_reviews
            WHERE ${timeCondition}
            GROUP BY status
        `);

        return {
            timeRange,
            statusDistribution: result.rows.reduce((acc, row) => {
                acc[row.status] = {
                    count: parseInt(row.count),
                    avgDuration: Math.round(parseFloat(row.avg_duration || 0))
                };
                return acc;
            }, {}),
            totalReviews: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
            autoReviewRate: result.rows.length > 0 ? 
                Math.round(result.rows[0].auto_reviews / result.rows.reduce((sum, row) => sum + parseInt(row.count), 0) * 100) : 0
        };
    }

    /**
     * 批量審核
     */
    async batchReview(lessons, context = {}) {
        const results = [];
        
        for (const lesson of lessons) {
            try {
                const reviewResult = await this.startReviewProcess(lesson, context);
                results.push({
                    lessonId: lesson.id,
                    reviewId: reviewResult.reviewId,
                    status: reviewResult.status,
                    decision: reviewResult.decision,
                    success: true
                });
            } catch (error) {
                logger.error(`批量審核失敗 - 教案ID: ${lesson.id}`, error);
                results.push({
                    lessonId: lesson.id,
                    error: error.message,
                    success: false
                });
            }
        }

        return {
            results,
            summary: {
                total: lessons.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                autoApproved: results.filter(r => r.success && r.decision === 'APPROVE').length,
                humanReviewRequired: results.filter(r => r.success && r.decision === 'HUMAN_REVIEW_REQUIRED').length
            }
        };
    }
}

// 單例模式
const reviewWorkflow = new ReviewWorkflow();

module.exports = reviewWorkflow;
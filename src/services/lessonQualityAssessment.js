const aiService = require('./aiService');
const logger = require('../utils/logger');

class LessonQualityAssessment {
    constructor() {
        this.assessmentCriteria = {
            // 教學結構評估標準 (30%)
            structure: {
                weight: 0.3,
                criteria: {
                    hasLearningObjectives: { weight: 0.3, description: '明確的學習目標' },
                    logicalFlow: { weight: 0.3, description: '邏輯性教學順序' },
                    completeness: { weight: 0.2, description: '內容完整性' },
                    timeManagement: { weight: 0.2, description: '時間分配合理性' }
                }
            },
            // 內容品質評估 (40%)
            content: {
                weight: 0.4,
                criteria: {
                    medicalAccuracy: { weight: 0.4, description: '醫學準確性' },
                    clinicalRelevance: { weight: 0.3, description: '臨床相關性' },
                    evidenceBased: { weight: 0.3, description: '實證醫學基礎' }
                }
            },
            // 教學效果評估 (20%)
            pedagogy: {
                weight: 0.2,
                criteria: {
                    engagementLevel: { weight: 0.3, description: '學習參與度' },
                    interactivity: { weight: 0.3, description: '互動性設計' },
                    assessmentMethods: { weight: 0.4, description: '評量方法適當性' }
                }
            },
            // 職級適配評估 (10%)
            gradeAlignment: {
                weight: 0.1,
                criteria: {
                    difficultyAlignment: { weight: 0.5, description: '難度適配性' },
                    vocabularyLevel: { weight: 0.3, description: '專業詞彙水平' },
                    conceptComplexity: { weight: 0.2, description: '概念複雜度' }
                }
            }
        };
    }

    /**
     * 評估教案整體品質
     * @param {Object} lessonData - 教案數據
     * @param {Object} context - 評估上下文（職級、專科等）
     * @returns {Object} 品質評估結果
     */
    async assessLessonQuality(lessonData, context = {}) {
        try {
            logger.info('開始教案品質評估:', { 
                lessonTitle: lessonData.title,
                gradeLevel: context.gradeLevel 
            });

            const assessmentResults = {};
            let totalWeightedScore = 0;

            // 並行執行各項評估
            const assessmentPromises = Object.entries(this.assessmentCriteria).map(
                async ([category, categoryConfig]) => {
                    const categoryResult = await this.assessCategory(
                        lessonData, 
                        category, 
                        categoryConfig, 
                        context
                    );
                    return { category, result: categoryResult };
                }
            );

            const results = await Promise.all(assessmentPromises);
            
            // 彙總結果
            for (const { category, result } of results) {
                assessmentResults[category] = result;
                totalWeightedScore += result.weightedScore;
            }

            // 生成整體評估
            const overallAssessment = await this.generateOverallAssessment(
                assessmentResults,
                totalWeightedScore,
                lessonData,
                context
            );

            const finalResult = {
                overallScore: Math.round(totalWeightedScore * 100),
                grade: this.getQualityGrade(totalWeightedScore),
                categoryScores: assessmentResults,
                overallAssessment,
                recommendations: await this.generateRecommendations(assessmentResults, context),
                assessmentTimestamp: new Date().toISOString(),
                assessmentVersion: '1.0'
            };

            logger.info('教案品質評估完成:', {
                overallScore: finalResult.overallScore,
                grade: finalResult.grade
            });

            return finalResult;

        } catch (error) {
            logger.error('教案品質評估失敗:', error);
            throw new Error(`品質評估失敗: ${error.message}`);
        }
    }

    /**
     * 評估特定類別
     */
    async assessCategory(lessonData, category, categoryConfig, context) {
        const categoryPrompt = this.buildCategoryPrompt(lessonData, category, categoryConfig, context);
        
        try {
            const aiResponse = await aiService.callAI({
                messages: [{ role: 'user', content: categoryPrompt }],
                model: 'gpt-4',
                maxTokens: 1500,
                temperature: 0.3
            });

            const assessment = this.parseAIAssessment(aiResponse.content);
            const weightedScore = assessment.score * categoryConfig.weight;

            return {
                score: assessment.score,
                weightedScore,
                feedback: assessment.feedback,
                criteriaScores: assessment.criteriaScores,
                strengths: assessment.strengths,
                weaknesses: assessment.weaknesses
            };

        } catch (error) {
            logger.error(`${category}類別評估失敗:`, error);
            // 返回預設評估
            return {
                score: 0.6,
                weightedScore: 0.6 * categoryConfig.weight,
                feedback: `${category}評估暫時無法完成`,
                criteriaScores: {},
                strengths: [],
                weaknesses: [`${category}評估系統暫時不可用`]
            };
        }
    }

    /**
     * 建構分類評估提示詞
     */
    buildCategoryPrompt(lessonData, category, categoryConfig, context) {
        const categoryDescriptions = {
            structure: '教學結構',
            content: '內容品質', 
            pedagogy: '教學效果',
            gradeAlignment: '職級適配'
        };

        return `
你是一位醫學教育專家，請評估以下OSCE教案在「${categoryDescriptions[category]}」方面的品質。

### 教案資料：
**標題**: ${lessonData.title || '未提供'}
**目標職級**: ${context.gradeLevel || '未指定'}
**專科**: ${context.specialty || '未指定'}
**學習目標**: ${lessonData.learningObjectives ? lessonData.learningObjectives.join(', ') : '未提供'}
**教學內容**: ${lessonData.content || lessonData.description || '未提供'}

### 評估標準：
${Object.entries(categoryConfig.criteria).map(([key, criterion]) => 
    `- ${criterion.description} (權重: ${criterion.weight * 100}%)`
).join('\n')}

### 評估要求：
1. 針對每個標準給出0-1的分數（0.9-1.0為優秀，0.7-0.89為良好，0.5-0.69為及格，0.5以下為不及格）
2. 提供具體的優點和改進建議
3. 總評分數應反映整體${categoryDescriptions[category]}水準

請以以下JSON格式回答：
{
    "score": 0.85,
    "feedback": "整體評估說明",
    "criteriaScores": {
        ${Object.keys(categoryConfig.criteria).map(key => `"${key}": 0.8`).join(',\n        ')}
    },
    "strengths": ["優點1", "優點2"],
    "weaknesses": ["待改進點1", "待改進點2"]
}`;
    }

    /**
     * 解析AI評估回應
     */
    parseAIAssessment(aiContent) {
        try {
            // 清理並解析JSON
            const cleanedContent = aiContent
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            
            const parsed = JSON.parse(cleanedContent);
            
            // 驗證必要欄位
            return {
                score: Math.max(0, Math.min(1, parsed.score || 0.6)),
                feedback: parsed.feedback || '評估完成',
                criteriaScores: parsed.criteriaScores || {},
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : []
            };
            
        } catch (error) {
            logger.warn('AI評估回應解析失敗，使用預設值:', error);
            return {
                score: 0.6,
                feedback: 'AI評估回應格式異常，使用預設評分',
                criteriaScores: {},
                strengths: [],
                weaknesses: ['AI評估系統回應異常']
            };
        }
    }

    /**
     * 生成整體評估
     */
    async generateOverallAssessment(assessmentResults, totalScore, lessonData, context) {
        const overallPrompt = `
你是一位資深醫學教育專家，請基於以下各項評估結果，撰寫一份綜合性的教案品質評估報告。

### 教案資訊：
- 標題: ${lessonData.title || '未提供'}
- 職級: ${context.gradeLevel || '未指定'}
- 專科: ${context.specialty || '未指定'}
- 整體分數: ${Math.round(totalScore * 100)}分

### 各項評估結果：
${Object.entries(assessmentResults).map(([category, result]) => 
    `**${category}** (${Math.round(result.score * 100)}分):\n${result.feedback}`
).join('\n\n')}

請撰寫一份200-300字的綜合評估，包含：
1. 教案整體表現總結
2. 主要優勢分析
3. 核心改進建議
4. 對目標學習者的適用性評價

請以專業但易懂的語言撰寫。`;

        try {
            const response = await aiService.callAI({
                messages: [{ role: 'user', content: overallPrompt }],
                model: 'gpt-4',
                maxTokens: 800,
                temperature: 0.4
            });

            return response.content.trim();
        } catch (error) {
            logger.error('生成整體評估失敗:', error);
            return this.generateFallbackAssessment(totalScore, assessmentResults);
        }
    }

    /**
     * 生成改進建議
     */
    async generateRecommendations(assessmentResults, context) {
        const recommendations = [];
        
        // 收集所有弱點
        const allWeaknesses = [];
        Object.values(assessmentResults).forEach(result => {
            allWeaknesses.push(...result.weaknesses);
        });

        if (allWeaknesses.length === 0) {
            return ['教案品質良好，建議繼續保持現有水準'];
        }

        const recommendationPrompt = `
基於以下教案評估中發現的問題點，請提供具體可行的改進建議：

問題清單：
${allWeaknesses.map((weakness, index) => `${index + 1}. ${weakness}`).join('\n')}

目標職級：${context.gradeLevel || '未指定'}
專科領域：${context.specialty || '未指定'}

請針對每個問題提供：
1. 具體的改進方法
2. 實施的優先級（高/中/低）
3. 預期的改善效果

請以清單格式回答，每項建議控制在50字以內。`;

        try {
            const response = await aiService.callAI({
                messages: [{ role: 'user', content: recommendationPrompt }],
                model: 'gpt-3.5-turbo',
                maxTokens: 600,
                temperature: 0.3
            });

            // 解析建議清單
            const suggestionLines = response.content
                .split('\n')
                .filter(line => line.trim())
                .map(line => line.replace(/^\d+\.?\s*/, '').trim())
                .filter(line => line.length > 10);

            return suggestionLines.length > 0 ? suggestionLines.slice(0, 8) : 
                ['建議加強醫學內容準確性', '改善教學方法互動性', '調整內容適應目標職級'];

        } catch (error) {
            logger.error('生成改進建議失敗:', error);
            return this.generateFallbackRecommendations(assessmentResults);
        }
    }

    /**
     * 獲取品質等級
     */
    getQualityGrade(score) {
        if (score >= 0.9) return 'A (優秀)';
        if (score >= 0.8) return 'B (良好)';
        if (score >= 0.7) return 'C (及格)';
        if (score >= 0.6) return 'D (待改進)';
        return 'F (不合格)';
    }

    /**
     * 預設綜合評估
     */
    generateFallbackAssessment(totalScore, assessmentResults) {
        const grade = this.getQualityGrade(totalScore);
        const scorePercentage = Math.round(totalScore * 100);
        
        return `本教案整體獲得${scorePercentage}分，等級為${grade}。` +
               `在${Object.keys(assessmentResults).length}個評估面向中，` +
               `表現${scorePercentage >= 80 ? '優良' : scorePercentage >= 70 ? '良好' : '尚可'}。` +
               `建議持續改進教學內容品質與結構設計，以提升整體教學效果。`;
    }

    /**
     * 預設改進建議
     */
    generateFallbackRecommendations(assessmentResults) {
        const recommendations = [];
        
        Object.entries(assessmentResults).forEach(([category, result]) => {
            if (result.score < 0.7) {
                switch (category) {
                    case 'structure':
                        recommendations.push('加強教學結構邏輯性與完整性');
                        break;
                    case 'content':
                        recommendations.push('提升醫學內容準確性與臨床相關性');
                        break;
                    case 'pedagogy':
                        recommendations.push('增進教學互動設計與學習參與度');
                        break;
                    case 'gradeAlignment':
                        recommendations.push('調整內容難度以符合目標職級需求');
                        break;
                }
            }
        });

        return recommendations.length > 0 ? recommendations : 
            ['持續優化教學內容與方法', '加強與目標學習者需求的對接'];
    }

    /**
     * 批量評估教案品質
     */
    async batchAssessLessons(lessons, context = {}) {
        const results = [];
        
        for (const lesson of lessons) {
            try {
                const assessment = await this.assessLessonQuality(lesson, context);
                results.push({
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    assessment,
                    success: true
                });
            } catch (error) {
                logger.error(`批量評估失敗 - 教案ID: ${lesson.id}`, error);
                results.push({
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
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
                averageScore: this.calculateAverageScore(results)
            }
        };
    }

    /**
     * 計算平均分數
     */
    calculateAverageScore(results) {
        const validResults = results.filter(r => r.success && r.assessment);
        if (validResults.length === 0) return 0;
        
        const totalScore = validResults.reduce((sum, result) => 
            sum + result.assessment.overallScore, 0
        );
        
        return Math.round(totalScore / validResults.length);
    }

    /**
     * 獲取評估統計資料
     */
    getAssessmentStatistics(assessments) {
        const stats = {
            totalAssessments: assessments.length,
            averageScore: 0,
            gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
            categoryAverages: {},
            topWeaknesses: {},
            improvementTrends: []
        };

        if (assessments.length === 0) return stats;

        // 計算平均分數
        const totalScore = assessments.reduce((sum, assessment) => 
            sum + (assessment.overallScore || 0), 0
        );
        stats.averageScore = Math.round(totalScore / assessments.length);

        // 計算等級分布
        assessments.forEach(assessment => {
            const grade = assessment.grade ? assessment.grade.charAt(0) : 'F';
            stats.gradeDistribution[grade] = (stats.gradeDistribution[grade] || 0) + 1;
        });

        // 計算各類別平均分數
        const categories = ['structure', 'content', 'pedagogy', 'gradeAlignment'];
        categories.forEach(category => {
            const categoryScores = assessments
                .map(a => a.categoryScores?.[category]?.score || 0)
                .filter(score => score > 0);
            
            if (categoryScores.length > 0) {
                stats.categoryAverages[category] = Math.round(
                    categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length * 100
                );
            }
        });

        return stats;
    }
}

// 單例模式
const lessonQualityAssessment = new LessonQualityAssessment();

module.exports = lessonQualityAssessment;
const aiService = require('./aiService');
const database = require('../config/database');
const logger = require('../utils/logger');

/**
 * 醫學內容驗證引擎
 * 專門負責驗證OSCE教案中醫學內容的準確性和完整性
 */
class MedicalValidator {
    constructor() {
        // 醫學驗證系統提示詞
        this.systemPrompts = {
            medicalAccuracy: `你是一位資深的醫學教育專家和臨床醫師，專精於醫學內容的準確性驗證。

你的任務是評估OSCE教案內容的醫學準確性，包括：
1. 疾病診斷和鑑別診斷的正確性
2. 檢查方法和程序的適當性  
3. 治療方案的合理性和安全性
4. 藥物使用的正確性（劑量、禁忌症、副作用）
5. 醫學術語使用的準確性
6. 臨床流程的合理性

評估標準：
- 完全正確 (0.9-1.0): 無醫學錯誤，完全符合現行醫學標準
- 大致正確 (0.7-0.89): 主要內容正確，有輕微不夠精確的地方
- 部分錯誤 (0.5-0.69): 有明顯醫學錯誤或不當建議
- 嚴重錯誤 (0.3-0.49): 有危險的醫學錯誤或誤導性內容
- 完全錯誤 (0.0-0.29): 醫學內容完全錯誤或有害

請以JSON格式回應，包含分數、錯誤列表和建議修正。`,

            clinicalRelevance: `你是臨床醫學專家，專門評估醫學教育內容的臨床相關性和實用性。

評估要點：
1. 內容是否反映實際臨床實務
2. 是否涵蓋重要的臨床技能
3. 病例場景的真實性和代表性
4. 診療流程是否符合臨床指引
5. 評分標準是否客觀可行

回應格式為JSON，包含相關性評分和改進建議。`,

            pedagogicalQuality: `你是醫學教育學專家，專門評估教學內容的教育品質。

評估維度：
1. 學習目標明確性
2. 內容組織邏輯性
3. 評估方法合理性
4. 難度適中性
5. 互動性和參與度
6. 時間分配合理性

請提供教育學角度的評估和建議。`
        };

        // 醫學知識庫參考標準
        this.medicalStandards = {
            diagnosticCriteria: [
                '國際疾病分類 ICD-11',
                'DSM-5 精神疾病診斷',
                'WHO 臨床指引',
                '台灣醫學會指引'
            ],
            procedureStandards: [
                '臨床技能標準作業程序',
                '感染控制指引',
                '病人安全準則'
            ],
            medicationSafety: [
                '藥物交互作用檢查',
                '劑量安全範圍',
                '禁忌症確認',
                '副作用監測'
            ]
        };

        // 常見醫學錯誤模式
        this.commonErrors = {
            diagnostic: [
                '診斷標準不完整',
                '鑑別診斷遺漏',
                '檢查順序不當',
                '危險信號忽略'
            ],
            therapeutic: [
                '藥物劑量錯誤',
                '禁忌症未考慮',
                '治療順序不當',
                '副作用監測不足'
            ],
            procedural: [
                '無菌技術缺失',
                '安全步驟遺漏',
                '併發症處理不當',
                '設備使用錯誤'
            ]
        };
    }

    /**
     * 綜合醫學內容驗證
     * @param {object} lessonContent - 教案內容
     * @param {object} context - 驗證上下文
     */
    async validateMedicalContent(lessonContent, context = {}) {
        try {
            logger.info('開始醫學內容驗證:', { 
                title: lessonContent.title,
                gradeLevel: context.gradeLevel 
            });

            const startTime = Date.now();

            // 並行執行多個驗證維度
            const validationPromises = [
                this.validateMedicalAccuracy(lessonContent, context),
                this.validateClinicalRelevance(lessonContent, context),
                this.validatePedagogicalQuality(lessonContent, context)
            ];

            const [accuracyResult, relevanceResult, qualityResult] = await Promise.allSettled(validationPromises);

            // 處理驗證結果
            const validation = {
                medicalAccuracy: this.processValidationResult(accuracyResult, 'accuracy'),
                clinicalRelevance: this.processValidationResult(relevanceResult, 'relevance'),
                pedagogicalQuality: this.processValidationResult(qualityResult, 'quality')
            };

            // 計算綜合分數
            const overallScore = this.calculateOverallScore(validation);

            // 生成建議和警告
            const recommendations = await this.generateRecommendations(validation, lessonContent);
            const warnings = this.identifyWarnings(validation);

            const result = {
                overallScore,
                validation,
                recommendations,
                warnings,
                validationTime: Date.now() - startTime,
                validatedAt: new Date().toISOString(),
                validator: 'MedicalValidator',
                context
            };

            logger.info('醫學內容驗證完成:', {
                overallScore: result.overallScore.toFixed(3),
                validationTime: result.validationTime,
                warningsCount: warnings.length
            });

            return result;

        } catch (error) {
            logger.error('醫學內容驗證失敗:', error);
            throw error;
        }
    }

    /**
     * 驗證醫學準確性
     */
    async validateMedicalAccuracy(lessonContent, context) {
        try {
            const prompt = this.buildMedicalAccuracyPrompt(lessonContent, context);
            
            const aiResponse = await aiService.callAI(
                'claude-3-sonnet', // 使用Claude進行醫學內容驗證
                prompt,
                {
                    systemPrompt: this.systemPrompts.medicalAccuracy,
                    maxTokens: 2000,
                    temperature: 0.1 // 低溫度確保一致性
                }
            );

            return this.parseValidationResponse(aiResponse.content, 'medical_accuracy');

        } catch (error) {
            logger.error('醫學準確性驗證失敗:', error);
            return this.getDefaultValidationResult('medical_accuracy', 0.5);
        }
    }

    /**
     * 驗證臨床相關性
     */
    async validateClinicalRelevance(lessonContent, context) {
        try {
            const prompt = this.buildClinicalRelevancePrompt(lessonContent, context);
            
            const aiResponse = await aiService.callAI(
                'gpt-4',
                prompt,
                {
                    systemPrompt: this.systemPrompts.clinicalRelevance,
                    maxTokens: 1500,
                    temperature: 0.2
                }
            );

            return this.parseValidationResponse(aiResponse.content, 'clinical_relevance');

        } catch (error) {
            logger.error('臨床相關性驗證失敗:', error);
            return this.getDefaultValidationResult('clinical_relevance', 0.6);
        }
    }

    /**
     * 驗證教學品質
     */
    async validatePedagogicalQuality(lessonContent, context) {
        try {
            const prompt = this.buildPedagogicalPrompt(lessonContent, context);
            
            const aiResponse = await aiService.callAI(
                'gpt-3.5-turbo',
                prompt,
                {
                    systemPrompt: this.systemPrompts.pedagogicalQuality,
                    maxTokens: 1200,
                    temperature: 0.3
                }
            );

            return this.parseValidationResponse(aiResponse.content, 'pedagogical_quality');

        } catch (error) {
            logger.error('教學品質驗證失敗:', error);
            return this.getDefaultValidationResult('pedagogical_quality', 0.7);
        }
    }

    /**
     * 建構醫學準確性驗證提示詞
     */
    buildMedicalAccuracyPrompt(lessonContent, context) {
        return `
請驗證以下OSCE教案的醫學準確性：

**教案資訊：**
- 標題: ${lessonContent.title}
- 目標職級: ${context.gradeLevel || '未指定'}
- 專科: ${context.specialty || '一般醫學'}

**教學目標：**
${JSON.stringify(lessonContent.objective, null, 2)}

**病例場景：**
${JSON.stringify(lessonContent.scenario, null, 2)}

**教案內容段落：**
${JSON.stringify(lessonContent.sections, null, 2)}

**評估標準：**
${JSON.stringify(lessonContent.overallAssessment, null, 2)}

請特別注意：
1. 診斷標準和流程是否正確
2. 檢查方法是否適當
3. 治療建議是否安全有效
4. 醫學術語使用是否準確
5. 是否有潛在的醫療安全風險

請以以下JSON格式回應：
{
    "score": 0.85,
    "errors": [
        {
            "type": "diagnostic",
            "severity": "moderate",
            "location": "section 2",
            "description": "錯誤描述",
            "correction": "建議修正"
        }
    ],
    "strengths": ["優點1", "優點2"],
    "improvements": ["改進建議1", "改進建議2"],
    "safetyIssues": ["安全問題1"],
    "confidence": 0.9
}
        `.trim();
    }

    /**
     * 建構臨床相關性驗證提示詞
     */
    buildClinicalRelevancePrompt(lessonContent, context) {
        return `
評估OSCE教案的臨床相關性和實用性：

**教案標題：** ${lessonContent.title}
**目標學員：** ${context.gradeLevel || '未指定'}職級

**場景描述：**
${JSON.stringify(lessonContent.scenario, null, 2)}

**評估重點：**
1. 病例是否反映真實臨床情況
2. 診療流程是否符合臨床實務
3. 技能訓練是否實用
4. 評分標準是否客觀可行
5. 內容是否涵蓋重要臨床技能

請提供JSON格式評估：
{
    "score": 0.8,
    "clinicalRealism": 0.85,
    "practicalUtility": 0.75,
    "comprehensiveness": 0.8,
    "feedback": "整體評估意見",
    "suggestions": ["建議1", "建議2"]
}
        `.trim();
    }

    /**
     * 建構教學品質驗證提示詞
     */
    buildPedagogicalPrompt(lessonContent, context) {
        return `
評估OSCE教案的教學品質：

**教案概要：**
- 標題: ${lessonContent.title}
- 時長: ${lessonContent.duration} 分鐘
- 目標: ${JSON.stringify(lessonContent.objective)}

**教學結構：**
${lessonContent.sections?.map(section => `
- ${section.name} (${section.duration}分鐘)
  描述: ${section.description}
  任務: ${JSON.stringify(section.tasks)}
`).join('\n')}

評估維度：
1. 學習目標的明確性和可測量性
2. 內容組織的邏輯性
3. 時間分配的合理性
4. 評估方法的有效性
5. 學員參與度和互動性

JSON回應格式：
{
    "score": 0.8,
    "objectiveClarity": 0.9,
    "contentOrganization": 0.8,
    "timeAllocation": 0.7,
    "assessmentQuality": 0.8,
    "engagement": 0.75,
    "recommendations": ["建議1", "建議2"]
}
        `.trim();
    }

    /**
     * 解析驗證回應
     */
    parseValidationResponse(content, validationType) {
        try {
            // 提取JSON部分
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    success: true,
                    data: parsed,
                    type: validationType
                };
            } else {
                throw new Error('無法找到JSON回應');
            }
        } catch (parseError) {
            logger.warn(`解析${validationType}驗證回應失敗:`, parseError);
            return this.getDefaultValidationResult(validationType, 0.6);
        }
    }

    /**
     * 處理驗證結果
     */
    processValidationResult(result, type) {
        if (result.status === 'fulfilled' && result.value.success) {
            return result.value.data;
        } else {
            logger.warn(`${type}驗證失敗，使用預設值:`, result.reason);
            return this.getDefaultValidationResult(type, 0.6).data;
        }
    }

    /**
     * 獲取預設驗證結果
     */
    getDefaultValidationResult(type, score) {
        const defaults = {
            medical_accuracy: {
                score,
                errors: [],
                strengths: ['需要人工檢查'],
                improvements: ['建議進行人工驗證'],
                safetyIssues: [],
                confidence: 0.3
            },
            clinical_relevance: {
                score,
                clinicalRealism: score,
                practicalUtility: score,
                comprehensiveness: score,
                feedback: '需要專家評估',
                suggestions: ['建議諮詢臨床專家']
            },
            pedagogical_quality: {
                score,
                objectiveClarity: score,
                contentOrganization: score,
                timeAllocation: score,
                assessmentQuality: score,
                engagement: score,
                recommendations: ['需要教學專家評估']
            }
        };

        return {
            success: false,
            data: defaults[type] || { score, error: '驗證失敗' },
            type
        };
    }

    /**
     * 計算綜合分數
     */
    calculateOverallScore(validation) {
        const weights = {
            medicalAccuracy: 0.5,    // 醫學準確性權重最高
            clinicalRelevance: 0.3,   // 臨床相關性次之
            pedagogicalQuality: 0.2   // 教學品質權重較低
        };

        let totalScore = 0;
        let totalWeight = 0;

        Object.entries(weights).forEach(([key, weight]) => {
            if (validation[key] && validation[key].score !== undefined) {
                totalScore += validation[key].score * weight;
                totalWeight += weight;
            }
        });

        return totalWeight > 0 ? totalScore / totalWeight : 0.5;
    }

    /**
     * 生成改進建議
     */
    async generateRecommendations(validation, lessonContent) {
        const recommendations = [];

        // 醫學準確性建議
        if (validation.medicalAccuracy.score < 0.7) {
            recommendations.push({
                type: 'medical_accuracy',
                priority: 'high',
                message: '建議醫學專家進行內容審查',
                details: validation.medicalAccuracy.improvements || []
            });
        }

        // 安全性警告
        if (validation.medicalAccuracy.safetyIssues?.length > 0) {
            recommendations.push({
                type: 'safety_warning',
                priority: 'critical',
                message: '發現潛在醫療安全問題，需立即檢查',
                details: validation.medicalAccuracy.safetyIssues
            });
        }

        // 臨床相關性建議
        if (validation.clinicalRelevance.score < 0.6) {
            recommendations.push({
                type: 'clinical_relevance',
                priority: 'medium',
                message: '建議增強臨床實務相關性',
                details: validation.clinicalRelevance.suggestions || []
            });
        }

        // 教學品質建議
        if (validation.pedagogicalQuality.score < 0.6) {
            recommendations.push({
                type: 'pedagogical_quality',
                priority: 'medium',
                message: '建議改進教學設計',
                details: validation.pedagogicalQuality.recommendations || []
            });
        }

        return recommendations;
    }

    /**
     * 識別警告事項
     */
    identifyWarnings(validation) {
        const warnings = [];

        // 醫學準確性警告
        if (validation.medicalAccuracy.score < 0.5) {
            warnings.push({
                type: 'medical_accuracy',
                severity: 'high',
                message: '醫學內容準確性不足，建議重新審查'
            });
        }

        // 安全問題警告
        if (validation.medicalAccuracy.safetyIssues?.length > 0) {
            warnings.push({
                type: 'safety_critical',
                severity: 'critical',
                message: '發現醫療安全風險，請立即處理'
            });
        }

        // 信心度過低警告
        if (validation.medicalAccuracy.confidence < 0.5) {
            warnings.push({
                type: 'low_confidence',
                severity: 'medium',
                message: 'AI驗證信心度較低，建議人工複查'
            });
        }

        return warnings;
    }

    /**
     * 批量驗證教案
     */
    async batchValidate(lessonContents, contexts = []) {
        const results = [];
        
        for (let i = 0; i < lessonContents.length; i++) {
            try {
                const context = contexts[i] || {};
                const result = await this.validateMedicalContent(lessonContents[i], context);
                results.push({
                    index: i,
                    success: true,
                    validation: result
                });
            } catch (error) {
                results.push({
                    index: i,
                    success: false,
                    error: error.message
                });
            }

            // 批次間暫停避免API限制
            if (i < lessonContents.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return results;
    }

    /**
     * 獲取驗證統計
     */
    async getValidationStatistics(timeRange = '30d') {
        try {
            const timeCondition = timeRange === '7d' ? 
                "reviewed_at >= NOW() - INTERVAL '7 days'" :
                "reviewed_at >= NOW() - INTERVAL '30 days'";

            const result = await database.query(`
                SELECT 
                    reviewer_type,
                    AVG(medical_accuracy_score) as avg_medical_accuracy,
                    AVG(grade_appropriateness_score) as avg_grade_appropriateness,
                    AVG(learning_objective_score) as avg_learning_objective,
                    AVG(overall_quality_score) as avg_overall_quality,
                    COUNT(*) as review_count,
                    COUNT(CASE WHEN approval_status = 'approved' THEN 1 END) as approved_count
                FROM ai_review_logs 
                WHERE ${timeCondition}
                GROUP BY reviewer_type
                ORDER BY reviewer_type
            `);

            return result.rows.map(row => ({
                reviewerType: row.reviewer_type,
                averageScores: {
                    medicalAccuracy: parseFloat(row.avg_medical_accuracy || 0).toFixed(2),
                    gradeAppropriateness: parseFloat(row.avg_grade_appropriateness || 0).toFixed(2),
                    learningObjective: parseFloat(row.avg_learning_objective || 0).toFixed(2),
                    overallQuality: parseFloat(row.avg_overall_quality || 0).toFixed(2)
                },
                reviewCount: parseInt(row.review_count),
                approvalRate: (parseInt(row.approved_count) / parseInt(row.review_count) * 100).toFixed(1)
            }));

        } catch (error) {
            logger.error('獲取驗證統計失敗:', error);
            throw error;
        }
    }
}

// 單例模式
const medicalValidator = new MedicalValidator();

module.exports = medicalValidator;
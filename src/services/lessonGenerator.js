const aiService = require('./aiService');
const difficultyEngine = require('./difficultyEngine');
const database = require('../config/database');
const logger = require('../utils/logger');

/**
 * OSCE教案內容生成引擎
 * 整合AI服務和難度調整算法，生成個人化教案內容
 */
class LessonGenerator {
    constructor() {
        // 系統提示詞模板
        this.systemPrompts = {
            lessonGeneration: `你是一位專業的OSCE(客觀結構化臨床考試)教案開發專家。你的任務是根據提供的參數生成高品質的教案內容。

請遵循以下原則：
1. 內容必須符合台灣醫學教育標準
2. 根據學員職級調整內容深度和複雜度
3. 確保醫學內容的準確性和時效性
4. 提供結構化、實用的教學內容
5. 包含具體的評分標準和時間分配

回應格式必須是有效的JSON，包含完整的教案結構。`,

            difficultyAdjustment: `你是醫學教育難度調整專家。根據學員職級和能力，調整教案內容的複雜度和深度。

調整原則：
- UGY/PGY1: 基礎概念，簡單病例
- PGY2/R1: 標準病例，診斷推理
- R2/R3: 複雜病例，臨床決策
- R4/R5: 疑難病例，專家級判斷`,

            contentValidation: `你是醫學內容驗證專家。檢查教案內容的醫學準確性、完整性和教學適切性。

驗證要點：
1. 醫學知識正確性
2. 診療流程合理性
3. 評分標準客觀性
4. 教學目標達成度`
        };

        // 教案結構模板
        this.lessonStructureTemplates = {
            disease_diagnosis: {
                sections: [
                    { name: '病例簡介', duration: 2, weight: 0.1 },
                    { name: '病史詢問', duration: 8, weight: 0.25 },
                    { name: '理學檢查', duration: 10, weight: 0.3 },
                    { name: '診斷推理', duration: 6, weight: 0.2 },
                    { name: '處置計畫', duration: 4, weight: 0.15 }
                ]
            },
            clinical_skills: {
                sections: [
                    { name: '操作準備', duration: 3, weight: 0.15 },
                    { name: '技能執行', duration: 15, weight: 0.5 },
                    { name: '安全措施', duration: 5, weight: 0.2 },
                    { name: '結果解釋', duration: 7, weight: 0.15 }
                ]
            },
            communication: {
                sections: [
                    { name: '建立關係', duration: 3, weight: 0.2 },
                    { name: '資訊收集', duration: 10, weight: 0.3 },
                    { name: '資訊提供', duration: 8, weight: 0.25 },
                    { name: '共同決策', duration: 4, weight: 0.15 },
                    { name: '總結確認', duration: 5, weight: 0.1 }
                ]
            }
        };
    }

    /**
     * 生成完整教案
     * @param {object} params - 生成參數
     */
    async generateLesson(params) {
        const startTime = Date.now();
        
        try {
            logger.info('開始生成教案:', params);

            // 1. 驗證參數
            const validatedParams = await this.validateGenerationParams(params);

            // 2. 獲取基礎資料
            const baseData = await this.gatherBaseData(validatedParams);

            // 3. 計算動態難度
            const difficultyInfo = await this.calculateLessonDifficulty(validatedParams, baseData);

            // 4. 生成教案內容
            const lessonContent = await this.generateLessonContent(validatedParams, baseData, difficultyInfo);

            // 5. 後處理和驗證
            const processedContent = await this.postProcessContent(lessonContent, validatedParams);

            // 6. 計算品質分數
            const qualityScore = await this.calculateQualityScore(processedContent, difficultyInfo);

            const result = {
                lessonContent: processedContent,
                metadata: {
                    generationTime: Date.now() - startTime,
                    difficultyInfo,
                    qualityScore: parseFloat(qualityScore.toFixed(3)),
                    aiModel: validatedParams.aiModel || 'auto-selected',
                    generationParams: validatedParams
                }
            };

            logger.info('教案生成完成:', {
                lessonId: result.lessonContent.id,
                generationTime: result.metadata.generationTime,
                qualityScore: result.metadata.qualityScore
            });

            return result;

        } catch (error) {
            logger.error('教案生成失敗:', error);
            throw error;
        }
    }

    /**
     * 驗證生成參數
     */
    async validateGenerationParams(params) {
        const {
            userId,
            templateId,
            knowledgeBaseId,
            gradeLevel,
            specialty,
            customInstructions,
            aiModel
        } = params;

        if (!userId || !templateId || !knowledgeBaseId || !gradeLevel) {
            throw new Error('缺少必要參數: userId, templateId, knowledgeBaseId, gradeLevel');
        }

        // 選擇AI模型
        const selectedModel = aiModel || aiService.selectBestModel('lesson_generation', {
            complexity: specialty ? 'medium' : 'low'
        });

        return {
            ...params,
            aiModel: selectedModel,
            customInstructions: customInstructions || '',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 收集基礎資料
     */
    async gatherBaseData(params) {
        const { templateId, knowledgeBaseId, userId } = params;

        const [templateResult, knowledgeResult, userHistoryResult] = await Promise.all([
            database.query('SELECT * FROM lesson_templates WHERE id = $1', [templateId]),
            database.query(`
                SELECT kb.*, s.name as subject_name, s.category as subject_category
                FROM osce_knowledge_base kb
                JOIN osce_subjects s ON kb.subject_id = s.id
                WHERE kb.id = $1
            `, [knowledgeBaseId]),
            this.getUserLearningHistory(userId)
        ]);

        if (templateResult.rows.length === 0) {
            throw new Error('教案模板不存在');
        }

        if (knowledgeResult.rows.length === 0) {
            throw new Error('知識點不存在');
        }

        return {
            template: templateResult.rows[0],
            knowledge: knowledgeResult.rows[0],
            userHistory: userHistoryResult
        };
    }

    /**
     * 獲取用戶學習歷史
     */
    async getUserLearningHistory(userId) {
        try {
            const result = await database.query(`
                SELECT 
                    AVG(quality_score) as avg_quality_score,
                    COUNT(*) as total_lessons,
                    AVG(CASE WHEN created_at >= NOW() - INTERVAL '30 days' 
                        THEN quality_score ELSE NULL END) as recent_performance,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
                FROM ai_lesson_generations 
                WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '90 days'
            `, [userId]);

            const stats = result.rows[0];
            return {
                avgQualityScore: parseFloat(stats.avg_quality_score || 0.7),
                totalLessonsCompleted: parseInt(stats.total_lessons || 0),
                recentPerformance: parseFloat(stats.recent_performance || 0.7),
                approvalRate: stats.total_lessons > 0 ? 
                    parseInt(stats.approved_count) / parseInt(stats.total_lessons) : 0.7
            };

        } catch (error) {
            logger.error('獲取用戶學習歷史失敗:', error);
            return {
                avgQualityScore: 0.7,
                totalLessonsCompleted: 0,
                recentPerformance: 0.7,
                approvalRate: 0.7
            };
        }
    }

    /**
     * 計算教案難度
     */
    async calculateLessonDifficulty(params, baseData) {
        const difficultyParams = {
            gradeLevel: params.gradeLevel,
            specialty: params.specialty,
            contentType: baseData.knowledge.content_type,
            baseDifficulty: baseData.knowledge.difficulty_level,
            userHistory: baseData.userHistory,
            knowledgeContext: {
                nationalExamFrequency: baseData.knowledge.national_exam_frequency,
                clinicalImportance: this.assessClinicalImportance(baseData.knowledge),
                procedureComplexity: this.assessProcedureComplexity(baseData.knowledge),
                differentialDiagnosisCount: baseData.knowledge.differential_diagnosis?.length || 3
            }
        };

        return await difficultyEngine.calculateDynamicDifficulty(difficultyParams);
    }

    /**
     * 評估臨床重要性
     */
    assessClinicalImportance(knowledge) {
        const frequency = knowledge.national_exam_frequency || 0;
        if (frequency >= 80) return 'critical';
        if (frequency >= 60) return 'high';
        if (frequency >= 40) return 'medium';
        return 'low';
    }

    /**
     * 評估程序複雜度
     */
    assessProcedureComplexity(knowledge) {
        const contentType = knowledge.content_type;
        const difficultyLevel = knowledge.difficulty_level || 3;

        if (contentType === 'procedure' && difficultyLevel >= 4) return 'high';
        if (contentType === 'disease' && difficultyLevel >= 4) return 'high';
        if (difficultyLevel >= 3) return 'medium';
        return 'low';
    }

    /**
     * 生成教案內容
     */
    async generateLessonContent(params, baseData, difficultyInfo) {
        // 構建AI提示詞
        const prompt = this.buildGenerationPrompt(params, baseData, difficultyInfo);

        // 調用AI服務生成內容
        const aiResponse = await aiService.callAI(
            params.aiModel,
            prompt,
            {
                systemPrompt: this.systemPrompts.lessonGeneration,
                maxTokens: 3500,
                temperature: 0.7,
                useFailover: true
            }
        );

        // 解析AI回應
        let lessonContent;
        try {
            lessonContent = JSON.parse(aiResponse.content);
        } catch (parseError) {
            logger.warn('AI回應解析失敗，嘗試修復JSON:', parseError);
            lessonContent = this.repairJSONResponse(aiResponse.content);
        }

        // 添加元數據
        lessonContent.metadata = {
            generatedBy: params.aiModel,
            generatedAt: params.timestamp,
            difficultyLevel: difficultyInfo.difficultyLevel,
            difficultyScore: difficultyInfo.difficultyScore
        };

        return lessonContent;
    }

    /**
     * 構建生成提示詞
     */
    buildGenerationPrompt(params, baseData, difficultyInfo) {
        const { template, knowledge } = baseData;
        const { gradeLevel, specialty, customInstructions } = params;

        return `
請為以下條件生成OSCE教案：

**目標學員：**
- 職級：${gradeLevel}
- 專科：${specialty || '一般醫學'}
- 建議難度：${difficultyInfo.recommendation.level} (${difficultyInfo.recommendation.suggestion})

**知識背景：**
- 主題：${knowledge.title}
- 類型：${knowledge.content_type}
- 科目：${knowledge.subject_name} (${knowledge.subject_category})
- 臨床表現：${knowledge.clinical_presentation || '待補充'}
- 學習目標：${JSON.stringify(knowledge.learning_objectives || [])}

**模板結構：**
${JSON.stringify(template.template_structure, null, 2)}

**評分權重：**
${JSON.stringify(template.assessment_weight, null, 2)}

**特殊要求：**
${customInstructions}

**難度調整指引：**
- 關注重點：${difficultyInfo.recommendation.focus.join('、')}
- 支援程度：${difficultyInfo.recommendation.supportLevel}
- 時間分配：${difficultyInfo.recommendation.timeAllocation}

請生成包含以下結構的JSON格式教案：

{
    "title": "教案標題",
    "objective": ["學習目標1", "學習目標2"],
    "duration": 30,
    "scenario": {
        "setting": "考試場景設定",
        "patientInfo": "病人基本資訊",
        "presentation": "病人表現描述",
        "materials": ["所需材料1", "所需材料2"]
    },
    "sections": [
        {
            "name": "階段名稱",
            "duration": 8,
            "description": "階段描述",
            "tasks": ["任務1", "任務2"],
            "keyPoints": ["重點1", "重點2"],
            "assessmentCriteria": {
                "excellent": "優秀標準",
                "good": "良好標準",
                "needs_improvement": "需改進標準"
            }
        }
    ],
    "overallAssessment": {
        "scoringMethod": "評分方法",
        "passingCriteria": "通過標準",
        "feedbackGuidelines": "回饋指引"
    },
    "instructorNotes": {
        "preparation": "準備事項",
        "commonMistakes": "常見錯誤",
        "teachingTips": "教學技巧"
    }
}

確保內容符合${gradeLevel}職級的學習需求，並體現適當的醫學專業水準。
        `.trim();
    }

    /**
     * 修復JSON回應
     */
    repairJSONResponse(content) {
        try {
            // 嘗試提取JSON部分
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // 如果無法提取，返回基本結構
            logger.warn('無法修復JSON回應，使用備用結構');
            return this.createFallbackContent(content);

        } catch (error) {
            logger.error('JSON修復失敗:', error);
            return this.createFallbackContent(content);
        }
    }

    /**
     * 創建備用內容
     */
    createFallbackContent(rawContent) {
        return {
            title: '教案生成中遇到問題',
            objective: ['請聯繫系統管理員'],
            duration: 30,
            scenario: {
                setting: '系統生成',
                patientInfo: rawContent.substring(0, 200) + '...',
                presentation: '內容解析失敗',
                materials: ['標準設備']
            },
            sections: [{
                name: '內容處理中',
                duration: 30,
                description: '系統正在處理內容',
                tasks: ['請稍後重試'],
                keyPoints: ['系統問題'],
                assessmentCriteria: {
                    excellent: '重新生成',
                    good: '重新生成',
                    needs_improvement: '重新生成'
                }
            }],
            overallAssessment: {
                scoringMethod: '待定',
                passingCriteria: '待定',
                feedbackGuidelines: '待定'
            },
            instructorNotes: {
                preparation: '請重新生成教案',
                commonMistakes: '系統處理錯誤',
                teachingTips: '聯繫技術支援'
            },
            generationError: true,
            rawContent: rawContent.substring(0, 500)
        };
    }

    /**
     * 後處理內容
     */
    async postProcessContent(lessonContent, params) {
        try {
            // 1. 驗證必要欄位
            lessonContent = this.validateRequiredFields(lessonContent);

            // 2. 調整時間分配
            lessonContent = this.adjustTimeAllocation(lessonContent);

            // 3. 標準化格式
            lessonContent = this.standardizeFormat(lessonContent);

            // 4. 添加識別資訊
            lessonContent.id = `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            lessonContent.generatedFor = {
                userId: params.userId,
                gradeLevel: params.gradeLevel,
                specialty: params.specialty
            };

            return lessonContent;

        } catch (error) {
            logger.error('教案後處理失敗:', error);
            return lessonContent; // 返回原始內容
        }
    }

    /**
     * 驗證必要欄位
     */
    validateRequiredFields(content) {
        const requiredFields = ['title', 'objective', 'duration', 'scenario', 'sections'];
        
        requiredFields.forEach(field => {
            if (!content[field]) {
                logger.warn(`缺少必要欄位: ${field}`);
                content[field] = this.getDefaultValue(field);
            }
        });

        return content;
    }

    /**
     * 獲取預設值
     */
    getDefaultValue(field) {
        const defaults = {
            title: '未命名教案',
            objective: ['待補充學習目標'],
            duration: 30,
            scenario: {
                setting: '臨床技能中心',
                patientInfo: '待補充病人資訊',
                presentation: '待補充臨床表現',
                materials: ['基本設備']
            },
            sections: [{
                name: '主要階段',
                duration: 30,
                description: '待補充階段描述',
                tasks: ['待補充任務'],
                keyPoints: ['待補充重點'],
                assessmentCriteria: {
                    excellent: '優秀表現',
                    good: '良好表現',
                    needs_improvement: '需要改進'
                }
            }]
        };

        return defaults[field] || '待補充';
    }

    /**
     * 調整時間分配
     */
    adjustTimeAllocation(content) {
        if (!content.sections || !Array.isArray(content.sections)) {
            return content;
        }

        const totalSectionTime = content.sections.reduce((sum, section) => 
            sum + (section.duration || 0), 0);

        if (totalSectionTime !== content.duration) {
            // 按比例調整各階段時間
            const ratio = content.duration / totalSectionTime;
            content.sections = content.sections.map(section => ({
                ...section,
                duration: Math.round((section.duration || 0) * ratio)
            }));
        }

        return content;
    }

    /**
     * 標準化格式
     */
    standardizeFormat(content) {
        // 確保所有文字內容都是字串
        if (content.title && typeof content.title !== 'string') {
            content.title = String(content.title);
        }

        // 確保陣列格式
        if (content.objective && !Array.isArray(content.objective)) {
            content.objective = [String(content.objective)];
        }

        return content;
    }

    /**
     * 計算品質分數
     */
    async calculateQualityScore(content, difficultyInfo) {
        try {
            let score = 0.7; // 基礎分數

            // 內容完整性評分 (30%)
            const completenessScore = this.evaluateCompleteness(content);
            score += completenessScore * 0.3;

            // 結構合理性評分 (25%)
            const structureScore = this.evaluateStructure(content);
            score += structureScore * 0.25;

            // 難度適配性評分 (25%)
            const difficultyScore = this.evaluateDifficultyAlignment(content, difficultyInfo);
            score += difficultyScore * 0.25;

            // 教學價值評分 (20%)
            const educationalScore = this.evaluateEducationalValue(content);
            score += educationalScore * 0.2;

            return Math.max(0.3, Math.min(1.0, score));

        } catch (error) {
            logger.error('品質分數計算失敗:', error);
            return 0.7; // 預設分數
        }
    }

    /**
     * 評估內容完整性
     */
    evaluateCompleteness(content) {
        const requiredFields = ['title', 'objective', 'scenario', 'sections', 'overallAssessment'];
        const presentFields = requiredFields.filter(field => 
            content[field] && 
            (typeof content[field] === 'string' ? content[field].length > 0 : true)
        );

        return presentFields.length / requiredFields.length;
    }

    /**
     * 評估結構合理性
     */
    evaluateStructure(content) {
        let score = 0.5; // 基礎分數

        // 檢查時間分配合理性
        if (content.sections && Array.isArray(content.sections)) {
            const totalTime = content.sections.reduce((sum, section) => sum + (section.duration || 0), 0);
            if (Math.abs(totalTime - content.duration) <= 2) {
                score += 0.2;
            }
        }

        // 檢查段落數量合理性
        if (content.sections && content.sections.length >= 3 && content.sections.length <= 8) {
            score += 0.2;
        }

        // 檢查學習目標數量
        if (content.objective && content.objective.length >= 2 && content.objective.length <= 6) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * 評估難度適配性
     */
    evaluateDifficultyAlignment(content, difficultyInfo) {
        // 這裡可以實現更複雜的難度對齊評估
        // 目前簡化為基於建議的合理性
        return difficultyInfo.recommendation.gradeAppropriate ? 0.8 : 0.5;
    }

    /**
     * 評估教學價值
     */
    evaluateEducationalValue(content) {
        let score = 0.5;

        // 檢查是否有具體的評估標準
        if (content.sections && content.sections.some(section => 
            section.assessmentCriteria && 
            Object.keys(section.assessmentCriteria).length >= 3
        )) {
            score += 0.2;
        }

        // 檢查是否有教學指引
        if (content.instructorNotes && 
            Object.keys(content.instructorNotes).length >= 2) {
            score += 0.2;
        }

        // 檢查任務的具體性
        if (content.sections && content.sections.some(section => 
            section.tasks && section.tasks.length >= 2
        )) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * 批量生成教案
     */
    async batchGenerateLesson(requests) {
        const results = [];
        
        for (const request of requests) {
            try {
                const result = await this.generateLesson(request);
                results.push({
                    success: true,
                    data: result,
                    request
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    request
                });
            }

            // 批次間暫停
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return results;
    }
}

// 單例模式
const lessonGenerator = new LessonGenerator();

module.exports = lessonGenerator;
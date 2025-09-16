-- OSCE教案開發系統 - 初始化數據

-- 插入職級配置資料
INSERT INTO grade_configs (grade_level, display_name, difficulty_level, medical_terminology_level, case_complexity_level, assessment_depth_level, description) VALUES
('UGY', '醫學系學生(大五大六)', 1, 1, 1, 1, '醫學系學生，初步接觸臨床技能，需要基礎概念和簡單病例'),
('PGY1', '畢業後第一年住院醫師', 2, 2, 2, 2, 'PGY第一年，具備基本醫學知識，需要基本臨床技能訓練'),
('PGY2', '畢業後第二年住院醫師', 3, 3, 3, 2, 'PGY第二年，臨床經驗增加，可處理中等複雜度病例'),
('R1', '專科住院醫師第一年', 3, 3, 3, 3, '專科訓練第一年，專業知識深化，評估能力要求較高'),
('R2', '專科住院醫師第二年', 4, 4, 4, 3, '專科訓練第二年，能處理複雜病例，具備專科診療能力'),
('R3', '專科住院醫師第三年', 4, 4, 4, 4, '專科訓練第三年，高階臨床技能，能獨立處理專科疾病'),
('R4', '專科住院醫師第四年', 5, 5, 5, 4, '專科訓練第四年，專家級技能，能處理疑難雜症'),
('R5', '專科住院醫師第五年', 5, 5, 5, 5, '專科訓練最高年，準主治醫師級別，全面專業能力');

-- 插入OSCE科目分類
INSERT INTO osce_subjects (code, name, category, description, is_active) VALUES
('IM001', '內科學', '內科', '內科疾病診斷與治療', true),
('SG001', '外科學', '外科', '外科疾病診斷與手術技能', true),
('PD001', '小兒科學', '小兒科', '兒童疾病診療與發展評估', true),
('OG001', '婦產科學', '婦產科', '婦科疾病與產科照護', true),
('EM001', '急診醫學', '急診科', '急診處置與危重症照護', true),
('FM001', '家庭醫學', '家醫科', '社區醫療與預防保健', true),
('PS001', '精神科學', '精神科', '精神疾病診斷與心理健康', true),
('SK001', '基本技能', '基本技能', '基礎臨床技能與檢查', true),
('CM001', '溝通技巧', '溝通技能', '醫病溝通與團隊合作', true),
('ET001', '醫學倫理', '醫學倫理', '醫療倫理與法律議題', true);

-- 插入OSCE知識庫範例資料 - 內科
INSERT INTO osce_knowledge_base (
    subject_id, title, content_type, difficulty_level, keywords,
    clinical_presentation, differential_diagnosis, investigation_approach,
    management_principles, learning_objectives, assessment_criteria,
    national_exam_frequency
) VALUES
(
    1, '急性心肌梗塞診斷與處置', 'disease', 4,
    ARRAY['心肌梗塞', 'STEMI', 'NSTEMI', '胸痛', '心電圖'],
    '胸痛、冷汗、噁心嘔吐、呼吸困難',
    ARRAY['不穩定心絞痛', '主動脈剝離', '肺栓塞', '心包膜炎'],
    '12導程心電圖、心肌酵素、胸部X光、心臟超音波',
    '氧氣治療、阿斯匹靈、抗凝血、再灌流治療',
    ARRAY['能正確判讀心電圖變化', '熟悉心肌梗塞處置流程', '了解藥物治療原則'],
    '{"history_taking": 25, "physical_examination": 20, "investigation": 25, "management": 20, "communication": 10}',
    85
),
(
    1, '糖尿病酮酸中毒', 'disease', 3,
    ARRAY['糖尿病', 'DKA', '酮酸中毒', '高血糖'],
    '多渴、多尿、腹痛、意識改變、脫水',
    ARRAY['高血糖高滲透壓症', '乳酸中毒', '尿毒症'],
    '血糖、血酮、血氣分析、電解質',
    '胰島素治療、水分補充、電解質平衡',
    ARRAY['了解DKA病理生理', '熟悉緊急處置', '掌握胰島素使用'],
    '{"history_taking": 20, "physical_examination": 20, "investigation": 30, "management": 25, "monitoring": 5}',
    65
);

-- 插入基本技能知識庫
INSERT INTO osce_knowledge_base (
    subject_id, title, content_type, difficulty_level, keywords,
    clinical_presentation, investigation_approach,
    management_principles, learning_objectives, assessment_criteria,
    national_exam_frequency
) VALUES
(
    8, '基本生命支持術(BLS)', 'procedure', 2,
    ARRAY['CPR', 'BLS', '心肺復甦術', 'AED'],
    '意識喪失、無呼吸、無脈搏',
    '檢查意識反應、呼吸、脈搏',
    '胸外按壓、人工呼吸、AED使用',
    ARRAY['熟悉BLS流程', '正確執行CPR', '能使用AED'],
    '{"technique": 40, "sequence": 30, "quality": 20, "timing": 10}',
    95
),
(
    8, '靜脈注射技術', 'procedure', 1,
    ARRAY['靜脈注射', '點滴', '無菌技術'],
    '需要建立靜脈通路',
    '選擇合適血管、評估注射部位',
    '無菌技術、正確穿刺、固定管路',
    ARRAY['掌握無菌技術', '熟練穿刺技巧', '了解併發症預防'],
    '{"sterile_technique": 30, "insertion_skill": 35, "patient_care": 25, "safety": 10}',
    75
);

-- 插入教案模板
INSERT INTO lesson_templates (
    name, grade_levels, subject_id, template_structure, default_duration,
    assessment_weight, instructions, is_active
) VALUES
(
    '內科疾病診療模板', ARRAY['PGY1', 'PGY2', 'R1'], 1,
    '{
        "sections": [
            {"name": "病史詢問", "duration": 8, "key_points": ["主訴", "現病史", "過去病史", "家族史"]},
            {"name": "理學檢查", "duration": 10, "key_points": ["生命徵象", "系統性檢查", "異常發現"]},
            {"name": "診斷推理", "duration": 5, "key_points": ["鑑別診斷", "診斷依據", "檢查計劃"]},
            {"name": "治療計劃", "duration": 5, "key_points": ["藥物治療", "非藥物治療", "追蹤計劃"]},
            {"name": "病人衛教", "duration": 2, "key_points": ["疾病解釋", "注意事項", "回診安排"]}
        ]
    }',
    30,
    '{"history": 30, "examination": 35, "diagnosis": 20, "treatment": 10, "communication": 5}',
    '適用於內科疾病診療教學，重點在於系統性評估和診斷推理',
    true
),
(
    '基本技能操作模板', ARRAY['UGY', 'PGY1'], 8,
    '{
        "sections": [
            {"name": "操作準備", "duration": 5, "key_points": ["用物準備", "無菌技術", "病人解釋"]},
            {"name": "技能執行", "duration": 15, "key_points": ["操作步驟", "技術要點", "安全考量"]},
            {"name": "處理完成", "duration": 5, "key_points": ["收拾用物", "觀察反應", "記錄評估"]},
            {"name": "併發症處理", "duration": 5, "key_points": ["常見併發症", "處理方法", "預防措施"]}
        ]
    }',
    30,
    '{"preparation": 15, "technique": 50, "safety": 20, "completion": 15}',
    '適用於基本臨床技能教學，注重操作正確性和安全性',
    true
);

-- 插入系統配置
INSERT INTO system_configs (config_key, config_value, description) VALUES
('ai_models', '{"primary": "gpt-4", "fallback": "gpt-3.5-turbo", "review": "claude-3"}', 'AI模型配置'),
('difficulty_thresholds', '{"easy": 0.3, "medium": 0.6, "hard": 0.8}', '難度分級閾值'),
('quality_thresholds', '{"minimum": 0.6, "good": 0.8, "excellent": 0.9}', '品質評分閾值'),
('generation_limits', '{"daily_per_user": 50, "monthly_per_user": 500}', '生成次數限制'),
('review_weights', '{"medical_accuracy": 0.4, "appropriateness": 0.3, "objectives": 0.3}', '審核權重配置');
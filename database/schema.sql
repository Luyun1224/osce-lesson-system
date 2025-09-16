-- OSCE教案開發系統 - 資料庫設計
-- PostgreSQL Schema

-- 創建資料庫
-- CREATE DATABASE osce_lesson_system;

-- 使用者表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    grade_level VARCHAR(20) NOT NULL, -- UGY, PGY1, PGY2, R1, R2, R3, R4, R5
    specialty VARCHAR(50), -- 內科、外科、婦產科、小兒科等
    hospital VARCHAR(100),
    role VARCHAR(20) DEFAULT 'student', -- student, instructor, admin
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 職級配置表
CREATE TABLE grade_configs (
    id SERIAL PRIMARY KEY,
    grade_level VARCHAR(20) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    difficulty_level INTEGER NOT NULL, -- 1-5 (1=最簡單, 5=最困難)
    medical_terminology_level INTEGER NOT NULL, -- 1-5 專業術語複雜度
    case_complexity_level INTEGER NOT NULL, -- 1-5 病例複雜度
    assessment_depth_level INTEGER NOT NULL, -- 1-5 評估深度
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OSCE科目分類表
CREATE TABLE osce_subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 內科、外科、急診、基本技能等
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OSCE知識庫表
CREATE TABLE osce_knowledge_base (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER REFERENCES osce_subjects(id),
    title VARCHAR(200) NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- disease, procedure, examination, skill
    difficulty_level INTEGER NOT NULL, -- 1-5
    keywords TEXT[], -- 關鍵字陣列
    clinical_presentation TEXT, -- 臨床表現
    differential_diagnosis TEXT[], -- 鑑別診斷
    investigation_approach TEXT, -- 檢查方法
    management_principles TEXT, -- 處理原則
    learning_objectives TEXT[], -- 學習目標
    assessment_criteria JSONB, -- 評分標準
    national_exam_frequency INTEGER DEFAULT 0, -- 國考出現頻率
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 教案模板表
CREATE TABLE lesson_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    grade_levels VARCHAR(20)[] NOT NULL, -- 適用職級陣列
    subject_id INTEGER REFERENCES osce_subjects(id),
    template_structure JSONB NOT NULL, -- 教案結構JSON
    default_duration INTEGER DEFAULT 30, -- 預設時間(分鐘)
    assessment_weight JSONB, -- 評分權重
    instructions TEXT, -- 使用說明
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI生成教案記錄表
CREATE TABLE ai_lesson_generations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    template_id INTEGER REFERENCES lesson_templates(id),
    knowledge_base_id INTEGER REFERENCES osce_knowledge_base(id),
    grade_level VARCHAR(20) NOT NULL,
    specialty VARCHAR(50),
    generation_params JSONB, -- AI生成參數
    generated_content JSONB NOT NULL, -- 生成的教案內容
    ai_model_used VARCHAR(50), -- 使用的AI模型
    generation_time_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'generated', -- generated, reviewed, approved, rejected
    quality_score DECIMAL(3,2), -- AI品質評分 0.00-1.00
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI審核記錄表
CREATE TABLE ai_review_logs (
    id SERIAL PRIMARY KEY,
    lesson_generation_id INTEGER REFERENCES ai_lesson_generations(id),
    reviewer_type VARCHAR(20) NOT NULL, -- ai_auto, human_instructor, peer_review
    medical_accuracy_score DECIMAL(3,2), -- 醫學準確性 0.00-1.00
    grade_appropriateness_score DECIMAL(3,2), -- 職級適切性 0.00-1.00
    learning_objective_score DECIMAL(3,2), -- 學習目標達成度 0.00-1.00
    overall_quality_score DECIMAL(3,2), -- 總體品質 0.00-1.00
    review_feedback TEXT,
    suggestions TEXT,
    approval_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, needs_revision, rejected
    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 教案收藏表
CREATE TABLE lesson_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    lesson_generation_id INTEGER REFERENCES ai_lesson_generations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, lesson_generation_id)
);

-- 系統配置表
CREATE TABLE system_configs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 創建索引以提升查詢效能
CREATE INDEX idx_users_grade_specialty ON users(grade_level, specialty);
CREATE INDEX idx_knowledge_base_subject_difficulty ON osce_knowledge_base(subject_id, difficulty_level);
CREATE INDEX idx_lesson_generations_user_status ON ai_lesson_generations(user_id, status);
CREATE INDEX idx_lesson_generations_created_at ON ai_lesson_generations(created_at DESC);
CREATE INDEX idx_review_logs_lesson_id ON ai_review_logs(lesson_generation_id);

-- 創建更新時間觸發器函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 為需要的表添加更新時間觸發器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON osce_knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_templates_updated_at BEFORE UPDATE ON lesson_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- AI教案審核表
CREATE TABLE lesson_reviews (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES ai_lesson_generations(id) ON DELETE CASCADE,
    reviewer_type VARCHAR(20) NOT NULL, -- 'ai_auto', 'human'
    status VARCHAR(30) NOT NULL, -- 'pending', 'auto_review', 'human_review', 'approved', 'rejected', 'revision_required'
    grade_level VARCHAR(20),
    specialty VARCHAR(50),
    review_context JSONB, -- 審核上下文信息
    
    -- 自動審核相關欄位
    auto_review_started_at TIMESTAMP,
    auto_review_completed_at TIMESTAMP,
    auto_review_results JSONB, -- 醫學驗證和品質評估結果
    auto_review_error TEXT,
    auto_review_failed_at TIMESTAMP,
    
    -- 人工審核相關欄位
    human_reviewer_id INTEGER REFERENCES users(id),
    human_review_requested_at TIMESTAMP,
    human_review_priority VARCHAR(20), -- 'normal', 'urgent'
    human_review_decision VARCHAR(20), -- 'approve', 'reject', 'revision'
    human_review_comments TEXT,
    revision_notes TEXT,
    human_review_completed_at TIMESTAMP,
    
    -- 最終結果
    final_decision VARCHAR(20), -- 'APPROVE', 'REJECT', 'HUMAN_REVIEW_REQUIRED'
    completed_at TIMESTAMP,
    total_duration_minutes INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI審核統計表
CREATE TABLE review_statistics (
    id SERIAL PRIMARY KEY,
    review_date DATE NOT NULL,
    total_reviews INTEGER DEFAULT 0,
    auto_approved INTEGER DEFAULT 0,
    auto_rejected INTEGER DEFAULT 0,
    human_review_required INTEGER DEFAULT 0,
    human_approved INTEGER DEFAULT 0,
    human_rejected INTEGER DEFAULT 0,
    avg_review_time_minutes DECIMAL(10,2),
    avg_medical_accuracy_score DECIMAL(5,2),
    avg_quality_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(review_date)
);

-- 醫學驗證記錄表
CREATE TABLE medical_validation_logs (
    id SERIAL PRIMARY KEY,
    review_id INTEGER REFERENCES lesson_reviews(id) ON DELETE CASCADE,
    validation_type VARCHAR(30) NOT NULL, -- 'full', 'medical_only'
    overall_score INTEGER NOT NULL,
    medical_accuracy_score DECIMAL(5,2),
    clinical_relevance_score DECIMAL(5,2),
    safety_issues_count INTEGER DEFAULT 0,
    safety_issues JSONB, -- 安全問題列表
    recommendations TEXT[],
    ai_model_used VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 品質評估記錄表
CREATE TABLE quality_assessment_logs (
    id SERIAL PRIMARY KEY,
    review_id INTEGER REFERENCES lesson_reviews(id) ON DELETE CASCADE,
    assessment_type VARCHAR(30) NOT NULL, -- 'full', 'quality_only'
    overall_score INTEGER NOT NULL,
    grade VARCHAR(20) NOT NULL, -- A, B, C, D, F
    structure_score DECIMAL(5,2),
    content_score DECIMAL(5,2),
    pedagogy_score DECIMAL(5,2),
    grade_alignment_score DECIMAL(5,2),
    recommendations TEXT[],
    strengths TEXT[],
    weaknesses TEXT[],
    ai_model_used VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 創建索引以優化查詢性能
CREATE INDEX idx_lesson_reviews_lesson_id ON lesson_reviews(lesson_id);
CREATE INDEX idx_lesson_reviews_status ON lesson_reviews(status);
CREATE INDEX idx_lesson_reviews_reviewer_type ON lesson_reviews(reviewer_type);
CREATE INDEX idx_lesson_reviews_human_reviewer_id ON lesson_reviews(human_reviewer_id);
CREATE INDEX idx_lesson_reviews_created_at ON lesson_reviews(created_at);

CREATE INDEX idx_review_statistics_date ON review_statistics(review_date);
CREATE INDEX idx_medical_validation_logs_review_id ON medical_validation_logs(review_id);
CREATE INDEX idx_quality_assessment_logs_review_id ON quality_assessment_logs(review_id);

-- 創建更新時間戳觸發器
CREATE TRIGGER update_lesson_reviews_updated_at BEFORE UPDATE ON lesson_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
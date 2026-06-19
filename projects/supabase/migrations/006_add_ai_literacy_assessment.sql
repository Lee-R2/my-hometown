-- ============================================
-- AI素养量表相关表结构迁移
-- 1. 重命名question_text为title，添加缺失列
-- 2. 为pretest_questions添加dimension/part列
-- 3. 创建pretest_assessment_results表存储评估结果
-- ============================================

-- 1. 重命名 question_text → title（与代码保持一致）
ALTER TABLE pretest_questions
RENAME COLUMN question_text TO title;

-- 2. 添加代码中使用的缺失列
ALTER TABLE pretest_questions
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE pretest_questions
ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;

-- 3. 为pretest_questions添加dimension列
-- dimension用于标识题目所属维度/角色
-- Part 1 素养测评: A(情感与态度), B(使用与协作), C(认知与理解), D(伦理与责任)
-- Part 2 角色倾向: guide(引导者), visual(光影法师), text(秘语学者)
ALTER TABLE pretest_questions
ADD COLUMN IF NOT EXISTS dimension VARCHAR(20);

-- 4. 为pretest_questions添加part列
-- part用于区分量表的两部分: literacy(素养测评) / role(角色倾向)
ALTER TABLE pretest_questions
ADD COLUMN IF NOT EXISTS part VARCHAR(20);

-- 5. 添加updated_at列
ALTER TABLE pretest_questions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- 6. 创建AI素养评估结果表
CREATE TABLE IF NOT EXISTS pretest_assessment_results (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  member_name VARCHAR(50) NOT NULL,
  -- Part 1 素养测评各维度得分
  dimension_a_score INTEGER DEFAULT 0,
  dimension_b_score INTEGER DEFAULT 0,
  dimension_c_score INTEGER DEFAULT 0,
  dimension_d_score INTEGER DEFAULT 0,
  literacy_total_score INTEGER DEFAULT 0,
  literacy_level VARCHAR(20),
  -- Part 2 角色倾向得分
  guide_score INTEGER DEFAULT 0,
  visual_score INTEGER DEFAULT 0,
  text_score INTEGER DEFAULT 0,
  primary_role VARCHAR(20),
  role_type VARCHAR(20),
  secondary_role VARCHAR(20),
  -- 短板维度与发展建议
  weak_dimensions JSONB,
  suggestions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(team_id, member_name)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pretest_assessment_results_team_id ON pretest_assessment_results(team_id);
CREATE INDEX IF NOT EXISTS idx_pretest_assessment_results_primary_role ON pretest_assessment_results(primary_role);
CREATE INDEX IF NOT EXISTS idx_pretest_assessment_results_literacy_level ON pretest_assessment_results(literacy_level);
CREATE INDEX IF NOT EXISTS idx_pretest_questions_dimension ON pretest_questions(dimension);
CREATE INDEX IF NOT EXISTS idx_pretest_questions_part ON pretest_questions(part);

-- 7. 为pretest_assessment_results启用RLS
ALTER TABLE pretest_assessment_results ENABLE ROW LEVEL SECURITY;

-- 8. 允许服务端角色访问
CREATE POLICY "Service role can do anything on pretest_assessment_results"
  ON pretest_assessment_results
  FOR ALL
  USING (true)
  WITH CHECK (true);

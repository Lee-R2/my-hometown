-- 创建学校工具配置表
CREATE TABLE IF NOT EXISTS school_tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(36) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  tool_id VARCHAR(36) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  stock INTEGER DEFAULT 0, -- 库存数量，0表示无限制
  used INTEGER DEFAULT 0, -- 已使用数量
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(school_id, tool_id)
);

-- 创建小队工具选择表
CREATE TABLE IF NOT EXISTS team_tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tool_id VARCHAR(36) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, task_id, tool_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_school_tools_school_id ON school_tools(school_id);
CREATE INDEX IF NOT EXISTS idx_team_tools_team_id ON team_tools(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tools_task_id ON team_tools(task_id);

-- 添加注释
COMMENT ON TABLE school_tools IS '学校工具库存配置表';
COMMENT ON TABLE team_tools IS '小队工具选择记录表';

-- 010: agent_memories 表补齐分层记忆所需字段
-- 用于蜡象助手/银蛇博士的长期记忆系统重构
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行（无需 RLS）

-- 1. 添加缺失字段（IF NOT EXISTS 保证可重复执行）
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS layer INTEGER DEFAULT 2;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS key VARCHAR(200);
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS source_ids JSONB;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- 2. 为现有数据回填 layer（根据 memory_type 推断层级）
-- L3 长期记忆：用户身份、小队信息（永不过期）
UPDATE agent_memories SET layer = 3
WHERE memory_type IN ('user_info', 'team_info') AND layer IS NULL;

-- L2 中期记忆：用户关注偏好（30天衰减）
UPDATE agent_memories SET layer = 2
WHERE memory_type = 'user_focus' AND layer IS NULL;

-- L1 短期记忆：任务进度、用户意图（24小时过期）
UPDATE agent_memories SET layer = 1
WHERE memory_type IN ('task_progress', 'user_intent') AND layer IS NULL;

-- L3 长期记忆：知识类（永不过期）
UPDATE agent_memories SET layer = 3
WHERE memory_type IN ('knowledge', 'knowledge_skill', 'knowledge_insight', 'preference') AND layer IS NULL;

-- L2 中期记忆：其余未分类的（默认30天衰减）
UPDATE agent_memories SET layer = 2
WHERE layer IS NULL OR layer = 0;

-- 3. 为 L1 短期记忆设置过期时间（created_at + 24小时）
UPDATE agent_memories
SET expires_at = created_at + INTERVAL '24 hours'
WHERE layer = 1 AND expires_at IS NULL;

-- 4. 从 context_value 回填 user_id（当 context_key = 'user_id' 时）
UPDATE agent_memories
SET user_id = context_value
WHERE context_key = 'user_id' AND context_value IS NOT NULL AND user_id IS NULL;

-- 5. 添加索引加速检索
CREATE INDEX IF NOT EXISTS idx_agent_memories_user_id ON agent_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_layer ON agent_memories(layer);
CREATE INDEX IF NOT EXISTS idx_agent_memories_expires_at ON agent_memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_memories_last_accessed ON agent_memories(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_agent_memories_status ON agent_memories(status);

-- 6. 验证：查看字段是否添加成功
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'agent_memories'
-- ORDER BY ordinal_position;

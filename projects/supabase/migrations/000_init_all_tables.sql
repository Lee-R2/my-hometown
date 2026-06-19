-- ============================================
-- 我家乡-科学探索之旅 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 学校表
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  address TEXT,
  teacher_name VARCHAR(100),
  teacher_phone VARCHAR(20),
  province VARCHAR(50),
  city VARCHAR(50),
  county VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. 用户表（管理员、志愿者、助学老师）
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'team' NOT NULL,
  school_id VARCHAR(36),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_login_ip TEXT,
  assigned_teacher_id VARCHAR(36),
  grade VARCHAR(20),
  class_name VARCHAR(50),
  student_count INTEGER,
  grade_classes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 3. 小队表
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  slogan VARCHAR(200),
  school_id VARCHAR(36),
  current_theme_id VARCHAR(36),
  current_task_id VARCHAR(36),
  status VARCHAR(20) DEFAULT 'active',
  points INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_login_ip TEXT,
  rules TEXT,
  grade VARCHAR(20),
  teacher_id VARCHAR(36),
  created_by VARCHAR(36),
  assigned_volunteer_id VARCHAR(36),
  cycle INTEGER DEFAULT 1,
  has_completed_pretest BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 4. 小队成员表
CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  name VARCHAR(50) NOT NULL,
  role VARCHAR(20) DEFAULT 'member' NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  intro VARCHAR(200),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 5. 主题表
CREATE TABLE IF NOT EXISTS task_themes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(255),
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  school_id VARCHAR(36),
  created_by VARCHAR(36),
  selected_by_team_id VARCHAR(36),
  is_exclusive BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 6. 主题-学校关联表
CREATE TABLE IF NOT EXISTS theme_schools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id VARCHAR(36) NOT NULL,
  school_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(theme_id, school_id)
);

-- 7. 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id VARCHAR(36) NOT NULL,
  stage INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  requirements JSONB,
  learning_goals JSONB,
  points INTEGER DEFAULT 10,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  task_type VARCHAR(20) DEFAULT 'main',
  created_by VARCHAR(36),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 8. 工具表
CREATE TABLE IF NOT EXISTS tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(255),
  category VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  image_url VARCHAR(500),
  stock INTEGER,
  nature VARCHAR(20) DEFAULT 'physical',
  team_limit INTEGER,
  needs_return BOOLEAN DEFAULT true,
  type VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 9. 技能表
CREATE TABLE IF NOT EXISTS skills (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(255),
  category VARCHAR(50),
  content TEXT,
  video_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  usage TEXT,
  learning_materials JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. 激励表
CREATE TABLE IF NOT EXISTS rewards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(255),
  points INTEGER DEFAULT 0,
  type VARCHAR(20) NOT NULL,
  requirement TEXT,
  conditions JSONB,
  condition_logic VARCHAR(10) DEFAULT 'and',
  image_url VARCHAR(500),
  distribution_method VARCHAR(20) DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 11. 任务提交（产出）表
CREATE TABLE IF NOT EXISTS task_submissions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  content TEXT,
  file_urls JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  review_comment TEXT,
  reviewer_id VARCHAR(36),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rating VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 12. 任务-工具关联表
CREATE TABLE IF NOT EXISTS task_tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL,
  tool_id VARCHAR(36) NOT NULL,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, tool_id)
);

-- 13. 任务-技能关联表
CREATE TABLE IF NOT EXISTS task_skills (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL,
  skill_id VARCHAR(36) NOT NULL,
  points INTEGER DEFAULT 5,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, skill_id)
);

-- 14. 任务-激励关联表
CREATE TABLE IF NOT EXISTS task_rewards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL,
  reward_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, reward_id)
);

-- 15. 工具-技能关联表
CREATE TABLE IF NOT EXISTS tool_skills (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id VARCHAR(36) NOT NULL,
  skill_id VARCHAR(36) NOT NULL,
  is_auto_add BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tool_id, skill_id)
);

-- 16. 小队-工具选择表
CREATE TABLE IF NOT EXISTS team_tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  tool_id VARCHAR(36) NOT NULL,
  selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, task_id, tool_id)
);

-- 17. 学校-工具配置表
CREATE TABLE IF NOT EXISTS school_tools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(36) NOT NULL,
  tool_id VARCHAR(36) NOT NULL,
  stock INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(school_id, tool_id)
);

-- 18. 小队-技能学习表
CREATE TABLE IF NOT EXISTS team_skill_learnings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  skill_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36),
  status VARCHAR(20) DEFAULT 'not_started',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, skill_id, task_id)
);

-- 19. 小队-激励获得表
CREATE TABLE IF NOT EXISTS user_rewards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  reward_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36),
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 20. 小队通知表
CREATE TABLE IF NOT EXISTS team_notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  submission_id VARCHAR(36),
  task_id VARCHAR(36),
  reward_id VARCHAR(36),
  sender_id VARCHAR(36),
  sender_name VARCHAR(100),
  extra_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 21. 消息表
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id VARCHAR(36),
  receiver_id VARCHAR(36),
  team_id VARCHAR(36),
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  is_read BOOLEAN DEFAULT false,
  content_type VARCHAR(20) DEFAULT 'text',
  media_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 22. 积分借贷表
CREATE TABLE IF NOT EXISTS point_borrows (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id VARCHAR(36) NOT NULL,
  lender_id VARCHAR(36) NOT NULL,
  points INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  repaid_at TIMESTAMP WITH TIME ZONE,
  reason TEXT
);

-- 23. 积分交易记录表
CREATE TABLE IF NOT EXISTS point_transactions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36),
  from_team_id VARCHAR(36),
  to_team_id VARCHAR(36),
  related_id VARCHAR(36),
  points INTEGER NOT NULL,
  type VARCHAR(20),
  change_type VARCHAR(30) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 24. 小队主题选择表
CREATE TABLE IF NOT EXISTS team_theme_selections (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  theme_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress',
  cycle INTEGER DEFAULT 1,
  selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 25. 小队支线任务表
CREATE TABLE IF NOT EXISTS team_side_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  assigned_by VARCHAR(36),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  status VARCHAR(20) DEFAULT 'assigned',
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 26. 学习资料表
CREATE TABLE IF NOT EXISTS learning_materials (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  type VARCHAR(20) NOT NULL,
  url VARCHAR(500),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 27. 学习资料进度表
CREATE TABLE IF NOT EXISTS team_material_progress (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  material_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36),
  status VARCHAR(20) DEFAULT 'not_started',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(team_id, material_id, task_id)
);

-- 28. 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 29. 请求日志表
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  user_agent TEXT,
  user_id TEXT,
  status_code INTEGER,
  duration INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 30. 频率限制记录表
CREATE TABLE IF NOT EXISTS rate_limit_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 31. 安全事件日志表
CREATE TABLE IF NOT EXISTS security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_id TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 32. 智能体会话表
CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_username VARCHAR(50) NOT NULL,
  user_id VARCHAR(36),
  team_id VARCHAR(36),
  session_id VARCHAR(100) NOT NULL,
  user_role VARCHAR(20),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB
);

-- 33. 智能体对话表
CREATE TABLE IF NOT EXISTS agent_conversations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_username VARCHAR(50) NOT NULL,
  user_id VARCHAR(36),
  user_name VARCHAR(100),
  session_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 34. 智能体记忆表
CREATE TABLE IF NOT EXISTS agent_memories (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_username VARCHAR(50) NOT NULL,
  memory_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  context_key VARCHAR(100),
  context_value VARCHAR(200),
  importance INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 35. 黑板报帖子表
CREATE TABLE IF NOT EXISTS blackboard_posts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  author_id VARCHAR(36) NOT NULL,
  author_name VARCHAR(100),
  author_type VARCHAR(20) DEFAULT 'team',
  content TEXT NOT NULL,
  media_urls JSONB,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 36. 黑板报评论表
CREATE TABLE IF NOT EXISTS blackboard_comments (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36) NOT NULL,
  author_id VARCHAR(36) NOT NULL,
  author_name VARCHAR(100),
  author_type VARCHAR(20) DEFAULT 'team',
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 37. 黑板报点赞表
CREATE TABLE IF NOT EXISTS blackboard_likes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, team_id)
);

-- 38. 黑板报评论点赞表
CREATE TABLE IF NOT EXISTS blackboard_comment_likes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, team_id)
);

-- 39. 小队活动日志表
CREATE TABLE IF NOT EXISTS team_activity_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 40. 家长账号表
CREATE TABLE IF NOT EXISTS parent_accounts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  school_id VARCHAR(36),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 41. 家长-小队关联表
CREATE TABLE IF NOT EXISTS parent_team_relations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36) NOT NULL,
  relation VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 42. 任务反馈知识库表
CREATE TABLE IF NOT EXISTS task_feedback_knowledge (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name VARCHAR(100),
  theme_name VARCHAR(100),
  category VARCHAR(50),
  feedback_type VARCHAR(50),
  content TEXT,
  is_integrated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 43. 最后任务表单表
CREATE TABLE IF NOT EXISTS final_task_forms (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id VARCHAR(36),
  school_id VARCHAR(36),
  role VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  fields JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 44. 最后任务提交表
CREATE TABLE IF NOT EXISTS final_task_submissions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  form_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  score INTEGER,
  reviewer_name VARCHAR(100),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- 45. 小队难度偏好表
CREATE TABLE IF NOT EXISTS team_difficulty_preferences (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36),
  difficulty VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 46. 爱心宝石表
CREATE TABLE IF NOT EXISTS heart_gems (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL UNIQUE,
  gems INTEGER DEFAULT 0,
  total_sent_likes INTEGER DEFAULT 0,
  earned_from VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 47. 健康检查表
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 48. 小队预测试表
CREATE TABLE IF NOT EXISTS team_pretests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR(36) NOT NULL,
  pretest_id VARCHAR(36) NOT NULL,
  answers JSONB,
  score INTEGER,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 创建索引
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_records_identifier ON rate_limit_records(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limit_records_type ON rate_limit_records(type);
CREATE INDEX IF NOT EXISTS idx_rate_limit_records_timestamp ON rate_limit_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_team_id ON team_notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_is_read ON team_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_team_tools_team_id ON team_tools(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tools_task_id ON team_tools(task_id);
CREATE INDEX IF NOT EXISTS idx_school_tools_school_id ON school_tools(school_id);
CREATE INDEX IF NOT EXISTS idx_team_skill_learnings_team_id ON team_skill_learnings(team_id);
CREATE INDEX IF NOT EXISTS idx_task_tools_task_id ON task_tools(task_id);
CREATE INDEX IF NOT EXISTS idx_task_skills_task_id ON task_skills(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_skills_skill_id ON tool_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_tool_skills_tool_id ON tool_skills(tool_id);
CREATE INDEX IF NOT EXISTS idx_team_material_progress_team_id ON team_material_progress(team_id);
CREATE INDEX IF NOT EXISTS idx_team_material_progress_task_id ON team_material_progress(task_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_logs_team_id ON team_activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_id ON agent_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_username ON agent_memories(agent_username);
CREATE INDEX IF NOT EXISTS idx_point_transactions_from ON point_transactions(from_team_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_to ON point_transactions(to_team_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_team_id ON task_submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_status ON task_submissions(status);
CREATE INDEX IF NOT EXISTS idx_blackboard_posts_team_id ON blackboard_posts(team_id);
CREATE INDEX IF NOT EXISTS idx_blackboard_comments_post_id ON blackboard_comments(post_id);

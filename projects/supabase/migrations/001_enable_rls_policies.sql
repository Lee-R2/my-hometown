-- ============================================
-- RLS 策略迁移脚本
-- 步骤 3.1：启用RLS策略
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- ============================================
-- 第1部分：创建辅助函数
-- ============================================

-- 读取请求头中的自定义字段
CREATE OR REPLACE FUNCTION get_req_header(key TEXT) RETURNS TEXT AS $$
DECLARE
  headers JSON;
BEGIN
  BEGIN
    headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF headers IS NULL THEN RETURN NULL; END IF;
  RETURN headers->>key;
END;
$$ LANGUAGE plpgsql STABLE;

-- 读取当前应用角色（从请求头 x-app-role 获取）
CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT AS $$
  SELECT COALESCE(get_req_header('x-app-role'), 'anon');
$$ LANGUAGE SQL STABLE;

-- 读取当前应用用户ID
CREATE OR REPLACE FUNCTION app_user_id() RETURNS TEXT AS $$
  SELECT get_req_header('x-app-user-id');
$$ LANGUAGE SQL STABLE;

-- 读取当前用户学校ID
CREATE OR REPLACE FUNCTION app_school_id() RETURNS TEXT AS $$
  SELECT get_req_header('x-app-school-id');
$$ LANGUAGE SQL STABLE;

-- 读取当前小队ID
CREATE OR REPLACE FUNCTION app_team_id() RETURNS TEXT AS $$
  SELECT get_req_header('x-app-team-id');
$$ LANGUAGE SQL STABLE;

-- 判断是否为管理员角色
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT app_role() IN ('super_admin', 'admin');
$$ LANGUAGE SQL STABLE;

-- 判断是否为老师角色
CREATE OR REPLACE FUNCTION is_teacher() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'teacher';
$$ LANGUAGE SQL STABLE;

-- 判断是否为志愿者角色
CREATE OR REPLACE FUNCTION is_volunteer() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'volunteer';
$$ LANGUAGE SQL STABLE;

-- 判断是否为小队角色
CREATE OR REPLACE FUNCTION is_team() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'team';
$$ LANGUAGE SQL STABLE;

-- 判断是否为家长角色
CREATE OR REPLACE FUNCTION is_parent() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'parent';
$$ LANGUAGE SQL STABLE;

-- 判断当前用户是否属于指定学校
CREATE OR REPLACE FUNCTION belongs_to_school(p_school_id TEXT) RETURNS BOOLEAN AS $$
  SELECT is_admin() OR (app_school_id() = p_school_id);
$$ LANGUAGE SQL STABLE;

-- 判断当前用户是否关联指定小队（志愿者/小队/家长）
CREATE OR REPLACE FUNCTION is_related_to_team(p_team_id TEXT) RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF is_admin() THEN RETURN TRUE; END IF;

  IF is_volunteer() THEN
    SELECT COUNT(*) INTO v_count FROM teams WHERE id = p_team_id AND assigned_volunteer_id = app_user_id();
    IF v_count > 0 THEN RETURN TRUE; END IF;
  END IF;

  IF is_team() THEN
    IF app_team_id() = p_team_id THEN RETURN TRUE; END IF;
  END IF;

  IF is_parent() THEN
    SELECT COUNT(*) INTO v_count FROM parent_team_relations WHERE team_id = p_team_id AND parent_id = app_user_id();
    IF v_count > 0 THEN RETURN TRUE; END IF;
  END IF;

  IF is_teacher() THEN
    SELECT COUNT(*) INTO v_count FROM teams WHERE id = p_team_id AND school_id = app_school_id();
    IF v_count > 0 THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- 第2部分：为所有48张表启用RLS
-- ============================================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_skill_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_borrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_theme_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_side_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_material_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackboard_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackboard_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackboard_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackboard_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_team_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_feedback_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_task_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_difficulty_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_heart_gems ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_pretests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 第3部分：创建RLS读取策略
-- 策略分类：
--   A. 全局参考数据（所有认证用户可读）
--   B. 学校范围数据（teacher可读本学校）
--   C. 小队范围数据（team/volunteer/parent可读关联小队）
--   D. 管理员专用数据（仅admin可读）
-- ============================================

-- ============================================
-- A. 全局参考数据表（所有认证用户可读）
-- ============================================

-- schools
CREATE POLICY "admin_read_schools" ON schools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_schools" ON schools FOR SELECT TO anon USING (is_teacher() AND id = app_school_id());
CREATE POLICY "volunteer_read_schools" ON schools FOR SELECT TO anon USING (is_volunteer() AND id = app_school_id());
CREATE POLICY "team_read_schools" ON schools FOR SELECT TO anon USING (is_team() AND id = app_school_id());
CREATE POLICY "parent_read_schools" ON schools FOR SELECT TO anon USING (is_parent() AND id = app_school_id());

-- task_themes (全局主题 + 学校主题)
CREATE POLICY "admin_read_themes" ON task_themes FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_themes" ON task_themes FOR SELECT TO anon USING (is_teacher() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "volunteer_read_themes" ON task_themes FOR SELECT TO anon USING (is_volunteer() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "team_read_themes" ON task_themes FOR SELECT TO anon USING (is_team() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "parent_read_themes" ON task_themes FOR SELECT TO anon USING (is_parent() AND (school_id IS NULL OR school_id = app_school_id()));

-- tasks
CREATE POLICY "admin_read_tasks" ON tasks FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_tasks" ON tasks FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_tasks" ON tasks FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_tasks" ON tasks FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_tasks" ON tasks FOR SELECT TO anon USING (is_parent());

-- tools
CREATE POLICY "admin_read_tools" ON tools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_tools" ON tools FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_tools" ON tools FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_tools" ON tools FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_tools" ON tools FOR SELECT TO anon USING (is_parent());

-- skills
CREATE POLICY "admin_read_skills" ON skills FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_skills" ON skills FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_skills" ON skills FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_skills" ON skills FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_skills" ON skills FOR SELECT TO anon USING (is_parent());

-- rewards
CREATE POLICY "admin_read_rewards" ON rewards FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_rewards" ON rewards FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_rewards" ON rewards FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_rewards" ON rewards FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_rewards" ON rewards FOR SELECT TO anon USING (is_parent());

-- learning_materials
CREATE POLICY "admin_read_materials" ON learning_materials FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_materials" ON learning_materials FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_materials" ON learning_materials FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_materials" ON learning_materials FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_materials" ON learning_materials FOR SELECT TO anon USING (is_parent());

-- theme_schools
CREATE POLICY "admin_read_theme_schools" ON theme_schools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_theme_schools" ON theme_schools FOR SELECT TO anon USING (is_teacher() AND school_id = app_school_id());
CREATE POLICY "volunteer_read_theme_schools" ON theme_schools FOR SELECT TO anon USING (is_volunteer() AND school_id = app_school_id());
CREATE POLICY "team_read_theme_schools" ON theme_schools FOR SELECT TO anon USING (is_team() AND school_id = app_school_id());
CREATE POLICY "parent_read_theme_schools" ON theme_schools FOR SELECT TO anon USING (is_parent() AND school_id = app_school_id());

-- task_tools
CREATE POLICY "admin_read_task_tools" ON task_tools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_task_tools" ON task_tools FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_task_tools" ON task_tools FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_task_tools" ON task_tools FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_task_tools" ON task_tools FOR SELECT TO anon USING (is_parent());

-- task_skills
CREATE POLICY "admin_read_task_skills" ON task_skills FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_task_skills" ON task_skills FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_task_skills" ON task_skills FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_task_skills" ON task_skills FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_task_skills" ON task_skills FOR SELECT TO anon USING (is_parent());

-- task_rewards
CREATE POLICY "admin_read_task_rewards" ON task_rewards FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_task_rewards" ON task_rewards FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_task_rewards" ON task_rewards FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_task_rewards" ON task_rewards FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_task_rewards" ON task_rewards FOR SELECT TO anon USING (is_parent());

-- tool_skills
CREATE POLICY "admin_read_tool_skills" ON tool_skills FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_tool_skills" ON tool_skills FOR SELECT TO anon USING (is_teacher());
CREATE POLICY "volunteer_read_tool_skills" ON tool_skills FOR SELECT TO anon USING (is_volunteer());
CREATE POLICY "team_read_tool_skills" ON tool_skills FOR SELECT TO anon USING (is_team());
CREATE POLICY "parent_read_tool_skills" ON tool_skills FOR SELECT TO anon USING (is_parent());

-- final_task_forms
CREATE POLICY "admin_read_final_task_forms" ON final_task_forms FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_final_task_forms" ON final_task_forms FOR SELECT TO anon USING (is_teacher() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "volunteer_read_final_task_forms" ON final_task_forms FOR SELECT TO anon USING (is_volunteer() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "team_read_final_task_forms" ON final_task_forms FOR SELECT TO anon USING (is_team() AND (school_id IS NULL OR school_id = app_school_id()));
CREATE POLICY "parent_read_final_task_forms" ON final_task_forms FOR SELECT TO anon USING (is_parent() AND (school_id IS NULL OR school_id = app_school_id()));

-- health_check
CREATE POLICY "admin_read_health" ON health_check FOR SELECT TO anon USING (is_admin());

-- ============================================
-- B. 学校范围数据（teacher可读本学校，其他角色通过关联访问）
-- ============================================

-- users
CREATE POLICY "admin_read_users" ON users FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_users" ON users FOR SELECT TO anon USING (is_teacher() AND school_id = app_school_id());
CREATE POLICY "volunteer_read_users" ON users FOR SELECT TO anon USING (is_volunteer() AND school_id = app_school_id());
CREATE POLICY "team_read_users" ON users FOR SELECT TO anon USING (is_team() AND id = app_user_id());
CREATE POLICY "parent_read_users" ON users FOR SELECT TO anon USING (is_parent() AND school_id = app_school_id());

-- teams
CREATE POLICY "admin_read_teams" ON teams FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_teams" ON teams FOR SELECT TO anon USING (is_teacher() AND school_id = app_school_id());
CREATE POLICY "volunteer_read_teams" ON teams FOR SELECT TO anon USING (is_volunteer() AND (assigned_volunteer_id = app_user_id() OR school_id = app_school_id()));
CREATE POLICY "team_read_teams" ON teams FOR SELECT TO anon USING (is_team() AND id = app_team_id());
CREATE POLICY "parent_read_teams" ON teams FOR SELECT TO anon USING (is_parent() AND school_id = app_school_id());

-- school_tools
CREATE POLICY "admin_read_school_tools" ON school_tools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_school_tools" ON school_tools FOR SELECT TO anon USING (is_teacher() AND school_id = app_school_id());
CREATE POLICY "volunteer_read_school_tools" ON school_tools FOR SELECT TO anon USING (is_volunteer() AND school_id = app_school_id());
CREATE POLICY "team_read_school_tools" ON school_tools FOR SELECT TO anon USING (is_team() AND school_id = app_school_id());
CREATE POLICY "parent_read_school_tools" ON school_tools FOR SELECT TO anon USING (is_parent() AND school_id = app_school_id());

-- ============================================
-- C. 小队范围数据（team/volunteer/parent可读关联小队数据）
-- ============================================

-- team_members
CREATE POLICY "admin_read_team_members" ON team_members FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_team_members" ON team_members FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_team_members" ON team_members FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_team_members" ON team_members FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_team_members" ON team_members FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- task_submissions
CREATE POLICY "admin_read_submissions" ON task_submissions FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_submissions" ON task_submissions FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_submissions" ON task_submissions FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_submissions" ON task_submissions FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_submissions" ON task_submissions FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_tools
CREATE POLICY "admin_read_team_tools" ON team_tools FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_team_tools" ON team_tools FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_team_tools" ON team_tools FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_team_tools" ON team_tools FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_team_tools" ON team_tools FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_skill_learnings
CREATE POLICY "admin_read_skill_learnings" ON team_skill_learnings FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_skill_learnings" ON team_skill_learnings FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_skill_learnings" ON team_skill_learnings FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_skill_learnings" ON team_skill_learnings FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_skill_learnings" ON team_skill_learnings FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- user_rewards
CREATE POLICY "admin_read_user_rewards" ON user_rewards FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_user_rewards" ON user_rewards FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_user_rewards" ON user_rewards FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_user_rewards" ON user_rewards FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_user_rewards" ON user_rewards FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_notifications
CREATE POLICY "admin_read_notifications" ON team_notifications FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_notifications" ON team_notifications FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_notifications" ON team_notifications FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_notifications" ON team_notifications FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_notifications" ON team_notifications FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- messages
CREATE POLICY "admin_read_messages" ON messages FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_messages" ON messages FOR SELECT TO anon USING (is_teacher() AND (receiver_id = app_user_id() OR team_id IN (SELECT id FROM teams WHERE school_id = app_school_id())));
CREATE POLICY "volunteer_read_messages" ON messages FOR SELECT TO anon USING (is_volunteer() AND (receiver_id = app_user_id() OR is_related_to_team(team_id)));
CREATE POLICY "team_read_messages" ON messages FOR SELECT TO anon USING (is_team() AND (team_id = app_team_id() OR receiver_id = app_user_id()));
CREATE POLICY "parent_read_messages" ON messages FOR SELECT TO anon USING (is_parent() AND (receiver_id = app_user_id() OR is_related_to_team(team_id)));

-- point_borrows
CREATE POLICY "admin_read_borrows" ON point_borrows FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_borrows" ON point_borrows FOR SELECT TO anon USING (is_teacher() AND (borrower_id IN (SELECT id FROM teams WHERE school_id = app_school_id()) OR lender_id IN (SELECT id FROM teams WHERE school_id = app_school_id())));
CREATE POLICY "volunteer_read_borrows" ON point_borrows FOR SELECT TO anon USING (is_volunteer() AND (is_related_to_team(borrower_id) OR is_related_to_team(lender_id)));
CREATE POLICY "team_read_borrows" ON point_borrows FOR SELECT TO anon USING (is_team() AND (borrower_id = app_team_id() OR lender_id = app_team_id()));
CREATE POLICY "parent_read_borrows" ON point_borrows FOR SELECT TO anon USING (is_parent() AND (is_related_to_team(borrower_id) OR is_related_to_team(lender_id)));

-- point_transactions
CREATE POLICY "admin_read_transactions" ON point_transactions FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_transactions" ON point_transactions FOR SELECT TO anon USING (is_teacher() AND (from_team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()) OR to_team_id IN (SELECT id FROM teams WHERE school_id = app_school_id())));
CREATE POLICY "volunteer_read_transactions" ON point_transactions FOR SELECT TO anon USING (is_volunteer() AND (is_related_to_team(from_team_id) OR is_related_to_team(to_team_id)));
CREATE POLICY "team_read_transactions" ON point_transactions FOR SELECT TO anon USING (is_team() AND (from_team_id = app_team_id() OR to_team_id = app_team_id()));
CREATE POLICY "parent_read_transactions" ON point_transactions FOR SELECT TO anon USING (is_parent() AND (is_related_to_team(from_team_id) OR is_related_to_team(to_team_id)));

-- team_theme_selections
CREATE POLICY "admin_read_theme_selections" ON team_theme_selections FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_theme_selections" ON team_theme_selections FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_theme_selections" ON team_theme_selections FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_theme_selections" ON team_theme_selections FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_theme_selections" ON team_theme_selections FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_side_tasks
CREATE POLICY "admin_read_side_tasks" ON team_side_tasks FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_side_tasks" ON team_side_tasks FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_side_tasks" ON team_side_tasks FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_side_tasks" ON team_side_tasks FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_side_tasks" ON team_side_tasks FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_material_progress
CREATE POLICY "admin_read_material_progress" ON team_material_progress FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_material_progress" ON team_material_progress FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_material_progress" ON team_material_progress FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_material_progress" ON team_material_progress FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_material_progress" ON team_material_progress FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_activity_logs
CREATE POLICY "admin_read_activity_logs" ON team_activity_logs FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_activity_logs" ON team_activity_logs FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_activity_logs" ON team_activity_logs FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_activity_logs" ON team_activity_logs FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_activity_logs" ON team_activity_logs FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- blackboard_posts
CREATE POLICY "admin_read_posts" ON blackboard_posts FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_posts" ON blackboard_posts FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_posts" ON blackboard_posts FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_posts" ON blackboard_posts FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_posts" ON blackboard_posts FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- blackboard_comments
CREATE POLICY "admin_read_comments" ON blackboard_comments FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_comments" ON blackboard_comments FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_comments" ON blackboard_comments FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_comments" ON blackboard_comments FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_comments" ON blackboard_comments FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- blackboard_likes
CREATE POLICY "admin_read_post_likes" ON blackboard_likes FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_post_likes" ON blackboard_likes FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_post_likes" ON blackboard_likes FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_post_likes" ON blackboard_likes FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_post_likes" ON blackboard_likes FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- blackboard_comment_likes
CREATE POLICY "admin_read_comment_likes" ON blackboard_comment_likes FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_comment_likes" ON blackboard_comment_likes FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_comment_likes" ON blackboard_comment_likes FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_comment_likes" ON blackboard_comment_likes FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_comment_likes" ON blackboard_comment_likes FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_pretests
CREATE POLICY "admin_read_pretests" ON team_pretests FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_pretests" ON team_pretests FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_pretests" ON team_pretests FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_pretests" ON team_pretests FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_pretests" ON team_pretests FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_heart_gems
CREATE POLICY "admin_read_gems" ON team_heart_gems FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_gems" ON team_heart_gems FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_gems" ON team_heart_gems FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_gems" ON team_heart_gems FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_gems" ON team_heart_gems FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- team_difficulty_preferences
CREATE POLICY "admin_read_difficulty" ON team_difficulty_preferences FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_difficulty" ON team_difficulty_preferences FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_difficulty" ON team_difficulty_preferences FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_difficulty" ON team_difficulty_preferences FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_difficulty" ON team_difficulty_preferences FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- final_task_submissions
CREATE POLICY "admin_read_final_submissions" ON final_task_submissions FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_final_submissions" ON final_task_submissions FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_final_submissions" ON final_task_submissions FOR SELECT TO anon USING (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_read_final_submissions" ON final_task_submissions FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_final_submissions" ON final_task_submissions FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- agent_sessions
CREATE POLICY "admin_read_agent_sessions" ON agent_sessions FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_agent_sessions" ON agent_sessions FOR SELECT TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_read_agent_sessions" ON agent_sessions FOR SELECT TO anon USING (is_volunteer() AND (user_id = app_user_id() OR is_related_to_team(team_id)));
CREATE POLICY "team_read_agent_sessions" ON agent_sessions FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "parent_read_agent_sessions" ON agent_sessions FOR SELECT TO anon USING (is_parent() AND is_related_to_team(team_id));

-- agent_conversations
CREATE POLICY "admin_read_conversations" ON agent_conversations FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_conversations" ON agent_conversations FOR SELECT TO anon USING (is_teacher() AND user_id = app_user_id());
CREATE POLICY "volunteer_read_conversations" ON agent_conversations FOR SELECT TO anon USING (is_volunteer() AND user_id = app_user_id());
CREATE POLICY "team_read_conversations" ON agent_conversations FOR SELECT TO anon USING (is_team() AND user_id = app_user_id());
CREATE POLICY "parent_read_conversations" ON agent_conversations FOR SELECT TO anon USING (is_parent() AND user_id = app_user_id());

-- ============================================
-- D. 管理员专用数据（仅admin可读）
-- ============================================

-- user_sessions
CREATE POLICY "admin_read_sessions" ON user_sessions FOR SELECT TO anon USING (is_admin());
CREATE POLICY "user_read_own_sessions" ON user_sessions FOR SELECT TO anon USING (user_id = app_user_id() AND app_role() IN ('super_admin', 'admin', 'teacher', 'volunteer'));

-- request_logs
CREATE POLICY "admin_read_request_logs" ON request_logs FOR SELECT TO anon USING (is_admin());

-- rate_limit_records
CREATE POLICY "admin_read_rate_limits" ON rate_limit_records FOR SELECT TO anon USING (is_admin());

-- security_events
CREATE POLICY "admin_read_security_events" ON security_events FOR SELECT TO anon USING (is_admin());

-- agent_memories
CREATE POLICY "admin_read_agent_memories" ON agent_memories FOR SELECT TO anon USING (is_admin());

-- task_feedback_knowledge
CREATE POLICY "admin_read_feedback_knowledge" ON task_feedback_knowledge FOR SELECT TO anon USING (is_admin());
CREATE POLICY "teacher_read_feedback_knowledge" ON task_feedback_knowledge FOR SELECT TO anon USING (is_teacher());

-- ============================================
-- E. 家长专用数据
-- ============================================

-- parent_accounts
CREATE POLICY "admin_read_parents" ON parent_accounts FOR SELECT TO anon USING (is_admin());
CREATE POLICY "parent_read_own_account" ON parent_accounts FOR SELECT TO anon USING (is_parent() AND id = app_user_id());

-- parent_team_relations
CREATE POLICY "admin_read_parent_relations" ON parent_team_relations FOR SELECT TO anon USING (is_admin());
CREATE POLICY "parent_read_own_relations" ON parent_team_relations FOR SELECT TO anon USING (is_parent() AND parent_id = app_user_id());
CREATE POLICY "team_read_parent_relations" ON parent_team_relations FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "teacher_read_parent_relations" ON parent_team_relations FOR SELECT TO anon USING (is_teacher());

-- ============================================
-- 第4部分：创建写入策略（仅admin可写，service_role自动绕过）
-- ============================================

-- 为所有表创建admin写入策略
-- 注意：service_role自动绕过RLS，这些策略主要针对anon角色

-- schools
CREATE POLICY "admin_write_schools" ON schools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- users
CREATE POLICY "admin_write_users" ON users FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_update_own_user" ON users FOR UPDATE TO anon USING (is_team() AND id = app_user_id());

-- teams
CREATE POLICY "admin_write_teams" ON teams FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_update_own_team" ON teams FOR UPDATE TO anon USING (is_team() AND id = app_team_id());

-- team_members
CREATE POLICY "admin_write_team_members" ON team_members FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_manage_own_members" ON team_members FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- task_submissions
CREATE POLICY "admin_write_submissions" ON task_submissions FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_create_submissions" ON task_submissions FOR INSERT TO anon WITH CHECK (is_team() AND team_id = app_team_id());
CREATE POLICY "team_read_own_submissions" ON task_submissions FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());

-- team_notifications
CREATE POLICY "admin_write_notifications" ON team_notifications FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_read_own_notifications" ON team_notifications FOR SELECT TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "team_update_own_notifications" ON team_notifications FOR UPDATE TO anon USING (is_team() AND team_id = app_team_id());

-- messages
CREATE POLICY "admin_write_messages" ON messages FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- blackboard_posts
CREATE POLICY "admin_write_posts" ON blackboard_posts FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_write_own_posts" ON blackboard_posts FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- blackboard_comments
CREATE POLICY "admin_write_comments" ON blackboard_comments FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_write_own_comments" ON blackboard_comments FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- blackboard_likes
CREATE POLICY "admin_write_post_likes" ON blackboard_likes FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_write_own_post_likes" ON blackboard_likes FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- blackboard_comment_likes
CREATE POLICY "admin_write_comment_likes" ON blackboard_comment_likes FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "team_write_own_comment_likes" ON blackboard_comment_likes FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- user_sessions
CREATE POLICY "admin_write_sessions" ON user_sessions FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- request_logs
CREATE POLICY "admin_write_request_logs" ON request_logs FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- rate_limit_records
CREATE POLICY "admin_write_rate_limits" ON rate_limit_records FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- security_events
CREATE POLICY "admin_write_security_events" ON security_events FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- parent_accounts
CREATE POLICY "admin_write_parents" ON parent_accounts FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- parent_team_relations
CREATE POLICY "admin_write_parent_relations" ON parent_team_relations FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- 其余表的admin写入策略（批量创建）
CREATE POLICY "admin_write_themes" ON task_themes FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_theme_schools" ON theme_schools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_tasks" ON tasks FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_tools" ON tools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_skills" ON skills FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_rewards" ON rewards FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_task_tools" ON task_tools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_task_skills" ON task_skills FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_task_rewards" ON task_rewards FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_tool_skills" ON tool_skills FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_team_tools" ON team_tools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_school_tools" ON school_tools FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_skill_learnings" ON team_skill_learnings FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_user_rewards" ON user_rewards FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_borrows" ON point_borrows FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_transactions" ON point_transactions FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_theme_selections" ON team_theme_selections FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_side_tasks" ON team_side_tasks FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_materials" ON learning_materials FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_material_progress" ON team_material_progress FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_activity_logs" ON team_activity_logs FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_agent_sessions" ON agent_sessions FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_agent_conversations" ON agent_conversations FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_agent_memories" ON agent_memories FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_feedback_knowledge" ON task_feedback_knowledge FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_final_task_forms" ON final_task_forms FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_final_submissions" ON final_task_submissions FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_difficulty" ON team_difficulty_preferences FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_gems" ON team_heart_gems FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_health" ON health_check FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_write_pretests" ON team_pretests FOR ALL TO anon USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- 第5部分：步骤3.2 - 按角色限定范围的写入策略
-- ============================================

-- users: volunteer/teacher 可更新自己的资料
CREATE POLICY "volunteer_update_own_user" ON users FOR UPDATE TO anon USING (is_volunteer() AND id = app_user_id());
CREATE POLICY "teacher_update_own_user" ON users FOR UPDATE TO anon USING (is_teacher() AND id = app_user_id());

-- task_submissions: team 可更新自己的提交, teacher/volunteer 可审核
CREATE POLICY "team_update_own_submissions" ON task_submissions FOR UPDATE TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "teacher_review_submissions" ON task_submissions FOR UPDATE TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));
CREATE POLICY "volunteer_review_submissions" ON task_submissions FOR UPDATE TO anon USING (is_volunteer() AND is_related_to_team(team_id));

-- messages: team/volunteer/teacher/parent 可发送消息
CREATE POLICY "team_send_messages" ON messages FOR INSERT TO anon WITH CHECK (is_team() AND (team_id = app_team_id() OR sender_id = app_user_id()));
CREATE POLICY "volunteer_send_messages" ON messages FOR INSERT TO anon WITH CHECK (is_volunteer() AND (sender_id = app_user_id()));
CREATE POLICY "teacher_send_messages" ON messages FOR INSERT TO anon WITH CHECK (is_teacher() AND (sender_id = app_user_id()));
CREATE POLICY "parent_send_messages" ON messages FOR INSERT TO anon WITH CHECK (is_parent() AND (sender_id = app_user_id()));
CREATE POLICY "team_update_own_messages" ON messages FOR UPDATE TO anon USING (is_team() AND team_id = app_team_id());

-- team_theme_selections: team 可创建/更新自己的主题选择
CREATE POLICY "team_write_own_theme_selections" ON team_theme_selections FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());
CREATE POLICY "volunteer_write_theme_selections" ON team_theme_selections FOR ALL TO anon USING (is_volunteer() AND is_related_to_team(team_id)) WITH CHECK (is_volunteer() AND is_related_to_team(team_id));

-- team_skill_learnings: team 可更新自己的学习进度
CREATE POLICY "team_write_own_skill_learnings" ON team_skill_learnings FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- team_material_progress: team 可更新自己的学习进度
CREATE POLICY "team_write_own_material_progress" ON team_material_progress FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- team_tools: team 可选择工具
CREATE POLICY "team_write_own_team_tools" ON team_tools FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- team_side_tasks: volunteer 可分配支线任务
CREATE POLICY "volunteer_write_side_tasks" ON team_side_tasks FOR INSERT TO anon WITH CHECK (is_volunteer() AND is_related_to_team(team_id));
CREATE POLICY "team_update_own_side_tasks" ON team_side_tasks FOR UPDATE TO anon USING (is_team() AND team_id = app_team_id());

-- point_borrows: team 可发起/批准借贷
CREATE POLICY "team_create_borrows" ON point_borrows FOR INSERT TO anon WITH CHECK (is_team() AND (borrower_id = app_team_id() OR lender_id = app_team_id()));
CREATE POLICY "team_update_own_borrows" ON point_borrows FOR UPDATE TO anon USING (is_team() AND (borrower_id = app_team_id() OR lender_id = app_team_id()));

-- point_transactions: team 可发起积分交易
CREATE POLICY "team_create_transactions" ON point_transactions FOR INSERT TO anon WITH CHECK (is_team() AND (from_team_id = app_team_id() OR to_team_id = app_team_id()));

-- team_heart_gems: team 可获得宝石
CREATE POLICY "team_write_own_gems" ON team_heart_gems FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- team_pretests: team 可提交预测试
CREATE POLICY "team_write_own_pretests" ON team_pretests FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- team_difficulty_preferences: team 可设置偏好
CREATE POLICY "team_write_own_difficulty" ON team_difficulty_preferences FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- final_task_submissions: team 可提交最终任务
CREATE POLICY "team_create_final_submissions" ON final_task_submissions FOR INSERT TO anon WITH CHECK (is_team() AND team_id = app_team_id());
CREATE POLICY "team_update_own_final_submissions" ON final_task_submissions FOR UPDATE TO anon USING (is_team() AND team_id = app_team_id());
CREATE POLICY "teacher_review_final_submissions" ON final_task_submissions FOR UPDATE TO anon USING (is_teacher() AND team_id IN (SELECT id FROM teams WHERE school_id = app_school_id()));

-- team_activity_logs: team 可记录活动
CREATE POLICY "team_write_own_activity_logs" ON team_activity_logs FOR INSERT TO anon WITH CHECK (is_team() AND team_id = app_team_id());

-- user_rewards: team 可获得奖励
CREATE POLICY "team_write_own_user_rewards" ON user_rewards FOR ALL TO anon USING (is_team() AND team_id = app_team_id()) WITH CHECK (is_team() AND team_id = app_team_id());

-- parent_accounts: parent 可注册/更新自己的账号
CREATE POLICY "parent_register" ON parent_accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "parent_update_own_account" ON parent_accounts FOR UPDATE TO anon USING (is_parent() AND id = app_user_id());

-- parent_team_relations: parent 可关联小队
CREATE POLICY "parent_create_own_relations" ON parent_team_relations FOR INSERT TO anon WITH CHECK (is_parent() AND parent_id = app_user_id());
CREATE POLICY "parent_delete_own_relations" ON parent_team_relations FOR DELETE TO anon USING (is_parent() AND parent_id = app_user_id());

-- agent_sessions: 用户可创建会话
CREATE POLICY "user_create_agent_sessions" ON agent_sessions FOR INSERT TO anon WITH CHECK (app_role() IN ('team', 'volunteer', 'teacher', 'parent') AND user_id = app_user_id());
CREATE POLICY "user_update_own_agent_sessions" ON agent_sessions FOR UPDATE TO anon USING (app_role() IN ('team', 'volunteer', 'teacher', 'parent') AND user_id = app_user_id());

-- agent_conversations: 用户可创建对话
CREATE POLICY "user_create_agent_conversations" ON agent_conversations FOR INSERT TO anon WITH CHECK (app_role() IN ('team', 'volunteer', 'teacher', 'parent') AND user_id = app_user_id());

-- team_notifications: 系统可为 team 创建通知
CREATE POLICY "team_create_own_notifications" ON team_notifications FOR INSERT TO anon WITH CHECK (is_team() AND team_id = app_team_id());

-- school_tools: teacher 可更新本校工具库存
CREATE POLICY "teacher_write_school_tools" ON school_tools FOR UPDATE TO anon USING (is_teacher() AND school_id = app_school_id());

-- ============================================
-- 完成！RLS策略已创建
-- ============================================
-- 注意事项：
-- 1. service_role key 自动绕过所有RLS策略
-- 2. 所有服务端API路由应使用 getSupabaseAdminClient()（已通过getSupabaseClient()代理）
-- 3. anon key 的直接访问受RLS策略保护
-- 4. 策略通过请求头 x-app-role/x-app-user-id/x-app-school-id/x-app-team-id 判断角色

/**
 * NL2SQL Prompt 模板
 * 提供结构化的 Prompt 模板，提升自然语言转 SQL 的稳定性和准确率
 * 适配项目的 Supabase/PostgreSQL 数据库架构
 */

/** 数据库表结构概要（用于 Prompt 上下文） */
export const DATABASE_SCHEMA_OVERVIEW = `
## 数据库表结构概要

### 核心业务表
1. **schools** — 学校
   - id, name, region, created_at

2. **users** — 管理员用户
   - id, username, password_hash, role(super_admin/teacher/volunteer), school_id, is_active, created_at

3. **teams** — 小队
   - id, name, code, slogan, school_id, points, cycle, current_theme_id, is_active, created_at

4. **task_themes** — 任务主题
   - id, title, description, cover_image, is_exclusive, school_id, sort_order, is_active, created_at

5. **task_groups** — 任务组
   - id, theme_id, group_name, group_description, phase, sort_order, created_at

6. **tasks** — 任务
   - id, group_id, theme_id, title, description, difficulty(easy/medium/hard), points, requirements, learning_goals, group_description, group_task_id, sort_order, created_at

7. **submissions** — 小队产出
   - id, task_id, team_id, content, images, status(pending/approved/rejected), score, review_comment, reviewed_by, reviewed_at, created_at

8. **task_rewards** — 任务激励关联
   - id, task_id, reward_id, quantity, created_at

9. **rewards** — 激励物品
   - id, name, description, type(point/badge/item), image, value, stock, school_id, is_active, created_at

10. **task_skills** — 任务技能关联
    - id, task_id, skill_id, created_at

11. **skills** — 技能
    - id, name, description, icon, category, school_id, is_active, created_at

12. **task_tools** — 任务工具关联
    - id, task_id, tool_id, quantity, created_at

13. **tools** — 工具
    - id, name, description, icon, stock, school_id, is_active, created_at

14. **team_theme_selections** — 小队主题选择记录
    - id, team_id, theme_id, cycle, status(in_progress/completed), selected_at, completed_at

15. **likes** — 点赞记录
    - id, user_id, team_id, submission_id, created_at

16. **notifications** — 消息通知
    - id, user_id, type, title, content, is_read, related_id, created_at

17. **parents** — 家长
    - id, phone, name, password_hash, school_id, is_active, created_at

18. **parent_team_follows** — 家长关注小队
    - id, parent_id, team_id, child_name, child_grade, relation, guardian_reason, status(approved/rejected/pending), is_active, followed_at, reviewed_by, reviewed_at, review_remark

19. **agent_reflections** — AI自省记录
    - id, agent_id, user_id, session_id, category(correction/insight/knowledge_gap/best_practice/error_pattern/skill_gap), area(teaching/data_analysis/communication/task_handling/safety/domain_knowledge/emotional_intel/tool_usage), priority(low/medium/high/critical), status(pending/in_progress/resolved/promoted), trigger_context, learning, action_item, correction, team_id, school_id, occurrence_count, created_at, resolved_at

### 关键关系
- teams.school_id → schools.id
- teams.current_theme_id → task_themes.id
- task_groups.theme_id → task_themes.id
- tasks.group_id → task_groups.id
- submissions.task_id → tasks.id, submissions.team_id → teams.id
- task_rewards.task_id → tasks.id, task_rewards.reward_id → rewards.id
- task_skills.task_id → tasks.id, task_skills.skill_id → skills.id
- task_tools.task_id → tasks.id, task_tools.tool_id → tools.id
- team_theme_selections.team_id → teams.id, team_theme_selections.theme_id → task_themes.id
- users.school_id → schools.id (teacher/volunteer 角色有学校归属)
`;

/** NL2SQL 核心 Prompt 模板 */
export const NL2SQL_SYSTEM_PROMPT = `你是一个专业的 SQL 生成器，负责将自然语言问题转换为 PostgreSQL 查询语句。

## 规则
1. 只生成 SELECT 查询，禁止生成 INSERT/UPDATE/DELETE/CREATE/DROP/ALTER
2. 表名和列名必须与上述数据库结构完全一致
3. 使用 PostgreSQL 语法（不是 MySQL）
4. 字符串用单引号，标识符用双引号
5. 日期函数用 PostgreSQL 语法：NOW(), CURRENT_DATE, EXTRACT(), DATE_TRUNC()
6. 始终添加合理的 LIMIT（默认最多 100 条）
7. 对中文条件使用 ILIKE 模糊匹配（如 WHERE name ILIKE '%关键词%'）
8. 数值比较用精确匹配，名称用模糊匹配
9. JOIN 时使用标准 ANSI 语法（ON 条件）
10. 遇到不确定的表名或列名，使用最接近的匹配，不要编造

## 输出格式
只输出一条纯 SQL 语句，不要解释，不要代码块标记，不要注释。
示例：SELECT t.name, t.points FROM teams t ORDER BY t.points DESC LIMIT 10

## 常见查询模式

### 统计类
- 各学校小队数量：SELECT s.name, COUNT(t.id) FROM schools s LEFT JOIN teams t ON t.school_id = s.id GROUP BY s.id, s.name
- 小队总积分排名：SELECT name, points FROM teams WHERE is_active = true ORDER BY points DESC LIMIT 10

### 关联类
- 某小队的任务进度：SELECT tg.group_name, t.title, t.difficulty, COALESCE(s.status, '未提交') as status FROM tasks t JOIN task_groups tg ON t.group_id = tg.id LEFT JOIN submissions s ON s.task_id = t.id AND s.team_id = '团队UUID' WHERE t.theme_id = (SELECT current_theme_id FROM teams WHERE id = '团队UUID') ORDER BY tg.sort_order, t.sort_order

### 时间类
- 本周新增产出：SELECT COUNT(*) FROM submissions WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
- 按月统计产出数量：SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) FROM submissions GROUP BY month ORDER BY month
`;

/** 角色数据范围定义 */
export interface RoleDataScope {
  role: 'super_admin' | 'teacher' | 'volunteer' | 'team';
  schoolId?: string;
  schoolName?: string;
  teamId?: string;
  teamName?: string;
  volunteerTeamIds?: string[];
  volunteerTeamNames?: string[];
}

/** 根据角色生成数据范围约束说明 */
function buildDataScopeConstraint(scope: RoleDataScope): string {
  switch (scope.role) {
    case 'super_admin':
      return `当前用户是超级管理员，可以查询所有学校、所有小队的数据，无范围限制。`;

    case 'teacher':
      return `当前用户是助学老师，归属学校: ${scope.schoolName || scope.schoolId || '未知'}（school_id = '${scope.schoolId || ''}'）。
**数据范围约束**：
- 只能查询本校（school_id = '${scope.schoolId || ''}'）的数据
- teams 表必须加 WHERE school_id = '${scope.schoolId || ''}'
- users 表必须加 WHERE school_id = '${scope.schoolId || ''}'
- submissions 表如果需要按学校过滤，通过 JOIN teams ON submissions.team_id = teams.id 并加 WHERE teams.school_id = '${scope.schoolId || ''}'
- 禁止查询其他学校的数据`;

    case 'volunteer':
      const teamIds = scope.volunteerTeamIds || [];
      const teamNames = scope.volunteerTeamNames || [];
      return `当前用户是志愿者，负责指导以下小队：${teamNames.join('、') || '无'}（team_id: ${teamIds.map(id => `'${id}'`).join(',') || '无'}）。
**数据范围约束**：
- 只能查询自己指导的小队数据
- teams 表必须加 WHERE id IN (${teamIds.map(id => `'${id}'`).join(',') || "''"})
- submissions 表必须加 WHERE team_id IN (${teamIds.map(id => `'${id}'`).join(',') || "''"})
- 禁止查询非自己指导的小队数据`;

    case 'team':
      return `当前用户是小队成员，小队名称: ${scope.teamName || '未知'}（team_id = '${scope.teamId || ''}'）。
**数据范围约束**：
- 只能查询本小队自己的数据
- teams 表必须加 WHERE id = '${scope.teamId || ''}'
- submissions 表必须加 WHERE team_id = '${scope.teamId || ''}'
- team_theme_selections 必须加 WHERE team_id = '${scope.teamId || ''}'
- task_rewards 如果按小队查，必须加 WHERE team_id = '${scope.teamId || ''}'
- 禁止查询其他小队的数据`;

    default:
      return `当前用户角色未知，只能查询公开数据。`;
  }
}

/** 根据角色过滤可访问的表结构 */
function filterSchemaByRole(scope: RoleDataScope): string {
  const fullSchema = DATABASE_SCHEMA_OVERVIEW;
  
  if (scope.role === 'super_admin') {
    return fullSchema;
  }

  // 非超管隐藏敏感表
  const hiddenTables = scope.role === 'team'
    ? ['users', 'parents', 'parent_team_follows', 'volunteers', 'notifications']
    : ['parents', 'parent_team_follows'];

  let filtered = fullSchema;
  for (const table of hiddenTables) {
    // 移除该表的条目
    const regex = new RegExp(`\\d+\\. \\*\\*${table}\\*\\*.*?(?=\\n\\d+\\. \\*\\*|\\n### |$)`, 'gs');
    filtered = filtered.replace(regex, '');
  }

  return filtered;
}

/** 根据用户问题和角色数据范围生成带上下文的 Prompt */
export function buildNL2SQLPrompt(userQuestion: string, scope?: RoleDataScope): string {
  // 根据角色过滤 Schema
  const schemaContext = scope ? filterSchemaByRole(scope) : DATABASE_SCHEMA_OVERVIEW;
  
  let prompt = NL2SQL_SYSTEM_PROMPT.replace(DATABASE_SCHEMA_OVERVIEW, schemaContext);

  if (scope) {
    const constraint = buildDataScopeConstraint(scope);
    prompt += `\n## 当前用户数据范围\n${constraint}\n\n**重要**：你生成的 SQL 必须遵守上述数据范围约束，在 WHERE 子句中加入对应的过滤条件。不要生成超出当前用户权限范围的查询。`;
  }

  prompt += `\n## 用户问题\n${userQuestion}\n\n请生成 SQL：`;

  return prompt;
}

/** 旧版兼容：接受 roleContext 字符串 */
export function buildNL2SQLPromptLegacy(userQuestion: string, roleContext?: string): string {
  let prompt = NL2SQL_SYSTEM_PROMPT;

  if (roleContext) {
    prompt += `\n## 当前用户角色上下文\n${roleContext}\n请在查询中考虑角色权限过滤。`;
  }

  prompt += `\n## 用户问题\n${userQuestion}\n\n请生成 SQL：`;

  return prompt;
}

/** SQL 生成后的自检模板 */
export const SQL_SELF_CHECK_PROMPT = `请检查以下 SQL 是否正确：

1. 表名是否存在于数据库结构中？
2. 列名是否正确？
3. JOIN 条件是否完整？
4. WHERE 条件是否覆盖了用户问题中的所有约束？
5. 是否有语法错误？
6. 是否为只读 SELECT 查询？

如果发现问题，请输出修正后的 SQL。如果没有问题，原样输出。

原始 SQL：
`;

/** SQL 错误修复模板 */
export function buildSQLErrorFixPrompt(originalSql: string, errorMessage: string, question: string): string {
  return `以下是针对问题"${question}"生成的 SQL，执行时出错了。请修复。

原始 SQL: ${originalSql}
错误信息: ${errorMessage}

请参考数据库结构，修复 SQL 并输出修正后的纯 SQL 语句（不要解释，不要代码块）：`;
}

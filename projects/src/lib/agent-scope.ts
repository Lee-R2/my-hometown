import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 跨智能体数据交流 - 角色-团队范围解析模块
 * 
 * 根据用户角色确定可访问的小队范围，用于跨智能体记忆共享：
 * - 超级管理员(super_admin) → 所有活跃小队
 * - 助学老师(teacher) → 本校所有活跃小队
 * - 志愿者(volunteer) → 自己创建/指导的活跃小队
 * - 家长(parent) → 已关注且审核通过的小队
 */

export interface TeamScope {
  teamIds: string[];
  teamNames: Map<string, string>;  // team_id → team_name 映射
  scopeDescription: string;         // 范围描述（用于系统提示词）
}

/**
 * 解析用户可访问的小队范围
 */
export async function resolveTeamScope(
  userId: string,
  userRole: string
): Promise<TeamScope> {
  const client = getSupabaseClient();
  const teamNames = new Map<string, string>();

  try {
    if (userRole === 'super_admin' || userRole === 'admin') {
      // 超级管理员：所有活跃小队
      const { data: teams } = await client
        .from('teams')
        .select('id, name')
        .eq('status', 'active');

      const teamIds = (teams || []).map((t: any) => {
        teamNames.set(t.id, t.name);
        return t.id;
      });

      return {
        teamIds,
        teamNames,
        scopeDescription: `全局视角（${teamIds.length}个活跃小队）`
      };
    }

    if (userRole === 'teacher') {
      // 助学老师：本校所有活跃小队
      const { data: teacher } = await client
        .from('users')
        .select('school_id')
        .eq('id', userId)
        .single();

      if (!teacher?.school_id) {
        return { teamIds: [], teamNames, scopeDescription: '未关联学校' };
      }

      const { data: teams } = await client
        .from('teams')
        .select('id, name')
        .eq('school_id', teacher.school_id)
        .eq('status', 'active');

      const teamIds = (teams || []).map((t: any) => {
        teamNames.set(t.id, t.name);
        return t.id;
      });

      return {
        teamIds,
        teamNames,
        scopeDescription: `本校视角（${teamIds.length}个小队）`
      };
    }

    if (userRole === 'volunteer') {
      // 志愿者：自己创建/指导的活跃小队
      const { data: teams } = await client
        .from('teams')
        .select('id, name')
        .eq('created_by', userId)
        .eq('status', 'active');

      const teamIds = (teams || []).map((t: any) => {
        teamNames.set(t.id, t.name);
        return t.id;
      });

      return {
        teamIds,
        teamNames,
        scopeDescription: `指导小队视角（${teamIds.length}个小队）`
      };
    }

    if (userRole === 'parent') {
      // 家长：已关注且审核通过的小队
      const { data: follows } = await client
        .from('parent_team_follows')
        .select('team_id')
        .eq('parent_id', userId)
        .eq('is_active', true)
        .eq('status', 'approved');

      if (!follows || follows.length === 0) {
        return { teamIds: [], teamNames, scopeDescription: '尚未关注小队' };
      }

      const followTeamIds = follows.map((f: any) => f.team_id);

      // 获取小队名称
      const { data: teams } = await client
        .from('teams')
        .select('id, name')
        .in('id', followTeamIds)
        .eq('status', 'active');

      const teamIds = (teams || []).map((t: any) => {
        teamNames.set(t.id, t.name);
        return t.id;
      });

      return {
        teamIds,
        teamNames,
        scopeDescription: `关注小队视角（${teamIds.length}个小队）`
      };
    }

    return { teamIds: [], teamNames, scopeDescription: '未知角色' };
  } catch (error) {
    console.error('[agent-scope] 解析团队范围失败:', error);
    return { teamIds: [], teamNames, scopeDescription: '解析失败' };
  }
}

/**
 * 获取银蛇博士观察到的、属于指定小队范围的关键记忆
 * 用于蜡象助手读取银蛇博士的团队级观察数据
 */
export const YINSHE_SHAREABLE_TYPES = [
  'learning_difficulty',   // 学习困难/卡点
  'learning_interest',     // 学习兴趣
  'task_progress',         // 任务进展（主观感受）
  'interaction_style',     // 互动偏好
  'teaching_point',        // 教过的关键知识
  'team_info',             // 小队信息
  'user_info',             // 用户信息（小队级）
] as const;

/**
 * 获取蜡象助手观察到的、属于指定小队范围的关键记忆
 * 用于银蛇博士读取蜡象助手的团队级观察数据
 */
export const LAXIANG_SHAREABLE_TYPES = [
  'work_concern',          // 老师关注点（团队级）
  'review_style',          // 审核风格
  'school_context',        // 学校/小队动态
  'data_insight',          // 数据洞察（团队级）
] as const;

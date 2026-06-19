import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 数据同步API
 * 返回各数据表的最后更新时间戳，用于前端判断是否需要刷新数据
 */

interface SyncStatus {
  teams: number;
  tasks: number;
  submissions: number;
  rewards: number;
  skills: number;
  tools: number;
  messages: number;
  members: number;
  user_rewards: number;
  task_themes: number;
  team_side_tasks: number;
  permissions: number;
}

export async function GET(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');
    const lastSync = searchParams.get('lastSync'); // 上次同步时间

    const status: SyncStatus = {
      teams: 0,
      tasks: 0,
      submissions: 0,
      rewards: 0,
      skills: 0,
      tools: 0,
      messages: 0,
      members: 0,
      user_rewards: 0,
      task_themes: 0,
      team_side_tasks: 0,
      permissions: 0,
    };

    // 获取各表的最后更新时间
    const now = Date.now();

    // 小队端同步
    if (teamId) {
      // 小队信息更新
      const { data: team } = await client
        .from('teams')
        .select('updated_at')
        .eq('id', teamId)
        .single();
      if (team?.updated_at) {
        status.teams = new Date(team.updated_at).getTime();
      }

      // 小队成员更新
      const { data: members } = await client
        .from('team_members')
        .select('updated_at')
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (members && members.length > 0) {
        status.members = new Date(members[0].updated_at).getTime();
      }

      // 小队的产出提交更新
      const { data: submissions } = await client
        .from('task_submissions')
        .select('updated_at, created_at')
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (submissions && submissions.length > 0) {
        const time = submissions[0].updated_at 
          ? new Date(submissions[0].updated_at).getTime()
          : (submissions[0].created_at ? new Date(submissions[0].created_at).getTime() : 0);
        status.submissions = time;
      }

      // 小队获得的激励
      const { data: userRewards } = await client
        .from('user_rewards')
        .select('created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (userRewards && userRewards.length > 0) {
        status.user_rewards = new Date(userRewards[0].created_at).getTime();
      }

      // 小队的支线任务
      const { data: sideTasks } = await client
        .from('team_side_tasks')
        .select('assigned_at')
        .eq('team_id', teamId)
        .order('assigned_at', { ascending: false })
        .limit(1);
      if (sideTasks && sideTasks.length > 0) {
        status.team_side_tasks = new Date(sideTasks[0].assigned_at).getTime();
      }

      // 任务更新（小队当前主题相关）
      const { data: teamData } = await client
        .from('teams')
        .select('current_theme_id')
        .eq('id', teamId)
        .single();
      
      if (teamData?.current_theme_id) {
        const { data: tasks } = await client
          .from('tasks')
          .select('updated_at')
          .eq('theme_id', teamData.current_theme_id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (tasks && tasks.length > 0) {
          status.tasks = new Date(tasks[0].updated_at).getTime();
        }
      }

      // 技能学习
      const { data: skills } = await client
        .from('skills')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (skills && skills.length > 0) {
        status.skills = new Date(skills[0].updated_at).getTime();
      }

      // 工具
      const { data: tools } = await client
        .from('tools')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (tools && tools.length > 0) {
        status.tools = new Date(tools[0].updated_at).getTime();
      }

      // 激励配置
      const { data: rewards } = await client
        .from('rewards')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (rewards && rewards.length > 0) {
        status.rewards = new Date(rewards[0].updated_at).getTime();
      }

      // 小队消息
      const { data: messages } = await client
        .from('messages')
        .select('created_at')
        .or(`target_type.eq.all,target_team_id.eq.${teamId}`)
        .order('created_at', { ascending: false })
        .limit(1);
      if (messages && messages.length > 0) {
        status.messages = new Date(messages[0].created_at).getTime();
      }

      // 权限配置更新（小队端也需要检测）
      const { data: permissions } = await client
        .from('role_permissions')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (permissions && permissions.length > 0 && permissions[0].updated_at) {
        status.permissions = new Date(permissions[0].updated_at).getTime();
      }
    }

    // 管理员端同步
    if (userId && userRole) {
      // 超级管理员查看所有数据
      if (userRole === 'admin' || userRole === 'super_admin') {
        const { data: teams } = await client
          .from('teams')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (teams && teams.length > 0) {
          status.teams = new Date(teams[0].updated_at).getTime();
        }

        const { data: submissions } = await client
          .from('task_submissions')
          .select('updated_at, created_at')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (submissions && submissions.length > 0) {
          const time = submissions[0].updated_at 
            ? new Date(submissions[0].updated_at).getTime()
            : (submissions[0].created_at ? new Date(submissions[0].created_at).getTime() : 0);
          status.submissions = time;
        }

        const { data: tasks } = await client
          .from('tasks')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (tasks && tasks.length > 0) {
          status.tasks = new Date(tasks[0].updated_at).getTime();
        }

        const { data: themes } = await client
          .from('task_themes')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (themes && themes.length > 0) {
          status.task_themes = new Date(themes[0].updated_at).getTime();
        }

        // 全局的奖励更新
        const { data: userRewards } = await client
          .from('user_rewards')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);
        if (userRewards && userRewards.length > 0) {
          status.user_rewards = new Date(userRewards[0].created_at).getTime();
        }
      } 
      // 授课志愿者查看自己创建的小队数据
      else if (userRole === 'volunteer') {
        const { data: teams } = await client
          .from('teams')
          .select('updated_at')
          .eq('assigned_volunteer_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (teams && teams.length > 0) {
          status.teams = new Date(teams[0].updated_at).getTime();
        }

        const { data: teamList } = await client
          .from('teams')
          .select('id')
          .eq('assigned_volunteer_id', userId);
        
        if (teamList && teamList.length > 0) {
          const teamIds = teamList.map(t => t.id);
          
          const { data: submissions } = await client
            .from('task_submissions')
            .select('updated_at, created_at')
            .in('team_id', teamIds)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (submissions && submissions.length > 0) {
            const time = submissions[0].updated_at 
              ? new Date(submissions[0].updated_at).getTime()
              : (submissions[0].created_at ? new Date(submissions[0].created_at).getTime() : 0);
            status.submissions = time;
          }
        }

        // 志愿者创建的任务主题
        const { data: themes } = await client
          .from('task_themes')
          .select('updated_at')
          .eq('creator_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (themes && themes.length > 0) {
          status.task_themes = new Date(themes[0].updated_at).getTime();
        }

        // 志愿者创建的小队获得的奖励
        if (teamList && teamList.length > 0) {
          const teamIds = teamList.map(t => t.id);
          const { data: userRewards } = await client
            .from('user_rewards')
            .select('created_at')
            .in('team_id', teamIds)
            .order('created_at', { ascending: false })
            .limit(1);
          if (userRewards && userRewards.length > 0) {
            status.user_rewards = new Date(userRewards[0].created_at).getTime();
          }
        }
      }
      // 助学老师查看对接的小队数据
      else if (userRole === 'teacher') {
        // 先获取助学老师的学校
        const { data: teacherData } = await client
          .from('users')
          .select('school_id')
          .eq('id', userId)
          .single();
        
        let teamIds: string[] = [];
        
        if (teacherData?.school_id) {
          // 获取该校所有小队
          const { data: schoolTeams } = await client
            .from('teams')
            .select('id, updated_at')
            .eq('school_id', teacherData.school_id);
          
          if (schoolTeams && schoolTeams.length > 0) {
            teamIds = schoolTeams.map(t => t.id);
            // 更新状态
            const latestUpdate = schoolTeams.reduce((max: number, t: any) => {
              const time = new Date(t.updated_at).getTime();
              return time > max ? time : max;
            }, 0);
            status.teams = latestUpdate;
          }
        } else {
          // 如果没有学校信息，只看自己对接的小队
          const { data: teams } = await client
            .from('teams')
            .select('updated_at')
            .eq('teacher_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (teams && teams.length > 0) {
            status.teams = new Date(teams[0].updated_at).getTime();
          }

          const { data: teamList } = await client
            .from('teams')
            .select('id')
            .eq('teacher_id', userId);
          
          if (teamList && teamList.length > 0) {
            teamIds = teamList.map(t => t.id);
          }
        }
        
        if (teamIds.length > 0) {
          // 查询提交更新时间（同时检查 updated_at 和 created_at）
          const { data: submissions } = await client
            .from('task_submissions')
            .select('updated_at, created_at')
            .in('team_id', teamIds)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (submissions && submissions.length > 0) {
            // 使用 updated_at，如果为空则使用 created_at
            const time = submissions[0].updated_at 
              ? new Date(submissions[0].updated_at).getTime()
              : (submissions[0].created_at ? new Date(submissions[0].created_at).getTime() : 0);
            status.submissions = time;
          }

          // 老师对接的小队获得的奖励
          const { data: userRewards } = await client
            .from('user_rewards')
            .select('created_at')
            .in('team_id', teamIds)
            .order('created_at', { ascending: false })
            .limit(1);
          if (userRewards && userRewards.length > 0) {
            status.user_rewards = new Date(userRewards[0].created_at).getTime();
          }
        }
      }

      // 通用数据
      const { data: skills } = await client
        .from('skills')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (skills && skills.length > 0) {
        status.skills = new Date(skills[0].updated_at).getTime();
      }

      const { data: tools } = await client
        .from('tools')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (tools && tools.length > 0) {
        status.tools = new Date(tools[0].updated_at).getTime();
      }

      const { data: rewards } = await client
        .from('rewards')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (rewards && rewards.length > 0) {
        status.rewards = new Date(rewards[0].updated_at).getTime();
      }

      // 消息
      const { data: messages } = await client
        .from('messages')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (messages && messages.length > 0) {
        status.messages = new Date(messages[0].created_at).getTime();
      }

      // 权限配置更新
      const { data: permissions } = await client
        .from('role_permissions')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (permissions && permissions.length > 0 && permissions[0].updated_at) {
        status.permissions = new Date(permissions[0].updated_at).getTime();
      }
    }

    // 计算是否有更新
    let hasUpdates = false;
    const changes: string[] = [];
    
    if (lastSync) {
      const lastSyncTime = parseInt(lastSync);
      for (const [key, timestamp] of Object.entries(status)) {
        if (timestamp > lastSyncTime) {
          hasUpdates = true;
          changes.push(key);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
      status,
      hasUpdates,
      changes,
    });
  } catch (error) {
    console.error('同步状态获取失败:', error);
    return ApiErrors.validation('同步状态获取失败');
  }
}

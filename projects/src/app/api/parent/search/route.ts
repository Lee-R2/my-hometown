import { requireParent, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ApiErrors } from '@/lib/api-error';

// 搜索小队
export async function GET(request: NextRequest) {
  try {
    const auth = await requireParent(request);
    if (!auth.authenticated) return authError(auth);

    const supabase = getAuthenticatedClient(request, auth);

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const parentIdParam = searchParams.get('parentId');
    const schoolId = searchParams.get('schoolId');

    // LE-A15: 强制使用认证身份,防止家长 A 查询家长 B 的关注关系
    const parentId = auth.payload!.userId;
    // parentIdParam 仅作兼容校验,若与登录身份不一致则忽略(不报错以保持前端兼容)

    if (!keyword) {
      return ApiErrors.validation('请输入搜索关键词');
    }

    let allTeamIds: string[] = [];

    // 1. 搜索小队名称
    const { data: teamsByName } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', `%${keyword}%`);

    if (teamsByName && teamsByName.length > 0) {
      allTeamIds.push(...teamsByName.map((t: any) => t.id));
    }

    // 2. 搜索包含该成员的小队
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('team_id, name, role')
      .ilike('name', `%${keyword}%`);

    if (membersError) {
      console.error('[搜索小队] 成员查询失败:', membersError);
    } else if (members && members.length > 0) {
      const memberTeamIds = members.map(m => m.team_id).filter(Boolean);
      allTeamIds.push(...memberTeamIds);
    }

    if (allTeamIds.length === 0) {
      return NextResponse.json({
        success: true,
        teams: []
      });
    }

    // 去重
    const uniqueTeamIds = [...new Set(allTeamIds)];

    // 3. 获取这些小队的详细信息
    let teamsQuery = supabase
      .from('teams')
      .select('id, name, slogan, cycle, school_id, current_theme_id')
      .in('id', uniqueTeamIds);

    // 如果指定了学校ID，过滤
    if (schoolId) {
      teamsQuery = teamsQuery.eq('school_id', schoolId);
    }

    const { data: teams, error: teamsError } = await teamsQuery;

    if (teamsError) {
      console.error('[搜索小队] 小队查询失败:', teamsError);
      return ApiErrors.validation('搜索失败');
    }

    // 4. 获取学校名称
    let schoolNames: Record<string, string> = {};
    if (teams && teams.length > 0) {
      const schoolIds = [...new Set(teams.map(t => t.school_id).filter(Boolean))];
      if (schoolIds.length > 0) {
        const { data: schools } = await supabase
          .from('schools')
          .select('id, name')
          .in('id', schoolIds);
        
        if (schools) {
          schoolNames = schools.reduce((acc, s) => {
            acc[s.id] = s.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }
    }

    // 4. 获取已关注的小队
    let followedIds: Record<string, { followId: string; childName: string }> = {};
    if (parentId) {
      const { data: follows } = await supabase
        .from('parent_team_follows')
        .select('team_id, child_name')
        .eq('parent_id', parentId)
        .eq('status', 'approved');

      if (follows) {
        follows.forEach(f => {
          if (!followedIds[f.team_id]) {
            followedIds[f.team_id] = { followId: f.team_id, childName: f.child_name };
          }
        });
      }
    }

    // 5. 格式化返回数据
    const result = (teams || []).map(team => {
      // 找到匹配的成员
      const matchingMember = (members || []).find(m => m.team_id === team.id);
      
      return {
        id: team.id,
        name: team.name,
        slogan: team.slogan,
        cycle: team.cycle,
        schoolId: team.school_id,
        schoolName: schoolNames[team.school_id] || null,
        childName: matchingMember?.name || keyword,
        childRole: matchingMember?.role || null,
        isFollowed: !!followedIds[team.id]
      };
    });

    return NextResponse.json({
      success: true,
      teams: result
    });

  } catch (error: any) {
    console.error('[搜索小队] 错误:', error);
    return ApiErrors.validation('搜索小队失败');
  }
}

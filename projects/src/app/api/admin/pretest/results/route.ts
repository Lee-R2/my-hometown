import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrVolunteer, requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

const supabaseAdmin = getSupabaseAdminClient();

// 素养水平标签
const literacyLevelLabels: Record<string, string> = {
  advanced: '高级',
  intermediate: '中级',
  beginner: '初级',
  developing: '待发展',
};

// 角色标签
const roleLabels: Record<string, string> = {
  guide: '🧭 引导者',
  visual: '📷 光影法师',
  text: '📜 秘语学者',
};

// 角色倾向类型标签
const roleTypeLabels: Record<string, string> = {
  strong: '强倾向',
  dual: '双倾向',
  balanced: '综合型',
};

// 维度标签
const dimensionLabels: Record<string, string> = {
  A: '情感与态度',
  B: '使用与协作',
  C: '认知与理解',
  D: '伦理与责任',
};

// 素养水平划分
function getLiteracyLevel(totalScore: number): { level: string; label: string; description: string } {
  if (totalScore >= 38) return { level: 'advanced', label: '高级', description: 'AI素养发展良好，能积极、理性、负责任地与AI互动' };
  if (totalScore >= 28) return { level: 'intermediate', label: '中级', description: '具备基本AI素养，部分维度需加强' };
  if (totalScore >= 18) return { level: 'beginner', label: '初级', description: '对AI有初步接触，整体素养有待培养' };
  return { level: 'developing', label: '待发展', description: 'AI素养基础薄弱，需从兴趣启蒙开始' };
}

// 角色判定
function getRoleResult(guideScore: number, visualScore: number, textScore: number) {
  const scores = [
    { role: 'guide', label: '🧭 引导者', score: guideScore },
    { role: 'visual', label: '📷 光影法师', score: visualScore },
    { role: 'text', label: '📜 秘语学者', score: textScore },
  ];

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const primary = sorted[0];
  const secondary = sorted[1];

  const gap = primary.score - secondary.score;
  let roleType: string;
  let roleTypeLabel: string;
  let secondaryRole: string | null = null;

  if (primary.score >= 6 && gap >= 3) {
    roleType = 'strong';
    roleTypeLabel = '强倾向，角色定位明确';
  } else if (gap <= 2) {
    roleType = 'dual';
    roleTypeLabel = '双倾向，可兼顾两个角色方向发展';
    secondaryRole = secondary.role;
  } else {
    roleType = 'balanced';
    roleTypeLabel = '综合型，均可尝试后再定向';
  }

  return {
    primaryRole: primary.role,
    primaryRoleLabel: primary.label,
    primaryScore: primary.score,
    roleType,
    roleTypeLabel,
    secondaryRole,
    allScores: scores,
  };
}

// 短板维度建议
function getWeakDimensionSuggestions(dimA: number, dimB: number, dimC: number, dimD: number) {
  const weakDimensions = [];
  const suggestions: Record<string, string> = {};

  if (dimA <= 6) {
    weakDimensions.push('A');
    suggestions.A = '从趣味体验入手（AI画画、AI聊天），先激发兴趣';
  }
  if (dimB <= 6) {
    weakDimensions.push('B');
    suggestions.B = '增加上机实操，从最简单的AI对话开始手把手带';
  }
  if (dimC <= 6) {
    weakDimensions.push('C');
    suggestions.C = '用"你当AI"游戏、动画视频讲AI原理';
  }
  if (dimD <= 6) {
    weakDimensions.push('D');
    suggestions.D = '用情境讨论："AI帮我写作业该不该交""AI造假照片对不对"';
  }

  return { weakDimensions, suggestions };
}

// GET: 获取所有小队的AI素养评估结果（管理员/志愿者/老师可用）
export async function GET(request: NextRequest) {
  // 允许 super_admin, admin, volunteer, teacher 访问
  const authAdmin = await requireAdminOrVolunteer(request);
  const authTeacher = await requireAdminOrTeacher(request);
  
  if (!authAdmin.authenticated && !authTeacher.authenticated) {
    return authError(authAdmin);
  }

  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const schoolId = searchParams.get('schoolId');
    const format = searchParams.get('format') || 'json'; // json 或 csv

    // 获取所有激活的量表题目
    const { data: questions } = await supabaseAdmin
      .from('pretest_questions')
      .select('id, dimension, part, order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (!questions || questions.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        summary: {
          totalStudents: 0,
          averageLiteracyScore: 0,
          roleDistribution: { guide: 0, visual: 0, text: 0 },
          levelDistribution: { advanced: 0, intermediate: 0, beginner: 0, developing: 0 },
        },
      });
    }

    // 获取所有回答
    let responsesQuery = supabaseAdmin
      .from('pretest_responses')
      .select('team_id, member_name, question_id, answer');

    if (teamId) {
      responsesQuery = responsesQuery.eq('team_id', teamId);
    }

    const { data: responses, error: responsesError } = await responsesQuery;

    if (responsesError) {
      console.error('获取回答失败:', responsesError);
      return ApiErrors.validation('获取回答失败');
    }

    if (!responses || responses.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        summary: {
          totalStudents: 0,
          averageLiteracyScore: 0,
          roleDistribution: { guide: 0, visual: 0, text: 0 },
          levelDistribution: { advanced: 0, intermediate: 0, beginner: 0, developing: 0 },
        },
      });
    }

    // 获取小队成员列表
    let teamMembersQuery = supabaseAdmin
      .from('team_members')
      .select('id, name, team_id')
      .eq('is_approved', true);

    if (teamId) {
      teamMembersQuery = teamMembersQuery.eq('team_id', teamId);
    }

    const { data: allTeamMembers } = await teamMembersQuery;

    // 如果指定了schoolId，过滤小队成员
    let filteredMembers = allTeamMembers || [];
    if (schoolId) {
      const { data: schoolTeams } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('school_id', schoolId);
      
      const schoolTeamIds = new Set((schoolTeams || []).map(t => t.id));
      filteredMembers = filteredMembers.filter(m => schoolTeamIds.has(m.team_id));
    }

    // 按小队+成员整理回答
    const memberResponses: Record<string, Record<string, Record<string, any>>> = {};
    responses.forEach(r => {
      if (!memberResponses[r.team_id]) {
        memberResponses[r.team_id] = {};
      }
      if (!memberResponses[r.team_id][r.member_name]) {
        memberResponses[r.team_id][r.member_name] = {};
      }
      memberResponses[r.team_id][r.member_name][r.question_id] = r.answer;
    });

    // 计算每个成员的评估结果
    const computedResults = filteredMembers.map(member => {
      const answers = memberResponses[member.team_id]?.[member.name] || {};

      // Part 1: 素养测评得分
      const dimScores: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
      let literacyTotal = 0;

      questions.filter(q => q.part === 'literacy').forEach(q => {
        const answer = answers[q.id];
        const score = typeof answer === 'string' ? parseInt(answer, 10) : (typeof answer === 'number' ? answer : 0);
        if (q.dimension && dimScores.hasOwnProperty(q.dimension)) {
          dimScores[q.dimension] += score;
          literacyTotal += score;
        }
      });

      // Part 2: 角色倾向得分
      const roleScores: Record<string, number> = { guide: 0, visual: 0, text: 0 };

      questions.filter(q => q.part === 'role').forEach(q => {
        const answer = answers[q.id];
        const score = typeof answer === 'string' ? parseInt(answer, 10) : (typeof answer === 'number' ? answer : 0);
        if (q.dimension && roleScores.hasOwnProperty(q.dimension)) {
          roleScores[q.dimension] += score;
        }
      });

      // 素养水平
      const literacyResult = getLiteracyLevel(literacyTotal);

      // 角色结果
      const roleResult = getRoleResult(roleScores.guide, roleScores.visual, roleScores.text);

      // 短板维度
      const weakResult = getWeakDimensionSuggestions(dimScores.A, dimScores.B, dimScores.C, dimScores.D);

      // 检查是否完成所有题目
      const answeredCount = Object.keys(answers).length;
      const isComplete = answeredCount >= questions.length;

      return {
        team_id: member.team_id,
        member_name: member.name,
        isComplete,
        dimension_a_score: dimScores.A,
        dimension_b_score: dimScores.B,
        dimension_c_score: dimScores.C,
        dimension_d_score: dimScores.D,
        literacy_total_score: literacyTotal,
        literacy_level: literacyResult.level,
        guide_score: roleScores.guide,
        visual_score: roleScores.visual,
        text_score: roleScores.text,
        primary_role: roleResult.primaryRole,
        role_type: roleResult.roleType,
        secondary_role: roleResult.secondaryRole,
        weak_dimensions: weakResult.weakDimensions.length > 0 ? weakResult.weakDimensions : null,
        suggestions: Object.keys(weakResult.suggestions).length > 0 ? weakResult.suggestions : null,
      };
    });

    // 只保留完成所有题目的成员结果
    const completedResults = computedResults.filter(r => r.isComplete);

    if (completedResults.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        summary: {
          totalStudents: 0,
          averageLiteracyScore: 0,
          roleDistribution: { guide: 0, visual: 0, text: 0 },
          levelDistribution: { advanced: 0, intermediate: 0, beginner: 0, developing: 0 },
        },
      });
    }

    // 获取小队信息
    const teamIds = [...new Set(completedResults.map(r => r.team_id))];
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name, code, school_id')
      .in('id', teamIds);

    const teamMap = new Map((teams || []).map(t => [t.id, t]));

    // 获取学校信息
    const schoolIds = [...new Set((teams || []).map(t => t.school_id).filter(Boolean))];
    const { data: schools } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);

    const schoolMap = new Map((schools || []).map(s => [s.id, s.name]));

    // 构建完整结果
    const enrichedResults = completedResults.map(r => {
      const team = teamMap.get(r.team_id);
      return {
        ...r,
        teamName: team?.name || '-',
        teamCode: team?.code || '-',
        schoolName: team?.school_id ? (schoolMap.get(team.school_id) || '-') : '-',
        literacyLevelLabel: literacyLevelLabels[r.literacy_level] || r.literacy_level,
        primaryRoleLabel: roleLabels[r.primary_role] || r.primary_role,
        roleTypeLabel: roleTypeLabels[r.role_type] || r.role_type,
        secondaryRoleLabel: r.secondary_role ? (roleLabels[r.secondary_role] || r.secondary_role) : null,
      };
    });

    // 统计汇总
    const totalStudents = enrichedResults.length;
    const averageLiteracyScore = totalStudents > 0
      ? Math.round(enrichedResults.reduce((sum, r) => sum + (r.literacy_total_score || 0), 0) / totalStudents * 10) / 10
      : 0;

    const roleDistribution = {
      guide: enrichedResults.filter(r => r.primary_role === 'guide').length,
      visual: enrichedResults.filter(r => r.primary_role === 'visual').length,
      text: enrichedResults.filter(r => r.primary_role === 'text').length,
    };

    const levelDistribution = {
      advanced: enrichedResults.filter(r => r.literacy_level === 'advanced').length,
      intermediate: enrichedResults.filter(r => r.literacy_level === 'intermediate').length,
      beginner: enrichedResults.filter(r => r.literacy_level === 'beginner').length,
      developing: enrichedResults.filter(r => r.literacy_level === 'developing').length,
    };

    // 按小队分组统计
    const teamStats = new Map<string, {
      teamName: string;
      teamCode: string;
      schoolName: string;
      memberCount: number;
      avgLiteracyScore: number;
      roleBreakdown: Record<string, number>;
      weakDimensions: Record<string, number>;
    }>();

    enrichedResults.forEach(r => {
      if (!teamStats.has(r.team_id)) {
        teamStats.set(r.team_id, {
          teamName: r.teamName,
          teamCode: r.teamCode,
          schoolName: r.schoolName,
          memberCount: 0,
          avgLiteracyScore: 0,
          roleBreakdown: { guide: 0, visual: 0, text: 0 },
          weakDimensions: { A: 0, B: 0, C: 0, D: 0 },
        });
      }
      const stat = teamStats.get(r.team_id)!;
      stat.memberCount++;
      stat.avgLiteracyScore += r.literacy_total_score || 0;
      if (r.primary_role && stat.roleBreakdown.hasOwnProperty(r.primary_role)) {
        stat.roleBreakdown[r.primary_role]++;
      }
      if (r.weak_dimensions && Array.isArray(r.weak_dimensions)) {
        r.weak_dimensions.forEach((dim: string) => {
          if (stat.weakDimensions.hasOwnProperty(dim)) {
            stat.weakDimensions[dim]++;
          }
        });
      }
    });

    // 计算小队平均分
    teamStats.forEach(stat => {
      stat.avgLiteracyScore = stat.memberCount > 0
        ? Math.round(stat.avgLiteracyScore / stat.memberCount * 10) / 10
        : 0;
    });

    // CSV导出
    if (format === 'csv') {
      const headers = [
        '学校', '小队', '小队代码', '成员姓名',
        '情感与态度', '使用与协作', '认知与理解', '伦理与责任', '素养总分', '素养水平',
        '引导者得分', '光影法师得分', '秘语学者得分', '倾向角色', '角色类型',
        '短板维度', '发展建议',
      ];

      const rows = enrichedResults.map(r => [
        r.schoolName,
        r.teamName,
        r.teamCode,
        r.member_name,
        r.dimension_a_score,
        r.dimension_b_score,
        r.dimension_c_score,
        r.dimension_d_score,
        r.literacy_total_score,
        r.literacyLevelLabel,
        r.guide_score,
        r.visual_score,
        r.text_score,
        r.primaryRoleLabel,
        r.roleTypeLabel,
        r.weak_dimensions ? r.weak_dimensions.map((d: string) => dimensionLabels[d] || d).join(';') : '',
        r.suggestions ? Object.entries(r.suggestions).map(([k, v]) => `${dimensionLabels[k] || k}: ${v}`).join(';') : '',
      ]);

      const csvContent = '\uFEFF' + [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=ai_literacy_results_${new Date().toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      results: enrichedResults,
      summary: {
        totalStudents,
        averageLiteracyScore,
        roleDistribution,
        levelDistribution,
      },
      teamStats: Object.fromEntries(teamStats),
    });
  } catch (error) {
    console.error('获取评估结果失败:', error);
    return safeError(error);
  }
}

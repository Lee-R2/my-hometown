import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

const supabaseAdmin = getSupabaseAdminClient();

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

  // 按得分排序
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const primary = sorted[0];
  const secondary = sorted[1];

  // 判定角色倾向类型
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

// 角色发展路径
const roleDevelopmentPaths: Record<string, { stage1: string; stage2: string; stage3: string }> = {
  guide: {
    stage1: '学会用AI拆解任务、做计划',
    stage2: '学会用AI协调分工、跟踪进度',
    stage3: '带领小组用AI完成完整项目',
  },
  visual: {
    stage1: '学会用AI生成图片、简单海报',
    stage2: '学会用AI辅助视频拍摄和剪辑',
    stage3: '独立完成影像创作项目（如纪录片、宣传短片）',
  },
  text: {
    stage1: '学会用AI辅助写作、整理笔记',
    stage2: '学会用AI写活动记录、采访稿',
    stage3: '独立完成文字创作项目（如报道、故事集）',
  },
};

// GET: 获取小队的AI素养评估结果
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取所有激活的量表题目
    const { data: questions } = await supabaseAdmin
      .from('pretest_questions')
      .select('id, dimension, part, order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (!questions || questions.length === 0) {
      return NextResponse.json({ success: true, results: [], hasData: false });
    }

    // 获取该小队所有成员的回答
    const { data: responses } = await supabaseAdmin
      .from('pretest_responses')
      .select('member_name, question_id, answer')
      .eq('team_id', teamId);

    // 获取小队成员列表
    const { data: teamMembers } = await supabaseAdmin
      .from('team_members')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_approved', true);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ success: true, results: [], hasData: false });
    }

    // 构建题目映射
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // 按成员整理回答
    const memberResponses: Record<string, Record<string, any>> = {};
    responses?.forEach(r => {
      if (!memberResponses[r.member_name]) {
        memberResponses[r.member_name] = {};
      }
      memberResponses[r.member_name][r.question_id] = r.answer;
    });

    // 计算每个成员的评估结果
    const results = teamMembers.map(member => {
      const answers = memberResponses[member.name] || {};

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

      // 素养水平
      const literacyResult = getLiteracyLevel(literacyTotal);

      // 短板维度
      const weakResult = getWeakDimensionSuggestions(dimScores.A, dimScores.B, dimScores.C, dimScores.D);

      // 检查是否完成所有题目
      const answeredCount = Object.keys(answers).length;
      const isComplete = answeredCount >= questions.length;

      return {
        memberId: member.id,
        memberName: member.name,
        isComplete,
        // Part 1
        dimensionScores: dimScores,
        literacyTotalScore: literacyTotal,
        literacyLevel: literacyResult.level,
        literacyLevelLabel: literacyResult.label,
        literacyLevelDescription: literacyResult.description,
        // 建议
        weakDimensions: weakResult.weakDimensions,
        weakDimensionSuggestions: weakResult.suggestions,
      };
    });

    return NextResponse.json({
      success: true,
      results,
      hasData: results.length > 0,
      teamId,
    });
  } catch (error) {
    console.error('获取评估结果失败:', error);
    return ApiErrors.validation('获取评估结果失败');
  }
}

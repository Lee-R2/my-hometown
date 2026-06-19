import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';
import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

// 角色配置
const ROLE_CONFIG: Record<string, string> = {
  guider: '指引者',
  light_mage: '光影法师',
  secret_scholar: '秘语学者',
};

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'rating' | 'file' | 'boolean';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  maxRating?: number;
}

interface FieldColumn {
  key: string; // 用于标识列的唯一key
  label: string; // Excel列标题
  isShared: boolean; // 是否是共同题目
  roles: string[]; // 涉及的角色列表
  fieldIds: Map<string, string>; // roleId -> fieldId 的映射
}

/**
 * 导出反馈数据为Excel
 * POST /api/admin/feedback/export
 */
export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { userId, userRole, schoolId, feedbackIds, formId, teamId } = body;

    if (!userId || !userRole) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 先获取小队ID列表（根据角色权限过滤）
    let teamIds: string[] = [];
    
    if (userRole === 'admin' || userRole === 'super_admin') {
      const { data: allTeams } = await client
        .from('teams')
        .select('id');
      teamIds = (allTeams || []).map((t: any) => t.id);
    } else if (userRole === 'teacher' && schoolId) {
      const { data: schoolTeams } = await client
        .from('teams')
        .select('id')
        .eq('school_id', schoolId);
      teamIds = (schoolTeams || []).map((t: any) => t.id);
    } else if (userRole === 'volunteer' && userId) {
      const { data: volunteerTeams } = await client
        .from('teams')
        .select('id')
        .eq('created_by', userId);
      teamIds = (volunteerTeams || []).map((t: any) => t.id);
    }

    if (teamIds.length === 0) {
      return ApiErrors.forbidden('无权限');
    }

    // 构建查询
    let query = client
      .from('final_task_submissions')
      .select(`
        id,
        team_id,
        task_id,
        member_id,
        member_role,
        form_id,
        form_data,
        submitted_at,
        cycle,
        final_task_forms (
          id,
          name,
          icon,
          team_role,
          form_config
        )
      `)
      .in('team_id', teamId ? [teamId] : teamIds)
      .order('submitted_at', { ascending: false });

    // 额外过滤条件
    if (feedbackIds && feedbackIds.length > 0) {
      query = query.in('id', feedbackIds);
    }
    if (formId) {
      query = query.eq('form_id', formId);
    }

    const { data: feedbacks, error } = await query;

    if (error) {
      console.error('获取反馈列表失败:', error);
      return ApiErrors.validation('获取失败');
    }

    if (!feedbacks || feedbacks.length === 0) {
      return ApiErrors.validation('没有可导出的数据');
    }

    // ========== 分析表单字段，构建智能列结构 ==========
    // 收集每个角色的表单字段配置
    const roleFieldsMap: Map<string, FormField[]> = new Map(); // roleId -> fields
    
    for (const feedback of feedbacks) {
      const formConfig = (feedback.final_task_forms as any)?.form_config || [];
      const teamRole = (feedback.final_task_forms as any)?.team_role || feedback.member_role;
      
      if (!roleFieldsMap.has(teamRole)) {
        roleFieldsMap.set(teamRole, formConfig);
      }
    }

    // 按 label 分组字段，识别共同题目和专属题目
    const labelToRoles: Map<string, Set<string>> = new Map(); // label -> roles
    const labelToFieldIds: Map<string, Map<string, string>> = new Map(); // label -> (roleId -> fieldId)
    
    for (const [roleId, fields] of roleFieldsMap) {
      for (const field of fields) {
        if (!labelToRoles.has(field.label)) {
          labelToRoles.set(field.label, new Set());
          labelToFieldIds.set(field.label, new Map());
        }
        labelToRoles.get(field.label)!.add(roleId);
        labelToFieldIds.get(field.label)!.set(roleId, field.id);
      }
    }

    // 构建列定义
    const fieldColumns: FieldColumn[] = [];
    
    // 按 label 排序（保持一致性）
    const sortedLabels = Array.from(labelToRoles.keys()).sort();
    
    for (const label of sortedLabels) {
      const roles = Array.from(labelToRoles.get(label)!);
      const fieldIds = labelToFieldIds.get(label)!;
      const isShared = roles.length > 1;
      
      if (isShared) {
        // 共同题目：多个角色共享，不添加角色前缀
        fieldColumns.push({
          key: `shared_${label}`,
          label: label,
          isShared: true,
          roles: roles,
          fieldIds: fieldIds,
        });
      } else {
        // 专属题目：只有一个角色有，添加角色前缀
        const role = roles[0];
        const roleLabel = ROLE_CONFIG[role] || role;
        fieldColumns.push({
          key: `exclusive_${role}_${label}`,
          label: `[${roleLabel}] ${label}`,
          isShared: false,
          roles: roles,
          fieldIds: fieldIds,
        });
      }
    }

    // ========== 获取上下文信息 ==========
    const enrichedData = await Promise.all(feedbacks.map(async (feedback: any) => {
      // 获取小队信息
      const { data: team } = await client
        .from('teams')
        .select('id, name, school_id, teacher_id, created_by')
        .eq('id', feedback.team_id)
        .single();

      let schoolName = '';
      let volunteerName = '';
      let teacherName = '';

      if (team?.school_id) {
        const { data: school } = await client
          .from('schools')
          .select('name')
          .eq('id', team.school_id)
          .single();
        schoolName = school?.name || '';
      }

      if (team?.created_by) {
        const { data: volunteer } = await client
          .from('users')
          .select('name')
          .eq('id', team.created_by)
          .single();
        volunteerName = volunteer?.name || '';
      }

      if (team?.teacher_id) {
        const { data: teacher } = await client
          .from('users')
          .select('name')
          .eq('id', team.teacher_id)
          .single();
        teacherName = teacher?.name || '';
      }

      const { data: member } = await client
        .from('team_members')
        .select('name')
        .eq('id', feedback.member_id)
        .single();

      return {
        ...feedback,
        teamData: team,
        schoolName,
        volunteerName,
        teacherName,
        memberName: member?.name || '',
      };
    }));

    // ========== 构建Excel数据 ==========
    const baseHeaders = [
      '小队名称',
      '所属学校',
      '对接志愿者',
      '助学老师',
      '成员姓名',
      '成员角色',
      '提交时间',
    ];

    // 添加表单字段列标题
    const fieldHeaders = fieldColumns.map(col => col.label);
    const headers = [...baseHeaders, ...fieldHeaders];

    // 构建数据行
    const rows = enrichedData.map((feedback: any) => {
      const baseData = [
        feedback.teamData?.name || '',
        feedback.schoolName,
        feedback.volunteerName,
        feedback.teacherName,
        feedback.memberName,
        ROLE_CONFIG[feedback.member_role] || feedback.member_role,
        feedback.submitted_at ? new Date(feedback.submitted_at).toLocaleString('zh-CN') : '',
      ];

      const formData = feedback.form_data || {};
      const memberRole = feedback.member_role;

      // 根据列定义获取对应的数据
      const fieldData = fieldColumns.map(col => {
        // 如果该成员的角色不在此列涉及的角色列表中，返回空
        if (!col.roles.includes(memberRole)) {
          return '';
        }
        
        // 获取该角色对应的字段ID
        const fieldId = col.fieldIds.get(memberRole);
        if (!fieldId) {
          return '';
        }
        
        const value = formData[fieldId];
        if (Array.isArray(value)) {
          return value.join('、');
        }
        return value ?? '';
      });

      return [...baseData, ...fieldData];
    });

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // 设置列宽
    const colWidths = [
      { wch: 15 }, // 小队名称
      { wch: 20 }, // 所属学校
      { wch: 12 }, // 对接志愿者
      { wch: 12 }, // 助学老师
      { wch: 10 }, // 成员姓名
      { wch: 10 }, // 成员角色
      { wch: 20 }, // 提交时间
      ...fieldHeaders.map(h => ({ wch: Math.max(20, h.length + 2) })), // 动态字段
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, '反馈数据');

    // 生成Excel文件
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    // 返回文件
    const fileName = `反馈数据_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('导出反馈数据错误:', error);
    return ApiErrors.validation('导出反馈数据失败');
  }
}

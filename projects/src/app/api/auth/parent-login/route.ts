import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { safeError } from '@/lib/api-auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 家长登录
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  // 频率限制：防止暴力破解
  const rateLimitResult = await checkRateLimit(ip, 'login');
  if (!rateLimitResult.allowed) {
    return ApiErrors.rateLimited(rateLimitResult.message || '登录尝试过于频繁，请15分钟后再试');
  }

  try {
    const body = await request.json();
    const { phone, password } = body;

    if (!phone || !password) {
      return ApiErrors.validation('请输入手机号和密码');
    }

    // 查找家长账号
    const { data: parent, error } = await supabase
      .from('parents')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error || !parent) {
      if (error) return ApiErrors.validation('查询家长账号失败');
      return ApiErrors.unauthorized('账号不存在');
    }

    // 检查账号状态
    if (parent.status === 'pending') {
      return NextResponse.json(
        { success: false, error: '账号待审核，请等待学校老师审核通过后登录', status: 'pending' },
        { status: 403 }
      );
    }

    if (parent.status === 'rejected') {
      // 被拒绝的账号，返回拒绝原因，允许用户修改后重新提交
      return NextResponse.json(
        { 
          success: false, 
          error: '账号审核未通过，请根据拒绝原因修改信息后重新提交', 
          status: 'rejected',
          rejectedReason: parent.review_remark || '未说明原因',
          parent: {
            id: parent.id,
            phone: parent.phone,
            name: parent.name,
            school_id: parent.school_id,
            school_name: parent.school_name,
            relation: parent.relation,
            child_name: parent.child_name,
            child_grade: parent.child_grade
          }
        },
        { status: 403 }
      );
    }

    if (parent.is_active === false) {
      return ApiErrors.forbidden('账号已被禁用，请联系管理员');
    }

    // 验证密码（安全修复：移除明文比对，仅使用哈希验证）
    const isValidPassword = parent.password && await verifyPassword(password, parent.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: '密码错误' },
        { status: 401 }
      );
    }

    // 获取关注的小队列表（包含历史记录）
    const { data: follows } = await supabase
      .from('parent_team_follows')
      .select(`
        id,
        child_name,
        child_grade,
        is_active,
        followed_at,
        unfollowed_at,
        team:teams(
          id, 
          name, 
          slogan, 
          points, 
          cycle,
          current_theme_id
        )
      `)
      .eq('parent_id', parent.id)
      .order('followed_at', { ascending: false });

    return NextResponse.json({
      success: true,
      parent: {
        id: parent.id,
        phone: parent.phone,
        name: parent.name,
        school_id: parent.school_id,
        school_name: parent.school_name
      },
      follows: follows || []
    });

  } catch (error: any) {
    console.error('[家长登录] 错误:', error);
    return ApiErrors.validation('家长登录失败');
  }
}

// 注册家长账号
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, password, name, school_id, school_name, relation, child_name, child_grade } = body;

    // 简化注册：只需手机号、密码、姓名
    if (!phone) {
      return ApiErrors.validation('请填写手机号');
    }

    if (!password) {
      return ApiErrors.validation('请填写密码');
    }

    if (!name) {
      return ApiErrors.validation('请填写真实姓名');
    }

    if (password.length < 6) {
      return ApiErrors.validation('密码至少需要6位');
    }

    // 检查手机号是否已注册
    const { data: existing } = await supabase
      .from('parents')
      .select('id, status')
      .eq('phone', phone)
      .single();

    if (existing) {
      if (existing.status === 'rejected') {
        // 被拒绝的账号，允许修改信息后重新提交
        const { data: updated, error: updateError } = await supabase
          .from('parents')
          .update({
            name,
            password,
            school_id: school_id || null,
            school_name: school_name || null,
            relation: relation || null,
            child_name: child_name || null,
            child_grade: child_grade || null,
            status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
            review_remark: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error('[重新提交审核] 更新失败:', updateError);
          return ApiErrors.validation('重新提交失败，请稍后重试');
        }

        // 重新向学校老师发送消息通知
        if (school_id) {
          const { data: teachers } = await supabase
            .from('users')
            .select('id, name')
            .eq('school_id', school_id)
            .eq('role', 'teacher')
            .eq('is_active', true);

          if (teachers && teachers.length > 0) {
            const messages = teachers.map(teacher => ({
              type: 'parent_register',
              title: '家长重新提交注册申请',
              content: `家长「${name}」重新提交了注册申请，请及时审核。`,
              target_type: 'user',
              target_id: teacher.id,
              related_team_id: null,
              related_theme_id: null,
              is_read: false,
              created_at: new Date().toISOString()
            }));

            await supabase.from('notifications').insert(messages);
          }
        }

        return NextResponse.json({
          success: true,
          message: '已重新提交审核，请等待老师审核',
          pending: true
        });
      }
      return ApiErrors.conflict('该手机号已注册，请直接登录');
    }

    // 创建新账号，直接通过审核
    // 安全修复：密码哈希后存储
    const hashedPassword = hashPassword(password);
    const { data: newParent, error } = await supabase
      .from('parents')
      .insert({
        phone,
        password: hashedPassword,
        name,
        school_id: school_id || null,
        school_name: school_name || null,
        relation: relation || null,
        is_active: true,
        status: 'approved'  // 直接通过，无需审核
      })
      .select()
      .single();

    if (error) {
      console.error('[家长注册] 创建失败:', error);
      // 根据不同的错误类型返回更详细的提示
      let errorMessage = '注册失败，请稍后重试';
      
      if (error.code === '23505') {
        errorMessage = '该手机号已注册，请直接登录';
      } else if (error.code === '23503') {
        errorMessage = '关联数据不存在，请检查学校信息';
      }
      
      return ApiErrors.validation('操作失败');
    }

    // 直接返回成功登录信息
    return NextResponse.json({
      success: true,
      parent: {
        id: newParent.id,
        phone: newParent.phone,
        name: newParent.name,
        school_id: newParent.school_id,
        school_name: newParent.school_name
      },
      follows: []
    });
  } catch (error: any) {
    console.error('[家长注册] 错误:', error);
    return ApiErrors.validation('家长注册失败');
  }
}

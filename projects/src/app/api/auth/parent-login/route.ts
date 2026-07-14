import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPasswordAsync, verifyPasswordAsync, needsRehash, maskPhone } from '@/lib/security';
import { safeError } from '@/lib/api-auth';
import { checkRateLimit, logRequest, getClientIP } from '@/lib/rate-limit';
import { createSession, setSessionCookie } from '@/lib/session';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 家长登录
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';
  const startTime = Date.now();

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
            phone: maskPhone(parent.phone),
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

    // 验证密码（异步 bcrypt.compare，不阻塞事件循环）
    const isValidPassword = parent.password && await verifyPasswordAsync(password, parent.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: '密码错误' },
        { status: 401 }
      );
    }

    // 密码哈希为旧 SHA-256 算法时，登录成功后自动升级为 bcrypt（fire-and-forget）
    if (needsRehash(parent.password)) {
      hashPasswordAsync(password).then((newHash) => {
        supabase
          .from('parents')
          .update({ password: newHash, updated_at: new Date().toISOString() })
          .eq('id', parent.id)
          .then(undefined, () => {});
      }, () => {});
    }

    // 创建会话（关键路径，需 await）
    const session = await createSession(parent.id, 'parent', parent.school_id, ip, userAgent);

    // 非关键操作 fire-and-forget：写日志
    logRequest(ip, 'POST', '/api/auth/parent-login', userAgent, parent.id, 200, Date.now() - startTime)
      .then(undefined, () => {});

    // 关注的小队列表由 dashboard 自行 fetch（/api/parent/teams），登录时不 JOIN

    const response = NextResponse.json({
      success: true,
      parent: {
        id: parent.id,
        phone: maskPhone(parent.phone),
        name: parent.name,
        school_id: parent.school_id,
        school_name: parent.school_name
      },
      csrfToken: session.csrfToken,
    });

    // 设置会话 Cookie
    setSessionCookie(session.token, response);

    // 安全响应头
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;

  } catch (error: any) {
    console.error('[家长登录] 错误:', error);
    return safeError(error);
  }
}

// 注册家长账号
export async function PUT(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';

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
        const hashedPassword = await hashPasswordAsync(password);
        const { data: updated, error: updateError } = await supabase
          .from('parents')
          .update({
            name,
            password: hashedPassword,
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
    const hashedPassword = await hashPasswordAsync(password);
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
      return ApiErrors.validation('操作失败');
    }

    // 注册成功后自动登录：创建会话 + 设置 Cookie
    const session = await createSession(newParent.id, 'parent', newParent.school_id, ip, userAgent);

    const response = NextResponse.json({
      success: true,
      parent: {
        id: newParent.id,
        phone: maskPhone(newParent.phone),
        name: newParent.name,
        school_id: newParent.school_id,
        school_name: newParent.school_name
      },
      csrfToken: session.csrfToken,
    });

    setSessionCookie(session.token, response);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error: any) {
    console.error('[家长注册] 错误:', error);
    return safeError(error);
  }
}

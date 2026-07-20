import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const receiverId = searchParams.get('receiverId');
    const action = searchParams.get('action');

    // 如果请求的是可发送的接收对象列表
    if (action === 'sendable-recipients' || action === 'sendable-teams') {
      // LE-A13: 强制使用认证身份,防止客户端伪造 userRole 获取全量数据
      const userId = auth.payload!.userId;
      const userRole = auth.payload!.role;
      const schoolId = searchParams.get('schoolId');

      if (!userId || !userRole) {
        return ApiErrors.validation('缺少用户信息');
      }

      // 超级管理员可以获取所有类型的接收对象
      if (userRole === 'admin' || userRole === 'super_admin') {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const semester = month >= 1 && month <= 6 ? 1 : 2;
        const prefix = `${year}${semester}`;
        
        // 获取当前学期的小队
        const { data: allTeams, error: teamsError } = await client
          .from('teams')
          .select('id, code, name, school_id')
          .like('code', `${prefix}%`)
          .order('created_at', { ascending: false });
        
        if (teamsError) {
          return supabaseErrorResponse(teamsError, '获取小队列表失败');
        }

        // 获取所有志愿者（有指导小队的）
        const { data: volunteers, error: volunteersError } = await client
          .from('users')
          .select('id, name, school_id')
          .eq('role', 'volunteer')
          .order('name', { ascending: true });
        
        if (volunteersError) {
          return supabaseErrorResponse(volunteersError, '获取志愿者列表失败');
        }

        // 获取所有助学老师
        const { data: teachers, error: teachersError } = await client
          .from('users')
          .select('id, name, school_id')
          .eq('role', 'teacher')
          .order('name', { ascending: true });
        
        if (teachersError) {
          return supabaseErrorResponse(teachersError, '获取老师列表失败');
        }

        // 获取学校名称映射
        const allSchoolIds = new Set<string>();
        (allTeams || []).forEach(t => { if (t.school_id) allSchoolIds.add(t.school_id); });
        (volunteers || []).forEach(v => { if (v.school_id) allSchoolIds.add(v.school_id); });
        (teachers || []).forEach(t => { if (t.school_id) allSchoolIds.add(t.school_id); });

        let schoolsMap: Record<string, string> = {};
        let schoolsList: { id: string; name: string }[] = [];
        if (allSchoolIds.size > 0) {
          const { data: schools } = await client
            .from('schools')
            .select('id, name')
            .in('id', Array.from(allSchoolIds))
            .order('name', { ascending: true });
          (schools || []).forEach(s => {
            schoolsMap[s.id] = s.name;
          });
          schoolsList = schools || [];
        }

        return NextResponse.json({
          teams: (allTeams || []).map(t => ({
            ...t,
            schoolName: t.school_id ? schoolsMap[t.school_id] || '' : '',
          })),
          volunteers: (volunteers || []).map(v => ({
            id: v.id,
            name: v.name || '未设置姓名',
            school_id: v.school_id,
            schoolName: v.school_id ? schoolsMap[v.school_id] || '' : '',
          })),
          teachers: (teachers || []).map(t => ({
            id: t.id,
            name: t.name || '未设置姓名',
            school_id: t.school_id,
            schoolName: t.school_id ? schoolsMap[t.school_id] || '' : '',
          })),
          schools: schoolsList,
        });
      }

      // 志愿者：只能获取自己指导的小队
      if (userRole === 'volunteer') {
        const { data: volunteerTeams, error } = await client
          .from('teams')
          .select('id, code, name, school_id')
          .or(`created_by.eq.${userId},assigned_volunteer_id.eq.${userId}`)
          .order('created_at', { ascending: false });
        
        if (error) {
          return supabaseErrorResponse(error, '获取小队列表失败');
        }

        // 获取学校名称
        const schoolIds = [...new Set((volunteerTeams || []).map(t => t.school_id).filter(Boolean))];
        let schoolsMap: Record<string, string> = {};
        if (schoolIds.length > 0) {
          const { data: schools } = await client
            .from('schools')
            .select('id, name')
            .in('id', schoolIds);
          (schools || []).forEach(s => {
            schoolsMap[s.id] = s.name;
          });
        }

        return NextResponse.json({
          teams: (volunteerTeams || []).map(t => ({
            ...t,
            schoolName: t.school_id ? schoolsMap[t.school_id] || '' : '',
          })),
          volunteers: [],
          teachers: [],
          schools: [],
        });
      }

      // 助学老师：只能获取本校的小队
      if (userRole === 'teacher' && schoolId) {
        const { data: schoolTeams, error } = await client
          .from('teams')
          .select('id, code, name, school_id')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false });
        
        if (error) {
          return supabaseErrorResponse(error, '获取小队列表失败');
        }

        // 获取学校名称
        let schoolName = '';
        const { data: school } = await client
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .single();
        if (school) {
          schoolName = school.name;
        }

        return NextResponse.json({
          teams: (schoolTeams || []).map(t => ({
            ...t,
            schoolName: schoolName,
          })),
          volunteers: [],
          teachers: [],
          schools: [],
        });
      }

      return NextResponse.json({ teams: [], volunteers: [], teachers: [], schools: [] });
    }

    // 原有的获取消息列表逻辑
    // LE-A13: 强制使用认证身份,防止横向越权读取他人消息
    const authUserId = auth.payload!.userId;
    const authRole = auth.payload!.role;
    // 小队身份只能查自己小队的消息;管理类角色可代查指定小队
    const effectiveTeamId = authRole === 'team' ? authUserId : teamId;
    // receiverId 强制为认证身份(管理员查小队消息时不需要 receiverId)
    const effectiveReceiverId = receiverId || (authRole !== 'team' && teamId ? undefined : authUserId);

    let query = client
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (effectiveTeamId) {
      query = query.eq('team_id', effectiveTeamId);
    }

    if (effectiveReceiverId) {
      query = query.eq('receiver_id', effectiveReceiverId);
    }

    const { data: messages, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取消息列表失败');
    }

    // 如果是按receiverId查询，获取发送者信息
    let sendersMap: Record<string, { name: string; role: string }> = {};
    if (receiverId && messages && messages.length > 0) {
      const senderIds = [...new Set(messages.map(m => m.sender_id).filter(Boolean))];
      if (senderIds.length > 0) {
        const { data: senders } = await client
          .from('users')
          .select('id, name, role')
          .in('id', senderIds);
        (senders || []).forEach(s => {
          sendersMap[s.id] = { name: s.name || '未知', role: s.role || 'team' };
        });
      }
    }

    // 获取未读数量
    let unreadCount = 0;
    if (receiverId) {
      const { count } = await client
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', receiverId)
        .eq('is_read', false);
      unreadCount = count || 0;
    }

    // 为消息添加发送者信息
    const messagesWithSender = (messages || []).map(m => ({
      ...m,
      sender_name: m.sender_id ? sendersMap[m.sender_id]?.name || '未知' : undefined,
      sender_role: m.sender_id ? sendersMap[m.sender_id]?.role : undefined,
    }));

    return NextResponse.json({ 
      messages: messagesWithSender, 
      unreadCount,
    });
  } catch (error) {
    console.error('获取消息列表错误:', error);
    return ApiErrors.validation('获取消息列表失败');
  }
}

// 发送消息（支持批量发送、多媒体内容和按角色发送）
export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const {
      targetIds,    // 目标ID数组
      targetType,   // 目标类型: team, volunteer, teacher
      teamIds,      // 小队ID数组（向后兼容）
      teamId,       // 单个小队ID（向后兼容）
      content,
      type = 'notification',
      contentType = 'text',  // text, image, video, link
      mediaUrl,     // 图片/视频URL
      sendAsWuyingDoctor, // 是否以雾影博士身份发送
    } = body;

    // 发送者身份从认证令牌获取，防止客户端伪造 senderId/senderRole 绕过权限校验
    const senderId = auth.payload!.userId;
    const senderRole = auth.payload!.role;

    // 确定目标ID和类型
    const finalTargetIds = targetIds || teamIds || (teamId ? [teamId] : []);
    const finalTargetType = targetType || 'team';

    // 权限校验（身份从令牌获取，不信任客户端传入）
    if (senderRole === 'volunteer') {
      // 志愿者只能向自己指导的小队发送消息
      if (finalTargetType === 'team' && finalTargetIds.length > 0) {
        const { data: allowedTeams } = await client
          .from('teams')
          .select('id')
          .or(`created_by.eq.${senderId},assigned_volunteer_id.eq.${senderId}`)
          .in('id', finalTargetIds);

        const allowedIds = (allowedTeams || []).map(t => t.id);
        const unauthorizedIds = finalTargetIds.filter((id: string) => !allowedIds.includes(id));

        if (unauthorizedIds.length > 0) {
          return ApiErrors.forbidden('您只能向自己指导的小队发送消息');
        }
      } else if (finalTargetType !== 'team') {
        return ApiErrors.forbidden('志愿者只能向小队发送消息');
      }
    } else if (senderRole === 'teacher') {
      // 助学老师只能向本校小队发送消息
      const { data: teacher } = await client
        .from('users')
        .select('school_id')
        .eq('id', senderId)
        .single();

      if (teacher?.school_id && finalTargetType === 'team' && finalTargetIds.length > 0) {
        const { data: allowedTeams } = await client
          .from('teams')
          .select('id')
          .eq('school_id', teacher.school_id)
          .in('id', finalTargetIds);

        const allowedIds = (allowedTeams || []).map(t => t.id);
        const unauthorizedIds = finalTargetIds.filter((id: string) => !allowedIds.includes(id));

        if (unauthorizedIds.length > 0) {
          return ApiErrors.forbidden('您只能向本校小队发送消息');
        }
      } else if (finalTargetType !== 'team') {
        return ApiErrors.forbidden('助学老师只能向小队发送消息');
      }
    }

    if (finalTargetIds.length === 0) {
      return ApiErrors.validation('请选择接收对象');
    }

    // 安全修复（P3 输入校验）：限制消息内容长度，避免超长输入
    const MAX_MESSAGE_CONTENT_LENGTH = 2000;
    if (typeof content === 'string' && content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      return ApiErrors.validation(`消息内容过长，最大支持 ${MAX_MESSAGE_CONTENT_LENGTH} 字符`);
    }

    // 根据目标类型构建消息数据
    let messagesToInsert: any[] = [];

    // 获取发送者信息
    let senderInfo: { name: string; role: string } | null = null;
    if (senderId) {
      const { data: sender } = await client
        .from('users')
        .select('name, role')
        .eq('id', senderId)
        .single();
      if (sender) {
        senderInfo = { name: sender.name || '未知', role: sender.role || 'unknown' };
      }
    }

    if (finalTargetType === 'team') {
      // 发送给小队
      messagesToInsert = finalTargetIds.map((tid: string) => ({
        sender_id: senderId,
        team_id: tid,
        content: content,
        type: type,
        content_type: contentType,
        media_url: mediaUrl,
      }));

      // 同时为每个小队创建team_notification，确保小队端可以看到消息
      if (messagesToInsert.length > 0) {
        // 判断是否以雾影博士身份发送：助学老师默认以雾影博士身份，志愿者可选择
        const useWuyingDoctor = senderInfo?.role === 'teacher' || (senderInfo?.role === 'volunteer' && sendAsWuyingDoctor);
        const senderDisplayName = useWuyingDoctor ? '雾影博士' : (senderInfo?.name || undefined);
        const notificationTitle = useWuyingDoctor
          ? '雾影博士发来消息'
          : senderInfo?.role === 'volunteer'
            ? '志愿者老师发来消息'
            : '来自管理员的消息';
        
        const notificationsToInsert = finalTargetIds.map((tid: string) => ({
          team_id: tid,
          type: 'volunteer_message',
          title: notificationTitle,
          content: content,
          sender_id: senderId,
          sender_name: senderDisplayName,
          extra_data: {
            content_type: contentType,
            media_url: mediaUrl || undefined,
            sender_role: senderInfo?.role || undefined,
            is_wuying_doctor: useWuyingDoctor || undefined,
          },
        }));

        // 插入team_notifications
        const { error: notifError } = await client
          .from('team_notifications')
          .insert(notificationsToInsert);

        if (notifError) {
          console.error('创建小队通知失败:', notifError);
          // 不阻断消息发送，仅记录错误
        }
      }
    } else if (finalTargetType === 'volunteer' || finalTargetType === 'teacher') {
      // 发送给个人（志愿者或老师）
      messagesToInsert = finalTargetIds.map((rid: string) => ({
        sender_id: senderId,
        receiver_id: rid,
        content: content,
        type: type,
        content_type: contentType,
        media_url: mediaUrl,
      }));
    }

    const { data: messages, error } = await client
      .from('messages')
      .insert(messagesToInsert)
      .select();

    if (error) {
      console.error('发送消息失败:', error);
      return supabaseErrorResponse(error, '发送消息失败');
    }

    return NextResponse.json({ 
      success: true, 
      count: messages?.length || 0,
      messages 
    });
  } catch (error) {
    console.error('发送消息错误:', error);
    return ApiErrors.validation('发送消息失败');
  }
}

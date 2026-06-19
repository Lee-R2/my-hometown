import { requireAdminOrVolunteer, authError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 更新任务工具的必选/可选状态
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id, toolId } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const updateData: Record<string, any> = {};
    if (body.isRequired !== undefined) updateData.is_required = body.isRequired;

    const { data: taskTool, error } = await client
      .from('task_tools')
      .update(updateData)
      .eq('task_id', id)
      .eq('tool_id', toolId)
      .select(`
        id,
        is_required,
        tools (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新失败');
    }

    return NextResponse.json({ success: true, taskTool });
  } catch (error) {
    console.error('更新任务工具错误:', error);
    return ApiErrors.validation('更新失败');
  }
}

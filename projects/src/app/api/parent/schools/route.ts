import { requireParent, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// 搜索学校
export async function GET(request: NextRequest) {
  try {
    const auth = requireParent(request);
    if (!auth.authenticated) return authError(auth);

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    if (!keyword || keyword.length < 1) {
      return NextResponse.json({
        success: true,
        schools: []
      });
    }

    // 直接查询学校
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, county')
      .ilike('name', `%${keyword}%`)
      .limit(20);
    
    if (error) {
      console.error('[搜索学校] 查询失败:', error);
      return NextResponse.json({
        success: true,
        schools: []
      });
    }

    // 格式化返回
    const schools = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      district: s.county || ''
    }));

    return NextResponse.json({
      success: true,
      schools
    });

  } catch (error: any) {
    console.error('[搜索学校] 错误:', error);
    return NextResponse.json({
      success: true,
      schools: []
    });
  }
}

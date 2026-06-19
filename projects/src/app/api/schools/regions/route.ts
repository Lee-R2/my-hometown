import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取省市区列表（用于筛选下拉框
 * 返回有学校的省市区层级数
 */
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    
    const province = searchParams.get('province');
    const city = searchParams.get('city');

    // 如果指定了省份和城市，返回该城市下的区县列表
    if (province && city) {
      const { data, error } = await client
        .from('schools')
        .select('county')
        .eq('province', province)
        .eq('city', city)
        .not('county', 'is', null);

      if (error) {
        return ApiErrors.validation('获取区县列表失败');
      }

      const counties = [...new Set(data.map(s => s.county).filter(Boolean))];
      return NextResponse.json({ counties });
    }

    // 如果只指定了省份，返回该省份下的城市列表
    if (province) {
      const { data, error } = await client
        .from('schools')
        .select('city')
        .eq('province', province)
        .not('city', 'is', null);

      if (error) {
        return ApiErrors.validation('获取城市列表失败');
      }

      const cities = [...new Set(data.map(s => s.city).filter(Boolean))];
      return NextResponse.json({ cities });
    }

    // 返回所有省份列
      const { data, error } = await client
      .from('schools')
      .select('province')
      .not('province', 'is', null);

    if (error) {
      return ApiErrors.validation('获取省份列表失败');
    }

    const provinces = [...new Set(data.map(s => s.province).filter(Boolean))];
    return NextResponse.json({ provinces });
  } catch (error) {
    console.error('获取地区列表错误:', error);
    return ApiErrors.validation('获取地区列表失败');
  }
}

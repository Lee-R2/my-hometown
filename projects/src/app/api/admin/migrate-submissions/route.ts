import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError } from '@/lib/api-auth';

/**
 * 临时迁移 API：为 final_task_submissions 表添加缺失列
 * POST /api/admin/migrate-submissions
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  const client = getSupabaseClient();
  const results: string[] = [];

  // 通过 Supabase 的 RPC 功能执行 SQL
  // 由于无法直接执行 DDL，我们改用另一种方式：
  // 直接尝试插入带新列的数据，如果失败则说明列不存在

  // 方法：使用 Supabase 的 sql function (如果存在)
  // 否则，我们需要告知用户手动执行

  // 尝试使用 raw SQL 执行
  const sqlStatements = [
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS task_id VARCHAR(36)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_id VARCHAR(36)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_role VARCHAR(20)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS form_data JSONB",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
  ];

  for (const sql of sqlStatements) {
    try {
      // 尝试通过 rpc 执行
      const { error } = await client.rpc('exec_sql', { sql_string: sql });
      if (error) {
        results.push(`❌ ${sql.substring(0, 50)}... -> ${error.message}`);
      } else {
        results.push(`✅ ${sql.substring(0, 50)}...`);
      }
    } catch (e: any) {
      results.push(`❌ ${sql.substring(0, 50)}... -> ${e.message}`);
    }
  }

  // 验证
  const testData = {
    team_id: '00000000-0000-0000-0000-000000000002',
    task_id: 'verify-test',
    member_id: 'verify-member',
    member_role: 'guider',
    form_id: '00000000-0000-0000-0000-000000000000',
    form_data: { verify: true },
    cycle: 1,
  };

  const { data: insertData, error: insertError } = await client
    .from('final_task_submissions')
    .insert(testData)
    .select()
    .single();

  if (insertError) {
    results.push(`\n验证失败: ${insertError.message}`);
  } else {
    results.push(`\n✅ 验证成功！新列已添加`);
    // 清理
    await client.from('final_task_submissions').delete().eq('id', insertData.id);
    results.push('✅ 测试数据已清理');
  }

  // 尝试添加唯一约束
  try {
    const { error: idxError } = await client.rpc('exec_sql', {
      sql_string: "CREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique ON final_task_submissions(team_id, task_id, member_id, cycle)"
    });
    if (idxError) {
      results.push(`\n唯一约束: 需要手动添加`);
    } else {
      results.push(`\n✅ 唯一约束已添加`);
    }
  } catch {
    results.push(`\n唯一约束: 需要手动添加`);
  }

  return NextResponse.json({
    success: !insertError,
    results,
    message: insertError 
      ? '部分迁移失败，请手动在 Supabase Dashboard 执行 SQL'
      : '迁移成功',
    sqlToRunManually: sqlStatements.join(';\n') + ';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique ON final_task_submissions(team_id, task_id, member_id, cycle);',
  });
}

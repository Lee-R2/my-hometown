import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, authError } from '@/lib/api-auth';
import { loadEnv } from '@/storage/database/supabase-client';

loadEnv();

// 运行AI素养量表数据库迁移
// 需要管理员权限，且需要DATABASE_URL环境变量
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    return NextResponse.json({
      success: false,
      error: '缺少DATABASE_URL环境变量，无法执行迁移',
      hint: '请在.env.local中添加DATABASE_URL，格式: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
    }, { status: 400 });
  }

  try {
    // 动态导入pg
    const { Client } = await import('pg');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const sqlPath = join(process.cwd(), 'supabase', 'migrations', '006_add_ai_literacy_assessment.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    
    // 验证迁移结果
    const { rows: questionColumns } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pretest_questions' ORDER BY ordinal_position"
    );
    const { rows: resultColumns } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pretest_assessment_results' ORDER BY ordinal_position"
    );

    await client.end();

    return NextResponse.json({
      success: true,
      message: '迁移执行成功',
      pretest_questions_columns: questionColumns.map(r => r.column_name),
      pretest_assessment_results_columns: resultColumns.map(r => r.column_name),
    });
  } catch (error: any) {
    console.error('迁移执行失败:', error);
    // 安全修复：生产环境不返回 error.message，避免泄露数据库结构/文件路径
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json({
      success: false,
      error: isDev ? `迁移执行失败: ${error.message}` : '迁移执行失败，请查看服务器日志',
    }, { status: 500 });
  }
}

import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 执行数据库迁移 - 创建工具相关表
 * 仅在开发环境或管理员权限下可调用
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();

    // 创建 school_tools 表
    const createSchoolToolsSQL = `
      CREATE TABLE IF NOT EXISTS school_tools (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id VARCHAR(36) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        tool_id VARCHAR(36) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        stock INTEGER DEFAULT 0,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(school_id, tool_id)
      );
    `;

    // 创建 team_tools 表
    const createTeamToolsSQL = `
      CREATE TABLE IF NOT EXISTS team_tools (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tool_id VARCHAR(36) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(team_id, task_id, tool_id)
      );
    `;

    // 创建索引
    const createIndexesSQL = `
      CREATE INDEX IF NOT EXISTS idx_school_tools_school_id ON school_tools(school_id);
      CREATE INDEX IF NOT EXISTS idx_team_tools_team_id ON team_tools(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_tools_task_id ON team_tools(task_id);
    `;

    // 执行SQL（使用rpc执行原生SQL）
    // 注意：Supabase客户端不直接支持执行DDL，需要通过rpc或其他方式
    // 检查表是否已存在
    const { data: existingTables, error: checkError } = await client
      .from('school_tools')
      .select('id')
      .limit(1);

    if (!checkError) {
      return NextResponse.json({ 
        success: true, 
        message: '表已存在，无需迁移' 
      });
    }

    // 如果表不存在，返回提示让用户手动执行迁移
    return NextResponse.json({ 
      success: false, 
      message: '请手动执行数据库迁移SQL',
      sql: `
${createSchoolToolsSQL}
${createTeamToolsSQL}
${createIndexesSQL}
      `
    }, { status: 500 });

  } catch (error) {
    console.error('迁移错误:', error);
    return ApiErrors.validation('迁移失败');
  }
}

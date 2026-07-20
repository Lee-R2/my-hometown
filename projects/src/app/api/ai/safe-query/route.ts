/**
 * 安全 SQL 查询 API
 * 只允许 SELECT 查询，禁止所有 DDL/DML 操作
 * 强制行级权限控制 — 只能查询当前用户权限范围内的数据
 *
 * POST /api/ai/safe-query
 * Body: { sql: string, dataScope: DataScope }
 */

import { requireAnyAuth, authError } from '@/lib/api-auth';
import { NextRequest } from 'next/server';
import { validateSqlSafety, enforceDataScope } from '@/lib/skills/smart-data-analyzer';
import type { DataScope } from '@/lib/skills/smart-data-analyzer';
import { execSqlSafe } from '@/lib/skills/smart-data-analyzer/sql-executor';
import { ApiErrors, catchErrorResponse } from '@/lib/api-error';

interface SafeQueryRequest {
  sql: string;
  /** 用户数据范围 — 必传 */
  dataScope: DataScope;
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body: SafeQueryRequest = await request.json();
    const { sql, dataScope } = body;

    if (!sql || typeof sql !== 'string') {
      return ApiErrors.validation('缺少 SQL 语句');
    }

    if (!dataScope || !dataScope.userRole) {
      return ApiErrors.forbidden('缺少 dataScope（用户数据范围），禁止无条件查询');
    }

    // 安全过滤（DDL/DML/注入检测）
    const safetyCheck = validateSqlSafety(sql);
    if (!safetyCheck.safe) {
      return ApiErrors.forbidden(`SQL 安全检查未通过：${safetyCheck.blocked.join('; ')}`);
    }

    // 强制注入行级权限
    const scopedResult = enforceDataScope(sql, dataScope);
    if (!scopedResult.safe) {
      return ApiErrors.forbidden(`数据范围校验未通过：${scopedResult.blocked.join('; ')}`);
    }

    const finalSql = scopedResult.sql;

    // 执行查询
    const result = await execSqlSafe(finalSql);

    if (!result.success) {
      return catchErrorResponse(new Error(result.error || '查询执行失败'), '查询执行失败');
    }

    return Response.json({
      success: true,
      sql: finalSql,
      data: result.data,
      columns: result.columns,
      rowCount: result.rowCount,
    });

  } catch (error) {
    return ApiErrors.validation('查询执行失败');
  }
}

/**
 * 智能数据分析 API
 * 银蛇博士和蜡象助手共用的自然语言→SQL→图表数据分析接口
 *
 * POST /api/ai/data-analysis
 * Body: {
 *   question: string,
 *   role: 'dr-snake' | 'wax-elephant',
 *   context?: string,
 *   dataScope: { role, schoolId?, teamId?, volunteerTeamIds?, ... }
 * }
 *
 * 流程：清洗输入 → 生成SQL(带角色范围约束) → 安全过滤 → 行级权限注入 → 执行查询 → 数据预处理 → 生成图表 → 返回结果
 */

import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  validateSqlSafety,
  enforceDataScope,
  buildNL2SQLPrompt,
  buildSQLErrorFixPrompt,
  buildChartConfig,
  cleanUserInput,
  extractQueryKeywords,
  preprocessQueryResult,
  generateDataSummary,
} from '@/lib/skills/smart-data-analyzer';
import type { DataScope } from '@/lib/skills/smart-data-analyzer';
import { ApiErrors } from '@/lib/api-error';

// LLM 配置
const LLM_API_URL = (process.env.COZE_INTEGRATION_MODEL_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3') + '/chat/completions';
const LLM_API_KEY = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.LLM_API_KEY || process.env.ARK_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'doubao-seed-1-8-251228';

interface AnalysisRequest {
  question: string;
  role: 'dr-snake' | 'wax-elephant';
  context?: string;
  /** 用户数据范围 必传，控制SQL只能查询当前用户权限内的数据 */
  dataScope: DataScope;
}

interface AnalysisResult {
  success: boolean;
  question: string;
  sql?: string;
  data?: Record<string, unknown>[];
  columns?: string[];
  chart?: Record<string, unknown>;
  chartType?: string;
  summary?: string;
  warnings?: string[];
  error?: string;
  keywords?: ReturnType<typeof extractQueryKeywords>;
  /** 数据范围标签，前端可展示 */
  scopeLabel?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body: AnalysisRequest = await request.json();
    const { question, role, context } = body;

    if (!question || !role) {
      return ApiErrors.validation('缺少必要参数：question role');
    }

    // 安全：忽略客户端传入的 dataScope，服务端用 auth.payload 重算，
    // 避免客户端伪造 userRole 越权读取其他角色/学校/小队的数据。
    const payload = auth.payload as any;
    const serverDataScope: DataScope = {
      userRole: payload?.role,
      userId: payload?.userId,
      schoolId: payload?.schoolId || null,
      teamId: payload?.role === 'team' ? payload?.userId : null,
      volunteerTeamIds: payload?.volunteerTeamIds || [],
    };

    if (!serverDataScope.userRole) {
      return ApiErrors.validation('缺少必要参数：dataScope（用户数据范围）');
    }

    // Step 1: 清洗用户输入
    const cleanedQuestion = cleanUserInput(question);

    // Step 2: 提取查询关键词
    const keywords = extractQueryKeywords(cleanedQuestion);

    // Step 3: 生成 SQL（调用LLM，传dataScope Prompt 自带范围约束）
    const sqlResult = await generateSQL(cleanedQuestion, role, serverDataScope, context, keywords);
    if (!sqlResult.success || !sqlResult.sql) {
      return NextResponse.json({
        success: false,
        question: cleanedQuestion,
        error: sqlResult.error || 'SQL 生成失败',
        keywords,
        scopeLabel: buildScopeLabel(serverDataScope),
      } as AnalysisResult);
    }

    let sql = sqlResult.sql;

    // Step 4: SQL 安全过滤（DDL/DML/注入检测）
    const safetyCheck = validateSqlSafety(sql);
    if (!safetyCheck.safe) {
      return NextResponse.json({
        success: false,
        question: cleanedQuestion,
        sql,
        error: `SQL 安全检查未通过：${safetyCheck.blocked.join('; ')}`,
        keywords,
        scopeLabel: buildScopeLabel(serverDataScope),
      } as AnalysisResult);
    }

    // Step 5: 强制注入行级权限（双重保险：即使LLM没有加WHERE，这里也会强制注入）
    const scopedResult = enforceDataScope(sql, serverDataScope);
    if (!scopedResult.safe) {
      return NextResponse.json({
        success: false,
        question: cleanedQuestion,
        sql,
        error: `数据范围校验未通过：${scopedResult.blocked.join('; ')}`,
        keywords,
        scopeLabel: buildScopeLabel(serverDataScope),
      } as AnalysisResult);
    }
    sql = scopedResult.sql;

    // Step 6: 执行查询
    const queryResult = await executeSQL(sql);

    // 如果查询出错，尝试修复一次
    if (!queryResult.success && queryResult.error) {
      const fixedSql = await fixSQLError(sql, queryResult.error, cleanedQuestion, serverDataScope);
      if (fixedSql) {
        const fixSafetyCheck = validateSqlSafety(fixedSql);
        const fixScopedResult = enforceDataScope(fixedSql, serverDataScope);
        if (fixSafetyCheck.safe && fixScopedResult.safe) {
          sql = fixScopedResult.sql;
          const retryResult = await executeSQL(sql);
          if (retryResult.success) {
            queryResult.data = retryResult.data;
            queryResult.columns = retryResult.columns;
            queryResult.success = true;
          }
        }
      }
    }

    if (!queryResult.success) {
      return NextResponse.json({
        success: false,
        question: cleanedQuestion,
        sql,
        error: queryResult.error || '查询执行失败',
        keywords,
        scopeLabel: buildScopeLabel(serverDataScope),
      } as AnalysisResult);
    }

    // Step 7: 数据预处理
    const { rows, columns, warnings } = preprocessQueryResult(
      queryResult.data || [],
      queryResult.columns || []
    );

    // Step 8: 生成图表配置
    const chartConfig = buildChartConfig(rows, columns, cleanedQuestion);

    // Step 9: 生成数据摘要
    const summary = generateDataSummary(rows, columns);

    return NextResponse.json({
      success: true,
      question: cleanedQuestion,
      sql,
      data: rows,
      columns,
      chart: chartConfig.data,
      chartType: chartConfig.type,
      summary,
      warnings: warnings.length > 0 ? warnings : undefined,
      keywords,
      scopeLabel: buildScopeLabel(serverDataScope),
    } as AnalysisResult);

  } catch (error) {
    console.error('[Data Analysis API] Error:', error);
    return ApiErrors.validation('服务器内部错误');
  }
}

/** 生成数据范围标签，供前端展示 */
function buildScopeLabel(scope: DataScope): string {
  switch (scope.userRole) {
    case 'super_admin':
      return '全部数据';
    case 'teacher':
      return `本校数据（${scope.schoolId || ''}）`;
    case 'volunteer':
      return `指导小队数据（${(scope.volunteerTeamIds || []).join(', ') || ''}）`;
    case 'team':
      return `本小队数据（${scope.teamId || ''}）`;
    default:
      return '未知范围';
  }
}

/** 调用 LLM 生成 SQL（带角色数据范围约束）*/
async function generateSQL(
  question: string,
  agentRole: string,
  dataScope: DataScope,
  context?: string,
  keywords?: ReturnType<typeof extractQueryKeywords>
): Promise<{ success: boolean; sql?: string; error?: string }> {
  try {
    // DataScope 转换为 NL2SQL Prompt 的 RoleDataScope
    const roleDataScope = {
      role: dataScope.userRole as 'super_admin' | 'teacher' | 'volunteer' | 'team',
      schoolId: dataScope.schoolId,
      teamId: dataScope.teamId,
      volunteerTeamIds: dataScope.volunteerTeamIds,
    };

    const prompt = buildNL2SQLPrompt(question, roleDataScope);

    // 关键词提取
    let enhancedPrompt = prompt;
    if (context) {
      enhancedPrompt += `\n补充上下文：${context}`;
    }
    if (keywords && keywords.entities.length > 0) {
      enhancedPrompt += `\n提示：问题可能涉及表 ${keywords.entities.join(', ')}`;
    }

    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: enhancedPrompt },
          { role: 'user', content: question },
        ],
        temperature: 0.1,  // SQL 生成用低温度，确保稳定
      max_tokens: 500,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `LLM API 错误: ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取 SQL（处理可能的代码块包裹）
    let sql = content.trim();
    sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    sql = sql.replace(/^`/i, '').replace(/`$/i, '');
    sql = sql.trim();

    // 简单验证
    if (!sql.toUpperCase().startsWith('SELECT') && !sql.toUpperCase().startsWith('WITH')) {
      return { success: false, error: '生成的不是 SELECT 查询语句' };
    }

    return { success: true, sql };
  } catch (error) {
    console.error('[generateSQL] Error:', error);
    return { success: false, error: 'SQL 生成过程出错' };
  }
}

/** 执行 SQL 查询，通过沙箱 exec_sql 工具（只支持SELECT）*/
async function executeSQL(
  sql: string
): Promise<{ success: boolean; data?: Record<string, unknown>[]; columns?: string[]; error?: string }> {
  try {
    // 使用 exec_sql 沙箱工具执行（develop 环境支持所有SQL，但已通过 validateSQL 确保只走 SELECT）
    const { execSqlSafe } = await import('@/lib/skills/smart-data-analyzer/sql-executor');
    const result = await execSqlSafe(sql);
    return result;
  } catch (error) {
    const msg = '查询执行失败';
    return { success: false, error: msg };
  }
}

/** 尝试修复 SQL 错误（修复后仍需走权限注入） */
async function fixSQLError(
  originalSql: string,
  errorMessage: string,
  question: string,
  _dataScope?: DataScope
): Promise<string | null> {
  try {
    const prompt = buildSQLErrorFixPrompt(originalSql, errorMessage, question);

    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    let fixedSql = data.choices?.[0]?.message?.content?.trim() || '';

    // 清理代码
    fixedSql = fixedSql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    fixedSql = fixedSql.trim();

    if (!fixedSql.toUpperCase().startsWith('SELECT') && !fixedSql.toUpperCase().startsWith('WITH')) {
      return null;
    }

    return fixedSql;
  } catch {
    return null;
  }
}

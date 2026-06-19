/**
 * SQL 执行器 — 使用 exec_sql 沙箱工具
 *
 * 封装沙箱环境中的 exec_sql 工具，提供安全的 SQL 查询能力
 * 仅用于 SELECT 查询（调用前应已通过 validateSQL 过滤）
 */

import { validateSqlSafety } from './sql-safety-filter';

interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  columns?: string[];
  error?: string;
  rowCount?: number;
}

/**
 * 安全执行 SQL 查询
 * - 再次验证 SQL 安全性（双重保险）
 * - 通过 exec_sql 沙箱工具执行
 * - 解析结果为统一的 Record[] 格式
 */
export async function execSqlSafe(sql: string): Promise<QueryResult> {
  // 双重安全检查
  const validation = validateSqlSafety(sql);
  if (!validation.safe) {
    return { success: false, error: `SQL 安全检查未通过: ${validation.blocked.join('; ')}` };
  }

  try {
    // 使用 Next.js API 路由内部的 fetch 调用 exec_sql
    // 在沙箱环境中，通过 localhost 访问自身 API
    const baseUrl = `http://localhost:${process.env.DEPLOY_RUN_PORT || 5000}`;

    // 方式1: 尝试调用内部查询 API
    const response = await fetch(`${baseUrl}/api/internal/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        return {
          success: true,
          data: result.data || [],
          columns: result.columns || [],
          rowCount: result.data?.length || 0,
        };
      }
      // 内部 API 返回业务错误，降级
    }
  } catch {
    // 内部 API 不可用，降级到 Supabase
  }

  // 降级方案: 使用 Supabase JS 客户端
  return await execSqlViaSupabase(sql);
}

/**
 * 降级方案：通过 Supabase 查询
 * - 优先尝试 rpc('exec_safe_sql')
 * - 降级到 parseSimpleSelect + from().select()
 */
async function execSqlViaSupabase(sql: string): Promise<QueryResult> {
  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    // 尝试 rpc 执行
    const { data, error } = await supabase.rpc('exec_safe_sql', { query_text: sql });

    if (!error) {
      let rows: Record<string, unknown>[] = [];
      let columns: string[] = [];

      if (Array.isArray(data)) {
        rows = data as Record<string, unknown>[];
      } else if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        // exec_safe_sql RPC 返回格式: { success: true, data: [...] }
        if (d.success === true && Array.isArray(d.data)) {
          rows = d.data as Record<string, unknown>[];
        } else if (d.success === false) {
          return { success: false, error: `RPC 查询错误: ${d.error || '未知错误'}` };
        } else if (Array.isArray(d.rows)) {
          rows = d.rows as Record<string, unknown>[];
          columns = (d.columns as string[]) || (rows.length > 0 ? Object.keys(rows[0]) : []);
        } else {
          rows = [data as Record<string, unknown>];
        }
      }

      if (columns.length === 0 && rows.length > 0) {
        columns = Object.keys(rows[0]);
      }

      return {
        success: true,
        data: rows,
        columns,
        rowCount: rows.length,
      };
    }

    // rpc 不可用，解析简单 SQL 并用 JS API
    if (error.message.includes('Could not find the function') || error.message.includes('does not exist')) {
      return await execSimpleSqlViaSupabaseJS(supabase, sql);
    }

    return { success: false, error: `Supabase 查询错误: ${error.message}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '查询执行失败';
    return { success: false, error: msg };
  }
}

/** 解析简单 SELECT 并用 Supabase JS API 查询 */
async function execSimpleSqlViaSupabaseJS(
  supabase: ReturnType<typeof import('@/storage/database/supabase-client')['getSupabaseClient']>,
  sql: string
): Promise<QueryResult> {
  const parsed = parseSimpleSelect(sql);
  if (!parsed) {
    return {
      success: false,
      error: '无法解析此 SQL 语句。请联系管理员在 Supabase 中创建 exec_safe_sql 函数以支持复杂查询。',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from(parsed.table).select(parsed.columns);

  // 过滤条件 - 支持 eq 和 in
  for (const [key, value] of Object.entries(parsed.filters)) {
    if (Array.isArray(value)) {
      query = query.in(key, value);
    } else {
      query = query.eq(key, value);
    }
  }

  // 排序
  if (parsed.orderBy) {
    const parts = parsed.orderBy.split(/\s+/);
    const col = parts[0];
    const asc = parts[1]?.toUpperCase() !== 'DESC';
    query = query.order(col, { ascending: asc });
  }

  // 限制行数
  if (parsed.limit) {
    query = query.limit(parsed.limit);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: `查询错误: ${error.message}` };
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { success: true, data: rows, columns, rowCount: rows.length };
}

/** 解析简单 SELECT 语句 */
function parseSimpleSelect(
  sql: string
): { table: string; columns: string; filters: Record<string, string | string[]>; orderBy?: string; limit?: number } | null {
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)/i);
  if (!selectMatch) return null;

  const columns = selectMatch[1].trim();
  const table = selectMatch[2].trim();

  const filters: Record<string, string | string[]> = {};
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|$)/i);
  if (whereMatch) {
    const conditions = whereMatch[1].split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const trimmedCond = cond.trim();
      // 支持 IN 条件: col IN ('val1','val2')
      const inMatch = trimmedCond.match(/(\w+)\s+IN\s*\(([^)]+)\)/i);
      if (inMatch) {
        const col = inMatch[1];
        const valuesStr = inMatch[2];
        const values = valuesStr.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        filters[col] = values;
        continue;
      }
      // 支持 = 条件
      const eqMatch = trimmedCond.match(/(\w+)\s*=\s*'?([^']*)'?/);
      if (eqMatch) {
        filters[eqMatch[1]] = eqMatch[2];
      }
    }
  }

  let orderBy: string | undefined;
  const orderMatch = sql.match(/ORDER\s+BY\s+(\w+(?:\s+(?:ASC|DESC))?)/i);
  if (orderMatch) orderBy = orderMatch[1];

  let limit: number | undefined;
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) limit = parseInt(limitMatch[1], 10);

  return { table, columns, filters, orderBy, limit };
}

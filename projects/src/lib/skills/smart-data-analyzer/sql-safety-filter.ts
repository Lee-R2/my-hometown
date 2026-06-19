/**
 * SQL 安全过滤器
 * 禁止 DDL（CREATE/DROP/ALTER/TRUNCATE）和 DML（INSERT/UPDATE/DELETE）危险操作
 * 仅允许只读 SELECT 查询
 */

/** 危险 SQL 关键词（DDL + DML） */
const DANGEROUS_KEYWORDS = [
  // DDL - 数据定义语言
  'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME',
  // DML - 数据操作语言
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE',
  // 权限相关
  'GRANT', 'REVOKE',
  // 系统操作
  'EXECUTE', 'EXEC', 'CALL',
  // 危险函数
  'COPY', 'IMPORT', 'EXPORT',
  // 连接操作
  'ATTACH', 'DETACH',
];

/** 危险模式（正则） */
const DANGEROUS_PATTERNS = [
  /;\s*(CREATE|DROP|ALTER|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|MERGE|GRANT|REVOKE|EXECUTE|EXEC|CALL|COPY|ATTACH)/i,
  /INTO\s+(OUTFILE|DUMPFILE)/i,
  /LOAD_FILE\s*\(/i,
  /BENCHMARK\s*\(/i,
  /SLEEP\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /INFORMATION_SCHEMA/i,
  /PG_\w+/i,  // PostgreSQL 系统表
  /PG_CATALOG/i,
];

export interface SqlValidationResult {
  safe: boolean;
  sql: string;
  warnings: string[];
  blocked: string[];
  sanitizedSql: string;
}

/**
 * 验证 SQL 语句安全性
 * @param sql 待验证的 SQL 语句
 * @returns 验证结果
 */
export function validateSqlSafety(sql: string): SqlValidationResult {
  const warnings: string[] = [];
  const blocked: string[] = [];
  let sanitizedSql = sql.trim();

  // 移除注释（防止注释注入）
  sanitizedSql = sanitizedSql.replace(/--.*$/gm, ''); // 单行注释
  sanitizedSql = sanitizedSql.replace(/\/\*[\s\S]*?\*\//g, ''); // 多行注释

  // 检查危险关键词
  const upperSql = sanitizedSql.toUpperCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    // 使用单词边界匹配，避免误判（如 "created_at" 不应匹配 "CREATE"）
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sanitizedSql)) {
      // 特殊处理：允许 SELECT 语句中的子查询包含这些词作为表名/列名
      const isSelectContext = /^\s*SELECT\b/i.test(sanitizedSql);
      const isColumnOrTableReference = new RegExp(
        `(?:AS|FROM|JOIN|ON|WHERE|AND|OR)\\s+.*?\\b${keyword}\\b`,
        'i'
      ).test(sanitizedSql);

      if (!isSelectContext || !isColumnOrTableReference) {
        blocked.push(`禁止的操作: ${keyword}`);
      }
    }
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sanitizedSql)) {
      blocked.push(`危险模式: ${pattern.source}`);
    }
  }

  // 检查是否以 SELECT 开头
  if (!/^\s*SELECT\b/i.test(sanitizedSql)) {
    blocked.push('仅允许 SELECT 查询语句');
  }

  // 检查多语句注入（分号分隔的多条 SQL）
  const statements = sanitizedSql.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    blocked.push('禁止执行多条 SQL 语句');
  }

  // 检查 UNION 注入（从系统表读取数据）
  if (/UNION\s+(ALL\s+)?SELECT/i.test(sanitizedSql)) {
    if (/INFORMATION_SCHEMA|PG_CATALOG|PG_\w+|SYS\./i.test(sanitizedSql)) {
      blocked.push('禁止通过 UNION 读取系统表');
    } else {
      warnings.push('检测到 UNION 查询，已允许但请注意性能');
    }
  }

  // 检查无 LIMIT 的大表查询
  if (!/\bLIMIT\b/i.test(sanitizedSql) && !/\bFETCH\s+(FIRST|NEXT)\b/i.test(sanitizedSql)) {
    warnings.push('查询未设置 LIMIT，建议添加 LIMIT 防止返回过多数据');
  }

  return {
    safe: blocked.length === 0,
    sql,
    warnings,
    blocked,
    sanitizedSql: blocked.length === 0 ? sanitizedSql : '',
  };
}

/**
 * 自动为 SQL 添加安全 LIMIT
 * @param sql 原始 SQL
 * @param maxRows 最大行数（默认 1000）
 * @returns 添加了 LIMIT 的 SQL
 */
export function addSafeLimit(sql: string, maxRows: number = 1000): string {
  const trimmed = sql.trim();

  // 已经有 LIMIT 则不添加
  if (/\bLIMIT\b/i.test(trimmed)) {
    return trimmed;
  }

  // 移除末尾分号
  const withoutSemicolon = trimmed.replace(/;\s*$/, '');

  return `${withoutSemicolon} LIMIT ${maxRows};`;
}

/**
 * 用户数据范围上下文
 */
export interface DataScope {
  /** 用户ID */
  userId: string;
  /** 用户角色: super_admin / teacher / volunteer / team */
  userRole: string;
  /** 学校ID（teacher/volunteer） */
  schoolId?: string;
  /** 小队ID（team角色） */
  teamId?: string;
  /** 志愿者可指导的小队ID列表 */
  volunteerTeamIds?: string[];
}

/**
 * 表级权限映射：定义每种角色可以查询哪些表
 */
const TABLE_ACCESS: Record<string, string[]> = {
  super_admin: [
    'teams', 'tasks', 'task_themes', 'task_groups', 'task_submissions',
    'users', 'rewards', 'task_rewards', 'skills', 'task_skills',
    'tools', 'task_tools', 'schools', 'volunteers', 'team_theme_selections',
    'agent_messages', 'agent_conversations', 'agent_sessions',
    'agent_reflections',
  ],
  teacher: [
    'teams', 'tasks', 'task_themes', 'task_groups', 'task_submissions',
    'users', 'rewards', 'task_rewards', 'skills', 'task_skills',
    'tools', 'task_tools', 'schools', 'team_theme_selections',
    'agent_messages',
    'agent_reflections',
  ],
  volunteer: [
    'teams', 'tasks', 'task_themes', 'task_groups', 'task_submissions',
    'users', 'rewards', 'task_rewards', 'skills', 'task_skills',
    'tools', 'task_tools', 'team_theme_selections',
    'agent_reflections',
  ],
  team: [
    'teams', 'tasks', 'task_themes', 'task_groups', 'task_submissions',
    'rewards', 'task_rewards', 'skills', 'task_skills',
    'tools', 'task_tools', 'team_theme_selections',
    'agent_reflections',
  ],
};

/**
 * 行级权限条件：每种角色 + 表 对应的 WHERE 过滤条件
 */
function getRowLevelConditions(scope: DataScope, tableName: string): string[] {
  const conditions: string[] = [];

  switch (scope.userRole) {
    case 'super_admin':
      // 超管可以看所有数据，无行级过滤
      break;

    case 'teacher':
      // 助学老师只能看本校数据
      if (scope.schoolId) {
        const schoolTables = ['teams', 'users', 'task_submissions', 'team_theme_selections'];
        if (schoolTables.includes(tableName)) {
          conditions.push(`school_id = '${scope.schoolId}'`);
        }
      }
      break;

    case 'volunteer':
      // 志愿者只能看自己指导的小队数据
      if (scope.volunteerTeamIds && scope.volunteerTeamIds.length > 0) {
        const teamTables = ['teams', 'task_submissions', 'team_theme_selections'];
        if (teamTables.includes(tableName)) {
          const ids = scope.volunteerTeamIds.map(id => `'${id}'`).join(',');
          conditions.push(`id IN (${ids})`);
        }
      }
      break;

    case 'team':
      // 小队只能看自己的数据
      if (scope.teamId) {
        if (tableName === 'teams') {
          conditions.push(`id = '${scope.teamId}'`);
        } else if (tableName === 'task_submissions') {
          conditions.push(`team_id = '${scope.teamId}'`);
        } else if (tableName === 'task_rewards') {
          conditions.push(`team_id = '${scope.teamId}'`);
        } else if (tableName === 'team_theme_selections') {
          conditions.push(`team_id = '${scope.teamId}'`);
        } else if (tableName === 'task_skills' || tableName === 'task_tools') {
          const subQuery = "task_id IN (SELECT id FROM tasks WHERE task_group_id IN (SELECT id FROM task_groups WHERE theme_id IN (SELECT theme_id FROM team_theme_selections WHERE team_id = '" + scope.teamId + "')))";
          conditions.push(subQuery);
        }
      }
      break;
  }

  return conditions;
}

/**
 * 从 SQL 中提取表名（FROM 和 JOIN 后面的表名）
 */
function extractTableNames(sql: string): string[] {
  const tables: string[] = [];
  
  // 匹配 FROM table_name
  const fromMatch = sql.match(/\bFROM\s+([a-z_]+)/gi);
  if (fromMatch) {
    fromMatch.forEach(m => {
      const t = m.replace(/\bFROM\s+/i, '').trim();
      if (t && !tables.includes(t)) tables.push(t);
    });
  }
  
  // 匹配 JOIN table_name
  const joinMatch = sql.match(/\bJOIN\s+([a-z_]+)/gi);
  if (joinMatch) {
    joinMatch.forEach(m => {
      const t = m.replace(/\bJOIN\s+/i, '').trim();
      if (t && !tables.includes(t)) tables.push(t);
    });
  }
  
  return tables;
}

/**
 * 校验表级权限：检查角色是否有权查询涉及的表
 */
export function validateTableAccess(sql: string, scope: DataScope): {
  allowed: boolean;
  deniedTables: string[];
  accessibleTables: string[];
} {
  const tables = extractTableNames(sql);
  const accessible = TABLE_ACCESS[scope.userRole] || [];
  const deniedTables = tables.filter(t => !accessible.includes(t));
  
  return {
    allowed: deniedTables.length === 0,
    deniedTables,
    accessibleTables: accessible,
  };
}

/**
 * 注入行级权限条件到 SQL
 * 自动在 WHERE 子句中添加权限过滤条件
 */
export function injectRowLevelSecurity(sql: string, scope: DataScope): {
  sql: string;
  injectedConditions: string[];
} {
  const injectedConditions: string[] = [];
  
  if (scope.userRole === 'super_admin') {
    return { sql, injectedConditions };
  }

  const tables = extractTableNames(sql);
  const allConditions: string[] = [];

  for (const table of tables) {
    const conditions = getRowLevelConditions(scope, table);
    if (conditions.length > 0) {
      allConditions.push(...conditions);
      injectedConditions.push(`[${table}] ${conditions.join(' AND ')}`);
    }
  }

  if (allConditions.length === 0) {
    return { sql, injectedConditions };
  }

  const conditionStr = allConditions.join(' AND ');
  const trimmed = sql.trim().replace(/;\s*$/, '');

  // 如果已有 WHERE 子句，追加 AND 条件
  if (/\bWHERE\b/i.test(trimmed)) {
    // 在第一个 WHERE 后面追加
    const whereIndex = trimmed.toUpperCase().indexOf('WHERE');
    const beforeWhere = trimmed.substring(0, whereIndex + 5);
    const afterWhere = trimmed.substring(whereIndex + 5);
    return {
      sql: `${beforeWhere} (${conditionStr}) AND${afterWhere};`,
      injectedConditions,
    };
  }

  // 没有 WHERE，在 FROM/JOIN 之后、GROUP BY/ORDER BY/LIMIT 之前插入 WHERE
  const insertBefore = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING)\b/i;
  const match = insertBefore.exec(trimmed);
  
  if (match && match.index) {
    const before = trimmed.substring(0, match.index);
    const after = trimmed.substring(match.index);
    return {
      sql: `${before} WHERE ${conditionStr} ${after};`,
      injectedConditions,
    };
  }

  // 最后兜底：在末尾添加 WHERE
  return {
    sql: `${trimmed} WHERE ${conditionStr};`,
    injectedConditions,
  };
}

/**
 * 完整的权限校验 + 行级过滤
 * 先校验表级权限，再注入行级条件，最后添加安全 LIMIT
 */
export function enforceDataScope(
  sql: string,
  scope: DataScope,
  options?: { maxRows?: number }
): {
  sql: string;
  safe: boolean;
  blocked: string[];
  warnings: string[];
  injectedConditions: string[];
} {
  const blocked: string[] = [];
  const warnings: string[] = [];

  // 1. 基础安全校验
  const safetyResult = validateSqlSafety(sql);
  if (!safetyResult.safe) {
    return {
      sql: '',
      safe: false,
      blocked: safetyResult.blocked,
      warnings: safetyResult.warnings,
      injectedConditions: [],
    };
  }

  // 2. 表级权限校验
  const accessResult = validateTableAccess(safetyResult.sanitizedSql, scope);
  if (!accessResult.allowed) {
    blocked.push(`无权访问以下表: ${accessResult.deniedTables.join(', ')}`);
    return {
      sql: '',
      safe: false,
      blocked,
      warnings,
      injectedConditions: [],
    };
  }

  // 3. 注入行级权限
  const rlsResult = injectRowLevelSecurity(safetyResult.sanitizedSql, scope);
  if (rlsResult.injectedConditions.length > 0) {
    warnings.push(`已自动注入数据范围限制: ${rlsResult.injectedConditions.join('; ')}`);
  }

  // 4. 添加安全 LIMIT
  let finalSql = addSafeLimit(rlsResult.sql, options?.maxRows || 500);

  return {
    sql: finalSql,
    safe: true,
    blocked,
    warnings: [...safetyResult.warnings, ...warnings],
    injectedConditions: rlsResult.injectedConditions,
  };
}

/**
 * 数据清洗预处理模块
 * 在 SQL 查询前对用户输入进行清洗，查询后对结果进行预处理
 * 提升数据查询的健壮性和结果的可读性
 */

/** 用户输入清洗选项 */
export interface CleanOptions {
  trimWhitespace?: boolean;      // 去除前后空白
  normalizeQuotes?: boolean;     // 统一引号风格
  removeHiddenChars?: boolean;   // 移除隐藏字符
  normalizeChinese?: boolean;    // 规范化中文输入
  maxLength?: number;            // 最大长度限制
}

/** 默认清洗选项 */
const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  trimWhitespace: true,
  normalizeQuotes: true,
  removeHiddenChars: true,
  normalizeChinese: true,
  maxLength: 500,
};

/**
 * 清洗用户输入的自然语言查询
 * @param input 用户原始输入
 * @param options 清洗选项
 * @returns 清洗后的输入
 */
export function cleanUserInput(input: string, options: CleanOptions = {}): string {
  const opts = { ...DEFAULT_CLEAN_OPTIONS, ...options };
  let cleaned = input;

  // 去除前后空白
  if (opts.trimWhitespace) {
    cleaned = cleaned.trim();
  }

  // 移除隐藏字符（零宽空格、BOM 等）
  if (opts.removeHiddenChars) {
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');  // 零宽字符
    cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');  // 控制字符
  }

  // 统一引号风格（中文引号→英文引号）
  if (opts.normalizeQuotes) {
    cleaned = cleaned.replace(/["\u201C\u201D]/g, '"');   // 双引号
    cleaned = cleaned.replace(/['\u2018\u2019]/g, "'");   // 单引号
  }

  // 规范化中文标点
  if (opts.normalizeChinese) {
    cleaned = cleaned.replace(/，/g, ',');
    cleaned = cleaned.replace(/：/g, ':');
    cleaned = cleaned.replace(/；/g, ';');
    cleaned = cleaned.replace(/（/g, '(');
    cleaned = cleaned.replace(/）/g, ')');
  }

  // 长度限制
  if (opts.maxLength && cleaned.length > opts.maxLength) {
    cleaned = cleaned.substring(0, opts.maxLength);
  }

  return cleaned;
}

/**
 * 提取查询关键词
 * 从自然语言中提取可能的表名、列名、筛选条件关键词
 * @param input 清洗后的用户输入
 * @returns 提取的关键词结构
 */
export function extractQueryKeywords(input: string): {
  entities: string[];       // 实体关键词（学校、小队、任务等）
  filters: string[];        // 筛选条件关键词
  aggregations: string[];   // 聚合意图关键词
  timeRange: string[];      // 时间范围关键词
  sortHint: string[];       // 排序关键词
} {
  const entities: string[] = [];
  const filters: string[] = [];
  const aggregations: string[] = [];
  const timeRange: string[] = [];
  const sortHint: string[] = [];

  // 实体识别
  const entityPatterns: [RegExp, string][] = [
    [/学校/g, 'schools'],
    [/小队|团队/g, 'teams'],
    [/任务/g, 'tasks'],
    [/产出|提交|作品/g, 'submissions'],
    [/主题/g, 'task_themes'],
    [/激励|奖励/g, 'rewards'],
    [/技能/g, 'skills'],
    [/工具/g, 'tools'],
    [/志愿者/g, 'volunteers'],
    [/老师|教师/g, 'teachers'],
    [/家长/g, 'parents'],
    [/消息|通知/g, 'notifications'],
    [/点赞/g, 'likes'],
  ];

  for (const [pattern, table] of entityPatterns) {
    if (pattern.test(input)) {
      entities.push(table);
    }
  }

  // 筛选条件识别
  const filterPatterns = [
    /(\w+)学校/g,
    /名叫?["']?([^"'\s]+)["']?/g,
    /编号是?(\S+)/g,
    /(\w+)年级/g,
    /状态为?(\w+)/g,
  ];
  for (const pattern of filterPatterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      filters.push(match[1] || match[0]);
    }
  }

  // 聚合意图识别
  const aggPatterns: [RegExp, string][] = [
    [/多少|数量|几个|几条|总数|总计/g, 'count'],
    [/平均|均值/g, 'avg'],
    [/最高|最多|最大/g, 'max'],
    [/最低|最少|最小/g, 'min'],
    [/排名|排行|TOP/g, 'rank'],
    [/统计|汇总|概览/g, 'summary'],
    [/对比|比较/g, 'compare'],
  ];
  for (const [pattern, agg] of aggPatterns) {
    if (pattern.test(input)) {
      aggregations.push(agg);
    }
  }

  // 时间范围识别
  const timePatterns = [
    /今天|今日/g,
    /昨天|昨日/g,
    /本周|这周/g,
    /上周|上周/g,
    /本月|这个月/g,
    /上月|上个月/g,
    /最近(\d+)天/g,
    /(\d{4})年/g,
  ];
  for (const pattern of timePatterns) {
    if (pattern.test(input)) {
      timeRange.push(input.match(pattern)![0]);
    }
  }

  // 排序意图识别
  const sortPatterns: [RegExp, string][] = [
    [/从高到低|降序|从多到少/g, 'DESC'],
    [/从低到高|升序|从少到多/g, 'ASC'],
    [/最多|最高|最大|排名/g, 'DESC'],
  ];
  for (const [pattern, direction] of sortPatterns) {
    if (pattern.test(input)) {
      sortHint.push(direction);
    }
  }

  return { entities, filters, aggregations, timeRange, sortHint };
}

/**
 * 预处理查询结果
 * 对 SQL 查询返回的原始数据进行清洗和格式化
 * @param rows 原始查询结果
 * @param columns 列名
 * @returns 处理后的结果
 */
export function preprocessQueryResult(
  rows: Record<string, unknown>[],
  columns: string[]
): {
  rows: Record<string, unknown>[];
  columns: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  let processedRows = rows;

  // 1. 空结果处理
  if (rows.length === 0) {
    warnings.push('查询结果为空，可能需要调整查询条件');
    return { rows: [], columns, warnings };
  }

  // 2. 截断超长结果
  const MAX_DISPLAY_ROWS = 200;
  if (rows.length > MAX_DISPLAY_ROWS) {
    processedRows = rows.slice(0, MAX_DISPLAY_ROWS);
    warnings.push(`结果已截断，仅显示前${MAX_DISPLAY_ROWS}条（共${rows.length}条）`);
  }

  // 3. 清洗字段值
  processedRows = processedRows.map(row => {
    const cleaned: Record<string, unknown> = {};
    for (const col of columns) {
      const val = row[col];
      cleaned[col] = cleanFieldValue(val);
    }
    return cleaned;
  });

  // 4. 检测异常值
  for (const col of columns) {
    const values = processedRows.map(r => r[col]);
    const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
    if (nullCount > 0 && nullCount / values.length > 0.5) {
      warnings.push(`列"${col}"有${nullCount}个空值（占比${(nullCount / values.length * 100).toFixed(0)}%），数据可能不完整`);
    }
  }

  return { rows: processedRows, columns, warnings };
}

/**
 * 清洗单个字段值
 */
function cleanFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    // 去除前后空白
    let cleaned = value.trim();
    // 截断超长字符串
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 500) + '...';
    }
    return cleaned || null;
  }

  if (typeof value === 'number') {
    // 保留合理精度
    return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // 对象类型（如 JSON）
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return value;
}

/**
 * 生成数据质量报告
 * 在执行查询前，快速检查目标表的数据质量
 */
export function generateDataQualityHints(
  rowCount: number,
  nullColumns: { column: string; nullCount: number; nullRate: number }[]
): string[] {
  const hints: string[] = [];

  if (rowCount === 0) {
    hints.push('⚠️ 目标表无数据，查询可能返回空结果');
    return hints;
  }

  if (rowCount > 100000) {
    hints.push(`⚠️ 数据量较大（${rowCount.toLocaleString()}条），建议添加 WHERE 条件缩小范围`);
  }

  for (const col of nullColumns) {
    if (col.nullRate > 0.3) {
      hints.push(`⚠️ 列"${col.column}"空值率${(col.nullRate * 100).toFixed(0)}%，相关筛选可能遗漏数据`);
    }
  }

  return hints;
}

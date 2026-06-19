/**
 * 图表输出支持模块
 * 将查询结果转换为前端可渲染的图表配置（ECharts 格式）
 * 支持基础图表类型：柱状图、折线图、饼图、雷达图、表格
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'radar' | 'table';

export interface ChartConfig {
  type: ChartType;
  title: string;
  data: Record<string, unknown>;  // ECharts option 格式
  summary?: string;  // 图表数据摘要（文字描述）
}

export interface ColumnMeta {
  name: string;
  type: 'number' | 'string' | 'date';
  uniqueCount?: number;
}

/**
 * 自动推断图表类型
 * 根据列的数据类型和数量推断最合适的图表类型
 */
export function inferChartType(columns: ColumnMeta[], rowCount: number): ChartType {
  const numericCols = columns.filter(c => c.type === 'number');
  const stringCols = columns.filter(c => c.type === 'string');
  const dateCols = columns.filter(c => c.type === 'date');

  // 只有1列且是数值 → 不适合图表，用表格
  if (columns.length === 1) return 'table';

  // 有1个分类维度 + 1-3个数值 → 柱状图
  if (stringCols.length === 1 && numericCols.length >= 1 && numericCols.length <= 3 && rowCount <= 20) {
    return 'bar';
  }

  // 有日期维度 + 数值 → 折线图
  if (dateCols.length >= 1 && numericCols.length >= 1) {
    return 'line';
  }

  // 有1个分类维度 + 1个数值 + 行数较少 → 饼图
  if (stringCols.length === 1 && numericCols.length === 1 && rowCount <= 8) {
    return 'pie';
  }

  // 多个数值维度 → 雷达图
  if (numericCols.length >= 3 && stringCols.length === 1 && rowCount <= 10) {
    return 'radar';
  }

  // 默认柱状图（如果有分类+数值）或表格
  if (stringCols.length >= 1 && numericCols.length >= 1) return 'bar';
  return 'table';
}

/**
 * 推断列的数据类型
 */
export function inferColumnType(values: unknown[]): ColumnMeta['type'] {
  // 跳过 null/undefined
  const nonNull = values.filter(v => v !== null && v !== undefined);
  if (nonNull.length === 0) return 'string';

  const sample = nonNull.slice(0, 20);

  // 检查是否为数字
  const numericCount = sample.filter(v => typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')).length;
  if (numericCount / sample.length > 0.8) return 'number';

  // 检查是否为日期
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,  // 2024-01-01
    /^\d{4}\/\d{2}\/\d{2}/,  // 2024/01/01
  ];
  const dateCount = sample.filter(v => {
    const str = String(v);
    return datePatterns.some(p => p.test(str)) || v instanceof Date;
  }).length;
  if (dateCount / sample.length > 0.8) return 'date';

  return 'string';
}

/**
 * 将查询结果转换为 ECharts 图表配置
 * @param rows 查询结果行
 * @param columns 列名数组
 * @param title 图表标题
 * @param forceType 强制指定图表类型（可选）
 */
export function buildChartConfig(
  rows: Record<string, unknown>[],
  columns: string[],
  title: string,
  forceType?: ChartType
): ChartConfig {
  if (rows.length === 0) {
    return {
      type: 'table',
      title,
      data: { columns, rows: [] },
      summary: '查询结果为空，无数据可展示',
    };
  }

  // 推断列类型
  const columnMetas: ColumnMeta[] = columns.map(col => ({
    name: col,
    type: inferColumnType(rows.map(r => r[col])),
    uniqueCount: new Set(rows.map(r => String(r[col]))).size,
  }));

  const chartType = forceType || inferChartType(columnMetas, rows.length);
  const numericCols = columnMetas.filter(c => c.type === 'number');
  const categoryCols = columnMetas.filter(c => c.type === 'string' || c.type === 'date');

  const categoryCol = categoryCols[0];
  const categories = categoryCol ? rows.map(r => String(r[categoryCol.name])) : [];

  switch (chartType) {
    case 'bar':
      return buildBarChart(title, categories, numericCols, rows);
    case 'line':
      return buildLineChart(title, categories, numericCols, rows, categoryCol);
    case 'pie':
      return buildPieChart(title, categories, numericCols[0], rows);
    case 'radar':
      return buildRadarChart(title, categories, numericCols, rows);
    case 'table':
    default:
      return buildTable(title, columns, rows);
  }
}

function buildBarChart(
  title: string,
  categories: string[],
  numericCols: ColumnMeta[],
  rows: Record<string, unknown>[]
): ChartConfig {
  const series = numericCols.map(col => ({
    name: col.name,
    type: 'bar' as const,
    data: rows.map(r => Number(r[col.name]) || 0),
  }));

  return {
    type: 'bar',
    title,
    data: {
      tooltip: { trigger: 'axis' as const },
      legend: { data: numericCols.map(c => c.name) },
      xAxis: { type: 'category' as const, data: categories },
      yAxis: { type: 'value' as const },
      series,
    },
    summary: `共${categories.length}个分类，${numericCols.length}个数值维度`,
  };
}

function buildLineChart(
  title: string,
  categories: string[],
  numericCols: ColumnMeta[],
  rows: Record<string, unknown>[],
  categoryCol?: ColumnMeta
): ChartConfig {
  const series = numericCols.map(col => ({
    name: col.name,
    type: 'line' as const,
    smooth: true,
    data: rows.map(r => Number(r[col.name]) || 0),
  }));

  return {
    type: 'line',
    title,
    data: {
      tooltip: { trigger: 'axis' as const },
      legend: { data: numericCols.map(c => c.name) },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: { rotate: categoryCol?.type === 'date' ? 30 : 0 },
      },
      yAxis: { type: 'value' as const },
      series,
    },
    summary: `时间跨度${categories.length}个点，${numericCols.length}条趋势线`,
  };
}

function buildPieChart(
  title: string,
  categories: string[],
  valueCol: ColumnMeta,
  rows: Record<string, unknown>[]
): ChartConfig {
  const data = rows.map(r => ({
    name: String(r[categories[0] || 'name'] || ''),
    value: Number(r[valueCol.name]) || 0,
  }));

  return {
    type: 'pie',
    title,
    data: {
      tooltip: { trigger: 'item' as const },
      legend: { orient: 'vertical' as const, left: 'left' },
      series: [{
        type: 'pie' as const,
        radius: '60%',
        data,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
        },
      }],
    },
    summary: `${data.length}个分类，总计${data.reduce((s, d) => s + d.value, 0)}`,
  };
}

function buildRadarChart(
  title: string,
  categories: string[],
  numericCols: ColumnMeta[],
  rows: Record<string, unknown>[]
): ChartConfig {
  const indicator = numericCols.map(col => ({
    name: col.name,
    max: Math.max(...rows.map(r => Number(r[col.name]) || 0)) * 1.2 || 100,
  }));

  const series = rows.map(r => ({
    value: numericCols.map(col => Number(r[col.name]) || 0),
    name: String(r[categories[0] || 'name'] || ''),
  }));

  return {
    type: 'radar',
    title,
    data: {
      tooltip: {},
      legend: { data: series.map(s => s.name) },
      radar: { indicator },
      series: [{
        type: 'radar' as const,
        data: series,
      }],
    },
    summary: `${categories.length}个对象，${numericCols.length}个维度对比`,
  };
}

function buildTable(
  title: string,
  columns: string[],
  rows: Record<string, unknown>[]
): ChartConfig {
  return {
    type: 'table',
    title,
    data: {
      columns,
      rows: rows.map(r =>
        columns.reduce((acc, col) => {
          acc[col] = r[col];
          return acc;
        }, {} as Record<string, unknown>)
      ),
    },
    summary: `共${rows.length}行 x ${columns.length}列`,
  };
}

/**
 * 生成图表的文字摘要
 */
export function generateDataSummary(rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return '查询结果为空';

  const parts: string[] = [`共${rows.length}条记录`];

  // 对数值列生成统计摘要
  const columnMetas = columns.map(col => ({
    name: col,
    type: inferColumnType(rows.map(r => r[col])),
  }));

  for (const meta of columnMetas) {
    if (meta.type === 'number') {
      const values = rows.map(r => Number(r[meta.name])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        parts.push(`${meta.name}: 合计${sum.toFixed(0)}, 均值${avg.toFixed(1)}, 范围${min}-${max}`);
      }
    }
  }

  return parts.join('；');
}

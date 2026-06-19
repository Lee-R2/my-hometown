import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getLaxiangData } from '@/lib/laxiang-data';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  IRunOptions
} from 'docx';

/**
 * 蜡象助手 Word 分析报告生成 API
 * 根据请求生成指定类型的分析报告 Word 文档
 */

// 报告类型
type ReportType = 
  | 'overview'      // 平台概览报告
  | 'teams'         // 小队分析报告
  | 'tasks'         // 任务分析报告
  | 'submissions'   // 产出审核报告
  | 'schools'       // 学校分析报告
  | 'volunteers'    // 志愿者报告
  | 'rewards'       // 激励分析报告
  | 'comprehensive' // 综合分析报告
  | 'custom';       // 自定义报告

// 获取报告生成
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = (searchParams.get('type') || 'overview') as ReportType;
    const userRole = searchParams.get('role') || 'super_admin';
    const userId = searchParams.get('userId') || undefined;
    const schoolId = searchParams.get('schoolId') || undefined;
    const title = searchParams.get('title') || '';

    // 获取数据
    let reportData: any;

    // 根据报告类型获取相应数据
    switch (reportType) {
      case 'overview':
        reportData = await getLaxiangData('dashboard', userRole, userId, schoolId);
        break;
      case 'teams':
        reportData = await getLaxiangData('teams', userRole, userId, schoolId);
        break;
      case 'tasks':
        reportData = await getLaxiangData('tasks', userRole, userId, schoolId);
        break;
      case 'submissions':
        reportData = await getLaxiangData('submissions', userRole, userId, schoolId);
        break;
      case 'schools':
        reportData = await getLaxiangData('schools', userRole, userId, schoolId);
        break;
      case 'volunteers':
        reportData = await getLaxiangData('volunteers', userRole, userId, schoolId);
        break;
      case 'rewards':
        reportData = await getLaxiangData('rewards', userRole, userId, schoolId);
        break;
      case 'comprehensive':
        reportData = {
          overview: await getLaxiangData('dashboard', userRole, userId, schoolId),
          teams: await getLaxiangData('teams', userRole, userId, schoolId),
          submissions: await getLaxiangData('submissions', userRole, userId, schoolId),
          schools: await getLaxiangData('schools', userRole, userId, schoolId),
          rewards: await getLaxiangData('rewards', userRole, userId, schoolId),
        };
        break;
      default:
        reportData = await getLaxiangData('dashboard', userRole, userId, schoolId);
    }

    // 生成 Word 文档
    const docBuffer = await generateReportDocument(reportType, reportData, title, userRole);
    const filename = `laxiang_report_${reportType}_${new Date().toISOString().split('T')[0]}.docx`;

    return new NextResponse(docBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error: any) {
    console.error('[蜡象助手报告] 生成失败:', error);
    return safeError(error);
  }
}

// POST 请求支持自定义内容报告
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { reportType = 'custom', title = '自定义分析报告', content, data } = body;

    let reportData = data;
    if (!reportData) {
      reportData = await getLaxiangData('dashboard', 'super_admin', undefined, undefined);
    }

    const docBuffer = await generateReportDocument(reportType, reportData, title, 'super_admin');
    const filename = `laxiang_report_${reportType}_${new Date().toISOString().split('T')[0]}.docx`;

    return new NextResponse(docBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error: any) {
    console.error('[蜡象助手报告] 生成失败:', error);
    return safeError(error);
  }
}

/**
 * 生成报告文档
 */
async function generateReportDocument(
  reportType: string,
  data: any,
  customTitle: string,
  userRole: string
): Promise<Buffer> {
  const children: any[] = [];

  // 报告标题映射
  const titleMap: Record<string, string> = {
    overview: 'STEM教育平台数据概览报告',
    teams: '小队管理分析报告',
    tasks: '任务管理分析报告',
    submissions: '产出审核分析报告',
    schools: '项目学校分析报告',
    volunteers: '志愿者管理分析报告',
    rewards: '激励配置分析报告',
    comprehensive: 'STEM教育平台综合分析报告',
    custom: customTitle || '自定义分析报告'
  };

  const reportTitle = customTitle || titleMap[reportType] || '数据分析报告';

  // 封面标题
  children.push(
    new Paragraph({
      text: reportTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  // 报告信息
  const now = new Date();
  children.push(createInfoTable([
    ['报告类型', getReportTypeName(reportType)],
    ['生成时间', now.toLocaleString('zh-CN')],
    ['报告角色', getRoleName(userRole)],
    ['数据来源', 'STEM教育管理平台']
  ]));
  children.push(new Paragraph({ text: '' }));
  children.push(new Paragraph({ text: '' }));

  // 根据报告类型生成内容
  switch (reportType) {
    case 'overview':
    case 'dashboard':
      generateOverviewContent(children, data);
      break;
    case 'teams':
      generateTeamsContent(children, data);
      break;
    case 'tasks':
      generateTasksContent(children, data);
      break;
    case 'submissions':
      generateSubmissionsContent(children, data);
      break;
    case 'schools':
      generateSchoolsContent(children, data);
      break;
    case 'volunteers':
      generateVolunteersContent(children, data);
      break;
    case 'rewards':
      generateRewardsContent(children, data);
      break;
    case 'comprehensive':
      generateComprehensiveContent(children, data);
      break;
    default:
      generateCustomContent(children, data);
  }

  // 生成文档
  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return Packer.toBuffer(doc);
}

// ============ 内容生成函数 ============

function generateOverviewContent(children: any[], data: any) {
  const summary = data?.summary || {};
  const submissions = data?.submissions || {};
  const topTeams = data?.topTeams || [];

  // 标题
  children.push(createHeading('一、数据概览', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ text: '' }));

  // 核心指标表格
  children.push(createHeading('1. 核心数据指标', HeadingLevel.HEADING_2));
  children.push(createMetricsTable([
    ['指标名称', '数值', '说明'],
    ['学校总数', `${summary.totalSchools || 0} 所`, '参与项目的学校数量'],
    ['小队总数', `${summary.totalTeams || 0} 支`, '已注册的小队数量'],
    ['志愿者总数', `${summary.totalVolunteers || 0} 人`, '授课志愿者人数'],
    ['主题总数', `${summary.totalThemes || 0} 个`, '已配置的主题数量'],
    ['工具总数', `${summary.totalTools || 0} 个`, '可用工具数量'],
    ['技能总数', `${summary.totalSkills || 0} 个`, '学习技能数量'],
    ['激励总数', `${summary.totalRewards || 0} 个`, '激励物品数量'],
    ['今日活跃', `${summary.todayActiveTeams || 0} 支`, '今日有活动的小队']
  ]));
  children.push(new Paragraph({ text: '' }));

  // 产出审核统计
  children.push(createHeading('2. 产出审核统计', HeadingLevel.HEADING_2));
  children.push(createMetricsTable([
    ['状态', '数量', '占比'],
    ['待审核', `${submissions.pending || 0} 个`, calculatePercent(submissions.pending, submissions.total)],
    ['已通过', `${submissions.approved || 0} 个`, calculatePercent(submissions.approved, submissions.total)],
    ['已拒绝', `${submissions.rejected || 0} 个`, calculatePercent(submissions.rejected, submissions.total)],
    ['总计', `${submissions.total || 0} 个`, '100%']
  ]));
  children.push(new Paragraph({ text: '' }));

  // 积分排名前十
  if (topTeams.length > 0) {
    children.push(createHeading('3. 小队积分排行榜 TOP 10', HeadingLevel.HEADING_2));
    const rows = [['排名', '小队名称', '积分']];
    topTeams.slice(0, 10).forEach((team: any, index: number) => {
      rows.push([`第${index + 1}名`, team.name, `${team.points} 分`]);
    });
    children.push(createSimpleTable(rows));
    children.push(new Paragraph({ text: '' }));
  }

  // 分析建议
  children.push(createHeading('二、分析与建议', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ text: '' }));
  
  const analysis = generateOverviewAnalysis(data);
  children.push(...analysis);
}

function generateTeamsContent(children: any[], data: any) {
  const teams = data?.teams || [];
  const total = data?.total || 0;
  const byCycle = data?.byCycle || {};

  children.push(createHeading('一、小队概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['统计项', '数值'],
    ['小队总数', `${total} 支`],
    ['第一周期小队', `${byCycle[1] || 0} 支`],
    ['第二周期小队', `${byCycle[2] || 0} 支`],
    ['第三周期小队', `${byCycle[3] || 0} 支`]
  ]));
  children.push(new Paragraph({ text: '' }));

  // 积分排行
  children.push(createHeading('二、积分排行 TOP 20', HeadingLevel.HEADING_1));
  const rows = [['排名', '小队名称', '周期', '积分', '当前主题']];
  teams.slice(0, 20).forEach((team: any, index: number) => {
    rows.push([
      `${index + 1}`,
      team.name,
      `第${team.cycle}周期`,
      `${team.points} 分`,
      team.currentTheme || '未选择'
    ]);
  });
  children.push(createSimpleTable(rows));
  children.push(new Paragraph({ text: '' }));
}

function generateTasksContent(children: any[], data: any) {
  const total = data?.total || 0;
  const byTheme = data?.byTheme || {};

  children.push(createHeading('一、任务概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['统计项', '数值'],
    ['任务总数', `${total} 个`],
    ['主题数量', `${Object.keys(byTheme).length} 个`]
  ]));
  children.push(new Paragraph({ text: '' }));

  // 按主题统计
  children.push(createHeading('二、按主题统计', HeadingLevel.HEADING_1));
  const themeRows = [['主题名称', '任务数', '完成数', '完成率']];
  Object.entries(byTheme).forEach(([theme, stats]: [string, any]) => {
    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    themeRows.push([theme, `${stats.total} 个`, `${stats.completed} 个`, `${completionRate}%`]);
  });
  children.push(createSimpleTable(themeRows));
  children.push(new Paragraph({ text: '' }));
}

function generateSubmissionsContent(children: any[], data: any) {
  const pending = data?.pending || 0;
  const approved = data?.approved || 0;
  const rejected = data?.rejected || 0;
  const total = data?.total || 0;
  const recent = data?.recent || [];

  children.push(createHeading('一、产出审核概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['状态', '数量', '占比'],
    ['待审核', `${pending} 个`, calculatePercent(pending, total)],
    ['已通过', `${approved} 个`, calculatePercent(approved, total)],
    ['已拒绝', `${rejected} 个`, calculatePercent(rejected, total)],
    ['总计', `${total} 个`, '100%']
  ]));
  children.push(new Paragraph({ text: '' }));

  const passRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  children.push(
    new Paragraph({
      text: `整体审核通过率：${passRate}%`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 200 }
    })
  );

  if (recent.length > 0) {
    children.push(createHeading('二、最近提交记录', HeadingLevel.HEADING_1));
    const rows = [['小队', '任务', '状态', '提交时间']];
    recent.forEach((item: any) => {
      rows.push([
        item.teamName || '未知',
        item.taskTitle || '未知',
        getStatusText(item.status),
        formatDate(item.createdAt)
      ]);
    });
    children.push(createSimpleTable(rows));
    children.push(new Paragraph({ text: '' }));
  }
}

function generateSchoolsContent(children: any[], data: any) {
  const total = data?.total || 0;
  const schools = data?.schools || [];

  children.push(createHeading('一、学校概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['统计项', '数值'],
    ['学校总数', `${total} 所`]
  ]));
  children.push(new Paragraph({ text: '' }));

  children.push(createHeading('二、学校详细信息', HeadingLevel.HEADING_1));
  const rows = [['学校名称', '地区', '小队数量']];
  schools.forEach((school: any) => {
    rows.push([school.name || '未命名', school.region || '未知', `${school.teamCount || 0} 支`]);
  });
  children.push(createSimpleTable(rows));
  children.push(new Paragraph({ text: '' }));
}

function generateVolunteersContent(children: any[], data: any) {
  const total = data?.total || 0;
  const volunteers = data?.volunteers || [];

  children.push(createHeading('一、志愿者概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['统计项', '数值'],
    ['志愿者总数', `${total} 人`]
  ]));
  children.push(new Paragraph({ text: '' }));

  children.push(createHeading('二、志愿者详细信息', HeadingLevel.HEADING_1));
  const rows = [['姓名', '指导小队数', '加入时间']];
  volunteers.forEach((vol: any) => {
    rows.push([vol.name || '未知', `${vol.teamCount || 0} 支`, formatDate(vol.joinedAt)]);
  });
  children.push(createSimpleTable(rows));
  children.push(new Paragraph({ text: '' }));
}

function generateRewardsContent(children: any[], data: any) {
  const total = data?.total || 0;
  const byType = data?.byType || {};
  const topRewards = data?.topRewards || [];
  const totalEarned = data?.totalEarned || 0;

  children.push(createHeading('一、激励概况', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['统计项', '数值'],
    ['激励总数', `${total} 个`],
    ['已发放总数', `${totalEarned} 次`],
    ['激励类型', `${Object.keys(byType).length} 种`]
  ]));
  children.push(new Paragraph({ text: '' }));

  children.push(createHeading('二、按类型统计', HeadingLevel.HEADING_1));
  const typeRows = [['类型', '数量']];
  Object.entries(byType).forEach(([type, count]) => {
    typeRows.push([type, `${count} 个`]);
  });
  children.push(createSimpleTable(typeRows));
  children.push(new Paragraph({ text: '' }));

  if (topRewards.length > 0) {
    children.push(createHeading('三、热门激励排行', HeadingLevel.HEADING_1));
    const rows = [['排名', '激励名称', '类型', '积分', '发放次数']];
    topRewards.slice(0, 10).forEach((reward: any, index: number) => {
      rows.push([`${index + 1}`, reward.name || '未知', reward.type || '其他', `${reward.points || 0}`, `${reward.earnCount || 0}`]);
    });
    children.push(createSimpleTable(rows));
    children.push(new Paragraph({ text: '' }));
  }
}

function generateComprehensiveContent(children: any[], data: any) {
  const overview = data?.overview || {};
  const teams = data?.teams || {};
  const submissions = data?.submissions || {};
  const schools = data?.schools || {};
  const rewards = data?.rewards || {};

  // 执行摘要
  children.push(createHeading('执行摘要', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ text: '' }));
  
  const summary = [
    `平台当前共有 ${overview.summary?.totalSchools || 0} 所学校参与，${overview.summary?.totalTeams || 0} 支小队注册，${overview.summary?.totalVolunteers || 0} 位志愿者参与指导。`,
    `小队总积分排名前三依次为：${(overview.topTeams || []).slice(0, 3).map((t: any) => t.name).join('、')}。`,
    `产出审核方面，共有 ${submissions.total || 0} 份产出，其中待审核 ${submissions.pending || 0} 份，通过率约 ${submissions.total > 0 ? Math.round((submissions.approved / submissions.total) * 100) : 0}%。`,
    `激励系统已配置 ${rewards.total || 0} 种激励物品，累计发放 ${rewards.totalEarned || 0} 次。`
  ];

  summary.forEach(text => {
    children.push(new Paragraph({ text, spacing: { after: 150 } }));
  });
  children.push(new Paragraph({ text: '' }));

  // 各模块详细数据
  children.push(createHeading('一、平台数据总览', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['指标', '数值'],
    ['学校数量', `${overview.summary?.totalSchools || 0} 所`],
    ['小队数量', `${overview.summary?.totalTeams || 0} 支`],
    ['志愿者数量', `${overview.summary?.totalVolunteers || 0} 人`],
    ['主题数量', `${overview.summary?.totalThemes || 0} 个`],
    ['工具数量', `${overview.summary?.totalTools || 0} 个`],
    ['技能数量', `${overview.summary?.totalSkills || 0} 个`],
    ['激励数量', `${overview.summary?.totalRewards || 0} 个`],
    ['今日活跃小队', `${overview.summary?.todayActiveTeams || 0} 支`]
  ]));
  children.push(new Paragraph({ text: '' }));

  // 产出审核分析
  children.push(createHeading('二、产出审核分析', HeadingLevel.HEADING_1));
  children.push(createMetricsTable([
    ['状态', '数量', '占比'],
    ['待审核', `${submissions.pending || 0}`, calculatePercent(submissions.pending, submissions.total)],
    ['已通过', `${submissions.approved || 0}`, calculatePercent(submissions.approved, submissions.total)],
    ['已拒绝', `${submissions.rejected || 0}`, calculatePercent(submissions.rejected, submissions.total)],
    ['总计', `${submissions.total || 0}`, '100%']
  ]));
  children.push(new Paragraph({ text: '' }));

  // 积分排行
  if ((overview.topTeams || []).length > 0) {
    children.push(createHeading('三、小队积分排行 TOP 10', HeadingLevel.HEADING_1));
    const rows = [['排名', '小队名称', '积分']];
    (overview.topTeams || []).slice(0, 10).forEach((team: any, index: number) => {
      rows.push([`${index + 1}`, team.name, `${team.points} 分`]);
    });
    children.push(createSimpleTable(rows));
    children.push(new Paragraph({ text: '' }));
  }

  // 建议
  children.push(createHeading('四、优化建议', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ text: '' }));

  const suggestions = generateComprehensiveSuggestions(data);
  suggestions.forEach((suggestion, index) => {
    children.push(new Paragraph({ text: `${index + 1}. ${suggestion}`, spacing: { after: 150 } }));
  });
}

function generateCustomContent(children: any[], data: any) {
  children.push(createHeading('数据详情', HeadingLevel.HEADING_1));
  children.push(
    new Paragraph({
      text: JSON.stringify(data, null, 2),
      spacing: { after: 200 }
    })
  );
}

// ============ 辅助函数 ============

function createHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 300, after: 200 }
  });
}

function createSimpleTable(rows: string[][]): Table {
  const tableRows = rows.map((cells, index) => {
    const isHeader = index === 0;
    return new TableRow({
      children: cells.map(text => {
        const para = new Paragraph({ text });
        return new TableCell({
          children: [para],
          shading: isHeader ? { fill: 'E5E7EB' } : undefined
        });
      })
    });
  });

  return new Table({
    width: { size: 90, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

function createMetricsTable(rows: string[][]): Table {
  return createSimpleTable(rows);
}

function createInfoTable(rows: string[][]): Table {
  const tableRows = rows.map(([label, value]) => {
    const labelPara = new Paragraph({ text: label });
    const valuePara = new Paragraph({ text: value });
    return new TableRow({
      children: [
        new TableCell({
          children: [labelPara],
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: 'F3F4F6' }
        }),
        new TableCell({
          children: [valuePara],
          width: { size: 70, type: WidthType.PERCENTAGE }
        })
      ]
    });
  });

  return new Table({
    width: { size: 80, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

function calculatePercent(value: number, total: number): string {
  if (!total || total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '未知';
  return dateStr.split('T')[0];
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝'
  };
  return statusMap[status] || status;
}

function getReportTypeName(type: string): string {
  const typeMap: Record<string, string> = {
    overview: '平台概览',
    dashboard: '数据面板',
    teams: '小队管理',
    tasks: '任务管理',
    submissions: '产出审核',
    schools: '项目学校',
    volunteers: '志愿者',
    rewards: '激励配置',
    comprehensive: '综合分析',
    custom: '自定义报告'
  };
  return typeMap[type] || type;
}

function getRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    volunteer: '志愿者',
    teacher: '助学老师'
  };
  return roleMap[role] || role;
}

function generateOverviewAnalysis(data: any): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const summary = data?.summary || {};
  const submissions = data?.submissions || {};

  const activeRate = summary.totalTeams > 0 
    ? Math.round((summary.todayActiveTeams / summary.totalTeams) * 100) 
    : 0;
  
  paragraphs.push(createHeading('1. 小队活跃度分析', HeadingLevel.HEADING_2));
  
  if (activeRate >= 50) {
    paragraphs.push(new Paragraph({ text: `今日活跃率为 ${activeRate}%，整体活跃度较高。小队参与积极性良好。`, spacing: { after: 150 } }));
  } else if (activeRate >= 20) {
    paragraphs.push(new Paragraph({ text: `今日活跃率为 ${activeRate}%，活跃度一般。建议通过消息提醒等方式鼓励更多小队参与。`, spacing: { after: 150 } }));
  } else {
    paragraphs.push(new Paragraph({ text: `今日活跃率为 ${activeRate}%，活跃度偏低。建议加强激励措施或增加互动活动。`, spacing: { after: 150 } }));
  }

  paragraphs.push(createHeading('2. 产出审核分析', HeadingLevel.HEADING_2));

  if (submissions.pending > 10) {
    paragraphs.push(new Paragraph({ text: `当前有 ${submissions.pending} 份产出待审核，建议及时处理以保持小队积极性。`, spacing: { after: 150 } }));
  } else if (submissions.pending > 0) {
    paragraphs.push(new Paragraph({ text: `当前有 ${submissions.pending} 份产出待审核，审核工作有序进行。`, spacing: { after: 150 } }));
  } else {
    paragraphs.push(new Paragraph({ text: `当前无待审核产出，审核工作已全部完成。`, spacing: { after: 150 } }));
  }

  paragraphs.push(createHeading('3. 整体建议', HeadingLevel.HEADING_2));

  const suggestions = [
    '持续关注小队活跃度，通过消息系统和激励机制保持参与度',
    '及时审核小队产出，给予反馈以提升学习效果',
    '定期分析各主题任务完成情况，优化任务设计',
    '关注积分排行靠后的小队，必要时提供额外指导'
  ];

  suggestions.forEach((suggestion, index) => {
    paragraphs.push(new Paragraph({ text: `${index + 1}. ${suggestion}`, spacing: { after: 100 } }));
  });

  return paragraphs;
}

function generateComprehensiveSuggestions(data: any): string[] {
  const suggestions: string[] = [];
  const overview = data?.overview || {};
  const submissions = data?.submissions || {};

  const activeRate = overview.summary?.totalTeams > 0 
    ? Math.round((overview.summary?.todayActiveTeams / overview.summary?.totalTeams) * 100) 
    : 0;
  
  if (activeRate < 30) {
    suggestions.push('建议开展线上或线下活动提升小队活跃度');
  }

  if ((submissions.pending || 0) > 10) {
    suggestions.push('建议增派审核人员或优化审核流程，提高审核效率');
  }

  if ((data?.rewards?.totalEarned || 0) < (overview.summary?.totalTeams || 0) * 2) {
    suggestions.push('建议增加激励物品发放频率，鼓励小队完成任务');
  }

  const cycle2Count = data?.teams?.byCycle?.[2] || 0;
  if (cycle2Count > 0) {
    suggestions.push(`已有 ${cycle2Count} 支小队进入第二周期，建议关注其主题选择和学习进度`);
  }

  if (suggestions.length === 0) {
    suggestions.push('平台运营状态良好，建议继续保持当前节奏');
    suggestions.push('定期回顾数据指标，持续优化用户体验');
  }

  return suggestions;
}

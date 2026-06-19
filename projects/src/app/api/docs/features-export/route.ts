import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} from 'docx';

/**
 * 功能文档 Word 导出 API
 * 生成平台功能文档 Word 版本（详细版）
 */

// 创建标题段落
function createTitleParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 48,
        font: 'Microsoft YaHei',
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  });
}

// 创建副标题段落
function createSubtitleParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 24,
        color: '666666',
        font: 'Microsoft YaHei',
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  });
}

// 创建一级标题
function createH1Paragraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 36,
        font: 'Microsoft YaHei',
      }),
    ],
    spacing: { before: 600, after: 300 },
  });
}

// 创建二级标题
function createH2Paragraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        font: 'Microsoft YaHei',
      }),
    ],
    spacing: { before: 400, after: 200 },
  });
}

// 创建三级标题
function createH3Paragraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: 'Microsoft YaHei',
      }),
    ],
    spacing: { before: 300, after: 150 },
  });
}

// 创建普通段落
function createParagraph(text: string, indent: boolean = false): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 22,
        font: 'Microsoft YaHei',
      }),
    ],
    spacing: { after: 150 },
    indent: indent ? { left: 400 } : undefined,
  });
}

// 创建列表项
function createListItem(text: string, level: number = 1): Paragraph {
  const indent = level * 400;
  const bullets = ['•', '◦', '▪'];
  return new Paragraph({
    children: [
      new TextRun({
        text: `${bullets[level - 1] || '•'} ${text}`,
        size: 22,
        font: 'Microsoft YaHei',
      }),
    ],
    spacing: { after: 100 },
    indent: { left: indent },
  });
}

// 创建表格
function createTable(headers: string[], rows: string[][], width: number = 100): Table {
  return new Table({
    width: { size: width, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(header => 
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({
                text: header,
                bold: true,
                size: 20,
                font: 'Microsoft YaHei',
              })],
            })],
            shading: { fill: 'E8E8E8' },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
            },
          })
        ),
      }),
      ...rows.map(row => 
        new TableRow({
          children: row.map(cell => 
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({
                  text: cell,
                  size: 20,
                  font: 'Microsoft YaHei',
                })],
              })],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
              },
            })
          ),
        })
      ),
    ],
  });
}

// 创建空行
function createEmptyLine(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', size: 22 })],
    spacing: { after: 100 },
  });
}

// 生成文档
async function generateFeaturesDocument() {
  const children: (Paragraph | Table)[] = [];
  
  // 标题
  children.push(createTitleParagraph('STEM 教育管理平台'));
  children.push(createTitleParagraph('功能文档（详细版）'));
  children.push(createSubtitleParagraph('版本 2025.04'));
  children.push(createEmptyLine());
  
  // ========== 一、项目概览 ==========
  children.push(createH1Paragraph('一、项目概览'));
  children.push(createParagraph('基于 Next.js 的 STEM 教育管理平台，支持小队任务管理、技能学习、工具配置、激励系统、积分借贷、积分转账、最后任务反馈表单及反馈信息管理。'));
  children.push(createEmptyLine());

  // ========== 二、技术架构 ==========
  children.push(createH1Paragraph('二、技术架构'));
  children.push(createTable(
    ['类别', '技术栈'],
    [
      ['框架', 'Next.js 16 (App Router)'],
      ['UI库', 'React 19 + TypeScript 5'],
      ['组件库', 'shadcn/ui (Radix UI)'],
      ['样式', 'Tailwind CSS 4'],
      ['数据库', 'Supabase (PostgreSQL)'],
      ['AI集成', 'coze-coding-dev-sdk'],
      ['导出', 'docx (Word文档生成)'],
    ]
  ));
  children.push(createEmptyLine());

  // ========== 三、管理员端功能 ==========
  children.push(createH1Paragraph('三、管理员端功能'));
  
  // 3.1 登录与权限
  children.push(createH2Paragraph('3.1 登录与权限'));
  children.push(createParagraph('路由: /admin/login'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['登录方式', '账号 + 密码'],
      ['角色类型', 'super_admin(超级管理员)、teacher(助学老师)、volunteer(志愿者)'],
      ['密码安全', 'SHA-256 + 盐值哈希'],
      ['权限控制', '基于 role_permissions 表的模块级权限控制'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.2 仪表盘
  children.push(createH2Paragraph('3.2 仪表盘'));
  children.push(createParagraph('路由: /admin/dashboard'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['数据概览', '学校数量、志愿者数量、小队数量、学生总数'],
      ['任务统计', '总任务数、进行中、已完成'],
      ['积分排名', '小队积分排行榜（可按周期筛选）'],
      ['最新动态', '最近活动时间线'],
      ['快捷入口', '快速跳转到各管理模块'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.3 小队管理
  children.push(createH2Paragraph('3.3 小队管理'));
  children.push(createParagraph('路由: /admin/teams、/admin/teams/[id]'));
  children.push(createH3Paragraph('列表页功能'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['筛选条件', '按学校、按志愿者、按周期、按状态'],
      ['排序', '按积分、按周期、按创建时间'],
      ['批量操作', '启用/禁用小队'],
      ['导出功能', '导出小队列表'],
    ]
  ));
  children.push(createH3Paragraph('详情页功能'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['基础信息', '小队名称、口号、规则、创建时间'],
      ['成员管理', '查看/添加/编辑/删除成员'],
      ['角色分配', '指引者(guider)、光影法师(light_mage)、秘语学者(secret_scholar)'],
      ['周期进度', '当前周期、已完成主题数'],
      ['当前任务', '任务标题、阶段、截止日期'],
      ['积分记录', '积分余额、积分变动历史'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.4 任务管理
  children.push(createH2Paragraph('3.4 任务管理'));
  children.push(createParagraph('路由: /admin/tasks、/admin/tasks/[id]'));
  children.push(createH3Paragraph('任务配置'));
  children.push(createTable(
    ['配置项', '说明'],
    [
      ['任务标题', '任务名称'],
      ['任务描述', '详细的任务说明'],
      ['关联主题', '属于哪个探索主题'],
      ['任务阶段', '多阶段任务的第几阶段'],
      ['总阶段数', '该主题的总任务阶段数'],
      ['积分奖励', '完成任务获得的积分'],
      ['截止日期', '任务截止时间'],
      ['必学技能', '任务要求的技能'],
      ['工具配置', '任务需要的工具'],
      ['激励物品', '任务奖励的物品'],
      ['提示词', '任务提示信息'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.5 主题管理
  children.push(createH2Paragraph('3.5 主题管理'));
  children.push(createParagraph('路由: /admin/task'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['主题列表', '显示所有主题及图标'],
      ['选择统计', '各主题被选择的小队数量'],
      ['专属配置', '全局主题/专属主题(is_exclusive)'],
      ['任务关联', '主题下关联的任务列表'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.6 产出审核
  children.push(createH2Paragraph('3.6 产出审核'));
  children.push(createParagraph('路由: /admin/submissions'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['状态筛选', '全部、待审核、已通过、已拒绝'],
      ['审核操作', '通过、拒绝、要求修改'],
      ['产出评价', '60分制评分（任务一致性20分、作品质量30分、按时提交10分）'],
      ['点赞管理', '给产出点赞（每点赞+5积分）'],
      ['查看详情', '查看提交的文本、图片、文件'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.7 项目学校
  children.push(createH2Paragraph('3.7 项目学校'));
  children.push(createParagraph('路由: /admin/schools'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['学校列表', '显示所有学校及地区'],
      ['地区统计', '各地区学校分布'],
      ['小队数量', '每个学校下的小队数量'],
      ['志愿者关联', '学校关联的志愿者'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.8 志愿者管理
  children.push(createH2Paragraph('3.8 志愿者管理'));
  children.push(createParagraph('路由: /admin/volunteers'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['志愿者信息', '姓名、联系方式、账号状态'],
      ['指导小队', '志愿者创建/指导的小队列表'],
      ['关联学校', '志愿者负责的学校'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.9 工具管理
  children.push(createH2Paragraph('3.9 工具管理'));
  children.push(createParagraph('路由: /admin/tools'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['工具分类', '工具所属分类'],
      ['使用统计', '各工具被使用的次数'],
      ['工具详情', '工具名称、描述、图标'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.10 技能学习
  children.push(createH2Paragraph('3.10 技能学习'));
  children.push(createParagraph('路由: /admin/skills'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['技能分类', '按类别组织技能'],
      ['学习进度', '小队对各技能的学习进度'],
      ['完成记录', '已完成/进行中的学习记录'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.11 激励配置
  children.push(createH2Paragraph('3.11 激励配置'));
  children.push(createParagraph('路由: /admin/rewards'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['物品管理', '物品名称、图标、描述、所需积分'],
      ['主题专属', '可配置专属主题的激励'],
      ['全局激励', '所有小队可用'],
      ['发放统计', '各物品的发放数量'],
      ['库存管理', '物品库存数量'],
      ['热门排行', '按兑换次数排序'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.12 消息管理
  children.push(createH2Paragraph('3.12 消息管理'));
  children.push(createParagraph('路由: /admin/messages'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['消息统计', '总消息数、各小队消息数'],
      ['未读提醒', '未读消息数量'],
      ['发送消息', '向指定小队/所有小队发送'],
      ['消息模板', '预设消息模板'],
      ['定时发送', '设置发送时间'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.13 反馈查看
  children.push(createH2Paragraph('3.13 反馈查看'));
  children.push(createParagraph('路由: /admin/feedback'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['反馈列表', '小队提交的所有反馈'],
      ['分类统计', '按主题、按类型统计'],
      ['关键词提取', '反馈中的高频关键词'],
      ['Word导出', '导出反馈报告为Word文档'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.14 最后任务管理
  children.push(createH2Paragraph('3.14 最后任务管理'));
  children.push(createParagraph('路由: /admin/final-tasks'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['任务配置', '最后任务的设置'],
      ['表单管理', '反馈表单配置'],
      ['角色表单', '按成员角色配置不同表单'],
      ['通用表单', '所有角色通用的表单'],
      ['表单字段', '文本、文本域、单选、多选、评分、文件上传'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.15 学生前测
  children.push(createH2Paragraph('3.15 学生前测'));
  children.push(createParagraph('路由: /admin/pretest'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['题目管理', '添加、编辑、删除、排序题目'],
      ['题目类型', '单选题、多选题、文本题、评分题'],
      ['激活控制', '启用/禁用题目'],
      ['统计面板', '总题目数、已激活数、回答总数、已完成小队、待完成小队'],
    ]
  ));
  children.push(createH3Paragraph('题目类型详细说明'));
  children.push(createTable(
    ['类型', '说明', '配置项'],
    [
      ['单选题', '只能选择一个选项', '选项列表(label/value)'],
      ['多选题', '可以选择多个选项', '选项列表(label/value)'],
      ['文本题', '自由文本输入', '占位提示'],
      ['评分题', '1-5分评分', '最大分值'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.16 权限管理
  children.push(createH2Paragraph('3.16 权限管理'));
  children.push(createParagraph('路由: /admin/settings'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['角色列表', '显示所有角色及权限'],
      ['模块配置', '各角色可访问的模块'],
      ['权限矩阵', '角色×模块的权限表格'],
      ['模块列表', '模块名称、路由、图标'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.17 个人中心
  children.push(createH2Paragraph('3.17 个人中心'));
  children.push(createParagraph('路由: /admin/profile'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['个人信息', '姓名、账号、角色'],
      ['修改密码', '密码修改功能'],
    ]
  ));
  children.push(createEmptyLine());

  // 3.18 蜡象助手
  children.push(createH2Paragraph('3.18 蜡象助手 (智能体)'));
  children.push(createParagraph('路由: 内置于管理后台（侧边栏入口）'));
  children.push(createH3Paragraph('能力矩阵'));
  children.push(createTable(
    ['能力', '说明', '使用场景'],
    [
      ['数据洞察', '实时查询各模块数据', '"查看当前积分最高的小队"'],
      ['关系分析', '理解数据归属关系', '"阳光小队属于哪个志愿者"'],
      ['趋势预测', '预测数据变动', '"哪些小队可能逾期"'],
      ['消息代理', '直接发送消息', '"通知阳光小队尽快提交"'],
      ['产出评价', '评价小队产出', '"评价阳光小队的主题一产出"'],
      ['报告生成', '生成Word分析报告', '"生成一份小队分析报告"'],
    ]
  ));
  children.push(createH3Paragraph('产出评价维度（60分制）'));
  children.push(createTable(
    ['维度', '分值', '说明'],
    [
      ['任务一致性', '20分', '产出是否体现了任务要求的内容'],
      ['作品质量', '30分', '完整度、创意、用心程度'],
      ['按时提交', '10分', '是否在截止日期前提交'],
    ]
  ));
  children.push(createEmptyLine());

  // ========== 四、小队端功能 ==========
  children.push(createH1Paragraph('四、小队端功能'));

  // 4.1 登录
  children.push(createH2Paragraph('4.1 登录'));
  children.push(createParagraph('路由: /team/login'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['登录方式', '小队编码 + 密码'],
      ['记住登录', 'localStorage 存储登录状态'],
      ['修改密码', '首次登录后修改密码'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.2 Dashboard
  children.push(createH2Paragraph('4.2 Dashboard (仪表盘)'));
  children.push(createParagraph('路由: /team/dashboard'));
  children.push(createH3Paragraph('显示区域'));
  children.push(createTable(
    ['区域', '显示条件', '说明'],
    [
      ['小队信息卡片', '始终显示', '队名、口号、积分'],
      ['消息提醒', '有未读消息时', '未读消息数量徽章'],
      ['当前任务', '有进行中任务', '任务标题、阶段进度、截止日期'],
      ['前测问卷', '组队完成且未填写', '组队后首个任务，完成+10积分'],
      ['探索主题', '未选择主题且已完成前测', '选择探索主题'],
      ['同志役者小队', '有其他小队', '查看其他小队进度'],
      ['已完成主题', '有已完成的主题', '归档数据展示'],
    ]
  ));
  children.push(createH3Paragraph('前测问卷显示规则'));
  children.push(createParagraph('显示条件：'));
  children.push(createListItem('小队已设置口号 (slogan 不为空)'));
  children.push(createListItem('小队已添加成员 (members.length > 0)'));
  children.push(createListItem('未完成前测 (has_completed_pretest = false)'));
  children.push(createListItem('未选择主题 (current_theme_id = null)'));
  children.push(createParagraph('隐藏条件（满足任一）：'));
  children.push(createListItem('已提交前测问卷'));
  children.push(createListItem('已选择探索主题'));
  children.push(createListItem('进入新周期后（has_completed_pretest 始终为 true）'));
  children.push(createEmptyLine());

  // 4.3 小队信息
  children.push(createH2Paragraph('4.3 小队信息'));
  children.push(createParagraph('路由: /team/dashboard (内嵌编辑区)'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['编辑队名', '修改小队名称'],
      ['设置口号', '小队口号/标语'],
      ['编写规则', '小队内部规则'],
      ['成员管理', '添加、编辑、删除成员'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.4 成员管理
  children.push(createH2Paragraph('4.4 成员管理'));
  children.push(createParagraph('路由: /team/members'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['成员列表', '显示所有成员及状态'],
      ['添加成员', '姓名、角色、简介'],
      ['编辑成员', '修改成员信息'],
      ['删除成员', '移除成员'],
      ['角色分配', 'guider(指引者)、light_mage(光影法师)、secret_scholar(秘语学者)'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.5 技能学习
  children.push(createH2Paragraph('4.5 技能学习'));
  children.push(createParagraph('路由: /team/learning'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['技能分类', '按类别浏览技能'],
      ['技能详情', '学习内容说明'],
      ['学习进度', '必学技能/已完成技能'],
      ['关联任务', '该技能关联的任务'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.6 任务列表
  children.push(createH2Paragraph('4.6 任务列表'));
  children.push(createParagraph('路由: /team/tasks'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['当前主题', '显示当前主题及进度'],
      ['阶段展示', '当前阶段/总阶段数'],
      ['任务列表', '阶段内的任务列表'],
      ['截止日期', '显示剩余时间'],
      ['侧边任务', '非主线任务入口'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.7 任务详情
  children.push(createH2Paragraph('4.7 任务详情'));
  children.push(createParagraph('路由: /team/task/[id]'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['任务要求', '详细的任务描述'],
      ['必学技能', '完成任务需要的技能'],
      ['工具配置', '需要的工具清单'],
      ['激励预览', '完成任务可获得的奖励'],
      ['产出提交', '提交文本/图片/文件'],
      ['反馈表单', '最后任务的反馈表单入口'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.8 产出上传
  children.push(createH2Paragraph('4.8 产出上传'));
  children.push(createParagraph('路由: /team/submit'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['提交类型', '文本、图片、文件'],
      ['提交状态', '草稿、已提交、已通过、已拒绝'],
      ['修改提交', '被拒绝后可重新提交'],
      ['查看历史', '历史提交记录'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.9 激励中心
  children.push(createH2Paragraph('4.9 激励中心'));
  children.push(createParagraph('路由: /team/rewards'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['积分余额', '当前可用积分'],
      ['物品列表', '可兑换的激励物品'],
      ['兑换记录', '历史兑换记录'],
      ['积分明细', '积分增减历史'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.10 积分借贷
  children.push(createH2Paragraph('4.10 积分借贷'));
  children.push(createParagraph('路由: /team/borrow'));
  children.push(createH3Paragraph('借贷流程'));
  children.push(createParagraph('发起借贷 → 选择出借方 → 设置条件 → 等待确认 → 积分到账 → 按期归还'));
  children.push(createH3Paragraph('功能详情'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['发起借贷', '选择小队、填写积分、设置利率'],
      ['利率设置', '日利率/周利率/月利率'],
      ['逾期利率', '逾期后的日利率'],
      ['归还日期', '设置最晚归还日期'],
      ['利息计算', '系统自动计算利息'],
      ['状态管理', '待确认→已借出→已归还/已逾期'],
      ['归还功能', '一键归还本金+利息'],
    ]
  ));
  children.push(createH3Paragraph('利息计算公式'));
  children.push(createParagraph('应还积分 = 本金 + 本金 × (利率/100) × 借款天数'));
  children.push(createParagraph('逾期利息 = 本金 × (逾期利率/100) × 逾期天数'));
  children.push(createParagraph('总应还 = 应还积分 + 逾期利息'));
  children.push(createH3Paragraph('借贷规则'));
  children.push(createTable(
    ['规则', '说明'],
    [
      ['借贷范围', '只能向同志役者下的其他小队借贷'],
      ['积分限制', '借贷积分 ≤ 出借方当前积分'],
      ['日期限制', '归还日期必须晚于今天'],
      ['利率限制', '利率 0-100%'],
      ['状态管理', '待确认可取消、已借出需归还'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.11 积分转账
  children.push(createH2Paragraph('4.11 积分转账'));
  children.push(createParagraph('路由: /team/transfer'));
  children.push(createH3Paragraph('转账流程'));
  children.push(createParagraph('选择小队 → 填写积分 → 添加留言 → 确认转账 → 积分到账 → 获得碎片'));
  children.push(createH3Paragraph('功能详情'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['发起转账', '选择接收小队、填写积分'],
      ['留言功能', '可添加转账说明'],
      ['转账记录', '发送记录/接收记录'],
      ['爱心碎片', '每转账1次获得1个碎片'],
      ['宝石合成', '10个碎片自动合成1颗宝石'],
    ]
  ));
  children.push(createH3Paragraph('碎片合成规则'));
  children.push(createParagraph('碎片数量达到10 → 自动合成 → 碎片清零 → 宝石+1'));
  children.push(createH3Paragraph('转账规则'));
  children.push(createTable(
    ['规则', '说明'],
    [
      ['转账范围', '只能向同志役者下的其他小队转账'],
      ['积分限制', '转账积分 ≤ 当前可用积分'],
      ['无利息', '转账不产生利息'],
      ['不可逆', '转账不可撤回'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.12 消息中心
  children.push(createH2Paragraph('4.12 消息中心'));
  children.push(createParagraph('路由: /team/messages'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['消息列表', '按时间倒序显示'],
      ['未读标记', '未读消息高亮显示'],
      ['消息详情', '查看完整消息内容'],
      ['来源显示', '显示发送方（管理员/志愿者）'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.13 学生前测问卷
  children.push(createH2Paragraph('4.13 学生前测问卷'));
  children.push(createParagraph('路由: /team/pretest'));
  children.push(createH3Paragraph('填写流程'));
  children.push(createParagraph('进入问卷 → 选择成员 → 逐题答题 → 统一提交 → 返回选择其他成员'));
  children.push(createH3Paragraph('功能详情'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['成员点选', '成员选择自己名字答题'],
      ['进度追踪', '显示各成员答题进度'],
      ['答题模式', '逐题展示，实时保存'],
      ['统一提交', '当前成员完成所有题目后统一提交'],
      ['积分奖励', '完成前测+10积分'],
    ]
  ));
  children.push(createH3Paragraph('答题规则'));
  children.push(createTable(
    ['规则', '说明'],
    [
      ['成员隔离', '每个成员独立答题'],
      ['进度保存', '答题进度自动保存'],
      ['完成后切换', '成员完成后可切换其他人'],
      ['必填校验', '提交前检查所有必填项'],
    ]
  ));
  children.push(createEmptyLine());

  // 4.14 最后任务反馈
  children.push(createH2Paragraph('4.14 最后任务反馈'));
  children.push(createParagraph('路由: /team/final-task-feedback/[id]'));
  children.push(createH3Paragraph('表单类型'));
  children.push(createTable(
    ['类型', '说明'],
    [
      ['角色专属表单', '按指引者/光影法师/秘语学者配置不同表单'],
      ['通用表单', '所有成员填写相同表单'],
    ]
  ));
  children.push(createH3Paragraph('功能详情'));
  children.push(createTable(
    ['功能', '详细说明'],
    [
      ['成员选择', '选择成员填写表单'],
      ['表单渲染', '支持文本、文本域、单选、多选、评分、文件上传'],
      ['必填校验', '提交前验证必填字段'],
      ['多成员填写', '成员分别填写'],
      ['提交追踪', '显示各成员提交状态'],
    ]
  ));
  children.push(createEmptyLine());

  // ========== 五、核心业务逻辑 ==========
  children.push(createH1Paragraph('五、核心业务逻辑'));

  // 5.1 角色权限
  children.push(createH2Paragraph('5.1 角色权限'));
  children.push(createTable(
    ['角色', '说明', '权限范围'],
    [
      ['super_admin', '超级管理员', '所有模块全部权限'],
      ['teacher', '助学老师', '管理本校小队'],
      ['volunteer', '志愿者', '管理指导的小队'],
    ]
  ));
  children.push(createEmptyLine());

  // 5.2 主题类型
  children.push(createH2Paragraph('5.2 主题类型'));
  children.push(createTable(
    ['类型', '标识', '说明'],
    [
      ['全局主题', 'is_exclusive=false, school_id=null', '所有学校可用'],
      ['专属主题', 'is_exclusive=true, school_id=xxx', '归属特定学校'],
    ]
  ));
  children.push(createEmptyLine());

  // 5.3 任务流程
  children.push(createH2Paragraph('5.3 任务流程'));
  children.push(createListItem('小队选择主题'));
  children.push(createListItem('系统下发第一阶段任务'));
  children.push(createListItem('小队完成学习任务'));
  children.push(createListItem('志愿者/助学老师审核产出'));
  children.push(createListItem('进入下一阶段或完成主题'));
  children.push(createListItem('完成一个主题后，可选择新的探索主题（新周期）'));
  children.push(createEmptyLine());

  // 5.4 任务周期机制
  children.push(createH2Paragraph('5.4 任务周期机制'));
  children.push(createH3Paragraph('核心设计'));
  children.push(createTable(
    ['字段', '表', '说明'],
    [
      ['teams.cycle', 'teams', '小队当前所处周期'],
      ['team_theme_selections', 'team_theme_selections', '每个周期的选择历史'],
    ]
  ));
  children.push(createH3Paragraph('周期选择规则'));
  children.push(createListItem('完成当前主题 → teams.cycle + 1'));
  children.push(createListItem('新周期可选任意主题（无论是否被其他小队选择）'));
  children.push(createListItem('选择新主题后系统下发新周期第一阶段任务'));
  children.push(createListItem('积分和产出记录按周期独立统计'));
  children.push(createEmptyLine());

  // 5.5 激励系统
  children.push(createH2Paragraph('5.5 激励系统'));
  children.push(createH3Paragraph('积分来源'));
  children.push(createTable(
    ['来源', '积分', '说明'],
    [
      ['点赞', '+5/次', '被点赞获得'],
      ['完成任务', '+任务积分', '任务奖励'],
      ['前测完成', '+10', '完成前测问卷'],
    ]
  ));
  children.push(createH3Paragraph('积分消耗'));
  children.push(createTable(
    ['用途', '积分', '说明'],
    [
      ['兑换激励', '-物品积分', '兑换激励物品'],
      ['积分转账', '-转账积分', '转给其他小队'],
      ['积分借贷', '-归还积分', '归还借贷本金+利息'],
    ]
  ));
  children.push(createEmptyLine());

  // 5.6 积分借贷机制
  children.push(createH2Paragraph('5.6 积分借贷机制'));
  children.push(createH3Paragraph('借贷状态'));
  children.push(createTable(
    ['状态', '说明'],
    [
      ['pending', '待确认，借出方尚未处理'],
      ['approved', '已同意，等待归还'],
      ['rejected', '已拒绝'],
      ['repaid', '已归还'],
      ['overdue', '已逾期'],
    ]
  ));
  children.push(createEmptyLine());

  // 5.7 积分转账机制
  children.push(createH2Paragraph('5.7 积分转账机制'));
  children.push(createParagraph('heart_shards: 爱心碎片数量'));
  children.push(createParagraph('heart_gems: 爱心宝石数量'));
  children.push(createParagraph('合成规则：heart_shards >= 10 → heart_gems += 1, heart_shards -= 10'));
  children.push(createEmptyLine());

  // ========== 六、数据表结构 ==========
  children.push(createH1Paragraph('六、数据表结构'));
  children.push(createH3Paragraph('核心业务表'));
  children.push(createTable(
    ['表名', '说明', '关键字段'],
    [
      ['users', '管理员/志愿者/助学老师', 'id, username, password, role, school_id, is_active'],
      ['teams', '小队信息', 'id, code, name, password, points, cycle, has_completed_pretest, current_theme_id, created_by'],
      ['team_members', '小队成员', 'id, team_id, name, role, intro, is_approved'],
      ['task_themes', '探索主题', 'id, name, description, icon, is_exclusive, school_id'],
      ['tasks', '任务', 'id, theme_id, title, stage, total_stages, points, deadline'],
      ['submissions', '产出提交', 'id, team_id, task_id, content, status, likes, score'],
      ['skills', '技能', 'id, name, category, description'],
      ['tools', '工具', 'id, name, category, description'],
      ['rewards', '激励物品', 'id, name, points, stock, is_exclusive, theme_id'],
      ['schools', '学校', 'id, name, region, volunteer_id'],
      ['messages', '消息', 'id, team_id, content, sender_id, is_read'],
      ['pretest_questions', '前测问卷题目', 'id, title, question_type, options(JSON), is_required, is_active'],
      ['pretest_responses', '前测回答记录', 'id, team_id, member_name, question_id, answer'],
      ['borrow_records', '借贷记录', 'id, borrower_id, lender_id, points, interest_rate, status'],
      ['transfer_records', '转账记录', 'id, from_team_id, to_team_id, points'],
    ]
  ));
  children.push(createEmptyLine());

  // ========== 七、API 接口 ==========
  children.push(createH1Paragraph('七、API 接口'));
  
  children.push(createH2Paragraph('7.1 管理端 API'));
  children.push(createTable(
    ['接口', '方法', '说明'],
    [
      ['/api/admin/stats', 'GET', '获取统计数据'],
      ['/api/admin/pretest/questions', 'GET/POST', '题目管理'],
      ['/api/admin/pretest/stats', 'GET', '前测统计'],
      ['/api/admin/feedback', 'GET', '反馈列表'],
      ['/api/admin/feedback/export', 'GET', '导出反馈报告'],
      ['/api/admin/assistant', 'POST', '蜡象助手对话'],
    ]
  ));
  children.push(createEmptyLine());

  children.push(createH2Paragraph('7.2 小队端 API'));
  children.push(createTable(
    ['接口', '方法', '说明'],
    [
      ['/api/team/pretest', 'GET/POST', '前测问卷'],
      ['/api/team/borrow', 'GET/POST', '积分借贷'],
      ['/api/team/borrow/history', 'GET', '借贷记录'],
      ['/api/team/borrow/repay', 'POST', '归还借贷'],
      ['/api/team/transfer', 'GET/POST', '积分转账'],
      ['/api/team/transfer/history', 'GET', '转账记录'],
      ['/api/team/final-task-feedback', 'GET/POST', '最后任务反馈'],
    ]
  ));
  children.push(createEmptyLine());

  children.push(createH2Paragraph('7.3 认证 API'));
  children.push(createTable(
    ['接口', '方法', '说明'],
    [
      ['/api/auth/login', 'POST', '管理员登录'],
      ['/api/auth/team-login', 'POST', '小队登录'],
      ['/api/auth/team-change-password', 'POST', '小队修改密码'],
    ]
  ));
  children.push(createEmptyLine());

  // ========== 八、常用命令 ==========
  children.push(createH1Paragraph('八、常用命令'));
  children.push(createParagraph('安装依赖: pnpm install'));
  children.push(createParagraph('开发模式: pnpm dev'));
  children.push(createParagraph('类型检查: pnpm ts-check'));
  children.push(createParagraph('Lint检查: pnpm lint'));
  children.push(createParagraph('构建: pnpm build'));
  children.push(createParagraph('生产模式: pnpm start'));
  children.push(createEmptyLine());

  // ========== 九、快速诊断 ==========
  children.push(createH1Paragraph('九、快速诊断'));

  children.push(createH2Paragraph('9.1 登录问题诊断'));
  children.push(createParagraph('诊断数据库状态: curl http://localhost:5000/api/diagnostics/db'));
  children.push(createParagraph('初始化测试数据: curl -X POST http://localhost:5000/api/init-users'));
  children.push(createParagraph('初始化测试数据: curl -X POST http://localhost:5000/api/init-teams'));
  children.push(createEmptyLine());

  children.push(createH2Paragraph('9.2 密码迁移'));
  children.push(createParagraph('查询迁移状态: curl http://localhost:5000/api/migrate/all-passwords'));
  children.push(createParagraph('执行迁移: curl -X POST http://localhost:5000/api/migrate/all-passwords'));
  children.push(createEmptyLine());

  children.push(createH2Paragraph('9.3 账号状态修复'));
  children.push(createParagraph('修复所有账号状态: curl -X POST http://localhost:5000/api/migrate/account-status'));
  children.push(createEmptyLine());

  // 创建文档
  const doc = new Document({
    sections: [{
      properties: {},
      children: children as any,
    }],
  });
  
  return await Packer.toBuffer(doc);
}

// 导出 API
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const docBuffer = await generateFeaturesDocument();
    const filename = `STEM_Education_Platform_Features_Detailed_${new Date().toISOString().split('T')[0]}.docx`;

    // 将 Buffer 转换为 Uint8Array
    const uint8Array = new Uint8Array(docBuffer);

    return new NextResponse(uint8Array as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error: any) {
    console.error('[功能文档] 生成失败:', error);
    return safeError(error);
  }
}

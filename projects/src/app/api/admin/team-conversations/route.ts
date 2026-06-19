import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType
} from 'docx';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 小队与银蛇博士对话导出 API
 * 支持 JSON、TXT 和 Word (.docx) 格式导出
 */

// 获取对话记录列表
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const format = searchParams.get('format') || 'json';  // json, txt, docx

    if (!teamId) {
      return ApiErrors.validation('缺少 teamId 参数');
    }

    const client = getSupabaseClient();

    // 获取小队信息
    const { data: team } = await client
      .from('teams')
      .select('id, name, code')
      .eq('id', teamId)
      .single();

    if (!team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 获取小队与银蛇博士的所有对话
    const exactSessionId = `yinhe_team_${teamId}`;
    
    const { data: conversations } = await client
      .from('agent_conversations')
      .select('*')
      .eq('agent_username', 'yinshe_boshi')
      .eq('session_id', exactSessionId)
      .order('created_at', { ascending: true });
    
    const allConversations = conversations || [];

    // 获取对话中涉及的所有图片附件
    const attachments: Array<{
      url: string;
      conversation_index: number;
      role: string;
      context?: string;
    }> = [];

    if (allConversations.length > 0) {
      allConversations.forEach((conv, index) => {
        const urlRegex = /(https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|gif|webp))/gi;
        const matches = conv.content ? conv.content.match(urlRegex) || [] : [];
        
        matches.forEach((url: string) => {
          attachments.push({
            url,
            conversation_index: index + 1,
            role: conv.role,
            context: conv.content.substring(0, 200)
          });
        });

        if (conv.metadata && typeof conv.metadata === 'object') {
          const meta = conv.metadata as any;
          if (meta.images) {
            (Array.isArray(meta.images) ? meta.images : [meta.images]).forEach((imgUrl: string) => {
              attachments.push({
                url: imgUrl,
                conversation_index: index + 1,
                role: conv.role,
                context: conv.content.substring(0, 200)
              });
            });
          }
        }
      });
    }

    // TXT 格式导出
    if (format === 'txt') {
      const txtContent = generateTxtContent(team, allConversations);
      const filename = `yinhe_chat_${team.code}_${new Date().toISOString().split('T')[0]}.txt`;
      return new NextResponse(txtContent, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        }
      });
    }

    // Word 格式导出
    if (format === 'docx') {
      const doc = await generateWordDocument(team, allConversations, attachments);
      const filename = `yinhe_chat_${team.code}_${new Date().toISOString().split('T')[0]}.docx`;
      return new NextResponse(Buffer.from(doc), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        }
      });
    }

    // JSON 格式
    return NextResponse.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          code: team.code
        },
        exportTime: new Date().toISOString(),
        totalMessages: allConversations.length,
        conversations: allConversations.map((c, index) => ({
          index: index + 1,
          role: c.role === 'user' ? team.name : '银蛇博士',
          content: c.content,
          createdAt: c.created_at,
          hasAttachments: attachments.some(a => a.conversation_index === index + 1)
        })),
        attachments
      }
    });
  } catch (error: any) {
    console.error('[对话导出] 获取数据失败:', error);
    return safeError(error);
  }
}

/**
 * 生成 Word 文档
 */
async function generateWordDocument(
  team: { id: string; name: string; code: string },
  conversations: any[],
  attachments: any[]
) {
  // biome-ignore lint/suspicious/noExplicitAny: Word document elements can be Paragraph or Table
  const children: any[] = [];

  // 标题
  children.push(
    new Paragraph({
      text: '银蛇博士对话记录导出',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  // 基本信息表格
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      createInfoRow('小队名称', team.name),
      createInfoRow('小队编码', team.code),
      createInfoRow('导出时间', new Date().toLocaleString('zh-CN')),
      createInfoRow('对话总数', `${conversations.length} 条`),
      createInfoRow('附件图片', `${attachments.length} 张`)
    ]
  });
  children.push(infoTable);
  children.push(new Paragraph({ text: '' }));

  // 分隔线
  children.push(
    new Paragraph({
      text: '────────────────────────────────────────',
      spacing: { before: 200, after: 200 }
    })
  );

  // 按日期分组对话
  const groupedByDate = new Map<string, any[]>();
  conversations.forEach(conv => {
    const date = conv.created_at.split('T')[0];
    if (!groupedByDate.has(date)) {
      groupedByDate.set(date, []);
    }
    groupedByDate.get(date)!.push(conv);
  });

  let messageIndex = 1;
  for (const [date, convs] of groupedByDate) {
    // 日期标题
    children.push(
      new Paragraph({
        text: `【${date}】`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 }
      })
    );

    for (const conv of convs) {
      const roleName = conv.role === 'user' ? team.name : '银蛇博士';
      const time = conv.created_at.split('T')[1].substring(0, 5);
      const roleColor = conv.role === 'user' ? '2563EB' : '059669'; // 蓝色或绿色

      // 对话标题
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${messageIndex}] ${roleName}`,
              bold: true,
              color: roleColor
            }),
            new TextRun({
              text: ` (${time})`,
              color: '6B7280'
            })
          ],
          spacing: { before: 200, after: 50 }
        })
      );

      // 对话内容
      const content = conv.content || '';
      const paragraphs = splitContent(content, 500);
      
      paragraphs.forEach((para) => {
        children.push(
          new Paragraph({
            text: para,
            spacing: { after: 100 },
            indent: { left: 400 }
          })
        );
      });

      // 检查是否有图片附件
      const urlRegex = /(https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|gif|webp))/gi;
      const imageMatches = content.match(urlRegex) || [];
      if (imageMatches.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[包含 ${imageMatches.length} 张图片附件]`,
                color: 'DC2626',
                italics: true
              })
            ],
            spacing: { before: 100, after: 100 }
          })
        );
      }

      children.push(new Paragraph({ text: '' }));
      messageIndex++;
    }
  }

  // 附件列表
  if (attachments.length > 0) {
    children.push(
      new Paragraph({
        text: '────────────────────────────────────────',
        spacing: { before: 300, after: 200 }
      })
    );

    children.push(
      new Paragraph({
        text: '附件图片列表',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 150 }
      })
    );

    attachments.forEach((att, index) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${index + 1}] `,
              bold: true
            }),
            new TextRun({
              text: `第 ${att.conversation_index} 条对话中的图片`
            })
          ],
          spacing: { before: 100, after: 50 }
        })
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: att.url,
              color: '3B82F6'
            })
          ],
          indent: { left: 400 },
          spacing: { after: 50 }
        })
      );
    });
  }

  // 创建文档
  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return Packer.toBuffer(doc);
}

/**
 * 创建信息行
 */
function createInfoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true })]
        })],
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { fill: 'F3F4F6' }
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value })] })],
        width: { size: 70, type: WidthType.PERCENTAGE }
      })
    ]
  });
}

/**
 * 分割长内容
 */
function splitContent(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const paragraphs: string[] = [];
  const parts = content.split(/\n\n+/);
  
  for (const part of parts) {
    if (part.length <= maxLength) {
      paragraphs.push(part);
    } else {
      // 进一步按句子分割
      const sentences = part.match(/[^.!?。！？]+[.!?。！？]*/g) || [part];
      let current = '';
      for (const sentence of sentences) {
        if ((current + sentence).length <= maxLength) {
          current += sentence;
        } else {
          if (current) paragraphs.push(current);
          current = sentence;
        }
      }
      if (current) paragraphs.push(current);
    }
  }

  return paragraphs;
}

/**
 * 生成纯文本格式的对话内容
 */
function generateTxtContent(team: { id: string; name: string; code: string }, conversations: any[]): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(60));
  lines.push('  银蛇博士对话记录导出');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`小队名称：${team.name}`);
  lines.push(`小队编码：${team.code}`);
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`对话总数：${conversations.length} 条`);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');
  
  // 按日期分组
  const groupedByDate = new Map<string, any[]>();
  conversations.forEach(conv => {
    const date = conv.created_at.split('T')[0];
    if (!groupedByDate.has(date)) {
      groupedByDate.set(date, []);
    }
    groupedByDate.get(date)!.push(conv);
  });

  let messageIndex = 1;
  for (const [date, convs] of groupedByDate) {
    lines.push(`【${date}】`);
    lines.push('');
    
    for (const conv of convs) {
      const roleName = conv.role === 'user' ? team.name : '银蛇博士';
      const time = conv.created_at.split('T')[1].substring(0, 5);
      
      lines.push(`[${messageIndex}] ${roleName} (${time})`);
      lines.push('─'.repeat(40));
      
      const content = conv.content || '';
      const truncatedContent = content.length > 1000 
        ? content.substring(0, 1000) + '\n\n[内容过长已截断]'
        : content;
      lines.push(truncatedContent);
      
      const urlRegex = /(https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|gif|webp))/gi;
      const imageMatches = content.match(urlRegex);
      if (imageMatches && imageMatches.length > 0) {
        lines.push('');
        lines.push(`[附件图片 ${imageMatches.length} 张]`);
        imageMatches.forEach((url: string, i: number) => {
          lines.push(`  图片${i + 1}: ${url}`);
        });
      }
      
      lines.push('');
      lines.push('');
      messageIndex++;
    }
  }

  lines.push('═'.repeat(60));
  lines.push('  导出结束');
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

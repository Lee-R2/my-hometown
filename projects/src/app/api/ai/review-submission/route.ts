import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { generateSignedUrl } from '@/lib/storage-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';
import { checkAiRateLimit } from '@/lib/rate-limit';

export const maxDuration = 60;

/**
 * 判断文件类型是否为图片
 * 支持简单标识（"image"）、MIME类型（image/jpeg）、扩展名
 */
function isImageType(typeOrName: string): boolean {
  const t = (typeOrName || '').toLowerCase();
  // 简单标识：数据库中 type 字段可能直接存"image"
  if (t === 'image') return true;
  // MIME类型：image/jpeg, image/png
  if (t.startsWith('image/')) return true;
  // 扩展名判断
  const ext = t.split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return true;
  return false;
}

/**
 * 判断文件类型是否为视频
 * 支持简单标识（"video"）、MIME类型（video/mp4）、扩展名
 */
function isVideoType(typeOrName: string): boolean {
  const t = (typeOrName || '').toLowerCase();
  // 简单标识：数据库中 type 字段可能直接存"video"
  if (t === 'video') return true;
  // MIME类型：video/mp4, video/quicktime
  if (t.startsWith('video/')) return true;
  // 扩展名判断
  const ext = t.split('.').pop() || '';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return true;
  return false;
}

/**
 * 解析 file_urls 中的单个文件项，返回 { url, name, type, category, key }
 */
function parseFileItem(item: any): { url: string; name: string; type: string; category: 'image' | 'video' | 'other'; key: string } | null {
  if (!item) return null;

  // 格式1：纯字符串URL
  if (typeof item === 'string') {
    const isImage = isImageType(item);
    const isVideo = isVideoType(item);
    return {
      url: item,
      name: item.split('/').pop() || 'file',
      type: isImage ? 'image' : isVideo ? 'video' : 'unknown',
      category: isImage ? 'image' : isVideo ? 'video' : 'other',
      key: '',
    };
  }

  // 格式2/3：对象{name, type, url, key?, size?}
  if (typeof item === 'object') {
    const url = item.url || '';
    const key = item.key || '';
    const name = item.name || '文件';
    const typeField = item.type || '';

    // 过滤掉既没有 key 也没有url 的无效记录（type="text" 的空附件）
    if (!key && !url) {
      console.log(`[产出评价] 跳过无效文件记录: type="${typeField}", name="${name}" (无key和url)`);
      return null;
    }

    // 使用兼容性判断：同时支持简单标识("image")和MIME类型("image/jpeg")
    // 还从 name 字段做扩展名兜底
    const isImage = isImageType(typeField) || (!typeField && isImageType(name));
    const isVideo = isVideoType(typeField) || (!typeField && isVideoType(name));

    return {
      url,
      name,
      type: typeField || (isImage ? 'image' : isVideo ? 'video' : 'unknown'),
      category: isImage ? 'image' : isVideo ? 'video' : 'other',
      key,
    };
  }

  return null;
}

/**
 * key 中剥离对象存储桶前缀
 * 部分早期数据 key 包含 "coze_storage_xxx/" 前缀
 * generatePresignedUrl 会自动添加当前环境的桶前缀，导致双重前缀
 *  "coze_storage_7615622311269564450/submissions/xxx.jpg" → "submissions/xxx.jpg"
 */
function stripBucketPrefix(key: string): string {
  if (!key) return key;
  // 匹配 coze_storage_数字/ 前缀（存储桶标识）
  return key.replace(/^coze_storage_\d+\//, '');
}

/**
 * 从URL中提取对象存储的key
 * URL格式: https://domain/bucket/path/to/file.png?sign=...
 * key格式: bucket/path/to/file.png (去掉域名和签名参数)
 */
function extractKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // pathname 形如 /bucket/path/to/file.png，去掉前导/
    const rawKey = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    // 同样剥离桶前缀，避免从过期URL中提取的key带有旧桶前缀
    return stripBucketPrefix(rawKey);
  } catch {
    return '';
  }
}

/**
 * 获取文件的可用URL
 * 1. 优先使用key 生成新鲜签名URL（确保不过期）
 * 2. 如果没有 key，尝试从 URL 中提取key 并生成签名URL
 * 3. 最后尝试原URL（验证是否仍可访问）
 * 4. 以上都失败返回null
 */
async function getAccessibleUrl(parsed: any): Promise<string | null> {
  // 优先使用key 生成新的签名URL（确保不过期）
  // 剥离 key 中可能存在的旧桶前缀，避免generatePresignedUrl 产生双重前缀
  const rawKey = parsed.key || (parsed.url ? extractKeyFromUrl(parsed.url) : '');
  const storageKey = stripBucketPrefix(rawKey);
  
  if (storageKey) {
    try {
      const signedUrl = await generateSignedUrl({
        key: storageKey,
        expireTime: 60 * 60, // 1小时有效期
      });
      // 验证生成的URL是否可访问
      if (signedUrl) {
        try {
          const resp = await fetch(signedUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (resp.ok) return signedUrl;
          console.warn(`[产出评价] 签名URL不可访问(key=${storageKey}, status=${resp.status}), 尝试原始URL`);
        } catch {
          console.warn(`[产出评价] 签名URL访问超时(key=${storageKey}), 尝试原始URL`);
        }
      }
    } catch (err) {
      console.error('[产出评价] 生成签名URL失败:', err);
    }
  }

  // 其次使用原始URL（可能已过期，但作为兜底）
  if (parsed.url) {
    try {
      const resp = await fetch(parsed.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (resp.ok) return parsed.url;
      console.warn(`[产出评价] 原始URL不可访问(status=${resp.status}), 跳过该文件`);
    } catch {
      console.warn('[产出评价] 原始URL访问超时, 跳过该文件');
    }
  }

  return null;
}

/**
 * 银蛇博士产出评价 API（支持多模态）
 * POST /api/ai/review-submission
 * 
 * 请求体
 * { teamId, taskId, submissionId?, cycle? }
 * 
 * 功能：读取小队产出内容和对应任务的要求目标，让银蛇博士给出针对性的评价和建议
 * 多模态：图片通过 image_url 传给LLM，视频通过 video_url 传给LLM
 */
export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_review');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { teamId, taskId, submissionId, cycle } = body;

    if (!teamId || !taskId) {
      return ApiErrors.validation('缺少必要参数');
    }

    const client = getSupabaseClient();

    // 1. 获取小队信息（含当前周期）
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, name, code, school_id, cycle')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 2. 获取任务详情（包含要求和学习目标）
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('id, title, description, requirements, learning_goals, stage, difficulty, points, theme_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return ApiErrors.notFound('任务不存在');
    }

    // 3. 获取主题信息
    let themeName = '未知主题';
    if (task.theme_id) {
      const { data: theme } = await client
        .from('task_themes')
        .select('name')
        .eq('id', task.theme_id)
        .single();
      if (theme) themeName = theme.name;
    }

    // 4. 获取小队提交的产出
    const effectiveCycle = cycle || team.cycle || 1;
    let query = client
      .from('task_submissions')
      .select('id, content, file_urls, status, created_at')
      .eq('team_id', teamId)
      .eq('task_id', taskId)
      .eq('cycle', effectiveCycle)
      .order('created_at', { ascending: false })
      .limit(1);

    if (submissionId) {
      query = query.eq('id', submissionId);
    }

    const { data: submissions, error: subError } = await query;

    if (subError || !submissions || submissions.length === 0) {
      return ApiErrors.notFound('未找到产出记录');
    }

    const submission = submissions[0];

    // 5. 解析文件URL并分类（图片/视频/其他）
    const fileItems: any[] = submission.file_urls || [];
    const parsedFiles = fileItems.map(parseFileItem).filter(Boolean);
    const imageFiles = parsedFiles.filter((f: any) => f.category === 'image');
    const videoFiles = parsedFiles.filter((f: any) => f.category === 'video');
    const otherFiles = parsedFiles.filter((f: any) => f.category === 'other');

    // 获取可访问的URL
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];

    for (const img of imageFiles) {
      const url = await getAccessibleUrl(img);
      if (url) imageUrls.push(url);
    }

    for (const vid of videoFiles) {
      const url = await getAccessibleUrl(vid);
      if (url) videoUrls.push(url);
    }

    // 6. 构建评价提示词
    const difficultyLabel = task.difficulty === 'easy' ? '简单' : task.difficulty === 'hard' ? '困难' : '中等';
    const requirementsList = Array.isArray(task.requirements)
      ? task.requirements
      : typeof task.requirements === 'string'
        ? (() => { try { return JSON.parse(task.requirements); } catch { return [task.requirements]; } })()
        : [];
    const learningGoalsList = Array.isArray(task.learning_goals)
      ? task.learning_goals
      : typeof task.learning_goals === 'string'
        ? (() => { try { return JSON.parse(task.learning_goals); } catch { return [task.learning_goals]; } })()
        : [];

    // 构建附件信息文本（用于系统提示词中的文件说明）
    const attachmentInfo: string[] = [];
    if (imageUrls.length > 0) {
      attachmentInfo.push(`${imageUrls.length}张图片（已发送给银蛇博士查看）`);
    }
    if (videoUrls.length > 0) {
      attachmentInfo.push(`${videoUrls.length}个视频（已发送给银蛇博士查看）`);
    }
    if (otherFiles.length > 0) {
      attachmentInfo.push(`其他附件: ${otherFiles.map((f: any) => f.name).join(', ')}`);
    }

    const systemPrompt = `你是银蛇博士，一位经验丰富的STEM教育导师，专门为乡村小学4-6年级学生提供学习指导。你的风格温暖鼓励、具体细致，善于发现孩子们的闪光点，同时给出可操作的改进建议。
小队刚刚上传了阶段任务的产出，还没有提交给志愿者老师评价。你的角色是帮小队"把关"——检查产出是否完整、有没有可以改进的地方，让小队在正式提交前有机会完善。
## 当前任务信息

**小队名称**: ${team.name}
**探索主题**: ${themeName}
**任务阶段**: ${task.stage}阶段
**任务名称**: ${task.title}
**任务难度**: ${difficultyLabel}
**任务描述**: ${task.description || '无'}
**任务要求**: ${requirementsList.length > 0 ? requirementsList.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n') : '无特定要求'}
**学习目标**: ${learningGoalsList.length > 0 ? learningGoalsList.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n') : '无特定目标'}

## 小队提交的产出
**提交时间**: ${new Date(submission.created_at).toLocaleString('zh-CN')}
**产出文字内容**: 
${submission.content || '（小队未填写文字说明）'}

**提交的附件**: ${attachmentInfo.length > 0 ? attachmentInfo.join('、') : '无附件'}
${imageUrls.length > 0 ? '\n小队提交了图片，请仔细查看图片内容，评价图片中的作品/观察/记录等。' : ''}
${videoUrls.length > 0 ? '\n小队提交了视频，请查看视频内容，评价视频中的表现。' : ''}

## 把关要求

1. **亮点发现**: 先具体表扬产出中做得好的地方（如"你们对XX的观察很仔细"、"XX部分的创意很好"）
2. **要求对照**: 逐条对照任务要求，指出哪些要求已完成、哪些还没有体现
3. **图片/视频评价**: 如果有图片或视频，仔细分析其中的内容，评价作品质量、创意、完整性
4. **改进建议**: 针对不足之处给出具体可操作的改进建议（如"可以在XX方面加入更多细节"），避免空泛
5. **目标检查**: 检查产出是否体现了学习目标，如果没有，给出如何体现的建议
6. **鼓励总结**: 用温暖的语气总结，鼓励小队完善后再提交给志愿者老师
7. **语言要求**: 适合4-6年级小朋友理解，避免过于学术的表达
8. **注意**: 你是帮小队把关的"好朋友"，不是打分评判的"老师"，不要给出分数，重点是帮助小队发现可以改进的地方`;

    // 7. 构建多模态消息
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const llmClient = new LLMClient(config, customHeaders);

    // 使用支持视觉的模型
    const visionModel = 'doubao-seed-2-0-pro-260215';

    // 构建用户消息内容（多模态）
    const userContent: any[] = [];

    // 先添加文字说明
    userContent.push({
      type: 'text',
      text: '银蛇博士，请帮我们看看这次产出做得怎么样？有没有什么可以改进的地方？',
    });

    // 添加图片（最多5张，避免token过多）
    const maxImages = Math.min(imageUrls.length, 5);
    for (let i = 0; i < maxImages; i++) {
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrls[i] },
      });
    }
    if (imageUrls.length > 5) {
      userContent.push({
        type: 'text',
        text: `（共${imageUrls.length}张图片，因数量较多仅展示5张）`,
      });
    }

    // 添加视频（最多2个）
    const maxVideos = Math.min(videoUrls.length, 2);
    for (let i = 0; i < maxVideos; i++) {
      userContent.push({
        type: 'video_url',
        video_url: { url: videoUrls[i], fps: 2 },
      });
    }
    if (videoUrls.length > 2) {
      userContent.push({
        type: 'text',
        text: `（共${videoUrls.length}个视频，因数量较多仅展示2个）`,
      });
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }> = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ];

    // 8. 调用LLM流式生成评价
    const encoder = new TextEncoder();
    let controllerClosed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const safeEnqueue = (data: string) => {
          if (controllerClosed) return false;
          try {
            controller.enqueue(encoder.encode(data));
            return true;
          } catch {
            controllerClosed = true;
            return false;
          }
        };

        try {
          const llmStream = llmClient.stream(messages, {
            temperature: 0.7,
            model: visionModel,
          });

          let fullResponse = '';

          for await (const chunk of llmStream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              fullResponse += text;
              if (!safeEnqueue(`data: ${JSON.stringify({ content: text })}\n\n`)) break;
            }
          }

          // 发送完成信号
          if (!controllerClosed) {
            safeEnqueue(`data: ${JSON.stringify({ type: 'done', totalContent: fullResponse.length })}\n\n`);
            try { controller.close(); controllerClosed = true; } catch {}
          }
        } catch (streamError) {
          console.error('[产出评价] 流式输出错误:', streamError);
          safeEnqueue(`data: ${JSON.stringify({ type: 'error', error: '评价生成失败，请稍后重试' })}\n\n`);
          try { controller.close(); controllerClosed = true; } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[产出评价] 请求处理失败:', error);
    return ApiErrors.validation('评价服务暂时不可用');
  }
}

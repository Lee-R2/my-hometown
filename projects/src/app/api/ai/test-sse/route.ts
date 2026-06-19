import { requireAdmin, authError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 测试 SSE 流式响应（仅管理员）
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // 发送模拟的流式响应
      controller.enqueue(encoder.encode(`data: {"content": "我来帮你们生成一张图片"}\n\n`));
      await new Promise(resolve => setTimeout(resolve, 500));
      
      controller.enqueue(encoder.encode(`data: {"type": "image_generated", "imageUrl": "https://coze-coding-project.tos.coze.site/coze_storage_7620472753380065322/generate_image_test.jpeg?sign=test", "prompt": "测试图片"}\n\n`));
      await new Promise(resolve => setTimeout(resolve, 500));
      
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

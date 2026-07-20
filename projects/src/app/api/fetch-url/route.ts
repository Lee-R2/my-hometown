import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { url } = await request.json();

    if (!url) {
      return ApiErrors.validation('URL is required');
    }

    // 安全修复：SSRF 防护 - 校验 URL 合法性
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return ApiErrors.validation('Invalid URL format');
    }

    // 仅允许 http/https 协议
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return ApiErrors.validation('Only http/https protocols are allowed');
    }

    // 拒绝内网 IP 和元数据接口
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
      /^127\./,                          // 本地回环
      /^10\./,                           // A 类内网
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // B 类内网
      /^192\.168\./,                     // C 类内网
      /^169\.254\./,                     // 链路本地（含云元数据）
      /^::1$/,                           // IPv6 回环
      /^fc[0-9a-f]{2}:/i,                // IPv6 唯一本地
      /^fe80:/i,                         // IPv6 链路本地
      /^0\./,                            // 0.0.0.0
      /^localhost$/i,                    // localhost
    ];

    if (blockedPatterns.some(pattern => pattern.test(hostname))) {
      return ApiErrors.validation('Access to internal network resources is forbidden');
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new FetchClient(config, customHeaders);

    const response = await client.fetch(url);

    if (response.status_code !== 0) {
      return NextResponse.json({ 
        error: response.status_message || 'Failed to fetch URL' 
      }, { status: 500 });
    }

    // Extract text content
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    return NextResponse.json({
      success: true,
      title: response.title,
      url: response.url,
      content: textContent,
      rawContent: response.content,
    });
  } catch (error) {
    console.error('Fetch URL error:', error);
    return ApiErrors.validation('Failed to fetch URL content');
  }
}

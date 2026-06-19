/**
 * 图片处理工具模块
 * 从 admin/assistant/route.ts 提取
 */

/**
 * 将图片URL转换为base64数据URI
 */
export async function imageUrlToBase64(url: string, timeout = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; STEM-Education-Platform/1.0)',
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[蜡象助手API] 下载图片失败: ${url}, status: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    // 限制图片大小（超过5MB的图片不传给模型）
    if (base64.length > 5 * 1024 * 1024) {
      console.log(`[蜡象助手API] 图片过大(${(base64.length / 1024 / 1024).toFixed(1)}MB)，跳过: ${url}`);
      return null;
    }
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.log(`[蜡象助手API] 转换图片base64失败: ${url}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * 批量将图片URL转换为base64数据URI（并发限制3）
 */
export async function batchImageUrlsToBase64(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const concurrencyLimit = 3;
  
  for (let i = 0; i < urls.length; i += concurrencyLimit) {
    const batch = urls.slice(i, i + concurrencyLimit);
    const promises = batch.map(async (url) => {
      const base64 = await imageUrlToBase64(url);
      if (base64) {
        result.set(url, base64);
      }
    });
    await Promise.all(promises);
  }
  
  return result;
}

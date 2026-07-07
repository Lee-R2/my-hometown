/**
 * 诊断银蛇博士超时 - 流式版本
 * 实时输出 SSE 数据，看 LLM 是否有响应
 */
const http = require('http');

const BASE = 'http://localhost:5000';
const TIMEOUT = 180000; // 3 分钟超时

function randomIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function createClient() {
  const cookies = [];
  const clientIp = randomIp();
  function request(method, path, body, headers = {}, onData = null) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': clientIp,
          'X-Real-IP': clientIp,
          ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
          ...headers,
        },
        timeout: TIMEOUT,
      };
      const req = http.request(options, (res) => {
        const setCookies = res.headers['set-cookie'];
        if (setCookies) {
          setCookies.forEach((c) => {
            const cookiePart = c.split(';')[0];
            const cookieName = cookiePart.split('=')[0];
            for (let i = cookies.length - 1; i >= 0; i--) {
              if (cookies[i].startsWith(cookieName + '=')) cookies.splice(i, 1);
            }
            cookies.push(cookiePart);
          });
        }
        let data = '';
        let chunkCount = 0;
        res.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          data += chunkStr;
          chunkCount++;
          // 输出前 10 个 chunk 和最后几个 chunk
          if (chunkCount <= 10 || chunkStr.includes('[DONE]')) {
            console.log(`   [chunk ${chunkCount} @ ${Date.now() - start}ms] ${chunkStr.substring(0, 150)}`);
          }
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data, elapsed: Date.now() - start, chunkCount });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('timeout')); });
      if (body !== undefined && body !== null) req.write(JSON.stringify(body));
      req.end();
    });
  }
  return { request };
}

async function main() {
  const team = createClient();

  // 1. 登录
  console.log('1. 小队登录...');
  const loginRes = await team.request('POST', '/api/auth/team-login', { code: '20261001', password: '123456' });
  // 登录响应直接是 team 对象（无包裹）
  const teamId = loginRes.json?.id || loginRes.json?.team?.id;
  console.log(`   teamId=${teamId} loginStatus=${loginRes.status}`);

  // 2. 测试银蛇博士对话 - 实时输出 chunk
  console.log('\n2. 测试银蛇博士对话（实时输出 chunk）...');
  const chatRes = await team.request(
    'POST',
    '/api/ai/chat',
    {
      messages: [{ role: 'user', content: '你好' }],
      assistantType: 'yinhe',
      teamId,
      sessionId: `diag2_${Date.now()}`,
    },
    {},
    (chunkStr) => {
      // 这个回调不会被调用，因为 onData 在 request 内部处理
    }
  );
  console.log(`\n   最终: status=${chatRes.status} 耗时=${chatRes.elapsed}ms chunk数=${chatRes.chunkCount}`);
  console.log(`   响应前 300 字符: ${chatRes.body.substring(0, 300)}`);

  if (chatRes.body.includes('[DONE]')) {
    console.log('   ✓ 收到 [DONE] 标记，流式正常结束');
  } else {
    console.log('   ✗ 未收到 [DONE] 标记');
  }
}

main().catch((e) => console.error('\n诊断错误:', e.message));

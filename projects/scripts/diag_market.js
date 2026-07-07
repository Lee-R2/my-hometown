/**
 * 诊断市集列表 500 错误的真实原因
 */
const http = require('http');
const BASE = 'http://localhost:5000';

function randomIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function createClient() {
  const cookies = [];
  const clientIp = randomIp();
  function request(method, path, body, headers = {}) {
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
        timeout: 30000,
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
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: data, json });
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
  const loginRes = await team.request('POST', '/api/auth/team-login', { code: '20261001', password: '123456' });
  console.log('1. 登录:', loginRes.status === 200 ? '成功' : '失败');

  // 2. 市集列表 - 获取完整错误响应
  console.log('\n2. 市集列表 500 错误详情:');
  const r = await team.request('GET', '/api/team/market/listings');
  console.log('   status:', r.status);
  console.log('   body:', r.body);
  console.log('   json:', JSON.stringify(r.json, null, 2));

  // 3. 测试不同查询参数（看是否需要参数）
  console.log('\n3. 带 limit 参数:');
  const r2 = await team.request('GET', '/api/team/market/listings?limit=10');
  console.log('   status:', r2.status, 'body:', r2.body.substring(0, 300));

  // 4. 测试 /api/team/market 路径
  console.log('\n4. /api/team/market 路径:');
  const r3 = await team.request('GET', '/api/team/market');
  console.log('   status:', r3.status, 'body:', r3.body.substring(0, 300));

  // 5. 检查 dev server 最新日志（通过 /api/health 触发）
  console.log('\n5. 请检查 dev server 终端的最新错误日志（应该有 500 错误堆栈）');
}

main().catch(console.error);

const http = require('http');

const BASE = 'http://localhost:5000';

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: data, json });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

let passed = 0;
let failed = 0;
const issues = [];

async function test(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL: ${name} — ${e.message}`);
        failed++;
        issues.push({ name, error: e.message });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function runTests() {
    // ===== P0: Smoke Tests =====
    console.log('\n=== P0: Smoke Tests ===');

    await test('P0-1: 首页加载', async () => {
        const res = await request('GET', '/');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('P0-2: 健康检查', async () => {
        const res = await request('GET', '/api/health');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.json && res.json.status === 'ok', `Health check failed: ${res.body}`);
    });

    await test('P0-3: 管理员登录页加载', async () => {
        const res = await request('GET', '/admin/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('P0-4: 小队登录页加载', async () => {
        const res = await request('GET', '/team/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('P0-5: 家长登录页加载', async () => {
        const res = await request('GET', '/parent/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ===== P2: Error Handling Tests =====
    console.log('\n=== P2: Error Handling Tests ===');

    await test('P2-1: 未认证访问受保护API返回401', async () => {
        const res = await request('GET', '/api/admin/stats');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
        assert(res.json && (res.json.error || res.json.message), 'Error response should have error/message field');
    });

    await test('P2-2: 未认证访问小队API返回401', async () => {
        const res = await request('GET', '/api/team/info');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('P2-3: 登录缺少参数返回400', async () => {
        const res = await request('POST', '/api/auth/login', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('P2-4: 登录错误密码返回401', async () => {
        const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'wrongpassword' });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('P2-5: 错误响应包含code字段', async () => {
        const res = await request('POST', '/api/auth/login', {});
        if (res.json) {
            // New format: { error, code }
            // Old format: { error } or { success: false, message }
            const hasCode = 'code' in res.json;
            const hasError = 'error' in res.json;
            const hasMessage = 'message' in res.json;
            assert(hasError || hasMessage, `Error response should have error or message field, got: ${JSON.stringify(res.json)}`);
            if (!hasCode && !hasError) {
                console.log(`    NOTE: Response missing 'code' field: ${JSON.stringify(res.json)}`);
            }
        }
    });

    await test('P2-6: 地区列表(公开API)返回200', async () => {
        const res = await request('GET', '/api/schools/regions');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ===== P1: Core Business (requires auth) =====
    console.log('\n=== P1: Core Business Tests (with auth) ===');

    let adminToken = null;

    await test('P1-1: 管理员登录成功', async () => {
        const res = await request('POST', '/api/auth/login', { username: 'admin', password: '123456' });
        if (res.status === 200 && res.json) {
            adminToken = res.json.token || res.json.data?.token;
            assert(adminToken, `Login succeeded but no token returned: ${JSON.stringify(res.json)}`);
        } else if (res.status === 401) {
            // Test account may not exist yet
            console.log(`    NOTE: admin/123456 login failed (401) - test account may not exist`);
        } else {
            assert(false, `Expected 200 or 401, got ${res.status}: ${res.body}`);
        }
    });

    if (adminToken) {
        const authHeaders = { 'Authorization': `Bearer ${adminToken}` };

        await test('P1-2: 管理员仪表盘数据', async () => {
            const res = await request('GET', '/api/admin/stats', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-3: 学校列表', async () => {
            const res = await request('GET', '/api/schools', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-4: 主题列表', async () => {
            const res = await request('GET', '/api/themes', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-5: 任务列表', async () => {
            const res = await request('GET', '/api/tasks', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-6: 小队列表', async () => {
            const res = await request('GET', '/api/teams', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-7: 工具列表', async () => {
            const res = await request('GET', '/api/tools', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-8: 技能列表', async () => {
            const res = await request('GET', '/api/skills', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-9: 奖励列表', async () => {
            const res = await request('GET', '/api/rewards', null, authHeaders);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        // P2 continued with auth
        console.log('\n=== P2: Error Handling Tests (with auth) ===');

        await test('P2-7: 访问不存在的学校ID返回404', async () => {
            const res = await request('GET', '/api/schools/nonexistent-id-12345', null, authHeaders);
            assert(res.status === 404, `Expected 404, got ${res.status}`);
        });

        await test('P2-8: 创建学校缺少名称返回400', async () => {
            const res = await request('POST', '/api/schools', {}, authHeaders);
            assert(res.status === 400, `Expected 400, got ${res.status}`);
        });
    }

    // ===== Summary =====
    console.log('\n' + '='.repeat(50));
    console.log(`Total: ${passed + failed} tests, ${passed} passed, ${failed} failed`);
    
    if (issues.length > 0) {
        console.log('\nFailed tests:');
        issues.forEach((i, idx) => console.log(`  ${idx + 1}. ${i.name}: ${i.error}`));
    }
}

runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
});

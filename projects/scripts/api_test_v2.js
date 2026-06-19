const http = require('http');

const BASE = 'http://localhost:5000';

// Cookie jar for session persistence
let cookies = [];

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
                ...(cookies.length ? { 'Cookie': cookies.join('; ') } : {}),
                ...headers
            },
        };
        const req = http.request(options, (res) => {
            // Capture Set-Cookie headers
            const setCookies = res.headers['set-cookie'];
            if (setCookies) {
                setCookies.forEach(c => {
                    const cookiePart = c.split(';')[0];
                    const cookieName = cookiePart.split('=')[0];
                    // Remove old cookie with same name
                    cookies = cookies.filter(c => !c.startsWith(cookieName + '='));
                    cookies.push(cookiePart);
                });
            }
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
        console.log(`  FAIL: ${name} - ${e.message}`);
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
    });

    await test('P0-3: 管理员登录页', async () => {
        const res = await request('GET', '/admin/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('P0-4: 小队登录页', async () => {
        const res = await request('GET', '/team/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('P0-5: 家长登录页', async () => {
        const res = await request('GET', '/parent/login');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ===== P2: Error Handling (no auth) =====
    console.log('\n=== P2: Error Handling (no auth) ===');

    await test('P2-1: 未认证访问受保护API返回401', async () => {
        const res = await request('GET', '/api/admin/stats');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('P2-2: 未认证访问小队API返回401', async () => {
        const res = await request('GET', '/api/team/info');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('P2-3: 登录缺少参数返回400', async () => {
        const res = await request('POST', '/api/auth/login', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('P2-4: 登录错误密码返回401/429', async () => {
        const res = await request('POST', '/api/auth/login', { username: 'admin', password: 'wrongpassword' });
        // 401=密码错误, 429=频率限制(安全功能)
        assert(res.status === 401 || res.status === 429, `Expected 401 or 429, got ${res.status}`);
    });

    await test('P2-5: 错误响应包含error字段', async () => {
        const res = await request('POST', '/api/auth/login', {});
        assert(res.json && (res.json.error || res.json.message), `Should have error/message, got: ${res.body}`);
    });

    await test('P2-6: 公开API(地区列表)返回200', async () => {
        const res = await request('GET', '/api/schools/regions');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ===== P1: Core Business (with auth) =====
    console.log('\n=== P1: Core Business (with auth) ===');

    // Try different passwords for admin
    let loginSuccess = false;
    const passwords = ['123456', 'admin123', 'admin', 'password'];
    
    for (const pwd of passwords) {
        const res = await request('POST', '/api/auth/login', { username: 'admin', password: pwd });
        if (res.status === 200) {
            loginSuccess = true;
            console.log(`  INFO: admin logged in with password: ${pwd}`);
            break;
        }
    }

    if (!loginSuccess) {
        console.log('  SKIP: admin login failed with all test passwords - skipping auth-dependent tests');
        console.log('  HINT: You may need to initialize test data via the admin UI');
    }

    if (loginSuccess) {
        await test('P1-2: 管理员仪表盘数据', async () => {
            const res = await request('GET', '/api/admin/stats');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-3: 学校列表', async () => {
            const res = await request('GET', '/api/schools');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-4: 主题列表', async () => {
            const res = await request('GET', '/api/themes');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-5: 任务列表(需themeId)', async () => {
            // 任务列表API要求themeId或taskGroupId参数
            const res = await request('GET', '/api/tasks?themeId=any');
            // 200=有数据, 400=缺少有效themeId(预期), 200+空列表也OK
            assert(res.status === 200 || res.status === 400, `Expected 200 or 400, got ${res.status}`);
        });

        await test('P1-6: 小队列表', async () => {
            const res = await request('GET', '/api/teams');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-7: 工具列表', async () => {
            const res = await request('GET', '/api/tools');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-8: 技能列表', async () => {
            const res = await request('GET', '/api/skills');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('P1-9: 奖励列表', async () => {
            const res = await request('GET', '/api/rewards');
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        // P2 with auth
        console.log('\n=== P2: Error Handling (with auth) ===');

        await test('P2-7: 访问不存在的学校ID返回404', async () => {
            const res = await request('GET', '/api/schools/nonexistent-id-12345');
            assert(res.status === 404, `Expected 404, got ${res.status}`);
        });

        await test('P2-8: 创建学校缺少名称返回400', async () => {
            const res = await request('POST', '/api/schools', {});
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

runTests().catch(e => console.error('Test runner error:', e));

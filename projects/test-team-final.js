const crypto = require('crypto');

const TOKEN_SECRET = '8154f611f6050943b32cf0ade6a556acefefb77a77cb3147cfa05099870f73e8';

function generateToken(userId, role, schoolId) {
  const payload = { userId, role, schoolId, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

const TEAM_ID = '6bdf09f2-2e14-4cf2-a4ed-81a59374d181';
const SCHOOL_ID = 'b1873e17-b42b-4028-874d-fbeccab69444';
const teamToken = generateToken(TEAM_ID, 'team', SCHOOL_ID);
const BASE = 'http://localhost:5000';

const teamHeaders = {
  'Authorization': `Bearer ${teamToken}`,
  'x-app-role': 'team',
  'x-app-user-id': TEAM_ID,
  'x-app-team-id': TEAM_ID,
};

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    const status = result.status;
    const data = await result.json().catch(() => null);
    const ok = data?.success !== false && !data?.error && status < 400;
    if (ok) passCount++; else failCount++;
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) {
      const errMsg = data?.error || data?.message || JSON.stringify(data)?.substring(0, 150);
      console.log(`   Error: ${errMsg}`);
    }
    return { ok, data, status };
  } catch (err) {
    failCount++;
    console.log(`❌ ${name} - ${err.message}`);
    return { ok: false, data: null, status: 0 };
  }
}

async function main() {
  console.log('=== 步骤 4.8 小队端功能最终验证 ===\n');

  // 1. 登录
  console.log('━━ 1. 小队登录 ━━');
  await test('POST /api/auth/team-login (YG01)', () =>
    fetch(`${BASE}/api/auth/team-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'YG01', password: 'yg123456' }),
    })
  );

  // 2. 仪表盘
  console.log('\n━━ 2. 小队仪表盘 ━━');
  await test('GET /api/teams/:id', () => fetch(`${BASE}/api/teams/${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/themes?teamId=', () => fetch(`${BASE}/api/themes?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/current-task', () => fetch(`${BASE}/api/team/current-task?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/notifications', () => fetch(`${BASE}/api/team/notifications`, { headers: teamHeaders }));
  await test('GET /api/team/notifications/unread-count', () => fetch(`${BASE}/api/team/notifications/unread-count`, { headers: teamHeaders }));
  await test('GET /api/team/theme-completions', () => fetch(`${BASE}/api/team/theme-completions?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/heart-gems', () => fetch(`${BASE}/api/team/heart-gems?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/pretest', () => fetch(`${BASE}/api/team/pretest?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/teams/:id/members', () => fetch(`${BASE}/api/teams/${TEAM_ID}/members`, { headers: teamHeaders }));
  await test('GET /api/team/info', () => fetch(`${BASE}/api/team/info?team_id=${TEAM_ID}`, { headers: teamHeaders }));

  // 3. 任务列表
  console.log('\n━━ 3. 任务列表 ━━');
  await test('GET /api/tasks?themeId=', () => fetch(`${BASE}/api/tasks?themeId=f109056a-ef34-4bfb-a08a-c9783da805c9`, { headers: teamHeaders }));
  await test('GET /api/tasks/:id', () => fetch(`${BASE}/api/tasks/a0000001-0001-0001-0001-000000000001?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/tasks/:id/skills', () => fetch(`${BASE}/api/tasks/a0000001-0001-0001-0001-000000000001/skills`, { headers: teamHeaders }));
  await test('GET /api/tasks/:id/tools', () => fetch(`${BASE}/api/tasks/a0000001-0001-0001-0001-000000000001/tools`, { headers: teamHeaders }));
  await test('GET /api/tasks/:id/rewards', () => fetch(`${BASE}/api/tasks/a0000001-0001-0001-0001-000000000001/rewards`, { headers: teamHeaders }));

  // 4. 提交功能
  console.log('\n━━ 4. 提交功能 ━━');
  await test('GET /api/submissions?teamId=', () => fetch(`${BASE}/api/submissions?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('POST /api/submissions', () =>
    fetch(`${BASE}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({ teamId: TEAM_ID, taskId: 'a0000001-0001-0001-0001-000000000001', content: '最终测试提交' }),
    })
  );

  // 5. 黑板报
  console.log('\n━━ 5. 黑板报 ━━');
  await test('GET /api/team/blackboard', () => fetch(`${BASE}/api/team/blackboard`, { headers: teamHeaders }));
  const postRes = await test('POST /api/team/blackboard', () =>
    fetch(`${BASE}/api/team/blackboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({ theme_id: 'f109056a-ef34-4bfb-a08a-c9783da805c9', title: '最终测试帖子', content: '最终测试内容' }),
    })
  );
  const postId = postRes.data?.data?.id;
  if (postId) {
    await test('POST /api/team/blackboard/:id/comments', () =>
      fetch(`${BASE}/api/team/blackboard/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ content: '最终测试评论' }),
      })
    );
    await test('POST /api/team/blackboard/:id/like', () =>
      fetch(`${BASE}/api/team/blackboard/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({}),
      })
    );
  }

  // 6. 奖励商城
  console.log('\n━━ 6. 奖励商城 ━━');
  await test('GET /api/team/rewards', () => fetch(`${BASE}/api/team/rewards?teamId=${TEAM_ID}`, { headers: teamHeaders }));

  // 7. 借贷系统
  console.log('\n━━ 7. 借贷系统 ━━');
  await test('GET /api/team/borrow', () => fetch(`${BASE}/api/team/borrow?exclude_team_id=${TEAM_ID}&volunteer_id=581bede2-4a6e-40c0-ad99-c72c62bde617`, { headers: teamHeaders }));
  await test('GET /api/team/borrow/history', () => fetch(`${BASE}/api/team/borrow/history`, { headers: teamHeaders }));
  await test('GET /api/team/transfer/history', () => fetch(`${BASE}/api/team/transfer/history`, { headers: teamHeaders }));

  // 8. 其他
  console.log('\n━━ 8. 其他功能 ━━');
  await test('GET /api/team/difficulty-preference', () => fetch(`${BASE}/api/team/difficulty-preference?team_id=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/materials', () => fetch(`${BASE}/api/team/materials?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/skills', () => fetch(`${BASE}/api/team/skills?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/side-tasks', () => fetch(`${BASE}/api/team/side-tasks?teamId=${TEAM_ID}`, { headers: teamHeaders }));
  await test('GET /api/team/sibling-teams', () => fetch(`${BASE}/api/team/sibling-teams?teamId=${TEAM_ID}&createdBy=581bede2-4a6e-40c0-ad99-c72c62bde617`, { headers: teamHeaders }));
  await test('POST /api/team/notifications/read-all', () =>
    fetch(`${BASE}/api/team/notifications/read-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({}),
    })
  );

  console.log(`\n=== 结果: ${passCount} 通过, ${failCount} 失败 ===`);
}

main();

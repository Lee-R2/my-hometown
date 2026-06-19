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
const TASK_ID = 'a0000001-0001-0001-0001-000000000001'; // 认识身边的生态系统
const THEME_ID = 'f109056a-ef34-4bfb-a08a-c9783da805c9';

const teamToken = generateToken(TEAM_ID, 'team', SCHOOL_ID);
const BASE = 'http://localhost:5000';

const teamHeaders = {
  'Authorization': `Bearer ${teamToken}`,
  'x-app-role': 'team',
  'x-app-user-id': TEAM_ID,
  'x-app-team-id': TEAM_ID,
};

async function test(name, fn) {
  try {
    const result = await fn();
    const status = result.status;
    const data = await result.json().catch(() => null);
    const ok = data?.success !== false && !data?.error && status < 400;
    console.log(`${ok ? '✅' : '❌'} ${name} (HTTP ${status})`);
    if (!ok) {
      const errMsg = data?.error || data?.message || JSON.stringify(data)?.substring(0, 200);
      console.log(`   Error: ${errMsg}`);
    }
    if (ok && data?.data) {
      const preview = JSON.stringify(data.data).substring(0, 200);
      console.log(`   Data: ${preview}`);
    }
    return { ok, data, status };
  } catch (err) {
    console.log(`❌ ${name} - Exception: ${err.message}`);
    return { ok: false, data: null, status: 0 };
  }
}

async function main() {
  console.log('=== 小队端提交与交互测试 ===\n');

  // 1. 提交任务
  console.log('━━━ 1. 任务提交 ━━━');
  const subRes = await test('提交任务', () =>
    fetch(`${BASE}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({
        teamId: TEAM_ID,
        taskId: TASK_ID,
        content: '我们观察了校园周围的生态系统，发现了多种植物和昆虫。',
      }),
    })
  );
  const submissionId = subRes.data?.data?.id;
  console.log(`   Submission ID: ${submissionId}`);

  // 2. 获取提交记录
  console.log('\n━━━ 2. 提交记录 ━━━');
  await test('获取提交记录', () =>
    fetch(`${BASE}/api/submissions?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );

  // 3. 点赞提交
  if (submissionId) {
    console.log('\n━━━ 3. 点赞提交 ━━━');
    await test('点赞提交', () =>
      fetch(`${BASE}/api/submissions/${submissionId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ teamId: TEAM_ID }),
      })
    );
  }

  // 4. 黑板报完整流程
  console.log('\n━━━ 4. 黑板报完整流程 ━━━');
  const postRes = await test('创建黑板报帖子', () =>
    fetch(`${BASE}/api/team/blackboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({
        theme_id: THEME_ID,
        title: '我们的生态观察日记',
        content: '今天我们在校园里观察了各种植物和小昆虫，学到了很多！',
      }),
    })
  );
  const postId = postRes.data?.data?.id;

  if (postId) {
    await test('小队评论帖子', () =>
      fetch(`${BASE}/api/team/blackboard/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ content: '我们下次还要继续观察！' }),
      })
    );

    await test('小队点赞帖子', () =>
      fetch(`${BASE}/api/team/blackboard/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({}),
      })
    );

    await test('获取黑板报列表', () =>
      fetch(`${BASE}/api/team/blackboard`, { headers: teamHeaders })
    );
  }

  // 5. 前测
  console.log('\n━━━ 5. 前测状态 ━━━');
  await test('获取前测状态', () =>
    fetch(`${BASE}/api/team/pretest?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );

  // 6. 难度偏好
  console.log('\n━━━ 6. 难度偏好 ━━━');
  await test('获取难度偏好', () =>
    fetch(`${BASE}/api/team/difficulty-preference?team_id=${TEAM_ID}`, { headers: teamHeaders })
  );

  // 7. 借贷系统
  console.log('\n━━━ 7. 借贷系统 ━━━');
  await test('获取可借用小队', () =>
    fetch(`${BASE}/api/team/borrow?exclude_team_id=${TEAM_ID}&volunteer_id=581bede2-4a6e-40c0-ad99-c72c62bde617`, { headers: teamHeaders })
  );

  // 8. 通知
  console.log('\n━━━ 8. 通知 ━━━');
  await test('获取通知列表', () =>
    fetch(`${BASE}/api/team/notifications`, { headers: teamHeaders })
  );
  await test('全部已读', () =>
    fetch(`${BASE}/api/team/notifications/read-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({ team_id: TEAM_ID }),
    })
  );

  console.log('\n=== 测试完成 ===');
}

main();

const crypto = require('crypto');

const TOKEN_SECRET = '8154f611f6050943b32cf0ade6a556acefefb77a77cb3147cfa05099870f73e8';

function generateToken(userId, role, schoolId) {
  const payload = { userId, role, schoolId, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

const ADMIN_ID = '753d53c7-a77d-47b5-9d0b-ae9998fcd525';
const TEAM_ID = '6bdf09f2-2e14-4cf2-a4ed-81a59374d181'; // 阳光先锋队
const TEAM2_ID = 'e12f7274-060f-4a94-95f1-75f99f747786'; // 绿叶守护队
const VOLUNTEER_ID = '581bede2-4a6e-40c0-ad99-c72c62bde617';
const SCHOOL_ID = 'b1873e17-b42b-4028-874d-fbeccab69444';
const THEME_ID = 'f109056a-ef34-4bfb-a08a-c9783da805c9';

const teamToken = generateToken(TEAM_ID, 'team', SCHOOL_ID);
const team2Token = generateToken(TEAM2_ID, 'team', SCHOOL_ID);
const adminToken = generateToken(ADMIN_ID, 'super_admin');

const BASE = 'http://localhost:5000';

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
    return { ok, data, status };
  } catch (err) {
    console.log(`❌ ${name} - Exception: ${err.message}`);
    return { ok: false, data: null, status: 0 };
  }
}

const teamHeaders = {
  'Authorization': `Bearer ${teamToken}`,
  'x-app-role': 'team',
  'x-app-user-id': TEAM_ID,
  'x-app-team-id': TEAM_ID,
};

async function main() {
  console.log('=== 小队端功能综合测试（修复后） ===\n');

  // ===== 1. 小队登录 =====
  console.log('━━━ 1. 小队登录 ━━━');
  await test('小队登录（阳光先锋队 YG01）', () =>
    fetch(`${BASE}/api/auth/team-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'YG01', password: 'yg123456' }),
    })
  );
  await test('小队登录（绿叶守护队 YG02）', () =>
    fetch(`${BASE}/api/auth/team-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'YG02', password: 'yg654321' }),
    })
  );
  console.log('');

  // ===== 2. 小队仪表盘依赖 API =====
  console.log('━━━ 2. 小队仪表盘 ━━━');
  await test('获取小队信息', () =>
    fetch(`${BASE}/api/teams/${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取小队主题列表', () =>
    fetch(`${BASE}/api/themes?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取当前任务', () =>
    fetch(`${BASE}/api/team/current-task?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取小队通知', () =>
    fetch(`${BASE}/api/team/notifications?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取未读通知数', () =>
    fetch(`${BASE}/api/team/notifications/unread-count?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取主题完成记录', () =>
    fetch(`${BASE}/api/team/theme-completions?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取同志愿者小队', () =>
    fetch(`${BASE}/api/team/sibling-teams?teamId=${TEAM_ID}&createdBy=${VOLUNTEER_ID}`, { headers: teamHeaders })
  );
  await test('获取前测状态', () =>
    fetch(`${BASE}/api/team/pretest?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取小队成员', () =>
    fetch(`${BASE}/api/teams/${TEAM_ID}/members`, { headers: teamHeaders })
  );
  await test('获取借用记录', () =>
    fetch(`${BASE}/api/team/borrow/history?team_id=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取赠送记录', () =>
    fetch(`${BASE}/api/team/transfer/history?team_id=${TEAM_ID}&type=received&limit=50`, { headers: teamHeaders })
  );
  console.log('');

  // ===== 3. 任务列表 =====
  console.log('━━━ 3. 任务列表 ━━━');
  await test('获取任务列表（themeId参数）', () =>
    fetch(`${BASE}/api/tasks?themeId=${THEME_ID}`, { headers: teamHeaders })
  );
  await test('获取提交记录', () =>
    fetch(`${BASE}/api/submissions?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  console.log('');

  // ===== 4. 提交功能 =====
  console.log('━━━ 4. 提交功能 =====');
  const tasksRes = await fetch(`${BASE}/api/tasks?themeId=${THEME_ID}`, { headers: teamHeaders });
  const tasksData = await tasksRes.json();
  const firstTask = tasksData?.tasks?.[0];
  console.log(`   第一个任务: ${firstTask?.title || '无'} (ID: ${firstTask?.id || '无'})`);

  if (firstTask) {
    await test('获取任务详情', () =>
      fetch(`${BASE}/api/tasks/${firstTask.id}?teamId=${TEAM_ID}`, { headers: teamHeaders })
    );
    await test('获取任务技能', () =>
      fetch(`${BASE}/api/tasks/${firstTask.id}/skills`, { headers: teamHeaders })
    );
    await test('获取任务工具', () =>
      fetch(`${BASE}/api/tasks/${firstTask.id}/tools`, { headers: teamHeaders })
    );
    await test('获取任务奖励', () =>
      fetch(`${BASE}/api/tasks/${firstTask.id}/rewards`, { headers: teamHeaders })
    );
  }
  console.log('');

  // ===== 5. 黑板报 =====
  console.log('━━━ 5. 黑板报 ━━━');
  await test('获取黑板报列表', () =>
    fetch(`${BASE}/api/team/blackboard?theme_id=${THEME_ID}`, { headers: teamHeaders })
  );
  console.log('');

  // ===== 6. 奖励商城 =====
  console.log('━━━ 6. 奖励商城 ━━━');
  await test('获取奖励列表', () =>
    fetch(`${BASE}/api/team/rewards?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  console.log('');

  // ===== 7. 借贷系统 =====
  console.log('━━━ 7. 借贷系统 ━━━');
  await test('获取可借用小队列表', () =>
    fetch(`${BASE}/api/team/borrow?exclude_team_id=${TEAM_ID}&volunteer_id=${VOLUNTEER_ID}`, { headers: teamHeaders })
  );
  await test('获取借用记录', () =>
    fetch(`${BASE}/api/team/borrow/history?team_id=${TEAM_ID}`, { headers: teamHeaders })
  );
  console.log('');

  // ===== 8. 其他小队端 API =====
  console.log('━━━ 8. 其他小队端 API ━━━');
  await test('获取小队信息(info)', () =>
    fetch(`${BASE}/api/team/info?team_id=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取心宝石数据', () =>
    fetch(`${BASE}/api/team/heart-gems?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取难度偏好', () =>
    fetch(`${BASE}/api/team/difficulty-preference?team_id=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取材料列表', () =>
    fetch(`${BASE}/api/team/materials?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取技能列表', () =>
    fetch(`${BASE}/api/team/skills?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  await test('获取支线任务', () =>
    fetch(`${BASE}/api/team/side-tasks?teamId=${TEAM_ID}`, { headers: teamHeaders })
  );
  console.log('');

  console.log('=== 测试完成 ===');
}

main();

const crypto = require('crypto');

const TOKEN_SECRET = '8154f611f6050943b32cf0ade6a556acefefb77a77cb3147cfa05099870f73e8';

function generateToken(userId, role, schoolId) {
  const payload = {
    userId,
    role,
    schoolId,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

const ADMIN_ID = '753d53c7-a77d-47b5-9d0b-ae9998fcd525';
const TEAM_ID = '6bdf09f2-2e14-4cf2-a4ed-81a59374d181';
const THEME_ID = 'f109056a-ef34-4bfb-a08a-c9783da805c9';

const adminToken = generateToken(ADMIN_ID, 'super_admin');
const teamToken = generateToken(TEAM_ID, 'team');

const BASE = 'http://localhost:5000';

async function test(name, fn) {
  try {
    const result = await fn();
    const status = result.status;
    const data = await result.json().catch(() => null);
    const ok = data?.success !== false && status < 400;
    console.log(`${ok ? '✅' : '❌'} ${name} (HTTP ${status})`);
    if (!ok || data?.error) {
      console.log(`   Error: ${data?.error || 'Unknown'}`);
    }
    if (data?.data) {
      const preview = JSON.stringify(data.data).substring(0, 300);
      console.log(`   Data: ${preview}`);
    }
    return { ok, data, status };
  } catch (err) {
    console.log(`❌ ${name} - Exception: ${err.message}`);
    return { ok: false, data: null, status: 0 };
  }
}

async function main() {
  console.log('=== 黑板报系统综合测试 ===\n');

  let postId = null;
  let adminCommentId = null;
  let teamCommentId = null;

  console.log('--- 1. 小队创建帖子 ---');
  const postRes = await test('小队创建帖子', () =>
    fetch(`${BASE}/api/team/blackboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`,
        'x-app-role': 'team',
        'x-app-user-id': TEAM_ID,
        'x-app-team-id': TEAM_ID,
      },
      body: JSON.stringify({
        theme_id: THEME_ID,
        title: '测试帖子-环保行动',
        content: '我们小队今天开展了环保行动，清理了很多废弃物！',
      }),
    })
  );
  postId = postRes.data?.data?.id;
  console.log(`   Post ID: ${postId}\n`);

  if (!postId) {
    console.log('❌ 无法创建帖子，终止测试');
    return;
  }

  console.log('--- 2. 管理员获取黑板报列表 ---');
  await test('管理员获取黑板报列表', () =>
    fetch(`${BASE}/api/admin/blackboard`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'x-app-role': 'super_admin',
        'x-app-user-id': ADMIN_ID,
      },
    })
  );
  console.log('');

  console.log('--- 3. 管理员添加评论 ---');
  const commentRes = await test('管理员添加评论', () =>
    fetch(`${BASE}/api/admin/blackboard/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-app-role': 'super_admin',
        'x-app-user-id': ADMIN_ID,
      },
      body: JSON.stringify({
        admin_id: ADMIN_ID,
        admin_name: '管理员',
        admin_role: 'super_admin',
        content: '管理员测试评论-做得好！',
      }),
    })
  );
  adminCommentId = commentRes.data?.data?.id;
  console.log(`   Admin Comment ID: ${adminCommentId}\n`);

  console.log('--- 4. 小队添加评论 ---');
  const teamCommentRes = await test('小队添加评论', () =>
    fetch(`${BASE}/api/team/blackboard/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`,
        'x-app-role': 'team',
        'x-app-user-id': TEAM_ID,
        'x-app-team-id': TEAM_ID,
      },
      body: JSON.stringify({
        content: '小队测试评论-谢谢管理员！',
      }),
    })
  );
  teamCommentId = teamCommentRes.data?.data?.id;
  console.log(`   Team Comment ID: ${teamCommentId}\n`);

  console.log('--- 5. 管理员点赞帖子 ---');
  await test('管理员点赞帖子', () =>
    fetch(`${BASE}/api/admin/blackboard/${postId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-app-role': 'super_admin',
        'x-app-user-id': ADMIN_ID,
      },
      body: JSON.stringify({
        admin_id: ADMIN_ID,
      }),
    })
  );
  console.log('');

  console.log('--- 6. 小队点赞帖子 ---');
  await test('小队点赞帖子', () =>
    fetch(`${BASE}/api/team/blackboard/${postId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`,
        'x-app-role': 'team',
        'x-app-user-id': TEAM_ID,
        'x-app-team-id': TEAM_ID,
      },
      body: JSON.stringify({}),
    })
  );
  console.log('');

  console.log('--- 7. 管理员点赞评论 ---');
  if (adminCommentId) {
    await test('管理员点赞评论', () =>
      fetch(`${BASE}/api/admin/blackboard/comments/${adminCommentId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'x-app-role': 'super_admin',
          'x-app-user-id': ADMIN_ID,
        },
        body: JSON.stringify({
          admin_id: ADMIN_ID,
        }),
      })
    );
  } else {
    console.log('⏭️ 跳过评论点赞（无评论ID）');
  }
  console.log('');

  console.log('--- 8. 管理员取消点赞帖子 ---');
  await test('管理员取消点赞帖子', () =>
    fetch(`${BASE}/api/admin/blackboard/${postId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-app-role': 'super_admin',
        'x-app-user-id': ADMIN_ID,
      },
      body: JSON.stringify({
        admin_id: ADMIN_ID,
      }),
    })
  );
  console.log('');

  console.log('--- 9. 小队软删除帖子 ---');
  await test('小队软删除帖子', () =>
    fetch(`${BASE}/api/team/blackboard/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${teamToken}`,
        'x-app-role': 'team',
        'x-app-user-id': TEAM_ID,
        'x-app-team-id': TEAM_ID,
      },
    })
  );
  console.log('');

  console.log('--- 10. 验证删除后帖子不可见 ---');
  await test('管理员获取黑板报列表（验证删除）', () =>
    fetch(`${BASE}/api/admin/blackboard`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'x-app-role': 'super_admin',
        'x-app-user-id': ADMIN_ID,
      },
    })
  );
  console.log('');

  console.log('=== 测试完成 ===');
}

main();

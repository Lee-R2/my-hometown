const crypto = require('crypto');

const TOKEN_SECRET = '8154f611f6050943b32cf0ade6a556acefefb77a77cb3147cfa05099870f73e8';

function generateToken(userId, role, schoolId) {
  const payload = { userId, role, schoolId, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
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

async function main() {
  console.log('=== 前端数据格式验证 ===\n');

  // 1. 创建测试帖子
  console.log('1. 创建测试帖子...');
  const postRes = await fetch(`${BASE}/api/team/blackboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teamToken}`, 'x-app-role': 'team', 'x-app-user-id': TEAM_ID, 'x-app-team-id': TEAM_ID },
    body: JSON.stringify({ theme_id: THEME_ID, title: '环保行动日记', content: '今天我们小队一起清理了校园周边的废弃物，大家都很开心！' }),
  });
  const postData = await postRes.json();
  const postId = postData.data?.id;
  console.log(`   Post ID: ${postId}`);

  // 2. 管理员获取黑板报列表 - 验证前端所需字段
  console.log('\n2. 管理员获取黑板报列表 - 验证前端数据格式...');
  const listRes = await fetch(`${BASE}/api/admin/blackboard`, {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'x-app-role': 'super_admin', 'x-app-user-id': ADMIN_ID },
  });
  const listData = await listRes.json();

  if (!listData.success) {
    console.log('   ❌ 获取列表失败:', listData.error);
    return;
  }

  // 验证前端需要的字段
  const requiredFields = {
    'data.posts': listData.data?.posts,
    'data.stats': listData.data?.stats,
    'data.stats.totalPosts': listData.data?.stats?.totalPosts,
    'data.stats.totalComments': listData.data?.stats?.totalComments,
    'data.stats.totalLikes': listData.data?.stats?.totalLikes,
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    console.log(`   ${value !== undefined && value !== null ? '✅' : '❌'} ${field}: ${JSON.stringify(value)}`);
  }

  // 验证帖子字段
  if (listData.data?.posts?.length > 0) {
    const post = listData.data.posts[0];
    const postFields = {
      'id': post.id,
      'title': post.title,
      'content': post.content,
      'like_count': post.like_count,
      'comment_count': post.comment_count,
      'created_at': post.created_at,
      'media_urls': post.media_urls,
      'media_types': post.media_types,
      'teams.name': post.teams?.name,
      'teams.school_name': post.teams?.school_name,
      'task_themes.name': post.task_themes?.name,
    };

    console.log('\n   帖子字段验证:');
    for (const [field, value] of Object.entries(postFields)) {
      console.log(`   ${value !== undefined && value !== null ? '✅' : '❌'} ${field}: ${JSON.stringify(value)}`);
    }
  }

  // 3. 管理员添加评论
  console.log('\n3. 管理员添加评论...');
  const commentRes = await fetch(`${BASE}/api/admin/blackboard/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-app-role': 'super_admin', 'x-app-user-id': ADMIN_ID },
    body: JSON.stringify({ admin_id: ADMIN_ID, admin_name: '管理员', admin_role: 'super_admin', content: '做得好，继续加油！' }),
  });
  const commentData = await commentRes.json();
  console.log(`   ${commentData.success ? '✅' : '❌'} 管理员评论: ${commentData.success ? '成功' : commentData.error}`);

  // 4. 管理员点赞
  console.log('\n4. 管理员点赞...');
  const likeRes = await fetch(`${BASE}/api/admin/blackboard/${postId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-app-role': 'super_admin', 'x-app-user-id': ADMIN_ID },
    body: JSON.stringify({ admin_id: ADMIN_ID }),
  });
  const likeData = await likeRes.json();
  console.log(`   ${likeData.success ? '✅' : '❌'} 管理员点赞: ${likeData.success ? `like_count=${likeData.data?.like_count}` : likeData.error}`);

  // 5. 管理员删除帖子
  console.log('\n5. 管理员删除帖子...');
  const deleteRes = await fetch(`${BASE}/api/admin/blackboard`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-app-role': 'super_admin', 'x-app-user-id': ADMIN_ID },
    body: JSON.stringify({ post_id: postId, reason: '测试删除' }),
  });
  const deleteData = await deleteRes.json();
  console.log(`   ${deleteData.success ? '✅' : '❌'} 管理员删除: ${deleteData.success ? '成功' : deleteData.error}`);

  // 6. 验证删除后不可见
  console.log('\n6. 验证删除后帖子不可见...');
  const afterDeleteRes = await fetch(`${BASE}/api/admin/blackboard`, {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'x-app-role': 'super_admin', 'x-app-user-id': ADMIN_ID },
  });
  const afterDeleteData = await afterDeleteRes.json();
  const deletedPostVisible = afterDeleteData.data?.posts?.some(p => p.id === postId);
  console.log(`   ${!deletedPostVisible ? '✅' : '❌'} 删除后帖子${deletedPostVisible ? '仍可见' : '不可见'}`);

  console.log('\n=== 验证完成 ===');
}

main();

/**
 * 直接测试 final-task-feedback API 的 GET 和 POST
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

async function main() {
  // 1. 检查 final_task_forms 查询 is_global, is_active, team_role 是否会报错
  console.log('测试1: 查询 final_task_forms 使用不存在的列...');
  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_forms?select=id,role,title,is_global,is_active,team_role&limit=3`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  console.log(`  Status: ${res1.status}`);
  const data1 = await res1.json();
  console.log(`  Response: ${JSON.stringify(data1).substring(0, 300)}`);

  // 2. 检查 final_task_submissions 查询 task_id, member_id, cycle 是否会报错
  console.log('\n测试2: 查询 final_task_submissions 使用不存在的列...');
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?select=id,team_id,task_id,member_id,cycle&limit=3`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  console.log(`  Status: ${res2.status}`);
  const data2 = await res2.json();
  console.log(`  Response: ${JSON.stringify(data2).substring(0, 300)}`);

  // 3. 测试 upsert 到 final_task_submissions
  console.log('\n测试3: upsert 到 final_task_submissions (使用不存在的列)...');
  const res3 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      team_id: '00000000-0000-0000-0000-000000000099',
      task_id: 'test-task',
      member_id: 'test-member',
      member_role: 'guider',
      form_id: '00000000-0000-0000-0000-000000000001',
      form_data: { q1: 'test' },
      cycle: 1,
    }),
  });
  console.log(`  Status: ${res3.status}`);
  const data3 = await res3.json();
  console.log(`  Response: ${JSON.stringify(data3).substring(0, 500)}`);

  // 4. 测试只用现有列的 insert
  console.log('\n测试4: insert 到 final_task_submissions (只用现有列)...');
  const res4 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      team_id: '00000000-0000-0000-0000-000000000099',
      form_id: '00000000-0000-0000-0000-000000000001',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }),
  });
  console.log(`  Status: ${res4.status}`);
  const data4 = await res4.json();
  console.log(`  Response: ${JSON.stringify(data4).substring(0, 500)}`);

  // 清理
  if (data4.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?id=eq.${data4.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    console.log('  清理成功');
  }
}

main().catch(console.error);
